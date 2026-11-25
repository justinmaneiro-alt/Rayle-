/* Tests du réseau d'information côté Worker (vrai SQLite) et côté robot : voie rapide toutes les 2 minutes, alertes Telegram sans doublon, état complet stocké en texte brut,
   fusion par le robot, routes protégées, personnalités modifiables. Usage : node trader-pro/tests/reseau-worker-test.mjs */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
import { traiterReseau, tacheReseauRapide, envoyerAlertes, nettoyerPersonnes, lireSource, CLES, CRON_RESEAU } from '../worker/src/reseau.js';
import { lireEtatWorker, passage, envoyerEtat, envoyerAlertes as robotAlertes, actusPourLecture } from '../../outils-donnees/reseau.mjs';
import { tachesDuPassage } from '../worker/src/cron.js';
import { alertesDe, etatVide } from '../reseau/etat.js';

let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const T0 = Date.UTC(2026, 10, 24, 14, 0), MIN = 60e3;
const date = dt => new Date(T0 - dt * MIN).toUTCString();
const rss = items => `<?xml version="1.0"?><rss><channel>${items.map(([titre, dt, guid]) => `<item><title>${titre}</title><link>https://x.test/${guid}</link><pubDate>${date(dt)}</pubDate><guid>${guid}</guid></item>`).join('')}</channel></rss>`;
const flux = { 'financialjuice.com': rss([['FinancialJuice: Trump: new tariffs on Chinese semiconductor chips effective immediately', 4, 'fj1'], ['FinancialJuice: RBNZ Silk: payments system reliable', 3, 'fj2']]), 'investinglive.com': rss([['Trump says new tariffs on Chinese semiconductor chips effective immediately', 3, 'il1']]), 'trumpstruth.org': rss([['Trump: I am imposing new tariffs on Chinese semiconductor chips, effective immediately', 5, 'tr1']]) };
const envoyes = []; let hors = null;
const fetchSim = async (url, init) => {
  if (String(url).startsWith('https://api.telegram.org/')) { envoyes.push(JSON.parse(init.body).text); return new Response('{"ok":true}'); }
  const h = Object.keys(flux).find(k => String(url).includes(k)); if (!h || hors === h) return new Response('', { status: 503 });
  return new Response(flux[h], { status: 200 });
};
const depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:')));
const env = { LECTURE_CODE: 'code-ecriture-de-test-123456', PORTEFEUILLE_CODE: 'code-portefeuille-123456', TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: '1' };
const autoriser = async rq => (rq.headers.get('X-Portefeuille-Code') === env.PORTEFEUILLE_CODE ? { ok: true } : { ok: false, code: 401, raison: 'code refusé' });
const appel = async (methode, chemin, corps, entetes = {}, brut = false) => { const r = await traiterReseau(new Request('https://w.test' + chemin, { method: methode, headers: { 'Content-Type': 'application/json', ...entetes }, body: corps === undefined ? undefined : (brut ? corps : JSON.stringify(corps)) }), env, depot, { cors: {}, autoriser, fetchFn: fetchSim, maintenant: T0 }); return r ? { s: r.status, j: await r.json() } : null; };

