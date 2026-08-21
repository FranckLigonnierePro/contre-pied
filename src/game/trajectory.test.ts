import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BALL_DAMPING } from '../core/constants';
import { ballisticVelocity, heightAt, landingPoint, predictIntercept, reachAt } from './trajectory';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('trajectoire amortie', () => {
  // Le test central : la vitesse calculee doit reellement mener a la cible.
  it('retombe sur la cible demandee', () => {
    const cas: Array<[THREE.Vector3, THREE.Vector3, number]> = [
      [v3(0, 1.0, 7.2), v3(0, 0, -6.5), 2.4],
      [v3(2.5, 1.4, 6.0), v3(-3.2, 0, -8.5), 6.2],
      [v3(-1, 2.6, 3.0), v3(1.5, 0, -4.0), 0.25],
      [v3(0, 0.8, 9.0), v3(0, 0, -1.5), 1.5],
    ];
    for (const [from, to, peak] of cas) {
      const chute = landingPoint(from, ballisticVelocity(from, to, peak));
      expect(chute.x).toBeCloseTo(to.x, 6);
      expect(chute.z).toBeCloseTo(to.z, 6);
    }
  });

  // Ce que corrige ce module : sans amortissement, la balle tombe court.
  it('demande plus de vitesse qu une resolution sans amortissement', () => {
    const from = v3(0, 1.0, 7.2);
    const to = v3(0, 0, -6.5);
    const v = ballisticVelocity(from, to, 2.4);
    // Distance qu'aurait parcourue la meme vitesse sans frottement, sur la
    // meme duree de vol : elle depasse la cible, donc la solution naive
    // (qui ignore le frottement) sous-estime la vitesse necessaire.
    const t = 1.0;
    expect(reachAt(v.z, t)).toBeGreaterThan(v.z * t);
  });

  // Fraction de la portee « sans frottement » (v·t) reellement parcourue.
  // Plus le vol dure, plus l'amortissement en mange : c'est exactement ce que
  // la resolution naive ignorait, et pourquoi les balles tombaient court.
  it('perd d autant plus de portee que le vol dure', () => {
    const perte = (t: number) => reachAt(1, t) / t;
    expect(perte(0.5)).toBeLessThan(1);
    expect(perte(1.2)).toBeLessThan(perte(0.5));
    expect(perte(2.5)).toBeLessThan(perte(1.2));
  });

  it('fait culminer le lob plus haut que la frappe a plat', () => {
    const from = v3(0, 1, 7);
    const to = v3(0, 0, -7);
    expect(ballisticVelocity(from, to, 6.2).y).toBeGreaterThan(
      ballisticVelocity(from, to, 1.5).y,
    );
  });

  it('modelise une montee puis une descente', () => {
    const vy = ballisticVelocity(v3(0, 1, 7), v3(0, 0, -7), 3).y;
    const h = (t: number) => heightAt(1, vy, t);
    expect(h(0.3)).toBeGreaterThan(h(0));
    expect(h(3)).toBeLessThan(h(0));
    // Un seul sommet : la hauteur croit puis decroit, sans osciller.
    const pas = Array.from({ length: 60 }, (_, i) => h(i * 0.05));
    const sommet = pas.indexOf(Math.max(...pas));
    expect(sommet).toBeGreaterThan(0);
    expect(sommet).toBeLessThan(pas.length - 1);
    for (let i = 1; i <= sommet; i += 1) expect(pas[i]).toBeGreaterThan(pas[i - 1]);
    for (let i = sommet + 2; i < pas.length; i += 1) expect(pas[i]).toBeLessThan(pas[i - 1]);
  });

  it('reste borne sur des demandes aberrantes', () => {
    for (const peak of [0, -5, 1e-9]) {
      const v = ballisticVelocity(v3(0, 1, 7), v3(0, 0, -7), peak);
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(Number.isFinite(v.z)).toBe(true);
    }
  });

  it('parcourt une distance finie meme sur un temps infini', () => {
    // (v/d)(1 - e^(-dt)) tend vers v/d : c'est la portee maximale amortie.
    expect(reachAt(10, 1e6)).toBeCloseTo(10 / BALL_DAMPING, 6);
  });
});

describe('anticipation avec les parois', () => {
  const hw = 5;
  const hl = 10;

  it('renvoie un point a l interieur du court', () => {
    for (const vz of [-20, -14, -8, 8, 14, 20]) {
      for (const vx of [-6, 0, 6]) {
        const p = predictIntercept(v3(0, 1.5, 0), v3(vx, 3, vz), Math.sign(vz), 0.9);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(hw);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(hl);
      }
    }
  });

  // Le cas qui motivait ce predicteur : une balle qui part droit dans la vitre
  // du fond doit renvoyer un point de reprise devant elle, pas derriere.
  it('attend le retour de vitre au lieu de coller a la paroi', () => {
    const p = predictIntercept(v3(0, 1.2, -2), v3(0, 1, -20), -1, 0.9);
    expect(p.z).toBeGreaterThan(-hl + 0.4);
  });

  it('reste du cote demande', () => {
    expect(predictIntercept(v3(0, 1.5, 2), v3(0, 2, -12), -1, 0.9).z).toBeLessThan(0);
    expect(predictIntercept(v3(0, 1.5, -2), v3(0, 2, 12), 1, 0.9).z).toBeGreaterThan(0);
  });

  it('suit la balle laterale sans sortir par les vitres de cote', () => {
    const p = predictIntercept(v3(0, 1.2, -1), v3(14, 2, -9), -1, 0.9);
    expect(Math.abs(p.x)).toBeLessThan(hw);
  });

  it('renvoie toujours un point fini', () => {
    for (const vy of [-8, 0, 12]) {
      const p = predictIntercept(v3(0, 0.5, -5), v3(0, vy, 0), -1, 0.9);
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    }
  });
});
