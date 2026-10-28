// Tests des « meilleures pistes » (V6, phase 3) : classement honnête, preuve manquante en clair, filtre « 45 % / RR ≥ 2 », rien n'est accordé.
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/pistes-test.mjs
import { meilleuresPistes, pistesDepuis, statutPiste, preuveManquante, filtrerProfil, PROFIL_45_RR2, espereProfil, phrasePiste, lignesRapportPistes } from '../../strategies/pistes.js';
import { CRITERES3, empreinteV3 } from '../../strategies/criteres-v3.js';
import { empreinteCriteres } from '../../planetes/mars/pc/agent-btc/criteres.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

const b = (o = {}) => ({ id: 'x', famille: 'tendance_pullback_h4', nom: 'Tendance H4, repli sur H1', paire: 'BTC', statut: 'non_validee', esperance: 0.17, trades: 110, moisTest: 8, tauxReussite: 0.32, factProfit: 1.4, coutMoyenR: 0.06, bootstrapBas: -0.05, dsr: 0.7, propDdPct: 4, ddR: 8, ratees: ['Objectif : nombre de trades hors échantillon', 'Voisins des paramètres positifs'], retenus: { ema: 20 }, ...o });
const liste = [
  b({ id: 'a', famille: 'f1', esperance: 0.30, bootstrapBas: -0.10, trades: 160 }),                                       // forte espérance mais pas de confiance : chanceuse ?
  b({ id: 'b', famille: 'f2', esperance: 0.14, bootstrapBas: 0.03, trades: 220 }),                                       // modeste mais solide
  b({ id: 'c', famille: 'f3', esperance: -0.20, trades: 400, bootstrapBas: -0.3 }),                                      // décevante
  b({ id: 'd', famille: 'f4', statut: 'rejetee_causalite', esperance: 2 }),                                              // triche : écartée
  b({ id: 'e', famille: 'f5', statut: 'validee_backtest', esperance: 0.3, bootstrapBas: 0.1, jeuFinal: { ok: true, ouvert: true } }),   // prouvée
  b({ id: 'f', famille: 'f6', esperance: 0.4, trades: 8 })                                                                // trop peu de trades
];
v('statuts : prouvée, validée en backtest, prometteuse, décevante, rejetée', statutPiste(liste[4]).code === 'prouvee' && statutPiste({ ...liste[4], jeuFinal: { ok: false } }).code === 'validee_backtest' && statutPiste(liste[0]).code === 'prometteuse' && statutPiste(liste[2]).code === 'decevante' && statutPiste(liste[3]).code === 'rejetee');
const top = meilleuresPistes(liste, { n: 5 });
v('classement : la prouvée d’abord, puis par borne BASSE de confiance (la modeste solide avant la forte chanceuse)', top[0].famille === 'f5' && top.findIndex(p => p.famille === 'f2') < top.findIndex(p => p.famille === 'f1'), top.map(p => p.famille).join(','));
v('une stratégie qui regarde le futur n’apparaît jamais ; moins de 20 trades non plus', !top.some(p => p.famille === 'f4' || p.famille === 'f6'));
v('au plus 5 pistes', meilleuresPistes(Array.from({ length: 12 }, (_, i) => b({ id: 'k' + i, famille: 'g' + i })), { n: 5 }).length === 5);
const p = pistesDepuis([b()])[0];
v('chaque piste porte réussite, rapport gain / risque, taux d’équilibre, avant / après frais, trades, trades par mois', p.tauxReussite === 0.32 && p.rrMoyen > 2 && Math.abs(p.tauxEquilibre - 1.06 / (1 + 1.4 * 0.68 / 0.32)) < 1e-9 && Math.abs(p.esperanceAvant - 0.23) < 1e-9 && p.esperanceApres === 0.17 && p.trades === 110 && Math.abs(p.tradesParMois - 13.75) < 1e-9);
v('rapport gain / risque tiré du facteur de profit : 1,4 × 0,68 / 0,32 ≈ 2,98', Math.abs(p.rrMoyen - 1.4 * 0.68 / 0.32) < 1e-9);
const pm = preuveManquante(b());
v('preuve manquante en clair : trades (avec le rythme), espérance, confiance, hasard, voisins', pm.some(m => m.critere === 'trades' && /40 trades/.test(m.texte) && /par mois/.test(m.texte)) && pm.some(m => m.critere === 'esperance') && pm.some(m => m.critere === 'confiance') && pm.some(m => m.critere === 'hasard') && pm.some(m => m.critere === 'voisins'), pm.map(m => m.critere).join(','));
v('le texte dit que les trades manquants viennent de NOUVELLES données (simulation directe ou jeu final), pas de la zone déjà utilisée', /NOUVELLES données/.test(pm[0].texte));
v('estimation du temps : « environ 3 mois » pour 40 trades à 13,75 par mois', /environ 3 mois/.test(pm[0].texte), pm[0].texte);
v('plus rien ne manque quand tout est acquis', preuveManquante(b({ trades: 200, esperance: 0.4, bootstrapBas: 0.1, dsr: 0.99, propDdPct: 3, ratees: [] })).length === 0);
// profil 45 % / RR ≥ 2
const lp = [b({ id: 'p1', famille: 'p1', tauxReussite: 0.45, factProfit: 1.7 }),      // rr = 1,7 × 0,55 / 0,45 = 2,08 : dans le profil
  b({ id: 'p2', famille: 'p2', tauxReussite: 0.60, factProfit: 1.3 }),                // 60 % : hors plage
  b({ id: 'p3', famille: 'p3', tauxReussite: 0.45, factProfit: 1.1 }),                // rr 1,35 < 2
  b({ id: 'p4', famille: 'p4', tauxReussite: 0.42, factProfit: 1.9, statut: 'validee_backtest', jeuFinal: { ok: true, ouvert: true }, bootstrapBas: 0.1 })];
