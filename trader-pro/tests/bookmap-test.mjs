/* Tests purs du Bookmap (v12, phase 2). Usage : node trader-pro/tests/bookmap-test.mjs */
import { palierBookmap, creerCarnetLocal, creerGrille, creerBulles, seuilAuto, rayonBulle, paletteChaleur, referenceContraste, intensite, dureeConseillee } from '../volume/bookmap-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };

/* palier */
v(palierBookmap(60000, 'btc') === 1 && palierBookmap(140, 'sol') === 0.01 && palierBookmap(3550, 'or') === 0.1, 'palier : BTC 1 $, SOL 0,01, or 0,1 (jamais sous le pas de cotation)');
v(palierBookmap(60000, 'btc') >= 0.1 && palierBookmap(1, 'sol') >= 0.01, 'palier : jamais sous le pas de cotation');

/* carnet local : méthode officielle (instantané + différences) */
const C = creerCarnetLocal();
v(C.evenement({ U: 98, u: 99, pu: 97, b: [['100', '9']], a: [] }) === 'attente', 'carnet : avant l’instantané, les événements sont mis en attente');
v(C.evenement({ U: 100, u: 102, pu: 99, b: [['100', '5']], a: [['101', '2']] }) === 'attente', 'carnet : (suite)');
v(C.evenement({ U: 103, u: 104, pu: 102, b: [['99', '4']], a: [] }) === 'attente', 'carnet : (suite)');
v(C.instantane({ lastUpdateId: 101, bids: [['100', '1'], ['98', '3']], asks: [['101', '1'], ['103', '7']] }) === 'ok' && C.pret(), 'carnet : instantané accepté, événements rejoués');
const m = C.meilleurs(); v(m.bid === 100 && m.ask === 101 && m.mid === 100.5, 'carnet : meilleurs prix après rejeu : ' + JSON.stringify(m));
v(C.niveaux(1).niveaux.find(x => x.bin === 100).qte === 5 && C.niveaux(1).niveaux.find(x => x.bin === 99).qte === 4, 'carnet : quantités remplacées par les différences (100 → 5, 99 → 4)');
v(C.evenement({ U: 105, u: 105, pu: 104, b: [['100', '0']], a: [] }) === 'ok' && C.meilleurs().bid === 99, 'carnet : quantité 0 = niveau retiré');
v(C.evenement({ U: 107, u: 107, pu: 106, b: [], a: [] }) === 'resync' && !C.pret() && C.resyncs() === 1, 'carnet : un trou (pu ≠ u précédent) demande une resynchronisation');
v(creerCarnetLocal().instantane({ lastUpdateId: 5, bids: [['1', '1']], asks: [['2', '1']] }) === 'ok', 'carnet : instantané sans événement');
const C2 = creerCarnetLocal(); C2.evenement({ U: 500, u: 510, pu: 499, b: [], a: [] }); v(C2.instantane({ lastUpdateId: 100, bids: [], asks: [] }) === 'resync', 'carnet : instantané trop ancien par rapport aux événements → resynchronisation');
const C3 = creerCarnetLocal(); C3.instantane({ lastUpdateId: 100, bids: [['10', '1']], asks: [['11', '1']] }); v(C3.evenement({ U: 50, u: 60, pu: 49, b: [['10', '99']], a: [] }) === 'ok' && C3.niveaux(1).niveaux.find(x => x.bin === 10).qte === 1, 'carnet : un événement plus vieux que l’instantané est ignoré');
v(C3.evenement({ U: 101, u: 103, pu: 100, b: [['10', '4']], a: [] }) === 'ok' && C3.niveaux(1).niveaux.find(x => x.bin === 10).qte === 4, 'carnet : premier événement après l’instantané');

