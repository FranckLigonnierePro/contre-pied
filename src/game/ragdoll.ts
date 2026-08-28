import * as THREE from 'three';
import { RAPIER, type World } from '../core/physics';
import { PALETTE } from '../core/constants';
import { createPlayerSkin, syncPlayerSkin, type PlayerSkin } from './playerModel';

type Body = RAPIER.RigidBody;

interface PartSpec {
  name: string;
  halfHeight: number;
  radius: number;
  /** Position au repos, relative au bassin. */
  offset: [number, number, number];
  parent?: string;
  color: number;
  /** Rigidite du maintien de pose : 0 = membre totalement libre. */
  stiffness: number;
}

const PELVIS_Y = 0.95;

const SPECS: PartSpec[] = [
  { name: 'pelvis', halfHeight: 0.07, radius: 0.16, offset: [0, 0, 0], color: 0, stiffness: 26 },
  { name: 'torso', halfHeight: 0.15, radius: 0.19, offset: [0, 0.38, 0], parent: 'pelvis', color: 0, stiffness: 22 },
  { name: 'head', halfHeight: 0.02, radius: 0.16, offset: [0, 0.76, 0], parent: 'torso', color: PALETTE.peau, stiffness: 14 },
  { name: 'upperArmL', halfHeight: 0.11, radius: 0.065, offset: [-0.3, 0.47, 0], parent: 'torso', color: PALETTE.peau, stiffness: 10 },
  { name: 'foreArmL', halfHeight: 0.11, radius: 0.055, offset: [-0.3, 0.2, 0], parent: 'upperArmL', color: PALETTE.peau, stiffness: 8 },
  { name: 'upperArmR', halfHeight: 0.11, radius: 0.065, offset: [0.3, 0.47, 0], parent: 'torso', color: PALETTE.peau, stiffness: 12 },
  { name: 'foreArmR', halfHeight: 0.11, radius: 0.055, offset: [0.3, 0.2, 0], parent: 'upperArmR', color: PALETTE.peau, stiffness: 10 },
  { name: 'thighL', halfHeight: 0.15, radius: 0.09, offset: [-0.11, -0.32, 0], parent: 'pelvis', color: 0, stiffness: 9 },
  { name: 'shinL', halfHeight: 0.16, radius: 0.075, offset: [-0.11, -0.68, 0], parent: 'thighL', color: PALETTE.peau, stiffness: 7 },
  { name: 'thighR', halfHeight: 0.15, radius: 0.09, offset: [0.11, -0.32, 0], parent: 'pelvis', color: 0, stiffness: 9 },
  { name: 'shinR', halfHeight: 0.16, radius: 0.075, offset: [0.11, -0.68, 0], parent: 'thighR', color: PALETTE.peau, stiffness: 7 },
];

export interface Part {
  spec: PartSpec;
  body: Body;
  mesh: THREE.Mesh;
  /** Orientation cible, exprimee dans le repere du bassin. */
  target: THREE.Quaternion;
  /**
   * Multiplicateur de raideur. A 1 le membre est mou et suit mollement sa
   * cible ; on le monte le temps d'un geste pour que celui-ci soit visible.
   */
  gain: number;
}

const _q = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _qErr = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _qDelta = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const LIMB_AXIS = new THREE.Vector3(0, -1, 0);
const _aimDir = new THREE.Vector3();
const _aimQuat = new THREE.Quaternion();
const _yawInv = new THREE.Quaternion();

/** Vitesse angulaire max d'un membre pilote (rad/s). */
const MAX_ANGVEL = 14;

/**
 * Personnage entierement ragdoll : aucune animation n'est jouee.
 * Chaque membre est ramene vers une pose cible par un asservissement en couple,
 * et il suffit de couper cet asservissement pour que le bonhomme s'ecroule.
 */
export class Ragdoll {
  readonly parts = new Map<string, Part>();
  readonly group = new THREE.Group();
  /** Duree restante d'ecroulement, en secondes. */
  stun = 0;
  yaw = 0;

  private spawn: THREE.Vector3;
  private skin: PlayerSkin | null = null;

