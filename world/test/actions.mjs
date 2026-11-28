// Проверка пульта Fable: каждое действие из таблицы README выполняется, неверный ввод отклоняется с объяснением и мир не ломает.
//   node test/actions.mjs [--show]     (свой сервер на порту 8011, без распознавания речи и без голоса; --show печатает тексты отказов)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = '8011', B = `http://127.0.0.1:${PORT}`;
const { puppeteer, chrome } = await import('./browser.mjs');
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

// [локация, действие]; 3a — игровой зал локации 3
const GOOD = [
  [1, { body: true }], [1, { gesture: 'left' }], [1, { gesture: 'right' }], [1, { gesture: 'shrug' }], [1, { know: { пёс: { шерсть: ['тёплая'], мяч: ['бросок'] } } }], [1, { know: { закат: ['свет', 'вода'] } }],
  [1, { image: 'корабль' }], [1, { line: { who: 'fable', text: 'Проверка ленты.' } }], [1, { attend: { 'проверка': 0.9, 'сети': 0.4 } }], [1, { attend: ['лента'] }], [1, { choice: { да: 0.3, нет: 0.2, 'не знаю': 0.5 } }], [1, { choice: false }], [1, { ribbonClear: true }], [1, { look: true }], [1, { pad: true }], [1, { padMap: { grip: 1 } }], [1, { body: false }],
  [2, { go: 2 }], [2, { move: 'guest' }], [2, { move: [1, -8] }], [2, { move: 'лестница' }], [2, { move: 'центр' }], [2, { follow: true }], [2, { sun: 'день' }], [2, { sun: 'ночь' }], [2, { sun: 0.4 }], [2, { sun: 'закат' }],
  [2, { dog: 'come' }], [2, { dog: 'bark' }], [2, { dog: 'lie' }], [2, { dog: 'up' }], [2, { dog: 'fetch' }], [2, { page: 3 }], [2, { size: 'великан' }], [2, { size: 0.5 }], [2, { size: 'обычный' }], [2, { stars: true }], [2, { stars: false }], [2, { mood: 'тревога' }], [2, { mood: 'ровно' }], [2, { choice: ['тёплый', 'живой'] }], [2, { photo: true }], [2, { spawn: 'гитара' }], [2, { spawn: 'кот', at: [2, -7] }], [2, { clearThings: true }],
  [3, { go: 3 }], [3, { room: { obj: 'стол', dx: -1, dz: 0.5, ry: 1.57, s: 1.2 } }], [3, { recall: 1 }], [3, { recall: 0 }], [3, { move: 'диван' }],
  ['3a', { room: 'arcade' }], ['3a', { play: 'случай' }], ['3a', { play: 'поддавки' }], ['3a', { play: 'победа' }], ['3a', { bowling: 1 }], ['3a', { hoops: true }], ['3a', { hoopSkill: 0.6 }], ['3a', { move: 'боулинг' }], ['3a', { wake: true }], ['3a', { rec: true }], ['3a', { rec: false }], ['3a', { room: 'home' }], ['3a', { go: 1 }],
];
const BAD = [
  [1, { go: 7 }], [1, { nope: 1 }], [1, { gesture: 'wave' }], [1, { move: 'guest' }], [1, { know: 'пёс' }], [1, { image: 'дракон' }], [1, { page: 3 }], [1, { attend: {} }], [1, { attend: { слово: 'много' } }], [1, { choice: ['одно'] }], [1, { photo: true }], [1, { size: 'великан' }], [1, { line: {} }], [1, { dog: 'come' }], [1, { padMap: { grip: 'a' } }], [1, 'go 2'],
  [2, { sun: 'утро' }], [2, { page: 'x' }], [2, { size: 'гора' }], [2, { size: 40 }], [2, { mood: 'злость' }], [2, { dog: 'dance' }], [2, { spawn: 123 }], [2, { spawn: 'слон' }], [2, { move: 'луна' }], [2, { move: [1] }], [2, { bowling: 3 }],
  [3, { room: 'bar' }], [3, { room: { obj: 'шкаф' } }], [3, { room: { obj: 'стол', dx: 'много' } }], [3, { recall: 'да' }], [3, { play: 'победа' }], ['3a', { play: 'жульничать' }], [3, { bowling: 3 }], ['3a', { bowl: { aim: 'центр' } }], ['3a', { hoopSkill: 'x' }],
];

const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, windowsHide: true, env: { ...process.env, PORT, NO_STT: '1', NO_LAN: '1', SESSION: 'test' }, stdio: ['ignore', 'ignore', 'pipe'] });
server.stderr.on('data', (d) => process.stderr.write('[сервер] ' + d));
for (let i = 0; i < 50; i++) { try { await fetch(B + '/state'); break; } catch { await sleep(0.2); } }
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, defaultViewport: { width: 1280, height: 720 }, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
let code = 0;
try {
  const page = await browser.newPage(); const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(`${B}/?auto=1&mic=0`); await page.waitForFunction('window.W && window.W.ready', { timeout: 120000 });
  await page.evaluate(() => W.voice.ctx.resume());
  const inbox = async () => (await (await fetch(B + '/inbox')).json()).items;
  const place = async (where) => { const loc = String(where)[0], arcade = where === '3a';
    await page.evaluate((loc, arcade) => { if (W.loc.name !== loc) W.go(loc, { flash: false }); if (loc === '3' && (W.loc.mode === 'arcade') !== arcade) W.loc.setMode(arcade ? 'arcade' : 'home', { flash: false }); }, loc, arcade); };
  const run = async (list, wantRefusal) => { let ok = 0; const bad = [];
    for (const [where, act] of list) {
      await place(where); await sleep(0.15); await inbox();
      await fetch(B + '/fable', { method: 'POST', body: JSON.stringify({ actions: [act] }) }); await sleep(0.6);
      const ev = (await inbox()).filter((i) => i.kind === 'event' && /действие не выполнено|такой вещи нет/.test(i.name));
      const alive = await page.evaluate(async () => { const t = W.t; await new Promise((r) => setTimeout(r, 120)); return W.t > t && W.errors.length === 0; });
      if (alive && !!ev.length === wantRefusal) ok++; else bad.push(`${JSON.stringify(act)} на локации ${where}: ${!alive ? 'МИР ВСТАЛ ИЛИ ОШИБКА' : wantRefusal ? 'принято молча' : 'отказ — ' + (ev[0].data?.причина || ev[0].name)}`);
      if (wantRefusal && ev.length && process.argv.includes('--show')) console.log(`  ${JSON.stringify(act)} → ${ev[0].data?.причина || ev[0].name}`);
    }
    return { ok, bad }; };
  const g = await run(GOOD, false), b = await run(BAD, true);
  for (const x of [...g.bad, ...b.bad]) console.log('  ✗ ' + x);
  const worldErrors = await page.evaluate(() => W.errors); for (const e of [...errors, ...worldErrors].slice(0, 6)) console.log('  ошибка: ' + e.slice(0, 200));
  console.log(`ИТОГ пульта: действий из таблицы выполнено ${g.ok} из ${GOOD.length} · неверный ввод отклонён с объяснением ${b.ok} из ${BAD.length} · ошибок страницы ${errors.length + worldErrors.length}`);
  if (g.bad.length || b.bad.length || errors.length || worldErrors.length) code = 1;
} finally { await browser.close(); const gone = new Promise((r) => server.once('exit', r)); await fetch(B + '/quit', { method: 'POST' }).catch(() => server.kill()); await gone; }
process.exitCode = code;
