/* Hellcat Drive — procedural unicycle and its rider (no badges): a 24 in wheel (a silver rim on 36 spokes, a black
   treaded tyre), the black frame - its crown over the tyre, a leg down each side to the bearings - the seat post with its
   clamp, the saddle with its yellow bumpers fore and aft, the cranks straight on the hub (no gears, no freewheel) and the
   platform pedals, kept level. The rider sits up on it, arms out for balance, the legs following the pedals round.
   With the off-road package, a mountain-unicycle knobby in place of the street tyre.
   The jet version: a model-aircraft-class turbojet on a rack behind the saddle, its flame out of the back, a fuel tank
   under it; the rider in goggles.
   The physics runs the one tyre as four wheels (two 'axles' 10 cm apart, two side by side at each): one wheel is drawn
   at their middle, turning with them.
   Model space: origin on the ground under the hub, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build, plus afterWheels(), setRider(speed), setJet() and setJetSize(). */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const JET = opts.engine === 'jet';
    // (the improved pedal one: a geared hub - the cranks turn 0.3 times to the wheel's once, the physics' autoFinal)
    const GEAR = opts.engine === 'improved', CRK = 0.3;
    const cgH = opts.cgHeight || 1.0, zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || 0.05, cgToRear = opts.cgToRear || 0.05;
    const R = opts.wheelRadiusF || opts.wheelRadius || 0.305;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || {};
    const rootG = new THREE.Group(); rootG.name = 'unicycle';
    const model = new THREE.Group(); model.position.set(0, -cgH, zOff); rootG.add(model);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const toRoot = (v) => v.clone().add(V3(0, -cgH, zOff));
    const add = (parent, geo, mat, x, y, z, rx, ry, rz, cast) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = cast !== false; m.receiveShadow = true;
      parent.add(m); return m;
    };
    function rbox(w, h, d, r) {
      r = Math.max(0.002, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
      const s = new THREE.Shape(), x0 = -w / 2 + r, y0 = -h / 2 + r, x1 = w / 2 - r, y1 = h / 2 - r;
      s.moveTo(x0, -h / 2 + r); s.lineTo(x0, y1); s.lineTo(x1, y1); s.lineTo(x1, y0); s.lineTo(x0, y0);
      const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
      g.translate(0, 0, -(d - 2 * r) / 2); return g;
    }
    const cylX = (r0, r1, len, seg) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 20); g.rotateZ(Math.PI / 2); return g; };
    const cylZ = (r0, r1, len, seg, open) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 20, 1, !!open); g.rotateX(Math.PI / 2); return g; };
    const tubeAB = (parent, a, b, r, mat, seg) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = add(parent, new THREE.CylinderGeometry(r, r, len, seg || 10), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return m;
    };
    // a body from sections along z (superellipse), half-width w, from yb to yt
    function loft(secs, seg) {
      const N = seg || 24, pos = [], idx = [];
      for (const s of secs) {
        const e = 2 / (s.n || 2.5), yc = (s.yb + s.yt) / 2, hh = (s.yt - s.yb) / 2;
        for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); pos.push((s.xc || 0) + s.w * Math.sign(c) * Math.pow(Math.abs(c), e), yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), e), s.z); }
      }
      for (let r = 0; r < secs.length - 1; r++) for (let k = 0; k < N; k++) { const a = r * N + k, b = r * N + (k + 1) % N, c = a + N, d = b + N; idx.push(a, b, c, b, d, c); }
      const c0 = pos.length / 3; pos.push(secs[0].xc || 0, (secs[0].yb + secs[0].yt) / 2, secs[0].z);
      const c1 = pos.length / 3; const S = secs[secs.length - 1]; pos.push(S.xc || 0, (S.yb + S.yt) / 2, S.z);
      for (let k = 0; k < N; k++) { idx.push(c0, (k + 1) % N, k); idx.push(c1, (secs.length - 1) * N + k, (secs.length - 1) * N + (k + 1) % N); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    }

    // ---------------------------------------------------------------- materials
    const paintHex = PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : 0x101012;
    const M = {};
    M.paint = new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: 0.3, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    M.black = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.55, metalness: 0.2 });
    M.seat = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.6 });
    M.yellow = new THREE.MeshStandardMaterial({ color: 0xe8c40e, roughness: 0.45 });
    M.rim = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.22, metalness: 0.9 });
    M.spoke = new THREE.MeshStandardMaterial({ color: 0xd6d9dd, roughness: 0.3, metalness: 0.9 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.28, metalness: 0.9 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x1a1918, roughness: 0.92 });
    M.shirt = new THREE.MeshStandardMaterial({ color: JET ? 0x22262c : 0x2f6aa8, roughness: 0.8 });
    M.jeans = new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.85 });
    M.shoe = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.6 });
    M.skin = new THREE.MeshStandardMaterial({ color: 0xc89478, roughness: 0.6 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: JET ? 0xd01818 : 0xf0f0ee, roughness: 0.25, clearcoat: 1 });
    M.visor = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.8 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1a10, emissiveIntensity: 0.4, roughness: 0.3 });
    M.head = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 });
    const body = new THREE.Group(); model.add(body);
    const dyn = new THREE.Group(); model.add(dyn);
    const tips = [];

    // ---------------------------------------------------------------- the frame: the crown over the tyre, a leg down
    // each side to the bearing housings (drawn each frame to the hub, which rides the tyre's give), the seat post and its
    // clamp, the saddle with its bumpers
    const crownY = R + 0.36, legX = 0.055;
    add(body, rbox(0.15, 0.035, 0.05, 0.012), M.paint, 0, crownY, 0);
    const legs = [-1, 1].map((sx) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), M.paint); m.castShadow = true; dyn.add(m); return { m, sx }; });
    const bearings = [-1, 1].map((sx) => { const m = add(dyn, rbox(0.035, 0.05, 0.05, 0.01), M.paint, 0, 0, 0); return { m, sx }; });
    tubeAB(body, V3(0, crownY, 0), V3(0, 0.94, -0.01), 0.0145, M.paint, 14);
    add(body, new THREE.CylinderGeometry(0.019, 0.019, 0.03, 16), M.alu, 0, crownY + 0.21, -0.004);
    add(body, rbox(0.01, 0.02, 0.025, 0.004), M.alu, 0.022, crownY + 0.21, 0);
    // (the saddle: a long, narrow, upswept seat on its base, yellow bumpers front and back, the handle under its nose)
    const saddle = loft([{ z: -0.15, w: 0.035, yb: 0.975, yt: 1.005, n: 2.2 }, { z: -0.12, w: 0.05, yb: 0.955, yt: 0.995, n: 2.4 }, { z: -0.04, w: 0.055, yb: 0.948, yt: 0.982, n: 2.6 },
      { z: 0.04, w: 0.075, yb: 0.948, yt: 0.982, n: 2.6 }, { z: 0.1, w: 0.075, yb: 0.955, yt: 0.995, n: 2.6 }, { z: 0.135, w: 0.06, yb: 0.97, yt: 1.008, n: 2.4 }]);
    add(body, saddle, M.seat, 0, 0, 0);
    add(body, rbox(0.09, 0.03, 0.04, 0.012), M.yellow, 0, 0.99, -0.16);
    add(body, rbox(0.12, 0.035, 0.04, 0.014), M.yellow, 0, 0.995, 0.145);
    add(body, rbox(0.11, 0.012, 0.24, 0.005), M.black, 0, 0.942, 0.0);

    // ---------------------------------------------------------------- the wheel: hub, 36 spokes, the rim, the tyre - drawn
    // at the middle of the physics' four, turning with them; the cranks and pedals on the hub (the pedals kept level)
    const hub = new THREE.Group(); dyn.add(hub);
    const spin = new THREE.Group(); hub.add(spin);
    const W = 0.054, rimR = R - 0.04, tyreStock = [], tyreKnob = [];
    { const tyre = new THREE.TorusGeometry(R - W * 0.5, W * 0.5, 14, 64); tyre.rotateY(Math.PI / 2); tyreStock.push(add(spin, tyre, M.rubber, 0, 0, 0));
      // (a block tread round the crown)
      const N = 72; for (let k = 0; k < N; k++) for (const ox of (k & 1 ? [-0.012, 0.012] : [0])) { const b = add(spin, new THREE.BoxGeometry(0.012, 0.005, 0.014), M.rubber, ox, 0, 0, 0, 0, 0, false); b.geometry.translate(0, R - 0.002, 0); b.rotation.x = k * 2 * Math.PI / N; tyreStock.push(b); }
      // (the off-road package: a mountain-unicycle knobby - a carcass under tall square knobs, three across the crown and
      // four down the shoulders in turn, one merged mesh; shown in place of the street tyre by setTires)
      { const kh = 0.009, r = W * 0.5, Rc = R - kh * 0.6 - r, NK = Math.round(2 * Math.PI * R / 0.032), pos = [], nrm = [];
        for (let k = 0; k < NK; k++) for (const ph of (k & 1 ? [-1.15, -0.4, 0.4, 1.15] : [-0.78, 0, 0.78])) {
          const b = new THREE.BoxGeometry(W * 0.2, kh * 2, 0.017).toNonIndexed();
          b.rotateZ(-ph); b.translate((r + kh * 0.4) * Math.sin(ph), Rc + (r + kh * 0.4) * Math.cos(ph), 0); b.rotateX(k * 2 * Math.PI / NK);
          pos.push(...b.attributes.position.array); nrm.push(...b.attributes.normal.array);
        }
        const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); kg.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        const carc = new THREE.TorusGeometry(Rc, r, 14, 64); carc.rotateY(Math.PI / 2);
        for (const g of [carc, kg]) { const m = add(spin, g, M.rubber, 0, 0, 0); m.visible = false; tyreKnob.push(m); } }
      const rim = new THREE.TorusGeometry(rimR, 0.008, 6, 64); rim.rotateY(Math.PI / 2); rim.scale(2.2, 1, 1); add(spin, rim, M.rim, 0, 0, 0);
      add(spin, cylX(0.022, 0.022, 0.1, 16), M.alu, 0, 0, 0);
      for (const sx of [-1, 1]) add(spin, cylX(0.032, 0.032, 0.005, 20), M.alu, sx * 0.035, 0, 0);
      // 36 spokes, laced from the two hub flanges to the rim, crossing
      const sp = [];
      for (let k = 0; k < 36; k++) {
        const sx = k & 1 ? 1 : -1, a = k * 2 * Math.PI / 36, a0 = a + (k % 4 < 2 ? 0.35 : -0.35);
        const p0 = V3(sx * 0.035, Math.cos(a0) * 0.03, Math.sin(a0) * 0.03), p1 = V3(sx * 0.006, Math.cos(a) * (rimR - 0.005), Math.sin(a) * (rimR - 0.005));
        const d = p1.clone().sub(p0), g = new THREE.CylinderGeometry(0.0012, 0.0012, d.length(), 4);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize())); g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2); sp.push(g);
      }
      for (const g of sp) add(spin, g, M.spoke, 0, 0, 0, 0, 0, 0, false);
    }
    const CR = 0.125, pedals = [];
    // (geared: the cranks on their own axle through the hub, the fat hub shell round the gears)
    const crankG = GEAR ? new THREE.Group() : spin; let crankA = 0, lastSpin = 0;
    if (GEAR) { hub.add(crankG); add(spin, cylX(0.05, 0.05, 0.08, 24), M.alu, 0, 0, 0); for (const sx of [-1, 1]) add(spin, cylX(0.042, 0.042, 0.01, 24), M.black, sx * 0.043, 0, 0); }
    for (const sx of [-1, 1]) {
      // (the cranks opposite each other, the left one down at the start)
      const arm = add(crankG, rbox(0.018, CR + 0.03, 0.014, 0.006), M.black, sx * 0.075, sx < 0 ? -CR / 2 : CR / 2, 0);
      void arm;
      const pd = new THREE.Group(); dyn.add(pd);
      add(pd, rbox(0.1, 0.018, 0.09, 0.006), M.black, sx * 0.05, 0, 0);
      for (const dz of [-0.04, 0.04]) add(pd, rbox(0.1, 0.006, 0.006, 0.002), M.alu, sx * 0.05, 0.01, dz, 0, 0, 0, false);
      add(pd, cylX(0.007, 0.007, 0.03, 8), M.alu, -sx * 0.005, 0, 0);
      pedals.push({ g: pd, sx, a0: sx < 0 ? Math.PI : 0 });
    }

    // ---------------------------------------------------------------- the jet: a small turbojet on a rack behind the
    // saddle, its thrust line through the rider's centre of gravity; a fuel tank under it, the flame out of the back
    let jetFan = null, jetFx = null, jg = null;
    if (JET) {
      jg = new THREE.Group(); jg.position.set(0, 1.0, 0.24); body.add(jg);
      const er = 0.06, eL = 0.36;
      const bell = new THREE.LatheGeometry([[0.085, 0], [0.08, 0.01], [0.072, 0.03], [0.065, 0.06]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
      bell.rotateX(Math.PI / 2); add(jg, bell, Object.assign(M.alu.clone(), { side: THREE.DoubleSide }), 0, 0, 0);
      jetFan = new THREE.Group(); jetFan.position.set(0, 0, 0.055); jg.add(jetFan);
      add(jetFan, new THREE.CircleGeometry(0.06, 24), M.black, 0, 0, 0.003);
      add(jetFan, cylZ(0.001, 0.02, 0.03, 12), M.alu, 0, 0, -0.012, Math.PI, 0, 0);
      for (let k = 0; k < 11; k++) { const b = add(jetFan, new THREE.BoxGeometry(0.005, 0.048, 0.012), M.alu, 0, 0, 0); b.geometry.translate(0, 0.035, 0); b.rotation.set(0, 0.5, k * 2 * Math.PI / 11, 'ZYX'); }
      add(jg, cylZ(er, er, eL, 28), M.alu, 0, 0, 0.06 + eL / 2);
      for (const dz of [0.04, 0.2, 0.34]) add(jg, new THREE.TorusGeometry(er + 0.003, 0.004, 6, 28), M.black, 0, 0, 0.06 + dz);
      const heat = new THREE.MeshStandardMaterial({ color: 0x7a6a78, roughness: 0.3, metalness: 1 });
      const zN = 0.06 + eL;
      add(jg, cylZ(er - 0.006, 0.042, 0.1, 24, true), heat, 0, 0, zN + 0.05);
      add(jg, new THREE.CircleGeometry(0.04, 20), M.black, 0, 0, zN + 0.02, 0, Math.PI, 0);
      // (the rack: two struts down to the frame's crown, two to the seat post; the fuel tank strapped under the engine)
      for (const sx of [-1, 1]) { tubeAB(body, V3(sx * 0.05, 0.935, 0.2), V3(sx * 0.03, crownY + 0.02, 0.02), 0.008, M.black); tubeAB(body, V3(sx * 0.05, 0.935, 0.5), V3(sx * 0.015, 0.86, 0.0), 0.007, M.black); }
      add(body, rbox(0.1, 0.012, 0.42, 0.004), M.black, 0, 0.935, 0.43);
      add(body, cylZ(0.04, 0.04, 0.24, 18), M.paint, 0, 0.89, 0.4);
      for (const dz of [0.33, 0.47]) add(body, new THREE.TorusGeometry(0.042, 0.004, 6, 18), M.alu, 0, 0.89, dz);
      const flameMat = (core) => new THREE.ShaderMaterial({
        uniforms: { uAB: { value: 0 }, uThr: { value: 0 }, uT: { value: 0 }, uCore: { value: core ? 1 : 0 } },
        vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: `uniform float uAB; uniform float uThr; uniform float uT; uniform float uCore; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main() {
            float t = 1.0 - vUv.y;
            float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
            float flick = 0.85 + 0.15 * sin(uT * 53.0 + t * 9.0) * sin(uT * 31.0 + 1.3);
            vec3 hot = mix(vec3(1.0, 0.93, 0.78), vec3(1.0, 0.52, 0.14), smoothstep(0.0, 0.45, t));
            hot = mix(hot, vec3(0.85, 0.2, 0.06), smoothstep(0.45, 1.0, t));
            float a = edge * (1.0 - smoothstep(0.15, 1.0, t)) * flick * (uCore > 0.5 ? 1.5 : 0.8) * (0.08 + uThr * 0.7);
            gl_FragColor = vec4(hot * a, 1.0);
            #include <colorspace_fragment>
          }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      });
      const plumeGeo = (r0, r1) => { const g = new THREE.CylinderGeometry(r0, r1, 1, 20, 6, true); g.translate(0, -0.5, 0); g.rotateX(-Math.PI / 2); return g; };
      jetFx = { outer: add(jg, plumeGeo(0.045, 0.025), flameMat(false), 0, 0, zN + 0.1, 0, 0, 0, false), core: add(jg, plumeGeo(0.032, 0.006), flameMat(true), 0, 0, zN + 0.1, 0, 0, 0, false), t: 0 };
      jetFx.outer.renderOrder = 5; jetFx.core.renderOrder = 6;
      tips.push(toRoot(V3(0, 1.0, 0.24 + zN + 0.12)));
    }

    // ---------------------------------------------------------------- the rider: sat up on the saddle, arms out for balance
    // (or, on the jet, holding on to the saddle's handle with one hand), the legs following the pedals round
    const rider = new THREE.Group(); body.add(rider);
    const hip = V3(0, 1.04, 0.025), lean = 0.12;
    const tor = (x, y, z) => V3(hip.x + x, hip.y + y * Math.cos(lean) + z * Math.sin(lean), hip.z - y * Math.sin(lean) + z * Math.cos(lean));
    { const torso = [[-0.04, 0.15, 0.09, 0.1], [0.1, 0.145, 0.09, 0.09], [0.26, 0.16, 0.1, 0.09], [0.4, 0.19, 0.09, 0.09], [0.48, 0.18, 0.07, 0.08], [0.53, 0.08, 0.05, 0.05]];
      const tg = loft(torso.map(([hh, w, dF, dB]) => ({ z: hh, w, yb: -dB, yt: dF, n: 2.6 })), 24); tg.rotateX(-Math.PI / 2); tg.rotateX(-lean);
      add(rider, tg, M.shirt, hip.x, hip.y, hip.z);
      add(rider, loft([{ z: -0.08, w: 0.15, yb: -0.09, yt: 0.09, n: 2.4 }, { z: 0.08, w: 0.16, yb: -0.1, yt: 0.1, n: 2.4 }], 20).rotateX(-Math.PI / 2), M.jeans, hip.x, hip.y + 0.02, hip.z); }
    const neck = tor(0, 0.58, 0), hd = tor(0, 0.71, -0.01);
    add(rider, new THREE.CylinderGeometry(0.045, 0.05, 0.12, 12), M.skin, neck.x, neck.y, neck.z, -lean, 0, 0);
    add(rider, new THREE.SphereGeometry(0.1, 20, 14), M.skin, hd.x, hd.y, hd.z);
    { const hm = add(rider, new THREE.SphereGeometry(0.118, 22, 14, 0, Math.PI * 2, 0, 1.75), M.helmet, hd.x, hd.y + 0.012, hd.z + 0.01); hm.scale.set(0.95, 1, 1.1); }
    if (JET) { for (const sx of [-1, 1]) add(rider, cylZ(0.026, 0.026, 0.03, 14), M.visor, hd.x + sx * 0.04, hd.y + 0.01, hd.z - 0.095); add(rider, new THREE.TorusGeometry(0.104, 0.007, 6, 24), M.black, hd.x, hd.y + 0.01, hd.z, 0, 0, 0); }
    const limb = (a, c, l1, l2, pole, r0, r1, r2, mat) => {
      const d = c.clone().sub(a), len = Math.min(d.length(), l1 + l2 - 1e-3), dir = d.normalize();
      const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
      const pp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
      return { j: a.clone().add(dir.clone().multiplyScalar(x)).add(pp.multiplyScalar(h)), e: a.clone().add(dir.multiplyScalar(len)) };
    };
    const seg = (parent, p, q, ra, rb, mat) => { const v = q.clone().sub(p), m = add(parent, new THREE.CylinderGeometry(rb, ra, v.length(), 12), mat, (p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2); m.quaternion.setFromUnitVectors(V3(0, 1, 0), v.normalize()); return m; };
    for (const sx of [-1, 1]) {
      const sh = tor(sx * 0.18, 0.46, 0);
      add(rider, new THREE.SphereGeometry(0.052, 12, 10), M.shirt, sh.x, sh.y, sh.z);
      const hand = JET && sx < 0 ? V3(-0.02, 1.0, -0.2) : V3(sx * 0.62, 1.33 + (sx > 0 ? 0.05 : -0.02), hip.z - 0.12);
      const L = limb(sh, hand, 0.3, 0.29, JET && sx < 0 ? V3(-0.6, 0, 0.6) : V3(0, -0.5, 0.4));
      seg(rider, sh, L.j, 0.045, 0.04, M.shirt); seg(rider, L.j, L.e, 0.038, 0.032, M.skin);
      add(rider, new THREE.SphereGeometry(0.038, 10, 8), M.skin, L.e.x, L.e.y, L.e.z);
    }
    // legs: rods placed each frame, hip to knee to the pedal
    const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
    const legRig = [-1, 1].map((sx) => {
      const mk = (mat) => { const m = new THREE.Mesh(rodGeo, mat); m.castShadow = true; rider.add(m); return m; };
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), M.jeans); knee.castShadow = true; rider.add(knee);
      const shoe = new THREE.Mesh(rbox(0.1, 0.07, 0.26, 0.03), M.shoe); shoe.castShadow = true; rider.add(shoe);
      return { sx, thigh: mk(M.jeans), shin: mk(M.jeans), knee, shoe };
    });
    const _u = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
    const place = (m, a, b, r) => { _d.subVectors(b, a); const l = _d.length(); m.position.addVectors(a, b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(_u, _d.multiplyScalar(1 / Math.max(l, 1e-6))); m.scale.set(r, l, r); };
    // (the first-person eye: the rider's, looking a touch down the road)
    const eye = toRoot(V3(hd.x, hd.y + 0.01, hd.z - 0.08));

    // ---------------------------------------------------------------- the wheels the game drives (nothing drawn on
    // them: the one wheel above follows their middle)
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1;
      const corner = new THREE.Group(); corner.position.set(side * 0.01, R - cgH, frontW ? -cgToFront : cgToRear); rootG.add(corner);
      const flip = new THREE.Group(); corner.add(flip); const sp = new THREE.Group(); flip.add(sp);
      wheels.push({ corner, flip, spin: sp, left: false, front: frontW, side, stock: [], pkg: [] });
    }

    // ---------------------------------------------------------------- per frame
    const _a = new THREE.Vector3(), _p = new THREE.Vector3();
    function afterWheels() {
      // the hub at the middle of the four (in model space), turning with them
      _a.set(0, 0, 0); for (const w of wheels) _a.add(w.corner.position); _a.multiplyScalar(0.25).add(V3(0, cgH, -zOff));
      hub.position.copy(_a);
      spin.rotation.x = wheels[0].spin.rotation.x;
      // the frame's legs from the crown to the bearings on the hub
      for (const L of legs) { const top = V3(L.sx * legX, crownY - 0.01, 0), bot = V3(L.sx * legX, _a.y, _a.z); place(L.m, top, bot, 0.011); }
      for (const b of bearings) b.m.position.set(b.sx * legX, _a.y, _a.z);
      // the pedals round on their cranks, kept level; the legs follow them (knees forward and out a little)
      if (GEAR) { let d = spin.rotation.x - lastSpin; d = Math.atan2(Math.sin(d), Math.cos(d)); lastSpin = spin.rotation.x; crankA += d * CRK; crankG.rotation.x = crankA; }
      for (let k = 0; k < 2; k++) {
        const P = pedals[k], a = (GEAR ? crankA : spin.rotation.x) + P.a0;
        _p.set(P.sx * 0.1, _a.y + Math.cos(a) * CR, _a.z + Math.sin(a) * CR);
        P.g.position.copy(_p);
        const G = legRig[k], hp = V3(P.sx * 0.09, hip.y, hip.z), ft = _p.clone().add(V3(P.sx * 0.03, 0.045, -0.02));
        const L = limb(hp, ft, 0.43, 0.42, V3(P.sx * 0.15, 0.2, -1));
        place(G.thigh, hp, L.j, 0.068); place(G.shin, L.j, L.e, 0.05);
        G.knee.position.copy(L.j); G.shoe.position.copy(L.e).add(V3(0, -0.01, -0.02));
      }
    }
    function setRider() {}
    function setPaint(name) { const c = PAINTS[name]; if (c !== undefined) M.paint.color.setHex(c); }
    function setLights(o) { M.tail.emissiveIntensity = o.brake ? 4 : 0.4; }
    function setInteriorVisible(v, cockpit) { rider.visible = !cockpit; }
    function setJetSize(sz) { if (jg) jg.scale.setScalar(clamp(sz, 0.6, 2)); }
    function setJet(N, ab, thr, dt) {
      if (!jetFx) return;
      jetFx.t += dt;
      jetFan.rotation.z += N * 45 * dt;
      const on = thr > 0.05;
      jetFx.outer.visible = jetFx.core.visible = on;
      if (!on) return;
      jetFx.outer.scale.z = 0.3 + 0.9 * thr; jetFx.core.scale.z = 0.2 + 0.5 * thr;
      for (const m of [jetFx.outer.material, jetFx.core.material]) { m.uniforms.uAB.value = ab; m.uniforms.uThr.value = thr; m.uniforms.uT.value = jetFx.t; }
    }
    const noop = () => {};
    afterWheels();
    return {
      root: rootG, model, exterior: model, interior: model, wheels, steerWheel: new THREE.Group(), eye,
      exhaustTips: tips, materials: M, headlights: [], tailLens: [], mirrors: [],
      setPaint, setLights, setInteriorVisible,
      // (the off-road package's knobby - ccKnob - in place of the street tyre)
      setTires(front, rear) { const on = front === 'ccKnob' || rear === 'ccKnob'; for (const m of tyreStock) m.visible = !on; for (const m of tyreKnob) m.visible = on; }, setTransmission: noop, drawCluster: noop, drawScreen: noop, setChute: noop,
      afterWheels, setRider, setJet: JET ? setJet : undefined, setJetSize: JET ? setJetSize : undefined, variant: 'unicycle', cls: JET ? 'jet' : 'pedal',
    };
  }

  root.HCUnicycle = { build };
})(typeof self !== 'undefined' ? self : this);
