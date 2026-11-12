/* ═════════════ FLÈCHES DE LECTURE v2 — règle « fleches-lecture-v2 » (2026-11-12, écrite AVANT les tests et le rejeu) ═════════════
   Pur, sans DOM, sans réseau. Remplace fleches-lecture-v1 (scellée, intacte) à l'affichage. Une flèche marque un ÉVÉNEMENT de lecture, jamais un ordre ni un trade rentable.
   RÈGLE D'OR : UNE SEULE SOURCE DE VÉRITÉ. Les niveaux surveillés sont EXACTEMENT les zones H1 dessinées par le graphique (zones-affichage-v1 : actives + traces, chacune avec sa
   naissance et son éventuelle invalidation). Chaque flèche porte le levelId de la zone dessinée (ou 'MA200'). Pas de zone dessinée = pas de flèche ; zone dessinée = surveillée.
   Bougies H1 CLOSES { t, o, h, l, c, v } ; décision à la clôture ; aucune bougie future n'est lue.
   1. REBOND SUR NIVEAU : contact = mèche dans la zone ± 0,15 ATR, le prix venant du bon côté (clôture précédente non encore au-delà). La flèche est posée à la PREMIÈRE clôture qui ressort de
      la zone dans le sens du rebond (support : clôture > haut de la zone ; résistance : clôture < bas). Variante « 2 bougies » : deux clôtures consécutives dans le sens du rebond, restées dans la
      zone, sans traverser. Aucune attente de confirmation pour AFFICHER ; l'infobulle dit ensuite « confirmé » (réaction ≥ 0,5 ATR dans les 6 bougies) ou « échoué » (information).
      Rebond depuis une base plate : le contact reste en attente tant que les clôtures restent dans la zone (36 bougies au plus). Une clôture au-delà de la zone, du mauvais côté, annule l'attente.
      Une zone retournée (support devenu résistance) n'est surveillée qu'à partir de la bougie SUIVANT son invalidation.
      Rappel : une flèche par touche ; la zone redevient armée après une bougie entièrement hors de la zone (± 0,15 ATR) du bon côté, ou après 12 bougies.
   2. MA200 (SMA 200 des clôtures H1) : cassure = première clôture de l'autre côté à ≥ 0,3 ATR (forme et couleur distinctes) ; si le prix re-franchit dans les 6 bougies, la cassure est
      étiquetée « fausse cassure » (information : la flèche reste) et le retour ne crée pas de flèche ; retest = mèche qui revient à ≤ 0,1 ATR de la MA dans les 48 bougies sans clôturer de l'autre
      côté, puis clôture à nouveau du côté de la cassure.
   3. Plus aucune flèche « Rebond sur la MA » (continuation) : seules les cassures et retests de la MA200.
   4. Pas de grappe : au plus une flèche par touche ; au moins 6 bougies entre deux flèches de même sens (la première posée reste, sauf à égalité de bougie : la zone la plus forte,
      c'est-à-dire la plus touchée, gagne — rien n'est retiré après coup, donc pas de repaint).
   Résultats mesurés (favorable / défavorable en ATR à 6, 12, 24 bougies) : INFORMATIFS, jamais utilisés pour décider ; ils ne disent pas que les flèches sont rentables. */
import { atrSerie, resultat, textesResultat } from './fleches-terminal-v1.js';
import { sma } from './fleches-lecture-v1.js';

