/* ═════════════ FLÈCHES DU TERMINAL — règle figée « fleches-terminal-v1 » (écrite le 2026-11-11 AVANT les tests) ═════════════
   Pur, sans DOM, sans réseau. Bougies { t (ouverture), o, h, l, c, v } H1 CLOSES ; la flèche d'une bougie i est posée à sa CLÔTURE (t + 1 h) et n'utilise
   que les bougies jusqu'à i (aucun repaint). Même règle pour tous les instruments : tout est exprimé en ATR de l'instrument.

   A. Moyenne mobile 200 (SMA 200 des clôtures H1) — réutilise ma-evenements-v1 (règle scellée) sans la modifier :
      • cassure haussière / baissière : clôture de l'autre côté de la MA avec un écart ≥ 0,25 ATR ;
      • retour (cassure confirmée) : après la cassure, un retest de la MA qui tient en clôture, ou 3 clôtures consécutives du côté de la cassure ;
      • rebond : extrême à ≤ 0,25 ATR de la MA puis clôture à ≥ 0,5 ATR de la MA, du même côté, dans les 3 bougies suivantes ;
      • fausse cassure : retour en clôture du côté d'origine dans les 6 bougies après la cassure (flèche dans le sens du retour).
   B. Niveaux majeurs (niveaux-majeurs-v1, causal) et zones tracées par l'utilisateur (zone ou ligne horizontale, créées avant la bougie) :
      • TOUCHE : la bougie i a une mèche dans la zone élargie de 0,25 ATR de chaque côté, et la bougie précédente clôturait en dehors, du côté d'arrivée ;
      • RÉACTION : dans les 3 bougies suivant la touche (la bougie de touche comprise), une clôture s'éloigne d'au moins 0,5 ATR du bord de la zone, du côté d'arrivée,
        sans qu'une clôture ait traversé la zone entre-temps. La flèche se pose à la clôture de cette bougie de réaction ;
      • au plus une flèche par zone et par épisode : la zone est « réarmée » quand le prix s'est éloigné d'au moins 1 ATR puis est revenu.
   C. Résultat mesuré après chaque flèche (jamais utilisé pour la décider) : déplacement favorable et défavorable maximal, en ATR, mesuré sur les 6, 12 et 24
      bougies suivantes ; « en cours » tant que les 24 bougies ne sont pas toutes closes. C'est une description de ce qui s'est passé, pas une promesse.
   Ceci décrit le marché : ce n'est ni un signal d'entrée ni un ordre. */
import * as MA from './ma-evenements-v1.js';
import * as NM from './niveaux-majeurs-v1.js';

export const VERSION = 'fleches-terminal-v1', FIGEES_LE = '2026-11-11';
export const H = 3600e3;
export const P = Object.freeze({ toucheAtr: 0.25, reactionAtr: 0.5, fenetreReaction: 3, rearmeAtr: 1, horizons: [6, 12, 24], atrN: 14, jours: 30 });
export const TYPES = Object.freeze({
  ma_cassure: 'Cassure de la MA200', ma_retour: 'Retour sur la MA200 (cassure confirmée)', ma_rebond: 'Rebond sur la MA200', ma_fausse: 'Fausse cassure de la MA200',
  niveau_rebond: 'Rebond sur un niveau majeur', zone_rebond: 'Rebond sur une zone tracée'
});
const MAP_MA = { cassure: 'ma_cassure', confirmee: 'ma_retour', rebond: 'ma_rebond', fausse: 'ma_fausse' };

export function atrSerie(B, n = P.atrN) {
  const o = new Array(B.length).fill(null); let a = null, s = 0;
  for (let i = 1; i < B.length; i++) { const tr = Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c)); if (i <= n) { s += tr; if (i === n) { a = s / n; o[i] = a; } } else { a = (a * (n - 1) + tr) / n; o[i] = a; } }
  return o;
}
export const nomDirection = (type, dir) => {
  if (type === 'ma_cassure') return dir > 0 ? 'Cassure haussière de la MA200' : 'Cassure baissière de la MA200';
  if (type === 'ma_retour') return dir > 0 ? 'Retour sur la MA200 par le haut (cassure haussière confirmée)' : 'Retour sur la MA200 par le bas (cassure baissière confirmée)';
  if (type === 'ma_rebond') return dir > 0 ? 'Rebond haussier sur la MA200' : 'Rebond baissier sur la MA200';
  if (type === 'ma_fausse') return dir > 0 ? 'Fausse cassure baissière : le prix repasse au-dessus de la MA200' : 'Fausse cassure haussière : le prix repasse sous la MA200';
  if (type === 'niveau_rebond') return dir > 0 ? 'Rebond haussier sur un niveau majeur (support)' : 'Rebond baissier sur un niveau majeur (résistance)';
  return dir > 0 ? 'Rebond haussier sur une zone tracée (support)' : 'Rebond baissier sur une zone tracée (résistance)';
};
const arrondi = x => Math.round(x * 100) / 100;

