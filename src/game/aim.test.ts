import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AI_SIDE, COURT, PLAYER_SIDE } from '../core/constants';
import { AIM_WIDTH, BASE_DEPTH, MAX_DEPTH, MIN_DEPTH, aimPoint } from './aim';

const dir = (x: number, z: number) => new THREE.Vector3(x, 0, z);
const NEUTRE = dir(0, 0);

describe('visee directionnelle', () => {
  it('vise le milieu du camp adverse sans direction tenue', () => {
    const p = aimPoint('plat', NEUTRE, PLAYER_SIDE);
    expect(p.x).toBe(0);
    expect(p.z).toBe(-BASE_DEPTH.plat);
  });

  it('envoie a droite quand on tient a droite, a gauche quand on tient a gauche', () => {
    expect(aimPoint('plat', dir(1, 0), PLAYER_SIDE).x).toBeCloseTo(AIM_WIDTH, 6);
    expect(aimPoint('plat', dir(-1, 0), PLAYER_SIDE).x).toBeCloseTo(-AIM_WIDTH, 6);
  });

  // Le fond du camp adverse est vers le haut de l'ecran, donc vers -z.
  it('allonge la balle vers l avant et la raccourcit vers l arriere', () => {
    const avant = aimPoint('plat', dir(0, -1), PLAYER_SIDE).z;
    const neutre = aimPoint('plat', NEUTRE, PLAYER_SIDE).z;
    const arriere = aimPoint('plat', dir(0, 1), PLAYER_SIDE).z;
    expect(avant).toBeLessThan(neutre);
    expect(neutre).toBeLessThan(arriere);
  });

  it('respecte la profondeur propre a chaque type de frappe', () => {
    const z = (k: 'plat' | 'lob' | 'smash') => aimPoint(k, NEUTRE, PLAYER_SIDE).z;
    expect(z('lob')).toBeLessThan(z('plat'));
    expect(z('plat')).toBeLessThan(z('smash'));
  });

  it('miroite pour le camp adverse', () => {
    const joueur = aimPoint('plat', dir(1, -1), PLAYER_SIDE);
    const ia = aimPoint('plat', dir(1, -1), AI_SIDE);
    expect(ia.x).toBeCloseTo(-joueur.x, 6);
    expect(ia.z).toBeCloseTo(-joueur.z, 6);
  });

  // Une visee hors du court enverrait la balle dans la vitre ou dans le filet.
  it('reste dans le camp adverse pour toute direction', () => {
    for (const kind of ['plat', 'lob', 'smash'] as const) {
      for (const side of [PLAYER_SIDE, AI_SIDE]) {
        for (let x = -1; x <= 1; x += 0.25) {
          for (let z = -1; z <= 1; z += 0.25) {
            const p = aimPoint(kind, dir(x, z), side);
            expect(Math.abs(p.x)).toBeLessThanOrEqual(COURT.halfWidth - 1);
            // Du bon cote du filet, et jamais au-dela de la ligne de fond.
            expect(p.z * side).toBeLessThanOrEqual(-MIN_DEPTH + 1e-9);
            expect(p.z * side).toBeGreaterThanOrEqual(-MAX_DEPTH - 1e-9);
          }
        }
      }
    }
  });

  it('borne la profondeur meme sur une direction exageree', () => {
    expect(aimPoint('lob', dir(0, -5), PLAYER_SIDE).z).toBe(-MAX_DEPTH);
    expect(aimPoint('smash', dir(0, 5), PLAYER_SIDE).z).toBe(-MIN_DEPTH);
  });

  it('ecrit dans le vecteur fourni sans en allouer un autre', () => {
    const out = new THREE.Vector3();
    expect(aimPoint('plat', NEUTRE, PLAYER_SIDE, out)).toBe(out);
  });
});
