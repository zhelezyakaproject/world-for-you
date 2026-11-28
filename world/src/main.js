// Вход: собирает мир W, грузит локации, крутит главный цикл.
// Адрес: ?emu=1 эмулятор шлема · ?quality=lite качество вместо config.json · ?auto=1 прогон без мыши · ?loc=2 стартовая локация · ?mic=0 без микрофона · ?views=3 три вида на монитор
import * as THREE from 'three';
import { makeInput } from './input.js';
import { makeNet } from './net.js';
import { makeVoice } from './voice.js';
import { makeFx } from './fx.js';
import { makeRain, RAIN_BEFORE } from './rain.js';
import { makeSpectator, mainOnly } from './spectator.js';
import { makePhoto } from './photo.js';
import { makeChoice } from './choice.js';
import { makeFable } from './fable.js';
import { makeGuest } from './guest.js';

const q = new URLSearchParams(location.search);
if (q.get('emu')) {
  const { XRDevice, metaQuest3 } = await import('iwer');
  window.xrdev = new XRDevice(metaQuest3); window.xrdev.installRuntime({ forceInstall: true });
}

const canvas = document.getElementById('c'), hud = document.getElementById('hud'), enterBtn = document.getElementById('enter');
// preserveDrawingBuffer: в шлеме окно на мониторе обновляется по частям (по одной камере записи за кадр), остальное в нём должно оставаться на месте
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');

const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 3000);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
camera.userData.main = true; camera.layers.enable(1); camera.layers.enable(2); // слои глаз шлема: на них руки-варежки гостя (см. mainOnly в spectator.js)

