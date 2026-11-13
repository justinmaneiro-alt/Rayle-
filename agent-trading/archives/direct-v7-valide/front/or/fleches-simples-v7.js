/* ═════════════ FLÈCHES SIMPLES v7 « Direct » (2026-11-13, affinage) : v6 « Direct (stable) » + 4 changements, module NOUVEAU ═════════════
   Dérivée de fleches-simples-v6 (scellée, intacte, gardée dans le sélecteur sous le nom « Direct (stable) »), donc de v5, v4, v1 (scellées). Niveaux, zones, confirmation, repos de 24 bougies, « zone cassée »,
   invalidation, MA200, garde-fou « chute > 5 ATR », 2ᵉ touche : tout est repris de la v6. Aucun repaint : chaque décision est prise à la clôture de la bougie concernée.
   CHANGEMENTS (tous réglables dans P, tous désactivables par options de rejouer / calculer) :
   1. RÉGIME PAR LA MA200 : un achat (resp. une vente) est CONTRE-TENDANCE dès que la dernière cassure MA200 confirmée est baissière (resp. haussière), tant qu'aucune cassure confirmée de sens opposé n'a eu lieu
      (remplace « MA200 en baisse sur 48 bougies + plus bas plus bas »). Exceptions conservées : base de 8 bougies, divergence RSI, 2ᵉ touche d'un niveau majeur.
   2. ANTI-ALLER-RETOUR : après une flèche colorée, aucune flèche colorée de sens opposé pendant 12 bougies H1, SAUF cassure MA200 confirmée, première flèche invalidée, ou 2ᵉ touche d'un niveau majeur.
   3. « REBOND APRÈS BASE » (nouveau type `rebond_base`) : après une chute ≥ 5 ATR en 48 bougies puis une base de ≥ 8 bougies H1 (range ≤ 1,5 ATR, aucun nouveau plus bas), la première clôture à plus de 1 ATR au-dessus du haut de la base (marge ajoutée après essai : sans elle, le bruit d'un week-end plat déclenche des flèches)
      donne une flèche ; miroir (hausse ≥ 5 ATR, base de sommet, clôture sous le bas). Une par tranche de 48 bougies et par sens. Stop 0,2 ATR de l'autre côté de la base, TP 1 R / 2 R.
      Cette règle a été CHOISIE EN REGARDANT UN EXEMPLE (le rebond du 2 novembre vers 3 870) : aucune preuve de performance.
   Les points gris (contacts et contre-tendance) sont toujours calculés ; l'interface les masque par défaut (case « Points gris » de Couches). Outil de lecture, jamais un ordre. */
import * as V1 from './fleches-simples.js';
import * as V6 from './fleches-simples-v6.js';
import { atrSerie, resultat } from './fleches-terminal-v1.js';
import { sma } from './fleches-lecture-v1.js';
import { rsiWilder } from './rsi-lecture-v1.js';
import { niveauxSignal, texteNiveaux } from './signal-niveaux.js';
export const VERSION = 'fleches-simples-v7', H = 3600e3, DEPART = V6.DEPART, PLAFOND = V6.PLAFOND, FENETRE = V6.FENETRE;
export const P = Object.freeze({ ...V6.P, antiBougies: 12, rebondChute: 5, rebondFenetre: 48, rebondBase: 8, rebondRange: 1.5, rebondRef: 16, rebondRepos: 48, rebondStopAtr: 0.2, rebondMarge: 1 });
export const TYPES = Object.freeze({ ...V6.TYPES, rebond_base: 'Rebond après base' });
export const { idNiveau, textesRes, deuxiemeTouche, evenementsNiveauxV6, base, divergenceSurZone, niveauxStructure, touchesVues, ETIQUETTE_DEUX, fusionnerRegistre } = V6;
const fr = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const heure = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const maxH = (B, a, b) => { let m = -Infinity; for (let k = Math.max(0, a); k <= b; k++) if (B[k].h > m) m = B[k].h; return m; };
const minL = (B, a, b) => { let m = Infinity; for (let k = Math.max(0, a); k <= b; k++) if (B[k].l < m) m = B[k].l; return m; };

