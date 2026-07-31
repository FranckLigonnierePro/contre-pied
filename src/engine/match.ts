import { carteDef } from './cartes';
import { menaceDef, TOUTES_LES_MENACES } from './menaces';
import { consigneDef, profilDef } from './profils';
import { choix, creerRng, entier, melanger } from './rng';
import type {
  Carte,
  CarteDef,
  Condition,
  Effet,
  EtatMatch,
  IssueMatch,
  Menace,
  MenaceDef,
  Objectif,
  Parade,
  ResultatTir,
} from './types';

/* ------------------------------------------------------------------ *
 * Constantes d'equilibrage.
 * Elles sont toutes ici, et nulle part ailleurs : c'est ce que le bot de
 * simulation fait varier (src/sim/balance.ts).
 * ------------------------------------------------------------------ */
export const REGLES = {
  toursTotal: 12,
  miTemps: 6,
  mainMax: 5,
  mainPlafond: 8,
  /** Souffle regagne au debut de chaque temps de jeu. Jamais le plein. */
  regainSouffle: 4,
  /**
   * Le danger non converti retombe entre deux temps de jeu : une action de
   * football meurt si on ne la conclut pas. Sans cette fuite, la strategie
   * optimale est d'empiler pendant huit temps de jeu puis de tirer une fois —
   * et la question « je tire maintenant ou je construis encore ? » disparait.
   */
  fuiteeDanger: 0.5,
  /** Le souffle max baisse de 1 tous les N temps de jeu. L'usure du match. */
  usureTous: 3,
  souffleMaxPlancher: 5,
  /** Le placement se perd tout seul : etre bien place n'est jamais acquis. */
  fuiteePlacement: 1,
  placementMax: 8,
  confianceMax: 10,
  /** Seuil du gardien = base + N par but deja marque + 0 a 3 d'aleatoire. */
  gardienBase: 11,
  gardienParBut: 5,
  gardienAlea: 3,
  gardienPlancher: 4,
  /** Nombre de telegraphes actifs vises. En dessous, le match en annonce un. */
  menacesVisees: 2,
} as const;

export interface OptionsMatch {
  seed: string;
  profil: string;
  /** Surcharge la consigne du profil (utilise par la mini-saison). */
  consigne?: string;
  /** Deck explicite (mini-saison : le deck a evolue). Sinon deck du profil. */
  deck?: string[];
  /** Jauges reportees d'un match a l'autre. */
  confianceDepart?: number;
  souffleMaxDepart?: number;
}

/* ------------------------------- Utilitaires ------------------------------- */

function copier(e: EtatMatch): EtatMatch {
  // Tout l'etat est du JSON pur, par construction : c'est ce qui rendra
  // possible la validation serveur et les fantomes sans rien reecrire.
  return structuredClone(e);
}

function journal(e: EtatMatch, ton: 'neutre' | 'bon' | 'mauvais' | 'fort', texte: string): void {
  e.journal.push({ tour: e.tour, minute: e.minute, ton, texte });
}

function minutePour(tour: number, toursTotal: number): number {
  return Math.round((tour / toursTotal) * 90);
}

function uidCarte(e: EtatMatch): string {
  // Le compteur vit dans l'etat, pas dans le module : deux matchs simules en
  // parallele doivent produire exactement les memes identifiants.
  e.compteurUid++;
  return `n${e.compteurUid}`;
}

/* --------------------------- Couts et conditions --------------------------- */

/** Cout reel d'une carte, surcouts de marquage compris. */
export function coutReel(e: EtatMatch, def: CarteDef): number {
  let cout = def.cout;
  for (const s of e.surcouts) {
    if (def.tags.includes(s.tag)) cout += s.n;
  }
  return Math.max(0, cout);
}

function conditionVraie(e: EtatMatch, c: Condition): boolean {
  switch (c.c) {
    case 'placementMin':
      return e.jauges.placement >= c.n;
    case 'dangerMin':
      return e.jauges.danger >= c.n;
    case 'souffleMin':
      return e.jauges.souffle >= c.n;
    case 'tagJoueCeTour':
      return e.tagsJoues.includes(c.tag);
    case 'menaceActive':
      return e.menaces.some((m) => menaceDef(m.def).genre === 'menace');
    case 'derniereDemiHeure':
      return e.minute >= 60;
  }
}

