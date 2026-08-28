import * as THREE from 'three';
import { initPhysics, FIXED_DT, type World } from '../core/physics';
import { createStage, buildCourt, buildStadium } from '../core/scene';
import { Input } from '../core/input';
import { Sfx } from '../core/audio';
import { Hud } from '../ui/hud';
import { AI_SIDE, PALETTE, PLAYER_SIDE, doublesHomePosition } from '../core/constants';
import { Ball } from './ball';
import { Character } from './character';
import { ballisticVelocity } from './trajectory';
import { Rules } from './rules';
import { Ai } from './ai';
import { aimPoint } from './aim';
import { randSpread, seedRandom } from '../core/random';
import { ImpactFlash, LandingMarker } from './effects';

const _v = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _look = new THREE.Vector3();

export class Game {
  private world!: World;
  stage!: ReturnType<typeof createStage>;
  ball!: Ball;
  /** Equipe du joueur humain (index 0 = humain, 1 = partenaire IA). */
  teamPlayer: Character[] = [];
  /** Equipe adverse (deux IA). */
  teamAi: Character[] = [];
  /** Raccourci vers le joueur humain (compat simulateur). */
  get player() { return this.teamPlayer[0]; }
  /** Raccourci vers le premier adversaire (compat simulateur). */
  get opponent() { return this.teamAi[0]; }
  rules = new Rules();
  private aiOpponents: Ai[] = [new Ai(0.5, 0, 0), new Ai(0.5, 1, 2.1)];
  private aiPartner: Ai = new Ai(0.45, 1, 1.3);
  private marker!: LandingMarker;
  private flash!: ImpactFlash;
  private input: Input;
  private hud: Hud;
  private sfx = new Sfx();

  /**
   * Pilote automatique du joueur. Renseigne, le camp du joueur est joue par
   * une IA : c'est ce qui permet au simulateur de faire tourner des matchs
   * complets sans personne au clavier.
   */
  autoPlayer: Ai | null = null;

  private running = true;
  private accumulator = 0;
  private last = 0;
  private pointTimer = 0;
  /** Delai avant l'engagement du pilote automatique. */
  private serveTimer = 1.1;
  private rallyTimer = 0;
  private slowmo = 1;

  constructor(private container: HTMLElement) {
    this.input = new Input(container);
    this.hud = new Hud(container, {
      player: PALETTE.joueur,
      partner: PALETTE.partenaire,
      ai: PALETTE.ia,
    });
  }

  async start() {
    this.world = await initPhysics();
    this.stage = createStage(this.container);
    buildCourt(this.stage.scene, this.world);
    buildStadium(this.stage.scene);

    this.ball = new Ball(this.world, this.stage.scene);
    this.marker = new LandingMarker(this.stage.scene);
    this.flash = new ImpactFlash(this.stage.scene);

    this.teamPlayer = [
      new Character(this.world, this.stage.scene, PLAYER_SIDE, PALETTE.joueur, 0),
      new Character(this.world, this.stage.scene, PLAYER_SIDE, PALETTE.partenaire, 1),
    ];
    this.teamAi = [
      new Character(this.world, this.stage.scene, AI_SIDE, PALETTE.ia, 0),
      new Character(this.world, this.stage.scene, AI_SIDE, PALETTE.ia2, 1),
    ];

    // Poignee de debogage, utilisee par le test de fumee (scripts/smoke.mjs).
    (window as unknown as Record<string, unknown>).__padel = this;
    this.newPoint();
    this.last = performance.now();
    // Une premiere image est rendue avant de rendre la main : l'ecran de
    // chargement ne s'efface ainsi jamais sur un canvas encore vide.
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
    requestAnimationFrame(this.loop);

    // Mode simulation : la boucle ne doit avancer le monde d'aucune image avant
    // que le simulateur prenne la main. Le nombre d'images ecoulees varierait
    // d'une execution a l'autre, et l'etat du solveur avec — une meme graine
    // ne rejouerait alors pas la meme partie.
    if (new URLSearchParams(location.search).has('sim')) this.stop();
  }

  private allCharacters(): Character[] {
    return [...this.teamPlayer, ...this.teamAi];
  }

  private teamOf(side: number): Character[] {
    return side === PLAYER_SIDE ? this.teamPlayer : this.teamAi;
  }

