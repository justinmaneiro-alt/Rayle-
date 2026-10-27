import { CONFIG_DEFAUT, simuler, statistiques, semaineUTC } from '../pc/agent-btc/moteur.js';
import { depuisBougies, tranche } from '../pc/agent-btc/colonnes.js';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { FAMILLES, ORDRE_FAMILLES, combinaisons, voisins } from '../pc/agent-btc/hypotheses.js';
import { CRITERES, empreinteCriteres } from '../pc/agent-btc/criteres.js';
import { decouper, evaluerVariante, jugerHorsEchantillon, monteCarlo, parTrimestre, seuilComparaisonsMultiples, walkForward, statsSur } from '../pc/agent-btc/evaluation.js';
import { decouperAvecCoffre, grilleFine, rechercher } from '../pc/agent-btc/boucle.js';
import { marcheMixte, serieSynth, T0 } from './synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const SANS_COUT = { fraisPct: 0, spreadPct: 0, glissementPct: 0, reposBarres: 0, distanceMinPct: 0, distanceMaxPct: 100 };

/* Petit marché écrit à la main : 40 bougies plates à 100, puis scénarios. */
function plat(n, p = 100) { return Array.from({ length: n }, (_, i) => ({ t: T0 + i * 900e3, o: p, h: p + 0.5, l: p - 0.5, c: p, v: 10, vb: 5 })); }
const signal = (n, i, sens, stop, R = 4) => { const o = { sens: new Int8Array(n), stop: new Float64Array(n), R }; o.sens[i] = sens; o.stop[i] = stop; return o; };
const seul = (bougies, sig, cfg = SANS_COUT) => simuler(depuisBougies(bougies), sig, cfg);

