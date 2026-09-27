/* Hurlo — tab cloaking.
 *
 * Disguises the tab (title + favicon) and any cloaked window opened from the
 * site (about:blank / blob: / per-game windows) using the same disguise.
 * Presets live here; the custom variant stores its own title/icon in settings.
 */
(function (H) {
  'use strict';

  const DEFAULT_ICON = 'assets/img/favicon.svg';
  const DEFAULT_WINDOW_TITLE = 'Home';

  const PRESETS = {
    off: { label: 'Off' },
    classroom: {
      label: 'Google Classroom', title: 'Classes',
      icon: 'https://www.google.com/s2/favicons?domain=classroom.google.com&sz=64'
    },
    newtab: {
      label: 'Chrome New Tab', title: 'New Tab',
      icon: 'https://www.google.com/s2/favicons?domain=google.com&sz=64'
    },
    canvas: {
      label: 'Canvas', title: 'Dashboard',
      icon: 'https://www.google.com/s2/favicons?domain=instructure.com&sz=64'
    },
    drive: {
      label: 'Google Drive', title: 'My Drive',
      icon: 'https://www.google.com/s2/favicons?domain=drive.google.com&sz=64'
    },
    docs: {
      label: 'Google Docs', title: 'Home',
      icon: 'https://www.google.com/s2/favicons?domain=docs.google.com&sz=64'
    },
    custom: { label: 'Custom' }
  };

  function resolved() {
    const c = H.settings.get('cloak') || { id: 'off' };
    if (c.id === 'custom') {
      const title = (c.title || '').trim() || DEFAULT_WINDOW_TITLE;
      const icon = (c.icon || '').trim() || DEFAULT_ICON;
      return { title, icon, windowTitle: title, windowIcon: icon };
    }
    const p = PRESETS[c.id] || PRESETS.off;
    if (c.id === 'off') {
      return { title: 'Hurlo', icon: DEFAULT_ICON, windowTitle: DEFAULT_WINDOW_TITLE, windowIcon: DEFAULT_ICON };
    }
    return { title: p.title, icon: p.icon, windowTitle: p.title, windowIcon: p.icon };
  }

  function apply() {
    const r = resolved();
    document.title = r.title;
    const link = document.querySelector('link[rel="icon"]');
    if (link) link.setAttribute('href', r.icon);
  }

  H.cloak = { PRESETS, DEFAULT_ICON, DEFAULT_WINDOW_TITLE, resolved, apply };
  if (H.settings) {
    H.settings.onChange((changed) => { if (changed.cloak) apply(); });
    apply();
  }
})(window.Hurlo = window.Hurlo || {});
