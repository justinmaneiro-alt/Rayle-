// Tests du circuit complet des positions (V7, phases 3 à 6) : statut d'une proposition (ordre limite honnête), classement et plafonds, suivi automatique, bilan, promotion / rétrogradation,
// exemples de Justin, preuves par type de setup, service (commandes, rapports, Telegram simulé). Données SYNTHÉTIQUES seulement (jamais présentées comme réelles).
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/positions-pipeline-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { marcheMixte, T0 } from '../../planetes/mars/tests/synth-btc.mjs';
import { depuisBougies, versBougies, tranche } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { statutDepuisSignal, optionsProposition, proposerPourActif, qualite, budgetJour, niveauAssezHaut, REGLAGES_DEFAUT, typeCle } from '../../strategies/positions/moteur.js';
import { creerEtatPositions, enregistrer, majSuivi, majNiveaux, preuvesPourActif, liveParType } from '../../strategies/positions/suivi.js';
import { bilanAgent, bilanComplet, resultatsHebdo, fourchetteHebdo, pireSerie, phraseEtat, phraseHebdo, baselineHasard, PAS_UNE_PROMESSE } from '../../strategies/positions/bilan.js';
import { ligneProposition, alertePosition, alerteSurveillance, lignesRapportPositions, phrasePreuve, PIED } from '../../strategies/positions/rapport.js';
import { exempleValide, analyserExemple, hypotheseDepuisExemple, testerHypothese, resumeExemplesV7, GARDE_FOU_EXEMPLES } from '../../strategies/positions/exemples.js';
import { mesurerActif, explorerGrille, resumerTrades, walkForwardBlocs, auditerType, profilActif, contexteEcarte, doubler } from '../../strategies/positions/preuves.js';
import { creerPositions } from '../../agent-pc/positions.mjs';
import { executerPositionsSync } from '../../agent-pc/positions-travailleur.mjs';
import { NIVEAUX } from '../../strategies/criteres-v4.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const JOUR = 86400e3;

/* ── 1. statut d'une proposition : la VRAIE simulation (ordre limite à file d'attente) ── */
const barre = (i, o, h, l, c) => ({ t: T0 + i * 900e3, o, h, l, c, v: 100, vb: 50 });
const serie = l => depuisBougies(l.map((x, i) => barre(i, ...x)));
const sig1 = { sens: 1, stop: 97, limite: 100, cible: 106, ttl: 12, R: 2, atr: null, options: optionsProposition('M15', 12) };
const rempliPuisCible = serie([[101, 101.1, 100.9, 101], [101, 101.2, 100.5, 100.8], [100.8, 101, 99.9, 100.2], [100.2, 101.5, 100, 101.4], [101.4, 106.6, 101.3, 106.5], [106.5, 106.6, 106.2, 106.4]]);
const s1 = statutDepuisSignal(rempliPuisCible, 0, sig1, {});
v('ordre limite touché puis cible : trade clôturé, gain net inférieur à +2 R (frais déduits)', s1.statut === 'cloturee' && s1.trade.R > 1.8 && s1.trade.R < 2.0 && s1.trade.motif === 'cible', JSON.stringify(s1.trade && { R: s1.trade.R, motif: s1.trade.motif }));
v('…le résultat porte les coûts totaux en R', s1.trade.coutsTotalR > 0);
const attente = statutDepuisSignal(serie([[101, 101.1, 100.9, 101], [101, 101.2, 100.6, 100.8], [100.8, 101, 100.5, 100.7]]), 0, sig1, {});
v('ordre pas encore touché, encore valable : en attente', attente.statut === 'en_attente', attente.statut);
const parti = statutDepuisSignal(serie([[101, 101.1, 100.9, 101], [101, 107, 100.9, 106.9], [106.9, 107.5, 106.5, 107], [107, 107.1, 106.8, 107], [107, 107.1, 106.8, 107]]), 0, sig1, {});
v('le prix part vers la cible sans toucher l’ordre : « partie sans nous » (jamais un gain inventé)', parti.statut === 'partie_sans_nous', parti.statut);
const touche = statutDepuisSignal(serie([[101, 101.1, 100.9, 101], [101, 101.2, 100.5, 100.8], [100.8, 101, 99.9, 100.2], [100.2, 100.8, 100.0, 100.5]]), 0, sig1, {});
v('ordre touché, ni stop ni cible : position ouverte', touche.statut === 'ouverte', touche.statut);
const stoppe = statutDepuisSignal(serie([[101, 101.1, 100.9, 101], [101, 101.2, 99.9, 100.1], [100.1, 100.2, 96.5, 96.8], [96.8, 97, 96.5, 96.7]]), 0, sig1, {});
v('ordre touché puis stop : perte d’environ −1 R (plus les frais)', stoppe.statut === 'cloturee' && stoppe.trade.R < -1 && stoppe.trade.R > -1.4, stoppe.trade && stoppe.trade.R);
const touchTrop = statutDepuisSignal(serie([[101, 101.1, 100.9, 101], [101, 101, 100.01, 100.5], [100.5, 101, 100.02, 100.6], [100.6, 101, 100.1, 100.7]]), 0, sig1, {});
v('le prix TOUCHE le niveau sans le traverser : l’ordre n’est PAS rempli (file d’attente honnête)', touchTrop.statut !== 'ouverte' && touchTrop.statut !== 'cloturee', touchTrop.statut);

