/* Alertes Telegram des FLÈCHES DAILY — SANS le PC (GitHub Actions, après le passage des alertes de flèches de l'ancien terminal).
   Usage : node trader-pro/terminal/alertes-fleches.mjs --donnees <dossier des pro-*.json> --etat <fichier d'état .json>   (secrets : TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID dans l'environnement)
   Règles : SEULEMENT les flèches Daily (aucun autre signal) ; une flèche n'est annoncée qu'une fois (identifiant actif|jour|sens) ; au tout premier passage on mémorise sans rien envoyer ;
   une flèche de plus de 36 h n'est jamais annoncée ; au plus 5 messages par passage ; sans secrets rien n'est envoyé ni marqué comme vu ; jamais d'ordre. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { calculer, cloturees, idFleche, RETENUE } from './fleches-daily.js';
import { barresDaily } from './fleches-registre.js';

const H = 3600e3;
export const ACTIFS = [['or', 'Or'], ['us100', 'Nasdaq 100'], ['us500', 'S&P 500'], ['btc', 'Bitcoin'], ['sol', 'Solana']];
const conv = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4] }));
const jour = t => new Date(t).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
export const texteFleche = (nom, f) => `${f.dir < 0 ? '▼' : '▲'} Flèche Daily ${f.dir < 0 ? 'rouge' : 'verte'} sur ${nom} : ${f.dir < 0 ? 'un sommet' : 'un creux'} semble confirmé (${f.dir < 0 ? 'sommet' : 'creux'} du ${jour(f.tExtreme)}, décalage ${f.decalageJours} jours).\nRetournement possible à la clôture de la bougie Daily du ${jour(f.t)} : la flèche ne bouge plus. Lecture seule, aucun ordre.`;

export async function traiter({ dossier, fichierEtat, env = process.env, fetchFn = fetch, maintenant = Date.now(), log = console.log } = {}) {
  let etat = { vus: [], initialise: false }; try { etat = JSON.parse(fs.readFileSync(fichierEtat, 'utf8')); } catch (e) { /* premier passage */ }
  const vus = new Set(etat.vus || []), messages = [], resume = { actifs: 0, fleches: 0, envoyes: 0, ignores: [] };
  for (const [id, nom] of ACTIFS) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(dossier, `pro-${id}.json`), 'utf8')); } catch (e) { resume.ignores.push(id + ' : instantané absent'); continue; }
    const B = cloturees(barresDaily(id, conv(d.j)), maintenant); if (B.length < 60) { resume.ignores.push(id + ' : pas assez de bougies Daily (' + B.length + ')'); continue; } resume.actifs++;
    for (const f of calculer(B, RETENUE.methode, RETENUE.params)) { const k = idFleche(id, f); if (vus.has(k)) continue; vus.add(k); resume.fleches++; if (etat.initialise && maintenant - f.tCloture < 36 * H) messages.push(texteFleche(nom, f)); }
  }
  const jeton = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID;
  if (!etat.initialise) { log(`Flèches Daily : premier passage, ${vus.size} flèches mémorisées, aucun message.`); }
  else if (messages.length && (!jeton || !chat)) { log(`Flèches Daily : ${messages.length} message(s) à envoyer mais les secrets Telegram manquent : rien n'est envoyé ni marqué comme vu.`); return { ...resume, messages, envoye: false }; }
  else for (const m of messages.slice(0, 5)) { try { const r = await fetchFn(`https://api.telegram.org/bot${jeton}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: m }), signal: AbortSignal.timeout(10000) }); if (r.ok) resume.envoyes++; else log('Flèches Daily : Telegram a répondu ' + r.status); } catch (e) { log('Flèches Daily : Telegram injoignable (' + String(e && e.message || e).replace(/bot\d+:[\w-]+/g, 'bot***') + ')'); } }
  fs.mkdirSync(path.dirname(fichierEtat), { recursive: true }); fs.writeFileSync(fichierEtat, JSON.stringify({ vus: [...vus].slice(-600), initialise: true, maj: maintenant }));
  log(`Flèches Daily : ${resume.actifs} actif(s) lus, ${messages.length} message(s) prévus, ${resume.envoyes} envoyé(s).${resume.ignores.length ? ' Ignorés : ' + resume.ignores.join(' ; ') : ''}`);
  return { ...resume, messages, envoye: true };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = n => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };
  await traiter({ dossier: path.resolve(arg('donnees') || '.'), fichierEtat: path.resolve(arg('etat') || 'alertes-fleches-etat.json') });
}
