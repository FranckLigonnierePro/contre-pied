import type { CarteDef } from './types';

/**
 * 26 cartes jouables + 3 tares. Pas 150.
 *
 * Le brief est explicite : ecrire 20-25 cartes et faire tourner le systeme
 * jusqu'a ce que les decisions soient difficiles. Chaque carte ci-dessous
 * existe pour poser une question au joueur, pas pour remplir un tableau.
 *
 * Grille de lecture des couts (souffle max 9, regain 5 par tour) :
 *   0-1 : carte de liaison, on en joue plusieurs par tour
 *   2-3 : carte de decision, on en joue une ou deux
 *   4-5 : carte de tour, elle mange le tour entier
 */
export const CARTES: Record<string, CarteDef> = {
  /* ----------------------- Liaison / conservation ----------------------- */

  controle_oriente: {
    id: 'controle_oriente',
    nom: 'Controle oriente',
    cout: 1,
    tags: ['Passe'],
    texte: 'Tu amortis et tu es deja tourne. +1 placement, +1 danger.',
    effets: [{ t: 'placement', n: 1 }, { t: 'danger', n: 1 }],
    socle: true,
  },

  passe_courte: {
    id: 'passe_courte',
    nom: 'Passe courte',
    cout: 1,
    tags: ['Passe'],
    texte: 'Simple, propre, ca repart. +2 danger, tu recois une carte.',
    effets: [{ t: 'danger', n: 2 }, { t: 'pioche', n: 1 }],
    socle: true,
  },

  remise: {
    id: 'remise',
    nom: 'Remise',
    cout: 1,
    tags: ['Passe'],
    texte: 'Tu remets dans la course. +1 danger, +1 souffle, tu recois une carte.',
    effets: [{ t: 'danger', n: 1 }, { t: 'souffle', n: 1 }, { t: 'pioche', n: 1 }],
    socle: true,
  },

  temporisation: {
    id: 'temporisation',
    nom: 'Temporiser',
    cout: 1,
    tags: ['Passe'],
    texte: 'Tu fais tourner et tu reprends ton air. +3 souffle, +1 placement.',
    effets: [{ t: 'souffle', n: 3 }, { t: 'placement', n: 1 }],
    socle: true,
  },

  talonnade: {
    id: 'talonnade',
    nom: 'Talonnade',
    cout: 2,
    tags: ['Passe', 'Sang-froid'],
    texte: 'Le geste que personne n’attend. +3 danger, tu recois une carte.',
    effets: [{ t: 'danger', n: 3 }, { t: 'pioche', n: 1 }],
  },

  /* ------------------------------ Placement ----------------------------- */

  decrochage: {
    id: 'decrochage',
    nom: 'Decrochage',
    cout: 1,
    tags: ['Appel'],
    texte: 'Tu viens chercher le ballon plus bas. +1 placement, tu recois une carte.',
    effets: [{ t: 'placement', n: 1 }, { t: 'pioche', n: 1 }],
    socle: true,
  },

  appel_profondeur: {
    id: 'appel_profondeur',
    nom: 'Appel en profondeur',
    cout: 2,
    tags: ['Appel'],
    texte: 'Tu pars dans le dos du defenseur. +3 placement.',
    effets: [{ t: 'placement', n: 3 }],
    socle: true,
  },

  appel_contre_appel: {
    id: 'appel_contre_appel',
    nom: 'Appel contre-appel',
    cout: 1,
    tags: ['Appel'],
    texte: 'Tu pars, tu reviens, il ne te suit pas. +2 placement, +2 de plus si tu as deja fait un appel dans le meme temps de jeu.',
    effets: [
      { t: 'placement', n: 2 },
      { t: 'si', si: { c: 'tagJoueCeTour', tag: 'Appel' }, alors: [{ t: 'placement', n: 2 }] },
    ],
  },

  sprint: {
    id: 'sprint',
    nom: 'Sprint',
    cout: 3,
    tags: ['Appel'],
    texte: 'Tu mets tout. +4 placement, mais ca coute cher dans les jambes.',
    effets: [{ t: 'placement', n: 4 }, { t: 'polluer', carteId: 'jambes_lourdes' }],
  },

  /* -------------------------------- Duels ------------------------------- */

  dribble_court: {
    id: 'dribble_court',
    nom: 'Dribble court',
    cout: 2,
    tags: ['Dribble', 'Duel'],
    texte: 'Tu l’elimines dans un mouchoir de poche. +4 danger.',
    effets: [{ t: 'danger', n: 4 }],
    socle: true,
  },

  crochet: {
    id: 'crochet',
    nom: 'Crochet',
    cout: 2,
    tags: ['Dribble', 'Duel'],
    texte: 'Tu casses son appui. +2 danger, +2 placement.',
    effets: [{ t: 'danger', n: 2 }, { t: 'placement', n: 2 }],
  },

  grand_pont: {
    id: 'grand_pont',
    nom: 'Grand pont',
    cout: 3,
    tags: ['Dribble', 'Duel'],
    texte: 'Tu passes le ballon d’un cote, toi de l’autre. +6 danger. Il faut deja etre lance (placement 2).',
    exige: { c: 'placementMin', n: 2 },
    effets: [{ t: 'danger', n: 6 }],
  },

  roulette: {
    id: 'roulette',
    nom: 'Roulette',
    cout: 4,
    tags: ['Dribble', 'Duel', 'Sang-froid'],
    texte: 'Plus tu es bien place, plus ca fait mal. +2 danger par point de placement.',
    effets: [{ t: 'dangerParPlacement', n: 2 }],
  },

  sombrero: {
    id: 'sombrero',
    nom: 'Coup du sombrero',
    cout: 4,
    tags: ['Dribble', 'Duel', 'Sang-froid'],
    texte: 'Le stade se leve. +5 danger, +1 confiance.',
    effets: [{ t: 'danger', n: 5 }, { t: 'confiance', n: 1 }],
  },

  /* ------------------------------- Passes ------------------------------- */

  une_deux: {
    id: 'une_deux',
    nom: 'Une-deux',
    cout: 3,
    tags: ['Passe', 'Appel'],
    texte: 'Tu donnes et tu pars. +4 danger, +2 placement, tu recois une carte.',
    effets: [{ t: 'danger', n: 4 }, { t: 'placement', n: 2 }, { t: 'pioche', n: 1 }],
  },

  passe_profondeur: {
    id: 'passe_profondeur',
    nom: 'Passe en profondeur',
    cout: 2,
    tags: ['Passe'],
    texte: 'Tu l’envoies derriere la ligne. +3 danger, +4 de plus si tu es bien lance (placement 3).',
    effets: [
      { t: 'danger', n: 3 },
      { t: 'si', si: { c: 'placementMin', n: 3 }, alors: [{ t: 'danger', n: 4 }] },
    ],
  },

  /* -------------------------------- Tirs -------------------------------- */

  frappe_loin: {
    id: 'frappe_loin',
    nom: 'Frappe de loin',
    cout: 2,
    tags: ['Frappe'],
    texte: 'Tu tentes ta chance. Tu tires avec le danger accumule.',
    effets: [{ t: 'tir', mult: 1, bonusPlacement: 0 }],
    socle: true,
  },

  frappe_enroulee: {
    id: 'frappe_enroulee',
    nom: 'Frappe enroulee',
    cout: 3,
    tags: ['Frappe'],
    texte: 'Interieur du pied, lucarne opposee. Tu tires, +2 par point de placement.',
    effets: [{ t: 'tir', mult: 1, bonusPlacement: 2 }],
    socle: true,
  },

  tete_plongeante: {
    id: 'tete_plongeante',
    nom: 'Tete plongeante',
    cout: 3,
    tags: ['Frappe', 'Duel'],
    texte: 'Tu y vas de la tete, la ou ca fait mal. Tu tires, +3 par point de placement. Il faut etre dedans (placement 2).',
    exige: { c: 'placementMin', n: 2 },
    effets: [{ t: 'tir', mult: 1, bonusPlacement: 3 }],
  },

  reprise_volee: {
    id: 'reprise_volee',
    nom: 'Reprise de volee',
    cout: 4,
    tags: ['Frappe'],
    texte: 'Sans controle. Tu tires avec une fois et demie le danger, +1 par point de placement. Il faut etre au point de chute (placement 3).',
    exige: { c: 'placementMin', n: 3 },
    effets: [{ t: 'tir', mult: 1.5, bonusPlacement: 1 }],
  },

  face_a_face: {
    id: 'face_a_face',
    nom: 'Face a face',
    cout: 5,
    tags: ['Frappe', 'Sang-froid'],
    texte: 'Seul devant lui, tu ne te precipites pas. Tu tires avec le double du danger.',
    effets: [{ t: 'tir', mult: 2, bonusPlacement: 0 }],
  },

  /* ------------------------------ Defense ------------------------------- */

  retour_defensif: {
    id: 'retour_defensif',
    nom: 'Retour defensif',
    cout: 2,
    tags: ['Defense'],
    texte: 'Tu ravales ta fierte et tu redescends. Tu reprends 2 souffles si l’adversaire prepare quelque chose.',
    effets: [{ t: 'si', si: { c: 'menaceActive' }, alors: [{ t: 'souffle', n: 2 }] }],
    socle: true,
  },

  harcelement: {
    id: 'harcelement',
    nom: 'Harcelement',
    cout: 1,
    tags: ['Defense', 'Duel'],
    texte: 'Tu ne le laches pas d’une semelle. +1 placement.',
    effets: [{ t: 'placement', n: 1 }],
    socle: true,
  },

  pressing: {
    id: 'pressing',
    nom: 'Pressing',
    cout: 2,
    tags: ['Defense', 'Duel'],
    texte: 'Tu montes sur le porteur. +2 placement, +1 danger.',
    effets: [{ t: 'placement', n: 2 }, { t: 'danger', n: 1 }],
  },

  couverture: {
    id: 'couverture',
    nom: 'Couverture',
    cout: 2,
    tags: ['Defense'],
    texte: 'Tu bouches le trou avant qu’il s’ouvre. +1 confiance, +1 souffle.',
    effets: [{ t: 'confiance', n: 1 }, { t: 'souffle', n: 1 }],
  },

  tacle_glisse: {
    id: 'tacle_glisse',
    nom: 'Tacle glisse',
    cout: 1,
    tags: ['Defense', 'Duel'],
    texte: 'Tu pars devant lui. Ce que l’adversaire preparait tombe a l’eau. L’arbitre sort le carton.',
    effets: [{ t: 'ecarterMenace' }, { t: 'polluer', carteId: 'averti' }],
  },

  /* ------------------------------ Attitude ------------------------------ */

  coup_de_sang: {
    id: 'coup_de_sang',
    nom: 'Coup de sang',
    cout: 0,
    tags: ['Sang-froid'],
    texte: 'Tu pars au duel la tete chaude. +4 placement, -2 confiance.',
    effets: [{ t: 'placement', n: 4 }, { t: 'confiance', n: -2 }],
  },

  chambrage: {
    id: 'chambrage',
    nom: 'Chambrage',
    cout: 1,
    tags: ['Sang-froid'],
    texte: 'Tu en remets une couche. +4 danger, -1 confiance.',
    effets: [{ t: 'danger', n: 4 }, { t: 'confiance', n: -1 }],
  },

  /* -------------------------------- Tares -------------------------------- *
   * Le coeur du concept (brief 3.2) : les mauvais choix et l'usure ne
   * touchent pas une statistique invisible, ils entrent physiquement dans
   * ta main. Une tare ne se joue pas : elle occupe une place, un tour.
   * ----------------------------------------------------------------------- */

  jambes_lourdes: {
    id: 'jambes_lourdes',
    nom: 'Jambes lourdes',
    cout: 0,
    tags: ['Tare'],
    texte: 'Tu les sens dans les cuisses. Rien a en tirer.',
    effets: [],
    injouable: true,
  },

  averti: {
    id: 'averti',
    nom: 'Averti',
    cout: 0,
    tags: ['Tare'],
    texte: 'Jaune. Tu ne peux plus rien te permettre.',
    effets: [],
    injouable: true,
  },

  pepin: {
    id: 'pepin',
    nom: 'Pepin musculaire',
    cout: 0,
    tags: ['Tare'],
    texte: 'Ca tire derriere la cuisse. Ca ne partira pas de la saison.',
    effets: [],
    injouable: true,
  },
};

export const TOUTES_LES_CARTES: readonly CarteDef[] = Object.values(CARTES);

export function carteDef(id: string): CarteDef {
  const d = CARTES[id];
  if (!d) throw new Error(`Carte inconnue : ${id}`);
  return d;
}

/** Cartes proposables en recompense de fin de match (ni socle, ni tare). */
export const RECOMPENSES: readonly string[] = TOUTES_LES_CARTES.filter(
  (c) => !c.socle && !c.tags.includes('Tare'),
).map((c) => c.id);
