/* Test Chrome du copilote : onglet Actualité (À la une, fil, détail du score, personnalités, sources), annonces notées avec page détail, point de Rayle (fenêtre animée, « Montre-moi » → relecture sur graphique),
   commande vocale « dis-moi tout », proposition après 9 h d'absence. Données : un dossier d'instantanés SYNTHÉTIQUE généré ici et servi sur le port 8801 (aucun réseau).
   Prérequis : node serveur.mjs 8000. Usage : node trader-pro/tests/copilote-chrome.mjs [tel|tablette|pc] */
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { lancer, w } from './aide-chrome.mjs';
import { construireTout, ecrireFiches } from '../../outils-donnees/lecture.mjs';
import { integrer, etatVide } from '../reseau/etat.js';
import { regrouper, enH4 } from '../commun/analyse.js';
const mode = process.argv[2] || 'tel', H = 3600e3, J = 86400e3, MIN = 60e3, MAINT = Math.floor(Date.now() / 900e3) * 900e3;
function alea(g) { let s = g >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function pro(id, graine, p0) {
  const R = alea(graine), n = 420 * 96, t0 = MAINT - n * 900e3, M = []; let p = p0;
  for (let i = 0; i < n; i++) { const t = t0 + i * 900e3, k = n - i, o = p, deriv = k < 48 ? -0.0011 : 0, c = o * (1 + (R() - 0.5) * 0.0024 + deriv), vol = 100 * (0.7 + R() * 0.6) * (k >= 20 && k < 24 ? 5 : 1); M.push({ t, o, h: Math.max(o, c) * 1.0005, l: Math.min(o, c) * 0.9995, c, v: vol }); p = c; }
  const cp = B => B.map(b => [b.t, +b.o.toFixed(4), +b.h.toFixed(4), +b.l.toFixed(4), +b.c.toFixed(4), Math.round(b.v)]), nu = B => B.map(({ enCours, ...b }) => b);
  return { id, nom: id, source: 'synthétique (test)', t: MAINT, prix: M[M.length - 1].c, tPrix: M[M.length - 1].t + 900e3, j: cp(nu(regrouper(M, J, 22 * H, MAINT))), h4: cp(nu(enH4(M, MAINT))), h1: cp(nu(regrouper(M, H, 0, MAINT))), m15: cp(M.slice(-500)) };
}
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-copilote-'));
for (const [id, g, p0] of [['or', 7, 3700], ['us100', 11, 20000], ['btc', 13, 90000]]) fs.writeFileSync(path.join(dossier, `pro-${id}.json`), JSON.stringify(pro(id, g, p0)));
const iso = t => new Date(t).toISOString().replace(/\.\d+Z$/, '+00:00');
fs.writeFileSync(path.join(dossier, 'calendrier2.json'), JSON.stringify({ t: MAINT, source: 'Forex Factory (test)', evenements: [{ title: 'CPI m/m', country: 'USD', date: iso(MAINT + 3 * H), impact: 'High', forecast: '0.3%', previous: '0.2%' }, { title: 'Housing Starts', country: 'USD', date: iso(MAINT + 5 * H), impact: 'Low', forecast: '1.3M', previous: '1.4M' }, { title: 'FOMC Member Waller Speaks', country: 'USD', date: iso(MAINT + 26 * H), impact: 'Medium' }] }));
const art = (source, titre, dt) => ({ source, titre, t: MAINT - dt * MIN, guid: source + dt, lien: 'https://exemple.test/' + source + dt });
let E = integrer(etatVide(), [art('trump', 'Trump: I am imposing new tariffs on Chinese semiconductor chips, effective immediately', 600), art('financialjuice', 'FinancialJuice: Trump imposing new tariffs on Chinese semiconductor chips effective immediately', 598), art('investinglive', 'Trump says imposing new tariffs on Chinese semiconductor chips effective immediately', 595), art('trump', 'Trump says he is pausing the tariffs on Chinese semiconductor chips after a deal', 400), art('financialjuice', 'FinancialJuice: Powell: Fed will cut interest rates at the next FOMC meeting', 90), art('coindesk', 'Bitcoin ETF sees record inflows as crypto rallies strongly', 200)], MAINT);
E.cartes.find(c => /imposing new tariffs/.test(c.titre)).reaction = { mesuree: 3, attente: false, actifs: { us100: { p5: -0.2, p15: -0.9, p60: -1.4 } }, max: { actif: 'us100', horizon: 15, pct: -0.9, atr: 1.8 }, texte: 'le marché a réagi : Nasdaq −0,9 % en 15 min' };
E.sources = { trump: { id: 'trump', nom: 'Truth Social (Trump)', voie: 'rapide', ok: true, t: MAINT, derniere: MAINT - 400 * MIN, delaiMoyenMs: 45e3 }, bls: { id: 'bls', nom: 'BLS (emploi, inflation)', voie: 'lente', ok: false, erreur: 'HTTP 403', t: MAINT } };
fs.writeFileSync(path.join(dossier, 'reseau-etat.json'), JSON.stringify({ ...E, memoire: [] })); fs.writeFileSync(path.join(dossier, 'reseau-annonces.json'), JSON.stringify({ entrees: [], amorce: true }));
const R = await construireTout(dossier, { maintenant: MAINT, reseau: false, actifs: ['or', 'us100', 'btc'] }); ecrireFiches(dossier, R);
const serveur = http.createServer((req, res) => { const f = path.join(dossier, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '').replace(/\.\./g, '')); res.setHeader('Access-Control-Allow-Origin', '*'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('absent'); } res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(res); }).listen(8802, '127.0.0.1');

