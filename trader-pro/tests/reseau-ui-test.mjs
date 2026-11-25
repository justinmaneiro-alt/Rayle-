/* Tests de l'affichage et de la voix du réseau d'information (sans navigateur) : textes parlés, demandes vocales, HTML sûr (aucune injection), pages détail, alertes vocales (seuil, mode nuit, revirement),
   lecture avec repli, réglages. Usage : node trader-pro/tests/reseau-ui-test.mjs */
import { quoiDeNeuf, dernieresDe, faitBougerActif, briefingReseau, intentionReseau, reponseReseau, texteExplication, promptScenarios, ageParle } from '../reseau/textes.js';
import { htmlCarte, htmlALaUne, htmlFil, htmlPersonnes, htmlSources, htmlDetailCarte, htmlDetailAnnonce, texteExpliqueAnnonce, classeScore, esc } from '../reseau/rendu.js';
import { alertesADire } from '../reseau/alertes-voix.js';
import { modeNuit, lireReglages, ecrireReglages, fusionnerReponse, lireReseau, lireAlertes, REGLAGES_DEFAUT } from '../reseau/client.js';
import { integrer, etatVide, alertesDe } from '../reseau/etat.js';
import { noteAnnonce, scenariosAnnonce, conseilAnnonce } from '../marches/annonce.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const T0 = Date.UTC(2026, 10, 24, 14, 0), MIN = 60e3, H = 3600e3;
const art = (source, titre, dt, extra = {}) => ({ source, titre, t: T0 - dt * MIN, guid: source + dt + titre.slice(0, 5), lien: 'https://x.test/' + source + dt, ...extra });
let E = integrer(etatVide(), [
  art('trump', 'Trump: I am imposing new tariffs on Chinese semiconductor chips, effective immediately', 20), art('financialjuice', 'FinancialJuice: Trump imposing new tariffs on Chinese semiconductor chips effective immediately', 19), art('investinglive', 'Trump says imposing new tariffs on Chinese semiconductor chips effective immediately', 18),
  art('trump', 'Trump says he is pausing the tariffs on Chinese semiconductor chips after a deal', 5), art('financialjuice', 'FinancialJuice: Powell: Fed will cut interest rates at the next FOMC meeting', 8), art('coindesk', 'Bitcoin ETF sees record inflows as crypto rallies strongly', 30),
  art('financialjuice', 'FinancialJuice: <script>alert(1)</script> Musk says Tesla accepts bitcoin', 40)], T0);
const tarif1 = E.cartes.find(c => /imposing new tariffs/.test(c.titre));
tarif1.reaction = { mesuree: 3, attente: false, actifs: { us100: { p5: -0.2, p15: -0.9, p60: -1.4 } }, max: { actif: 'us100', horizon: 15, pct: -0.9, atr: 1.8 }, texte: 'le marché a réagi : Nasdaq −0,9 % en 15 min' };
E = { ...E, sources: { trump: { id: 'trump', nom: 'Truth Social (Trump)', voie: 'rapide', ok: true, t: T0, derniere: T0 - 5 * MIN, delaiMoyenMs: 45e3 }, bls: { id: 'bls', nom: 'BLS (emploi, inflation)', voie: 'lente', ok: false, erreur: 'HTTP 403', t: T0 - 3 * MIN } } };
E.memoire = [];

