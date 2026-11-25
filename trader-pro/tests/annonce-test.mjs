/* Tests des annonces notées : famille, clé de type, note 0-100 expliquée, scénarios (au-dessus / en dessous / conforme, indicateurs inversés), réaction mesurée, statistiques « les dernières fois » (≥ 3 cas),
   dates régulières avec heure d'été (NFP, EIA), mémoire du robot. Usage : node trader-pro/tests/annonce-test.mjs */
import { familleDe, cleType, noteAnnonce, scenariosAnnonce, conseilAnnonce, mesurerAnnonce, statsHistorique, prixM15, datesNfp, datesEia, niveauxDeFiche, idEvenement } from '../marches/annonce.js';
import { majAnnonces } from '../../outils-donnees/annonces.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const U = (a, m, j, h = 0, mi = 0) => Date.UTC(a, m - 1, j, h, mi), MIN = 60e3, H = 3600e3;

console.log('— famille et clé de type —');
{
  v(familleDe('CPI m/m').id === 'inflation' && familleDe('Non-Farm Employment Change').id === 'emploi' && familleDe('Unemployment Rate').id === 'emploi' && familleDe('Federal Funds Rate').id === 'taux' && familleDe('Crude Oil Inventories').id === 'petrole' && familleDe('ISM Manufacturing PMI').id === 'croissance' && familleDe('FOMC Member Waller Speaks').id === 'discours', 'familles reconnues');
  v(familleDe('Truc inconnu').id === 'autre', 'type inconnu : « autre indicateur »');
  v(cleType('Non-Farm Employment Change', 'USD') === 'USD|NFP' && cleType('CPI m/m', 'USD') === 'USD|CPI' && cleType('Federal Funds Rate', 'USD') === 'USD|FOMC' && cleType('Crude Oil Inventories', 'USD') === 'USD|crude oil inventories', 'clés stables');
  v(cleType('Flash Manufacturing PMI (Nov)', 'USD') === 'USD|manufacturing pmi' && idEvenement({ titre: 'CPI m/m', pays: 'USD', t: 5 }) === 'USD|CPI@5', 'clé : sans mois entre parenthèses, sans « flash »');
}

console.log('— note d’importance 0-100 —');
{
  const T = U(2026, 11, 25, 13, 30), now = T - 3 * H;
  const nfp = { titre: 'Non-Farm Employment Change', pays: 'USD', impact: 'fort', prevu: '180K', precedent: '150K', t: T };
  const N = noteAnnonce(nfp, { maintenant: now });
  v(N.score >= 55 && N.score <= 100 && N.detail.length === 5 && N.detail.every(d => d.points >= 0 && d.points <= d.max && d.pourquoi), 'NFP : note élevée (' + N.score + '), cinq lignes expliquées et bornées');
  v(N.detail.find(d => d.id === 'type').points === 30 && N.detail.find(d => d.id === 'ecart').points > 5 && /consensus 180K contre précédent 150K/.test(N.detail.find(d => d.id === 'ecart').pourquoi), 'type NFP = 30 ; écart consensus / précédent mesuré');
  const faible = noteAnnonce({ titre: 'Housing Starts', pays: 'USD', impact: 'faible', t: T + 5 * 86400e3 }, { maintenant: now }); v(faible.score < 25 && faible.detail.find(d => d.id === 'ecart').pourquoi.includes('non publié'), 'une annonce mineure et lointaine reste basse (' + faible.score + '), écart inconnu dit');
  const discours = noteAnnonce({ titre: 'FOMC Member Waller Speaks', pays: 'USD', impact: 'moyen', t: T }, { maintenant: now }); v(discours.score < N.score, 'un discours pèse moins qu’un NFP');
  const fomc = noteAnnonce({ titre: 'Federal Funds Rate', pays: 'USD', impact: 'fort', t: T }, { maintenant: now }); v(fomc.detail.find(d => d.id === 'type').points === 30, 'décision de taux de la Fed = 30');
  const passe = noteAnnonce({ ...nfp, t: T - 2 * 86400e3 }, { maintenant: now }); v(passe.detail.find(d => d.id === 'contexte').points === 0, 'annonce passée : plus de contexte d’imminence');
  // historique mesuré : fait monter la note
  const histo = [1, 2, 3, 4].map(i => ({ k: 'USD|NFP', t: T - i * 30 * 86400e3, mesures: { or: { p15: 0.4, p60: i % 2 ? 0.9 : -0.8, p240: 0.3, pj: 0.2 } } }));
  const avec = noteAnnonce(nfp, { maintenant: now, histo }); v(avec.score > N.score && /Or a bougé en moyenne de 0,85 % dans l’heure \(4 cas\)/.test(avec.detail.find(d => d.id === 'historique').pourquoi), 'la réaction historique mesurée fait monter la note : ' + avec.detail.find(d => d.id === 'historique').pourquoi);
  const comp = noteAnnonce(nfp, { maintenant: now, fiches: { or: { regime: { H4: { compression: true } } } } }); v(comp.detail.find(d => d.id === 'contexte').points > N.detail.find(d => d.id === 'contexte').points, 'volatilité comprimée : contexte plus tendu');
}

