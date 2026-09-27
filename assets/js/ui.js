/* Hurlo — UI kit: icons, logo, toasts, modals, game cards */
(function (H) {
  'use strict';
  const { el, escapeHtml } = H.util;

  /* ---- icon set (24px, stroke-based, round caps) ---- */
  const PATHS = {
    home: '<path d="M3 11.2 12 3l9 8.2"/><path d="M5.4 9.8V21h5.1v-5.4h3V21h5.1V9.8"/>',
    grid: '<rect x="3.6" y="3.6" width="7.2" height="7.2" rx="2"/><rect x="13.2" y="3.6" width="7.2" height="7.2" rx="2"/><rect x="3.6" y="13.2" width="7.2" height="7.2" rx="2"/><rect x="13.2" y="13.2" width="7.2" height="7.2" rx="2"/>',
    gear: '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14.4 14.4 0 0 1 0 18 14.4 14.4 0 0 1 0-18z"/>',
    play: '<path d="M8 5.4v13.2a.6.6 0 0 0 .92.5l10.3-6.6a.6.6 0 0 0 0-1L8.92 4.9a.6.6 0 0 0-.92.5z" fill="currentColor" stroke="none"/>',
    heart: '<path d="M12 20.3s-7.4-4.6-9.4-9A5.3 5.3 0 0 1 12 6.6a5.3 5.3 0 0 1 9.4 4.7c-2 4.4-9.4 9-9.4 9z"/>',
    refresh: '<path d="M21 4.5V10h-5.5"/><path d="M20.5 10a8.5 8.5 0 1 0 .9 5"/>',
    expand: '<path d="M8.5 3.5H5.5a2 2 0 0 0-2 2v3"/><path d="M15.5 3.5h3a2 2 0 0 1 2 2v3"/><path d="M8.5 20.5H5.5a2 2 0 0 1-2-2v-3"/><path d="M15.5 20.5h3a2 2 0 0 0 2-2v-3"/>',
    'arrow-left': '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.8-4.8"/>',
    x: '<path d="M17.5 6.5l-11 11M6.5 6.5l11 11"/>',
    check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
    dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.6" cy="8.6" r="1.15" fill="currentColor" stroke="none"/><circle cx="15.4" cy="8.6" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="8.6" cy="15.4" r="1.15" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.15" fill="currentColor" stroke="none"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6.8V12l3.4 2"/>',
    sparkles: '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="M18.6 15.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
    'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
    'arrow-up-right': '<path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10.2v4"/><circle cx="12" cy="16.8" r="0.4" fill="currentColor"/>',
    'cloud-off': '<path d="M4 4 20 20"/><path d="M17.5 17.5H7a4.2 4.2 0 0 1-.8-8.3 6 6 0 0 1 1.9-3.2"/><path d="M10 5.3a6 6 0 0 1 9 5.2 3.8 3.8 0 0 1 2.6 3.4"/>',
    zap: '<path d="M13 2.5 4 13.5h6.5l-1 8 9.5-11h-6.5z"/>',
    external: '<path d="M14 3.5h6.5V10"/><path d="M20 4 10.5 13.5"/><path d="M19 13.5v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.2"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/>',
    layers: '<path d="m12 2.8 9.2 4.6L12 12 2.8 7.4z"/><path d="m2.8 12 9.2 4.6 9.2-4.6"/><path d="m2.8 16.6 9.2 4.6 9.2-4.6"/>',
    gamepad: '<path d="M7.4 6.5h9.2a5.4 5.4 0 0 1 5.3 6.4l-.8 4a3.6 3.6 0 0 1-6.4 1.5L13.6 17h-3.2l-1.1 1.4a3.6 3.6 0 0 1-6.4-1.5l-.8-4a5.4 5.4 0 0 1 5.3-6.4z"/><path d="M7.8 10.4v3.2M6.2 12h3.2"/><circle cx="15.6" cy="11" r="0.6" fill="currentColor"/><circle cx="17.8" cy="13" r="0.6" fill="currentColor"/>',
    trash: '<path d="M3.5 6.5h17"/><path d="M8.5 6.5v-2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2"/><path d="m6 6.5 1 13a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4l1-13"/><path d="M10 10.5v6M14 10.5v6"/>',
    activity: '<path d="M22 12h-4.2l-2.8 7.5-5.9-15-2.9 7.5H2.5"/>',
    monitor: '<rect x="2.8" y="4" width="18.4" height="12.6" rx="2.4"/><path d="M8.5 20.5h7M12 16.6v3.9"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.4"/><path d="M6.3 10h.1M9.7 10h.1M13.1 10h.1M16.5 10h.1M6.3 13.6h.1M16.5 13.6h.1M9 13.6h6"/>',
    shield: '<path d="M12 2.8 4.5 5.9v5.4c0 4.6 3.2 8 7.5 9.9 4.3-1.9 7.5-5.3 7.5-9.9V5.9z"/><path d="m8.8 11.8 2.3 2.3 4.1-4.6"/>',
    library: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H9a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4.5A1.5 1.5 0 0 0 18.5 3H15a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5z"/>',
    folder: '<path d="M3.5 7c0-1.1.9-2 2-2h3.2c.55 0 1.08.23 1.46.63L11.3 6.8h7.2c1.1 0 2 .9 2 2v8.7c0 1.1-.9 2-2 2H5.5c-1.1 0-2-.9-2-2z"/>',
    'chevron-left': '<path d="m14.5 6-6 6 6 6"/>',
    users: '<circle cx="9" cy="8.2" r="3.2"/><path d="M3.5 19.5c0-3 2.5-5.3 5.5-5.3s5.5 2.3 5.5 5.3"/><circle cx="16.8" cy="9.2" r="2.4"/><path d="M16.4 14.4c2.3.3 4.1 2.3 4.1 4.7"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 1.9"/>',
    'shield-check': '<path d="M12 2.8 4.5 5.9v5.4c0 4.6 3.2 8 7.5 9.9 4.3-1.9 7.5-5.3 7.5-9.9V5.9z"/><path d="m8.8 11.8 2.3 2.3 4.1-4.6"/>'
  };

  function icon(name, cls) {
    const d = PATHS[name] || PATHS.info;
    return `<svg ${cls ? `class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }

  let markId = 0;
  /** Hurricane brand mark. */
  function logoSvg(cls) {
    return `<svg ${cls ? `class="${cls}"` : ''} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <g stroke="currentColor" stroke-width="4.4" stroke-linecap="round">
        <path d="M 24 8.5 A 15.5 15.5 0 1 0 39.5 24"/>
        <path d="M 24 17.5 A 6.5 6.5 0 1 1 17.5 24"/>
      </g>
      <circle cx="24" cy="24" r="2.6" fill="currentColor"/>
    </svg>`;
  }

  /** Thin decorative spiral for tile art. */
  function logoSpiral() {
    return `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <g stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <path d="M 24 8.5 A 15.5 15.5 0 1 0 39.5 24"/>
        <path d="M 24 17.5 A 6.5 6.5 0 1 1 17.5 24"/>
      </g>
      <circle cx="24" cy="24" r="2" fill="currentColor"/>
    </svg>`;
  }

  /** Icon as a real DOM <svg> element (safe to pass through el() children). */
  function iconEl(name) {
    const tpl = document.createElement('template');
    tpl.innerHTML = icon(name).trim();
    return tpl.content.firstElementChild;
  }

  function spinner(cls) {
    return `<svg ${cls ? `class="hurlo-spin ${cls}"` : 'class="hurlo-spin"'} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.4" opacity="0.25"/>
      <path d="M 21 12 A 9 9 0 0 0 12 3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`;
  }

  /* ---- toasts ---- */
  function toast(opts) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const { msg, type = 'info', duration = 2600, actionLabel, onAction } = opts;
    const node = el('div', { class: `toast toast--${type}`, role: 'status' },
      el('span', { class: 'toast-icon', html: icon(type === 'ok' ? 'check' : type === 'warn' ? 'alert' : 'info') }),
      el('span', null, msg),
      actionLabel && el('button', { class: 'btn btn--soft btn--sm', onClick: () => { onAction && onAction(); dismiss(); } }, actionLabel)
    );
    stack.append(node);
    let gone = false;
    function dismiss() {
      if (gone) return;
      gone = true;
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 200);
    }
    setTimeout(dismiss, duration);
    node.addEventListener('click', (e) => { if (e.target === node) dismiss(); });
  }

  /* ---- confirm modal ---- */
  let openModal = null;
  function confirmDialog(opts) {
    const { title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm } = opts;
    closeModal();

    const confirmBtn = el('button', { class: danger ? 'btn btn--danger' : 'btn' }, confirmLabel);
    const cancelBtn = el('button', { class: 'btn btn--ghost' }, cancelLabel);
    const dialog = el('div', {
      class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title,
      html: `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>`
    },
      el('div', { class: 'modal-actions' }, cancelBtn, confirmBtn)
    );
    const backdrop = el('div', { class: 'modal-backdrop' }, dialog);
    document.getElementById('modal-root').append(backdrop);
    openModal = backdrop;
    const prevFocus = document.activeElement;

    function close() {
      backdrop.classList.add('leaving');
      setTimeout(() => backdrop.remove(), 160);
      openModal = null;
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === confirmBtn ? cancelBtn : confirmBtn).focus(); }
    }
    confirmBtn.addEventListener('click', () => { close(); onConfirm && onConfirm(); });
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);
    confirmBtn.focus();
  }
  function closeModal() { if (openModal) { openModal.remove(); openModal = null; } }

  /* ---- game card ---- */
  function gameCard(game, lib, opts = {}) {
    const { index = 0 } = opts;
    const fav = H.catalog.isFavorite(game.uid);
    const pal = H.util.paletteFor(game.uid);

    let artWrap;
    if (game.cover) {
      artWrap = el('div', { class: 'game-art game-art--img' },
        el('img', { src: game.cover, alt: '', loading: 'lazy', decoding: 'async' }));
    } else {
      /* procedural storm tile — subtle spiral motif with per-game orientation
         so the wall doesn't look stamped */
      const v = H.util.hash(game.uid) % 4;
      const spiralStyle = { color: pal.s };
      if (v & 1) spiralStyle.transform = 'scaleX(-1)';
      if (v & 2) { spiralStyle.right = 'auto'; spiralStyle.left = '-14px'; spiralStyle.top = 'auto'; spiralStyle.bottom = '-16px'; }
      else { spiralStyle.right = '-14px'; spiralStyle.top = '-16px'; }

      artWrap = el('div', {
        class: 'game-art game-art--tile',
        style: { '--tile-a': pal.a, '--tile-b': pal.b, '--tile-glow': pal.glow, '--tile-s': pal.s }
      },
        el('span', { class: 'tile-spiral', style: spiralStyle, html: logoSpiral(), 'aria-hidden': 'true' }),
        el('span', { class: 'tile-sheen', 'aria-hidden': 'true' }));
    }

    const favBtn = el('button', {
      class: 'fav-btn', 'aria-pressed': String(fav),
      'aria-label': fav ? `Remove ${game.title} from favorites` : `Add ${game.title} to favorites`,
      html: icon('heart'),
      onClick: (e) => {
        e.preventDefault(); e.stopPropagation();
        const now = H.catalog.toggleFavorite(game.uid);
        favBtn.setAttribute('aria-pressed', String(now));
        favBtn.setAttribute('aria-label', now ? `Remove ${game.title} from favorites` : `Add ${game.title} to favorites`);
        favBtn.classList.add('bump');
        setTimeout(() => favBtn.classList.remove('bump'), 300);
        H.ui.toast({ type: now ? 'ok' : 'info', msg: now ? `Added “${game.title}” to favorites` : `Removed “${game.title}” from favorites`, duration: 1800 });
      }
    });

    const veil = el('div', { class: 'game-veil' }, el('span', { class: 'play-orb', html: icon('play') }));

    const anchor = el('a', {
      class: 'game-card', href: `#/play/${game.uid}`,
      'aria-label': `Play ${game.title}`,
      style: { '--card-delay': `${Math.min(index, 14) * 35}ms` }
    },
      artWrap,
      veil,
      favBtn,
      el('div', { class: 'game-body' },
        el('span', { class: 'game-title', title: game.title }, game.title)
      )
    );
    return anchor;
  }

  function skeletonCard() {
    return el('div', { class: 'skeleton', 'aria-hidden': 'true' },
      el('div', { class: 'skeleton-art' }),
      el('div', { class: 'skeleton-line' })
    );
  }

  function emptyState({ iconName = 'search', title, body, actionLabel, onAction }) {
    const node = el('div', { class: 'empty' },
      el('div', { class: 'empty-orb', html: icon(iconName) }),
      el('h3', null, title),
      body && el('p', null, body),
      actionLabel && el('button', { class: 'btn btn--ghost', onClick: onAction }, actionLabel)
    );
    return node;
  }

  H.ui = { icon, iconEl, logoSvg, spinner, toast, confirm: confirmDialog, closeModal, gameCard, skeletonCard, emptyState };
})(window.Hurlo = window.Hurlo || {});