/** Pourquoi une carte ne peut pas etre jouee — en francais de football. */
export function raisonBlocage(e: EtatMatch, carte: Carte): string | null {
  const def = carteDef(carte.def);
  if (e.fini) return 'Le match est fini.';
  if (def.injouable) return 'Rien a en tirer.';
  if (coutReel(e, def) > e.jauges.souffle) return 'Plus assez de souffle.';
  if (def.exige && !conditionVraie(e, def.exige)) {
    if (def.exige.c === 'placementMin') return `Il faut ${def.exige.n} de placement.`;
    return 'Pas dans cette position.';
  }
  return null;
}

export function peutJouer(e: EtatMatch, carte: Carte): boolean {
  return raisonBlocage(e, carte) === null;
}

/* -------------------------------- Parades --------------------------------- */

/**
 * Une parade est evaluee au moment ou la menace se resout, sur les compteurs
 * du temps de jeu en cours. Le joueur voit son etat en direct pendant qu'il
 * joue : c'est ca, le telegraphe.
 */
export function paradeSatisfaite(e: EtatMatch, p: Parade): boolean {
  switch (p.p) {
    case 'aucune':
      return true;
    case 'jouerTag':
      return e.tagsJoues.filter((t) => t === p.tag).length >= p.n;
    case 'placement':
      return p.sens === 'min' ? e.jauges.placement >= p.n : e.jauges.placement <= p.n;
    case 'danger':
      return e.jauges.danger >= p.n;
    case 'souffleDepense':
      return e.souffleDepense >= p.n;
    case 'cartesJouees':
      return p.sens === 'min' ? e.cartesJouees >= p.n : e.cartesJouees <= p.n;
    case 'tirTente':
      return e.tirsCeTour >= 1;
  }
}

/** Progression 0..1 d'une parade, pour la jauge affichee sous le telegraphe. */
export function progressionParade(e: EtatMatch, p: Parade): { fait: number; requis: number } {
  switch (p.p) {
    case 'aucune':
      return { fait: 1, requis: 1 };
    case 'jouerTag':
      return { fait: e.tagsJoues.filter((t) => t === p.tag).length, requis: p.n };
    case 'placement':
      return { fait: e.jauges.placement, requis: p.n };
    case 'danger':
      return { fait: e.jauges.danger, requis: p.n };
    case 'souffleDepense':
      return { fait: e.souffleDepense, requis: p.n };
    case 'cartesJouees':
      return { fait: e.cartesJouees, requis: p.n };
    case 'tirTente':
      return { fait: e.tirsCeTour, requis: 1 };
  }
}

/* ------------------------------ Pioche / deck ------------------------------ */

function piocher(e: EtatMatch, n: number): void {
  for (let i = 0; i < n; i++) {
    if (e.main.length >= REGLES.mainPlafond) return;
    if (e.pioche.length === 0) {
      if (e.defausse.length === 0) return;
      e.pioche = melanger(e.rng, e.defausse);
      e.defausse = [];
    }
    const c = e.pioche.shift();
    if (!c) return;
    e.main.push(c);
  }
}

function polluer(e: EtatMatch, carteId: string): void {
  e.defausse.push({ uid: uidCarte(e), def: carteId });
}

/* -------------------------------- Effets ---------------------------------- */

function gagnerDanger(e: EtatMatch, n: number): void {
  if (n > 0) e.dangerCumule += n;
  e.jauges.danger = Math.max(0, e.jauges.danger + n);
}