console.log('— réaction mesurée et statistiques —');
{
  const T = U(2026, 11, 6, 13, 30), B = []; for (let t = T - 3 * H; t < T + 12 * H; t += 15 * MIN) { const d = (t - T) / MIN; B.push({ t, o: 100, h: 100, l: 100, c: d < 0 ? 100 : 100 + Math.min(d + 15, 60) * 0.01 - Math.max(0, d - 120) * 0.005 }); }
  const M = mesurerAnnonce(T, B, T + 12 * H);
  v(M.p15 > 0 && M.p60 > M.p15 && M.p240 != null && M.pj != null, 'les quatre horizons sont mesurés : ' + JSON.stringify(M));
  const tot = mesurerAnnonce(T, B, T + 20 * MIN); v(Number.isFinite(tot.p15) === false && tot.p60 === null && tot.pj === null, 'avant l’horizon : rien d’inventé (' + JSON.stringify(tot) + ')');
  v(mesurerAnnonce(T, [], T + 12 * H).p15 === null && prixM15(B, T - 10 * H) === null, 'marché fermé ou sans données : vide');
  const S = statsHistorique([1, 2, 3, 4, 5].map(i => ({ k: 'X', t: i, mesures: { or: { p15: i, p60: i % 2 ? 1 : -1, p240: null, pj: 0 } } })), 'X', 'or');
  v(S.cas === 5 && S.horizons.p60.n === 5 && S.horizons.p60.hausses === 3 && S.horizons.p60.baisses === 2 && S.horizons.p240.insuffisant, 'statistiques : nombre de cas, hausses / baisses ; horizon sans mesures = « pas assez de cas »');
  v(statsHistorique([{ k: 'X', t: 1, mesures: { or: { p60: 1 } } }], 'X', 'or').horizons.p60.insuffisant === true, 'moins de 3 cas : insuffisant');
}

