import * as THREE from 'three';
import { initPhysics, FIXED_DT, type World } from '../core/physics';
import { createStage, buildCourt } from '../core/scene';
import { Input } from '../core/input';
import { Sfx } from '../core/audio';
import { Hud } from '../ui/hud';
import { AI_SIDE, COURT, PALETTE, PLAYER_SIDE } from '../core/constants';
import { Ball } from './ball';
import { Character, ballisticVelocity } from './character';
import { Rules } from './rules';
import { Ai } from './ai';

const _v = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _look = new THREE.Vector3();

export class Game {
  private world!: World;
  stage!: ReturnType<typeof createStage>;
  ball!: Ball;
  player!: Character;
  opponent!: Character;
  rules = new Rules();
  private ai = new Ai();
  private input: Input;
  private hud: Hud;
  private sfx = new Sfx();

  private accumulator = 0;
  private last = 0;
  private pointTimer = 0;
  private rallyTimer = 0;
  private slowmo = 1;

  constructor(private container: HTMLElement) {
    this.input = new Input(container);
    this.hud = new Hud(container, { player: PALETTE.joueur, ai: PALETTE.ia });
  }

  async start() {
    this.world = await initPhysics();
    this.stage = createStage(this.container);
    buildCourt(this.stage.scene, this.world);

    this.ball = new Ball(this.world, this.stage.scene);
    this.player = new Character(this.world, this.stage.scene, PLAYER_SIDE, PALETTE.joueur);
    this.opponent = new Character(this.world, this.stage.scene, AI_SIDE, PALETTE.ia);

    // Poignee de debogage, utilisee par le test de fumee (scripts/smoke.mjs).
    (window as unknown as Record<string, unknown>).__padel = this;
    this.newPoint();
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private newPoint() {
    this.rules.startPoint();
    this.player.respawn();
    this.opponent.respawn();
    this.rallyTimer = 0;
    this.slowmo = 1;
    const s = this.rules.server;
    this.ball.reset(new THREE.Vector3(s * 1.2, 1.4, s * 7.2));
    this.hud.showBanner(
      s === PLAYER_SIDE ? 'A TOI DE SERVIR' : 'SERVICE ADVERSE',
      s === PLAYER_SIDE ? 'Espace pour engager' : '',
    );
    if (s === AI_SIDE) this.pointTimer = 1.1;
  }

  private serve(side: number) {
    const from = new THREE.Vector3(side * 1.2, 1.2, side * 7.0);
    // Le service doit retomber dans le carre adverse : trajectoire resolue.
    const target = new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(COURT.halfWidth * 1.2),
      0,
      -side * 4.5,
    );
    this.ball.reset(from);
    this.ball.launch(ballisticVelocity(from, target, 2.4));
    this.rules.onServe(side);
    this.hud.hideBanner();
    this.sfx.hit(0.7);
    this.rallyTimer = 0;
  }

  private loop = (now: number) => {
    requestAnimationFrame(this.loop);
    const raw = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.accumulator += raw * this.slowmo;

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 5) {
      this.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps += 1;
    }

