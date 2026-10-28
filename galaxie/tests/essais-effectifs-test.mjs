// Tests du nombre effectif d'essais (V6, phase 4) : regroupement des variantes corrélées, taux de faux positifs maîtrisé sur du bruit pur, stratégie truquée rejetée, ancienne règle par défaut.
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/essais-effectifs-test.mjs
import { rendementsJournaliers, correlation, nombreEffectif, nombreEffectifTotal, comparerDeflations, SEUIL_CORRELATION } from '../../strategies/essais-effectifs.js';
import { sharpeDeflate } from '../../planetes/mars/pc/agent-btc/stats-m5.js';
import { validerV3 } from '../../strategies/validation-v3.js';
import { FAMILLES } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { ORDRE_V6 } from '../../strategies/familles-v6.js';
import { alea } from '../../planetes/mars/pc/mars-calcul.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import { CRITERES3, empreinteV3 } from '../../strategies/criteres-v3.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

const JOUR = 86400e3, T0 = Date.UTC(2020, 0, 1);
v('rendements journaliers : somme par jour de sortie, 0 ailleurs', (() => { const r = rendementsJournaliers([{ tSortie: T0 + 3600e3, R: 1 }, { tSortie: T0 + 5 * 3600e3, R: -0.5 }, { tSortie: T0 + 2 * JOUR, R: 2 }], T0, T0 + 4 * JOUR); return r[0] === 0.5 && r[1] === 0 && r[2] === 2 && r.length >= 4; })());
v('corrélation : identiques = 1, opposées = −1, constantes = 0 (pas de division par zéro)', (() => { const a = Float64Array.from([1, 2, 3, 4]); return Math.abs(correlation(a, a) - 1) < 1e-12 && Math.abs(correlation(a, a.map(x => -x)) + 1) < 1e-12 && correlation(a, new Float64Array(4)) === 0; })());

// ── séries de bruit pur ──
const bruit = (a, T) => Float64Array.from({ length: T }, () => (a() - 0.5) * 2 * 0.8);
const T = 250;
{
  const a = alea(11), independantes = Array.from({ length: 60 }, () => bruit(a, T)), n1 = nombreEffectif(independantes);
  v('60 séries indépendantes : ~60 essais effectifs (aucune fusion abusive)', n1.nEff >= 56 && n1.nEff <= 60, JSON.stringify(n1.nEff));
  const base = Array.from({ length: 10 }, () => bruit(a, T)), copies = []; for (const b of base) for (let k = 0; k < 10; k++) copies.push(Float64Array.from(b, x => x + (a() - 0.5) * 0.1));
  const n2 = nombreEffectif(copies);
  v('10 idées × 10 variantes presque identiques : 10 essais effectifs (±2) au lieu de 100', n2.N === 100 && n2.nEff >= 10 && n2.nEff <= 12, JSON.stringify({ N: n2.N, nEff: n2.nEff, amas: n2.amas.slice(0, 4) }));
  v('100 copies exactes : un seul essai', nombreEffectif(Array.from({ length: 100 }, () => base[0])).nEff === 1);
  v('variantes avec trop peu de jours actifs : jamais fusionnées (choix prudent)', nombreEffectif([Float64Array.from([1, 0, 0, 0]), Float64Array.from([1, 0, 0, 0]), Float64Array.from([1, 0, 0, 0])]).nEff === 3);
  v('le seuil de corrélation est écrit une fois (0,8)', SEUIL_CORRELATION === 0.8);
  v('N effectif total : variantes déjà comptées ramenées au taux de redondance observé', nombreEffectifTotal({ nEffCourant: 10, nCourant: 100, variantesAvant: 9000 }) === 910 && nombreEffectifTotal({ nEffCourant: 50, nCourant: 50, variantesAvant: 1000 }) === 1050 && nombreEffectifTotal({ nEffCourant: 5, nCourant: 0, variantesAvant: 0 }) >= 1);
}

