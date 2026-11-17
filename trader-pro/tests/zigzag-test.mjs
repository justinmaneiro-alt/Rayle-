/* Tests des flèches Daily (zigzag ATR) : node trader-pro/tests/zigzag-test.mjs */
import { zigzag, cloturees, fusionnerRegistre, idFleche, styleFleche, indexSurUnite, niveauParle, phraseFleche, multDe, ESPACE_MIN, MULT_DEFAUT, OPACITE_PALE, J } from '../terminal/zigzag-daily.js';
import { flechesDe, nouvellesFleches, lireReglages, ecrireReglages, multActif, lireRegistre, barresDaily } from '../terminal/fleches-registre.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const T0 = Date.UTC(2022, 0, 3);
let graine = 11; const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296 - 0.5; };
/* marche au hasard à inertie (swings de tailles variées) avec une tendance haussière puis baissière : de quoi avoir des flèches pleines ET pâles */
function serie(n, base = 1000) { const B = []; let p = base, vit = 0; for (let i = 0; i < n; i++) { const o = p; vit = vit * 0.88 + alea() * 9; p = Math.max(20, p + vit + (i < n / 2 ? 0.9 : -0.9)); const h = Math.max(o, p) + Math.abs(alea()) * 5, l = Math.min(o, p) - Math.abs(alea()) * 5; B.push({ t: T0 + i * J, o, h, l, c: p }); } return B; }
const B = serie(900), F = zigzag(B);
v(F.length > 20, `la série de test produit des flèches (${F.length})`);
v(F.every((f, k) => k === 0 || f.dir !== F[k - 1].dir), 'alternance stricte : jamais deux flèches du même sens d’affilée');
v(F.every((f, k) => k === 0 || f.i - F[k - 1].i >= ESPACE_MIN), `au moins ${ESPACE_MIN} bougies entre deux flèches`);
v(F.every(f => f.iConf >= f.i && f.tCloture === B[f.iConf].t + J && f.t === B[f.i].t), 'la flèche est sur la bougie extrême, confirmée à la clôture d’une bougie existante');
v(F.every(f => f.niveau === (f.dir < 0 ? B[f.i].h : B[f.i].l)), 'niveau = mèche du sommet (plus haut) ou du creux (plus bas)');
/* extrême réel : entre deux flèches (à 5 bougies de la précédente), aucune bougie plus haute (sommet) / plus basse (creux), sauf rares sommets déjà confirmés puis dépassés */
let faux = 0; F.forEach((f, k) => { const a = k ? F[k - 1].i + ESPACE_MIN : 0, b = k + 1 < F.length ? F[k + 1].i : f.iConf; for (let x = a; x <= b; x++) if (f.dir < 0 ? B[x].h > B[f.i].h : B[x].l < B[f.i].l) { faux++; break; } });
v(faux <= Math.ceil(F.length * 0.08), `chaque flèche est sur le plus haut / plus bas du mouvement (${faux} sur ${F.length} dépassées après coup, une flèche confirmée ne bouge plus)`);
/* confirmation : recul d'au moins 2,5 ATR à la clôture */
v(F.every(f => (f.dir < 0 ? B[f.i].h - B[f.iConf].c : B[f.iConf].c - B[f.i].l) >= MULT_DEFAUT * f.atr - 1e-9), 'confirmation : recul (remontée) d’au moins 2,5 × ATR(14) à la clôture');
/* aucun repaint : refaire le calcul avec moins de bougies redonne les mêmes flèches ; une flèche confirmée ne bouge plus */
let repaint = 0; for (let n = 300; n <= B.length; n += 37) { const part = zigzag(B.slice(0, n)), ref = F.filter(f => f.iConf < n); if (part.length !== ref.length || part.some((f, k) => f.t !== ref[k].t || f.dir !== ref[k].dir || f.iConf !== ref[k].iConf)) repaint++; }
v(repaint === 0, 'aucun repaint : le calcul sur un historique plus court donne exactement les mêmes flèches confirmées');
v(F.every(f => f.iConf <= B.length - 1), 'pas de flèche « en formation » après la dernière bougie');
/* le sommet en cours se déplace tant qu'aucun creux n'est confirmé */
{ const C = []; let p = 100; const push = (h, l, c) => { C.push({ t: T0 + C.length * J, o: p, h, l, c }); p = c; };
  for (let i = 0; i < 30; i++) push(p + 1, p - 1, p + 0.2 * (i % 2 ? 1 : -1));
  for (let i = 0; i < 6; i++) push(p + 3, p - 0.2, p + 2.5);           // montée
  push(p + 4, p + 1.5, p + 2);                                           // premier sommet provisoire
  push(p + 9, p - 0.5, p + 8);                                           // nouveau plus haut : le sommet se déplace
  for (let i = 0; i < 6; i++) push(p + 1, p - 6, p - 5);                // descente franche : sommet confirmé
  const Z = zigzag(C); const top = Z.find(f => f.dir < 0);
  v(top && C[top.i].h === Math.max(...C.slice(0, top.iConf + 1).map(b => b.h)), 'un nouveau plus haut avant confirmation déplace le sommet (pas de seconde flèche)');
  v(Z.filter(f => f.dir < 0).length === 1 || Z.every((f, k) => k === 0 || f.dir !== Z[k - 1].dir), 'jamais deux sommets de suite'); }
