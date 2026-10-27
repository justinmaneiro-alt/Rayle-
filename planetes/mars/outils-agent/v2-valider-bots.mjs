import fs from 'node:fs';
import { historiquePaire } from './m6c-donnees.mjs';
import { validerAgent, STATUTS } from '../pc/agents-v2/validation-agent.js';
import { BOTS, ORDRE_BOTS, MENTION_PAPIER } from '../pc/agents-v2/bots-externes.js';
import { plancherVariantes } from '../pc/agent-btc/essais-anterieurs.js';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { configMoteurDe } from '../pc/agent-m6/couts.js';

/* MESURE RÉELLE des 5 bots open source adaptés sur BTC, SOL et DOGE (historique Binance en cache). Même protocole que partout : walk-forward sur la zone de recherche, critères v1 figés,
   coûts par paire, JEU FINAL JAMAIS OUVERT, compteur de variantes qui ne baisse jamais (plancher de la paire + agents de la V2 déjà comptés + variantes de chaque bot).
   Usage : node planetes/mars/outils-agent/v2-valider-bots.mjs   → docs/BOTS.md, docs/resultats-v2/bots.json, planetes/mars/pc/agents-v2/resultats-bots.js (généré : ne pas éditer) */
const t0 = Date.now(), sortie = {}, paires = (process.argv[2] || 'BTC,SOL,DOGE').split(',');
for (const paire of paires) {
  const { serie, etat } = await historiquePaire(paire).catch(e => { console.log(paire, 'historique indisponible :', e.message); return {}; });
  if (!serie || !serie.n) continue;
  const ctx = construireContexte(serie), config = { ...configMoteurDe(paire), risquePct: 1 }; let n = plancherVariantes(paire) + 48;   // + les 2 agents de la V2 (24 + 24 variantes)
  sortie[paire] = { bougies: serie.n, annees: etat && etat.annees, bots: {} };
  for (const id of ORDRE_BOTS) {
    const r = validerAgent(serie, id, { config, variantesDejaTestees: n, ctx }); n = r.nVariantes || n; const st = r.wf ? r.wf.stats : null;
    sortie[paire].bots[id] = { statut: r.statut, raison: r.raison || null, nVariantes: r.nVariantes, retenus: r.retenus, horsEchantillon: st && { n: st.n, esperance: st.esperance, tauxReussite: st.tauxReussite, factProfit: st.factProfit, ddR: st.ddR, parSemaine: st.parSemaine, Rtotal: st.Rtotal },
      ratés: r.juge ? r.juge.lignes.filter(l => !l.ok).map(l => l.critere) : [] };
    console.log(paire.padEnd(5), id.padEnd(20), (STATUTS[r.statut] || r.statut).padEnd(24), st ? 'OOS n ' + String(st.n).padStart(4) + ' · esp ' + (st.esperance == null ? '   —' : st.esperance.toFixed(3).padStart(6)) + ' R · ddR ' + (st.ddR || 0).toFixed(1) : '', r.juge ? ' · critères ratés ' + r.juge.lignes.filter(l => !l.ok).length : '');
  }
}
const date = new Date().toISOString().slice(0, 10);
fs.mkdirSync(new URL('../../../docs/resultats-v2/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../../../docs/resultats-v2/bots.json', import.meta.url), JSON.stringify({ mesureLe: date, jeuFinalOuvert: false, sortie }, null, 1));
// module généré pour les cartes de l'assistant (résumé par bot et par paire)
const resume = Object.fromEntries(ORDRE_BOTS.map(id => [id, Object.fromEntries(Object.entries(sortie).map(([p, o]) => { const b = o.bots[id]; return [p, b ? { statut: b.statut, n: b.horsEchantillon ? b.horsEchantillon.n : null, esperance: b.horsEchantillon ? b.horsEchantillon.esperance : null, ddR: b.horsEchantillon ? b.horsEchantillon.ddR : null } : null]; }))]));
fs.writeFileSync(new URL('../pc/agents-v2/resultats-bots.js', import.meta.url), '/* GÉNÉRÉ par planetes/mars/outils-agent/v2-valider-bots.mjs : mesures réelles seulement (jeu final jamais ouvert). Ne pas éditer à la main. */\nexport const MESURE_BOTS = ' + JSON.stringify({ mesureLe: date, jeuFinalOuvert: false, resume }, null, 1) + ';\n');
const f2 = x => (x == null ? '—' : x.toFixed(2).replace('.', ','));
const md = ['# Bots open source adaptés à Raylé', '', '_Fichier généré par `node planetes/mars/outils-agent/v2-valider-bots.mjs` (mesure du ' + date + '). **' + MENTION_PAPIER + '**_', '',
  'Chaque bot est une stratégie **simple et célèbre**, **réécrite** pour le moteur de backtest de Raylé : signal à la clôture, exécution à l\'ouverture suivante, frais + spread + glissement, stop et objectif en R, même walk-forward et mêmes critères figés (v1, empreinte `c9995253`) que le reste. Les originaux « investissent tout le solde » ou n\'ont qu\'un stop en pourcentage : **jamais ici**.', '',
  '## Licences et origine (vérifiées par l\'API GitHub le 2026-10-27)', '', '| Bot | Projet d\'origine | Dépôt | Licence | Ce qui est repris |', '|---|---|---|---|---|', ...ORDRE_BOTS.map(id => { const b = BOTS[id], o = b.origine; return '| ' + b.nom + ' | ' + o.projet + ' | ' + o.depot + ' | **' + o.licence + '** | ' + o.note + ' |'; }), '',
  '**Pourquoi « réécrit » et pas « copié »** : Freqtrade, Freqtrade-strategies et Backtrader sont sous GPL-3.0 : copier leur code obligerait ce dépôt public (et GitHub Pages) à être publié sous GPL. Seules les IDÉES de trading (non protégées par le droit d\'auteur) sont reprises, avec mention de l\'origine. Jesse (MIT) et Lean (Apache-2.0) autoriseraient la reprise avec leur mention de copyright ; par cohérence, tout le code de ces bots est néanmoins original. QuantConnect Lean et Backtrader ont été examinés : leurs exemples (croisement de moyennes mobiles) sont couverts par les bots 1 et 2.', '',
  '## Les 5 bots', ''];