/* régime : sens de la dernière cassure MA200 confirmée (1 haussier, -1 baissier, 0 inconnu) ; evMa = événements MA200 de la série tronquée à la bougie courante */
export const regimeMa = evMa => evMa.length ? evMa[evMa.length - 1].dir : 0;
export const contreRegime = (regime, dir) => regime !== 0 && (dir > 0 ? regime < 0 : regime > 0);

/* « rebond après base » à la clôture de la bougie i, sens dir (1 : base après une chute, achat ; -1 : base de sommet après une hausse, vente) : renvoie un événement ou null */
export function rebondApresBase(B, A, i, dir) {
  if (!(A[i] > 0) || i < P.rebondBase + P.rebondRef + 2) return null;
  let sa = 0, na = 0; for (let j = Math.max(0, i - P.rebondFenetre); j < i; j++) if (A[j] > 0) { sa += A[j]; na++; }
  const a = na ? sa / na : A[i];   // ATR de référence = moyenne des 48 dernières bougies (l'ATR du jour s'effondre sur un week-end plat et rendrait toute base impossible)
  const c = B[i].c, nMax = Math.min(i, P.rebondFenetre);
  let hi = -Infinity, lo = Infinity; const tailles = [];
  for (let L = 1; L <= nMax; L++) { const b = B[i - L]; hi = Math.max(hi, b.h); lo = Math.min(lo, b.l); if (hi - lo > P.rebondRange * a) break; if (L >= P.rebondBase) tailles.push({ L, hi, lo }); }
  for (let q = tailles.length - 1; q >= 0; q--) {
    const { L, hi: h, lo: l } = tailles[q], d = i - L; if (d - 2 < 0) continue;
    if (dir > 0) {
      if (!(c > h + P.rebondMarge * a)) continue;                                              // première clôture au-dessus du haut de la base
      const bas = minL(B, d - P.rebondRef, d - 1); if (l < bas) continue;   // aucun nouveau plus bas dans la base
      let k = d - 1, m = Infinity; for (let j = Math.max(0, d - P.rebondFenetre); j <= d - 1; j++) if (B[j].l < m) { m = B[j].l; k = j; }
      const haut = maxH(B, Math.max(0, d - P.rebondFenetre), k);
      if (!(haut - m >= P.rebondChute * a)) continue;
      return { type: 'rebond_base', dir: 1, i, prix: c, niveau: h, atr: A[i], levelId: `BASE|${Math.round(l)}`, zoneBas: l, zoneHaut: h, source: 'base', baseBougies: L, chuteAtr: Math.round((haut - m) / a * 10) / 10, nom: 'Rebond après base (clôture au-dessus du haut de la base)' };
    } else {
      if (!(c < l - P.rebondMarge * a)) continue;
      const haut = maxH(B, d - P.rebondRef, d - 1); if (h > haut) continue;
      let k = d - 1, M = -Infinity; for (let j = Math.max(0, d - P.rebondFenetre); j <= d - 1; j++) if (B[j].h > M) { M = B[j].h; k = j; }
      const bas = minL(B, Math.max(0, d - P.rebondFenetre), k);
      if (!(M - bas >= P.rebondChute * a)) continue;
      return { type: 'rebond_base', dir: -1, i, prix: c, niveau: l, atr: A[i], levelId: `BASE|${Math.round(h)}`, zoneBas: l, zoneHaut: h, source: 'base', baseBougies: L, chuteAtr: Math.round((M - bas) / a * 10) / 10, nom: 'Rebond après base de sommet (clôture sous le bas de la base)' };
    }
  }
  return null;
}

