/* v11 phase 5 : banc d'essai dans un vrai Chrome (vraies pages, vraies données de production, fausse voix chronométrée comme la vraie).
   Usage : node trader-pro/tests/rapports-chrome.mjs [tablette|pc|tel] [complet|cot|marche|macro|commandes] [actif]
   Prérequis : node serveur.mjs 8000 (déjà lancé). Vérifie, pour chaque rapport : les bonnes pages ouvertes dans l'ordre, les éléments mis en évidence (lignes, bougies, zones, bulles), les vrais chiffres, une seule voix,
   la barre de rapport (titre, progression, boutons), aucun blanc de plus de 2 s entre deux étapes, aucune erreur JavaScript. Une capture par étape clé dans donnees-privees/captures-v11/. */
import { lancer, w } from './aide-chrome.mjs';
const [, , vue = 'tablette', type = 'complet', actif = 'or'] = process.argv;
const T = await lancer(vue, { dossierCaptures: 'donnees-privees/captures-v11', vraiNavigateur: true, stockage: { rayle_donnees_base: '', rayle_piper_precharge: '0' } }), { p, verif, attendre, fin } = T;
const pageCharge = await attendre(() => p.evaluate(() => !!window.LecteurRapports && typeof window.speak === 'function' && !!window.Application), 60000, 500);
verif(pageCharge, 'la page est chargée (LecteurRapports, speak, Application)');

/* fausse voix : mêmes événements que la vraie (rayle:parole au départ du son), durée = nombre de caractères / vitesse de parole ; un seul son à la fois, tout est journalisé */
await p.evaluate(() => {
  window.__voix = { parles: [], enCours: 0, max: 0, cnt: 0 };
  window.speak = async function (t) {
    const L = window.LecteurRapports.moteur(), v = L && L.etat() ? L.etat().vitesse : 1, dur = Math.max(400, String(t).length / (14.5 * v) * 1000), V = window.__voix;
    const nous = /lecteur.js/.test(new Error().stack || ''); V.parles.push({ t: String(t), debut: Date.now(), dur, nous }); if (nous) { V.enCours++; V.max = Math.max(V.max, V.enCours); }
    /* pas d'événement rayle:parole : le lecteur suit alors l'horloge estimée (comme avec Piper) ; avec la vraie voix Azure il suit l'horloge du lecteur audio */
    const me = V.parles[V.parles.length - 1]; await new Promise(r => setTimeout(r, dur)); if (nous) V.enCours--; me.fin = Date.now();
  };
  window.cancelSpeech = () => {};   // les commandes arrêtent la voix factice en laissant finir sa temporisation courte
  window.__trace = { barre: [], marques: [], pages: [] };
  const echant = () => {
    const doc = document, b = doc.getElementById('lr-barre'), chap = b && !b.hidden ? (b.querySelector('.lr-chap') || {}).textContent : null, sous = b && !b.hidden ? (b.querySelector('.lr-sous') || {}).textContent : null;
    const tr = window.__trace; if (chap && (!tr.barre.length || tr.barre[tr.barre.length - 1].chap !== chap)) tr.barre.push({ chap, sous, t: Date.now(), prog: (b.querySelectorAll('.lr-prog i.fait').length) });
    let ligne = 0, bougie = 0, zone = 0, visibles = 0;
    for (const f of doc.querySelectorAll('iframe')) { try { const d = f.contentDocument; ligne += d.querySelectorAll('.lr-ligne').length; bougie += d.querySelectorAll('.lr-bougie').length; zone += d.querySelectorAll('.lr-zone').length; for (const e of d.querySelectorAll('.lr-ligne,.lr-bougie,.lr-zone')) { const r = e.getBoundingClientRect(); if (e.style.display !== 'none' && (r.width > 4 || r.height > 4)) visibles++; } } catch (e) { /* cadre d'une autre origine */ } }
    const el = doc.querySelectorAll('.lr-surligne').length, bulle = doc.querySelectorAll('.lr-bulle').length, lignes = doc.querySelectorAll('#lr-carte li.actif').length;
    if (ligne + bougie + zone + el + bulle + lignes) tr.marques.push({ chap, ligne, bougie, zone, visibles, el, bulle, lignesActives: lignes, t: Date.now() });
    const fen = (doc.querySelector('.fenetre-active, [data-fenetre-ouverte]') || {}).id || null; if (fen) tr.pages.push(fen);
  };
  setInterval(echant, 120);
});

