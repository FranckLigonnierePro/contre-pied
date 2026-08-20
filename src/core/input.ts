import * as THREE from 'three';

export interface InputState {
  move: THREE.Vector3;
  swing: boolean;
  lob: boolean;
  smash: boolean;
  /** Puissance de la frappe relachee, entre CHARGE_MIN et CHARGE_MAX. */
  charge: number;
  /** Charge en cours, de 0 a 1. C'est ce que la jauge du HUD affiche. */
  chargeRatio: number;
}

/** Puissance d'une frappe relachee immediatement. */
export const CHARGE_MIN = 0.7;
/** Puissance d'une frappe chargee a fond. */
export const CHARGE_MAX = 1.5;
/** Duree d'appui, en secondes, pour atteindre la puissance maximale. */
export const CHARGE_FULL = 0.56;
/** Au-dela de cette duree d'appui, un appui tactile devient un lob. */
export const LOB_HOLD = 0.35;

/** Puissance obtenue apres `held` secondes d'appui. */
export function chargeFromHold(held: number): number {
  return CHARGE_MIN + chargeRatioFromHold(held) * (CHARGE_MAX - CHARGE_MIN);
}

/** Avancement de la charge apres `held` secondes d'appui, de 0 a 1. */
export function chargeRatioFromHold(held: number): number {
  if (!(held > 0)) return 0;
  return Math.min(1, held / CHARGE_FULL);
}

/** Clavier (ZQSD/WASD/fleches) + joystick tactile. */
export class Input {
  readonly state: InputState = {
    move: new THREE.Vector3(),
    swing: false,
    lob: false,
    smash: false,
    charge: CHARGE_MIN,
    chargeRatio: 0,
  };

  private keys = new Set<string>();
  private touchOrigin: { x: number; y: number } | null = null;
  private touchId: number | null = null;
  private touchVec = new THREE.Vector2();
  /**
   * Qui charge actuellement. Sans cette distinction, `poll()` prend toute
   * charge en cours pour un appui clavier relache et declenche la frappe des
   * le `touchstart` : sur mobile la charge et le lob deviennent inatteignables.
   */
  private charging: 'clavier' | 'tactile' | null = null;
  private chargingSince = 0;
  /** Lob demande par un appui long tactile, en attente de consommation. */
  private touchLob = false;

  constructor(private container: HTMLElement) {
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.bindTouch();
  }

  private bindTouch() {
    const el = this.container;
    el.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < innerWidth / 2 && this.touchId === null) {
          this.touchId = t.identifier;
          this.touchOrigin = { x: t.clientX, y: t.clientY };
        } else if (t.clientX >= innerWidth / 2) {
          this.beginCharge('tactile');
        }
      }
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.touchId && this.touchOrigin) {
          this.touchVec.set(t.clientX - this.touchOrigin.x, t.clientY - this.touchOrigin.y);
          if (this.touchVec.length() > 60) this.touchVec.setLength(60);
        }
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.touchId) {
          this.touchId = null;
          this.touchOrigin = null;
          this.touchVec.set(0, 0);
        } else if (this.charging === 'tactile') {
          const held = this.endCharge();
          this.state.swing = true;
          this.state.charge = chargeFromHold(held);
          // Un appui long vaut lob : c'est le seul moyen de lober au doigt.
          this.touchLob = held > LOB_HOLD;
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  /** Demarre une charge si aucune autre source ne charge deja. */
  private beginCharge(source: 'clavier' | 'tactile') {
    if (this.charging !== null) return;
    this.charging = source;
    this.chargingSince = performance.now();
  }

  /** Termine la charge en cours et renvoie sa duree, en secondes. */
  private endCharge(): number {
    if (this.charging === null) return 0;
    const held = (performance.now() - this.chargingSince) / 1000;
    this.charging = null;
    this.chargingSince = 0;
    return held;
  }

  /** Duree de la charge en cours, en secondes. 0 si personne ne charge. */
  private heldSeconds(): number {
    if (this.charging === null) return 0;
    return (performance.now() - this.chargingSince) / 1000;
  }

  private has(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  /** A appeler une fois par frame ; consomme les evenements ponctuels. */
  poll(): InputState {
    const s = this.state;
    const x = (this.has('KeyD', 'ArrowRight') ? 1 : 0) - (this.has('KeyA', 'KeyQ', 'ArrowLeft') ? 1 : 0);
    const z = (this.has('KeyS', 'ArrowDown') ? 1 : 0) - (this.has('KeyW', 'KeyZ', 'ArrowUp') ? 1 : 0);
    s.move.set(x + this.touchVec.x / 60, 0, z + this.touchVec.y / 60);
    if (s.move.lengthSq() > 1) s.move.normalize();

    // Le lob clavier suit la touche : sans cela un Maj appuye puis relache
    // sans frapper reste arme et transforme la frappe suivante en lob.
    s.lob = this.touchLob || this.has('ShiftLeft', 'ShiftRight');
    s.smash = this.has('KeyE');

    if (this.has('Space')) {
      this.beginCharge('clavier');
    } else if (this.charging === 'clavier' && !s.swing) {
      s.charge = chargeFromHold(this.endCharge());
      s.swing = true;
    }

    s.chargeRatio = chargeRatioFromHold(this.heldSeconds());
    return s;
  }

  consumeSwing() {
    this.state.swing = false;
    this.state.lob = false;
    this.state.charge = CHARGE_MIN;
    this.touchLob = false;
  }
}
