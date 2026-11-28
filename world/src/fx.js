// Вспышка при смене локации и звуки мира. Все звуки рождаются кодом: чужих записей нет.
import * as THREE from 'three';

export function makeFx(W) {
  // вспышка «бах»: белая сфера вокруг головы, гаснет за 0,45 с
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false });
  const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), flashMat); flashMesh.renderOrder = 9999; flashMesh.visible = false; W.camera.add(flashMesh);
  let flashT = 0;
  // затемнение мира (рубильник «выключить мир»)
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false });
  const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), fadeMat); fadeMesh.renderOrder = 9998; fadeMesh.visible = false; W.camera.add(fadeMesh);
  let fadeGoal = 0, fadeRate = 1, song = null;

  let ctx = null, master = null, amb = null, noiseBuf = null;
  let worldVol = 1; // громкость фона и звуков мира относительно голоса Fable: config.json → client.sound.world, на ходу — действие {"mix":{"world":0.5}}
  const ready = () => { if (!ctx) { ctx = W.voice.ctx; master = ctx.createGain(); master.gain.value = 0.7 * worldVol; master.connect(W.voice.listener.getInput());
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6; } }
    return ctx.state === 'running'; };
  const env = (g, t, a, d, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function tone(f0, f1, dur, peak = 0.3, type = 'sine', when = 0) {
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur); env(g, t, 0.005, dur, peak);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, peak = 0.3, freq = 2000, q = 1, type = 'bandpass', when = 0) {
    const t = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; s.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q; env(g, t, 0.004, dur, peak); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  const sounds = {
    snap: () => { noise(0.05, 0.9, 3500, 2, 'highpass'); tone(1800, 600, 0.04, 0.3, 'square'); },
    bang: () => { tone(160, 35, 0.5, 0.9); noise(0.35, 0.5, 400, 0.5, 'lowpass'); },
    pop: (p = 1) => tone(300 * p, 900 * p, 0.09, 0.35),
    chime: (p = 1) => { for (const [m, k] of [[1, 0.25], [2.01, 0.12], [3.02, 0.06]]) tone(660 * p * m, 655 * p * m, 1.4, k); },
    word: (p = 1) => tone(900 * p, 880 * p, 0.12, 0.05),
    whoosh: () => noise(0.5, 0.35, 900, 0.7),
    thud: () => { tone(110, 50, 0.18, 0.7); noise(0.08, 0.3, 300, 1, 'lowpass'); },
    knock: () => { tone(420, 180, 0.07, 0.5, 'triangle'); noise(0.05, 0.4, 1800, 1); },
    roll: () => noise(1.6, 0.25, 180, 1.2, 'lowpass'),
    crash: () => { for (let i = 0; i < 7; i++) { noise(0.12, 0.5, 1500 + Math.random() * 2500, 3, 'bandpass', i * 0.04 + Math.random() * 0.03); tone(500 + Math.random() * 400, 200, 0.08, 0.3, 'triangle', i * 0.04); } },
    swish: () => noise(0.25, 0.4, 5000, 1.5, 'highpass'),
    bounce: () => tone(190, 90, 0.12, 0.6, 'triangle'),
    win: () => [0, 4, 7, 12].forEach((s, i) => tone(523 * 2 ** (s / 12), 523 * 2 ** (s / 12), 0.25, 0.25, 'square', i * 0.11)),
    lose: () => [0, -3, -7].forEach((s, i) => tone(392 * 2 ** (s / 12), 380 * 2 ** (s / 12), 0.3, 0.2, 'sawtooth', i * 0.16)),
    bark: () => { for (const w of [0, 0.22]) { tone(220, 120, 0.13, 0.7, 'sawtooth', w); noise(0.12, 0.5, 700, 2, 'bandpass', w); } },
    pant: () => { for (let i = 0; i < 4; i++) noise(0.12, 0.12, 1500, 1, 'bandpass', i * 0.2); },
    grow: () => tone(180, 720, 0.7, 0.2, 'triangle'),
  };

  // фон локации: гул пустоты, море, комната, зал автоматов
  function ambience(kind) {
    if (!ready()) { fx._pending = kind; return; }
    if (amb) { const old = amb; old.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => old.nodes.forEach((n) => { try { n.stop(); } catch { /* уже остановлен */ } }), 2500); amb = null; }
    if (!kind) return;
    const g = ctx.createGain(); g.gain.value = 0; g.connect(master); const nodes = [];
    const osc = (f, type, vol) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = f; og.gain.value = vol; o.connect(og); og.connect(g); o.start(); nodes.push(o); return o; };
    const nz = (freq, type, vol, lfo) => { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; ng.gain.value = vol;
      s.connect(f); f.connect(ng); ng.connect(g); s.start(0, Math.random()); nodes.push(s);
      if (lfo) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = lfo; lg.gain.value = vol * 0.7; l.connect(lg); lg.connect(ng.gain); l.start(); nodes.push(l); } };
    let vol = 0.5;
    if (kind === 'void') { osc(55, 'sine', 0.22); osc(55.6, 'sine', 0.2); osc(82.4, 'sine', 0.08); osc(165.2, 'sine', 0.025); nz(300, 'lowpass', 0.05, 0.07); vol = 0.6; }
    if (kind === 'sea') { nz(500, 'lowpass', 0.5, 0.11); nz(1400, 'bandpass', 0.12, 0.17); nz(250, 'lowpass', 0.2, 0.05); vol = 0.55; }
    if (kind === 'room') { nz(200, 'lowpass', 0.12); osc(100, 'sine', 0.01); vol = 0.4; }
    if (kind === 'arcade') { nz(250, 'lowpass', 0.1); osc(60, 'sawtooth', 0.012); osc(120, 'sine', 0.02); vol = 0.5; }
    g.gain.setTargetAtTime(vol, ctx.currentTime, 0.8); amb = { g, nodes, kind };
  }

  // музыка автомата: простая петля в духе игровых залов, играется кодом
  function music(on) {
    if (!ready()) return false; if (on === undefined) on = !song; if (!on) { if (song) { clearInterval(song.timer); song.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); song = null; } return false; }
    if (song) return true;
    const g = ctx.createGain(); g.gain.value = 0.22; g.connect(master); const step = 60 / 118 / 4; let n = 0, t = ctx.currentTime + 0.1;
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], hz = (m) => 440 * 2 ** ((m - 69) / 12);
    const note = (f, when, dur, type, vol) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = f; og.gain.setValueAtTime(vol, when); og.gain.exponentialRampToValueAtTime(0.001, when + dur); o.connect(og); og.connect(g); o.start(when); o.stop(when + dur + 0.02); };
    const tick = () => { while (t < ctx.currentTime) { t += step; n++; } // страница замерла — пропущенные ноты не играются пачкой вдогонку
      while (t < ctx.currentTime + 1.2) { const bar = (n >> 4) % 4, s = n % 16, ch = chords[bar];
      note(hz(ch[[0, 1, 2, 1, 2, 1, 0, 2][s % 8]] + 12), t, step * 0.9, 'square', 0.16); if (s % 4 === 0) note(hz(ch[0] - 12), t, step * 3.5, 'triangle', 0.5); if (s % 8 === 4) note(hz(ch[2] + 24), t, step * 1.5, 'sine', 0.12);
      if (s % 2 === 0) { const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain(); src.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 6000; ng.gain.setValueAtTime(s % 4 === 2 ? 0.5 : 0.18, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05); src.connect(f); f.connect(ng); ng.connect(g); src.start(t, Math.random()); src.stop(t + 0.07); }
      n++; t += step; } };
    song = { g, timer: setInterval(tick, 120) }; tick(); return true;
  }

  const fx = {
    music,
    fade(k, sec = 2) { fadeGoal = k; fadeRate = 1 / Math.max(0.05, sec); fadeMesh.visible = true; },
    flash() { flashT = 0.45; flashMesh.visible = true; fx.sound('snap'); fx.sound('bang'); },
    sound(name, p) { if (!ready()) return; try { sounds[name]?.(p); } catch (e) { W.fail('звук ' + name, e); } },
    tone: (...a) => { if (ready()) tone(...a); },
    ambience,
    volume(k) { worldVol = k; if (master) master.gain.setTargetAtTime(0.7 * k, ctx.currentTime, 0.2); },
    unlock() { setTimeout(() => { if (ready() && fx._pending !== undefined) { ambience(fx._pending); fx._pending = undefined; } }, 300); },
    update(dt) {
      if (fadeMat.opacity !== fadeGoal) { fadeMat.opacity += Math.sign(fadeGoal - fadeMat.opacity) * Math.min(Math.abs(fadeGoal - fadeMat.opacity), fadeRate * dt); if (fadeMat.opacity <= 0) fadeMesh.visible = false; }
      if (flashT > 0) { flashT -= dt; flashMat.opacity = Math.max(0, flashT / 0.45) ** 1.5; if (flashT <= 0) flashMesh.visible = false; }
    },
  };
  return fx;
}
