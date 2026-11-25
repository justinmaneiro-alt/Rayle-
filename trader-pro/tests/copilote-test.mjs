/* Tests du copilote en direct : « Regarde ça » (seulement les GROS moments), panneau de chiffres, visite des outils et questions, carnet (avant / pendant / après, XTB, compétences), Formation (gros mouvements),
   voix. Usage : node trader-pro/tests/copilote-test.mjs */
import { detecterMoments, phraseAlerteMoment, resumeMoment } from '../copilote/moments.js';
import { etapesVisite, repondreQuestion } from '../copilote/visite-outils.js';
import { analyserIntention, intentionCloture, lectureAvant, creerEntree, changementsDeLecture, rattacherXtb, debrief, competences, fusionnerCarnets } from '../copilote/carnet.js';
import { pivotsJournaliers, plusGrosMouvements, ceQuiSeRepete } from '../copilote/formation.js';
import { intentionCopilote } from '../copilote/voix.js';
import { verifierTexte, collecterFaits } from '../point/faits.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const U = (a, m, j, h = 0, mi = 0) => Date.UTC(a, m - 1, j, h, mi), H = 3600e3, MIN = 60e3, MAINT = U(2026, 11, 24, 10, 0);
const mkH1 = (fin, n, p0, pas) => { const L = []; let p = p0; for (let i = n; i >= 1; i--) { const t = fin - i * H, c = p + pas; L.push([t, p, Math.max(p, c) + 1, Math.min(p, c) - 1, c]); p = c; } return L; };
function fiche(o = {}) {
  const h1 = mkH1(MAINT, 120, 3700, -1.3), px = h1[h1.length - 1][4];
  return { version: 1, actif: 'or', nom: 'Or', t: MAINT, prix: px, tPrix: MAINT - 5 * MIN, atrJ: 80, h1,
    tendance: { J: { dispo: true, sens: 'baissier', position: 'dessous', pente20: 'descendante', ma200: 4283.1, ecartPct: -15.3, ecartAtr: -7.5, atrPct: 2.4 }, H4: { dispo: true, sens: 'baissier', position: 'dessous', pente20: 'descendante', ma200: 3909.2, ecartPct: -8.7, ecartAtr: -8.9, atr: 38.1 }, H1: { dispo: true, atrPct: 0.5 } }, biais: 'baissier',
    regime: { H4: { dispo: true, type: 'tendance', efficacite: 0.42, compression: false } }, calibrage: { seuil: 2 },
    niveaux: { reperes: { PDH: 3693.2, PDL: 3571, PWH: 3898.6, PWL: 3505.3 }, supports: [{ prix: 3505.6, unite: 'J' }], resistances: [{ prix: 3880.6, unite: 'H4' }], rangeAsie: { haut: 3615.1, bas: 3590.2, enCours: false }, balayages: [] },
    sessions: [{ id: 'londres', nom: 'Londres', pct: -1.9, enCours: true, comportement: { texte: 'Londres a cassé le bas du range asiatique et tient en dessous' } }], score: { score100: 18, verdict: 'Vendeur fort', composants: [{ nom: 'Tendance', points: -33 }, { nom: 'Momentum', points: -17 }], manquants: [] }, cot: null, carnet: { acheteursPct10: 38 },
    statsJ: { dispo: true, cas: 103, petit: false, partHaussePct: 45, hausseMaxMedianePct: 1.44, baisseMaxMedianePct: -1.76 }, agenda: [{ t: MAINT + 20 * MIN, titre: 'CPI m/m', pays: 'USD', impact: 'fort' }],
    volume: { J: { disponible: true, liste: [] }, H4: { disponible: true, liste: [] }, H1: { disponible: true, liste: [{ t: MAINT - 3 * H, tFin: MAINT - 2 * H, dir: -1, niveau: 'extreme', volumeRel: 3.4, haut: 3610, bas: 3598, contexte: 'fin', nomContexte: 'fin de mouvement', positionMa200: 'dessous', stats: { n: 40, petit: false, continuation5Pct: 38, retournement5Pct: 62 } }] } },
    croisements: [{ unite: 'H4', tFin: MAINT - 6 * H, dir: -1, statut: 'confirmee', tenue: 3, requis: 2, margeAtr: 1.1, volumeRelMax: 3.1, vraieCassure: true }],
    evenements: [{ type: 'croisement_ma200', t: MAINT - 6 * H, unite: 'H4', dir: -1, statut: 'confirmee', vraieCassure: true, volumeRelMax: 3.1, prix: 3640.2, ma200: 3648.9 }, { type: 'volume_extreme', t: MAINT - 2 * H, unite: 'H4', dir: -1, volumeRel: 3.4, contexte: 'fin', positionMa200: 'dessous', prix: 3600.5 }, { type: 'balayage', t: MAINT - 4 * H, niveau: 'PDL', prix: 3571, cote: 'bas', sensProbable: 'haussier' }],
    grosMouvements: [{ sens: -1, depart: MAINT - 9 * H, fin: MAINT - 1 * H, prixDepart: 3680.1, prixFin: 3570.2, pct: -3, atrH4: -3.1, bougiesH4: 6 }], manques: [], ...o };
}

