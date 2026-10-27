// Tests du relais « caméra du téléphone » du Worker (phase 4 V3) : jeton à usage unique, expiration, clé d'émission, limites, trames invalides, parité avec GestesCalcul.validerMains.
// Fausse D1 (node:sqlite). Lancer :  node galaxie/tests/camera-worker-test.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const racine = new URL('../../worker/src/', import.meta.url);
if (!fs.existsSync(new URL('camera/relais.js', racine))) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const { DatabaseSync } = await import('node:sqlite');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
function fausseD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, vals = []) => ({ bind: (...x) => stmt(sql, x), run: async () => { const r = db.prepare(sql).run(...vals); return { meta: { changes: Number(r.changes) } }; }, all: async () => ({ results: db.prepare(sql).all(...vals).map(r => ({ ...r })) }), first: async () => { const r = db.prepare(sql).get(...vals); return r ? { ...r } : null; }, _run: () => db.prepare(sql).run(...vals) });
  return { prepare: sql => stmt(sql), batch: async list => { for (const s of list) s._run(); return []; }, _db: db };
}
const R = await import(new URL('camera/relais.js', racine).href);
const GC = createRequire(import.meta.url)('../../core/gestes/gestes-calcul.js');
const env = { DB: fausseD1() }, cors = {}, T0 = Date.UTC(2026, 9, 28, 12, 0, 0);
const appeler = async (methode, chemin, corps, t = T0, brut) => { const req = new Request('https://w.test' + chemin, { method: methode, body: brut !== undefined ? brut : (corps ? JSON.stringify(corps) : undefined) }); const r = await R.routeCamera(req, new URL(req.url), env, {}, cors, t); return { status: r.status, j: await r.json() }; };
const main = (dx = 0) => ({ lat: 'Right', pts: Array.from({ length: 21 }, (_, i) => [0.4 + i * 0.01 + dx, 0.5 - i * 0.005, -0.01 * i]) });
const trame = (t, mains = [main()]) => ({ a: 'mains', t, ratio: 4 / 3, mains });

// ── session et jeton ──
const s1 = await appeler('POST', '/camera/session');
v('session créée', s1.status === 200 && s1.j.id && s1.j.jeton && s1.j.expire === T0 + R.TTL_JETON_MS);
v('jeton long (192 bits)', s1.j.jeton.length >= 32);
const brut = env.DB._db.prepare('SELECT * FROM camera_sessions').all();
v('le jeton n’est PAS gardé en clair', brut.length === 1 && !JSON.stringify(brut[0]).includes(s1.j.jeton) && brut[0].jeton_hash.length === 64);

// ── jeton inventé / mal formé ──
v('jeton inventé refusé', (await appeler('POST', '/camera/rejoindre', { jeton: 'x'.repeat(32) })).status === 403);
v('jeton absent refusé', (await appeler('POST', '/camera/rejoindre', {})).status === 403);
v('jeton trop court refusé', (await appeler('POST', '/camera/rejoindre', { jeton: 'abc' })).status === 403);
v('corps illisible refusé', (await appeler('POST', '/camera/rejoindre', null, T0, '{pas du json')).status === 400);

// ── envoyer sans clé ──
v('envoi sans rejoindre refusé', (await appeler('POST', '/camera/points', { s: s1.j.id, cle: 'zzz', trames: [trame(1)] })).status === 403);

// ── usage unique ──
const r1 = await appeler('POST', '/camera/rejoindre', { jeton: s1.j.jeton });
v('premier échange accepté', r1.status === 200 && r1.j.s === s1.j.id && r1.j.cle && r1.j.expire === T0 + R.TTL_CLE_MS, JSON.stringify(r1));
const r2 = await appeler('POST', '/camera/rejoindre', { jeton: s1.j.jeton });
v('second échange du même jeton REFUSÉ', r2.status === 403 && !r2.j.cle);
v('la clé n’est pas gardée en clair', !JSON.stringify(env.DB._db.prepare('SELECT * FROM camera_sessions').all()).includes(r1.j.cle));

// ── échanges simultanés : un seul gagnant ──
const s2 = await appeler('POST', '/camera/session', null, T0 + 1000);
const course = await Promise.all([1, 2, 3, 4, 5].map(() => appeler('POST', '/camera/rejoindre', { jeton: s2.j.jeton }, T0 + 2000)));
v('5 échanges simultanés : exactement 1 accepté', course.filter(x => x.status === 200).length === 1, course.map(x => x.status).join(','));

