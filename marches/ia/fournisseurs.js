/* ═════════════ COUCHE « FOURNISSEUR D'IA » : interface unique, fournisseur interchangeable ═════════════
   analyserGraphique(entrée) → { ok: true, analyse (JSON validé), fournisseur, cout } | { ok: false, raison, retourManuel: true }  — NE LÈVE JAMAIS d'exception.
   AI_PROVIDER = aucun | gemini | groq | openrouter | anthropic (défaut : aucun) ; clé AI_API_KEY (ou GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY) ;
   AI_MODEL (facultatif), AI_DAILY_LIMIT (défaut 20 envois par jour). Tout vient de agent-trading/.env côté serveur : la clé n'est JAMAIS envoyée au navigateur ni écrite dans une réponse.
   Seul le TEXTE structuré est envoyé (aucune image, aucun secret, aucune donnée personnelle). Sans fournisseur : mode manuel. */
import { texteGraphique, texteActualite, texteScenarios } from './prompt.js';
import { valider } from './schema.js';

export const FOURNISSEURS = {
  aucun: { nom: 'Aucun (mode manuel)', gratuit: true },
  gemini: { nom: 'Google Gemini', gratuit: true, modele: 'gemini-2.0-flash', note: 'offre gratuite d\'AI Studio, soumise aux quotas de Google', cle: 'GEMINI_API_KEY' },
  groq: { nom: 'Groq', gratuit: true, modele: 'llama-3.3-70b-versatile', note: 'offre gratuite soumise aux limites de Groq', cle: 'GROQ_API_KEY' },
  openrouter: { nom: 'OpenRouter', gratuit: true, modele: 'meta-llama/llama-3.3-70b-instruct:free', note: 'modèles « :free » sans frais, limités en débit', cle: 'OPENROUTER_API_KEY' },
  anthropic: { nom: 'Anthropic (Claude)', gratuit: false, modele: 'claude-haiku-5-5', note: 'PAYANT : facturé à l\'usage par Anthropic', cle: 'ANTHROPIC_API_KEY' }
};
const SEMAINE_MS = 864e5;
export const jourDe = ms => new Date(ms).toISOString().slice(0, 10);

/* compteur quotidien : stockage injecté { lire() → {jour, n}, ecrire({jour, n}) } */
export function creerQuota({ limite = 20, stockage = null, maintenant = Date.now } = {}) {
  let mem = { jour: jourDe(maintenant()), n: 0 }; const charger = () => { let e = mem; try { if (stockage) { const d = stockage.lire(); if (d && d.jour) e = d; } } catch (x) { /* mémoire seule */ } if (e.jour !== jourDe(maintenant())) e = { jour: jourDe(maintenant()), n: 0 }; return mem = e; };
  return { etat: () => { const e = charger(); return { limite, utilises: e.n, restants: Math.max(0, limite - e.n), jour: e.jour }; }, compter: () => { const e = charger(); e.n++; try { if (stockage) stockage.ecrire(e); } catch (x) { /* ignoré */ } return e.n; }, permis: () => charger().n < limite };
}
export const limiteDe = env => { const n = parseInt(env && env.AI_DAILY_LIMIT, 10); return isFinite(n) && n >= 0 ? Math.min(n, 1000) : 20; };

export function configuration(env = {}) {
  const id = String(env.AI_PROVIDER || 'aucun').trim().toLowerCase(), f = FOURNISSEURS[id];
  if (!f) return { id: 'aucun', erreur: 'AI_PROVIDER « ' + id + ' » inconnu (valeurs : ' + Object.keys(FOURNISSEURS).join(', ') + ')', ...FOURNISSEURS.aucun };
  const cle = f.cle ? (env.AI_API_KEY || env[f.cle] || '') : '';
  return { id, ...f, modele: env.AI_MODEL || f.modele || null, cleConfiguree: !!cle, _cle: cle };
}

/* Coût estimé AVANT l'envoi : jetons ≈ caractères / 3,5 ; sortie ≈ 1 200 jetons. Jamais de tarif inventé : payant sans AI_PRICE_IN / AI_PRICE_OUT = « non estimable ». */
export function estimerCout(texte, conf, env = {}) {
  const entree = Math.ceil(String(texte).length / 3.5), sortie = 1200;
  if (conf.id === 'aucun') return { jetonsEntree: entree, jetonsSortie: sortie, texte: 'aucun envoi : mode manuel' };
  if (conf.gratuit) return { jetonsEntree: entree, jetonsSortie: sortie, texte: `≈ ${entree} jetons envoyés · gratuit dans les limites du fournisseur (${conf.note}) ; quota du fournisseur non lisible avant l'envoi` };
  const pi = parseFloat(env.AI_PRICE_IN_PER_MTOK), po = parseFloat(env.AI_PRICE_OUT_PER_MTOK);
  if (isFinite(pi) && isFinite(po)) { const usd = entree / 1e6 * pi + sortie / 1e6 * po; return { jetonsEntree: entree, jetonsSortie: sortie, usd, texte: `≈ ${entree} jetons envoyés · coût estimé ≈ ${usd.toFixed(4)} $ (tarif saisi dans .env)` }; }
  return { jetonsEntree: entree, jetonsSortie: sortie, texte: `≈ ${entree} jetons envoyés · PAYANT : coût non estimable (aucun tarif AI_PRICE_IN_PER_MTOK / AI_PRICE_OUT_PER_MTOK dans .env)` };
}

