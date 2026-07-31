import { useCallback, useRef, useState } from 'react';

import type { EtatMatch } from '../engine';

/**
 * La juice.
 *
 * Le brief (3.4) est net : le budget de polish passe ici et pas dans le rendu.
 * Concretement, tout le retour sensoriel du jeu tient en trois choses, toutes
 * gratuites en DOM : des chiffres qui jaillissent, une secousse d'ecran sur
 * les gros moments, et un empilement qui se lit.
 */

export type CouleurPop = 'or' | 'cyan' | 'rouge' | 'bleu';

export interface Pop {
  id: number;
  texte: string;
  couleur: CouleurPop;
  /** Decalage horizontal en pixels, pour ne pas empiler a l'identique. */
  dx: number;
  retard: number;
}

let compteur = 0;

export function usePops(): {
  pops: Pop[];
  pousser: (texte: string, couleur: CouleurPop) => void;
  popsDeDiff: (avant: EtatMatch, apres: EtatMatch) => void;
  secousse: boolean;
  declencherSecousse: () => void;
} {
  const [pops, setPops] = useState<Pop[]>([]);
  const [secousse, setSecousse] = useState(false);
  const rang = useRef(0);

  const pousser = useCallback((texte: string, couleur: CouleurPop) => {
    const id = ++compteur;
    const i = rang.current++;
    setPops((p) => [...p, { id, texte, couleur, dx: (i % 3) * 26 - 26, retard: (i % 4) * 70 }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1100);
  }, []);

  const declencherSecousse = useCallback(() => {
    setSecousse(true);
    window.setTimeout(() => setSecousse(false), 440);
  }, []);

  /** Traduit un changement d'etat en chiffres qui sortent de l'ecran. */
  const popsDeDiff = useCallback(
    (avant: EtatMatch, apres: EtatMatch) => {
      rang.current = 0;
      const d = apres.jauges.danger - avant.jauges.danger;
      const p = apres.jauges.placement - avant.jauges.placement;
      const c = apres.jauges.confiance - avant.jauges.confiance;
      const s = apres.jauges.souffle - avant.jauges.souffle;
      // Un tir remet le danger a zero : la chute est racontee par l'ecran de
      // tir, pas par un chiffre rouge qui brouillerait le message.
      const tirEnCours = apres.tirsTotal > avant.tirsTotal;
      if (d > 0) pousser(`+${d} danger`, 'or');
      if (!tirEnCours && d < 0) pousser(`${d} danger`, 'rouge');
      if (p !== 0) pousser(`${p > 0 ? '+' : ''}${p} placement`, p > 0 ? 'cyan' : 'rouge');
      if (c !== 0) pousser(`${c > 0 ? '+' : ''}${c} confiance`, c > 0 ? 'cyan' : 'rouge');
      if (s > 0) pousser(`+${s} souffle`, 'bleu');
    },
    [pousser],
  );

  return { pops, pousser, popsDeDiff, secousse, declencherSecousse };
}