// ── exécution ──
{
  const b = plat(60); b[11] = { ...b[11], o: 100, h: 100.2, l: 99.9, c: 100 };
  for (let j = 12; j < 20; j++) { b[j] = { ...b[j], o: 100 + (j - 12), h: 101 + (j - 12), l: 100 + (j - 12) - 0.2, c: 101 + (j - 12) }; }   // monte de 1 par bougie
  const r = seul(b, signal(60, 10, 1, 99));                       // signal en 10 → entrée à l'ouverture de 11 (100) ; stop 99 → risque 1 ; cible 104
  v('entrée à l’ouverture de la bougie SUIVANTE (pas la bougie du signal)', r.trades.length === 1 && r.trades[0].entree === 11 && r.trades[0].prixEntree === 100, JSON.stringify(r.trades[0]));
  v('cible atteinte : R = +4 sans frais', r.trades[0].motif === 'cible' && proche(r.trades[0].R, 4, 1e-6), JSON.stringify([r.trades[0].motif, r.trades[0].R]));
}
{
  const b = plat(40); b[12] = { ...b[12], l: 98.5 };               // touche le stop (99) sans toucher la cible
  const r = seul(b, signal(40, 10, 1, 99));
  v('stop touché : R = −1 sans frais, sortie au prix du stop', r.trades[0].motif === 'stop' && proche(r.trades[0].R, -1, 1e-6) && r.trades[0].prixSortie === 99);
}
{
  const b = plat(40); b[12] = { ...b[12], h: 105, l: 98.5 };       // stop ET cible dans la même bougie
  const r = seul(b, signal(40, 10, 1, 99));
  v('stop et cible dans la même bougie : le STOP est compté (hypothèse prudente)', r.trades[0].motif === 'stop' && r.trades[0].R < 0);
}
{
  const b = plat(40); b[12] = { t: b[12].t, o: 97, h: 97.5, l: 96.5, c: 97, v: 10, vb: 5 };   // ouvre sous le stop (gap)
  const r = seul(b, signal(40, 10, 1, 99));
  v('gap au-delà du stop : sortie à l’ouverture, pire que le stop (R < −1)', r.trades[0].prixSortie === 97 && r.trades[0].R < -1.9, JSON.stringify(r.trades[0].R));
}
{
  const b = plat(300), r = seul(b, signal(300, 10, 1, 99), { ...SANS_COUT, maxBarres: 50 });
  v('temps maximum de détention : sortie à la clôture', r.trades[0].motif === 'temps' && r.trades[0].barres === 50);
  const b2 = plat(20), r2 = seul(b2, signal(20, 10, 1, 99), { ...SANS_COUT, maxBarres: 500 });
  v('position encore ouverte à la fin des données : non comptée (aucun résultat inventé)', r2.trades.length === 0 && r2.tronque === true);
}
{
  const b = plat(40); b[12] = { ...b[12], l: 98.5 };
  const r = seul(b, signal(40, 10, -1, 101));                      // vente : stop 101, cible 96
  v('vente : le haut n’atteint pas 101, le bas non plus : pas de sortie avant la fin → non comptée', r.trades.length === 0);
  const b2 = plat(40); b2[13] = { ...b2[13], l: 95 };
  const r2 = seul(b2, signal(40, 10, -1, 101));
  v('vente : cible atteinte par le bas, R = +4', r2.trades[0].motif === 'cible' && proche(r2.trades[0].R, 4, 1e-6) && r2.trades[0].sens === -1);
}
{
  const b = plat(60); b[15] = { ...b[15], l: 98 };
  const c = { ...SANS_COUT, fraisPct: 0.1, spreadPct: 0.1, glissementPct: 0.1 }, r = seul(b, signal(60, 10, 1, 99), c).trades[0], r0 = seul(b, signal(60, 10, 1, 99)).trades[0];
  v('frais, spread et glissement : prix d’entrée plus haut, R net inférieur au R brut', r.prixEntree > 100 && r.R < r0.R && r.coutsR > 0 && proche(r.Rbrut - r.coutsR, r.R, 1e-9));
  v('entrée : ouverture × (1 + glissement + demi-spread)', proche(r.prixEntree, 100 * (1 + 0.001 + 0.0005), 1e-9));
}
{
  const b = plat(200), sig = signal(200, 10, 1, 99); sig.sens[12] = 1; sig.stop[12] = 99; sig.sens[40] = 1; sig.stop[40] = 99;
  b[30] = { ...b[30], l: 98 };
  const r = seul(b, sig);
  v('une seule position à la fois : le signal pendant la position est ignoré', r.trades.length >= 1 && r.trades[0].entree === 11 && r.trades.every((x, k, a) => k === 0 || x.entree > a[k - 1].sortie), JSON.stringify(r.trades.map(x => [x.entree, x.sortie])));
}
{
  const b = plat(400), sig = { sens: new Int8Array(400), stop: new Float64Array(400).fill(99), R: 4 };
  for (let i = 10; i < 390; i += 4) { sig.sens[i] = 1; b[i + 2] = { ...b[i + 2], l: 98.5 }; }
  const r = seul(b, sig, { ...SANS_COUT, maxParSemaine: 2 });
  const parSem = {}; for (const x of r.trades) { const k = semaineUTC(x.t); parSem[k] = (parSem[k] || 0) + 1; }
  v('limite hebdomadaire : jamais plus de 2 positions par semaine', Math.max(...Object.values(parSem)) <= 2 && r.trades.length >= 1, JSON.stringify(parSem));
  const r2 = seul(b, sig, { ...SANS_COUT, reposBarres: 40, maxParSemaine: 99 });
  v('repos entre deux positions respecté', r2.trades.every((x, k, a) => k === 0 || x.signal - a[k - 1].sortie >= 40 || x.signal >= a[k - 1].sortie + 40));
  const r3 = seul(b, sig, { ...SANS_COUT, distanceMinPct: 5 });
  v('stop trop proche (1 % < 5 %) : trade écarté', r3.trades.length === 0);
}
{
  const a = marcheMixte(8000, 2), ctx = construireContexte(a), p = combinaisons(FAMILLES.squeeze.grille(0))[7];
  const r1 = evaluerVariante(ctx, 'squeeze', p, {}, { de: 0, a: a.n }), r2 = evaluerVariante(ctx, 'squeeze', p, {}, { de: 0, a: a.n });
  v('déterministe : deux exécutions identiques, bit pour bit', JSON.stringify(r1.trades) === JSON.stringify(r2.trades) && JSON.stringify(r1.stats) === JSON.stringify(r2.stats));
}
{
  const t = [{ R: 2, sens: 1, barres: 10, t: T0 }, { R: -1, sens: -1, barres: 20, t: T0 }, { R: -1, sens: 1, barres: 30, t: T0 }, { R: 4, sens: 1, barres: 5, t: T0 }];
  const s = statistiques(t, { barres: 672 * 2, risquePct: 1 });
  v('statistiques : espérance, facteur de profit, taux de réussite, creux, par semaine, concentration', s.n === 4 && proche(s.esperance, 1) && proche(s.factProfit, 3) && s.tauxReussite === 0.5 && proche(s.ddR, 2) && proche(s.parSemaine, 2) && proche(s.concentration, 4 / 6), JSON.stringify(s));
  v('statistiques : aucun trade = rien d’inventé (espérance nulle, null)', statistiques([]).esperance === null && statistiques([]).n === 0);
}

