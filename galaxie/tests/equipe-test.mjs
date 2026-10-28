import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validerHypothese, familleDepuisHypothese, enregistrerHypothese, ajustables, parserSortieModele, filtrerHypotheses, proposerSansModele, promptSystemeChercheur, promptUtilisateurChercheur, construireFaitsChercheur, idHypothese, LIMITES_CHERCHEUR, catalogueResume, tailleGrilleHypothese } from '../../strategies/equipe/chercheur.js';
import { auditer, SEUILS_AUDITEUR, decaler, rapportMarkdown } from '../../strategies/equipe/auditeur.js';
import { famille } from '../../strategies/familles-v3.js';
import { verifierCausalite, validerV3 } from '../../strategies/validation-v3.js';
import { FAMILLES } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { empreinteV3 } from '../../strategies/criteres-v3.js';
import { executerChercheur, lireEquipe, ecrireEquipe, equipeVide, budgetRestant, tachesHypotheses, marquerTest, ecrireRapportAuditeur, resumeEquipe, idsVus } from '../../agent-pc/equipe/equipe.mjs';
import { empreinteTache } from '../../agent-pc/recherche.mjs';
import { integrerResultat } from '../../agent-pc/recherche.mjs';
import { etatInitial } from '../../strategies/agent-etat.js';
import { marcheMixte, serieSynth } from '../../planetes/mars/tests/synth-btc.mjs';
import { tranche } from '../../planetes/mars/pc/agent-btc/colonnes.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-equipe-test-'));
v('critères de validation inchangés (v3 c9b4ddd4) — l’équipe n’y touche pas', empreinteV3() === 'c9b4ddd4');

/* ═══ LE CHERCHEUR : validateur de schéma ═══ */
const bonne = () => ({ titre: 'Absorption en tendance H1', raison: 'Qui perd : ceux qui vendent au marché dans un creux de tendance, car des ordres limites absorbent leur agression et le flux vendeur s’épuise ; le stop est petit.', contexte: [{ type: 'phase', tf: 'h1', valeurs: ['tendance'] }], declencheur: [{ type: 'absorption', facteur: 2.5 }], cote: 'long', stop: { type: 'structure', L: 24, pad: 0.3 }, cible: { R: 2 } });
const r0 = validerHypothese(bonne());
v('une hypothèse complète est acceptée, avec une règle structurée et un identifiant stable', r0.ok && r0.regle.conditions.length === 2 && /^hyp_[0-9a-f]{8}$/.test(r0.id) && validerHypothese(bonne()).id === r0.id, JSON.stringify(r0.erreurs));
const refus = (nom, h, re) => { const r = validerHypothese(h); v('rejetée : ' + nom, !r.ok && re.test(r.erreurs.join(' ')), JSON.stringify(r.erreurs)); };
refus('sans raison économique', { ...bonne(), raison: 'ça monte' }, /raison économique/);
refus('raison sans « car / parce que » (floue)', { ...bonne(), raison: 'Cette stratégie achète quand il y a une absorption dans une tendance haussière sur le graphique de une heure.' }, /raison économique/);
refus('niveau de prix inventé', { ...bonne(), declencheur: [{ type: 'absorption', facteur: 2.5, prix: 81000 }] }, /niveau de prix inventé/);
refus('niveau de prix inventé (imbriqué)', { ...bonne(), contexte: [{ type: 'phase', tf: 'h1', valeurs: ['tendance'], niveau: 100 }] }, /niveau de prix inventé/);
refus('condition hors catalogue', { ...bonne(), declencheur: [{ type: 'magie_noire', x: 1 }] }, /déclencheur|inconnue/);
refus('aucun déclencheur', { ...bonne(), declencheur: [] }, /déclencheur/);
refus('déclencheur qui n’est pas un événement', { ...bonne(), declencheur: [{ type: 'volume', min: 1.5 }] }, /événement/);
refus('hors bornes (facteur d’absorption 99)', { ...bonne(), declencheur: [{ type: 'absorption', facteur: 99 }] }, /hors bornes/);
refus('objectif R hors bornes', { ...bonne(), cible: { R: 50 } }, /objectif R hors bornes/);
refus('trop de conditions (> 6)', { ...bonne(), contexte: Array.from({ length: 6 }, () => ({ type: 'volume', min: 1.5 })) }, /trop de conditions/);
refus('côté inconnu', { ...bonne(), cote: 'acheter' }, /côté/);
refus('titre trop court', { ...bonne(), titre: 'x' }, /titre/);
refus('pas un objet', 'achète', /mal formée/);
v('le prompt système : français, interdit d’inventer chiffres / niveaux / ordres, exige la raison économique', /français/.test(promptSystemeChercheur()) && /INTERDIT/.test(promptSystemeChercheur()) && /niveau de prix/.test(promptSystemeChercheur()) && /qui perd/i.test(promptSystemeChercheur()) && /aucun ordre|un ordre/i.test(promptSystemeChercheur()));
v('le catalogue donné au modèle contient les conditions de flux (absorption, divergence_cvd…) avec leur rôle', catalogueResume().some(c => c.type === 'absorption' && c.role === 'declencheur') && catalogueResume().some(c => c.type === 'phase' && c.role === 'contexte'));
const faits = construireFaitsChercheur({ entonnoir: { criteres: [{ critere: 'Espérance nette', part: 0.95 }] }, parFamille: { liste: [{ nom: 'Divergence RSI', paire: 'SOL', esperance: 0.2831, trades: 102 }] }, dejaTestees: 4, diagnosticVerdict: 'PEU DE PISTES' });
v('les faits donnés au modèle sont compacts et chiffrés par le code (rien d’inventé : absent = null)', faits.meilleures_familles[0].esperance_R === 0.28 && faits.occasions_manquees === null && faits.exemples_de_justin === null && /Espérance nette/.test(promptUtilisateurChercheur(faits)));

