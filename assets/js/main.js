/* Hurlo — app bootstrap: shell (HUD, cloak buttons, info), routes, wiring */
(function (H) {
  'use strict';
  const { el, formatNumber } = H.util;
  const ic = (n) => H.ui.iconEl(n);

  function buildShell() {
    /* topbar: brand center, info button right */
    document.getElementById('topbar').append(
      el('span', null),
      el('a', { class: 'brand', href: '#/', 'aria-label': 'Hurlo home' },
        el('span', { class: 'brand-mark', html: H.ui.logoSvg() }),
        el('span', { class: 'brand-name' }, 'Hurlo')),
      el('div', { class: 'nav' },
        el('button', {
          class: 'icon-btn', 'aria-label': 'About Hurlo and game ownership', title: 'About',
          onClick: showAbout
        }, el('span', { html: H.ui.icon('info'), 'aria-hidden': 'true' })))
    );

    /* bottom-left: cloak this site in about:blank / blob: */
    document.getElementById('hud-bl').append(
      el('button', {
        class: 'hud-pill', 'aria-label': 'Open Hurlo in an about:blank window',
        onClick: openAboutBlankCloak
      }, el('span', { html: H.ui.icon('shield-check'), 'aria-hidden': 'true' }), 'about:blank'),
      el('button', {
        class: 'hud-pill', 'aria-label': 'Open Hurlo under a blob: URL',
        onClick: openBlobCloak
      }, el('span', { html: H.ui.icon('zap'), 'aria-hidden': 'true' }), 'blob:')
    );

    /* bottom-center: primary destinations */
    document.getElementById('hud-bc').append(
      el('a', { class: 'hud-pill', href: '#/games' }, el('span', { html: H.ui.icon('folder'), 'aria-hidden': 'true' }), 'All games'),
      el('a', { class: 'hud-pill', href: '#/settings' }, el('span', { html: H.ui.icon('gear'), 'aria-hidden': 'true' }), 'Settings'),
      el('a', { class: 'hud-pill', href: '#/proxy' }, el('span', { html: H.ui.icon('globe'), 'aria-hidden': 'true' }), 'Proxy')
    );

    /* bottom-right: live clock */
    const clock = el('span', { class: 'hud-clock', id: 'hud-clock', role: 'timer', 'aria-label': 'Current time' }, '—');
    document.getElementById('hud-br').append(clock);
    const tick = () => { clock.textContent = new Date().toLocaleTimeString(); };
    tick();
    setInterval(tick, 1000);
  }

  /* ---- cloaking ---- */

  function siteUrl() {
    return location.origin === 'null' ? location.href : location.origin + '/';
  }

  function cloakedShell(innerTitle, innerIcon) {
    const c = H.cloak.resolved();
    return '<!DOCTYPE html><html><head><title>' + (innerTitle ? innerTitle : c.windowTitle) + '</title>' +
      '<link rel="icon" href="' + (innerIcon ? innerIcon : c.windowIcon) + '">' +
      '<style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}' +
      'iframe{border:0;width:100%;height:100%;display:block}</style></head>' +
      '<body><iframe src="__SRC__" allow="fullscreen; gamepad; autoplay; pointer-lock" allowfullscreen></iframe></body></html>';
  }

  function openAboutBlankCloak() {
    const win = window.open('about:blank', '_blank');
    if (!win) {
      H.ui.toast({ type: 'warn', msg: 'Popup blocked — allow popups to use about:blank' });
      return;
    }
    const doc = cloakedShell().replace('__SRC__', siteUrl());
    win.document.open();
    win.document.write(doc);
    win.document.close();
  }

  async function openBlobCloak() {
    try {
      const res = await fetch(siteUrl(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let html = await res.text();
      const base = location.origin === 'null' ? '' : location.origin + '/';
      if (base && !/<base\s/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, '<head$1><base href="' + base + '">');
      }
      const c = H.cloak.resolved();
      html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + c.windowTitle + '</title>');
      if (/<link[^>]+rel=["']icon["'][^>]*>/i.test(html)) {
        html = html.replace(/<link[^>]+rel=["']icon["'][^>]*>/i, '<link rel="icon" href="' + c.windowIcon + '">');
      } else {
        html = html.replace(/<\/head>/i, '<link rel="icon" href="' + c.windowIcon + '"></head>');
      }
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const win = window.open(url, '_blank');
      if (!win) {
        H.ui.toast({ type: 'warn', msg: 'Popup blocked — allow popups to use blob:' });
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
      setTimeout(() => URL.revokeObjectURL(url), 300000);
    } catch {
      H.ui.toast({ type: 'warn', msg: 'blob: cloak needs the site served over http(s)' });
    }
  }

  /* ---- about / disclaimer modal ---- */

  function showAbout() {
    const backdrop = el('div', { class: 'modal-backdrop' },
      el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'About Hurlo' },
        el('h3', null, 'About Hurlo'),
        el('p', null,
          'All games on Hurlo are the property of their respective creators and owners. ' +
          'Hurlo is a free, non-commercial arcade that simply makes publicly available games ' +
          'convenient to play in one place. Nothing here is sold, and no ownership is claimed.'),
        el('p', { style: { marginBottom: '8px' } },
          'If you are a rights holder and would like your game removed, contact the site ' +
          'administrator and it will be taken down promptly.'),
        el('p', { class: 'about-version' }, 'Hurlo v1'),
        el('div', { class: 'modal-actions' },
          el('button', { class: 'btn', onClick: () => close() }, 'Close')))
    );

    function close() {
      backdrop.classList.add('leaving');
      setTimeout(() => backdrop.remove(), 160);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    document.getElementById('modal-root').append(backdrop);
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.btn').focus();
  }

  /* ---- routes ---- */

  function registerRoutes() {
    H.router.addRoute('#/', (p, v) => H.pages.home.render(v));
    /* fake file system: /games, /games/<lib>, /games/<lib>/<cat>, /games/<lib>/<cat>/<sys> */
    H.router.addRoute('#/games', (p, v) => H.pages.games.render(v, []));
    H.router.addRoute('#/games/:a', (p, v) => H.pages.games.render(v, [p.a]));
    H.router.addRoute('#/games/:a/:b', (p, v) => H.pages.games.render(v, [p.a, p.b]));
    H.router.addRoute('#/games/:a/:b/:c', (p, v) => H.pages.games.render(v, [p.a, p.b, p.c]));
    H.router.addRoute('#/play/:uid', (p, v) => H.pages.player.render(p, v));
    H.router.addRoute('#/settings', (p, v) => H.pages.settings.render(v));
    H.router.addRoute('#/proxy', (p, v) => H.pages.proxy.render(v));
  }

  function fatal(title, body) {
    document.getElementById('view').append(
      el('div', { class: 'page' },
        el('div', { class: 'empty', style: { marginTop: '16vh' } },
          el('div', { class: 'empty-orb', html: H.ui.icon('alert') }),
          el('h3', null, title),
          el('p', null, body)))
    );
  }

  function boot() {
    if (!window.HURLO_CATALOG || !Array.isArray(window.HURLO_CATALOG.libraries)) {
      fatal('Catalog missing',
        'data/catalog.js could not be loaded. Regenerate it from the project root with: python tools/build_catalog.py');
      return;
    }
    H.catalog.normalize(window.HURLO_CATALOG);
    if (!H.catalog.total) {
      fatal('No games found',
        'Add games under projects/<library>/, then run python tools/build_catalog.py.');
      return;
    }

    buildShell();
    registerRoutes();
    H.router.start();

    H.settings.onChange((changed) => {
      if (changed.reset) {
        H.ui.toast({ type: 'ok', msg: 'Settings reset' });
        H.cloak.apply();
      }
      if (changed.reducedMotion !== undefined && !changed.reset) H.router.reRender();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.Hurlo = window.Hurlo || {});
