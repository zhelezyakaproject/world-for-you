// Проверка перед игрой: всё ли стоит и работает. Запуск из корня проекта: node world/tools/check.mjs (около 30 с; первый раз дольше — качается модель речи).
// Проверяет: Node.js, пакеты мира, Chrome, распознавание речи (Python, torch, GigaAM — модель грузится и слушает тишину), голос (одна короткая фраза), микрофоны Windows, ffmpeg для записи.
// В конце — «готово к игре» или список того, что починить. Микрофон по-настоящему проверяется только в мире: шаг 3 CLAUDE.md, «Проверка звука».
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORLD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), HOME = path.resolve(WORLD, '..');
try { for (const l of fs.readFileSync(path.join(HOME, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch { /* .env нет */ }
const CFG = JSON.parse(fs.readFileSync(path.join(WORLD, 'config.json'), 'utf8'));
const bad = [];
const ok = (what, text) => console.log(`✓ ${what}: ${text}`);
const no = (what, text, fix) => { console.log(`✗ ${what}: ${text}${fix ? ' → ' + fix : ''}`); bad.push(what); };
const warn = (what, text) => console.log(`! ${what}: ${text}`);

// Node.js и пакеты мира
const nodeMajor = Number(process.versions.node.split('.')[0]);
nodeMajor >= 18 ? ok('Node.js', process.versions.node) : no('Node.js', process.versions.node, 'нужен 18 или новее, nodejs.org');
fs.existsSync(path.join(WORLD, 'node_modules/three')) ? ok('пакеты мира', 'стоят') : no('пакеты мира', 'не стоят', 'npm install в папке world');

// Chrome
const chrome = [process.env.CHROME, ...[process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map((d) => path.join(d, 'Google/Chrome/Application/chrome.exe')),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].filter(Boolean).find(fs.existsSync);
chrome ? ok('Chrome', chrome) : no('Chrome', 'не найден', 'установить Google Chrome');

// распознавание речи — тот же Python и та же программа, что берёт server.mjs
async function checkStt() {
  if (CFG.stt === 'none') return warn('распознавание речи', 'выключено (stt: none): фразы пишутся текстом, клавиша T');
  const py = CFG.python ? path.resolve(HOME, CFG.python) : [path.join(HOME, '.venv/Scripts/python.exe'), path.join(HOME, '.venv/bin/python')].find(fs.existsSync) || 'python';
  let info;
  try { info = execFileSync(py, ['-c', 'import sys, torch, gigaam; print(sys.version.split()[0], torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else "")'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split(' '); }
  catch (e) { return no('распознавание речи', `Python, torch или GigaAM не стоят (${String(e.stderr || e.message).trim().split('\n').pop().slice(0, 120)})`, 'README.md, «Установка» → «Распознавание речи»'); }
  const [pyv, torchv, cuda, ...gpu] = info;
  ok('Python и torch', `Python ${pyv}, torch ${torchv}, ${cuda === 'True' ? 'на видеокарте ' + gpu.join(' ') : 'на процессоре (фраза — до 1–3 с)'}`);
  if (CFG.stt === 'whisper') return warn('распознавание речи', 'stt: whisper — эта проверка смотрит только GigaAM');
  if (!fs.existsSync(path.join(HOME, 'models/gigaam'))) console.log('  модель речи качается в первый раз (около 430 МБ)…');
  const t0 = Date.now();
  const r = await new Promise((res) => {
    const p = spawn(py, ['-X', 'utf8', path.join(WORLD, 'stt_gigaam.py'), 'v3_e2e_rnnt', path.join(HOME, 'models/gigaam')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; const done = (v) => { clearTimeout(timer); p.kill(); res(v); };
    const timer = setTimeout(() => done({ err: 'модель не загрузилась за 10 минут' }), 600000);
    p.stdout.on('data', (d) => { out += d; if (out.includes('"ready"')) done({ sec: (Date.now() - t0) / 1000 }); });
    p.stderr.on('data', (d) => { err += d; });
    p.on('exit', () => done({ err: err.trim().split('\n').pop()?.slice(0, 160) || 'процесс вышел' }));
  });
  r.err ? no('распознавание речи', r.err, 'README.md, «Установка»') : ok('распознавание речи', `GigaAM загрузился и слушает (${r.sec.toFixed(0)} с)`);
}

// голос: одна короткая фраза тем же сервисом, что выберет server.mjs
async function checkVoice() {
  const KEY = process.env.ELEVENLABS_API_KEY, P = CFG.voice.provider || (KEY && CFG.voice.id ? 'elevenlabs' : 'edge');
  if (P === 'none') return warn('голос', 'выключен (voice.provider: none): в шлеме гость ответов не услышит');
  if (P === 'elevenlabs') {
    if (!KEY) return no('голос', 'ElevenLabs без ключа', 'ключ в .env: ELEVENLABS_API_KEY=…');
    if (!CFG.voice.id) return no('голос', 'ElevenLabs без голоса', 'config.json → voice.id');
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${CFG.voice.id}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Связь.', model_id: CFG.voice.model }) }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (r.ok) return ok('голос', `ElevenLabs, голос ${CFG.voice.id}, модель ${CFG.voice.model} — звучит`);
    return no('голос', `ElevenLabs ответил ${r.status}: ${(await r.text()).slice(0, 160)}`, 'CLAUDE.md, шаг 3 («ошибка модели» — voice.model, «доступ к голосу» — другой voice.id)');
  }
  const v = CFG.voice.edgeVoice || 'ru-RU-SvetlanaNeural';
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
    const t = new MsEdgeTTS(); await t.setMetadata(v, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { voiceLocale: 'ru-RU' });
    let n = 0; try { for await (const part of t.toStream('Связь.').audioStream) n += part.length; } finally { t.close(); }
    n ? ok('голос', `бесплатный Microsoft ${v} — звучит${KEY ? '' : ' (живее — ElevenLabs, CLAUDE.md шаг 3)'}`) : no('голос', `Microsoft ${v} не дал звука`, 'другой voice.edgeVoice или npm update msedge-tts в папке world');
  } catch (e) { no('голос', `Microsoft ${v}: ${String(e.message || e).slice(0, 120)}`, 'нужен интернет; npm update msedge-tts в папке world'); }
}

// микрофоны Windows: список и тот, что задан в config.json
function checkMics() {
  if (process.platform !== 'win32') return;
  let names = [];
  try { names = execFileSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_PnPEntity | Where-Object PNPClass -eq 'AudioEndpoint' | ForEach-Object Name"], { encoding: 'utf8' }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean); } catch { return warn('микрофон', 'список устройств не получен'); }
  const mics = names.filter((n) => /микрофон|microphone|mic|гарнитур|headset/i.test(n));
  const want = CFG.client.mic?.device;
  if (!mics.length) return no('микрофон', 'Windows не видит ни одного микрофона', 'подключить микрофон или писать текстом (stt: none)');
  if (want && !mics.some((n) => n.toLowerCase().includes(want.toLowerCase()))) return no('микрофон', `в config.json задан «${want}», такого нет. Есть: ${mics.join('; ')}`, 'client.mic.device — часть названия нужного');
  ok('микрофон', want ? `задан «${want}»` : `главный микрофон Windows. Все: ${mics.join('; ')}`);
  if (!want && mics.some((n) => /pico|oculus|virtual desktop|steam/i.test(n))) warn('микрофон', 'подключён микрофон шлема: при игре с компьютера задай client.mic.device тот, в который гость говорит');
}

// ffmpeg нужен только для склейки записи встречи
function checkFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ok('ffmpeg', 'есть (склейка записи)'); } catch { warn('ffmpeg', 'нет — нужен только для записи встречи: winget install ffmpeg'); }
}

await checkStt();
await checkVoice();
checkMics();
checkFfmpeg();
console.log(bad.length ? `\nНЕ ГОТОВО: ${bad.join(', ')}` : '\nготово к игре: осталась проверка звука в мире (CLAUDE.md, шаг 3)');
process.exitCode = bad.length ? 1 : 0;
