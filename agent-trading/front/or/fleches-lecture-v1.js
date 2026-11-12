/* ═════════════ FLÈCHES DE LECTURE — règle « fleches-lecture-v1 » (2026-11-12) ═════════════
   Pur, sans DOM, sans réseau. Les flèches marquent des ÉVÉNEMENTS de lecture, pas des trades rentables : elles montrent qu'un signal potentiel se présente
   (cassure de la MA200, rebond sur un vrai support), même si le trade peut échouer ensuite. Jamais un ordre, jamais une promesse.
   Bougies H1 CLOSES { t (ouverture), o, h, l, c, v } ; une flèche n'est décidée qu'à la CLÔTURE d'une bougie, avec les seules bougies connues, et ne bouge plus (pas de repaint).
   Seulement trois familles (le reste est supprimé : VWAP, POC, veille, semaine, niveaux ronds, « proposé H4 », niveaux mineurs, zones tracées) :
   A. MA200 (SMA 200 des clôtures H1), distances en ATR 14 H1 :
      • cassure CONFIRMÉE : clôture de l'autre côté de la MA à ≥ 0,3 ATR ; si une clôture revient du côté d'origine dans les 6 bougies suivantes, c'est une fausse cassure :
        AUCUNE flèche (jamais de flèche posée puis retirée) ; sinon la flèche est posée à la clôture de la 6e bougie, « cassure confirmée » ;
      • retest : après une cassure confirmée (au plus 40 bougies après), mèche à ≤ 0,25 ATR de la MA et clôture à ≥ 0,3 ATR du côté de la cassure ;
      • rebond : hors période de cassure, extrême à ≤ 0,25 ATR de la MA (côté d'origine) puis clôture à ≥ 0,5 ATR de la MA, du même côté, dans les 3 bougies suivantes ;
      • une flèche par événement ; 24 bougies de repos après toute flèche MA200.
   B. Gros supports et résistances = niveaux-majeurs-v1 (3 + 3, fusionnés en zones de 0,5 ATR journalier), jamais autre chose :
      • contact : mèche dans la zone élargie de 0,25 ATR, bougie précédente close en dehors du côté d'arrivée, la bougie ne traverse pas la zone en clôture. SANS flèche (inscrit dans l'infobulle) ;
      • signal PRÉCOCE : après le contact, 2 bougies consécutives dans le sens du rebond, chacune close hors de la zone : flèche « 2 bougies sur support / résistance » ;
      • rebond CONFIRMÉ : une clôture à ≥ 0,5 ATR du bord de la zone, du côté d'arrivée, dans les 6 bougies après le contact : flèche « rebond confirmé » (si le signal précoce a déjà été posé, il n'y a PAS
        de seconde flèche : l'infobulle de la flèche précoce indique alors « confirmé le … ») ;
      • une seule flèche par touche, 24 bougies de repos par niveau ; une clôture à travers la zone annule l'attente.
   C. Grappes et plafond : une flèche décidée à moins de 12 bougies d'une flèche déjà affichée est MASQUÉE (gardée au registre, jamais affichée). Comme rien ne peut être retiré après coup, c'est la
      première posée qui reste (la « plus forte » n'est comparée qu'entre flèches décidées à la même bougie : MA200 > confirmé > précoce). Garde-fou d'affichage : jamais plus de 12 flèches affichées sur 600 bougies H1, dont 8 au plus sur les niveaux (le surplus est masqué, gardé au registre).
   D. Résultat mesuré après chaque flèche, à titre INFORMATIF (jamais utilisé pour décider) : mouvement favorable / défavorable maximal en ATR sur 6, 12 et 24 bougies.
   Ceci décrit le marché : ce n'est ni un signal d'entrée ni un ordre. */
import * as NM from './niveaux-majeurs-v1.js';
import { atrSerie, resultat, textesResultat } from './fleches-terminal-v1.js';

