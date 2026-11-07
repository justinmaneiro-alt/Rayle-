/* ═════════════ JOURNAL DE TRADES : calculs purs (testés) ═════════════
   Un trade : { id, sens 'achat'|'vente', entree, stop, objectif, taille (onces = contrats Kraken de 1 once), etiquette, raison, tEntree,
                sortie, tSortie, frais ($), source 'saisie'|'xtb'|'kraken'|'csv', pl ($, si connu tel quel), enrich {...} }.
   R net = (gain brut − frais) / risque initial ($) ; risque = |entrée − stop| × taille. Sans stop : R inconnu (jamais inventé).
   Statistiques : « pas assez de données » sous 20 trades par catégorie ; intervalles à 95 % ; comparaison avec des entrées au hasard aux mêmes heures ;
   règles candidates : « à garder » seulement si positive sur ≥ 30 trades (Holm) ET confirmée sur les trades du mois suivant, jamais vus lors du choix. */
import { atrA, sma, biaisH1, regrouperBougies } from './bougies-or.js';
import { niveauxCles, zonesVolume, cleJour } from './niveaux-or.js';
import { seance, heureLocale } from './temps-or.js';
import { wilson, holm, alea, phi } from './zones-or.js';

export const ETIQUETTES = ['balayage', 'support de volume', 'MA200', 'cassure de range', 'retournement', 'autre', 'hors plan'];
export const ETIQUETTE_XTB = 'historique XTB, sans étiquette de setup';
export const MIN_CATEGORIE = 20, MIN_GARDER = 30;
const dir = t => (t.sens === 'vente' ? -1 : 1);
const f2 = x => x.toFixed(2).replace('.', ',');

export function nouvelId(t = Date.now(), r = Math.random) { return 't' + t.toString(36) + Math.floor(r() * 1e6).toString(36); }
export function valider(t) {
  const e = [];
  if (!['achat', 'vente'].includes(t.sens)) e.push('sens');
  for (const k of ['entree', 'taille']) if (!(+t[k] > 0)) e.push(k);
  if (t.stop != null && t.stop !== '' && +t.stop > 0 && (dir(t) > 0 ? +t.stop >= +t.entree : +t.stop <= +t.entree)) e.push('stop du mauvais côté');
  if (t.source === 'saisie' && !ETIQUETTES.includes(t.etiquette)) e.push('étiquette de setup');
  return e;
}
export const risqueDollars = t => (+t.stop > 0 && +t.entree > 0 && +t.taille > 0) ? Math.abs(t.entree - t.stop) * t.taille : null;
export const ferme = t => t.sortie != null && t.sortie !== '' && +t.sortie > 0;
export function plNet(t) {
  if (t.pl != null && Number.isFinite(+t.pl)) return +t.pl;
  if (!ferme(t)) return null;
  return (t.sortie - t.entree) * dir(t) * t.taille - (+t.frais || 0);
}
/* compte XTB en euros : son P&L n'est pas en dollars → R calculé sur les PRIX (brut, sans frais), jamais en mélangeant les devises */
export function rNet(t) {
  if (t.devise === 'EUR' || t.source === 'xtb') { if (!(+t.stop > 0) || !ferme(t)) return null; const d = Math.abs(t.entree - t.stop); return d ? ((t.sortie - t.entree) * dir(t)) / d : null; }
  const r = risqueDollars(t), p = plNet(t); return r && p != null ? p / r : null;
}
export const dureeMin = t => (t.tSortie && t.tEntree ? (t.tSortie - t.tEntree) / 60e3 : null);
export function trancheDuree(m) { return m == null ? 'inconnue' : m < 15 ? '< 15 min' : m < 60 ? '15 min – 1 h' : m < 240 ? '1 – 4 h' : m < 1440 ? '4 – 24 h' : '> 1 jour'; }

