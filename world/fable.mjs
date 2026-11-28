// Пульт хозяина мира (в коде он зовётся Fable): этой командой сессия Claude Code слушает гостя и отвечает в мир. Запуск из корня проекта: node world/fable.mjs …
//   node fable.mjs listen [сек]                 — ждать фразу или важное событие
//   node fable.mjs say "текст" [--do '<json>'] [--mood тихо] [--listen [сек]]
//   node fable.mjs do '<json действий>' [--listen]
//   node fable.mjs code <файл.js> [--listen]   — дописать вещь в мир на лету
//   node fable.mjs state | timing | text "фраза как от гостя"
//   node fable.mjs event "стройка готова: файл.js" — событие в мир от помощника-строителя: Fable получает его сразу, не дожидаясь фразы
//   node fable.mjs hold — для хука Stop: пока мир запущен (и рубильник «выключить мир», где он есть, не опущен), ход не кончается
//   node fable.mjs quit — остановить мир (сервер); после этого хук Stop ход не держит
// Голоса-персонажи (config.json → voices) — их говорят помощники, не хозяин мира:
//   node fable.mjs voice <имя> "текст"   — реплика голосом персонажа; печатает «сказано» или причину отказа
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).port;
const B = `http://127.0.0.1:${PORT}`;
const down = () => { console.log(`СЕРВЕР МИРА НЕ ОТВЕЧАЕТ (порт ${PORT}). Мир не запущен: запусти его (CLAUDE.md, раздел «Запуск мира»), подожди 20 с и повтори команду.`); process.exit(2); };
const post = (p, o) => fetch(B + p, { method: 'POST', body: JSON.stringify(o) }).then((r) => r.json(), down);
const get = (p) => fetch(B + p).then((r) => r.json(), down);
const actions = (s) => { try { const v = JSON.parse(s); if (!Array.isArray(v)) throw new Error('это не список'); return v; } catch (e) { console.log(`ДЕЙСТВИЯ НЕ РАЗОБРАНЫ (${e.message}): ${s}\nНужен список в одинарных кавычках: --do '[{"go":2},{"dog":"come"}]'. Ничего не отправлено.`); process.exit(2); } };
const hhmmss = (t) => new Date(t).toTimeString().slice(0, 8);

const a = process.argv.slice(2); const cmd = a[0];
const flag = (n) => { const i = a.indexOf('--' + n); return i < 0 ? null : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true); };

function showState(s) {
  if (!s || !s.loc) return;
  const bits = [`локация ${s.loc}`];
  if (s.xr) bits.push(`шлем надет, ${s.fps} кадров/с${s.fps < 60 ? ' — МАЛО, картинка у гостя дёргается' : ''}`); else bits.push('шлем НЕ надет (режим монитора)');
  if (s.dist != null) bits.push(`гость в ${s.dist} м от тебя`);
  if (s.looks) bits.push(`смотрит на: ${s.looks}`);
  if (s.holds) bits.push(`держит: ${s.holds}`);
  if (s.near) bits.push(`рядом: ${s.near}`);
  if (s.note) bits.push(s.note);
  console.log('мир: ' + bits.join(' · '));
}
// кадр глаз лежит в media/session/<дата>/frames/ — путь приходит событием
async function listen(sec) {
  // Ждём кусками не дольше 240 с: сервер отдаёт заголовки только вместе с ответом, а fetch в Node ждёт заголовков 300 с —
  // при 5 минутах тишины он падал, и пульт печатал «СЕРВЕР МИРА НЕ ОТВЕЧАЕТ» при живом сервере.
  const end = Date.now() + sec * 1000, r = { items: [], state: null };
  for (;;) { const left = Math.max(0, Math.ceil((end - Date.now()) / 1000)), part = await get(`/inbox?wait=${Math.min(240, left)}`);
    r.items.push(...part.items); r.state = part.state;
    if (left <= 240 || part.items.some((i) => i.kind === 'phrase' || i.important)) break; }
  if (!r.items.length) console.log(`(тишина ${sec} с)`);
  for (const i of r.items) {
    if (i.kind === 'phrase') console.log(`[${hhmmss(i.t)}] гость: «${i.text}»`);
    else if (i.kind === 'frame') console.log(`[${hhmmss(i.t)}] кадр твоих глаз: ${i.file}`);
    else console.log(`[${hhmmss(i.t)}] событие: ${i.name}${i.data ? ' ' + JSON.stringify(i.data) : ''}`);
  }
  showState(r.state);
}
const fmt = (r) => {
  const s = (x, y) => (x && y ? ((y - x) / 1000).toFixed(1) : '—');
  return `«${r.text.slice(0, 40)}» речь→текст ${s(r.t0, r.t_stt)} с · текст→ответ Fable ${s(r.t_stt, r.t_reply)} с · ответ→первый звук ${s(r.t_reply, r.t_audio)} с · звук→играет ${s(r.t_audio, r.t_play)} с · ВСЕГО ${s(r.t0, r.t_play || r.t_audio)} с`;
};

