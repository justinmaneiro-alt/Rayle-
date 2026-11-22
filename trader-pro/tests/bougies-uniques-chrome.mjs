/* BLOQUANT (v12) : « mêmes bougies partout ». Pour chaque actif de la page et chaque unité (H1, H4, Jour), les 300 dernières bougies du Classique et du mode Volume
   doivent être identiques (date, ouverture, plus haut, plus bas, clôture) ; la dernière bougie peut avoir bougé de moins de 1 % (en cours).
   Usage : node trader-pro/tests/bougies-uniques-chrome.mjs [tablette|pc] [OR,NASDAQ,SP500,BTC,SOL,EURUSD,USDCHF,DXY] [H1,H4,J]
   Prérequis : node serveur.mjs 8000 ; accès réseau. Code de sortie 1 au moindre écart. */
import { lancer, w } from './aide-chrome.mjs';
import { comparer } from '../commun/bougies-uniques.js';
const vue = process.argv[2] || 'tablette', actifs = (process.argv[3] || 'OR,NASDAQ,SP500,BTC,SOL,EURUSD,USDCHF,DXY').split(','), unites = (process.argv[4] || 'H1,H4,J').split(',');
const ECH = { DXY: 100, EURUSD: 10000, USDCHF: 10000 };
let echecs = 0;
for (const A of actifs) {
  const T = await lancer(vue, { dossierCaptures: 'donnees-privees/captures-v12', vraiNavigateur: true, stockage: { rayle_donnees_base: '', rayle_piper_precharge: '0' } }), { p, verif, attendre, fin: _fin } = T;
  await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1&actif=' + A, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!await attendre(() => p.evaluate(() => !!window.__orPro && !!window.__tpVolume), 90000)) { console.log(A + ' : terminal non monté'); echecs++; await T.nav.close(); continue; }
  await w(3000);
  for (const u of unites) {
    await p.evaluate(x => { const b = document.querySelector('[data-periode="' + x + '"]'); if (b) b.click(); }, u);
    await attendre(() => p.evaluate(x => { const S = window.__or.moteur.S; return S.periode === x && !S.chargement && S.k.length > 50; }, u), 90000); await w(1500);
    const mode = await p.evaluate(() => { const b = document.querySelector('.tp-mode [data-mode="volume"]'); return b && b.getAttribute('aria-pressed'); });
    if (mode !== 'true') await p.evaluate(() => document.querySelector('.tp-mode [data-mode="volume"]').click());
    await p.evaluate(x => { const e = window.__tpVolume.etat(); if (e && e.unite !== x) window.__tpVolume.definir({ unite: x }); }, u);
    const pret = await attendre(() => p.evaluate(x => { const e = window.__tpVolume.etat(); return e && e.charge && e.unite === x && window.__tpVolume.barres().length > 50; }, u), 90000);
    await w(4000);   // laisse l'historique long s'ajouter
    const D = await p.evaluate(x => ({ cl: window.__or.moteur.serie().map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })), vo: window.__tpVolume.barres().map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })), u: x }), u);
    const K = ECH[A] || 1, cl = D.cl.map(b => ({ ...b, o: b.o / K, h: b.h / K, l: b.l / K, c: b.c / K }));
    const R = pret ? comparer(cl, D.vo, { n: 300 }) : { ok: false, diffs: [{ type: 'volume non chargé' }], n: 0 };
    const d = t => (t ? new Date(t).toISOString().slice(0, 16) : '—');
    console.log(`${R.ok ? '✓' : '✗'} ${A} ${u} : ${R.n} bougies comparées, dernière ${d(R.dernierA)} / ${d(R.dernierB)}${R.ok ? '' : ' · ' + JSON.stringify(R.diffs.slice(0, 3))}`);
    if (!R.ok) echecs++;
  }
  await T.nav.close();
}
console.log(echecs ? `✗ ${echecs} échec(s) : la publication est bloquée` : 'tout passe : mêmes bougies dans le Classique et le Volume');
process.exit(echecs ? 1 : 0);
