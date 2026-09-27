/* Hellcat Drive — procedural rear-engine dragsters.
   Top Fuel (300 in wheelbase): nitro HEMI with a 14-71 roots blower and a forward-facing injector hat, eight zoomie
   headers, twin magnetos, belt drive right behind the driver's helmet, 36 in slicks that grow at speed, a three-element
   rear wing on struts behind the axle, nose wing, two chutes. Top Alcohol (280 in): same layout, smaller wing and slicks.
   Chromoly tube frame, carbon body from the nose to the cockpit (one loft, livery mapped along it), open cockpit with
   a cage and head surround, butterfly steering wheel, 22.5 in front runners on billet wheels.
   Funny Car (125 in): the same nitro HEMI ahead of the driver under a one-piece carbon flip-top body shaped like a
   stretched, chopped muscle car - injector hat through the hood, zoomies out of the body sides, a see-through
   greenhouse, big rear spoiler, wheelie bars, chutes under the tail.
   Model space: origin on the ground under the wheelbase centre, +X right, +Y up, forward = -Z.
   Returns the same interface as HCCarModel.build. */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function build(THREE, opts) {
    opts = opts || {};
    const CLS = opts.cls === 'tad' ? 'tad' : opts.cls === 'fc' ? 'fc' : 'tf';
    const FC = CLS === 'fc', TF = CLS !== 'tad';                    // (TF: nitro + 36 in slicks - the Funny Car too)
    const cgH = opts.cgHeight || (FC ? 0.39 : TF ? 0.44 : 0.43), zOff = opts.zOff || 0;
    const cgToFront = opts.cgToFront || (FC ? 1.746 : TF ? 5.486 : 5.048), cgToRear = opts.cgToRear || (FC ? 1.429 : TF ? 2.134 : 2.062);
    const L = cgToFront + cgToRear, zF = -L / 2, zR = L / 2;       // axle stations (model space)
    const RR = TF ? 0.457 : 0.438, RF = FC ? 0.318 : 0.286, TWR = TF ? 0.445 : 0.43;
    const GROW = (TF ? 0.22 : 0.11) * 1.4;                           // tyre growth at the physics' cap
    const trackF = opts.trackF || (FC ? 1.28 : 0.86), trackR = opts.trackR || (TF ? 1.4 : 1.36);
    const PAINTS = (root.HCCarModel && root.HCCarModel.PAINTS) || { 'Pitch Black': 0x0a0a0c };
    const NAME = FC ? 'HEMI HAVOC' : TF ? 'NITRO HELLFIRE' : 'ALKY ROCKET', NUM = FC ? '3' : TF ? '1' : '12';
    const CLASS = FC ? 'FUNNY CAR' : TF ? 'TOP FUEL' : 'TOP ALCOHOL';
    const rootG = new THREE.Group(); rootG.name = 'dragster';
    const model = new THREE.Group(); model.position.set(0, -cgH, zOff); rootG.add(model);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

    // ---------------------------------------------------------------- helpers
    function canvasTex(w, h, draw) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      draw(g, w, h);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    }
    const add = (parent, geo, mat, x, y, z, rx, ry, rz, cast) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = cast !== false; m.receiveShadow = true;
      parent.add(m); return m;
    };
    function rbox(w, h, d, r) {
      r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
      const s = new THREE.Shape(), x0 = -w / 2 + r, y0 = -h / 2 + r, x1 = w / 2 - r, y1 = h / 2 - r;
      s.moveTo(x0, -h / 2 + r); s.lineTo(x0, y1); s.lineTo(x1, y1); s.lineTo(x1, y0); s.lineTo(x0, y0);
      const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
      g.translate(0, 0, -(d - 2 * r) / 2); return g;
    }
    const tubeAB = (parent, a, b, r, mat, seg) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = add(parent, new THREE.CylinderGeometry(r, r, len, seg || 10), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return m;
    };
    const pipe = (parent, pts, r, mat, seg) => add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg || 24, r, 10, false), mat, 0, 0, 0);
    const cylX = (r0, r1, len, seg, open) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24, 1, !!open); g.rotateZ(Math.PI / 2); return g; };
    const cylZ = (r0, r1, len, seg) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg || 24); g.rotateX(Math.PI / 2); return g; };
    // a lathe around the X axis from (radius, x) pairs
    const lathePts = (pr) => pr.map(([r, x]) => new THREE.Vector2(r, x));
    function latheX(pr, seg) { const g = new THREE.LatheGeometry(lathePts(pr), seg || 48); g.rotateZ(-Math.PI / 2); return g; }

    // ---------------------------------------------------------------- materials
    const M = {};
    M.paint = new THREE.MeshPhysicalMaterial({ color: PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : 0x0a0a0c, metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide });
    M.paintW = new THREE.MeshPhysicalMaterial({ color: PAINTS[opts.paint] !== undefined ? PAINTS[opts.paint] : 0x0a0a0c, metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.03 });
    M.frame = new THREE.MeshStandardMaterial({ color: TF ? 0x1b1c20 : 0xb9bdc4, roughness: 0.32, metalness: 0.7 });
    M.polish = new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.1, metalness: 1 });
    M.chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.06, metalness: 1 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xb2b6bc, roughness: 0.4, metalness: 0.85 });
    M.cast = new THREE.MeshStandardMaterial({ color: 0x8b8e94, roughness: 0.6, metalness: 0.7 });
    M.black = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.6, metalness: 0.2 });
    M.fabric = new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.95, metalness: 0 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0 });
    M.gold = new THREE.MeshStandardMaterial({ color: 0xc9a13a, roughness: 0.3, metalness: 0.9 });
    M.redA = new THREE.MeshStandardMaterial({ color: 0xc81a1a, roughness: 0.28, metalness: 0.75 });
    M.blueA = new THREE.MeshStandardMaterial({ color: 0x1b58d6, roughness: 0.28, metalness: 0.75 });
    M.hoseR = new THREE.MeshStandardMaterial({ color: 0xa81616, roughness: 0.55, metalness: 0.1 });
    M.hoseB = new THREE.MeshStandardMaterial({ color: 0x1540b8, roughness: 0.55, metalness: 0.1 });
    M.belt = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    M.suit = new THREE.MeshStandardMaterial({ color: TF ? 0x1b1d22 : 0x14306e, roughness: 0.8 });
    M.helmet = new THREE.MeshPhysicalMaterial({ color: TF ? 0xe8e8ea : 0xf2f2f2, roughness: 0.25, clearcoat: 1 });
    M.visor = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.8 });
    M.glass = new THREE.MeshPhysicalMaterial({ color: 0xa8b4c0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
    M.led = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0xf4f8ff, emissiveIntensity: 0, roughness: 0.15, metalness: 0.5 });
    M.tail = new THREE.MeshStandardMaterial({ color: 0x3a0306, emissive: 0xff1010, emissiveIntensity: 0.4, roughness: 0.25 });
    M.hole = new THREE.MeshBasicMaterial({ color: 0x050505 });
    // carbon twill for the wings, the cockpit and the belly
    const carbonTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
        const k = ((x >> 3) + (y >> 3)) & 1;
        const gr = g.createLinearGradient(x, y, x + (k ? 8 : 0), y + (k ? 0 : 8));
        gr.addColorStop(0, '#1d1f23'); gr.addColorStop(0.5, k ? '#2c2f35' : '#25282d'); gr.addColorStop(1, '#1b1d21');
        g.fillStyle = gr; g.fillRect(x, y, 8, 8);
      }
    });
    carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping; carbonTex.repeat.set(6, 6);
    M.carbon = new THREE.MeshPhysicalMaterial({ map: carbonTex, roughness: 0.3, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
    // burnt stainless zoomies: straw -> blue -> brown from the port outwards
    const headerTex = canvasTex(256, 16, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#6b5a3a'); gr.addColorStop(0.15, '#c9a24a'); gr.addColorStop(0.35, '#6a4a8a'); gr.addColorStop(0.5, '#2f4f9a');
      gr.addColorStop(0.7, '#8a8f99'); gr.addColorStop(1, '#c4c6cc');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    M.header = new THREE.MeshStandardMaterial({ map: headerTex, roughness: 0.28, metalness: 0.9 });
    const decal = (map, side) => new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false, side: side || THREE.FrontSide });

    const SEG = 48;
    function loft(st, seg, hole) {
      const nS = st.length, nR = seg + 1, pos = new Float32Array(nS * nR * 3), uv = new Float32Array(nS * nR * 2), idx = [];
      const z0 = st[0][0], z1 = st[nS - 1][0];
      let q = 0;
      for (let i = 0; i < nS; i++) {
        // (clip: optional height the section is cut off below - wheel openings - without changing anything above it)
        const [z, hw, yb, yt, n, clip] = st[i], yc = (yb + yt) / 2, hh = (yt - yb) / 2, e = 2 / n;
        for (let j = 0; j <= seg; j++) {
          const v = j / seg, ph = v * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph), ee = c > 0 ? e * 0.55 : e;   // squarer bottom
          pos[q * 3] = -hw * Math.sign(s) * Math.pow(Math.abs(s), ee);
          const y = yc - hh * Math.sign(c) * Math.pow(Math.abs(c), ee);
          pos[q * 3 + 1] = clip && y < clip ? clip : y;
          pos[q * 3 + 2] = z;
          uv[q * 2] = (z - z0) / (z1 - z0); uv[q * 2 + 1] = v; q++;
        }
      }
      for (let i = 0; i < nS - 1; i++) for (let j = 0; j < seg; j++) {
        if (hole && hole(st[i][0], st[i + 1][0], (j + 0.5) / seg)) continue;
        const a = i * nR + j, b = a + nR;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    function airfoil(c, t, camber) {
      // inverted (downforce) section in the y-z plane: leading edge at +x (forward after rotation), curved side down
      const s = new THREE.Shape(), n = 14;
      for (let i = 0; i <= n; i++) { const x = c / 2 - c * i / n, xn = i / n; s[i ? 'lineTo' : 'moveTo'](x, t * 0.25 * Math.sin(Math.PI * Math.pow(xn, 0.7))); }
      for (let i = n; i >= 0; i--) { const x = c / 2 - c * i / n, xn = i / n; s.lineTo(x, -t * Math.sin(Math.PI * Math.pow(xn, 0.6)) - camber * Math.sin(Math.PI * xn)); }
      return s;
    }
    function wingEl(parent, span, c, t, camber, mat, x, y, z, aoa) {
      const g = new THREE.ExtrudeGeometry(airfoil(c, t, camber), { depth: span, bevelEnabled: false, curveSegments: 4 });
      g.rotateY(Math.PI / 2); g.translate(-span / 2, 0, 0);
      const m = add(parent, g, mat, x, y, z);
      m.rotation.x = -aoa;                   // + = trailing edge up (a downforce wing kicks its trailing edge up)
      return m;
    }
    const tubeR = 0.019;
    const zE = FC ? zF + 0.95 : zR - 0.95;              // engine block centre (the Funny Car's sits ahead of the driver)
    const zFW = zF - 0.5, fwSpan = TF ? 1.04 : 0.96;     // rail nose wing
    if (!FC) {
      // ---------------------------------------------------------------- body: one loft from the nose to the back of the cockpit
      // stations [z, half width, bottom, top, squareness]; the ring runs from the bottom centre up the left side, over the
      // top and down the right side (v 0..1); u runs nose -> back. The cockpit is a hole in the top.
      const zN = zF - 0.95, zB = zR - 1.45, zC0 = zR - 2.3;           // nose tip, firewall, front of the cockpit opening
      const k = (a, b, t) => a + (b - a) * t;
      const ST = [
        [zN, 0.006, 0.105, 0.115, 2.4], [zN + 0.04, 0.045, 0.09, 0.15, 2.5], [zN + 0.14, 0.08, 0.082, 0.18, 2.6], [zN + 0.35, 0.11, 0.08, 0.21, 2.8],
        [zF - 0.2, 0.14, 0.08, 0.245, 3], [zF + 0.6, 0.155, 0.085, 0.275, 3], [k(zF, zC0, 0.35), 0.18, 0.09, 0.32, 3.1], [k(zF, zC0, 0.65), 0.21, 0.095, 0.38, 3.2],
        [zC0 - 0.6, 0.245, 0.1, 0.45, 3.3], [zC0 - 0.2, 0.28, 0.1, 0.54, 3.4], [zC0, 0.3, 0.1, 0.585, 3.5], [zC0 + 0.25, 0.315, 0.1, 0.6, 3.7],
        [zB - 0.3, 0.325, 0.1, 0.6, 3.8], [zB, 0.33, 0.1, 0.585, 3.8],
      ];
      const bodyGeo = loft(ST, SEG, (za, zb, v) => za >= zC0 - 1e-6 && Math.abs(v - 0.5) < 0.135);
      const uOf = (z) => (z - zN) / (zB - zN);

      // livery (drawn in the loft's u/v space): flames or scallops off the nose, the car's name down each side, sponsors,
      // a stripe and the number on top. The left side reads nose -> tail; the right side band is rotated 180 deg so it
      // reads right from the other side
      const LW = 2048, LH = 512;
      const liveryTex = canvasTex(LW, LH, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        const side = (flip) => {
          g.save();
          // side band: v 0.08..0.42 (left) / 0.58..0.92 (right) -> canvas rows. The right side's band runs upside down in
          // v, so its layout is flipped vertically (same place along the car) and each string mirrored so it reads
          // tail -> nose, i.e. left to right from that side
          const y0 = (1 - 0.42) * h, bh = 0.34 * h;
          if (flip) { g.translate(0, h); g.scale(1, -1); }
          g.translate(0, y0);
          const text = (str, x, y, stroke) => {
            if (!flip) { if (stroke) g.strokeText(str, x, y); g.fillText(str, x, y); return; }
            const wd = g.measureText(str).width;
            g.save(); g.translate(x + wd, y); g.scale(-1, 1); if (stroke) g.strokeText(str, 0, 0); g.fillText(str, 0, 0); g.restore();
          };
          if (TF) {
            // nitro flames licking back from the nose
            const fl = g.createLinearGradient(0, 0, 900, 0);
            fl.addColorStop(0, '#fff3a0'); fl.addColorStop(0.25, '#ffc21a'); fl.addColorStop(0.55, '#ff6a00'); fl.addColorStop(1, '#c4100a');
            g.fillStyle = fl; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 5;
            g.beginPath(); g.moveTo(0, 0); g.lineTo(0, bh);
            const licks = [[0.9, 780], [0.72, 560], [0.55, 860], [0.38, 610], [0.2, 720], [0.06, 470]];
            let yPrev = bh;
            for (const [f, len] of licks) {
              const y = f * bh;
              g.bezierCurveTo(len * 0.45, yPrev, len * 0.6, y + bh * 0.12, len, y + bh * 0.02);
              g.bezierCurveTo(len * 0.7, y - bh * 0.02, len * 0.42, y, len * 0.3, y - bh * 0.04);
              yPrev = y;
            }
            g.lineTo(0, 0); g.closePath(); g.fill(); g.stroke();
          } else {
            // scallops
            g.fillStyle = '#e9ecf0'; g.strokeStyle = '#0b1b3a'; g.lineWidth = 6;
            for (const [yy, len] of [[0.28, 900], [0.56, 760], [0.82, 620]]) {
              g.beginPath(); g.moveTo(0, yy * bh - 22); g.quadraticCurveTo(len * 0.5, yy * bh - 30, len, yy * bh); g.quadraticCurveTo(len * 0.5, yy * bh + 30, 0, yy * bh + 22); g.closePath(); g.fill(); g.stroke();
            }
          }
          // the car's name
          g.font = 'italic 900 92px Arial Black, Arial'; g.textBaseline = 'middle'; g.textAlign = 'left';
          g.lineWidth = 12; g.strokeStyle = '#08080a'; g.fillStyle = TF ? '#ffffff' : '#ffd21a';
          text(NAME, 1040, bh * 0.46, true);
          g.font = 'bold 30px Arial'; g.fillStyle = TF ? '#ff7a1a' : '#ffffff';
          text(CLASS + ' DRAGSTER', 1045, bh * 0.82);
          // (fictional) sponsor stickers near the cockpit
          const sp = TF ? ['APEX CLUTCH', 'ZOOMIE WORKS'] : ['TORQUE KING', 'BIG BORE'];
          sp.forEach((t, i) => {
            const x = 1700 + i * 170; g.fillStyle = 'rgba(245,245,245,0.95)'; g.fillRect(x, bh * 0.2, 160, 48);
            g.fillStyle = '#111'; g.font = 'bold 22px Arial'; text(t, x + 80 - g.measureText(t).width / 2, bh * 0.2 + 25);
          });
          g.restore();
        };
        side(false); side(true);
        // top: pin stripes down the spine and the number on the nose
        g.fillStyle = TF ? '#ff6a00' : '#ffffff'; g.fillRect(0, h * 0.5 - 5, w * 0.9, 10);
        g.fillStyle = TF ? '#ffd21a' : '#ffd21a'; g.fillRect(0, h * 0.5 - 14, w * 0.9, 3); g.fillRect(0, h * 0.5 + 11, w * 0.9, 3);
        g.save(); g.translate(uOf(zF + 0.2) * w, h * 0.5); g.rotate(Math.PI / 2);
        g.font = 'italic 900 70px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 8; g.strokeStyle = '#000'; g.strokeText(NUM, 0, 0); g.fillStyle = '#fff'; g.fillText(NUM, 0, 0); g.restore();
      });
      const body = add(model, bodyGeo, M.paint, 0, 0, 0);
      add(model, bodyGeo, decal(liveryTex), 0, 0, 0, 0, 0, 0, false);
      void body;
      // firewall behind the driver's back, and a carbon tub floor inside the cockpit
      { const s = new THREE.Shape(); s.moveTo(-0.33, 0.1); s.lineTo(0.33, 0.1); s.lineTo(0.33, 0.52); s.quadraticCurveTo(0.3, 0.585, 0, 0.585); s.quadraticCurveTo(-0.3, 0.585, -0.33, 0.52); s.closePath();
        add(model, new THREE.ShapeGeometry(s), M.carbon, 0, 0, zB); }

      // nose wing
      wingEl(model, fwSpan, 0.26, 0.022, 0.012, M.carbon, 0, 0.19, zFW, 0.22);
      for (const sx of [-1, 1]) {
        add(model, rbox(0.012, 0.19, 0.36, 0.005), M.paintW, sx * fwSpan / 2, 0.2, zFW + 0.02);
        add(model, new THREE.BoxGeometry(0.014, 0.02, 0.06), M.led, sx * (fwSpan / 2 + 0.004), 0.26, zFW - 0.14, 0, 0, 0, false);
      }

      // ---------------------------------------------------------------- frame (visible from the firewall back)
      const rL = (sx, z) => V3(sx * 0.25, 0.11, z), rU = (sx, z) => V3(sx * 0.4, 0.5, z);
      for (const sx of [-1, 1]) {
        tubeAB(model, rL(sx, zB - 0.4), rL(sx, zR - 0.2), tubeR, M.frame);
        tubeAB(model, V3(sx * 0.33, 0.52, zB - 0.05), rU(sx, zB + 0.25), tubeR, M.frame);
        tubeAB(model, rU(sx, zB + 0.25), rU(sx, zR - 0.45), tubeR, M.frame);
        tubeAB(model, rU(sx, zR - 0.45), V3(sx * 0.2, RR + 0.16, zR - 0.1), tubeR, M.frame);
        tubeAB(model, rL(sx, zR - 0.2), V3(sx * 0.18, RR - 0.14, zR - 0.08), tubeR, M.frame);
        for (const z of [zB + 0.25, zE, zR - 0.45]) tubeAB(model, rL(sx, z), rU(sx, z), tubeR * 0.85, M.frame);
        tubeAB(model, rL(sx, zB + 0.25), rU(sx, zE), tubeR * 0.8, M.frame);
        tubeAB(model, rL(sx, zE), rU(sx, zR - 0.45), tubeR * 0.8, M.frame);
        // behind the axle: the chute / wing mount
        tubeAB(model, V3(sx * 0.17, RR - 0.1, zR + 0.12), V3(sx * 0.2, 0.52, zR + 1.02), tubeR, M.frame);
        tubeAB(model, V3(sx * 0.19, RR + 0.14, zR + 0.12), V3(sx * 0.2, 0.72, zR + 1.02), tubeR, M.frame);
      }
      for (const z of [zB + 0.25, zR - 0.45]) tubeAB(model, rL(-1, z), rL(1, z), tubeR * 0.85, M.frame);
      tubeAB(model, V3(-0.2, 0.52, zR + 1.02), V3(0.2, 0.52, zR + 1.02), tubeR, M.frame);
      tubeAB(model, V3(-0.2, 0.72, zR + 1.02), V3(0.2, 0.72, zR + 1.02), tubeR, M.frame);
      // front motor plate
      add(model, new THREE.BoxGeometry(0.84, 0.36, 0.012), M.alu, 0, 0.3, zE - 0.43);

    } else {
      // ---------------------------------------------------------------- Funny Car body
      // One loft from the nose to the tail with the wheel openings cut into its underside (each section is clipped off
      // below the opening, so the fenders and hood above keep their shape), open underneath behind the rear axle; a
      // separate greenhouse with see-through glass; a fascia on the nose and a tail panel. Same u/v mapping as the
      // rail's body for the livery.
      const zNf = zF - 1.25, zT = zR + 0.62, zW = zR - 1.45, zRW = zR + 0.05;
      // profiles through their control points: monotone cubic (smooth, and it never overshoots between points - a
      // smoothstep per segment went flat at every point and the hood rose in little ripples)
      const spline = (T) => {
        const n = T.length, x = T.map((p) => p[0]), y = T.map((p) => p[1]), h = [], d = [], m = [];
        for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; d[i] = (y[i + 1] - y[i]) / h[i]; }
        m[0] = d[0]; m[n - 1] = d[n - 2];
        for (let i = 1; i < n - 1; i++) {
          if (d[i - 1] * d[i] <= 0) m[i] = 0;
          else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
        }
        return (z) => {
          if (z <= x[0]) return y[0]; if (z >= x[n - 1]) return y[n - 1];
          let i = 0; while (z > x[i + 1]) i++;
          const t = (z - x[i]) / h[i], t2 = t * t, t3 = t2 * t;
          return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h[i] * m[i + 1];
        };
      };
      // (a bulge over the engine: the blower sits flush with it and only the hat comes through)
      const YTf = [[zNf, 0.34], [zNf + 0.1, 0.42], [zNf + 0.4, 0.55], [zF, 0.72], [zF + 0.35, 0.86], [zE - 0.45, 0.905], [zE, 0.945], [zW, 0.96], [zR - 0.6, 1.02], [zR, 1.12], [zT, 1.14]];
      const WTf = [[zNf, 0.62], [zNf + 0.15, 0.78], [zF - 0.5, 0.86], [zF, 0.9], [zR - 0.8, 0.92], [zR, 0.98], [zT, 0.95]];
      const NTf = [[zNf, 3.2], [zNf + 0.4, 4.2], [zT, 4.6]];
      const pYT = spline(YTf), pW = spline(WTf), pN = spline(NTf);
      const ARF = 0.4, ARR = 0.6;                     // wheel-opening radii round the front / rear hubs
      const ybAt = (z) => 0.11 + 0.09 * clamp((z - zF) / (zR - zF), 0, 1);
      const clipAt = (z) => {                          // the wheel openings (and the open tail) as a cut-off height
        let c = 0;
        const df = z - zF, dr = z - zR;
        if (Math.abs(df) < ARF) c = RF + Math.sqrt(ARF * ARF - df * df);
        if (Math.abs(dr) < ARR) c = Math.max(c, RR + Math.sqrt(ARR * ARR - dr * dr));
        if (z > zR) c = Math.max(c, 0.5);             // open under the tail: tyres, wheelie bars and chutes show
        return c;
      };
      const zs = [];
      for (let z = zNf; z < zT; z += 0.03) zs.push(z);
      for (const [zc, r] of [[zF, ARF], [zR, ARR]]) zs.push(zc - r - 0.002, zc - r + 0.002, zc + r - 0.002, zc + r + 0.002);
      zs.push(zW, zRW, zT); zs.sort((a, b) => a - b);
      const Zs = zs.filter((z, i) => i === 0 || z - zs[i - 1] > 0.003);
      const STf = Zs.map((z) => [z, pW(z), ybAt(z), pYT(z), pN(z), clipAt(z)]);
      const fcGeo = loft(STf, SEG, (za, zb, v) => za >= zW - 1e-6 && zb <= zRW + 1e-6 && Math.abs(v - 0.5) < 0.1);
      const uOf = (z) => (z - zNf) / (zT - zNf);
      const fcLivery = canvasTex(2048, 512, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        const side = (flip) => {
          g.save();
          const y0 = (1 - 0.42) * h, bh = 0.34 * h;
          if (flip) { g.translate(0, h); g.scale(1, -1); }
          g.translate(0, y0);
          const text = (str, x, y, stroke) => {
            if (!flip) { if (stroke) g.strokeText(str, x, y); g.fillText(str, x, y); return; }
            const wd = g.measureText(str).width;
            g.save(); g.translate(x + wd, y); g.scale(-1, 1); if (stroke) g.strokeText(str, 0, 0); g.fillText(str, 0, 0); g.restore();
          };
          // a long swoosh down the flank: white over black, from the front fender to the tail
          g.fillStyle = '#0a0a0c';
          g.beginPath(); g.moveTo(uOf(zF + 0.2) * w, bh * 0.2); g.bezierCurveTo(w * 0.5, bh * 0.08, w * 0.75, bh * 0.06, w, bh * 0.1); g.lineTo(w, bh * 0.3); g.bezierCurveTo(w * 0.75, bh * 0.24, w * 0.5, bh * 0.28, uOf(zF + 0.2) * w, bh * 0.28); g.fill();
          g.fillStyle = '#f2f2f2';
          g.beginPath(); g.moveTo(uOf(zF + 0.25) * w, bh * 0.215); g.bezierCurveTo(w * 0.5, bh * 0.1, w * 0.75, bh * 0.085, w, bh * 0.125); g.lineTo(w, bh * 0.2); g.bezierCurveTo(w * 0.75, bh * 0.165, w * 0.5, bh * 0.19, uOf(zF + 0.25) * w, bh * 0.25); g.fill();
          // the name on the doors
          g.font = 'italic 900 70px Arial Black, Arial'; g.textBaseline = 'middle'; g.textAlign = 'left';
          g.lineWidth = 10; g.strokeStyle = '#08080a'; g.fillStyle = '#ffffff';
          text(NAME, uOf(zF + 1.0) * w, bh * 0.5, true);
          g.font = 'bold 26px Arial'; g.fillStyle = '#ffd21a';
          text('NITRO FUNNY CAR', uOf(zF + 1.03) * w, bh * 0.68);
          // number on the front fender, behind the front wheel
          const nx = uOf(zF + 0.6) * w;
          g.fillStyle = '#f5f5f5'; g.beginPath(); g.arc(nx, bh * 0.52, 58, 0, 7); g.fill();
          g.font = 'italic 900 96px Arial Black, Arial'; g.fillStyle = '#0a0a0c'; text(NUM, nx - g.measureText(NUM).width / 2, bh * 0.54);
          // (fictional) sponsor stickers along the rocker
          ['APEX CLUTCH', 'ZOOMIE WORKS', 'TORQUE KING'].forEach((t, i) => {
            const x = uOf(zF + 0.95) * w + i * 175; g.fillStyle = 'rgba(245,245,245,0.95)'; g.fillRect(x, bh * 0.83, 165, 40);
            g.fillStyle = '#111'; g.font = 'bold 20px Arial'; text(t, x + 82 - g.measureText(t).width / 2, bh * 0.83 + 21);
          });
          g.restore();
        };
        side(false); side(true);
        // top: twin stripes over the hood and the rear deck, the number on the roof is on the greenhouse
        for (const dx of [-26, 26]) {
          g.fillStyle = '#f2f2f2'; g.fillRect(0, h * 0.5 + dx - 9, uOf(zW) * w, 18); g.fillRect(uOf(zRW) * w, h * 0.5 + dx - 9, w, 18);
          g.fillStyle = '#0a0a0c'; g.fillRect(0, h * 0.5 + dx - 12, uOf(zW) * w, 3); g.fillRect(0, h * 0.5 + dx + 9, uOf(zW) * w, 3);
        }
      });
      add(model, fcGeo, M.paint, 0, 0, 0);
      add(model, fcGeo, decal(fcLivery), 0, 0, 0, 0, 0, 0, false);
      // end panels from the first / last ring: the nose fascia (grille, headlight strips) and the tail (lights, name)
      const ringShape = (hw, yb, yt, n, flipU, clip) => {
        const sh = new THREE.Shape(), yc = (yb + yt) / 2, hh = (yt - yb) / 2, e = 2 / n, ylo = Math.max(yb, clip || 0);
        for (let j = 0; j < 48; j++) {
          const ph = j / 48 * Math.PI * 2, sn = Math.sin(ph), c = Math.cos(ph), ee = c > 0 ? e * 0.55 : e;
          const x = -hw * Math.sign(sn) * Math.pow(Math.abs(sn), ee), y = Math.max(ylo, yc - hh * Math.sign(c) * Math.pow(Math.abs(c), ee));
          sh[j ? 'lineTo' : 'moveTo'](x, y);
        }
        const g = new THREE.ShapeGeometry(sh, 4), p = g.attributes.position, uv = new Float32Array(p.count * 2);
        for (let q = 0; q < p.count; q++) { const u = (p.getX(q) + hw) / (2 * hw); uv[q * 2] = flipU ? 1 - u : u; uv[q * 2 + 1] = (p.getY(q) - ylo) / (yt - ylo); }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
      };
      const noseTex = canvasTex(512, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#0b0b0d'; g.beginPath(); g.roundRect ? g.roundRect(w * 0.22, h * 0.42, w * 0.56, h * 0.36, 18) : g.rect(w * 0.22, h * 0.42, w * 0.56, h * 0.36); g.fill();
        g.strokeStyle = '#2a2a2e'; g.lineWidth = 3;
        for (let x = w * 0.24; x < w * 0.77; x += 14) { g.beginPath(); g.moveTo(x, h * 0.44); g.lineTo(x, h * 0.76); g.stroke(); }
        g.fillStyle = '#e8f0ff';
        for (const sx of [-1, 1]) { g.save(); g.translate(w / 2 + sx * w * 0.36, h * 0.3); g.rotate(sx * -0.12); g.fillRect(-w * 0.1, -8, w * 0.2, 16); g.restore(); }
        g.fillStyle = '#ffd21a'; g.font = 'italic 900 40px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(NUM, w / 2, h * 0.24);
      });
      const tailTex = canvasTex(512, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#0a0a0c'; g.fillRect(w * 0.08, h * 0.62, w * 0.84, h * 0.14);
        g.font = 'italic 900 44px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 6; g.strokeStyle = '#08080a'; g.strokeText(NAME, w / 2, h * 0.36); g.fillStyle = '#ffffff'; g.fillText(NAME, w / 2, h * 0.36);
      });
      const r0 = STf[0], rN = STf[STf.length - 1];
      const nG = ringShape(r0[1], r0[2], r0[3], r0[4], true); nG.rotateY(Math.PI);   // (faces forward: u flipped so it reads right)
      add(model, nG, M.paint, 0, 0, zNf - 0.001); add(model, nG, decal(noseTex), 0, 0, zNf - 0.003, 0, 0, 0, false);
      const tG = ringShape(rN[1], rN[2], rN[3], rN[4], false, rN[5]);
      add(model, tG, M.paint, 0, 0, zT + 0.001); add(model, tG, decal(tailTex), 0, 0, zT + 0.003, 0, 0, 0, false);
      { const ylo = Math.max(rN[2], rN[5]); add(model, new THREE.BoxGeometry(1.5, 0.045, 0.016), M.tail, 0, ylo + (rN[3] - ylo) * 0.3, zT + 0.009, 0, 0, 0, false); }
      // firewall / dash at the base of the windshield: without it you looked straight into the engine bay from the seat
      { const fw = ringShape(pW(zW) - 0.02, ybAt(zW) + 0.01, pYT(zW) - 0.006, pN(zW)); add(model, fw, M.carbon, 0, 0, zW + 0.012, 0, 0, 0, false); }
      // splitter under the nose, a black collar round the hat where it comes through the hood
      add(model, new THREE.BoxGeometry(1.3, 0.012, 0.32), M.carbon, 0, 0.1, zNf + 0.14);
      add(model, rbox(0.42, 0.05, 0.6, 0.02), M.black, 0, pYT(zE) + 0.01, zE);
      // greenhouse: low, laid-back windshield, short roof, glass cut out of the paint with an alpha map; the glass
      // underneath is a second skin you can see through - also from the driver's seat
      const GH = [[zW, 0.74, 0.94, 0.965], [zW + 0.2, 0.72, 0.95, 1.06], [zW + 0.42, 0.69, 0.96, 1.16], [zW + 0.66, 0.645, 0.98, 1.255],
        [zW + 0.86, 0.63, 0.99, 1.275], [zR - 0.48, 0.63, 1.0, 1.265], [zR - 0.28, 0.66, 1.03, 1.21], [zR - 0.1, 0.7, 1.07, 1.155], [zRW, 0.72, 1.09, 1.125]];
      const ghSt = [], gW = spline(GH.map((r) => [r[0], r[1]])), gB = spline(GH.map((r) => [r[0], r[2]])), gT = spline(GH.map((r) => [r[0], r[3]]));
      for (let z = zW; z <= zRW + 1e-6; z += 0.03) ghSt.push([z, gW(z), gB(z), gT(z), 2.6]);
      const ghGeo = loft(ghSt, SEG, (za, zb, v) => v < 0.12 || v > 0.88);
      const winTex = canvasTex(512, 256, (g, w, h) => {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#000000';
        const win = (u0, u1, v0, v1) => g.fillRect(u0 * w, (1 - v1) * h, (u1 - u0) * w, (v1 - v0) * h);
        win(0.03, 0.4, 0.36, 0.64);                                          // windshield
        win(0.37, 0.8, 0.2, 0.33); win(0.37, 0.8, 0.67, 0.8);                 // side glass
        win(0.75, 0.97, 0.38, 0.62);                                         // rear window
      });
      winTex.colorSpace = THREE.NoColorSpace;
      M.ghPaint = new THREE.MeshPhysicalMaterial({ color: M.paint.color.getHex(), metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide, alphaMap: winTex, alphaTest: 0.5 });
      M.ghGlass = new THREE.MeshPhysicalMaterial({ color: 0x1c2630, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      add(model, ghGeo, M.ghPaint, 0, 0, 0);
      add(model, ghGeo, M.ghGlass, 0, 0, 0, 0, 0, 0, false);
      // rear spoiler: a big blade kicked up off the tail, with side plates; the name on its back for the chase camera
      const spW = 1.84, spC = 0.58, spA = 0.9, spY = rN[3], spZ = zT - 0.03;
      const bY = spY + Math.sin(spA) * spC / 2, bZ = spZ + Math.cos(spA) * spC / 2;
      const blade = add(model, rbox(spW, 0.014, spC, 0.006), M.carbon, 0, bY, bZ); blade.rotation.x = -spA;
      const spTex = canvasTex(1024, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.font = 'italic 900 120px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 14; g.strokeStyle = '#08080a'; g.strokeText(NAME, w / 2, h * 0.52); g.fillStyle = '#ffffff'; g.fillText(NAME, w / 2, h * 0.52);
      });
      add(model, new THREE.PlaneGeometry(spW * 0.9, spC * 0.8), decal(spTex), 0, bY - Math.cos(spA) * 0.009, bZ + Math.sin(spA) * 0.009, Math.PI / 2 - spA, 0, 0, false);
      for (const sx of [-1, 1]) {
        const sh = new THREE.Shape(); sh.moveTo(spZ - 0.12, spY - 0.01); sh.lineTo(spZ + Math.cos(spA) * spC, spY + Math.sin(spA) * spC); sh.lineTo(spZ + Math.cos(spA) * spC, spY - 0.01); sh.closePath();
        const pg = new THREE.ShapeGeometry(sh); pg.rotateY(-Math.PI / 2);
        add(model, pg, M.paint, sx * (spW / 2 + 0.004), 0, 0);
      }
      // wheelie bars: two long tubes off the axle housing to a pair of little wheels well behind the tail
      const wbL = 1.55, wbY = 0.1, wbX = 0.28;
      for (const sx of [-1, 1]) {
        tubeAB(model, V3(sx * 0.2, RR - 0.12, zR + 0.1), V3(sx * wbX, wbY + 0.05, zR + wbL), 0.022, M.frame);
        tubeAB(model, V3(sx * 0.22, RR + 0.1, zR + 0.12), V3(sx * wbX, wbY + 0.09, zR + wbL - 0.12), 0.018, M.frame);
        add(model, cylX(0.06, 0.06, 0.04, 20), M.black, sx * (wbX + 0.035), wbY, zR + wbL);
        add(model, cylX(0.03, 0.03, 0.045, 12), M.polish, sx * (wbX + 0.035), wbY, zR + wbL);
      }
      tubeAB(model, V3(-wbX, wbY + 0.05, zR + wbL), V3(wbX, wbY + 0.05, zR + wbL), 0.02, M.frame);
      tubeAB(model, V3(-wbX, wbY + 0.08, zR + wbL * 0.6), V3(wbX, wbY + 0.08, zR + wbL * 0.6), 0.016, M.frame);
    }

    // ---------------------------------------------------------------- engine
    const tips = [];
    const yCr = FC ? 0.32 : 0.46;                       // crank height
    const eng = new THREE.Group(); eng.position.set(0, yCr, zE); model.add(eng);
    if (!FC) add(eng, rbox(0.34, 0.24, 0.7, 0.06), M.fabric, 0, -0.3, 0.02);          // oil-retention "diaper" round the pan
    add(eng, rbox(0.42, 0.3, 0.72, 0.04), M.alu, 0, -0.08, 0);               // billet block
    add(eng, rbox(0.46, 0.06, 0.1, 0.02), M.alu, 0, -0.02, -0.39);            // front cover
    for (const sd of [-1, 1]) {
      const bank = new THREE.Group(); bank.rotation.z = -sd * Math.PI / 4; eng.add(bank);
      add(bank, rbox(0.24, 0.28, 0.66, 0.03), M.alu, 0, 0.2, 0);
      add(bank, rbox(0.33, 0.13, 0.7, 0.04), M.alu, 0, 0.39, 0);
      add(bank, rbox(0.29, 0.07, 0.68, 0.035), TF ? M.gold : M.blueA, 0, 0.49, 0);
      for (let q = 0; q < 5; q++) add(bank, new THREE.BoxGeometry(0.19, 0.012, 0.018), M.polish, 0, 0.53, -0.26 + q * 0.13, 0, 0, 0, false);
    }
    // blower manifold, 14-71 roots blower with a ribbed case, snout + belt drive facing the driver
    add(eng, rbox(0.36, 0.07, 0.62, 0.02), M.alu, 0, 0.34, 0);
    add(eng, rbox(0.3, 0.26, 0.6, 0.07), M.polish, 0, 0.5, 0);
    for (let q = 0; q < 6; q++) add(eng, new THREE.BoxGeometry(0.315, 0.2, 0.012), M.alu, 0, 0.5, -0.24 + q * 0.096, 0, 0, 0, false);
    add(eng, cylZ(0.05, 0.05, 0.12, 16), M.alu, 0, 0.49, -0.36);
    add(eng, cylZ(0.088, 0.088, 0.075, 28), M.polish, 0, 0.49, -0.43);
    add(eng, cylZ(0.1, 0.1, 0.075, 28), M.polish, 0, -0.02, -0.43);
    for (const sx of [-1, 1]) add(eng, new THREE.BoxGeometry(0.012, 0.52, 0.066), M.belt, sx * 0.094, 0.235, -0.43, 0, 0, sx * -0.024);
    // injector hat: a big square hat with its scoop facing forward over the driver's helmet, butterflies inside
    add(eng, rbox(0.27, 0.16, 0.44, 0.03), M.polish, 0, 0.71, 0.02);
    add(eng, rbox(0.31, 0.2, 0.14, 0.025), M.polish, 0, 0.75, -0.24);
    add(eng, new THREE.PlaneGeometry(0.25, 0.14), M.hole, 0, 0.75, -0.312, 0, Math.PI, 0, false);
    for (let q = 0; q < 3; q++) add(eng, new THREE.BoxGeometry(0.004, 0.13, 0.06), M.alu, -0.08 + q * 0.08, 0.75, -0.29, 0, 0, 0, false);
    // blower restraint straps (Kevlar) over the hat and blower, down to the heads
    for (const z of [-0.14, 0.06, 0.24]) {
      add(eng, new THREE.BoxGeometry(0.34, 0.012, 0.05), M.fabric, 0, 0.8, z, 0, 0, 0, false);
      for (const sx of [-1, 1]) add(eng, new THREE.BoxGeometry(0.012, 0.44, 0.05), M.fabric, sx * 0.17, 0.59, z, 0, 0, sx * 0.08, false);
    }
    // burst panel on the manifold, fuel pump on the front cover, the big fuel lines up to the hat
    add(eng, new THREE.BoxGeometry(0.02, 0.05, 0.14), M.redA, 0.185, 0.34, 0.12, 0, 0, 0, false);
    add(eng, cylZ(0.05, 0.05, 0.14, 16), M.blueA, -0.12, -0.1, -0.46);
    pipe(eng, [V3(-0.12, -0.06, -0.52), V3(-0.24, 0.2, -0.5), V3(-0.2, 0.6, -0.34), V3(-0.1, 0.72, -0.2)], 0.018, M.hoseB, 20);
    pipe(eng, [V3(-0.08, -0.12, -0.52), V3(0.2, 0.08, -0.54), V3(0.22, 0.56, -0.36), V3(0.1, 0.7, -0.18)], 0.016, M.hoseR, 20);
    // twin magnetos at the back of the engine, and their plug wires fanning out to the heads
    for (const sx of [-1, 1]) {
      const mg = add(eng, new THREE.CylinderGeometry(0.048, 0.048, 0.18, 16), M.polish, sx * 0.075, 0.37, 0.42, 0.7, 0, 0);
      add(eng, new THREE.CylinderGeometry(0.058, 0.05, 0.05, 16), M.redA, sx * 0.075, 0.44, 0.49, 0.7, 0, 0);
      void mg;
      for (let q = 0; q < 4; q++) pipe(eng, [V3(sx * 0.075, 0.46, 0.5), V3(sx * 0.2, 0.46, 0.34 - q * 0.05), V3(sx * 0.28, 0.4, 0.22 - q * 0.17)], 0.006, M.hoseR, 10);
    }
    // zoomie headers: four per side out of the heads, angled up, out and back. Flames come out of these
    for (const sd of [-1, 1]) for (let q = 0; q < 4; q++) {
      const zp = -0.24 + q * 0.16, px = sd * 0.37, py = 0.17;
      // (Funny Car: long enough to poke out through the body sides behind the front wheels)
      const pts = FC ? [V3(px, py, zp), V3(px + sd * 0.12, py + 0.03, zp + 0.01), V3(px + sd * 0.4, py + 0.16, zp + 0.08), V3(px + sd * 0.66, py + 0.34, zp + 0.22)]
        : [V3(px, py, zp), V3(px + sd * 0.08, py + 0.02, zp + 0.01), V3(px + sd * 0.15, py + 0.17, zp + 0.1), V3(px + sd * 0.2, py + 0.33, zp + 0.21)];
      pipe(eng, pts, 0.034, M.header, 16);
      const e = pts[3];
      add(eng, new THREE.TorusGeometry(0.034, 0.006, 6, 16), M.header, e.x, e.y, e.z, Math.PI / 2 - 0.62, 0, sd * 0.35, false);
      tips.push(V3(e.x, yCr + e.y + 0.03, zE + e.z + 0.03));
    }
    // clutch can (bellhousing) and the short driveshaft to the rear end
    add(eng, cylZ(0.19, 0.19, 0.22, 32), M.black, 0, -0.03, 0.47);
    for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4; add(eng, new THREE.BoxGeometry(0.03, 0.012, 0.16), M.polish, Math.cos(a) * 0.19, -0.03 + Math.sin(a) * 0.19, 0.47, 0, 0, a, false); }
    add(model, cylZ(0.045, 0.045, zR - 0.17 - (zE + 0.58), 16), M.polish, 0, 0.44, (zR - 0.17 + zE + 0.58) / 2);

    // ---------------------------------------------------------------- rear end, brakes
    add(model, rbox(0.36, 0.34, 0.36, 0.06), M.cast, 0, RR, zR);
    add(model, cylZ(0.15, 0.15, 0.05, 32), M.polish, 0, RR, zR + 0.2);
    for (const sx of [-1, 1]) {
      const inner = 0.17, outer = trackR / 2 - TWR / 2 - 0.02;
      add(model, cylX(0.055, 0.06, outer - inner, 20), M.cast, sx * (inner + outer) / 2, RR, zR);
      add(model, cylX(0.165, 0.165, 0.03, 32), M.carbon, sx * (outer - 0.1), RR, zR);            // carbon rotor
      add(model, rbox(0.06, 0.14, 0.12, 0.02), M.redA, sx * (outer - 0.1), RR + 0.12, zR + 0.08);  // caliper
    }

    if (!FC) {
      // ---------------------------------------------------------------- rear wing on its struts
      const wSpan = TF ? 1.9 : 1.6, wy = TF ? 1.52 : 1.36, wz = zR + (TF ? 0.42 : 0.38), sc = TF ? 1 : 0.82;
      wingEl(model, wSpan, 0.95 * sc, 0.075 * sc, 0.03 * sc, M.carbon, 0, wy, wz, 0.2);
      // flap: its leading edge tucked just above and ahead of the main plane's trailing edge (the slot), kicked up steeply
      wingEl(model, wSpan, 0.55 * sc, 0.045 * sc, 0.02 * sc, M.paintW, 0, wy + 0.275 * sc, wz + 0.655 * sc, 0.55);
      if (TF) wingEl(model, wSpan, 0.4, 0.035, 0.015, M.carbon, 0, wy + 0.56, wz + 0.5, 0.32);
      const epH = (TF ? 1.02 : 0.8), epL = TF ? 1.42 : 1.2, epY = wy + (TF ? 0.18 : 0.1), epZ = wz + (TF ? 0.28 : 0.24);
      const epTex = canvasTex(1024, 736, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = TF ? '#ff6a00' : '#ffd21a'; g.fillRect(0, h - 70, w, 26); g.fillRect(0, 44, w, 12);
        g.font = 'italic 900 330px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 22; g.strokeStyle = '#08080a'; g.strokeText(NUM, w * 0.32, h * 0.47); g.fillStyle = '#ffffff'; g.fillText(NUM, w * 0.32, h * 0.47);
        g.font = 'italic 900 64px Arial Black, Arial'; g.textAlign = 'left';
        const words = NAME.split(' ');
        words.forEach((t, i) => { g.lineWidth = 10; g.strokeText(t, w * 0.55, h * 0.36 + i * 86); g.fillStyle = TF ? '#ffd21a' : '#ffffff'; g.fillText(t, w * 0.55, h * 0.36 + i * 86); });
        g.font = 'bold 34px Arial'; g.fillStyle = '#ffffff'; g.fillText(CLASS, w * 0.56, h * 0.36 + words.length * 86);
      });
      for (const sx of [-1, 1]) {
        add(model, new THREE.BoxGeometry(0.014, epH, epL), M.paintW, sx * (wSpan / 2 + 0.007), epY, epZ);
        // decals on both faces (outside reads front-to-back from the side, inside for the camera behind)
        add(model, new THREE.PlaneGeometry(epL * 0.96, epH * 0.96), decal(epTex), sx * (wSpan / 2 + 0.0145), epY, epZ, 0, sx * Math.PI / 2, 0, false);
        add(model, new THREE.PlaneGeometry(epL * 0.96, epH * 0.96), decal(epTex), sx * (wSpan / 2 - 0.0005), epY, epZ, 0, -sx * Math.PI / 2, 0, false);
        // struts: uprights off the axle housing, braces back to the chute mount
        tubeAB(model, V3(sx * 0.16, RR + 0.16, zR + 0.1), V3(sx * 0.3, wy - 0.07, wz - 0.05), 0.024, M.frame);
        tubeAB(model, V3(sx * 0.2, 0.72, zR + 1.02), V3(sx * 0.3, wy - 0.05, wz + 0.4 * sc), 0.02, M.frame);
      }
      tubeAB(model, V3(-0.3, wy - 0.07, wz - 0.05), V3(0.3, wy - 0.07, wz - 0.05), 0.02, M.frame);
      // rain / brake light on the chute mount
      add(model, new THREE.BoxGeometry(0.16, 0.05, 0.02), M.tail, 0, 0.84, zR + 1.04, 0, 0, 0, false);

    }

    // ---------------------------------------------------------------- parachute packs + the canopies they throw
    const chutes = [];
    for (const sx of [-1, 1]) {
      const cy = FC ? 0.38 : 0.62, cz = FC ? zR + 0.72 : zR + 1.02;     // (Funny Car: packs hang under the tail)
      add(model, cylZ(0.11, 0.11, 0.4, 24), TF ? M.black : M.blueA, sx * 0.14, cy, cz);
      add(model, cylZ(0.1, 0.1, 0.02, 24), sx < 0 ? M.redA : M.polish, sx * 0.14, cy, cz + 0.21);
      const ch = new THREE.Group(); ch.position.set(sx * 0.14, cy - cgH, cz + 0.23 + zOff); ch.visible = false; rootG.add(ch);
      const cGeo = new THREE.SphereGeometry(1.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      cGeo.rotateX(Math.PI / 2);   // apex points back (+z), mouth faces the car
      const cols = [], p = cGeo.attributes.position;
      for (let q = 0; q < p.count; q++) {
        const gore = Math.floor(((Math.atan2(p.getY(q), p.getX(q)) + Math.PI) / (Math.PI * 2)) * 12 + 0.001) % 12;
        const c = gore % 2 ? (TF ? [0.72, 0.04, 0.05] : [0.08, 0.2, 0.62]) : [0.95, 0.95, 0.95];
        cols.push(c[0], c[1], c[2]);
      }
      cGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const canopy = new THREE.Mesh(cGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
      canopy.castShadow = true; ch.add(canopy);
      // the inside of the cup, in its own shadow
      const inner = new THREE.Mesh(cGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 1, side: THREE.BackSide }));
      inner.scale.setScalar(0.992); canopy.add(inner);
      const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 6), 3));
      const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xdddddd }));
      ch.add(lines);
      ch.userData = { canopy, lines, sx };
      chutes.push(ch);
    }

    // ---------------------------------------------------------------- cockpit: cage, head surround, screen, driver
    const cage = new THREE.Group(); model.add(cage);
    const zH = FC ? zR - 0.7 : zR - 1.62, dy = FC ? 0.12 : 0;     // helmet centre; the Funny Car's driver sits higher
    const zB = zR - 1.45, zC0 = zR - 2.3;                            // (rails: firewall, front of the cockpit opening)
    if (!FC) {
      for (const sx of [-1, 1]) {
        tubeAB(cage, V3(sx * 0.31, 0.5, zB - 0.03), V3(sx * 0.23, 1.13, zB - 0.03), tubeR, M.frame);
        tubeAB(cage, V3(sx * 0.29, 0.52, zC0 + 0.02), V3(sx * 0.2, 0.84, zC0 + 0.05), tubeR, M.frame);
        tubeAB(cage, V3(sx * 0.23, 1.13, zB - 0.03), V3(sx * 0.2, 0.84, zC0 + 0.05), tubeR, M.frame);
        tubeAB(cage, V3(sx * 0.31, 0.56, zB - 0.03), V3(sx * 0.3, 0.58, zC0 + 0.05), tubeR * 0.8, M.frame);
        // head surround pads
        add(cage, rbox(0.07, 0.24, 0.3, 0.03), M.black, sx * 0.19, 0.9, zH + 0.02);
      }
      tubeAB(cage, V3(-0.23, 1.13, zB - 0.03), V3(0.23, 1.13, zB - 0.03), tubeR, M.frame);
      tubeAB(cage, V3(-0.2, 0.84, zC0 + 0.05), V3(0.2, 0.84, zC0 + 0.05), tubeR, M.frame);
      add(cage, rbox(0.34, 0.3, 0.07, 0.03), M.black, 0, 0.88, zB - 0.07);                 // head rest
      // wind deflector at the front of the opening
      add(cage, new THREE.PlaneGeometry(0.5, 0.22), M.glass, 0, 0.7, zC0 - 0.02, -0.62, 0, 0, false);
    } else {
      // Funny Car: main hoop behind the seat, bars along the roof and down the A-pillars, head surround and rest
      const zHoop = zR - 0.42, zW = zR - 1.45;
      for (const sx of [-1, 1]) {
        tubeAB(cage, V3(sx * 0.55, 0.45, zHoop), V3(sx * 0.5, 1.2, zHoop), tubeR, M.frame);
        tubeAB(cage, V3(sx * 0.5, 1.2, zHoop), V3(sx * 0.55, 1.18, zW + 0.62), tubeR, M.frame);
        tubeAB(cage, V3(sx * 0.55, 1.18, zW + 0.62), V3(sx * 0.62, 0.84, zW + 0.08), tubeR, M.frame);
        add(cage, rbox(0.07, 0.24, 0.3, 0.03), M.black, sx * 0.19, 0.9 + dy, zH + 0.02);
      }
      tubeAB(cage, V3(-0.5, 1.2, zHoop), V3(0.5, 1.2, zHoop), tubeR, M.frame);
      add(cage, rbox(0.34, 0.3, 0.07, 0.03), M.black, 0, 0.88 + dy, zH + 0.17);
    }
    // the driver, reclined against the firewall (hidden in the cockpit view)
    const driver = new THREE.Group(); cage.add(driver);
    add(driver, rbox(0.36, 0.52, 0.22, 0.1), M.suit, 0, 0.5 + dy, zH - 0.08, -1.0, 0, 0);
    for (const sx of [-1, 1]) {
      add(driver, rbox(0.05, 0.46, 0.012, 0.005), M.redA, sx * 0.08, 0.53 + dy, zH - 0.19, -1.0, 0, 0, false);
      tubeAB(driver, V3(sx * 0.17, 0.66 + dy, zH - 0.04), V3(sx * 0.13, 0.66 + dy, zH - 0.4), 0.045, M.suit);
      add(driver, new THREE.SphereGeometry(0.04, 10, 8), M.black, sx * 0.12, 0.69 + dy, zH - 0.43);
    }
    add(driver, new THREE.SphereGeometry(0.15, 24, 16), M.helmet, 0, 0.93 + dy, zH);
    { const vg = new THREE.SphereGeometry(0.153, 24, 12, -Math.PI / 2 - 0.85, 1.7, 1.28, 0.5); add(driver, vg, M.visor, 0, 0.93 + dy, zH, 0, 0, 0, false); }
    add(driver, new THREE.BoxGeometry(0.016, 0.06, 0.2), TF ? M.redA : M.blueA, 0, 1.075 + dy, zH, 0, 0, 0, false);
    // steering: butterfly wheel on a column that drops into the cowl, a little data display above the hub
    const colG = new THREE.Group(); colG.position.set(0, 0.7 + dy, zH - 0.4); colG.rotation.x = -0.5; cage.add(colG);
    add(colG, cylZ(0.016, 0.016, 0.62, 10), M.polish, 0, 0, -0.31);
    const steerWheel = new THREE.Group(); colG.add(steerWheel);
    add(steerWheel, new THREE.CylinderGeometry(0.042, 0.042, 0.03, 20), M.black, 0, 0, 0.01, Math.PI / 2, 0, 0);
    for (const sx of [-1, 1]) {
      add(steerWheel, new THREE.BoxGeometry(0.11, 0.03, 0.02), M.polish, sx * 0.075, 0, 0.012);
      const grip = add(steerWheel, new THREE.CylinderGeometry(0.019, 0.021, 0.15, 12), M.black, sx * 0.135, 0, 0.015);
      grip.rotation.z = sx * 0.18;
      add(steerWheel, new THREE.SphereGeometry(0.01, 8, 6), sx < 0 ? M.redA : M.blueA, sx * 0.04, 0.02, 0.028, 0, 0, 0, false);
    }
    const clusterCanvas = document.createElement('canvas'); clusterCanvas.width = 512; clusterCanvas.height = 300;
    const clusterTex = new THREE.CanvasTexture(clusterCanvas); clusterTex.colorSpace = THREE.SRGBColorSpace; clusterTex.anisotropy = 8;
    const dash = new THREE.Group(); dash.position.set(0, 0.085, -0.03); colG.add(dash);
    add(dash, rbox(0.13, 0.08, 0.02, 0.008), M.black, 0, 0, -0.012);
    add(dash, new THREE.PlaneGeometry(0.118, 0.069), new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false }), 0, 0, 0.0, 0, 0, 0, false);
    const eye = V3(0, 0.95 + dy, zH - 0.08);

    // ---------------------------------------------------------------- wheels
    // rear slick: tall soft sidewall; a morph target is the same tyre grown at speed (taller, narrower, bead unchanged).
    // Sidewall lettering is painted into the tyre's own texture so it stretches with it.
    const hw = TWR / 2, rb = 0.215;
    const slickP = [[rb, -hw + 0.03], [0.24, -hw + 0.015], [0.3, -hw + 0.005], [0.37, -hw], [RR - 0.042, -hw + 0.005], [RR - 0.015, -hw + 0.022], [RR - 0.002, -hw + 0.05], [RR, -hw + 0.09],
      [RR, hw - 0.09], [RR - 0.002, hw - 0.05], [RR - 0.015, hw - 0.022], [RR - 0.042, hw - 0.005], [0.37, hw], [0.3, hw - 0.005], [0.24, hw - 0.015], [rb, hw - 0.03]];
    const grownP = slickP.map(([r, x]) => { const t = (r - rb) / (RR - rb); return [rb + (r - rb) * (RR * (1 + GROW) - rb) / (RR - rb), x * (1 - 0.3 * t)]; });
    const slickGeo = latheX(slickP, 72), grownGeo = latheX(grownP, 72);
    slickGeo.morphAttributes.position = [grownGeo.attributes.position];
    slickGeo.morphAttributes.normal = [grownGeo.attributes.normal];
    const sideTex = (txt) => canvasTex(2048, 256, (g, w, h) => {
      g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
      // outer sidewall band: profile points 11..14 -> v 0.73..0.93 -> rows (1-v)*h; letters upright = pointing out
      const yA = (1 - 0.92) * h, yB = (1 - 0.74) * h;
      g.save(); g.translate(w, yA + yB); g.scale(-1, -1);
      g.font = 'bold 34px Arial'; g.fillStyle = '#e8e8e8'; g.textBaseline = 'middle'; g.textAlign = 'center';
      for (let q = 0; q < 2; q++) g.fillText(txt, w * (0.25 + 0.5 * q), (yA + yB) / 2);
      g.restore();
    });
    M.slick = new THREE.MeshStandardMaterial({ map: sideTex(TF ? 'DRAG SLICK  ·  36.0 x 17.5-16' : 'DRAG SLICK  ·  34.5 x 17.0-16'), roughness: 0.88, metalness: 0 });
    // off-road (sand-drag) package: the same soft carcass with rubber paddles moulded across the tread, and ribbed fronts
    M.paddle = new THREE.MeshStandardMaterial({ map: sideTex(TF ? 'SAND PADDLE  ·  36 x 17.5-16' : 'SAND PADDLE  ·  34.5 x 17-16'), roughness: 0.9, metalness: 0 });
    function mergeGeos(list) {
      const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
      let n = 0; for (const g of parts) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
      for (const g of parts) { if (!g.attributes.normal) g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.computeBoundingSphere(); return out;
    }
    const paddleGeo = (() => {
      const list = [], N = 12;
      for (let k = 0; k < N; k++) {
        // each paddle: a rubber blade across the tread, leaning back a touch, with a thick root
        const b = new THREE.BoxGeometry(TWR - 0.05, 0.036, 0.02); b.translate(0, RR + 0.015, 0); b.rotateX(k * Math.PI * 2 / N);
        const r = new THREE.BoxGeometry(TWR - 0.06, 0.012, 0.04); r.translate(0, RR - 0.001, 0); r.rotateX(k * Math.PI * 2 / N);
        list.push(b, r);
      }
      return mergeGeos(list);
    })();
    function ribGeo(R, W, rr) {
      const h = W / 2, pts = [[rr + 0.004, -0.03], [rr + 0.03, -h + 0.012], [R - 0.035, -h], [R - 0.012, -h + 0.006]];
      for (let x = -h + 0.018, k = 0; x < h - 0.017; x += 0.013, k++) pts.push([k & 1 ? R - 0.011 : R, x]);
      pts.push([R - 0.012, h - 0.006], [R - 0.035, h], [rr + 0.03, h - 0.012], [rr + 0.004, 0.03]);
      return latheX(pts, 48);
    }
    const ribF = FC ? ribGeo(0.33, 0.17, 0.198) : ribGeo(0.3, 0.15, 0.214);
    const frontP = FC ? [[0.2, -0.05], [0.24, -0.057], [0.285, -0.056], [0.306, -0.045], [RF, -0.025], [RF, 0.025], [0.306, 0.045], [0.285, 0.056], [0.24, 0.057], [0.2, 0.05]]
      : [[0.218, -0.03], [0.245, -0.034], [0.268, -0.033], [0.281, -0.026], [RF, -0.012], [RF, 0.012], [0.281, 0.026], [0.268, 0.033], [0.245, 0.034], [0.218, 0.03]];
    const tyreFGeo = latheX(frontP, 48);
    function rearRim(g) {
      const w = TWR - 0.05;
      add(g, cylX(0.205, 0.205, w, 48, true), M.alu, 0, 0, 0);
      add(g, new THREE.TorusGeometry(0.212, 0.012, 8, 56), M.polish, w / 2, 0, 0, 0, Math.PI / 2, 0);
      add(g, new THREE.TorusGeometry(0.212, 0.012, 8, 56), M.alu, -w / 2, 0, 0, 0, Math.PI / 2, 0);
      // beadlock ring and its bolts
      add(g, cylX(0.232, 0.232, 0.012, 48), M.polish, w / 2 + 0.006, 0, 0);
      for (let q = 0; q < 20; q++) { const a = q * Math.PI / 10; add(g, cylX(0.007, 0.007, 0.018, 6), M.chrome, w / 2 + 0.012, Math.cos(a) * 0.222, Math.sin(a) * 0.222, 0, 0, 0, false); }
      // face: polished dish with lightening holes, hub and the knock-off
      const face = cylX(0.2, 0.2, 0.016, 48); add(g, face, M.polish, w / 2 - 0.05, 0, 0);
      for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4; add(g, cylX(0.035, 0.035, 0.018, 16), M.hole, w / 2 - 0.048, Math.cos(a) * 0.125, Math.sin(a) * 0.125, 0, 0, 0, false); }
      add(g, cylX(0.07, 0.09, 0.08, 24), M.polish, w / 2 - 0.02, 0, 0);
      add(g, cylX(0.045, 0.045, 0.03, 6), M.cast, w / 2 + 0.03, 0, 0);
    }
    function frontRim(g) {
      const rr = FC ? 0.198 : 0.214, rw = FC ? 0.1 : 0.06, ns = FC ? 5 : 6;
      add(g, cylX(rr, rr, rw, 40, true), M.alu, 0, 0, 0);
      add(g, new THREE.TorusGeometry(rr + 0.002, 0.007, 6, 40), M.polish, rw / 2, 0, 0, 0, Math.PI / 2, 0);
      add(g, cylX(0.03, 0.03, rw + 0.01, 16), M.polish, 0, 0, 0);
      for (let q = 0; q < ns; q++) { const a = q * Math.PI * 2 / ns; const sp = add(g, new THREE.BoxGeometry(0.012, rr - 0.024, FC ? 0.034 : 0.02), M.polish, rw * 0.3, 0, 0); sp.rotation.x = a; sp.geometry.translate(0, rr / 2 - 0.007, 0); }
    }
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      const frontW = i < 2, left = (i & 1) === 0, side = left ? -1 : 1;
      const corner = new THREE.Group();
      corner.position.set(side * (frontW ? trackF : trackR) / 2, 0, frontW ? -cgToFront : cgToRear);
      rootG.add(corner);
      const flip = new THREE.Group(); if (left) flip.rotation.y = Math.PI; corner.add(flip);
      const spin = new THREE.Group(); flip.add(spin);
      let tyre = null;
      let stock, pkg;
      if (frontW) {
        stock = [add(spin, tyreFGeo, M.rubber, 0, 0, 0)]; pkg = [add(spin, ribF, M.rubber, 0, 0, 0)]; frontRim(spin);
        add(flip, new THREE.BoxGeometry(0.05, 0.08, 0.06), M.polish, -0.06, 0, 0);          // spindle
      } else {
        tyre = add(spin, slickGeo, M.slick, 0, 0, 0); rearRim(spin);
        stock = [tyre]; pkg = [add(spin, slickGeo, M.paddle, 0, 0, 0), add(spin, paddleGeo, M.rubber, 0, 0, 0)];
      }
      for (const m of pkg) m.visible = false;
      wheels.push({ corner, flip, spin, left, front: frontW, side, tyre, growMax: GROW, stock, pkg });
    }
    // front axle through the nose, tie rod (inside the Funny Car's body)
    if (!FC) {
      add(model, cylX(0.02, 0.02, trackF - 0.1, 12), M.chrome, 0, RF, zF);
      add(model, cylX(0.008, 0.008, trackF - 0.16, 8), M.polish, 0, RF - 0.04, zF + 0.07);
    }

    // ---------------------------------------------------------------- lights (little LED pods on the nose wing)
    const headlights = [];
    for (const sx of [-1, 1]) {
      const sl = new THREE.SpotLight(0xf2f6ff, 0, 90, 0.5, 0.45, 1.4);
      const lz = FC ? zF - 1.26 : zFW - 0.16;             // (Funny Car: the headlight strips on the fascia)
      sl.position.set(sx * (FC ? 0.37 : fwSpan / 2), (FC ? 0.29 : 0.26) - cgH, lz + zOff);
      sl.target.position.set(sx * 0.6, -cgH - 0.5, lz - 40 + zOff);
      rootG.add(sl); rootG.add(sl.target); sl.visible = false; headlights.push(sl);
    }

    // ---------------------------------------------------------------- dash: a little data display
    const cg = clusterCanvas.getContext('2d');
    function drawCluster(t) {
      const g = cg, w = 512, h = 300;
      g.fillStyle = '#040506'; g.fillRect(0, 0, w, h);
      const maxR = Math.max(1000, t.maxRpm || 9000), red = t.redline || maxR * 0.95;
      // shift-light style rpm bar across the top
      const n = 24;
      for (let q = 0; q < n; q++) {
        const r = maxR * (q + 1) / n, on = t.rpm >= r - maxR / n * 0.5;
        g.fillStyle = on ? (r > red ? '#ff2a2a' : r > red * 0.85 ? '#ffc21a' : '#2adc5a') : '#15181c';
        g.fillRect(12 + q * 20.3, 10, 16, 34);
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffffff'; g.font = 'bold 118px Arial'; g.fillText(String(Math.round(t.rpm)), 190, 128);
      g.fillStyle = '#6fa8c8'; g.font = 'bold 22px Arial'; g.fillText('RPM', 190, 196);
      g.fillStyle = t.shiftNow ? '#ff3a2a' : '#ffc21a'; g.font = 'bold 110px Arial'; g.fillText(t.gear.replace(/^[DM](?=\d)/, ''), 430, 124);
      g.textAlign = 'left'; g.font = '18px Arial';
      const cells = [['MPH', String(Math.round(t.speedMph))], ['BOOST', Math.round(t.boost) + ''], ['ET', t.lastEt || '—']];
      cells.forEach(([k, v], q) => { const x = 16 + q * 168; g.fillStyle = '#6fa8c8'; g.font = '18px Arial'; g.fillText(k, x, 234); g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.fillText(v, x, 268); });
      if (!t.running) { g.fillStyle = '#ff3a2a'; g.font = 'bold 20px Arial'; g.fillText('ENGINE OFF', 330, 206); }
      else if (t.launch) { g.fillStyle = '#ffc400'; g.font = 'bold 20px Arial'; g.fillText('CLUTCH IN', 330, 206); }
      else if (t.chute) { g.fillStyle = '#ff5a3a'; g.font = 'bold 20px Arial'; g.fillText('CHUTES OUT', 330, 206); }
      clusterTex.needsUpdate = true;
    }
    function drawScreen() {}
    function setPaint(name) { const c = PAINTS[name]; if (c === undefined) return; M.paint.color.setHex(c); M.paintW.color.setHex(c); if (M.ghPaint) M.ghPaint.color.setHex(c); }
    function setLights(o) {
      M.tail.emissiveIntensity = o.brake ? 5 : (o.night ? 1.2 : 0.4);
      M.led.emissiveIntensity = o.headlights ? 4 : 0;
      for (const hl of headlights) { hl.visible = !!o.headlights; hl.intensity = o.headlights ? 200 : 0; }
    }
    function setInteriorVisible(v, cockpit) { driver.visible = !cockpit; }
    function setTransmission() {}
    function setTires(front, rear) {
      for (const w of wheels) {
        const on = /^(paddle|sandRib)/.test(w.front ? front : rear);
        for (const m of w.stock) m.visible = !on; for (const m of w.pkg) m.visible = on;
      }
    }
    // parachutes: out = deployed, infl 0..1 (from the physics), t = seconds since the pins were pulled. Two canopies
    // on long lines that fly apart and weave
    const _rim = new THREE.Vector3();
    function setChute(out, infl, t) {
      for (const ch of chutes) {
        ch.visible = !!out && (infl > 0.03 || t < 1.2);
        if (!ch.visible) continue;
        const { canopy, lines, sx } = ch.userData;
        const pay = clamp(t / 0.35, 0, 1), Lc = 1.0 + 7.5 * pay;
        const s = 0.12 + 0.88 * infl;
        canopy.scale.set(s, s, 0.5 + 0.1 * infl + (1 - infl) * 1.8 * pay);          // a shallow cup when full
        const ph = sx > 0 ? 1.3 : 0, sway = Math.sin(t * 2.9 + ph) * 0.06 * infl, bob = Math.sin(t * 2.1 + 1 + ph) * 0.05 * infl;
        canopy.position.set(sx * 1.25 * infl + Math.sin(t * 1.6 + ph) * 0.2 * infl, 0.5 * infl + bob, Lc);
        canopy.rotation.set(bob, sway + sx * 0.12 * infl, 0);
        const pa = lines.geometry.attributes.position;
        for (let q = 0; q < 12; q++) {
          const a = q / 12 * Math.PI * 2;
          _rim.set(Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0).multiply(canopy.scale).applyEuler(canopy.rotation).add(canopy.position);
          pa.setXYZ(q * 2, 0, 0, 0); pa.setXYZ(q * 2 + 1, _rim.x, _rim.y, _rim.z);
        }
        pa.needsUpdate = true;
      }
    }

    for (const t of tips) t.add(V3(0, -cgH, zOff));
    rootG.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    return {
      root: rootG, model, exterior: model, interior: cage, wheels, steerWheel, eye: eye.clone().add(V3(0, -cgH, zOff)),
      exhaustTips: tips, materials: M, headlights, tailLens: [], mirrors: [],
      setPaint, setLights, setTires, setInteriorVisible, setTransmission, drawCluster, drawScreen, setChute, variant: 'dragster', cls: CLS,
    };
  }

  root.HCDragster = { build };
})(typeof self !== 'undefined' ? self : this);
