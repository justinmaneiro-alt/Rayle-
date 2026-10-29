// Tests du risque de fausses validations (V7, phase 2). Lancer : node galaxie/tests/faux-positifs-test.mjs
import { scenarioIndependant, scenarioAmas, nombreEffectifPrudent, mesurerEtDurcir, LIMITE_FAUX_POSITIFS } from '../../strategies/faux-positifs.js';
import { evaluerNiveau } from '../../strategies/criteres-v4.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const A = scenarioIndependant({ simulations: 300, K: 100, n: 200 });
v('variantes indépendantes sans avantage : fausses validations ≤ 5 %', A.taux <= LIMITE_FAUX_POSITIFS, A.taux);
const B = scenarioAmas({ simulations: 60, K: 60, amas: 6, jours: 250 });
v('amas de variantes corrélées sans avantage : fausses validations ≤ 5 %', B.taux <= LIMITE_FAUX_POSITIFS, B.taux);
v('le nombre effectif d’essais est bien inférieur au nombre de variantes dans les amas', B.nEffectifMoyen < B.K, B.nEffectifMoyen);
v('N effectif prudent : plancher en part du total, jamais au-dessus du total', nombreEffectifPrudent(5, 100, { plancherPart: 0.25 }) === 25 && nombreEffectifPrudent(5, 100) === 5 && nombreEffectifPrudent(500, 100) === 100);
// si le taux dépassait la limite, le durcissement est automatique : on le vérifie avec une limite artificielle de 0 (0 faux positif toléré, jamais atteint avec trop de variantes serrées)
const d = mesurerEtDurcir({ simulationsA: 60, simulationsB: 20, limite: -1, parametresA: { K: 20, n: 200 }, parametresB: { K: 30, amas: 5 } });
v('durcissement automatique : monte le plancher jusqu’au bout quand la limite est impossible', d.essais.length === 5 && d.plancherRetenu === 1 && d.durci === true && d.ok === false);
// un vrai avantage reste détecté malgré la correction (le filtre n’est pas un mur)
const R = Array.from({ length: 600 }, (_, i) => ((i * 0.6180339887) % 1 < 0.45 ? 2 : -1));     // +0,35 R par trade
v('un vrai avantage (+0,35 R sur 600 trades) passe quand même, même avec 100 essais effectifs', evaluerNiveau({ R, nVariantes: 3000, nEffectif: 100, walkForwardPositif: true, ddPct: 2, pireJourPct: 1, rapportAuditeur: true, auditeur: { fait: true, ok: true }, esperanceFraisDoubles: 0.2 }).niveau === 'validee');
console.log('Faux positifs : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
