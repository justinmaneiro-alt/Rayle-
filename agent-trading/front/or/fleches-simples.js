/* ═════════════ FLÈCHES SIMPLES — règle « fleches-simples-v1 » (2026-11-12) ═════════════
   Remplace TOUT l'affichage des flèches (les modules v1, v2, v2.1 et v2.2 restent dans le dépôt, non affichés : option « Anciennes flèches (debug) »). Pur, sans DOM, sans réseau.
   Seuils CHOISIS EN REGARDANT des exemples (cassures de la MA200 du 10 nov., chute du 12 nov., zones 3 870 et 4 131–4 156) : aucune preuve de performance.
   Deux sortes de flèches seulement, décidées à la clôture d'une bougie H1, jamais redessinées :
   A. MA200 (SMA 200 des clôtures H1) — cassure FINALE : confirmée quand le prix a clôturé de l'autre côté à ≥ 1 ATR(H1), OU a clôturé 12 bougies H1 consécutives de l'autre côté.
      Flèche cyan posée sur la bougie de confirmation. Jamais de retest, de fausse cassure ni d'étiquette. Aucune autre flèche MA200 dans les 24 bougies qui suivent (une confirmation
      opposée plus précoce attend la fin de ces 24 bougies : elle est posée à ce moment-là seulement si l'état de confirmation tient toujours). C'est ce qui supprime les grappes du range.
   B. Retournement sur un support ou une résistance MAJEUR : zone H1 DESSINÉE par le graphique (levelId) comptant au moins 8 touches, ou l'une des 4 zones les plus touchées du graphique.
      Une flèche = le prix touche la zone (mèche dans la zone ± 0,15 ATR, venant du bon côté) puis clôture de nouveau hors de la zone dans le sens du rebond. Une flèche par touche, repos strict de
      24 bougies par zone. Zone cassée (clôture à > 0,3 ATR de l'autre côté) : plus aucune flèche de rebond sur elle ; une zone dont le rôle vient de changer (support devenu résistance et
      inversement) doit d'abord réussir un PREMIER retournement confirmé de l'autre côté (sans flèche) avant d'en porter. Dans une chute où les supports cèdent un à un : aucune flèche d'achat.
   Au moins 6 bougies entre deux flèches quelconques (aucune superposition). Rien n'est écrit sur le graphique : les détails vont dans l'infobulle. Flèches vertes (achat), rouges (vente), cyan (MA200). */
import { atrSerie, resultat, textesResultat } from './fleches-terminal-v1.js';
import { sma } from './fleches-lecture-v1.js';

export const VERSION = 'fleches-simples-v1', ECRITES_LE = '2026-11-12';
export const H = 3600e3;
export const P = Object.freeze({ maPeriode: 200, maAtr: 1.4, maBougies: 24, maRepos: 48, majeurTouches: 12, majeurTop: 4, toucheAtr: 0.15, casseeAtr: 0.3, reposZone: 24, attenteMax: 36, distanceMin: 6, horizons: [6, 12, 24] });
export const TYPES = Object.freeze({ ma_cassure: 'Cassure de la MA200', retournement: 'Retournement sur niveau majeur' });
export const idNiveau = z => `${z.id}@${z.tDebut}`;
const fr = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/* zones majeures parmi les zones dessinées : touches (force) ≥ 8, ou parmi les 4 niveaux (identifiants distincts) les plus touchés */
export function zonesMajeures(zones) {
  const par = new Map(); for (const z of zones) par.set(z.id, Math.max(par.get(z.id) || 0, z.force || 0));
  const top = new Set([...par.entries()].sort((a, b) => b[1] - a[1]).slice(0, P.majeurTop).map(e => e[0]));
  return zones.filter(z => (z.force || 0) >= P.majeurTouches || top.has(z.id));
}

/* ── A. cassure finale de la MA200 ── */
export function evenementsMa(B, A, M = sma(B)) {
  const out = []; let cote = 0, run = 0, runCote = 0, dernier = -1e9;
  for (let i = 0; i < B.length; i++) {
    const m = M[i], a = A[i]; if (m == null || !(a > 0)) continue;
    const d = B[i].c - m, s = Math.sign(d);
    if (s !== 0 && s === runCote) run++; else { runCote = s; run = s === 0 ? 0 : 1; }
    if (cote === 0) { if (Math.abs(d) >= P.maAtr * a || run >= P.maBougies) cote = s; continue; }   // état initial : aucune flèche
    if (s === 0 || s === cote) continue;
    if (i - dernier < P.maRepos) continue;                                                         // rien dans les 24 bougies qui suivent une flèche
    if (Math.abs(d) >= P.maAtr * a || run >= P.maBougies) {
      out.push({ type: 'ma_cassure', dir: s, i, prix: B[i].c, niveau: m, atr: a, levelId: 'MA200', source: 'MA200', nom: (s > 0 ? 'Cassure haussière' : 'Cassure baissière') + ' de la MA200 confirmée', confirmation: Math.abs(d) >= P.maAtr * a ? '≥ 1 ATR' : '12 clôtures' });
      cote = s; dernier = i;
    }
  }
  return out;
}