/* ── 2. moteur : classement, plafonds, niveaux de preuve ── */
const m15 = marcheMixte(12000, 11);
function avecBalayageFinal(m, k0) {
  const b = versBougies(m); let mn = Infinity; for (let j = k0 - 48; j < k0; j++) mn = Math.min(mn, b[j].l);
  const x = b[k0], c = mn * 1.0012; b[k0] = { ...x, o: b[k0 - 1].c, l: mn * 0.9985, c, h: Math.max(c, b[k0 - 1].c) * 1.0004, v: x.v * 3, vb: x.v * 3 * 0.7 };
  return depuisBougies(b.slice(0, k0 + 1));
}
const fin = avecBalayageFinal(m15, 11999);
const brut = proposerPourActif(fin, 'BTC', { reglages: { afficherIdees: true, niveauPreuveMin: 'idee' }, preuves: {} });
v('un balayage sur la dernière barre donne une proposition d’ACHAT en attente (idée non testée)', brut.propositions.some(p => p.achat && p.famille === 'rebond_m15' && p.statut === 'en_attente' && p.preuve.niveau === 'non_testee'), JSON.stringify(brut.propositions.map(p => [p.famille, p.statut])));
const p0 = brut.propositions.find(p => p.famille === 'rebond_m15');
if (p0) {
  v('la proposition porte zone, limite, stop, cible 1, rapport, durée de validité, raison, invalidation, confluence', p0.zone.length === 2 && p0.limite > p0.stop && p0.cible > p0.limite && p0.rr >= 1.5 && p0.tValide > p0.t && p0.raison.length > 30 && /clôture M15 sous/.test(p0.invalidation) && p0.confluence.n >= 2);
  v('le texte de la proposition reprend toutes ces informations', (() => { const t = ligneProposition(p0).join(' '); return /ACHAT BTC M15/.test(t) && /ordre limite/.test(t) && /stop/.test(t) && /cible 1/.test(t) && /pour 1/.test(t) && /Valable jusqu/.test(t) && /Annulée si/.test(t) && /Preuve/.test(t); })());
}
const masque = proposerPourActif(fin, 'BTC', { reglages: { afficherIdees: false, niveauPreuveMin: 'candidate' }, preuves: {} });
v('par défaut, une idée non testée n’est PAS montrée…', masque.propositions.length === 0 && masque.ecartees.length > 0);
v('…mais on ne dit jamais « rien » sans explication : la meilleure position hypothétique est donnée avec le pourquoi', masque.hypothese && masque.hypothese.type === 'preuve' && /niveau de preuve/.test(masque.hypothese.pourquoi) && masque.hypothese.quand, JSON.stringify(masque.hypothese && masque.hypothese.type));
const cand = proposerPourActif(fin, 'BTC', { reglages: {}, preuves: { [typeCle('rebond_m15', 'rebond:balayage')]: { niveau: 'candidate', n: 120, esperance: 0.1, tauxReussite: 0.4, rrMoyen: 2 }, [typeCle('rebond_m15', 'rebond:absorption')]: { niveau: 'candidate', n: 120, esperance: 0.1 } } });
v('avec une preuve « Candidate », la position est montrée avec ce niveau et ces statistiques', cand.propositions.length > 0 && cand.propositions[0].preuve.niveau === 'candidate' && /CANDIDATE/.test(phrasePreuve(cand.propositions[0])) && /pas encore validée/i.test(phrasePreuve(cand.propositions[0])));
const valPr = { niveau: 'validee', n: 200, esperance: 0.2, tauxReussite: 0.45, rrMoyen: 2.1, fourchette: [0.05, 0.35] };
v('qualité : Validée > Candidate > idée, et une espérance négative pénalise', qualite({ confluence: { score: 4, diamant: false }, rr: 2 }, valPr) > qualite({ confluence: { score: 4, diamant: false }, rr: 2 }, { niveau: 'candidate' }) && qualite({ confluence: { score: 4, diamant: false }, rr: 2 }, { niveau: 'candidate' }) > qualite({ confluence: { score: 4, diamant: false }, rr: 2 }, { niveau: 'non_testee' }) && qualite({ confluence: { score: 4, diamant: false }, rr: 2 }, { niveau: 'non_concluante', esperance: -0.2 }) < qualite({ confluence: { score: 4, diamant: false }, rr: 2 }, { niveau: 'non_testee' }));
v('niveau minimum affiché', niveauAssezHaut('validee', 'candidate') && niveauAssezHaut('candidate', 'candidate') && !niveauAssezHaut('non_concluante', 'candidate') && niveauAssezHaut('non_testee', 'idee'));
const cds = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], b1 = budgetJour(cds, [T0 + 1, T0 + 2, T0 + 3 * JOUR], T0 + 5, 3);
v('plafond de nouvelles positions par jour : 3 par jour, 2 déjà émises ce jour → 1 de plus', b1.acceptees.length === 1 && b1.refusees.length === 3 && b1.dejaAujourdhui === 2);
const max1 = proposerPourActif(fin, 'BTC', { reglages: { maxParAgent: 1, afficherIdees: true }, preuves: {} });
v('au plus `maxParAgent` positions par agent', Object.values(max1.propositions.reduce((m, p) => ((m[p.agent] = (m[p.agent] || 0) + 1), m), {})).every(x => x <= 1));
v('zones diamant : jamais plus de 6, chacune avec ses éléments', brut.zonesDiamant.length <= 6 && brut.zonesDiamant.every(z => z.elements.length >= 3 && z.score >= 5));
const calme = proposerPourActif(tranche(m15, 0, 10050), 'BTC', { reglages: { afficherIdees: false }, preuves: {} });
v('quand rien ne passe : toujours une explication (hypothèse ou scénario conditionnel) ou des propositions', calme.propositions.length > 0 || (calme.hypothese && calme.hypothese.pourquoi && (calme.hypothese.quand || calme.hypothese.type === 'aucune')), JSON.stringify(calme.hypothese && [calme.hypothese.type, calme.hypothese.pourquoi]));
if (calme.hypothese && calme.hypothese.type === 'conditionnelle') v('le scénario conditionnel dit à quel prix il se déclencherait', /si le prix balaie/.test(calme.hypothese.quand) && Number.isFinite(calme.hypothese.niveau));