const prof = filtrerProfil(pistesDepuis(lp));
v('filtre « 45 % / RR ≥ 2 » : ne garde que ce qui ressemble à ce profil', prof.map(x => x.famille).sort().join(',') === 'p1,p4', prof.map(x => x.famille).join(','));
v('…avec l’indication honnête : prouvé ou seulement prometteur', /seulement prometteur/.test(prof.find(x => x.famille === 'p1').honnetete) && /prouvé par le protocole complet/.test(prof.find(x => x.famille === 'p4').honnetete));
v('le profil est nommé et sa plage connue', PROFIL_45_RR2.rrMin === 2 && /45/.test(PROFIL_45_RR2.nom));
v('espérance du profil de Justin selon les frais : 0,08 R de frais → +0,27 R ; seuil d’équilibre 36,7 % à 0,1 R', Math.abs(espereProfil(0.08).esperance - 0.27) < 1e-9 && Math.abs(espereProfil(0.1).tauxEquilibre - 1.1 / 3) < 1e-9);
v('phrase d’une piste lisible (statut, chiffres, preuve manquante)', (() => { const t = phrasePiste(top[0]).join(' '); return /PROUVÉE/.test(t) || /PROMETTEUSE/.test(t); })() && phrasePiste(pistesDepuis([b()])[0]).join(' ').includes('Preuve manquante'));
v('lignes du rapport du matin : meilleure piste, preuve manquante, frais moyens', (() => { const l = lignesRapportPistes(meilleuresPistes([b()]), 'Frais moyens : 0,25 R par trade. Taux de réussite minimal pour être rentable avec RR=2 : 42 %.'); return l.length === 3 && /Meilleure piste/.test(l[0]) && /Preuve manquante/.test(l[1]) && /Frais moyens/.test(l[2]); })());
v('sans piste : « aucune piste chiffrée » (jamais une invention)', lignesRapportPistes([])[0] === 'Aucune piste chiffrée pour l’instant.');
v('ce module ne touche à aucun critère de validation', empreinteCriteres() === 'c9995253' && empreinteV3() === 'c9b4ddd4' && CRITERES3.horsEchantillon.tradesMin === 150);
console.log('Meilleures pistes : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