for (const id of ORDRE_BOTS) {
  const b = BOTS[id], g = b.famille.grille();
  md.push('### ' + b.nom, '', b.description, '', '- **Catégorie** : ' + b.categorie, '- **Réglages (valeurs testées)** : ' + Object.entries(g).map(([k, l]) => b.aide[k][0] + ' ∈ {' + l.join(', ') + '}').join(' ; '), '- **Bouton « Tester dans Rayle »** : Mars → pile « Agent IA » → « Agents prêts » → carte du bot.', '',
    '| Paire | Statut (hors échantillon) | Trades | Espérance (R) | Creux (R) |', '|---|---|---|---|---|', ...Object.entries(sortie).map(([p, o]) => { const r = o.bots[id], h = r && r.horsEchantillon; return '| ' + p + ' | ' + (r ? (STATUTS[r.statut] || r.statut) : '—') + ' | ' + (h ? h.n : '—') + ' | ' + f2(h && h.esperance) + ' | ' + f2(h && h.ddR) + ' |'; }), '');
}
md.push('## Lecture honnête', '', 'Un bot **NON VALIDÉ** ne propose aucune position et n\'envoie aucune alerte d\'entrée dans Raylé. Ces idées sont célèbres justement parce qu\'elles sont simples ; en M15 sur des cryptos, avec des frais réalistes, elles ont rarement un avantage mesurable hors échantillon. Le résultat ci-dessus est celui du protocole, sans retouche : aucun réglage n\'a été choisi après avoir vu le résultat.', '');
fs.writeFileSync(new URL('../../../docs/BOTS.md', import.meta.url), md.join('\n') + '\n');
console.log('Terminé en ' + Math.round((Date.now() - t0) / 1000) + ' s : docs/BOTS.md, docs/resultats-v2/bots.json, resultats-bots.js');
