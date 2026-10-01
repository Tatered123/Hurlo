#!/usr/bin/env python3
"""
Hurlo catalog builder (v3).

Scans projects/ for game libraries and emits data/catalog.js — a plain
<script> that sets window.HURLO_CATALOG (works over file:// too, no fetch).

Library layouts understood
--------------------------
1. gn-math style (two parallel buckets):
     projects/<lib>/singlefile/*.html          -> one game per loose file
     projects/<lib>/else/**                    -> any directory that directly
        contains .html files is a game (recursion stops there, so asset
        folders are never mistaken for games)
   These libraries have no categories; the Games page lists their games flat.

2. UGS style (category buckets):
     projects/<lib>/html5-games/**             -> category "html5-games"
     projects/<lib>/flash/**                   -> category "flash"
     projects/<lib>/emulated/<system>/**       -> category "emulated",
        one system per folder (nes, snes, gba, ...)
   Folder flattening: any directory that directly contains .html files is a
   game, so "html5-games/CoolGame/index.html" shows as the game "CoolGame",
   never as a folder.

Covers
------
Covers live in assets/covers/<libId>/<gameId>.{png,jpg,jpeg,webp}.
Use tools/fetch_covers.py to harvest them from each game's CDN base href.
Games without a cover fall back to a generated tile in the UI.

Re-run after adding/removing games or libraries:
  python tools/build_catalog.py
"""

from __future__ import annotations

import html as html_mod
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECTS_DIR = ROOT / "projects"
OUT_FILE = ROOT / "data" / "catalog.js"
COVERS_DIR = ROOT / "assets" / "covers"

SKIP_DIRS = {"node_modules", "__pycache__", ".git", ".github", ".vscode", ".idea", "misc"}

# Titles that name a runtime rather than a game ("Ruffle Player", "Games", …).
# They are still used as names when they are all the file offers, but for
# game directories a swfs.json game name takes priority over them.
GENERIC_TITLES = {
    "", "games", "game", "untitled", "ruffle player", "unity webgl player",
    "unity web player", "html5 game", "play", "play!.js", "index", "new tab",
    "clickteam fusion developer 2.5+ html5 runtime",
}

TITLE_PREFIXES = ("unity webgl player | ", "unity web player | ", "unity webgl player:", "unity web player:")
TITLE_SUFFIXES = (" - web", " | web", " web version")

LIBRARY_NAMES = {
    "gn-math": "Gn-Math",
    "ugs": "UGS",
    "favorites": "Favorites",
}


def read_head(path: Path, size: int = 2_000_000) -> str:
    try:
        return path.read_bytes()[:size].decode("utf-8", "replace")
    except OSError:
        return ""


def read_title(path: Path) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", read_head(path), re.IGNORECASE | re.DOTALL)
    return html_mod.unescape(m.group(1)) if m else ""


def clean_title(raw: str) -> str:
    t = re.sub(r"\s+", " ", raw.strip())
    low = t.lower()
    for prefix in TITLE_PREFIXES:
        if low.startswith(prefix):
            t, low = t[len(prefix):].strip(), t[len(prefix):].strip().lower()
    for suffix in TITLE_SUFFIXES:
        if low.endswith(suffix):
            t, low = t[: -len(suffix)].strip(), t[: -len(suffix)].strip().lower()
    # broken template builds are not real titles
    if "${" in t:
        return ""
    t = t[:70].strip()
    return "" if len(t) < 3 else t


def prettify_name(stem: str) -> str:
    m = re.fullmatch(r"(\d+)(?:[-_ ].*)?", stem)
    if m:
        return f"Game {m.group(1)}"
    out = re.sub(r"[-_]+", " ", stem).strip()[:70]
    return out[:1].upper() + out[1:] if out else out or "Untitled"


def swf_fallback_title(game_dir: Path) -> str:
    """Ruffle wrappers keep real names in swfs.json."""
    swfs_file = game_dir / "swfs.json"
    if not swfs_file.is_file():
        return ""
    try:
        data = json.loads(swfs_file.read_text(encoding="utf-8", errors="replace"))
        entries = data.get("swfs", []) if isinstance(data, dict) else data
        titles = [e.get("title", "") for e in entries
                  if isinstance(e, dict) and not re.search(r"logo|ruffle", e.get("title", ""), re.I)]
        return titles[0] if len(titles) == 1 else ""
    except (json.JSONDecodeError, OSError):
        return ""


