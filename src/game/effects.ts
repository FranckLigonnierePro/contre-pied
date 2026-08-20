import * as THREE from 'three';
import { GRAVITY, PALETTE } from '../core/constants';

/**
 * Cercle au sol indiquant ou la balle va rebondir. C'est le repere qui rend le
 * jeu au rebond praticable : sans lui on court a l'aveugle.
 */
export class LandingMarker {
  private mesh: THREE.Mesh;
  private pulse = 0;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.46, 28),
      new THREE.MeshBasicMaterial({
        color: PALETTE.balle,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.02;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(dt: number, ballPos: THREE.Vector3, ballVel: THREE.Vector3, side: number) {
    // On n'affiche le repere que pour la balle qui arrive vers le joueur.
    const approaching = Math.sign(ballVel.z) === Math.sign(side) && ballPos.y > 0.2;
    if (!approaching) {
      this.mesh.visible = false;
      return;
    }
    const point = predictLanding(ballPos, ballVel);
    this.mesh.visible = true;
    this.mesh.position.set(point.x, 0.02, point.z);
    this.pulse += dt * 6;
    const scale = 1 + Math.sin(this.pulse) * 0.12;
    this.mesh.scale.set(scale, scale, 1);
  }

  hide() {
    this.mesh.visible = false;
  }
}

const _out = new THREE.Vector3();

/** Point de chute au sol d'une balle en vol libre. */
export function predictLanding(pos: THREE.Vector3, vel: THREE.Vector3, groundY = 0.05): THREE.Vector3 {
  const g = Math.abs(GRAVITY);
  const disc = vel.y * vel.y + 2 * g * (pos.y - groundY);
  const t = disc > 0 ? (vel.y + Math.sqrt(disc)) / g : 0;
  return _out.set(pos.x + vel.x * t, groundY, pos.z + vel.z * t);
}

/** Eclat blanc au point d'impact raquette/balle. */
export class ImpactFlash {
  private pool: THREE.Mesh[] = [];
  private live: { mesh: THREE.Mesh; life: number }[] = [];

  constructor(private scene: THREE.Scene) {}

  burst(position: THREE.Vector3, power: number) {
    const mesh = this.pool.pop() ?? this.make();
    mesh.position.copy(position);
    mesh.scale.setScalar(0.12);
    mesh.visible = true;
    (mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
    this.scene.add(mesh);
    this.live.push({ mesh, life: 0.18 + power * 0.05 });
  }

  private make(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }),
    );
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const item = this.live[i];
      item.life -= dt;
      const mat = item.mesh.material as THREE.MeshBasicMaterial;
      item.mesh.scale.multiplyScalar(1 + dt * 9);
      mat.opacity = Math.max(0, item.life * 4);
      if (item.life <= 0) {
        this.scene.remove(item.mesh);
        this.pool.push(item.mesh);
        this.live.splice(i, 1);
      }
    }
  }
}
