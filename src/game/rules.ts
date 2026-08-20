import { AI_SIDE, PLAYER_SIDE } from '../core/constants';
import type { BounceEvent } from './ball';

export type Phase = 'serve' | 'rally' | 'point' | 'match';

const LABELS = ['0', '15', '30', '40'];

export interface PointOutcome {
  winner: number;
  reason: string;
}

/** Arbitre : comptage padel classique et validite des echanges. */
export class Rules {
  phase: Phase = 'serve';
  server = PLAYER_SIDE;
  points = new Map<number, number>([[PLAYER_SIDE, 0], [AI_SIDE, 0]]);
  games = new Map<number, number>([[PLAYER_SIDE, 0], [AI_SIDE, 0]]);
  advantage = 0;
  lastOutcome: PointOutcome | null = null;
  readonly gamesToWin = 3;

  /** Cote du dernier frappeur, 0 si la balle n'a pas encore ete touchee. */
  lastHitter = 0;
  private bounces = 0;

  startPoint() {
    this.phase = 'serve';
    this.lastHitter = 0;
    this.bounces = 0;
    this.lastOutcome = null;
  }

  onServe(side: number) {
    this.phase = 'rally';
    this.lastHitter = side;
    this.bounces = 0;
  }

  /**
   * Ce camp a-t-il le droit de toucher la balle ? On ne peut pas frapper deux
   * fois de suite, ni frapper hors echange. Predicat sans effet de bord :
   * il est interroge avant le contact, pour qu'une frappe interdite n'ait
   * aucune consequence physique.
   */
  canHit(side: number): boolean {
    return this.phase === 'rally' && this.lastHitter !== side;
  }

  onHit(side: number): boolean {
    if (!this.canHit(side)) return false;
    this.lastHitter = side;
    this.bounces = 0;
    return true;
  }

  /** Traite un evenement de balle et renvoie l'issue du point s'il se conclut. */
  onBallEvent(ev: BounceEvent): PointOutcome | null {
    if (this.phase !== 'rally') return null;
    const hitter = this.lastHitter || this.server;

    switch (ev.kind) {
      case 'net':
        return this.award(-hitter, 'Dans le filet !');
      case 'out':
        return this.award(-hitter, 'Sortie !');
      case 'floor': {
        if (ev.side === hitter) return this.award(-hitter, 'Rebond dans son camp');
        this.bounces += 1;
        if (this.bounces >= 2) return this.award(hitter, 'Double rebond');
        return null;
      }
      default:
        return null;
    }
  }

  /** Le frappeur n'a pas atteint la balle a temps. */
  timeout(): PointOutcome {
    const hitter = this.lastHitter || this.server;
    return this.award(hitter, 'Balle non jouee');
  }

  private award(winner: number, reason: string): PointOutcome {
    this.phase = 'point';
    this.lastOutcome = { winner, reason };
    this.addPoint(winner);
    return this.lastOutcome;
  }

  private addPoint(winner: number) {
    const loser = -winner;
    const w = this.points.get(winner)!;
    const l = this.points.get(loser)!;

    if (w >= 3 && l >= 3) {
      if (this.advantage === winner) this.winGame(winner);
      else if (this.advantage === loser) this.advantage = 0;
      else this.advantage = winner;
      return;
    }
    if (w >= 3) {
      this.winGame(winner);
      return;
    }
    this.points.set(winner, w + 1);
  }

  private winGame(winner: number) {
    this.games.set(winner, this.games.get(winner)! + 1);
    this.points.set(PLAYER_SIDE, 0);
    this.points.set(AI_SIDE, 0);
    this.advantage = 0;
    this.server = -this.server;
    if (this.games.get(winner)! >= this.gamesToWin) this.phase = 'match';
  }

  get matchWinner(): number {
    for (const side of [PLAYER_SIDE, AI_SIDE]) {
      if (this.games.get(side)! >= this.gamesToWin) return side;
    }
    return 0;
  }

  scoreLabel(side: number): string {
    const mine = this.points.get(side)!;
    const theirs = this.points.get(-side)!;
    if (mine >= 3 && theirs >= 3) {
      if (this.advantage === side) return 'AV';
      if (this.advantage === -side) return '—';
      return '40';
    }
    return LABELS[Math.min(mine, 3)];
  }

  reset() {
    this.points.set(PLAYER_SIDE, 0);
    this.points.set(AI_SIDE, 0);
    this.games.set(PLAYER_SIDE, 0);
    this.games.set(AI_SIDE, 0);
    this.advantage = 0;
    this.server = PLAYER_SIDE;
    this.startPoint();
  }
}
