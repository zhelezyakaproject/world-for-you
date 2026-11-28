// Голос: микрофон гостя режется на фразы и уходит на распознавание; речь Fable играет из его тела, слова идут в мир по времени звука.
import * as THREE from 'three';

// «Я {здесь|рядом|тут}, гость.» → слова с вариантами; первый вариант — тот, что звучит.
// «[whispers] Тише.» — тег подачи для голоса: в мир словом не идёт, но в разметке времени букв место занимает.
export function parseWords(text) {
  const spoken = text.replace(/\{([^|}]*)\|[^}]*\}/g, '$1').replace(/[{}]/g, ''); // то же, что сервер шлёт на озвучку
  const out = []; let pos = 0;
  for (const tok of text.match(/\[[^\]]*\]|(\{[^}]*\}|[^\s{}[\]]+)+/g) || []) {
    let alts = [];
    const word = tok[0] === '[' ? tok : tok.replace(/\{([^}]*)\}/g, (_, g) => { const o = g.split('|').map((s) => s.trim()); if (!alts.length) alts = o.slice(1); return o[0]; });
    const i = spoken.indexOf(word, pos), at = i < 0 ? pos : i; pos = at + word.length;
    if (tok[0] !== '[') out.push({ word, alts, at });
  }
  return out;
}

