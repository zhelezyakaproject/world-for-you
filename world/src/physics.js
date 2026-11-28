// Физика (Rapier): мяч, шары, кегли. Один общий вход, у каждой локации свой мир тел.
import * as R from 'rapier';

const RAPIER = R.default || R;
let ready = null;
export const initPhysics = () => (ready ||= RAPIER.init().then(() => RAPIER));

// Мир тел локации: шаг по времени кадра, связь «тело ↔ предмет на экране».
export async function makeWorld(gravity = -9.81) {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
  const pairs = [];
  return {
    RAPIER, world, pairs,
    fixed(desc, x = 0, y = 0, z = 0) { const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z)); return world.createCollider(desc, b); },
    dynamic(obj, desc, { ccd = true, linDamp = 0.05, angDamp = 0.1 } = {}) {
      const p = obj.position, q = obj.quaternion;
      const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCcdEnabled(ccd).setLinearDamping(linDamp).setAngularDamping(angDamp));
      const c = world.createCollider(desc, b); pairs.push({ obj, b }); return { body: b, collider: c };
    },
    step(dt) {
      world.timestep = Math.min(dt, 1 / 30); world.step();
      for (const { obj, b } of pairs) { if (b.isKinematic()) continue; const t = b.translation(), r = b.rotation(); obj.position.set(t.x, t.y, t.z); obj.quaternion.set(r.x, r.y, r.z, r.w); }
    },
    place(b, x, y, z) { b.setTranslation({ x, y, z }, true); b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true); },
  };
}
