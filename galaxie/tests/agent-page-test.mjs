import { annoter, TERMES, definition } from '../../planetes/mars/pc/agent-v3/glossaire-v3.js';
import { htmlAccueil, htmlPhrase, htmlControle, htmlChiffres, htmlRapport, htmlStrategies, htmlIndisponible, AVERTISSEMENT } from '../../planetes/mars/pc/agent-v3/vue-accueil.js';
import { courbeSimulee, courbeBacktest, reduire, positionsGraphique, positionsDemo, libellePosition } from '../../planetes/mars/pc/agent-v3/courbes-v3.js';
import * as E from '../../strategies/agent-etat.js';
import { courbeReduite } from '../../agent-pc/recherche.mjs';

let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const J = 86400e3, T0 = Date.UTC(2026, 9, 1), validation = { statut: 'validee_backtest', esperance: 0.4 };

/* ── glossaire ── */
v('glossaire : au moins 20 termes, chacun expliqué en une phrase', Object.keys(TERMES).length >= 20 && Object.values(TERMES).every(d => d.length > 25 && d.length < 260));
for (const t of ['POC', 'delta', 'absorption', 'microstructure', 'VWAP']) v('glossaire : « ' + t + ' » est défini', !!definition(t));
{
  const h = annoter('Le POC et le VWAP, puis le POC encore : espérance hors échantillon, delta positif.');
  v('annotation : chaque terme est entouré d’un <abbr> avec sa définition (survol, toucher, focus)', /<abbr class="av3-t" tabindex="0" title="[^"]+" data-def="[^"]+">POC<\/abbr>/.test(h) && /<abbr[^>]*>VWAP<\/abbr>/.test(h) && /<abbr[^>]*>espérance<\/abbr>/.test(h) && /<abbr[^>]*>hors échantillon<\/abbr>/.test(h) && /<abbr[^>]*>delta<\/abbr>/.test(h));
  v('annotation : seulement la PREMIÈRE occurrence', (h.match(/>POC<\/abbr>/g) || []).length === 1);
  v('annotation : jamais à l’intérieur d’un mot (« Rapport » ne contient pas R)', !/<abbr[^>]*>R<\/abbr>apport/.test(annoter('Rapport')) && annoter('Rapport') === 'Rapport');
  v('annotation : une définition ne contient pas d’autre balise imbriquée (pas de terme accroché dans un attribut)', !/title="[^"]*<abbr/.test(annoter('POC VWAP delta ATR drawdown backtest range retest')));
  v('annotation : le HTML déjà échappé et les balises existantes sont intacts', annoter('<b>&lt;POC&gt;</b>').startsWith('<b>&lt;') );
}
/* ── écran ── */
const e = E.etatInitial(T0);
let h = htmlPhrase(e, { pcVivant: true });
v('sans stratégie : la phrase dit « aucune stratégie validée pour l’instant, preuves insuffisantes »', /Aucune stratégie validée pour l’instant\. Preuves insuffisantes\./.test(h) && /Que fait l’agent maintenant/.test(h));
const c = htmlControle(e);
v('contrôle : seulement Pause et la charge — AUCUN bouton « Lancer »', /data-av3="pause"/.test(c) && /data-av3-charge/.test(c) && !/Lancer/i.test(c) && !/data-av3="lancer"/.test(c));
e.parametresRisque.pause = true; v('en pause : le bouton devient « Reprendre »', /data-av3="reprendre"/.test(htmlControle(e)) && /Reprendre/.test(htmlControle(e)) && /en pause/.test(htmlPhrase(e, {})));
e.parametresRisque.pause = false;
E.creerVersion(e, { candidates: [{ famille: 'tendance_ma', paire: 'BTC', params: { a: 1 }, validation }], raison: 'test' }, T0);
e.compteurVariantes = { BTC: 2973, SOL: 100, DOGE: 27 };
const ch = htmlChiffres(e, T0 + 2 * J);
v('trois chiffres : variantes testées (3 100), stratégies validées (1), alertes actives', /3\s100/.test(ch) && />1<\/b><span>stratégies validées/.test(ch) && /alertes actives/.test(ch));
v('version active et date de dernière validation affichées', />v1<\/b>/.test(ch) && /validée le 01\/10\/2026/.test(ch));
v('« variantes testées » est expliqué : « pas une note de qualité »', /pas une note de qualité/.test(ch) && /<abbr[^>]*>variantes testées<\/abbr>/.test(ch));
const r = htmlRapport(e);
v('rapport : 5 lignes en français, source indiquée, rappel final', (r.match(/<li>/g) || []).length === 5 && /ne garantissent rien/.test(r) && /source :/.test(r));
e.rapport = { t: T0, semaine: '2026-S40', lignes: ['a', 'b', 'c', 'd', 'e', 'f'], source: 'LM Studio (dolphin)' }; const r2 = htmlRapport(e);
v('rapport écrit par un modèle : limité à 5 lignes, source nommée', (r2.match(/<li>/g) || []).length === 5 && /LM Studio \(dolphin\)/.test(r2));
v('injection : le texte d’un rapport est échappé', !/<script/.test(htmlRapport({ ...e, rapport: { lignes: ['<script>alert(1)</script>', '2', '3', '4', '5'], source: '<b>x</b>', t: T0 } })));
const page = htmlAccueil(e, { ctx: { pcVivant: true }, source: { origine: 'PC', enMarche: true, t: T0 }, suivi: {}, maintenant: T0 });
v('page : phrase, contrôle, chiffres, graphique, rapport, stratégies, avertissement', ['av3-phrase', 'av3-ctl', 'av3-chiffres', 'data-av3-graph', 'av3-rapport', 'av3-strats', 'av3-pied'].every(k => page.includes(k)));
v('page : l’avertissement « ne garantissent rien / aucun ordre » est TOUJOURS là', page.includes(AVERTISSEMENT) && /Aucun ordre n’est exécuté/.test(AVERTISSEMENT));
v('page : l’origine de l’état est dite (PC ou Worker)', /État lu sur : PC/.test(page));
v('stratégies : phase et nombre de trades simulés', /en simulation/.test(htmlStrategies(e, {})) && /0 trade\(s\) simulé/.test(htmlStrategies(e, {})));
v('indisponible : message clair, jamais de chiffres inventés, commande pour démarrer', /Je ne peux pas le savoir/.test(htmlIndisponible('x')) && /installer-agent/.test(htmlIndisponible('x')) && !/av3-chiffres/.test(htmlIndisponible('x')));
/* ── courbes ── */
{
  const tr = [{ t: 1000, tSortie: 5000, R: 2 }, { t: 6000, tSortie: 9000, R: -1 }, { t: 9500, tSortie: 12000, R: 3 }], s = courbeSimulee(tr, { capital: 10000, risquePct: 1 });
  v('courbe simulée : départ + 3 trades, capital composé (1 % par R), calculé à la main', s.length === 4 && Math.abs(s[3].capital - 10000 * 1.02 * 0.99 * 1.03) < 1e-6 && s[3].R === 4, JSON.stringify(s[3]));
  v('courbe simulée : sans trade → rien (pas de courbe inventée)', courbeSimulee([]).length === 0);
  const b = courbeBacktest([0, 1, 0.5, 2, 3.5], { capital: 10000, risquePct: 1 });
  v('courbe de backtest : séparée de la simulée, en R cumulés → capital', b.length === 5 && Math.abs(b[4].capital - 10350) < 1e-6 && b[4].i === 4);
  v('courbe de backtest : trop courte → rien', courbeBacktest([0]).length === 0 && courbeBacktest(null).length === 0);
  v('réduction de points : ≤ max, premier et dernier gardés', (() => { const p = Array.from({ length: 1000 }, (_, i) => ({ i })), q = reduire(p, 100); return q.length === 100 && q[0].i === 0 && q[99].i === 999; })());
  const cr = courbeReduite(Array.from({ length: 1001 }, (_, i) => i / 10), 200); v('courbe du backtest gardée dans le résumé : ≤ 201 points', cr.length <= 202 && cr[0] === 0 && cr[cr.length - 1] === 100);
}
{
  const suivi = { a: { position: { s: 1, fill: 100, stop: 98, cible: 106, R: 3, t: 1000, raison: ['r1', 'r2'], tailles: { quantite: 50, valeur: 5000 } }, pendante: null, trades: [{ t: 10, tSortie: 20, sens: -1, prixEntree: 90, stop: 92, cible: 84, prixSortie: 84, R: 3, motif: 'cible', version: 1 }, { t: 30, tSortie: 40, sens: 1, prixEntree: 91, stop: 89, cible: 97, prixSortie: 89, R: -1, motif: 'stop', version: 2 }] }, b: { position: null, pendante: { sens: 1, stop: 5, R: 3, signalT: 100, raison: [] }, trades: [] } };
  const etat = { strategies: { a: { nom: 'Tendance', paire: 'BTC' }, b: { nom: 'Fin range', paire: 'SOL' } } };
  const p = positionsGraphique(suivi, etat);
  v('positions : en cours, en préparation, clôturées (gain / perte) avec entrée, stop, objectif, taille', p.length === 4 && p.some(x => x.statut === 'en cours' && x.cible === 106 && x.tailles) && p.some(x => x.statut === 'en préparation') && p.some(x => x.statut === 'clôturée (gain)') && p.some(x => x.statut === 'clôturée (perte)'));
  v('positions : filtre par stratégie', positionsGraphique(suivi, etat, { strategie: 'b' }).length === 1 && positionsGraphique(suivi, etat, { strategie: 'a' }).length === 3);
  v('positions : filtre par version', positionsGraphique(suivi, etat, { strategie: 'a', version: 1 }).filter(x => x.statut.startsWith('clôturée')).length === 1);
  const d = positionsDemo(100, 1e12);
  v('positions DÉMO : toutes marquées DÉMO (nom, libellé, drapeau) et expliquées comme fictives', d.length === 3 && d.every(x => x.demo && /DÉMO/.test(x.nom) && /^DÉMO/.test(libellePosition(x))) && /n’existe pas/.test(d[0].raison.join(' ')));
  v('libellé : sens, statut et rapport risque / gain', /ACHAT en cours · 1 pour 3,0/.test(libellePosition(p.find(x => x.statut === 'en cours'))));
}
/* ── voix ── */
import { detecter, reponseStatut, reponseRapport } from '../../planetes/mars/pc/agent-v3/voix-agent-v3.js';
{
  const cas = [['que fait l agent', 'statut'], ['ou en est l agent', 'statut'], ['comment va kepler', 'statut'], ['donne moi le statut de l agent', 'statut'], ['le rapport de l agent', 'rapport'], ['fais moi le bilan de l agent', 'rapport'], ['mets l agent en pause', 'pause'], ['passe l agent en pause', 'pause'], ['reprends l agent', 'reprendre'], ['relance kepler', 'reprendre'],
    ['envoie le statut de l agent sur telegram', 'telegram'], ['reviens a la version precedente de l agent', 'retour_arriere'], ['mets la charge de l agent a faible', 'charge']];
  for (const [phrase, type] of cas) { const d = detecter(phrase); v('voix : « ' + phrase + ' » → ' + type, d && d.type === type, JSON.stringify(d)); }
  v('voix : charge « fort » reconnue', (detecter('mets la charge de l agent a fort') || {}).valeur === 'fort');
  for (const phrase of ['quel temps fait il', 'ouvre la galaxie', 'mets le graphique tradingview', 'que fait la terre', 'a quoi sert le gardien prop', 'lis le marche']) v('voix : « ' + phrase + ' » n’est PAS pour l’agent (aucun vol de commande)', detecter(phrase) === null, JSON.stringify(detecter(phrase)));
  const e0 = E.etatInitial(T0), r0 = reponseStatut(e0, { pcVivant: true }, T0);
  v('réponse parlée sans stratégie : honnête, pas de promesse, pas de markdown', /aucune n’a passé la validation/.test(r0) && /preuves sont insuffisantes/.test(r0) && !/[*#_`]/.test(r0), r0);
  E.creerVersion(e0, { candidates: [{ famille: 'tendance_ma', paire: 'BTC', params: { a: 1 }, validation }], raison: 't' }, T0);
  v('réponse parlée avec une stratégie : nombre et version', /1 stratégie \(version 1\)/.test(reponseStatut(e0, { pcVivant: true }, T0)));
  v('rapport parlé : plusieurs phrases', reponseRapport(e0, { pcVivant: true }, T0).split('. ').length >= 4);
}
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