# ---------------------------------------------------------------------------
# Name mining: dig a real game name out of the CDN URLs a title-less file
# loads its content from. E.g. a <base href=".../google-class@abc123/stickman-hook/">
# means the game is "Stickman Hook"; an <embed src=".../games/Bloons_Tower_Defense_2.swf">
# means "Bloons Tower Defense 2". Engine paths (ruffle.js, Build/, TemplateData/)
# are recognized and rejected.
# ---------------------------------------------------------------------------

URL_RX = re.compile(r"https?://[^\s\"<>\\]{10,300}")
BASE_RX = re.compile(r"<base[^>]+href=[\"']([^\"']+)[\"']", re.IGNORECASE)
GH_PATH_RX = re.compile(r"/(?:gh|raw\.githubusercontent|sourceforge)/([^/\s]+)/([^/@\s]+)(?:@([^/\s]+))?(/[^\s]*)?")
SWF_BAD = re.compile(r"(ruffle|preloader|loader|logo|player|engine|test|sample|demo|splash|banner)", re.I)

ENGINE_WORDS = {
    "ruffle", "rufflejs", "emulator", "emu", "dosbox", "dosboxx", "unity", "unitywebgl",
    "unityloader", "unityprogress", "unityweb", "godot", "construct", "flash", "flashplayer",
    "swf", "swfs", "html5", "js", "css", "json", "data", "wasm", "build", "builds", "dist",
    "src", "static", "cdn", "www", "play", "player", "players", "games", "game", "assets",
    "asset", "img", "images", "image", "media", "rom", "roms", "templates", "template",
    "test", "tests", "demo", "samples", "sample", "misc", "shared", "partners", "files",
    "file", "romfile", "web", "online", "version", "release", "latest", "main", "master",
    "index", "app", "apps", "style", "styles", "css2", "unblocked", "content", "frame",
}
GENERIC_REPOS = {
    "assets", "flashgames", "flash-games", "youtube-playables", "brainrot", "html-games",
    "html-games-v2", "lamar", "interstellar-3", "aaa-fun-world", "collegegrounds",
    "classroomplayv2", "classroomplay", "lightspark", "academicwebsite", "unityexplorer",
    "elitecomposite", "cg-rip", "dosbox", "google-class", "google-doodles", "google",
    "everyday", "1",
}
GENERIC_REPOS_RX = re.compile(
    r"^(google|flash|html|classroom|class|play|swf|ruffle|game|games|assets|emulator|emu|"
    r"unblocked|cdn|static|www|test|demo|site|website|web|my|\d)", re.I)


FIRST_WORD_ALIASES = {"bloonstd": "Bloons TD", "btd": "Bloons TD"}


def humanize_segment(seg: str) -> str:
    """'stickman-hook' -> 'Stickman Hook'; 'Bloons_Tower_Defense_2' -> 'Bloons Tower Defense 2'."""
    import urllib.parse
    seg = urllib.parse.unquote(seg).strip().rstrip("/")
    seg = re.sub(r"[-_+.]+", " ", seg).strip()
    if not seg:
        return ""
    seg = re.sub(r"(?<=[a-z])(\d+)$", r" \1", seg, flags=re.I)          # vex2 -> vex 2
    seg = re.sub(r"(?<=[a-z])(?=\d+[A-Z])", " ", seg, flags=re.I)        # Rider3D -> Rider 3D
    seg = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", seg)                       # SnowRider -> Snow Rider
    words = [w for w in seg.split() if w]
    while words and words[-1].lower() in ("main", "master", "final", "copy"):
        words.pop()
    out = []
    for w in words:
        if w.lower() in ("3d", "2d", "vr"):
            out.append(w.upper())
        elif w.isupper() or any(c.isupper() for c in w):
            out.append(w)
        else:
            out.append(w[:1].upper() + w[1:])
    name = " ".join(out).strip()
    if name:
        first, rest = name.split(" ", 1) if " " in name else (name, "")
        alias = FIRST_WORD_ALIASES.get(first.lower())
        if alias:
            name = alias + ((" " + rest) if rest else "")
    return name[:60] if len(name) >= 3 else ""


