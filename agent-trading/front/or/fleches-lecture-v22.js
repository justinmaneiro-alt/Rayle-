/* ═════════════ FLÈCHES DE LECTURE v2.2 — « fleches-lecture-v22 » (2026-11-12) ═════════════
   Écrite APRÈS avoir vu des exemples (chute en escalier du 12 novembre) : règles ajustées au vu de ces cas, aucune preuve de performance. v2 et v2.1 (scellées) ne sont pas modifiées ;
   la MA200 (cassure, retest, anti-grappe) vient de la v2.1, inchangée. Seuls les rebonds sur zones changent. Les zones surveillées sont celles qui sont DESSINÉES (levelId).
   1. ZONE CASSÉE : une clôture à plus de 0,3 ATR de l'autre côté d'une zone la casse. Plus aucune flèche de rebond dans l'ancien sens sur elle. Une zone retournée (son rôle a changé après la
      cassure) ne porte plus que des flèches dans le sens de la cassure ; la première s'appelle « retest de zone cassée » (relâché : la version « une seule flèche » supprimait 5 des 6 rebonds du cas de contrôle (c)).
   2. CHUTE EN ESCALIER : si une zone a été cassée dans le sens du mouvement dans les 24 dernières bougies H1 et que le contact fait un nouveau plus bas (ou plus haut), la flèche de rebond
      CONTRE le mouvement est retenue tant qu'aucune condition de stabilisation n'est remplie, avec 16 bougies de patience après le contact :
      a) base : 8 bougies H1 consécutives sans nouveau plus bas (plus haut) — tolérance 0,1 ATR — dont l'étendue totale est ≤ 1,5 ATR ;
      b) divergence RSI confirmée (rsi-lecture-v1) dont le second pivot est sur la zone (± 0,5 ATR) ;
      c) clôture H1 à ≥ 0,5 ATR (1 ATR dans la demande initiale ; ABAISSÉ car 1 ATR supprimait le cas de contrôle « rebond baissier du 10 nov. 02:00 ») au-dessus du dernier plus bas
      (en dessous du dernier plus haut) des 24 dernières bougies, au plus tôt à la bougie qui suit le contact.
      Quand une condition est remplie la flèche est posée, nommée « rebond après base », « rebond avec divergence » ou « rebond après relance de 1 ATR ».
   3. CONTRE-TENDANCE : une flèche contraire à la tendance (clôture sous la MA200 qui baisse sur 24 bougies pour un achat, au-dessus de la MA200 qui monte pour une vente) est marquée
      « contre-tendance » (affichée plus petite et pâle), sauf si elle passe par a, b ou c.
   4. Pas de flèche sans niveau : levelId d'une zone dessinée ou MA200. Couleurs : haussier vert, baissier rouge, MA200 cyan.
   Mesure informative : « échoué » = la zone est cassée (clôture à > 0,3 ATR de l'autre côté) dans les 12 bougies suivantes. Jamais utilisée pour décider. */
import * as V21 from './fleches-lecture-v21.js';
import { atrSerie, resultat } from './fleches-terminal-v1.js';
import { sma } from './fleches-lecture-v1.js';
import { rsiWilder, divergences } from './rsi-lecture-v1.js';

export const VERSION = 'fleches-lecture-v22', ECRITES_LE = '2026-11-12';
export const H = 3600e3;
export const P = Object.freeze({ ...V21.P, casseeAtr: 0.3, escalier: 24, base: 8, baseTol: 0.1, baseRange: 1.5, relanceAtr: 0.5, patience: 16, tendance: 24, echec: 12, divAtr: 0.5 });
export const TYPES = Object.freeze({ ...V21.TYPES, retest_zone: 'Retest de zone cassée' });
export const idNiveau = V21.idNiveau, textesRes = V21.textesRes, espacer = V21.espacer, fusionnerRegistre = V21.fusionnerRegistre;
const fr = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const minL = (B, a, b) => { let m = Infinity; for (let k = Math.max(0, a); k <= b; k++) if (B[k].l < m) m = B[k].l; return m; };
const maxH = (B, a, b) => { let m = -Infinity; for (let k = Math.max(0, a); k <= b; k++) if (B[k].h > m) m = B[k].h; return m; };

