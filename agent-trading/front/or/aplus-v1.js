/* ═════════════ SETUP « A+ » — règle figée « aplus-v1 » (SHA-256 dans aplus-v1.sceau.json, posé AVANT le rejeu) ═════════════
   Ce n'est pas un bot : Rayle lit, alerte et propose ; aucun ordre n'est envoyé. Cinq conditions réunies à la clôture d'une bougie H1 :
   1. un événement EMA200 (cassure, rebond ou fausse cassure de ema200-regles.mjs) dont le volume de la bougie dépasse 1,5 fois la moyenne des 20 bougies précédentes ;
   2. le sens est aligné avec la structure H4 (tendance H4 de structure-marche-v1 dans le même sens) ;
   3. le carnet ou le delta confirme (pression dans le sens, lecture du carnet de carnet-lecture-v1) — NON ÉVALUABLE sur l'historique (aucun historique de carnet) : le rejeu l'ignore et le dit ;
   4. une zone ou un niveau à proximité (≤ 0,5 ATR) : niveaux de boites-v1 (swings H4, veille, semaine, volume) ou golden zone valide ;
   5. pas en range (≥ 3 traversées de l'EMA200 sur 50 bougies) et pas à moins de 30 minutes d'une annonce majeure (calendrier : en direct seulement).
   Limites : 3 alertes par jour de Paris au plus, 60 minutes entre deux alertes. Taille : 0,25 % de risque sur 10 000 $ = 25 $ / distance du stop. Stop : extrême des 24 dernières bougies, distance bornée entre 1,5 et 3 ATR(14). Pur, sans DOM. */