if (type === 'commandes') {
  await p.evaluate(() => window.LecteurRapports.lancer({ type: 'cot', actif: 'or' }));
  verif(await attendre(() => p.evaluate(() => (window.__voix.parles.length >= 1)), 120000, 500), 'commandes : le rapport COT démarre');
  const rep = async txt => p.evaluate(async t => { const r = await window.Application.commande(t); return r; }, txt);
  const n1 = await p.evaluate(() => window.__voix.parles.length);
  verif((await rep('suivant')) === '✔', '« suivant » traité par Application.commande');
  verif(await attendre(() => p.evaluate(n => window.__voix.parles.length > n, n1), 60000, 300), 'suivant : l’étape suivante est lue');
  verif((await rep('pause')) === '✔' && await p.evaluate(() => window.LecteurRapports.etat().pause), '« pause » : rapport en pause');
  const bp = await p.evaluate(() => document.querySelector('#lr-barre [data-a="pause"]').getAttribute('aria-pressed')); verif(bp === 'true', 'bouton pause enfoncé ▶ (' + bp + ')');
  verif((await rep('reprends')) === '✔' && !(await p.evaluate(() => window.LecteurRapports.etat().pause)), '« reprends » : reprise');
  verif((await rep('reviens')) === '✔', '« reviens » traité (pas « ferme la fenêtre »)');
  const n2 = await p.evaluate(() => window.__voix.parles.length); verif((await rep('détaille ça')) === '✔' && await attendre(() => p.evaluate(n => window.__voix.parles.length > n, n2), 40000, 300), '« détaille ça » : le détail est lu');
  await T.capture('rapport-commandes');
  verif((await rep('montre-moi sur le graphique')) === '✔', '« montre-moi sur le graphique » traité');
  verif(await p.evaluate(() => window.__voix.max) === 1, 'une seule voix à la fois pendant les commandes');
  verif((await rep('stop')) === 'Rapport arrêté.' && await attendre(() => p.evaluate(() => { const b = document.getElementById('lr-barre'); return b.hidden; }), 20000, 300), '« stop » : barre refermée');
  await fin();
}

const demande = { complet: 'Rayle, rapport complet sur ' + ({ or: 'l’or', us100: 'le Nasdaq' }[actif] || actif), cot: 'Rayle, rapport COT sur ' + ({ or: 'l’or', us100: 'le Nasdaq', eurusd: 'l’EUR/USD' }[actif] || actif), marche: 'Rayle, rapport sur le marché', macro: 'Rayle, quelles annonces cette semaine et quel impact ?' }[type];
const reponse = await p.evaluate(async t => await window.Application.commande(t), demande);
verif(typeof reponse === 'string' && /Je prépare/.test(reponse), 'la demande vocale « ' + demande + ' » lance le rapport (« ' + reponse + ' »)');
verif(await attendre(() => p.evaluate(() => { const b = document.getElementById('lr-barre'); return b && !b.hidden; }), 60000, 300), 'la barre de rapport apparaît');
const prep = await p.evaluate(() => (document.querySelector('#lr-barre .lr-sous') || {}).textContent); verif(/Coût estimé : ≈ [\d  ]+ caractères/.test(prep || '') || /Préparation/.test(prep || ''), 'coût estimé affiché avant la lecture (« ' + prep + ' »)');
await p.evaluate(() => { window.LecteurRapports.charger().then(L => { L.moteur.vitesse(+2); }); });   // ×1,3 : le banc dure moins longtemps, la synchronisation est la même
await T.capture('rapport-' + type + '-debut');
const fini = await attendre(() => p.evaluate(() => { const b = document.getElementById('lr-barre'); return b && b.classList.contains('fini'); }), 900000, 2000); verif(fini, 'le rapport va jusqu’au bout');
await T.capture('rapport-' + type + '-fin');