/* instants où une zone dessinée a été cassée : { i, dir } (dir -1 = cassée vers le bas, +1 = vers le haut) */
export function cassures(B, zones) {
  const out = [];
  for (const z of zones) if (z.tFin != null) { const k = B.findIndex(b => b.t >= z.tFin); if (k >= 0) out.push({ i: k, dir: z.cote === 'support' ? -1 : 1 }); }
  return out;
}
/* base : n bougies finissant en i, sans nouveau plus bas (haut) à la tolérance près, étendue ≤ 1,5 ATR */
export function base(B, A, i, dir) {
  const n = P.base; if (i < n - 1 || !(A[i] > 0)) return false;
  const a = A[i], d = i - n + 1; let ext = dir > 0 ? B[d].l : B[d].h;
  for (let k = d + 1; k <= i; k++) { if (dir > 0) { if (B[k].l < ext - P.baseTol * a) return false; ext = Math.min(ext, B[k].l); } else { if (B[k].h > ext + P.baseTol * a) return false; ext = Math.max(ext, B[k].h); } }
  return maxH(B, d, i) - minL(B, d, i) <= P.baseRange * a;
}
export function contreTendance(B, M, i, dir) {
  const m = M[i], m0 = M[i - P.tendance]; if (m == null || m0 == null) return false;
  return dir > 0 ? (B[i].c < m && m < m0) : (B[i].c > m && m > m0);
}

export function evenementsNiveaux(B, A, zones, { R = rsiWilder(B.map(b => b.c)), M = sma(B) } = {}) {
  const out = [], D = divergences(B, R), casses = cassures(B, zones);
  for (const z of zones) {
    const sens = z.cote === 'support' ? 1 : -1, bas = z.bas, haut = z.haut, force = z.force || 1, levelId = idNiveau(z);
    let i0 = B.findIndex(b => b.t >= z.tDebut); if (i0 < 1) i0 = 1;
    if (z.retournee) i0 += 1;
    let i1 = B.length - 1; if (z.tFin != null) { const k = B.findIndex(b => b.t >= z.tFin); if (k >= 0) i1 = k; }
    let att = null, dernier = -1e9, arme = true, cassee = false, retestFait = false;
    const poster = (i, ic, ressort, raison) => {
      const a = A[i], c = B[i].c, ct = !raison && contreTendance(B, M, i, sens);
      const retest = !!z.retournee && !retestFait;   // première flèche d'une zone retournée = « retest de zone cassée » ; les suivantes sont de vrais rebonds dans le sens de la cassure
      const etiquette = retest ? 'Retest de zone cassée' : raison === 'base' ? (sens > 0 ? 'Rebond après base' : 'Rejet après base') : raison === 'divergence' ? (sens > 0 ? 'Rebond avec divergence RSI' : 'Rejet avec divergence RSI') : raison === 'relance' ? (sens > 0 ? 'Rebond après relance (≥ 0,5 ATR)' : 'Rejet après relance (≥ 0,5 ATR)') : (sens > 0 ? 'Rebond haussier sur support' : 'Rebond baissier sur résistance');
      out.push({ type: retest ? 'retest_zone' : (ressort ? 'rebond' : 'rebond2'), dir: sens, i, prix: c, niveau: sens > 0 ? haut : bas, atr: a, levelId, force, zoneBas: bas, zoneHaut: haut, touche: ic, source: z.nom || z.id,
        raison: raison || null, contreTendance: ct, nom: etiquette + (ct ? ' (contre-tendance)' : '') + (ressort || retest ? '' : ' (2 bougies)') });
      dernier = i; arme = false; att = null; if (z.retournee) retestFait = true;
    };
    for (let i = i0; i <= i1; i++) {
      const a = A[i]; if (!(a > 0)) continue;
      const m = P.toucheAtr * a, b = B[i], c = b.c, prec = B[i - 1].c;
      const touche = b.l <= haut + m && b.h >= bas - m;
      const horsBonCote = sens > 0 ? b.l > haut + m : b.h < bas - m;
      if (!arme && (horsBonCote || i - dernier >= P.repos)) arme = true;
      // 1. zone cassée : clôture à plus de 0,3 ATR de l'autre côté
      if (sens > 0 ? c < bas - P.casseeAtr * a : c > haut + P.casseeAtr * a) { cassee = true; att = null; }
      if (cassee) continue;
      const traverse = sens > 0 ? c < bas : c > haut, ressort = sens > 0 ? c > haut : c < bas;
      if (att) {
        if (traverse || i - att.i > (att.suspendu ? P.patience : P.attenteMax)) { att = null; }
        else {
          const dansLeSens = sens > 0 ? c > prec : c < prec;
          if (!ressort) att.suite = dansLeSens ? att.suite + 1 : 0;
          if (ressort || att.suite >= P.deuxBougies) {
            // 2. chute en escalier : zone cassée dans le sens du mouvement dans les 24 bougies et contact sur un nouveau plus bas (haut)
            const escalier = casses.some(q => q.dir === -sens && q.i <= i && q.i > i - P.escalier) && (sens > 0 ? B[att.i].l <= minL(B, att.i - P.escalier, att.i - 1) + P.baseTol * a : B[att.i].h >= maxH(B, att.i - P.escalier, att.i - 1) - P.baseTol * a);
            if (!escalier) { poster(i, att.i, ressort, null); continue; }
            let raison = null;
            if (base(B, A, i, sens)) raison = 'base';
            else if (D.some(d => d.dir === sens && d.confirmeI <= i && d.i2 >= att.i - 6 && (sens > 0 ? d.p2 >= bas - P.divAtr * a && d.p2 <= haut + P.divAtr * a : d.p2 >= bas - P.divAtr * a && d.p2 <= haut + P.divAtr * a))) raison = 'divergence';
            else if (sens > 0 ? c - minL(B, i - P.escalier, i) >= P.relanceAtr * a : maxH(B, i - P.escalier, i) - c >= P.relanceAtr * a) raison = 'relance';
            if (raison && ressort) { poster(i, att.i, true, raison); continue; }
            att.suspendu = true;   // rebond retenu : on attend une condition de stabilisation (16 bougies au plus)
          }
        }
      }
      if (!att && arme && touche && !traverse) {
        const bonCote = sens > 0 ? prec >= bas : prec <= haut;
        if (bonCote) {
          att = { i, suite: 0, suspendu: false };
          if (ressort) {   // la bougie de contact ressort elle-même : même examen que ci-dessus
            const escalier = casses.some(q => q.dir === -sens && q.i <= i && q.i > i - P.escalier) && (sens > 0 ? b.l <= minL(B, i - P.escalier, i - 1) + P.baseTol * a : b.h >= maxH(B, i - P.escalier, i - 1) - P.baseTol * a);
            if (!escalier) poster(i, i, true, null);
            else att.suspendu = true;   // contact en pleine chute : aucune condition ne peut être remplie par la bougie de contact elle-même (il faut au moins une bougie de confirmation)
          }
        }
      }
    }
  }
  return out;
}

