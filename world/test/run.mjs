// Прогон мира на мониторе без окна: грузит страницу, обходит локации, запускает их автопроверки, снимает кадры.
//   node test/run.mjs [--loc 1] [--emu] [--port 8011] [--no-server] [--wait 2]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2); const opt = (n, d) => { const i = a.indexOf('--' + n); return i < 0 ? d : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true); };
const PORT = opt('port', '8011'), only = opt('loc', null), emu = opt('emu', false), settle = Number(opt('wait', 2.5));
const SHOTS = path.resolve(ROOT, '../media/shots'); fs.mkdirSync(SHOTS, { recursive: true });
const { puppeteer, chrome } = await import('./browser.mjs');
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

let server = null;
if (!opt('no-server', false)) {
  server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, windowsHide: true, env: { ...process.env, PORT, NO_STT: opt('stt', false) ? '' : '1', SESSION: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', (d) => process.stderr.write('[сервер] ' + d));
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/state`); break; } catch { await sleep(0.2); } }
}
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, defaultViewport: { width: 1600, height: 900 },
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1600,900', '--enable-features=WebXR'] });
const errors = []; let code = 0;
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?auto=1&mic=0${emu ? '&emu=1' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.W && window.W.ready', { timeout: 120000 });
  const loadSec = ((Date.now() - t0) / 1000).toFixed(1);
  const gpu = await page.evaluate(() => { const g = W.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
  console.log(`загрузка ${loadSec} с · видеокарта: ${gpu.slice(0, 70)}`);
  if (emu) {
    const r = await page.evaluate(async () => { W.cfg.spectator.spread = false; /* у эмулятора картинка глаз и окно — один холст, по частям его обновлять нельзя */ await W.enterXR(); await new Promise((r) => setTimeout(r, 1500)); const d = window.xrdev;
      d.controllers.right.position.set(0.3, 1.2, -0.4); d.controllers.right.updateButtonValue('squeeze', 1); d.controllers.left.updateAxes('thumbstick', 0, -1);
      const z0 = W.rig.position.z; await new Promise((r) => setTimeout(r, 1200));
      return { xr: W.xr, grip: W.input.hands[1].grip, handY: +W.input.hands[1].pos.y.toFixed(2), moved: +(z0 - W.rig.position.z).toFixed(2), fps: W.fps }; });
    console.log(`эмулятор шлема: в шлеме=${r.xr} · хват правой=${r.grip} · высота руки=${r.handY} м · прошёл стиком=${r.moved} м · ${r.fps} к/с`);
    await page.screenshot({ path: path.join(SHOTS, 'emu.png') });
  }
  const locs = await page.evaluate(() => Object.keys(W.locs));
  let passed = 0, failed = 0;
  for (const n of ['1', '2', '3']) {
    if (only && only !== n) continue;
    if (!locs.includes(n)) { console.log(`локация ${n}: НЕ ЗАГРУЖЕНА`); failed++; continue; }
    await page.evaluate((n) => { W.go(n, { flash: false }); W.spectator.set('eyes'); }, n);
    await sleep(settle);
    const res = await page.evaluate(async (n, emu) => { const L = W.locs[n]; const out = L.selftest && !emu ? await L.selftest() : []; return { title: L.title, fps: W.fps, out }; }, n, !!emu);
    for (const c of res.out) { c.ok ? passed++ : failed++; }
    console.log(`локация ${n} «${res.title}» · ${res.fps} к/с` + (res.out.length ? ' · ' + res.out.map((c) => `${c.ok ? '✓' : '✗'} ${c.name}${c.info ? ' (' + c.info + ')' : ''}`).join(' · ') : ''));
    if (emu) { // в шлеме каждый глаз — своя камера three.js со своими слоями: проверяем, что рука гостя попадает в её кадр
      await page.waitForFunction('window.W.guest', { timeout: 60000 }).catch(() => {});
      const seen = await page.evaluate(async () => { let k = 0; const d = window.xrdev; d.controllers.left.updateAxes('thumbstick', 0, 0); d.controllers.right.updateButtonValue('squeeze', 0); d.controllers.right.position.set(0.12, d.position.y - 0.15, d.position.z - 0.45); await new Promise((r) => setTimeout(r, 300)); const v = W.input.hands[1].vis, o = (v.hand.visible ? v.hand : v.light).children[0], prev = o.onBeforeRender; o.onBeforeRender = () => { k++; }; await new Promise((r) => setTimeout(r, 500)); o.onBeforeRender = prev; return k; });
      seen ? passed++ : failed++; console.log(`  ${seen ? '✓' : '✗'} рука гостя видна в шлеме (отрисована ${seen} раз за 0,5 с)`);
      await page.screenshot({ path: path.join(SHOTS, `emu-loc${n}.png`) }); }
    if (!emu) {
      await page.evaluate((n) => { W.locs[n].hero?.(); W.spectator.set('side'); }, n); await sleep(settle);
      await page.screenshot({ path: path.join(SHOTS, `loc${n}-hero.png`) });
      await page.evaluate(() => W.spectator.set('eyes')); await sleep(0.4);
      await page.screenshot({ path: path.join(SHOTS, `loc${n}-eyes.png`) });
    }
  }
  const pageErrors = await page.evaluate(() => W.errors);
  const all = [...new Set([...errors, ...pageErrors.map((e) => e.slice(0, 300))])];
  console.log(`ИТОГ: локаций загружено ${locs.length} из 3 · ошибок консоли ${all.length} · автопроверок пройдено ${passed}, провалено ${failed}`);
  for (const e of all.slice(0, 8)) console.log('  ошибка: ' + e.replace(/\n/g, ' | '));
  console.log(`кадры: ${SHOTS}`);
  if (all.length || failed || locs.length < 3) code = 1;
} finally { await browser.close(); server?.kill(); }
process.exit(code);
