// Пёс: громадный, чёрно-белый, пушистый. Модель — хаски Quaternius (CC0); мех, окрас и поведение — здесь.
// Бежит за мячом и приносит, опускает голову под руку, ложится, когда гладят.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { isMainCam } from './spectator.js';

const SHELLS = 30;
const FURRY = new Set(['Material', 'Material.001', 'Material.003']);
const V3 = THREE.Vector3;

// Шкура: окрас считается по месту на теле (белые «носки», грудь, воротник, морда, кончик хвоста — остальное чёрное), мех — слоями-оболочками.
// shells > 0 — все оболочки меха одним вызовом отрисовки: номер оболочки берётся из номера копии, внешние рисуются первыми и заслоняют внутренние.
function furMaterial(coat, shell, uni, shells = 0) {
  const m = new THREE.MeshStandardMaterial({ color: coat ? 0xffffff : 0x050506, roughness: coat ? 0.9 : 0.35, metalness: 0 }); m.userData.uShells = { value: shells };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uShell: { value: shell }, uShells: m.userData.uShells, uFur: uni.uFur, uDensity: uni.uDensity, uWind: uni.uWind, uBody: uni.uBody, uHead: uni.uHead, uCoat: { value: coat ? 1 : 0 } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aSmooth; uniform float uShell, uShells, uFur; uniform vec3 uWind; varying vec3 vFurP; varying float vShell;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = aSmooth;')
      .replace('#include <begin_vertex>', `float shellK = ${shells ? '(uShells - float(gl_InstanceID)) / uShells' : 'uShell'}; vShell = shellK; vec3 transformed = position + aSmooth * (shellK * uFur) + uWind * (shellK * shellK * uFur); vFurP = position;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uDensity, uCoat; uniform vec4 uBody; uniform vec3 uHead; varying vec3 vFurP; varying float vShell;
      float fh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (uCoat > 0.5) {
          float along = (vFurP.y - uBody.x) / (uBody.y - uBody.x), up = (vFurP.z - uBody.z) / (uBody.w - uBody.z), side = abs(vFurP.x) / uHead.x;
          float n = (fh(floor(vFurP * uDensity * 0.12)) - 0.5) * 0.07, w = 0.0;
          w = max(w, step(up + n, 0.2));
          w = max(w, step(up + n, 0.44) * step(0.1, along) * step(side, 0.6));
          w = max(w, step(0.6, along + n) * step(along, 1.0) * step(up + n, 0.66) * step(side, 0.8));
          w = max(w, step(0.74, along + n) * step(along + n, 0.9));
          w = max(w, step(1.1, along + n) * step(up, uHead.y + 0.03));
          w = max(w, step(0.98, along) * step(side + n, 0.2));
          w = max(w, step(along + n, uHead.z));
          diffuseColor.rgb = mix(vec3(0.035, 0.035, 0.045), vec3(0.93, 0.91, 0.86), w);
          if (vShell > 0.0) { vec3 fp = vFurP * uDensity; float r = fh(floor(fp)); float len = 0.45 + 0.55 * r; if (vShell > len) discard;
            vec3 f = fract(fp) - 0.5; if (length(f) > 0.7 * (1.0 - 0.75 * vShell / len)) discard; }
          diffuseColor.rgb *= mix(0.4, 1.15, vShell);
        }`);
  };
  m.customProgramCacheKey = () => (shells ? 'fur-shells' : 'fur');
  return m;
}

