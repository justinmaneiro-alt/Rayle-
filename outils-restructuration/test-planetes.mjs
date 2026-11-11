// Entrée directe dans Terre, Anatomie et Développement 3D, puis sortie par la croix. node outils-restructuration/test-planetes.mjs [pc|telephone] [terre,anatomie,dev3d]
import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const cle = process.argv[2] || 'pc', liste = (process.argv[3] || 'terre,anatomie,dev3d').split(',');
const o = await ouvrirAppareil(cle, { attente: 2000 }); const p = o.page; const att = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
for (const id of liste) {
  const t0 = Date.now();
  await p.evaluate(i => { Application.aller(i); }, id); await att(1800);
  const ct = await p.evaluate(i => { const r = document.querySelector('.ac-p[data-id="' + i + '"] .ac-cadre').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, id); if (cle.startsWith('pc')) await p.mouse.click(ct[0], ct[1]); else await p.touchscreen.tap(ct[0], ct[1]);
  let pret = false;
  for (let k = 0; k < 90 && !pret; k++) { await att(500); pret = await p.evaluate(i => { if (i === 'terre') return !!(window.Terre && Terre.etat && Terre.etat().actif); if (i === 'anatomie') return !!(window.Saturne && Saturne.etat && Saturne.etat().salle); if (i === 'dev3d') return !!(window.Neptune && Neptune.etat && Neptune.etat().actif); return false; }, id).catch(() => false); }
  await att(2500);
  const e = await p.evaluate(() => ({ app: Application.etat(), vue: RayleBus.demander('vue'), direct: document.body.classList.contains('app-direct'), fps: window.Galaxie && Galaxie.info().fps })).catch(x => ({ err: String(x) }));
  v(id + ' : module actif (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)', pret, JSON.stringify(e));
  await p.screenshot({ path: `outils-restructuration/planete-${cle}-${id}.png` });
  { const cx = await p.evaluate(() => { const r = document.getElementById('app-croix').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); if (cle.startsWith('pc')) await p.mouse.click(cx[0], cx[1]); else await p.touchscreen.tap(cx[0], cx[1]); } await att(2500);
  const f = await p.evaluate(() => ({ app: Application.etat(), vue: RayleBus.demander('vue'), carrousel: getComputedStyle(document.getElementById('app-car')).display }));
  v(id + ' : croix -> carrousel', f.app.ouvert === null && f.vue === 'rayle' && f.carrousel !== 'none', JSON.stringify(f));
}
console.log('erreurs :', [...new Set(o.erreurs)].filter(e => !/faireconomy|404|ERR_FAILED|calendar/.test(e)).slice(0, 8));
console.log(ok + ' OK, ' + ko + ' KO'); await o.navigateur.close(); process.exit(ko ? 1 : 0);
