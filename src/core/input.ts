import * as THREE from 'three';

export interface InputState {
  move: THREE.Vector3;
  swing: boolean;
  lob: boolean;
  smash: boolean;
  charge: number;
}

/** Clavier (ZQSD/WASD/fleches) + joystick tactile. */
export class Input {
  readonly state: InputState = {
    move: new THREE.Vector3(),
    swing: false,
    lob: false,
    smash: false,
    charge: 0,
  };

  private keys = new Set<string>();
  private touchOrigin: { x: number; y: number } | null = null;
  private touchId: number | null = null;
  private touchVec = new THREE.Vector2();
  private chargingSince = 0;

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
          this.chargingSince = performance.now();
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
        } else if (this.chargingSince > 0) {
          const held = (performance.now() - this.chargingSince) / 1000;
          this.chargingSince = 0;
          this.state.swing = true;
          this.state.lob = held > 0.35;
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
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

    s.lob = s.lob || this.has('ShiftLeft', 'ShiftRight');
    s.smash = this.has('KeyE');
    if (this.has('Space')) {
      if (this.chargingSince === 0) this.chargingSince = performance.now();
    } else if (this.chargingSince > 0 && !s.swing) {
      s.charge = Math.min(1.5, 0.7 + (performance.now() - this.chargingSince) / 700);
      this.chargingSince = 0;
      s.swing = true;
    }
    return s;
  }

  consumeSwing() {
    this.state.swing = false;
    this.state.lob = false;
    this.state.charge = 1;
  }
}
