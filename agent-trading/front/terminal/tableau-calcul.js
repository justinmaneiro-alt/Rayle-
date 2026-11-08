/* ═════════════ TERMINAL : TABLEAU DE BORD MULTI-UNITÉS, SANTÉ, SÉANCES, CORRÉLATIONS, COT COMPLET, CALENDRIER (pur, testé) ═════════════
   Aucune dépendance au navigateur. Aucune valeur inventée : une donnée absente reste null et s'affiche « — » ou « indisponible ». */
import { sma, atr, derniere } from './indicateurs.js';

/* ── RSI de Wilder (14) ── */
export function rsi(B, n = 14) {
  const out = new Array(B.length).fill(null); if (B.length <= n) return out;
  let g = 0, p = 0;
  for (let i = 1; i <= n; i++) { const d = B[i].c - B[i - 1].c; if (d > 0) g += d; else p -= d; }
  g /= n; p /= n; out[n] = p === 0 ? 100 : 100 - 100 / (1 + g / p);
  for (let i = n + 1; i < B.length; i++) { const d = B[i].c - B[i - 1].c; g = (g * (n - 1) + Math.max(d, 0)) / n; p = (p * (n - 1) + Math.max(-d, 0)) / n; out[i] = p === 0 ? 100 : 100 - 100 / (1 + g / p); }
  return out;
}

/* ── support et résistance les plus proches parmi des niveaux { p } ── */
export function niveauxProches(prix, niveaux = []) {
  let s = null, r = null;
  for (const n of niveaux) { const p = +((n && n.p) ?? n); if (!(p > 0)) continue; if (p <= prix && (s == null || p > s)) s = p; if (p > prix && (r == null || p < r)) r = p; }
  return { support: s, resistance: r };
}

/* ── volume net en dollars : acheteurs (ordres au marché) moins vendeurs, sur une liste { usd, achatUsd } ── */
export function volNet(L) {
  if (!Array.isArray(L) || !L.length) return null;
  let tot = 0, ach = 0; for (const x of L) { if (!Number.isFinite(x.usd) || !Number.isFinite(x.achatUsd)) return null; tot += x.usd; ach += x.achatUsd; }
  return { net: 2 * ach - tot, total: tot, part: tot > 0 ? (2 * ach - tot) / tot : 0 };
}

/* ═════ SCORE /100 : SYNTHÈSE DE LECTURE (formule figée « score-lecture-v1 », écrite AVANT tout affichage ; jamais une prévision) ═════
   Le score lit la PRESSION ACHETEUSE du moment : 100 = tout penche à l'achat, 0 = tout penche à la vente, 50 = neutre.
     Tendance  30 pts : haussière (prix > SMA 200 de l'unité, SMA qui monte) 30 · neutre 15 · baissière 0 · inconnue 15
     RSI (14)  20 pts : 20 × RSI / 100                                        · inconnu 10
     Volume net 20 pts : 10 + 10 × (net / volume total), borné entre 0 et 20   · inconnu 10
     Niveaux   15 pts : 15 × (résistance − prix) / (résistance − support)      · un niveau manquant 7,5
                        (près du support = de la place vers le haut ; près de la résistance = de la place vers le bas)
     Carnet    15 pts : 15 × part des acheteurs dans le carnet (± 0,5 %)        · inconnu 7,5
   Les parts inconnues valent leur milieu (neutre) et sont listées : le score ne fait jamais semblant de savoir. */
export const SCORE_V1 = Object.freeze({ id: 'score-lecture-v1', poids: Object.freeze({ tendance: 30, rsi: 20, volume: 20, niveaux: 15, carnet: 15 }),
  texte: 'Tendance 30 (haussière 30, neutre 15, baissière 0) + RSI 20 × RSI/100 + volume net 10 + 10 × net/total + niveaux 15 × (résistance − prix)/(résistance − support) + carnet 15 × part des acheteurs. Donnée inconnue = moitié des points.',
  mention: 'synthèse de lecture, pas une prévision' });
