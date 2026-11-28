// Небо острова: фотозакат (Poly Haven, CC0), день рисуется кодом, ночь — фото Млечного Пути. Солнце можно двигать: от него зависит всё небо и свет.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const SKY = '/media/sky/';
const tex = (file) => new Promise((ok, no) => new THREE.TextureLoader().load(SKY + file, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; ok(t); }, undefined, no));
const hdr = (file) => new Promise((ok, no) => new RGBELoader().load(SKY + file, (t) => { t.mapping = THREE.EquirectangularReflectionMapping; ok(t); }, undefined, no));

// на закатной панораме солнце стоит на u=0.595, чуть выше горизонта
const SUNSET_U = 0.595;

export async function makeSky(W, { sunAzimuth = -1.25 } = {}) {
  const [tSunset, tNight, eSunset, eDay, eNight] = await Promise.all([tex('umhlanga_sunrise.jpg'), tex('rogland_clear_night_4k.jpg'), hdr('umhlanga_sunrise_2k.hdr'), hdr('simons_town_rocks_2k.hdr'), hdr('rogland_clear_night_2k.hdr')]);
  // sunAzimuth — угол в плоскости пола, где стоит солнце (atan2(z, x)); панораму поворачиваем так, чтобы её солнце попало туда же
  const rot = SUNSET_U - (sunAzimuth / (Math.PI * 2) + 0.5);
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    uniforms: { tSunset: { value: tSunset }, tNight: { value: tNight }, uRot: { value: rot }, uSun: { value: new THREE.Vector3() }, uW: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform sampler2D tSunset, tNight; uniform float uRot, uTime; uniform vec3 uSun, uW, uTint; varying vec3 vD;
      const float PI = 3.14159265;
      // панорама: нижние cut градусов (берег, дома, холмы) срезаны, небо чуть растянуто до горизонта; ниже h0 — сплошная дымка, выше h1 — чистая панорама
      vec3 pano(sampler2D t, vec3 d, float cut, float rot, float h0, float h1){
        float el = asin(clamp(abs(d.y), 0.0, 1.0)); float e2 = cut + el * (PI * 0.5 - cut) / (PI * 0.5);
        float u = atan(d.z, d.x) / (2.0 * PI) + 0.5 + rot; vec2 uv = vec2(u, 0.5 + e2 / PI);
        vec3 c = texture2D(t, uv).rgb; vec3 haze = textureLod(t, vec2(u, 0.5 + (cut + 0.11) / PI), 7.0).rgb; // цвет дымки — сильно размытое небо над берегом
        return mix(haze, c, smoothstep(h0, h1, abs(d.y))); // у самого горизонта — дымка: она прячет берег и дома с панорамы (на закатной они поднимаются до 5°)
      }
      vec3 day(vec3 d, vec3 sun){
        float h = clamp(abs(d.y), 0.0, 1.0); vec3 c = mix(vec3(0.66, 0.83, 0.98), vec3(0.09, 0.3, 0.74), pow(h, 0.42));
        float sd = max(dot(d, sun), 0.0); c += vec3(1.0, 0.92, 0.75) * (pow(sd, 900.0) * 6.0 + pow(sd, 40.0) * 0.35 + pow(sd, 6.0) * 0.12);
        float low = 1.0 - smoothstep(0.0, 0.5, sun.y); c = mix(c, c * vec3(1.05, 0.86, 0.72) + vec3(0.25, 0.1, 0.0) * pow(1.0 - h, 6.0), low);
        return c;
      }
      void main(){
        vec3 d = normalize(vD);
        vec3 c = pano(tSunset, d, 0.09, uRot, 0.07, 0.17) * uW.x + day(d, normalize(uSun)) * uW.y + pano(tNight, d, 0.26, 0.1, 0.0, 0.1) * vec3(0.72, 0.84, 1.08) * uW.z;
        gl_FragColor = vec4(c * uTint, 1.0);
        #include <colorspace_fragment>
      }` });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat); dome.scale.setScalar(1800); dome.frustumCulled = false; dome.renderOrder = -10;
  // солнце, которое можно взять рукой
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.1, 'rgba(255,246,215,.95)'); g.addColorStop(0.2, 'rgba(255,215,150,.42)'); g.addColorStop(0.5, 'rgba(255,170,90,.1)'); g.addColorStop(1, 'rgba(255,150,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false, fog: false }));
  sunSprite.renderOrder = -9; sunSprite.name = 'солнце';
  const light = new THREE.DirectionalLight(0xffffff, 2); const amb = new THREE.HemisphereLight(0xffffff, 0x334455, 0.2);
  const group = new THREE.Group(); group.add(dome, sunSprite, light, light.target, amb);

  const sky = { group, dome, sunSprite, light, tint: mat.uniforms.uTint.value, elevation: 0.03, azimuth: sunAzimuth, dir: new THREE.Vector3(), env: null, envs: { sunset: eSunset, day: eDay, night: eNight },
    // высота солнца в радианах: 1.0 — день, 0.03 — закат, ниже −0.12 — ночь
    set(el) { sky.elevation = THREE.MathUtils.clamp(el, -0.5, 1.15); },
    phase() { return sky.elevation > 0.3 ? 'день' : sky.elevation > -0.1 ? 'закат' : 'ночь'; },
    update(dt, scene, renderer) {
      const el = sky.elevation, ss = THREE.MathUtils.smoothstep;
      sky.dir.set(Math.cos(sky.azimuth) * Math.cos(el), Math.sin(el), Math.sin(sky.azimuth) * Math.cos(el));
      const wDay = ss(el, 0.1, 0.42), wNight = 1 - ss(el, -0.2, -0.045), wSunset = Math.max(0, 1 - wDay - wNight);
      mat.uniforms.uW.value.set(wSunset, wDay, wNight); mat.uniforms.uSun.value.copy(sky.dir); mat.uniforms.uTime.value += dt;
      dome.position.copy(W.head.pos);
      sunSprite.position.copy(W.head.pos).addScaledVector(sky.dir, 1500); const sz = 1500 * (0.13 + 0.09 * (1 - ss(el, 0, 0.5)));
      sunSprite.scale.setScalar(sz); sunSprite.material.opacity = ss(el, -0.12, -0.02) * (0.55 + 0.45 * wDay); sunSprite.visible = el > -0.13;
      // свет: тёплый низкий на закате, белый днём, синий слабый ночью
      const warm = 1 - ss(el, 0.05, 0.5);
      light.color.setRGB(1, 1 - 0.36 * warm, 1 - 0.62 * warm); light.intensity = 0.2 + 2.4 * ss(el, 0.05, 0.5) + 1.5 * wSunset;
      if (wNight > 0.6) { light.color.setRGB(0.5, 0.62, 1); light.intensity = 0.35; }
      const ld = wNight > 0.6 ? tmp.set(-0.3, 0.8, 0.4) : tmp.copy(sky.dir).setY(Math.max(sky.dir.y, 0.42));
      light.position.copy(W.head.pos).addScaledVector(ld.normalize(), 60); light.target.position.copy(W.head.pos);
      amb.intensity = 0.12 + 0.25 * wDay; amb.color.setRGB(0.7 + 0.3 * wDay, 0.75 + 0.2 * wDay, 1);
      const want = wDay > 0.5 ? 'day' : wNight > 0.5 ? 'night' : 'sunset';
      if (sky.env !== want) { sky.env = want; scene.environment = sky.envs[want]; }
      const peak = Math.max(wDay, wNight, wSunset); // на стыке фаз свет окружения чуть гаснет — подмены карты не видно
      scene.environmentIntensity = (want === 'night' ? 0.6 : want === 'day' ? 0.8 : 0.55) * (0.35 + 0.65 * ss(peak, 0.5, 0.9));
      light.color.multiply(sky.tint); const tb = (sky.tint.r + sky.tint.g + sky.tint.b) / 3;
      renderer.toneMappingExposure = (0.95 - 0.1 * wNight - 0.1 * wSunset) * (0.45 + 0.55 * tb);
    } };
  const tmp = new THREE.Vector3();
  return sky;
}
