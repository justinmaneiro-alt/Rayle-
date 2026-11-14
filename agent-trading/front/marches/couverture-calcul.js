/* COUVERTURE (Phase 6, partie A) : calculs PURS, sans navigateur, testés sur des jeux synthétiques au résultat connu (agent-trading/tests/couverture-test.mjs).
   Règles : corrélations de RENDEMENTS (jamais de prix) ; clôtures synchronisées (dates communes) ; sous 60 observations « pas assez de données » ;
   ratio de couverture à variance minimale exprimé EN RISQUE ; période de réglage et période de test SÉPARÉES ; coûts saisis par l'utilisateur, jamais inventés.
   Mentions permanentes : une couverture réduit le risque, pas l'espérance de gain ; les corrélations changent, surtout en crise ; l'historique ne garantit rien. */
import { expositions, parId } from './univers.js';
export const MIN_OBS = 60;
export const MENTIONS = Object.freeze(['Une couverture réduit le risque, pas l’espérance de gain.', 'Les corrélations changent, surtout en crise.', 'L’historique ne garantit rien. Ce n’est pas un conseil d’investissement.']);

/* ───── séries : [[t(ms), clôture]] → rendements alignés par DATE (UTC) ───── */
export const cleDate = t => new Date(t).toISOString().slice(0, 10);
export function alignerSeries(series) {   // series : { id: [[t, c], ...] } → { dates: [...], c: { id: [...] } } sur les dates communes à toutes
  const ids = Object.keys(series), cartes = ids.map(id => new Map(series[id].filter(p => Number.isFinite(p[1]) && p[1] > 0).map(p => [cleDate(p[0]), p[1]])));
  if (!ids.length) return { dates: [], c: {} }; const dates = [...cartes[0].keys()].filter(d => cartes.every(m => m.has(d))).sort();
  const c = {}; ids.forEach((id, i) => { c[id] = dates.map(d => cartes[i].get(d)); }); return { dates, c };
}
export const rendements = c => { const r = []; for (let i = 1; i < c.length; i++) r.push(c[i] / c[i - 1] - 1); return r; };
/* un taux d'intérêt (en %) varie en points, pas en pourcentage : on utilise la différence */
export const diffs = c => { const r = []; for (let i = 1; i < c.length; i++) r.push(c[i] - c[i - 1]); return r; };
export const moyenne = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export function ecartType(a) { if (a.length < 2) return NaN; const m = moyenne(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); }
export function pearson(a, b) { const n = Math.min(a.length, b.length); if (n < 3) return NaN; const x = a.slice(a.length - n), y = b.slice(b.length - n), mx = moyenne(x), my = moyenne(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN; }
const arr = (v, d = 3) => (Number.isFinite(v) ? +v.toFixed(d) : null);

/* ───── matrice de corrélations ───── */
export function stabilite(rA, rB) {
  const n = Math.min(rA.length, rB.length); if (n < MIN_OBS) return { etat: 'pas assez de données', n };
  const a = rA.slice(rA.length - n), b = rB.slice(rB.length - n), sous = Math.max(20, Math.min(60, Math.floor(n / 3))), glis = [];
  for (let i = sous; i <= n; i += Math.max(1, Math.floor(sous / 4))) { const c = pearson(a.slice(i - sous, i), b.slice(i - sous, i)); if (Number.isFinite(c)) glis.push(c); }
  const sd = ecartType(glis), signes = glis.reduce((k, c, i) => (i && Math.sign(c) !== Math.sign(glis[i - 1]) && Math.abs(c) > 0.05 && Math.abs(glis[i - 1]) > 0.05 ? k + 1 : k), 0);
  const fen = [30, 90, 250].filter(w => n >= w).map(w => pearson(a.slice(n - w), b.slice(n - w))).filter(Number.isFinite), ecart = fen.length > 1 ? Math.max(...fen) - Math.min(...fen) : 0;
  const etat = sd < 0.15 && signes === 0 && ecart < 0.25 ? 'stable' : sd < 0.3 && signes <= 1 ? 'moyenne' : 'instable';
  return { etat, sd: arr(sd), changementsDeSigne: signes, ecartFenetres: arr(ecart), n };
}
/* series : { id: [[t, c]] } ; fenetres en jours (rendements communs) ; taux : liste d'ids dont la variation est une différence de points.
   Retour : { ids, fenetres: { 30: { n, m: [[...]] }, ... }, stabilite: { 'A|B': {...} }, observations } */
export function matrice(series, fenetres = [30, 90, 250], { taux = [] } = {}) {
  const ids = Object.keys(series), al = alignerSeries(series), R = {};
  for (const id of ids) R[id] = taux.includes(id) ? diffs(al.c[id]) : rendements(al.c[id]);
  const N = ids.length ? R[ids[0]].length : 0, out = { ids, observations: N, fenetres: {}, stabilite: {}, dates: al.dates.length ? [al.dates[0], al.dates[al.dates.length - 1]] : null };
  for (const w of fenetres) { const n = Math.min(w, N), m = ids.map(a => ids.map(b => (n < MIN_OBS ? null : arr(pearson(R[a].slice(N - n), R[b].slice(N - n)))))); out.fenetres[w] = { n, m, assez: n >= MIN_OBS && N >= w }; }
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.stabilite[ids[i] + '|' + ids[j]] = stabilite(R[ids[i]], R[ids[j]]);
  return out;
}
/* fenêtre horaire (5 jours) quand les deux marchés ont des barres aux mêmes heures : series { id: [[t, c]] } en H1 */
export function matriceHoraire(series, jours = 5) {
  const ids = Object.keys(series), cartes = ids.map(id => new Map(series[id].map(p => [Math.floor(p[0] / 3600e3), p[1]]))); if (!ids.length) return { ids, n: 0, m: [], assez: false };
  const fin = Math.max(...cartes.map(m => Math.max(...m.keys()))), debut = fin - jours * 24, heures = [...cartes[0].keys()].filter(h => h > debut && cartes.every(m => m.has(h))).sort((a, b) => a - b);
  const R = ids.map((id, k) => { const c = heures.map(h => cartes[k].get(h)); return rendements(c); }), n = R[0].length;
  return { ids, n, assez: n >= MIN_OBS, m: ids.map((a, i) => ids.map((b, j) => (n < MIN_OBS ? null : arr(pearson(R[i], R[j]))))) };
}

/* ───── couvertures d'une position ───── */
const maxDrawdown = r => { let eq = 1, pic = 1, dd = 0; for (const x of r) { eq *= 1 + x; if (eq > pic) pic = eq; dd = Math.min(dd, eq / pic - 1); } return dd; };
export const volAnnuelle = (r, jours = 252) => ecartType(r) * Math.sqrt(jours);
/* params : { cible: { id, sens: +1|-1 }, series: { id: [[t,c]] } (cible + candidats), candidats?: [ids], couts?: { id: { spreadPct, swapJourPct } } (valeurs saisies par l'utilisateur, en % du notionnel), partReglage = 0.6, jourDetention = 20 }
   Retour : { cible, sens, n, classement: [{ id, verdict, rho, rhoTest, ratio, ... }], mentions } */
export function evaluerCouvertures({ cible, series, candidats = null, couts = {}, partReglage = 0.6, jourDetention = 20, taux = ['US10Y', 'US2Y'] } = {}) {
  if (!cible || !series || !series[cible.id]) return { erreur: 'actif cible sans donnée', mentions: MENTIONS };
  const sA = cible.sens >= 0 ? 1 : -1, ids = (candidats || Object.keys(series)).filter(id => id !== cible.id && series[id]), res = [];
  for (const id of ids) {
    const al = alignerSeries({ [cible.id]: series[cible.id], [id]: series[id] }), N = al.dates.length - 1;
    const rA = rendements(al.c[cible.id]), rB = taux.includes(id) ? diffs(al.c[id]) : rendements(al.c[id]), fiche = { id, nom: (parId[id] && parId[id].nom) || id, n: rA.length, famille: (parId[id] && parId[id].groupe) || '' };
    if (rA.length < MIN_OBS + 30) { res.push({ ...fiche, verdict: 'données insuffisantes', raison: `${rA.length} observations communes (il en faut au moins ${MIN_OBS + 30})` }); continue; }
    const cut = Math.floor(rA.length * partReglage), aT = rA.slice(0, cut), bT = rB.slice(0, cut), aX = rA.slice(cut), bX = rB.slice(cut);
    const rho = pearson(aT, bT), sigA = ecartType(aT), sigB = ecartType(bT), h = Number.isFinite(rho) && sigB > 0 ? rho * sigA / sigB : NaN;   // unités de B par unité de A (nominal)
    if (!Number.isFinite(h)) { res.push({ ...fiche, verdict: 'données insuffisantes', raison: 'corrélation non calculable' }); continue; }
    const rhoX = pearson(aX, bX), sigAX = ecartType(aX), sigBX = ecartType(bX);
    const sans = aX.map(x => sA * x), avec = aX.map((x, i) => sA * (x - h * bX[i]));   // jambe de couverture : opposée à la corrélation (h signé)
    const vol0 = ecartType(sans), vol1 = ecartType(avec), redVol = vol0 > 0 ? 1 - vol1 / vol0 : 0;
    const dd0 = maxDrawdown(sans), dd1 = maxDrawdown(avec), redDD = dd0 < 0 ? 1 - dd1 / dd0 : 0;
    const seuil = [...sans].sort((x, y) => x - y)[Math.max(0, Math.floor(sans.length * 0.1) - 1)], idx = sans.map((x, i) => i).filter(i => sans[i] <= seuil);
    const crise = idx.length >= 5 ? { n: idx.length, corr: arr(pearson(idx.map(i => aX[i]), idx.map(i => bX[i]))), redPerteMoyenne: arr(1 - moyenne(idx.map(i => avec[i])) / moyenne(idx.map(i => sans[i]))) } : { n: idx.length, corr: null, redPerteMoyenne: null };
    const esperancePerdue = (moyenne(sans) - moyenne(avec)) * 252 * 100;   // % par an
    const c = couts[id] || null, jTotal = (parId[id] && parId[id].jours365) ? 365 : 365;
    const coutAnnuel = c && Number.isFinite(c.spreadPct) && Number.isFinite(c.swapJourPct) ? Math.abs(h) * (2 * c.spreadPct * (252 / jourDetention) + Math.abs(c.swapJourPct) * jTotal) : null;
    let verdict, raison;
    if (aX.length < MIN_OBS) { verdict = 'données insuffisantes'; raison = `${aX.length} observations de test`; }
    else if (Math.abs(rho) < 0.3) { verdict = 'inutile'; raison = `corrélation de réglage trop faible (${arr(rho, 2)})`; }
    else if (!Number.isFinite(rhoX) || Math.sign(rhoX) !== Math.sign(rho) || Math.abs(rhoX - rho) > 0.3) { verdict = 'instable'; raison = `la corrélation a changé entre le réglage (${arr(rho, 2)}) et le test (${arr(rhoX, 2)})`; }
    else if (redVol >= 0.25 && (crise.redPerteMoyenne == null || crise.redPerteMoyenne > 0)) { verdict = 'utile'; raison = `volatilité −${(redVol * 100).toFixed(0)} % sur la période de test`; }
    else if (redVol >= 0.10) { verdict = 'partielle'; raison = `volatilité −${(redVol * 100).toFixed(0)} % seulement` + (crise.redPerteMoyenne != null && crise.redPerteMoyenne <= 0 ? ' ; ne protège pas les pires jours' : ''); }
    else { verdict = 'inutile'; raison = `volatilité −${(redVol * 100).toFixed(0)} % : réduction négligeable`; }
    res.push({ ...fiche, verdict, raison, jambe: Math.sign(h) > 0 ? (sA > 0 ? 'vendre' : 'acheter') : (sA > 0 ? 'acheter' : 'vendre'), rho: arr(rho), rhoTest: arr(rhoX), ratioNominal: arr(h, 4), partDuRisque: arr(Math.abs(rho)), nReglage: aT.length, nTest: aX.length,
      redVol: arr(redVol), redDrawdown: arr(redDD), volAvant: arr(vol0 * Math.sqrt(252)), volApres: arr(vol1 * Math.sqrt(252)), ddAvant: arr(dd0), ddApres: arr(dd1), esperancePerduePctAn: arr(esperancePerdue, 2), crise,
      coutAnnuelPct: coutAnnuel == null ? null : arr(coutAnnuel, 2), coutNote: c ? 'valeurs saisies par toi' : 'coût non renseigné : saisis le spread et le swap de ton courtier (aucune valeur supposée)', stabilite: stabilite(rA, rB).etat });
  }
  const ordre = { utile: 0, partielle: 1, instable: 2, inutile: 3, 'données insuffisantes': 4 };
  res.sort((a, b) => (ordre[a.verdict] - ordre[b.verdict]) || ((b.redVol || 0) - (a.redVol || 0)));
  return { cible: cible.id, sens: sA, classement: res, mentions: MENTIONS, partReglage };
}

/* ───── exposition nette par facteur ───── */
/* positions : [{ actif, sens: +1|-1, risque: nombre (R ou montant de risque, jamais une taille en lots) }] */
export function exposition(positions) {
  const nets = {}, parFacteur = {};
  for (const p of positions || []) { const e = expositions(p.actif, p.sens), poids = Number.isFinite(p.risque) ? p.risque : 1; for (const [f, v] of Object.entries(e)) { nets[f] = (nets[f] || 0) + v * poids; (parFacteur[f] = parFacteur[f] || []).push({ actif: p.actif, signe: Math.sign(v) }); } }
  const doublons = [];
  for (const [f, L] of Object.entries(parFacteur)) for (const sg of [1, -1]) { const M = L.filter(x => x.signe === sg); if (M.length > 1) doublons.push({ facteur: f, sens: sg, positions: M.map(x => x.actif), texte: M.map(x => x.actif).join(' et ') + ' : la même exposition (' + f + ', ' + (sg > 0 ? 'longue' : 'courte') + ')' }); }
  return { nets: Object.fromEntries(Object.entries(nets).map(([k, v]) => [k, arr(v, 3)])), doublons };
}
/* une couverture s'est-elle dégradée ? compare la corrélation récente (30 j) à celle du réglage */
export function couvertureDegradee(rhoReglage, rhoRecent, seuil = 0.3) { if (!Number.isFinite(rhoReglage) || !Number.isFinite(rhoRecent)) return null; return Math.sign(rhoReglage) !== Math.sign(rhoRecent) || Math.abs(rhoRecent) < Math.abs(rhoReglage) - seuil; }
