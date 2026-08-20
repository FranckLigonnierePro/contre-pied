import { describe, expect, it } from 'vitest';
import { AI_SIDE, PLAYER_SIDE } from '../core/constants';
import { Rules } from './rules';
import type { BounceEvent } from './ball';

const ORIGIN = { x: 0, y: 0, z: 0 } as unknown as BounceEvent['position'];

function ev(kind: BounceEvent['kind'], side: number): BounceEvent {
  return { kind, side, position: ORIGIN };
}

/**
 * Fait gagner un point a `winner` sans dependre de la physique : l'adversaire
 * sert et met la balle au filet. Laisse l'arbitre pret pour le point suivant.
 */
function winPoint(rules: Rules, winner: number) {
  rules.startPoint();
  rules.onServe(-winner);
  const outcome = rules.onBallEvent(ev('net', -winner));
  expect(outcome?.winner).toBe(winner);
}

function winGame(rules: Rules, winner: number) {
  for (let i = 0; i < 4; i += 1) winPoint(rules, winner);
}

describe('comptage des points', () => {
  it('enchaine 0, 15, 30, 40 puis le jeu', () => {
    const rules = new Rules();
    expect(rules.scoreLabel(PLAYER_SIDE)).toBe('0');

    for (const expected of ['15', '30', '40']) {
      winPoint(rules, PLAYER_SIDE);
      expect(rules.scoreLabel(PLAYER_SIDE)).toBe(expected);
    }
    expect(rules.games.get(PLAYER_SIDE)).toBe(0);

    winPoint(rules, PLAYER_SIDE);
    expect(rules.games.get(PLAYER_SIDE)).toBe(1);
    // Le jeu remporte remet les deux scores a zero.
    expect(rules.scoreLabel(PLAYER_SIDE)).toBe('0');
    expect(rules.scoreLabel(AI_SIDE)).toBe('0');
  });

  it('remet les points a zero pour les deux camps au changement de jeu', () => {
    const rules = new Rules();
    winPoint(rules, AI_SIDE);
    winPoint(rules, AI_SIDE);
    winGame(rules, PLAYER_SIDE);
    expect(rules.points.get(AI_SIDE)).toBe(0);
    expect(rules.points.get(PLAYER_SIDE)).toBe(0);
  });
});

describe('egalite et avantage', () => {
  function bringToDeuce(rules: Rules) {
    for (let i = 0; i < 3; i += 1) {
      winPoint(rules, PLAYER_SIDE);
      winPoint(rules, AI_SIDE);
    }
  }

  it('affiche 40-40 a trois points partout', () => {
    const rules = new Rules();
    bringToDeuce(rules);
    expect(rules.scoreLabel(PLAYER_SIDE)).toBe('40');
    expect(rules.scoreLabel(AI_SIDE)).toBe('40');
    expect(rules.advantage).toBe(0);
    expect(rules.games.get(PLAYER_SIDE)).toBe(0);
  });

  it('donne l avantage sans conclure le jeu', () => {
    const rules = new Rules();
    bringToDeuce(rules);
    winPoint(rules, PLAYER_SIDE);
    expect(rules.advantage).toBe(PLAYER_SIDE);
    expect(rules.scoreLabel(PLAYER_SIDE)).toBe('AV');
    expect(rules.scoreLabel(AI_SIDE)).toBe('—');
    expect(rules.games.get(PLAYER_SIDE)).toBe(0);
  });

  it('revient a egalite quand l adversaire egalise', () => {
    const rules = new Rules();
    bringToDeuce(rules);
    winPoint(rules, PLAYER_SIDE);
    winPoint(rules, AI_SIDE);
    expect(rules.advantage).toBe(0);
    expect(rules.scoreLabel(PLAYER_SIDE)).toBe('40');
    expect(rules.games.get(AI_SIDE)).toBe(0);
  });

  it('conclut le jeu sur deux points consecutifs apres egalite', () => {
    const rules = new Rules();
    bringToDeuce(rules);
    winPoint(rules, AI_SIDE);
    winPoint(rules, AI_SIDE);
    expect(rules.games.get(AI_SIDE)).toBe(1);
    expect(rules.advantage).toBe(0);
  });
});