/* ENRICHISSEMENT automatique, sans regarder le futur : seulement les bougies de RÉFÉRENCE closes avant l'entrée */
export function enrichir(t, m15, h1, atrH1, ecart = 0) {
  const T = t.tEntree; if (!T || !m15.length) return { seance: T ? seance(T) : null, raison: 'pas de bougies de référence' };
  const avant = m15.filter(b => b.t + 15 * 60e3 <= T); if (avant.length < 30) return { seance: seance(T), raison: 'pas assez de bougies avant l’entrée' };
  const h1c = h1.filter(b => b.t + 3600e3 <= T), a = atrA(h1, atrH1, T), px = t.entree - ecart;
  const ma = sma(h1c.map(b => b.c), 200), ma200 = ma.length ? ma[ma.length - 1] : null;
  const niv = niveauxCles(avant.slice(-12 * 96), T, { prix: px, ecart }), vol = zonesVolume(avant, T);
  const distNiv = niv.length ? Math.min(...niv.map(n => Math.abs(n.p - px))) : null;
  const distVol = vol.length ? Math.min(...vol.map(z => (px > z.haut ? px - z.haut : px < z.bas ? z.bas - px : 0))) : null;
  // balayage de range dans les 8 dernières M15 : une bougie passe sous (sur) l'extrême des 20 précédentes puis clôture à l'intérieur
  let balayage = 'aucun'; const n = avant.length;
  for (let i = Math.max(21, n - 8); i < n; i++) { const fen = avant.slice(i - 20, i), lo = Math.min(...fen.map(b => b.l)), hi = Math.max(...fen.map(b => b.h)), b = avant[i]; if (b.l < lo && b.c > lo) balayage = 'sous le range'; if (b.h > hi && b.c < hi) balayage = balayage === 'aucun' ? 'au-dessus du range' : 'des deux côtés'; }
  const atrs = atrH1.filter(x => x != null), med = atrs.length ? atrs.slice(-480).sort((x, y) => x - y)[Math.floor(Math.min(480, atrs.length) / 2)] : null;
  const vola = a && med ? (a > 1.3 * med ? 'forte' : a < 0.7 * med ? 'faible' : 'normale') : 'inconnue';
  const r = x => (x == null || !a ? null : Math.round((x / a) * 100) / 100);
  return { seance: seance(T), atrH1: a, distMA200: ma200 && a ? r(px - ma200) : null, distZoneVolume: r(distVol), distNiveauCle: r(distNiv), balayage, volatilite: vola, tendanceH1: biaisH1(h1c).biais };
}

/* moyenne, écart-type, intervalle à 95 % (t de Student approché) */
export function stats(x) {
  const n = x.length; if (!n) return { n, moyenne: null, ic: [null, null] };
  const m = x.reduce((a, b) => a + b, 0) / n, sd = n > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
  const tq = n >= 30 ? 1.96 : [12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.10, 2.09, 2.09, 2.08, 2.07, 2.07, 2.06, 2.06, 2.06, 2.05, 2.05, 2.05][Math.max(0, n - 2)] || 2.05;
  const se = n > 1 ? sd / Math.sqrt(n) : null;
  return { n, moyenne: m, sd, se, ic: se != null ? [m - tq * se, m + tq * se] : [null, null] };
}
/* p-valeur unilatérale « moyenne > 0 » (approximation normale ; sert au filtre, pas à prouver) */
export function pPositif(x) { const s = stats(x); if (s.n < 2 || !s.se) return null; return 1 - phi(s.moyenne / s.se); }

/* BILAN par catégorie */
export const CLES = {
  etiquette: t => t.etiquette || 'sans étiquette', seance: t => (t.enrich && t.enrich.seance) || (t.tEntree ? seance(t.tEntree) : 'inconnue'),
  taille: t => { const x = +t.taille; return !(x > 0) ? 'inconnue' : x < 1 ? '< 1' : x < 5 ? '1 – 5' : x < 20 ? '5 – 20' : x < 100 ? '20 – 100' : '≥ 100'; },
  heure: t => (t.tEntree ? String(heureLocale(t.tEntree, 'Europe/Paris').h).padStart(2, '0') + ' h' : 'inconnue'), duree: t => trancheDuree(dureeMin(t))
};
export function bilan(trades, cle, { periode = null } = {}) {
  const L = trades.filter(t => ferme(t) || t.pl != null).filter(t => !periode || (t.tSortie >= periode[0] && t.tSortie < periode[1]));
  const g = new Map(); for (const t of L) { const k = CLES[cle](t); (g.get(k) || g.set(k, []).get(k)).push(t); }
  return [...g].map(([k, T]) => {
    const R = T.map(rNet).filter(x => x != null), gagnants = T.filter(t => (plNet(t) ?? 0) > 0).length, s = stats(R);
    return { cle: k, n: T.length, nR: R.length, reussite: T.length ? gagnants / T.length : null, icReussite: wilson(gagnants, T.length), rMoyen: s.moyenne, icR: s.ic, pl: T.filter(t => t.devise !== 'EUR').reduce((a, t) => a + (plNet(t) || 0), 0), plEUR: T.filter(t => t.devise === 'EUR').reduce((a, t) => a + (plNet(t) || 0), 0), assez: T.length >= MIN_CATEGORIE };
  }).sort((a, b) => b.n - a.n);
}

