/* Hurlo — Home: storm's eye launcher.
 * Centered brand over the live hurricane background, one bar that either
 * searches the arcade or hands a URL to the Proxy, shortcuts into the
 * libraries, and the corner HUD carries the rest. No game grids here.
 */
(function (H) {
  'use strict';
  const { el, escapeHtml } = H.util;
  const ic = (n) => H.ui.iconEl(n);

  function isUrl(q) {
    return /^[a-z]+:\/\//i.test(q) || (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q) && !q.includes(' '));
  }

  function render(view) {
    const results = el('div', { class: 'home-drop hidden', id: 'home-results' });

    const input = el('input', {
      class: 'field-input', type: 'text', placeholder: 'search or enter url…',
      'aria-label': 'Search games or enter a URL', autocomplete: 'off', spellcheck: 'false'
    });
    const clearBtn = el('button', {
      class: 'field-clear', 'aria-label': 'Clear search', html: H.ui.icon('x'), hidden: true,
      onClick: () => { input.value = ''; update(''); input.focus(); }
    });

    function update(q) {
      clearBtn.hidden = !q;
      const query = q.trim();
      if (!query) { results.classList.add('hidden'); results.innerHTML = ''; return; }

      if (isUrl(query)) {
        results.innerHTML = '';
        results.append(el('button', { class: 'home-drop-row', onClick: () => goProxy(query) },
          el('span', { class: 'home-drop-ic', html: H.ui.icon('globe'), 'aria-hidden': 'true' }),
          el('span', { class: 'home-drop-label' }, `Open `, el('b', null, escapeHtml(query)), ' through the Proxy'),
          el('span', { class: 'home-drop-hint' }, 'Enter')));
        results.classList.remove('hidden');
        return;
      }

      const hits = H.catalog.search(null, query).slice(0, 7);
      results.innerHTML = '';
      if (!hits.length) {
        results.append(el('div', { class: 'home-drop-row home-drop-row--static' },
          el('span', { class: 'home-drop-ic', html: H.ui.icon('search'), 'aria-hidden': 'true' }),
          el('span', { class: 'home-drop-label' }, `No games match “${escapeHtml(query)}”`)));
      } else {
        for (const g of hits) {
          results.append(el('button', { class: 'home-drop-row', onClick: () => H.router.go('#/play/' + encodeURIComponent(g.uid)) },
            g.cover
              ? el('span', { class: 'home-drop-ic' }, el('img', { src: g.cover, alt: '', loading: 'lazy' }))
              : el('span', { class: 'home-drop-ic', html: H.ui.icon('gamepad') }),
            el('span', { class: 'home-drop-label' }, escapeHtml(g.title)),
            el('span', { class: 'home-drop-hint' }, g.libraryName)));
        }
        results.append(el('button', { class: 'home-drop-row home-drop-row--more', onClick: () => goGames(query) },
          el('span', { class: 'home-drop-ic', html: H.ui.icon('grid'), 'aria-hidden': 'true' }),
          el('span', { class: 'home-drop-label' }, 'See all results'),
          el('span', { class: 'home-drop-hint' }, 'Enter')));
      }
      results.classList.remove('hidden');
    }

    input.addEventListener('input', () => update(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const query = input.value.trim();
      if (!query) return;
      if (isUrl(query)) return goProxy(query);
      const hits = H.catalog.search(null, query);
      if (hits.length) H.router.go('#/play/' + encodeURIComponent(hits[0].uid));
      else goGames(query);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; update(''); } });
    const onDocDown = (e) => {
      if (!results.contains(e.target) && e.target !== input) results.classList.add('hidden');
    };
    document.addEventListener('pointerdown', onDocDown);

    function goGames(query) {
      H.util.storage.set(STATE_KEY, Object.assign(H.util.storage.get(STATE_KEY, {}), { q: query, favs: false }));
      H.router.go('#/games');
    }
    function goProxy(query) {
      H.util.storage.set('hurlo:proxy-url:v1', query);
      H.router.go('#/proxy');
    }

    /* proxy hotkeys: one click opens the site through the relay.
       Built-ins + whatever the visitor adds with the plus tile. */
    const KEY = 'hurlo:proxy-shortcuts:v1';
    const builtins = [
      { icon: 'film', label: 'Movies', url: 'https://www.movy.sx/' },
      { icon: 'music', label: 'Music', url: 'https://monochrome.st/' }
    ];
    const customs = H.util.storage.get(KEY, []);

    function row() {
      const r = document.querySelector('.shortcut-row');
      if (!r) return;
      r.innerHTML = '';
      for (const s of builtins) r.append(tile(s.icon, s.label, () => goProxy(s.url)));
      for (const c of customs) r.append(customTile(c));
      r.append(el('button', {
        class: 'shortcut shortcut-add', 'aria-label': 'Add a shortcut', title: 'Add a shortcut',
        onClick: () => addDialog()
      },
        el('span', { class: 'shortcut-ic', html: H.ui.icon('plus') }),
        el('span', null, 'Add')));
    }
    function tile(iconName, label, onClick) {
      return el('button', { class: 'shortcut', 'aria-label': label, onClick },
        el('span', { class: 'shortcut-ic', html: H.ui.icon(iconName) }),
        el('span', null, label));
    }
    function customTile(c) {
      const t = tile('globe', c.name, () => goProxy(c.url));
      t.classList.add('shortcut-custom');
      t.title = c.url;
      const x = el('button', {
        class: 'shortcut-x', 'aria-label': 'Remove ' + c.name, title: 'Remove',
        onClick: (e) => {
          e.stopPropagation();
          const next = customs.filter(function (s) { return s.name !== c.name || s.url !== c.url; });
          H.util.storage.set(KEY, next);
          customs.length = 0;
          next.forEach(function (s) { customs.push(s); });
          row();
        }
      }, '×');
      t.append(x);
      return t;
    }
    function addDialog() {
      H.ui.modal({
        title: 'Add a shortcut',
        fields: [
          { key: 'name', label: 'Name', placeholder: 'e.g. Movies', type: 'text' },
          { key: 'url', label: 'Address', placeholder: 'e.g. example.com', type: 'text' }
        ],
        confirm: 'Add',
        onSubmit: function (values) {
          if (!values.name.trim() || !values.url.trim()) return false;
          customs.push({ name: values.name.trim(), url: values.url.trim() });
          H.util.storage.set(KEY, customs);
          row();
          return true;
        }
      });
    }
    view.append(el('div', { class: 'home page' },
      el('div', { class: 'home-brand' },
        el('span', { class: 'home-mark-mark', html: H.ui.logoSvg() }),
        el('h1', { class: 'home-mark' }, 'Hurlo', el('span', { class: 'ver' }, 'v1'))),
      el('p', { class: 'home-tagline' }, 'eye of the storm.'),
      el('div', { class: 'home-search' },
        el('div', { class: 'field' }, ic('search'), input, clearBtn),
        results),
      el('div', { class: 'shortcut-row', role: 'group', 'aria-label': 'Proxy shortcuts' })
    ));
    row();  // fill the shortcut row now that it exists in the DOM
    setTimeout(() => input.focus({ preventScroll: true }), 250);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }

  const STATE_KEY = 'hurlo:games-view:v1';

  H.pages = H.pages || {};
  H.pages.home = { render };
})(window.Hurlo = window.Hurlo || {});
