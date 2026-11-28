// Руки и голова гостя: шлем или мышь с клавиатурой. Ходьба стиком, поворот, хват и касание предметов.
import * as THREE from 'three';

const V = () => new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function handMesh(side) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xdfe6ff, emissive: 0x3344aa, emissiveIntensity: 0.35, roughness: 0.6 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), mat); palm.scale.set(0.55, 1, 1.1); g.add(palm);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group(); f.position.set(0, 0.03 - i * 0.02, -0.045);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.05, 4, 8), mat); m.rotation.x = Math.PI / 2; m.position.z = -0.03; f.add(m);
    g.add(f); fingers.push(f);
  }
  const th = new THREE.Group(); th.position.set(0, 0.045, -0.005);
  const tm = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.035, 4, 8), mat); tm.rotation.x = Math.PI / 2; tm.position.z = -0.025; th.add(tm); th.rotation.x = 0.9; g.add(th);
  g.userData.curl = (k) => { for (const f of fingers) f.rotation.y = side * k * 1.5; };
  return g;
}
function lightMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshBasicMaterial({ color: 0xbfd0ff })));
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(160,190,255,.9)'); gr.addColorStop(1, 'rgba(160,190,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.setScalar(0.11); s.material.opacity = 0.7; g.add(s);
  return g;
}