export const VERSION = 'fleches-lecture-v2', ECRITES_LE = '2026-11-12';
export const H = 3600e3;
export const P = Object.freeze({
  toucheAtr: 0.15, attenteMax: 36, repos: 12, reaction: 0.5, fenetreReaction: 6, deuxBougies: 2,
  maPeriode: 200, cassureAtr: 0.3, confirmation: 6, retestAtr: 0.1, retestFenetre: 48, distanceMin: 6, horizons: [6, 12, 24]
});
export const TYPES = Object.freeze({
  rebond: 'Rebond sur un niveau', rebond2: 'Rebond sur un niveau (2 bougies)', ma_cassure: 'Cassure de la MA200', ma_retest: 'Retest de la MA200'
});
const FORCE_MA = 1000;
export const idNiveau = z => `${z.id}@${z.tDebut}`;
const fr = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/* ── 1. rebonds sur les zones dessinées ── */
export function evenementsNiveaux(B, A, zones) {
  const out = [];
  for (const z of zones) {
    const sens = z.cote === 'support' ? 1 : -1, bas = z.bas, haut = z.haut, force = z.force || 1, levelId = idNiveau(z);
    let i0 = B.findIndex(b => b.t >= z.tDebut); if (i0 < 1) i0 = 1;
    if (z.retournee) i0 += 1;   // zone retournée : la bougie qui l'a invalidée de l'autre côté n'est pas un contact
    let i1 = B.length - 1; if (z.tFin != null) { const k = B.findIndex(b => b.t >= z.tFin); if (k >= 0) i1 = k; }
    let att = null, dernier = -1e9, arme = true;
    for (let i = i0; i <= i1; i++) {
      const a = A[i]; if (!(a > 0)) continue;
      const m = P.toucheAtr * a, b = B[i], c = b.c, prec = B[i - 1].c;
      const touche = b.l <= haut + m && b.h >= bas - m;
      const horsBonCote = sens > 0 ? b.l > haut + m : b.h < bas - m;   // bougie entièrement hors de la zone, du bon côté
      if (!arme && (horsBonCote || i - dernier >= P.repos)) arme = true;
      const traverse = sens > 0 ? c < bas : c > haut;
      const ressort = sens > 0 ? c > haut : c < bas;
      if (att) {
        if (traverse || i - att.i > P.attenteMax) { att = null; }
        else {
          const dansLeSens = sens > 0 ? c > prec : c < prec;
          if (!ressort) att.suite = dansLeSens ? att.suite + 1 : 0;
          if (ressort || att.suite >= P.deuxBougies) {
            out.push({ type: ressort ? 'rebond' : 'rebond2', dir: sens, i, prix: c, niveau: sens > 0 ? haut : bas, atr: a, levelId, force: force + att.touches, zoneBas: bas, zoneHaut: haut, touche: att.i, source: z.nom || z.id,
              nom: `${sens > 0 ? 'Rebond haussier sur support' : 'Rebond baissier sur résistance'}${ressort ? '' : ' (2 bougies)'}` });
            dernier = i; arme = false; att = null; continue;
          }
        }
      }
      if (!att && arme && touche && !traverse) {
        const bonCote = sens > 0 ? prec >= bas : prec <= haut;   // le prix vient du bon côté (pas déjà au-delà de la zone)
        if (bonCote) {
          att = { i, suite: 0, touches: 0 };
          // la bougie de contact elle-même peut ressortir de la zone (mèche de rejet) : flèche à sa clôture
          if (ressort) { out.push({ type: 'rebond', dir: sens, i, prix: c, niveau: sens > 0 ? haut : bas, atr: a, levelId, force, zoneBas: bas, zoneHaut: haut, touche: i, source: z.nom || z.id, nom: sens > 0 ? 'Rebond haussier sur support' : 'Rebond baissier sur résistance' }); dernier = i; arme = false; att = null; }
        }
      }
    }
  }
  return out;
}

/* ── 2. MA200 ── */
export function evenementsMa(B, A, M = sma(B)) {
  const out = []; let cote = 0, derniere = null, retest = null;
  for (let i = 1; i < B.length; i++) {
    const m = M[i], a = A[i]; if (m == null || !(a > 0)) continue;
    const c = B[i].c, d = c - m;
    if (cote === 0) { if (Math.abs(d) >= P.cassureAtr * a) cote = Math.sign(d); continue; }
    if (Math.sign(d) === -cote && Math.abs(d) >= P.cassureAtr * a) {
      if (derniere && !derniere.fausse && i - derniere.i <= P.confirmation && -cote === -derniere.dir) { derniere.fausse = true; derniere.fausseI = i; cote = -derniere.dir; retest = null; continue; }   // retour : fausse cassure, pas de nouvelle flèche
      const f = { type: 'ma_cassure', dir: Math.sign(d), i, prix: c, niveau: m, atr: a, levelId: 'MA200', force: FORCE_MA, source: 'MA200', nom: (d > 0 ? 'Cassure haussière' : 'Cassure baissière') + ' de la MA200', fausse: false };
      out.push(f); derniere = f; retest = { dir: f.dir, i, fait: false }; cote = f.dir; continue;
    }
    if (retest && !retest.fait && i - retest.i <= P.retestFenetre && i > retest.i) {
      const dir = retest.dir, touche = dir > 0 ? B[i].l <= m + P.retestAtr * a : B[i].h >= m - P.retestAtr * a, bonCote = dir > 0 ? c > m : c < m;
      if (touche) { if (bonCote && Math.abs(d) >= 0.1 * a && i > retest.i + 1) { out.push({ type: 'ma_retest', dir, i, prix: c, niveau: m, atr: a, levelId: 'MA200', force: FORCE_MA - 1, source: 'MA200', nom: (dir > 0 ? 'Retest haussier' : 'Retest baissier') + ' de la MA200 : le prix y revient et tient' }); retest.fait = true; } }
    } else if (retest && i - retest.i > P.retestFenetre) retest = null;
  }
  return out;
}

