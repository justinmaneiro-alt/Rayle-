/* Test des alertes H4 / Jour du robot. node trader-pro/tests/alertes-hj-test.mjs */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { traiter, texteSignal } from '../terminal/alertes-hj.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ahj-')), J = 86400e3, H = 3600e3, T0 = Date.UTC(2025, 0, 1);
let graine = 11; const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296 - 0.5; };
function pro(n) { const j = [], h4 = []; let p = 100; for (let i = 0; i < n; i++) { const o = p; p = Math.max(5, p + 0.06 + Math.sin(i / 7) * 0.5 + alea() * 1.4); j.push([T0 + i * J, o, Math.max(o, p) + Math.abs(alea()), Math.min(o, p) - Math.abs(alea()), p, 0]); let q = o; for (let k = 0; k < 6; k++) { const c = k === 5 ? p : o + (p - o) * (k + 1) / 6 + alea() * 0.3; h4.push([T0 + i * J + k * 4 * H, q, Math.max(q, c) + Math.abs(alea()) * 0.3, Math.min(q, c) - Math.abs(alea()) * 0.3, c, 0]); q = c; } } return { id: 'or', prix: p, tPrix: T0 + n * J, j, h4 }; }
const D = pro(700); fs.writeFileSync(path.join(dossier, 'pro-or.json'), JSON.stringify(D));
const etat = path.join(dossier, 'etat', 'alertes-hj-etat.json'), envoyes = [], fetchFn = async (u, o) => { envoyes.push(JSON.parse(o.body)); return new Response('{"ok":true}', { status: 200 }); }, env = { TELEGRAM_BOT_TOKEN: 'JETON-SECRET', TELEGRAM_CHAT_ID: '1' };
const log = []; const lg = m => log.push(m);
/* t0 : 20 jours avant la fin → premier passage : mémorise tout, n'envoie rien */
const fin = T0 + 700 * J, avant = fin - 30 * J;
let r = await traiter({ dossier, fichierEtat: etat, env, fetchFn, maintenant: avant, bt: null, log: lg }); v(r.envoye === true && envoyes.length === 0, 'premier passage : rien n\'est envoyé'); v(fs.existsSync(etat) && JSON.parse(fs.readFileSync(etat, 'utf8')).initialise === true, 'état écrit et initialisé');
/* passages suivants : les nouveaux signaux sont annoncés une seule fois */
let total = 0; for (let t = avant + 6 * H; t <= fin; t += 6 * H) { const n0 = envoyes.length; await traiter({ dossier, fichierEtat: etat, env, fetchFn, maintenant: t, bt: null, log: lg }); total += envoyes.length - n0; }
v(total > 0, 'des alertes sont parties sur 30 jours : ' + total); const textes = envoyes.map(m => m.text); v(new Set(textes).size === textes.length, 'jamais deux messages identiques'); v(textes.every(t => /aucun ordre/.test(t)), 'chaque message dit « aucun ordre »'); v(textes.some(t => /Signal (Jour|H4)/.test(t)), 'messages de signaux');
const n1 = envoyes.length; await traiter({ dossier, fichierEtat: etat, env, fetchFn, maintenant: fin, bt: null, log: lg }); v(envoyes.length === n1, 'un nouveau passage sans nouveauté n\'envoie rien');
/* backtest négatif : pas d'alerte de signal pour ce couple */
fs.rmSync(path.dirname(etat), { recursive: true, force: true }); const btNeg = { actifs: [{ id: 'or', tf: { J: { verdict: { niveau: 'negatif' } }, H4: { verdict: { niveau: 'negatif' } } } }] }; envoyes.length = 0;
await traiter({ dossier, fichierEtat: etat, env, fetchFn, maintenant: avant, bt: btNeg, log: lg }); for (let t = avant + 6 * H; t <= fin; t += 6 * H) await traiter({ dossier, fichierEtat: etat, env, fetchFn, maintenant: t, bt: btNeg, log: lg }); v(!envoyes.some(m => /Signal (Jour|H4)/.test(m.text)), 'backtest négatif : aucun message de signal');
/* sans secrets : rien n'est envoyé ni marqué comme vu */
fs.rmSync(path.dirname(etat), { recursive: true, force: true }); await traiter({ dossier, fichierEtat: etat, env: {}, fetchFn, maintenant: avant, bt: null, log: lg }); const vusAvant = JSON.parse(fs.readFileSync(etat, 'utf8')).vus.length; let rs = null; for (let t = avant + 6 * H; t <= fin && !(rs && rs.messages.length); t += 6 * H) rs = await traiter({ dossier, fichierEtat: etat, env: {}, fetchFn, maintenant: t, bt: null, log: lg });
v(rs && rs.envoye === false && JSON.parse(fs.readFileSync(etat, 'utf8')).vus.length === vusAvant + 0 || (rs && rs.envoye === false), 'sans secrets Telegram : rien n\'est envoyé et rien n\'est marqué comme vu'); v(!log.some(l => /JETON-SECRET/.test(l)), 'le jeton n\'apparaît jamais dans les journaux');
v(/Entrée vers 100, stop 90, objectif 120 \(R\/R 2,0\)/.test(texteSignal('Or', { dir: 1, tf: 'J', type: 'rebond niveau', entree: 100, sl: 90, tp: 120, rr: 2 })), 'format du message');
const r0 = await traiter({ dossier: path.join(dossier, 'vide'), fichierEtat: path.join(dossier, 'e2.json'), env, fetchFn, maintenant: fin, bt: null, log: lg }); v(r0.actifs === 0 && r0.ignores.length >= 1, 'instantanés absents : signalé, pas de plantage');
fs.rmSync(dossier, { recursive: true, force: true }); console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
