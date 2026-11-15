/* ═════════════ ALERTES DE PRIX PAR ACTIF (pures, testées) ═════════════
   Une alerte : { id, actif, sens: 'dessus' | 'dessous', niveau, creeLe, declenchee (ms) | null, prixDeclenchement }.
   Elles sont gardées sur l'appareil (localStorage) ; le Worker Portefeuille peut en garder une copie pour les envoyer aussi par Telegram quand l'appli est fermée. */
export const CLE_ALERTES = 'rayle_tp_alertes_v1';
export const MAX_ALERTES = 60;
export const nouvelleAlerte = (actif, sens, niveau, maintenant = Date.now()) => ({ id: 'a' + maintenant.toString(36) + Math.random().toString(36).slice(2, 6), actif: String(actif), sens, niveau: Number(String(niveau).replace(/\s/g, '').replace(',', '.')), creeLe: maintenant, declenchee: null, prixDeclenchement: null });
export function validerAlerte(a, prixActuel = null) {
  if (!a || !a.actif) return 'Choisir un actif.';
  if (a.sens !== 'dessus' && a.sens !== 'dessous') return 'Choisir « au-dessus » ou « sous ».';
  if (!Number.isFinite(a.niveau) || a.niveau <= 0) return 'Le niveau doit être un nombre positif.';
  if (Number.isFinite(prixActuel) && prixActuel > 0) {
    if (a.sens === 'dessus' && prixActuel >= a.niveau) return 'Le prix actuel est déjà au-dessus de ce niveau : l’alerte se déclencherait tout de suite.';
    if (a.sens === 'dessous' && prixActuel <= a.niveau) return 'Le prix actuel est déjà sous ce niveau : l’alerte se déclencherait tout de suite.';
  }
  return true;
}
/* prix = { [actif]: { prix, t } } ; renvoie les alertes mises à jour et celles qui viennent de se déclencher (une alerte ne se déclenche qu'une fois) */
export function evaluerAlertes(alertes, prix, maintenant = Date.now()) {
  const declenchees = [], out = alertes.map(a => {
    if (a.declenchee) return a; const p = prix && prix[a.actif] && prix[a.actif].prix; if (!Number.isFinite(p)) return a;
    if ((a.sens === 'dessus' && p >= a.niveau) || (a.sens === 'dessous' && p <= a.niveau)) { const b = { ...a, declenchee: maintenant, prixDeclenchement: p }; declenchees.push(b); return b; }
    return a;
  });
  return { alertes: out, declenchees };
}
export const texteAlerte = (a, nom, dec = 2) => `${nom || a.actif} est passé ${a.sens === 'dessus' ? 'au-dessus de' : 'sous'} ${a.niveau.toLocaleString('fr-FR')}${Number.isFinite(a.prixDeclenchement) ? ' (prix relevé : ' + a.prixDeclenchement.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ')' : ''}.`;
