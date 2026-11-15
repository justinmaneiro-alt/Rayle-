/* ═════════════ FENÊTRE « COUVERTURE » (carrousel) : corrélations et outil de couverture ═════════════
   Deux onglets : Corrélations (heatmap 30 / 90 / 250 jours + corrélation glissante) et Couvrir une position (classement de candidats, backtest « seule » contre « couverte », taille conseillée, verdict).
   Lecture seule : aucun ordre. Les corrélations passées ne garantissent rien ; la fenêtre le dit. */
import { creerVue, esc, nf, pct, cls, lireLS, ecrireLS, pastille } from '../commun/ui.js';
import { lireJour } from '../commun/donnees.js';
import { depuisSnapshotJour } from '../commun/series.js';
import { monterGraphique, COULEURS } from '../commun/graph.js';
import { parler } from '../commun/ia.js';
import { idDepuisTicker, CLE_POSITIONS_OUVERTES } from '../commun/xtb.js';
import { UNIVERS_COUV, parId, FENETRES_CORR, matriceCorr, corrPaire, glissante, classerCouvertures } from './calcul.js';
import { phraseCouverture } from './phrase.js';

let instance = null;
export const etat = () => (instance ? instance.etat() : { actif: false });
const fr2 = v => (v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ','));
/* couleur d'une corrélation : bleu (négative) → neutre → orange (positive) */
export function couleurCorr(r) { if (r == null) return 'transparent'; const a = Math.min(1, Math.abs(r)); return r >= 0 ? `rgba(232,168,90,${(0.12 + 0.7 * a).toFixed(2)})` : `rgba(143,208,227,${(0.12 + 0.7 * a).toFixed(2)})`; }

