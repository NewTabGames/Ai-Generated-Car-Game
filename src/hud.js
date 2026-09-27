/* Hellcat Drive — HUD: tach/speed gauge, g-meter, minimap, SRT-style performance timers. */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const MPH = 2.23694;

  class PerfTimers {
    constructor() {
      this.best = {};
      try { this.best = JSON.parse(localStorage.getItem('hc_best')) || {}; } catch (e) { this.best = {}; }
      this.reset();
      this.last = {};
    }
    reset() { this.state = 'idle'; this.t = 0; this.dist = 0; this.stillT = 0; this.brk = null; this.vmax = 0; }
    save() { try { localStorage.setItem('hc_best', JSON.stringify(this.best)); } catch (e) { /* storage unavailable */ } }
    clearBest() { this.best = {}; this.save(); }
    rec(key, v, lowerBetter) {
      this.last[key] = v;
      const b = this.best[key];
      if (b === undefined || (lowerBetter ? v < b : v > b)) { this.best[key] = v; this.save(); return true; }
      return false;
    }
    update(dt, v, thr, brk) {
      const mph = Math.abs(v) * MPH;
      const events = [];
      if (mph < 0.3) { this.stillT += dt; if (this.stillT > 0.3) { this.state = 'armed'; this.t = 0; this.dist = 0; this.got = {}; } }
      else this.stillT = 0;
      if (this.state === 'armed' && mph >= 0.3 && v > 0) { this.state = 'roll'; this.t = 0; this.dist = 0; this.got = {}; }
      if (this.state === 'roll') {
        this.dist += Math.max(0, v) * dt;
        if (!this.rollout || this.dist >= 0.3048) { this.state = 'run'; this.dist = 0; this.t = 0; }
        if (brk > 0.5 || v < 0) this.state = 'idle';
      } else if (this.state === 'run') {
        this.t += dt; this.dist += Math.max(0, v) * dt;
        if (!this.got.s60 && mph >= 60) { this.got.s60 = 1; if (this.rec('t60', this.t, true)) events.push('NEW BEST 0-60: ' + this.t.toFixed(2) + ' s'); else events.push('0-60 mph: ' + this.t.toFixed(2) + ' s'); }
        if (!this.got.s100 && mph >= 100) { this.got.s100 = 1; this.rec('t100', this.t, true); }
        if (!this.got.q && this.dist >= 402.336) {
          this.got.q = 1; this.last.trap = mph;
          const nb = this.rec('tq', this.t, true);
          if (nb) this.best.trap = mph, this.save();
          events.push((nb ? 'NEW BEST ' : '') + '¼ mile: ' + this.t.toFixed(2) + ' s @ ' + mph.toFixed(1) + ' mph');
        }
        if (brk > 0.5 || v < 0 || this.t > 60) this.state = 'idle';
      }
      // braking 60-0
      if (!this.brk && mph < 60 && mph > 57 && brk > 0.4 && this.prevMph >= 60) this.brk = { d: 0 };
      if (this.brk) {
        this.brk.d += Math.abs(v) * dt;
        if (brk < 0.1 || thr > 0.1) this.brk = null;
        else if (mph < 0.3) { const ft = this.brk.d * 3.28084; this.rec('b60', ft, true); events.push('60-0 mph: ' + ft.toFixed(0) + ' ft'); this.brk = null; }
      }
      if (mph > this.vmax) { this.vmax = mph; if (mph > (this.best.vmax || 0) + 0.05) { this.best.vmax = mph; this.saveT = (this.saveT || 0) + dt; if (this.saveT > 2) { this.save(); this.saveT = 0; } } }
      this.last.vmax = this.vmax;
      this.prevMph = mph;
      return events;
    }
  }

  class HUD {
    constructor(W) {
      this.W = W;
      this.gauge = document.getElementById('gauge'); this.gg = this.gauge.getContext('2d');
      this.gm = document.getElementById('gmeter'); this.gmg = this.gm.getContext('2d');
      this.mm = document.getElementById('minimap'); this.mmg = this.mm.getContext('2d');
      this.chips = document.getElementById('chips');
      this.toastEl = document.getElementById('toast'); this.hintEl = document.getElementById('hint');
      this.toastT = 0; this.hintT = 0; this.frame = 0;
      this.units = 'mph';
      this.el = {}; for (const id of ['p60', 'b60', 'p100', 'b100', 'pq', 'bq', 'pb', 'bb', 'pv', 'bv', 'ib-c', 'ib-b', 'ib-t', 'ib-s', 'cockpitSpeed']) this.el[id] = document.getElementById(id);
      this.lastChips = '';
    }
    toast(msg, secs) { this.toastEl.textContent = msg; this.toastEl.style.opacity = 1; this.toastT = secs || 1.8; }
    hint(msg, secs) { this.hintEl.textContent = msg; this.hintEl.style.opacity = 1; this.hintT = secs || 4; }
    spd(ms) { return this.units === 'kmh' ? Math.abs(ms) * 3.6 : Math.abs(ms) * MPH; }

    drawGauge(t) {
      const g = this.gg, W = 760, H = 500, cx = 380, cy = 300, R = 250;
      g.clearRect(0, 0, W, H);
      const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, maxR = t.maxRpm || 7000;
      const ang = (r) => a0 + (a1 - a0) * r / maxR;
      // backing
      g.fillStyle = 'rgba(6,7,9,0.72)'; g.beginPath(); g.arc(cx, cy, R + 14, a0 - 0.08, a1 + 0.08); g.arc(cx, cy, R - 118, a1 + 0.08, a0 - 0.08, true); g.closePath(); g.fill();
      // red zone
      const red = t.redline || 6200;
      g.strokeStyle = 'rgba(210,20,24,0.9)'; g.lineWidth = 16; g.beginPath(); g.arc(cx, cy, R - 8, ang(red), a1); g.stroke();
      // rpm fill
      const rpm = clamp(t.rpm, 0, maxR);
      const grad = g.createLinearGradient(cx - R, 0, cx + R, 0);
      grad.addColorStop(0, '#f1f1f1'); grad.addColorStop(0.72, '#ffffff'); grad.addColorStop(0.86, '#ffb300'); grad.addColorStop(1, '#ff2020');
      g.strokeStyle = t.fuelCut ? '#ff2020' : grad; g.lineWidth = 26;
      g.beginPath(); g.arc(cx, cy, R - 34, a0, ang(rpm)); g.stroke();
      // ticks
      g.fillStyle = '#ddd'; g.strokeStyle = '#ddd';
      // ticks / labels scale with the range (a 30,000 rpm tach can't label every 1,000)
      const mj = maxR <= 10000 ? 1000 : maxR <= 20000 ? 2000 : maxR <= 40000 ? 5000 : 10000, mn = mj / 4;
      for (let r = 0; r <= maxR; r += mn) {
        const a = ang(r), major = r % mj === 0;
        g.lineWidth = major ? 4 : 2;
        const r1 = R - 2, r2 = R - (major ? 22 : 12);
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke();
        if (major) { g.font = 'bold 26px Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(r / 1000), cx + Math.cos(a) * (R - 70), cy + Math.sin(a) * (R - 70)); }
      }
      // needle
      const na = ang(rpm);
      g.strokeStyle = '#ff2a1a'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx + Math.cos(na) * (R - 120), cy + Math.sin(na) * (R - 120)); g.lineTo(cx + Math.cos(na) * (R - 4), cy + Math.sin(na) * (R - 4)); g.stroke();
      // speed & gear
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.font = 'bold 112px Segoe UI, Arial'; g.fillText(String(Math.round(this.spd(t.speed))), cx, cy + 20);
      g.font = '22px Segoe UI, Arial'; g.fillStyle = '#9aa0a8'; g.fillText(this.units === 'kmh' ? 'KM/H' : 'MPH', cx, cy + 52);
      // gear box
      g.fillStyle = t.shiftLight ? '#2c6' : 'rgba(255,255,255,0.08)';
      g.fillRect(cx - 50, cy - 175, 100, 76);
      g.fillStyle = t.shiftLight ? '#021' : '#fff'; g.font = 'bold 62px Segoe UI, Arial'; g.fillText(t.gear, cx, cy - 113);
      // boost
      g.fillStyle = '#9aa0a8'; g.font = '18px Segoe UI, Arial'; g.textAlign = 'left'; g.fillText('BOOST', cx - 150, cy + 100);
      g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(cx - 80, cy + 86, 200, 14);
      g.fillStyle = '#e02'; g.fillRect(cx - 80, cy + 86, 200 * clamp(t.boost / (t.boostMax || 11.6), 0, 1), 14);
      g.fillStyle = '#fff'; g.textAlign = 'right'; g.fillText(t.boost.toFixed(1) + ' psi', cx + 190, cy + 100);
      // tyre temps
      const tt = t.tireTemps;
      g.textAlign = 'center'; g.font = '14px Segoe UI, Arial';
      for (let i = 0; i < 4; i++) {
        const x = cx - 230 + (i & 1) * 34, y = cy + 80 + (i >> 1) * 44;
        const T = tt[i];
        const c = T < 50 ? '#3a7bd5' : T < 110 ? '#2cb54a' : T < 140 ? '#f5a300' : '#e22';
        g.fillStyle = c; g.fillRect(x, y, 26, 38);
        g.fillStyle = '#fff'; g.fillText(Math.round(T * (this.units === 'kmh' ? 1 : 1.8) + (this.units === 'kmh' ? 0 : 32)), x + 13, y + 24);
      }
      g.fillStyle = '#9aa0a8'; g.font = '12px Segoe UI, Arial'; g.fillText('TYRE °' + (this.units === 'kmh' ? 'C' : 'F'), cx - 199, cy + 184);
    }
    drawG(gLat, gLong) {
      const g = this.gmg, S = 220, c = S / 2;
      g.clearRect(0, 0, S, S);
      g.fillStyle = 'rgba(6,7,9,0.7)'; g.beginPath(); g.arc(c, c, c - 2, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2;
      for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(c, c, (c - 10) * r, 0, 7); g.stroke(); }
      g.beginPath(); g.moveTo(10, c); g.lineTo(S - 10, c); g.moveTo(c, 10); g.lineTo(c, S - 10); g.stroke();
      const x = c + clamp(gLat / 1.5, -1, 1) * (c - 10), y = c - clamp(gLong / 1.5, -1, 1) * (c - 10);
      g.fillStyle = '#e22'; g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill();
      g.fillStyle = '#ccc'; g.font = 'bold 22px Segoe UI'; g.textAlign = 'center';
      g.fillText(Math.hypot(gLat, gLong).toFixed(2) + ' g', c, S - 22);
    }
    drawMinimap(px, pz, heading) {
      const g = this.mmg, S = 380, c = S / 2, R = 520, sc = c / R;
      const W = this.W;
      g.clearRect(0, 0, S, S);
      g.save();
      g.beginPath(); g.arc(c, c, c - 2, 0, 7); g.clip();
      const TAR = W.map === 'tarmac';
      g.fillStyle = TAR ? 'rgba(40,40,42,0.85)' : 'rgba(28,38,24,0.82)'; g.fillRect(0, 0, S, S);
      g.translate(c, c); g.rotate(heading); g.scale(sc, sc); g.translate(-px, -pz);
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (TAR) {
        // All Road: the avenue grid over the paving, and the jump ramps
        const A = W.TARMAC.AV, e = R * 1.5;
        g.strokeStyle = '#77777a'; g.lineWidth = 2 * W.TARMAC.PAVE; g.lineCap = 'butt';
        for (let i = Math.floor((px - e) / A); i <= Math.floor((px + e) / A) + 1; i++) { g.beginPath(); g.moveTo(i * A, pz - e); g.lineTo(i * A, pz + e); g.stroke(); }
        for (let j = Math.floor((pz - e) / A); j <= Math.floor((pz + e) / A) + 1; j++) { g.beginPath(); g.moveTo(px - e, j * A); g.lineTo(px + e, j * A); g.stroke(); }
        g.fillStyle = '#f2c200';
        const CH = W.C.CHUNK;
        for (let cx = Math.floor((px - e) / CH); cx <= Math.floor((px + e) / CH); cx++) {
          for (let cz = Math.floor((pz - e) / CH); cz <= Math.floor((pz + e) / CH); cz++) {
            for (const r of W.rampsInChunk(cx, cz)) {
              g.save(); g.translate(r.x + r.fx * r.len / 2, r.z + r.fz * r.len / 2); g.rotate(Math.atan2(r.fz, r.fx));
              g.fillRect(-r.len * 0.9, -W.RAMP.W, r.len * 1.8, W.RAMP.W * 2); g.restore();
            }
          }
        }
        g.restore();
        this._mmOverlay(g, c, S, heading);
        return;
      }
      const S_ = W.C.ROAD_SPACING;
      const draw = (axis) => {
        const cross = axis === 0 ? px : pz, along = axis === 0 ? pz : px;
        const i0 = Math.floor((cross - R * 1.5) / S_), i1 = Math.floor((cross + R * 1.5) / S_) + 1;
        for (let i = i0; i <= i1; i++) {
          const p = W.roadParams(axis, i);
          g.beginPath();
          for (let t = along - R * 1.45; t <= along + R * 1.45; t += 12) {
            const cc = W.roadCenter(p, t);
            const x = axis === 0 ? cc : t, z = axis === 0 ? t : cc;
            if (t === along - R * 1.45) g.moveTo(x, z); else g.lineTo(x, z);
          }
          g.strokeStyle = '#111'; g.lineWidth = 22; g.stroke();
          g.strokeStyle = '#9a9a9a'; g.lineWidth = 12; g.stroke();
        }
      };
      draw(0); draw(1);
      g.restore();
      this._mmOverlay(g, c, S, heading);
    }
    _mmOverlay(g, c, S, heading) {
      // car arrow
      g.fillStyle = '#e22'; g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(c, c - 18); g.lineTo(c + 11, c + 13); g.lineTo(c, c + 6); g.lineTo(c - 11, c + 13); g.closePath(); g.fill(); g.stroke();
      // north marker: world north (-Z) is canvas (0,-1) before the heading-up rotation
      const mx = c + Math.sin(heading) * (c - 20), my = c - Math.cos(heading) * (c - 20);
      g.fillStyle = '#fff'; g.font = 'bold 24px Segoe UI'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', mx, my);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, c - 3, 0, 7); g.stroke();
    }
    setChips(list) {
      const html = list.map((c) => `<div class="chip ${c.cls || ''}">${c.html}</div>`).join('');
      if (html !== this.lastChips) { this.chips.innerHTML = html; this.lastChips = html; }
    }
    setPerf(pt) {
      const f = (v, d) => (v === undefined ? '--' : v.toFixed(d));
      const e = this.el, L = pt.last, B = pt.best;
      e.p60.textContent = f(L.t60, 2); e.b60.textContent = f(B.t60, 2);
      e.p100.textContent = f(L.t100, 2); e.b100.textContent = f(B.t100, 2);
      e.pq.textContent = L.tq !== undefined ? L.tq.toFixed(2) + ' @ ' + Math.round(L.trap) : '--';
      e.bq.textContent = B.tq !== undefined ? B.tq.toFixed(2) : '--';
      e.pb.textContent = L.b60 !== undefined ? L.b60.toFixed(0) + ' ft' : '--'; e.bb.textContent = B.b60 !== undefined ? B.b60.toFixed(0) : '--';
      const cv = (m) => (this.units === 'kmh' ? m / MPH * 3.6 : m);
      e.pv.textContent = L.vmax !== undefined ? cv(L.vmax).toFixed(0) : '--'; e.bv.textContent = B.vmax !== undefined ? cv(B.vmax).toFixed(0) : '--';
    }
    setInputs(thr, brk, clu, steer) {
      const e = this.el;
      e['ib-t'].style.height = (thr * 100).toFixed(0) + '%';
      e['ib-b'].style.height = (brk * 100).toFixed(0) + '%';
      e['ib-c'].style.height = (clu * 100).toFixed(0) + '%';
      e['ib-s'].style.left = (50 + clamp(steer, -1, 1) * 50).toFixed(1) + '%';
    }
    tick(dt) {
      this.frame++;
      if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.style.opacity = 0; }
      if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hintEl.style.opacity = 0; }
    }
  }

  root.HCHud = { HUD, PerfTimers };
})(typeof self !== 'undefined' ? self : this);
