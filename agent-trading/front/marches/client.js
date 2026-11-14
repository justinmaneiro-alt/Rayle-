/* ═════════════ CLIENT DE DONNÉES RAYLE MARCHÉS (navigateur) ═════════════
   - Adresse : window.RAYLE_MARCHES_BASE, sinon localStorage « rayle_marches_base », sinon la même origine que la page (le serveur de Rayle sert /marches/…).
   - Aucune requête pendant un geste sur le graphique (window.__ttGeste) : on attend la fin du geste.
   - Dernière réponse gardée sur l'appareil (localStorage « rayle_marches_cache_v1 ») : hors ligne, le panneau s'affiche avec ses valeurs DATÉES, marqué hors ligne. */
import { lireDonnee, urlSnapshot, originePc, creerStockageParDefaut } from '../donnees/couche.js';
const CLE = 'rayle_marches_cache_v1';
export const base = () => { try { return (globalThis.RAYLE_MARCHES_BASE || localStorage.getItem('rayle_marches_base') || '').replace(/\/+$/, ''); } catch (e) { return ''; } };
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}'); } catch (e) { return {}; } };
const ecrire = (k, v) => { try { const o = lire(); o[k] = v; const cles = Object.keys(o); if (cles.length > 24) delete o[cles.sort((a, b) => o[a].t - o[b].t)[0]]; localStorage.setItem(CLE, JSON.stringify(o)); } catch (e) { /* stockage plein ou interdit */ } };
export const attendreCalme = async (max = 8000) => { const t0 = Date.now(); while (globalThis.__ttGeste && Date.now() - t0 < max) await new Promise(r => setTimeout(r, 150)); };

/* 2026-11-14 : indépendant du PC. Ordre : serveur de Rayle (si une adresse est réglée, ou si la page vient du PC) → snapshot publié par le robot
   (branche « donnees », fichier marches-<id>[-<actif>].json) → dernière copie de l'appareil (IndexedDB), affichée avec sa date. */
export const nomSnapshotPanneau = (id, params = {}) => 'marches-' + String(id).replace(/[^a-z0-9]/gi, '') + (params.actif ? '-' + String(params.actif).toLowerCase().replace(/[^a-z0-9]/g, '') : '') + '.json';
export async function chargerPanneau(id, params = {}, { delai = 40000, fetchImpl = (...a) => fetch(...a), loc = globalThis.location, stockage = null } = {}) {
  const q = new URLSearchParams({ id, ...Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')) }), cle = q.toString();
  await attendreCalme();
  const hote = base() || originePc(loc), sources = [];
  if (hote) sources.push({ niveau: 'pc', nom: 'serveur de données', url: hote + '/marches/panneau?' + q, ms: delai });
  if (id !== 'fred' && id !== 'sources') sources.push({ niveau: 'snapshot', nom: 'snapshot ' + nomSnapshotPanneau(id, params), url: urlSnapshot(nomSnapshotPanneau(id, params)), ms: 20000 });
  try {
    const r = await lireDonnee('marches|' + cle, { sources, ttl: 0, stockage: stockage || creerStockageParDefaut(), fetchFn: fetchImpl, valider: p => (p && typeof p === 'object' && !p.error ? true : (p && p.error) || 'réponse vide') });
    ecrire(cle, { t: r.t, p: r.donnees });
    return { panneau: r.donnees, horsLigne: r.horsLigne ? { cacheLe: r.horsLigne.depuis, raison: r.horsLigne.raison } : null, origine: r.origine, t: r.t };
  } catch (e) {
    const c = lire()[cle], raison = String(e && e.message || e).slice(0, 120);
    if (c && c.p) return { panneau: c.p, horsLigne: { cacheLe: c.t, raison } };
    return { panneau: null, erreur: id === 'fred' ? 'cette série FRED demande le serveur de données (non disponible sans le PC)' : raison };
  }
}
export async function demanderCopilote(q, { delai = 40000, fetchImpl = (...a) => fetch(...a), loc = globalThis.location } = {}) {
  const hote = base() || originePc(loc);
  if (!hote) return { texte: 'Le copilote de données interroge le serveur de Rayle, qui n’est pas joignable sans le PC. Les panneaux restent lisibles avec leurs dernières valeurs datées.', mesures: [], trouve: false, horsLigne: true };
  try { const r = await fetchImpl(hote + '/marches/copilote?q='+ encodeURIComponent(q), { cache: 'no-store', signal: AbortSignal.timeout(delai) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  catch (e) { return { texte: 'Je n\'ai pas cette donnée : le serveur de données est injoignable (' + String(e && e.message || e).slice(0, 60) + ').', mesures: [], trouve: false }; }
}