export const VERSION = 'fleches-lecture-v1', ECRITES_LE = '2026-11-12';
export const H = 3600e3;
export const P = Object.freeze({
  maPeriode: 200, cassureAtr: 0.3, confirmation: 6, retestAtr: 0.25, retestFenetre: 40, reboAtr: 0.25, reboReaction: 0.5, reboFenetre: 3, reposMa: 24,
  toucheAtr: 0.25, precoceBougies: 2, reactionAtr: 0.5, reactionFenetre: 6, reposNiveau: 24, grappe: 12, plafondFenetre: 600, plafond: 12, plafondNiveaux: 8, horizons: [6, 12, 24]
});
export const TYPES = Object.freeze({
  ma_cassure: 'Cassure confirmée de la MA200', ma_retest: 'Retest de la MA200 (il tient)', ma_rebond: 'Rebond sur la MA200',
  niv_precoce: 'Signal précoce : 2 bougies sur un gros niveau', niv_confirme: 'Rebond confirmé sur un gros niveau'
});
const FORCE = Object.freeze({ ma_cassure: 3, ma_retest: 3, ma_rebond: 3, niv_confirme: 2, niv_precoce: 1 });
const arrondi = x => Math.round(x * 100) / 100;
const fr = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/* SMA 200 des clôtures (null avant 200 bougies) */
export function sma(B, n = P.maPeriode) { const o = new Array(B.length).fill(null); let s = 0; for (let i = 0; i < B.length; i++) { s += B[i].c; if (i >= n) s -= B[i - n].c; if (i >= n - 1) o[i] = s / n; } return o; }

/* ── niveaux GROS : parmi les 3 + 3 niveaux majeurs, seulement les zones de poids ≥ 2,5 (au moins le haut / bas de la semaine ou du mois, ou une confluence) déjà touchées au moins 2 fois
      dans les 120 derniers jours. Identifiant stable : cellule de prix (≈ 0,4 % du prix, puissance de 10) pour qu'un niveau qui glisse un peu ne soit pas pris pour un autre. ── */
export const GROS = Object.freeze({ poidsMin: 3, touchesMin: 3, parCote: 1 });
export function zonesGrosses(ctx) {
  const cache = new Map();
  return i => {
    if (cache.has(i)) return cache.get(i);
    let r = []; try {
      const m = NM.niveauxMajeurs(ctx, i), lim = m.atrj ? 0.05 * m.atrj : 0;
      r = [...(m.haut || []).slice(0, GROS.parCote), ...(m.bas || []).slice(0, GROS.parCote)].filter(z => z.poids >= GROS.poidsMin && z.touches >= GROS.touchesMin).map(z => { const w = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, z.centre * 0.004)))); return { id: 'nm' + Math.round(z.centre / w) + 'w' + w, bas: (z.bas ?? z.centre) - lim, haut: (z.haut ?? z.centre) + lim, nom: NM.etiquette(z), type: 'niveau_rebond' }; });
    } catch (e) { r = []; }
    cache.set(i, r); return r;
  };
}

