/* Construit le catalogue XTB (fichiers data/xtb-univers/*.json) à partir de :
   1. la table des marges officielle de XTB (PDF → texte avec pdftotext -layout) : forex, indices, matières premières, cryptos et la liste exacte des CFD sur actions et ETF (symboles à taper dans xStation) ;
   2. les compositions d'indices (compositions.mjs) pour le Palier A ;
   3. le catalogue d'ETF UCITS (etf-liste.mjs) ;
   4. le S&P 500 (secteurs et numéros CIK de la SEC) déjà présent dans trader-pro/invest/univers.js.
   Usage : node outils-donnees/invest/univers-xtb.mjs <table-des-marges.txt>
   Honnêteté : « verifie_xtb » = le symbole figure dans la table des marges (CFD confirmé). Les actions des indices absentes de cette table sont ajoutées en « réel probable » (XTB annonce plus de 7 500 actions au comptant) :
   leur symbole XTB est déduit de la convention (TICKER.PAYS) et n'a pas pu être vérifié, faute de liste officielle publique des actions au comptant. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { SP500, CAC40 } from '../../trader-pro/invest/univers.js';
import { ETF_UCITS } from './etf-liste.mjs';
import { INDICES_YAHOO, MATIERES, CRYPTOS, BOND_CFD, PAYS_SUFFIXE, versYahooXtb, zonePays, FOREX_DEVISES } from './tables.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), racine = path.resolve(ici, '../..'), sortie = path.join(racine, 'data/xtb-univers');
const texte = fs.readFileSync(process.argv[2] || path.join(ici, 'marges.txt'), 'latin1').replace(/ï¿½/g, '?');
const compo = fs.existsSync(path.join(ici, 'compositions.json')) ? JSON.parse(fs.readFileSync(path.join(ici, 'compositions.json'), 'utf8')) : { indices: {} };

/* ───── 1) actions et ETF CFD : symboles de la section « Marges collectées … CFD sur actions, CFD sur ETF » ───── */
const iDebut = texte.search(/Marges collect/), bloc = texte.slice(iDebut), paliers = []; const reTier = /^\s*(20|25|30|35|40|50|100)%\s*$/gm; let m; const bornes = [];
while ((m = reTier.exec(bloc))) bornes.push({ marge: +m[1], i: m.index + m[0].length });
const reSym = /([A-Z0-9]{1,10})\.(US|UK|DE|FR|ES|IT|NL|BE|PT|CH|SE|NO|DK|FI|PL|CZ)(\*?)/g, vus = new Map();
bornes.forEach((b, k) => { const seg = bloc.slice(b.i, k + 1 < bornes.length ? bornes[k + 1].i : bloc.length); for (const s of seg.matchAll(reSym)) { const cle = s[1] + '.' + s[2]; if (!vus.has(cle)) vus.set(cle, { code: s[1], pays: s[2], marge: b.marge, restreint: !!s[3] }); } });
console.log('symboles actions/ETF dans la table des marges :', vus.size);

/* ───── 2) appartenance aux indices ───── */
const membres = {}; // symbole Yahoo → [indices]
const nomsComp = {}, secteursComp = {};
for (const [id, o] of Object.entries(compo.indices || {})) { if (id === 'EUROSTOXX50' || id === 'SP600') continue; for (const x of o.membres || []) { (membres[x.y] = membres[x.y] || []).push(id); if (x.nom) nomsComp[x.y] = x.nom; if (x.secteur) secteursComp[x.y] = x.secteur; } }
for (const [tk, nom, secteur, cik] of SP500) { const y = tk.replace('.', '-'); (membres[y] = membres[y] || []).push('SP500'); nomsComp[y] = nom; secteursComp[y] = secteur; }
for (const [tk, nom, secteur] of CAC40) { (membres[tk] = membres[tk] || []).push('CAC40'); nomsComp[tk] = nom; secteursComp[tk] = secteur; }
const cikDe = new Map(SP500.map(([tk, , , cik]) => [tk.replace('.', '-'), cik]));