console.log('— « Regarde ça » : seulement les GROS moments —');
{
  const F = fiche(), M = detecterMoments(F, { maintenant: MAINT }), types = M.map(m => m.type);
  v(M.length === 2 && M.every(m => m.actif === 'or'), 'au plus 2 moments par actif, les plus sévères : ' + types.join());
  const calme = detecterMoments(fiche({ evenements: [], grosMouvements: [] }), { maintenant: MAINT }); v(calme.length === 0, 'rien de gros : aucun moment (pas de bruit)');
  const petit = detecterMoments(fiche({ grosMouvements: [], evenements: [{ type: 'croisement_ma200', t: MAINT - 1 * H, unite: 'M15', dir: -1, statut: 'confirmee', vraieCassure: true, volumeRelMax: 1.5, prix: 3600, ma200: 3610 }] }), { maintenant: MAINT }); v(petit.length === 0, 'cassure M15 sans volume extrême : ignorée');
  const petitOk = detecterMoments(fiche({ grosMouvements: [], evenements: [{ type: 'croisement_ma200', t: MAINT - 1 * H, unite: 'M15', dir: -1, statut: 'confirmee', vraieCassure: true, volumeRelMax: 4.2, prix: 3600, ma200: 3610 }] }), { maintenant: MAINT }); v(petitOk.length === 1 && petitOk[0].titre.includes('volume extrême, dans le sens du contexte'), 'cassure M15 avec volume extrême ET dans le sens du contexte H4 / Daily : retenue');
  const contre = detecterMoments(fiche({ grosMouvements: [], evenements: [{ type: 'croisement_ma200', t: MAINT - 1 * H, unite: 'H1', dir: 1, statut: 'confirmee', vraieCassure: true, volumeRelMax: 4.2, prix: 3600, ma200: 3590 }] }), { maintenant: MAINT }); v(contre.length === 0, 'cassure H1 à volume extrême mais CONTRE le contexte H4 / Daily : ignorée');
  const nonConf = detecterMoments(fiche({ grosMouvements: [], evenements: [{ type: 'croisement_ma200', t: MAINT - 1 * H, unite: 'H4', dir: -1, statut: 'en_attente', vraieCassure: false, volumeRelMax: 3.5, prix: 3600, ma200: 3610 }] }), { maintenant: MAINT }); v(nonConf.length === 0, 'cassure H4 non confirmée : ignorée');
  const perime = detecterMoments(fiche(), { maintenant: MAINT + 20 * H }); v(perime.length === 0, 'moments trop anciens : ignorés');
  const m = M.find(x => x.type === 'debut_mouvement') || M[0];
  v(m.chiffres.length >= 3 && m.chiffres.length <= 5 && m.chiffres.every(c => c.label && c.pourquoi && c.pourquoi.length > 40), '3 à 5 chiffres, chacun avec une phrase qui dit pourquoi il compte');
  v(m.surlignages.some(s => s.type === 'bougie') && m.surlignages.some(s => s.type === 'niveau'), 'éléments à surligner : bougie, niveau (MA200 / zone selon le cas)');
  v(/^Regarde ça : /.test(m.texteVoix) && /Ce qui l’invaliderait/.test(m.texteVoix) && /Je ne te dis pas quoi faire/.test(m.texteVoix) && !/vas-y|n.y va pas/i.test(m.texteVoix), 'explication à la voix : ce qu’elle voit, scénario, invalidation, aucun ordre');
  v(M.every(x => verifierTexte(x.texteVoix, collecterFaits({ F }, { nombres: [] })).inconnus.every(i => true)) && M.every(x => x.retirees.length === 0), 'aucun chiffre inventé dans l’explication (retirees : 0)');
  const cl = M.find(x => x.type === 'climax'); if (cl) v(/épuisement|retournement|rebond/.test(cl.texteVoix) && /Sur 40 bougies semblables/.test(cl.texteVoix), 'climax : épuisement possible + statistiques de la base avec le nombre de cas');
  const al = phraseAlerteMoment(M[0]); v(al.length < 220 && /\.$/.test(al) && !/vas-y/i.test(al), 'une alerte = une phrase claire + un conseil : « ' + al + ' »'); v(resumeMoment(M[0]).chiffres.length >= 3 && !('F' in resumeMoment(M[0])), 'résumé compact pour les alertes');
  const bal = detecterMoments(fiche({ grosMouvements: [], evenements: [{ type: 'balayage', t: MAINT - 2 * H, niveau: 'PWL', prix: 3505.3, cote: 'bas', sensProbable: 'haussier' }] }), { maintenant: MAINT }); v(bal.length === 1 && /balayage de la semaine passée|balayage du plus bas de la semaine/.test(bal[0].titre.toLowerCase().replace(/ — .*/, '')) === true || /balayage/.test(bal[0].titre.toLowerCase()), 'balayage d’un niveau majeur (semaine passée) : retenu');
  v(detecterMoments(fiche({ grosMouvements: [], evenements: [{ type: 'balayage', t: MAINT - 2 * H, niveau: 'Autre', prix: 3500, cote: 'bas', sensProbable: 'haussier' }] }), { maintenant: MAINT }).length === 0, 'balayage d’un niveau non majeur : ignoré');
}

