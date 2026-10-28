// Tests des frais en R (V6, phase 1) : strategies/couts-r.js. Lancer : node galaxie/tests/couts-r-test.mjs
import { tauxEquilibre, rrEquilibre, esperanceProfil, phraseFrais, coutEstimeR, distanceMinimale, parBandeDeStop, resumeCouts, avantageDetruit, partMangee, validerReglageCouts, COUTS_EXEMPLE, estimerGlissement, spreadParHeure, libelleBande, BANDES_STOP } from '../../strategies/couts-r.js';
import { COUTS_DEFAUT, coutEnR } from '../../planetes/mars/pc/agent-m6/couts.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const proche = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// ── l'exemple du cahier des charges : stop à 0,3 %, 0,15 % de coûts → 0,5 R perdu avant de gagner ──
// frais taker 0,05 % par côté (0,10 % aller-retour) + glissement 0,025 % à l'entrée et 0,025 % à la sortie (0,05 %) = 0,15 %
v('exemple : stop à 0,3 % et 0,15 % de coût total = 0,5 R', proche(coutEstimeR({ fraisPct: 0.05, spreadPct: 0, glissementPct: 0.025 }, 0.3), 0.5, 1e-9), String(coutEstimeR({ fraisPct: 0.05, spreadPct: 0, glissementPct: 0.025 }, 0.3)));
v('cohérent avec le module de coûts de la V6 (agent-m6/couts.js) à 20 % près (le spread y est compté en entier, ici demi-compté à chaque côté)', (() => { const c = COUTS_DEFAUT.BTC, a = coutEstimeR(c, 0.5), b = coutEnR(c, 0.5).total; return Math.abs(a - b) < 0.2 * b; })());
v('taux d’équilibre : RR = 2, sans frais = 33,3 %', proche(tauxEquilibre(2, 0), 1 / 3));
v('taux d’équilibre : RR = 2, 0,1 R de frais = 36,7 %', proche(tauxEquilibre(2, 0.1), 1.1 / 3));
v('taux d’équilibre : RR = 1, 0 frais = 50 % ; plus les frais montent, plus il faut gagner souvent', proche(tauxEquilibre(1, 0), 0.5) && tauxEquilibre(2, 0.5) > tauxEquilibre(2, 0.1));
v('l’équilibre est bien celui d’une espérance nulle', proche(esperanceProfil(tauxEquilibre(2.5, 0.2), 2.5, 0.2), 0));
v('rrEquilibre est l’inverse de tauxEquilibre', proche(rrEquilibre(tauxEquilibre(3, 0.15), 0.15), 3, 1e-9));
v('le profil de Justin : 45 % de réussite et RR 2 avec 0,08 R de frais = +0,27 R par trade', proche(esperanceProfil(0.45, 2, 0.08), 0.27, 1e-9));
v('phrase de l’état : « Frais moyens : 0,23 R par trade. Taux de réussite minimal pour être rentable avec RR=2 : 41 %. »', phraseFrais({ coutMoyenR: 0.23, rr: 2 }) === 'Frais moyens : 0,23 R par trade. Taux de réussite minimal pour être rentable avec RR=2 : 41 %.', phraseFrais({ coutMoyenR: 0.23 }));
v('phrase sans mesure : honnête', /pas encore mesurés/.test(phraseFrais({ coutMoyenR: null })));

// ── maker contre taker, distance minimale ──
const c2 = { fraisPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02 };
const taker = coutEstimeR(c2, 1), maker = coutEstimeR(c2, 1, { entree: 'limite', sortie: 'limite' }), mixte = coutEstimeR(c2, 1, { entree: 'limite', sortie: 'marche' });
v('un aller-retour entièrement maker coûte moins qu’un aller-retour au marché, le mixte entre les deux', maker < mixte && mixte < taker, [maker, mixte, taker].join(' / '));
v('à stop égal, plus le stop est loin moins les frais pèsent', coutEstimeR(c2, 2) < coutEstimeR(c2, 0.5) && proche(coutEstimeR(c2, 2) * 2, coutEstimeR(c2, 1)));
const dmin = distanceMinimale(c2, 0.08);
v('distance minimale pour 0,08 R : le coût estimé à cette distance vaut exactement le plafond', proche(coutEstimeR(c2, dmin), 0.08, 1e-9), String(dmin));
v('avec les frais BTC par défaut il faut un stop de 2 à 3,5 % pour tenir 0,08 R : hors de portée d’un stop M15 serré', dmin > 2 && dmin < 3.5, String(dmin));
v('coût invalide : null (jamais un nombre inventé)', coutEstimeR(c2, 0) === null && coutEstimeR(c2, -1) === null);

