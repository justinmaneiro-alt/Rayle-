/* ═════════════ TAUX, INFLATION ET EMPLOI (M2b ; module pur, testé : finance-test.mjs) ═════════════
   Sources gratuites, OFFICIELLES, sans clé :
   - Trésor américain : courbe quotidienne des taux (CSV, CORS ouvert) → 1 mois à 30 ans ; 2 / 10 / 30 ans et écarts. Donnée de FIN DE JOURNÉE (publiée le soir à New York) : DIFFÉRÉ.
   - BLS (Bureau of Labor Statistics) API v1 sans clé (25 requêtes par jour et par adresse, CORS ouvert) : indice des prix à la consommation (CPI), taux de chômage, emplois salariés : valeurs OFFICIELLES
     de la publication du mois.
   - FRED (Réserve fédérale de Saint-Louis) en CSV public via le Worker, pour d'autres séries (facultatif).
   Rien n'est inventé : une valeur absente est dite absente. Les chiffres du Trésor et du BLS sont ceux publiés ; Rayle ne les « corrige » pas. */
export const URL_TRESOR = annee => 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/' + annee + '/all?type=daily_treasury_yield_curve&field_tdr_date_value=' + annee + '&page&_format=csv';
export const URL_BLS = serie => 'https://api.bls.gov/publicAPI/v1/timeseries/data/' + serie;
export const SERIES_BLS = { cpi_sa: 'CUSR0000SA0', cpi_nsa: 'CUUR0000SA0', cpi_coeur_sa: 'CUSR0000SA0L1E', chomage: 'LNS14000000', emplois: 'CES0000000001' };
const ECHEANCES = { '1 Mo': '1M', '1.5 Month': '1.5M', '2 Mo': '2M', '3 Mo': '3M', '4 Mo': '4M', '6 Mo': '6M', '1 Yr': '1Y', '2 Yr': '2Y', '3 Yr': '3Y', '5 Yr': '5Y', '7 Yr': '7Y', '10 Yr': '10Y', '20 Yr': '20Y', '30 Yr': '30Y' };
export const ECHEANCES_AFFICHEES = ['3M', '2Y', '5Y', '10Y', '30Y'];

