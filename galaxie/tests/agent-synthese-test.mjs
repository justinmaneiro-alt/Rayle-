// Synthèse de l'agent pour les fenêtres de la table (V3b) : mêmes chiffres que l'écran Agent, « pourquoi pas de setup » chiffré, régimes par actif, pannes dites. Lancer : node galaxie/tests/agent-synthese-test.mjs
import * as E from '../../strategies/agent-etat.js';
import { CRITERES3 } from '../../strategies/criteres-v3.js';
import { meilleursEssais, manque, resumeManque, reelAgent, reelPropositions, reelRegimes } from '../../planetes/mars/pc/agent-v3/synthese-agent.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const T0 = Date.UTC(2026, 9, 28, 12), J = 86400e3;
const etat = E.etatInitial(T0 - 5 * J);
etat.compteurVariantes = { BTC: 2818, SOL: 2833, DOGE: 2818 };
etat.backtests.push(
  { id: 'a:BTC:exploration', famille: 'a', paire: 'BTC', type: 'exploration', t: T0 - 3600e3, trades: 700, esperance: -0.30, bootstrapBas: -0.5, dsr: 1e-9, ratees: ['x', 'y', 'z'] },
  { id: 'a:BTC:exploration', famille: 'a', paire: 'BTC', type: 'exploration', t: T0 - 60e3, trades: 714, esperance: -0.21, bootstrapBas: -0.35, dsr: 5e-10, ratees: ['x', 'y'] },   // plus récente : remplace la précédente
  { id: 'b:BTC:exploration', famille: 'b', paire: 'BTC', type: 'exploration', t: T0, trades: 400, esperance: 0.05, bootstrapBas: -0.1, dsr: 0.2, ratees: ['x'] },
  { id: 'a:SOL:exploration', famille: 'a', paire: 'SOL', type: 'exploration', t: T0, trades: 0, esperance: 0.9, ratees: [] },   // sans trade : ignorée
  { id: 'a:DOGE:exploration', famille: 'a', paire: 'DOGE', type: 'exploration', t: T0, trades: 300, esperance: -0.4, ratees: ['x', 'y', 'z', 'w'] });
const lecture = { origine: 'PC', enMarche: true, etat, suivi: {}, t: T0 };

// ── meilleurs essais ──
const m = meilleursEssais(etat);
v('meilleur essai BTC : la plus haute espérance (b), pas la plus ancienne', m.BTC.famille === 'b' && m.BTC.esperance === 0.05);
v('essai sans trade ignoré (SOL)', !m.SOL);
v('DOGE présent', m.DOGE && m.DOGE.esperance === -0.4);
v('dernière évaluation d’une même variante : la plus récente seule compte', (() => { const x = E.etatInitial(T0); x.backtests.push({ id: 'q', famille: 'f', paire: 'BTC', type: 't', t: 1, trades: 9, esperance: 5 }, { id: 'q', famille: 'f', paire: 'BTC', type: 't', t: 2, trades: 9, esperance: -1 }); return meilleursEssais(x).BTC.esperance === -1; })());
v('état vide : aucun essai', Object.keys(meilleursEssais(E.etatInitial(T0))).length === 0 && Object.keys(meilleursEssais(null)).length === 0);

// ── ce qu'il manque ──
const mq = manque({ esperance: -0.21, trades: 714, bootstrapBas: -0.35, dsr: 5e-10 });
v('4 critères chiffrés', mq.length === 4);
v('espérance : requis = seuil écrit (≥ +0,25 R)', mq[0].requis === '≥ +0,25 R' && mq[0].ok === false && mq[0].valeur === '−0,21 R'.replace('−', '-') || mq[0].valeur === '-0,21 R', JSON.stringify(mq[0]));
v('trades : 714 ≥ 150 → ok', mq[1].ok === true && mq[1].requis === '≥ ' + CRITERES3.horsEchantillon.tradesMin);
v('borne de confiance négative → pas ok', mq[2].ok === false);
v('Sharpe déflaté 0,0 % → pas ok, requis ≥ 95 %', mq[3].ok === false && mq[3].requis === '≥ 95 %');
v('résumé : cite ce qui manque et PAS ce qui est atteint', /gain moyen/.test(resumeManque({ esperance: -0.21, trades: 714, bootstrapBas: -0.35, dsr: 0 })) && !/nombre de trades/.test(resumeManque({ esperance: -0.21, trades: 714, bootstrapBas: -0.35, dsr: 0 })));
v('tout atteint : message de robustesse et jeu final', /jeu final/.test(resumeManque({ esperance: 0.4, trades: 300, bootstrapBas: 0.1, dsr: 0.99 })));
v('essai absent : rien à dire', manque(null).length === 0);

