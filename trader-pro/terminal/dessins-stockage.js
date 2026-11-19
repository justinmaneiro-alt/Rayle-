/* ═════════════ DESSINS : stockage sur l'appareil + synchronisation PC / tablette / téléphone (système de sauvegarde déjà en place : Worker Portefeuille) ═════════════
   Local d'abord (localStorage, affichage instantané et hors ligne) ; si le Worker Portefeuille est configuré (adresse + code gardés sur l'appareil, voir fenêtre Portefeuille), chaque changement est envoyé
   (PUT /dessins : le Worker fusionne avec sa copie et renvoie le résultat) et la copie du Worker est tirée à l'ouverture. Sans Worker : les dessins restent sur l'appareil, sans erreur. */
import { nettoyerListe, fusionner, visibles } from './dessins-fusion.js';
export { fusionner, visibles };

export const CLE = id => `rayle_tp_dessins_${id}`;
export const CLE_CONN = 'rayle_pf_conn_v1';          // même clé que la fenêtre Portefeuille : { url, code }
const defaut = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
export function lireConn(st = defaut()) { try { const c = JSON.parse(st.getItem(CLE_CONN) || 'null'); return c && c.url ? { url: String(c.url).replace(/\/+$/, ''), code: String(c.code || '') } : null; } catch (e) { return null; } }
export function lireDessins(id, st = defaut()) { try { return nettoyerListe(JSON.parse(st.getItem(CLE(id)) || '[]')); } catch (e) { return []; } }
export function ecrireDessins(id, L, st = defaut()) { try { st.setItem(CLE(id), JSON.stringify(L)); return true; } catch (e) { return false; } }

/* envoie la liste locale au Worker et renvoie la liste fusionnée (ou { ok: false } sans casser : hors ligne, non configuré) */
export async function synchroniser(id, locale, { conn = lireConn(), fetchFn = (...a) => fetch(...a), delai = 12000, maintenant = Date.now() } = {}) {
  if (!conn) return { ok: false, horsConfig: true, dessins: locale };
  try {
    const r = await fetchFn(conn.url + '/dessins', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(conn.code ? { 'X-Portefeuille-Code': conn.code } : {}) }, body: JSON.stringify({ actif: id, dessins: locale }), signal: AbortSignal.timeout(delai) });
    let j = null; try { j = await r.json(); } catch (e) { /* corps vide */ }
    if (!r.ok || !j || !Array.isArray(j.dessins)) return { ok: false, statut: r.status, erreur: (j && j.error) || 'le Worker a répondu ' + r.status, dessins: locale };
    return { ok: true, dessins: fusionner(locale, nettoyerListe(j.dessins), maintenant) };
  } catch (e) { return { ok: false, erreur: String(e && e.message || e), dessins: locale }; }
}
