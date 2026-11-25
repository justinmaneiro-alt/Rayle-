/* Carnet de copilote : stockage sur l'appareil (localStorage) + synchronisation avec TON Worker (route /copilote/carnet, texte brut dans D1). Données privées : jamais dans le dépôt public.
   Fusion par entrée : la dernière modification gagne. Sans Worker configuré : tout reste sur l'appareil, sans erreur. */
import { lireConn } from '../terminal/dessins-stockage.js';
import { CLE_CARNET, fusionnerCarnets, MAX_ENTREES } from './carnet.js';

const defaut = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
export function lireCarnet(st = defaut()) { try { const L = JSON.parse(st.getItem(CLE_CARNET) || '[]'); return Array.isArray(L) ? L.filter(e => e && e.id) : []; } catch (e) { return []; } }
export function ecrireCarnet(L, st = defaut()) { try { st.setItem(CLE_CARNET, JSON.stringify(L.slice(0, MAX_ENTREES))); return true; } catch (e) { return false; } }
export async function synchroniserCarnet(locale, { conn = lireConn(), fetchFn = (...a) => fetch(...a), st = defaut() } = {}) {
  if (!conn) return { ok: false, horsConfig: true, entrees: locale };
  try {
    const h = { 'Content-Type': 'application/json', ...(conn.code ? { 'X-Portefeuille-Code': conn.code } : {}) }, r = await fetchFn(conn.url + '/copilote/carnet', { headers: h, signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined });
    let distant = []; if (r.ok) { const j = await r.json(); distant = Array.isArray(j.entrees) ? j.entrees : []; } else if (r.status !== 404) return { ok: false, statut: r.status, entrees: locale };
    const fusion = fusionnerCarnets(locale, distant); ecrireCarnet(fusion, st);
    if (JSON.stringify(fusion) !== JSON.stringify(distant)) { const p = await fetchFn(conn.url + '/copilote/carnet', { method: 'PUT', headers: h, body: JSON.stringify({ entrees: fusion }), signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined }); if (!p.ok) return { ok: false, statut: p.status, entrees: fusion }; }
    return { ok: true, entrees: fusion };
  } catch (e) { return { ok: false, erreur: String(e && e.message || e), entrees: locale }; }
}
export async function majEntree(entree, { st = defaut(), sync = true, fetchFn } = {}) {
  const L = lireCarnet(st), i = L.findIndex(e => e.id === entree.id), e2 = { ...entree, maj: Date.now() }; if (i >= 0) L[i] = e2; else L.unshift(e2); ecrireCarnet(L, st);
  if (sync) synchroniserCarnet(L, { st, ...(fetchFn ? { fetchFn } : {}) }).catch(() => {}); return e2;
}
