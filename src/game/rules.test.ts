import { describe, expect, it } from 'vitest';
import { AI_SIDE, COURT, PLAYER_SIDE } from '../core/constants';
import { Rules } from './rules';
import type { BounceEvent } from './ball';

type Pos = BounceEvent['position'];
const pos = (x: number, z: number) => ({ x, y: 0, z } as unknown as Pos);

function ev(kind: BounceEvent['kind'], side: number, at: Pos = pos(0, 0)): BounceEvent {
  return { kind, side, position: at };
}

/** Rebond de service valide : bon carre, en deca de la ligne de service. */
function serviceValide(rules: Rules): BounceEvent {
  return ev('floor', -rules.server, pos(rules.serveBox * 2, -rules.server * 4));
}

/** Le serveur engage correctement. La balle a alors rebondi une fois. */
function engage(rules: Rules) {
  rules.onServe(rules.server);
  expect(rules.onBallEvent(serviceValide(rules))).toBeNull();
  expect(rules.phase).toBe('rally');
}

/**
 * Amene l'arbitre en plein echange, `hitter` venant de frapper et le compteur
 * de rebonds a zero — l'etat dans lequel se jouent les regles d'echange.
 */
function enEchange(rules: Rules, hitter = PLAYER_SIDE) {
  rules.startPoint();
  engage(rules);
  expect(rules.onHit(-rules.server)).toBe(true);
  if (hitter !== -rules.server) expect(rules.onHit(hitter)).toBe(true);
  expect(rules.lastHitter).toBe(hitter);
}

/** Fait gagner un point a `winner`, quel que soit le serveur du moment. */
function winPoint(rules: Rules, winner: number) {
  const server = rules.server;
  rules.startPoint();
  engage(rules);
  if (server === winner) {
    // Le receveur laisse le service rebondir une seconde fois.
    expect(rules.onBallEvent(ev('floor', -server))?.winner).toBe(winner);
    return;
  }
  expect(rules.onHit(winner)).toBe(true);
  rules.onBallEvent(ev('floor', server));
  expect(rules.onBallEvent(ev('floor', server))?.winner).toBe(winner);
}

function winGame(rules: Rules, winner: number) {
  for (let i = 0; i < 4; i += 1) winPoint(rules, winner);
}