/* COMPARAISON AVEC LE HASARD : mêmes heures d'entrée, même durée, même distance de stop (en $), sens tiré au hasard ; R sur les bougies de référence.
   Renvoie la moyenne réelle, la distribution des moyennes au hasard et la part des tirages au moins aussi bons (p). */
export function rHasard(m15, t0, duree, distStop, sens) {
  const i0 = m15.findIndex(b => b.t >= t0); if (i0 < 0) return null;
  const e = m15[i0].o, stop = e - sens * distStop; let i = i0;
  for (; i < m15.length && m15[i].t < t0 + duree; i++) if (sens > 0 ? m15[i].l <= stop : m15[i].h >= stop) return -1;
  const der = m15[Math.min(i, m15.length) - 1]; if (!der || der.t + 15 * 60e3 < t0 + duree - 15 * 60e3) return null;   // pas assez de bougies après
  return ((der.c - e) * sens) / distStop;
}
export function compareHasard(trades, m15, { tirages = 500, graine = 11 } = {}) {
  const T = trades.filter(t => rNet(t) != null && t.tEntree && t.tSortie && m15.length && t.tEntree >= m15[0].t && t.tSortie <= m15[m15.length - 1].t + 15 * 60e3);
  if (T.length < MIN_CATEGORIE) return { n: T.length, assez: false, texte: `pas assez de données (${T.length} trades couverts par les bougies, il en faut ${MIN_CATEGORIE})` };
  const reel = stats(T.map(rNet)).moyenne, rnd = alea(graine), moyennes = [];
  for (let k = 0; k < tirages; k++) {
    const R = []; for (const t of T) { const r = rHasard(m15, t.tEntree, t.tSortie - t.tEntree, Math.abs(t.entree - t.stop), rnd() < 0.5 ? 1 : -1); if (r != null) R.push(r); }
    if (R.length) moyennes.push(R.reduce((a, b) => a + b, 0) / R.length);
  }
  moyennes.sort((a, b) => a - b); const p = moyennes.filter(m => m >= reel).length / Math.max(1, moyennes.length);
  return { n: T.length, assez: true, reel, hasard: moyennes[Math.floor(moyennes.length / 2)], p, texte: `R moyen ${f2(reel)} contre ${f2(moyennes[Math.floor(moyennes.length / 2)])} pour des entrées au hasard aux mêmes heures (${Math.round(p * 100)} % des tirages au hasard font au moins aussi bien)` };
}

/* RÈGLES CANDIDATES : choix sur les mois AVANT le dernier mois complet, confirmation sur ce dernier mois (jamais vu lors du choix) */
const moisDe = t => cleJour(t).slice(0, 7);
export function reglesCandidates(trades, { maintenant = Date.now() } = {}) {
  const L = trades.filter(t => t.source !== 'xtb' && t.etiquette && rNet(t) != null && t.tSortie);
  const mois = [...new Set(L.map(t => moisDe(t.tSortie)))].sort(), courant = moisDe(maintenant);
  const complets = mois.filter(m => m < courant), mConf = complets[complets.length - 1] || null;
  const choix = L.filter(t => mConf && moisDe(t.tSortie) < mConf), conf = L.filter(t => mConf && moisDe(t.tSortie) === mConf);
  const etiq = [...new Set(L.map(t => t.etiquette))];
  const lignes = etiq.map(e => { const R = choix.filter(t => t.etiquette === e).map(rNet), Rc = conf.filter(t => t.etiquette === e).map(rNet); return { etiquette: e, choix: stats(R), confirmation: stats(Rc), p: pPositif(R) }; });
  const adj = holm(lignes.map(l => (l.choix.n >= MIN_GARDER ? l.p : null)));
  return lignes.map((l, i) => {
    const c = l.choix, k = l.confirmation; let statut, raison;
    if (!mConf) { statut = 'à surveiller'; raison = 'pas encore de mois complet pour confirmer'; }
    else if (c.n < MIN_GARDER) { statut = 'à surveiller'; raison = `pas assez de données : ${c.n} trades avant ${mConf}, il en faut ${MIN_GARDER}`; }
    else if (c.moyenne <= 0) { statut = 'à abandonner'; raison = `R moyen ${f2(c.moyenne)} sur ${c.n} trades (≤ 0)`; }
    else if (!(adj[i] < 0.05)) { statut = 'à surveiller'; raison = `positive (${f2(c.moyenne)} R) mais pas assez nette après correction des tests multiples (p corrigée ${adj[i] == null ? '—' : adj[i].toFixed(3).replace('.', ',')})`; }
    else if (k.n < 10) { statut = 'à surveiller'; raison = `confirmation impossible : ${k.n} trades en ${mConf}, il en faut 10`; }
    else if (k.moyenne <= 0) { statut = 'à abandonner'; raison = `non confirmée en ${mConf} : ${f2(k.moyenne)} R sur ${k.n} trades`; }
    else { statut = 'à garder'; raison = `positive sur ${c.n} trades (${f2(c.moyenne)} R, p corrigée ${adj[i].toFixed(3).replace('.', ',')}) et confirmée en ${mConf} (${f2(k.moyenne)} R sur ${k.n})`; }
    return { ...l, pHolm: adj[i], statut, raison, moisConfirmation: mConf };
  });
}

