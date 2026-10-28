import { couleurChaleur, miseEnPage, convertisseurs, plagePrix, graduations, couleurMur, COULEURS } from '../../planetes/mars/pc/liquidite/rendu-carte.js';
import { creerStockageMemoire } from '../../strategies/liquidite/stockage-memoire.js';
import { encoderEnregistrement, decoderSegments, encoderEntete, encoderSegments, decoderEnregistrement } from '../../strategies/liquidite/format-profondeur.js';
import { analyserLiquidite, barresDepuisBougies, histoProfil } from '../../strategies/liquidite/analyse.js';
import { profilVolume, trancheDe } from '../../strategies/liquidite/barres-flux.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, tol) => Math.abs(a - b) <= tol;

/* ── couleurs, mise en page, conversions ── */
v('chaleur : 0 → transparent ; croissant en opacité ; 1 → blanc', couleurChaleur(0)[3] === 0 && couleurChaleur(0.3)[3] > couleurChaleur(0.08)[3] && couleurChaleur(1).join() === '255,255,255,255');
v('chaleur : la teinte monte du bleu au jaune', couleurChaleur(0.1)[2] > couleurChaleur(0.1)[0] && couleurChaleur(0.78)[0] > 200 && couleurChaleur(0.78)[1] > 200);
v('chaleur : valeur négative ou NaN → transparent, > 1 écrêtée', couleurChaleur(-1)[3] === 0 && couleurChaleur(NaN)[3] === 0 && couleurChaleur(5).join() === '255,255,255,255');
const L = miseEnPage(1200, 700);
v('mise en page : la carte, l’axe des prix à DROITE, le profil entre les deux, trois bandes en bas', L.heat.x === 0 && L.axe.x > L.heat.x + L.heat.w - 1 && L.profil && L.profil.x === L.heat.x + L.heat.w && L.bas.bandes.length === 3 && L.bas.y > L.heat.h);
v('mise en page : tout tient dans la largeur et la hauteur', L.axe.x + L.axe.w <= 1200 && L.bas.bandes[2].y + L.bas.bandes[2].h <= 700);
const E = miseEnPage(390, 700); v('mise en page téléphone : pas de profil, axe plus étroit', E.profil === null && E.axe.w < L.axe.w && E.etroit === true);
v('mise en page sans profil demandé', miseEnPage(1200, 700, { profil: false }).profil === null);
const cv = convertisseurs(L, { t0: 1000, t1: 2000, pMin: 100, pMax: 110 });
v('conversions : le temps va de gauche (passé) à droite (présent)', cv.x(1000) === L.heat.x && proche(cv.x(2000), L.heat.x + L.heat.w, 1e-9) && cv.x(1500) > cv.x(1200));
v('conversions : le prix haut est en HAUT (y plus petit)', cv.y(110) === L.heat.y && cv.y(105) > cv.y(108) && proche(cv.y(100), L.heat.y + L.heat.h, 1e-9));
v('conversions : aller-retour', proche(cv.t(cv.x(1734)), 1734, 1e-6) && proche(cv.p(cv.y(103.3)), 103.3, 1e-9));
const pl = plagePrix(100, 0.5); v('plage de prix : ±0,5 % autour du milieu', proche(pl.pMin, 99.5, 1e-9) && proche(pl.pMax, 100.5, 1e-9));
const pl2 = plagePrix(100, 0.5, { extras: [101.0, 130] }); v('plage de prix : élargie pour une cible proche (101), pas pour une cible lointaine (130)', pl2.pMax >= 101 && pl2.pMax < 105);
const g = graduations(99.5, 100.5, 5); v('graduations : valeurs rondes dans la plage', g.length >= 3 && g.every(p => p >= 99.5 && p <= 100.5) && g.every((p, i) => i === 0 || p > g[i - 1]), JSON.stringify(g));
v('couleur des murs selon la fiabilité', couleurMur('fiable') === COULEURS.fiable && couleurMur('leurre probable') === COULEURS.leurre && couleurMur('incertain') === COULEURS.incertain && couleurMur(undefined) === COULEURS.incertain);

