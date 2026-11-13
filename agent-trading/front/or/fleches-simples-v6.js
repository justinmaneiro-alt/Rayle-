/* ═════════════ FLÈCHES SIMPLES v6 — « fleches-simples-v6 » (2026-11-13) : v5 + exception « 2ᵉ touche » + raison des points gris ═════════════
   Dérivée de fleches-simples-v5 (scellée, intacte) et de fleches-simples (v1, scellée, intacte) : mêmes niveaux, mêmes règles de flèche, MA200 inchangée, repos 24 bougies par niveau, « zone cassée » inchangée
   (clôture à > 0,3 ATR de l'autre côté ; une mèche sans clôture ne casse pas), invalidation inchangée, aucun repaint. Mode Direct seulement.
   AJOUTS (causaux : décidés à la clôture de la bougie concernée) :
   1. EXCEPTION « 2ᵉ TOUCHE ». Un retournement sur un niveau majeur (trait plein) est STABILISÉ, donc flèche colorée normale + notification, même contre-tendance et même si le garde-fou « chute > 5 ATR » s'applique, quand ce niveau
      a déjà eu une confirmation dans les 96 dernières bougies H1, que le prix en est reparti d'au moins 1 ATR (mesuré depuis la clôture de cette confirmation précédente), et qu'aucune clôture n'est passée à plus de 0,3 ATR de l'autre
      côté entre les deux touches (champ `deuxiemeTouche`, étiquette « 2ᵉ touche : double sommet/double creux »).
   2. RAISON AFFICHÉE. Chaque contact du prix avec un niveau majeur qui ne donne pas de flèche colorée produit un contact (petit point gris, infobulle = la raison exacte, aucune notification) : bloqué (contre-tendance, garde-fou,
      zone cassée, repos de 24 bougies, plafond, distance minimale…) ou en attente (bougie de confirmation pas encore close). Un contact « en attente » disparaît si la flèche arrive, sinon devient « pas de rebond confirmé ».
   Seuils (96 bougies, 1 ATR, 0,3 ATR) CHOISIS EN REGARDANT les exemples du vendredi 13 novembre (double sommet 4 131–4 144, support du bas) : aucune preuve de performance. Information de lecture, jamais un ordre. */
import * as V1 from './fleches-simples.js';
import * as V4 from './fleches-simples-v4.js';
import * as V5 from './fleches-simples-v5.js';
import { atrSerie, resultat } from './fleches-terminal-v1.js';
import { sma } from './fleches-lecture-v1.js';
import { rsiWilder } from './rsi-lecture-v1.js';
import { niveauxSignal, texteNiveaux } from './signal-niveaux.js';
export const VERSION = 'fleches-simples-v6', H = 3600e3, DEPART = V5.DEPART, PLAFOND = V5.PLAFOND, FENETRE = V5.FENETRE;
export const P = Object.freeze({ ...V5.P, deuxFenetre: 120, faibleMin: 8, deuxRebondAtr: 1, deuxCasseeAtr: V1.P.casseeAtr, deuxTolAtr: 0.5 });
export const TYPES = V1.TYPES, idNiveau = V1.idNiveau, textesRes = V1.textesRes, TYPES_STRUCTURE = V5.TYPES_STRUCTURE, niveauxStructure = V5.niveauxStructure, touchesVues = V5.touchesVues;
export const contreTendance = V5.contreTendance, base = V5.base, divergenceSurZone = V5.divergenceSurZone;
export const ETIQUETTE_DEUX = '2ᵉ touche : double sommet/double creux';
const fr = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const plageZ = (b, h) => Math.round(b) === Math.round(h) ? fr(h) : `${fr(b)}–${fr(h)}`;

