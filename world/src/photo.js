// Фото на память: камера встаёт перед гостем и Fable, отсчёт, вспышка. Снимок остаётся в мире карточкой, которую можно взять в руку,
// и файлом на сервере: Fable получает путь событием и может посмотреть, что вышло.
import * as THREE from 'three';
import { label } from './words.js';
import { SPEC_LAYER } from './spectator.js';

const V3 = THREE.Vector3;

export function makePhoto(W) {
  const cam = new THREE.PerspectiveCamera(42, 4 / 3, 0.05, 3000); cam.layers.enable(SPEC_LAYER); cam.layers.enable(1); cam.userData.main = true; W.scene.add(cam);
  // фотоаппарат висит там, откуда снимают: гость видит, куда смотреть
  const giz = new THREE.Group(); giz.visible = false; W.scene.add(giz);
  giz.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.115, 0.07), new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.4, emissive: 0x1c1c22, emissiveIntensity: 0.6 })));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.05, 24), new THREE.MeshBasicMaterial({ color: 0x9fc0ff, toneMapped: false })); lens.rotation.x = Math.PI / 2; lens.position.z = 0.055; giz.add(lens);
  let num = null, job = null; const cards = [];
  function showNum(n) { if (num) { giz.remove(num); num.geometry.dispose(); num.material.dispose(); num = null; }
    if (n) { num = label(String(n), { h: 0.22, color: '#ffffff', glow: '#ff3ea5' }); num.position.set(0, 0.26, 0); giz.add(num); W.fx.sound('word', 0.7); } }

  W.actions.photo = () => {
    if (job) return false;
    if (W.loc?.noAvatar) throw new Error('на этой локации у гостя нет тела — фото делай на локации 2 или 3');
    const a = W.head.pos, b = W.fable.visible ? W.fable.headPos : null, mid = b ? a.clone().add(b).multiplyScalar(0.5) : a.clone();
    const perp = b ? new V3(-(b.z - a.z), 0, b.x - a.x).normalize() : W.head.dir.clone().setY(0).normalize(); if (perp.dot(W.head.dir) < 0) perp.negate(); // с той стороны, куда гость смотрит
    const p = mid.clone().addScaledVector(perp, Math.max(2.4, (b ? a.distanceTo(b) : 0) * 0.9 + 1.5)), c = W.loc?.constrain?.(p.clone()); if (c) { p.x = c.x; p.z = c.z; }
    p.y = a.y - 0.25; const look = new V3(mid.x, a.y - 0.45, mid.z);
    giz.position.copy(p); giz.lookAt(look); giz.visible = true; W.fable.facePoint = p.clone();
    job = { t: 0, n: 3, p, look, loc: W.loc }; showNum(3); W.net.event('фото: отсчёт три секунды', {});
  };

  function shoot() {
    showNum(0); giz.visible = false; cam.position.copy(job.p); cam.lookAt(job.look);
    const name = `photo-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.jpg`, pic = W.spectator.snapshot(cam, 1600, 1200, name);
    W.fx.flash(); W.fable.facePoint = null;
    pic.then((canvas) => {
      // карточка: снимок на белой подложке, как моментальное фото
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const g = new THREE.Group(); g.name = 'фото на память';
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.006), new THREE.MeshBasicMaterial({ color: 0xdcdcd6, toneMapped: false })); g.add(back);
      const img = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.315), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); img.position.set(0, 0.025, 0.004); g.add(img);
      const cap = label((W.cfg.host || 'Fable') + ' × ' + (W.cfg.guest || 'Гость') + ' · ' + new Date().toLocaleDateString('ru-RU'), { h: 0.017, color: '#30303a', glow: null, add: false }); cap.position.set(0, -0.165, 0.004); g.add(cap);
      g.position.copy(job.p); job.loc.group.add(g);
      const card = { g, t: 0, grab: null }; cards.push(card);
      card.grab = W.input.addGrab(g, { name: 'фото на память', r: 0.26, far: true, farDist: 3, onGrab() { W.net.event('гость взял фото', {}); } });
      W.net.event('фото сделано', { файл: name }, true); job = null;
    }).catch((e) => { W.fail('фото', e); job = null; });
    job.shot = true;
  }

  const q = new THREE.Quaternion(), to = new V3(), m = new THREE.Matrix4();
  W.updaters.push((dt) => {
    if (job && !job.shot) { job.t += dt; const n = 3 - Math.floor(job.t); if (n !== job.n) { job.n = n; if (n > 0) showNum(n); } if (job.t >= 3) shoot(); }
    for (const c of cards) { // карточка подплывает к гостю и ждёт перед ним, пока её не возьмут
      if (c.grab.held || c.taken) { c.taken = true; continue; }
      c.t += dt; to.copy(W.head.pos).addScaledVector(W.head.dir.clone().setY(0).normalize(), 0.6); to.y = W.head.pos.y - 0.28;
      if (c.t < 6) c.g.position.lerp(to, Math.min(1, dt * 1.8));
      q.setFromRotationMatrix(m.lookAt(W.head.pos, c.g.position, THREE.Object3D.DEFAULT_UP)); c.g.quaternion.slerp(q, Math.min(1, dt * 6));
    }
  });
}
