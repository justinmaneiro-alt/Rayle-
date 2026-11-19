/* ═════════════ NIVEAUX TRACÉS À LA MAIN : modèle, Fibonacci, états et FLÈCHES À LA CLÔTURE (module PUR, testé, navigateur et Node) ═════════════
   Outils : ligne horizontale, trendline, boîte (rectangle libre), Fibonacci. Chaque dessin porte l'unité de temps où il a été tracé (H1, H4, Jour) : c'est SUR CETTE UNITÉ qu'il est évalué,
   uniquement sur des bougies CLÔTURÉES (jamais pendant qu'une bougie se forme). Bougie = { t (ouverture, ms UTC), o, h, l, c, v }.
   Événements (une flèche par événement et par niveau) :
   - REBOND confirmé : le prix TOUCHE le niveau (ou entre dans la boîte), la bougie clôture du bon côté avec une mèche de rejet nette (≥ 50 % de la bougie) et un volume > moyenne des 20 bougies précédentes.
   - CASSURE confirmée : clôture au-delà du niveau d'au moins 0,25 ATR(14), volume > moyenne. Le niveau passe en « cassé ». RETEST : le prix revient sur le niveau cassé et clôture de nouveau du côté de la cassure (mèche ≥ 25 % de la bougie) → seconde flèche, plus discrète, une seule par cassure.
   - Pas de répétition : après un événement, le prix doit s'éloigner d'au moins 1 ATR du niveau (du bon côté) puis revenir avant qu'un nouvel événement du même type soit possible.
   - Volume : si la série n'a aucun volume (moyenne nulle), la condition de volume ne peut pas être évaluée : elle est ignorée et l'événement le dit (volRatio = null). */
import { atr, pivots } from '../commun/analyse.js';

export const UNITES = Object.freeze(['H1', 'H4', 'J']);
export const NOM_UNITE = Object.freeze({ H1: 'H1', H4: 'H4', J: 'Jour' });
export const PAS = Object.freeze({ H1: 3600e3, H4: 4 * 3600e3, J: 86400e3 });
export const TYPES = Object.freeze(['horizontale', 'tendance', 'boite', 'fibo']);
export const NOMS = Object.freeze({ horizontale: 'Ligne horizontale', tendance: 'Trendline', boite: 'Boîte', fibo: 'Fibonacci' });
/* quatre couleurs sobres : bleu Jarvis, sable, vert, rouge atténués (les mêmes que le reste du terminal) */
export const COULEURS = Object.freeze(['#8fd0e3', '#c9b27a', '#5fb894', '#d86a6a']);
export const PARAMS = Object.freeze({ atrN: 14, volN: 20, margeCassure: 0.25, eloignement: 1, meche: 0.5, mecheRetest: 0.25, historiqueHoriz: 120 });
export const ETATS = Object.freeze(['actif', 'touché', 'cassé', 'retesté']);
/* Fibonacci : on n'affiche que ces niveaux */
export const FIB = Object.freeze({ zoneHaut: 0.5, zoneBas: 0.705, premiumHaut: 0.618, premiumBas: 0.705, ligne: 0.382, extensions: [1.272, 1.618] });