/* tendance : creux au-dessus de la MA200 ou sommet en dessous = pleine ; sinon pâle */
{ const L = zigzag(serie(900, 5000)); v(L.every(f => f.ma200 == null ? f.pleine === false : f.pleine === (f.dir > 0 ? f.niveau > f.ma200 : f.niveau < f.ma200)), 'pleine = dans le sens de la tendance (MA200 Daily) ; pâle sinon ou sans 200 bougies');
  v(L.some(f => f.pleine) && L.some(f => !f.pleine), 'les deux cas existent sur la série de test'); }
const sP = styleFleche({ dir: -1, pleine: true }), sPale = styleFleche({ dir: 1, pleine: false });
v(sP.position === 'aboveBar' && sP.forme === 'arrowDown' && /rgba\(216,106,106,1\)/.test(sP.couleur), 'sommet : flèche rouge vers le bas au-dessus de la mèche, pleine');
v(sPale.position === 'belowBar' && sPale.forme === 'arrowUp' && sPale.couleur.endsWith(',' + OPACITE_PALE + ')') && OPACITE_PALE === 0.4, 'creux contre la tendance : flèche verte vers le haut sous la mèche, pâle (40 %)');
/* multiplicateur : plus il est grand, moins il y a de flèches */
v(zigzag(B, { mult: 9 }).length < F.length && zigzag(B, { mult: 1 }).length > F.length, 'multiplicateur ATR plus grand = moins de flèches');
v(multDe('or') === 2.5 && multDe('or', { or: 3 }) === 3 && multDe('or', { or: 99 }) === 2.5 && multDe('or', { or: 'x' }) === 2.5 && multDe('inconnu') === 2.5, 'multiplicateur : défaut 2,5, valeur invalide ignorée');
/* placement : Jour = la bougie extrême ; H4 = la bougie H4 du plus haut / plus bas EXACT de la journée ; H1 = aucune */
{ const f = { t: T0, dir: -1 }, h4 = Array.from({ length: 12 }, (_, i) => ({ t: T0 - J + i * 4 * 3600e3, o: 1, h: 10 + i, l: 0, c: 1 })), pas = 4 * 3600e3;
  h4[6].h = 99; h4[7].h = 50; v(indexSurUnite(h4, f, pas) === 6, 'H4 : la bougie du plus haut exact de la journée');
  const f2 = { t: T0, dir: 1 }; h4[8].l = -9; h4[7].l = -3; v(indexSurUnite(h4, f2, pas) === 8, 'H4 : la bougie du plus bas exact de la journée');
  v(indexSurUnite(h4, { t: T0 + 5 * 3600e3, dir: -1 }, pas) === 6, 'H4 : bougie Daily horodatée 05:00 UTC (futures) = la même journée UTC'); v(indexSurUnite(h4, f, 3600e3) === -1, 'H1 : aucune flèche'); const j = Array.from({ length: 5 }, (_, i) => ({ t: T0 + i * J })); v(indexSurUnite(j, { t: T0 + 2 * J, dir: 1 }, J) === 2, 'Jour : la bougie Daily de l’extrême'); }
/* registre : une flèche confirmée ne bouge plus, n'est jamais retirée, et l'alternance reste stricte */
{ const a = F.slice(0, 6), reg1 = fusionnerRegistre('x', [], a), reg2 = fusionnerRegistre('x', reg1, F.slice(0, 3).concat(F.slice(6, 9)));
  v(reg1.length === 6 && reg2.slice(0, 6).every((f, k) => f === reg1[k] || (f.id === reg1[k].id && f.niveau === reg1[k].niveau)), 'registre : les flèches déjà confirmées restent telles quelles, même si le calcul ne les redonne plus');
  v(reg2.every((f, k) => k === 0 || f.dir !== reg2[k - 1].dir) && reg2.length >= 6, 'registre : alternance stricte conservée');
  v(fusionnerRegistre('x', reg1, [{ ...F[2], t: F[2].t + 1 }]).length === reg1.length, 'registre : une « nouvelle » flèche dans le passé est ignorée');
  v(idFleche('or', F[0]) === `or|${F[0].t}|${F[0].dir}`, 'identifiant actif|jour|sens'); }
