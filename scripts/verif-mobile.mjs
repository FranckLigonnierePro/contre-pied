/**
 * Controle de non-regression mobile.
 *
 * Sur un produit dont tout le modele repose sur « le commissaire envoie un
 * lien, les sept potes cliquent et jouent », une mise en page cassee sur un
 * telephone n'est pas un defaut cosmetique : c'est la moitie du groupe perdue.
 * Ce script verifie donc, sur trois tailles d'ecran reelles, les trois regles
 * que la feuille de style s'engage a tenir :
 *
 *   1. aucun debordement horizontal, aucun defilement de page ;
 *   2. aucune cible tactile sous 44 px ;
 *   3. les deux telegraphes lisibles sans defiler, ou presque, sur le plus
 *      petit ecran encore en circulation (320 x 568).
 *
 * Prerequis : `npx playwright install chromium` (ou PLAYWRIGHT_CHROMIUM=<chemin>).
 * Usage     : `npm run build && npm run preview` dans un terminal, puis
 *             `node scripts/verif-mobile.mjs [url]`.
 */
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://127.0.0.1:4173/';
const EXE = process.env.PLAYWRIGHT_CHROMIUM;

const ECRANS = [
  { nom: 'iPhone SE (320x568)', w: 320, h: 568, dpr: 2, mobile: true },
  { nom: 'Android courant (393x851)', w: 393, h: 851, dpr: 2.75, mobile: true },
  { nom: 'Bureau (1280x800)', w: 1280, h: 800, dpr: 1, mobile: false },
];

const navigateur = await chromium.launch(EXE ? { executablePath: EXE } : {});
let echecs = 0;

function verifier(condition, message) {
  console.log(`     ${condition ? '  ok' : 'ECHEC'}  ${message}`);
  if (!condition) echecs++;
}

for (const e of ECRANS) {
  const ctx = await navigateur.newContext({
    viewport: { width: e.w, height: e.h },
    deviceScaleFactor: e.dpr,
    isMobile: e.mobile,
    hasTouch: e.mobile,
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (x) => erreurs.push(String(x)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/404/.test(m.text())) erreurs.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Entrer sur le terrain/ }).click();
  await page.waitForTimeout(400);

  const m = await page.evaluate(() => {
    const zone = document.querySelector('.zone-menaces');
    const petits = [];
    for (const b of document.querySelectorAll('button')) {
      const r = b.getBoundingClientRect();
      if (r.height > 0 && r.height < 44) petits.push(`${b.className} (${Math.round(r.height)}px)`);
    }
    return {
      debordeH: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      debordeV: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      petits,
      menaces: document.querySelectorAll('.menace').length,
      zoneVue: zone ? Math.round(zone.clientHeight) : 0,
      zoneTotal: zone ? Math.round(zone.scrollHeight) : 0,
    };
  });

  console.log(`\n  ${e.nom}`);
  verifier(!m.debordeH, 'aucun debordement horizontal');
  verifier(!m.debordeV, 'la page ne defile pas');
  verifier(m.petits.length === 0, `cibles tactiles >= 44 px ${m.petits.join(', ')}`);
  verifier(m.menaces >= 2, 'au moins deux telegraphes affiches');
  verifier(
    m.zoneTotal - m.zoneVue <= 24,
    `telegraphes lisibles sans defiler (${m.zoneVue}/${m.zoneTotal} px)`,
  );
  verifier(erreurs.length === 0, `aucune erreur console ${erreurs.join(' | ')}`);

  await ctx.close();
}

await navigateur.close();
console.log(echecs === 0 ? '\nMise en page mobile conforme.\n' : `\n${echecs} verification(s) en echec.\n`);
process.exit(echecs === 0 ? 0 : 1);