// ── tableau par bande de stop ──
const trade = (R, brut, dist) => ({ R, Rbrut: brut, coutsR: brut - R, distancePct: dist });
const trades = [trade(1.7, 2, 0.3), trade(-1.3, -1, 0.3), trade(-1.3, -1, 0.3), trade(1.9, 2, 1.5), trade(-1.1, -1, 1.5), trade(1.95, 2, 3), trade(-1.05, -1, 3)];
const bandes = parBandeDeStop(trades);
v('les bandes couvrent toutes les distances et les coûts diminuent quand le stop s’éloigne', bandes.length === BANDES_STOP.length && bandes[0].couts > bandes[2].couts && bandes[2].couts > bandes[3].couts, JSON.stringify(bandes.map(b => b.couts && +b.couts.toFixed(2))));
v('bande sans trade : null partout, pas de zéro inventé', bandes[1].n === 0 && bandes[1].brute === null && bandes[1].nette === null);
v('libellés lisibles', libelleBande([0, 0.5]) === '< 0,5 %' && libelleBande([4, 100]) === '≥ 4 %' && libelleBande([1, 2]) === '1 à 2 %');
const rc = resumeCouts(trades);
v('résumé : coût moyen = brute − nette, taux d’équilibre au RR réalisé calculé', proche(rc.couts, rc.brute - rc.nette, 1e-9) && rc.n === 7 && rc.tauxEquilibre > 0 && rc.tauxEquilibre < 1);
v('où l’avantage brut est détruit : seules les lignes brute > 0 et nette ≤ 0, avec assez de trades', (() => { const l = avantageDetruit([{ n: 80, brute: 0.2, nette: -0.1, couts: 0.3 }, { n: 80, brute: 0.5, nette: 0.3, couts: 0.2 }, { n: 5, brute: 0.2, nette: -0.1, couts: 0.3 }, { n: 80, brute: -0.1, nette: -0.4, couts: 0.3 }]); return l.length === 1 && proche(l[0].detruit, 0.2); })());
v('part de lignes dont les frais mangent plus de la moitié de l’avantage', proche(partMangee([{ brute: 0.2, couts: 0.15 }, { brute: 0.5, couts: 0.1 }]), 0.5));

// ── réglages de Justin ──
const r0 = validerReglageCouts(COUTS_EXEMPLE, COUTS_DEFAUT);
v('le fichier d’exemple est valide et reprend les valeurs prudentes', r0.ok && r0.couts.BTC.fraisPct === COUTS_DEFAUT.BTC.fraisPct && r0.couts.SOL.spreadPct === COUTS_DEFAUT.SOL.spreadPct && r0.filePct === 0.02, JSON.stringify(r0.erreurs));
const r1 = validerReglageCouts({ BTC: { takerPct: 0.05, makerPct: 0.01 }, filePct: 0.05 }, COUTS_DEFAUT);
v('valeurs personnelles prises en compte (BTC) ; les autres paires gardent les valeurs prudentes', r1.ok && r1.couts.BTC.fraisPct === 0.05 && r1.couts.BTC.makerPct === 0.01 && r1.couts.SOL.fraisPct === COUTS_DEFAUT.SOL.fraisPct && r1.filePct === 0.05);
const r2 = validerReglageCouts({ BTC: { takerPct: -1, makerPct: 'abc', spreadPct: 5 } }, COUTS_DEFAUT);
v('valeurs impossibles refusées avec un message clair, et les valeurs prudentes gardées', !r2.ok && r2.erreurs.length === 3 && r2.couts.BTC.fraisPct === COUTS_DEFAUT.BTC.fraisPct, JSON.stringify(r2.erreurs));
const r3 = validerReglageCouts({ BTC: { takerPct: 0.02, makerPct: 0.05 } }, COUTS_DEFAUT);
v('maker plus cher que taker : signalé (probable inversion)', !r3.ok && /maker/.test(r3.erreurs[0]));
v('fichier illisible : refusé', !validerReglageCouts(null, COUTS_DEFAUT).ok && !validerReglageCouts('abc', COUTS_DEFAUT).ok);
v('spread par heure : 24 nombres exigés', validerReglageCouts({ spreadParHeureUTC: [1, 2, 3] }, COUTS_DEFAUT).erreurs.length === 1 && validerReglageCouts({ spreadParHeureUTC: new Array(24).fill(1) }, COUTS_DEFAUT).spreadParHeureUTC.length === 24);

// ── glissement d'après un carnet (faux, déterministe) ──
const asks = [[100.00, 5], [100.10, 10], [100.30, 20], [100.60, 40]];
const g1 = estimerGlissement(asks, 400, 99.95), g2 = estimerGlissement(asks, 100000, 99.95), g3 = estimerGlissement(asks, 0, 99.95);
v('petit ordre : rempli au meilleur prix, glissement = demi-spread (0,05 %)', g1.rempli === 1 && !g1.epuise && proche(g1.prixMoyen, 100, 1e-6) && Math.abs(g1.glissementPct - 0.05) < 0.001, JSON.stringify(g1));
v('gros ordre : le prix moyen s’éloigne, le glissement augmente', g2.glissementPct > g1.glissementPct, JSON.stringify(g2));
v('carnet enregistré trop mince pour le montant : on le dit (epuise), jamais un faux chiffre', (() => { const g = estimerGlissement(asks, 1e7, 99.95); return g.epuise === true && g.rempli < 1; })());
v('montant nul ou carnet vide : null', g3 === null && estimerGlissement([], 100, 99) === null);
const inst = []; for (let h = 0; h < 24; h++) for (let k = 0; k < 4; k++) inst.push({ t: Date.UTC(2026, 9, 1, h, k * 10), meilleurAchat: 100 - (h < 6 ? 0.04 : 0.01), meilleureVente: 100 + (h < 6 ? 0.04 : 0.01) });
const sp = spreadParHeure(inst);
v('spread par heure : plus large la nuit (0 à 6 h) dans l’exemple, 24 valeurs', sp.parHeure.length === 24 && sp.parHeure[2] > sp.parHeure[12] * 3 && sp.n === 96 && sp.multiplicateurs[2] > 1 && sp.multiplicateurs[12] < 1);
v('instantanés absurdes (vente < achat) écartés', spreadParHeure([{ t: 0, meilleurAchat: 101, meilleureVente: 100 }]).n === 0);
console.log('Frais en R : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
