import * as THREE from 'three';
import { COURT, PLAYER_SIDE } from './constants';

const PEAK = 0.52;
const BASE_WALL = 0.06;
const BASE_STAND = 0.04;
const BASE_DECOR = 0.08;

/** Marque un mesh comme occultant cote joueur (caméra derrière le camp +z). */
export function markPlayerOccluder(
  mesh: THREE.Mesh,
  baseOpacity = BASE_STAND,
  peakOpacity = PEAK,
): THREE.Mesh {
  const src = mesh.material as THREE.MeshStandardMaterial;
  const mat = src.clone();
  mat.transparent = true;
  mat.opacity = baseOpacity;
  mat.depthWrite = baseOpacity > 0.35;
  mesh.material = mat;
  mesh.userData.occluderBase = baseOpacity;
  mesh.userData.occluderPeak = peakOpacity;
  return mesh;
}

/** Rend transparents mur et gradins cote camera, sauf quand la balle touche la vitre. */
export class CameraOccluders {
  private readonly meshes: THREE.Mesh[] = [];
  private pulse = 0;

  register(...groups: THREE.Object3D[]) {
    for (const root of groups) {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.userData.occluderBase !== undefined) {
          this.meshes.push(obj);
        }
      });
    }
  }

  onWallBounce(side: number) {
    if (side === PLAYER_SIDE) this.pulse = 0.55;
  }

  update(dt: number, ballPos: THREE.Vector3) {
    this.pulse = Math.max(0, this.pulse - dt);
    const nearBackWall =
      ballPos.z > COURT.halfLength - 2.4 &&
      ballPos.y < COURT.backWallHeight + 1.2;
    const nearSide =
      Math.abs(ballPos.x) > COURT.halfWidth - 1.8 &&
      ballPos.y < COURT.sideWallHeight + 0.8;
    const proximity = nearBackWall || nearSide ? 0.65 : 0;
    const boost = Math.max(this.pulse, proximity);

    for (const mesh of this.meshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const base = mesh.userData.occluderBase as number;
      const peak = mesh.userData.occluderPeak as number;
      mat.opacity = THREE.MathUtils.lerp(base, peak, boost);
      mat.depthWrite = mat.opacity > 0.32;
    }
  }
}

export { BASE_WALL, BASE_STAND, BASE_DECOR };
