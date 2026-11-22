/* Tests de la lecture des bougies (v11, phase 2) : formes, figures, contexte, position du prix. */
import { forme, figures, positionPrix, lireBougie, lireUnite, phraseUnite, classerDistance, semaines, atrA, SEUILS } from '../rapports/bougies.js';
let ok = 0, ko = 0; const t = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, J = 24 * H;
const B = (o, h, l, c, i = 0, v = 100) => ({ t: Date.UTC(2026, 0, 5) + i * J, o, h, l, c, v });
const plat = n => Array.from({ length: n }, (_, i) => B(100 + (i % 3) * 0.2, 101, 99, 100.4 + (i % 2) * 0.2, i));   // ATR ≈ 2
const A = 2;

/* formes */
const f1 = forme(B(100, 104, 96, 103), A); t(f1.sens === 'haussière' && f1.taille === 'très grande' && Math.abs(f1.tailleAtr - 4) < 1e-9, 'forme : haussière, 4 ATR, très grande');
t(forme(B(100, 100.5, 99.5, 100.1), A).taille === 'petite', 'forme : petite bougie');

/* figures */
const ids = (b, p, tend = 0) => figures(b, p, A, tend).map(x => x.id);
t(ids(B(100, 100.1, 95, 100.2)).includes('pin-bas'), 'pin bar haussière (longue mèche basse)');
t(figures(B(100, 100.1, 95, 100.2), null, A, -1).find(x => x.id === 'pin-bas').nom.startsWith('marteau'), 'marteau après une baisse');
t(figures(B(100, 105, 99.9, 99.8), null, A, 1).find(x => x.id === 'pin-haut').nom.startsWith('étoile filante'), 'étoile filante après une hausse');
t(ids(B(100, 102.5, 97.5, 100.1)).includes('doji'), 'doji');
t(ids(B(100, 104.1, 99.95, 104)).includes('marubozu'), 'marubozu haussier');
t(ids(B(98, 103.2, 97.8, 103), B(101, 101.4, 98.6, 99)).includes('avalement-haussier'), 'avalement haussier');
t(ids(B(103, 103.4, 97, 98), B(99, 102.5, 98.8, 102)).includes('avalement-baissier'), 'avalement baissier');
t(ids(B(100, 101, 99.5, 100.5), B(100, 103, 97, 102)).includes('inside'), 'inside bar');
t(ids(B(100, 105, 95, 102), B(100, 102, 98, 101)).includes('outside'), 'outside bar');
t(ids(B(100, 101, 99, 100.8)).length === 0 || !ids(B(100, 101, 99, 100.8)).includes('pin-bas'), 'bougie banale : pas de pin bar');
t(ids(B(100, 104, 95.5, 103)).includes('rejet-bas'), 'longue mèche de rejet basse (corps non pin)');
t(figures(B(100, 100, 100, 100), null, A)[0].id === 'plate', 'bougie plate : pas de division par zéro');

/* seuils sur / proche / loin */
t(classerDistance(0.1) === 'sur' && classerDistance(-0.25) === 'sur' && classerDistance(0.6) === 'proche' && classerDistance(-1) === 'proche' && classerDistance(1.01) === 'loin', 'seuils 0,25 et 1 ATR');
t(SEUILS.sur === 0.25 && SEUILS.proche === 1, 'seuils exposés (manuel)');

/* position du prix : les trois cas du cahier des charges */
const p1 = positionPrix(3511.7, [{ nom: 'PWL', prix: 3511, type: 'support' }, { nom: 'MA200 Daily', prix: 3620, type: 'ma200' }], 40, { dec: 0 });
t(/On est sur le support PWL 3 ?511 \(à 0,0 %\)/.test(p1.phrase), 'position : sur le support PWL — ' + p1.phrase);
const p2 = positionPrix(3580, [{ nom: 'MA200 Daily', prix: 3620 }, { nom: 'PWL', prix: 3300 }], 40, { dec: 0 });
t(/Pas loin de la résistance MA200 Daily 3 ?620 \(à 1,1 %\)/.test(p2.phrase), 'position : pas loin de la résistance — ' + p2.phrase);
const p3 = positionPrix(3550, [{ nom: 'POC', prix: 3480 }, { nom: 'PDH', prix: 3720 }], 40, { dec: 0 });
t(/Entre deux zones : support à 3 ?480 \(POC\), résistance à 3 ?720 \(PDH\)/.test(p3.phrase), 'position : entre deux zones — ' + p3.phrase);
t(!positionPrix(100, [], 2).disponible && /indisponible/.test(positionPrix(100, [], 2).phrase), 'position : sans niveau, dit « non calculable »');
t(!positionPrix(100, [{ nom: 'x', prix: 99 }], 0).disponible, 'position : ATR nul refusé');