/* ── A. MA200 : retourne les événements candidats (décidés à la clôture de la bougie i) ── */
export function evenementsMa(B, A, M = sma(B)) {
  const out = []; let cote = 0, cassure = null, repos = -1, derniereConf = null;
  for (let i = 1; i < B.length; i++) {
    const m = M[i], a = A[i]; if (m == null || !(a > 0)) continue;
    const c = B[i].c, d = c - m;
    // 1. cassure en attente : annulée (fausse cassure, aucune flèche) ou confirmée au bout de 6 bougies
    if (cassure) {
      const dedans = cassure.dir > 0 ? c < m : c > m;   // retour du côté d'origine
      if (dedans) { cote = -cassure.dir; cassure = null; }
      else if (i - cassure.i >= P.confirmation) {
        if (i > repos + P.reposMa) { out.push({ type: 'ma_cassure', dir: cassure.dir, i, prix: c, niveau: m, atr: a, nom: (cassure.dir > 0 ? 'Cassure haussière' : 'Cassure baissière') + ' confirmée de la MA200 (6 clôtures du même côté)', source: 'MA200', cassureI: cassure.i }); repos = i; }
        derniereConf = { i, dir: cassure.dir }; cote = cassure.dir; cassure = null;
      }
      continue;
    }
    // 2. nouvelle cassure : clôture de l'autre côté à ≥ 0,3 ATR (côté courant connu)
    if (cote !== 0 && Math.sign(d) === -cote && Math.abs(d) >= P.cassureAtr * a) { cassure = { i, dir: Math.sign(d) }; continue; }
    if (cote === 0 && Math.abs(d) >= P.cassureAtr * a) cote = Math.sign(d);   // côté initial (aucune flèche : pas d'événement)
    if (i <= repos + P.reposMa) continue;
    // 3. retest d'une cassure confirmée récente
    if (derniereConf && i - derniereConf.i <= P.retestFenetre && i > derniereConf.i) {
      const dir = derniereConf.dir, touche = dir > 0 ? B[i].l <= m + P.retestAtr * a : B[i].h >= m - P.retestAtr * a, tient = dir > 0 ? d >= P.cassureAtr * a : -d >= P.cassureAtr * a;
      if (touche && tient) { out.push({ type: 'ma_retest', dir, i, prix: c, niveau: m, atr: a, nom: (dir > 0 ? 'Retest haussier' : 'Retest baissier') + ' de la MA200 : le prix y revient et tient', source: 'MA200' }); repos = i; derniereConf = null; continue; }
    } else if (derniereConf && i - derniereConf.i > P.retestFenetre) derniereConf = null;
    // 4. rebond (hors période de cassure / retest) : extrême proche de la MA puis clôture éloignée d'au moins 0,5 ATR
    if (!derniereConf && cote !== 0) {
      for (let k = Math.max(1, i - P.reboFenetre); k <= i; k++) {
        const ak = A[k], mk = M[k]; if (!(ak > 0) || mk == null) continue;
        const proche = cote > 0 ? B[k].l <= mk + P.reboAtr * ak && B[k].l >= mk - P.reboAtr * ak && B[k].c >= mk : B[k].h >= mk - P.reboAtr * ak && B[k].h <= mk + P.reboAtr * ak && B[k].c <= mk;
        const loin = cote > 0 ? c - m >= P.reboReaction * a : m - c >= P.reboReaction * a;
        if (proche && loin && k < i + 1) { out.push({ type: 'ma_rebond', dir: cote, i, prix: c, niveau: m, atr: a, nom: (cote > 0 ? 'Rebond haussier' : 'Rebond baissier') + ' sur la MA200', source: 'MA200' }); repos = i; break; }
      }
    }
  }
  return out;
}