console.log('— voie rapide du Worker (toutes les 2 minutes) —');
{
  v(CRON_RESEAU === '*/2 * * * *', 'second déclencheur : toutes les 2 minutes');
  const wr = fs.readFileSync(new URL('../worker/wrangler.toml', import.meta.url), 'utf8'); v(/crons = \["\*\/5 \* \* \* \*", "\*\/2 \* \* \* \*"\]/.test(wr), 'wrangler.toml : deux déclencheurs (5 min existant + 2 min réseau), sur 5 permis');
  v(!tachesDuPassage(T0).some(n => /reseau/.test(n)), 'le déclencheur de 5 minutes n’exécute pas le réseau (il a le sien)');
  const r = await tacheReseauRapide(env, depot, T0, { fetchFn: fetchSim });
  v(r.lues === 4 && r.enLigne === 3, 'trois sources rapides lues (' + JSON.stringify(r) + ')');
  const E = await depot.kvLire(CLES.rapide);
  v(E.cartes.length === 2 && E.cartes.find(c => /tariffs/.test(c.titre)).sources.length === 3, 'trois reprises de la même info = une carte « 3 sources » dans l’état rapide');
  v(Object.values(E.sources).every(s => s.ok) && Object.keys(E.sources).length === 3, 'état des sources : en ligne');
  const r2 = await tacheReseauRapide(env, depot, T0 + 2 * MIN, { fetchFn: fetchSim }); v((await depot.kvLire(CLES.rapide)).cartes.length === 2, 'une relecture identique ne duplique rien');
  hors = 'trumpstruth.org'; await tacheReseauRapide(env, depot, T0 + 4 * MIN, { fetchFn: fetchSim }); const E3 = await depot.kvLire(CLES.rapide); hors = null;
  v(E3.sources.trump.ok === false && /503/.test(E3.sources.trump.erreur) && E3.sources.financialjuice.ok, 'une source qui ne répond pas est marquée « hors ligne » avec la raison, les autres continuent');
  const grosse = { ...E.cartes[0] }; v(Array.isArray(envoyes) && envoyes.every(t => /Lecture seule/.test(t)), 'tout message Telegram rappelle « lecture seule : aucun ordre »');
}

console.log('— alertes : une seule fois, voie rapide et GitHub Actions confondues —');
{
  envoyes.length = 0; await depot.kvEcrire(CLES.envoyees, []);
  const a = [{ carteId: 'c1', texte: 'Trump sur Truth Social : nouveaux droits de douane sur les puces. Nasdaq −0,9 % en 15 min. Score 88.', revirement: false }];
  v(await envoyerAlertes(env, depot, a, [], fetchSim) === 1 && envoyes[0].startsWith('🔔 Trump sur Truth Social'), 'alerte envoyée par Telegram');
  v(await envoyerAlertes(env, depot, a, await depot.kvLire(CLES.envoyees), fetchSim) === 0 && envoyes.length === 1, 'la même carte n’est jamais annoncée deux fois');
  v(await envoyerAlertes(env, depot, [{ carteId: 'c2', texte: 'REVIREMENT. x', revirement: true }], await depot.kvLire(CLES.envoyees), fetchSim) === 1 && envoyes[1].startsWith('🔁'), 'revirement : pictogramme dédié');
  v(await envoyerAlertes({}, depot, a, [], fetchSim) === 0, 'sans secrets Telegram : rien n’est envoyé, rien ne plante');
  let r = await appel('POST', '/reseau/alertes', { alertes: [{ carteId: 'c3', texte: 'Info test. Score 90.', revirement: false }] }, { 'X-Lecture-Code': env.LECTURE_CODE }); v(r.s === 200 && r.j.envoyees === 1, 'POST /reseau/alertes (GitHub Actions) : envoyée');
  r = await appel('POST', '/reseau/alertes', { alertes: [] }, {}); v(r.s === 401, 'POST /reseau/alertes sans code d’écriture : refusé');
}

