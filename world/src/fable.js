// Fable в мире: фигура в рост человека из светящихся слов, без лица. Ходит, поворачивается к гостю, жестикулирует, говорит.
import * as THREE from 'three';
import { loadPerson } from './people.js';
import { label, glowSprite, FABLE_WORDS, FONT, STOP } from './words.js';

let N = 2600;
const A = '/rocketbox/animations/';
const CLIPS = { idle: A + 'm_idle_breathe_01.fbx', look: A + 'm_idle_look_around_01.fbx', talk: A + 'm_gestic_talk_neutral_01.fbx', walk: A + 'm_walk_neutral_01.fbx',
  left: A + 'm_gestic_presentation_left_01.fbx', right: A + 'm_gestic_presentation_right_01.fbx', shrug: A + 'm_gestic_shrug_01.fbx' };

const VERT = `
attribute vec3 iPos; attribute vec4 iUv; attribute vec2 iSize; attribute float iSeed;
uniform float uTime, uLevel; varying vec2 vUv; varying float vB;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iSize; mv.z += 0.014;
  gl_Position = projectionMatrix * mv;
  vUv = vec2(mix(iUv.x, iUv.z, uv.x), mix(iUv.y, iUv.w, uv.y));
  float tw = 0.6 + 0.4 * sin(uTime * (0.8 + iSeed * 2.4) + iSeed * 40.0);
  vB = tw * (1.0 + uLevel * 2.2 * step(0.45, fract(iSeed * 7.3)));
}`;
const FRAG = `
uniform sampler2D uMap; uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; varying float vB;
void main() { float a = texture2D(uMap, vUv).a; if (a < 0.02) discard; gl_FragColor = vec4(uColor * vB, a * uAlpha); }`;

