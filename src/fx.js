/* Hellcat Drive — effects: burnout smoke & dust (instanced soft billboards), skid marks, exhaust flames. */
(function (root) {
  'use strict';

  function smokeTexture(THREE) {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const blobs = [];
    for (let i = 0; i < 14; i++) blobs.push([S / 2 + (rnd() - 0.5) * S * 0.4, S / 2 + (rnd() - 0.5) * S * 0.4, S * (0.12 + rnd() * 0.18)]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let a = 0, lit = 0;
      for (const b of blobs) { const d = Math.hypot(x - b[0], y - b[1]) / b[2]; if (d < 1) { const v = (1 - d * d); a += v * 0.5; lit += v * (1 - (y - b[1]) / b[2] * 0.5); } }
      const r = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
      a *= Math.max(0, 1 - r * r);
      const i = (y * S + x) * 4;
      img.data[i] = Math.min(255, 150 + lit * 60); img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, a * 255);
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); return t;
  }

  class Particles {
    constructor(THREE, scene, max) {
      this.max = max; this.n = 0;
      this.P = new Float32Array(max * 3); this.V = new Float32Array(max * 3);
      this.age = new Float32Array(max); this.life = new Float32Array(max);
      this.s0 = new Float32Array(max); this.gr = new Float32Array(max); this.a0 = new Float32Array(max);
      this.rot = new Float32Array(max); this.rv = new Float32Array(max); this.shade = new Float32Array(max);
      const base = new THREE.PlaneGeometry(1, 1);
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
      this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.iPos.setUsage(THREE.DynamicDrawUsage);
      this.iData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.iData.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPos', this.iPos); g.setAttribute('iData', this.iData);
      g.instanceCount = 0;
      this.geo = g;
      this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: smokeTexture(THREE) }, uLight: { value: new THREE.Color(0.9, 0.9, 0.9) }, uAmb: { value: new THREE.Color(0.55, 0.58, 0.62) } }]);
      this.mat = new THREE.ShaderMaterial({
        uniforms: this.uniforms, transparent: true, depthWrite: false, fog: true,
        vertexShader: `attribute vec3 iPos; attribute vec4 iData; varying vec2 vUv; varying float vA; varying float vShade;
#include <fog_pars_vertex>
void main(){ vUv = uv; vA = iData.y; vShade = iData.w;
  float c = cos(iData.z), s = sin(iData.z);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iData.x;
  vec4 mvPosition = viewMatrix * vec4(iPos, 1.0); mvPosition.xy += p;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
        fragmentShader: `uniform sampler2D map; uniform vec3 uLight; uniform vec3 uAmb; varying vec2 vUv; varying float vA; varying float vShade;
#include <fog_pars_fragment>
void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vA; if (a < 0.004) discard;
  vec3 base = mix(vec3(0.9, 0.9, 0.92), vec3(0.52, 0.43, 0.32), vShade);
  vec3 col = base * (uAmb + uLight * (t.r * 0.6));
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`,
      });
      this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
      scene.add(this.mesh);
    }
    emit(x, y, z, vx, vy, vz, size, grow, life, alpha, shade) {
      let i;
      if (this.n < this.max) i = this.n++;
      else { i = Math.floor(Math.random() * this.max); }
      this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z;
      this.V[i * 3] = vx; this.V[i * 3 + 1] = vy; this.V[i * 3 + 2] = vz;
      this.age[i] = 0; this.life[i] = life; this.s0[i] = size; this.gr[i] = grow; this.a0[i] = alpha;
      this.rot[i] = Math.random() * 6.28; this.rv[i] = (Math.random() - 0.5) * 0.6; this.shade[i] = shade;
    }
    update(dt, windX, windZ, groundFn) {
      const P = this.P, V = this.V;
      for (let i = 0; i < this.n; i++) {
        this.age[i] += dt;
        if (this.age[i] >= this.life[i]) {
          const j = --this.n;
          if (i !== j) {
            P[i * 3] = P[j * 3]; P[i * 3 + 1] = P[j * 3 + 1]; P[i * 3 + 2] = P[j * 3 + 2];
            V[i * 3] = V[j * 3]; V[i * 3 + 1] = V[j * 3 + 1]; V[i * 3 + 2] = V[j * 3 + 2];
            this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.s0[i] = this.s0[j]; this.gr[i] = this.gr[j];
            this.a0[i] = this.a0[j]; this.rot[i] = this.rot[j]; this.rv[i] = this.rv[j]; this.shade[i] = this.shade[j];
          }
          i--; continue;
        }
        const drag = Math.exp(-dt * 1.6);
        V[i * 3] = V[i * 3] * drag + windX * (1 - drag);
        V[i * 3 + 1] = V[i * 3 + 1] * drag + (0.35 + 0.25 * (1 - this.shade[i])) * dt * 3;
        V[i * 3 + 2] = V[i * 3 + 2] * drag + windZ * (1 - drag);
        P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
        this.rot[i] += this.rv[i] * dt;
      }
      const ip = this.iPos.array, id = this.iData.array;
      for (let i = 0; i < this.n; i++) {
        const t = this.age[i] / this.life[i];
        ip[i * 3] = P[i * 3]; ip[i * 3 + 1] = P[i * 3 + 1]; ip[i * 3 + 2] = P[i * 3 + 2];
        id[i * 4] = this.s0[i] + this.gr[i] * Math.pow(this.age[i], 0.65);
        id[i * 4 + 1] = this.a0[i] * Math.min(1, this.age[i] * 6) * Math.pow(1 - t, 1.6);
        id[i * 4 + 2] = this.rot[i]; id[i * 4 + 3] = this.shade[i];
      }
      this.iPos.needsUpdate = true; this.iData.needsUpdate = true;
      this.geo.instanceCount = this.n;
      void groundFn;
    }
    setLight(sunColor, sunI, amb) {
      this.uniforms.uLight.value.copy(sunColor).multiplyScalar(Math.min(1.2, sunI * 0.32));
      this.uniforms.uAmb.value.setScalar(amb);
    }
  }

  class Skids {
    constructor(THREE, scene, max) {
      this.max = max; this.k = 0;
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array(max * 4 * 3); this.col = new Float32Array(max * 4 * 4);
      const idx = new Uint32Array(max * 6);
      for (let q = 0; q < max; q++) { const b = q * 4; idx.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], q * 6); }
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      this.geo = g;
      // double-sided: a mark laid while reversing winds the other way
      this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
      scene.add(this.mesh);
      this.last = [null, null, null, null];
      this.patchT = [0, 0, 0, 0];
    }
    _quad(pts, rgb, h) {
      const q = this.k; this.k = (this.k + 1) % this.max;
      const P = this.pos, Cc = this.col, b = q * 4;
      for (let v = 0; v < 4; v++) {
        const [x, z, al] = pts[v];
        P[(b + v) * 3] = x; P[(b + v) * 3 + 1] = h(x, z) + 0.012; P[(b + v) * 3 + 2] = z;
        Cc[(b + v) * 4] = rgb[0]; Cc[(b + v) * 4 + 1] = rgb[1]; Cc[(b + v) * 4 + 2] = rgb[2]; Cc[(b + v) * 4 + 3] = Math.min(0.85, al * 0.8);
      }
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
    }
    // p: contact point, (fx,fz): wheel forward dir (XZ), w: tyre width, a: intensity 0..1, h(x,z): ground height,
    // rgb: mark colour (rubber by default; soil for ruts on dirt / grass / gravel)
    add(wi, px, pz, fx, fz, w, a, h, rgb) {
      const L = this.last[wi];
      const rx = -fz, rz = fx; // lateral
      const cur = { x: px, z: pz, lx: px - rx * w / 2, lz: pz - rz * w / 2, rx: px + rx * w / 2, rz: pz + rz * w / 2, a };
      if (!L || a <= 0.02) { this.last[wi] = a > 0.02 ? cur : null; return; }
      const dx = px - L.x, dz = pz - L.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.04) return;
      if (d2 > 9) { this.last[wi] = cur; return; }
      this._quad([[L.lx, L.lz, L.a], [L.rx, L.rz, L.a], [cur.lx, cur.lz, a], [cur.rx, cur.rz, a]], rgb || Skids.RUBBER, h);
      this.last[wi] = cur;
    }
    // burnout: a tyre spinning on the spot lays rubber right where it sits. Translucent patches stack up, so the
    // longer you hold it the blacker the spot gets (and it smears forward as the car creeps)
    patch(wi, px, pz, fx, fz, w, a, h, dt) {
      this.patchT[wi] += dt;
      if (this.patchT[wi] < 0.05) return;
      this.patchT[wi] = 0;
      const j = () => Math.random() - 0.5;
      const ang = j() * 0.08, c = Math.cos(ang), s = Math.sin(ang);
      const ux = fx * c - fz * s, uz = fx * s + fz * c, rx = -uz, rz = ux;
      const cx = px + ux * j() * 0.12 + rx * j() * 0.03, cz = pz + uz * j() * 0.12 + rz * j() * 0.03;
      const hl = 0.16 + Math.random() * 0.08, hw = w * (0.46 + Math.random() * 0.06), al = a * 0.2;
      this._quad([[cx - ux * hl - rx * hw, cz - uz * hl - rz * hw, al], [cx - ux * hl + rx * hw, cz - uz * hl + rz * hw, al],
        [cx + ux * hl - rx * hw, cz + uz * hl - rz * hw, al], [cx + ux * hl + rx * hw, cz + uz * hl + rz * hw, al]], Skids.RUBBER, h);
    }
    break(wi) { this.last[wi] = null; }
    static get RUBBER() { return [0.018, 0.018, 0.02]; }
    clear() { this.pos.fill(0); this.col.fill(0); this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.last = [null, null, null, null]; }
  }

  function flameTexture(THREE) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,190,80,0.95)'); gr.addColorStop(0.6, 'rgba(255,80,10,0.5)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  class Flames {
    constructor(THREE, parent, tips) {
      const tex = flameTexture(THREE);
      this.sprites = tips.map((t) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true }));
        s.position.copy(t); s.visible = false; parent.add(s); s.userData.base = t.clone(); return s;
      });
      this.light = new THREE.PointLight(0xff7a2a, 0, 6, 2);
      for (const t of tips) this.light.position.add(t);
      this.light.position.multiplyScalar(1 / tips.length);
      parent.add(this.light);
      this.t = 0; this.lvl = 0;
    }
    pop(strength) { this.t = 0.07 + Math.random() * 0.06; this.str = strength || 1; }
    // continuous burn 0..1 (nitro: every pipe lit under power, flickering up and back out of the zoomies)
    burn(v) { this.lvl = v; }
    update(dt) {
      this.t -= dt;
      const pop = this.t > 0, lvl = this.lvl, on = pop || lvl > 0.04;
      for (const s of this.sprites) {
        s.visible = on;
        if (!on) continue;
        const b = s.userData.base;
        s.position.copy(b);
        if (pop) { const k = (0.25 + Math.random() * 0.3) * this.str; s.scale.set(k, k, k); s.position.z += k * 0.4; }
        else {
          const k = (0.16 + Math.random() * 0.3) * (0.35 + 0.8 * lvl);
          s.scale.set(k, k * 1.6, k); s.position.y += k * 0.55; s.position.z += k * 0.3; s.position.x += Math.sign(b.x) * k * 0.2;
        }
      }
      this.light.intensity = pop ? 12 * this.str : lvl * (5 + Math.random() * 5);
    }
  }

  root.HCFx = { Particles, Skids, Flames };
})(typeof self !== 'undefined' ? self : this);
