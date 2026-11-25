/* Tests de la voix et de l'ouverture des points : reconnaissance des demandes, dernière visite par appareil et proposition après 3 h d'absence, reformulation par l'IA sous contrôle des chiffres,
   lecture bougie par bougie (« qu'est-ce que tu vois là ? »). Usage : node trader-pro/tests/point-voix-test.mjs */
import { intentionPoint } from '../point/intention.js';
import { lireVisite, ecrireVisite, evaluerVisite, enregistrerBattement, phraseProposition, SEUIL_ABSENCE_MS, CLE_VISITE } from '../point/visite.js';
import { polir } from '../point/polir.js';
import { collecterFaits } from '../point/faits.js';
import { infosBougie, texteBougie, fenetreRelecture, donneesRelecture } from '../copilote/relecture.js';
import { creerCalcul } from '../volume/bougies-volume-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, MIN = 60e3;

console.log('— demandes vocales —');
{
  const I = intentionPoint;
  v(I('Rayle, qu’est-ce qui se passe ? Dis-moi tout').type === 'depuis' && I('dis-moi tout').type === 'depuis' && I('qu’est-ce que j’ai raté ?').type === 'depuis', '« dis-moi tout » / « qu’est-ce qui se passe » / « qu’est-ce que j’ai raté » → depuis ma dernière connexion');
  v(I('Rayle, fais-moi un point sur cette nuit').type === 'nuit' && I('raconte-moi cette nuit').type === 'nuit', '« fais-moi un point sur cette nuit » → nuit');
  v(I('donne-moi le point du matin').type === 'matin' && I('fais le point de la journée').type === 'journee' && I('le point du soir').type === 'journee', 'point du matin, point de la journée / du soir');
  v(I('Rayle, où en est l’or ?').type === 'actif' && I('où en est l’or ?').actif === 'or' && I('fais-moi un point sur le Nasdaq').actif === 'us100' && I('où en est le bitcoin').actif === 'btc' && I('où en est le pétrole').actif === 'petrole', '« où en est l’or ? » → point sur un actif');
  v(I('bonjour Rayle') === null && I('quelle heure est-il') === null && I('quoi de neuf d’important') === null && I('ouvre le terminal') === null, 'le reste n’est pas pris pour une demande de point');
}

console.log('— dernière visite, par appareil —');
{
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)) }; };
  const st = mem(), T = Date.UTC(2026, 10, 24, 20, 0);
  v(lireVisite(st) === null && evaluerVisite(null, T).premiere && !evaluerVisite(null, T).proposer, 'première ouverture : rien à proposer');
  enregistrerBattement(T - 9 * H, st); const E = evaluerVisite(lireVisite(st), T);
  v(E.proposer && E.absenceMs === 9 * H && SEUIL_ABSENCE_MS === 3 * H, 'absent depuis 9 h : Rayle propose le point (seuil 3 h)');
  v(phraseProposition(9 * H) === 'Tu étais absent depuis 9 heures, je te fais le point ?' && phraseProposition(H) === 'Tu étais absent depuis 1 heure, je te fais le point ?' && /3 jours/.test(phraseProposition(72 * H)), 'la phrase de Rayle');
  enregistrerBattement(T - 2 * H, st); v(!evaluerVisite(lireVisite(st), T).proposer, 'absent 2 h seulement : pas de proposition');
  enregistrerBattement(T - 9 * H, st); enregistrerBattement(T, st, { proposeLe: T }); v(!evaluerVisite({ ...lireVisite(st), derniere: T - 5 * MIN }, T).proposer, 'proposé une fois : pas de seconde proposition tant que tu es là');
  v(lireVisite({ getItem: () => 'pas du json', setItem() {} }) === null && !ecrireVisite({ derniere: 1 }, { setItem() { throw new Error('plein'); } }), 'stockage cassé ou plein : aucun plantage');
  const st2 = mem(); ecrireVisite({ derniere: T - 20 * MIN, precedente: T - 11 * H }, st2); v(lireVisite(st2).precedente === T - 11 * H, 'l’heure de la connexion précédente est gardée (pour « depuis ma dernière connexion »)');
  v(CLE_VISITE === 'rayle_point_visite_v1', 'clé locale à l’appareil (non synchronisée : chaque appareil a SA dernière visite)');
}

