// Historique GRATUIT des transactions (V4, phase 2) : data.binance.vision (aggTrades comptant et futures, bookDepth des futures, metrics des futures, taux de financement).
//   node agent-pc/flux/historique-trades.mjs                     télécharge et résume (24 mois, BTC SOL DOGE, comptant + futures) ; reprend où il s'est arrêté
//   node agent-pc/flux/historique-trades.mjs --mois 36           plus long (3 ans : ≈ 40 Go À TÉLÉCHARGER au total, mais seulement ≈ 0,5 Go gardés)
//   node agent-pc/flux/historique-trades.mjs --actifs DOGE --marches fut --mois 3     un petit essai
//   node agent-pc/flux/historique-trades.mjs --statut
// Chaque archive (200 à 600 Mo) est téléchargée, résumée en barres M15 avec empreinte (strategies/liquidite/barres-flux.js) puis SUPPRIMÉE : disque temporaire ≈ 1 Go.
// Limites honnêtes : il n'existe PAS d'historique gratuit du carnet d'ordres complet ; bookDepth (futures) donne la profondeur à ±1…5 % toutes les ≈ 30 s et sert de complément partiel.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dossierAgent, lireJson, ecrireJson } from '../etat-agent.mjs';
import { ouvrirZip, lireLignes } from './zip-flux.mjs';
import { AgregateurBarres } from '../../strategies/liquidite/barres-flux.js';

export const BASE = 'https://data.binance.vision/data/';
export const ACTIFS_HIST = Object.freeze({ BTC: 'BTCUSDT', SOL: 'SOLUSDT', DOGE: 'DOGEUSDT' });
export const MARCHES = Object.freeze({ spot: 'spot', fut: 'futures/um' });
export const dossierHistorique = (dossier = dossierAgent()) => path.join(dossier, 'flux-historique');
const pad = n => String(n).padStart(2, '0');
export const jourISO = t => new Date(t).toISOString().slice(0, 10);
const moisISO = t => jourISO(t).slice(0, 7);

/* Liste des archives à lire pour les `mois` derniers mois : un fichier MENSUEL par mois complet, des fichiers QUOTIDIENS pour le mois en cours (jusqu'à avant-hier : le fichier d'hier peut ne pas être publié). */
export function planArchives({ type, marche, symbole, mois = 24, maintenant = Date.now() }) {
  const d = new Date(maintenant), annee = d.getUTCFullYear(), m0 = d.getUTCMonth(), out = [], racine = BASE + MARCHES[marche] + '/';
  for (let k = mois; k >= 1; k--) { const t = new Date(Date.UTC(annee, m0 - k, 1)), cle = moisISO(t.getTime()); out.push({ periode: 'mensuel', date: cle, url: racine + 'monthly/' + type + '/' + symbole + '/' + symbole + '-' + type + '-' + cle + '.zip' }); }
  const fin = Math.floor(maintenant / 86400e3) * 86400e3 - 2 * 86400e3;
  for (let t = Date.UTC(annee, m0, 1); t <= fin; t += 86400e3) { const j = jourISO(t); out.push({ periode: 'jour', date: j, url: racine + 'daily/' + type + '/' + symbole + '/' + symbole + '-' + type + '-' + j + '.zip' }); }
  return out;
}
/* Archives QUOTIDIENNES seulement (bookDepth, metrics : pas de fichiers mensuels) pour les `jours` derniers jours (jusqu'à avant-hier). */
export function planJournalier({ type, marche, symbole, jours = 365, maintenant = Date.now() }) {
  const fin = Math.floor(maintenant / 86400e3) * 86400e3 - 2 * 86400e3, out = [], racine = BASE + MARCHES[marche] + '/';
  for (let t = fin - (jours - 1) * 86400e3; t <= fin; t += 86400e3) { const j = jourISO(t); out.push({ periode: 'jour', date: j, url: racine + 'daily/' + type + '/' + symbole + '/' + symbole + '-' + type + '-' + j + '.zip' }); }
  return out;
}
/* Ligne CSV d'aggTrades → { t, prix, qte, vendeurAgresseur } ou null (en-tête, ligne cassée). Spot : horodatage en MICROsecondes depuis 2025. */
export function lireLigneAggTrade(l) {
  const c = l.charCodeAt(0); if (c < 48 || c > 57) return null;
  const a = l.split(','); if (a.length < 7) return null;
  let t = Number(a[5]); const prix = Number(a[1]), qte = Number(a[2]); if (!(t > 0) || !(prix > 0) || !(qte > 0)) return null;
  if (t > 1e14) t = Math.floor(t / 1000);
  return { t, prix, qte, vendeurAgresseur: a[6] === 'true' || a[6] === 'True' };
}
/* Résume un flux CSV d'aggTrades en barres M15 groupées par jour : Map('AAAA-MM-JJ' → barres[]). */
export async function resumerAggTrades(flux, { surProgres = null } = {}) {
  const jours = new Map(), agg = new AgregateurBarres(b => { const j = jourISO(b.t); let l = jours.get(j); if (!l) jours.set(j, l = []); l.push(b); });
  let n = 0, rejetees = 0;
  await lireLignes(flux, l => { const x = lireLigneAggTrade(l); if (!x) { rejetees++; return; } agg.ajouter(x.t, x.prix, x.qte, x.vendeurAgresseur); if (++n % 5e6 === 0 && surProgres) surProgres(n); });
  agg.finir(); return { jours, transactions: n, rejetees, desordre: agg.desordre };
}
const ecrireGz = (f, contenu) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = f + '.tmp'; fs.writeFileSync(tmp, zlib.gzipSync(contenu, { level: 6 })); fs.renameSync(tmp, f); };
const lireGz = f => zlib.gunzipSync(fs.readFileSync(f)).toString('utf8');

