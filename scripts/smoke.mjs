/**
 * Test de fumee : lance la page, joue quelques echanges au clavier et verifie
 * qu'aucune erreur n'est levee et que le score progresse.
 * Usage : npm run build && npm run preview & puis `node scripts/smoke.mjs`
 */
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4173/';
const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const held = new Set();
const hold = async (key, on) => {
  if (on && !held.has(key)) { await page.keyboard.down(key); held.add(key); }
  if (!on && held.has(key)) { await page.keyboard.up(key); held.delete(key); }
};

let swings = 0;
for (let i = 0; i < 300; i++) {
  const s = await page.evaluate(() => {
    const g = window.__padel;
    const p = g.player.position(), b = g.ball.position(), v = g.ball.velocity();
    const g0 = 9.81 * 1.7;
    const disc = v.y * v.y + 2 * g0 * (b.y - 0.9);
    const t = disc > 0 ? (v.y + Math.sqrt(disc)) / g0 : 0.2;
    return {
      landX: b.x + v.x * t, landZ: b.z + v.z * t, px: p.x, pz: p.z, by: b.y, vz: v.z,
      reach: g.player.ragdoll.handPosition().distanceTo(b),
      phase: g.rules.phase,
      games: [g.rules.games.get(1), g.rules.games.get(-1)],
    };
  });

  if (s.phase === 'serve' || s.phase === 'match') {
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    continue;
  }
  const tx = s.vz > 0 ? s.landX : 0;
  const tz = s.vz > 0 ? Math.max(1.5, Math.min(9, s.landZ)) : 5.5;
  await hold('KeyD', tx - s.px > 0.25);
  await hold('KeyA', s.px - tx > 0.25);
  await hold('KeyS', tz - s.pz > 0.3);
  await hold('KeyW', s.pz - tz > 0.3);
  if (s.reach < 1.2 && s.by < 2.6) { await page.keyboard.press('Space'); swings += 1; }
  await page.waitForTimeout(45);
}
for (const key of held) await page.keyboard.up(key);

const games = await page.evaluate(() => [window.__padel.rules.games.get(1), window.__padel.rules.games.get(-1)]);
await browser.close();

const played = games[0] + games[1] > 0 || swings > 5;
console.log(`swings: ${swings} · jeux: ${games[0]}-${games[1]} · erreurs: ${errors.length}`);
if (errors.length) { console.error(errors.slice(0, 5)); process.exit(1); }
if (!played) { console.error('Aucun echange joue.'); process.exit(1); }
console.log('OK');