/* ── 3. suivi automatique ── */
const E = creerEtatPositions(), t0 = T0 + 30 * 900e3;
const propo = (id, q, o = {}) => ({ id, actif: 'BTC', famille: 'rebond_m15', agent: 'rebond', tf: 'M15', type: 'rebond:balayage', nomType: 'Rebond après balayage de liquidité', sens: 1, t: t0, tValide: t0 + 13 * 900e3, zone: [99.9, 100.2], limite: 100, stop: 97, cible: 106, cibleNom: 'dernier sommet', rr: 2, raison: 'test', invalidation: 'test', confluence: { n: 2, score: 3.5, diamant: false, elements: [{ cle: 'balayage' }, { cle: 'poc' }] }, regime: null, preuve: { niveau: 'candidate', n: 120, esperance: 0.1 }, versionCriteres: 'equilibre', qualite: q, statut: 'en_attente', ...o });
const r1 = enregistrer(E, [propo('a', 3), propo('b', 5), propo('c', 4)], t0, { maxParJour: 2 });
v('enregistrement : les meilleures d’abord, plafond respecté, les autres refusées', r1.nouvelles.map(p => p.id).join() === 'b,c' && r1.refusees.length === 1 && E.propositions.length === 2);
v('jamais deux fois la même proposition', enregistrer(E, [propo('b', 5)], t0 + 1000, { maxParJour: 9 }).nouvelles.length === 0);
const grand = depuisBougies(Array.from({ length: 80 }, (_, i) => ({ t: T0 + i * 900e3, o: 101, h: 101.2, l: 100.5, c: 100.8, v: 100, vb: 50 })));
const bg = versBougies(grand); bg[32] = { ...bg[32], l: 99.9, c: 100.2 }; bg[33] = { ...bg[33], h: 101.5, l: 100.0, c: 101.4 }; bg[34] = { ...bg[34], h: 106.6, l: 101.3, c: 106.5 }; const g2 = depuisBougies(bg);
const fin1 = majSuivi(E, { BTC: g2 }, () => ({}), t0 + 10 * 900e3);
const clos = E.propositions.filter(p => p.statut === 'cloturee');
v('suivi : une position dont l’ordre est touché puis la cible atteinte est clôturée avec son résultat net', clos.length === 2 && clos[0].resultat.R > 1.5 && clos[0].resultat.motif === 'cible' && fin1.length === 2, JSON.stringify(E.propositions.map(p => p.statut)));
const live = liveParType(E, t0);
v('résultats en direct regroupés par type (n, espérance, semaines)', live['BTC|rebond_m15|rebond:balayage'] && live['BTC|rebond_m15|rebond:balayage'].n === 2);
const mesureFictive = (niveau, esp = 0.15, n = 200) => ({ actif: 'BTC', types: { 'rebond_m15|rebond:balayage': { cle: 'rebond_m15|rebond:balayage', famille: 'rebond_m15', agent: 'rebond', tf: 'M15', type: 'rebond:balayage', nomType: 'Rebond après balayage de liquidité', niveau, esperance: esp, n, pourquoi: 'test', versionCriteres: 'équilibré (v4)' } } });
const ev1 = majNiveaux(E, mesureFictive('candidate'), t0), ev2 = majNiveaux(E, mesureFictive('validee'), t0 + 1000), ev3 = majNiveaux(E, mesureFictive('candidate'), t0 + 2000);
v('promotion automatique : Candidate → Validée écrite dans le journal avec la raison', ev2.length === 1 && ev2[0].sens === 'promotion' && /PROMOTION/.test(ev2[0].texte) && /Validée/.test(ev2[0].texte));
v('rétrogradation écrite aussi', ev3.length === 1 && ev3[0].sens === 'retrogradation' && /RÉTROGRADATION/.test(ev3[0].texte));
v('première mesure d’un type Candidate : journalisée', ev1.length === 1 && ev1[0].sens === 'premiere_mesure');
v('les preuves sont rendues au format du moteur', preuvesPourActif(E, 'BTC')['rebond_m15|rebond:balayage'].niveau === 'candidate');
const E2 = creerEtatPositions(); E2.propositions.push(...Array.from({ length: 12 }, (_, i) => propo('x' + i, 1, { statut: 'cloturee', resultat: { R: -0.5, tEntree: t0, tSortie: t0 + (i + 1) * 3600e3, motif: 'stop' } })));
const evD = majNiveaux(E2, mesureFictive('validee', 0.4), t0 + 3 * JOUR);
v('dérive en direct (12 pertes de suite contre +0,4 R attendus) : Validée rétrogradée d’un cran', evD.length >= 1 && evD.some(e => e.vers === 'candidate' && /dérive/.test(e.raison)), JSON.stringify(evD.map(e => e.vers)));

