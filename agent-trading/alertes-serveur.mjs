/* ═════════════ ALERTES TELEGRAM DES FLÈCHES (script autonome, mode Direct) ═════════════
   Calcule les flèches côté PC / serveur avec le MÊME moteur causal que le terminal (fleches-simples-v6 + zones-direct) sur les bougies H1 Kraken PF_XAUUSD, puis envoie un message Telegram par flèche
   (cassure MA200 confirmée, retournement sur niveau majeur, signal invalidé ; jamais pour un point gris contre-tendance). Anti-spam et déduplication persistante : fleches-notif.js.
   Jeton et identifiant dans un fichier .env LOCAL (ignoré par git) : TELEGRAM_BOT_TOKEN=… et TELEGRAM_CHAT_ID=… . S'ils manquent, le script le dit et n'envoie rien (aucun plantage).
   Test réel unique : node agent-trading/alertes-serveur.mjs --test-telegram (getMe + 1 message + 1 image).
   Lancement : node agent-trading/alertes-serveur.mjs   (ou alertes-serveur.cmd) ;  --une-fois : un seul passage.  Aucun ordre n'est jamais passé : repères de lecture. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as F8 from './front/or/fleches-simples-v8.js'; import * as F7 from './front/or/fleches-simples-v7.js'; import * as F6 from './front/or/fleches-simples-v6.js';   // v8 (gros mouvements) ; anciennes lignes : fleches-simples-v7 (Direct v7 validée), fleches-simples-v6 (Direct stable)
import { zonesDirect } from './front/or/zones-direct.js';
import { telechargerHistorique } from './moteur/bougies.js';
import { creerNotifieur, formater } from './front/or/fleches-notif.js'; import { pngSignal, legendeSignal } from './signal-image.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
export const FICHIER_ETAT = path.join(ici, '.alertes-etat.json');

export function lireEnv(fichiers = [path.join(ici, '.env'), path.join(ici, '..', '.env')]) {
  const o = {};
  for (const f of fichiers) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in o)) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch (e) { /* fichier absent : normal */ } }
  return o;
}
export function lireEtat(f = FICHIER_ETAT) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { notif: {}, dernierT: 0, initialise: false }; } }
export function ecrireEtat(e, f = FICHIER_ETAT) { try { fs.writeFileSync(f + '.tmp', JSON.stringify(e)); fs.renameSync(f + '.tmp', f); } catch (er) { console.log('état non enregistré :', er.message); } }

/* canal Telegram ; renvoie null si la configuration manque (message clair, jamais d'exception).
   Une flèche = UNE photo (image de signal PNG + légende : type, actif, niveau, entrée, stop, TP1, TP2, R, heure) ; si l'image échoue, le même texte part seul (échec journalisé, jamais silencieux).
   « Signal invalidé » = texte seul. Aucun message pour les points gris (le notifieur les écarte). Le jeton n'est jamais journalisé. `ctx.bougies()` renvoie les bougies H1 du dernier passage. */
