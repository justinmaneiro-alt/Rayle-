/* ═════════════ SYNCHRONISATION PERSONNELLE (v6, B1) — client ═════════════
   Garde identiques, sur le PC, la tablette et le téléphone : Ma liste, Mon plan, réglages des flèches, risque et positions, heures de silence (voir worker/src/sync.js).
   Interrogation toutes les 45 s SEULEMENT quand la page est visible (budget gratuit Cloudflare) ; pause en arrière-plan. Sans Worker configuré : rien ne se passe. Jamais d'exception.
   Pas de doublons : une valeur est identifiée par sa clé ; la dernière modification gagne (horodatage de l'appareil qui a modifié). */
export const CLES_SYNC = Object.freeze(['rayle_lt_liste_v1', 'rayle_invest_plan_v1', 'rayle_tp_ma200h4_reglages', 'rayle_tp_fleches_alertes', 'rayle_pf_risque_v1', 'rayle_pf_positions_v1', 'rayle_alertes_silence_v1', 'rayle_briefing_reglage_v1']);
export const CLE_META = 'rayle_sync_meta_v1', INTERVALLE = 45000;
export const idAppareil = () => 'a' + Math.random().toString(36).slice(2, 8);

/* modifications locales : une valeur qui diffère de ce qui a été vu à la dernière synchro reçoit l'horodatage « maintenant » */
export function diffLocale({ valeurs, vu = {}, maj = {}, maintenant = Date.now() }) {
  const maj2 = { ...maj }, vu2 = { ...vu }, envoi = {};
  for (const k of CLES_SYNC) { const v = valeurs[k]; const t = v === undefined ? 'null' : v; if (JSON.stringify(t) === JSON.stringify(vu[k] === undefined ? 'null' : vu[k]) && maj[k]) continue; if (v === undefined && !maj[k]) continue; maj2[k] = maintenant; vu2[k] = v === undefined ? null : v; envoi[k] = true; }
  return { maj: maj2, vu: vu2, envoi };
}
/* valeurs du serveur plus récentes que les nôtres → à écrire localement */
export function appliquerDistant({ distant, valeurs, maj = {}, vu = {} }) {
  const ecrire = {}, maj2 = { ...maj }, vu2 = { ...vu };
  for (const [k, e] of Object.entries(distant || {})) { if (!CLES_SYNC.includes(k) || !e || !Number.isFinite(e.maj)) continue; const locale = valeurs[k]; if (JSON.stringify(locale === undefined ? null : locale) === JSON.stringify(e.valeur)) { maj2[k] = Math.max(maj2[k] || 0, e.maj); vu2[k] = e.valeur; continue; } if (e.maj > (maj[k] || 0)) { ecrire[k] = e.valeur; maj2[k] = e.maj; vu2[k] = e.valeur; } }
  return { ecrire, maj: maj2, vu: vu2 };
}
/* une passe complète : lire l'état du Worker, appliquer ce qui est plus récent, envoyer ce qui a changé ici. `st` = { lire(k), ecrire(k, v), lireMeta(), ecrireMeta(m) }. */
export async function synchroniser({ conn, st, fetchFn = (...a) => fetch(...a), maintenant = Date.now() } = {}) {
  if (!conn) return { ok: false, horsConfig: true };
  try {
    const meta = st.lireMeta() || { maj: {}, vu: {}, appareil: idAppareil() }; if (!meta.appareil) meta.appareil = idAppareil();
    const entetes = { 'Content-Type': 'application/json', ...(conn.code ? { 'X-Portefeuille-Code': conn.code } : {}) };
    const r1 = await fetchFn(conn.url + '/sync', { headers: entetes, signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined }); if (!r1.ok) return { ok: false, statut: r1.status };
    const ralentir = Math.min(8, Math.max(1, Number(r1.headers && r1.headers.get && r1.headers.get('x-rayle-ralentir')) || 1)); synchroniser.ralentir = ralentir;   // à 70 % d'une limite gratuite, le Worker demande de ralentir
    const d = await r1.json(), valeurs = Object.fromEntries(CLES_SYNC.map(k => [k, st.lire(k)]));
    /* 1) horodater mes modifications locales (une valeur jamais synchronisée dont le serveur a déjà une copie n'est pas une modification : le serveur fait foi pour un nouvel appareil) */
    const vu0 = { ...(meta.vu || {}) }; for (const k of Object.keys(d.cles || {})) if (vu0[k] === undefined && CLES_SYNC.includes(k)) vu0[k] = valeurs[k] === undefined ? null : valeurs[k];
    const L = diffLocale({ valeurs, vu: vu0, maj: meta.maj || {}, maintenant });
    /* 2) la dernière modification gagne : le serveur l'emporte seulement s'il est plus récent que ma modification */
    const A = appliquerDistant({ distant: d.cles, valeurs, maj: L.maj, vu: L.vu }); for (const [k, v] of Object.entries(A.ecrire)) { st.ecrire(k, v); valeurs[k] = v; }
    /* 3) j'envoie ce que j'ai modifié et qui n'a pas été écrasé */
    const cles = {}; for (const k of Object.keys(L.envoi)) if (!(k in A.ecrire)) cles[k] = { valeur: valeurs[k] === undefined ? null : valeurs[k], maj: A.maj[k], appareil: meta.appareil };
    let envoyees = 0; if (Object.keys(cles).length) { const r2 = await fetchFn(conn.url + '/sync', { method: 'PUT', headers: entetes, body: JSON.stringify({ cles }), signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined }); if (!r2.ok) return { ok: false, statut: r2.status, recues: Object.keys(A.ecrire).length }; envoyees = Object.keys(cles).length; }
    st.ecrireMeta({ maj: A.maj, vu: A.vu, appareil: meta.appareil, derniere: maintenant });
    return { ok: true, recues: Object.keys(A.ecrire), envoyees };
  } catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
}
/* branchement navigateur : toutes les 45 s si visible ; aussi au retour de visibilité et après une modification locale */
export function brancherSynchroPerso({ lireConn }) {
  if (typeof document === 'undefined' || brancherSynchroPerso.fait) return; brancherSynchroPerso.fait = true;
  const st = { lire: k => { try { const v = localStorage.getItem(k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } }, ecrire: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); document.dispatchEvent(new CustomEvent('tp:sync-recu', { detail: { cle: k } })); } catch (e) { /* plein */ } },
    lireMeta: () => { try { return JSON.parse(localStorage.getItem(CLE_META) || 'null'); } catch (e) { return null; } }, ecrireMeta: m => { try { localStorage.setItem(CLE_META, JSON.stringify(m)); } catch (e) { /* plein */ } } };
  let enCours = false; const passe = async () => { if (enCours || document.hidden) return; enCours = true; try { await synchroniser({ conn: lireConn(), st }); } finally { enCours = false; } };
  (function boucle() { setTimeout(async () => { await passe(); boucle(); }, INTERVALLE * (synchroniser.ralentir || 1)); })(); document.addEventListener('visibilitychange', () => { if (!document.hidden) passe(); }); setTimeout(passe, 4000); window.addEventListener('storage', e => { if (e.key && CLES_SYNC.includes(e.key)) setTimeout(passe, 1500); });
}
