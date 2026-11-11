/* Suivi de portefeuille d'investissement (pur) : positions saisies à la main (ticker, quantité, prix de revient, date, dividendes), prix saisis ou lus (chaque prix porte sa date et sa source).
   Valeur, coût moyen, performance, dividendes, poids par valeur et par secteur, alertes de plafonds (8 % / 30 %). Aucune valeur inventée : un prix absent = « prix non renseigné ». */
export const VERSION = 'portefeuille-v1';
/* operations : [{ type: 'achat' | 'vente' | 'dividende', ticker, secteur?, quantite?, prix?, montant?, date }] ; prix : { ticker: { prix, date, source } } */
export function positions(operations) {
  const P = new Map(); for (const o of operations.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const x = P.get(o.ticker) || { ticker: o.ticker, secteur: o.secteur || null, quantite: 0, cout: 0, dividendes: 0, realise: 0 }; if (o.secteur) x.secteur = o.secteur;
    if (o.type === 'achat') { x.quantite += +o.quantite; x.cout += +o.quantite * +o.prix; } else if (o.type === 'vente') { const pm = x.quantite > 0 ? x.cout / x.quantite : 0; x.realise += +o.quantite * (+o.prix - pm); x.cout -= pm * +o.quantite; x.quantite -= +o.quantite; } else if (o.type === 'dividende') x.dividendes += +o.montant; P.set(o.ticker, x); }
  return [...P.values()].filter(p => p.quantite > 1e-9 || p.dividendes || p.realise);
}
export function valoriser(operations, prix = {}) {
  const L = positions(operations).map(p => { const px = prix[p.ticker], valeur = px && p.quantite > 0 ? p.quantite * px.prix : null, pm = p.quantite > 0 ? p.cout / p.quantite : null;
    return { ...p, coutMoyen: pm, prix: px ? px.prix : null, datePrix: px ? px.date : null, sourcePrix: px ? px.source : null, valeur, plusValue: valeur != null ? valeur - p.cout : null, performance: valeur != null && p.cout > 0 ? valeur / p.cout - 1 : null }; });
  const connus = L.filter(p => p.valeur != null), val = connus.reduce((s, p) => s + p.valeur, 0), cout = L.filter(p => p.quantite > 0).reduce((s, p) => s + p.cout, 0), div = L.reduce((s, p) => s + p.dividendes, 0);
  for (const p of L) p.poids = p.valeur != null && val > 0 ? p.valeur / val : null; const sect = {}; for (const p of connus) sect[p.secteur || 'secteur non renseigné'] = (sect[p.secteur || 'secteur non renseigné'] || 0) + p.valeur / val;
  return { positions: L, valeur: val, cout, plusValue: val - cout, performance: cout > 0 ? val / cout - 1 : null, performanceAvecDividendes: cout > 0 ? (val + div) / cout - 1 : null, dividendes: div, sansPrix: L.filter(p => p.quantite > 0 && p.valeur == null).map(p => p.ticker), secteurs: sect };
}
export function alertes(v, { plafondValeur = 0.08, plafondSecteur = 0.30 } = {}) { const A = []; for (const p of v.positions) if (p.poids != null && p.poids > plafondValeur + 1e-9) A.push(`${p.ticker} pèse ${(p.poids * 100).toFixed(1).replace('.', ',')} % (plafond ${plafondValeur * 100} %)`); for (const [s, w] of Object.entries(v.secteurs)) if (w > plafondSecteur + 1e-9) A.push(`le secteur « ${s} » pèse ${(w * 100).toFixed(1).replace('.', ',')} % (plafond ${plafondSecteur * 100} %)`); return A; }
