// Сшивает запись глаз гостя (views-*.mp4), которая разлетелась по нескольким папкам сессии.
// Так бывает, если сервер мира перезапустили во время записи: страница продолжает тот же файл, но куски ложатся
// в папку новой сессии на свои места, а начало там — нули. Куски, пришедшие, пока сервер стоял, потеряны.
// Скрипт берёт из каждой копии целые фрагменты MP4 (moof + mdat) и пишет один файл; на месте потерь — скачок времени.
//   node tools/heal-rec.mjs <выход.mp4> <копия1.mp4> <копия2.mp4> ...    копии — в порядке папок сессий (первая — с заголовком)
import fs from 'node:fs';

const [out, ...parts] = process.argv.slice(2);
if (!out || !parts.length) { console.log('node tools/heal-rec.mjs <выход.mp4> <копия1.mp4> <копия2.mp4> ...'); process.exit(1); }

const head = Buffer.alloc(16);
function box(fd, len, at) { // заголовок коробки MP4 на месте at: { type, size } или null
  if (at + 8 > len) return null;
  fs.readSync(fd, head, 0, 16, at);
  let size = head.readUInt32BE(0); const type = head.toString('latin1', 4, 8);
  if (size === 1) size = Number(head.readBigUInt64BE(8));
  if (!/^[a-z0-9 ]{4}$/.test(type) || size < 8 || at + size > len) return null;
  return { type, size };
}
function findMoof(fd, len, from) { // первая коробка moof, за которой идёт mdat
  const buf = Buffer.alloc(64 << 20);
  for (let pos = from; pos < len; pos += buf.length - 8) {
    const n = fs.readSync(fd, buf, 0, buf.length, pos);
    for (let i = buf.indexOf('moof', 4, 'latin1'); i >= 4 && i < n; i = buf.indexOf('moof', i + 1, 'latin1')) {
      const at = pos + i - 4, m = box(fd, len, at);
      if (m?.type === 'moof' && box(fd, len, at + m.size)?.type === 'mdat') return at;
    }
    if (n < buf.length) break;
  }
  return -1;
}

const ranges = []; let covered = 0;
parts.forEach((file, k) => {
  const fd = fs.openSync(file, 'r'), len = fs.fstatSync(fd).size;
  let at = k === 0 ? 0 : findMoof(fd, len, covered), kept = 0, start = at;
  if (at < 0) { console.log(`${file}: целых фрагментов нет`); fs.closeSync(fd); return; }
  for (;;) { // идём по коробкам, пока они целые; фрагмент берём только парой moof + mdat
    const b = box(fd, len, at); if (!b) break;
    if (b.type === 'moof') { const d = box(fd, len, at + b.size); if (d?.type !== 'mdat') break; at += b.size + d.size; kept++; }
    else at += b.size;
  }
  if (at > start) ranges.push({ file, from: start, to: at });
  console.log(`${file}: взято ${((at - start) / 1e9).toFixed(2)} ГБ, фрагментов ${kept}${k ? `, потеряно перед ним ${((start - covered) / 1e6).toFixed(0)} МБ` : ''}`);
  covered = Math.max(covered, at); fs.closeSync(fd);
});

const o = fs.openSync(out, 'w'), buf = Buffer.alloc(32 << 20);
for (const r of ranges) {
  const fd = fs.openSync(r.file, 'r');
  for (let p = r.from; p < r.to;) { const n = fs.readSync(fd, buf, 0, Math.min(buf.length, r.to - p), p); fs.writeSync(o, buf, 0, n); p += n; }
  fs.closeSync(fd);
}
fs.closeSync(o);
console.log(`${out}: ${(fs.statSync(out).size / 1e9).toFixed(2)} ГБ`);
