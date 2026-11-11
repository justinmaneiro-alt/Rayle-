/* ═════════════ MOYENNE MOBILE : événements à la clôture H1 — règle figée « ma-evenements-v1 » (SHA-256 dans ma-evenements-v1.sceau.json, posé AVANT l'affichage et AVANT les statistiques) ═════════════
   Document de référence : STRATEGIE-RAYLE.md §3. Fonctions pures, sans DOM. Bougies { t, o, h, l, c, v } CLOSES ; t = ouverture ; la clôture est à t + période.
   Quatre événements : cassure (à confirmer), vraie cassure (confirmée), fausse cassure / réintégration, rebond. Parcours vers l'avant : un événement n'est posé qu'à la clôture de la bougie qui le produit
   et ne change jamais ensuite (aucun repaint) ; une cassure sans issue au bout de 6 bougies est « expirée ». Une description, jamais un ordre. */
import { atrSerie, agreger, analyser as analyserStructure } from './structure-marche-v1.js';

export const VERSION = 'ma-evenements-v1', FIGEES_LE = '2026-11-11';
export const P = Object.freeze({
  periodeMa: 200, atrN: 14,
  cassureAtr: 0.25,         // écart minimal de la clôture à la MA pour une cassure
  fenetreResolution: 6,     // bougies pour confirmer ou réintégrer
  clotures: 3,              // clôtures consécutives au-delà (après la bougie de cassure) = cassure confirmée
  rebondTouche: 0.25,       // l'extrême est à ≤ 0,25 ATR de la MA
  rebondSortie: 0.5,        // puis une clôture à ≥ 0,5 ATR de la MA
  rebondFenetre: 3,         // dans les 3 bougies suivant l'extrême
  continuation: { gain: 2, perte: 1, bougies: 12 },   // +2 ATR avant −1 ATR en 12 bougies depuis la clôture
  medianeVolume: 50, extension: 24, pente: 10
});
export const NOMS = Object.freeze({ cassure: 'Cassure (à confirmer)', confirmee: 'Cassure confirmée', fausse: 'Fausse cassure, réintégration', rebond: 'Rebond sur la MA', expiree: 'Cassure non tranchée' });
export const TEXTE_REGLES = 'Moyenne mobile v1 : SMA 200 des clôtures H1 (option Jour). Cassure = clôture de l\'autre côté avec un écart ≥ 0,25 ATR. Dans les 6 bougies suivantes : un retest par l\'autre côté qui tient en clôture, ou 3 clôtures consécutives au-delà = cassure confirmée ; une clôture de retour du côté d\'origine = fausse cassure, réintégration. Rebond = extrême à ≤ 0,25 ATR de la MA puis clôture à ≥ 0,5 ATR dans les 3 bougies, sans clôture de l\'autre côté. Tout est posé à la clôture H1, daté, jamais modifié.';

/* SMA des clôtures H1 (null avant n bougies) */
export function smaH1(B, n = P.periodeMa) { const o = new Array(B.length).fill(null); let s = 0; for (let i = 0; i < B.length; i++) { s += B[i].c; if (i >= n) s -= B[i - n].c; if (i >= n - 1) o[i] = s / n; } return o; }
/* SMA 200 des clôtures JOURNALIÈRES (jour = fenêtre de 24 h commençant à 22:00 UTC, approximation du jour de marché), appliquée aux bougies du jour SUIVANT seulement (rien du jour en cours) */
export function smaJour(B, n = P.periodeMa) {
  const o = new Array(B.length).fill(null), cle = t => Math.floor((t - 22 * 3600e3) / 86400e3), clotures = []; let jourCourant = null, i0 = 0;
  const moyenne = () => { if (clotures.length < n) return null; let s = 0; for (let k = clotures.length - n; k < clotures.length; k++) s += clotures[k]; return s / n; };
  let m = null;
  for (let i = 0; i < B.length; i++) {
    const j = cle(B[i].t);
    if (jourCourant === null) jourCourant = j;
    if (j !== jourCourant) { clotures.push(B[i - 1].c); jourCourant = j; m = moyenne(); }
    o[i] = m;
  }
  return o;
}
const mediane = v => { const s = v.slice().sort((a, b) => a - b); const k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : null; };
const sessionUtc = t => { const h = new Date(t).getUTCHours(); return h < 7 ? 'asie' : h < 13 ? 'londres' : h < 21 ? 'new_york' : 'soir'; };