    this.ball.sync();
    this.player.sync();
    this.opponent.sync();
    this.updateCamera(raw);
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  };

  private fixedUpdate(dt: number) {
    const input = this.input.poll();
    this.hud.setCharge(this.chargeRatio());

    if (this.rules.phase === 'match') {
      if (input.swing) {
        this.input.consumeSwing();
        this.rules.reset();
        this.newPoint();
      }
      this.world.step();
      return;
    }

    if (this.rules.phase === 'serve') {
      if (this.rules.server === PLAYER_SIDE) {
        if (input.swing) {
          this.input.consumeSwing();
          this.serve(PLAYER_SIDE);
        }
      } else {
        this.pointTimer -= dt;
        if (this.pointTimer <= 0) this.serve(AI_SIDE);
      }
    }

    if (this.rules.phase === 'point') {
      this.pointTimer -= dt;
      if (this.pointTimer <= 0.8) this.slowmo = 1;
      if (this.pointTimer <= 0) {
        if (this.rules.matchWinner !== 0) {
          const won = this.rules.matchWinner === PLAYER_SIDE;
          this.hud.showBanner(won ? 'MATCH GAGNE !' : 'MATCH PERDU', 'Espace pour rejouer');
          this.rules.phase = 'match';
        } else {
          this.newPoint();
        }
      }
    }

    this.updatePlayer(dt, input);
    this.updateOpponent(dt);

    this.world.step();

    for (const ev of this.ball.step(dt)) {
      if (ev.kind === 'floor') this.sfx.bounce();
      if (ev.kind === 'net') this.sfx.wall();
      const outcome = this.rules.onBallEvent(ev);
      if (outcome) this.concludePoint(outcome.winner, outcome.reason);
    }

    // Securite : si personne ne touche la balle pendant longtemps, on tranche.
    if (this.rules.phase === 'rally') {
      this.rallyTimer += dt;
      if (this.rallyTimer > 14) {
        const outcome = this.rules.timeout();
        this.concludePoint(outcome.winner, outcome.reason);
      }
    }

    this.hud.setScore(
      this.rules.scoreLabel(PLAYER_SIDE),
      this.rules.scoreLabel(AI_SIDE),
      this.rules.games.get(PLAYER_SIDE)!,
      this.rules.games.get(AI_SIDE)!,
    );
  }

  private chargeRatio(): number {
    return 0;
  }

  private updatePlayer(dt: number, input: ReturnType<Input['poll']>) {
    const pos = this.player.position();
    const ballPos = this.ball.position();
    // L'avant du personnage est son -z local : d'ou les signes inverses.
    const facing = Math.atan2(pos.x - ballPos.x, pos.z - ballPos.z);

    if (input.swing && this.rules.phase === 'rally') {
      this.input.consumeSwing();
      const kind = input.smash && ballPos.y > 1.9 ? 'smash' : input.lob ? 'lob' : 'plat';
      // On vise le fond du camp adverse, decale par la position laterale du joueur.
      const target = _v.set(
        THREE.MathUtils.clamp(-pos.x * 0.8, -COURT.halfWidth + 1, COURT.halfWidth - 1),
        0,
        kind === 'lob' ? -8.5 : kind === 'smash' ? -4 : -6.5,
      );
      this.player.swing(kind, target, input.charge || 1);
    }

    const hit = this.player.update(dt, input.move, facing, this.ball);
    if (hit) this.registerHit(PLAYER_SIDE, hit.power);
  }

  private updateOpponent(dt: number) {
    const decision = this.ai.decide(this.opponent, this.ball, dt);
    if (decision.swing && this.rules.phase === 'rally') {
      this.opponent.swing(decision.swing.kind, decision.swing.aim, decision.swing.charge);
    }
    const hit = this.opponent.update(dt, decision.move, decision.facing, this.ball);
    if (hit) this.registerHit(AI_SIDE, hit.power);
  }

  private registerHit(side: number, power: number) {
    if (!this.rules.onHit(side)) return;
    this.sfx.hit(power);
    this.rallyTimer = 0;
  }

  private concludePoint(winner: number, reason: string) {
    this.sfx.point();
    this.pointTimer = 2.2;
    this.slowmo = 0.35;
    // Le perdant du point s'ecroule : la sanction est visuelle.
    const loser = winner === PLAYER_SIDE ? this.opponent : this.player;
    loser.ragdoll.collapse(1.6);
    this.sfx.fall();
    this.hud.showBanner(winner === PLAYER_SIDE ? 'POINT POUR TOI' : 'POINT ADVERSE', reason);
  }

  /** Camera 3e personne, derriere le joueur, qui garde la balle dans le cadre. */
  private updateCamera(dt: number) {
    const p = this.player.position(_camTarget);
    const b = this.ball.position(_look);
    // On garde la camera dans un couloir etroit : elle suit le joueur sans
    // jamais sortir derriere la vitre du fond, ou le court devient illisible.
    const desired = _v.set(
      THREE.MathUtils.clamp(p.x * 0.45 + b.x * 0.15, -3.2, 3.2),
      4.6 + Math.max(0, b.y - 2) * 0.3,
      THREE.MathUtils.clamp(p.z * 0.55 + 7.4, 9.5, 13),
    );
    this.stage.camera.position.lerp(desired, Math.min(1, dt * 4));
    const look = _look.set(
      THREE.MathUtils.clamp((p.x + b.x) / 2, -3, 3),
      1.2 + Math.min(b.y, 5) * 0.2,
      THREE.MathUtils.clamp((p.z + b.z) / 2 - 1.5, -6, 6),
    );
    this.stage.camera.lookAt(look);
  }
}