def segment_ok(seg: str) -> bool:
    s = seg.strip().strip("/").lower()
    if not s or len(s) < 3 or len(s) > 40:
        return False
    if s.isdigit():
        return False
    if re.fullmatch(r"[0-9a-f]{8,}", s):        # commit hashes
        return False
    if s in ENGINE_WORDS:
        return False
    if s.startswith(("1firebase", "2.7", "1login")):
        return False
    return True


def repo_name(url: str) -> str:
    m = GH_PATH_RX.search(url)
    return m.group(2) if m else ""


def mine_name(text: str) -> str:
    """Best-effort game name mined from the URLs inside a game file."""
    candidates = []  # (priority, name)

    base = BASE_RX.search(text)
    if base:
        m = GH_PATH_RX.search(base.group(1))
        if m and m.group(4):
            last = m.group(4).strip("/").split("/")[-1]
        else:
            # non-github base: last path segment (skip bare domains)
            parts = [p for p in re.split(r"/+", base.group(1).split("://", 1)[-1]) if p]
            last = parts[-1] if len(parts) > 1 else ""
        last = urllib_unquote(last)
        if segment_ok(last) and last.lower() not in GENERIC_REPOS:
            candidates.append((0, humanize_segment(last)))

    # swf payloads — strongest filename signal
    swfs = []
    for m in re.finditer(r"<(?:embed|object)[^>]+(?:src|data)=['\"]([^']+\.swf[^'\"]*)['\"]", text, re.I):
        swfs.append(m.group(1))
    for m in re.finditer(r"<param[^>]+name=['\"](?:movie|src|url)['\"][^>]+value=['\"]([^']+)['\"]", text, re.I):
        swfs.append(m.group(1))
    swfs.extend(URL_RX.findall(text))
    for u in swfs:
        fname = u.rstrip("/?").split("/")[-1].split("?")[0].split("'")[0].rstrip("\"'")
        if not fname.lower().endswith(".swf"):
            continue
        stem = fname[:-4]
        if SWF_BAD.search(stem):
            continue
        name = humanize_segment(stem)
        if name:
            candidates.append((1, name))
            break

    # non-base asset filenames (unity build json, wasm data, game js)
    if not candidates:
        for u in URL_RX.findall(text):
            if not u.lower().startswith(("https://cdn.jsdelivr.net", "https://rawcdn.githack.com",
                                         "https://raw.githubusercontent.com")):
                continue
            if BASE_RX.search(text) and u == base.group(1):
                continue
            fname = u.split("#")[0].split("?")[0].rstrip("/").split("/")[-1]
            stem = re.sub(r"\.(js|json|data|wasm|css|unityweb|assets|png|jpg|html?|xml)$", "", fname, flags=re.I)
            stem = re.sub(r"[-_ ]?(gd|webgl|html5|wasm)[-_\s]?\d*$", "", stem, flags=re.I)
            if not segment_ok(stem) or stem.lower() in ENGINE_WORDS or GENERIC_REPOS_RX.match(stem):
                continue
            name = humanize_segment(stem)
            if name:
                candidates.append((2, name))
                break

    # repo name (only for repos that are named like a game)
    if not candidates:
        for u in URL_RX.findall(text):
            repo = repo_name(u).lower()
            if not repo or repo in GENERIC_REPOS or GENERIC_REPOS_RX.match(repo) or len(repo) < 4:
                continue
            name = humanize_segment(repo)
            if name:
                candidates.append((3, name))
                break

    if not candidates:
        return ""
    candidates.sort(key=lambda c: c[0])
    return candidates[0][1]


def urllib_unquote(s: str) -> str:
    import urllib.parse
    return urllib.parse.unquote(s)


