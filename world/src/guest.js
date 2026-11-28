// Тело гостя для камер записи и зеркал: готовый человек Rocketbox (Male_Adult_08). Голова и руки идут за шлемом и контроллерами.
// Сам гость своё тело не видит (оно на отдельном слое) — только в зеркале.
import * as THREE from 'three';
import { loadPerson } from './people.js';
import { SPEC_LAYER } from './spectator.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const A = '/rocketbox/animations/';

// Костюм: всё чёрное и длинное пальто до щиколоток со стоячим воротником.
// Одежда модели (рубашка, джинсы, закатанные рукава) затемняется по вершинам, кожа остаётся только на кистях и голове.
// Полы пальто и воротник — отдельная сетка на том же скелете: полы идут за тазом и бёдрами. Размеры снимаются с самой модели.
function costume(person) {
  const body = person.meshes[0], geo = body.geometry, sk = body.skeleton, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const mats = [].concat(body.material), DARK = 0.05, COAT = 0x0d0d10;
  // главная кость каждой вершины и её место в позе покоя (вверх — y, вперёд — z, сантиметры)
  const n = pos.count, own = new Array(n), P = new Float32Array(n * 3), v = new V3(), col = new Float32Array(n * 3).fill(1);
  for (let i = 0; i < n; i++) { let b = 0, w = -1; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); b = si.getComponent(i, k); } own[i] = sk.bones[b].name; v.fromBufferAttribute(pos, i).applyMatrix4(body.bindMatrix).toArray(P, i * 3); }
  for (const g of geo.groups) { if (!/body/i.test(mats[g.materialIndex].name)) continue; for (let i = g.start; i < g.start + g.count; i++) if (!/Hand|Finger/.test(own[i])) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = DARK; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const m of mats) if (/body/i.test(m.name)) { m.vertexColors = true; m.shininess = 36; m.specular?.set(0x34343a); m.needsUpdate = true; }

  // обхват тела на высоте y: полуширина и края спереди и сзади (без рук)
  const girth = (y, re) => { let a = 0, f = -1e9, b = 1e9; for (let i = 0; i < n; i++) { if (Math.abs(P[i * 3 + 1] - y) > 3 || !re.test(own[i])) continue; a = Math.max(a, Math.abs(P[i * 3])); f = Math.max(f, P[i * 3 + 2]); b = Math.min(b, P[i * 3 + 2]); } return { a, f, b }; };
  const bind = (name) => new V3().setFromMatrixPosition(sk.boneInverses[sk.bones.indexOf(person.bone(name))].clone().invert());
  const id = (name) => sk.bones.indexOf(person.bone(name));
  const hipY = bind('Pelvis').y, top = bind('Spine').y + 15, low = bind('L Foot').y + 9, hip = girth(hipY - 4, /Pelvis|Spine|Thigh/);
  const vs = [], idx = [], bi = [], bw = [], SEG = 40, inv = body.bindMatrix.clone().invert();
  const put = (x, y, z, bones) => { v.set(x, y, z).applyMatrix4(inv); vs.push(v.x, v.y, v.z); const b = bones.filter((e) => e[1] > 1e-3).slice(0, 4); while (b.length < 4) b.push([0, 0]); const s = b.reduce((t, e) => t + e[1], 0); for (const e of b) { bi.push(e[0]); bw.push(e[1] / s); } return vs.length / 3 - 1; };
  const strip = (rows) => { for (let r = 0; r + 1 < rows.length; r++) for (let s = 0; s < SEG; s++) { const a = rows[r][s], b = rows[r][s + 1], c = rows[r + 1][s], d = rows[r + 1][s + 1]; idx.push(a, c, b, b, c, d); } };
  // полы: от талии до щиколоток, книзу шире; спереди ниже пояса расходятся
  const rows = [], RINGS = 12;
  for (let r = 0; r <= RINGS; r++) {
    const y = top + (low - top) * r / RINGS, t = Math.max(0, (hipY - y) / (hipY - low)), w = y > hipY - 4 ? girth(y, /Pelvis|Spine/) : hip, g = w.a ? w : hip;
    const fit = 1.6 - 4.6 * Math.max(0, (y - hipY) / (top - hipY)) ** 2 /* верхний край уходит внутрь тела: шва на поясе нет */, a = g.a + fit + 9 * t, hz = (g.f - g.b) / 2 + fit + 8 * t, cz = (g.f + g.b) / 2 - 3 * t, gap = 0.02 + 0.3 * Math.min(1, Math.max(0, (hipY + 4 - y) / 30));
    const follow = 0.62 * t ** 0.7, up = Math.max(0, (y - hipY) / (top - hipY)), row = [];
    for (let s = 0; s <= SEG; s++) { const ph = gap + (2 * Math.PI - 2 * gap) * s / SEG, sx = Math.sin(ph), l = Math.min(1, Math.max(0, 0.5 + sx * 1.6));
      row.push(put(a * sx, y, cz + hz * Math.cos(ph), [[id('Pelvis'), (1 - follow) * (1 - up * 0.6)], [id('Spine'), up * 0.6], [id('L Thigh'), follow * l], [id('R Thigh'), follow * (1 - l)]])); }
    rows.push(row);
  }
  strip(rows);
  // воротник-стойка: кольцо вокруг шеи, спереди раскрыт
  const neckY = bind('Neck').y, nk = girth(neckY + 1, /Neck|Head/), collar = [];
  for (const [dy, grow] of [[-5.5, 2.6], [-1, 1.5], [3.2, 2.2]]) { const row = []; for (let s = 0; s <= SEG; s++) { const ph = 0.8 + (2 * Math.PI - 1.6) * s / SEG, end = Math.min(1, Math.min(s, SEG - s) / 6); row.push(put((nk.a + grow) * Math.sin(ph), neckY + (dy > 0 ? dy * end : dy), (nk.f + nk.b) / 2 + ((nk.f - nk.b) / 2 + grow) * Math.cos(ph), [[id('Spine2'), 0.7], [id('Neck'), 0.3]])); } collar.push(row); }
  strip(collar);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bi, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bw, 4)); g.setIndex(idx); g.computeVertexNormals();
  const coat = new THREE.SkinnedMesh(g, new THREE.MeshPhongMaterial({ color: COAT, shininess: 36, specular: 0x34343a, side: THREE.DoubleSide })); coat.name = 'пальто'; coat.frustumCulled = false;
  coat.position.copy(body.position); coat.quaternion.copy(body.quaternion); coat.scale.copy(body.scale); body.parent.add(coat); coat.bind(sk, body.bindMatrix);
  person.meshes.push(coat);
}