/* grille */
const G = creerGrille({ palier: 1, binMs: 1000, dureeMs: 5000 });
G.ajouter(100, [{ bin: 100, qte: 3, cote: 'b' }, { bin: 102, qte: 8, cote: 'a' }], 0); G.ajouter(100, [{ bin: 100, qte: 5, cote: 'b' }], 400); G.ajouter(100, [{ bin: 100, qte: 1, cote: 'b' }], 800);
G.ajouter(101, [{ bin: 100, qte: 2, cote: 'b' }], 1000); G.ajouter(101, [{ bin: 101, qte: 6, cote: 'b' }], 2100);
const cols = G.colonnes();
v(cols.length === 2 && cols[0].q[0] === 5 && cols[0].q[2] === 8, 'grille : une colonne par seconde, la quantité MAXIMALE vue pendant la seconde est gardée');
const X = G.matrice(3000, 1000, 3, 100, 102);
v(X.nRows === 3 && X.M[(102 - 102) * 3 + 0] === 8 && X.M[(102 - 100) * 3 + 0] === 5 && X.M[(102 - 101) * 3 + 2] === 6, 'matrice : cases aux bons niveaux et aux bonnes colonnes (dont la colonne en cours)');
v(X.mids[0] === 100 && X.mids[1] === 101, 'matrice : ligne de prix (milieu) par colonne');
const G2 = creerGrille({ palier: 1, binMs: 1000, dureeMs: 3000 }); for (let i = 0; i < 400; i++) G2.ajouter(100, [{ bin: 100, qte: 1, cote: 'b' }], i * 1000); v(G2.colonnes().length <= 60, 'grille : la mémoire est bornée à la durée gardée (' + G2.colonnes().length + ' colonnes)');
const G3 = creerGrille({ palier: 1, binMs: 1000, dureeMs: 3600e3 }); G3.ajouter(100, [{ bin: 100, qte: 2, cote: 'b' }], 10000); G3.ajouter(100, [], 11500);
G3.inserer([{ t: 1000, mid: 99, i0: 99, q: Float32Array.of(7), n: 1 }, { t: 12000, mid: 1, i0: 1, q: Float32Array.of(1), n: 1 }]);
v(G3.colonnes()[0].t === 1000 && G3.colonnes().length === 2, 'grille : le stockage ne s’insère qu’AVANT les colonnes actuelles (aucun doublon)');
v(G3.couverture() >= 10000, 'grille : couverture en durée');
const vide = creerGrille({ palier: 1 }).matrice(1000, 1000, 3, 0, 2); v(vide.M.every(x => x === 0), 'matrice : grille vide = que des zéros');

/* bulles */
const Bu = creerBulles(); for (let i = 0; i < 50; i++) Bu.ajouter({ t: i * 100, prix: 100, qte: 1 + (i % 10) * 0.1, cote: i % 2 ? 'achat' : 'vente' }, 0);
const sa = seuilAuto(Bu.tailles()); v(sa > 1.5 && sa <= 1.9, 'seuil auto : 97,5e centile des tailles récentes (' + sa + ')');
v(seuilAuto([1, 2, 3]) === 0, 'seuil auto : moins de 20 transactions → 0 (rien d’inventé)');
v(Bu.visibles(0, 5000, 1.8).every(b => b.q >= 1.8) && Bu.visibles(0, 5000, 1.8).length >= 5, 'bulles : seulement celles au-dessus du seuil réglé');
v(Bu.ajouter({ t: 9999, prix: 1, qte: 0.001, cote: 'achat' }, 0.5) === false, 'bulles : sous le seuil minimal, la transaction n’est pas gardée');
v(rayonBulle(1, 1) < rayonBulle(4, 1) && rayonBulle(1e9, 1) <= 30 && rayonBulle(0, 1) >= 3, 'rayon : croît avec le volume, borné de 3 à 30 pixels');

/* palette et contraste */
const P = paletteChaleur(); v(P.length === 768 && P[0] === 0 && P[1] === 0 && P[2] === 0 && P[767] === 255 && P[766] === 255, 'palette : noir (peu) → blanc (beaucoup)');
v(P[3 * 128 + 1] > P[3 * 40 + 1], 'palette : monotone en luminosité (le vert augmente)');
const M = new Float32Array(1000); M[10] = 1e6; for (let i = 20; i < 400; i++) M[i] = i; const ref = referenceContraste(M);
v(ref > 0 && ref < 1e6, 'contraste : le 98e centile ignore une case géante (' + ref + ')');
v(intensite(0, ref) === 0 && intensite(ref * 10, ref) === 1 && intensite(ref / 2, ref, 2) > intensite(ref / 2, ref, 1), 'intensité : 0 sans quantité, plafonnée à 1, le contraste l’augmente');

/* durée gardée */
const H = 3600e3;
v(dureeConseillee({ memoireGo: 8 }) === 6 * H && dureeConseillee({ memoireGo: 4 }) === 3 * H && dureeConseillee({ memoireGo: 2 }) === 1.5 * H && dureeConseillee({ memoireGo: 1 }) === H, 'durée : 6 h (≥ 8 Go), 3 h (≥ 4), 1 h 30 (2 Go), 1 h (moins)');
v(dureeConseillee({}) === 2 * H, 'durée : mémoire inconnue (Safari, Firefox) → 2 h');
v(dureeConseillee({ memoireGo: 8, quotaOctets: 200e6, usageOctets: 150e6 }) <= H, 'durée : limitée par l’espace libre (5 % au plus)');

console.log(ko ? `bookmap-test : ${ko} échec(s)` : `bookmap-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