function appliquerEffet(e: EtatMatch, ef: Effet, tirs: ResultatTir[]): void {
  switch (ef.t) {
    case 'placement':
      e.jauges.placement = Math.min(REGLES.placementMax, Math.max(0, e.jauges.placement + ef.n));
      break;
    case 'danger':
      gagnerDanger(e, ef.n);
      break;
    case 'souffle':
      e.jauges.souffle = Math.max(0, Math.min(e.jauges.souffleMax, e.jauges.souffle + ef.n));
      break;
    case 'confiance':
      e.jauges.confiance = Math.max(0, Math.min(e.jauges.confianceMax, e.jauges.confiance + ef.n));
      break;
    case 'pioche':
      piocher(e, ef.n);
      break;
    case 'dangerParPlacement':
      gagnerDanger(e, ef.n * e.jauges.placement);
      break;
    case 'polluer':
      polluer(e, ef.carteId);
      break;
    case 'ecarterMenace': {
      const i = e.menaces.findIndex((m) => menaceDef(m.def).genre === 'menace');
      if (i >= 0) {
        const [m] = e.menaces.splice(i, 1);
        if (m) journal(e, 'bon', `${menaceDef(m.def).nom} : c’est coupe.`);
      }
      break;
    }
    case 'si':
      if (conditionVraie(e, ef.si)) {
        for (const sous of ef.alors) appliquerEffet(e, sous, tirs);
      }
      break;
    case 'tir':
      tirs.push(resoudreTir(e, ef.mult, ef.bonusPlacement));
      break;
  }
}

/* --------------------------------- Tir ------------------------------------ */

/**
 * Le tir n'est PAS un jet de des. Le seuil du gardien est affiche en
 * permanence, avant la decision. Tirer a 11 quand il en faut 14, c'est un
 * choix assume — pas une malchance. C'est la condition pour que « je tire
 * maintenant ou je construis encore un temps de jeu » soit une vraie question.
 */
function resoudreTir(e: EtatMatch, mult: number, bonusPlacement: number): ResultatTir {
  const danger = e.jauges.danger;
  const placement = e.jauges.placement;
  const total = Math.floor(danger * mult) + placement * bonusPlacement;
  const but = total >= e.gardien;

  const res: ResultatTir = {
    danger,
    mult,
    placement,
    bonusPlacement,
    total,
    gardien: e.gardien,
    but,
    minute: e.minute,
  };

  e.tirsTotal++;
  e.tirsCeTour++;
  e.jauges.danger = 0;

  if (but) {
    e.buts++;
    e.jauges.confiance = Math.min(e.jauges.confianceMax, e.jauges.confiance + 2);
    e.jauges.placement = Math.max(0, placement - 3);
    journal(e, 'fort', `BUT ! ${total} contre ${res.gardien}. Le stade explose.`);
  } else {
    e.jauges.confiance = Math.max(0, e.jauges.confiance - 1);
    e.jauges.placement = Math.max(0, placement - 2);
    journal(e, 'mauvais', `Arrete. ${total}, il en fallait ${res.gardien}.`);
  }

  e.dernierTir = res;
  return res;
}

/* ------------------------------ Jouer une carte ---------------------------- */

export interface RetourAction {
  etat: EtatMatch;
  /** Tirs resolus par cette action, pour l'animation. */
  tirs: ResultatTir[];
  refus: string | null;
}

export function jouerCarte(etat: EtatMatch, uid: string): RetourAction {
  const e = copier(etat);
  const i = e.main.findIndex((c) => c.uid === uid);
  if (i < 0) return { etat, tirs: [], refus: 'Carte introuvable.' };
  const carte = e.main[i]!;
  const refus = raisonBlocage(e, carte);
  if (refus) return { etat, tirs: [], refus };

  const def = carteDef(carte.def);
  const cout = coutReel(e, def);

  e.main.splice(i, 1);
  e.defausse.push(carte);
  e.jauges.souffle -= cout;
  e.souffleDepense += cout;
  e.cartesJouees++;
  for (const t of def.tags) e.tagsJoues.push(t);

  const tirs: ResultatTir[] = [];
  for (const ef of def.effets) appliquerEffet(e, ef, tirs);

  verifierFin(e);
  return { etat: e, tirs, refus: null };
}

/**
 * Ce que donnerait cette carte si on la jouait maintenant, sans la jouer.
 *
 * Le moteur etant pur, l'apercu n'est pas une formule dupliquee dans
 * l'interface — c'est le vrai coup, joue sur une copie jetable. Il ne peut
 * donc jamais mentir ni diverger du resultat reel.
 *
 * C'est ce qui fait du tir une decision : le joueur voit « 14 contre 12 »
 * avant de valider, et assume. Un deckbuilder ou l'on tire a l'aveugle
 * n'a pas de tension, il a du hasard.
 */
