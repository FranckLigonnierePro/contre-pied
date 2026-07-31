import { useEffect, useMemo, useState } from 'react';

import {
  apercuTir,
  avancementObjectif,
  carteDef,
  consigneDef,
  coutReel,
  finirTour,
  jouerCarte,
  libelleObjectif,
  menaceDef,
  objectifAtteint,
  paradeSatisfaite,
  peutJouer,
  progressionParade,
  raisonBlocage,
  type Carte,
  type EtatMatch,
  type Menace,
  type ResultatTir,
} from '../../engine';
import { usePops } from '../pops';

interface Props {
  etat: EtatMatch;
  adversaire: string;
  numeroMatch: number;
  matchsTotal: number;
  onEtat: (e: EtatMatch) => void;
  onTerminer: () => void;
}

export function Match({
  etat,
  adversaire,
  numeroMatch,
  matchsTotal,
  onEtat,
  onTerminer,
}: Props): JSX.Element {
  const [choisie, setChoisie] = useState<string | null>(null);
  const [tir, setTir] = useState<ResultatTir | null>(null);
  const { pops, popsDeDiff, secousse, declencherSecousse } = usePops();

  const consigne = consigneDef(etat.consigne);

  // La carte selectionnee peut disparaitre de la main (fin de temps de jeu).
  useEffect(() => {
    if (choisie && !etat.main.some((c) => c.uid === choisie)) setChoisie(null);
  }, [etat.main, choisie]);

  const carteChoisie = useMemo(
    () => etat.main.find((c) => c.uid === choisie) ?? null,
    [etat.main, choisie],
  );

  function toucherCarte(carte: Carte): void {
    // Deux temps sur telephone : le premier montre la carte, le second la joue.
    // Le survol n'existe pas ici, et une carte jouee par erreur est perdue.
    setChoisie((c) => (c === carte.uid ? c : carte.uid));
  }

  function jouer(uid: string): void {
    const avant = etat;
    const r = jouerCarte(avant, uid);
    if (r.refus) return;
    popsDeDiff(avant, r.etat);
    setChoisie(null);
    if (r.tirs.length > 0) {
      const t = r.tirs[r.tirs.length - 1]!;
      setTir(t);
      if (t.but) declencherSecousse();
    }
    onEtat(r.etat);
  }

  function terminerTour(): void {
    const avant = etat;
    const r = finirTour(avant);
    popsDeDiff(avant, r.etat);
    if (r.etat.butsEncaisses > avant.butsEncaisses) declencherSecousse();
    setChoisie(null);
    onEtat(r.etat);
  }

  // Le fil du match remplit la place restante : sur un grand telephone, il
  // devient un vrai commentaire ; sur un petit, il se reduit a la derniere
  // ligne. Aucun ecran ne montre de vide.
  const fil = etat.journal.slice(-6);
  const blocage = carteChoisie ? raisonBlocage(etat, carteChoisie) : null;
  // Apercu du tir : calcule par le moteur lui-meme sur une copie jetable.
  const apercu = carteChoisie && !blocage ? apercuTir(etat, carteChoisie.uid) : null;

  return (
    <div className={`app${secousse ? ' secousse' : ''}`}>
      <header className="entete">
        <div className="adversaire">
          {numeroMatch}/{matchsTotal} · {adversaire}
        </div>
        <div className="score num">
          {etat.buts} – {etat.butsEncaisses}
        </div>
        <div className="chrono num">
          <b>{etat.minute}&rsquo;</b>
        </div>
      </header>

      <div className="jauges">
        <Jauge
          classe="souffle"
          etiquette="Souffle"
          valeur={etat.jauges.souffle}
          sur={etat.jauges.souffleMax}
        />
        <Jauge classe="placement" etiquette="Placement" valeur={etat.jauges.placement} sur={8} />
        {/* La jauge Danger porte deja le seuil du gardien : sur les petits
            ecrans elle remplace entierement la bande ci-dessous. */}
        <Jauge
          classe={`danger${etat.jauges.danger >= etat.gardien ? ' pret' : ''}`}
          etiquette="Danger"
          valeur={etat.jauges.danger}
          sur={etat.gardien}
        />
        <Jauge
          classe="confiance"
          etiquette="Confiance"
          valeur={etat.jauges.confiance}
          sur={etat.jauges.confianceMax}
        />
      </div>

      {/* Le seuil du gardien est affiche en permanence : tirer est une
          decision, jamais un coup de des. */}
      <div className={`gardien${etat.jauges.danger >= etat.gardien ? ' pret' : ''}`}>
        <div className="texte">
          {etat.jauges.danger >= etat.gardien
            ? 'Tu peux le battre. Maintenant.'
            : 'Le gardien est bien place.'}
        </div>
        <div className="compte num">
          <span className="a">{etat.jauges.danger}</span>
          <span className="b"> / {etat.gardien}</span>
        </div>
      </div>

      <div className="zone-menaces defilable">
        <div className="titre-section">Ce qu&rsquo;ils preparent</div>
        <div className="menaces">
          {etat.menaces.length === 0 && (
            <p className="aide">Rien devant toi pour l&rsquo;instant. Ca ne durera pas.</p>
          )}
          {etat.menaces.map((m) => (
            <MenaceVue key={m.uid} menace={m} etat={etat} />
          ))}
        </div>
      </div>

      <div className="consigne">
        {consigne.objectifs.map((o, i) => {
          const av = avancementObjectif(etat, o);
          const ok = objectifAtteint(etat, o);
          return (
            <div key={i} className={`item${ok ? ' fait' : ''}`}>
              <span className="puce" />
              {libelleObjectif(o)}
              <span className="num">
                ({av.fait}/{av.requis})
              </span>
            </div>
          );
        })}
      </div>

      <div className="journal">
        {fil.map((l, i) => (
          <div key={etat.journal.length - fil.length + i} className={`ligne ${l.ton}`}>
            <span className="min num">{l.minute}&rsquo;</span> {l.texte}
          </div>
        ))}
      </div>

      <div className="zone-main">
        <div className="main">
          {etat.main.map((c) => (
            <CarteVue
              key={c.uid}
              carte={c}
              etat={etat}
              choisie={choisie === c.uid}
              onToucher={() => toucherCarte(c)}
            />
          ))}
          {etat.main.length === 0 && (
            <p className="aide" style={{ padding: '24px 4px' }}>
              Plus rien a jouer. Laisse filer le temps de jeu.
            </p>
          )}
        </div>

        <div className="actions">
          {carteChoisie ? (
            <>
              <button
                className={`bouton ${apercu ? (apercu.but ? 'tir' : 'rate') : 'majeur'}`}
                disabled={!peutJouer(etat, carteChoisie)}
                onClick={() => jouer(carteChoisie.uid)}
              >
                {blocage ??
                  (apercu
                    ? `Tirer — ${apercu.total} contre ${apercu.gardien}`
                    : `Jouer — ${carteDef(carteChoisie.def).nom}`)}
              </button>
              <button className="bouton fin" onClick={() => setChoisie(null)}>
                Annuler
              </button>
            </>
          ) : (
            <button className="bouton" onClick={terminerTour} disabled={etat.fini}>
              Laisser filer le temps de jeu
            </button>
          )}
        </div>
      </div>

      <div className="pops">
        {pops.map((p) => (
          <div
            key={p.id}
            className={`pop ${p.couleur}`}
            style={{
              marginLeft: `${p.dx}px`,
              animationDelay: `${p.retard}ms`,
            }}
          >
            {p.texte}
          </div>
        ))}
      </div>

      {tir && <EcranTir tir={tir} onFermer={() => setTir(null)} />}

      {etat.fini && !tir && (
        <div className="chaine" onClick={onTerminer}>
          <div className="verdict">
            {etat.issue?.cause === 'remplace' ? 'Remplace' : 'Coup de sifflet'}
          </div>
          <div className="total num">
            {etat.buts} – {etat.butsEncaisses}
          </div>
          <button className="bouton majeur" onClick={onTerminer}>
            Voir la feuille de match
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Sous-vues -------------------------------- */

function Jauge({
  classe,
  etiquette,
  valeur,
  sur,
}: {
  classe: string;
  etiquette: string;
  valeur: number;
  sur: number;
}): JSX.Element {
  const part = Math.max(0, Math.min(100, (valeur / Math.max(1, sur)) * 100));
  return (
    <div className={`jauge ${classe}`}>
      <div className="etiquette">{etiquette}</div>
      <div className="valeur num">
        {valeur}
        <small>/{sur}</small>
      </div>
      <div className="barre">
        <i style={{ width: `${part}%` }} />
      </div>
    </div>
  );
}

function MenaceVue({ menace, etat }: { menace: Menace; etat: EtatMatch }): JSX.Element {
  const def = menaceDef(menace.def);
  const ok = paradeSatisfaite(etat, def.parade);
  const prog = progressionParade(etat, def.parade);
  const mauvaise = def.genre === 'menace';
  const part =
    def.parade.p === 'aucune'
      ? 100
      : Math.max(0, Math.min(100, (prog.fait / Math.max(1, prog.requis)) * 100));

  return (
    <div className={`menace ${mauvaise ? 'mal' : 'bien'}`}>
      <div className="haut">
        <div className="nom">{def.nom}</div>
        {/* Court par necessite : sur 320 px, une etiquette longue pousse le
            nom sur deux lignes et fait sortir la parade de l'ecran. */}
        <div className={`delai${menace.restant <= 1 ? ' imminent' : ''}`}>
          {menace.restant <= 1 ? 'maintenant' : `dans ${menace.restant}`}
        </div>
      </div>
      <div className="annonce">{def.annonce}</div>
      <div className={`parade${ok ? ' ok' : ''}`}>
        <span className="pastille">{ok ? '✓' : ''}</span>
        <span>{def.paradeTexte}</span>
      </div>
      <div className="jauge-parade">
        <i style={{ width: `${part}%`, background: ok ? 'var(--cyan)' : undefined }} />
      </div>
    </div>
  );
}

function CarteVue({
  carte,
  etat,
  choisie,
  onToucher,
}: {
  carte: Carte;
  etat: EtatMatch;
  choisie: boolean;
  onToucher: () => void;
}): JSX.Element {
  const def = carteDef(carte.def);
  const cout = coutReel(etat, def);
  const bloquee = !peutJouer(etat, carte);
  const raison = raisonBlocage(etat, carte);
  const tare = def.tags.includes('Tare');

  return (
    <button
      className={`carte${choisie ? ' choisie' : ''}${bloquee ? ' bloquee' : ''}${tare ? ' tare' : ''}`}
      onClick={onToucher}
      aria-pressed={choisie}
    >
      <span className={`cout num${cout > def.cout ? ' majore' : ''}`}>{cout}</span>
      <span className="nom">{def.nom}</span>
      <span className="tags">
        {def.tags.map((t) => (
          <span key={t} className={`tag ${t}`}>
            {t}
          </span>
        ))}
      </span>
      <span className="texte">{def.texte}</span>
      {bloquee && raison && <span className="empeche">{raison}</span>}
    </button>
  );
}

/**
 * L'ecran de tir : la ou passe la juice. On montre le calcul en entier —
 * le joueur doit comprendre exactement pourquoi ca rentre ou pourquoi ca
 * ne rentre pas. C'est ce qui rend un but partageable et un arret acceptable.
 */
function EcranTir({ tir, onFermer }: { tir: ResultatTir; onFermer: () => void }): JSX.Element {
  useEffect(() => {
    const t = window.setTimeout(onFermer, 2100);
    return () => window.clearTimeout(t);
  }, [onFermer]);

  return (
    <div className="chaine" onClick={onFermer}>
      <div className="calcul num">
        <span className="val">{tir.danger}</span>
        {tir.mult !== 1 && <span>&times; {tir.mult}</span>}
        {tir.bonusPlacement > 0 && (
          <span>
            + {tir.placement} &times; {tir.bonusPlacement}
          </span>
        )}
      </div>
      <div className={`total num ${tir.but ? 'but' : 'rate'}`}>{tir.total}</div>
      <div className="contre num">contre {tir.gardien} au gardien</div>
      <div className={`verdict${tir.but ? ' but' : ''}`}>{tir.but ? 'But !' : 'Arrete'}</div>
      <div className="contre">{tir.minute}&rsquo;</div>
    </div>
  );
}
