/* Tests purs du footprint (v4.1) : regroupement de prix, taille de case, POC, déséquilibres 3:1 diagonaux et empilés, état d'une bougie sans empreinte, direct, rattrapage. node trader-pro/tests/footprint-test.mjs */
import zlib from 'node:zlib';
import { regrouperPrix, fusionnerCases, tailleCible, analyserBougie, ligneDuPrix, surNiveau, intensite } from '../volume/footprint-calcul.js';
import { creerStoreFootprint, creerLive, rattraperHeure, creerRattrapage, nomTaille, TEXTE_ABSENT } from '../volume/footprint-donnees.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, J = 86400e3;

/* regroupement exact */
const cases = [[8290, 2, 4, 3], [8291, 0, 5, 1], [8292, 1, 1, 1], [8294, 3, 0, 2]];   // pas 0,5
const n1 = regrouperPrix(cases, 0.5, 1); v(n1.length === 3 && n1[0].prix === 4145 && n1[0].vente === 2 && n1[0].achat === 9 && n1[0].n === 4 && n1[1].prix === 4146 && n1[2].prix === 4147, 'regroupement 0,5 → 1 $ : prix 4145 (somme), 4146, 4147');
const n2 = regrouperPrix(cases, 0.5, 2); v(n2.length === 2 && n2[0].prix === 4144 && n2[0].k === 2072 && n2[0].vente === 2 && n2[0].achat === 9 && n2[1].vente === 4 && n2[1].prix === 4146, 'regroupement 0,5 → 2 $ : bornes basses 4144 et 4146');
const somme = L => L.reduce((s, x) => s + x.vente + x.achat, 0); v(Math.abs(somme(n1) - 16) < 1e-9 && Math.abs(somme(n2) - 16) < 1e-9, 'volume conservé par le regroupement (16)');
v(regrouperPrix([], 1, 1).length === 0 && regrouperPrix(null, 1, 1).length === 0, 'aucune case : aucune donnée inventée');
v(fusionnerCases([[[1, 1, 2, 1]], [[1, 3, 4, 2], [2, 1, 0, 1]]]).map(x => x.join()).join('|') === '1,4,6,3|2,1,0,1', 'fusion des heures d’une bougie plus longue');
/* sol : 0,05 → 0,25 (flottants) */
const ns = regrouperPrix([[1737, 1, 1, 1], [1738, 1, 1, 1], [1740, 1, 1, 1]], 0.05, 0.25); v(ns.length === 2 && ns[0].prix === 86.75 && ns[0].achat === 2 && ns[1].prix === 87, 'Solana : cases de 0,05 → 0,25 sans erreur de flottant');

/* taille de case selon l'étirement vertical */
v(tailleCible([0.5, 1, 2], 40).pas === 0.5 && tailleCible([0.5, 1, 2], 40).ratio === 1, '40 px par $ : case de 0,5 $ (20 px)');
v(tailleCible([0.5, 1, 2], 15).pas === 1 && tailleCible([0.5, 1, 2], 15).source === 1, '15 px par $ : case de 1 $');
const tc = tailleCible([0.5, 1, 2], 2); v(tc.source === 2 && tc.pas === 6 && tc.ratio === 3, '2 px par $ : multiple entier de la plus grande taille (6 $, lignes de 12 px)');
v(tailleCible([], 10) === null && tailleCible([1], 0) === null, 'taille de case : pas de tailles ou échelle nulle → rien');

