import fs from 'node:fs';
import { historiquePaire } from './m6c-donnees.mjs';
import { decouper } from '../pc/agent-btc/evaluation.js';
import { tranche } from '../pc/agent-btc/colonnes.js';
import { plancherVariantes } from '../pc/agent-btc/essais-anterieurs.js';
import { contexteRegime, ORDRE_REGLES } from '../pc/agent-m6c/regles-regime.js';
import { evaluerRegle, statutRegle } from '../pc/agent-m6c/validation-m6c.js';
import { CRITERES_M6C, empreinteM6c } from '../pc/agent-m6c/criteres-m6c.js';

/* Validation complète (HORS jeu final) des règles par régime sur les trois paires. Seule la zone de recherche A est lue.
   Compteur de variantes : plancher de la paire + essais d'exploration de développement (EXPLORATION) + toutes les variantes évaluées ici.
   Usage : node planetes/mars/outils-agent/m6c-valider.mjs [BTC,SOL,DOGE] [tirages] */
// Variantes déjà évaluées avant la validation définitive, comptées pour ne rien cacher : 4 règles par défaut regardées sur BTC (m6c-explo.mjs) + les 12 variantes de cassure_range
// d'une première version de la règle qui ignorait la cassure pendant la bougie H1 encore « range » (erreur de logique trouvée par un test fabriqué, corrigée avant toute autre mesure) sur chacune des 3 paires.
const EXPLORATION = { BTC: 16, SOL: 12, DOGE: 12 };
const paires = (process.argv[2] || 'BTC,SOL,DOGE').split(','), tirages = Number(process.argv[3]) || CRITERES_M6C.hasard.tirages;
const sortie = {}, t0 = Date.now();
console.log('Critères M6c v' + CRITERES_M6C.version + ' empreinte ' + empreinteM6c() + ' ; tirages ' + tirages);
for (const paire of paires) {
  const { serie } = await historiquePaire(paire), dec = decouper(serie);
  if (!dec.ok) { console.log(paire, dec.raison); continue; }
  const A = tranche(serie, 0, dec.finA), ctx = contexteRegime(A); let n = plancherVariantes(paire) + (EXPLORATION[paire] || 0);
  sortie[paire] = { bougies: serie.n, zoneAMois: dec.moisZoneA, regles: {} };
  for (const id of ORDRE_REGLES) {
    const r = evaluerRegle({ ctx, id, decoupe: dec, nAvant: n, tirages }); n = r.nVariantes;
    sortie[paire].regles[id] = r;
    const st = r.stats; console.log(paire.padEnd(5), id.padEnd(17), 'n', String(st.n).padStart(4), 'esp', st.esperance == null ? '   —' : st.esperance.toFixed(3).padStart(6), 'R · total', st.Rtotal.toFixed(1).padStart(6), 'R · hasard centile', r.hasard.centile == null ? '—' : (r.hasard.centile * 100).toFixed(0) + ' %', '· lignes ok', r.lignes.filter(l => l.ok).length + '/' + r.lignes.length, r.ok ? 'TOUT PASSE' : '');
  }
  sortie[paire].nVariantes = n;
}
// mêmes paramètres sur 3 paires : combien de paires ont une espérance hors échantillon > 0 pour la règle ?
const positives = {}; for (const id of ORDRE_REGLES) positives[id] = paires.filter(p => sortie[p] && sortie[p].regles[id].defautOOS.esperance > 0).length;     // mêmes paramètres (ceux par défaut) sur toutes les paires
for (const p of paires) if (sortie[p]) for (const id of ORDRE_REGLES) { sortie[p].regles[id].statut = statutRegle({ resultat: sortie[p].regles[id], positivesSurPaires: positives[id] }); }
console.log('\nStatuts :'); for (const p of paires) if (sortie[p]) for (const id of ORDRE_REGLES) { const s = sortie[p].regles[id].statut; console.log(p.padEnd(5), id.padEnd(17), s.statut, s.raisons.length ? '— ' + s.raisons.slice(0, 3).join(' | ') : ''); }
fs.mkdirSync(new URL('../../../docs/resultats-m6c/', import.meta.url), { recursive: true });
const dest = new URL('../../../docs/resultats-m6c/validation-' + new Date().toISOString().slice(0, 10) + '.json', import.meta.url);
fs.writeFileSync(dest, JSON.stringify(sortie, (k, v) => (k === 'wf' ? { stats: v.stats, Rtrades: v.trades.map(x => +x.R.toFixed(2)), tSortie: v.trades.map(x => x.tSortie), blocs: v.blocs.map(b => ({ debut: b.debut, fin: b.fin, params: b.params, n: b.test.n, esperance: b.test.esperance })) } : (v instanceof Float64Array ? undefined : v)), 1));
console.log('\nDurée', Math.round((Date.now() - t0) / 1000), 's ; résultats →', dest.pathname.replace(/^\//, ''));
