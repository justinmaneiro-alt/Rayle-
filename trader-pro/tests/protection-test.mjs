/* Tests purs : taux de protection, coût, niveaux, phrase claire, événements. node trader-pro/tests/protection-test.mjs */
import { mesurerProtection, protectionComplete, verdictProtection, phraseClaire, NIVEAUX, datesNfp, typeDeTitre, comportementEvenement, phraseEvenement, TYPES_EVENEMENT } from '../couverture/protection.js';
import { classerCouvertures, parId, UNIVERS_COUV } from '../couverture/calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
let graine = 777; const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296 - 0.5; };
const N = 700, jour = i => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
const rOr = Array.from({ length: N }, () => alea() * 0.04), rArg = rOr.map(x => 1.2 * x + alea() * 0.008), rInv = rOr.map(x => -x + alea() * 0.008), rInd = Array.from({ length: N }, () => alea() * 0.04);
const serie = r => { let p = 100; return r.map((x, i) => ({ d: jour(i), t: Date.UTC(2024, 0, 1 + i), c: (p *= Math.exp(x)) })); };
const S = { XAUUSD: serie(rOr), XAGUSD: serie(rArg), BTC: serie(rInv), SOL: serie(rInd) };

/* achat d'or : l'argent (corrélé) à vendre ; la couverture gagne presque toujours quand l'or baisse */
const R = classerCouvertures(S, 'XAUUSD', +1, { notionnel: 500 }), arg = R.find(r => r.id === 'XAGUSD');
v(arg.sensCouverture === -1, 'achat d’or : on VEND l’argent');
v(arg.protection.semaine.taux > 0.9 && arg.protection.semaine.cas > 30, 'taux de protection hebdomadaire élevé et nombre de cas affiché : ' + arg.protection.semaine.taux);
v(arg.protection.semaine.compensation > 0.5, 'part de perte compensée > 50 %');
v(arg.protection.semaine.cout > 0.3, 'le coût est mesuré (la couverture reprend du gain) : ' + arg.protection.semaine.cout);
v(arg.protection.semaine.frequenceCout > 0.8, 'fréquence du coût élevée pour un lien fort');
v(arg.verdict.niveau === 'fiable', 'verdict fiable : ' + arg.verdict.texte);
v(arg.niveaux.length === 3 && arg.niveaux.map(n => n.fraction).join() === '0.25,0.5,1', 'trois niveaux 25 / 50 / 100 %');
const [lg, mo, co] = arg.niveaux;
v(lg.reductionVol < mo.reductionVol && mo.reductionVol < co.reductionVol, 'volatilité réduite croît avec le niveau');
v(Math.abs(lg.tailleRelative - 0.25 * co.tailleRelative) < 1e-9 && Math.abs(mo.tailleNotionnel - 0.5 * co.tailleNotionnel) < 1e-6, 'tailles proportionnelles au niveau');
v(Math.abs(lg.compensation - 0.25 * co.compensation) < 1e-9, 'compensation proportionnelle au niveau (la couverture légère protège moins)');
v(co.gainAbandonne != null && lg.gainAbandonne != null && Number.isFinite(co.gainAbandonne), 'gain abandonné calculé');
/* vente d'or : on ACHÈTE l'argent */
const Rv = classerCouvertures(S, 'XAUUSD', -1), argV = Rv.find(r => r.id === 'XAGUSD'); v(argV.sensCouverture === +1, 'vente d’or : on ACHÈTE l’argent');
v(argV.protection.semaine.taux > 0.9, 'vente d’or : taux de protection élevé aussi');
/* anti-corrélé : achat d'or → achat de l'actif inverse */
const inv = R.find(r => r.id === 'BTC'); v(inv.sensCouverture === +1, 'actif anti-corrélé : couverture dans le même sens');
/* indépendant : pas fiable */
const ind = R.find(r => r.id === 'SOL'); v(ind.verdict.niveau !== 'fiable', 'actif indépendant : jamais « fiable » (' + ind.verdict.niveau + ', taux ' + ind.protection.semaine.taux.toFixed(2) + ')');
/* mesure brute */
const m = mesurerProtection([-0.03, -0.03, 0.03], [0.02, 0.02, 0.02], +1, 1, { h: 1, jours: 3, seuil: 0.01 });
v(m.cas === 2 && m.taux === 0 && m.casFavorables === 1, 'mesure brute : couverture perdante quand corrélation faussée');
const m2 = mesurerProtection([-0.02, -0.02, 0.02], [-0.02, -0.02, 0.02], +1, 1, { h: 1, jours: 3 }); v(m2.taux === 1 && Math.abs(m2.compensation - 1) < 1e-9 && Math.abs(m2.cout - 1) < 1e-9 && m2.frequenceCout === 1, 'mesure brute : compensation 100 %, coût 100 % du gain');
v(mesurerProtection([0.02, 0.02], [0.01, 0.01], +1, 1, { h: 1 }).taux === null, 'aucune période défavorable : taux non déclaré (pas de 0 inventé)');
/* seuil de 70 % et stabilité */
const w = (j, taux, cas) => ({ jours: j, taux, cas });
v(verdictProtection([w(30, 0.8, 5), w(90, 0.75, 20), w(250, 0.72, 60)]).niveau === 'fiable', 'fiable : ≥ 70 % partout');
v(verdictProtection([w(30, 0.6, 5), w(90, 0.75, 20), w(250, 0.72, 60)]).niveau === 'partielle', 'instable sur 30 jours : partielle');
v(verdictProtection([w(30, 0.8, 5), w(90, 0.75, 20), w(250, 0.72, 60)], 0.29).niveau === 'partielle' && verdictProtection([w(30, 0.8, 5), w(90, 0.75, 20), w(250, 0.72, 60)], -0.62).niveau === 'fiable', 'v4 : corrélation 0,29 → jamais fiable ; |−0,62| → fiable');
v(verdictProtection([w(30, 0.8, 1), w(90, 0.75, 20), w(250, 0.72, 60)]).niveau === 'partielle', '30 jours non mesurable (1 cas) : jamais fiable');
v(verdictProtection([w(30, 0.8, 5), w(90, 0.75, 20), w(250, 0.69, 60)]).niveau === 'partielle', '69 % sur 250 jours : pas fiable');
v(verdictProtection([w(30, 0.5, 5), w(90, 0.5, 20), w(250, 0.5, 60)]).niveau === 'a-eviter', '50 % : à éviter');
v(verdictProtection([w(30, null, 0), w(90, null, 0), w(250, null, 0)]).niveau === 'a-eviter', 'sans cas : à éviter');
/* phrase claire */
const or = parId.XAUUSD, p = phraseClaire(or, +1, { ...arg, nom: 'Argent', art: 'l’argent', de: 'd’argent' }, NIVEAUX[2], 500);
v(p.ta === 'Tu ACHÈTES l’or', 'phrase : sens de ma position : ' + p.ta);
v(/VENDS l’argent à \d+ % de ta taille \(≈ \d+ €\)/.test(p.consigne), 'phrase : « VENDS l’argent à X % de ta taille (≈ Y €) » : ' + p.consigne);
v(p.action.verbe === 'VENDS' && p.action.couleur === 'rouge', 'vente : en rouge');
v(/l’or et l’argent montent et baissent ensemble \(corrélation 0,\d\d\)/i.test(p.pourquoi) && /Si l’or baisse, ta vente d’argent gagne\./.test(p.pourquoi), 'phrase : pourquoi : ' + p.pourquoi);
v(/a gagné \d+ %/.test(p.protege) && /te reprend en moyenne \d+ % du gain/.test(p.cout) && /70 %/.test(p.pedago), 'phrase : protection + coût + pédagogie');
const pv = phraseClaire(or, -1, { ...argV, nom: 'Argent', art: 'l’argent', de: 'd’argent' }, NIVEAUX[2]);
v(pv.ta === 'Tu VENDS l’or' && /ACHÈTE l’argent/.test(pv.consigne) && pv.action.couleur === 'vert' && /Si l’or monte, ton achat d’argent gagne/.test(pv.pourquoi), 'phrase pour une vente d’or : ' + pv.pourquoi);
const pi = phraseClaire(or, +1, { ...inv, nom: 'Bitcoin', art: 'le Bitcoin', de: 'du Bitcoin' }, NIVEAUX[0]);
v(/évoluent en sens inverse/.test(pi.pourquoi) && /Si l’or baisse, ton achat du Bitcoin gagne/.test(pi.pourquoi) && /ACHÈTE le Bitcoin à \d+ %/.test(pi.consigne), 'phrase anti-corrélée : ' + pi.pourquoi);
v(phraseClaire(or, 1, null) === null && typeof p.texte() === 'string' && p.texte().includes('Tu ACHÈTES l’or'), 'texte parlé complet');
/* symboles XTB exacts */
const xtb = Object.fromEntries(UNIVERS_COUV.map(a => [a.id, a.xtb])); v(xtb.XAUUSD === 'GOLD' && xtb.XAGUSD === 'SILVER' && xtb.BTC === 'BITCOIN' && xtb.SOL === 'SOLANA' && xtb.WTI === 'OIL.WTI' && xtb.US100 === 'US100', 'symboles XTB exacts (table des marges)');
v(xtb.DXY === null, 'DXY : pas de symbole XTB dans la table des marges → jamais proposé');
/* événements */
const nfp = datesNfp(2024, 2025); v(nfp.includes('2024-12-06') && nfp.includes('2025-02-07') && nfp.includes('2024-11-01'), 'dates NFP : règle du BLS (6/12/2024, 7/2/2025, 1/11/2024)');
v(typeDeTitre('Non-Farm Employment Change', 'USD') === 'NFP' && typeDeTitre('CPI m/m', 'USD') === 'CPI' && typeDeTitre('FOMC Statement', 'USD') === 'FOMC' && typeDeTitre('Main Refinancing Rate', 'EUR') === 'BCE' && typeDeTitre('Retail Sales', 'USD') === null, 'titres du calendrier → types');
const dates = Array.from({ length: N }, (_, i) => jour(i)), c = comportementEvenement(dates, rOr, rArg, +1, 1.2, 'FOMC');
v(c && c.mesurable && c.n >= 4, 'événement FOMC : cas trouvés dans la série (' + (c && c.n) + ')');
const rEv = rOr.slice(); const setF = new Set(TYPES_EVENEMENT.FOMC.dates); dates.forEach((d, i) => { if (setF.has(d)) rEv[i] = rOr[i] * 4; });
const c2 = comportementEvenement(dates, rEv, rArg.map((x, i) => (setF.has(dates[i]) ? 1.2 * rEv[i] : x)), +1, 1.2, 'FOMC'); v(c2.amplitudeRatio > 2.5, 'amplitude les jours d’annonce plus grande que d’habitude : ' + c2.amplitudeRatio.toFixed(1));
v(comportementEvenement(dates.slice(0, 20), rOr.slice(0, 20), rArg.slice(0, 20), 1, 1, 'FOMC').mesurable === false, 'historique trop court : non mesurable');
const pe = phraseEvenement(or, +1, { ...arg, nom: 'Argent', art: 'l’argent', de: 'd’argent' }, c, 'la Fed'); v(/Avant la Fed : VENDS l’argent à \d+ % de ta taille/.test(pe) && /retire-la à la clôture du jour de l’annonce/.test(pe), 'phrase événement : ' + pe.slice(0, 110));
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
