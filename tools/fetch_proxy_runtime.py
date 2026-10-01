#!/usr/bin/env python3
"""Fetch the proxy runtime packages (pinned in arsenic's package-lock.json)
and extract them into the Hurlo web root at the paths the client expects:
  /uv/  /scram/  /controller/  /baremux/  /epoxy/  /libcurl/  /epoxy3/  /libcurl2/
"""
import json
import re
import shutil
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCK = Path(r"C:\Users\Tate\Downloads\arsenic-2\arsenic-2\package-lock.json")
OUT = ROOT

WANT = [
    "@titaniumnetwork-dev/ultraviolet",
    "@mercuryworkshop/scramjet",
    "@mercuryworkshop/scramjet-controller",
    "@mercuryworkshop/bare-mux",
    "@mercuryworkshop/epoxy-transport",
    "@mercuryworkshop/libcurl-transport",
    "@mercuryworkshop/epoxy-transport-3",
    "@mercuryworkshop/libcurl-transport-2",
    "@mercuryworkshop/wisp-js",
]

UA = {"User-Agent": "hurlo-proxy-setup/1.0"}


def load_lock():
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    pkgs = lock.get("packages", {})
    out = {}
    for key, meta in pkgs.items():
        if not key.startswith("node_modules/"):
            continue
        name = key[len("node_modules/"):]
        # aliases install under their requested name with the real package in "resolved"
        out[name] = meta
    return out


def fetch(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(65536)
            if not chunk:
                break
            f.write(chunk)


def main():
    pkgs = load_lock()
    missing = [w for w in WANT if w not in pkgs]
    if missing:
        print("missing from lockfile:", missing)
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="hurlo-proxy-"))
    copied = []

    for name in WANT:
        meta = pkgs[name]
        url = meta["resolved"]
        version = meta.get("version", "?")
        tgz = tmp / (re.sub(r"[^A-Za-z0-9_.-]+", "_", name) + ".tgz")
        if not tgz.exists() or tgz.stat().st_size == 0:
            print(f"  fetching {name}@{version} ...")
            fetch(url, tgz)

        pkg_dir = tmp / name.replace("/", "_")
        with tarfile.open(tgz, "r:gz") as t:
            # zip-slip guard
            for member in t.getnames():
                if member.startswith(("/", "..")) or ":" in member.split("/")[0]:
                    raise RuntimeError("unsafe tarball entry: " + member)
            t.extractall(pkg_dir, filter="data")

        src = pkg_dir / "package"
        # map package -> destination folder in the web root
        dest_map = {
            "@titaniumnetwork-dev/ultraviolet": "vendor/uv",
            "@mercuryworkshop/scramjet": "vendor/scram",
            "@mercuryworkshop/scramjet-controller": "vendor/controller",
            "@mercuryworkshop/bare-mux": "vendor/baremux",
            "@mercuryworkshop/epoxy-transport": "vendor/epoxy",
            "@mercuryworkshop/libcurl-transport": "vendor/libcurl",
            "@mercuryworkshop/epoxy-transport-3": "vendor/epoxy3",
            "@mercuryworkshop/libcurl-transport-2": "vendor/libcurl2",
        }
        if name == "@mercuryworkshop/wisp-js":
            continue  # protocol reference only, handled separately

        dest_name = dest_map[name]

        # find the runtime files inside the package (verified layouts)
        if name == "@titaniumnetwork-dev/ultraviolet":
            files = [f for f in (src / "dist").glob("uv.*.js") if not f.name.endswith(".map")]
            # the attached repo ships its own customized uv.config.js at the root;
            # uv.sw.js (the package's SW module) is imported by that root wrapper
            files = [f for f in files if f.name != "uv.config.js"]
        elif name == "@mercuryworkshop/scramjet":
            files = [f for f in (src / "dist").iterdir() if f.name in ("scramjet.js", "scramjet.wasm")]
        elif name == "@mercuryworkshop/bare-mux":
            files = [src / "dist" / "worker.js", src / "dist" / "index.mjs"]
        elif name in ("@mercuryworkshop/epoxy-transport", "@mercuryworkshop/epoxy-transport-3",
                      "@mercuryworkshop/libcurl-transport", "@mercuryworkshop/libcurl-transport-2"):
            # these packages ship an index.mjs at dist/ or package root; find it
            cands = list(src.rglob("index.mjs"))
            src_dir = None
            files = cands
        elif name == "@mercuryworkshop/scramjet-controller":
            src_dir = src
            files = [f for f in src.rglob("*") if f.is_file() and f.suffix in (".js", ".mjs") and "inject" in f.name or f.name.startswith("controller.")]
        else:
            src_dir = src
            files = list(src.glob("*"))

        dest = OUT / dest_name
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)

        if name in ("@mercuryworkshop/epoxy-transport", "@mercuryworkshop/epoxy-transport-3",
                    "@mercuryworkshop/libcurl-transport", "@mercuryworkshop/libcurl-transport-2"):
            # copy the whole containing folder of the chosen index.mjs
            chosen = None
            for c in files:
                if c.name == "index.mjs" and "node_modules" not in str(c):
                    chosen = c.parent
                    break
            if chosen is None and files:
                chosen = files[0].parent
            if chosen is None:
                print(f"  !! no index.mjs found for {name}")
                continue
            for f in chosen.iterdir():
                if f.is_file():
                    shutil.copy2(f, dest / f.name)
        elif name == "@mercuryworkshop/scramjet-controller":
            for f in (src / "dist").glob("controller.*.js"):
                if not f.name.endswith(".map"):
                    shutil.copy2(f, dest / f.name)
        else:
            for f in files:
                if f.is_file():
                    shutil.copy2(f, dest / f.name)

        n = len(list(dest.iterdir()))
        copied.append(f"/{dest_name}/ <- {name}@{version} ({n} files)")

    for line in copied:
        print(" ", line)
    print("done ->", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