/* analyse : POC, déséquilibres diagonaux 3:1, empilés */
const niv = [[100, 5, 5], [101, 6, 20], [102, 4, 30], [103, 2, 40], [104, 30, 4], [105, 28, 5], [106, 27, 2], [107, 3, 2]].map(([p, s, b], i) => ({ k: i, prix: p, vente: s, achat: b, n: 3 }));
const A = analyserBougie(niv);
v(A.rows[0].prix === 107 && A.rows[A.rows.length - 1].prix === 100, 'lignes du haut vers le bas');
v(A.poc.prix === 103 && A.rows.find(r => r.prix === 103).poc === true && A.rows.filter(r => r.poc).length === 1, 'POC de la bougie = case au plus gros volume (103 : 42)');
v(Math.abs(A.total.achat - 108) < 1e-9 && Math.abs(A.total.vente - 105) < 1e-9 && Math.abs(A.total.delta - 3) < 1e-9 && A.total.n === 24, 'totaux : acheteurs 108, vendeurs 105, delta +3, 24 transactions');
const r101 = A.rows.find(r => r.prix === 101), r102 = A.rows.find(r => r.prix === 102), r103 = A.rows.find(r => r.prix === 103);
v(r101.deseq === 'achat' && r102.deseq === 'achat' && r103.deseq === 'achat', 'déséquilibre acheteur diagonal : acheteurs de 101 (20) ≥ 3 × vendeurs de 100 (5)');
const r104 = A.rows.find(r => r.prix === 104), r105 = A.rows.find(r => r.prix === 105), r106 = A.rows.find(r => r.prix === 106);
v(r104.deseq === 'vente' && r105.deseq === 'vente' && r106.deseq === 'vente', 'déséquilibre vendeur diagonal : vendeurs de 104 (30) ≥ 3 × acheteurs de 105 (5)');
const r107 = A.rows.find(r => r.prix === 107), r100 = A.rows.find(r => r.prix === 100); v(!r107.deseq && !r100.deseq, 'première et dernière cases : pas de voisine, jamais signalées');
v(r101.empile && r102.empile && r103.empile && r104.empile && r105.empile && r106.empile, 'déséquilibres empilés : 3 cases consécutives ou plus du même côté');
v(A.zones.length === 2 && A.zones[0].cote === 'achat' && A.zones[0].n === 3 && A.zones[1].cote === 'vente' && A.zones[1].prixBas === 104 && A.zones[1].prixHaut === 106, 'zones empilées : achat 101-103, vente 104-106');
const B = analyserBougie([{ k: 0, prix: 100, vente: 5, achat: 6, n: 1 }, { k: 1, prix: 101, vente: 5, achat: 7, n: 1 }, { k: 2, prix: 102, vente: 6, achat: 6, n: 1 }]);
v(B.rows.every(r => !r.deseq && !r.empile) && B.zones.length === 0, 'équilibre : aucun déséquilibre signalé');
const C = analyserBougie([{ k: 0, prix: 100, vente: 1, achat: 0, n: 1 }, { k: 1, prix: 101, vente: 0, achat: 100, n: 1 }, { k: 2, prix: 102, vente: 0, achat: 90, n: 1 }]);
v(C.rows.find(r => r.prix === 100).deseq == null, 'une case très faible (1 contre 100 de volume maximal) n’est pas un déséquilibre');
v(analyserBougie([]) === null && analyserBougie(null) === null, 'bougie sans niveaux : pas d’analyse');
v(ligneDuPrix(A, 102.4, 1).prix === 102 && ligneDuPrix(A, 99, 1) === null, 'case sous le curseur');
v(surNiveau(102, 1, [{ prix: 102.3, reactions: 3 }]).reactions === 3 && surNiveau(102, 1, [{ prix: 103, reactions: 3 }]) == null && surNiveau(102, 1, null) == null, 'niveau de réaction dans la case [prix, prix + pas[');
v(intensite(5, 10) === 0.5 && intensite(20, 10) === 1 && intensite(1, 0) === 0, 'intensité 0..1');

