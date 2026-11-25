/* Tests de la phase 5 (le copilote qui prévient sans PC allumé) : heure et jours du point du matin (heure d'été / hiver), message vocal + texte envoyés par le Worker, voix Azure puis Piper puis texte seul,
   une fois par jour, silence ; alertes du copilote (gros moments seulement, types réglables, une seule fois). Telegram et Azure sont simulés : le vrai test se fait en lançant le workflow « matin » à la main.
   Usage : node trader-pro/tests/phase5-test.mjs */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
import { traiterCopilote } from '../worker/src/copilote.js';
import { traiterReseau, nettoyerMatin, MATIN_DEFAUT } from '../worker/src/reseau.js';
import { heureEnvoi, texteTelegram, composerMatin, ssml, voixAzure, voixPiper, synthetiser, executer as executerMatin } from '../../outils-donnees/matin.mjs';
import { calculerAlertes, executer as executerAlertes, TYPE_REGLAGE } from '../../outils-donnees/copilote.mjs';
import { construireTout, ecrireFiches } from '../../outils-donnees/lecture.mjs';
import { regrouper, enH4 } from '../commun/analyse.js';
import { silenceActif, alertesADire } from '../reseau/alertes-voix.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const U = (a, m, j, h = 0, mi = 0) => Date.UTC(a, m - 1, j, h, mi), H = 3600e3, J = 86400e3, MIN = 60e3;

console.log('— heure, jours et fenêtre du point du matin —');
{
  const R = { actif: true, heure: '07:00', jours: [1, 2, 3, 4, 5], vocal: true };
  const mardi7h = U(2026, 11, 24, 6, 0), mardi7h20 = U(2026, 11, 24, 6, 20);   // hiver : 7 h Paris = 6 h UTC (le 24/11/2026 est un mardi)
  v(heureEnvoi(R, null, mardi7h).du && heureEnvoi(R, null, mardi7h20).du && heureEnvoi(R, null, mardi7h).jour === '2026-11-24', 'mardi 7 h et 7 h 20 (Paris, hiver) : à envoyer');
  v(!heureEnvoi(R, null, U(2026, 11, 24, 5, 40)).du && /pas encore/.test(heureEnvoi(R, null, U(2026, 11, 24, 5, 40)).raison) && !heureEnvoi(R, null, U(2026, 11, 24, 6, 50)).du && /dépassée/.test(heureEnvoi(R, null, U(2026, 11, 24, 6, 50)).raison), 'trop tôt, ou fenêtre de 40 minutes dépassée : non');
  v(heureEnvoi(R, null, U(2026, 7, 14, 5, 0)).du && !heureEnvoi(R, null, U(2026, 7, 14, 6, 0)).du, 'l’été, 7 h Paris = 5 h UTC (le décalage est géré par l’heure de Paris)');
  v(!heureEnvoi(R, null, U(2026, 11, 28, 6, 0)).du && /pas un jour choisi/.test(heureEnvoi(R, null, U(2026, 11, 28, 6, 0)).raison) && heureEnvoi({ ...R, jours: [6] }, null, U(2026, 11, 28, 6, 0)).du, 'samedi : pas envoyé par défaut ; si on coche samedi : envoyé');
  v(!heureEnvoi(R, '2026-11-24', mardi7h).du && /déjà envoyé/.test(heureEnvoi(R, '2026-11-24', mardi7h).raison) && heureEnvoi(R, '2026-11-23', mardi7h).du, 'une seule fois par jour');
  v(!heureEnvoi({ ...R, actif: false }, null, mardi7h).du && heureEnvoi({ ...R, heure: '08:30' }, null, U(2026, 11, 24, 7, 35)).du, 'désactivable ; heure réglable (8 h 30)');
  v(JSON.stringify(nettoyerMatin({ heure: '25:99', jours: [0, 1, 9, 'x', 3, 3], actif: false })) === JSON.stringify({ actif: false, heure: '07:00', jours: [1, 3], vocal: true }) && nettoyerMatin({ heure: '06:45' }).heure === '06:45' && MATIN_DEFAUT.heure === '07:00', 'réglages validés côté Worker (heure invalide ignorée, jours 1 à 7)');
}

