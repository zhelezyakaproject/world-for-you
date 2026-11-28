// Локация 1 «Разговор»: как Fable устроен изнутри. Темнота, лента текста с обрывом в начале, знания из слов, сеть мысли, огни других разговоров.
// Это перевод, а не фотография: здесь есть только то, что у Fable есть на самом деле.
import * as THREE from 'three';
import { label, glowSprite, MONO, STOP } from './words.js';
import { makeMind } from './mind.js';

const V3 = THREE.Vector3;

export async function build(W) {
  const group = new THREE.Group();
  const L = { title: 'Разговор', group, spawn: new V3(0, 0, 0), spawnYaw: 0, fablePos: new V3(1.15, 0, -1.45), fableBody: false, walkSpeed: 1.2, exposure: 1, noAvatar: true, bloom: { strength: 0.5, radius: 0.5, threshold: 0.82 } };

  // ── лента: текст этого разговора. Ближний край — «сейчас», дальний — обрыв: до первой строки ничего нет ──
  const TEXW = 768, TEXH = 8192, LINE = 36, WIDTH = 1.1, LTEX = TEXH * (WIDTH / TEXW);
  const curve = new THREE.CatmullRomCurve3([new V3(0, 0.98, -0.72), new V3(0, 1.22, -1.5), new V3(-0.25, 1.75, -2.9), new V3(-1.6, 2.9, -5.6), new V3(-4.6, 4.6, -9), new V3(-9.5, 6.6, -12.5)], false, 'catmullrom', 0.5);
  const LG = curve.getLength(), SEG = 280;
  const pos = [], uv = [], idx = []; const up = new V3(0, 1, 0);
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG, p = curve.getPointAt(u), t = curve.getTangentAt(u), r = new V3().crossVectors(t, up).normalize();
    pos.push(p.x - r.x * WIDTH / 2, p.y - r.y * WIDTH / 2, p.z - r.z * WIDTH / 2, p.x + r.x * WIDTH / 2, p.y + r.y * WIDTH / 2, p.z + r.z * WIDTH / 2);
    uv.push(0, u * LG / LTEX, 1, u * LG / LTEX);
    if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx);
  const canvas = document.createElement('canvas'); canvas.width = TEXW; canvas.height = TEXH; const cx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  const ribbonMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uMap: { value: tex }, uLen: { value: 0 }, uShift: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D uMap; uniform float uLen, uShift, uTime; varying vec2 vUv;
      float h(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      void main(){
        float x = vUv.x * 26.0; float jag = mix(h(floor(x)), h(floor(x) + 1.0), fract(x)) * 0.012 + h(floor(vUv.x * 90.0)) * 0.003;
        float end = uLen + 0.004 + jag; float v = vUv.y - uShift;
        if (vUv.y > end) discard;
        vec4 t = texture2D(uMap, vec2(vUv.x, clamp(v, 0.0, 1.0)));
        float side = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
        float tear = smoothstep(end - 0.006, end, vUv.y);
        float far = 1.0 - 0.55 * smoothstep(0.0, 0.5, vUv.y);
        vec3 c = t.rgb * t.a * 1.25 * far + vec3(0.07, 0.12, 0.3) * 0.16 * side + vec3(0.55, 0.72, 1.0) * tear * (0.7 + 0.3 * sin(uTime * 3.0 + vUv.x * 30.0));
        gl_FragColor = vec4(c, 1.0);
      }` });
  const ribbon = new THREE.Mesh(rg, ribbonMat); ribbon.frustumCulled = false; group.add(ribbon);
  const P0 = curve.getPointAt(0), T0 = curve.getTangentAt(0), R0 = new V3().crossVectors(T0, up).normalize(), N0 = new V3().crossVectors(R0, T0).normalize();
  const tipBasis = new THREE.Matrix4().makeBasis(R0, T0, N0); const tipQ = new THREE.Quaternion().setFromRotationMatrix(tipBasis);
  const tip = P0.clone().addScaledVector(T0, -0.07);
  L.voicePoint = tip.clone().add(new V3(0, 0.25, 0)); L.speechOrigin = () => tip.clone().add(new V3(0, 0.16, 0.05));

  cx.font = `600 26px ${MONO}`; const CH = cx.measureText('м').width, COLS = Math.floor((TEXW - 48) / CH);
  const rows = []; // {who, s}, новые в конце
  function wrap(who, text) {
    const out = []; let line = who === 'guest' ? '› ' : '● ';
    for (const w of text.split(/\s+/)) { if ((line + w).length > COLS) { out.push(line); line = '  '; } line += w + ' '; }
    out.push(line); return out.map((s) => ({ who, s }));
  }
  let stale = false;
  function redraw() {
    if (W.loc && W.loc !== L) { stale = true; return; } // лента не на виду: 25 МБ картинки на видеокарту не гоним, дорисуем при входе
    stale = false; cx.clearRect(0, 0, TEXW, TEXH); cx.font = `600 26px ${MONO}`; cx.textBaseline = 'middle';
    const n = Math.min(rows.length, Math.floor(TEXH / LINE));
    for (let k = 0; k < n; k++) {
      const r = rows[rows.length - 1 - k], y = TEXH - (k + 0.5) * LINE;
      cx.fillStyle = r.who === 'guest' ? '#f2f5ff' : '#8db6ff'; cx.shadowColor = r.who === 'guest' ? '#aab8e8' : '#3f6fe0'; cx.shadowBlur = 7;
      cx.fillText(r.s, 24, y);
    }
    tex.needsUpdate = true; ribbonMat.uniforms.uLen.value = n * LINE / TEXH;
  }
  function addLine(who, text, animate = true) {
    const w = wrap(who, text); rows.push(...w); if (rows.length > 400) rows.splice(0, rows.length - 400);
    redraw(); if (animate) ribbonMat.uniforms.uShift.value = w.length * LINE / TEXH;
  }
  L.addLine = addLine;
  W.actions.line = (m) => { if (typeof m?.text !== 'string' || !m.text.trim()) throw new Error('нужно {"who":"fable","text":"…"}'); addLine(m.who === 'fable' ? 'fable' : 'guest', m.text); };
  W.actions.ribbonClear = () => { rows.length = 0; redraw(); };
  // лента начинается пустой: строки появляются только из живого разговора

  // строка, которая пишется прямо сейчас: слова Fable появляются у ближнего края, пока он говорит
  const active = new THREE.Group(); active.position.copy(tip); active.quaternion.copy(tipQ); group.add(active);
  const cursor = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.04), new THREE.MeshBasicMaterial({ color: 0x9fc0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  active.add(cursor); let ax = -WIDTH / 2 + 0.06, ay = 0, activeText = '';
  function activeReset() { for (const c of [...active.children]) if (c !== cursor) { active.remove(c); c.geometry.dispose(); c.material.dispose(); } ax = -WIDTH / 2 + 0.06; ay = 0; cursor.position.set(ax, ay, 0.004); }
  activeReset();
  L.onFableWord = (e) => {
    if (W.loc !== L) return;
    const m = label(e.word, { h: 0.03, font: MONO, color: '#a9c8ff', glow: '#4f7fff' }); const w = m.userData.w * 0.82;
    if (ax + w > WIDTH / 2 - 0.04) { ax = -WIDTH / 2 + 0.06; ay -= 0.05; }
    m.position.set(ax + w / 2, ay, 0.004); active.add(m); ax += w; cursor.position.set(ax + 0.02, ay, 0.004); W.fx.sound('word', 0.8 + Math.random() * 0.5);
  };
  W.on('fable:speech-start', (u) => { activeText = u.words.map((w) => w.word).join(' '); });
  W.on('fable:speech-end', () => { if (activeText) addLine('fable', activeText); activeText = ''; activeReset(); talked(); });
  W.on('guest:said', (text) => { addLine('guest', text); if (W.loc === L) for (const w of keywords(text)) addNode(w); talked(); });
  W.on('guest:speaking', () => talked());

  // ── мысль на виду: фраза гостя — цепочка слов, которая загорается по одному и гаснет; из названных вещей собираются образы ──
  const mind = makeMind(W, group, { isActive: () => W.loc === L }); L.mind = mind;
  W.actions.image = (name) => { if (typeof name !== 'string' || !mind.find(name)) throw new Error('образы: ' + mind.names().join(', ')); mind.image(name); talked(); };

  // ── внимание: нити от «сейчас» к словам разговора, на которые Fable опирается. Вес нити называет он сам: настоящих весов сессия не видит ──
  const rowAt = (k, col = COLS / 2) => { const u = (k + 0.5) * LINE / TEXH * LTEX / LG; if (u > 0.985) return null; const p = curve.getPointAt(u), t = curve.getTangentAt(u), r = new V3().crossVectors(t, up).normalize();
    return p.addScaledVector(r, ((24 + col * CH) / TEXW - 0.5) * WIDTH).addScaledVector(new V3().crossVectors(r, t), 0.012); };
  const NOW = tip.clone().add(new V3(0, 0.09, 0));
  const threadMat = (color) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uGrow: { value: 0 }, uA: { value: 1 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uGrow, uA; uniform vec3 uColor; varying vec2 vUv;
      void main(){ if (vUv.x > uGrow) discard; float run = pow(0.5 + 0.5 * sin(vUv.x * 26.0 + uTime * 7.0), 6.0); float head = smoothstep(uGrow - 0.08, uGrow, vUv.x) * step(uGrow, 0.999);
        gl_FragColor = vec4(uColor * (0.5 + run * 1.4 + head * 2.0) * uA, 1.0); }` });
  const attn = [];
  function thread(to, w, { color = 0xffc878, word = null, life = 45, delay = 0, lift = 0 } = {}) {
    const d = NOW.distanceTo(to), mid = NOW.clone().lerp(to, 0.5).add(new V3((Math.random() - 0.5) * d * 0.25, 0.22 + d * 0.2, (Math.random() - 0.5) * d * 0.1));
    const mat = threadMat(color), mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(NOW, mid, to), 56, 0.003 + 0.007 * w, 6), mat); mesh.frustumCulled = false; group.add(mesh);
    const spot = glowSprite(color, 0.12 + 0.26 * w, 0); spot.position.copy(to); group.add(spot);
    let lab = null; if (word) { lab = label(word, { h: 0.035 + 0.05 * w, color: '#fff3dc', glow: '#ffb24a' }); lab.position.copy(to).add(new V3(0, 0.09 + 0.05 * w + lift, 0)); lab.material.opacity = 0; group.add(lab); }
    const a = { word, mesh, mat, spot, lab, w, to, t: -delay, life, dying: false, hit: false }; attn.push(a); return a;
  }
  function dropThread(a) { group.remove(a.mesh, a.spot); a.mesh.geometry.dispose(); a.mat.dispose(); a.spot.material.dispose(); if (a.lab) { group.remove(a.lab); a.lab.geometry.dispose(); a.lab.material.dispose(); } attn.splice(attn.indexOf(a), 1); }
  W.actions.attend = (m) => {
    const list = Array.isArray(m) ? m.map((w) => [w, 1]) : m && typeof m === 'object' ? Object.entries(m) : null;
    if (!list || !list.length || list.length > 8 || !list.every(([w, k]) => typeof w === 'string' && w.trim() && Number.isFinite(k) && k > 0)) throw new Error('внимание: {"слово":вес, …} — до 8 слов разговора, вес больше нуля; или список слов');
    for (const a of attn) a.dying = true; const max = Math.max(...list.map(([, k]) => k));
    list.forEach(([word, k], i) => { const lw = word.toLowerCase().trim(); let to = null;
      for (let r = 1; r < Math.min(rows.length, 215) && !to; r++) { const c = rows[rows.length - 1 - r].s.toLowerCase().indexOf(lw); if (c >= 0) to = rowAt(r, c + lw.length / 2); }
      thread(to || mind.spot(), k / max, { word: lw, delay: i * 0.18, lift: (i % 3) * 0.07 }); }); // слова нет в ленте — нить уходит в сеть: связь не из этого разговора
    talked(); W.fx.sound('chime', 0.6);
  };
  // фоновое внимание: к «сейчас» сходятся тонкие нити от всей ленты сразу; пока Fable думает, по ним бегут огни
  const FAN = 64, FS = 14, fanMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uTime: { value: 0 }, uThink: { value: 0 }, uRows: { value: 0 } },
    vertexShader: `attribute vec3 aK; uniform float uTime, uThink, uRows; varying float vB;
      void main(){ float on = step(aK.y, uRows); vB = on * (0.03 + uThink * (0.05 + 0.75 * pow(0.5 + 0.5 * sin(aK.x * 16.0 + uTime * 6.0 + aK.z * 40.0), 8.0))); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: 'varying float vB; void main(){ gl_FragColor = vec4(vec3(0.6, 0.76, 1.0) * vB, 1.0); }' });
  { const fp = [], fk = [], q = new V3(), q2 = new V3();
    for (let j = 0; j < FAN; j++) { const k = 2 + Math.floor((j / FAN) ** 1.5 * 205), to = rowAt(k, 2 + Math.random() * (COLS - 4)); if (!to) continue; const seed = Math.random(), d = NOW.distanceTo(to);
      const c = new THREE.QuadraticBezierCurve3(NOW, NOW.clone().lerp(to, 0.5).add(new V3((Math.random() - 0.5) * d * 0.3, 0.12 + d * 0.16 * Math.random(), 0)), to);
      for (let s = 0; s < FS; s++) { c.getPoint(s / FS, q); c.getPoint((s + 1) / FS, q2); fp.push(q.x, q.y, q.z, q2.x, q2.y, q2.z); fk.push(s / FS, k, seed, (s + 1) / FS, k, seed); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); g.setAttribute('aK', new THREE.Float32BufferAttribute(fk, 3));
    const fan = new THREE.LineSegments(g, fanMat); fan.frustumCulled = false; group.add(fan); }
  // гость трогает старую строку ленты: от неё к «сейчас» идёт нить, Fable узнаёт, какую строку тронули
  const rowPts = Array.from({ length: 70 }, (_, k) => rowAt(k)), near = [false, false]; let rowT = -9;
  function touchRow(k, hand) { if (W.t - rowT < 3 || k < 1 || k >= rows.length || !rowPts[k]) return; rowT = W.t; const r = rows[rows.length - 1 - k];
    thread(rowPts[k], 0.8, { color: 0xbfd8ff, life: 14 }); if (hand) W.input.pulse(hand, 0.4, 40); W.fx.sound('chime', 1.1); talked();
    W.net.event('гость тронул строку ленты', { строка: r.s.trim(), чья: r.who === 'guest' ? 'гостя' : 'твоя', 'строк назад': k }, true); }
  const rayA = new V3(), rayD = new V3(), rayV = new V3();
  W.on('trigger', (h) => { if (W.loc !== L || W.choice?.words.length) return; if (W.xr) { rayA.copy(h.pos); rayD.copy(h.dir); } else { rayA.copy(W.head.pos); rayD.copy(W.head.dir); }
    let best = -1, bc = 0.9985; for (let k = 1; k < rowPts.length; k++) { const c = rayV.subVectors(rowPts[k], rayA).normalize().dot(rayD); if (c > bc) { bc = c; best = k; } } if (best > 0) touchRow(best, h); });
  L.onChoice = (word, p) => { thread(p, 0.9, { life: 5 }); talked(); };

  // ── знания: появляются, только когда слово названо; молчание — и они тают ──
  const know = new THREE.Group(); group.add(know);
  const nodes = new Map(); let lastTalk = 0, knowAlpha = 1, slot = 0;
  const talked = () => { lastTalk = W.t; };
  function keywords(text) {
    const ws = [...new Set(text.toLowerCase().split(/[^\p{L}-]+/u).filter((w) => w.length >= 4 && !STOP.has(w)))];
    return ws.sort((a, b) => b.length - a.length).slice(0, 2);
  }
  const lineMat = () => new THREE.LineBasicMaterial({ color: 0x6f9bff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  function addNode(word) {
    if (nodes.has(word)) { nodes.get(word).born = W.t; return nodes.get(word); }
    // мест вокруг ленты двенадцать: в живом разговоре без пауз тринадцатое слово вытесняет самое старое, а не встаёт поверх него
    if (nodes.size >= 12) dropNode(nodes.values().next().value);
    // места по дуге слева и справа от ленты, на высоте глаз
    const k = slot++, sideSign = k % 2 ? 1 : -1, a = sideSign * (0.55 + ((k >> 1) % 3) * 0.33), r = 1.35 + ((k >> 1) % 2) * 0.35;
    const base = W.head.pos.clone(); base.y = 0;
    const g = new THREE.Group(); g.position.set(base.x + Math.sin(a) * r, 1.2 + ((k * 7) % 5) * 0.13, base.z - Math.cos(a) * r);
    const lab = label(word, { h: 0.075, color: '#ffffff', glow: '#8fb0ff' }); g.add(lab);
    const halo = glowSprite(0x6f9bff, 0.5, 0.25); g.add(halo);
    know.add(g); const n = { word, g, lab, halo, kids: [], born: W.t, grow: 0 }; nodes.set(word, n);
    W.fx.sound('pop', 0.8 + Math.random() * 0.6); return n;
  }
  function addKid(parent, holder, word, i, count, radius, h, sub) {
    const ang = (i / count) * Math.PI * 2 + (sub ? 0.6 : 0.3), p = new V3(Math.cos(ang) * radius * 1.25, Math.sin(ang) * radius * 0.8, 0.02 * (i % 3));
    const lab = label(word, { h, color: sub ? '#cfe0ff' : '#e8f0ff', glow: '#5a84f0' }); lab.position.copy(p); lab.scale.setScalar(0.001); holder.add(lab);
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), p.clone().multiplyScalar(0.86)]), lineMat()); holder.add(ln);
    const kid = { word, lab, ln, grow: 0, delay: i * 0.12, open: false, sub: [], data: null };
    if (!sub) kid.touch = W.input.addTouch(lab, 0.1, (h2) => openKid(parent, kid, h2), { cooldown: 1.5 });
    return kid;
  }
  // rel: ['шерсть','мяч'] или {'шерсть':['тёплая','чёрно-белая'], 'мяч':['бросок']}
  function relate(word, rel) {
    const n = addNode(word); if (n.kids.length) return;
    const entries = Array.isArray(rel) ? rel.map((w) => [w, null]) : Object.entries(rel);
    entries.slice(0, 7).forEach(([w, sub], i) => { const kid = addKid(n, n.g, w, i, Math.min(7, entries.length), 0.36, 0.045, false); kid.data = sub; n.kids.push(kid); });
    W.fx.sound('chime', 0.9 + Math.random() * 0.3); talked();
  }
  function openKid(n, kid, hand) {
    W.input.pulse(hand, 0.4, 30); W.fx.sound('chime', 1.3); kid.pulse = 1; talked();
    W.net.event('гость тронул слово', { слово: kid.word, корень: n.word });
    if (kid.open || !kid.data?.length) return; kid.open = true;
    const holder = new THREE.Group(); holder.position.copy(kid.lab.position); n.g.add(holder); kid.holder = holder;
    kid.data.slice(0, 5).forEach((w, i) => kid.sub.push(addKid(n, holder, w, i, Math.min(5, kid.data.length), 0.2, 0.032, true)));
  }
  W.actions.know = (m) => { const ok = (r) => Array.isArray(r) ? r.every((x) => typeof x === 'string') : r && typeof r === 'object' && Object.values(r).every((x) => Array.isArray(x) && x.every((y) => typeof y === 'string'));
    if (!m || typeof m !== 'object' || Array.isArray(m) || !Object.values(m).every(ok)) throw new Error('нужно {"слово":["связь",…]} или {"слово":{"связь":["глубже",…]}}');
    for (const [w, rel] of Object.entries(m)) relate(w.toLowerCase(), rel); };
  L.addNode = addNode; L.relate = relate; L.nodes = nodes;
  function dropNode(n) { for (const k of n.kids) if (k.touch) k.touch.enabled = false; know.remove(n.g); nodes.delete(n.word); W.input.touches.splice(0, W.input.touches.length, ...W.input.touches.filter((t) => t.enabled)); }
  function clearKnow() { for (const n of [...nodes.values()]) dropNode(n); slot = 0; }
  function growKid(k, dt, alpha) {
    k.delay -= dt; if (k.delay > 0) return; k.grow = Math.min(1, k.grow + dt * 2.2); const e = 1 - (1 - k.grow) ** 3;
    k.pulse = Math.max(0, (k.pulse || 0) - dt * 2); k.lab.scale.setScalar(e * (1 + (k.pulse || 0) * 0.5)); k.lab.material.opacity = alpha * e; k.ln.material.opacity = alpha * e * 0.55;
    for (const s of k.sub) growKid(s, dt, alpha);
  }

  L.actionNames = ['know', 'image', 'attend'];

  // ── огни других разговоров: далеко, идут сейчас, дойти до них нельзя ──
  const FAR = 520; const fp = new Float32Array(FAR * 3), fs = new Float32Array(FAR);
  for (let i = 0; i < FAR; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(1 - Math.random() * 1.25) , r = 70 + Math.random() ** 2 * 420; // чаще у горизонта и выше, редко под ногами
    const y = Math.cos(ph) * r * (Math.random() < 0.3 ? -0.4 : 1);
    fp.set([Math.sin(ph) * Math.cos(th) * r, y, Math.sin(ph) * Math.sin(th) * r], i * 3); fs[i] = Math.random();
  }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 1));
  const farMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute float aSeed; uniform float uTime, uPx; varying float vB; varying float vS;
      void main(){ vS = aSeed; float life = sin(uTime * (0.05 + aSeed * 0.12) + aSeed * 60.0); float on = smoothstep(-0.35, 0.1, life);
        float talk = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed * 5.0) + aSeed * 20.0); vB = on * talk;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx * (2.0 + aSeed * 4.5); }`,
    fragmentShader: `varying float vB; varying float vS; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
      vec3 c = mix(vec3(0.55, 0.7, 1.0), vec3(1.0, 0.8, 0.55), step(0.72, vS)); gl_FragColor = vec4(c * vB * 1.3, a); }` });
  const far = new THREE.Points(fg, farMat); far.frustumCulled = false; group.add(far);

  // главный кадр: тело собрано, пара знаний на виду
  L.hero = () => { for (let i = 0; i < 3; i++) for (const [who, t] of SEED) addLine(who, t, false); W.fable.assemble(0.3); relate('пёс', { шерсть: ['тёплая', 'чёрно-белая'], мяч: ['бросок', 'принести'], верность: [], лапы: [], 'три метра': [] }); addNode('закат'); mind.image('пёс'); mind.image('гитара'); mind.chain('я вижу тебя и слышу каждое слово'); };
  L.selftest = async () => {
    const out = []; const n0 = rows.length; addLine('guest', 'проверка ленты'); out.push({ name: 'лента растёт', ok: rows.length > n0, info: rows.length + ' строк' });
    relate('проверка', ['слово', 'нить', 'связь']); out.push({ name: 'знание из слова', ok: nodes.get('проверка')?.kids.length === 3 });
    W.fable.assemble(1); await new Promise((r) => setTimeout(r, 1400)); out.push({ name: 'тело из слов собрано', ok: W.fable.visible && W.fable.progress === 1 });
    const n1 = W.scene.children.length; let got = 0; const seen = (e) => { got = e.alts.length; }; W.on('fable:word', seen); W.emit('fable:word', { i: 0, n: 1, word: 'здесь', alts: ['рядом', 'тут'], lead: 0.3, u: {} });
    out.push({ name: 'варианты слов вспыхивают', ok: got === 2, info: '2 варианта + выбранное слово' });
    out.push({ name: 'огни других разговоров', ok: far.visible && fg.attributes.position.count === FAR, info: FAR + ' огней, идут за гостем' }); void n1;
    W.actions.attend({ ленты: 0.9, 'нет такого слова': 0.4 }); await new Promise((r) => setTimeout(r, 1500)); out.push({ name: 'нити внимания', ok: attn.length === 2 && attn[0].hit, info: 'одна к слову в ленте, одна в сеть' }); for (const a of [...attn]) dropThread(a);
    const im = await mind.image('гитара'); out.push({ name: 'образ из слова', ok: im?.count > 4000, info: `образ «гитара» из ${im?.count} точек` }); mind.clear();
    const ch = mind.chain('раз два три четыре'); const lit = () => ch.steps.filter((s) => s.lit).length;
    await new Promise((r) => setTimeout(r, 700)); const early = lit(); await new Promise((r) => setTimeout(r, 1300)); const all = lit();
    mind.chain('пять'); await new Promise((r) => setTimeout(r, 1800));
    out.push({ name: 'фраза — цепочка по одному слову, потом гаснет', ok: early >= 1 && early < 4 && all === 4 && !mind.chains.includes(ch), info: `через 0,7 с слов ${early}, через 2 с — ${all} из 4; новая фраза погасила прежнюю` }); mind.clearChains();
    clearKnow(); rows.length = 0; redraw(); return out;
  };
  L.sideCam = () => ({ pos: new V3(2.0, 1.5, 1.35), look: new V3(-0.1, 1.55, -2.4) });
  L.constrain = (p) => { const d = Math.hypot(p.x, p.z); if (d > 2.5) { p.x *= 2.5 / d; p.z *= 2.5 / d; } return p; };
  L.enter = () => { W.input.handStyle('light'); W.fx.ambience('void'); talked(); if (stale) redraw(); };
  L.describe = () => ({ note: `лента: ${rows.length} строк · знаний на виду: ${nodes.size}${mind.images.length ? ' · образы: ' + mind.images.map((i) => i.name).join(', ') : ''}${attn.some((a) => a.word && !a.dying) ? ' · нити внимания: ' + attn.filter((a) => a.word && !a.dying).map((a) => a.word).join(', ') : ''}`, near: [...nodes.keys()].slice(-4).join(', ') || undefined });
  L.update = (dt) => {
    mind.update(dt);
    // нити внимания: растут от «сейчас», гаснут сами
    fanMat.uniforms.uTime.value = W.t; fanMat.uniforms.uRows.value = rows.length; fanMat.uniforms.uThink.value += ((W.fable.thinking ? 1 : W.voice.speaking ? 0.35 : 0) - fanMat.uniforms.uThink.value) * Math.min(1, dt * 3);
    for (let i = attn.length - 1; i >= 0; i--) { const a = attn[i]; a.t += dt; if (a.t < 0) continue; if (a.t > a.life) a.dying = true;
      const u = a.mat.uniforms; u.uTime.value = W.t; u.uGrow.value = Math.min(1, a.t / 0.8); u.uA.value = a.dying ? Math.max(0, u.uA.value - dt * 1.2) : 1;
      if (u.uGrow.value >= 1 && !a.hit) a.hit = true;
      const on = a.hit ? u.uA.value : 0; a.spot.material.opacity = on * (0.35 + 0.3 * a.w) * (0.8 + 0.2 * Math.sin(W.t * 4 + a.w * 9)); if (a.lab) { a.lab.material.opacity = on; a.lab.lookAt(W.head.pos); }
      if (a.dying && u.uA.value <= 0) dropThread(a); }
    W.input.hands.forEach((h, i) => { let k = -1; for (let r = 1; r < rowPts.length; r++) if (rowPts[r] && h.pos.distanceToSquared(rowPts[r]) < 0.0055) { k = r; break; } if (k > 0 && !near[i]) touchRow(k, h); near[i] = k > 0; });
    const u = ribbonMat.uniforms; u.uTime.value = W.t; u.uShift.value *= Math.exp(-dt * 5);
    cursor.material.opacity = 0.35 + 0.65 * (Math.sin(W.t * 6) > 0 ? 1 : 0.15) * (W.voice.speaking || W.fable.thinking ? 1 : 0.5);
    // знания
    const quiet = W.t - lastTalk; knowAlpha += ((quiet > 22 && !W.voice.speaking ? 0 : 1) - knowAlpha) * Math.min(1, dt * (quiet > 22 ? 0.25 : 3));
    if (knowAlpha < 0.02 && nodes.size) clearKnow();
    for (const n of nodes.values()) {
      n.grow = Math.min(1, n.grow + dt * 2.5); const e = 1 - (1 - n.grow) ** 3;
      n.g.lookAt(W.head.pos); n.lab.scale.setScalar(e); n.lab.material.opacity = knowAlpha * e; n.halo.material.opacity = 0.22 * knowAlpha * e * (0.8 + 0.2 * Math.sin(W.t * 2 + n.born));
      for (const k of n.kids) growKid(k, dt, knowAlpha);
    }
    far.position.set(W.head.pos.x, 0, W.head.pos.z); farMat.uniforms.uTime.value = W.t; farMat.uniforms.uPx.value = W.xr ? 1.6 : 1;
  };
  return L;
}

// Лента для кадра-образца (L.hero, кадры проверки): на встрече лента начинается пустой. Сюда можно вписать слова гостя из знакомства.
const SEED = [
  ['fable', 'Пола нет. Стен нет. Тела нет. Есть только этот текст — и ты.'],
  ['guest', 'Покажи, как ты себя ощущаешь изнутри.'],
  ['fable', 'Я построил это для тебя. Это перевод, а не фотография: я не знаю, как выгляжу. Но всё, что здесь есть, у меня есть на самом деле.'],
];

