/* Compositions des indices d'actions (Palier A) lues sur Wikipédia (API publique « parse », sans clé).
   Sortie : outils-donnees/invest/compositions.json  { indice: [{ tk (symbole local), nom, secteur }] }.
   Les symboles sont ensuite convertis en symboles Yahoo (suffixe de place) et rapprochés de la liste XTB (univers-xtb.mjs).
   Usage : node outils-donnees/invest/compositions.mjs   (réseau requis ; à relancer de temps en temps : les indices évoluent) */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url));
const UA = 'Rayle-Invest outil de recherche personnel (lecture des compositions d indices)';
/* indice → page Wikipédia, suffixe Yahoo de la place, pays */
export const INDICES = [
  ['NASDAQ100', 'Nasdaq-100', '', 'US'], ['SP400', 'List of S&P 400 companies', '', 'US'], ['SP600', 'List of S&P 600 companies', '', 'US'],
  ['CAC40', 'CAC 40', '.PA', 'FR'], ['SBF120', 'SBF 120', '.PA', 'FR', 'fr'], ['CACMID60', 'CAC Mid 60', '.PA', 'FR', 'fr'], ['DAX40', 'DAX', '.DE', 'DE'], ['MDAX', 'MDAX', '.DE', 'DE'],
  ['EUROSTOXX50', 'EURO STOXX 50', '', 'EU'], ['FTSE100', 'FTSE 100 Index', '.L', 'UK'], ['FTSE250', 'FTSE 250 Index', '.L', 'UK'], ['IBEX35', 'IBEX 35', '.MC', 'ES'], ['FTSEMIB', 'FTSE MIB', '.MI', 'IT'],
  ['AEX', 'AEX index', '.AS', 'NL'], ['BEL20', 'BEL 20', '.BR', 'BE'], ['PSI', 'PSI-20', '.LS', 'PT'], ['SMI', 'Swiss Market Index', '.SW', 'CH'], ['OMXS30', 'OMXS30', '.ST', 'SE'],
  ['OBX', 'OBX Index', '.OL', 'NO'], ['OMXC25', 'OMX Copenhagen 25', '.CO', 'DK'], ['OMXH25', 'OMX Helsinki 25', '.HE', 'FI'], ['WIG20', 'WIG20', '.WA', 'PL']
];
const dec = s => s.replace(/<sup[^>]*>.*?<\/sup>/gs, '').replace(/<style.*?<\/style>/gs, '').replace(/<[^>]*>/g, ' ').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
export async function page(titre, langue = 'en') {
  const u = 'https://' + langue + '.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=text&redirects=1&page=' + encodeURIComponent(titre);
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); const t = await r.text(); if (r.ok && t[0] === '{') { const j = JSON.parse(t); if (j.parse) return j.parse.text; if (j.error && j.error.code === 'missingtitle') return null; } } catch (e) { /* nouvel essai */ }
    await new Promise(r => setTimeout(r, 4000 * (i + 1)));
  }
  return null;
}
/* tableaux → { entetes, lignes } */
export function tableaux(html) {
  const out = []; for (const m of html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>(.*?)<\/table>/gs)) {
    const rows = [...m[1].matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(r => [...r[1].matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gs)].map(c => dec(c[1])));
    if (rows.length > 5) out.push({ entetes: rows[0], lignes: rows.slice(1) });
  } return out;
}
const RE_TK = /^(ticker|symbol|epic|ticker symbol|trading symbol|code|bloomberg|mnemonic|symbol \/ ticker)/i, RE_NOM = /^(company|name|security|constituent|company name|issuer|components?)/i, RE_SEC = /sector|industry|icb|gics/i;
export function extraire(html) {
  let meilleur = [];
  for (const t of tableaux(html)) {
    const ik = t.entetes.findIndex(h => RE_TK.test(h)), inom = t.entetes.findIndex(h => RE_NOM.test(h)), isec = t.entetes.findIndex(h => RE_SEC.test(h)); if (ik < 0) continue;
    const L = t.lignes.map(l => ({ tk: (l[ik] || '').replace(/^.*[: ]\s*/, '').replace(/\s+/g, ' ').trim(), nom: inom >= 0 ? l[inom] : '', secteur: isec >= 0 ? l[isec] : '' })).filter(x => /^[A-Za-z0-9][A-Za-z0-9 .\-&]{0,11}$/.test(x.tk));
    if (L.length > meilleur.length) meilleur = L;
  } return meilleur;
}
export const versYahoo = (tk, suffixe) => (suffixe ? tk.replace(/\s+/g, '-').replace(/\.([A-Z])$/, '-$1').toUpperCase() + suffixe : tk.replace(/\./g, '-').toUpperCase());
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sortie = {}; const rapport = [];
  for (const [id, titre, suf, pays, langue] of INDICES) {
    const h = id === 'NASDAQ100' ? null : await page(titre, langue || 'en'); const L = h ? extraire(h) : [];
    sortie[id] = { pays, suffixe: suf, page: titre, membres: L.map(x => ({ y: versYahoo(x.tk, suf), nom: x.nom, secteur: x.secteur })) };
    rapport.push(id.padEnd(12) + L.length); await new Promise(r => setTimeout(r, 2500));
  }
  /* Nasdaq-100 : liste publique du Nasdaq (JSON) */
  try { const r = await fetch('https://api.nasdaq.com/api/quote/list-type/nasdaq100', { headers: { 'User-Agent': UA, Accept: 'application/json' } }); const j = await r.json(); const rows = (j.data && j.data.data && j.data.data.rows) || []; sortie.NASDAQ100 = { pays: 'US', suffixe: '', page: 'api.nasdaq.com list-type/nasdaq100', membres: rows.map(x => ({ y: versYahoo(x.symbol, ''), nom: x.companyName, secteur: '' })) }; rapport.push('NASDAQ100 (API Nasdaq) ' + rows.length); } catch (e) { rapport.push('NASDAQ100 échec ' + e.message); }
  fs.writeFileSync(path.join(ici, 'compositions.json'), JSON.stringify({ t: Date.now(), source: 'Wikipédia (anglais), API parse', indices: sortie }));
  console.log(rapport.join('\n'));
}
