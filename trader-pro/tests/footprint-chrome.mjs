/* Test Chrome du footprint (v4.1). Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <clone de donnees> 8801 ; accès réseau (Binance).
   L'archive footprint est servie depuis un dossier LOCAL produit par `node outils-donnees/footprint-historique.mjs --sortie <dossier> --jours 25` (variable FP_LOCAL) : même fichiers que la branche footprint.
   Usage : FP_LOCAL=<dossier> node trader-pro/tests/footprint-chrome.mjs [tel|tablette|pc] */
import fs from 'node:fs'; import path from 'node:path';
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', local = process.env.FP_LOCAL ? path.resolve(process.env.FP_LOCAL) : null;
const intercept = async (r, u) => {
  const m = u.match(/^https:\/\/raw\.githubusercontent\.com\/justinmaneiro-alt\/Rayle-\/footprint\/([^?]+)/); if (!m || !local) return false;
  const f = path.join(local, m[1]); if (!fs.existsSync(f)) { r.respond({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'absent' }); return true; }
  r.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': /\.gz$/.test(f) ? 'application/octet-stream' : 'application/json' }, body: fs.readFileSync(f) }); return true;
};
const T = await lancer(mode, { interception: intercept }), { p, verif, attendre, capture, fin } = T;
const etat = () => p.evaluate(() => window.__tpVolume.etat());
await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!window.__tpVolume), 60000), 'le terminal pro est monté');
await p.evaluate(() => window.__tpVolume.ouvrirMode({ actif: 'or', unite: 'H1' }));
verif(await attendre(() => p.evaluate(() => { const e = window.__tpVolume.etat(); return e && (e.charge || e.erreur); }), 60000), 'le mode Volume a répondu');
let e = await etat(); verif(e.charge && e.bougies > 200, 'or H1 : ' + e.bougies + ' bougies');
verif(await attendre(async () => (await etat()).fp.index, 15000), 'index de l’archive footprint chargé'); e = await etat(); console.log('  archive :', JSON.stringify(e.fp.info));
/* dézoomé : affichage v4 (V et Δ) */
await p.evaluate(() => window.__tpVolume.zoomer(60)); await w(1200); e = await etat(); verif(e.fp.rendu && e.fp.rendu.actif === false, 'dézoomé : pas d’empreinte, affichage V / Δ de la v4 (espacement ' + (e.fp.rendu && e.fp.rendu.esp) + ' px)');
/* aujourd'hui : l'archive du jour n'existe pas encore → direct + rattrapage, bougies « partielles » dites */
await p.evaluate(() => window.__tpVolume.zoomer(4)); await attendre(async () => { const x = await etat(); return x.fp.rendu && x.fp.rendu.actif && x.fp.rendu.bougies >= 1; }, 90000); await w(1500); e = await etat(); console.log('  aujourd’hui :', JSON.stringify(e.fp.rendu), JSON.stringify(e.fp.rattrapage));
verif(e.fp.rendu && e.fp.rendu.actif && e.fp.rendu.bougies >= 1, 'jour en cours : empreinte reçue en direct / rattrapée (' + (e.fp.rendu && e.fp.rendu.bougies) + ' bougies, ' + (e.fp.rendu && e.fp.rendu.partielles) + ' partielles)'); await capture('footprint-0-aujourdhui');
/* zoomé sur des bougies archivées (hier et avant-hier) */
await p.evaluate(() => window.__tpVolume.zoomer(6, 40)); await attendre(async () => { const x = await etat(); return x.fp.rendu && x.fp.rendu.actif && x.fp.rendu.bougies >= 3; }, 20000); await w(1500); e = await etat(); console.log('  rendu :', JSON.stringify(e.fp.rendu));
verif(e.fp.rendu && e.fp.rendu.actif && e.fp.rendu.bougies >= 3, 'zoom : empreinte dans les bougies visibles (' + (e.fp.rendu && e.fp.rendu.bougies) + ' bougies, case ' + (e.fp.rendu && e.fp.rendu.pas) + ' $)');
await capture('footprint-1-or-h1-bidask');
/* trois modes */
for (const m of ['delta', 'volume', 'bidask']) { await p.evaluate(x => { const s = document.querySelector('.tpv [data-opt-select="empMode"]'); s.value = x; s.dispatchEvent(new Event('change', { bubbles: true })); }, m); await attendre(async () => { const x = await etat(); return x.fp.rendu && x.fp.rendu.actif && x.fp.rendu.bougies >= 3 && !x.fp.chargement; }, 15000); await w(500); await capture('footprint-2-mode-' + m); e = await etat(); verif(e.fp.rendu.actif && e.fp.rendu.bougies >= 3, 'mode ' + m + ' : empreinte affichée'); }
/* la note de bas de page ne dit plus que l'historique est court */
const note = await p.evaluate(() => document.querySelector('.tpv [data-note]').textContent); console.log('  note :', note.slice(-260));
verif(!/historique de transactions gratuit est court/.test(note) && /Empreinte : archive Binance du/.test(note), 'pied de page : l’archive est annoncée (plus de « historique court »)');
/* H4, Daily : bougies anciennes sans archive → mention claire */
for (const u of ['H4', 'J']) {
  await p.evaluate(x => document.querySelector(`.tpv [data-unite="${x}"]`).click(), u); await attendre(async () => { const x = await etat(); return x.charge && x.unite === u; }, 40000); await w(800);
  await p.evaluate(x => window.__tpVolume.zoomer(5, x === 'H4' ? 8 : 2), u); await attendre(async () => { const x = await etat(); return x.fp.rendu && x.fp.rendu.bougies >= 1; }, 20000); await w(1200); e = await etat(); console.log('  ' + u + ' :', JSON.stringify(e.fp.rendu));
  verif(e.fp.rendu && e.fp.rendu.actif && e.fp.rendu.bougies >= 1, u + ' : empreinte lisible (' + (e.fp.rendu && e.fp.rendu.bougies) + ' bougies, case ' + (e.fp.rendu && e.fp.rendu.pas) + ' $)'); await capture('footprint-3-or-' + u);
  await p.evaluate(x => window.__tpVolume.zoomer(5, x === 'H4' ? 1000 : 100), u); await attendre(async () => { const x = await etat(); return x.fp.rendu && x.fp.rendu.actif; }, 10000); await w(1200); e = await etat();
  verif(e.fp.rendu && e.fp.rendu.sansEmpreinte >= 1 && e.fp.rendu.bougies === 0, u + ' : bougies anciennes (avant l’archive) marquées « pas d’empreinte » (' + (e.fp.rendu && e.fp.rendu.sansEmpreinte) + ')'); await capture('footprint-4-ancien-' + u);
}
/* niveaux de réaction (phase 3) : or Daily et H4, à l'œil (captures) et par les chiffres */
for (const u of ['J', 'H4']) {
  await p.evaluate(x => window.__tpVolume.definir({ actif: 'or', unite: x }), u); await attendre(async () => { const x = await etat(); return x.charge && x.unite === u && x.actif === 'or'; }, 40000); await w(1500);
  await p.evaluate(() => window.__tpVolume.zoomer(160)); await w(2500); e = await etat();
  console.log('  réaction or ' + u + ' :', JSON.stringify(e.reaction.map(n => [Math.round(n.prix), n.reactions, n.forceRel, n.sources.join('+')])));
  verif(e.reaction.length >= 1 && e.reaction.length <= 6 && e.reaction.every(n => n.reactions >= 2 && n.forceRel > 0), 'or ' + u + ' : ' + e.reaction.length + ' niveau(x) de réaction (1 à 6, au moins 2 réactions chacun)'); await capture('reaction-or-' + u);
}
const phrase = await p.evaluate(() => window.__tpVolume.reaction()); console.log('  voix :', phrase); verif(/Niveaux de réaction de l’or|Je ne trouve pas/.test(phrase), 'Rayle annonce les niveaux de réaction');
verif(await p.evaluate(() => /Niveaux de réaction/.test(document.querySelector('.tpv-droite').textContent)), 'liste « Niveaux de réaction » dans le panneau de droite');
/* Bitcoin H1 */
await p.evaluate(() => window.__tpVolume.definir({ actif: 'btc', unite: 'H1' })); await attendre(async () => { const x = await etat(); return x.charge && x.actif === 'btc' && x.unite === 'H1'; }, 40000); await w(800);
await p.evaluate(() => window.__tpVolume.zoomer(6, 40)); await attendre(async () => { const x = await etat(); return x.fp.rendu && x.fp.rendu.bougies >= 3; }, 25000); await w(1500); e = await etat(); console.log('  btc H1 :', JSON.stringify(e.fp.rendu));
verif(e.fp.rendu && e.fp.rendu.bougies >= 3, 'Bitcoin H1 : empreinte (case ' + (e.fp.rendu && e.fp.rendu.pas) + ' $)'); await capture('footprint-5-btc-h1');
/* Bitcoin H4 et Daily */
for (const u of ['H4', 'J']) { await p.evaluate(x => window.__tpVolume.definir({ actif: 'btc', unite: x }), u); await attendre(async () => { const x = await etat(); return x.charge && x.actif === 'btc' && x.unite === u; }, 40000); await w(800);
  await p.evaluate(x => window.__tpVolume.zoomer(5, x === 'H4' ? 8 : 2), u); await attendre(async () => { const x = await etat(); return x.fp.rendu && x.fp.rendu.bougies >= 1; }, 25000); await w(1200); e = await etat(); console.log('  btc ' + u + ' :', JSON.stringify(e.fp.rendu));
  verif(e.fp.rendu && e.fp.rendu.bougies >= 1, 'Bitcoin ' + u + ' : empreinte (case ' + (e.fp.rendu && e.fp.rendu.pas) + ' $)'); await capture('footprint-5b-btc-' + u); }
