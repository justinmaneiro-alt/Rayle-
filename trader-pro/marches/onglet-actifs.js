/* Onglet « Actifs » : un vrai graphique (M15 / H1 / H4 / J), tendance par unité de temps, RSI, MA200 H4 et J, niveaux clés, annonces et actualités liées, COT.
   Chaque bloc se charge SEUL (pas d'attente commune) et ne reste jamais sur « Chargement… ». */
import { creerVue, esc, nf, pct, cls, pastille, age, lireLS, ecrireLS } from '../commun/ui.js';
import { ACTIFS, parId, lireActifPro, lireCalendrier, lireActus, lireCot, prixOr } from '../commun/donnees.js';
import { monterGraphique, COULEURS } from '../commun/graph.js';
import { rsi, tendance, niveauxCles, serieSma, projeter, fusionnerNiveaux, atr, dernier, H, J } from '../commun/analyse.js';
import { lireEvenements, filtrer, compteARebours, heureParis } from './calendrier.js';
import { analyserCot, lectureCot } from './cot.js';

const TF = Object.freeze({ M15: { nom: 'M15', pas: 15 * 60e3, cle: 'm15', n: 220 }, H1: { nom: 'H1', pas: H, cle: 'h1', n: 200 }, H4: { nom: 'H4', pas: 4 * H, cle: 'h4', n: 180 }, J: { nom: 'Jour', pas: J, cle: 'j', n: 220 } });

/* lecture complète d'un actif à partir de son instantané pro : tout est calculé ici, une seule fois */
export function analyserActif(d, maintenant = Date.now()) {
  const B = { M15: d.m15, H1: d.h1, H4: d.h4, J: d.j }, T = {}, R = {};
  for (const k of Object.keys(B)) { T[k] = tendance(B[k]); const r = dernier(rsi(B[k].map(b => b.c), 14)); R[k] = r == null ? null : r; }
  const ma4 = serieSma(B.H4, 200), maJ = serieSma(B.J, 200), prix = Number.isFinite(d.prix) ? d.prix : (B.H1.length ? B.H1[B.H1.length - 1].c : null);
  const nJ = niveauxCles(B.J, { max: 3, fenetre: 300 }), n4 = niveauxCles(B.H4, { max: 3, fenetre: 300 });
  const aJ = dernier(atr(B.J, 14)), a4 = dernier(atr(B.H4, 14));
  const lj = B.J.length ? B.J[B.J.length - 1] : null, veille = lj && B.J.length > 1 && maintenant - lj.t < 24 * H ? B.J[B.J.length - 2].c : (lj ? lj.c : null);
  return { prix, veille, variation: prix != null && veille ? (prix / veille - 1) * 100 : null, tendances: T, rsi: R, ma200H4: ma4.length ? ma4[ma4.length - 1].v : null, ma200J: maJ.length ? maJ[maJ.length - 1].v : null, ma4, maJ, niveauxJ: nJ, niveauxH4: n4, atrJ: aJ, atrH4: a4 };
}
/* niveaux à afficher : les plus forts du Jour d'abord, puis du H4, fusionnés (≥ 1 ATR H4 d'écart), 3 au plus de chaque côté */
export function niveauxAffiches(an, prix) {
  const marque = (L, t) => L.map(x => ({ ...x, etiquette: t, cote: x.prix > prix ? 'R' : 'S' }));
  const sep = an.atrH4 || an.atrJ || 1, tous = fusionnerNiveaux([marque([...an.niveauxJ.resistances, ...an.niveauxJ.supports], 'J'), marque([...an.niveauxH4.resistances, ...an.niveauxH4.supports], 'H4')], sep);
  const R = tous.filter(x => x.prix > prix).sort((a, b) => a.prix - b.prix).slice(0, 3), S = tous.filter(x => x.prix <= prix).sort((a, b) => b.prix - a.prix).slice(0, 3);
  return [...R.map((x, i) => ({ ...x, nom: 'R' + (i + 1) })), ...S.map((x, i) => ({ ...x, nom: 'S' + (i + 1) }))];
}
const sens = s => (s === 'haussière' ? 'tp-hausse' : s === 'baissière' ? 'tp-baisse' : 'tp-neutre');