def pick_entry(game_dir: Path, html_files: list[Path]) -> Path:
    names = {f.name.lower(): f for f in html_files}
    if "index.html" in names:
        return names["index.html"]
    dir_html = game_dir / f"{game_dir.name}.html"
    if dir_html in html_files:
        return dir_html
    return sorted(html_files, key=lambda p: p.name.lower())[0]


def collect_games(bucket: Path) -> list[tuple[Path, Path]]:
    """Return [(game_dir_or_None, entry_file)] for a bucket, flattened.

    A directory that directly contains .html files is a game (do not descend
    further); a loose .html file in the bucket itself is a game; anything else
    is recursed into. Loose files do not stop the recursion — subfolders of
    the bucket are still explored.
    """
    found: list[tuple[Path | None, Path]] = []
    stack = [bucket]
    while stack:
        d = stack.pop()
        try:
            entries = sorted(d.iterdir(), key=lambda p: p.name.lower())
        except OSError:
            continue
        html_files = [e for e in entries if e.is_file() and e.suffix.lower() == ".html"]
        if html_files:
            if d == bucket:  # loose files directly in the bucket
                for f in html_files:
                    found.append((None, f))
            else:
                found.append((d, pick_entry(d, html_files)))
                continue  # a game dir is a leaf — never descend into it
        for e in entries:
            if e.is_dir() and e.name not in SKIP_DIRS and not e.name.startswith("."):
                stack.append(e)
    return found


def make_game_id(lib_id: str, key: str) -> str:
    """Stable, filesystem-safe id from a relative key (stable across runs)."""
    import hashlib
    slug = re.sub(r"[^a-z0-9]+", "-", key.lower()).strip("-")[:48]
    h = int(hashlib.md5(f"{lib_id}|{key}".encode()).hexdigest()[:4], 16)
    return f"{slug or 'g'}-{h:04x}"


def numeric_key(stem: str) -> str:
    m = re.match(r"(\d+)", stem)
    return m.group(1) if m else ""


def _covers_dir(lib_id: str) -> Path | None:
    """covers/ folder for a library, case-insensitive on the dir name."""
    base = ROOT / "covers"
    if not base.is_dir():
        return None
    for d in base.iterdir():
        if d.is_dir() and d.name.lower() == lib_id.lower():
            return d
    return None


def _norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def _common_prefix_len(a: str, b: str) -> int:
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def cover_for(lib_id: str, game_id: str, numeric: str = "", title: str = "") -> str:
    """Cover lookup:
    1. covers/<lib>/<numeric>.<ext>   (id-keyed, e.g. gn-math's 104.png)
    2. assets/covers/<lib>/<gid>.<ext (generated ones)
    3. covers/<lib>/<normalized title>.<ext>  (name-keyed, fuzzy prefix match)
    """
    base = _covers_dir(lib_id)
    if base is None:
        return ""
    exts = (".png", ".jpg", ".jpeg", ".webp", ".gif")
    if numeric:
        for ext in exts:
            p = base / f"{numeric}{ext}"
            if p.is_file():
                return p.relative_to(ROOT).as_posix()
    for ext in exts:
        p = base / f"{game_id}{ext}"
        if p.is_file():
            return p.relative_to(ROOT).as_posix()
    if title:
        want = _norm_name(title)
        best, best_len = "", 0
        for f in base.iterdir():
            if f.suffix.lower() not in exts:
                continue
            cand = _norm_name(f.stem)
            if cand == want:
                return f.relative_to(ROOT).as_posix()
            n = _common_prefix_len(want, cand)
            if n >= 4 and n > best_len:
                best, best_len = f.relative_to(ROOT).as_posix(), n
        if best:
            return best
    return ""


def title_for(entry: Path, game_dir: Path | None, fallback: str) -> str:
    """Naming priority: real <title> -> swfs.json (game dirs) -> name mined
    from the file's CDN URLs -> generic <title> ("Ruffle Player") -> fallback."""
    t = clean_title(read_title(entry))
    if t and t.lower() not in GENERIC_TITLES:
        return t
    if game_dir is not None:
        s = swf_fallback_title(game_dir)
        if s:
            return s
    mined = mine_name(read_head(entry))
    if mined:
        return mined
    if t:  # generic but genuine — still the file's own title
        return t
    return fallback