/* ── 4. distance minimale de 6 bougies entre deux flèches de même sens (première posée gardée ; à la même bougie, la plus forte) ── */
export function espacer(F) {
  const tri = F.slice().sort((x, y) => x.i - y.i || y.force - x.force), gardees = [];
  for (const f of tri) {
    const conflit = gardees.some(g => g.dir === f.dir && f.i - g.i < P.distanceMin);
    f.masquee = conflit; f.raisonMasque = conflit ? 'distance' : null; gardees.push(...(conflit ? [] : [f]));
  }
  return tri;
}

/* ── confirmé / échoué (information, jamais utilisé pour décider) ── */
export function issue(B, f) {
  if (f.type === 'ma_cassure') return f.fausse ? 'fausse cassure' : (f.i + P.confirmation > B.length - 1 ? 'en cours' : 'tient');
  if (f.i + P.fenetreReaction > B.length - 1) { let mx = 0; for (let k = f.i + 1; k < B.length; k++) mx = Math.max(mx, f.dir > 0 ? (B[k].h - f.prix) / f.atr : (f.prix - B[k].l) / f.atr); return mx >= P.reaction ? 'confirmé' : 'en cours'; }
  let mx = 0; for (let k = f.i + 1; k <= f.i + P.fenetreReaction; k++) mx = Math.max(mx, f.dir > 0 ? (B[k].h - f.prix) / f.atr : (f.prix - B[k].l) / f.atr);
  return mx >= P.reaction ? 'confirmé' : 'échoué';
}

/* ── tout en un : zones = zones H1 dessinées { id, cote, bas, haut, tDebut, tFin|null, force?, nom? } ── */
export function calculer(B, zones, { maintenant = Date.now(), jours = null } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], toutes: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes` };
  const A = atrSerie(closes), M = sma(closes), fin = closes[closes.length - 1].t, depuisT = jours == null ? -Infinity : fin - jours * 86400e3;
  let tous = evenementsNiveaux(closes, A, zones || []).concat(evenementsMa(closes, A, M));
  tous = espacer(tous).map(f => ({ ...f, id: `${f.type}|${closes[f.i].t}|${f.dir}|${f.levelId}`, t: closes[f.i].t, tCloture: closes[f.i].t + H, version: VERSION })).filter(f => f.tCloture > depuisT);
  const res = tous.map(f => ({ ...f, resultat: resultat(closes, f), issue: issue(closes, f) }));
  return { fleches: res.filter(f => !f.masquee), toutes: res, n: closes.length, raison: null };
}

/* registre en ajout seul : une flèche posée n'est jamais déplacée ; l'issue et le résultat s'enrichissent */
export function fusionnerRegistre(reg, nouvelles) {
  const par = new Map(reg.map(f => [f.id, f])), sortie = reg.slice();
  for (const f of nouvelles) { const e = par.get(f.id); if (!e) { sortie.push(f); par.set(f.id, f); } else { e.resultat = f.resultat; e.issue = f.issue; e.fausse = f.fausse; } }
  return sortie.sort((x, y) => x.tCloture - y.tCloture);
}
export const textesRes = textesResultat;
export const detail = f => {
  const l = [TYPES[f.type] || f.type];
  if (f.type === 'ma_cassure') l.push(f.fausse ? 'FAUSSE CASSURE : le prix est repassé de l’autre côté dans les 6 bougies (information : la flèche reste)' : 'Cassure : première clôture H1 à ≥ 0,3 ATR de l’autre côté de la MA200');
  else if (f.type === 'ma_retest') l.push('Le prix est revenu toucher la MA200 sans clôturer de l’autre côté');
  else { l.push(`Niveau dessiné : ${f.source || f.levelId}`); if (f.zoneBas != null) l.push(`Zone ${fr(f.zoneBas)}–${fr(f.zoneHaut)}`); l.push(f.type === 'rebond2' ? 'Variante « 2 bougies » : deux clôtures dans le sens du rebond' : 'Première clôture qui ressort de la zone dans le sens du rebond'); }
  if (f.issue) l.push(`Issue (information) : ${f.issue}${f.type === 'ma_cassure' ? '' : ' — confirmé = réaction ≥ 0,5 ATR dans les 6 bougies'}`);
  return l;
};
