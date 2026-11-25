/* Tests du Worker pour le copilote : carnet privé gardé en texte brut (D1), accès, réglages « alertes silencieuses » (Telegram sans notification), types d'alertes réglables.
   Usage : node trader-pro/tests/copilote-worker-test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
import { traiterCopilote } from '../worker/src/copilote.js';
import { traiterReseau, envoyerAlertes, lireReglages, CLES } from '../worker/src/reseau.js';
import { synchroniserCarnet, lireCarnet, ecrireCarnet, majEntree } from '../copilote/stockage.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:'))), env = { LECTURE_CODE: 'code-ecriture-de-test-123456', TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: '1' };
const autoriser = async rq => (rq.headers.get('X-Portefeuille-Code') === 'code-portefeuille-123456' ? { ok: true } : { ok: false, code: 401, raison: 'code refusé' });
const A = { 'X-Portefeuille-Code': 'code-portefeuille-123456' };
const appel = async (methode, chemin, corps, entetes = {}) => { const r = await traiterCopilote(new Request('https://w.test' + chemin, { method: methode, headers: { 'Content-Type': 'application/json', ...entetes }, body: corps === undefined ? undefined : (typeof corps === 'string' ? corps : JSON.stringify(corps)) }), env, depot, { cors: {}, autoriser }); return r ? { s: r.status, j: await r.json() } : null; };

console.log('— carnet privé —');
{
  v((await appel('GET', '/donnees')) === null, 'les autres routes ne sont pas touchées');
  v((await appel('GET', '/copilote/carnet')).s === 401 && (await appel('PUT', '/copilote/carnet', { entrees: [] })).s === 401, 'sans code : refusé');
  let r = await appel('GET', '/copilote/carnet', undefined, A); v(r.s === 200 && Array.isArray(r.j.entrees) && r.j.entrees.length === 0, 'carnet vide au départ');
  const E = [{ id: 'k1abc', actif: 'or', sens: 1, t: 1, maj: 5, etat: 'ouvert', lecture: { pour: ['x'], contre: [] } }, { id: 'k2def', actif: 'btc', sens: -1, t: 2, maj: 6, etat: 'ferme' }];
  r = await appel('PUT', '/copilote/carnet', { entrees: E }, A); v(r.s === 200 && r.j.ok, 'écriture par l’appareil autorisé');
  r = await appel('GET', '/copilote/carnet', undefined, A); v(r.j.entrees.length === 2 && r.j.entrees[0].id === 'k1abc' && r.j.entrees[0].lecture.pour[0] === 'x', 'relecture identique (texte brut, rien perdu)');
  r = await appel('GET', '/copilote/carnet', undefined, { 'X-Lecture-Code': env.LECTURE_CODE }); v(r.s === 200 && r.j.entrees.length === 2, 'GitHub Actions lit avec le code de lecture');
  r = await appel('PUT', '/copilote/carnet', { entrees: [] }, { 'X-Lecture-Code': env.LECTURE_CODE }); v(r.s === 401, 'le code de lecture ne permet PAS d’écrire dans le carnet');
  v((await appel('PUT', '/copilote/carnet', 'pas du json', A)).s === 400 && (await appel('PUT', '/copilote/carnet', { autre: 1 }, A)).s === 400, 'format invalide : refusé');
  v((await appel('PUT', '/copilote/carnet', JSON.stringify({ entrees: [{ id: 'x'.repeat(8e5) }] }), A)).s === 413, 'carnet trop gros : refusé');
  v((await appel('DELETE', '/copilote/carnet', undefined, A)).s === 405, 'méthode non permise');
}

console.log('— synchronisation entre appareils —');
{
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)) }; };
  const F = async (url, init) => traiterCopilote(new Request(url, init), env, depot, { cors: {}, autoriser }) || new Response('{}', { status: 404 }), conn = { url: 'https://w.test', code: 'code-portefeuille-123456' };
  const st = mem(); ecrireCarnet([{ id: 'k1abc', actif: 'or', sens: 1, t: 1, maj: 99, etat: 'ferme', debrief: { texte: 'ok' } }, { id: 'k3ghi', actif: 'sol', sens: 1, t: 3, maj: 7, etat: 'ouvert' }], st);
  const R = await synchroniserCarnet(lireCarnet(st), { conn, fetchFn: F, st }); v(R.ok && R.entrees.length === 3, 'fusion appareil + Worker : 3 idées');
  v(R.entrees.find(e => e.id === 'k1abc').etat === 'ferme' && lireCarnet(st).length === 3, 'la dernière modification gagne, copie locale mise à jour');
  const apres = await appel('GET', '/copilote/carnet', undefined, A); v(apres.j.entrees.length === 3 && apres.j.entrees.find(e => e.id === 'k1abc').debrief.texte === 'ok', 'et le Worker reçoit le résultat fusionné');
  v((await synchroniserCarnet([], { conn: null })).horsConfig === true, 'sans Worker configuré : tout reste sur l’appareil, sans erreur');
  const st2 = mem(); await majEntree({ id: 'k9zzz', actif: 'or', sens: 1, t: 9, etat: 'ouvert' }, { st: st2, sync: false }); v(lireCarnet(st2)[0].id === 'k9zzz' && lireCarnet(st2)[0].maj > 0, 'majEntree : horodatage de modification');
}

console.log('— alertes silencieuses et types réglables —');
{
  const envoyes = []; const fetchSim = async (url, init) => { envoyes.push(JSON.parse(init.body)); return new Response('{"ok":true}'); };
  const R = async (methode, corps) => { const r = await traiterReseau(new Request('https://w.test/reseau/reglages', { method: methode, headers: { 'Content-Type': 'application/json', ...A }, body: corps ? JSON.stringify(corps) : undefined }), env, depot, { cors: {}, autoriser, maintenant: Date.now() }); return { s: r.status, j: await r.json() }; };
  let r = await R('GET'); v(r.j.seuilAlerte === 80 && r.j.silenceJusqua === 0 && r.j.copilote.cassure === true && r.j.copilote.climax === true && r.j.copilote.balayage === true && r.j.copilote.annonce === true, 'réglages par défaut : tous les types d’alertes actifs, pas de silence');
  r = await R('PUT', { copilote: { climax: false, inconnu: true } }); v(r.j.copilote.climax === false && r.j.copilote.cassure === true && !('inconnu' in r.j.copilote), 'un type d’alerte peut être coupé (types inconnus ignorés)');
  r = await R('PUT', { silenceJusqua: 123 }); v(r.s === 400, 'silence : une heure passée est refusée');
  const demain = Date.now() + 14 * 3600e3; r = await R('PUT', { silenceJusqua: demain }); v(r.s === 200 && r.j.silenceJusqua === demain && r.j.seuilAlerte === 80, 'silence jusqu’à demain enregistré (le seuil reste)');
  await envoyerAlertes(env, depot, [{ carteId: 'm1', texte: 'Cassure confirmée de la MA200 sur l’or (H4) : regarde si la clôture suivante tient.', revirement: false }], [], fetchSim);
  v(envoyes.length === 1 && envoyes[0].disable_notification === true && /MA200/.test(envoyes[0].text), 'pendant le silence : le message Telegram part SANS notification');
  r = await R('PUT', { silenceJusqua: 0 }); envoyes.length = 0; await envoyerAlertes(env, depot, [{ carteId: 'm2', texte: 'Autre alerte.', revirement: false }], [], fetchSim);
  v(envoyes.length === 1 && !('disable_notification' in envoyes[0]), 'silence levé : notification normale');
  v((await R('PUT', {})).s === 400 && (await R('PUT', { seuilAlerte: 85 })).j.seuilAlerte === 85 && (await lireReglages(depot)).copilote.climax === false, 'rien à enregistrer : refusé ; le seuil se règle ; les autres réglages restent');
}
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