/* bookDepth (futures) : « timestamp,percentage,depth,notional » → par barre M15 : moyenne de la liquidité (en $) à −5…−1 % (bid : b1…b5) et +1…+5 % (ask : a1…a5). */
export async function resumerBookDepth(flux) {
  const barres = new Map(); let n = 0;
  await lireLignes(flux, l => {
    const c = l.charCodeAt(0); if (c < 48 || c > 57) return; const a = l.split(','); if (a.length < 4) return;
    const t = Date.parse(a[0].replace(' ', 'T') + 'Z'), pct = Number(a[1]), usd = Number(a[3]); if (!(t > 0) || !Number.isFinite(pct) || !(usd >= 0)) return;
    const k = Math.floor(t / 900000) * 900000; let b = barres.get(k); if (!b) barres.set(k, b = { t: k, somme: {}, nb: {} });
    const cle = (pct < 0 ? 'b' : 'a') + Math.abs(pct); b.somme[cle] = (b.somme[cle] || 0) + usd; b.nb[cle] = (b.nb[cle] || 0) + 1; n++;
  });
  const out = []; for (const b of [...barres.values()].sort((x, y) => x.t - y.t)) { const o = { t: b.t }; for (const k of Object.keys(b.somme)) o[k] = Math.round(b.somme[k] / b.nb[k]); out.push(o); }
  return { barres: out, lignes: n };
}
/* metrics (futures, 5 min) : create_time, symbol, sum_open_interest, sum_open_interest_value, count_toptrader_ls, sum_toptrader_ls, count_ls, sum_taker_ls_vol → [t, oi, oiUsd, topComptes, topPositions, comptes, taker]. */
export async function resumerMetrics(flux) {
  const out = [];
  await lireLignes(flux, l => { const c = l.charCodeAt(0); if (c < 48 || c > 57) return; const a = l.split(','); if (a.length < 8) return; const t = Date.parse(a[0].replace(' ', 'T') + 'Z'); if (!(t > 0)) return; out.push([t, Number(a[2]), Number(a[3]), Number(a[4]), Number(a[5]), Number(a[6]), Number(a[7])]); });
  return out;
}
export async function resumerFinancement(flux) {
  const out = []; await lireLignes(flux, l => { const c = l.charCodeAt(0); if (c < 48 || c > 57) return; const a = l.split(','); if (a.length < 3) return; const t = Number(a[0]), r = Number(a[2]); if (t > 0 && Number.isFinite(r)) out.push([t, r]); }); return out;
}

/* Téléchargement avec reprise (en-tête Range). Rend { octets, reprise } ; 404 → { absent: true }. */
export async function telecharger(url, dest, { fetchImpl = fetch, surProgres = null } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true }); let deja = 0; try { deja = fs.statSync(dest).size; } catch (e) { /* neuf */ }
  const r = await fetchImpl(url, { headers: deja ? { Range: 'bytes=' + deja + '-' } : {}, signal: AbortSignal.timeout(3600e3) });
  if (r.status === 404) return { absent: true };
  if (r.status === 416) return { octets: deja, reprise: true };                                  // déjà complet
  if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status + ' pour ' + url);
  const reprise = r.status === 206; if (!reprise) deja = 0;
  const total = Number(r.headers.get('content-length') || 0) + deja; let recu = deja, dernier = 0;
  const sortie = fs.createWriteStream(dest, { flags: reprise ? 'a' : 'w' });
  await pipeline(Readable.fromWeb(r.body), async function* (src) { for await (const m of src) { recu += m.length; if (surProgres && Date.now() - dernier > 5000) { dernier = Date.now(); surProgres(recu, total); } yield m; } }, sortie);
  return { octets: recu, reprise };
}