/* JOURNAL DU JOUR : lecture factuelle (bougies APRÈS la sortie seulement pour juger la sortie, jamais pour l'entrée) */
export function lectureJour(trades, jour, m15 = []) {
  const T = trades.filter(t => t.tEntree && cleJour(t.tEntree) === jour).sort((a, b) => a.tEntree - b.tEntree);
  if (!T.length) return { trades: [], total: 0, phrases: ['Aucun trade ce jour.'] };
  const R = T.map(rNet).filter(x => x != null), total = R.reduce((a, b) => a + b, 0), ph = [];
  const gagnes = T.filter(t => (plNet(t) ?? 0) > 0), perdus = T.filter(t => (plNet(t) ?? 0) < 0), hors = T.filter(t => t.etiquette === 'hors plan');
  ph.push(`${T.length} trade${T.length > 1 ? 's' : ''}, ${gagnes.length} gagnant${gagnes.length > 1 ? 's' : ''}, ${perdus.length} perdant${perdus.length > 1 ? 's' : ''}, total ${total >= 0 ? '+' : ''}${f2(total)} R net.`);
  const parEt = new Map(); for (const t of T) { const r = rNet(t); if (r == null) continue; parEt.set(t.etiquette, (parEt.get(t.etiquette) || 0) + r); }
  const mieux = [...parEt].sort((a, b) => b[1] - a[1])[0]; if (mieux && mieux[1] > 0) ph.push(`Ce qui a marché : ${mieux[0]} (${mieux[1] >= 0 ? '+' : ''}${f2(mieux[1])} R).`);
  if (hors.length) ph.push(`${hors.length} trade${hors.length > 1 ? 's' : ''} hors plan (${hors.map(t => f2(rNet(t) ?? 0) + ' R').join(', ')}).`);
  for (const t of T) {
    if (!ferme(t) || !t.objectif || !t.tSortie) continue; const d = dir(t), apres = m15.filter(b => b.t >= t.tSortie && b.t < t.tSortie + 4 * 3600e3);
    if (!apres.length) continue;
    const atteint = apres.some(b => (d > 0 ? b.h >= t.objectif : b.l <= t.objectif)), stopAtteint = t.stop && apres.some(b => (d > 0 ? b.l <= t.stop : b.h >= t.stop));
    if ((plNet(t) ?? 0) > 0 && atteint && (d > 0 ? t.sortie < t.objectif : t.sortie > t.objectif)) ph.push(`Sortie peut-être trop précoce à ${t.sortie} : l’objectif ${t.objectif} a été touché dans les 4 h suivantes${stopAtteint ? ', mais le stop aussi' : ''}.`);
  }
  for (const t of T) { const r = rNet(t); if (r != null && r < 0 && t.mfeR != null && t.mfeR >= 1) ph.push(`Sortie peut-être trop tardive : le trade de ${t.entree} a été à +${t.mfeR.toFixed(1).replace('.', ',')} R avant de finir à ${f2(r)} R.`); }
  return { trades: T, total, phrases: ph };
}
/* meilleur gain latent (en R) pendant le trade, mesuré sur les bougies Kraken ENTRE l'entrée et la sortie */
export function mfeR(t, bougies) {
  const r = risqueDollars(t); if (!r || !t.tSortie) return null; const d = dir(t);
  const B = bougies.filter(b => b.t + 15 * 60e3 > t.tEntree && b.t < t.tSortie); if (!B.length) return null;
  const meilleur = d > 0 ? Math.max(...B.map(b => b.h)) : Math.min(...B.map(b => b.l));
  return ((meilleur - t.entree) * d * t.taille) / r;
}