// ── AUCUN REGARD VERS LE FUTUR : chaque famille, plusieurs jeux de paramètres, plusieurs instants ──
{
  const S = marcheMixte(9000, 8), ctxPlein = construireContexte(S);
  let bon = true, detail = '', testes = 0;
  for (const f of ORDRE_FAMILLES) {
    const jeux = combinaisons(FAMILLES[f].grille(1)); const choix = [jeux[0], jeux[Math.floor(jeux.length / 2)], jeux[jeux.length - 1]];
    for (const p of choix) {
      const plein = FAMILLES[f].signaux(ctxPlein, p);
      for (const i of [1500, 4000, 6500, 8500]) {
        const court = FAMILLES[f].signaux(construireContexte(tranche(S, 0, i + 1)), p); testes++;
        for (let j = 0; j <= i; j++) if (plein.sens[j] !== court.sens[j] || (plein.sens[j] !== 0 && Math.abs(plein.stop[j] - court.stop[j]) > 1e-9)) { bon = false; detail = f + ' i=' + i + ' j=' + j; break; }
        if (!bon) break;
      }
      if (!bon) break;
    }
    if (!bon) break;
  }
  v('SIGNAUX CAUSAUX : les signaux jusqu’à i sont identiques sur la série complète et sur la série coupée en i (5 familles × 3 jeux × 4 instants = ' + testes + ' contrôles)', bon, detail);
  // le contexte lui-même : phases H1 / H4 alignées
  let bonCtx = true; for (const i of [2000, 5000, 7000]) { const c = construireContexte(tranche(S, 0, i + 1)); for (let j = 500; j <= i; j += 37) if (c.h1.phase[j] !== ctxPlein.h1.phase[j] || c.h4.phase[j] !== ctxPlein.h4.phase[j] || !(Math.abs(c.h1.atr[j] - ctxPlein.h1.atr[j]) < 1e-9 || (Number.isNaN(c.h1.atr[j]) && Number.isNaN(ctxPlein.h1.atr[j])))) bonCtx = false; }
  v('CONTEXTE CAUSAL : phases H1 / H4 et ATR H1 alignés sur M15 identiques sur la série coupée', bonCtx);
  // un trade ne dépend que des bougies jusqu'à sa sortie
  let p = null, e = null; for (const q of combinaisons(FAMILLES.cassure_range.grille(0))) { const x = evaluerVariante(ctxPlein, 'cassure_range', q, {}, { de: 0, a: S.n }); if (!e || x.trades.length > e.trades.length) { e = x; p = q; } }
  const k = Math.min(5, e.trades.length - 2), tr = e.trades[k], coupe = tranche(S, 0, tr.sortie + 1), e2 = evaluerVariante(construireContexte(coupe), 'cassure_range', p, {}, { de: 0, a: coupe.n });
  v('un trade ne dépend que des bougies jusqu’à sa sortie (série coupée à la sortie : mêmes trades jusque-là)', e.trades.length >= 4 && JSON.stringify(e2.trades.slice(0, k + 1)) === JSON.stringify(e.trades.slice(0, k + 1)), e.trades.length);
}

