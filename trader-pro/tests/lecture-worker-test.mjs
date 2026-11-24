/* Tests de la chaîne « fiche de lecture » : le robot calcule à partir d'instantanés, écrit des fichiers, l'envoie au Worker (vrai SQLite), les appareils la relisent.
   Usage : node trader-pro/tests/lecture-worker-test.mjs */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
import { traiterLecture, nettoyerFiches } from '../worker/src/lecture.js';
import { traiter } from '../worker/src/coeur.js';
import { construireTout, ecrireFiches, envoyerAuWorker } from '../../outils-donnees/lecture.mjs';
import { regrouper, enH4 } from '../commun/analyse.js';

let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, J = 86400e3, MAINT = Date.UTC(2026, 11 - 1, 24, 10, 0);
function aleatoire(g) { let s = g >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function pro(id, graine) {
  const R = aleatoire(graine), n = 420 * 96, t0 = Math.floor(MAINT / 900e3) * 900e3 - n * 900e3, M = []; let p = 1000;
  for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (R() - 0.5) * 0.0025), h = Math.max(o, c) * 1.0005, l = Math.min(o, c) * 0.9995; M.push({ t: t0 + i * 900e3, o, h, l, c, v: 100 + R() * 50 }); p = c; }
  const cp = B => B.map(b => [b.t, b.o, b.h, b.l, b.c, Math.round(b.v)]), nu = B => B.map(({ enCours, ...b }) => b);
  return { id, nom: id, source: 'test', t: MAINT, prix: M[M.length - 1].c, tPrix: M[M.length - 1].t + 900e3, j: cp(nu(regrouper(M, J, 22 * H, MAINT))), h4: cp(nu(enH4(M, MAINT))), h1: cp(nu(regrouper(M, H, 0, MAINT))), m15: cp(M.slice(-500)) };
}
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-lecture-'));
try {
  for (const [i, id] of ['or', 'btc'].entries()) fs.writeFileSync(path.join(dossier, `pro-${id}.json`), JSON.stringify(pro(id, 7 + i)));
  fs.writeFileSync(path.join(dossier, 'calendrier2.json'), JSON.stringify({ t: MAINT, evenements: [{ title: 'CPI m/m', country: 'USD', date: '2026-11-24T08:30:00-05:00', impact: 'High', forecast: '0.3%', previous: '0.2%' }] }));
  fs.writeFileSync(path.join(dossier, 'actus-marches.json'), JSON.stringify({ items: [{ titre: 'Gold climbs as dollar eases', source: 'Test', date: MAINT - 2 * H, lien: 'https://exemple.test/x' }] }));

  console.log('— le robot : fiches à partir d’instantanés (sans réseau) —');
  const R = await construireTout(dossier, { maintenant: MAINT, reseau: false, actifs: ['or', 'btc', 'sol'] });
  v(Object.keys(R.fiches).join() === 'or,btc' && /absent/.test(R.echecs.sol), 'or et bitcoin calculés ; solana sans instantané : échec dit, rien d’inventé');
  v(R.fiches.or.agenda.length === 1 && R.fiches.or.actus.length === 1, 'calendrier et actualités du dossier lus');
  ecrireFiches(dossier, R); const idx = JSON.parse(fs.readFileSync(path.join(dossier, 'lecture-index.json'), 'utf8'));
  v(idx.actifs.join() === 'or,btc' && fs.existsSync(path.join(dossier, 'lecture-or.json')) && idx.t === MAINT, 'fichiers lecture-<actif>.json et lecture-index.json écrits');
  v(!/\bsk-|AIza|Bearer|@gmail/.test(fs.readFileSync(path.join(dossier, 'lecture-or.json'), 'utf8')), 'aucune clé ni donnée personnelle dans la fiche publiée');

  console.log('— le Worker : écriture protégée, lecture pour les appareils —');
  const depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:'))), env = { LECTURE_CODE: 'code-lecture-de-test-123456', PORTEFEUILLE_CODE: 'code-portefeuille-123456', ORIGINES: 'https://justinmaneiro-alt.github.io' };
  const appel = async (methode, chemin, corps, entetes = {}, e = env) => { const req = new Request('https://w.test' + chemin, { method: methode, headers: { 'Content-Type': 'application/json', ...entetes }, body: corps ? JSON.stringify(corps) : undefined }); const r = await traiterLecture(req, e, depot, { cors: {}, autoriser: async rq => (rq.headers.get('X-Portefeuille-Code') === e.PORTEFEUILLE_CODE ? { ok: true } : { ok: false, code: 401, raison: 'code refusé' }) }); return r ? { s: r.status, j: await r.json() } : null; };
  v((await appel('GET', '/donnees')) === null, 'les autres routes ne sont pas touchées');
  let r = await appel('PUT', '/lecture/fiches', { t: MAINT, fiches: R.fiches }); v(r.s === 401, 'écriture sans code : refusée');
  r = await appel('PUT', '/lecture/fiches', { t: MAINT, fiches: R.fiches }, { 'X-Lecture-Code': 'mauvais-code-xxxxxxxxxx' }); v(r.s === 401, 'mauvais code : refusé');
  r = await appel('PUT', '/lecture/fiches', { t: MAINT, fiches: R.fiches }, { 'X-Lecture-Code': env.LECTURE_CODE }, { ...env, LECTURE_CODE: '' }); v(r.s === 503, 'secret absent sur le Worker : 503 explicite');
  r = await appel('PUT', '/lecture/fiches', { t: MAINT, fiches: R.fiches }, { 'X-Lecture-Code': env.LECTURE_CODE }); v(r.s === 200 && r.j.actifs.join() === 'or,btc', 'écriture avec le bon code');
  r = await appel('GET', '/lecture/tout'); v(r.s === 401, 'lecture sans code d’accès : refusée');
  r = await appel('GET', '/lecture/tout', null, { 'X-Portefeuille-Code': env.PORTEFEUILLE_CODE }); v(r.s === 200 && r.j.fiches.or.actif === 'or' && r.j.t === MAINT, 'lecture par un appareil autorisé');
  r = await appel('GET', '/lecture/fiche/btc', null, { 'X-Portefeuille-Code': env.PORTEFEUILLE_CODE }); v(r.s === 200 && r.j.actif === 'btc', 'une fiche seule');
  r = await appel('GET', '/lecture/fiche/xyz', null, { 'X-Portefeuille-Code': env.PORTEFEUILLE_CODE }); v(r.s === 404, 'actif inconnu : 404');
  r = await appel('GET', '/lecture/fiche/..%2Fkv', null, { 'X-Portefeuille-Code': env.PORTEFEUILLE_CODE }); v(r.s === 400, 'identifiant dangereux refusé');
  // une fiche plus ancienne n'écrase pas une plus récente
  const vieille = { ...R.fiches.or, t: MAINT - 3600e3, prix: 1 }; r = await appel('PUT', '/lecture/fiches', { t: MAINT, fiches: { or: vieille } }, { 'X-Lecture-Code': env.LECTURE_CODE });
  r = await appel('GET', '/lecture/fiche/or', null, { 'X-Portefeuille-Code': env.PORTEFEUILLE_CODE }); v(r.j.prix !== 1, 'une fiche plus ancienne n’écrase jamais une plus récente');
  v(Object.keys(nettoyerFiches({ fiches: { 'a b': {}, or: { actif: 'btc', t: 1, version: 1 }, sol: { actif: 'sol', t: 1, version: 1 } } })).join() === 'sol', 'fiches invalides écartées');
  r = await appel('PUT', '/lecture/fiches', { fiches: {} }, { 'X-Lecture-Code': env.LECTURE_CODE }); v(r.s === 400, 'aucune fiche valide : 400');

  console.log('— envoi du robot vers le Worker (même code) —');
  const fetchSim = async (url, init) => { const rep = await traiterLecture(new Request(url, init), env, depot, { cors: {} }); return rep || new Response('{}', { status: 404 }); };
  const e = await envoyerAuWorker(R, { url: 'https://w.test', code: env.LECTURE_CODE, fetchFn: fetchSim }); v(e.ok && e.actifs.length === 2, 'envoyerAuWorker : accepté');
  let echec = null; try { await envoyerAuWorker(R, { url: 'https://w.test', code: 'faux-code-xxxxxxxxxxxx', fetchFn: fetchSim }); } catch (er) { echec = er.message; } v(/401/.test(echec || ''), 'mauvais code : l’erreur est claire (401)');
  // le routeur principal du portefeuille reste intact (route inconnue → 404 JSON)
  const rp = await traiter(new Request('https://w.test/sante'), env, depot); v(rp.status === 200, 'le Worker portefeuille répond toujours');
} finally { fs.rmSync(dossier, { recursive: true, force: true }); }
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
