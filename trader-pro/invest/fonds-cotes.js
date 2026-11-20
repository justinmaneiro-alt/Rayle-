/* ═════════════ FONDS COTÉS ET VÉHICULES (module PUR, testé) : fonds fermés, investment trusts, holdings d'investissement, SPAC, trackers ═════════════
   Ce ne sont pas des entreprises : leur valeur est celle de leurs placements (valeur liquidative, NAV), pas un flux de trésorerie d'exploitation. Les juger par DCF / multiples n'a pas de sens.
   Ils sont classés à part (classe « fonds coté ») et jugés sur leur DÉCOTE OU PRIME par rapport à la valeur liquidative quand la donnée existe ; sinon : aucun verdict de valorisation.
   Détection (sans cookie ni source payante) à partir de ce que publie l'index : industrie Yahoo, nom, marge nette (un trust a une « marge » proche de 100 % : son résultat = ses plus-values), cours / valeur comptable. */
const fin = x => typeof x === 'number' && Number.isFinite(x);
export const CLASSE_FONDS = 'fonds coté';
export const TYPES_FONDS = Object.freeze({ 'fonds-ferme': 'Fonds fermé / investment trust', holding: 'Holding d’investissement', spac: 'SPAC (société vide)', tracker: 'Tracker / ETF' });
const INDUSTRIE_FONDS = /closed-end|exchange traded fund|blank check/i, INDUSTRIE_SPAC = /shell compan/i;
const NOM_SPAC = /\b(acquisition corp|acquisition co|spac|blank check)\b/i, NOM_TRACKER = /\b(etf|etc|etn|index fund|tracker|ishares|spdr|xtrackers|lyxor)\b/i;
const NOM_FONDS = /\b(trust|fund|invmt|investment (?:trust|company|co)|equity investment|inv\.? (?:trust|co)|income|growth & income|smaller compan|emerging|infrastructure|private equity|opportunit|total return|capital partners|macro|healthcare|biotech)\b/i;
const NOM_BDC = /\b(capital|investment) corp(?:oration)?\b/i, NOM_GESTIONNAIRE = /\b(management|financial|group|holdings?|partners|advisors?)\b/i;   // BDC : société de développement d'entreprises cotée = fonds fermé réglementé
/* holdings d'investissement cotées (valorisées avec une décote sur leurs participations, pas par un DCF d'exploitation) */
const HOLDINGS = [/^investor\b/i, /^industriv/i, /^kinnevik\b/i, /^latour\b/i, /^l e lundberg|^lundberg/i, /^exor\b/i, /^wendel\b/i, /^groupe bruxelles lambert|^gbl\b/i, /^sofina\b/i, /^eurazeo\b/i, /^bure equity\b/i, /^melker schorling\b/i, /^pargesa\b/i, /^investment ab (?:latour|oresund)/i, /^oresund\b/i];

/* ligne de l'index → { type, raison } ou null ; ne regarde que les « actions » du catalogue */
export function typeFondCote(l) {
  if (!l || (l.c !== 'action' && l.c !== CLASSE_FONDS)) return null; const n = String(l.n || ''), ind = String(l.i || ''), r = l.r || {}, m = r.margeNette;
  if (INDUSTRIE_SPAC.test(ind) || NOM_SPAC.test(n)) return { type: 'spac', raison: 'société vide (SPAC) : aucune activité à valoriser' };
  if (INDUSTRIE_FONDS.test(ind)) return { type: 'fonds-ferme', raison: 'industrie « ' + ind + ' »' };
  if (NOM_TRACKER.test(n) && !/\bgroup\b/i.test(n)) return { type: 'tracker', raison: 'nom d’ETF ou de tracker' };
  if (HOLDINGS.some(re => re.test(n))) return { type: 'holding', raison: 'holding d’investissement cotée (valorisée sur ses participations)' };
  if (/asset management/i.test(ind)) {
    if (fin(m) && m >= 0.8) return { type: 'fonds-ferme', raison: 'gestion d’actifs dont le « résultat » est ' + Math.round(m * 100) + ' % des produits : un véhicule d’investissement, pas un gestionnaire' };
    if (NOM_BDC.test(n) && !NOM_GESTIONNAIRE.test(n)) return { type: 'fonds-ferme', raison: 'société de développement d’entreprises (BDC) : fonds fermé coté, valorisé sur sa valeur liquidative' };
    if (NOM_FONDS.test(n) && (!fin(m) || m >= 0.45 || m < 0)) return { type: 'fonds-ferme', raison: 'nom de fonds / trust, gestion d’actifs' };
  }
  return null;
}
/* applique la classification : renvoie de nouvelles lignes (les autres sont inchangées) ; décote / prime = cours / valeur liquidative − 1 quand `nav` est connu */
export function appliquerFondsCotes(lignes) {
  return (lignes || []).map(l => {
    const t = typeFondCote(l); if (!t) return l;
    const nav = fin(l.nav) && l.nav > 0 ? l.nav : null, decote = nav && fin(l.px) ? l.px / nav - 1 : null;
    return { ...l, c: CLASSE_FONDS, c0: l.c === CLASSE_FONDS ? l.c0 || 'action' : l.c, fc: { ...t, nav, decote }, r: decote != null ? { ...(l.r || {}), decote } : l.r };
  });
}
/* verdict de valorisation d'un fonds coté : seulement sur la décote / prime ; sans valeur liquidative : null (aucun verdict) */
export function jugementDecote(l) {
  const d = l && l.fc && fin(l.fc.decote) ? l.fc.decote : null; if (d == null) return null;
  return d <= -0.10 ? { niveau: 'decote-forte', texte: `décote de ${Math.round(-d * 100)} % sur la valeur liquidative` } : d <= -0.03 ? { niveau: 'decote', texte: `décote de ${Math.round(-d * 100)} %` } : d < 0.03 ? { niveau: 'proche', texte: 'cours proche de la valeur liquidative' } : { niveau: 'prime', texte: `prime de ${Math.round(d * 100)} % sur la valeur liquidative` };
}
export const phraseFonds = l => {
  const t = TYPES_FONDS[l && l.fc && l.fc.type] || 'Fonds coté', j = jugementDecote(l);
  return `${t} : ce n’est pas une entreprise. ${j ? 'Jugé sur sa décote / prime : ' + j.texte + '.' : 'Valeur liquidative indisponible : aucun verdict de valorisation, seulement la tendance et le risque.'}`;
};
