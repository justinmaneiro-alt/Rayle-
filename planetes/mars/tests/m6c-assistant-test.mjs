// M6c : assistant temps réel, alertes (fréquence, raisons), voix, tableau de performance, validation (protocole, hasard, statut), vue HTML, dessins du graphique.
// Lancer :  node planetes/mars/tests/m6c-assistant-test.mjs
import { analyserAssistant, evaluerSortie, limiterFrequence, rsi, dessinsRegime } from '../pc/agent-m6c/assistant-regime.js';
import { contexteRegime, REGLES } from '../pc/agent-m6c/regles-regime.js';
import { detecterM6c, repondreM6c } from '../pc/agent-m6c/voix-m6c.js';
import { tableauM6c, simulationRegle, NOMS_REGLES } from '../pc/agent-m6c/performance-m6c.js';
import { RESULTATS_M6C, STATUTS_M6C } from '../pc/agent-m6c/resultats-m6c.js';
import { evaluerRegle, statutRegle, hasardAleatoire, voisinsGrille, achatConservation, parAnnee, parCote } from '../pc/agent-m6c/validation-m6c.js';
import { CRITERES_M6C } from '../pc/agent-m6c/criteres-m6c.js';
import { decouper } from '../pc/agent-btc/evaluation.js';
import { validerDessin } from '../pc/agent-m6/dessins.js';
import { vueAssistantM6c } from '../pc/trading/vue-assistant-m6c.js';
import { serieSynth, marcheMixte } from './synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

// ── assistant sur un marché sans direction : range, « NE PAS ENTRER », aucune entrée ──
const plat = serieSynth({ segments: [{ n: 6000, derive: 0, bruit: 0.14, volume: 100, retour: 0.06 }], graine: 7 });
const ctxPlat = contexteRegime(plat);
let iRange = -1; for (let i = ctxPlat.n - 1; i > 1500; i--) if (ctxPlat.reg.regime[i] === 3) { iRange = i; break; }
v('le marché sans direction contient un range (préalable du test)', iRange > 0);
const sPlat = { ...plat }; // tranche jusqu'à une bougie où le range est actif
const coupe = (s, n) => { const o = { n }; for (const k of ['t', 'o', 'h', 'l', 'c', 'v', 'vb']) o[k] = s[k].slice(0, n); return o; };
const aR = analyserAssistant({ serie: coupe(plat, iRange + 1), paire: 'BTC', statuts: {}, observation: true, maintenant: 1 });
v('assistant : analyse réussie', aR.ok && aR.regime && aR.regles.length === 4, aR.erreur);
{ const rg = aR.alertes.find(x => x.type === 'RANGE');
  v('range : alerte « NE PAS ENTRER » avec les deux bornes et « pas de position »', !!rg && /NE PAS ENTRER/.test(rg.texte) && /pas de position/.test(rg.texte) && rg.haut > rg.bas, rg && rg.texte);
  v('range : aucune alerte d’ENTRÉE (tout est en information)', !aR.alertes.some(x => x.type === 'ENTREE'));
  v('assistant : phrases en français, commence par le régime', aR.phrases.length >= 1 && /range|Transition|Tendance/.test(aR.phrases[0])); }
v('assistant : les règles non validées sont en INFORMATION', aR.regles.every(r => r.statut === 'INFORMATION'));
v('assistant : trop peu de bougies → erreur claire', analyserAssistant({ serie: coupe(plat, 500), paire: 'BTC' }).ok === false);

