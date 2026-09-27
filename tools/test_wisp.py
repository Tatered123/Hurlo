#!/usr/bin/env python3
"""Test the wisp relay: CONNECT to example.com:80, send an HTTP request, read it back."""
import base64
import hashlib
import os
import socket
import struct
import sys

HOST, PORT = "127.0.0.1", 8123
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def ws_connect():
    s = socket.create_connection((HOST, PORT), timeout=15)
    key = base64.b64encode(os.urandom(16)).decode()
    req = (f"GET /wisp/ HTTP/1.1\r\nHost: {HOST}:{PORT}\r\n"
           f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
           f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
    s.sendall(req.encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        buf += s.recv(4096)
    head, rest = buf.split(b"\r\n\r\n", 1)
    expect = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    assert expect in head.decode(), "bad handshake: " + head.decode(errors="replace")
    return s, rest


def recv_exact(s, n, buf):
    while len(buf[0]) < n:
        chunk = s.recv(4096)
        if not chunk:
            raise ConnectionError("closed")
        buf[0] += chunk
    out, buf[0] = buf[0][:n], buf[0][n:]
    return out


def read_frame(s, buf):
    b1, b2 = recv_exact(s, 2, buf)[0:2]
    opcode = b1 & 0x0F
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack(">H", recv_exact(s, 2, buf))[0]
    elif length == 127:
        length = struct.unpack(">Q", recv_exact(s, 8, buf))[0]
    payload = recv_exact(s, length, buf) if length else b""
    return opcode, payload


def send_frame(s, opcode, payload):
    mask = os.urandom(4)
    header = bytes([0x80 | opcode])
    n = len(payload)
    if n < 126:
        header += bytes([0x80 | n])
    elif n < 65536:
        header += bytes([0x80 | 126]) + struct.pack(">H", n)
    else:
        header += bytes([0x80 | 127]) + struct.pack(">Q", n)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    s.sendall(header + mask + masked)


def packet(ptype, sid, payload=b""):
    return bytes([ptype]) + struct.pack("<I", sid) + payload


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "example.com"
    host, _, port_s = target.partition(":")
    port = int(port_s) if port_s else 80
    s, rest = ws_connect()
    buf = [rest]

    send_frame(s, 0x2, packet(1, 1, bytes([1]) + struct.pack("<H", port) + host.encode()))
    print(f"-> CONNECT {host}:{port}")

    http_req = ("GET / HTTP/1.0\r\n" + f"Host: {host}\r\n" + "User-Agent: wisp-test\r\n\r\n").encode()
    got_continue = False
    granted_down = False
    sent = False
    body = b""
    s.settimeout(10)
    try:
        while True:
            op, payload = read_frame(s, buf)
            ptype = payload[0] if payload else 0
            if ptype == 3:  # CONTINUE from server: upstream window granted
                n = struct.unpack("<I", payload[5:9])[0] if len(payload) >= 9 else -1
                print("<- CONTINUE", n)
                got_continue = True
                if not granted_down:
                    send_frame(s, 0x2, packet(3, 1, struct.pack("<I", 65536)))
                    granted_down = True
                if got_continue and granted_down and not sent:
                    send_frame(s, 0x2, packet(2, 1, http_req))
                    print("-> DATA (http request)")
                    sent = True
            elif ptype == 2:  # DATA
                body += payload[5:]
                if b"</html>" in body or len(body) > 50000:
                    break
            elif ptype == 4:  # CLOSE
                print("<- CLOSE reason", payload[5] if len(payload) > 5 else "?")
                break
    except socket.timeout:
        pass
    text = body.decode("utf-8", "replace")
    ok = "HTTP/1" in text or "200" in text[:40]
    print("bytes:", len(body), "| looks like HTTP:", ok)
    print(text[:300])
    s.close()
    return 0 if (got_continue and body) else 1


if __name__ == "__main__":
    sys.exit(main())
