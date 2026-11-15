/* Copie des alertes de prix vers le Worker Portefeuille (pour l'envoi par Telegram quand l'appli est fermée) et récupération de celles que le Worker a déclenchées.
   Sans Worker configuré : rien ne se passe, les alertes restent locales (voix + notification quand l'appli est ouverte). Jamais bloquant, jamais d'exception. */
import { lireConn } from './stockage.js';
import { lireLS, ecrireLS } from '../commun/ui.js';
import { CLE_ALERTES } from '../marches/alertes.js';

async function appel(methode, corps, fetchFn = (...a) => fetch(...a)) {
  const c = lireConn(); if (!c) return null;
  const r = await fetchFn(c.url + '/alertes', { method: methode, headers: { 'Content-Type': 'application/json', ...(c.code ? { 'X-Portefeuille-Code': c.code } : {}) }, body: corps ? JSON.stringify(corps) : undefined, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('le Worker a répondu ' + r.status); return r.json();
}
/* fusion : pour une même alerte, « déclenchée » l'emporte (qu'elle vienne de l'appareil ou du Worker) */
export function fusionnerAlertes(locales, distantes) {
  const m = new Map(locales.map(a => [a.id, a]));
  for (const d of distantes || []) { const l = m.get(d.id); if (!l) continue; if (!l.declenchee && d.declenchee) m.set(d.id, { ...l, declenchee: d.declenchee, prixDeclenchement: d.prixDeclenchement, envoyee: !!d.envoyee }); }
  return [...m.values()];
}
export async function synchroniserAlertes({ fetchFn } = {}) {
  try {
    if (!lireConn()) return { ok: false, horsConfig: true };
    const d = await appel('GET', null, fetchFn), fus = fusionnerAlertes(lireLS(CLE_ALERTES, []), d.alertes); ecrireLS(CLE_ALERTES, fus);
    await appel('PUT', { alertes: fus }, fetchFn); return { ok: true, n: fus.length };
  } catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
}
let branche = false;
export function brancherSynchroAlertes() {
  if (branche || typeof document === 'undefined') return; branche = true; let t = null;
  document.addEventListener('tp:alertes-changees', () => { clearTimeout(t); t = setTimeout(() => { synchroniserAlertes(); }, 1500); });
  setTimeout(() => { synchroniserAlertes(); }, 3000);
}