const handlers = new Map();
export const W = {
  THREE, q, renderer, scene, camera, rig, canvas, t: 0, dt: 0, frame: null,
  locs: {}, loc: null, actions: {}, actionLoc: {}, updaters: [], errors: [], mirrors: [],
  head: { pos: new THREE.Vector3(0, 1.65, 0), dir: new THREE.Vector3(0, 0, -1), quat: new THREE.Quaternion() },
  on(n, f) { (handlers.get(n) || handlers.set(n, []).get(n)).push(f); },
  emit(n, d) { for (const f of handlers.get(n) || []) { try { f(d); } catch (e) { W.fail(n, e); } } },
  fail(where, e) { const m = `${where}: ${e?.stack || e}`; console.error(m); W.errors.push(m); W.net?.log(m); },
  get xr() { return renderer.xr.isPresenting; },
};
window.W = W;
window.addEventListener('error', (e) => W.fail('window', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => W.fail('promise', e.reason));

function resize() {
  if (W.xr) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

W.net = makeNet(W);
// качество: full — компьютер считает картинку; lite — упрощённо (браузер самого шлема или слабая видеокарта)
let resume = {};
try { const cfg = await (await fetch('/config')).json(); Object.assign(W.cfg, cfg.client); resume = cfg.resume || {}; W.lite = (q.get('quality') || cfg.quality) === 'lite' || /OculusBrowser|Quest|Pico/i.test(navigator.userAgent); } catch { W.lite = false; }
// размер картинки глаз задаёт SteamVR; scale в config.json — множитель к нему (меньше 1 — мягче и быстрее)
renderer.xr.setFramebufferScaleFactor(W.cfg.xr?.scale ?? 1); if (W.lite) renderer.xr.setFoveation(1);
W.fx = makeFx(W);
W.rain = makeRain(W);
W.input = makeInput(W);
W.voice = makeVoice(W);
W.fable = await makeFable(W);
W.spectator = makeSpectator(W);
makePhoto(W); W.choice = makeChoice(W);

// ── локации ──────────────────────────────────────────────────────────────
W.go = (name, opt = {}) => {
  const L = W.locs[name]; if (!L) return W.fail('go', 'нет локации ' + name);
  travel = null; if (!opt.rain) W.rain.stop();
  if (opt.flash !== false && W.loc) W.fx.flash();
  if (W.loc) { W.loc.leave?.(); W.loc.group.visible = false; }
  W.loc = L; L.group.visible = true;
  scene.background = L.background || new THREE.Color(0x000000);
  scene.environment = L.environment || null;
  scene.fog = L.fog || null;
  renderer.toneMappingExposure = L.exposure ?? 1;
  // голова гостя должна оказаться в точке входа, где бы он ни стоял в комнате
  const local = camera.position; const yaw = L.spawnYaw || 0;
  rig.rotation.y = yaw;
  const off = new THREE.Vector3(local.x, 0, local.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  rig.position.set(L.spawn.x - off.x, L.spawn.y || 0, L.spawn.z - off.z);
  W.fable.place(L);
  L.enter?.(opt);
  W.emit('loc', name); W.net.event('локация', { name, title: L.title });
  for (const list of waiting.splice(0)) act(list);
};
// Перенос с зелёным кодом: код падает, через RAIN_BEFORE секунд «бах» и новая локация, код гаснет уже в ней.
// Действия Fable, которые пришли за это время, ждут новой локации.
let travel = null; const waiting = [];
W.travel = (name) => { if (travel) travel.name = name; else { W.rain.play(); travel = { name, t: RAIN_BEFORE }; } };
W.updaters.push((dt) => { if (travel && (travel.t -= dt) <= 0) W.go(travel.name, { rain: true }); });
W.actions.go = (n) => { if (!W.locs[String(n)]) throw new Error(`нет локации «${n}» — есть 1, 2, 3`); W.travel(String(n)); };

hud.textContent = 'Мир загружается…';
const mods = { 1: './loc1.js', 2: './loc2.js', 3: './loc3.js' };
await Promise.all(Object.entries(mods).map(async ([n, file]) => {
  try {
    const L = await (await import(file)).build(W);
    for (const k of L.actionNames || []) W.actionLoc[k] = n; // действия, которые работают только на этой локации
    L.name = n; L.group.visible = false; scene.add(L.group); W.locs[n] = L;
  } catch (e) { W.fail('локация ' + n, e); }
}));
W.loaded = Object.keys(W.locs).length;

// команды Fable из сессии: каждое действие — объект {имя: значение}
// Неверное действие мир не ломает: оно пропускается, а Fable сразу получает событие с причиной.
const refuse = (k, v, why) => { console.warn(`действие ${k} не выполнено: ${why}`); W.net.event('действие не выполнено', { действие: `{"${k}":${JSON.stringify(v ?? null).slice(0, 80)}}`, причина: String(why).slice(0, 240) }, true); };
W.on('net:act', (m) => {
  if (!Array.isArray(m.actions)) return refuse('do', m.actions, 'нужен список: [{"go":2},{"dog":"come"}]');
  act(m.actions);
});
function act(actions) {
  for (const [i, a] of actions.entries()) {
    if (travel) { waiting.push(actions.slice(i)); return; }
    if (!a || typeof a !== 'object' || Array.isArray(a)) { refuse('?', a, 'действие — это объект {имя: значение}'); continue; }
    for (const [k, v] of Object.entries(a)) {
      if (k === 'at') continue; // уточнение к spawn: {"spawn":"кот","at":[x,z]}
      const f = W.actions[k]; if (!f) { refuse(k, v, 'такого действия нет. Есть: ' + Object.keys(W.actions).sort().join(', ')); continue; }
      const where = W.actionLoc[k]; if (where && W.loc?.name !== where) { refuse(k, v, `работает только на локации ${where}, сейчас локация ${W.loc?.name}`); continue; }
      try { const r = f(v, a); if (r === false) refuse(k, v, 'сейчас нельзя (не то состояние игры или мира)'); } catch (e) { refuse(k, v, e?.message || e); }
    }
  }
}
// «слово становится вещью»: модуль, который Fable дописал на лету
W.on('net:code', async (m) => {
  try { const url = URL.createObjectURL(new Blob([m.code], { type: 'text/javascript' })); const mod = await import(url); await mod.default(W, THREE); W.net.event('код принят', { name: m.name }); }
  catch (e) { W.fail('код ' + m.name, e); W.net.event('код упал', { name: m.name, error: String(e).slice(0, 300) }, true); }
});

// ── вход в шлем ──────────────────────────────────────────────────────────
async function enterXR() {
  W.voice.unlock();
  // ?pc=1 — запуск «с компьютера»: монитор, даже если шлем подключён
  // в режиме монитора — один вид, глаза игрока: три камеры (?views=3) нужны только тому, кто смотрит со стороны на гостя в шлеме
  if (q.has('pc')) { W.spectator.set('eyes'); hud.textContent = 'Режим компьютера: мышь — смотреть, WASD — идти'; W.input.lockMouse(); enterBtn.hidden = true; return; }
  if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-vr').catch(() => false))) { W.spectator.set('eyes'); hud.textContent = 'Шлем не найден: режим монитора (мышь и WASD)'; W.input.lockMouse(); enterBtn.hidden = true; return; }
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
  // Chrome 157 со SteamVR: в слой XRProjectionLayer кадры шлема не приходят — мир стоит, в шлеме «страница не отвечает» (21.11.2026, Pico 4 через PICO Connect).
  // Без этого метода three.js берёт старый слой XRWebGLLayer, с ним кадры идут.
  if (typeof XRWebGLBinding !== 'undefined') delete XRWebGLBinding.prototype.createProjectionLayer;
  W.spectator.onXR(true);
  await renderer.xr.setSession(session);
  await levelSpace(session);
  enterBtn.hidden = true; hud.textContent = '';
  session.addEventListener('end', () => { enterBtn.hidden = false; W.spectator.onXR(false); resize(); });
  W.net.event('шлем надет', {});
}
// Pico 4 через PICO Connect и SteamVR отдал отсчёт «от пола» вверх ногами: голова на 2,5 м под полом, верх головы смотрит вниз (21.11.2026).
// По первому кадру: если верх головы смотрит вниз, отсчёт поворачивается на 180° вокруг оси взгляда; если глаза дальше 0,3 м от EYE —
// пол шлема неверный, глаза ставятся на EYE. Нормальный отсчёт не трогается. W.levelSpace() — заново, когда гость стоит прямо.
const EYE = 1.65;
async function levelSpace(session = renderer.xr.getSession()) {
  if (!session) return null;
  renderer.xr.setReferenceSpace(null); const ref = renderer.xr.getReferenceSpace();
  const pose = await new Promise((res) => session.requestAnimationFrame((t, f) => res(f.getViewerPose(ref))));
  if (!pose) return null;
  const m = pose.transform.matrix, flip = m[5] < 0, y = flip ? -m[13] : m[13], dy = Math.abs(EYE - y) > 0.3 ? EYE - y : 0;
  if (flip || dy) renderer.xr.setReferenceSpace(ref.getOffsetReferenceSpace(new XRRigidTransform({ x: 0, y: flip ? dy : -dy, z: 0 }, flip ? { x: 0, y: 0, z: 1, w: 0 } : { x: 0, y: 0, z: 0, w: 1 })));
  const out = { перевёрнут: flip, 'глаза были': +y.toFixed(2), 'сдвиг пола': +dy.toFixed(2) }; W.net.event('отсчёт шлема', out); return out;
}
W.levelSpace = levelSpace;
enterBtn.onclick = () => enterXR().catch((e) => W.fail('вход', e));
enterBtn.hidden = !!q.get('auto');
W.enterXR = enterXR;

// ── цикл ─────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let stateT = 0, frames = 0, fpsT = 0;
W.fps = 0;
W.tick = (time, frame) => {
  const dt = Math.min(clock.getDelta(), 0.05); W.dt = dt; W.t += dt; W.frame = frame; W.time = time ?? performance.now(); // время кадра шлема, мс
  frames++; fpsT += dt; if (fpsT >= 1) { W.fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  try {
    W.input.update(dt);
    camera.updateMatrixWorld();
    camera.getWorldPosition(W.head.pos); camera.getWorldQuaternion(W.head.quat); W.head.dir.set(0, 0, -1).applyQuaternion(W.head.quat);
    W.input.interact(dt);
    W.loc?.update?.(dt);
    W.fable.update(dt);
    W.guest?.update(dt);
    W.voice.update(dt);
    W.fx.update(dt);
    W.rain.update(dt);
    for (const f of W.updaters) f(dt);
  } catch (e) { if (W.errors.length < 30) W.fail('цикл', e); }
  W.spectator.render();
  stateT += dt; if (stateT > 1) { stateT = 0; W.net.state(describe()); if (!W.xr && !q.get('auto')) hud.textContent = hudText(); }
};
renderer.setAnimationLoop(W.tick);

function describe() {
  const s = { loc: W.loc ? `${W.loc.name} «${W.loc.title}»` : null, fps: W.fps, xr: W.xr };
  if (W.fable.visible) s.dist = +W.fable.root.position.distanceTo(new THREE.Vector3(W.head.pos.x, 0, W.head.pos.z)).toFixed(1);
  const held = W.input.hands.map((h) => h.held?.name).filter(Boolean); if (held.length) s.holds = held.join(', ');
  Object.assign(s, W.loc?.describe?.() || {});
  return s;
}
W.describe = describe;
function hudText() {
  return `Локация ${W.loc?.name} · ${W.loc?.title} · ${W.fps} к/с\nМышь — смотреть · WASD — идти · ЛКМ — курок · ПКМ — схватить · 1 2 3 — локации · V — вид камеры · T — фраза текстом`;
}

// Тело гостя (его видят камеры записи и зеркала) грузится до прогрева: иначе первая локация, где оно на виду, начиналась бы с рывка.
try { const s = await makeGuest(W); W.guest = s; s.inMirrors(W.mirrors); for (const h of W.input.hands) mainOnly(h.vis.hand); } catch (e) { W.fail('тело гостя', e); }
// Прогрев: каждая локация один раз рисуется всеми камерами ещё при загрузке. Без него первая смена локации в шлеме замирает на 1–2 с:
// видеокарта в этот момент собирает программы и принимает текстуры. События и звуки прогрева наружу не идут.
{ const event = W.net.event; W.net.event = () => {}; W.rain.play(); // код тоже рисуется в прогреве: его программа собирается заранее
  for (const n of ['2', '3', '1']) { if (!W.locs[n]) continue; W.go(n, { flash: false, rain: true });
    for (const mode of n === '3' ? ['arcade', 'home'] : [null]) { if (mode) W.loc.setMode(mode, { flash: false }); W.tick(); W.tick(); W.spectator.warm(); } }
  W.rain.stop(); W.net.event = event; }
// страницу перезагрузили посреди встречи (сервер помнит, где был мир) — возвращаемся в ту же локацию, запись возобновится при входе в шлем
W.go(q.get('loc') || (W.locs[resume.loc] ? resume.loc : '1'), { flash: false });
W.resumeRec = !!resume.rec;
W.ready = true;
hud.textContent = q.get('auto') ? '' : hudText();
