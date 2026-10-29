// Tests des écrans de positions (V7, phase 5) : HTML pur et dessin SVG. Lancer : node galaxie/tests/positions-ui-test.mjs
import { htmlPositions, htmlBilan, htmlPourquoi, htmlReglages, htmlExemples, htmlCarteProposition, htmlAucune, htmlPreuve, htmlTypes, svgBougies, pointDepuisClic, esc } from '../../planetes/mars/pc/agent-v7/vue-positions.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const T0 = Date.UTC(2026, 9, 29, 7, 0);
const bougies = Array.from({ length: 100 }, (_, i) => { const c = 80000 + Math.sin(i / 7) * 300 + i * 4; return [T0 + i * 900e3, c - 20, c + 80, c - 90, c]; });
const prop = (o = {}) => ({ id: 'a', actif: 'BTC', agent: 'rebond', famille: 'rebond_m15', tf: 'M15', type: 'rebond:balayage', nomType: 'Rebond après balayage de liquidité', sens: 1, t: bougies[80][0], tValide: bougies[80][0] + 13 * 900e3, zone: [80250, 80330], limite: 80300, stop: 80100, cible: 80700, cibleNom: 'plus haut de la veille', cible2: 81000, rr: 2, raison: 'Achat après le balayage de 80 250', invalidation: 'clôture M15 sous 80 100 : la zone n’a pas tenu', confluence: { n: 3, score: 5, diamant: true }, diamant: true, preuve: { niveau: 'candidate', n: 120, esperance: 0.1, tauxReussite: 0.4, rrMoyen: 2, fourchette: [0.01, 0.2] }, statut: 'en_attente', ...o });
const bilanVide = { propositions: 0, semaine: 0, mois: 0, executees: 0, cloturees: 0, tauxReussite: null, rrRealise: null, Rtotal: 0, pctTotal: 0, risquePct: 0.5, pireSerie: 0, phrase: 'Aucune position proposée pour l’instant : rien à bilanter.' };
const vue = (o = {}) => ({ ok: true, avertissement: 'Propositions et simulations seulement : aucun ordre n’est passé.', versionCriteres: 'équilibré (v4)', empreinteV4: '2436e9bf', reglages: { agents: { rebond: true, continuation: true, extremes: false }, actifs: ['BTC'], unites: ['M15', 'H1'], maxParAgent: 3, maxNouvellesParJour: 5, confluenceMin: 2, niveauPreuveMin: 'candidate', afficherIdees: false, risquePct: 0.5, alertesObservation: false, surveillance: false, versionCriteres: 'equilibre' },
  propositions: [prop()], bougies: { BTC: bougies }, hypotheses_du_moment: [], zonesDiamant: { BTC: [{ tf: 'H1', niveau: 80575, cote: 'resistance', distancePct: 0.8, enApproche: true, resume: '💎 zone diamant : x' }] }, bilan: { tous: bilanVide, parAgent: [{ ...bilanVide, agent: 'rebond' }] }, phraseHebdo: 'Pas encore de semaine complète.', types: [], mesures: {}, journalNiveaux: [], exemples: [], resumeExemples: 'Aucun exemple marqué.', gardeExemples: 'Un exemple ne valide jamais rien.', hypotheses: [], occasions: { total: 0 }, essais: { total: 14, jeuxFinauxOuverts: 0 }, dernierCycle: T0, ...o });
const d = { ok: true, existe: true, enMarche: true, vue: vue() };

