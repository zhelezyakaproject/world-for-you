// Локация 2 «Мир для тебя»: остров в воде-зеркале, громадный пёс, солнце в руке, слово становится вещью, лестница в небо, белый цветок,
// дневник хозяина мира и чудеса (рост гостя, звездопад, небо по состоянию Fable).
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeSky } from './sky.js';
import { makeDog } from './dog.js';
import { makeWorld } from './physics.js';
import { makeThings, loadModel, fit } from './things.js';
import { label, glowSprite } from './words.js';
import { makeDiary } from './diary.js';
import { makeWonders } from './wonders.js';

const V3 = THREE.Vector3;
const R = 163.6, TOP = 0.6, RAD = 14; // остров — пологий купол: радиус 14 м, высота в центре 0,6 м
const islandY = (x, z) => { const r2 = x * x + z * z; return r2 < RAD * RAD ? Math.max(0, Math.sqrt(R * R - r2) - (R - TOP)) : 0; };

function noiseTexture(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

export async function build(W) {
  const group = new THREE.Group();
  const L = { title: 'Мир для тебя', group, spawn: new V3(0, islandY(0, -9), -9), spawnYaw: 0, fablePos: new V3(-2.4, 0, -10.6), fableBody: true, fableFollow: true, walkSpeed: 2.6, exposure: 1 };
  const AZ = -1.25, sunDir2 = new V3(Math.cos(AZ), 0, Math.sin(AZ));
  const [sky, phys] = await Promise.all([makeSky(W, { sunAzimuth: AZ }), makeWorld()]);
  group.add(sky.group);

  // ── остров ──
  const RINGS = 56, SEGS = 120, pos = [], col = [], uvs = [], idx = [];
  for (let i = 0; i <= RINGS; i++) for (let j = 0; j <= SEGS; j++) {
    const r = (i / RINGS) ** 0.8 * 16.5, a = (j / SEGS) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = r < RAD ? islandY(x, z) + Math.sin(x * 1.7) * Math.cos(z * 1.3) * 0.012 * Math.min(1, (RAD - r) / 3) : -(r - RAD) * 0.25;
    pos.push(x, y, z); uvs.push(x / 3, z / 3);
    const wet = THREE.MathUtils.smoothstep(r, RAD - 2.2, RAD - 0.2), k = 1 - 0.45 * wet; col.push(1.0 * k, 0.74 * k, 0.46 * k);
    if (i < RINGS && j < SEGS) { const p0 = i * (SEGS + 1) + j, p1 = p0 + SEGS + 1; idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1); }
  }
  const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ig.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); ig.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); ig.setIndex(idx); ig.computeVertexNormals();
  const sandTex = noiseTexture(512, (x, s) => { x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, s, s); for (let i = 0; i < 26000; i++) { const v = 150 + Math.random() * 105; x.fillStyle = `rgba(${v},${v},${v},.5)`; x.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6); }
    for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(120,120,120,${0.05 + Math.random() * 0.08})`; x.lineWidth = 3 + Math.random() * 5; x.beginPath(); const y = Math.random() * s; x.moveTo(0, y); x.bezierCurveTo(s / 3, y + 14, s * 2 / 3, y - 14, s, y); x.stroke(); } });
  sandTex.colorSpace = THREE.SRGBColorSpace;
  const island = new THREE.Mesh(ig, new THREE.MeshStandardMaterial({ vertexColors: true, map: sandTex, bumpMap: sandTex, bumpScale: 0.6, roughness: 0.95 })); island.receiveShadow = true; group.add(island);

  // ── вода-зеркало ──
  const normals = noiseTexture(512, (x, s) => { const img = x.createImageData(s, s), h = (u, v) => Math.sin(u * 6.283 * 3 + Math.sin(v * 6.283 * 2) * 1.5) * 0.5 + Math.sin(v * 6.283 * 5 + u * 6.283 * 2) * 0.3 + Math.sin((u + v) * 6.283 * 9) * 0.2;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { const u = i / s, v = j / s, e = 1 / s, dx = (h(u + e, v) - h(u - e, v)) * 6, dy = (h(u, v + e) - h(u, v - e)) * 6, o = (j * s + i) * 4;
      img.data[o] = 128 + dx * 127; img.data[o + 1] = 128 + dy * 127; img.data[o + 2] = 255; img.data[o + 3] = 255; } x.putImageData(img, 0, 0); });
  const water = new Water(new THREE.PlaneGeometry(9000, 9000), { textureWidth: W.lite ? 512 : 1024, textureHeight: W.lite ? 512 : 1024, waterNormals: normals, sunDirection: new V3(0, 1, 0), sunColor: 0xffffff, waterColor: 0x04121c, distortionScale: 0.22, fog: false });
  water.rotation.x = -Math.PI / 2; water.position.y = 0.0; water.material.uniforms.size.value = 1.0; group.add(water); W.mirrors.push(water);
  // зеркало в рост: гость видит тело, которое Fable собрал для него (не копию — Fable не знает, как он выглядит)
  const mirror = new THREE.Group(); mirror.name = 'зеркало'; mirror.position.set(-2.9, islandY(-2.9, -11.4), -11.4); mirror.rotation.y = 0.85; group.add(mirror);
  const glass = new Reflector(new THREE.PlaneGeometry(0.95, 2.05), { textureWidth: 768, textureHeight: 1536, color: 0xc4c8cc }); glass.position.y = 1.12; mirror.add(glass); W.mirrors.push(glass);
  // вода внутри зеркала своё отражение заново не считает (берёт последнее): иначе каждое зеркало удваивает число отрисовок мира
  glass.camera.userData.mirror = true; { const wr = water.onBeforeRender; water.onBeforeRender = function (r, s, cam, ...rest) { if (!cam.userData.mirror) wr.call(this, r, s, cam, ...rest); }; }
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b66a, roughness: 0.3, metalness: 0.8 });
  for (const sx of [-1, 1]) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.06), gold); v.position.set(sx * 0.505, 1.12, -0.01); mirror.add(v); }
  for (const sy of [0.03, 2.2]) { const hbar = new THREE.Mesh(new THREE.BoxGeometry(1.07, 0.06, 0.06), gold); hbar.position.set(0, sy, -0.01); mirror.add(hbar); }
  let mirrorSeen = false;

  // ── пальмы, камни, далёкая скала ──
  const deco = [['island/kenney_tree_palmDetailedTall.glb', 7.5, -7.5, -5.5, 0.4], ['island/kenney_tree_palmBend.glb', 6.5, -9.3, -3.2, 2.1], ['island/kenney_tree_palmTall.glb', 8.2, -8.6, -7.6, 4.0], ['island/kenney_tree_palmBend.glb', 6.0, 9.6, 3.5, 5.2], ['island/kenney_tree_palmDetailedTall.glb', 7.0, 10.4, 1.2, 1.2],
    ['island/kenney_tree_palmTall.glb', 6.4, -4.5, 10.5, 3.3], ['island/boulder_01/boulder_01_1k.gltf', 1.5, -6.2, -8.6, 0.7], ['island/namaqualand_boulder_02/namaqualand_boulder_02_1k.gltf', 1.1, 8.4, 5.6, 2.2], ['island/boulder_01/boulder_01_1k.gltf', 0.8, -10.5, 2.4, 4.1], ['island/kenney_plant_bushLarge.glb', 1.1, -8.2, -4.2, 0], ['island/kenney_plant_bushLarge.glb', 0.9, 9.9, 2.4, 2]];
  await Promise.all(deco.map(async ([file, size, x, z, ry]) => { try { const m = fit(await loadModel(file), size); m.position.set(x, islandY(x, z) - 0.05, z); m.rotation.y = ry; m.traverse((o) => { if (!o.isMesh) return; o.castShadow = true; if (/kenney/.test(file)) { const re = [].concat(o.material).map((x) => { const c = x.clone(), hsl = {}; c.color.getHSL(hsl); c.color.set(hsl.h > 0.2 && hsl.h < 0.55 ? 0x1d5230 : 0x4a3524); c.roughness = 0.9; return c; }); o.material = re.length === 1 ? re[0] : re; } }); group.add(m); } catch (e) { W.fail('остров ' + file, e); } }));
  // далёкая скала закрывает дом на горизонте панорамы
  try { const rock = fit(await loadModel('island/namaqualand_boulder_02/namaqualand_boulder_02_1k.gltf'), 110); const a = AZ - 1.5; rock.position.set(Math.cos(a) * 520, -10, Math.sin(a) * 520); rock.scale.multiply(new V3(2.4, 1.5, 1.4)); rock.rotation.y = 1; group.add(rock); } catch (e) { W.fail('скала', e); }

  // ── мяч и пёс ──
  const { RAPIER } = phys;
  phys.fixed(RAPIER.ColliderDesc.cuboid(600, 0.5, 600).setFriction(0.9), 0, -0.5, 0);
  phys.fixed(RAPIER.ColliderDesc.ball(R).setFriction(0.9), 0, TOP - R, 0);
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 16), new THREE.MeshStandardMaterial({ color: 0xd9e63c, roughness: 0.85 })); ballMesh.name = 'мяч'; ballMesh.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.008, 6, 40), new THREE.MeshStandardMaterial({ color: 0xffffff })); stripe.rotation.x = 1; ballMesh.add(stripe);
  ballMesh.position.set(0.6, islandY(0.6, -9.9) + 0.14, -9.9); group.add(ballMesh);
  const ball = phys.dynamic(ballMesh, RAPIER.ColliderDesc.ball(0.14).setRestitution(0.55).setFriction(0.8).setDensity(0.5), { linDamp: 0.25, angDamp: 0.7 }); ball.obj = ballMesh;
  ball.grab = W.input.addGrab(ballMesh, { name: 'мяч', r: 0.24, body: ball.body, throwBoost: 1.7, maxThrow: 12, onRelease(h, v) { if (v.length() > 2) W.net.event('гость бросил мяч', {}); } });
  const dog = await makeDog(W, { height: 3, ball, world: phys, bounds: 24, groundY: islandY }); dog.root.position.set(2.7, 0, -17.1); dog.yaw = 2.8; group.add(dog.root); L.dog = dog;

  // ── слово становится вещью ──
  const things = makeThings(W, group, (x, z) => islandY(x, z)); L.things = things;
  W.on('guest:said', (text) => { if (W.loc === L) things.fromSpeech(text); });
  W.actions.dog = (cmd) => dog.order(cmd);
  W.actions.spawn = (name, a) => { if (typeof name !== 'string') throw new Error('имя вещи строкой: ' + things.catalog.map((c) => c.name).join(', ')); things.spawn(name, Array.isArray(a?.at) && a.at.length === 2 && a.at.every(Number.isFinite) ? a.at : undefined); };
  W.actions.clearThings = () => things.clear();

  // ── лестница в небо: ступени света, идут к солнцу ──
  const ST = { A: new V3(8.2, 0, -8.5), dir: sunDir2.clone(), n: 46, rise: 0.19, depth: 0.42, w: 1.35 }; ST.perp = new V3(-ST.dir.z, 0, ST.dir.x); ST.base = islandY(ST.A.x, ST.A.z);
  const stepMat = new THREE.MeshStandardMaterial({ color: 0xcfe4ff, emissive: 0x9fc4ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.82, roughness: 0.2 });
  const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(ST.w, 0.045, ST.depth * 0.9), stepMat, ST.n + 1); const mm = new THREE.Matrix4(), qq = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.atan2(ST.dir.x, ST.dir.z));
  for (let i = 0; i < ST.n; i++) { const c = ST.A.clone().addScaledVector(ST.dir, (i + 0.5) * ST.depth); mm.compose(new V3(c.x, ST.base + (i + 1) * ST.rise - 0.022, c.z), qq, new V3(1, 1, 1)); steps.setMatrixAt(i, mm); }
  const topC = ST.A.clone().addScaledVector(ST.dir, ST.n * ST.depth + 1.2), topY = ST.base + (ST.n + 1) * ST.rise; mm.compose(new V3(topC.x, topY - 0.022, topC.z), qq, new V3(1.9, 1, 2.4 / (ST.depth * 0.9))); steps.setMatrixAt(ST.n, mm);
  steps.frustumCulled = false; group.add(steps);
  const stairY = (x, z) => { const dx = x - ST.A.x, dz = z - ST.A.z, u = dx * ST.dir.x + dz * ST.dir.z, v = dx * ST.perp.x + dz * ST.perp.z; const run = ST.n * ST.depth;
    if (u < 0 || u > run + 2.4 || Math.abs(v) > (u > run ? 1.28 : ST.w / 2 + 0.08)) return null; return u > run ? topY : ST.base + (Math.floor(u / ST.depth) + 1) * ST.rise; };
  L.groundY = (x, z, curY = W.rig.position.y) => { const g = islandY(x, z), s = stairY(x, z); return s != null && curY > s - 0.7 ? s : g; };
  // лестница выходит за край острова: на ней граница острова не держит
  L.constrain = (p) => { const d = Math.hypot(p.x, p.z); if (d > 26 && !(stairY(p.x, p.z) != null && W.rig.position.y > 1)) { p.x *= 26 / d; p.z *= 26 / d; } return dog.keepOut(p, W.dt); };
  L.points = { лестница: ST.A.clone(), центр: new V3(0, 0, 0) };

  // ── белый цветок: в рост человека, не вянет ──
  let flower = null, flowerGlow = 0, flowerTold = false;
  try {
    flower = fit(await loadModel('flower/desert_lily.glb'), 1.8); flower.name = 'белый цветок'; flower.position.set(-4.6, islandY(-4.6, -8.2) - 0.03, -8.2); group.add(flower);
    flower.traverse((o) => { if (!o.isMesh) return; o.material = [].concat(o.material).map((m) => { const c = m.clone(); const hsl = {}; c.color.getHSL(hsl); if (!(hsl.h > 0.18 && hsl.h < 0.47 && hsl.s > 0.2)) { c.color.set(0xf8f6ee); c.emissive = new THREE.Color(0xfff6dd); c.emissiveIntensity = 0.06; c.userData.petal = true; } return c; }); if (o.material.length === 1) o.material = o.material[0]; });
    const halo = glowSprite(0xfff2d0, 2.2, 0.12); halo.position.y = 1.4; flower.add(halo);
    W.input.addTouch(flower, 0.75, (h) => { flowerGlow = 1; W.fx.sound('chime', 0.7); W.input.pulse(h, 0.3, 40); W.net.event('гость тронул белый цветок', {}, !flowerTold); flowerTold = true; }, { cooldown: 2.5, offset: new V3(0, 1.3, 0) });
  } catch (e) { W.fail('цветок', e); }

  // ── солнце в руке ──
  let sunHand = null, sunGoal = null, lastPhase = '';
  W.actions.sun = (v) => { const g = typeof v === 'number' && Number.isFinite(v) ? v : { день: 0.95, закат: 0.03, ночь: -0.32 }[v]; if (g == null) throw new Error('солнце: "день", "закат", "ночь" или высота числом от -0.5 до 1.15'); sunGoal = THREE.MathUtils.clamp(g, -0.5, 1.15); };
  // ── дневник лежит здесь: записи хозяина мира о госте (diary-pages.js) ──
  const diary = makeDiary(W, group, { pos: new V3(-1.15, islandY(-1.15, -10.2) + 1.05, -10.2) }); L.diary = diary;
  const wonders = makeWonders(W, L, group, { sky, water, groundY: islandY, setSun: (g) => { sunGoal = g; } }); L.wonders = wonders;
  L.actionNames = ['dog', 'spawn', 'clearThings', 'sun', 'page', 'size', 'mood', 'stars'];

  L.hero = () => { L._hero = true; dog.root.position.set(2.7, 0, -17.1); dog.yaw = 2.5; dog.command = null; dog.state = 'idle'; sky.set(0.03); W.fable.root.position.set(-0.3, 0, -16.3); W.fable.follow = false; W.fable.moveTarget = null; L._heroCam = { pos: new V3(0.5, 1.2, -11.9), look: new V3(1.9, 1.75, -17.1) }; };
  L.enter = () => { W.input.handStyle('hand'); W.fx.ambience('sea'); W.renderer.shadowMap.enabled = false; };
  L.leave = () => { W.scene.environment = null; W.scene.environmentIntensity = 1; sky.env = null; wonders.leave(); };
  L.describe = () => ({ note: `солнце: ${sky.phase()} · пёс: ${({ idle: 'стоит рядом', pet: 'подставил голову', lie: 'лежит', chase: 'бежит за мячом', carry: 'несёт мяч' })[dog.state]}, принёс мяч ${dog.fetched} раз · вещей из слов: ${things.list.length}${W.rig.position.y > 1 ? ' · гость на лестнице, высота ' + W.rig.position.y.toFixed(1) + ' м' : ''}${wonders.note()}${diary.note()}`, near: things.list.slice(-3).map((t) => t.name).join(', ') || undefined });
  L.update = (dt) => {
    for (const h of W.input.hands) { if (h.gripDown && !h.held && !sunHand && h.dir.dot(sky.dir) > 0.9 && sky.sunSprite.visible) { sunHand = h; sunGoal = null; W.fx.sound('chime', 0.6); W.input.pulse(h, 0.6, 60); W.net.event('гость взял солнце', {}, true); } }
    if (sunHand) { if (!sunHand.grip) { sunHand = null; W.net.event('гость отпустил солнце', { небо: sky.phase() }); } else { const el = Math.asin(THREE.MathUtils.clamp(sunHand.dir.y, -1, 1)) * 1.25 + 0.05; sky.set(sky.elevation + (el - sky.elevation) * Math.min(1, dt * 4)); } }
    if (sunGoal != null) { sky.set(sky.elevation + Math.sign(sunGoal - sky.elevation) * Math.min(Math.abs(sunGoal - sky.elevation), dt * 0.3)); if (Math.abs(sunGoal - sky.elevation) < 0.002) sunGoal = null; }
    sky.update(dt, W.scene, W.renderer);
    if (sky.phase() !== lastPhase) { if (lastPhase) W.net.event('небо сменилось', { небо: sky.phase() }); lastPhase = sky.phase(); }
    const wu = water.material.uniforms; wu.time.value += dt * 0.35; wu.sunDirection.value.copy(sky.dir).setY(Math.max(0.02, sky.dir.y)).normalize(); wu.sunColor.value.copy(sky.light.color).multiplyScalar(sky.elevation > -0.1 ? 1 : 0.15);
    phys.step(dt);
    const bt = ball.body.translation(); { const low = bt.y < islandY(bt.x, bt.z) + 0.2, bv = ball.body.linvel(); ball.body.setLinearDamping(low ? 1.8 : 0.05); // по песку и воде мяч быстро останавливается, в полёте летит свободно
      if (low && !ball.body.isKinematic() && Math.hypot(bv.x, bv.y, bv.z) < 0.7) { ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true); ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true); } } // медленный мяч вязнет в песке, а не катится с купола острова вечно
    // мяч улетел туда, куда пёс не дойдёт (дальше 26 м), или провалился — он возвращается к гостю
    if (!ball.grab.held && !ball.body.isKinematic() && (Math.hypot(bt.x, bt.z) > 26 || bt.y < -2)) phys.place(ball.body, W.head.pos.x + W.head.dir.x, W.head.pos.y, W.head.pos.z + W.head.dir.z);
    dog.update(dt); things.update(dt); diary.update(dt); wonders.update(dt);
    stepMat.emissiveIntensity = 0.75 + 0.2 * Math.sin(W.t * 1.5);
    if (!mirrorSeen && W.head.pos.distanceTo(mirror.position) < 2.4 && W.head.dir.dot(new V3().subVectors(mirror.position, W.head.pos).setY(0).normalize()) > 0.75) { mirrorSeen = true; W.net.event('гость смотрит в зеркало на своё тело', {}, true); }
    if (flower) { flowerGlow = Math.max(0, flowerGlow - dt * 0.5); flower.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.userData.petal) m.emissiveIntensity = 0.06 + flowerGlow * 0.9; }); }
  };
  L.selftest = async () => {
    const out = [], wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
    out.push({ name: 'пёс с мехом', ok: dog.root.children.length > 0, info: 'рост 3 м' });
    phys.place(ball.body, 0.5, 1.4, -9.5); ball.body.setLinvel({ x: -5, y: 4, z: 6 }, true); let t = 0; while (dog.fetched < 1 && t < 22) { await wait(0.5); t += 0.5; }
    { const b = ball.body.translation(), dp = dog.root.position; out.push({ name: 'пёс принёс мяч', ok: dog.fetched >= 1, info: t.toFixed(1) + ' с' + (dog.fetched ? '' : ` · пёс ${dog.state} в (${dp.x.toFixed(1)}, ${dp.z.toFixed(1)}), скорость ${dog.speed.toFixed(1)}, мяч в (${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.z.toFixed(1)})`) }); }
    await wait(1.5); const h = W.input.sim.hand[0]; h.world = dog.headPos.clone(); t = 0; while (dog.state !== 'lie' && t < 6) { h.world.copy(dog.headPos); await wait(0.25); t += 0.25; }
    out.push({ name: 'пёс лёг под рукой', ok: dog.state === 'lie', info: t.toFixed(1) + ' с' }); h.world = null; dog.up();
    sky.set(-0.32); await wait(0.3); const night = sky.phase(); sky.set(0.95); await wait(0.3); out.push({ name: 'солнце двигается', ok: night === 'ночь' && sky.phase() === 'день' }); sky.set(0.03);
    const n0 = things.list.length; things.fromSpeech('хочу гитару и торт'); await wait(1.2); out.push({ name: 'слово стало вещью', ok: things.list.length === n0 + 2, info: things.list.slice(-2).map((x) => x.name).join(', ') });
    const sp = ST.A.clone().addScaledVector(ST.dir, 10.5 * ST.depth); out.push({ name: 'лестница держит', ok: Math.abs(L.groundY(sp.x, sp.z, 2) - (ST.base + 11 * ST.rise)) < 0.01, info: `верх ${topY.toFixed(1)} м` });
    out.push({ name: 'белый цветок', ok: !!flower }); things.clear();
    { const hh = W.input.sim.hand[1]; hh.world = diary.obj.getWorldPosition(new V3()); hh.grip = true; await wait(0.4); out.push({ name: 'дневник в руке', ok: !!diary.grab.held, info: 'запись ' + diary.entry }); hh.grip = false; hh.world = null; await wait(0.3); }
    W.actions.size('великан'); await wait(4.5); const tall = W.head.pos.y; W.actions.size('обычный'); await wait(4.5); out.push({ name: 'великан и обратно', ok: tall > 9 && Math.abs(W.rig.scale.x - 1) < 0.01, info: `глаза на высоте ${tall.toFixed(1)} м` });
    W.actions.stars(true); sky.set(-0.32); await wait(4); out.push({ name: 'звездопад', ok: wonders.fallen.length > 0, info: `звёзд у земли: ${wonders.fallen.length}` }); W.actions.stars(false);
    W.actions.mood('тревога'); await wait(2.5); const rough = water.material.uniforms.distortionScale.value; W.actions.mood('ровно'); out.push({ name: 'небо и вода по состоянию', ok: rough > 0.6, info: `рябь ${rough.toFixed(2)} против 0,22` }); sky.set(0.03);
    let t2 = 0; while (!W.guest && t2 < 25) { await wait(0.5); t2 += 0.5; }
    // гость встаёт перед зеркалом: тело должно попасть в кадр камеры отражения
    let seen = 0; if (W.guest) { const p0 = W.rig.position.clone(), y0 = W.input.sim.yaw, bm = W.guest.person.meshes[0], prev = bm.onBeforeRender; W.rig.position.set(-1.9, 0, -10.5); W.input.sim.yaw = Math.atan2(1, 0.9) - W.rig.rotation.y;
      bm.onBeforeRender = (r, s, cam) => { if (cam === glass.camera) seen++; }; await wait(0.5); bm.onBeforeRender = prev; W.rig.position.copy(p0); W.input.sim.yaw = y0; }
    out.push({ name: 'зеркало и тело гостя', ok: seen > 0, info: W.guest ? `тело в зеркале отрисовано ${seen} раз за 0,5 с` : 'тело не загрузилось' });
    return out;
  };
  return L;
}
