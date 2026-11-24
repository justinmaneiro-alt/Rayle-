/* ═════════════ FICHES DE LECTURE DE MARCHÉ (copilote) : calcul par GitHub Actions, publication en fichiers + envoi au Worker (D1) ═════════════
   Pourquoi pas dans le Worker ? Le plan gratuit de Cloudflare donne 10 ms de CPU par exécution : calculer MA200, volume relatif et sessions sur des milliers de bougies n'y tient pas.
   Les calculs tournent donc ici (dépôt public : minutes d'Actions gratuites), à chaque passage de la boucle « donnees » (toutes les 5 minutes, bougies H1 clôturées incluses), PC éteint, téléphone fermé.
   Résultat : (1) lecture-<actif>.json + lecture-index.json écrits dans le dossier des instantanés (branche « donnees ») ; (2) envoi au Worker (route PUT /lecture/fiches, secret LECTURE_CODE) → D1.
   Usage : node outils-donnees/lecture.mjs --dossier <instantanés> [--worker https://…] [--sans-reseau]   (LECTURE_CODE et LECTURE_URL peuvent venir de l'environnement)
   Aucune clé dans ce fichier. */
import fs from 'node:fs'; import path from 'node:path';
import { construireFiche, ACTIFS_COPILOTE } from '../trader-pro/lecture/fiche.js';
import { calibrerSeuil } from '../trader-pro/lecture/calculs.js';
import { lireEvenements } from '../trader-pro/marches/calendrier.js';
import { enJours, lireFlux } from '../trader-pro/commun/volume-net.js';
import { depuisSnapshotJour } from '../trader-pro/commun/series.js';

const SYM5 = { or: 'GC_F', us100: '_NDX', us500: '_GSPC', btc: 'BTC_USD', sol: 'SOL_USD', petrole: 'CL_F', dxy: 'DX_Y_NYB' };
const COT = { or: 'OR', us100: 'NASDAQ', us500: 'SP500', btc: 'BTC', sol: 'SOL', dxy: 'DXY' };
const KRAKEN = { or: 'PF_XAUUSD', btc: 'PF_XBTUSD', sol: 'PF_SOLUSD' };
const lireJson = (dossier, nom) => { try { return JSON.parse(fs.readFileSync(path.join(dossier, nom), 'utf8')); } catch (e) { return null; } };
const versBougies = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] || 0 }));
const serieMesure = m => (m && Array.isArray(m.serie) ? m.serie.filter(p => Array.isArray(p) && Number.isFinite(p[1])).map(p => ({ t: p[0], v: p[1] })) : []);
const mesure = (d, id) => { for (const s of (d && d.sections) || []) for (const m of s.mesures || []) if (m.id === id) return m; return null; };

/* actualités : le réseau d'information (phase 3) publie `reseau-actus.json` { items: [{ titre, source, t, lien, score, actifs, nbSources }] } ; à défaut, les flux déjà branchés */
export function lireActus(dossier) {
  const R = lireJson(dossier, 'reseau-actus.json'); if (R && Array.isArray(R.items)) return R.items;
  const A = lireJson(dossier, 'actus-marches.json'); return A && Array.isArray(A.items) ? A.items.map(x => ({ titre: x.titre, source: x.source, t: Number.isFinite(x.date) ? x.date : Date.parse(x.date), lien: x.lien, resume: x.resume })).filter(x => Number.isFinite(x.t)) : [];
}
async function lireCarnet(id, fetchFn) {
  const sym = KRAKEN[id]; if (!sym) return null;
  try {
    const r = await fetchFn(`https://futures.kraken.com/derivatives/api/v3/orderbook?symbol=${sym}`, { signal: AbortSignal.timeout(8000) }); if (!r.ok) return null;
    const j = await r.json(), ob = j && j.orderBook; if (!ob || !Array.isArray(ob.bids) || !Array.isArray(ob.asks)) return null;
    return { t: Date.now(), source: 'Kraken Futures ' + sym + ' (instantané)', bids: ob.bids.map(x => [+x[0], +x[1]]).sort((a, b) => b[0] - a[0]), asks: ob.asks.map(x => [+x[0], +x[1]]).sort((a, b) => a[0] - b[0]) };
  } catch (e) { return null; }
}
async function lireFluxActif(id, pro, fetchFn) {
  try { const r = await lireFlux(id, 'J', { fetchFn, bougies: versBougies(pro.j) }); return r.source ? { source: r.source, jours: enJours(r.barres) } : null; } catch (e) { return null; }
}

