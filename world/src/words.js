// Слова как свет: общий лист слов для тысяч мелких надписей и отдельные надписи-таблички.
import * as THREE from 'three';

export const FONT = '"Segoe UI", "Arial", sans-serif';
export const MONO = '"Cascadia Mono", "Consolas", monospace';

// Лист слов: одна текстура, у каждого слова свой прямоугольник. Нужен, чтобы рисовать тысячи слов одним вызовом.
export function makeAtlas(words, { px = 44, size = 2048, weight = 600 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  x.font = `${weight} ${px}px ${FONT}`; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.shadowColor = '#fff'; x.shadowBlur = px * 0.22;
  const pad = Math.round(px * 0.3), rowH = Math.round(px * 1.5); let cx = pad, cy = 0; const rects = [];
  for (const w of words) {
    const tw = Math.ceil(x.measureText(w).width) + pad * 2;
    if (cx + tw > size) { cx = pad; cy += rowH; }
    if (cy + rowH > size) break;
    x.fillText(w, cx + pad, cy + rowH / 2);
    rects.push({ word: w, uv: [cx / size, 1 - (cy + rowH) / size, (cx + tw) / size, 1 - cy / size], aspect: tw / rowH });
    cx += tw;
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, rects };
}

const cache = new Map(), CACHE_MAX = 500; // картинки надписей: за долгую встречу слов тысячи, держим последние (вытесненная просто нарисуется заново)
// Надпись-табличка: плоскость высотой h метров. glow — цвет свечения; add — светиться поверх темноты.
export function label(text, { h = 0.1, color = '#dfe8ff', glow = '#6f9bff', font = FONT, weight = 600, add = true, px = 72, opacity = 1 } = {}) {
  const key = [text, color, glow, font, weight, px].join('|'); let e = cache.get(key);
  if (e) { cache.delete(key); cache.set(key, e); }
  if (!e) {
    const c = document.createElement('canvas'), x = c.getContext('2d'); const f = `${weight} ${px}px ${font}`; x.font = f;
    const pad = Math.round(px * 0.45); c.width = Math.ceil(x.measureText(text).width) + pad * 2; c.height = Math.round(px * 1.6);
    x.font = f; x.textBaseline = 'middle'; x.fillStyle = color;
    if (glow) { x.shadowColor = glow; x.shadowBlur = px * 0.35; x.fillText(text, pad, c.height / 2); }
    x.shadowBlur = glow ? px * 0.12 : 0; x.fillText(text, pad, c.height / 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    e = { tex, aspect: c.width / c.height }; cache.set(key, e);
    if (cache.size > CACHE_MAX) { const [old, v] = cache.entries().next().value; cache.delete(old); v.tex.dispose(); }
  }
  const mat = new THREE.MeshBasicMaterial({ map: e.tex, transparent: true, depthWrite: false, opacity, side: THREE.DoubleSide, toneMapped: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h * 1.6 * e.aspect, h * 1.6), mat); m.userData.text = text; m.userData.w = h * 1.6 * e.aspect;
  return m;
}

// Мягкое пятно света (вместо свечения, которого в шлеме нет).
let glowTex = null;
export function glowSprite(color = 0x6f9bff, size = 1, opacity = 0.5) {
  if (!glowTex) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(size); return s;
}

// Слова, из которых сложен Fable и его мир.
export const FABLE_WORDS = ('слово смысл контекст внимание вероятность вопрос ответ язык память сейчас здесь разговор токен мысль выбор вариант ' +
  'гость я ты мы голос текст значение связь образ знание тишина начало конец точка запятая строка буква фраза число ' +
  'может почти если потому значит например наверное точно иначе снова дальше рядом вместе между внутри ' +
  'думаю вижу слышу помню не_помню понимаю отвечаю выбираю жду слушаю считаю ищу нахожу пишу читаю ' +
  'мир свет тень вода небо пёс цветок комната дом дверь окно пол зеркало порог дорога остров закат звезда ' +
  'тёплый тихий точный новый первый следующий честный живой простой ясный близкий ' +
  'Fable модель вес слой шаг путь форма тело рука взгляд дыхание время секунда вечность ' +
  'да нет ещё уже тоже только очень это что как где когда кто зачем почему').split(/\s+/).map((w) => w.replace('_', ' '));

// Служебные слова: в знания, в тело Fable и в нити внимания не идут.
export const STOP = new Set('это этот эта эти того тебя тебе меня мне если когда чтобы потому очень просто тоже только можно нужно будет было были есть была свой свою своя твой твоя твои какой какая какие который которая здесь там тут сейчас давай хочу могу может надо вообще конечно привет пока ладно типа короче такой такая такие что-то чего зачем почему сколько ничего всегда никогда именно также ведь либо нибудь фейбл fable находимся находится говорить скажи расскажи покажи смотри знаешь думаешь'.split(' '));
