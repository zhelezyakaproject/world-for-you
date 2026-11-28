// «Слово становится вещью»: гость называет предмет — он появляется перед ним. Здесь же общая загрузка готовых моделей.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { label } from './words.js';

const loader = new GLTFLoader(); const cache = new Map();
// Модель из media/models; каждый вызов отдаёт свою копию.
export function loadModel(file) {
  if (!cache.has(file)) cache.set(file, new Promise((ok, no) => loader.load('/media/models/' + file, (g) => ok(g.scene), undefined, no)));
  return cache.get(file).then((s) => s.clone(true));
}
// Подгоняет модель под размер (наибольшая сторона = size метров) и ставит основанием на пол, центром в ноль.
export function fit(obj, size, { by = 'max' } = {}) {
  const g = new THREE.Group(); g.add(obj); obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = size / (by === 'height' ? s.y : Math.max(s.x, s.y, s.z));
  obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z)); const inner = new THREE.Group(); inner.add(obj); inner.scale.setScalar(k); g.add(inner);
  g.userData.size = s.multiplyScalar(k); return g;
}

// что умеет появляться: слово (по началу слова) → модель, размер в метрах, высота над землёй
export const CATALOG = [
  { name: 'гитара', re: /гитар/, file: 'things/guitar.glb', size: 1.05, hold: true },
  { name: 'велосипед', re: /велосипед|велик/, file: 'things/bicycle.glb', size: 1.8 },
  { name: 'пианино', re: /пианино|роял|фортепиан/, file: 'things/piano.glb', size: 1.6 },
  { name: 'воздушный шар', re: /воздушн\S* шар|аэростат|шар\S* воздушн/, file: 'things/hot_air_balloon.glb', size: 5, up: 2.5 },
  { name: 'зонт', re: /зонт/, file: 'things/umbrella.glb', size: 1.1, hold: true },
  { name: 'ракета', re: /ракет/, file: 'things/rocket.glb', size: 3.2 },
  { name: 'корабль', re: /корабл|парусник|лодк/, file: 'things/sail_ship.glb', size: 4.5, far: 7 },
  { name: 'книга', re: /книг/, file: 'things/open_book.glb', size: 0.42, hold: true, up: 1.1 },
  { name: 'корона', re: /корон/, file: 'things/crown.glb', size: 0.28, hold: true, up: 1.2 },
  { name: 'кот', re: /\bкот|кошк|котик/, file: 'things/cat.glb', size: 0.55 },
  { name: 'мотоцикл', re: /мотоцикл|байк/, file: 'things/motorcycle.glb', size: 2.1 },
  { name: 'кресло', re: /кресл/, file: 'things/ArmChair_01/ArmChair_01_1k.gltf', size: 1.0 },
  { name: 'торт', re: /торт/, file: 'things/strawberry_chocolate_cake/strawberry_chocolate_cake_1k.gltf', size: 0.45, up: 1.0, hold: true },
  { name: 'фонарь', re: /фонар/, file: 'things/wooden_lantern_01/wooden_lantern_01_1k.gltf', size: 0.5, hold: true, up: 1.0, light: true },
  { name: 'пальма', re: /пальм|дерев/, file: 'island/kenney_tree_palmDetailedTall.glb', size: 6 },
];

export function makeThings(W, parent, groundY) {
  const list = []; let slot = 0;
  const T = { list, catalog: CATALOG,
    fromSpeech(text) { const t = text.toLowerCase(); for (const c of CATALOG) if (c.re.test(t)) T.spawn(c.name); },
    // name — имя из списка; at — [x, z] или ничего (перед гостем)
    async spawn(name, at) {
      const c = CATALOG.find((x) => x.name === name || x.re.test(String(name).toLowerCase())); if (!c) { W.net.event('такой вещи нет в запасе', { слово: name }, true); return null; }
      const item = { name: c.name, t: 0, c, g: null }; list.push(item);
      while (list.length > 12) { const i = list.findIndex((x) => x !== item && !x.grab?.held); if (i < 0) break; const old = list.splice(i, 1)[0]; if (old.g) parent.remove(old.g); if (old.word) parent.remove(old.word); if (old.grab) { old.grab.enabled = false; const k = W.input.grabs.indexOf(old.grab); if (k >= 0) W.input.grabs.splice(k, 1); } }
      // место: веером перед гостем, чтобы вещи не вставали друг в друга
      const k = slot++, ang = ((k % 5) - 2) * 0.42, dist = (c.far || 1.9 + c.size * 0.5) + ((k / 5) | 0) * 0.8;
      const f = new THREE.Vector3(W.head.dir.x, 0, W.head.dir.z).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const x = at ? at[0] : W.head.pos.x + f.x * dist, z = at ? at[1] : W.head.pos.z + f.z * dist;
      // сначала слово: оно висит на месте будущей вещи, потом из него вырастает вещь
      const word = label(c.name, { h: 0.16, color: '#ffffff', glow: '#ffd28a' }); word.position.set(x, groundY(x, z) + Math.max(1.3, (c.up || 0) + c.size * 0.5), z); parent.add(word); item.word = word; W.fx.sound('pop');
      try {
        const g = fit(await loadModel(c.file), c.size); if (!list.includes(item)) return item; g.name = c.name; g.position.set(x, groundY(x, z) + (c.up || 0), z); g.rotation.y = Math.atan2(W.head.pos.x - x, W.head.pos.z - z); g.scale.setScalar(0.001); parent.add(g); item.g = g;
        if (c.light) { const l = new THREE.PointLight(0xffb060, 2.5, 6, 1.8); l.position.y = c.size * 0.5; g.add(l); }
        if (c.hold) item.grab = W.input.addGrab(g, { name: c.name, r: Math.max(0.25, c.size * 0.5), far: true, farDist: 6, snap: true, holdDist: 0.05 });
        W.fx.sound('chime', 1.1); W.net.event('слово стало вещью', { вещь: c.name });
      } catch (e) { W.fail('вещь ' + c.name, e); }
      return item;
    },
    clear() { for (const i of list) { if (i.g) parent.remove(i.g); if (i.word) parent.remove(i.word); if (i.grab) { i.grab.enabled = false; const k = W.input.grabs.indexOf(i.grab); if (k >= 0) W.input.grabs.splice(k, 1); } } list.length = 0; slot = 0; },
    update(dt) {
      for (const i of list) {
        i.t += dt;
        if (i.word) { i.word.lookAt(W.head.pos); const a = i.g ? Math.max(0, 1 - (i.t - 0.9) * 1.2) : 1; i.word.material.opacity = Math.min(1, i.t * 5) * a; i.word.position.y += dt * 0.12; if (a <= 0) { parent.remove(i.word); i.word = null; } }
        if (i.g && !i.done) { const u = Math.min(1, Math.max(0, (i.t - 0.5) / 0.7)), e = 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2; i.g.scale.setScalar(Math.max(0.001, e)); if (u >= 1) i.done = true; }
      }
    } };
  return T;
}
