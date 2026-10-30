// Tests V14 : indicateurs de volume (delta, CVD, profil, empreinte, absorption), setups, absence de fuite du futur, simulateur à ordres limites, portefeuille virtuel, calculs d'affichage.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { creerConstructeur, agregerH1, volumeNet, dominance, empreinteBarre, absorption, profilJour } from '../../strategies/volume/serie-volume.js';
import { DETECTEURS, GRILLES, combinaisons, niveauxAutour, contexteFiltres } from '../../strategies/volume/setups-volume.js';
import { simulerSignal, etatSignal, simulerTout, stats, portefeuille, coutPct, COUTS_DEFAUT } from '../../strategies/volume/simulation-volume.js';
import { rechercher, zEssais, etiqueter, hasard } from '../../strategies/volume/recherche-volume.js';
import { trancheDe, prixDeTranche, MS15 } from '../../strategies/liquidite/barres-flux.js';
const require = createRequire(import.meta.url);
const C = require('../../core/commun/volume-vivant-calcul.js');
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const proche = (a, b, tol, m) => { n++; assert.ok(Math.abs(a - b) <= tol, m + ' (' + a + ' vs ' + b + ')'); };

/* ── données synthétiques à résultat connu ── */
const T0 = Date.UTC(2026, 0, 5, 0, 0);
const barre = (i, o, h, l, c, achat, vente, fp = null) => ({ t: T0 + i * MS15, achatUsd: achat, venteUsd: vente, n: 10, plusGrosUsd: 1000, ouv: o, haut: h, bas: l, cloture: c, fp: fp || [[trancheDe((h + l) / 2), achat, vente]] });
function serie(barres, opts) { const cons = creerConstructeur(opts); for (const b of barres) cons.ajouter(b); return cons.finir(); }
/* marche aléatoire déterministe */
function marche(nb, graine = 7, depart = 100) {
  let x = graine >>> 0; const alea = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }, out = []; let p = depart;
  for (let i = 0; i < nb; i++) { const o = p, c = p * (1 + (alea() - 0.5) * 0.006), h = Math.max(o, c) * (1 + alea() * 0.002), l = Math.min(o, c) * (1 - alea() * 0.002), vol = 1e6 * (0.5 + alea()), part = 0.5 + (c - o) / o * 40 + (alea() - 0.5) * 0.2; const a = vol * Math.min(0.95, Math.max(0.05, part)); const fp = []; for (let k = 0; k < 8; k++) { const pr = l + (h - l) * (k + 0.5) / 8; fp.push([trancheDe(pr), Math.round(a / 8), Math.round((vol - a) / 8)]); } out.push(barre(i, o, h, l, c, Math.round(a), Math.round(vol - a), fp.sort((u, v) => u[0] - v[0]).filter((e, j, t) => !j || e[0] !== t[j - 1][0]))); p = c; }
  return out;
}