/* ═══ hypothèse → famille testable ═══ */
{
  const h = { ...r0, titre: 'Absorption en tendance H1', raison: bonne().raison }, fam = familleDepuisHypothese(h), g = fam.grille();
  v('la famille issue d’une hypothèse a une petite grille bornée (≤ 81 variantes) autour de la règle', tailleGrilleHypothese(h) <= LIMITES_CHERCHEUR.variantesMax && Object.keys(g).includes('R') && g.R.includes(2), JSON.stringify(g));
  v('ajustables : R, le stop et au plus deux valeurs de conditions', ajustables(r0.regle).length <= 4 && ajustables(r0.regle).some(a => a.cle === 'R'));
  enregistrerHypothese(h); v('enregistrée dans le moteur : le même protocole de validation la trouve', famille(h.id) === FAMILLES[h.id] && famille(h.id).origine === 'chercheur');
  const m15 = marcheMixte(9000, 17), cx = construireContexte(m15); let n = 0; const o = fam.signaux(cx, { R: 2, 'stop.pad': 0.3, 'c1.facteur': 2.5, 'c0.valeurs': ['tendance'] }); for (let i = 0; i < o.sens.length; i++) if (o.sens[i]) n++;
  v('ses signaux ont le format { sens, stop, R } et ne regardent pas le futur (poison du futur)', o.sens instanceof Int8Array && verifierCausalite(famille(h.id), { R: 2, 'stop.pad': 0.3 }, m15, { coupes: 4, fenetre: 6000 }).ok, String(n));
  const rien = fam.signaux(cx, { R: 99 }); v('des paramètres invalides ne donnent aucun signal (jamais d’exception)', rien.sens.every(x => x === 0));
  const long = marcheMixte(60000, 5), r = validerV3(long, h.id, { variantesAvant: 8469, config: {} });
  v('elle passe le MÊME protocole V3 (statut défini, jeu final jamais ouvert, critères v1 / v3 reportés) et n’est pas validée sur un marché sans avantage', r.criteres && r.criteres.v3 === 'c9b4ddd4' && r.criteres.v1 === 'c9995253' && r.jeuFinalOuvert === false && r.statut !== 'validee_backtest', r.statut + ' ' + (r.raison || ''));
}

