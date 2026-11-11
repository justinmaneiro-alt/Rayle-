// Test du carrousel (Chrome) : node outils-restructuration/test-carrousel.mjs [pc|tablette|telephone]
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const cle = process.argv[2] || 'pc';
const o = await ouvrirAppareil(cle, { attente: 2500 }); const p = o.page;
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const att = ms => new Promise(r => setTimeout(r, ms));
const etat = () => p.evaluate(() => Application.etat());
v('carrousel présent, accueil par défaut', (await etat()).id === 'rayle');
await p.evaluate(() => Application.suivant()); await att(600);
v('suivant -> terminal', (await etat()).id === 'terminal');
// balayage tactile / souris
const W = await p.evaluate(() => innerWidth), H = await p.evaluate(() => innerHeight);
async function balayer(dx) {
  if (cle.startsWith('pc')) { await p.mouse.move(W / 2, H * 0.3); await p.mouse.down(); for (let i = 1; i <= 8; i++) { await p.mouse.move(W / 2 + dx * i / 8, H * 0.3); await att(16); } await att(140); await p.mouse.up(); }
  else { const c = await p.createCDPSession(); const pt = x => [{ x, y: H * 0.3 }]; await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(W / 2) }); for (let i = 1; i <= 8; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(W / 2 + dx * i / 8) }); await att(16); } await att(140); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  await att(700);
}
await balayer(-W * 0.5); v('balayage vers la gauche -> anatomie', (await etat()).id === 'anatomie', (await etat()).id);
await balayer(W * 0.5); v('balayage vers la droite -> terminal', (await etat()).id === 'terminal', (await etat()).id);
await p.keyboard.press('ArrowRight'); await att(600); v('flèche droite -> anatomie', (await etat()).id === 'anatomie');
await p.keyboard.press('ArrowLeft'); await att(600); v('flèche gauche -> terminal', (await etat()).id === 'terminal');
const dit = await p.evaluate(() => Application.commande('Rayle, va à droite')); await att(600); v('voix « va à droite »', (await etat()).id === 'anatomie', String(dit));
await p.screenshot({ path: `outils-restructuration/car-${cle}-anatomie.png` }); const deborde = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); v('aucun défilement horizontal de la page', !deborde);
// ouverture : clic sur la carte du terminal
await p.evaluate(() => Application.aller('terminal')); await att(600);
{ const ct = await p.evaluate(() => { const r = document.querySelector('.ac-p[data-id="terminal"] .ac-cadre').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); if (cle.startsWith('pc')) await p.mouse.click(ct[0], ct[1]); else await p.touchscreen.tap(ct[0], ct[1]); await att(2500); }
const e1 = await etat(), vue = await p.evaluate(() => RayleBus.demander('vue'));
v('clic sur la carte -> terminal ouvert', e1.ouvert === 'terminal' && vue === 'terminal', JSON.stringify(e1) + ' ' + vue);
v('croix visible', await p.evaluate(() => !document.getElementById('app-croix').hidden));
await p.screenshot({ path: `outils-restructuration/car-${cle}-terminal.png` });
await p.click('#app-croix'); await att(1500);
const e2 = await etat(); v('croix -> retour au carrousel (même fenêtre)', e2.ouvert === null && e2.id === 'terminal' && (await p.evaluate(() => RayleBus.demander('vue'))) === 'rayle', JSON.stringify(e2));
console.log('erreurs :', [...new Set(o.erreurs)].filter(e => !/faireconomy|404|ERR_FAILED/.test(e)));
console.log(ok + ' OK, ' + ko + ' KO'); await o.navigateur.close(); process.exit(ko ? 1 : 0);
