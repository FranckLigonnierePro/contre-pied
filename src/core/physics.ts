import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY } from './constants';

export type World = RAPIER.World;

let ready = false;

export async function initPhysics(): Promise<World> {
  if (!ready) {
    await RAPIER.init();
    ready = true;
  }
  return new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
}

/** Pas de simulation fixe : la physique doit rester deterministe quel que soit le framerate. */
export const FIXED_DT = 1 / 60;

export { RAPIER };
