// Замер времени кадра «как в шлеме»: два глаза в настоящем разрешении со сглаживанием + три камеры записи (окно 2880×1080) тридцать раз в секунду.
// Кадры идут в темпе шлема (--hz 90). Судим по тяжёлым кадрам: «95 % до» — в это время укладываются 95 кадров из 100.
// Шлема нет: глаза рисуются в невидимый буфер тем же путём, что в шлеме (две камеры, зеркала и вода считаются на каждый глаз).
// --pc — замер «с компьютера»: одна картинка на мониторе (--res 1920x1080), без глаз шлема и камер записи. Слабый компьютер в N раз медленнее этого — «всего» умножь на N.
// --quality lite — замер с качеством lite (вместо config.json)
// --cpu 3 — процессор замедлен в 3 раза (Chrome так изображает слабый компьютер; видеокарту так не замедлить)
//   node test/perf.mjs [--pc] [--res 1920x1080] [--quality lite] [--loc 2] [--eye 2160] [--frames 240] [--hz 90] [--no-spec] [--rec] [--live] [--stt] [--profile] [--shot]
// --live — после каждого кадра страница отдаёт управление браузеру, как в шлеме: окно камер захватывается в запись 30 раз в секунду, и это время входит в кадр. С --rec включать всегда.
// --size 3840x2160 и --mime 'video/webm;codecs=h264' — другой размер окна записи и другой кодек, для сравнения
// --shot — после каждого вида кадр холста в media/shots/perf-*.png: сверху два глаза, снизу окно с камерами записи (проверка, что окно собирается по частям без дыр)
// --profile — после каждого вида список функций страницы, на которые ушло больше всего времени
// --rec — вместе с записью окна в файл · --stt — во время замера распознавание речи идёт на той же видеокарте · --chrome — настоящий Chrome вместо Chromium
// «всего» — время кадра с ожиданием видеокарты; «код» — доля страницы (до отправки на видеокарту). Для 90 к/с «всего» должно быть меньше 11,1 мс, для 72 — меньше 13,9.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const opt = (n, d) => { const i = a.indexOf('--' + n); return i < 0 ? d : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true); };
const HZ = Number(opt('hz', 90)); const PORT = '8011', only = opt('loc', null), EYE = Number(opt('eye', 2160)), FRAMES = Number(opt('frames', 240)), spec = !opt('no-spec', false), rec = !!opt('rec', false), stt = !!opt('stt', false), live = !!opt('live', false), size = opt('size', null), mime = opt('mime', null);
const PC = !!opt('pc', false), RES = String(opt('res', '1920x1080')).split('x').map(Number), QUALITY = opt('quality', null);
const { puppeteer, chrome } = await import('./browser.mjs');
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
// фраза для --stt: любая записанная фраза гостя из прошлых сеансов, повторённая дважды (около 9 с речи)
let PHRASE = null; const sttSec = [];
if (stt) { const dir = path.resolve(ROOT, '../media/session'); const wav = fs.readdirSync(dir).map((d) => path.join(dir, d, 'guest/0001.wav')).find(fs.existsSync); if (!wav) { console.log('для --stt нужна хотя бы одна записанная фраза в media/session/*/guest/'); process.exit(1); } const b = fs.readFileSync(wav).subarray(44); PHRASE = Buffer.concat([b, b]); }

// точки, где гость проведёт больше всего времени, и самые тяжёлые виды. look(x, z, кудаX, кудаZ, наклон головы)
const VIEWS = {
  1: [['вход, лента перед глазами', 'look(0, 0, 0, -2)'], ['тело Fable собрано, знания на виду', 'W.loc.hero(); look(0, 0, 1.15, -1.45)']],
  2: [['вход: остров, пёс вдали', 'look(0, -9, 0, -17)'], ['вплотную к псу (гладит)', 'look(1.6, -14.6, 2.7, -17.1, 0.25)'], ['перед зеркалом, пёс за спиной', 'look(-1.8, -10.4, -2.9, -11.4)'], ['пять вещей из слов и пёс', 'for (const n of ["гитара", "пианино", "ракета", "мотоцикл", "воздушный шар"]) W.actions.spawn(n); look(0, -9, 2.7, -17.1, 0.1)']],
  3: [['гостиная, вход', 'W.loc.setMode("home", { flash: false }); look(0, 1.4, 0, -4)'], ['гостиная, у зеркала', 'look(-2.2, -0.9, -3.5, -0.9)'], ['игровой зал, вид на дорожку и автоматы', 'W.loc.setMode("arcade", { flash: false }); look(0, 4, -1, -8)'], ['игровой зал, вид в проём', 'look(2, -2, -8, -3)']],
};

