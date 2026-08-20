import { Game } from './game/game';

const container = document.getElementById('app')!;
const chargement = document.getElementById('chargement');

new Game(container)
  .start()
  .then(() => {
    // Le premier rendu a eu lieu : on peut decouvrir le court.
    chargement?.classList.add('parti');
    chargement?.addEventListener('transitionend', () => chargement.remove(), { once: true });
  })
  .catch((err) => {
    console.error(err);
    // Meme presentation que pour une panne de chargement (voir index.html).
    (window as unknown as { __padelPanne?: (raison: unknown) => void }).__padelPanne?.(err);
  });
