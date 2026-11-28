// Сервер мира: раздаёт страницу, держит связь «мир ↔ сессия Fable», распознаёт речь, озвучивает ответы.
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Другой мир на этом же движке: WORLD_DIR — его папка (свои config.json, index.html, src/). Файл ищется сначала в ней, потом здесь.
const WORLD = process.env.WORLD_DIR ? path.resolve(process.env.WORLD_DIR) : ROOT;
const MEDIA = path.resolve(WORLD, '../media');
const HOME = path.resolve(ROOT, '..'); // корень проекта: .env с ключами, .venv с Python, models/ с моделями распознавания речи
// Ключи из файла .env в корне проекта (строки ИМЯ=значение), если их нет в окружении: так ключ не попадает ни в код, ни в чат.
try { for (const l of fs.readFileSync(path.join(HOME, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch { /* файла нет — ключи только из окружения */ }
// Настройки — микрофон, запись глаз гостя (размер кадра, частота, сжатие), картинка шлема, кнопки контроллеров, распознавание речи — живут в config.json этой папки.
// Другой мир наследует их и в своём config.json пишет только то, что у него другое.
const readCfg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
const CFG = readCfg(WORLD);
if (WORLD !== ROOT) { const base = readCfg(ROOT), own = CFG.client || {}; CFG.stt ??= base.stt; CFG.quality ??= base.quality;
  CFG.client = { ...own }; for (const [k, v] of Object.entries(base.client)) CFG.client[k] = { ...v, ...(own[k] || {}) }; }
const PORT = Number(process.env.PORT || CFG.port);
const SES = path.join(MEDIA, 'session', process.env.SESSION || new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
for (const d of ['guest', 'fable', 'rec', 'frames']) fs.mkdirSync(path.join(SES, d), { recursive: true });
const logf = fs.createWriteStream(path.join(SES, 'log.jsonl'), { flags: 'a' });
const now = () => Date.now();
const log = (o) => logf.write(JSON.stringify({ t: now(), ...o }) + '\n');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.fbx': 'application/octet-stream', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.hdr': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.css': 'text/css', '.tga': 'application/octet-stream', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' };

// ── связь с браузерами (SSE) ─────────────────────────────────────────────
const clients = new Set();
function push(ev) { const s = `data: ${JSON.stringify(ev)}\n\n`; for (const c of clients) c.write(s); log({ out: ev.type, ev: ev.type === 'align' ? undefined : ev }); }

// ── входящие для Fable ───────────────────────────────────────────────────
let inbox = [], waiters = [], worldState = {}, round = null, rounds = [], recOn = false, worldOff = false; // worldOff — гость опустил рубильник «выключить мир»: встреча закончена
function toInbox(item) {
  inbox.push({ t: now(), ...item }); log({ inbox: item });
  if (item.kind === 'phrase' || item.important) flushWaiters();
}
function flushWaiters() { const w = waiters; waiters = []; for (const f of w) f(); }
function takeInbox() {
  const items = inbox; inbox = [];
  if (round && !round.t_inbox && items.some(i => i.kind === 'phrase')) round.t_inbox = now();
  return { items, state: worldState };
}

// ── распознавание речи (один процесс Python, модель в памяти) ────────────
let stt = null, sttReady = false, sttWait = new Map(), sttBuf = '', quitting = false, sttFails = 0;
function startStt() {
  if (process.env.NO_STT || CFG.stt === 'none') return; // "none" — без микрофона: гость пишет фразы текстом (клавиша T в окне мира)
  // config.json "stt": "gigaam" — GigaAM v3 от Сбера (русскую речь слышит точнее), "whisper" — Whisper large-v3 (нужна видеокарта NVIDIA)
  // Python — config.json "python", иначе .venv в корне проекта, иначе python из PATH. Модель качается при первом запуске в models/ корня проекта.
  const py = CFG.python ? path.resolve(HOME, CFG.python) : [path.join(HOME, '.venv/Scripts/python.exe'), path.join(HOME, '.venv/bin/python')].find(fs.existsSync) || 'python';
  const [script, ...args] = CFG.stt === 'whisper' ? ['stt.py', 'large-v3', path.join(HOME, 'models/whisper')] : ['stt_gigaam.py', 'v3_e2e_rnnt', path.join(HOME, 'models/gigaam')];
  stt = spawn(py, ['-X', 'utf8', path.join(ROOT, script), ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
  stt.on('error', (err) => console.log(`речь: Python не запустился (${py}): ${err.message}. Установка — README.md, раздел «Установка»`));
  stt.stdout.setEncoding('utf8');
  stt.stdout.on('data', (d) => {
    sttBuf += d; let i;
    while ((i = sttBuf.indexOf('\n')) >= 0) {
      const line = sttBuf.slice(0, i).trim(); sttBuf = sttBuf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.ready) { sttReady = true; sttFails = 0; console.log('речь: модель загружена за', m.sec, 'с'); continue; }
      sttWait.get(m.id)?.(m); sttWait.delete(m.id);
    }
  });
  stt.on('exit', (c) => { const was = sttReady; sttReady = false; console.log('речь: процесс вышел', c); for (const f of sttWait.values()) f({ text: '' }); sttWait.clear();
    if (quitting) return;
    // модель так и не загрузилась три раза подряд — Python или пакеты не установлены: не перезапускать без конца
    if (!was && ++sttFails >= 3) return console.log('речь: распознавание не запускается (README.md, «Установка»). Фразы можно писать текстом: клавиша T в окне мира');
    console.log('речь: перезапускаю через 2 с'); setTimeout(startStt, 2000); });

}
const transcribe = (wav) => new Promise((res) => { const id = String(now()) + Math.random(); sttWait.set(id, res); stt.stdin.write(JSON.stringify({ id, wav }) + '\n'); });
function wavHeader(n, rate = 16000) {
  const b = Buffer.alloc(44); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n, 40); return b;
}
let hearN = 0;
async function hear(pcm, t0) {
  const file = path.join(SES, 'guest', String(++hearN).padStart(4, '0') + '.wav');
  fs.writeFileSync(file, Buffer.concat([wavHeader(pcm.length), pcm]));
  if (!sttReady) return { text: '', err: 'модель речи ещё не загружена' };
  const r = await transcribe(file);
  const text = (r.text || '').trim();
  const t1 = t0 || now(), echo = text ? isEcho(text, t1 - pcm.length / 32, t1) : null;
  log({ heard: text, file, stt_sec: r.sec, echo: echo || undefined });
  if (echo) { console.log(`речь: «${text}» — это эхо голоса Fable (${echo}), Fable её не получит`); return { text: '', echo, sec: r.sec }; }
  if (text) phrase(text, t0 || now() - Math.round((r.sec || 0) * 1000), now());
  return { text, sec: r.sec };
}
// Эхо: фраза записана, пока играл голос Fable (или секунду после), и больше чем на 60 % состоит из слов этой реплики.
const wordsOf = (s) => s.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 3);
function isEcho(text, from, to) {
  const mine = wordsOf(text); if (mine.length < 2) return null;
  for (const e of tts.values()) {
    if (!e.t_play || from > (e.t_end || e.t_play + (e.dur || 30) * 1000) + 1000 || to < e.t_play) continue;
    const said = new Set(wordsOf(e.clean)), share = mine.filter((w) => said.has(w)).length / mine.length;
    if (share >= 0.6) return `реплика ${e.id}, совпало ${Math.round(share * 100)} % слов`;
  }
  return null;
}
// Слово конца хода (config.json → client.mic.endWord, «связь»): гость говорит дублями и с паузами, и Fable не должен отвечать, пока он не договорил.
// Фразы копятся здесь и уходят Fable все разом, когда фраза кончается этим словом; само слово в текст не попадает.
// Слов может быть несколько через запятую («связь, приём»); е и ё не различаются: распознавание пишет то «приём», то «прием».
const END = CFG.client.mic?.endWord, endWords = END ? END.split(',').map((w) => w.trim().replace(/[её]/gi, '[её]')).filter(Boolean) : [];
const endRe = endWords.length && new RegExp(`(^|[^а-яёa-z0-9])(${endWords.join('|')})[^а-яёa-z0-9]*$`, 'i');
let held = [];
function phrase(text, t0, tStt) {
  round = { text, t0, t_stt: tStt }; rounds.push(round);
  push({ type: 'heard', text });
  if (!endRe) return toInbox({ kind: 'phrase', text });
  const said = text.match(endRe)?.[2], end = !!said, rest = end ? text.replace(endRe, '').trim() : text;
  if (rest) held.push({ t: now(), kind: 'phrase', text: rest });
  log({ held: rest, end });
  if (!end) return;
  for (const h of held) log({ inbox: h }); inbox.push(...held); held = [];
  toInbox({ kind: 'event', name: `${said.toLowerCase()} — гость договорил, твой ход`, important: true });
}

// ── голос Fable (ElevenLabs, потоком, с временем букв; без ключа — бесплатные голоса Microsoft Edge) ──
const KEY = process.env.ELEVENLABS_API_KEY;
// config.json → voice.provider: "elevenlabs" | "edge" | "none"; не задан — ElevenLabs, если есть ключ и голос voice.id, иначе Edge.
// Ключ без voice.id — ElevenLabs молчит: мир шёл с ключом из переменных Windows и пустым id, хозяин мира был без голоса (27.11.2026).
const PROVIDER = CFG.voice.provider || (KEY && CFG.voice.id ? 'elevenlabs' : 'edge');
// Edge: без ключа, нужен интернет; сервис неофициальный (тот, что читает вслух в браузере Edge), времени букв не даёт.
// ru-RU-DmitryNeural сейчас молчит (проверка 26.11.2026); мужской многоязычный en-US-AndrewMultilingualNeural звук по-русски даёт (на слух не проверен)
const EDGE_VOICE = CFG.voice.edgeVoice || 'ru-RU-SvetlanaNeural';
async function edgeSpeak(text, voice, add) {
  const t = new MsEdgeTTS(); await t.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { voiceLocale: 'ru-RU' });
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // текст идёт внутрь SSML
  try { for await (const part of t.toStream(esc).audioStream) add(part); } finally { t.close(); }
}
const TTS_BASE = process.env.TTS_BASE || 'https://api.elevenlabs.io'; // автопроверки подставляют свой поддельный ElevenLabs (test/voices.mjs)
const tts = new Map(); let ttsN = 0;
const speakable = (t) => t.replace(/\{([^|}]*)\|[^}]*\}/g, '$1').replace(/[{}]/g, '');
// opt.who — имя голоса-персонажа из config.json → voices: свой голос ElevenLabs (у Edge — voices.<имя>.edgeVoice), в мир идёт как voice-say, а не say
async function speak(text, opt = {}) {
  const id = String(++ttsN).padStart(4, '0'), who = opt.who ? VOICES[opt.who] : null, dir = path.join(SES, who ? 'voices' : 'fable'), base = who ? `${id}-${opt.who}` : id;
  if (who) fs.mkdirSync(dir, { recursive: true });
  const e = { id, who: opt.who, chunks: [], done: false, subs: new Set(), file: path.join(dir, base + '.mp3'), t_req: now() };
  e.first = new Promise((r) => { e.firstDone = r; }); // первый кусок звука или ошибка: пульт голоса-персонажа ждёт его, чтобы честно сказать «сказано»
  tts.set(id, e);
  const clean = speakable(text); e.clean = clean;
  fs.writeFileSync(path.join(dir, base + '.txt'), clean);
  if (!who && round && !round.t_reply) { round.t_reply = e.t_req; round.tts = id; }
  // Реплика персонажа уходит в мир, только когда пошёл её звук: первый запрос к голосу персонажа ElevenLabs бывает готов через 13–17 с,
  // и всё это время она стояла бы первой в очереди мира и держала голос Fable. Не прозвучала — в мир не уходит.
  if (who) e.first.then(() => { if (!e.error) push({ type: 'voice-say', id, side: opt.who, name: who.name, text, url: `/tts/${id}.mp3` }); });
  else push({ type: 'say', id, text, url: `/tts/${id}.mp3`, mood: opt.mood });
  const add = (buf) => { if (!e.t_first) { e.t_first = now(); if (round?.tts === id) round.t_audio = e.t_first; log({ tts_first: id, ms: e.t_first - e.t_req }); e.firstDone(); } e.chunks.push(buf); for (const s of e.subs) s.write(buf); };
  const finish = () => { e.done = true; e.firstDone(); for (const s of e.subs) s.end(); if (e.chunks.length) { const all = Buffer.concat(e.chunks); e.dur = all.length / (PROVIDER === 'edge' ? 12000 : 16000); fs.writeFileSync(e.file, all); } }; // 128 кбит/с = 16000 байт в секунду, Edge 96 кбит/с = 12000
  const model = opt.model || who?.model || CFG.voice.model, voice = who ? who.id : CFG.voice.id;
  const body = JSON.stringify({ text: clean, model_id: model, language_code: 'ru', voice_settings: who?.settings || CFG.voice.settings });
  const headers = { 'xi-api-key': KEY, 'Content-Type': 'application/json' };
  try {
    if (PROVIDER === 'none') throw new Error('голос выключен: config.json → voice.provider "none"');
    if (PROVIDER === 'edge') { const v = who?.edgeVoice || EDGE_VOICE; await edgeSpeak(clean, v, add).catch((err) => { throw new Error(`Edge, голос ${v}: ${err.message.slice(0, 80)}`); }); if (!e.t_first) throw new Error(`Edge не дал звука (голос ${v})`); }
    else {
      let r = await fetch(`${TTS_BASE}/v1/text-to-speech/${voice}/stream/with-timestamps?output_format=mp3_44100_128`, { method: 'POST', headers, body });
      if (r.ok) {
        let buf = '';
        const dec = new TextDecoder();
        for await (const part of r.body) {
          buf += dec.decode(part, { stream: true }); let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
            const j = JSON.parse(line);
            if (j.audio_base64) add(Buffer.from(j.audio_base64, 'base64'));
            const a = j.alignment; if (a) push({ type: 'align', id, chars: a.characters, starts: a.character_start_times_seconds });
          }
        }
      } else {
        const err = await r.text(); console.log('голос: with-timestamps', r.status, err.slice(0, 200)); log({ tts_fallback: id, status: r.status, err: err.slice(0, 200) });
        r = await fetch(`${TTS_BASE}/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128`, { method: 'POST', headers, body });
        if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
        for await (const part of r.body) add(Buffer.from(part));
      }
    }
  } catch (err) { console.log(who ? `голос ${opt.who}: ошибка` : 'голос: ошибка', err.message); push({ type: 'say-error', id, error: err.message }); log({ tts_error: err.message, who: opt.who });
    e.error = err.message; // реплика персонажа: ошибку получает пульт персонажа, а не Fable
    if (!who) toInbox({ kind: 'event', name: 'голос не прозвучал', data: { текст: clean.slice(0, 60), ошибка: err.message.slice(0, 160) }, important: true }); }
  finish();
  return id;
}