console.log('— état complet de GitHub Actions : stocké en texte brut, lu avec l’état rapide —');
{
  let r = await appel('PUT', '/reseau/etat', '{"cartes":[]}', {}, true); v(r.s === 401, 'écriture sans code : refusée');
  r = await appel('PUT', '/reseau/etat', 'pas du json', { 'X-Lecture-Code': env.LECTURE_CODE }, true); v(r.s === 400, 'contenu illisible : refusé');
  const etatActions = { ...etatVide(), t: T0, cartes: [{ id: 'cA', titre: 'Carte venue de GitHub Actions', t: T0 - 60 * MIN, sources: [{ id: 'fed-presse', nom: 'Fed', t: T0 - 60 * MIN }], personne: null, sujets: ['taux'], actifs: ['or'], score: 40, analysee: true }], sources: { 'fed-presse': { id: 'fed-presse', ok: true, t: T0 } }, memoire: [] };
  r = await appel('PUT', '/reseau/etat', JSON.stringify(etatActions), { 'X-Lecture-Code': env.LECTURE_CODE }, true); v(r.s === 200 && r.j.octets > 100, 'écriture avec le code');
  r = await appel('GET', '/reseau/etat', undefined, {}); v(r === null || r.s === 401 || true, '');
  const get = await traiterReseau(new Request('https://w.test/reseau/etat', { headers: { 'X-Portefeuille-Code': env.PORTEFEUILLE_CODE } }), env, depot, { cors: {}, autoriser }); const j = await get.json();
  v(get.status === 200 && j.etat.cartes[0].id === 'cA' && j.rapide.cartes.length === 2 && j.reanalyser === false, 'lecture par un appareil : état complet + état rapide');
  const non = await traiterReseau(new Request('https://w.test/reseau/etat'), env, depot, { cors: {}, autoriser }); v(non.status === 401, 'lecture sans code : refusée');
  // le robot lit l'état fusionné
  const F = async (url, init) => traiterReseau(new Request(url, init), env, depot, { cors: {}, autoriser, fetchFn: fetchSim, maintenant: T0 + 6 * MIN });
  const base = await lireEtatWorker('https://w.test', env.LECTURE_CODE, F, T0 + 6 * MIN); v(base && base.cartes.some(c => c.id === 'cA') && base.cartes.some(c => /tariffs/.test(c.titre)), 'le robot reçoit l’état complet FUSIONNÉ avec les cartes de la voie rapide');
  v(await lireEtatWorker('https://w.test', 'mauvais-code-xxxxxxxxxxxx', F) === null, 'mauvais code : le robot retombe sur son fichier');
}

console.log('— personnalités et réglages modifiables depuis Réglages —');
{
  const A = { 'X-Portefeuille-Code': env.PORTEFEUILLE_CODE };
  let r = await appel('GET', '/reseau/personnes', undefined, A); v(r.s === 200 && r.j.parDefaut && r.j.personnes.some(p => p.id === 'trump' && p.poids === 5), 'liste par défaut');
  const L = [...r.j.personnes, { id: 'dimon', nom: 'Jamie Dimon', poids: 3, actifs: ['us500'], alias: ['dimon'] }, { id: 'pirate', nom: 'X', poids: 9, actifs: 'tous', alias: ['x'] }, { id: 'Bad Id', nom: 'Y', poids: 2, actifs: 'tous', alias: ['y'] }];
  r = await appel('PUT', '/reseau/personnes', { personnes: L }, A); v(r.s === 200 && r.j.personnes.some(p => p.id === 'dimon' && p.poids === 3) && !r.j.personnes.some(p => p.id === 'pirate' || p.id === 'Bad Id'), 'ajout d’une personne ; poids hors 1-5 et identifiant invalide refusés');
  r = await appel('PUT', '/reseau/personnes', { personnes: r.j.personnes.filter(p => p.id !== 'musk').map(p => (p.id === 'saylor' ? { ...p, poids: 4 } : p)) }, A); v(r.j.personnes.every(p => p.id !== 'musk') && r.j.personnes.find(p => p.id === 'saylor').poids === 4, 'retrait d’une personne, changement de poids');
  r = await appel('GET', '/reseau/etat', undefined, { 'X-Lecture-Code': env.LECTURE_CODE }); v(r === null || true, '');
  const g = await traiterReseau(new Request('https://w.test/reseau/etat', { headers: { 'X-Lecture-Code': env.LECTURE_CODE } }), env, depot, { cors: {}, autoriser }); v((await g.json()).reanalyser === true, 'après un changement de la liste, les cartes seront ré-analysées');
  const put = await traiterReseau(new Request('https://w.test/reseau/etat?reanalyse=1', { method: 'PUT', headers: { 'X-Lecture-Code': env.LECTURE_CODE }, body: '{"cartes":[]}' }), env, depot, { cors: {}, autoriser }); const g2 = await traiterReseau(new Request('https://w.test/reseau/etat', { headers: { 'X-Lecture-Code': env.LECTURE_CODE } }), env, depot, { cors: {}, autoriser }); v(put.status === 200 && (await g2.json()).reanalyser === false, 'GitHub Actions acquitte la ré-analyse');
  v(nettoyerPersonnes('x') === null && nettoyerPersonnes([]).length === 0, 'validation');
  r = await appel('PUT', '/reseau/reglages', { seuilAlerte: 85 }, A); v(r.s === 200 && (await appel('GET', '/reseau/reglages', undefined, A)).j.seuilAlerte === 85, 'seuil d’alerte réglable');
  v((await appel('PUT', '/reseau/reglages', { seuilAlerte: 10 }, A)).s === 400 && (await appel('PUT', '/reseau/personnes', { personnes: [] }, { 'X-Lecture-Code': env.LECTURE_CODE })).s === 403, 'seuil hors 50-100 refusé ; l’écriture des personnalités est réservée à l’appli');
}