describe('comptage des points', () => {
  it('enchaine 0, 15, 30, 40 puis le jeu', () => {
    const rules = new Rules();
    expect(rules.scoreLabel(PLAYER_SIDE)).toBe('0');
    for (const attendu of ['15', '30', '40']) {
      winPoint(rules, PLAYER_SIDE);
      expect(rules.scoreLabel(PLAYER_SIDE)).toBe(attendu);
    }
    expect(rules.games.get(PLAYER_SIDE)).toBe(0);
    winPoint(rules, PLAYER_SIDE);
    expect(rules.games.get(PLAYER_SIDE)).toBe(1);
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
  function egalite(rules: Rules) {
    for (let i = 0; i < 3; i += 1) {
      winPoint(rules, PLAYER_SIDE);
      winPoint(rules, AI_SIDE);
    }
  }

  it('affiche 40-40 a trois points partout', () => {
    const rules = new Rules();
    egalite(rules);
    expect(rules.scoreLabel(PLAYER_SIDE)).toBe('40');
    expect(rules.scoreLabel(AI_SIDE)).toBe('40');
    expect(rules.advantage).toBe(0);
    expect(rules.games.get(PLAYER_SIDE)).toBe(0);
  });

  it('donne l avantage sans conclure le jeu', () => {
    const rules = new Rules();
    egalite(rules);
    winPoint(rules, PLAYER_SIDE);
    expect(rules.advantage).toBe(PLAYER_SIDE);
    expect(rules.scoreLabel(PLAYER_SIDE)).toBe('AV');
    expect(rules.scoreLabel(AI_SIDE)).toBe('—');
    expect(rules.games.get(PLAYER_SIDE)).toBe(0);
  });

  it('revient a egalite quand l adversaire egalise', () => {
    const rules = new Rules();
    egalite(rules);
    winPoint(rules, PLAYER_SIDE);
    winPoint(rules, AI_SIDE);
    expect(rules.advantage).toBe(0);
    expect(rules.scoreLabel(PLAYER_SIDE)).toBe('40');
  });

  it('conclut le jeu sur deux points consecutifs apres egalite', () => {
    const rules = new Rules();
    egalite(rules);
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

  it('change de carre a chaque point et revient au bout de deux', () => {
    const rules = new Rules();
    const premier = rules.serveBox;
    winPoint(rules, PLAYER_SIDE);
    expect(rules.serveBox).toBe(-premier);
    winPoint(rules, PLAYER_SIDE);
    expect(rules.serveBox).toBe(premier);
  });

  it('vise toujours le carre diagonal du receveur', () => {
    const rules = new Rules();
    // Le carre vise est du cote oppose a celui d'ou part le serveur.
    expect(Math.abs(rules.serveBox)).toBe(1);
    winGame(rules, PLAYER_SIDE);
    expect(rules.server).toBe(AI_SIDE);
    expect(Math.abs(rules.serveBox)).toBe(1);
  });

  it('accepte un service tombe dans le bon carre', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(PLAYER_SIDE);
    expect(rules.onBallEvent(serviceValide(rules))).toBeNull();
    expect(rules.phase).toBe('rally');
    expect(rules.serveAttempt).toBe(1);
  });

  it('compte le rebond du service comme le premier du receveur', () => {
    const rules = new Rules();
    rules.startPoint();
    engage(rules);
    // Sans reprise, un second rebond conclut : le service ne donne pas droit
    // a un rebond supplementaire.
    expect(rules.onBallEvent(ev('floor', AI_SIDE))?.reason).toBe('Double rebond');
  });
});

describe('fautes de service', () => {
  function sert(rules: Rules) {
    rules.startPoint();
    rules.onServe(rules.server);
  }

  it('sanctionne un service dans le mauvais carre', () => {
    const rules = new Rules();
    sert(rules);
    const mauvais = ev('floor', -rules.server, pos(-rules.serveBox * 2, -rules.server * 4));
    expect(rules.onBallEvent(mauvais)).toBeNull();
    expect(rules.faultReason).toBe('Service hors du carre');
    expect(rules.serveAttempt).toBe(2);
    expect(rules.phase).toBe('serve');
    // Une faute simple ne touche pas au score.
    expect(rules.points.get(PLAYER_SIDE)).toBe(0);
    expect(rules.points.get(AI_SIDE)).toBe(0);
  });

  it('sanctionne un service trop long', () => {
    const rules = new Rules();
    sert(rules);
    const long = ev('floor', -rules.server, pos(rules.serveBox * 2, -rules.server * (COURT.serviceLine + 1)));
    expect(rules.onBallEvent(long)).toBeNull();
    expect(rules.serveAttempt).toBe(2);
  });

  it('sanctionne un service tombe dans son propre camp', () => {
    const rules = new Rules();
    sert(rules);
    expect(rules.onBallEvent(ev('floor', rules.server, pos(rules.serveBox * 2, rules.server * 4)))).toBeNull();
    expect(rules.serveAttempt).toBe(2);
  });

  it('sanctionne le filet, la vitre et la sortie', () => {
    for (const kind of ['net', 'wall', 'out'] as const) {
      const rules = new Rules();
      sert(rules);
      expect(rules.onBallEvent(ev(kind, AI_SIDE))).toBeNull();
      expect(rules.serveAttempt).toBe(2);
      expect(rules.faultReason).not.toBeNull();
    }
  });

  it('donne le point au receveur sur double faute', () => {
    const rules = new Rules();
    sert(rules);
    rules.onBallEvent(ev('net', AI_SIDE));
    expect(rules.serveAttempt).toBe(2);
    rules.onServe(rules.server);
    expect(rules.onBallEvent(ev('net', AI_SIDE))).toEqual({
      winner: AI_SIDE,
      reason: 'Double faute',
    });
    expect(rules.points.get(AI_SIDE)).toBe(1);
  });

  it('efface la faute et repart a la premiere balle au point suivant', () => {
    const rules = new Rules();
    sert(rules);
    rules.onBallEvent(ev('net', AI_SIDE));
    expect(rules.serveAttempt).toBe(2);
    rules.startPoint();
    expect(rules.serveAttempt).toBe(1);
    expect(rules.faultReason).toBeNull();
  });

  it('laisse la deuxieme balle sauver le point', () => {
    const rules = new Rules();
    sert(rules);
    rules.onBallEvent(ev('net', AI_SIDE));
    rules.onServe(rules.server);
    expect(rules.onBallEvent(serviceValide(rules))).toBeNull();
    expect(rules.phase).toBe('rally');
  });
});

describe('fautes pendant l echange', () => {
  it('donne le point a l adversaire sur balle au filet', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    expect(rules.onBallEvent(ev('net', AI_SIDE))).toEqual({
      winner: AI_SIDE,
      reason: 'Dans le filet !',
    });
    expect(rules.phase).toBe('point');
  });

  it('donne le point a l adversaire sur balle sortie', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    expect(rules.onBallEvent(ev('out', AI_SIDE))?.winner).toBe(AI_SIDE);
  });

  it('sanctionne le rebond dans son propre camp', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    expect(rules.onBallEvent(ev('floor', PLAYER_SIDE))).toEqual({
      winner: AI_SIDE,
      reason: 'Rebond dans son camp',
    });
  });

  it('laisse le premier rebond adverse sans consequence', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    expect(rules.onBallEvent(ev('floor', AI_SIDE))).toBeNull();
    expect(rules.phase).toBe('rally');
  });

  it('conclut au deuxieme rebond adverse', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    rules.onBallEvent(ev('floor', AI_SIDE));
    expect(rules.onBallEvent(ev('floor', AI_SIDE))).toEqual({
      winner: PLAYER_SIDE,
      reason: 'Double rebond',
    });
  });

  it('n arbitre plus rien une fois le point conclu', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    rules.onBallEvent(ev('net', AI_SIDE));
    expect(rules.onBallEvent(ev('out', AI_SIDE))).toBeNull();
    expect(rules.points.get(AI_SIDE)).toBe(1);
  });
});

