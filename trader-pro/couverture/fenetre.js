/* ═════════════ FENÊTRE « COUVERTURE » (carrousel) : corrélations et outil de couverture ═════════════
   Deux onglets : Corrélations (heatmap 30 / 90 / 250 jours + corrélation glissante) et Couvrir une position (classement de candidats, backtest « seule » contre « couverte », taille conseillée, verdict).
   Lecture seule : aucun ordre. Les corrélations passées ne garantissent rien ; la fenêtre le dit. */
import { creerVue, esc, nf, pct, cls, lireLS, ecrireLS, pastille } from '../commun/ui.js';
import { lireJour, lireCalendrier } from '../commun/donnees.js';
import { lireEvenements, evenementsMajeurs } from '../marches/calendrier.js';
import { depuisSnapshotJour } from '../commun/series.js';
import { monterGraphique, COULEURS } from '../commun/graph.js';
import { parler } from '../commun/ia.js';
import { lireNombreOuZero } from '../commun/nombre.js';
import { idDepuisTicker, CLE_POSITIONS_OUVERTES } from '../commun/xtb.js';
import { UNIVERS_COUV, parId, FENETRES_CORR, matriceCorr, corrPaire, glissante, classerCouvertures, paire } from './calcul.js';
import { phraseClaire, NIVEAUX, LIBELLE_VERDICT, TYPES_EVENEMENT, typeDeTitre, comportementEvenement, phraseEvenement } from './protection.js';

let instance = null;
export const etat = () => (instance ? instance.etat() : { actif: false });
const fr2 = v => (v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ','));
/* couleur d'une corrélation : bleu (négative) → neutre → orange (positive) */
export function couleurCorr(r) { if (r == null) return 'transparent'; const a = Math.min(1, Math.abs(r)); return r >= 0 ? `rgba(232,168,90,${(0.12 + 0.7 * a).toFixed(2)})` : `rgba(143,208,227,${(0.12 + 0.7 * a).toFixed(2)})`; }

