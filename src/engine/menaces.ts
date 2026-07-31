import type { MenaceDef } from './types';

/**
 * LE TELEGRAPHE — le point critique du brief (3.1 / R2).
 *
 * Un match n'a pas d'intention. Sans intention annoncee, il n'y a pas de
 * decision, juste de l'optimisation a l'aveugle. La reponse retenue ici :
 *
 *   1. L'adversaire ANNONCE ce qu'il prepare, un a trois temps de jeu a
 *      l'avance, en clair, avec l'effet exact.
 *   2. Chaque annonce a une PARADE explicite, elle aussi affichee — une
 *      condition que le joueur peut remplir ce tour-ci.
 *   3. La parade coute toujours quelque chose que la consigne du coach
 *      reclame par ailleurs : du souffle, des cartes, du placement.
 *
 * C'est le point 3 qui fabrique la decision. Parer, c'est ne pas marquer.
 * Marquer, c'est encaisser. Si les deux etaient compatibles, il n'y aurait
 * pas de jeu.
 *
 * Les OCCASIONS sont le miroir : meme mecanique de telegraphe, mais c'est un
 * gain si la condition est remplie. Elles empechent le jeu de se reduire a
 * « je subis », et donnent une raison de tenir un placement haut.
 */
export const MENACES: Record<string, MenaceDef> = {
  lateral_deborde: {
    id: 'lateral_deborde',
    genre: 'menace',
    nom: 'Le lateral deborde',
    annonce: 'Leur lateral est monte et personne ne l’a suivi. Dans deux temps de jeu, il centre.',
    paradeTexte: 'Redescends : joue une carte de defense.',
    parade: { p: 'jouerTag', tag: 'Defense', n: 1 },
    delai: 2,
    effets: [{ t: 'butAdverse' }],
    poids: 10,
  },

  contre_attaque: {
    id: 'contre_attaque',
    genre: 'menace',
    nom: 'Contre-attaque',
    annonce: 'Ballon perdu, ils repartent a trois contre deux. Ca arrive tout de suite.',
    paradeTexte: 'Reviens : joue une carte de defense.',
    parade: { p: 'jouerTag', tag: 'Defense', n: 1 },
    delai: 1,
    effets: [{ t: 'butAdverse' }],
    tourMin: 3,
    poids: 8,
  },

  corner_adverse: {
    id: 'corner_adverse',
    genre: 'menace',
    nom: 'Corner pour eux',
    annonce: 'Corner adverse dans deux temps de jeu. Leur numero 5 fait 1 m 94.',
    paradeTexte: 'Va au duel : gagne deux duels ce temps de jeu.',
    parade: { p: 'jouerTag', tag: 'Duel', n: 2 },
    delai: 2,
    effets: [{ t: 'butAdverse' }],
    tourMin: 2,
    poids: 7,
  },

  recuperation_haute: {
    id: 'recuperation_haute',
    genre: 'menace',
    nom: 'Recuperation haute',
    annonce: 'Ils montent d’un cran pour te prendre le ballon au prochain temps de jeu.',
    paradeTexte: 'Sois deja parti : termine le temps de jeu a 3 de placement.',
    parade: { p: 'placement', sens: 'min', n: 3 },
    delai: 1,
    effets: [{ t: 'perteDeBalle' }, { t: 'confiance', n: -1 }],
    poids: 12,
  },

  marquage_culotte: {
    id: 'marquage_culotte',
    genre: 'menace',
    nom: 'Marquage a la culotte',
    annonce: 'Leur defenseur central ne te lache plus. Il se colle a toi au prochain temps de jeu.',
    paradeTexte: 'Prends le dessus : gagne deux duels ce temps de jeu.',
    parade: { p: 'jouerTag', tag: 'Duel', n: 2 },
    delai: 1,
    effets: [
      { t: 'surcout', tag: 'Dribble', n: 1, tours: 2 },
      { t: 'surcout', tag: 'Appel', n: 1, tours: 2 },
    ],
    poids: 10,
  },

  pressing_tout_terrain: {
    id: 'pressing_tout_terrain',
    genre: 'menace',
    nom: 'Pressing tout terrain',
    annonce: 'Ils ferment tous les couloirs. Au prochain temps de jeu, tu vas courir dans le vide.',
    paradeTexte: 'Mets-y le pied : depense au moins 6 souffles ce temps de jeu.',
    parade: { p: 'souffleDepense', n: 6 },
    delai: 1,
    effets: [{ t: 'souffle', n: -4 }, { t: 'souffleMax', n: -1 }],
    poids: 9,
  },

  coach_impatient: {
    id: 'coach_impatient',
    genre: 'menace',
    nom: 'Le coach s’impatiente',
    annonce: 'Le coach est debout dans sa zone. Il veut te voir tenter quelque chose.',
    paradeTexte: 'Ose : tente une frappe avant la fin.',
    parade: { p: 'tirTente' },
    delai: 3,
    effets: [{ t: 'confiance', n: -3 }],
    poids: 8,
  },

  public_siffle: {
    id: 'public_siffle',
    genre: 'menace',
    nom: 'Le public commence a siffler',
    annonce: 'Ca murmure dans les tribunes. Il te reste deux temps de jeu pour les faire taire.',
    paradeTexte: 'Fais-toi voir : touche cinq ballons ce temps de jeu.',
    parade: { p: 'cartesJouees', sens: 'min', n: 5 },
    delai: 2,
    effets: [{ t: 'confiance', n: -2 }],
    tourMin: 4,
    poids: 6,
  },

  coup_de_chaud: {
    id: 'coup_de_chaud',
    genre: 'menace',
    nom: 'Coup de chaud',
    annonce: 'Tu as la bouche seche. Ca va se payer au prochain temps de jeu.',
    paradeTexte: 'Leve le pied : ne depasse pas 3 ballons touches ce temps de jeu.',
    parade: { p: 'cartesJouees', sens: 'max', n: 3 },
    delai: 1,
    effets: [{ t: 'polluer', carteId: 'jambes_lourdes' }, { t: 'souffle', n: -2 }],
    tourMin: 5,
    poids: 7,
  },

  faute_dure: {
    id: 'faute_dure',
    genre: 'menace',
    nom: 'Il te cherche',
    annonce: 'Leur numero 6 t’a deja pris deux fois. La troisieme arrive.',
    paradeTexte: 'Ne t’expose pas : termine le temps de jeu sous 4 de placement.',
    parade: { p: 'placement', sens: 'max', n: 4 },
    delai: 2,
    effets: [{ t: 'polluer', carteId: 'pepin' }, { t: 'confiance', n: -1 }],
    tourMin: 4,
    poids: 6,
  },

  /* ------------------------------ Occasions ------------------------------ */

  appel_du_milieu: {
    id: 'appel_du_milieu',
    genre: 'occasion',
    nom: 'Ton milieu leve la tete',
    annonce: 'Il a vu l’espace. Si tu es parti au bon moment, le ballon arrive.',
    paradeTexte: 'Sois lance : termine le temps de jeu a 4 de placement.',
    parade: { p: 'placement', sens: 'min', n: 4 },
    delai: 1,
    effets: [{ t: 'danger', n: 6 }],
    poids: 9,
  },

  gardien_sorti: {
    id: 'gardien_sorti',
    genre: 'occasion',
    nom: 'Le gardien est aventureux',
    annonce: 'Il joue tres haut. Sa cage est degarnie au prochain temps de jeu.',
    paradeTexte: 'Rien a faire : profites-en.',
    parade: { p: 'aucune' },
    delai: 1,
    effets: [{ t: 'gardien', n: -5 }],
    poids: 6,
  },

  defense_qui_recule: {
    id: 'defense_qui_recule',
    genre: 'occasion',
    nom: 'Leur bloc recule',
    annonce: 'Ils ont peur. Si tu accumules assez de danger, tu passeras au travers.',
    paradeTexte: 'Fais-les reculer : arrive a 8 de danger.',
    parade: { p: 'danger', n: 8 },
    delai: 2,
    effets: [{ t: 'gardien', n: -4 }, { t: 'confiance', n: 1 }],
    tourMin: 3,
    poids: 7,
  },

  second_souffle: {
    id: 'second_souffle',
    genre: 'occasion',
    nom: 'Second souffle',
    annonce: 'Le match s’ouvre, tu commences a t’y retrouver.',
    paradeTexte: 'Reste dans le coup : touche quatre ballons ce temps de jeu.',
    parade: { p: 'cartesJouees', sens: 'min', n: 4 },
    delai: 1,
    effets: [{ t: 'souffle', n: 4 }, { t: 'confiance', n: 1 }],
    tourMin: 6,
    poids: 6,
  },
};

export const TOUTES_LES_MENACES: readonly MenaceDef[] = Object.values(MENACES);

export function menaceDef(id: string): MenaceDef {
  const d = MENACES[id];
  if (!d) throw new Error(`Menace inconnue : ${id}`);
  return d;
}