def rel(entry: Path) -> str:
    return entry.as_posix().replace(ROOT.as_posix() + "/", "")


def scan_ugs_style(lib_dir: Path, lib_id: str) -> dict | None:
    categories = [
        ("html5-games", "Html5 Games"),
        ("flash", "Flash Games"),
        ("emulated", "Emulated Games"),
    ]
    present = [(cid, label) for cid, label in categories if (lib_dir / cid).is_dir()]
    if not present:
        return None

    games: list[dict] = []
    systems: list[dict] = []

    for cid, _label in present:
        bucket = lib_dir / cid
        if cid == "emulated":
            sys_dirs = sorted([d for d in bucket.iterdir() if d.is_dir() and d.name not in SKIP_DIRS
                               and not d.name.startswith(".")], key=lambda p: p.name.lower())
            loose = [f for f in bucket.iterdir() if f.is_file() and f.suffix.lower() == ".html"]
            for sys_dir in sys_dirs:
                sys_id = sys_dir.name.lower()
                count_before = len(games)
                for gdir, entry in collect_games(sys_dir):
                    fb = prettify_name((gdir or entry).stem if gdir else entry.stem)
                    gid = make_game_id(lib_id, f"{cid}/{sys_dir.name}/"
                                       + (gdir.name if gdir else entry.stem))
                    games.append({
                        "id": gid, "title": title_for(entry, gdir, fb),
                        "entry": rel(entry), "cover": cover_for(lib_id, gid),
                        "source": "ugs", "category": cid, "system": sys_id,
                    })
                systems.append({"id": sys_id, "name": sys_dir.name, "count": len(games) - count_before})
            for f in loose:  # stray files directly inside emulated/
                gid = make_game_id(lib_id, f"{cid}/misc/{f.stem}")
                games.append({
                    "id": gid, "title": title_for(f, None, prettify_name(f.stem)),
                    "entry": rel(f), "cover": cover_for(lib_id, gid, numeric_key(f.stem)),
                    "source": "ugs", "category": cid, "system": "misc",
                })
            misc = sum(1 for g in games if g["system"] == "misc")
            if misc:
                systems.append({"id": "misc", "name": "misc", "count": misc})
        else:
            for gdir, entry in collect_games(bucket):
                fb = prettify_name((gdir or entry).stem if gdir else entry.stem)
                gid = make_game_id(lib_id, f"{cid}/" + (gdir.name if gdir else entry.stem))
                games.append({
                    "id": gid, "title": title_for(entry, gdir, fb),
                    "entry": rel(entry), "cover": cover_for(lib_id, gid),
                    "source": "ugs", "category": cid, "system": "",
                })

    games.sort(key=lambda g: sort_key(g["title"]))
    return {
        "id": lib_id,
        "name": LIBRARY_NAMES.get(lib_id, lib_dir.name),
        "categories": [{"id": cid, "label": label} for cid, label in present],
        "systems": sorted(systems, key=lambda s: sort_key(s["name"])),
        "games": games,
    }


def scan_flat(lib_dir: Path, lib_id: str) -> dict | None:
    """Libraries that keep games loose at the root: *.html files, game folders
    (flattened) and *.swf folders (played via Ruffle)."""
    loose_html = [f for f in lib_dir.iterdir() if f.is_file() and f.suffix.lower() == ".html"]
    if not loose_html:
        return None

    games = []
    for gdir, entry in collect_games(lib_dir):
        gid = make_game_id(lib_id, "root/" + (gdir.name if gdir else entry.stem))
        gtitle = title_for(entry, gdir, prettify_name((gdir or entry).stem))
        games.append({
            "id": gid, "title": gtitle,
            "entry": rel(entry), "cover": cover_for(lib_id, gid, title=gtitle), "source": "flat",
        })

    # folders that hold only .swf files (flash games without an html wrapper)
    swf_entries = {g["entry"] for g in games}
    for d in sorted(lib_dir.iterdir(), key=lambda p: p.name.lower()):
        if not d.is_dir() or d.name.startswith(".") or d.name in SKIP_DIRS:
            continue
        swfs = [f for f in sorted(d.iterdir()) if f.is_file() and f.suffix.lower() == ".swf"]
        if not swfs:
            continue
        swf = swfs[0]
        gid = make_game_id(lib_id, "swf/" + d.name)
        entry_rel = rel(swf)
        if entry_rel in swf_entries:
            continue
        gtitle = title_for(swf, None, prettify_name(d.name))
        games.append({
            "id": gid, "title": gtitle,
            "entry": entry_rel, "cover": cover_for(lib_id, gid, title=gtitle), "source": "flat", "kind": "swf",
        })

    games.sort(key=lambda g: sort_key(g["title"]))
    return {
        "id": lib_id, "name": LIBRARY_NAMES.get(lib_id, lib_dir.name.replace("-", " ").title()),
        "categories": [], "systems": [], "games": games,
    }