import * as ER from '../../recherche-or/ema200-regles.mjs';
import * as MA from './ma-evenements-v1.js'; import * as Z from './boites-v1.js'; import * as GD from './golden-v1.js'; import { analyser as analyserStructure } from './structure-marche-v1.js';
export const VERSION = 'aplus-v1', FIGEES_LE = '2026-11-12';
export const P = Object.freeze({ volumeFois: 1.5, volumeFenetre: 20, proximiteAtr: 0.5, annonceMin: 30, maxParJour: 3, ecartMin: 60, capital: 10000, risquePct: 0.0025, stopMinAtr: 1.5, stopMaxAtr: 3, extreme: 24, horizons: [6, 12, 24], grosseCassureAtr: 5 });
export const CONDITIONS = Object.freeze(['Événement EMA200 avec volume > 1,5 × la moyenne', 'Sens aligné avec la structure H4', 'Carnet ou delta qui confirme', 'Zone ou niveau à proximité', 'Pas en range ni près d\'une annonce majeure']);
const jourParis = t => new Date(t).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
/* stop structurel et taille depuis la clôture de la bougie i (prix indicatif = clôture ; l'entrée réelle est l'ouverture suivante) */
export function plan(B, A, i, dir, R = P) {
  let ext = dir > 0 ? Infinity : -Infinity; for (let k = Math.max(0, i - R.extreme + 1); k <= i; k++) ext = dir > 0 ? Math.min(ext, B[k].l) : Math.max(ext, B[k].h);
  const entree = B[i].c, brut = Math.abs(entree - ext), dist = Math.min(R.stopMaxAtr * A[i], Math.max(R.stopMinAtr * A[i], brut)), stop = entree - dir * dist, risque$ = R.capital * R.risquePct;
  return { entree, stop, distance: dist, taille: risque$ / dist, risque$, atr: A[i] };
}
/* contexte calculé une fois pour une série (rejeu) ou à chaque clôture (direct) */
export function preparer(B) {
  const E = ER.emaSerie(B), A = ER.atrSerie(B), sm = analyserStructure(B, { periode: 3600e3 }); return { B, E, A, h4: MA.tendanceH4(B), prep: Z.preparer(B), swings: sm.swings };
}
/* évalue les 5 conditions pour l'événement ev (de ema200-regles.evenements). carnet : true | false | null (null = non évaluable) ; annonces : heures (ms) des annonces majeures ou null */
export function evaluer(ctx, ev, { carnet = null, annonces = null } = {}, R = P) {
  const { B, E, A } = ctx, i = ev.i, c = [];
  let moy = 0, k = 0; for (let q = Math.max(0, i - R.volumeFenetre); q < i; q++) if (B[q].v > 0) { moy += B[q].v; k++; } moy = k ? moy / k : 0; const vr = moy > 0 && B[i].v > 0 ? B[i].v / moy : null;
  c.push({ ok: vr != null && vr > R.volumeFois, detail: vr == null ? 'volume indisponible' : `volume ${vr.toFixed(2).replace('.', ',')} × la moyenne` });
  const t4 = ctx.h4[i]; c.push({ ok: t4 === ev.dir, detail: `structure H4 ${t4 > 0 ? 'haussière' : t4 < 0 ? 'baissière' : 'en range'}` });
  c.push({ ok: carnet === null ? null : !!carnet, detail: carnet === null ? 'non évaluable (aucun historique de carnet)' : carnet ? 'carnet / delta dans le sens' : 'carnet / delta ne confirme pas' });
  const a = A[i], prix = B[i].c; let proche = null; for (const n of Z.niveauxA(ctx.prep, i)) { const d = Math.abs(n.p - prix) / a; if (d <= R.proximiteAtr && (!proche || d < proche.d)) proche = { d, nom: n.nom, p: n.p }; }
  const g = GD.golden(B.slice(0, i + 1), ctx.swings, A); if (g && !g.invalide) { const d = prix < g.bas ? (g.bas - prix) / a : prix > g.haut ? (prix - g.haut) / a : 0; if (d <= R.proximiteAtr && (!proche || d < proche.d)) proche = { d, nom: 'golden zone', p: (g.bas + g.haut) / 2 }; }
  c.push({ ok: !!proche, detail: proche ? `${proche.nom} ${proche.p.toFixed(1)} à ${proche.d.toFixed(2).replace('.', ',')} ATR` : 'aucune zone ni niveau à ≤ 0,5 ATR' });
  const range = ER.enRange(B, E, i), annonce = annonces ? annonces.some(t => Math.abs(t - (B[i].t + 3600e3)) <= R.annonceMin * 60e3) : false;
  c.push({ ok: !range && !annonce, detail: range ? 'range (≥ 3 traversées de l\'EMA200 sur 50 bougies)' : annonce ? 'annonce majeure à moins de 30 minutes' : annonces ? 'hors range, pas d\'annonce proche' : 'hors range (annonces : non évaluées)' });
  const evaluees = c.filter(x => x.ok !== null), tout = evaluees.every(x => x.ok);
  return { conditions: c, reunies: tout, evaluables: evaluees.length, nOk: evaluees.filter(x => x.ok).length, volumeRelatif: vr };
}
/* limites : 3 par jour de Paris, 60 minutes entre deux alertes ; liste d'alertes déjà émises (avec t = clôture) */
export function permis(emises, tCloture, R = P) { const j = jourParis(tCloture); return emises.filter(a => jourParis(a.tCloture) === j).length < R.maxParJour && emises.every(a => tCloture - a.tCloture >= R.ecartMin * 60e3); }
/* rejeu complet sur une série H1 : renvoie { alertes, evenements (avec conditions) } ; depuisI : premier indice rejoué */
export function rejeu(B, { depuisI = 0, carnet = null, annonces = null } = {}) {
  const ctx = preparer(B), EV = ER.evenements(B, { depuisI, E: ctx.E, A: ctx.A }), emises = [], tous = [];
  for (const ev of EV) { const ev2 = evaluer(ctx, ev, { carnet, annonces }), tCl = B[ev.i].t + 3600e3, ok = ev2.reunies && permis(emises, tCl); const rec = { ev, ...ev2, emise: ok, tCloture: tCl };
    if (ok) { const pl = plan(B, ctx.A, ev.i, ev.dir); rec.plan = pl; emises.push(rec); } tous.push(rec); }
  return { ctx, alertes: emises, evenements: tous };
}
/* résultat d'une alerte à h bougies : entrée à l'ouverture suivante, stop structurel, sortie à la clôture de i + h ; R brut (sans frais) ou null */
export function resultat(B, A, i, dir, h, R = P) {
  const e = i + 1, f = i + h; if (f >= B.length) return null; const pl = plan(B, A, i, dir, R), entree = B[e].o, risque = pl.distance, stop = entree - dir * risque;
  for (let k = e; k <= f; k++) if (dir > 0 ? B[k].l <= stop : B[k].h >= stop) { const px = dir > 0 ? Math.min(stop, B[k].o) : Math.max(stop, B[k].o); return { R0: dir * (px - entree) / risque, risque, entree, stoppe: true }; }
  return { R0: dir * (B[f].c - entree) / risque, risque, entree, stoppe: false };
}
/* phrase dite à voix haute pour une alerte (jamais un ordre : une proposition à lire, avec l'état « non prouvé ») */
export function phrase(al, stat) {
  const p = al.plan, s = stat && stat.n >= 30 ? `Statistique réelle : ${stat.n} alertes, ${Math.round(stat.reussite * 100)} % de réussite à 12 bougies.` : `Règle non prouvée : ${stat ? stat.n : 0} alerte${stat && stat.n > 1 ? 's' : ''} mesurée${stat && stat.n > 1 ? 's' : ''}, il en faut 30.`;
  return `Setup A plus, ${al.ev.dir > 0 ? 'achat' : 'vente'} possible sur l’EMA200. Entrée vers ${Math.round(p.entree)}, stop ${Math.round(p.stop)}, taille ${p.taille.toFixed(2).replace('.', ',')} once pour 0,25 % de risque sur 10 000 dollars, soit ${p.risque$.toFixed(0)} dollars. ${s} Ce n’est pas un ordre.`;
}
