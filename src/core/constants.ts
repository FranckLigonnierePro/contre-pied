/** Dimensions officielles d'un court de padel (en metres). */
export const COURT = {
  halfWidth: 5,
  halfLength: 10,
  serviceLine: 6.95,
  netHeight: 0.92,
  netPostHeight: 1.05,
  backWallHeight: 4,
  sideWallHeight: 3,
};

export const BALL_RADIUS = 0.033;
/**
 * Gravite exageree pour un rythme arcade, mais pas trop : au-dela la balle
 * retombe si vite apres son rebond qu'elle devient injouable.
 */
export const GRAVITY = -9.81 * 1.35;
/**
 * Amortissement lineaire de la balle. Il freine le vol et doit etre pris en
 * compte dans le calcul des trajectoires, sinon les frappes tombent court.
 */
export const BALL_DAMPING = 0.2;

/** Vitesse de course de reference, en m/s. */
export const SPRINT_SPEED = 5.4;

/** Le joueur humain occupe les z positifs, l'IA les z negatifs. */
export const PLAYER_SIDE = 1;
export const AI_SIDE = -1;

/** Decalage lateral des partenaires en double (en metres). */
export const DOUBLES_OFFSET = 2.2;

export const PALETTE = {
  sol: 0x1f6f4a,
  solClair: 0x2a8a5c,
  ligne: 0xf2f7f4,
  verre: 0x9fd8ff,
  grillage: 0x2b3a44,
  ciel: 0x87c9ff,
  joueur: 0xff5c3a,
  partenaire: 0xff8a5c,
  ia: 0x3a6bff,
  ia2: 0x5a8cff,
  peau: 0xf5c9a6,
  balle: 0xdcff4f,
  raquette: 0x1a1a22,
  tribune: 0x2a3540,
  siege: 0x3d4f5c,
  beton: 0x5a6068,
  luminaire: 0xf0f4ff,
  banniere: 0xff3a6a,
};

/**
 * Groupes de collision Rapier (16 bits d'appartenance << 16 | 16 bits de filtre).
 * Les membres d'un meme ragdoll ne doivent pas se percuter entre eux, sinon les
 * capsules qui se chevauchent font exploser la simulation.
 */
const G_ENV = 0x0001;
const G_BALL = 0x0002;
const G_PLAYER = 0x0004;
const G_AI = 0x0008;
const G_PARTNER = 0x0010;
const G_AI2 = 0x0020;

const OPP_PLAYER = G_ENV | G_BALL | G_AI | G_AI2;
const OPP_PARTNER = G_ENV | G_BALL | G_AI | G_AI2;
const OPP_AI = G_ENV | G_BALL | G_PLAYER | G_PARTNER;
const OPP_AI2 = G_ENV | G_BALL | G_PLAYER | G_PARTNER;

export const GROUPS = {
  env: (G_ENV << 16) | 0xffff,
  ball: (G_BALL << 16) | 0xffff,
  /** Joueur humain (index 0). */
  player: (G_PLAYER << 16) | OPP_PLAYER,
  /** Partenaire IA (index 1, camp joueur). */
  partner: (G_PARTNER << 16) | OPP_PARTNER,
  /** Premier adversaire IA (index 0). */
  ai: (G_AI << 16) | OPP_AI,
  /** Second adversaire IA (index 1). */
  ai2: (G_AI2 << 16) | OPP_AI2,
};

/** Groupe de collision pour un joueur en double, selon son camp et son index. */
export function collisionGroup(side: number, index: number): number {
  if (side === PLAYER_SIDE) return index === 0 ? GROUPS.player : GROUPS.partner;
  return index === 0 ? GROUPS.ai : GROUPS.ai2;
}
