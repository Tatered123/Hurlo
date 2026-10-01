/* Hurlo — animated hurricane background.
 *
 * A quiet storm seen from above: a vortex of drifting particles spiraling
 * into a glowing eye, layered over slow-rotating cloud arms (CSS) and a
 * vignette that keeps edges dark for readability.
 *
 * Honors reduced motion (draws one static frame) and theme colors via the
 * --vortex-* custom properties defined per colorway.
 */
(function (H) {
  'use strict';

  let canvas, ctx, vw = 0, vh = 0, dpr = 1;
  let particles = [];
  let stars = [];
  let raf = 0;
  let lastT = 0;
  let colors = null;
  let running = false;

  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const get = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
    colors = {
      c1: get('--vortex-1', 'rgba(183,166,255,0.8)'),
      c2: get('--vortex-2', 'rgba(124,196,255,0.45)'),
      eye: get('--vortex-eye', 'rgba(183,166,255,0.12)'),
      star: get('--vortex-star', 'rgba(255,255,255,0.5)')
    };
  }

  function rand(seed) { // deterministic-ish scatter
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function build() {
    const count = Math.min(320, Math.round((vw * vh) / 6800));
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        a: rand(i * 1.7) * Math.PI * 2,
        r: Math.pow(rand(i * 2.3 + 5), 0.72), // normalized 0..1, bias outward
        w: 0.55 + rand(i * 3.1 + 11) * 0.9,   // angular speed factor
        s: 0.7 + rand(i * 4.7 + 3) * 1.5,     // size
        c: rand(i * 5.9 + 7),                  // color mix 0..1
        tw: rand(i * 7.3 + 13) * Math.PI * 2   // twinkle phase
      });
    }
    stars = [];
    const starCount = 90;
    for (let i = 0; i < starCount; i++) {
      stars.push({ x: rand(i * 9.1 + 1), y: rand(i * 11.3 + 2), s: 0.5 + rand(i * 13.7 + 4) * 1.1, p: rand(i * 15.1 + 6) * Math.PI * 2 });
    }
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (!running) draw(performance.now()); // static frame for reduced motion
  }

  function vortexCenter() {
    return { cx: vw * 0.5, cy: vh * 0.44 };
  }

  function draw(t) {
    if (!ctx) return;
    const dt = Math.min(48, t - lastT) / 1000;
    lastT = t;
    ctx.clearRect(0, 0, vw, vh);

    const { cx, cy } = vortexCenter();
    const Rout = Math.hypot(vw, vh) * 0.62;
    const R0 = Math.min(vw, vh) * 0.05;
    const motion = H.settings ? (H.settings.get('reducedMotion') ? 0 : H.settings.get('motionScale')) : 1;
    const time = t / 1000;
    const style = H.settings ? H.settings.get('bgStyle') : 'storm';

    /* stars */
    ctx.save();
    for (const s of stars) {
      const tw = motion > 0 ? (0.55 + 0.45 * Math.sin(time * 0.7 + s.p)) : 0.7;
      ctx.globalAlpha = 0.35 * tw;
      ctx.fillStyle = colors.star;
      ctx.beginPath();
      ctx.arc(s.x * vw, s.y * vh, s.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (style === 'stars') { ctx.globalAlpha = 1; return; }  // stars-only mode

    /* eye glow */
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R0 * 4.2);
    g.addColorStop(0, colors.eye);
    g.addColorStop(0.28, colors.eye.replace(/[\d.]+\)$/, '0.09)'));
    g.addColorStop(0.45, colors.eye.replace(/[\d.]+\)$/, '0.05)'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R0 * 4.2, 0, Math.PI * 2);
    ctx.fill();

    if (style === 'stars') { ctx.globalAlpha = 1; return; }

    /* vortex particles */
    for (const p of particles) {
      if (motion > 0) {
        const speed = (p.w * 46) / (p.r * Rout * 0.35 + 130); // faster near the eye
        p.a += speed * dt * motion;
        p.r -= dt * motion * 0.006 * (0.35 + p.r);            // slow inward drift
        if (p.r < R0 / Rout * 1.15) {
          p.r = 0.82 + Math.random() * 0.18;
          p.a = Math.random() * Math.PI * 2;
        }
      }
      const r = p.r * Rout;
      const x = cx + Math.cos(p.a) * r;
      const y = cy + Math.sin(p.a) * r * 0.88;
      const depth = 1 - p.r;
      const tw = 0.6 + 0.4 * Math.sin(time * 1.3 + p.tw);
      ctx.globalAlpha = Math.min(0.95, (0.24 + depth * 0.66) * tw);
      ctx.fillStyle = p.c < 0.6 ? colors.c1 : colors.c2;
      ctx.beginPath();
      ctx.arc(x, y, p.s * (0.8 + depth * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(t) {
    draw(t);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running || !canvas) return;
    running = true;
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function bgHidden() {
    return H.settings && H.settings.get('bgStyle') === 'off';
  }

  function init() {
    canvas = document.getElementById('bg-vortex');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    readColors();
    resize();
    window.addEventListener('resize', resize);

    if (bgHidden()) { canvas.style.display = 'none'; }
    else if (reduceMQ.matches || (H.settings && H.settings.get('reducedMotion'))) {
      draw(performance.now()); // single static frame
    } else {
      start();
    }
    reduceMQ.addEventListener?.('change', () => {
      if (reduceMQ.matches) stop(); else start();
    });
    if (H.settings) {
      H.settings.onChange((changed) => {
        if (changed.bgStyle !== undefined) {
          const hidden = H.settings.get('bgStyle') === 'off';
          canvas.style.display = hidden ? 'none' : '';
          if (hidden) { stop(); } else if (!running && !reduceMQ.matches && !H.settings.get('reducedMotion')) { start(); }
          else if (!running) draw(performance.now());
        }
        if (changed.theme) { readColors(); if (!running) draw(performance.now()); }
        if (changed.reducedMotion !== undefined) {
          if (changed.reducedMotion) { stop(); draw(performance.now()); }
          else start();
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  H.bg = { resize };
})(window.Hurlo = window.Hurlo || {});
