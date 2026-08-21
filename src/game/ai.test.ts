import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AI_SIDE, COURT, PLAYER_SIDE, SPRINT_SPEED } from '../core/constants';
import { seedRandom } from '../core/random';
import { Ai, NIVEAUX, aimAgainst } from './ai';

const v3 = (x: number, z: number) => new THREE.Vector3(x, 0, z);
const echantillon = (n: number, f: (i: number) => THREE.Vector3) =>
  Array.from({ length: n }, (_, i) => f(i).clone());

describe('visee de l IA', () => {
  it('joue a l oppose de l adversaire', () => {
    seedRandom(1);
    // Adversaire a droite : on vise la gauche, et reciproquement.
    for (let i = 0; i < 20; i += 1) {
      expect(aimAgainst('plat', v3(3, 7.5), AI_SIDE, 0.5).x).toBeLessThan(0);
      expect(aimAgainst('plat', v3(-3, 7.5), AI_SIDE, 0.5).x).toBeGreaterThan(0);
    }
  });

  it('choisit un cote quand l adversaire est au centre', () => {
    seedRandom(4);
    const xs = echantillon(40, () => aimAgainst('plat', v3(0, 7.5), AI_SIDE, 0.5));
    expect(xs.some((p) => p.x > 1)).toBe(true);
    expect(xs.some((p) => p.x < -1)).toBe(true);
  });

  it('allonge contre un adversaire monte au filet et raccourcit contre un adversaire recule', () => {
    seedRandom(2);
    // Niveau parfait : pas d'erreur, la profondeur seule distingue les deux.
    const filet = aimAgainst('plat', v3(0, 1), AI_SIDE, 1);
    const fond = aimAgainst('plat', v3(0, 9.5), AI_SIDE, 1);
    expect(Math.abs(filet.z)).toBeGreaterThan(Math.abs(fond.z));
  });

  it('vise toujours le camp adverse', () => {
    seedRandom(3);
    for (const side of [PLAYER_SIDE, AI_SIDE]) {
      for (let i = 0; i < 60; i += 1) {
        const p = aimAgainst('plat', v3((i % 9) - 4, -side * 7), side, 0.5);
        // Cible du cote oppose au frappeur, jamais dans le filet.
        expect(p.z * side).toBeLessThan(0);
        expect(Math.abs(p.z)).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it('reste dans les limites du court quel que soit le niveau', () => {
    seedRandom(5);
    for (const difficulty of [0, 0.25, 0.5, 0.75, 1]) {
      for (const kind of ['plat', 'lob', 'smash'] as const) {
        for (let i = 0; i < 40; i += 1) {
          const p = aimAgainst(kind, v3((i % 11) - 5, 7.5), AI_SIDE, difficulty);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(COURT.halfWidth - 1);
          expect(Math.abs(p.z)).toBeLessThanOrEqual(COURT.halfLength - 1);
        }
      }
    }
  });

  // Le niveau doit vouloir dire quelque chose : c'est la dispersion qu'il pilote.
  it('resserre la visee quand le niveau monte', () => {
    const dispersion = (difficulty: number) => {
      seedRandom(9);
      const xs = echantillon(120, () => aimAgainst('plat', v3(3, 7.5), AI_SIDE, difficulty)).map((p) => p.x);
      const moy = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - moy) ** 2, 0) / xs.length);
    };
    expect(dispersion(1)).toBeLessThan(dispersion(0.5));
    expect(dispersion(0.5)).toBeLessThan(dispersion(0));
  });

  it('ne disperse plus du tout au niveau maximal', () => {
    seedRandom(6);
    const xs = echantillon(20, () => aimAgainst('plat', v3(3, 7.5), AI_SIDE, 1)).map((p) => p.x);
    expect(new Set(xs.map((x) => x.toFixed(6))).size).toBe(1);
  });
});

describe('niveaux et course', () => {
  it('propose des niveaux ordonnes et dans les bornes utiles', () => {
    expect(NIVEAUX.facile).toBeLessThan(NIVEAUX.moyen);
    expect(NIVEAUX.moyen).toBeLessThan(NIVEAUX.difficile);
    for (const v of Object.values(NIVEAUX)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(0.75);
    }
  });

  it('court d autant plus vite que le niveau monte', () => {
    const v = (d: number) => new Ai(d).moveSpeed;
    expect(v(0)).toBeLessThan(v(0.5));
    expect(v(0.5)).toBeLessThan(v(1));
  });

  // Le niveau median doit laisser la vitesse de reference inchangee : c'est
  // l'etalon auquel toutes les mesures d'equilibrage se comparent.
  it('garde la vitesse de reference au niveau median', () => {
    expect(new Ai(0.5).moveSpeed).toBeCloseTo(SPRINT_SPEED, 6);
  });

  it('borne la vitesse sur des niveaux aberrants', () => {
    for (const d of [-3, 5]) {
      const s = new Ai(d).moveSpeed;
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(SPRINT_SPEED * 2);
    }
  });
});