/* Mêmes règles que V1.evenementsNiveaux (copie fidèle de la machine à états), avec en plus : les contacts qui ne donnent rien (avec leur raison) et la touche d'origine de chaque flèche. */
export function evenementsNiveauxV6(B, A, zones) {
  const events = [], contacts = [], maj = [];
  for (const z of zones) {
    const sens = z.cote === 'support' ? 1 : -1, bas = z.bas, haut = z.haut, levelId = V1.idNiveau(z), P1 = V1.P;
    let i0 = B.findIndex(b => b.t >= z.tDebut); if (i0 < 1) i0 = 1; if (z.retournee) i0 += 1;
    let i1 = B.length - 1; if (z.tFin != null) { const k = B.findIndex(b => b.t >= z.tFin); if (k >= 0) i1 = k; }
    let att = null, dernier = -1e9, arme = true, cassee = false, confirme = !z.retournee, toucheAvant = false;
    const nom = z.nom || z.id, contact = (i, raison, extra = {}) => contacts.push({ i, levelId, zoneBas: bas, zoneHaut: haut, dir: sens, raison, source: nom, ...extra });
    for (let i = i0; i <= i1; i++) {
      const a = A[i]; if (!(a > 0)) continue;
      const m = P1.toucheAtr * a, b = B[i], c = b.c, prec = B[i - 1].c;
      const touche = b.l <= haut + m && b.h >= bas - m, debutContact = touche && !toucheAvant; toucheAvant = touche;
      if (sens > 0 ? c < bas - P1.casseeAtr * a : c > haut + P1.casseeAtr * a) { cassee = true; if (att) { maj.push({ i, levelId, att0: att.i, raison: 'bloqué : zone cassée avant la confirmation' }); att = null; } }
      if (cassee) { if (debutContact) contact(i, 'bloqué : zone cassée'); continue; }
      const traverse = sens > 0 ? c < bas : c > haut, ressort = sens > 0 ? c > haut : c < bas;
      if (!arme && i - dernier >= P1.reposZone) arme = true;
      const poser = (i0t) => {
        if (!confirme) { confirme = true; att = null; dernier = i; arme = false; contact(i0t, 'bloqué : niveau au rôle récemment inversé (premier retournement de contrôle, sans flèche)'); return; }
        events.push({ type: 'retournement', dir: sens, i, prix: c, niveau: sens > 0 ? haut : bas, atr: a, levelId, zoneBas: bas, zoneHaut: haut, touches: z.force || 0, source: nom, att0: i0t,
          nom: (sens > 0 ? 'Retournement haussier sur support majeur' : 'Retournement baissier sur résistance majeure') });
        dernier = i; arme = false; att = null;
      };
      if (att) {
        if (traverse) { maj.push({ i, levelId, att0: att.i, raison: 'bloqué : pas de rebond confirmé (clôture au-delà du niveau)' }); att = null; }
        else if (i - att.i > P1.attenteMax) { maj.push({ i, levelId, att0: att.i, raison: 'bloqué : pas de rebond confirmé en 36 bougies' }); att = null; }
        else if (ressort) { poser(att.i); continue; }
        else if (debutContact) { /* retouche pendant l'attente : rien de plus à dire */ }
      }
      if (!att && arme && touche && !traverse && (sens > 0 ? prec >= bas : prec <= haut)) { att = { i }; if (ressort) poser(i); else contact(i, 'en attente : bougie de confirmation pas encore close', { attente: true }); }
      else if (debutContact && !att) {
        if (!arme) contact(i, 'bloqué : cooldown (repos de 24 bougies sur ce niveau)');
        else if (traverse) contact(i, 'bloqué : le prix a clôturé de l\'autre côté du niveau (traversée, pas un rebond)');
        else contact(i, 'bloqué : le prix arrive par l\'autre côté du niveau (retest, pas un rebond)');
      }
    }
  }
  return { events, contacts, maj };
}

