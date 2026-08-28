import * as THREE from 'three';
import { COURT, SPRINT_SPEED, doublesHomePosition } from '../core/constants';
import { predictIntercept } from './trajectory';
import { randRange, randSpread, random } from '../core/random';
import type { Ball } from './ball';
import type { Character } from './character';
import type { ShotKind } from './character';

const _target = new THREE.Vector3();
const _ballPos = new THREE.Vector3();
const _ballVel = new THREE.Vector3();
const _move = new THREE.Vector3();
const _adverse = new THREE.Vector3();

/** Marge gardee avec les vitres laterales quand on vise. */
const AIM_MARGIN = 1;
/** Ecart de visee d'une IA de niveau nul, en metres. */
const ERREUR_MAX = 3.4;
/** Distance au-dela de laquelle on ne tente rien. */
const PORTEE = 2.2;
/** Distance de declenchement du geste. */
const SEUIL = 1.2;
/** Dispersion du declenchement d'une IA de niveau nul, en metres. */
const ERREUR_TIMING = 0.9;

/**
 * Point vise par l'IA : l'espace laisse libre par l'adversaire, avec une
 * erreur qui se resserre quand le niveau monte.
 *
 * La cible etait auparavant tiree au hasard sur toute la largeur, sans egard
 * pour l'adversaire : l'IA renvoyait sans intention et lui servait la balle
 * dans les pieds une fois sur deux. Le simulateur chiffrait ce desequilibre a
 * une soixantaine de pourcents de points perdus.
 */
export function aimAgainst(
  kind: ShotKind,
  opponent: THREE.Vector3,
  side: number,
  difficulty: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const large = COURT.halfWidth - AIM_MARGIN;
  // On joue a l'oppose de l'adversaire. S'il est au centre, on choisit un cote.
  const cote = Math.abs(opponent.x) > 0.4 ? -Math.sign(opponent.x) : random() < 0.5 ? -1 : 1;

  // Profondeur : on allonge si l'adversaire est monte au filet, on raccourcit
  // s'il est colle a sa vitre du fond.
  const recul = Math.min(1, Math.abs(opponent.z) / COURT.halfLength);
  const base = kind === 'lob' ? 8.5 : kind === 'smash' ? 4 : 6.5;
  const profondeur = base + (0.5 - recul) * 3;

  const erreur = (1 - THREE.MathUtils.clamp(difficulty, 0, 1)) * ERREUR_MAX;
  return out.set(
    THREE.MathUtils.clamp(cote * large * 0.8 + randSpread(erreur), -large, large),
    0,
    -side * THREE.MathUtils.clamp(
      profondeur + randSpread(erreur * 0.6),
      1.5,
      COURT.halfLength - 1,
    ),
  );
}

export interface AiDecision {
  move: THREE.Vector3;
  facing: number;
  /** Point du camp adverse vise par la frappe. */
  swing: { kind: ShotKind; aim: THREE.Vector3; charge: number } | null;
}

/**
 * Niveaux etalonnes au simulateur. La valeur indiquee est la part des points
 * que l'IA gagne face a un adversaire regle a 0.5, sur 300 points :
 *
 *   facile 0.25 -> 26 %   ·   moyen 0.5 -> 42 %   ·   difficile 0.75 -> 50 %
 *
 * Au-dela de 0.75 l'IA redevient plus faible (43 % a 1.0), et la cause n'est
 * pas etablie : ni un plancher de dispersion de visee ni le declenchement
 * deterministe ne l'expliquent — les deux ont ete mesures, le premier degrade
 * meme le resultat. C'est pourquoi le niveau maximal propose reste 0.75.
 */
export const NIVEAUX = { facile: 0.25, moyen: 0.5, difficile: 0.75 } as const;

/**
 * IA volontairement imparfaite : elle vise le point d'impact estime avec un
 * decalage, ce qui produit des courses ratees et des ragdolls qui s'etalent.
 */
export class Ai {
  /** Horloge de simulation : le balayage doit suivre le pas fixe, pas l'horloge murale. */
  private time = 0;

  constructor(
    private difficulty = 0.5,
    /** Index dans l'equipe (0 = fond gauche, 1 = filet droit). */
    private role = 0,
    /** Decalage de phase pour desynchroniser les coequipiers. */
    private phase = 0,
  ) {}

  /**
   * Faut-il lancer le geste maintenant ?
   *
   * Le declenchement se joue sur le temps restant avant que la balle arrive, pas
   * sur un tirage par image. L'ancien `random() < difficulty` faisait office de
   * minuterie : plus le niveau montait, plus l'IA declenchait tot — des la
   * premiere image a portee — et la raquette passait devant la balle. Le
   * balayage du simulateur le montrait par une courbe non monotone, le niveau
   * maximal jouant moins bien que le niveau intermediaire.
   */
  private declenche(distance: number): boolean {
    if (distance > PORTEE) return false;
    // La dispersion du declenchement se resserre quand le niveau monte.
    const erreur = (1 - THREE.MathUtils.clamp(this.difficulty, 0, 1)) * ERREUR_TIMING;
    return distance <= SEUIL + randSpread(erreur);
  }