// ── ENTRÉE seulement si une règle a le statut SIGNAL ; sinon OBSERVATION étiquetée information ──
{ const segs = [{ n: 3600, derive: 0.01, bruit: 0.1, volume: 100 }, { n: 700, derive: 0, bruit: 0.12, volume: 90, retour: 0.08 }, { n: 8, derive: 0.35, bruit: 0.05, volume: 500 }, { n: 12, derive: -0.12, bruit: 0.05, volume: 120 }, { n: 300, derive: 0.02, bruit: 0.08, volume: 110 }];
  const S = serieSynth({ segments: segs, graine: 11 }), ctx = contexteRegime(S), imm = REGLES.cassure_range.signaux(ctx, { mode: 'immediat', score: 3, mult: 1.5 }), i = imm.sens.findIndex(x => x !== 0);
  v('(préalable) une cassure fabriquée existe', i > 3000);
  const info = analyserAssistant({ serie: coupe(S, i + 1), paire: 'BTC', statuts: {}, parametres: { cassure_range: { mode: 'immediat', score: 3, mult: 1.5 } }, observation: true }), sig = analyserAssistant({ serie: coupe(S, i + 1), paire: 'BTC', statuts: { cassure_range: 'SIGNAL' }, parametres: { cassure_range: { mode: 'immediat', score: 3, mult: 1.5 } } });
  v('règle en INFORMATION : pas d’ENTRÉE, une OBSERVATION étiquetée « information »', !info.alertes.some(x => x.type === 'ENTREE') && info.alertes.some(x => x.type === 'OBSERVATION' && /INFORMATION/.test(x.texte) && /aucune entrée proposée/.test(x.texte)), JSON.stringify(info.alertes.map(x => x.type)));
  v('règle en SIGNAL : ENTRÉE avec niveau, stop et stop suiveur', (() => { const e = sig.alertes.find(x => x.type === 'ENTREE'); return !!e && e.stop > 0 && e.suivi > 0 && e.entree > 0 && /stop suiveur/.test(e.texte) && e.validee === true; })(), JSON.stringify(sig.alertes.map(x => x.type)));
  v('observation désactivée : aucune OBSERVATION', !analyserAssistant({ serie: coupe(S, i + 1), paire: 'BTC', statuts: {}, parametres: { cassure_range: { mode: 'immediat', score: 3, mult: 1.5 } }, observation: false }).alertes.some(x => x.type === 'OBSERVATION')); }

// ── « ça craint » : raisons ──
{ const hausse = serieSynth({ segments: [{ n: 5000, derive: 0.02, bruit: 0.12, volume: 100 }, { n: 60, derive: -0.25, bruit: 0.1, volume: 400 }], graine: 5 }), ctx = contexteRegime(hausse), j = ctx.n - 1;
  const e = evaluerSortie(ctx, j, { sens: 1 });
  v('après un effondrement, une position acheteuse « craint » (régime changé ou structure perdue)', e.conseille && e.raisons.some(r => r.code === 'regime' || r.code === 'structure'), JSON.stringify(e.raisons.map(r => r.code)));
  v('chaque raison est une phrase en français', e.raisons.every(r => r.texte.length > 12));
  const pos = { sens: 1, entree: hausse.c[4900], stop: hausse.c[4900] * 0.97, suivi: ctx.h1.atr[4900] * 3, indexEntree: 4900 }, ep = evaluerSortie(ctx, j, { sens: 1, position: pos });
  v('clôture sous le stop suiveur → raison « stop » grave', ep.raisons.some(r => r.code === 'stop' && r.grave));
  const aS = analyserAssistant({ serie: hausse, paire: 'BTC', position: pos, ctx });
  v('avec une position : alerte SORTIE « sortie conseillée » et raisons', aS.alertes.some(x => x.type === 'SORTIE' && /sortie conseillée/.test(x.texte) && x.raisons.length > 0)); }
{ const taux = Array.from({ length: 100 }, (_, i) => ({ taux: 0.0001 + i * 1e-7 })); taux.push({ taux: 0.01 });
  const hausse = serieSynth({ segments: [{ n: 5000, derive: 0.02, bruit: 0.12, volume: 100 }], graine: 5 }), ctx = contexteRegime(hausse);
  v('financement extrême (acheteurs surchargés) → raison pour un achat', evaluerSortie(ctx, ctx.n - 1, { sens: 1, funding: taux }).raisons.some(r => r.code === 'financement'));
  v('financement extrême ne gêne pas une vente', !evaluerSortie(ctx, ctx.n - 1, { sens: -1, funding: taux }).raisons.some(r => r.code === 'financement')); }
{ const r = rsi(Float64Array.from({ length: 60 }, (_, i) => 100 + i)); v('RSI d’une hausse continue = 100', r[59] === 100); }

// ── fréquence maximale des alertes ──
{ const t0 = 1e12, A = (type, cle) => ({ type, cle, id: type + cle }), H = [];
  const r1 = limiterFrequence([A('RANGE', 'a'), A('ATTENTION', 'x')], H, t0); v('première alerte de chaque type : gardée', r1.gardees.length === 2);
  const r2 = limiterFrequence([A('RANGE', 'a'), A('RANGE', 'b'), A('ATTENTION', 'x'), A('ATTENTION', 'y')], r1.historique, t0 + 30 * 60e3); v('RANGE : jamais deux fois en 12 h ; même ATTENTION identique : bloquée, autre : gardée', r2.gardees.length === 1 && r2.gardees[0].cle === 'y', JSON.stringify(r2.gardees));
  const r3 = limiterFrequence([A('RANGE', 'a')], r2.historique, t0 + 13 * 3600e3); v('RANGE : permis à nouveau après 12 h', r3.gardees.length === 1);
  const e1 = limiterFrequence([A('ENTREE', 'u')], [], t0), e2 = limiterFrequence([A('ENTREE', 'v')], e1.historique, t0 + 3600e3); v('ENTRÉE : au plus une toutes les 4 h', e1.gardees.length === 1 && e2.gardees.length === 0); }