// ── голоса-персонажи (config.json → voices) ─────────────────────────────
// Реплику персонажа говорит отдельный субагент: node fable.mjs voice синий "текст" [--stance терпеть|гнев] [--demand].
// В мире она встаёт в общую очередь с голосом Fable (не накладывается), звучит не из тела Fable. Когда доиграла — Fable получает
// важное событие «голос синих сказал», а мир — действие {"voiceSaid":{…}} (его обрабатывает игра).
const VOICES = CFG.voices || {}, VOICE_MAX = 300, VOICE_GAP = 20000, STANCES = ['терпеть', 'гнев'];
const lastVoice = {}; // сторона → время последней принятой реплики
const voiceSide = (s) => { s = String(s ?? '').trim().toLowerCase().replace(/ё/g, 'е'); if (!s) return null; if (VOICES[s]) return s;
  const en = { blue: 'синий', red: 'красный' }[s]; if (en && VOICES[en]) return en;
  return Object.keys(VOICES).find((k) => s.length >= 3 && k.startsWith(s.slice(0, 3))) || null; }; // «синие», «синих» → «синий»
const sidePlural = (s) => s.replace(/(ий|ый|ой)$/, (m) => (m === 'ий' ? 'их' : 'ых')); // синий → синих, красный → красных
const voiceFemale = (v) => (v.пол ? /^ж/i.test(v.пол) : /[ая]$/i.test(String(v.name || '').trim().split(/\s+/).pop())); // «пол»: «ж»/«м» в записи голоса; иначе по фамилии
async function voiceLine(m) {
  if (!Object.keys(VOICES).length) return { error: 'в этом мире нет голосов-персонажей (config.json → voices) — не сказано' };
  const side = voiceSide(m.side); if (!side) return { error: `нет голоса «${m.side ?? ''}» — есть: ${Object.keys(VOICES).join(', ')}. Не сказано` };
  let text = typeof m.text === 'string' ? m.text.trim() : '';
  if (!text) return { error: 'нужен текст реплики в кавычках — не сказано' };
  if (text.length > VOICE_MAX) return { error: `текст длиннее ${VOICE_MAX} знаков (${text.length}) — сократи. Не сказано` };
  const stance = m.stance == null || m.stance === false ? null : String(m.stance).trim().toLowerCase();
  if (stance != null && !STANCES.includes(stance)) return { error: `--stance бывает только ${STANCES.join(' или ')} — не сказано` };
  if (!clients.size) return { error: 'мир не открыт в браузере — реплику никто не услышит. Не сказано' };
  if (worldState.city?.мёртв?.[side]) return { error: 'голос мёртв, говорить некому' };
  const ago = now() - (lastVoice[side] || 0);
  if (ago < VOICE_GAP) return { error: `голос ${sidePlural(side)} говорил ${Math.round(ago / 1000)} с назад: не чаще раза в ${VOICE_GAP / 1000} с, следующая реплика через ${Math.ceil((VOICE_GAP - ago) / 1000)} с. Не сказано` };
  const v = VOICES[side], prev = lastVoice[side]; lastVoice[side] = now();
  if (!CFG.voice.tags) text = text.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim(); // пометки подачи — как у голоса Fable (config.json → voice.tags)
  const said = speakable(text).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim(); // текст для Fable и игры — без пометок
  const data = { кто: v.name, текст: said, stance, demand: !!m.demand };
  const id = String(ttsN + 1).padStart(4, '0'); speak(text, { who: side }); const e = tts.get(id);
  log({ voice: { id, side, ...data } });
  // «сказал» — когда реплика доиграла в мире (/played с end); не доиграла за отведённое время (вкладка зависла) — всё равно сказал
  let tm; const fire = () => { if (!afterSpeech.delete(id)) return; clearTimeout(tm); if (e.error && !e.chunks.length) return; // оборвалась на середине — то, что прозвучало, всё равно сказано
    toInbox({ kind: 'event', name: `голос ${sidePlural(side)} сказал`, data, important: true });
    push({ type: 'act', actions: [{ voiceSaid: { side, text: said, stance, demand: data.demand } }] }); };
  e.watch = (ms) => { clearTimeout(tm); tm = setTimeout(fire, ms); }; afterSpeech.set(id, fire); e.watch(90000);
  await Promise.race([e.first, new Promise((r) => setTimeout(r, 30000))]);
  if (e.error) { afterSpeech.delete(id); clearTimeout(tm); if (prev) lastVoice[side] = prev; else delete lastVoice[side];
    return { error: `голос не прозвучал: ${e.error.slice(0, 200)}` }; }
  return { ok: 1, id };
}

