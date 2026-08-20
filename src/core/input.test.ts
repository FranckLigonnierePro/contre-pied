import { describe, expect, it } from 'vitest';
import {
  CHARGE_FULL,
  CHARGE_MAX,
  CHARGE_MIN,
  chargeFromHold,
  chargeRatioFromHold,
} from './input';

describe('charge de frappe', () => {
  it('part de la puissance minimale sur un appui instantane', () => {
    expect(chargeFromHold(0)).toBe(CHARGE_MIN);
    expect(chargeRatioFromHold(0)).toBe(0);
  });

  it('atteint la puissance maximale au bout de CHARGE_FULL', () => {
    expect(chargeFromHold(CHARGE_FULL)).toBeCloseTo(CHARGE_MAX, 6);
    expect(chargeRatioFromHold(CHARGE_FULL)).toBe(1);
  });

  it('plafonne au-dela : maintenir plus longtemps ne donne aucun bonus', () => {
    expect(chargeFromHold(10)).toBe(CHARGE_MAX);
    expect(chargeRatioFromHold(10)).toBe(1);
  });

  it('progresse lineairement, a mi-parcours comme partout', () => {
    expect(chargeRatioFromHold(CHARGE_FULL / 2)).toBeCloseTo(0.5, 6);
    expect(chargeFromHold(CHARGE_FULL / 2)).toBeCloseTo((CHARGE_MIN + CHARGE_MAX) / 2, 6);
  });

  it('ne descend jamais sous le minimum, meme sur une duree aberrante', () => {
    for (const held of [-1, 0, Number.NaN]) {
      expect(chargeFromHold(held)).toBe(CHARGE_MIN);
      expect(chargeRatioFromHold(held)).toBe(0);
    }
  });

  // La jauge du HUD lit ce ratio : hors de [0, 1] elle deborderait de sa barre.
  it('garde le ratio dans [0, 1] sur toute la plage', () => {
    for (let held = -0.5; held <= 2; held += 0.05) {
      const r = chargeRatioFromHold(held);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  // Le HUD n'affiche la jauge qu'au-dela de 0.02 : un appui reel doit la franchir.
  it('depasse le seuil d affichage du HUD des le premier dixieme de seconde', () => {
    expect(chargeRatioFromHold(0.1)).toBeGreaterThan(0.02);
  });
});