  /** Joueur qui sert dans l'equipe en cours. */
  private serverChar(): Character {
    const team = this.teamOf(this.rules.server);
    return team[this.rules.servePlayerIndex];
  }

  private newPoint() {
    this.rules.startPoint();
    for (const c of this.allCharacters()) c.respawn();
    this.positionForServe();
    this.rallyTimer = 0;
    this.slowmo = 1;
    const s = this.rules.server;
    const serveX = -this.rules.serveBox * 1.4;
    this.ball.reset(new THREE.Vector3(serveX, 1.4, s * 7.2));
    this.hud.showBanner(
      s === PLAYER_SIDE ? 'A TOI DE SERVIR' : 'SERVICE ADVERSE',
      s === PLAYER_SIDE ? 'Espace pour engager' : '',
    );
    this.marker.hide();
    if (s === AI_SIDE) this.pointTimer = 1.1;
  }

  /** Place chaque joueur sur son poste au debut du point. */
  private positionForServe() {
    const box = this.rules.serveBox;
    const serverSide = this.rules.server;
    for (const c of this.allCharacters()) {
      if (c.side === serverSide && c.index === this.rules.servePlayerIndex) {
        const x = c.index === 0 ? -box * 1.4 : box * 1.4;
        c.respawn(new THREE.Vector3(x, 0, c.side * 7.0));
      } else if (c.side === serverSide) {
        const [x, y, z] = doublesHomePosition(c.side, 1);
        c.respawn(new THREE.Vector3(x, y, z));
      } else if (c.index === 0) {
        c.respawn(new THREE.Vector3(box * 1.4, 0, c.side * 8.2));
      } else {
        const [x, y, z] = doublesHomePosition(c.side, 1);
        c.respawn(new THREE.Vector3(x, y, z));
      }
    }
  }

