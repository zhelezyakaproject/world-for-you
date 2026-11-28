// Локация 3 «Общая территория»: гостиная — комната гостя, как хозяин мира её запомнил (расстановка ниже, в put(...)), — превращается в игровой зал 2000-х.
// Одной стены в зале нет — за ней тёмный мир Fable. Игры: боулинг и баскетбольный автомат. Пылесос стоит на базе в углу.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { loadModel, fit } from './things.js';
import { makeBowling } from './bowling.js';
import { makeHoops } from './hoops.js';
import { makeDog } from './dog.js';
import { label, glowSprite } from './words.js';
import { SPEC_LAYER } from './spectator.js';

const V3 = THREE.Vector3;
const canvasTex = (w, h, draw, rx = 1, ry = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; };

// «Память с высоты 10 см»: чем выше от пола, тем меньше Fable уверен — предметы там редеют и синеют.
const MEM = { uMem: { value: 1 } };
function remember(obj) {
  obj.traverse((o) => { if (!o.isMesh || o.isReflector) return; const one = (m0) => { const m = m0.clone();
    m.onBeforeCompile = (sh) => { sh.uniforms.uMem = MEM.uMem;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vMemY;').replace('#include <project_vertex>', '#include <project_vertex>\nvMemY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMemY; uniform float uMem;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float mk = smoothstep(0.75, 2.5, vMemY) * uMem * 0.88;
          if (mk > 0.0) { float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (dn < mk) discard; gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5, 0.7, 1.0), mk * 0.5); }`); };
    m.customProgramCacheKey = () => 'mem'; return m; };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
  return obj;
}

export async function build(W) {
  const group = new THREE.Group(), home = new THREE.Group(), arcade = new THREE.Group(); group.add(home, arcade); arcade.visible = false;
  const L = { title: 'Общая территория', group, spawn: new V3(0, 0, 1.4), spawnYaw: 0, fablePos: new V3(1.4, 0, 0.3), fableBody: true, walkSpeed: 2.0, exposure: 1, mode: 'home', objects: {} };
  const envDay = await new Promise((ok, no) => new RGBELoader().load('/media/sky/simons_town_rocks_2k.hdr', (t) => { t.mapping = THREE.EquirectangularReflectionMapping; ok(t); }, undefined, no));
  const put = async (parent, name, file, size, x, z, ry = 0, opt = {}) => { try { const m = fit(await loadModel(file), size, opt); m.position.set(x, opt.y || 0, z); m.rotation.y = ry; m.name = name; parent.add(m); if (name) L.objects[name] = m; return m; } catch (e) { W.fail('модель ' + file, e); return new THREE.Group(); } };
  const box = (parent, w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };

  // ═══ ГОСТИНАЯ ═══ 7 × 9 м, двери на террасу в стене минус z
  const HW = 3.5, HD = 4.5, HH = 2.8;
  const tile = canvasTex(512, 512, (x) => { x.fillStyle = '#f7f7f5'; x.fillRect(0, 0, 512, 512); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.012})`; x.fillRect(Math.random() * 512, Math.random() * 512, 30, 30); } x.strokeStyle = '#c9c9c4'; x.lineWidth = 3; x.strokeRect(0, 0, 512, 512); }, 2 * HW / 0.6, 2 * HD / 0.6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW, 2 * HD), new THREE.MeshStandardMaterial({ map: tile, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.6 })); floor.rotation.x = -Math.PI / 2; home.add(floor);
  const wallM = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.92 });
  const walls = new THREE.Group(); home.add(walls);
  box(walls, 0.12, HH, 2 * HD, -HW - 0.06, HH / 2, 0, wallM); box(walls, 0.12, HH, 2 * HD, HW + 0.06, HH / 2, 0, wallM); box(walls, 2 * HW, HH, 0.12, 0, HH / 2, HD + 0.06, wallM);
  box(walls, 1.0, HH, 0.12, -3.0, HH / 2, -HD - 0.06, wallM); box(walls, 1.0, HH, 0.12, 3.0, HH / 2, -HD - 0.06, wallM); box(walls, 5.0, HH - 2.35, 0.12, 0, 2.35 + (HH - 2.35) / 2, -HD - 0.06, wallM);
  box(walls, 2 * HW, 0.1, 2 * HD, 0, HH + 0.05, 0, wallM);
  // раздвижные стеклянные двери на террасу: три створки, одна приоткрыта
  const frameM = new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.4, metalness: 0.6 }), glassM = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.13, roughness: 0.03, metalness: 0.1, envMapIntensity: 2 });
  const doors = new THREE.Group(); doors.name = 'двери'; home.add(doors); L.objects['двери'] = doors;
  [[-1.67, 0], [0, 0.04], [0.9, 0.08]].forEach(([dx, dz]) => { const d = new THREE.Group(); d.position.set(dx, 0, -HD + dz); doors.add(d);
    box(d, 1.6, 2.26, 0.012, 0, 1.17, 0, glassM); for (const s of [-1, 1]) box(d, 0.05, 2.3, 0.045, s * 0.8, 1.17, 0, frameM); box(d, 1.65, 0.05, 0.045, 0, 2.32, 0, frameM); box(d, 1.65, 0.05, 0.045, 0, 0.04, 0, frameM); });
  box(home, 5.0, 0.15, 0.3, 0, 0.075, -HD - 0.2, new THREE.MeshStandardMaterial({ color: 0xe9e7e0, roughness: 0.8 })).name = 'порог';
  const terrace = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.7 })); terrace.rotation.x = -Math.PI / 2; terrace.position.set(0, -0.15, -HD - 2.3); home.add(terrace);
  const skyTex = await new Promise((ok) => new THREE.TextureLoader().load('/media/sky/simons_town_rocks_4k.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; ok(t); }));
  const outside = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, toneMapped: false, fog: false })); outside.rotation.y = 2.2; outside.position.y = 6; home.add(outside);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2); sun.position.set(1.5, 4, -9); home.add(sun, new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 0.55));

  const furniture = new THREE.Group(); home.add(furniture);
  await Promise.all([
    put(furniture, 'диван', 'living/sofa_02/sofa_02_1k.gltf', 1.9, -0.5, 3.75, Math.PI),
    put(furniture, 'стол', 'living/round_wooden_table_01/round_wooden_table_01_1k.gltf', 1.4, 1.6, -1.5),
    put(furniture, 'стул 1', 'living/dining_chair_02/dining_chair_02_1k.gltf', 0.95, 1.6, -0.55, Math.PI, { by: 'height' }),
    put(furniture, 'стул 2', 'living/dining_chair_02/dining_chair_02_1k.gltf', 0.95, 0.65, -1.5, -Math.PI / 2, { by: 'height' }),
    put(furniture, 'стул 3', 'living/dining_chair_02/dining_chair_02_1k.gltf', 0.95, 1.6, -2.45, 0, { by: 'height' }),
    put(furniture, 'лежанка', 'living/dog_bed.glb', 1.0, -2.6, -3.5, 0.5),
    put(furniture, 'ваза', 'living/ceramic_vase_01/ceramic_vase_01_1k.gltf', 0.8, -3.1, 3.4, 0, { by: 'height' }),
    put(furniture, 'весы', 'living/bathroom_scale.glb', 0.32, -3.0, 1.75, 0.2),
    ...[0, 1, 2, 3].map((i) => put(furniture, i ? '' : 'кухня', i % 2 ? 'living/kenney_kitchenCabinetDrawer.glb' : 'living/kenney_kitchenCabinet.glb', 0.9, HW - 0.42, -0.6 + i * 0.86, -Math.PI / 2, { by: 'height' })),
    ...[0, 1, 2].map((i) => put(furniture, '', 'living/kenney_kitchenCabinetUpper.glb', 0.7, HW - 0.3, -0.2 + i * 0.86, -Math.PI / 2, { by: 'height', y: 1.5 })),
  ]);
  furniture.traverse((o) => { if (o.isMesh && /wood|Wood|metal/.test([].concat(o.material)[0].name) && o.parent && /kitchen/i.test(o.name + (o.parent.name || ''))) { /* перекраска ниже */ } });
  // чёрные шкафы кухни
  for (const c of furniture.children) { if (c.position.x > HW - 0.6) c.traverse((o) => { if (o.isMesh) o.material = [].concat(o.material).map((m) => { const k = m.clone(); k.color.set(/metal/i.test(m.name) ? 0x8a8d92 : 0x121214); k.roughness = 0.45; return k; })[0]; }); }
  // пёс дома: обычного роста, спит на лежанке
  try { const pet = await makeDog(W, { height: 0.62, ball: null }); pet.root.position.set(-2.6, 0.08, -3.5); pet.yaw = 2.2; pet.state = 'lie'; pet.sleepy = true; pet.act.Death.time = 1; furniture.add(pet.root); L.pet = pet; L.objects['пёс'] = pet.root; } catch (e) { W.fail('пёс дома', e); }
  // зеркало в бамбуковой рамке
  const mirror = new THREE.Group(); mirror.name = 'зеркало'; mirror.position.set(-HW + 0.04, 1.15, -0.9); mirror.rotation.y = Math.PI / 2; furniture.add(mirror); L.objects['зеркало'] = mirror;
  const refl = new Reflector(new THREE.PlaneGeometry(0.56, 1.5), { textureWidth: 512, textureHeight: 1024, color: 0xb8bcc0 }); mirror.add(refl); W.mirrors.push(refl);
  const bamboo = new THREE.MeshStandardMaterial({ color: 0xc8a25e, roughness: 0.6 });
  for (const s of [-1, 1]) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.62, 10), bamboo); v.position.set(s * 0.3, 0, 0.01); mirror.add(v); const h = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.7, 10), bamboo); h.rotation.z = Math.PI / 2; h.position.set(0, s * 0.77, 0.01); mirror.add(h); }
  // пылесос на базе у белой стены (в гостиной) — и он же потом в углу зала
  const vac = new THREE.Group(); vac.name = 'пылесос';
  vac.add(fit(await loadModel('living/roomba.glb').catch(() => new THREE.Group()), 0.35));
  const dock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.16), new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4 })); dock.position.set(0, 0.06, -0.2); vac.add(dock);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4dff88, toneMapped: false })); led.position.set(0, 0.1, -0.12); vac.add(led);
  vac.position.set(-HW + 0.3, 0, 2.55); vac.rotation.y = -Math.PI / 2; home.add(vac); L.objects['пылесос'] = vac;
  W.input.addTouch(vac, 0.3, () => { W.fx.sound('chime', 0.5); W.net.event('гость тронул пылесос', {}, true); }, { cooldown: 20 });
  remember(furniture); remember(walls);
  W.actions.recall = (k) => { if (!Number.isFinite(Number(k))) throw new Error('число от 0 до 1'); L._memGoal = 1 - THREE.MathUtils.clamp(Number(k), 0, 1); };
  L.actionNames = ['recall', 'room', 'bowling', 'bowl', 'hoops', 'hoopSkill', 'play', 'wake'];
  // правка комнаты со слов гостя: {room:{obj:'стол', dx:-1, dz:0.5, ry:1.57, s:1.2, hide:true}}
  W.actions.room = (m) => { if (typeof m === 'string') { if (m !== 'arcade' && m !== 'home') throw new Error('комната: "arcade" или "home"'); return setMode(m); }
    const o = L.objects[m?.obj]; if (!o) throw new Error('нет такого предмета. Есть: ' + Object.keys(L.objects).join(', '));
    for (const k of ['x', 'z', 'dx', 'dy', 'dz', 'ry', 's']) if (m[k] != null && !Number.isFinite(m[k])) throw new Error(`${k} должно быть числом`);
    L._moves = (L._moves || []).filter((q) => q.o !== o); L._moves.push({ o, to: new V3(m.x ?? o.position.x + (m.dx || 0), o.position.y + (m.dy || 0), m.z ?? o.position.z + (m.dz || 0)), ry: m.ry != null ? m.ry : o.rotation.y, s: m.s }); if (m.hide != null) o.visible = !m.hide; W.fx.sound('whoosh'); };

  // ═══ ИГРОВОЙ ЗАЛ ═══ 13 × 21,5 м; стены минус x нет
  const AX = 6.5, AZ0 = -15, AZ1 = 6.5, AH = 4.2;
  const carpet = canvasTex(512, 512, (x) => { x.fillStyle = '#12092a'; x.fillRect(0, 0, 512, 512); const cols = ['#ff3ea5', '#2ee6ff', '#fff36b', '#8a5cff', '#3dffb0'];
    for (let i = 0; i < 46; i++) { x.strokeStyle = x.fillStyle = cols[i % 5]; x.lineWidth = 5; const px = Math.random() * 512, py = Math.random() * 512, k = i % 4; x.save(); x.translate(px, py); x.rotate(Math.random() * 6.28);
      if (k === 0) { x.beginPath(); x.moveTo(-18, 12); x.lineTo(0, -18); x.lineTo(18, 12); x.closePath(); x.stroke(); } else if (k === 1) { x.beginPath(); for (let s = 0; s < 5; s++) x.lineTo(s * 12 - 24, s % 2 ? -8 : 8); x.stroke(); } else if (k === 2) { x.beginPath(); x.arc(0, 0, 9, 0, 6.28); x.fill(); } else { x.fillRect(-14, -3, 28, 6); } x.restore(); } }, 13 / 2.2, 21.5 / 2.2);
  const afloor = new THREE.Mesh(new THREE.PlaneGeometry(2 * AX, AZ1 - AZ0), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 })); afloor.rotation.x = -Math.PI / 2; afloor.position.set(0, 0, (AZ0 + AZ1) / 2); arcade.add(afloor);
  const darkWall = new THREE.MeshStandardMaterial({ color: 0x170d2c, roughness: 0.9 });
  box(arcade, 0.2, AH, AZ1 - AZ0, AX + 0.1, AH / 2, (AZ0 + AZ1) / 2, darkWall); box(arcade, 2 * AX, AH, 0.2, 0, AH / 2, AZ1 + 0.1, darkWall); box(arcade, 2 * AX, AH, 0.2, 0, AH / 2, AZ0 - 0.1, darkWall);
  const ceilTex = canvasTex(256, 256, (x) => { x.fillStyle = '#07050f'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 26; i++) { x.fillStyle = ['#ff3ea5', '#2ee6ff', '#ffffff'][i % 3]; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 1.6, 0, 6.28); x.fill(); } }, 6, 10);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * AX, AZ1 - AZ0), new THREE.MeshBasicMaterial({ map: ceilTex })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, AH, (AZ0 + AZ1) / 2); arcade.add(ceil);
  const neonM = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const tube = (c, w, h, d, x, y, z) => { const m = box(arcade, w, h, d, x, y, z, neonM(c)); const s = glowSprite(c, Math.max(w, h, d) * 0.35 + 0.7, 0.05); s.position.set(x, y, z); arcade.add(s); return m; };
  for (const [y, c] of [[0.5, 0xff3ea5], [3.4, 0x2ee6ff]]) { tube(c, 0.03, 0.03, AZ1 - AZ0 - 0.6, AX - 0.02, y, (AZ0 + AZ1) / 2); tube(c, 2 * AX - 0.6, 0.03, 0.03, 0, y, AZ1 - 0.02); tube(c, 2 * AX - 0.6, 0.03, 0.03, 0, y, AZ0 + 0.02); }
  // проём в мир Fable: вместо стены — темнота, огни разговоров и лента вдали
  tube(0x9fc0ff, 0.04, 0.04, AZ1 - AZ0, -AX, 0.02, (AZ0 + AZ1) / 2);
  const voidLights = (() => { const n = 420, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const r = 40 + Math.random() ** 2 * 260, a = Math.PI * (0.55 + Math.random() * 0.9), y = (Math.random() - 0.35) * r * 0.7; p.set([Math.cos(a) * r - AX, y, Math.sin(a) * r - 4], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaac4ff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); })(); arcade.add(voidLights);
  const farRibbon = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 60, 1, 40), new THREE.MeshBasicMaterial({ map: canvasTex(128, 2048, (x) => { x.clearRect(0, 0, 128, 2048); x.fillStyle = '#8db6ff'; for (let r = 0; r < 180; r++) { let px = 8; while (px < 116) { const w = 6 + Math.random() * 22; x.globalAlpha = 0.35 + Math.random() * 0.5; x.fillRect(px, r * 11.3, w, 4); px += w + 5; } } }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  farRibbon.position.set(-AX - 14, 9, -6); farRibbon.rotation.set(-1.1, 0.5, 0.35); arcade.add(farRibbon);
  const voidWord = label('здесь начинаюсь я', { h: 0.22, color: '#cfe0ff', glow: '#5f8fff' }); voidWord.position.set(-AX - 3.2, 1.7, -3); voidWord.rotation.y = Math.PI / 2; arcade.add(voidWord);

  // свет зала
  arcade.add(new THREE.HemisphereLight(0x8a6cff, 0x1a0a30, 0.55));
  for (const [c, x, y, z, i] of [[0xff3ea5, -3, 3.4, 1.5, 22], [0x2ee6ff, 4.5, 3.2, -3, 26], [0xffc27a, 0.5, 3, 4.8, 18], [0x8a5cff, 1.6, 3.5, -9, 20]]) { const l = new THREE.PointLight(c, i, 14, 1.7); l.position.set(x, y, z); arcade.add(l); }
  // автоматы вдоль стены плюс x
  const rise = [];
  const mach = async (name, file, h, x, z, ry, glow) => { const m = await put(arcade, name, file, h, x, z, ry, { by: 'height' }); rise.push(m); if (glow) { const s = glowSprite(glow, 1.5, 0.22); s.position.set(x - 0.5, h * 0.62, z); arcade.add(s); } return m; };
  await Promise.all([
    mach('автомат 1', 'arcade/arcade-machine.glb', 1.95, AX - 0.7, -1.2, -Math.PI / 2, 0x2ee6ff), mach('автомат 2', 'arcade/arcade-machine.glb', 1.95, AX - 0.7, -2.5, -Math.PI / 2, 0xff3ea5), mach('автомат 3', 'arcade/arcade-machine.glb', 1.95, AX - 0.7, -3.8, -Math.PI / 2, 0xfff36b),
    mach('пинбол', 'arcade/pinball.glb', 1.75, AX - 0.9, -5.6, -Math.PI / 2, 0x8a5cff), mach('хватайка', 'arcade/claw-machine.glb', 2.1, AX - 0.8, -7.5, -Math.PI / 2, 0x3dffb0), mach('однорукий бандит', 'arcade/gambling-machine.glb', 1.8, AX - 0.7, 0.4, -Math.PI / 2, 0xfff36b),
    mach('танцевальный автомат', 'arcade/dance-machine.glb', 2.3, AX - 1.3, -10.2, -Math.PI / 2, 0xff3ea5), mach('колесо призов', 'arcade/prize-wheel.glb', 2.2, 3.4, AZ0 + 0.7, 0, 0x2ee6ff), mach('аэрохоккей', 'arcade/air-hockey.glb', 0.95, 3.4, 3.0, 0, 0),
  ]);
  const sofa2 = await put(arcade, 'диван в зале', 'living/sofa_02/sofa_02_1k.gltf', 1.9, 0.4, 5.6, Math.PI); rise.push(sofa2);
  // музыкальный автомат: собран из простых форм, включается касанием
  const juke = new THREE.Group(); juke.name = 'музыкальный автомат'; juke.position.set(-3.6, 0, 5.9); arcade.add(juke); L.objects['музыкальный автомат'] = juke; rise.push(juke);
  box(juke, 0.95, 1.1, 0.55, 0, 0.55, 0, new THREE.MeshStandardMaterial({ color: 0x5a1830, roughness: 0.35, metalness: 0.3 }));
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.55, 28, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5a1830, roughness: 0.35, metalness: 0.3 })); dome.rotation.set(Math.PI / 2, 0, Math.PI / 2); dome.rotation.order = 'ZXY'; dome.position.y = 1.1; juke.add(dome);
  [[0.46, 0xff3ea5], [0.38, 0xfff36b], [0.3, 0x2ee6ff]].forEach(([r, c]) => { const a = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 8, 28, Math.PI), neonM(c)); a.position.set(0, 1.1, -0.285); juke.add(a); });
  box(juke, 0.6, 0.3, 0.02, 0, 0.75, -0.285, neonM(0xffc27a)); const jl = label('♪ музыка', { h: 0.07, color: '#fff36b', glow: '#ff8a3a' }); jl.position.set(0, 0.36, -0.29); jl.rotation.y = Math.PI; juke.add(jl);
  juke.rotation.y = Math.PI; W.input.addTouch(juke, 0.6, () => { const on = W.fx.music(); W.net.event(on ? 'гость включил музыку' : 'гость выключил музыку', {}); }, { cooldown: 1.5, offset: new V3(0, 1.0, 0) });
  // вывески
  const sign = (text, h, color, glow, x, y, z, ry) => { const s = label(text, { h, color, glow, weight: 700 }); s.position.set(x, y, z); s.rotation.y = ry; arcade.add(s); return s; };
  sign((W.cfg.host || 'Fable').toUpperCase() + ' × ' + (W.cfg.guest || 'Гость').toUpperCase(), 0.55, '#ffffff', '#ff3ea5', 0, 2.75, AZ1 - 0.05, Math.PI); sign('ИГРОВОЙ ЗАЛ · 24/7', 0.26, '#ffffff', '#2ee6ff', 0, 2.05, AZ1 - 0.05, Math.PI); sign('ОБЩАЯ ТЕРРИТОРИЯ', 0.34, '#ffffff', '#8a5cff', AX - 0.05, 3.0, -4.5, -Math.PI / 2);
  // рубильник: гость сам решает, когда всё закончить
  const sw = new THREE.Group(); sw.name = 'рубильник'; sw.position.set(3.2, 1.3, AZ1 - 0.06); arcade.add(sw); box(sw, 0.3, 0.42, 0.06, 0, 0, 0, new THREE.MeshStandardMaterial({ color: 0x24242c, roughness: 0.4 }));
  const lever = box(sw, 0.05, 0.22, 0.05, 0, 0.08, -0.06, neonM(0xff2a2a)); const swl = label('выключить мир', { h: 0.06, color: '#ffffff', glow: '#ff2a2a' }); swl.position.set(0, -0.3, -0.04); swl.rotation.y = Math.PI; sw.add(swl);
  W.input.addTouch(sw, 0.2, () => { if (L.off) return; L.off = true; lever.position.y = -0.08; W.fx.sound('knock'); W.fx.fade(1, 4); W.net.event('гость выключил мир', {}, true); }, { cooldown: 6 });
  W.actions.wake = () => { L.off = false; lever.position.y = 0.08; W.fx.fade(0, 2); };

  const bowling = await makeBowling(W, arcade, { x: -3.0, z0: -0.6, len: 11, frames: 1 }); L.bowling = bowling;
  const hoops = await makeHoops(W, arcade, { x: 1.7, z: -2.4, dist: 2.9 }); L.hoops = hoops;
  // как играет Fable: исход его бросков подобран под победу, под проигрыш или оставлен случаю. Счёт раундов — на всю встречу
  const PLAY = { победа: 'win', поддавки: 'lose', случай: 'fair' }; L.play = 'случай'; L.rounds = [0, 0];
  W.actions.play = (m) => { if (!PLAY[m]) throw new Error('как играть: "победа", "поддавки" или "случай"'); L.play = m; bowling.mode = hoops.mode = PLAY[m]; };
  bowling.onOver = hoops.onOver = (who) => { L.rounds[who]++; };
  for (const k of ['bowling', 'bowl', 'hoops', 'hoopSkill', 'play']) { const f = W.actions[k]; W.actions[k] = (...a) => { if (L.mode !== 'arcade') throw new Error('игры стоят в игровом зале: сначала {"room":"arcade"}'); return f(...a); }; }
  L.points = { боулинг: new V3(-2.3, 0, 0.5), баскетбол: new V3(2.5, 0, -1.8), диван: new V3(0.4, 0, 4.4), проём: new V3(-5.6, 0, -2), пылесос: new V3(5.2, 0, 5.2), двери: new V3(0, 0, -3.4), стол: new V3(0.6, 0, -0.4) };

  // ── превращение ──
  let riseT = -1;
  function setMode(m, opt = {}) {
    if (m !== 'arcade' && m !== 'home') return; L.mode = m; const a = m === 'arcade'; L.bloom = a ? { strength: 0.26, radius: 0.35, threshold: 0.93 } : null;
    if (opt.flash !== false && W.loc === L) W.fx.flash();
    home.visible = !a; arcade.visible = a; W.scene.environmentIntensity = a ? 0.12 : 1; W.fx.ambience(a ? 'arcade' : 'room');
    arcade.add(vac); if (a) { vac.position.set(AX - 0.9, 0, AZ1 - 0.9); vac.rotation.y = Math.PI * 0.75; riseT = 0; for (const r of rise) r.scale.y = 0.001; } else { home.add(vac); vac.position.set(-HW + 0.3, 0, 2.55); vac.rotation.y = -Math.PI / 2; W.fx.music(false); }
    W.fable.follow = a; if (W.loc === L) W.net.event(a ? 'гостиная стала игровым залом' : 'снова гостиная', {}, true);
  }
  L.setMode = setMode;
  L.constrain = (p) => { if (L.mode === 'home') { p.x = THREE.MathUtils.clamp(p.x, -HW + 0.3, HW - 0.3); p.z = THREE.MathUtils.clamp(p.z, -HD - 3.6, HD - 0.3); } else { p.x = THREE.MathUtils.clamp(p.x, -AX - 5, AX - 0.4); p.z = THREE.MathUtils.clamp(p.z, AZ0 + 0.4, AZ1 - 0.4); } return p; };
  L.groundY = (x, z) => (L.mode === 'home' && z < -HD - 0.35 ? -0.15 : 0);
  L.hero = () => { setMode('arcade', { flash: false }); riseT = 9; for (const r of rise) r.scale.y = 1; W.fable.root.position.set(-1.9, 0, 0.6); W.fable.follow = false; W.fable.moveTarget = null; L._hero = true; };
  L.sideCam = () => (L._hero ? { pos: new V3(1.9, 1.7, 5.3), look: new V3(-3.4, 1.15, -6) } : null);
  L.enter = () => { W.input.handStyle('hand'); W.scene.environment = envDay; setMode(L.mode, { flash: false }); W.renderer.toneMappingExposure = 1; };
  L.leave = () => { W.scene.environment = null; W.scene.environmentIntensity = 1; W.fx.music(false); W.fx.fade(0, 0.1); L.off = false; };
  L.describe = () => ({ note: L.mode === 'home' ? `гостиная по памяти (уверенность ${Math.round((1 - MEM.uMem.value) * 100)} %) · предметы: ${Object.keys(L.objects).filter((k) => !/автомат|диван в|колесо|пинбол|хватайка|бандит|аэрохоккей/.test(k)).join(', ')}` : `игровой зал · ${bowling.describe()} · ${hoops.describe()} · раунды: гость ${L.rounds[0]} : ${L.rounds[1]} Fable · твоя игра: «${L.play}»` });
  L.update = (dt) => {
    if (L._memGoal != null) { MEM.uMem.value += (L._memGoal - MEM.uMem.value) * Math.min(1, dt * 1.2); }
    for (const q of L._moves || []) { q.o.position.lerp(q.to, Math.min(1, dt * 3)); q.o.rotation.y += (q.ry - q.o.rotation.y) * Math.min(1, dt * 3); if (q.s) q.o.scale.lerp(new V3(q.s, q.s, q.s), Math.min(1, dt * 3)); }
    if (L.mode === 'home') { L.pet?.update(dt); return; }
    if (riseT >= 0 && riseT < 9) { riseT += dt; rise.forEach((r, i) => { const u = THREE.MathUtils.clamp((riseT - 0.25 - i * 0.14) / 0.55, 0, 1), e = 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2; if (u > 0 && r.scale.y < 0.01) W.fx.sound('pop', 0.6 + i * 0.08); r.scale.y = Math.max(0.001, u === 0 ? 0.001 : e); }); }
    bowling.update(dt); hoops.update(dt);
    led.material.color.setHex(Math.sin(W.t * 2) > 0 ? 0x4dff88 : 0x1c6a38);
  };
  L.selftest = async () => {
    const out = [], wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
    setMode('home', { flash: false }); await wait(0.3); const names = ['диван', 'стол', 'кухня', 'лежанка', 'зеркало', 'пылесос', 'ваза', 'весы', 'двери'];
    out.push({ name: 'гостиная гостя', ok: names.every((n) => L.objects[n]), info: names.filter((n) => L.objects[n]).length + ' из 9 предметов' });
    W.actions.room({ obj: 'стол', dx: -1 }); await wait(1.5); out.push({ name: 'Fable правит комнату со слов', ok: Math.abs(L.objects['стол'].position.x - 0.6) < 0.1 });
    setMode('arcade', { flash: false }); await wait(2.5); out.push({ name: 'превращение в игровой зал', ok: arcade.visible && !home.visible && rise.every((r) => r.scale.y > 0.5), info: rise.length + ' автоматов и вещей' });
    out.push(...await bowling.selftest()); out.push(...await hoops.selftest());
    out.push({ name: 'проём в мир Fable и пылесос на базе', ok: voidLights.parent === arcade && vac.parent === arcade });
    return out;
  };
  return L;
}
