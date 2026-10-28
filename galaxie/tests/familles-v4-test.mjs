import { FAMILLES_V4, ORDRE_V4, bibliothequeV4, tailleGrilleV4, EXIGENCES_V4, masqueContexte } from '../../strategies/familles-v4.js';
import { famille, bibliotheque } from '../../strategies/familles-v3.js';
import { combinaisons } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { verifierCausalite, validerV3 } from '../../strategies/validation-v3.js';
import { attacherFluxBougies, absorptionVec, divergenceVec, creerCompacteur, attacherEmpreinte, couvertureEmpreinte } from '../../strategies/liquidite/contexte-flux.js';
import { trancheDe } from '../../strategies/liquidite/barres-flux.js';
import { proposerCarnet, GENERATEURS_CARNET, HYPOTHESES_CARNET, ORDRE_CARNET, JOURS_PREUVE_MIN } from '../../strategies/familles-carnet.js';
import { CRITERES3, empreinteV3 } from '../../strategies/criteres-v3.js';
import { bougiesSynth, serieSynth, marcheMixte, T0 } from '../../planetes/mars/tests/synth-btc.mjs';
import { depuisBougies, tranche } from '../../planetes/mars/pc/agent-btc/colonnes.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const compte = o => { let n = 0; for (let i = 0; i < o.sens.length; i++) if (o.sens[i] !== 0) n++; return n; };

v('critères de validation v3 inchangés (empreinte c9b4ddd4) — la V4 ne les touche pas', empreinteV3() === 'c9b4ddd4' && CRITERES3.horsEchantillon.tradesMin === 150 && CRITERES3.horsEchantillon.esperanceMin === 0.25);
/* ── bibliothèque : hypothèse économique, grilles bornées, enregistrement dans le moteur ── */
v('6 familles historiques enregistrées dans le moteur', ORDRE_V4.length === 6 && ORDRE_V4.every(id => famille(id) === FAMILLES_V4[id]));
v('chaque famille a une description et une HYPOTHÈSE ÉCONOMIQUE (« qui perd… pourquoi on peut gagner à sa place »)', bibliothequeV4().every(f => f.description.length > 80 && /^Qui perd/.test(f.hypothese) && /Pourquoi on peut gagner/.test(f.hypothese)));
v('grilles petites et bornées (≤ 64 variantes, ≤ 6 paramètres) : pas de grille géante aveugle', ORDRE_V4.every(id => tailleGrilleV4(id) <= 64 && Object.keys(FAMILLES_V4[id].grille()).length <= 6), JSON.stringify(ORDRE_V4.map(tailleGrilleV4)));
v('la bibliothèque de la V3 est intacte (6 familles)', bibliotheque().length === 6);
v('exigences dites : seule la famille du profil de volume demande l’empreinte aggTrades', ORDRE_V4.filter(id => EXIGENCES_V4[id].includes('empreinte')).join() === 'retour_noeud_volume');

