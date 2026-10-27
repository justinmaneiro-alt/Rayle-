import fs from 'node:fs';
import { CRITERES3, empreinteV3 } from '../../strategies/criteres-v3.js';
import { bibliotheque, ORDRE_V3, famille, tailleGrille } from '../../strategies/familles-v3.js';
import { validerV3, verifierCausalite, STATUTS_V3 } from '../../strategies/validation-v3.js';
import { ouvrirJeuFinalV3 } from '../../strategies/jeu-final-v3.js';
import { intervalleBootstrap, simulerProp, detecterDerive, parRegime } from '../../strategies/stats-v3.js';
import { FAMILLES } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { evaluerVariante } from '../../planetes/mars/pc/agent-btc/evaluation.js';
import { empreinteCriteres } from '../../planetes/mars/pc/agent-btc/criteres.js';
import { marcheMixte, serieSynth } from '../../planetes/mars/tests/synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

/* ── critères : écrits avant, jamais assouplis ── */
const json = JSON.parse(fs.readFileSync(new URL('../../strategies/criteres-v3.json', import.meta.url), 'utf8'));
v('criteres-v3.json identique à criteres-v3.js (relancer node strategies/ecrire-criteres.mjs sinon)', JSON.stringify(json.criteres) === JSON.stringify(CRITERES3) && json.empreinte === empreinteV3());
v('critères v1 intacts (empreinte c9995253)', empreinteCriteres() === 'c9995253');
v('v3 : 4 blocs de test, 150 trades, 6 % de creux, 3 % par jour, 95 % de déflation', CRITERES3.walkForward.fenetresMin === 4 && CRITERES3.horsEchantillon.tradesMin === 150 && CRITERES3.prop.drawdownMaxPct === 6 && CRITERES3.prop.perteJourMaxPct === 3 && CRITERES3.deflation.dsrMin === 0.95);
v('v3 : simulation en direct de 4 semaines ou 30 trades avant toute alerte d’entrée', CRITERES3.simulationDirect.semainesMin === 4 && CRITERES3.simulationDirect.tradesMin === 30);
v('v3 gelée (aucune modification silencieuse)', Object.isFrozen(CRITERES3) && Object.isFrozen(CRITERES3.prop));
const CRITERES_MD = fs.readFileSync(new URL('../../strategies/CRITERES.md', import.meta.url), 'utf8');
v('CRITERES.md cite l’empreinte courante', CRITERES_MD.includes(empreinteV3()));

/* ── bibliothèque ── */
v('six familles', bibliotheque().length === 6 && ORDRE_V3.length === 6);
v('chaque famille : nom et description français, grille raisonnable (≤ 200 variantes)', bibliotheque().every(b => b.nom && b.description.length > 60 && tailleGrille(b.id) >= 8 && tailleGrille(b.id) <= 200));
v('chaque famille : signaux() est une fonction', ORDRE_V3.every(id => typeof famille(id).signaux === 'function'));