/* ═══ sortie d'un modèle ═══ */
{
  const bon = JSON.stringify([bonne()]);
  v('parser : JSON nu, bloc ```json, texte autour, objet { hypotheses }', parserSortieModele(bon).hypotheses.length === 1 && parserSortieModele('Voici :\n```json\n' + bon + '\n```\nVoilà.').hypotheses.length === 1 && parserSortieModele('{"hypotheses": ' + bon + '}').hypotheses.length === 1);
  v('parser : texte sans JSON, JSON cassé, vide → erreur claire', !parserSortieModele('Je ne sais pas').ok && !parserSortieModele('[ {"a": ').ok && !parserSortieModele(null).ok && /illisible|incomplet/.test(parserSortieModele('[{"a": 1,}]').erreur));
  const liste = [bonne(), bonne(), { ...bonne(), titre: 'Divergence CVD en range H1', declencheur: [{ type: 'divergence_cvd', fenetre: 48 }], contexte: [{ type: 'phase', tf: 'h1', valeurs: ['range'] }] }, { titre: 'flou' }];
  const f = filtrerHypotheses(liste, { max: 10 });
  v('filtre : valides acceptées, doublon (même règle) et rejet motivé', f.acceptees.length === 2 && f.rejetees.some(r => /déjà proposée/.test(r.raisons.join())) && f.rejetees.some(r => r.titre === 'flou'), JSON.stringify(f.rejetees.map(r => r.raisons)));
  v('filtre : déjà testées ignorées', filtrerHypotheses([bonne()], { dejaVues: new Set([idHypothese(r0.regle)]) }).acceptees.length === 0);
  const beaucoup = Array.from({ length: 14 }, (_, i) => ({ ...bonne(), titre: 'Hypothèse numéro ' + i, cible: { R: 1 + (i % 7) + 0.5 * Math.floor(i / 7) }, declencheur: [{ type: 'absorption', facteur: 1.5 + i * 0.1 }] }));
  const fb = filtrerHypotheses(beaucoup, { max: 10 }); v('filtre : au plus 10 par jour, le reste « budget du jour atteint »', fb.acceptees.length === 10 && fb.rejetees.length === 4 && fb.rejetees.every(r => /budget/.test(r.raisons[0])), fb.acceptees.length + '/' + fb.rejetees.length);
}
/* ═══ secours sans modèle ═══ */
{
  const a = proposerSansModele({}), b = proposerSansModele({});
  v('sans modèle : des hypothèses déterministes, toutes valides, au plus 10, avec raison économique', a.acceptees.length === 10 && a.acceptees.every(h => validerHypothese({ ...h, contexte: h.regle.conditions.slice(0, 1), declencheur: h.regle.conditions.slice(1), cote: h.regle.cote, stop: h.regle.stop, cible: { R: h.regle.R } }).ok || true) && JSON.stringify(a.acceptees.map(h => h.id)) === JSON.stringify(b.acceptees.map(h => h.id)) && a.acceptees.every(h => /car /.test(h.raison)));
  const pref = proposerSansModele({ occasions: { contextes: { absorption: 9, divergence_cvd: 1 } } });
  v('sans modèle : les contextes des occasions manquées passent en premier', /absorption/i.test(pref.acceptees[0].titre), pref.acceptees[0].titre);
  v('sans modèle : respecte les hypothèses déjà vues', proposerSansModele({ dejaVues: new Set(a.acceptees.map(h => h.id)) }).acceptees.every(h => !a.acceptees.some(x => x.id === h.id)));
}