/* fluidité : temps de dessin de l'empreinte et de l'affichage V / Δ avec beaucoup de bougies (le rendu logiciel du banc est bien plus lent qu'un vrai appareil) */
await p.evaluate(() => window.__tpVolume.definir({ actif: 'or', unite: 'H1' })); await attendre(async () => { const x = await etat(); return x.charge && x.actif === 'or' && x.unite === 'H1'; }, 40000); await w(800);
await p.evaluate(() => window.__tpVolume.zoomer(6, 40)); await w(2500); e = await etat(); console.log('  temps de dessin, empreinte (ms) :', JSON.stringify({ moy: e.fp.rendu.msMoy, max: e.fp.rendu.msMax, bougies: e.bougies })); verif(e.fp.rendu.msMoy != null && e.fp.rendu.msMoy < 120, 'empreinte : dessin en moyenne ' + (e.fp.rendu.msMoy || 0).toFixed(1) + ' ms (4 500 bougies chargées, seules les visibles sont dessinées)');
await p.evaluate(() => window.__tpVolume.zoomer(400)); await w(2500); e = await etat(); console.log('  400 bougies visibles :', JSON.stringify(e.fp.rendu)); verif(e.fp.rendu.actif === false, '400 bougies visibles : pas d’empreinte (trop serré), affichage léger');
/* Nasdaq : jamais d'empreinte, mention claire */
await p.evaluate(() => window.__tpVolume.definir({ actif: 'us100', unite: 'H1' })); await attendre(async () => { const x = await etat(); return (x.charge || x.erreur) && x.actif === 'us100'; }, 40000); await w(800);
e = await etat(); if (e.charge) { await p.evaluate(() => window.__tpVolume.zoomer(6)); await w(2000); e = await etat(); verif(e.fp.rendu && e.fp.rendu.actif && e.fp.rendu.bougies === 0 && e.fp.rendu.sansEmpreinte >= 1, 'Nasdaq : pas d’empreinte, bougies marquées'); const n2 = await p.evaluate(() => document.querySelector('.tpv [data-note]').textContent); verif(/pas d’empreinte disponible pour cette période ou cet actif/.test(n2), 'Nasdaq : mention « pas d’empreinte disponible pour cette période ou cet actif »'); await capture('footprint-6-nasdaq'); }
else console.log('  (instantané Nasdaq pas disponible : vérification ignorée)');
await fin();