export function monter(zone, ctx = {}) {
  const E = { id: lireLS('tp_actif', 'or'), tf: lireLS('tp_tf', 'H4'), d: null, an: null, graph: null, vues: [], seq: 0 };
  if (!parId[E.id]) E.id = 'or';
  zone.innerHTML = `<div class="tp-chips" role="tablist" aria-label="Actif">${ACTIFS.map(a => `<button type="button" role="tab" data-actif="${a.id}">${esc(a.nom)}</button>`).join('')}</div><div data-fiche></div>`;
  const fiche = zone.querySelector('[data-fiche]');
  const marquer = () => zone.querySelectorAll('[data-actif]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.actif === E.id)));

  function nettoyer() { E.seq++; if (E.graph) { E.graph.detruire(); E.graph = null; } E.vues.forEach(v => v.detruire()); E.vues = []; }
  function ouvrir(id) {
    nettoyer(); E.id = id; ecrireLS('tp_actif', id); marquer(); const a = parId[id], n = E.seq;
    fiche.innerHTML = `<article class="tp-carte"><header class="tp-entete"><b>${esc(a.nom)}</b><span class="tp-prix" data-prix>—</span><span class="tp-var" data-var></span></header><p class="tp-doux" data-src></p>
      <div class="tp-tfs" role="group" aria-label="Unité de temps">${Object.values(TF).map(t => `<button type="button" data-tf="${t.nom === 'Jour' ? 'J' : t.nom}">${esc(t.nom)}</button>`).join('')}</div>
      <div class="tp-graph" data-graph aria-label="Graphique"></div><p class="tp-doux" data-legende></p>
      <div data-tendance></div><h4>Annonces liées (impact fort)</h4><div data-annonces></div><h4>Actualités liées</h4><div data-actus></div><h4>Positions des fonds (COT)</h4><div data-cot></div></article>`;
    const q = s => fiche.querySelector(s);
    /* prix : l'or a UN seul prix (Kraken PF_XAUUSD) dans toute l'appli */
    if (id === 'or') prixOr().then(p => { if (n !== E.seq || !p) return; E.prixOr = p; majPrix(); }).catch(() => {});
    /* bloc 1 : graphique + tendance (instantané pro) */
    const v1 = creerVue(q('[data-tendance]')); E.vues.push(v1);
    v1.lire('pro|' + id, () => lireActifPro(id), (d, m) => { if (n !== E.seq) return; E.d = d; E.an = analyserActif(d); E.meta = m; majPrix(); tendanceHtml(q('[data-tendance]'), d, E.an, m); dessiner(n); });
    /* blocs 2, 3, 4 : indépendants du graphique */
    const v2 = creerVue(q('[data-annonces]')); E.vues.push(v2);
    v2.lire('cal', () => lireCalendrier(), (d, m) => { if (n !== E.seq) return; const L = filtrer(lireEvenements(d), { impacts: ['fort'], actif: id, max: 5 }), now = Date.now();
      q('[data-annonces]').innerHTML = L.length ? `<ul class="tp-liste">${L.map(x => `<li class="tp-evt-ligne"><span><b>${esc(x.titre)}</b> <small>${esc(x.pays)}</small></span><span class="tp-meta"><span class="tp-cr" data-cr="${x.t}">${esc(compteARebours(x.t, now))}</span> <small>${esc(heureParis(x.t))}</small></span></li>`).join('')}</ul>` : '<p class="tp-doux">Aucune annonce majeure à venir pour ce marché cette semaine.</p>'; });
    const v3 = creerVue(q('[data-actus]')); E.vues.push(v3);
    v3.lire('actus', () => lireActus('marches'), (d, m) => { if (n !== E.seq) return; const L = (d.items || []).filter(x => a.mots.test(`${x.titre} ${x.resume || ''}`)).slice(0, 6);
      q('[data-actus]').innerHTML = (L.length ? `<ul class="tp-liste">${L.map(x => `<li><a href="${/^https?:\/\//.test(x.lien || '') ? esc(x.lien) : '#'}" target="_blank" rel="noopener noreferrer">${esc(x.titre)}</a> <small>${esc(x.source || '')}${x.date ? ' · ' + esc(age(x.date)) : ''}</small></li>`).join('')}</ul>` : '<p class="tp-doux">Aucune actualité récente sur cet actif dans les sources suivies.</p>') + `<p class="tp-doux">${pastille('flux publics (CNBC, Fed, BCE, WGC…)', m.t, { garde: m.copie })}</p>`; });
    const v4 = creerVue(q('[data-cot]')); E.vues.push(v4);
    v4.lire('cot|' + a.cot, () => lireCot(a.cot), (d, m) => { if (n !== E.seq) return; const an = analyserCot(d); q('[data-cot]').innerHTML = `<p>${esc(lectureCot(an, a.nom))}</p><p class="tp-doux">${pastille(d.source || 'CFTC', m.t, { garde: m.copie })}</p>`; });
    fiche.querySelectorAll('[data-tf]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tf === E.tf)));
  }
  function majPrix() {
    const a = parId[E.id], p = E.id === 'or' && E.prixOr ? E.prixOr.prix : (E.an && E.an.prix), pv = E.an && E.an.veille;
    const v = E.id === 'or' && E.prixOr && Number.isFinite(E.prixOr.pct) ? E.prixOr.pct : (Number.isFinite(p) && pv ? (p / pv - 1) * 100 : null), el = fiche.querySelector('[data-prix]'), ev = fiche.querySelector('[data-var]'), es = fiche.querySelector('[data-src]'); if (!el) return;
    el.textContent = Number.isFinite(p) ? nf(p, a.dec) : '—'; ev.textContent = v == null ? '' : pct(v); ev.className = 'tp-var ' + cls(v);
    const src = E.id === 'or' && E.prixOr ? E.prixOr : (E.d ? { source: E.d.source, t: E.d.tPrix || E.d.t, note: '' } : null);
    es.innerHTML = src ? `${pastille(src.source, src.t, { garde: !!(E.meta && E.meta.copie) })}${src.note ? '<br><span class="tp-avert">' + esc(src.note) + '</span>' : ''}` : '';
  }
  async function dessiner(n) {
    const d = E.d, an = E.an; if (!d || !an) return; const a = parId[E.id], t = TF[E.tf], B = d[t.cle]; const box = fiche.querySelector('[data-graph]'), leg = fiche.querySelector('[data-legende]'); if (!box) return;
    if (!B || B.length < 20) { box.innerHTML = '<p class="tp-doux">Pas assez de bougies pour cette unité de temps.</p>'; return; }
    try {
      const G = await monterGraphique(box, { hauteur: 280, intraday: E.tf !== 'J', dec: a.dec }); if (n !== E.seq) { G.detruire(); return; }
      if (E.graph) E.graph.detruire(); E.graph = G; const s = G.bougies(B);
      const ma4 = E.tf === 'H4' ? an.ma4 : E.tf === 'J' ? [] : projeter(an.ma4, TF.H4.pas, B), maJ = E.tf === 'J' ? an.maJ : projeter(an.maJ, J, B);
      if (E.tf !== 'J' && ma4.length) G.ligne(ma4, { couleur: COULEURS.or, epaisseur: 1.5, titre: 'MA200 H4', horsEchelle: true });
      if (maJ.length) G.ligne(maJ, { couleur: COULEURS.violet, epaisseur: 1.5, titre: 'MA200 J', horsEchelle: true });
      const prix = an.prix ?? B[B.length - 1].c; for (const x of niveauxAffiches(an, prix)) G.niveau(s, x.prix, { couleur: x.cote === 'R' ? COULEURS.baisse : COULEURS.hausse, titre: `${x.nom} ${x.etiquette}`, style: 2 });
      G.montrerDerniers(t.n, B.length);
      const m4 = an.ma200H4, mj = an.ma200J, ecart = (m, p) => (m && p ? ((p / m - 1) * 100) : null);
      leg.innerHTML = `Bougies ${esc(t.nom)} (heure de Paris${E.tf === 'H4' ? ' ; H4 ancrées à 22 h UTC' : ''}). ${m4 ? `<span style="color:${COULEURS.or}">MA200 H4 ${nf(m4, a.dec)} (${pct(ecart(m4, prix), 1)})</span>` : 'MA200 H4 : moins de 200 bougies H4'} · ${mj ? `<span style="color:${COULEURS.violet}">MA200 J ${nf(mj, a.dec)} (${pct(ecart(mj, prix), 1)})</span>` : 'MA200 J : moins de 200 jours'}.${d.recalage ? ' Historique avant le ' + esc(d.recalage.sur.replace(/^.*avant le /, '')) + ' : futures COMEX recalés de ' + nf(d.recalage.decalage, 1) + ' $.' : ''}`;
    } catch (e) { box.innerHTML = '<p class="tp-panne" role="alert">Graphique indisponible : ' + esc(e && e.message || e) + ' <button type="button" data-redessiner>Réessayer</button></p>'; }
  }
  function tendanceHtml(el, d, an, m) {
    const cases = ['M15', 'H1', 'H4', 'J'].map(k => `<td class="${sens(an.tendances[k].sens)}" title="${esc(an.tendances[k].raison)}">${esc(an.tendances[k].sens)}</td>`).join('');
    const rs = k => (an.rsi[k] == null ? '—' : an.rsi[k].toFixed(0));
    el.innerHTML = `<table class="tp-t" aria-label="Tendance par unité de temps"><tr><th></th><th>M15</th><th>H1</th><th>H4</th><th>Jour</th></tr><tr><th>Tendance</th>${cases}</tr><tr><th>RSI 14</th><td>${rs('M15')}</td><td>${rs('H1')}</td><td>${rs('H4')}</td><td>${rs('J')}</td></tr></table>
      <p class="tp-doux">Tendance = lecture descriptive (prix vs MA200 et pente de la MA50), jamais un signal. ${pastille(d.source, d.tPrix || d.t, { garde: m.copie })}</p>`;
  }
  zone.addEventListener('click', e => {
    const a = e.target.closest('[data-actif]'), t = e.target.closest('[data-tf]');
    if (a) { ouvrir(a.dataset.actif); return; }
    if (t) { E.tf = t.dataset.tf; ecrireLS('tp_tf', E.tf); fiche.querySelectorAll('[data-tf]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tf === E.tf))); dessiner(E.seq); return; }
    if (e.target.closest('[data-redessiner]')) dessiner(E.seq);
  });
  const minuteur = setInterval(() => { if (document.hidden) return; const now = Date.now(); fiche.querySelectorAll('[data-cr]').forEach(n => { n.textContent = compteARebours(+n.dataset.cr, now); }); }, 1000);
  ouvrir(E.id);
  return { detruire() { clearInterval(minuteur); nettoyer(); }, ouvrir, resume: () => (E.an ? `${parId[E.id].nom} : ${nf(E.an.prix, parId[E.id].dec)}, tendance journalière ${E.an.tendances.J.sens}, RSI journalier ${E.an.rsi.J == null ? 'indisponible' : Math.round(E.an.rsi.J)}.` : '') };
}
