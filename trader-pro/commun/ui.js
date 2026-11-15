/* ═════════════ OUTILS D'INTERFACE COMMUNS DES FENÊTRES PRO ═════════════ */
import { phraseAge } from '../../agent-trading/front/donnees/couche.js';
import { lectureProgressive } from './donnees.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nf = (v, dec = 2) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/[  ]/g, ' ') : '—');
export const pct = (v, dec = 2) => (Number.isFinite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %' : '—');
export const cls = v => (v > 0 ? 'tp-hausse' : v < 0 ? 'tp-baisse' : 'tp-neutre');
export const age = (t, maintenant = Date.now()) => (Number.isFinite(t) ? phraseAge(Math.max(0, maintenant - t)) : 'âge inconnu');
export const dateCourte = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
export const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage plein ou interdit */ } };

/* pastille « source · âge » : toujours présente à côté d'un chiffre */
export const pastille = (source, t, { garde = false } = {}) => `<span class="tp-src" title="${esc(source)}">${esc(String(source).split(' ; ')[0])} · ${esc(age(t))}${garde ? ' · copie locale' : ''}</span>`;

/* Une zone qui ne reste jamais sur « Chargement… » :
   vue.lire(cle, lecteur, rendre) → affiche la copie locale tout de suite, puis la donnée fraîche ; panne = message + bouton Réessayer (ou bandeau si une copie est affichée). */
export function creerVue(zone, { delai } = {}) {
  let n = 0, detruit = false;
  const lancer = (cle, lecteur, rendre) => {
    const mien = ++n; let rendu = false;
    if (!zone.firstChild) zone.innerHTML = '<p class="tp-att" role="status">Lecture des données…</p>';
    lectureProgressive(cle, lecteur, m => {
      if (detruit || mien !== n) return;
      if (m.statut === 'erreur') {
        if (rendu) { let b = zone.querySelector('.tp-bandeau'); if (!b) { b = document.createElement('p'); b.className = 'tp-bandeau'; b.setAttribute('role', 'alert'); zone.prepend(b); } b.innerHTML = 'Actualisation impossible (' + esc(m.erreur) + '). Données affichées : dernière copie. <button type="button" data-reessayer>Réessayer</button>'; return; }
        zone.innerHTML = `<p class="tp-panne" role="alert">${esc(m.erreur)} — aucune donnée à afficher pour le moment. <button type="button" data-reessayer>Réessayer</button></p>`; return;
      }
      rendu = true; try { rendre(m.donnees, { t: m.t, origine: m.origine, copie: m.statut === 'cache', horsLigne: m.horsLigne }); } catch (e) { zone.innerHTML = `<p class="tp-panne" role="alert">Affichage impossible : ${esc(e && e.message || e)} <button type="button" data-reessayer>Réessayer</button></p>`; console.warn('[tp] rendu', cle, e); }
    }, { delai });
    zone._relancer = () => lancer(cle, lecteur, rendre);
  };
  zone.addEventListener('click', e => { if (e.target.closest('[data-reessayer]') && zone._relancer) { zone.innerHTML = ''; zone._relancer(); } });
  return { lire: lancer, detruire: () => { detruit = true; n++; } };
}
