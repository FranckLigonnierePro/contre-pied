import * as THREE from 'three';
import { initPhysics, FIXED_DT, type World } from '../core/physics';
import { createStage, buildCourt } from '../core/scene';
import { Input } from '../core/input';
import { Sfx } from '../core/audio';
import { Hud } from '../ui/hud';
import { AI_SIDE, PALETTE, PLAYER_SIDE } from '../core/constants';
import { Ball } from './ball';
import { Character } from './character';
import { ballisticVelocity } from './trajectory';
import { Rules } from './rules';
import { Ai } from './ai';
import { aimPoint } from './aim';
import { ImpactFlash, LandingMarker } from './effects';

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
  private marker!: LandingMarker;
  private flash!: ImpactFlash;
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
    this.marker = new LandingMarker(this.stage.scene);
    this.flash = new ImpactFlash(this.stage.scene);
    this.player = new Character(this.world, this.stage.scene, PLAYER_SIDE, PALETTE.joueur);
    this.opponent = new Character(this.world, this.stage.scene, AI_SIDE, PALETTE.ia);

    // Poignee de debogage, utilisee par le test de fumee (scripts/smoke.mjs).
    (window as unknown as Record<string, unknown>).__padel = this;
    this.newPoint();
    this.last = performance.now();
    // Une premiere image est rendue avant de rendre la main : l'ecran de
    // chargement ne s'efface ainsi jamais sur un canvas encore vide.
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
    requestAnimationFrame(this.loop);
  }

  private newPoint() {
    this.rules.startPoint();
    this.player.respawn();
    this.opponent.respawn();
    this.rallyTimer = 0;
    this.slowmo = 1;
    const s = this.rules.server;
    // La balle attend le serveur dans le carre d'ou il va engager, qui est
    // l'oppose de celui qu'il vise.
    this.ball.reset(new THREE.Vector3(-this.rules.serveBox * 1.4, 1.4, s * 7.2));
    this.hud.showBanner(
      s === PLAYER_SIDE ? 'A TOI DE SERVIR' : 'SERVICE ADVERSE',
      s === PLAYER_SIDE ? 'Espace pour engager' : '',
    );
    this.marker.hide();
    if (s === AI_SIDE) this.pointTimer = 1.1;
  }

  private serve(side: number) {
    const box = this.rules.serveBox;
    // Le serveur engage depuis le carre oppose a celui qu'il vise.
    const from = new THREE.Vector3(-box * 1.4, 1.2, side * 7.0);
    // Premiere balle : on attaque le fond du carre, quitte a faire faute.
    // Deuxieme : on assure le centre. C'est ce qui rend la double faute rare
    // sans la rendre impossible.
    const attaque = this.rules.serveAttempt === 1;
    const erreur = attaque ? 1.4 : 0.6;
    const target = new THREE.Vector3(
      box * (attaque ? 3.6 : 2.2) + THREE.MathUtils.randFloatSpread(erreur),
      0,
      -side * (attaque ? 6.3 : 4.4) + THREE.MathUtils.randFloatSpread(erreur),
    );
    this.ball.reset(from);
    this.ball.launch(ballisticVelocity(from, target, 2.4));
    this.rules.onServe(side);
    this.hud.hideBanner();
    this.sfx.hit(0.7);
    this.rallyTimer = 0;
  }

  /** Premiere faute de service : on remet la balle au serveur pour sa deuxieme. */
  private onServeFault() {
    const s = this.rules.server;
    this.ball.reset(new THREE.Vector3(-this.rules.serveBox * 1.4, 1.4, s * 7.2));
    this.sfx.wall();
    this.hud.showBanner('FAUTE', `${this.rules.faultReason} — deuxieme balle`);
    this.rallyTimer = 0;
    this.pointTimer = 1.4;
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
    this.flash.update(raw);
    if (this.rules.phase === 'rally') {
      this.marker.update(raw, this.ball.position(), this.ball.velocity(), PLAYER_SIDE);
    } else {
      this.marker.hide();
    }
    this.player.sync();
    this.opponent.sync();
    this.updateCamera(raw);
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  };

  private fixedUpdate(dt: number) {
    const input = this.input.poll();
    this.hud.setCharge(input.chargeRatio);

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

    // Le passage de la premiere a la deuxieme balle est le seul signal fiable
    // d'une faute simple : se fier a la phase declencherait une fausse faute au
    // moindre rebond de la balle posee devant le serveur.
    let tentative = this.rules.serveAttempt;
    for (const ev of this.ball.step(dt)) {
      if (ev.kind === 'floor') this.sfx.bounce();
      if (ev.kind === 'net' || ev.kind === 'wall') this.sfx.wall();
      const outcome = this.rules.onBallEvent(ev);
      if (outcome) this.concludePoint(outcome.winner, outcome.reason);
      else if (this.rules.serveAttempt !== tentative) {
        tentative = this.rules.serveAttempt;
        this.onServeFault();
      }
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

  private updatePlayer(dt: number, input: ReturnType<Input['poll']>) {
    const pos = this.player.position();
    const ballPos = this.ball.position();
    // L'avant du personnage est son -z local : d'ou les signes inverses.
    const facing = Math.atan2(pos.x - ballPos.x, pos.z - ballPos.z);

    if (input.swing && this.rules.phase === 'rally') {
      this.input.consumeSwing();
      const kind = input.smash && ballPos.y > 1.9 ? 'smash' : input.lob ? 'lob' : 'plat';
      // La direction tenue au moment de frapper decide ou part la balle.
      const target = aimPoint(kind, input.move, PLAYER_SIDE, _v);
      this.player.swing(kind, target, input.charge);
    }

    // L'arbitre tranche avant le contact : une frappe interdite (deux fois de
    // suite, ou hors echange) ne doit pas deplacer la balle.
    const hit = this.player.update(
      dt, input.move, facing, this.ball, this.rules.canHit(PLAYER_SIDE),
    );
    if (hit) this.registerHit(PLAYER_SIDE, hit.power, hit.position);
  }

  private updateOpponent(dt: number) {
    const decision = this.ai.decide(this.opponent, this.ball, dt);
    if (decision.swing && this.rules.phase === 'rally') {
      this.opponent.swing(decision.swing.kind, decision.swing.aim, decision.swing.charge);
    }
    const hit = this.opponent.update(
      dt, decision.move, decision.facing, this.ball, this.rules.canHit(AI_SIDE),
    );
    if (hit) this.registerHit(AI_SIDE, hit.power, hit.position);
  }

  private registerHit(side: number, power: number, at: THREE.Vector3) {
    if (!this.rules.onHit(side)) return;
    this.sfx.hit(power);
    this.flash.burst(at, power);
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