/* ── 4. bilan honnête ── */
const cl = (R, i, tf = 'M15', agent = 'rebond') => ({ agent, actif: 'BTC', tf, t: T0 + i * 3 * JOUR, statut: 'cloturee', resultat: { R, tSortie: T0 + i * 3 * JOUR + 3600e3 }, limite: 100, stop: 97, cible: 106 });
const lst = [2, -1, -1, 2, -1, -1, -1, 2, 2, -1].map((R, i) => cl(R, i)); const now = T0 + 40 * JOUR;
const b = bilanAgent(lst, { agent: 'rebond', risquePct: 0.5, maintenant: now });
v('bilan : taux de réussite, rapport réalisé, résultat en R et en % au risque choisi, pire série', Math.abs(b.tauxReussite - 0.4) < 1e-9 && Math.abs(b.rrRealise - 2 / 1) < 1e-9 && Math.abs(b.Rtotal - 2) < 1e-9 && Math.abs(b.pctTotal - 1) < 1e-9 && b.pireSerie === 3, JSON.stringify({ t: b.tauxReussite, rr: b.rrRealise, R: b.Rtotal, s: b.pireSerie }));
v('phrase d’état honnête : « N jours : +X R sur N trades, preuve encore insuffisante »', /^\d+ jours : \+2,0 R sur 10 trades/.test(b.phrase) && /preuve encore insuffisante/.test(b.phrase), b.phrase);
v('pire série perdante', pireSerie([1, -1, -1, -1, 1, -1]) === 3);
const h = resultatsHebdo(lst, 0.5, now);
v('résultats par semaine : les semaines sans trade valent 0, la semaine en cours n’est pas comptée', h.semaines.length > 4 && h.semaines.some(s => s.pct === 0));
const fh = fourchetteHebdo(h.semaines);
v('fourchette hebdomadaire (bootstrap) : bas ≤ moyenne ≤ haut, parts à +1 % / +2 %', fh.assez && fh.bas <= fh.moyenne && fh.moyenne <= fh.haut && fh.part1 >= fh.part2);
v('la phrase hebdomadaire dit « pas une promesse »', phraseHebdo({ hebdo: fh }).includes(PAS_UNE_PROMESSE));
v('aucune proposition : phrase claire', /Aucune position proposée/.test(phraseEtat({ propositions: 0 })));
v('propositions sans clôture : preuve insuffisante', /preuve insuffisante/.test(phraseEtat({ propositions: 3, cloturees: 0, jours: 2, enAttente: 2, ouvertes: 1 })));
v('bilan complet : tous les agents + chaque agent', bilanComplet(lst, { maintenant: now }).parAgent.length === 3);
const bh = baselineHasard(g2, [propo('h1', 1, { t: t0 }), propo('h2', 1, { t: t0 }), propo('h3', 1, { t: t0 }), propo('h4', 1, { t: t0 }), propo('h5', 1, { t: t0 })], {});
v('comparaison avec des positions prises au hasard : calculée ou « pas assez » (jamais inventée)', bh.assez === false || Number.isFinite(bh.esperance));

