/* Hellcat Drive — procedural main battle tank, built like an M1A2 Abrams: the long, low hull with its shallow upper
   glacis, armoured side skirts over seven dual road wheels a side, the drive sprocket at the back and the idler at the
   front, rubber-padded tracks that run at each track's own speed (the physics drives them apart to steer); the flat-
   faced turret with the bustle rack behind, the commander's cupola with a .50 cal, the loader's M240, the gunner's
   sight and the commander's viewer on the roof, smoke dischargers on the cheeks, and the 120 mm gun with its thermal
   sleeve and fume extractor. Three-tone camouflage laid on in the tank's own space (the paint colour is its base
   tone). setTurret(yaw, elevation): the game turns the turret and lifts the gun - it follows where you look.
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build, plus afterWheels() and setTurret(). */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const cgH = opts.cgHeight || 1.15, zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || 1.2, cgToRear = opts.cgToRear || 1.2;
    const trackX = (opts.trackF || 2.95) / 2, RW = opts.wheelRadius || 0.36;
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || {};
    const rootG = new THREE.Group(); rootG.name = 'tank';
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
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cylX = (r0, r1, len, seg) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24); g.rotateZ(Math.PI / 2); return g; };
    const cylZ = (r0, r1, len, seg) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24); g.rotateX(Math.PI / 2); return g; };
    const tubeAB = (parent, a, b, r, mat, seg) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = add(parent, new THREE.CylinderGeometry(r, r, len, seg || 8), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return m;
    };
    // a (z, y) side profile extruded across the tank, w wide, centred on x
    function profile(pts, w) {
      const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
      g.rotateY(-Math.PI / 2); g.translate(w / 2, 0, 0);
      return g;
    }
    // a prism from a convex outline at the bottom and another at the top (both [x, z], the same count), heights y0 / y1
    function prism(bot, top, y0, y1) {
      const n = bot.length, pos = [];
      const B = bot.map(([x, z]) => [x, y0, z]), T = top.map(([x, z]) => [x, y1, z]);
      const tri = (a, b, c) => pos.push(...a, ...b, ...c);
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(B[i], T[j], B[j]); tri(B[i], T[i], T[j]); }
      for (let i = 1; i < n - 1; i++) { tri(T[0], T[i + 1], T[i]); tri(B[0], B[i], B[i + 1]); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      return g;
    }

    // ---------------------------------------------------------------- materials
    // camouflage: the base tone (the paint) with brown and black-green blobs, laid on in the hull's (or the turret's)
    // own space, so it stays put on the armour as the tank drives and the turret turns
    const base = PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : 0xbfa07e;
    const hullInv = { value: new THREE.Matrix4() }, turInv = { value: new THREE.Matrix4() };
    function camoMat(inv, rough) {
      const m = new THREE.MeshStandardMaterial({ color: base, roughness: rough || 0.82, metalness: 0.06 });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uInv = inv; sh.uniforms.uBrown = { value: new THREE.Color(0x5e412a) }; sh.uniforms.uDark = { value: new THREE.Color(0x23281d) };
        sh.vertexShader = 'uniform mat4 uInv;\nvarying vec3 vCamo;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCamo = (uInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = 'uniform vec3 uBrown;\nuniform vec3 uDark;\nvarying vec3 vCamo;\n'
          + 'float cH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }\n'
          + 'float cN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);\n'
          + '  return mix(mix(mix(cH(i), cH(i + vec3(1, 0, 0)), f.x), mix(cH(i + vec3(0, 1, 0)), cH(i + vec3(1, 1, 0)), f.x), f.y),\n'
          + '             mix(mix(cH(i + vec3(0, 0, 1)), cH(i + vec3(1, 0, 1)), f.x), mix(cH(i + vec3(0, 1, 1)), cH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }\n'
          + 'float cF(vec3 p) { return cN(p) * 0.62 + cN(p * 2.3) * 0.28 + cN(p * 5.1) * 0.1; }\n'
          + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n'
            + '  float ca = cF(vCamo * 0.75), cb = cF(vCamo * 0.75 + vec3(17.3, 5.1, 9.7));\n'
            + '  diffuseColor.rgb = mix(diffuseColor.rgb, uBrown, smoothstep(0.55, 0.57, ca));\n'
            + '  diffuseColor.rgb = mix(diffuseColor.rgb, uDark, smoothstep(0.6, 0.62, cb));');
      };
      return m;
    }
    const M = {};
    M.hull = camoMat(hullInv); M.tur = camoMat(turInv); M.paint = M.hull;
    M.dark = new THREE.MeshStandardMaterial({ color: 0x1c1d1a, roughness: 0.7, metalness: 0.3 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92 });
    M.wheel = new THREE.MeshStandardMaterial({ color: 0x4a4d3c, roughness: 0.6, metalness: 0.3 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0x3e4040, roughness: 0.5, metalness: 0.7 });
    M.gun = new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.45, metalness: 0.6 });
    M.glass = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.8 });
    M.grille = new THREE.MeshStandardMaterial({ map: (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
      g.fillStyle = '#121312'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#3a3c36'; for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 6); return t; })(), roughness: 0.7, metalness: 0.4 });
    M.head = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1a10, emissiveIntensity: 0.4, roughness: 0.3 });
    M.suit = new THREE.MeshStandardMaterial({ color: 0x6b6247, roughness: 0.85 });
    M.helmet = new THREE.MeshStandardMaterial({ color: 0x5b5a3e, roughness: 0.7 });
    M.skin = new THREE.MeshStandardMaterial({ color: 0xc89478, roughness: 0.6 });
    // the track links: steel shoes, a rubber pad down each, the end connectors - or, with the off-road package's pads
    // off (grouser), the bare shoes: worn bright steel with a raised grouser bar across each
    function trackTex(grouser) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
      // (u runs along the track - one link a tile - v across it)
      g.fillStyle = grouser ? '#3e4042' : '#2a2c2e'; g.fillRect(0, 0, 64, 128);
      g.fillStyle = '#0e0f10'; g.fillRect(0, 0, 6, 128);
      if (grouser) {
        g.fillStyle = '#16171a'; g.fillRect(30, 7, 8, 114);
        g.fillStyle = '#8c9096'; g.fillRect(22, 7, 8, 114);
        g.fillStyle = '#5c5f64'; g.fillRect(12, 7, 10, 114); g.fillRect(40, 7, 18, 114);
      } else { g.fillStyle = '#18191a'; g.fillRect(12, 10, 46, 50); g.fillRect(12, 68, 46, 50); }
      g.fillStyle = '#50535a'; g.fillRect(0, 0, 64, 7); g.fillRect(0, 121, 64, 7); g.fillRect(0, 60, 64, 8);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    }

    const body = new THREE.Group(); model.add(body);
    const tips = [], spots = [];

    // ---------------------------------------------------------------- the hull
    // (between the tracks: the lower hull, its lower glacis down to the belly; over them: the upper hull and fenders, the
    // long shallow upper glacis, the vertical rear with its exhaust grille)
    add(body, profile([[-3.35, 0.5], [3.72, 0.5], [3.95, 0.62], [3.95, 1.1], [-3.95, 1.1], [-3.95, 1.02]], 2.24), M.hull, 0, 0, 0);
    add(body, profile([[-3.95, 1.1], [3.95, 1.1], [3.95, 1.46], [-2.3, 1.46], [-3.95, 1.2]], 3.5), M.hull, 0, 0, 0);
    // the engine deck grilles, the rear grille, the driver's hatch and periscopes
    add(body, box(2.0, 0.02, 1.9), M.grille, 0, 1.47, 2.7);
    add(body, box(1.2, 0.02, 0.7), M.grille, 0, 1.47, 1.35);
    add(body, box(2.0, 0.6, 0.02), M.grille, 0, 1.05, 3.96);
    add(body, cylX(0.34, 0.34, 0.04, 24), M.hull, 0, 1.47, -2.55, 0, 0, Math.PI / 2);
    for (const dx of [-0.2, 0, 0.2]) { const p = add(body, box(0.14, 0.08, 0.1), M.dark, dx, 1.51, -2.86 + Math.abs(dx) * 0.25, 0, -dx * 1.2, 0); add(p, box(0.12, 0.05, 0.005), M.glass, 0, 0.005, -0.051); }
    // fenders' front lights and the rear lights, tow shackles, the rear stowage
    for (const sx of [-1, 1]) {
      const hl = add(body, box(0.26, 0.14, 0.12), M.dark, sx * 1.52, 1.23, -3.86);
      add(hl, new THREE.CircleGeometry(0.045, 16), M.head, sx * 0.06, 0.01, -0.061); add(hl, new THREE.CircleGeometry(0.03, 12), M.head, -sx * 0.07, 0.01, -0.061);
      add(body, box(0.2, 0.12, 0.06), M.dark, sx * 1.52, 1.34, 3.97); add(body, box(0.16, 0.06, 0.01), M.tail, sx * 1.52, 1.34, 4.0, 0, 0, 0, false);
      add(body, new THREE.TorusGeometry(0.07, 0.022, 8, 16), M.steel, sx * 0.85, 0.82, -3.98, Math.PI / 2, 0, 0);
      add(body, box(0.5, 0.36, 0.5), M.hull, sx * 1.45, 1.64, 3.2);
    }
    const spot = (sx) => {
      const sl = new THREE.SpotLight(0xf2f4ff, 0, 90, 0.5, 0.45, 1.4);
      sl.position.copy(toRoot(V3(sx * 1.52, 1.23, -3.95))); sl.target.position.copy(toRoot(V3(sx * 1.8, 0, -45)));
      rootG.add(sl); rootG.add(sl.target); sl.visible = false; spots.push(sl);
    };
    spot(-1); spot(1);
    for (const x of [-0.55, 0.55]) tips.push(toRoot(V3(x, 1.05, 4.0)));

    // ---------------------------------------------------------------- the running gear (each side its own group: it
    // follows that side's suspension, and its track runs at that track's speed)
    const RWZ = [-2.2, -1.48, -0.76, -0.04, 0.68, 1.4, 2.12], RWR = 0.32, TT = 0.07, TW = 0.635;
    const IDL = { z: -2.95, y: 0.6, r: 0.29 }, SPR = { z: 3.08, y: 0.66, r: 0.33 }, RET = [-1.2, 0.3, 1.8];
    // the track's loop: the convex hull round the road wheels, the idler, the sprocket and the return rollers (outer skin)
    const loop = (() => {
      const pts = [], circ = (z, y, r) => { for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; pts.push([z + Math.cos(a) * r, y + Math.sin(a) * r]); } };
      for (const z of RWZ) circ(z, TT + RWR, RWR + TT);
      circ(IDL.z, IDL.y, IDL.r + TT); circ(SPR.z, SPR.y, SPR.r + TT);
      for (const z of RET) circ(z, 0.9, 0.11 + TT);
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], up = [];
      for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
      for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
      const hull = lo.slice(0, -1).concat(up.slice(0, -1));
      // (evenly spaced along it)
      const L = [0]; for (let i = 1; i <= hull.length; i++) { const a = hull[i - 1], b = hull[i % hull.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
      const tot = L[hull.length], n = Math.round(tot / 0.05), out = [];
      for (let k = 0, j = 0; k < n; k++) {
        const s = k * tot / n; while (L[j + 1] < s) j++;
        const a = hull[j], b = hull[(j + 1) % hull.length], f = (s - L[j]) / (L[j + 1] - L[j] || 1);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, s]);
      }
      return { pts: out, len: tot };
    })();
    function trackGeo() {
      const P = loop.pts, n = P.length, pos = [], uv = [], idx = [], h = TW / 2;
      // outward normal at each point (the loop runs anticlockwise in (z, y))
      const N = P.map((p, i) => { const a = P[(i - 1 + n) % n], b = P[(i + 1) % n], dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy) || 1; return [dy / l, -dz / l]; });
      const ring = (off, uAt) => { const s = pos.length / 3; for (let i = 0; i <= n; i++) { const p = P[i % n], nn = N[i % n], u = (i === n ? loop.len : p[2]) / 0.19;
        for (const x of [-h, h]) { pos.push(x, p[1] - nn[1] * off, p[0] - nn[0] * off); uv.push(u, x < 0 ? uAt[0] : uAt[1]); } } return s; };
      const o = ring(0, [0, 1]), ii = ring(TT, [0, 1]);
      for (let i = 0; i < n; i++) {
        const a = o + i * 2, b = a + 2, c = ii + i * 2, d = c + 2;
        idx.push(a, b, a + 1, b, b + 1, a + 1);                         // the tread (outside)
        idx.push(c, c + 1, d, d, c + 1, d + 1);                         // the inside (the wheels' path)
        idx.push(a, c, b, b, c, d); idx.push(a + 1, b + 1, c + 1, b + 1, d + 1, c + 1);     // the edges
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    const tGeo = trackGeo(), sides = [];
    for (const sx of [-1, 1]) {
      const sg = new THREE.Group(); sg.position.x = sx * trackX; body.add(sg);
      const tex = trackTex(false), texG = trackTex(true); tex.repeat.set(1, 1); texG.repeat.set(1, 1);
      const tm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.45, side: THREE.DoubleSide });
      add(sg, tGeo, tm, 0, 0, 0);
      const spin = [];
      // seven dual road wheels (two tyred discs a wheel, the track's guide horns run between them)
      for (const z of RWZ) {
        const wg = new THREE.Group(); wg.position.set(0, TT + RWR, z); sg.add(wg); spin.push({ g: wg, r: RWR });
        for (const dx of [-0.17, 0.17]) {
          add(wg, cylX(RWR, RWR, 0.2, 28), M.rubber, dx, 0, 0);
          add(wg, cylX(RWR - 0.05, RWR - 0.05, 0.205, 28), M.wheel, dx, 0, 0);
          add(wg, cylX(0.08, 0.08, 0.22, 12), M.steel, dx, 0, 0);
          for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; add(wg, cylX(0.03, 0.03, 0.21, 8), M.dark, dx, Math.cos(a) * 0.17, Math.sin(a) * 0.17); }
        }
      }
      // the idler (front) and the drive sprocket (rear, toothed), the return rollers
      { const ig = new THREE.Group(); ig.position.set(0, IDL.y, IDL.z); sg.add(ig); spin.push({ g: ig, r: IDL.r });
        for (const dx of [-0.17, 0.17]) { add(ig, cylX(IDL.r, IDL.r, 0.2, 28), M.wheel, dx, 0, 0); add(ig, cylX(0.07, 0.07, 0.22, 12), M.steel, dx, 0, 0); } }
      { const pg = new THREE.Group(); pg.position.set(0, SPR.y, SPR.z); sg.add(pg); spin.push({ g: pg, r: SPR.r });
        for (const dx of [-0.2, 0.2]) {
          add(pg, cylX(SPR.r - 0.04, SPR.r - 0.04, 0.08, 28), M.steel, dx, 0, 0);
          for (let k = 0; k < 11; k++) { const a = k * 2 * Math.PI / 11, t = add(pg, box(0.08, 0.07, 0.06), M.steel, dx, Math.cos(a) * (SPR.r - 0.02), Math.sin(a) * (SPR.r - 0.02)); t.rotation.x = -a; }
        }
        add(pg, cylX(0.14, 0.14, 0.5, 16), M.dark, 0, 0, 0); }
      for (const z of RET) { const rg = new THREE.Group(); rg.position.set(0, 0.9, z); sg.add(rg); spin.push({ g: rg, r: 0.11 }); add(rg, cylX(0.11, 0.11, 0.3, 16), M.wheel, 0, 0, 0); }
      sides.push({ g: sg, tex, texG, tm, spin, travel: 0, prev: null, sx });
    }
    // the armoured side skirts: over the tops of the road wheels and the top run, thicker ballistic panels at the front
    for (const sx of [-1, 1]) {
      add(body, profile([[-3.62, 1.1], [3.2, 1.1], [3.2, 0.64], [-2.9, 0.64], [-3.62, 0.86]], 0.07), M.hull, sx * 1.8, 0, 0);
      add(body, profile([[-3.6, 1.1], [-1.4, 1.1], [-1.4, 0.62], [-2.9, 0.62]], 0.1), M.hull, sx * 1.86, 0, 0);
      for (let k = 0; k < 6; k++) add(body, box(0.012, 0.44, 0.012), M.dark, sx * 1.84, 0.87, -1.4 + k * 0.76);
    }

    // ---------------------------------------------------------------- the turret (turns about its ring) and the gun
    const turG = new THREE.Group(); turG.position.set(0, 1.46, -0.35); body.add(turG);
    const outline = [[0.44, -2.05], [1.56, -1.45], [1.8, -0.86], [1.8, 1.02], [1.62, 1.28], [1.58, 2.22], [-1.58, 2.22], [-1.62, 1.28], [-1.8, 1.02], [-1.8, -0.86], [-1.56, -1.45], [-0.44, -2.05]];
    const top = outline.map(([x, z]) => [x * 0.93, z < -1 ? z * 0.95 + 0.04 : z - 0.04]);
    add(turG, prism(outline, top, 0, 0.84), M.tur, 0, 0, 0);
    // the mantlet, and the gun on its trunnions
    add(turG, box(0.86, 0.56, 0.3), M.tur, 0, 0.44, -2.02);
    const gunG = new THREE.Group(); gunG.position.set(0, 0.46, -2.1); turG.add(gunG);
    add(gunG, cylZ(0.13, 0.15, 0.45, 20), M.tur, 0, 0, -0.2);
    add(gunG, cylZ(0.088, 0.09, 5.0, 20), M.tur, 0, 0, -2.9);
    for (const z of [-0.9, -1.3, -2.9, -3.6, -4.3]) add(gunG, cylZ(0.097, 0.097, 0.05, 20), M.tur, 0, 0, z);
    add(gunG, cylZ(0.13, 0.15, 0.55, 20), M.tur, 0, 0, -2.0);                         // the fume extractor
    add(gunG, cylZ(0.1, 0.098, 0.3, 20), M.gun, 0, 0, -5.3);                           // the muzzle
    add(gunG, box(0.08, 0.06, 0.12), M.dark, 0, 0.12, -5.2);                             // (muzzle reference sensor)
    add(gunG, new THREE.CircleGeometry(0.06, 16), M.dark, 0, 0, -5.452, 0, Math.PI, 0);
    // the commander's cupola (right, with the .50 cal), the loader's hatch (left, with the M240)
    const roof = 0.84;
    add(turG, cylX(0.4, 0.42, 0.16, 28), M.tur, 0.62, roof + 0.08, 0.55, 0, 0, Math.PI / 2);
    for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.45; add(turG, box(0.12, 0.08, 0.04), M.glass, 0.62 + Math.cos(a) * 0.4, roof + 0.1, 0.55 + Math.sin(a) * 0.4, 0, -a - Math.PI / 2, 0); }
    add(turG, box(0.18, 0.2, 0.18), M.tur, 0.62, roof + 0.28, 0.2);
    { const mg = new THREE.Group(); mg.position.set(0.62, roof + 0.4, 0.2); turG.add(mg);
      add(mg, box(0.12, 0.14, 0.56), M.gun, 0, 0, 0); add(mg, cylZ(0.022, 0.022, 1.1, 10), M.gun, 0, 0, -0.8); add(mg, box(0.2, 0.2, 0.1), M.gun, 0.11, -0.05, 0.05); }
    add(turG, cylX(0.36, 0.36, 0.06, 24), M.tur, -0.64, roof + 0.03, 0.48, 0, 0, Math.PI / 2);
    tubeAB(turG, V3(-0.64, roof, 0.1), V3(-0.64, roof + 0.36, 0.1), 0.03, M.gun);
    { const mg = new THREE.Group(); mg.position.set(-0.64, roof + 0.4, 0.1); turG.add(mg);
      add(mg, box(0.1, 0.12, 0.44), M.gun, 0, 0, 0); add(mg, cylZ(0.018, 0.018, 0.62, 10), M.gun, 0, 0, -0.52); }
    // the gunner's primary sight (right front), the commander's independent viewer (left front)
    { const s = add(turG, box(0.44, 0.34, 0.6), M.tur, 0.74, roof + 0.17, -0.98); add(s, box(0.3, 0.14, 0.01), M.glass, 0, 0.03, -0.306); }
    tubeAB(turG, V3(-0.46, roof, -0.72), V3(-0.46, roof + 0.22, -0.72), 0.1, M.tur);
    { const s = add(turG, box(0.34, 0.28, 0.34), M.tur, -0.46, roof + 0.36, -0.72); add(s, box(0.22, 0.12, 0.01), M.glass, 0, 0.02, -0.176); }
    // smoke dischargers on the cheeks, whip antennas at the back
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
      const t = add(turG, cylZ(0.045, 0.045, 0.24, 10), M.dark, sx * (1.68 + (k % 3) * 0.02), 0.5 + Math.floor(k / 3) * 0.1, -1.05 + (k % 3) * 0.1, -0.3, sx * 0.5, 0);
      t.castShadow = false;
    }
    for (const sx of [-1, 1]) tubeAB(turG, V3(sx * 1.4, roof, 1.9), V3(sx * 1.45, roof + 1.8, 1.95), 0.008, M.dark, 5);
    // the bustle rack behind: a basket of bars with the crew's kit in it
    for (const sx of [-1, 1]) { tubeAB(turG, V3(sx * 1.52, 0.3, 2.22), V3(sx * 1.52, 0.3, 2.78), 0.02, M.gun); tubeAB(turG, V3(sx * 1.52, 0.86, 2.22), V3(sx * 1.52, 0.86, 2.78), 0.02, M.gun);
      tubeAB(turG, V3(sx * 1.52, 0.3, 2.78), V3(sx * 1.52, 0.86, 2.78), 0.02, M.gun); }
    tubeAB(turG, V3(-1.52, 0.3, 2.78), V3(1.52, 0.3, 2.78), 0.02, M.gun); tubeAB(turG, V3(-1.52, 0.86, 2.78), V3(1.52, 0.86, 2.78), 0.02, M.gun);
    for (let k = -3; k <= 3; k++) tubeAB(turG, V3(k * 0.42, 0.3, 2.78), V3(k * 0.42, 0.86, 2.78), 0.012, M.gun, 5);
    const kit = [new THREE.MeshStandardMaterial({ color: 0x4d4a33, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x3a3f2c, roughness: 0.9 })];
    add(turG, box(0.9, 0.36, 0.44), kit[0], -0.7, 0.5, 2.5); add(turG, box(0.7, 0.3, 0.4), kit[1], 0.4, 0.46, 2.5);
    add(turG, cylX(0.16, 0.16, 1.1, 14), kit[0], 0.9, 0.62, 2.52);
    // the commander, head and shoulders out of the cupola
    const cmdr = new THREE.Group(); turG.add(cmdr);
    add(cmdr, box(0.42, 0.32, 0.26), M.suit, 0.62, roof + 0.3, 0.6);
    add(cmdr, new THREE.SphereGeometry(0.13, 18, 12), M.helmet, 0.62, roof + 0.58, 0.6);
    add(cmdr, box(0.16, 0.06, 0.04), M.dark, 0.62, roof + 0.55, 0.47);

    // ---------------------------------------------------------------- the four physics wheels (nothing drawn: the
    // tracks stand in for them), the driver's periscope eye, a hidden steering handle
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = (i & 1) === 0, side = left ? -1 : 1;
      const corner = new THREE.Group(); corner.position.set(side * trackX, RW - cgH, front ? -cgToFront : cgToRear); rootG.add(corner);
      const flip = new THREE.Group(); corner.add(flip); const spin = new THREE.Group(); flip.add(spin);
      wheels.push({ corner, flip, spin, left, front, side, stock: [], pkg: [] });
    }
    const rest = wheels.map((w) => w.corner.position.y);
    const steerG = new THREE.Group(); body.add(steerG);

    // ---------------------------------------------------------------- per frame
    const _m = new THREE.Matrix4();
    function afterWheels() {
      // (the camouflage's frames: the hull's and the turret's)
      model.updateMatrixWorld(true);
      hullInv.value.copy(_m.copy(model.matrixWorld).invert());
      turInv.value.copy(_m.copy(turG.matrixWorld).invert());
      for (const s of sides) {
        // each track follows its side's suspension, and runs at its side's speed (the physics wheels' turning)
        const f = wheels[s.sx < 0 ? 0 : 1], r = wheels[s.sx < 0 ? 2 : 3];
        const dF = f.corner.position.y - rest[s.sx < 0 ? 0 : 1], dR = r.corner.position.y - rest[s.sx < 0 ? 2 : 3];
        s.g.position.y = (dF + dR) / 2; s.g.rotation.x = Math.atan2(dF - dR, cgToFront + cgToRear);
        const a = s.sx < 0 ? f.spin.rotation.x : -f.spin.rotation.x;
        if (s.prev !== null) { let d = a - s.prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; s.travel += d * RW; }
        s.prev = a;
        s.tex.offset.x = s.texG.offset.x = -s.travel / 0.19;
        for (const w of s.spin) w.g.rotation.x = -s.travel / w.r;
      }
    }
    // the turret turned to yaw (radians, + to the left of the hull's nose, as three.js turns things) and the gun lifted
    // to elevation (radians, + up)
    function setTurret(yaw, elev) { turG.rotation.y = yaw; gunG.rotation.x = elev; }
    function setPaint(name) { const c = PAINTS[name]; if (c === undefined) return; M.hull.color.setHex(c); M.tur.color.setHex(c); }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 4 : (o.headlights ? 1.4 : 0.4);
      M.head.emissiveIntensity = o.headlights ? 3.5 : 0;
      for (const s of spots) { s.visible = !!o.headlights; s.intensity = o.headlights ? 220 : 0; }
    }
    function setInteriorVisible(v, cockpit) { cmdr.visible = !cockpit; }
    const noop = () => {};
    afterWheels();
    return {
      root: rootG, model, exterior: model, interior: model, wheels, steerWheel: steerG, eye: toRoot(V3(0, 1.66, -2.62)),
      exhaustTips: tips, materials: M, headlights: spots, tailLens: [], mirrors: [],
      setPaint, setLights, setInteriorVisible,
      // (the off-road package - trackGrouser: the rubber pads off, the bare steel grousers showing)
      setTires(front) { for (const sd of sides) { const m = front === 'trackGrouser' ? sd.texG : sd.tex; if (sd.tm.map !== m) { sd.tm.map = m; sd.tm.needsUpdate = true; } } }, setTransmission: noop, drawCluster: noop, drawScreen: noop, setChute: noop,
      afterWheels, setTurret, variant: 'tank', cls: 'tank',
    };
  }

  root.HCTank = { build };
})(typeof self !== 'undefined' ? self : this);
