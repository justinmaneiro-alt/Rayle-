/* Onglet « Aujourd'hui » : calendrier économique avec compte à rebours, prévu / précédent / publié, surprise colorée, filtres impact et actif. */
import { creerVue, esc, pastille, lireLS, ecrireLS } from '../commun/ui.js';
import { lireCalendrier, ACTIFS } from '../commun/donnees.js';
import { lireEvenements, filtrer, surprise, nombre, compteARebours, heureParis } from './calendrier.js';

const jourParis = t => new Date(t).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: 'long' });
const cleJour = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

export function monter(zone) {
  const E = { impacts: lireLS('tp_cal_impacts', ['fort']), actif: (v => (v === undefined ? 'or' : v))(lireLS('tp_cal_actif', undefined)), liste: [], meta: null, minuteur: null };
  zone.innerHTML = `<div class="tp-filtres" role="group" aria-label="Filtres du calendrier">
      <div class="tp-groupe" role="group" aria-label="Impact">${[['fort', 'Impact fort'], ['moyen', '+ Moyen'], ['faible', '+ Faible']].map(([k, n]) => `<button type="button" data-imp="${k}">${n}</button>`).join('')}</div>
      <div class="tp-groupe" role="group" aria-label="Actif"><button type="button" data-act="">Toutes devises</button>${ACTIFS.filter(a => a.id !== 'dxy').map(a => `<button type="button" data-act="${a.id}">${esc(a.nom)}</button>`).join('')}</div></div>
    <div data-liste class="tp-liste-zone"></div>`;
  const box = zone.querySelector('[data-liste]'), vue = creerVue(box);
  const niveauImpact = () => (E.impacts.includes('faible') ? 3 : E.impacts.includes('moyen') ? 2 : 1);
  const marquer = () => { zone.querySelectorAll('[data-imp]').forEach(b => b.setAttribute('aria-pressed', String({ fort: 1, moyen: 2, faible: 3 }[b.dataset.imp] <= niveauImpact()))); zone.querySelectorAll('[data-act]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.act || null) === E.actif))); };
  function dessiner() {
    if (!E.meta) return; marquer(); const now = Date.now(), L = filtrer(E.liste, { impacts: E.impacts, actif: E.actif, maintenant: now, depuisMs: 6 * 3600e3, max: 60 });
    const suivant = L.find(x => x.t > now), groupes = []; for (const x of L) { const k = cleJour(x.t); let g = groupes[groupes.length - 1]; if (!g || g.k !== k) groupes.push(g = { k, t: x.t, items: [] }); g.items.push(x); }
    const bloc = x => {
      const s = surprise(x), passe = x.t <= now, tag = x.impact === 'fort' ? 'tp-fort' : x.impact === 'moyen' ? 'tp-moyen' : 'tp-faible';
      const publie = x.actuel ? `<b>publié ${esc(x.actuel)}</b>` : (passe && x.t < now - 20 * 60e3 ? '<span class="tp-doux" title="La source gratuite ne fournit pas toujours le chiffre publié : voir le site de l’institut">publié : non fourni par la source</span>' : 'publié : à venir');
      const sur = s ? `<span class="tp-surprise ${s.sens === 'mieux' ? 'tp-hausse' : s.sens === 'moins bien' ? 'tp-baisse' : 'tp-neutre'}">${s.sens === 'conforme' ? 'conforme au consensus' : (s.sens === 'mieux' ? 'mieux' : 'moins bien') + ' que prévu (' + (s.ecart > 0 ? '+' : '−') + Math.abs(+s.ecart.toPrecision(3)).toLocaleString('fr-FR') + ')'}</span>` : '';
      return `<li class="tp-evt ${tag}${x === suivant ? ' tp-prochain' : ''}${passe ? ' tp-passe' : ''}"><span class="tp-cr" data-cr="${x.t}">${esc(compteARebours(x.t, now))}</span>
        <div><b>${esc(x.titre)}</b> <small>${esc(x.pays)} · ${esc(x.impact)}</small><div class="tp-heure">${esc(heureParis(x.t))} · heure de Paris</div>
        <div class="tp-vals">${x.precedent ? 'précédent <b>' + esc(x.precedent) + '</b>' : 'précédent —'} · ${x.prevu ? 'prévu <b>' + esc(x.prevu) + '</b>' : 'prévu non publié par la source'} · ${publie} ${sur}</div></div></li>`;
    };
    box.innerHTML = `${L.length ? groupes.map(g => `<h3 class="tp-jour">${esc(jourParis(g.t))}</h3><ul class="tp-evts">${g.items.map(bloc).join('')}</ul>`).join('') : '<p class="tp-doux">Aucune annonce de ce niveau pour ce filtre dans la semaine publiée par la source.</p>'}
      <p class="tp-doux">${pastille('Forex Factory (flux public de la semaine)', E.meta.t, { garde: E.meta.copie })} · le prévu est le consensus publié par la source ; le compte à rebours se met à jour seul.</p>`;
  }
  zone.addEventListener('click', e => {
    const i = e.target.closest('[data-imp]'), a = e.target.closest('[data-act]');
    if (i) { E.impacts = { fort: ['fort'], moyen: ['fort', 'moyen'], faible: ['fort', 'moyen', 'faible'] }[i.dataset.imp]; ecrireLS('tp_cal_impacts', E.impacts); dessiner(); }
    if (a) { E.actif = a.dataset.act || null; ecrireLS('tp_cal_actif', E.actif); dessiner(); }
  });
  vue.lire('calendrier', () => lireCalendrier(), (d, m) => { E.liste = lireEvenements(d); E.meta = m; dessiner(); });
  E.minuteur = setInterval(() => { if (document.hidden) return; const now = Date.now(); zone.querySelectorAll('[data-cr]').forEach(n => { n.textContent = compteARebours(+n.dataset.cr, now); }); }, 1000);
  marquer();
  return { detruire() { clearInterval(E.minuteur); vue.detruire(); } };
}
export { nombre };