describe('service', () => {
  it('commence par le joueur et alterne a chaque jeu', () => {
    const rules = new Rules();
    expect(rules.server).toBe(PLAYER_SIDE);
    winGame(rules, PLAYER_SIDE);
    expect(rules.server).toBe(AI_SIDE);
    winGame(rules, AI_SIDE);
    expect(rules.server).toBe(PLAYER_SIDE);
  });

  it('passe en echange et attribue la balle au serveur', () => {
    const rules = new Rules();
    rules.startPoint();
    expect(rules.phase).toBe('serve');
    rules.onServe(AI_SIDE);
    expect(rules.phase).toBe('rally');
    expect(rules.lastHitter).toBe(AI_SIDE);
  });
});

describe('fautes pendant l echange', () => {
  it('donne le point a l adversaire sur balle au filet', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    expect(rules.onBallEvent(ev('net', AI_SIDE))).toEqual({
      winner: AI_SIDE,
      reason: 'Dans le filet !',
    });
    expect(rules.phase).toBe('point');
  });

  it('donne le point a l adversaire sur balle sortie', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    expect(rules.onBallEvent(ev('out', AI_SIDE))?.winner).toBe(AI_SIDE);
  });

  it('sanctionne le rebond dans son propre camp', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    expect(rules.onBallEvent(ev('floor', PLAYER_SIDE))).toEqual({
      winner: AI_SIDE,
      reason: 'Rebond dans son camp',
    });
  });

  it('laisse le premier rebond adverse sans consequence', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    expect(rules.onBallEvent(ev('floor', AI_SIDE))).toBeNull();
    expect(rules.phase).toBe('rally');
  });

  it('conclut au deuxieme rebond adverse', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    rules.onBallEvent(ev('floor', AI_SIDE));
    expect(rules.onBallEvent(ev('floor', AI_SIDE))).toEqual({
      winner: PLAYER_SIDE,
      reason: 'Double rebond',
    });
  });

  it('ignore les rebonds sur les vitres', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    expect(rules.onBallEvent(ev('wall', AI_SIDE))).toBeNull();
    expect(rules.onBallEvent(ev('wall', AI_SIDE))).toBeNull();
    expect(rules.phase).toBe('rally');
  });

  it('n arbitre plus rien une fois le point conclu', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    rules.onBallEvent(ev('net', AI_SIDE));
    expect(rules.onBallEvent(ev('out', AI_SIDE))).toBeNull();
    expect(rules.points.get(AI_SIDE)).toBe(1);
  });
});

describe('validite des frappes', () => {
  it('accepte une frappe de l adversaire et remet le compteur de rebonds a zero', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    rules.onBallEvent(ev('floor', AI_SIDE));
    expect(rules.onHit(AI_SIDE)).toBe(true);
    // Le rebond precedent ne doit plus compter : sinon le retour vaudrait double rebond.
    expect(rules.onBallEvent(ev('floor', PLAYER_SIDE))).toBeNull();
  });

  it('refuse deux frappes consecutives du meme camp', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    expect(rules.onHit(PLAYER_SIDE)).toBe(false);
    expect(rules.lastHitter).toBe(PLAYER_SIDE);
  });

  it('refuse toute frappe hors echange', () => {
    const rules = new Rules();
    rules.startPoint();
    expect(rules.phase).toBe('serve');
    expect(rules.onHit(PLAYER_SIDE)).toBe(false);
    expect(rules.lastHitter).toBe(0);
  });
});

