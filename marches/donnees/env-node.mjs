/* Lecture (Node seulement) des clés FACULTATIVES de RAYLE MARCHÉS dans agent-trading/.env (fichier ignoré par git) : FINNHUB_KEY, TWELVEDATA_KEY, SEC_UA, MARCHES_YAHOO.
   Seules ces variables sont lues ; aucune valeur n'est jamais affichée ni journalisée. */
import fs from 'node:fs';
const AUTORISEES = new Set(['FINNHUB_KEY', 'TWELVEDATA_KEY', 'SEC_UA', 'MARCHES_YAHOO']);
export function envMarches(chemin = new URL('../../agent-trading/.env', import.meta.url), base = process.env) {
  const out = {}; for (const k of AUTORISEES) if (base[k]) out[k] = base[k];
  try { for (const l of fs.readFileSync(chemin, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && AUTORISEES.has(m[1]) && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch (e) { /* pas de fichier : aucune clé */ }
  return out;
}