/* ── 5. alertes et rapport ── */
const al = alertePosition({ ...propo('z', 5), preuve: { niveau: 'candidate', n: 120, esperance: 0.1 }, actif: 'SOL' });
v('alerte Candidate : étiquetée « Observation (non validé) », jamais un ordre', /Observation \(non validé\)/.test(al[0]) && al[al.length - 1] === PIED);
v('alerte Validée en simulation : dit SIMULATION', /SIMULATION/.test(alertePosition({ ...propo('z', 5), preuve: valPr }, { mode: 'SIMULATION' })[0]) && !/SIMULATION/.test(alertePosition({ ...propo('z', 5), preuve: valPr }, { mode: 'REEL' })[0]));
v('alerte « trade à surveiller »', /Trade à surveiller/.test(alerteSurveillance({ tf: 'H1', niveau: 100, cote: 'support', distancePct: 0.4, resume: 'x' }, 'BTC')[0]));
const rap = lignesRapportPositions({ vue: { propositions: [propo('r', 5, { preuve: valPr })], zonesDiamant: [] }, bilan: bilanComplet(lst, { maintenant: now }), pistes: ['Meilleure piste : test.'], maintenant: now });
v('rapport du matin : positions du jour, bilan, meilleure piste', rap[0].startsWith('Positions du jour') && rap.some(l => /Bilan/.test(l)) && rap.some(l => /Meilleure piste/.test(l)));
v('rapport sans position : on dit pourquoi et on donne la meilleure hypothétique', lignesRapportPositions({ vue: { propositions: [], hypothese: { pourquoi: 'rr 1,1', quand: 'si le prix revient à 90' } }, bilan: null }).some(l => /hypothétique/.test(l)));

