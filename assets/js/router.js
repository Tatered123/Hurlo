/* Hurlo — hash router with animated page transitions */
(function (H) {
  'use strict';

  const routes = [];
  let currentCleanup = null;
  let pendingTimer = null;
  let lastHash = null;

  function addRoute(pattern, handler) {
    // pattern like '#/play/:uid' → matcher + param names
    const names = [];
    const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$');
    routes.push({ rx, names, handler });
  }

  function prefersReduced() {
    return H.settings.get('reducedMotion') || H.settings.systemReducedMotion.matches;
  }

  function render() {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }

    const hash = location.hash || '#/';
    if (hash === '#') return location.replace('#/');

    H.router.prev = (lastHash && lastHash !== hash) ? lastHash : H.router.prev;
    lastHash = hash;

    if (currentCleanup) { try { currentCleanup(); } catch { /* noop */ } currentCleanup = null; }
    H.ui.closeModal();

    const view = document.getElementById('view');
    const page = view.firstElementChild;
    const mount = () => mountRoute(hash, view);

    if (page && H.settings.get('motionScale') > 0 && !prefersReduced()) {
      page.classList.add('page-leave');
      pendingTimer = setTimeout(() => { pendingTimer = null; mount(); }, 110);
    } else {
      mount();
    }
  }

  function mountRoute(hash, view) {
    for (const r of routes) {
      const m = hash.match(r.rx);
      if (m) {
        const params = {};
        r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
        view.innerHTML = '';
        view.className = 'view';
        currentCleanup = r.handler(params, view) || null;
        updateNav(hash);
        return;
      }
    }
    location.replace('#/');
  }

  function updateNav(hash) {
    const parts = hash.slice(1).split('/').filter(Boolean);
    const base = parts.length ? '#/' + parts[0] : '#/';
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.getAttribute('href') === base) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  H.router = {
    addRoute,
    prev: null,
    start() {
      window.addEventListener('hashchange', render);
      render();
    },
    go(path) { if (location.hash === path) render(); else location.hash = path; },
    reRender: render
  };
})(window.Hurlo = window.Hurlo || {});
