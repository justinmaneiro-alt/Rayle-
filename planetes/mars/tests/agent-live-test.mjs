import { creerAgent, creerWorkerEnProcessus } from '../pc/agent-btc/agent.js';
import { ouvrirStockageBtc } from '../pc/agent-btc/stockage-btc.js';
import { detecterSujet, expliquer } from '../pc/agent-btc/explications.js';
import { bougiesSynth, marcheMixte, T0 } from './synth-btc.mjs';
import { versBougies } from '../pc/agent-btc/colonnes.js';
import { CRITERES } from '../pc/agent-btc/criteres.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const sansPause = () => Promise.resolve();

/* Faux échange : sert les bougies synthétiques d'un marché mixte de ~3 ans. `horloge.t` = « maintenant » ; seules les bougies fermées sont servies. */
const MARCHE = versBougies(marcheMixte(112000, 21)), PAS = 900e3;
const horloge = { t: MARCHE[3000].t + 2 * 60e3 };
const lire = async url => {
  const t0 = +new URL(url).searchParams.get('startTime'), lim = +new URL(url).searchParams.get('limit');
  const l = MARCHE.filter(b => b.t >= t0 && b.t + PAS <= horloge.t).slice(0, lim);
  return l.map(b => [b.t, b.o, b.h, b.l, b.c, b.v, 0, 0, 1, b.vb, 0, 0]);
};
const permissif = Object.freeze({ ...CRITERES, version: 99, recherche: { tradesMin: 5, esperanceMin: -9, factProfitMin: 0 }, horsEchantillon: { esperanceMin: -9, tradesMin: 5, factProfitMin: 0, drawdownMaxR: 9999, parSemaineMax: 99, parSemaineMin: 0, trimestresPositifsMin: 0, trimestresTradesMin: 1, concentrationMax: 9 },
  robustesse: { voisinsPositifsMin: 0, voisinsMin: 0, medianeVoisinsVsMeilleur: -99 }, monteCarlo: { simulations: 200, drawdownP95MaxR: 9999, esperanceP5Min: -99 }, comparaisonsMultiples: { facteur: 0 }, jeuFinal: { esperanceMin: -9, tradesMin: 1, factProfitMin: 0, drawdownMaxR: 9999, parSemaineMax: 99 } });
const attendreRecherche = async a => { for (let i = 0; i < 4000; i++) { if (!a.instantane().recherche.enCours) return; await new Promise(r => setTimeout(r, 5)); } throw new Error('recherche trop longue'); };

// ── démarrage : historique, lecture, aucun setup sans stratégie ──
horloge.t = MARCHE[100000].t + 2 * 60e3;
const st = await ouvrirStockageBtc(null), alertes = [];
const agent = creerAgent({ stockage: st, lire, maintenant: () => horloge.t, surAlerte: a => alertes.push(a), criteres: permissif, periodeMs: 1e9 });
// accélère le test : pas de pause entre pages (l'historique réel dort 150 ms par page)
const snap0 = await agent.demarrer({ synchro: false, boucle: false });
v('démarrage à vide : aucune donnée, aucun setup, aucune recherche faite', snap0.donnees.n === 0 && snap0.etatStrategie === 'jamais');
await agent.historique.synchroniser(); await agent._traiter([]);
let s = agent.instantane();
v('données chargées : source Binance, delta RÉEL à 100 %, durée en années', s.donnees.n > 90000 && s.donnees.source === 'binance' && s.donnees.deltaReelPct === 1 && s.donnees.annees > 2.5, JSON.stringify([s.donnees.n, s.donnees.source, s.donnees.annees]));
v('lecture du marché disponible avec phase, volume, direction, profil', s.lecture && s.lecture.ok && s.lecture.phase.phase && s.lecture.profil && s.lecture.direction);
v('sans stratégie : « pas de setup », dit pourquoi (aucune recherche faite)', s.setup.statut === 'aucun' && /Aucune recherche/.test(s.setup.raison), s.setup && s.setup.raison);
v('sans stratégie : aucune alerte', alertes.length === 0 && s.alertes.length === 0);

// ── recherche (Worker en processus) puis stratégie suivie ──
agent.lancerRecherche({ generationsMax: 1 });
v('recherche : démarre, état « en recherche », compteur de variantes qui monte', agent.instantane().etatStrategie === 'en_recherche');
await attendreRecherche(agent);
s = agent.instantane();
v('recherche : verdict enregistré avec critères figés et nombre de variantes', s.verdict && s.verdict.nVariantes > 100 && s.verdict.criteres.version === 99 && s.journal.length > 5);
v('recherche : journal d’expériences avec décisions et raisons', s.journal.some(j => j.etape === 'famille' && j.decision && j.pourquoi));
v('recherche : critères permissifs → stratégie validée, jeu final ouvert une fois (coffre)', s.etatStrategie === 'validee' && s.coffre.ouverts.length === 1 && s.strategie.validee && s.strategie.jeuFinal.stats.n >= 1, s.etatStrategie);

