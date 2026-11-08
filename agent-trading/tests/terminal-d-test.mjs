/* Tests de la PHASE D du terminal de Rayle (pur, Node) : résumé du carnet (murs, déséquilibre, gros paquets), niveaux qui comptent,
   UN ou DEUX scénarios (niveaux, validation, invalidation, stop, cible), « je ne sais pas », contexte pour /chat, texte local,
   contrôle des chiffres de l'IA, intentions (jamais d'ordre). Usage : node agent-trading/tests/terminal-d-test.mjs */
import { resumeCarnet, niveauxQuiComptent, scenarios, etatTerminal, texteContexte, texteLocal, chiffresVerifies, nombres, intention, MENTION_LECTURE } from '../front/terminal/lecture-rayle.js';

let ok = 0, ko = 0;
const t = (c, m, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', m, d); } };

// carnet
{ const bids = new Map([[99.9, 5], [99.8, 4], [99.5, 60], [97, 500]]), asks = new Map([[100.1, 3], [100.3, 2], [100.6, 80], [103, 900]]);
  const r = resumeCarnet({ bids, asks }, { transactions: [{ t: 1000, p: 100, q: 200, usd: 20000, cote: 'buy' }, { t: 1000, p: 100, q: 1, usd: 100, cote: 'sell' }], seuil: 5000, maintenant: 2000 });
  t(Math.abs(r.milieu - 100) < 1e-9 && Math.abs(r.spread - 0.2) < 1e-9, 'carnet : milieu et spread');
  t(r.mursAchat[0].p === 99.5 && r.mursVente[0].p === 100.6, 'carnet : murs à ± 1 % (les niveaux lointains ignorés)');
  t(r.paquets.length === 1 && r.paquets[0].cote === 'achat', 'carnet : gros paquets récents');
  t(r.acheteurs > 0 && r.acheteurs < 1 && typeof r.lecture === 'string', 'carnet : déséquilibre');
  t(resumeCarnet(null) === null, 'carnet absent : rien'); }

// niveaux et scénarios
const objets = [{ type: 'horizontale', p: 98, etiquette: 'S1' }, { type: 'zone', bas: 104, haut: 105, etiquette: 'R zone' }];
const N = niveauxQuiComptent({ prix: 100, atr: 1, objets, auto: [{ p: 98.1, touches: 9 }, { p: 108, touches: 6 }], zones: [{ p: 95, bas: 94.8, haut: 95.2, tests: 5, tenues: 3 }], liquidites: [{ p: 102, sorte: 'haute' }], ma200: 96.5 });
t(N.dessus[0].p === 102 && N.dessous[0].p === 98 && N.dessous[0].aussi, 'niveaux triés par distance ; les miens priment et absorbent les voisins à < 0,25 ATR');
t(N.dessous.some(n => n.nom === 'SMA 200') && N.dessous.some(n => /testée 5 fois, tenue 3/.test(n.nom)), 'SMA 200 et zones de réaction dans les niveaux');
for (const [tend, sensA] of [['haussière', 'hausse'], ['baissière', 'baisse'], ['neutre', null]]) {
  const S = scenarios({ prix: 100, atr: 1, tendance: tend, niveaux: N });
  t(S.liste.length >= 1 && S.liste.length <= 2, `tendance ${tend} : un ou deux scénarios`, S.liste.length);
  t(S.liste.every(s => s.validation && s.invalidation && Number.isFinite(s.stop) && Number.isFinite(s.cible) && s.R > 0), `tendance ${tend} : niveaux, validation, invalidation, stop, cible`);
  t(S.liste.every(s => (s.sens === 'hausse' ? s.stop < s.entree && s.cible > s.entree : s.stop > s.entree && s.cible < s.entree)), `tendance ${tend} : stop et cible du bon côté`);
  if (sensA) t(S.liste[0].sens === sensA, `tendance ${tend} : scénario A avec la tendance`);
}
t(scenarios({ prix: 100, atr: 1, tendance: 'neutre', niveaux: { dessus: [], dessous: [] } }).liste.length === 0, 'aucun niveau : aucun scénario (avec la raison)');
t(scenarios({ prix: null, atr: 1, niveaux: N }).raison, 'prix inconnu : je ne sais pas');

// état, contexte, texte local
const E = etatTerminal({ actif: 'OR', nomActif: 'Or', unite: 'H1', prix: 100, atr: 1, tendance: { sens: 'haussière', raison: 'test' }, ma200: 96.5, niveaux: N, carnet: resumeCarnet({ bids: new Map([[99.9, 5]]), asks: new Map([[100.1, 5]]) }), annonces: [{ t: 2e12 + 600e3, impact: 'fort', devise: 'USD', titre: 'CPI' }, { t: 2e12 - 1, impact: 'fort', devise: 'USD', titre: 'passé' }], cot: null, cotAbsent: 'Pas de rapport COT pour cet actif.', maintenant: 2e12, memoire: [{ quoi: '10 h question' }] });
t(E.ma200.cote === 'au-dessus' && E.ma200.distanceAtr === 3.5 && E.annonces.length === 1 && E.annonces[0].dansMin === 10, 'état structuré : SMA 200 et distance, annonces à venir');
const fmt = x => Number(x).toFixed(2).replace('.', ','), ctx = texteContexte(E, { fmt, heure: () => '15 h 30' });
t(/SMA 200/.test(ctx) && /Carnet/.test(ctx) && /CPI/.test(ctx) && /Pas de rapport COT/.test(ctx) && /au plus DEUX scénarios/.test(ctx) && /n’invente AUCUN chiffre/.test(ctx) && /Plus tôt aujourd’hui/.test(ctx), 'contexte /chat : tout l’état + consignes + mémoire du jour');
const loc = texteLocal(E, 'etat', { fmt, heure: () => '15 h 30' });
t(loc.endsWith(MENTION_LECTURE) && /Scénario A/.test(loc) && /stop vers/.test(loc) && !/\n/.test(loc), 'texte local parlé (sans IA)');
t(/ne sais pas/.test(texteLocal({ ...E, prix: null }, 'etat')) && /ne sais pas/.test(texteLocal({ ...E, carnet: null }, 'carnet')), 'elle dit quand elle ne sait pas');
t(/carnet/.test(texteLocal(E, 'carnet', { fmt })), 'texte local du carnet');

// chiffres de l'IA
t(JSON.stringify(nombres('4 058,39 et 1 200 puis 12')) === '[4058.39,1200,12]', 'lecture des nombres français');
t(chiffresVerifies('Support à 98,00 puis cible 102,00, dans 10 minutes', ctx).ok, 'réponse dont les chiffres viennent du contexte : acceptée');
t(!chiffresVerifies('Objectif 4 321', ctx).ok, 'chiffre inventé : refusé (texte local à la place)');

// intentions
const I = s => (intention(s) || {}).type;
t(I('achète du bitcoin') === 'ordre' && I('passe un ordre de vente') === 'ordre', 'ordre demandé : refusé (jamais d’ordre)');
t(I('propose-moi une position') === 'proposer', 'proposer une position pré-remplie');
t(I('comment tu le sens aujourd’hui ?') === 'question' && I('où on en est ?') === 'question' && intention("qu'est-ce qui se passe sur le carnet ?").sujet === 'carnet', 'questions reconnues');
t(I('trace les scénarios') === 'tracer-scenarios' && I('efface les scénarios') === 'effacer-scenarios', 'scénarios : tracer, effacer');
t(I('zoome sur le support') === 'zoomer' && I('surligne la résistance') === 'surligner', 'zoomer, surligner');
t(intention('affiche la MA200').type === 'couche' && intention('affiche la MA200').on && intention('masque les supports').on === false, 'afficher / masquer une couche');
t(I('passe en H4') === 'unite' && I('passe sur le bitcoin') === 'actif', 'unité, actif');
t(intention('quelle heure est-il') === null, 'phrase étrangère au terminal : laissée à Rayle');

console.log(`terminal phase D : ${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
