import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CARTES,
  MENACES,
  TOUS_LES_EVENEMENTS,
  TOUS_LES_PROFILS,
  appliquerOption,
  carteDef,
  consigneDef,
  creerMatch,
  creerSaison,
  finirTour,
  jouerCarte,
  peutJouer,
  recompensesProposees,
  type EtatMatch,
} from '../src/engine';
import { simulerMatch } from '../src/sim/bot';

/** Joue un match entier en prenant toujours la premiere carte jouable. */
function jouerBetement(etat: EtatMatch): EtatMatch {
  let e = etat;
  let garde = 0;
  while (!e.fini && garde++ < 200) {
    const carte = e.main.find((c) => peutJouer(e, c));
    e = carte ? jouerCarte(e, carte.uid).etat : finirTour(e).etat;
  }
  return e;
}

describe('determinisme', () => {
  it('deux matchs de meme seed partent identiques', () => {
    const a = creerMatch({ seed: 'lundi-42', profil: 'renard' });
    const b = creerMatch({ seed: 'lundi-42', profil: 'renard' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('deux seeds differentes donnent des matchs differents', () => {
    const a = creerMatch({ seed: 'lundi-42', profil: 'renard' });
    const b = creerMatch({ seed: 'mardi-42', profil: 'renard' });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('la meme suite de coups donne exactement le meme match', () => {
    const a = jouerBetement(creerMatch({ seed: 'defi-du-jour', profil: 'meneur' }));
    const b = jouerBetement(creerMatch({ seed: 'defi-du-jour', profil: 'meneur' }));
    expect(JSON.stringify(a.issue)).toBe(JSON.stringify(b.issue));
    expect(a.journal.map((l) => l.texte)).toEqual(b.journal.map((l) => l.texte));
  });

  it('le bot rejoue la meme partie a l’identique', () => {
    for (const seed of ['a', 'b', 'c']) {
      expect(simulerMatch({ seed, profil: 'patron' })).toEqual(
        simulerMatch({ seed, profil: 'patron' }),
      );
    }
  });

  it('aucun Math.random dans le moteur', () => {
    // Le determinisme n'est pas rattrapable apres coup (brief 6). Ce test
    // existe pour que la regle casse la CI le jour ou quelqu'un l'oublie.
    // Les commentaires sont retires : le mot a le droit d'etre ecrit, pas appele.
    const sansCommentaires = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const dossier = join(__dirname, '..', 'src', 'engine');
    const fautifs = readdirSync(dossier).filter((f) =>
      /Math\.random\s*\(/.test(sansCommentaires(readFileSync(join(dossier, f), 'utf8'))),
    );
    expect(fautifs).toEqual([]);
  });

  it('l’etat de match est du JSON pur (validation serveur et fantomes)', () => {
    const e = jouerBetement(creerMatch({ seed: 'json', profil: 'renard' }));
    const aller = JSON.stringify(e);
    expect(JSON.stringify(JSON.parse(aller))).toBe(aller);
  });
});

describe('regles du match', () => {
  it('un match se termine toujours', () => {
    for (let i = 0; i < 60; i++) {
      const e = jouerBetement(creerMatch({ seed: `fin-${i}`, profil: 'meneur' }));
      expect(e.fini).toBe(true);
      expect(e.issue).not.toBeNull();
    }
  });

  it('on ne peut pas jouer une carte sans le souffle', () => {
    let e = creerMatch({ seed: 'souffle', profil: 'renard' });
    e = { ...e, jauges: { ...e.jauges, souffle: 0 } };
    const chere = e.main.find((c) => carteDef(c.def).cout > 0);
    if (chere) expect(jouerCarte(e, chere.uid).refus).toBe('Plus assez de souffle.');
  });

  it('une tare ne se joue jamais', () => {
    const e = creerMatch({ seed: 'tare', profil: 'renard' });
    const sale = { ...e, main: [...e.main, { uid: 'x', def: 'jambes_lourdes' }] };
    expect(jouerCarte(sale, 'x').refus).toBe('Rien a en tirer.');
  });

  it('le souffle ne remonte jamais au-dessus du maximum', () => {
    let e = creerMatch({ seed: 'plafond', profil: 'patron' });
    for (let i = 0; i < 12 && !e.fini; i++) {
      expect(e.jauges.souffle).toBeLessThanOrEqual(e.jauges.souffleMax);
      e = finirTour(e).etat;
    }
  });

  it('le souffle maximum s’use au fil du match', () => {
    let e = creerMatch({ seed: 'usure', profil: 'renard' });
    const depart = e.jauges.souffleMax;
    while (!e.fini) e = finirTour(e).etat;
    expect(e.jauges.souffleMax).toBeLessThan(depart);
  });

  it('sortir a zero de confiance termine le match sur un echec', () => {
    let e = creerMatch({ seed: 'confiance', profil: 'renard' });
    e = { ...e, jauges: { ...e.jauges, confiance: 1 } };
    // Coup de sang : +4 placement, -2 confiance.
    const sale = { ...e, main: [{ uid: 'x', def: 'coup_de_sang' }] };
    const apres = jouerCarte(sale, 'x').etat;
    expect(apres.fini).toBe(true);
    expect(apres.issue?.cause).toBe('remplace');
    expect(apres.issue?.reussi).toBe(false);
  });
});

describe('le telegraphe', () => {
  it('le joueur voit toujours ce qui arrive avant que ca arrive', () => {
    let e = creerMatch({ seed: 'telegraphe', profil: 'meneur' });
    for (let i = 0; i < 10 && !e.fini; i++) {
      expect(e.menaces.length).toBeGreaterThan(0);
      for (const m of e.menaces) {
        const def = MENACES[m.def]!;
        expect(def.annonce.length).toBeGreaterThan(10);
        expect(def.paradeTexte.length).toBeGreaterThan(5);
        expect(m.restant).toBeGreaterThan(0);
      }
      e = finirTour(e).etat;
    }
  });

  it('le seuil du gardien est connu avant de tirer, jamais un jet de des', () => {
    const e = creerMatch({ seed: 'gardien', profil: 'renard' });
    expect(e.gardien).toBeGreaterThanOrEqual(4);
    const avant = e.gardien;
    // Regarder la main ne change rien : le seuil est fixe pour le temps de jeu.
    expect(creerMatch({ seed: 'gardien', profil: 'renard' }).gardien).toBe(avant);
  });

  it('chaque profil peut parer chaque type de parade au moins une fois', () => {
    // Un telegraphe imparable n'est pas une decision, c'est une punition.
    for (const profil of TOUS_LES_PROFILS) {
      const tags = new Set(profil.deck.flatMap((id) => carteDef(id).tags));
      const parades = Object.values(MENACES).map((m) => m.parade);
      for (const p of parades) {
        if (p.p === 'jouerTag') {
          expect(
            tags.has(p.tag),
            `${profil.nom} ne peut pas parer « ${p.tag} »`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('coherence des donnees', () => {
  it('toutes les cartes citees existent', () => {
    const cites = [
      ...TOUS_LES_PROFILS.flatMap((p) => p.deck),
      ...TOUS_LES_EVENEMENTS.flatMap((e) => e.options.flatMap((o) => [...(o.ajoute ?? []), ...(o.retire ?? [])])),
      ...Object.values(CARTES).flatMap((c) =>
        c.effets.flatMap((ef) => (ef.t === 'polluer' ? [ef.carteId] : [])),
      ),
    ];
    for (const id of cites) expect(() => carteDef(id)).not.toThrow();
  });

  it('toutes les consignes citees existent', () => {
    for (const p of TOUS_LES_PROFILS) expect(() => consigneDef(p.consigne)).not.toThrow();
  });

  it('aucun nom de club ou de joueur reel n’est code en dur', () => {
    // Garde-fou juridique du brief (4) : on ne « regularisera » pas plus tard.
    const interdits = [
      'PSG', 'Real Madrid', 'Barcelone', 'Marseille', 'Lyon', 'Liverpool',
      'Mbappe', 'Messi', 'Ronaldo', 'Ligue 1', 'Premier League', 'FIFA', 'UEFA',
    ];
    const dossier = join(__dirname, '..', 'src');
    const lire = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((f) =>
        f.isDirectory() ? lire(join(d, f.name)) : [readFileSync(join(d, f.name), 'utf8')],
      );
    const tout = lire(dossier).join('\n');
    for (const mot of interdits) expect(tout.includes(mot), `« ${mot} » est cite`).toBe(false);
  });

  it('chaque carte non-tare fait quelque chose', () => {
    for (const c of Object.values(CARTES)) {
      if (c.tags.includes('Tare')) continue;
      expect(c.effets.length, `${c.nom} n'a aucun effet`).toBeGreaterThan(0);
      expect(c.texte.length).toBeGreaterThan(10);
    }
  });
});

describe('mini-saison', () => {
  it('le deck se transmet et grossit d’un match a l’autre', () => {
    const s = creerSaison('saison-1', 'renard');
    expect(s.deck.length).toBe(12);
    const trois = recompensesProposees(s, 1);
    expect(new Set(trois).size).toBe(3);
    expect(recompensesProposees(s, 1)).toEqual(trois);
  });

  it('les evenements hors terrain modifient physiquement le deck', () => {
    const s = creerSaison('saison-2', 'meneur');
    const option = TOUS_LES_EVENEMENTS[0]!.options[0]!;
    const apres = appliquerOption(s, option);
    expect(apres.deck.length).toBe(s.deck.length + (option.ajoute?.length ?? 0));
    expect(apres.deck).toContain('jambes_lourdes');
  });
});
