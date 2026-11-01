// Synchronisation PC / tablette / téléphone : le portefeuille, le flottant, les ratios et le tableau d'historique sont IDENTIQUES au centime,
// même quand le téléphone ne reçoit qu'un paquet allégé (vrai constructeur de paquet, vrais calculs d'écran).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { construirePaquet, plafonner, MAX_OCTETS } from '../../agent-pc/bundle-mobile.mjs';
const C = createRequire(import.meta.url)('../../core/commun/volume-vivant-calcul.js');
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const proche = (a, b, m, tol = 0.005) => { n++; assert.ok(Math.abs(a - b) <= tol, m + ' (' + a + ' ≠ ' + b + ')'); };

/* ── données de test : 350 trades du mode Trader (le service n'en publie que les 300 derniers), 70 trades de volume, 3 positions vivantes ── */
const T0 = 1_800_000_000_000, H = 3600e3, NOW = T0 + 900 * H; let graine = 7; const alea = () => (graine = (graine * 1664525 + 1013904223) >>> 0) / 4294967296;
const texte = 'x'.repeat(260);
const trade = (i, actif, statut, extra = {}) => ({ id: 'T' + i, actif, setup: 'rebond', nom: 'Rebond ' + i, tf: 'M15', sens: i % 3 ? 1 : -1, tSignal: T0 + i * 2 * H, t: T0 + i * 2 * H, tValide: T0 + i * 2 * H + 4 * H, entree: 100 + (i % 5), stop: 99 + (i % 5), cible1: 102 + (i % 5), rr: 2, raison: texte, invalidation: texte, confiance: texte, confluences: ['a', 'b', 'c'], statut, ...extra });
const termine = (i, actif) => { const R = +(alea() < 0.45 ? 1.2 + alea() : -(0.7 + alea() * 0.4)).toFixed(3); return trade(i, actif, 'cloturee', { tEntree: T0 + i * 2 * H + 600e3, tSortie: T0 + i * 2 * H + 3 * H, resultat: { statut: 'cloturee', R, motif: R > 0 ? 'objectif' : 'stop' } }); };
const direct = []; for (let i = 0; i < 350; i++) direct.push(termine(i, ['BTC', 'SOL', 'DOGE'][i % 3]));
const ouvertes = [trade(900, 'BTC', 'ouverte', { tEntree: NOW - H, sens: 1, entree: 100, stop: 99, cible1: 103 }), trade(901, 'SOL', 'ouverte', { tEntree: NOW - 2 * H, sens: -1, entree: 100, stop: 101, cible1: 98 }), trade(902, 'DOGE', 'en_attente', { sens: 1 })];
const recentes = direct.slice(-300).reverse(), actives = ouvertes;
const signaux = []; for (let i = 0; i < 70; i++) { const R = +(alea() < 0.5 ? 1.5 + alea() : -(0.8 + alea() * 0.3)).toFixed(3); signaux.push({ id: 'SOL|c|' + i, actif: 'SOL', cle: 'c', setup: 'impulsion_volume', tf: 'M15', niveauPreuve: 'a_lessai', sens: i % 2 ? 1 : -1, niveau: 98 + (i % 4), stop: 97 + (i % 4) * (i % 2 ? 1 : 1), rr: 2, tSignal: T0 + i * 3 * H, tEntree: T0 + i * 3 * H + 900e3, tSortie: T0 + i * 3 * H + 2 * H, statut: 'terminee', R, resultat: 'cloturee', niv: 'x', raison: texte }); }
for (const s of signaux) s.stop = s.sens > 0 ? s.niveau - 1 : s.niveau + 1;   // stop du bon côté de l'entrée
const versPosition = x => ({ id: x.id, cle: x.cle, setup: x.setup, nom: 'Impulsion', tf: x.tf, niveauPreuve: x.niveauPreuve, sens: x.sens, entree: x.niveau, stop: x.stop, cible: x.sens > 0 ? x.niveau + x.rr * (x.niveau - x.stop) : x.niveau - x.rr * (x.stop - x.niveau), rr: x.rr, tSignal: x.tSignal, tEntree: x.tEntree, tSortie: x.tSortie, statut: x.statut, resultat: x.resultat, R: x.R, niv: x.niv, raison: x.raison });
const posVolume = signaux.slice(-40).map(versPosition), volTrades = signaux.map(x => C.normaliser(versPosition(x), 'SOL', 'volume')).filter(Boolean);
const barres = a => Array.from({ length: 200 }, (_, i) => [NOW - (200 - i) * 900e3, 100, 101, 99, 100.5, 10, 10]);
const serie = () => ({ bougies: barres(), cvd: Array.from({ length: 200 }, () => 0), dominance: { sens: 1, minutes: 5, part: 0.5, texte: 'x' }, dernier: {} });
const volume = { actifs: { SOL: { actif: 'SOL', m15: serie(), h1: serie(), profil: {}, positions: posVolume, rejoue: [], footprint: [] } }, portefeuille: { capital0: 10000, capital: 10000, gainUsd: 0, courbe: [] }, t: NOW, derniereBarre: {} };
const enrichi = direct.map(p => p);   // les propositions du service ont la forme ci-dessus
const tradesTr = C.tousTrades({ recentes: enrichi }, null), tradesVol = volTrades;
const resume = C.resumePortefeuille(tradesTr.concat(tradesVol).filter(x => x.statut === 'terminee'), { capital0: 10000, risquePct: 0.5, maintenant: NOW, idsListes: recentes.map(p => p.id).concat(signaux.slice(-40).map(x => x.id)) });
ok(resume.nTrades === 420 && resume.courbe.length <= 240, 'le résumé publié couvre les 420 trades (350 + 70) avec une courbe allégée');
ok(resume.capitalAvantListe > 0 && resume.capitalAvantListe !== 10000, 'capital avant la liste envoyée : trades plus anciens comptés');
const vueTrader = { ok: true, reglages: { risquePct: 0.5 }, actives, recentes, bougies: { BTC: [[NOW - 900e3, 100, 101, 99, 100.5]], SOL: [[NOW - 900e3, 100, 101, 99, 99.4]], DOGE: [[NOW - 900e3, 100, 101, 99, 100.1]] }, bilan: { tous: { stats: { n: 420 } }, parType: [] }, portefeuille: resume, courbe: [], pourquoi: [], journalNiveaux: [] };