if (cmd === 'listen') await listen(Number(a[1]) || 540);
else if (cmd === 'say' || cmd === 'do' || cmd === 'code') {
  const m = {};
  if (cmd === 'say') { m.text = a[1]; if (typeof m.text !== 'string' || !m.text.trim() || m.text.startsWith('--')) { console.log('say: нужен текст в кавычках: node fable.mjs say "текст" --listen'); process.exit(2); } const d = flag('do'); if (d) m.actions = actions(d === true ? '' : d); const mood = flag('mood'); if (mood) m.mood = mood; const model = flag('model'); if (model) m.model = model; }
  if (cmd === 'do') m.actions = actions(a[1] || '');
  if (cmd === 'code') { if (!a[1] || !fs.existsSync(a[1])) { console.log('code: нет файла ' + a[1]); process.exit(2); } m.code = fs.readFileSync(a[1], 'utf8'); m.name = path.basename(a[1]); }
  const r = await post('/fable', m);
  if (!r.clients) console.log('ВНИМАНИЕ: мир не открыт в браузере, никто не услышит');
  if (r.clients > 1) console.log(`ВНИМАНИЕ: мир открыт в ${r.clients} вкладках — голос звучит дважды. Попроси гостя закрыть лишние вкладки.`);
  const l = flag('listen'); if (l) await listen(l === true ? 540 : Number(l));
} else if (cmd === 'state') { const r = await get('/state'); console.log(JSON.stringify(r, null, 1)); }
else if (cmd === 'timing') { for (const r of await get('/timing?n=' + (a[1] || 5))) console.log(fmt(r)); }
else if (cmd === 'text') await post('/text', { text: a[1] });
else if (cmd === 'event') await post('/event', { name: a[1], important: true });
// Хук Stop: встреча идёт, пока гость её не остановил — рубильником «выключить мир», словами (тогда node world/fable.mjs quit) или закрыв окно сервера. Мир не отвечает — сессию не держим, иначе она крутилась бы впустую.
else if (cmd === 'hold') { const r = await fetch(B + '/state').then((x) => x.json(), () => null);
  if (r && !r.off) console.log(JSON.stringify({ decision: 'block', reason: 'Мир запущен — встреча идёт, пока гость сам её не остановит. Не заканчивай ход: запусти node world/fable.mjs listen (ожидание не тратит токены). Гость сказал, что встреча окончена, — node world/fable.mjs quit.' })); }
else if (cmd === 'quit') { await fetch(B + '/quit', { method: 'POST' }).catch(() => null); console.log('мир остановлен'); }
// Голос-персонаж: одна строка вывода — «сказано» или причина отказа; состояние мира Fable персонажу не печатается.
else if (cmd === 'voice' || cmd === 'city') {
  const no = cmd === 'voice' ? ' Не сказано' : '';
  const ask = (p, o) => fetch(B + p, o ? { method: 'POST', body: JSON.stringify(o) } : undefined)
    .then((r) => (r.status === 404 ? { error: `сервер мира не знает команды ${cmd}: нужен перезапуск мира.${no}` } : r.json()), () => ({ error: `мир не отвечает (порт ${PORT}).${no}` }))
    .catch(() => ({ error: `мир ответил непонятно.${no}` }));
  let r;
  if (cmd === 'voice') {
    const pos = []; for (let i = 1; i < a.length; i++) { if (a[i] === '--stance') { if (a[i + 1] && !a[i + 1].startsWith('--')) i++; } else if (!a[i].startsWith('--')) pos.push(a[i]); } // флаги можно и до текста
    const [side, ...words] = pos, text = words.join(' '); if (!side || !text.trim()) { console.log('voice: node fable.mjs voice синий "текст реплики" [--stance терпеть|гнев] [--demand]'); process.exit(2); }
    const st = flag('stance');
    r = await ask('/voice', { side, text, stance: st == null ? null : st === true ? '' : st, demand: a.includes('--demand') });
    if (!r.error) console.log('сказано');
  } else {
    r = await ask('/city?side=' + encodeURIComponent(a[1] || ''));
    if (!r.error) { const k = r.known, f = r.female;
      if (!k) console.log('город пока ничего не знает');
      else console.log(`ход ${k.turn ?? '?'} · ${r.name} · ${k.dead ? (f ? 'погибла' : 'погиб') : (f ? 'жива' : 'жив')}\n${String(k.text || '').trim() || 'город пока ничего не знает'}`); }
  }
  if (r.error) { console.log(r.error.replace(/\s+/g, ' ')); process.exit(1); }
}
else console.log('команды: listen · say · do · code · state · timing · text · event · hold · quit · voice');