/* informatif : la zone est-elle cassée (clôture à > 0,3 ATR de l'autre côté) dans les 12 bougies qui suivent ? */
export function echoue(B, f) {
  if (f.zoneBas == null) return null;
  const fin = Math.min(B.length - 1, f.i + P.echec); let vu = 0;
  for (let k = f.i + 1; k <= fin; k++) { vu++; if (f.dir > 0 ? B[k].c < f.zoneBas - P.casseeAtr * f.atr : B[k].c > f.zoneHaut + P.casseeAtr * f.atr) return true; }
  return vu < P.echec ? null : false;   // null = pas encore décidé
}

export const evenementsMa = V21.evenementsMa;
export function calculer(B, zones, { maintenant = Date.now(), jours = null } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], toutes: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes` };
  const A = atrSerie(closes), M = sma(closes), fin = closes[closes.length - 1].t, depuisT = jours == null ? -Infinity : fin - jours * 86400e3;
  let tous = evenementsNiveaux(closes, A, zones || [], { M });
  const dernierNiv = new Map(); tous = tous.sort((x, y) => x.i - y.i).filter(f => { const k = String(f.levelId).split('@')[0], d = dernierNiv.get(k); if (d && d.seg !== f.levelId && f.i - d.i < P.repos) return false; dernierNiv.set(k, { i: f.i, seg: f.levelId }); return true; });
  tous = tous.concat(evenementsMa(closes, A, M));
  tous = espacer(tous).map(f => ({ ...f, id: `${f.type}|${closes[f.i].t}|${f.dir}|${f.levelId}`, t: closes[f.i].t, tCloture: closes[f.i].t + H, version: VERSION })).filter(f => f.tCloture > depuisT);
  const res = tous.map(f => ({ ...f, resultat: resultat(closes, f), issue: f.type === 'ma_cassure' ? V21.issue(closes, f) : (() => { const e = echoue(closes, f); return e === true ? 'échoué (zone cassée dans les 12 bougies)' : e === false ? 'tient (zone non cassée en 12 bougies)' : 'en cours'; })(), echoue: f.zoneBas != null ? echoue(closes, f) : null }));
  return { fleches: res.filter(f => !f.masquee), toutes: res, n: closes.length, raison: null };
}
export const detail = f => {
  const l = V21.detail(f).filter(x => !/^Rebond sur un niveau|^Issue/.test(x));
  if (f.type === 'ma_cassure' || f.type === 'ma_retest') return V21.detail(f);
  if (f.type === 'retest_zone') l.push('Zone déjà cassée : une seule flèche possible, dans le sens de la cassure');
  if (f.raison === 'base') l.push('Après une chute en escalier : stabilisation par une base (8 bougies sans nouveau plus bas, ≤ 1,5 ATR)');
  if (f.raison === 'divergence') l.push('Après une chute en escalier : divergence RSI confirmée sur la zone');
  if (f.raison === 'relance') l.push('Après une chute en escalier : clôture à ≥ 0,5 ATR du dernier extrême, au moins une bougie après le contact');
  if (f.contreTendance) l.push('CONTRE-TENDANCE : va contre la MA200 (affichée plus petite)');
  if (f.issue) l.push(`Issue (information) : ${f.issue}`);
  return l;
};
