// Баскетбольный автомат: раунд — по 3 броска, у кого больше попаданий; при ничьей — по одному броску до перевеса.
// гость бросает рукой; броски Fable считает местная программа. H.mode: 'win' — попаданий на одно больше, чем у гостя, 'lose' — на одно меньше, 'fair' — меткость H.skill и разброс.
import * as THREE from 'three';
import { makeWorld } from './physics.js';

const V3 = THREE.Vector3;
const BR = 0.12, RING_R = 0.235, RING_Y = 2.25, SHOTS = 3;

// x, z — где стоит игрок; кольцо в dist метрах перед ним (в сторону минус z)
export async function makeHoops(W, parent, { x = 0, z = 0, dist = 2.9 } = {}) {
  const phys = await makeWorld(); const { RAPIER } = phys; const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  const ringZ = -dist, neon = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16161f, roughness: 0.5 });
  // корпус автомата: стойка, щит, кольцо, сетка, наклонный пол, по которому мячи катятся назад
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3.1, 0.12), dark); back.position.set(0, 1.55, ringZ - 0.52); g.add(back);
  const bbTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 384; const cx = c.getContext('2d'); cx.fillStyle = '#f4f4f8'; cx.fillRect(0, 0, 512, 384); cx.strokeStyle = '#ff2a5a'; cx.lineWidth = 14; cx.strokeRect(7, 7, 498, 370); cx.strokeRect(166, 190, 180, 130); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const bb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.04), new THREE.MeshStandardMaterial({ map: bbTex, roughness: 0.3 })); bb.position.set(0, RING_Y + 0.33, ringZ - RING_R - 0.14); g.add(bb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.014, 10, 40), neon(0xff7a1a)); ring.rotation.x = Math.PI / 2; ring.position.set(0, RING_Y, ringZ); g.add(ring);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(RING_R, RING_R * 0.62, 0.36, 16, 4, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 })); net.position.set(0, RING_Y - 0.18, ringZ); g.add(net);
  for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, dist - 0.9), dark); side.position.set(s * 0.85, 1.1, ringZ / 2 - 0.55); g.add(side); const tube = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, dist - 0.9), neon(s < 0 ? 0x2ee6ff : 0xff3ea5)); tube.position.set(s * 0.85, 2.22, ringZ / 2 - 0.55); g.add(tube); }
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.05, dist - 0.5), new THREE.MeshStandardMaterial({ color: 0x23233a, roughness: 0.7 })); ramp.position.set(0, 0.92, ringZ / 2 - 0.45); ramp.rotation.x = 0.2; g.add(ramp); // нижний край — у игрока: мячи скатываются к лотку
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.3, 0.08), dark); tray.position.set(0, 0.75, -0.62); g.add(tray);
  const light = new THREE.PointLight(0xffe8d0, 2.2, 5, 1.6); light.position.set(0, 2.6, ringZ + 1.2); g.add(light);
  const c = document.createElement('canvas'); c.width = 768; c.height = 256; const cx = c.getContext('2d'); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sb = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); sb.position.set(0, 3.0, ringZ - 0.45); g.add(sb);
  // тела (в координатах автомата)
  phys.fixed(RAPIER.ColliderDesc.cuboid(4, 0.5, 6), 0, -0.5, -2);
  phys.fixed(RAPIER.ColliderDesc.cuboid(0.6, 0.45, 0.02).setRestitution(0.55), 0, RING_Y + 0.33, ringZ - RING_R - 0.12);
  phys.fixed(RAPIER.ColliderDesc.cuboid(0.85, 1.55, 0.06).setRestitution(0.3), 0, 1.55, ringZ - 0.5);
  for (const s of [-1, 1]) phys.fixed(RAPIER.ColliderDesc.cuboid(0.03, 1.1, (dist - 0.9) / 2).setRestitution(0.4), s * 0.85, 1.1, ringZ / 2 - 0.55);
  phys.fixed(RAPIER.ColliderDesc.cuboid(0.82, 0.025, (dist - 0.5) / 2).setRotation(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), 0.2)).setFriction(0.3).setRestitution(0.5), 0, 0.92, ringZ / 2 - 0.45);
  phys.fixed(RAPIER.ColliderDesc.cuboid(0.82, 0.15, 0.04), 0, 0.75, -0.62);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; phys.fixed(RAPIER.ColliderDesc.ball(0.014).setRestitution(0.5), Math.cos(a) * RING_R, RING_Y, ringZ + Math.sin(a) * RING_R); }

  const ballTex = (() => { const cc = document.createElement('canvas'); cc.width = 256; cc.height = 128; const b = cc.getContext('2d'); b.fillStyle = '#e0701c'; b.fillRect(0, 0, 256, 128); b.strokeStyle = '#201008'; b.lineWidth = 4; for (const u of [0, 64, 128, 192]) { b.beginPath(); b.moveTo(u, 0); b.lineTo(u, 128); b.stroke(); } b.beginPath(); b.moveTo(0, 64); b.lineTo(256, 64); b.stroke(); const t = new THREE.CanvasTexture(cc); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const balls = [-0.45, 0, 0.45].map((bx, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(BR, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.7 })); m.name = 'баскетбольный мяч'; m.position.set(bx, 0.9, -0.9); g.add(m);
    const { body } = phys.dynamic(m, RAPIER.ColliderDesc.ball(BR).setRestitution(0.72).setFriction(0.6).setDensity(60), { linDamp: 0, angDamp: 0.3 });
    const b = { i, m, body, home: [bx, 0.9, -0.9], prevY: 0.9, live: false, scored: false, by: null };
    b.grab = W.input.addGrab(m, { name: 'баскетбольный мяч', r: 0.22, body, throwBoost: 1.35, localBody: true, far: true, farDist: 3,
      onGrab() { if (!H.active && H.state !== 'over') H.start(); b.live = false; },
      onRelease(h, v) { if (v.length() > 1.5 && H.active && H.turn === 0 && H.left[0] > balls.filter((q) => q.live && q.by === 0).length) { b.live = true; b.scored = false; b.by = 0; b.t = 0; b.forced = null; } } });
    return b; });

  const H = { g, balls, active: false, state: 'idle', turn: 0, left: [SHOTS, SHOTS], score: [0, 0], t: 0, skill: 0.6, next: 0, mode: 'fair', plan: null, sd: false };
  function draw() { cx.fillStyle = '#07060d'; cx.fillRect(0, 0, 768, 256); cx.textBaseline = 'middle'; cx.font = '700 56px "Segoe UI"';
    [(W.cfg.guest || 'Гость').toUpperCase(), (W.cfg.host || 'Fable').toUpperCase()].forEach((n, i) => { const on = H.active && H.turn === i; cx.fillStyle = on ? '#2ee6ff' : '#e8e8f4'; cx.textAlign = 'left'; cx.fillText((on ? '▶ ' : '   ') + n, 16, 70 + i * 110); cx.fillStyle = '#8b8fa8'; cx.font = '600 38px "Segoe UI"'; cx.fillText('●'.repeat(H.left[i]) + '○'.repeat(SHOTS - H.left[i]), 330, 70 + i * 110); cx.fillStyle = '#fff36b'; cx.font = '700 80px "Segoe UI"'; cx.textAlign = 'right'; cx.fillText(String(H.score[i]), 750, 70 + i * 110); cx.font = '700 56px "Segoe UI"'; });
    tex.needsUpdate = true; }
  H.start = () => { H.active = true; H.state = 'play'; H.turn = 0; H.sd = false; H.plan = null; H.left = [SHOTS, SHOTS]; H.score = [0, 0]; draw(); W.fx.sound('win'); W.net.event('баскетбол начался', { бросков: SHOTS, ходит: 'гость' }, true); };
  function shotDone(b, made) {
    const i = b.by; b.live = false; if (made) { H.score[i] += 1; W.fx.sound('swish'); W.fx.sound('win'); } H.left[i]--;
    W.net.event('баскетбол: бросок', { кто: i ? 'Fable' : 'гость', попал: made, счёт: `гость ${H.score[0]} : ${H.score[1]} Fable`, осталось: H.left[i] }, false);
    if (H.left[i] <= 0) { if (i === 0) { H.turn = 1; H.next = H.t + 2.2; W.fable.moveTo(new V3(x + 0.75, 0, z + 0.55)); const n = H.sd ? 1 : SHOTS;
        // исход, подобранный заранее: сколько из своих бросков Fable забьёт
        if (H.mode === 'fair') H.plan = null; else { const d = H.score[0] - H.score[1], k = Math.max(0, Math.min(n, H.mode === 'win' ? d + 1 : d - 1)); H.plan = Array.from({ length: n }, (_, j) => j < k).sort(() => Math.random() - 0.5); }
        W.net.event(`баскетбол: твои броски (${n})`, { 'счёт': `гость ${H.score[0]} : ${H.score[1]} Fable` }, true); }
      else if (H.score[0] === H.score[1]) { H.sd = true; H.turn = 0; H.left = [1, 1]; W.net.event('баскетбол: ничья, по одному броску до перевеса', { счёт: `${H.score[0]} : ${H.score[1]}` }); }
      else { H.active = false; H.state = 'over'; const [a, c2] = H.score; W.net.event('баскетбол окончен', { счёт: `гость ${a} : ${c2} Fable`, победил: a > c2 ? 'гость' : 'Fable' }, true); H.onOver?.(a > c2 ? 0 : 1); } }
    draw();
  }
  // бросок Fable: скорость считается так, чтобы мяч прошёл через кольцо; мастерство задаёт разброс
  function fableShot() {
    const b = balls.find((q) => !q.live && !q.grab.held) || balls[0]; const from = new V3(0.5, 1.75, 0.35), to = new V3(0, RING_Y + 0.05, ringZ), T = 0.95;
    const forced = H.plan?.length ? H.plan.shift() : null, miss = forced == null ? Math.random() > H.skill : !forced, e = miss ? 0.26 + Math.random() * 0.16 : forced ? 0 : 0.035;
    const v = new V3((to.x - from.x) / T + (Math.random() - 0.5) * e * 2, (to.y - from.y) / T + 4.905 * T + (Math.random() - 0.5) * e, (to.z - from.z) / T + (miss ? (Math.random() < 0.5 ? -1 : 1) * e * 2 : (Math.random() - 0.5) * e));
    b.body.setBodyType(0, true); phys.place(b.body, from.x, from.y, from.z); b.body.setLinvel(v, true); b.body.setAngvel({ x: -6, y: 0, z: 0 }, true); b.live = true; b.scored = false; b.by = 1; b.t = 0; b.forced = forced; W.fable.do('right'); W.fx.sound('whoosh');
  }
  W.actions.hoops = (cmd) => { if (cmd === 'stop') { H.active = false; H.state = 'idle'; draw(); } else H.start(); };
  W.actions.hoopSkill = (k) => { if (!Number.isFinite(Number(k))) throw new Error('меткость — число от 0 до 1'); H.skill = Math.max(0, Math.min(1, Number(k))); };
  let bounceT = 0;
  H.update = (dt) => {
    phys.step(dt); H.t += dt;
    for (const b of balls) {
      const t = b.body.translation(), v = b.body.linvel();
      if (b.live) { b.t += dt;
        if (b.forced != null) { if ((b.prevY > RING_Y && t.y <= RING_Y && v.y < 0) || b.t > 3.2) { b.scored = b.forced; shotDone(b, b.forced); } } // исход этого броска задан заранее, траектория ему соответствует
        else if (!b.scored && b.prevY > RING_Y && t.y <= RING_Y && v.y < 0 && Math.hypot(t.x, t.z - ringZ) < RING_R - 0.02) { b.scored = true; shotDone(b, true); }
        else if (b.t > 3.2 || (t.y < 1.0 && b.t > 0.8)) shotDone(b, false); }
      if (t.y < 0.3 && Math.abs(v.y) > 1 && W.t - bounceT > 0.15) { bounceT = W.t; W.fx.sound('bounce'); }
      // мяч выкатился из автомата или затих — вернуть в лоток
      if (!b.grab.held && !b.live && !b.body.isKinematic() && (t.y < 0.6 || Math.abs(t.x) > 0.95 || t.z > 0.4 || t.z < ringZ - 0.6) && Math.hypot(v.x, v.y, v.z) < 6) { b.rest = (b.rest || 0) + dt; if (b.rest > 1.2) { b.rest = 0; phys.place(b.body, b.home[0], b.home[1], b.home[2]); } } else b.rest = 0;
      b.prevY = t.y;
    }
    if (H.active && H.turn === 1 && H.left[1] > 0 && H.t > H.next && !balls.some((b) => b.live && b.by === 1)) { H.next = H.t + 1.9; fableShot(); }
  };
  H.describe = () => (H.active ? `баскетбол: бросает ${H.turn ? 'Fable' : 'гость'}, счёт ${H.score[0]}:${H.score[1]}` : H.state === 'over' ? `баскетбол окончен ${H.score[0]}:${H.score[1]}` : 'баскетбол ждёт: мячи в лотке');
  H.selftest = async () => {
    const wait = (s) => new Promise((r) => setTimeout(r, s * 1000)), mode0 = H.mode, over = H.onOver; H.onOver = null; H.mode = 'win'; H.start(); const sk = H.skill;
    // броски «за гостя» по расчётной траектории: проверяем кольцо и счёт
    for (let k = 0; k < SHOTS; k++) { const b = balls[k % 3], from = new V3(0, 1.6, 0.3), to = new V3(0, RING_Y + 0.05, ringZ), T = 0.95; b.body.setBodyType(0, true); phys.place(b.body, from.x, from.y, from.z);
      b.body.setLinvel({ x: 0, y: (to.y - from.y) / T + 4.905 * T, z: (to.z - from.z) / T }, true); b.live = true; b.scored = false; b.by = 0; b.t = 0; b.forced = null; await wait(1.9); }
    const mine = H.score[0]; let t = 0; while (H.active && !H.sd && t < 25) { await wait(0.5); t += 0.5; } const [a, c2] = H.score, tie = H.sd; H.active = false; H.state = 'idle'; H.skill = sk; H.mode = mode0; H.onOver = over; draw();
    return [{ name: 'мяч попадает в кольцо', ok: mine >= 2, info: `${mine} из ${SHOTS}` }, { name: 'режим «победа»: Fable забил больше (или ничья при трёх из трёх)', ok: mine === SHOTS ? tie && c2 === a : c2 === a + 1, info: `гость ${a} : ${c2} Fable` }];
  };
  draw();
  return H;
}
