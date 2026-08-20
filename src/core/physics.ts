import RAPIER from '@dimforge/rapier3d';
import { GRAVITY } from './constants';

export type World = RAPIER.World;

/**
 * Le WebAssembly est instancie a l'import du module, en parallele du reste du
 * bundle. La variante `-compat` faisait l'inverse : elle inlinait le wasm en
 * base64 dans le JS, ce qui ajoutait 2.7 Mo au premier chargement.
 * On garde la fonction asynchrone : elle reste le point d'attente naturel du
 * demarrage, et l'appelant n'a pas a changer.
 */
export async function initPhysics(): Promise<World> {
  return new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
}

/** Pas de simulation fixe : la physique doit rester deterministe quel que soit le framerate. */
export const FIXED_DT = 1 / 60;

export { RAPIER };
