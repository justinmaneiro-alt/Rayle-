// Tests du simulateur riche de la V6 (ordres limités honnêtes, stop minimum, sorties partielle / suiveur / temps / invalidation).
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/simulateur-riche-test.mjs
import { simulerRiche, comparerMakerTaker, configRiche } from '../../strategies/simulateur-riche.js';
import { depuisBougies } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { coutEstimeR } from '../../strategies/couts-r.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const proche = (a, b, e = 1e-9) => Math.abs(a - b) < e;

const T0 = Date.UTC(2026, 0, 5);   // un lundi 00:00 UTC
/* barres : [[o, h, l, c], …] ; la bougie 0 est le signal. */
const serie = barres => depuisBougies(barres.map((b, k) => ({ t: T0 + k * 900e3, o: b[0], h: b[1], l: b[2], c: b[3], v: 100, vb: 50 })));
const signal = (n, i, sens, stop, extra = {}) => { const s = new Int8Array(n), st = new Float64Array(n); s[i] = sens; st[i] = stop; return { riche: true, sens: s, stop: st, R: 2, ...extra }; };
const arr = (n, i, x) => { const a = new Float64Array(n).fill(NaN); a[i] = x; return a; };
const SANS = { fraisPct: 0, makerPct: 0, spreadPct: 0, glissementPct: 0, distanceMinPct: 0, maxParSemaine: 99, reposBarres: 0 };

// ── base : sans coûts, comme le moteur d'origine ──
{
  const m = serie([[100, 100, 100, 100], [100, 101, 99.5, 100.5], [100.5, 103, 100, 102], [102, 102, 101, 101]]);   // entrée à 100 (ouverture bougie 1), stop 99, cible 102
  const r = simulerRiche(m, signal(m.n, 0, 1, 99), SANS);
  v('sans coûts : objectif à 2 R atteint = +2,00 R exactement', r.trades.length === 1 && proche(r.trades[0].R, 2) && r.trades[0].motif === 'cible' && proche(r.trades[0].coutsTotalR, 0), JSON.stringify(r.trades[0]));
}
{
  const m = serie([[100, 100, 100, 100], [100, 100.5, 98.5, 99], [99, 99, 98, 98]]);
  const r = simulerRiche(m, signal(m.n, 0, 1, 99), SANS);
  v('sans coûts : stop touché = −1,00 R exactement', r.trades.length === 1 && proche(r.trades[0].R, -1) && r.trades[0].motif === 'stop');
}
{
  const m = serie([[100, 100, 100, 100], [100, 103, 98, 100], [100, 100, 100, 100]]);   // stop ET cible dans la même bougie
  const r = simulerRiche(m, signal(m.n, 0, 1, 99), SANS);
  v('stop et objectif dans la même bougie : le STOP est compté (hypothèse prudente)', r.trades.length === 1 && r.trades[0].motif === 'stop' && proche(r.trades[0].R, -1));
}
{
  const m = serie([[100, 100, 100, 100], [100, 100.4, 99.6, 100], [98, 98.5, 97, 97.5], [97, 97, 97, 97]]);   // gap sous le stop : sortie à l'ouverture 98
  const r = simulerRiche(m, signal(m.n, 0, 1, 99), SANS);
  v('gap au-delà du stop : sortie à l’ouverture, au prix pire (−2 R ici)', r.trades.length === 1 && proche(r.trades[0].R, -2) && r.trades[0].motif === 'stop', JSON.stringify(r.trades[0]));
}
{
  const m = serie([[100, 100, 100, 100], [100, 101, 99.9, 100.5], [100.5, 100.8, 100.2, 100.4]]);   // jamais ni stop ni cible : position ouverte à la fin
  const r = simulerRiche(m, signal(m.n, 0, 1, 99), SANS);
  v('position encore ouverte à la fin des données : NON comptée', r.trades.length === 0 && r.tronque === true);
}
{
  const m = serie([[100, 100, 100, 100], [100, 100.2, 99.8, 100], [100, 100.3, 99.7, 100.1], [100.1, 100.2, 99.9, 100.1], [100.1, 100.2, 100, 100.1], [100.1, 100.2, 100, 100.1]]);
  const r = simulerRiche(m, signal(m.n, 0, 1, 99, { options: { sortie: { type: 'temps', tempsBarres: 3 } } }), SANS);
  v('sortie par le temps : fermeture à la clôture après 3 bougies, motif « temps »', r.trades.length === 1 && r.trades[0].motif === 'temps' && r.trades[0].barres === 3 && proche(r.trades[0].R, 0.1, 1e-9), JSON.stringify(r.trades[0]));
}
{
  const m = serie([[100, 100, 100, 100], [100, 100.4, 99.8, 100.2], [100.2, 100.5, 100, 100.3], [100.3, 100.4, 100.1, 100.2], [100.2, 100.3, 100.1, 100.2], [100.2, 100.3, 100.1, 100.2]]);
  const inval = new Int8Array(m.n); inval[2] = 1;   // le contexte invalide les achats à la clôture de la bougie 2 : sortie à l'ouverture de la bougie 3 (100,3)
  const r = simulerRiche(m, signal(m.n, 0, 1, 99, { invalide: inval }), SANS);
  v('sortie sur invalidation du contexte : à l’ouverture de la bougie suivante, motif « invalidation »', r.trades.length === 1 && r.trades[0].motif === 'invalidation' && proche(r.trades[0].prixSortie, 100.3) && r.trades[0].sortie === 3, JSON.stringify(r.trades[0]));
  const inval2 = new Int8Array(m.n); inval2[2] = -1;
  const r2 = simulerRiche(m, signal(m.n, 0, 1, 99, { invalide: inval2 }), SANS);
  v('…et une invalidation des VENTES ne touche pas un achat', r2.trades.length === 0 && r2.tronque);
}

