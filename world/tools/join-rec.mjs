// Склейка записи после встречи: картинка глаз гостя (views-*.mp4) и звук мира (sound-*.webm) → один файл «глаза-*.mp4» рядом.
// Картинка не пересжимается, звук переводится в AAC. Исходные файлы остаются.
//   node tools/join-rec.mjs <папка rec сеанса>      например: node world/tools/join-rec.mjs media/session/2026-11-22-12-30/rec (нужен ffmpeg в PATH)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(process.argv[2] || '.');
const views = fs.readdirSync(dir).filter((f) => /^views-\d+\.mp4$/.test(f));
if (!views.length) { console.log('в папке нет записей views-*.mp4: ' + dir); process.exit(1); }
for (const v of views) {
  const stamp = v.slice(6, -4), sound = path.join(dir, `sound-${stamp}.webm`), out = path.join(dir, `глаза-${stamp}.mp4`);
  // пустая запись (0 кадров: например, шлем был выключен) — пропустить, иначе ffmpeg падает и остальные записи не склеиваются
  if (fs.statSync(path.join(dir, v)).size < 1024) { console.log(`${v} · пустая запись, пропущена`); continue; }
  const withSound = fs.existsSync(sound);
  // без заголовка — обрывок записи после перезапуска сервера: его сшивает tools/heal-rec.mjs с копией из прошлой папки сессии
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, v), ...(withSound ? ['-i', sound] : []), '-map', '0:v', ...(withSound ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '256k'] : []), '-c:v', 'copy', '-movflags', '+faststart', out], { windowsHide: true, stdio: 'pipe' }); }
  catch { fs.rmSync(out, { force: true }); console.log(`${v} · не читается (обрывок без начала?) — сшить: node tools/heal-rec.mjs`); continue; }
  console.log(`${out} · ${(fs.statSync(out).size / 1e6).toFixed(0)} МБ${withSound ? '' : ' · БЕЗ ЗВУКА: нет ' + path.basename(sound)}`);
}
