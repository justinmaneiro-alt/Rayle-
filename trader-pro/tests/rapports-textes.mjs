/* Imprime (ou compare) les textes parlés de 3 rapports sur les données de test : complet sur l'or, COT Nasdaq, marché global.
   Usage : node trader-pro/tests/rapports-textes.mjs [--json sortie.json]   (sert à comparer avant / après la v12 et à compter les chiffres par étape) */
import fs from 'node:fs';
import { creerRapport } from '../rapports/construire.js';
import { fauxSrc } from './rapports-faux.mjs';
/* un « chiffre » = un nombre lu à voix haute ; les noms (H4, MA200, MA50, S&P 500, Nasdaq 100, US100) n'en sont pas */
export const compterChiffres = t => { const s = String(t || '').replace(/S&P\s?500|Nasdaq\s?100|\b(?:[A-Z]{1,3}|MA|US)\d{1,3}\b/g, ' '); return (s.match(/\d[\d   ]*(?:[.,]\d+)?/g) || []).length; };
const CAS = [['complet', { actif: 'or' }, 'Rapport complet sur l’or'], ['cot', { actif: 'us100' }, 'Rapport COT sur le Nasdaq'], ['marche', {}, 'Rapport sur le marché global'], ['macro', {}, 'Rapport macro et calendrier']];
export async function textes() {
  const out = [];
  for (const [type, opts, titre] of CAS) {
    const src = fauxSrc(), r = creerRapport(type, opts, src), etapes = [];
    for (const e of r.etapes) { const s = await e.faire(); etapes.push({ id: s.id, ok: s.ok, texte: s.texte, chiffres: compterChiffres(s.texte), caracteres: (s.texte || '').length }); }
    out.push({ type, titre, etapes, total: etapes.reduce((a, e) => a + e.caracteres, 0), maxChiffres: Math.max(...etapes.map(e => e.chiffres)) });
  }
  return out;
}
if ((process.argv[1] || '').split('\\').join('/').endsWith('rapports-textes.mjs')) {
  const T = await textes(), i = process.argv.indexOf('--json');
  if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(T, null, 1));
  for (const r of T) { console.log('\n══ ' + r.titre + ' — ' + r.total + ' caractères, ' + r.etapes.length + ' étapes, jusqu’à ' + r.maxChiffres + ' chiffres par étape'); for (const e of r.etapes) console.log('· [' + e.id + '] (' + e.chiffres + ' ch.) ' + e.texte); }
}