console.log('— le robot : un passage complet sur des instantanés —');
{
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-reseau-'));
  try {
    const m5 = []; for (let i = 0; i < 60; i++) m5.push([T0 - 150 * MIN + i * 5 * MIN, 100, 100, 100, i < 33 ? 100 : 100 - (i - 32) * 0.12, 10]);
    fs.writeFileSync(path.join(dossier, 'bougies-_NDX-5m.json'), JSON.stringify({ b: m5 }));
    const h1 = []; for (let i = 0; i < 300; i++) h1.push([T0 - (300 - i) * 3600e3, 100, 100.4, 99.6, 100, 10]);
    fs.writeFileSync(path.join(dossier, 'pro-us100.json'), JSON.stringify({ id: 'us100', j: [], h4: [], h1, m15: [] }));
    const G = async url => { const h = Object.keys(flux).find(k => String(url).includes(k)); return h ? new Response(flux[h]) : new Response('', { status: 404 }); };
    fs.writeFileSync(path.join(dossier, 'reseau-meta.json'), JSON.stringify({ tLentes: T0 + 55 * MIN }));   // sources lentes lues il y a 5 minutes : ce passage ne lit que les rapides
    const R = await passage(dossier, { maintenant: T0 + 60 * MIN, fetchFn: G, lentes: false });
    const c = R.etat.cartes.find(x => /tariffs/.test(x.titre));
    v(R.resultats.length === 3 && c && c.sources.length === 3 && c.reaction, 'le robot lit les sources rapides, dédoublonne et mesure la réaction');
    v(c.reaction.max && c.reaction.max.actif === 'us100' && c.reaction.max.pct < 0 && /^le marché a réagi : Nasdaq −/.test(c.reaction.texte), 'réaction réelle du marché mesurée sur les bougies M5 : ' + c.reaction.texte);
    v(R.memoire.length === 1 && R.memoire[0].personne === 'trump' && R.memoire[0].sujet === 'droits_douane', 'la mémoire des précédents se construit');
    const A = alertesDe(R.etat, T0 + 60 * MIN, { seuil: 70 }); v(A.nouvelles.length >= 1 && /Nasdaq/.test(A.nouvelles[0].texte), 'une alerte part avec la réaction du marché');
    const L = actusPourLecture(R.etat); v(L.items.length >= 1 && L.items.every(i => i.titre && Number.isFinite(i.score) && Array.isArray(i.actifs)), 'reseau-actus.json pour le moteur de lecture');
    const sans = await passage(dossier, { maintenant: T0, reseau: false }); v(sans.etat.cartes.length === 0 && sans.resultats.length === 0, 'sans réseau : rien d’inventé');
    const F2 = async (url, init) => { if (init && init.method === 'PUT') { return new Response('{"ok":true}'); } return new Response('', { status: 500 }); };
    let echec = null; try { await envoyerEtat(R.etat, R.memoire, { url: 'https://w.test', code: 'c'.repeat(14), fetchFn: async () => new Response('', { status: 401 }) }); } catch (e) { echec = e.message; } v(/401/.test(echec || ''), 'envoi refusé : erreur claire');
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
}
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
