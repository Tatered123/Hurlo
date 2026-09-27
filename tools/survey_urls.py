#!/usr/bin/env python3
"""One-off: survey URL patterns inside title-less gn-math games."""
import re
import sys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
s = (ROOT / "data" / "catalog.js").read_text(encoding="utf-8")
d = json.loads(s.split("=", 1)[1].strip().rstrip(";"))
no_title = [g for g in d["libraries"][0]["games"] if re.match(r"^Game \d+$", g["title"])]

URL = re.compile(r"https?://[^\s\"'<>\\]{10,160}")
IFRAME = re.compile(r"<iframe[^>]+src=['\"]([^'\"]+)['\"]", re.I)
SRC = re.compile(r"(?:src|href|data|value)\s*=\s*['\"]([^'\"]+)['\"]", re.I)

names = sys.argv[1:] or ["58.html", "63.html", "104.html", "119.html", "168.html"]
base_dir = ROOT / "projects" / "gn-math" / "singlefile"
for name in names:
    data = (base_dir / name).read_bytes()
    text = data.decode("utf-8", "replace")
    print("===", name, len(data), "bytes")
    seen = []
    for m in URL.finditer(text):
        u = m.group(0)
        if u not in seen:
            seen.append(u)
    for u in seen[:10]:
        print("   URL:", u)
    for m in IFRAME.finditer(text):
        print("   IFRAME:", m.group(1)[:130])
    if not seen:
        for m in SRC.finditer(text):
            v = m.group(1)
            if not v.startswith(("#", "data:")):
                print("   ATTR:", v[:130])