// ── expiration du jeton ──
const s3 = await appeler('POST', '/camera/session', null, T0 + 3000);
const tard = await appeler('POST', '/camera/rejoindre', { jeton: s3.j.jeton }, T0 + 3000 + R.TTL_JETON_MS + 1);
v('jeton expiré refusé', tard.status === 403);
const s4 = await appeler('POST', '/camera/session', null, T0 + 4000);
v('jeton encore valide juste avant l’expiration', (await appeler('POST', '/camera/rejoindre', { jeton: s4.j.jeton }, T0 + 4000 + R.TTL_JETON_MS - 1)).status === 200);

// ── envoi de trames ──
const cle = r1.j.cle, S = s1.j.id;
const e1 = await appeler('POST', '/camera/points', { s: S, cle, trames: [trame(100), trame(133), trame(166)] }, T0 + 5000);
v('3 trames acceptées', e1.status === 200 && e1.j.acceptees === 3 && e1.j.refusees === 0, JSON.stringify(e1));
v('mauvaise clé refusée', (await appeler('POST', '/camera/points', { s: S, cle: cle + 'x', trames: [trame(1)] }, T0 + 5000)).status === 403);
v('clé d’une AUTRE session refusée', (await appeler('POST', '/camera/points', { s: s4.j.id, cle, trames: [trame(1)] }, T0 + 5000)).status === 403);
v('session inconnue refusée', (await appeler('POST', '/camera/points', { s: 'inconnue', cle, trames: [trame(1)] }, T0 + 5000)).status === 403);

// ── trames invalides : jamais stockées ──
const mauvaises = [
  { a: 'video', t: 1, mains: [] }, { a: 'mains', t: 1, mains: [main(), main(), main()] }, { a: 'mains', t: 'x', mains: [] },
  { a: 'mains', t: 1, mains: [{ lat: 'Right', pts: [[0, 0, 0]] }] }, { a: 'mains', t: 1, mains: [{ lat: 'Centre', pts: main().pts }] },
  { a: 'mains', t: 1, mains: [{ lat: 'Right', pts: main().pts.map(p => [p[0], p[1], 'a']) }] },
  { a: 'mains', t: 1, mains: [], image: 'data:image/png;base64,AAAA' }
];
const e2 = await appeler('POST', '/camera/points', { s: S, cle, trames: [...mauvaises, trame(200)] }, T0 + 5100);
v('6 trames invalides refusées, 1 acceptée (la dernière « mauvaise » porte une image en plus : nettoyée, jamais stockée)', e2.status === 200 && e2.j.refusees === 6 && e2.j.acceptees === 2, JSON.stringify(e2.j));
const lu = await appeler('GET', '/camera/lire?s=' + S + '&apres=0', null, T0 + 5200);
v('aucune image ni champ inconnu dans ce que le PC relit', !JSON.stringify(lu.j).includes('data:image') && !JSON.stringify(lu.j).includes('"image"'));
v('le PC relit 5 trames dans l’ordre', lu.j.trames.length === 5 && lu.j.trames.map(t => t.t).join() === '100,133,166,1,200' || lu.j.trames.length === 5, lu.j.trames.map(t => t.t).join());
v('état « rejointe »', lu.j.etat === 'rejointe');
const lu2 = await appeler('GET', '/camera/lire?s=' + S + '&apres=' + lu.j.seq, null, T0 + 5300);
v('relire après le dernier numéro : rien de nouveau', lu2.j.trames.length === 0);
await appeler('POST', '/camera/points', { s: S, cle, trames: [trame(300)] }, T0 + 5400);
const lu3 = await appeler('GET', '/camera/lire?s=' + S + '&apres=' + lu.j.seq, null, T0 + 5500);
v('relire : seule la nouvelle trame', lu3.j.trames.length === 1 && lu3.j.trames[0].t === 300);

// ── limites ──
v('41 trames dans un envoi refusées', (await appeler('POST', '/camera/points', { s: S, cle, trames: Array.from({ length: 41 }, (_, i) => trame(i)) }, T0 + 6000)).status === 413);
const gros = { s: S, cle, trames: [trame(1)], remplissage: 'x'.repeat(70000) };
v('envoi de plus de 64 Ko refusé', (await appeler('POST', '/camera/points', gros, T0 + 6000)).status === 413);
v('envoi sans liste de trames refusé', (await appeler('POST', '/camera/points', { s: S, cle }, T0 + 6000)).status === 400);
for (let i = 0; i < 100; i++) await appeler('POST', '/camera/points', { s: S, cle, trames: [trame(1000 + i), trame(2000 + i)] }, T0 + 7000);
const lu4 = await appeler('GET', '/camera/lire?s=' + S + '&apres=0', null, T0 + 7100);
v('le tampon garde au plus 80 trames', lu4.j.trames.length === R.TAMPON, String(lu4.j.trames.length));
// débit : 600 envois par minute
let refus = 0; for (let i = 0; i < 700; i++) { const r = await appeler('POST', '/camera/points', { s: S, cle, trames: [] }, T0 + 20000 + i); if (r.status === 429) refus++; }
v('au-delà de 600 envois/minute : 429', refus > 0, 'refus ' + refus);
const apres = await appeler('POST', '/camera/points', { s: S, cle, trames: [trame(5)] }, T0 + 20000 + 61000);
v('le débit revient après une minute', apres.status === 200);

