import { useState } from 'react';

import { carteDef, type EvenementDef, type OptionEvenement } from '../../engine';

interface Props {
  evenement: EvenementDef;
  onChoisir: (opt: OptionEvenement) => void;
}

/**
 * La semaine entre deux matchs.
 *
 * C'est le seul vrai argument de superiorite du concept (brief 3.2) : chez les
 * references, ces dilemmes ne bougent que des statistiques invisibles. Ici, la
 * consequence est ecrite noir sur blanc AVANT le choix, et elle entre
 * physiquement dans le paquet de cartes que tu tiendras samedi.
 */
export function Evenement({ evenement, onChoisir }: Props): JSX.Element {
  const [choix, setChoix] = useState<string | null>(null);
  const retenu = evenement.options.find((o) => o.id === choix) ?? null;

  return (
    <div className="app">
      <div className="ecran defilable">
        <h1>
          <span className="fin">DANS LA SEMAINE</span>
          {evenement.titre}
        </h1>
        <p>{evenement.situation}</p>

        <div className="choix">
          {evenement.options.map((o) => (
            <button
              key={o.id}
              className={`option${choix === o.id ? ' choisie' : ''}`}
              onClick={() => setChoix(o.id)}
              aria-pressed={choix === o.id}
            >
              <div className="titre">{o.texte}</div>
              <div className="consequence">{o.consequence}</div>
              <div className="sous">
                {(o.ajoute ?? []).map((id) => (
                  <span key={id} className="puce-carte">
                    + {carteDef(id).nom}
                  </span>
                ))}{' '}
                {(o.retire ?? []).length > 0 && (
                  <span className="puce-carte">− une carte qui traine</span>
                )}
                {o.confiance ? (
                  <span className="puce-carte">
                    {o.confiance > 0 ? '+' : ''}
                    {o.confiance} confiance
                  </span>
                ) : null}
                {o.souffleMax ? (
                  <span className="puce-carte">
                    {o.souffleMax > 0 ? '+' : ''}
                    {o.souffleMax} souffle max
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>

        <p className="aide">
          Aucun de ces choix n&rsquo;est le bon. Ils changent seulement ce que tu auras dans les
          mains.
        </p>

        <div className="pied">
          <button
            className="bouton majeur"
            disabled={!retenu}
            onClick={() => retenu && onChoisir(retenu)}
          >
            {retenu ? 'Samedi, coup d’envoi' : 'Fais un choix'}
          </button>
        </div>
      </div>
    </div>
  );
}
