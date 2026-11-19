/* ═════════════ JOURNAL PAR SETUP (module PUR, testé) : trades notés à la main, rapprochement avec l'import XTB, statistiques par setup ═════════════
   Il n'existe aucune API XTB (fermée le 14 mars 2025) : l'historique vient d'un import manuel. Le trader NOTE son trade au moment où il le prend (voix, ou bouton « Je l'ai pris » du Terminal) avec son SETUP ;
   à l'import, chaque transaction XTB est rapprochée du trade noté (même actif, même sens, heure et prix proches), ce qui lui attache son setup. Les transactions non rapprochées reçoivent un setup en un toucher.
   Lecture seule : aucun ordre. Les statistiques décrivent le passé ; en dessous de 10 trades sur un setup : « pas encore assez de trades ». */
import { idDepuisTicker } from '../commun/xtb.js';

export const SETUPS = Object.freeze([
  { id: 'rebond-ma200', nom: 'rebond MA200', court: 'Rebond MA200' }, { id: 'cassure-ma200', nom: 'cassure MA200', court: 'Cassure MA200' },
  { id: 'rebond-niveau', nom: 'rebond de niveau', court: 'Rebond niveau' }, { id: 'cassure-niveau', nom: 'cassure de niveau', court: 'Cassure niveau' },
  { id: 'fibonacci', nom: 'Fibonacci', court: 'Fibonacci' }, { id: 'autre', nom: 'autre', court: 'Autre' }
]);
export const NOM_SETUP = Object.freeze(Object.fromEntries(SETUPS.map(s => [s.id, s.nom])));
export const MIN_TRADES = 10;
/* actifs du Terminal ↔ ticker XTB (table des marges) */
export const ACTIFS_XTB = Object.freeze({ or: { ticker: 'GOLD', nom: 'l’or', court: 'or' }, us100: { ticker: 'US100', nom: 'le Nasdaq 100', court: 'Nasdaq 100' }, us500: { ticker: 'US500', nom: 'le S&P 500', court: 'S&P 500' }, btc: { ticker: 'BITCOIN', nom: 'le Bitcoin', court: 'Bitcoin' }, sol: { ticker: 'SOLANA', nom: 'Solana', court: 'Solana' }, doge: { ticker: 'DOGECOIN', nom: 'Dogecoin', court: 'Dogecoin' }, argent: { ticker: 'SILVER', nom: 'l’argent', court: 'argent' }, petrole: { ticker: 'OIL.WTI', nom: 'le pétrole WTI', court: 'pétrole' } });
export const nomActifArticle = t => { const k = Object.keys(ACTIFS_XTB).find(a => ACTIFS_XTB[a].ticker === String(t || '').toUpperCase()); return k ? ACTIFS_XTB[k].nom : String(t || '').toLowerCase(); };
export const nomActifTicker = t => { const k = Object.keys(ACTIFS_XTB).find(a => ACTIFS_XTB[a].ticker === String(t || '').toUpperCase()); return k ? ACTIFS_XTB[k].court : String(t || '').toLowerCase(); };

/* « rebond ma 200 », « cassure de niveau », « fibo » → id de setup, sinon null */
export function setupDeTexte(texte) {
  const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
  if (/\bfib(o|onacci)?\b/.test(n)) return 'fibonacci';
  const ma = /\bma ?200\b|\bmoyenne mobile\b|\bmm ?200\b/.test(n), niv = /\bniveaux?\b|\bsupport\b|\bresistance\b|\bzone\b|\bboite\b|\btrendline\b|\bligne\b/.test(n);
  if (/\brebonds?\b/.test(n)) return ma ? 'rebond-ma200' : niv ? 'rebond-niveau' : null;
  if (/\bcassures?\b|\bbreakout\b/.test(n)) return ma ? 'cassure-ma200' : niv ? 'cassure-niveau' : null;
  if (/\bautre\b/.test(n)) return 'autre';
  return null;
}