export function apercuTir(etat: EtatMatch, uid: string): ResultatTir | null {
  const carte = etat.main.find((c) => c.uid === uid);
  if (!carte) return null;
  if (!carteDef(carte.def).effets.some((ef) => ef.t === 'tir')) return null;
  const r = jouerCarte(etat, uid);
  return r.refus ? null : (r.tirs[r.tirs.length - 1] ?? null);
}

/* ---------------------------- Fin de temps de jeu -------------------------- */

function appliquerMenace(e: EtatMatch, def: MenaceDef): void {
  for (const ef of def.effets) {
    switch (ef.t) {
      case 'butAdverse':
        e.butsEncaisses++;
        e.jauges.confiance = Math.max(0, e.jauges.confiance - 1);
        journal(e, 'mauvais', `Ils marquent. ${e.buts} - ${e.butsEncaisses}.`);
        break;
      case 'souffle':
        e.jauges.souffle = Math.max(0, e.jauges.souffle + ef.n);
        break;
      case 'souffleMax':
        e.jauges.souffleMax = Math.max(REGLES.souffleMaxPlancher, e.jauges.souffleMax + ef.n);
        break;
      case 'confiance':
        e.jauges.confiance = Math.max(0, Math.min(e.jauges.confianceMax, e.jauges.confiance + ef.n));
        break;
      case 'placement':
        e.jauges.placement = Math.max(0, e.jauges.placement + ef.n);
        break;
      case 'danger':
        gagnerDanger(e, ef.n);
        break;
      case 'perteDeBalle':
        e.jauges.danger = 0;
        journal(e, 'mauvais', 'Ballon perdu. Tout est a refaire.');
        break;
      case 'gardien':
        e.gardienModif += ef.n;
        break;
      case 'surcout':
        e.surcouts.push({ tag: ef.tag, n: ef.n, tours: ef.tours });
        break;
      case 'polluer':
        polluer(e, ef.carteId);
        journal(e, 'mauvais', `${carteDef(ef.carteId).nom} — ca reste dans les jambes.`);
        break;
    }
  }
}

function resoudreMenaces(e: EtatMatch): void {
  const restantes: Menace[] = [];
  for (const m of e.menaces) {
    const def = menaceDef(m.def);
    const echu = m.restant - 1 <= 0;
    if (!echu) {
      restantes.push({ ...m, restant: m.restant - 1 });
      continue;
    }
    const pare = paradeSatisfaite(e, def.parade);
    if (def.genre === 'menace') {
      if (pare) {
        journal(e, 'bon', `${def.nom} : ecarte.`);
      } else {
        journal(e, 'mauvais', `${def.nom} : tu l’as subie.`);
        appliquerMenace(e, def);
      }
    } else {
      if (pare) {
        journal(e, 'bon', `${def.nom} : tu en profites.`);
        appliquerMenace(e, def);
      } else {
        journal(e, 'neutre', `${def.nom} : le ballon ne vient pas.`);
      }
    }
  }
  e.menaces = restantes;
}

function annoncerMenaces(e: EtatMatch): void {
  const dispo = TOUTES_LES_MENACES.filter(
    (d) => (d.tourMin ?? 1) <= e.tour && !e.menaces.some((m) => m.def === d.id),
  );
  while (e.menaces.length < REGLES.menacesVisees && dispo.length > 0) {
    // Tirage pondere, deterministe.
    const total = dispo.reduce((s, d) => s + d.poids, 0);
    let r = entier(e.rng, 1, total);
    let pris = dispo[0]!;
    for (const d of dispo) {
      r -= d.poids;
      if (r <= 0) {
        pris = d;
        break;
      }
    }
    dispo.splice(dispo.indexOf(pris), 1);
    e.menaces.push({ uid: `m${e.tour}_${e.menaces.length}`, def: pris.id, restant: pris.delai });
    journal(e, pris.genre === 'menace' ? 'mauvais' : 'bon', pris.annonce);
  }
}

