// Tests du rendu de l'onglet « Meilleures pistes » (V6, phase 3) : cartes honnêtes, preuve manquante, profil réglable, plan d'attente, rien d'inventé, pas d'injection de HTML.
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/pistes-ui-test.mjs
import { htmlPistes, htmlPiste, VUES_V4, LIBELLES_V4 } from '../../planetes/mars/pc/trading/panneaux-v4.js';
import { meilleuresPistes, pistesDepuis, PROFIL_45_RR2 } from '../../strategies/pistes.js';
import { planAttente } from '../../strategies/extension-recherche.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

const b = (o = {}) => ({ id: 'x', famille: 'tendance_pullback_h4', nom: 'Tendance H4, repli sur H1', paire: 'BTC', statut: 'non_validee', esperance: 0.17, trades: 110, moisTest: 8, tauxReussite: 0.45, factProfit: 1.7, coutMoyenR: 0.06, bootstrapBas: -0.05, dsr: 0.7, propDdPct: 4, ddR: 8, ratees: ['Voisins des paramètres positifs'], retenus: { ema: 20 }, ...o });
const backtests = [b(), b({ famille: 'f2', nom: 'Seconde piste', paire: 'SOL', esperance: 0.12, bootstrapBas: 0.02, trades: 200 }), b({ famille: 'f3', nom: 'Piste <script>alert(1)</script>', paire: 'DOGE', esperance: 0.3, tauxReussite: 0.4, factProfit: 2.1 })];
const toutes = pistesDepuis(backtests), top = meilleuresPistes(backtests, { n: 5 });
const d = { ok: true, existe: true, pistes: top.map((p, i) => i === 0 ? { ...p, enPepiniere: true, pepiniere: { statut: 'active', trades: 7, jours: 10, moyenne: 0.2, decision: 'continuer' } } : p), toutes, profil: PROFIL_45_RR2, frais: { phrase: 'Frais moyens : 0,25 R par trade. Taux de réussite minimal pour être rentable avec RR=2 : 42 %.', coutMoyenR: 0.25 }, couts: 'Coûts : valeurs prudentes par défaut.', variantes: 24630,
  recherche: { phase: 'attente', niveaux: [{ id: 0, faits: 100, total: 100 }, { id: 1, faits: 40, total: 100 }, { id: 2, faits: 0, total: 288 }], attente: planAttente({ niveaux: [{ id: 0, nom: 'a', total: 1, faits: 1 }], maintenant: Date.UTC(2026, 9, 28, 14), equipe: { derniereExecution: Date.UTC(2026, 9, 28, 12) }, reglage: { fichierPresent: false }, variantes: 24630 }) }, voieCorrigee: false };
const html = htmlPistes(d);
v('onglet déclaré : « Meilleures pistes », en première position des onglets V4', VUES_V4[0] === 'pistes' && LIBELLES_V4.pistes === 'Meilleures pistes');
v('avertissement honnête en haut : résultats de recherche, pas des promesses, critères inchangés, aucun ordre', /pas des promesses/.test(html) && /critères de validation ne changent pas/.test(html) && /Aucun ordre/.test(html));
v('la phrase « Frais moyens… » de l’état est affichée', html.includes('Frais moyens : 0,25 R par trade. Taux de réussite minimal pour être rentable avec RR=2 : 42 %.'));
v('le compteur de variantes et les niveaux sont montrés', /24\s?630 variantes/.test(html) && /0 \(100\/100\) · 1 \(40\/100\) · 2 \(0\/288\)/.test(html));
v('la règle des tests multiples : « ancienne (… règle par défaut) » quand la voie corrigée est désactivée', /ancienne \(tous les essais comptés — règle par défaut\)/.test(html) && /CORRIGÉE \(voie à valider par Justin/.test(htmlPistes({ ...d, voieCorrigee: true })));
v('le plan d’attente apparaît (ce que Kepler attend, échéance)', /Kepler attend, et sait quoi/.test(html) && /Ce que j’attends/.test(html) && /prochaine échéance/.test(html));
v('une carte par piste, avec réussite, rapport gain / risque, réussite d’équilibre, avant / après frais, trades, creux', (html.match(/class="av4-carte av4-piste"/g) || []).length === 3 && /Réussite d’équilibre/.test(html) && /Avant frais/.test(html) && /Après frais/.test(html) && /110 \/ 150/.test(html) && /Creux simulé/.test(html));
v('la preuve manquante est écrite en clair (trades manquants, confiance, hasard)', /Preuve manquante/.test(html) && /il manque 40 trades/.test(html) && /95 % de confiance/.test(html));
v('suivi en direct de la pépinière montré pour la piste qui y est (7 trades en 10 jours)', /7<\/b> trade\(s\) en 10 jour/.test(html) && /test séquentiel : continuer/.test(html));
v('une piste prometteuse hors pépinière dit qu’elle y entre automatiquement (paper trading, aucun ordre)', /Pas encore en pépinière/.test(html));
v('statuts honnêtes visibles : PROMETTEUSE, NON PROUVÉE', /PROMETTEUSE, NON PROUVÉE/.test(html));
v('filtre de profil : trois champs réglables (réussite min, max, gain / risque) et la liste avec l’indication prouvé / prometteur', /data-av4-profil="tauxMin"/.test(html) && /data-av4-profil="tauxMax"/.test(html) && /data-av4-profil="rrMin"/.test(html) && /seulement prometteur/.test(html));
v('changer le profil change la liste (réussite 38–42 % : la piste à 40 % reste, celles à 45 % partent)', (() => { const h = htmlPistes(d, { ...PROFIL_45_RR2, tauxMin: 0.38, tauxMax: 0.42 }); return /<li><b>Piste/.test(h) && !/<li><b>Tendance H4/.test(h); })());
v('profil sans résultat : message clair', /Aucune piste ne ressemble à ce profil/.test(htmlPistes(d, { ...PROFIL_45_RR2, tauxMin: 0.9, tauxMax: 0.95 })));
v('aucune injection : le HTML d’un nom de piste est échappé', !/<script>alert/.test(html) && /&lt;script&gt;/.test(html));
v('aucune valeur inventée : rien d’« undefined » ni de « NaN » dans la page', !/undefined|NaN/.test(html));
v('sans état de l’agent : message honnête', /pas encore tourné/.test(htmlPistes({ ok: true, existe: false })));
v('aucune piste : le dit clairement (jamais une carte vide inventée)', /Aucune piste chiffrée/.test(htmlPistes({ ...d, pistes: [], toutes: [] })));
v('une carte seule se rend aussi (htmlPiste)', /Tendance H4/.test(htmlPiste(top.find(p => p.famille === 'tendance_pullback_h4'))));
console.log('Onglet Meilleures pistes : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