/* ───── enregistrements du journal : { id, kind: 'prise' | 'attribution', maj, ... } ───── */
const nb = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
let cpt = 0; export const nouvelId = (p = 'p', t = Date.now()) => `${p}${t.toString(36)}${(cpt++).toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`;
const UNITES = ['H1', 'H4', 'J'];
/* prise : trade noté au moment où on le prend */
export function creerPrise({ t = Date.now(), ticker, sens, prix, stop = null, cible = null, setup = 'autre', unite = null, lots = null, source = 'manuel' } = {}, { id = nouvelId('p', t) } = {}) {
  const tk = String(ticker || '').toUpperCase().trim(); if (!/^[A-Z0-9.]{2,16}$/.test(tk) || (sens !== 'BUY' && sens !== 'SELL') || !(prix > 0) || !SETUPS.some(s => s.id === setup)) return null;
  return { id, kind: 'prise', t, ticker: tk, sens, prix, stop: stop > 0 ? stop : null, cible: cible > 0 ? cible : null, setup, unite: UNITES.includes(unite) ? unite : null, lots: lots > 0 ? lots : null, source: ['manuel', 'voix', 'terminal'].includes(source) ? source : 'manuel', maj: t };
}
export const creerAttribution = (positionId, setup, maj = Date.now()) => (!/^[A-Za-z0-9:._-]{1,40}$/.test(String(positionId)) || !SETUPS.some(s => s.id === setup) ? null : { id: 'a' + positionId, kind: 'attribution', positionId: String(positionId), setup, maj });
export function nettoyer(r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !/^[A-Za-z0-9:._-]{1,60}$/.test(r.id) || nb(r.maj) == null) return null;
  if (r.supprime === true) return { id: r.id, supprime: true, maj: r.maj };
  if (r.kind === 'attribution') return creerAttribution(r.positionId, r.setup, r.maj) && { ...creerAttribution(r.positionId, r.setup, r.maj), id: r.id };
  if (r.kind === 'prise') { const p = creerPrise({ ...r, t: nb(r.t) ?? r.maj }, { id: r.id }); return p && { ...p, maj: r.maj }; }
  return null;
}
export const nettoyerListe = L => (Array.isArray(L) ? L : []).slice(0, 5000).map(nettoyer).filter(Boolean);
/* fusion entre appareils : le plus récent gagne ; pierres tombales gardées 30 jours */
export function fusionner(local = [], distant = [], maintenant = Date.now()) {
  const m = new Map(); for (const r of [...local, ...distant]) { const x = m.get(r.id); if (!x || r.maj > x.maj) m.set(r.id, r); }
  return [...m.values()].filter(r => !(r.supprime && maintenant - r.maj > 30 * 86400e3)).sort((a, b) => (a.t || a.maj) - (b.t || b.maj)).slice(-5000);
}
export const visibles = L => (L || []).filter(r => !r.supprime);
export const supprimer = (L, id, maj = Date.now()) => (L || []).map(r => (r.id === id ? { id, supprime: true, maj } : r));

/* ───── rapprochement : une prise ↔ une transaction XTB (même actif, même sens, heure et prix proches) ───── */
export const FENETRE_MIN = 180, TOL_PRIX = 0.004;   // la transaction s'ouvre entre 30 min avant et 3 h après la prise notée ; prix d'ouverture à 0,4 % près
export function rapprocher(prises, fermees, { fenetreMin = FENETRE_MIN, tolPrix = TOL_PRIX } = {}) {
  const cand = [];
  for (const p of prises) for (const f of fermees) {
    if (f.sens !== p.sens || idDepuisTicker(f.ticker) !== idDepuisTicker(p.ticker) || (idDepuisTicker(p.ticker) == null && String(f.ticker).toUpperCase() !== p.ticker)) continue;
    const dt = (f.tOuv - p.t) / 60e3, dp = Math.abs(f.prixOuv - p.prix) / p.prix; if (dt < -30 || dt > fenetreMin || !(dp <= tolPrix)) continue;
    cand.push({ p, f, score: Math.abs(dt) / fenetreMin + dp / tolPrix });
  }
  cand.sort((a, b) => a.score - b.score); const usedP = new Set(), usedF = new Set(), out = new Map();
  for (const c of cand) { if (usedP.has(c.p.id) || usedF.has(c.f.id)) continue; usedP.add(c.p.id); usedF.add(c.f.id); out.set(c.p.id, c.f.id); }
  return out;
}
/* setup de chaque transaction : prise rapprochée > attribution manuelle ; { positionId → { setup, unite, source } } */
export function attributions(fermees, journal) {
  const J = visibles(fusionner([], journal || [])), prises = J.filter(r => r.kind === 'prise'), manuel = new Map(J.filter(r => r.kind === 'attribution').map(r => [r.positionId, r])), R = rapprocher(prises, fermees), par = new Map(prises.map(p => [p.id, p])), out = new Map();
  for (const [pid, fid] of R) { const p = par.get(pid); out.set(fid, { setup: p.setup, unite: p.unite, source: 'prise', priseId: pid }); }
  for (const [fid, a] of manuel) if (!out.has(fid)) out.set(fid, { setup: a.setup, unite: null, source: 'manuelle' });
  return { map: out, rapprochees: R, sansSetup: fermees.filter(f => !out.has(f.id)), prisesSansTransaction: prises.filter(p => !R.has(p.id)) };
}

