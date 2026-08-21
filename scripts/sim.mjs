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
/**
 * Nombre de graines consecutives a moyenner. Les mesures varient beaucoup d'une
 * graine a l'autre — le taux de fautes de service a un ecart-type de pres de
 * 10 points — donc juger l'equilibrage sur une seule partie donne un garde-fou
 * qui se declenche au hasard.
 */
/** Niveau de l'IA adverse. Le camp joueur reste a 0.5 pour servir d'etalon. */
const NIVEAU = Number(
  (process.argv.find((a) => a.startsWith('--niveau=')) ?? '--niveau=0.5').split('=')[1],
);
const GRAINES = Number(
  (process.argv.find((a) => a.startsWith('--graines=')) ?? '--graines=1').split('=')[1],
);

const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(e.message));
page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__padel, null, { timeout: 30000 });

const simuler = ({ points, graine, niveau }) => {
  const g = window.__padel;
  g.simulate(graine, 0.5, niveau);

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
  // Distance raquette-balle de chaque camp, relevee en continu : au moment ou
  // un point se perd, elle dit s'il a manque de peu ou s'il etait ailleurs.
  const bp = new (g.ball.position().constructor)();
  const tete = { 1: new (g.ball.position().constructor)(), '-1': new (g.ball.position().constructor)() };
  const manque = { 1: 0, '-1': 0 };
  res.manquees = { 1: [], '-1': [] };
  // Garde-fou : un point ne devrait jamais depasser une vingtaine de secondes.
  const MAX_PAS = points * 60 * 25;

  while (res.joues < points && res.pas < MAX_PAS) {
    g.step();
    res.pas += 1;

    g.ball.position(bp);
    manque[1] = g.player.racketHead(tete[1]).distanceTo(bp);
    manque[-1] = g.opponent.racketHead(tete[-1]).distanceTo(bp);

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
      if (o.reason === 'Double rebond') res.manquees[-o.winner].push(manque[-o.winner]);
      res.echanges.push(coups);
      coups = 0; dernierFrappeur = 0; tentative = 1;
    }
  }
  return res;
};

const brut = await page.evaluate(simuler, { points: POINTS, graine: GRAINE, niveau: NIVEAU });

if (DETERMINISME) {
  // On recharge la page entre les deux passes. `simulate()` remet le score et
  // les positions a zero, mais pas les horloges des personnages ni l'etat
  // interne du monde physique : le determinisme porte sur une partie rejouee
  // depuis un demarrage neuf, pas sur deux simulations enchainees.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__padel, null, { timeout: 30000 });
  const rejoue = await page.evaluate(simuler, { points: POINTS, graine: GRAINE, niveau: NIVEAU });
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

// Graines suivantes, chacune depuis une page neuve pour rester reproductible.
const passes = [brut];
for (let i = 1; i < GRAINES; i += 1) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__padel, null, { timeout: 30000 });
  passes.push(await page.evaluate(simuler, { points: POINTS, graine: GRAINE + i, niveau: NIVEAU }));
}

await browser.close();

const moyenne = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const mediane = (xs) => {
  if (!xs.length) return 0;
  const t = [...xs].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
};

// Agregation de toutes les passes.
const joues = passes.reduce((a, p) => a + p.joues, 0);
const pas = passes.reduce((a, p) => a + p.pas, 0);
const echangeMoyen = moyenne(passes.flatMap((p) => p.echanges));
const partJoueur = joues ? (passes.reduce((a, p) => a + p.gagnants[1], 0) / joues) * 100 : 0;
const tauxFaute = joues ? (passes.reduce((a, p) => a + p.fautes, 0) / joues) * 100 : 0;
const secondes = (pas / 60).toFixed(0);

for (const cle of ['motifs', 'fautesServiceParCamp', 'servicesParCamp']) {
  brut[cle] = passes.reduce((acc, p) => {
    for (const [k, v] of Object.entries(p[cle])) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});
}
for (const camp of [1, -1]) {
  brut.parPerdant[camp] = passes.reduce((acc, p) => {
    for (const [k, v] of Object.entries(p.parPerdant[camp])) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});
  brut.manquees[camp] = passes.flatMap((p) => p.manquees[camp]);
}
const doubles = brut.motifs['Double faute'] ?? 0;

const etiquette = GRAINES > 1 ? `graines ${GRAINE} a ${GRAINE + GRAINES - 1}` : `graine ${GRAINE}`;
console.log(`${etiquette} · niveau IA ${NIVEAU} · ${joues} points joues en ${pas} pas (${secondes} s de jeu simule)`);
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
const rate = (camp) => {
  const xs = brut.manquees[camp];
  if (!xs.length) return 'aucun';
  const proches = xs.filter((d) => d < 1.5).length;
  return `${moyenne(xs).toFixed(2)} m en moyenne, mediane ${mediane(xs).toFixed(2)} m` +
         ` · ${((proches / xs.length) * 100).toFixed(0)} % a moins de 1,5 m`;
};
console.log(`distance a la balle sur double rebond :`);
console.log(`  joueur : ${rate(1)}`);
console.log(`  IA     : ${rate(-1)}`);

// Fourchettes d'equilibrage. Elles ne decrivent pas un ideal mais un domaine
// hors duquel le jeu cesse d'etre celui qu'on a regle : echanges qui
// s'effondrent, camp qui domine, ou service devenu injouable.
const attendus = POINTS * GRAINES;
const controles = [
  ['points joues', joues, attendus * 0.95, attendus * 1.05],
  ['echange moyen', echangeMoyen, 3, 11],
  ['part du joueur (%)', partJoueur, 35, 70],
  ['fautes de service (%)', tauxFaute, 8, 50],
];

let ko = false;
for (const [nom, valeur, min, max] of controles) {
  if (valeur < min || valeur > max) {
    console.error(`HORS FOURCHETTE : ${nom} = ${Number(valeur).toFixed(2)} (attendu ${min}–${max})`);
    ko = true;
  }
}
if (erreurs.length) { console.error('erreurs console :', erreurs.slice(0, 4)); ko = true; }
if (passes.some((p) => p.pas >= POINTS * 60 * 25)) {
  console.error('La simulation a bute sur son garde-fou : un point ne se conclut pas.');
  ko = true;
}

console.log(ko ? 'EQUILIBRAGE : ECHEC' : 'EQUILIBRAGE : OK');
process.exit(ko ? 1 : 0);