/* ── stockage en mémoire (mode direct) ── */
{
  const S = creerStockageMemoire({ dureeS: 5 }), e = { nTranches: 4, pasPct: 0.02, unite: 100 };
  for (let s = 0; s < 8; s++) S.ecrireProfondeur('kraken-BTC', s * 1000, encoderEnregistrement(1000 + s, { meilleurBid: 100, meilleurAsk: 100.1, couvBasPct: 3, couvHautPct: 3, bid: Float64Array.from([1000, 0, 0, 0]), ask: Float64Array.from([0, 2000, 0, 0]) }, e), e);
  const r = S.lireProfondeur('kraken-BTC', 0, 1e9); v('mémoire : tampon circulaire (5 secondes gardées sur 8)', r.enregistrements.length === 5 && r.enregistrements[0].tSec === 1003, String(r.enregistrements.length));
  v('mémoire : valeurs décodées à la volée', proche(r.enregistrements[0].bid[0], 1000, 1) && proche(r.enregistrements[0].ask[1], 2000, 1) && r.entete.nTranches === 4);
  S.ecrireLigne('trades', 'kraken-BTC', 5, { t: 5, n: 1 }); S.ecrireLigne('trades', 'kraken-BTC', 50, { t: 50, n: 2 }); v('mémoire : lignes filtrées par temps', S.lireLignes('trades', 'kraken-BTC', 0, 10).length === 1 && S.lireLignes('trades', 'kraken-BTC', 0, 100).length === 2);
  S.noterTrou({ t: 1 }); v('mémoire : trous gardés', S.lireTrous().length === 1 && S.taille() === 5);
}
/* ── segments (réponse de la route locale) : unités différentes d'un fichier à l'autre ── */
{
  const mk = (unite, ts) => { const e = { nTranches: 3, unite }, entete = encoderEntete({ nTranches: 3, pasPct: 0.02, unite }); const recs = ts.map(t => encoderEnregistrement(t, { meilleurBid: 1, meilleurAsk: 2, couvBasPct: 3, couvHautPct: 3, bid: Float64Array.from([5000, 0, 0]), ask: Float64Array.from([0, 0, 0]) }, e)); const out = new Uint8Array(entete.length + recs.reduce((a, r) => a + r.length, 0)); out.set(entete, 0); let p = entete.length; for (const r of recs) { out.set(r, p); p += r.length; } return out; };
  const d = decoderSegments(encoderSegments([mk(100, [1, 2]), mk(1000, [3])]));
  v('segments : 3 enregistrements, chaque segment décodé avec SON unité', d.enregistrements.length === 3 && proche(d.enregistrements[0].bid[0], 5000, 10) && proche(d.enregistrements[2].bid[0], 5000, 10) && d.entete.unite === 1000);
  v('segments : un segment coupé à la fin est ignoré', decoderSegments(encoderSegments([mk(100, [1, 2])]).subarray(0, 40)).enregistrements.length === 0);
  const un = mk(100, [9]); v('décodage d’un enregistrement isolé', decoderEnregistrement(un.subarray(16), { nTranches: 3, unite: 100 }).tSec === 9);
}
/* ── analyse complète (pure) avec données minimales ── */
{
  const N = 150, recs = []; for (let s = 0; s < 120; s++) { const bid = new Float32Array(N).fill(5000), ask = new Float32Array(N).fill(5000); ask[30] = 3e6; recs.push({ tSec: 1000 + s, meilleurBid: 99.99, meilleurAsk: 100.01, couvBasPct: 3, couvHautPct: 3, bid, ask }); }
  const a = analyserLiquidite({ actif: 'BTC', venue: 'kraken', maintenant: 1e6, donnees: { entete: { nTranches: N, pasPct: 0.02, unite: 100 }, enregistrements: recs }, evenements: [], trades: [{ t: 1000, achatUsd: 100, venteUsd: 50 }, { t: 2000, achatUsd: 10, venteUsd: 80 }], m15: null, joursCarnet: 0.5, ronds: [] });
  v('analyse : un mur vendeur actif repéré, fiabilité incertaine (pas d’historique de retraits)', a.murs.length === 1 && a.murs[0].cote === 'ask' && a.murs[0].actif && a.murs[0].fiabilite.niveau === 'incertain', JSON.stringify(a.murs.map(m => [m.prix, m.cote])));
  v('analyse : CVD, sources dites (profil indisponible sans bougies, liquidations indisponibles)', a.cvd && a.cvd.dernier === 100 - 50 + 10 - 80 && a.sources.profil.ok === false && a.sources.liquidations.ok === false && a.sources.carnet.ok === true);
  v('analyse : aimants présents avec les avertissements honnêtes (carnet de 0,5 jour)', a.aimants && a.aimants.objectif && a.avertissements.some(x => /preuve statistique insuffisante/.test(x)));
  const vide = analyserLiquidite({ actif: 'BTC', venue: 'kraken', maintenant: 1e6, donnees: { entete: null, enregistrements: [] }, evenements: [], trades: [], m15: null });
  v('analyse sans aucune donnée : rien d’inventé', vide.murs.length === 0 && vide.aimants === null && vide.sources.carnet.ok === false && vide.prix === null);
  const m15 = { n: 600, t: Float64Array.from({ length: 600 }, (_, i) => 1e12 + i * 900000), o: new Float64Array(600).fill(100), h: new Float64Array(600).fill(100.5), l: new Float64Array(600).fill(99.5), c: new Float64Array(600).fill(100), v: new Float64Array(600).fill(10), vb: new Float64Array(600).fill(5) };
  const b = barresDepuisBougies(m15, { n: 50 }); v('barres approximatives depuis des bougies : volume réparti, 50 barres', b.length === 50 && b[0].fp.length > 3 && b[0].fp.reduce((s, x) => s + x[1] + x[2], 0) > 0);
  const pf = profilVolume(b), h = histoProfil(pf, 20); v('histogramme du profil : ≈ 20 groupes, somme = volume total', h.length >= 10 && h.length <= 40 && proche(h.reduce((s, x) => s + x[1], 0), pf.total, pf.total * 0.01));
  const a2 = analyserLiquidite({ actif: 'BTC', venue: 'kraken', maintenant: 1e6, donnees: { entete: { nTranches: N, pasPct: 0.02, unite: 100 }, enregistrements: recs }, evenements: [], trades: [], m15, joursCarnet: 20, ronds: [1, 5] });
  v('analyse avec bougies : profil APPROXIMATIF signalé, piscines (ronds) repérées', a2.sources.profil.ok && /APPROXIMATIF/.test(a2.sources.profil.origine) && a2.avertissements.some(x => /approximatif/.test(x)) && a2.piscines && a2.piscines.hauts.some(p => p.type === 'rond') && !a2.avertissements.some(x => /preuve statistique insuffisante/.test(x)));
}
/* ── surimpression sur le graphique du terminal ── */
{
  const { niveauxDepuisAnalyse, creerSurimpression } = await import('../../planetes/mars/pc/liquidite/surimpression.js');
  const a = { prix: 100, murs: [{ prix: 100.5, cote: 'ask', usdMax: 4e6, actif: true, distancePct: 0.5, fiabilite: { niveau: 'fiable' } }, { prix: 99.4, cote: 'bid', usdMax: 9e5, actif: true, distancePct: 0.6, fiabilite: { niveau: 'leurre probable' } }, { prix: 99, cote: 'bid', usdMax: 2e6, actif: false, distancePct: 1, fiabilite: { niveau: 'fiable' } }, { prix: 90, cote: 'bid', usdMax: 2e6, actif: true, distancePct: 10, fiabilite: { niveau: 'fiable' } }],
    aimants: { objectif: { prix: 100.5 }, defense: { prix: 99.5 }, invalidation: { prix: 99.3 } } };
  const n = niveauxDepuisAnalyse(a);
  v('surimpression : murs actifs proches seulement (pas l’inactif, pas celui à 10 %) + cible, défense, invalidation', n.length === 5 && n.filter(x => /^mur/.test(x.titre)).length === 2 && n.some(x => /cible \(hypothèse\)/.test(x.titre)) && n.some(x => x.titre === 'défense') && n.some(x => x.titre === 'invalidation'));
  v('surimpression : titres sans verbe d’ordre, leurre signalé', n.every(x => !/ach(è|e)te |vends |vendre /.test(x.titre.replace(/^mur (ach|vend)\./, ''))) && n.some(x => /leurre/.test(x.titre)));
  v('surimpression : analyse vide → aucune ligne', niveauxDepuisAnalyse(null).length === 0 && niveauxDepuisAnalyse({ prix: 0 }).length === 0);
  let lignes = null, etatTexte = ''; const g = { surimposer: l => { lignes = l; } };
  const S = creerSurimpression({ graphique: () => g, instrument: () => 'BTC', fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, analyse: a }) }), surEtat: x => { etatTexte = x.texte; }, intervalleMs: 1e9 });
  S.activer(); await new Promise(r => setTimeout(r, 30)); v('surimpression activée : les lignes sont posées sur le graphique', lignes && lignes.length === 5 && /5 niveaux/.test(etatTexte), etatTexte);
  S.desactiver(); v('surimpression désactivée : lignes retirées', lignes.length === 0);
  const S2 = creerSurimpression({ graphique: () => g, instrument: () => 'US100', surEtat: x => { etatTexte = x.texte; }, intervalleMs: 1e9 }); S2.activer(); await new Promise(r => setTimeout(r, 30)); v('instrument sans carnet (US100) : message clair, rien tracé', lignes.length === 0 && /BTC, SOL ou DOGE/.test(etatTexte)); S2.desactiver();
  const S3 = creerSurimpression({ graphique: () => g, instrument: () => 'SOL', fetchImpl: async () => { throw new Error('refusé'); }, surEtat: x => { etatTexte = x.texte; }, intervalleMs: 1e9 }); S3.activer(); await new Promise(r => setTimeout(r, 30)); v('service PC injoignable : message honnête, rien tracé', lignes.length === 0 && /indisponible/.test(etatTexte)); S3.desactiver();
}
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
