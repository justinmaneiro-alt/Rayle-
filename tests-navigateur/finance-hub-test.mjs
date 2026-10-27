import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
import { repondre } from './finance-fixtures.mjs';

/* Hub Finance (M2b) dans Chrome : calendrier, COT, actualités, banques centrales, taux, publications, Nasdaq 100 + SEC, voix, étiquettes RÉEL / DIFFÉRÉ / INDISPONIBLE, Worker absent.
   Toutes les sources sont des FAUSSES réponses (finance-fixtures.mjs) interceptées dans le navigateur : aucun réseau réel, aucun secret.
   Lancer :  node tests-navigateur/finance-hub-test.mjs   (serveur local : node serveur.mjs, port 8000) */
const { verifier, fin } = compteur();
const WORKER = 'http://127.0.0.1:8797';
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const erreurs = [];
async function ouvrir({ brutAbsent = false } = {}) {
  const page = await navigateur.newPage(); await page.setViewport({ width: 1500, height: 1000 });
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 220)); });
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 220)));
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    const r = repondre(url, { workerBase: WORKER, brutAbsent });
    if (r) return req.respond({ status: r.statut || 200, contentType: r.type, headers: { 'Access-Control-Allow-Origin': '*' }, body: r.corps });
    req.respond({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{"error":"route inconnue"}' });
  });
  await page.evaluateOnNewDocument(w => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', w); localStorage.setItem('rayle_worker_token', 'test'); localStorage.removeItem('rayle_finance_cache_v1'); }, WORKER);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
  await page.evaluate(() => { const b = document.createElement('div'); b.id = 'banc'; b.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#05080c;overflow:auto;color:#cfe3ee'; document.body.appendChild(b); });
  return page;
}
const monter = (page, nom) => page.evaluate(async nom => {
  const m = await import(new URL('planetes/mars/pc/trading/panneaux-finance.js', document.baseURI).href); const p = m[nom]();
  const banc = document.getElementById('banc'); banc.innerHTML = ''; banc.appendChild(p.racine); window.__p = p; await p.maj(); return true;
}, nom);
const texte = page => page.evaluate(() => document.getElementById('banc').innerText);
const attendreTexte = async (page, re, ms = 15000) => { try { await page.waitForFunction(r => new RegExp(r).test(document.getElementById('banc').innerText), { timeout: ms }, re); } catch (e) { console.log('ATTENTE ECHOUEE pour /' + re + '/ ; contenu : ' + (await texte(page)).slice(0, 700).split('\n').join(' | ') + ' ; erreurs: ' + erreurs.slice(-3).join(' | ')); throw e; } };

const page = await ouvrir();

/* ── Calendrier ── */
await monter(page, 'creerPanneauCalendrier'); await attendreTexte(page, 'Décision de taux du FOMC');
let t = await texte(page);
verifier('calendrier : étiquette DIFFÉRÉ, sources citées (public, Fed, BLS, résultats)', /DIFFÉRÉ/.test(t) && /Forex Factory/.test(t) && /Fed/.test(t) && /BLS/.test(t) && /Alpha Vantage/.test(t), t.slice(0, 200));
verifier('calendrier : FOMC (Fed officiel) et événements publics présents, jours fériés absents', /Décision de taux du FOMC/.test(t) && /ECB Press Conference/.test(t) && !/Bank Holiday/.test(t));
verifier('calendrier : prévu et précédent affichés', /0\.3%/.test(t) && /0\.4%/.test(t));
verifier('calendrier : « réel » du CPI américain fourni par le BLS (officiel), pas pour l’EUR', await page.evaluate(() => { const l = [...document.querySelectorAll('#banc tr')].find(r => /CPI m\/m/.test(r.textContent)); const e = [...document.querySelectorAll('#banc tr')].find(r => /ECB Press/.test(r.textContent)); return !!l && /\d\.\d%/.test(l.children[7].textContent) && !!e && !/\d\.\d%/.test(e.children[7].textContent); }));
verifier('calendrier : compte à rebours « dans … »', /dans \d+ h|dans \d+ min|dans \d+ jours?/.test(t));
await page.evaluate(() => document.querySelector('#banc [data-impact="high"]').click()); await attendre(500);
verifier('calendrier : filtre « Fort » masque les événements d’impact moyen', !/Unemployment Claims/.test(await texte(page)) && /ECB Press Conference/.test(await texte(page)));

/* ── COT ── */
await monter(page, 'creerPanneauCot'); await attendreTexte(page, 'Fonds à effet de levier');
t = await texte(page);
verifier('COT : 5 catégories TFF avec net, variation, % de l’intérêt ouvert, percentile', ['Dealers', 'Gérants d’actifs', 'Fonds à effet de levier', 'Autres déclarants', 'Petits opérateurs'].every(x => t.includes(x)) && /Percentile/.test(t) && /% int\. ouvert/i.test(t));
verifier('COT : étiquette DIFFÉRÉ, source CFTC, publication le vendredi, phrase de lecture, « pas un signal »', /DIFFÉRÉ/.test(t) && /CFTC/.test(t) && /publié le 2026-10-16/.test(t) && /Donnée hebdomadaire différée/.test(t) && /pas un signal/.test(t));
verifier('COT : graphique de la position nette dessiné (canvas non vide)', await page.evaluate(() => { const c = document.querySelector('#banc canvas'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n > 800; }));
await page.evaluate(() => document.querySelector('#banc [data-contrat="XAU"]').click()); await attendreTexte(page, 'Gérants de fonds spéculatifs');
verifier('COT : choix de l’or = rapport Disaggregated (gérants de fonds spéculatifs, swap dealers)', /Swap dealers/.test(await texte(page)) && /Disaggregated/.test(await texte(page)));

/* ── Actualités ── */
await monter(page, 'creerPanneauActus'); await attendreTexte(page, 'Nvidia earnings beat');
t = await texte(page);
verifier('actus : titres classés par impact, avec source, actifs touchés et raisons du classement', /Stocks rally as Nvidia/.test(t) && /CNBC/.test(t) && /classement :/.test(t) && /US100/.test(t));
const ordre = await page.evaluate(() => [...document.querySelectorAll('#banc .fi-liste li')].map(l => l.className));
verifier('actus : l’impact fort passe avant le faible', ordre.indexOf('fort') < ordre.lastIndexOf('faible') && ordre.includes('faible'), ordre.join());
verifier('actus : liens externes sûrs (noopener, nouvel onglet)', await page.evaluate(() => [...document.querySelectorAll('#banc .fi-liste a')].every(a => a.target === '_blank' && /noopener/.test(a.rel))));
verifier('actus : étiquette RÉEL (titres récents) et sources listées', /RÉEL/.test(t) && /Sources :/.test(t));
await page.evaluate(() => [...document.querySelectorAll('#banc .fi-chip')].find(b => b.textContent === 'Or').click()); await attendre(600);
t = await texte(page);
verifier('actus : filtre par actif (Or) : titres sur l’or seulement', /Gold hits record/.test(t) && !/Ten tips for decorating/.test(t) && !/Bitcoin slumps/.test(t));
await page.evaluate(() => [...document.querySelectorAll('#banc .fi-chip')].find(b => b.textContent === 'Tout').click()); await attendre(300);
await page.evaluate(() => document.querySelector('#banc [data-bouge]').click()); await attendre(600);
t = await texte(page);
verifier('actus : « ce qui fait bouger les prix » = impact fort macro / banque centrale / crypto seulement', /Fed signals rate cuts|CPI jumps/.test(t) && !/Ten tips for decorating/.test(t));

/* ── Banques centrales ── */
await monter(page, 'creerPanneauBanques'); await attendreTexte(page, 'Bank of England holds');
t = await texte(page);
verifier('banques : publications OFFICIELLES étiquetées, plusieurs banques', /SOURCE OFFICIELLE/.test(t) && /Bank of England/.test(t) && /ECB keeps interest rates/.test(t) && /SNB leaves/.test(t) && /Bank of Canada/.test(t));
verifier('banques : prochains rendez-vous (FOMC du calendrier officiel de la Fed)', /Prochains rendez-vous/.test(t) && /Décision de taux du FOMC/.test(t));
await page.evaluate(() => document.querySelector('#banc [data-banque="BCE"]').click()); await attendre(600);
t = await texte(page);
verifier('banques : filtre BCE', /ECB keeps interest rates/.test(t) && !/Bank of England holds/.test(t));

/* ── Taux ── */
await monter(page, 'creerPanneauTaux'); await attendreTexte(page, 'Chômage|chômage|Taux de chômage');
t = await texte(page);
verifier('taux : courbe 3 mois / 2 / 5 / 10 / 30 ans, variations en points de base, écarts', /2Y/.test(t) && /10Y/.test(t) && /30Y/.test(t) && /Écarts : 2s10s/.test(t) && /Jour \(pb\)/.test(t));
verifier('taux : BLS officiel (inflation, chômage, emplois) et étiquettes', /Inflation \(CPI\) sur un an/.test(t) && /Taux de chômage/.test(t) && /Emplois créés/.test(t) && /Trésor américain/.test(t) && /DIFFÉRÉ/.test(t));
verifier('taux : graphique 2 ans / 10 ans dessiné', await page.evaluate(() => { const c = document.querySelector('#banc canvas'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n > 500; }));

/* ── Publications ── */
await monter(page, 'creerPanneauPublications'); await attendreTexte(page, 'Economic Bulletin');
t = await texte(page);
verifier('publications : mention claire « analyses payantes non simulées », sources publiques seulement', /PAYANTES/.test(t) && /ne sont pas affichées ici et ne sont pas simulées/.test(t) && /PUBLICATIONS PUBLIQUES/.test(t) && /BRI/.test(t) && /ING Think/.test(t));

/* ── Nasdaq 100 + SEC ── */
await monter(page, 'creerPanneauNasdaq'); await attendreTexte(page, 'moyenne simple');
t = await texte(page);
verifier('Nasdaq 100 : 100 tuiles, composition indicative et poids indisponibles dits clairement, DIFFÉRÉ', await page.evaluate(() => document.querySelectorAll('#banc .fi-tuile').length) === 100 && /Composition indicative/.test(t) && /tuiles de taille égale/.test(t) && /DIFFÉRÉ/.test(t));
await page.evaluate(() => document.querySelector('#banc .fi-tuile').click()); await attendreTexte(page, '8-K');
t = await texte(page);
verifier('SEC : clic sur une valeur = dépôts officiels (8-K, rubriques, document), RÉEL', /5\.02|départ ou nomination/.test(t) && /résultats financiers/.test(t) && /SEC EDGAR/.test(t) && await page.evaluate(() => /sec\.gov\/Archives/.test(document.querySelector('#banc .fi-sec a').href)));

/* ── voix ── */
const voix = p => page.evaluate(p => window.commandeMars(p), p);
let r = await voix('le COT de l’or sur Mars');
verifier('voix : « le COT de l’or » → réponse parlée réelle + onglet COT ouvert', /COT sur l’or/.test(r) && /différée/.test(r), String(r).slice(0, 160));
await attendre(1200);
verifier('voix : l’espace de travail s’ouvre sur l’onglet COT avec le contrat de l’or', await page.evaluate(() => { const o = document.querySelector('.tg-onglet.actif'); return !!o && o.dataset.panneau === 'cot' && /Swap dealers|Gérants de fonds/.test(document.querySelector('.tg-dock-p.visible') ? document.querySelector('.tg-dock-p.visible').innerText : ''); }));
r = await voix('le calendrier de la semaine sur Mars');
verifier('voix : « le calendrier de la semaine »', /événements importants à venir/.test(r) || /Aucun événement/.test(r), String(r).slice(0, 200));
r = await voix('que dit la Fed ?');
verifier('voix : « que dit la Fed ? » → publications officielles', /Dernières publications officielles de la Fed/.test(r) && /langue d’origine/.test(r), String(r).slice(0, 200));
r = await voix('les actualités qui font bouger le Nasdaq');
verifier('voix : « les actualités qui font bouger le Nasdaq »', /pour le Nasdaq 100/.test(r) && /impact/.test(r), String(r).slice(0, 220));
r = await voix('la courbe des taux');
verifier('voix : « la courbe des taux »', /Courbe des taux américains/.test(r) && /Trésor américain/.test(r) && /Inflation américaine/.test(r), String(r).slice(0, 220));
r = await voix('les résultats de Nvidia');
verifier('voix : « les résultats de Nvidia » (SEC)', /Nvidia/.test(r) && /SEC EDGAR/.test(r), String(r).slice(0, 200));
r = await voix('la carte du Nasdaq 100');
verifier('voix : « la carte du Nasdaq 100 »', /valeurs du Nasdaq 100/.test(r) && /moyenne simple/.test(r) && /différées/.test(r), String(r).slice(0, 200));
verifier('voix : phrases étrangères ignorées', (await voix('quelle heure est-il')) == null && (await voix('raconte-moi une blague sur les taux d’intérêt de mon prêt immobilier maison')) == null);
await page.close();

/* ── Worker sans les routes /finance (non déployé) : jamais de chiffre inventé ── */
const p2 = await ouvrir({ brutAbsent: true });
await monter(p2, 'creerPanneauNasdaq'); await attendreTexte(p2, 'INDISPONIBLE');
t = await texte(p2);
verifier('Worker non déployé : Nasdaq 100 dit « INDISPONIBLE · route du Worker non déployée », aucune tuile', /route du Worker non déployée/.test(t) && await p2.evaluate(() => document.querySelectorAll('#banc .fi-tuile').length) === 0);
await monter(p2, 'creerPanneauBanques'); await attendreTexte(p2, 'INDISPONIBLE');
verifier('Worker non déployé : banques centrales INDISPONIBLES avec la raison', /INDISPONIBLE/.test(await texte(p2)));
await monter(p2, 'creerPanneauCot'); await attendreTexte(p2, 'Fonds à effet de levier');
verifier('Worker non déployé : le COT (appel direct CFTC) continue de marcher', /DIFFÉRÉ/.test(await texte(p2)));
await monter(p2, 'creerPanneauTaux'); await attendreTexte(p2, 'Écarts : 2s10s');
verifier('Worker non déployé : les taux (Trésor, BLS en direct) continuent de marcher', /Taux de chômage/.test(await texte(p2)));
await monter(p2, 'creerPanneauCalendrier'); await attendreTexte(p2, 'route du Worker non déployée', 20000);
verifier('Worker non déployé : calendrier indique les sources indisponibles (pas d’invention)', /INDISPONIBLE|route du Worker non déployée/.test(await texte(p2)));
await p2.close();

const filtrees = erreurs.filter(e => !/Failed to load resource|net::ERR|route inconnue|\b404\b|\b502\b/.test(e));
verifier('aucune erreur JavaScript inattendue', filtrees.length === 0, filtrees.slice(0, 3).join(' | '));
await navigateur.close();
process.exit(fin() ? 1 : 0);
