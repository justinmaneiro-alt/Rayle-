/* Onglet « COT » (CFTC, données gratuites, hebdomadaires) : positions nettes des spéculateurs et des commerciaux superposées au prix, COT Index 0-100 sur 3 ans avec zones extrêmes,
   variation hebdomadaire en barres, open interest, lecture en clair. Actifs : or, Nasdaq 100, S&P 500, dollar, Bitcoin. */
import { creerVue, esc, nf, pastille, lireLS, ecrireLS } from '../commun/ui.js';
import { parId, lireCot, lireActifPro } from '../commun/donnees.js';
import { monterGraphique, COULEURS } from '../commun/graph.js';
import { analyserCot, lectureCot, ZONE_HAUTE, ZONE_BASSE, formatContrats, formatVariation } from './cot.js';

export const ACTIFS_COT = ['or', 'us100', 'us500', 'dxy', 'btc'];
/* prix de clôture le plus récent à la date du COT (ou juste avant) : jamais de valeur du futur */
export function prixAuxDates(dates, jours) {
  const out = []; let k = 0;
  for (const d of dates) { const t = Date.parse(d + 'T23:59:59Z'); while (k + 1 < jours.length && jours[k + 1].t <= t) k++; out.push(jours.length && jours[k].t <= t ? jours[k].c : null); }
  return out;
}
export function monter(zone) {
  const E = { id: lireLS('tp_cot_actif', 'or'), graph: null, seq: 0, vue: null };
  if (!ACTIFS_COT.includes(E.id)) E.id = 'or';
  zone.innerHTML = `<div class="tp-chips" role="tablist" aria-label="Actif COT">${ACTIFS_COT.map(id => `<button type="button" role="tab" data-actif="${id}">${esc(parId[id].nom)}</button>`).join('')}</div><div data-cot></div>`;
  const cible = zone.querySelector('[data-cot]');
  const marquer = () => zone.querySelectorAll('[data-actif]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.actif === E.id)));
  function nettoyer() { E.seq++; if (E.graph) { E.graph.detruire(); E.graph = null; } if (E.vue) E.vue.detruire(); }
  function ouvrir(id) {
    nettoyer(); E.id = id; ecrireLS('tp_cot_actif', id); marquer(); const a = parId[id], n = E.seq; E.vue = creerVue(cible);
    E.vue.lire('cotpro|' + id, async () => {
      const [c, p] = await Promise.all([lireCot(a.cot), lireActifPro(id).catch(() => null)]);
      return { t: c.t, origine: c.origine, horsLigne: c.horsLigne, donnees: { cot: c.donnees, prix: p ? p.donnees.j : null, prixSource: p ? p.donnees.source : null } };
    }, (D, m) => { if (n === E.seq) rendre(D, m, a, n); });
  }
  async function rendre(D, m, a, n) {
    const an = analyserCot(D.cot); if (!an) { cible.innerHTML = '<p class="tp-panne" role="alert">Pas assez de semaines de COT publiées pour cet actif.</p>'; return; }
    const d = an.dernier, extreme = d.extremeSpec === 'haut' ? '<span class="tp-baisse">extrême acheteur</span>' : d.extremeSpec === 'bas' ? '<span class="tp-hausse">extrême vendeur</span>' : '';
    cible.innerHTML = `<article class="tp-carte"><header class="tp-entete"><b>${esc(a.nom)}</b><span class="tp-doux">${esc(an.libelle)}</span></header>
      <p class="tp-lecture">${esc(lectureCot(an, a.nom))}</p>
      <div class="tp-cartes"><div><small>${esc(an.nomSpec)}</small><b>${formatContrats(d.spec)}</b><span>net · ${esc(formatVariation(d.varSpec))} sur la semaine</span></div>
        <div><small>COT Index (3 ans)</small><b>${d.indexSpec == null ? '—' : d.indexSpec}</b><span>${extreme || (d.indexSpec == null ? 'historique trop court' : 'pas d’extrême')}</span></div>
        <div><small>${esc(an.nomComm)}</small><b>${formatContrats(d.comm)}</b><span>net · ${esc(formatVariation(d.varComm))}</span></div>
        <div><small>Open interest</small><b>${formatContrats(d.oi)}</b><span>${esc(formatVariation(d.varOi))} sur la semaine</span></div></div>
      <div class="tp-graph" data-g></div><p class="tp-doux" data-leg></p>
      <p class="tp-doux">${pastille(an.source, m.t, { garde: m.copie })} · positions mesurées le mardi, publiées le vendredi ; en haut : positions nettes (échelle de gauche) et prix de clôture (échelle de droite) ; puis COT Index avec zones ${ZONE_BASSE} / ${ZONE_HAUTE} ; puis variation hebdomadaire des spéculateurs ; puis open interest.</p></article>`;
    try {
      const G = await monterGraphique(cible.querySelector('[data-g]'), { hauteur: 620, intraday: false, dec: 0, gauche: true, droite: true }); if (n !== E.seq) { G.detruire(); return; } E.graph = G;
      const pts = (cle, f = x => x) => an.dates.map((dt, i) => ({ d: dt, v: f(an[cle][i], i) })).filter(p => p.v != null);
      G.ligne(pts('spec'), { couleur: COULEURS.accent, echelle: 'left', titre: 'Spéculateurs nets', pane: 0, format: { type: 'volume' } }); G.ligne(pts('comm'), { couleur: COULEURS.orange, echelle: 'left', titre: 'Commerciaux nets', pane: 0, format: { type: 'volume' } });
      if (D.prix) { const px = prixAuxDates(an.dates, D.prix); G.ligne(an.dates.map((dt, i) => ({ d: dt, v: px[i] })).filter(p => p.v != null), { couleur: COULEURS.or, echelle: 'right', titre: 'Prix', pane: 0, dec: a.dec }); }
      const si = G.ligne(pts('indexSpec'), { couleur: COULEURS.accent, titre: 'Index spéculateurs', pane: 1, format: { type: 'price', precision: 0, minMove: 1 } }); G.ligne(pts('indexComm'), { couleur: COULEURS.orange, titre: 'Index commerciaux', pane: 1, format: { type: 'price', precision: 0, minMove: 1 } });
      G.niveau(si, ZONE_HAUTE, { couleur: COULEURS.baisse, titre: 'zone haute', style: 2 }); G.niveau(si, ZONE_BASSE, { couleur: COULEURS.hausse, titre: 'zone basse', style: 2 });
      G.histo(an.barres.filter(b => b.spec != null).map(b => ({ d: b.date, v: b.spec })), { pane: 2, echelle: 'right', format: { type: 'volume' } });
      G.ligne(pts('oi'), { couleur: COULEURS.violet, titre: 'Open interest', pane: 3, format: { type: 'volume' } });
      try { const P = G.chart.panes(); if (P[0]) P[0].setStretchFactor(3); if (P[1]) P[1].setStretchFactor(1.4); if (P[2]) P[2].setStretchFactor(1.1); if (P[3]) P[3].setStretchFactor(1); } catch (e) { /* hauteurs par défaut */ }
      G.ajuster(); cible.querySelector('[data-leg]').textContent = D.prix ? 'Prix : ' + (D.prixSource || '') : 'Prix indisponible : seules les positions sont tracées.';
    } catch (e) { cible.querySelector('[data-g]').innerHTML = '<p class="tp-panne" role="alert">Graphique indisponible : ' + esc(e && e.message || e) + '</p>'; }
  }
  zone.addEventListener('click', e => { const a = e.target.closest('[data-actif]'); if (a) ouvrir(a.dataset.actif); });
  ouvrir(E.id);
  return { detruire() { nettoyer(); }, ouvrir, resume: () => { const el = cible.querySelector('.tp-lecture'); return el ? el.textContent : ''; } };
}
export { nf };
