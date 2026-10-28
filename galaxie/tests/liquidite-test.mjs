import { construireCarte, detecterMurs, fiabiliteMur, tauxLeurres, echelleIntensite, prixDeLigne, ligneDePrix } from '../../strategies/liquidite/carte-chaleur.js';
import { desequilibreCarnet, pressionCarnet, serieDesequilibre, deltaBougies, cumulDelta, divergencePrixCvd, absorptionBarres, vwapAncre, profilsParPeriode, profilPrecedent } from '../../strategies/liquidite/flux-indicateurs.js';
import { balayagesLiquidite, piscinesAutour, amasLiquidationEstimes, cascadesLiquidations, cascadeFinie } from '../../strategies/liquidite/pieges-stops.js';
import { carteAimants, fmtPrix } from '../../strategies/liquidite/aimants.js';
import { trancheDe, AgregateurBarres } from '../../strategies/liquidite/barres-flux.js';
import { retraitALApproche as moteurRetrait } from '../../strategies/liquidite/carte-chaleur.js';
import * as moteur from '../../strategies/liquidite/index.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { serieSynth, marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import { tranche } from '../../planetes/mars/pc/agent-btc/colonnes.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, tol) => Math.abs(a - b) <= tol;
v('index : le moteur exporte les briques principales', ['Livre', 'construireCarte', 'detecterMurs', 'carteAimants', 'balayagesLiquidite', 'profilVolume', 'absorptionBarres'].every(k => typeof moteur[k] === 'function'));