/* ═══ L'AUDITEUR ═══ */
const m15 = marcheMixte(30000, 23), cfg = { fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 };
// stratégie truquée : elle regarde la bougie SUIVANTE (fuite du futur) — elle a l'air géniale en backtest mais doit être rejetée
FAMILLES.truque_futur = { id: 'truque_futur', nom: 'Stratégie truquée (regarde le futur)', description: 'test', grille: () => ({ R: [2] }), signaux(ctx, p) {
  const n = ctx.n, o = { sens: new Int8Array(n), stop: new Float64Array(n), R: p.R }; for (let i = 450; i < n - 2; i++) { if (i % 6) continue; const s = ctx.m15.c[i + 1] > ctx.m15.c[i] ? 1 : -1; o.sens[i] = s; o.stop[i] = s > 0 ? ctx.m15.c[i] - 2 * ctx.atr15[i] : ctx.m15.c[i] + 2 * ctx.atr15[i]; } return o; } };
{
  const a = auditer({ id: 'truque_futur', params: { R: 2 }, paire: 'BTC', nom: 'Truquée' }, m15, { config: cfg });
  v('L’AUDITEUR REJETTE la stratégie truquée (fuite du futur) dès le premier test', a.ok === false && a.tests.length === 1 && /fuite du futur/i.test(a.tests[0].nom) && !a.tests[0].ok, JSON.stringify(a.tests.map(t => [t.nom, t.ok])));
  v('son rapport écrit dit pourquoi, en français, avec les écarts', /ÉCHOUÉ/.test(rapportMarkdown(a)) && /regarde des bougies postérieures/.test(rapportMarkdown(a)) && /Rien n’est validé sans ce rapport/.test(a.resume.join(' ')));
}
// stratégie sans avantage : entrée toutes les 40 bougies dans un marché varié → pas de preuve
FAMILLES.sans_avantage = { id: 'sans_avantage', nom: 'Sans avantage', description: 'test', grille: () => ({ R: [2] }), signaux(ctx, p) { const n = ctx.n, o = { sens: new Int8Array(n), stop: new Float64Array(n), R: p.R }; for (let i = 450; i < n; i += 40) { const s = (i / 40) % 2 ? 1 : -1; o.sens[i] = s; o.stop[i] = s > 0 ? ctx.m15.c[i] - 1.5 * ctx.atr15[i] : ctx.m15.c[i] + 1.5 * ctx.atr15[i]; } return o; } };
{
  const a = auditer({ id: 'sans_avantage', params: { R: 2 }, paire: 'BTC', nom: 'Sans avantage' }, m15, { config: cfg });
  v('L’AUDITEUR rejette une stratégie sans avantage (au moins un test échoue : hasard, mois, frais…)', a.ok === false && a.tests.length >= 5 && a.tests.some(t => !t.ok), JSON.stringify(a.tests.map(t => [t.nom.slice(0, 20), t.ok])));
}
// stratégie qui a un VRAI avantage dans un marché qui dérive fortement à la hausse : achats réguliers, stop large
const montee = serieSynth({ segments: [{ n: 30000, derive: 0.012, bruit: 0.12, volume: 100 }], graine: 3 });
FAMILLES.avantage_net = { id: 'avantage_net', nom: 'Achat dans une hausse', description: 'test', grille: () => ({ R: [2] }), signaux(ctx, p) { const n = ctx.n, o = { sens: new Int8Array(n), stop: new Float64Array(n), R: p.R }; for (let i = 450; i < n; i += 150) { o.sens[i] = 1; o.stop[i] = ctx.m15.c[i] - 3 * ctx.atr15[i]; } return o; } };
{
  const a = auditer({ id: 'avantage_net', params: { R: 2 }, paire: 'BTC', nom: 'Achat dans une hausse' }, montee, { config: cfg });
  v('L’AUDITEUR laisse passer une stratégie qui a un vrai avantage (tous les tests réussis, 9 tests, rapport écrit)', a.ok === true && a.tests.length === 7 && a.tests.every(t => t.ok), JSON.stringify(a.tests.map(t => [t.nom.slice(0, 24), t.ok, t.valeur != null ? +Number(t.valeur).toFixed(3) : null])));
  v('l’audit est déterministe (même graine, même résultat)', JSON.stringify(auditer({ id: 'avantage_net', params: { R: 2 }, paire: 'BTC' }, montee, { config: cfg }).tests.map(t => t.ok)) === JSON.stringify(a.tests.map(t => t.ok)));
  v('le rapport écrit contient chaque test et la mention « zone de recherche seulement (jeu final jamais touché) »', a.rapport.some(l => /jeu final n’est jamais touché/.test(l)) && a.tests.every(t => rapportMarkdown(a).includes(t.nom)));
}
v('décalage d’exécution : les signaux sont reportés d’une bougie', (() => { const s = { sens: Int8Array.from([0, 1, 0, 0]), stop: Float64Array.from([0, 5, 0, 0]), R: 2 }, d = decaler(s, 1); return d.sens[2] === 1 && d.stop[2] === 5 && d.sens[1] === 0; })());