// ── suivi en direct : on avance l'horloge bougie par bougie ──
let entrees = 0, preparations = 0, vuEntree = null, vuPrep = null;
const t0 = MARCHE[100000].t;
for (let k = 100001; k < 111000; k++) {
  horloge.t = MARCHE[k].t + PAS + 60e3;                                     // la bougie k vient de fermer
  await agent.miseAJour();
  const x = agent.instantane();
  if (x.setup && x.setup.statut === 'entree' && !vuEntree) vuEntree = x.setup;
  if (x.setup && x.setup.statut === 'preparation' && !vuPrep) vuPrep = x.setup;
  if (vuEntree && x.compte.fermees.length >= 3) break;
}
s = agent.instantane();
v('direct : les bougies fermées sont ajoutées une par une', s.donnees.n > 100001 && s.donnees.fin > t0);
v('direct : des alertes PRÉPARATION et ENTRÉE ont été émises par la stratégie validée', s.alertes.some(a => a.type === 'ENTREE') && s.alertes.some(a => a.type === 'PREPARATION') && alertes.some(a => a.type === 'ENTREE'), JSON.stringify(s.alertes.map(a => a.type)));
const e = s.alertes.filter(a => a.type === 'ENTREE')[0];
v('alerte ENTRÉE complète : sens, entrée, stop, objectif, R visé, taille selon le risque, invalidation, phase', e && [1, -1].includes(e.sens) && e.entree > 0 && e.stop > 0 && e.cible > 0 && e.R >= 4 && e.R <= 6 && e.risqueCash > 0 && e.quantite > 0 && e.invalidation.length > 20 && e.phase && e.texte, JSON.stringify(e));
v('alerte ENTRÉE : stop du bon côté, objectif = entrée ± R × distance', e && (e.sens > 0 ? e.stop < e.entree && e.cible > e.entree : e.stop > e.entree && e.cible < e.entree) && Math.abs(Math.abs(e.cible - e.entree) - e.R * Math.abs(e.entree - e.stop)) < 1e-6 * e.entree);
v('alerte ENTRÉE : taille = risque en € ÷ distance au stop', e && Math.abs(e.quantite / (e.risqueCash / Math.abs(e.entree - e.stop)) - 1) < 0.12 && e.risqueCash > 0);
const prep = s.alertes.find(a => a.type === 'PREPARATION');
v('alerte PRÉPARATION : niveau, distance en ATR, texte « pas encore une entrée »', prep && prep.niveau > 0 && prep.distanceATR != null && /PRÉPARATION/.test(prep.texte));
// limites strictes
const parSemaine = {}; for (const a of s.alertes.filter(x => x.type === 'ENTREE')) { const w = Math.floor((a.tSignal / 86400e3 + 3) / 7); parSemaine[w] = (parSemaine[w] || 0) + 1; }
v('limite : jamais plus de 3 entrées par semaine (réglage par défaut)', Math.max(0, ...Object.values(parSemaine)) <= 3, JSON.stringify(parSemaine));
v('une seule position simulée à la fois', s.compte.ouvertes.length + s.compte.attente.length <= 1);
const fer = s.compte.fermees;
v('compte simulé : les positions sont suivies jusqu’au résultat (stop, cible ou temps), en R et en capital', fer.length >= 1 && fer.every(x => x.motif && Number.isFinite(x.R) && Number.isFinite(x.pnl) && x.risqueCash > 0), JSON.stringify(fer[0]));
v('compte simulé : stats (trades, réussite, espérance, facteur de profit, creux, courbe de capital) — séparées du backtest', s.compte.valide.n === fer.filter(x => x.groupe === 'valide').length && s.compte.valide.courbe.length === s.compte.valide.n + 1 && s.compte.valide.capitalFinal > 0 && s.strategie.horsEchantillon.n > 0);
v('repos entre deux positions respecté (4 h)', fer.every((x, i, a) => i === 0 || x.t - a[i - 1].tSortie >= -1) );
v('« pas de setup » quand rien n’est réuni, avec la raison', (() => { for (const a of [agent]) { const x = a.instantane(); return ['aucun', 'preparation', 'entree', 'bloque'].includes(x.setup.statut); } })());