/* ── paquet réel du téléphone (vrai constructeur) ── */
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'synchro-'));
fs.writeFileSync(path.join(dossier, 'trader.json'), JSON.stringify({ vuePubliee: vueTrader }));
fs.writeFileSync(path.join(dossier, 'volume-v14.json'), JSON.stringify({ vuePubliee: volume }));
const paquet = plafonner(construirePaquet(dossier, NOW)), octets = Buffer.byteLength(JSON.stringify(paquet));
ok(octets <= MAX_OCTETS, 'le paquet complet tient dans le plafond (' + Math.round(octets / 1024) + ' Ko)');
const tm = paquet.trader, vm = paquet.volume;
ok(tm.recentes.length === 300 && tm.portefeuille && tm.portefeuille.nTrades === 420, 'le téléphone reçoit les 300 trades (comme le PC) et le résumé publié');
ok(vm.actifs.SOL.positions.length === 40, 'et les 40 dernières positions de volume (comme le PC)');

/* ── mêmes entrées → mêmes chiffres, au centime, avec ou sans prix en direct ── */
for (const live of [null, { BTC: 101.37, SOL: 98.62, DOGE: 99.91 }, { BTC: 99.2 }]) {
  const nom = live ? 'prix direct ' + JSON.stringify(live) : 'sans prix direct', a = C.portefeuilleAffiche(vueTrader, volume, live, { maintenant: NOW }), b = C.portefeuilleAffiche(tm, vm, live, { maintenant: NOW });
  for (const k of ['capital', 'gainUsd', 'gainPct', 'flottantUsd', 'flottantR', 'realiseUsd', 'cumulR', 'semaineUsd', 'tauxReussite', 'rMoyen', 'drawdownMaxPct', 'capitalRealise']) proche(a[k], b[k], nom + ' : ' + k + ' identique PC / téléphone', 1e-9);
  ok(a.nTrades === b.nTrades && a.nOuverts === b.nOuverts && a.nEnAttente === b.nEnAttente && a.nTrades === 420, nom + ' : mêmes nombres de trades');
  ok(a.courbe.length === b.courbe.length && a.courbe.every((pt, i) => pt[0] === b.courbe[i][0] && Math.abs(pt[1] - b.courbe[i][1]) < 1e-9), nom + ' : même courbe de capital');
}
{
  const live = { BTC: 101.37, SOL: 98.62 }, a = C.portefeuilleAffiche(vueTrader, volume, live, { maintenant: NOW });
  // BTC achat 100 / stop 99 à 101,37 : +1,37 R ; SOL vente 100 / stop 101 à 98,62 : +1,38 R ; à 0,5 % du capital réalisé
  proche(a.flottantR, 1.37 + 1.38, 'flottant en R = 1,37 + 1,38', 1e-9); proche(a.flottantUsd, a.capitalRealise * 0.005 * 2.75, 'flottant en $ = 0,5 % du capital réalisé × 2,75 R', 1e-6);
  proche(a.capital, a.capitalRealise + a.flottantUsd, 'capital affiché = réalisé + flottant', 1e-9); proche(a.gainPct, (a.capital / 10000 - 1) * 100, 'ratio en % = (capital ÷ départ − 1) × 100', 1e-9);
}
/* ── tableau d'historique : mêmes lignes, mêmes gains par ligne, même résumé ── */
{
  const live = { BTC: 100.4, SOL: 99.7, DOGE: 100.2 }, ta = (tr, v) => { const p = C.portefeuilleAffiche(tr, v, live, { maintenant: NOW }), prix = {}; for (const x of ['BTC', 'SOL', 'DOGE']) prix[x] = C.prixDe(tr, v, x, live); return C.tableHistorique(C.tousTrades(tr, v), { capital0: p.capital0, risquePct: p.risquePct, prix, capitalAvant: p.capitalAvantListe, publie: p.resumePub }); };
  const A = ta(vueTrader, volume), B = ta(tm, vm);
  ok(A.lignes.length === B.lignes.length && A.lignes.length === 343 && A.resume.n === 420 && A.resume.partiel, 'même nombre de lignes (' + A.lignes.length + ')');
  ok(A.lignes.every((l, i) => l.id === B.lignes[i].id && l.statut === B.lignes[i].statut && (l.usd == null ? B.lignes[i].usd == null : Math.abs(l.usd - B.lignes[i].usd) < 1e-9) && l.R === B.lignes[i].R), 'chaque ligne : même identifiant, même résultat, même gain simulé au centime');
  for (const k of ['n', 'gagnes', 'perdus', 'cumulR', 'taux', 'rMoyen', 'facteurProfit', 'meilleur', 'pire', 'baisseMaxR']) proche(A.resume[k], B.resume[k], 'résumé du tableau : ' + k, 1e-9);
  const dernier = A.lignes.filter(l => l.statut === 'terminee')[0], pf = C.portefeuilleAffiche(vueTrader, volume, null, { maintenant: NOW });
  proche(dernier.capApres, pf.capitalRealise, 'le capital après le dernier trade du tableau = le capital réalisé du portefeuille (au centime)', 0.006);
}
/* ── sans le résumé publié (ancien service) les deux appareils restent d'accord entre eux sur ce qu'ils reçoivent ── */
{ const sansPub = { ...vueTrader }; delete sansPub.portefeuille; const a = C.portefeuilleAffiche(sansPub, volume, null, { maintenant: NOW }); ok(Number.isFinite(a.capital) && a.nTrades > 0, 'ancien service : repli sur le calcul local, sans erreur'); }
console.log('synchro : ' + n + ' vérifications OK');
