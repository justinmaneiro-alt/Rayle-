/* ═════════════ ALERTE « SETUP POSSIBLE » (structure-v1) : information de lecture, JAMAIS un signal ni un ordre (pur, testé) ═════════════
   Les règles viennent de structure-v1.js (figées, sceau SHA-256 dans le rapport). Résultat de l'étude (2026-11-10) : AUCUNE des 20 variantes ne bat le
   hasard après frais, hors échantillon, après Holm, avec au moins 100 trades. L'alerte est donc INFORMATIVE et le dit dans son texte. Elle est « importante »
   (niveau fort de l'écran) parce qu'elle décrit une structure que Justin surveille, pas parce qu'elle serait rentable.
   Registre daté en AJOUT SEUL, chaîné (comme registre-fleches.js) : une entrée n'est jamais modifiée ni retirée ; suivi en avant (forward) calculé après coup. */
import * as S from './structure-v1.js';
import { empreinte } from './registre-fleches.js';

export const CLE_REGISTRE_STRUCTURE = 'rayle_or_registre_structure';
export const VERDICT = Object.freeze({
  etude: 'structure-v1', date: '2026-11-10', retenues: 0, variantes: 20,
  phrase: 'Étude du 10/11/2026 : aucune des 20 variantes ne bat le hasard après frais, hors échantillon, après correction de Holm, avec au moins 100 trades. Ce n’est pas une stratégie rentable ; c’est une structure à lire, pas un signal.'
});
const NOM_FAMILLE = { A: 'vente sur retest (tendance baissière)', B: 'achat après balayage d’un creux majeur', C: 'rejet au bord d’un range' };
const FIN_TENUE = S.P.tenueMaxH * S.H1;
const dec = (x, d = 2) => Number(x).toFixed(d).replace('.', ',');

/* analyse de la dernière bougie H1 close de C (le tableau ne doit contenir que des bougies closes) : un setup par (famille, sens), variantes regroupées */
export function analyser(C, { capital = 10000, risquePct = S.P.risquePct, variantes = S.VARIANTES } = {}) {
  if (!C || C.length < 500) return { setups: [], raison: 'pas assez de bougies H1' };
  const ctx = S.contexte(C, { H4b: S.agreger(C, S.H4), Jb: S.agreger(C, S.J) }), brut = S.setupsEnCours(C, ctx, variantes), groupes = new Map();
  for (const s of brut) { const k = s.famille + '|' + s.sens; const g = groupes.get(k); if (g) g.variantes.push(s.variante); else groupes.set(k, { ...s, variantes: [s.variante] }); }
  const setups = [...groupes.values()].map(g => { const fi = S.fiche(g, { capital, risquePct }); return { famille: g.famille, sens: g.sens, variantes: g.variantes, tBougie: g.tBougie, ...fi, texte: texte(g, fi) }; });
  return { setups, tBougie: C[C.length - 1].t };
}
export function texte(g, fi) {
  const sens = fi.sens === 'achat' ? 'achat' : 'vente';
  return `Setup possible, ${NOM_FAMILLE[g.famille]} : ${sens} près de ${dec(fi.niveau)} (${fi.type}). Fiche : entrée ${dec(fi.entree)}, stop ${dec(fi.stop)}, cible ${dec(fi.cible)}, R ${dec(fi.R, 1)}, taille à ${dec(fi.risquePct, 1)} % de risque : ${dec(fi.unites, 3)} once pour ${dec(fi.risqueUSD, 0)} dollars risqués. Information de lecture, pas un signal. ${VERDICT.phrase}`;
}

