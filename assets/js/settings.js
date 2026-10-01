/* Hurlo — settings store (theme, motion, density, gameplay, accessibility) */
(function (H) {
  'use strict';
  const { storage } = H.util;

  const DEFAULTS = {
    theme: 'midnight-voltage',
    density: 'comfortable',      // compact | comfortable | cozy
    motionScale: 1,              // 0 .. 1.5
    reducedMotion: false,        // manual override honoring prefers-reduced-motion
    cloak: { id: 'off', title: '', icon: '' },  // tab disguise preset
    bgStyle: 'storm',            // storm | gradient | stars | solid
    accentColor: '',             // '' = theme default, else hex
    bgColor: '',                 // '' = theme default, else hex
    defaultEngine: 'scramjet',   // scramjet | ultraviolet
    clock24: false
  };

  const KEY = 'hurlo:settings:v1';
  const listeners = new Set();
  let state = Object.assign({}, DEFAULTS, clean(storage.get(KEY, {})));
  const bgMigrate = { ambient: 'gradient', off: 'solid' };
  if (bgMigrate[state.bgStyle]) state.bgStyle = bgMigrate[state.bgStyle];

  function clean(s) {
    const out = {};
    for (const [k, v] of Object.entries(s)) {
      if (k in DEFAULTS && v != null) out[k] = v;
    }
    return out;
  }

  function persist() { storage.set(KEY, state); }

  function lighten(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * amt)));
    const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function apply() {
    const root = document.documentElement;
    root.setAttribute('data-theme', state.theme);
    root.setAttribute('data-density', state.density);
    root.setAttribute('data-bg', state.bgStyle);
    const motion = state.reducedMotion ? 0 : state.motionScale;
    root.style.setProperty('--motion', Math.max(0, Math.min(1.5, motion)));

    // visitor-tinted colors sit on top of the theme
    if (state.accentColor) {
      root.style.setProperty('--accent', state.accentColor);
      root.style.setProperty('--focus', state.accentColor);
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--focus');
    }
    if (state.bgColor) {
      root.style.setProperty('--bg', state.bgColor);
      root.style.setProperty('--bg-elev', lighten(state.bgColor, 0.35));
      root.style.setProperty('--surface', lighten(state.bgColor, 0.5));
      root.style.setProperty('--surface-2', lighten(state.bgColor, 0.65));
    } else {
      root.style.removeProperty('--bg');
      root.style.removeProperty('--bg-elev');
      root.style.removeProperty('--surface');
      root.style.removeProperty('--surface-2');
    }

    const themeColors = {
      'midnight-voltage': '#08080c', 'arctic-pulse': '#e9edf3', 'solar-flare': '#0e0b08',
      'velvet-horizon': '#120e13', 'neon-current': '#050507', 'obsidian-bloom': '#0a0d0c',
      'aurora-circuit': '#060a13', 'crimson-drift': '#0d0a0b'
    };
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && themeColors[state.theme]) meta.setAttribute('content', themeColors[state.theme]);
  }

  H.settings = {
    DEFAULTS,
    get(key) { return key ? state[key] : Object.assign({}, state); },
    set(patch, silent) {
      const changed = {};
      for (const [k, v] of Object.entries(patch)) {
        if (k in DEFAULTS && state[k] !== v) { state[k] = v; changed[k] = v; }
      }
      if (!Object.keys(changed).length) return;
      persist(); apply();
      if (!silent) listeners.forEach((fn) => fn(changed));
    },
    reset() { state = Object.assign({}, DEFAULTS); persist(); apply(); listeners.forEach((fn) => fn({ reset: true })); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    systemReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
  };

  apply();
})(window.Hurlo = window.Hurlo || {});