export async function ouvrir({ racine = document.body, onFermer = () => {} } = {}) {
  if (instance) return instance;
  const el = document.createElement('section'); el.id = 'couverture-fenetre'; el.className = 'tp tp-couverture'; el.setAttribute('aria-label', 'Couverture');
  el.innerHTML = `<header class="tp-tete"><b>Couverture</b><span class="tp-doux">corrélations et couverture · lecture seule</span><button type="button" class="tp-lire" data-lire aria-label="Lire le résumé à voix haute">🔊</button></header>
    <nav class="tp-nav" role="tablist" aria-label="Sections"><button type="button" role="tab" data-onglet="corr" aria-selected="false">Corrélations</button><button type="button" role="tab" data-onglet="couvrir" aria-selected="false">Couvrir une position</button></nav>
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
    if (!S.series) return; S.onglet === 'corr' ? dessinerCorr() : dessinerCouvrir();
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
  const num = s => { const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
  function calculer() {
    const f = S.formulaire, N = num(f.notionnel) || null;
    S.res = { f: { ...f }, liste: classerCouvertures(S.series, f.actif, f.sens, { notionnel: N, spreadPct: num(f.spread), swapAnPct: num(f.swap) }), N, choisi: 0 }; resultats();
  }
  const SENS = s => (s > 0 ? 'achat' : 'vente');
  const phrase = (r, x, N) => phraseCouverture(parId[r.f.actif].nom, r.f.sens, x, N);
  async function resultats() {
    const box = zone.querySelector('[data-resultats]'); if (!box || !S.res) return; const r = S.res, L = r.liste;
    if (!L.length) { box.innerHTML = '<p class="tp-panne" role="alert">Aucun candidat : les séries journalières nécessaires ne sont pas disponibles.</p>'; return; }
    const x = L[r.choisi] || L[0]; S.resume = phrase(r, x, r.N);
    const badge = v => `<span class="tp-verdict tp-v-${v.niveau}">${esc(v.texte.split(' : ')[0])}</span>`;
    box.innerHTML = `<h3 class="tp-titre">Candidats pour couvrir ${r.f.sens > 0 ? 'un achat' : 'une vente'} sur ${esc(parId[r.f.actif].nom)}</h3>
      <div class="tp-scroll"><table class="tp-t tp-cand"><tr><th>Actif (XTB)</th><th>Sens</th><th class="c-opt">30 j</th><th class="c-opt">90 j</th><th>250 j</th><th>Stabilité</th><th class="c-opt">Bêta</th><th>Verdict</th></tr>
      ${L.map((c, i) => `<tr data-cand="${i}" class="${i === r.choisi ? 'tp-sel' : ''}" tabindex="0" role="button"><td><b>${esc(c.nom)}</b><br><small>${esc(c.xtb)}</small></td><td>${SENS(c.sensCouverture)}</td><td class="c-opt ${cls(c.c30)}">${fr2(c.c30)}</td><td class="c-opt ${cls(c.c90)}">${fr2(c.c90)}</td><td class="${cls(c.c250)}">${fr2(c.c250)}</td><td>${c.stabilite == null ? '—' : Math.round(c.stabilite * 100) + ' %'}</td><td class="c-opt">${fr2(c.beta)}</td><td>${badge(c.verdict)}</td></tr>`).join('')}</table></div>
      <article class="tp-carte"><h3>${esc(x.nom)} (${esc(x.xtb)}) · ${SENS(x.sensCouverture)}</h3><p class="tp-verdict-l tp-v-${x.verdict.niveau}">${esc(x.verdict.texte)}</p>
        <div class="tp-cartes"><div><small>Taille conseillée</small><b>${nf(x.tailleRelative * 100, 0)} %</b><span>du notionnel de la position (bêta × notionnel)${r.N ? ' = ' + nf(x.tailleNotionnel, 0) + ' €' : ''}</span></div>
          <div><small>Corrélation 250 j</small><b class="${cls(x.c250)}">${fr2(x.c250)}</b><span>n = ${x.n250}${x.p != null ? ', p ' + (x.p < 0.001 ? '< 0,001' : '= ' + x.p.toFixed(3).replace('.', ',')) : ''}${x.ic ? ', IC 95 % ' + fr2(x.ic[0]) + ' à ' + fr2(x.ic[1]) : ''}</span></div>
          <div><small>Stabilité du signe</small><b>${x.stabilite == null ? '—' : Math.round(x.stabilite * 100) + ' %'}</b><span>du temps, fenêtres de 60 jours</span></div>
          ${x.backtest ? `<div><small>Volatilité</small><b class="tp-hausse">${pct(-x.backtest.reductionVol * 100, 0)}</b><span>${nf(x.backtest.volSeule, 1)} % → ${nf(x.backtest.volCouverte, 1)} % par an</span></div><div><small>Pire baisse (drawdown)</small><b class="tp-hausse">${x.backtest.reductionDD == null ? '—' : pct(-x.backtest.reductionDD * 100, 0)}</b><span>${nf(x.backtest.ddSeule, 1)} → ${nf(x.backtest.ddCouverte, 1)} points</span></div>` : ''}</div>
        <div class="tp-graph" data-g></div><p class="tp-doux">${x.backtest ? `Position seule contre position couverte sur ${x.backtest.jours} jours, en % du notionnel ; le bêta de chaque jour n’utilise que les ${120} jours précédents (aucun regard vers l’avenir)${num(S.formulaire.spread) || num(S.formulaire.swap) ? ', coûts saisis inclus' : ' ; coûts de spread et de swap non saisis (à renseigner ci-dessus)'}.` : 'Historique trop court pour un backtest.'}</p>
        <p><button type="button" data-expliquer>Rayle l’explique à la voix</button></p></article>`;
    if (x.backtest) { const n = ++S.seq; try { const G = await monterGraphique(box.querySelector('[data-g]'), { hauteur: 230, intraday: false, dec: 1 }); if (n !== S.seq || S.ferme) { G.detruire(); return; } if (S.graph) S.graph.detruire(); S.graph = G;
      G.ligne(x.backtest.dates.map((d, i) => ({ d, v: +x.backtest.seule[i].toFixed(2) })), { couleur: COULEURS.baisse, titre: 'seule' }); G.ligne(x.backtest.dates.map((d, i) => ({ d, v: +x.backtest.couverte[i].toFixed(2) })), { couleur: COULEURS.hausse, titre: 'couverte' }); G.ajuster(); } catch (e) { box.querySelector('[data-g]').innerHTML = '<p class="tp-panne">Graphique indisponible : ' + esc(e.message) + '</p>'; } }
  }
  el.addEventListener('click', e => {
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
  charger();
  function fermer() { if (S.ferme) return; S.ferme = true; S.seq++; vue.detruire(); if (S.graph) S.graph.detruire(); el.remove(); instance = null; try { onFermer(); } catch (e) { /* */ } }
  instance = { fermer, etat: () => ({ actif: !S.ferme, onglet: S.onglet }), el };
  return instance;
}
export function fermer() { if (instance) instance.fermer(); }