/* ── jeu de données synthétique : 120 s, milieu 100, 150 tranches de 0,02 % par côté ── */
const N = 150, PAS = 0.02;
function enregs({ secondes = 120, mur = null, bruit = 5000 } = {}) {
  const e = []; let graine = 7; const alea = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  for (let s = 0; s < secondes; s++) {
    const bid = new Float32Array(N), ask = new Float32Array(N);
    for (let j = 0; j < N; j++) { bid[j] = bruit * (0.5 + alea()); ask[j] = bruit * (0.5 + alea()); }
    if (mur && s >= mur.de && s < mur.a) { const arr = mur.cote === 'bid' ? bid : ask; for (let j = mur.tranche - 1; j <= mur.tranche + 1; j++) arr[j] = mur.usd; }
    e.push({ tSec: 1000 + s, meilleurBid: 99.99, meilleurAsk: 100.01, couvBasPct: 3, couvHautPct: 3, bid, ask });
  }
  return { entete: { nTranches: N, pasPct: PAS, unite: 100 }, enregistrements: e };
}
{
  const carte = construireCarte(enregs({ mur: { de: 10, a: 120, cote: 'bid', tranche: 20, usd: 2e6 } }));
  v('carte : dimensions et prix des lignes', carte.nT === 120 && carte.nPrix === 300 && proche(prixDeLigne(carte, ligneDePrix(carte, 99.6)), 99.6, carte.pas), JSON.stringify([carte.nT, carte.nPrix, carte.pas]));
  const murs = detecterMurs(carte, { plancherUsd: 50000 });
  v('murs : un mur acheteur détecté vers 99,59 (−0,41 %), tenu ≈ 100 s, ≥ 100× la médiane', murs.length === 1 && murs[0].cote === 'bid' && proche(murs[0].prix, 99.59, 0.03) && murs[0].dureeS >= 95 && murs[0].ratioMediane > 100 && murs[0].actif, JSON.stringify(murs.map(m => [m.prix.toFixed(3), m.cote, m.dureeS, Math.round(m.ratioMediane)])));
  v('murs : distance au prix en %', proche(murs[0].distancePct, 0.41, 0.05));
  const sans = detecterMurs(construireCarte(enregs()), { plancherUsd: 50000 }); v('murs : un carnet uniforme n’a aucun mur', sans.length === 0, String(sans.length));
  const court = detecterMurs(construireCarte(enregs({ mur: { de: 10, a: 22, cote: 'ask', tranche: 30, usd: 2e6 } })), { plancherUsd: 50000, dureeMinS: 20 }); v('murs : une ligne qui reste moins de 20 s n’est pas un mur', court.length === 0);
  const parti = detecterMurs(construireCarte(enregs({ mur: { de: 10, a: 70, cote: 'ask', tranche: 30, usd: 2e6 } })), { plancherUsd: 50000 }); v('murs : un mur retiré est marqué inactif', parti.length === 1 && parti[0].actif === false && parti[0].cote === 'ask');
  const ech = echelleIntensite(carte); v('échelle : intensité entre 0 et 1', ech.intensite(0) === 0 && ech.intensite(1e12) === 1 && ech.reference > 0);
  // couverture : tranches non observées exclues par défaut
  const d = enregs({ mur: { de: 0, a: 120, cote: 'ask', tranche: 100, usd: 2e6 } }); for (const r of d.enregistrements) r.couvHautPct = 0.5;
  v('murs : une tranche hors couverture (non observée) n’est jamais prise pour un mur', detecterMurs(construireCarte(d), { plancherUsd: 50000 }).filter(m => m.cote === 'ask').length === 0 && detecterMurs(construireCarte(d), { plancherUsd: 50000, couvertureSeule: false }).filter(m => m.cote === 'ask').length === 1);
  // fiabilité
  const mur = { cote: 'ask', prix: 100.6, dureeS: 40 }; v('retrait collé au meilleur prix (teneurs de marché) : pas un leurre', moteurRetrait({ t: 5, prix: 100.6 }, t => (t < 0 ? 100.3 : 100.595)) === false); v('retrait quand le prix s’éloigne : pas un leurre', moteurRetrait({ t: 5, prix: 100.6 }, t => (t < 0 ? 100.59 : 100.2)) === false); const ev = (type, t, p = 100.6) => ({ type, t, cote: 'ask', prix: p });
  const f1 = fiabiliteMur(mur, [ev('retrait', 1), ev('retrait', 2), ev('retrait', 3)], { midA: t => (t < 0 ? 100.3 : 100.55) }); v('fiabilité : retraits à l’approche du prix (le prix se rapproche, sans être collé) → leurre probable', f1.niveau === 'leurre probable' && f1.retraitsApproche === 3, JSON.stringify(f1));
  const f2 = fiabiliteMur({ ...mur, dureeS: 1200 }, [ev('execution', 1), ev('execution', 2)], { midA: () => 100.0 }); v('fiabilité : mur attaqué (exécutions) et tenu → fiable', f2.niveau === 'fiable' && f2.executions === 2, JSON.stringify(f2));
  v('fiabilité : sans historique → incertain', fiabiliteMur({ ...mur, dureeS: 300 }, []).niveau === 'incertain');
  const tl = tauxLeurres([ev('retrait', 1), ev('execution', 2)], { midA: t => (t < 0 ? 100.3 : 100.5) }); v('taux de leurres : 1 retrait à l’approche, 1 exécution → 50 %', tl.taux === 0.5);
}