/* IMPORT CSV : XTB (« Closed Positions » exporté en CSV) et Kraken Futures (historique des exécutions). Séparateur ; ou , détecté. */
export function lireCsv(texte) {
  const lignes = String(texte).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const sep = (lignes[0].match(/;/g) || []).length > (lignes[0].match(/,/g) || []).length ? ';' : ',';
  const cut = l => { const o = []; let cur = '', q = false; for (const c of l) { if (c === '"') q = !q; else if (c === sep && !q) { o.push(cur); cur = ''; } else cur += c; } o.push(cur); return o.map(x => x.trim()); };
  let h = lignes.findIndex(l => /instrument|symbol|type|side/i.test(l)); if (h < 0) h = 0;
  const tete = cut(lignes[h]).map(x => x.toLowerCase());
  return lignes.slice(h + 1).map(cut).map(r => Object.fromEntries(tete.map((k, i) => [k, r[i]])));
}
const nombre = v => { if (v == null || v === '') return null; const x = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
const date = v => { if (!v) return null; const s = String(v).trim().replace(' ', 'T'); const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'); return Number.isFinite(t) ? t : null; };
export function importerCsv(texte, { orSeulement = true } = {}) {
  const L = lireCsv(texte); if (!L.length) return { trades: [], ignores: 0, format: 'vide' };
  const k = Object.keys(L[0]), xtb = k.includes('open price') || k.includes('open time (utc)'), kraken = k.some(c => /fill|tradeable|symbol/.test(c)) && !xtb;
  const out = []; let ignores = 0;
  if (xtb) for (const r of L) {
    const ins = String(r.instrument || r.symbol || ''); if (orSeulement && !/gold|xau/i.test(ins)) { ignores++; continue; }
    const vol = nombre(r.volume), t = { id: 'xtb' + (r['position id'] || r.position || out.length), source: 'xtb', devise: 'EUR', etiquette: ETIQUETTE_XTB, sens: /sell/i.test(r.type) ? 'vente' : 'achat', entree: nombre(r['open price']), sortie: nombre(r['close price']), stop: nombre(r['stop loss']) || null, objectif: nombre(r['take profit']) || null, taille: vol != null ? vol * 100 : null, tEntree: date(r['open time (utc)'] || r['open time']), tSortie: date(r['close time (utc)'] || r['close time']), pl: nombre(r['profit/loss'] ?? r.profit), frais: -(nombre(r.commission) || 0) - (nombre(r.swap) || 0), raison: '' };
    if (!(t.entree > 0) || !t.tEntree) { ignores++; continue; } out.push(t);
  }
  else if (kraken) for (const r of L) {
    const sym = String(r.symbol || r.tradeable || r.contract || ''); if (orSeulement && !/xau/i.test(sym)) { ignores++; continue; }
    out.push({ id: 'kr' + (r.fill_id || r.uid || r['fill id'] || out.length), source: 'kraken', etiquette: 'autre', sens: /sell/i.test(r.side || r.direction) ? 'vente' : 'achat', entree: nombre(r.price || r.fillprice), taille: nombre(r.size || r.qty || r.quantity), tEntree: date(r.fillTime || r.filltime || r.time || r.datetime), frais: nombre(r.fee) || 0, execution: true, raison: 'exécution importée (à regrouper en trade)' });
  }
  else return { trades: [], ignores: L.length, format: 'inconnu' };
  return { trades: out, ignores, format: xtb ? 'XTB' : 'Kraken' };
}
/* trades XTB déjà extraits par le script local (trades-xtb.json) → journal (or seulement) */
export function depuisXtbJson(d) {
  return (d.trades || []).filter(t => /gold|xau/i.test(t.instrument)).map(t => ({ id: 'xtb' + t.id, source: 'xtb', devise: 'EUR', etiquette: ETIQUETTE_XTB, sens: t.sens > 0 ? 'achat' : 'vente', entree: t.ouverture, sortie: t.fermeture, stop: t.stop || null, objectif: t.tp || null, taille: t.volume * 100, tEntree: t.tOuv, tSortie: t.tFerm, pl: t.pl, frais: -(t.commission || 0) - (t.swap || 0), raison: '' }));
}
export function fusionnerTrades(base, ajout) { const m = new Map(base.map(t => [t.id, t])); let n = 0; for (const t of ajout) if (!m.has(t.id)) { m.set(t.id, t); n++; } return { trades: [...m.values()].sort((a, b) => (a.tEntree || 0) - (b.tEntree || 0)), ajoutes: n }; }
export { regrouperBougies };
