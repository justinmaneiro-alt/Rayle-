/* Telegram : image de signal (sendPhoto), légende, déduplication persistante, absence de jeton, aucun secret dans les fichiers suivis par git. FAUX serveur local : aucun envoi réel.
   node agent-trading/tests/telegram-signal-test.mjs */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { canalTelegram, cycle, testerTelegram, lireEnv } from '../alertes-serveur.mjs'; import * as V6 from '../front/or/fleches-simples-v6.js'; import { zonesDirect } from '../front/or/zones-direct.js';
import { pngSignal, legendeSignal, svgSignal } from '../signal-image.mjs'; import { serie13 } from '../recherche-or/fleches-v6-diag.mjs';
process.env.FLECHES_MOTEUR = 'v6'; const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3; let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const JETON_FAUX = '1234567890:FAUX_JETON_DE_TEST_aaaaaaaaaaaaaaaaaaaaa', K = serie13();
const recus = []; const srv = http.createServer((req, res) => { const bufs = []; req.on('data', d => bufs.push(d)); req.on('end', () => { const corps = Buffer.concat(bufs); recus.push({ url: req.url, type: req.headers['content-type'] || '', corps }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result: req.url.endsWith('getMe') ? { username: 'bot_de_test' } : req.url.endsWith('getUpdates') ? [{ message: { chat: { id: 42 } } }] : {} })); }); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const api = `http://127.0.0.1:${srv.address().port}`, env = { TELEGRAM_BOT_TOKEN: JETON_FAUX, TELEGRAM_CHAT_ID: '42', TELEGRAM_API: api };
const journal = []; const log = (...a) => journal.push(a.join(' '));
const r6 = V6.calculer(K, zonesDirect, { maintenant: K.at(-1).t + H, bougies: 1e5 });
const vente = r6.fleches.find(f => f.type === 'retournement' && f.dir < 0 && !f.contre && f.tCloture === Date.UTC(2026, 10, 5, 4)), achat = r6.fleches.find(f => f.type === 'retournement' && f.dir > 0 && !f.contre && f.tCloture === Date.UTC(2026, 10, 10, 10)), ma = r6.fleches.find(f => f.type === 'ma_cassure' && f.tCloture >= Date.UTC(2026, 10, 10));
const pngDans = b => { const i = b.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), j = b.indexOf(Buffer.from('IEND')); return i >= 0 && j > i ? b.subarray(i, j + 8) : null; };
const legendeDe = r => { const t = r.corps.toString('latin1'), m = t.match(/name="caption"\r\n\r\n([\s\S]*?)\r\n--/); return m ? Buffer.from(m[1], 'latin1').toString('utf8') : ''; };
// ── image
const png = await pngSignal({ bougies: K, f: vente });
v('image : PNG valide (signature + IEND), taille > 5 Ko', png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && png.length > 5000, String(png.length));
v('image : 800 pixels de large', png.readUInt32BE(16) === 800 && png.readUInt32BE(20) >= 440);
const svg = svgSignal({ bougies: K, f: vente }); v('image : ENTRÉE, STOP LOSS, TP1, TP2, titre et pied de page présents', ['ENTRÉE', 'STOP LOSS', 'TP1', 'TP2', 'VENTE', 'OR H1', 'confirmé', 'pas un ordre'].every(m => svg.includes(m)));
v('image : 60 bougies au plus', (svg.match(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="#(2ecc71|ff4d4d)"\/>/g) || []).length <= 60);
// ── canal Telegram : une flèche = une photo
const canal = canalTelegram(env, fetch, log, { bougies: () => K });
await canal({ titre: 't', corps: 'c', evenements: [{ genre: 'fleche', f: vente }] });
const p1 = recus.find(r => r.url.endsWith('/sendPhoto')); v('vente : sendPhoto reçu avec le bon jeton dans l\'URL', !!p1 && p1.url.startsWith('/bot' + JETON_FAUX));
const im = p1 && pngDans(p1.corps); v('vente : l\'image envoyée est un PNG valide de plus de 5 Ko', !!im && im.length > 5000, String(im && im.length));
const lg = p1 ? legendeDe(p1) : ''; v('vente : légende avec stop, TP1, TP2, R, heure, titre', /Stop/.test(lg) && /TP1/.test(lg) && /TP2/.test(lg) && /R = /.test(lg) && /VENTE · OR H1/.test(lg) && /Heure \(Paris\)/.test(lg), lg);
const nums = t => (t.match(/(Entrée|Stop|TP1|TP2) ([\d  ]+)/g) || []).map(x => ({ k: x.split(' ')[0], n: Number(x.replace(/[^\d]/g, '').replace(/^\D+/, '')) }));
const rv = Object.fromEntries((lg.match(/(Entrée|Stop|TP1|TP2) ([\d   ]+?)(?= \(| ·|$)/g) || []).map(x => { const [k, ...r] = x.split(' '); return [k, Number(r.join('').replace(/\D/g, ''))]; }));
v('vente : stop AU-DESSUS de l\'entrée, TP1 et TP2 en dessous', rv.Stop > rv.Entrée && rv.TP1 < rv.Entrée && rv.TP2 <= rv.TP1, JSON.stringify(rv));
recus.length = 0; await canal({ evenements: [{ genre: 'fleche', f: achat }] });
const lga = legendeDe(recus.find(r => r.url.endsWith('/sendPhoto'))), ra = Object.fromEntries((lga.match(/(Entrée|Stop|TP1|TP2) ([\d   ]+?)(?= \(| ·|$)/g) || []).map(x => { const [k, ...r] = x.split(' '); return [k, Number(r.join('').replace(/\D/g, ''))]; }));
v('achat : stop EN DESSOUS de l\'entrée, TP1 et TP2 au-dessus', ra.Stop < ra.Entrée && ra.TP1 > ra.Entrée && ra.TP2 >= ra.TP1, JSON.stringify(ra));
recus.length = 0; await canal({ evenements: [{ genre: 'fleche', f: ma }] }); const lm = legendeDe(recus.find(r => r.url.endsWith('/sendPhoto'))); v('cassure MA200 : photo avec légende « Cassure … MA200 »', /Cassure .* MA200/.test(lm) && /Stop/.test(lm));
recus.length = 0; await canal({ evenements: [{ genre: 'invalide', f: { ...vente, invalideeT: vente.tCloture + H } }] });
v('signal invalidé : message TEXTE seul (aucune photo)', recus.length === 1 && recus[0].url.endsWith('/sendMessage') && /invalidé/i.test(recus[0].corps.toString()));
recus.length = 0; await canalTelegram(env, fetch, log, { bougies: () => null })({ evenements: [{ genre: 'fleche', f: vente }] });
v('image impossible : repli sur le message texte seul avec les mêmes niveaux, échec journalisé', recus.length === 1 && recus[0].url.endsWith('/sendMessage') && /TP2/.test(recus[0].corps.toString()) && journal.some(l => /image de signal indisponible/.test(l)));
// ── déduplication persistante après redémarrage
{ const idx = K.findIndex(b => b.t === vente.t), avant = K.slice(0, idx), jusque = K.slice(0, idx + 1), maintenant = () => vente.tCloture + 600e3; let etat = { notif: {}, initialise: false, dernierT: 0 }; const envoyes = [];
  const c = async m => { envoyes.push(m); };
  await cycle({ donnees: async () => avant, etat, canaux: [c], maintenant, log });
  const r1 = await cycle({ donnees: async () => jusque, etat, canaux: [c], maintenant, log }); v('cycle : une nouvelle flèche → UNE notification', r1.envoyes.length === 1 && envoyes.length === 1, JSON.stringify(r1.envoyes.length));
  const sauve = JSON.parse(JSON.stringify(etat)); etat = { ...sauve, dernierT: 0 }; envoyes.length = 0;                                  // redémarrage : l'état revient du fichier
  const r2 = await cycle({ donnees: async () => jusque, etat, canaux: [c], maintenant, log }); v('après redémarrage : la même flèche n\'est pas renvoyée (déduplication persistante)', r2.envoyes.length === 0 && envoyes.length === 0); }
// ── pas de jeton / test réel
{ const j2 = []; const sans = canalTelegram({}, fetch, (...a) => j2.push(a.join(' '))); v('sans jeton : pas de plantage, canal nul, message clair', sans === null && j2.some(l => /TELEGRAM_BOT_TOKEN/.test(l))); const j3 = []; const rr = await testerTelegram({}, fetch, (...a) => j3.push(a.join(' '))); v('sans jeton : le test réel s\'arrête proprement', rr === false && j3.length === 1); }
{ recus.length = 0; const j4 = []; const t = await testerTelegram({ TELEGRAM_BOT_TOKEN: JETON_FAUX, TELEGRAM_API: api }, fetch, (...a) => j4.push(a.join(' ')), K); v('test réel (faux serveur) : getMe, chat id déduit de getUpdates, 1 message « alertes branchées ✅ », 1 image', t && recus.some(r => r.url.endsWith('/getMe')) && recus.some(r => r.url.endsWith('/getUpdates')) && recus.filter(r => r.url.endsWith('/sendMessage')).length === 1 && recus.filter(r => r.url.endsWith('/sendPhoto')).length === 1 && recus.find(r => r.url.endsWith('/sendMessage')).corps.toString().includes('alertes branchées'), j4.join('|')); }
v('le jeton n\'apparaît dans aucun journal du test', !journal.join('\n').includes(JETON_FAUX));
srv.close();
// ── aucun secret dans les fichiers suivis par git
{ const racine = path.join(ici, '..', '..'); let fichiers = []; try { fichiers = execFileSync('git', ['ls-files', '-z'], { cwd: racine, maxBuffer: 1 << 28 }).toString('utf8').split('\0').filter(Boolean); } catch (e) { /* hors dépôt */ }
  const secrets = new Set(); const e = lireEnv(); if (e.TELEGRAM_BOT_TOKEN) secrets.add(e.TELEGRAM_BOT_TOKEN); const motif = /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/; const textes = /\.(js|mjs|json|md|html|cmd|txt|css|toml)$/i; let trouve = [];
  for (const f of fichiers) { if (!textes.test(f)) continue; let t; try { const p = path.join(racine, f); if (fs.statSync(p).size > 3e6) continue; t = fs.readFileSync(p, 'utf8'); } catch (er) { continue; } if (motif.test(t) || [...secrets].some(s => t.includes(s))) trouve.push(f); }
  v(`aucun jeton Telegram dans les ${fichiers.length} fichiers suivis par git`, fichiers.length > 100 && trouve.length === 0, trouve.join(', '));
  let suivi = ''; try { suivi = execFileSync('git', ['ls-files', 'agent-trading/.env', '.env'], { cwd: racine }).toString().trim(); } catch (er) { /* */ } v('agent-trading/.env n\'est pas suivi par git', suivi === '');
  let ign = ''; try { ign = execFileSync('git', ['check-ignore', 'agent-trading/.env'], { cwd: racine }).toString().trim(); } catch (er) { /* */ } v('agent-trading/.env est ignoré (.gitignore)', ign.includes('agent-trading/.env')); }
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
