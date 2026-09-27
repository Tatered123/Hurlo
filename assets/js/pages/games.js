/* Hurlo — Games: a fake file system.
 *
 *   #/games                     → library folders (Gn-Math, UGS, …)
 *   #/games/gn-math             → all Gn-Math games, flat
 *   #/games/ugs                 → category folders (All / Html5 / Flash / Emulated)
 *   #/games/ugs/html5-games     → flattened game list of that bucket
 *   #/games/ugs/flash           → same, for flash
 *   #/games/ugs/emulated        → system folders (All / nes / snes / …)
 *   #/games/ugs/emulated/nes    → all games for that system
 *
 * Breadcrumbs ("/ugs/html5/…") and a back arrow sit above every view.
 */
(function (H) {
  'use strict';
  const { el, frag, debounce, formatNumber, escapeHtml } = H.util;
  const ic = (n) => H.ui.iconEl(n);

  const PAGE_SIZE = 48;
  const STATE_KEY = 'hurlo:games-view:v1';
  const CATEGORY_LABELS = { 'html5-games': 'Html5 Games', 'flash': 'Flash Games', 'emulated': 'Emulated Games' };
  const SYSTEM_NAMES = { nes: 'NES', snes: 'SNES', n64: 'N64', gba: 'GBA', gbc: 'GBC', gb: 'Game Boy', ds: 'Nintendo DS', '3ds': 'Nintendo 3DS', psx: 'PlayStation', ps1: 'PS1', psp: 'PSP', sega: 'Sega', genesis: 'Genesis', md: 'Mega Drive', arcade: 'Arcade', atari: 'Atari', misc: 'Other' };

  let state = { q: '', sort: 'az', favs: false, shown: PAGE_SIZE };

  function restore() {
    const saved = H.util.storage.get(STATE_KEY, null);
    if (saved) state = Object.assign(state, saved, { shown: PAGE_SIZE });
  }
  function persist() { H.util.storage.set(STATE_KEY, state); }

  /* ---------- helpers ---------- */

  const sysName = (id) => SYSTEM_NAMES[id] || (id ? id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : id);

  function breadcrumb(segs) {
    const parts = [{ label: 'games', href: '#/games' }];
    let acc = '#/games';
    segs.forEach((s, i) => {
      acc += '/' + encodeURIComponent(s);
      const lib = i === 0 ? H.catalog.libraries.find((l) => l.id === s) : null;
      const label = lib ? lib.name
        : CATEGORY_LABELS[s] || (segs[0] && isSystemSeg(segs, i) ? sysName(s) : s);
      parts.push({ label, href: acc });
    });

    const back = segs.length
      ? el('a', { class: 'fs-back', href: segs.length === 1 ? '#/games' : '#/' + segs.slice(0, -1).join('/'), 'aria-label': 'Back', title: 'Back' }, ic('chevron-left'))
      : null;

    return el('div', { class: 'fs-crumbs' },
      back,
      el('nav', { class: 'fs-path', 'aria-label': 'Breadcrumb' },
        parts.map((p, i) => el('span', { class: 'fs-crumb' },
          i > 0 && el('span', { class: 'fs-sep', 'aria-hidden': 'true' }, '/'),
          i === parts.length - 1
            ? el('span', { class: 'fs-crumb-here', 'aria-current': 'location' }, p.label)
            : el('a', { href: p.href }, p.label))))
    );
  }

  function isSystemSeg(segs, i) {
    return i >= 2 && segs[1] === 'emulated';
  }

  function folderTile(label, sub, href, iconName) {
    return el('a', { class: 'fs-folder', href },
      el('span', { class: 'fs-folder-ic', html: H.ui.icon(iconName || 'folder'), 'aria-hidden': 'true' }),
      el('span', { class: 'fs-folder-name' }, label),
      el('span', { class: 'fs-folder-sub' }, sub));
  }

  /* ---------- render ---------- */

  function render(view, segs) {
    restore();
    view.innerHTML = '';
    const page = el('div', { class: 'page', id: 'games-page' });
    view.append(page);

    /* unknown library → back to root */
    if (segs.length && !H.catalog.libraries.some((l) => l.id === segs[0])) {
      location.replace('#/games');
      return;
    }
    const lib = segs[0] ? H.catalog.libraries.find((l) => l.id === segs[0]) : null;

    if (!lib) return renderRoot(page);
    if (!lib.categories.length) return renderList(view, page, segs, { libId: lib.id });
    if (segs.length === 1) return renderCategories(page, lib);
    if (segs[1] === 'emulated') return renderEmulated(view, page, segs, lib);
    if (lib.categories.some((c) => c.id === segs[1])) return renderList(view, page, segs, { libId: lib.id, category: segs[1] });
    location.replace('#/games/' + lib.id);
  }

  /* root: library folders */
  function renderRoot(page) {
    page.append(
      breadcrumb([]),
      el('div', { class: 'fs-grid' },
        H.catalog.libraries.map((lib) => folderTile(lib.name, `${formatNumber(lib.count)} games`, '#/games/' + encodeURIComponent(lib.id))))
    );
  }

  /* ugs: category folders */
  function renderCategories(page, lib) {
    page.append(breadcrumb([lib.id]));
    const tiles = [folderTile('All', `${formatNumber(lib.count)} games`, '#/games/' + lib.id + '/all', 'sparkles')];
    for (const cat of lib.categories) {
      const n = H.catalog.games.filter((g) => g.libraryId === lib.id && g.category === cat.id).length;
      tiles.push(folderTile(CATEGORY_LABELS[cat.id] || cat.id, `${formatNumber(n)} games`,
        `#/games/${lib.id}/${cat.id}`));
    }
    page.append(el('div', { class: 'fs-grid' }, tiles));
  }

  /* ugs emulated: system folders */
  function renderEmulated(view, page, segs, lib) {
    if (segs.length === 2) {
      page.append(breadcrumb([lib.id, 'emulated']));
      const emu = H.catalog.games.filter((g) => g.libraryId === lib.id && g.category === 'emulated');
      const tiles = [folderTile('All', `${formatNumber(emu.length)} games`, `#/games/${lib.id}/emulated/all`, 'sparkles')];
      for (const s of lib.systems) {
        tiles.push(folderTile(sysName(s.id), `${formatNumber(s.count)} game${s.count === 1 ? '' : 's'}`,
          `#/games/${lib.id}/emulated/${encodeURIComponent(s.id)}`));
      }
      page.append(el('div', { class: 'fs-grid' }, tiles));
      return;
    }
    const sys = segs[2];
    if (sys !== 'all' && !lib.systems.some((s) => s.id === sys)) {
      location.replace('#/games/' + lib.id + '/emulated');
      return;
    }
    return renderList(view, page, segs, { libId: lib.id, category: 'emulated', system: sys === 'all' ? null : sys });
  }

  /* any flat game list */
  function renderList(view, page, segs, scope) {
    const listScope = { libId: scope.libId, category: scope.category || null, system: scope.system || null };

    page.append(breadcrumb(segs));

    /* search + sort toolbar */
    const input = el('input', {
      class: 'field-input', id: 'games-search', type: 'search',
      placeholder: 'Search…', value: state.q, 'aria-label': 'Search games',
      autocomplete: 'off', spellcheck: 'false'
    });
    const clearBtn = el('button', {
      class: 'field-clear', 'aria-label': 'Clear search', html: H.ui.icon('x'), hidden: !state.q,
      onClick: () => { input.value = ''; onQuery(''); }
    });
    input.addEventListener('input', debounce(() => onQuery(input.value), 130));
    input.addEventListener('search', () => onQuery(input.value));

    const favChip = el('button', {
      class: 'chip', id: 'fav-filter', 'aria-pressed': String(state.favs),
      onClick: () => { state.favs = !state.favs; favChip.setAttribute('aria-pressed', String(state.favs)); applyResults({ reset: true }); persist(); }
    }, ic('heart'), 'Favorites');

    page.append(el('div', { class: 'games-toolbar' },
      el('div', { class: 'field games-search' }, ic('search'), input, clearBtn),
      el('div', { class: 'segmented', role: 'group', 'aria-label': 'Sort order' }, segBtn('A–Z', 'az'), segBtn('Z–A', 'za')),
      favChip,
      el('button', {
        class: 'chip', 'aria-label': 'Play a random game',
        onClick: () => {
          const pool = H.catalog.search(listScope.libId, '', { category: listScope.category, system: listScope.system });
          const g = pool[Math.floor(Math.random() * pool.length)];
          if (g) H.router.go('#/play/' + encodeURIComponent(g.uid));
        }
      }, ic('dice'), 'Random')
    ));

    page.append(el('div', { class: 'results-meta', id: 'results-meta', role: 'status', 'aria-live': 'polite' }));
    const results = el('div', { id: 'games-results' });
    page.append(results);
    results.append(...Array.from({ length: 8 }, () => H.ui.skeletonCard()));

    /* render shortly after paint; setTimeout (not rAF) so results appear
       even when the browser suppresses frame production */
    setTimeout(() => {
      if (!document.getElementById('games-page')) return; // navigated away
      applyResults({ reset: true });
      const y = H.util.storage.get('hurlo:games-scroll:v1', 0);
      if (y) window.scrollTo(0, y);
    }, 60);

    return () => H.util.storage.set('hurlo:games-scroll:v1', window.scrollY);

    function onQuery(q) {
      state.q = q;
      const clear = document.querySelector('#games-page .field-clear');
      if (clear) clear.hidden = !q;
      applyResults(listScope, { reset: true });
      persist();
    }

    function segBtn(label, value) {
      return el('button', {
        'aria-pressed': String(state.sort === value),
        onClick: () => {
          state.sort = value;
          const seg = document.querySelector('.segmented[aria-label="Sort order"]');
          if (seg) [...seg.children].forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === (state.sort === 'az'))));
          applyResults(listScope, { reset: true }); persist();
        }
      }, label);
    }

    function applyResults(sc, opts = {}) {
      const container = document.getElementById('games-results');
      const meta = document.getElementById('results-meta');
      if (!container || !document.getElementById('games-page')) return;
      if (opts.reset) state.shown = PAGE_SIZE;

      let list = H.catalog.search(sc.libId, state.q, { category: sc.category, system: sc.system, favoritesOnly: state.favs });
      list = H.catalog.sortByTitle(list, state.sort);
      container.innerHTML = '';

      if (!list.length) {
        const empty = state.favs && !state.q
          ? H.ui.emptyState({ iconName: 'heart', title: 'No favorites yet', body: 'Tap the heart on a game tile to pin it here.', actionLabel: 'Browse all games', onAction: () => { const c = document.getElementById('fav-filter'); if (c) c.click(); } })
          : H.ui.emptyState({
              iconName: 'folder', title: sc.system ? 'Nothing in this folder' : 'Nothing found',
              body: state.q ? `No games match “${state.q}” here.` : 'This folder is empty for now.',
              actionLabel: state.q ? 'Clear search' : null,
              onAction: () => { const i = document.getElementById('games-search'); if (i) { i.value = ''; onQuery(''); i.focus(); } }
            });
        container.append(empty);
        meta.textContent = '';
        return;
      }

      const slice = list.slice(0, state.shown);
      container.append(el('div', { class: 'game-grid' },
        slice.map((g, i) => H.ui.gameCard(g, null, { index: Math.min(i, 14) }))));

      meta.innerHTML = `<b>${formatNumber(slice.length)}</b> of <b>${formatNumber(list.length)}</b>${state.q ? ` for “${escapeHtml(state.q)}”` : ''}`;

      if (state.shown < list.length) {
        const more = el('div', { class: 'load-more-wrap' },
          el('button', { class: 'btn', onClick: () => { state.shown += PAGE_SIZE; applyResults(sc, {}); persist(); } },
            `Load more (${formatNumber(list.length - state.shown)} left)`));
        container.append(more);
        const sentinel = el('div', { style: { height: '1px' }, 'aria-hidden': 'true' });
        more.prepend(sentinel);
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            state.shown += PAGE_SIZE;
            applyResults(sc, {});
            persist();
          }
        }, { rootMargin: '500px' });
        io.observe(sentinel);
      }
    }
  }

  H.pages = H.pages || {};
  H.pages.games = { render };
})(window.Hurlo = window.Hurlo || {});