/* ── statistiques ── */
{
  const R = Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? 2.5 : -1)), b = intervalleBootstrap(R, { tirages: 2000, graine: 5 }), b2 = intervalleBootstrap(R, { tirages: 2000, graine: 5 });
  v('bootstrap : reproductible (même graine)', b.bas === b2.bas && b.haut === b2.haut);
  v('bootstrap : intervalle autour de la moyenne', b.bas < b.moy && b.moy < b.haut, JSON.stringify(b));
  const perdant = Array.from({ length: 200 }, (_, i) => (i % 2 ? 1 : -1.2));
  v('bootstrap : stratégie perdante → borne basse < 0', intervalleBootstrap(perdant, { tirages: 2000 }).bas < 0);
  v('bootstrap : trop peu de trades → pas d’intervalle', intervalleBootstrap([1, 2, 3]).bas === null);
}
{
  const j = 86400e3, T = (d, r, h = 0) => ({ R: r, tSortie: d * j + h * 3600e3 });
  const t = [T(1, -1), T(1, -1, 1), T(1, -1, 2), T(2, 2), T(3, 2)];                       // 3 pertes le même jour = −3 R
  const p = simulerProp(t, { risquePct: 1, drawdownMaxPct: 6, perteJourMaxPct: 3 });
  v('prop : pire journée = 3 pertes de 1 % = 3 % (calculé à la main)', Math.abs(p.pireJourPct - 3) < 1e-9 && p.ok && Math.abs(p.ddPct - 3) < 1e-9 && Math.abs(p.gainPct - 1) < 1e-9, JSON.stringify(p));
  const p2 = simulerProp(t, { risquePct: 2, drawdownMaxPct: 6, perteJourMaxPct: 3 });
  v('prop : à 2 % de risque, la journée à −6 % dépasse la limite de 3 %', !p2.ok && Math.abs(p2.pireJourPct - 6) < 1e-9);
  v('prop : risque maximal conseillé = 3 % / 3 R = 1 %', Math.abs(p.risqueMaxPct - 1) < 1e-9, String(p.risqueMaxPct));
  const t2 = Array.from({ length: 8 }, (_, i) => T(i + 1, -1)); const p3 = simulerProp(t2, { risquePct: 1, drawdownMaxPct: 6, perteJourMaxPct: 3 });
  v('prop : 8 pertes de suite à 1 % = creux de 8 % > 6 %', !p3.ok && Math.abs(p3.ddPct - 8) < 1e-9);
}
{
  const bons = Array.from({ length: 30 }, () => 0.5), mauvais = Array.from({ length: 30 }, (_, i) => (i % 2 ? -1.5 : 0.2));
  v('dérive : résultats conformes → pas de dérive', !detecterDerive(bons, { attendu: 0.4, sigma: 1.5 }).derive);
  const d = detecterDerive(mauvais, { attendu: 0.4, sigma: 1 });
  v('dérive : résultats nettement sous l’attendu → dérive (CUSUM)', d.derive && d.cusum >= 4, JSON.stringify(d));
  v('dérive : trop peu de trades → jamais de verdict', !detecterDerive([-3, -3, -3], { attendu: 0.4, sigma: 1 }).derive);
  const rg = parRegime([{ regime: 'hausse', R: 1 }, ...Array.from({ length: 25 }, () => ({ regime: 'range', R: 0.5 })), ...Array.from({ length: 25 }, () => ({ regime: 'baisse', R: -0.2 }))], 20);
  v('régimes : 2 évaluables, 1 positif', rg.evaluables === 2 && rg.positifs === 1 && !rg.regimes.hausse.assez);
}

/* ── causalité : les six familles ne regardent pas le futur (poison du futur) ── */
const m15 = marcheMixte(24000, 11);
for (const id of ORDRE_V3) {
  const f = famille(id), p = Object.fromEntries(Object.entries(f.grille(0)).map(([k, x]) => [k, x[0]])), c = verifierCausalite(f, p, m15, { coupes: 3 });
  v('causalité : ' + id, c.ok, JSON.stringify(c));
}
{
  const f = famille('cassure_retest'), ctx = construireContexte(m15), s = f.signaux(ctx, { N: 96, attente: 48, tol: 0.6, pad: 0.3, R: 3 });
  v('cassure_retest : produit des signaux sur un marché mêlant range et tendance', s.sens.some(x => x !== 0));
}

