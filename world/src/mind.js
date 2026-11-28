// «Мысль на виду» для локации 1: фраза гостя — цепочка в пространстве (точка за точкой, нить к следующей, у каждой слово; потом гаснет)
// и образы — облака точек, которые собираются из названного слова. Образ — не фотография: это то, что слово будит.
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { label, glowSprite } from './words.js';
import { loadModel, fit, CATALOG } from './things.js';

const V3 = THREE.Vector3;
// что умеет собираться в образ: слово (по началу слова) → модель
export const IMAGES = [
  ...CATALOG.map((c) => ({ name: c.name, re: c.re, file: c.file })),
  { name: 'пёс', re: /(^|[^а-яё])(пёс|пес|пса|псу|псом)([^а-яё]|$)|собак|щен/, file: 'dog/Husky.glb' },
  { name: 'кот', re: /(^|[^а-яё])кот([^а-яё]|$)|кошк|котик|котён/, file: 'things/cat.glb' },
  { name: 'пылесос', re: /пылесос/, file: 'living/roomba.glb' },
  { name: 'цветок', re: /цвет(ок|к|ы)|(^|[^а-яё])роз/, file: 'flower/rose.glb' },
  { name: 'диван', re: /диван/, file: 'living/kenney_loungeSofa.glb' },
  { name: 'игровой автомат', re: /автомат/, file: 'arcade/arcade-machine.glb' },
];