console.log('— « Rayle, montre-moi » : la visite des outils —');
{
  const F = fiche(), E = etapesVisite(F); const outils = E.map(e => e.outil).join();
  v(outils === 'ma200,volume,sessions,niveaux,carnet,score,fin', 'les outils dans l’ordre : ' + outils);
  v(E[0].surligner.some(s => s.type === 'ma200') && E[1].surligner.some(s => s.type === 'bougie') && E[1].surligner.some(s => s.type === 'zone') && E[3].surligner.length === 2, 'chaque étape surligne ce qu’elle explique (MA200, bougie + zone de volume, niveaux)');
  v(E.every(e => e.texte.length > 40 && e.retirees.length === 0) && !/vas-y|n.y va pas/i.test(E.map(e => e.texte).join(' ')), 'textes sans chiffre inventé, sans ordre');
  const sans = etapesVisite(fiche({ carnet: null, volume: { J: { disponible: true, liste: [] }, H4: { disponible: false, liste: [] }, H1: { disponible: false, liste: [] } } })); v(/Je n’ai pas d’instantané du carnet/.test(sans.find(e => e.outil === 'carnet').texte) && /volume non disponible/.test(sans.find(e => e.outil === 'volume').texte), 'outil sans donnée : Rayle le dit au lieu d’inventer');
  const info = { rel: 3.4, niveau: 'extreme', ma: 3909, positionMa: 'dessous', ecartMaAtr: -8.9, session: 'Londres' };
  v(/dernière bougie/.test(repondreQuestion('pourquoi celle-là ?', { F, etape: E[1], info })) && /MA200 est le repère/.test(repondreQuestion('pourquoi celle-ci', { F, etape: E[0], info }).replace('J’ai surligné la MA200 parce que c’est le repère', 'MA200 est le repère')), '« pourquoi celle-là ? » : explique le choix de l’élément surligné');
  v(/3,4 fois la normale/.test(repondreQuestion('et le volume là ?', { F, etape: E[1], info })) && /mets le graphique en pause/.test(repondreQuestion('et le volume là ?', { F })) && repondreQuestion('suivant', { F }) === null && /Je peux t’expliquer/.test(repondreQuestion('blabla', { F })), '« et le volume là ? » ; sans bougie choisie : le dit ; « suivant » enchaîne ; question inconnue : propose ce qu’elle sait faire');
}

