/* ═════════════ COPILOTE VISUEL : affichage (bandeau situation, checklist, plans, alertes dans l'app, journal et bilan, « Demander au copilote ») ═════════════
   N'affiche QUE ce que publie le moteur (actifs[x].visuel dans l'état, visuel dans la partie lente) : aucun calcul de marché ici.
   Copilote, pas un bot : aucun ordre. « Je l'ai pris » = une NOTE (prix + heure) envoyée au moteur pour mesurer le retard d'entrée. */
import { fmtPrix, fmtNombre, fmtR, heureParis, dateHeureParis } from '../commun/format.js';
import { repondre } from '../commun/questions.js';
import { htmlBandeauInfo, htmlFil, htmlPertinence, toast } from './copilote-info.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SENS = { haussiere: 'haussière', baissiere: 'baissière', range: 'range', inconnue: '—' };
const SENS_CLS = { haussiere: 'cv-h', baissiere: 'cv-b', range: 'cv-r', inconnue: 'cv-r' };
const sensTxt = s => (s === 'achat' ? 'ACHAT' : 'VENTE');
const ETATS = { attente: 'en attente', touche: 'zone touchée' };
const pct = x => (x == null ? '—' : fmtNombre(x * 100, 1) + ' %');

export function htmlBandeau(actif, v) {
  if (!v) return `<span class="cv-doux">Copilote : en attente des données du moteur…</span>`;
  const t = v.tendance || {}, s = v.situation || {}, d = v.donnees;
  const ou = s.ou === 'support' ? 'près d’un support' : s.ou === 'resistance' ? 'près d’une résistance' : 'au milieu';
  return `<div class="cv-puces"><span class="cv-puce ${SENS_CLS[t.h1 && t.h1.sens] || ''}" title="${esc(t.h1 && t.h1.raison)}">H1 ${esc(SENS[t.h1 && t.h1.sens] || '—')}</span><span class="cv-puce ${SENS_CLS[t.h4 && t.h4.sens] || ''}" title="${esc(t.h4 && t.h4.raison)}">H4 ${esc(SENS[t.h4 && t.h4.sens] || '—')}</span><span class="cv-puce">${ou}</span>${v.jauge ? `<span class="cv-puce cv-puce-jauge" title="Checklist de confluence du plan ${esc(v.jauge.plan)}">${v.jauge.n}/6</span>` : ''}</div>
    <p class="cv-phrase" data-cv-phrase>${esc(s.phrase || '')}</p>${d && d.alerte ? `<p class="cv-avert" data-cv-donnees>${esc(d.alerte)}</p>` : ''}`;
}

export function htmlChecklist(c) {
  if (!c || !c.criteres || !c.criteres.length) return `<span class="cv-doux">Checklist : aucun plan en cours.</span>`;
  const marque = k => (k.ok === true ? '<b class="cv-oui">✓</b>' : k.ok === false ? '<b class="cv-non">✗</b>' : '<b class="cv-inc">?</b>');
  return `<div class="cv-jauge" role="meter" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${c.n}" aria-label="Checklist ${c.n} sur 6"><span class="cv-jauge-txt">Checklist plan ${esc(c.planNom)} (${c.sens === 'achat' ? 'achat' : 'vente'}) : <b>${c.n} sur 6</b></span><span class="cv-jauge-barre">${[0, 1, 2, 3, 4, 5].map(i => `<i class="${i < c.n ? 'cv-plein' : ''}"></i>`).join('')}</span></div>
    <ul class="cv-criteres">${c.criteres.map(k => `<li><details data-critere="${esc(k.id)}"><summary>${marque(k)} ${esc(k.nom)}</summary><p>${esc(k.detail)}</p></details></li>`).join('')}</ul>`;
}

export function htmlPlans(actif, v, prises = new Set()) {
  if (!v) return '';
  const f = p => fmtPrix(actif, p), L = v.plans || [];
  const lignes = L.map(p => `<div class="cv-plan cv-${p.sens}" data-plan="${esc(p.id)}"><span class="cv-plan-nom">Plan ${esc(p.nom)} · ${sensTxt(p.sens)}</span>
    <span>zone <b>${f(p.zoneBas)} – ${f(p.zoneHaut)}</b> <small>(${esc(p.nomNiveau)})</small></span><span>invalidation ${f(p.stop)}</span><span>cible ${f(p.cible)} <small>(${fmtNombre(p.Rcible, 1)} R)</small></span><span>trop tard ${f(p.tropTard)}</span>
    <span class="cv-plan-etat">${p.dansZone ? 'prix dans la zone' : ETATS[p.etat] || esc(p.etat)}${p.avecTendance === false ? ' · contre la tendance' : ''}</span>
    ${prises.has('plan:' + p.id) ? '<span class="cv-pris-ok">noté</span>' : `<button type="button" class="at-btn cv-pris" data-cv-pris="plan:${esc(p.id)}" data-cv-prix="${p.entree}">Je l’ai pris</button>`}</div>`).join('');
  const ret = (v.retires || []).slice(-2).map(r => `<div class="cv-retire"><s>Plan ${esc(r.nom)} ${sensTxt(r.sens)} ${f(r.niveau)}</s> ${esc(r.raison)} <small>${heureParis(r.t)}</small></div>`).join('');
  return (lignes || '<span class="cv-doux">Aucun plan en cours : pas de niveau clair.</span>') + ret;
}