  constructor(
    world: World,
    scene: THREE.Scene,
    position: THREE.Vector3,
    yaw: number,
    shirtColor: number,
    collisionGroups: number,
    playerModel?: THREE.Group,
  ) {
    this.spawn = position.clone();
    this.yaw = yaw;
    scene.add(this.group);

    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    for (const spec of SPECS) {
      const local = new THREE.Vector3(...spec.offset).applyQuaternion(rot);
      const world0 = position.clone().add(local).setY(position.y + PELVIS_Y + spec.offset[1]);

      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(world0.x, world0.y, world0.z)
          .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
          .setLinearDamping(0.35)
          .setAngularDamping(1.4)
          .setCcdEnabled(spec.name === 'pelvis'),
      );
      world.createCollider(
        RAPIER.ColliderDesc.capsule(spec.halfHeight, spec.radius)
          .setDensity(spec.name === 'pelvis' ? 9 : 0.7)
          .setRestitution(0.05)
          .setFriction(0.9)
          .setCollisionGroups(collisionGroups),
        body,
      );

      const color = spec.color || shirtColor;
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(spec.radius, spec.halfHeight * 2, 6, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
      );
      mesh.castShadow = true;
      if (playerModel) mesh.visible = false;
      this.group.add(mesh);

      this.parts.set(spec.name, { spec, body, mesh, target: new THREE.Quaternion(), gain: 1 });
    }

    if (playerModel) {
      this.skin = createPlayerSkin(playerModel);
      this.group.add(this.skin.root);
    } else {
      this.addFace(shirtColor);
    }

    // Les articulations ne font que tenir les membres ensemble : tout le
    // mouvement vient de l'asservissement en couple.
    for (const spec of SPECS) {
      if (!spec.parent) continue;
      const child = this.parts.get(spec.name)!;
      const parent = this.parts.get(spec.parent)!;
      const mid = [
        (spec.offset[0] + parent.spec.offset[0]) / 2,
        (spec.offset[1] + parent.spec.offset[1]) / 2,
        (spec.offset[2] + parent.spec.offset[2]) / 2,
      ] as const;
      const anchorChild = {
        x: mid[0] - spec.offset[0],
        y: mid[1] - spec.offset[1],
        z: mid[2] - spec.offset[2],
      };
      const anchorParent = {
        x: mid[0] - parent.spec.offset[0],
        y: mid[1] - parent.spec.offset[1],
        z: mid[2] - parent.spec.offset[2],
      };
      world.createImpulseJoint(
        RAPIER.JointData.spherical(anchorParent, anchorChild),
        parent.body,
        child.body,
        true,
      );
    }
  }

  private addFace(shirtColor: number) {
    const head = this.parts.get('head')!;
    const eyeGeo = new THREE.SphereGeometry(0.035, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x14141c });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(s * 0.06, 0.03, -0.14);
      head.mesh.add(eye);
    }
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.165, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.6 }),
    );
    cap.position.y = 0.02;
    head.mesh.add(cap);
  }

  get pelvis(): Body {
    return this.parts.get('pelvis')!.body;
  }

  position(out = new THREE.Vector3()): THREE.Vector3 {
    const t = this.pelvis.translation();
    return out.set(t.x, t.y, t.z);
  }

  /** Position approximative de la main droite, ou est fixee la raquette. */
  handPosition(out = new THREE.Vector3()): THREE.Vector3 {
    const fore = this.parts.get('foreArmR')!;
    const t = fore.body.translation();
    const r = fore.body.rotation();
    _v.set(0, -fore.spec.halfHeight - 0.05, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
    return out.set(t.x + _v.x, t.y + _v.y, t.z + _v.z);
  }

  /** Coupe l'asservissement : le personnage s'effondre pendant `seconds`. */
  collapse(seconds = 1.4) {
    this.stun = Math.max(this.stun, seconds);
  }

  get isDown(): boolean {
    return this.stun > 0;
  }

  setTarget(part: string, euler: THREE.Euler, gain = 1) {
    const p = this.parts.get(part);
    if (!p) return;
    p.target.setFromEuler(euler);
    p.gain = gain;
  }

  /**
   * Oriente un membre pour que son axe pointe vers `point`. C'est ce qui fait
   * que la raquette va reellement chercher la balle au lieu de brasser l'air.
   */
  aimLimbAt(part: string, point: THREE.Vector3, gain = 1) {
    const p = this.parts.get(part);
    if (!p) return;
    const t = p.body.translation();
    _aimDir.set(point.x - t.x, point.y - t.y, point.z - t.z);
    if (_aimDir.lengthSq() < 1e-6) return;
    _aimDir.normalize();
    // L'axe d'un membre est son -y local (la main est au bout du bras).
    _aimQuat.setFromUnitVectors(LIMB_AXIS, _aimDir);
    _yawInv.setFromAxisAngle(UP, -this.yaw);
    p.target.copy(_yawInv).multiply(_aimQuat);
    p.gain = gain;
  }

  resetPose() {
    for (const part of this.parts.values()) {
      part.target.identity();
      part.gain = 1;
    }
  }

  /** Replace le personnage debout a son point de depart. */
  respawn(position: THREE.Vector3, yaw: number) {
    this.spawn.copy(position);
    this.yaw = yaw;
    this.stun = 0;
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (const part of this.parts.values()) {
      const local = new THREE.Vector3(part.spec.offset[0], 0, part.spec.offset[2]).applyQuaternion(rot);
      part.body.setTranslation(
        {
          x: position.x + local.x,
          y: PELVIS_Y + part.spec.offset[1],
          z: position.z + local.z,
        },
        true,
      );
      part.body.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, true);
      part.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      part.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      part.target.identity();
    }
  }

  /**
   * @param dt        pas fixe
   * @param moveDir   direction souhaitee dans le plan horizontal (norme <= 1)
   * @param speed     vitesse de deplacement max
   * @param facing    cap vise, en radians
   */
  update(dt: number, moveDir: THREE.Vector3, speed: number, facing: number) {
    if (this.stun > 0) {
      this.stun -= dt;
      if (this.stun <= 0) this.respawnUpright();
      return;
    }

    this.yaw = approachAngle(this.yaw, facing, 7 * dt);
    const yawQuat = _qInv.setFromAxisAngle(UP, this.yaw);

    const pelvis = this.pelvis;
    const p = pelvis.translation();
    const v = pelvis.linvel();

    // Deplacement : on pilote directement la vitesse du bassin, bornee.
    // Les membres suivent en pendules, ce qui donne la demarche pataude.
    const wanted = _v.copy(moveDir).multiplyScalar(speed);
    const blend = Math.min(1, 12 * dt);
    // La hauteur du bassin est imposee, pas negociee : sans cela le poids des
    // membres finit toujours par faire s'affaisser le personnage.
    const vy = THREE.MathUtils.clamp((PELVIS_Y - p.y) * 12, -7, 7);
    pelvis.setLinvel(
      { x: v.x + (wanted.x - v.x) * blend, y: vy, z: v.z + (wanted.z - v.z) * blend },
      true,
    );

    for (const part of this.parts.values()) {
      const desired = _q.copy(yawQuat).multiply(part.target);
      driveToPose(part, desired, dt);
    }
  }

  private respawnUpright() {
    const p = this.pelvis.translation();
    this.respawn(new THREE.Vector3(p.x, 0, p.z), this.yaw);
  }

  /** Recopie les transformations physiques vers les meshes. */
  sync() {
    for (const part of this.parts.values()) {
      const t = part.body.translation();
      const r = part.body.rotation();
      part.mesh.position.set(t.x, t.y, t.z);
      part.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    if (this.skin) {
      syncPlayerSkin(this.skin, this.parts, { yaw: this.yaw, plantFeet: !this.isDown });
    }
  }

  get spawnPoint(): THREE.Vector3 {
    return this.spawn;
  }
}