// ── coûts ──
{
  const cfg = { fraisPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02, distanceMinPct: 0, maxParSemaine: 99, reposBarres: 0 };
  const m = serie([[100, 100, 100, 100], [100, 100, 100, 100], [100, 108, 100, 108], [108, 108, 108, 108]]);   // entrée 100 + coûts, stop 90 (10 %), cible à 2 R
  const r = simulerRiche(m, signal(m.n, 0, 1, 95, { R: 0.5 }), cfg);   // stop à 5 %
  const t = r.trades[0]; const fill = 100 * (1 + 0.0002 + 0.0001), dist = fill - 95, cible = fill + 0.5 * dist;
  const attendu = (cible - fill) / dist - (0.0006 * fill + 0.00024 * cible) / dist;   // entrée taker, objectif limité (maker), sans spread / glissement à la sortie
  v('avec coûts : R net = gain brut − frais taker à l’entrée − frais maker à l’objectif (calcul à la main)', t && proche(t.R, attendu, 1e-9) && t.motif === 'cible', JSON.stringify({ R: t && t.R, attendu }));
  v('coutsTotalR = gain idéal − R net, et inclut spread et glissement de l’entrée', t.coutsTotalR > t.coutsR && proche(t.coutsTotalR, t.RbrutIdeal - t.R, 1e-12), JSON.stringify({ tot: t.coutsTotalR, frais: t.coutsR }));
}
{
  const cfg = { fraisPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02, distanceMinPct: 0, maxParSemaine: 99, reposBarres: 0 };
  const m = serie([[100, 100, 100, 100], [100, 100.1, 99.9, 100], [100, 100.1, 99.9, 100], [100, 100.1, 99.9, 100], [100, 100.1, 99.9, 100]]);
  const stopProche = simulerRiche(m, signal(m.n, 0, 1, 99.7, { options: { coutPlafondR: 0.08, refuserSiCoutR: true } }), cfg);
  v('plafond de coût : un stop à 0,3 % (coût ≈ 0,5 R) est REFUSÉ quand on ne l’élargit pas', stopProche.trades.length === 0 && stopProche.ordres.refusFrais === 1, JSON.stringify(stopProche.ordres));
  const cfg2 = { ...cfg }; const grand = serie([[100, 100, 100, 100], [100, 100.1, 99.9, 100], [100, 110, 99.9, 110], [110, 110, 110, 110]]);
  const elargi = simulerRiche(grand, signal(grand.n, 0, 1, 99.7, { R: 2, options: { coutPlafondR: 0.08, stopMinAuto: true } }), cfg2);
  const tr = elargi.trades[0];
  v('stop minimum automatique : le stop est ÉLARGI pour que les frais restent sous 0,08 R', elargi.ordres.elargis === 1 && tr && tr.distancePct > 1.8 && coutEstimeR({ fraisPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02 }, tr.distancePct) <= 0.0801, JSON.stringify({ pct: tr && tr.distancePct, ordres: elargi.ordres }));
  v('…et le coût réellement payé en R est faible (< 0,12 R)', tr && tr.coutsTotalR < 0.12, String(tr && tr.coutsTotalR));
  const rr = simulerRiche(m, signal(m.n, 0, 1, 99, { R: 1.2, options: { rrMin: 1.5 } }), cfg);
  v('rapport gain / risque minimal exigé à l’entrée (1,5) : un objectif à 1,2 R est refusé', rr.trades.length === 0 && rr.ordres.refusRR === 1);
  const cible = new Float64Array(m.n).fill(NaN); cible[0] = 102;
  const rr2 = simulerRiche(m, signal(m.n, 0, 1, 99, { cible, options: { rrMin: 1.5 } }), cfg);
  v('un objectif ABSOLU (aimant) à 2 R de distance passe la barre de 1,5', rr2.ordres.refusRR === 0 && rr2.tronque);
  const horaire = new Array(24).fill(1); horaire[0] = 5;   // spread 5× à minuit (le signal est à 00:15)
  const gros = serie([[100, 100, 100, 100], [100, 103, 100, 103], [103, 103, 103, 103]]);
  const c1 = simulerRiche(gros, signal(gros.n, 0, 1, 99), { ...cfg, distanceMinPct: 0 }), c2 = simulerRiche(gros, signal(gros.n, 0, 1, 99), { ...cfg, distanceMinPct: 0, spreadParHeure: horaire });
  v('spread variable selon l’heure UTC : un spread 5 fois plus large à cette heure coûte plus', c2.trades[0].coutsTotalR > c1.trades[0].coutsTotalR + 0.01, c1.trades[0].coutsTotalR + ' / ' + c2.trades[0].coutsTotalR);
}

