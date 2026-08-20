const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: #0d1b12; }
#app { position: fixed; inset: 0; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.hud {
  position: fixed; inset: 0; pointer-events: none;
  font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
  color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,.5);
}
.score {
  position: absolute; top: max(12px, env(safe-area-inset-top)); left: 50%;
  transform: translateX(-50%);
  display: flex; gap: 10px; align-items: center;
  background: rgba(10,24,18,.62); border: 2px solid rgba(255,255,255,.18);
  border-radius: 999px; padding: 8px 18px; backdrop-filter: blur(6px);
}
.score .side { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.dot { width: 12px; height: 12px; border-radius: 50%; }
.pts { font-size: 26px; font-weight: 800; min-width: 46px; text-align: center; }
.games { opacity: .75; font-size: 13px; }
.sep { opacity: .4; }
.banner {
  position: absolute; top: 30%; left: 50%; transform: translate(-50%, -50%);
  text-align: center; opacity: 0; transition: opacity .18s ease;
}
.banner.show { opacity: 1; }
.banner h1 { margin: 0; font-size: clamp(28px, 7vw, 62px); font-weight: 900; letter-spacing: -.02em; }
.banner p { margin: 6px 0 0; font-size: clamp(13px, 3vw, 19px); opacity: .9; }
.hint {
  position: absolute; bottom: max(14px, env(safe-area-inset-bottom)); left: 50%;
  transform: translateX(-50%); font-size: 13px; opacity: .72; text-align: center;
  line-height: 1.5; white-space: nowrap;
}
.charge {
  position: absolute; bottom: 58px; left: 50%; transform: translateX(-50%);
  width: 160px; height: 7px; border-radius: 4px; background: rgba(0,0,0,.4);
  overflow: hidden; opacity: 0; transition: opacity .1s;
}
.charge.show { opacity: 1; }
.charge i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,#dcff4f,#ff8a3a); }
@media (pointer: coarse) { .hint { display: none; } }
`;

export class Hud {
  private ptsP!: HTMLElement;
  private ptsA!: HTMLElement;
  private gamesEl!: HTMLElement;
  private banner!: HTMLElement;
  private bannerTitle!: HTMLElement;
  private bannerSub!: HTMLElement;
  private chargeBar!: HTMLElement;
  private chargeFill!: HTMLElement;

  constructor(root: HTMLElement, colors: { player: number; ai: number }) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
    const layer = document.createElement('div');
    layer.className = 'hud';
    layer.innerHTML = `
      <div class="score">
        <span class="side"><i class="dot" style="background:${hex(colors.player)}"></i>TOI</span>
        <span class="pts" data-p>0</span><span class="sep">-</span><span class="pts" data-a>0</span>
        <span class="side">IA<i class="dot" style="background:${hex(colors.ai)}"></i></span>
        <span class="games" data-g>Jeux 0-0</span>
      </div>
      <div class="banner"><h1></h1><p></p></div>
      <div class="charge"><i></i></div>
      <div class="hint">ZQSD / WASD deplacer et viser &nbsp;·&nbsp; ESPACE frapper (maintenir = puissance) &nbsp;·&nbsp; MAJ lob &nbsp;·&nbsp; E smash</div>
    `;
    root.appendChild(layer);

    this.ptsP = layer.querySelector('[data-p]')!;
    this.ptsA = layer.querySelector('[data-a]')!;
    this.gamesEl = layer.querySelector('[data-g]')!;
    this.banner = layer.querySelector('.banner')!;
    this.bannerTitle = layer.querySelector('.banner h1')!;
    this.bannerSub = layer.querySelector('.banner p')!;
    this.chargeBar = layer.querySelector('.charge')!;
    this.chargeFill = layer.querySelector('.charge i')!;
  }

  setScore(player: string, ai: string, gamesPlayer: number, gamesAi: number) {
    this.ptsP.textContent = player;
    this.ptsA.textContent = ai;
    this.gamesEl.textContent = `Jeux ${gamesPlayer}-${gamesAi}`;
  }

  showBanner(title: string, sub = '') {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.banner.classList.add('show');
  }

  hideBanner() {
    this.banner.classList.remove('show');
  }

  setCharge(ratio: number) {
    this.chargeBar.classList.toggle('show', ratio > 0.02);
    this.chargeFill.style.width = `${Math.min(1, ratio) * 100}%`;
  }
}
