/* ═════════════ CLIENT DE DONNÉES RAYLE MARCHÉS (navigateur) ═════════════
   - Adresse : window.RAYLE_MARCHES_BASE, sinon localStorage « rayle_marches_base », sinon la même origine que la page (le serveur de Rayle sert /marches/…).
   - Aucune requête pendant un geste sur le graphique (window.__ttGeste) : on attend la fin du geste.
   - Dernière réponse gardée sur l'appareil (localStorage « rayle_marches_cache_v1 ») : hors ligne, le panneau s'affiche avec ses valeurs DATÉES, marqué hors ligne. */
const CLE = 'rayle_marches_cache_v1';
export const base = () => { try { return (window.RAYLE_MARCHES_BASE || localStorage.getItem('rayle_marches_base') || '').replace(/\/+$/, ''); } catch (e) { return ''; } };
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}'); } catch (e) { return {}; } };
const ecrire = (k, v) => { try { const o = lire(); o[k] = v; const cles = Object.keys(o); if (cles.length > 24) delete o[cles.sort((a, b) => o[a].t - o[b].t)[0]]; localStorage.setItem(CLE, JSON.stringify(o)); } catch (e) { /* stockage plein ou interdit */ } };
export const attendreCalme = async (max = 8000) => { const t0 = Date.now(); while (window.__ttGeste && Date.now() - t0 < max) await new Promise(r => setTimeout(r, 150)); };

export async function chargerPanneau(id, params = {}, { delai = 40000, fetchImpl = (...a) => fetch(...a) } = {}) {
  const q = new URLSearchParams({ id, ...Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')) }), cle = q.toString();
  await attendreCalme();
  try {
    const r = await fetchImpl(base() + '/marches/panneau?' + q, { cache: 'no-store', signal: AbortSignal.timeout(delai) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const p = await r.json(); if (!p || typeof p !== 'object' || p.error) throw new Error(p && p.error || 'réponse vide');
    ecrire(cle, { t: Date.now(), p }); return { panneau: p, horsLigne: null };
  } catch (e) {
    const c = lire()[cle], raison = e && e.name === 'TimeoutError' ? 'délai dépassé' : String(e && e.message || e).slice(0, 80);
    if (c && c.p) return { panneau: c.p, horsLigne: { cacheLe: c.t, raison } };
    return { panneau: null, erreur: raison };
  }
}
export async function demanderCopilote(q, { delai = 40000, fetchImpl = (...a) => fetch(...a) } = {}) {
  try { const r = await fetchImpl(base() + '/marches/copilote?q=' + encodeURIComponent(q), { cache: 'no-store', signal: AbortSignal.timeout(delai) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  catch (e) { return { texte: 'Je n\'ai pas cette donnée : le serveur de données est injoignable (' + String(e && e.message || e).slice(0, 60) + ').', mesures: [], trouve: false }; }
}