/* ── 6. exemples de Justin ── */
const exOk = { actif: 'BTC', sens: 'achat', avis: 'bon', t: m15.t[9000], entree: m15.c[9000], stop: m15.c[9000] * 0.995, cible: m15.c[9000] * 1.01 };
v('exemple valide / invalide', exempleValide(exOk).length === 0 && exempleValide({ ...exOk, stop: exOk.entree * 1.01 }).length > 0 && exempleValide({ ...exOk, avis: 'peut-être' }).length > 0 && exempleValide({ actif: 'BTC', sens: 'achat', avis: 'mauvais', t: 1, entree: 1 }).length === 0);
const an = analyserExemple(m15, exOk);
v('analyse d’un exemple : retrouvé / refusé / manqué, avec le pourquoi', ['retrouvee', 'refusee', 'manquee'].includes(an.statut) && an.pourquoi.length > 20 && an.caracteristiques && an.caracteristiques.tf === 'M15', an.statut);
const hy = hypotheseDepuisExemple(exOk, { ...an, statut: 'manquee' });
v('un exemple manqué devient une HYPOTHÈSE à tester (jamais une preuve)', hy && hy.statut === 'a_tester' && hy.garde === GARDE_FOU_EXEMPLES && hy.resultat === null && hy.sens === 1);
v('un exemple déjà retrouvé ne crée pas d’hypothèse', hypotheseDepuisExemple(exOk, { ...an, statut: 'retrouvee' }) === null);
v('un mauvais exemple écarté ou mal proposé est classé', ['bien_ecarte', 'mal_propose'].includes(analyserExemple(m15, { ...exOk, avis: 'mauvais' }).statut));
v('exemple hors données', analyserExemple(m15, { ...exOk, t: m15.t[100] }).statut === 'hors_donnees');
const long = marcheMixte(80000, 5);
const th = testerHypothese([{ actif: 'BTC', m15: long, exclure: [exOk.t] }], { ...hy, tf: 'M15', elementsRequis: [] }, { variantesAvant: 20 });
v('test de l’hypothèse sur d’autres données : niveau de preuve, jamais le jeu final, garde-fou rappelé', ['validee', 'candidate', 'non_concluante', 'non_testee'].includes(th.niveau) && th.jeuFinalLu === false && th.garde === GARDE_FOU_EXEMPLES && th.n >= 0, JSON.stringify(th).slice(0, 200));
v('résumé des exemples', /exemple\(s\)/.test(resumeExemplesV7([{ analyse: { statut: 'manquee' } }, { analyse: { statut: 'retrouvee' } }])) && /Aucun exemple/.test(resumeExemplesV7([])));