/* ───────────── registre daté, ajout seul, chaîné ───────────── */
const contenu = e => `${e.etude}|${e.t}|${e.famille}|${e.sens}|${Number(e.niveau).toFixed(2)}|${Number(e.entree).toFixed(2)}|${Number(e.stop).toFixed(2)}|${Number(e.cible).toFixed(2)}|${e.vu}|${e.prec}`;
export function registreVide(cree = Date.now()) { return { cree, etude: S.VERSION, entrees: [] }; }
export function lireRegistre(brut, cree) { return brut && typeof brut === 'object' && Array.isArray(brut.entrees) ? brut : registreVide(cree); }
const DELAI_MIN = 6 * 3600e3;   // pas deux entrées de la même famille et du même sens à moins de 6 h
export function ajouter(reg, setups, { vu = Date.now() } = {}) {
  const L = reg.entrees.slice(); let prec = L.length ? L[L.length - 1].h : '0', n = 0; const nouveaux = [];
  for (const s of setups) {
    const t = s.tBougie + S.H1;
    if (L.some(e => e.famille === s.famille && e.sens === s.sens && Math.abs(e.t - t) < DELAI_MIN)) continue;
    const e = { etude: S.VERSION, t, famille: s.famille, sens: s.sens, variantes: s.variantes.slice(), niveau: +s.niveau.toFixed(2), entree: +s.entree.toFixed(2), stop: +s.stop.toFixed(2), cible: +s.cible.toFixed(2), R: s.R, risquePct: s.risquePct, vu, prec };
    e.h = empreinte(contenu(e)); Object.freeze(e); L.push(e); nouveaux.push(e); prec = e.h; n++;
  }
  return { registre: { ...reg, entrees: L }, ajoutes: n, nouveaux };
}
export function verifier(reg) {
  let prec = '0'; for (let k = 0; k < reg.entrees.length; k++) { const e = reg.entrees[k]; if (e.prec !== prec || empreinte(contenu(e)) !== e.h) return { ok: false, n: reg.entrees.length, erreur: `entrée ${k + 1} retouchée ou chaîne rompue` }; prec = e.h; }
  return { ok: true, n: reg.entrees.length };
}
/* on n'écrit que si le stocké est un préfixe exact du nouveau (jamais d'écrasement d'une entrée) */
export function prefixeDe(ancien, nouveau) { const a = (ancien && ancien.entrees) || [], b = nouveau.entrees; if (a.length > b.length) return false; for (let k = 0; k < a.length; k++) if (a[k].h !== b[k].h) return false; return true; }

/* suivi en avant : résultat de chaque entrée avec les bougies H1 closes POSTÉRIEURES à son entrée (stop avant cible dans une même bougie ; 240 h au plus) */
export function suivre(entree, C) {
  const d = entree.sens === 'achat' ? 1 : -1, risque = (entree.entree - entree.stop) * d; if (!(risque > 0)) return { statut: 'invalide' };
  for (const b of C) {
    if (b.t < entree.t) continue;
    if (b.t > entree.t + FIN_TENUE) return { statut: 'expiré', R: (b.o - entree.entree) * d / risque };
    if (d > 0 ? b.l <= entree.stop : b.h >= entree.stop) return { statut: 'stop', R: -1, t: b.t };
    if (d > 0 ? b.h >= entree.cible : b.l <= entree.cible) return { statut: 'cible', R: (entree.cible - entree.entree) * d / risque, t: b.t };
  }
  return { statut: 'en cours' };
}
export function bilan(reg, C) {
  const L = reg.entrees.map(e => ({ e, r: suivre(e, C) })), finis = L.filter(x => x.r.statut === 'stop' || x.r.statut === 'cible' || x.r.statut === 'expiré');
  const R = finis.map(x => x.r.R), moy = R.length ? R.reduce((s, x) => s + x, 0) / R.length : null;
  return { total: L.length, enCours: L.filter(x => x.r.statut === 'en cours').length, finis: finis.length, cibles: finis.filter(x => x.r.statut === 'cible').length, stops: finis.filter(x => x.r.statut === 'stop').length,
    Rbrut: moy, verdict: finis.length < 30 ? `suivi en avant : ${finis.length} résultat${finis.length > 1 ? 's' : ''} (moins de 30 : aucune conclusion possible)` : `suivi en avant : R brut moyen ${moy == null ? '—' : dec(moy)} sur ${finis.length} (avant frais)`, lignes: L };
}
