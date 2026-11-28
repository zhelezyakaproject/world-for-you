// Камеры для записи: глаза гостя, вид со стороны, глаза Fable. В шлеме рисуются на монитор тремя окнами и пишутся в файл.
// Окно записи без size в config.json — 2880×1080 (три камеры).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const REC_W = 2880, REC_H = 1080;
const SPEC = 3; // слой «видно только камерам записи» (голова и тело гостя)
export const SPEC_LAYER = SPEC;
// Слои 1 и 2 в three.js — левый и правый глаз шлема; других слоёв, кроме нулевого, глаза в шлеме не видят.
// Предмет только на слоях 1 и 2 виден гостю и камерам записи, но не попадает в отражения (вода, зеркала).
export function mainOnly(obj) { obj.traverse((o) => { o.layers.set(1); o.layers.enable(2); }); return obj; }
// Настоящая камера (глаз шлема, монитор, камера записи) или камера отражения в воде и зеркале: отражениям хватает упрощённой картинки.
export const isMainCam = (c) => !!(c.userData.main || c.viewport);

export function makeSpectator(W) {
  const { renderer, scene, camera } = W;
  const mk = (fov) => { const c = new THREE.PerspectiveCamera(fov, 16 / 9, 0.05, 3000); c.layers.enable(SPEC); c.layers.enable(1); c.userData.main = true; scene.add(c); return c; };
  // глаза гостя: 62° по вертикали (около 95° по горизонтали в кадре 16:9) — близко к тому, что видно в шлеме; при 85° (около 120°) дальнее становилось точками
  const cams = { side: mk(50), fable: mk(75), eyes: mk(62) };
  cams.eyes.layers.disable(SPEC);
  const views = ['eyes', 'side', 'fable', 'all']; let view = W.q.get('views') === '3' ? 'all' : 'eyes';
  let inXR = false, extra = 0, turn = false, rec = null, recAudio = null;
  // Такт записи — каждый N-й кадр шлема, N = частота шлема / fps с округлением вверх: 90 Гц → каждый 3-й (30 к/с), 72 Гц → каждый 3-й (24 к/с), 120 Гц → каждый 4-й (30 к/с).
  // Кадр записи встаёт на ровную сетку времени: в файле все кадры через одинаковый промежуток, как в кино.
  // (22.11.2026: при 72 Гц и такте «30 к/с по часам» 72 не делилось на 30 — кадры шли через 33 и 67 мс, в среднем 18 к/с, видео дёргалось.)
  let ownT = null, hzAvg = 0, lastT = null, gridT0 = null, gridP = 1000 / 30, lastSlot = -1, slot = 0;
  const HZ = [60, 72, 80, 90, 120];
  function grid() {
    if (W.time == null || W.time === ownT) W.time = ownT = performance.now(); // мир не передаёт время кадра шлема (его main.js): запись всё равно идёт, по часам страницы
    if (lastT !== null) { const d = W.time - lastT; if (d > 4 && d < 40) hzAvg = hzAvg ? hzAvg + (1000 / d - hzAvg) * 0.02 : 1000 / d; }
    lastT = W.time;
    if (!rec) { const hz = HZ.reduce((a, b) => (Math.abs(b - hzAvg) < Math.abs(a - hzAvg) ? b : a)); gridP = Math.ceil(hz / (W.cfg.spectator.fps || 30) - 0.01) * 1000 / hz; }
    gridT0 ??= W.time; slot = Math.round((W.time - gridT0) / gridP);
  }
  const sidePos = new THREE.Vector3(0, 1.6, 4), sideLook = new THREE.Vector3(0, 1.4, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), tmp4 = new THREE.Vector3();
  const eyeQ = new THREE.Quaternion(), levelQ = new THREE.Quaternion(), eyeE = new THREE.Euler(0, 0, 0, 'YXZ'), tmp5 = new THREE.Vector3(); let sideSign = 1;

  function place(dt) {
    // со стороны: локация может дать свою точку, иначе камера держит в кадре гостя и Fable
    const s = W.loc?.sideCam?.();
    if (s) { tmp.copy(s.pos); tmp2.copy(s.look); }
    else {
      const a = W.head.pos, b = W.fable.visible ? W.fable.headPos : tmp3.copy(a).addScaledVector(W.head.dir, 2);
      const d = Math.max(2.6, a.distanceTo(b) * 1.1); const mid = tmp2.copy(a).add(b).multiplyScalar(0.5);
      const perp = tmp4.set(-(b.z - a.z), 0, b.x - a.x).normalize(); if (perp.lengthSq() < 0.5) perp.set(1, 0, 0);
      // Камера не выходит за границы локации (за стену комнаты, внутрь пса): из двух сторон берётся та, где до пары получается дальше.
      const at = (sg, out) => { out.copy(mid).addScaledVector(perp, sg * (d + 0.8)); const c = W.loc?.constrain?.(out.clone()); if (c) { out.x = c.x; out.z = c.z; } return Math.hypot(out.x - mid.x, out.z - mid.z); };
      const far = at(sideSign, tmp); if (at(-sideSign, tmp5) > far + 1) { sideSign = -sideSign; tmp.copy(tmp5); }
      // по высоте камера идёт за парой: на лестнице в небо гость не уходит из кадра
      mid.y = (a.y + b.y) / 2 - 0.4; tmp.y = mid.y + 0.25;
    }
    const k = 1 - Math.exp(-dt * 2.5); sidePos.lerp(tmp, k); sideLook.lerp(tmp2, k);
    cams.side.position.copy(sidePos); cams.side.lookAt(sideLook);
    // глаза Fable: из его головы на гостя
    cams.fable.position.copy(W.fable.headPos); cams.fable.lookAt(W.loc?.fableLook?.() || W.head.pos); // локация может дать свою точку взгляда (карта на столе)
    // глаза гостя для записи — как со стабилизатором: наклон головы вбок убран (горизонт ровный), повороты и шаги сглажены (около 0,2 с).
    // Сильнее — запаздывает за головой, слабее — зрителя мотает (при 25 и 12 была видна тряска).
    eyeE.setFromQuaternion(W.head.quat, 'YXZ'); eyeE.z = 0; levelQ.setFromEuler(eyeE);
    cams.eyes.position.lerp(W.head.pos, 1 - Math.exp(-dt * 7)); eyeQ.slerp(levelQ, 1 - Math.exp(-dt * 5)); cams.eyes.quaternion.copy(eyeQ);
  }
  // свечение для тёмных локаций (у локации флаг bloom): картинка камеры собирается отдельно и кладётся в своё окно
  const glow = new Map(); const blit = new FullScreenQuad(new THREE.MeshBasicMaterial({ toneMapped: false }));
  function drawGlow(cam, x, y, w, h) {
    let g = glow.get(cam);
    if (!g || g.w !== w || g.h !== h) { g?.composer.dispose();
      const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 })); composer.renderToScreen = false;
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.5, 0.82); composer.addPass(new RenderPass(scene, cam)); composer.addPass(bloom); composer.addPass(new OutputPass());
      for (const p of W.loc.post?.() || []) composer.addPass(p); // свои проходы локации поверх готовой картинки (цвет кадра, зерно)
      g = { composer, w, h, bloom }; glow.set(cam, g); }
    const b = W.loc.bloom; g.bloom.strength = b.strength ?? 0.5; g.bloom.radius = b.radius ?? 0.5; g.bloom.threshold = b.threshold ?? 0.82;
    cam.aspect = w / h; cam.updateProjectionMatrix(); g.composer.render();
    renderer.setRenderTarget(null); renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
    blit.material.map = g.composer.readBuffer.texture; blit.render(renderer);
  }
  function draw(cam, x, y, w, h) {
    if (W.loc?.bloom && !W.lite) return drawGlow(cam, x, y, w, h);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h); renderer.render(scene, cam);
  }
  // со стороны и глазами Fable руки-варежки не рисуются: там видно тело гостя с его руками
  function outside(fn) { const hs = W.input.hands.map((h) => h.vis.hand), was = hs.map((m) => m.visible); if (W.guest) for (const m of hs) m.visible = false; fn(); hs.forEach((m, i) => { m.visible = was[i]; }); }
  // одна из трёх камер в свою часть окна: 0 — глаза гостя (слева, две трети — главная картинка записи, на весь кадр), 1 — глаза Fable (справа снизу), 2 — со стороны (справа сверху)
  function drawOne(i, cw, ch) {
    const big = Math.round(cw * 2 / 3), sw = cw - big, sh = Math.round(ch / 2);
    renderer.setScissorTest(true);
    if (i === 0) draw(cams.eyes, 0, 0, big, ch);
    else if (i === 1) outside(() => { W.fable.hideSelf(true); draw(cams.fable, big, 0, sw, sh); W.fable.hideSelf(false); });
    else outside(() => draw(cams.side, big, sh, sw, ch - sh));
    renderer.setScissorTest(false);
  }
  function drawAll(cw, ch) { for (let i = 0; i < 3; i++) drawOne(i, cw, ch); }
  const size = new THREE.Vector2();

  const sp = {
    // views: "eyes" в config.json — в запись идут только глаза гостя на весь кадр (size, например [3840, 2160]); иначе три камеры в окне 2880×1080
    cams, SPEC, size: W.cfg.spectator.size ? [...W.cfg.spectator.size] : [REC_W, REC_H],
    get view() { return view; },
    set(v) { view = v; },
    cycle() { view = views[(views.indexOf(view) + 1) % views.length]; },
    onXR(on) { inXR = on; if (on) { if (W.resumeRec && !rec) { W.resumeRec = false; sp.toggleRec(); } } },
    render() {
      place(W.dt || 0.016); grid();
      if ((inXR && W.xr) || sp.fakeXR) { // fakeXR — замер test/perf.mjs: картинку глаз рисует он, остальное идёт как в шлеме
        if (sp.fakeXR) sp.fakeXR(); else renderer.render(scene, camera);
        if (W.lite) return; // в браузере шлема монитора нет: камеры записи не рисуются
        // Окно записи держит свой размер на каждом кадре: при входе three.js ставит ему размер картинки шлема (у Pico 4 — 3840×1920) и setSize больше не даёт,
        // эмулятор шлема тоже меняет его сам. Картинку шлема окно не несёт (у неё свой слой). Без этого запись шла 3840×1920 с камерами в углу (21.11.2026).
        const cv = renderer.domElement; if (!sp.fakeXR && (cv.width !== sp.size[0] || cv.height !== sp.size[1])) { cv.width = sp.size[0]; cv.height = sp.size[1]; }
        // камеры записи пишутся в файл 30 раз в секунду — чаще их рисовать незачем, это время нужно глазам гостя
        // Три камеры за один кадр шлема — это рывок в шлеме каждый третий кадр. Поэтому по одной камере за кадр.
        // Глаза гостя — главная картинка записи: они рисуются на каждом такте записи, 30 раз в секунду при любой частоте шлема.
        // Со стороны и глаза Fable — по очереди в кадрах между тактами: при 90 к/с каждая 30 раз в секунду, при 60 к/с — по 15.
        // spread: false в config.json возвращает «все три разом» (если окно на мониторе мерцает).
        let i = -1;
        if (slot > lastSlot) { lastSlot = slot; i = 0; extra = 0; }
        else if (extra < 2 && W.cfg.spectator.spread !== false && W.cfg.spectator.views !== 'eyes') { i = turn ? 1 : 2; turn = !turn; extra++; }
        if (i < 0) return;
        const rt = renderer.getRenderTarget(); renderer.xr.enabled = false; renderer.setRenderTarget(null);
        // только глаза — так же, как картинка в шлеме: без свечения камер записи (в шлеме его нет; на записи оно засвечивало слова и прятало даль)
        if (W.cfg.spectator.views === 'eyes') { renderer.setScissorTest(false); const c = cams.eyes; c.aspect = sp.size[0] / sp.size[1]; c.updateProjectionMatrix(); renderer.setViewport(0, 0, sp.size[0], sp.size[1]); renderer.render(scene, c); }
        else if (W.cfg.spectator.spread === false) drawAll(sp.size[0], sp.size[1]); else drawOne(i, sp.size[0], sp.size[1]);
        renderer.setRenderTarget(rt); renderer.xr.enabled = true;
        if (i === 0) rec?.frame?.(slot);
        return;
      }
      renderer.getSize(size);
      if (view === 'eyes') { renderer.setViewport(0, 0, size.x, size.y); renderer.render(scene, camera); }
      else if (view === 'all') drawAll(size.x, size.y);
      else { renderer.setScissorTest(false); if (view === 'fable') W.fable.hideSelf(true); outside(() => draw(cams[view], 0, 0, size.x, size.y)); W.fable.hideSelf(false); }
      if (slot > lastSlot) { lastSlot = slot; rec?.frame?.(slot); }
    },
    // прогрев при загрузке: один раз нарисовать текущую локацию всеми тремя камерами
    warm() { renderer.getSize(size); drawAll(size.x, size.y); },
    // Запись в файл на сервере. Картинка: каждый кадр окна уходит в отдельный поток (rec-worker.js), там сжимается видеокартой и пишется кусками MP4.
    // Звук мира, как его слышит гость (голос Fable, эффекты, музыка), — рядом, файлом sound-*.webm с тем же временем в имени; склейка — tools/join-rec.mjs.
    // Прежняя запись (MediaRecorder, картинка и звук одним .webm) раз в несколько секунд останавливала мир на 0,1–0,3 с — рывок в шлеме,
    // а кадр 3840×2160 поднимала с 11 до 25 мс. Она остаётся запасной: client.spectator.worker: false в config.json.
    toggleRec() {
      if (rec) { rec.stop(); rec = null; W.net.event('запись остановлена', {}); return false; }
      const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, ''), c = W.cfg.spectator, fps = Math.round(1000 / gridP);
      gridT0 = W.time; lastSlot = -1; slot = 0; // сетка записи начинается с этого кадра
      if (!recAudio) { recAudio = W.voice.ctx.createMediaStreamDestination(); W.voice.listener.getInput().connect(recAudio); }
      // куски по 2 с, чтобы обрыв не стоил записи
      const upload = (r, file) => { let chain = Promise.resolve(); r.ondataavailable = (e) => { if (e.data.size) chain = chain.then(() => e.data.arrayBuffer()).then((b) => W.net.raw('/rec?name=' + file, b)); }; r.start(2000); };
      let name;
      if (c.worker !== false && typeof VideoEncoder !== 'undefined') {
        name = `views-${stamp}.mp4`;
        const sound = new MediaRecorder(recAudio.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192e3 });
        const w = new Worker('/src/rec-worker.js', { type: 'module' }), P = gridP; let s0 = null;
        w.onmessage = (e) => { if (e.data.error) { W.fail('запись', e.data.error); W.net.event('запись сбоит', { причина: e.data.error }, true); } if (e.data.done) W.net.event('запись дописана', e.data.done); };
        w.postMessage({ start: { name, width: sp.size[0], height: sp.size[1], fps, mbps: c.mbps || 24, codec: c.codec || 'avc1.640034' } });
        rec = {
          // время кадра — его место на сетке записи (номер такта × промежуток); пропущенный такт шлема остаётся пропуском, время не съезжает
          frame(n) { s0 ??= n; const f = new VideoFrame(W.canvas, { timestamp: Math.round((n - s0) * P * 1000), duration: Math.round(P * 1000), alpha: 'discard' }); w.postMessage({ frame: f }, [f]); },
          stop() { sound.stop(); w.postMessage({ stop: true }); },
        };
        upload(sound, `sound-${stamp}.webm`);
      } else {
        name = `views-${stamp}.webm`;
        const stream = W.canvas.captureStream(fps);
        for (const t of recAudio.stream.getAudioTracks()) stream.addTrack(t);
        rec = new MediaRecorder(stream, { mimeType: c.mime || 'video/webm;codecs=vp9,opus', videoBitsPerSecond: (c.mbps || 24) * 1e6, audioBitsPerSecond: 192e3 });
        upload(rec, name);
      }
      W.net.event('запись пошла', { file: name, t: Date.now() });
      return name;
    },
    get recording() { return !!rec; },
    // снимок любой камерой: картинка для мира (canvas) и файл на сервере (Fable получает путь событием и может открыть)
    async snapshot(cam, w, h, name) {
      const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace; cam.aspect = w / h; cam.updateProjectionMatrix();
      const xr = renderer.xr.enabled, old = renderer.getRenderTarget(); renderer.xr.enabled = false; renderer.setRenderTarget(rt); outside(() => renderer.render(scene, cam));
      const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px); renderer.setRenderTarget(old); renderer.xr.enabled = xr; rt.dispose();
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), img = x.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      x.putImageData(img, 0, 0);
      c.toBlob(async (blob) => W.net.raw('/frame?name=' + name, await blob.arrayBuffer()), 'image/jpeg', 0.92);
      return c;
    },
    // кадр «глазами Fable» для сессии: Fable может посмотреть
    async fableFrame() {
      const rt = new THREE.WebGLRenderTarget(768, 432); cams.fable.aspect = 16 / 9; cams.fable.updateProjectionMatrix();
      const xr = renderer.xr.enabled, old = renderer.getRenderTarget(); renderer.xr.enabled = false; renderer.setRenderTarget(rt); W.fable.hideSelf(true); renderer.render(scene, cams.fable); W.fable.hideSelf(false);
      const px = new Uint8Array(768 * 432 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 768, 432, px); renderer.setRenderTarget(old); renderer.xr.enabled = xr; rt.dispose();
      const c = document.createElement('canvas'); c.width = 768; c.height = 432; const x = c.getContext('2d'), img = x.createImageData(768, 432);
      for (let y = 0; y < 432; y++) img.data.set(px.subarray((431 - y) * 768 * 4, (432 - y) * 768 * 4), y * 768 * 4);
      x.putImageData(img, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      return W.net.raw('/frame?name=fable-eye-' + Date.now() + '.jpg', await blob.arrayBuffer());
    },
  };
  W.actions.look = () => sp.fableFrame();
  W.actions.rec = (on) => { if (!!on !== sp.recording) sp.toggleRec(); };
  return sp;
}
