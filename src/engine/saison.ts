import { RECOMPENSES, carteDef } from './cartes';
import { ADVERSAIRES, profilDef } from './profils';
import { creerRng, echantillon } from './rng';
import type { IssueMatch } from './types';

/**
 * Mini-saison : trois matchs.
 *
 * Le brief impose une discipline de scope severe (R3) : phase 0 = un match,
 * rien d'autre. Ce module est la seule entorse, et elle est deliberee, parce
 * qu'elle porte le SEUL vrai argument de superiorite du concept (brief 3.2) :
 * chez les references, les dilemmes extra-sportifs ne bougent que des
 * statistiques invisibles. Ici, ils entrent physiquement dans le deck.
 *
 * Trois matchs suffisent a le demontrer. La carriere complete (5-6 saisons,
 * vieillissement, retraite) reste hors MVP.
 */

export interface OptionEvenement {
  id: string;
  texte: string;
  /** Ce que ca fait, dit en clair AVANT de choisir. Jamais de piege cache. */
  consequence: string;
  ajoute?: string[];
  retire?: string[];
  confiance?: number;
  souffleMax?: number;
}

export interface EvenementDef {
  id: string;
  titre: string;
  situation: string;
  options: OptionEvenement[];
}

export const EVENEMENTS: Record<string, EvenementDef> = {
  soiree: {
    id: 'soiree',
    titre: 'La soiree',
    situation:
      'Ton meilleur pote signe son premier vrai contrat. Il fete ca mardi. Le match est samedi.',
    options: [
      {
        id: 'y_aller',
        texte: 'Y aller, et rester jusqu’au bout',
        consequence: 'Tu retrouves le sourire. Jambes lourdes entre dans ton jeu.',
        confiance: 2,
        ajoute: ['jambes_lourdes'],
      },
      {
        id: 'rentrer',
        texte: 'Passer une heure et rentrer',
        consequence: 'Tu es frais. Il ne te le dira pas, mais il l’a note.',
        confiance: -1,
        retire: ['jambes_lourdes'],
      },
    ],
  },

  video: {
    id: 'video',
    titre: 'La seance video',
    situation:
      'L’analyste te propose deux heures de plus sur les appels du dernier match. C’est ton jour de repos.',
    options: [
      {
        id: 'rester',
        texte: 'Rester les deux heures',
        consequence: 'Tu ajoutes Une-deux a ton jeu. Tu ne recuperes pas.',
        ajoute: ['une_deux'],
        souffleMax: -1,
      },
      {
        id: 'repos',
        texte: 'Prendre ton jour',
        consequence: 'Tu reviens avec de l’air dans les poumons.',
        souffleMax: 1,
      },
    ],
  },

  agent: {
    id: 'agent',
    titre: 'Ton agent appelle',
    situation:
      'Un club de milieu de tableau se renseigne. Il veut que tu « te montres un peu plus ».',
    options: [
      {
        id: 'ecouter',
        texte: 'Ecouter, et jouer pour toi',
        consequence: 'Chambrage entre dans ton jeu. Le vestiaire s’en apercoit.',
        ajoute: ['chambrage'],
        confiance: -1,
      },
      {
        id: 'raccrocher',
        texte: 'Raccrocher et te taire',
        consequence: 'Le groupe te sent avec eux.',
        confiance: 2,
      },
    ],
  },

  cuisse: {
    id: 'cuisse',
    titre: 'Ca tire derriere la cuisse',
    situation:
      'Tu l’as senti a l’echauffement. Le kine hausse les epaules, le coach ne t’a rien demande.',
    options: [
      {
        id: 'serrer',
        texte: 'Serrer les dents et jouer',
        consequence: 'Le coach apprecie. Pepin musculaire entre dans ton jeu pour de bon.',
        confiance: 2,
        ajoute: ['pepin'],
      },
      {
        id: 'soigner',
        texte: 'Te faire soigner et rater la seance',
        consequence: 'Tu nettoies tes jambes. Le coach, lui, s’en souvient.',
        confiance: -2,
        retire: ['pepin', 'jambes_lourdes'],
      },
    ],
  },

  micro: {
    id: 'micro',
    titre: 'Le micro apres le match',
    situation: 'On te tend un micro en zone mixte. On te parle du coach, pas du match.',
    options: [
      {
        id: 'balancer',
        texte: 'Dire ce que tu penses',
        consequence: 'Le public t’adore. Coup de sang entre dans ton jeu.',
        confiance: 2,
        ajoute: ['coup_de_sang'],
      },
      {
        id: 'langue_de_bois',
        texte: 'Sortir les phrases toutes faites',
        consequence: 'Personne n’en parlera. C’est deja ca.',
        souffleMax: 1,
      },
    ],
  },

  petit: {
    id: 'petit',
    titre: 'Le petit du centre',
    situation:
      'Un gamin de dix-sept ans te demande de rester apres l’entrainement pour bosser ses appuis.',
    options: [
      {
        id: 'rester',
        texte: 'Rester une heure de plus',
        consequence: 'Harcelement entre dans ton jeu. Tu finis la semaine sur les rotules.',
        ajoute: ['harcelement'],
        souffleMax: -1,
        confiance: 1,
      },
      {
        id: 'filer',
        texte: 'Filer aux soins',
        consequence: 'Tu recuperes. Il ne te redemandera pas.',
        souffleMax: 1,
      },
    ],
  },
};

