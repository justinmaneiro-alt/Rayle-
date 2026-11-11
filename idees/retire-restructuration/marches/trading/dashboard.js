import { atr, ema, rsi } from './indicateurs.js';
import { resume } from './analyse.js';

/* ═════════════ DASHBOARD ANALYTIQUE ET CONTEXTE DE MARCHÉ (module pur, testé : planetes/mars/tests/trading-dashboard-test.mjs) ═════════════
   Reprend les calculs du dashboard de l'ancien terminal (terminal/js/terminal.js, buildDash) : tendance (prix contre EMA 200), RSI 14, volume net (20 dernières bougies,
   en dollars, SEULEMENT quand le volume est réel : crypto), premier support et première résistance, score 0-100 par unité et global. Les supports / résistances sont
   ceux que le navigateur calcule (même méthode que la route /graphique du Worker, vérifiée par le test d'identité de trading-test.mjs). Rien n'est inventé :
   un indicateur sans recul suffisant vaut null et s'affiche « — ». */
export const UNITES_DASHBOARD = ['M15', 'H1', 'H4', 'D1'];
const dernier = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };

/* Volume net en dollars sur les n dernières bougies : somme de (±volume × clôture), + si la bougie est haussière. null sans volume réel. */
export function volumeNet(bougies, n = 20, volumeReel = true) {
  if (!volumeReel) return null;
  const seg = bougies.slice(-n); if (!seg.some(b => b.v > 0)) return null;
  let net = 0; for (const b of seg) net += (b.c >= b.o ? 1 : -1) * b.v * b.c;
  return net;
}

/* Une colonne du tableau (une unité de temps). `bougies` peut être vide : colonne indisponible. */
export function colonne(bougies, { volumeReel = false } = {}) {
  if (!bougies || bougies.length < 30) return { dispo: false, bougies: bougies ? bougies.length : 0 };
  const closes = bougies.map(b => b.c), prix = closes[closes.length - 1];
  const e200 = dernier(ema(closes, 200)), r = dernier(rsi(closes, 14));
  const s = resume(bougies), support = s && s.supports.length ? s.supports[0].prix : null, resistance = s && s.resistances.length ? s.resistances[0].prix : null;
  const bull = e200 != null ? prix > e200 : null, net = volumeNet(bougies, 20, volumeReel);
  // score de l'ancien terminal : 60 (haussier) ou 40, + 0,3 × (RSI − 50), ± 5 selon le volume net, borné à 0-100 ; sans EMA 200, le score n'est pas calculé
  const score = bull == null ? null : Math.max(0, Math.min(100, Math.round((bull ? 60 : 40) + ((r != null ? r - 50 : 0) * 0.3) + (net == null ? 0 : net >= 0 ? 5 : -5))));
  return { dispo: true, bougies: bougies.length, prix, bull, rsi: r, support, resistance, net, score, e200, distance: e200 ? (prix - e200) / e200 * 100 : null, atr: dernier(atr(bougies, 14)) };
}

/* Colonne « GLOBAL » : tendance haussière si au moins 2 unités le sont, score moyen des unités disponibles. */
export function global(cols) {
  const ok = cols.filter(c => c.dispo && c.bull != null);
  if (!ok.length) return { tendance: null, score: null, net: null, unites: 0 };
  const bulls = ok.filter(c => c.bull).length, scores = ok.filter(c => c.score != null);
  return { tendance: bulls >= 2 ? 'Haussier' : 'Baissier', score: scores.length ? Math.round(scores.reduce((a, c) => a + c.score, 0) / scores.length) : null, unites: ok.length };
}

export function formaterUsd(v) {
  if (v == null || !Number.isFinite(v)) return 'n/d';
  const a = Math.abs(v), sg = v >= 0 ? '+' : '-';
  return sg + (a >= 1e9 ? (a / 1e9).toFixed(1) + ' Md$' : a >= 1e6 ? (a / 1e6).toFixed(1) + ' M$' : a >= 1e3 ? (a / 1e3).toFixed(1) + ' k$' : a.toFixed(0) + ' $');
}

/* ── Contexte de marché : route /contexte du Worker (VIX, dollar, taux, huit grandes valeurs du Nasdaq), cache 2 min côté Worker ── */
export function lignesContexte(d, maintenant = Date.now()) {
  if (!d || !Array.isArray(d.lignes)) return { lignes: [], sources: [], etiquettes: ['indisponible'], maj: null };
  const lignes = d.lignes.map(l => ({ id: l.id, label: l.label, unite: l.unite || '', prix: l.prix, variation: l.variation_pct, secours: !!l.secours, source: l.source || null, action: ['VIX', 'DXY', 'US10Y'].indexOf(l.id) < 0 }));
  const sources = [...new Set(lignes.map(l => l.source).filter(Boolean))];
  const et = ['différé ~15 min']; if (d.perime) et.push('ancienne copie'); if (lignes.some(l => l.secours)) et.push('secours');
  if (!lignes.some(l => l.prix != null)) et.push('indisponible');
  return { lignes, sources, etiquettes: et, maj: d.maj ? Date.parse(d.maj) : null, ageMs: d.maj ? maintenant - Date.parse(d.maj) : null };
}
/* Lecture simple du contexte, en constats (jamais de conseil) : peur, dollar, taux. */
export function constatsContexte(c) {
  const out = [], par = id => c.lignes.find(l => l.id === id && l.prix != null);
  const vix = par('VIX'), dxy = par('DXY'), t = par('US10Y');
  if (vix) out.push('VIX ' + vix.prix.toLocaleString('fr-FR') + (vix.prix >= 30 ? ' : tension forte' : vix.prix >= 20 ? ' : nervosité modérée' : ' : marché calme'));
  if (dxy && dxy.variation != null) out.push('Dollar ' + (dxy.variation >= 0 ? 'en hausse' : 'en baisse') + ' de ' + Math.abs(dxy.variation).toFixed(2) + ' % sur la séance');
  if (t && t.variation != null) out.push('Taux US 10 ans ' + (t.variation >= 0 ? 'en hausse' : 'en baisse') + ' (' + Math.abs(t.variation).toFixed(2) + ' %)');
  const actions = c.lignes.filter(l => l.action && l.variation != null);
  if (actions.length) { const h = actions.filter(a => a.variation >= 0).length; out.push(h + ' grandes valeurs sur ' + actions.length + ' en hausse'); }
  return out;
}
