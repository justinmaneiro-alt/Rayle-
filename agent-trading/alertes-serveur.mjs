/* ═════════════ ALERTES TELEGRAM DES FLÈCHES (script autonome, mode Direct) ═════════════
   Calcule les flèches côté PC / serveur avec le MÊME moteur causal que le terminal (fleches-simples-v5 + zones-direct) sur les bougies H1 Kraken PF_XAUUSD, puis envoie un message Telegram par flèche
   (cassure MA200 confirmée, retournement sur niveau majeur, signal invalidé ; jamais pour un point gris contre-tendance). Anti-spam et déduplication persistante : fleches-notif.js.
   Jeton et identifiant dans un fichier .env LOCAL (ignoré par git) : TELEGRAM_BOT_TOKEN=… et TELEGRAM_CHAT_ID=… . S'ils manquent, le script le dit et n'envoie rien (aucun plantage).
   Lancement : node agent-trading/alertes-serveur.mjs   (ou alertes-serveur.cmd) ;  --une-fois : un seul passage.  Aucun ordre n'est jamais passé : repères de lecture. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as F from './front/or/fleches-simples-v5.js'; import { zonesDirect } from './front/or/zones-direct.js'; import { creerNotifieur } from './front/or/fleches-notif.js';
import { telechargerHistorique } from './moteur/bougies.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
export const FICHIER_ETAT = path.join(ici, '.alertes-etat.json');

export function lireEnv(fichiers = [path.join(ici, '.env'), path.join(ici, '..', '.env')]) {
  const o = {};
  for (const f of fichiers) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in o)) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch (e) { /* fichier absent : normal */ } }
  return o;
}
export function lireEtat(f = FICHIER_ETAT) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { notif: {}, dernierT: 0, initialise: false }; } }
export function ecrireEtat(e, f = FICHIER_ETAT) { try { fs.writeFileSync(f + '.tmp', JSON.stringify(e)); fs.renameSync(f + '.tmp', f); } catch (er) { console.log('état non enregistré :', er.message); } }

/* canal Telegram ; renvoie null si la configuration manque (message clair, jamais d'exception) */
export function canalTelegram(env = process.env, fetchFn = fetch, log = console.log) {
  const jeton = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID, api = (env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/$/, '');
  if (!jeton || !chat) { log('Telegram : TELEGRAM_BOT_TOKEN et/ou TELEGRAM_CHAT_ID manquent (fichier agent-trading/.env). Aucun message ne sera envoyé ; les alertes restent écrites ici.'); return null; }
  return async m => {
    const r = await fetchFn(`${api}/bot${jeton}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: `${m.titre}\n${m.corps}`, disable_web_page_preview: true }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Telegram HTTP ' + r.status);
  };
}
/* un passage : bougies → flèches (si une nouvelle bougie H1 est close) → notifications. `donnees()` renvoie les bougies H1 ; `etat` est modifié et doit être enregistré par l'appelant. */
export async function cycle({ donnees, etat, canaux = [], maintenant = () => Date.now(), log = console.log }) {
  const B = (await donnees()).filter(b => b.t + H <= maintenant() && b.c > 0), dernier = B.length ? B[B.length - 1].t : 0;
  if (B.length < 300) { log(`bougies insuffisantes (${B.length})`); return { envoyes: [], raison: 'bougies insuffisantes' }; }
  if (dernier === etat.dernierT && etat.initialise) return { envoyes: [], raison: 'pas de nouvelle bougie' };
  const r = F.calculer(B, zonesDirect, { maintenant: dernier + H, bougies: 720 });
  const n = creerNotifieur({ etat: etat.notif = etat.notif || {}, canaux: [m => { log('ALERTE', m.titre); return Promise.resolve(); }, ...canaux], maintenant });
  const envoyes = await n.traiter(r.fleches, { silencieux: !etat.initialise });   // premier passage : on mémorise l'existant sans rien envoyer
  etat.initialise = true; etat.dernierT = dernier; etat.notif = n.etat;
  return { envoyes, flèches: r.fleches.length };
}
async function principal() {
  const env = { ...lireEnv(), ...process.env }, canal = canalTelegram(env), etat = lireEtat();
  const donnees = () => telechargerHistorique('PF_XAUUSD', 'H1', Date.now() - 45 * 86400e3);
  const une = process.argv.includes('--une-fois'); console.log('Alertes des flèches (Direct, or H1) démarrées' + (canal ? ' : Telegram actif.' : ' : sans Telegram.'));
  for (;;) {
    try { await cycle({ donnees, etat, canaux: canal ? [canal] : [] }); ecrireEtat(etat); } catch (e) { console.log('passage échoué :', e.message); }
    if (une) break; await new Promise(r => setTimeout(r, 60000));
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) principal();
