/* ═════════════ FORMATS (partagé moteur + affichage) ═════════════
   Affichage français (« 2 263,56 », espace fine insécable) ; COPIE brute (« 2263.56 » : point, ni espace ni virgule) ; heures en Europe/Paris.
   Aucun calcul de P&L ici : on ne fait que mettre en forme des chiffres déjà calculés par le moteur. */
import { PAR_ID } from './actifs.js';

const ESP = ' ';
function grouper(entier) { return entier.replace(/\B(?=(\d{3})+(?!\d))/g, ESP); }

/* nombre → « 12 345,67 » avec n décimales (arrondi au plus proche, demi vers le haut en valeur absolue) */
export function fmtNombre(x, n = 2) {
  if (x == null || !Number.isFinite(Number(x))) return '—';
  const v = Number(x), s = Math.abs(v).toFixed(n), [e, d] = s.split('.');
  return (v < 0 && Number(s) !== 0 ? '−' : '') + grouper(e) + (d ? ',' + d : '');
}
export const decimalesPrix = actif => (PAR_ID[actif] ? PAR_ID[actif].decimales : 2);
export const decimalesLot = actif => { const l = PAR_ID[actif] ? PAR_ID[actif].lot : 0.001; return Math.max(0, Math.round(-Math.log10(l))); };
export const fmtPrix = (actif, p) => fmtNombre(p, decimalesPrix(actif));
export const fmtQte = (actif, q) => fmtNombre(q, decimalesLot(actif));
export function fmtUSD(x, n = 2, signe = false) {
  if (x == null || !Number.isFinite(Number(x))) return '—';
  const s = fmtNombre(x, n);
  return (signe && Number(x) > 0 ? '+' : '') + s + ESP + '$';
}
export const fmtR = r => (r == null || !Number.isFinite(r) ? '—' : (r > 0 ? '+' : '') + fmtNombre(r, 2) + ' R');
export const fmtPct = (x, n = 2, signe = true) => (x == null || !Number.isFinite(x) ? '—' : (signe && x > 0 ? '+' : '') + fmtNombre(x, n) + ESP + '%');

/* COPIE : format brut pour coller dans une plateforme (2263.56) — jamais d'espace, jamais de virgule, jamais de signe + */
export function fmtCopie(x, n) {
  if (x == null || !Number.isFinite(Number(x))) return '';
  const s = Number(x).toFixed(n == null ? 8 : n);
  return n == null ? s.replace(/\.?0+$/, '') : s;
}
export const copiePrix = (actif, p) => fmtCopie(p, decimalesPrix(actif));
export const copieQte = (actif, q) => fmtCopie(q, decimalesLot(actif));

const FMT_H = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
const FMT_HS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const FMT_DH = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
export const heureParis = (t, sec = false) => (t ? (sec ? FMT_HS : FMT_H).format(new Date(t)) : '—');   // formateurs créés une fois : même texte que toLocaleTimeString, bien plus rapide
export const dateHeureParis = t => (t ? FMT_DH.format(new Date(t)) : '—');
export function fmtDuree(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000), j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (j) return j + ' j ' + h + ' h'; if (h) return h + ' h ' + String(m).padStart(2, '0'); if (m) return m + ' min'; return s + ' s';
}
