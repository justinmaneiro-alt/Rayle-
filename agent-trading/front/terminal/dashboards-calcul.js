/* ═════════════ TERMINAL : CALCULS DES DASHBOARDS (pur, testé) ═════════════
   COT : CFTC « Legacy futures only » par la route /cot du Worker de Rayle (déjà en ligne) : or (COMEX), Nasdaq 100 E-mini, Bitcoin (CME).
         Solana et Dogecoin : AUCUN contrat suivi par ce rapport → « pas de rapport COT pour cet actif » (jamais un chiffre d'un autre actif).
   Calendrier : flux de la semaine de ForexFactory (nfs.faireconomy.media) par la route /calendar du Worker, gratuit, sans clé ; seuls les
         impacts fort et moyen des devises USD, EUR, GBP, JPY, CNY. Heure de Paris.
   Actualités : sujets « monde » du Worker (/actualites/fil?portee=monde), filtrés par mots de la finance et de l'actif. */

const sans = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const COT_ABSENT = Object.freeze({ SOL: 'Pas de rapport COT pour Solana (aucun contrat suivi par la CFTC dans ce rapport).', DOGE: 'Pas de rapport COT pour Dogecoin (aucun contrat suivi par la CFTC dans ce rapport).' });

export function resumeCot(d) {
  if (!d || !d.stats || !d.stats.derniere) return null;
  const s = d.stats, x = s.derniere;
  return {
    nom: d.nom, date: x.date, publication: x.publication || null, source: d.source,
    pctOi: x.pct_oi ?? null, oi: x.oi ?? null,
    categories: [
      { nom: 'Spéculateurs (non-commerciaux)', long: x.long, short: x.short, net: x.net },
      { nom: 'Commerciaux (couvertures)', long: null, short: null, net: x.commerciaux_net ?? null }
    ],
    variation1: s.variation_semaine ?? null, variation4: s.variation_4_semaines ?? null, centile1an: s.percentile_1an ?? null, centile3ans: s.percentile_3ans ?? null, lecture: s.lecture || null,
    serie: Array.isArray(d.serie) ? d.serie.map(p => ({ date: p.date, net: p.net ?? null, commerciaux: p.commerciaux_net ?? null })).filter(p => p.net != null) : []
  };
}

const DEVISES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY'];
/* annonces à venir (et du jour passées depuis moins de 2 h) ; impact fort et moyen */
export function annonces(liste, { maintenant = Date.now(), devises = DEVISES, horizon = 7 * 86400e3 } = {}) {
  return (Array.isArray(liste) ? liste : []).map(e => ({ t: Date.parse(e.date), devise: String(e.country || '').toUpperCase(), impact: /high/i.test(e.impact) ? 'fort' : /medium/i.test(e.impact) ? 'moyen' : 'faible', titre: String(e.title || ''), prevu: e.forecast || null, precedent: e.previous || null, reel: e.actual || null }))
    .filter(e => Number.isFinite(e.t) && devises.includes(e.devise) && e.impact !== 'faible' && e.t >= maintenant - 2 * 3600e3 && e.t <= maintenant + horizon)
    .sort((a, b) => a.t - b.t);
}
export const prochaine = (L, maintenant = Date.now(), impact = 'fort') => L.find(e => e.t >= maintenant && (!impact || e.impact === impact)) || null;
export function dansMinutes(e, maintenant = Date.now()) { return e ? Math.round((e.t - maintenant) / 60e3) : null; }

const MOTS_FIN = ['bourse', 'marche', 'fed', 'bce', 'banque centrale', 'inflation', 'taux', 'dollar', 'wall street', 'nasdaq', 'action', 'crypto', 'bitcoin', 'or ', "l'or", 'petrole', 'recession', 'emploi', 'pib', 'obligation', 'tresor', 'trump', 'droits de douane', 'tarif', 'economie', 'economique'];
const MOTS_ACTIF = { OR: ['or ', "l'or", 'gold', 'metal', 'once'], NASDAQ: ['nasdaq', 'tech', 'nvidia', 'apple', 'microsoft', 'wall street', 'actions'], BTC: ['bitcoin', 'crypto', 'btc'], SOL: ['solana', 'crypto'], DOGE: ['dogecoin', 'doge', 'crypto', 'musk'] };
export function actusFinance(sujets, actif = null, max = 12) {
  const L = (Array.isArray(sujets) ? sujets : []).map(s => { const src = Array.isArray(s.sources) ? s.sources : []; return { titre: s.titre || s.title || '', resume: s.resume || '', categorie: s.categorie || '', t: Date.parse((src[0] && src[0].date) || s.date || '') || null, medias: src.map(x => x.nom).filter(Boolean), lien: (src[0] && src[0].url) || s.lien || null }; })
    .filter(s => s.titre);
  const score = s => { const x = ' ' + sans(s.titre + ' ' + s.resume) + ' '; let k = 0; for (const m of MOTS_FIN) if (x.includes(m)) k++; if (/econ|financ|bourse/.test(sans(s.categorie))) k += 2; if (actif && MOTS_ACTIF[actif]) for (const m of MOTS_ACTIF[actif]) if (x.includes(m)) k += 3; return k; };
  return L.map(s => ({ ...s, score: score(s) })).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, max);
}
