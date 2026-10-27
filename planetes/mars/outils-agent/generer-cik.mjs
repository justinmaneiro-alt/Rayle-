// Genere planetes/mars/pc/finance/cik-nasdaq100.js : correspondance symbole -> CIK (identifiant SEC) lue dans la liste OFFICIELLE de la SEC (sec.gov/files/company_tickers.json).
// Rien n'est ecrit de memoire : un symbole absent de la liste officielle est signale et laisse sans CIK.
// Lancer :  node planetes/mars/outils-agent/generer-cik.mjs
import fs from 'node:fs';
import { SYMBOLES_NDX } from '../pc/finance/heatmap-calcul.js';
const rep = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': 'RayleHub/1.0 (assistant personnel, usage non commercial)' } });
if (!rep.ok) throw new Error('SEC HTTP ' + rep.status);
const j = await rep.json(), parTicker = new Map();
for (const v of Object.values(j)) if (!parTicker.has(v.ticker)) parTicker.set(v.ticker, { cik: String(v.cik_str).padStart(10, '0'), nom: v.title });
const table = {}, manquants = [];
for (const s of SYMBOLES_NDX) { const x = parTicker.get(s) || parTicker.get(s.replace('.', '-')); if (x) table[s] = x; else manquants.push(s); }
const lignes = Object.entries(table).map(([s, x]) => '  ' + s + ': { cik: \'' + x.cik + '\', nom: ' + JSON.stringify(x.nom) + ' }');
const code = '/* Correspondance symbole -> CIK SEC pour la liste indicative du Nasdaq 100. GENERE par planetes/mars/outils-agent/generer-cik.mjs depuis la liste officielle de la SEC (' + new Date().toISOString().slice(0, 10) + '). Ne pas modifier a la main. */\nexport const CIK_NDX = {\n' + lignes.join(',\n') + '\n};\nexport const SANS_CIK = ' + JSON.stringify(manquants) + ';\n';
fs.writeFileSync(new URL('../pc/finance/cik-nasdaq100.js', import.meta.url), code);
const dossierWorker = new URL('../../../worker/src/finance/', import.meta.url);
if (fs.existsSync(dossierWorker)) fs.writeFileSync(new URL('cik.js', dossierWorker), code + '// copie du Worker (le dossier worker/ est autonome)\n');
console.log(Object.keys(table).length + ' symboles avec CIK ; sans CIK : ' + (manquants.join(', ') || 'aucun'));
