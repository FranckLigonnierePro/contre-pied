/**
 * Aleatoire deterministe du jeu.
 *
 * `Math.random()` ne se rejoue pas : deux parties identiques divergent des la
 * premiere frappe, ce qui interdit autant de reproduire un bug que de mesurer
 * l'effet d'un reglage. Tout l'aleatoire du jeu passe donc par ce module, dont
 * la graine est fixable depuis l'exterieur.
 */

/** mulberry32 : court, rapide, et de qualite suffisante pour du jeu. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let tirage = mulberry32((Math.random() * 0xffffffff) >>> 0);

/** Fixe la graine : la meme graine rejoue exactement la meme partie. */
export function seedRandom(seed: number): void {
  tirage = mulberry32(seed);
}

/** Reel dans [0, 1[. */
export function random(): number {
  return tirage();
}

/** Reel dans [-range/2, range/2[. Equivalent seede de `THREE.MathUtils.randFloatSpread`. */
export function randSpread(range: number): number {
  return range * (tirage() - 0.5);
}

/** Reel dans [min, max[. */
export function randRange(min: number, max: number): number {
  return min + tirage() * (max - min);
}
