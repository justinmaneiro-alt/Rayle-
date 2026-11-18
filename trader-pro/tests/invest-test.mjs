/* Tests de « Investissement long terme » : extraction EDGAR, valorisation (DCF, multiples, Graham, Piotroski, Altman), badges, tableau, autres actifs, lot du cron du Worker (fetch et dépôt simulés).
   Usage : node trader-pro/tests/invest-test.mjs */
import assert from 'node:assert/strict';
import { bloc, extraireFaits, lireChartYahoo, ETIQUETTES } from '../invest/sources.js';
import { evaluer, dcf, graham, piotroski, altman, prixA, facteurSplit, mediane, quantile, explication, ligneIndex, BADGES } from '../invest/valeur.js';
import { calculerEntreprise } from '../invest/calcul.js';
import { filtrerLignes, trierLignes, comptes, pairesDe, secteursDe } from '../invest/tableau.js';
import { enSemaines, analyserActifLT, phraseActifLT, ACTIFS_LT, centile } from '../invest/actifs-lt.js';
import { univers, SP500, CAC40 } from '../invest/univers.js';
import { lotLongTerme, traiterLT, evenementsDe, KV } from '../worker/src/long-terme.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, egal = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, proche = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, m + ' : ' + a + ' ≠ ' + b); n++; };
const AN = 86400e3;

