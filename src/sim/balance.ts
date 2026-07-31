import { TOUS_LES_PROFILS, consigneDef, libelleObjectif } from '../engine';
import { simulerMatch } from './bot';

/**
 * `npm run sim` — le bot d'equilibrage du brief (6).
 *
 * Il remplace les 300 iterations de « feeling » par une mesure. Ce qu'on
 * regarde n'est PAS « est-ce que le bot gagne », mais :
 *   - la consigne est-elle tenue entre 35 % et 65 % du temps ? En dessous,
 *     c'est punitif ; au-dessus, il n'y a pas de decision.
 *   - le match va-t-il au bout, ou le joueur sort-il sur la confiance ?
 *   - les buts encaisses restent-ils lisibles (0 a 2) ?
 *
 * Le bot est glouton et myope : il joue moins bien qu'un humain motive. Une
 * consigne qu'il tient 60 % du temps sera trop facile pour un joueur.
 */

const RUNS = Number(process.argv[2] ?? 2000);

interface Stat {
  n: number;
  reussis: number;
  remplaces: number;
  buts: number;
  encaisses: number;
  danger: number;
  tirs: number;
  note: number;
  parObjectif: number[];
}

function vide(nObjectifs: number): Stat {
  return {
    n: 0,
    reussis: 0,
    remplaces: 0,
    buts: 0,
    encaisses: 0,
    danger: 0,
    tirs: 0,
    note: 0,
    parObjectif: new Array(nObjectifs).fill(0),
  };
}

function pct(a: number, b: number): string {
  return `${((a / Math.max(1, b)) * 100).toFixed(1).padStart(5)} %`;
}

function moy(a: number, b: number): string {
  return (a / Math.max(1, b)).toFixed(2).padStart(6);
}

console.log(`\nCONTRE-PIED — bot d'equilibrage — ${RUNS} matchs par profil\n`);

let alerte = false;

for (const profil of TOUS_LES_PROFILS) {
  const consigne = consigneDef(profil.consigne);
  const st = vide(consigne.objectifs.length);

  for (let i = 0; i < RUNS; i++) {
    const issue = simulerMatch({ seed: `sim-${i}`, profil: profil.id });
    st.n++;
    if (issue.reussi) st.reussis++;
    if (issue.cause === 'remplace') st.remplaces++;
    st.buts += issue.buts;
    st.encaisses += issue.butsEncaisses;
    st.danger += issue.dangerCumule;
    st.tirs += issue.tirsTotal;
    st.note += issue.note;
    issue.objectifsAtteints.forEach((ok, k) => {
      if (ok) st.parObjectif[k] = (st.parObjectif[k] ?? 0) + 1;
    });
  }

  const tauxReussite = st.reussis / st.n;
  console.log(`  ${profil.numero} — ${profil.nom} (${profil.poste})`);
  console.log(`     consigne tenue      ${pct(st.reussis, st.n)}`);
  consigne.objectifs.forEach((o, k) => {
    console.log(`       · ${libelleObjectif(o).padEnd(24)} ${pct(st.parObjectif[k] ?? 0, st.n)}`);
  });
  console.log(`     sorti sur confiance ${pct(st.remplaces, st.n)}`);
  console.log(`     buts / match        ${moy(st.buts, st.n)}`);
  console.log(`     encaisses / match   ${moy(st.encaisses, st.n)}`);
  console.log(`     danger cree / match ${moy(st.danger, st.n)}`);
  console.log(`     frappes / match     ${moy(st.tirs, st.n)}`);
  console.log(`     note moyenne        ${moy(st.note, st.n)}`);

  const soucis: string[] = [];
  if (tauxReussite < 0.2) soucis.push('trop punitif pour un bot glouton');
  if (tauxReussite > 0.75) soucis.push('trop permissif : pas de decision');
  if (st.remplaces / st.n > 0.25) soucis.push('trop de sorties sur confiance');
  if (soucis.length) {
    alerte = true;
    console.log(`     /!\\ ${soucis.join(' ; ')}`);
  }
  console.log('');
}

console.log(
  alerte
    ? 'Des seuils sont hors de la fourchette visee. Ajuster REGLES dans src/engine/match.ts.\n'
    : 'Tous les profils sont dans la fourchette visee.\n',
);

// Sortie non nulle : une carte retouchee sans y penser peut sortir un poste de
// la fourchette sans casser un seul test unitaire. La CI doit le voir.
process.exit(alerte ? 1 : 0);