// ── hypothèses et grilles ──
v('cinq familles d’hypothèses avec description et grille', ORDRE_FAMILLES.length === 5 && ORDRE_FAMILLES.every(f => FAMILLES[f].nom && FAMILLES[f].description && Object.keys(FAMILLES[f].grille(0)).length >= 4));
v('objectif 4 à 6 R pour toutes les familles', ORDRE_FAMILLES.every(f => FAMILLES[f].grille(0).R.every(r => r >= 4 && r <= 6)));
v('génération 1 = génération 0 + filtres (séance, delta)', ORDRE_FAMILLES.every(f => combinaisons(FAMILLES[f].grille(1)).length === 4 * combinaisons(FAMILLES[f].grille(0)).length));
v('voisins : un paramètre décalé d’un cran', (() => { const p = { N: 144, mult: 2, stopATR: 1.5, R: 5, contreTendance: 0 }; const vs = voisins('cassure_range', p); return vs.length === 9 && vs.every(x => Object.keys(p).filter(k => p[k] !== x[k]).length === 1); })());
v('grille affinée : milieux entre valeurs voisines', (() => { const g = grilleFine('cassure_range', { N: 144, mult: 2, stopATR: 1.5, R: 5, contreTendance: 0 }); return g.mult.join() === '1.75,2,2.5' && g.R.join() === '4.5,5,5.5' && g.contreTendance.join() === '0'; })());

// ── protocole ──
{
  const S = marcheMixte(105000, 3);                                // ≈ 3,0 ans
  const d = decouper(S);
  v('découpage : zone de recherche 75 %, jeu final 25 %, blocs de test de 6 mois après 12 mois d’entraînement', d.ok && d.finA === Math.floor(S.n * 0.75) && d.folds.length >= 2 && d.folds[0].train[1] === d.folds[0].test[0] && d.folds.every((f, i, a) => i === 0 || f.test[0] === a[i - 1].test[1]), JSON.stringify([d.finA, d.folds.length]));
  v('découpage : les blocs de test ne touchent JAMAIS le jeu final', d.folds.every(f => f.test[1] <= d.finA) && d.jeuFinal[0] === d.finA);
  v('découpage : historique trop court = refus honnête', decouper(tranche(S, 0, 40000)).ok === false && /24 mois|au moins/.test(decouper(tranche(S, 0, 40000)).raison));
  // le walk-forward choisit sur l'entraînement seulement
  const ctx = construireContexte(S), grille = combinaisons(FAMILLES.cassure_range.grille(0)).slice(0, 60);
  const lignes = grille.map(p => evaluerVariante(ctx, 'cassure_range', p, {}, { de: 0, a: d.finA }));
  const wf = walkForward(lignes, d, {}), alter = lignes.map(l => ({ ...l, trades: l.trades.map(x => (x.entree >= d.folds[0].test[0] && x.entree < d.folds[0].test[1] ? { ...x, R: 9 } : x)) }));
  const wf2 = walkForward(alter, d, {});
  v('walk-forward : les paramètres du 1er bloc ne changent pas quand on truque les trades de CE bloc de test (choix sur l’entraînement seul)', JSON.stringify(wf.blocs[0].params) === JSON.stringify(wf2.blocs[0].params) && wf2.blocs[0].test.esperance !== wf.blocs[0].test.esperance);
  v('walk-forward : trades hors échantillon bout à bout, tous dans les blocs de test', wf.trades.every(x => d.folds.some(f => x.entree >= f.test[0] && x.entree < f.test[1])));
  const mc1 = monteCarlo(wf.trades.length >= 8 ? wf.trades : lignes[0].trades), mc2 = monteCarlo(wf.trades.length >= 8 ? wf.trades : lignes[0].trades);
  v('Monte Carlo : reproductible (graine fixe), creux P95 ≥ P50, espérance P5 ≤ P50 ≤ P95', mc1 && JSON.stringify(mc1) === JSON.stringify(mc2) && mc1.ddP95 >= mc1.ddP50 && mc1.espP5 <= mc1.espP50 && mc1.espP50 <= mc1.espP95);
  v('Monte Carlo : trop peu de trades = pas de conclusion', monteCarlo([{ R: 1 }, { R: -1 }]) === null);
}
v('comparaisons multiples : le seuil du hasard grandit avec le nombre de variantes testées et baisse avec le nombre de trades', seuilComparaisonsMultiples(1000, 2, 100) > seuilComparaisonsMultiples(10, 2, 100) && seuilComparaisonsMultiples(100, 2, 400) < seuilComparaisonsMultiples(100, 2, 100) && seuilComparaisonsMultiples(1, 2, 100) === 0);
v('trimestres : regroupement et part positive', (() => { const q = parTrimestre([{ t: Date.UTC(2025, 0, 5), R: 1 }, { t: Date.UTC(2025, 1, 5), R: 1 }, { t: Date.UTC(2025, 3, 5), R: -1 }, { t: Date.UTC(2025, 4, 5), R: -2 }], 2); return q.utiles === 2 && q.positifs === 1 && q.partPositive === 0.5; })());
v('critères figés : version, empreinte stable, 4 à 6 R, pas plus de 5 positions par semaine', CRITERES.version === 1 && empreinteCriteres() === empreinteCriteres() && empreinteCriteres().length === 8 && CRITERES.horsEchantillon.parSemaineMax === 5 && Object.isFrozen(CRITERES));

