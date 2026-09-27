/* Hurlo — settings store (theme, motion, density, gameplay, accessibility) */
(function (H) {
  'use strict';
  const { storage } = H.util;

  const DEFAULTS = {
    theme: 'midnight-voltage',
    density: 'comfortable',      // compact | comfortable | cozy
    motionScale: 1,              // 0 .. 1.5
    reducedMotion: false,        // manual override honoring prefers-reduced-motion
    autoFullscreen: false,       // request fullscreen as soon as a game opens
    cloak: { id: 'off', title: '', icon: '' }  // tab disguise preset
  };

  const KEY = 'hurlo:settings:v1';
  const listeners = new Set();
  let state = Object.assign({}, DEFAULTS, clean(storage.get(KEY, {})));

  function clean(s) {
    const out = {};
    for (const [k, v] of Object.entries(s)) {
      if (k in DEFAULTS && v != null) out[k] = v;
    }
    return out;
  }

  function persist() { storage.set(KEY, state); }

  function apply() {
    const root = document.documentElement;
    root.setAttribute('data-theme', state.theme);
    root.setAttribute('data-density', state.density);
    const motion = state.reducedMotion ? 0 : state.motionScale;
    root.style.setProperty('--motion', Math.max(0, Math.min(1.5, motion)));

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