def scan_legacy(lib_dir: Path, lib_id: str) -> dict | None:
    if not (lib_dir / "singlefile").is_dir() and not (lib_dir / "else").is_dir():
        return None
    games: list[dict] = []

    sf_dir = lib_dir / "singlefile"
    if sf_dir.is_dir():
        for f in sorted(sf_dir.iterdir(), key=lambda p: p.name.lower()):
            if f.is_file() and f.suffix.lower() == ".html":
                gid = f"sf-{f.stem.lower()}"
                games.append({
                    "id": gid, "title": title_for(f, None, prettify_name(f.stem)),
                    "entry": rel(f), "cover": cover_for(lib_id, gid, numeric_key(f.stem)), "source": "singlefile",
                })

    else_dir = lib_dir / "else"
    if else_dir.is_dir():
        for gdir, entry in collect_games(else_dir):
            gid = f"el-{(gdir.name if gdir else entry.stem).lower()}"
            games.append({
                "id": gid, "title": title_for(entry, gdir, prettify_name((gdir or entry).stem)),
                "entry": rel(entry), "cover": cover_for(lib_id, gid, numeric_key((gdir or entry).stem)), "source": "else",
            })

    games.sort(key=lambda g: sort_key(g["title"]))
    return {
        "id": lib_id, "name": LIBRARY_NAMES.get(lib_id, lib_dir.name.replace("-", " ").title()),
        "categories": [], "systems": [], "games": games,
    }


def sort_key(s: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def main() -> int:
    if not PROJECTS_DIR.is_dir():
        print("No projects/ directory found — nothing to scan.", file=sys.stderr)
        return 1

    libraries = []
    for lib_dir in sorted(PROJECTS_DIR.iterdir(), key=lambda p: p.name.lower()):
        if not lib_dir.is_dir() or lib_dir.name.startswith(".") or lib_dir.name in SKIP_DIRS:
            continue
        lib_id = lib_dir.name.lower()
        lib = scan_ugs_style(lib_dir, lib_id) or scan_legacy(lib_dir, lib_id) or scan_flat(lib_dir, lib_id)
        if lib:
            libraries.append(lib)

    total = sum(len(lib["games"]) for lib in libraries)
    payload = {
        "version": 3,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "totalGames": total,
        "libraries": libraries,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    OUT_FILE.write_text(
        "// GENERATED by tools/build_catalog.py — do not edit by hand.\n"
        "// Regenerate with: python tools/build_catalog.py\n"
        f"window.HURLO_CATALOG={body};\n",
        encoding="utf-8",
    )

    with_covers = 0
    for lib in libraries:
        n = len(lib["games"])
        c = sum(1 for g in lib["games"] if g["cover"])
        with_covers += c
        extra = ""
        if lib["categories"]:
            extra += " | categories: " + ", ".join(
                f"{cat['id']} ({sum(1 for g in lib['games'] if g['category'] == cat['id'])})" for cat in lib["categories"])
        if lib["systems"]:
            extra += " | systems: " + ", ".join(f"{s['id']}({s['count']})" for s in lib["systems"] if s["count"])
        print(f"  {lib['id']}: {n} games, {c} covers{extra}")
    print(f"Catalog written to {OUT_FILE.relative_to(ROOT)} — {total} games, {with_covers} covers.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
