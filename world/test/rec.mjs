// Проверка записи в шлеме: вход через эмулятор шлема, запись по всем локациям, файл записи — размер кадра (config.json → client.spectator.size), кадры, звук.
//   WORLD_DIR=<папка другого мира> node test/rec.mjs [секунд] — та же проверка записи: запись ляжет в его media/session/test/rec
//   node test/rec.mjs [секунд=60]     (свой сервер на порту 8012, без распознавания речи и голоса; запись — в media/session/test/rec)
// Эмулятор рисует глаза шлема в то же окно, поэтому рывки и картинку здесь не судить — их судит запись в настоящем шлеме.
// Здесь проверяется то, что одинаково в эмуляторе и в шлеме: размер окна записи после входа, кадры идут, звук есть, файл читается.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = '8012', B = `http://127.0.0.1:${PORT}`;
const SEC = Number(process.argv[2]) || 60;
const { puppeteer, chrome } = await import('./browser.mjs');
// настоящий Chrome: в Chromium нет кодека H.264, которым пишет мир
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const [RW, RH] = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).client.spectator.size || [2880, 1080];
const WORLD = process.env.WORLD_DIR ? path.resolve(process.env.WORLD_DIR) : ROOT;
const REC = path.join(WORLD, '../media/session/test/rec');
if (fs.existsSync(REC)) for (const f of fs.readdirSync(REC)) fs.rmSync(path.join(REC, f), { force: true }); // папку не удалять: если она открыта в другой программе, node на Windows падает без сообщения

const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, windowsHide: true, env: { ...process.env, PORT, NO_STT: '1', NO_LAN: '1', SESSION: 'test' }, stdio: ['ignore', 'ignore', 'pipe'] });
server.stderr.on('data', (d) => process.stderr.write('[сервер] ' + d));
for (let i = 0; i < 50; i++) { try { await fetch(B + '/state'); break; } catch { await sleep(0.2); } }
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, defaultViewport: { width: 1280, height: 720 }, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const fails = [];
let file;
try {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(`${B}/?emu=1&auto=1&mic=0`); await page.waitForFunction('window.W && window.W.ready', { timeout: 120000 });
  // эмулятор выдаёт себя за браузер Quest, и мир включает упрощённый режим без камер записи; на встрече картинку считает компьютер
  await page.evaluate(() => { W.voice.ctx.resume(); W.lite = false; });
  await page.evaluate(() => W.enterXR()); await sleep(2);
  const size = await page.evaluate(() => [W.xr, W.canvas.width, W.canvas.height]);
  if (!size[0]) fails.push('вход в шлем (эмулятор) не состоялся');
  if (size[1] !== RW || size[2] !== RH) fails.push(`окно записи после входа ${size[1]}×${size[2]}, нужно ${RW}×${RH}`);
  const act = (a) => fetch(B + '/fable', { method: 'POST', body: JSON.stringify({ actions: [a] }) });
  file = await page.evaluate(() => W.spectator.toggleRec());
  // голова медленно водит из стороны в сторону: по записи видно, ровно ли идёт движение
  await page.evaluate(() => { const q = W.THREE ? new W.THREE.Quaternion() : null, y = new W.THREE.Vector3(0, 1, 0); setInterval(() => { q.setFromAxisAngle(y, Math.sin(performance.now() / 1800) * 0.6); xrdev.quaternion.set(q.x, q.y, q.z, q.w); }, 5); });
  // по локациям: треть времени на каждую; в третьей — гостиная, потом зал
  const plan = WORLD !== ROOT ? [] : [[0, { body: true }], [SEC / 3, { go: 2 }], [SEC / 3 + 6, { dog: 'come' }], [2 * SEC / 3, { go: 3 }], [2 * SEC / 3 + 6, { room: 'arcade' }]]; // у другого мира свои действия: там пишется его стартовая сцена
  const t0 = Date.now();
  for (const [at, a] of plan) { await sleep(Math.max(0, at - (Date.now() - t0) / 1000)); await act(a); }
  await sleep(Math.max(0, SEC - (Date.now() - t0) / 1000));
  await page.evaluate(() => W.spectator.toggleRec()); await sleep(3);
  const werr = await page.evaluate(() => W.errors); for (const e of [...errors, ...werr].slice(0, 5)) fails.push('ошибка страницы: ' + e.slice(0, 200));
} finally { await browser.close(); const gone = new Promise((r) => server.once('exit', r)); await fetch(B + '/quit', { method: 'POST' }).catch(() => server.kill()); await gone; }

