/* ═════════════ STRATÉGIE RAYLE v1 : colle (boutons collés au graphique, mode Épuré / Complet, panneau, modèle d'affichage, voix) ═════════════
   Document de référence : STRATEGIE-RAYLE.md (scellé SHA-256). Calculs scellés : ma-evenements-v1.js (phase 1), boites-v1.js (phase 2) ; les autres phases s'ajoutent ici.
   Un OUTIL, jamais un agent : aucun ordre, aucune décision. Rayle décrit, calcule, dessine et mesure ; chaque chiffre vient avec son n et la valeur du hasard.
   Tout est recalculé à la clôture de chaque bougie H1 (jamais entre deux clôtures) et daté ; l'ancien état reste visible grisé. */
import * as MA from './ma-evenements-v1.js';
import * as Z from './boites-v1.js';
import { evenementsAffiches, texteMa, compterObjets, hp } from './rayle-modele-calcul.js';
import { boitesAffichees, bandeau } from './rayle-modele-boites.js';
import { COUCHES_RAYLE } from './rayle-couches.js';
import { creerCarteCarnet } from './rayle-carnet.js';
import * as FD from './feuille-decision-v1.js';
import * as SC from './scenarios-v1.js';
import { rNet } from './journal-calcul.js';
import { lireJSON } from './stockage-or.js';
const CLE_REG = 'rayle_or_rayle_reglages', CLE_ARCH = 'rayle_or_boites_registre', CLE_SCEN = 'rayle_or_scenarios_forward', H = 3600e3;
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function creerStrategie({ racine, moteur, graph, carnet = null, structure, parler = () => {}, maintenant = () => Date.now(), fetchFn = (...a) => fetch(...a), auto = true, stats = null } = {}) {
  const E = { reg: { vue: 'epure', ma: 'h1', horizon: '1j', ...lire(CLE_REG, {}) }, stats: { ma: stats && stats.ma || null, boites: stats && stats.boites || null, scen: stats && stats.scen || null }, B: null, cle: '', res: null, prep: null, zones: [], sel: { zones: [], message: null }, m: null,
    arch: lire(CLE_ARCH, []), scen: null, scenPrec: {}, regScen: lire(CLE_SCEN, []), sm: null, prix: null, atr: null };
  const q = s => racine && racine.querySelector(s);
  const couches = () => graph.couches();
  async function chargerStats() {
    for (const [cle, fichier] of [['ma', './ma-stats.json'], ['boites', './boites-stats.json'], ['scen', './scenarios-stats.json']]) if (!E.stats[cle]) { try { const r = await fetchFn(new URL(fichier, import.meta.url).href, { cache: 'no-store' }); if (r.ok) E.stats[cle] = await r.json(); } catch (e) { /* mesures « indisponibles » */ } }
  }
  /* ── DOM : boutons collés au graphique, bandeau d'état et panneau (insérés ici pour ne pas alourdir tableau-or.js) ── */
  const barre = q('[data-graph-barre]');
  if (barre && !barre.querySelector('[data-a="ray-vue"]')) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tor-gb'; b.dataset.a = 'ray-vue'; b.setAttribute('aria-pressed', 'true'); b.title = 'Mode Épuré (2 événements, 2 zones de chaque côté, 2 scénarios) ou Complet (tout ce que Rayle calcule)'; b.textContent = 'Épuré';
    barre.insertBefore(b, barre.firstChild);
  }
  if (barre && !barre.querySelector('[data-a="ray-scen"]')) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tor-gb'; b.dataset.a = 'ray-scen'; b.setAttribute('aria-pressed', 'false'); b.title = 'Scénarios dessinés : cône de volatilité et deux trajets (A continuation, B retournement ou opposé), recalculés à la clôture de chaque bougie H1. Scénarios, pas prévisions.'; b.textContent = 'Scénarios';
    const sel = document.createElement('select'); sel.className = 'tor-gb tor-ray-hor'; sel.dataset.rayHor = ''; sel.setAttribute('aria-label', 'Horizon des scénarios'); sel.innerHTML = '<option value="1j">1 j</option><option value="3j">3 j</option><option value="1sem">1 sem</option>';
    const ref = barre.querySelector('[data-a="ray-vue"]'); barre.insertBefore(b, ref ? ref.nextSibling : barre.firstChild); barre.insertBefore(sel, b.nextSibling);
  }
  if (racine && !q('[data-ray-feuille]')) { const a = document.createElement('aside'); a.className = 'tor-ray-feuille'; a.dataset.rayFeuille = ''; a.setAttribute('aria-label', 'Feuille de décision (information seulement)'); const g = q('.tor-graph'); (g || racine).appendChild(a); }
  if (racine && !q('[data-ray-bandeau]')) { const p = document.createElement('p'); p.className = 'tor-struct-bandeau tor-ray-bandeau'; p.dataset.rayBandeau = ''; p.hidden = true; const g = q('.tor-graph-lw'); if (g && g.parentNode) g.parentNode.insertBefore(p, g); }
  if (racine && !q('[data-rayle]')) {
    const sec = document.createElement('section'); sec.className = 'tor-bloc tor-rayle'; sec.dataset.rayle = '';
    sec.innerHTML = `<h2>Stratégie Rayle v1 <small>lecture en observation · aucune règle automatique n’a prouvé un avantage · jamais un ordre</small></h2>
      <p class="tor-ctx-pied" data-ray-etat>Chargement…</p>
      <div class="tor-ctx-actions"><label>Moyenne mobile <select data-ray-ma><option value="h1">SMA 200 H1</option><option value="jour">SMA 200 Jour</option></select></label> <button type="button" class="tor-gb" data-a="ray-vue">Épuré</button></div>
      <div data-ray-ma-corps></div><div data-ray-boites-corps></div><div data-ray-carnet-corps></div><div data-ray-feuille-corps></div><div data-ray-scen-corps></div><p class="tor-ctx-pied" data-ray-pied></p>`;
    const ict = q('[data-ict]'); if (ict && ict.parentNode) ict.parentNode.insertBefore(sec, ict); else racine.appendChild(sec);
  }
  /* ── calcul à la clôture de chaque bougie H1 ── */
  function analyser() {
    const st = structure && structure.etat && structure.etat(), A = st && st.A; if (!A || !A.B || A.B.length < 60) return false;
    const B = A.B, cle = `${B.length}|${B[B.length - 1].t}|${E.reg.ma}`; if (cle === E.cle && E.res) return false; E.cle = cle; E.B = B; E.sm = A;
    E.res = MA.analyser(B, { mode: E.reg.ma, periode: H });
    try { E.prep = Z.preparer(B); E.zones = Z.zonesA(E.prep, B.length - 1); E.atr = E.prep.A[B.length - 1]; } catch (e) { console.warn('boîtes :', e.message); E.prep = null; E.zones = []; }
    return true;
  }
  function selection() {
    const B = E.B; if (!E.prep || !B) return { zones: [], message: 'Pas de zone forte à proximité' };
    const prix = E.prixForce != null ? E.prixForce : (moteur && moteur.S && moteur.S.prix != null) ? moteur.S.prix : B[B.length - 1].c; E.prix = prix;
    return Z.selectionner(E.zones, { prix, atr: E.atr, stats: E.stats.boites, tout: E.reg.vue === 'complet' });
  }
  /* registre des zones déjà montrées (ajout seul) : une zone qui disparaît n'est pas effacée, elle reste visible, grisée, avec sa date */
  function archiver(sel) {
    const B = E.B, tNow = B[B.length - 1].t + H, vivantes = new Set(sel.zones.map(z => z.id + '|' + z.tFormation));
    for (const z of sel.zones) { const k = z.id + '|' + z.tFormation; if (!E.arch.some(a => a.k === k)) E.arch.push({ k, id: z.id, cote: z.cote, prix: z.prix, bas: z.bas, haut: z.haut, tDebut: z.tFormation, tVue: tNow, etiquette: `Zone de ${z.cote}${z.proba != null ? ` · ${Math.round(z.proba * 100)} % · n = ${z.n}` : ''}`, detail: [`zone vue le ${hp(tNow)} (heure de Paris), terminée depuis`] }); else { const a = E.arch.find(x => x.k === k); a.tVue = tNow; } }
    for (const a of E.arch) if (!vivantes.has(a.k) && !a.tFin) { const z = E.zones.find(x => x.id + '|' + x.tFormation === a.k); a.tFin = z && z.tInval != null ? z.tInval : a.tVue; a.raison = z && z.tInval != null ? 'invalidée par une clôture H1 au-delà' : 'sortie de la sélection'; }
    if (E.arch.length > 300) E.arch.splice(0, E.arch.length - 300); ecrire(CLE_ARCH, E.arch);
  }
  /* ── scénarios (phase 5) : recalculés à la clôture de chaque bougie H1, jamais entre deux ── */
  function contexteScen(B, i, nom) {
    const h1 = E.sm && E.sm.h1, h4 = E.sm && E.sm.h4, ma = E.res.ma[i];
    return { B, atr: E.atr, prix: B[i].c, t1: h1 && h1.etat ? h1.etat.tendance : 0, t4: h4 && h4.etat ? h4.etat.tendance : 0, positionMa: ma != null && B[i].c < ma ? -1 : 1, niveaux: Z.niveauxA(E.prep, i), ligne: Z.ligneRetournement(h1, B), stats: E.stats.scen, horizon: nom, regime: SC.regimeVol(E.prep.A, i) || 'moyen', tDerniere: B[i].t };
  }
  function scenarios() {
    const B = E.B; if (!B || !E.res || !E.prep || !E.atr) return null;
    const i = B.length - 1, cle = `${B[i].t}|${E.reg.horizon}|${E.stats.scen ? 1 : 0}`; if (E.scen && E.scen.cle === cle) return E.scen.val;
    const val = SC.construire({ ...contexteScen(B, i, E.reg.horizon), contexte: contexteNonValide() });
    if (E.scen && E.scen.val && E.scen.val.horizon === val.horizon && E.scen.val.tPose !== val.tPose) E.scenPrec[val.horizon] = E.scen.val;   // l'ancien tracé est archivé
    E.scen = { cle, val }; enregistrerScenarios(B, i); return val;
  }
  /* contexte NON validé (affiché à part, jamais dans la probabilité) : lecture du carnet en direct */
  function contexteNonValide() { const L = []; const t = E.carte && E.carte.texteLecture && E.carte.texteLecture(); if (t) L.push('carnet : ' + t); return L; }
  /* archive forward en ajout seul : une pose par horizon et par période (1 j, 3 j, 1 sem), puis marquage à l'échéance */
  function enregistrerScenarios(B, i) {
    if (!E.stats.scen) return; const tPose = B[i].t + H;
    for (const [nom, N] of Object.entries(SC.P.horizons)) {
      if (E.regScen.some(x => x.kind === 'pose' && x.horizon === nom && tPose - x.tPose < N * H)) continue;
      const v = nom === E.reg.horizon && E.scen ? E.scen.val : SC.construire(contexteScen(B, i, nom));
      for (const sc of v.actifs) E.regScen.push({ ...SC.enregistrement(v, sc, tPose), points: sc.points.map(q => ({ t: q.t, p: Math.round(q.p * 100) / 100 })) });
    }
    for (const x of E.regScen.filter(r => r.kind === 'pose')) if (!E.regScen.some(r => r.kind === 'resultat' && r.id === x.id)) { const r = SC.resoudre(x, B); if (r) E.regScen.push({ kind: 'resultat', id: x.id, statut: r.statut, t: r.t }); }
    if (E.regScen.length > 1500) E.regScen.splice(0, E.regScen.length - 1500); ecrire(CLE_SCEN, E.regScen);
  }
  function modele() {
    const c = couches(), B = E.B, res = E.res; if (!B || !res) return null;
    const m = { ma: null, evenements: [], boites: [], ligne: null, scenarios: null, structure: [] };
    if (c.rayMa !== false) {
      const debut = Math.max(0, B.length - 1500), pts = []; for (let i = debut; i < B.length; i++) if (res.ma[i] != null) pts.push({ t: B[i].t, v: res.ma[i] });
      m.ma = pts; m.maNom = E.reg.ma === 'jour' ? 'MA 200 jours' : 'MA 200 H1'; m.maDetail = [texteMa(res, B), 'moyenne simple des 200 dernières clôtures', 'repère de lecture, pas un signal'];
      m.evenements = evenementsAffiches(res, B, { vue: E.reg.vue, stats: E.stats.ma });
    }
    E.sel = selection(); archiver(E.sel);
    if (c.rayBoites !== false) {
      const tNow = B[B.length - 1].t, archives = E.arch.filter(a => a.tFin && tNow - a.tFin <= 40 * H).map(a => ({ id: a.id, cote: a.cote, prix: a.prix, bas: a.bas, haut: a.haut, tDebut: a.tDebut, tFin: a.tFin, etiquette: a.etiquette, detail: [...(a.detail || []), a.raison || ''] }));
      m.boites = boitesAffichees(E.sel, { stats: E.stats.boites, tDerniere: tNow, vue: E.reg.vue, archives });
      const h1 = E.sm && E.sm.h1; m.ligne = Z.ligneRetournement(h1, B); m.structure = Z.dernieresCassures(h1, B, 3);
    }
    if (c.rayScenarios) {
      const sv = scenarios();
      if (sv) {
        const prec = E.scenPrec[sv.horizon];
        m.scenarios = { cone: sv.cone, actifs: sv.actifs.map(a => ({ couleur: a.id, points: a.points, etiquette: a.etiquette, condition: a.condition, detail: a.detail })), archives: E.reg.vue === 'complet' && prec ? prec.actifs.map(a => ({ couleur: a.id, points: a.points, detail: [`ancien tracé du ${hp(prec.tPose - H)} (heure de Paris), archivé`] })) : [] };
        try { graph.margeDroite && graph.margeDroite(Math.min(sv.bougies, 60)); } catch (e) { /* */ }
      }
    } else { try { graph.margeDroite && graph.margeDroite(5); } catch (e) { /* */ } }
    m.vue = E.reg.vue; return m;
  }
  function maj(force = false) {
    const change = analyser() || force; if (!change && !force) { return; }
    const m = modele(); E.m = m; try { graph.rayle(m); } catch (e) { console.warn('Rayle :', e.message); }
    majBoutons(); rendre(); rendreFeuille();
  }
  function majBoutons() {
    for (const b of racine.querySelectorAll('[data-a="ray-scen"]')) { const on = !!couches().rayScenarios; b.classList.toggle('actif', on); b.setAttribute('aria-pressed', String(on)); }
    for (const s2 of racine.querySelectorAll('[data-ray-hor]')) s2.value = E.reg.horizon; for (const b of racine.querySelectorAll('[data-a="ray-vue"]')) { b.textContent = E.reg.vue === 'epure' ? 'Épuré' : 'Complet'; b.classList.toggle('actif', E.reg.vue === 'epure'); b.setAttribute('aria-pressed', String(E.reg.vue === 'epure')); } }
  /* ── feuille de décision (phase 4) : 5 conditions en direct, information seulement ── */
  function feuilleEtat() {
    if (!E.B || !E.res) return FD.evaluer({});
    const prix = E.prixForce != null ? E.prixForce : (moteur && moteur.S && moteur.S.prix != null ? moteur.S.prix : E.B[E.B.length - 1].c);
    const qual = Z.selectionner(E.zones, { prix, atr: E.atr, stats: E.stats.boites }).zones.map(z => z.id);
    return FD.evaluer({ B: E.B, evenements: E.res.events, zones: E.zones, qualifiees: qual, prix, atr: E.atr, h1: E.sm && E.sm.h1, h4: E.sm && E.sm.h4, lecture: E.carte ? E.carte.lecture() : null });
  }
  function rendreFeuille() {
    const el = q('[data-ray-feuille]'); if (!el) return; const f = feuilleEtat(); E.feuille = f;
    el.dataset.contexte = f.contexte ? 'oui' : 'non';
    el.innerHTML = `<b>Feuille de décision</b> <span class="tor-ray-feuille-n">${esc(f.texte)}</span><ul>${f.conditions.map(c => `<li class="${c.ok ? 'ok' : 'non'}" title="${esc(c.detail)}"><i aria-hidden="true"></i>${esc(c.libelle)}</li>`).join('')}</ul><small>information seulement, jamais un ordre</small>`;
    const r = q('[data-ray-feuille-corps]'); if (r) r.innerHTML = `<p class="tor-doux"><b>Feuille de décision</b> : ${esc(f.texte)}${f.contexte ? ' — ' + f.conditions.map(c => (c.ok ? '● ' : '○ ') + esc(c.libelle) + ' (' + esc(c.detail) + ')').join(' ; ') : ' (le prix n’est près d’aucune boîte).'}</p><p class="tor-doux">${esc(rapportFeuille().phrase)}</p>`;
  }
  function rapportFeuille() { let T = []; try { T = lireJSON('rayle_or_journal', []) || []; } catch (e) { /* */ } return FD.rapportJournal(Array.isArray(T) ? T : [], rNet); }
  const texteBandeau = () => (E.B && E.sm ? bandeau({ h1: E.sm.h1, h4: E.sm.h4, ligne: E.m && E.m.ligne, sel: E.sel, prix: E.prix ?? E.B[E.B.length - 1].c, atr: E.atr }) : '');
  function rendre() {
    const e = q('[data-ray-etat]'); if (e) e.textContent = E.res ? texteMa(E.res, E.B) : 'Chargement des bougies H1…';
    const bd = q('[data-ray-bandeau]'); if (bd) { const t = texteBandeau(); bd.hidden = !t || couches().rayBoites === false && couches().rayMa === false; bd.textContent = t; }
    const sel = q('[data-ray-ma]'); if (sel) sel.value = E.reg.ma;
    const c = q('[data-ray-ma-corps]'); if (c) { const L = (E.m && E.m.evenements || []).slice().reverse(); c.innerHTML = L.length ? `<ul class="tor-ray-evts">${L.map(x => `<li><b>${esc(x.etiquette)}</b> <small>${esc(hp(x.t))}</small></li>`).join('')}</ul>` : '<p class="tor-doux">Aucun événement récent sur la moyenne mobile.</p>'; }
    const bz = q('[data-ray-boites-corps]'); if (bz) { const L = (E.m && E.m.boites || []).filter(b => !b.grise); bz.innerHTML = L.length ? `<ul class="tor-ray-evts">${L.map(x => `<li><b>${esc(x.etiquette)}</b> <small>${esc(x.detail[0] || '')}</small></li>`).join('')}</ul>` : `<p class="tor-doux">${esc(E.sel.message || 'Pas de zone forte à proximité')}</p>`; }
    const sc = q('[data-ray-scen-corps]');
    if (sc) {
      const sv = couches().rayScenarios && E.scen ? E.scen.val : null, fi = SC.fiabilite(E.regScen), nomH = E.reg.horizon === '1j' ? '1 jour' : E.reg.horizon === '3j' ? '3 jours' : '1 semaine';
      sc.innerHTML = sv ? `<p class="tor-doux"><b>Scénarios (${esc(nomH)}, recalculés à la clôture H1 du ${esc(hp(sv.tPose - H))})</b> — scénarios, pas prévisions.</p><ul class="tor-ray-evts">${sv.actifs.map(a => `<li><b>${esc(a.etiquette)}</b><br><small>${esc(a.detail.slice(0, 4).join(' · '))}</small></li>`).join('')}</ul>${sv.contexte.length ? `<p class="tor-doux"><b>Contexte non validé</b> (hors probabilité) : ${esc(sv.contexte.join(' ; '))}</p>` : ''}<p class="tor-doux"><b>Fiabilité des scénarios</b> : ${esc(Object.values(fi.horizons).map(h => h.phrase).join(' '))}</p>` : '<p class="tor-doux">Scénarios : bouton « Scénarios » au-dessus du graphique (1 jour, 3 jours ou 1 semaine). Scénarios, pas prévisions.</p>';
    }
    const p = q('[data-ray-pied]'); if (p) { const o = compterObjets(E.m); p.textContent = `Mode ${E.reg.vue === 'epure' ? 'Épuré' : 'Complet'} · ${o} objet${o > 1 ? 's' : ''} affiché${o > 1 ? 's' : ''} sur le graphique${E.stats.ma ? ` · mesures Dukascopy du ${E.stats.ma.calcule}` : ' · mesures en chargement'}`; }
  }
  function reglage(k, v) { E.reg[k] = v; ecrire(CLE_REG, E.reg); maj(true); }
  racine.addEventListener('click', ev => {
    const b = ev.target.closest('[data-a="ray-vue"]'); if (b) reglage('vue', E.reg.vue === 'epure' ? 'complet' : 'epure');
    const sb = ev.target.closest('[data-a="ray-scen"]'); if (sb) { const on = !couches().rayScenarios; graph.couches({ rayScenarios: on }); for (const c of racine.querySelectorAll('[data-couche="rayScenarios"]')) c.checked = on; maj(true); }
  });
  racine.addEventListener('change', ev => { const t = ev.target; if (t.matches && t.matches('[data-ray-hor]')) reglage('horizon', t.value); else if (t.matches && t.matches('[data-ray-ma]')) reglage('ma', t.value); else if (t.dataset && t.dataset.couche in COUCHES_RAYLE) maj(true); });
  /* ── lecture du carnet à l'arrivée sur une boîte (phase 3) ── */
  const carte = creerCarteCarnet({ racine, flux: () => (carnet && carnet._flux) || null, zones: () => E.zones, atr: () => E.atr, prix: () => E.prixForce != null ? E.prixForce : (moteur && moteur.S && moteur.S.prix != null ? moteur.S.prix : (E.B ? E.B[E.B.length - 1].c : null)), barres: () => E.B || [], maintenant, parler, auto, surTick: () => { try { rendreFeuille(); } catch (e) { /* */ } } });
  E.carte = carte;
  let minuterie = null; if (auto) { chargerStats().then(() => maj(true)); minuterie = setInterval(() => { try { maj(); } catch (e) { /* */ } }, 30000); }
  return { maj, chargerStats, modele: () => E.m, etat: () => ({ reg: { ...E.reg }, res: E.res, B: E.B, stats: E.stats, m: E.m, zones: E.zones, sel: E.sel, arch: E.arch.slice(), bandeau: texteBandeau() }), reglage, carte, scenarios: () => (couches().rayScenarios ? scenarios() : null), registreScenarios: () => E.regScen.slice(), fiabiliteScenarios: () => SC.fiabilite(E.regScen), feuilleEtat: () => { const f = feuilleEtat(); return FD.etatPourJournal(f); }, feuille: () => feuilleEtat(), rapportFeuille, injecterPrix(p) { E.prixForce = p; maj(true); }, compterObjets: () => compterObjets(E.m), detruire() { clearInterval(minuterie); } };
}
