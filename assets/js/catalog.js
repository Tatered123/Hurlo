/* Hurlo — catalog service: normalized game entries, search, favorites, recents */
(function (H) {
  'use strict';
  const { storage, debounce } = H.util;

  const FAV_KEY = 'hurlo:favs:v1';
  const RECENT_KEY = 'hurlo:recents:v1';
  const RECENT_MAX = 12;

  const listeners = new Set();
  let games = [];       // normalized entries
  let byUid = new Map();
  let libraries = [];

  function normalize(raw) {
    libraries = (raw.libraries || []).map((lib) => ({
      id: lib.id,
      name: lib.name,
      tagline: lib.tagline || '',
      count: lib.games.length,
      categories: lib.categories || [],   // [{id, label}] — ugs-style libraries
      systems: lib.systems || []          // [{id, name, count}] — for emulated
    }));
    games = [];
    for (const lib of raw.libraries || []) {
      for (const g of lib.games) {
        games.push({
          uid: `${lib.id}~${g.id}`,      // stable, URL-safe composite id
          title: g.title,
          entry: g.entry,
          cover: g.cover || '',
          source: g.source,
          kind: g.kind || 'page',
          category: g.category || '',
          system: g.system || '',
          libraryId: lib.id,
          libraryName: lib.name
        });
      }
    }
    byUid = new Map(games.map((g) => [g.uid, g]));
  }

  /* favorites: array of uids */
  function getFavs() { const v = storage.get(FAV_KEY, []); return Array.isArray(v) ? v : []; }
  function isFavorite(uid) { return getFavs().includes(uid); }
  function toggleFavorite(uid) {
    let favs = getFavs();
    const has = favs.includes(uid);
    favs = has ? favs.filter((u) => u !== uid) : [...favs, uid];
    storage.set(FAV_KEY, favs);
    notify();
    return !has;
  }

  /* recents: array of {uid, at} newest-first */
  function getRecents() {
    const v = storage.get(RECENT_KEY, []);
    return Array.isArray(v) ? v.filter((r) => r && byUid.has(r.uid)) : [];
  }
  function pushRecent(uid) {
    let list = getRecents().filter((r) => r.uid !== uid);
    list.unshift({ uid, at: Date.now() });
    storage.set(RECENT_KEY, list.slice(0, RECENT_MAX));
    notify();
  }

  function notify() { listeners.forEach((fn) => { try { fn(); } catch { /* listener error */ } }); }

  /* search: substring match on title, case/diacritic-insensitive */
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function search(libId, query, opts = {}) {
    const q = norm(query || '').trim();
    let pool = libId ? games.filter((g) => g.libraryId === libId) : games;
    if (opts.category) pool = pool.filter((g) => g.category === opts.category);
    if (opts.system) pool = pool.filter((g) => g.system === opts.system);
    if (opts.favoritesOnly) {
      const favs = new Set(getFavs());
      pool = pool.filter((g) => favs.has(g.uid));
    }
    if (!q) return pool;
    return pool.filter((g) => norm(g.title).includes(q));
  }

  function sortByTitle(list, dir) {
    const coll = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
    return dir === 'za'
      ? [...list].sort((a, b) => coll.compare(b.title, a.title))
      : [...list].sort((a, b) => coll.compare(a.title, b.title));
  }

  function randomGame() { return games[Math.floor(Math.random() * games.length)]; }

  H.catalog = {
    normalize,
    get libraries() { return libraries; },
    get games() { return games; },
    get total() { return games.length; },
    get: (uid) => byUid.get(uid),
    isFavorite, toggleFavorite, getFavs,
    getRecents, pushRecent,
    search, sortByTitle, randomGame,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})(window.Hurlo = window.Hurlo || {});