/* ───── données : instantanés synthétiques + fiches de lecture ───── */
const MAINT = Math.floor(U(2026, 11, 24, 6, 5) / 900e3) * 900e3;
function alea(g) { let s = g >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function pro(id, graine, p0) { const R = alea(graine), n = 420 * 96, t0 = MAINT - n * 900e3, M = []; let p = p0; for (let i = 0; i < n; i++) { const k = n - i, o = p, c = o * (1 + (R() - 0.5) * 0.0024 + (k < 48 ? -0.0011 : 0)); M.push({ t: t0 + i * 900e3, o, h: Math.max(o, c) * 1.0005, l: Math.min(o, c) * 0.9995, c, v: 100 * (0.7 + R() * 0.6) * (k >= 20 && k < 24 ? 5 : 1) }); p = c; } const cp = B => B.map(b => [b.t, b.o, b.h, b.l, b.c, Math.round(b.v)]), nu = B => B.map(({ enCours, ...b }) => b); return { id, nom: id, source: 'test', t: MAINT, prix: M[M.length - 1].c, tPrix: M[M.length - 1].t + 900e3, j: cp(nu(regrouper(M, J, 22 * H, MAINT))), h4: cp(nu(enH4(M, MAINT))), h1: cp(nu(regrouper(M, H, 0, MAINT))), m15: cp(M.slice(-500)) }; }
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-phase5-'));
try {
  for (const [id, g, p0] of [['or', 7, 3700], ['btc', 13, 90000]]) fs.writeFileSync(path.join(dossier, `pro-${id}.json`), JSON.stringify(pro(id, g, p0)));
  const iso = t => new Date(t).toISOString().replace(/\.\d+Z$/, '+00:00');
  fs.writeFileSync(path.join(dossier, 'calendrier2.json'), JSON.stringify({ t: MAINT, evenements: [{ title: 'CPI m/m', country: 'USD', date: iso(MAINT + 20 * MIN), impact: 'High', forecast: '0.3%', previous: '0.2%' }] }));
  const R0 = await construireTout(dossier, { maintenant: MAINT, reseau: false, actifs: ['or', 'btc'] }); ecrireFiches(dossier, R0);

  console.log('— voix : Azure, puis Piper, puis texte seul —');
  const P = composerMatin(dossier, MAINT); v(!P.vide && /^Bonjour Justin\. Voici le point du matin\./.test(P.texteParle) && P.mots > 80, 'le point du matin est composé à partir des fiches du dossier (' + P.mots + ' mots)');
  const T = texteTelegram(P); v(/^☀️ Point du matin/.test(T) && /CE QUI S’EST PASSÉ|ÉTAT|OÙ ON EN EST/.test(T) && /Lecture seule/.test(T) && T.length < 3800, 'version texte : titres de sections, rappel « aucun ordre », taille compatible Telegram (' + T.length + ' caractères)');
  v(/<voice name="fr-FR-VivienneMultilingualNeural">/.test(ssml('Bonjour & « test » <b>')) && /&amp;/.test(ssml('a & b')) && !/<b>/.test(ssml('<b>')), 'SSML : voix Vivienne, caractères spéciaux échappés');
  const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(3000, 1)]);
  const azOk = async (url, init) => { if (!/tts\.speech\.microsoft\.com/.test(url)) throw new Error('hôte inattendu'); if (init.headers['X-Microsoft-OutputFormat'] !== 'ogg-24khz-16bit-mono-opus' || init.headers['Ocp-Apim-Subscription-Key'] !== 'cle') throw new Error('en-têtes'); return new Response(ogg); };
  const a = await synthetiser('Bonjour', { azure: { cle: 'cle', region: 'francecentral' }, fetchFn: azOk, piper: false }); v(a.moteur === 'azure' && a.audio.length === ogg.length && a.echecs.length === 0, 'Azure en priorité (format OGG / Opus, directement lisible par Telegram)');
  const b = await synthetiser('Bonjour', { azure: { cle: 'cle', region: 'x' }, fetchFn: async () => new Response('quota', { status: 429 }), piperFn: () => Buffer.from('OggSPIPER') }); v(b.moteur === 'piper' && b.echecs[0] === 'Azure : Azure a répondu 429', 'Azure en échec : voix Piper en secours');
  const c = await synthetiser('Bonjour', { azure: {}, fetchFn: azOk, piperFn: () => { throw new Error('Piper absent'); } }); v(c.audio === null && c.moteur === null && c.echecs.length === 2, 'ni Azure ni Piper : pas de voix (le texte partira quand même)');
  let err = ''; try { await voixAzure('x', { cle: 'k', region: 'r', fetchFn: async () => new Response('pas ogg') }); } catch (e) { err = e.message; } v(/pas renvoyé de fichier OGG/.test(err), 'une réponse qui n’est pas un OGG est refusée');
  let err2 = ''; try { voixPiper('x', { modele: null }); } catch (e) { err2 = e.message; } v(/Piper non installée/.test(err2), 'Piper non installé : erreur claire');

  console.log('— envoi par le Worker (Telegram simulé) —');
  const depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:'))), env = { LECTURE_CODE: 'code-ecriture-de-test-123456', TELEGRAM_BOT_TOKEN: 'jeton', TELEGRAM_CHAT_ID: '42' }, envoyes = [];
  const autoriser = async () => ({ ok: false, code: 401, raison: 'code refusé' });
  const fetchSim = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'api.telegram.org') { const m = u.pathname.split('/').pop(); if (m === 'sendVoice') { const f = init.body; envoyes.push({ m, voice: f.get('voice') && f.get('voice').size, silencieux: f.get('disable_notification') }); } else envoyes.push({ m, ...JSON.parse(init.body) }); return new Response('{"ok":true}'); }
    const req = new Request(url, init); return (await traiterReseau(req, env, depot, { cors: {}, autoriser, maintenant: Date.now() })) || (await traiterCopilote(req, env, depot, { cors: {}, autoriser, fetchFn: fetchSim })) || new Response('{}', { status: 404 });
  };
  const sim = { url: 'https://w.test', code: env.LECTURE_CODE, fetchFn: fetchSim, journal: () => {} };
  let r = await executerMatin({ dossier, ...sim, maintenant: MAINT + 0, env: { AZURE_SPEECH_KEY: 'cle', AZURE_SPEECH_REGION: 'fc' }, fetchFn: async (u, i) => (/tts\.speech/.test(u) ? azOk(u, i) : fetchSim(u, i)) });
  v(r.statut === 'envoyé' && r.vocal && r.texte && r.moteur === 'azure', 'point du matin envoyé à 7 h 05 : message vocal puis texte (' + JSON.stringify({ statut: r.statut, vocal: r.vocal, texte: r.texte, moteur: r.moteur }) + ')');
  v(envoyes[0].m === 'sendVoice' && envoyes[0].voice === ogg.length && envoyes[1].m === 'sendMessage' && /Point du matin/.test(envoyes[1].text) && envoyes.length === 2, 'sendVoice (fichier OGG) puis sendMessage (texte)');
  envoyes.length = 0; r = await executerMatin({ dossier, ...sim, maintenant: MAINT + 8 * MIN, env: { AZURE_SPEECH_KEY: 'cle', AZURE_SPEECH_REGION: 'fc' }, fetchFn: async (u, i) => (/tts\.speech/.test(u) ? azOk(u, i) : fetchSim(u, i)) }); v(r.statut === 'pas maintenant' && /déjà envoyé/.test(r.raison) && envoyes.length === 0, 'le tour suivant n’envoie rien : une seule fois par jour');
  const demain = MAINT + J; r = await executerMatin({ dossier, ...sim, maintenant: demain, env: {}, piper: false, texteSeulSiEchec: true, fetchFn: async (u, i) => (/tts\.speech/.test(u) ? new Response('', { status: 500 }) : fetchSim(u, i)) });
  v(r.statut === 'envoyé' && !r.vocal && r.texte && envoyes.length === 1 && envoyes[0].m === 'sendMessage', 'sans voix possible : le texte part quand même');
  envoyes.length = 0; const apres = demain + J; r = await executerMatin({ dossier, ...sim, maintenant: apres, env: {}, piper: false, texteSeulSiEchec: false, fetchFn: async (u, i) => (/tts\.speech/.test(u) ? new Response('', { status: 500 }) : fetchSim(u, i)) }); v(r.statut === 'voix absente' && envoyes.length === 0, 'boucle des données (Azure seul) : sans voix, elle n’envoie rien et laisse le workflow « matin » (Piper) réessayer');
  const lundi = U(2026, 11, 30, 6, 0); await fetchSim('https://w.test/reseau/reglages', { method: 'PUT', headers: { 'X-Lecture-Code': env.LECTURE_CODE, 'Content-Type': 'application/json' }, body: JSON.stringify({ matin: { vocal: false } }) });
  envoyes.length = 0; r = await executerMatin({ dossier, ...sim, maintenant: lundi, env: { AZURE_SPEECH_KEY: 'cle', AZURE_SPEECH_REGION: 'fc' }, fetchFn: async (u, i) => (/tts\.speech/.test(u) ? azOk(u, i) : fetchSim(u, i)) }); v(r.statut === 'envoyé' && !r.vocal && envoyes.every(e => e.m !== 'sendVoice'), 'réglage « message vocal » décoché : texte seul');
  const fd = (j) => { const f = new FormData(); f.append('texte', 'x'); f.append('jour', j); return f; };
  const rr = await traiterCopilote(new Request('https://w.test/copilote/matin', { method: 'POST', body: fd('2026-12-01') }), env, depot, { cors: {}, autoriser }); v(rr.status === 401, 'POST /copilote/matin sans code d’écriture : refusé');
  await fetchSim('https://w.test/reseau/reglages', { method: 'PUT', headers: { 'X-Lecture-Code': env.LECTURE_CODE, 'Content-Type': 'application/json' }, body: JSON.stringify({ silenceJusqua: Date.now() + 5 * H }) }).then(x => x.text());
  const rs = await fetchSim('https://w.test/reseau/reglages', { headers: { 'X-Lecture-Code': env.LECTURE_CODE } }); v((await rs.json()).silenceJusqua > Date.now(), '(le code d’écriture lit aussi les réglages)');
  envoyes.length = 0; const form = new FormData(); form.append('texte', 'Test silence'); form.append('jour', '2026-12-02'); form.append('voix', new Blob([ogg], { type: 'audio/ogg' }), 'a.ogg');
  await fetchSim('https://w.test/copilote/matin', { method: 'POST', headers: { 'X-Lecture-Code': env.LECTURE_CODE }, body: form }); v(envoyes.length === 2 && envoyes[0].silencieux === 'true' && envoyes[1].disable_notification === true, 'pendant « alertes silencieuses » : vocal et texte envoyés SANS notification');
}
finally { /* le dossier sert encore ci-dessous */ }

