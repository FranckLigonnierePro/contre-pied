import type { EtatRng } from './rng';

/* ------------------------------------------------------------------ *
 * Vocabulaire
 *
 * Regle d'ecriture du projet (cf. brief, risque R1) : tout ce que le
 * joueur lit est du francais de football. Aucun terme de deckbuilder
 * n'apparait dans une chaine visible — pas de « defausse », pas de
 * « synergie », pas de « scaling ». Le code, lui, a le droit d'etre
 * technique : c'est la frontiere.
 * ------------------------------------------------------------------ */

export type Tag =
  | 'Appel'
  | 'Passe'
  | 'Dribble'
  | 'Duel'
  | 'Frappe'
  | 'Defense'
  | 'Sang-froid'
  | 'Tare';

/** Les trois jauges du joueur, plus le compteur d'occasion en cours. */
export interface Jauges {
  /** Le souffle paye les cartes. Il ne se recharge jamais entierement. */
  souffle: number;
  souffleMax: number;
  /** Le placement : etre au bon endroit. Se perd tout seul, tour apres tour. */
  placement: number;
  /** Le danger accumule sur l'action en cours. Remis a zero par un tir. */
  danger: number;
  /** La confiance du coach et du public. A zero, tu sors. */
  confiance: number;
  confianceMax: number;
}

export type Condition =
  | { c: 'placementMin'; n: number }
  | { c: 'dangerMin'; n: number }
  | { c: 'souffleMin'; n: number }
  | { c: 'tagJoueCeTour'; tag: Tag }
  | { c: 'menaceActive' }
  | { c: 'derniereDemiHeure' };

export type Effet =
  | { t: 'placement'; n: number }
  | { t: 'danger'; n: number }
  | { t: 'souffle'; n: number }
  | { t: 'confiance'; n: number }
  | { t: 'pioche'; n: number }
  /** n points de danger par point de placement. */
  | { t: 'dangerParPlacement'; n: number }
  /** Declenche un tir : danger x mult, + placement x bonusPlacement. */
  | { t: 'tir'; mult: number; bonusPlacement: number }
  /** Ajoute une carte a la pile de defausse (pollution immediate du deck). */
  | { t: 'polluer'; carteId: string }
  /** Rend une menace paree quel que soit son critere. */
  | { t: 'ecarterMenace' }
  /** Applique l'effet seulement si la condition est vraie. */
  | { t: 'si'; si: Condition; alors: Effet[] };

export interface CarteDef {
  id: string;
  nom: string;
  /** Cout en souffle. */
  cout: number;
  tags: Tag[];
  /** Texte de regles, en francais de football. */
  texte: string;
  effets: Effet[];
  /** Ne peut pas etre jouee du tout (cartes de pollution). */
  injouable?: boolean;
  /** Condition d'autorisation de jeu, verifiee avant paiement. */
  exige?: Condition;
  /** Rarete indicative, sert aux recompenses de fin de match. */
  socle?: boolean;
}

/** Une carte concrete dans un deck : un id de definition + une identite propre. */
export interface Carte {
  uid: string;
  def: string;
}

/* ---------------------------- Menaces ---------------------------- */

/**
 * Une parade est toujours une condition que le joueur peut atteindre dans le
 * temps de jeu en cours, et qu'il lit en meme temps que la menace.
 * `sens: 'max'` sert aux menaces qui punissent l'exces : se surexposer, trop
 * courir. C'est ce qui empeche « joue le plus de cartes possible » d'etre
 * toujours la bonne reponse.
 */
export type Parade =
  | { p: 'jouerTag'; tag: Tag; n: number }
  | { p: 'placement'; sens: 'min' | 'max'; n: number }
  | { p: 'danger'; n: number }
  | { p: 'souffleDepense'; n: number }
  | { p: 'cartesJouees'; sens: 'min' | 'max'; n: number }
  | { p: 'tirTente' }
  | { p: 'aucune' };

export type EffetMenace =
  | { t: 'butAdverse' }
  | { t: 'souffle'; n: number }
  | { t: 'souffleMax'; n: number }
  | { t: 'confiance'; n: number }
  | { t: 'placement'; n: number }
  | { t: 'danger'; n: number }
  | { t: 'perteDeBalle' }
  | { t: 'gardien'; n: number }
  | { t: 'surcout'; tag: Tag; n: number; tours: number }
  | { t: 'polluer'; carteId: string };