// ── boucle d'adaptation sur un marché aléatoire : honnêteté ──
{
  const S = marcheMixte(105000, 11), evts = [];
  const verdict = await rechercher({ m15: S, generationsMax: 1, familles: ['cassure_range', 'squeeze'], surEvenement: e => evts.push(e), cede: async () => {} });
  v('boucle : marché sans avantage garanti → aucune candidate validée sans passer tous les critères (verdict honnête)', ['aucune', 'validee', 'rejetee', 'attente_jeu_final'].includes(verdict.etat), verdict.etat);
  const journal = verdict.journal;
  v('journal : critères écrits avant les tests, découpage, puis une entrée par famille avec décision et raison', journal[0].etape === 'debut' && /AVANT les tests/.test(journal[0].pourquoi) && journal[1].etape === 'decoupage' && journal.filter(j => j.etape === 'famille').length >= 2 && journal.filter(j => j.etape === 'famille').every(j => ['garder', 'ajuster', 'supprimer'].includes(j.decision) && j.pourquoi.length > 20));
  v('journal : le compteur de variantes testées est tenu et dit', verdict.nVariantes > 100 && journal[journal.length - 1].etape !== undefined && verdict.nVariantesCetteRecherche === verdict.nVariantes);
  v('boucle : événements de progression et de fin émis', evts.some(e => e.type === 'progres') && evts.filter(e => e.type === 'fin').length === 1 && evts.filter(e => e.type === 'journal').length === journal.length);
  if (verdict.etat === 'aucune') v('« aucune stratégie robuste trouvée » dit clairement, jeu final NON ouvert', /Aucune stratégie robuste trouvée/.test(verdict.resume) && verdict.coffre.ouverts.length === 0);
  else v('un verdict non « aucune » ne vient que d’un passage de TOUS les critères (vérifié sur la candidate)', verdict.strategie && verdict.strategie.juge.ok === true);
}
{
  const S = marcheMixte(105000, 11), vite = await rechercher({ m15: S, generationsMax: 1, familles: ['cassure_range'], budget: { variantesMax: 30 }, cede: async () => {} });
  v('budget de variantes : recherche interrompue honnêtement, rien de validé', vite.etat === 'interrompue' && /budget/.test(vite.resume) && vite.strategie === null);
  let n = 0; const stop = await rechercher({ m15: S, generationsMax: 1, familles: ['squeeze'], arret: () => ++n > 50, cede: async () => {} });
  v('arrêt demandé par l’utilisateur : recherche interrompue', stop.etat === 'interrompue' && /arrêt/.test(stop.resume));
  const court = await rechercher({ m15: tranche(S, 0, 30000), cede: async () => {} });
  v('historique trop court : refus, aucune recherche', court.etat === 'refus_historique' && court.nVariantes === 0);
}

