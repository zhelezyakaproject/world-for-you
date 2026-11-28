// Боулинг против Fable: дорожка, десять кеглей, счёт. гость бросает рукой; бросок Fable делает быстрая местная программа.
// Раунд — один кадр: два броска гостя, два броска Fable; при ничьей — переброс по одному броску.
// Как играет Fable, задаёт G.mode: 'fair' (так стоит с начала) — честная физика с разбросом и тактикой Fable; 'win' — исход подобран под победу, 'lose' — под проигрыш.
import * as THREE from 'three';
import { makeWorld } from './physics.js';

const V3 = THREE.Vector3;
const PIN_H = 0.38, PIN_R = 0.058, BALL_R = 0.109;

function pinMesh() {
  const pts = [[0.001, 0], [0.028, 0], [0.034, 0.02], [0.058, 0.09], [0.06, 0.12], [0.05, 0.19], [0.026, 0.265], [0.024, 0.29], [0.033, 0.33], [0.03, 0.36], [0.016, 0.378], [0.001, 0.38]].map(([x, y]) => new THREE.Vector2(x, y - PIN_H / 2));
  const g = new THREE.Group(); const white = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.25 });
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 20), white));
  for (const y of [0.262, 0.286]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0265, 0.0265, 0.012, 20), new THREE.MeshStandardMaterial({ color: 0xd4182c, roughness: 0.4 })); s.position.y = y - PIN_H / 2; g.add(s); }
  return g;
}
function board(w, h) { const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); return { m, c, x: c.getContext('2d'), tex }; }