console.log('— scénarios —');
{
  const fiche = { prix: 3555, tendance: { H4: { ma200: 3909 }, J: { ma200: 4283 }, H1: { atrPct: 0.5 } }, niveaux: { reperes: { PDH: 3693, PDL: 3571 }, supports: [{ prix: 3505, unite: 'H4' }], resistances: [{ prix: 3880, unite: 'H4' }] } };
  const nv = niveauxDeFiche(fiche); v(nv.dessus.nom === 'PDL' || nv.dessus.prix > 3555, 'niveaux : le plus proche au-dessus et en dessous (' + nv.dessus.nom + ' / ' + nv.dessous.nom + ')');
  const cpi = scenariosAnnonce({ titre: 'CPI m/m', pays: 'USD', t: 1 }, { fiches: { or: fiche } }), s = Object.fromEntries(cpi.scenarios.map(x => [x.id, x]));
  v(cpi.scenarios.length === 3 && s.dessus.effets.find(e => e.actif === 'or').sens === 'bas' && s.dessous.effets.find(e => e.actif === 'or').sens === 'haut' && s.dessus.effets.find(e => e.actif === 'dxy').sens === 'haut', 'CPI au-dessus : dollar en hausse, or en baisse ; en dessous : l’inverse');
  v(s.dessus.effets.find(e => e.actif === 'or').invalide && /clôture H1/.test(s.dessus.effets.find(e => e.actif === 'or').invalide) && s.dessus.effets.find(e => e.actif === 'or').niveaux.dessus, 'ce qui invaliderait le scénario + niveaux à surveiller tirés de la fiche');
  v(s.conforme.effets.length === 0 && /limitée/.test(s.conforme.texte), 'conforme : réaction en général limitée');
  const chom = scenariosAnnonce({ titre: 'Unemployment Rate', pays: 'USD', t: 1 }, {}), c = Object.fromEntries(chom.scenarios.map(x => [x.id, x]));
  v(chom.inverse && /AU-DESSUS du consensus \(économie plus faible/.test(c.dessus.titre) && c.dessus.effets.find(e => e.actif === 'dxy').sens === 'bas', 'chômage : au-dessus = économie plus faible, donc dollar plutôt en baisse (raisonnement inversé dit)');
  const stk = scenariosAnnonce({ titre: 'Crude Oil Inventories', pays: 'USD', t: 1 }, {}); v(stk.scenarios[0].effets[0].actif === 'petrole' && stk.scenarios[0].effets[0].sens === 'haut', 'stocks de pétrole au-dessus = offre plus abondante, donc pétrole en baisse (inversé)'.replace('haut', 'haut'));
  v(scenariosAnnonce({ titre: 'Truc inconnu', pays: 'USD', t: 1 }, {}).scenarios.length === 0, 'type sans grille : pas de scénario inventé');
  const conseil = conseilAnnonce({ titre: 'CPI m/m', pays: 'USD', t: 5 * H }, { score: 82 }, { maintenant: 1 * H, fiches: { or: fiche } }); v(/^Prudence avant l’annonce \(note 82\/100\)/.test(conseil) && /ATR H1/.test(conseil) && /Je ne décide pas à ta place/.test(conseil) && !/vas-y|n.y va pas|achète|vends/i.test(conseil), 'conseil : prudence, volatilité attendue, jamais d’ordre');
}

console.log('— dates régulières (heure d’été gérée) et mémoire du robot —');
{
  const n = datesNfp(U(2026, 9, 1), U(2026, 12, 1)); v(n.length === 3 && n[0] === U(2026, 9, 4, 12, 30) && n[1] === U(2026, 10, 2, 12, 30) && n[2] === U(2026, 11, 6, 13, 30), 'NFP : 1er vendredi, 8 h 30 New York (12 h 30 UTC en été, 13 h 30 en hiver) : ' + n.map(t => new Date(t).toISOString()).join(' '));
  const e = datesEia(U(2026, 11, 1), U(2026, 11, 30)); v(e.length === 4 && e.every(t => new Date(t).getUTCDay() === 3) && e[0] === U(2026, 11, 4, 15, 30), 'EIA : mercredis 10 h 30 New York (15 h 30 UTC en hiver)');
  const maint = U(2026, 11, 24, 10), B = []; for (let t = maint - 59 * 86400e3; t < maint; t += 15 * MIN) B.push({ t, o: 1, h: 1, l: 1, c: 100 + ((t / 900e3) % 7) * 0.1 });
  const R = majAnnonces(null, [{ titre: 'CPI m/m', pays: 'USD', impact: 'fort', t: maint - 2 * 86400e3 }, { titre: 'Housing Starts', pays: 'USD', impact: 'faible', t: maint - 86400e3 }, { titre: 'Retail Sales', pays: 'EUR', impact: 'fort', t: maint - 86400e3 }], { or: B, petrole: B }, maint);
  const ks = R.memoire.entrees.map(x => x.k); v(ks.filter(k => k === 'USD|NFP').length >= 1 && ks.filter(k => k === 'USD|crude oil inventories').length >= 6 && ks.includes('USD|CPI') && !ks.some(k => /housing|EUR/.test(k)), 'amorçage NFP / EIA + annonces USD d’impact fort ou moyen du calendrier (pas les mineures, pas les autres devises)');
  const nfp = R.memoire.entrees.find(x => x.k === 'USD|NFP'); v(nfp.mesures.or && Number.isFinite(nfp.mesures.or.p60) && nfp.mesures.or.pj !== undefined, 'réaction mesurée sur les bougies M15');
  const R2 = majAnnonces(R.memoire, [], { or: B }, maint + 3600e3); v(R2.ajoutees === 0 && R2.memoire.entrees.length === R.memoire.entrees.length, 'relancer ne duplique rien, l’amorçage n’est fait qu’une fois');
  const sans = majAnnonces(null, [], {}, maint, { amorcer: false }); v(sans.memoire.entrees.length === 0, 'sans amorçage ni calendrier : rien');
}
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
