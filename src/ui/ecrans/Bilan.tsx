import { useState } from 'react';

import { bilan, carteDef, profilDef, type EtatSaison } from '../../engine';

interface Props {
  saison: EtatSaison;
  onRejouer: () => void;
}

/**
 * Carte de fin de saison.
 *
 * Le brief pose un gate de viralite (phase 1) : au moins 15 % des runs
 * termines doivent produire un partage spontane. Le texte partage est donc
 * ecrit ici comme un message, pas comme un tableau de statistiques : il doit
 * tenir dans une conversation de groupe et donner envie de repondre.
 */
export function Bilan({ saison, onRejouer }: Props): JSX.Element {
  const [copie, setCopie] = useState(false);
  const b = bilan(saison);
  const p = profilDef(saison.profil);
  const tares = saison.deck.filter((id) => carteDef(id).tags.includes('Tare'));

  const texte = [
    `CONTRE-PIED — ${p.nom} (${p.numero})`,
    `${b.buts} but${b.buts > 1 ? 's' : ''} en ${saison.resultats.length} matchs · note ${b.note}/10`,
    `${b.consignesTenues}/${saison.resultats.length} consignes tenues`,
    tares.length > 0
      ? `Fin de saison avec ${tares.length} carte${tares.length > 1 ? 's' : ''} que je ne peux plus enlever.`
      : 'Fin de saison sans une seule carte parasite. Propre.',
    `Tirage : ${saison.seed}`,
  ].join('\n');

  async function partager(): Promise<void> {
    try {
      if (navigator.share) {
        await navigator.share({ text: texte });
        return;
      }
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2200);
    } catch {
      // L'utilisateur a annule le partage : rien a signaler.
    }
  }

  return (
    <div className="app">
      <div className="ecran defilable">
        <h1>
          <span className="fin">FIN DE SAISON</span>
          {p.nom}
        </h1>

        <div className="fiche">
          <div className="note num">
            {b.note.toFixed(1)}
            <small> / 10 de moyenne</small>
          </div>
          <div className="stats">
            <div className="stat">
              <div className="k">Buts</div>
              <div className="v num">{b.buts}</div>
            </div>
            <div className="stat">
              <div className="k">Encaisses</div>
              <div className="v num">{b.encaisses}</div>
            </div>
            <div className="stat">
              <div className="k">Consignes tenues</div>
              <div className="v num">
                {b.consignesTenues}/{saison.resultats.length}
              </div>
            </div>
            <div className="stat">
              <div className="k">Cartes parasites</div>
              <div className="v num">{b.tares}</div>
            </div>
          </div>
        </div>

        <div className="titre-section">Match par match</div>
        <div className="choix">
          {saison.resultats.map((r, i) => (
            <div key={i} className="option">
              <div className="titre">
                <span className="numero">{r.note.toFixed(1)}</span>
                {saison.adversaires[i]}
              </div>
              <div className="sous">
                {r.buts} – {r.butsEncaisses} · {r.tirsTotal} frappes ·{' '}
                {r.reussi ? 'consigne tenue' : 'consigne manquee'}
              </div>
            </div>
          ))}
        </div>

        <div className="titre-section">Ton jeu a la fin</div>
        <div className="liste-deck">
          {saison.deck.map((id, i) => {
            const d = carteDef(id);
            return (
              <span key={`${id}-${i}`} className={`puce-carte${d.tags.includes('Tare') ? ' tare' : ''}`}>
                {d.nom}
              </span>
            );
          })}
        </div>
        <p className="aide">
          {tares.length > 0
            ? 'Les cartes en rouge sont entrees toutes seules. Elles ne partiront pas.'
            : 'Rien n’est entre tout seul dans ton jeu cette saison. Ca n’arrivera pas deux fois.'}
        </p>

        <div className="pied">
          <button className="bouton majeur" onClick={() => void partager()}>
            {copie ? 'Copie — colle-le au groupe' : 'Partager ta saison'}
          </button>
          <button className="bouton" onClick={onRejouer}>
            Une autre saison
          </button>
        </div>
      </div>
    </div>
  );
}