const suffixeVersPays = Object.fromEntries(Object.entries(PAYS_SUFFIXE).map(([p, s]) => [p, s]));
const actions = [], etf = [], dejaY = new Set();
const ajouterAction = o => { if (dejaY.has(o.symbole_yahoo)) return; dejaY.add(o.symbole_yahoo); actions.push(o); };
for (const v of vus.values()) {
  const y = versYahooXtb(v.code, v.pays), indices = membres[y] || [];
  for (const [id, o2] of Object.entries(compo.indices || {})) if (!(o2.membres || []).length && o2.pays === v.pays && !indices.includes(id + '~')) indices.push(id + '~');   // indice non lu : tout titre XTB du pays est rangé en palier A (approximation signalée par « ~ »)
  const o = { symbole_xtb: v.code + '.' + v.pays, symbole_yahoo: y, nom: nomsComp[y] || null, isin: null, classe: 'action', pays: v.pays, zone: zonePays(v.pays), bourse: null, devise: null, secteur: secteursComp[y] || null, industrie: null, capitalisation: null, dispo: 'CFD (réel probable)', pea: pea(v.pays), palier: indices.length ? 'A' : 'B', indices, verifie_xtb: true, marge_cfd: v.marge, restreint: v.restreint || undefined, cik: cikDe.get(y) || null };
  ajouterAction(o);
}
function pea(pays) { return ['FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'PT', 'FI', 'DK', 'SE', 'PL'].includes(pays) ? 'oui' : 'non'; }
/* actions des indices absentes de la table des marges : réel probable */
for (const [y, idx] of Object.entries(membres)) {
  if (dejaY.has(y)) continue;
  const mm = /\.([A-Z]{1,2})$/.exec(y); const pays = mm ? (Object.entries(PAYS_SUFFIXE).find(([, s]) => s === mm[0]) || ['US'])[0] : 'US'; const base = mm ? y.slice(0, -mm[0].length) : y;
  ajouterAction({ symbole_xtb: base.replace(/-/g, '') + '.' + pays, symbole_yahoo: y, nom: nomsComp[y] || null, isin: null, classe: 'action', pays, zone: zonePays(pays), bourse: null, devise: null, secteur: secteursComp[y] || null, industrie: null, capitalisation: null, dispo: 'réel (probable)', pea: pea(pays), palier: 'A', indices: idx, verifie_xtb: false, marge_cfd: null, cik: cikDe.get(y) || null });
}
/* ETF UCITS du catalogue de référence */
for (const [y, cat, p, duree, isin] of ETF_UCITS) {
  const mm = /\.([A-Z]{1,2})$/.exec(y), pays = (Object.entries(PAYS_SUFFIXE).find(([, s]) => mm && s === mm[0]) || ['EU'])[0];
  etf.push({ symbole_xtb: y.replace(/\.[A-Z]+$/, '') + '.' + (pays === 'EU' ? 'EU' : pays), symbole_yahoo: y, nom: null, isin: isin || null, classe: 'ETF', pays, zone: 'Europe', bourse: null, devise: null, secteur: null, industrie: null, capitalisation: null, categorie: cat, dispo: 'réel (probable)', pea: p ? 'oui' : 'non', palier: 'A', indices: [], verifie_xtb: false, duree: duree || null });
}

/* ───── 3) devises, indices, matières premières, cryptos, obligataire ───── */
const nomsTexte = new Set((texte.match(/[A-Za-z0-9.]{3,12}/g) || []));
const devises = []; for (const t of new Set(texte.slice(0, texte.search(/\nIndices/)).match(/\b[A-Z]{6}\b/g) || [])) { const a = t.slice(0, 3), b = t.slice(3); if (FOREX_DEVISES.has(a) && FOREX_DEVISES.has(b)) devises.push({ symbole_xtb: t, symbole_yahoo: t + '=X', nom: a + '/' + b, isin: null, classe: 'devise', pays: null, zone: 'Monde', bourse: 'Forex', devise: b, secteur: null, industrie: null, capitalisation: null, dispo: 'CFD', pea: 'non', palier: 'A', indices: [], verifie_xtb: true, base: a, cote: b }); }
const indices = INDICES_YAHOO.map(([x, y, nom, pays]) => ({ symbole_xtb: x, symbole_yahoo: y, nom, isin: null, classe: 'indice', pays, zone: pays ? zonePays(pays) : 'Monde', bourse: 'Indice', devise: null, secteur: null, industrie: null, capitalisation: null, dispo: 'CFD', pea: 'non', palier: 'A', indices: [], verifie_xtb: nomsTexte.has(x) || nomsTexte.has(x.replace('.cash', '')), donnees: !!y }));
const matieres = MATIERES.map(([x, y, nom]) => ({ symbole_xtb: x, symbole_yahoo: y, nom, isin: null, classe: 'matière première', pays: null, zone: 'Monde', bourse: 'Contrat à terme', devise: 'USD', secteur: null, industrie: null, capitalisation: null, dispo: 'CFD', pea: 'non', palier: 'A', indices: [], verifie_xtb: nomsTexte.has(x), donnees: !!y }));
const crypto = CRYPTOS.map(([x, y, nom]) => ({ symbole_xtb: x, symbole_yahoo: y, nom, isin: null, classe: 'crypto', pays: null, zone: 'Monde', bourse: 'Crypto', devise: 'USD', secteur: null, industrie: null, capitalisation: null, dispo: 'CFD', pea: 'non', palier: 'A', indices: [], verifie_xtb: nomsTexte.has(x), donnees: !!y }));
const obligataire = BOND_CFD.map(([x, y, nom, pays, fred]) => ({ symbole_xtb: x || 'REF-' + (fred || nom), symbole_yahoo: y, nom, isin: null, classe: 'obligataire', pays, zone: zonePays(pays), bourse: x ? 'Contrat à terme (CFD)' : 'Taux de référence', devise: null, secteur: null, industrie: null, capitalisation: null, dispo: x ? 'CFD' : 'référence', pea: 'non', palier: 'A', indices: [], verifie_xtb: !!x && nomsTexte.has(x), donnees: !!(y || fred), serie_fred: fred || null }));

fs.mkdirSync(sortie, { recursive: true });
const ecrire = (n, L) => fs.writeFileSync(path.join(sortie, n + '.json'), JSON.stringify(L));
ecrire('actions', actions); ecrire('etf', etf); ecrire('devises', devises); ecrire('indices', indices); ecrire('matieres', matieres); ecrire('crypto', crypto); ecrire('obligataire', obligataire);
const parPays = {}; for (const a of actions) parPays[a.pays] = (parPays[a.pays] || 0) + 1;
const R = { version: 1, t: Date.now(), sources: ['Table des marges XTB (comptes standard, PDF officiel xtb.com)', 'Wikipédia : compositions d’indices', 'Nasdaq (API publique) : Nasdaq-100', 'catalogue d’ETF UCITS écrit à la main (etf-liste.mjs)'], comptes: { actions: actions.length, 'actions palier A': actions.filter(a => a.palier === 'A').length, 'actions palier B': actions.filter(a => a.palier === 'B').length, 'actions vérifiées dans la table XTB': actions.filter(a => a.verifie_xtb).length, etf: etf.length, devises: devises.length, indices: indices.length, 'matières premières': matieres.length, crypto: crypto.length, obligataire: obligataire.length }, actionsParPays: parPays, indicesCouverts: Object.fromEntries(Object.entries(compo.indices || {}).map(([k, v]) => [k, (v.membres || []).length])) };
fs.writeFileSync(path.join(sortie, 'index.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R.comptes, null, 1), JSON.stringify(parPays));