console.log('— reformulation par l’IA sous contrôle —');
{
  const texte = 'L’or a perdu 2,2 % depuis 9 heures, de 3 636 à 3 555. Le support le plus proche est à 3 506. On privilégie plutôt les ventes sur un rebond vers la MA200 H4 (3 909), signal moyen.', faits = collecterFaits({ a: [2.2, 3636, 3555, 3506, 3909] }, { nombres: [-2.2, 9] });
  const ia = t => async () => ({ texte: t });
  const bon = await polir(texte, faits, { demanderIA: ia('Alors, l’or a reculé de 2,2 % en 9 heures, de 3 636 jusqu’à 3 555. Le support à surveiller est à 3 506, et on privilégie plutôt les ventes sur un rebond vers la MA200 H4, à 3 909 : signal moyen.') });
  v(bon.source === 'ia' && /^Alors, l’or a reculé/.test(bon.texte), 'une reformulation fidèle est acceptée (source ia)');
  const invente = await polir(texte, faits, { demanderIA: ia('Alors, l’or a reculé de 2,2 % en 9 heures, de 3 636 jusqu’à 3 555, et il pourrait viser 3 400. Le support est à 3 506 ; on privilégie plutôt les ventes vers 3 909, signal moyen.') });
  v(invente.source === 'regles' && /introuvable/.test(invente.raison) && /3 400/.test(invente.raison) && invente.texte === texte, 'un niveau inventé (3 400) fait rejeter la reformulation : on garde le texte du code');
  const ordre = await polir(texte, faits, { demanderIA: ia('Alors, l’or a reculé de 2,2 % de 3 636 à 3 555, support à 3 506 : vends sur un rebond vers 3 909, vas-y, signal moyen assez sûr.') }); v(ordre.source === 'regles' && /ordre/.test(ordre.raison), 'un ordre (« vas-y ») est rejeté');
  const court = await polir(texte, faits, { demanderIA: ia('Ça baisse.') }); v(court.source === 'regles' && /longueur/.test(court.raison), 'réponse trop courte rejetée');
  const vide = await polir(texte, faits, { demanderIA: ia('') }); v(vide.source === 'regles' && /vide/.test(vide.raison), 'réponse vide rejetée');
  const panne = await polir(texte, faits, { demanderIA: async () => { throw new Error('quota Gemini atteint'); } }); v(panne.source === 'regles' && /indisponible/.test(panne.raison) && panne.texte === texte, 'IA en panne : le texte du code est gardé, sans erreur');
  const sans = await polir(texte, faits, {}); v(sans.source === 'regles' && /non configurée/.test(sans.raison), 'IA non configurée : texte du code');
  const perd = await polir(texte, faits, { demanderIA: ia('Alors, l’or a reculé depuis ce matin, il est plutôt faible, avec un support plus bas et des ventes sur rebond vers la moyenne, signal moyen, c’est ce que je vois pour l’instant.') }); v(perd.source === 'regles' && /trop de chiffres supprimés/.test(perd.raison), 'une reformulation qui supprime les chiffres est rejetée');
}

console.log('— lecture bougie par bougie —');
{
  const B = []; let p = 100; for (let i = 0; i < 400; i++) { const t = Date.UTC(2026, 0, 1) + i * 4 * H, o = p, c = o * (1 + (((i * 7919) % 13) - 6) / 1500), v2 = 100 + ((i * 31) % 17) * 3 + (i === 380 ? 900 : 0); B.push({ t, o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c: i === 380 ? o * 1.012 : c, v: v2 }); p = B[i].c; }
  const calc = creerCalcul('btc').maj(B), info = infosBougie(B, calc, 380, 'H4');
  v(info.niveau === 'extreme' && info.rel >= 3 && info.dir === 1 && info.ma != null && ['dessus', 'dessous'].includes(info.positionMa), 'bougie 380 : volume extrême acheteur, MA200 connue');
  const tx = texteBougie(info, { nom: 'le Bitcoin', unite: 'H4', depuisDebut: 1.2 }); v(/volume extrême acheteuse/.test(tx) && /MA200/.test(tx) && /Depuis le début du mouvement qu’on regarde, le prix a fait \+1,2 %/.test(tx) && /tendances générales, pas une règle/.test(tx) && !/vas-y|achète/i.test(tx), 'texte parlé de la bougie : volume, MA200, mouvement, prudence, aucun ordre');
  const normal = texteBougie(infosBougie(B, calc, 300, 'H4'), { unite: 'H4' }); v(/volume est ordinaire/.test(normal), 'bougie ordinaire : le dit');
  const sansVol = texteBougie(infosBougie(B.map(b => ({ ...b, v: 0 })), creerCalcul('dxy').maj(B.map(b => ({ ...b, v: 0 }))), 300, 'H4'), { unite: 'H4' }); v(/pas de volume fiable/.test(sansVol), 'sans volume : Rayle ne dit rien sur le volume');
  const early = infosBougie(B, calc, 380, 'H4'), calcCoupe = creerCalcul('btc').maj(B.slice(0, 381)), info2 = infosBougie(B.slice(0, 381), calcCoupe, 380, 'H4'); v(early.rel === info2.rel && early.ma === info2.ma && early.contexte === info2.contexte, 'la lecture d’une bougie ne dépend pas des bougies suivantes (aucun regard vers l’avenir)');
  const W = fenetreRelecture(B, B[300].t, B[320].t, { avant: 40, apres: 12 }); v(W.i0 === 300 && W.i1 === 320 && W.debut === 260 && W.fin === 332, 'fenêtre centrée sur le mouvement, avec marge');
  const D = donneesRelecture(B, 'btc', 'H4', B[370].t, B[385].t); v(D.bougies.length === D.vol.length && D.ma.length > 0 && D.vol.some(x => x.couleur === '#00E5FF') && D.i0 < D.i1, 'données du graphique : bougies, MA200, volume coloré (cyan = achat fort)');
}
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
