// Зелёный код при смене локации: столбцы знаков падают вокруг гостя до переноса и после него.
// Три кольца на разном расстоянии от головы. Рисуются поверх мира, видны в шлеме и всем камерам записи.
import * as THREE from 'three';

export const RAIN_BEFORE = 2, RAIN_AFTER = 2; // секунды кода до переноса и после него

// знаки: полуширинная катакана и цифры, отражённые зеркально; 8 × 8 клеток
function glyphs() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 512, 512); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = 'bold 50px "MS Gothic", "Yu Gothic", monospace';
  const chars = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z:.=*+-<>¦|"ｸﾁﾄﾉﾌﾍﾖﾙﾚﾛﾝ';
  for (let i = 0; i < 64; i++) { x.save(); x.translate((i % 8) * 64 + 32, (i >> 3) * 64 + 34); x.scale(-1, 1); x.fillText(chars[i % chars.length], 0, 0); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; return t;
}

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG = `
uniform sampler2D map; uniform float time, power, density, cols, rows; varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 g = vUv * vec2(cols, rows); float col = floor(g.x), row = floor(g.y);
  float r = hash(vec2(col, 7.0));
  if (hash(vec2(col, 3.0)) > density) discard;
  // голова столбца идёт сверху вниз, за ней гаснущий хвост
  float tail = mix(10.0, 26.0, hash(vec2(col, 11.0))), span = rows + tail;
  float head = span - mod(time * mix(9.0, 20.0, r) + r * span * 3.0, span);
  float d = row - head; if (d < 0.0 || d > tail) discard;
  float n = floor(hash(vec2(col, row) + floor(time * mix(1.5, 5.0, hash(vec2(row, col))))) * 64.0);
  vec2 cell = clamp(fract(g), 0.06, 0.94);
  float a = texture2D(map, (vec2(mod(n, 8.0), floor(n / 8.0)) + vec2(cell.x, 1.0 - cell.y)) / 8.0).r;
  float fade = 1.0 - d / tail, tip = step(d, 1.0);
  // края кольца по высоте уходят в прозрачность
  float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
  // обычное наложение, не сложение: на светлом небе знаки остаются зелёными
  gl_FragColor = vec4(mix(vec3(0.0, 0.95, 0.25), vec3(0.7, 1.0, 0.8), tip), a * min(1.0, fade * fade * 1.3 + tip) * power * edge);
}`;

export function makeRain(W) {
  const map = glyphs(), group = new THREE.Group(); group.visible = false; group.name = 'зелёный код'; W.scene.add(group);
  // кольцо: радиус, высота, размер знака (м), доля столбцов в начале и в момент переноса
  const rings = [[2.2, 9, 0.085, 0.24, 0.7], [4.6, 14, 0.16, 0.28, 0.8], [9.5, 24, 0.3, 0.3, 0.85]].map(([r, h, s, d0, d1]) => {
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { map: { value: map }, time: { value: 0 }, power: { value: 0 }, density: { value: d0 }, cols: { value: Math.round(2 * Math.PI * r / s) }, rows: { value: Math.round(h / (s * 1.25)) } } });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 96, 1, true), mat); m.renderOrder = 9000; m.frustumCulled = false; group.add(m); return { mat, d0, d1 };
  });
  let t = RAIN_AFTER + 1, from = -RAIN_BEFORE;
  const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  return {
    // запустить: код идёт с секунды -before (перенос — в нуле) до секунды RAIN_AFTER
    play(before = RAIN_BEFORE) { t = from = -before; group.visible = true; },
    stop() { group.visible = false; },
    update(dt) {
      if (!group.visible) return; t += dt; if (t > RAIN_AFTER) { group.visible = false; return; }
      group.position.copy(W.head.pos);
      const power = smooth(from, from + 0.7, t) * (1 - smooth(RAIN_AFTER - 1.2, RAIN_AFTER, t)), near = 1 - Math.min(1, Math.abs(t) / 1.8);
      for (const r of rings) { r.mat.uniforms.time.value += dt; r.mat.uniforms.power.value = power; r.mat.uniforms.density.value = r.d0 + (r.d1 - r.d0) * near; }
    },
  };
}
