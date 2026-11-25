/* ═════════════ RÉSEAU D'INFORMATION : lecture côté appareil (PC, tablette, téléphone) ═════════════
   Le Worker (D1) d'abord, avec l'état de GitHub Actions + l'état rapide fusionnés ici (l'appareil n'a pas la limite de 10 ms de CPU) ; sinon les mêmes données publiées en fichiers sur la branche « donnees ».
   Réglages (seuil de la voix, voix on/off, mode nuit) gardés sur l'appareil et synchronisés entre appareils par la synchronisation personnelle. Jamais de clé ici. */
import { lireConn } from '../terminal/dessins-stockage.js';
import { lireSnapshot } from '../commun/donnees.js';
import { fusionnerCartes, etatVide } from './etat.js';

export const CLE_REGLAGES = 'rayle_reseau_reglages_v1', CLE_VU = 'rayle_reseau_alertes_vues_v1';
export const REGLAGES_DEFAUT = Object.freeze({ seuilVoix: 80, voix: true, nuit: Object.freeze({ actif: true, de: 23, a: 7 }) });
const stockageDefaut = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
export function lireReglages(st = stockageDefaut()) {
  try { const r = JSON.parse(st.getItem(CLE_REGLAGES) || 'null') || {}; return { seuilVoix: Math.min(100, Math.max(50, Math.round(+r.seuilVoix) || 80)), voix: r.voix !== false, nuit: { actif: !(r.nuit && r.nuit.actif === false), de: Number.isInteger(r.nuit && r.nuit.de) ? r.nuit.de : 23, a: Number.isInteger(r.nuit && r.nuit.a) ? r.nuit.a : 7 } }; } catch (e) { return { ...REGLAGES_DEFAUT, nuit: { ...REGLAGES_DEFAUT.nuit } }; }
}
export function ecrireReglages(r, st = stockageDefaut()) { try { st.setItem(CLE_REGLAGES, JSON.stringify(r)); return true; } catch (e) { return false; } }
/* mode nuit : pas de voix entre deux heures (heure de Paris) ; Telegram continue */
export function modeNuit(reglages, maintenant = Date.now()) {
  const n = reglages.nuit; if (!n || !n.actif) return false; const h = +new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(maintenant)).find(p => p.type === 'hour').value % 24;
  return n.de === n.a ? false : n.de < n.a ? h >= n.de && h < n.a : h >= n.de || h < n.a;
}
const entetes = conn => ({ ...(conn.code ? { 'X-Portefeuille-Code': conn.code } : {}) });