export function rejouer(B, zonesA, { depart = DEPART, deja = [], exception = true, exclure = null, regime = false, anti = true, rebond = true } = {}) {
  const acceptees = deja.slice(), vus = [], invalidees = [], supprimees = [], contactsMap = new Map(), histo = [], dernierRebond = { 1: -1e9, '-1': -1e9 }; let refus = 0;
  const A = atrSerie(B), M = sma(B), R = rsiWilder(B.map(b => b.c));
  for (let n = Math.max(depart, 40); n <= B.length; n++) {
    const S = B.slice(0, n), now = S[n - 1].t + H, a = A[n - 1], c = S[n - 1].c, i = n - 1;
    for (const g of acceptees) {
      if (g.type !== 'retournement' || g.contre || g.invalidee || !(g.i < i && i - g.i <= P.invalidBougies)) continue;
      if (g.dir > 0 ? c < g.zoneBas : c > g.zoneHaut) { g.invalidee = true; g.invalideeT = now; invalidees.push({ id: g.id, invalideeT: now }); }
    }
    const cand = zonesA(S, now).filter(z => z.actif !== false && z.tFin == null && (z.force || 0) >= P.touchesVues && z.haut - z.bas >= P.largeurAtr * a).map(z => ({ ...z, tv: touchesVues(S, z) }));
    const garder = z => !(exclure && exclure(z, a, now));
    const swing = cand.filter(z => garder(z) && z.tv >= P.touchesVues).map(z => ({ ...z, force: 99, retournee: false, niveauType: 'swing', touchesVues: z.tv }));
    const faibles = cand.filter(z => garder(z) && z.tv < P.touchesVues && (z.force || 0) >= P.faibleMin).map(z => ({ ...z, force: 99, retournee: false, niveauType: 'swing', touchesVues: z.tv }));
    const struct = niveauxStructure(S).map(q => ({ id: `nm|${q.nom}|${Math.round(q.p * 100)}`, cote: q.p > c ? 'resistance' : 'support', bas: q.p, haut: q.p, tDebut: q.tDebut, tFin: null, nom: q.nom, force: 99, retournee: false, niveauType: 'structure', niveauNom: q.nom, typeStructure: q.type })).filter(garder);
    const zones = [...swing, ...struct], majeures = V1.zonesMajeures(zones), info = new Map(zones.map(z => [V1.idNiveau(z), z]));
    const N = evenementsNiveauxV6(S, A, majeures), evMa = V1.evenementsMa(S, A, M);
    const ev = N.events.concat(evMa), reg = regimeMa(evMa);
    if (rebond) for (const d of [1, -1]) { if (i - dernierRebond[d] < P.rebondRepos) continue; const e = rebondApresBase(S, A, i, d); if (e) ev.push(e); }
    for (const k of N.contacts) if (k.i === i) { const z = info.get(k.levelId); contactsMap.set(`${k.levelId}|${k.i}`, { ...k, niveauNom: z ? z.niveauNom || z.nom || null : null, t: S[i].t, tCloture: S[i].t + H, id: `contact|${S[i].t}|${k.dir}|${k.levelId}` }); }
    for (const u of N.maj) if (u.i === i) { const e = contactsMap.get(`${u.levelId}|${u.att0}`); if (e) { e.raison = u.raison; delete e.attente; } }
    if (faibles.length) {
      const F2 = evenementsNiveauxV6(S, A, faibles), vus2 = new Set();
      for (const k of [...F2.events, ...F2.contacts].filter(k => k.i === i)) { if (vus2.has(k.levelId)) continue; vus2.add(k.levelId); const z = faibles.find(w => V1.idNiveau(w) === k.levelId);
        const kk = `${k.levelId}|${i}`; if (!contactsMap.has(kk)) contactsMap.set(kk, { i, levelId: k.levelId, zoneBas: k.zoneBas, zoneHaut: k.zoneHaut, dir: k.dir, source: k.source, raison: `bloqué : zone de swing pas encore assez touchée (${z.tv} touche vue, ${P.touchesVues} requises)`, niveauNom: z.nom || null, t: S[i].t, tCloture: S[i].t + H, id: `contact|${S[i].t}|${k.dir}|${k.levelId}` }); }
    }
    const rang = e => e.type === 'ma_cassure' ? 0 : e.type === 'rebond_base' ? 2 : 1;   // un « rebond après base » cède la place à une flèche de niveau sur la même bougie ou à proximité
    const pose = ev.filter(f => f.i === i).map(f => ({ ...f, t: S[f.i].t, tCloture: S[f.i].t + H })).sort((x, y) => rang(x) - rang(y));
    for (const f of pose) {
      const info1 = (raison) => { const z = info.get(f.levelId); contactsMap.set(`${f.levelId}|${f.i}|x`, { i: f.i, levelId: f.levelId, zoneBas: f.zoneBas, zoneHaut: f.zoneHaut, dir: f.dir, raison, source: f.source, niveauNom: z ? z.niveauNom || z.nom || null : null, t: f.t, tCloture: f.tCloture, id: `contact|${f.t}|${f.dir}|${f.levelId}|x` }); };
      let deux = null;
      if (f.type === 'retournement') {
        deux = exception ? deuxiemeTouche(S, A, histo, f) : null;
        histo.push({ i: f.i, c: f.prix, dir: f.dir, zoneBas: f.zoneBas, zoneHaut: f.zoneHaut });
        if (f.att0 != null) contactsMap.delete(`${f.levelId}|${f.att0}`);
      }
      const chute = f.type === 'retournement' && f.dir > 0 && n > P.chuteBougies && S[n - 1 - P.chuteBougies].c - S[n - 1].c > P.chuteAtr * a;
      if (chute && !deux) { info1('bloqué : garde-fou chute > 5 ATR en 24 bougies'); continue; }
      if (f.type !== 'ma_cassure' && acceptees.some(g => Math.abs(g.i - f.i) < P.distanceMin)) { info1(`bloqué : trop proche d'une autre flèche (moins de ${P.distanceMin} bougies)`); continue; }
      if (acceptees.filter(g => g.i > f.i - FENETRE).length >= PLAFOND) { refus++; info1('bloqué : plafond de sécurité atteint'); continue; }
      const g = { ...f, masquee: false, indexApparition: n - 1, indexDessin: f.i, version: VERSION, id: `${f.type}|${f.t}|${f.dir}|${f.levelId}` }; delete g.att0;
      if (f.type === 'retournement') {
        const z = info.get(f.levelId);
        if (z) { g.niveauType = z.niveauType; g.niveauStyle = 'trait plein'; g.niveauNom = z.niveauNom || z.nom || null; g.touchesVues = z.niveauType === 'swing' ? z.touchesVues : null; if (z.typeStructure) g.typeStructure = z.typeStructure; }
        g.contre = false; g.stabilisation = null;
        if (regime ? contreRegime(reg, f.dir) : V6.contreTendance(S, M, i, f.dir)) {
          if (deux) g.deuxiemeTouche = deux;
          else if (base(S, i, f.dir, a)) g.stabilisation = 'base';
          else if (divergenceSurZone(S, R, i, f.dir, g, a)) g.stabilisation = 'rsi';
          else { g.contre = true; g.raison = regime ? `bloqué : contre-tendance (dernière cassure MA200 ${reg < 0 ? 'baissière' : 'haussière'}, aucune cassure de sens opposé depuis)` : `bloqué : contre-tendance (MA200 ${f.dir > 0 ? 'baissière' : 'haussière'} à ${fr(M[i])}, ${f.dir > 0 ? 'plus bas plus bas' : 'plus haut plus haut'})`; }
        } else if (deux) g.deuxiemeTouche = deux;
        if (deux && !g.contre) g.garde = chute ? 'chute' : null;
      }
      // anti-aller-retour : une flèche colorée de sens opposé dans les 12 bougies (sauf cassure MA200, invalidée, 2ᵉ touche)
      if (anti && !g.contre && f.type !== 'ma_cassure' && !g.deuxiemeTouche) {
        const pre = acceptees.find(q => !q.contre && !q.invalidee && q.dir !== f.dir && f.i - q.i >= 0 && f.i - q.i < P.antiBougies);
        if (pre) { supprimees.push({ id: g.id, t: g.t, tCloture: g.tCloture, dir: g.dir, type: g.type, levelId: g.levelId, avecId: pre.id, avecT: pre.tCloture }); info1(`bloqué : anti-aller-retour (flèche ${pre.dir > 0 ? 'verte' : 'rouge'} de sens opposé il y a moins de ${P.antiBougies} bougies)`); continue; }
      }
      acceptees.push(g); vus.push(g); if (f.type === 'rebond_base') dernierRebond[f.dir] = i;
    }
  }
  const dernierT = B.length ? B[B.length - 1].t : 0;
  const contacts = [...contactsMap.values()].filter(k => !(k.attente && k.t !== dernierT)).map(k => { const o = { ...k }; delete o.attente; return o; });
  return { fleches: vus, toutes: acceptees, refus, invalidees, contacts, supprimees };
}
export function calculer(B, zonesA, { maintenant = Date.now(), depart = null, deja = [], bougies = 720, exception = true, exclure = null, regime = false, anti = true, rebond = true } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], contacts: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes`, refus: 0, invalidees: [], supprimees: [] };
  const d = depart == null ? Math.max(DEPART, closes.length - bougies) : Math.max(DEPART, depart);
  const r = rejouer(closes, zonesA, { depart: d, deja, exception, exclure, regime, anti, rebond });
  const pris = new Set(r.fleches.map(f => f.t));
  const rangC = k => /^en attente|garde-fou/.test(k.raison) ? 0 : /swing/.test(k.raison) ? 1 : /plafond|trop proche|rôle|anti-aller/.test(k.raison) ? 2 : /cassée/.test(k.raison) ? 3 : /traversée/.test(k.raison) ? 4 : /cooldown/.test(k.raison) ? 5 : 6;
  const ctc = []; for (const k of r.contacts.slice().sort((x, y) => x.t - y.t || rangC(x) - rangC(y))) if (!pris.has(k.t)) { pris.add(k.t); ctc.push(k); }
  return { fleches: r.fleches.map(f => ({ ...f, resultat: resultat(closes, f) })), contacts: ctc, n: closes.length, raison: null, vers: closes.length, refus: r.refus, invalidees: r.invalidees, supprimees: r.supprimees };
}
export const detail = f => {
  if (f.type === 'rebond_base') {
    const l = [`${f.dir > 0 ? 'Rebond après base' : 'Rebond après base de sommet'} : ${f.baseBougies} bougies H1 de base (range ≤ ${P.rebondRange} ATR, aucun nouvel extrême) après ${f.dir > 0 ? 'une chute' : 'une hausse'} de ${f.chuteAtr} ATR en ${P.rebondFenetre} bougies ; clôture ${f.dir > 0 ? 'au-dessus du haut' : 'sous le bas'} de la base (${fr(f.zoneBas)}–${fr(f.zoneHaut)})`];
    if (f.invalidee) l.unshift(`Invalidée à ${heure(f.invalideeT)}`);
    l.push(texteNiveaux(niveauxSignal(f)) + ' · indicatif, pas un ordre');
    return l;
  }
  const l = V6.detail(f).filter(x => !/^Point gris : rebond CONTRE/.test(x));
  if (f.contre && !l.some(x => /contre-tendance/.test(x))) l.unshift(f.raison || 'Point gris : contre-tendance');
  return l;
};
export const detailContact = V6.detailContact;
export const bilan = () => ({});