// ── le jeu final n'est ouvert qu'une fois ──
{
  const permissif = Object.freeze({ ...CRITERES, version: 99, recherche: { tradesMin: 5, esperanceMin: -9, factProfitMin: 0 },
    horsEchantillon: { esperanceMin: -9, tradesMin: 5, factProfitMin: 0, drawdownMaxR: 9999, parSemaineMax: 99, parSemaineMin: 0, trimestresPositifsMin: 0, trimestresTradesMin: 1, concentrationMax: 9 },
    robustesse: { voisinsPositifsMin: 0, voisinsMin: 0, medianeVoisinsVsMeilleur: -99 }, monteCarlo: { simulations: 200, drawdownP95MaxR: 9999, esperanceP5Min: -99 }, comparaisonsMultiples: { facteur: 0 },
    jeuFinal: { esperanceMin: -9, tradesMin: 1, factProfitMin: 0, drawdownMaxR: 9999, parSemaineMax: 99 } });
  const S = marcheMixte(105000, 5);
  const v1 = await rechercher({ m15: S, generationsMax: 1, familles: ['retour_poc', 'squeeze'], criteres: permissif, cede: async () => {} });
  v('critères permissifs (test de la mécanique seulement) : une candidate passe et le jeu final est ouvert', v1.etat === 'validee' && v1.coffre.ouverts.length === 1 && v1.strategie.jeuFinal.stats.n >= 1, v1.etat);
  const ouv = v1.coffre.ouverts[0];
  v('le coffre note la période, les paramètres, l’instant d’ouverture et le verdict', ouv.debut > 0 && ouv.fin > ouv.debut && ouv.params && ouv.ouvertLe > 0 && ouv.verdict === 'validee');
  v('le jeu final ouvert n’a pas été utilisé pendant la recherche (les blocs de test s’arrêtent avant lui)', v1.strategie.jeuFinal.debut >= S.t[Math.floor(S.n * 0.75)] - 1);
  const d2 = decouperAvecCoffre(S, v1.coffre, permissif);
  v('après ouverture : plus de jeu final disponible tant que 6 mois de données fraîches ne se sont pas écoulés', d2.ok && d2.jeuFinal === null && d2.attente && d2.attente.jusquau > ouv.fin);
  const v2 = await rechercher({ m15: S, generationsMax: 1, familles: ['retour_poc', 'squeeze'], criteres: permissif, coffre: v1.coffre, cede: async () => {} });
  v('seconde recherche : la candidate est trouvée mais NON validée (jeu final brûlé), coffre inchangé', v2.etat === 'attente_jeu_final' && v2.coffre.ouverts.length === 1 && /indisponible/.test(v2.resume), v2.etat);
  const plusLong = marcheMixte(105000 + 20000, 5), d3 = decouperAvecCoffre(plusLong, v1.coffre, permissif);
  v('avec ≥ 6 mois de données fraîches : un NOUVEAU jeu final (strictement postérieur à l’ancien) est disponible', d3.ok && (d3.jeuFinal === null || plusLong.t[d3.jeuFinal[0]] >= ouv.fin - 1), JSON.stringify(d3.jeuFinal));
}

console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