/* exception « 2ᵉ touche » : renvoie { prevT, rebondAtr } ou null. Le « même niveau » = même sens et zone qui se recouvre (à 0,5 ATR près) : la valeur d'un niveau de structure bouge d'un dollar d'une période à l'autre. */
export function deuxiemeTouche(B, A, histo, f) {
  const a0 = A[f.i], tol = P.deuxTolAtr * (a0 > 0 ? a0 : 0);
  const L = histo.filter(p => p.dir === f.dir && p.i < f.i && f.i - p.i <= P.deuxFenetre && p.zoneBas <= f.zoneHaut + tol && p.zoneHaut >= f.zoneBas - tol); if (!L.length) return null;
  for (let q = L.length - 1; q >= 0; q--) {
    const p = L[q], a = A[p.i]; if (!(a > 0)) continue;
    const fin = Math.max(p.i + 1, (f.att0 != null ? f.att0 : f.i) - 1);
    let ext = f.dir > 0 ? -Infinity : Infinity;
    for (let k = p.i + 1; k <= fin; k++) ext = f.dir > 0 ? Math.max(ext, B[k].h) : Math.min(ext, B[k].l);
    const rebond = f.dir > 0 ? ext - p.c : p.c - ext;
    if (!(rebond >= P.deuxRebondAtr * a)) continue;
    let casse = false;
    for (let k = p.i + 1; k <= f.i && !casse; k++) { const ak = A[k]; casse = f.dir > 0 ? B[k].c < f.zoneBas - P.deuxCasseeAtr * ak : B[k].c > f.zoneHaut + P.deuxCasseeAtr * ak; }
    if (!casse) return { prevT: B[p.i].t, rebondAtr: Math.round(rebond / a * 10) / 10 };
  }
  return null;
}

