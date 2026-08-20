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
export const GRAVITY = -9.81 * 1.7; // legerement exagere pour un rythme arcade

/** Le joueur humain occupe les z positifs, l'IA les z negatifs. */
export const PLAYER_SIDE = 1;
export const AI_SIDE = -1;

export const PALETTE = {
  sol: 0x1f6f4a,
  solClair: 0x2a8a5c,
  ligne: 0xf2f7f4,
  verre: 0x9fd8ff,
  grillage: 0x2b3a44,
  ciel: 0x87c9ff,
  joueur: 0xff5c3a,
  ia: 0x3a6bff,
  peau: 0xf5c9a6,
  balle: 0xdcff4f,
  raquette: 0x1a1a22,
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

export const GROUPS = {
  env: (G_ENV << 16) | 0xffff,
  ball: (G_BALL << 16) | 0xffff,
  player: (G_PLAYER << 16) | (G_ENV | G_BALL | G_AI),
  ai: (G_AI << 16) | (G_ENV | G_BALL | G_PLAYER),
};
