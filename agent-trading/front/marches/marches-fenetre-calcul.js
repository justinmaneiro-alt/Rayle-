/* Calculs PURS de la fenêtre « Marchés » : alertes de prix locales, regroupement des actualités, lecture des publications publiques (COT), santé du marché. Testés : marches-fenetre-test.mjs. */
export const CLE_ALERTES = 'rayle_marches_alertes';
export const THEMES = Object.freeze([
  ['Banques centrales', /\b(fed|federal reserve|ecb|boj|boe|powell|lagarde|rate (cut|hike)|interest rates?|fomc)\b/i],
  ['Dollar et taux', /\b(dollar|usd|yields?|treasur|bond)/i],
  ['Or et métaux', /\b(gold|silver|bullion|xau|precious|copper)\b/i],
  ['Actions', /\b(stocks?|nasdaq|s&p|equities|wall street|earnings|tech)\b/i],
  ['Crypto', /\b(bitcoin|btc|crypto|ether|solana|etf)\b/i],
  ['Inflation et emploi', /\b(inflation|cpi|payrolls?|jobs|unemployment|gdp|pmi)\b/i],
  ['Énergie et géopolitique', /\b(oil|crude|opec|war|tariffs?|sanctions?|gas)\b/i]
]);
export function regrouperActus(items, max = 40) {
  const groupes = new Map(), autres = [];
  for (const x of (items || []).slice(0, max)) { const t = `${x.titre} ${x.resume || ''}`, th = THEMES.find(([, re]) => re.test(t)); if (th) { if (!groupes.has(th[0])) groupes.set(th[0], []); groupes.get(th[0]).push(x); } else autres.push(x); }
  const L = [...groupes.entries()].map(([theme, items]) => ({ theme, items })).sort((a, b) => b.items.length - a.items.length); if (autres.length) L.push({ theme: 'Autres', items: autres }); return L;
}
/* alertes de prix : { id, actif, sens: 'dessus'|'dessous', niveau, creee, declenchee: null|ms, prixAlors } */
export function validerAlerte(a) {
  if (!a || typeof a !== 'object') return 'alerte invalide'; if (!['dessus', 'dessous'].includes(a.sens)) return 'sens : « au-dessus » ou « en dessous »'; const n = Number(String(a.niveau).replace(',', '.'));
  if (!(n > 0) || !Number.isFinite(n)) return 'niveau : un nombre positif'; if (!a.actif) return 'actif manquant'; return true;
}
export const nouvelleAlerte = (actif, sens, niveau, maintenant = Date.now()) => ({ id: 'a' + maintenant.toString(36) + Math.floor(Math.random() * 1e4).toString(36), actif, sens, niveau: Number(String(niveau).replace(',', '.')), creee: maintenant, declenchee: null });
/* à chaque lecture de prix : renvoie les alertes qui viennent de se déclencher (une seule fois chacune) ; ne modifie pas la liste d'entrée */
export function evaluerAlertes(alertes, cours, maintenant = Date.now()) {
  const sorties = [], suite = (alertes || []).map(a => { if (a.declenchee) return a; const q = cours && cours[a.actif]; if (!q || !Number.isFinite(q.prix)) return a;
    const hit = a.sens === 'dessus' ? q.prix >= a.niveau : q.prix <= a.niveau; if (!hit) return a; const b = { ...a, declenchee: maintenant, prixAlors: q.prix, retard: q.retard || null }; sorties.push(b); return b; });
  return { alertes: suite, declenchees: sorties };
}
export const texteAlerte = (a, nom) => `${nom || a.actif} ${a.sens === 'dessus' ? 'est passé au-dessus de' : 'est passé sous'} ${a.niveau}${a.prixAlors != null ? ' (prix lu : ' + a.prixAlors + (a.retard ? ', ' + a.retard : '') + ')' : ''}`;
/* publications publiques (COT, CFTC) : positions nettes des fonds spéculatifs, variation sur 4 semaines, percentile ; jamais une recommandation */
export function lireCot(d) {
  if (!d || !d.dernier || !d.dernier.spec) return null; const s = d.serie || [], der = d.dernier, il4 = s.length > 4 ? s[s.length - 5] : null;
  return { libelle: d.libelle, date: der.date, net: der.spec.net, var4: il4 && il4.spec ? der.spec.net - il4.spec.net : null, percentile: d.percentileSpec, nomSpec: d.nomSpec, source: d.source, nSemaines: s.length };
}
export const phraseCot = c => (c ? `${c.nomSpec} : position nette ${c.net >= 0 ? 'acheteuse' : 'vendeuse'} de ${Math.abs(c.net).toLocaleString('fr-FR')} contrats au ${c.date}${c.var4 != null ? ' (' + (c.var4 >= 0 ? '+' : '') + c.var4.toLocaleString('fr-FR') + ' en 4 semaines)' : ''}${c.percentile != null ? ', plus haut que ' + c.percentile + ' % des ' + c.nSemaines + ' dernières semaines' : ''}. Publication hebdomadaire de la CFTC (rapport du mardi, publié le vendredi) : un constat, pas un signal.` : 'Publication non disponible pour cet actif.');
/* santé du marché : quelques lignes lues à la source (taux réels, taux de la Fed) + dollar, volatilité */
export function lireSante(sante, cotes) {
  const L = [], der = o => (o && Array.isArray(o.serie) && o.serie.length ? o.serie[o.serie.length - 1] : null), reel = der(sante && sante.reels), fed = der(sante && sante.fed);
  if (reel) L.push({ nom: 'Taux réels US 10 ans (TIPS)', valeur: reel.v, date: reel.date, unite: '%', source: 'Trésor américain' });
  if (fed) L.push({ nom: 'Taux effectif de la Fed (EFFR)', valeur: fed.v, date: fed.date, unite: '%', source: 'Fed de New York' });
  for (const [sym, nom] of [['DX-Y.NYB', 'Indice dollar'], ['^VIX', 'VIX (volatilité)'], ['GLD', 'GLD (ETF or)']]) { const c = cotes && cotes[sym]; if (c && !c.erreur && Number.isFinite(c.prix)) L.push({ nom, valeur: c.prix, variationPct: Number.isFinite(c.veille) && c.veille ? (c.prix / c.veille - 1) * 100 : null, date: c.tPrix ? new Date(c.tPrix).toISOString().slice(0, 10) : null, source: 'Yahoo Finance (différé)' }); }
  return L;
}