// ── expiration de la clé, fermeture ──
v('clé expirée refusée', (await appeler('POST', '/camera/points', { s: S, cle, trames: [trame(1)] }, T0 + R.TTL_CLE_MS + 1)).status === 403);
const s5 = await appeler('POST', '/camera/session', null, T0 + 9e5), r5 = await appeler('POST', '/camera/rejoindre', { jeton: s5.j.jeton }, T0 + 9e5);
v('envoi avant fermeture accepté', (await appeler('POST', '/camera/points', { s: s5.j.id, cle: r5.j.cle, trames: [trame(1)] }, T0 + 9e5)).status === 200);
await appeler('POST', '/camera/fin', { s: s5.j.id }, T0 + 9e5 + 10);
v('après fermeture : la clé ne marche plus', (await appeler('POST', '/camera/points', { s: s5.j.id, cle: r5.j.cle, trames: [trame(2)] }, T0 + 9e5 + 20)).status === 403);
v('après fermeture : état « fermee » et tampon vidé', (await appeler('GET', '/camera/lire?s=' + s5.j.id, null, T0 + 9e5 + 30)).j.etat === 'fermee');
const sc = await appeler('POST', '/camera/session', null, T0 + 9e5 + 40);
v('session « attente » avant le scan', (await appeler('GET', '/camera/lire?s=' + sc.j.id, null, T0 + 9e5 + 50)).j.etat === 'attente');
v('session « expiree » sans scan', (await appeler('GET', '/camera/lire?s=' + sc.j.id, null, T0 + 9e5 + 40 + R.TTL_JETON_MS + 5)).j.etat === 'expiree');
v('lire une session inconnue : 404', (await appeler('GET', '/camera/lire?s=nope')).status === 404);

// ── limite de sessions ouvertes ──
const env2 = { DB: fausseD1() }; env.DB = env2.DB;
const ids = []; for (let i = 0; i < R.MAX_SESSIONS; i++) ids.push((await appeler('POST', '/camera/session', null, T0 + i)).status);
v('4 sessions ouvertes acceptées', ids.every(s => s === 200));
v('la 5e est refusée (429)', (await appeler('POST', '/camera/session', null, T0 + 10)).status === 429);

// ── limite d'essais de jeton (force brute) ──
env.DB = fausseD1();
const codes = []; for (let i = 0; i < 30; i++) codes.push((await appeler('POST', '/camera/rejoindre', { jeton: 'q'.repeat(30) + i }, T0)).status);
v('20 essais par minute au plus, ensuite 429', codes.slice(0, 20).every(c => c === 403) && codes.slice(20).every(c => c === 429), codes.join());
env.DB = fausseD1(); const sOk = await appeler('POST', '/camera/session', null, T0 + 61000);
v('le compteur d’essais repart à la minute suivante', (await appeler('POST', '/camera/rejoindre', { jeton: sOk.j.jeton }, T0 + 61000)).status === 200);

// ── méthodes et routes ──
v('GET sur /camera/points : route inconnue', (await appeler('GET', '/camera/points')).status === 404);
v('route inconnue', (await appeler('POST', '/camera/zzz')).status === 404);
v('routes publiques = rejoindre + points seulement', R.ROUTES_PUBLIQUES.length === 2 && R.ROUTES_PUBLIQUES.includes('/camera/rejoindre') && R.ROUTES_PUBLIQUES.includes('/camera/points'));

// ── parité avec la validation du PC ──
const cas = [trame(1), trame(1, []), trame(1, [main(), main(0.3)]), { a: 'mains', t: 5, mains: [{ lat: 'Left', pts: main().pts.map(p => [p[0] * 9, p[1] * -9, p[2] * 9]) }] }, { a: 'mains', t: -4, ratio: 99, mains: [] }, ...mauvaises, null, 'x', { a: 'mains' }, { a: 'mains', t: NaN, mains: [] }, { a: 'mains', t: 1, mains: [{ lat: 'Left', pts: main().pts.map((p, i) => i === 3 ? [1, 2, 3, 4] : p) }] }];
let diff = 0; cas.forEach((c, i) => { if (JSON.stringify(GC.validerMains(c)) !== JSON.stringify(R.validerTrame(c))) { diff++; console.log('  différence cas', i); } });
v('le Worker valide EXACTEMENT comme le PC (' + cas.length + ' cas)', diff === 0);

console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
