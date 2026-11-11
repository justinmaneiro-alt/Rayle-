import * as F from '../front/or/fleches-terminal-v1.js';
let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; };
const H = 3600e3, T0 = 1.7e12 - (1.7e12 % H);
const bar = (i, c, w = 0.5, o = c) => ({ t: T0 + i * H, o, h: Math.max(o, c) + w, l: Math.min(o, c) - w, c, v: 10 });
const plat = (n, c = 100) => Array.from({ length: n }, (_, i) => bar(i, c + (i % 2 ? 0.2 : -0.2)));
const maintenant = B => B[B.length - 1].t + 2 * H;
const sans = { jours: null, avecNiveaux: false };

/* ── A. MA200 : cassure puis confirmation (trois clôtures au-dessus) ── */
let B = plat(241); for (let k = 0; k < 6; k++) B.push(bar(241 + k, 103 + k * 0.3, 0.5, 103 + k * 0.3));
let r = F.calculer(B, { ...sans, maintenant: maintenant(B) });
const cass = r.fleches.filter(f => f.type === 'ma_cassure'), ret = r.fleches.filter(f => f.type === 'ma_retour');
v(cass.length === 1 && cass[0].dir === 1 && cass[0].i === 241, 'cassure haussière de la MA200 posée sur la bougie qui clôture au-delà');
v(cass[0] && cass[0].tCloture === B[241].t + H, 'la flèche est posée à la clôture de la bougie (t + 1 h)');
v(ret.length === 1 && ret[0].dir === 1 && ret[0].i > 241, 'cassure confirmée (retour) plus tard, jamais sur la même bougie');
v(cass[0] && /haussière/.test(cass[0].nom) && /MA200/.test(cass[0].nom), 'libellé en français clair');

/* ── fausse cassure : retour du côté d'origine ── */
let Bf = plat(241); Bf.push(bar(241, 103, 0.5, 100)); Bf.push(bar(242, 99.6, 0.5, 103)); Bf.push(bar(243, 99.5)); Bf.push(bar(244, 99.4));
r = F.calculer(Bf, { ...sans, maintenant: maintenant(Bf) });
const fa = r.fleches.filter(f => f.type === 'ma_fausse');
v(fa.length === 1 && fa[0].dir === -1 && /Fausse cassure/.test(fa[0].nom), 'fausse cassure haussière : flèche dans le sens du retour (baissière)');

/* ── cassure baissière ── */
let Bb = plat(240); for (let k = 0; k < 4; k++) Bb.push(bar(240 + k, 97 - k * 0.2, 0.5, 97 - k * 0.2));
r = F.calculer(Bb, { ...sans, maintenant: maintenant(Bb) });
v(r.fleches.some(f => f.type === 'ma_cassure' && f.dir === -1), 'cassure baissière de la MA200');

/* ── B. rebond sur une zone tracée : touche puis réaction ≥ 0,5 ATR ── */
const desc = []; for (let i = 0; i < 40; i++) desc.push(bar(i, 60 - i * 0.2, 0.5, 60 - i * 0.2));   // descente lente : ATR ≈ 1
desc.push(bar(40, 52.1, 0.4, 52.2), bar(41, 51.9, 0.4, 52.1));
const touche = { t: T0 + 42 * H, o: 52, h: 52.2, l: 51.1, c: 52.0, v: 10 };   // mèche à 51,1 ≤ 51,25 ; clôture 52,0 = +1,0 au-dessus du bord
desc.push(touche);
const zone = { id: 'z1', type: 'zone', bas: 50, haut: 51, cree: T0, etiquette: 'ma zone' };
r = F.calculer(desc, { ...sans, objets: [zone], maintenant: maintenant(desc) });
const zr = r.fleches.filter(f => f.type === 'zone_rebond');
v(zr.length === 1 && zr[0].dir === 1 && zr[0].i === 42, 'rebond sur une zone tracée : touche suivie d’une réaction ≥ 0,5 ATR → flèche haussière');
v(zr[0] && /ma zone/.test(zr[0].nom), 'le nom de la zone figure dans la flèche');

const faible = desc.slice(0, 42).concat([{ t: T0 + 42 * H, o: 51.4, h: 51.5, l: 51.1, c: 51.3, v: 10 }]);
r = F.calculer(faible, { ...sans, objets: [zone], maintenant: maintenant(faible) });
v(r.fleches.filter(f => f.type === 'zone_rebond').length === 0, 'touche sans réaction de 0,5 ATR : aucune flèche');
const trav = desc.slice(0, 42).concat([{ t: T0 + 42 * H, o: 51.5, h: 51.6, l: 49.0, c: 49.5, v: 10 }]);
r = F.calculer(trav, { ...sans, objets: [zone], maintenant: maintenant(trav) });
v(r.fleches.filter(f => f.type === 'zone_rebond').length === 0, 'clôture à travers la zone : pas de rebond');
const tard = { ...zone, cree: T0 + 50 * H };
r = F.calculer(desc, { ...sans, objets: [tard], maintenant: maintenant(desc) });
v(r.fleches.filter(f => f.type === 'zone_rebond').length === 0, 'une zone tracée après coup ne produit pas de flèche dans le passé');
const ligne = { id: 'h1', type: 'horizontale', p: 50.6, cree: T0, etiquette: 'ligne' };
r = F.calculer(desc, { ...sans, objets: [ligne], maintenant: maintenant(desc) });
v(r.fleches.filter(f => f.type === 'zone_rebond').length <= 1, 'une ligne horizontale est traitée comme une fine zone');