  /**
   * Vitesse de course correspondant au niveau. Le simulateur montre que les
   * points se perdent au dernier metre — mediane a 1,5 m d'une balle qu'il
   * faut approcher a 0,7 m — donc la course pese autant que la visee.
   * Le niveau 0.5 conserve exactement la vitesse de reference.
   */
  get moveSpeed(): number {
    return SPRINT_SPEED * (0.8 + THREE.MathUtils.clamp(this.difficulty, 0, 1) * 0.4);
  }

  /**
   * @param opponents adversaires, dont la position decide ou l'on place la balle.
   * @param teammates coequipiers : seul le plus proche de la balle la chasse.
   */
  decide(
    self: Character,
    opponents: Character | Character[],
    ball: Ball,
    dt: number,
    teammates: Character[] = [],
  ): AiDecision {
    const foes = Array.isArray(opponents) ? opponents : [opponents];
    const nearest = nearestOpponent(self, foes, ball);
    this.time += dt;
    const pos = self.position();
    ball.position(_ballPos);
    ball.velocity(_ballVel);

    const incoming = Math.sign(_ballVel.z) === Math.sign(self.side) || _ballPos.z * self.side > 0;
    predictLanding(_ballPos, _ballVel, self.side, _target);

    const homeCoords = doublesHomePosition(self.side, this.role);
    _adverse.set(homeCoords[0], homeCoords[1], homeCoords[2]);
    const home = _adverse;
    const chaser = pickChaser(self, teammates, _target);

    if (incoming && chaser === self) {
      // Le chasseur va a l'interception estimee.
    } else if (incoming) {
      // Le coequipier couvre sa zone et se decale legerement vers la balle.
      _target.copy(home);
      _target.x += (_ballPos.x - home.x) * 0.2;
      _target.z += (chaser.position(_adverse).z - home.z) * 0.15;
    } else {
      // Au repos : chacun reste sur son poste, avec un leger balayage.
      _target.copy(home);
      _target.x += _ballPos.x * 0.12;
    }

    const jitter = (1 - this.difficulty) * 1.4;
    const t = this.time + this.phase;
    _target.x += Math.sin(t * 2.1) * jitter;
    _target.z += Math.cos(t * 1.7 + this.role * 1.3) * jitter * 0.35;
    _target.x = THREE.MathUtils.clamp(_target.x, -COURT.halfWidth + 0.5, COURT.halfWidth - 0.5);
    _target.z = THREE.MathUtils.clamp(
      _target.z,
      self.side > 0 ? 1 : -COURT.halfLength + 0.6,
      self.side > 0 ? COURT.halfLength - 0.6 : -1,
    );

    _move.set(_target.x - pos.x, 0, _target.z - pos.z);
    const dist = _move.length();
    if (dist > 0.25) _move.divideScalar(dist).multiplyScalar(Math.min(1, dist));
    else _move.set(0, 0, 0);

    const facing = Math.atan2(pos.x - _ballPos.x, pos.z - _ballPos.z);

    let swing: AiDecision['swing'] = null;
    const hand = self.ragdoll.handPosition();
    const maySwing = incoming && chaser === self;
    if (maySwing && self.canSwing && this.declenche(hand.distanceTo(_ballPos))) {
      const kind: ShotKind = _ballPos.y > 2.2 ? 'smash' : random() < 0.2 ? 'lob' : 'plat';
      const aim = aimAgainst(kind, nearest.position(_adverse), self.side, this.difficulty);
      swing = { kind, aim, charge: randRange(0.8, 1.2) };
    }

    return { move: _move.clone(), facing, swing };
  }
}

/** Estime ou la balle va retomber a hauteur de frappe, cote `side`. */
export function predictLanding(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  side: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  predictIntercept(pos, vel, side, 0.9, 3, out);
  // On garde l'IA de son cote du filet.
  if (out.z * side < 0.5) out.z = side * 1.5;
  return out;
}

/** Adversaire le plus proche de la balle, pour viser l'espace libre en double. */
function nearestOpponent(self: Character, foes: Character[], ball: Ball): Character {
  const bp = ball.position(_ballPos);
  let best = foes[0];
  let dist = Infinity;
  for (const f of foes) {
    const d = f.position(_adverse).distanceTo(bp);
    if (d < dist) { dist = d; best = f; }
  }
  return best;
}

/** Coequipier designe pour courir apres la balle (le plus proche de l'atterrissage). */
function pickChaser(self: Character, teammates: Character[], landing: THREE.Vector3): Character {
  let best = self;
  let dist = self.position(_adverse).distanceTo(landing);
  for (const mate of teammates) {
    if (mate === self) continue;
    const d = mate.position(_adverse).distanceTo(landing);
    if (d < dist - 0.4) { dist = d; best = mate; }
  }
  return best;
}
