import * as THREE from 'three';
import { Ragdoll } from './ragdoll';
import { Ball } from './ball';
import type { World } from '../core/physics';
import { BALL_RADIUS, COURT, GRAVITY, GROUPS, PALETTE, PLAYER_SIDE } from '../core/constants';

export type ShotKind = 'plat' | 'lob' | 'smash';

export interface HitResult {
  kind: ShotKind;
  power: number;
  position: THREE.Vector3;
}

const REACH = 1.3;
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const SWING_DURATION = 0.34;
/** Fenetre de contact, en fraction du swing : frapper trop tot ou trop tard rate. */
const CONTACT_FROM = 0.25;
const CONTACT_TO = 0.62;

/** Un joueur : le ragdoll, sa raquette, et la logique de frappe. */
export class Character {
  readonly ragdoll: Ragdoll;
  readonly racket: THREE.Group;

  private swingT = -1;
  private swingKind: ShotKind = 'plat';
  private swingTarget = new THREE.Vector3(0, 0, -1);
  private swingCharge = 1;
  private hasContact = false;
  private cooldown = 0;

  constructor(
    world: World,
    private scene: THREE.Scene,
    readonly side: number,
    color: number,
  ) {
    const spawn = new THREE.Vector3(0, 0, side * 7.5);
    this.ragdoll = new Ragdoll(
      world,
      scene,
      spawn,
      side > 0 ? Math.PI : 0,
      color,
      side === PLAYER_SIDE ? GROUPS.player : GROUPS.ai,
    );
    this.racket = buildRacket();
    scene.add(this.racket);
  }

  get isDown() {
    return this.ragdoll.isDown;
  }

  get isSwinging() {
    return this.swingT >= 0;
  }

  get canSwing() {
    return this.cooldown <= 0 && !this.isSwinging && !this.isDown;
  }

  position(out = new THREE.Vector3()) {
    return this.ragdoll.position(out);
  }

  /** Declenche un swing vise vers le point `target` du camp adverse. */
  swing(kind: ShotKind, target: THREE.Vector3, charge = 1) {
    if (!this.canSwing) return;
    this.swingT = 0;
    this.swingKind = kind;
    this.swingTarget.copy(target).setY(0);
    this.swingCharge = THREE.MathUtils.clamp(charge, 0.4, 1.6);
    this.hasContact = false;
  }

  update(dt: number, move: THREE.Vector3, facing: number, ball: Ball): HitResult | null {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const sprinting = move.lengthSq() > 0.01;
    this.ragdoll.update(dt, move, sprinting ? 5.4 : 0, facing);

    let hit: HitResult | null = null;
    if (this.swingT >= 0) {
      this.swingT += dt;
      this.animateSwing(this.swingT / SWING_DURATION);
      const t = this.swingT / SWING_DURATION;
      if (!this.hasContact && t >= CONTACT_FROM && t <= CONTACT_TO) {
        hit = this.tryContact(ball);
      }
      if (this.swingT >= SWING_DURATION) {
        this.swingT = -1;
        this.cooldown = 0.12;
        this.ragdoll.resetPose();
      }
    } else if (!this.isDown) {
      this.idlePose(performance.now() / 1000, sprinting);
    }

    this.syncRacket();
    return hit;
  }

  private tryContact(ball: Ball): HitResult | null {
    const hand = this.ragdoll.handPosition();
    const bp = ball.position();
    if (hand.distanceTo(bp) > REACH) return null;

    this.hasContact = true;
    const power = this.swingCharge;

    // On resout la trajectoire pour que la balle retombe reellement dans la
    // cible : sans cela la quasi-totalite des echanges finissent au filet.
    const target = _target.copy(this.swingTarget);
    target.x = THREE.MathUtils.clamp(target.x, -COURT.halfWidth + 0.6, COURT.halfWidth - 0.6);
    target.z = THREE.MathUtils.clamp(
      target.z,
      this.side > 0 ? -COURT.halfLength + 1 : 1.5,
      this.side > 0 ? -1.5 : COURT.halfLength - 1,
    );

    const peak = this.swingKind === 'lob' ? 6.2 : this.swingKind === 'smash' ? 0.25 : 1.5 + power * 0.9;
    const velocity = ballisticVelocity(bp, target, peak);

    ball.reset(bp.clone().addScaledVector(_dir.copy(target).sub(bp).setY(0).normalize(), BALL_RADIUS * 2.5));
    ball.launch(velocity, (Math.random() - 0.5) * 12);
    return { kind: this.swingKind, power, position: bp.clone() };
  }