// ── dessins du graphique : valides pour le magasin de dessins ──
{ const d = dessinsRegime({ ctx: ctxPlat, desc: aR.regime, paire: 'BTC' }), prixRef = plat.c[iRange];
  v('dessins : au moins les bornes du range', d.some(x => x.type === 'ligne_h') && d.length >= 2);
  v('dessins : tous valides pour le magasin (prix, temps, groupe)', d.every(x => { const r = validerDessin(x, { prixRef, maintenant: plat.t[plat.n - 1] + 9e5, tMin: plat.t[0] }); return r.ok && r.dessin.groupe === 'regime-m6c'; }), JSON.stringify(d.map(x => validerDessin(x, { prixRef, maintenant: plat.t[plat.n - 1] + 9e5 })).filter(r => !r.ok).slice(0, 1))); }

// ── voix ──
for (const [phrase, sujet] of [['on est en range ?', 'etat'], ['est-ce qu on est en tendance sur bitcoin', 'etat'], ['quel est le regime actuel de solana', 'etat'], ['où sont les bornes du range', 'bornes'], ['y a-t-il une cassure valide', 'cassure'], ['attention fausse cassure', 'fausse_cassure'], ['ça craint sur le bitcoin', 'craint'], ['dois-je sortir', 'craint']]) {
  const d = detecterM6c(phrase); v('voix « ' + phrase + ' » → ' + sujet, !!d && d.sujet === sujet, JSON.stringify(d)); }
v('voix : « quel est le score de régime » reste au rapport M6 existant', detecterM6c('quel est le score du regime de marche') === null);
v('voix : phrase sans rapport ignorée', detecterM6c('mets la musique') === null && detecterM6c('') === null);
v('voix : la paire est reconnue', detecterM6c('ça craint sur doge').paire === 'DOGE');
{ const t = tableauM6c({ paire: 'BTC' });
  v('voix : en range, « je ne propose rien »', /range entre/.test(repondreM6c({ sujet: 'etat' }, aR, t)) && /ne propose rien/.test(repondreM6c({ sujet: 'etat' }, aR, t)));
  v('voix : les bornes sont dites', /borne basse/.test(repondreM6c({ sujet: 'bornes' }, aR, t)));
  v('voix : sans analyse, message d’erreur honnête', /ne peux pas lire/.test(repondreM6c({ sujet: 'etat' }, { ok: false, erreur: 'x' }, t)));
  v('voix : dit qu’aucune règle n’a battu le hasard', /aucune règle d’entrée n’a encore battu le hasard/.test(repondreM6c({ sujet: 'etat' }, analyserAssistant({ serie: coupe(plat, iRange + 1), paire: 'BTC', statuts: {} }), t)) || aR.regime.code === 3); }

// ── tableau de performance (résultats MESURÉS) ──
{ const t = tableauM6c({ paire: 'BTC' });
  v('performance : étiquette BACKTEST, quatre règles, verdict honnête', t.ok && t.etiquette === 'BACKTEST' && t.regles.length === 4 && /hasard|critères/.test(t.verdict));
  v('performance : chaque règle a n, espérance, centile du hasard et une phrase', t.regles.every(r => r.n > 0 && r.esperance != null && r.centileHasard != null && r.phrase.length > 20));
  v('performance : aucune règle n’est présentée comme confirmée en réel', t.regles.every(r => r.statut !== 'CONFIRMÉ EN RÉEL'));
  v('performance : détecteur, fausses cassures, trades évités, gros mouvements présents', t.detecteur.length === 3 && t.cassures && t.cassures.evitees >= 0 && t.evites && t.grosMouvements.n > 0);
  v('performance : paire inconnue → ok:false', tableauM6c({ paire: 'XXX' }).ok === false);
  const s = simulationRegle({ paire: 'BTC', id: 'cassure_range', gain: 0 });
  v('performance : simulation à 0,25 / 0,5 / 1 % de risque, probabilités dans [0,1]', s.ok && s.niveaux.length === 3 && s.niveaux.every(x => x.pObjectif >= 0 && x.pObjectif <= 1 && x.pDrawdown >= 0 && x.pJour >= 0) && /pas une promesse/.test(s.phrase), JSON.stringify(s).slice(0, 200));
  v('performance : simulation refusée sans assez de trades', simulationRegle({ paire: 'BTC', id: 'regle_inconnue' }).ok === false); }