export function canalTelegram(env = process.env, fetchFn = fetch, log = console.log, ctx = {}) {
  const jeton = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID, api = (env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/$/, '');
  if (!jeton || !chat) { log('Telegram : TELEGRAM_BOT_TOKEN et/ou TELEGRAM_CHAT_ID manquent (fichier agent-trading/.env). Aucun message ne sera envoyé ; les alertes restent écrites ici.'); return null; }
  const url = m => `${api}/bot${jeton}/${m}`;
  const texte = async t => { const r = await fetchFn(url('sendMessage'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: t, disable_web_page_preview: true }), signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Telegram HTTP ' + r.status); };
  const photo = async (png, legende) => { const fd = new FormData(); fd.append('chat_id', String(chat)); fd.append('caption', legende); fd.append('photo', new Blob([png], { type: 'image/png' }), 'signal.png'); const r = await fetchFn(url('sendPhoto'), { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('Telegram HTTP ' + r.status); };
  const canal = async m => {
    const evs = (m.evenements || []).filter(e => e && e.f);
    if (!evs.length) { await texte(`${m.titre}
${m.corps}`); return; }
    for (const e of evs) {
      if (e.genre !== 'fleche') { const t = formater(e); await texte(`${t.titre}
${t.corps}`); continue; }          // signal invalidé : texte seul
      const legende = legendeSignal(e.f);
      try { const B = ctx.bougies ? ctx.bougies() : null; if (!B) throw new Error('bougies indisponibles'); await photo(await pngSignal({ bougies: B, f: e.f }), legende); }
      catch (er) { log('image de signal indisponible (' + String(er.message).replace(jeton, '***') + ') : message texte seul'); await texte(legende); }
    }
  };
  canal.api = { jeton: '***', url: api };
  return canal;
}
/* test réel unique (--test-telegram) : getMe puis UN message et UNE image de démonstration ; déduit le chat id depuis getUpdates s'il manque */
export async function testerTelegram(env = process.env, fetchFn = fetch, log = console.log, bougies = null) {
  const jeton = env.TELEGRAM_BOT_TOKEN, api = (env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/$/, ''); if (!jeton) { log('Telegram : pas de jeton (TELEGRAM_BOT_TOKEN) dans agent-trading/.env : test impossible.'); return false; }
  const appel = async (m, corps) => { const r = await fetchFn(`${api}/bot${jeton}/${m}`, corps ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) } : {}); const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(`${m} : HTTP ${r.status}`); return j.result; };
  const moi = await appel('getMe'); log('Bot vérifié : @' + moi.username);
  let chat = env.TELEGRAM_CHAT_ID; if (!chat) { const U = await appel('getUpdates'); const m = U.reverse().map(u => (u.message || u.channel_post || {}).chat).find(Boolean); if (!m) { log('Chat id introuvable : écris un message au bot puis relance.'); return false; } chat = m.id; log('Chat id déduit du dernier message reçu (à copier dans .env).'); }
  const c = canalTelegram({ ...env, TELEGRAM_CHAT_ID: String(chat) }, fetchFn, log, { bougies: () => bougies }); await appel('sendMessage', { chat_id: chat, text: 'Rayle : alertes branchées ✅' });
  if (bougies) { const i = bougies.length - 1, a = 15; await c({ evenements: [{ genre: 'fleche', f: { type: 'retournement', dir: -1, t: bougies[i].t, tCloture: bougies[i].t + H, prix: bougies[i].c, atr: a, zoneBas: bougies[i].c - 4, zoneHaut: bougies[i].c + 6, niveau: bougies[i].c + 6, niveauNom: 'Image de démonstration' } }] }); }
  return true;
}
/* un passage : bougies → flèches (si une nouvelle bougie H1 est close) → notifications. `donnees()` renvoie les bougies H1 ; `etat` est modifié et doit être enregistré par l'appelant. */
export async function cycle({ donnees, etat, canaux = [], maintenant = () => Date.now(), log = console.log }) {
  const B = (await donnees()).filter(b => b.t + H <= maintenant() && b.c > 0), dernier = B.length ? B[B.length - 1].t : 0;
  if (B.length < 300) { log(`bougies insuffisantes (${B.length})`); return { envoyes: [], raison: 'bougies insuffisantes' }; }
  if (dernier === etat.dernierT && etat.initialise) return { envoyes: [], raison: 'pas de nouvelle bougie' };
  const F = ({ v6: F6, v7: F7 })[process.env.FLECHES_MOTEUR] || F8;   // v8 par défaut ; FLECHES_MOTEUR=v7|v6 pour les anciens moteurs (tests)
  const r = F.calculer(B, zonesDirect, { maintenant: dernier + H, bougies: 720 });
  const n = creerNotifieur({ etat: etat.notif = etat.notif || {}, canaux: [m => { log('ALERTE', m.titre); return Promise.resolve(); }, ...canaux], maintenant });
  const envoyes = await n.traiter(r.fleches.filter(f => f.type !== 'ma_cassure' || process.env.FLECHES_MA === '1'), { silencieux: !etat.initialise, alertes: process.env.ALERTE_CONTACT === '0' ? [] : (r.alertes || []) });   // flèches MA200 coupées par défaut (FLECHES_MA=1 pour les envoyer) ; alerte de contact en texte seul (ALERTE_CONTACT=0 pour la couper)   // premier passage : on mémorise l'existant sans rien envoyer
  etat.initialise = true; etat.dernierT = dernier; etat.notif = n.etat;
  return { envoyes, flèches: r.fleches.length };
}
async function principal() {
  const env = { ...lireEnv(), ...process.env }, etat = lireEtat();
  let derniere = null;
  const donnees = async () => { derniere = await telechargerHistorique('PF_XAUUSD', 'H1', Date.now() - 45 * 86400e3); return derniere; };
  if (process.argv.includes('--test-telegram')) { try { await testerTelegram(env, fetch, console.log, (await donnees()).filter(b => b.t + H <= Date.now())); } catch (e) { console.log('test Telegram échoué :', String(e.message).replace(env.TELEGRAM_BOT_TOKEN || ' ', '***')); } return; }
  const canal = canalTelegram(env, fetch, console.log, { bougies: () => derniere });
  const une = process.argv.includes('--une-fois'); console.log('Alertes des flèches (Direct, or H1) démarrées' + (canal ? ' : Telegram actif.' : ' : sans Telegram.'));
  for (;;) {
    try { await cycle({ donnees, etat, canaux: canal ? [canal] : [] }); ecrireEtat(etat); } catch (e) { console.log('passage échoué :', e.message); }
    if (une) break; await new Promise(r => setTimeout(r, 60000));
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) principal();