// ── réglages et sécurité ──
await agent.reglages({ risquePct: 99, maxParSemaine: 50, charge: 'max', observation: true, capital: 'abc' });
const r = agent.instantane().reglages;
v('réglages bornés : risque ≤ 5 %, positions par semaine ≤ 5, valeur invalide ignorée', r.risquePct === 5 && r.maxParSemaine === 5 && r.capital === 10000 && r.charge === 'max' && r.observation === true);
await agent.reglages({ risquePct: 1, maxParSemaine: 3, observation: false });
v('aucune clé de courtier, aucun ordre : l’agent n’a que des méthodes de lecture, d’alerte et de simulation', !Object.keys(agent).some(k => /ordre|courtier|broker|envoyer|executer/i.test(k)));
const sauve = await st.lire('agent');
v('état sauvegardé sur le disque (réglages, journal, compte, alertes) sans les données lourdes', sauve && sauve.valeur.journal.length > 5 && sauve.valeur.compte.fermees.length >= 1 && !sauve.valeur.verdict.strategie.tradesFinal);
agent.detruire();
// redémarrage : même état
{
  const a2 = creerAgent({ stockage: st, lire, maintenant: () => horloge.t, criteres: permissif, periodeMs: 1e9 });
  const sn = await a2.demarrer({ synchro: false, boucle: false });
  v('redémarrage : l’agent retrouve sa stratégie validée, son journal et son compte', sn.etatStrategie === 'validee' && sn.journal.length > 5 && sn.compte.valide.n >= 1 && sn.donnees.n > 100000);
  a2.detruire();
}

// ── mode observation : une candidate NON validée n'émet jamais d'alerte d'entrée ──
{
  const st2 = await ouvrirStockageBtc(null), al2 = [];
  horloge.t = MARCHE[100000].t + 2 * 60e3;
  const a3 = creerAgent({ stockage: st2, lire, maintenant: () => horloge.t, surAlerte: x => al2.push(x), criteres: CRITERES, periodeMs: 1e9 });
  await a3.demarrer({ synchro: false, boucle: false }); await a3.historique.synchroniser(); await a3._traiter([]);
  a3.lancerRecherche({ generationsMax: 1 }); await attendreRecherche(a3);
  const x = a3.instantane();
  v('critères RÉELS sur un marché synthétique : verdict honnête, pas d’alerte sans validation', ['aucune', 'rejetee', 'attente_jeu_final', 'validee'].includes(x.etatStrategie) && (x.etatStrategie === 'validee' || (al2.length === 0 && /pas de setup|Aucune stratégie/i.test(x.setup.raison))), x.etatStrategie);
  a3.detruire();
}

// ── explications ──
{
  const S = agent.instantane();
  const cas = [['qu’est-ce que fait l’agent ?', 'agent'], ['en quelle phase est le marché ?', 'phase'], ['pourquoi ce setup ?', 'setup'], ['résume les backtests', 'backtests'], ['qu’est-ce que le volume profile ?', 'volume_profile'], ['c’est quoi le delta ?', 'delta'], ['résume le marché bitcoin', 'marche'], ['y a-t-il un setup ?', 'setup'], ['à quoi sert l’agent bitcoin', 'agent'], ['quelle est la phase du bitcoin', 'phase']];
  for (const [q, sujet] of cas) { const d = detecterSujet(q); v('voix : « ' + q + ' » → ' + sujet, d && d.sujet === sujet, JSON.stringify(d)); }
  v('voix : une question libre ou sans rapport n’est PAS prise', detecterSujet('que penses-tu de la politique monétaire de la banque centrale européenne ces derniers mois') === null && detecterSujet('quel temps fait-il à Paris') === null && detecterSujet('montre-moi le bitcoin en H4') === null);
  for (const sujet of ['agent', 'phase', 'setup', 'backtests', 'volume_profile', 'delta', 'marche']) {
    const t = expliquer(sujet, S);
    v('explication « ' + sujet + ' » : phrases en français, sans markdown ni émoji, non vide', typeof t === 'string' && t.length > 30 && !/[*#`]|[\u{1F300}-\u{1FAFF}]/u.test(t), t && t.slice(0, 80));
  }
  v('explication des backtests : chiffres de la stratégie, nombre de variantes, « les résultats passés ne garantissent rien »', /espérance/.test(expliquer('backtests', S)) && /variantes/.test(expliquer('backtests', S)) && /ne garantissent rien/.test(expliquer('backtests', S)));
  v('explication « agent » : dit qu’il ne passe aucun ordre et que ce n’est pas un conseil', /aucun ordre/.test(expliquer('agent', S)) && /pas un conseil/.test(expliquer('agent', S)));
  v('explication « phase » : vient des données (la phase lue)', expliquer('phase', S).includes(S.lecture.phase.phase));
  v('explication « volume profile » : le POC cité est le POC calculé', expliquer('volume_profile', S).includes(Math.round(S.lecture.profil.poc).toLocaleString('fr-FR')));
  const vide = { donnees: {}, lecture: null, setup: null, etatStrategie: 'jamais', verdict: null, strategie: null };
  v('sans données : les explications le disent, rien d’inventé', /pas encore/.test(expliquer('phase', vide)) && /Aucun backtest/.test(expliquer('backtests', vide)) && /pas encore évalué/.test(expliquer('setup', vide)));
  v('sans stratégie validée, l’explication « agent » dit qu’il n’y a aucune position à proposer', /aucune position à proposer/.test(expliquer('agent', { ...vide, donnees: { annees: 3 }, etatStrategie: 'aucune' })));
}

console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
