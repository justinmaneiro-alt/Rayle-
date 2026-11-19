/* ═════════════ JOURNAL PAR SETUP : stockage sur l'appareil + synchronisation (Worker Portefeuille, route /journal) + rappel hebdomadaire ═════════════
   Même principe que les dessins du Terminal : local d'abord (localStorage), puis fusion avec la copie du Worker quand il est configuré. Partagé par le Terminal (« Je l'ai pris »), la voix de Rayle et la fenêtre Portefeuille. */
import { creerPrise, creerAttribution, nettoyerListe, fusionner, visibles, supprimer } from './journal-setups.js';
export { visibles };

export const CLE = 'rayle_pf_journal_v1', CLE_CONN = 'rayle_pf_conn_v1', CLE_IMPORT = 'rayle_pf_dernier_import', CLE_RAPPEL = 'rayle_pf_dernier_rappel';
const defaut = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
export const lireConn = (st = defaut()) => { try { const c = JSON.parse(st.getItem(CLE_CONN) || 'null'); return c && c.url ? { url: String(c.url).replace(/\/+$/, ''), code: String(c.code || '') } : null; } catch (e) { return null; } };
export const lireJournal = (st = defaut()) => { try { return nettoyerListe(JSON.parse(st.getItem(CLE) || '[]')); } catch (e) { return []; } };
export const ecrireJournal = (L, st = defaut()) => { try { st.setItem(CLE, JSON.stringify(L)); return true; } catch (e) { return false; } };
export async function synchroniser(locale, { conn = lireConn(), fetchFn = (...a) => fetch(...a), delai = 12000, maintenant = Date.now() } = {}) {
  if (!conn) return { ok: false, horsConfig: true, journal: locale };
  try {
    const r = await fetchFn(conn.url + '/journal', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(conn.code ? { 'X-Portefeuille-Code': conn.code } : {}) }, body: JSON.stringify({ journal: locale }), signal: AbortSignal.timeout(delai) });
    let j = null; try { j = await r.json(); } catch (e) { /* corps vide */ }
    if (!r.ok || !j || !Array.isArray(j.journal)) return { ok: false, statut: r.status, erreur: (j && j.error) || 'le Worker a répondu ' + r.status, journal: locale };
    return { ok: true, journal: fusionner(locale, nettoyerListe(j.journal), maintenant) };
  } catch (e) { return { ok: false, erreur: String(e && e.message || e), journal: locale }; }
}
/* ajoute une prise (ou une attribution) à la liste locale, enregistre, puis synchronise en arrière-plan ; renvoie l'enregistrement */
export function ajouter(rec, { st = defaut(), sync = true, fetchFn } = {}) {
  if (!rec) return null; const L = fusionner(lireJournal(st), [rec]); ecrireJournal(L, st);
  if (sync) synchroniser(L, { fetchFn }).then(r => { if (r.ok) ecrireJournal(fusionner(lireJournal(st), r.journal), st); }).catch(() => { /* hors ligne : au prochain passage */ });
  return rec;
}
export const noterPrise = (donnees, opts) => ajouter(creerPrise(donnees), opts);
export const attribuer = (positionId, setup, opts) => ajouter(creerAttribution(positionId, setup), opts);
export const retirer = (id, { st = defaut() } = {}) => { const L = supprimer(lireJournal(st), id); ecrireJournal(L, st); return L; };
export const noterImport = (t = Date.now(), st = defaut()) => { try { st.setItem(CLE_IMPORT, String(t)); } catch (e) { /* */ } };
export const dernierImport = (st = defaut()) => { try { const v = +st.getItem(CLE_IMPORT); return Number.isFinite(v) && v > 0 ? v : null; } catch (e) { return null; } };

/* ───── rappel hebdomadaire : le dimanche, si rien n'a été importé depuis 7 jours ───── */
const fParis = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }) : null;
export function partiesParis(t) { const o = {}; for (const p of fParis.formatToParts(new Date(t))) o[p.type] = p.value; return { jour: `${o.year}-${o.month}-${o.day}`, heure: +o.hour % 24, dimanche: /^dim/i.test(o.weekday) }; }
/* heureMin : pas de rappel trop tôt le dimanche ; dernierRappel : date (AAAA-MM-JJ) du dernier rappel */
export function doitRappeler({ maintenant = Date.now(), dernierImport: imp = null, dernierRappel = null, heureMin = 10, joursSansImport = 7 } = {}) {
  const P = partiesParis(maintenant); if (!P.dimanche || P.heure < heureMin) return false; if (dernierRappel === P.jour) return false;
  return imp == null || maintenant - imp >= joursSansImport * 86400e3;
}
export const PHRASE_RAPPEL = 'C’est dimanche : pense à importer ton historique XTB de la semaine dans la fenêtre Portefeuille (Historique du compte, puis Exporter).';
