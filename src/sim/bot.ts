import {
  carteDef,
  creerMatch,
  finirTour,
  jouerCarte,
  menaceDef,
  paradeSatisfaite,
  peutJouer,
  type EtatMatch,
  type IssueMatch,
  type OptionsMatch,
} from '../engine';

/**
 * Bot d'equilibrage.
 *
 * Il ne triche pas : il n'a acces qu'a ce que l'interface montre au joueur
 * (les jauges, le seuil du gardien, les telegraphes et leurs parades). Comme
 * le moteur est pur, le bot peut simplement JOUER un coup sur une copie de
 * l'etat et regarder le resultat — c'est le meme code que le vrai jeu, donc
 * ce qu'il mesure est reellement ce que le joueur vivra.
 */

/** Evaluation d'un etat du point de vue du joueur. Plus c'est haut, mieux c'est. */
function evaluer(e: EtatMatch): number {
  let s = 0;
  s += e.buts * 120;
  s -= e.butsEncaisses * 55;
  s += e.dangerCumule * 0.8;
  s += e.jauges.danger * 1.3;
  s += e.jauges.placement * 1.6;
  s += e.jauges.confiance * 4;
  s += e.jauges.souffle * 0.35;
  s += e.main.length * 0.5;

  // Ce qui va tomber a la fin de ce temps de jeu compte deja.
  for (const m of e.menaces) {
    if (m.restant > 1) continue;
    const def = menaceDef(m.def);
    const pare = paradeSatisfaite(e, def.parade);
    const enjeu = def.effets.some((f) => f.t === 'butAdverse') ? 55 : 18;
    if (def.genre === 'menace') s += pare ? 0 : -enjeu;
    else s += pare ? enjeu * 0.6 : 0;
  }

  // Une tare en main, c'est un ballon perdu.
  s -= e.main.filter((c) => carteDef(c.def).tags.includes('Tare')).length * 3;
  return s;
}

/** Joue un temps de jeu en glouton, puis le termine. */
function jouerTour(e: EtatMatch): EtatMatch {
  let etat = e;
  for (let garde = 0; garde < 20; garde++) {
    const base = evaluer(etat);
    let meilleur: { uid: string; gain: number } | null = null;

    for (const carte of etat.main) {
      if (!peutJouer(etat, carte)) continue;
      const essai = jouerCarte(etat, carte.uid);
      if (essai.refus) continue;
      const gain = evaluer(essai.etat) - base;
      if (!meilleur || gain > meilleur.gain) meilleur = { uid: carte.uid, gain };
    }

    if (!meilleur || meilleur.gain <= 0.5) break;
    const r = jouerCarte(etat, meilleur.uid);
    if (r.refus) break;
    etat = r.etat;
    if (etat.fini) return etat;
  }
  return finirTour(etat).etat;
}

export function simulerMatch(opts: OptionsMatch): IssueMatch {
  let etat = creerMatch(opts);
  let garde = 0;
  while (!etat.fini && garde++ < 60) etat = jouerTour(etat);
  if (!etat.issue) throw new Error('Le match ne s’est pas termine');
  return etat.issue;
}