/* ───── jeu de données synthétique : une entreprise saine, croissance régulière ───── */
function faitsSynth({ annees = 10, nom = 'Société Test', rev0 = 10e9, g = 0.06, marge = 0.2, actions = 1e9, eps = true } = {}) {
  const us = {}, add = (tag, unite, L) => { us[tag] = { label: tag, description: 'x {accolade} "guillemets"', units: { [unite]: L } }; };
  const lignes = (f, flux = true) => Array.from({ length: annees }, (_, i) => { const an = 2016 + i, v = f(i), e = { end: an + '-12-31', val: v, accn: 'A' + an, fy: an, fp: 'FY', form: '10-K', filed: (an + 1) + '-02-15' }; if (flux) e.start = an + '-01-01'; return e; });
  const rev = i => rev0 * Math.pow(1 + g, i);
  add('Revenues', 'USD', lignes(rev)); add('NetIncomeLoss', 'USD', lignes(i => rev(i) * marge * 0.8)); add('OperatingIncomeLoss', 'USD', lignes(i => rev(i) * marge));
  add('NetCashProvidedByUsedInOperatingActivities', 'USD', lignes(i => rev(i) * marge * 0.9)); add('PaymentsToAcquirePropertyPlantAndEquipment', 'USD', lignes(i => rev(i) * 0.04)); add('DepreciationDepletionAndAmortization', 'USD', lignes(i => rev(i) * 0.03));
  add('GrossProfit', 'USD', lignes(i => rev(i) * 0.45)); add('Assets', 'USD', lignes(i => rev(i) * 1.2, false)); add('Liabilities', 'USD', lignes(i => rev(i) * 0.5, false)); add('StockholdersEquity', 'USD', lignes(i => rev(i) * 0.7, false));
  add('LongTermDebt', 'USD', lignes(i => rev(i) * 0.2, false)); add('CashAndCashEquivalentsAtCarryingValue', 'USD', lignes(i => rev(i) * 0.15, false)); add('AssetsCurrent', 'USD', lignes(i => rev(i) * 0.5, false)); add('LiabilitiesCurrent', 'USD', lignes(i => rev(i) * 0.25, false));
  add('RetainedEarningsAccumulatedDeficit', 'USD', lignes(i => rev(i) * 0.4, false)); add('WeightedAverageNumberOfDilutedSharesOutstanding', 'shares', lignes(() => actions));
  if (eps) add('EarningsPerShareDiluted', 'USD/shares', lignes(i => rev(i) * marge * 0.8 / actions));
  return JSON.stringify({ cik: 1, entityName: nom, facts: { dei: { EntityCommonStockSharesOutstanding: { label: 'x', description: 'y', units: { shares: [{ end: '2026-01-31', val: actions, accn: 'Z1', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-10' }] } } }, 'us-gaap': us } });
}
const mensuelDe = (prix0, prix1, depuis = Date.UTC(2015, 0, 1), jusqu = Date.UTC(2026, 6, 1)) => { const L = []; const N = Math.round((jusqu - depuis) / (30 * AN)); for (let i = 0; i <= N; i++) L.push([depuis + i * 30 * AN, prix0 + (prix1 - prix0) * i / N]); return L; };

console.log('— extraction EDGAR —');
{
  const T = faitsSynth(), F = extraireFaits(T);
  ok(bloc(T, 'Revenues').units.USD.length === 10 && bloc(T, 'Inexistante') === null, 'un bloc d’étiquette est découpé sans analyser le reste (même avec des accolades et des guillemets dans la description)');
  ok(F.annuel.length === 10 && F.nom === 'Société Test' && F.actions === 1e9, '10 exercices, nom et nombre d’actions de la page de garde');
  const L = F.annuel[9]; proche(L.rev, 10e9 * Math.pow(1.06, 9), 1, 'chiffre d’affaires'); ok(L.debt > 0 && L.cash > 0 && L.liab > 0 && Number.isFinite(L.eps) && L.sh === 1e9, 'dette, trésorerie, passifs, BPA et actions lus');
  /* doublons : la publication la plus récente gagne ; une valeur trimestrielle (période de 90 jours) est ignorée ; un 10-Q est ignoré */
  const T2 = JSON.parse(T); T2.facts['us-gaap'].Revenues.units.USD.push({ start: '2025-01-01', end: '2025-12-31', val: 1, accn: 'B', fy: 2025, fp: 'FY', form: '10-K/A', filed: '2099-01-01' }, { start: '2025-10-01', end: '2025-12-31', val: 2, accn: 'C', fy: 2025, fp: 'Q4', form: '10-K', filed: '2099-02-01' }, { start: '2025-01-01', end: '2025-12-31', val: 3, accn: 'D', fy: 2025, fp: 'FY', form: '10-Q', filed: '2099-03-01' });
  const F2 = extraireFaits(JSON.stringify(T2)); ok(F2.annuel.find(x => x.fin === '2025-12-31').rev === 1, 'le dernier dépôt 10-K / 10-K/A de l’exercice gagne ; périodes trimestrielles et 10-Q écartés');
  ok(Object.keys(ETIQUETTES).includes('rev') && ETIQUETTES.rev.includes('Revenues'), 'étiquettes de repli prévues');
  let err = null; try { extraireFaits('{"x":1}'); } catch (e) { err = e; } ok(err && /tronquée|vide/.test(err.message), 'réponse vide ou tronquée : erreur (le cron réessaiera)');
  const T3 = JSON.parse(T); T3.facts.dei.EntityCommonStockSharesOutstanding.units.shares = [{ end: '2026-01-31', val: 600e6, accn: 'Z', filed: '2026-02-10', form: '10-K' }, { end: '2026-01-31', val: 400e6, accn: 'Z', filed: '2026-02-10', form: '10-K' }, { end: '2025-01-31', val: 5, accn: 'Y', filed: '2025-02-10', form: '10-K' }];
  ok(extraireFaits(JSON.stringify(T3)).actions === 1e9, 'plusieurs catégories d’actions d’une même publication : additionnées');
  const Y = lireChartYahoo({ chart: { result: [{ meta: { regularMarketPrice: 50, currency: 'USD', longName: 'X' }, timestamp: [1e9, 1.1e9, 1.2e9], indicators: { quote: [{ close: [10, null, 12] }] }, events: { splits: { a: { date: 1.05e9, numerator: 4, denominator: 1 } } } }] } });
  ok(Y.prix === 50 && Y.mensuel.length === 2 && Y.splits[0].num === 4 && Y.mensuel[0][0] === 1e12, 'réponse Yahoo : prix, clôtures valides, splits');
}

console.log('— méthodes de valorisation —');
{
  const d = dcf(100, 0.05, 0, 0, 10); ok(d && d.pess < d.central && d.central < d.opt, 'DCF : pessimiste < central < optimiste (' + [d.pess, d.central, d.opt].map(x => x.toFixed(0)).join(' / ') + ')');
  ok(dcf(-5, 0.05, 0, 0, 10) === null && dcf(100, 0.05, 0, 0, 0) === null, 'DCF : flux négatif ou aucune action → indisponible');
  const d2 = dcf(100, 0.05, 500, 100, 10), d0 = dcf(100, 0.05, 0, 0, 10); proche(d0.central - d2.central, 40, 1e-9, 'DCF : la dette nette (400) réduit la valeur par action (÷ 10 actions)');
  proche(dcf(100, 0, 0, 0, 1).central, (() => { let f = 100, vp = 0; for (let t = 1; t <= 10; t++) { f *= 1 + 0 + (0.025 - 0) * (t - 1) / 9; vp += f / Math.pow(1.09, t); } return vp + f * 1.025 / (0.09 - 0.025) / Math.pow(1.09, 10); })(), 1e-6, 'DCF : calcul à la main (croissance 0 → terminale 2,5 %, actualisation 9 %)');
  const g = graham(5, 40, 6); proche(g.central, 5 * (8.5 + 12) * 4.4 / 5.5, 1e-9, 'Graham : BPA × (8,5 + 2g) × 4,4 / 5,5'); proche(g.nombre, Math.sqrt(22.5 * 5 * 40), 1e-9, 'nombre de Graham'); ok(g.pess <= g.central && g.opt >= g.central && graham(-1, 10, 5) === null, 'Graham : fourchette ; BPA négatif → indisponible');
  egal([mediane([3, 1, 2]), mediane([1, 2, 3, 4]), mediane([]), quantile([1, 2, 3, 4, 5], 0.25)], [2, 2.5, null, 2], 'médiane et quantile');
  const mens = [[Date.UTC(2020, 0, 1), 100], [Date.UTC(2020, 1, 1), 110], [Date.UTC(2020, 2, 1), 120]]; ok(prixA(mens, Date.UTC(2020, 1, 15)) === 110 && prixA(mens, Date.UTC(2019, 0, 1)) === null && prixA(mens, Date.UTC(2023, 0, 1)) === null, 'prix à une date : dernier point connu, rien avant ni bien après la série');
  proche(facteurSplit([{ t: 5, num: 4, den: 1 }, { t: 9, num: 2, den: 1 }], 4), 8, 1e-12, 'splits postérieurs à la date : produit des ratios'); ok(facteurSplit([{ t: 5, num: 4, den: 1 }], 6) === 1, 'split antérieur : ignoré');
}

console.log('— évaluation complète —');
{
  const F = extraireFaits(faitsSynth()), maintenant = Date.UTC(2026, 5, 1);
  const base = prix => evaluer(F.annuel, { tk: 'TST', nom: 'Test', secteur: 'Technologie', prix, devise: 'USD', actions: F.actions, actionsT: F.actionsT, mensuel: mensuelDe(8, prix), splits: [], maintenant });
  const bon = base(10), cher = base(80), juste = (() => { const v = bon.valeur.central; return base(v * 0.95); })();
  ok(bon.valeur && bon.methodes.length === 3 && bon.valeur.pess < bon.valeur.central && bon.valeur.central < bon.valeur.opt, 'trois méthodes et une fourchette croissante');
  ok(bon.badge === BADGES.PAS_CHERE && bon.mos > 0.2, 'prix très bas : PAS CHÈRE, marge ' + Math.round(bon.mos * 100) + ' %'); ok(cher.badge === BADGES.CHERE && cher.mos < -0.15, 'prix très haut : CHÈRE, marge ' + Math.round(cher.mos * 100) + ' %');
  ok(juste.badge === BADGES.JUSTE, 'prix proche de la valeur : PRIX JUSTE (' + Math.round(juste.mos * 100) + ' %)');
  proche(bon.mos, (bon.valeur.central - 10) / bon.valeur.central, 1e-9, 'marge de sécurité = (valeur − prix) / valeur');
  ok(bon.qualite && bon.qualite.note > 5 && bon.qualite.note <= 10 && bon.qualite.parts.length >= 5, 'note de qualité sur 10 (' + bon.qualite.note + ')'); ok(bon.piotroski.score >= 0 && bon.piotroski.score <= 9 && bon.piotroski.criteres.length === 9, 'Piotroski sur 9 critères (' + bon.piotroski.score + ')');
  ok(cher.altman.z > 3 && cher.altman.zone === 'sûre' && bon.altman.z > 1.8, 'Altman Z : entreprise saine (' + cher.altman.z.toFixed(1) + ')'); ok(bon.annees.length >= 8 && bon.histo.prix.length > 50 && bon.histo.valeur.length >= 5 && bon.hypotheses.length >= 4, 'historique prix / valeur, résultats annuels et hypothèses écrites');
  ok(Math.abs(bon.ratios.croissanceCA - 0.06) < 0.002 && Math.abs(bon.ratios.margeOp - 0.2) < 1e-9, 'ratios : croissance et marge');
  /* banque : pas de DCF ; sans historique de bénéfices : pas de multiples ; données absentes : jamais inventées */
  const banque = evaluer(F.annuel, { tk: 'B', nom: 'Banque', secteur: 'Finance', prix: 10, actions: F.actions, actionsT: F.actionsT, mensuel: mensuelDe(8, 10), splits: [], maintenant }); ok(!banque.methodes.some(m => m.id === 'dcf') && banque.avertissements.some(a => /DCF non applicable/.test(a)), 'banque / assurance : DCF écarté, et la fiche le dit');
  ok(evaluer(F.annuel.slice(0, 2), { tk: 'X', prix: 10, actions: 1e9, mensuel: [], splits: [], maintenant }).badge === BADGES.ND && evaluer(F.annuel, { tk: 'X', prix: null, maintenant }).badge === BADGES.ND, 'moins de 3 exercices ou pas de prix : N/D');
  const sansEps = evaluer(extraireFaits(faitsSynth({ eps: false })).annuel, { tk: 'S', nom: 'S', secteur: 'Industrie', prix: 10, actions: 1e9, actionsT: F.actionsT, mensuel: mensuelDe(8, 10), splits: [], maintenant }); ok(sansEps.methodes.some(m => m.id === 'dcf') && !sansEps.methodes.some(m => m.id === 'graham'), 'BPA absent : Graham désactivé, DCF conservé');
  /* un split 4 pour 1 après la publication : le BPA et les actions sont ramenés à l'échelle d'aujourd'hui, la valeur par action est cohérente avec le prix de Yahoo (déjà ajusté) */
  const sp = evaluer(F.annuel, { tk: 'SP', nom: 'Split', secteur: 'Technologie', prix: 2.5, actions: F.actions * 4, actionsT: Date.UTC(2026, 3, 1), mensuel: mensuelDe(2, 2.5), splits: [{ t: Date.UTC(2026, 2, 1), num: 4, den: 1 }], maintenant }); proche(sp.valeur.central, bon.valeur.central / 4, bon.valeur.central * 0.15, 'après un split 4:1 la valeur par action est divisée par 4 (± arrondis des multiples)');
  /* nombre d'actions incohérent (échelle en millions) : corrigé */
  const mil = JSON.parse(faitsSynth()); for (const x of mil.facts['us-gaap'].WeightedAverageNumberOfDilutedSharesOutstanding.units.shares) x.val = 1000; const echelle = evaluer(extraireFaits(JSON.stringify(mil)).annuel, { tk: 'M', nom: 'M', secteur: 'Technologie', prix: 10, actions: 1e9, actionsT: F.actionsT, mensuel: mensuelDe(8, 10), splits: [], maintenant }); ok(echelle.valeur && echelle.valeur.central > 0, 'actions publiées en milliers / millions : remises à l’échelle');
  const L1 = ligneIndex(bon); ok(L1.tk === 'TST' && L1.badge === BADGES.PAS_CHERE && Number.isFinite(L1.mos) && L1.q === bon.qualite.note && L1.mc > 0 && !('methodes' in L1), 'ligne d’index compacte');
  const ph = explication(cher); ok(/chère/.test(ph) && /fourchette/.test(ph) && /pas un conseil/.test(ph) && /pas chère sous/.test(ph) && !/NaN|undefined/.test(ph), 'explication de Rayle (cher) : ' + ph.slice(0, 150)); ok(/pas chère/.test(explication(bon)) && /Elle redeviendrait un prix juste/.test(explication(bon)), 'explication (pas chère) : ce qui ferait changer le verdict'); ok(/Je ne peux pas évaluer/.test(explication({ nom: 'X', valeur: null, avertissements: ['prix indisponible'] })), 'explication sans valeur');
  const pk = piotroski({ ni: 10, ocf: 12, assets: 100, debt: 20, ca: 50, cl: 25, sh: 10, rev: 100, gp: 50 }, { ni: 5, ocf: 6, assets: 100, debt: 30, ca: 40, cl: 25, sh: 10, rev: 90, gp: 40 }); ok(pk.score === 9, 'Piotroski : entreprise qui s’améliore sur les 9 critères'); ok(piotroski(null, null).score === null, 'Piotroski sans données : indéterminé');
  const az = altman({ assets: 100, liab: 50, ca: 40, cl: 20, re: 30, ebit: 15, rev: 90 }, 120); proche(az.z, 1.2 * 0.2 + 1.4 * 0.3 + 3.3 * 0.15 + 0.6 * 120 / 50 + 0.9, 1e-9, 'Altman Z'); ok(altman({}, 1).z === null, 'Altman sans données : indéterminé');
}

console.log('— calcul d’une entreprise et lot du cron —');
{
  const T = faitsSynth(), maintenant = Date.UTC(2026, 5, 1), appels = [];
  const chart = { chart: { result: [{ meta: { regularMarketPrice: 40, currency: 'USD', longName: 'Test Inc' }, timestamp: mensuelDe(8, 40).map(p => p[0] / 1000), indicators: { quote: [{ close: mensuelDe(8, 40).map(p => p[1]) }] }, events: {} }] } };
  const fetchSim = async (url, opts = {}) => { appels.push({ url, ua: opts.headers && opts.headers['User-Agent'] }); if (/data\.sec\.gov/.test(url)) return { ok: true, status: 200, text: async () => T }; if (/yahoo/.test(url)) return { ok: true, status: 200, json: async () => chart }; if (/telegram/.test(url)) return { ok: true, status: 200, json: async () => ({}) }; return { ok: false, status: 404 }; };
  const U = univers(), us = U.find(e => e.tk === 'AAPL'), fr = U.find(e => e.tk === 'MC.PA');
  const r = await calculerEntreprise(us, { fetchFn: fetchSim, ua: 'UA-test contact', maintenant }); ok(r.fiche.tk === 'AAPL' && r.fiche.valeur && r.ligne.tk === 'AAPL', 'S&P 500 : fiche complète'); ok(appels.some(a => /CIK0000320193/.test(a.url) && a.ua === 'UA-test contact') && appels.some(a => /chart\/AAPL/.test(a.url)), 'EDGAR avec le User-Agent fourni ; Yahoo avec le symbole');
  const rf = await calculerEntreprise(fr, { fetchFn: fetchSim, maintenant }); ok(rf.fiche.badge === 'N/D' && /Fondamentaux indisponibles/.test(rf.fiche.avertissements[0]) && rf.fiche.histo.prix.length > 20 && rf.fiche.pays === 'FR', 'CAC 40 : prix seulement, « fondamentaux indisponibles »');
  ok(appels.some(a => /chart\/MC\.PA/.test(a.url)), 'symbole Yahoo du CAC 40 (.PA)'); const bk = U.find(e => e.tk === 'BRK.B'); appels.length = 0; await calculerEntreprise(bk, { fetchFn: fetchSim, maintenant }).catch(() => {}); ok(appels.some(a => /chart\/BRK-B/.test(a.url)), 'BRK.B → BRK-B chez Yahoo');
  /* dépôt simulé */
  const kv = new Map(), depot = { kvLire: async k => (kv.has(k) ? JSON.parse(kv.get(k)) : null), kvEcrire: async (k, v) => { kv.set(k, JSON.stringify(v)); } };
  const env = { LT_LOT: '3', SEC_USER_AGENT: 'Nom contact@exemple', TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '1' }; appels.length = 0;
  const l1 = await lotLongTerme(env, depot, { fetchFn: fetchSim, maintenant }); ok(l1.calculees.length === 3 && l1.echecs.length === 0, 'un lot : 3 entreprises recalculées'); ok(appels.filter(a => /sec\.gov/.test(a.url)).length <= 3 && appels.length <= 50, 'moins de 50 sous-requêtes par passage (plan gratuit) : ' + appels.length);
  ok(appels.filter(a => /sec\.gov/.test(a.url)).every(a => a.ua === 'Nom contact@exemple'), 'User-Agent de la SEC lu depuis le secret du Worker'); const idx = await depot.kvLire(KV.index); ok(idx.lignes.length === 3 && (await depot.kvLire(KV.fiche(l1.calculees[0]))).tk === l1.calculees[0], 'index et fiches enregistrés');
  const l2 = await lotLongTerme(env, depot, { fetchFn: fetchSim, maintenant: maintenant + 3600e3 }); ok(l2.calculees.every(tk => !l1.calculees.includes(tk)), 'le lot suivant prend d’AUTRES entreprises (les moins récemment calculées d’abord)');
  const l3 = await lotLongTerme(env, depot, { fetchFn: fetchSim, maintenant: maintenant + 7200e3, liste: ['ZTS'], lot: 2 }); ok(l3.calculees[0] === 'ZTS', 'les entreprises de la liste de suivi passent en premier');
  /* alertes : un changement de verdict d'une entreprise déjà connue */
  const avant = { tk: 'AAA', nom: 'Alpha', badge: 'PRIX JUSTE', q: 8, mos: 0.1 }, apres = { tk: 'AAA', nom: 'Alpha', badge: 'PAS CHÈRE', q: 8.2, mos: 0.3, prix: 10, v: 14 };
  ok(evenementsDe(avant, apres, []).length === 1 && evenementsDe(avant, apres, [])[0].type === 'pas-chere', 'passe PAS CHÈRE avec une bonne qualité : alerte'); ok(evenementsDe(avant, { ...apres, q: 5 }, []).length === 0, 'PAS CHÈRE mais qualité faible : pas d’alerte');
  ok(evenementsDe(avant, { ...apres, badge: 'CHÈRE', q: 5 }, ['AAA'])[0].type === 'liste' && evenementsDe(avant, { ...apres, badge: 'CHÈRE', q: 5 }, []).length === 0, 'action de la liste qui change de verdict : alerte ; hors liste : rien'); ok(evenementsDe(null, apres, ['AAA']).length === 0 && evenementsDe(apres, apres, ['AAA']).length === 0, 'premier calcul ou verdict inchangé : jamais d’alerte');
  const kv2 = new Map(), depot2 = { kvLire: async k => (kv2.has(k) ? JSON.parse(kv2.get(k)) : null), kvEcrire: async (k, v) => { kv2.set(k, JSON.stringify(v)); } }, ancien = { version: 1, t: 1, lignes: U.map(e => ({ tk: e.tk, nom: e.nom, secteur: e.secteur, pays: e.pays, badge: 'CHÈRE', q: 9, mos: -0.5, t: maintenant - (e.cik ? 30 * 3600e3 : 3600e3) })) }; kv2.set(KV.index, JSON.stringify(ancien)); appels.length = 0;
  const chartBas = JSON.parse(JSON.stringify(chart)); chartBas.chart.result[0].meta.regularMarketPrice = 10; const fetchBas = async (url, o) => (/yahoo/.test(url) ? { ok: true, status: 200, json: async () => chartBas } : fetchSim(url, o));
  const l4 = await lotLongTerme(env, depot2, { fetchFn: fetchBas, maintenant, lot: 2 }); const ev = await depot2.kvLire(KV.evenements); ok(l4.evenements >= 1 && ev && ev.some(e => e.type === 'pas-chere') && appels.some(a => /telegram/.test(a.url)), 'verdict qui change : événement enregistré (lu par Rayle) et message Telegram envoyé'); ok(appels.filter(a => /telegram/.test(a.url)).every(a => a.url.includes('bottok')), 'Telegram avec le secret du Worker');
  const fetchKo = async url => (/data\.sec\.gov/.test(url) ? { ok: false, status: 503 } : fetchSim(url)); const kv3 = new Map(), depot3 = { kvLire: async k => (kv3.has(k) ? JSON.parse(kv3.get(k)) : null), kvEcrire: async (k, v) => { kv3.set(k, JSON.stringify(v)); } };
  const l5 = await lotLongTerme({ LT_LOT: '2' }, depot3, { fetchFn: fetchKo, maintenant }); ok(l5.echecs.length === 2 && l5.calculees.length === 0, 'EDGAR indisponible : échecs notés, aucune erreur, ré-essai plus tard'); const idx3 = await depot3.kvLire(KV.index); ok(idx3.lignes.every(l => /impossible/.test(l.av)) && idx3.lignes.every(l => maintenant - l.t < 20 * 3600e3 && maintenant - l.t > 18 * 3600e3), 'ré-essai programmé dans environ 1 heure');
}

console.log('— routes /lt/… du Worker —');
{
  const kv = new Map([[KV.index, JSON.stringify({ version: 1, t: 5, lignes: [{ tk: 'A' }] })], [KV.fiche('A'), JSON.stringify({ tk: 'A', nom: 'Alpha' })]]), depot = { kvLire: async k => (kv.has(k) ? JSON.parse(kv.get(k)) : null), kvEcrire: async (k, v) => { kv.set(k, JSON.stringify(v)); } };
  const rq = (chemin, o = {}) => new Request('https://w.test' + chemin, o), cors = { 'Access-Control-Allow-Origin': 'https://x' }, autoriser = async req => (req.headers.get('X-Portefeuille-Code') === 'bon-code-123' ? { ok: true } : { ok: false, code: 401, raison: 'code refusé' });
  ok((await traiterLT(rq('/autre'), {}, depot, { cors })) === null, 'route étrangère : ignorée (null)');
  ok((await (await traiterLT(rq('/lt/index'), {}, depot, { cors })).json()).lignes[0].tk === 'A', 'GET /lt/index public'); ok((await (await traiterLT(rq('/lt/fiche/a'), {}, depot, { cors })).json()).nom === 'Alpha', 'GET /lt/fiche/<symbole> (casse ignorée)');
  ok((await traiterLT(rq('/lt/fiche/ZZZ'), {}, depot, { cors })).status === 404 && (await traiterLT(rq('/lt/fiche/' + encodeURIComponent('<x>')), {}, depot, { cors })).status === 400, 'fiche absente : 404 ; symbole invalide : 400');
  ok((await traiterLT(rq('/lt/liste'), {}, depot, { cors, autoriser })).status === 401, 'la liste de suivi exige le code d’accès');
  const put = await traiterLT(rq('/lt/liste', { method: 'PUT', headers: { 'X-Portefeuille-Code': 'bon-code-123' }, body: JSON.stringify({ liste: ['aapl', 'MSFT', 'aapl', '<script>', 'x'.repeat(40)] }) }), {}, depot, { cors, autoriser }); egal((await put.json()).liste, ['AAPL', 'MSFT'], 'liste nettoyée : majuscules, doublons et symboles invalides écartés');
  egal((await (await traiterLT(rq('/lt/liste', { headers: { 'X-Portefeuille-Code': 'bon-code-123' } }), {}, depot, { cors, autoriser })).json()).liste, ['AAPL', 'MSFT'], 'GET /lt/liste'); ok((await (await traiterLT(rq('/lt/evenements'), {}, depot, { cors })).json()).evenements.length === 0, 'GET /lt/evenements');
}

console.log('— tableau, univers, autres actifs —');
{
  const L = [{ tk: 'AAA', nom: 'Alpha Énergie', secteur: 'Énergie', pays: 'US', mos: 0.3, q: 8, badge: 'PAS CHÈRE', mc: 1000 }, { tk: 'BBB', nom: 'Beta', secteur: 'Technologie', pays: 'US', mos: -0.4, q: 9, badge: 'CHÈRE', mc: 900 }, { tk: 'CCC', nom: 'Gamma', secteur: 'Énergie', pays: 'FR', mos: null, q: null, badge: 'N/D', mc: 5 }, { tk: 'DDD', nom: 'Delta', secteur: 'Énergie', pays: 'US', mos: 0.05, q: 6, badge: 'PRIX JUSTE', mc: 1100 }];
  egal(filtrerLignes(L, { secteur: 'Énergie' }).map(l => l.tk), ['AAA', 'CCC', 'DDD'], 'filtre par secteur'); egal(filtrerLignes(L, { pays: 'FR' }).map(l => l.tk), ['CCC'], 'filtre par pays'); egal(filtrerLignes(L, { badge: 'PAS CHÈRE', qMin: 7 }).map(l => l.tk), ['AAA'], 'filtre « pas chère de bonne qualité »');
  egal(filtrerLignes(L, { texte: 'energie' }).map(l => l.tk), ['AAA'], 'recherche sans accents'); egal(filtrerLignes(L, { texte: 'ddd' }).map(l => l.tk), ['DDD'], 'recherche par symbole');
  egal(trierLignes(L, 'mos', -1).map(l => l.tk), ['AAA', 'DDD', 'BBB', 'CCC'], 'tri par marge décroissante : les valeurs absentes en bas'); egal(trierLignes(L, 'mos', 1).map(l => l.tk), ['BBB', 'DDD', 'AAA', 'CCC'], 'tri croissant : absentes toujours en bas'); egal(trierLignes(L, 'nom', 1).map(l => l.tk), ['AAA', 'BBB', 'DDD', 'CCC'].sort((a, b) => 0) && ['AAA', 'BBB', 'DDD', 'CCC'], 'tri par nom'); egal(trierLignes(L, 'badge', 1).map(l => l.badge), ['PAS CHÈRE', 'PRIX JUSTE', 'CHÈRE', 'N/D'], 'tri par verdict');
  egal(comptes(L), { 'PAS CHÈRE': 1, 'CHÈRE': 1, 'N/D': 1, 'PRIX JUSTE': 1 }, 'comptes par verdict'); egal(pairesDe(L, L[0]).map(l => l.tk), ['DDD'], 'concurrents : même secteur et même pays'); egal(secteursDe(L), ['Énergie', 'Technologie'], 'secteurs');
  ok(SP500.length >= 500 && CAC40.length === 40 && univers().length === SP500.length + 40, 'univers : ' + SP500.length + ' sociétés du S&P 500 et 40 du CAC 40'); ok(SP500.every(x => x[3] > 0) && new Set(SP500.map(x => x[0])).size === SP500.length && SP500.some(x => x[0] === 'AAPL'), 'chaque société du S&P 500 a un symbole unique et un numéro CIK'); ok(CAC40.every(x => /\.PA$/.test(x[0])), 'symboles du CAC 40 en .PA');
  /* actifs */
  const jours = (N, f) => Array.from({ length: N }, (_, i) => ({ d: '', t: Date.UTC(2016, 0, 4) + i * AN, c: f(i) })), S = jours(3000, i => 100 * Math.pow(1.0004, i) * (1 + 0.1 * Math.sin(i / 90)));
  const W = enSemaines(S); ok(W.length > 400 && W.length < 460 && W.every((x, i) => i === 0 || x.t > W[i - 1].t), 'regroupement en semaines'); ok(centile([1, 2, 3, 4], 3) === 0.75, 'centile');
  const A = analyserActifLT(ACTIFS_LT.find(a => a.id === 'btc'), S); ok(A.ma200s > 0 && Number.isFinite(A.distance200s) && Number.isFinite(A.mayer) && ['PAS CHER', 'PRIX JUSTE', 'CHER'].includes(A.badge) && A.reperes.length === 3 && A.histo.semaines.length > 100, 'actif : MA200 semaines, Mayer, badge et repères (' + A.badge + ')');
  const bas = jours(3000, i => (i < 2900 ? 100 + i * 0.5 : 1550 - (i - 2900) * 6)), hautA = jours(3000, i => 100 + i * 0.1 + (i > 2900 ? (i - 2900) * 8 : 0)); ok(analyserActifLT(ACTIFS_LT[3], bas).badge === 'PAS CHER' && analyserActifLT(ACTIFS_LT[3], hautA).badge === 'CHER', 'prix très bas face à son passé : PAS CHER ; très haut : CHER'); ok(analyserActifLT(ACTIFS_LT[0], jours(100, () => 5)).badge === 'N/D', 'historique trop court : N/D'); ok(/long terme/.test(phraseActifLT(A)) && /pas une prévision/.test(phraseActifLT(A)) && /Je ne peux pas/.test(phraseActifLT({ nom: 'X', badge: 'N/D', avertissements: ['historique trop court'] })), 'phrase de Rayle');
}
console.log(`invest-test : ${n} vérifications, tout passe`);