export function creerHistorique({ dossier = dossierAgent(), maintenant = Date.now, fetchImpl = fetch, journal = () => {}, temp = null } = {}) {
  const racine = dossierHistorique(dossier), fIndex = path.join(racine, 'index.json'), tmpDir = temp || path.join(racine, '_telechargements');
  const index = lireJson(fIndex, { termine: {}, absents: {}, maj: null }) || { termine: {}, absents: {}, maj: null };
  const sauver = () => { index.maj = maintenant(); ecrireJson(fIndex, index); };
  const faite = (cle, date) => (index.termine[cle] || []).includes(date), marquer = (cle, date) => { (index.termine[cle] = index.termine[cle] || []).push(date); sauver(); };
  const fichierTrades = (marche, sym, jour) => path.join(racine, 'trades', marche + '-' + sym, jour + '.jsonl.gz');

  async function archive(a, cleTemp) {
    const zip = path.join(tmpDir, cleTemp + '.zip'); const r = await telecharger(a.url, zip, { fetchImpl, surProgres: (x, t) => { if (t > 50e6) journal('  ' + (x / 1e6).toFixed(0) + ' / ' + (t / 1e6).toFixed(0) + ' Mo'); } });
    return r.absent ? null : zip;
  }
  /* Une archive aggTrades → un fichier par jour. */
  async function traiterAggTrades(marche, sym, a) {
    const cle = 'trades-' + marche + '-' + sym; if (faite(cle, a.date)) return 'deja';
    const zip = await archive(a, cle + '-' + a.date); if (!zip) { (index.absents[cle] = index.absents[cle] || []).push(a.date); sauver(); return 'absent'; }
    try {
      const z = ouvrirZip(zip), r = await resumerAggTrades(z.flux, { surProgres: n => journal('  ' + (n / 1e6).toFixed(0) + ' M transactions lues') });
      for (const [jour, barres] of r.jours) ecrireGz(fichierTrades(marche, sym, jour), barres.map(b => JSON.stringify(b)).join('\n') + '\n');
      marquer(cle, a.date); journal(cle + ' ' + a.date + ' : ' + r.transactions + ' transactions → ' + r.jours.size + ' jour(s)' + (r.desordre ? ' (' + r.desordre + ' hors ordre ignorées)' : '')); return 'fait';
    } finally { try { fs.unlinkSync(zip); } catch (e) { /* déjà */ } }
  }
  async function traiterJournalier(type, sym, a, resumer, ecrire) {
    const cle = type + '-' + sym; if (faite(cle, a.date)) return 'deja';
    const zip = await archive(a, cle + '-' + a.date); if (!zip) { (index.absents[cle] = index.absents[cle] || []).push(a.date); sauver(); return 'absent'; }
    try { const z = ouvrirZip(zip); const r = await resumer(z.flux); ecrire(r, a.date); marquer(cle, a.date); return 'fait'; } finally { try { fs.unlinkSync(zip); } catch (e) { /* déjà */ } }
  }
  return {
    racine, index, fichierTrades, traiterAggTrades,
    traiterBookDepth: (sym, a) => traiterJournalier('bookDepth', sym, a, resumerBookDepth, r => ecrireGz(path.join(racine, 'bookdepth', sym, a.date + '.json.gz'), JSON.stringify(r.barres))),
    traiterMetrics: (sym, a) => traiterJournalier('metrics', sym, a, resumerMetrics, r => ecrireGz(path.join(racine, 'metrics', sym, a.date + '.json.gz'), JSON.stringify(r))),
    async traiterFinancement(sym, a) {
      const cle = 'funding-' + sym; if (faite(cle, a.date)) return 'deja'; const zip = await archive(a, cle + '-' + a.date); if (!zip) return 'absent';
      try { const z = ouvrirZip(zip), r = await resumerFinancement(z.flux); ecrireGz(path.join(racine, 'financement', sym, a.date + '.json.gz'), JSON.stringify(r)); marquer(cle, a.date); return 'fait'; } finally { try { fs.unlinkSync(zip); } catch (e) { /* déjà */ } }
    },
    /* Statut lisible : combien de jours de transactions par flux, du ... au ... */
    resume() {
      const out = {}; const base = path.join(racine, 'trades'); if (!fs.existsSync(base)) return out;
      for (const d of fs.readdirSync(base)) { const jours = fs.readdirSync(path.join(base, d)).filter(x => x.endsWith('.jsonl.gz')).map(x => x.slice(0, 10)).sort(); out[d] = { jours: jours.length, du: jours[0] || null, au: jours[jours.length - 1] || null }; }
      return out;
    }
  };
}