// ── HTTP ─────────────────────────────────────────────────────────────────
const readBody = (req) => new Promise((res) => { const a = []; req.on('data', (c) => a.push(c)); req.on('end', () => res(Buffer.concat(a))); });
const afterSpeech = new Map(); // действия, которые ждут конца реплики: id реплики → запуск
const json = (res, o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('нет файла'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}
const inside = (base, rel) => { const f = path.resolve(base, '.' + rel); return f.startsWith(base) ? f : null; };

const handler = async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = decodeURIComponent(u.pathname);
  try {
    if (req.method === 'GET') {
      if (p === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ type: 'hello', cfg: { client: CFG.client }, session: path.basename(SES) })}\n\n`);
        clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (p === '/inbox') {
        const wait = Number(u.searchParams.get('wait') || 0) * 1000;
        if (inbox.some(i => i.kind === 'phrase' || i.important) || !wait) return json(res, takeInbox());
        let done = false; const fin = () => { if (done) return; done = true; clearTimeout(tm); json(res, takeInbox()); };
        const tm = setTimeout(fin, wait); waiters.push(fin); req.on('close', () => { done = true; clearTimeout(tm); }); return;
      }
      if (p === '/config') return json(res, { client: CFG.client, quality: CFG.quality || 'full', resume: { loc: String(worldState.loc || '').slice(0, 1), rec: recOn } });
      if (p === '/state') return json(res, { state: worldState, clients: clients.size, stt: sttReady, session: SES, off: worldOff });
      // сводка для жителей района (пульт: city синий): только её — остальное состояние мира персонажу не нужно. state.city кладёт мир из window.cityKnows() (net.js)
      if (p === '/city') { if (!Object.keys(VOICES).length) return json(res, { error: 'в этом мире нет голосов-персонажей (config.json → voices)' });
        const side = voiceSide(u.searchParams.get('side')); if (!side) return json(res, { error: `нет района «${u.searchParams.get('side') || ''}» — есть: ${Object.keys(VOICES).join(', ')}` });
        const c = worldState.city, v = VOICES[side];
        return json(res, { side, name: v.name, female: voiceFemale(v), known: c && typeof c === 'object' ? { turn: c.ход ?? null, dead: !!c.мёртв?.[side], text: c[side] == null ? '' : typeof c[side] === 'string' ? c[side] : JSON.stringify(c[side]) } : null }); }
      if (p === '/timing') return json(res, rounds.slice(-Number(u.searchParams.get('n') || 5)));
      if (p.startsWith('/tts/')) {
        const e = tts.get(path.basename(p, '.mp3')); if (!e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
        for (const c of e.chunks) res.write(c);
        if (e.done) return res.end();
        e.subs.add(res); req.on('close', () => e.subs.delete(res)); return;
      }
      if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (p.startsWith('/media/')) { const own = inside(MEDIA, p.slice(6)), f = WORLD === ROOT || (own && fs.existsSync(own)) ? own : inside(path.resolve(ROOT, '../media'), p.slice(6)); return f ? serveFile(res, f) : res.end(); } // модели движка (тело гостя) лежат в media мира 010
      if (p.startsWith('/rocketbox/')) { const f = inside(path.join(MEDIA, 'models/rocketbox'), p.slice(10)); return f ? serveFile(res, f) : res.end(); }
      const rel = p === '/' ? '/index.html' : p, own = WORLD !== ROOT && inside(WORLD, rel);
      const f = own && fs.existsSync(own) ? own : inside(ROOT, rel); return f ? serveFile(res, f) : res.end();
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (p === '/hear') return json(res, await hear(body, Number(u.searchParams.get('t0')) || 0));
      if (p === '/text') { const { text } = JSON.parse(body); phrase(text, now(), now()); return json(res, { ok: 1 }); }
      if (p === '/event') { const ev = JSON.parse(body); if (ev.state) { worldState = ev.state; delete ev.state; } // важное событие несёт состояние мира после действия — строка «мир:» не отстаёт
        // действие voiceSaid шлёт сервер, а не Fable: если игра его не знает или на нём упала — Fable об этом не слышит (только журнал)
        if (ev.name === 'действие не выполнено' && /^\{"voiceSaid"/.test(String(ev.data?.действие || ''))) { log({ voiceSaid_refused: ev.data }); console.log('мир: voiceSaid не принят —', ev.data?.причина); return json(res, { ok: 1 }); }
        if (ev.name === 'запись пошла') recOn = true; if (ev.name === 'запись остановлена') recOn = false; if (ev.name === 'гость выключил мир') worldOff = true; toInbox({ kind: 'event', ...ev }); return json(res, { ok: 1 }); }
      if (p === '/state') { worldState = JSON.parse(body); return json(res, { ok: 1 }); }
      if (p === '/played') { const { id, t, end } = JSON.parse(body), e = tts.get(id); if (e && end) e.t_end = end; else { if (e) e.t_play = t || now(); if (round?.tts === id && !round.t_play) round.t_play = t || now(); } if (end) afterSpeech.get(id)?.();
        if (e?.watch && !end) e.watch(((e.done ? e.dur || 0 : 40) + 8) * 1000); // реплика персонажа зазвучала: ждать её конца не дольше её длины
        log({ played: id, end }); return json(res, { ok: 1 }); }
      if (p === '/voice') return json(res, await voiceLine(JSON.parse(body)));
      if (p === '/fable') {
        const m = JSON.parse(body); log({ fable: m });
        // пометки подачи «[excited]» не озвучиваем и в мир не шлём: голос с ними перегретый — только текст и знаки.
        // Мир, где они нужны, ставит в config.json voice.tags: true; в мире слова-пометки не показываются (voice.js)
        if (typeof m.text === 'string' && !CFG.voice.tags) m.text = m.text.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
        // смена локации из реплики ждёт конца этой реплики: сначала «три, два, один», потом перенос
        const later = m.text ? (m.actions || []).filter((x) => x && x.go != null) : [], nowActs = (m.actions || []).filter((x) => !later.includes(x));
        if (nowActs.length) push({ type: 'act', actions: nowActs });
        if (m.code) push({ type: 'code', code: m.code, name: m.name });
        let id = null; if (m.text) { id = String(ttsN + 1).padStart(4, '0'); speak(m.text, m); }
        if (later.length) { const fire = () => { if (afterSpeech.delete(id)) push({ type: 'act', actions: later }); }; afterSpeech.set(id, fire); setTimeout(fire, 40000); }
        return json(res, { ok: 1, tts: id, clients: clients.size });
      }
      // запись: кусок дописывается в конец файла; pos — место куска в файле (MP4 глаз гостя из rec-worker.js)
      if (p === '/rec') { const f = path.join(SES, 'rec', path.basename(u.searchParams.get('name') || 'rec.webm')), pos = u.searchParams.get('pos');
        if (pos == null) fs.appendFileSync(f, body); else { const fd = fs.openSync(f, fs.existsSync(f) ? 'r+' : 'w'); fs.writeSync(fd, body, 0, body.length, Number(pos)); fs.closeSync(fd); }
        return json(res, { ok: 1 }); }
      if (p === '/frame') { const f = path.join(SES, 'frames', path.basename(u.searchParams.get('name') || `f${now()}.jpg`)); fs.writeFileSync(f, body); toInbox({ kind: 'frame', file: f, url: '/media/' + path.relative(MEDIA, f).replace(/\\/g, '/'), important: true }); return json(res, { file: f }); }
      if (p === '/quit') { json(res, { ok: 1 }); quitting = true; stt?.kill(); setTimeout(() => process.exit(0), 100); return; }
      if (p === '/client-log') { log({ client: body.toString().slice(0, 2000) }); return json(res, { ok: 1 }); }
    }
    res.writeHead(404); res.end();
  } catch (err) { console.log('сервер: ошибка', p, err.message); json(res, { error: err.message }, 500); }
};
// Порт может быть ещё занят прошлым сервером (он закрывается секунду-две) — пробуем до 10 с, потом честно выходим.
const web = http.createServer(handler); let tries = 0;
web.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && ++tries <= 20) return setTimeout(() => web.listen(PORT, '127.0.0.1'), 500);
  console.log(err.code === 'EADDRINUSE' ? `ПОРТ ${PORT} ЗАНЯТ другой программой — мир не запущен. Закрой старое окно сервера и запусти снова.` : 'сервер не запустился: ' + err.message); process.exit(1);
});
web.listen(PORT, '127.0.0.1');
web.on('listening', () => {
  console.log(`мир: http://localhost:${PORT}  запись: ${SES}`); startStt();
  console.log({ elevenlabs: KEY && !CFG.voice.id ? 'голос: ElevenLabs выбран, но в config.json пустой voice.id — хозяин мира будет без голоса' : KEY ? 'голос: ElevenLabs' :'голос: ElevenLabs выбран, но нет ключа ELEVENLABS_API_KEY (файл .env в корне проекта) — хозяин мира будет без голоса',
    edge: `голос: бесплатный голос Microsoft Edge ${EDGE_VOICE} (без ключа, нужен интернет)${KEY ? (CFG.voice.id ? '' : '. Ключ ElevenLabs есть, но голос не выбран: config.json → voice.id') : '. Голос живее — с ключом ElevenLabs, README.md'}`,
    none: 'голос: выключен (config.json → voice.provider "none") — только слова в мире' }[PROVIDER]
    || `голос: в config.json нет такого voice.provider «${PROVIDER}» — бывает elevenlabs, edge, none`);
  if (process.env.OPEN) setTimeout(() => { // запуск из «Запуск мира — шлем.bat» или «— компьютер.bat»: открыть мир в Chrome (или в браузере по умолчанию)
    // сервер перезапустили, а вкладка мира жива — она сама подключается за 3 с; второе окно дало бы два мира и двойной голос
    if (clients.size) { console.log('мир уже открыт в браузере — новое окно не открываю'); return; }
    // PC=1 — запуск «с компьютера»: режим монитора, даже если шлем подключён, на мониторе один вид — глаза игрока.
    // Со шлемом на мониторе три камеры (глаза гостя, глаза Fable, сбоку) — для того, кто смотрит со стороны.
    const url = `http://localhost:${PORT}/?${process.env.PC ? 'pc=1' : 'views=3'}`, chrome = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map((d) => path.join(d, 'Google/Chrome/Application/chrome.exe')).concat('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome').find(fs.existsSync);
    // Свой профиль Chrome в папке мира: только так действуют ключи, запрещающие Chrome усыплять окно, когда его перекрыли или свернули
    // (иначе через 5 минут в фоне встают таймеры страницы — музыка и появление слов).
    const flags = ['--user-data-dir=' + path.join(ROOT, '.chrome'), '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'];
    if (chrome) spawn(chrome, [...flags, '--new-window', url], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else console.log('Chrome не найден — открой в Chrome адрес ' + url);
  }, 5000);
});
// запасной вход для браузера самого шлема: по сети Wi-Fi, с самоподписанным сертификатом (без него шлем не даст ни VR, ни микрофон)
const certDir = path.join(ROOT, 'cert');
if (fs.existsSync(path.join(certDir, 'key.pem')) && !process.env.NO_LAN) {
  https.createServer({ key: fs.readFileSync(path.join(certDir, 'key.pem')), cert: fs.readFileSync(path.join(certDir, 'cert.pem')) }, handler).on('error', (err) => console.log('запасной вход для браузера шлема не открыт: ' + err.message)).listen(PORT + 433, '0.0.0.0', () => {
    const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
    console.log('для браузера шлема (запасной путь): ' + ips.map((ip) => `https://${ip}:${PORT + 433}`).join('  ')); });
}
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 15000);
process.on('SIGINT', () => { quitting = true; stt?.kill(); process.exit(0); });
// сервер не должен падать посреди встречи из-за одной ошибки в обработчике

process.on('uncaughtException', (err) => { console.log('сервер: ошибка, работаю дальше:', err?.stack || err); try { log({ server_error: String(err?.stack || err).slice(0, 2000) }); } catch { /* журнал недоступен */ } });
process.on('unhandledRejection', (err) => { console.log('сервер: ошибка, работаю дальше:', err?.stack || err); });
