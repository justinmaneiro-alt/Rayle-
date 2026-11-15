/* ═════════════ IA DE RAYLE (par le Worker existant : clés dans Cloudflare, jamais ici) ═════════════
   demanderIA(texte) → { texte } ou lève une erreur lisible. Jamais appelée automatiquement : seulement sur un clic. Interdits rappelés à l'IA : pas de probabilité chiffrée, pas d'ordre, pas de conseil. */
export const CONSIGNES = 'Tu es Rayle, assistant de lecture de marchés de Justin. Réponds en français, simplement et en peu de mots. Décris ce que montrent les données ; formule les scénarios en « si… alors… » ; ne donne aucune probabilité chiffrée, aucun ordre d’achat ou de vente, aucune taille de position. N’invente aucun chiffre : n’utilise que ceux fournis.';
export function workerRayle() { try { const w = window.RayleBus && window.RayleBus.demander('worker'); return w && w.url ? w : null; } catch (e) { return null; } }
export async function demanderIA(texte, { contexte = '', delai = 60000, fetchFn = (...a) => fetch(...a), worker = workerRayle() } = {}) {
  if (!worker) throw new Error('le Worker de Rayle n’est pas configuré sur cet appareil (⚙ Réglages)');
  const res = await fetchFn(worker.url.replace(/\/+$/, '') + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(worker.token ? { 'X-Rayle-Token': worker.token } : {}) }, body: JSON.stringify({ text: texte, context: CONSIGNES + (contexte ? '\n' + contexte : ''), history: [] }), signal: AbortSignal.timeout(delai) });
  if (res.status === 401) throw new Error('code d’accès refusé par le Worker (⚙ Réglages)');
  if (!res.ok) throw new Error('le Worker a répondu ' + res.status);
  const d = await res.json(); const t = d && (d.reply || d.texte || d.text); if (!t || typeof t !== 'string') throw new Error('réponse vide de l’IA');
  return { texte: t.trim() };
}
export const parler = t => { try { if (typeof window.speak === 'function' && t) return window.speak(String(t)); } catch (e) { /* voix absente */ } };