// Ce qui distingue le padel du tennis : la balle frappee doit toucher le sol
// adverse avant toute vitre, mais apres ce rebond les parois sont en jeu.
describe('jeu au mur', () => {
  it('sanctionne la vitre touchee avant le rebond au sol', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    expect(rules.onBallEvent(ev('wall', AI_SIDE))).toEqual({
      winner: AI_SIDE,
      reason: 'Vitre avant le rebond',
    });
  });

  it('sanctionne la vitre de son propre camp apres la frappe', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    expect(rules.onBallEvent(ev('wall', PLAYER_SIDE))).toEqual({
      winner: AI_SIDE,
      reason: 'Vitre de son propre camp',
    });
  });

  it('laisse le jeu continuer sur une vitre touchee apres le rebond', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    expect(rules.onBallEvent(ev('floor', AI_SIDE))).toBeNull();
    expect(rules.onBallEvent(ev('wall', AI_SIDE))).toBeNull();
    expect(rules.phase).toBe('rally');
  });

  it('autorise plusieurs vitres d affilee apres le rebond', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    rules.onBallEvent(ev('floor', AI_SIDE));
    for (let i = 0; i < 4; i += 1) expect(rules.onBallEvent(ev('wall', AI_SIDE))).toBeNull();
    expect(rules.phase).toBe('rally');
  });

  it('conclut quand meme au deuxieme rebond au sol apres une vitre', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    rules.onBallEvent(ev('floor', AI_SIDE));
    rules.onBallEvent(ev('wall', AI_SIDE));
    expect(rules.onBallEvent(ev('floor', AI_SIDE))).toEqual({
      winner: PLAYER_SIDE,
      reason: 'Double rebond',
    });
  });

  it('redemande un rebond au sol apres la frappe du defenseur', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    rules.onBallEvent(ev('floor', AI_SIDE));
    rules.onBallEvent(ev('wall', AI_SIDE));
    expect(rules.onHit(AI_SIDE)).toBe(true);
    expect(rules.onBallEvent(ev('wall', PLAYER_SIDE))).toEqual({
      winner: PLAYER_SIDE,
      reason: 'Vitre avant le rebond',
    });
  });

  // Une vitre pendant le service est faute, meme apres un rebond au sol :
  // c'est le rebond dans le carre qui doit venir en premier.
  it('reste une faute de service tant que le service n est pas valide', () => {
    const rules = new Rules();
    rules.startPoint();
    rules.onServe(rules.server);
    expect(rules.onBallEvent(ev('wall', AI_SIDE))).toBeNull();
    expect(rules.serveAttempt).toBe(2);
  });
});

describe('droit de frapper', () => {
  it('refuse le contact au camp qui vient de frapper', () => {
    const rules = new Rules();
    enEchange(rules, PLAYER_SIDE);
    expect(rules.canHit(PLAYER_SIDE)).toBe(false);
    expect(rules.canHit(AI_SIDE)).toBe(true);
  });

  it('rend la main a l adversaire apres sa frappe', () => {
    const rules = new Rules();
    enEchange(rules, AI_SIDE);
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
    enEchange(rules, PLAYER_SIDE);
    rules.onBallEvent(ev('net', AI_SIDE));
    expect(rules.phase).toBe('point');
    expect(rules.canHit(AI_SIDE)).toBe(false);
    expect(rules.canHit(PLAYER_SIDE)).toBe(false);
  });

  it('reste d accord avec onHit dans toutes les phases', () => {
    for (const side of [PLAYER_SIDE, AI_SIDE]) {
      for (const mise of [
        (r: Rules) => r.startPoint(),
        (r: Rules) => enEchange(r, PLAYER_SIDE),
        (r: Rules) => enEchange(r, AI_SIDE),
        (r: Rules) => { enEchange(r, PLAYER_SIDE); r.onBallEvent(ev('net', AI_SIDE)); },
      ]) {
        const rules = new Rules();
        mise(rules);
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
    enEchange(rules, AI_SIDE);
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

  // Le point decisif doit se terminer normalement : c'est pendant cette phase
  // que la boucle de jeu joue le ralenti puis affiche la banniere de fin.
  it('laisse le point decisif se conclure avant de finir le match', () => {
    const rules = new Rules();
    winGame(rules, AI_SIDE);
    winGame(rules, AI_SIDE);
    winGame(rules, AI_SIDE);
    expect(rules.phase).toBe('point');
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
    expect(rules.serveAttempt).toBe(1);
    expect(rules.matchWinner).toBe(0);
  });
});