/* contexte d'une bougie : rejet d'un support, balayage, volume */
const base = plat(30);
const serie = [...base, B(100.2, 100.4, 96.2, 100.3, 30, 260)];
const L = lireBougie(serie, 30, { atr: A, niveaux: [{ nom: 'PWL', prix: 96.5, type: 'support' }], dec: 1 });
t(L.figures.some(x => x.id === 'pin-bas') && L.contexte.some(c => c.rejet && c.role === 'support' && c.niveau === 'PWL'), 'pin bar sur support : rejet détecté');
t(/pin bar.* sur support/.test(L.etiquette), 'étiquette « pin bar sur support » — ' + L.etiquette);
t(L.volume && L.volume.lib === 'volume fort' && L.volume.relatif > 2, 'volume fort relatif à la moyenne');
const bal = lireBougie([...base, B(100.5, 103.5, 100, 100.2, 30)], 30, { atr: A, dec: 1 });
t(bal.contexte.some(c => c.balayage === 'haut') && /balayage/.test(bal.etiquette), 'balayage du plus haut puis réintégration');
const sansV = lireBougie(plat(31).map(b => ({ ...b, v: 0 })), 30, { atr: A });
t(sansV.volume === null, 'sans volume : pas de volume inventé');
const dlt = lireBougie([...base, { ...B(100, 102, 99, 101.5, 30, 200), bv: 150 }], 30, { atr: A });
t(dlt.delta && dlt.delta.sens === 'acheteur' && dlt.delta.valeur === 100, 'delta réel quand disponible');
t(lireBougie(serie, 30, { atr: A, ma200: 96.4 }).contexte.some(c => c.niveau === 'MA200'), 'la MA200 compte comme niveau de contexte');

/* unité entière */
const U = lireUnite(serie, { n: 4, niveaux: [{ nom: 'PWL', prix: 96.5 }], dec: 1, unite: 'Daily' });
t(U.disponible && U.bougies.length === 4 && U.derniere.index === 30 && U.position.disponible, 'lireUnite : 4 bougies + position');
t(lireUnite(plat(5), {}).disponible === false, 'lireUnite : pas assez de bougies → indisponible');
t(/Dernière bougie Daily : haussière.*pin bar/.test(phraseUnite(U, 'Daily', 1)) || /Dernière bougie Daily/.test(phraseUnite(U, 'Daily', 1)), 'phraseUnite parlée');
t(/indisponible/.test(phraseUnite({ disponible: false, raison: 'x' }, 'H4')), 'phraseUnite : dit l’indisponibilité');
t(lireUnite(serie, { n: 9 }).bougies.length === 5 && lireUnite(serie, { n: 1 }).bougies.length === 3, 'n borné entre 3 et 5');
t(lireUnite(serie, { enCours: true }).derniere.enCours === true, 'dernière bougie marquée « en cours »');

/* semaines : lundi → vendredi regroupés, la dernière en cours */
const jours = []; for (let i = 0; i < 12; i++) { const d = Date.UTC(2026, 0, 5) + i * J; const w = new Date(d).getUTCDay(); if (w === 0 || w === 6) continue; jours.push({ t: d, o: 100 + i, h: 110 + i, l: 90 + i, c: 101 + i, v: 10 }); }
const W = semaines(jours); t(W.length === 2 && W[0].h === 114 && W[0].l === 90 && W[0].v === 50, 'semaines : 2 semaines, extrêmes et volume corrects');
t(atrA(plat(30)).filter(x => x != null).length === 16, 'ATR : démarre après 14 bougies');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `bougies : tout passe (${ok})`); process.exit(ko ? 1 : 0);
