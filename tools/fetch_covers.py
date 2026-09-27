#!/usr/bin/env python3
"""
Hurlo cover harvester.

Finds real display images for as many games as possible and stores them under
assets/covers/<libId>/<gameId>.<ext>, where tools/build_catalog.py picks them up.

Strategy per game:
  1. Read the game's HTML and extract its <base href="..."> (most of these
     games load assets from a CDN folder — the same folder usually holds
     cover.png / icon180.png / icon32.png).
  2. No base href? For numeric file names (104.html -> "104") guess the
     gn-math assets CDN folder for that id.
  3. Try cover.png, then icon180.png / icon32.png / thumb.png; save the first
     real image (verified by magic bytes, so jsdelivr 404 pages never count).

Already-harvested games are skipped, so the script is resumable:
  python tools/fetch_covers.py
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "catalog.js"
OUT = ROOT / "assets" / "covers"

MAGIC = (b"\x89PNG\r\n", b"\xff\xd8\xff", b"RIFF")  # png, jpeg, webp
EXT_BY_MAGIC = {b"\x89PNG\r\n": ".png", b"\xff\xd8\xff": ".jpg", b"RIFF": ".webp"}
CANDIDATE_NAMES = ("cover.png", "cover.jpg", "icon180.png", "icon32.png", "thumb.png", "icon.png")
TIMEOUT = 10

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HurloCoverHarvester/1.0"}


def load_catalog() -> dict:
    text = CATALOG.read_text(encoding="utf-8")
    payload = text[text.index("=") + 1:].strip().rstrip(";")
    return json.loads(payload)


def base_href(entry_rel: str) -> str | None:
    p = ROOT / entry_rel
    try:
        head = p.read_bytes()[:60000].decode("utf-8", "replace")
    except OSError:
        return None
    m = re.search(r'<base[^>]+href=["\']([^"\']+)["\']', head, re.IGNORECASE)
    return m.group(1) if m else None


def guess_numeric(entry_rel: str) -> str | None:
    stem = Path(entry_rel).stem
    m = re.fullmatch(r"(\d+)(?:[-_].*)?", stem)
    if m:
        return f"https://cdn.jsdelivr.net/gh/gn-math/assets@main/{m.group(1)}/"
    return None


def looks_like_image(data: bytes) -> str | None:
    for magic, ext in EXT_BY_MAGIC.items():
        if data[:len(magic)] == magic:
            return ext
    return None


def fetch(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            if r.status != 200:
                return None
            return r.read(3_000_000)
    except Exception:
        return None


def harvest(task) -> tuple[str, str]:
    lib_id, gid, entry_rel, local_src = task
    dest_dir = OUT / lib_id
    existing = [p for p in dest_dir.glob(gid + ".*")] if dest_dir.is_dir() else []
    if existing:
        return (gid, "cached")

    if local_src and local_src.is_file():  # local cover already shipped with the game
        ext = local_src.suffix.lower()
        if ext in (".png", ".jpg", ".jpeg", ".webp"):
            dest_dir.mkdir(parents=True, exist_ok=True)
            (dest_dir / f"{gid}{ext}").write_bytes(local_src.read_bytes())
            return (gid, "local")

    bases = []
    b = base_href(entry_rel)
    if b:
        bases.append(b if b.endswith("/") else b + "/")
    g = guess_numeric(entry_rel)
    if g:
        bases.append(g)

    for base in bases:
        for name in CANDIDATE_NAMES:
            data = fetch(base + name)
            if not data:
                continue
            ext = looks_like_image(data)
            if not ext:
                continue
            dest_dir.mkdir(parents=True, exist_ok=True)
            (dest_dir / f"{gid}{ext}").write_bytes(data)
            return (gid, "downloaded")
    return (gid, "missed")


def main() -> int:
    if not CATALOG.is_file():
        print("catalog.js not found — run build_catalog.py first.", file=sys.stderr)
        return 1
    catalog = load_catalog()

    tasks = []
    for lib in catalog["libraries"]:
        lib_id = lib["id"]
        for g in lib["games"]:
            local_src = None
            if g["source"] == "else":
                cand = ROOT / g["entry"].split("/else/")[0] / "else" / Path(g["entry"]).parent.name / "cover.png"
                if "assets-main" in g["entry"]:
                    cand = ROOT / Path(g["entry"]).parent / "cover.png"
                if cand.is_file():
                    local_src = cand
            tasks.append((lib_id, g["id"], g["entry"], local_src))

    print(f"Harvesting covers for {len(tasks)} games (resumable)...")
    counts = {"cached": 0, "local": 0, "downloaded": 0, "missed": 0}
    done = 0
    with ThreadPoolExecutor(max_workers=32) as pool:
        futures = [pool.submit(harvest, t) for t in tasks]
        for fut in as_completed(futures):
            gid, result = fut.result()
            counts[result] += 1
            done += 1
            if done % 100 == 0:
                print(f"  {done}/{len(tasks)} ...")
    print(f"Done: {counts['downloaded']} downloaded, {counts['local']} local, "
          f"{counts['cached']} cached, {counts['missed']} without a findable cover.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