/* appareil : stockage factice ; réglages ; annonces une seule fois */
const memoire = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), m }; };
{ const st = memoire(); const r = lireReglages(st); v(r.actif === true && Object.keys(r.mult).length === 0, 'réglages par défaut : flèches activées, aucun multiplicateur modifié');
  ecrireReglages({ actif: false, mult: { or: 3.5 } }, st); const r2 = lireReglages(st); v(r2.actif === false && multActif('or', r2) === 3.5 && multActif('btc', r2) === 2.5, 'réglages : interrupteur et multiplicateur par actif mémorisés');
  const j = B.map(b => ({ ...b })), fin = B[B.length - 1].t + J, dernierConf = F[F.length - 1].tCloture;
  /* premier passage : tout l'historique est enregistré comme déjà vu (rien n'est annoncé) */
  const reg = flechesDe('btc', j, { maintenant: fin, stockage: st, mult: 2.5 }); v(reg.length === F.length && reg.every(f => f.vueLe), 'premier calcul : historique enregistré sans rien annoncer');
  v(nouvellesFleches('btc', reg, { maintenant: dernierConf + 3600e3, stockage: st, mult: 2.5 }).length === 0, 'rien à annoncer au premier passage');
  /* une nouvelle flèche apparaît plus tard : annoncée une seule fois */
  const st2 = memoire(), avant = F[F.length - 2].tCloture + 3600e3, jAvant = j.filter(b => b.t + J <= avant);
  flechesDe('btc', jAvant, { maintenant: avant, stockage: st2, mult: 2.5 });
  const reg2 = flechesDe('btc', j, { maintenant: dernierConf + 3600e3, stockage: st2, mult: 2.5 }), n1 = nouvellesFleches('btc', reg2, { maintenant: dernierConf + 3600e3, stockage: st2, mult: 2.5 }), n2 = nouvellesFleches('btc', flechesDe('btc', j, { maintenant: dernierConf + 7200e3, stockage: st2, mult: 2.5 }), { maintenant: dernierConf + 7200e3, stockage: st2, mult: 2.5 });
  v(n1.length >= 1 && n1[n1.length - 1].tCloture === dernierConf, 'une nouvelle flèche confirmée est annoncée');
  v(n2.length === 0, 'jamais annoncée deux fois (mémorisée dans le registre de l’appareil)');
  /* une flèche de plus de 36 h n'est pas annoncée */
  const st3 = memoire(); flechesDe('btc', jAvant, { maintenant: avant, stockage: st3, mult: 2.5 }); const r3 = flechesDe('btc', j, { maintenant: dernierConf + 40 * 3600e3, stockage: st3, mult: 2.5 }); v(nouvellesFleches('btc', r3, { maintenant: dernierConf + 40 * 3600e3, stockage: st3, mult: 2.5 }).length === 0, 'au-delà de 36 h : jamais annoncée');
  /* un autre multiplicateur a son propre registre */
  flechesDe('btc', j, { maintenant: fin, stockage: st, mult: 4 }); v(lireRegistre('btc', 4, st).length === zigzag(B, { mult: 4 }).length && lireRegistre('btc', 2.5, st).length === F.length, 'chaque multiplicateur a son registre'); }
/* week-end : l'or et les indices n'ont pas de bougie le samedi / dimanche */
{ const w = Array.from({ length: 14 }, (_, i) => ({ t: T0 + i * J, o: 1, h: 2, l: 0.5, c: 1 })); v(barresDaily('or', w).length === 10 && barresDaily('btc', w).length === 14, 'or et indices : week-ends écartés ; crypto : 7 jours sur 7'); }
v(cloturees([{ t: T0 }, { t: Date.now() - 3600e3 }], Date.now()).length === 1, 'la bougie du jour en cours est écartée');
/* voix */
v(niveauParle(2650.4) === '2 650' && niveauParle(0.1534) === '0,1534' && niveauParle(87.456) === '87,46', 'niveau parlé : 2 650 ; 0,1534 ; 87,46');
v(phraseFleche('Or', { dir: -1, niveau: 2650 }) === 'Or : sommet Daily confirmé, vers 2 650' && /creux Daily confirmé/.test(phraseFleche('Bitcoin', { dir: 1, niveau: 61000 })), 'phrase de Rayle : « Or : sommet Daily confirmé, vers 2 650 »');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
