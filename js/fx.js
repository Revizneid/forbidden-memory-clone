/* =========================================================================
 * Forbidden Memory Web Clone — FX Engine (canvas particle + screen effects)
 * Hai lớp canvas:
 *   #weather-canvas — ambience sau thẻ (arena + terrain weather)
 *   #fx-canvas      — combat FX trên thẻ (spark, bolt, vortex, emoji…)
 * Cộng helpers DOM: flash, shake, banner, pit, chains, shield, crack.
 * ========================================================================= */
(function (root) {
  'use strict';
  const FM = root.FM = root.FM || {};
  const fx = FM.fx = {};

  let wx, wc, xx, xc;            // weather & fx canvases
  let W = 0, H = 0, DPR = 1;
  const parts = [];              // fx particles
  const amb = [];                // ambient particles
  const bolts = [];              // active lightning bolts
  const rings = [];              // shock rings
  const vortices = [];           // vortex effects
  let raf = 0, lastT = 0;
  let weather = null;            // 'forest' | 'umi' | ...
  let arena = 'temple';
  let shakePow = 0;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /* ---------------- themes ---------------- */
  const ARENAS = {
    temple:      { grad: ['#3d3324', '#14100a'], tint: 'rgba(210,170,90,.10)', emit: 'mote',   rate: 1.2 },
    meadow:      { grad: ['#22402a', '#0b1a10'], tint: 'rgba(120,220,140,.10)', emit: 'petal',  rate: 1.6 },
    shrine:      { grad: ['#2c2440', '#0e0b18'], tint: 'rgba(230,200,120,.12)', emit: 'ember',  rate: 1.4 },
    abyss:       { grad: ['#0e2438', '#050e18'], tint: 'rgba(80,160,255,.12)',  emit: 'bubble', rate: 1.6 },
    tower:       { grad: ['#2b1d44', '#0f0a1c'], tint: 'rgba(180,120,255,.12)', emit: 'sparkle',rate: 1.8 },
    volcano:     { grad: ['#3a1512', '#120505'], tint: 'rgba(255,110,60,.12)',  emit: 'ember',  rate: 2.2 },
    sky:         { grad: ['#1d3a5e', '#0a1424'], tint: 'rgba(160,220,255,.10)', emit: 'wind',   rate: 1.8 },
    graveyard:   { grad: ['#232e28', '#0a0f0c'], tint: 'rgba(140,200,170,.08)', emit: 'wisp',   rate: 1.5 },
    shadowrealm: { grad: ['#2a0d16', '#0a0407'], tint: 'rgba(255,60,60,.10)',   emit: 'ember',  rate: 2.4 },
  };
  const WEATHERS = {
    sogen:   { tint: 'rgba(224,190,120,.20)', emit: 'sand',  rate: 5 },
    forest:  { tint: 'rgba(80,200,110,.16)',  emit: 'leaf',   rate: 5 },
    mountain:{ tint: 'rgba(160,160,190,.16)', emit: 'rock',   rate: 3, lightning: true },
    umi:     { tint: 'rgba(60,140,255,.18)',  emit: 'bubble', rate: 6 },
    yami:    { tint: 'rgba(90,30,150,.22)',   emit: 'dark',   rate: 5 },
  };

  /* ---------------- boot & resize ---------------- */
  function ensureCanvas(id) {
    let c = document.getElementById(id);
    if (!c) {
      c = document.createElement('canvas');
      c.id = id;
      document.getElementById('app').appendChild(c);
    }
    return c;
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    for (const c of [wc, xc]) {
      c.width = W * DPR; c.height = H * DPR;
      c.style.width = W + 'px'; c.style.height = H + 'px';
      c.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
    }
  }
  fx.boot = function () {
    wc = ensureCanvas('weather-canvas'); wc.className = 'layer-canvas weather';
    xc = ensureCanvas('fx-canvas'); xc.className = 'layer-canvas combat';
    if (!document.getElementById('flash-layer')) {
      const f = document.createElement('div'); f.id = 'flash-layer'; document.getElementById('app').appendChild(f);
    }
    resize();
    window.addEventListener('resize', resize);
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  };

  /* ---------------- environment ---------------- */
  fx.setArena = function (theme) {
    arena = ARENAS[theme] ? theme : 'temple';
    const host = document.getElementById('battle');
    if (host) {
      host.className = host.className.replace(/arena-\S+/g, '').trim();
      host.classList.add('arena-' + arena);
    }
    amb.length = 0;
  };
  fx.setWeather = function (mid) {
    weather = WEATHERS[mid] ? mid : null;
    amb.length = 0;
    const tint = document.getElementById('weather-tint');
    if (tint) {
      const w = weather ? WEATHERS[weather] : null;
      if (w) { tint.style.background = w.tint; tint.style.opacity = '1'; }
      else tint.style.opacity = '0';
    }
  };
  fx.currentWeather = () => weather;

  /* ---------------- spawn helpers ---------------- */
  function spawnAmbient() {
    const w = weather ? WEATHERS[weather] : null;
    const emitters = [];
    if (w) emitters.push([w.emit, w.rate]);
    emitters.push([ARENAS[arena].emit, ARENAS[arena].rate * 0.7]);
    for (const [type, rate] of emitters) {
      if (Math.random() < rate / 60) amb.push(makeAmbient(type));
    }
    // mountain: sấm chớp nền hiếm
    if (weather === 'mountain' && Math.random() < 0.0018) {
      const x = rand(W * 0.15, W * 0.85);
      boltPath(x, rand(0, H * 0.3), x + rand(-60, 60), rand(H * 0.35, H * 0.6), { color: 'rgba(210,220,255,.8)', width: 1.6, life: 260, glow: 6 });
    }
    // shadowrealm: rung đỏ
    if (arena === 'shadowrealm' && Math.random() < 0.0012) fx.shake(3);
  }

  function makeAmbient(type) {
    const base = { type, x: rand(0, W), y: -10, vx: 0, vy: rand(20, 55), life: rand(4000, 8000), age: 0, size: rand(2, 5), rot: rand(0, 6.28), vr: rand(-1, 1) };
    switch (type) {
      case 'mote':   return Object.assign(base, { vy: rand(6, 18), vx: rand(-6, 6), size: rand(1, 3), color: 'rgba(240,214,140,.5)' });
      case 'petal':  return Object.assign(base, { vy: rand(25, 55), vx: rand(-20, 20), size: rand(3, 6), color: pick(['rgba(255,160,190,.6)', 'rgba(255,220,235,.6)']) });
      case 'ember':  return Object.assign(base, { y: H + 5, vy: -rand(25, 70), vx: rand(-14, 14), size: rand(1.5, 3.5), color: pick(['rgba(255,120,50,.7)', 'rgba(255,190,80,.7)', 'rgba(255,70,40,.7)']) });
      case 'bubble': return Object.assign(base, { y: H + 5, vy: -rand(22, 60), vx: rand(-8, 8), size: rand(2, 6), color: 'rgba(150,210,255,.4)' });
      case 'sparkle':return Object.assign(base, { vy: rand(-30, -10), vx: rand(-15, 15), size: rand(1.5, 3), color: pick(['rgba(200,150,255,.7)', 'rgba(255,230,160,.7)']) });
      case 'wind':   return Object.assign(base, { vy: rand(4, 12), vx: rand(80, 190), size: rand(20, 60), color: 'rgba(190,225,255,.22)', streak: true });
      case 'wisp':   return Object.assign(base, { vy: -rand(12, 30), vx: rand(-10, 10), size: rand(2, 5), color: 'rgba(150,220,190,.4)' });
      case 'sand':   return Object.assign(base, { vy: rand(6, 16), vx: rand(120, 260), size: rand(14, 40), color: 'rgba(226,196,140,.25)', streak: true });
      case 'leaf':   return Object.assign(base, { vy: rand(30, 65), vx: rand(-28, 28), size: rand(4, 8), color: pick(['rgba(90,190,90,.6)', 'rgba(190,220,90,.6)', 'rgba(230,160,60,.55)']) });
      case 'rock':   return Object.assign(base, { vy: rand(10, 22), vx: rand(-14, 14), size: rand(2, 4), color: 'rgba(180,180,200,.4)' });
      case 'dark':   return Object.assign(base, { vy: rand(-36, -14), vx: rand(-18, 18), size: rand(2, 6), color: pick(['rgba(140,60,220,.5)', 'rgba(70,20,110,.6)']) });
      default:       return base;
    }
  }

  /* ---------------- combat FX API ---------------- */
  function centerOf(el) {
    if (!el) return { x: W / 2, y: H / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  fx.burstAt = function (el, opts) {
    opts = opts || {};
    const { x, y } = centerOf(el);
    const colors = opts.colors || ['#ffcf5e', '#ff8844', '#ff5555', '#ffffff'];
    const n = opts.count || 26;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(60, opts.power || 330);
      parts.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, grav: 380, life: rand(350, 800), age: 0, size: rand(1.5, 4), color: pick(colors) });
    }
  };
  fx.ringAt = function (el, color) {
    const { x, y } = centerOf(el);
    rings.push({ x, y, r: 6, maxR: rand(60, 90), life: 420, age: 0, color: color || 'rgba(255,210,120,.9)' });
  };
  fx.pillarAt = function (el, color) {
    const { x, y } = centerOf(el);
    for (let i = 0; i < 34; i++) {
      parts.push({ type: 'spark', x: x + rand(-22, 22), y: y + rand(-10, 10), vx: rand(-18, 18), vy: -rand(180, 480), grav: 60, life: rand(500, 950), age: 0, size: rand(1.5, 4), color: pick([color || '#ffe98a', '#fff7d0', '#ffd75e']) });
    }
    rings.push({ x, y, r: 8, maxR: 110, life: 500, age: 0, color: color || 'rgba(255,225,130,.9)' });
    fx.shake(7);
  };
  fx.bolt = function (x1, y1, x2, y2, opts) { boltPath(x1, y1, x2, y2, opts || {}); };
  function boltPath(x1, y1, x2, y2, opts) {
    const segs = [];
    const n = opts.segs || 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const jx = i === 0 || i === n ? 0 : rand(-22, 22);
      const jy = i === 0 || i === n ? 0 : rand(-8, 8);
      segs.push([x1 + (x2 - x1) * t + jx, y1 + (y2 - y1) * t + jy]);
    }
    bolts.push({ segs, life: opts.life || 300, age: 0, color: opts.color || 'rgba(180,210,255,.95)', width: opts.width || 3, glow: opts.glow || 14 });
  }
  fx.lightningStrike = function (el, opts) {
    opts = opts || {};
    const { x, y } = centerOf(el);
    const n = opts.count || 3;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        boltPath(x + rand(-70, 70), 0, x + rand(-26, 26), y, { color: 'rgba(190,220,255,.95)', width: rand(2, 4), glow: 18, life: 240 });
        fx.burstAt(el, { colors: ['#cfe4ff', '#ffffff', '#88b4ff'], count: 14, power: 240 });
        fx.flash('rgba(210,230,255,', 0.28, 120);
        fx.shake(6);
      }, i * 130);
    }
  };
  fx.vortexAt = function (x, y, ms, opts) {
    opts = opts || {};
    vortices.push({ x, y, life: ms || 900, age: 0, color: opts.color || 'rgba(120,40,200,.55)', maxR: opts.maxR || 150 });
    const total = Math.floor((ms || 900) / 16);
    for (let i = 0; i < total * 2; i++) {
      setTimeout(() => {
        const a = rand(0, Math.PI * 2), r = rand(60, 210);
        parts.push({ type: 'soul', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.7, vx: -Math.cos(a) * 150, vy: -Math.sin(a) * 110, grav: 0, life: 460, age: 0, size: rand(1.5, 4.5), color: pick(['rgba(150,70,230,.8)', 'rgba(80,30,140,.8)', 'rgba(20,5,30,.9)']) });
      }, i * 8);
    }
  };
  fx.emojiBurst = function (el, emoji, count, spread) {
    const { x, y } = centerOf(el);
    for (let i = 0; i < (count || 8); i++) {
      parts.push({ type: 'emoji', x: x + rand(-30, 30), y: y + rand(-16, 16), vx: rand(-60, 60) * (spread || 1), vy: -rand(120, 300), grav: 420, life: rand(700, 1200), age: 0, size: rand(16, 30), emoji, rot: rand(-0.6, 0.6), vr: rand(-3, 3) });
    }
  };
  fx.comet = function (fromEl, toEl, opts) {
    opts = opts || {};
    const a = centerOf(fromEl), b = centerOf(toEl);
    const n = 22;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const t = i / n;
        parts.push({ type: 'spark', x: a.x + (b.x - a.x) * t + rand(-8, 8), y: a.y + (b.y - a.y) * t + rand(-8, 8), vx: (b.x - a.x) * 0.9, vy: (b.y - a.y) * 0.9, grav: 0, life: 260, age: 0, size: rand(2, 5), color: pick([opts.color || '#ff9044', '#ffd75e', '#ffffff']) });
      }, i * 16);
    }
    setTimeout(() => {
      fx.burstAt(toEl, { colors: [opts.color || '#ff9044', '#ff5533', '#ffd75e'], count: 18, power: 260 });
      fx.shake(6);
    }, n * 16);
  };
  fx.confetti = function () {
    for (let i = 0; i < 90; i++) {
      parts.push({ type: 'emoji', x: rand(0, W), y: rand(-H * 0.3, 0), vx: rand(-40, 40), vy: rand(80, 220), grav: 60, life: rand(1800, 3000), age: 0, size: rand(14, 26), emoji: pick(['🎉', '✨', '⭐', '🏆', '💛']), rot: rand(0, 6.28), vr: rand(-4, 4) });
    }
  };
  fx.darkPulse = function () {
    fx.flash('rgba(120,0,0,', 0.4, 700);
    fx.shake(10);
    for (let i = 0; i < 50; i++) {
      parts.push({ type: 'soul', x: rand(0, W), y: H + 10, vx: rand(-20, 20), vy: -rand(60, 180), grav: 0, life: rand(1200, 2200), age: 0, size: rand(2, 5), color: 'rgba(200,30,30,.5)' });
    }
  };

  /* ---------------- screen helpers ---------------- */
  fx.shake = function (px) { shakePow = Math.max(shakePow, px || 6); };
  fx.flash = function (colorPrefix, opacity, ms) {
    const f = document.getElementById('flash-layer');
    if (!f) return;
    f.style.transition = 'none';
    f.style.background = colorPrefix + (opacity || 0.35) + ')';
    f.style.opacity = '1';
    setTimeout(() => { f.style.transition = 'opacity ' + (ms || 250) + 'ms ease-out'; f.style.opacity = '0'; }, 20);
  };

  /* ---------------- render loop ---------------- */
  function tick(t) {
    const dt = Math.min(50, t - lastT); lastT = t;
    // tab ẩn: chỉ cập nhật thời gian, bỏ vẽ để nhẹ
    if (typeof document !== 'undefined' && document.hidden) {
      raf = requestAnimationFrame(tick);
      return;
    }
    // shake
    if (shakePow > 0.2) {
      const host = document.getElementById('battle');
      if (host) {
        const dx = rand(-shakePow, shakePow), dy = rand(-shakePow, shakePow);
        host.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      shakePow *= 0.86;
    } else if (shakePow !== 0) {
      shakePow = 0;
      const host = document.getElementById('battle');
      if (host) host.style.transform = '';
    }

    spawnAmbient();
    drawWeather(wc ? wc.getContext('2d') : null, dt);
    drawCombat(xc ? xc.getContext('2d') : null, dt);
    raf = requestAnimationFrame(tick);
  }

  function stepAmb(dt) {
    for (let i = amb.length - 1; i >= 0; i--) {
      const p = amb[i];
      p.age += dt;
      p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.rot += (p.vr || 0) * dt / 1000;
      if (p.type === 'leaf' || p.type === 'petal') p.x += Math.sin(p.age / 300) * 0.7;
      if (p.age > p.life || p.y > H + 30 || p.y < -40 || p.x < -80 || p.x > W + 80) amb.splice(i, 1);
    }
    if (amb.length > 220) amb.splice(0, amb.length - 220);
  }
  function drawWeather(ctx, dt) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    stepAmb(dt);
    for (const p of amb) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, (p.life - p.age) / 800));
      ctx.fillStyle = p.color || 'rgba(255,255,255,.5)';
      if (p.streak) {
        ctx.fillRect(p.x, p.y, p.size, 1.4);
      } else if (p.type === 'leaf' || p.type === 'petal') {
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, 6.28); ctx.fill();
      } else if (p.type === 'bubble') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill();
      }
      ctx.restore();
    }
  }
  function drawCombat(ctx, dt) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age > p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
      p.vy += (p.grav || 0) * dt / 1000;
      if (p.vr) p.rot += p.vr * dt / 1000;
      const a = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      if (p.type === 'emoji') {
        ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.font = p.size + 'px serif'; ctx.textAlign = 'center';
        ctx.fillText(p.emoji, 0, 0);
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; ctx.shadowBlur = p.type === 'soul' ? 8 : 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * a), 0, 6.28); ctx.fill();
      }
      ctx.restore();
    }
    if (parts.length > 400) parts.splice(0, parts.length - 400);
    // rings
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.age += dt;
      if (r.age > r.life) { rings.splice(i, 1); continue; }
      const t = r.age / r.life;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color; ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.maxR - r.r) * t, 0, 6.28); ctx.stroke();
      ctx.restore();
    }
    // bolts
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.age += dt;
      if (b.age > b.life) { bolts.splice(i, 1); continue; }
      const a = 1 - b.age / b.life;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width;
      ctx.shadowColor = b.color; ctx.shadowBlur = b.glow;
      ctx.beginPath();
      for (let j = 0; j < b.segs.length; j++) {
        const [sx, sy] = b.segs[j];
        if (j === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.lineWidth = b.width * 0.4; ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }
    // vortices
    for (let i = vortices.length - 1; i >= 0; i--) {
      const v = vortices[i];
      v.age += dt;
      if (v.age > v.life) { vortices.splice(i, 1); continue; }
      const t = v.age / v.life;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      const grad = ctx.createRadialGradient(v.x, v.y, 4, v.x, v.y, v.maxR * (0.4 + 0.6 * t));
      grad.addColorStop(0, 'rgba(5,0,12,.95)');
      grad.addColorStop(0.55, v.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(v.x, v.y, v.maxR * (0.4 + 0.6 * t), 0, 6.28); ctx.fill();
      // spiral arms
      ctx.strokeStyle = 'rgba(180,120,255,' + (0.5 * (1 - t)) + ')';
      ctx.lineWidth = 2;
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let s = 0; s < 20; s++) {
          const th = arm * 2.09 + s * 0.32 + v.age / 90;
          const rr = 8 + s * (v.maxR * 0.05) * (1 - t * 0.4);
          const px = v.x + Math.cos(th) * rr, py = v.y + Math.sin(th) * rr * 0.75;
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
