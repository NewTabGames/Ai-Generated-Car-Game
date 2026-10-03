/* Hellcat Drive — input: keyboard (WASD / arrows) + Gamepad API wheels & pads.
   Bindings are stored per device id. Standard-mapped devices (PXN V3 Pro in X-input / PC mode, Xbox pads)
   get sensible defaults; anything (D-input wheels, separate pedal boxes) can be mapped with the wizard,
   which auto-detects the moved axis / pressed button across all connected devices. */
(function (root) {
  'use strict';

  const ACTIONS = [
    ['shiftUp', 'Shift up / paddle +'], ['shiftDown', 'Shift down / paddle −'], ['handbrake', 'Handbrake'],
    ['rev', 'Hold: neutral rev'], ['lineLock', 'Hold: line lock (burnout)'], ['camera', 'Change view (MODE)'],
    ['reset', 'Reset car to road'], ['pause', 'Menu / pause'], ['horn', 'Horn'], ['tcMode', 'Drive mode (TC/ESC)'],
    ['lights', 'Headlights'], ['lookBack', 'Look back'], ['reverse', 'Reverse (R ↔ D)'], ['engine', 'Engine start/stop'],
    ['autoManual', 'Auto ↔ manual shifting'], ['chute', 'Parachute (Drag Pak)'], ['nos', 'Hold: nitrous (Fun tab)'],
    ['rearMode', 'Rear steering mode (monster truck)'], ['rearLeft', 'Hold: rear steer left'], ['rearRight', 'Hold: rear steer right'],
  ];
  const AXES = [['steer', 'Steering'], ['throttle', 'Throttle pedal'], ['brake', 'Brake pedal'], ['clutch', 'Clutch pedal']];

  const KEYMAP = {
    throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    clutch: ['KeyZ'], handbrake: ['Space'], shiftUp: ['KeyE', 'ShiftRight'], shiftDown: ['KeyQ', 'ControlRight'],
    rev: ['KeyR'], lineLock: ['KeyB'], camera: ['KeyC'], reset: ['Backspace'], pause: ['Escape'], horn: ['KeyH'],
    tcMode: ['KeyT'], lights: ['KeyL'], lookBack: ['KeyV'], reverse: ['KeyX'], engine: ['KeyI'], autoManual: ['KeyM'],
    park: ['KeyP'], chute: ['KeyF'], nos: ['KeyN'], rearMode: ['KeyG'], rearLeft: ['Comma'], rearRight: ['Period'],
  };

  const DEFAULT_SETTINGS = {
    steerDeadzone: 0.02, steerGamma: 1.15, steerSpeedSens: 1.0, steerRange: 1.0,
    pedalDeadzone: 0.03, throttleGamma: 1.25, brakeGamma: 1.35, rumble: true,
    kbSteerSpeed: 2.6, kbCountersteer: true,
  };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  // fraction of full lock (31.3 deg) that demands aLat m/s^2 at speed v (bicycle model) plus a slip allowance
  // (the game can hand it another vehicle's geometry - kb: { wb, maxSteer, aLat } - so a scooter that tips over at 0.4 g
  // isn't steered into 1 g by the keyboard; unset, it's the Challenger's)
  function physSteerLimit(v, aLat, slip, kb) {
    v = Math.abs(v);
    if (v < 1) return 1;
    if (kb) return clamp((Math.atan(kb.wb * kb.aLat / (v * v)) + slip * Math.min(1, Math.max(0, (kb.aLat - 3) / 7)) * kb.wb / 2.946) / kb.maxSteer, 0, 1);
    return clamp((Math.atan(2.946 * aLat / (v * v)) + slip) / 0.545, 0, 1);
  }

  class Input {
    constructor() {
      this.keys = new Set();
      this.prevActions = {};
      this.actions = {};
      this.pressed = {};
      this.kbSteer = 0;
      this.state = { steer: 0, throttle: 0, brake: 0, clutch: 0, handbrake: 0 };
      this.raw = { steer: 0, throttle: 0, brake: 0, clutch: 0 };
      this.source = 'keyboard';
      this.lastPadActivity = -1e9;
      this.lastKeyActivity = 0;
      this.axisMoved = {};
      this.axisInit = {};
      this.settings = Object.assign({}, DEFAULT_SETTINGS, this._load('hc_input_settings') || {});
      this.bindings = this._load('hc_bindings') || {};
      this.wizard = null;
      this.enabled = true;
      this.padInfo = [];
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        this.keys.add(e.code); this.lastKeyActivity = performance.now();
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab'].includes(e.code)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => { this.keys.clear(); this.stopRumble(); });
      // the vibration must be switched off before the page goes: a pulse still playing when the tab closes can lose its
      // stop, and some wheel drivers then hold the last vibration indefinitely (the wheel buzzing after the game is gone)
      window.addEventListener('pagehide', () => this.stopRumble());
      window.addEventListener('beforeunload', () => this.stopRumble());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.stopRumble(); });
      window.addEventListener('gamepadconnected', (e) => { this.onConnect && this.onConnect(e.gamepad); });
      window.addEventListener('gamepaddisconnected', (e) => { this.onDisconnect && this.onDisconnect(e.gamepad); });
    }
    _load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
    _save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
    saveSettings() { this._save('hc_input_settings', this.settings); }
    saveBindings() { this._save('hc_bindings', this.bindings); }

    pads() {
      const list = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      return list.filter((p) => p && p.connected !== false);
    }
    padById(id) { return this.pads().find((p) => p.id === id) || null; }

    /** Default bindings for a standard-mapped pad / X-input wheel. */
    defaultBindingFor(pad) {
      if (pad.mapping === 'standard') {
        const b = (i) => [{ pad: pad.id, type: 'button', index: i }];
        return {
          name: pad.id, auto: true,
          steer: { pad: pad.id, type: 'axis', index: 0, min: -1, center: 0, max: 1 },
          throttle: { pad: pad.id, type: 'button', index: 7, rest: 0, full: 1 },
          brake: { pad: pad.id, type: 'button', index: 6, rest: 0, full: 1 },
          clutch: null,
          buttons: {
            shiftUp: b(5), shiftDown: b(4), handbrake: b(0), rev: b(1), lineLock: b(2), camera: b(3),
            reset: b(8), pause: b(9), horn: b(10), tcMode: b(11), lights: b(12), lookBack: b(13),
            reverse: b(14), engine: b(15), autoManual: [], chute: [], nos: [], rearMode: [], rearLeft: [], rearRight: [],
          },
        };
      }
      return null;
    }

    /** Active binding profile: a wizard-made profile wins, else a default for the first standard pad. */
    activeProfile() {
      const pads = this.pads();
      if (!pads.length) return null;
      if (this.bindings.custom) {
        const ids = new Set(pads.map((p) => p.id));
        if (this.bindings.custom.steer && ids.has(this.bindings.custom.steer.pad)) return this.bindings.custom;
      }
      for (const p of pads) { const d = this.defaultBindingFor(p); if (d) return d; }
      return null;
    }
    needsSetup() {
      const pads = this.pads();
      return pads.length > 0 && !this.activeProfile();
    }

    _readSrc(src, pads) {
      if (!src) return null;
      const pad = pads.find((p) => p.id === src.pad) || null;
      if (!pad) return null;
      if (src.type === 'axis') return pad.axes[src.index] !== undefined ? pad.axes[src.index] : null;
      const b = pad.buttons[src.index];
      return b ? (typeof b === 'object' ? b.value : b) : null;
    }
    _pedal(src, pads) {
      const v = this._readSrc(src, pads);
      if (v === null) return 0;
      const key = src.pad + '|' + src.type + src.index;
      // Chrome reports some pedal axes as 0 until first moved; ignore until the axis actually moves
      if (src.type === 'axis') {
        if (this.axisInit[key] === undefined) this.axisInit[key] = v;
        if (!this.axisMoved[key]) {
          if (Math.abs(v - this.axisInit[key]) > 0.06) this.axisMoved[key] = true;
          else return 0;
        }
      }
      const n = (v - src.rest) / ((src.full - src.rest) || 1);
      const dz = this.settings.pedalDeadzone;
      return clamp((n - dz) / (1 - 2 * dz), 0, 1);
    }
    _button(list, pads) {
      if (!list) return false;
      for (const src of list) {
        const v = this._readSrc(src, pads);
        if (v === null) continue;
        if (src.type === 'axis') { if ((src.dir > 0 && v > src.thr) || (src.dir < 0 && v < src.thr)) return true; }
        else if (v > 0.5) return true;
      }
      return false;
    }

    kb(name) { const ks = KEYMAP[name]; if (!ks) return false; for (const k of ks) if (this.keys.has(k)) return true; return false; }

    /** Poll once per frame. speed in m/s (for speed-sensitive steering). */
    poll(dt, speed, vehicleYawHint) {
      const st = this.settings;
      const pads = this.pads();
      this.padInfo = pads;
      const prof = this.activeProfile();
      let padSteer = 0, padThr = 0, padBrk = 0, padClu = 0, padActive = false;
      const acts = {};
      if (prof && !this.wizard) {
        const sv = this._readSrc(prof.steer, pads);
        if (sv !== null) {
          const s = prof.steer;
          let n = sv >= s.center ? (sv - s.center) / ((s.max - s.center) || 1) : -(s.center - sv) / ((s.center - s.min) || 1);
          n = clamp(n, -1, 1);
          this.raw.steer = n;
          const dz = st.steerDeadzone;
          const an = Math.abs(n);
          n = an < dz ? 0 : Math.sign(n) * (an - dz) / (1 - dz);
          n = Math.sign(n) * Math.pow(Math.abs(n), st.steerGamma);
          n = clamp(n / st.steerRange, -1, 1);
          padSteer = n;
        }
        padThr = this._pedal(prof.throttle, pads);
        padBrk = this._pedal(prof.brake, pads);
        padClu = prof.clutch ? this._pedal(prof.clutch, pads) : 0;
        this.raw.throttle = padThr; this.raw.brake = padBrk; this.raw.clutch = padClu;
        padThr = Math.pow(padThr, st.throttleGamma);
        padBrk = Math.pow(padBrk, st.brakeGamma);
        for (const [a] of ACTIONS) acts[a] = this._button(prof.buttons && prof.buttons[a], pads);
        if (Math.abs(padSteer) > 0.08 || padThr > 0.05 || padBrk > 0.05 || Object.values(acts).some(Boolean)) {
          this.lastPadActivity = performance.now();
        }
      }
      this.hasClutchPedal = !!(prof && prof.clutch);
      // keyboard
      const kL = this.kb('left'), kR = this.kb('right');
      const kbActive = kL || kR || this.kb('throttle') || this.kb('brake');
      const tgt = (kR ? 1 : 0) - (kL ? 1 : 0);
      const spdN = Math.min(1, Math.abs(speed) / 45);
      const rate = st.kbSteerSpeed * (1 - 0.55 * spdN);
      if (tgt !== 0) {
        const r = Math.sign(tgt) !== Math.sign(this.kbSteer) && this.kbSteer !== 0 ? rate * 2.2 : rate;
        this.kbSteer = clamp(this.kbSteer + Math.sign(tgt - this.kbSteer) * Math.min(Math.abs(tgt - this.kbSteer), r * dt), -1, 1);
      } else {
        const r = 3.2 * dt;
        this.kbSteer = Math.abs(this.kbSteer) < r ? 0 : this.kbSteer - Math.sign(this.kbSteer) * r;
      }
      // keys are on/off: ramp them like a foot would, so W doesn't dump 717 hp instantly
      const kt = this.kb('throttle') ? 1 : 0, kbk = this.kb('brake') ? 1 : 0;
      this.kbThr = kt ? Math.min(1, (this.kbThr || 0) + 3.2 * dt) : Math.max(0, (this.kbThr || 0) - 7 * dt);
      this.kbBrk = kbk ? Math.min(1, (this.kbBrk || 0) + 5 * dt) : Math.max(0, (this.kbBrk || 0) - 9 * dt);
      const kbThr = this.kbThr, kbBrk = this.kbBrk;
      const usePad = prof && (performance.now() - this.lastPadActivity < 4000 || !kbActive) && performance.now() - this.lastPadActivity < 60000 * 60;
      if (kbActive) this.source = 'keyboard';
      else if (usePad && performance.now() - this.lastPadActivity < 2000) this.source = 'wheel';

      let steer, thr, brk, clu;
      if (this.source === 'wheel' && prof) {
        steer = padSteer; thr = padThr; brk = padBrk; clu = padClu;
        // speed-sensitive steering (a 180° wheel mapped to full lock needs taming at speed)
        // speed-sensitive ratio so a 180 deg wheel feels like the real 14.4:1 rack at speed:
        // full lock ~31 deg parking, ~15 deg at 30 mph, ~6 deg at 70 mph, ~3 deg at 120 mph
        const vs = Math.abs(speed) / 11;
        // (rawSteer: the vehicle scales its own lock with speed - the RC truck)
        if (!this.rawSteer) steer *= 1 - clamp(st.steerSpeedSens, 0, 1) * (1 - 1 / (1 + vs * Math.sqrt(vs)));
      } else {
        let ks = this.kbSteer;
        // keyboard: limit lock at speed, optional gentle countersteer help
        if (!this.rawSteer) ks *= physSteerLimit(speed, 10, 0.02, this.kbGeom);
        else ks *= this.rawKbK || 1;
        if (st.kbCountersteer && vehicleYawHint !== undefined && tgt === 0) ks = clamp(ks + vehicleYawHint * 0.5, -1, 1);
        steer = ks; thr = Math.max(kbThr, padThr); brk = Math.max(kbBrk, padBrk); clu = this.kb('clutch') ? 1 : padClu;
      }
      this.state.steer = steer; this.state.throttle = thr; this.state.brake = brk; this.state.clutch = clu;
      this.state.handbrake = (this.kb('handbrake') || acts.handbrake) ? 1 : 0;
      for (const [a] of ACTIONS) acts[a] = !!acts[a] || this.kb(a);
      acts.park = this.kb('park');
      acts.handbrake = this.state.handbrake > 0.5;
      // edges
      for (const a in acts) {
        this.pressed[a] = acts[a] && !this.prevActions[a];
        this.prevActions[a] = acts[a];
      }
      this.actions = acts;
      return this.state;
    }

    rumble(strong, weak, ms) {
      if (!this.settings.rumble || this.source !== 'wheel') return;
      for (const p of this.pads()) {
        const va = p.vibrationActuator;
        if (va && va.playEffect) {
          try { va.playEffect(va.type || 'dual-rumble', { duration: ms || 80, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) }); } catch (e) { /* unsupported */ }
        }
      }
    }

    /** Stop every pad's rumble motors right now (tab closing / hidden / unfocused, game paused). */
    stopRumble() {
      for (const p of this.pads()) {
        const va = p.vibrationActuator;
        if (!va) continue;
        try {
          if (va.reset) va.reset();
          else if (va.playEffect) va.playEffect(va.type || 'dual-rumble', { duration: 1, strongMagnitude: 0, weakMagnitude: 0 });
        } catch (e) { /* unsupported */ }
      }
    }

    // ------------------------------------------------------------------ calibration wizard
    /** Snapshot every axis & button of every pad. */
    snapshot() {
      return this.pads().map((p) => ({ id: p.id, axes: Array.from(p.axes), buttons: p.buttons.map((b) => (typeof b === 'object' ? b.value : b)) }));
    }
    /** Biggest change vs a baseline snapshot. exclude: set of "id|type|index". */
    detectChange(base, exclude) {
      const now = this.snapshot();
      let best = null;
      for (const p of now) {
        const b = base.find((q) => q.id === p.id);
        if (!b) continue;
        p.axes.forEach((v, i) => {
          const key = p.id + '|axis|' + i;
          if (exclude && exclude.has(key)) return;
          const d = Math.abs(v - (b.axes[i] || 0));
          if (d > 0.3 && (!best || d > best.d)) best = { pad: p.id, type: 'axis', index: i, d, v, rest: b.axes[i] };
        });
        p.buttons.forEach((v, i) => {
          const key = p.id + '|button|' + i;
          if (exclude && exclude.has(key)) return;
          const d = Math.abs(v - (b.buttons[i] || 0));
          if (d > 0.4 && (!best || d > best.d + 0.2)) best = { pad: p.id, type: 'button', index: i, d, v, rest: b.buttons[i] };
        });
      }
      return best;
    }
  }

  root.HCInput = { Input, ACTIONS, AXES, KEYMAP, DEFAULT_SETTINGS };
})(typeof self !== 'undefined' ? self : this);
