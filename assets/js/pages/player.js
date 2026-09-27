/* Gn-Math — Game player: blurred backdrop, centered frame, cloaked launching.
 *
 * Page chrome is intentionally minimal: the iframe centered mid-screen and two
 * buttons below it (Full screen / Open in about:blank). Esc returns to Games.
 *
 * Cloaking:
 *  - in-page frame: the entry HTML is fetched, given an absolute <base>, and
 *    loaded from a blob: URL so the frame never points at the raw file path.
 *  - "Open in about:blank": opens a blank window and writes a frame into it,
 *    so the game runs in a tab titled "Home" with no visible file URL.
 */
(function (H) {
  'use strict';
  const { el } = H.util;
  const ic = (n) => H.ui.iconEl(n);

  const LOAD_TIMEOUT = 45000;

  function render(params, view) {
    const game = H.catalog.get(params.uid);

    if (!game) {
      view.append(el('div', { class: 'page' },
        el('div', { class: 'empty', style: { marginTop: '16vh' } },
          el('div', { class: 'empty-orb', html: H.ui.icon('alert') }),
          el('h3', null, 'Game not found'),
          el('p', null, 'It may have been moved or removed from the catalog.'),
          el('a', { class: 'btn', href: '#/games' }, 'Back to games')
        )
      ));
      return;
    }

    H.catalog.pushRecent(game.uid);
    document.body.classList.add('player-active');

    /* --- frame --- */
    const frame = el('iframe', {
      class: 'player-frame', title: game.title,
      allow: 'fullscreen; gamepad; autoplay; pointer-lock', allowfullscreen: 'true'
    });

    const loading = el('div', { class: 'player-loading' },
      el('div', { html: H.ui.spinner(), 'aria-hidden': 'true' }));

    const frameWrap = el('div', { class: 'player-frame-wrap' }, frame, loading);

    /* --- error overlay (inside the frame area only) --- */
    let loaded = false, failed = false, timeoutTimer = 0, blobUrl = null;

    function showError() {
      failed = true;
      clearTimeout(timeoutTimer);
      loading.classList.add('done');
      if (frameWrap.querySelector('.player-error')) return;
      frameWrap.append(el('div', { class: 'player-error' },
        el('div', { class: 'empty' },
          el('div', { class: 'empty-orb', html: H.ui.icon('cloud-off') }),
          el('h3', null, 'Couldn\'t load this game'),
          el('p', null, 'Try again, or open it in a separate tab.'),
          el('div', { class: 'state-actions', style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
            el('button', { class: 'btn', onClick: () => { failed = false; loaded = false; frameWrap.querySelector('.player-error')?.remove(); loading.classList.remove('done'); loadIntoFrame(); } }, ic('refresh'), 'Retry'),
            el('button', { class: 'btn btn--ghost', onClick: () => openAboutBlank() }, 'Open in about:blank')
          ))
      ));
    }

    function markLoaded() {
      if (loaded || failed) return;
      loaded = true;
      clearTimeout(timeoutTimer);
      loading.classList.add('done');
    }

    /* --- blob cloaking: fetch entry, inject absolute <base>, load via blob URL --- */
    async function loadIntoFrame() {
      clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(() => { if (!loaded && !failed) showError(); }, LOAD_TIMEOUT);
      const abs = new URL(game.entry, location.href).href;
      try {
        const res = await fetch(abs, { cache: 'force-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let html = await res.text();
        if (!/<base\s/i.test(html)) {
          const dir = abs.slice(0, abs.lastIndexOf('/') + 1);
          if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${dir}">`);
          else html = `<base href="${abs.slice(0, abs.lastIndexOf('/') + 1)}">` + html;
        }
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        frame.src = blobUrl;
      } catch {
        frame.src = abs; // cloak unavailable (e.g. file://) — load directly
      }
    }

    /* --- about:blank launcher --- */
    function openAboutBlank() {
      const abs = new URL(game.entry, location.href).href;
      const win = window.open('about:blank', '_blank');
      if (!win) {
        H.ui.toast({ type: 'warn', msg: 'Popup blocked — allow popups to use about:blank' });
        return;
      }
      const c = H.cloak.resolved();
      win.document.open();
      win.document.write(
        '<!DOCTYPE html><html><head><title>' + c.windowTitle + '</title>' +
        '<link rel="icon" href="' + c.windowIcon + '">' +
        '<style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}' +
        'iframe{border:0;width:100%;height:100%;display:block}</style></head>' +
        '<body><iframe src="' + abs + '" allow="fullscreen; gamepad; autoplay; pointer-lock" allowfullscreen></iframe></body></html>'
      );
      win.document.close();
    }

    /* --- fullscreen --- */
    function toggleFullscreen() {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else frameWrap.requestFullscreen().catch(() => {
        H.ui.toast({ type: 'warn', msg: 'Fullscreen was blocked by the browser' });
      });
    }

    /* auto-fullscreen preference: request as soon as the frame is in the DOM,
       then once more on the first interaction in case the browser required a
       fresh gesture */
    function tryAutoFullscreen() {
      if (H.settings.get('autoFullscreen') && !document.fullscreenElement) {
        frameWrap.requestFullscreen().catch(() => {});
      }
    }
    const gestureFullscreen = () => tryAutoFullscreen();

    frame.addEventListener('load', markLoaded);
    frame.addEventListener('error', showError);

    /* --- close: return to wherever the game was launched from --- */
    const prev = H.router.prev;
    const backTo = (prev && prev.startsWith('#/') && !prev.startsWith('#/play')) ? prev : '#/games';
    function closeGame() {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      H.router.go(backTo);
    }

    /* --- controls: exactly two buttons --- */
    const controls = el('div', { class: 'player-controls' },
      el('button', { class: 'player-close', 'aria-label': 'Close game', title: 'Close', onClick: closeGame },
        ic('x')),
      el('button', { class: 'btn', onClick: toggleFullscreen }, ic('expand'), 'Full screen'),
      el('button', { class: 'btn', onClick: openAboutBlank }, ic('external'), 'Open in about:blank')
    );

    /* blurred backdrop: the game's own cover when we have one, else a
       storm-tile gradient tinted for this game */
    const pal = H.util.paletteFor(game.uid);
    const veilStyle = game.cover
      ? { backgroundImage: `url("${game.cover}")` }
      : { background: `radial-gradient(60% 55% at 50% 40%, ${pal.glow}, transparent 70%), linear-gradient(155deg, ${pal.a}, ${pal.b})` };

    view.append(el('div', { class: 'player-root page' },
      el('div', { class: 'player-veil', 'aria-hidden': 'true', style: veilStyle }),
      frameWrap,
      controls
    ));

    tryAutoFullscreen();
    document.addEventListener('pointerdown', gestureFullscreen, { once: true, capture: true });

    /* Esc returns to where you came from (keyboard-only affordance) */
    function onKey(e) {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        closeGame();
      }
    }
    document.addEventListener('keydown', onKey);

    loadIntoFrame();

    return () => {
      clearTimeout(timeoutTimer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', gestureFullscreen, { capture: true });
      document.body.classList.remove('player-active');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }

  H.pages = H.pages || {};
  H.pages.player = { render };
})(window.Hurlo = window.Hurlo || {});