export async function makeFable(W) {
  if (W.lite) N = 1400;
  const root = new THREE.Group(); root.name = 'Fable'; W.scene.add(root);
  const person = await loadPerson({ model: 'Business_Male_03', textures: false, height: 1.8, clips: CLIPS });
  // сама фигура — тёмная, светится только контур: видно, что это тело, но лица у него нет
  const rim = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(0.2, 0.42, 1.0) }, uPower: { value: 0 } },
    vertexShader: `#include <common>
      #include <skinning_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main(){
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vN = normalize(transformedNormal); vV = normalize(-mvPosition.xyz);
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPower; varying vec3 vN; varying vec3 vV;
      void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); gl_FragColor = vec4(uColor * fr * uPower, 1.0); }` });
  rim.toneMapped = false;
  // голова без лица: настоящую голову модели прячем, на её месте гладкий овал
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  for (const m of person.meshes) { m.material = [].concat(m.material).map((x) => (/head|opacity|hair/i.test(x.name) ? hidden : rim)); m.visible = false; }
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), rim); skull.scale.set(0.088, 0.135, 0.104); skull.visible = false; W.scene.add(skull);
  root.add(person.root);

  // ── точки на поверхности тела: в каждой будет слово ──
  const pts = []; const box = new THREE.Box3(); const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tris = []; let total = 0;
  for (const mesh of person.meshes) {
    const g = mesh.geometry, p = g.attributes.position, idx = g.index;
    const count = idx ? idx.count : p.count;
    for (let i = 0; i < count; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
      box.expandByPoint(a);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).length() * 0.5;
      if (area > 0) { total += area; tris.push({ mesh, v: [i0, i1, i2], acc: total, y: a.y, up: null }); }
    }
  }
  // ось роста модели в её собственных координатах: по ней слова собираются снизу вверх
  const sz = box.getSize(new THREE.Vector3()); const axis = sz.y >= sz.z ? 'y' : 'z';
  for (let i = 0; i < N; i++) {
    const r = Math.random() * total; let lo = 0, hi = tris.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid].acc < r) lo = mid + 1; else hi = mid; }
    const t = tris[lo], vi = t.v[(Math.random() * 3) | 0];
    a.fromBufferAttribute(t.mesh.geometry.attributes.position, vi);
    const h = (a[axis] - box.min[axis]) / sz[axis];
    const ang = Math.random() * Math.PI * 2, rad = 3 + Math.random() * 7;
    pts.push({ mesh: t.mesh, vi, h, delay: h * 0.55 + Math.random() * 0.15, seed: Math.random(), start: new THREE.Vector3(Math.cos(ang) * rad, -0.5 + Math.random() * 5, Math.sin(ang) * rad) });
  }

  // лист слов тела: ячейки одного размера. Сначала в них общие слова Fable; слова разговора вписываются поверх — тело складывается из того, о чём идёт речь
  const SL = { size: 1024, w: 128, h: 32 }, COLS = SL.size / SL.w, SLOTS = COLS * (SL.size / SL.h);
  const ac = document.createElement('canvas'); ac.width = ac.height = SL.size; const ax = ac.getContext('2d'); ax.textBaseline = 'middle'; ax.textAlign = 'center';
  const atlasTex = new THREE.CanvasTexture(ac); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4; atlasTex.generateMipmaps = true; atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  let atlasDirty = false, atlasT = 0;
  function writeSlot(i, w) { const x = (i % COLS) * SL.w, y = Math.floor(i / COLS) * SL.h; ax.save(); ax.beginPath(); ax.rect(x, y, SL.w, SL.h); ax.clip(); ax.clearRect(x, y, SL.w, SL.h);
    let px = 22; ax.font = `600 ${px}px ${FONT}`; const tw = ax.measureText(w).width; if (tw > SL.w - 12) { px = Math.floor(px * (SL.w - 12) / tw); ax.font = `600 ${px}px ${FONT}`; }
    ax.fillStyle = '#fff'; ax.shadowColor = '#fff'; ax.shadowBlur = px * 0.22; ax.fillText(w, x + SL.w / 2, y + SL.h / 2); ax.restore(); atlasDirty = true; }
  for (let i = 0; i < SLOTS; i++) writeSlot(i, FABLE_WORDS[i % FABLE_WORDS.length]);
  const slotUv = (i) => { const x = (i % COLS) * SL.w, y = Math.floor(i / COLS) * SL.h; return [x / SL.size, 1 - (y + SL.h) / SL.size, (x + SL.w) / SL.size, 1 - y / SL.size]; };
  const geo = new THREE.InstancedBufferGeometry(); const plane = new THREE.PlaneGeometry(1, 1);
  geo.index = plane.index; geo.setAttribute('position', plane.attributes.position); geo.setAttribute('uv', plane.attributes.uv); geo.instanceCount = N;
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); iPos.setUsage(THREE.DynamicDrawUsage);
  const iUv = new Float32Array(N * 4), iSize = new Float32Array(N * 2), iSeed = new Float32Array(N);
  pts.forEach((p, i) => {
    const r = { aspect: SL.w / SL.h }; iUv.set(slotUv((Math.random() * SLOTS) | 0), i * 4);
    const h = p.h > 0.86 ? 0.014 : Math.random() < 0.2 ? 0.03 : 0.018; // на голове слова мельче: лица нет, но форма читается
    iSize[i * 2] = h * r.aspect; iSize[i * 2 + 1] = h; iSeed[i] = p.seed;
  });
  geo.setAttribute('iPos', iPos); geo.setAttribute('iUv', new THREE.InstancedBufferAttribute(iUv, 4));
  geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(iSize, 2)); geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(iSeed, 1));
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uMap: { value: atlasTex }, uColor: { value: new THREE.Color(0.45, 0.62, 0.95) }, uTime: { value: 0 }, uLevel: { value: 0 }, uAlpha: { value: 1 } } });
  const body = new THREE.Mesh(geo, mat); body.frustumCulled = false; body.visible = false; body.renderOrder = 5; W.scene.add(body);
  // мягкое свечение вокруг фигуры: в шлеме нет настоящего ореола, его дают эти пятна
  const halos = [['Head', 0.6, 0.2], ['Spine2', 1.1, 0.17], ['Pelvis', 1.0, 0.13]].map(([bn, s, o]) => { const sp = glowSprite(0x5f8fff, s, o); sp.userData = { bone: person.bone(bn), o }; sp.visible = false; W.scene.add(sp); return sp; });

  // ── летающие слова: речь, варианты, раздумье ──
  const flying = []; const wordsRoot = new THREE.Group(); W.scene.add(wordsRoot);
  function fly(text, pos, { h = 0.07, life = 1.8, vel = null, color = '#e6eeff', glow = '#6f9bff', peak = 1, grow = 0 } = {}) {
    const m = label(text, { h, color, glow }); m.position.copy(pos); m.material.opacity = 0; wordsRoot.add(m);
    flying.push({ m, t: 0, life, vel: vel || new THREE.Vector3(0, 0.12, 0), peak, grow }); return m;
  }

  const f = {
    root, person, body, visible: false, progress: 0, _goal: 0, _rate: 0, headPos: new THREE.Vector3(0, 1.6, -2), voicePoint: new THREE.Vector3(0, 1.6, -2),
    moveTarget: null, faceGuest: true, follow: false, walking: false, gesture: null, thinking: false, fly,
    speechOrigin: null, // локация может задать, откуда выходят слова, пока тела нет
    place(L) {
      root.position.copy(L.fablePos || new THREE.Vector3(0, 0, -2)); root.rotation.y = L.fableYaw || 0; f.moveTarget = null; f.follow = !!L.fableFollow;
      f.voicePoint.copy(L.voicePoint || new THREE.Vector3(root.position.x, 1.6, root.position.z)); f.speechOrigin = L.speechOrigin || null;
      const on = !!L.fableBody; f.progress = f._goal = on ? 1 : 0; f._rate = 0; setVisible(on); W.voice.everywhere(on ? 0 : 1);
    },
    assemble(dur = 7) { f._goal = 1; f._rate = 1 / dur; body.visible = true; W.fx.sound('grow'); W.net.event('тело Fable собирается', {}); },
    dissolve(dur = 4) { f._goal = 0; f._rate = 1 / dur; },
    moveTo(t, stop = 0) { f.moveTarget = { t, stop }; },
    do(name) { const d = person.once(name); if (d) f.gesture = { name, t: 0, dur: d }; },
    update,
    // своими глазами Fable своё тело не видит
    hideSelf(on) { if (on) { f._vis = [body.visible, skull.visible, wordsRoot.visible]; body.visible = skull.visible = wordsRoot.visible = false; for (const m of person.meshes) { m.userData.v = m.visible; m.visible = false; } for (const h of halos) { h.userData.v = h.visible; h.visible = false; } }
      else if (f._vis) { [body.visible, skull.visible, wordsRoot.visible] = f._vis; f._vis = null; for (const m of person.meshes) m.visible = m.userData.v; for (const h of halos) h.visible = h.userData.v; } },
  };
  function setVisible(on) { f.visible = on; body.visible = on || f.progress > 0; for (const h of halos) h.visible = on; for (const m of person.meshes) m.visible = on; skull.visible = on; }

  W.actions.body = (on) => (on ? f.assemble(typeof on === 'number' ? on : 7) : f.dissolve());
  W.actions.gesture = (n) => { if (!person.actions[n] || !['left', 'right', 'shrug'].includes(n)) throw new Error('жесты: left, right, shrug'); f.do(n); };
  W.actions.follow = (on) => { f.follow = !!on; if (!on) f.moveTarget = null; };
  W.actions.move = (to) => { if (!f.visible) throw new Error('тела нет — сначала {"body":true}');
    if (to === 'guest') f.moveTo('guest', 1.4); else if (Array.isArray(to) && to.length === 2 && to.every(Number.isFinite)) f.moveTo(new THREE.Vector3(to[0], 0, to[1])); else if (W.loc?.points?.[to]) f.moveTo(W.loc.points[to].clone());
    else throw new Error('куда идти: "guest", [x, z] или точка локации: ' + (Object.keys(W.loc?.points || {}).join(', ') || 'на этой локации точек нет')); };

  // слова речи: варианты вспыхивают, один остаётся и уплывает
  const origin = new THREE.Vector3(), tmp = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), wp = new THREE.Vector3();
  const speechPos = () => (f.speechOrigin ? origin.copy(f.speechOrigin()) : origin.copy(f.headPos).addScaledVector(tmp.subVectors(W.head.pos, f.headPos).setY(0).normalize(), 0.25));
  let wordN = 0;
  W.on('fable:word', (e) => {
    const o = speechPos(); const side = tmp.set(W.head.dir.z, 0, -W.head.dir.x).normalize();
    const p = o.clone().addScaledVector(side, ((wordN++ % 5) - 2) * 0.14).add(new THREE.Vector3(0, 0.22 + Math.random() * 0.1, 0));
    for (const alt of e.alts.slice(0, 3)) fly(alt, p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.22, (Math.random() - 0.5) * 0.2)), { h: 0.034, life: e.lead + 0.25, peak: 0.45, color: '#9fb4e6', glow: '#4a66c0', vel: new THREE.Vector3(0, 0.03, 0) });
    setTimeout(() => { fly(e.word, p, { h: 0.042, life: 2.2, vel: new THREE.Vector3(0, 0.16, 0) }); if (W.loc?.onFableWord) W.loc.onFableWord(e, p); }, e.lead * 1000);
  });
  W.on('guest:said', () => { f.thinking = true; });
  W.on('fable:speech-soon', () => { f.thinking = false; });
  let thinkT = 0; const pool = [...FABLE_WORDS];
  // тема разговора: значимые слова гостя и самого Fable. Они вписываются в тело, кружат рядом с ним и вспыхивают, пока он думает
  const topic = [], order = Array.from({ length: SLOTS }, (_, i) => i).sort(() => Math.random() - 0.5), orbit = []; let slotN = 0, orbN = 0;
  for (let i = 0; i < 9; i++) orbit.push({ m: null, a: i * 0.7, r: 0.5 + (i % 3) * 0.16, y: 0.45 + (i * 0.37) % 1.3, sp: (i % 2 ? 1 : -1) * (0.22 + (i % 4) * 0.06), grow: 0 });
  function learn(text) { for (const w of String(text).toLowerCase().split(/[^\p{L}]+/u)) { if (w.length < 4 || STOP.has(w) || topic.includes(w)) continue; topic.push(w); if (topic.length > 60) topic.shift();
    for (let k = 0; k < 4; k++) writeSlot(order[slotN++ % SLOTS], w);
    const o = orbit[orbN++ % orbit.length]; if (o.m) { wordsRoot.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); } o.m = label(w, { h: 0.04, color: '#e8f0ff', glow: '#6f9bff' }); o.m.material.opacity = 0; o.grow = 0; wordsRoot.add(o.m); } }
  W.on('guest:said', learn); W.on('fable:speech-start', (u) => learn(u.words.map((w) => w.word).join(' ')));
  f.topic = topic;

  function update(dt) {
    // собирается или рассыпается
    if (f.progress !== f._goal) {
      f.progress = f._goal > f.progress ? Math.min(1, f.progress + f._rate * dt) : Math.max(0, f.progress - f._rate * dt);
      W.voice.everywhere(1 - f.progress);
      if (f.progress >= 1 && !f.visible) { setVisible(true); W.fx.sound('chime'); W.net.event('тело Fable собрано', {}, true); }
      if (f.progress <= 0 && f._goal === 0) setVisible(false);
      if (f.progress < 1 && f._goal === 0) f.visible = false;
    }
    // ходьба
    const sx = W.head.pos.x, sz2 = W.head.pos.z, dS = Math.hypot(sx - root.position.x, sz2 - root.position.z);
    // идёт за гостем: отстал — подходит на 1,8 м с той стороны, где стоит; гость подошёл вплотную — отступает. От поворотов головы место не зависит: иначе Fable ходил бы сквозь гостя
    if (f.follow && f.visible && !f.moveTarget && (dS > 3.4 || dS < 0.7)) { const k = (dS > 3.4 ? 1.8 : 1.3) / Math.max(dS, 0.01), ox = dS > 0.01 ? root.position.x - sx : 1, oz = dS > 0.01 ? root.position.z - sz2 : 0;
      f.moveTo(new THREE.Vector3(sx + ox * k, 0, sz2 + oz * k)); }
    f.walking = false;
    if (f.moveTarget && f.progress >= 1) {
      const t = f.moveTarget.t === 'guest' ? tmp.set(sx, 0, sz2) : tmp.copy(f.moveTarget.t);
      const dx = t.x - root.position.x, dz = t.z - root.position.z, d = Math.hypot(dx, dz);
      if (d > f.moveTarget.stop + 0.05) {
        const step = Math.min(d - f.moveTarget.stop, 1.25 * dt); root.position.x += dx / d * step; root.position.z += dz / d * step; f.walking = true;
        // сквозь гостя не ходит: ближе 0,75 м путь огибает его по кругу
        const rx = root.position.x - sx, rz = root.position.z - sz2, rd = Math.hypot(rx, rz);
        if (rd < 0.75 && Math.hypot(t.x - sx, t.z - sz2) > 0.75) { const nx = rd > 0.01 ? rx / rd : 1, nz = rd > 0.01 ? rz / rd : 0, sg = -nz * dx + nx * dz >= 0 ? 1 : -1;
          root.position.x = sx + nx * 0.75 - nz * sg * step; root.position.z = sz2 + nz * 0.75 + nx * sg * step; }
        turn(Math.atan2(dx, dz), dt, 5);
      } else { f.moveTarget = null; W.net.event('Fable дошёл', {}); }
    }
    if (W.loc?.groundY) root.position.y += (W.loc.groundY(root.position.x, root.position.z, root.position.y) - root.position.y) * Math.min(1, dt * 8);
    if (!f.walking && f.facePoint) turn(Math.atan2(f.facePoint.x - root.position.x, f.facePoint.z - root.position.z), dt, 4); // на фото смотрит в камеру
    else if (!f.walking && f.faceGuest) turn(Math.atan2(sx - root.position.x, sz2 - root.position.z), dt, 2.2);
    // движения тела
    let gw = 0; const g = f.gesture;
    if (g) { g.t += dt; gw = Math.min(1, g.t / 0.3, (g.dur - g.t) / 0.4) * 2.5; if (g.t >= g.dur) f.gesture = null; }
    const talk = W.voice.speaking ? 0.5 + W.voice.level : 0;
    const target = f.walking ? { walk: 1 } : { idle: 1, look: 0.3, talk };
    if (g && gw > 0) target[g.name] = gw;
    person.blend(target, dt, 6); person.mixer.update(dt);
    root.updateMatrixWorld(true);
    const head = person.bone('Head');
    if (f.progress > 0) { head.getWorldPosition(f.headPos); skull.position.copy(f.headPos); skull.position.y += 0.075; skull.rotation.y = root.rotation.y; f.headPos.y += 0.06; } else f.headPos.copy(f.voicePoint);
    W.voice.pa.position.copy(f.headPos); W.voice.pa.updateMatrixWorld();
    // слова на теле
    if (body.visible) {
      for (const m of person.meshes) m.skeleton.update();
      const arr = iPos.array, p = f.progress, t = W.t, cy = root.position.y;
      for (let i = 0; i < N; i++) {
        const q = pts[i]; q.mesh.getVertexPosition(q.vi, wp).applyMatrix4(q.mesh.matrixWorld);
        let k = Math.min(1, Math.max(0, (p * 1.7 - q.delay) / 1.0)); k = k * k * (3 - 2 * k);
        if (k < 1) { // спираль: слова слетаются из темноты
          const inv = 1 - k, ang = inv * 2.6, ca = Math.cos(ang), sa = Math.sin(ang);
          const ox = q.start.x * inv, oz = q.start.z * inv; wp.x += ox * ca - oz * sa; wp.z += ox * sa + oz * ca; wp.y += (q.start.y + cy - wp.y) * inv;
        }
        const s = q.seed * 50; wp.x += Math.sin(t * 1.3 + s) * 0.004; wp.y += Math.sin(t * 1.7 + s * 0.4) * 0.004; wp.z += Math.cos(t * 1.1 + s) * 0.004;
        arr[i * 3] = wp.x; arr[i * 3 + 1] = wp.y; arr[i * 3 + 2] = wp.z;
      }
      iPos.needsUpdate = true; mat.uniforms.uTime.value = t; mat.uniforms.uLevel.value = W.voice.level; mat.uniforms.uAlpha.value = 0.35 + 0.65 * Math.min(1, p * 1.5);
      const solid = Math.max(0, (p - 0.75) / 0.25); rim.uniforms.uPower.value = solid * (0.9 + W.voice.level * 0.8); for (const m of person.meshes) m.visible = solid > 0; skull.visible = solid > 0;
      for (const h of halos) { h.userData.bone.getWorldPosition(h.position); h.material.opacity = h.userData.o * (f.visible ? 1 + W.voice.level * 1.2 : 0); }
    }
    if (atlasDirty && W.t - atlasT > 1.5) { atlasDirty = false; atlasT = W.t; atlasTex.needsUpdate = true; }
    // слова темы кружат вокруг тела
    for (const o of orbit) { if (!o.m) continue; o.a += o.sp * dt; o.grow = Math.min(1, o.grow + dt * 0.8); o.m.position.set(root.position.x + Math.cos(o.a) * o.r, root.position.y + o.y + Math.sin(W.t * 0.7 + o.a) * 0.04, root.position.z + Math.sin(o.a) * o.r);
      o.m.quaternion.copy(W.camera.getWorldQuaternion(tmpQ)); o.m.material.opacity = f.visible ? 0.8 * o.grow : 0; }
    // раздумье: варианты слов вспыхивают, пока ответ не готов
    if (f.thinking) { thinkT -= dt; if (thinkT <= 0) { thinkT = 0.09; const o = speechPos(), src = topic.length >= 6 ? topic : pool; fly(src[(Math.random() * src.length) | 0], o.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.1, (Math.random() - 0.3) * 0.7, (Math.random() - 0.5) * 0.5)), { h: 0.04, life: 0.7, peak: 0.4, color: '#93a8dc', glow: '#3d58b0', vel: new THREE.Vector3(0, 0.02, 0) }); } }
    // летающие слова смотрят на гостя
    W.camera.getWorldQuaternion(tmpQ);
    for (let i = flying.length - 1; i >= 0; i--) {
      const w = flying[i]; w.t += dt; const u = w.t / w.life;
      if (u >= 1) { wordsRoot.remove(w.m); w.m.geometry.dispose(); w.m.material.dispose(); flying.splice(i, 1); continue; }
      w.m.material.opacity = w.peak * Math.min(1, u * 8) * Math.min(1, (1 - u) * 2.5); w.m.position.addScaledVector(w.vel, dt); w.m.quaternion.copy(tmpQ);
    }
  }
  function turn(yaw, dt, rate) { let d = yaw - root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); root.rotation.y += Math.sign(d) * Math.min(Math.abs(d), rate * dt); }
  return f;
}
