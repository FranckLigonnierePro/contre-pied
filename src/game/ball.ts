import * as THREE from 'three';
import { RAPIER, type World } from '../core/physics';
import { BALL_DAMPING, BALL_RADIUS, COURT, GROUPS, PALETTE } from '../core/constants';

export type BounceKind = 'floor' | 'net' | 'wall' | 'out';

const KINDS: BounceKind[] = ['floor', 'net', 'wall', 'out'];

export interface BounceEvent {
  kind: BounceKind;
  /** Cote du court ou l'evenement s'est produit (+1 joueur, -1 IA). */
  side: number;
  position: THREE.Vector3;
}

/** La balle : un corps physique, plus la detection des rebonds utile aux regles. */
export class Ball {
  readonly body: RAPIER.RigidBody;
  readonly mesh: THREE.Mesh;
  readonly trail: THREE.Points;

  private prevVx = 0;
  private prevVz = 0;
  private prevVy = 0;
  /** Silence global juste apres une frappe : la frappe elle-meme n'est pas un rebond. */
  private cooldown = 0;
  /**
   * Anti-rebond par type d'evenement. Un compteur unique ne suffit pas : au
   * padel la balle touche la vitre une fraction de seconde apres le rebond au
   * sol, et le silence du sol avalait la vitre — soit exactement la sequence
   * que le jeu au mur doit reconnaitre.
   */
  private muets: Record<BounceKind, number> = { floor: 0, net: 0, wall: 0, out: 0 };
  private trailPositions: Float32Array;
  private trailIndex = 0;

  constructor(world: World, scene: THREE.Scene) {
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 1.2, 6)
        .setLinearDamping(BALL_DAMPING)
        .setAngularDamping(0.2)
        .setCcdEnabled(true),
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setRestitution(0.72)
        .setFriction(0.5)
        .setDensity(2.2)
        .setCollisionGroups(GROUPS.ball),
      this.body,
    );

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.balle, roughness: 0.6, emissive: 0x2a3a00 }),
    );
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    const count = 24;
    this.trailPositions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trail = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: PALETTE.balle, size: 0.07, transparent: true, opacity: 0.45 }),
    );
    this.trail.frustumCulled = false;
    scene.add(this.trail);
  }

  position(out = new THREE.Vector3()): THREE.Vector3 {
    const t = this.body.translation();
    return out.set(t.x, t.y, t.z);
  }

  velocity(out = new THREE.Vector3()): THREE.Vector3 {
    const v = this.body.linvel();
    return out.set(v.x, v.y, v.z);
  }

  reset(position: THREE.Vector3, velocity = new THREE.Vector3()) {
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.cooldown = 0.08;
    for (const kind of KINDS) this.muets[kind] = 0;
    for (let i = 0; i < this.trailPositions.length; i += 3) {
      this.trailPositions[i] = position.x;
      this.trailPositions[i + 1] = position.y;
      this.trailPositions[i + 2] = position.z;
    }
  }

  launch(velocity: THREE.Vector3, spin = 0) {
    this.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    this.body.setAngvel({ x: 0, y: spin, z: 0 }, true);
    this.cooldown = 0.05;
  }

  /** Avance la detection d'evenements et renvoie ceux du pas courant. */
  step(dt: number): BounceEvent[] {
    const events: BounceEvent[] = [];
    const p = this.position();
    const v = this.velocity();
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const kind of KINDS) this.muets[kind] = Math.max(0, this.muets[kind] - dt);

    const emettre = (kind: BounceKind, side: number, silence: number) => {
      events.push({ kind, side, position: p.clone() });
      this.muets[kind] = silence;
    };

    if (this.cooldown === 0) {
      // Rebond au sol : la vitesse verticale change de signe pres du sol.
      if (
        this.muets.floor === 0 &&
        p.y < BALL_RADIUS + 0.06 && this.prevVy < -0.5 && v.y >= this.prevVy
      ) {
        emettre('floor', Math.sign(p.z) || 1, 0.12);
      } else if (
        this.muets.net === 0 &&
        Math.abs(p.z) < 0.12 &&
        p.y < COURT.netHeight &&
        Math.sign(v.z) !== Math.sign(this.prevVz)
      ) {
        emettre('net', Math.sign(this.prevVz) * -1 || 1, 0.2);
      } else if (this.muets.wall === 0 && this.hitsWall(p, v)) {
        emettre('wall', Math.sign(p.z) || 1, 0.15);
      } else if (this.muets.out === 0 && this.isOut(p)) {
        emettre('out', Math.sign(p.z) || 1, 0.5);
      }
    }

    this.prevVx = v.x;
    this.prevVz = v.z;
    this.prevVy = v.y;

    this.trailIndex = (this.trailIndex + 1) % (this.trailPositions.length / 3);
    this.trailPositions.set([p.x, p.y, p.z], this.trailIndex * 3);
    (this.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    return events;
  }

  /**
   * Rebond sur une vitre : la composante de vitesse perpendiculaire a la paroi
   * s'inverse a son contact. Les parois laterales et le fond sont traites
   * pareil, la regle du padel ne les distingue pas.
   */
  private hitsWall(p: THREE.Vector3, v: THREE.Vector3): boolean {
    const marge = BALL_RADIUS + 0.1;
    const lateral =
      Math.abs(p.x) > COURT.halfWidth - marge &&
      p.y < COURT.sideWallHeight &&
      Math.abs(this.prevVx) > 0.5 &&
      Math.sign(v.x) !== Math.sign(this.prevVx);
    if (lateral) return true;
    return (
      Math.abs(p.z) > COURT.halfLength - marge &&
      p.y < COURT.backWallHeight &&
      Math.abs(this.prevVz) > 0.5 &&
      Math.sign(v.z) !== Math.sign(this.prevVz)
    );
  }

  /**
   * La balle n'est sortie que si elle a quitte l'emprise du court. Tester la
   * hauteur seule etait un bug : tout lob passant au-dessus des parois etait
   * annonce faute alors qu'il retombait dans le terrain.
   */
  private isOut(p: THREE.Vector3): boolean {
    const beyond =
      Math.abs(p.x) > COURT.halfWidth + 0.3 || Math.abs(p.z) > COURT.halfLength + 0.3;
    return beyond || p.y > 14;
  }

  sync() {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}