const video = path.join(REC, file || 'нет'), sound = video.endsWith('.mp4') ? path.join(REC, file.replace('views-', 'sound-').replace('.mp4', '.webm')) : video; // запасная запись (.webm) несёт звук в том же файле
if (!fs.existsSync(video)) fails.push('файла записи нет');
else if (!fs.existsSync(sound)) fails.push('файла звука нет');
else {
  const probe = (file, args) => execFileSync('ffprobe', ['-v', 'error', ...args, file], { windowsHide: true }).toString().trim();
  const [w, h] = probe(video, ['-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0']).split(',').map(Number);
  const vt = probe(video, ['-select_streams', 'v', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0']).split(/\r?\n/).map(parseFloat).filter(Number.isFinite);
  const at = probe(sound, ['-select_streams', 'a', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0']).split(/\r?\n/).map(parseFloat).filter(Number.isFinite);
  const dur = vt.at(-1) - vt[0], fps = (vt.length - 1) / dur;
  let gap = 0; for (let i = 1; i < vt.length; i++) gap = Math.max(gap, vt[i] - vt[i - 1]);
  console.log(`запись ${path.basename(video)}: ${w}×${h}, ${dur.toFixed(1)} с, ${vt.length} кадров (${fps.toFixed(1)} к/с, самая длинная дыра ${(gap * 1000).toFixed(0)} мс), звук ${at.length ? (at.at(-1) - at[0]).toFixed(1) + ' с' : 'НЕТ'}, ${(fs.statSync(video).size / 1e6).toFixed(0)} МБ (${(fs.statSync(video).size * 8 / dur / 1e6).toFixed(0)} Мбит/с)`);
  if (w !== RW || h !== RH) fails.push(`кадр записи ${w}×${h}, нужно ${RW}×${RH}`);
  if (dur < SEC - 3) fails.push(`запись короче прогона: ${dur.toFixed(1)} из ${SEC} с`);
  if (!at.length || at.at(-1) - at[0] < dur - 2) fails.push('звук в записи короче картинки или его нет');
  const done = fs.readFileSync(path.join(REC, '../log.jsonl'), 'utf8').split('\n').filter((l) => l.includes('запись дописана')).map((l) => JSON.parse(l).inbox.data).find((d) => d.file === file);
  if (video.endsWith('.mp4') && !done) fails.push('поток записи не сообщил, что файл дописан'); else if (done?.dropped) fails.push(`пропущено кадров при сжатии: ${done.dropped} из ${done.frames}`);
  if (video.endsWith('.mp4')) console.log(execFileSync(process.execPath, [path.join(ROOT, 'tools/join-rec.mjs'), REC], { windowsHide: true }).toString().trim());
  // кадр из середины — посмотреть глазами
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.round(dur * 0.85)), '-i', video, '-frames:v', '1', '-vf', 'scale=1440:-1', path.join(REC, 'кадр.jpg')], { windowsHide: true });
  console.log('кадр для глаз: ' + path.join(REC, 'кадр.jpg'));
}
for (const f of fails) console.log('  ✗ ' + f);
console.log(fails.length ? `ИТОГ записи: ${fails.length} проблем` : 'ИТОГ записи: всё в порядке');
process.exitCode = fails.length ? 1 : 0;
