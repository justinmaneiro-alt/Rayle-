/* Notifications des flèches (Direct) : une notification par flèche, rien pour les points gris, « invalidé » pour un rebond ravalé, déduplication après redémarrage, anti-spam,
   Telegram sur un FAUX serveur local, aucun plantage sans jeton.   node agent-trading/tests/fleches-notif-test.mjs */
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { creerNotifieur, formater, evenements, LIMITE_HEURE } from '../front/or/fleches-notif.js';
import * as F from '../front/or/fleches-simples-v5.js'; import { zonesDirect } from '../front/or/zones-direct.js';
import { cycle, canalTelegram, lireEnv, lireEtat, ecrireEtat } from '../alertes-serveur.mjs';
import { serieKraken } from '../recherche-or/fleches-simples-rejeu.mjs';
const H = 3600e3; let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const K = serieKraken(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alertes-')), fEtat = path.join(tmp, 'etat.json');
const recus = []; const srv = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => { recus.push({ url: req.url, corps: JSON.parse(b || '{}') }); res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); }); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const API = `http://127.0.0.1:${srv.address().port}`;
const env = { TELEGRAM_BOT_TOKEN: '123:FAUX', TELEGRAM_CHAT_ID: '42', TELEGRAM_API: API }, mu = () => {};

