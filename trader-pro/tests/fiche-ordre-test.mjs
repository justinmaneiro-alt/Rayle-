/* Tests de la fiche d'ordre XTB. node trader-pro/tests/fiche-ordre-test.mjs */
import { calculerFiche, texteFiche, htmlFiche, NOMS_XTB } from '../commun/fiche-ordre.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } }; const proche = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const sig = { dir: 1, entree: 3850, sl: 3800, tp: 3950, rr: 2 }, vp = { GOLD: { k: 85 } }, pas = { GOLD: 0.001 };
let F = calculerFiche(sig, { actif: 'or', reglages: { capital: 1000, risquePct: 1 }, vp, pas });
v(F.nom === 'GOLD' && F.sens === 'Acheter', 'nom XTB et sens'); v(F.lots === 0.002, 'taille = (1 % de 1000 €) ÷ (50 points × 85 €) arrondie vers le bas au pas : ' + F.lots); v(F.risqueReel <= F.risqueVoulu + 1e-9 && F.risqueReel > 0, 'le risque réel ne dépasse jamais le risque voulu'); v(proche(F.gainVise, F.lots * 100 * 85), 'gain visé');
F = calculerFiche({ ...sig, dir: -1, entree: 3850, sl: 3900, tp: 3750 }, { actif: 'or', reglages: { capital: 5000, risquePct: 0.5 }, vp, pas }); v(F.sens === 'Vendre' && F.lots === 0.005, 'vente : ' + F.lots + ' lot');
F = calculerFiche(sig, { actif: 'or', reglages: { risquePct: 1 }, vp, pas }); v(F.lots === null && F.manques.some(m => /capital/.test(m)), 'sans capital : pas de taille inventée, raison dite');
F = calculerFiche(sig, { actif: 'or', reglages: { capital: 1000 }, vp: {}, pas }); v(F.lots === null && F.manques.some(m => /valeur du point/.test(m)), 'sans valeur du point : pas de taille inventée');
F = calculerFiche(sig, { actif: 'or', reglages: { capital: 1000, valeursPoint: { GOLD: 90 } }, vp: {}, pas }); v(F.k === 90 && F.lots != null, 'la valeur du point saisie à la main est prise en compte');
F = calculerFiche(sig, { actif: 'or', reglages: { capital: 50, risquePct: 1 }, vp, pas }); v(F.lots === 0.001 && F.tropPetit && F.risqueReel > F.risqueVoulu, 'capital trop faible : lot minimal et avertissement sur le risque réel');
F = calculerFiche(sig, { actif: 'or', reglages: { capital: 1000 }, vp, pas, decalage: -40 }); v(proche(F.entree, 3810) && proche(F.sl, 3760) && proche(F.tp, 3910), 'décalage au comptant appliqué aux trois niveaux');
F = calculerFiche(sig, { actif: 'inconnu', reglages: { capital: 1000 }, vp, pas }); v(F.nom === null && F.manques.length >= 1, 'actif inconnu : fiche incomplète signalée');
F = calculerFiche(sig, { actif: 'btc', reglages: { capital: 1000, xtbNoms: { btc: 'BTCUSD' } }, vp: { BTCUSD: { k: 1 } }, pas: {} }); v(F.nom === 'BTCUSD', 'nom XTB modifiable dans les réglages');
F = calculerFiche(sig, { actif: 'or', reglages: { capital: 1000 }, vp, pas }); const t = texteFiche(F); v(/GOLD · Acheter · 0.0\d+ lot · entrée 3850.00 · stop loss 3800.00 · take profit 3950.00/.test(t), 'texte à copier : ' + t); const h = htmlFiche(F); v(/Instrument XTB/.test(h) && /aucun ordre/.test(h), 'html : champs et mention « aucun ordre »');
v(Object.values(NOMS_XTB).every(n => /^[A-Z0-9.]+$/.test(n)), 'noms XTB en majuscules');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
