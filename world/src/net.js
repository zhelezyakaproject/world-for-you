// Связь страницы с сервером: команды Fable приходят событиями, мир отвечает событиями и состоянием.
export function makeNet(W) {
  W.cfg = { mic: { threshold: 0.012, silenceMs: 900, minMs: 0, maxMs: 30000, muteWhileFable: true, echoTailMs: 700 }, spectator: { fps: 30 }, xr: { scale: 1 }, pad: { trigger: 0, grip: 1, a: 4, b: 5 } };
  const es = new EventSource('/events');
  es.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'hello') Object.assign(W.cfg, m.cfg.client); W.emit('net:' + m.type, m); };
  const send = (p, o) => fetch(p, { method: 'POST', body: JSON.stringify(o) }).catch(() => {});
  // Мир с голосами-персонажами определяет window.cityKnows() → { синий: 'текст', красный: 'текст', мёртв: {…}, ход: N }: что знают жители районов.
  // Она уходит с состоянием мира полем city — его читают пульт (city синий) и сервер (голос мёртв — реплики нет). Нет функции — нет поля.
  let cityErr = false;
  const withCity = (s) => { if (typeof window.cityKnows !== 'function') return s;
    try { const c = window.cityKnows(); return c == null ? s : { ...s, city: c }; } catch (e) { if (!cityErr) { cityErr = true; fetch('/client-log', { method: 'POST', body: 'cityKnows: ' + (e?.stack || e) }).catch(() => {}); } return s; } };
  const evq = [];
  const flushEvents = () => { const q = evq.splice(0); let st; if (q.some((e) => e.important) && typeof W.describe === 'function') { try { st = withCity(W.describe()); } catch {} }
    let chain = Promise.resolve(); q.forEach((e, i) => { const last = i === q.length - 1; chain = chain.then(() => send('/event', last && st ? { ...e, state: st } : e)); }); };
  return {
    send,
    // События уходят в конце текущего шага страницы, по порядку; важное событие несёт свежее состояние мира, снятое уже после действия,
    // которое его вызвало: иначе строка «мир: …» у Fable на шаг отстаёт от события (состояние само уходит раз в секунду).
    event: (name, data, important) => { evq.push({ name, data, important }); if (evq.length === 1) setTimeout(flushEvents, 0); },
    state: (s) => send('/state', withCity(s)),
    log: (m) => fetch('/client-log', { method: 'POST', body: String(m) }).catch(() => {}),
    raw: (p, body) => fetch(p, { method: 'POST', body }).then((r) => r.json()).catch(() => ({})),
  };
}