  /** Le swing est joue en deplacant la cible du bras : le ragdoll fait le reste. */
  private animateSwing(t: number) {
    const k = THREE.MathUtils.clamp(t, 0, 1);
    const arc = Math.sin(k * Math.PI);
    if (this.swingKind === 'smash') {
      this.ragdoll.setTarget('upperArmR', new THREE.Euler(-2.6 + arc * 3.4, 0, -0.5));
      this.ragdoll.setTarget('foreArmR', new THREE.Euler(-2.2 + arc * 3.2, 0, 0));
      this.ragdoll.setTarget('torso', new THREE.Euler(-0.35 + arc * 0.7, 0, 0));
    } else if (this.swingKind === 'lob') {
      this.ragdoll.setTarget('upperArmR', new THREE.Euler(0.9 - arc * 1.9, 0, -0.9));
      this.ragdoll.setTarget('foreArmR', new THREE.Euler(0.5 - arc * 1.2, 0, 0));
    } else {
      this.ragdoll.setTarget('upperArmR', new THREE.Euler(0.2, -1.5 + arc * 3.0, -1.2 + arc * 0.6));
      this.ragdoll.setTarget('foreArmR', new THREE.Euler(0, -0.8 + arc * 1.6, 0));
      this.ragdoll.setTarget('torso', new THREE.Euler(0, -0.6 + arc * 1.2, 0));
    }
  }

  private idlePose(time: number, moving: boolean) {
    const amp = moving ? 0.75 : 0.16;
    const s = Math.sin(time * (moving ? 9 : 2.2)) * amp;
    this.ragdoll.setTarget('thighL', new THREE.Euler(s, 0, 0));
    this.ragdoll.setTarget('thighR', new THREE.Euler(-s, 0, 0));
    this.ragdoll.setTarget('upperArmL', new THREE.Euler(-s * 0.6, 0, 0.35));
    this.ragdoll.setTarget('upperArmR', new THREE.Euler(s * 0.4, 0, -0.7));
    this.ragdoll.setTarget('foreArmR', new THREE.Euler(-0.5, 0, 0));
  }

  private syncRacket() {
    const fore = this.ragdoll.parts.get('foreArmR')!;
    const t = fore.body.translation();
    const r = fore.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const offset = new THREE.Vector3(0, -fore.spec.halfHeight - 0.26, 0).applyQuaternion(q);
    this.racket.position.set(t.x + offset.x, t.y + offset.y, t.z + offset.z);
    this.racket.quaternion.copy(q);
  }

  sync() {
    this.ragdoll.sync();
  }

  respawn() {
    this.ragdoll.respawn(new THREE.Vector3(0, 0, this.side * 7.5), this.side > 0 ? Math.PI : 0);
    this.swingT = -1;
    this.cooldown = 0;
  }

  dispose() {
    this.scene.remove(this.racket);
  }
}

function buildRacket(): THREE.Group {
  const group = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.13, 0.03, 16),
    new THREE.MeshStandardMaterial({ color: PALETTE.raquette, roughness: 0.5 }),
  );
  face.rotation.x = Math.PI / 2;
  face.position.y = -0.2;
  face.castShadow = true;
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.18, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a3a44 }),
  );
  handle.position.y = -0.05;
  group.add(face, handle);
  return group;
}

/**
 * Vitesse initiale pour qu'une balle partant de `from` retombe sur `to` en
 * culminant `peak` metres au-dessus du point de depart.
 */
export function ballisticVelocity(from: THREE.Vector3, to: THREE.Vector3, peak: number): THREE.Vector3 {
  const g = Math.abs(GRAVITY);
  const targetY = 0.4; // hauteur de rebond visee
  const vy = Math.sqrt(2 * g * Math.max(0.05, peak));
  // Duree totale : montee jusqu'au sommet, puis chute jusqu'a `targetY`.
  const t = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * (from.y - targetY)))) / g;
  return new THREE.Vector3((to.x - from.x) / t, vy, (to.z - from.z) / t);
}