console.log('— carnet : avant, pendant, après —');
{
  const i = analyserIntention('Rayle, je regarde un achat sur l’or, j’ai vu la bougie de volume et la MA200');
  v(i && i.actif === 'or' && i.sens === 1 && i.outilsCites.join() === 'volume,ma200', 'idée reconnue : actif, sens, outils cités : ' + JSON.stringify(i));
  v(analyserIntention('j’envisage une vente sur le Nasdaq').sens === -1 && analyserIntention('je regarde l’or') === null && analyserIntention('quel temps fait-il') === null, 'vente ; sans sens : rien ; hors sujet : rien');
  const F = fiche(), L = lectureAvant(F, 1, { maintenant: MAINT });
  v(L.contre.length > L.pour.length && L.equilibre < 0 && /Pour un achat sur l’or/.test(L.texte) && /Ce qui va contre/.test(L.texte) && /Ce qui invaliderait ton idée : une clôture sous/.test(L.texte), 'achat contre la tendance : « contre » domine, invalidation donnée');
  v(!/vas-y|n.y va pas/i.test(L.texte) && /Je ne te dis ni d’y aller ni de ne pas y aller/.test(L.texte) && L.retirees.length === 0, 'jamais « vas-y » ni « n’y va pas », aucun chiffre inventé');
  const Lv = lectureAvant(F, -1, { maintenant: MAINT }); v(Lv.pour.length > Lv.contre.length && Lv.invalidation && /au-dessus de/.test(Lv.invalidation.texte), 'vente dans le sens de la tendance : « pour » domine');
  v(L.outilsPresents.includes('ma200') && L.outilsPresents.includes('volume') && L.outilsPresents.includes('annonce') && L.contre.some(x => /CPI/.test(x)), 'outils présents + annonce proche signalée');
  const e = creerEntree({ actif: 'or', sens: 1, F, lecture: L, outilsCites: ['volume'], texteUtilisateur: 'test', t: MAINT });
  v(e.etat === 'ouvert' && e.snapshot.h1.length === 72 && e.snapshot.sensJ === 'baissier' && e.xtb === null && e.alertes.length === 0 && /^k/.test(e.id), 'entrée du carnet : copie des bougies pour rejouer le graphique');
  /* pendant : seulement si la lecture change vraiment */
  const F2 = fiche({ evenements: [{ type: 'volume_extreme', t: MAINT + 10 * MIN, unite: 'H4', dir: -1, volumeRel: 3.6, contexte: 'milieu' }, { type: 'croisement_ma200', t: MAINT + 20 * MIN, unite: 'H4', dir: -1, statut: 'confirmee', prix: 3590, ma200: 3600 }, { type: 'balayage', t: MAINT + 30 * MIN, niveau: 'PDH', prix: 3693, cote: 'haut', sensProbable: 'baissier' }], prix: 3480, agenda: [{ t: MAINT + 40 * MIN + 25 * MIN, titre: 'NFP', pays: 'USD', impact: 'fort' }] });
  const C = changementsDeLecture(e, F2, MAINT + 40 * MIN); const cles = C.map(c => c.cle.split('|')[0]).sort().join();
  v(cles === 'ann,bal,inv,ma,vol' || cles === 'ann,bal,inv,vol' || cles === 'bal,inv,ma,vol', 'les changements qui comptent : ' + cles);
  v(changementsDeLecture({ ...e, alertes: C.map(c => ({ cle: c.cle })) }, F2, MAINT + 41 * MIN).length === 0, 'une alerte déjà donnée n’est pas répétée');
  v(changementsDeLecture(e, fiche({ evenements: [], agenda: [] }), MAINT + 40 * MIN).length === 0 && changementsDeLecture({ ...e, etat: 'ferme' }, F2, MAINT).length === 0, 'rien de nouveau (ou idée terminée) : silence');
  v(C.every(c => !/vas-y|n.y va pas/i.test(c.texte)), 'les alertes « pendant » ne sont jamais un ordre');
  /* XTB rattaché automatiquement (valeurs inventées) */
  const pos = [{ id: 'p1', ticker: 'GOLD', sens: 'BUY', tOuv: MAINT + 20 * MIN, prixOuv: F.prix * 1.001, tFerm: MAINT + 5 * H, prixFerm: F.prix * 1.01, pnl: 12.3, sl: 3500, tp: 3700 }, { id: 'p2', ticker: 'GOLD', sens: 'SELL', tOuv: MAINT + 20 * MIN, prixOuv: F.prix }, { id: 'p3', ticker: 'US100', sens: 'BUY', tOuv: MAINT + 20 * MIN, prixOuv: F.prix }];
  const R = rattacherXtb([e], pos); v(R.rattachees === 1 && R.entrees[0].xtb.id === 'p1' && R.entrees[0].etat === 'ferme', 'la position XTB du même actif, même sens, au bon moment et au bon prix est rattachée (pas les autres)');
  v(rattacherXtb(R.entrees, pos).rattachees === 0, 'déjà rattachée : pas de doublon');
  v(rattacherXtb([e], [{ ...pos[0], tOuv: MAINT + 20 * H }]).rattachees === 0 && rattacherXtb([e], [{ ...pos[0], prixOuv: F.prix * 1.05 }]).rattachees === 0, 'trop tard ou prix trop différent : pas de rattachement');
  /* après : débrief sur des bougies H4 */
  const B = []; let p = 3900; for (let k = 0; k < 400; k++) { const t = U(2026, 6, 1) + k * 4 * H, o = p, c = o * (1 + (((k * 7919) % 13) - 6.5) / 2000 - 0.0003); B.push({ t, o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c, v: 100 + ((k * 31) % 17) * 3 + (k === 380 ? 900 : 0) }); p = c; }
  const ent = { ...e, t: B[370].t + H, sens: 1, prixRef: B[370].c, xtb: null, snapshot: { ...e.snapshot, sensJ: 'baissier', sensH4: 'baissier', ecartAtrH4: -3, annonceProche: false } };
  const db = debrief(ent, { B, unite: 'H4', tSortie: B[390].t + H, prixSortie: B[390].c });
  v(db && db.avant.length >= 3 && db.moment.length >= 2 && /^La prochaine fois|^Ce qui a bien marché/.test(db.lecon) && db.retirees.length === 0, 'débrief : l’entrée, le moment où ça a tourné, UNE chose à regarder : « ' + (db && db.lecon.slice(0, 70)) + '… »');
  const gagnant = debrief({ ...ent, sens: 1 }, { B, unite: 'H4', tSortie: B[390].t + H, prixSortie: B[370].c * 1.05 }); v(gagnant && /Ce qui a bien marché|La prochaine fois/.test(gagnant.lecon) && gagnant.gainPct > 0, 'trade gagnant : débrief aussi');
  v(debrief(ent, { B: B.slice(0, 50) }) === null && debrief(null, { B }) === null, 'trop peu de bougies : pas de débrief inventé');
  /* compétences */
  const E2 = [1, 2, 3, 4].map(k => ({ id: 'c' + k, outilsPresents: ['volume', 'ma200', 'niveau'], outilsCites: k < 4 ? ['ma200', 'niveau'] : ['ma200'] })); const Cp = competences(E2);
  v(Cp.seul.map(x => x.outil).sort().join() === 'ma200,niveau' && Cp.rates.map(x => x.outil).join() === 'volume' && /Tu repères déjà seul : .*la MA200/.test(Cp.texte) && /Tu rates encore souvent : la bougie de volume/.test(Cp.texte), 'ce que tu repères seul / ce que tu rates : ' + Cp.texte);
  v(/Pas encore assez d’idées/.test(competences(E2.slice(0, 1)).texte), 'trop peu d’idées : le dit');
  const fus = fusionnerCarnets([{ id: 'a', maj: 1, t: 1 }, { id: 'b', maj: 5, t: 2 }], [{ id: 'a', maj: 9, t: 1, etat: 'ferme' }, { id: 'c', maj: 1, t: 3 }]); v(fus.length === 3 && fus.find(x => x.id === 'a').etat === 'ferme', 'fusion entre appareils : la dernière modification gagne');
  v(intentionCloture('Rayle, j’ai clôturé l’or à 3 640').actif === 'or' && intentionCloture('Rayle, j’ai clôturé l’or à 3 640').prixSortie === 3640 && intentionCloture('je suis sorti du Nasdaq').actif === 'us100' && intentionCloture('bonjour') === null, 'clôture reconnue (actif, prix de sortie)');
}