/* section « Copilote : setups, journal et bilan » (dans la page qui défile) */
export function htmlSection(g) {
  if (!g) return '<p class="cv-doux">Le moteur n’a pas encore publié le journal du copilote.</p>';
  const S = g.setups || {}, rt = g.retro, B = g.bilan || {};
  const ligneRetro = (id, s) => { const r = rt && (rt.setups[id] || rt.plans[id]); if (!r) return `<td colspan="5">non testé</td>`; const va = r.validation, ca = r.calibration;
    return `<td>${ca.n ? `${ca.n} · ${pct(ca.partGagne)} gagnés · ${fmtR(ca.Rmoy)} <small>(hasard ${pct(ca.hasard.partGagne)} · ${fmtR(ca.hasard.Rmoy)})</small>` : '—'}</td><td>${va.n} · ${pct(va.partGagne)} gagnés · ${fmtR(va.Rmoy)}</td><td>${pct(va.hasard.partGagne)} · ${fmtR(va.hasard.Rmoy)}</td><td>${va.pHolm == null ? '—' : va.pHolm < 0.001 ? '< 0,001' : fmtNombre(va.pHolm, 3)}</td><td class="${r.statut === 'validé' ? 'cv-statut-ok' : 'cv-statut-non'}">${esc(r.statut)}</td>`; };
  const setups = Object.entries(S).map(([id, s]) => `<tr><th scope="row" title="${esc(s.regle)}">${esc(s.nom)}<small>${esc(id)}</small></th>${ligneRetro(id, s)}<td>${s.alerteActive ? 'active' : 'désactivée'}</td></tr>`).join('');
  const plans = rt ? ['PLAN_A', 'PLAN_B'].map(id => `<tr><th scope="row">${esc(rt.plans[id] ? rt.plans[id].nom : id)}<small>${id}</small></th>${ligneRetro(id)}<td>—</td></tr>`).join('') : '';
  const cats = Object.entries(B).map(([c, b]) => `<tr><th scope="row">${esc(c)}</th><td>${b.n}</td><td>${b.notes}</td><td>${b.gagne} / ${b.perdu} / ${b.nonTouche} / ${b.ni}</td><td>${b.Rmoy == null ? '—' : fmtR(b.Rmoy)}</td><td>${b.RmoyHasard == null ? '—' : fmtR(b.RmoyHasard)}</td><td>${esc(b.verdict)}</td></tr>`).join('');
  const j = (g.journal || []).slice().reverse().slice(0, 12).map(x => `<tr><td>${dateHeureParis(x.t)}</td><td>${esc(x.actif)}</td><td>${esc(x.categorie)}</td><td class="cv-${x.sens}">${sensTxt(x.sens)}</td><td>${x.n8 ? esc(x.n8.issue) + (x.n8.R != null ? ' ' + fmtR(x.n8.R) : '') : 'en cours'}</td><td>${x.n24 ? esc(x.n24.issue) + (x.n24.R != null ? ' ' + fmtR(x.n24.R) : '') + (x.n24.hasard != null ? ` <small>(hasard ${fmtR(x.n24.hasard)})</small>` : '') : 'en cours'}</td></tr>`).join('');
  const p = g.prises || { n: 0 };
  return `<p class="cv-avertissement">Copilote, pas un bot : rien n’est exécuté. Les alertes de confluence ne s’affichent que dans l’application. Un setup qui ne bat pas le hasard hors échantillon garde son alerte désactivée.</p>
    <h4>Setups nommés <small>règles ${esc(g.v)}${rt ? ` · rétro-test du ${dateHeureParis(rt.t)}, coupe ${esc(rt.coupe)}` : ''}</small></h4>
    <div class="at-tab-defil"><table class="cv-table"><thead><tr><th>Setup</th><th>Calibration <span class="at-badge">CANDIDATE, non validée</span></th><th>Validation <span class="at-badge at-badge-rejoue">REJOUÉ</span></th><th>Hasard (valid.)</th><th>p corrigé</th><th>Statut</th><th>Alerte</th></tr></thead><tbody>${setups}${plans}</tbody></table></div>
    ${rt && rt.limites ? `<p class="cv-doux">${esc(rt.limites)}</p>` : '<p class="cv-doux">Rétro-test pas encore lancé : tous les setups sont « non testés », alertes désactivées.</p>'}
    <details class="cv-regles"><summary>Règles exactes des setups (figées)</summary><ul>${Object.entries(S).map(([id, s]) => `<li><b>${esc(s.nom)}</b> (${esc(id)}${s.actifs ? ', ' + s.actifs.join(', ') : ''}) : ${esc(s.regle)}</li>`).join('')}</ul></details>
    <h4>Bilan en direct <small>notation après 24 bougies M15, R net de frais (0,36 R), comparé à un tirage au hasard</small></h4>
    ${cats ? `<div class="at-tab-defil"><table class="cv-table"><thead><tr><th>Catégorie</th><th>Idées</th><th>Notées</th><th>gagné / perdu / non touché / ni l’un ni l’autre</th><th>R moyen</th><th>Hasard</th><th>Verdict</th></tr></thead><tbody>${cats}</tbody></table></div>` : '<p class="cv-doux">Pas encore d’idée notée : pas assez de données.</p>'}
    <h4>Mes entrées (« Je l’ai pris »)</h4>
    <p>${p.n ? `${p.n} entrée${p.n > 1 ? 's' : ''} notée${p.n > 1 ? 's' : ''} · retard moyen <b>${fmtNombre(p.retardMoyenMin, 0)} min</b> · coût moyen du retard <b>${fmtR(p.coutMoyenR)}</b>` : 'Aucune entrée notée pour l’instant.'}</p>
    <h4>Journal <small>dernières idées</small></h4>
    ${j ? `<div class="at-tab-defil"><table class="cv-table"><thead><tr><th>Heure</th><th>Actif</th><th>Catégorie</th><th>Sens</th><th>8 bougies</th><th>24 bougies</th></tr></thead><tbody>${j}</tbody></table></div>` : '<p class="cv-doux">Journal vide.</p>'}`;
}

