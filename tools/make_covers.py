#!/usr/bin/env python3
"""
Hurlo cover generator.

Every game deserves a display image. Games that already have a real cover
(downloaded by fetch_covers.py) are left alone; the rest get a deterministic,
storm-themed cover rendered here: deep sky gradient, star specks, a hurricane
spiral motif, and the game's initials — 400x250 (16:10), saved to
assets/covers/<libId>/<gameId>.png where build_catalog.py picks them up.

Deterministic per game: the same game always renders the same art.
Run after build_catalog/fetch_covers:
  python tools/make_covers.py
"""

from __future__ import annotations

import colorsys
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "catalog.js"
OUT = ROOT / "assets" / "covers"
W, H = 400, 250

FONT_CANDIDATES = [
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
]


def load_catalog() -> dict:
    text = CATALOG.read_text(encoding="utf-8")
    return json.loads(text.split("=", 1)[1].strip().rstrip(";"))


def rng(seed: int):
    """Tiny deterministic PRNG (xorshift-ish) -> callable returning 0..1."""
    state = seed & 0xFFFFFFFF

    def nxt():
        nonlocal state
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        return state / 0xFFFFFFFF

    return nxt


def initials(title: str) -> str:
    words = [w for w in re.split(r"\s+", title.strip()) if w]
    if not words:
        return "?"
    if len(words) == 1:
        return words[0][:2].upper()
    return (words[0][0] + words[-1][0]).upper()


def hsl(h, s, l) -> tuple:
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, l, s)
    return (int(r * 255), int(g * 255), int(b * 255))


def render(gid: str, title: str) -> Image.Image:
    seed = abs(hash(gid))
    rnd = rng(seed)
    hue = rnd() * 360
    pattern = int(rnd() * 4)

    img = Image.new("RGB", (W, H))
    px = img.load()

    # --- sky gradient (deep, hue-tinted) ---
    top = hsl(hue, 0.42, 0.10 + rnd() * 0.03)
    bottom = hsl(hue + 20, 0.45, 0.035)
    grad = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        grad.putpixel((0, y), tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    img.paste(grad.resize((W, H)))

    d = ImageDraw.Draw(img, "RGBA")

    # --- star specks ---
    for _ in range(int(40 + rnd() * 40)):
        x, y = rnd() * W, rnd() * H * 0.75
        r = 0.4 + rnd() * 1.1
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, int(18 + rnd() * 55)))

    # --- hurricane motif ---
    cx, cy = W * (0.66 + rnd() * 0.16), H * (0.34 + rnd() * 0.14)
    arm_color = hsl(hue + 14, 0.65, 0.72)
    arms = 2 + int(rnd() * 2)
    turns = 2.1 + rnd() * 0.9

    for arm in range(arms):
        phase = arm * (2 * math.pi / arms)
        pts = []
        for i in range(90):
            t = i / 89
            theta = phase + t * turns * 2 * math.pi
            r = 6 + t * t * (86 + rnd() * 6)
            pts.append((cx + math.cos(theta) * r, cy + math.sin(theta) * r * 0.86))
        width = 2 if pattern != 1 else 3
        alpha = 70 if pattern != 1 else 95
        d.line(pts, fill=arm_color + (alpha,), width=width, joint="curve")

    # eye glow
    for rr, a in ((30, 26), (18, 44), (8, 90)):
        d.ellipse([cx - rr, cy - rr * 0.9, cx + rr, cy + rr * 0.9], fill=arm_color + (a,))

    if pattern == 2:  # extra: faint scan grid
        for gx in range(0, W, 26):
            d.line([(gx, 0), (gx, H)], fill=(255, 255, 255, 7), width=1)
        for gy in range(0, H, 26):
            d.line([(0, gy), (W, gy)], fill=(255, 255, 255, 7), width=1)
    elif pattern == 3:  # extra: distant horizon band
        hy = H * (0.72 + rnd() * 0.08)
        d.polygon([(0, H), (0, hy), (W * 0.22, hy - 14), (W * 0.45, hy + 8),
                   (W * 0.72, hy - 20), (W, hy + 4), (W, H)], fill=(0, 0, 0, 90))

    # --- initials ---
    text = initials(title)
    font = None
    size = 64
    for path in FONT_CANDIDATES:
        try:
            font = ImageFont.truetype(path, size)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()

    tmp = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    box = tmp.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    tx, ty = 26, H - th - 34
    d.text((tx + 2, ty + 2), text, font=font, fill=(0, 0, 0, 130))
    d.text((tx, ty), text, font=font, fill=hsl(hue + 10, 0.7, 0.9))

    # --- vignette (darken corners) ---
    vig = Image.new("L", (W, H), 0)
    dv = ImageDraw.Draw(vig)
    dv.ellipse([-W * 0.35, -H * 0.55, W * 1.35, H * 1.55], fill=90)
    vig = vig.filter(ImageFilter.GaussianBlur(28))
    black = Image.new("RGB", (W, H), (0, 0, 0))
    img = Image.composite(img, black, vig.point(lambda v: 255 - int(v * 0.55)))

    return img


def main() -> int:
    if not CATALOG.is_file():
        print("catalog.js not found — run build_catalog.py first.", file=sys.stderr)
        return 1
    catalog = load_catalog()
    made = skipped = 0
    for lib in catalog["libraries"]:
        for g in lib["games"]:
            dest_dir = OUT / lib["id"]
            existing = list(dest_dir.glob(g["id"] + ".*")) if dest_dir.is_dir() else []
            if existing:
                skipped += 1
                continue
            dest_dir.mkdir(parents=True, exist_ok=True)
            render(g["id"], g["title"]).save(dest_dir / f"{g['id']}.png", optimize=True)
            made += 1
    print(f"Covers: {made} generated, {skipped} already had one.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
