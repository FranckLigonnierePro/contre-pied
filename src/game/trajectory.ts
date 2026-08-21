import * as THREE from 'three';
import { BALL_DAMPING, BALL_RADIUS, COURT, GRAVITY } from '../core/constants';

const G = Math.abs(GRAVITY);
const D = BALL_DAMPING;
/**
 * Hauteur du centre de la balle a son contact avec le sol. Viser plus haut
 * revient a arreter le calcul avant la fin de la chute, et la balle depasse
 * alors sa cible de la distance parcourue pendant le reste de la descente.
 */
const TARGET_Y = BALL_RADIUS;

/**
 * Modele continu du vol amorti, celui que la balle suit reellement :
 *
 *   v(t) = (v0 + g/d)·e^(-d·t) − g/d
 *   y(t) = y0 + ((v0 + g/d)/d)·(1 − e^(-d·t)) − (g/d)·t
 *   x(t) = x0 + (vx0/d)·(1 − e^(-d·t))
 *
 * La derniere ligne est la raison d'etre de ce module : la distance parcourue
 * n'est pas v·t mais (v/d)(1 − e^(-d·t)), toujours plus courte. Resoudre sans
 * amortissement faisait atterrir chaque frappe environ deux metres avant sa
 * cible.
 */
export function heightAt(y0: number, vy0: number, t: number): number {
  const e = Math.exp(-D * t);
  return y0 + ((vy0 + G / D) / D) * (1 - e) - (G / D) * t;
}

/** Distance horizontale parcourue en `t` secondes a la vitesse initiale `v0`. */
export function reachAt(v0: number, t: number): number {
  return (v0 / D) * (1 - Math.exp(-D * t));
}

/** Instant du sommet de la trajectoire. */
function peakTime(vy0: number): number {
  return Math.log1p((vy0 * D) / G) / D;
}

/** Hauteur gagnee au-dessus du point de depart, au sommet. */
function peakHeight(vy0: number): number {
  return vy0 / D - (G / (D * D)) * Math.log1p((vy0 * D) / G);
}

/** Vitesse verticale initiale donnant un sommet a `peak` metres au-dessus du depart. */
function verticalFor(peak: number): number {
  let hi = 1;
  while (peakHeight(hi) < peak && hi < 400) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (peakHeight(mid) < peak) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Duree avant de redescendre a `TARGET_Y`, apres le sommet. */
function flightTime(y0: number, vy0: number): number {
  let lo = peakTime(vy0);
  let hi = lo + 1;
  while (heightAt(y0, vy0, hi) > TARGET_Y && hi < 20) hi += 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (heightAt(y0, vy0, mid) > TARGET_Y) lo = mid;
    else hi = mid;
  }
  return THREE.MathUtils.clamp((lo + hi) / 2, 0.05, 6);
}

/**
 * Ou retombe une balle lancee depuis `from` a la vitesse `velocity`.
 * Reciproque de `ballisticVelocity`, et de quoi verifier l'une par l'autre.
 */
export function landingPoint(
  from: THREE.Vector3,
  velocity: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const t = flightTime(from.y, velocity.y);
  return out.set(from.x + reachAt(velocity.x, t), TARGET_Y, from.z + reachAt(velocity.z, t));
}

/**
 * Vitesse initiale pour qu'une balle partant de `from` retombe sur `to` en
 * culminant `peak` metres au-dessus de son point de depart.
 */
export function ballisticVelocity(
  from: THREE.Vector3,
  to: THREE.Vector3,
  peak: number,
): THREE.Vector3 {
  const vy = verticalFor(Math.max(0.05, peak));
  const t = flightTime(from.y, vy);
  // Inverse de `reachAt` : quelle vitesse initiale couvre cette distance ?
  const facteur = D / (1 - Math.exp(-D * t));
  return new THREE.Vector3((to.x - from.x) * facteur, vy, (to.z - from.z) * facteur);
}

/** Restitution effective balle/sol et balle/vitre, telles que Rapier les combine. */
const BOUNCE_FLOOR = 0.77;
const BOUNCE_WALL = 0.73;
const STEP = 1 / 60;

/**
 * Ou la balle deviendra jouable pour le camp `side`, parois comprises.
 *
 * On integre la trajectoire pas a pas plutot que de la resoudre : c'est le
 * seul moyen de tenir compte des rebonds sur le sol et sur les vitres. Une
 * resolution balistique renvoie un point situe derriere la vitre du fond, et
 * l'IA allait s'y coller pendant que la balle lui repassait devant.
 *
 * On retient le premier passage a hauteur de frappe, en descente, a l'interieur
 * du court : les passages hors du court sont ignores, ce qui fait naturellement
 * attendre le retour de vitre.
 */
export function predictIntercept(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  side: number,
  hitY = 0.9,
  horizon = 3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  let { x, y, z } = pos;
  let vx = vel.x;
  let vy = vel.y;
  let vz = vel.z;
  const murX = COURT.halfWidth - BALL_RADIUS;
  const murZ = COURT.halfLength - BALL_RADIUS;

  for (let t = 0; t < horizon; t += STEP) {
    vy -= Math.abs(GRAVITY) * STEP;
    const frein = 1 / (1 + BALL_DAMPING * STEP);
    vx *= frein;
    vy *= frein;
    vz *= frein;
    x += vx * STEP;
    y += vy * STEP;
    z += vz * STEP;

    if (y < BALL_RADIUS && vy < 0) {
      y = BALL_RADIUS;
      vy = -vy * BOUNCE_FLOOR;
    }
    if (Math.abs(x) > murX && x * vx > 0 && y < COURT.sideWallHeight) {
      x = Math.sign(x) * murX;
      vx = -vx * BOUNCE_WALL;
    }
    if (Math.abs(z) > murZ && z * vz > 0 && y < COURT.backWallHeight) {
      z = Math.sign(z) * murZ;
      vz = -vz * BOUNCE_WALL;
    }

    const jouable =
      vy < 0 &&
      y <= hitY &&
      z * side > 0.5 &&
      Math.abs(z) < COURT.halfLength - 0.4 &&
      Math.abs(x) < COURT.halfWidth - 0.3;
    if (jouable) return out.set(x, 0, z);
  }
  return out.set(x, 0, THREE.MathUtils.clamp(z, -COURT.halfLength + 1, COURT.halfLength - 1));
}
