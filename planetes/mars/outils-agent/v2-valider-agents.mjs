import fs from 'node:fs';
import { historiquePaire } from './m6c-donnees.mjs';
import { validerAgent, STATUTS } from '../pc/agents-v2/validation-agent.js';
import { ORDRE_AGENTS_V2, FAMILLES_V2 } from '../pc/agents-v2/familles-v2.js';
import { plancherVariantes } from '../pc/agent-btc/essais-anterieurs.js';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { configMoteurDe } from '../pc/agent-m6/couts.js';

/* MESURE RÉELLE des deux agents prêts à l'emploi (V2, phase 6) sur l'historique Binance de BTC, SOL et DOGE (cache local, dossiers ignorés par git).
   Même protocole que tout le reste : walk-forward sur la zone de recherche (75 % premiers), critères v1 figés, coûts par paire (couts.js). LE JEU FINAL N'EST JAMAIS OUVERT.
   Compteur de variantes : plancher de la paire (toutes les recherches antérieures) + les variantes évaluées ici (jamais remis à zéro).
   Usage : node planetes/mars/outils-agent/v2-valider-agents.mjs [BTC,SOL,DOGE]   → docs/resultats-v2/agents-prets.json et docs/agents-prets.md */
const paires = (process.argv[2] || 'BTC,SOL,DOGE').split(','), sortie = {}, t0 = Date.now();
for (const paire of paires) {
  const { serie, etat } = await historiquePaire(paire).catch(e => { console.log(paire, 'historique indisponible :', e.message); return {}; });
  if (!serie || !serie.n) continue;
  const ctx = construireContexte(serie), config = { ...configMoteurDe(paire), risquePct: 1 }; let n = plancherVariantes(paire);
  sortie[paire] = { bougies: serie.n, annees: etat && etat.annees, agents: {} };
  for (const id of ORDRE_AGENTS_V2) {
    const r = validerAgent(serie, id, { config, variantesDejaTestees: n, ctx }); n = r.nVariantes || n;
    const st = r.wf ? r.wf.stats : null;
    sortie[paire].agents[id] = { statut: r.statut, raison: r.raison || null, nVariantes: r.nVariantes, retenus: r.retenus, horsEchantillon: st && { n: st.n, esperance: st.esperance, tauxReussite: st.tauxReussite, factProfit: st.factProfit, ddR: st.ddR, parSemaine: st.parSemaine, Rtotal: st.Rtotal },
      ic: r.ic, criteres: r.juge ? r.juge.lignes.map(l => ({ critere: l.critere, valeur: l.valeur, seuil: l.seuil, ok: l.ok })) : null, blocs: r.wf ? r.wf.blocs.length : 0, jeuFinalOuvert: false, empreinte: r.criteres && r.criteres.empreinte };
    console.log(paire.padEnd(5), id.padEnd(15), STATUTS[r.statut] || r.statut, st ? ' | OOS n ' + st.n + ' · esp ' + (st.esperance == null ? '—' : st.esperance.toFixed(3)) + ' R · ddR ' + (st.ddR || 0).toFixed(1) : '', r.juge ? ' | ratés : ' + r.juge.lignes.filter(l => !l.ok).length : '');
  }
}
fs.mkdirSync(new URL('../../../docs/resultats-v2/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../../../docs/resultats-v2/agents-prets.json', import.meta.url), JSON.stringify({ mesureLe: new Date().toISOString().slice(0, 10), jeuFinalOuvert: false, sortie }, null, 1));
const md = ['# Agents prêts : résultats mesurés sur les vraies données', '', '_Généré par `node planetes/mars/outils-agent/v2-valider-agents.mjs`. **Le jeu final (derniers 25 %) n\'a jamais été ouvert.** Coûts réglables par paire (couts.js), critères v1 figés (empreinte c9995253)._', '',
  'Lecture : « hors échantillon » = paramètres rechoisis à chaque bloc de test de 6 mois sur l\'entraînement seul. **Un résultat NON VALIDÉ est un résultat honnête** : l\'agent ne propose alors aucune position et n\'envoie aucune alerte d\'entrée.', ''];
for (const [p, o] of Object.entries(sortie)) {
  md.push('## ' + p + ' (' + o.bougies + ' bougies M15' + (o.annees ? ', ' + o.annees.toFixed(1).replace('.', ',') + ' ans' : '') + ')', '', '| Agent | Statut | Trades hors échantillon | Espérance (R) | Facteur de profit | Creux (R) | Critères ratés |', '|---|---|---|---|---|---|---|');
  for (const [id, a] of Object.entries(o.agents)) { const h = a.horsEchantillon; md.push('| ' + FAMILLES_V2[id].nom + ' | ' + (STATUTS[a.statut] || a.statut) + ' | ' + (h ? h.n : '—') + ' | ' + (h && h.esperance != null ? h.esperance.toFixed(2) : '—') + ' | ' + (h && h.factProfit != null ? (h.factProfit === Infinity ? '∞' : h.factProfit.toFixed(2)) : '—') + ' | ' + (h ? h.ddR.toFixed(1) : '—') + ' | ' + (a.criteres ? a.criteres.filter(c => !c.ok).map(c => c.critere).join(' ; ') || 'aucun' : a.raison || '—') + ' |'); }
  md.push('');
}
fs.writeFileSync(new URL('../../../docs/agents-prets.md', import.meta.url), md.join('\n') + '\n');
console.log('Terminé en ' + Math.round((Date.now() - t0) / 1000) + ' s : docs/resultats-v2/agents-prets.json et docs/agents-prets.md');