/* contrôleur : monte les zones dans la vue existante */
export function creerCopiloteVisuel(R, { cnx, graph, actif: lireActif, lire, ecrire }) {
  const $ = s => R.querySelector(s);
  let prises = new Set(JSON.parse(lire('rayle_cv_prises', '[]'))), vues = new Set(JSON.parse(lire('rayle_cv_alertes_vues', '[]'))), derniers = {};
  const poser = (sel, html, cle) => { if (derniers[cle] === html) return; const z = $(sel); if (!z) return; const ouverts = [...z.querySelectorAll('details[open]')].map(d => d.dataset.critere || d.className); z.innerHTML = html; derniers[cle] = html; for (const o of ouverts) { const d = z.querySelector(`details[data-critere="${o}"]`) || z.querySelector('details.' + o); if (d) d.open = true; } };
  /* 2026-11-05 : COPILOTE D'INFORMATION — plus de plans A/B, de checklist ni d'alerte ACHAT/VENTE : bandeau d'information, fil « Ce qui se passe »,
     pertinence des événements, réglages (couper, heures calmes, types) et petits messages en coin. */
  function maj() {
    const e = cnx.store.etat, a = lireActif(), i = e && e.actifs[a] ? e.actifs[a].info : null;
    poser('[data-cv-bandeau]', htmlBandeauInfo(a, i), 'b');
    poser('[data-ci-fil]', htmlFil(a, i), 'f');
    alertes();
  }
  function majLent() { poser('[data-cv-section]', htmlPertinence(lireActif(), cnx.store.lent && cnx.store.lent.info), 's'); alertes(); }
  /* petits messages en coin : alertes du copilote d'information (après l'anti-bruit du moteur) */
  function alertes() {
    const g = cnx.store.lent && cnx.store.lent.info; if (!g || !cnx.fraicheur().live) return;
    for (const al of g.alertes || []) {
      if (vues.has(al.id)) continue; vues.add(al.id); ecrire('rayle_cv_alertes_vues', JSON.stringify([...vues].slice(-200)));
      if (Date.now() - al.t > 30 * 60e3) continue;
      toast(R, al.actif, al);
    }
  }
  function montrerAlerte(al) { toast(R, al.actif, al); }
  R.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-ci-couper')) { const i = cnx.store.etat && cnx.store.etat.actifs[lireActif()] && cnx.store.etat.actifs[lireActif()].info; cnx.reglerInfo && cnx.reglerInfo({ coupe: !(i && i.coupe) }); b.textContent = 'envoyé…'; }
    else if (b.hasAttribute('data-ci-fermer')) { const t = b.closest('.ci-toast'); if (t) t.remove(); }
  });
  R.addEventListener('change', ev => {
    const c = ev.target.closest('[data-ci-type]'), h = ev.target.closest('[data-ci-calme]');
    if (c) cnx.reglerInfo && cnx.reglerInfo({ actif: lireActif(), type2: c.dataset.ciType, actifType: c.checked });
    if (h && /^\d\d:\d\d$/.test(h.value)) { const [hh, mm] = h.value.split(':').map(Number); cnx.reglerInfo && cnx.reglerInfo({ [h.dataset.ciCalme === 'debut' ? 'calmeDebut' : 'calmeFin']: hh * 60 + mm }); }
  });
  /* « Je l'ai pris » : petit formulaire prix + heure (préremplis) */
  function ouvrirPrise(id, prixDefaut) {
    const z = $('[data-cv-prise]'); if (!z) return;
    const e = cnx.store.etat, a = lireActif(), px = e && e.actifs[a] && e.actifs[a].prix != null ? e.actifs[a].prix : prixDefaut;
    const d = new Date(), hh = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
    z.innerHTML = `<form class="cv-prise-form" data-cv-prise-form="${esc(id)}"><b>Je l’ai pris</b><label>Prix <input type="number" step="any" name="prix" value="${px}" required></label><label>Heure <input type="time" name="heure" value="${hh}" required></label><button type="submit" class="at-btn">Noter</button><button type="button" class="at-btn" data-cv-annuler-prise>Annuler</button><small>Une note pour mesurer ton retard d’entrée, jamais un ordre.</small></form>`;
    z.hidden = false; const i = z.querySelector('input[name="prix"]'); i && i.focus();
  }
  R.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.cvPris) { ouvrirPrise(b.dataset.cvPris, Number(b.dataset.cvPrix)); }
    else if (b.hasAttribute('data-cv-annuler-prise')) { $('[data-cv-prise]').hidden = true; }
    else if (b.hasAttribute('data-cv-fermer-alerte')) { $('[data-cv-alerte]').hidden = true; }
  });
  R.addEventListener('submit', ev => {
    const f = ev.target.closest('[data-cv-prise-form]'), q = ev.target.closest('[data-cv-q-form]');
    if (q) { ev.preventDefault(); demander(); return; }
    if (!f) return; ev.preventDefault();
    const prix = Number(f.prix.value), [h, m] = f.heure.value.split(':').map(Number), d = new Date(); d.setHours(h, m, 0, 0);
    if (!Number.isFinite(prix)) return;
    cnx.pris && cnx.pris(f.dataset.cvPriseForm, prix, d.getTime());
    prises.add(f.dataset.cvPriseForm); ecrire('rayle_cv_prises', JSON.stringify([...prises].slice(-200)));
    $('[data-cv-prise]').innerHTML = `<p class="cv-doux">Noté : ${fmtPrix(lireActif(), prix)} à ${f.heure.value}. Le bilan « Mes entrées » se met à jour.</p>`; setTimeout(() => { const z = $('[data-cv-prise]'); if (z) z.hidden = true; }, 4000);
    derniers.p = null; maj();
  });
  function demander() {
    const i = $('[data-cv-question]'), o = $('[data-cv-reponse]'); if (!i || !o) return;
    const e = cnx.store.etat, a = lireActif(), x = e && e.actifs[a];
    o.textContent = repondre(i.value, { actif: a, visuel: x && x.visuel ? Object.assign({}, x.visuel, { plans: [], confluence: null, setups: [] }) : null, global: cnx.store.lent && cnx.store.lent.visuel, prix: x && x.prix });
  }
  return { maj, majLent, montrerAlerte, demander };
}

/* gabarits HTML insérés dans vue.js */
export const HTML_HAUT = `<div class="cv-bandeau" data-cv-bandeau aria-live="polite"></div>`;
export const HTML_BAS = `<div class="cv-zone">
    <h4 class="ci-titre">Ce qui se passe <small>constats de marché, jamais des ordres</small></h4>
    <div class="ci-fil" data-ci-fil aria-live="polite"></div>
    <form class="cv-demander" data-cv-q-form><label class="at-sr" for="cv-q">Demander au copilote</label><input id="cv-q" data-cv-question type="text" placeholder="Demander au copilote (niveaux, tendance, delta, carnet, annonces…)" autocomplete="off"><button type="submit" class="at-btn" data-cv-demander>Demander</button><output data-cv-reponse></output></form>
  </div>`;
export const HTML_ALERTE = `<div class="cv-alerte" data-cv-alerte hidden></div><div class="ci-toasts" data-ci-toasts aria-live="polite"></div>`;
