// Plume de l'agent : met en français simple des FAITS que le code a calculés. Ordre : LM Studio sur ce PC (http://localhost:1234/v1, API compatible OpenAI ; Dolphin 3.0 si demandé dans la config
// de l'agent : "modele": "dolphin"), puis les API gratuites du Worker de Raylé (/chat), puis le texte écrit par le code. JAMAIS de calcul par le modèle : tout chiffre inventé fait REFUSER sa réponse
// (strategies/rapport-v3.js). Le modèle ne reçoit aucune clé, ne passe aucun ordre. Les modèles locaux ne sont jamais utilisés pour des données de patients (rien de médical ici).
import { promptRapport, accepterTexteModele, rapportTemplate } from '../strategies/rapport-v3.js';

export const LM_STUDIO = 'http://localhost:1234/v1';
async function json(fetchImpl, url, opts = {}, delai = 90000) {
  const r = await fetchImpl(url, { ...opts, signal: AbortSignal.timeout(delai) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
}
/* Modèles chargés dans LM Studio ; choisit « dolphin » si demandé, sinon le premier. Rend { id } ou null (LM Studio éteint ou aucun modèle). */
export async function choisirModele({ fetchImpl = globalThis.fetch, preference = null, base = LM_STUDIO } = {}) {
  try {
    const j = await json(fetchImpl, base + '/models', {}, 4000), ids = (j.data || []).map(m => m.id).filter(id => !/embed/i.test(id)); if (!ids.length) return null;
    const voulu = preference ? ids.find(id => id.toLowerCase().includes(String(preference).toLowerCase())) : null;
    return { id: voulu || ids[0], tous: ids, preferenceTrouvee: !!voulu };
  } catch (e) { return null; }
}
export async function ecrireRapport(faits, { fetchImpl = globalThis.fetch, preference = null, config = null, base = LM_STUDIO } = {}) {
  const essais = [];
  const m = await choisirModele({ fetchImpl, preference, base });
  if (m) {
    try {
      const rep = await json(fetchImpl, base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.id, temperature: 0.2, max_tokens: 400, stream: false, messages: [{ role: 'system', content: 'Tu écris en français simple pour Justin, trader et étudiant. Tu ne fais aucun calcul et tu n’inventes aucun chiffre.' }, { role: 'user', content: promptRapport(faits) }] }) });
      const texte = rep.choices && rep.choices[0] && rep.choices[0].message && rep.choices[0].message.content, verdict = accepterTexteModele(texte, faits);
      if (verdict.ok) return { lignes: texte.trim().split(/\n+/).map(x => x.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 6), source: 'LM Studio (' + m.id + ')', essais };
      essais.push('LM Studio refusé : ' + verdict.raison);
    } catch (e) { essais.push('LM Studio : ' + String(e.message).slice(0, 80)); }
  } else essais.push('LM Studio injoignable ou sans modèle');
  if (config && config.url && config.jeton) {
    try {
      const rep = await json(fetchImpl, String(config.url).replace(/\/+$/, '') + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Token': config.jeton }, body: JSON.stringify({ text: 'Réécris le rapport de l’agent en 5 lignes courtes, sans markdown, sans nouveau chiffre.', context: promptRapport(faits).slice(0, 18000), mode: 'normal' }) }, 45000);
      const verdict = accepterTexteModele(rep.reply, faits);
      if (verdict.ok) return { lignes: rep.reply.trim().split(/\n+/).map(x => x.trim()).filter(Boolean).slice(0, 6), source: 'API gratuite (' + (rep.engine || 'Worker') + ')', essais };
      essais.push('API gratuite refusée : ' + verdict.raison);
    } catch (e) { essais.push('API gratuite : ' + String(e.message).slice(0, 80)); }
  }
  return { lignes: rapportTemplate(faits), source: 'texte écrit par le code (aucun modèle utilisé)', essais };
}

/* Complétion libre pour les rôles de l'équipe (le Chercheur) : même ordre que le rapport (LM Studio, Dolphin si demandé, puis l'API gratuite du Worker), mais avec un prompt système au choix. Rend
   { texte, source, essais } ; texte = null si aucun modèle n'a répondu (l'appelant utilise alors son secours déterministe). Le modèle ne calcule rien et ne passe aucun ordre. */
export async function completer({ systeme, utilisateur, fetchImpl = globalThis.fetch, preference = null, config = null, base = LM_STUDIO, temperature = 0.4, maxTokens = 2200, delai = 120000 } = {}) {
  const essais = [], m = await choisirModele({ fetchImpl, preference, base });
  if (m) {
    try {
      const rep = await json(fetchImpl, base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.id, temperature, max_tokens: maxTokens, stream: false, messages: [{ role: 'system', content: systeme }, { role: 'user', content: utilisateur }] }) }, delai);
      const texte = rep.choices && rep.choices[0] && rep.choices[0].message && rep.choices[0].message.content; if (texte) return { texte, source: 'LM Studio (' + m.id + ')', essais };
      essais.push('LM Studio : réponse vide');
    } catch (e) { essais.push('LM Studio : ' + String(e.message).slice(0, 80)); }
  } else essais.push('LM Studio injoignable ou sans modèle');
  if (config && config.url && config.jeton) {
    try {
      const rep = await json(fetchImpl, String(config.url).replace(/\/+$/, '') + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Token': config.jeton }, body: JSON.stringify({ text: systeme + '\n\n' + utilisateur }) }, delai);
      if (rep.reply) return { texte: rep.reply, source: 'API gratuite (' + (rep.engine || 'Worker') + ')', essais };
      essais.push('API gratuite : réponse vide');
    } catch (e) { essais.push('API gratuite : ' + String(e.message).slice(0, 80)); }
  }
  return { texte: null, source: 'aucun modèle', essais };
}
