/* Gn-Math — Settings: one narrow column, previews, no descriptions */
(function (H) {
  'use strict';
  const { el } = H.util;
  const S = () => H.settings.get();

  const THEMES = [
    { id: 'midnight-voltage', name: 'Midnight Voltage', bg: '#08080c', surface: '#0e0e14', primary: '#e9e9ee', secondary: '#8f8fa3', accent: '#b7a6ff' },
    { id: 'arctic-pulse', name: 'Arctic Pulse', bg: '#e9edf3', surface: '#f7f9fb', primary: '#1a1d24', secondary: '#5a6472', accent: '#3565d6', light: true },
    { id: 'solar-flare', name: 'Solar Flare', bg: '#0e0b08', surface: '#16110c', primary: '#ece5da', secondary: '#a89880', accent: '#f0a35a' },
    { id: 'velvet-horizon', name: 'Velvet Horizon', bg: '#120e13', surface: '#1a141d', primary: '#ece2ec', secondary: '#a894a8', accent: '#e39ab4' },
    { id: 'neon-current', name: 'Neon Current', bg: '#050507', surface: '#0b0b10', primary: '#eceaf4', secondary: '#8f8fa8', accent: '#f65fa8' },
    { id: 'obsidian-bloom', name: 'Obsidian Bloom', bg: '#0a0d0c', surface: '#101413', primary: '#e5ebe7', secondary: '#8fa098', accent: '#5fd9a4' },
    { id: 'aurora-circuit', name: 'Aurora Circuit', bg: '#060a13', surface: '#0c111d', primary: '#e4eaf4', secondary: '#8494b3', accent: '#6fd08c' },
    { id: 'crimson-drift', name: 'Crimson Drift', bg: '#0d0a0b', surface: '#151011', primary: '#ede4e5', secondary: '#a89195', accent: '#ef6a7a' }
  ];

  function render(view) {
    view.append(el('div', { class: 'settings-wrap page' },
      el('header', { class: 'settings-head' },
        el('h1', null, 'Settings')),
      el('section', { class: 'settings-card' }, themeGallery()),
      el('section', { class: 'settings-card' },
        el('h3', null, 'Appearance'),
        row('Density', segmented(['compact', 'comfortable', 'cozy'], ['Compact', 'Comfortable', 'Cozy'], S().density, (v) => H.settings.set({ density: v }))),
        row('Reduced motion', switchEl(S().reducedMotion, 'Reduced motion', (on) => {
          H.settings.set({ reducedMotion: on });
          H.ui.toast({ type: 'ok', msg: on ? 'Reduced motion on' : 'Reduced motion off' });
        }))
      ),
      colorsCard(),
      backgroundCard(),
      el('section', { class: 'settings-card' },
        el('h3', null, 'Proxy'),
        row('Default engine', segmented(['scramjet', 'ultraviolet'], ['Scramjet v2', 'Ultraviolet'], S().defaultEngine, function (v) {
          H.settings.set({ defaultEngine: v });
          H.ui.toast({ type: 'ok', msg: 'Engine: ' + (v === 'scramjet' ? 'Scramjet v2' : 'Ultraviolet') });
        }))
      ),
      cloakCard(),
      el('section', { class: 'settings-card' }, advancedCard())
    ));
  }

  function colorsCard() {
    const c = S();
    const accent = el('input', { type: 'color', class: 'color-input', value: c.accentColor || '#b7a6ff', 'aria-label': 'Accent color' });
    const bg = el('input', { type: 'color', class: 'color-input', value: c.bgColor || '#08080c', 'aria-label': 'Background color' });
    accent.addEventListener('input', function () { H.settings.set({ accentColor: accent.value }); });
    bg.addEventListener('input', function () { H.settings.set({ bgColor: bg.value }); });
    return el('section', { class: 'settings-card' },
      el('h3', null, 'Colors'),
      row('Accent', colorWrap(accent, c.accentColor, 'var(--accent)')),
      row('Background', colorWrap(bg, c.bgColor, 'var(--bg)')),
      row('Reset colors',
        el('button', {
          class: 'btn btn--sm',
          onClick: function () {
            H.settings.set({ accentColor: '', bgColor: '' });
            accent.value = '#b7a6ff';
            bg.value = '#08080c';
            H.ui.toast({ type: 'ok', msg: 'Colors reset' });
          }
        }, 'Reset'))
    );
  }

  function colorWrap(input, current, fallback) {
    input.style.background = current || fallback;
    input.addEventListener('input', function () { input.style.background = input.value; });
    return input;
  }

  function backgroundCard() {
    return el('section', { class: 'settings-card' },
      el('h3', null, 'Background'),
      row('Style', segmented(['storm', 'gradient', 'stars', 'solid'], ['Storm', 'Gradient', 'Stars', 'Solid'], S().bgStyle, function (v) {
        H.settings.set({ bgStyle: v });
      }))
    );
  }

  function cloakCard() {
    const c = S().cloak || { id: 'off', title: '', icon: '' };
    const presets = H.cloak.PRESETS;
    const row0 = el('div', { class: 'chip-row' });
    const inputsWrap = el('div', { class: 'setting-row setting-row--stack', style: { borderTop: 'none', paddingTop: '0' } });
    const titleInput = el('input', {
      class: 'field-input', type: 'text', placeholder: 'Tab name (e.g. Google Classroom)',
      'aria-label': 'Custom tab name', value: c.title || ''
    });
    const iconInput = el('input', {
      class: 'field-input', type: 'text', inputmode: 'url', placeholder: 'Icon URL (favicon)',
      'aria-label': 'Custom tab icon URL', value: c.icon || ''
    });
    inputsWrap.append(
      el('div', { class: 's-control', style: { width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' } },
        titleInput, iconInput));

    function syncInputs() {
      inputsWrap.style.display = (S().cloak || {}).id === 'custom' ? '' : 'none';
    }

    for (const [id, preset] of Object.entries(presets)) {
      row0.append(el('button', {
        class: 'chip' + (c.id === id ? ' is-active' : ''),
        'aria-pressed': String(c.id === id),
        onClick: (e) => {
          [...row0.children].forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.classList.remove('is-active'); });
          e.currentTarget.setAttribute('aria-pressed', 'true');
          e.currentTarget.classList.add('is-active');
          H.settings.set({ cloak: { id, title: c.title || '', icon: c.icon || '' } });
          syncInputs();
          H.ui.toast({ type: 'ok', msg: id === 'off' ? 'Cloaking off' : 'Tab disguise: ' + preset.label });
        }
      }, preset.label));
    }

    const commit = H.util.debounce(() => {
      H.settings.set({ cloak: { id: 'custom', title: titleInput.value, icon: iconInput.value } });
    }, 350);
    titleInput.addEventListener('input', commit);
    iconInput.addEventListener('input', commit);

    const wrap = el('section', { class: 'settings-card' },
      el('h3', null, 'Cloaking'),
      row('Tab disguise', row0, true),
      inputsWrap
    );
    syncInputs();
    return wrap;
  }

  function themeGallery() {
    const gallery = el('div', { class: 'theme-gallery', role: 'group', 'aria-label': 'Theme' });
    function syncPressed() {
      const cur = S().theme;
      [...gallery.children].forEach((card) => card.setAttribute('aria-pressed', String(card.dataset.theme === cur)));
    }
    for (const t of THEMES) {
      gallery.append(el('button', {
        class: 'theme-card', 'data-theme': t.id, 'aria-pressed': String(S().theme === t.id),
        'aria-label': `Theme ${t.name}`,
        onClick: () => {
          if (S().theme === t.id) return;
          H.settings.set({ theme: t.id });
          syncPressed();
          H.ui.toast({ type: 'ok', msg: t.name });
        }
      },
        el('span', { class: 'theme-preview', style: { background: t.bg }, 'aria-hidden': 'true' },
          el('span', { class: 'tp-bar', style: { background: t.primary, opacity: 0.85 } }),
          el('span', { class: 'tp-dots' },
            el('i', { style: { background: t.accent } }),
            el('i', { style: { background: t.secondary, opacity: 0.5 } })),
          el('span', { class: 'tp-block', style: { background: t.surface, border: `1px solid ${t.secondary}44` } })),
        el('span', { class: 'theme-name' }, t.name,
          el('span', { class: 'theme-check', html: H.ui.icon('check') }))
      ));
    }
    return gallery;
  }

  function advancedCard() {
    return el('section', { class: 'settings-card' },
      el('h3', null, 'Advanced'),
      row('Reset settings',
        el('button', {
          class: 'btn btn--sm',
          onClick: () => H.ui.confirm({
            title: 'Reset all settings?',
            body: 'Every preference returns to its default. Favorites and history are kept.',
            confirmLabel: 'Reset', danger: true,
            onConfirm: () => H.settings.reset()
          })
        }, 'Reset')),
      row('Clear saved data',
        el('button', {
          class: 'btn btn--sm',
          onClick: () => H.ui.confirm({
            title: 'Clear favorites & history?',
            body: 'Favorites and recently-played are removed from this browser. Settings are kept.',
            confirmLabel: 'Clear', danger: true,
            onConfirm: () => {
              H.util.storage.remove('hurlo:favs:v1');
              H.util.storage.remove('hurlo:recents:v1');
              H.ui.toast({ type: 'ok', msg: 'Cleared' });
              H.router.reRender();
            }
          })
        }, 'Clear'))
    );
  }

  function row(title, control, stacked) {
    return el('div', { class: 'setting-row' + (stacked ? ' setting-row--stack' : '') },
      el('div', { class: 's-label' }, el('div', { class: 's-title' }, title)),
      el('div', { class: 's-control' }, control)
    );
  }

  function switchEl(checked, ariaLabel, onChange) {
    const input = el('input', { type: 'checkbox', 'aria-label': ariaLabel });
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { class: 'switch' }, input, el('span', { class: 'switch-track' }), el('span', { class: 'switch-thumb' }));
  }

  function segmented(values, labels, current, onPick) {
    const wrap = el('div', { class: 'segmented', role: 'group' });
    values.forEach((v, i) => {
      const b = el('button', {
        'aria-pressed': String(current === v),
        onClick: () => {
          [...wrap.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          onPick(v);
        }
      }, labels[i]);
      wrap.append(b);
    });
    return wrap;
  }

  H.pages = H.pages || {};
  H.pages.settings = { render };
})(window.Hurlo = window.Hurlo || {});