/* ── jeux de données ── */
const m15 = marcheMixte(9000, 21), ctx = construireContexte(m15);
const fl = attacherFluxBougies(ctx);
v('flux des bougies : achat + vente = volume × prix, delta = achat − vente', Math.abs(fl.achat[200] + fl.vente[200] - m15.v[200] * m15.c[200]) < 1e-6 * m15.v[200] * m15.c[200] && Math.abs(fl.delta[200] - (fl.achat[200] - fl.vente[200])) < 1e-6);
v('CVD du jour : repart de zéro chaque jour UTC', (() => { let i = 1; while (Math.floor(m15.t[i] / 86400e3) === Math.floor(m15.t[i - 1] / 86400e3)) i++; return Math.abs(fl.cvd[i] - fl.delta[i]) < 1e-6; })());
v('couverture du flux : 100 % avec les volumes « taker »', fl.ok && fl.couverture > 0.99);
/* causalité des vecteurs de flux : ajouter des barres APRÈS i ne change rien avant */
{
  const n1 = 7000, c1 = construireContexte(tranche(m15, 0, n1)), a1 = absorptionVec(ctx, 2, 0.25), a2 = absorptionVec(c1, 2, 0.25), d1 = divergenceVec(ctx, 48), d2 = divergenceVec(c1, 48);
  let egalA = true, egalD = true; for (let i = 0; i < n1; i++) { if (a1.sens[i] !== a2.sens[i]) egalA = false; if (d1[i] !== d2[i]) egalD = false; }
  v('absorption : causale (2 000 barres de plus ne changent rien avant)', egalA); v('divergence prix / CVD : causale', egalD);
}
/* ── chaque famille : des signaux sur un marché varié, causalité (poison du futur), même format que les autres ── */
for (const id of ORDRE_V4) {
  const fam = FAMILLES_V4[id], tous = combinaisons(fam.grille());
  let nSig = 0; for (const p of tous.slice(0, 8)) { const o = fam.signaux(ctx, p); nSig += compte(o); v(id + ' : format { sens, stop, R }', o.sens instanceof Int8Array && o.stop instanceof Float64Array && o.R === p.R); }
  if (id !== 'retour_noeud_volume') v(id + ' : produit des signaux sur un marché varié', nSig > 0, String(nSig));
  const caus = verifierCausalite(fam, tous[0], m15, { coupes: 4, fenetre: 6000 }); v(id + ' : test du poison du futur (aucun regard vers le futur)', caus.ok, JSON.stringify(caus));
  // les signaux d'un stop à l'envers sont refusés plus loin par le moteur ; ici on vérifie la cohérence : stop du bon côté du prix de clôture
  const o = fam.signaux(ctx, tous[0]); let bons = 0, mauvais = 0; for (let i = 0; i < o.sens.length; i++) if (o.sens[i]) { if (o.sens[i] > 0 ? o.stop[i] < m15.c[i] : o.stop[i] > m15.c[i]) bons++; else mauvais++; }
  v(id + ' : le stop est du bon côté de la clôture (achat : dessous, vente : dessus)', mauvais === 0, bons + ' bons, ' + mauvais + ' mauvais');
}
/* ── balayage : scénario construit à la main ── */
{
  const bougies = []; let c = 100; const t0 = Date.UTC(2026, 0, 5);
  for (let i = 0; i < 900; i++) { const o = c; let cl = o + (i % 2 ? 0.04 : -0.04), h = Math.max(o, cl) + 0.1, l = Math.min(o, cl) - 0.1; if (i === 500 || i === 520) h = 101; if (i === 560) { h = 101.7; cl = 100.3; } bougies.push({ t: t0 + i * 900000, o, h, l, c: cl, v: 100, vb: 50 }); c = cl; }
  const s = depuisBougies(bougies), cx = construireContexte(s), fam = FAMILLES_V4.balayage_retour, o = fam.signaux(cx, { minTouches: 2, pad: 0.2, R: 3, volume: 0, contexte: 'aucun' });
  v('balayage_retour : le balayage des hauts égaux (101) à la barre 560 donne une VENTE avec un stop au-dessus de la mèche', o.sens[560] === -1 && o.stop[560] > 101.7, JSON.stringify([o.sens[560], o.stop[560]]));
  const ov = fam.signaux(cx, { minTouches: 2, pad: 0.2, R: 3, volume: 1, contexte: 'aucun' }); v('balayage_retour : l’option « volume climactique » filtre (volume normal → pas de signal)', ov.sens[560] === 0);
}
/* ── absorption : ventes massives sans baisse près du plus bas ── */
{
  const bougies = []; let c = 100; const t0 = Date.UTC(2026, 0, 5);
  for (let i = 0; i < 700; i++) { const o = c, cl = o + (i % 2 ? 0.05 : -0.05), h = Math.max(o, cl) + 0.1, l = Math.min(o, cl) - 0.1; bougies.push({ t: t0 + i * 900000, o, h, l, c: cl, v: 100, vb: i % 2 ? 52 : 48 }); c = cl; }
  const i0 = 650; Object.assign(bougies[i0], { o: 100, c: 100.05, h: 100.2, l: 99.2, v: 400, vb: 40 });                    // énormes ventes (vb ≪ v/2) mais clôture ≥ ouverture, mèche basse
  for (let i = 0; i < 700; i++) if (i !== i0 && i > i0 - 60 && i < i0) bougies[i].l = Math.max(bougies[i].l, 99.9);
  const s = depuisBougies(bougies), cx = construireContexte(s), o = FAMILLES_V4.absorption_extreme.signaux(cx, { facteur: 2, tol: 0.25, proximite: 1, pad: 0.2, R: 2 });
  v('absorption_extreme : ventes massives absorbées près du plus bas → ACHAT, stop sous la mèche', o.sens[i0] === 1 && o.stop[i0] < 99.2, JSON.stringify([o.sens[i0], o.stop[i0]]));
}
/* ── empreinte compacte : alignement, profil de la veille, jamais le jour en cours ── */
{
  const t0 = Date.UTC(2026, 0, 5), barres = [], mkfp = (lignes) => lignes.map(([p, a, v]) => [trancheDe(p), a, v]);
  const profilVallee = () => { const l = []; for (let p = 99.9; p <= 101.1; p += 0.02) { const vol = p <= 100.12 || p >= 100.88 ? 5000 : 50 + 3000 * Math.abs(p - 100.5); l.push([+p.toFixed(3), vol, vol]); } return l; };   // deux gros nœuds (100 et 101) et une vallée à 100,5
  for (let j = 0; j < 6; j++) for (let h = 0; h < 96; h++) { const t = t0 + j * 86400e3 + h * 900000; barres.push({ t, achatUsd: 1000, venteUsd: 900, n: 5, plusGrosUsd: 500, ouv: 100, haut: 101, bas: 99.9, cloture: 100, fp: mkfp(profilVallee()) }); }
  const C = creerCompacteur(); for (const b of barres) C.ajouter(b); const compact = C.finir();
  v('compact : 6 profils de jours, un par jour, avec POC, zone de valeur, HVN et LVN', compact.jours.length === 6 && compact.barres.length === 576 && compact.jours[0].val <= compact.jours[0].poc && compact.jours[0].vah >= compact.jours[0].poc && compact.jours[0].hvn.length >= 1 && compact.jours[0].lvn.length >= 1, JSON.stringify(compact.jours[0]));
  v('compact : le trou de volume (LVN) est dans la vallée (≈ 100,5)', compact.jours[0].lvn.some(x => x > 100.3 && x < 100.7), JSON.stringify(compact.jours[0].lvn));
  const serie = serieSynth({ segments: [{ n: 576, derive: 0, bruit: 0.05, volume: 100 }], t0: t0, prix: 100 }), cx = construireContexte(serie), fp = attacherEmpreinte(cx, compact);
  v('empreinte attachée : couverture 100 %, barres présentes alignées par l’horodatage', fp.ok && fp.couverture > 0.99 && fp.present[10] === 1 && fp.achat[10] === 1000 && fp.mois > 5.9 / 30);
  v('profil de la veille : aucun avant la fin du 1er jour, le jour 1 pendant le jour 2 (jamais le jour en cours)', fp.jourIdx[50] === -1 && fp.jourIdx[96] === 0 && fp.jourIdx[200] === 1);
  v('couverture résumée pour les rapports', couvertureEmpreinte(cx).mois > 0.19);
  const sans = attacherEmpreinte(construireContexte(serie), null); v('sans historique : « ok = false » et la raison est dite', sans.ok === false && /non installé/.test(sans.raison));
  const famN = FAMILLES_V4.retour_noeud_volume, p = { tol: 0.5, pad: 0.4, R: 1.5, hvnMax: 6 };
  v('retour_noeud_volume : sans empreinte, aucun signal (jamais de valeur inventée)', compte(famN.signaux(construireContexte(serie), p)) === 0 && compte(famN.signaux(Object.assign(construireContexte(serie), { fp: sans }), p)) === 0);
  const bougies = []; for (let i = 0; i < 576; i++) { const c = i >= 420 && i < 520 ? 100.5 : 100; bougies.push({ t: t0 + i * 900000, o: c, h: c + 0.05, l: c - 0.05, c, v: 100, vb: 50 }); }
  const cx2 = construireContexte(depuisBougies(bougies)); attacherEmpreinte(cx2, compact); cx2.atr15.fill(0.3); for (let i = 0; i < cx2.n; i++) cx2.atr15[i] = 0.3;
  const o = famN.signaux(cx2, p); let n = 0, bon = true; for (let i = 420; i < 520; i++) if (o.sens[i]) { n++; if (o.sens[i] > 0 ? !(o.stop[i] < 100.5) : !(o.stop[i] > 100.5)) bon = false; }
  v('retour_noeud_volume : prix dans la vallée de volume de la veille → signaux vers un nœud, stop de l’autre côté', n > 0 && bon, String(n));
  let hors = 0; for (let i = 0; i < 400; i++) if (o.sens[i]) hors++; v('retour_noeud_volume : aucun signal avant la barre de départ (400) : pas de profil exploitable', hors === 0);
}
/* ── filtres de contexte ── */
{ const m = masqueContexte(ctx, 'range'), t = masqueContexte(ctx, 'tendance'), h = masqueContexte(ctx, 'hors_range'); let ok2 = true; for (let i = 0; i < ctx.n; i++) if (m[i] && t[i]) ok2 = false;
  v('filtres : « range » et « tendance » s’excluent, « aucun » laisse tout passer', ok2 && masqueContexte(ctx, 'aucun') === null && masqueContexte(ctx, 'range') === m && h.some(x => x === 1)); }
