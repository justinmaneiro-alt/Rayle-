/* Fenêtre « Fiabilité de Rayle » : son taux de réussite mesuré, par actif, par unité de temps et par type de situation, avec les dernières prévisions et leur verdict à +1, +3 et +5 jours.
   Honnêteté : moins de 5 cas = « trop tôt pour juger » ; les prévisions « neutres » (le prix n'a quasiment pas bougé) sont comptées à part. Lecture seule. */
import { lirePrevisions } from '../reseau/client.js';
import { statistiques, resumeParle, NOM_SITUATION, NOM_ACTIF, MIN_CAS, HORIZONS } from './previsions.js';
import { parler } from '../commun/ia.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = s => (s.n >= MIN_CAS ? `${Math.round(s.taux * 100)} %` : 'trop tôt');
const ligne = (nom, s) => `<tr><td>${esc(nom)}</td><td>${s.n}</td><td>${s.juste}</td><td>${s.faux}</td><td>${s.neutre}</td><td>${s.invalide}</td><td><b>${pct(s)}</b></td></tr>`;
const table = (titre, entrees) => (entrees.length ? `<h3>${esc(titre)}</h3><div class="tp-defil"><table class="tp-tab-hist"><thead><tr><th></th><th>Vérifiées</th><th>Juste</th><th>Faux</th><th>Neutre</th><th>Invalidé</th><th>Réussite</th></tr></thead><tbody>${entrees.join('')}</tbody></table></div>` : '');
const ICONE = { juste: '✓ juste', faux: '✗ faux', neutre: '≈ neutre', invalide: '⚠ invalidé' };
export function htmlFiabilite(liste, maintenant = Date.now()) {
  const st = statistiques(liste, maintenant); if (!st.total) return '<p class="tp-doux">Aucune prévision enregistrée pour le moment. Rayle en enregistre une par actif au plus toutes les 12 heures ; la première vérification arrive à +1 jour.</p>';
  return `<div class="tp-point-sec tp-visible"><h3>En clair</h3><p>${esc(resumeParle(st))}</p><p class="tp-doux">${st.total} prévisions enregistrées dont ${st.ouvertes} encore ouvertes. Verdict à +1, +3 et +5 jours : « juste » = le prix a avancé dans le sens du scénario d’au moins 0,25 ATR Daily ; « faux » = il a reculé d’autant ; « neutre » = il n’a presque pas bougé ; « invalidé » = une clôture H1 a franchi le niveau d’invalidation.</p></div>
    ${table('Par horizon', HORIZONS.map(k => ligne('à +' + k + ' jour' + (k > 1 ? 's' : ''), st.parHorizon['j' + k])))}
    ${table('Par actif (à +3 jours)', Object.entries(st.parActif).map(([k, s]) => ligne(NOM_ACTIF[k] || k, s)))}
    ${table('Par unité de temps (à +3 jours)', Object.entries(st.parUnite).map(([k, s]) => ligne(k === 'J' ? 'Daily et H4 alignés' : 'H4 (Daily non aligné)', s)))}
    ${table('Par type de situation (à +3 jours)', Object.entries(st.parSituation).map(([k, s]) => ligne(NOM_SITUATION[k] || k, s)))}
    <h3>Dernières prévisions</h3><ul class="tp-liste">${st.recentes.map(p => `<li><span>${esc(NOM_ACTIF[p.actif] || p.actif)} · ${p.sens > 0 ? 'hausse' : 'baisse'} · ${esc(new Date(p.t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}${p.inval ? ' · invalidation ' + esc(p.inval.nom) : ''}</span><span>${HORIZONS.map(k => `+${k} j : ${esc(ICONE[p.verifs['j' + k]] || 'en attente')}`).join(' · ')}</span></li>`).join('')}</ul>`;
}
let instance = null;
export async function ouvrirFiabilite({ liste = null, racine = document.body } = {}) {
  if (instance) instance.fermer(); const L = liste || await lirePrevisions();
  const el = document.createElement('section'); el.className = 'tp tp-point'; el.id = 'fiabilite-rayle'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Fiabilité de Rayle');
  el.innerHTML = `<header class="tp-tete"><b>Fiabilité de Rayle</b><button type="button" class="tp-lire" data-lire>Lire à voix haute</button><button type="button" data-fermer aria-label="Fermer">✕</button></header><main class="tp-corps">${htmlFiabilite(L)}</main>`; racine.appendChild(el);
  el.addEventListener('click', e => { if (e.target.closest('[data-fermer]')) { el.remove(); instance = null; } else if (e.target.closest('[data-lire]')) parler(resumeParle(statistiques(L))); });
  instance = { fermer: () => { el.remove(); instance = null; }, el }; return instance;
}