console.log('— textes parlés —');
{
  const u = quoiDeNeuf(E, T0); v(/^Voici les \d+ infos les plus importantes/.test(u) && /importance \d+ sur 100/.test(u) && /Nasdaq −0,9 % en 15 min/.test(u), 'quoi de neuf : titres, importance, réaction mesurée');
  const d = dernieresDe(E, 'trump', T0); v(/^Trump aujourd’hui : /.test(d) && /revirement/.test(d), 'Trump aujourd’hui : ses déclarations et le revirement signalé');
  v(/Je n’ai relevé aucune déclaration de Saylor/.test(dernieresDe(E, 'saylor', T0)), 'personne silencieuse : dit honnêtement qu’il n’y a rien');
  const o = faitBougerActif(E, 'or', T0, { evenements: [{ t: T0 + 2 * 86400e3, titre: 'CPI m/m', pays: 'USD', impact: 'fort' }] }); v(/pour l’or/.test(o) && /CPI m\/m/.test(o), 'ce qui peut faire bouger l’or : actualité + calendrier de la semaine');
  v(/Les infos clés : 1\. /.test(briefingReseau(E, [{ t: T0 + 30 * MIN, titre: 'CPI m/m', pays: 'USD', impact: 'fort' }], T0)) && /CPI m\/m à 15 h 30/.test(briefingReseau(E, [{ t: T0 + 30 * MIN, titre: 'CPI m/m', pays: 'USD', impact: 'fort' }], T0)), 'briefing : 3 infos clés + annonces du jour (heure de Paris)');
  v(ageParle(T0 - 3 * MIN, T0) === 'il y a 3 minutes' && ageParle(T0, T0) === 'à l’instant' && ageParle(T0 - 5 * H, T0) === 'il y a 5 heures', 'âges parlés');
  const I = t => intentionReseau(t);
  v(I('Rayle, quoi de neuf d’important ?').type === 'neuf' && I('qu’est-ce que Trump a dit aujourd’hui ?').id === 'trump' && I('Qu’est-ce que Powell a dit ?').id === 'powell' && I('qu’est-ce qui peut faire bouger l’or cette semaine ?').id === 'or' && I('qu’est-ce qui peut faire bouger le Nasdaq').id === 'us100' && I('où en est le portefeuille') === null, 'demandes vocales reconnues (et le reste ignoré)');
  v(reponseReseau('quoi de neuf', E, { now: T0 }).startsWith('Voici') && /pas encore lu mon réseau/.test(reponseReseau('quoi de neuf', etatVide(), { now: T0 })) && reponseReseau('bonjour', E) === null, 'réponse parlée ; réseau vide : le dit ; autre phrase : null');
  const c = E.cartes.find(x => /imposing new tariffs/.test(x.titre)), t = texteExplication(c, { precedents: [{ n: 6, texte: 'Les 6 dernières fois que Trump a parlé de droits de douane : Nasdaq en moyenne −0,6 % sur 1 h (5 baisses sur 6).' }], now: T0 });
  v(/Importance \d+ sur 100/.test(t) && /hypothèse de lecture, pas un signal/.test(t) && /5 baisses sur 6/.test(t) && !/vas-y|achète|vends|n.y va pas/i.test(t), 'Rayle, explique-moi : simple, précédents cités, jamais un ordre');
  const p = promptScenarios(c); v(/EXACTEMENT 2 scénarios/.test(p) && /sans probabilité chiffrée, sans ordre/.test(p), 'consigne à l’IA : 2 scénarios, hypothèses, aucun ordre');
}

