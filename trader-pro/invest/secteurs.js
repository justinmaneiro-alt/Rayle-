/* ═════════════ SECTEURS : un seul vocabulaire français (celui de la v1) pour toutes les sources (GICS, Yahoo, Wikipédia, ICB) — module PUR ═════════════ */
export const SECTEURS = Object.freeze(['Technologie', 'Santé', 'Finance', 'Industrie', 'Conso. cyclique', 'Conso. de base', 'Énergie', 'Matériaux', 'Services publics', 'Immobilier', 'Communication']);
const sans = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const R = [
  [/^(technologie|information technology|technology|semiconductor|software|electronic|it services|computer)/, 'Technologie'],
  [/(sante|health|pharma|biotech|medical|life science)/, 'Santé'],
  [/(financ|bank|insurance|assurance|capital market|investment|asset manage|credit|brokerage|mortgage|fintech)/, 'Finance'],
  [/(industr|aerospace|defen[cs]e|machinery|construction|engineering|transport|airline|logistic|building|capital goods|electrical|commercial service|trading company|business service)/, 'Industrie'],
  [/(consumer cyclical|consumer discretionary|conso\. cyclique|retail|automotive|auto |apparel|luxury|leisure|travel|hotel|restaurant|media|household dur|personal goods|homebuild|casino|gaming)/, 'Conso. cyclique'],
  [/(consumer defensive|consumer staples|conso\. de base|food|beverage|tobacco|household product|personal care|supermarket|grocery|packaged)/, 'Conso. de base'],
  [/(energy|energie|oil|gas|coal|petrol|uranium)/, 'Énergie'],
  [/(basic material|materials|materiaux|chemical|steel|metal|mining|gold|paper|forest|packaging|resources)/, 'Matériaux'],
  [/(utilit|services publics|electric util|water util|renewable)/, 'Services publics'],
  [/(real estate|immobilier|reit|property)/, 'Immobilier'],
  [/(communication|telecom|media & ent|publishing|internet content|entertainment|broadcast|advertis)/, 'Communication']
];
/* Yahoo / GICS / Wikipédia → secteur français ; null si inconnu */
export function normaliserSecteur(s) {
  const t = sans(s).trim(); if (!t) return null;
  if (SECTEURS.some(x => sans(x) === t)) return SECTEURS.find(x => sans(x) === t);
  if (/^(consumer cyclical|consumer discretionary)$/.test(t)) return 'Conso. cyclique'; if (/^(consumer defensive|consumer staples)$/.test(t)) return 'Conso. de base';
  if (/^communication services$/.test(t)) return 'Communication'; if (/^basic materials$/.test(t)) return 'Matériaux'; if (/^financial services$/.test(t)) return 'Finance';
  for (const [re, n] of R) if (re.test(t)) return n; return null;
}
export const estFinanciere = (secteur, industrie) => secteur === 'Finance' || /bank|insurance|assurance|asset manage|capital market|credit serv|mortgage|brokerage/i.test(industrie || '');
export const estFonciere = (secteur, industrie) => secteur === 'Immobilier' || /reit|real estate/i.test(industrie || '');
