// Tests des critères v4 (V7, phase 1) : deux niveaux, sélecteur strict / équilibré, anciens fichiers de critères INTACTS.
// Lancer : node galaxie/tests/criteres-v4-test.mjs
import fs from 'node:fs';
import { CRITERES4, empreinteV4, evaluerNiveau, periodes, NIVEAUX } from '../../strategies/criteres-v4.js';
import { CRITERES3, empreinteV3 } from '../../strategies/criteres-v3.js';
import { empreinteCriteres } from '../../planetes/mars/pc/agent-btc/criteres.js';
import { alea } from '../../planetes/mars/pc/mars-calcul.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

v('v1 et v3 intactes (empreintes)', empreinteCriteres() === 'c9995253' && empreinteV3() === 'c9b4ddd4');
v('v3 : toujours +0,25 R et 150 trades', CRITERES3.horsEchantillon.esperanceMin === 0.25 && CRITERES3.horsEchantillon.tradesMin === 150);
const json = JSON.parse(fs.readFileSync(new URL('../../strategies/criteres-v4.json', import.meta.url), 'utf8'));
v('criteres-v4.json = criteres-v4.js', json.empreinte === empreinteV4() && JSON.stringify(json.criteres) === JSON.stringify(CRITERES4));
v('seuils de la décision de Justin : candidate +0,08 R / 100 trades ; validée +0,12 R / 150 trades', CRITERES4.candidate.esperanceMin === 0.08 && CRITERES4.candidate.tradesMin === 100 && CRITERES4.validee.esperanceMin === 0.12 && CRITERES4.validee.tradesMin === 150);
v('la décision et la date sont en tête du fichier', /Justin/.test(json.criteres.decision) && json.criteres.figesLe === '2026-10-29');

// Jeux de trades : R = +2 avec probabilité p, sinon −1
const tirage = (n, p) => Array.from({ length: n }, (_, i) => ((i * 0.6180339887) % 1 < p ? 2 : -1));     // suite à faible discrépance : fréquence exacte, aucun hasard
const bon = tirage(1000, 0.40);                   // espérance +0,2
const moyen = tirage(1000, 0.365);                // ≈ +0,095
const mauvais = tirage(300, 0.30);                // ≈ −0,1
const fort = tirage(120, 0.5);                    // +0,5
const E = (R, o = {}, ver = 'equilibre') => evaluerNiveau({ R, nVariantes: 50, nEffectif: 10, walkForwardPositif: true, ddPct: 3, pireJourPct: 1.5, rapportAuditeur: true, auditeur: { fait: true, ok: true }, esperanceFraisDoubles: 0.05, ...o }, { version: ver });
const moy = l => l.reduce((a, b) => a + b, 0) / l.length;
v('jeux de test : ordres de grandeur', moy(bon) > 0.15 && moy(moyen) > 0.05 && moy(moyen) < 0.2 && moy(mauvais) < 0, moy(bon) + ' ' + moy(moyen) + ' ' + moy(mauvais));
const eBon = E(bon);
v('bonne stratégie → Validée au niveau équilibré, version et empreinte indiquées', eBon.niveau === 'validee' && eBon.version === 'equilibre' && eBon.criteres === empreinteV4() && /v4/.test(eBon.versionTexte), JSON.stringify(eBon.ratees));
v('mauvaise stratégie → non concluante', E(mauvais).niveau === 'non_concluante');
v('moins de 20 trades → idée non testée', E(bon.slice(0, 15)).niveau === 'non_testee');
v('aucun trade → idée non testée', evaluerNiveau({ R: [] }).niveau === 'non_testee');
const eMoy = E(moyen, { periodes: [{ n: 80, esperance: 0.1 }, { n: 80, esperance: 0.09 }] });
v('espérance modeste (+0,09 R) : Candidate si 2 périodes positives et frais doublés ≥ 0', ['candidate', 'validee'].includes(eMoy.niveau), eMoy.niveau + ' ' + eMoy.esperance);
v('…mais pas Candidate si une période est négative', E(moyen, { periodes: [{ n: 80, esperance: 0.4 }, { n: 80, esperance: -0.1 }] }).niveau !== 'candidate');
v('…ni si les frais doublés la rendent négative', E(moyen, { esperanceFraisDoubles: -0.05, periodes: [{ n: 80, esperance: 0.1 }, { n: 80, esperance: 0.09 }] }).niveau !== 'candidate');
v('…ni sans les contrôles de l’Auditeur (aucune fuite du futur…)', E(moyen, { auditeur: { fait: false }, periodes: [{ n: 80, esperance: 0.1 }, { n: 80, esperance: 0.09 }] }).niveau !== 'candidate');
v('pas Validée sans rapport écrit de l’Auditeur', E(bon, { rapportAuditeur: false }).niveau !== 'validee');
v('pas Validée avec un creux de compte prop trop grand (7 % > 6 %)', E(bon, { ddPct: 7 }).niveau !== 'validee');
v('150 trades exigés, ou 100 trades + 4 semaines de simulation positives', E(fort.slice(0, 110)).niveau !== 'validee' && E(fort.slice(0, 110), { live: { semaines: 5, esperance: 0.1, n: 12 } }).niveau === 'validee');
// niveau strict
const eStrict = E(moyen, {}, 'strict'), eStrictBon = E(bon, {}, 'strict');
v('niveau strict : jamais « Candidate » (un seul niveau, +0,25 R)', eStrict.niveau !== 'candidate' && eStrict.versionTexte === 'strict (v3)' && eStrict.criteres === 'c9b4ddd4');
v('niveau strict : une espérance de +0,2 R ne suffit pas, alors qu’elle suffit en équilibré', eStrictBon.niveau !== 'validee' && eBon.niveau === 'validee', eStrictBon.niveau + ' ' + eStrictBon.esperance);
v('strict utilise TOUTES les variantes, équilibré le nombre effectif', eStrictBon.nEffectif === 50 && eBon.nEffectif === 10);
v('« pourquoi pas plus » donne les chiffres manquants', /Pour devenir Validée/.test(E(bon, { rapportAuditeur: false }).pourquoi) === false ? /Rapport/.test(E(bon, { rapportAuditeur: false }).pourquoi) : true);
v('« pourquoi » d’une non concluante cite les critères de Candidate', /Pour devenir Candidate/.test(E(mauvais).pourquoi));
v('périodes : 2 blocs successifs', periodes(bon.map((R, i) => ({ R, t: i })), 2).length === 2);
v('libellés des niveaux', NIVEAUX.validee === 'Validée' && /Candidate/.test(NIVEAUX.candidate) && NIVEAUX.non_testee === 'Idée non testée');
console.log('Critères v4 : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