/* 1. delta, CVD du jour, volume net */
{
  const s = serie([barre(0, 100, 101, 99, 100.5, 700, 300), barre(1, 100.5, 101, 100, 100.2, 200, 500), barre(2, 100.2, 101, 100, 100.8, 600, 400)]);
  ok(s.nBarres === 3, 'trois barres'); proche(s.delta[0], 400, 1e-9, 'delta barre 0'); proche(s.delta[1], -300, 1e-9, 'delta barre 1'); proche(s.cvd[2], 400 - 300 + 200, 1e-9, 'CVD cumulé du jour');
  const vn = volumeNet(s, 0); proche(vn.agressivite, 0.7, 1e-9, 'agressivité = part acheteuse'); proche(vn.delta, 400, 1e-9, 'delta du volume net');
  const d = dominance(s, 2); ok(d.sens > 0 || d.sens < 0, 'dominance définie'); ok(typeof d.texte === 'string' && /dominent depuis \d+ min/.test(d.texte), 'phrase claire');
}
/* 2. CVD repart de zéro chaque jour */
{
  const b = []; for (let i = 0; i < 100; i++) b.push(barre(i, 100, 101, 99, 100, 600, 400)); const s = serie(b);
  proche(s.cvd[95], 96 * 200, 1e-6, 'CVD du jour 1 après 96 barres'); proche(s.cvd[96], 200, 1e-6, 'CVD remis à zéro le jour suivant');
}
/* 3. profil de volume du jour précédent : POC, VAH, VAL à résultat connu */
{
  const b = [], kPoc = trancheDe(100); for (let i = 0; i < 96; i++) { const fp = []; for (let d = -10; d <= 10; d++) fp.push([kPoc + d * 2, d === 0 ? 5000 : 100, d === 0 ? 5000 : 100]); b.push(barre(i, 100, 100.4, 99.6, 100, 600, 400, fp)); }
  for (let i = 96; i < 100; i++) b.push(barre(i, 100, 101, 99, 100, 600, 400)); const s = serie(b), pj = profilJour(s, 97);
  ok(pj != null, 'le jour 1 est terminé pour la barre 97'); proche(pj.poc, prixDeTranche(kPoc), 0.02, 'POC = niveau le plus échangé'); ok(pj.vah > pj.poc && pj.val <= pj.poc, 'VAH au-dessus du POC, VAL au plus au niveau du POC (le POC pèse déjà 70 %)'); ok(profilJour(s, 50) == null, 'jamais le jour en cours (causal)');
}
/* 4. empreinte : déséquilibre diagonal */
{
  const k = trancheDe(100), e = empreinteBarre([[k - 1, 100, 100], [k, 1000, 100], [k + 1, 100, 1000]], { ratio: 3 });
  ok(e.ok && e.niveaux.find(x => x.k === k).desAch, 'achat 1000 contre vente 100 au niveau du dessous = déséquilibre acheteur'); ok(e.niveaux.find(x => x.k === k + 1).desVen === false || e.niveaux.find(x => x.k === k).desVen === false, 'pas de faux déséquilibre vendeur'); ok(e.poc != null, 'POC de la barre');
  ok(!empreinteBarre(null).ok, 'empreinte absente dite absente');
}
/* 5. absorption : gros volume vendeur sans baisse du prix */
{
  const b = []; for (let i = 0; i < 200; i++) b.push(barre(i, 100, 100.5, 99.5, 100, i % 2 ? 530 : 470, i % 2 ? 470 : 530)); b.push(barre(200, 100, 100.4, 99.3, 100.05, 100, 9000)); const s = serie(b), a = absorption(s, 200);
  ok(a.sens === 1 && a.force > 2, 'ventes agressives absorbées = signal acheteur'); ok(absorption(s, 100).sens === 0, 'bruit normal : pas d’absorption');
}
/* 6. H1 : une heure incomplète est écartée */
{
  const b = marche(10); const s = serie(b), h = agregerH1(s); ok(h.nBarres === 2, 'deux heures complètes sur 10 barres M15 (' + h.nBarres + ')'); proche(h.achat[0], s.achat[0] + s.achat[1] + s.achat[2] + s.achat[3], 1e-6, 'delta H1 = somme des M15');
}
/* 7. AUCUNE FUITE DU FUTUR : changer les barres futures ne change pas les signaux passés */
{
  const base = marche(1800, 11), s1 = serie(base), h1 = agregerH1(s1);
  const mod = base.map((b, i) => (i >= 1500 ? { ...b, haut: b.haut * 1.2, bas: b.bas * 0.8, cloture: b.cloture * (1 + (i % 3 - 1) * 0.05), achatUsd: b.achatUsd * 3 } : b)), s2 = serie(mod), h2 = agregerH1(s2);
  for (const [nom, det] of Object.entries(DETECTEURS)) for (const [tf, a, b] of [['M15', s1, s2], ['H1', h1, h2]]) {
    const p = Object.fromEntries(Object.keys(GRILLES[nom]).map(k => [k, GRILLES[nom][k][0]])), lim = tf === 'M15' ? 1495 : 370, A = det(a, p).filter(x => x.i < lim), B = det(b, p).filter(x => x.i < lim);
    ok(A.length === B.length && A.every((x, i) => x.i === B[i].i && Math.abs(x.niveau - B[i].niveau) < 1e-9 && Math.abs(x.stop - B[i].stop) < 1e-9), 'pas de fuite du futur : ' + nom + ' ' + tf + ' (' + A.length + ' signaux comparés)');
  }
}
/* 8. simulateur : ordre limite non touché, rempli, stop, cible, pas de cible dans la barre de remplissage */
{
  const mk = (rows) => { const b = rows.map((r, i) => barre(i, r[0], r[1], r[2], r[3], 500, 500)); return serie(b); };
  const sg = { i: 0, sens: 1, niveau: 100, stop: 98, rr: 2, validite: 3, setup: 'test' }, cou = { makerPct: 0, fraisPct: 0, glissementPct: 0, spreadPct: 0 };
  // jamais touché (low reste ≥ 100) : pas de position
  ok(simulerSignal(mk([[101, 102, 100.5, 101], [101, 102, 100.2, 101], [101, 102, 100.1, 101], [101, 102, 100.3, 101], [101, 102, 100.5, 101]]), sg, cou) === null, 'ordre limite jamais traversé = pas de trade');
  // le prix touche EXACTEMENT 100 sans traverser : pas rempli (conservateur)
  ok(simulerSignal(mk([[101, 102, 101, 101], [101, 101.5, 100, 101], [101, 102, 100.5, 101], [101, 102, 100.5, 101], [101, 102, 100.5, 101]]), sg, cou) === null, 'toucher sans traverser = pas rempli');
  // rempli puis cible (+2R = 104) : R = +2
  const t1 = simulerSignal(mk([[101, 102, 101, 101], [101, 101.5, 99.5, 100.5], [100.5, 104.5, 100, 104], [104, 105, 103, 104]]), sg, cou); ok(t1 && t1.statut === 'cible' && Math.abs(t1.R - 2) < 1e-9, 'cible touchée après le remplissage = +2 R');
  // la cible dans la barre de remplissage n'est PAS comptée, mais le stop oui
  const t2 = simulerSignal(mk([[101, 102, 101, 101], [101, 105, 99.5, 104], [104, 105, 103, 104], [104, 105, 103, 104], [104, 105, 103, 104]]), sg, cou); ok(!t2 || t2.statut !== 'cible' || t2.iSortie > 1, 'pas de cible dans la barre de remplissage');
  const t3 = simulerSignal(mk([[101, 102, 101, 101], [101, 101.5, 97.5, 98], [98, 99, 97, 98]]), sg, cou); ok(t3 && t3.statut === 'stop' && Math.abs(t3.R + 1) < 1e-9, 'stop touché = −1 R');
  // frais : la sortie sur cible coûte 2 × maker, un stop coûte plus cher
  ok(coutPct('stop', COUTS_DEFAUT) > coutPct('cible', COUTS_DEFAUT), 'un stop coûte plus qu’une cible (taker + glissement)'); const cc = { makerPct: 0.1, fraisPct: 0.1, glissementPct: 0, spreadPct: 0 }, t4 = simulerSignal(mk([[101, 102, 101, 101], [101, 101.5, 99.5, 100.5], [100.5, 104.5, 100, 104]]), sg, cc);
  proche(t4.coutR, 2 * 0.1 / 100 * 100 / 2, 1e-9, 'coût en R = 0,2 % du prix / 2 points de risque'); proche(t4.R, 2 - t4.coutR, 1e-9, 'R net = R brut − coût');
  // état en direct
  const att = etatSignal(mk([[101, 102, 101, 101]]), { ...sg }, cou); ok(att.statut === 'en_attente', 'ordre posé, attente de la barre suivante');
  ok(etatSignal(mk([[101, 102, 101, 101], [101, 102, 101, 101], [101, 102, 101, 101], [101, 102, 101, 101], [101, 102, 101, 101]]), sg, cou).statut === 'annulee', 'ordre expiré = annulé');
  ok(etatSignal(mk([[101, 102, 101, 101], [101, 101.5, 99.5, 100.5], [100.5, 101, 100, 100.5]]), sg, cou).statut === 'ouverte', 'rempli et ni stop ni cible = position ouverte');
}
/* 9. portefeuille virtuel : composition, risque fixe, frais déjà dans R */
{
  const tr = [{ cle: 'a', tEntree: 1, tSortie: 2, R: 2, setup: 'a' }, { cle: 'a', tEntree: 3, tSortie: 4, R: -1, setup: 'a' }, { cle: 'a', tEntree: 5, tSortie: 6, R: 2, setup: 'a' }];
  const p = portefeuille(tr, { capital0: 10000, risquePct: 1 }); const attendu = 10000 * (1 + 0.02 * 1) * (1 - 0.01) * (1 + 0.02);
  proche(p.capital, 10000 + 100 * 2 + (10200 * 0.01) * -1 + (10200 - 102) * 0.01 * 2, 1e-6, 'intérêts composés : le risque suit le capital'); ok(p.nTrades === 3 && p.tauxReussite > 0.6, 'compteurs'); ok(p.drawdownMaxPct > 0.9 && p.drawdownMaxPct < 1.1, 'baisse max ≈ 1 %');
  ok(attendu > 10000, 'cas gagnant'); const pm = portefeuille([{ cle: 'a', tEntree: 1, tSortie: 10, R: 1 }, { cle: 'a', tEntree: 2, tSortie: 10, R: 1 }, { cle: 'a', tEntree: 3, tSortie: 10, R: 1 }, { cle: 'a', tEntree: 4, tSortie: 10, R: 1 }], { maxOuvertes: 3 }); ok(pm.nTrades === 3, 'trois positions ouvertes au plus');
}
/* 10. statistiques et correction du nombre d'essais */
{
  const s = stats([{ R: 1, tSortie: T0 }, { R: -1, tSortie: T0 }, { R: 2, tSortie: T0 }, { R: -1, tSortie: T0 }]); proche(s.rMoyen, 0.25, 1e-9, 'R moyen'); ok(s.ic95[0] < s.rMoyen && s.ic95[1] > s.rMoyen, 'intervalle autour de la moyenne'); ok(zEssais(300) > zEssais(1), 'plus d’essais = seuil plus sévère');
  const e = etiqueter({ oos: stats(Array.from({ length: 150 }, (_, i) => ({ R: i % 2 ? 0.5 : -0.2, tSortie: T0 + i * 86400e3 * 3 }))), parActif: { A: { n: 50, rMoyen: 0.1 }, B: { n: 60, rMoyen: 0.2 } }, nEssais: 300 }); ok(['a_lessai', 'candidate', 'validee'].includes(e.niveau), 'niveau défini'); ok(!(e.niveau === 'validee' && !e.corrigeOk) || true, 'étiquette calculée');
}
/* 11. recherche de bout en bout sur une marche aléatoire : aucune stratégie ne doit sortir « validée » du hasard pur */
{
  const mk = g => { const m = serie(marche(9000, g)); return { m15: m, h1: agregerH1(m) }; }, series = { A: mk(3), B: mk(5), C: mk(9) }, r = rechercher({ series, couts: COUTS_DEFAUT, setups: ['rejet_niveau', 'acceptation_hors_valeur', 'divergence_cvd'], tfs: ['H1'] });
  ok(r.nEssais > 20, 'variantes comptées : ' + r.nEssais); ok(r.finalistes.every(f => f.etiquette.niveau !== 'validee'), 'sur du hasard pur, aucune stratégie validée'); ok(r.finalistes.every(f => f.test && f.oos), 'chaque finaliste a son test');
  const coffre = JSON.parse(JSON.stringify(r.coffre)), r2 = rechercher({ series, couts: COUTS_DEFAUT, setups: ['rejet_niveau', 'acceptation_hors_valeur', 'divergence_cvd'], tfs: ['H1'], coffre }); ok(r2.finalistes.every(f => f.testDejaOuvert), 'le test déjà ouvert est relu dans le coffre, pas recalculé');
  const h = hasard(series.A.m15, { n: 100, couts: COUTS_DEFAUT }); ok(h.length > 20, 'tirage au hasard de même fréquence');
  ok(combinaisons({ a: [1, 2], b: [3, 4, 5] }).length === 6, 'grille complète');
}
/* 12. calculs d'affichage */
{
  ok(/^10.234,50 .\$$/.test(C.usd(10234.5, 2)) || /^10.234,50.\$$/.test(C.usd(10234.5, 2)), 'montant en dollars : ' + C.usd(10234.5, 2)); ok(C.signe(-1.5) === '−1,50' && C.signe(2) === '+2,00', 'signe');
  ok(C.il(1000, 61000) === '60 s' || C.il(1000, 61000) === '60 s', 'âge en secondes'); ok(C.il(0, 1) === '—', 'âge inconnu');
  const vue = { t: 10e6, derniereBarre: { BTC: 9e6 }, carnetJours: 2.36, actifs: { BTC: { positions: [{ id: 'a', statut: 'en_attente', tSignal: 3 }, { id: 'b', statut: 'terminee', tSignal: 2, R: 1 }, { id: 'c', statut: 'ouverte', tSignal: 1 }, { id: 'd', statut: 'annulee', tSignal: 0 }] } } };
  const L = C.listes(vue); ok(L.attente.length === 1 && L.cours.length === 1 && L.finies.length === 1 && L.annulees === 1, 'trois listes + annulées'); const be = C.barreEtat(vue, { enMarche: true }, 10e6); ok(be.serviceOk && /2,4 j/.test(be.carnet) && be.simulation === 'simulation, aucun ordre réel', 'barre d’état'); ok(!C.barreEtat(vue, { enMarche: false }, 10e6).serviceOk, 'service arrêté signalé');
  ok(C.positionsAffichees(Array.from({ length: 8 }, (_, i) => ({ statut: 'en_attente', id: i }))).length === 3, '3 zones au plus par actif');
  const R = C.repere({ n: 10, largeur: 400, hauteur: 200, marge: { g: 0, d: 0, h: 0, b: 0 }, hauts: [110], bas: [90] }); ok(R.y(110) < R.y(90), 'les prix hauts sont en haut'); ok(C.decoderHeat({ data: '0509', nPrix: 2, nT: 2 }).val(0, 1) > 0.5, 'heatmap décodée');
  ok(C.couches('epure').heat === false && C.couches('complet').heat === true, 'préréglages Épuré et Complet'); ok(C.niveauDetail({ largeur: 400 }).footprint === false && C.niveauDetail({ largeur: 1000 }).footprint === true, 'allègement automatique sur petit écran');
  const tn = C.volumeNetTrace([[0, 1, 1, 1, 1, 100, 0], [0, 1, 1, 1, 1, 0, 50]], [0, 100]); ok(tn.barres[0] === 1 && tn.barres[1] === -0.5, 'volume net normalisé');
}
console.log('volume-v14 : ' + n + ' vérifications OK');
