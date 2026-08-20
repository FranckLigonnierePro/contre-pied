import { Game } from './game/game';

const container = document.getElementById('app')!;
new Game(container).start().catch((err) => {
  console.error(err);
  container.innerHTML = `<pre style="color:#fff;padding:24px;font:14px monospace">Erreur au demarrage :\n${err}</pre>`;
});