/* ── A. MA200 ── */
export function flechesMa(B, { mode = 'h1' } = {}) {
  if (!B || B.length < 220) return [];
  const res = MA.analyser(B, { mode, periode: H }), out = [];
  for (const e of res.events) {
    const type = MAP_MA[e.type]; if (!type) continue;   // « expirée » : pas de flèche
    // la fausse cassure est une flèche dans le sens du RETOUR (opposé à la cassure)
    const dir = e.type === 'fausse' ? e.dir : e.dir;
    out.push({ id: `${type}|${e.t}|${dir}`, type, dir, i: e.i, t: e.t, tCloture: e.t + H, prix: B[e.i].c, niveau: e.niveau, atr: e.atr, nom: nomDirection(type, dir), source: 'MA200' });
  }
  return out;
}

/* ── B. niveaux majeurs et zones de l'utilisateur ── */
/* zones [{ id, bas, haut, nom, type, depuis (ms), jusqua (ms|null) }] valides à la bougie i */
const actives = (zones, t) => zones.filter(z => (z.depuis == null || z.depuis <= t) && (z.jusqua == null || z.jusqua > t));
export function flechesZones(B, A, zonesDe, { debut = 0 } = {}) {
  const out = [], etat = new Map();   // id de zone → { arme, attente: { cote, iTouche } }
  for (let i = Math.max(1, debut); i < B.length; i++) {
    const a = A[i]; if (!(a > 0)) continue;
    const zs = zonesDe(i); if (!zs.length) continue;
    for (const z of zs) {
      const marge = P.toucheAtr * a, bas = z.bas, haut = z.haut; let s = etat.get(z.id); if (!s) { s = { arme: true, attente: null, loin: true }; etat.set(z.id, s); }
      const c = B[i].c, prec = B[i - 1].c;
      // réarmement : le prix s'est éloigné d'au moins 1 ATR de la zone
      const dist = c > haut ? c - haut : c < bas ? bas - c : 0; if (dist >= P.rearmeAtr * a) s.loin = true;
      if (!s.arme && s.loin && dist >= P.rearmeAtr * a) s.arme = true;
      // une attente en cours : réaction, traversée ou expiration
      if (s.attente) {
        const w = s.attente, sens = w.cote;   // +1 : arrivé par le haut (support), −1 : arrivé par le bas (résistance)
        const traverse = sens > 0 ? c < bas : c > haut;
        if (traverse) s.attente = null;
        else {
          const reac = sens > 0 ? c - haut >= P.reactionAtr * a : bas - c >= P.reactionAtr * a;
          if (reac) { out.push({ id: `${z.type}|${z.id}|${B[i].t}|${sens}`, type: z.type, dir: sens, i, t: B[i].t, tCloture: B[i].t + H, prix: c, niveau: sens > 0 ? haut : bas, atr: a, nom: `${nomDirection(z.type, sens)} · ${z.nom}`, zone: z.id, source: z.nom }); s.attente = null; s.arme = false; s.loin = false; continue; }
          if (i - w.iTouche >= P.fenetreReaction) s.attente = null;
        }
      }
      if (!s.arme || s.attente) continue;
      // touche : mèche dans la zone élargie, bougie précédente close en dehors du côté d'arrivée
      const touche = B[i].l <= haut + marge && B[i].h >= bas - marge;
      if (!touche) continue;
      const cote = prec > haut ? 1 : prec < bas ? -1 : 0; if (!cote) continue;
      const reste = cote > 0 ? c >= bas : c <= haut;   // la bougie de touche ne traverse pas la zone en clôture
      if (!reste) continue;
      s.attente = { cote, iTouche: i };
      const reac0 = cote > 0 ? c - haut >= P.reactionAtr * a : bas - c >= P.reactionAtr * a;   // réaction dès la bougie de touche
      if (reac0) { out.push({ id: `${z.type}|${z.id}|${B[i].t}|${cote}`, type: z.type, dir: cote, i, t: B[i].t, tCloture: B[i].t + H, prix: c, niveau: cote > 0 ? haut : bas, atr: a, nom: `${nomDirection(z.type, cote)} · ${z.nom}`, zone: z.id, source: z.nom }); s.attente = null; s.arme = false; s.loin = false; }
    }
  }
  return out;
}
/* niveaux majeurs de niveaux-majeurs-v1 à la clôture de la bougie i, sous forme de zones */
export function zonesMajeures(B, ctx) {
  const cache = new Map();
  return i => {
    if (cache.has(i)) return cache.get(i);
    let r = []; try {
      const m = NM.niveauxMajeurs(ctx, i); const lim = m.atrj ? 0.05 * m.atrj : 0;
      r = [...(m.haut || []), ...(m.bas || [])].map(z => ({ id: 'nm' + Math.round(z.centre * 100), bas: (z.bas ?? z.centre) - lim, haut: (z.haut ?? z.centre) + lim, nom: NM.etiquette(z), type: 'niveau_rebond', depuis: null, jusqua: null }));
    } catch (e) { r = []; }
    cache.set(i, r); return r;
  };
}
export function zonesUtilisateur(objets, atrRef = 0) {
  return (objets || []).filter(o => o.type === 'zone' || o.type === 'horizontale').map(o => o.type === 'zone'
    ? { id: 'u' + o.id, bas: o.bas, haut: o.haut, nom: o.etiquette || `zone ${Math.round(o.bas)}–${Math.round(o.haut)}`, type: 'zone_rebond', depuis: o.cree || null, jusqua: null }
    : { id: 'u' + o.id, bas: o.p - atrRef * 0.02, haut: o.p + atrRef * 0.02, nom: o.etiquette || `ligne ${Math.round(o.p)}`, type: 'zone_rebond', depuis: o.cree || null, jusqua: null });
}