const APPELS = {
  gemini: (c, texte) => ({ url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(c.modele) + ':generateContent', entetes: { 'x-goog-api-key': c._cle }, corps: { contents: [{ parts: [{ text: texte }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }, extraire: j => j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.map(p => p.text || '').join('') }),
  groq: (c, texte) => ({ url: 'https://api.groq.com/openai/v1/chat/completions', entetes: { Authorization: 'Bearer ' + c._cle }, corps: { model: c.modele, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: texte }] }, extraire: j => j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content }),
  openrouter: (c, texte) => ({ url: 'https://openrouter.ai/api/v1/chat/completions', entetes: { Authorization: 'Bearer ' + c._cle }, corps: { model: c.modele, temperature: 0.2, messages: [{ role: 'user', content: texte }] }, extraire: j => j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content }),
  anthropic: (c, texte) => ({ url: 'https://api.anthropic.com/v1/messages', entetes: { 'x-api-key': c._cle, 'anthropic-version': '2023-06-01' }, corps: { model: c.modele, max_tokens: 1800, temperature: 0.2, messages: [{ role: 'user', content: texte }] }, extraire: j => j && j.content && j.content.map(p => p.text || '').join('') })
};
const nette = (m, cle) => { let s = String(m || ''); if (cle) s = s.split(cle).join('[clé masquée]'); return s.slice(0, 200); };
const echec = (raison, extra = {}) => ({ ok: false, raison, retourManuel: true, ...extra });

export function creerFournisseur({ env = {}, fetchImpl = (...a) => fetch(...a), quota = creerQuota({ limite: limiteDe(env) }), delai = 45000 } = {}) {
  const conf = () => configuration(env);
  function etat(texteExemple = '') {
    const c = conf(), q = quota.etat();
    return { fournisseur: c.id, nom: c.nom, gratuit: c.gratuit, modele: c.modele || null, cleConfiguree: !!c.cleConfiguree, automatique: c.id !== 'aucun' && !!c.cleConfiguree && !c.erreur, quota: q, erreur: c.erreur || (c.id !== 'aucun' && !c.cleConfiguree ? 'clé absente dans agent-trading/.env : mode manuel' : null), cout: estimerCout(texteExemple, c, env) };
  }
  /* type : 'graphique' | 'scenarios' | 'actualite' */
  async function analyser(type, entree) {
    try {
      const c = conf();
      if (c.erreur) return echec(c.erreur);
      if (c.id === 'aucun') return echec('aucun fournisseur d\'IA configuré (AI_PROVIDER=aucun) : utilisez « Exporter pour analyse »');
      if (!c.cleConfiguree) return echec('clé de ' + c.nom + ' absente dans agent-trading/.env : utilisez « Exporter pour analyse »');
      let p; try { p = type === 'actualite' ? texteActualite(entree) : type === 'scenarios' ? texteScenarios(entree) : texteGraphique(entree); } catch (e) { return echec('données insuffisantes : ' + e.message); }
      if (!quota.permis()) { const q = quota.etat(); return echec(`limite quotidienne atteinte (${q.utilises}/${q.limite} envois aujourd'hui) : utilisez « Exporter pour analyse » ou relevez AI_DAILY_LIMIT`, { quota: q }); }
      const a = APPELS[c.id](c, p.texte), cout = estimerCout(p.texte, c, env), ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), delai);
      let r; try { quota.compter(); r = await fetchImpl(a.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...a.entetes }, body: JSON.stringify(a.corps), signal: ctrl.signal }); }
      catch (e) { return echec('fournisseur injoignable : ' + (e && e.name === 'AbortError' ? 'délai dépassé' : nette(e && e.message, c._cle))); } finally { clearTimeout(tm); }
      if (r.status === 429) return echec('quota ou débit du fournisseur dépassé (HTTP 429) : réessayez plus tard ou utilisez « Exporter pour analyse »', { quotaFournisseur: true });
      if (r.status === 401 || r.status === 403) return echec('clé refusée par ' + c.nom + ' (HTTP ' + r.status + ') : vérifiez agent-trading/.env');
      if (!r.ok) return echec('erreur du fournisseur (HTTP ' + r.status + ')');
      let j; try { j = await r.json(); } catch (e) { return echec('réponse du fournisseur illisible'); }
      const brut = a.extraire(j); if (!brut) return echec('réponse du fournisseur vide ou inattendue');
      let analyse; try { analyse = valider(type === 'actualite' ? 'actualite' : 'graphique', brut, { plage: p.plage }); } catch (e) { return echec('réponse de l\'IA rejetée : ' + nette(e.message, c._cle), { reponseRejetee: true }); }
      return { ok: true, analyse, fournisseur: c.id, modele: c.modele, cout, plage: p.plage };
    } catch (e) { return echec('erreur inattendue : ' + nette(e && e.message)); }
  }
  return { etat, analyser, analyserGraphique: entree => analyser('graphique', entree), conf, quota };
}
