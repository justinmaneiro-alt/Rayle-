/* ═════════════ RÉACTION RÉELLE DU MARCHÉ à une info (5, 15 et 60 minutes après) et PRÉCÉDENTS tirés de notre propre base ═════════════
   Pur et testé. Les bougies M5 viennent des instantanés (GitHub Actions). Rien n'est mesuré avant que la bougie ne soit clôturée ; marché fermé (aucune bougie proche) = « pas de mesure », jamais un faux zéro. */
import { NOMS_COURTS } from './config.js';
export const HORIZONS_MIN = Object.freeze([5, 15, 60]), M5 = 300e3, SEUIL_ATR = 0.3;
const fr1 = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/* clôture de la dernière bougie M5 terminée au plus tard à `t` (et pas plus vieille que `tolMs`) */
export function prixA(B, t, tolMs = 20 * 60e3) {
  let lo = 0, hi = B.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (B[m].t + M5 <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r >= 0 && t - (B[r].t + M5) <= tolMs ? B[r].c : null;
}
/* series = { <actif>: { M5: bougies triées, atrPct: ATR H1 en % } } */
export function mesurerReaction(carte, series, maintenant = Date.now()) {
  const t0 = carte.t, actifs = {}; let attente = false, mesuree = 0, best = null;
  for (const a of carte.actifs || []) {
    const S = series[a]; if (!S || !S.M5 || !S.M5.length) continue; const base = prixA(S.M5, t0); if (base == null) continue; const o = {};
    for (const h of HORIZONS_MIN) {
      const cible = t0 + h * 60e3; if (maintenant < cible + M5) { attente = true; o['p' + h] = null; continue; }
      const p = prixA(S.M5, cible); if (p == null) { o['p' + h] = null; continue; }
      const pct = (p / base - 1) * 100, atr = S.atrPct > 0 ? Math.abs(pct) / S.atrPct : null; o['p' + h] = +pct.toFixed(2); mesuree++;
      if (atr != null && (!best || atr > best.atr)) best = { actif: a, horizon: h, pct: +pct.toFixed(2), atr: +atr.toFixed(2) };
    }
    actifs[a] = o;
  }
  const marque = best && best.atr >= SEUIL_ATR;
  return { t: maintenant, mesuree, attente, actifs, max: marque ? best : null, texte: marque ? `le marché a réagi : ${NOMS_COURTS[best.actif]} ${fr1(best.pct)} % en ${best.horizon} min` : (mesuree ? 'pas de réaction nette du marché' : attente ? 'mesure en cours' : 'pas de mesure (marché fermé ou données absentes)') };
}
/* ───── mémoire des réactions passées → précédents ───── */
export const MAX_MEMOIRE = 400;
export function memoriser(memoire, carte) {
  const M = Array.isArray(memoire) ? memoire.slice() : [];
  if (!carte.personne || !carte.sujets.length || !carte.reaction || carte.reaction.attente || !carte.reaction.mesuree || M.some(x => x.id === carte.id)) return M;
  const reactions = {}; for (const [a, o] of Object.entries(carte.reaction.actifs)) if (o.p60 != null) reactions[a] = o.p60; if (!Object.keys(reactions).length) return M;
  M.push({ id: carte.id, personne: carte.personne, sujet: carte.sujets[0], t: carte.t, reactions }); return M.sort((a, b) => a.t - b.t).slice(-MAX_MEMOIRE);
}
export function precedentDe(memoire, carte, actif, { n = 6, min = 3, nomPersonne = p => p, nomSujet = s => s } = {}) {
  const L = (memoire || []).filter(x => x.personne === carte.personne && x.sujet === (carte.sujets[0] || '') && x.id !== carte.id && x.reactions[actif] != null).sort((a, b) => b.t - a.t).slice(0, n);
  if (L.length < min) return { n: L.length, texte: 'pas assez d’historique' };
  const v = L.map(x => x.reactions[actif]), moy = v.reduce((s, x) => s + x, 0) / v.length, baisses = v.filter(x => x < 0).length, hausses = v.filter(x => x > 0).length;
  return { n: v.length, moyenne: +moy.toFixed(2), baisses, hausses, texte: `Les ${v.length} dernières fois que ${nomPersonne(carte.personne)} a parlé de ${nomSujet(carte.sujets[0])} : ${NOMS_COURTS[actif]} en moyenne ${fr1(moy)} % sur 1 h (${baisses >= hausses ? baisses + ' baisses' : hausses + ' hausses'} sur ${v.length}).` };
}
