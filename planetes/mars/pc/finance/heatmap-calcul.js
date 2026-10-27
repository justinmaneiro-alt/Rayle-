/* ═════════════ NASDAQ 100 : COMPOSITION INDICATIVE, PERFORMANCES ET CARTE DE CHALEUR (M2b ; module pur, testé : finance-test.mjs) ═════════════
   LISTE maintenue à la main (symbole, nom, secteur) : elle peut différer légèrement de la composition officielle (reconstitution chaque décembre) ; elle est étiquetée « indicative » partout.
   POIDS OFFICIELS : indisponibles gratuitement (le site d'Invesco refuse les appels automatiques, Nasdaq n'offre pas d'API ouverte) : les tuiles ont donc une TAILLE ÉGALE, groupées par secteur ;
   Rayle ne fabrique pas de faux poids. Les COURS viennent du Worker (route /finance/heatmap, cotations Yahoo Finance : DIFFÉRÉ, non officiel), jamais d'une valeur inventée.
   Performances : variation du dernier cours par rapport à la clôture précédente ; semaine = sur 5 séances. */
const N = (s, nom, secteur) => ({ s, nom, secteur });
export const SECTEURS = { tech: 'Technologie', semis: 'Semi-conducteurs', logiciels: 'Logiciels', comm: 'Communication', conso: 'Consommation cyclique', base: 'Consommation de base', sante: 'Santé', indus: 'Industrie', energie: 'Énergie et services publics', autres: 'Autres' };
export const NASDAQ100 = [
  N('AAPL', 'Apple', 'tech'), N('MSFT', 'Microsoft', 'logiciels'), N('NVDA', 'Nvidia', 'semis'), N('AMZN', 'Amazon', 'conso'), N('META', 'Meta', 'comm'), N('GOOGL', 'Alphabet A', 'comm'), N('GOOG', 'Alphabet C', 'comm'),
  N('AVGO', 'Broadcom', 'semis'), N('TSLA', 'Tesla', 'conso'), N('NFLX', 'Netflix', 'comm'), N('COST', 'Costco', 'base'), N('PLTR', 'Palantir', 'logiciels'), N('ASML', 'ASML', 'semis'), N('CSCO', 'Cisco', 'tech'),
  N('TMUS', 'T-Mobile US', 'comm'), N('AMD', 'AMD', 'semis'), N('PEP', 'PepsiCo', 'base'), N('LIN', 'Linde', 'indus'), N('INTU', 'Intuit', 'logiciels'), N('ISRG', 'Intuitive Surgical', 'sante'),
  N('QCOM', 'Qualcomm', 'semis'), N('TXN', 'Texas Instruments', 'semis'), N('BKNG', 'Booking', 'conso'), N('AMGN', 'Amgen', 'sante'), N('ADBE', 'Adobe', 'logiciels'), N('HON', 'Honeywell', 'indus'),
  N('AMAT', 'Applied Materials', 'semis'), N('GILD', 'Gilead', 'sante'), N('PANW', 'Palo Alto Networks', 'logiciels'), N('ADP', 'ADP', 'indus'), N('CMCSA', 'Comcast', 'comm'), N('VRTX', 'Vertex', 'sante'),
  N('APP', 'AppLovin', 'logiciels'), N('MU', 'Micron', 'semis'), N('LRCX', 'Lam Research', 'semis'), N('KLAC', 'KLA', 'semis'), N('ADI', 'Analog Devices', 'semis'), N('SBUX', 'Starbucks', 'conso'),
  N('MELI', 'MercadoLibre', 'conso'), N('CRWD', 'CrowdStrike', 'logiciels'), N('INTC', 'Intel', 'semis'), N('MDLZ', 'Mondelez', 'base'), N('CEG', 'Constellation Energy', 'energie'), N('CDNS', 'Cadence', 'logiciels'),
  N('SNPS', 'Synopsys', 'logiciels'), N('ORLY', 'O’Reilly', 'conso'), N('MAR', 'Marriott', 'conso'), N('CTAS', 'Cintas', 'indus'), N('MRVL', 'Marvell', 'semis'), N('PYPL', 'PayPal', 'autres'),
  N('ABNB', 'Airbnb', 'conso'), N('FTNT', 'Fortinet', 'logiciels'), N('REGN', 'Regeneron', 'sante'), N('DASH', 'DoorDash', 'conso'), N('WDAY', 'Workday', 'logiciels'), N('CSX', 'CSX', 'indus'),
  N('ADSK', 'Autodesk', 'logiciels'), N('AEP', 'American Electric Power', 'energie'), N('ROP', 'Roper', 'logiciels'), N('PCAR', 'Paccar', 'indus'), N('NXPI', 'NXP', 'semis'), N('TTWO', 'Take-Two', 'comm'),
  N('ROST', 'Ross Stores', 'conso'), N('MNST', 'Monster Beverage', 'base'), N('AZN', 'AstraZeneca', 'sante'), N('PAYX', 'Paychex', 'indus'), N('CPRT', 'Copart', 'indus'), N('FAST', 'Fastenal', 'indus'),
  N('KDP', 'Keurig Dr Pepper', 'base'), N('EXC', 'Exelon', 'energie'), N('XEL', 'Xcel Energy', 'energie'), N('IDXX', 'Idexx', 'sante'), N('CCEP', 'Coca-Cola Europacific', 'base'), N('VRSK', 'Verisk', 'indus'),
  N('KHC', 'Kraft Heinz', 'base'), N('DDOG', 'Datadog', 'logiciels'), N('GEHC', 'GE HealthCare', 'sante'), N('ODFL', 'Old Dominion', 'indus'), N('CSGP', 'CoStar', 'autres'), N('CTSH', 'Cognizant', 'tech'),
  N('TEAM', 'Atlassian', 'logiciels'), N('AXON', 'Axon', 'indus'), N('ZS', 'Zscaler', 'logiciels'), N('DXCM', 'Dexcom', 'sante'), N('TTD', 'The Trade Desk', 'logiciels'), N('FANG', 'Diamondback', 'energie'),
  N('CHTR', 'Charter', 'comm'), N('BKR', 'Baker Hughes', 'energie'), N('ARM', 'Arm', 'semis'), N('SHOP', 'Shopify', 'logiciels'), N('PDD', 'PDD Holdings', 'conso'),
  N('MSTR', 'Strategy (MicroStrategy)', 'logiciels'), N('TRI', 'Thomson Reuters', 'autres'), N('MCHP', 'Microchip', 'semis'), N('ALNY', 'Alnylam', 'sante'),
  N('INSM', 'Insmed', 'sante'), N('MPWR', 'Monolithic Power', 'semis'), N('STX', 'Seagate', 'tech'), N('WDC', 'Western Digital', 'tech'), N('FER', 'Ferrovial', 'indus')
];
export const SYMBOLES_NDX = NASDAQ100.map(x => x.s);
export const PAR_SYMBOLE = Object.fromEntries(NASDAQ100.map(x => [x.s, x]));
export const AVERTISSEMENT_COMPOSITION = 'Composition indicative (liste tenue à la main, peut différer de la liste officielle) · poids officiels indisponibles gratuitement : tuiles de taille égale · cotations différées (Yahoo Finance, non officiel).';