export async function makeDog(W, { height = 3, ball, world, bounds = 20, groundY = () => 0 }) {
  const gltf = await new Promise((ok, no) => new GLTFLoader().load('/media/models/dog/Husky.glb', ok, undefined, no));
  const model = gltf.scene; const root = new THREE.Group(); root.name = 'пёс'; root.add(model);
  const meshes = []; model.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });

  // гладкие нормали по всей шкуре: у модели грани плоские, и мех по ним разошёлся бы щелями
  const acc = new Map(); const key = (x, y, z) => `${Math.round(x * 2e5)},${Math.round(y * 2e5)},${Math.round(z * 2e5)}`;
  const a = new V3(), b = new V3(), c = new V3(), n = new V3();
  for (const m of meshes) {
    const p = m.geometry.attributes.position, idx = m.geometry.index; const cnt = idx ? idx.count : p.count;
    for (let i = 0; i < cnt; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2); n.subVectors(b, a).cross(c.clone().sub(a));
      for (const v of [a, b, c]) { const k = key(v.x, v.y, v.z); const e = acc.get(k) || acc.set(k, new V3()).get(k); e.add(n); }
    }
  }
  for (const m of meshes) {
    const p = m.geometry.attributes.position, s = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { a.fromBufferAttribute(p, i); n.copy(acc.get(key(a.x, a.y, a.z))).normalize(); s.set([n.x, n.y, n.z], i * 3); }
    m.geometry.setAttribute('aSmooth', new THREE.BufferAttribute(s, 3));
  }
  // рост: модель в своих единицах, подгоняем под height метров
  model.updateMatrixWorld(true); let box = new THREE.Box3().setFromObject(model); const k = height / (box.max.y - box.min.y);
  model.scale.multiplyScalar(k); model.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(model); model.position.y -= box.min.y;
  const meshScale = meshes[0].getWorldScale(new V3()).x; // во сколько раз единицы шкуры меньше метра
  // где у шкуры хвост, голова, низ и верх — в её собственных координатах (длина по y, высота по z)
  const bones0 = {}; model.traverse((o) => { if (o.isBone) bones0[o.name] = o; });
  const loc = (bn) => meshes[0].worldToLocal(bones0[bn].getWorldPosition(new V3()));
  const gb = new THREE.Box3(); for (const m of meshes) { m.geometry.computeBoundingBox(); gb.union(m.geometry.boundingBox); }
  const hd = loc('Head'), tl = loc('Tail1'), tip = loc(bones0.Tail6 ? 'Tail6' : 'Tail5');
  console.log('пёс: хвост y', tl.y.toFixed(4), 'голова y', hd.y.toFixed(4), 'кончик хвоста y', tip.y.toFixed(4), 'z', gb.min.z.toFixed(4), gb.max.z.toFixed(4));
  const uni = { uFur: { value: 0.11 / meshScale }, uDensity: { value: meshScale / 0.014 }, uWind: { value: new V3() },
    uBody: { value: new THREE.Vector4(tl.y, hd.y, gb.min.z, gb.max.z) }, uHead: { value: new V3(gb.max.x, (hd.z - gb.min.z) / (gb.max.z - gb.min.z), ((tip.y + tl.y) / 2 - tl.y) / (hd.y - tl.y)) } };
  for (const m of meshes) {
    const coat = FURRY.has(m.material.name);
    m.material = furMaterial(coat, 0, uni); m.frustumCulled = false; m.castShadow = true;
    if (!coat) continue;
    const shells = W.lite ? 12 : SHELLS;
    const sg = new THREE.InstancedBufferGeometry().copy(m.geometry); sg.instanceCount = shells;
    const sh = new THREE.SkinnedMesh(sg, furMaterial(true, 0, uni, shells)); sh.bind(m.skeleton, m.bindMatrix); sh.frustumCulled = false; sh.renderOrder = -1; m.parent.add(sh);
    // в отражениях (вода, зеркала) мех рисуется реже: 8 оболочек вместо всех — в ряби воды разницы не видно
    sh.onBeforeRender = (r, s, cam) => { const n = isMainCam(cam) ? shells : Math.min(8, shells); if (sg.instanceCount !== n) { sg.instanceCount = n; sh.material.userData.uShells.value = n; sh.material.uniformsNeedUpdate = true; } }; sh.position.copy(m.position); sh.quaternion.copy(m.quaternion); sh.scale.copy(m.scale);
  }
  const bones = {}; model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const tail = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5'].map((t) => bones[t]).filter(Boolean);
  // мягкая тень под псом
  const sc = document.createElement('canvas'); sc.width = sc.height = 128; const sx = sc.getContext('2d'); const sg = sx.createRadialGradient(64, 64, 0, 64, 64, 64); sg.addColorStop(0, 'rgba(0,0,0,.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = sg; sx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.scale.set(height * 0.75, height * 1.5, 1); shadow.position.y = 0.03; shadow.renderOrder = 1; root.add(shadow);

  const mixer = new THREE.AnimationMixer(model), act = {}, w = {};
  for (const clip of gltf.animations) { if (clip.name.includes('|')) continue; const x = mixer.clipAction(clip); x.play(); x.setEffectiveWeight(0); act[clip.name] = x; w[clip.name] = 0; }
  act.Death.setLoop(THREE.LoopOnce); act.Death.clampWhenFinished = true;
  const blend = (target, dt, sp = 6) => { const kk = Math.min(1, dt * sp); for (const nm of Object.keys(act)) { w[nm] += ((target[nm] || 0) - w[nm]) * kk; act[nm].setEffectiveWeight(w[nm]); } };

  const d = { root, state: 'idle', yaw: Math.PI, speed: 0, happy: 0, petT: 0, awayT: 0, lieT: 0, pickT: 0, barkT: 0, headPos: new V3(), mouth: new V3(), act, command: null, fetched: 0, petted: false,
    stay: null, // точка, где пёс стоит, когда гостя рядом нет
    bark() { d.barkT = 0.9; act.Attack.reset(); W.fx.sound('bark'); },
    lie() { if (d.state !== 'lie') { d.state = 'lie'; d.lieT = 0; act.Death.reset(); act.Death.timeScale = 0.55; W.net.event('пёс лёг', {}); } },
    up() { if (d.state === 'lie') { d.state = 'idle'; W.net.event('пёс встал', {}); } },
    come() { d.up(); d.command = { to: 'guest', stop: 3.0 }; },
  };
  // команда Fable псу (действие dog вешает на большого пса локация 2: псов в мире два)
  d.order = (cmd) => { if (cmd === 'bark') d.bark(); else if (cmd === 'lie' || cmd === 'sit') d.lie(); else if (cmd === 'up') d.up(); else if (cmd === 'come') d.come(); else if (cmd === 'fetch' && ball) { d.up(); d.state = 'chase'; } else throw new Error('команды псу: come, lie, up, bark, fetch'); };

  const tmp = new V3(), fwd = new V3();
  function steer(tx, tz, stop, dt, fast) {
    const p = root.position, dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
    if (dist <= stop) { d.speed += (0 - d.speed) * Math.min(1, dt * 6); return true; }
    let dy = Math.atan2(dx, dz) - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    d.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 3.2 * dt);
    const want = Math.abs(dy) > 1.1 ? 0.6 : fast && dist - stop > 3.5 ? 7.5 : Math.min(2.6, 0.8 + (dist - stop) * 1.5);
    d.speed += (want - d.speed) * Math.min(1, dt * 3.5);
    p.x += Math.sin(d.yaw) * d.speed * dt; p.z += Math.cos(d.yaw) * d.speed * dt;
    const r = Math.hypot(p.x, p.z); if (r > bounds) { p.x *= bounds / r; p.z *= bounds / r; }
    return false;
  }
  const face = (tx, tz, dt) => { let dy = Math.atan2(tx - root.position.x, tz - root.position.z) - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); d.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 2 * dt); };
  let stepT = 0, eventT = -99;
  // Не пускает голову гостя внутрь стоящего пса (изнутри шкура прозрачная): выталкивает из полосы вдоль туловища, плавно — не быстрее 2 м/с.
  d.keepOut = (pos, dt) => {
    if (d.speed > 0.6 || d.state === 'lie') return pos;
    const p = root.position, fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), R = height * 0.26;
    const front = (d.headPos.x - p.x) * fx + (d.headPos.z - p.z) * fz + height * 0.1, along = THREE.MathUtils.clamp((pos.x - p.x) * fx + (pos.z - p.z) * fz, -height * 0.52, front);
    const dx = pos.x - (p.x + fx * along), dz = pos.z - (p.z + fz * along), dist = Math.hypot(dx, dz);
    if (dist >= R) return pos; const k = Math.min(R - dist, 2 * dt) / (dist || 1); pos.x += (dist ? dx : -fz) * k; pos.z += (dist ? dz : fx) * k; return pos;
  };

  d.update = (dt) => {
    const S = W.head.pos, p = root.position, bt = ball?.body.translation();
    const distS = Math.hypot(S.x - p.x, S.z - p.z);
    // рука на псе: рядом с головой или с туловищем
    fwd.set(Math.sin(d.yaw), 0, Math.cos(d.yaw)); let touching = null;
    for (const h of W.input.hands) {
      tmp.subVectors(h.pos, p); const along = THREE.MathUtils.clamp(tmp.dot(fwd), -height * 0.55, height * 0.55);
      const cx = p.x + fwd.x * along, cz = p.z + fwd.z * along, cy = p.y + (d.state === 'lie' ? height * 0.22 : height * 0.55);
      const body = Math.hypot(h.pos.x - cx, h.pos.z - cz) < height * 0.3 && Math.abs(h.pos.y - cy) < height * 0.45;
      if (body || h.pos.distanceTo(d.headPos) < height * 0.3) touching = h;
    }
    const busy = d.state === 'chase' || d.state === 'carry';
    if (touching && !busy) {
      d.petT += dt; d.awayT = 0; d.happy = Math.min(1, d.happy + dt); if (Math.sin(W.t * 40) > 0.6) W.input.pulse(touching, 0.25, 20);
      if (!d.petted || W.t - eventT > 30) { d.petted = true; eventT = W.t; W.net.event('гость гладит пса', {}, true); W.fx.sound('pant'); }
      if (d.state === 'idle') d.state = 'pet';
      if (d.petT > 2.2 && d.state === 'pet') d.lie();
    } else { d.awayT += dt; d.happy = Math.max(0, d.happy - dt * 0.2); if (d.state === 'pet' && d.awayT > 1.5) { d.state = 'idle'; d.petT = 0; } if (d.state === 'lie' && d.awayT > 7 && d.lieT > 4) { d.up(); d.petT = 0; } }

    const target = {};
    if (d.state === 'idle' || d.state === 'pet') {
      if (d.command) { if (steer(d.command.to === 'guest' ? S.x : d.command.to.x, d.command.to === 'guest' ? S.z : d.command.to.z, d.command.stop, dt, true)) d.command = null; }
      else if (d.state === 'idle' && distS > 9 && distS < 60) steer(S.x, S.z, 4.5, dt, true);
      else { d.speed += (0 - d.speed) * Math.min(1, dt * 6); if (distS < 40 && distS > height * 0.9) face(S.x, S.z, dt); } // вплотную пёс стоит смирно: не разворачивает трёхметровое тело под рукой гостя
      // мяч брошен — пёс срывается за ним
      if (ball && !ball.grab.held && d.state === 'idle') { const v = ball.body.linvel(); if (Math.hypot(v.x, v.y, v.z) > 2.2 && Math.hypot(bt.x - S.x, bt.z - S.z) > 1.5) { d.state = 'chase'; d.bark(); } }
    } else if (d.state === 'chase') {
      if (ball.grab.held) d.state = 'idle';
      else if (steer(bt.x, bt.z, height * 0.62, dt, true) || Math.hypot(bt.x - p.x, bt.z - p.z) < height * 0.75) { d.pickT += dt; target.Eating = 1.6; if (d.pickT > 0.45) { d.state = 'carry'; d.pickT = 0; ball.body.setBodyType(2, true); W.fx.sound('pop', 0.6); } } else d.pickT = 0;
    } else if (d.state === 'carry') {
      const arrived = steer(S.x, S.z, 3.4, dt, true);
      ball.body.setNextKinematicTranslation(d.mouth); ball.obj.position.copy(d.mouth);
      if (arrived) { d.pickT += dt; target.Eating = 1.6; if (d.pickT > 0.7) {
        d.pickT = 0; d.state = 'idle'; d.fetched++; ball.body.setBodyType(0, true);
        tmp.set(S.x - d.mouth.x, 0, S.z - d.mouth.z).normalize(); ball.body.setLinvel({ x: tmp.x * 2.2, y: 1.2, z: tmp.z * 2.2 }, true);
        d.bark(); W.net.event('пёс принёс мяч', { раз: d.fetched }, d.fetched === 1); } }
      if (ball.grab.held) { d.state = 'idle'; }
    }
    // движения
    const sp = d.speed;
    if (d.state === 'lie') { d.lieT += dt; target.Death = 1; }
    else if (sp > 3.2) { target.Gallop = 1; act.Gallop.timeScale = 0.55 + sp * 0.06; stepT -= dt; if (stepT <= 0) { stepT = 0.36; W.fx.sound('thud'); } }
    else if (sp > 0.25) { target.Walk = 1; act.Walk.timeScale = 0.5 + sp * 0.3; }
    else if (!target.Eating) { if (d.state === 'pet') target.Idle_2_HeadLow = 1; else { target.Idle = 1; target.Idle_2 = 0.4; } }
    if (d.barkT > 0) { d.barkT -= dt; target.Attack = 1.2; }
    blend(target, dt, d.state === 'lie' ? 3 : 7); mixer.update(dt);
    // хвост виляет тем сильнее, чем пёс довольнее
    const wag = (0.12 + 0.5 * d.happy + (d.state === 'carry' ? 0.3 : 0)) * Math.sin(W.t * (7 + 9 * d.happy));
    for (const tb of tail) tb.rotateY(wag * 0.5);
    p.y = groundY(p.x, p.z); root.rotation.y = d.yaw; root.updateMatrixWorld(true);
    bones.Head.getWorldPosition(d.headPos); d.mouth.copy(d.headPos).addScaledVector(fwd, height * 0.17); d.mouth.y -= height * 0.05;
    uni.uWind.value.set(Math.sin(W.t * 1.3) * 0.1, Math.cos(W.t * 0.9) * 0.08, -0.4); // шерсть чуть свисает (низ у шкуры — минус z) и шевелится
    shadow.material.opacity = d.state === 'lie' ? 0.8 : 1;
  };
  return d;
}