/* ── 7. preuves par type de setup (zone de recherche seulement) ── */
const t00 = Date.now(); const mes = mesurerActif(long, 'BTC', { config: {}, auditer: true, simulationsAuditeur: 8 });
v('mesure : 14 types (7 types × 2 unités) avec niveau, statistiques et version de critères', mes.ok && Object.keys(mes.types).length === 14 && Object.values(mes.types).every(t => ['validee', 'candidate', 'non_concluante', 'non_testee'].includes(t.niveau) && /v4/.test(t.versionCriteres)), String(Date.now() - t00) + ' ms');
v('la zone mesurée est la zone de recherche (75 % premiers) : le jeu final n’est pas lu', mes.zone.a < long.t[long.n - 1] && (mes.zone.a - long.t[0]) / (long.t[long.n - 1] + 900e3 - long.t[0]) < 0.76);
v('chaque essai est compté ; le nombre effectif est ≤ au total', mes.nVariantes === 14 && mes.nEffectif <= mes.nVariantes && mes.nouveauxEssais.length === 14);
const mes2 = mesurerActif(long, 'BTC', { etatPreuves: { variantes: Object.fromEntries(mes.nouveauxEssais.map(e => [e, 1])) }, simulationsAuditeur: 8, auditer: false });
v('le compteur de variantes ne baisse jamais et ne compte pas deux fois le même essai', mes2.nVariantes === 14 && mes2.nouveauxEssais.length === 0);
v('aucun type de données synthétiques sans avantage n’est « Validée »', Object.values(mes.types).every(t => t.niveau !== 'validee'));
v('aucun jeu final n’a été ouvert', Object.values(mes.types).every(t => !t.jeuFinal || !t.jeuFinal.ouvert));
const strict = mesurerActif(long, 'BTC', { version: 'strict', auditer: false });
v('niveau strict : jamais « Candidate », version et empreinte v3 indiquées', Object.values(strict.types).every(t => t.niveau !== 'candidate' && /strict/.test(t.versionCriteres)) && strict.empreinte === 'c9b4ddd4');
v('profil appris de l’actif : phrases lisibles', mes.profil.phrases.length > 0 && mes.profil.phrases.every(p => p.startsWith('BTC')));
const rt = resumerTrades([{ R: 2, tSortie: 1, coutsTotalR: 0.1 }, { R: -1, tSortie: 2, coutsTotalR: 0.1 }, { R: -1, tSortie: 3, coutsTotalR: 0.1 }]);
v('résumé de trades : réussite, rapport gain / perte, creux', Math.abs(rt.tauxReussite - 1 / 3) < 1e-9 && Math.abs(rt.rrMoyen - 2) < 1e-9 && Math.abs(rt.ddR - 2) < 1e-9);
v('walk-forward : 4 blocs de même durée ; positif seulement si cumul > 0 et la moitié des blocs ≥ 10 trades positifs', (() => { const tr = Array.from({ length: 80 }, (_, i) => ({ t: i, R: i % 4 === 3 ? -0.5 : 0.4 })); return walkForwardBlocs(tr, 0, 80, 4).positif && !walkForwardBlocs(tr.map(x => ({ ...x, R: -x.R })), 0, 80, 4).positif; })());
const aud = auditerType({ trades: Array.from({ length: 60 }, (_, i) => ({ R: i % 3 ? -0.3 : 1, t: T0 + i * JOUR * 3 })), trades2: Array.from({ length: 60 }, (_, i) => ({ R: i % 3 ? -0.4 : 0.9 })), sig: null, ctx: null, m15: long, config: {} }, { causalite: { ok: true, ecarts: 0, coupes: 6 } });
v('Auditeur : rapport écrit avec chaque contrôle ; une stratégie perdante échoue', aud.fait && !aud.ok && aud.rapport.length >= 5 && aud.rapport[0].startsWith('Rapport de l’Auditeur') && aud.tests.some(t => /Frais/.test(t.nom)));
v('Auditeur : une fuite du futur fait échouer', !auditerType({ trades: [{ R: 1, t: 1 }], trades2: [{ R: 1 }], sig: null, m15: long, config: {} }, { causalite: { ok: false, ecarts: 3, coupes: 6 } }).ok);
const pr = profilActif('SOL', { a: { type: 'x', agent: 'rebond', trades: Array.from({ length: 60 }, (_, i) => ({ t: T0 + i * 3600e3 * 10, R: -0.5, sens: 1, ph: 3, elements: ['balayage'], diamant: false, atrPct: 0.3 })) } });
v('contexte qui perd de façon répétée (≥ 40 trades à −0,5 R) : écarté et dit', pr.ecartes.length > 0 && pr.phrases.some(p => /ÉCARTÉ/.test(p)));
v('proposition dans un contexte écarté : refusée avec la raison', (() => { const e = contexteEcarte({ t: T0 + 1000, sens: 1, regime: 'range' }, pr); return e && /écarté/.test(e); })() && contexteEcarte({ t: T0, sens: 1 }, { ecartes: [] }) === null);
v('frais doublés', doubler({ fraisPct: 0.06, spreadPct: 0.01 }).fraisPct === 0.12 && doubler({}).spreadPct === 0.02);