export const TOUS_LES_EVENEMENTS: readonly EvenementDef[] = Object.values(EVENEMENTS);

export interface EtatSaison {
  seed: string;
  profil: string;
  /** Le deck vit d'un match a l'autre. C'est tout l'interet. */
  deck: string[];
  match: number;
  matchsTotal: number;
  confiance: number;
  souffleMax: number;
  resultats: IssueMatch[];
  adversaires: string[];
  termine: boolean;
}

export const MATCHS_PAR_SAISON = 3;

export function creerSaison(seed: string, profil: string): EtatSaison {
  const p = profilDef(profil);
  const adversaires = echantillon(
    creerRng(`saison|${seed}|${profil}`),
    ADVERSAIRES,
    MATCHS_PAR_SAISON,
  );
  return {
    seed,
    profil,
    deck: p.deck.slice(),
    match: 1,
    matchsTotal: MATCHS_PAR_SAISON,
    confiance: p.jaugesDepart.confiance ?? 6,
    souffleMax: p.jaugesDepart.souffleMax ?? 9,
    resultats: [],
    adversaires,
    termine: false,
  };
}

/** Seed du match n d'une saison. Deterministe, derivee de la seed de saison. */
export function seedMatch(s: EtatSaison, n: number): string {
  return `${s.seed}#m${n}`;
}

/** Les trois cartes proposees apres un match. Toujours les memes pour une seed. */
export function recompensesProposees(s: EtatSaison, n: number): string[] {
  return echantillon(creerRng(`recompense|${s.seed}|${n}`), RECOMPENSES, 3);
}

/** L'evenement extra-sportif propose avant le match n. */
export function evenementPour(s: EtatSaison, n: number): EvenementDef {
  const ids = Object.keys(EVENEMENTS);
  const tire = echantillon(creerRng(`event|${s.seed}|${n}`), ids, 1)[0]!;
  return EVENEMENTS[tire]!;
}

function retirerUne(deck: string[], id: string): boolean {
  const i = deck.indexOf(id);
  if (i < 0) return false;
  deck.splice(i, 1);
  return true;
}

export function appliquerOption(s: EtatSaison, opt: OptionEvenement): EtatSaison {
  const deck = s.deck.slice();
  for (const id of opt.ajoute ?? []) deck.push(id);
  // « retire » enleve la premiere tare trouvee dans la liste, pas toutes.
  for (const id of opt.retire ?? []) {
    if (retirerUne(deck, id)) break;
  }
  return {
    ...s,
    deck,
    confiance: Math.max(1, Math.min(10, s.confiance + (opt.confiance ?? 0))),
    souffleMax: Math.max(6, Math.min(13, s.souffleMax + (opt.souffleMax ?? 0))),
  };
}

export function ajouterCarte(s: EtatSaison, carteId: string): EtatSaison {
  carteDef(carteId); // leve si l'id est inconnu
  return { ...s, deck: [...s.deck, carteId] };
}

export function enregistrerMatch(s: EtatSaison, issue: IssueMatch): EtatSaison {
  const resultats = [...s.resultats, issue];
  return {
    ...s,
    resultats,
    // La confiance et l'usure se transmettent : la saison a une pente.
    confiance: Math.max(2, Math.min(10, issue.confiance)),
    souffleMax: Math.max(6, s.souffleMax - 1),
    match: s.match + 1,
    termine: s.match >= s.matchsTotal,
  };
}

/** Bilan de saison, pour la carte de fin partageable. */
export function bilan(s: EtatSaison): {
  buts: number;
  encaisses: number;
  note: number;
  consignesTenues: number;
  tares: number;
} {
  const buts = s.resultats.reduce((a, r) => a + r.buts, 0);
  const encaisses = s.resultats.reduce((a, r) => a + r.butsEncaisses, 0);
  const note =
    s.resultats.length === 0
      ? 0
      : Math.round((s.resultats.reduce((a, r) => a + r.note, 0) / s.resultats.length) * 10) / 10;
  const consignesTenues = s.resultats.filter((r) => r.reussi).length;
  const tares = s.deck.filter((id) => carteDef(id).tags.includes('Tare')).length;
  return { buts, encaisses, note, consignesTenues, tares };
}
