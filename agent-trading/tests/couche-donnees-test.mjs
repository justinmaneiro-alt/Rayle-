/* Tests de la couche de données (sans réseau : fetch et stockage simulés). node agent-trading/tests/couche-donnees-test.mjs */
import assert from 'node:assert/strict';
import { lireDonnee, creerStockage, badge, etatSources, oublierEtats, urlSnapshot, originePc, phraseAge } from '../front/donnees/couche.js';
import { planRoute, lireRoute, lireBougies, compacterBougies, expanserBougies, fusionnerBougies, reduireSerie, filtrerCotes } from '../front/donnees/routes.js';
import { chargerPanneau, nomSnapshotPanneau } from '../front/marches/client.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const rep = (corps, status = 200, type = 'application/json') => ({ ok: status < 400, status, headers: { get: () => type }, json: async () => corps });
const horloge = t0 => { let t = t0; return { now: () => t, avance: ms => { t += ms; } }; };
const loc = { hostname: 'justinmaneiro-alt.github.io', protocol: 'https:', origin: 'https://justinmaneiro-alt.github.io' };
const locPc = { hostname: '127.0.0.1', protocol: 'http:', origin: 'http://127.0.0.1:8000' };
ok(originePc(loc) === null && originePc(locPc) === 'http://127.0.0.1:8000', 'origine PC');

/* 1. snapshot d'abord (PC absent), copie locale ensuite */
{ oublierEtats(); const st = creerStockage(null), h = horloge(1e12); const appels = [];
  const f = async u => { appels.push(u); return rep({ t: h.now() - 5 * 60e3, serie: Array.from({ length: 300 }, (_, i) => ({ date: '2026-01-' + i, spec: { net: i } })) }); };
  const r = await lireRoute('/__cot?inst=OR&n=8', { fetchFn: f, loc, stockage: st, maintenant: h.now });
  ok(r.origine === 'snapshot' && appels.length === 1 && appels[0].includes('/donnees/cot-OR.json'), 'snapshot lu : ' + appels[0]);
  ok(r.donnees.serie.length === 8, 'série réduite à n=8'); ok(badge(r).startsWith('snapshot du '), 'badge snapshot : ' + badge(r));
  h.avance(60e3); const r2 = await lireRoute('/__cot?inst=OR&n=160', { fetchFn: f, loc, stockage: st, maintenant: h.now });
  ok(r2.origine === 'cache' && appels.length === 1 && !r2.horsLigne, 'cache frais servi sans réseau');
  h.avance(4 * 3600e3); const panne = async () => { throw new Error('Failed to fetch'); };
  const r3 = await lireRoute('/__cot?inst=OR&n=160', { fetchFn: panne, loc, stockage: st, maintenant: h.now });
  ok(r3.origine === 'cache' && r3.horsLigne && /^hors ligne : dernière donnée du \d\d\/\d\d à \d\d:\d\d/.test(badge(r3)), 'hors ligne avec date : ' + badge(r3));
  ok(etatSources().some(e => e.cle === 'cot|OR' && e.horsLigne === true), 'état des sources : hors ligne'); }

/* 2. aucune donnée : message lisible, jamais « HTTP 404 » brut */
{ const st = creerStockage(null); let e = null;
  try { await lireRoute('/__sante', { fetchFn: async () => rep({}, 404, 'text/html'), loc, stockage: st }); } catch (x) { e = x; }
  ok(e && e.sansDonnee === true, 'erreur sansDonnee'); ok(!/^HTTP 404/.test(e.message) && /Aucune donnée/.test(e.message), 'message lisible : ' + e.message.slice(0, 60)); }

/* 3. le PC est un bonus : essayé en premier seulement s'il sert la page ; sa panne bascule sur le snapshot */
{ const st = creerStockage(null), vus = [];
  const f = async u => { vus.push(u); if (u.startsWith('http://127.0.0.1')) throw new Error('refusé'); return rep({ t: 1, items: [{ titre: 'a' }] }); };
  const r = await lireRoute('/__actus?q=or&n=40', { fetchFn: f, loc: locPc, stockage: st });
  ok(vus[0].startsWith('http://127.0.0.1:8000/__actus') && r.origine === 'snapshot', 'PC essayé puis snapshot'); }