console.log('— HTML sûr et pages détail —');
{
  const x = E.cartes.find(c => /script/.test(c.titre)), h = htmlCarte(x, { now: T0 }); v(!/<script>/.test(h) && /&lt;script&gt;/.test(h), 'un titre piégé est neutralisé (aucune injection)');
  v(esc('"><img src=x onerror=1>') === '&quot;&gt;&lt;img src=x onerror=1&gt;', 'esc');
  const une = htmlALaUne(E, T0); v(/À LA UNE/.test(une) && (une.match(/<li class="tp-carte/g) || []).length === 5, 'À la une : 5 cartes');
  v(/tp-s-fort/.test(htmlCarte(tarif1, { now: T0 })) === (tarif1.score >= 80) && classeScore(85) === 'tp-s-fort' && classeScore(65) === 'tp-s-moyen' && classeScore(45) === 'tp-s-bas' && classeScore(10) === 'tp-s-nul', 'couleur du score');
  const fil = htmlFil(E, { actif: 'sol', scoreMin: 0, now: T0 }); v(/Bitcoin ETF/.test(fil) && !/Powell/.test(fil), 'filtre par actif');
  v(!/Bitcoin ETF/.test(htmlFil(E, { scoreMin: 99, now: T0 })) && /Aucune info à ce niveau/.test(htmlFil(E, { scoreMin: 99, now: T0 })), 'curseur de score minimum');
  const pe = htmlPersonnes(E, T0); v(/Donald Trump/.test(pe) && /poids 5\/5/.test(pe) && /Aucune déclaration relevée/.test(pe) && /voir le fil/.test(pe), 'une ligne par personne, avec poids, dernière déclaration, fil');
  const so = htmlSources(E, T0); v(/en ligne/.test(so) && /hors ligne/.test(so) && /HTTP 403/.test(so) && /45 s/.test(so) && /jamais interrogée/.test(so), 'tableau d’état : en ligne, hors ligne + raison, délai moyen');
  const f = E.fils.find(y => y.personne === 'trump'), det = htmlDetailCarte(tarif1, { etat: E, now: T0, precedents: [{ n: 6, texte: 'précédent X' }], regles: ['Lecture 1 : exemple'] });
  v(/Pourquoi \d+ \?/.test(det) && /Détail du score/.test(det) && /Réaction du marché/.test(det) && /Nasdaq −0,9 % en 15 min/.test(det) && /Fil d’histoire \(\d+ infos/.test(det) && /REVIREMENT/.test(det) && /précédent X/.test(det) && /Lecture 1/.test(det) && /Rayle, explique-moi/.test(det) && /aucun ordre/.test(det), 'page détail d’une info : score expliqué, réaction, fil avec revirement, précédents, scénarios, voix');
  v(/data-scenarios/.test(htmlDetailCarte({ ...tarif1, score: 85 }, { etat: E, now: T0 })) && !/data-scenarios/.test(htmlDetailCarte({ ...tarif1, score: 60 }, { etat: E, now: T0 })), 'scénarios IA proposés seulement à partir de 70');
  v(/Les 5 minutes|5 min/.test(det) && /−1,40 %|−1,4/.test(det) && f.revirement, 'tableau 5 / 15 / 60 minutes');
}

console.log('— page détail d’une annonce —');
{
  const e = { titre: 'CPI m/m', pays: 'USD', impact: 'fort', prevu: '0.3%', precedent: '0.2%', actuel: '', t: T0 + 90 * MIN }, note = noteAnnonce(e, { maintenant: T0 }), sc = scenariosAnnonce(e, {}), conseil = conseilAnnonce(e, note, { maintenant: T0 });
  const histo = [1, 2, 3].map(i => ({ k: 'USD|CPI', t: i, mesures: { or: { p15: 0.5, p60: i === 2 ? -0.7 : 0.9, p240: 0.2, pj: 0.1 } } })), stats = { or: { cas: 3, horizons: { p15: { n: 3, moyenne: 0.5, amplitude: 0.5, hausses: 3, baisses: 0 }, p60: { n: 3, moyenne: 0.37, amplitude: 0.83, hausses: 2, baisses: 1 }, p240: { n: 2, insuffisant: true }, pj: { n: 3, moyenne: 0.1, amplitude: 0.1, hausses: 3, baisses: 0 } } } };
  const h = htmlDetailAnnonce(e, { note, scenarios: sc, conseil, stats, now: T0, nomFamille: 'inflation' });
  v(/CPI m\/m/.test(h) && /session à ce moment/.test(h) && /New York|Londres/.test(h) && /Consensus \(prévu\)/.test(h) && /0\.3%/.test(h) && /Pourquoi \d+ \?/.test(h), 'titre, heure, session, consensus, note expliquée');
  v(/Réaction historique/.test(h) && /3 cas/.test(h) && /pas assez de cas/.test(h) && /1 h|15 min/.test(h), 'réaction historique avec nombre de cas, horizon insuffisant signalé');
  v(/AU-DESSUS du consensus/.test(h) && /EN DESSOUS du consensus/.test(h) && /CONFORME au consensus/.test(h) && /Prudence avant l’annonce/.test(h) && !/Après l’annonce/.test(h), 'trois scénarios + conseil ; pas de bloc « après » avant publication');
  const apres = htmlDetailAnnonce({ ...e, t: T0 - 2 * H, actuel: '0.4%' }, { note, scenarios: sc, conseil, stats: {}, reactionReelle: { or: { p15: 0.3, p60: -0.2, p240: null, pj: null } }, now: T0 });
  v(/Après l’annonce/.test(apres) && /<b>0\.4%<\/b>/.test(apres) && /Pas assez de cas mesurés/.test(apres) && /\+0,30 %/.test(apres), 'après publication : résultat réel et réaction réelle ajoutés ; sans historique : le dit');
  const voix = texteExpliqueAnnonce(e, note, sc, conseil); v(/^CPI m\/m, USD/.test(voix) && /Importance \d+ sur 100/.test(voix) && /Le marché attend 0\.3%/.test(voix) && !/vas-y/i.test(voix), 'Rayle, explique-moi (annonce)');
}

console.log('— alertes vocales —');
{
  const r = { ...REGLAGES_DEFAUT, nuit: { actif: true, de: 23, a: 7 } }, al = [{ id: 'a1', carteId: 'c1', t: T0 - 2 * MIN, score: 88, texte: 'Trump sur Truth Social : tarifs. Score 88.' }, { id: 'a2', carteId: 'c2', t: T0 - 1 * MIN, score: 72, texte: 'Info moyenne. Score 72.' }, { id: 'a3', carteId: 'c3', t: T0 - 30 * MIN, score: 95, texte: 'trop vieille' }, { id: 'a4', carteId: 'c4', t: T0 - 30 * 1000, score: 60, revirement: true, texte: 'REVIREMENT. Trump pause.' }];
  const j = Date.UTC(2026, 10, 24, 14, 0);   // 15 h à Paris : voix permise
  const R = alertesADire({ alertes: al }, { vuT: 0, reglages: r, maintenant: j }); v(R.aDire.map(a => a.id).join() === 'a1,a4' && R.nouvelleVue === al[3].t, 'seuil 80 : l’alerte à 88 et le revirement sont dits, pas celle à 72 ni la trop vieille');
  v(alertesADire({ alertes: al }, { vuT: al[0].t, reglages: r, maintenant: j }).aDire.every(a => a.t > al[0].t), 'une alerte déjà vue n’est jamais redite');
  v(alertesADire({ alertes: al }, { vuT: 0, reglages: { ...r, seuilVoix: 70 }, maintenant: j }).aDire.length === 2, 'au plus 2 phrases d’un coup (la plus récente d’abord gardée)');
  const nuit = Date.UTC(2026, 10, 24, 23, 0); const N = alertesADire({ alertes: [{ ...al[0], t: nuit - MIN }] }, { vuT: 0, reglages: r, maintenant: nuit }); v(N.silence && N.aDire.length === 0 && N.manquees === 1, 'mode nuit (0 h Paris) : pas de voix, l’alerte est comptée comme manquée (Telegram l’a envoyée)');
  v(alertesADire({ alertes: [al[0]] }, { vuT: 0, reglages: { ...r, voix: false }, maintenant: j }).aDire.length === 0, 'voix coupée dans Réglages');
  v(modeNuit(r, Date.UTC(2026, 10, 24, 5, 0)) && !modeNuit(r, Date.UTC(2026, 10, 24, 10, 0)) && !modeNuit({ ...r, nuit: { actif: false, de: 23, a: 7 } }, Date.UTC(2026, 10, 24, 1, 0)) && modeNuit({ ...r, nuit: { actif: true, de: 1, a: 5 } }, Date.UTC(2026, 10, 24, 3, 0)), 'mode nuit : plage qui passe minuit, plage dans la journée, désactivé (heure de Paris)');
}

console.log('— lecture avec repli et réglages —');
{
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)) }; };
  const st = mem(); v(lireReglages(st).seuilVoix === 80 && lireReglages(st).nuit.de === 23 && lireReglages(st).voix === true, 'réglages par défaut : 80, nuit 23 h – 7 h, voix active');
  ecrireReglages({ seuilVoix: 120, voix: false, nuit: { actif: false, de: 1, a: 2 } }, st); const r = lireReglages(st); v(r.seuilVoix === 100 && r.voix === false && r.nuit.actif === false && r.nuit.de === 1, 'seuil borné à 100, valeurs relues');
  const F = fusionnerReponse({ etat: { ...E }, rapide: { cartes: [{ ...E.cartes[0], id: 'cNEUF', titre: 'Carte neuve de la voie rapide du Worker xyz', t: T0 - 60e3, sources: [{ id: 'financialjuice', nom: 'FinancialJuice', t: T0 - 60e3 }], analysee: false }], sources: { financialjuice: { id: 'financialjuice', ok: true, t: T0 } }, alertes: [{ id: 'aX', carteId: 'cX', t: T0 - 1000, score: 90, texte: 't' }] } }, T0);
  v(F.cartes.some(c => c.id === 'cNEUF') && F.sources.financialjuice.ok && F.alertes.length === 1, 'fusion de l’état complet et de l’état rapide');
  const conn = { url: 'https://w.test', code: 'abcdef' };
  const okFetch = async url => (String(url).endsWith('/reseau/etat') ? new Response(JSON.stringify({ etat: E, rapide: null })) : new Response(JSON.stringify({ alertes: [{ id: 'a', carteId: 'c', t: 1, score: 99, texte: 'x' }] })));
  const a = await lireReseau({ conn, fetchFn: okFetch, maintenant: T0 }); v(a.origine === 'Worker (D1)' && a.donnees.cartes.length === E.cartes.length, 'lecture par le Worker');
  const b = await lireReseau({ conn, fetchFn: async () => { throw new Error('hors ligne'); }, maintenant: T0, lireFichier: async () => ({ donnees: E, t: 5 }) }); v(/fichier publié/.test(b.origine) && b.donnees.cartes.length === E.cartes.length, 'Worker injoignable : repli sur le fichier publié');
  const c = await lireAlertes({ conn, fetchFn: okFetch }); v(c.origine === 'Worker' && c.alertes[0].score === 99, 'alertes par la petite route du Worker');
  let err = null; try { await lireReseau({ conn: null, lireFichier: async () => { throw new Error('rien'); } }); } catch (e) { err = e.message; } v(err === 'rien', 'ni Worker ni fichier : l’erreur remonte (l’appli affiche « Réessayer »)');
}
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