// ── ordres limités : remplissage honnête ──
{
  const base = { ...SANS, filePct: 0.02 };
  const sigL = (n, niveau, extra = {}) => ({ ...signal(n, 0, 1, 98, extra), limite: arr(n, 0, niveau) });
  const touche = serie([[100, 100, 100, 100], [100, 100.5, 99.0, 99.5], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5]]);
  const exact = serie([[100, 100, 100, 100], [100, 100.5, 99.0, 99.5], [99.5, 100.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5]]);
  const r1 = simulerRiche(exact, sigL(exact.n, 99.0, { ttl: 2 }), base);
  v('ordre limité : le prix TOUCHE exactement le niveau → pas de remplissage (la file d’attente)', r1.trades.length === 0 && r1.ordres.poses === 1 && r1.ordres.remplis === 0 && r1.ordres.nonRemplis === 1, JSON.stringify(r1.ordres));
  const traverse = serie([[100, 100, 100, 100], [100, 100.5, 98.9, 98.95], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5], [99.5, 99.6, 99.4, 99.5]]);
  const r2 = simulerRiche(traverse, sigL(traverse.n, 99.0, { options: { sortie: { type: 'temps', tempsBarres: 3 } } }), base);
  v('le prix traverse le niveau de plus de 0,02 % → rempli AU niveau, sans amélioration de prix', r2.ordres.remplis === 1 && r2.trades.length === 1 && proche(r2.trades[0].prixEntree, 99.0) && r2.trades[0].maker === true, JSON.stringify(r2.trades[0]));
  v('remplissage adverse compté (la bougie se referme sous le niveau d’un achat)', r2.ordres.adverses === 1 && r2.trades[0].adverse === true);
  const parti = serie([[100, 100, 100, 100], [100, 103, 100.5, 102.5], [102.5, 103, 102, 102.5], [102.5, 103, 102, 102.5]]);
  const cible = new Float64Array(parti.n).fill(NaN); cible[0] = 102;
  const r3 = simulerRiche(parti, { ...sigL(parti.n, 99.0), cible }, base);
  v('le prix part vers l’objectif sans jamais atteindre le niveau : ordre annulé, « parti sans nous » compté', r3.trades.length === 0 && r3.ordres.partisSansNous === 1 && r3.ordres.remplis === 0, JSON.stringify(r3.ordres));
  const expire = serie([[100, 100, 100, 100], [100, 100.2, 99.9, 100], [100, 100.2, 99.9, 100], [100, 100.2, 99.9, 100], [99.0, 99, 98.0, 98.5]]);
  const r4 = simulerRiche(expire, sigL(expire.n, 99.0, { ttl: 3 }), base);
  v('ordre expiré après sa durée de vie (3 bougies) : un remplissage tardif ne compte pas', r4.trades.length === 0 && r4.ordres.nonRemplis === 1 && r4.ordres.remplis === 0);
  const tout = serie([[100, 100, 100, 100], [100, 100.5, 98.0, 98.5], [98.5, 98.6, 98.4, 98.5], [98.5, 98.6, 98.4, 98.5]]);   // rempli à 99 ET stop (98) touché dans la même bougie
  const r5 = simulerRiche(tout, sigL(tout.n, 99.0), base);
  v('rempli et stop touché dans la même bougie : le stop est compté (perte pleine)', r5.trades.length === 1 && r5.trades[0].motif === 'stop' && proche(r5.trades[0].R, -1, 1e-9), JSON.stringify(r5.trades[0]));
  const cfg = { fraisPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02, distanceMinPct: 0, maxParSemaine: 99, reposBarres: 0, filePct: 0.02 };
  const m = serie([[100, 100, 100, 100], [100, 100.3, 98.9, 99.2], [99.2, 105, 99, 105], [105, 105, 105, 105]]);
  const mar = simulerRiche(m, signal(m.n, 0, 1, 97, { R: 1 }), cfg), lim = simulerRiche(m, { ...signal(m.n, 0, 1, 97, { R: 1 }), limite: arr(m.n, 0, 99.0) }, cfg);
  v('un aller-retour avec entrée limitée coûte moins cher qu’au marché (frais maker, ni spread ni glissement à l’entrée)', lim.trades.length === 1 && mar.trades.length === 1 && lim.trades[0].coutsTotalR < mar.trades[0].coutsTotalR, lim.trades[0].coutsTotalR + ' / ' + mar.trades[0].coutsTotalR);
  const cmp = comparerMakerTaker(m, signal(m.n, 0, 1, 97, { R: 1 }), { ...signal(m.n, 0, 1, 97, { R: 1 }), limite: arr(m.n, 0, 99.0) }, cfg, {});
  v('comparaison maker / taker : chiffres des deux côtés, taux de remplissage et sélection adverse', cmp.marche.n === 1 && cmp.limite.n === 1 && cmp.tauxRemplissage === 1 && cmp.selectionAdverse.part !== undefined);
}

