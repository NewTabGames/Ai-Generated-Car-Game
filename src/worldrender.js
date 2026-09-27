/* Hellcat Drive — world rendering: streamed LOD terrain chunks (roads drawn per-pixel in the terrain shader),
   instanced vegetation / rocks, farm buildings, power lines, signs, water, sky and lighting presets. */
(function (root) {
  'use strict';

  const GLSL_NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x), mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y); }
float fbm3(vec2 p){ return vnoise(p)*0.55 + vnoise(p*2.03)*0.28 + vnoise(p*4.1)*0.17; }
`;
  // All Road helpers: a painted line of half-width hw at distance d (metres), anti-aliased for a pixel footprint px and
  // fading out (not shimmering) once it's thinner than a pixel; street-light pools along an avenue (heads 6.2 m either
  // side of its centre line, every 48 m, 8.9 m up)
  const GLSL_TARMAC = `
float tline(float d, float hw, float px){ return clamp((hw - abs(d)) / px + 0.5, 0.0, 1.0) * min(1.0, 2.0 * hw / px); }
float lampLight(float lat, float al){
  float a = mod(al, 48.0) - 24.0, b = a - sign(a) * 48.0, l1 = lat - 6.2, l2 = lat + 6.2;
  return pow(79.0 / (79.0 + l1*l1 + a*a), 1.3) + pow(79.0 / (79.0 + l1*l1 + b*b), 1.3) + pow(79.0 / (79.0 + l2*l2 + a*a), 1.3) + pow(79.0 / (79.0 + l2*l2 + b*b), 1.3);
}
`;

  function create(THREE, scene, W, opts) {
    const C = W.C, CH = C.CHUNK;
    const q = Object.assign({ viewDist: 1700, propDist: 650, treeDensity: 1, shadows: true }, opts || {});
    const group = new THREE.Group(); group.name = 'world'; scene.add(group);

    // ---------------------------------------------------------------- terrain material
    const rns = [], rew = [];
    for (let i = 0; i < 15; i++) { rns.push(new THREE.Vector4()); rew.push(new THREE.Vector4()); }
    const fNS = new Float32Array(60), fEW = new Float32Array(60);
    const terrUniforms = { uRNS: { value: rns }, uREW: { value: rew }, uWater: { value: C.WATER_LEVEL }, uMap: { value: W.map === 'drag' || W.map === 'dirtdrag' ? 2 : W.map === 'tarmac' ? 3 : 0 }, uLamp: { value: 0 }, uDirt: { value: W.map === 'dirtdrag' ? 1 : 0 } };
    const terrainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    terrainMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, terrUniforms);
      sh.vertexShader = 'attribute vec2 aData;\nvarying vec3 vWPos;\nvarying vec2 vData;\nvarying vec3 vWN;\n' +
        sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vData = aData; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = `uniform vec4 uRNS[15];\nuniform vec4 uREW[15];\nuniform float uWater;\nuniform float uMap;\nuniform float uLamp;\nuniform float uDirt;\nvarying vec3 vWPos;\nvarying vec2 vData;\nvarying vec3 vWN;\nfloat terrRough;\nvec3 terrGlow;\n` + GLSL_NOISE + GLSL_TARMAC +
        sh.fragmentShader
          .replace('#include <color_fragment>', `
  {
    vec2 P = vWPos.xz;
    float dist = length(vWPos - cameraPosition);
    float n1 = vnoise(P * 0.045), n2 = fbm3(P * 0.011 + 7.0), n3 = vnoise(P * 0.45);
    vec3 col = mix(vec3(0.13, 0.22, 0.06), vec3(0.22, 0.29, 0.085), n1);
    col = mix(col, vec3(0.38, 0.35, 0.17), smoothstep(0.55, 0.85, n2) * 0.65);
    col *= 0.86 + 0.28 * n3 * (1.0 - smoothstep(25.0, 110.0, dist));
    float forest = vData.x;
    col = mix(col, vec3(0.09, 0.12, 0.05), forest * 0.4);
    col = mix(col, vec3(0.05, 0.085, 0.04), forest * smoothstep(320.0, 850.0, dist) * 0.9);
    float slope = 1.0 - vWN.y;
    vec3 rock = mix(vec3(0.30, 0.285, 0.27), vec3(0.44, 0.42, 0.39), vnoise(P * 0.18));
    col = mix(col, rock, smoothstep(0.2, 0.38, slope));
    float h = vWPos.y;
    col = mix(col, vec3(0.52, 0.47, 0.36), 1.0 - smoothstep(uWater + 0.5, uWater + 2.6, h));
    col = mix(col, vec3(0.22, 0.21, 0.19), 1.0 - smoothstep(uWater - 2.5, uWater + 0.1, h));
    float snow = smoothstep(120.0, 150.0, h + vnoise(P * 0.02) * 30.0) * (1.0 - smoothstep(0.2, 0.36, slope));
    col = mix(col, vec3(0.88, 0.9, 0.94), snow);
    float rough = 1.0;
    terrGlow = vec3(0.0);
    // ---- road network (mirrors worldgen.roadInfo)
    float sdNS = 1e5, sdEW = 1e5;
    if (uMap < 2.5) for (int i = 0; i < 5; i++) {
      vec4 a = uRNS[i*3], b = uRNS[i*3+1], c = uRNS[i*3+2];
      float t = vWPos.z;
      float s1 = a.z*t + a.w, s2 = b.y*t + b.z, s3 = c.x*t + c.y;
      float ctr = a.x + a.y*sin(s1) + b.x*sin(s2) + b.w*sin(s3);
      float sl = a.y*a.z*cos(s1) + b.x*b.y*cos(s2) + b.w*c.x*cos(s3);
      float sd = (vWPos.x - ctr) * inversesqrt(1.0 + sl*sl);
      if (abs(sd) < abs(sdNS)) sdNS = sd;
      a = uREW[i*3]; b = uREW[i*3+1]; c = uREW[i*3+2];
      t = vWPos.x;
      s1 = a.z*t + a.w; s2 = b.y*t + b.z; s3 = c.x*t + c.y;
      ctr = a.x + a.y*sin(s1) + b.x*sin(s2) + b.w*sin(s3);
      sl = a.y*a.z*cos(s1) + b.x*b.y*cos(s2) + b.w*c.x*cos(s3);
      sd = (vWPos.z - ctr) * inversesqrt(1.0 + sl*sl);
      if (abs(sd) < abs(sdEW)) sdEW = sd;
    }
    float dNS = abs(sdNS), dEW = abs(sdEW);
    bool isNS = dNS < dEW;
    float d = min(dNS, dEW), sdr = isNS ? sdNS : sdEW, dOther = isNS ? dEW : dNS;
    float along = isNS ? vWPos.z : vWPos.x;
    float aa = max(fwidth(d), 0.003);
    if (uMap > 2.5) {
      // ---- All Road: pavement to the horizon. 4-lane avenues every 240 m; every block between them is its own lot:
      // a parking lot, a skid pad, a concrete apron, a rubbered-in drift pad or open asphalt
      float px = max(length(fwidth(P)), 1e-4);                // metres per pixel (derivatives kept out of the branches below)
      vec2 ic = floor(P / 240.0 + 0.5), lp = P - ic * 240.0;  // from the nearest crossing
      vec2 bk = floor(P / 240.0), bp = P - bk * 240.0;        // block index / position in the block (0..240)
      vec2 ab = abs(lp), q = bp - 120.0;
      float an = vnoise(P * 1.7) * 0.5 + vnoise(P * 11.0) * 0.5;
      float age = fbm3(P * 0.0045 + 3.0);                     // big patches of older, greyer paving
      vec3 c = mix(vec3(0.058, 0.058, 0.06), vec3(0.112, 0.108, 0.1), smoothstep(0.3, 0.85, age));
      c *= 0.84 + 0.32 * an;
      // sealed cracks ("tar snakes") wandering through the old stuff, ~6 cm wide (measured in pixels via the derivative)
      float sv = vnoise(P * 0.05 + 9.0 + vec2(vnoise(P * 0.4), vnoise(P * 0.4 + 5.0)) * 0.5) - 0.5;
      float snake = clamp(0.03 / px - abs(sv) / max(fwidth(sv), 1e-6) + 0.5, 0.0, 1.0) * min(1.0, 0.06 / px);
      c = mix(c, vec3(0.025, 0.025, 0.027), snake * smoothstep(0.35, 0.7, age) * 0.85);
      float wear = 0.62 + 0.38 * vnoise(P * 2.3);
      vec3 white = vec3(0.86, 0.86, 0.84) * wear, yellow = vec3(0.80, 0.56, 0.06) * wear;
      float r2 = 0.86, paint = 0.0, ypaint = 0.0;
      float kind = floor(hash12(bk * 1.37 + 17.0) * 5.0);
      if (kind < 0.5) {
        // parking lot: double-loaded rows of 2.75 m stalls, 19 m a row pair with its aisle
        float zz = mod(bp.y - 26.0, 19.0), row = step(26.0, bp.y) * step(bp.y, 208.0) * step(zz, 11.0);
        float inX = step(26.0, bp.x) * step(bp.x, 214.0);
        float xs = mod(bp.x - 26.0, 2.75), xd = min(xs, 2.75 - xs);
        paint = (tline(xd, 0.055, px) + tline(zz - 5.5, 0.055, px)) * row * inX;
        float oil = 1.0 - smoothstep(0.15, 0.85, length(vec2(xs - 1.375, (mod(zz, 5.5) - 2.75) * 0.7)));
        c *= 1.0 - 0.4 * oil * row * inX * step(0.45, hash12(floor(vec2((bp.x - 26.0) / 2.75, (bp.y - 26.0) / 5.5)) + bk * 9.0));
      } else if (kind < 1.5) {
        // skid pad: smooth fresh paving, a polished ring of rubber between the 30 m and 45 m circles
        float r = length(q);
        c = mix(c, vec3(0.058, 0.058, 0.062) * (0.85 + 0.3 * an), 1.0 - smoothstep(60.0, 64.0, r));
        float rub = exp(-pow((r - 37.5) / 3.4, 2.0)) * (0.6 + 0.4 * vnoise(P * 0.7));
        c *= 1.0 - 0.6 * rub;
        paint = tline(r - 30.0, 0.08, px) + tline(r - 45.0, 0.08, px) + (tline(q.x, 0.06, px) * step(abs(q.y), 2.0) + tline(q.y, 0.06, px) * step(abs(q.x), 2.0));
        r2 = 0.8 - 0.12 * rub;
      } else if (kind < 2.5) {
        // concrete apron: 7.5 m slabs, sawn joints, a yellow guide line and turn circle
        float apron = step(abs(q.x), 104.0) * step(abs(q.y), 104.0);
        vec3 conc = vec3(0.3, 0.29, 0.272) * (0.88 + 0.16 * vnoise(P * 2.1) + 0.06 * vnoise(P * 0.2));
        conc *= 0.93 + 0.14 * hash12(floor(bp / 7.5) + bk * 31.0);
        vec2 sj = mod(bp, 7.5), jd = min(sj, 7.5 - sj);
        conc *= 1.0 - 0.35 * max(tline(jd.x, 0.02, px), tline(jd.y, 0.02, px));
        conc *= 1.0 - 0.45 * exp(-pow((abs(q.x) - 1.6) / 0.5, 2.0)) * step(abs(q.y), 100.0) * (0.5 + 0.5 * vnoise(P * 0.4));   // tyre wear either side of the line
        c = mix(c, conc, apron);
        ypaint = (tline(q.x, 0.08, px) * step(abs(q.y), 90.0) + tline(length(q) - 22.0, 0.08, px)) * apron;
        r2 = mix(r2, 0.92, apron);
      } else if (kind < 3.5) {
        // drift pad: rubbered in, and covered in donuts (two tyre tracks each)
        c *= 0.92 - 0.3 * vnoise(P * 0.05);
        float don = 0.0;
        for (int k = 0; k < 2; k++) {
          float cs = k == 0 ? 24.0 : 31.0;
          vec2 bq = bp + float(k) * 11.0, cell = floor(bq / cs) + bk * 5.0;
          vec2 cc = (floor(bq / cs) + 0.3 + 0.4 * vec2(hash12(cell), hash12(cell + 5.3))) * cs;
          float dd = length(bq - cc), rad = 2.6 + 2.2 * hash12(cell * 1.7 + 0.4);
          don += (exp(-pow((dd - rad) / 0.3, 2.0)) + exp(-pow((dd - rad - 1.6) / 0.34, 2.0))) * step(0.55, hash12(cell + 0.7));
        }
        don *= step(abs(q.x), 100.0) * step(abs(q.y), 100.0);
        c = mix(c, vec3(0.018, 0.018, 0.02), clamp(don, 0.0, 1.0) * 0.8);
        r2 = 0.86 - 0.12 * clamp(don, 0.0, 1.0);
      }
      // avenues: fresh dark paving with lane wear, a joint where it meets the lot, double yellow, dashed lanes, edge lines,
      // stop bars on the approaches and zebra crossings
      float onNS = step(ab.x, 8.4), onEW = step(ab.y, 8.4), onAv = max(onNS, onEW);
      float trk = onNS * (1.0 - onEW) * (exp(-pow((abs(ab.x - 1.8) - 0.8) / 0.32, 2.0)) + exp(-pow((abs(ab.x - 5.4) - 0.8) / 0.32, 2.0)))
                + onEW * (1.0 - onNS) * (exp(-pow((abs(ab.y - 1.8) - 0.8) / 0.32, 2.0)) + exp(-pow((abs(ab.y - 5.4) - 0.8) / 0.32, 2.0)));
      c = mix(c, vec3(0.062, 0.062, 0.065) * (0.82 + 0.34 * an) * (1.0 - 0.13 * trk), onAv);
      r2 = mix(r2, 0.86, onAv);
      c *= 1.0 - 0.35 * (tline(ab.x - 8.4, 0.03, px) * step(8.4, ab.y) + tline(ab.y - 8.4, 0.03, px) * step(8.4, ab.x));
      paint *= 1.0 - onAv; ypaint *= 1.0 - onAv;
      float ns = step(13.5, ab.y), ew = step(13.5, ab.x);      // clear of the crossing
      ypaint += tline(ab.x - 0.13, 0.055, px) * ns + tline(ab.y - 0.13, 0.055, px) * ew;
      paint += (tline(ab.x - 3.6, 0.06, px) * step(fract(P.y / 12.2), 0.25) + tline(ab.x - 7.2, 0.08, px)) * ns
             + (tline(ab.y - 3.6, 0.06, px) * step(fract(P.x / 12.2), 0.25) + tline(ab.y - 7.2, 0.08, px)) * ew;
      paint += tline(ab.y - 14.2, 0.25, px) * step(ab.x, 7.2) * step(0.0, lp.x * lp.y) + tline(ab.x - 14.2, 0.25, px) * step(ab.y, 7.2) * step(lp.x * lp.y, 0.0);
      paint += step(9.4, ab.y) * step(ab.y, 13.0) * step(ab.x, 7.2) * tline(fract(lp.x / 1.2 + 0.25) - 0.5, 0.25, px / 1.2)
             + step(9.4, ab.x) * step(ab.x, 13.0) * step(ab.y, 7.2) * tline(fract(lp.y / 1.2 + 0.25) - 0.5, 0.25, px / 1.2);
      c = mix(c, yellow, clamp(ypaint, 0.0, 1.0));
      c = mix(c, white, clamp(paint, 0.0, 1.0));
      col = c;
      rough = mix(r2, 0.7, clamp(paint + ypaint, 0.0, 1.0));
      // street-light pools at night (emissive, so they show whatever the moon's doing)
      terrGlow = c * (lampLight(lp.x, P.y) + lampLight(lp.y, P.x)) * vec3(1.0, 0.9, 0.78) * 2.6 * uLamp;
    } else if (uMap > 1.5) {
      // ---- prepped drag strip: concrete launch pad, rubbered-in grooves, lane lines, start / 1/8 / checkered finish
      float ax = abs(vWPos.x), zz = vWPos.z;
      float aaX = max(fwidth(vWPos.x), 0.003), aaZ = max(fwidth(zz), 0.003);
      if (ax < 8.8 && uDirt > 0.5) {
        // ---- dirt drag strip: raked, watered and packed clay, darker grooves where the tyres run, chalk lines
        float n1 = vnoise(P * 0.9), n2 = vnoise(P * 6.0), n3 = vnoise(P * 23.0);
        float rake = 0.5 + 0.5 * sin(vWPos.x * 26.0 + vnoise(P * 0.35) * 5.0);          // drag-harrow lines along the lanes
        vec3 c = mix(vec3(0.24, 0.145, 0.08), vec3(0.33, 0.21, 0.12), n1) * (0.86 + 0.12 * n2 + 0.06 * n3) * (0.94 + 0.08 * rake);
        float lx = abs(ax - 3.1);
        float fade = mix(0.45, 1.0, smoothstep(-420.0, -30.0, zz));
        float track = exp(-pow((lx - 0.8) / 0.42, 2.0)) * step(ax, 6.1) * fade;
        c = mix(c, vec3(0.13, 0.08, 0.045), clamp(track * (0.5 + 0.35 * vnoise(vec2(zz * 0.3, vWPos.x * 2.0))), 0.0, 0.85));   // packed, damp
        c = mix(c, vec3(0.16, 0.1, 0.055), 0.55 * step(-12.0, zz) * step(zz, 14.0) * step(ax, 6.1) * vnoise(P * 0.9 + 2.0));  // dug-out launch area
        float chalk = 0.75 + 0.25 * vnoise(P * 14.0);
        float lines = (1.0 - smoothstep(0.08 - aaX, 0.08 + aaX, ax))
          + (1.0 - smoothstep(0.09 - aaX, 0.09 + aaX, abs(ax - 6.2)))
          + ((1.0 - smoothstep(0.12 - aaZ, 0.12 + aaZ, abs(zz))) + (1.0 - smoothstep(0.12 - aaZ, 0.12 + aaZ, abs(zz + 201.168)))) * step(ax, 6.2);
        c = mix(c, vec3(0.86, 0.85, 0.8) * chalk, clamp(lines, 0.0, 1.0) * step(0.35, vnoise(P * 3.0) + 0.3));
        float band = step(abs(zz + 402.336 + 0.6), 0.6) * step(ax, 6.2);
        float par = mod(floor(vWPos.x / 0.6) + floor((zz + 402.336) / 0.6), 2.0);
        c = mix(c, mix(vec3(0.08, 0.06, 0.04), vec3(0.86, 0.85, 0.8) * chalk, par), band);
        c = mix(c, mix(vec3(0.16, 0.24, 0.08), vec3(0.24, 0.3, 0.11), n2), smoothstep(8.2, 8.7, ax));   // grass edge by the wall
        col = c;
        rough = 0.97;
      } else if (ax < 8.8) {
        float an = vnoise(P * 1.7) * 0.5 + vnoise(P * 9.0) * 0.5;
        vec3 c = vec3(0.072, 0.072, 0.075) * (0.85 + 0.3 * an);
        float pad = step(-110.0, zz) * step(zz, 40.0);
        vec3 conc = vec3(0.47, 0.46, 0.44) * (0.9 + 0.2 * vnoise(P * 2.3));
        float jz = 1.0 - smoothstep(0.012, 0.03, abs(fract(zz / 4.8 + 0.5) - 0.5) * 4.8);
        float jx = 1.0 - smoothstep(0.012, 0.03, abs(ax - 6.2));
        conc *= 1.0 - 0.3 * max(jz, jx);
        c = mix(c, conc, pad);
        float lx = abs(ax - 3.1);
        float track = exp(-pow((lx - 0.8) / 0.34, 2.0)) * step(ax, 6.1);
        float fade = mix(0.35, 1.0, smoothstep(-420.0, -30.0, zz));
        float box = step(0.4, zz) * step(zz, 32.0);
        float rub = clamp(track * (0.55 + 0.45 * vnoise(vec2(zz * 0.25, vWPos.x * 2.5))) * fade * 1.15 + box * 0.45 * step(ax, 6.1) * vnoise(P * 0.8 + 3.0), 0.0, 0.95);
        c = mix(c, vec3(0.02, 0.02, 0.022), rub);
        c = mix(c, vec3(0.03, 0.035, 0.04), 0.35 * step(22.0, zz) * step(zz, 31.0) * step(ax, 6.1));   // water box
        float lines = (1.0 - smoothstep(0.07 - aaX, 0.07 + aaX, ax)) * (1.0 - pad * 0.0)
          + (1.0 - smoothstep(0.08 - aaX, 0.08 + aaX, abs(ax - 6.2)))
          + ((1.0 - smoothstep(0.1 - aaZ, 0.1 + aaZ, abs(zz))) + (1.0 - smoothstep(0.1 - aaZ, 0.1 + aaZ, abs(zz + 201.168)))) * step(ax, 6.2);
        c = mix(c, vec3(0.88), clamp(lines, 0.0, 1.0));
        float band = step(abs(zz + 402.336 + 0.6), 0.6) * step(ax, 6.2);
        float par = mod(floor(vWPos.x / 0.6) + floor((zz + 402.336) / 0.6), 2.0);
        c = mix(c, mix(vec3(0.02), vec3(0.92), par), band);
        c = mix(c, vec3(0.4, 0.39, 0.37), smoothstep(8.25, 8.35, ax));
        col = c;
        rough = mix(0.8, 0.92, pad) - 0.12 * rub;
      }
    } else if (d < 8.0) {
      float grav = 1.0 - smoothstep(6.3, 6.9, d);
      vec3 gravelC = mix(vec3(0.33, 0.31, 0.28), vec3(0.45, 0.43, 0.39), vnoise(P * 3.0));
      col = mix(col, gravelC, grav);
      float asph = 1.0 - smoothstep(4.7 - aa, 4.7 + aa, d);
      float an = vnoise(P * 1.7) * 0.5 + vnoise(P * 11.0) * 0.5;
      vec3 asphC = vec3(0.078, 0.078, 0.082) * (0.82 + 0.34 * an);
      float trk = exp(-pow((abs(sdr) - 0.95) / 0.38, 2.0)) + exp(-pow((abs(sdr) - 2.65) / 0.38, 2.0));
      asphC *= 1.0 - 0.14 * trk * smoothstep(5.0, 7.0, dOther);
      asphC = mix(asphC, vec3(0.05, 0.05, 0.053), step(0.8, vnoise(vec2(along * 0.045, sdr * 0.35))) * 0.55);
      col = mix(col, asphC, asph);
      rough = mix(rough, 0.86, asph);
      float inter = smoothstep(5.2, 7.2, dOther);
      float fwS = max(fwidth(sdr), 0.003);
      float edge = 1.0 - smoothstep(0.075 - fwS, 0.075 + fwS, abs(d - 3.55));
      float segH = hash12(vec2(floor(along / 190.0), isNS ? 3.0 : 5.0));
      float y1 = 1.0 - smoothstep(0.055 - fwS, 0.055 + fwS, abs(abs(sdr) - 0.11));
      float y2 = (1.0 - smoothstep(0.06 - fwS, 0.06 + fwS, abs(sdr))) * step(fract(along / 12.2), 0.25);
      float yellow = segH > 0.55 ? y2 : y1;
      float wear = 0.7 + 0.3 * vnoise(P * 2.3);
      col = mix(col, vec3(0.86, 0.86, 0.84) * wear, edge * inter * asph);
      col = mix(col, vec3(0.80, 0.56, 0.06) * wear, yellow * inter * asph);
      // stop bars before intersections
      float stopBar = (1.0 - smoothstep(0.25 - aa, 0.25 + aa, abs(dOther - 7.6))) * step(0.0, -sdr * sign(sdr + 1e-5)) ;
      col = mix(col, vec3(0.86) * wear, stopBar * asph * step(abs(sdr), 3.5) * 0.0);
    }
    diffuseColor.rgb = col;
    terrRough = rough;
  }`)
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = terrRough;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += terrGlow;');
    };

    // shared index buffers per LOD
    const lodIndex = [];
    function indexFor(lod) {
      if (lodIndex[lod]) return lodIndex[lod];
      const n = CH / (C.GRID << lod), N = n + 1;
      const idx = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      // skirts: 4 edges, each edge vertex has a skirt twin
      const base = N * N;
      const edges = [];
      for (let i = 0; i < N; i++) edges.push([i, 0]);          // z0 edge
      for (let i = 0; i < N; i++) edges.push([i, n]);          // z1 edge
      for (let j = 0; j < N; j++) edges.push([0, j]);          // x0 edge
      for (let j = 0; j < N; j++) edges.push([n, j]);          // x1 edge
      for (let e = 0; e < 4; e++) for (let k = 0; k < n; k++) {
        const e0 = e * N + k, e1 = e0 + 1;
        const [i0, j0] = edges[e0], [i1, j1] = edges[e1];
        const a = j0 * N + i0, b = j1 * N + i1, sa = base + e0, sb = base + e1;
        idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa);
      }
      lodIndex[lod] = { idx: new THREE.Uint32BufferAttribute(idx, 1), edges, N, n };
      return lodIndex[lod];
    }

    function* buildTerrain(cx, cz, lod, out) {
      const step = C.GRID << lod, n = CH / step, N = n + 1, x0 = cx * CH, z0 = cz * CH;
      const B = N + 2, HB = new Float32Array(B * B);
      for (let j = -1; j <= N; j++) {
        for (let i = -1; i <= N; i++) HB[(j + 1) * B + (i + 1)] = W.terrainHeight(x0 + i * step, z0 + j * step);
        yield;
      }
      const L = indexFor(lod);
      const vcount = N * N + L.edges.length;
      const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), dat = new Float32Array(vcount * 2);
      let minY = 1e9, maxY = -1e9;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const v = j * N + i, hh = HB[(j + 1) * B + (i + 1)];
          pos[v * 3] = i * step; pos[v * 3 + 1] = hh; pos[v * 3 + 2] = j * step;
          const nx = HB[(j + 1) * B + i] - HB[(j + 1) * B + i + 2], nz = HB[j * B + i + 1] - HB[(j + 2) * B + i + 1], ny = 2 * step;
          const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
          nor[v * 3] = nx * il; nor[v * 3 + 1] = ny * il; nor[v * 3 + 2] = nz * il;
          dat[v * 2] = W.forestDensity(x0 + i * step, z0 + j * step) * q.treeDensity;
          if (hh < minY) minY = hh; if (hh > maxY) maxY = hh;
        }
        if ((j & 7) === 7) yield;
      }
      const skirt = 1.5 + step * 0.6;
      L.edges.forEach(([i, j], e) => {
        const v = N * N + e, s = j * N + i;
        pos[v * 3] = pos[s * 3]; pos[v * 3 + 1] = pos[s * 3 + 1] - skirt; pos[v * 3 + 2] = pos[s * 3 + 2];
        nor[v * 3] = nor[s * 3]; nor[v * 3 + 1] = nor[s * 3 + 1]; nor[v * 3 + 2] = nor[s * 3 + 2];
        dat[v * 2] = dat[s * 2];
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('aData', new THREE.BufferAttribute(dat, 2));
      g.setIndex(L.idx);
      g.boundingBox = new THREE.Box3(new THREE.Vector3(0, minY - skirt, 0), new THREE.Vector3(CH, maxY, CH));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CH / 2, (minY + maxY) / 2, CH / 2), Math.sqrt(2 * (CH / 2) ** 2 + ((maxY - minY) / 2 + skirt) ** 2));
      out.geo = g;
    }

    // ---------------------------------------------------------------- vegetation / prop geometry
    function jitterGeo(g, amt, seed) {
      const p = g.attributes.position; let s = seed || 1;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
      const map = new Map();
      for (let i = 0; i < p.count; i++) {
        const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
        let d = map.get(k); if (!d) { d = [rnd() * amt, rnd() * amt, rnd() * amt]; map.set(k, d); }
        p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
      }
      return g;
    }
    function blob(r, det, cx, cy, cz, sy, amt, seed) {
      const g = new THREE.IcosahedronGeometry(r, det);
      jitterGeo(g, amt, seed);
      g.scale(1, sy, 1);
      g.translate(cx, cy, cz);
      // soft outward normals
      const p = g.attributes.position, nrm = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i) - cx, y = (p.getY(i) - cy) * 0.8, z = p.getZ(i) - cz;
        const l = Math.hypot(x, y, z) || 1; nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l + 0.25; nrm[i * 3 + 2] = z / l;
      }
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.deleteAttribute('uv');
      return g;
    }
    function merge(list) {
      const parts = list.map((g) => { let x = g.index ? g.toNonIndexed() : g; if (!x.attributes.normal) x.computeVertexNormals(); return x; });
      let n = 0; for (const g of parts) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
      for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.computeBoundingSphere();
      return out;
    }
    const cone = (r, h, y, seg, seed) => { const g = new THREE.ConeGeometry(r, h, seg || 9, 2); jitterGeo(g, r * 0.18, seed); g.translate(0, y, 0); return g; };
    const cyl = (r0, r1, h, seg) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg || 6); g.translate(0, h / 2 - 0.3, 0); return g; };
    const GEO = {
      trunk: [cyl(0.12, 0.26, 3.2), cyl(0.18, 0.34, 3.6, 7), cyl(0.09, 0.15, 5.2)],
      leaves: [
        merge([cone(1.9, 3.4, 3.0, 9, 3), cone(1.55, 2.9, 4.5, 9, 5), cone(1.1, 2.4, 5.9, 8, 7), cone(0.62, 1.7, 7.1, 7, 9)]),
        merge([blob(1.9, 1, 0, 4.7, 0, 0.85, 0.5, 11), blob(1.5, 1, 1.25, 4.1, 0.5, 0.8, 0.45, 12), blob(1.5, 1, -1.1, 4.3, -0.6, 0.8, 0.45, 13), blob(1.3, 1, 0.2, 5.6, -0.3, 0.8, 0.4, 14)]),
        merge([blob(1.2, 1, 0, 5.4, 0, 1.3, 0.35, 21), blob(0.9, 1, 0.6, 4.6, 0.3, 1.2, 0.3, 22), blob(0.9, 1, -0.5, 4.9, -0.4, 1.2, 0.3, 23)]),
      ],
      bush: merge([blob(0.9, 1, 0, 0.45, 0, 0.75, 0.35, 31), blob(0.7, 1, 0.55, 0.35, 0.2, 0.7, 0.3, 32)]),
      rock: (() => { const g = new THREE.IcosahedronGeometry(1, 1); jitterGeo(g, 0.55, 41); g.scale(1.2, 0.75, 1); g.translate(0, 0.2, 0); g.computeVertexNormals(); return g; })(),
    };
    const MAT = {
      trunk: [new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0x3f3024, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0xd9d4c7, roughness: 0.8 })],
      leaves: [new THREE.MeshStandardMaterial({ color: 0x24401f, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0x35521f, roughness: 0.92 }), new THREE.MeshStandardMaterial({ color: 0x5d7d2b, roughness: 0.9 })],
      bush: new THREE.MeshStandardMaterial({ color: 0x2e4a1a, roughness: 0.95 }),
      rock: new THREE.MeshStandardMaterial({ color: 0x77726b, roughness: 0.92, flatShading: true }),
      pole: new THREE.MeshStandardMaterial({ color: 0x5b4633, roughness: 0.9 }),
      wire: new THREE.LineBasicMaterial({ color: 0x151515 }),
    };
    // buildings
    const winTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#e8e2d6'; for (let y = 0; y < 128; y += 8) g.fillRect(0, y, 256, 1);
      for (const x of [30, 110, 190]) { g.fillStyle = '#33404a'; g.fillRect(x, 38, 36, 44); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(x, 38, 36, 44); g.beginPath(); g.moveTo(x + 18, 38); g.lineTo(x + 18, 82); g.moveTo(x, 60); g.lineTo(x + 36, 60); g.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
    })();
    const HOUSE_COLORS = [0xe9e4d8, 0xc9d3d6, 0xe3d5b8, 0xa9b7a0, 0xd8c9a9, 0x9fb3c8];
    const bMat = {
      roof: new THREE.MeshStandardMaterial({ color: 0x3b3b3e, roughness: 0.85 }),
      barnRoof: new THREE.MeshStandardMaterial({ color: 0x6d7073, roughness: 0.55, metalness: 0.6 }),
      barn: new THREE.MeshStandardMaterial({ color: 0x8e2016, roughness: 0.85 }),
      trim: new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.8 }),
      door: new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.8 }),
      found: new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95 }),
    };
    const houseMats = HOUSE_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, map: winTex, roughness: 0.85 }));
    function prism(w, h, d) {
      const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g;
    }
    function buildBuilding(b, x0, z0) {
      const g = new THREE.Group();
      g.position.set(b.x - x0, b.y, b.z - z0); g.rotation.y = b.rot;
      const m = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
      m(new THREE.BoxGeometry(b.w + 0.3, 3, b.d + 0.3), bMat.found, 0, -1.3, 0);
      if (b.kind === 1) {
        m(new THREE.BoxGeometry(b.w, 5.5, b.d), bMat.barn, 0, 2.75, 0);
        const r = m(prism(b.w + 1.0, 3.6, b.d + 0.8), bMat.barnRoof, 0, 5.5, 0); void r;
        m(new THREE.BoxGeometry(4, 4, 0.1), bMat.barn, 0, 2.0, b.d / 2 + 0.03);
        const tr = (w, h, x, y, rz) => { const o = m(new THREE.BoxGeometry(w, h, 0.12), bMat.trim, x, y, b.d / 2 + 0.1); o.rotation.z = rz || 0; };
        tr(4.2, 0.18, 0, 4.05); tr(4.2, 0.18, 0, 0.05); tr(0.18, 4.1, -2.05, 2.0); tr(0.18, 4.1, 2.05, 2.0); tr(5.6, 0.16, 0, 2.0, 0.78); tr(5.6, 0.16, 0, 2.0, -0.78);
      } else {
        const wm = houseMats[Math.floor(b.color * houseMats.length) % houseMats.length];
        const walls = m(new THREE.BoxGeometry(b.w, 3.1, b.d), wm, 0, 1.55, 0);
        walls.material = wm;
        m(prism(b.w + 0.9, 2.3, b.d + 0.9), bMat.roof, 0, 3.1, 0).rotation.y = Math.PI / 2 * 0 ;
        m(new THREE.BoxGeometry(1.0, 2.1, 0.1), bMat.door, b.w * 0.18, 1.05, b.d / 2 + 0.03);
        m(new THREE.BoxGeometry(2.6, 0.2, 1.6), bMat.found, b.w * 0.18, 0.1, b.d / 2 + 0.8);
        m(new THREE.BoxGeometry(0.7, 2.2, 0.7), bMat.found, -b.w * 0.3, 4.4, 0);
      }
      return g;
    }
    // signs
    const signTex = [0, 1, 2].map((k) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
      if (k === 0) {
        g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 160); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(6, 6, 116, 148);
        g.fillStyle = '#111'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('SPEED', 64, 38); g.fillText('LIMIT', 64, 64);
        g.font = 'bold 64px Arial'; g.fillText('55', 64, 130);
      } else if (k === 2) {
        // JUMP AHEAD: yellow diamond, a car flying off a ramp
        g.clearRect(0, 0, 128, 160);
        g.save(); g.translate(64, 80); g.rotate(Math.PI / 4); g.fillStyle = '#f2c200'; g.fillRect(-52, -52, 104, 104); g.strokeStyle = '#111'; g.lineWidth = 5; g.strokeRect(-48, -48, 96, 96); g.restore();
        g.fillStyle = '#111'; g.beginPath(); g.moveTo(26, 104); g.lineTo(62, 104); g.lineTo(62, 86); g.closePath(); g.fill();
        g.save(); g.translate(82, 66); g.rotate(-0.35); g.fillRect(-17, -6, 34, 11); g.fillRect(-9, -13, 17, 8);
        g.beginPath(); g.arc(-9, 6, 5, 0, 7); g.arc(10, 6, 5, 0, 7); g.fill(); g.restore();
        g.font = 'bold 19px Arial'; g.textAlign = 'center'; g.fillText('JUMP', 64, 128);
      } else {
        g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 128, 160);
        g.save(); g.translate(64, 80); g.rotate(Math.PI / 4); g.fillStyle = '#f2c200'; g.fillRect(-52, -52, 104, 104); g.strokeStyle = '#111'; g.lineWidth = 5; g.strokeRect(-48, -48, 96, 96); g.restore();
        g.strokeStyle = '#111'; g.lineWidth = 9; g.beginPath(); g.moveTo(50, 118); g.bezierCurveTo(50, 80, 82, 88, 80, 50); g.stroke();
        g.fillStyle = '#111'; g.beginPath(); g.moveTo(66, 52); g.lineTo(94, 52); g.lineTo(80, 30); g.fill();
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    });
    const signMats = signTex.map((t) => new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
    const signPostGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6); signPostGeo.translate(0, 1.3, 0);
    const signPlateGeo = new THREE.PlaneGeometry(0.75, 0.94); signPlateGeo.translate(0, 2.35, 0.03);
    const boardPostGeo = new THREE.CylinderGeometry(0.1, 0.1, 3.4, 8); boardPostGeo.translate(0, 1.7, 0);
    const boardGeo = new THREE.BoxGeometry(2.6, 0.9, 0.08);
    const boardCache = new Map();
    function boardMat(text) {
      if (boardCache.has(text)) return boardCache.get(text);
      const c = document.createElement('canvas'); c.width = 512; c.height = 176; const g2 = c.getContext('2d');
      g2.fillStyle = '#111'; g2.fillRect(0, 0, 512, 176); g2.strokeStyle = '#d4161c'; g2.lineWidth = 10; g2.strokeRect(5, 5, 502, 166);
      g2.fillStyle = '#fff'; g2.font = 'bold 84px Arial'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(text, 256, 92);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
      boardCache.set(text, m); return m;
    }
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
    const lineMatStart = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xa9a7a2, roughness: 0.9 });
    const wallStripe = new THREE.MeshStandardMaterial({ color: 0xc81d1d, roughness: 0.7 });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 10.5, 7); poleGeo.translate(0, 5.0, 0);
    // All Road street lights: galvanised pole on a footing, an arm rising out over the outer lane, LED head
    const lampPoleGeo = (() => {
      const pole = new THREE.CylinderGeometry(0.07, 0.12, 9.0, 8); pole.translate(0, 4.5, 0);
      const arm = new THREE.CylinderGeometry(0.045, 0.055, 3.3, 6); arm.rotateZ(-(Math.PI / 2 - 0.08)); arm.translate(1.62, 8.95, 0);
      const foot = new THREE.CylinderGeometry(0.28, 0.32, 0.4, 10); foot.translate(0, 0.1, 0);
      return merge([pole, arm, foot]);
    })();
    const lampHeadGeo = new THREE.BoxGeometry(0.8, 0.13, 0.34); lampHeadGeo.translate(3.35, 9.1, 0);
    const lampLensGeo = new THREE.PlaneGeometry(0.66, 0.24); lampLensGeo.rotateX(Math.PI / 2); lampLensGeo.translate(3.35, 9.03, 0);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 0.45, metalness: 0.7 });
    const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.4 });
    const lampLensMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xfff0d8, emissiveIntensity: 0, roughness: 0.3 });
    const armGeo = new THREE.BoxGeometry(2.3, 0.12, 0.12); armGeo.translate(0, 9.4, 0);

    // ---- jump ramps: steel deck (diamond plate, yellow chevrons, hazard-striped lip and edges) on the physics ground
    const rampTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const g2 = c.getContext('2d');
      g2.fillStyle = '#7d8084'; g2.fillRect(0, 0, 256, 1024);
      g2.fillStyle = '#8f9296';
      for (let y = 0; y < 1024; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 256; x += 16) { g2.save(); g2.translate(x + 4, y + 4); g2.rotate(0.7); g2.fillRect(-4, -1.2, 8, 2.4); g2.restore(); }
      const haz = (x, y, w, h) => { g2.save(); g2.beginPath(); g2.rect(x, y, w, h); g2.clip(); g2.fillStyle = '#f2c200'; g2.fillRect(x, y, w, h); g2.fillStyle = '#111';
        for (let k = -h - w; k < w + h; k += 28) { g2.beginPath(); g2.moveTo(x + k, y); g2.lineTo(x + k + 14, y); g2.lineTo(x + k + 14 + h, y + h); g2.lineTo(x + k + h, y + h); g2.fill(); } g2.restore(); };
      const lipV = 1024 * W.RAMP.LUP / (W.RAMP.LUP + W.RAMP.LDN);    // canvas y grows along the travel direction
      const eb = Math.round(256 * W.RAMP.BEVEL / W.RAMP.W);
      haz(0, 0, eb, 1024); haz(256 - eb, 0, eb, 1024); haz(eb, lipV - 22, 256 - 2 * eb, 40);
      g2.fillStyle = '#f2c200';
      // chevrons up the ramp face, pointing the way you're going
      for (let k = 0; k < 3; k++) { const y = 70 + k * 115; g2.beginPath(); g2.moveTo(84, y); g2.lineTo(128, y + 44); g2.lineTo(172, y); g2.lineTo(172, y + 24); g2.lineTo(128, y + 68); g2.lineTo(84, y + 24); g2.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
    })();
    const rampMat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.55, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    function buildRamp(r, x0, z0) {
      const R = W.RAMP, hw = R.W / 2, us = [], vs = [];
      for (let k = 0; k <= 6; k++) vs.push(-hw + R.BEVEL * k / 6);
      vs.push(-hw / 3, hw / 3);
      for (let k = 6; k >= 0; k--) vs.push(hw - R.BEVEL * k / 6);
      for (let k = 0; k <= 14; k++) us.push(R.LUP * Math.pow(k / 14, 0.8));
      for (let k = 1; k <= 5; k++) us.push(R.LUP + R.LDN * k / 5);
      us[0] = 0.02; us[us.length - 1] = r.len - 0.02;
      const pos = [], uv = [], idx = [], gq = {};
      for (let i = 0; i < us.length; i++) for (let j = 0; j < vs.length; j++) {
        const u = us[i], v = vs[j] * 0.999, x = r.x + r.fx * u + r.rx * v, z = r.z + r.fz * u + r.rz * v;
        W.ground(x, z, gq);
        pos.push(x - x0, gq.h + 0.012, z - z0); uv.push((vs[j] + hw) / R.W, 1 - u / r.len);
      }
      const nv = vs.length;
      for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < nv - 1; j++) {
        const a = i * nv + j, b = a + 1, c = a + nv, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      if (geo.attributes.normal.getY(Math.floor(us.length / 2) * nv + 2) < 0) {
        for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
        geo.setIndex(idx); geo.computeVertexNormals();
      }
      const m = new THREE.Mesh(geo, rampMat); m.castShadow = true; m.receiveShadow = true;
      return m;
    }
    const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);
    function instanced(geo, mat, arr, stride, x0, z0, fn) {
      const count = arr.length / stride;
      if (!count) return null;
      const im = new THREE.InstancedMesh(geo, mat, count);
      for (let k = 0; k < count; k++) fn(arr, k * stride, _m4, _c, x0, z0), im.setMatrixAt(k, _m4), im.setColorAt(k, _c);
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      return im;
    }
    function* buildProps(cx, cz, out) {
      const cp = W.chunkProps(cx, cz);
      yield;
      const x0 = cx * CH, z0 = cz * CH;
      const g = new THREE.Group(); g.position.set(x0, 0, z0);
      const td = q.treeDensity;
      for (let kind = 0; kind < 3; kind++) {
        const sel = [];
        for (let i = 0; i < cp.trees.length; i += 6) {
          if (cp.trees[i + 5] !== kind) continue;
          if (td < 1 && ((i / 6) * 0.618) % 1 > td) continue;
          for (let k = 0; k < 6; k++) sel.push(cp.trees[i + k]);
        }
        const place = (a, o, m, c) => {
          _q.setFromAxisAngle(_up, a[o + 4]); const s = a[o + 3];
          m.compose(_v.set(a[o] - x0, a[o + 1], a[o + 2] - z0), _q, _s.set(s, s * (0.9 + 0.25 * ((a[o + 4] * 7.3) % 1)), s));
          const v = 0.85 + 0.3 * ((a[o + 4] * 3.7) % 1); c.setRGB(v, v * (0.95 + 0.1 * ((a[o] * 0.37) % 1)), v * 0.95);
        };
        const t = instanced(GEO.trunk[kind], MAT.trunk[kind], sel, 6, x0, z0, place); if (t) g.add(t);
        const l = instanced(GEO.leaves[kind], MAT.leaves[kind], sel, 6, x0, z0, place); if (l) g.add(l);
        yield;
      }
      const placeSimple = (a, o, m, c) => {
        _q.setFromAxisAngle(_up, a[o + 4]); const s = a[o + 3];
        m.compose(_v.set(a[o] - x0, a[o + 1] - 0.15 * s, a[o + 2] - z0), _q, _s.set(s, s, s));
        const v = 0.8 + 0.4 * ((a[o + 4] * 5.1) % 1); c.setRGB(v, v, v);
      };
      const bu = instanced(GEO.bush, MAT.bush, cp.bushes, 6, x0, z0, placeSimple); if (bu) { bu.castShadow = false; g.add(bu); }
      const ro = instanced(GEO.rock, MAT.rock, cp.rocks, 6, x0, z0, placeSimple); if (ro) g.add(ro);
      for (const b of cp.buildings) g.add(buildBuilding(b, x0, z0));
      yield;
      if (cp.poles.length) {
        const pa = [];
        for (const p of cp.poles) pa.push(p.x, p.y, p.z, 1, p.rot, 0);
        const placePole = (a, o, m, c) => { _q.setFromAxisAngle(_up, a[o + 4]); m.compose(_v.set(a[o] - x0, a[o + 1] - 0.3, a[o + 2] - z0), _q, _s.set(1, 1, 1)); c.setRGB(1, 1, 1); };
        const pm = instanced(poleGeo, MAT.pole, pa, 6, x0, z0, placePole); if (pm) g.add(pm);
        const am = instanced(armGeo, MAT.pole, pa, 6, x0, z0, placePole); if (am) g.add(am);
        const wp = [];
        for (const p of cp.poles) {
          if (!p.wire) continue;
          const c = Math.cos(p.rot), s = Math.sin(p.rot);
          for (const ox of [-1.0, 0, 1.0]) {
            const ax = p.x + ox * c - x0, az = p.z - ox * s - z0, ay = p.y - 0.3 + 9.46 + (ox === 0 ? 0.25 : 0);
            const bx = p.xn + ox * c - x0, bz = p.zn - ox * s - z0, by = p.yn - 0.3 + 9.46 + (ox === 0 ? 0.25 : 0);
            let px = ax, py = ay, pz = az;
            for (let k = 1; k <= 8; k++) {
              const t = k / 8, sag = 4 * t * (1 - t) * 0.9;
              const nx = ax + (bx - ax) * t, ny = ay + (by - ay) * t - sag, nz = az + (bz - az) * t;
              wp.push(px, py, pz, nx, ny, nz); px = nx; py = ny; pz = nz;
            }
          }
        }
        if (wp.length) {
          const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
          g.add(new THREE.LineSegments(wg, MAT.wire));
        }
      }
      if (cp.lamps && cp.lamps.length) {
        const la = [];
        for (const p of cp.lamps) la.push(p.x, p.y, p.z, 1, p.rot, 0);
        const placeLamp = (a, o, m, c) => { _q.setFromAxisAngle(_up, a[o + 4]); m.compose(_v.set(a[o] - x0, a[o + 1], a[o + 2] - z0), _q, _s.set(1, 1, 1)); c.setRGB(1, 1, 1); };
        for (const [geo, mat] of [[lampPoleGeo, lampMat], [lampHeadGeo, lampHeadMat], [lampLensGeo, lampLensMat]]) {
          const im = instanced(geo, mat, la, 6, x0, z0, placeLamp);
          if (im) { if (mat === lampLensMat) im.castShadow = false; g.add(im); }
        }
      }
      for (const lb of cp.labels || []) {
        const post = new THREE.Mesh(boardPostGeo, MAT.rock); post.position.set(lb.x - x0, lb.y, lb.z - z0);
        const board = new THREE.Mesh(boardGeo, boardMat(lb.text)); board.position.set(0, 3.1, 0); board.rotation.y = 0;
        post.add(board); post.castShadow = true; g.add(post);
        if (!lb.single) { const post2 = post.clone(); post2.position.x = -lb.x - x0; g.add(post2); }
      }
      for (const wl of cp.walls || []) {
        const wm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.05, wl.len), wallMat); wm.position.set(wl.x - x0, 0.52, wl.z - z0);
        wm.castShadow = true; wm.receiveShadow = true; g.add(wm);
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.12, wl.len), wallStripe); st.position.set(wl.x - x0, 0.85, wl.z - z0); g.add(st);
      }
      for (const ln of cp.lines || []) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(ln.w, ln.start ? 0.45 : 0.2), ln.start ? lineMatStart : lineMat);
        m.rotation.x = -Math.PI / 2; m.position.set(0 - x0, 0.02, ln.z - z0); m.receiveShadow = true; g.add(m);
      }
      for (const r of (W.rampsInChunk ? W.rampsInChunk(cx, cz) : [])) g.add(buildRamp(r, x0, z0));
      for (const sgn of cp.signs) {
        const post = new THREE.Mesh(signPostGeo, MAT.rock); post.position.set(sgn.x - x0, sgn.y - 0.1, sgn.z - z0); post.rotation.y = sgn.rot;
        const plate = new THREE.Mesh(signPlateGeo, signMats[sgn.kind]); post.add(plate);
        post.castShadow = true; g.add(post);
      }
      out.group = g;
    }

    // ---------------------------------------------------------------- chunk manager
    const chunks = new Map();
    const jobs = [];
    let camX = 0, camZ = 0;
    function lodFor(d) { return d < 330 ? 0 : d < 700 ? 1 : d < 1150 ? 2 : 3; }
    function chunkDist(cx, cz) {
      const x0 = cx * CH, z0 = cz * CH;
      const dx = Math.max(x0 - camX, 0, camX - (x0 + CH)), dz = Math.max(z0 - camZ, 0, camZ - (z0 + CH));
      return Math.hypot(dx, dz);
    }
    function update(cam) {
      camX = cam.x; camZ = cam.z;
      W.roadUniforms(camX, camZ, fNS, fEW);
      for (let i = 0; i < 15; i++) { rns[i].fromArray(fNS, i * 4); rew[i].fromArray(fEW, i * 4); }
      const R = q.viewDist, r = Math.ceil(R / CH);
      const ccx = Math.floor(camX / CH), ccz = Math.floor(camZ / CH);
      const want = new Set();
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        const d = chunkDist(cx, cz);
        if (d > R) continue;
        const key = cx + ',' + cz; want.add(key);
        let ch = chunks.get(key);
        if (!ch) { ch = { cx, cz, mesh: null, lod: -1, wantLod: -1, job: null, props: null, propJob: null }; chunks.set(key, ch); }
        const lod = lodFor(d);
        if (lod !== ch.lod && lod !== ch.wantLod) {
          ch.wantLod = lod;
          const o = {};
          ch.job = { gen: buildTerrain(cx, cz, lod, o), out: o, ch, lod, pri: d, type: 't' };
          jobs.push(ch.job);
        }
        const wantProps = d < q.propDist;
        if (wantProps && !ch.props && !ch.propJob) {
          const o = {};
          ch.propJob = { gen: buildProps(cx, cz, o), out: o, ch, pri: d + 60, type: 'p' };
          jobs.push(ch.propJob);
        } else if (!wantProps && d > q.propDist + 120 && ch.props) {
          group.remove(ch.props); disposeGroup(ch.props); ch.props = null;
        }
      }
      for (const [key, ch] of chunks) {
        if (!want.has(key)) {
          if (ch.mesh) { group.remove(ch.mesh); ch.mesh.geometry.dispose(); }
          if (ch.props) { group.remove(ch.props); disposeGroup(ch.props); }
          if (ch.job) ch.job.dead = true;
          if (ch.propJob) ch.propJob.dead = true;
          chunks.delete(key);
        } else if (ch.job) ch.job.pri = chunkDist(ch.cx, ch.cz) - (ch.lod < 0 ? 200 : 0);
      }
    }
    function disposeGroup(g) {
      g.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        if ((o.isLineSegments) && o.geometry) o.geometry.dispose();
        if (o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry !== signPostGeo && o.geometry !== signPlateGeo) o.geometry.dispose();
      });
    }
    function processJobs(budgetMs) {
      const t0 = performance.now();
      jobs.sort((a, b) => a.pri - b.pri);
      let did = 0;
      while (jobs.length && performance.now() - t0 < budgetMs) {
        const j = jobs[0];
        if (j.dead) { jobs.shift(); continue; }
        const r = j.gen.next();
        if (r.done) {
          jobs.shift(); did++;
          const ch = j.ch;
          if (j.type === 't') {
            if (ch.job !== j) continue;
            const mesh = new THREE.Mesh(j.out.geo, terrainMat);
            mesh.position.set(ch.cx * CH, 0, ch.cz * CH);
            mesh.receiveShadow = true; mesh.castShadow = false;
            mesh.matrixAutoUpdate = false; mesh.updateMatrix();
            if (ch.mesh) { group.remove(ch.mesh); ch.mesh.geometry.dispose(); }
            ch.mesh = mesh; ch.lod = j.lod; ch.job = null; ch.wantLod = -1;
            group.add(mesh);
          } else {
            if (ch.propJob !== j) continue;
            ch.props = j.out.group; ch.propJob = null;
            group.add(ch.props);
          }
        }
      }
      return jobs.length;
    }
    function pending() { return jobs.filter((j) => !j.dead).length; }
    function readyAround(x, z, r) {
      for (const ch of chunks.values()) if (chunkDist(ch.cx, ch.cz) < r && (!ch.mesh || (ch.propJob && chunkDist(ch.cx, ch.cz) < r * 0.6))) return false;
      return true;
    }
    function rebuildAll() {
      for (const ch of chunks.values()) {
        if (ch.props) { group.remove(ch.props); disposeGroup(ch.props); ch.props = null; }
        if (ch.propJob) { ch.propJob.dead = true; ch.propJob = null; }
        ch.wantLod = -1; ch.lod = -1;
      }
    }

    // ---------------------------------------------------------------- water
    const waterNormal = (() => {
      const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
      const img = g.createImageData(S, S);
      const hgt = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let v = 0;
        for (let o = 1; o <= 4; o++) { const f = o * 2 * Math.PI / S; v += Math.sin(x * f * (o % 2 ? 2 : 3) + y * f * (o % 3 ? 1 : 2) + o) / o; }
        hgt[y * S + x] = v;
      }
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = hgt[y * S + (x + 1) % S] - hgt[y * S + (x - 1 + S) % S], dy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
        const i = (y * S + x) * 4; img.data[i] = 128 - dx * 40; img.data[i + 1] = 128 - dy * 40; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(300, 300); return t;
    })();
    const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({
      color: 0x16323c, roughness: 0.06, metalness: 0.05, normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.9,
    }));
    water.rotation.x = -Math.PI / 2; water.position.y = C.WATER_LEVEL; water.receiveShadow = true;
    water.visible = W.map !== 'tarmac';
    scene.add(water);

    // ---------------------------------------------------------------- sky & lighting
    const skyUniforms = {
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() }, uTime: { value: 0 },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uCloud: { value: 0.6 }, uNight: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 uSunDir, uZenith, uHorizon, uGround, uSunCol; uniform float uTime, uCloud, uNight; varying vec3 vDir;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.45));
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 1600.0) * 30.0 * (1.0 - uNight * 0.6) + pow(sd, 90.0) * 0.4 + pow(sd, 7.0) * 0.14);
  if (uNight > 0.0 && h > 0.0) { vec2 sp = d.xz / (h + 0.3) * 260.0; float st = step(0.9975, hash12(floor(sp))) * (0.5 + 0.5 * hash12(floor(sp) + 3.1)); col += vec3(st) * uNight * smoothstep(0.02, 0.2, h); }
  if (h > 0.005) {
    vec2 uv = d.xz / (h + 0.12) * 1.3 + vec2(uTime * 0.006, uTime * 0.002);
    float c = fbm3(uv * 1.3) * 0.65 + fbm3(uv * 4.1 + 3.0) * 0.35;
    c = smoothstep(0.52, 0.82, c) * uCloud * smoothstep(0.005, 0.18, h);
    vec3 cc = mix(vec3(1.0), uHorizon, 0.25) * (1.0 - uNight * 0.93) + uSunCol * pow(sd, 6.0) * 0.5;
    col = mix(col, cc, c * 0.9);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), skyMat);
    sky.frustumCulled = false; sky.renderOrder = -1;
    scene.add(sky);

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = q.shadows;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 500;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
    scene.add(sun); scene.add(sun.target);
    const hemi = new THREE.HemisphereLight(0x9ec5ff, 0x4a4032, 0.6);
    scene.add(hemi);
    scene.fog = new THREE.Fog(0xb8c8d8, 300, 1650);

    const PRESETS = {
      day: { elev: 44, az: 35, sun: [1.0, 0.96, 0.9], sunI: 3.1, zen: [0.16, 0.36, 0.72], hor: [0.70, 0.80, 0.90], gnd: [0.35, 0.33, 0.3], hemiI: 0.55, hs: 0x9ec5ff, hg: 0x4a4032, fog: [0.72, 0.80, 0.88], night: 0, cloud: 0.55, env: 1.0, exposure: 1.0 },
      sunset: { elev: 7, az: 70, sun: [1.0, 0.58, 0.32], sunI: 2.4, zen: [0.16, 0.24, 0.5], hor: [0.98, 0.6, 0.38], gnd: [0.25, 0.2, 0.18], hemiI: 0.4, hs: 0xffb58a, hg: 0x3a2a24, fog: [0.85, 0.6, 0.48], night: 0, cloud: 0.6, env: 0.8, exposure: 1.05 },
      night: { elev: 38, az: 220, sun: [0.55, 0.64, 0.9], sunI: 0.22, zen: [0.006, 0.01, 0.028], hor: [0.03, 0.04, 0.075], gnd: [0.01, 0.01, 0.015], hemiI: 0.1, hs: 0x44557a, hg: 0x101010, fog: [0.03, 0.04, 0.07], night: 1, cloud: 0.35, env: 0.15, exposure: 1.1 },
    };
    let preset = 'day';
    const sunDir = new THREE.Vector3();
    function setTime(name, renderer) {
      const p = PRESETS[name] || PRESETS.day; preset = name;
      const el = p.elev * Math.PI / 180, az = p.az * Math.PI / 180;
      sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
      skyUniforms.uSunDir.value.copy(sunDir);
      skyUniforms.uZenith.value.setRGB(...p.zen); skyUniforms.uHorizon.value.setRGB(...p.hor); skyUniforms.uGround.value.setRGB(...p.gnd);
      skyUniforms.uSunCol.value.setRGB(...p.sun); skyUniforms.uCloud.value = p.cloud; skyUniforms.uNight.value = p.night;
      sun.color.setRGB(...p.sun); sun.intensity = p.sunI;
      hemi.color.setHex(p.hs); hemi.groundColor.setHex(p.hg); hemi.intensity = p.hemiI;
      scene.fog.color.setRGB(...p.fog);
      // All Road street lights come on at dusk
      terrUniforms.uLamp.value = p.night ? 1 : name === 'sunset' ? 0.3 : 0;
      lampLensMat.emissiveIntensity = p.night ? 6 : name === 'sunset' ? 2 : 0;
      if (renderer) {
        renderer.toneMappingExposure = p.exposure;
        const pm = new THREE.PMREMGenerator(renderer);
        const envScene = new THREE.Scene();
        const s2 = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat);
        envScene.add(s2);
        const g2 = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: new THREE.Color(...p.gnd).multiplyScalar(0.6) }));
        g2.rotation.x = -Math.PI / 2; g2.position.y = -2; envScene.add(g2);
        if (scene.environment) scene.environment.dispose();
        scene.environment = pm.fromScene(envScene, 0.02).texture;
        scene.environmentIntensity = p.env;
        pm.dispose();
      }
      return p;
    }
    const _tv = new THREE.Vector3();
    function frame(dt, camera, focus) {
      skyUniforms.uTime.value += dt;
      sky.position.copy(camera.position);
      water.position.x = Math.round(camera.position.x / 50) * 50; water.position.z = Math.round(camera.position.z / 50) * 50;
      waterNormal.offset.x += dt * 0.01; waterNormal.offset.y += dt * 0.006;
      // shadow camera follows the car, snapped to texels
      const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
      _tv.copy(focus);
      _tv.x = Math.round(_tv.x / texel) * texel; _tv.z = Math.round(_tv.z / texel) * texel;
      sun.target.position.copy(_tv);
      sun.position.copy(_tv).addScaledVector(sunDir, 200);
    }
    function setQuality(o) {
      Object.assign(q, o);
      sun.castShadow = q.shadows;
      scene.fog.far = Math.max(600, q.viewDist - 50);
      scene.fog.near = Math.min(300, q.viewDist * 0.2);
    }
    setQuality({});

    // ---------------------------------------------------------------- drag strip decor (built once near the start)
    let drag = null;
    if (W.map === 'drag' || W.map === 'dirtdrag') {
      const dg = new THREE.Group(); scene.add(dg);
      const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6, metalness: 0.4 });
      const concrete = new THREE.MeshStandardMaterial({ color: 0x8d8b86, roughness: 0.95 });
      // Christmas tree between the lanes, 6 m past the start line, facing the cars
      const tree = new THREE.Group(); tree.position.set(0, 0, -6); dg.add(tree);
      const tm = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; tree.add(m); return m; };
      tm(new THREE.CylinderGeometry(0.09, 0.12, 1.6, 10), dark, 0, 0.8, 0);
      tm(new THREE.BoxGeometry(0.62, 2.1, 0.22), dark, 0, 2.6, 0);
      const bulb = (col) => new THREE.MeshStandardMaterial({ color: 0x151515, emissive: col, emissiveIntensity: 0, roughness: 0.3 });
      const L = { pre: [], stage: [], amber: [], green: [], red: [] };
      for (const sx of [-1, 1]) {
        const x = sx * 0.16;
        const add = (key, y, r, col) => { const mat = bulb(col); const m = tm(new THREE.CylinderGeometry(r, r, 0.06, 20), mat, x, y, 0.12); m.rotation.x = Math.PI / 2; L[key].push({ mat, side: sx }); };
        add('pre', 3.5, 0.045, 0xfff2c0); add('pre', 3.5, 0.045, 0xfff2c0);
        add('stage', 3.36, 0.045, 0xfff2c0);
        add('amber', 3.12, 0.085, 0xffa400); add('amber', 2.9, 0.085, 0xffa400); add('amber', 2.68, 0.085, 0xffa400);
        add('green', 2.42, 0.085, 0x20ff40); add('red', 2.16, 0.085, 0xff1a10);
      }
      // scoreboard at the finish line (right side), faces the approaching cars
      const sbC = document.createElement('canvas'); sbC.width = 512; sbC.height = 256;
      const sbT = new THREE.CanvasTexture(sbC); sbT.colorSpace = THREE.SRGBColorSpace;
      const sb = new THREE.Group(); sb.position.set(16, 0, -402.336); dg.add(sb);
      const sbPost = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), dark); sbPost.position.y = 3; sb.add(sbPost);
      const sbFace = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), new THREE.MeshBasicMaterial({ map: sbT, toneMapped: false })); sbFace.position.set(0, 6.8, 0.25); sb.add(sbFace);
      const sbBox = new THREE.Mesh(new THREE.BoxGeometry(7.3, 3.8, 0.4), dark); sbBox.position.set(0, 6.8, 0); sb.add(sbBox);
      function drawBoard(et, mph, rt) {
        const g = sbC.getContext('2d');
        g.fillStyle = '#050505'; g.fillRect(0, 0, 512, 256);
        g.font = 'bold 30px Arial'; g.fillStyle = '#888'; g.textAlign = 'left'; g.fillText('ET', 24, 70); g.fillText('MPH', 24, 170);
        g.font = 'bold 86px "Courier New", monospace'; g.fillStyle = '#ffb000'; g.textAlign = 'right';
        g.fillText(et !== undefined ? et.toFixed(3) : '-.---', 490, 92);
        g.fillText(mph !== undefined ? mph.toFixed(2) : '---.--', 490, 196);
        g.font = 'bold 26px Arial'; g.fillStyle = '#e33'; g.textAlign = 'left'; g.fillText(rt !== undefined ? 'R/T ' + rt.toFixed(3) : '', 24, 236);
        sbT.needsUpdate = true;
      }
      drawBoard();
      // grandstands (left side) and the start tower
      const crowdC = document.createElement('canvas'); crowdC.width = 256; crowdC.height = 64;
      { const g = crowdC.getContext('2d'); g.fillStyle = '#555'; g.fillRect(0, 0, 256, 64); const cols = ['#c33', '#36c', '#eee', '#222', '#eb3', '#3a3', '#a5c', '#f80'];
        for (let i = 0; i < 700; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(Math.random() * 256, Math.random() * 64, 3, 5); } }
      const crowdT = new THREE.CanvasTexture(crowdC); crowdT.colorSpace = THREE.SRGBColorSpace; crowdT.wrapS = THREE.RepeatWrapping; crowdT.repeat.set(12, 1);
      const crowdM = new THREE.MeshStandardMaterial({ map: crowdT, roughness: 0.95 });
      for (let k = 0; k < 7; k++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6 + k * 0.6, 150), k % 2 ? concrete : concrete);
        step.position.set(-17 - k * 1.6, (0.6 + k * 0.6) / 2, -45); step.castShadow = true; step.receiveShadow = true; dg.add(step);
        const people = new THREE.Mesh(new THREE.PlaneGeometry(150, 0.55), crowdM);
        people.rotation.y = Math.PI / 2; people.position.set(-15.45 - k * 1.6, 0.6 + k * 0.6 + 0.25, -45); dg.add(people);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 152), dark); roof.position.set(-23.5, 8.2, -45); roof.castShadow = true; dg.add(roof);
      for (let k = 0; k < 6; k++) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8.2, 0.3), dark); col.position.set(-29.5, 4.1, -115 + k * 28); dg.add(col); }
      const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 9, 5), concrete); tower.position.set(-14.5, 4.5, 6); tower.castShadow = true; dg.add(tower);
      const towerGlass = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 5.2), new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.5 })); towerGlass.position.set(-14.5, 8.2, 6); dg.add(towerGlass);
      drag = {
        // state: { pre: bool, stage: bool, amber: bool, green: bool, red: bool } for the lane side (+1 right / -1 left)
        setTree(side, st) {
          for (const k of Object.keys(L)) for (const b of L[k]) if (b.side === side) b.mat.emissiveIntensity = st[k] ? (k === 'pre' || k === 'stage' ? 3 : 5) : 0;
        },
        setBoard: drawBoard,
      };
    }

    return { group, terrainMat, update, drag, processJobs, pending, readyAround, frame, setTime, setQuality, rebuildAll, sunDir, sun, hemi, sky, water, get preset() { return preset; }, chunks };
  }

  root.HCWorldRender = { create };
})(typeof self !== 'undefined' ? self : this);