/* réponse du Worker { etat, rapide, reanalyser } → un seul état, fusionné et noté */
export function fusionnerReponse(j, maintenant = Date.now()) {
  let E = { ...etatVide(), ...((j && j.etat) || {}) };
  if (j && j.rapide) { E = fusionnerCartes(E, j.rapide.cartes || [], maintenant); const S = { ...(E.sources || {}) }; for (const [id, s] of Object.entries(j.rapide.sources || {})) if (!S[id] || s.t >= S[id].t) S[id] = s; E.sources = S; E.alertes = [...(j.rapide.alertes || []), ...(E.alertes || [])].sort((a, b) => b.t - a.t).filter((a, i, L) => L.findIndex(x => x.carteId === a.carteId) === i).slice(0, 30); }
  return E;
}
export async function lireReseau({ conn = lireConn(), fetchFn = (...a) => fetch(...a), maintenant = Date.now(), lireFichier = () => lireSnapshot('reseau-etat.json', { valider: d => (d && Array.isArray(d.cartes) ? true : 'réseau vide') }) } = {}) {
  if (conn) {
    try { const r = await fetchFn(conn.url + '/reseau/etat', { headers: entetes(conn), signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined });
      if (r.ok) { const j = await r.json(); if ((j.etat && j.etat.cartes) || (j.rapide && j.rapide.cartes && j.rapide.cartes.length)) { const E = fusionnerReponse(j, maintenant); return { donnees: E, t: E.t || maintenant, origine: 'Worker (D1)' }; } } } catch (e) { /* repli sur le fichier publié */ }
  }
  const f = await lireFichier(), d = f.donnees; return { donnees: { ...etatVide(), ...d }, t: d.t || f.t, origine: 'fichier publié (branche donnees)', horsLigne: f.horsLigne };
}
/* alertes seules (petite réponse du Worker, interrogée souvent par la voix) ; sans Worker : l'état publié, interrogé moins souvent par l'appelant */
export async function lireAlertes({ conn = lireConn(), fetchFn = (...a) => fetch(...a) } = {}) {
  if (conn) { try { const r = await fetchFn(conn.url + '/reseau/alertes', { headers: entetes(conn), signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }); if (r.ok) { const j = await r.json(); return { alertes: j.alertes || [], origine: 'Worker' }; } } catch (e) { /* repli */ } }
  const r = await lireReseau({ conn: null, fetchFn }); return { alertes: r.donnees.alertes || [], origine: r.origine };
}
export async function lireAnnonces({ lireFichier = () => lireSnapshot('reseau-annonces.json', { valider: d => (d && Array.isArray(d.entrees) ? true : 'mémoire vide') }) } = {}) { try { return (await lireFichier()).donnees.entrees; } catch (e) { return []; } }
/* fiches de lecture de marché (phase 1) : Worker, sinon fichiers publiés */
export async function lireFiches({ conn = lireConn(), fetchFn = (...a) => fetch(...a), ids = ['or', 'us100', 'us500', 'btc', 'sol', 'petrole', 'dxy'], lireFichier = id => lireSnapshot(`lecture-${id}.json`, { valider: d => (d && d.actif ? true : 'fiche vide') }) } = {}) {
  if (conn) { try { const r = await fetchFn(conn.url + '/lecture/tout', { headers: entetes(conn), signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined }); if (r.ok) { const j = await r.json(); if (j && j.fiches && Object.keys(j.fiches).length) return j.fiches; } } catch (e) { /* repli */ } }
  const out = {}; await Promise.all(ids.map(async id => { try { out[id] = (await lireFichier(id)).donnees; } catch (e) { /* fiche absente : dite absente */ } })); return out;
}
/* personnalités : lecture / écriture par le Worker ; sans Worker : liste par défaut en lecture seule */
export async function lirePersonnes({ conn = lireConn(), fetchFn = (...a) => fetch(...a) } = {}) {
  if (!conn) return null; try { const r = await fetchFn(conn.url + '/reseau/personnes', { headers: entetes(conn), signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined }); if (!r.ok) return null; const j = await r.json(); return j.personnes || null; } catch (e) { return null; }
}
export async function ecrirePersonnes(personnes, { conn = lireConn(), fetchFn = (...a) => fetch(...a) } = {}) {
  if (!conn) throw new Error('le Worker n’est pas configuré sur cet appareil (fenêtre Portefeuille)');
  const r = await fetchFn(conn.url + '/reseau/personnes', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...entetes(conn) }, body: JSON.stringify({ personnes }), signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'le Worker a répondu ' + r.status); return j.personnes;
}
/* réglages du copilote côté Worker : silence jusqu'à une heure (messages Telegram sans notification), types d'alertes actifs */
export async function envoyerReglagesCopilote(patch, { conn = lireConn(), fetchFn = (...a) => fetch(...a) } = {}) {
  if (!conn) return false; try { const r = await fetchFn(conn.url + '/reseau/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...entetes(conn) }, body: JSON.stringify(patch), signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined }); return r.ok; } catch (e) { return false; }
}
export async function envoyerSeuilServeur(seuilAlerte, { conn = lireConn(), fetchFn = (...a) => fetch(...a) } = {}) {
  if (!conn) return false; try { const r = await fetchFn(conn.url + '/reseau/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...entetes(conn) }, body: JSON.stringify({ seuilAlerte }), signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined }); return r.ok; } catch (e) { return false; }
}