/* 4. plan des routes */
{ ok(planRoute('/__cot?inst=NASDAQ').fichier === 'cot-NASDAQ.json', 'cot'); ok(planRoute('/__actus?q=tout').fichier === 'actus-tout.json', 'actus'); ok(planRoute('/__calendrier2').fichier === 'calendrier2.json', 'cal');
  ok(planRoute('/__yahoo?syms=A&range=2y').fichier === 'yahoo-2y.json', 'yahoo'); ok(planRoute('/__nimportequoi') === null, 'inconnue');
  ok(reduireSerie({ serie: [1, 2, 3] }, 2).serie.length === 2, 'reduireSerie');
  const y = filtrerCotes({ cotes: { A: 1, B: 2, C: 3 } }, 'A,C'); ok(Object.keys(y.cotes).join() === 'A,C', 'filtrerCotes'); }

/* 5. bougies : compactage, fusion, lecture directe Kraken + historique du snapshot */
{ const B = [{ t: 1, o: 1, h: 2, l: 0, c: 1.5, v: 3 }, { t: 2, o: 1.5, h: 2, l: 1, c: 1.8, v: 4 }]; const c = compacterBougies({ sym: 'X', bougies: B });
  ok(c.b.length === 2 && !c.bougies, 'compact'); ok(JSON.stringify(expanserBougies(c).bougies) === JSON.stringify(B), 'aller-retour');
  ok(fusionnerBougies([{ t: 1, c: 1 }, { t: 2, c: 2 }], [{ t: 2, c: 9 }, { t: 3, c: 3 }]).map(b => b.c).join() === '1,9,3', 'fusion');
  const base = { sym: 'BTC-USD', t: 5, b: Array.from({ length: 50 }, (_, i) => [i * 3600e3, 100, 101, 99, 100 + i, 1]) };
  const f = async u => { if (u.includes('raw.githubusercontent')) return rep(base); if (u.includes('api.kraken.com')) return rep({ error: [], result: { XXBTZUSD: [[48 * 3600, '1', '2', '0', '200', '0', '5', 1], [49 * 3600, '1', '2', '0', '210', '0', '5', 1], [50 * 3600, '1', '2', '0', '220', '0', '5', 1]], last: 1 } }); throw new Error('?'); };
  const r = await lireBougies('BTC-USD', '1h', { fetchFn: f, loc, stockage: creerStockage(null) });
  ok(r.origine === 'direct' && r.donnees.bougies.length === 51, 'fusion snapshot + direct : ' + r.donnees.bougies.length); ok(r.donnees.prix === 220, 'prix direct');
  const r2 = await lireBougies('^NDX', '1h', { fetchFn: async u => { if (u.includes('_NDX-1h')) return rep(base); throw new Error('?'); }, loc, stockage: creerStockage(null) });
  ok(r2.origine === 'snapshot' && r2.donnees.bougies.length === 50, 'indice : snapshot seul'); }

/* 6. Marchés : snapshot sans le PC, puis copie locale hors ligne */
{ const st = creerStockage(null), panneau = { id: 'or', titre: 'Or', sections: [{ titre: 's', mesures: [] }], t: 1 }; let vus = [];
  const r = await chargerPanneau('or', {}, { fetchImpl: async u => { vus.push(u); return rep(panneau); }, loc, stockage: st });
  ok(r.panneau && vus.length === 1 && vus[0].endsWith('marches-or.json'), 'snapshot du panneau : ' + vus[0]);
  const r2 = await chargerPanneau('calendrier', { actif: 'us100' }, { fetchImpl: async u => { vus.push(u); return rep({ id: 'calendrier', evenements: [], t: 1 }); }, loc, stockage: st });
  ok(vus[1].endsWith('marches-calendrier-us100.json') && nomSnapshotPanneau('or') === 'marches-or.json', 'nom du fichier avec actif');
  const r3 = await chargerPanneau('or', {}, { fetchImpl: async () => { throw new Error('réseau'); }, loc, stockage: st });
  ok(r3.panneau && r3.horsLigne && r3.horsLigne.cacheLe > 0, 'hors ligne : dernier panneau daté'); }

ok(urlSnapshot('a.json', 'https://x/y') === 'https://x/y/a.json', 'url snapshot'); ok(phraseAge(30 * 60e3) === 'il y a 30 min' && phraseAge(null) === 'jamais', 'âge');
console.log('couche de données : ' + n + ' vérifications OK');