/* ── C. résultat mesuré à 6, 12 et 24 bougies (excursions en ATR, du point de vue de la direction de la flèche) ── */
export function resultat(B, f) {
  const o = {}, ref = f.prix, a = f.atr;
  for (const n of P.horizons) {
    if (f.i + n > B.length - 1) { o[n] = null; continue; }
    let fav = 0, adv = 0;
    for (let k = f.i + 1; k <= f.i + n; k++) { const up = (B[k].h - ref) / a, dn = (ref - B[k].l) / a; fav = Math.max(fav, f.dir > 0 ? up : dn); adv = Math.max(adv, f.dir > 0 ? dn : up); }
    o[n] = { fav: arrondi(fav), adv: arrondi(adv), clot: arrondi(f.dir * (B[f.i + n].c - ref) / a) };
  }
  return o;
}
export const textesResultat = (r) => P.horizons.map(n => r && r[n] ? `${n} bougies : ${r[n].fav >= 0 ? '+' : ''}${r[n].fav.toFixed(2).replace('.', ',')} ATR favorable, ${r[n].adv.toFixed(2).replace('.', ',')} défavorable, clôture ${r[n].clot >= 0 ? '+' : '−'}${Math.abs(r[n].clot).toFixed(2).replace('.', ',')} ATR` : `${n} bougies : en cours`);

/* ── tout en un ── */
/* B : bougies H1 closes triées ; objets : objets de l'utilisateur (zones, lignes) ; maintenant : horloge injectée.
   Renvoie les flèches des `jours` derniers jours (ou toutes si jours = null), triées, avec leur résultat mesuré. */
export function calculer(B, { objets = [], maintenant = Date.now(), jours = P.jours, mode = 'h1', avecNiveaux = true } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 30) return { fleches: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes` };
  const A = atrSerie(closes), fin = closes[closes.length - 1].t, depuisT = jours == null ? -Infinity : fin - jours * 86400e3 - 30 * H;
  const debut = Math.max(1, closes.findIndex(b => b.t >= depuisT));
  let F = [];
  try { F.push(...flechesMa(closes, { mode })); } catch (e) { /* MA indisponible : le reste continue */ }
  const atrDernier = A[A.length - 1] || 0;
  const zu = zonesUtilisateur(objets, atrDernier); if (zu.length) F.push(...flechesZones(closes, A, i => actives(zu, closes[i].t + H), { debut }));
  if (avecNiveaux) { try { const ctx = NM.preparer(closes); F.push(...flechesZones(closes, A, zonesMajeures(closes, ctx), { debut })); } catch (e) { /* niveaux indisponibles */ } }
  const seuil = jours == null ? -Infinity : fin - jours * 86400e3;
  F = F.filter(f => f.t >= seuil).sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const vus = new Set(); F = F.filter(f => (vus.has(f.id) ? false : (vus.add(f.id), true)));
  return { fleches: F.map(f => ({ ...f, resultat: resultat(closes, f) })), n: closes.length, raison: null };
}
/* registre « ajout seul » : une flèche déjà posée n'est jamais déplacée ni retirée ; seul son résultat mesuré s'enrichit */
export function fusionnerRegistre(registre, calcul) {
  const m = new Map((registre || []).map(f => [f.id, f]));
  for (const f of calcul) { const e = m.get(f.id); if (!e) m.set(f.id, f); else m.set(f.id, { ...e, resultat: f.resultat || e.resultat }); }
  return [...m.values()].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}
export function bilan(F) {
  const par = {}; for (const f of F) { const k = f.type; par[k] = par[k] || { n: 0, mesures24: 0, fav: [], adv: [] }; par[k].n++; if (f.resultat && f.resultat[24]) { par[k].mesures24++; par[k].fav.push(f.resultat[24].fav); par[k].adv.push(f.resultat[24].adv); } }
  const med = x => { if (!x.length) return null; const s = x.slice().sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  return Object.fromEntries(Object.entries(par).map(([k, v]) => [k, { n: v.n, mesures24: v.mesures24, favMediane: med(v.fav), advMediane: med(v.adv) }]));
}