// ── fenêtre « Agent BTC » ──
let r = reelAgent(lecture, T0);
const val = nom => (r.liste.find(x => x.g === nom) || {}).d;
v('Agent BTC : état ok, source = service du PC', r.etat === 'ok' && /service du PC/.test(r.etiquette));
v('Agent BTC : variantes testées = somme des trois paires (8 469)', val('Variantes testées').replace(/\s| /g, '') === '8469', val('Variantes testées'));
v('Agent BTC : 0 stratégie validée, aucune version', val('Stratégies validées') === '0' && val('Version active') === 'aucune');
v('Agent BTC : la phrase d’état est celle de l’agent (aucune stratégie validée)', /Aucune stratégie validée|aucune stratégie/i.test(r.entete), r.entete);
v('Agent BTC : jamais de « PAS DE RECHERCHE » ni de « Lancer »', !JSON.stringify(r).match(/PAS DE RECHERCHE|Lancer/i));
r = reelAgent({ ...lecture, origine: 'Worker', enMarche: false }, T0); v('Worker, service arrêté : dit d’où viennent les chiffres', /Worker/.test(r.etiquette) && /service arrêté/.test(r.etiquette));
v('rien du tout : INDISPONIBLE avec raison', reelAgent(null).etat === 'indisponible' && /service/.test(reelAgent(null).erreur));
v('erreur de lecture transmise', reelAgent({ erreur: 'HTTP 401' }).erreur === 'HTTP 401');

// ── propositions ──
r = reelPropositions(lecture, T0);
v('Propositions sans position : contenu utile (≥ 5 lignes)', r.etat === 'ok' && r.liste.length >= 5, String(r.liste.length));
v('dit POURQUOI : aucune stratégie validée', r.liste[0].g.startsWith('Pourquoi') && /aucune stratégie validée/.test(r.liste[0].d));
v('meilleure piste de chaque actif avec son espérance et le nombre de critères ratés', r.liste.some(x => /Bitcoin/.test(x.g) && /\+0,05 R/.test(x.d)) && r.liste.some(x => /Dogecoin/.test(x.g) && /4 critères/.test(x.d)) && !r.liste.some(x => /Solana/.test(x.g)));
v('dit ce qu’il faut pour valider, avec les vrais seuils', r.liste.some(x => x.g === 'Pour valider' && x.d.includes('150') && x.d.includes('+0,25') && x.d.includes('95 %')));
v('aucun ordre : dit en pied', /aucun ordre/.test(r.pied));
const avecEntree = { ...lecture, etat: { ...etat, alertes: [{ type: 'ENTREE', t: T0 - 3600e3, titre: '🟢 SIMULATION · ACHAT · Tendance · BTC', mode: 'SIMULATION' }] } };
r = reelPropositions(avecEntree, T0); v('une entrée récente remplace l’explication et reste étiquetée SIMULÉ', r.etiquette === 'SIMULÉ' && r.liste.length === 1 && /ACHAT/.test(r.liste[0].g));
r = reelPropositions({ ...avecEntree, etat: { ...etat, alertes: [{ type: 'ENTREE', t: T0 - 30 * 3600e3, titre: 'vieille', mode: 'SIMULATION' }] } }, T0); v('une entrée de plus de 12 h n’est plus « une proposition »', r.liste[0].g.startsWith('Pourquoi'));
r = reelPropositions({ ...lecture, suivi: { x: { position: { s: 1, stop: 66000, cible: 70000 } } } }, T0); v('position simulée ouverte : montrée avec stop et cible', r.etiquette === 'SIMULÉ' && /stop 66000/.test(r.liste[0].d));
v('Propositions sans état : indisponible avec raison', reelPropositions(null).etat === 'indisponible');

// ── régimes ──
const regimes = { BTC: { ok: true, regime: { code: 3, nom: 'range', adx: 14.2, haut: 68500, bas: 66200, volatil: false } }, SOL: { ok: true, regime: { code: 1, nom: 'tendance haussière', adx: 31, volatil: true } }, DOGE: { ok: false, erreur: 'Binance HTTP 451' } };
r = reelRegimes(regimes, lecture, T0);
v('Régime : une ligne par actif', r.etat === 'ok' && r.liste.length === 3);
v('range : borne basse et haute affichées', /range/.test(r.liste[0].d) && /66\s?200/.test(r.liste[0].d.replace(/ /g, ' ')) && /68\s?500/.test(r.liste[0].d.replace(/ /g, ' ')), r.liste[0].d);
v('tendance haussière agitée avec ADX', /tendance haussière · agité · ADX 31/.test(r.liste[1].d));
v('actif en panne : dit pourquoi, en rouge', /indisponible : Binance HTTP 451/.test(r.liste[2].d) && r.liste[2].c === '#ff6b6b');
v('dit que le régime décrit le marché sans proposer d’entrée tant qu’aucune stratégie n’est validée', /aucune stratégie validée/.test(r.pied));
v('aucun régime calculé : « en préparation » avec la raison', reelRegimes({}, lecture).etat === 'bientot' && /bougies H1/.test(reelRegimes({}, lecture).message));
console.log(`${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
