// Miniatures : le rendu vivant n'a lieu que pour le panneau du centre ; transition continue de la Terre ; bascule hors écran. node outils-restructuration/test-miniatures.mjs [appareil]
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const cle = process.argv[2] || 'pc1600'; const att = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + String(d).slice(0, 200) : '')); };
const o = await ouvrirAppareil(cle, { attente: 1500 }); const p = o.page;
const empreinte = id => p.evaluate(id => { const c = document.querySelector('.ac-p[data-id="' + id + '"] canvas'); return c.toDataURL('image/png').length + ':' + c.toDataURL('image/png').slice(-60); }, id);
await p.evaluate(() => Application.aller(3)); await att(9000);
const e1 = await empreinte('terre'), e2 = await (async () => { await att(900); return empreinte('terre'); })();
v('Terre au centre : la miniature tourne (l\'image change)', e1 !== e2);
const d1 = await empreinte('dev3d'); await att(900); const d2 = await empreinte('dev3d'); v('panneau voisin (Développement 3D) : image fixe, aucun rendu vivant', d1 === d2);
const a1 = await empreinte('anatomie'); await att(900); const a2 = await empreinte('anatomie'); v('panneau voisin (Anatomie) : image fixe', a1 === a2);
// hors de l'écran / onglet caché : plus de rendu
await p.evaluate(() => Application.aller(0)); await att(2500);
const t1 = await empreinte('terre'); await att(900); const t2 = await empreinte('terre'); v('Terre éloignée de l\'écran : plus de rendu', t1 === t2);
// continuité : la grande Terre démarre où tournait la miniature
await p.evaluate(() => Application.aller(3)); await att(3000);
const dep = await p.evaluate(() => Miniatures.terreEtat());
const ct = await p.evaluate(() => { const r = document.querySelector('.ac-p[data-id="terre"] .ac-cadre').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
if (cle.startsWith('pc')) await p.mouse.click(ct[0], ct[1]); else await p.touchscreen.tap(ct[0], ct[1]);
for (let k = 0; k < 90; k++) { await att(400); if (await p.evaluate(() => !!(window.Terre && Terre.etat && Terre.etat().actif && Terre.etat().entree))) break; }
await att(2500);
const T = await p.evaluate(() => Terre.etat());
const lon = T.lon ?? (T.centre && T.centre.lon), lat = T.lat ?? (T.centre && T.centre.lat);
const dl = Math.abs(((lon - dep.lon + 540) % 360) - 180);
v('grande Terre : même point de départ que la miniature (écart de longitude ' + dl.toFixed(1) + '° après le vol d\'arrivée)', Number.isFinite(dl) && dl < 20, JSON.stringify({ dep, lon, lat }));
await p.screenshot({ path: 'outils-restructuration/captures/terre-grande-' + cle + '.png' });
console.log('erreurs', [...new Set(o.erreurs)].filter(e => !/faireconomy|404|ERR_FAILED|calendar|501/.test(e)).slice(0, 4));
console.log(ok + ' OK, ' + ko + ' KO'); await o.navigateur.close(); process.exit(ko ? 1 : 0);