/* ── lecture (moteur de liquidité, tests historiques) ── */
export function lireBarresTrades(dossier, marche, sym, t0, t1) {
  const racine = dossierHistorique(dossier), out = [];
  for (let j = Math.floor(t0 / 86400e3) * 86400e3; j <= t1; j += 86400e3) {
    const f = path.join(racine, 'trades', marche + '-' + sym, jourISO(j) + '.jsonl.gz'); if (!fs.existsSync(f)) continue;
    for (const l of lireGz(f).split('\n')) { if (!l) continue; const b = JSON.parse(l); if (b.t >= t0 && b.t <= t1) out.push(b); }
  }
  return out;
}
export function lireMetrics(dossier, sym, t0, t1) {
  const racine = dossierHistorique(dossier), out = [];
  for (let j = Math.floor(t0 / 86400e3) * 86400e3; j <= t1; j += 86400e3) { const f = path.join(racine, 'metrics', sym, jourISO(j) + '.json.gz'); if (fs.existsSync(f)) for (const r of JSON.parse(lireGz(f))) if (r[0] >= t0 && r[0] <= t1) out.push(r); }
  return out;
}
export function lireBookDepth(dossier, sym, t0, t1) {
  const racine = dossierHistorique(dossier), out = [];
  for (let j = Math.floor(t0 / 86400e3) * 86400e3; j <= t1; j += 86400e3) { const f = path.join(racine, 'bookdepth', sym, jourISO(j) + '.json.gz'); if (fs.existsSync(f)) for (const r of JSON.parse(lireGz(f))) if (r.t >= t0 && r.t <= t1) out.push(r); }
  return out;
}

const estPrincipal = () => { try { return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href; } catch (e) { return false; } };
if (estPrincipal()) {
  const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const dossier = dossierAgent(), H = creerHistorique({ dossier, journal: m => console.log(m) });
  if (args.includes('--statut')) { console.log(JSON.stringify(H.resume(), null, 1)); process.exit(0); }
  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { /* tant pis */ }
  const mois = Number(val('--mois', 24)), actifs = val('--actifs', 'BTC,SOL,DOGE').split(',').filter(a => ACTIFS_HIST[a]), marches = val('--marches', 'spot,fut').split(',').filter(m => MARCHES[m]);
  const libre = (() => { try { const s = fs.statfsSync(dossier); return Number(s.bavail) * Number(s.bsize); } catch (e) { return null; } })();
  if (libre != null && libre < 3 * 1024 ** 3) { console.log('Moins de 3 Go libres sur le disque : je ne télécharge rien (il faut ≈ 1 Go temporaire).'); process.exit(1); }
  console.log('Historique des transactions : ' + mois + ' mois, ' + actifs.join('/') + ', ' + marches.join('+') + '. Tu peux fermer la fenêtre : relance la même commande pour reprendre.');
  for (const a of actifs) {
    const sym = ACTIFS_HIST[a];
    for (const m of marches) for (const arch of planArchives({ type: 'aggTrades', marche: m, symbole: sym, mois })) { try { await H.traiterAggTrades(m, sym, arch); } catch (e) { console.log('ERREUR ' + m + ' ' + sym + ' ' + arch.date + ' : ' + e.message + ' (je continue ; relance plus tard)'); } }
    if (marches.includes('fut')) {
      for (const arch of planJournalier({ type: 'bookDepth', marche: 'fut', symbole: sym, jours: Math.min(365, mois * 30) })) { try { await H.traiterBookDepth(sym, arch); } catch (e) { /* facultatif */ } }
      for (const arch of planJournalier({ type: 'metrics', marche: 'fut', symbole: sym, jours: Math.min(365, mois * 30) })) { try { await H.traiterMetrics(sym, arch); } catch (e) { /* facultatif */ } }
    }
  }
  console.log('Terminé pour cette passe. Résumé : ' + JSON.stringify(H.resume()));
}