// ── taux de faux positifs sur du BRUIT PUR : le meilleur de M variantes sans aucun avantage ne doit presque jamais passer à 95 % ──
function essais(copiesParIdee, idees, evaluations, graine) {
  const a = alea(graine); let fpAncien = 0, fpCorrige = 0, sommeRatio = 0, m50a = 0, m50c = 0;
  for (let e = 0; e < evaluations; e++) {
    const variantes = []; for (let i = 0; i < idees; i++) { const b = bruit(a, T); for (let k = 0; k < copiesParIdee; k++) variantes.push(copiesParIdee === 1 ? b : Float64Array.from(b, x => x + (a() - 0.5) * 0.1)); }
    let meilleur = null, sr = -Infinity; for (const R of variantes) { let s = 0, q = 0; for (const x of R) { s += x; q += x * x; } const m = s / R.length, sd = Math.sqrt(q / R.length - m * m), srv = m / sd; if (srv > sr) { sr = srv; meilleur = R; } }
    const ne = nombreEffectif(variantes), c = comparerDeflations(Array.from(meilleur), variantes.length, ne.nEff);
    if (c.ancien.dsr >= 0.95) fpAncien++; if (c.corrige.dsr >= 0.95) fpCorrige++; if (c.ancien.dsr >= 0.5) m50a++; if (c.corrige.dsr >= 0.5) m50c++; sommeRatio += ne.ratio;
  }
  return { fpAncien: fpAncien / evaluations, fpCorrige: fpCorrige / evaluations, ratio: sommeRatio / evaluations, p50Ancien: m50a / evaluations, p50Corrige: m50c / evaluations };
}
const ind = essais(1, 40, 250, 21), cor = essais(6, 15, 150, 22);
v('bruit pur, 40 variantes indépendantes : l’ancienne ET la nouvelle règle laissent passer moins de 8 % de faux positifs (limite annoncée : 5 %)', ind.fpAncien <= 0.08 && ind.fpCorrige <= 0.08, JSON.stringify(ind));
v('…et la correction ne dégrade pas ces cas (elle n’invente pas de redondance quand il n’y en a pas : taux de redondance > 0,9)', ind.ratio > 0.9 && Math.abs(ind.fpAncien - ind.fpCorrige) <= 0.04, JSON.stringify(ind));
v('bruit pur, 15 idées × 6 copies quasi identiques : la règle corrigée reste dans la limite annoncée (< 8 %), l’ancienne est plus sévère (≤)', cor.fpCorrige <= 0.08 && cor.fpAncien <= cor.fpCorrige + 1e-9, JSON.stringify(cor));
v('CALIBRAGE : au seuil de 50 %, 40 variantes indépendantes en laissent passer ≈ 44 % ; avec des copies, l’ANCIENNE règle n’en laisse passer que ≈ 13 % (sur-pénalisation) et la CORRIGÉE retrouve ≈ la même proportion que sans copies (±15 points) : elle rétablit la justesse, elle n’est pas plus indulgente que le cas de référence', cor.p50Ancien < cor.p50Corrige - 0.2 && Math.abs(cor.p50Corrige - ind.p50Corrige) <= 0.15, JSON.stringify({ ind: [ind.p50Ancien, ind.p50Corrige], cor: [cor.p50Ancien, cor.p50Corrige] }));
v('…parce que le nombre effectif retrouvé est proche du vrai nombre d’idées (ratio ≈ 15 / 90)', cor.ratio < 0.25 && cor.ratio > 0.12, String(cor.ratio));
v('sans correction, 90 variantes presque identiques sur-pénalisent : le Sharpe déflaté d’une vraie bonne série est plus haut avec N effectif', (() => { const R = Array.from({ length: 250 }, (_, i) => (i % 7 === 0 ? 1.3 : -0.35)); return sharpeDeflate(R, 15).dsr > sharpeDeflate(R, 90).dsr; })());