const h = htmlPositions(d);
v('l’écran montre sens, actif, unité, entrée, stop, cibles, rapport, raison, preuve, invalidation', /ACHAT/.test(h) && /BTC/.test(h) && /M15/.test(h) && /Ordre limite/.test(h) && /Stop/.test(h) && /Cible 1/.test(h) && /Cible 2/.test(h) && /2,0 pour 1/.test(h) && /Pourquoi/.test(h) && /Annulée si/.test(h) && /Candidate/.test(h));
v('la mention « pas encore validée » accompagne une Candidate', /Pas encore validée/.test(h));
v('une idée non testée dit « preuve insuffisante »', /Preuve insuffisante/.test(htmlPreuve({ niveau: 'non_testee' })) && /Preuve insuffisante/.test(htmlPreuve({ niveau: 'non_concluante', n: 200, esperance: -0.1 })));
v('une position Validée n’a pas d’avertissement de preuve', !/Preuve insuffisante|Pas encore validée/.test(htmlPreuve({ niveau: 'validee', n: 200, esperance: 0.2, tauxReussite: 0.45, rrMoyen: 2.1 })));
v('les statistiques réelles sont affichées (réussite, gain/perte, espérance, fourchette, trades)', /40 %/.test(h) && /\+0,10 R/.test(h) && /120 trades/.test(h) && /fourchette/.test(h));
v('zone diamant et zones à surveiller', /💎 zone diamant/.test(h) && /le prix approche/.test(h));
v('l’avertissement « aucun ordre » est en haut', /aucun ordre/.test(h));
v('une position ouverte le dit', /position ouverte/.test(htmlCarteProposition(prop({ statut: 'ouverte' }), { BTC: bougies })));
const aucune = htmlPositions({ ...d, vue: vue({ propositions: [], hypotheses_du_moment: [{ actif: 'BTC', tf: 'H1', raison: 'Achat hypothétique autour de 80 000', pourquoi: 'Le rapport gain / risque atteignable est 1,1, il en faut 1,5.', quand: 'Je la proposerais si le prix revenait vers 80 120.' }] }) });
v('sans position : la meilleure hypothétique, pourquoi pas, et quand', /Aucune position proposée/.test(aucune) && /Pourquoi elle n’est pas proposée/.test(aucune) && /Quand elle le deviendrait/.test(aucune) && /80 120/.test(aucune));
v('sans aucune hypothèse : une phrase honnête, pas un blanc', /Aucune configuration ne passe/.test(htmlAucune({ hypotheses_du_moment: [] })));
v('service jamais lancé : message clair', /pas encore calculé/.test(htmlPositions({ ok: true, existe: false })));
v('les textes sont échappés', !/<script/.test(htmlPositions({ ...d, vue: vue({ propositions: [prop({ raison: '<script>x</script>' })] }) })) && esc('<a>') === '&lt;a&gt;');

/* ── dessin ── */
const g = svgBougies(bougies, { p: prop(), titre: 'test' });
v('SVG : bougies, zone d’entrée, stop, cibles, étiquettes', /<svg/.test(g.svg) && g.svg.includes('av7-zone') && g.svg.includes('av7-stop') && g.svg.includes('av7-cible') && g.svg.includes('av7-entree') && (g.svg.match(/class="av7-[hb]"/g) || []).length >= 90);
v('SVG : l’échelle contient tous les niveaux (stop et cible 2 visibles)', g.echelle.lo <= 80100 && g.echelle.hi >= 81000);
const pt = pointDepuisClic(g.echelle, 100, 100);
v('un clic devient un temps et un prix', pt && pt.t >= g.echelle.bougies[0][0] && pt.prix > g.echelle.lo && pt.prix < g.echelle.hi);
v('pas assez de bougies : message, pas de plantage', /Pas assez/.test(svgBougies([], {}).svg));
v('marques d’exemples dessinées', svgBougies(bougies, { marques: [{ t: bougies[50][0], prix: 80200, texte: '✔' }] }).svg.includes('av7-marque'));

