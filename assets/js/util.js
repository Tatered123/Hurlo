/* Hurlo — shared utilities */
(function (H) {
  'use strict';

  H.util = {
    /** Create an element with props/children: el('div', {class: 'x', onClick: fn}, kids...) */
    el(tag, props, ...children) {
      const node = document.createElement(tag);
      if (props) {
        for (const [k, v] of Object.entries(props)) {
          if (v == null || v === false) continue;
          if (k === 'class') node.className = v;
          else if (k === 'dataset') Object.assign(node.dataset, v);
          else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
          else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
          else if (k === 'html') node.innerHTML = v; // trusted, app-internal markup only
          else if (v === true) node.setAttribute(k, '');
          else node.setAttribute(k, String(v));
        }
      }
      for (const c of children.flat()) {
        if (c == null || c === false) continue;
        node.append(c.nodeType ? c : document.createTextNode(c));
      }
      return node;
    },

    frag(...children) {
      const f = document.createDocumentFragment();
      f.append(...children.flat().filter(Boolean));
      return f;
    },

    escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    debounce(fn, ms) {
      let t;
      return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
    },

    /** Deterministic 32-bit hash of a string. */
    hash(s) {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },

    /** Curated storm-tile palettes — cohesive family, no wild hues. */
    PALETTES: [
      { a: '#31365f', b: '#131633', glow: 'rgba(172,172,250,0.55)', s: '#a2a8ff' },
      { a: '#3d2d6b', b: '#1c1436', glow: 'rgba(196,166,255,0.5)', s: '#bfa4ff' },
      { a: '#1a4c5c', b: '#0e2b36', glow: 'rgba(126,214,230,0.48)', s: '#8ad4e2' },
      { a: '#293d52', b: '#141f2c', glow: 'rgba(158,196,232,0.48)', s: '#9ec4ec' },
      { a: '#523222', b: '#2b1912', glow: 'rgba(242,170,124,0.46)', s: '#f0b088' },
      { a: '#2a4a36', b: '#152a1c', glow: 'rgba(146,218,166,0.45)', s: '#96d8a8' },
      { a: '#4f2d52', b: '#281528', glow: 'rgba(232,154,222,0.46)', s: '#e8a2dc' },
      { a: '#242e5c', b: '#101431', glow: 'rgba(148,166,250,0.5)', s: '#9aa6ff' }
    ],

    paletteFor(uid) {
      return H.util.PALETTES[H.util.hash(uid) % H.util.PALETTES.length];
    },

    /** Day-stable pseudo-random index in [0, n) — for "featured today" picks. */
    dailyIndex(key, n, offset) {
      if (n <= 0) return 0;
      const d = new Date();
      const day = Math.floor(d.getTime() / 86400000);
      return (H.util.hash(key) + day * 2654435761 + (offset || 0) * 40503) % n;
    },

    /** Initials for generated card art. */
    initials(title) {
      const words = String(title).trim().split(/\s+/).filter(Boolean);
      if (!words.length) return '?';
      if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    },

    formatNumber(n) {
      return n.toLocaleString('en-US');
    },

    relTime(ts) {
      const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
      if (s < 60) return 'just now';
      const m = Math.floor(s / 60);
      if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
      const h = Math.floor(m / 60);
      if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
      const d = Math.floor(h / 24);
      return d + (d === 1 ? ' day ago' : ' days ago');
    },

    /** Store JSON safely; returns default when storage is unavailable. */
    storage: {
      get(key, fallback) {
        try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
        catch { return fallback; }
      },
      set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch { return false; }
      },
      remove(key) { try { localStorage.removeItem(key); } catch { /* noop */ } }
    }
  };
})(window.Hurlo = window.Hurlo || {});
