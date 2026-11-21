/* ═════════════ « CERVEAU » DE RAYLE (v8) : passerelle Gemini avec appel de fonctions ═════════════
   POST /cerveau { system, contents, outils (functionDeclarations), temperature?, maxTokens? } → { parts, model, essais }
   Les OUTILS sont exécutés par la page (les données de l'application sont dans l'appareil) ; ce Worker ne fait que parler à Gemini avec la clé GEMINI_KEY (secrète) et renvoyer ce que le modèle a décidé :
   du texte, ou des appels de fonctions. La page renvoie ensuite les résultats (functionResponse) et rappelle la route jusqu'à la réponse finale.
   Modèles gratuits essayés dans l'ordre ; un modèle en quota (429) ou absent (404/400) est mis de côté et le suivant prend le relais (chaque modèle a son propre quota gratuit). */
export const MODELES_TEXTE = ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'];
export class ErreurCerveau extends Error { constructor(msg, statut = 503, quota = false) { super(msg); this.statut = statut; this.quota = quota; } }
const bloques = new Map();   // modèle → timestamp de fin de blocage (quota)
let modeleOk = null;
export const reinitialiserCerveau = () => { bloques.clear(); modeleOk = null; };
const TAILLE_MAX = 300000;

export function construireCorps({ system, contents, outils, temperature = 0.6, maxTokens = 900 }, modele) {
  const c = { systemInstruction: { parts: [{ text: String(system || '').slice(0, 20000) }] }, contents, generationConfig: { temperature: Math.max(0, Math.min(1.2, +temperature || 0.6)), maxOutputTokens: Math.max(200, Math.min(2000, Math.round(+maxTokens || 900))) } };
  if (Array.isArray(outils) && outils.length) { c.tools = [{ functionDeclarations: outils }]; c.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }; }
  if (/2\.5/.test(modele)) c.generationConfig.thinkingConfig = { thinkingBudget: 0 };   // réponse rapide : pas de « réflexion » facturée sur le quota
  return c;
}
const detail429 = async r => { const brut = await r.text().catch(() => ''); let d = brut; try { const e = (JSON.parse(brut).error) || {}; const viol = ((e.details || []).find(x => x.violations) || {}).violations || []; d = [e.message, ...viol.map(v => (v.quotaMetric || '') + ' ' + (v.quotaId || ''))].filter(Boolean).join(' | '); } catch (x) { /* texte brut */ } return String(d).replace(/\s+/g, ' ').slice(0, 400); };

export async function appelerCerveau(req, { cle, fetchFn = (...a) => fetch(...a), maintenant = Date.now(), delai = 28000 }) {
  if (!cle) throw new ErreurCerveau('clé GEMINI_KEY absente des secrets du Worker', 400);
  const liste = (modeleOk ? [modeleOk, ...MODELES_TEXTE.filter(m => m !== modeleOk)] : MODELES_TEXTE), essais = []; let quota = 0;
  for (const m of liste) {
    if ((bloques.get(m) || 0) > maintenant) { essais.push(m + ' : en pause (quota)'); quota++; continue; }
    let r; try { r = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cle }, body: JSON.stringify(construireCorps(req, m)), signal: AbortSignal.timeout ? AbortSignal.timeout(delai) : undefined }); } catch (e) { essais.push(m + ' : ' + e.message); continue; }
    if (r.status === 429) { const d = await detail429(r), jour = /PerDay|per day|daily/i.test(d); bloques.set(m, maintenant + (jour ? 3 * 3600e3 : 30e3)); essais.push(m + ' : quota (429) ' + d); quota++; continue; }
    if (!r.ok) { const t = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200); essais.push(m + ' : HTTP ' + r.status + ' ' + t); continue; }
    const j = await r.json().catch(() => null), cand = j && j.candidates && j.candidates[0], parts = cand && cand.content && cand.content.parts;
    if (!parts || !parts.length) { essais.push(m + ' : réponse vide' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : '')); continue; }
    modeleOk = m; return { parts, model: m, finishReason: cand.finishReason || null, usage: j.usageMetadata || null, essais };
  }
  throw new ErreurCerveau('Gemini indisponible : ' + essais.join(' ; '), quota >= liste.length ? 429 : 503, quota >= liste.length);
}

export async function routeCerveau(request, env, ctx, cors, { json, fetchFn, maintenant } = {}) {
  const brut = await request.text().catch(() => ''); if (brut.length > TAILLE_MAX) return json({ error: 'requête trop grande' }, 413, cors);
  let b; try { b = JSON.parse(brut); } catch (e) { return json({ error: 'JSON invalide' }, 400, cors); }
  if (!b || !Array.isArray(b.contents) || !b.contents.length || b.contents.length > 80) return json({ error: 'contents manquant ou trop long' }, 400, cors);
  try { return json(await appelerCerveau(b, { cle: env.GEMINI_KEY, fetchFn, maintenant }), 200, { ...cors, 'Cache-Control': 'no-store' }); }
  catch (e) { return json({ error: e.message, quota: !!e.quota }, e.statut || 503, cors); }
}

/* modèles texte réellement disponibles avec la clé (diagnostic, sans quota : ListModels) */
export async function modelesDisponibles(cle, { fetchFn = (...a) => fetch(...a) } = {}) {
  const r = await fetchFn('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': cle } }); if (!r.ok) throw new Error('ListModels HTTP ' + r.status);
  const j = await r.json(); return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/.test(m.name) && !/tts|image|live|audio|embedding|robotics|computer|aqa/i.test(m.name)).map(m => m.name.replace(/^models\//, ''));
}
