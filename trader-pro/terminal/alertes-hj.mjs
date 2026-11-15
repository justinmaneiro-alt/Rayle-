/* Alertes Telegram des signaux H4 / Jour, de la MA200 H4 / J et des niveaux Jour forts — SANS le PC (GitHub Actions, après le passage des alertes de flèches).
   Usage : node trader-pro/terminal/alertes-hj.mjs --donnees <dossier des pro-*.json> --etat <fichier d'état .json>   (secrets : TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID dans l'environnement)
   Règles : un signal n'est annoncé qu'une fois (identifiant actif|unité|clôture|sens) ; au tout premier passage on mémorise sans rien envoyer ; un signal de plus de 36 h n'est jamais annoncé ;
   les couples actif / unité dont le backtest est NÉGATIF (backtest-hj.json) ne déclenchent pas d'alerte ; au plus 5 messages par passage ; jamais d'ordre. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { lireHJ, idSignal } from './lecture-hj.js';

const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
export const ACTIFS = [['or', 'Or'], ['us100', 'Nasdaq 100'], ['us500', 'S&P 500'], ['btc', 'Bitcoin'], ['sol', 'Solana']];
const conv = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4] }));
const nf = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '?');
export function lireBacktest() { try { return JSON.parse(fs.readFileSync(path.join(ici, 'backtest-hj.json'), 'utf8')); } catch (e) { return null; } }
const verdictDe = (bt, id, tf) => { const a = bt && bt.actifs.find(x => x.id === id); return a && a.tf[tf] && a.tf[tf].verdict ? a.tf[tf].verdict.niveau : null; };
export const texteSignal = (nom, s) => `${s.dir > 0 ? '▲' : '▼'} Signal ${s.tf === 'J' ? 'Jour' : 'H4'} sur ${nom} : ${s.dir > 0 ? 'achat' : 'vente'} (${s.type}).\nEntrée vers ${nf(s.entree)}, stop ${nf(s.sl)}, objectif ${nf(s.tp)} (R/R ${nf(s.rr, 1)}).\nBougie clôturée : le signal ne se redessine pas. Lecture seule, aucun ordre. À recopier dans xStation avec ta propre taille.`;

export async function traiter({ dossier, fichierEtat, env = process.env, fetchFn = fetch, maintenant = Date.now(), bt = lireBacktest(), log = console.log } = {}) {
  let etat = { vus: [], initialise: false }; try { etat = JSON.parse(fs.readFileSync(fichierEtat, 'utf8')); } catch (e) { /* premier passage */ }
  const vus = new Set(etat.vus || []), messages = [], resume = { actifs: 0, signaux: 0, contacts: 0, envoyes: 0, ignores: [] };
  for (const [id, nom] of ACTIFS) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(dossier, `pro-${id}.json`), 'utf8')); } catch (e) { resume.ignores.push(id + ' : instantané absent'); continue; }
    const L = lireHJ({ ...d, j: conv(d.j), h4: conv(d.h4) }, { maintenant, jours: 5 }); if (!L.ok) { resume.ignores.push(id + ' : ' + L.raison); continue; } resume.actifs++;
    for (const s of L.signaux) { const k = idSignal(id, s); if (vus.has(k)) continue; vus.add(k); resume.signaux++; if (etat.initialise && maintenant - s.tCloture < 36 * H && verdictDe(bt, id, s.tf) !== 'negatif') messages.push(texteSignal(nom, s)); }
    for (const c of L.contacts) { const k = `contact|${id}|${c.type}|${new Date(maintenant).toISOString().slice(0, 10)}`; if (vus.has(k)) continue; vus.add(k); resume.contacts++; if (etat.initialise) messages.push(`● ${nom} touche ${c.type} (${nf(c.prix)}).\nBiais Jour : ${L.biaisTexte.split(' (')[0]}. Lecture seule, aucun ordre.`); }
  }
  const jeton = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID;
  if (!etat.initialise) { log(`Alertes H4/Jour : premier passage, ${vus.size} éléments mémorisés, aucun message.`); }
  else if (messages.length && (!jeton || !chat)) { log(`Alertes H4/Jour : ${messages.length} message(s) à envoyer mais les secrets Telegram manquent : rien n'est envoyé ni marqué comme vu.`); return { ...resume, messages, envoye: false }; }
  else for (const m of messages.slice(0, 5)) { try { const r = await fetchFn(`https://api.telegram.org/bot${jeton}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: m }), signal: AbortSignal.timeout(10000) }); if (r.ok) resume.envoyes++; else log('Alertes H4/Jour : Telegram a répondu ' + r.status); } catch (e) { log('Alertes H4/Jour : envoi impossible (' + String(e && e.message || e).replace(jeton || '§', '***') + ')'); } }
  fs.mkdirSync(path.dirname(fichierEtat), { recursive: true }); fs.writeFileSync(fichierEtat, JSON.stringify({ vus: [...vus].slice(-600), initialise: true, maj: maintenant }));
  log(`Alertes H4/Jour : ${resume.actifs} actif(s) lus, ${messages.length} message(s) prévus, ${resume.envoyes} envoyé(s).${resume.ignores.length ? ' Ignorés : ' + resume.ignores.join(' ; ') : ''}`);
  return { ...resume, messages, envoye: true };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = n => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };
  await traiter({ dossier: path.resolve(arg('donnees') || '.'), fichierEtat: path.resolve(arg('etat') || 'alertes-hj-etat.json') });
}