const R = await p.evaluate(() => ({ trace: window.__trace, voix: window.__voix, dernier: window.LecteurRapports.dernier(), etat: window.LecteurRapports.etat() }));
const chaps = R.trace.barre.map(b => b.chap).filter(c => c !== 'Rapport terminé'); console.log('chapitres vus :', chaps.join(' > '));
const attendus = { complet: ['Contexte global', 'Weekly', 'Daily', 'H4', 'Volume', 'COT', 'Valorisation', 'Scénarios', 'Vigilance et risque'], cot: ['Positions nettes', 'Indice COT', 'Intérêt ouvert', 'Prix et positionnement', 'Historique', 'Conclusion'], marche: ['Climat', 'Or', 'Nasdaq 100', 'S&P 500', 'Bitcoin', 'Solana', 'Pétrole', 'EUR/USD', 'Dollar (DXY)'], macro: ['La semaine', 'Annonce 1'] }[type];
let k = 0; for (const c of chaps) if (attendus[k] && c.replace(/^Détail · /, '').startsWith(attendus[k])) k++;
verif(k === attendus.length, 'étapes vues dans le bon ordre (' + k + '/' + attendus.length + ')');
verif(R.voix.max === 1, 'une seule voix à la fois (max simultané : ' + R.voix.max + ')'); if (R.voix.max > 1) console.log(R.voix.parles.map(x => (x.debut % 1e6) + '→' + ((x.fin || 0) % 1e6) + ' ' + x.t.slice(0, 50)).join(' |')); verif(R.voix.parles.filter(x => x.nous).length >= attendus.length, 'une requête de voix par étape (' + R.voix.parles.length + ')');
const txt = R.voix.parles.filter(x => x.nous).map(x => x.t).join(' '); verif(!/undefined|NaN|\[object/.test(txt), 'aucun « undefined » ni « NaN » dans les textes dits'); console.log('texte dit :', txt.length, 'caractères');
const ec = (R.dernier && R.dernier.ecarts) || []; verif(ec.length > 0 && Math.max(...ec) <= 2000, 'aucun blanc de plus de 2 s entre deux étapes (max ' + (ec.length ? Math.max(...ec) : '?') + ' ms, ' + ec.length + ' transitions)'); console.log('blancs entre étapes (ms) :', ec.join(', ')); console.log('préparation des étapes (ms) :', ((R.dernier && R.dernier.preps) || []).map(x => x.id + '=' + x.ms).join(', '));
const J = await p.evaluate(() => window.LecteurRapports.journal()), segs = J.filter(x => x.k != null); const etalee = {}; for (const x of segs) (etalee[x.id] = etalee[x.id] || []).push(x.t); const pasEtale = Object.entries(etalee).filter(([, L]) => L.length >= 4 && (L[L.length - 1] - L[0]) < 1500).map(([id]) => id);
verif(segs.length >= attendus.length * 2 && pasEtale.length === 0, 'les mises en avant suivent la lecture phrase par phrase, pas d’un seul coup (' + segs.length + ' segments ; groupés : ' + (pasEtale.join(',') || 'aucun') + ')');
const poses = J.filter(x => x.pose); console.log('marques posées :', JSON.stringify(poses.reduce((o, x) => { o[x.pose] = (o[x.pose] || 0) + 1; return o; }, {}))); verif(poses.every(x => !x.erreur), 'aucune marque en erreur');
const m = R.trace.marques; verif(m.length > 0, 'des éléments sont mis en avant (' + m.length + ' échantillons)');
if (type === 'complet' || type === 'marche') { const vis = m.reduce((s, x) => s + x.visibles, 0); verif(vis > 0, 'des repères pulsent sur le graphique : lignes, bougies, zones (' + vis + ' échantillons visibles)'); verif(m.some(x => x.bougie > 0), 'une bougie est mise en évidence'); }
if (type === 'cot' || type === 'complet') verif(m.some(x => x.el > 0 && x.bulle > 0), 'une case de la page est surlignée avec sa bulle');
verif(m.some(x => x.lignesActives > 0), 'les lignes de la carte s’éclairent une à une avec la voix');
verif(R.dernier && R.dernier.entree && R.dernier.entree.etapes.length >= attendus.length - 1, 'le rapport est enregistré dans l’historique');
if (R.dernier) { console.log('manques :', R.dernier.manques.join(' | ') || 'aucun'); console.log('caractères lus :', R.dernier.caracteres); }
const finBarre = await p.evaluate(() => (document.querySelector('#lr-barre .lr-sous') || {}).textContent); verif(/caractères lus/.test(finBarre || ''), 'fin : coût réel affiché (« ' + finBarre + ' »)');
await p.evaluate(() => { document.querySelector('#lr-carte [data-a="histo"]').click(); }); await w(500);
verif(await p.evaluate(() => !!document.querySelector('#lr-histo article')), 'historique : le rapport est listé'); await T.capture('rapport-historique');
await fin();