function demarrerTour(e: EtatMatch): void {
  e.tour++;
  e.minute = minutePour(e.tour, e.toursTotal);
  e.phase = 'tour';

  // Usure : le souffle max descend, le regain ne remplit jamais la jauge.
  if (e.tour > 1 && (e.tour - 1) % REGLES.usureTous === 0) {
    e.jauges.souffleMax = Math.max(REGLES.souffleMaxPlancher, e.jauges.souffleMax - 1);
  }

  if (e.tour === REGLES.miTemps + 1) {
    // Mi-temps : on souffle, le coach reparle, l'ardoise adverse est effacee.
    e.jauges.souffle = e.jauges.souffleMax;
    e.jauges.confiance = Math.min(e.jauges.confianceMax, e.jauges.confiance + 1);
    e.menaces = [];
    e.surcouts = [];
    journal(e, 'neutre', 'Mi-temps. Vestiaire, bouteille d’eau, le coach hausse le ton.');
  } else {
    e.jauges.souffle = Math.min(e.jauges.souffleMax, e.jauges.souffle + REGLES.regainSouffle);
  }

  e.jauges.placement = Math.max(0, e.jauges.placement - REGLES.fuiteePlacement);
  e.jauges.danger = Math.floor(e.jauges.danger * REGLES.fuiteeDanger);

  e.surcouts = e.surcouts.map((s) => ({ ...s, tours: s.tours - 1 })).filter((s) => s.tours > 0);

  e.gardien = Math.max(
    REGLES.gardienPlancher,
    REGLES.gardienBase +
      e.buts * REGLES.gardienParBut +
      entier(e.rng, 0, REGLES.gardienAlea) +
      e.gardienModif,
  );
  e.gardienModif = 0;

  e.tagsJoues = [];
  e.cartesJouees = 0;
  e.souffleDepense = 0;
  e.tirsCeTour = 0;

  piocher(e, Math.max(0, e.mainMax - e.main.length));
  annoncerMenaces(e);
}

export function finirTour(etat: EtatMatch): RetourAction {
  if (etat.fini) return { etat, tirs: [], refus: 'Le match est fini.' };
  const e = copier(etat);

  resoudreMenaces(e);

  // Ce qui reste en main part : un ballon non joue est un ballon perdu.
  e.defausse.push(...e.main);
  e.main = [];

  if (verifierFin(e)) return { etat: e, tirs: [], refus: null };

  if (e.tour >= e.toursTotal) {
    terminer(e, 'coup-de-sifflet');
    return { etat: e, tirs: [], refus: null };
  }

  demarrerTour(e);
  verifierFin(e);
  return { etat: e, tirs: [], refus: null };
}

/* ------------------------------- Fin de match ------------------------------ */

export function objectifAtteint(e: EtatMatch, o: Objectif): boolean {
  switch (o.o) {
    case 'buts':
      return e.buts >= o.n;
    case 'dangerCumule':
      return e.dangerCumule >= o.n;
    case 'butsEncaissesMax':
      return e.butsEncaisses <= o.n;
    case 'confianceFinMin':
      return e.jauges.confiance >= o.n;
    case 'tirs':
      return e.tirsTotal >= o.n;
  }
}

export function libelleObjectif(o: Objectif): string {
  switch (o.o) {
    case 'buts':
      return o.n > 1 ? `Marquer ${o.n} buts` : 'Marquer';
    case 'dangerCumule':
      return `Creer ${o.n} de danger`;
    case 'butsEncaissesMax':
      return o.n === 0
        ? 'Ne rien encaisser'
        : `Encaisser ${o.n} but${o.n > 1 ? 's' : ''} au plus`;
    case 'confianceFinMin':
      return `Finir a ${o.n} de confiance`;
    case 'tirs':
      return `Tenter ${o.n} frappes`;
  }
}

export function avancementObjectif(e: EtatMatch, o: Objectif): { fait: number; requis: number } {
  switch (o.o) {
    case 'buts':
      return { fait: e.buts, requis: o.n };
    case 'dangerCumule':
      return { fait: e.dangerCumule, requis: o.n };
    case 'butsEncaissesMax':
      return { fait: e.butsEncaisses, requis: o.n };
    case 'confianceFinMin':
      return { fait: e.jauges.confiance, requis: o.n };
    case 'tirs':
      return { fait: e.tirsTotal, requis: o.n };
  }
}

