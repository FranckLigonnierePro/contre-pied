/**
 * Simulateur d'equilibrage : fait jouer deux IA l'une contre l'autre, sans
 * rendu, et resume la partie en chiffres.
 *
 * Usage : npm run preview &  puis  npm run sim [points] [graine]
 *
 * L'aleatoire etant seede, une meme graine rejoue exactement la meme partie :
 * les chiffres se comparent d'une execution a l'autre, et un reglage se mesure
 * au lieu de se deviner.
 */
import { chromium } from 'playwright';

// `?sim=1` fige la boucle de rendu des le premier frame : le simulateur part
// d'un monde qui n'a encore ete avance d'aucun pas.
const URL = (process.env.SIM_URL ?? 'http://localhost:4173/') + '?sim=1';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const POINTS = Number(args[0] ?? 200);
const GRAINE = Number(args[1] ?? 1);
/** Rejoue la meme graine deux fois et exige des resultats identiques. */
const DETERMINISME = process.argv.includes('--determinisme');

const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(e.message));
page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__padel, null, { timeout: 30000 });

const simuler = ({ points, graine }) => {
  const g = window.__padel;
  g.simulate(graine);

  const res = {
    motifs: {}, gagnants: { 1: 0, '-1': 0 },
    // Qui commet quelle faute : c'est ce qui distingue un desequilibre de
    // reglage d'une simple variance.
    parPerdant: { 1: {}, '-1': {} },
    fautesServiceParCamp: { 1: 0, '-1': 0 },
    servicesParCamp: { 1: 0, '-1': 0 },
    echanges: [], fautes: 0, pas: 0, joues: 0,
  };
  let coups = 0, dernierFrappeur = 0, tentative = 1, dernierPoint = null;
  // Garde-fou : un point ne devrait jamais depasser une vingtaine de secondes.
  const MAX_PAS = points * 60 * 25;

  while (res.joues < points && res.pas < MAX_PAS) {
    g.step();
    res.pas += 1;

    const h = g.rules.lastHitter;
    if (h !== 0 && h !== dernierFrappeur) { coups += 1; dernierFrappeur = h; }
    if (g.rules.serveAttempt > tentative) {
      res.fautes += 1;
      res.fautesServiceParCamp[g.rules.server] += 1;
      tentative = g.rules.serveAttempt;
    }

    const o = g.rules.lastOutcome;
    if (o && o !== dernierPoint) {
      dernierPoint = o;
      res.joues += 1;
      res.motifs[o.reason] = (res.motifs[o.reason] ?? 0) + 1;
      res.gagnants[o.winner] += 1;
      res.servicesParCamp[g.rules.server] += 1;
      const perdant = res.parPerdant[-o.winner];
      perdant[o.reason] = (perdant[o.reason] ?? 0) + 1;
      res.echanges.push(coups);
      coups = 0; dernierFrappeur = 0; tentative = 1;
    }
  }
  return res;
};

const brut = await page.evaluate(simuler, { points: POINTS, graine: GRAINE });

if (DETERMINISME) {
  // On recharge la page entre les deux passes. `simulate()` remet le score et
  // les positions a zero, mais pas les horloges des personnages ni l'etat
  // interne du monde physique : le determinisme porte sur une partie rejouee
  // depuis un demarrage neuf, pas sur deux simulations enchainees.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__padel, null, { timeout: 30000 });
  const rejoue = await page.evaluate(simuler, { points: POINTS, graine: GRAINE });
  await browser.close();
  const a = JSON.stringify(brut);
  const b = JSON.stringify(rejoue);
  if (a === b) {
    console.log(`determinisme : la graine ${GRAINE} rejoue exactement la meme partie ` +
                `(${brut.joues} points, ${brut.pas} pas)`);
    process.exit(0);
  }
  console.error('determinisme : ECHEC — deux executions de la meme graine divergent');
  console.error('  premiere :', a.slice(0, 300));
  console.error('  seconde  :', b.slice(0, 300));
  process.exit(1);
}

await browser.close();

const moyenne = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const mediane = (xs) => {
  if (!xs.length) return 0;
  const t = [...xs].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
};

const joues = brut.joues;
const echangeMoyen = moyenne(brut.echanges);
const partJoueur = joues ? (brut.gagnants[1] / joues) * 100 : 0;
const tauxFaute = joues ? (brut.fautes / joues) * 100 : 0;
const doubles = brut.motifs['Double faute'] ?? 0;
const secondes = (brut.pas / 60).toFixed(0);

console.log(`graine ${GRAINE} · ${joues} points joues en ${brut.pas} pas (${secondes} s de jeu simule)`);
console.log(`echange moyen      : ${echangeMoyen.toFixed(2)} frappes (mediane ${mediane(brut.echanges)})`);
console.log(`points au joueur   : ${partJoueur.toFixed(0)} %`);
console.log(`fautes de service  : ${tauxFaute.toFixed(0)} % des points`);
console.log(`doubles fautes     : ${doubles}`);
console.log('motifs de fin de point (par camp qui perd le point) :');
const motifs = Object.entries(brut.motifs).sort((a, b) => b[1] - a[1]);
console.log(`  ${'total'.padStart(6)}  ${'joueur'.padStart(6)}  ${'IA'.padStart(6)}   motif`);
for (const [motif, n] of motifs) {
  const j = brut.parPerdant[1][motif] ?? 0;
  const a = brut.parPerdant[-1][motif] ?? 0;
  console.log(`  ${String(n).padStart(6)}  ${String(j).padStart(6)}  ${String(a).padStart(6)}   ${motif}`);
}
console.log(
  `fautes de service : joueur ${brut.fautesServiceParCamp[1]} sur ${brut.servicesParCamp[1]} services` +
  ` · IA ${brut.fautesServiceParCamp[-1]} sur ${brut.servicesParCamp[-1]}`,
);

// Fourchettes d'equilibrage. Elles ne decrivent pas un ideal mais un domaine
// hors duquel le jeu cesse d'etre celui qu'on a regle : echanges qui
// s'effondrent, camp qui domine, ou service devenu injouable.
const controles = [
  ['points joues', joues, POINTS * 0.95, POINTS * 1.05],
  ['echange moyen', echangeMoyen, 1.5, 12],
  ['part du joueur (%)', partJoueur, 25, 75],
  ['fautes de service (%)', tauxFaute, 1, 40],
];

let ko = false;
for (const [nom, valeur, min, max] of controles) {
  if (valeur < min || valeur > max) {
    console.error(`HORS FOURCHETTE : ${nom} = ${Number(valeur).toFixed(2)} (attendu ${min}–${max})`);
    ko = true;
  }
}
if (erreurs.length) { console.error('erreurs console :', erreurs.slice(0, 4)); ko = true; }
if (brut.pas >= POINTS * 60 * 25) { console.error('La simulation a bute sur son garde-fou : un point ne se conclut pas.'); ko = true; }

console.log(ko ? 'EQUILIBRAGE : ECHEC' : 'EQUILIBRAGE : OK');
process.exit(ko ? 1 : 0);
