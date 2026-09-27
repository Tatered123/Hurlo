/* Hurlo — Proxy: real browsing through Scramjet v2 / Ultraviolet.
 *
 * Extracted from the arsenic-2 architecture:
 *   - both engines are service workers registered at the site root
 *     (uv.sw.js -> /service/uv/, scramjet.sw.js -> /service/scramjet/)
 *   - Ultraviolet rides bare-mux (/baremux/worker.js) with the epoxy or
 *     libcurl v2-era transport; Scramjet's controller takes the v3/v2-era
 *     transports (/epoxy3/, /libcurl2/) directly
 *   - both engines move their traffic over wisp (ws(s)://host/wisp/),
 *     served by server.py alongside the static site
 *
 * Pages browse inside the viewport iframe; Esc/Close returns to Games.
 */
(function (H) {
  'use strict';
  const { el, escapeHtml } = H.util;
  const ic = (n) => H.ui.iconEl(n);

  const TRANSPORTS = {
    epoxy: { label: 'Epoxy', path: '/epoxy/index.mjs', path3: '/epoxy3/index.mjs', desc: 'Fine for pages, slow on large downloads.' },
    libcurl: { label: 'libcurl', path: '/libcurl/index.mjs', path3: '/libcurl2/index.mjs', desc: 'Fine for pages, faster on large downloads.' }
  };

  /* address-bar input -> URL, falling back to a search engine */
  function resolve(input) {
    const q = input.trim();
    if (!q) return null;
    if (/^https?:\/\//i.test(q)) return q;
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(q) && !q.includes(' ')) return `https://${q}`;
    return 'https://duckduckgo.com/?q=' + encodeURIComponent(q);
  }

  function wispUrl() {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${location.host}/wisp/`;
  }

  function script(src) {
    return new Promise((resolve, reject) => {
      const found = document.head.querySelector(`script[src="${src}"]`);
      if (found) return resolve();
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error('failed to load ' + src));
      document.head.append(el);
    });
  }

  async function registerSW(path, scope) {
    if (!navigator.serviceWorker) {
      throw new Error('Service workers need the site served over http(s) — reopen Hurlo at 127.0.0.1:8123.');
    }
    const reg = await navigator.serviceWorker.register(path, { scope });
    const worker = reg.installing ?? reg.waiting ?? reg.active;
    if (worker && worker.state !== 'activated') {
      await new Promise((resolve) => {
        worker.addEventListener('statechange', () => worker.state === 'activated' && resolve());
      });
    }
    return reg.active;
  }

  /* ---- engines ---- */

  /* Service workers get evicted and lose Scramjet's routing table; the
     heartbeat notices (alive=false) and re-hands the transport port over.
     Ported from arsenic's backends.js startHeartbeat. */
  function startHeartbeat(sw, controller) {
    const prefix = controller.prefix;
    let handling = false;
    const onMessage = (event) => {
      const info = event.data && event.data.$arsenic$controller;
      if (!info || info.prefix !== prefix || info.alive !== false || handling) return;
      handling = true;
      try { controller.setupMessagePort(); } finally { setTimeout(() => (handling = false), 250); }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    const ping = () => { try { sw.postMessage({ $arsenic$keepalive: { prefix } }); } catch { /* worker mid-restart */ } };
    setInterval(ping, 1000);
    ping();
  }

  const ENGINES = {
    scramjet: {
      label: 'Scramjet v2',
      desc: 'Quick on simple pages, can be slow on heavy ones.',
      ready: once(async () => {
        await script('/scram/scramjet.js');
        await script('/controller/controller.api.js');
        const { Controller } = globalThis.$scramjetController;
        const sw = await registerSW('/scramjet.sw.js', '/service/scramjet/');
        const transportMod = await import(TRANSPORTS[transport].path3);
        const transportClient = new transportMod.default({ wisp: wispUrl() });
        const controller = new Controller({
          serviceworker: sw,
          transport: transportClient,
          config: {
            prefix: '/service/scramjet/',
            scramjetPath: '/scram/scramjet.js',
            injectPath: '/controller/controller.inject.js',
            wasmPath: '/scram/scramjet.wasm'
          },
          scramjetConfig: { flags: { captureErrors: false } }
        });
        await controller.wait();
        startHeartbeat(sw, controller);
        return { controller };
      }),
      attach(iframe, controller) {
        const frame = controller.createFrame(iframe, {});
        // each frame carries its own sub-prefix — expose the decoder for the URL bar
        frame.decode = (href) => globalThis.$scramjet.unrewriteUrl(href, frame.context);
        return frame;
      },
      go(frame, url) { frame.go(url); }
    },
    ultraviolet: {
      label: 'Ultraviolet',
      desc: 'Slower to start, better on heavy pages.',
      ready: once(async () => {
        await script('/uv/uv.bundle.js');
        await script('/uv.config.js');
        await registerSW('/uv.sw.js', '/service/uv/');
        const { BareMuxConnection } = await import('/baremux/index.mjs');
        if (!window.bareMuxConnection) {
          window.bareMuxConnection = new BareMuxConnection('/baremux/worker.js');
        }
        await window.bareMuxConnection.setTransport(TRANSPORTS[transport].path, [{ wisp: wispUrl() }]);
        return {};
      }),
      attach(iframe) { return iframe; },
      go(frame, url) { frame.src = '/service/uv/' + window.__uv$config.encodeUrl(url); }
    }
  };

  function once(fn) {
    let p;
    return () => (p ??= fn());
  }

  let transport = H.util.storage.get('hurlo:proxy-transport:v1', 'epoxy') in TRANSPORTS ? H.util.storage.get('hurlo:proxy-transport:v1', 'epoxy') : 'epoxy';
  let engine = 'scramjet';
  let ready = null;   // { controller } for scramjet, {} for uv
  let frame = null;   // scramjet frame handle (or the uv iframe itself)
  let iframe = null;

  function engineMeta() {
    return ENGINES[engine];
  }

  async function launch(url) {
    setBusy(true);
    status('Starting ' + engineMeta().label + '…', true);
    try {
      ready = await engineMeta().ready();
    } catch (e) {
      setBusy(false);
      status('Failed to start — ' + e.message, false, true);
      showError(e);
      return;
    }
    setBusy(false);
    status(engineMeta().label + ' ready', false, false, true);

    /* swap the viewport content for the browsing iframe */
    viewport.innerHTML = '';
    iframe = el('iframe', {
      class: 'proxy-iframe', title: 'Proxied page',
      allow: 'fullscreen; autoplay; clipboard-read; clipboard-write',
      allowfullscreen: 'true'
    });
    viewport.append(iframe);
    showIframe(true);

    if (engine === 'scramjet') {
      frame = engineMeta().attach(iframe, ready.controller);
      ENGINES.scramjet.go(frame, url);
    } else {
      frame = engineMeta().attach(iframe);
      ENGINES.ultraviolet.go(frame, url);
    }
    currentUrl = url;
    input.value = url;
    pollUrl();
  }

  function navigate(url) {
    if (!ready) return launch(url);
    currentUrl = url;
    input.value = url;
    if (engine === 'scramjet' && frame) ENGINES.scramjet.go(frame, url);
    else if (iframe) ENGINES.ultraviolet.go(frame, url);
  }

  /* current-page readout: proxied pages are same-origin under the SW prefix,
     so the iframe location is readable — poll like arsenic's Frame does */
  let currentUrl = '';
  let pollTimer = 0;
  function pollUrl() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!iframe || !iframe.isConnected) return clearInterval(pollTimer);
      try {
        const href = iframe.contentWindow.location.href;
        if (engine === 'ultraviolet' && window.__uv$config && href.startsWith(location.origin + '/service/uv/')) {
          const decoded = window.__uv$config.decodeUrl(href.slice((location.origin + '/service/uv/').length));
          if (decoded) currentUrl = decoded;
        } else if (engine === 'scramjet' && frame?.decode) {
          try { currentUrl = frame.decode(href) || currentUrl; } catch { /* mid-navigation */ }
        }
      } catch { /* cross-origin (site opted out of the SW) — keep last known */ }
    }, 800);
  }

  /* ---- page ---- */

  let viewport, input, statusEl, launchBtn, consoleEl;

  function toggleFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; }
    (consoleEl || viewport).requestFullscreen().catch(function () {
      H.ui.toast({ type: 'warn', msg: 'Fullscreen was blocked by the browser' });
    });
  }

  function status(text, busy, error, ok) {
    statusEl.querySelector('.s-text').textContent = text;
    statusEl.className = 'proxy-status' + (busy ? ' is-checking' : '') + (ok ? ' is-ready' : '');
  }
  function setBusy(b) { launchBtn.classList.toggle('is-loading', b); input.readOnly = b; }
  function showIframe(inFrame) {
    viewport.classList.toggle('is-browsing', inFrame);
  }
  function showError(e) {
    viewport.innerHTML = '';
    viewport.append(el('div', { class: 'proxy-state' },
      el('div', { class: 'p-icon', html: H.ui.icon('cloud-off') }),
      el('h4', null, 'The proxy couldn\'t start'),
      el('p', null, e.message || 'Unexpected error.'),
      el('div', { class: 'state-actions' },
        el('button', { class: 'btn btn--ghost', onClick: () => H.router.reRender() }, 'Reload page'))));
  }

  function render(view) {
    /* a URL handed over from the home search bar launches immediately */
    const handed = H.util.storage.get('hurlo:proxy-url:v1', '');
    H.util.storage.remove('hurlo:proxy-url:v1');

    statusEl = el('span', { class: 'proxy-status', role: 'status' },
      el('span', { class: 's-dot' }), el('span', { class: 's-text' }, 'Offline'));

    input = el('input', {
      class: 'field-input', type: 'text', inputmode: 'url', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'search or enter url…', 'aria-label': 'Web address', value: handed
    });

    launchBtn = el('button', { class: 'btn btn--primary', type: 'submit' }, ic('zap'), 'Open');

    const form = el('form', { class: 'proxy-form', novalidate: true },
      el('div', { class: 'field' }, ic('globe'), input),
      launchBtn
    );

    viewport = el('div', { class: 'proxy-viewport', 'aria-live': 'polite' });
    consoleEl = el('section', { class: 'proxy-console' },
      el('div', { class: 'proxy-bar' },
        el('span', { style: { fontSize: '0.8rem', fontWeight: 500 } }, 'Relay'),
        el('span', { class: 'proxy-bar-actions' },
          el('button', {
            class: 'icon-btn', 'aria-label': 'Toggle fullscreen', title: 'Fullscreen',
            onClick: toggleFullscreen
          }, el('span', { html: H.ui.icon('expand'), 'aria-hidden': 'true' }))),
        statusEl),
      el('div', { class: 'proxy-body' },
        form,
        el('div', { class: 'chip-row', style: { marginTop: '12px' }, role: 'group', 'aria-label': 'Engine' },
          engineChip('scramjet'), engineChip('ultraviolet'),
          el('span', { class: 'fs-sep', 'aria-hidden': 'true' }, '/'),
          transportChip('epoxy'), transportChip('libcurl')),
        viewport
      )
    );

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = resolve(input.value);
      if (!url) { H.ui.toast({ type: 'warn', msg: 'Enter an address' }); return; }
      navigate(url);
    });

    view.append(el('div', { class: 'proxy-wrap page' },
      el('header', { class: 'proxy-head' },
        el('h1', null, 'Proxy'),
        el('span', { class: 'section-sub' }, 'browse through Hurlo')),
      consoleEl
    ));

    if (handed.trim()) {
      const url = resolve(handed);
      if (url) launch(url);
    } else {
      viewport.append(el('div', { class: 'proxy-state' },
        el('div', { class: 'p-icon', html: H.ui.icon('globe') }),
        el('h4', null, 'Nothing open'),
        el('p', null, 'Enter an address above and it opens through the relay — pages load right here, under the hood.'),
        el('div', { class: 'proxy-examples', role: 'group', 'aria-label': 'Example addresses' },
          ['wikipedia.org', 'example.com'].map((x) => el('button', {
            class: 'chip', 'aria-label': `Use example ${x}`,
            onClick: () => { input.value = x; navigate(resolve(x)); }
          }, x)))));
    }

    /* prewarm the selected engine so the first navigation is quick */
    engineMeta().ready().then(
      () => status(engineMeta().label + ' ready', false, false, true),
      () => status('Engine unavailable — serve over http(s)', false, true)
    );

    return () => clearInterval(pollTimer);

    function engineChip(id) {
      return el('button', {
        class: 'chip' + (engine === id ? ' is-active' : ''),
        'aria-pressed': String(engine === id),
        title: ENGINES[id].desc,
        onClick: (e) => {
          if (engine === id) return;
          engine = id;
          [...e.currentTarget.parentNode.querySelectorAll('.chip')].forEach((c) => c.classList.remove('is-active'));
          e.currentTarget.classList.add('is-active');
          H.ui.toast({ type: 'ok', msg: 'Engine: ' + ENGINES[id].label });
          if (currentUrl && iframe) { ready = null; launch(currentUrl); }
        }
      }, ENGINES[id].label);
    }

    function transportChip(id) {
      return el('button', {
        class: 'chip' + (transport === id ? ' is-active' : ''),
        'aria-pressed': String(transport === id),
        title: TRANSPORTS[id].desc,
        onClick: () => {
          if (transport === id) return;
          H.util.storage.set('hurlo:proxy-transport:v1', id);
          // the running controller holds the old transport — reload for a clean switch
          location.reload();
        }
      }, TRANSPORTS[id].label);
    }

    function engineChip(id) {
      return el('button', {
        class: 'chip' + (engine === id ? ' is-active' : ''),
        'aria-pressed': String(engine === id),
        title: ENGINES[id].desc,
        onClick: (e) => {
          if (engine === id) return;
          engine = id;
          [...e.currentTarget.parentNode.querySelectorAll('.chip')].forEach((c) => c.classList.remove('is-active'));
          e.currentTarget.classList.add('is-active');
          H.ui.toast({ type: 'ok', msg: 'Engine: ' + ENGINES[id].label });
          if (currentUrl && iframe) { ready = null; launch(currentUrl); }
        }
      }, ENGINES[id].label);
    }

    function transportChip(id) {
      return el('button', {
        class: 'chip' + (transport === id ? ' is-active' : ''),
        'aria-pressed': String(transport === id),
        title: TRANSPORTS[id].desc,
        onClick: () => {
          if (transport === id) return;
          H.util.storage.set('hurlo:proxy-transport:v1', id);
          // the running controller holds the old transport — reload for a clean switch
          location.reload();
        }
      }, TRANSPORTS[id].label);
    }

    function exitRow() {
      /* optional external wisp exit — sites that are unreachable from this
         network need a relay running outside it */
      const saved = H.util.storage.get('hurlo:wisp-exit:v1', '');
      const input = el('input', {
        class: 'field-input', type: 'text', placeholder: 'wisp exit url (optional) — e.g. wss://your-server/wisp/',
        'aria-label': 'External wisp exit URL', value: saved, spellcheck: 'false'
      });
      input.addEventListener('change', () => {
        const v = input.value.trim();
        if (v) H.util.storage.set('hurlo:wisp-exit:v1', v);
        else H.util.storage.remove('hurlo:wisp-exit:v1');
        H.ui.toast({ type: 'ok', msg: 'Wisp exit saved — reloading' });
        setTimeout(() => location.reload(), 900);
      });
      return el('div', { class: 'exit-row' },
        el('span', { class: 'exit-label' }, 'Exit'),
        el('div', { class: 'field', style: { flex: 1 } }, input));
    }
  }

  H.pages = H.pages || {};
  H.pages.proxy = { render };
})(window.Hurlo = window.Hurlo || {});
