/* ═════════════ RAPPEL HEBDOMADAIRE D'IMPORT (Worker, cron toutes les 5 minutes) : le dimanche, message Telegram si l'historique XTB n'a pas été importé depuis 7 jours ═════════════
   Pas d'API XTB (fermée le 14 mars 2025) : l'import est manuel. Le dernier import connu est l'heure des positions ouvertes enregistrées par /importer (kv « ouvertes »). Un seul rappel par dimanche (kv « rappelImport »). */
import { doitRappeler, partiesParis } from '../../portefeuille/journal-stockage.js';

export const TEXTE_TELEGRAM = '📥 Rayle : c’est dimanche, pense à importer ton historique XTB de la semaine (xStation → Historique du compte → Exporter, puis fenêtre Portefeuille). Lecture seule, aucun ordre.';
export async function rappelImport(env, depot, { maintenant = Date.now(), fetchFn = fetch } = {}) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { envoye: false, raison: 'Telegram non configuré' };
  const ouv = await depot.kvLire('ouvertes'), dernierRappel = await depot.kvLire('rappelImport'), imp = ouv && Number.isFinite(ouv.t) ? ouv.t : null;
  if (!doitRappeler({ maintenant, dernierImport: imp, dernierRappel })) return { envoye: false, raison: 'pas nécessaire' };
  const r = await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: TEXTE_TELEGRAM }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) return { envoye: false, raison: 'Telegram a répondu ' + r.status };
  await depot.kvEcrire('rappelImport', partiesParis(maintenant).jour); return { envoye: true };
}