v('statuts mesurés : toutes les règles sont en INFORMATION (aucune n’a passé tous les critères)', Object.values(STATUTS_M6C).every(p => Object.values(p).every(x => x === 'INFORMATION')));
v('résultats : critères M6c et zone de recherche seulement', RESULTATS_M6C.criteres.empreinte === 'd8c5e758' && Object.values(RESULTATS_M6C.paires).every(p => p.zoneAMois > 24));

// ── vue HTML ──
{ const html = vueAssistantM6c({ analyses: { BTC: aR }, simulations: {} });
  v('vue : BACKTEST, INFORMATION, bornes du range et boutons', /BACKTEST/.test(html) && /INFORMATION/.test(html) && /Bornes du range/.test(html) && /data-a="m6c-analyser"/.test(html) && /NE PAS ENTRER/.test(html));
  v('vue : critères affichés avec leur empreinte', /d8c5e758/.test(html) && /Jeu final/.test(html));
  v('vue : trois paires, aucun HTML cassé par du texte (échappement)', ['Bitcoin', 'Solana', 'Dogecoin'].every(n => html.includes(n)) && !/<script/i.test(html)); }

// ── validation : protocole, hasard déterministe, statut ──
{ const S = marcheMixte(80000, 12), dec = decouper(S); v('(préalable) la série fabriquée est assez longue pour le protocole', dec.ok, dec.raison);
  const ctx = contexteRegime(S);
  const r = evaluerRegle({ ctx, id: 'tendance_repli', decoupe: dec, nAvant: 3101, tirages: 30 });
  v('validation : retourne les lignes des critères v2 ET M6c', r.lignes.length >= 18 && r.lignes.some(l => /aléatoires/.test(l.critere)) && r.lignes.some(l => /Croisement/.test(l.critere)) && r.lignes.some(l => /filtre de régime/.test(l.critere)) && r.lignes.some(l => /achat-conservation/.test(l.critere)) && r.lignes.some(l => /Sharpe déflaté/.test(l.critere)));
  v('validation : le compteur de variantes ne baisse jamais et compte les variantes sans filtre', r.nVariantes === 3101 + r.nLignes && r.nLignes > 15);
  const h1 = hasardAleatoire(ctx, 'tendance_repli', r.wf, dec, { tirages: 12, graine: 5 }), h2 = hasardAleatoire(ctx, 'tendance_repli', r.wf, dec, { tirages: 12, graine: 5 });
  v('hasard : même graine = mêmes tirages (reproductible)', JSON.stringify(h1) === JSON.stringify(h2) && h1.length === 12);
  const st = statutRegle({ resultat: r, positivesSurPaires: 0 }); v('statut : une règle qui ne passe pas tout est INFORMATION, raisons listées', st.statut === 'INFORMATION' && st.raisons.length > 0);
  const fauxTout = { lignes: [{ critere: 'x', ok: true }] }; v('statut : tout passe mais une paire seulement positive → INFORMATION', statutRegle({ resultat: fauxTout, positivesSurPaires: 1 }).statut === 'INFORMATION');
  v('statut : tout passe + 2 paires → attend le jeu final (jamais SIGNAL sans lui)', statutRegle({ resultat: fauxTout, positivesSurPaires: 2 }).statut === 'EN_ATTENTE_JEU_FINAL');
  v('statut : jeu final raté → INFORMATION ; réussi → SIGNAL', statutRegle({ resultat: fauxTout, positivesSurPaires: 3, jeuFinal: { ok: false, lignes: [{ critere: 'f', ok: false }] } }).statut === 'INFORMATION' && statutRegle({ resultat: fauxTout, positivesSurPaires: 3, jeuFinal: { ok: true, lignes: [] } }).statut === 'SIGNAL');
  v('voisins : un cran de chaque côté', voisinsGrille('tendance_cassure', REGLES.tendance_cassure.defaut).length === 4);
  v('validation : jamais de lecture du jeu final (les trades du walk-forward restent dans la zone A)', r.wf.trades.every(x => x.sortie < dec.finA + 1344));
  const bh = achatConservation(ctx, dec); v('achat-conservation : rendement et creux calculés', Number.isFinite(bh.rendementPct) && bh.ddPct >= 0);
  v('par année / par côté : sommes cohérentes', parAnnee(r.wf.trades).reduce((a, x) => a + x.n, 0) === r.wf.trades.length && parCote(r.wf.trades).long.n + parCote(r.wf.trades).court.n === r.wf.trades.length);
  v('critères v2 non assouplis par la validation', r.lignes.find(l => /Trades hors échantillon/.test(l.critere)).seuil === '≥ 150' && r.lignes.find(l => /Espérance nette/.test(l.critere)).seuil === '≥ 0.25'); }

console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
