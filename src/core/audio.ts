/** Sons synthetises a la volee : aucun asset a charger. */
export class Sfx {
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private blip(freq: number, duration: number, type: OscillatorType, gain = 0.18) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, ctx.currentTime + duration);
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(env).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  hit(power: number) { this.blip(340 + power * 210, 0.09, 'square', 0.2); }
  bounce() { this.blip(220, 0.07, 'triangle', 0.11); }
  wall() { this.blip(150, 0.12, 'sine', 0.13); }
  point() { this.blip(660, 0.28, 'sawtooth', 0.14); }
  fall() { this.blip(90, 0.3, 'sawtooth', 0.16); }
}