const borne = (x, a, b) => Math.max(a, Math.min(b, x));
export function score({ tendance = null, rsi: r = null, volNet: v = null, prix = null, support = null, resistance = null, acheteurs = null } = {}) {
  const P = SCORE_V1.poids, c = {}, inconnues = [];
  c.tendance = tendance === 'haussière' ? 30 : tendance === 'baissière' ? 0 : 15; if (!tendance || tendance === 'inconnue') inconnues.push('tendance');
  if (Number.isFinite(r)) c.rsi = P.rsi * borne(r, 0, 100) / 100; else { c.rsi = P.rsi / 2; inconnues.push('RSI'); }
  if (v && Number.isFinite(v.part)) c.volume = borne(10 + 10 * v.part, 0, 20); else { c.volume = 10; inconnues.push('volume net'); }
  if (prix > 0 && support != null && resistance != null && resistance > support) c.niveaux = P.niveaux * borne((resistance - prix) / (resistance - support), 0, 1); else { c.niveaux = P.niveaux / 2; inconnues.push('niveaux'); }
  if (Number.isFinite(acheteurs)) c.carnet = P.carnet * borne(acheteurs, 0, 1); else { c.carnet = P.carnet / 2; inconnues.push('carnet'); }
  const total = Math.round(c.tendance + c.rsi + c.volume + c.niveaux + c.carnet);
  return { total, composantes: c, inconnues, couleur: total >= 60 ? 'haut' : total <= 40 ? 'bas' : 'neutre', mot: total >= 60 ? 'pression acheteuse' : total <= 40 ? 'pression vendeuse' : 'équilibre' };
}
export function detailScore(s) {
  const f = x => x.toFixed(1).replace('.', ',');
  return `Score ${s.total}/100 (${SCORE_V1.id}) : tendance ${f(s.composantes.tendance)}/30, RSI ${f(s.composantes.rsi)}/20, volume net ${f(s.composantes.volume)}/20, niveaux ${f(s.composantes.niveaux)}/15, carnet ${f(s.composantes.carnet)}/15${s.inconnues.length ? ` · inconnu (moitié des points) : ${s.inconnues.join(', ')}` : ''}. Formule : ${SCORE_V1.texte} ${SCORE_V1.mention}.`;
}

/* ── une colonne du tableau (une unité) ── */
export function tendanceUnite(B, m) {
  const i = B.length - 1; if (i < 21 || m[i] == null || m[i - 20] == null) return { sens: 'inconnue', raison: 'moins de 220 bougies pour la SMA 200' };
  const au = B[i].c > m[i], pente = m[i] - m[i - 20];
  return { sens: au && pente > 0 ? 'haussière' : !au && pente < 0 ? 'baissière' : au ? 'haussière' : 'baissière', raison: `prix ${au ? 'au-dessus' : 'au-dessous'} de la SMA 200 de l’unité${(au && pente < 0) || (!au && pente > 0) ? ' (pente contraire : faible)' : ''}`, faible: (au && pente < 0) || (!au && pente > 0) };
}
export function colonne({ B = [], niveaux = [], vol = null, acheteurs = null, prix = null } = {}) {
  const K = B.filter(b => !b.bande); if (K.length < 20) return { pret: false, raison: 'pas assez de bougies' };
  const m = sma(K, 200), px = prix > 0 ? prix : K[K.length - 1].c, t = tendanceUnite(K, m), r = derniere(rsi(K, 14));
  const { support, resistance } = niveauxProches(px, niveaux), vn = volNet(vol);
  const sc = score({ tendance: t.sens === 'inconnue' ? null : (t.faible ? 'neutre' : t.sens), rsi: r, volNet: vn, prix: px, support, resistance, acheteurs });
  const mini = K.slice(-60).map(b => b.c), miniMa = m.slice(-60);
  return { pret: true, prix: px, tendance: t, sma200: m[m.length - 1], rsi: r, volNet: vn, support, resistance, score: sc, mini, miniMa };
}
/* colonne « Global » : pondérations écrites (M5 1, M15 1, H1 2, Jour 3) */
export const POIDS_GLOBAL = Object.freeze({ M5: 1, M15: 1, H1: 2, J: 3 });
export function colonneGlobale(cols, prix) {
  const L = Object.entries(cols).filter(([u, c]) => c && c.pret && POIDS_GLOBAL[u]); if (!L.length) return { pret: false, raison: 'aucune unité prête' };
  let w = 0, s = 0, rs = 0, wr = 0, sens = 0;
  for (const [u, c] of L) { const p = POIDS_GLOBAL[u]; w += p; s += p * c.score.total; if (Number.isFinite(c.rsi)) { rs += p * c.rsi; wr += p; } sens += p * (c.tendance.sens === 'haussière' ? 1 : c.tendance.sens === 'baissière' ? -1 : 0); }
  const tous = L.flatMap(([, c]) => [c.support, c.resistance]).filter(x => x != null).map(p => ({ p }));
  const px = prix > 0 ? prix : L[0][1].prix, { support, resistance } = niveauxProches(px, tous), total = Math.round(s / w), j = cols.J && cols.J.pret ? cols.J : null;
  return { pret: true, prix: px, tendance: { sens: sens > 0.25 * w ? 'haussière' : sens < -0.25 * w ? 'baissière' : 'neutre', raison: 'majorité pondérée des unités (M5 1, M15 1, H1 2, Jour 3)' },
    rsi: wr ? rs / wr : null, volNet: j ? j.volNet : null, support, resistance,
    score: { total, couleur: total >= 60 ? 'haut' : total <= 40 ? 'bas' : 'neutre', mot: total >= 60 ? 'pression acheteuse' : total <= 40 ? 'pression vendeuse' : 'équilibre', moyenne: true, inconnues: [] } };
}