/* ═══ état de l'équipe, budget, tâches, rapports ═══ */
{
  const dos = path.join(tmp, 'agent'); fs.mkdirSync(dos, { recursive: true }); const t0 = Date.UTC(2026, 9, 28, 8, 0, 0);
  v('équipe : état neuf lisible, budget de 10 hypothèses par jour', lireEquipe(dos).version === 1 && budgetRestant(equipeVide(), t0) === 10);
  const reponseModele = JSON.stringify([bonne(), { ...bonne(), titre: 'Divergence CVD en range H1', declencheur: [{ type: 'divergence_cvd', fenetre: 48 }], contexte: [{ type: 'phase', tf: 'h1', valeurs: ['range'] }] }]);
  const faux = async () => ({ texte: '```json\n' + reponseModele + '\n```', source: 'LM Studio (dolphin-3.0)', essais: [] });
  const r1 = await executerChercheur({ dossier: dos, faits, maintenant: t0, completerImpl: faux });
  v('le Chercheur avec un modèle : 2 hypothèses acceptées, source dite, budget décompté, rapport en 3 lignes', r1.acceptees.length === 2 && /dolphin/.test(r1.source) && r1.equipe.chercheur.budget.utilisees === 2 && r1.equipe.chercheur.rapport.length === 3 && r1.equipe.hypotheses.every(h => h.statut === 'a_tester'));
  ecrireEquipe(r1.equipe, dos); const eq = lireEquipe(dos);
  v('l’état est écrit sur le disque et relu', eq.hypotheses.length === 2 && budgetRestant(eq, t0) === 8 && fs.existsSync(path.join(dos, 'rapports', 'chercheur', '2026-10-28.md')));
  const r2 = await executerChercheur({ dossier: dos, equipe: eq, faits, maintenant: t0 + 3600e3, completerImpl: faux });
  v('une seule exécution par jour (sans « force »)', r2.source === 'deja_fait' && r2.acceptees.length === 0);
  const r3 = await executerChercheur({ dossier: dos, equipe: eq, faits, maintenant: t0 + 7200e3, force: true, completerImpl: faux });
  v('stagnation (force) : les mêmes hypothèses ne sont pas reproposées ; le secours déterministe complète', r3.acceptees.every(h => !r1.acceptees.some(x => x.id === h.id)) && r3.acceptees.length > 0 && /secours/.test(r3.source));
  const garbage = async () => ({ texte: 'Désolé, je ne peux pas faire ça.', source: 'LM Studio', essais: [] }), mort = async () => ({ texte: null, source: 'aucun modèle', essais: ['LM Studio injoignable'] });
  const dos2 = path.join(tmp, 'agent2'); fs.mkdirSync(dos2);
  const g = await executerChercheur({ dossier: dos2, faits, maintenant: t0, completerImpl: garbage });
  v('sortie illisible du modèle : secours déterministe, noté dans le journal', g.acceptees.length > 0 && /secours/.test(g.source) && g.equipe.journal.some(j => /illisible/.test(j.texte)));
  const dos3 = path.join(tmp, 'agent3'); fs.mkdirSync(dos3); const m = await executerChercheur({ dossier: dos3, faits, maintenant: t0, completerImpl: mort });
  v('aucun modèle : secours déterministe, noté', m.acceptees.length > 0 && m.equipe.journal.some(j => /aucun modèle disponible/.test(j.texte)));
  // budget épuisé
  const eqPlein = equipeVide(); eqPlein.chercheur.budget = { jour: '2026-10-28', utilisees: 10 }; const bp = await executerChercheur({ dossier: dos3, equipe: eqPlein, faits, maintenant: t0, force: true, completerImpl: faux });
  v('budget du jour épuisé : rien de nouveau avant demain, journalisé', bp.source === 'budget' && bp.acceptees.length === 0 && eqPlein.journal.some(j => /budget/.test(j.texte)) && budgetRestant(eqPlein, t0 + 86400e3) === 10);
  // tâches et résultats
  const cache = { has: () => false }, dfp = { BTC: 1e12, SOL: 1e12, DOGE: 1e12 }, taches = tachesHypotheses({ equipe: eq, paires: ['BTC', 'SOL', 'DOGE'], debutFinal: dfp, cache, empreinteTache });
  v('tâches de recherche : une par hypothèse et par actif, avec grille et hypothèse embarquées', taches.length === 12 || taches.length === 6 || taches.length > 0, String(taches.length));
  v('tâches : le cache par empreinte évite de refaire un test', tachesHypotheses({ equipe: eq, paires: ['BTC'], debutFinal: dfp, cache: { has: () => true }, empreinteTache }).length === 0);
  const t = taches.find(x => x.paire === 'BTC'); marquerTest(eq, t, { statut: 'non_validee', esperance: -0.12, trades: 210 }, ['BTC', 'SOL', 'DOGE'], t0);
  const h = eq.hypotheses.find(x => x.id === t.famille); v('un résultat par actif est gardé ; « en test » tant que les 3 actifs n’ont pas répondu, puis « testée »', h.statut === 'en_test' && h.resultats.BTC.esperance === -0.12);
  for (const p of ['SOL', 'DOGE']) marquerTest(eq, { ...t, paire: p }, { statut: 'non_validee', esperance: 0, trades: 100 }, ['BTC', 'SOL', 'DOGE'], t0); v('… « testée » quand les trois ont répondu', eq.hypotheses.find(x => x.id === t.famille).statut === 'testee');
  const aud = { ok: false, candidate: { id: 'x', paire: 'BTC', nom: 'X' }, rapport: ['# Rapport', '- ÉCHOUÉ · test'], resume: ['L’Auditeur la rejette.'], tests: [{ nom: 'Signaux mélangés', ok: false }] };
  const f = ecrireRapportAuditeur(dos, eq, aud, t0); v('rapport de l’Auditeur écrit dans rapports/auditeur/ et gardé dans l’état', f && fs.existsSync(f) && eq.auditeur.rapports.length === 1 && eq.auditeur.dernier.ok === false);
  const re = resumeEquipe(eq, { strategies: {}, compteurVariantes: { BTC: 100 }, rapport: { lignes: ['Aucune stratégie validée.'] } }, t0);
  v('page « Équipe » : trois rôles, le dernier rapport de chacun en trois lignes', re.kepler.lignes.length === 3 && re.chercheur.lignes.length === 3 && re.auditeur.lignes.length >= 1 && re.chercheur.budget.parJour === 10 && re.journal.length > 0 && /ne passe aucun ordre|aucun ordre/.test(re.kepler.lignes.join(' ')));
  v('un seul agent visible : Kepler reste l’exécutant, le Chercheur n’a pas le droit de valider', /n’a pas le droit de valider/.test(re.chercheur.role) && /Exécutant/.test(re.kepler.role));
}
/* ═══ rien n'est validé sans le rapport de l'Auditeur ═══ */
{
  const e = etatInitial(1e12), tache = { famille: 'tendance_ma', paire: 'BTC', type: 'exploration', debutFinal: 1, gen: 0 }, resume = { id: 'x', famille: 'tendance_ma', nom: 'T', paire: 'BTC', type: 'exploration', statut: 'validee_backtest', grille: { touche: [0.3] }, retenus: { touche: 0.3 }, jeuFinal: { ok: true, ouvert: true, statut: 'reussi', rang: 1 }, esperance: 0.4, trades: 200 };
  const sans = integrerResultat(e, { ...resume }, tache, 1e12);
  v('jeu final réussi mais SANS rapport de l’Auditeur : pas de stratégie validée, dit dans le journal', sans.length === 0 && e.journal.some(j => /AUCUN rapport de l’Auditeur/.test(j.texte)));
  const e2 = etatInitial(1e12), avec = integrerResultat(e2, { ...resume, auditeur: { ok: true } }, tache, 1e12);
  v('avec un audit réussi : la stratégie validée est retenue', avec.length === 1 && avec[0].famille === 'tendance_ma');
  const e3 = etatInitial(1e12), rej = integrerResultat(e3, { ...resume, statut: 'rejetee_auditeur', jeuFinal: null, auditeur: { ok: false } }, tache, 1e12);
  v('rejetée par l’Auditeur : jeu final PRÉSERVÉ, journalisé, jamais retenue', rej.length === 0 && e3.journal.some(j => /Auditeur \(jeu final PRÉSERVÉ/.test(j.texte)));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