export async function makeGuest(W) {
  const person = await loadPerson({ model: 'Male_Adult_08', base: '/media/models/people/', height: 1.78, clips: { idle: A + 'm_idle_neutral_01.fbx', walk: A + 'm_walk_neutral_01.fbx' } });
  const root = person.root; root.name = 'тело гостя'; W.scene.add(root);
  costume(person); // пальто снимает мерки с формы модели и красит её вершины
  root.traverse((o) => o.layers.set(SPEC_LAYER));
  const B = (n) => person.bone(n);
  const head = B('Head'), arms = [['L UpperArm', 'L Forearm', 'L Hand'], ['R UpperArm', 'R Forearm', 'R Hand']].map((a) => a.map(B));
  const SMILE = [0.0025, 0.001, 0.0008]; // уголки рта: вверх, наружу, назад
  // поза покоя: как повёрнута голова, когда человек смотрит прямо, и длины костей рук
  root.updateMatrixWorld(true);
  const headRest = head.getWorldQuaternion(new Q());
  // уголки рта чуть вверх и наружу: у модели они опущены, и лицо выглядело угрюмым (сдвиг в метрах мира при росте 1,78 м)
  const rq = root.getWorldQuaternion(new Q()), UP = new V3(0, 1, 0).applyQuaternion(rq), FW = new V3(0, 0, 1).applyQuaternion(rq);
  const corners = ['LMouthCorner', 'RMouthCorner'].map(B).filter(Boolean).map((b) => {
    const p = b.getWorldPosition(new V3()), out = p.clone().sub(head.getWorldPosition(new V3())); out.addScaledVector(UP, -out.dot(UP)).addScaledVector(FW, -out.dot(FW)).normalize();
    const d = UP.clone().multiplyScalar(SMILE[0]).addScaledVector(out, SMILE[1]).addScaledVector(FW, -SMILE[2]);
    return [b, b.position.clone(), b.parent.worldToLocal(p.clone().add(d)).sub(b.parent.worldToLocal(p.clone()))]; });
  const len = arms.map(([u, f, h]) => [u.getWorldPosition(new V3()).distanceTo(f.getWorldPosition(new V3())), f.getWorldPosition(new V3()).distanceTo(h.getWorldPosition(new V3()))]);
  const eyeY = head.getWorldPosition(new V3()).y + 0.09;
  const parts = []; root.traverse((o) => parts.push(o));
  const s = { root, person, visible: true, yaw: 0,
    // в зеркалах и в воде тело видно всем, в том числе самому гостю
    // Отражения вложены (в зеркале видна вода со своим отражением): слой возвращается, только когда закончилось самое внешнее, иначе тело пропадало из зеркала.
    inMirrors(list) { let depth = 0; for (const m of list) { const orig = m.onBeforeRender; m.onBeforeRender = function (...a) { if (depth++ === 0) for (const o of parts) o.layers.enable(0); try { orig.apply(this, a); } finally { if (--depth === 0) for (const o of parts) o.layers.set(SPEC_LAYER); } }; } } };
  const tmp = new V3(), tmp2 = new V3(), q1 = new Q(), q2 = new Q(), flip = new Q().setFromAxisAngle(new V3(0, 1, 0), Math.PI), last = new V3();
  // повернуть кость так, чтобы отрезок «кость → потомок» лёг вдоль want
  function aim(bone, child, want) {
    const p = bone.getWorldPosition(tmp), c = child.getWorldPosition(tmp2); const cur = c.sub(p).normalize();
    q1.setFromUnitVectors(cur, want); bone.getWorldQuaternion(q2); q2.premultiply(q1);
    bone.parent.getWorldQuaternion(q1).invert(); bone.quaternion.copy(q1.multiply(q2)); bone.updateWorldMatrix(false, true);
  }
  const S = new V3(), T = new V3(), dir = new V3(), pole = new V3(), E = new V3(), want = new V3();
  s.update = (dt) => {
    const show = !W.loc?.noAvatar; root.visible = show; if (!show) return;
    // тело стоит под головой и поворачивается вслед за взглядом с запозданием
    const hy = Math.atan2(-W.head.dir.x, -W.head.dir.z); let d = hy - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > 0.5) s.yaw += d * Math.min(1, dt * 4);
    const moved = last.distanceTo(tmp.set(W.head.pos.x, 0, W.head.pos.z)) / Math.max(dt, 1e-3); last.copy(tmp);
    for (const [b, p] of corners) b.position.copy(p);
    person.blend(moved > 0.5 ? { walk: 1 } : { idle: 1 }, dt, 6); person.mixer.update(dt);
    for (const [b, , o] of corners) b.position.add(o);
    const k = W.rig.scale.x; root.scale.setScalar(k); // великан или малыш: тело того же роста, что и гость
    root.rotation.y = s.yaw + Math.PI; root.position.set(W.head.pos.x + Math.sin(s.yaw) * 0.06 * k, W.head.pos.y - eyeY * k, W.head.pos.z + Math.cos(s.yaw) * 0.06 * k);
    root.updateMatrixWorld(true);
    // голова смотрит туда же, куда шлем
    q2.copy(W.head.quat).multiply(flip).multiply(headRest); head.parent.getWorldQuaternion(q1).invert(); head.quaternion.copy(q1.multiply(q2)); head.updateWorldMatrix(false, true);
    // руки тянутся к контроллерам: плечо — локоть — кисть по двум костям
    arms.forEach(([u, f, h], i) => {
      const hand = W.input.hands[i]; u.getWorldPosition(S); T.copy(hand.pos); dir.subVectors(T, S); const a = len[i][0] * k, b = len[i][1] * k; let dist = dir.length(); dir.normalize();
      dist = Math.min(dist, a + b - 0.005 * k); T.copy(S).addScaledVector(dir, dist);
      const cosA = THREE.MathUtils.clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
      pole.set((i ? 1 : -1) * Math.cos(s.yaw) * 0.6, -1, -(i ? 1 : -1) * Math.sin(s.yaw) * 0.6 - 0.0).addScaledVector(tmp.set(Math.sin(s.yaw), 0, Math.cos(s.yaw)), 0.5); // локоть вниз, в сторону и чуть назад
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      E.copy(S).addScaledVector(dir, a * cosA).addScaledVector(pole, a * sinA);
      aim(u, f, want.subVectors(E, S).normalize()); f.getWorldPosition(E); aim(f, h, want.subVectors(T, E).normalize());
      // кисть повёрнута как контроллер
      q2.copy(hand.quat).multiply(HAND_FIX[i]); h.parent.getWorldQuaternion(q1).invert(); h.quaternion.copy(q1.multiply(q2));
    });
  };
  // кисть: у костей Rocketbox ось вдоль пальцев — x; контроллер смотрит вдоль минус z
  const HAND_FIX = [new Q().setFromEuler(new THREE.Euler(Math.PI / 2, Math.PI / 2, 0)), new Q().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.PI / 2, 0))];
  return s;
}