export interface MenaceDef {
  id: string;
  /** `menace` = mauvais si non pare. `occasion` = bon si « pare ». */
  genre: 'menace' | 'occasion';
  nom: string;
  /** Le telegraphe : ce que le joueur lit un a trois tours avant. */
  annonce: string;
  /** Comment l'empecher, en francais de football. */
  paradeTexte: string;
  parade: Parade;
  delai: number;
  effets: EffetMenace[];
  /** Ne peut sortir qu'a partir de ce tour. */
  tourMin?: number;
  poids: number;
}

export interface Menace {
  uid: string;
  def: string;
  /** Tours restants avant resolution. 0 = se resout a la fin de ce tour. */
  restant: number;
}

/* --------------------------- Objectifs --------------------------- */

export type Objectif =
  | { o: 'buts'; n: number }
  | { o: 'dangerCumule'; n: number }
  | { o: 'butsEncaissesMax'; n: number }
  | { o: 'confianceFinMin'; n: number }
  | { o: 'tirs'; n: number };

export interface ConsigneDef {
  id: string;
  /** « Le coach te demande : … » */
  titre: string;
  detail: string;
  objectifs: Objectif[];
}

/* --------------------------- Profils ----------------------------- */

export interface ProfilDef {
  id: string;
  numero: string;
  nom: string;
  poste: string;
  origine: string;
  description: string;
  /** Liste d'ids de CarteDef, avec repetitions : c'est le deck de depart. */
  deck: string[];
  consigne: string;
  jaugesDepart: Partial<Jauges>;
}

/* ------------------------- Etat de match -------------------------- */

export interface Surcout {
  tag: Tag;
  n: number;
  tours: number;
}

export interface LigneJournal {
  tour: number;
  minute: number;
  /** Ton : neutre, bon, mauvais, gros evenement. */
  ton: 'neutre' | 'bon' | 'mauvais' | 'fort';
  texte: string;
}

/** Detail d'un tir, conserve pour l'affichage « juice ». */
export interface ResultatTir {
  danger: number;
  mult: number;
  placement: number;
  bonusPlacement: number;
  total: number;
  gardien: number;
  but: boolean;
  minute: number;
}

export type PhaseMatch = 'tour' | 'resolution' | 'mi-temps' | 'fini';

export interface EtatMatch {
  rng: EtatRng;
  seed: string;

  profil: string;
  consigne: string;

  tour: number;
  toursTotal: number;
  minute: number;
  phase: PhaseMatch;

  buts: number;
  butsEncaisses: number;

  jauges: Jauges;
  /** Seuil de danger a depasser pour battre le gardien. Toujours affiche. */
  gardien: number;
  /** Ajustement du seuil applique au prochain temps de jeu, puis remis a zero. */
  gardienModif: number;

  /** Compteur d'identifiants de cartes creees en cours de match. */
  compteurUid: number;

  main: Carte[];
  pioche: Carte[];
  defausse: Carte[];
  mainMax: number;

  menaces: Menace[];
  surcouts: Surcout[];

  /** Compteurs remis a zero a chaque debut de tour. */
  tagsJoues: Tag[];
  cartesJouees: number;
  souffleDepense: number;
  tirsCeTour: number;

  /** Compteurs de match, pour les objectifs. */
  dangerCumule: number;
  tirsTotal: number;

  journal: LigneJournal[];
  dernierTir: ResultatTir | null;

  fini: boolean;
  /** Renseigne quand `fini` est vrai. */
  issue: IssueMatch | null;
}

export interface IssueMatch {
  reussi: boolean;
  /** Pourquoi le match s'est arrete. */
  cause: 'coup-de-sifflet' | 'remplace';
  buts: number;
  butsEncaisses: number;
  dangerCumule: number;
  tirsTotal: number;
  confiance: number;
  /** Note sur 10, pour la carte de fin de match partageable. */
  note: number;
  objectifsAtteints: boolean[];
}
