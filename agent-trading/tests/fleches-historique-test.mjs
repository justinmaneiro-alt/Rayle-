/* Historique des flèches v8 : règles figées (sceau), calcul par morceaux = rejeu d'une seule passe = flux bougie par bougie (non-repaint), cache, trades simulés, hasard, Holm.
   node agent-trading/tests/fleches-historique-test.mjs  (depuis la racine) */
import { serie13 } from '../recherche-or/fleches-v6-diag.mjs'; import { sceau } from '../recherche-or/historique-sceller.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as V8 from '../front/or/fleches-simples-v8.js'; import { zonesDirect } from '../front/or/zones-direct.js'; import { atrSerie } from '../front/or/fleches-terminal-v1.js';
import { calculerHistorique, historiqueAvecCache, empreinteRegles, empreinteSerie, colorees, depuisFenetre, FENETRES } from '../front/or/fleches-historique-v1.js';
import { simulerTrade, stats, courbes, holm, verdict, hasard, graine, analyserEnsembles, PARAMS, fraisUsd, REGLAGE_T } from '../front/or/fleches-bilan-v1.js';
import { texteBilan, fenetreValide, FEN_DEFAUT } from '../front/or/fleches-historique-ui.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3; let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
// ── 1. règles figées
const sc = await sceau(), ref = JSON.parse(fs.readFileSync(path.join(ici, '../recherche-or/historique-fleches-sceau.json'), 'utf8'));
v('sceau : les règles de la v8 sont celles scellées avant l\'étude', sc.sha256Global === ref.sha256Global, sc.sha256Global + ' ≠ ' + ref.sha256Global);
v('sceau : fichiers de règles + paramètres', Object.keys(ref.fichiers).length >= 25 && ref.sha256Parametres === sc.sha256Parametres);
// ── 2. morceaux = une seule passe (série de référence)
const K = serie13(), one = V8.rejouer(K, zonesDirect, {}), cle = f => f.id;
let cedes = 0; const progres = [];
const ch = await calculerHistorique(K, { depart: V8.DEPART, morceau: 350, cede: async () => { cedes++; await new Promise(r => setTimeout(r)); }, onProgres: p => progres.push(p) });
const a = new Map(one.toutes.map(f => [cle(f), f])), b = new Map(ch.fleches.map(f => [cle(f), f]));
v('morceaux : mêmes flèches que le rejeu d\'une seule passe', a.size === b.size && [...a.keys()].every(k => b.has(k)), `${a.size} vs ${b.size}`);
v('morceaux : mêmes drapeaux (grise, invalidée) et mêmes bougies', [...a.keys()].every(k => !!a.get(k).contre === !!b.get(k).contre && !!a.get(k).invalidee === !!b.get(k).invalidee && a.get(k).i === b.get(k).i));
v('calcul par morceaux : l\'interface reprend la main entre deux morceaux', cedes >= 3, 'cede appelé ' + cedes + ' fois');
v('progression croissante jusqu\'à 100 %', progres.length >= 3 && progres.every((x, i) => i === 0 || x >= progres[i - 1]) && progres.at(-1) === 1);
// ── 3. non-repaint : la flèche d'une bougie ne change pas quand la série grandit (flux simulé bougie par bougie)
let nr = true, nrMsg = '';
for (const n of [900, 1100, 1300, K.length]) {
  const vus = V8.rejouer(K.slice(0, n), zonesDirect, { depart: Math.max(V8.DEPART, n - 500) }).toutes.map(cle), hors = vus.filter(k => !b.has(k));
  if (hors.length) { nr = false; nrMsg += ` n=${n}: flèche du flux absente de l'historique ${hors[0]}`; }
}
v('non-repaint : toute flèche posée par le flux simulé existe, identique, dans l\'historique', nr, nrMsg);
const actuelle = V8.calculer(K, zonesDirect, { maintenant: K.at(-1).t + H, bougies: 1e5 });
v('flèches récentes identiques à celles de la v8 actuelle (calculer)', actuelle.fleches.every(f => b.has(f.id) && !!b.get(f.id).contre === !!f.contre && !!b.get(f.id).invalidee === !!f.invalidee), `v8 ${actuelle.fleches.length}, historique ${ch.fleches.length}`);
v('v8 actuelle : 46 flèches sur la série de référence (inchangée)', actuelle.fleches.length === 46);
// ── 4. cache : même série = cache ; série prolongée = calcul de la fin seulement, résultat identique au calcul complet
const mem = new Map(), cache = { async lire(k) { return mem.get(k) || null; }, async ecrire(k, x) { mem.set(k, structuredClone(x)); return true; } };
const B1 = K.slice(0, 1100), B2 = K.slice(0, 1130), r1 = await historiqueAvecCache(B1, cache), r1b = await historiqueAvecCache(B1, cache);
v('cache : second appel sur la même série = lu dans le cache', r1b.depuisCache === true && r1b.fleches.length === r1.fleches.length);
const r2 = await historiqueAvecCache(B2, cache), pleine = await calculerHistorique(B2, {});
v('cache : série prolongée → reprise, mêmes flèches que le calcul complet', r2.reprise === true && r2.fleches.length === pleine.fleches.length && r2.fleches.every(f => pleine.fleches.some(g => g.id === f.id && !!g.contre === !!f.contre && !!g.invalidee === !!f.invalidee)), `${r2.fleches.length} vs ${pleine.fleches.length}`);
v('cache : empreintes (règles et série) stables et sensibles', empreinteRegles() === empreinteRegles() && empreinteSerie(B1) !== empreinteSerie(B2) && /^[0-9a-f]{16}$/.test(empreinteRegles()));
const cache0 = await historiqueAvecCache(K.slice(0, 1100), { async lire() { return null; }, async ecrire() { return false; } }); v('cache indisponible : le calcul se fait quand même', cache0.fleches.length > 0);
// ── 5. fenêtres
const n0 = Date.UTC(2026, 10, 13);
v('fenêtres : 1 mois / 3 mois / 6 mois / tout', depuisFenetre('1m', n0) === n0 - 30 * 864e5 && depuisFenetre('3m', n0) === n0 - 91 * 864e5 && depuisFenetre('6m', n0) === n0 - 182 * 864e5 && depuisFenetre('tout', n0) === 0 && Object.keys(FENETRES).join() === '1m,3m,6m,tout');
v('fenêtre par défaut : 3 mois ; valeur inconnue → 3 mois', FEN_DEFAUT === '3m' && fenetreValide('x') === '3m' && fenetreValide('6m') === '6m');
// ── 6. trades simulés (séries fabriquées à la main)
const bar = (o, h, l, c, i = 0) => ({ t: 1e12 + i * H, o, h, l, c, v: 1 }), mk = L => L.map((x, i) => bar(...x, i)), plat = (n, x) => Array.from({ length: n }, () => x);
const sig = (dir, E, stop) => { const r = (E - stop) * dir; return { dir, entree: E, stop, r, rAtr: 1, tp1: E + dir * r, tp2: E + dir * 2 * r }; }, sans = { ...PARAMS, spreadPb: 0, glissementPb: 0 };
let t = simulerTrade(mk([[100, 100, 100, 100], [100, 100.5, 97.5, 98], ...plat(50, [98, 98, 98, 98])]), 0, sig(1, 100, 98), sans); v('trade : stop = −1 R', t.raison === 'stop' && Math.abs(t.R + 1) < 1e-9, JSON.stringify(t));
t = simulerTrade(mk([[100, 100, 100, 100], [100, 106, 100, 105], ...plat(50, [105, 105, 105, 105])]), 0, sig(1, 100, 98), sans); v('trade : TP2 atteint = +1,5 R (moitié à 1 R, moitié à 2 R)', t.raison === 'tp2' && Math.abs(t.R - 1.5) < 1e-9, JSON.stringify(t));
t = simulerTrade(mk([[100, 100, 100, 100], [100, 102.5, 99.5, 102], [102, 102, 97, 97.5], ...plat(50, [98, 98, 98, 98])]), 0, sig(1, 100, 98), sans); v('trade : TP1 puis stop = 0 R', t.raison === 'tp1-puis-stop' && Math.abs(t.R) < 1e-9, JSON.stringify(t));
t = simulerTrade(mk([[100, 100, 100, 100], [100, 107, 96, 100], ...plat(50, [100, 100.5, 99.5, 100])]), 0, sig(1, 100, 98), sans); v('trade : stop et cible dans la même bougie : le stop', t.raison === 'stop' && Math.abs(t.R + 1) < 1e-9, JSON.stringify(t));
t = simulerTrade(mk([[100, 100, 100, 100], [95, 96, 94, 95], ...plat(50, [95, 95, 95, 95])]), 0, sig(1, 100, 98), sans); v('trade : trou sous le stop = exécuté à l\'ouverture (−2,5 R)', Math.abs(t.R + 2.5) < 1e-9, JSON.stringify(t));
t = simulerTrade(mk([[100, 100, 100, 100], ...plat(60, [100, 100.5, 99.5, 101])]), 0, sig(1, 100, 98), sans); v('trade : sortie forcée à la 48e bougie', t.raison === 'temps' && t.iSortie === 48 && Math.abs(t.R - 0.5) < 1e-9, JSON.stringify(t));
t = simulerTrade(mk([[100, 100, 100, 100], [100, 100.5, 97.5, 98], ...plat(50, [98, 98, 98, 98])]), 0, sig(-1, 100, 102), sans); v('trade : vente dont le stop (au-dessus) n\'est pas touché', t.dir === -1 && t.raison !== 'stop');
t = simulerTrade(mk([[100, 100, 100, 100], [100, 98.6, 95.5, 96], ...plat(50, [97.5, 97.5, 97.5, 97.5])]), 0, sig(-1, 100, 102), sans); v('trade : vente, TP2 = +1,5 R', t.dir === -1 && t.raison === 'tp2' && Math.abs(t.R - 1.5) < 1e-9, JSON.stringify(t));
v('trade : série trop courte (issue inconnue) = non compté', simulerTrade(mk([[100, 100, 100, 100], [100, 100.4, 99.6, 100]]), 0, sig(1, 100, 98), sans) === null);
const avecFrais = simulerTrade(mk([[4000, 4000, 4000, 4000], [4000, 4010, 3990, 4004], ...plat(50, [4004, 4004, 4004, 4004])]), 0, sig(1, 4000, 3980), PARAMS); v('frais : 1,5 pb du prix (0,60 $ à 4 000 $) retirés en R', Math.abs(fraisUsd(4000) - 0.6) < 1e-9 && Math.abs((avecFrais.R - avecFrais.Rnet) - 0.6 / 20) < 1e-9, JSON.stringify(avecFrais));
// ── 7. statistiques, Holm, verdict
const mkT = (Rnet, dir = 1, i = 0) => ({ R: Rnet, Rnet, dir, tEntree: 1e12 + i * H * 60, tSortie: 1e12 + i * H * 60 + H, raison: Rnet > 0 ? 'tp2' : 'stop' });
const s30 = stats(Array.from({ length: 40 }, (_, i) => mkT(i % 2 ? 1.5 : -1, 1, i))); v('stats : n, taux de réussite, R moyen, profit factor', s30.n === 40 && s30.assez && Math.abs(s30.reussite - 0.5) < 1e-9 && Math.abs(s30.RmoyNet - 0.25) < 1e-9 && Math.abs(s30.pfNet - 1.5) < 1e-9 && s30.serieMax === 1);
v('stats : « pas assez de données » sous 30 trades', stats(plat(29, 0).map(() => mkT(1))).assez === false && verdict(stats(plat(29, 0).map(() => mkT(1))), 0.001) === 'pas assez de données');
v('Holm : p ajustées croissantes et plafonnées à 1', JSON.stringify(holm([0.01, 0.04, 0.03]).map(x => +x.toFixed(4))) === JSON.stringify([0.03, 0.06, 0.06]) && holm([0.9, 0.8]).every(x => x <= 1));
v('verdict : jamais « mieux que le hasard » sans p corrigée < 0,05', verdict(s30, 0.2) === 'pas mieux que le hasard' && verdict(s30, 0.01).startsWith('mieux que le hasard'));
v('série perdante la plus longue', stats([-1, -1, 1, -1, -1, -1, 1].map((x, i) => mkT(x, 1, i))).serieMax === 3);
const cb = courbes([mkT(1), mkT(-1, 1, 1), mkT(2, 1, 2)]); v('courbes : sans composé = 1 + 0,5 % × ΣR ; composé ; drawdown', Math.abs(cb.finSimple - (1 + 0.005 * 2)) < 1e-9 && Math.abs(cb.finCompose - 1.005 * 0.995 * 1.01) < 1e-9 && cb.ddSimple > 0.0049);
// ── 8. hasard sur une série sans avantage
{
  const rnd = graine(7), B = []; let p = 1000; for (let i = 0; i < 4000; i++) { const o = p; p *= 1 + (rnd() - 0.5) * 0.004; B.push({ t: 1e12 + i * H, o, h: Math.max(o, p) * 1.0008, l: Math.min(o, p) * 0.9992, c: p, v: 1 }); }
  const A = atrSerie(B), reels = [], el = []; for (let i = 300; i < 3900; i++) el.push(i);
  const r2 = graine(3); for (let k = 0; k < 60; k++) { const i0 = 300 + Math.floor(r2() * 3500), E = B[i0].c, r = A[i0] * 1.2, x = simulerTrade(B, i0, { dir: 1, entree: E, stop: E - r, r, rAtr: 1.2, tp1: E + r, tp2: E + 2 * r }, PARAMS); if (x) reels.push(x); }
  const h = hasard(B, A, { dir: 1, reels, eligibles: el });
  v('hasard : 1 000 tirages, p et place du réel entre 0 et 1', h && h.p > 0 && h.p <= 1 && h.place >= 0 && h.place <= 1 && h.q05 <= h.q95, JSON.stringify(h));
  v('hasard : reproductible (même graine = même résultat)', JSON.stringify(hasard(B, A, { dir: 1, reels, eligibles: el })) === JSON.stringify(h));
  const bil = analyserEnsembles(B, A, [], { depart: 260 }); v('bilan sans flèche : aucun trade, « pas assez de données » partout', bil.T.length === 0 && Object.values(bil.verd).every(x => x === 'pas assez de données'));
}
// ── 9. carte : texte, avertissements, n < 30
const res = { S: { 'avant|tous': stats(Array.from({ length: 40 }, (_, i) => mkT(i % 3 ? 1.5 : -1, 1, i))), 'avant|achats': { n: 12, assez: false }, 'avant|ventes': { n: 0 }, 'apres|tous': { n: 3, assez: false }, 'apres|achats': { n: 1 }, 'apres|ventes': { n: 2 } }, Hs: { 'avant|tous': { moyHasard: 0.01, place: 0.6 } }, verd: { 'avant|tous': 'pas mieux que le hasard' }, padj: {} };
const html = texteBilan(res, { avant: 40, apres: 3 }, '3m');
v('carte : « règles réglées sur la période récente : le hors échantillon est la partie utile »', html.includes('Règles réglées sur la période récente : le hors échantillon est la partie utile'));
v('carte : « pas assez de données » sous 30, frais indiqués, avant / après séparés', (html.match(/pas assez de données/g) || []).length >= 4 && html.includes('spread 1 pb') && html.includes('Avant la période de réglage') && html.includes('Depuis le 1er octobre 2026'));
v('période de réglage : 1er octobre 2026', REGLAGE_T === Date.UTC(2026, 9, 1));
console.log(ko ? `ÉCHECS : ${ko} (réussis : ${ok})` : `fleches-historique-test : ${ok} vérifications OK`); process.exit(ko ? 1 : 0);
