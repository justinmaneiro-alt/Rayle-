/* Onglet « Aujourd'hui » : calendrier économique avec compte à rebours, prévu / précédent / publié, surprise colorée, filtres impact et actif. */
import { creerVue, esc, pastille, lireLS, ecrireLS } from '../commun/ui.js';
import { lireCalendrier, ACTIFS } from '../commun/donnees.js';
import { lireEvenements, filtrer, surprise, nombre, compteARebours, heureParis } from './calendrier.js';
import { noteAnnonce, scenariosAnnonce, conseilAnnonce, statsHistorique, mesurerAnnonce, cleType, familleDe } from './annonce.js';
import { htmlDetailAnnonce, texteExpliqueAnnonce, classeScore } from '../reseau/rendu.js';
import { lireAnnonces, lireFiches } from '../reseau/client.js';
import { lireActifPro } from '../commun/donnees.js';
import { parler } from '../commun/ia.js';

const jourParis = t => new Date(t).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: 'long' });
const cleJour = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

export function monter(zone) {
  const E = { histo: [], fiches: {}, detail: null, impacts: lireLS('tp_cal_impacts', ['fort']), actif: (v => (v === undefined ? 'or' : v))(lireLS('tp_cal_actif', undefined)), liste: [], meta: null, minuteur: null };
  zone.innerHTML = `<div class="tp-filtres" role="group" aria-label="Filtres du calendrier">
      <div class="tp-groupe" role="group" aria-label="Impact">${[['fort', 'Impact fort'], ['moyen', '+ Moyen'], ['faible', '+ Faible']].map(([k, n]) => `<button type="button" data-imp="${k}">${n}</button>`).join('')}</div>
      <div class="tp-groupe" role="group" aria-label="Actif"><button type="button" data-act="">Toutes devises</button>${ACTIFS.filter(a => a.id !== 'dxy').map(a => `<button type="button" data-act="${a.id}">${esc(a.nom)}</button>`).join('')}</div></div>
    <div data-liste class="tp-liste-zone"></div>`;
  const box = zone.querySelector('[data-liste]'), vue = creerVue(box);
  const niveauImpact = () => (E.impacts.includes('faible') ? 3 : E.impacts.includes('moyen') ? 2 : 1);
  const marquer = () => { zone.querySelectorAll('[data-imp]').forEach(b => b.setAttribute('aria-pressed', String({ fort: 1, moyen: 2, faible: 3 }[b.dataset.imp] <= niveauImpact()))); zone.querySelectorAll('[data-act]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.act || null) === E.actif))); };
  function dessiner() {
    if (!E.meta) return; if (E.detail) { box.innerHTML = detailAnnonce(E.detail); return; } marquer(); const now = Date.now(), L = filtrer(E.liste, { impacts: E.impacts, actif: E.actif, maintenant: now, depuisMs: 6 * 3600e3, max: 60 });
    const suivant = L.find(x => x.t > now), groupes = []; for (const x of L) { const k = cleJour(x.t); let g = groupes[groupes.length - 1]; if (!g || g.k !== k) groupes.push(g = { k, t: x.t, items: [] }); g.items.push(x); }
    const bloc = x => {
      const s = surprise(x), passe = x.t <= now, tag = x.impact === 'fort' ? 'tp-fort' : x.impact === 'moyen' ? 'tp-moyen' : 'tp-faible';
      const publie = x.actuel ? `<b>publié ${esc(x.actuel)}</b>` : (passe && x.t < now - 20 * 60e3 ? '<span class="tp-doux" title="La source gratuite ne fournit pas toujours le chiffre publié : voir le site de l’institut">publié : non fourni par la source</span>' : 'publié : à venir');
      const sur = s ? `<span class="tp-surprise ${s.sens === 'mieux' ? 'tp-hausse' : s.sens === 'moins bien' ? 'tp-baisse' : 'tp-neutre'}">${s.sens === 'conforme' ? 'conforme au consensus' : (s.sens === 'mieux' ? 'mieux' : 'moins bien') + ' que prévu (' + (s.ecart > 0 ? '+' : '−') + Math.abs(+s.ecart.toPrecision(3)).toLocaleString('fr-FR') + ')'}</span>` : '';
      const nt = noteAnnonce(x, { maintenant: now, histo: E.histo, fiches: E.fiches });
      return `<li class="tp-evt ${tag}${x === suivant ? ' tp-prochain' : ''}${passe ? ' tp-passe' : ''}"><span class="tp-cr" data-cr="${x.t}">${esc(compteARebours(x.t, now))}</span>
        <div><button type="button" class="tp-score ${classeScore(nt.score)}" data-evt="${x.t}|${esc(x.titre)}" title="Importance ${nt.score} sur 100 : ouvrir la page détail" aria-label="Importance ${nt.score} sur 100, ouvrir le détail">${nt.score}</button> <a href="#" data-evt="${x.t}|${esc(x.titre)}"><b>${esc(x.titre)}</b></a> <small>${esc(x.pays)} · ${esc(x.impact)}</small><div class="tp-heure">${esc(heureParis(x.t))} · heure de Paris</div>
        <div class="tp-vals">${x.precedent ? 'précédent <b>' + esc(x.precedent) + '</b>' : 'précédent —'} · ${x.prevu ? 'prévu <b>' + esc(x.prevu) + '</b>' : 'prévu non publié par la source'} · ${publie} ${sur}</div></div></li>`;
    };
    box.innerHTML = `${L.length ? groupes.map(g => `<h3 class="tp-jour">${esc(jourParis(g.t))}</h3><ul class="tp-evts">${g.items.map(bloc).join('')}</ul>`).join('') : '<p class="tp-doux">Aucune annonce de ce niveau pour ce filtre dans la semaine publiée par la source.</p>'}
      <p class="tp-doux">${pastille('Forex Factory (flux public de la semaine)', E.meta.t, { garde: E.meta.copie })} · le prévu est le consensus publié par la source ; le compte à rebours se met à jour seul.</p>`;
  }
  /* page détail d'une annonce : note, consensus, réaction historique mesurée, scénarios, conseil, réaction réelle après publication */
  function detailAnnonce(x) {
    const now = Date.now(), nt = noteAnnonce(x, { maintenant: now, histo: E.histo, fiches: E.fiches }), sc = scenariosAnnonce(x, { fiches: E.fiches, maintenant: now }), fam = familleDe(x.titre), k = cleType(x.titre, x.pays), stats = {};
    for (const a of fam.actifs) { const s = statsHistorique(E.histo, k, a, { exclure: x.t }); if (s.cas) stats[a] = s; }
    const conseil = conseilAnnonce(x, nt, { histo: E.histo, fiches: E.fiches, maintenant: now }); E.ctxAnn = { x, nt, sc, conseil };
    return htmlDetailAnnonce(x, { note: nt, scenarios: sc, conseil, stats, reactionReelle: E.reel && E.reel.t === x.t ? E.reel.m : null, fiches: E.fiches, now, nomFamille: fam.nom });
  }
  async function mesurerReel(x) {
    if (x.t > Date.now() - 20 * 60e3) return; const m = {}; await Promise.all(familleDe(x.titre).actifs.map(async a => { try { const d = (await lireActifPro(a, { delai: 8000 })).donnees, r = mesurerAnnonce(x.t, d.m15, Date.now()); if (Object.values(r).some(Number.isFinite)) m[a] = r; } catch (e) { /* actif sans instantané : ignoré */ } }));
    E.reel = { t: x.t, m }; if (E.detail && E.detail.t === x.t) dessiner();
  }
  zone.addEventListener('click', e => {
    const ev = e.target.closest('[data-evt]'); if (ev) { e.preventDefault(); const [t, ...r] = ev.dataset.evt.split('|'), x = E.liste.find(y => String(y.t) === t && y.titre === r.join('|')); if (x) { E.detail = x; dessiner(); mesurerReel(x); zone.scrollIntoView && zone.scrollIntoView({ block: 'start' }); } return; }
    if (e.target.closest('[data-retour]')) { E.detail = null; dessiner(); return; }
    if (e.target.closest('[data-explique-annonce]') && E.ctxAnn) { parler(texteExpliqueAnnonce(E.ctxAnn.x, E.ctxAnn.nt, E.ctxAnn.sc, E.ctxAnn.conseil)); return; }
    const i = e.target.closest('[data-imp]'), a = e.target.closest('[data-act]');
    if (i) { E.impacts = { fort: ['fort'], moyen: ['fort', 'moyen'], faible: ['fort', 'moyen', 'faible'] }[i.dataset.imp]; ecrireLS('tp_cal_impacts', E.impacts); dessiner(); }
    if (a) { E.actif = a.dataset.act || null; ecrireLS('tp_cal_actif', E.actif); dessiner(); }
  });
  vue.lire('calendrier', () => lireCalendrier(), (d, m) => { E.liste = lireEvenements(d); E.meta = m; dessiner(); });
  lireAnnonces().then(h => { E.histo = h; if (E.meta && !E.detail) dessiner(); }).catch(() => {}); lireFiches().then(f => { E.fiches = f; if (E.meta && !E.detail) dessiner(); }).catch(() => {});
  E.minuteur = setInterval(() => { if (document.hidden) return; const now = Date.now(); zone.querySelectorAll('[data-cr]').forEach(n => { n.textContent = compteARebours(+n.dataset.cr, now); }); }, 1000);   // (le détail d'une annonce n'a pas de compte à rebours : rien à mettre à jour)
  marquer();
  return { detruire() { clearInterval(E.minuteur); vue.detruire(); } };
}
export { nombre };
