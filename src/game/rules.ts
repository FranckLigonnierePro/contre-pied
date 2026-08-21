import { AI_SIDE, COURT, PLAYER_SIDE } from '../core/constants';
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
  /** Tentative de service en cours : 1 ou 2. */
  serveAttempt = 1;
  /** Motif de la derniere faute de service, a afficher au serveur. */
  faultReason: string | null = null;
  private bounces = 0;
  /** Points deja joues dans le jeu en cours : decide le carre de service. */
  private pointsInGame = 0;
  /** Vrai tant que le premier rebond du service n'a pas ete juge. */
  private judgingServe = false;

  /**
   * Signe en x du carre de service vise, dans le camp du receveur.
   * Le service se joue en diagonale et change de carre a chaque point.
   */
  get serveBox(): number {
    return this.pointsInGame % 2 === 0 ? -this.server : this.server;
  }

  startPoint() {
    this.phase = 'serve';
    this.lastHitter = 0;
    this.bounces = 0;
    this.lastOutcome = null;
    this.serveAttempt = 1;
    this.faultReason = null;
    this.judgingServe = false;
  }

  onServe(side: number) {
    this.phase = 'rally';
    this.lastHitter = side;
    this.bounces = 0;
    this.judgingServe = true;
    this.faultReason = null;
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
    // Tant que le service n'a pas rebondi, ce sont ses regles qui s'appliquent.
    if (this.judgingServe) return this.judgeServe(ev);

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
      case 'wall': {
        // C'est la regle qui fait le padel : une balle frappee doit toucher le
        // sol adverse avant toute vitre. Apres ce rebond, les parois font
        // partie du jeu et l'echange continue — c'est meme la tout l'interet.
        if (this.bounces > 0) return null;
        return ev.side === hitter
          ? this.award(-hitter, 'Vitre de son propre camp')
          : this.award(-hitter, 'Vitre avant le rebond');
      }
      default:
        return null;
    }
  }

  /**
   * Juge le service jusqu'a son premier rebond. Il doit retomber dans le carre
   * diagonal : tout le reste est faute, et deux fautes de suite donnent le
   * point au receveur.
   */
  private judgeServe(ev: BounceEvent): PointOutcome | null {
    switch (ev.kind) {
      case 'floor':
        if (this.serveIsIn(ev)) {
          this.judgingServe = false;
          // Ce rebond est bien le premier du receveur : il compte comme tel.
          this.bounces = 1;
          return null;
        }
        return this.serveFault('Service hors du carre');
      case 'net':
        return this.serveFault('Service dans le filet');
      case 'wall':
        return this.serveFault('Service sur la vitre');
      case 'out':
        return this.serveFault('Service sorti');
      default:
        return null;
    }
  }

  /** Le service est-il tombe dans le bon carre ? */
  private serveIsIn(ev: BounceEvent): boolean {
    const p = ev.position;
    return (
      ev.side === -this.server &&
      Math.sign(p.x) === this.serveBox &&
      Math.abs(p.z) < COURT.serviceLine
    );
  }

  private serveFault(reason: string): PointOutcome | null {
    this.judgingServe = false;
    if (this.serveAttempt === 1) {
      // Premiere faute : on rejoue, sans consequence sur le score.
      this.serveAttempt = 2;
      this.faultReason = reason;
      this.phase = 'serve';
      this.lastHitter = 0;
      this.bounces = 0;
      return null;
    }
    return this.award(-this.server, 'Double faute');
  }

  /** Le frappeur n'a pas atteint la balle a temps. */
  timeout(): PointOutcome {
    const hitter = this.lastHitter || this.server;
    return this.award(hitter, 'Balle non jouee');
  }

  private award(winner: number, reason: string): PointOutcome {
    this.phase = 'point';
    this.lastOutcome = { winner, reason };
    this.pointsInGame += 1;
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
    this.pointsInGame = 0;
    this.points.set(PLAYER_SIDE, 0);
    this.points.set(AI_SIDE, 0);
    this.advantage = 0;
    this.server = -this.server;
    // On ne bascule pas en phase 'match' ici : le point qui vient d'etre gagne
    // doit d'abord se jouer jusqu'au bout (ralenti, chute, banniere). C'est
    // l'appelant qui passe en 'match' une fois la celebration finie, en lisant
    // `matchWinner`. Basculer tout de suite rendait la banniere de fin de match
    // inatteignable : la boucle de jeu court-circuitait la phase 'point'.
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
    this.pointsInGame = 0;
    this.startPoint();
  }
}
