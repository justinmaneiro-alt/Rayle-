/* Alertes des zones tracées (phase D, terminal pro) : retest après cassure et réglages par zone. Pur, causal, sans dépendance.
   Retest (règle zones-alertes-v1, écrite avant le code) : après une cassure confirmée, première bougie H1 close, au plus 48 bougies plus tard,
   dont la mèche touche le niveau cassé. Arrêt sans retest si une clôture revient de l'autre côté du niveau d'au moins 0,5 ATR (cassure ratée).
   Les règles figées v10 (approche, touche, rebond, cassure) ne sont PAS modifiées : le retest s'ajoute après elles. */
export const RETEST = Object.freeze({ version: 'zones-alertes-v1', fenetre: 48, echecAtr: 0.5 });
export function detecterRetests(C, ev, A, R = RETEST) {
  const out = [], idx = new Map(C.map((b, i) => [b.t, i]));
  for (const e of ev) {
    if (e.type !== 'cassure') continue; const i = idx.get(e.t); if (i == null) continue;
    const haussier = e.cote === 'resistance', n = e.niveau; if (!(n > 0)) continue;
    for (let j = i + 1; j < C.length && j <= i + R.fenetre; j++) {
      const b = C[j], a = A && A[j - 1] || e.atr || 0;
      if (b.l <= n && b.h >= n) { out.push({ id: `${e.objet}|retest|${b.t}`, objet: e.objet, outil: e.outil, type: 'retest', t: b.t, prix: b.c, niveau: n, cote: e.cote, atr: a, depuis: e.t, sens: haussier ? 'hausse' : 'baisse' }); break; }
      if (haussier ? b.c <= n - R.echecAtr * a : b.c >= n + R.echecAtr * a) break;
    }
  }
  return out;
}
/* faut-il annoncer à voix haute ? muet = jamais ; repete === false = une seule annonce par type et par zone */
export function autoriser(o, e, dejaAnnonces) {
  if (!o) return true; if (o.muet) return false;
  if (o.repete === false && dejaAnnonces.has(`${e.objet}|${e.type}`)) return false; return true;
}
export function resumeJournal(alertes, n = 60) { return alertes.slice(0, n).map(a => ({ heure: a.heure, type: a.type, prix: a.prix, objet: a.objet, dit: a.dit })); }