/* ── bilan, pourquoi, réglages, exemples ── */
const bil = htmlBilan({ ...d, vue: vue({ bilan: { tous: { ...bilanVide, propositions: 10, cloturees: 8, jours: 31, tauxReussite: 0.4, rrRealise: 1.9, Rtotal: 4.2, pctTotal: 2.1, pireSerie: 4, executees: 9, semaine: 3, mois: 10, hasard: { assez: true, esperance: -0.15 }, esperance: 0.52, ecartHasard: 0.67, phrase: '31 jours : +4,2 R sur 8 trades (+2,1 % à 0,5 % de risque par trade), preuve encore insuffisante (moins de 30 trades).' }, parAgent: [{ ...bilanVide, agent: 'rebond', propositions: 5 }, { ...bilanVide, agent: 'continuation' }, { ...bilanVide, agent: 'extremes' }] }, types: [{ nomType: 'Repli sur le VWAP', actif: 'BTC', tf: 'M15', niveau: 'candidate', n: 120, tauxReussite: 0.4, esperance: 0.1, fourchette: [0.0, 0.2] }], journalNiveaux: [{ t: T0, texte: 'PROMOTION : x' }] }) });
v('bilan : phrase d’état honnête, comparaison au hasard, tableau par agent, niveaux, journal, compteur d’essais', /preuve encore insuffisante/.test(bil) && /au hasard/.test(bil) && /Rebond/.test(bil) && /Continuation/.test(bil) && /Extrêmes/.test(bil) && /Repli sur le VWAP/.test(bil) && /PROMOTION/.test(bil) && /Essais comptés/.test(bil));
v('bilan sans données', /Pas encore de bilan/.test(htmlBilan({ ok: true, existe: false })));
const pq = htmlPourquoi({ ...d, vue: vue({ types: [{ nomType: 'Repli sur le POC', actif: 'SOL', tf: 'H1', niveau: 'non_concluante', n: 48, esperance: -0.3, pourquoi: 'Pour devenir Candidate : Trades hors échantillon (48, il faut ≥ 100).' }] }) }, { pistes: [{ nom: 'Tendance H4', paire: 'BTC', niveaux: { strict: { niveau: 'non_concluante', pourquoi: 'x' }, equilibre: { niveau: 'candidate', pourquoi: 'Pour devenir Validée : …' } } }] });
v('« pourquoi pas plus » : ce qui manque, et strict contre équilibré pour les pistes', /Pour devenir Candidate/.test(pq) && /Niveau strict \(v3\)/.test(pq) && /Niveau équilibré \(v4\)/.test(pq) && /ne sont jamais assouplis/.test(pq));
const rg = htmlReglages(d);
v('réglages : agents, actifs, unités, nombre, confluence, risque, niveau minimum, idées, Telegram, strict / équilibré', ['data-av7-agent="rebond"', 'data-av7-actif="SOL"', 'data-av7-unite="H1"', 'data-av7-num="maxParAgent"', 'data-av7-num="confluenceMin"', 'data-av7-num="risquePct"', 'data-av7-sel="niveauPreuveMin"', 'data-av7-reg="afficherIdees"', 'data-av7-reg="alertesObservation"', 'data-av7-reg="surveillance"', 'data-av7-niveau-preuve="strict"', 'data-av7-niveau-preuve="equilibre"'].every(x => rg.includes(x)));
v('réglages : les cases reflètent l’état', /data-av7-agent="extremes"(?![^>]*checked)/.test(rg) && /data-av7-agent="rebond" checked/.test(rg) && /data-av7-niveau-preuve="equilibre" checked/.test(rg));
const ex = htmlExemples(d, { actif: 'BTC', marquage: null });
v('exemples : consigne en trois touches, graphique cliquable, boutons désactivés au départ', /1\. Touche le graphique/.test(ex) && ex.includes('data-av7-graphe') && /data-av7-ex-ajouter="bon" disabled/.test(ex) && /Un exemple ne valide jamais rien/.test(ex));
const pret = htmlExemples(d, { marquage: { t: T0, entree: 80000, stop: 79800, cible: 80600 } });
v('exemples : après entrée + stop + cible, on peut valider', /data-av7-ex-ajouter="bon">/.test(pret) && /Prêt/.test(pret));
v('types : tableau vide ou non', /pas encore été mesurés/.test(htmlTypes([])));
console.log('Écrans de positions : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
