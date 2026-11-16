/* Test des alertes de flèches Daily du robot. node trader-pro/tests/alertes-fleches-test.mjs */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { traiter, texteFleche } from '../terminal/alertes-fleches.mjs';
import { calculer, RETENUE } from '../terminal/fleches-daily.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'afl-')), J = 86400e3, H = 3600e3, T0 = Date.UTC(2023, 0, 2);
let graine = 9; const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296 - 0.5; };
function pro(n) { const j = []; let p = 1000; for (let i = 0; i < n; i++) { const o = p; p = Math.max(50, p + Math.sin(i / 30) * 8 + alea() * 14); j.push([T0 + i * J, o, Math.max(o, p) + Math.abs(alea()) * 6, Math.min(o, p) - Math.abs(alea()) * 6, p, 0]); } return { id: 'btc', j, h4: [] }; }
const D = pro(900); fs.writeFileSync(path.join(dossier, 'pro-btc.json'), JSON.stringify(D));
const B = D.j.map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4] })), F = calculer(B, RETENUE.methode, RETENUE.params); v(F.length > 8, 'la série de test produit des flèches (' + F.length + ')');
const etat = path.join(dossier, 'etat', 'alertes-fleches-etat.json'), envoyes = [], fetchFn = async (u, o) => { envoyes.push(JSON.parse(o.body)); return new Response('{"ok":true}', { status: 200 }); }, env = { TELEGRAM_BOT_TOKEN: 'JETON-SECRET', TELEGRAM_CHAT_ID: '1' };
const log = []; const lg = m => log.push(m);
const fin = T0 + 900 * J, avant = F[F.length - 4].tCloture - 2 * H;   // il reste 3 flèches à venir
let r = await traiter({ dossier, fichierEtat: etat, env, fetchFn, maintenant: avant, log: lg }); v(r.envoye === true && envoyes.length === 0, 'premier passage : rien n’est envoyé'); v(JSON.parse(fs.readFileSync(etat, 'utf8')).initialise === true, 'état écrit');
let total = 0; for (let t = avant + 6 * H; t <= fin + 2 * J; t += 6 * H) { const n0 = envoyes.length; await traiter({ dossier, fichierEtat: etat, env, fetchFn, maintenant: t, log: lg }); total += envoyes.length - n0; }
v(total >= 3, 'les 3 flèches suivantes sont annoncées (' + total + ')'); const textes = envoyes.map(m => m.text); v(new Set(textes).size === textes.length, 'jamais deux messages identiques');
v(textes.every(t => /Flèche Daily/.test(t) && /aucun ordre/.test(t)), 'chaque message parle d’une flèche Daily et dit « aucun ordre »'); v(!textes.some(t => /Signal|MA200|touche/.test(t)), 'aucun autre signal que les flèches Daily');
const n1 = envoyes.length; await traiter({ dossier, fichierEtat: etat, env, fetchFn, maintenant: fin + 2 * J, log: lg }); v(envoyes.length === n1, 'un passage sans nouveauté n’envoie rien');
/* sans secrets : rien n'est envoyé ni marqué comme vu */
fs.rmSync(path.dirname(etat), { recursive: true, force: true }); await traiter({ dossier, fichierEtat: etat, env: {}, fetchFn, maintenant: avant, log: lg }); const vusAvant = JSON.parse(fs.readFileSync(etat, 'utf8')).vus.length; let rs = null; for (let t = avant + 6 * H; t <= fin + 2 * J && !(rs && rs.messages.length); t += 6 * H) rs = await traiter({ dossier, fichierEtat: etat, env: {}, fetchFn, maintenant: t, log: lg });
v(rs && rs.envoye === false && JSON.parse(fs.readFileSync(etat, 'utf8')).vus.length === vusAvant, 'sans secrets Telegram : rien n’est envoyé et rien n’est marqué comme vu'); v(!log.some(l => /JETON-SECRET/.test(l)), 'le jeton n’apparaît jamais dans les journaux');
/* une flèche de plus de 36 h n'est jamais annoncée */
fs.rmSync(path.dirname(etat), { recursive: true, force: true }); envoyes.length = 0; await traiter({ dossier, fichierEtat: etat, env, fetchFn, maintenant: F[0].tCloture - J, log: lg }); await traiter({ dossier, fichierEtat: etat, env, fetchFn, maintenant: fin + 60 * J, log: lg }); v(envoyes.length === 0, 'les flèches anciennes ne sont pas annoncées');
v(/Flèche Daily rouge sur Or : un sommet semble confirmé/.test(texteFleche('Or', { dir: -1, t: T0, tExtreme: T0 - 12 * J, decalageJours: 12 })), 'format du message rouge'); v(/Flèche Daily verte sur Or : un creux/.test(texteFleche('Or', { dir: 1, t: T0, tExtreme: T0 - 12 * J, decalageJours: 12 })), 'format du message vert');
const r0 = await traiter({ dossier: path.join(dossier, 'vide'), fichierEtat: path.join(dossier, 'e2.json'), env, fetchFn, maintenant: fin, log: lg }); v(r0.actifs === 0 && r0.ignores.length >= 1, 'instantanés absents : signalé, pas de plantage');
fs.rmSync(dossier, { recursive: true, force: true }); console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
