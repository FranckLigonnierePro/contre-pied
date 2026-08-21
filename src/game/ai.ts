import * as THREE from 'three';
import { COURT } from '../core/constants';
import { predictIntercept } from './trajectory';
import type { Ball } from './ball';
import type { Character } from './character';
import type { ShotKind } from './character';

const _target = new THREE.Vector3();
const _ballPos = new THREE.Vector3();
const _ballVel = new THREE.Vector3();
const _move = new THREE.Vector3();

export interface AiDecision {
  move: THREE.Vector3;
  facing: number;
  /** Point du camp adverse vise par la frappe. */
  swing: { kind: ShotKind; aim: THREE.Vector3; charge: number } | null;
}

/**
 * IA volontairement imparfaite : elle vise le point d'impact estime avec un
 * decalage, ce qui produit des courses ratees et des ragdolls qui s'etalent.
 */
export class Ai {
  /** Horloge de simulation : le balayage doit suivre le pas fixe, pas l'horloge murale. */
  private time = 0;

  constructor(private difficulty = 0.5) {}

  decide(self: Character, ball: Ball, dt: number): AiDecision {
    this.time += dt;
    const pos = self.position();
    ball.position(_ballPos);
    ball.velocity(_ballVel);

    const incoming = Math.sign(_ballVel.z) === Math.sign(self.side) || _ballPos.z * self.side > 0;
    predictLanding(_ballPos, _ballVel, self.side, _target);

    // Au repos, l'IA se replace un peu derriere la ligne de service.
    if (!incoming) _target.set(_ballPos.x * 0.3, 0, self.side * 6.5);

    const jitter = (1 - this.difficulty) * 2.2;
    _target.x += Math.sin(this.time * 2) * jitter;
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
    if (incoming && self.canSwing && hand.distanceTo(_ballPos) < 1.6 && Math.random() < this.difficulty) {
      const kind: ShotKind = _ballPos.y > 2.2 ? 'smash' : Math.random() < 0.2 ? 'lob' : 'plat';
      const aim = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(COURT.halfWidth * 1.4),
        0,
        -self.side * (kind === 'lob' ? 8.5 : kind === 'smash' ? 4 : 6.5),
      );
      swing = { kind, aim, charge: 0.8 + Math.random() * 0.4 };
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