/* tendance H4 connue à chaque bougie H1 (seulement des bougies H4 terminées à la clôture de la bougie H1) */
export function tendanceH4(B, periode = 3600e3) {
  const H4 = agreger(B, 4 * periode), res = analyserStructure(H4, { periode: 4 * periode }), out = new Array(B.length).fill(0); let k = -1;
  for (let i = 0; i < B.length; i++) { const now = B[i].t + periode; while (k + 1 < H4.length && H4[k + 1].t + 4 * periode <= now) k++; out[i] = k >= 0 ? res.tendance[k] : 0; }
  return out;
}

/* classes des six caractéristiques d'une cassure à sa clôture */
export function profilCassure(B, ma, A, i, dir, h4) {
  const a = A[i]; if (a == null || ma[i] == null) return null;
  const corps = Math.abs(B[i].c - B[i].o) / a;
  const vols = []; for (let k = Math.max(0, i - P.medianeVolume); k < i; k++) if (B[k].v > 0) vols.push(B[k].v);
  const med = vols.length >= 20 ? mediane(vols) : null, vr = med && B[i].v > 0 ? B[i].v / med : null;
  let ext = 0; for (let k = Math.max(0, i - P.extension); k < i; k++) if (ma[k] != null) ext = Math.max(ext, Math.abs(B[k].c - ma[k]) / a);
  const pente = ma[i - P.pente] != null ? dir * (ma[i] - ma[i - P.pente]) / a : null;
  const al = h4 ? h4[i] * dir : 0;
  return {
    corps: corps < 0.6 ? 'faible' : corps <= 1.2 ? 'moyen' : 'fort',
    volume: vr == null ? 'inconnu' : vr < 0.8 ? 'bas' : vr <= 1.3 ? 'normal' : 'haut',
    extension: ext < 1.5 ? 'courte' : ext <= 3 ? 'moyenne' : 'longue',
    pente: pente == null ? 'inconnue' : pente < -0.05 ? 'contre' : pente > 0.05 ? 'avec' : 'plate',
    h4: al > 0 ? 'avec' : al < 0 ? 'contre' : 'neutre',
    session: sessionUtc(B[i].t),
    valeurs: { corps, volumeRelatif: vr, extension: ext, pente, h4: h4 ? h4[i] : 0 }
  };
}
export const CARACTERISTIQUES = Object.freeze(['corps', 'volume', 'extension', 'pente', 'h4', 'session']);

/* Analyse vers l'avant. B = bougies CLOSES. mode : 'h1' (SMA 200 H1) ou 'jour' (SMA 200 journalière). Renvoie { ma[], atr[], events[], etat } */
export function analyser(B, { mode = 'h1', periode = 3600e3, R = P, h4 = null } = {}) {
  const n = B.length, ma = mode === 'jour' ? smaJour(B, R.periodeMa) : smaH1(B, R.periodeMa), A = atrSerie(B, R.atrN), events = [], H4 = h4 || tendanceH4(B, periode);
  const cote = i => (ma[i] == null ? 0 : B[i].c > ma[i] ? 1 : B[i].c < ma[i] ? -1 : 0);
  const evt = (type, dir, i, o) => { const e = { id: `${type}|${B[i].t}|${dir}`, type, dir, i, t: B[i].t, tCloture: B[i].t + periode, niveau: ma[i], atr: A[i], ...o }; events.push(e); return e; };
  const attente = [];          // cassures en cours de résolution { e, dir, i0, consecutives }
  let dernierRebond = { 1: -1, [-1]: -1 };
  for (let i = 1; i < n; i++) {
    const a = A[i]; if (ma[i] == null || a == null || ma[i - 1] == null) continue;
    // 1) résolution des cassures en attente (créées AVANT cette bougie)
    for (const w of attente) {
      if (w.fini || i <= w.i0) continue;
      const c = cote(i);
      if (c === -w.dir) { w.fini = true; evt('fausse', -w.dir, i, { ref: w.e.id, dirCassure: w.dir, delaiBougies: i - w.i0 }); continue; }   // retour du côté d'origine (la clôture sur la MA exacte n'est pas un retour)
      const retest = w.dir > 0 ? (B[i].l <= ma[i] && B[i].c > ma[i]) : (B[i].h >= ma[i] && B[i].c < ma[i]);
      w.consecutives = c === w.dir ? w.consecutives + 1 : 0;
      if (retest || w.consecutives >= R.clotures) { w.fini = true; evt('confirmee', w.dir, i, { ref: w.e.id, dirCassure: w.dir, delaiBougies: i - w.i0, motif: retest ? 'retest' : 'clotures' }); }
      if (!w.fini && i === w.i0 + R.fenetreResolution) { w.fini = true; evt('expiree', w.dir, i, { ref: w.e.id, dirCassure: w.dir }); }   // aucune issue au bout de 6 bougies
    }
    // 2) nouvelle cassure
    const cPrec = cote(i - 1), c = cote(i);
    if (cPrec !== 0 && c === -cPrec && Math.abs(B[i].c - ma[i]) >= R.cassureAtr * a) {
      const dir = c, e = evt('cassure', dir, i, { profil: profilCassure(B, ma, A, i, dir, H4), statut: 'a_confirmer' });
      attente.push({ e, dir, i0: i, consecutives: 0, fini: false });
    }
    // 3) rebond : extrême à ≤ 0,25 ATR de la MA dans les 3 bougies précédentes, puis clôture à ≥ 0,5 ATR du bon côté, sans clôture de l'autre côté
    for (const dir of [1, -1]) {
      if ((B[i].c - ma[i]) * dir < R.rebondSortie * a) continue;
      for (let j = Math.max(1, i - R.rebondFenetre); j <= i - 1; j++) {
        if (j <= dernierRebond[dir] || ma[j] == null || A[j] == null) continue;
        const touche = dir > 0 ? B[j].l <= ma[j] + R.rebondTouche * A[j] : B[j].h >= ma[j] - R.rebondTouche * A[j];
        if (!touche) continue;
        let propre = true; for (let k = j - 1; k <= i; k++) if (cote(k) !== dir) { propre = false; break; }
        if (!propre) continue;
        evt('rebond', dir, i, { extremeI: j, extremeT: B[j].t, extreme: dir > 0 ? B[j].l : B[j].h }); dernierRebond[dir] = i; break;
      }
    }
  }
  const der = events.slice().reverse(), enAttente = attente.filter(w => !w.fini).map(w => w.e);
  return { mode, ma, atr: A, h4: H4, events, etat: { cote: n ? cote(n - 1) : 0, ma: n ? ma[n - 1] : null, dernier: der[0] || null, enAttente, ecartAtr: n && ma[n - 1] != null && A[n - 1] ? (B[n - 1].c - ma[n - 1]) / A[n - 1] : null } };
}

