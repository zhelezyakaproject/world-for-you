// Кадр по заказу: открыть мир, выполнить код на странице, снять кадр(ы).
//   node test/shot.mjs <локация> <имя> "<js перед кадром>" [ещё "<js>" → кадр имя-2 …]   (свой сервер без речи на порту 8012 или SHOT_PORT; кадры — media/shots)
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [loc, name, ...codes] = process.argv.slice(2); const PORT = process.env.SHOT_PORT || '8012'; // SHOT_PORT — свой порт, если кадры снимают сразу несколько помощников
const SIZE = (process.env.SHOT_SIZE || '1280x720').split('x'); // размер кадра: SHOT_SIZE=1920x720 — пропорции окна трёх камер в шлеме
const { puppeteer, chrome } = await import('./browser.mjs');
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, windowsHide: true, env: { ...process.env, PORT, NO_STT: '1', SESSION: 'test' }, stdio: 'ignore' });
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/state`); break; } catch { await sleep(0.2); } }
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, defaultViewport: { width: +SIZE[0], height: +SIZE[1] }, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
try {
  const page = await browser.newPage(); page.on('pageerror', (e) => console.log('ошибка:', String(e).slice(0, 300))); page.on('console', (m) => { if (m.type() === 'error') console.log('ошибка:', m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${PORT}/?auto=1&mic=0&loc=${loc}`); await page.waitForFunction('window.W && window.W.ready', { timeout: 120000 });
  // камера кадра: cam([x,y,z],[x,y,z]) ставит вид со стороны в точку и направляет
  await page.evaluate(() => { window.cam = (p, l) => { W.loc.sideCam = () => ({ pos: new W.THREE.Vector3(...p), look: new W.THREE.Vector3(...l) }); W.spectator.set('side'); }; });
  let i = 0;
  for (const code of codes.length ? codes : ['']) { const res = await page.evaluate(code); if (res !== undefined && res !== null && res !== 0) console.log(typeof res === 'string' ? res : JSON.stringify(res)); await sleep(2.2); const f = path.resolve(ROOT, '../media/shots', `${name}${i ? '-' + (i + 1) : ''}.png`); await page.screenshot({ path: f }); console.log(f); i++; }
  const errs = await page.evaluate(() => W.errors); for (const e of errs.slice(0, 5)) console.log('ошибка мира:', e.slice(0, 300));
} finally { await browser.close(); server.kill(); }
