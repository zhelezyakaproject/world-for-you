// Чудеса острова: гость становится великаном или малышом, звездопад со звёздами, которые можно поймать рукой,
// и небо с водой, которые показывают состояние, названное Fable.
import * as THREE from 'three';
import { glowSprite } from './words.js';

const V3 = THREE.Vector3;
const SIZES = { великан: 8, малыш: 0.2, обычный: 1 };
// состояние → вода (рябь, скорость), цвет неба и света, яркость
const MOODS = {
  ровно: { rip: 0.22, sp: 0.35, tint: [1, 1, 1] },
  покой: { rip: 0.06, sp: 0.12, tint: [1.02, 1.03, 1.06] },
  тепло: { rip: 0.16, sp: 0.28, tint: [1.35, 0.95, 0.55] },
  интерес: { rip: 0.5, sp: 0.9, tint: [0.8, 1.1, 1.3] },
  восторг: { rip: 0.75, sp: 1.3, tint: [1.3, 1.05, 1.25] },
  тревога: { rip: 1.9, sp: 1.8, tint: [0.2, 0.23, 0.34] },
  грусть: { rip: 0.3, sp: 0.18, tint: [0.26, 0.36, 0.58] },
  'не знаю': { rip: 0.02, sp: 0.03, tint: [0.46, 0.46, 0.48] },
};

