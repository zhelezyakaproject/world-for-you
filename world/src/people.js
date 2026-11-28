// Готовые люди Microsoft Rocketbox (MIT) и их записанные движения.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';

const clipCache = {};
const loadFbx = (url, manager, res) => new Promise((ok, no) => { const l = new FBXLoader(manager); if (res) l.setResourcePath(res); l.load(url, ok, undefined, no); });

// Движение: оставляем повороты костей и высоту таза; перемещение по полу убираем — человека двигает мир.
export async function loadClip(url, name) {
  if (clipCache[url]) return clipCache[url];
  const f = await loadFbx(url, new THREE.LoadingManager());
  const src = f.animations[0];
  const tracks = src.tracks.filter((t) => !/MotionExtraction/.test(t.name) && (/\.quaternion$/.test(t.name) || t.name === 'Bip01.position'));
  const pos = tracks.find((t) => t.name === 'Bip01.position');
  if (pos) { const x0 = pos.values[0], z0 = pos.values[2]; for (let i = 0; i < pos.times.length; i++) { pos.values[i * 3] = x0; pos.values[i * 3 + 2] = z0; } }
  return (clipCache[url] = new THREE.AnimationClip(name, src.duration, tracks));
}

// model: имя папки Rocketbox. textures:false — только форма и скелет (для тела из слов).
export async function loadPerson({ model, base = '/rocketbox/', clips = {}, textures = true, height = 1.78 }) {
  const manager = new THREE.LoadingManager();
  manager.onError = () => {};
  let done = null; const loaded = new Promise((r) => { done = r; }); manager.onLoad = done;
  if (textures) manager.addHandler(/\.tga$/i, new TGALoader(manager));
  // карт блеска в наборе нет, а без текстур (тело из слов) картинки не нужны вовсе — подставляем пустую точку вместо запроса
  const EMPTY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const TGA1 = 'data:application/octet-stream;base64,AAACAAAAAAAAAAAAAQABABgAgID/'; // точка в формате TGA: вместо карт рельефа и блеска (12 МБ каждая, в мире не нужны)
  manager.setURLModifier((u) => (!textures && /\.(tga|png|jpe?g|bmp)$/i.test(u) ? EMPTY : textures && /(normal|specular)\.tga$/i.test(u) ? TGA1 : u));
  const fbx = await loadFbx(`${base}${model}/Export/${model}.fbx`, manager, `${base}${model}/Textures/`);
  if (textures) await Promise.race([loaded, new Promise((r) => setTimeout(r, 20000))]);
  const bones = {}, meshes = [];
  fbx.traverse((o) => {
    if (/Bip01/.test(o.name)) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      meshes.push(o); o.frustumCulled = false;
      for (const m of [].concat(o.material)) {
        if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.color.set(0xffffff); }
        m.specularMap = null; m.normalMap = null; m.emissive?.set(0); m.shininess = Math.min(m.shininess ?? 20, 18); m.specular?.multiplyScalar(0.25);
        if (m.transparent || /opacity|hair|lash/i.test(m.name)) { m.transparent = false; m.alphaTest = 0.45; }
        m.side = THREE.DoubleSide; m.needsUpdate = true;
      }
    }
  });
  fbx.scale.setScalar(height / new THREE.Box3().setFromObject(fbx).getSize(new THREE.Vector3()).y);
  const root = new THREE.Group(); root.add(fbx);
  const mixer = new THREE.AnimationMixer(fbx), actions = {};
  await Promise.all(Object.entries(clips).map(async ([name, url]) => {
    try { const a = mixer.clipAction(await loadClip(url, name)); a.play(); a.setEffectiveWeight(0); actions[name] = a; } catch (e) { console.warn('нет движения', name, e); }
  }));
  const weights = {}; for (const n of Object.keys(actions)) weights[n] = 0;
  return {
    root, fbx, bones, meshes, mixer, actions, weights,
    bone: (n) => bones['Bip01_' + n.replace(/ /g, '_')] || bones[n],
    // плавно сводит веса движений к заданным: {idle:1, talk:0.4}
    blend(target, dt, speed = 5) {
      const k = Math.min(1, dt * speed);
      for (const n of Object.keys(actions)) { weights[n] += ((target[n] || 0) - weights[n]) * k; actions[n].setEffectiveWeight(weights[n]); }
    },
    // сыграть движение один раз с начала, поверх остальных
    once(n) { const a = actions[n]; if (!a) return 0; a.reset(); a.time = 0; return a.getClip().duration; },
  };
}