// x — ось дорожки, z0 — линия броска (дорожка уходит в минус z), len — длина до первой кегли
export async function makeBowling(W, parent, { x = 0, z0 = 0, len = 10, frames = 1 } = {}) {
  const phys = await makeWorld(); const { RAPIER } = phys; const g = new THREE.Group(); g.position.set(x, 0, 0); parent.add(g);
  const LW = 1.07, zPin = z0 - len, zEnd = zPin - 1.6;
  // дорожка: светлое дерево с бликом, бортики вместо желобов — шар не теряется
  const laneTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const cx = c.getContext('2d'); for (let i = 0; i < 26; i++) { const v = 196 + Math.random() * 30; cx.fillStyle = `rgb(${v + 20},${v - 12},${v - 70})`; cx.fillRect(i * 10, 0, 10, 1024); } cx.fillStyle = '#3a2a1c'; for (const ax of [60, 94, 128, 162, 196]) { cx.beginPath(); cx.moveTo(ax, 700); cx.lineTo(ax - 5, 716); cx.lineTo(ax + 5, 716); cx.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const lane = new THREE.Mesh(new THREE.BoxGeometry(LW, 0.1, len + 3.2), new THREE.MeshStandardMaterial({ map: laneTex, roughness: 0.16, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); lane.position.set(0, -0.05, z0 - (len + 3.2) / 2 + 1.4); g.add(lane);
  const foul = new THREE.Mesh(new THREE.PlaneGeometry(LW, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2a5a, toneMapped: false })); foul.rotation.x = -Math.PI / 2; foul.position.set(0, 0.008, z0); g.add(foul);
  const neon = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, len + 3.2), new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.5 })); b.position.set(s * (LW / 2 + 0.035), 0.07, lane.position.z); g.add(b);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, len + 3.2), neon(s < 0 ? 0xff3ea5 : 0x2ee6ff)); tube.position.set(s * (LW / 2 + 0.035), 0.15, lane.position.z); g.add(tube); }
  const pit = new THREE.Mesh(new THREE.BoxGeometry(LW + 0.6, 1.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x0a0a12 })); pit.position.set(0, 0.75, zEnd - 0.05); g.add(pit);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(LW + 0.6, 0.5, 2.2), new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.6 })); hood.position.set(0, 1.35, zPin - 0.6); g.add(hood);
  const pinLight = new THREE.PointLight(0xfff2dd, 6, 5, 1.6); pinLight.position.set(0, 1.0, zPin + 0.5); g.add(pinLight);
  // тела: всё в координатах дорожки, группа g сдвигает картинку на место
  phys.fixed(RAPIER.ColliderDesc.cuboid(LW / 2 + 0.4, 0.5, (len + 6) / 2).setFriction(0.14), 0, -0.5, z0 - (len + 6) / 2 + 3);
  for (const s of [-1, 1]) phys.fixed(RAPIER.ColliderDesc.cuboid(0.035, 0.3, (len + 6) / 2).setRestitution(0.4), s * (LW / 2 + 0.035), 0.3, z0 - (len + 6) / 2 + 3);
  phys.fixed(RAPIER.ColliderDesc.cuboid(LW, 1, 0.1).setRestitution(0.1), 0, 1, zEnd);
  phys.fixed(RAPIER.ColliderDesc.cuboid(LW, 1, 0.1), 0, 1, z0 + 3);

  const spots = []; for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) spots.push([(i - r / 2) * 0.305, zPin - r * 0.264]);
  const pins = spots.map(([px, pz], i) => { const m = pinMesh(); m.position.set(px, PIN_H / 2, pz); g.add(m);
    const { body } = phys.dynamic(m, RAPIER.ColliderDesc.cylinder(PIN_H / 2, PIN_R * 0.82).setDensity(480).setFriction(0.35).setRestitution(0.35), { linDamp: 0.15, angDamp: 0.25 });
    return { i, m, body, spot: [px, pz], down: false, out: false }; });
  const mkBall = (color, name) => { const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.3 })); m.name = name; g.add(m);
    for (const [a, b] of [[0.3, 0.2], [0.3, -0.2], [0.55, 0]]) { const h = new THREE.Mesh(new THREE.CircleGeometry(0.013, 12), new THREE.MeshBasicMaterial({ color: 0x050505 })); h.position.setFromSphericalCoords(BALL_R + 0.0005, a, b); h.lookAt(h.position.clone().multiplyScalar(2)); m.add(h); }
    const { body } = phys.dynamic(m, RAPIER.ColliderDesc.ball(BALL_R).setDensity(1100).setFriction(0.18).setRestitution(0.12), { linDamp: 0.02, angDamp: 0.05 }); return { m, body }; };
  const RACK = [0.95, 0.86, z0 + 0.55]; // стойка с шаром справа от линии броска
  const rack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.74, 20), new THREE.MeshStandardMaterial({ color: 0x1b1b26, roughness: 0.4 })); rack.position.set(RACK[0], 0.37, RACK[2]); g.add(rack);
  const cup = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 24), neon(0x2ee6ff)); cup.rotation.x = Math.PI / 2; cup.position.set(RACK[0], 0.75, RACK[2]); g.add(cup);
  const mine = mkBall(0x1f56e0, 'шар для боулинга'), his = mkBall(0xff7a1a, 'шар Fable');
  const park = (b, on) => { b.body.setBodyType(on ? 2 : 0, true); };
  const toRack = () => { park(mine, true); mine.body.setTranslation({ x: RACK[0], y: RACK[1], z: RACK[2] }, true); mine.m.position.set(...RACK); };
  const hide = (b) => { park(b, true); b.body.setTranslation({ x: 3, y: -5, z: 0 }, true); b.m.position.set(3, -5, 0); };

  // табло
  const sb = board(2.6, 0.9); sb.m.position.set(0, 2.05, zPin - 0.2); g.add(sb.m);
  const G = { g, phys, pins, mine, his, active: false, frame: 1, frames, turn: 0, roll: 1, score: [0, 0], marks: [[], []], state: 'idle', mode: 'fair', tb: false, forced: null, t: 0, standing: 10, lastKnock: 0, plan: null, last: null, lane: { x, z0, zPin } };
  const names = [(W.cfg.guest || 'Гость').toUpperCase(), (W.cfg.host || 'Fable').toUpperCase()];
  function draw() { const c = sb.x; c.fillStyle = '#07060d'; c.fillRect(0, 0, sb.c.width, sb.c.height); c.textBaseline = 'middle';
    c.font = '700 52px "Segoe UI"'; c.fillStyle = '#ff3ea5'; c.fillText('БОУЛИНГ', 30, 44); c.fillStyle = '#8b8fa8'; c.font = '600 34px "Segoe UI"'; c.fillText(G.active ? G.tb ? 'ничья · переброс' : `кадр ${G.frame} из ${G.frames} · бросок ${G.roll}` : G.state === 'over' ? 'игра окончена' : 'возьми шар со стойки', 330, 46);
    names.forEach((n, i) => { const y = 150 + i * 110, on = G.active && G.turn === i; c.fillStyle = on ? '#2ee6ff' : '#e8e8f4'; c.font = '700 64px "Segoe UI"'; c.fillText((on ? '▶ ' : '   ') + n, 24, y);
      c.font = '600 44px "Segoe UI"'; c.fillStyle = '#b9bcd6'; c.fillText(G.marks[i].join(' '), 420, y); c.fillStyle = '#fff36b'; c.font = '700 84px "Segoe UI"'; c.textAlign = 'right'; c.fillText(String(G.score[i]), 1000, y); c.textAlign = 'left'; });
    sb.tex.needsUpdate = true; }
  function resetPins(all) { for (const p of pins) { if (all) { p.down = false; p.out = false; }
    if (p.out) { p.body.setBodyType(2, true); p.body.setTranslation({ x: p.spot[0], y: -3, z: p.spot[1] }, true); p.m.position.set(p.spot[0], -3, p.spot[1]); continue; }
    p.body.setBodyType(0, true); phys.place(p.body, p.spot[0], PIN_H / 2 + 0.002, p.spot[1]); } G.standing = pins.filter((p) => !p.out).length; }
  const up = new V3();
  const fallen = () => pins.filter((p) => { if (p.out) return false; const r = p.body.rotation(), t = p.body.translation(); up.set(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)); return up.y < 0.82 || t.y < 0.1 || Math.hypot(t.x - p.spot[0], t.z - p.spot[1]) > 0.28; });

  G.start = (n) => { G.frames = n || frames; G.tb = false; G.forced = null; G.active = true; G.frame = 1; G.turn = 0; G.roll = 1; G.score = [0, 0]; G.marks = [[], []]; G.state = 'aim'; resetPins(true); toRack(); hide(his); draw(); W.fx.sound('win'); W.net.event('боулинг начался', { кадров: G.frames, ходит: 'гость' }, true); };
  G.stop = () => { G.active = false; G.state = 'idle'; draw(); };
  function launched(who) { G.state = 'rolling'; G.t = 0; G.rollBy = who; W.fx.sound('roll'); }
  // бросок Fable: aim — 'центр' | 'левее' | 'правее', power — 'мягко' | 'сильно'
  G.fableRoll = (plan = {}) => { if (!G.active || G.turn !== 1 || G.state !== 'aim') return false; G.state = 'windup'; G.t = 0; G.plan = plan; W.fable.do('right'); return true; };
  // исход, подобранный заранее: сколько кеглей упадёт этим броском, чтобы после кадра Fable был впереди (win) или позади (lose)
  function planPins() {
    if (G.roll === 2) return G.rest;
    const d = G.score[0] - G.score[1], rnd = (n) => (Math.random() * (n + 1)) | 0; let total;
    if (G.mode === 'win') total = d < 0 ? 5 + rnd(3) : d <= 8 ? Math.min(9, d + 1 + rnd(2)) : d <= 11 && !G.tb ? 11 : 10; // 11 — добить вторым броском, 10 — все кегли первым
    else total = d <= 0 ? 0 : Math.max(0, Math.min(9, d - 1 - rnd(2)));
    if (total === 10 || G.tb) { G.rest = 0; return Math.min(10, total); }
    if (total === 11) { const a = 6 + rnd(2); G.rest = 10 - a; return a; }
    const a = Math.ceil(total * (0.55 + Math.random() * 0.3)); G.rest = total - a; return a;
  }
  function releaseFable() { const p = G.plan || {};
    if (G.mode !== 'fair') {
      const k = planPins(), ax = (Math.random() - 0.5) * 0.12, standing = pins.filter((q) => !q.out);
      const chosen = [...standing].sort((a, b) => (b.spot[1] - a.spot[1]) || Math.abs(a.spot[0] - ax) - Math.abs(b.spot[0] - ax)).slice(0, k);
      for (const q of standing) if (!chosen.includes(q)) q.body.setBodyType(1, true); // эти кегли устоят
      G.forced = { chosen, hit: 0 }; const sp = k ? 8.2 : 3.2; his.body.setLinearDamping(k ? 0.02 : 1.1); // «ноль» — шар не докатывается
      park(his, false); phys.place(his.body, ax, BALL_R + 0.01, z0 - 0.4); his.body.setLinvel({ x: 0, y: 0, z: -sp }, true); his.body.setAngvel({ x: -sp / BALL_R, y: 0, z: 0 }, true); return launched(1);
    }
    his.body.setLinearDamping(0.02); const aim = ({ левее: -0.16, правее: 0.16, центр: 0 })[p.aim] ?? 0.035, sp = p.power === 'мягко' ? 6.2 : p.power === 'сильно' ? 10.5 : 8.2;
    const ox = aim + (Math.random() - 0.5) * 0.2, drift = (Math.random() - 0.5) * 0.28;
    park(his, false); phys.place(his.body, ox, BALL_R + 0.01, z0 - 0.4); his.body.setLinvel({ x: drift, y: 0, z: -sp }, true); his.body.setAngvel({ x: -sp / BALL_R, y: 0, z: 0 }, true); launched(1); }
  function settle() {
    const down = G.forced ? G.forced.chosen : fallen(); G.forced = null; for (const p of down) p.out = true; const k = down.length, left = pins.filter((p) => !p.out).length, i = G.turn;
    const strike = G.roll === 1 && left === 0, spare = G.roll === 2 && left === 0;
    G.score[i] += k + (strike ? 5 : spare ? 2 : 0); G.marks[i].push(strike ? 'X' : spare ? '/' : String(k));
    W.fx.sound(strike ? 'win' : k ? 'pop' : 'lose'); G.last = { кто: i ? 'Fable' : 'гость', сбито: k, осталось: left, страйк: strike };
    const endTurn = strike || G.roll === 2 || G.tb;
    if (endTurn) { G.roll = 1; if (i === 1) G.frame++; G.turn = 1 - i; resetPins(true); } else { G.roll = 2; resetPins(false); }
    hide(his); toRack();
    if (G.frame > G.frames && G.score[0] === G.score[1]) { G.frames++; G.tb = true; W.net.event('боулинг: ничья, переброс по одному броску', { счёт: `${G.score[0]} : ${G.score[1]}` }); }
    if (G.frame > G.frames) { G.active = false; G.state = 'over'; const [a, b] = G.score; W.fx.sound('win'); W.net.event('боулинг окончен', { счёт: `гость ${a} : ${b} Fable`, победил: a > b ? 'гость' : 'Fable' }, true); G.onOver?.(a > b ? 0 : 1); }
    else { G.state = 'aim'; G.t = 0; W.net.event('боулинг: бросок', { ...G.last, счёт: `гость ${G.score[0]} : ${G.score[1]} Fable`, 'теперь ходит': G.turn ? 'Fable' : 'гость' }, G.turn === 1 && endTurn); if (G.turn === 1) { hide(mine); W.fable.moveTo(new V3(x + 0.55, 0, z0 + 0.9)); } }
    draw();
  }
  G.grab = W.input.addGrab(mine.m, { name: 'шар для боулинга', r: 0.2, body: mine.body, throwBoost: 1.45, localBody: true, far: true, farDist: 4, snap: true, holdDist: 0.11,
    onGrab() { if (!G.active && G.state !== 'rolling') G.start(); },
    onRelease(h, v) { if (G.active && G.turn === 0 && G.state === 'aim') { if (v.z < -0.8) { const b = mine.body.linvel(); mine.body.setLinvel({ x: b.x, y: Math.min(b.y, 0.6), z: Math.min(b.z, -3.2) }, true); launched(0); } } } });
  W.actions.bowling = (cmd) => { if (cmd === 'stop') G.stop(); else G.start(Number.isInteger(cmd) && cmd > 0 ? Math.min(cmd, 10) : undefined); };
  W.actions.bowl = (plan) => { if (!G.active) throw new Error('боулинг не идёт — начни: {"bowling":3}'); if (G.turn !== 1 || G.state !== 'aim') throw new Error('сейчас не твой бросок: ' + G.describe()); return G.fableRoll(plan && typeof plan === 'object' ? plan : {}); };

  let knockT = 0;
  G.update = (dt) => {
    phys.step(dt); G.t += dt;
    // предметы живут в координатах дорожки: physics ставит им position напрямую — это и есть местные координаты группы g
    if (G.state === 'windup' && G.t > 0.9) releaseFable();
    if (G.state === 'aim' && G.active && G.turn === 1 && G.t > 9) G.fableRoll({}); // Fable не выбрал тактику — бросает сам, игра не встаёт
    if (G.state === 'rolling') {
      const b = (G.rollBy ? his : mine).body, t = b.translation(), v = b.linvel(), sp = Math.hypot(v.x, v.y, v.z);
      if (G.forced && G.rollBy === 1) { const F = G.forced; if (!F.hit && t.z < zPin + 0.25) F.hit = G.t;
        if (F.hit) for (const q of F.chosen) { if (q.pushed === F.hit || G.t < F.hit + (zPin - q.spot[1]) * 0.25) continue; q.pushed = F.hit; // кегли, которым суждено упасть, падают наверняка: ряд за рядом
          const c = q.body.translation(); q.body.applyImpulseAtPoint({ x: (Math.random() - 0.5) * 2.4, y: 0, z: -3.2 }, { x: c.x, y: c.y + 0.12, z: c.z }, true); } }
      const moving = fallen().length; if (moving > G.lastKnock && W.t - knockT > 0.12) { knockT = W.t; W.fx.sound('crash'); } G.lastKnock = moving;
      if (!G.doneAt && (t.z < zPin - 1.2 || (sp < 0.2 && G.t > 1.5) || G.t > 10 || t.y < -1)) G.doneAt = G.t + 2.0;
      if (G.doneAt && G.t > G.doneAt) { G.doneAt = 0; G.lastKnock = 0; settle(); }
    }
    // шар гостя укатился не туда вне игры — вернуть на стойку
    if (G.state !== 'rolling' && !G.grab.held) { const t = mine.body.translation(); if (!mine.body.isKinematic() && (t.y < -1 || Math.abs(t.x) > 3 || t.z > z0 + 4)) toRack(); }
  };
  G.describe = () => (G.active ? `боулинг: кадр ${G.frame}/${G.frames}, ходит ${G.turn ? 'Fable' : 'гость'}, счёт ${G.score[0]}:${G.score[1]}` : G.state === 'over' ? `боулинг окончен ${G.score[0]}:${G.score[1]}` : 'боулинг ждёт: шар на стойке');
  G.selftest = async () => {
    const wait = (s) => new Promise((r) => setTimeout(r, s * 1000)), mode0 = G.mode, over = G.onOver, play = async (first) => { G.start(1); let t = 0, n = 0;
      while (G.active && t < 90) { if (G.turn === 0 && G.state === 'aim') { park(mine, false); phys.place(mine.body, n++ ? -0.1 : first, BALL_R + 0.01, z0 - 0.4); mine.body.setLinvel({ x: 0.05, y: 0, z: -8.5 }, true); launched(0); } await wait(0.25); t += 0.25; } return [...G.score]; };
    G.onOver = null; const res = [];
    G.mode = 'win'; { const [a, b] = await play(0.02); res.push({ name: 'режим «победа»: Fable впереди', ok: G.state === 'over' && b > a, info: `гость ${a} : ${b} Fable` }); }
    G.mode = 'lose'; { const [a, b] = await play(0.02); res.push({ name: 'режим «поддавки»: Fable позади', ok: G.state === 'over' && b < a, info: `гость ${a} : ${b} Fable` }); }
    G.mode = 'fair'; G.start(1);
    park(mine, false); phys.place(mine.body, 0.02, BALL_R + 0.01, z0 - 0.4); mine.body.setLinvel({ x: 0.05, y: 0, z: -8.5 }, true); launched(0);
    let t = 0; while (G.state === 'rolling' && t < 14) { await wait(0.25); t += 0.25; } const first = G.last?.сбито ?? -1;
    t = 0; while (G.active && t < 60) { if (G.turn === 0 && G.state === 'aim') { park(mine, false); phys.place(mine.body, -0.1, BALL_R + 0.01, z0 - 0.4); mine.body.setLinvel({ x: 0.1, y: 0, z: -8 }, true); launched(0); } await wait(0.25); t += 0.25; }
    G.mode = mode0; G.onOver = over;
    return [...res, { name: 'шар сбивает кегли', ok: first > 0, info: `первым броском ${first}` }, { name: 'режим «случай»: Fable бросил в ответ, счёт посчитан', ok: G.state === 'over' && G.marks[1].length > 0, info: `гость ${G.score[0]} : ${G.score[1]} Fable` }];
  };
  toRack(); hide(his); resetPins(true); draw();
  return G;
}