/* ── LE test exigé : une stratégie volontairement MAUVAISE doit être rejetée ; une stratégie « truquée » doit être détectée ── */
const historique = marcheMixte(170000, 5);                                                   // ≈ 4,8 ans de M15 synthétiques (marché mêlant hausses, baisses, ranges)
FAMILLES.test_mauvaise = {
  id: 'test_mauvaise', nom: 'TEST : entrées au hasard, stop serré', description: 'Stratégie fictive volontairement mauvaise : entre tous les 60 bougies, côté tiré au hasard, stop à 2,5 ATR.',
  grille: () => ({ pas: [60, 80], k: [2.5, 3], R: [2] }),
  signaux(ctx, p) {
    const n = ctx.n, o = { sens: new Int8Array(n), stop: new Float64Array(n), R: p.R }; let graine = 99;
    for (let i = 400; i < n; i += p.pas) { graine = (graine * 1103515245 + 12345) & 0x7fffffff; const s = (graine >> 8) % 2 ? 1 : -1, a = ctx.atr15[i]; if (!(a > 0)) continue; o.sens[i] = s; o.stop[i] = ctx.m15.c[i] - s * p.k * a; }
    return o;
  }
};
FAMILLES.test_truquee = {
  id: 'test_truquee', nom: 'TEST : triche avec le futur', description: 'Stratégie fictive qui regarde la clôture 12 bougies PLUS TARD pour choisir son sens.',
  grille: () => ({ pas: [30, 40], k: [2.5, 3], R: [0.6] }),
  signaux(ctx, p) {
    const n = ctx.n, o = { sens: new Int8Array(n), stop: new Float64Array(n), R: p.R };
    for (let i = 400; i < n - 12; i += p.pas) { const a = ctx.atr15[i]; if (!(a > 0)) continue; const s = ctx.m15.c[i + 12] > ctx.m15.c[i] ? 1 : -1; o.sens[i] = s; o.stop[i] = ctx.m15.c[i] - s * p.k * a; }
    return o;
  }
};
{
  const t0 = Date.now(), r = validerV3(historique, 'test_mauvaise');
  v('stratégie MAUVAISE : rejetée (non validée)', r.ok && r.statut === 'non_validee', r.statut);
  v('stratégie MAUVAISE : au moins l’espérance, l’intervalle ou le déflaté échouent', r.ratees && r.ratees.length >= 2, JSON.stringify(r.ratees));
  v('stratégie MAUVAISE : le jeu final n’est pas ouvert', r.jeuFinalOuvert === false);
  console.log('   (mauvaise stratégie évaluée en ' + Math.round((Date.now() - t0) / 1000) + ' s)');
}
{
  const ctx = construireContexte(historique), e = evaluerVariante(ctx, 'test_truquee', { pas: 30, k: 2.5, R: 0.6 }, {}, { de: 0, a: historique.n });
  v('stratégie TRUQUÉE : sans la garde, elle aurait l’air excellente (espérance > +0,1 R)', e.stats.esperance > 0.1, String(e.stats.esperance));
  const r = validerV3(historique, 'test_truquee', { ctx });
  v('stratégie TRUQUÉE : DÉTECTÉE et rejetée pour causalité', r.statut === 'rejetee_causalite' && r.causalite.ecarts > 0 && STATUTS_V3[r.statut].includes('TRICHE'), r.statut);
}
{
  const r = validerV3(marcheMixte(8000, 2), 'tendance_ma');
  v('historique trop court : refus clair, pas de verdict', r.statut === 'insuffisant' && /mois/.test(r.raison));
}
{
  const debutFinal = historique.t[Math.floor(historique.n * 0.8)], r = validerV3(historique, 'test_mauvaise', { debutFinal });
  v('coffre : la recherche ne voit que ce qui précède le jeu final (zone de recherche < date du coffre)', r.zoneRecherche.a < debutFinal && r.statut === 'non_validee', JSON.stringify(r.zoneRecherche));
  const f = ouvrirJeuFinalV3(historique, { pas: 60, k: 2.5, R: 2 }, 'test_mauvaise', { debutFinal, rang: 1 });
  v('jeu final : une mauvaise stratégie échoue (ou attend), ne réussit jamais', f.ok === false && f.ouvert === true && f.lignes.some(l => !l.ok), f.statut);
  const f6 = ouvrirJeuFinalV3(historique, { pas: 60, k: 2.5, R: 2 }, 'test_mauvaise', { debutFinal, rang: 6 });
  v('jeu final : au plus 5 ouvertures par paire', f6.statut === 'attente' && f6.ouvert === false);
  const fCourt = ouvrirJeuFinalV3(historique, { pas: 60, k: 2.5, R: 2 }, 'test_mauvaise', { debutFinal: historique.t[historique.n - 5000], rang: 1 });
  v('jeu final : moins de 6 mois de données → on attend', fCourt.statut === 'attente' && /6/.test(fCourt.raison));
  v('jeu final : k-ième ouverture → niveau de confiance plus exigeant (rang 3 : 98,3 %)', /98,3/.test(ouvrirJeuFinalV3(historique, { pas: 60, k: 2.5, R: 2 }, 'test_mauvaise', { debutFinal, rang: 3 }).lignes.find(l => /bootstrap/.test(l.critere)).critere));
}
delete FAMILLES.test_mauvaise; delete FAMILLES.test_truquee;
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
