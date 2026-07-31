import { useState } from 'react';

import { carteDef, consigneDef, libelleObjectif, type EtatMatch } from '../../engine';

interface Props {
  etat: EtatMatch;
  adversaire: string;
  recompenses: string[];
  derniere: boolean;
  onSuite: (carteChoisie: string) => void;
}

/**
 * Feuille de match + choix d'une carte.
 *
 * Le choix de carte est le moment ou le joueur sent que son jeu lui
 * appartient. Il est volontairement court : trois cartes, une phrase chacune,
 * pas d'ecran de gestion.
 */
export function FinMatch({
  etat,
  adversaire,
  recompenses,
  derniere,
  onSuite,
}: Props): JSX.Element {
  const [carte, setCarte] = useState<string | null>(null);
  const issue = etat.issue;
  const consigne = consigneDef(etat.consigne);
  if (!issue) throw new Error('Feuille de match sans issue');

  return (
    <div className="app">
      <div className="ecran defilable">
        <h1>
          <span className="fin">{adversaire}</span>
          {etat.buts} – {etat.butsEncaisses}
        </h1>

        <div className="fiche">
          <div className="note num">
            {issue.note.toFixed(1)}
            <small> / 10</small>
          </div>
          <div className="aide">
            {issue.cause === 'remplace'
              ? 'Sorti avant l’heure. Le coach n’a pas aime.'
              : issue.reussi
                ? 'Consigne tenue. Il t’a vu.'
                : 'Consigne manquee. Il ne dira rien, et c’est pire.'}
          </div>

          <div className="stats">
            <div className="stat">
              <div className="k">Buts</div>
              <div className="v num">{issue.buts}</div>
            </div>
            <div className="stat">
              <div className="k">Frappes</div>
              <div className="v num">{issue.tirsTotal}</div>
            </div>
            <div className="stat">
              <div className="k">Danger cree</div>
              <div className="v num">{issue.dangerCumule}</div>
            </div>
            <div className="stat">
              <div className="k">Encaisses</div>
              <div className="v num">{issue.butsEncaisses}</div>
            </div>
          </div>
        </div>

        <div className="titre-section">La consigne</div>
        <div className="consigne">
          {consigne.objectifs.map((o, i) => (
            <div key={i} className={`item${issue.objectifsAtteints[i] ? ' fait' : ''}`}>
              <span className="puce" />
              {libelleObjectif(o)}
            </div>
          ))}
        </div>

        <div className="titre-section">Ce que tu retiens du match</div>
        <div className="choix">
          {recompenses.map((id) => {
            const def = carteDef(id);
            return (
              <button
                key={id}
                className={`option${carte === id ? ' choisie' : ''}`}
                onClick={() => setCarte(id)}
                aria-pressed={carte === id}
              >
                <div className="titre">
                  <span className="numero">{def.cout}</span>
                  {def.nom}
                </div>
                <div className="sous">{def.texte}</div>
              </button>
            );
          })}
        </div>
        <p className="aide">
          Cette carte entre dans ton jeu pour le reste de la saison. Un jeu qui grossit n&rsquo;est
          pas forcement un jeu qui va mieux.
        </p>

        <div className="pied">
          <button
            className="bouton majeur"
            disabled={carte === null}
            onClick={() => carte && onSuite(carte)}
          >
            {carte === null
              ? 'Choisis une carte'
              : derniere
                ? 'Fin de saison'
                : 'La semaine prochaine'}
          </button>
        </div>
      </div>
    </div>
  );
}