/**
 * Ramene un membre vers son orientation cible en imposant une vitesse angulaire
 * bornee. Contrairement a un couple, cela ne peut pas diverger : c'est ce qui
 * rend le ragdoll pilotable sans qu'il parte en vrille.
 */
function driveToPose(part: Part, desired: THREE.Quaternion, dt: number) {
  const r = part.body.rotation();
  _qErr.set(r.x, r.y, r.z, r.w).invert();
  const delta = _qDelta.copy(desired).multiply(_qErr);
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);

  const s = Math.sqrt(Math.max(1e-8, 1 - delta.w * delta.w));
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(delta.w, -1, 1));
  _axis.set(delta.x / s, delta.y / s, delta.z / s);

  const gain = part.spec.stiffness * 0.6 * part.gain;
  const wanted = _axis.multiplyScalar(THREE.MathUtils.clamp(angle * gain, -MAX_ANGVEL, MAX_ANGVEL));
  const w = part.body.angvel();
  const blend = Math.min(1, part.spec.stiffness * 0.5 * part.gain * dt);
  part.body.setAngvel(
    {
      x: w.x + (wanted.x - w.x) * blend,
      y: w.y + (wanted.y - w.y) * blend,
      z: w.z + (wanted.z - w.z) * blend,
    },
    true,
  );
}

function approachAngle(from: number, to: number, maxStep: number): number {
  let d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-maxStep, Math.min(maxStep, d));
}