/* ── santé : rang historique de l'ATR (percentile de l'ATR actuel dans tout l'historique chargé) ── */
export function rangAtr(B, n = 14) {
  const K = B.filter(b => !b.bande); if (K.length < n + 30) return null;
  const A = atr(K, n).filter(x => x != null), a = A[A.length - 1]; let k = 0; for (const x of A) if (x <= a) k++;
  return { atr: a, rang: Math.round(k / A.length * 100), n: A.length, serie: A.slice(-200) };
}
export function volumesRecents(B, n = 50) { const K = B.filter(b => !b.bande).slice(-n); const v = K.map(b => b.v).filter(Number.isFinite), s = v.slice().sort((a, b) => a - b); return { v, mediane: s.length ? s[s.length >> 1] : null }; }

/* ── séances (heures locales de chaque place, changement d'heure compris) ── */
export const SEANCES = Object.freeze([
  { id: 'asie', nom: 'Asie (Tokyo)', tz: 'Asia/Tokyo', debut: [9, 0], fin: [18, 0] },
  { id: 'londres', nom: 'Londres', tz: 'Europe/London', debut: [8, 0], fin: [16, 30] },
  { id: 'ny', nom: 'New York', tz: 'America/New_York', debut: [9, 30], fin: [16, 0] }
]);
function decalage(tz, t) {   // minutes à ajouter à l'UTC pour obtenir l'heure locale de tz
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60e3) * 60e3) / 60e3);
}
/* bornes UTC d'une séance pour le jour local contenant t */
function bornes(S, t) {
  const d = decalage(S.tz, t), loc = new Date(t + d * 60e3), j = Date.UTC(loc.getUTCFullYear(), loc.getUTCMonth(), loc.getUTCDate());
  return [j + (S.debut[0] * 60 + S.debut[1] - d) * 60e3, j + (S.fin[0] * 60 + S.fin[1] - d) * 60e3, loc.getUTCDay()];
}
export function seances(t = Date.now()) {
  return SEANCES.map(S => {
    let [a, b, jour] = bornes(S, t); const ouvre = t >= a && t < b && jour !== 0 && jour !== 6;
    let prochaine = null; if (!ouvre) { for (let k = 0; k < 4 && !prochaine; k++) { const [a2, , j2] = bornes(S, t + k * 86400e3); if (a2 > t && j2 !== 0 && j2 !== 6) prochaine = a2; } }
    return { ...S, ouverte: ouvre, debutUtc: a, finUtc: b, fermeDans: ouvre ? b - t : null, ouvreDans: prochaine ? prochaine - t : null, weekend: jour === 0 || jour === 6 };
  });
}