export function makeInput(W) {
  const { rig, camera, renderer } = W;
  const hands = ['левая', 'правая'].map((name, i) => {
    const h = { name, i, obj: new THREE.Group(), pos: V(), quat: new THREE.Quaternion(), vel: V(), dir: V(), hist: [], held: null, stick: { x: 0, y: 0 }, gp: null,
      grip: false, trigger: false, a: false, b: false, gripDown: false, gripUp: false, trigDown: false, aDown: false, bDown: false };
    h.vis = { hand: handMesh(i ? 1 : -1), light: lightMesh() }; h.obj.add(h.vis.hand, h.vis.light); h.vis.light.visible = false;
    rig.add(h.obj); return h;
  });
  const sim = { yaw: 0, pitch: 0, height: 1.68, keys: {}, turn: 0,
    hand: [{ local: new THREE.Vector3(-0.22, -0.28, -0.5), world: null, grip: false, trigger: false }, { local: new THREE.Vector3(0.22, -0.28, -0.5), world: null, grip: false, trigger: false }],
    stick: { x: 0, y: 0 }, a: false, b: false };
  const grabs = [], touches = [];
  let snapArmed = true;

  // ── мышь и клавиатура ──
  const auto = W.q.get('auto');
  addEventListener('keydown', (e) => {
    sim.keys[e.code] = true;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') W.travel(e.code.slice(-1));
    if (e.code === 'KeyV') W.spectator.cycle();
    if (e.code === 'KeyQ') sim.turn = -1; if (e.code === 'KeyE') sim.turn = 1;
    if (e.code === 'KeyT') { const t = prompt('Фраза гостя:'); if (t) W.net.send('/text', { text: t }); }
    if (e.code === 'KeyR') W.spectator.toggleRec();
  });
  addEventListener('keyup', (e) => { sim.keys[e.code] = false; });
  addEventListener('mousemove', (e) => { if (document.pointerLockElement) { sim.yaw -= e.movementX * 0.0022; sim.pitch = THREE.MathUtils.clamp(sim.pitch - e.movementY * 0.0022, -1.5, 1.5); } });
  addEventListener('mousedown', (e) => { if (!document.pointerLockElement) return; if (e.button === 0) sim.hand[1].trigger = true; if (e.button === 2) sim.hand[1].grip = true; });
  addEventListener('mouseup', (e) => { if (e.button === 0) sim.hand[1].trigger = false; if (e.button === 2) sim.hand[1].grip = false; });
  addEventListener('contextmenu', (e) => e.preventDefault());
  W.canvas.addEventListener('click', () => { if (!W.xr && !auto) { W.canvas.requestPointerLock(); W.voice.unlock(); } });

  const tmpM = new THREE.Matrix4(), tmpV = V(), tmpQ = new THREE.Quaternion(), tmpS = V();
  const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const wpos = (o, out) => o.getWorldPosition(out);

  function readXR() {
    const session = renderer.xr.getSession(), ref = renderer.xr.getReferenceSpace();
    // Раскладка — стандарт WebXR (курок 0, хват 1, стик — оси 2 и 3). Если контроллер через SteamVR пришёл иначе, номера меняются на ходу:
    // действие {"pad":true} показывает Fable, что приходит с контроллеров, {"padMap":{"grip":2}} — переназначает (client.pad в config.json).
    const M = W.cfg.pad, down = (btn) => !!btn && (btn.pressed || btn.value > 0.5);
    for (const src of session.inputSources) {
      const space = src.gripSpace || src.targetRaySpace; if (!space || !src.gamepad) continue;
      const h = hands[src.handedness === 'left' ? 0 : 1];
      const pose = W.frame?.getPose(space, ref);
      if (pose) { h.obj.position.copy(pose.transform.position); h.obj.quaternion.copy(pose.transform.orientation); }
      const gp = src.gamepad, b = gp.buttons; h.gp = gp; h.profiles = src.profiles;
      h._grip = down(b[M.grip]); h._trigger = down(b[M.trigger]); h._a = down(b[M.a]); h._b = down(b[M.b]);
      // стик: из двух пар осей (0–1 и 2–3) берётся та, что отклонена сильнее — подходит и контроллерам, у которых стик в первых двух осях
      const a = gp.axes, p01 = Math.hypot(a[0] || 0, a[1] || 0), p23 = Math.hypot(a[2] || 0, a[3] || 0), ax = p23 >= p01 ? 2 : 0;
      h.stick.x = a[ax] || 0; h.stick.y = a[ax + 1] || 0;
    }
  }
  function readSim() {
    camera.position.set(0, sim.height, 0); camera.rotation.set(sim.pitch, sim.yaw, 0, 'YXZ');
    const k = sim.keys;
    const kx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), ky = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);
    hands[0].stick.x = kx || sim.stick.x; hands[0].stick.y = ky || sim.stick.y;
    hands[1].stick.x = sim.turn; hands[1].stick.y = 0; sim.turn = 0;
    hands.forEach((h, i) => {
      const s = sim.hand[i];
      if (s.world) { rig.updateMatrixWorld(); h.obj.position.copy(rig.worldToLocal(tmpV.copy(s.world))); }
      else h.obj.position.copy(s.local).applyQuaternion(camera.quaternion).add(camera.position);
      h.obj.quaternion.copy(camera.quaternion);
      h._grip = s.grip || (i === 0 && !!k.KeyF); h._trigger = s.trigger; h._a = i === 1 && (sim.a || !!k.KeyB); h._b = i === 1 && sim.b;
    });
  }

  function update(dt) {
    if (W.xr) readXR(); else readSim();
    for (const h of hands) {
      h.gripDown = h._grip && !h.grip; h.gripUp = !h._grip && h.grip; h.trigDown = h._trigger && !h.trigger; h.aDown = h._a && !h.a; h.bDown = h._b && !h.b;
      h.grip = h._grip; h.trigger = h._trigger; h.a = h._a; h.b = h._b;
      h.vis.hand.userData.curl(h.grip ? 1 : h.trigger ? 0.5 : 0.1);
    }
    // ходьба: левый стик, направление — куда смотрит голова
    const L = hands[0].stick, mag = Math.hypot(L.x, L.y);
    if (mag > 0.15 && !W.loc?.noWalk) {
      camera.getWorldDirection(tmpV); tmpV.y = 0; tmpV.normalize();
      const right = tmpS.crossVectors(tmpV, UP).normalize();
      const sp = (W.loc?.walkSpeed || 2.2) * dt;
      rig.position.addScaledVector(tmpV, -L.y * sp).addScaledVector(right, L.x * sp);
    }
    // поворот: правый стик щелчком на 30°, вокруг головы
    const rx = hands[1].stick.x;
    if (Math.abs(rx) > 0.6 && snapArmed) {
      snapArmed = false; const a = -Math.sign(rx) * Math.PI / 6;
      const hp = camera.getWorldPosition(V());
      rig.position.sub(hp).applyAxisAngle(UP, a).add(hp); rig.rotation.y += a;
      if (!W.xr) { /* на мониторе камера крутится мышью, шаг поворота тот же */ }
    } else if (Math.abs(rx) < 0.3) snapArmed = true;
    // границы и высота пола локации считаются по голове
    rig.updateMatrixWorld(true);
    if (W.loc) {
      const hp = camera.getWorldPosition(V()); const c = W.loc.constrain?.(hp.clone());
      if (c) { rig.position.x += c.x - hp.x; rig.position.z += c.z - hp.z; }
      const gy = W.loc.groundY ? W.loc.groundY(hp.x, hp.z) : (W.loc.spawn.y || 0);
      rig.position.y += (gy - rig.position.y) * Math.min(1, dt * 10);
      rig.updateMatrixWorld(true);
    }
    for (const h of hands) {
      wpos(h.obj, h.pos); h.obj.getWorldQuaternion(h.quat); h.dir.set(0, 0, -1).applyQuaternion(h.quat);
      h.hist.push({ p: h.pos.clone(), t: W.t }); if (h.hist.length > 7) h.hist.shift();
      const a = h.hist[0], b = h.hist[h.hist.length - 1];
      if (b.t > a.t) h.vel.subVectors(b.p, a.p).divideScalar(b.t - a.t);
    }
  }

  function nearest(h) {
    let best = null, bd = 1e9;
    for (const g of grabs) {
      if (!g.enabled || g.held || !visible(g.obj)) continue;
      const d = wpos(g.obj, tmpV).distanceTo(h.pos);
      if (d < g.r && d < bd) { bd = d; best = g; }
    }
    if (best) return best;
    bd = W.xr ? 0.985 : 0.96; // далёкий хват: предмет почти точно по направлению руки
    const from = camera.getWorldPosition(V());
    for (const g of grabs) {
      if (!g.enabled || g.held || g.far === false || !visible(g.obj)) continue;
      wpos(g.obj, tmpV).sub(W.xr ? h.pos : from); const d = tmpV.length(); // на мониторе целятся прицелом из глаз, а не рукой сбоку if (d > (g.farDist || 9)) continue;
      const c = tmpV.normalize().dot(h.dir); if (c > bd) { bd = c; best = g; }
    }
    if (best) best._fly = 1;
    return best;
  }
  function setWorld(o, m) {
    if (o.parent) { o.parent.updateWorldMatrix(true, false); tmpM.copy(o.parent.matrixWorld).invert().multiply(m); } else tmpM.copy(m);
    tmpM.decompose(o.position, o.quaternion, tmpS);
  }
  const hm = new THREE.Matrix4(), target = new THREE.Matrix4();
  // метка «это сейчас возьмётся»: кольцо вокруг предмета, на который смотрит свободная рука
  const aim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
  aim.renderOrder = 999; aim.visible = false; W.scene.add(aim);
  function interact(dt) {
    { const h = hands[1].held ? hands[0] : hands[1], g = h.held ? null : nearest(h); aim.visible = !!g;
      if (g) { wpos(g.obj, aim.position); aim.quaternion.copy(camera.getWorldQuaternion(tmpQ)); aim.scale.setScalar((g.r || 0.16) * (1 + 0.08 * Math.sin(W.t * 6))); g._fly = 0; } }
    for (const h of hands) {
      if ((h.gripDown || (!W.xr && h.grip)) && !h.held) { // на мониторе хват срабатывает и при зажатой кнопке, когда прицел дошёл до предмета
        const g = nearest(h);
        if (g) {
          g.held = h; h.held = g; h.obj.updateWorldMatrix(true, false); g.obj.updateWorldMatrix(true, false);
          if (g._fly || g.snap) g.off = new THREE.Matrix4().makeTranslation(0, 0, -(g.holdDist ?? 0.04));
          else g.off = new THREE.Matrix4().copy(h.obj.matrixWorld).invert().multiply(g.obj.matrixWorld);
          g.body?.setBodyType(2, true); // кинематика: предмет ведёт рука
          pulse(h, 0.5, 40); g.onGrab?.(h); W.emit('grab', g);
        }
      }
      const g = h.held;
      if (g) {
        h.obj.updateWorldMatrix(true, false); target.multiplyMatrices(h.obj.matrixWorld, g.off);
        if (g._fly) { // предмет летит в руку
          g.obj.updateWorldMatrix(true, false); const cur = wpos(g.obj, V()), want = V().setFromMatrixPosition(target);
          cur.lerp(want, 1 - Math.exp(-dt * 16)); if (cur.distanceTo(want) < 0.03) g._fly = 0;
          target.setPosition(cur);
        }
        setWorld(g.obj, target);
        if (g.body) { if (g.localBody) { g.body.setNextKinematicTranslation(g.obj.position); g.body.setNextKinematicRotation(g.obj.quaternion); } // тело живёт в координатах своей группы
          else { wpos(g.obj, tmpV); g.body.setNextKinematicTranslation(tmpV); g.obj.getWorldQuaternion(tmpQ); g.body.setNextKinematicRotation(tmpQ); } }
        g.onHold?.(h, dt);
        if (h.gripUp) {
          h.held = null; g.held = null; g._fly = 0;
          const v = h.vel.clone().multiplyScalar(g.throwBoost ?? 1.25); if (g.maxThrow) v.clampLength(0, g.maxThrow);
          if (g.body) { g.body.setBodyType(0, true); g.body.setLinvel(v, true); g.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
          g.onRelease?.(h, v); W.emit('release', { g, v });
        }
      }
      for (const t of touches) {
        if (!t.enabled || W.t - t.last < t.cooldown || !visible(t.obj)) continue;
        if (wpos(t.obj, tmpV).add(t.offset).distanceTo(h.pos) < t.r) { t.last = W.t; t.fn(h); }
      }
      if (h.trigDown) W.emit('trigger', h);
      if (h.aDown) W.emit('button-a', h);
      if (h.bDown) W.emit('button-b', h);
    }
  }
  // что сейчас приходит с контроллеров — для Fable, когда «кнопка не та»
  W.actions.pad = () => W.net.event('контроллеры', { раскладка: W.cfg.pad, руки: hands.filter((h) => h.gp).map((h) => ({ рука: h.name, профиль: (h.profiles || []).join(' '), нажаты: [...h.gp.buttons].map((x, i) => (x.pressed || x.value > 0.5 ? i : -1)).filter((i) => i >= 0), кнопок: h.gp.buttons.length, оси: [...h.gp.axes].map((v) => +v.toFixed(2)) })) }, true);
  W.actions.padMap = (m) => { for (const [k, v] of Object.entries(m)) { if (!(k in W.cfg.pad) || !Number.isInteger(v) || v < 0) throw new Error('padMap: ключи grip, trigger, a, b; значение — номер кнопки'); W.cfg.pad[k] = v; } };
  function pulse(h, strength = 0.5, ms = 50) { try { h.gp?.hapticActuators?.[0]?.pulse(strength, ms); } catch { /* вибрации может не быть */ } }

  return {
    hands, sim, update, interact, pulse, grabs, touches,
    addGrab(obj, opt = {}) { const g = { obj, name: opt.name || obj.name || 'предмет', r: 0.16, enabled: true, held: null, ...opt }; grabs.push(g); return g; },
    addTouch(obj, r, fn, opt = {}) { const t = { obj, r, fn, cooldown: 1, last: -9, enabled: true, offset: V(), ...opt }; touches.push(t); return t; },
    handStyle(s) { for (const h of hands) { h.vis.hand.visible = s === 'hand'; h.vis.light.visible = s === 'light'; } },
    lockMouse() { W.canvas.requestPointerLock(); },
  };
}
