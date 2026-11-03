/* Tests purs de l'affichage (sans navigateur) : formats, copie brute, longueur des traits, étiquettes sans chevauchement, alertes. */
import { fmtPrix, fmtCopie, copiePrix, copieQte, fmtUSD, fmtQte } from '../commun/format.js';
import { longueurTrait, etendueTrait, N_MIN, N_MAX } from '../commun/traits.js';
import { messageAlerte } from '../commun/messages.js';
import { texteToutCopier } from '../front/carte-alerte.js';
import { placerEtiquettes, indiceLogique } from '../front/graphique.js';
import { htmlPositions, htmlPortefeuille } from '../front/panneaux.js';

let ok = 0, ko = 0;
const t = (nom, f) => { try { f(); ok++; } catch (e) { ko++; console.log('ÉCHEC', nom, '→', e.message); } };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); };
const vrai = (c, m) => { if (!c) throw new Error(m || 'faux'); };

t('format de copie brut : 2263.56, sans espace ni virgule', () => {
  eq(copiePrix('ETH', 2263.56), '2263.56'); eq(copiePrix('BTC', 77400), '77400'); eq(copieQte('ETH', 8.169), '8.169'); eq(copieQte('BTC', 0.1075), '0.1075');
  eq(fmtCopie(1234567.891, 2), '1234567.89'); vrai(!/[ , ]/.test(copiePrix('BTC', 1234567)), 'aucun séparateur');
});
t('affichage français : 2 263,56', () => { eq(fmtPrix('ETH', 2263.56), '2 263,56'); eq(fmtQte('ETH', 8.169), '8,169'); eq(fmtUSD(-56.4, 0), '−56 $'); });
t('longueur des traits : N = arrondi(|TP − entrée| / ATR × 1,5), borné 8..40', () => {
  eq(longueurTrait(100, 120, 2), 15); eq(longueurTrait(100, 101, 2), N_MIN); eq(longueurTrait(100, 400, 2), N_MAX); eq(longueurTrait(100, 120, 0), N_MIN);
});
t('traits : suivent la bougie actuelle + 3 si la position dure ; s’arrêtent à la sortie sinon', () => {
  eq(etendueTrait({ indexEntree: 10, n: 8, indexActuel: 30, ouverte: true })[1], 33);
  eq(etendueTrait({ indexEntree: 10, n: 8, indexActuel: 12, ouverte: true })[1], 18);
  eq(etendueTrait({ indexEntree: 10, n: 20, indexActuel: 40, ouverte: false, indexSortie: 14 })[1], 15);
});
t('étiquettes jamais superposées', () => {
  const l = placerEtiquettes([{ x: 10, y: 100, w: 80 }, { x: 20, y: 105, w: 80 }, { x: 30, y: 108, w: 80 }, { x: 400, y: 104, w: 50 }], 16, 600);
  const memeColonne = l.filter(e => e.x < 200).sort((a, b) => a.y - b.y);
  for (let i = 1; i < memeColonne.length; i++) vrai(memeColonne[i].y >= memeColonne[i - 1].y + 16, 'chevauchement');
  eq(l.find(e => e.x === 400).y, 104, 'une étiquette éloignée ne bouge pas');
  const bas = placerEtiquettes([{ x: 0, y: 590, w: 10 }, { x: 0, y: 595, w: 10 }], 16, 600); vrai(bas.every(e => e.y + 16 <= 600), 'reste dans le cadre');
});
t('indice logique : interpolé et extrapolé', () => {
  const d = [{ time: 0 }, { time: 900 }, { time: 1800 }];
  eq(indiceLogique(d, 900e3, 900e3), 1); eq(indiceLogique(d, 2700e3, 900e3), 3); eq(indiceLogique(d, 450e3, 900e3), 0.5);
});
const tr = { id: 'x', actif: 'ETH', sens: 'vente', entree: 2263.5, stop: 2276.1, objectif: 2235.9, quantite: 8.169, rr: 2.2, validJusqu: Date.UTC(2026, 10, 3, 16, 45), pourquoi: 'repoussé du VAH', tSignal: 0, statut: 'propose' };
t('alerte Telegram : format demandé', () => {
  const m = messageAlerte('proposition', tr).split('\n');
  eq(m[1], '▼ VENTE ETH · M15'); vrai(/^Quantité 8,169 ETH \(≈ 18 491 \$\)$/.test(m[2]), m[2]); vrai(m[3].startsWith('Entrée 2 263,50 · Stop 2 276,10 · Objectif 2 235,90'), m[3]);
  vrai(/^R:R 1:2,2 · valable jusqu’à 17:45$/.test(m[4]), m[4]); eq(m[5], 'Pourquoi : repoussé du VAH');
  const s = messageAlerte('sortie', Object.assign({}, tr, { prixEntree: 2263.5, tSortie: 1, prixSortie: 2235.9, raison: 'objectif', r: 2.04, pnl: 205.71 }));
  vrai(s.includes('Résultat réel : +2,04 R · +205,71 $'), s);
});
t('carte : « Tout copier » en format brut', () => { eq(texteToutCopier(tr), 'VENTE ETH\nQuantite 8.169\nEntree 2263.50\nStop 2276.10\nObjectif 2235.90'); });
t('même état = même affichage (PC et téléphone utilisent les mêmes fonctions)', () => {
  const etat = { compte: { capital: 10035.43, realise: 0, flottant: 35.43, capitalRealise: 10000, risqueParTradeUSD: 50, risquePct: 0.5, semaine: { pnl: 35.43, pct: 0.35, objectifPct: 2, depuisDemarrage: true }, baisse: { maxUSD: 0, maxPct: 0, actuellePct: 0, limitePct: 6, mode: 'statique', depassee: false },
    positions: [{ id: 'x', quantite: 8.169, entree: 2263.5, prix: 2259.2, pnl: 35.13, r: 0.7, stop: 2276.1, objectif: 2235.9, dureeMs: 60000 }], totalOuvert: { pnl: 35.43, risqueUSD: 102.93, risquePct: 1.02, levier: 1.84 } },
    trades: { enCours: [Object.assign({}, tr, { statut: 'ouvert' })] }, statut: 'PAS ENCORE PROUVÉ' };
  const a = htmlPositions(etat) + htmlPortefeuille(etat, null), b = htmlPositions(JSON.parse(JSON.stringify(etat))) + htmlPortefeuille(JSON.parse(JSON.stringify(etat)), null);
  eq(a, b); vrai(a.includes('10 035,43 $') && a.includes('+35,13 $'), 'chiffres du moteur affichés tels quels');
});
console.log(`front : ${ok} réussis, ${ko} échoués`); if (ko) process.exitCode = 1;
