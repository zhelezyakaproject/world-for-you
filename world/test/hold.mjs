// Держит мир открытым в браузере без окна N секунд — чтобы проверить голосовой круг без шлема.
//   node test/hold.mjs [секунд=300] [порт=8010] [локация=1]
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [sec = '300', port = '8010', loc = '1'] = process.argv.slice(2);
const { puppeteer, chrome } = await import('./browser.mjs');
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, defaultViewport: { width: 1600, height: 900 },
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1600,900'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('ошибка страницы:', m.text().slice(0, 200)); });
await page.goto(`http://127.0.0.1:${port}/?auto=1&mic=0&loc=${loc}`); await page.waitForFunction('window.W && window.W.ready', { timeout: 120000 });
await page.evaluate(() => W.voice.ctx.resume());
console.log('мир открыт');
const end = Date.now() + Number(sec) * 1000;
while (Date.now() < end) { await new Promise((r) => setTimeout(r, 1000)); if (fs.existsSync(path.join(ROOT, 'test/.shot'))) { const name = fs.readFileSync(path.join(ROOT, 'test/.shot'), 'utf8').trim() || 'hold'; fs.unlinkSync(path.join(ROOT, 'test/.shot')); await page.screenshot({ path: path.resolve(ROOT, '../media/shots', name + '.png') }); console.log('кадр', name); } }
await browser.close();
