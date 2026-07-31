import { useState } from 'react';

import { TOUS_LES_PROFILS, consigneDef } from '../../engine';

interface Props {
  onJouer: (profil: string, seed: string) => void;
}

/** Seed du jour : tout le monde a le meme match un jour donne. */
export function seedDuJour(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function Accueil({ onJouer }: Props): JSX.Element {
  const [profil, setProfil] = useState(TOUS_LES_PROFILS[0]!.id);
  const [seed, setSeed] = useState(seedDuJour());
  const choisi = TOUS_LES_PROFILS.find((p) => p.id === profil)!;

  return (
    <div className="app">
      <div className="ecran defilable">
        <h1>
          <span className="fin">DECKBUILDER DE CARRIERE</span>
          CONTRE-PIED
        </h1>
        <p>
          Tu joues <b>un joueur</b>, pas un club. L&rsquo;adversaire, ce n&rsquo;est pas
          l&rsquo;equipe d&rsquo;en face : c&rsquo;est le match. Il annonce ce qu&rsquo;il prepare.
          A toi de choisir entre le contrer et faire ton match.
        </p>

        <div className="titre-section">Ton poste</div>
        <div className="choix">
          {TOUS_LES_PROFILS.map((p) => (
            <button
              key={p.id}
              className={`option${p.id === profil ? ' choisie' : ''}`}
              onClick={() => setProfil(p.id)}
              aria-pressed={p.id === profil}
            >
              <div className="titre">
                <span className="numero">{p.numero}</span>
                {p.nom}
              </div>
              <div className="sous">
                {p.poste} — {p.origine}.
              </div>
              <div className="sous">{p.description}</div>
              {p.id === profil && (
                <div className="consequence">{consigneDef(p.consigne).detail}</div>
              )}
            </button>
          ))}
        </div>

        <div className="titre-section">Le tirage</div>
        <div className="champ">
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            aria-label="Tirage de la saison"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="bouton fin" onClick={() => setSeed(`libre-${Date.now()}`)}>
            Autre
          </button>
        </div>
        <p className="aide">
          Deux personnes avec le meme tirage jouent exactement la meme saison : memes adversaires,
          memes annonces, meme gardien. C&rsquo;est ce qui rendra le defi du jour equitable, et les
          scores comparables.
        </p>

        <div className="titre-section">En trois phrases</div>
        <p className="aide">
          Ton <b>souffle</b> paye tes actions et ne se recharge jamais entierement. Ton{' '}
          <b>placement</b> se perd si tu ne l&rsquo;entretiens pas. Ton <b>danger</b> doit depasser
          le chiffre du gardien pour que le ballon rentre — ce chiffre est affiche avant que tu
          tires, toujours.
        </p>

        <div className="pied">
          <button className="bouton majeur" onClick={() => onJouer(profil, seed.trim() || 'libre')}>
            Entrer sur le terrain — {choisi.numero}
          </button>
        </div>
      </div>
    </div>
  );
}