export function makeVoice(W) {
  const listener = new THREE.AudioListener(); W.camera.add(listener);
  const ctx = listener.context;
  const bus = ctx.createGain(), analyser = ctx.createAnalyser(); analyser.fftSize = 512; bus.connect(analyser);
  const pa = new THREE.PositionalAudio(listener); pa.setRefDistance(5); pa.setRolloffFactor(0.6); pa.panner.panningModel = 'HRTF'; pa.setNodeSource(bus);
  // refDistance 5: до 5 м голос Fable в полную громкость файла ElevenLabs (было 1,5 м: на расстоянии разговора 3–5 м голос тише на 5–7 дБ — проверка в шлеме 23.11.2026)
  const flat = ctx.createGain(); flat.gain.value = 0; bus.connect(flat); flat.connect(listener.getInput()); // голос «отовсюду», пока у Fable нет тела
  // голоса-персонажи (сервер: voice-say): не из тела Fable, а отовсюду, мимо его анализатора — тело Fable от них не светится и не говорит.
  // Идут в тот же вход слушателя, что и всё остальное, поэтому попадают в запись (spectator.js) и в громкость голоса {"mix":{"voice":…}}
  const others = ctx.createGain(), othersFlat = ctx.createGain(); others.connect(othersFlat); othersFlat.connect(listener.getInput());
  // …пока игра не дала голосу-персонажу место: v.voiceAt(предмет) — голос идёт из этого предмета (карточка жителя), v.voiceAt(null) — снова отовсюду
  const po = new THREE.PositionalAudio(listener); po.setRefDistance(5); po.setRolloffFactor(0.6); po.panner.panningModel = 'HRTF'; po.setNodeSource(others); po.gain.gain.value = 0;
  const buf = new Uint8Array(analyser.fftSize);
  const queue = []; let cur = null, fableEnd = -1e9; // fableEnd — конец любого голоса: от него считается хвост защиты от эха
  // speaking — говорит Fable; other — сторона голоса-персонажа, который звучит сейчас (или null)
  const v = { listener, ctx, pa, level: 0, speaking: false, other: null, micLevel: 0, guestSpeaking: false, micOn: false, lastHeard: '' };

  // голос отовсюду (k=1) или из тела (k=0)
  v.everywhere = (k) => { flat.gain.value = k; pa.gain.gain.value = 1 - k; };
  v.everywhere(1);
  v.voiceAt = (obj) => { po.removeFromParent(); if (obj) obj.add(po); othersFlat.gain.value = obj ? 0 : 1; po.gain.gain.value = obj ? 1 : 0; };

  W.on('net:say', (m) => { queue.push({ id: m.id, text: m.text, url: m.url, mood: m.mood, words: parseWords(m.text), chars: 0, starts: [], next: 0 }); if (!cur) play(); });
  // реплика голоса-персонажа встаёт в ту же очередь: не накладывается ни на Fable, ни на другого персонажа. Слова по телу Fable не летят.
  // Для игры: W-события voice:start / voice:end с { side, name, text } (сервер, когда реплика доиграла, шлёт ещё действие {"voiceSaid":{…}})
  W.on('net:voice-say', (m) => { queue.push({ id: m.id, side: m.side, name: m.name, text: m.text, url: m.url, words: [], chars: 0, starts: [], next: 0 }); if (!cur) play(); });
  W.on('net:align', (m) => { const u = cur?.id === m.id ? cur : queue.find((x) => x.id === m.id); if (u) u.starts.push(...m.starts); });
  function play() {
    cur = queue.shift(); if (!cur) return;
    const u = cur, a = new Audio(u.url); u.audio = a; a.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(a); src.connect(u.side ? others : bus);
    a.addEventListener('playing', () => { if (u.started) return; u.started = true; if (u.side) v.other = u.side; else v.speaking = true; W.net.send('/played', { id: u.id, t: Date.now() }); W.emit(u.side ? 'voice:start' : 'fable:speech-start', u); }, { once: false });
    const end = () => { if (cur !== u) return; while (u.next < u.words.length) emitWord(u); v.speaking = false; v.other = null; fableEnd = performance.now(); src.disconnect(); W.net.send('/played', { id: u.id, end: Date.now() }); W.emit(u.side ? 'voice:end' : 'fable:speech-end', u); cur = null; play(); };
    a.addEventListener('ended', end); a.addEventListener('error', () => { W.fail('голос', 'звук не проигрался ' + u.url); end(); });
    if (!u.side) W.emit('fable:speech-soon', u);
    a.play().catch((e) => { W.fail('голос', e); end(); });
  }
  const LEAD = 0.32; // варианты слова вспыхивают чуть раньше, чем слово звучит
  function emitWord(u) { const w = u.words[u.next]; W.emit('fable:word', { i: u.next, n: u.words.length, word: w.word, alts: w.alts, lead: LEAD, u }); u.next++; }
  v.update = () => {
    analyser.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; s += x * x; }
    v.level += (Math.min(1, Math.sqrt(s / buf.length) * 5) - v.level) * 0.35;
    const u = cur; if (!u?.started) return;
    const t = u.audio.currentTime + LEAD;
    while (u.next < u.words.length) {
      const w = u.words[u.next]; const st = u.starts[w.at] ?? (u.starts.length ? null : w.at * 0.072);
      if (st == null || st > t) break; emitWord(u);
    }
  };
  v.stop = () => { queue.length = 0; if (cur?.audio) { cur.audio.pause(); cur.audio.dispatchEvent(new Event('ended')); } };

  // ── микрофон ──
  async function startMic() {
    if (v.micOn || W.q.get('mic') === '0') return; v.micOn = true;
    // микрофон по имени из config.json (client.mic.device — часть названия): PICO Connect при подключении сам делает микрофоном Windows по умолчанию микрофон шлема
    const want = W.cfg.mic.device && (await navigator.mediaDevices.enumerateDevices()).find((d) => d.kind === 'audioinput' && !['default', 'communications'].includes(d.deviceId) && d.label.includes(W.cfg.mic.device));
    if (W.cfg.mic.device && !want) W.net.log(`микрофон «${W.cfg.mic.device}» не найден — беру микрофон Windows по умолчанию`);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(want ? { deviceId: { exact: want.deviceId } } : {}) } });
    W.net.log('микрофон: ' + (stream.getAudioTracks()[0]?.label || '?'));
    const mctx = new AudioContext({ sampleRate: 16000 });
    await mctx.audioWorklet.addModule('/src/mic-worklet.js');
    const node = new AudioWorkletNode(mctx, 'mic'); mctx.createMediaStreamSource(stream).connect(node);
    const ring = []; let ringN = 0, speech = null, above = 0, lastLoud = 0, voiced = 0;
    node.port.onmessage = (e) => {
      const b = e.data, c = W.cfg.mic; let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i];
      const rms = Math.sqrt(s / b.length); v.micLevel = rms;
      const thr = c.threshold, ms = (b.length / 16000) * 1000, now = performance.now();
      // У шлема динамики открытые: микрофон слышит голос Fable. Пока Fable (или голос-персонаж) говорит и ещё echoTailMs после, новая фраза не начинается (начатая раньше — дописывается).
      const echo = c.muteWhileFable !== false && (v.speaking || v.other || now - fableEnd < (c.echoTailMs ?? 700));
      if (!speech) {
        ring.push(b); ringN += ms; while (ringN > 400) { ringN -= (ring.shift().length / 16); }
        above = rms > thr && !echo ? above + 1 : 0;
        if (above >= 4) { speech = ring.splice(0); ringN = 0; voiced = 0; lastLoud = now; v.guestSpeaking = true; W.emit('guest:speaking', true); }
        return;
      }
      speech.push(b); if (rms > thr && !echo) { lastLoud = now; voiced += ms; }
      const total = speech.length * ms;
      if (now - lastLoud > c.silenceMs || total > c.maxMs) {
        const chunks = speech; speech = null; above = 0; v.guestSpeaking = false; W.emit('guest:speaking', false);
        if (voiced >= c.minMs) sendSpeech(chunks, Date.now() - Math.round(now - lastLoud));
      }
    };
  }
  async function sendSpeech(chunks, t0) {
    const n = chunks.reduce((a, c) => a + c.length, 0), pcm = new Int16Array(n); let o = 0;
    for (const c of chunks) for (let i = 0; i < c.length; i++) pcm[o++] = Math.max(-1, Math.min(1, c[i])) * 32767;
    W.emit('guest:phrase-sent', {});
    const r = await W.net.raw('/hear?t0=' + t0, pcm.buffer); if (r.echo) W.emit('guest:echo', r);
  }
  W.on('net:heard', (m) => { v.lastHeard = m.text; W.emit('guest:said', m.text); });
  // Баланс «голос Fable ↔ фон и звуки мира»: config.json → client.sound { voice, world } (1 — как есть); на ходу — действие {"mix":{"voice":1,"world":0.5}}
  v.volume = (k) => { bus.gain.setTargetAtTime(k, ctx.currentTime, 0.2); others.gain.setTargetAtTime(k, ctx.currentTime, 0.2); };
  W.actions.mix = (m) => { for (const k of ['voice', 'world']) if (m?.[k] != null && !(m[k] >= 0 && m[k] <= 3)) throw new Error(`${k}: число от 0 до 3`);
    if (m?.voice != null) v.volume(m.voice); if (m?.world != null) W.fx.volume(m.world); W.net.event('громкость', { голос: m?.voice, мир: m?.world }); };
  v.unlock = () => { if (W.cfg?.sound && !v.mixed) { v.mixed = true; W.actions.mix(W.cfg.sound); } if (ctx.state !== 'running') ctx.resume(); startMic().catch((e) => { v.micOn = false; W.fail('микрофон', e); }); W.fx.unlock(); };
  return v;
}