/* store : index, mois, état des bougies */
const T0 = Date.UTC(2026, 10, 18), gzJson = o => zlib.gzipSync(Buffer.from(JSON.stringify(o)));
const index = { actifs: { or: { debut: '2025-12-11', dernier: '2026-11-19', fin: 0.5, tailles: { H1: [0.5, 1, 2], H4: [1, 2, 5], J: [2, 5, 10] }, mois: { H1: ['2026-11'], H4: ['2026-11'], J: ['2026-11'] }, jours: 340, trous: 0 } } };
const appels = []; const fetchFn = async url => {
  appels.push(url); if (/index\.json/.test(url)) return { ok: true, status: 200, json: async () => index };
  if (/or\/H1\/0\.5\/2026-11\.json\.gz/.test(url)) { const b = gzJson({ pas: 0.5, u: 'H1', b: [[T0 / 1000, [[8290, 2, 4, 3]]]] }); return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; }
  return { ok: false, status: 404 };
};
let rafraichi = 0; const S = creerStoreFootprint({ base: 'http://x/', fetchFn, surChange: () => { rafraichi++; } });
await S.chargerIndex(); v(S.indexPret() && S.info('or').debut === '2025-12-11' && S.info('btc') === null, 'index chargé ; actif absent → null');
v(S.assurer('or', 'H1', 0.5, T0, T0 + H) === false, 'mois pas encore chargé : assurer() lance le chargement et répond « pas prêt »');
for (let k = 0; k < 40 && !S.assurer("or", "H1", 0.5, T0, T0 + H); k++) await new Promise(r => setTimeout(r, 100)); v(S.assurer('or', 'H1', 0.5, T0, T0 + H) === true && S.cases('or', 'H1', 0.5, T0)[0][0] === 8290, 'mois chargé (gzip) : cases de la bougie');
const nAppels = appels.length; S.assurer('or', 'H1', 0.5, T0, T0 + H); v(appels.length === nAppels, 'un mois n’est jamais rechargé');
v(S.assurer('or', 'H1', 0.5, Date.UTC(2025, 5, 1), Date.UTC(2025, 5, 2)) === true && appels.length === nAppels, 'mois hors de l’archive : aucune requête inutile (404 évités)');
v(S.etatBougie('or', 'H1', Date.UTC(2025, 5, 1)).code === 'avant' && /pas d’empreinte disponible/.test(S.etatBougie('or', 'H1', Date.UTC(2025, 5, 1)).texte) && /2025-12-11/.test(S.etatBougie('or', 'J', Date.UTC(2025, 11, 10)).texte), 'bougie avant le début de l’archive : mention claire, avec la date de début');
v(S.etatBougie('or', 'H4', Date.UTC(2026, 11 - 1, 20, 8)).code === 'direct' && S.etatBougie('or', 'H1', T0).code === 'archive', 'jour en cours → direct ; jour archivé → archive');
v(S.etatBougie('us100', 'H1', T0).code === 'actif' && S.etatBougie('us100', 'H1', T0).texte === TEXTE_ABSENT, 'actif sans transactions gratuites : « pas d’empreinte disponible pour cette période ou cet actif »');
v(nomTaille(0.5) === '0.5' && nomTaille(5) === '5', 'nom de dossier d’une taille');
const Sx = creerStoreFootprint({ base: 'http://x/', fetchFn: async () => { throw new Error('réseau coupé'); } }); await Sx.chargerIndex(); v(!Sx.indexPret() && /réseau coupé/.test(Sx.erreurIndex()) && /injoignable/.test(Sx.etatBougie('or', 'H1', T0).texte), 'archive injoignable : dit clairement, rien d’inventé');

/* direct */
const L = creerLive(0.5); v(L.depuis() == null && L.partielle('H1', T0) === true && L.casesBougie('H1', T0) === null, 'direct vide : bougie partielle, aucune case');
L.ajouterTrade({ t: T0 + 5 * H + 1000, prix: 4145.2, qte: 3, cote: 'achat', id: 500 }); L.ajouterTrade({ t: T0 + 5 * H + 2000, prix: 4145.1, qte: 2, cote: 'vente', id: 501 });
v(L.depuis() === T0 + 5 * H + 1000 && L.premierId() === 500, 'première transaction du flux : début de l’écoute et premier identifiant');
const c1 = L.casesBougie('H1', T0 + 5 * H); v(c1.length === 1 && c1[0][0] === 8290 && c1[0][1] === 2 && c1[0][2] === 3 && c1[0][3] === 2, 'direct : vendeurs 2, acheteurs 3, 2 transactions (case 0,5 $)');
const maint = T0 + 6 * H + 5000;
v(L.partielle('H1', T0 + 5 * H, maint) === true && L.partielle('H1', T0 + 6 * H, maint) === false, 'heure ouverte avant le début de l’écoute : partielle ; l’heure suivante : complète');
v(L.casesBougie('H4', T0 + 4 * H) && L.casesBougie('H4', T0 + 4 * H)[0][3] === 2 && L.casesBougie('J', T0)[0][3] === 2, 'H4 et Daily construits depuis les heures reçues');
v(L.partielle('H4', T0 + 4 * H, maint) === true && L.heuresAFaire('H4', T0 + 4 * H, maint).length === 2, 'bougie H4 commencée avant l’écoute : partielle, 2 heures à rattraper (4 h et 5 h)');