/* ── 8. le service des positions ── */
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'positions-')), envoyes = [], journalx = [];
const series = { BTC: long, SOL: marcheMixte(80000, 8), DOGE: marcheMixte(80000, 9) };
const sync = async (tache, contexte) => executerPositionsSync(tache, contexte, series);
let horloge = long.t[long.n - 1] + 900e3 + 7 * 3600e3;      // 07 h UTC : après l'heure du rapport du matin
const svc = creerPositions({ dossier, paires: ['BTC', 'SOL', 'DOGE'], series, maintenant: () => horloge, journal: (t, m) => journalx.push(m), erreur: (o, e) => journalx.push('ERREUR ' + o + ' ' + (e && e.message)), envoyer: async (texte, canal) => { envoyes.push({ texte, canal }); }, executer: sync, versionCriteres: () => 'equilibre', pistesLignes: () => ['Meilleure piste : test (preuve manquante : 40 trades).'] });
fs.writeFileSync(path.join(dossier, 'positions-commandes.json'), JSON.stringify([{ type: 'reglages', valeur: { risquePct: 5, maxParAgent: 99, confluenceMin: 2, intrus: 1 } }]));
await svc.lireCommandes();
v('réglages : bornés (risque ≤ 2 %, max par agent ≤ 6) et les clés inconnues ignorées', svc.reglages().risquePct === 2 && svc.reglages().maxParAgent === 6 && svc.reglages().intrus === undefined);
const c1x = await svc.cycle();
await new Promise(r => setTimeout(r, 50));
const etat = svc.etat();
v('un cycle calcule les trois actifs et publie la vue', c1x.calculs === 3 && etat.vuePubliee && etat.vuePubliee.ok && etat.vuePubliee.avertissement.includes('aucun ordre'), JSON.stringify(c1x) + ' ' + journalx.filter(m => /ERREUR/.test(m)).join(' | '));
for (let i = 0; i < 200 && svc.enCours().mesure; i++) await new Promise(r => setTimeout(r, 50));
v('les mesures partent en tâche de fond puis les niveaux sont publiés', Object.keys(svc.etat().mesures).length >= 1 || svc.enCours().mesure != null);
const c2x = await svc.cycle();
v('un second cycle sans nouvelle bougie ne recalcule rien', c2x.calculs === 0);
v('le fichier positions.json existe et se relit', fs.existsSync(path.join(dossier, 'positions.json')) && JSON.parse(fs.readFileSync(path.join(dossier, 'positions.json'), 'utf8')).schema === 1);
fs.writeFileSync(path.join(dossier, 'positions-commandes.json'), JSON.stringify([{ type: 'exemple', valeur: { actif: 'BTC', sens: 'achat', avis: 'bon', t: long.t[60000], entree: long.c[60000], stop: long.c[60000] * 0.995, cible: long.c[60000] * 1.01 } }, { type: 'exemple', valeur: { actif: 'BTC', sens: 'achat', avis: 'sans' } }]));
await svc.lireCommandes();
const ex = svc.etat().exemples;
v('un exemple de Justin est analysé ; un exemple invalide est refusé', ex.length === 1 && ex[0].analyse && ex[0].analyse.pourquoi && journalx.some(m => /Exemple refusé/.test(m)));
v('un exemple manqué fait naître une hypothèse testée sur d’autres données (garde-fou)', ex[0].analyse.statut === 'retrouvee' || (svc.etat().hypotheses.length === 1 && svc.etat().hypotheses[0].resultat && svc.etat().hypotheses[0].resultat.jeuFinalLu === false));
await svc.rapportDuMatin(true);
v('rapport du matin envoyé avec l’avertissement, sans ordre', envoyes.some(e => /Kepler — positions du/.test(e.texte) && /aucun ordre/i.test(e.texte)), JSON.stringify(envoyes.map(e => e.texte.slice(0, 40))));
const vue = svc.vue();
v('la vue contient réglages, bilan, types, journal des niveaux, exemples, version de critères', vue.reglages && vue.bilan.tous && Array.isArray(vue.types) && Array.isArray(vue.journalNiveaux) && vue.versionCriteres === 'équilibré (v4)' && vue.empreinteV4 && /exemple/.test(vue.resumeExemples));
/* ── 9. recherche autonome : exploration de la petite grille, essais comptés, monter / descendre ── */
const eg = explorerGrille(long, 'BTC', 'continuation_m15', {});
v('exploration : une ligne par variante et par type, chaque essai est compté', eg.ok && eg.lignes.length === 2 * 3 && eg.nouveauxEssais.length === 6, eg.lignes && eg.lignes.length);
v('classement : chaque type « monte », « descend », « stable » ou manque de trades', eg.classement.length === 3 && eg.classement.every(c => ['monte', 'descend', 'stable', 'trop peu de trades'].includes(c.tendance)));
v('un second passage ne recompte pas les mêmes essais (le compteur ne baisse ni ne double)', explorerGrille(long, 'BTC', 'continuation_m15', { etatPreuves: { variantes: Object.fromEntries(eg.nouveauxEssais.map(e => [e, 1])) } }).nouveauxEssais.length === 0);
v('seules les variantes à espérance positive et ≥ 50 trades peuvent être retenues', Object.values(eg.meilleurs).every(l => l.esperance > 0 && l.n >= 50));
const viaTravailleur = executerPositionsSync({ type: 'grille', actif: 'BTC', famille: 'extremes_h1' }, {}, { BTC: long });
v('le travailleur sait explorer une grille', viaTravailleur.ok && viaTravailleur.resultat.lignes.length === 2 * 2);
fs.rmSync(dossier, { recursive: true, force: true });
console.log('Circuit des positions : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