/* ── résistance : arrivée par le bas, réaction vers le bas ── */
const mont = []; for (let i = 0; i < 40; i++) mont.push(bar(i, 40 + i * 0.25, 0.5, 40 + i * 0.25));
mont.push(bar(40, 49.8, 0.4, 49.6), bar(41, 50.1, 0.4, 49.8), { t: T0 + 42 * H, o: 50, h: 50.9, l: 49.8, c: 49.9, v: 10 });
const res = { id: 'z2', type: 'zone', bas: 51, haut: 52, cree: T0, etiquette: 'résistance' };
r = F.calculer(mont, { ...sans, objets: [res], maintenant: maintenant(mont) });
v(r.fleches.some(f => f.type === 'zone_rebond' && f.dir === -1), 'rebond baissier sur une résistance (arrivée par le bas)');

/* ── causalité : l'ajout de bougies futures ne change jamais une flèche déjà posée ── */
const long = B.concat(Array.from({ length: 30 }, (_, k) => bar(247 + k, 105 - (k % 5) * 0.3)));
const court = F.calculer(B, { ...sans, maintenant: maintenant(B) }).fleches, plus = F.calculer(long, { ...sans, maintenant: maintenant(long) }).fleches;
v(court.length > 0 && court.every(f => plus.some(g => g.id === f.id && g.t === f.t && g.dir === f.dir && g.prix === f.prix)), 'aucun repaint : les flèches du passé sont identiques quand de nouvelles bougies arrivent');

/* ── C. résultat mesuré à 6, 12 et 24 bougies ── */
const Rs = F.calculer(long, { ...sans, maintenant: maintenant(long) }).fleches.find(f => f.type === 'ma_cassure');
v(Rs && Rs.resultat[6] && Rs.resultat[12] && Rs.resultat[24], 'résultat mesuré à 6, 12 et 24 bougies quand elles sont closes');
v(F.calculer(B, { ...sans, maintenant: maintenant(B) }).fleches.find(f => f.type === 'ma_cassure').resultat[24] === null, 'moins de 24 bougies closes après la flèche : « en cours » (null), jamais une valeur inventée');
v(F.textesResultat({ 6: null, 12: null, 24: null }).every(t => /en cours/.test(t)), 'texte « en cours » pour un résultat pas encore mesurable');
const ouverte = B.concat([{ t: B[B.length - 1].t + H, o: 100, h: 130, l: 100, c: 130, v: 1 }]);
v(F.calculer(ouverte, { ...sans, maintenant: B[B.length - 1].t + H + 1000 }).n === B.length, 'la bougie en cours n’entre jamais dans le calcul');

/* ── registre en ajout seul ── */
const reg = [{ id: 'ancienne', type: 'ma_cassure', dir: 1, t: 1, i: 1, resultat: null }], fus = F.fusionnerRegistre(reg, [{ id: 'nouvelle', type: 'ma_rebond', dir: 1, t: 2, i: 2, resultat: { 6: null } }]);
v(fus.length === 2 && fus.some(f => f.id === 'ancienne'), 'registre : une flèche déjà posée n’est jamais retirée');
v(F.fusionnerRegistre([{ id: 'a', t: 1, dir: 1, prix: 5, resultat: null }], [{ id: 'a', t: 1, dir: -1, prix: 9, resultat: { 6: { fav: 1, adv: 0, clot: 1 } } }]).find(f => f.id === 'a').dir === 1, 'registre : la position et la direction ne changent jamais, seul le résultat s’enrichit');
const peu = F.calculer(plat(10), { jours: null });
v(peu.fleches.length === 0 && /seulement/.test(peu.raison), 'trop peu de bougies : message honnête, pas de flèche');
const r30 = F.calculer(long, { jours: 30, maintenant: maintenant(long), avecNiveaux: false }), rTout = F.calculer(long, { ...sans, maintenant: maintenant(long) });
v(r30.fleches.length <= rTout.fleches.length, 'filtre des 30 derniers jours');

/* ── niveaux majeurs : s'exécute sans erreur sur une longue série ── */
const longue = Array.from({ length: 24 * 70 }, (_, i) => bar(i, 100 + 5 * Math.sin(i / 20) + (i % 3) * 0.3, 0.8));
let okn = true, rn; try { rn = F.calculer(longue, { jours: 30, maintenant: maintenant(longue) }); } catch (e) { okn = false; console.log(e); }
v(okn && Array.isArray(rn.fleches), 'niveaux majeurs + MA sur 70 jours de H1 : calcul sans erreur');
v(okn && rn.fleches.every(f => Number.isFinite(f.t) && (f.dir === 1 || f.dir === -1) && f.nom), 'chaque flèche a un instant, une direction et un nom');
v(okn && rn.fleches.some(f => f.type === 'niveau_rebond') , 'sur une oscillation régulière, au moins un rebond sur un niveau majeur est détecté');
const bil = F.bilan(rn.fleches); v(Object.values(bil).every(x => x.n >= 1), 'bilan par type');
process.exit(ko ? 1 : 0);
