import { historiquePaire } from './m6c-donnees.mjs';
import { analyserAssistant } from '../pc/agent-m6c/assistant-regime.js';

/* Photographie du moment (dernière bougie fermée de chaque paire, données du cache local) : usage manuel. */
for (const p of (process.argv[2] || 'BTC,SOL,DOGE').split(',')) {
  const { serie } = await historiquePaire(p), t = Date.now(), a = analyserAssistant({ serie, paire: p });
  console.log(p, 'dernière bougie', new Date(serie.t[serie.n - 1]).toISOString(), '| calcul', Date.now() - t, 'ms');
  if (!a.ok) { console.log(' ', a.erreur); continue; }
  for (const ph of a.phrases) console.log('  -', ph);
  console.log('  alertes :', a.alertes.map(x => x.type).join(', ') || 'aucune', '| dessins', a.dessins.length);
}