// ── validation complète : ancienne règle par défaut, voie corrigée côte à côte, stratégie truquée toujours rejetée ──
const historique = marcheMixte(170000, 5), config = { fraisPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02 };
const defaut = validerV3(historique, 'tendance_pullback_h4', { config, variantesAvant: 3000 }), expl = validerV3(historique, 'tendance_pullback_h4', { config, variantesAvant: 3000, voieCorrigee: false }), corr = validerV3(historique, 'tendance_pullback_h4', { config, variantesAvant: 3000, voieCorrigee: true });
v('par défaut, la règle de validation est l’ANCIENNE (identique à voieCorrigee: false, même lignes, même statut)', JSON.stringify(defaut.lignes) === JSON.stringify(expl.lignes) && defaut.statut === expl.statut && defaut.correction.voieCorrigeeActive === false);
v('les deux valeurs sont rendues côte à côte : N ancien et N effectif, Sharpe déflaté des deux, critères ratés des deux', defaut.correction.ancien.N === defaut.nVariantes && defaut.correction.corrige.N <= defaut.correction.ancien.N && 'dsr' in defaut.correction.ancien && 'dsr' in defaut.correction.corrige && Array.isArray(defaut.correction.ancien.ratees) && Array.isArray(defaut.correction.corrige.ratees) && defaut.correction.estimation === true, JSON.stringify({ a: defaut.correction.ancien.N, c: defaut.correction.corrige.N }));
v('le nombre effectif est plus petit que le nombre de variantes (les voisins se ressemblent) et la valeur corrigée est étiquetée « estimation » avec une explication', defaut.correction.corrige.N < defaut.correction.ancien.N && /Les seuils ne changent pas/.test(defaut.correction.explication));
v('la voie corrigée donne le Sharpe déflaté corrigé dans les lignes de validation (elle ne touche à aucun seuil)', corr.correction.voieCorrigeeActive === true && corr.dsr.N === corr.correction.corrige.N && corr.criteres.v3 === 'c9b4ddd4' && defaut.dsr.N === defaut.nVariantes);
v('le verdict de l’ancienne règle est le même que celui annoncé dans correction.ancien (rien n’est caché)', defaut.statut === (defaut.correction.ancien.valide ? 'validee_backtest' : 'non_validee') && corr.statut === (corr.correction.corrige.valide ? 'validee_backtest' : 'non_validee'));
{
  const toutes = [...ORDRE_V6, 'tendance_ma', 'divergence_rsi', 'faux_breakout'];
  v('marché sans avantage : AUCUNE famille n’est validée, ni avec l’ancienne règle ni avec la voie corrigée', toutes.every(id => validerV3(historique, id, { config, variantesAvant: 2000, voieCorrigee: true }).statut !== 'validee_backtest' && validerV3(historique, id, { config, variantesAvant: 2000 }).statut !== 'validee_backtest'));
}
FAMILLES.triche_neff = { id: 'triche_neff', nom: 'Triche', riche: true, unite: 'H1', description: 'Test.', grille: () => ({ a: [1, 2] }), signaux(ctx) { const n = ctx.n, sens = new Int8Array(n), stop = new Float64Array(n); for (let i = 450; i < n - 2; i++) if (ctx.m15.c[i + 2] > ctx.m15.c[i] * 1.002) { sens[i] = 1; stop[i] = ctx.m15.c[i] * 0.99; } return { riche: true, sens, stop, R: 2, options: { stopMinAuto: true, coutPlafondR: 0.08, rrMin: 1.5 } }; } };
v('la stratégie truquée (qui regarde le futur) est rejetée par la causalité, même avec la voie corrigée', validerV3(historique, 'triche_neff', { config, voieCorrigee: true }).statut === 'rejetee_causalite' && validerV3(historique, 'triche_neff', { config }).statut === 'rejetee_causalite');
delete FAMILLES.triche_neff;
v('critères inchangés : v3 c9b4ddd4, 150 trades, +0,25 R, 95 % de Sharpe déflaté', empreinteV3() === 'c9b4ddd4' && CRITERES3.horsEchantillon.tradesMin === 150 && CRITERES3.horsEchantillon.esperanceMin === 0.25 && CRITERES3.deflation.dsrMin === 0.95);
console.log('  faux positifs mesurés sur du bruit pur — 40 variantes indépendantes : ancienne ' + (ind.fpAncien * 100).toFixed(1) + ' %, corrigée ' + (ind.fpCorrige * 100).toFixed(1) + ' % ; 15 idées × 6 copies : ancienne ' + (cor.fpAncien * 100).toFixed(1) + ' %, corrigée ' + (cor.fpCorrige * 100).toFixed(1) + ' % (limite annoncée : 5 %) ; au seuil de 50 % : indépendantes ' + (ind.p50Corrige * 100).toFixed(0) + ' %, copies ancienne ' + (cor.p50Ancien * 100).toFixed(0) + ' % / corrigée ' + (cor.p50Corrige * 100).toFixed(0) + ' %');
console.log('Nombre effectif d’essais : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
