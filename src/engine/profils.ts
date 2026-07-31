import type { ConsigneDef, ProfilDef } from './types';

/**
 * Trois postes = trois decks de depart = la rejouabilite du MVP (brief 3.2).
 * Aucun nom de club ni de joueur reel, ici ni ailleurs (brief 4, risque
 * juridique) : tout est fictif des la v1, pas « on regularisera plus tard ».
 */

export const CONSIGNES: Record<string, ConsigneDef> = {
  marquer_trois: {
    id: 'marquer_trois',
    titre: 'Le coach te demande trois buts',
    detail: 'Il t’a mis devant pour ca. Trois buts, et pas plus de deux encaisses : on ne gagne pas 4-3 toutes les semaines.',
    objectifs: [
      { o: 'buts', n: 3 },
      { o: 'butsEncaissesMax', n: 2 },
    ],
  },
  regaler: {
    id: 'regaler',
    titre: 'Le coach te demande de tenir le jeu',
    detail: 'Fais vivre le ballon, cree 78 de danger sur le match, et finis-le toi-meme au moins une fois.',
    objectifs: [
      { o: 'dangerCumule', n: 78 },
      { o: 'buts', n: 1 },
    ],
  },
  tenir_la_baraque: {
    id: 'tenir_la_baraque',
    titre: 'Le coach te demande de tenir la baraque',
    detail: 'Un but encaisse maximum, et tu leur en mets un. On gagne comme ca.',
    objectifs: [
      { o: 'butsEncaissesMax', n: 1 },
      { o: 'buts', n: 1 },
    ],
  },
};

export function consigneDef(id: string): ConsigneDef {
  const d = CONSIGNES[id];
  if (!d) throw new Error(`Consigne inconnue : ${id}`);
  return d;
}

export const PROFILS: Record<string, ProfilDef> = {
  renard: {
    id: 'renard',
    numero: '9',
    nom: 'Le renard',
    poste: 'Avant-centre',
    origine: 'Sorti du centre de formation, pret trois fois, jamais titulaire',
    description:
      'Tu ne touches pas beaucoup de ballons. Tu n’as pas besoin d’en toucher beaucoup.',
    deck: [
      'appel_profondeur',
      'appel_profondeur',
      'decrochage',
      'passe_courte',
      'passe_courte',
      'controle_oriente',
      'dribble_court',
      'remise',
      'frappe_loin',
      'frappe_enroulee',
      'tete_plongeante',
      'retour_defensif',
    ],
    consigne: 'marquer_trois',
    jaugesDepart: { souffleMax: 9, confiance: 6 },
  },

  meneur: {
    id: 'meneur',
    numero: '10',
    nom: 'Le meneur',
    poste: 'Milieu offensif',
    origine: 'Repere sur un terrain synthetique a seize ans, arrive trop tard',
    description:
      'Le ballon passe par toi ou il ne passe pas. Le probleme, c’est que tout le monde le sait.',
    deck: [
      'passe_courte',
      'passe_courte',
      'controle_oriente',
      'harcelement',
      'remise',
      'talonnade',
      'une_deux',
      'decrochage',
      'crochet',
      'temporisation',
      'frappe_loin',
      'frappe_enroulee',
    ],
    consigne: 'regaler',
    jaugesDepart: { souffleMax: 10, confiance: 5 },
  },

  patron: {
    id: 'patron',
    numero: '6',
    nom: 'Le patron',
    poste: 'Milieu recuperateur',
    origine: 'Monte de National a vingt-six ans, tout le monde te croit fini',
    description:
      'Tu cours pour deux. Personne ne le voit, sauf ceux qui jouent a cote de toi.',
    deck: [
      'retour_defensif',
      'retour_defensif',
      'harcelement',
      'frappe_loin',
      'pressing',
      'couverture',
      'passe_courte',
      'controle_oriente',
      'temporisation',
      'appel_profondeur',
      'dribble_court',
      'frappe_loin',
    ],
    consigne: 'tenir_la_baraque',
    jaugesDepart: { souffleMax: 11, confiance: 7 },
  },
};

export const TOUS_LES_PROFILS: readonly ProfilDef[] = Object.values(PROFILS);

export function profilDef(id: string): ProfilDef {
  const d = PROFILS[id];
  if (!d) throw new Error(`Profil inconnu : ${id}`);
  return d;
}

/** Adversaires fictifs — evocateurs, jamais reels. */
export const ADVERSAIRES: readonly string[] = [
  'Sporting de Valmorin',
  'US Chateaubel',
  'Olympique de Rive-Haute',
  'FC Sainte-Ombre',
  'Racing du Vieux-Port',
  'AS Fontenoy',
  'Union de Pierrelac',
  'Stade Marlinois',
];
