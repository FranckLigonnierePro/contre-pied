/**
 * RNG seedee, deterministe, serialisable.
 *
 * Regle non negociable du projet : aucun `Math.random()` nulle part hors de ce
 * fichier. Tout l'aleatoire du jeu passe par ici. C'est ce qui rend possible,
 * plus tard et sans reecriture : le defi du jour a seed partagee, les fantomes,
 * la validation serveur (anti-triche) et le bot d'equilibrage.
 *
 * Implementation : mulberry32. 32 bits d'etat, une seule multiplication
 * imprecise-free en JS, periode 2^32. Largement suffisant pour un jeu de cartes,
 * et surtout : reproductible a l'octet pres entre le navigateur et Node.
 */

export interface EtatRng {
  /** Etat interne 32 bits non signe. */
  s: number;
}

/** Convertit une seed texte (« lundi-42 ») en entier 32 bits. FNV-1a. */
export function seedDepuisTexte(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function creerRng(seed: number | string): EtatRng {
  const s = typeof seed === 'string' ? seedDepuisTexte(seed) : seed >>> 0;
  // Une seed de 0 bloque mulberry32 sur une sequence degeneree.
  return { s: s === 0 ? 0x9e3779b9 : s };
}

export function clonerRng(rng: EtatRng): EtatRng {
  return { s: rng.s };
}

/** Flottant dans [0, 1). Fait avancer l'etat. */
export function suivant(rng: EtatRng): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Entier dans [min, max] inclus. */
export function entier(rng: EtatRng, min: number, max: number): number {
  return min + Math.floor(suivant(rng) * (max - min + 1));
}

/** Un element au hasard. Le tableau ne doit pas etre vide. */
export function choix<T>(rng: EtatRng, liste: readonly T[]): T {
  if (liste.length === 0) throw new Error('choix() sur une liste vide');
  return liste[entier(rng, 0, liste.length - 1)]!;
}

/**
 * Melange de Fisher-Yates. Retourne une nouvelle liste, ne mute pas l'entree :
 * l'etat du match doit rester copiable sans effet de bord.
 */
export function melanger<T>(rng: EtatRng, liste: readonly T[]): T[] {
  const out = liste.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = entier(rng, 0, i);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/** Tire `n` elements distincts, sans remise. */
export function echantillon<T>(rng: EtatRng, liste: readonly T[], n: number): T[] {
  return melanger(rng, liste).slice(0, Math.min(n, liste.length));
}
