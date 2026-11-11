/* Tests de risque-prop-calcul : restes de perte journalière et totale, objectif, alerte douce à 70 %, risque d'une position, taille suggérée, contexte à la pose, rattachement au journal. */
import * as R from '../front/or/risque-prop-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const now = Date.UTC(2026, 10, 11, 12, 0), H = 3600e3;
const trade = (pl, h, id) => ({ id: id || 't' + h + pl, sens: 'achat', entree: 4000, stop: 3990, taille: 1, sortie: 4001, pl, tEntree: now - (h + 1) * H, tSortie: now - h * H, source: 'saisie' });
// compte neuf
let E = R.etatProp([], { maintenant: now }); v(E.capital === 10000 && E.limiteJour$ === 300 && E.limiteTotale$ === 600 && E.objectif$ === 1000, 'compte neuf : 10 000 $, perte du jour 300 $, perte totale 600 $, objectif 1 000 $');
v(E.resteJour$ === 300 && E.margeTotale$ === 600 && E.resteObjectif$ === 1000 && !E.alerteDouce, 'compte neuf : tout reste disponible, pas d\'alerte');
// perte du jour de 150 $ (1,5 %) = 50 % de la limite
E = R.etatProp([trade(-150, 1)], { maintenant: now }); v(Math.abs(E.resteJour$ - 150) < 1e-6 && Math.abs(E.utiliseJour - 0.5) < 1e-9 && !E.alerteDouce, 'perte du jour 150 $ : il reste 150 $, 50 % utilisé, pas encore d\'alerte douce');
E = R.etatProp([trade(-210, 1)], { maintenant: now }); v(E.alerteDouce && Math.abs(E.utiliseJour - 0.7) < 1e-9, 'perte du jour 210 $ = 70 % de 300 $ : alerte douce'); v(/Alerte douce/.test(R.messageAlerteDouce(E)) && /rien n'est bloqué/.test(R.messageAlerteDouce(E)) && !/(achète|vends)/i.test(R.messageAlerteDouce(E)), 'message de l\'alerte douce : information, rien n\'est bloqué');
E = R.etatProp([trade(-299, 1)], { maintenant: now }); v(E.alerteDouce, '299 $ perdus : encore l\'alerte douce'); E = R.etatProp([trade(-301, 1)], { maintenant: now }); v(!E.alerteDouce && E.limiteJourAtteinte && E.resteJour$ === 0, '301 $ perdus : limite atteinte (plus d\'alerte douce, reste 0)');
// perte totale : une perte hier de 400 $ puis 100 $ aujourd'hui
E = R.etatProp([trade(-400, 30), trade(-100, 1)], { maintenant: now }); v(Math.abs(E.margeTotale$ - 100) < 1e-6 && E.equite === 9500, 'perte totale 500 $ : marge restante 100 $ avant le seuil de 600 $');
E = R.etatProp([trade(+500, 30)], { maintenant: now }); v(E.gain$ === 500 && E.resteObjectif$ === 500 && Math.abs(E.avancement - 0.5) < 1e-9, 'gain de 500 $ : il reste 500 $ pour l\'objectif de +10 %');
// alerte une seule fois par jour
v(R.doitAlerter({ alerteDouce: true }, null, '2026-11-11') && !R.doitAlerter({ alerteDouce: true }, { jour: '2026-11-11', faite: true }, '2026-11-11') && R.doitAlerter({ alerteDouce: true }, { jour: '2026-11-10', faite: true }, '2026-11-11') && !R.doitAlerter({ alerteDouce: false }, null, '2026-11-11'), 'alerte douce : une fois par jour de Paris');
// risque d'une position
let r = R.risquePosition({ entree: 4000, stop: 3990, taille: 2, equite: 10000 }); v(r.ok && r.risque$ === 20 && Math.abs(r.risquePct - 0.2) < 1e-9, 'risque d\'une position : 10 $ de stop × 2 onces = 20 $ = 0,2 %');
v(!R.risquePosition({ entree: 4000, stop: null, taille: 1, equite: 10000 }).ok, 'risque : stop manquant → non calculable (jamais inventé)');
const t = R.tailleSuggeree({ equite: 10000, risquePct: 0.5, entree: 4000, stop: 3990 }); v(t.ok && t.contrats === 5 && t.risque$ === 50, 'taille suggérée : 0,5 % de 10 000 $ = 50 $ pour un stop de 10 $ → 5 contrats');
// contexte à la pose
const zonesAff = [{ bas: 3998, haut: 4002, cote: 'support', elements: [{ nom: 'Support 3 998–4 002 · 4 touches' }], retournee: false, tDebut: now - 5 * H }, { bas: 4100, haut: 4104, cote: 'resistance', elements: [{ nom: 'Résistance' }] }];
const zr = [{ bas: 3997, haut: 4003, prob: 0.62, probN: 18, probSrc: 'testée 18 fois, a tenu 11' }];
let c = R.contextePose({ pos: { entree: 4001, stop: 3990, objectif: 4020, sens: 'achat' }, t: now, prix: 4002, a: 8, zonesAffichees: zonesAff, zonesRetour: zr, etatMarche: 'Tendance H4 haussière', killzone: 'Londres' });
v(c.zone && c.zone.dedans && c.zone.cote === 'support' && c.probabilite.mesuree && c.probabilite.valeur === 0.62 && c.probabilite.n === 18, 'contexte de pose : zone dans laquelle l\'entrée tombe + probabilité mesurée avec son n');
c = R.contextePose({ pos: { entree: 4050, stop: 4040, sens: 'achat' }, t: now, prix: 4050, a: 8, zonesAffichees: zonesAff, zonesRetour: zr }); v(c.zone === null && !c.probabilite.mesuree && /aucune zone proche/.test(c.probabilite.source), 'loin de toute zone : « aucune zone proche », jamais une probabilité inventée');
c = R.contextePose({ pos: { entree: 4001, stop: 3990, sens: 'achat' }, t: now, prix: 4002, a: 8, zonesAffichees: zonesAff, zonesRetour: [{ bas: 3997, haut: 4003, prob: null, probN: 2 }] }); v(!c.probabilite.mesuree && /non mesurée/.test(c.probabilite.source), 'zone sans mesure : « non mesurée »');
const p = R.phraseContexte(R.contextePose({ pos: { entree: 4001, stop: 3990, objectif: 4020, sens: 'achat' }, t: now, prix: 4002, a: 8, zonesAffichees: zonesAff, zonesRetour: zr, etatMarche: 'Tendance H4 haussière', killzone: 'Londres' })); v(/zone la plus proche/.test(p) && /probabilité mesurée 62 %/.test(p) && /killzone : Londres/.test(p), 'phrase du contexte de pose');
// rattachement au journal, à l'heure près
const poses = [{ t: now - 3 * H, sens: 'achat', entree: 4001 }, { t: now - 10 * H, sens: 'vente', entree: 4050 }];
const tr1 = { id: 'a', sens: 'achat', tEntree: now - 3 * H + 5 * 60e3 }, tr2 = { id: 'b', sens: 'vente', tEntree: now - 10 * H - 2 * 60e3 }, tr3 = { id: 'c', sens: 'achat', tEntree: now - 6 * H };
const m = R.rattacher(poses, [tr1, tr2, tr3]); v(m.a && m.a.t === poses[0].t && m.b && m.b.t === poses[1].t && !m.c, 'journal : chaque trade reçoit le contexte de SA pose (à 20 minutes près, sens compatible), sinon rien');
v(JSON.stringify(R.rattacher(poses, [tr1, tr2, tr3], m)) === JSON.stringify(m), 'rattachement idempotent (ajout seul)');
console.log(`risque-prop : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