/* ── déséquilibre, pression ── */
{
  const rec = { tSec: 1, bid: Float32Array.from({ length: N }, () => 300), ask: Float32Array.from({ length: N }, () => 100) };
  const d = desequilibreCarnet(rec); v('déséquilibre : 3 fois plus de bids → +0,5 à tous les niveaux', proche(d.d0_5 ?? d['d0.5'], 0.5, 1e-9) && proche(d['d0.1'], 0.5, 1e-9) && proche(d.d1, 0.5, 1e-9));
  const serie = serieDesequilibre(Array.from({ length: 70 }, (_, i) => ({ tSec: i, bid: rec.bid, ask: rec.ask }))), p = pressionCarnet(serie);
  v('pression : acheteuse et persistante', p.sens === 'acheteuse' && p.persistante && proche(p.pression, 0.5, 1e-9));
  v('pression : trop peu de données → null', pressionCarnet(serie.slice(0, 3)).pression === null);
}
/* ── delta, CVD, divergence, absorption, VWAP : et causalité (ajouter l'avenir ne change rien avant) ── */
const m15 = marcheMixte(6000, 11), ctx = construireContexte(m15);
{
  const delta = deltaBougies(m15), cvd = cumulDelta(delta);
  v('delta : (2·vb − v) × clôture', proche(delta[10], (2 * m15.vb[10] - m15.v[10]) * m15.c[10], 1e-6) && Math.abs(cvd[100] - Array.from(delta.subarray(0, 101)).reduce((a, b) => a + b, 0)) < 1e-3);
  const px = new Float64Array(200), cv = new Float64Array(200); for (let i = 0; i < 200; i++) { px[i] = i < 150 ? 100 + i * 0.1 : 115 - (i - 150) * 0.05 + (i === 199 ? 8 : 0); cv[i] = i < 100 ? i * 10 : 1000 - (i - 100) * 4; }
  const dv = divergencePrixCvd(px, cv, { fenetre: 48 }); v('divergence baissière : nouveau haut de prix sans nouveau haut de CVD', dv[120] === -1 || dv[110] === -1 || dv[140] === -1, Array.from(dv.subarray(100, 150)).join(''));
  const dvH = divergencePrixCvd(Float64Array.from({ length: 120 }, (_, i) => (i < 100 ? 100 - i * 0.1 : 90 - (i - 100) * 0.1)), Float64Array.from({ length: 120 }, (_, i) => (i < 100 ? -i * 5 : -500 + (i - 100) * 2)), { fenetre: 48 }); v('divergence haussière : nouveau bas de prix, CVD remonte', Array.from(dvH).includes(1));
  const v1 = vwapAncre(m15), n2 = 5000, m2 = tranche(m15, 0, n2), v2 = vwapAncre(m2);
  let egal = true; for (let i = 0; i < n2; i++) if (!(v1.vwap[i] === v2.vwap[i] || (Number.isNaN(v1.vwap[i]) && Number.isNaN(v2.vwap[i]))) || v1.haut2[i] !== v2.haut2[i] && !Number.isNaN(v1.haut2[i])) { egal = false; break; }
  v('VWAP ancré : causal (les 1000 barres ajoutées ne changent rien avant)', egal);
  const j0 = Math.floor(m15.t[5] / 86400e3); let iJ = 0; while (Math.floor(m15.t[iJ] / 86400e3) === j0) iJ++; v('VWAP ancré : repart à zéro chaque jour (première barre du jour 2 = son prix typique)', proche(v1.vwap[iJ], (m15.h[iJ] + m15.l[iJ] + m15.c[iJ]) / 3, 1e-6) && v1.bas1[iJ] <= v1.vwap[iJ] && v1.haut1[iJ] >= v1.vwap[iJ]);
}
{
  // absorption : 30 barres normales puis une barre à delta très négatif SANS baisse (clôture ≥ ouverture)
  const barres = []; for (let i = 0; i < 40; i++) barres.push({ t: i * 900000, achatUsd: 1000 + (i % 2 ? 50 : 0), venteUsd: 1000 + (i % 2 ? 0 : 50), ouv: 100, cloture: 100, haut: 100.2, bas: 99.8, fp: [] });
  barres.push({ t: 40 * 900000, achatUsd: 1000, venteUsd: 9000, ouv: 100, cloture: 100.05, haut: 100.2, bas: 99.5, fp: [[trancheDe(99.6), 100, 7000], [trancheDe(100), 900, 2000]] });
  barres.push({ t: 41 * 900000, achatUsd: 9000, venteUsd: 1000, ouv: 100, cloture: 100.5, haut: 100.6, bas: 100, fp: [] });             // delta fort mais le prix a PROGRESSÉ : pas d'absorption
  const a = absorptionBarres(barres, new Float64Array(42).fill(0.5), {});
  v('absorption : ventes massives sans baisse → absorption haussière (+1), niveau là où les ventes étaient les plus grosses', a[40] && a[40].sens === 1 && proche(a[40].niveau, 99.6, 0.05) && a[40].force > 2, JSON.stringify(a[40]));
  v('absorption : delta fort mais prix qui avance → pas d’absorption', a[41] === null && a.slice(0, 40).every(x => x === null));
  const b2 = barres.slice(0, 41), a2 = absorptionBarres(b2, new Float64Array(41).fill(0.5), {}); v('absorption : causale', JSON.stringify(a2[40]) === JSON.stringify(a[40]));
}
/* ── profils par période ── */
{
  const barres = []; for (let d = 0; d < 3; d++) for (let h = 0; h < 96; h++) barres.push({ t: (d * 96 + h) * 900000 + 86400e3 * 20000, achatUsd: 100, venteUsd: 100, fp: [[trancheDe(100 + d), 50, 50]] });
  const pr = profilsParPeriode(barres, 'jour'); v('profils : un profil par jour', pr.size === 3 && [...pr.values()].every(p => p.barres === 96));
  const t2 = barres[2 * 96 + 10].t, prec = profilPrecedent(pr, t2, 'jour'); v('profil précédent : le jour d’avant, jamais le jour en cours', prec && proche(prec.profil.poc, 101, 0.05), prec && String(prec.profil.poc));
}
/* ── piscines de liquidité et balayage ── */
{
  // deux hauts égaux à 101 (pivots confirmés), puis une mèche à 101,6 qui referme à 100,4 : balayage baissier
  const bougies = []; let c = 100;
  for (let i = 0; i < 80; i++) { const o = c; let h, l, cl; const ph = [20, 40].includes(i), pm = i === 60; cl = o + (i % 2 ? 0.05 : -0.05); h = Math.max(o, cl) + 0.1; l = Math.min(o, cl) - 0.1; if (ph) h = 101; if (i === 28) l = 99; if (pm) { h = 101.6; cl = 100.4; } bougies.push({ t: Date.UTC(2026, 0, 5) + i * 900000, o, h, l, c: cl, v: 100, vb: 50 }); c = cl; }
  const col = (k) => Float64Array.from(bougies, b => b[k]); const s = { n: bougies.length, t: col('t'), o: col('o'), h: col('h'), l: col('l'), c: col('c'), v: col('v'), vb: col('vb') };
  const r = balayagesLiquidite(s, new Float64Array(s.n).fill(0.3), { kConf: 2, avecJourSemaine: false });
  v('balayage : mèche au-dessus des hauts égaux (2 touches) puis clôture dessous → vente (−1) sur le niveau 101', r.sens[60] === -1 && proche(r.niveau[60], 101, 0.01) && r.touches[60] >= 2 && r.type[60] === 'egaux', JSON.stringify([r.sens[60], r.niveau[60], r.touches[60]]));
  v('balayage : aucun signal avant la mèche', Array.from(r.sens.subarray(0, 60)).every(x => x === 0));
  const court = { ...s, n: 59, t: s.t.subarray(0, 59), o: s.o.subarray(0, 59), h: s.h.subarray(0, 59), l: s.l.subarray(0, 59), c: s.c.subarray(0, 59), v: s.v.subarray(0, 59), vb: s.vb.subarray(0, 59) };
  const r2 = balayagesLiquidite(court, new Float64Array(59).fill(0.3), { kConf: 2, avecJourSemaine: false }); v('balayage : causal (série raccourcie → mêmes signaux avant)', Array.from(r2.sens).every((x, i) => x === r.sens[i]));
  const ctxR = construireContexte(m15), rr = balayagesLiquidite(m15, ctxR.atr15, {}), rr2 = balayagesLiquidite(tranche(m15, 0, 4000), ctxR.atr15.subarray(0, 4000), {});
  v('balayage : causal sur 4 000 barres réelles-synthétiques', Array.from(rr2.sens).every((x, i) => x === rr.sens[i]) && Array.from(rr.sens).some(x => x !== 0));
  const pa = piscinesAutour({ hauts: [{ prix: 101, type: 'egaux', touches: 2 }, { prix: 110, type: 'egaux', touches: 2 }], bas: [{ prix: 99, type: 'jour_prec', touches: 1 }] }, 100, { ronds: [0.5], pct: 3, hautRange: 102.5 });
  v('piscines autour : stops, ronds, range, rayon de 3 %', pa.hauts.some(x => x.prix === 101 && x.type === 'egaux') && !pa.hauts.some(x => x.prix === 110) && pa.hauts.some(x => x.type === 'rond') && pa.hauts.some(x => x.type === 'range') && pa.bas.some(x => x.prix === 99));
}
/* ── liquidations estimées et cascades ── */
{
  const serie = []; for (let i = 0; i < 10; i++) serie.push({ t: i * 300000, haut: 100.1, bas: 99.9, cloture: 100, oiUsd: 1e9 + i * 1e8, partLong: 0.5 });
  const r = amasLiquidationEstimes(serie); const longs = r.amas.filter(a => a.cote === 'long'), courts = r.amas.filter(a => a.cote === 'short');
  v('liquidations : ESTIMÉES, étiquetées comme telles', r.estime === true && r.amas.every(a => a.estime) && /ESTIMATION/.test(r.avertissement));
  v('liquidations : longs à levier 10 ≈ 90,5 ; courts à levier 10 ≈ 109,5', longs.some(a => proche(a.prix, 90.5, 0.01)) && courts.some(a => proche(a.prix, 109.5, 0.01)), JSON.stringify(longs.map(a => a.prix.toFixed(2))));
  v('liquidations : le montant total ≈ l’intérêt ouvert ajouté (9 × 100 M$ répartis)', proche(r.amas.reduce((a, x) => a + x.usd, 0), 9e8, 1e6));
  const serie2 = serie.concat([{ t: 10 * 300000, haut: 100, bas: 91.0, cloture: 91.2, oiUsd: 1.9e9 }]), r2 = amasLiquidationEstimes(serie2);
  v('liquidations : un mouvement qui traverse les amas de longs (levier ≥ 10) les fait disparaître', !r2.amas.some(a => a.cote === 'long' && a.prix > 91) && r2.amas.some(a => a.cote === 'short'));
  const serie3 = serie.concat([{ t: 10 * 300000, haut: 100.1, bas: 99.9, cloture: 100, oiUsd: 0.95e9 }]); v('liquidations : si l’intérêt ouvert baisse, les amas diminuent au prorata', amasLiquidationEstimes(serie3).amas.reduce((a, x) => a + x.usd, 0) < r.amas.reduce((a, x) => a + x.usd, 0) * 0.9);
  const liqs = [{ t: 1000, cote: 'long', prix: 100, usd: 4e5 }, { t: 20000, cote: 'long', prix: 99.5, usd: 4e5 }, { t: 40000, cote: 'long', prix: 99, usd: 4e5 }, { t: 900000, cote: 'short', prix: 101, usd: 1e5 }];
  const cas = cascadesLiquidations(liqs, { fenetreS: 60, seuilUsd: 1e6 }); v('cascade : 3 liquidations rapprochées de longs (1,2 M$) = une cascade', cas.length === 1 && cas[0].cote === 'long' && cas[0].n === 3 && cas[0].mouvementPct < 0 && proche(cas[0].dureeS, 39, 0.1), JSON.stringify(cas));
  v('cascade : « finie » seulement après le calme (jamais d’entrée pendant)', !cascadeFinie(cas[0], 60000) && cascadeFinie(cas[0], 40000 + 130000));
}
/* ── carte des aimants ── */
{
  const base = { prix: 100, atr: 0.3,
    murs: [{ prix: 100.8, cote: 'ask', usdMax: 4e6, ratioMediane: 8, dureeS: 1080, actif: true, fiabilite: { score: 0.8, niveau: 'fiable', executions: 2 } }, { prix: 99.2, cote: 'bid', usdMax: 1e6, ratioMediane: 3, dureeS: 120, actif: true, fiabilite: { score: 0.3, niveau: 'leurre probable', executions: 0 } }],
    piscines: { hauts: [{ prix: 100.82, type: 'egaux', touches: 3 }], bas: [{ prix: 99.3, type: 'jour_prec', touches: 1 }] },
    liquidations: { amas: [{ prix: 100.85, cote: 'short', usd: 8e6 }, { prix: 98.5, cote: 'long', usd: 2e6 }] }, profil: { poc: 100.2, vah: 100.9, val: 99.4 }, noeuds: { hvn: [{ prix: 100.81, force: 2.5 }], lvn: [] }, pression: { pression: 0.3 }, joursCarnet: 3 };
  const c = carteAimants(base);
  v('aimants : l’objectif est la zone du haut où plusieurs sources se confondent (≈ 100,8)', c.objectif && c.objectif.cote === 'haut' && proche(c.objectif.prix, 100.8, 0.1), JSON.stringify(c.objectif));
  v('aimants : plusieurs sources fusionnées dans la même zone (mur + stops + liquidations + nœud)', c.haut[0].familles >= 3 && /mur vendeur/.test(c.objectif.explication) && /égaux/.test(c.objectif.explication));
  v('aimants : un niveau de défense en dessous du prix et une invalidation plus basse encore', c.defense && c.defense.prix < 100 && c.invalidation.prix < c.defense.prix, JSON.stringify([c.defense && c.defense.prix, c.invalidation.prix]));
  v('aimants : résumé en 3 lignes, avec la prudence « hypothèse, pas une promesse »', c.resume.length === 3 && /Hypothèse, pas une promesse/.test(c.resume[2]) && /Prochain aimant/.test(c.resume[0]));
  v('aimants : avertissements honnêtes (liquidations estimées, carnet de 3 jours seulement)', c.avertissements.some(x => /ESTIMÉES/.test(x)) && c.avertissements.some(x => /3,0 jour/.test(x) || /jour\(s\) seulement/.test(x)));
  const bas = carteAimants({ ...base, pression: { pression: -0.9 }, murs: [{ prix: 99.0, cote: 'bid', usdMax: 6e6, ratioMediane: 9, dureeS: 1500, actif: true, fiabilite: { score: 0.9, niveau: 'fiable', executions: 3 } }], piscines: { hauts: [], bas: [{ prix: 99.02, type: 'semaine_prec', touches: 1 }] }, liquidations: null, noeuds: null, profil: null });
  v('aimants : pression vendeuse et mur fiable dessous → objectif en bas', bas.objectif.cote === 'bas' && proche(bas.objectif.prix, 99.0, 0.1), JSON.stringify(bas.objectif));
  v('aimants : sans carnet, les murs ne comptent pas et le dit', carteAimants({ ...base, murs: [] }).avertissements.some(x => /Pas de carnet/.test(x)));
  v('aimants : rien d’utile → pas d’objectif inventé', carteAimants({ prix: 100 }).objectif === null);
  v('aimants : prix invalide → null', carteAimants({ prix: 0 }) === null);
  v('format des prix', fmtPrix(81650.4) === '81 650' || fmtPrix(81650.4).replace(/\s/g, '') === '81650', fmtPrix(81650.4));
  v('aimants : déterministe', JSON.stringify(carteAimants(base)) === JSON.stringify(carteAimants(base)));
}
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