export function makeWonders(W, L, group, { sky, water, groundY, setSun }) {
  const X = { size: 1, mood: 'ровно', stars: false, caught: 0 };

  // ── рост ──
  let sizeGoal = 1; const baseSpeed = L.walkSpeed;
  W.actions.size = (v) => { const g = typeof v === 'number' ? v : SIZES[v]; if (!Number.isFinite(g) || g < 0.15 || g > 12) throw new Error('рост гостя: "великан", "малыш", "обычный" или число от 0.15 до 12 (во сколько раз)');
    if (g === sizeGoal) return; sizeGoal = g; W.fx.sound('grow'); W.net.event(g > 1.5 ? 'гость растёт: станет великаном' : g < 0.7 ? 'гость уменьшается' : 'гость возвращается к своему росту', { рост: '×' + g }); };
  function setSize(s) { X.size = s; W.rig.scale.setScalar(s); L.walkSpeed = baseSpeed * s ** 0.75; W.camera.far = 3000 / Math.min(1, s); W.camera.updateProjectionMatrix(); }
  // великана со стороны снимают издалека
  L.sideCam = () => { if (L._hero) return L._heroCam; if (X.size < 1.5) return null; const h = W.head.pos, r = new V3(W.head.dir.z, 0, -W.head.dir.x).normalize();
    return { pos: new V3(h.x, 0, h.z).addScaledVector(W.head.dir.clone().setY(0).normalize(), 2.3 * X.size).addScaledVector(r, 0.9 * X.size).setY(Math.max(1.5, h.y * 0.42)), look: new V3(h.x, h.y * 0.55, h.z) }; };

  // ── состояние: небо и вода ──
  const cur = { rip: 0.22, sp: 0.35, tint: new THREE.Color(1, 1, 1) }, goal = new THREE.Color(1, 1, 1);
  W.actions.mood = (name) => { if (!MOODS[name]) throw new Error('состояние: ' + Object.keys(MOODS).join(', ')); X.mood = name; W.fx.sound('whoosh'); };

  // ── звездопад ──
  const streakTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 16; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.8, 'rgba(200,220,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 6, 256, 4); return new THREE.CanvasTexture(c); })();
  const meteors = Array.from({ length: 16 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    m.visible = false; m.frustumCulled = false; group.add(m); return { m, t: 9, life: 1, p: new V3(), v: new V3(), len: 40 }; });
  const fallen = []; let meteorT = 0, dropT = 3, starsEnd = 0;
  const bx = new V3(), by = new V3(), bz = new V3(), mat4 = new THREE.Matrix4();
  function meteor() { const k = meteors.find((q) => q.t >= q.life); if (!k) return; const a = Math.random() * Math.PI * 2, r = 260 + Math.random() * 240;
    k.p.set(W.head.pos.x + Math.cos(a) * r, 120 + Math.random() * 260, W.head.pos.z + Math.sin(a) * r); const d = a + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    k.v.set(Math.cos(d), -0.35 - Math.random() * 0.5, Math.sin(d)).normalize().multiplyScalar(260 + Math.random() * 220); k.len = 90 + Math.random() * 110; k.t = 0; k.life = 0.7 + Math.random() * 0.9; k.m.visible = true; }
  function drop() { // звезда спускается к гостю и ждёт руки
    const s = new THREE.Group(); s.name = 'звезда'; const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), new THREE.MeshBasicMaterial({ color: 0xfff6d8, toneMapped: false }));
    const halo = glowSprite(0xffe2a0, 0.9, 0.55), tail = glowSprite(0xbfd6ff, 0.5, 0.3); tail.scale.set(0.25, 2.2, 1); tail.position.y = 1.1; s.add(core, halo, tail);
    const f = W.head.dir.clone().setY(0).normalize(), a = (Math.random() - 0.5) * 1.8, d = (1.1 + Math.random() * 1.6) * Math.max(1, X.size);
    const to = new V3(W.head.pos.x + (f.x * Math.cos(a) - f.z * Math.sin(a)) * d, 0, W.head.pos.z + (f.x * Math.sin(a) + f.z * Math.cos(a)) * d); to.y = groundY(to.x, to.z) + 1.25 * Math.max(1, X.size * 0.8);
    s.position.set(to.x + (Math.random() - 0.5) * 8, 45, to.z + (Math.random() - 0.5) * 8); s.scale.setScalar(Math.max(1, X.size * 0.7)); group.add(s);
    const st = { s, to, halo, tail, t: 0, state: 'fall', vel: new V3(), seed: Math.random() * 9 }; fallen.push(st);
    st.grab = W.input.addGrab(s, { name: 'звезда', r: 0.3, far: true, farDist: 4, holdDist: 0.06,
      onGrab(h) { st.state = 'held'; tail.visible = false; X.caught++; W.fx.sound('chime', 1.5); W.input.pulse(h, 0.8, 80); W.net.event('гость поймал звезду', { всего: X.caught }, X.caught === 1); },
      onRelease(h, v) { if (v.length() > 2.2) { st.state = 'fly'; st.vel.copy(v); st.t = 0; W.net.event('гость отпустил звезду в небо', {}); } else { st.state = 'hover'; st.to.copy(s.position); } } });
  }
  W.actions.stars = (on) => { X.stars = on !== false; if (X.stars) { starsEnd = W.t + 90; dropT = 2.5; setSun(-0.32); W.net.event('звездопад начался', {}); } };

  X.note = () => `${X.size !== 1 ? ` · рост гостя ×${+X.size.toFixed(1)}` : ''}${X.mood !== 'ровно' ? ` · небо и вода: «${X.mood}»` : ''}${X.stars ? ` · звездопад, поймано звёзд: ${X.caught}` : ''}`;
  X.leave = () => { sizeGoal = 1; setSize(1); X.stars = false; W.renderer.toneMappingExposure = 1; };
  X.update = (dt) => {
    if (X.size !== sizeGoal) { const s = X.size + (sizeGoal - X.size) * Math.min(1, dt * 1.5); setSize(Math.abs(s - sizeGoal) < 0.02 ? sizeGoal : s); }
    const M = MOODS[X.mood], k = Math.min(1, dt * 0.8); cur.rip += (M.rip - cur.rip) * k; cur.sp += (M.sp - cur.sp) * k; cur.tint.lerp(goal.setRGB(...M.tint), k);
    const wu = water.material.uniforms; wu.distortionScale.value = cur.rip; wu.time.value += dt * (cur.sp - 0.35); sky.tint.copy(cur.tint);
    if (X.stars && W.t > starsEnd) { X.stars = false; W.net.event('звездопад кончился', { 'поймано звёзд': X.caught }); }
    if (X.stars && sky.elevation < -0.05) { meteorT -= dt; if (meteorT <= 0) { meteorT = 0.06 + Math.random() * 0.3; meteor(); }
      dropT -= dt; if (dropT <= 0 && fallen.filter((q) => q.state === 'fall' || q.state === 'hover').length < 3) { dropT = 6 + Math.random() * 4; drop(); } }
    for (const q of meteors) { if (q.t >= q.life) { q.m.visible = false; continue; } q.t += dt; q.p.addScaledVector(q.v, dt); const u = q.t / q.life;
      bx.copy(q.v).normalize(); bz.subVectors(W.head.pos, q.p).normalize(); by.crossVectors(bz, bx).normalize(); bz.crossVectors(bx, by);
      q.m.matrixAutoUpdate = false; q.m.matrix.copy(mat4.makeBasis(bx, by, bz)).scale(bx.set(q.len, 7, 1)).setPosition(q.p); q.m.matrixWorldNeedsUpdate = true;
      q.m.material.opacity = Math.sin(Math.min(1, u) * Math.PI) * 0.95; }
    for (let i = fallen.length - 1; i >= 0; i--) { const q = fallen[i], s = q.s; q.t += dt;
      if (q.state === 'fall') { s.position.lerp(q.to, Math.min(1, dt * 0.9)); if (s.position.distanceTo(q.to) < 0.25) { q.state = 'hover'; q.tail.visible = false; W.fx.sound('chime', 1.8); } }
      else if (q.state === 'hover') { s.position.y = q.to.y + Math.sin(W.t * 1.2 + q.seed) * 0.05; if (!X.stars && q.t > 40) q.state = 'fade'; }
      else if (q.state === 'fly') { q.vel.y += dt * 6; s.position.addScaledVector(q.vel, dt); if (q.t > 5) q.state = 'fade'; }
      q.halo.material.opacity = (q.state === 'fade' ? Math.max(0, q.halo.material.opacity - dt * 0.5) : 0.45 + 0.15 * Math.sin(W.t * 5 + q.seed));
      s.rotation.y += dt;
      if (q.state === 'fade' && q.halo.material.opacity <= 0.01) { q.grab.enabled = false; group.remove(s); fallen.splice(i, 1); } }
  };
  X.fallen = fallen;
  return X;
}