  private serve(side: number) {
    const box = this.rules.serveBox;
    const srv = this.serverChar();
    const serveX = srv.index === 0 ? -box * 1.4 : box * 1.4;
    const from = new THREE.Vector3(serveX, 1.2, side * 7.0);
    const attaque = this.rules.serveAttempt === 1;
    const erreur = attaque ? 1.4 : 0.6;
    const target = new THREE.Vector3(
      box * (attaque ? 3.6 : 2.2) + randSpread(erreur),
      0,
      -side * (attaque ? 6.3 : 4.4) + randSpread(erreur),
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
    const serveX = -this.rules.serveBox * 1.4;
    this.ball.reset(new THREE.Vector3(serveX, 1.4, s * 7.2));
    this.sfx.wall();
    this.hud.showBanner('FAUTE', `${this.rules.faultReason} — deuxieme balle`);
    this.rallyTimer = 0;
    this.pointTimer = 1.4;
  }

  /**
   * Avance la simulation d'un pas fixe, sans rendu ni horloge murale. C'est le
   * point d'entree du simulateur : il permet de jouer des milliers de points
   * bien plus vite que le temps reel.
   */
  step(dt = FIXED_DT) {
    this.fixedUpdate(dt);
  }

  /** Arrete la boucle de rendu. Le jeu reste avancable via `step()`. */
  stop() {
    this.running = false;
  }

  /**
   * Bascule en mode simulation : les deux camps sont joues par l'IA, l'aleatoire
   * est reproductible et le rendu est coupe. Point d'entree de `npm run sim`.
   */
  simulate(seed: number, difficulty = 0.5, difficultyIA = 0.5) {
    seedRandom(seed);
    this.autoPlayer = new Ai(difficulty, 0, 0);
    this.aiOpponents = [new Ai(difficultyIA, 0, 0), new Ai(difficultyIA, 1, 2.1)];
    this.aiPartner = new Ai(difficulty * 0.9, 1, 1.3);
    this.stop();
    this.rules.reset();
    this.newPoint();
  }

  private loop = (now: number) => {
    if (!this.running) return;
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
    for (const c of this.allCharacters()) c.sync();
    this.updateCamera(raw);
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  };

  /**
   * Traduit une decision d'IA en etat d'entree. On ne court-circuite pas
   * `updatePlayer` : le pilote automatique emprunte exactement le chemin du
   * joueur humain, visee comprise, sinon le simulateur mesurerait autre chose
   * que ce que l'on joue.
   */
  private autoInput(): ReturnType<Input['poll']> {
    const s = this.input.state;
    s.swing = false;
    s.lob = false;
    s.smash = false;
    s.charge = 1;
    s.chargeRatio = 0;

    // Le simulateur enchaine les matchs : on relance sans attendre personne.
    if (this.rules.phase === 'match') {
      s.swing = true;
      return s;
    }

    if (this.rules.phase === 'serve' && this.rules.server === PLAYER_SIDE) {
      this.serveTimer -= FIXED_DT;
      if (this.serveTimer <= 0) s.swing = true;
      s.move.set(0, 0, 0);
      return s;
    }
    this.serveTimer = 1.1;

    this.player.speed = this.autoPlayer!.moveSpeed;
    const d = this.autoPlayer!.decide(this.player, this.teamAi, this.ball, FIXED_DT, [this.teamPlayer[1]]);
    s.move.copy(d.move);
    if (d.swing) {
      s.swing = true;
      s.lob = d.swing.kind === 'lob';
      s.smash = d.swing.kind === 'smash';
      s.charge = d.swing.charge;
    }
    return s;
  }

  private fixedUpdate(dt: number) {
    const input = this.autoPlayer ? this.autoInput() : this.input.poll();
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
    if (this.rules.phase === 'rally') {
      this.updatePartner(dt);
      this.updateOpponents(dt);
    } else {
      // Pendant le service ou la celebration, les IA restent sur leur poste.
      this.holdAi(this.teamPlayer[1], dt);
      for (const opp of this.teamAi) this.holdAi(opp, dt);
    }

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

  private holdAi(char: Character, dt: number) {
    const pos = char.position();
    const ballPos = this.ball.position();
    const facing = Math.atan2(pos.x - ballPos.x, pos.z - ballPos.z);
    char.update(dt, _v.set(0, 0, 0), facing, this.ball, false);
  }

  private updatePlayer(dt: number, input: ReturnType<Input['poll']>) {
    this.updateCharacter(this.player, dt, input.move, input, true);
  }

  private updatePartner(dt: number) {
    const partner = this.teamPlayer[1];
    partner.speed = this.aiPartner.moveSpeed;
    const decision = this.aiPartner.decide(partner, this.teamAi, this.ball, dt, [this.teamPlayer[0]]);
    if (decision.swing && this.rules.canHit(PLAYER_SIDE)) {
      partner.swing(decision.swing.kind, decision.swing.aim, decision.swing.charge);
    }
    const hit = partner.update(
      dt, decision.move, decision.facing, this.ball, this.rules.canHit(PLAYER_SIDE),
    );
    if (hit) this.registerHit(PLAYER_SIDE, hit.power, hit.position);
  }

  private updateOpponents(dt: number) {
    for (let i = 0; i < this.teamAi.length; i++) {
      const opp = this.teamAi[i];
      opp.speed = this.aiOpponents[i].moveSpeed;
      const mates = this.teamAi.filter((_, j) => j !== i);
      const decision = this.aiOpponents[i].decide(opp, this.teamPlayer, this.ball, dt, mates);
      if (decision.swing && this.rules.canHit(AI_SIDE)) {
        opp.swing(decision.swing.kind, decision.swing.aim, decision.swing.charge);
      }
      const hit = opp.update(
        dt, decision.move, decision.facing, this.ball, this.rules.canHit(AI_SIDE),
      );
      if (hit) this.registerHit(AI_SIDE, hit.power, hit.position);
    }
  }

  private updateCharacter(
    char: Character,
    dt: number,
    move: THREE.Vector3,
    input: ReturnType<Input['poll']>,
    isHuman: boolean,
  ) {
    const pos = char.position();
    const ballPos = this.ball.position();
    const facing = Math.atan2(pos.x - ballPos.x, pos.z - ballPos.z);

    if (isHuman && input.swing && this.rules.phase === 'rally') {
      this.input.consumeSwing();
      const kind = input.smash && ballPos.y > 1.9 ? 'smash' : input.lob ? 'lob' : 'plat';
      const target = aimPoint(kind, input.move, PLAYER_SIDE, _v);
      char.swing(kind, target, input.charge);
    }

    const hit = char.update(
      dt, move, facing, this.ball, this.rules.canHit(char.side),
    );
    if (hit) this.registerHit(char.side, hit.power, hit.position);
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
    // L'equipe perdante s'ecroule : la sanction est visuelle.
    const losers = this.teamOf(-winner);
    for (const c of losers) c.ragdoll.collapse(1.6);
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