/* Résultat d'une continuation depuis la clôture de la bougie i dans le sens dir : 1 = +2 ATR avant −1 ATR, −1 = l'inverse (ou les deux dans la même bougie : prudent), 0 = ni l'un ni l'autre */
export function issueContinuation(B, i, dir, a, R = P.continuation) {
  const ref = B[i].c, haut = ref + dir * R.gain * a, bas = ref - dir * R.perte * a;
  for (let k = i + 1; k <= Math.min(B.length - 1, i + R.bougies); k++) {
    const b = B[k], gagne = dir > 0 ? b.h >= haut : b.l <= haut, perd = dir > 0 ? b.l <= bas : b.h >= bas;
    if (perd) return -1; if (gagne) return 1;
  }
  return 0;
}
/* Phrase de mesure honnête pour un événement : fréquence, n, base ; « fort » / « probable » seulement si la borne basse dépasse nettement la base sur les deux fenêtres */
const wilson = (k, n, z = 1.96) => { if (!n) return [0, 1]; const p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n); return [c - h, c + h]; };
export { wilson };
export function motMesure(cel) {
  if (!cel || !cel.recent || !cel.long) return null;
  const ok = f => f.n >= 30 && f.icPart && f.icPart[0] > f.basePart + 0.05, ko = f => f.n >= 30 && f.icPart && f.icPart[1] < f.basePart - 0.05;   // part des issues tranchées : corrige l'effet de la volatilité du moment
  return ok(cel.recent) && ok(cel.long) ? 'au-dessus de la base' : ko(cel.recent) && ko(cel.long) ? 'en dessous de la base' : 'pas nettement différent de la base';
}
export function etiquette(e, stats) {
  const base = NOMS[e.type] || e.type; if (!stats || !stats.evenements) return base;
  const cle = e.type === 'confirmee' ? 'cassure_confirmee' : e.type === 'fausse' ? 'cassure_fausse' : e.type === 'cassure' ? 'cassure' : e.type === 'rebond' ? 'rebond' : null;
  const f = cle && stats.evenements[cle] && stats.evenements[cle][e.dir > 0 ? 'haussier' : 'baissier'];
  const c = f && f.long; if (!c || c.n == null) return base; if (c.n < 30) return `${base} · pas assez de données (n = ${c.n})`;
  return `${base} · continuation ${Math.round(c.taux * 100)} %, n = ${c.n}`;
}