// ── sorties riches ──
{
  const partielle = serie([[100, 100, 100, 100], [100, 101.2, 99.8, 100.8], [100.8, 100.9, 99.9, 100], [100, 100, 99.5, 99.8], [99.8, 99.9, 99.5, 99.6]]);   // atteint +1,2 R puis revient à l'entrée
  const r = simulerRiche(partielle, signal(partielle.n, 0, 1, 99, { options: { sortie: { type: 'partielle', partielleR: 1, partielleFraction: 0.5 } } }), SANS);
  v('sortie partielle : 50 % pris à +1 R, stop remonté à l’entrée, le reste ressort à zéro = +0,5 R', r.trades.length === 1 && proche(r.trades[0].R, 0.5, 1e-9) && r.trades[0].partielle === true && r.trades[0].motif === 'be', JSON.stringify(r.trades[0]));
  const sans = simulerRiche(partielle, signal(partielle.n, 0, 1, 99, { options: { sortie: { type: 'fixe' } } }), SANS);
  v('sans sortie partielle le même mouvement revenait à −1 R (stop) : la partielle sauve une demi-position', sans.trades.length === 0 || sans.trades[0].R < r.trades[0].R);
  const course = serie([[100, 100, 100, 100], [100, 101, 99.9, 100.9], [100.9, 102.2, 100.6, 102], [102, 103.2, 101.8, 103], [103, 103.1, 100.9, 101], [101, 101, 100.5, 100.5], [100.5, 100.6, 100, 100.2]]);
  const atr = new Float64Array(course.n).fill(0.5);
  const s = simulerRiche(course, signal(course.n, 0, 1, 99, { atr, R: 10, options: { sortie: { type: 'suiveur', suiveurActiveR: 1, suiveurAtr: 1 } } }), SANS);
  const t = s.trades[0];
  v('stop suiveur : après +1 R le stop suit le plus haut − 1 ATR ; la sortie verrouille un gain (ici 102,7 → +2,7 R), motif « suiveur »', t && t.motif === 'suiveur' && proche(t.R, 2.7, 1e-9), JSON.stringify(t));
  // pas de regard vers le futur : le stop de la bougie 3 ne sait rien du plus haut de la bougie 3 avant sa clôture
  const bar = serie([[100, 100, 100, 100], [100, 103, 99.9, 103], [103, 103, 98, 98.5], [98.5, 98.5, 98.5, 98.5]]);   // énorme haut dans la bougie 1 puis chute dans la bougie 2
  const sv = simulerRiche(bar, signal(bar.n, 0, 1, 99, { atr: new Float64Array(bar.n).fill(0.5), R: 10, options: { sortie: { type: 'suiveur', suiveurActiveR: 1, suiveurAtr: 1 } } }), SANS);
  v('le stop suiveur ne joue qu’À PARTIR de la bougie suivante (il a été remonté avec la bougie 1, puis touché en bougie 2)', sv.trades[0] && sv.trades[0].sortie === 2 && sv.trades[0].R > 1.5, JSON.stringify(sv.trades[0]));
  const un = serie([[100, 100, 100, 100], [100, 101, 99.5, 100.5], [100.5, 100.8, 99.2, 99.5], [99.5, 99.6, 98.5, 98.8], [98.8, 98.9, 98.7, 98.8]]);
  const deux = simulerRiche(un, { ...signal(un.n, 0, 1, 99), sens: (() => { const s = new Int8Array(un.n); s[0] = 1; s[2] = 1; return s; })(), stop: (() => { const x = new Float64Array(un.n); x[0] = 99; x[2] = 99; return x; })() }, SANS);
  v('une seule position à la fois : un second signal pendant une position est ignoré', deux.trades.length === 1);
  const sem = serie(Array.from({ length: 12 }, () => [100, 100.5, 99.5, 100]));
  const s3 = new Int8Array(sem.n), st3 = new Float64Array(sem.n); for (const k of [0, 3, 6]) { s3[k] = 1; st3[k] = 99.8; }
  const lim = simulerRiche(sem, { riche: true, sens: s3, stop: st3, R: 2 }, { ...SANS, maxParSemaine: 2 });
  v('positions par semaine limitées', lim.ordres.refusSemaine >= 1);
}
{
  const c = configRiche({ fraisPct: 0.06 });
  v('configuration par défaut : maker = 40 % du taker, profondeur de file 0,02 %', proche(c.makerPct, 0.024) && c.filePct === 0.02);
}
console.log('Simulateur riche : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