// ── unités : texte, anti-spam, groupement
{
  const f = (i, dir, lv, extra = {}) => ({ id: 'retournement|' + i + '|' + dir + '|' + lv, type: 'retournement', dir, levelId: lv, zoneBas: 4131, zoneHaut: 4144, prix: 4140, tCloture: 1e12 + i * H, masquee: false, ...extra });
  const t = formater({ genre: 'fleche', f: f(1, 1, 'a', { tCloture: Date.UTC(2026, 10, 12, 20) }) });
  v('titre : « OR H1 · Retournement haussier sur 4 131–4 144 (confirmé 21:00) »', /^OR H1 · Retournement haussier sur 4 131–4 144 \(confirmé 21:00\)$/.test(t.titre), t.titre);
  v('corps : heure d’apparition et « repère de lecture, pas un ordre »', /21:00/.test(t.corps) && /repère de lecture, pas un ordre/.test(t.corps));
  const now = 1e12 + 20 * H, e = evenements([f(19, 1, 'x'), f(19.1, 1, 'y', { contre: true })], { maintenant: now });
  v('point gris contre-tendance : aucun événement', e.length === 1 && e[0].f.levelId === 'x');
  const envoyes = []; const n = creerNotifieur({ canaux: [async m => { envoyes.push(m); }], maintenant: () => now });
  const reg = [f(19, 1, 'a'), f(19.2, -1, 'b'), f(19.3, 1, 'c')];
  await n.traiter(reg); v('plusieurs nouveautés d’un même passage : UN message groupé', envoyes.length === 1 && envoyes[0].groupe && /3 signaux/.test(envoyes[0].titre));
  await n.traiter(reg); v('déduplication : le même registre ne renvoie rien', envoyes.length === 1);
  const m2 = []; const n2 = creerNotifieur({ canaux: [async m => { m2.push(m); }], maintenant: () => now });
  for (let k = 0; k < 8; k++) await n2.traiter([f(19 + k / 100, 1, 'niv' + k, { tCloture: now - 1000 })]);
  v(`anti-spam : au plus ${LIMITE_HEURE} notifications par heure et par actif`, m2.length === LIMITE_HEURE && n2.stats.refusesLimite >= 2, String(m2.length));
  const m3 = []; const n3 = creerNotifieur({ canaux: [async m => { m3.push(m); }], maintenant: () => now });
  await n3.traiter([f(19, 1, 'meme', { id: 'A1', tCloture: now - 1000 })]); await n3.traiter([f(19.5, 1, 'meme', { id: 'A2', tCloture: now - 500 })]);
  v('repos de 5 min : deux notifications du même niveau rapprochées → la 2e est refusée', m3.length === 1 && n3.stats.refusesRepos === 1);
  const m4 = []; const n4 = creerNotifieur({ canaux: [async m => { m4.push(m); }], maintenant: () => now }); await n4.traiter([f(19, 1, 'z', { id: 'Z', tCloture: now - 10 * H, invalidee: true, invalideeT: now - 100 })]);
  v('invalidation : « Signal invalidé » envoyé une seule fois', m4.length === 1 && /Signal invalidé/.test(m4[0].titre));
  await n4.traiter([f(19, 1, 'z', { id: 'Z', tCloture: now - 10 * H, invalidee: true, invalideeT: now - 100 })]); v('invalidation : pas de doublon', m4.length === 1);
}
// ── flux simulé : bougie par bougie (série Kraken réelle)
const tel = canalTelegram(env, fetch, mu); v('Telegram configuré (faux serveur local)', typeof tel === 'function');
const debut = K.findIndex(b => b.t === Date.UTC(2026, 10, 11, 12)), fin = K.findIndex(b => b.t === Date.UTC(2026, 10, 12, 9));
let horloge = 0; let etat = { notif: {}, dernierT: 0, initialise: false }; const logs = [];
const pas = async (k, e, canaux = [tel]) => { horloge = K[k].t + H + 60000; return cycle({ donnees: async () => K.slice(0, k + 1), etat: e, canaux, maintenant: () => horloge, log: m => logs.push(m) }); };
await pas(debut - 1, etat); v('premier passage : l’existant est mémorisé sans rien envoyer', recus.length === 0 && etat.initialise);
let restart = 0;
for (let k = debut; k <= fin; k++) { await pas(k, etat); if (k === Math.floor((debut + fin) / 2)) { ecrireEtat(etat, fEtat); etat = lireEtat(fEtat); restart++; } }   // redémarrage en cours de route : état relu du fichier
const finalF = F.calculer(K.slice(0, fin + 1), zonesDirect, { maintenant: K[fin].t + H, bougies: 720 }).fleches;
const attendus = finalF.filter(f => !f.contre && f.tCloture > K[debut].t + H && f.tCloture <= K[fin].t + H), invs = finalF.filter(f => !f.contre && f.invalidee && f.invalideeT > K[debut].t + H && f.invalideeT <= K[fin].t + H);
const texte = recus.map(r => r.corps.text).join('\n');
console.log(`INFO ${attendus.length} flèches normales et ${invs.length} invalidation(s) attendues ; ${recus.length} message(s) Telegram`);
v('chaque message passe par /bot<jeton>/sendMessage avec le bon chat_id', recus.length > 0 && recus.every(r => /\/bot123:FAUX\/sendMessage$/.test(r.url) && r.corps.chat_id === '42'));
v('une notification par flèche normale (aucune de plus)', recus.length === attendus.length + invs.length && attendus.every(f => texte.includes(f.dir > 0 ? 'haussier' : 'baissier')), `${recus.length} vs ${attendus.length}+${invs.length}`);
v('un rebond ravalé produit « Signal invalidé »', invs.length === 0 || /Signal invalidé/.test(texte));
const gris = finalF.filter(f => f.contre && f.tCloture > K[debut].t + H && f.tCloture <= K[fin].t + H);
v('aucune notification pour un point gris contre-tendance de la période', gris.every(f => !texte.includes(String(Math.round(f.prix)) + ' ·' + 'x')) && !/point gris/i.test(texte));
v('redémarrage relu du fichier d’état', restart === 1);
const avant = recus.length; const e3 = lireEtat(fEtat); ecrireEtat(etat, fEtat); const e4 = lireEtat(fEtat); e4.dernierT = 0; await pas(fin, e4); await pas(fin, e4);
v('déduplication persistante : après redémarrage, aucune flèche n’est renvoyée', recus.length === avant, `${recus.length} vs ${avant}`);
const logs2 = []; const sans = canalTelegram({}, fetch, m => logs2.push(m)); v('sans jeton : canal absent, message clair, pas d’exception', sans === null && /manquent/.test(logs2.join()));
let plante = false; try { await pas(debut, { notif: {}, dernierT: 0, initialise: false }, []); } catch (e) { plante = true; } v('sans jeton : le passage se termine sans erreur', !plante);
v('lireEnv : lit KEY=VALUE, ignore un fichier absent', (() => { const f = path.join(tmp, '.env'); fs.writeFileSync(f, 'TELEGRAM_BOT_TOKEN="abc"\nTELEGRAM_CHAT_ID=7\n# c\n'); const o = lireEnv([f, path.join(tmp, 'absent')]); return o.TELEGRAM_BOT_TOKEN === 'abc' && o.TELEGRAM_CHAT_ID === '7'; })());
const gi = fs.readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8'); v('.env et l’état sont ignorés par git', /^\.env$/m.test(gi) && /alertes-etat/.test(gi));
v('aucun secret dans les fichiers livrés', !/\d{8,}:[A-Za-z0-9_-]{30,}/.test(fs.readFileSync(new URL('../alertes-serveur.mjs', import.meta.url), 'utf8')));
srv.close(); console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