export function rejouer(B, zonesA, { depart = DEPART, deja = [], exception = true, exclure = null } = {}) {
  const acceptees = deja.slice(), vus = [], invalidees = [], contactsMap = new Map(), histo = []; let refus = 0;
  const A = atrSerie(B), M = sma(B), R = rsiWilder(B.map(b => b.c));
  for (let n = Math.max(depart, 40); n <= B.length; n++) {
    const S = B.slice(0, n), now = S[n - 1].t + H, a = A[n - 1], c = S[n - 1].c, i = n - 1;
    for (const g of acceptees) {
      if (g.type !== 'retournement' || g.contre || g.invalidee || !(g.i < i && i - g.i <= P.invalidBougies)) continue;
      if (g.dir > 0 ? c < g.zoneBas : c > g.zoneHaut) { g.invalidee = true; g.invalideeT = now; invalidees.push({ id: g.id, invalideeT: now }); }
    }
    const cand = zonesA(S, now).filter(z => z.actif !== false && z.tFin == null && (z.force || 0) >= P.touchesVues && z.haut - z.bas >= P.largeurAtr * a).map(z => ({ ...z, tv: touchesVues(S, z) }));
    const garder = z => !(exclure && exclure(z, a, now));   // niveaux masqués par l'utilisateur : plus surveillés (les flèches déjà posées restent)
    const swing = cand.filter(z => garder(z) && z.tv >= P.touchesVues).map(z => ({ ...z, force: 99, retournee: false, niveauType: 'swing', touchesVues: z.tv }));
    const faibles = cand.filter(z => garder(z) && z.tv < P.touchesVues && (z.force || 0) >= P.faibleMin)   // zone « majeure » d'après son compte de touches (≥ 8) mais pas encore assez vue : le contact est expliqué, jamais de flèche.map(z => ({ ...z, force: 99, retournee: false, niveauType: 'swing', touchesVues: z.tv }));
    const struct = niveauxStructure(S).map(q => ({ id: `nm|${q.nom}|${Math.round(q.p * 100)}`, cote: q.p > c ? 'resistance' : 'support', bas: q.p, haut: q.p, tDebut: q.tDebut, tFin: null, nom: q.nom, force: 99, retournee: false, niveauType: 'structure', niveauNom: q.nom, typeStructure: q.type })).filter(garder);
    const zones = [...swing, ...struct], majeures = V1.zonesMajeures(zones), info = new Map(zones.map(z => [V1.idNiveau(z), z]));
    const N = evenementsNiveauxV6(S, A, majeures), ev = N.events.concat(V1.evenementsMa(S, A, M));
    // contacts (raisons) : décidés à la clôture de CETTE bougie seulement
    for (const k of N.contacts) if (k.i === i) { const z = info.get(k.levelId); contactsMap.set(`${k.levelId}|${k.i}`, { ...k, niveauNom: z ? z.niveauNom || z.nom || null : null, t: S[i].t, tCloture: S[i].t + H, id: `contact|${S[i].t}|${k.dir}|${k.levelId}` }); }
    for (const u of N.maj) if (u.i === i) { const e = contactsMap.get(`${u.levelId}|${u.att0}`); if (e) { e.raison = u.raison; delete e.attente; } }
    if (faibles.length) {   // zones de swing pas encore assez touchées : jamais de flèche, mais le contact est expliqué
      const F2 = evenementsNiveauxV6(S, A, faibles), vus2 = new Set();
      for (const k of [...F2.events, ...F2.contacts].filter(k => k.i === i)) { if (vus2.has(k.levelId)) continue; vus2.add(k.levelId); const z = faibles.find(w => V1.idNiveau(w) === k.levelId);
        const kk = `${k.levelId}|${i}`; if (!contactsMap.has(kk)) contactsMap.set(kk, { i, levelId: k.levelId, zoneBas: k.zoneBas, zoneHaut: k.zoneHaut, dir: k.dir, source: k.source, raison: `bloqué : zone de swing pas encore assez touchée (${z.tv} touche vue, ${P.touchesVues} requises)`, niveauNom: z.nom || null, t: S[i].t, tCloture: S[i].t + H, id: `contact|${S[i].t}|${k.dir}|${k.levelId}` }); }
    }
    const pose = ev.filter(f => f.i === i).map(f => ({ ...f, t: S[f.i].t, tCloture: S[f.i].t + H })).sort((x, y) => (x.type === 'ma_cassure' ? 0 : 1) - (y.type === 'ma_cassure' ? 0 : 1));
    for (const f of pose) {
      const info1 = (raison) => { const z = info.get(f.levelId); contactsMap.set(`${f.levelId}|${f.i}|x`, { i: f.i, levelId: f.levelId, zoneBas: f.zoneBas, zoneHaut: f.zoneHaut, dir: f.dir, raison, source: f.source, niveauNom: z ? z.niveauNom || z.nom || null : null, t: f.t, tCloture: f.tCloture, id: `contact|${f.t}|${f.dir}|${f.levelId}|x` }); };
      let deux = null;
      if (f.type === 'retournement') {
        deux = exception ? deuxiemeTouche(S, A, histo, f) : null;
        histo.push({ i: f.i, c: f.prix, dir: f.dir, zoneBas: f.zoneBas, zoneHaut: f.zoneHaut });
        if (f.att0 != null) contactsMap.delete(`${f.levelId}|${f.att0}`);               // la flèche remplace le point « en attente »
      }
      if (f.type === 'retournement' && f.dir > 0 && n > P.chuteBougies && S[n - 1 - P.chuteBougies].c - S[n - 1].c > P.chuteAtr * a && !deux) { info1('bloqué : garde-fou chute > 5 ATR en 24 bougies'); continue; }
      if (f.type !== 'ma_cassure' && acceptees.some(g => Math.abs(g.i - f.i) < P.distanceMin)) { info1(`bloqué : trop proche d'une autre flèche (moins de ${P.distanceMin} bougies)`); continue; }
      if (acceptees.filter(g => g.i > f.i - FENETRE).length >= PLAFOND) { refus++; info1('bloqué : plafond de sécurité atteint'); continue; }
      const g = { ...f, masquee: false, indexApparition: n - 1, indexDessin: f.i, version: VERSION, id: `${f.type}|${f.t}|${f.dir}|${f.levelId}` }; delete g.att0;
      if (f.type === 'retournement') {
        const z = info.get(f.levelId);
        if (z) { g.niveauType = z.niveauType; g.niveauStyle = 'trait plein'; g.niveauNom = z.niveauNom || z.nom || null; g.touchesVues = z.niveauType === 'swing' ? z.touchesVues : null; if (z.typeStructure) g.typeStructure = z.typeStructure; }
        g.contre = false; g.stabilisation = null;
        if (contreTendance(S, M, i, f.dir)) {
          if (deux) { g.deuxiemeTouche = deux; }
          else if (base(S, i, f.dir, a)) g.stabilisation = 'base';
          else if (divergenceSurZone(S, R, i, f.dir, g, a)) g.stabilisation = 'rsi';
          else { g.contre = true; g.raison = `bloqué : contre-tendance (MA200 ${f.dir > 0 ? 'baissière' : 'haussière'} à ${fr(M[i])}, ${f.dir > 0 ? 'plus bas plus bas' : 'plus haut plus haut'})`; }
        } else if (deux) g.deuxiemeTouche = deux;
        if (deux && !g.contre) g.garde = (f.dir > 0 && n > P.chuteBougies && S[n - 1 - P.chuteBougies].c - S[n - 1].c > P.chuteAtr * a) ? 'chute' : null;
      }
      acceptees.push(g); vus.push(g);
    }
  }
  const dernierT = B.length ? B[B.length - 1].t : 0;
  const contacts = [...contactsMap.values()].filter(k => !(k.attente && k.t !== dernierT)).map(k => { const o = { ...k }; delete o.attente; return o; });
  return { fleches: vus, toutes: acceptees, refus, invalidees, contacts };
}
export function calculer(B, zonesA, { maintenant = Date.now(), depart = null, deja = [], bougies = 720, exception = true, exclure = null } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], contacts: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes`, refus: 0, invalidees: [] };
  const d = depart == null ? Math.max(DEPART, closes.length - bougies) : Math.max(DEPART, depart);
  const r = rejouer(closes, zonesA, { depart: d, deja, exception, exclure });
  const pris = new Set(r.fleches.map(f => f.t));   // un seul marqueur par bougie : la flèche (même grise) prime sur le contact, puis un seul contact par bougie
  const rang = k => /^en attente|garde-fou/.test(k.raison) ? 0 : /swing/.test(k.raison) ? 1 : /plafond|trop proche|rôle/.test(k.raison) ? 2 : /cassée/.test(k.raison) ? 3 : /traversée/.test(k.raison) ? 4 : /cooldown/.test(k.raison) ? 5 : 6;
  const ctc = []; for (const k of r.contacts.slice().sort((x, y) => x.t - y.t || rang(x) - rang(y))) if (!pris.has(k.t)) { pris.add(k.t); ctc.push(k); }
  return { fleches: r.fleches.map(f => ({ ...f, resultat: resultat(closes, f) })), contacts: ctc, n: closes.length, raison: null, vers: closes.length, refus: r.refus, invalidees: r.invalidees };
}
export const fusionnerRegistre = V5.fusionnerRegistre;
const heure = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const detail = f => {
  const l = V5.detail(f);
  if (f.contre && f.raison) l.unshift(f.raison);
  if (!f.contre && !f.invalidee) l.push(texteNiveaux(niveauxSignal(f)) + ' · indicatif, pas un ordre');
  if (f.deuxiemeTouche) l.unshift(`${ETIQUETTE_DEUX} : le niveau avait déjà fait repartir le prix d'au moins ${P.deuxRebondAtr} ATR (${f.deuxiemeTouche.rebondAtr} ATR, confirmation précédente ${heure(f.deuxiemeTouche.prevT)}) sans être cassé${f.garde === 'chute' ? ' ; garde-fou « chute > 5 ATR » levé' : ''}`);
  return l;
};
export const detailContact = k => [k.raison, `${k.dir > 0 ? 'Support' : 'Résistance'} ${k.niveauNom ? k.niveauNom + ' ' : ''}${plageZ(k.zoneBas, k.zoneHaut)} · bougie close à ${heure(k.tCloture)}`, 'Aucune flèche, aucune notification : repère de lecture, pas un ordre'];
export const bilan = () => ({});