/* construit les fiches de tous les actifs du dossier ; `reseau` = false : aucun appel réseau (tests, hors ligne) */
export async function construireTout(dossier, { maintenant = Date.now(), reseau = true, fetchFn = fetch, actifs = ACTIFS_COPILOTE.map(a => a.id) } = {}) {
  const macroBrut = lireJson(dossier, 'marches-macro.json'), us10 = lireJson(dossier, 'jour-US10Y.json'), dxyJ = lireJson(dossier, 'jour-DXY.json'), cal = lireJson(dossier, 'calendrier2.json');
  const macro = { reel10: serieMesure(mesure(macroBrut, 'taux.reel10')), us10: us10 ? depuisSnapshotJour(us10).map(x => ({ t: x.t, v: x.c })) : [], dxy: dxyJ ? depuisSnapshotJour(dxyJ).map(x => ({ t: x.t, c: x.c })) : [] };
  const evenements = cal ? lireEvenements(cal) : [], actus = lireActus(dossier), fiches = {}, echecs = {};
  for (const id of actifs) {
    try {
      let pro = lireJson(dossier, `pro-${id}.json`);
      if (!pro) { echecs[id] = `pro-${id}.json absent`; continue; }
      const B = { J: versBougies(pro.j), H4: versBougies(pro.h4), H1: versBougies(pro.h1), M15: versBougies(pro.m15) };
      const m5 = SYM5[id] ? lireJson(dossier, `bougies-${SYM5[id]}-5m.json`) : null; if (m5 && Array.isArray(m5.b)) B.M5 = versBougies(m5.b);
      const cotBrut = COT[id] ? lireJson(dossier, `cot-${COT[id]}.json`) : null;
      const carnet = reseau ? await lireCarnet(id, fetchFn) : null, flux = reseau ? await lireFluxActif(id, pro, fetchFn) : null;
      const seuilCalibre = calibrerSeuil(B.H4, maintenant);
      fiches[id] = construireFiche({ id, nom: pro.nom, B, prix: pro.prix, tPrix: pro.tPrix, source: pro.source, cotBrut, macro, flux, carnet, evenements, actus, seuilCalibre }, maintenant);
    } catch (e) { echecs[id] = String(e && e.message || e).slice(0, 160); }
  }
  return { t: maintenant, fiches, echecs };
}
export function ecrireFiches(dossier, { t, fiches, echecs }) {
  for (const [id, f] of Object.entries(fiches)) fs.writeFileSync(path.join(dossier, `lecture-${id}.json`), JSON.stringify(f));
  fs.writeFileSync(path.join(dossier, 'lecture-index.json'), JSON.stringify({ t, actifs: Object.keys(fiches), echecs, version: 1 }));
}
export async function envoyerAuWorker({ t, fiches }, { url, code, fetchFn = fetch }) {
  const r = await fetchFn(url.replace(/\/+$/, '') + '/lecture/fiches', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Lecture-Code': code }, body: JSON.stringify({ t, fiches }), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('le Worker a répondu ' + r.status); return r.json();
}
async function principal() {
  const a = process.argv.slice(2), val = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const dossier = val('--dossier') || val('--sortie'); if (!dossier || !fs.existsSync(dossier)) { console.error('dossier des instantanés absent'); process.exit(2); }
  const sansReseau = a.includes('--sans-reseau'), R = await construireTout(dossier, { reseau: !sansReseau });
  ecrireFiches(dossier, R); console.log(`fiches écrites : ${Object.keys(R.fiches).join(', ') || 'aucune'}${Object.keys(R.echecs).length ? ' · échecs : ' + JSON.stringify(R.echecs) : ''}`);
  const url = val('--worker') || process.env.LECTURE_URL, code = process.env.LECTURE_CODE;
  if (sansReseau || !url || !code) { console.log('envoi au Worker ignoré (' + (sansReseau ? 'option --sans-reseau' : 'LECTURE_URL ou LECTURE_CODE absent') + ')'); return; }
  try { const r = await envoyerAuWorker(R, { url, code }); console.log('Worker : ' + JSON.stringify(r)); } catch (e) { console.error('envoi au Worker échoué : ' + e.message + ' (les fichiers publiés restent valables)'); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) principal();