/* ───── statistiques ───── */
const moy = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
function agreger(T) {
  const gagnants = T.filter(t => t.pnl > 0), R = T.map(t => t.r).filter(Number.isFinite), pnl = T.reduce((s, t) => s + t.pnl, 0);
  return { n: T.length, gagnants: gagnants.length, taux: T.length ? gagnants.length / T.length : null, rMoyen: moy(R), nR: R.length, pnl, pnlMoyen: T.length ? pnl / T.length : null, suffisant: T.length >= MIN_TRADES };
}
/* E : transactions enrichies (calcul.enrichir : pnl, r, ticker…) ; A : attributions(...).map. Renvoie { parSetup: [...], groupes: [...] } */
export function statsSetups(E, A) {
  const lignes = E.filter(t => A.has(t.id)).map(t => ({ ...t, setup: A.get(t.id).setup, unite: A.get(t.id).unite })), parSetup = [];
  for (const s of SETUPS) {
    const T = lignes.filter(t => t.setup === s.id); if (!T.length) continue;
    const parActif = [...new Set(T.map(t => t.ticker))].map(tk => ({ ticker: tk, ...agreger(T.filter(t => t.ticker === tk)) }));
    const parUnite = UNITES.map(u => ({ unite: u, ...agreger(T.filter(t => t.unite === u)) })).filter(x => x.n > 0);
    const dec = parUnite.filter(x => x.n >= 3 && x.pnlMoyen != null), val = x => (x.rMoyen != null && x.nR >= 3 ? x.rMoyen : x.pnlMoyen);
    const meilleure = dec.length >= 2 ? dec.reduce((a, b) => (val(b) > val(a) ? b : a)) : null, pire = dec.length >= 2 ? dec.reduce((a, b) => (val(b) < val(a) ? b : a)) : null;
    parSetup.push({ setup: s.id, nom: s.nom, ...agreger(T), parActif, parUnite, meilleureUnite: meilleure && meilleure.unite, pireUnite: pire && pire.unite });
  }
  /* groupes plus fins pour la synthèse : setup × actif × unité, puis setup × actif, puis setup */
  const groupes = []; const cle = (t, niv) => [t.setup, niv >= 1 ? t.ticker : '', niv >= 2 ? t.unite || '' : ''].join('|');
  for (const niv of [2, 1, 0]) { const m = new Map(); for (const t of lignes) { if (niv === 2 && !t.unite) continue; const k = cle(t, niv); (m.get(k) || m.set(k, []).get(k)).push(t); } for (const [k, T] of m) { const [setup, ticker, unite] = k.split('|'); groupes.push({ niveau: niv, setup, ticker: ticker || null, unite: unite || null, ...agreger(T) }); } }
  return { parSetup, groupes, total: lignes.length };
}
const f1 = v => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sR = v => (v >= 0 ? '+' : '−') + f1(Math.abs(Math.round(v * 10) / 10));
const nomGroupe = g => `${NOM_SETUP[g.setup]}${g.unite ? ' ' + (g.unite === 'J' ? 'Jour' : g.unite) : ''}${g.ticker ? ' sur ' + nomActifArticle(g.ticker) : ''}`;
/* « Ton setup le plus rentable : rebond MA200 H4 sur l'or (+0,8 R par trade sur 23 trades). Ton setup perdant : cassures de niveau en H1. » */
export function synthese(st) {
  if (!st || !st.total) return 'Pas encore de trade avec un setup : note tes prises (voix ou bouton « Je l’ai pris ») ou attribue un setup à tes transactions.';
  const val = g => (g.rMoyen != null && g.nR >= Math.max(3, g.n * 0.6) ? { v: g.rMoyen, u: 'R' } : { v: g.pnlMoyen, u: '€' });
  let cand = []; for (const niv of [2, 1, 0]) { cand = st.groupes.filter(g => g.niveau === niv && g.suffisant); if (cand.length) break; }
  if (!cand.length) return `Pas encore assez de trades : il en faut au moins ${MIN_TRADES} sur un même setup pour juger (tu en as ${st.total} avec un setup, le plus fourni en a ${Math.max(0, ...st.parSetup.map(s => s.n))}).`;
  const sorted = cand.map(g => ({ g, ...val(g) })).sort((a, b) => b.v - a.v), meilleur = sorted[0], pire = sorted[sorted.length - 1];
  const txt = x => (x.u === 'R' ? `${sR(x.v)} R par trade` : `${x.v >= 0 ? '+' : '−'}${Math.abs(Math.round(x.v)).toLocaleString('fr-FR')} € par trade`) + ` sur ${x.g.n} trades`;
  let s = meilleur.v > 0 ? `Ton setup le plus rentable : ${nomGroupe(meilleur.g)} (${txt(meilleur)}).` : 'Aucun setup n’est rentable pour le moment.';
  if (pire.v < 0 && pire !== meilleur) s += ` Ton setup perdant : ${nomGroupe(pire.g)} (${txt(pire)}).`;
  const peu = st.parSetup.filter(x => !x.suffisant).map(x => x.nom); if (peu.length) s += ` Pas encore assez de trades pour : ${peu.join(', ')}.`;
  return s;
}
