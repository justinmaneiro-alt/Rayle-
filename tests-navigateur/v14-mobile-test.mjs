// V14 : le tableau vivant dans la coque mobile (téléphone et tablette), lu dans le paquet publié par le PC (faux Worker, vraies données de la fixture). Pas de carnet sur le téléphone : la raison est dite.
//   node tests-navigateur/v14-mobile-test.mjs        captures : docs/captures-v14/
import fs from 'node:fs';
import { ouvrirMobile, attendre, texte, existe } from './v8-aide.mjs';
fs.mkdirSync('docs/captures-v14', { recursive: true });
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) { ok++; console.log('OK  ' + n); } else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const ev = (p, f, ...a) => p.evaluate(f, ...a);
const pixels = (p, sel) => ev(p, s => { const c = document.querySelector(s); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }, sel);
for (const cle of ['telephone', 'tablette']) {
  console.log('\n══ ' + cle + ' ══');
  const o = await ouvrirMobile(cle, { attente: 3800, scenario: { agent: 'volume' } }), p = o.page, erreurs = []; p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  await ev(p, () => MobileCoque.aller('agent')); await p.waitForSelector('#m-agent .vv-pf-grand', { timeout: 25000 }).catch(() => {}); await attendre(1500);
  const t = await texte(p, '#m-agent .vv');
  v('le tableau vivant est la vue principale de l’écran Agent', await existe(p, '#m-agent .vv .vv-pf-grand'));
  v('barre d’état : « simulation, aucun ordre réel », dernière bougie, copie du Worker', /simulation, aucun ordre réel/.test(t) && /dernière bougie/.test(t) && /copie du Worker/.test(t), t.slice(0, 200).replace(/\n/g, ' | '));
  v('portefeuille virtuel SIMULÉ avec capital de départ 10 000 $', /SIMULÉ/.test(t) && /10.000 \$/.test(t));
  v('graphique et volume net dessinés', (await pixels(p, '#m-agent [data-vv="graph"]')) > 3000 && (await pixels(p, '#m-agent [data-vv="net"]')) > 300);
  v('phrase « acheteurs / vendeurs dominent depuis X min »', /(acheteurs|vendeurs) dominent depuis \d+ min/.test(t));
  v('carnet : la raison est dite (lisible depuis le PC seulement)', /lisible que depuis le PC/.test(t));
  v('positions d’avant : « REJOUÉ, pas réel »', /REJOUÉ, pas réel/.test(t));
  const g = await ev(p, () => { const pane = document.querySelector('#m-agent'), b = [...document.querySelectorAll('#m-agent .vv-seg button')]; return { deb: pane.scrollWidth > pane.clientWidth + 2, boutons: b.every(x => x.getBoundingClientRect().height >= 40), gr: document.querySelector('#m-agent [data-vv="graph"]').getBoundingClientRect().width, w: innerWidth }; });
  v('pas de défilement horizontal, boutons tactiles ≥ 40 px, graphique pleine largeur', !g.deb && g.boutons && g.gr > g.w * 0.7, JSON.stringify(g));
  await ev(p, () => document.querySelector('#m-agent [data-tf="M15"]').click()); await attendre(500);
  v('bascule M15 sur le téléphone', await ev(p, () => document.querySelector('#m-agent [data-tf="M15"]').getAttribute('aria-selected') === 'true') && (await pixels(p, '#m-agent [data-vv="graph"]')) > 3000);
  await p.screenshot({ path: `docs/captures-v14/mobile-${cle}-tableau.png` });
  await ev(p, () => { document.querySelector('#m-agent .m-vv-simple').open = true; }); await attendre(600);
  v('la vue simple de l’agent et « Détails » sont toujours accessibles', await existe(p, '#m-agent .m-vv-simple .al'));
  v('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
  await o.fermer();
}
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