export function makeMind(W, group, { isActive }) {
  const M = { images: [] };
  const uni = { uTime: { value: 0 }, uPx: { value: 1 } };
  const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };

  // ── опорные точки вокруг гостя: из них собираются образы, к ним уходят нити внимания к словам не из ленты. Сами точки не видны ──
  const N = 2400, C = new V3(0, 1.5, 0), np = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const z = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - z * z), r = 3.2 + Math.random() ** 1.6 * 11;
    np.set([C.x + s * Math.cos(th) * r, C.y + z * r * 0.8, C.z + s * Math.sin(th) * r], i * 3);
  }
  const node = (i, v = new V3()) => v.fromArray(np, i * 3);
  M.spot = () => { let to; for (let k = 0; k < 40; k++) { to = node((Math.random() * N) | 0); if (to.distanceTo(C) < 5.5 && to.y > 0.6 && to.z < 1) break; } return to.clone(); };

  // ── фраза гостя — цепочка: точка за точкой с шагом STEP, от прошлой к новой растёт нить, у точки встаёт слово;
  //    цепочка держится HOLD секунд после последнего слова и гаснет. Новая фраза гасит прежнюю цепочку ──
  const STEP = 0.5, GROW = 0.3, HOLD = 4, FADE = 1.5, MAXW = 10, chains = [];
  const segGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0), Y = new V3(0, 1, 0);
  function chain(text) {
    const ws = text.split(/\s+/).map((w) => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '')).filter(Boolean).slice(0, MAXW); // все слова, и однобуквенные: «я», «в», «с» (22.11.2026 — без них фраза в мире выглядела нераспознанной)
    if (!ws.length) return null;
    for (const c of chains) c.t = Math.max(c.t, c.dur);
    // дуга сбоку от ленты: лента идёт прямо вперёд, цепочка — слева или справа от неё, на 2,3–3 м
    const H = W.head.pos, yaw = Math.atan2(W.head.dir.x, -W.head.dir.z), side = Math.random() < 0.5 ? -1 : 1;
    let ang = yaw + side * (0.55 + Math.random() * 0.25), y = 1.35 + Math.random() * 0.4;
    const c = { t: 0, dur: (ws.length - 1) * STEP + GROW + HOLD, steps: [], g: new THREE.Group() }; group.add(c.g);
    ws.forEach((w, i) => {
      const r = 2.3 + Math.random() * 0.7, p = new V3(H.x + Math.sin(ang) * r, y, H.z - Math.cos(ang) * r);
      const dot = glowSprite(0xbfd4ff, 0.16, 0); dot.position.copy(p); c.g.add(dot);
      const lab = label(w, { h: 0.06, color: '#ffffff', glow: '#8fb0ff' }); lab.position.copy(p).add(new V3(0, 0.1, 0)); lab.material.opacity = 0; c.g.add(lab);
      let seg = null, len = 0;
      if (i) { const from = c.steps[i - 1].p; len = from.distanceTo(p);
        seg = new THREE.Mesh(segGeo, new THREE.MeshBasicMaterial({ color: 0x9fc0ff, ...common, opacity: 0 })); seg.position.copy(from);
        seg.quaternion.setFromUnitVectors(Y, p.clone().sub(from).normalize()); seg.scale.set(0.004, 0.0001, 0.004); c.g.add(seg); }
      c.steps.push({ p, dot, lab, seg, len, at: i * STEP, lit: false });
      ang += side * (0.14 + Math.random() * 0.1); y = Math.min(2.3, Math.max(1.1, y + (Math.random() - 0.4) * 0.3));
    });
    chains.push(c); return c;
  }
  function dropChain(c) { group.remove(c.g); for (const s of c.steps) { s.dot.material.dispose(); s.lab.geometry.dispose(); s.lab.material.dispose(); if (s.seg) s.seg.material.dispose(); } chains.splice(chains.indexOf(c), 1); }
  M.chain = chain; M.chains = chains;
  M.clearChains = () => { for (const c of [...chains]) dropChain(c); };
  // ── образы: облако точек собирается из узлов сети в форму названной вещи ──
  const SLOTS = [-1.25, 1.25, -2.2, 2.2, 3.14], imgs = M.images; let slot = 0;
  const find = (name) => { const t = String(name).toLowerCase(); return IMAGES.find((x) => x.name === t) || IMAGES.find((x) => x.re.test(t)); };
  M.names = () => IMAGES.map((x) => x.name);
  async function image(name) {
    const c = find(name); if (!c) return null;
    const old = imgs.find((x) => x.name === c.name && !x.dying); if (old) { old.born = W.t; return old; }
    const im = { name: c.name, born: W.t, grow: 0, dying: false, g: null }; imgs.push(im);
    while (imgs.filter((x) => !x.dying).length > 3) imgs.find((x) => !x.dying).dying = true;
    let obj; try { obj = fit(await loadModel(c.file), 1.9); } catch (e) { imgs.splice(imgs.indexOf(im), 1); return null; }
    obj.updateMatrixWorld(true);
    const parts = []; let total = 0;
    obj.traverse((o) => { if (!o.isMesh || !o.geometry?.attributes.position || !o.geometry.attributes.position.count) return;
      const s = new MeshSurfaceSampler(o).build(), area = (s.distribution?.[s.distribution.length - 1] || 0) * o.matrixWorld.getMaxScaleOnAxis() ** 2; if (area > 0) { parts.push({ o, s, area }); total += area; } });
    if (!total) { imgs.splice(imgs.indexOf(im), 1); return null; }
    const K = 6000, tp = new Float32Array(K * 3), sp = new Float32Array(K * 3), sd = new Float32Array(K), v = new V3(); let n = 0;
    const ang = SLOTS[slot++ % SLOTS.length], base = W.head.pos.clone(); base.y = 0;
    const g = new THREE.Group(); g.position.set(base.x + Math.sin(ang) * 3.7, 0.5, base.z - Math.cos(ang) * 3.7);
    for (const p of parts) { const cnt = Math.max(1, Math.round(K * p.area / total)); for (let k = 0; k < cnt && n < K; k++, n++) {
      p.s.sample(v); v.applyMatrix4(p.o.matrixWorld); tp.set([v.x, v.y, v.z], n * 3);
      node((Math.random() * N) | 0, v).sub(g.position); sp.set([v.x, v.y, v.z], n * 3); sd[n] = Math.random(); } }
    { // облако ставится само: наибольшая сторона 2,4 м, основание на нуле, центр по оси — так модель с любым своим масштабом выходит одного размера
      const bb = new THREE.Box3().setFromArray(tp.subarray(0, n * 3)), sz = bb.getSize(new V3()), cc = bb.getCenter(new V3()), k = 2.4 / Math.max(sz.x, sz.y, sz.z);
      for (let i = 0; i < n; i++) { tp[i * 3] = (tp[i * 3] - cc.x) * k; tp[i * 3 + 1] = (tp[i * 3 + 1] - bb.min.y) * k; tp[i * 3 + 2] = (tp[i * 3 + 2] - cc.z) * k; } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(tp.subarray(0, n * 3), 3)); geo.setAttribute('aStart', new THREE.BufferAttribute(sp.subarray(0, n * 3), 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(sd.subarray(0, n), 1));
    const mat = new THREE.ShaderMaterial({ ...common, uniforms: { uGrow: { value: 0 }, uTime: uni.uTime, uPx: uni.uPx },
      vertexShader: `attribute vec3 aStart; attribute float aSeed; uniform float uGrow, uTime, uPx; varying float vB; varying float vS;
        void main(){ vS = aSeed; float k = clamp(uGrow * 1.7 - aSeed * 0.7, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k);
          vec3 p = mix(aStart, position, k) + (1.0 - k) * 0.25 * vec3(sin(uTime * 2.0 + aSeed * 30.0), cos(uTime * 1.7 + aSeed * 50.0), sin(uTime * 2.3 + aSeed * 70.0));
          p += 0.012 * vec3(sin(uTime * 1.3 + aSeed * 90.0), cos(uTime * 1.1 + aSeed * 40.0), 0.0);
          vB = (0.35 + 0.65 * k) * (0.75 + 0.25 * sin(uTime * 3.0 + aSeed * 60.0)) * smoothstep(0.0, 0.15, uGrow);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * (1.4 + aSeed * 1.8) * clamp(6.0 / -mv.z, 0.5, 2.4); }`,
      fragmentShader: `varying float vB; varying float vS; void main(){ float d = length(gl_PointCoord - 0.5); float al = smoothstep(0.5, 0.05, d);
        vec3 c = mix(vec3(0.6, 0.78, 1.0), vec3(1.0, 0.85, 0.6), step(0.8, vS)); gl_FragColor = vec4(c * vB * al * 0.42, 1.0); }` });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; g.add(pts);
    const lab = label(c.name, { h: 0.17, color: '#ffffff', glow: '#8fb0ff' }); lab.position.set(0, -0.28, 0); lab.material.opacity = 0; g.add(lab);
    im.g = g; im.pts = pts; im.lab = lab; im.count = n; group.add(g);
    W.fx.sound('chime', 0.7);
    return im;
  }
  M.image = image; M.find = find;
  M.fromSpeech = (text) => { const t = text.toLowerCase(); let k = 0; for (const c of IMAGES) if (c.re.test(t) && k++ < 2) image(c.name); };
  M.clear = () => { for (const im of imgs) im.dying = true; };

  W.on('guest:said', (text) => { if (!isActive()) return; chain(text); M.fromSpeech(text); });

  M.update = (dt) => {
    uni.uTime.value = W.t; uni.uPx.value = W.xr ? 1.6 : 1;
    for (let i = chains.length - 1; i >= 0; i--) {
      const c = chains[i]; c.t += dt; const alpha = Math.max(0, 1 - Math.max(0, c.t - c.dur) / FADE);
      if (alpha <= 0) { dropChain(c); continue; }
      for (const s of c.steps) { const k = c.t - s.at; if (k < 0) continue;
        const g = s.seg ? Math.min(1, k / GROW) : 1; // нить от прошлой точки дорастает — и только тогда загорается точка и слово
        if (s.seg) { s.seg.scale.y = Math.max(0.0001, s.len * g); s.seg.material.opacity = 0.7 * alpha; }
        if (g < 1) continue; const a = k - (s.seg ? GROW : 0);
        if (!s.lit) { s.lit = true; W.fx.sound('word', 0.7 + Math.random() * 0.3); }
        s.dot.material.opacity = alpha * (0.5 + 0.5 * Math.max(0, 1 - a * 2)); s.dot.scale.setScalar(0.16 * (1 + Math.max(0, 1 - a * 2)));
        s.lab.material.opacity = alpha * Math.min(1, a / 0.25); s.lab.lookAt(W.head.pos); }
    }
    for (let i = imgs.length - 1; i >= 0; i--) {
      const im = imgs[i]; if (!im.g) continue; if (W.t - im.born > 45) im.dying = true;
      im.grow = Math.max(0, Math.min(1, im.grow + dt * (im.dying ? -0.6 : 0.4))); im.pts.material.uniforms.uGrow.value = im.grow;
      im.pts.rotation.y += dt * 0.18; im.lab.lookAt(W.head.pos); im.lab.material.opacity = Math.max(0, im.grow * 2 - 1);
      if (im.dying && im.grow <= 0) { group.remove(im.g); im.pts.geometry.dispose(); im.pts.material.dispose(); im.lab.geometry.dispose(); im.lab.material.dispose(); imgs.splice(i, 1); }
    }
  };
  return M;
}
