// Поток записи глаз гостя. Страница отдаёт сюда готовый кадр окна и сразу идёт дальше: сжатие (H.264 на видеокарте), сборка MP4
// и отправка на сервер идут здесь и мир не задерживают. MP4 пишется кусками по секунде: после обрыва файл читается до последнего куска.
import { Muxer, StreamTarget } from '/node_modules/mp4-muxer/build/mp4-muxer.mjs';

const Q = 20; // квантователь H.264: 18 — почти без потерь, 23 — по умолчанию у x264; 20 на 4K ночи даёт чистый снег
let mode, enc, mux, name, fps, n = 0, dropped = 0, timer, ready = false, early = [];
// куски файла копятся и раз в секунду уходят на сервер одним запросом, строго по порядку
let parts = [], start = 0, next = 0, chain = Promise.resolve();
const fail = (where, e) => postMessage({ error: `${where}: ${e?.message || e}` });
function flush() {
  if (!parts.length) return;
  const body = new Blob(parts), pos = start; parts = [];
  chain = chain.then(() => fetch(`/rec?name=${name}&pos=${pos}`, { method: 'POST', body })).catch((e) => fail('кусок записи не дошёл до сервера', e));
}

function take(frame) {
  // Кадры ждут сжатия в очереди. Пропуск кадра — только если очередь дошла до секунды (каждый кадр в ней держит память видеокарты).
  if (enc?.state !== 'configured' || enc.encodeQueueSize > 30) dropped++;
  else enc.encode(frame, { keyFrame: n++ % fps === 0, ...(mode === 'quantizer' ? { avc: { quantizer: Q } } : {}) }); // опорный кадр каждую секунду: на монтаже запись листается без задержки
  frame.close();
}

onmessage = async ({ data: m }) => {
  try {
    if (m.start) {
      const { width, height, mbps, codec } = m.start; ({ name, fps } = m.start);
      // Качество задаётся квантователем Q (меньше — лучше): с bitrateMode 'variable' и 'constant' видеокарта сама урезала поток до 5–6 Мбит/с
      // при заказанных 120 — ночь, снег и мелкие частицы шли кашей (23.11.2026). Не берёт квантователь — запасной путь по битрейту.
      let cfg = { codec, width, height, framerate: fps, hardwareAcceleration: 'prefer-hardware', bitrateMode: 'quantizer' }; mode = 'quantizer';
      if (!(await VideoEncoder.isConfigSupported(cfg)).supported) { cfg = { ...cfg, bitrate: mbps * 1e6, bitrateMode: 'variable' }; mode = 'variable'; }
      if (!(await VideoEncoder.isConfigSupported(cfg)).supported) { ready = true; for (const f of early.splice(0)) take(f); return fail('запись', `видеокарта не берёт ${codec} ${width}×${height}`); }
      mux = new Muxer({ target: new StreamTarget({ onData: (d, pos) => { if (parts.length && pos !== next) flush(); if (!parts.length) start = pos; parts.push(d.slice()); next = pos + d.byteLength; } }),
        video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'fragmented', minFragmentDuration: 1, firstTimestampBehavior: 'offset' });
      enc = new VideoEncoder({ output: (chunk, meta) => mux.addVideoChunk(chunk, meta), error: (e) => fail('сжатие видео', e) });
      enc.configure(cfg);
      timer = setInterval(flush, 1000);
      ready = true; for (const f of early.splice(0)) take(f);
    } else if (m.frame) {
      if (ready) take(m.frame); else if (early.length < 60) early.push(m.frame); else { dropped++; m.frame.close(); } // первые кадры ждут, пока видеокарта заведёт сжатие (около полсекунды)
    } else if (m.stop) {
      clearInterval(timer);
      if (enc?.state === 'configured') { await enc.flush(); mux.finalize(); }
      flush(); await chain;
      postMessage({ done: { file: name, frames: n, dropped, mode } }); close();
    }
  } catch (e) { fail('поток записи', e); }
};