/* ── corrélation de Pearson des rendements journaliers, alignés par date (UTC) ── */
const jourUtc = t => new Date(t).toISOString().slice(0, 10);
export function correlation(A, B, n = 60) {
  const mb = new Map(B.map(p => [jourUtc(p.t), p.c])), L = [];
  for (const p of A) { const c = mb.get(jourUtc(p.t)); if (c > 0 && p.c > 0) L.push([p.c, c]); }
  const R = []; for (let i = 1; i < L.length; i++) R.push([Math.log(L[i][0] / L[i - 1][0]), Math.log(L[i][1] / L[i - 1][1])]);
  const X = R.slice(-n); if (X.length < 20) return { r: null, n: X.length };
  const mx = X.reduce((s, x) => s + x[0], 0) / X.length, my = X.reduce((s, x) => s + x[1], 0) / X.length;
  let sxy = 0, sx = 0, sy = 0; for (const [x, y] of X) { sxy += (x - mx) * (y - my); sx += (x - mx) ** 2; sy += (y - my) ** 2; }
  return { r: sx > 0 && sy > 0 ? sxy / Math.sqrt(sx * sy) : null, n: X.length };
}
export const motCorrelation = r => r == null ? 'inconnue' : Math.abs(r) < 0.2 ? 'quasi nulle' : `${Math.abs(r) < 0.5 ? 'faible' : Math.abs(r) < 0.75 ? 'nette' : 'forte'} ${r > 0 ? 'positive' : 'négative'}`;

/* ── COT complet (lignes brutes CFTC « Legacy futures only », du plus récent au plus ancien) ── */
const ent = x => { const v = Number(x); return Number.isFinite(v) ? v : null; };
export const CATEGORIES_COT = Object.freeze([
  { id: 'spec', nom: 'Spéculateurs (non commerciaux)', l: 'noncomm_positions_long_all', s: 'noncomm_positions_short_all' },
  { id: 'comm', nom: 'Commerciaux (couvertures)', l: 'comm_positions_long_all', s: 'comm_positions_short_all' },
  { id: 'petits', nom: 'Petits porteurs (non déclarants)', l: 'nonrept_positions_long_all', s: 'nonrept_positions_short_all' }
]);
export function cotComplet(lignes, nom = '') {
  const R = (Array.isArray(lignes) ? lignes : []).map(o => ({ date: String(o.report_date_as_yyyy_mm_dd || '').slice(0, 10), oi: ent(o.open_interest_all), c: Object.fromEntries(CATEGORIES_COT.map(k => [k.id, { long: ent(o[k.l]), short: ent(o[k.s]) }])) }))
    .filter(x => x.date && x.oi > 0).sort((a, b) => a.date < b.date ? -1 : 1);
  if (!R.length) return null;
  const d = R[R.length - 1], p = R.length > 1 ? R[R.length - 2] : null;
  const categories = CATEGORIES_COT.map(k => { const x = d.c[k.id], net = x.long != null && x.short != null ? x.long - x.short : null, y = p && p.c[k.id], netP = y && y.long != null ? y.long - y.short : null;
    return { id: k.id, nom: k.nom, long: x.long, short: x.short, net, variation: net != null && netP != null ? net - netP : null, varLong: p && x.long != null && y.long != null ? x.long - y.long : null, varShort: p && x.short != null && y.short != null ? x.short - y.short : null,
      pctOi: net != null ? net / d.oi * 100 : null, pctLong: x.long != null ? x.long / d.oi * 100 : null, pctShort: x.short != null ? x.short / d.oi * 100 : null }; });
  const serie = R.map(x => ({ date: x.date, oi: x.oi, ...Object.fromEntries(CATEGORIES_COT.map(k => [k.id, x.c[k.id].long != null ? x.c[k.id].long - x.c[k.id].short : null])) }));
  const nets = serie.map(x => x.spec).filter(x => x != null), centile = nets.length ? Math.round(nets.filter(v => v <= categories[0].net).length / nets.length * 100) : null;
  const publication = (() => { const t = Date.parse(d.date + 'T00:00:00Z') + 3 * 86400e3; return new Date(t).toISOString().slice(0, 10); })();
  return { nom, date: d.date, publication, oi: d.oi, oiVar: p ? d.oi - p.oi : null, categories, serie, centile, semaines: R.length,
    lecture: categories[0].net == null ? null : `spéculateurs nets ${categories[0].net > 0 ? 'acheteurs' : 'vendeurs'}${categories[0].variation != null ? `, ${categories[0].variation > 0 ? 'en hausse' : categories[0].variation < 0 ? 'en baisse' : 'stables'} sur la semaine` : ''}${centile != null ? `, ${centile}e centile sur ${R.length} semaines` : ''}` };
}

