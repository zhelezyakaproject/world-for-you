// Развилка: несколько вариантов висят перед гостем. Каждый весит столько, сколько назвал Fable: больше вес — крупнее и ярче слово.
// Сами варианты не схлопываются: Fable может оставить вопрос открытым. гость может тронуть вариант рукой или навести и нажать курок.
import * as THREE from 'three';
import { label, glowSprite } from './words.js';

const V3 = THREE.Vector3;

export function makeChoice(W) {
  const root = new THREE.Group(); W.scene.add(root); let items = [], born = 0, gone = false, flick = 0;
  function clear() { for (const it of items) { root.remove(it.g); it.lab.geometry.dispose(); it.lab.material.dispose(); it.bar.geometry.dispose(); it.bar.material.dispose(); } items = []; }
  W.actions.choice = (m) => {
    if (m === false || m == null) { gone = true; return; }
    const list = Array.isArray(m) ? m.map((w) => [w, 1]) : m && typeof m === 'object' ? Object.entries(m) : null;
    if (!list || list.length < 2 || list.length > 5 || !list.every(([w, k]) => typeof w === 'string' && w.trim() && Number.isFinite(k) && k >= 0) || !list.some(([, k]) => k > 0))
      throw new Error('развилка: от 2 до 5 вариантов — {"да":0.3,"нет":0.2,"не знаю":0.5} или ["тёплый","живой"]; убрать — {"choice":false}');
    clear(); gone = false; born = W.t; const max = Math.max(...list.map(([, k]) => k)), sum = list.reduce((s, [, k]) => s + k, 0);
    const fwd = W.head.dir.clone().setY(0).normalize(), yaw = Math.atan2(fwd.x, fwd.z), n = list.length;
    list.forEach(([word, k], i) => {
      const w = k / max, a = yaw + (i - (n - 1) / 2) * 0.46, g = new THREE.Group();
      g.position.set(W.head.pos.x + Math.sin(a) * 0.85, W.head.pos.y - 0.12 + (i % 2) * 0.07, W.head.pos.z + Math.cos(a) * 0.85);
      const lab = label(word, { h: 0.045 + 0.05 * w, color: '#ffffff', glow: '#8fb0ff' }); g.add(lab);
      const halo = glowSprite(0x6f9bff, 0.3 + 0.3 * w, 0.2); halo.position.z = -0.01; g.add(halo);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.02 + 0.2 * k / sum, 0.008), new THREE.MeshBasicMaterial({ color: 0x9fc0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); bar.position.y = -0.075 - 0.04 * w; g.add(bar);
      root.add(g); items.push({ word, w, share: k / sum, g, lab, halo, bar, grow: 0, delay: i * 0.18, flash: 0, picked: 0, seed: Math.random() * 9 });
    });
    W.fx.sound('chime', 1.2);
  };
  function pick(it, hand) {
    if (W.t - it.picked < 1.5) return; it.picked = W.t; it.flash = 1.5; W.fx.sound('chime', 0.9); if (hand) W.input.pulse(hand, 0.5, 40);
    W.loc?.onChoice?.(it.word, it.g.position.clone());
    W.net.event('гость выбрал вариант', { вариант: it.word, 'из вариантов': items.map((x) => x.word).join(' / ') }, true);
  }
  // наведение: на мониторе — взглядом, в шлеме — рукой
  const from = new V3(), dir = new V3(), d = new V3();
  W.on('trigger', (h) => { if (!items.length || gone) return; if (W.xr) { from.copy(h.pos); dir.copy(h.dir); } else { from.copy(W.head.pos); dir.copy(W.head.dir); }
    let best = null, bc = 0.975; for (const it of items) { const c = d.subVectors(it.g.position, from).normalize().dot(dir); if (c > bc) { bc = c; best = it; } } if (best) pick(best, h); });
  W.on('loc', () => clear());
  W.updaters.push((dt) => {
    if (!items.length) return; if (W.t - born > 150) gone = true;
    // ни один вариант не побеждает насовсем: время от времени один из них на миг перевешивает — чаще тот, у кого вес больше
    flick -= dt; if (flick <= 0 && !gone) { flick = 0.9 + Math.random() * 1.4; let r = Math.random(); for (const it of items) { r -= it.share; if (r <= 0) { it.flash = Math.max(it.flash, 0.7); break; } } }
    let alive = false;
    for (const it of items) {
      it.delay -= dt; if (it.delay > 0) { it.g.visible = false; alive = true; continue; } it.g.visible = true;
      it.grow = Math.max(0, Math.min(1, it.grow + dt * (gone ? -1.6 : 2.2))); it.flash = Math.max(0, it.flash - dt); if (it.grow > 0) alive = true;
      const e = 1 - (1 - it.grow) ** 3, f = Math.min(1, it.flash), base = 0.45 + 0.55 * it.w;
      it.g.lookAt(W.head.pos); it.g.scale.setScalar(e * (1 + f * 0.22)); it.g.position.y += Math.sin(W.t * 1.1 + it.seed) * 0.0004;
      it.lab.material.opacity = e * Math.min(1, base + f * 0.6); it.halo.material.opacity = e * (0.12 + 0.2 * it.w + f * 0.5); it.bar.material.opacity = e * 0.8;
      it.lab.material.color.setRGB(1, 1 - 0.18 * Math.min(1, it.flash), 1 - 0.5 * Math.min(1, it.flash));
      if (!gone) for (const h of W.input.hands) if (h.pos.distanceTo(it.g.position) < 0.11) pick(it, h);
    }
    if (!alive) clear();
  });
  return { get words() { return gone ? [] : items.map((x) => x.word); } };
}