/* rattrapage REST d'une heure : simule l'API (fenêtre startTime / endTime, 1 000 transactions par page) */
const faux = (h, n) => async url => { const q = new URL(url).searchParams, a = +q.get('startTime'), b = +q.get('endTime'); const L = Array.from({ length: n }, (_, i) => ({ a: i + 1, p: '4145', q: '1', T: h + 10 + i, m: i % 2 === 0 })).filter(x => x.T >= a && x.T <= b).slice(0, 1000); return { ok: true, status: 200, json: async () => L }; };
const h5 = T0 + 5 * H, L2 = creerLive(0.5); L2.ajouterTrade({ t: h5 + 2500, prix: 4145, qte: 1, cote: 'achat', id: 9000 });   // l'écoute a commencé à h5 + 2 500 ms : 2 490 transactions passées avant
const rr = await rattraperHeure(L2, 'XAUUSDT', h5, { fetchFn: faux(h5, 3000) });
const tot2 = L2.casesBougie('H1', h5).reduce((s, x) => s + x[1] + x[2], 0); v(rr.complet === true && rr.pages === 3 && Math.abs(tot2 - 2491) < 1e-9 && L2.partielle('H1', h5, h5 + 10 * 60e3) === false, 'rattrapage : l’heure en cours est complétée sans double compte (2 490 + 1 flux), 3 pages');
const L3 = creerLive(0.5); L3.ajouterTrade({ t: h5 + 5000, prix: 4145, qte: 1, cote: 'achat', id: 9000 });
const r3 = await rattraperHeure(L3, 'XAUUSDT', h5, { fetchFn: faux(h5, 3000), pagesMax: 2 }); v(r3.complet === false && L3.partielle('H1', h5, h5 + 10 * 60e3) === true, 'rattrapage plafonné : l’heure reste « partielle » (dit)');
let refus = null; try { await rattraperHeure(L3, 'XAUUSDT', h5, { fetchFn: async () => ({ ok: false, status: 429 }) }); } catch (e) { refus = e.status; } v(refus === 429, 'erreur 429 de l’API : exception avec le code (le rattrapage s’arrête)');
/* file : heures les plus récentes d'abord, arrêt sur 429, plafond de pages */
const L4 = creerLive(0.5); L4.ajouterTrade({ t: h5 + 3 * H + 500, prix: 4145, qte: 1, cote: 'achat', id: 1 });
const ordre = []; const R = creerRattrapage(L4, 'XAUUSDT', { fetchFn: async url => { ordre.push(+new URL(url).searchParams.get('startTime')); return { ok: true, json: async () => [] }; }, pause: 0 });
R.demander([h5, h5 + 2 * H, h5 + 3 * H]); await new Promise(r => setTimeout(r, 100));
v(ordre.join() === [h5 + 3 * H, h5 + 2 * H, h5].join() && R.etat.faites === 3 && L4.partielle('H1', h5, h5 + 3 * H + 1000) === false && L4.partielle('H1', h5 + 2 * H, h5 + 3 * H + 1000) === false, 'file de rattrapage : heures récentes d’abord, toutes complétées');
const L5 = creerLive(0.5); L5.ajouterTrade({ t: h5 + 3 * H, prix: 4145, qte: 1, cote: 'achat', id: 1 }); const R5 = creerRattrapage(L5, 'X', { fetchFn: async () => ({ ok: false, status: 429 }), pause: 0 }); R5.demander([h5]); await new Promise(r => setTimeout(r, 50));
v(R5.etat.arrete === true && /429/.test(R5.etat.erreur) && R5.etat.faites === 0, 'file : arrêt sur 429, erreur gardée');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
