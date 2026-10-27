/* ═════════════ DÉPÔTS DE LA SEC (EDGAR) POUR LES GRANDES ENTREPRISES (M2b ; module pur, testé : finance-test.mjs) ═════════════
   Source : data.sec.gov/submissions/CIK##########.json (officielle, gratuite, sans clé) via la route /finance/brut?id=sec:<SYMBOLE> du Worker (la SEC demande un en-tête User-Agent honnête que le navigateur ne peut pas fixer).
   On lit le tableau « filings.recent » : type de formulaire, date de dépôt, rubriques (« items ») des 8-K, document principal. Les liens pointent vers sec.gov.
   Ce sont des FAITS déposés par l'entreprise (pas des analyses). Les rubriques des 8-K disent de quoi il s'agit : 2.02 = résultats financiers, 5.02 = départ ou nomination d'un dirigeant, etc. */
export const ITEMS_8K = {
  '1.01': ['accord important conclu', 'fort'], '1.02': ['accord important résilié', 'moyen'], '1.05': ['incident de cybersécurité', 'fort'], '2.01': ['acquisition ou cession d’actifs', 'fort'], '2.02': ['résultats financiers', 'fort'],
  '2.03': ['nouvelle dette importante', 'moyen'], '2.05': ['restructuration (coûts de sortie)', 'moyen'], '2.06': ['dépréciation importante', 'moyen'], '3.01': ['avis de radiation de la cote', 'fort'], '3.02': ['vente de titres non enregistrée', 'faible'],
  '4.01': ['changement de commissaire aux comptes', 'moyen'], '4.02': ['comptes passés à ne plus utiliser (erreur)', 'fort'], '5.01': ['changement de contrôle', 'fort'], '5.02': ['départ ou nomination d’un dirigeant', 'moyen'], '5.03': ['modification des statuts', 'faible'],
  '5.07': ['résultat d’un vote des actionnaires', 'faible'], '7.01': ['information communiquée (Reg FD)', 'faible'], '8.01': ['autre événement', 'faible'], '9.01': ['pièces jointes', 'faible']
};
const FORMULAIRES = { '10-K': 'rapport annuel', '10-Q': 'rapport trimestriel', '8-K': 'événement important', '4': 'transaction d’initié', '3': 'déclaration initiale d’initié', '5': 'déclaration annuelle d’initié', 'DEF 14A': 'procuration (assemblée)', 'SC 13G': 'participation de plus de 5 %', 'SC 13D': 'participation de plus de 5 % (activiste)', '20-F': 'rapport annuel (émetteur étranger)', '6-K': 'information (émetteur étranger)', 'S-8': 'plan d’actions pour salariés', '144': 'avis de vente d’initié' };

/* Réponse « submissions » → liste de dépôts récents { form, libelle, date, items: [{code, libelle, impact}], url, rapport, impact }. */
export function depotsRecents(sub, { max = 30, formulaires = null } = {}) {
  const r = sub && sub.filings && sub.filings.recent; if (!r || !Array.isArray(r.form)) return [];
  const cik = String(parseInt(sub.cik, 10)), out = [];
  for (let i = 0; i < r.form.length && out.length < max; i++) {
    const form = r.form[i]; if (formulaires && !formulaires.includes(form)) continue;
    const items = String(r.items && r.items[i] || '').split(',').map(s => s.trim()).filter(Boolean).map(code => ({ code, libelle: (ITEMS_8K[code] || ['rubrique ' + code, 'faible'])[0], impact: (ITEMS_8K[code] || [0, 'faible'])[1] }));
    const acc = String(r.accessionNumber[i] || '').replace(/-/g, ''), doc = r.primaryDocument && r.primaryDocument[i];
    const important = items.filter(x => x.code !== '9.01');
    out.push({ form, libelle: FORMULAIRES[form] || form, date: r.filingDate[i], rapport: r.reportDate && r.reportDate[i] || null, items, impact: important.some(x => x.impact === 'fort') ? 'fort' : important.some(x => x.impact === 'moyen') ? 'moyen' : 'faible',
      url: acc && doc ? 'https://www.sec.gov/Archives/edgar/data/' + cik + '/' + acc + '/' + doc : null });
  }
  return out;
}
/* Résumé : derniers résultats publiés (8-K rubrique 2.02), nombre de transactions d'initiés (formulaire 4) sur 30 jours, dépôts importants récents. */
export function resumeSec(symbole, nom, depots, maintenant = Date.now()) {
  const il = j => (maintenant - Date.parse(j + 'T12:00:00Z')) / 86400e3;
  const resultats = depots.find(d => d.form === '8-K' && d.items.some(x => x.code === '2.02')) || null;
  const initiés = depots.filter(d => d.form === '4' && il(d.date) <= 30).length;
  const importants = depots.filter(d => d.form === '8-K' && d.impact !== 'faible' && il(d.date) <= 30);
  return { symbole, nom, resultats, initiesTrenteJours: initiés, importants, dernierDepot: depots[0] || null };
}
export function phraseSec(res) {
  if (!res || !res.dernierDepot) return 'Je n’ai pas de dépôt récent à la SEC pour cette entreprise.';
  const j = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  let t = res.nom + ' : dernier dépôt à la SEC le ' + j(res.dernierDepot.date) + ' (' + res.dernierDepot.libelle + ').';
  if (res.resultats) t += ' Derniers résultats déposés le ' + j(res.resultats.date) + '.';
  if (res.importants.length) t += ' Événements importants récents : ' + res.importants.slice(0, 3).map(d => j(d.date) + ', ' + d.items.filter(x => x.code !== '9.01').map(x => x.libelle).join(' et ')).join(' ; ') + '.';
  t += ' ' + res.initiesTrenteJours + ' transaction' + (res.initiesTrenteJours > 1 ? 's' : '') + ' d’initiés déclarée' + (res.initiesTrenteJours > 1 ? 's' : '') + ' en 30 jours. Source : SEC EDGAR.';
  return t;
}