const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-copilote', stockage: { rayle_donnees_base: 'http://127.0.0.1:8802/', rayle_point_visite_v1: { derniere: Date.now() - 9 * H - 5 * MIN, precedente: Date.now() - 9 * H - 5 * MIN } } }), { p, verif, attendre, texte, capture } = T;
const fermer = async () => { await new Promise(r => serveur.close(r)); fs.rmSync(dossier, { recursive: true, force: true }); await T.fin(); };
try {
  console.log('— proposition après 9 h d’absence —');
  verif(await attendre(() => p.evaluate(() => !!document.getElementById('point-propose')), 40000), 'le bandeau « Tu étais absent… » apparaît à l’ouverture');
  verif(/Tu étais absent depuis 9 heures, je te fais le point \?/.test(await texte('#point-propose')), 'avec la phrase de Rayle');
  await capture('01-proposition'); await p.evaluate(() => document.querySelector('#point-propose [data-non]').click());

  console.log('— Marchés › Actualité : réseau d’information —');
  await p.evaluate(() => window.Application.ouvrir('marches')); await attendre(() => p.evaluate(() => !!document.querySelector('#marches-fenetre .tp-nav')));
  await p.evaluate(() => document.querySelector('#marches-fenetre [data-onglet="actualite"]').click());
  verif(await attendre(() => p.evaluate(() => /À LA UNE/.test((document.querySelector('#marches-fenetre .tp-onglet') || {}).innerText || '')), 25000), 'À LA UNE s’affiche');
  const t1 = await texte('#marches-fenetre .tp-onglet');
  verif(/imposing new tariffs/.test(t1) && /4 sources|3 sources/.test(t1) && /Nasdaq −0,9 % en 15 min/.test(t1), 'carte dédoublonnée « n sources » et réaction mesurée du marché');
  verif(await p.evaluate(() => document.querySelectorAll('#marches-fenetre .tp-liste-une .tp-carte').length >= 3 && document.querySelectorAll('#marches-fenetre .tp-score').length >= 5), 'cartes avec leur score');
  verif(await p.evaluate(() => document.documentElement.scrollWidth <= visualViewport.width + 1), 'aucun débordement horizontal');
  await capture('02-actualite');
  await p.evaluate(() => { const li = [...document.querySelectorAll('#marches-fenetre .tp-carte')].find(x => /pausing the tariffs/.test(x.innerText)) || document.querySelector('#marches-fenetre .tp-carte'); li.querySelector('[data-score]').click(); });
  verif(await attendre(() => p.evaluate(() => !!document.querySelector('#marches-fenetre [data-detail]'))), 'un clic sur le score ouvre la page détail');
  const d = await texte('#marches-fenetre [data-detail]'); verif(/Pourquoi \d+ \?/.test(d) && /Qui parle/.test(d) && /Fil d’histoire/.test(d) && /REVIREMENT/.test(d) && /Rayle, explique-moi/.test(d), 'détail : score expliqué, fil d’histoire avec revirement, bouton « explique-moi »');
  await capture('03-detail-info'); await p.evaluate(() => document.querySelector('#marches-fenetre [data-retour]').click());
  await p.evaluate(() => [...document.querySelectorAll('#marches-fenetre [data-sous]')].find(b => b.dataset.sous === 'sources').click());
  verif(await attendre(() => p.evaluate(() => /État des sources/.test((document.querySelector('#marches-fenetre .tp-onglet') || {}).innerText || ''))), 'onglet Sources et réglages');
  const s = await texte('#marches-fenetre .tp-onglet'); verif(/hors ligne/.test(s) && /HTTP 403/.test(s) && /Mode nuit/.test(s) && /Personnalités suivies/.test(s) && /Donald Trump/.test(s), 'état des sources (hors ligne + raison), mode nuit, personnalités modifiables');
  await capture('04-sources');
  await p.evaluate(() => [...document.querySelectorAll('#marches-fenetre [data-sous]')].find(b => b.dataset.sous === 'personnes').click()); await w(800);
  verif(/Powell/.test(await texte('#marches-fenetre .tp-onglet')), 'onglet Personnalités');

  console.log('— Marchés › Aujourd’hui : annonces notées —');
  await p.evaluate(() => document.querySelector('#marches-fenetre [data-onglet="aujourdhui"]').click());
  verif(await attendre(() => p.evaluate(() => document.querySelectorAll('#marches-fenetre .tp-evt [data-evt]').length > 0), 25000), 'les annonces ont une note');
  await p.evaluate(() => [...document.querySelectorAll('#marches-fenetre [data-imp]')].find(b => b.dataset.imp === 'faible').click()); await w(300);
  await p.evaluate(() => document.querySelector('#marches-fenetre .tp-evt a[data-evt]').click());
  verif(await attendre(() => p.evaluate(() => !!document.querySelector('#marches-fenetre [data-detail-annonce]'))), 'clic sur une annonce : page détail');
  const a = await texte('#marches-fenetre [data-detail-annonce]');
  verif(/Consensus \(prévu\)/.test(a) && /session à ce moment/.test(a) && /Pourquoi \d+ \?/.test(a) && /Réaction historique/.test(a) && /AU-DESSUS du consensus/.test(a) && /Le conseil du copilote/.test(a) && /Rayle, explique-moi/.test(a), 'détail d’annonce : consensus, session, note expliquée, réaction historique, scénarios, conseil');
  verif(await p.evaluate(() => document.documentElement.scrollWidth <= visualViewport.width + 1), 'détail d’annonce sans débordement'); await capture('05-detail-annonce');
  await p.evaluate(() => document.querySelector('#marches-fenetre [data-retour]').click()); await p.evaluate(() => window.Application.fermer && window.Application.fermer('marches')); await w(300);

  console.log('— point de Rayle —');
  await p.evaluate(async () => { const m = await import('/trader-pro/point/fenetre.js'); m.ouvrirPoint({ type: 'depuis', depuis: Date.now() - 9 * 3600e3, absenceMs: 9 * 3600e3 }); });
  verif(await attendre(() => p.evaluate(() => document.querySelectorAll('#point-rayle .tp-point-sec.tp-visible').length >= 3), 30000), 'le point s’affiche section par section (fenêtre animée)');
  const pt = await texte('#point-rayle'); verif(/ce qui s’est passé/i.test(pt) && /où on en est/i.test(pt) && /agenda/i.test(pt) && /le conseil de la copilote/i.test(pt), 'sections du plan : ' + (pt.match(/^(Ce qui|Ce que|Session|Où|Scénarios|Le conseil|Agenda)[^\n]*/gm) || []).join(' | '));
  verif(!/vas-y|n’y va pas/i.test(pt), 'jamais d’ordre'); verif(await p.evaluate(() => document.documentElement.scrollWidth <= visualViewport.width + 1), 'point sans débordement'); await capture('06-point');
  const montre = await p.evaluate(() => !!document.querySelector('#point-rayle [data-montre]'));
  if (montre) {
    await p.evaluate(() => document.querySelector('#point-rayle [data-montre]').click());
    verif(await attendre(() => p.evaluate(() => !!document.querySelector('.tp-relecture canvas')), 30000), '« Montre-moi » ouvre la relecture avec un vrai graphique');
    await w(2500); verif(await p.evaluate(() => /MA200/.test(document.querySelector('.tp-relecture').innerText) && !!document.querySelector('.tp-relecture [data-jouer]')), 'MA200, légende du volume et commandes de lecture');
    await capture('07-relecture'); await p.evaluate(() => document.querySelector('.tp-relecture [data-voir]').click()); await w(400);
    verif(/Bougie H4 de/.test(await texte('.tp-relecture [data-texte]')), '« Qu’est-ce que tu vois là ? » décrit la bougie');
    await p.evaluate(() => document.querySelector('.tp-relecture [data-fermer]').click());
  } else console.log('  ℹ pas de gros mouvement détecté dans les données synthétiques : « Montre-moi » non testé');
  await p.evaluate(() => document.querySelector('#point-rayle [data-fermer]').click());

  console.log('— commande vocale —');
  const rep = await p.evaluate(async () => (await window.TraderPro.commande('Rayle, qu’est-ce qui se passe ? Dis-moi tout')) || '');
  verif(rep.length > 150 && /Tu étais absent|L’or|Nasdaq|Bitcoin|Rien de marquant/.test(rep), 'la voix répond par un point (' + rep.length + ' caractères)');
  verif(await attendre(() => p.evaluate(() => !!document.getElementById('point-rayle')), 8000), 'et ouvre la fenêtre du point');
  const rn = await p.evaluate(async () => (await window.TraderPro.commande('quoi de neuf d’important ?')) || ''); verif(/Voici les \d+ infos/.test(rn), 'la voix répond aussi « quoi de neuf d’important ? » : ' + rn.slice(0, 60));

  console.log('— copilote en direct —');
  const mo = await p.evaluate(async () => { const r = await import('/trader-pro/copilote/regarde.js'); const M = await r.momentsActuels({ maxAgeMs: 30 * 3600e3 }); if (!M.length) return null; await r.ouvrirRegardeCa(M[0], { parler: () => {} }); return { n: M.length, titre: M[0].titre, chiffres: M[0].chiffres.length }; });
  if (mo) { verif(mo.chiffres >= 3, 'Regarde ça : ' + mo.titre + ' (' + mo.chiffres + ' chiffres)'); verif(await attendre(() => p.evaluate(() => !!document.querySelector('.tp-relecture canvas') && /Ce qu’il faut regarder/.test(document.querySelector('.tp-relecture').innerText)), 25000), 'le graphique s’ouvre avec le panneau « Ce qu’il faut regarder »'); await w(2000); verif(await p.evaluate(() => document.querySelectorAll('.tp-relecture .tp-regarde li').length >= 3 && document.documentElement.scrollWidth <= visualViewport.width + 1), 'chiffres + pourquoi, sans débordement'); await capture('08-regarde-ca'); await p.evaluate(() => document.querySelector('.tp-relecture [data-fermer]').click()); }
  else console.log('  ℹ aucun gros moment dans les données synthétiques : « Regarde ça » non testé');
  await p.evaluate(async () => { const r = await import('/trader-pro/copilote/regarde.js'); await r.ouvrirMontreMoi('or', { parler: () => {}, auto: false }); });
  verif(await attendre(() => p.evaluate(() => /La MA200 H4|La MA200 Daily/.test((document.querySelector('.tp-relecture [data-panneau]') || {}).innerText || '')), 20000), '« Rayle, montre-moi » : première étape = la MA200');
  await p.evaluate(() => document.querySelector('.tp-relecture [data-suiv-etape]').click()); await w(500); verif(/bougie|volume/i.test(await texte('.tp-relecture [data-texte]')), 'étape suivante : les bougies à fort volume'); await capture('09-montre-moi');
  await p.evaluate(() => { const i = document.querySelector('.tp-relecture [data-question]'); i.value = 'pourquoi celle-là ?'; document.querySelector('.tp-relecture [data-poser]').click(); }); await w(400);
  verif(/surligné|dernière bougie|volume/i.test(await texte('.tp-relecture [data-texte]')), 'on peut l’interrompre : « pourquoi celle-là ? »'); await p.evaluate(() => document.querySelector('.tp-relecture [data-fermer]').click());
  const idee = await p.evaluate(async () => (await window.TraderPro.commande('Rayle, je regarde un achat sur l’or, j’ai vu la MA200')) || ''); verif(/Pour un achat sur l’or/.test(idee) && /Je ne te dis ni d’y aller ni de ne pas y aller/.test(idee) && !/vas-y/i.test(idee), 'trader ensemble : la lecture AVANT (ni « vas-y » ni « n’y va pas »)');
  verif(await p.evaluate(() => (JSON.parse(localStorage.getItem('rayle_copilote_carnet_v1') || '[]')[0] || {}).etat === 'ouvert'), 'l’idée est enregistrée dans le carnet de copilote');
  await p.evaluate(async () => { const m = await import('/trader-pro/copilote/carnet-ui.js'); await m.ouvrirCarnet(); }); verif(await attendre(() => p.evaluate(() => /achat sur l’or/i.test((document.querySelector('#carnet-copilote') || {}).innerText || '')), 10000), 'le carnet montre l’idée'); await capture('10-carnet');
  verif(/Tu repères déjà seul|Pas encore assez d’idées/.test(await texte('#carnet-copilote')), 'ce que tu repères seul'); await p.evaluate(() => document.querySelector('#carnet-copilote [data-fermer]').click());
  await p.evaluate(async () => { const m = await import('/trader-pro/copilote/formation-ui.js'); await m.ouvrirFormation({ actif: 'or' }); });
  verif(await attendre(() => p.evaluate(() => /plus gros mouvements|Ce qui se répète|Aucun gros mouvement|pas assez d’historique/i.test((document.querySelector('#formation-copilote') || {}).innerText || '')), 25000), 'Formation : les gros mouvements des derniers mois'); await capture('11-formation');
  if (await p.evaluate(() => !!document.querySelector('#formation-copilote [data-relire]'))) { await p.evaluate(() => document.querySelector('#formation-copilote [data-relire]').click()); verif(await attendre(() => p.evaluate(() => !!document.querySelector('.tp-relecture canvas')), 25000), 'Relire ce mouvement : relecture bougie par bougie'); await p.evaluate(() => document.querySelector('.tp-relecture [data-fermer]').click()); }
  await p.evaluate(() => document.querySelector('#formation-copilote [data-fermer]').click());
  const sil = await p.evaluate(async () => (await window.TraderPro.commande('Rayle, alertes silencieuses jusqu’à demain')) || ''); verif(/alertes silencieuses jusqu’à/.test(sil), 'commande vocale : alertes silencieuses jusqu’à demain');
} catch (e) { console.log('  ✗ exception : ' + (e && e.message)); T.verif(false, 'exception'); }
await fermer();