function noteDeMatch(e: EtatMatch, objectifs: boolean[]): number {
  // Calibree sur le bot : une prestation moyenne doit sortir autour de 6,
  // pas de 9. Une note qui plafonne ne raconte rien et ne se partage pas.
  let n = 3;
  n += e.buts * 1.1;
  n += Math.min(1.5, e.dangerCumule / 45);
  n -= e.butsEncaisses * 0.5;
  n += e.jauges.confiance / 10;
  if (objectifs.every(Boolean)) n += 0.8;
  return Math.max(1, Math.min(10, Math.round(n * 10) / 10));
}

function terminer(e: EtatMatch, cause: 'coup-de-sifflet' | 'remplace'): void {
  const consigne = consigneDef(e.consigne);
  const objectifsAtteints = consigne.objectifs.map((o) => objectifAtteint(e, o));
  const reussi = cause === 'coup-de-sifflet' && objectifsAtteints.every(Boolean);
  const issue: IssueMatch = {
    reussi,
    cause,
    buts: e.buts,
    butsEncaisses: e.butsEncaisses,
    dangerCumule: e.dangerCumule,
    tirsTotal: e.tirsTotal,
    confiance: e.jauges.confiance,
    note: noteDeMatch(e, objectifsAtteints),
    objectifsAtteints,
  };
  e.issue = issue;
  e.fini = true;
  e.phase = 'fini';
  journal(
    e,
    reussi ? 'fort' : 'mauvais',
    cause === 'remplace'
      ? 'Le quatrieme arbitre leve le panneau. Ton numero. Tu sors.'
      : `Coup de sifflet final. ${e.buts} - ${e.butsEncaisses}.`,
  );
}

function verifierFin(e: EtatMatch): boolean {
  if (e.fini) return true;
  if (e.jauges.confiance <= 0) {
    terminer(e, 'remplace');
    return true;
  }
  return false;
}

/* --------------------------------- Creation -------------------------------- */

export function creerMatch(opts: OptionsMatch): EtatMatch {
  const profil = profilDef(opts.profil);
  const rng = creerRng(`${opts.seed}|${opts.profil}`);
  const listeDeck = opts.deck ?? profil.deck;

  const deck: Carte[] = listeDeck.map((def, i) => ({ uid: `d${i}`, def }));

  const e: EtatMatch = {
    rng,
    seed: opts.seed,
    profil: profil.id,
    consigne: opts.consigne ?? profil.consigne,
    tour: 0,
    toursTotal: REGLES.toursTotal,
    minute: 0,
    phase: 'tour',
    buts: 0,
    butsEncaisses: 0,
    jauges: {
      souffle: opts.souffleMaxDepart ?? profil.jaugesDepart.souffleMax ?? 9,
      souffleMax: opts.souffleMaxDepart ?? profil.jaugesDepart.souffleMax ?? 9,
      placement: 0,
      danger: 0,
      confiance: opts.confianceDepart ?? profil.jaugesDepart.confiance ?? 6,
      confianceMax: REGLES.confianceMax,
    },
    gardien: REGLES.gardienBase,
    gardienModif: 0,
    compteurUid: 0,
    main: [],
    pioche: melanger(rng, deck),
    defausse: [],
    mainMax: REGLES.mainMax,
    menaces: [],
    surcouts: [],
    tagsJoues: [],
    cartesJouees: 0,
    souffleDepense: 0,
    tirsCeTour: 0,
    dangerCumule: 0,
    tirsTotal: 0,
    journal: [],
    dernierTir: null,
    fini: false,
    issue: null,
  };

  journal(e, 'neutre', 'Coup d’envoi.');
  demarrerTour(e);
  return e;
}

/** Adversaire du jour, tire de la seed. Purement cosmetique et fictif. */
export function adversairePour(seed: string, liste: readonly string[]): string {
  return choix(creerRng(`adv|${seed}`), liste);
}

/** Copie sans effet de bord, pour les simulations et les tests. */
export function figer(e: EtatMatch): EtatMatch {
  return copier(e);
}