/* ── B. gros niveaux : contact (sans flèche), signal précoce, rebond confirmé ── */
export function evenementsNiveaux(B, A, zonesDe, { debut = 0 } = {}) {
  const out = [], contacts = [], etat = new Map();
  for (let i = Math.max(2, debut); i < B.length; i++) {
    const a = A[i]; if (!(a > 0)) continue;
    const zs = zonesDe(i); if (!zs.length) continue;
    for (const z of zs) {
      let s = etat.get(z.id); if (!s) { s = { repos: -1e9, att: null }; etat.set(z.id, s); }
      const marge = P.toucheAtr * a, bas = z.bas, haut = z.haut, c = B[i].c;
      if (s.att) {
        const w = s.att, sens = w.cote, traverse = sens > 0 ? c < bas : c > haut;
        if (traverse) { s.att = null; }
        else {
          const reac = sens > 0 ? c - haut >= P.reactionAtr * a : bas - c >= P.reactionAtr * a;
          const dansLeSens = sens > 0 ? (c > B[i - 1].c && c > haut) : (c < B[i - 1].c && c < bas);
          w.suite = dansLeSens && (i === w.i + 1 || w.suite) ? (w.suite || 0) + 1 : 0;
          if (!w.posee && i - w.iTouche <= P.reactionFenetre) {
            const nomZone = z.nom, support = sens > 0;
            if (reac) { out.push({ type: 'niv_confirme', dir: sens, i, prix: c, niveau: sens > 0 ? haut : bas, atr: a, nom: `Rebond confirmé sur ${support ? 'support' : 'résistance'} · ${nomZone}`, zone: z.id, source: nomZone, touche: w.iTouche }); s.repos = i; w.posee = 'confirme'; s.att = null; continue; }
            if (w.suite >= P.precoceBougies && i >= w.iTouche + P.precoceBougies) { out.push({ type: 'niv_precoce', dir: sens, i, prix: c, niveau: sens > 0 ? haut : bas, atr: a, nom: `2 bougies sur ${support ? 'support' : 'résistance'} · ${nomZone} (signal précoce)`, zone: z.id, source: nomZone, touche: w.iTouche, zoneBas: bas, zoneHaut: haut }); s.repos = i; w.posee = 'precoce'; w.iPrecoce = out.length - 1; }
          } else if (w.posee === 'precoce' && !w.confirmeI && i - w.iTouche <= P.reactionFenetre && reac) { out[w.iPrecoce].confirmeI = i; out[w.iPrecoce].confirmeT = B[i].t + H; }
          if (i - w.iTouche >= P.reactionFenetre) s.att = null;
        }
      }
      if (s.att || i <= s.repos + P.reposNiveau) continue;
      const touche = B[i].l <= haut + marge && B[i].h >= bas - marge; if (!touche) continue;
      const prec = B[i - 1].c, cote = prec > haut ? 1 : prec < bas ? -1 : 0; if (!cote) continue;
      if (!(cote > 0 ? c >= bas : c <= haut)) continue;   // la bougie de contact ne traverse pas la zone en clôture
      s.att = { cote, iTouche: i, i, suite: 0 };
      contacts.push({ i, t: B[i].t, tCloture: B[i].t + H, dir: cote, zone: z.id, niveau: cote > 0 ? haut : bas, nom: `Contact avec ${z.nom}` });
      // réaction dès la bougie de contact
      const reac0 = cote > 0 ? c - haut >= P.reactionAtr * a : bas - c >= P.reactionAtr * a;
      if (reac0) { out.push({ type: 'niv_confirme', dir: cote, i, prix: c, niveau: cote > 0 ? haut : bas, atr: a, nom: `Rebond confirmé sur ${cote > 0 ? 'support' : 'résistance'} · ${z.nom}`, zone: z.id, source: z.nom, touche: i }); s.repos = i; s.att = null; }
    }
  }
  return { fleches: out, contacts };
}

/* ── C. grappes et plafond : une flèche à moins de 12 bougies d'une flèche affichée est masquée ; en plus, jamais plus de 12 flèches affichées sur 600 bougies (dont 8 au plus sur les niveaux) ── */
export function demasquer(F) {
  const tri = F.slice().sort((x, y) => x.i - y.i || FORCE[y.type] - FORCE[x.type]), vues = [];
  for (const f of tri) {
    const affichees = vues.filter(v => !v.masquee), proche = affichees.some(v => f.i - v.i < P.grappe && f.i >= v.i);
    const dans600 = affichees.filter(v => f.i - v.i < P.plafondFenetre), niveau = f.type.startsWith('niv_');
    f.masquee = proche || dans600.length >= P.plafond || (niveau && dans600.filter(v => v.type.startsWith('niv_')).length >= P.plafondNiveaux);
    f.raisonMasque = f.masquee ? (proche ? 'grappe' : 'plafond') : null; vues.push(f);
  }
  return tri;
}

