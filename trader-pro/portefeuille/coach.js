/* ═════════════ COACH : erreurs détectées PAR LE CALCUL (fiables sans IA), note de discipline, rapport ═════════════
   Chaque détection dit ce qu'elle a mesuré (nombres, exemples) ; l'IA de Rayle ne fait que reformuler ce rapport (voir fenetre.js). Aucune règle n'est inventée : seuils écrits ici, seuils d'échantillon minimum
   (un « pire créneau » n'est cité qu'avec assez de trades). « Impact » = résultat net des trades signalés (négatif = ces trades ont coûté de l'argent). */
import { grouper, nomJour, H, formatDuree } from './calcul.js';

const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const somme = (L, f) => L.reduce((s, x) => s + (f(x) || 0), 0), r2 = v => Math.round(v * 100) / 100, pc = v => Math.round(v * 100);
export const SEUILS = Object.freeze({ taille: 2, tailleHistorique: 30, tailleMin: 10, revengeMin: 20, serie: 3, surtradingFacteur: 2.5, surtradingMin: 10, ratioDuree: 1.5, echantillon: 15 });
const fmt = v => (v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €');

function sousEnsemble(T, ids) { const S = new Set(ids); return T.filter(t => S.has(t.id)); }
const bilan = L => ({ n: L.length, pnl: r2(somme(L, t => t.pnl)), winRate: L.length ? L.filter(t => t.pnl > 0).length / L.length : null, moyenne: L.length ? somme(L, t => t.pnl) / L.length : null });

/* ───── détections : renvoient les identifiants des trades signalés ───── */
export function tradesSansStop(T) { return T.filter(t => t.sl == null).map(t => t.id); }
export function tradesTropGros(T, { facteur = SEUILS.taille, histo = SEUILS.tailleHistorique, min = SEUILS.tailleMin } = {}) {
  const hist = {}, out = [];
  for (const t of [...T].sort((a, b) => a.tOuv - b.tOuv)) { const L = hist[t.ticker] = hist[t.ticker] || []; if (L.length >= min && t.volume > facteur * med(L.slice(-histo))) out.push(t.id); L.push(t.volume); }
  return out;
}
/* nouvelle position ouverte moins de `minutes` après la fermeture d'une perte */
export function tradesRevenge(T, minutes = SEUILS.revengeMin) {
  const F = [...T].sort((a, b) => a.tFerm - b.tFerm), O = [...T].sort((a, b) => a.tOuv - b.tOuv), out = []; let k = -1;
  for (const t of O) { while (k + 1 < F.length && F[k + 1].tFerm <= t.tOuv) k++; if (k < 0) continue; let i = k; while (i >= 0 && F[i].id === t.id) i--; if (i >= 0 && F[i].pnl < 0 && t.tOuv - F[i].tFerm <= minutes * 60e3) out.push(t.id); }
  return out;
}
export function joursSurtrading(T, { facteur = SEUILS.surtradingFacteur, min = SEUILS.surtradingMin } = {}) {
  const m = new Map(); for (const t of T) m.set(t.jourOuv, (m.get(t.jourOuv) || 0) + 1);
  const seuil = Math.max(min, facteur * (med([...m.values()]) || 0)), jours = new Set([...m].filter(([, n]) => n > seuil).map(([j]) => j));
  return { seuil, jours, trades: T.filter(t => jours.has(t.jourOuv)).map(t => t.id) };
}
/* trades ouverts juste après une série d'au moins `serie` pertes consécutives */
export function tradesApresSerie(T, serie = SEUILS.serie) {
  const F = [...T].sort((a, b) => a.tFerm - b.tFerm), O = [...T].sort((a, b) => a.tOuv - b.tOuv), out = []; let k = -1;
  for (const t of O) { while (k + 1 < F.length && F[k + 1].tFerm <= t.tOuv) k++; if (k < serie - 1) continue; let ok = true; for (let i = 0; i < serie; i++) if (!(F[k - i].pnl < 0)) { ok = false; break; } if (ok) out.push(t.id); }
  return out;
}
export function pertesGardeesLongtemps(T) {
  const g = T.filter(t => t.pnl > 0), p = T.filter(t => t.pnl < 0), dg = med(g.map(t => t.duree)), dp = med(p.map(t => t.duree));
  return { dg, dp, ratio: dg && dp ? dp / dg : null, trades: dg ? p.filter(t => t.duree > SEUILS.ratioDuree * 2 * dg).map(t => t.id) : [] };
}

/* ───── rapport de constats ───── */
export function constats(T) {
  const n = T.length, C = []; if (n < 30) return C;
  const add = (id, titre, ids, texte, extra = {}) => { const S = sousEnsemble(T, ids), b = bilan(S), reste = bilan(T.filter(t => !new Set(ids).has(t.id))); C.push({ id, titre, ids, n: S.length, part: S.length / n, impact: b.pnl, winRate: b.winRate, moyenne: b.moyenne, moyenneReste: reste.moyenne, winRateReste: reste.winRate, texte, ...extra }); };
  const ss = tradesSansStop(T); if (ss.length >= 5) { const b = bilan(sousEnsemble(T, ss)), a = bilan(T.filter(t => t.sl != null)); add('stop', 'Positions sans stop', ss, `${ss.length} positions sur ${n} (${pc(ss.length / n)} %) ont été prises sans stop. Résultat moyen sans stop : ${fmt(b.moyenne)} par trade, avec stop : ${fmt(a.moyenne)}.`); }
  const gros = tradesTropGros(T); if (gros.length >= 5) { add('taille', 'Taille trop grosse', gros, `${gros.length} positions avaient plus de ${SEUILS.taille} fois ta taille habituelle sur le même instrument (médiane des ${SEUILS.tailleHistorique} précédentes). Leur résultat net : ${fmt(bilan(sousEnsemble(T, gros)).pnl)}.`); }
  const rev = tradesRevenge(T); if (rev.length >= 10) add('revenge', 'Revenge trading', rev, `${rev.length} positions ont été ouvertes moins de ${SEUILS.revengeMin} minutes après une perte. Taux de réussite : ${pc(bilan(sousEnsemble(T, rev)).winRate)} % (${pc(bilan(T.filter(t => !new Set(rev).has(t.id))).winRate)} % pour les autres).`);
  const st = joursSurtrading(T); if (st.trades.length >= 10) add('surtrading', 'Surtrading', st.trades, `${st.jours.size} jour(s) avec plus de ${Math.round(st.seuil)} positions ouvertes dans la journée (ta médiane est de ${med([...T.reduce((m, t) => m.set(t.jourOuv, (m.get(t.jourOuv) || 0) + 1), new Map()).values()])}) : ${st.trades.length} positions.`, { jours: [...st.jours] });
  const ap = tradesApresSerie(T); if (ap.length >= 10) add('serie', 'Après une série de pertes', ap, `${ap.length} positions ouvertes juste après ${SEUILS.serie} pertes d’affilée ou plus ; ta plus longue série de pertes est de ${(function () { let p = 0, m = 0; for (const t of [...T].sort((a, b) => a.tFerm - b.tFerm)) { p = t.pnl < 0 ? p + 1 : 0; if (p > m) m = p; } return m; })()}.`);
  const pg = pertesGardeesLongtemps(T); if (pg.ratio && pg.ratio > SEUILS.ratioDuree) add('pertes-longues', 'Pertes gardées plus longtemps que les gains', pg.trades, `Durée médiane d’une perte : ${formatDuree(pg.dp)}, d’un gain : ${formatDuree(pg.dg)} (${pg.ratio.toFixed(1).replace('.', ',')} fois plus long).`, { ratio: pg.ratio });
  const g = T.filter(t => t.pnl > 0), p = T.filter(t => t.pnl < 0), RG = med(g.map(t => t.r)), RP = med(p.map(t => (t.r == null ? null : Math.abs(t.r))));
  if (RG != null && RP != null && g.filter(t => t.r != null).length >= 20 && RG < 0.6 * RP) add('gains-coupes', 'Gains coupés trop tôt', g.filter(t => t.r != null && t.r < 0.5 * RP).map(t => t.id), `Gain médian ${RG.toFixed(2).replace('.', ',')} R contre une perte médiane de ${RP.toFixed(2).replace('.', ',')} R : tu coupes les gains plus court que les pertes (R estimé sur le stop final).`);
  return C;
}
/* « pires » créneaux, actifs, sens : seulement avec assez de trades */
export function piresEtMeilleurs(T, min = SEUILS.echantillon) {
  const dims = { actif: grouper(T, t => t.ticker), heure: grouper(T, t => t.heure), jour: grouper(T, t => t.jourSemaine), session: grouper(T, t => t.session), sens: grouper(T, t => t.sens), actifSens: grouper(T, t => t.ticker + ' ' + (t.sens === 'BUY' ? 'achat' : 'vente')) }, out = { pires: [], meilleurs: [] };
  const nom = (d, k) => (d === 'heure' ? k + ' h (Paris)' : d === 'jour' ? nomJour(k) : d === 'sens' ? (k === 'BUY' ? 'achats' : 'ventes') : String(k));
  for (const [d, L] of Object.entries(dims)) for (const x of L) if (x.n >= min) (x.pnl < 0 ? out.pires : out.meilleurs).push({ dimension: d, cle: nom(d, x.cle), n: x.n, pnl: x.pnl, winRate: x.winRate, moyenne: x.moyenne });
  out.pires.sort((a, b) => a.pnl - b.pnl); out.meilleurs.sort((a, b) => b.pnl - a.pnl); return out;
}

/* ───── note de discipline sur 100 ───── */
export const POIDS = Object.freeze({ stop: 25, taille: 20, revenge: 20, surtrading: 15, pertes: 10, serie: 10 });
export function noteDiscipline(T) {
  const n = T.length; if (n < 10) return null;
  const part = ids => ids.length / n, st = joursSurtrading(T), pg = pertesGardeesLongtemps(T);
  const sous = { stop: part(tradesSansStop(T)), taille: part(tradesTropGros(T)), revenge: part(tradesRevenge(T)), surtrading: part(st.trades), pertes: pg.ratio ? Math.min(1, Math.max(0, (pg.ratio - 1) / 2)) : 0, serie: part(tradesApresSerie(T)) };
  const detail = Object.fromEntries(Object.entries(POIDS).map(([k, w]) => [k, { poids: w, violation: sous[k], points: +(w * (1 - Math.min(1, sous[k]))).toFixed(1) }]));
  return { note: Math.round(Object.values(detail).reduce((s, d) => s + d.points, 0)), detail, n };
}
/* évolution : note sur des fenêtres glissantes de `jours` jours (au moins `min` trades), pas de `pas` jours */
export function evolutionNote(T, { jours = 30, pas = 7, min = 15 } = {}) {
  if (!T.length) return []; const fin = Math.max(...T.map(t => t.tFerm)), debut = Math.min(...T.map(t => t.tFerm)), out = [];
  for (let t = debut + jours * 86400e3; t <= fin + pas * 86400e3; t += pas * 86400e3) { const W = T.filter(x => x.tFerm > t - jours * 86400e3 && x.tFerm <= t); if (W.length < min) continue; const s = noteDiscipline(W); if (s) out.push({ t, note: s.note, n: W.length }); }
  return out;
}

/* ───── rapport calculé : 3 plus grosses erreurs, ce qui marche, 3 règles ───── */
export function rapportCalcule(T) {
  const C = constats(T), pm = piresEtMeilleurs(T), note = noteDiscipline(T);
  const erreurs = C.filter(c => c.impact < 0).sort((a, b) => a.impact - b.impact).slice(0, 3);
  const marche = [];
  for (const m of pm.meilleurs.filter(x => x.winRate >= 0.4 || x.moyenne > 0).slice(0, 3)) marche.push(`${m.cle} : ${m.n} positions, ${fmt(m.pnl)} au total (${fmt(m.moyenne)} par trade, ${pc(m.winRate)} % gagnantes).`);
  const regles = [];
  for (const c of erreurs) {
    if (c.id === 'stop') regles.push('Pose toujours un stop avant d’ouvrir : les positions sans stop ont coûté ' + fmt(c.impact) + ' au total.');
    else if (c.id === 'revenge') regles.push(`Après une perte, attends au moins ${SEUILS.revengeMin} minutes (ou une heure complète) avant la position suivante : ces ouvertures précipitées ont coûté ${fmt(c.impact)}.`);
    else if (c.id === 'taille') regles.push(`Ne dépasse pas ${SEUILS.taille} fois ta taille habituelle : les positions trop grosses ont coûté ${fmt(c.impact)}.`);
    else if (c.id === 'surtrading') regles.push(`Plafonne tes journées à ${Math.round(joursSurtrading(T).seuil)} positions : les jours de surtrading ont coûté ${fmt(c.impact)}.`);
    else if (c.id === 'serie') regles.push(`Après ${SEUILS.serie} pertes d’affilée, arrête-toi pour la journée : les positions prises ensuite ont coûté ${fmt(c.impact)}.`);
    else if (c.id === 'pertes-longues') regles.push('Coupe une perte au plus tard quand elle a duré deux fois ta durée habituelle de gain : tes pertes durent trop longtemps.');
    else if (c.id === 'gains-coupes') regles.push('Laisse courir un gain au moins jusqu’à la moitié de ta perte habituelle (en R) avant de le couper.');
  }
  if (regles.length < 3 && pm.pires.length) { const p = pm.pires[0]; regles.push(`Évite ${p.cle} : ${p.n} positions pour ${fmt(p.pnl)}.`); }
  return { constats: C, erreurs, marche, regles: regles.slice(0, 3), pires: pm.pires.slice(0, 5), meilleurs: pm.meilleurs.slice(0, 5), note };
}
/* texte lisible (et lisible à voix haute) */
export function texteRapport(R, resumeGlobal = null) {
  if (!R || !R.note) return 'Pas assez de positions pour établir un rapport (il en faut au moins dix).';
  const P = [`Ta note de discipline est de ${R.note.note} sur 100.`];
  if (resumeGlobal) P.push(`Sur ${resumeGlobal.n} positions, ${pc(resumeGlobal.winRate)} pour cent sont gagnantes, avec un facteur de profit de ${resumeGlobal.profitFactor ? resumeGlobal.profitFactor.toFixed(2).replace('.', ',') : 'non défini'}.`);
  if (R.erreurs.length) P.push('Tes plus grosses erreurs : ' + R.erreurs.map((e, i) => `${i + 1}, ${e.titre.toLowerCase()} (${e.texte})`).join(' '));
  else P.push('Aucune erreur mesurée ne coûte de l’argent sur cet historique.');
  if (R.marche.length) P.push('Ce qui marche chez toi : ' + R.marche.join(' '));
  if (R.regles.length) P.push('Trois règles : ' + R.regles.map((r, i) => `${i + 1}, ${r}`).join(' '));
  return P.join(' ');
}