console.log('— alertes du copilote (gros moments seulement) —');
{
  const fiches = {}; for (const id of ['or', 'btc']) fiches[id] = JSON.parse(fs.readFileSync(path.join(dossier, `lecture-${id}.json`), 'utf8'));
  const cal = [{ t: MAINT + 20 * MIN, titre: 'CPI m/m', pays: 'USD', impact: 'fort', prevu: '0.3%', precedent: '0.2%' }];
  const A = calculerAlertes({ fiches, evenements: cal, carnet: [], reglages: {}, maintenant: MAINT });
  v(A.length >= 1 && A.some(x => x.type === 'annonce' && /CPI m\/m dans moins de 30 minutes/.test(x.texte)), 'annonce importante dans 30 minutes : alerte (' + A.map(x => x.type).join() + ')');
  v(A.every(x => x.texte.length < 260 && /[.!]$/.test(x.texte) && !/vas-y|n.y va pas/i.test(x.texte) && x.score === 90), 'chaque alerte = une phrase claire + le conseil, jamais un ordre');
  const sans = calculerAlertes({ fiches, evenements: cal, carnet: [], reglages: { copilote: { annonce: false, cassure: false, climax: false, balayage: false, mouvement: false } }, maintenant: MAINT }); v(sans.length === 0, 'chaque type se coupe dans Réglages');
  v(calculerAlertes({ fiches, evenements: [{ ...cal[0], t: MAINT + 45 * MIN }], carnet: [], reglages: { copilote: { cassure: false, climax: false, balayage: false, mouvement: false } }, maintenant: MAINT }).length === 0, 'annonce dans 45 minutes : pas encore');
  v(Object.keys(TYPE_REGLAGE).length === 4 && TYPE_REGLAGE.debut_mouvement === 'mouvement', 'correspondance types de moments / réglages');
  /* carnet : idée ouverte dont la lecture change */
  const F = fiches.or, e = { id: 'k1', actif: 'or', sens: 1, t: MAINT - 6 * H, etat: 'ouvert', alertes: [], lecture: { invalidation: { prix: F.prix + 50, nom: 'le test', texte: '' } } };
  const C = calculerAlertes({ fiches, evenements: [], carnet: [e], reglages: { copilote: { cassure: false, climax: false, balayage: false, mouvement: false, annonce: false } }, maintenant: MAINT }); v(C.some(x => x.type === 'idee' && /inval/.test(x.carteId) === false && /Ton idée sur or/.test(x.texte)), 'idée ouverte du carnet dont la lecture change : alerte');
  /* envoi, une seule fois, via le Worker */
  const depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:'))), env = { LECTURE_CODE: 'code-ecriture-de-test-123456', TELEGRAM_BOT_TOKEN: 'jeton', TELEGRAM_CHAT_ID: '42' }, envoyes = [];
  const F2 = async (url, init = {}) => { const u = new URL(url); if (u.hostname === 'api.telegram.org') { envoyes.push(JSON.parse(init.body)); return new Response('{"ok":true}'); } const req = new Request(url, init); return (await traiterReseau(req, env, depot, { cors: {}, autoriser: async () => ({ ok: false, code: 401, raison: 'x' }), fetchFn: F2 })) || (await traiterCopilote(req, env, depot, { cors: {}, fetchFn: F2 })) || new Response('{}', { status: 404 }); };
  const r1 = await executerAlertes({ dossier, url: 'https://w.test', code: env.LECTURE_CODE, maintenant: MAINT, fetchFn: F2, journal: () => {} }); v(r1.statut === 'envoyé' && r1.envoyees >= 1 && envoyes.length === r1.envoyees && envoyes.every(m => /Lecture seule/.test(m.text)), 'alertes envoyées par Telegram (' + r1.envoyees + ')');
  const n1 = envoyes.length; const r2 = await executerAlertes({ dossier, url: 'https://w.test', code: env.LECTURE_CODE, maintenant: MAINT + 5 * MIN, fetchFn: F2, journal: () => {} }); v(envoyes.length === n1 && r2.envoyees === 0, 'au tour suivant : aucune répétition');
  const al = await F2('https://w.test/reseau/alertes', { headers: { 'X-Lecture-Code': env.LECTURE_CODE } }); const L = (await al.json()).alertes; v(L.length >= 1 && L.every(x => x.score >= 80 && x.texte), 'les mêmes alertes sont lisibles par la voix de l’appli (score ≥ seuil)');
  v((await executerAlertes({ dossier, url: null, code: null, journal: () => {} })).statut === 'non configuré', 'sans Worker configuré : rien, sans erreur');
}

console.log('— silence côté appli —');
{
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)) }; };
  const st = mem(), T0 = U(2026, 11, 24, 14, 0); v(!silenceActif(T0, st), 'pas de silence par défaut');
  st.setItem('rayle_copilote_silence_v1', JSON.stringify({ jusqua: T0 + 3 * H })); v(silenceActif(T0, st) && !silenceActif(T0 + 4 * H, st), 'silence actif jusqu’à l’heure dite, puis levé');
  const reglages = { seuilVoix: 80, voix: true, nuit: { actif: false, de: 23, a: 7 } }, al = [{ id: 'a', carteId: 'c', t: T0 - MIN, score: 90, texte: 'x' }];
  v(alertesADire({ alertes: al }, { vuT: 0, reglages, maintenant: T0 }).aDire.length === 1, 'sans silence : l’alerte est dite');
  globalThis.localStorage = st; v(alertesADire({ alertes: al }, { vuT: 0, reglages, maintenant: T0 }).aDire.length === 0, 'avec silence : la voix se tait (Telegram est envoyé sans notification)'); delete globalThis.localStorage;
}
fs.rmSync(dossier, { recursive: true, force: true });
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