describe('droit de frapper', () => {
  it('refuse le contact au camp qui vient de frapper', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    expect(rules.canHit(PLAYER_SIDE)).toBe(false);
    expect(rules.canHit(AI_SIDE)).toBe(true);
  });

  it('rend la main a l adversaire apres sa frappe', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    rules.onHit(AI_SIDE);
    expect(rules.canHit(AI_SIDE)).toBe(false);
    expect(rules.canHit(PLAYER_SIDE)).toBe(true);
  });

  it('refuse le contact aux deux camps hors echange', () => {
    const rules = new Rules();
    rules.startPoint();
    expect(rules.phase).toBe('serve');
    expect(rules.canHit(PLAYER_SIDE)).toBe(false);
    expect(rules.canHit(AI_SIDE)).toBe(false);
  });

  it('refuse le contact une fois le point conclu', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    rules.onBallEvent(ev('net', AI_SIDE));
    expect(rules.phase).toBe('point');
    expect(rules.canHit(AI_SIDE)).toBe(false);
    expect(rules.canHit(PLAYER_SIDE)).toBe(false);
  });

  // `canHit` sert a autoriser le contact physique, `onHit` a l'enregistrer :
  // si les deux divergent, la balle bouge sur une frappe que l'arbitre refuse.
  it('reste d accord avec onHit dans toutes les phases', () => {
    for (const side of [PLAYER_SIDE, AI_SIDE]) {
      for (const setup of [
        (r: Rules) => r.startPoint(),
        (r: Rules) => { r.startPoint(); r.onServe(PLAYER_SIDE); },
        (r: Rules) => { r.startPoint(); r.onServe(AI_SIDE); },
        (r: Rules) => { r.startPoint(); r.onServe(PLAYER_SIDE); r.onBallEvent(ev('net', AI_SIDE)); },
      ]) {
        const rules = new Rules();
        setup(rules);
        // `onHit` mute `lastHitter` : on releve le predicat avant de l'appeler.
        const autorise = rules.canHit(side);
        expect(rules.onHit(side)).toBe(autorise);
      }
    }
  });
});

describe('balle non jouee', () => {
  it('donne le point au dernier frappeur', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    rules.onHit(AI_SIDE);
    expect(rules.timeout()).toEqual({ winner: AI_SIDE, reason: 'Balle non jouee' });
  });

  it('retombe sur le serveur si personne n a touche la balle', () => {
    const rules = new Rules();
    rules.startPoint();
    expect(rules.timeout().winner).toBe(PLAYER_SIDE);
  });
});

describe('fin de match', () => {
  it('declare le vainqueur au troisieme jeu', () => {
    const rules = new Rules();
    winGame(rules, PLAYER_SIDE);
    winGame(rules, PLAYER_SIDE);
    expect(rules.matchWinner).toBe(0);
    winGame(rules, PLAYER_SIDE);
    expect(rules.matchWinner).toBe(PLAYER_SIDE);
    expect(rules.games.get(PLAYER_SIDE)).toBe(rules.gamesToWin);
  });

  it('bascule en phase match des le jeu decisif', () => {
    const rules = new Rules();
    winGame(rules, AI_SIDE);
    winGame(rules, AI_SIDE);
    winGame(rules, AI_SIDE);
    expect(rules.phase).toBe('match');
    expect(rules.matchWinner).toBe(AI_SIDE);
  });

  it('remet tout a zero et rend le service au joueur', () => {
    const rules = new Rules();
    winGame(rules, AI_SIDE);
    winPoint(rules, AI_SIDE);
    rules.reset();
    expect(rules.games.get(PLAYER_SIDE)).toBe(0);
    expect(rules.games.get(AI_SIDE)).toBe(0);
    expect(rules.points.get(AI_SIDE)).toBe(0);
    expect(rules.advantage).toBe(0);
    expect(rules.server).toBe(PLAYER_SIDE);
    expect(rules.phase).toBe('serve');
    expect(rules.matchWinner).toBe(0);
  });
});