/* ── validation de bout en bout d'une famille V4 avec le MÊME protocole (synthétique : elle ne doit pas être validée) ── */
{
  const long = marcheMixte(60000, 5), r = validerV3(long, 'balayage_retour', { variantesAvant: 8469, grille: { minTouches: [2], pad: [0.3], R: [3], volume: [0], contexte: ['aucun'] }, config: {} });
  v('validation : une famille V4 passe par le protocole V3 (statut défini, jeu final jamais ouvert)', ['non_validee', 'validee_backtest', 'insuffisant', 'rejetee_causalite'].includes(r.statut) && r.jeuFinalOuvert === false, r.statut + ' ' + (r.raison || ''));
  v('validation : sur un marché sans avantage, une famille V4 n’est PAS validée (les critères ne sont pas assouplis)', r.statut !== 'validee_backtest', r.statut);
  v('validation : empreintes des critères v1/v2/v3 reportées dans le résultat', r.criteres && r.criteres.v3 === 'c9b4ddd4' && r.criteres.v1 === 'c9995253');
}
/* ── familles « carnet » : générateurs de propositions ── */
{
  const e0 = { actif: 'BTC', t: 1e12, prix: 100, atr: 0.3, joursCarnet: 3, seuilUsd: 2e5, regime: 'tendance', tendance: 1 };
  v('5 générateurs carnet, chacun avec son hypothèse économique', ORDRE_CARNET.length === 5 && ORDRE_CARNET.every(id => /^Qui perd/.test(HYPOTHESES_CARNET[id].hypothese)));
  const murBid = { prix: 99.9, cote: 'bid', usdMax: 4e6, ratioMediane: 20, dureeS: 900, actif: true, distancePct: 0.1, fiabilite: { score: 0.85, niveau: 'fiable', executions: 2 } };
  const r1 = GENERATEURS_CARNET.rebond_mur({ ...e0, analyse: { murs: [murBid], pression: { pression: 0.1 } } });
  v('rebond_mur : mur acheteur FIABLE à 0,1 % → ACHAT, stop sous le mur, jamais « validée », preuve insuffisante dite', r1.length === 1 && r1[0].sens === 1 && r1[0].stop < 99.9 && r1[0].validee === false && /preuve insuffisante avant 14 jours/.test(r1[0].preuve), JSON.stringify(r1[0] && [r1[0].stop, r1[0].preuve]));
  v('rebond_mur : un mur « leurre probable » ou à pression fortement contraire → rien', GENERATEURS_CARNET.rebond_mur({ ...e0, analyse: { murs: [{ ...murBid, fiabilite: { score: 0.2, niveau: 'leurre probable', executions: 0 } }], pression: { pression: 0 } } }).length === 0 && GENERATEURS_CARNET.rebond_mur({ ...e0, analyse: { murs: [murBid], pression: { pression: -0.8 } } }).length === 0);
  const r2 = GENERATEURS_CARNET.cassure_mur_disparait({ ...e0, evenementsRecents: [{ type: 'retrait', cote: 'ask', prix: 100.1, usd: 5e5, t: 1e12 - 5000 }] });
  v('cassure_mur_disparait : un mur vendeur RETIRÉ (sans exécution) → ACHAT', r2.length === 1 && r2[0].sens === 1 && r2[0].stop < 100, JSON.stringify(r2[0] && r2[0].stop));
  v('cassure_mur_disparait : une exécution (pas un retrait) ou un retrait ancien → rien', GENERATEURS_CARNET.cassure_mur_disparait({ ...e0, evenementsRecents: [{ type: 'execution', cote: 'ask', prix: 100.1, usd: 5e5, t: 1e12 - 5000 }, { type: 'retrait', cote: 'ask', prix: 100.1, usd: 5e5, t: 1e12 - 60000 }] }).length === 0);
  const r3 = GENERATEURS_CARNET.continuation_desequilibre({ ...e0, analyse: { pression: { pression: 0.4, persistante: true }, cvd: { delta60s: 5e5 } } });
  v('continuation_desequilibre : pression acheteuse persistante + delta positif + tendance haussière → ACHAT', r3.length === 1 && r3[0].sens === 1);
  v('continuation_desequilibre : en range, ou si le delta contredit → rien', GENERATEURS_CARNET.continuation_desequilibre({ ...e0, regime: 'range', analyse: { pression: { pression: 0.4, persistante: true }, cvd: { delta60s: 5e5 } } }).length === 0 && GENERATEURS_CARNET.continuation_desequilibre({ ...e0, analyse: { pression: { pression: 0.4, persistante: true }, cvd: { delta60s: -5e5 } } }).length === 0);
  const casc = { debut: 1e12 - 400000, fin: 1e12 - 300000, usd: 3e6, cote: 'long', bas: 97.5, haut: 100, mouvementPct: -2.5 };
  const r4 = GENERATEURS_CARNET.cascade_liquidations({ ...e0, prix: 98, cascades: [casc] });
  v('cascade_liquidations : cascade de longs FINIE depuis > 2 min → ACHAT, stop sous le plus bas de la cascade', r4.length === 1 && r4[0].sens === 1 && r4[0].stop < 97.5, JSON.stringify(r4[0] && r4[0].stop));
  v('cascade_liquidations : jamais PENDANT la cascade (calme < 2 min)', GENERATEURS_CARNET.cascade_liquidations({ ...e0, prix: 98, cascades: [{ ...casc, fin: 1e12 - 30000 }] }).length === 0);
  const aim = { objectif: { prix: 100.8, cote: 'haut', distancePct: 0.8, explication: 'mur vendeur de 8× la médiane' }, defense: { prix: 99.7 }, invalidation: { prix: 99.5, texte: 'si le prix clôture sous 99,5, la lecture est fausse' }, confiance: 'moyenne' };
  const r5 = GENERATEURS_CARNET.aimant_carte({ ...e0, analyse: { aimants: aim } }); v('aimant_carte : objectif à +0,8 %, invalidation 99,5 → ACHAT avec R = distance / risque (1,6)', r5.length === 1 && r5[0].sens === 1 && Math.abs(r5[0].R - 1.6) < 0.01 && r5[0].cible === 100.8, JSON.stringify(r5[0] && r5[0].R));
  v('aimant_carte : confiance « faible » → aucune proposition', GENERATEURS_CARNET.aimant_carte({ ...e0, analyse: { aimants: { ...aim, confiance: 'faible' } } }).length === 0);
  const tout = proposerCarnet({ ...e0, analyse: { murs: [murBid], pression: { pression: 0.4, persistante: true }, cvd: { delta60s: 5e5 }, aimants: aim } });
  v('proposerCarnet : rassemble les familles ; aucune n’est validée ; une famille cassée ne bloque pas les autres', tout.length >= 3 && tout.every(p => p.validee === false) && proposerCarnet({ ...e0, analyse: null, evenementsRecents: null, cascades: null }).length === 0 && proposerCarnet(null).length === 0);
  v('preuve : le seuil de jours est dit (14)', JOURS_PREUVE_MIN === 14 && /seuil de jours atteint/.test(proposerCarnet({ ...e0, joursCarnet: 20, analyse: { murs: [murBid], pression: { pression: 0.1 } } })[0].preuve));
  v('stop hors limites jamais proposé (mur à 3 % → stop à plus de 1,5 %)', GENERATEURS_CARNET.rebond_mur({ ...e0, atr: 5, analyse: { murs: [murBid], pression: { pression: 0 } } }).length === 0);
}
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