/* ── B. retournements sur zones majeures ── */
export function evenementsNiveaux(B, A, zones) {
  const out = [];
  for (const z of zones) {
    const sens = z.cote === 'support' ? 1 : -1, bas = z.bas, haut = z.haut, levelId = idNiveau(z);
    let i0 = B.findIndex(b => b.t >= z.tDebut); if (i0 < 1) i0 = 1; if (z.retournee) i0 += 1;
    let i1 = B.length - 1; if (z.tFin != null) { const k = B.findIndex(b => b.t >= z.tFin); if (k >= 0) i1 = k; }
    let att = null, dernier = -1e9, arme = true, cassee = false, confirme = !z.retournee;   // zone au rôle récent : un premier retournement (sans flèche) doit d'abord réussir
    for (let i = i0; i <= i1; i++) {
      const a = A[i]; if (!(a > 0)) continue;
      const m = P.toucheAtr * a, b = B[i], c = b.c, prec = B[i - 1].c;
      if (sens > 0 ? c < bas - P.casseeAtr * a : c > haut + P.casseeAtr * a) { cassee = true; att = null; }
      if (cassee) continue;
      const touche = b.l <= haut + m && b.h >= bas - m, traverse = sens > 0 ? c < bas : c > haut, ressort = sens > 0 ? c > haut : c < bas;
      if (!arme && i - dernier >= P.reposZone) arme = true;   // repos strict de 24 bougies par zone
      const poser = () => {
        if (!confirme) { confirme = true; att = null; dernier = i; arme = false; return; }   // premier retournement de l'autre côté : confirmation, sans flèche
        out.push({ type: 'retournement', dir: sens, i, prix: c, niveau: sens > 0 ? haut : bas, atr: a, levelId, zoneBas: bas, zoneHaut: haut, touches: z.force || 0, source: z.nom || z.id,
          nom: (sens > 0 ? 'Retournement haussier sur support majeur' : 'Retournement baissier sur résistance majeure') });
        dernier = i; arme = false; att = null;
      };
      if (att) {
        if (traverse || i - att.i > P.attenteMax) att = null;
        else if (ressort) { poser(); continue; }
      }
      if (!att && arme && touche && !traverse && (sens > 0 ? prec >= bas : prec <= haut)) { att = { i }; if (ressort) poser(); }
    }
  }
  return out;
}

/* distance minimale entre deux flèches : les cassures de la MA200 (rares, décisives) sont toujours gardées ; les retournements sont gardés dans l'ordre, sauf à moins de 6 bougies d'une flèche gardée */
export function espacer(F) {
  const gardees = F.filter(f => f.type === 'ma_cassure').sort((x, y) => x.i - y.i); for (const f of gardees) f.masquee = false;
  for (const f of F.filter(f => f.type !== 'ma_cassure').sort((x, y) => x.i - y.i)) { const conflit = gardees.some(g => Math.abs(f.i - g.i) < P.distanceMin); f.masquee = conflit; if (!conflit) gardees.push(f); }
  return F.slice().sort((x, y) => x.i - y.i);
}

export function calculer(B, zones, { maintenant = Date.now(), jours = null } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], toutes: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes` };
  const A = atrSerie(closes), M = sma(closes), fin = closes[closes.length - 1].t, depuisT = jours == null ? -Infinity : fin - jours * 86400e3;
  let tous = evenementsNiveaux(closes, A, zonesMajeures(zones || [])).concat(evenementsMa(closes, A, M));
  tous = espacer(tous).map(f => ({ ...f, id: `${f.type}|${closes[f.i].t}|${f.dir}|${f.levelId}`, t: closes[f.i].t, tCloture: closes[f.i].t + H, version: VERSION })).filter(f => f.tCloture > depuisT);
  const res = tous.map(f => ({ ...f, resultat: resultat(closes, f) }));
  return { fleches: res.filter(f => !f.masquee), toutes: res, n: closes.length, raison: null };
}
export function fusionnerRegistre(reg, nouvelles) {
  const par = new Map(reg.map(f => [f.id, f])), sortie = reg.slice();
  for (const f of nouvelles) { const e = par.get(f.id); if (!e) { sortie.push(f); par.set(f.id, f); } else e.resultat = f.resultat; }
  return sortie.sort((x, y) => x.tCloture - y.tCloture);
}
export const textesRes = textesResultat;
export const detail = f => {
  const l = [TYPES[f.type] || f.type];
  if (f.type === 'ma_cassure') l.push(`Cassure finale confirmée (${f.confirmation}) : le prix est resté de l'autre côté de la MA200`, 'Aucune autre flèche MA200 dans les 24 bougies qui suivent');
  else { l.push(`Zone majeure dessinée : ${f.source}`, `Zone ${fr(f.zoneBas)}–${fr(f.zoneHaut)} · ${f.touches} touches`, 'Le prix a touché la zone puis clôturé de nouveau hors de la zone dans le sens du rebond', 'Une flèche par touche, repos de 24 bougies ; aucune flèche si la zone est cassée'); }
  return l;
};
export const bilan = () => ({});   // pas de bilan pour les flèches simples
