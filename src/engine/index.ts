/**
 * Le moteur : TypeScript pur, zero dependance, zero DOM, zero React.
 *
 * C'est une contrainte du brief (6) et pas un gout d'architecture. Un moteur
 * isole et deterministe donne d'un coup, plus tard et sans reecriture :
 *   - le defi du jour a seed partagee,
 *   - la simulation serveur (anti-triche gratuit),
 *   - les fantomes et les matchs croises entre amis,
 *   - le bot d'equilibrage a 100 000 runs.
 *
 * Regle : rien dans ce dossier n'importe quoi que ce soit hors de ce dossier.
 */
export * from './rng';
export * from './types';
export * from './cartes';
export * from './menaces';
export * from './profils';
export * from './match';
export * from './saison';