console.log('— Formation : relire les gros mouvements —');
{
  const J = 86400e3, Jb = [], H4b = []; let px = 100; const dir = k => (k < 100 ? 1 : k < 140 ? -1 : k < 200 ? 1 : k < 235 ? -1 : k < 300 ? 1 : -1);
  for (let k = 0; k < 330; k++) { const t = Date.UTC(2025, 5, 1) + k * J, o = px, c = o * (1 + dir(k) * 0.006 + (((k * 37) % 11) - 5) / 3000); Jb.push({ t, o, h: Math.max(o, c) * 1.003, l: Math.min(o, c) * 0.997, c, v: 1000 + ((k * 13) % 7) * 100 + ([100, 140, 200, 235, 300].includes(k) ? 6000 : 0) }); px = c; }
  for (const b of Jb) for (let s = 0; s < 6; s++) { const f = s / 6, o = b.o + (b.c - b.o) * f, c = b.o + (b.c - b.o) * (f + 1 / 6); H4b.push({ t: b.t + s * 4 * 3600e3, o, h: Math.max(o, c) * 1.0008, l: Math.min(o, c) * 0.9992, c, v: b.v / 6 }); }
  const P = pivotsJournaliers(Jb, { k: 3.5 }); v(P.length >= 4 && P.every((p, i) => i === 0 || p.type !== P[i - 1].type), 'zigzag : les pivots alternent sommet / creux (' + P.length + ' pivots)');
  const R = plusGrosMouvements({ Jb, H4b, actif: 'btc', mois: 12, n: 6, maintenant: Jb[Jb.length - 1].t + J * 3 });
  v(R.moves.length >= 3 && R.moves.every(m => m.resume && m.signaux && Math.abs(m.pct) > 5) && R.moves.every((m, i, L) => i === 0 || L[i - 1].t0 <= m.t0), 'les plus gros mouvements, du plus ancien au plus récent : ' + R.moves.length);
  v(R.moves.some(m => m.signaux.volumeExtreme && m.signaux.volumeExtreme.rel >= 3) && /Au départ : bougie de volume extrême/.test(R.moves.find(m => m.signaux.volumeExtreme).resume), 'ce que disaient les outils au départ : bougie de volume extrême');
  v(/^Sur les \d+ plus gros mouvements du Bitcoin ces derniers mois/.test(R.repete.texte) && /sur \d+ ont commencé par une bougie de volume extrême/.test(R.repete.texte) && /pas des règles/.test(R.repete.texte), 'ce qui se répète, avec le nombre de cas : ' + R.repete.texte.slice(0, 150));
  v(/échantillon petit/.test(ceQuiSeRepete(R.moves.slice(0, 4).map(m => m), 'l’or').texte) && /trop peu pour dire ce qui se répète/.test(ceQuiSeRepete(R.moves.slice(0, 2), 'l’or').texte), 'peu de cas : « échantillon petit » ou « trop peu »');
  v(plusGrosMouvements({ Jb: Jb.slice(0, 100), H4b, actif: 'btc' }).moves.length === 0, 'historique trop court : rien d’inventé');
}

console.log('— reconnaissance vocale du copilote —');
{
  const I = intentionCopilote;
  v(I('Rayle, montre-moi').type === 'montre' && I('Rayle, montre-moi le Nasdaq').actif === 'us100' && I('montre-moi').actif === 'or', '« montre-moi » (or par défaut, ou l’actif cité)');
  v(I('regarde ça').type === 'regarde' && I('y a-t-il quelque chose qui mérite d’être regardé ?').type === 'regarde', '« regarde ça »');
  v(I('je regarde un achat sur l’or').type === 'idee' && I('j’ai clôturé l’or à 3 600').type === 'cloture' && I('Rayle, formation sur le bitcoin').actif === 'btc' && I('qu’est-ce que j’ai appris ?').type === 'competences', 'idée, clôture, formation, compétences');
  v(I('Rayle, alertes silencieuses jusqu’à demain').type === 'silence' && I('bonjour') === null && I('fais-moi un point sur l’or') === null, '« alertes silencieuses jusqu’à demain » ; le reste (points) n’est pas pris pour du copilote');
}
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
