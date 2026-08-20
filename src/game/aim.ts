import * as THREE from 'three';
import { COURT } from '../core/constants';
import type { ShotKind } from './character';

/** Ecart lateral maximal vise. On garde une marge avec la vitre. */
export const AIM_WIDTH = COURT.halfWidth - 1.2;
/** De combien la direction tenue avance ou recule le point vise. */
export const AIM_DEPTH = 2.5;
/** Profondeur visee au neutre, selon le type de frappe. */
export const BASE_DEPTH: Record<ShotKind, number> = { plat: 6.5, lob: 8.5, smash: 4 };
/** Bornes de profondeur : ni dans le filet, ni au-dela de la ligne de fond. */
export const MIN_DEPTH = 1.5;
export const MAX_DEPTH = COURT.halfLength - 1;

/**
 * Point vise par une frappe, dans le camp adverse.
 *
 * La direction tenue au moment de frapper decide ou part la balle, lue dans le
 * repere de l'ecran : le fond du camp adverse est vers le haut (-z), donc
 * tenir vers l'avant allonge la balle et tenir vers l'arriere la raccourcit.
 * Auparavant la visee etait deduite de la position du joueur, ce qui ne lui
 * laissait aucune intention : on ne visait qu'en se placant.
 */
export function aimPoint(
  kind: ShotKind,
  move: THREE.Vector3,
  side: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const depth = THREE.MathUtils.clamp(
    BASE_DEPTH[kind] - move.z * AIM_DEPTH,
    MIN_DEPTH,
    MAX_DEPTH,
  );
  const lateral = THREE.MathUtils.clamp(move.x * AIM_WIDTH, -AIM_WIDTH, AIM_WIDTH);
  return out.set(side * lateral, 0, -side * depth);
}