/* ── calendrier de la semaine COMPLET (tous les impacts ; filtre par devise et par impact) ── */
export const IMPACTS = Object.freeze({ fort: 3, moyen: 2, faible: 1, ferie: 0 });
export function calendrierSemaine(liste) {
  return (Array.isArray(liste) ? liste : []).map(e => ({ t: Date.parse(e.date), devise: String(e.country || '').toUpperCase(), impact: /high/i.test(e.impact) ? 'fort' : /medium/i.test(e.impact) ? 'moyen' : /holiday/i.test(e.impact) ? 'ferie' : 'faible', titre: String(e.title || ''), prevu: e.forecast || null, precedent: e.previous || null, reel: e.actual || null }))
    .filter(e => Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
}
export function filtrerCalendrier(L, { devises = [], impactMin = 'faible' } = {}) { const m = IMPACTS[impactMin] ?? 1; return L.filter(e => (!devises.length || devises.includes(e.devise)) && (IMPACTS[e.impact] ?? 0) >= m); }
export function compteARebours(ms) { if (ms == null || ms < 0) return '—'; const s = Math.floor(ms / 1000), j = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return j ? `${j} j ${h} h ${String(m).padStart(2, '0')}` : h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(ss).padStart(2, '0')} s`; }

/* ── entreprises et instruments liés (listes FIXES choisies par Rayle, pas des compositions officielles) ── */
export const LIES = Object.freeze({
  NASDAQ: { titre: 'Plus grosses pondérations du Nasdaq 100', note: 'liste fixe des plus grosses capitalisations de l’indice ; les pondérations exactes ne sont pas servies par une source gratuite', syms: ['NVDA', 'MSFT', 'AAPL', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA'] },
  OR: { titre: 'Mineurs d’or et ETF', note: 'ETF adossés à l’or (GLD, IAU), panier de mineurs (GDX) et grands mineurs', syms: ['GLD', 'IAU', 'GDX', 'NEM', 'AEM', 'WPM'] },
  BTC: { titre: 'Plus gros acteurs du Bitcoin', note: 'ETF au comptant, trésorerie d’entreprise, plateforme, mineur', syms: ['IBIT', 'MSTR', 'COIN', 'MARA', 'HOOD'] },
  SOL: { titre: 'Acteurs de la crypto liés à Solana', note: 'pas de grande entreprise cotée centrée sur Solana dans une source gratuite fiable : acteurs du marché crypto et prix de référence', syms: ['COIN', 'HOOD', 'SOL-USD', 'BTC-USD'] },
  DOGE: { titre: 'Acteurs de la crypto liés à Dogecoin', note: 'aucune entreprise cotée centrée sur Dogecoin dans une source gratuite fiable : acteurs du marché crypto et prix de référence', syms: ['COIN', 'HOOD', 'DOGE-USD', 'BTC-USD'] }
});
export const CORRELES = Object.freeze({
  OR: [['DX-Y.NYB', 'Dollar (DXY)'], ['^TNX', 'Taux US 10 ans'], ['^GSPC', 'S&P 500'], ['BTC-USD', 'Bitcoin']],
  NASDAQ: [['DX-Y.NYB', 'Dollar (DXY)'], ['^TNX', 'Taux US 10 ans'], ['^GSPC', 'S&P 500'], ['GC=F', 'Or']],
  BTC: [['DX-Y.NYB', 'Dollar (DXY)'], ['^TNX', 'Taux US 10 ans'], ['^NDX', 'Nasdaq 100'], ['GC=F', 'Or']],
  SOL: [['BTC-USD', 'Bitcoin'], ['DX-Y.NYB', 'Dollar (DXY)'], ['^NDX', 'Nasdaq 100'], ['^TNX', 'Taux US 10 ans']],
  DOGE: [['BTC-USD', 'Bitcoin'], ['DX-Y.NYB', 'Dollar (DXY)'], ['^NDX', 'Nasdaq 100'], ['^TNX', 'Taux US 10 ans']]
});
export const variationJour = c => c && c.prix > 0 && c.veille > 0 ? (c.prix / c.veille - 1) * 100 : null;
