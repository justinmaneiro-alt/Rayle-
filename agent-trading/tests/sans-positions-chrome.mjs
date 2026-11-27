/* Test Chrome « sans positions » sur le chemin RÉEL (or.html + integration.js, SANS ?pro=1) : les lignes « Entrée … (Lecture) », « Stop … · −1 R », « Cible … · 1,8 R brut » et le bloc
   « Lecture · Entrée … » ne sont plus dessinés sur le graphique (avec ou sans ICT), sauf si la couche « Positions de Rayle sur le graphique » est cochée (éteinte par défaut).
   Prérequis : node serveur.mjs 8011. Usage : node agent-trading/tests/sans-positions-chrome.mjs [tab1440] ; REEL=1 : vraies bougies ; CAPTURES : dossier. */
import fs from 'node:fs';
import { initPrix, lancer, ouvrir, VUES, w, SOURCE } from './ict-visuel-aide.mjs';
let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; };
const DOSSIER = process.env.CAPTURES || 'captures-or'; fs.mkdirSync(DOSSIER, { recursive: true }); await initPrix(); console.log('données :', SOURCE);
const nav = await lancer(), PREF = process.env.PREFIXE || 'sans-positions';
const unite = (p, u) => p.evaluate(x => { document.querySelector(`[data-periode="${x}"]`).click(); }, u).then(() => p.waitForFunction(x => window.__or.moteur.S.periode === x && window.__or.moteur.serie().length > 100, { timeout: 30000 }, u).catch(() => {})).then(() => w(1500));
/* espionne fillText : tout texte « Entrée / Stop / Cible / Lecture · » écrit sur le canvas pendant un redessin */
const espion = p => p.evaluate(() => { window.__textes = []; if (!window.__espion) { window.__espion = true; const f = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__textes.push(String(t)); return f.call(this, t, ...a); }; } });
const POS = /^(Entrée \d|Stop \d|Cible \d|Lecture · Entrée)/;
const poser = p => p.evaluate(() => { const g = window.__or.graph, B = g.etat().bougies, d = B[B.length - 5], px = B[B.length - 1].c;
  g.propositions([{ tCloture: d.t, entree: px, stop: px - 8, cible: px + 14.4, rBrut: 1.8, nom: 'Test', etiquette: 'Lecture', type: 'test' }]); });
const lire = p => p.evaluate(async () => { window.__textes = []; const g = window.__or.graph, B = g.etat().bougies, d = B[B.length - 5], px = B[B.length - 1].c; g.propositions([{ tCloture: d.t, entree: px, stop: px - 8, cible: px + 14.4, rBrut: 1.8, nom: 'Test', etiquette: 'Lecture', type: 'test' }]); await new Promise(r => setTimeout(r, 400)); return window.__textes.filter(t => /^(Entrée \d|Stop \d|Cible \d|Lecture · Entrée)/.test(t)); });
for (const vue of [process.argv[2] || 'tab1440']) {
  const p = await ouvrir(nav, VUES[vue]); await espion(p);
  v(await p.evaluate(() => !/pro=1/.test(location.search)), `${vue} : chemin réel, sans ?pro=1`);
  v(await p.evaluate(() => window.__or.graph.couches().positionsRayle === false), `${vue} : la couche « Positions de Rayle sur le graphique » existe, éteinte par défaut`);
  v(await p.evaluate(() => /Positions de Rayle sur le graphique/.test(document.querySelector('.tor-couches-corps, .tor-couches') ? document.body.innerHTML : '')), `${vue} : la couche figure dans la liste des couches`);
  for (const u of ['M15', 'H4']) {
    await unite(p, u);
    let t = await lire(p); v(t.length === 0, `${vue} ${u} sans ICT : aucune ligne Entrée / Stop / Cible (${t.join(' | ') || 'aucune'})`);
    await p.evaluate(() => { if (!document.querySelector('.tp-b-ict').classList.contains('actif')) document.querySelector('.tp-b-ict').click(); }); await w(2500);
    await p.evaluate(() => window.__or.ict.mode('complet')); await w(1500);
    t = await lire(p); v(t.length === 0, `${vue} ${u} ICT Complet : aucune ligne Entrée / Stop / Cible (${t.join(' | ') || 'aucune'})`);
    v(await p.evaluate(() => window.__or.graph.ictEtat().carres.length > 0), `${vue} ${u} ICT Complet : les petits carrés ICT sont toujours là`);
    await p.screenshot({ path: `${DOSSIER}/${PREF}-${vue}-${u}-complet.png` });
    await p.evaluate(() => document.querySelector('.tp-b-ict').click()); await w(1500);
  }
  /* témoin positif : couche cochée → les lignes reviennent */
  await p.evaluate(() => window.__or.graph.couches({ positionsRayle: true })); const t2 = await lire(p);
  v(t2.length >= 3, `${vue} : couche cochée, les lignes reviennent (${t2.length})`);
  await p.evaluate(() => window.__or.graph.couches({ positionsRayle: false }));
  v(p.__err.length === 0, `${vue} : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`);
  await p.close();
}
await nav.close(); console.log(ko ? `${ko} échec(s)` : 'tous les tests Chrome passent'); process.exit(ko ? 1 : 0);