const r4 = x => Math.round(x * 1e4) / 1e4;
let compteur = 0;
export const nouvelId = (t = Date.now()) => `n${t.toString(36)}${(compteur++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const fin = x => Number.isFinite(x);

/* ───── modèle ───── */
export function creer(type, d, { t = Date.now(), id = nouvelId(t) } = {}) {
  if (!TYPES.includes(type) || !d) return null;
  const unite = UNITES.includes(d.unite) ? d.unite : null; if (!unite) return null;
  const base = { id, type, unite, couleur: COULEURS.includes(d.couleur) ? d.couleur : COULEURS[0], verrou: !!d.verrou, alerte: d.alerte !== false, cree: d.cree ?? t, maj: d.maj ?? t, evenements: Array.isArray(d.evenements) ? d.evenements : [] };
  if (type === 'horizontale') { if (!(d.p > 0)) return null; return { ...base, p: r4(d.p) }; }
  if (!fin(d.t1) || !fin(d.t2) || !(d.p1 > 0) || !(d.p2 > 0)) return null;
  if (type === 'tendance') { if (d.t1 === d.t2) return null; const [a, b] = d.t1 < d.t2 ? [[d.t1, d.p1], [d.t2, d.p2]] : [[d.t2, d.p2], [d.t1, d.p1]]; return { ...base, t1: a[0], p1: r4(a[1]), t2: b[0], p2: r4(b[1]) }; }
  if (type === 'boite') { if (d.t1 === d.t2 || d.p1 === d.p2) return null; const t1 = Math.min(d.t1, d.t2), t2 = Math.max(d.t1, d.t2); return { ...base, t1, t2, bas: r4(Math.min(d.p1, d.p2)), haut: r4(Math.max(d.p1, d.p2)) }; }
  if (type === 'fibo') { if (d.p1 === d.p2 || d.t1 === d.t2) return null; return { ...base, t1: d.t1, p1: r4(d.p1), t2: d.t2, p2: r4(d.p2), auto: !!d.auto }; }   // A = (t1, p1) départ, B = (t2, p2) fin de l'impulsion
  return null;
}
/* modification : seuls les champs connus, puis revalidation (renvoie le nouvel objet ou null) */
export function modifier(o, champs, maintenant = Date.now()) {
  const permis = { horizontale: ['p'], tendance: ['t1', 'p1', 't2', 'p2'], boite: ['t1', 't2', 'bas', 'haut'], fibo: ['t1', 'p1', 't2', 'p2'] }[o.type] || [];
  const d = { ...o }; for (const k of [...permis, 'couleur', 'verrou', 'alerte', 'evenements']) if (k in champs) d[k] = champs[k];
  if (o.type === 'boite') { d.p1 = d.bas; d.p2 = d.haut; }
  const n = creer(o.type, d, { t: o.cree, id: o.id }); return n ? { ...n, cree: o.cree, maj: maintenant } : null;
}

/* ───── Fibonacci ───── */
/* impulsion A → B : retracement r (0 = B, 1 = A) ; extension e (1 = B, 1,272 et 1,618 au-delà de B) */
export function fibo(o) {
  const A = o.p1, B = o.p2, dir = B > A ? 1 : -1, ret = r => B - (B - A) * r, ext = e => A + (B - A) * e;
  const a = ret(FIB.zoneHaut), b = ret(FIB.zoneBas), c = ret(FIB.premiumHaut), d = ret(FIB.premiumBas);
  return {
    dir, A, B, tA: o.t1, tB: o.t2,
    zone: { bas: Math.min(a, b), haut: Math.max(a, b), r1: FIB.zoneHaut, r2: FIB.zoneBas },
    premium: { bas: Math.min(c, d), haut: Math.max(c, d), r1: FIB.premiumHaut, r2: FIB.premiumBas },
    ligne382: { r: FIB.ligne, prix: ret(FIB.ligne) },
    objectifs: FIB.extensions.map(e => ({ r: e, prix: ext(e) })),
    invalidation: A
  };
}
/* ancrage automatique : la dernière impulsion majeure (creux → sommet ou sommet → creux, amplitude ≥ 3 ATR) sur les bougies de l'unité affichée */
export function ancrageAuto(B, { k = 5, amplitudeAtr = 3 } = {}) {
  if (!B || B.length < 40) return null;
  const a = atr(B, PARAMS.atrN); let at = null; for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) { at = a[i]; break; } if (!at) return null;
  const P = pivots(B, k).sort((x, y) => x.i - y.i), M = [];
  for (const p of P) { const l = M[M.length - 1]; if (l && l.type === p.type) { if ((p.type === 'R' && p.prix > l.prix) || (p.type === 'S' && p.prix < l.prix)) M[M.length - 1] = p; } else M.push(p); }
  for (let j = M.length - 1; j >= 1; j--) if (Math.abs(M[j].prix - M[j - 1].prix) >= amplitudeAtr * at) return { t1: M[j - 1].t, p1: M[j - 1].prix, t2: M[j].t, p2: M[j].prix };
  return null;
}

/* ───── géométrie évaluée : bande [bas, haut] du niveau à l'instant t ───── */
export function bande(o, t) {
  if (o.type === 'horizontale') return { bas: o.p, haut: o.p };
  if (o.type === 'tendance') { if (t < o.t1) return null; const v = o.p1 + (o.p2 - o.p1) * (t - o.t1) / (o.t2 - o.t1); return v > 0 ? { bas: v, haut: v } : null; }
  if (o.type === 'boite') return t < o.t1 ? null : { bas: o.bas, haut: o.haut };
  if (o.type === 'fibo') { const F = fibo(o); return t < F.tB ? null : { bas: F.zone.bas, haut: F.zone.haut }; }
  return null;
}
/* instant à partir duquel on évalue (les bougies avant sont l'historique du graphique) */
export const debutEvaluation = (o, pas) => (o.type === 'horizontale' ? o.cree - PARAMS.historiqueHoriz * pas : o.type === 'fibo' ? Math.max(o.t1, o.t2) : Math.min(o.t1, o.t2));

/* ───── évaluation à la clôture ───── */
export const cloturees = (B, pas, maintenant = Date.now()) => (B || []).filter(b => b.t + pas <= maintenant);
function volMoyen(B, i, n = PARAMS.volN) { if (i < n) return 0; let s = 0; for (let j = i - n; j < i; j++) s += B[j].v || 0; return s / n; }
/* o : dessin ; Bbrut : bougies de l'unité d'ORIGINE ; renvoie { etat, evenements, touches } — rejouable : même entrée, même sortie */
export function evaluer(o, Bbrut, { maintenant = Date.now(), params = PARAMS } = {}) {
  const pas = PAS[o.unite], B = cloturees(Bbrut, pas, maintenant), A = atr(B, params.atrN), t0 = debutEvaluation(o, pas), evs = [];
  const F = o.type === 'fibo' ? fibo(o) : null, sensFib = F ? F.dir : 0;
  let etat = 'actif', touches = 0, coteMem = 0, armRebond = true, armCass = true, cassure = null, retestFait = false, iRebond = -9, iCass = -9, invalide = false;
  const pousse = (type, dir, i, niveau, a, vr) => evs.push({ id: `${o.id}|${type}|${B[i].t}`, niveauId: o.id, type, dir, unite: o.unite, t: B[i].t, tFin: B[i].t + pas, entree: B[i].c, niveau, volRatio: vr, atr: a, vueLe: null });
  for (let i = 1; i < B.length; i++) {
    const b = B[i], a = A[i]; if (a == null || b.t < t0) continue;   // ATR pas encore calculable, ou bougie antérieure au début de l'évaluation
    const z = bande(o, b.t + pas / 2); if (!z) continue; const lo = z.bas, hi = z.haut, prev = B[i - 1].c;
    if (coteMem === 0) { if (prev > hi) coteMem = 1; else if (prev < lo) coteMem = -1; else { coteMem = b.c > hi ? 1 : b.c < lo ? -1 : 0; continue; } }
    const touche = b.l <= hi && b.h >= lo, vm = volMoyen(B, i), vOk = vm > 0 ? (b.v || 0) > vm : true, vr = vm > 0 ? (b.v || 0) / vm : null, rg = b.h - b.l;
    const mecheBas = Math.min(b.o, b.c) - b.l, mecheHaut = b.h - Math.max(b.o, b.c);
    if (touche) { touches++; if (etat === 'actif') etat = 'touché'; }
    if (F && !invalide && (sensFib > 0 ? b.c < F.invalidation : b.c > F.invalidation)) { invalide = true; etat = 'cassé'; }
    let evenement = false;
    /* cassure (pas pour Fibonacci : le franchissement de la zone n'est pas un signal, seul le 100 % invalide) */
    if (!F && armCass) {
      if (coteMem === -1 && b.c > hi + params.margeCassure * a && vOk) { pousse('cassure', 1, i, hi, a, vr); cassure = { dir: 1, i }; retestFait = false; etat = 'cassé'; armCass = false; iCass = i; coteMem = 1; evenement = true; }
      else if (coteMem === 1 && b.c < lo - params.margeCassure * a && vOk) { pousse('cassure', -1, i, lo, a, vr); cassure = { dir: -1, i }; retestFait = false; etat = 'cassé'; armCass = false; iCass = i; coteMem = -1; evenement = true; }
    }
    /* retest : une seule fois après chaque cassure */
    if (!evenement && cassure && !retestFait && i > cassure.i && touche && rg > 0) {
      if (cassure.dir > 0 && b.c > hi && mecheBas >= params.mecheRetest * rg) { pousse('retest', 1, i, hi, a, vr); retestFait = true; etat = 'retesté'; evenement = true; }
      else if (cassure.dir < 0 && b.c < lo && mecheHaut >= params.mecheRetest * rg) { pousse('retest', -1, i, lo, a, vr); retestFait = true; etat = 'retesté'; evenement = true; }
    }
    /* rebond (Fibonacci : seulement dans le sens de l'impulsion, tant que le 100 % n'est pas cassé) */
    if (!evenement && touche && armRebond && rg > 0 && !invalide && !(cassure && !retestFait && !F)) {
      if (coteMem === 1 && b.c > hi && mecheBas >= params.meche * rg && vOk && (!F || sensFib > 0)) { pousse('rebond', 1, i, hi, a, vr); armRebond = false; iRebond = i; evenement = true; }
      else if (coteMem === -1 && b.c < lo && mecheHaut >= params.meche * rg && vOk && (!F || sensFib < 0)) { pousse('rebond', -1, i, lo, a, vr); armRebond = false; iRebond = i; evenement = true; }
    }
    /* ré-armement : le prix s'éloigne d'au moins 1 ATR du niveau, du côté où il se trouve */
    if (i > iRebond && !armRebond && ((coteMem > 0 && b.h - hi >= params.eloignement * a) || (coteMem < 0 && lo - b.l >= params.eloignement * a))) armRebond = true;
    if (i > iCass && !armCass && ((coteMem > 0 && b.h - hi >= params.eloignement * a) || (coteMem < 0 && lo - b.l >= params.eloignement * a))) armCass = true;
    /* côté mémorisé : mis à jour avec la clôture quand elle est hors de la bande */
    if (b.c > hi) coteMem = 1; else if (b.c < lo) coteMem = -1;
  }
  return { etat, evenements: evs, touches, invalide };
}
/* fusion avec les événements déjà enregistrés : un événement confirmé ne bouge plus et n'est annoncé qu'une fois (vueLe) */
export function fusionnerEvenements(existants = [], calcules = []) {
  const vus = new Set(existants.map(e => e.id)), out = existants.slice();
  for (const e of calcules) if (!vus.has(e.id)) { out.push({ ...e }); vus.add(e.id); }
  return out.sort((a, b) => a.tFin - b.tFin);
}

/* ───── textes ───── */
const fnb = v => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4 }).replace(/[  ]/g, ' ') : '—');
export const prixTexte = fnb;
const NOM_EV = { rebond: 'Rebond', cassure: 'Cassure', retest: 'Retest' };
const nf1 = v => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/* « Rebond H4 confirmé · niveau 3 612 · volume ×1,6 » */
export function libelle(ev) {
  const nom = NOM_EV[ev.type] || 'Événement', u = NOM_UNITE[ev.unite] || ev.unite, vol = ev.volRatio != null ? ` · volume ×${nf1(ev.volRatio)}` : ' · volume indisponible';
  return `${nom} ${u} ${ev.type === 'retest' ? 'réussi' : 'confirmé'} · niveau ${fnb(ev.niveau)}${vol}`;
}
export const typeNiveau = o => (o ? { horizontale: 'ton niveau', tendance: 'ta trendline', boite: 'ta boîte', fibo: 'ta zone Fibonacci' }[o.type] : 'ton niveau');
/* phrase annoncée par Rayle et envoyée sur Telegram : « Or : rebond H4 confirmé sur ton niveau 3 612 (volume ×1,6) » */
export function phrase(nomActif, o, ev) {
  const nom = (NOM_EV[ev.type] || 'événement').toLowerCase(), u = NOM_UNITE[ev.unite] || ev.unite, vol = ev.volRatio != null ? ` (volume ×${nf1(ev.volRatio)})` : '';
  return `${nomActif} : ${nom} ${u} ${ev.type === 'retest' ? 'réussi' : 'confirmé'} sur ${typeNiveau(o)} ${fnb(ev.niveau)}${vol}`;
}
