/* ═════════════ SYNCHRONISATION DES DONNÉES PERSONNELLES (v6, B1) — Worker Portefeuille, une seule ligne D1 « sync » ═════════════
   Complète les routes déjà en place (dessins, journal, alertes, XTB, réglages du portefeuille) : Ma liste, Mon plan, réglages des flèches, risque et positions, heures de silence.
   Règle de conflit : LA DERNIÈRE MODIFICATION GAGNE (horodatage `maj` choisi par l'appareil, borné à « maintenant + 5 min »), avec une TRACE de chaque conflit (30 dernières).
   Budget : une lecture D1 par interrogation d'appareil (toutes les 45 s, appli visible seulement) ; une écriture seulement quand quelque chose a vraiment changé. Jamais de KV. */
export const CLES_SYNC = Object.freeze(['rayle_lt_liste_v1', 'rayle_invest_plan_v1', 'rayle_tp_ma200h4_reglages', 'rayle_tp_fleches_alertes', 'rayle_pf_risque_v1', 'rayle_pf_positions_v1', 'rayle_alertes_silence_v1', 'rayle_briefing_reglage_v1']);
export const TAILLE_MAX_CLE = 60000;

export function nettoyerSync(corps, maintenant = Date.now()) {
  const out = {}; const C = corps && typeof corps === 'object' && corps.cles && typeof corps.cles === 'object' ? corps.cles : {};
  for (const k of CLES_SYNC) { const e = C[k]; if (!e || typeof e !== 'object') continue; const maj = Number(e.maj); if (!Number.isFinite(maj) || maj <= 0) continue;
    const texte = JSON.stringify(e.valeur === undefined ? null : e.valeur); if (texte.length > TAILLE_MAX_CLE) continue;
    out[k] = { valeur: e.valeur === undefined ? null : e.valeur, maj: Math.min(maj, maintenant + 5 * 60e3), appareil: typeof e.appareil === 'string' ? e.appareil.slice(0, 24) : '?' }; }
  return out;
}
/* serveur = { cles: {k: {valeur, maj, appareil}}, traces: [] } ; entrant = cles nettoyées ; renvoie { etat, changees[] } (changees = clés dont la valeur du serveur a changé) */
export function fusionnerSync(serveur, entrant, maintenant = Date.now()) {
  const etat = { cles: { ...(serveur && serveur.cles || {}) }, traces: [...(serveur && serveur.traces || [])] }, changees = [];
  for (const [k, e] of Object.entries(entrant || {})) {
    const s = etat.cles[k]; if (!s) { etat.cles[k] = e; changees.push(k); continue; }
    const memeValeur = JSON.stringify(s.valeur) === JSON.stringify(e.valeur); if (memeValeur) continue;
    if (e.maj > s.maj) { etat.cles[k] = e; changees.push(k); if (s.appareil !== e.appareil) etat.traces.push({ cle: k, t: maintenant, gagnant: e.appareil, perdant: s.appareil, ecart: e.maj - s.maj }); }
    else if (s.appareil !== e.appareil) etat.traces.push({ cle: k, t: maintenant, gagnant: s.appareil, perdant: e.appareil, ecart: s.maj - e.maj });
  }
  etat.traces = etat.traces.slice(-30); return { etat, changees };
}
/* route : GET /sync → { t, cles, traces } ; PUT /sync { cles } → idem après fusion. `depot` = dépôt D1 (kvLire / kvEcrire). */
export async function traiterSync(req, depot, lireCorps, maintenant = Date.now()) {
  const etat = (await depot.kvLire('sync')) || { cles: {}, traces: [] };
  if (req.method === 'GET') return { t: maintenant, cles: etat.cles, traces: etat.traces };
  const entrant = nettoyerSync(await lireCorps(req), maintenant), r = fusionnerSync(etat, entrant, maintenant);
  if (r.changees.length || r.etat.traces.length !== etat.traces.length) await depot.kvEcrire('sync', r.etat);   // aucune écriture si rien n'a changé
  return { t: maintenant, cles: r.etat.cles, traces: r.etat.traces, changees: r.changees };
}