export async function ouvrir({ racine = document.body, onFermer = () => {} } = {}) {
  if (instance) return instance;
  const el = document.createElement('section'); el.id = 'couverture-fenetre'; el.className = 'tp tp-couverture'; el.setAttribute('aria-label', 'Couverture');
  el.innerHTML = `<header class="tp-tete"><b>Couverture</b><span class="tp-doux">corrélations et couverture · lecture seule</span><button type="button" class="tp-lire" data-lire aria-label="Lire le résumé à voix haute">🔊</button></header>
    <nav class="tp-nav" role="tablist" aria-label="Sections"><button type="button" role="tab" data-onglet="corr" aria-selected="false">Corrélations</button><button type="button" role="tab" data-onglet="couvrir" aria-selected="false">Couvrir une position</button><button type="button" role="tab" data-onglet="evenement" aria-selected="false">Couverture d’événement</button></nav>
    <main class="tp-corps" data-corps><div class="tp-onglet" data-zone><p class="tp-att" role="status">Lecture des séries journalières…</p></div></main>
    <footer class="tp-pied">Lecture seule : aucun ordre. Pas un conseil d’investissement : une corrélation passée ne garantit pas la corrélation future. Rendements journaliers ; séries ajustées quand la source le permet.</footer>`;
  racine.appendChild(el);
  const S = { ferme: false, series: null, meta: null, onglet: lireLS('tp_couv_onglet', 'corr'), horizon: lireLS('tp_couv_horizon', 90), paire: null, graph: null, resume: '', res: null, seq: 0 }, $ = s => el.querySelector(s), zone = $('[data-zone]');
  const vue = creerVue(zone, { delai: 15000 });

  function charger() {
    zone.innerHTML = '';
    vue.lire('couv-series', async () => {
      const R = await Promise.allSettled(UNIVERS_COUV.map(a => lireJour(a.id, { delai: 8000 }))), series = {}, manquants = []; let t = Infinity, horsLigne = null;
      R.forEach((r, i) => { const a = UNIVERS_COUV[i]; if (r.status === 'fulfilled') { const s = depuisSnapshotJour(r.value.donnees).slice(-1100); if (s.length > 60) { series[a.id] = s; t = Math.min(t, r.value.t); horsLigne = horsLigne || r.value.horsLigne; return; } } manquants.push(a.id); });
      if (Object.keys(series).length < 2) throw new Error('les séries journalières ne sont pas encore publiées par le robot (réessayer plus tard)');
      return { t: Number.isFinite(t) ? t : Date.now(), horsLigne, donnees: { series, manquants } };
    }, (D, m) => { S.series = D.series; S.manquants = D.manquants; S.meta = m; dessinerOnglet(); });
  }
  function dessinerOnglet() {
    el.querySelectorAll('[data-onglet]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.onglet === S.onglet)));
    if (S.graph) { S.graph.detruire(); S.graph = null; }
    if (!S.series) return; S.onglet === 'corr' ? dessinerCorr() : S.onglet === 'evenement' ? dessinerEvenement() : dessinerCouvrir();
  }
  const ids = () => UNIVERS_COUV.filter(a => S.series[a.id]).map(a => a.id);
  /* ───── corrélations ───── */
  function dessinerCorr() {
    const I = ids(), M = matriceCorr(S.series, I, S.horizon), nom = id => parId[id];
    const paires = []; for (let i = 0; i < I.length; i++) for (let j = i + 1; j < I.length; j++) if (M[i][j].r != null) paires.push({ a: I[i], b: I[j], r: M[i][j].r });
    paires.sort((x, y) => Math.abs(y.r) - Math.abs(x.r)); const top = paires.slice(0, 3);
    S.resume = `Corrélations sur ${S.horizon} jours. ` + top.map(p => `${nom(p.a).nom} et ${nom(p.b).nom} : ${fr2(p.r)}`).join(' ; ') + '. Une corrélation passée ne garantit pas la suite.';
    zone.innerHTML = `${S.manquants.length ? `<p class="tp-bandeau">Séries pas encore publiées : ${S.manquants.map(m => esc(parId[m].nom)).join(', ')}. Elles apparaîtront après le prochain passage du robot ; rien n’est estimé à la place.</p>` : ''}
      <div class="tp-groupe" role="group" aria-label="Horizon">${FENETRES_CORR.map(h => `<button type="button" data-h="${h}" aria-pressed="${h === S.horizon}">${h} jours</button>`).join('')}</div>
      <div class="tp-heatbox"><table class="tp-heat" aria-label="Matrice de corrélations"><tr><th></th>${I.map(id => `<th title="${esc(nom(id).nom)}">${esc(nom(id).court)}</th>`).join('')}</tr>
        ${I.map((a, i) => `<tr><th title="${esc(nom(a).nom)}">${esc(nom(a).court)}</th>${I.map((b, j) => { const c = M[i][j]; return `<td ${i === j ? 'class="tp-diag"' : `data-p="${a}|${b}" tabindex="0" role="button" aria-label="${esc(nom(a).nom)} contre ${esc(nom(b).nom)} : ${fr2(c.r)}"`} style="background:${i === j ? 'transparent' : couleurCorr(c.r)}">${i === j ? '·' : fr2(c.r)}</td>`; }).join('')}</tr>`).join('')}</table></div>
      <p class="tp-doux"><span class="tp-pastille" style="background:${couleurCorr(-0.8)}"></span> négative (les deux évoluent en sens inverse) <span class="tp-pastille" style="background:${couleurCorr(0.8)}"></span> positive (même sens). Rendements journaliers ; pour le taux US 10 ans, variations de points. Touchez une case pour la corrélation glissante.</p>
      <div data-detail></div>
      <p class="tp-doux">${pastille('Yahoo Finance (instantanés du robot)', S.meta.t, { garde: S.meta.copie })}</p>`;
    if (S.paire && I.includes(S.paire[0]) && I.includes(S.paire[1])) detailPaire(S.paire[0], S.paire[1]);
  }
  async function detailPaire(a, b) {
    S.paire = [a, b]; const box = zone.querySelector('[data-detail]'); if (!box) return; const n = ++S.seq;
    const A = { id: a, serie: S.series[a] }, B = { id: b, serie: S.series[b] }, c = FENETRES_CORR.map(h => ({ h, ...corrPaire(A, B, h) })), g = glissante(A, B, 60);
    box.innerHTML = `<article class="tp-carte"><h3>${esc(parId[a].nom)} contre ${esc(parId[b].nom)}</h3>
      <table class="tp-t"><tr><th>Horizon</th>${c.map(x => `<th>${x.h} j</th>`).join('')}</tr><tr><th>Corrélation</th>${c.map(x => `<td class="${cls(x.r)}">${fr2(x.r)}</td>`).join('')}</tr><tr><th>p-value</th>${c.map(x => `<td>${x.p == null ? '—' : x.p < 0.001 ? '< 0,001' : x.p.toFixed(3).replace('.', ',')}</td>`).join('')}</tr><tr><th>Intervalle à 95 %</th>${c.map(x => `<td>${x.ic ? fr2(x.ic[0]) + ' à ' + fr2(x.ic[1]) : '—'}</td>`).join('')}</tr></table>
      <div class="tp-graph" data-g></div><p class="tp-doux">Corrélation glissante sur 60 jours : si elle change de signe, le lien n’est pas fiable.</p></article>`;
    if (g.length < 5) { box.querySelector('[data-g]').innerHTML = '<p class="tp-doux">Historique commun trop court pour une corrélation glissante.</p>'; return; }
    try { const G = await monterGraphique(box.querySelector('[data-g]'), { hauteur: 220, intraday: false, dec: 2 }); if (n !== S.seq || S.ferme) { G.detruire(); return; } S.graph = G;
      const l = G.ligne(g.filter(x => x.r != null).map(x => ({ d: x.d, v: +x.r.toFixed(3) })), { couleur: COULEURS.accent, titre: 'corrélation 60 j' }); G.niveau(l, 0, { couleur: COULEURS.gris, style: 2 }); G.ajuster();
    } catch (e) { box.querySelector('[data-g]').innerHTML = '<p class="tp-panne">Graphique indisponible : ' + esc(e.message) + '</p>'; }
  }
  /* ───── couvrir une position ───── */
  const positions = () => { const L = lireLS(CLE_POSITIONS_OUVERTES, []); return Array.isArray(L) ? L.filter(p => idDepuisTicker(p.ticker) && S.series[idDepuisTicker(p.ticker)]) : []; };
  function dessinerCouvrir() {
    const choix = UNIVERS_COUV.filter(a => !a.taux && a.xtb && S.series[a.id]), P = positions(), f = S.formulaire || (S.formulaire = { actif: choix[0] && choix[0].id, sens: 1, notionnel: '', spread: '0', swap: '0' });
    zone.innerHTML = `${P.length ? `<article class="tp-carte"><h3>Mes positions XTB ouvertes</h3><ul class="tp-liste">${P.map((p, i) => `<li><span><b>${esc(p.ticker)}</b> ${p.sens === 'BUY' ? 'achat' : 'vente'} · ${nf(p.volume, 3)} lot${p.valeur ? ' · valeur ' + nf(p.valeur, 0) + ' €' : ''}</span><button type="button" data-couvrir="${i}">Couvrir cette position</button></li>`).join('')}</ul></article>` : ''}
      <form class="tp-form" data-form><label>Actif à couvrir <select name="actif">${choix.map(a => `<option value="${a.id}"${a.id === f.actif ? ' selected' : ''}>${esc(a.nom)}</option>`).join('')}</select></label>
        <label>Sens de ma position <select name="sens"><option value="1"${f.sens === 1 ? ' selected' : ''}>Achat</option><option value="-1"${f.sens === -1 ? ' selected' : ''}>Vente</option></select></label>
        <label>Taille (valeur en €, facultatif) <input name="notionnel" inputmode="decimal" value="${esc(f.notionnel)}" autocomplete="off"></label>
        <label>Spread de la couverture (% du notionnel) <input name="spread" inputmode="decimal" value="${esc(f.spread)}" autocomplete="off"></label>
        <label>Swap de la couverture (% par an) <input name="swap" inputmode="decimal" value="${esc(f.swap)}" autocomplete="off"></label><button type="submit">Chercher la meilleure couverture</button></form>
      <div data-resultats></div>`;
    if (S.res) resultats();
  }
  const num = lireNombreOuZero;
  function calculer() {
    const f = S.formulaire, N = num(f.notionnel) || null;
    S.res = { f: { ...f }, liste: classerCouvertures(S.series, f.actif, f.sens, { notionnel: N, spreadPct: num(f.spread), swapAnPct: num(f.swap) }), N, choisi: 0 }; resultats();
  }
  const SENS = s => (s > 0 ? 'achat' : 'vente');
  const niveauCourant = () => NIVEAUX[S.niveau == null ? 2 : S.niveau];
  const phrase = (r, x, N) => phraseClaire(parId[r.f.actif], r.f.sens, x, niveauCourant(), N);
  const pcn = v => (v == null || !Number.isFinite(v) ? '—' : nf(v * 100, 0) + ' %');
  const pts = (v, eur) => (v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−' : '') + nf(Math.abs(v), 1) + ' % de la position' + (eur != null && Number.isFinite(eur) ? ' (≈ ' + (eur < 0 ? '−' : '') + nf(Math.abs(eur), 0) + ' €)' : ''));
  const copier = async txt => { try { await navigator.clipboard.writeText(txt); return true; } catch (e) { try { const t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (e2) { return false; } } };
  async function resultats() {
    const box = zone.querySelector('[data-resultats]'); if (!box || !S.res) return; const r = S.res, L = r.liste;
    if (!L.length) { box.innerHTML = '<p class="tp-panne" role="alert">Aucun candidat : les séries journalières nécessaires ne sont pas disponibles.</p>'; return; }
    const x = L[r.choisi] || L[0], nv = niveauCourant(), P = phrase(r, x, r.N), sem = x.protection.semaine, F = nv.fraction; S.resume = P.texte(); S.phrase = P;
    const badge = v => `<span class="tp-verdict tp-v-${v.niveau}">${esc(LIBELLE_VERDICT[v.niveau] || v.niveau)}</span>`;
    const tauxCls = sem.taux == null ? '' : sem.taux >= 0.7 ? 'tp-hausse' : sem.taux >= 0.55 ? 'tp-orange' : 'tp-baisse';
    const stabLigne = x.protection.parFenetre.map(w => `${w.jours} j : <b>${w.taux == null ? '—' : pcn(w.taux)}</b> <small>(${w.cas} cas)</small>`).join(' · ');
    box.innerHTML = `<h3 class="tp-titre">Candidats pour couvrir ${r.f.sens > 0 ? 'un achat' : 'une vente'} sur ${esc(parId[r.f.actif].nom)}</h3>
      <div class="tp-scroll"><table class="tp-t tp-cand"><tr><th>Actif (XTB)</th><th>Sens à prendre</th><th>Protection (semaine)</th><th class="c-opt">Corrél. 250 j</th><th>Verdict</th></tr>
      ${L.map((c, i) => `<tr data-cand="${i}" class="${i === r.choisi ? 'tp-sel' : ''}" tabindex="0" role="button"><td><b>${esc(c.nom)}</b><br><small>${esc(c.xtb)}</small></td><td class="${c.sensCouverture > 0 ? 'tp-hausse' : 'tp-baisse'}"><b>${c.sensCouverture > 0 ? 'ACHAT' : 'VENTE'}</b></td><td>${c.protection.semaine.taux == null ? '—' : pcn(c.protection.semaine.taux)}<br><small>${c.protection.semaine.cas} cas</small></td><td class="c-opt ${cls(c.c250)}">${fr2(c.c250)}</td><td>${badge(c.verdict)}</td></tr>`).join('')}</table></div>
      <article class="tp-carte tp-claire"><div class="tp-ordre tp-ordre-${P.action.couleur}" data-phrase><span class="tp-ordre-ta">${esc(P.ta)}</span><span class="tp-ordre-fl" aria-hidden="true">→</span><b class="tp-ordre-dir">${esc(P.action.verbe)} ${esc(P.action.cible)}</b></div>
        <p class="tp-consigne">${esc(P.consigne.charAt(0).toUpperCase() + P.consigne.slice(1))}</p><p class="tp-pourquoi">${esc(P.pourquoi)}</p>
        <div class="tp-duo"><div class="tp-cle ${tauxCls}" data-protection><small>Taux de protection mesuré (semaine)</small><b>${pcn(sem.taux)}</b><span>${sem.cas} semaines défavorables (≥ 1 % contre ta position) · la couverture a compensé en moyenne ${pcn(sem.compensation == null ? null : Math.max(0, sem.compensation) * F)} de la perte${sem.taux != null && x.protection.jour.taux != null ? ' · sur 1 jour : ' + pcn(x.protection.jour.taux) + ' (' + x.protection.jour.cas + ' cas)' : ''}</span><span>${stabLigne}</span></div>
          <div class="tp-cle tp-cout" data-cout><small>Coût : ce que la couverture te reprend</small><b>${pcn(sem.cout == null ? null : Math.max(0, sem.cout) * F)}</b><span>${P.cout ? esc(P.cout) : 'Pas assez de semaines favorables pour mesurer le coût.'}</span><span>Elle coûte ${pcn(sem.frequenceCout)} du temps quand tu as raison.</span></div></div>
        <p class="tp-verdict-l tp-v-${x.verdict.niveau}">${esc(x.verdict.texte)}</p><p class="tp-doux tp-pedago">${esc(P.pedago)}</p>
        <h4>Trois niveaux de couverture</h4>
        <div class="tp-groupe" role="group" aria-label="Niveau de couverture">${NIVEAUX.map((n, i) => `<button type="button" data-niveau="${i}" aria-pressed="${n.id === nv.id}">${esc(n.nom)} · ${nf(n.fraction * 100, 0)} %</button>`).join('')}</div>
        <div class="tp-scroll"><table class="tp-t tp-niveaux"><tr><th>Niveau</th><th>Taille</th><th>Volatilité réduite</th><th>Drawdown réduit</th><th>Gain abandonné</th></tr>
          ${x.niveaux.map(n => `<tr class="${n.id === nv.id ? 'tp-sel' : ''}"><td><b>${esc(n.nom)}</b><br><small>${esc(n.court)}</small></td><td>${nf(n.tailleRelative * 100, 0)} %${n.tailleNotionnel ? '<br><small>≈ ' + nf(n.tailleNotionnel, 0) + ' €</small>' : ''}</td><td class="tp-hausse">${n.reductionVol == null ? '—' : pcn(n.reductionVol)}</td><td class="tp-hausse">${n.reductionDD == null ? '—' : pcn(n.reductionDD)}</td><td class="tp-baisse">${pts(n.gainAbandonne, n.gainAbandonneEur)}<br><small>sur ${n.jours} j</small></td></tr>`).join('')}</table></div>
        <p class="tp-xtb">Symbole XTB exact : <code data-xtb>${esc(x.xtb)}</code> <button type="button" data-copier="${esc(x.xtb)}" aria-label="Copier le symbole ${esc(x.xtb)}">Copier</button> <span class="tp-doux" data-copie-ok role="status"></span></p>
        <div class="tp-graph" data-g></div><p class="tp-doux">${x.backtest ? `Position seule contre position couverte à 100 % du bêta sur ${x.backtest.jours} jours, en % du notionnel ; le bêta de chaque jour n’utilise que les ${120} jours précédents (aucun regard vers l’avenir)${num(S.formulaire.spread) || num(S.formulaire.swap) ? ', coûts saisis inclus' : ' ; coûts de spread et de swap non saisis (à renseigner ci-dessus)'}.` : ''}</p>
        <p><button type="button" data-expliquer>Rayle l’explique à la voix</button></p></article>`;
    if (x.backtest) { const n = ++S.seq; try { const G = await monterGraphique(box.querySelector('[data-g]'), { hauteur: 230, intraday: false, dec: 1 }); if (n !== S.seq || S.ferme) { G.detruire(); return; } if (S.graph) S.graph.detruire(); S.graph = G;
      G.ligne(x.backtest.dates.map((d, i) => ({ d, v: +x.backtest.seule[i].toFixed(2) })), { couleur: COULEURS.baisse, titre: 'seule' }); G.ligne(x.backtest.dates.map((d, i) => ({ d, v: +x.backtest.couverte[i].toFixed(2) })), { couleur: COULEURS.hausse, titre: 'couverte' }); G.ajuster(); } catch (e) { box.querySelector('[data-g]').innerHTML = '<p class="tp-panne">Graphique indisponible : ' + esc(e.message) + '</p>'; } }
  }
  /* ───── couverture d'événement : quelle couverture poser avant une annonce, quand la retirer, comportement historique de la paire ───── */
  async function chargerCalendrier() { if (S.calendrier !== undefined) return; S.calendrier = null; try { const r = await lireCalendrier({ delai: 8000 }); S.calendrier = lireEvenements(r.donnees); } catch (e) { S.calendrier = []; } }
  function evenementsProches() { const out = []; for (const e of evenementsMajeurs(S.calendrier || [], Date.now(), { max: 40 })) { const type = typeDeTitre(e.titre, e.pays); if (type && !out.some(o => o.type === type && Math.abs(o.t - e.t) < 20 * 3600e3)) out.push({ ...e, type }); } return out.slice(0, 12); }   // v4 : mêmes annonces, même fenêtre et même étiquette que la carte Marchés
  async function dessinerEvenement() {
    zone.innerHTML = '<p class="tp-att" role="status">Lecture du calendrier…</p>'; await chargerCalendrier(); if (S.ferme || S.onglet !== 'evenement') return;
    const choix = UNIVERS_COUV.filter(a => !a.taux && a.xtb && S.series[a.id]), f = S.formulaire || (S.formulaire = { actif: choix[0] && choix[0].id, sens: 1, notionnel: '', spread: '0', swap: '0' }), E = evenementsProches(), types = Object.keys(TYPES_EVENEMENT);
    if (!S.evt || !types.includes(S.evt)) S.evt = (E[0] && E[0].type) || types[0];
    const dateFr = t => new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    zone.innerHTML = `<article class="tp-carte"><h3>Couverture d’événement</h3><p class="tp-doux">Choisis une annonce du calendrier : l’outil propose la couverture à poser avant et à retirer après, avec le comportement historique de la paire autour de ce type d’annonce (séries journalières : la couverture se pose à la clôture de la veille et se retire à la clôture du jour de l’annonce).</p>
      ${E.length ? `<div class="tp-groupe" role="group" aria-label="Prochaines annonces">${E.map(e => `<button type="button" data-evt="${e.type}" aria-pressed="${e.type === S.evt}" title="${esc(e.titre)}">${esc(TYPES_EVENEMENT[e.type].nom)} · ${esc(dateFr(e.t))}</button>`).join('')}</div>` : '<p class="tp-doux">Aucune annonce majeure (Fed, CPI, NFP, BCE) dans le calendrier de la semaine : choisis un type d’annonce.</p>'}
      <div class="tp-groupe" role="group" aria-label="Type d’annonce">${types.map(t => `<button type="button" data-evt="${t}" aria-pressed="${t === S.evt}">${esc(TYPES_EVENEMENT[t].nom)}</button>`).join('')}</div>
      <form class="tp-form" data-formevt><label>Actif à couvrir <select name="actif">${choix.map(a => `<option value="${a.id}"${a.id === f.actif ? ' selected' : ''}>${esc(a.nom)}</option>`).join('')}</select></label>
        <label>Sens de ma position <select name="sens"><option value="1"${f.sens === 1 ? ' selected' : ''}>Achat</option><option value="-1"${f.sens === -1 ? ' selected' : ''}>Vente</option></select></label></form></article><div data-evres></div>`;
    resultatEvenement();
  }
  const NOM_ANNONCE = { FOMC: 'la Fed', CPI: 'le CPI américain', NFP: 'le NFP', BCE: 'la BCE' };
  function resultatEvenement() {
    const box = zone.querySelector('[data-evres]'); if (!box) return; const f = S.formulaire, L = classerCouvertures(S.series, f.actif, f.sens, {}), x = L[0], nv = niveauCourant();
    if (!x) { box.innerHTML = '<p class="tp-panne" role="alert">Aucune couverture calculable pour cet actif : séries journalières manquantes.</p>'; return; }
    const X = { id: f.actif, serie: S.series[f.actif] }, Y = { id: x.id, serie: S.series[x.id] }, { ra, rb, dates } = paire(X, Y), c = comportementEvenement(dates, ra, rb, f.sens, x.beta, S.evt, { fraction: nv.fraction });
    const ph = phraseEvenement(parId[f.actif], f.sens, x, c, NOM_ANNONCE[S.evt] || TYPES_EVENEMENT[S.evt].nom, nv); S.resume = ph;
    box.innerHTML = `<article class="tp-carte tp-claire"><div class="tp-ordre tp-ordre-${x.sensCouverture > 0 ? 'vert' : 'rouge'}"><span class="tp-ordre-ta">Avant ${esc(NOM_ANNONCE[S.evt] || '')}</span><span class="tp-ordre-fl" aria-hidden="true">→</span><b class="tp-ordre-dir">${x.sensCouverture > 0 ? 'ACHÈTE' : 'VENDS'} ${esc(x.art || x.nom)}</b></div>
      <p class="tp-consigne">${esc(ph)}</p>
      ${c && c.mesurable ? `<div class="tp-duo"><div class="tp-cle"><small>Amplitude le jour de l’annonce</small><b>×${nf(c.amplitudeRatio, 1)}</b><span>par rapport à un jour normal · ${c.n} annonces</span></div><div class="tp-cle"><small>Protection ces jours-là</small><b>${pcn(c.taux)}</b><span>${c.casContre} jours contre ta position sur ${c.n}</span></div></div>` : '<p class="tp-doux">Historique insuffisant pour ce type d’annonce.</p>'}
      <p class="tp-xtb">Symbole XTB exact : <code>${esc(x.xtb)}</code> <button type="button" data-copier="${esc(x.xtb)}">Copier</button> <span class="tp-doux" data-copie-ok role="status"></span></p>
      <p class="tp-doux">Dates : ${esc(TYPES_EVENEMENT[S.evt].source)}. Lecture seule : aucun ordre.</p><p><button type="button" data-expliquer>Rayle l’explique à la voix</button></p></article>`;
  }
  el.addEventListener('click', e => {
    const nvb = e.target.closest('[data-niveau]'), evb = e.target.closest('[data-evt]'), cp = e.target.closest('[data-copier]');
    if (nvb) { S.niveau = +nvb.dataset.niveau; if (S.onglet === 'evenement') resultatEvenement(); else resultats(); return; }
    if (evb) { S.evt = evb.dataset.evt; dessinerEvenement(); return; }
    if (cp) { copier(cp.dataset.copier).then(ok => { const t = el.querySelector('[data-copie-ok]'); if (t) t.textContent = ok ? 'copié' : 'copie impossible : sélectionne le texte'; }); return; }
    const o = e.target.closest('[data-onglet]'), h = e.target.closest('[data-h]'), c = e.target.closest('[data-p]'), cc = e.target.closest('[data-cand]'), cv = e.target.closest('[data-couvrir]');
    if (o) { S.onglet = o.dataset.onglet; ecrireLS('tp_couv_onglet', S.onglet); dessinerOnglet(); return; }
    if (h) { S.horizon = +h.dataset.h; ecrireLS('tp_couv_horizon', S.horizon); dessinerOnglet(); return; }
    if (c) { const [a, b] = c.dataset.p.split('|'); detailPaire(a, b); return; }
    if (cc && S.res) { S.res.choisi = +cc.dataset.cand; resultats(); return; }
    if (cv) { const p = positions()[+cv.dataset.couvrir]; if (p) { S.formulaire = { actif: idDepuisTicker(p.ticker), sens: p.sens === 'BUY' ? 1 : -1, notionnel: p.valeur ? String(Math.round(p.valeur)) : '', spread: '0', swap: '0' }; S.res = null; dessinerCouvrir(); calculer(); } return; }
    if (e.target.closest('[data-expliquer]')) parler(S.resume);
    if (e.target.closest('[data-lire]')) parler(S.resume || 'Rien à lire pour le moment.');
  });
  el.addEventListener('submit', e => { const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault(); const d = new FormData(f); S.formulaire = { actif: d.get('actif'), sens: +d.get('sens'), notionnel: d.get('notionnel'), spread: d.get('spread'), swap: d.get('swap') }; calculer(); });
  /* un champ change → les anciens résultats (et leur titre) disparaissent aussitôt ; si une recherche avait été lancée, elle est refaite après une courte pause. Les valeurs tapées sont gardées même si la fenêtre se redessine. */
  function champsChanges(e) {
    const f = e.target.closest('[data-form]'); if (!f) return; const d = new FormData(f);
    S.formulaire = { actif: d.get('actif'), sens: +d.get('sens'), notionnel: d.get('notionnel'), spread: d.get('spread'), swap: d.get('swap') };
    if (!S.res) return; S.res = null; S.resume = ''; S.seq++; if (S.graph) { S.graph.detruire(); S.graph = null; }
    const box = zone.querySelector('[data-resultats]'); if (box) box.innerHTML = '<p class="tp-doux" role="status">Paramètres modifiés : nouveau calcul en cours…</p>';
    clearTimeout(S.tRecalcul); S.tRecalcul = setTimeout(() => { if (!S.ferme && S.onglet === 'couvrir' && zone.querySelector('[data-form]')) calculer(); }, e.type === 'input' ? 900 : 150);
  }
  el.addEventListener('change', e => { const fe = e.target.closest('[data-formevt]'); if (!fe) return; const d = new FormData(fe); S.formulaire = { ...(S.formulaire || {}), actif: d.get('actif'), sens: +d.get('sens') }; resultatEvenement(); });
  el.addEventListener('input', champsChanges); el.addEventListener('change', champsChanges);
  charger();
  function fermer() { if (S.ferme) return; S.ferme = true; S.seq++; vue.detruire(); if (S.graph) S.graph.detruire(); el.remove(); instance = null; try { onFermer(); } catch (e) { /* */ } }
  instance = { fermer, etat: () => ({ actif: !S.ferme, onglet: S.onglet }), el };
  return instance;
}
export function fermer() { if (instance) instance.fermer(); }