/* ── tout en un ── */
export function calculer(B, { maintenant = Date.now(), jours = null, avecNiveaux = true } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 230) return { fleches: [], toutes: [], contacts: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes (il en faut 230 pour la MA200)` };
  const A = atrSerie(closes), M = sma(closes), fin = closes[closes.length - 1].t, depuisT = jours == null ? -Infinity : fin - jours * 86400e3;
  let tous = evenementsMa(closes, A, M), contacts = [];
  if (avecNiveaux) { try { const ctx = NM.preparer(closes), r = evenementsNiveaux(closes, A, zonesGrosses(ctx), { debut: Math.max(2, closes.findIndex(b => b.t >= depuisT)) }); tous = tous.concat(r.fleches); contacts = r.contacts; } catch (e) { /* niveaux indisponibles */ } }
  tous = demasquer(tous).map(f => ({ ...f, id: `${f.type}|${closes[f.i].t}|${f.dir}${f.zone ? '|' + f.zone : ''}`, t: closes[f.i].t, tCloture: closes[f.i].t + H, version: VERSION })).filter(f => f.tCloture > depuisT);
  const avecRes = tous.map(f => ({ ...f, resultat: resultat(closes, f) }));
  return { fleches: avecRes.filter(f => !f.masquee), toutes: avecRes, contacts: contacts.filter(c => c.tCloture > depuisT), n: closes.length, raison: null };
}

/* Fusion dans un registre en ajout seul : une flèche posée n'est jamais déplacée ni retirée ; seuls le résultat et la confirmation tardive s'enrichissent. */
export function fusionnerRegistre(reg, nouvelles) {
  const par = new Map(reg.map(f => [f.id, f])), sortie = reg.slice();
  for (const f of nouvelles) { const e = par.get(f.id); if (!e) { sortie.push(f); par.set(f.id, f); } else { e.resultat = f.resultat; if (f.confirmeT && !e.confirmeT) { e.confirmeT = f.confirmeT; e.confirmeI = f.confirmeI; } } }
  return sortie.sort((x, y) => x.tCloture - y.tCloture);
}

export const textesRes = textesResultat;
export const detail = f => {
  const l = [TYPES[f.type] || f.type];
  if (f.type === 'niv_precoce') l.push(f.confirmeT ? 'Signal précoce, ensuite CONFIRMÉ (réaction ≥ 0,5 ATR)' : 'Signal précoce : pas (encore) confirmé');
  if (f.type === 'niv_confirme') l.push('Signal confirmé (réaction ≥ 0,5 ATR dans les 6 bougies)');
  if (f.type === 'ma_cassure') l.push('Posée avec 6 bougies de retard : c\'est le prix de l\'absence de fausse cassure');
  return l;
};

/* Bilan INFORMATIF par type : mouvement favorable médian à 6/12/24 bougies, comparé à des entrées aléatoires (mêmes horizons, même sens). « pas assez de données » sous 30. */
export function bilan(B, F, { graine = 7, tirages = 1000 } = {}) {
  let s = graine >>> 0; const alea = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const A = atrSerie(B), M = sma(B), debutOk = P.maPeriode + 30, n = B.length, sortie = {};
  const mediane = v => { const t = v.slice().sort((x, y) => x - y); return t.length ? t[t.length >> 1] : null; };
  const fav = (i, dir, h) => { const ref = B[i].c, a = A[i]; if (!(a > 0) || i + h > n - 1) return null; let m = 0; for (let k = i + 1; k <= i + h; k++) m = Math.max(m, dir > 0 ? (B[k].h - ref) / a : (ref - B[k].l) / a); return m; };
  for (const type of Object.keys(TYPES)) {
    const L = F.filter(f => f.type === type), o = { n: L.length, horizons: {} };
    for (const h of P.horizons) {
      const v = L.map(f => fav(f.i, f.dir, h)).filter(x => x != null);
      if (v.length < 30) { o.horizons[h] = { n: v.length, texte: 'pas assez de données' }; continue; }
      const med = mediane(v), alea_ = []; for (let t = 0; t < tirages; t++) { const w = []; for (const f of L) { const i = debutOk + Math.floor(alea() * (n - debutOk - h - 1)); const x = fav(i, f.dir, h); if (x != null) w.push(x); } alea_.push(mediane(w)); }
      const sup = alea_.filter(x => x >= med).length / tirages;
      o.horizons[h] = { n: v.length, medianeAtr: arrondi(med), hasardAtr: arrondi(mediane(alea_)), partHasardAuDessus: arrondi(sup) };
    }
    sortie[type] = o;
  }
  return sortie;
}