const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, windowsHide: true, env: { ...process.env, PORT, NO_STT: stt ? '' : '1', NO_LAN: '1', SESSION: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', (d) => process.stderr.write('[сервер] ' + d));
for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/state`); break; } catch { await sleep(0.2); } }
if (stt) { process.stdout.write('жду модель речи… '); for (let i = 0; i < 240; i++) { if ((await (await fetch(`http://127.0.0.1:${PORT}/state`)).json()).stt) break; await sleep(0.5); } console.log('готова'); }
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, defaultViewport: { width: 1600, height: 900 },
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1600,900'] });
let code = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('ошибка страницы: ' + String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('ошибка страницы: ' + m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${PORT}/?auto=1&mic=0${QUALITY ? '&quality=' + QUALITY : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.W && window.W.ready', { timeout: 120000 });
  await page.waitForFunction('window.W.guest', { timeout: 60000 }).catch(() => {});
  await page.evaluate((EYE, REC, HZ, LIVE, SIZE, MIME, PC, RES) => {
    const { THREE, renderer, scene, camera } = W;
    const ch = new MessageChannel(); let wake = null; ch.port1.onmessage = () => wake(); const yieldNow = () => new Promise((r) => { wake = r; ch.port2.postMessage(0); });
    if (PC) { renderer.setAnimationLoop(null); renderer.info.autoReset = false; renderer.setSize(RES[0], RES[1], false); camera.aspect = RES[0] / RES[1]; camera.updateProjectionMatrix(); W.spectator.set('eyes'); }
    else {
    if (SIZE) W.spectator.size.splice(0, 2, ...SIZE.split('x').map(Number)); if (MIME) W.cfg.spectator.mime = MIME;
    // глаза рисуются на тот же холст, что и камеры записи (выше них): в шлеме у глаз и у холста одни настройки цвета, и three.js не меняет программы между ними.
    // При записи (--rec) холст должен быть размером с окно записи, тогда глаза идут в отдельный буфер.
    const [SW, SH] = W.spectator.size, Y0 = REC ? 0 : SH, rt = REC ? new THREE.WebGLRenderTarget(EYE * 2, EYE, { samples: 4 }) : null;
    renderer.setAnimationLoop(null); renderer.setSize(REC ? SW : Math.max(SW, EYE * 2), SH + (REC ? 0 : EYE), false); renderer.info.autoReset = false;
    const gl0 = renderer.getContext(); if (!REC && (gl0.drawingBufferWidth < EYE * 2 || gl0.drawingBufferHeight < SH + EYE)) console.error('холст меньше заказанного: ' + gl0.drawingBufferWidth + '×' + gl0.drawingBufferHeight);
    const eyes = [-0.032, 0.032].map((x, i) => { const c = new THREE.PerspectiveCamera(100, 1, 0.05, 3000); c.position.x = x; c.viewport = new THREE.Vector4(i * EYE, Y0, EYE, EYE); c.layers.mask = (camera.layers.mask | 6) & (i ? 5 : 3); camera.add(c); return c; });
    const ac = new THREE.ArrayCamera(eyes); ac.fov = 110; ac.aspect = 1.1; ac.near = 0.05; ac.far = 3000; ac.updateProjectionMatrix(); ac.layers.mask = camera.layers.mask | 6; camera.add(ac);
    W.spectator.fakeXR = () => { renderer.setRenderTarget(rt); if (rt) renderer.setScissorTest(false); else { renderer.setScissor(0, Y0, EYE * 2, EYE); renderer.setScissorTest(true); } renderer.render(scene, ac); renderer.setScissorTest(false); renderer.setRenderTarget(null); };
    }
    window.look = (x, z, tx, tz, pitch = 0) => { W.rig.position.x = x; W.rig.position.z = z; W.input.sim.yaw = Math.atan2(-(tx - x), -(tz - z)) - W.rig.rotation.y; W.input.sim.pitch = pitch; };
    const gl = renderer.getContext(), px = new Uint8Array(4);
    window.frames = async (count) => {
      const cpu = [], all = []; let calls = 0;
      for (let i = 0; i < count; i++) {
        renderer.info.reset(); const t0 = performance.now(); W.tick(); const t1 = performance.now();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); renderer.resetState();
        if (LIVE) await yieldNow();
        const t2 = performance.now(); cpu.push(t1 - t0); all.push(t2 - t0); calls = Math.max(calls, renderer.info.render.calls);
        while (performance.now() - t0 < 1000 / HZ) { /* ждём начала следующего кадра шлема */ }
        if (i % 30 === 29) await new Promise((r) => setTimeout(r, 0));
      }
      const q = (arr, k) => (arr.length ? [...arr].sort((x, y) => x - y)[Math.floor((arr.length - 1) * k)] : 0);
      return { cpu: q(cpu, 0.5), all: q(all, 0.5), p95: q(all, 0.95), max: q(all, 1), calls };
    };
  }, EYE, rec, HZ, live, size, mime, PC, RES);
  const prof = !!opt('profile', false), cdp = await page.createCDPSession();
  const CPU = Number(opt('cpu', 1)); if (CPU > 1) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); console.log(`процессор замедлен в ${CPU} раза`); }
  if (!spec) await page.evaluate(() => { W.cfg.spectator.fps = 1e-6; });
  if (rec) await page.evaluate(() => W.spectator.toggleRec());
  if (PC) console.log(`замер с компьютера: картинка ${RES.join('×')}, качество ${await page.evaluate(() => (W.lite ? 'lite' : 'full'))} · видеокарта ${await page.evaluate(() => { const g = W.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL).slice(0, 60) : '?'; })} · кадров на вид: ${FRAMES}`);
  else console.log(`замер в темпе ${HZ} к/с: глаз ${EYE}×${EYE} ×2, сглаживание 4×${spec ? `, камеры записи ${await page.evaluate(() => W.spectator.size.join('x'))} (30 раз в секунду)` : ', без камер записи'}${rec ? ', запись идёт' : ''}${stt ? ', распознавание идёт' : ''} · кадров на вид: ${FRAMES}`);
  let worst = 0;
  for (const n of ['1', '2', '3']) {
    if (only && only !== n) continue;
    await page.evaluate((n) => W.go(n, { flash: false }), n);
    for (const [name, pre] of VIEWS[n]) {
      await page.evaluate(pre); await page.evaluate('frames(40)'); await sleep(0.8); await page.evaluate('frames(20)');
      let hear = null; if (stt) hear = (async () => { for (let k = 0; k < 3; k++) { const r = await fetch(`http://127.0.0.1:${PORT}/hear`, { method: 'POST', body: PHRASE }).then((r) => r.json()); sttSec.push(r.sec); } })();
      if (prof) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
      const r = await page.evaluate(`frames(${FRAMES})`); await hear;
      const w = r.p95; worst = Math.max(worst, w);
      console.log(`локация ${n} · ${name}: кадр ${r.all.toFixed(1)} мс (95 % до ${r.p95.toFixed(1)}, худший ${r.max.toFixed(1)}) · код ${r.cpu.toFixed(1)} мс · вызовов отрисовки до ${r.calls} · ${w <= 1000 / 90 ? 'держит 90' : w <= 1000 / 72 ? 'держит 72' : 'НЕ держит 72'}`);
      if (opt('shot', false)) { for (let k = 0; k < 12; k++) { await page.evaluate('frames(1)'); await sleep(0.03); } const f = path.resolve(ROOT, '../media/shots', `perf-loc${n}-${VIEWS[n].findIndex((v) => v[0] === name) + 1}.png`); await page.screenshot({ path: f }); console.log('    ' + f); }
      if (prof) { const { profile } = await cdp.send('Profiler.stop'); const self = new Map(); const dt = profile.timeDeltas, byId = new Map(profile.nodes.map((x) => [x.id, x]));
        profile.samples.forEach((id, i) => { const f = byId.get(id).callFrame, k = `${f.functionName || '(безымянная)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dt[i] / 1000); });
        for (const [k, ms] of [...self].sort((x, y) => y[1] - x[1]).slice(0, 14)) console.log(`    ${(ms / FRAMES).toFixed(2)} мс/кадр  ${k}`); }
    }
  }
  if (rec) { await page.evaluate(() => W.spectator.toggleRec()); await sleep(2.5); }
  const errs = await page.evaluate(() => W.errors); for (const e of errs.slice(0, 5)) console.log('ошибка мира: ' + e.slice(0, 300));
  if (stt) console.log(`распознавание фразы ${(PHRASE.length / 32000).toFixed(1)} с во время отрисовки: ${Math.min(...sttSec)}–${Math.max(...sttSec)} с`);
  console.log(`ИТОГ замера: самый тяжёлый кадр (95 % кадров худшего вида) ${worst.toFixed(1)} мс · нужно: 90 к/с = 11,1 мс, 72 к/с = 13,9 мс`);
  if (errs.length) code = 1;
} finally { await browser.close(); const gone = new Promise((r) => server.once('exit', r)); await fetch(`http://127.0.0.1:${PORT}/quit`, { method: 'POST' }).catch(() => server.kill()); await gone; }
process.exitCode = code;
