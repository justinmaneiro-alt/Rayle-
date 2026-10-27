// Tests des 5 bots open source adaptés (V2, phase 7) : causalité, signaux, stops, backtest reproductible, validation honnête, licences et mentions.  Lancer :  node planetes/mars/tests/v2-bots-test.mjs
import { BOTS, ORDRE_BOTS, ORIGINES, MENTION_PAPIER, FAMILLES_BOTS } from '../pc/agents-v2/bots-externes.js';
import { AGENTS, ORDRE_AGENTS } from '../pc/agents-v2/registre-agents.js';
import { validerAgent, backtester } from '../pc/agents-v2/validation-agent.js';
import { proposer } from '../pc/agents-v2/proposition.js';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { verifierSignaux } from '../pc/agent-m6/causalite.js';
import { FAMILLES, ORDRE_TOUTES } from '../pc/agent-btc/hypotheses.js';
import { marcheMixte, serieSynth } from './synth-btc.mjs';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

v('5 bots, 7 agents au total dans le registre', ORDRE_BOTS.length === 5 && ORDRE_AGENTS.length === 7 && ORDRE_AGENTS.every(id => AGENTS[id]));
v('les bots sont dans le registre des hypothèses mais PAS dans la recherche automatique', ORDRE_BOTS.every(id => FAMILLES[id] === FAMILLES_BOTS[id]) && !ORDRE_TOUTES.some(id => ORDRE_BOTS.includes(id)));
// ── licences et origine ──
v('chaque bot cite son projet d’origine, son dépôt https, sa licence et ce qu’on en a repris', ORDRE_BOTS.every(id => { const o = BOTS[id].origine; return o.projet && /^https:\/\//.test(o.depot) && o.licence && o.note; }));
v('licences vérifiées : Jesse MIT, Freqtrade GPL-3.0, idée publique du Donchian, Apache-2.0 pour le dépôt de Bollinger', ORIGINES.jesse.licence === 'MIT' && ORIGINES.freqtrade_001.licence === 'GPL-3.0' && ORIGINES.freqtrade_sample.licence === 'GPL-3.0' && /idée publique/.test(ORIGINES.turtle.licence) && /Apache-2\.0/.test(ORIGINES.bollinger.licence));
v('les projets GPL sont marqués « IDÉE reprise, code non copié »', [ORIGINES.freqtrade_001, ORIGINES.freqtrade_sample].every(o => /code non copié/.test(o.note)));
v('mention « paper trading seulement, aucune clé, aucun ordre »', /PAPER TRADING/.test(MENTION_PAPIER) && /aucune clé/.test(MENTION_PAPIER) && /aucun ordre/.test(MENTION_PAPIER));
v('chaque bot a une description et une explication par réglage', ORDRE_BOTS.every(id => BOTS[id].description.length > 60 && Object.keys(BOTS[id].famille.grille()).every(k => BOTS[id].aide[k] && BOTS[id].aide[k][1].length > 15)));
v('grilles petites (≤ 36 variantes chacune)', ORDRE_BOTS.every(id => Object.values(BOTS[id].famille.grille()).reduce((s, l) => s * l.length, 1) <= 36));
v('les catégories couvrent tendance, moyennes mobiles, cassure de range et retour à la moyenne', ['tendance', 'moyennes mobiles', 'cassure de range', 'retour à la moyenne'].every(c => ORDRE_BOTS.some(id => BOTS[id].categorie === c)));

// ── causalité et signaux ──
const PARAMS = id => Object.fromEntries(Object.entries(BOTS[id].famille.grille()).map(([k, l]) => [k, l[0]]));
const serie = marcheMixte(5200, 11), grand = marcheMixte(30000, 5), cg = construireContexte(grand);
for (const id of ORDRE_BOTS) {
  const f = s => FAMILLES_BOTS[id].signaux(construireContexte(s), PARAMS(id));
  const r = verifierSignaux(f, serie, [900, 1600, 2400, 3300, 4300, 5100], { de: 400 });
  v(id + ' : aucune fuite du futur (' + r.testes + ' contrôles)', r.ok, JSON.stringify(r.violations.slice(0, 1)));
  const s = FAMILLES_BOTS[id].signaux(cg, PARAMS(id)), n = Array.from(s.sens).filter(x => x).length;
  v(id + ' : produit des signaux sur un marché qui alterne range, hausse et baisse (' + n + ')', n >= 3, String(n));
  let bon = true; for (let i = 0; i < s.sens.length; i++) if (s.sens[i]) { if (s.sens[i] > 0 ? !(s.stop[i] < grand.c[i]) : !(s.stop[i] > grand.c[i])) bon = false; }
  v(id + ' : le stop est toujours du bon côté du prix', bon);
  const b1 = backtester(grand, id, PARAMS(id), { ctx: cg }), b2 = backtester(grand, id, PARAMS(id));
  v(id + ' : backtest reproductible, zone de recherche seulement', JSON.stringify(b1.trades.map(t => [t.t, t.R])) === JSON.stringify(b2.trades.map(t => [t.t, t.R])) && b1.trades.every(t => t.entree < Math.floor(grand.n * 0.75)) && b1.jeuFinalOuvert === false);
}
// ── validation : le hasard n'est jamais validé ; les mêmes critères que tout le reste ──
const trois = 3 * 365 * 96, hasard = serieSynth({ segments: [{ n: trois, derive: 0, bruit: 0.2, volume: 100 }], graine: 21 }), ctxH = construireContexte(hasard);
for (const id of ORDRE_BOTS) { const r = validerAgent(hasard, id, { ctx: ctxH }); v(id + ' : un marché sans avantage n’est JAMAIS validé hors échantillon', r.statut !== 'valide_oos' && r.jeuFinalOuvert === false && r.criteres.version === 1, r.statut); }
// ── propositions : un bot non validé ne propose rien ──
const idb = 'bot_donchian', sg = FAMILLES_BOTS[idb].signaux(cg, PARAMS(idb)); let k = -1; for (let i = 2500; i < cg.n; i++) if (sg.sens[i]) { k = i; break; }
const p = proposer({ ctx: cg, id: idb, params: PARAMS(idb), i: k, validation: null, cout: { fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 } });
v('un bot jamais validé : signal indicatif, AUCUNE position proposée', p.statut === 'refusee' && /AUCUNE position/.test(p.raison));
const p2 = proposer({ ctx: cg, id: idb, params: PARAMS(idb), i: k, validation: { statut: 'valide_oos' } });
v('un bot validé (cas fabriqué) : entrée avec stop et objectifs en R, « aucun ordre »', p2.statut === 'entree' && /aucun ordre/.test(p2.texte));
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
