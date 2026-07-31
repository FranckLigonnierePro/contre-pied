import { useCallback, useState } from 'react';

import {
  ajouterCarte,
  appliquerOption,
  creerMatch,
  creerSaison,
  enregistrerMatch,
  evenementPour,
  recompensesProposees,
  seedMatch,
  type EtatMatch,
  type EtatSaison,
  type OptionEvenement,
} from '../engine';
import { Accueil } from './ecrans/Accueil';
import { Bilan } from './ecrans/Bilan';
import { Evenement } from './ecrans/Evenement';
import { FinMatch } from './ecrans/FinMatch';
import { Match } from './ecrans/Match';

type Ecran = 'accueil' | 'match' | 'feuille' | 'semaine' | 'bilan';

/**
 * Enchainement des ecrans.
 *
 * Une saison = trois matchs = une session d'une dizaine de minutes, comme le
 * demande le brief (3.3). Entre deux matchs : une carte a choisir, puis un
 * choix hors terrain. Rien d'autre — pas de menu, pas de gestion.
 */
export function App(): JSX.Element {
  const [ecran, setEcran] = useState<Ecran>('accueil');
  const [saison, setSaison] = useState<EtatSaison | null>(null);
  const [etat, setEtat] = useState<EtatMatch | null>(null);

  const lancerMatch = useCallback((s: EtatSaison) => {
    setEtat(
      creerMatch({
        seed: seedMatch(s, s.match),
        profil: s.profil,
        deck: s.deck,
        confianceDepart: s.confiance,
        souffleMaxDepart: s.souffleMax,
      }),
    );
    setEcran('match');
  }, []);

  const commencer = useCallback(
    (profil: string, seed: string) => {
      const s = creerSaison(seed, profil);
      setSaison(s);
      lancerMatch(s);
    },
    [lancerMatch],
  );

  const apresFeuille = useCallback(
    (carte: string) => {
      if (!saison || !etat?.issue) return;
      const avecResultat = enregistrerMatch(saison, etat.issue);
      const suivante = ajouterCarte(avecResultat, carte);
      setSaison(suivante);
      setEcran(suivante.termine ? 'bilan' : 'semaine');
    },
    [saison, etat],
  );

  const apresSemaine = useCallback(
    (opt: OptionEvenement) => {
      if (!saison) return;
      const suivante = appliquerOption(saison, opt);
      setSaison(suivante);
      lancerMatch(suivante);
    },
    [saison, lancerMatch],
  );

  const recommencer = useCallback(() => {
    setSaison(null);
    setEtat(null);
    setEcran('accueil');
  }, []);

  if (ecran === 'accueil' || !saison) return <Accueil onJouer={commencer} />;

  if (ecran === 'bilan') return <Bilan saison={saison} onRejouer={recommencer} />;

  if (ecran === 'semaine') {
    return (
      <Evenement evenement={evenementPour(saison, saison.match)} onChoisir={apresSemaine} />
    );
  }

  if (!etat) return <Accueil onJouer={commencer} />;

  if (ecran === 'feuille') {
    return (
      <FinMatch
        etat={etat}
        adversaire={saison.adversaires[saison.match - 1] ?? 'Adversaire'}
        recompenses={recompensesProposees(saison, saison.match)}
        derniere={saison.match >= saison.matchsTotal}
        onSuite={apresFeuille}
      />
    );
  }

  return (
    <Match
      etat={etat}
      adversaire={saison.adversaires[saison.match - 1] ?? 'Adversaire'}
      numeroMatch={saison.match}
      matchsTotal={saison.matchsTotal}
      onEtat={setEtat}
      onTerminer={() => setEcran('feuille')}
    />
  );
}