/* Réponse du Worker (/finance/heatmap) : { cotations: { SYM: { c: dernier, p: clôture précédente, s5: clôture il y a 5 séances|null, t: horodatage } }, majLe } → lignes de performance. */
export function performances(cotations) {
  const out = [];
  for (const x of NASDAQ100) {
    const q = cotations && cotations[x.s]; if (!q || !(q.c > 0) || !(q.p > 0)) { out.push({ ...x, vide: true }); continue; }
    out.push({ ...x, prix: q.c, pct: (q.c / q.p - 1) * 100, pct5: q.s5 > 0 ? (q.c / q.s5 - 1) * 100 : null, t: q.t || null });
  }
  return out;
}
/* Statistiques : moyenne simple (poids égaux : PAS la variation officielle de l'indice), hausses / baisses, meilleurs et pires, par secteur. */
export function resumeHeatmap(lignes) {
  const v = lignes.filter(l => !l.vide); if (!v.length) return null;
  const moy = a => a.reduce((s, x) => s + x.pct, 0) / a.length;
  const parSecteur = {}; for (const l of v) (parSecteur[l.secteur] = parSecteur[l.secteur] || []).push(l);
  const secteurs = Object.entries(parSecteur).map(([k, a]) => ({ id: k, nom: SECTEURS[k] || k, n: a.length, moyenne: moy(a) })).sort((a, b) => b.moyenne - a.moyenne);
  const tri = v.slice().sort((a, b) => b.pct - a.pct);
  return { n: v.length, manquants: lignes.length - v.length, moyenne: moy(v), hausses: v.filter(l => l.pct > 0).length, baisses: v.filter(l => l.pct < 0).length, meilleurs: tri.slice(0, 5), pires: tri.slice(-5).reverse(), secteurs };
}
/* Couleur d'une variation (rouge → gris → vert, saturée à ±3 %). Retourne un code CSS « rgb(...) ». */
export function couleurVariation(pct, sature = 3) {
  if (pct == null || !Number.isFinite(pct)) return 'rgb(50,56,64)';
  const k = Math.max(-1, Math.min(1, pct / sature)), a = Math.abs(k), base = 52;
  return k >= 0 ? 'rgb(' + Math.round(base - 22 * a) + ',' + Math.round(base + 150 * a) + ',' + Math.round(base + 30 * a) + ')' : 'rgb(' + Math.round(base + 170 * a) + ',' + Math.round(base - 22 * a) + ',' + Math.round(base - 14 * a) + ')';
}
export function phraseHeatmap(r) {
  if (!r) return 'Je n’ai pas les cotations du Nasdaq 100 pour le moment.';
  const f = x => x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return 'Sur ' + r.n + ' valeurs du Nasdaq 100 : ' + r.hausses + ' en hausse, ' + r.baisses + ' en baisse, variation moyenne ' + f(r.moyenne) + ' pour cent (moyenne simple). Meilleurs : ' + r.meilleurs.slice(0, 3).map(l => l.nom + ' ' + f(l.pct) + ' pour cent').join(', ')
    + '. Plus faibles : ' + r.pires.slice(0, 3).map(l => l.nom + ' ' + f(l.pct) + ' pour cent').join(', ') + '. Meilleur secteur : ' + (r.secteurs.find(s => s.n >= 4) || r.secteurs[0]).nom + '. Cotations différées.';
}
