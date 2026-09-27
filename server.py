#!/usr/bin/env python3
"""
Hurlo server — static hosting + wisp WebSocket relay for the proxy engines.

Replaces `python -m http.server`. Serves the site root with cross-origin
isolation headers, and upgrades WebSocket connections on /wisp/ to the wisp
protocol (5-byte packet header: type u8 + stream id u32 LE; CONNECT=1,
DATA=2, CONTINUE=3, CLOSE=4), which is what Ultraviolet (via bare-mux +
epoxy/libcurl) and Scramjet v2 (via its controller's transports) use to move
proxied traffic.

Run:  python server.py [port]      (default 8123)
"""
import base64
import hashlib
import socket
import socketserver
import struct
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".swf": "application/x-shockwave-flash",
}


def guess(path: Path) -> str:
    return MIME.get(path.suffix.lower(), "application/octet-stream")


# ---------------------------------------------------------------------------
# wisp relay
# ---------------------------------------------------------------------------

P_CONNECT, P_DATA, P_CONTINUE, P_CLOSE = 1, 2, 3, 4
STREAM_TCP, STREAM_UDP = 1, 2
CHUNK = 16384


class WispWebSocket:
    """Minimal RFC6455 server side of one WebSocket connection."""

    def __init__(self, conn: socket.socket):
        self.conn = conn
        self.send_lock = threading.Lock()
        self.open = True

    def _recv_exact(self, n):
        buf = b""
        while len(buf) < n:
            chunk = self.conn.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("socket closed mid-frame")
            buf += chunk
        return buf

    def _read_frame_body(self):
        b1, b2 = self._recv_exact(2)
        fin = bool(b1 & 0x80)
        opcode = b1 & 0x0F
        masked = bool(b2 & 0x80)
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack(">H", self._recv_exact(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self._recv_exact(8))[0]
        mask = self._recv_exact(4) if masked else None
        payload = self._recv_exact(length) if length else b""
        if mask:
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        return fin, opcode, payload

    def read_message(self):
        """Returns (opcode, payload) of the next complete message.
        Raises ConnectionError when the peer closes."""
        while True:
            fin, opcode, payload = self._read_frame_body()
            if opcode == 0x8:  # close
                try:
                    self.send_frame(0x8, payload[:2])
                except OSError:
                    pass
                self.open = False
                raise ConnectionError("peer closed websocket")
            if opcode == 0x9:  # ping -> pong
                self.send_frame(0xA, payload)
                continue
            if opcode == 0xA:  # pong
                continue
            if fin:
                return opcode, payload
            # fragmentation: accumulate continuation frames
            buf = bytearray(payload)
            while not fin:
                fin, opcode, payload = self._read_frame_body()
                if opcode == 0x8:
                    self.open = False
                    raise ConnectionError("peer closed websocket mid-message")
                buf.extend(payload)
            return 0x2, bytes(buf)

    def send_frame(self, opcode, payload=b""):
        with self.send_lock:
            header = bytes([0x80 | opcode])
            n = len(payload)
            if n < 126:
                header += bytes([n])
            elif n < 65536:
                header += bytes([126]) + struct.pack(">H", n)
            else:
                header += bytes([127]) + struct.pack(">Q", n)
            self.conn.sendall(header + payload)

    def send_packet(self, stream_id, ptype, payload=b""):
        header = bytes([ptype]) + struct.pack("<I", stream_id)
        self.send_frame(0x2, header + payload)


class WispStream:
    """One proxied TCP connection, keyed by its wisp stream id.

    wisp v2 flow: server->client DATA is pushed freely; client->server data
    is windowed by the CONTINUE grants we send back as we consume it.
    """

    def __init__(self, ws, stream_id, sock, host, port):
        self.ws = ws
        self.id = stream_id
        self.sock = sock
        self.host = host
        self.port = port
        self.lock = threading.Lock()
        self.closed = False
        print(f"[wisp] stream {stream_id}: connected {host}:{port}", flush=True)

    def send_packet(self, ptype, payload=b""):
        self.ws.send_packet(self.id, ptype, payload)

    def grant(self, n=CHUNK):
        self.send_packet(P_CONTINUE, struct.pack("<I", n))

    def close(self, reason):
        if self.closed:
            return
        self.closed = True
        try:
            self.send_packet(P_CLOSE, bytes([reason]))
        except OSError:
            pass
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass

    def pump_to_client(self):
        while not self.closed:
            try:
                data = self.sock.recv(CHUNK)
            except OSError as e:
                if not self.closed:
                    print(f"[wisp] stream {self.id}: target read failed: {e!r}", flush=True)
                break
            if not data:
                break
            self.send_packet(P_DATA, data)
        self.close(2)


class WispConnection:
    """One WebSocket connection carrying many multiplexed wisp streams."""

    def __init__(self, ws):
        self.ws = ws
        self.streams = {}

    def send_packet(self, stream_id, ptype, payload=b""):
        self.ws.send_packet(stream_id, ptype, payload)

    def handle_packet(self, ptype, stream_id, payload):
        if ptype == P_CONNECT:
            self.handle_connect(stream_id, payload)
        elif ptype == P_DATA:
            st = self.streams.get(stream_id)
            if st and not st.closed:
                try:
                    st.sock.sendall(payload)
                    st.grant(len(payload))
                except OSError as e:
                    print(f"[wisp] stream {stream_id}: target write failed: {e!r}", flush=True)
                    st.close(3)
        elif ptype == P_CONTINUE:
            pass  # v2: downstream is pushed freely; no refill needed
        elif ptype == P_CLOSE:
            st = self.streams.pop(stream_id, None)
            if st:
                st.closed = True
                try:
                    st.sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass

    def handle_connect(self, stream_id, payload):
        try:
            stream_type = payload[0]
            port = int.from_bytes(payload[1:3], "little")
            host = payload[3:].decode("utf-8", "replace").strip()
        except Exception:
            self.send_packet(stream_id, P_CLOSE, bytes([1]))
            return

        if stream_type != STREAM_TCP:
            # UDP relay isn't implemented; transports fall back on their own
            self.send_packet(stream_id, P_CLOSE, bytes([3]))
            return

        host = host.strip("[]")
        try:
            sock = socket.create_connection((host, port), timeout=15)
            sock.settimeout(None)
        except OSError:
            print(f"[wisp] stream {stream_id}: cannot reach {host}:{port}", flush=True)
            self.send_packet(stream_id, P_CLOSE, bytes([66]))
            return

        st = WispStream(self, stream_id, sock, host, port)
        self.streams[stream_id] = st
        st.grant(CHUNK)

        t = threading.Thread(target=self._pump_safe, args=(st,), daemon=True)
        t.start()

    def _pump_safe(self, st):
        try:
            st.pump_to_client()
        finally:
            self.streams.pop(st.id, None)

    def close_all(self):
        for st in list(self.streams.values()):
            st.close(2)
        self.streams.clear()


def serve_wisp(handler):
    """Complete the WebSocket upgrade on /wisp/ and run the relay loop."""
    key = handler.headers.get("Sec-WebSocket-Key", "")
    accept = base64.b64encode(
        hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()
    ).decode()
    proto = handler.headers.get("Sec-WebSocket-Protocol", "").split(",")[0].strip()
    proto_line = f"Sec-WebSocket-Protocol: {proto}\r\n" if proto else ""
    handler.wfile.write(
        b"HTTP/1.1 101 Switching Protocols\r\n"
        b"Upgrade: websocket\r\n"
        b"Connection: Upgrade\r\n"
        b"Sec-WebSocket-Accept: " + accept.encode() + b"\r\n" +
        proto_line.encode() + b"\r\n"
    )
    handler.wfile.flush()

    ws = WispWebSocket(handler.connection)
    conn = WispConnection(ws)
    # wisp servers open with a CONTINUE grant on stream 0 (mirrors wisp-js)
    ws.send_packet(0, P_CONTINUE, struct.pack("<I", CHUNK))

    try:
        while ws.open:
            opcode, payload = ws.read_message()
            if opcode != 0x2 or len(payload) < 5:
                continue
            ptype = payload[0]
            stream_id = int.from_bytes(payload[1:5], "little")
            conn.handle_packet(ptype, stream_id, payload[5:])
    except (ConnectionError, OSError):
        pass
    finally:
        conn.close_all()
        handler.close_connection = True


# ---------------------------------------------------------------------------
# Static HTTP
# ---------------------------------------------------------------------------

class HurloHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "Hurlo/1.0"

    def log_message(self, fmt, *args):
        pass

    def _headers(self, code=200, ctype="text/html; charset=utf-8", length=None, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        # NOTE: COOP/COEP deliberately omitted. Cross-origin isolation would
        # enable Scramjet's sync-XHR (SharedArrayBuffer) nicety, but it also
        # makes Chrome block every SW-served iframe that doesn't carry the
        # headers itself — a white frame on every proxied page. Regular
        # browsing works fine without them.
        self.send_header("Cache-Control", "no-cache")
        if length is not None:
            self.send_header("Content-Length", str(length))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path.rstrip("/") == "/wisp":
            self._headers(426, "text/plain", 0)
            return

        if path == "/":
            path = "/index.html"
        target = (ROOT / unquote(path).lstrip("/")).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            self._headers(403, "text/plain", 0)
            return
        if not target.is_file():
            if not Path(target).suffix:
                target = ROOT / "index.html"  # SPA fallback
            if not target.is_file():
                self._headers(404, "text/plain", 0)
                return

        size = target.stat().st_size
        extra = {}
        p = target.as_posix()
        if any(seg in p for seg in ("/uv/", "/scram/", "/controller/", "/baremux/", "/epoxy", "/libcurl")):
            extra["Cache-Control"] = "public, max-age=31536000, immutable"
        self._headers(200, guess(target), size, extra)

        if self.command == "HEAD":
            return
        with open(target, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (ConnectionAbortedError, BrokenPipeError):
                    return

    do_HEAD = do_GET

    def do_POST(self):
        self._headers(405, "text/plain", 0)


# ---------------------------------------------------------------------------
# WebSocket upgrade interception: http.server's parse_request returns False
# to mean "handled"; we hook it so /wisp/ upgrades never hit the GET handler.
# ---------------------------------------------------------------------------

_orig_parse = BaseHTTPRequestHandler.parse_request


def _patched_parse(self):
    ok = _orig_parse(self)
    if ok and self.command == "GET" \
            and self.path.rstrip("/").endswith("/wisp") \
            and "websocket" in (self.headers.get("Upgrade") or "").lower():
        serve_wisp(self)
        self.close_connection = True
        return False
    return ok


BaseHTTPRequestHandler.parse_request = _patched_parse


def main():
    socketserver.ThreadingMixIn.daemon_threads = True
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), HurloHandler)
    print(f"Hurlo serving {ROOT}", flush=True)
    print(f"  http://127.0.0.1:{PORT}  (static + cross-origin isolation)", flush=True)
    print(f"  ws://127.0.0.1:{PORT}/wisp/  (proxy relay)", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