const decouperCsv = ligne => { const out = []; let cur = '', q = false; for (const ch of ligne) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
/* CSV du Trésor → [{ date: 'AAAA-MM-JJ', y: { '2Y': 4.81, … } }] du plus ancien au plus récent. */
export function analyserTresor(csv) {
  const lignes = String(csv).split(/\r?\n/).filter(Boolean); if (lignes.length < 2) return [];
  const ent = decouperCsv(lignes[0]).map(s => s.trim()), out = [];
  for (let k = 1; k < lignes.length; k++) {
    const c = decouperCsv(lignes[k]), m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec((c[0] || '').trim()); if (!m) continue;
    const y = {}; ent.forEach((h, i) => { const e = ECHEANCES[h]; const v = parseFloat(c[i]); if (e && Number.isFinite(v)) y[e] = v; });
    if (Object.keys(y).length) out.push({ date: m[3] + '-' + m[1] + '-' + m[2], y });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
const bps = x => (x == null ? null : Math.round(x * 100));
/* Courbe : dernier jour, variations (jour, semaine, mois en points de base), écarts 2s10s, 10s30s, 3m10a, et état d'inversion. */
export function analyserCourbe(jours) {
  if (!jours.length) return null;
  const der = jours[jours.length - 1], at = n => jours[Math.max(0, jours.length - 1 - n)], ecart = (j, a, b) => (j.y[a] != null && j.y[b] != null ? j.y[b] - j.y[a] : null);
  const lignes = ECHEANCES_AFFICHEES.filter(e => der.y[e] != null).map(e => ({ echeance: e, taux: der.y[e], jour: bps(der.y[e] - at(1).y[e]), semaine: bps(der.y[e] - at(5).y[e]), mois: bps(der.y[e] - at(21).y[e]) }));
  const e2s10 = ecart(der, '2Y', '10Y'), e10s30 = ecart(der, '10Y', '30Y'), e3m10 = ecart(der, '3M', '10Y');
  return { date: der.date, lignes, ecarts: { '2s10s': bps(e2s10), '10s30s': bps(e10s30), '3m10a': bps(e3m10) }, inversion2s10s: e2s10 != null && e2s10 < 0, inversion3m10a: e3m10 != null && e3m10 < 0,
    serie10: jours.slice(-260).map(j => [j.date, j.y['10Y']]).filter(x => x[1] != null), serie2: jours.slice(-260).map(j => [j.date, j.y['2Y']]).filter(x => x[1] != null), historique: jours.slice(-260) };
}

/* ── BLS : réponse API → points { annee, mois (1-12), valeur } du plus récent au plus ancien ── */
export function analyserBls(j) {
  const s = j && j.Results && j.Results.series && j.Results.series[0]; if (!s || !Array.isArray(s.data)) return null;
  return s.data.filter(d => /^M(0[1-9]|1[0-2])$/.test(d.period)).map(d => ({ annee: +d.year, mois: +d.period.slice(1), valeur: parseFloat(d.value) })).filter(d => Number.isFinite(d.valeur));
}
const trouver = (pts, annee, mois) => pts.find(p => p.annee === annee && p.mois === mois) || null;
const moisPrec = (annee, mois, n = 1) => { const k = annee * 12 + (mois - 1) - n; return { annee: Math.floor(k / 12), mois: (k % 12) + 1 }; };
const pct1 = x => (Math.round(x * 10) / 10).toFixed(1) + '%';
/* Inflation en glissement mensuel et annuel pour un mois de référence. */
export function inflationMois(ptsSA, ptsNSA, annee, mois) {
  const cur = trouver(ptsSA, annee, mois), p = moisPrec(annee, mois), prec = cur && trouver(ptsSA, p.annee, p.mois);
  const curN = ptsNSA && trouver(ptsNSA, annee, mois), an = curN && trouver(ptsNSA, annee - 1, mois);
  return { mensuel: cur && prec ? (cur.valeur / prec.valeur - 1) * 100 : null, annuel: curN && an ? (curN.valeur / an.valeur - 1) * 100 : null };
}
/* « Réel » d'un événement du calendrier d'après le BLS, ou null. `ref` = mois de référence = mois qui précède la publication (CPI, emploi). Formats identiques à ceux du calendrier public. */
export function reelBls(titre, dateEvt, donnees) {
  const d = new Date(dateEvt), ref = moisPrec(d.getUTCFullYear(), d.getUTCMonth() + 1), t = String(titre || '');
  if (/^CPI m\/m$/i.test(t) && donnees.cpi_sa) { const r = inflationMois(donnees.cpi_sa, donnees.cpi_nsa, ref.annee, ref.mois); return r.mensuel == null ? null : pct1(r.mensuel); }
  if (/^CPI y\/y$/i.test(t) && donnees.cpi_nsa) { const r = inflationMois(donnees.cpi_sa || [], donnees.cpi_nsa, ref.annee, ref.mois); return r.annuel == null ? null : pct1(r.annuel); }
  if (/^Core CPI m\/m$/i.test(t) && donnees.cpi_coeur_sa) { const r = inflationMois(donnees.cpi_coeur_sa, null, ref.annee, ref.mois); return r.mensuel == null ? null : pct1(r.mensuel); }
  if (/^Unemployment Rate$/i.test(t) && donnees.chomage) { const c = trouver(donnees.chomage, ref.annee, ref.mois); return c ? pct1(c.valeur) : null; }
  if (/^Non-Farm Employment Change$/i.test(t) && donnees.emplois) { const c = trouver(donnees.emplois, ref.annee, ref.mois), p = moisPrec(ref.annee, ref.mois), q = trouver(donnees.emplois, p.annee, p.mois); return c && q ? (c.valeur - q.valeur >= 0 ? '' : '-') + Math.abs(Math.round(c.valeur - q.valeur)) + 'K' : null; }
  return null;
}

/* Phrases parlées. */
const fr = (x, d = 2) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
export function phraseTaux(c) {
  if (!c) return 'Je n’ai pas la courbe des taux pour le moment.';
  const g = e => { const l = c.lignes.find(x => x.echeance === e); return l ? fr(l.taux) + ' pour cent' : 'inconnu'; };
  const e = c.ecarts['2s10s'];
  return 'Courbe des taux américains au ' + new Date(c.date + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }) + ' : deux ans ' + g('2Y') + ', dix ans ' + g('10Y') + ', trente ans ' + g('30Y') + '.'
    + (e == null ? '' : ' L’écart dix ans moins deux ans est de ' + e + ' points de base' + (c.inversion2s10s ? ', donc la courbe est inversée entre deux et dix ans.' : '.')) + ' Donnée de fin de journée, source : Trésor américain.';
}
