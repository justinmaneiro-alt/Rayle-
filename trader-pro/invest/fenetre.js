/* ═════════════ FENÊTRE « INVESTISSEMENT LONG TERME » : le S&P 500 et le CAC 40 passés au crible, un verdict en un coup d'œil ═════════════
   Onglets : Entreprises (tableau, filtres, tri « les moins chères de bonne qualité ») · Ma liste (suivi + alertes) · Autres actifs (or, S&P 500, Nasdaq 100, Bitcoin, Solana) · Méthode.
   Fiche au clic : jauge prix / valeur (pessimiste · centrale · optimiste), 3 méthodes (DCF, multiples, Graham), qualité et santé (Piotroski, Altman…), prix contre valeur sur 10 ans, concurrents, hypothèses.
   Données : le Worker Cloudflare (cron quotidien par lots) s'il est configuré, sinon le dernier calcul embarqué (trader-pro/invest/donnees). Gratuit : SEC EDGAR + Yahoo Finance. Estimation, pas un conseil. */
import { esc, nf, pct, lireLS, ecrireLS, age } from '../commun/ui.js';
import { lireConn } from '../portefeuille/stockage.js';
import { lireJour } from '../commun/donnees.js';
import { depuisSnapshotJour } from '../commun/series.js';
import { monterGraphique, COULEURS } from '../commun/graph.js';
import { parler } from '../commun/ia.js';
import { explication } from './valeur.js';
import { ACTIFS_LT, analyserActifLT, phraseActifLT } from './actifs-lt.js';
import { pairesDe, filtrerLignes, trierLignes, comptes, secteursDe } from './tableau.js';

const ONGLETS = [['entreprises', 'Entreprises'], ['liste', 'Ma liste'], ['actifs', 'Autres actifs'], ['methode', 'Méthode']];
const BASE = new URL('./donnees/', import.meta.url).href, LS = { liste: 'rayle_lt_liste_v1', vus: 'rayle_lt_evt_vus_v1', onglet: 'rayle_lt_onglet', filtre: 'rayle_lt_filtre_v1' };
const CLASSE_BADGE = { 'PAS CHÈRE': 'lt-pas', 'PRIX JUSTE': 'lt-juste', 'CHÈRE': 'lt-chere', 'N/D': 'lt-nd', 'PAS CHER': 'lt-pas', 'CHER': 'lt-chere' };
const badge = b => `<span class="lt-badge ${CLASSE_BADGE[b] || 'lt-nd'}">${esc(b)}</span>`;
const dev = d => (d === 'EUR' ? '€' : '$'), prixTxt = l => (Number.isFinite(l.prix) ? nf(l.prix, l.prix >= 100 ? 0 : 2) + ' ' + dev(l.devise) : '—');
const mosTxt = m => (Number.isFinite(m) ? (m >= 0 ? '+' : '−') + Math.round(Math.abs(m) * 100) + ' %' : '—'), qTxt = q => (Number.isFinite(q) ? nf(q, 1) : '—');
let instance = null; export const etat = () => (instance ? instance.etat() : { actif: false });

async function json(url, ms = 15000, entetes = {}) { const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: entetes }); if (!r.ok) throw new Error(url.split('/').slice(-2).join('/') + ' : ' + r.status); return r.json(); }
const conn = () => lireConn(), enteteAcces = c => (c && c.code ? { 'X-Portefeuille-Code': c.code } : {});

export async function ouvrir({ racine = document.body, onFermer = () => {} } = {}) {
  if (instance) return instance;
  if (!document.querySelector('link[data-lt-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./invest.css', import.meta.url).href; l.dataset.ltCss = ''; document.head.appendChild(l); }
  const el = document.createElement('section'); el.id = 'invest-fenetre'; el.className = 'tp tp-invest'; el.setAttribute('aria-label', 'Investissement long terme');
  el.innerHTML = `<header class="tp-tete"><b>Investissement long terme</b><span class="tp-sync" data-etat role="status">chargement…</span></header>
    <nav class="tp-nav" role="tablist" aria-label="Sections">${ONGLETS.map(([k, n]) => `<button type="button" role="tab" data-onglet="${k}" aria-selected="false">${esc(n)}</button>`).join('')}</nav>
    <p class="tp-bandeau" data-bandeau hidden role="status"></p><main class="tp-corps" data-corps><div class="tp-onglet" data-zone></div></main>
    <footer class="tp-pied">Estimations chiffrées avec leurs hypothèses visibles : ni prévision ni conseil en investissement. Fondamentaux : SEC EDGAR (S&amp;P 500) ; prix : Yahoo Finance. Sociétés françaises : prix seulement.</footer>`;
  racine.appendChild(el);
  const $ = s => el.querySelector(s), zone = $('[data-zone]'), corps = $('[data-corps]'), bandeau = $('[data-bandeau]');
  const S = { lignes: [], t: 0, source: '', onglet: lireLS(LS.onglet, 'entreprises'), filtre: { secteur: '', pays: '', badge: '', texte: '', qMin: 0, tri: 'mos', sens: -1, ...lireLS(LS.filtre, {}) }, liste: lireLS(LS.liste, []), page: 1, fiche: null, graphs: [], seq: 0, ferme: false, actifs: {}, workerOk: null };
  const dire = (t, err = false) => { bandeau.hidden = !t; bandeau.textContent = t || ''; bandeau.classList.toggle('tp-erreur', !!err); if (t) setTimeout(() => { bandeau.hidden = true; }, 6000); };
  const viderGraphs = () => { S.graphs.forEach(g => { try { g.detruire(); } catch (e) { /* */ } }); S.graphs = []; };
  const suivie = tk => S.liste.includes(tk);

  /* ───── données : Worker (si configuré) sinon calcul embarqué ───── */
  async function chargerIndex() {
    const c = conn(), [w, st] = await Promise.allSettled([c ? json(c.url + '/lt/index', 15000) : Promise.reject(new Error('Worker non configuré')), json(BASE + 'index.json', 20000)]);
    const W = w.status === 'fulfilled' && w.value && Array.isArray(w.value.lignes) ? w.value : null, T = st.status === 'fulfilled' && st.value && Array.isArray(st.value.lignes) ? st.value : null; S.workerOk = c ? !!W : null;
    const m = new Map(); for (const l of (T ? T.lignes : [])) m.set(l.tk, { ...l, src: 'embarque' }); for (const l of (W ? W.lignes : [])) { const o = m.get(l.tk); if (!o || (l.t || 0) >= (o.t || 0)) m.set(l.tk, { ...l, src: 'worker' }); }
    S.lignes = [...m.values()]; S.t = Math.max(W ? W.t : 0, T ? T.t : 0);
    $('[data-etat]').textContent = S.lignes.length ? `${S.lignes.length} entreprises · calcul ${age(S.t)}${S.workerOk ? ' · Worker ✓' : c ? ' · Worker injoignable : calcul embarqué' : ''}` : 'aucune donnée';
    if (!S.lignes.length) throw new Error('aucune donnée disponible (ni Worker, ni calcul embarqué)');
  }
  async function chargerFiche(l) {
    const c = conn(); if (l.src === 'worker' && c) { try { return await json(c.url + '/lt/fiche/' + encodeURIComponent(l.tk), 15000); } catch (e) { /* repli sur le calcul embarqué */ } }
    return json(BASE + 'fiches/' + encodeURIComponent(l.tk) + '.json', 15000);
  }
  async function sauverListe() {
    ecrireLS(LS.liste, S.liste); const c = conn(); if (!c) return;
    try { const r = await fetch(c.url + '/lt/liste', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...enteteAcces(c) }, body: JSON.stringify({ liste: S.liste }), signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status); }
    catch (e) { dire('Liste enregistrée sur cet appareil ; synchronisation avec le Worker impossible : ' + e.message, true); }
  }
  async function liste_depuis_worker() { const c = conn(); if (!c) return; try { const r = await fetch(c.url + '/lt/liste', { headers: enteteAcces(c), signal: AbortSignal.timeout(10000) }); if (r.ok) { const j = await r.json(); const u = [...new Set([...S.liste, ...(j.liste || [])])]; if (u.length !== S.liste.length) { S.liste = u; ecrireLS(LS.liste, u); } } } catch (e) { /* hors ligne */ } }
  /* alertes : événements du cron (Rayle les annonce à voix haute une seule fois) */
  async function evenements() {
    const c = conn(); if (!c) return; try {
      const j = await json(c.url + '/lt/evenements', 10000), vus = lireLS(LS.vus, 0), neufs = (j.evenements || []).filter(e => e.t > vus);
      if (neufs.length) { ecrireLS(LS.vus, Math.max(...neufs.map(e => e.t))); for (const e of neufs.slice(-3)) parler(e.type === 'pas-chere' ? `${e.nom} passe pas chère, avec une qualité de ${e.q} sur 10.` : `${e.nom}, dans ta liste, change de verdict : ${e.vers.toLowerCase()}.`); dire(neufs.length + ' alerte(s) long terme : ' + neufs.map(e => e.nom).slice(0, 3).join(', ')); if (S.onglet === 'entreprises' || S.onglet === 'liste') { await chargerIndex(); rendre(); } }
    } catch (e) { /* alertes facultatives */ }
  }

  /* ───── écran principal : tableau ───── */
  const enteteCol = (k, nom, cl = '') => `<th class="${cl}" data-tri="${k}" aria-sort="${S.filtre.tri === k ? (S.filtre.sens > 0 ? 'ascending' : 'descending') : 'none'}" tabindex="0" role="button">${nom}${S.filtre.tri === k ? (S.filtre.sens > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  function ligneHtml(l) {
    return `<tr data-tk="${esc(l.tk)}" tabindex="0" class="${l.badge === 'N/D' ? 'lt-ligne-nd' : ''}"><td><b>${esc(l.tk)}</b></td><td class="lt-nom">${esc(l.nom)}<small class="lt-mob">${prixTxt(l)} · ${esc(l.secteur)}</small></td><td class="lt-opt">${esc(l.secteur)}</td><td class="lt-opt">${esc(l.pays)}</td>
      <td class="lt-num lt-opt">${prixTxt(l)}</td><td class="lt-num lt-opt">${Number.isFinite(l.v) ? nf(l.v, l.v >= 100 ? 0 : 2) : '—'}</td><td class="lt-num ${l.mos > 0 ? 'tp-hausse' : l.mos < 0 ? 'tp-baisse' : ''}">${mosTxt(l.mos)}</td><td>${badge(l.badge)}</td><td class="lt-num">${qTxt(l.q)}</td>
      <td><button type="button" class="lt-etoile" data-etoile="${esc(l.tk)}" aria-pressed="${suivie(l.tk)}" aria-label="${suivie(l.tk) ? 'Retirer de' : 'Ajouter à'} ma liste">${suivie(l.tk) ? '★' : '☆'}</button></td></tr>`;
  }
  function tableau(L, { pagination = true } = {}) {
    const n = L.length, pp = 50, pages = Math.max(1, Math.ceil(n / pp)); if (S.page > pages) S.page = pages; const V = pagination ? L.slice((S.page - 1) * pp, S.page * pp) : L;
    return `<div class="lt-tableau"><table class="tp-t lt-t"><thead><tr>${enteteCol('tk', 'Symbole')}${enteteCol('nom', 'Entreprise')}${enteteCol('secteur', 'Secteur', 'lt-opt')}${enteteCol('pays', 'Pays', 'lt-opt')}${enteteCol('prix', 'Prix', 'lt-num lt-opt')}${enteteCol('v', 'Valeur', 'lt-num lt-opt')}${enteteCol('mos', 'Marge', 'lt-num')}${enteteCol('badge', 'Verdict')}${enteteCol('q', 'Qualité /10', 'lt-num')}<th></th></tr></thead>
      <tbody>${V.map(ligneHtml).join('') || '<tr><td colspan="10" class="tp-doux">Aucune entreprise ne correspond aux filtres.</td></tr>'}</tbody></table></div>
      ${pagination && pages > 1 ? `<div class="lt-pages"><button type="button" data-page="-1" ${S.page <= 1 ? 'disabled' : ''}>◀</button><span>page ${S.page} / ${pages} · ${n} entreprises</span><button type="button" data-page="1" ${S.page >= pages ? 'disabled' : ''}>▶</button></div>` : `<p class="tp-doux">${n} entreprise(s)</p>`}`;
  }
  function vueEntreprises() {
    const F = S.filtre, C = comptes(S.lignes), L = trierLignes(filtrerLignes(S.lignes, F), F.tri, F.sens), sect = secteursDe(S.lignes);
    zone.innerHTML = `<div class="lt-resume">${[['PAS CHÈRE', C['PAS CHÈRE']], ['PRIX JUSTE', C['PRIX JUSTE']], ['CHÈRE', C['CHÈRE']], ['N/D', C['N/D']]].map(([b, n]) => `<button type="button" class="lt-compte ${CLASSE_BADGE[b]}" data-badge="${b}" aria-pressed="${F.badge === b}"><b>${n || 0}</b><span>${b === 'N/D' ? 'sans verdict' : b}</span></button>`).join('')}</div>
      <div class="lt-filtres"><button type="button" class="lt-rapide" data-rapide aria-pressed="${F.badge === 'PAS CHÈRE' && F.qMin >= 7 && F.tri === 'mos'}">Les moins chères de bonne qualité</button>
      <label>Secteur <select data-f="secteur"><option value="">Tous</option>${sect.map(s => `<option ${F.secteur === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label>Pays <select data-f="pays"><option value="">Tous</option><option value="US" ${F.pays === 'US' ? 'selected' : ''}>États-Unis (S&amp;P 500)</option><option value="FR" ${F.pays === 'FR' ? 'selected' : ''}>France (CAC 40)</option></select></label>
      <label>Qualité mini <select data-f="qMin">${[0, 5, 6, 7, 8].map(q => `<option value="${q}" ${F.qMin === q ? 'selected' : ''}>${q ? '≥ ' + q + ' / 10' : 'Toutes'}</option>`).join('')}</select></label>
      <label class="lt-recherche">Recherche <input type="search" data-f="texte" value="${esc(F.texte)}" placeholder="symbole ou nom" autocomplete="off"></label></div>
      ${tableau(L)}<p class="tp-doux">Marge de sécurité = (valeur estimée − prix) / valeur estimée. PAS CHÈRE à partir de +20 %, CHÈRE à partir de −15 %. La valeur est la médiane de trois méthodes ; clique sur une ligne pour la fiche et les hypothèses.</p>`;
  }
  function vueListe() {
    const L = S.liste.map(tk => S.lignes.find(l => l.tk === tk)).filter(Boolean), dispo = S.lignes.filter(l => !suivie(l.tk));
    zone.innerHTML = `<article class="tp-carte"><h3>Ma liste de suivi</h3><p class="tp-doux">Ajoute des entreprises à surveiller : le Worker te prévient (Telegram + Rayle) dès que le verdict de l’une d’elles change, et quand une entreprise passe PAS CHÈRE avec une bonne qualité (≥ 7/10).</p>
      <label class="lt-recherche">Ajouter <input list="lt-datalist" data-ajout placeholder="symbole ou nom, puis Entrée" autocomplete="off"><datalist id="lt-datalist">${dispo.slice(0, 600).map(l => `<option value="${esc(l.tk)}">${esc(l.nom)}</option>`).join('')}</datalist></label></article>
      ${L.length ? tableau(L, { pagination: false }) : '<p class="tp-doux">Ta liste est vide : clique sur ☆ dans le tableau, ou saisis un symbole ci-dessus.</p>'}`;
  }
  /* ───── fiche entreprise ───── */
  const jauge = f => {
    const V = f.valeur, P = f.prix; if (!V) return '<p class="tp-doux">Pas de valeur estimée : ' + esc((f.avertissements || [])[0] || 'données insuffisantes') + '</p>';
    const max = Math.max(V.opt * 1.2, P * 1.15, V.central * 1.4), pos = x => Math.max(0, Math.min(100, x / max * 100)).toFixed(1);
    return `<div class="lt-jauge" role="img" aria-label="Prix ${nf(P, 2)} contre valeur estimée ${nf(V.central, 2)}"><i class="lt-j-fourchette" style="left:${pos(V.pess)}%;width:${(pos(V.opt) - pos(V.pess)).toFixed(1)}%"></i><i class="lt-j-central" style="left:${pos(V.central)}%"></i><i class="lt-j-prix" style="left:${pos(P)}%"></i></div>
      <div class="lt-j-legende"><span>pessimiste <b>${nf(V.pess, V.pess >= 100 ? 0 : 2)}</b></span><span>centrale <b>${nf(V.central, V.central >= 100 ? 0 : 2)}</b></span><span>optimiste <b>${nf(V.opt, V.opt >= 100 ? 0 : 2)}</b></span><span class="lt-prix-leg">prix actuel <b>${nf(P, P >= 100 ? 0 : 2)}</b></span></div>`;
  };
  const pc = (v, d = 1) => (Number.isFinite(v) ? nf(v * 100, d) + ' %' : '—'), x2 = v => (Number.isFinite(v) ? nf(v, 1) : '—');
  async function ouvrirFiche(tk) {
    const l = S.lignes.find(x => x.tk === tk); if (!l) return; S.fiche = { tk, f: null }; const n = ++S.seq; viderGraphs();
    zone.innerHTML = `<p class="tp-att">Chargement de la fiche ${esc(tk)}…</p>`; corps.scrollTop = 0;
    let f; try { f = await chargerFiche(l); } catch (e) { if (n !== S.seq) return; zone.innerHTML = `<p class="tp-panne">Fiche indisponible : ${esc(e.message)} <button type="button" data-retour>Retour</button></p>`; return; }
    if (n !== S.seq) return; S.fiche.f = f;
    const pairs = pairesDe(S.lignes, l), R = f.ratios || {}, Q = f.qualite, pk = f.piotroski || {}, az = f.altman || {}, fr = f.pays === 'FR';
    zone.innerHTML = `<div class="lt-fiche"><div class="lt-fiche-tete"><button type="button" data-retour>◀ Retour</button><div><h2>${esc(f.nom)} <small>${esc(f.tk)} · ${esc(f.secteur)} · ${esc(f.pays)}</small></h2><p class="tp-doux">Calcul ${age(f.t)} · ${f.fin ? 'dernier exercice ' + esc(f.fin) + ' · ' : ''}capitalisation ${Number.isFinite(f.mcap) ? nf(f.mcap / 1e9, f.mcap >= 1e10 ? 0 : 1) + ' Md$' : '—'}</p></div>
      <div class="lt-fiche-actions"><button type="button" class="lt-etoile" data-etoile="${esc(f.tk)}" aria-pressed="${suivie(f.tk)}">${suivie(f.tk) ? '★ Suivie' : '☆ Suivre'}</button><button type="button" data-expliquer>🔊 Rayle explique</button></div></div>
      <article class="tp-carte lt-verdict-carte"><div class="lt-verdict-ligne">${badge(f.badge)}<span class="lt-grand">${Number.isFinite(f.mos) ? 'Marge de sécurité ' + mosTxt(f.mos) : 'Pas de verdict'}</span><span class="lt-grand">Qualité ${Q ? qTxt(Q.note) + ' / 10' : '—'}</span></div>${fr ? `<p class="tp-avert">${esc((f.avertissements || [])[0] || '')}</p>` : jauge(f)}
        ${(f.avertissements || []).length && !fr ? `<ul class="lt-avert">${f.avertissements.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</article>
      ${fr ? `<article class="tp-carte"><h3>Prix sur 10 ans</h3><div class="tp-graph" data-graphe></div><div class="tp-cartes"><div><small>1 an</small><b class="${(f.perf || {}).a1 >= 0 ? 'tp-hausse' : 'tp-baisse'}">${pc((f.perf || {}).a1)}</b></div><div><small>5 ans</small><b>${pc((f.perf || {}).a5)}</b></div><div><small>10 ans</small><b>${pc((f.perf || {}).a10)}</b></div></div></article>` : `
      <article class="tp-carte"><h3>Valeur par trois méthodes</h3><div class="tp-tableau-defil"><table class="tp-t"><tr><th>Méthode</th><th class="lt-num">Pessimiste</th><th class="lt-num">Centrale</th><th class="lt-num">Optimiste</th></tr>${(f.methodes || []).map(m => `<tr><td><b>${esc(m.nom)}</b><br><small>${(m.detail || []).map(esc).join('<br>')}</small></td><td class="lt-num">${nf(m.pess, 2)}</td><td class="lt-num"><b>${nf(m.central, 2)}</b></td><td class="lt-num">${nf(m.opt, 2)}</td></tr>`).join('') || '<tr><td colspan="4" class="tp-doux">Aucune méthode applicable.</td></tr>'}</table></div>
        <div class="tp-cartes lt-ratios"><div><small>PER</small><b>${x2(R.per)}</b></div><div><small>EV / EBITDA</small><b>${x2(R.evEbitda)}</b></div><div><small>Rendement FCF</small><b>${pc(R.rendementFcf)}</b></div><div><small>Prix / valeur comptable</small><b>${x2(R.prixValeurComptable)}</b></div></div><p class="tp-doux" data-sect></p></article>
      <article class="tp-carte"><h3>Qualité et santé</h3>${Q ? `<div class="lt-qualite">${Q.parts.map(p => `<div class="lt-q-ligne"><span>${esc(p.nom)}</span><i><u style="width:${Math.round(p.v * 100)}%"></u></i><b>${esc(p.note || '')}</b></div>`).join('')}</div>` : '<p class="tp-doux">Note de qualité indisponible.</p>'}
        <div class="tp-cartes"><div><small>Marge opérationnelle</small><b>${pc(R.margeOp)}</b></div><div><small>Marge nette</small><b>${pc(R.margeNette)}</b></div><div><small>ROIC</small><b>${pc(R.roic)}</b></div><div><small>ROE</small><b>${pc(R.roe)}</b></div><div><small>Dette nette / EBITDA</small><b>${x2(R.detteNetteEbitda)}</b></div><div><small>Croissance CA (5 ans)</small><b>${pc(R.croissanceCA)}</b></div><div><small>Croissance BPA (5 ans)</small><b>${pc(R.croissanceBPA)}</b></div><div><small>Altman Z-score</small><b>${az.z == null ? '—' : nf(az.z, 2)}</b><span>${esc(az.zone ? 'zone ' + az.zone : 'non applicable')}</span></div></div>
        <h4>Piotroski F-score : ${pk.score == null ? '—' : pk.score + ' / 9'} <small>(${pk.calculables || 0} critères calculables)</small></h4><ul class="lt-pk">${(pk.criteres || []).map(c => `<li class="${c.ok === true ? 'ok' : c.ok === false ? 'ko' : 'nd'}">${c.ok === true ? '✔' : c.ok === false ? '✘' : '·'} ${esc(c.nom)}</li>`).join('')}</ul></article>
      <article class="tp-carte"><h3>Prix et valeur sur 10 ans</h3><div class="tp-graph" data-graphe></div><p class="tp-doux">${esc((f.histo || {}).note || '')}</p></article>
      <article class="tp-carte"><h3>Résultats annuels</h3><div class="tp-tableau-defil"><table class="tp-t"><tr><th>Exercice</th><th class="lt-num">Chiffre d’affaires</th><th class="lt-num">Résultat net</th><th class="lt-num">Flux libre</th><th class="lt-num">BPA</th></tr>${(f.annees || []).slice(-8).reverse().map(a => `<tr><td>${esc(a.fin)}</td><td class="lt-num">${Md(a.rev)}</td><td class="lt-num">${Md(a.ni)}</td><td class="lt-num">${Md(a.fcf)}</td><td class="lt-num">${Number.isFinite(a.eps) ? nf(a.eps, 2) : '—'}</td></tr>`).join('')}</table></div></article>`}
      <article class="tp-carte"><h3>Concurrents du même secteur</h3>${pairs.length ? `<div class="tp-tableau-defil"><table class="tp-t lt-t"><tr><th>Entreprise</th><th class="lt-num">PER</th><th class="lt-num">Marge de sécurité</th><th>Verdict</th><th class="lt-num">Qualité</th></tr>${pairs.map(p => `<tr data-tk="${esc(p.tk)}" tabindex="0"><td><b>${esc(p.tk)}</b> ${esc(p.nom)}</td><td class="lt-num">${x2(p.per)}</td><td class="lt-num">${mosTxt(p.mos)}</td><td>${badge(p.badge)}</td><td class="lt-num">${qTxt(p.q)}</td></tr>`).join('')}</table></div>` : '<p class="tp-doux">Pas de comparaison disponible.</p>'}</article>
      ${(f.hypotheses || []).length ? `<article class="tp-carte"><h3>Hypothèses du calcul</h3><ul class="tp-liste lt-hyp">${f.hypotheses.map(h => `<li>${esc(h)}</li>`).join('')}</ul></article>` : ''}</div>`;
    const sec = zone.querySelector('[data-sect]'); if (sec) { const meds = medianesSecteur(S.lignes, l); sec.textContent = meds ? `Secteur « ${l.secteur} » (${meds.n} entreprises) : PER médian ${x2(meds.per)}, EV/EBITDA médian ${x2(meds.ev)}, rendement FCF médian ${pc(meds.fy)}.` : ''; }
    const g = zone.querySelector('[data-graphe]'); if (g && f.histo && f.histo.prix && f.histo.prix.length > 5) {
      try { const G = await monterGraphique(g, { hauteur: 260, intraday: false, dec: f.prix >= 100 ? 0 : 2 }); if (n !== S.seq) { G.detruire(); return; } S.graphs.push(G); const lp = G.ligne(f.histo.prix.map(p => ({ t: p[0], v: p[1] })), { couleur: COULEURS.accent, titre: 'prix' });
        if (f.histo.valeur && f.histo.valeur.length) G.ligne(f.histo.valeur.map(p => ({ t: p[0], v: p[1] })), { couleur: COULEURS.or, titre: 'valeur' }); if (f.valeur) G.niveau(lp, f.valeur.central, { couleur: COULEURS.or, style: 2, titre: 'valeur actuelle' }); G.ajuster(); }
      catch (e) { g.innerHTML = '<p class="tp-panne">Graphique indisponible.</p>'; }
    }
  }
  const Md = v => (Number.isFinite(v) ? nf(v / 1e9, Math.abs(v) >= 1e10 ? 1 : 2) + ' Md$' : '—');
  /* ───── autres actifs long terme ───── */
  async function vueActifs() {
    zone.innerHTML = `<p class="tp-doux">Repères de long terme fondés sur le prix lui-même : distance à la moyenne à 200 semaines située dans l’historique de l’actif (≤ 30 % : pas cher, ≥ 70 % : cher) et, pour le Bitcoin et Solana, multiple de Mayer.</p><div class="lt-actifs" data-actifs>${ACTIFS_LT.map(a => `<article class="tp-carte lt-actif" data-actif="${a.id}"><h3>${esc(a.nom)}</h3><p class="tp-att">Chargement…</p></article>`).join('')}</div>`; const n = ++S.seq; viderGraphs();
    await Promise.all(ACTIFS_LT.map(async def => {
      const box = zone.querySelector(`[data-actif="${def.id}"]`); if (!box) return;
      try { let A = S.actifs[def.id]; if (!A) { const r = await lireJour(def.jour, { delai: 12000 }); A = S.actifs[def.id] = analyserActifLT(def, depuisSnapshotJour(r.donnees)); } if (n !== S.seq) return;
        box.innerHTML = `<h3>${esc(def.nom)} ${badge(A.badge)}</h3><p class="lt-grand">${Number.isFinite(A.prix) ? nf(A.prix, A.prix >= 100 ? 0 : 2) : '—'}</p>${(A.avertissements || []).map(a => `<p class="tp-avert">${esc(a)}</p>`).join('')}
          <table class="tp-t">${(A.reperes || []).map(r => `<tr><td>${esc(r.nom)}<br><small>${esc(r.detail)}</small></td><td class="lt-num"><b>${r.valeur == null ? '—' : r.format === 'pct' ? pct(r.valeur * 100, 0) : nf(r.valeur, 2) + ' ×'}</b></td></tr>`).join('')}</table><div class="tp-graph" data-g></div><p><button type="button" data-lire-actif="${def.id}">🔊 Rayle explique</button></p>`;
        const g = box.querySelector('[data-g]'); if (g && A.histo && A.histo.semaines.length > 20) { const G = await monterGraphique(g, { hauteur: 170, intraday: false, dec: A.prix >= 100 ? 0 : 2 }); if (n !== S.seq) { G.detruire(); return; } S.graphs.push(G); G.ligne(A.histo.semaines.map(p => ({ t: p[0], v: p[1] })), { couleur: COULEURS.accent, titre: 'prix (semaine)' }); G.ligne(A.histo.ma200s.map(p => ({ t: p[0], v: p[1] })), { couleur: COULEURS.or, titre: 'MA200 semaines' }); G.ajuster(); }
      } catch (e) { if (n === S.seq) box.innerHTML = `<h3>${esc(def.nom)}</h3><p class="tp-panne">Données indisponibles : ${esc(e.message)}</p>`; }
    }));
  }
  function vueMethode() {
    zone.innerHTML = `<article class="tp-carte lt-methode"><h3>Comment la valeur est calculée</h3><ul class="tp-liste"><li><b>DCF</b> : flux de trésorerie libres (exploitation − investissements) des 3 derniers exercices, projetés sur 10 ans avec une croissance qui s’éteint vers la croissance terminale, actualisés à 9 % (8 % optimiste, 10,5 % pessimiste), moins la dette nette, divisés par le nombre d’actions.</li>
      <li><b>Multiples</b> : PER, EV/EBITDA et rendement du flux libre MÉDIANS de l’entreprise sur ses 10 dernières années (bornés), appliqués à ses chiffres actuels ; comparés ensuite à ceux du secteur.</li><li><b>Graham</b> : BPA × (8,5 + 2 × croissance) × 4,4 / 5,5 % (rendement des obligations, hypothèse fixe).</li>
      <li><b>Valeur retenue</b> : médiane des méthodes applicables ; fourchette pessimiste / optimiste idem. <b>Marge de sécurité</b> = (valeur − prix) / valeur : PAS CHÈRE ≥ +20 %, CHÈRE ≤ −15 %.</li><li><b>Qualité /10</b> : moyenne de six critères (Piotroski, ROIC, marge, endettement, croissance, solidité d’Altman) ; pour les banques et assurances, ROE et marge nette.</li>
      <li><b>Banques et assurances</b> : le DCF n’a pas de sens, seules PER et Graham sont retenues.</li><li><b>Sociétés françaises (CAC 40)</b> : aucune source gratuite fiable de comptes ; prix et historique seulement.</li></ul>
      <p class="tp-doux">Données : SEC EDGAR (comptes annuels 10-K, gratuit), Yahoo Finance (prix, splits). Un cron du Worker Cloudflare recalcule le panier par petits lots (moins d’une journée pour tout le S&amp;P 500) ; sans Worker, le dernier calcul embarqué est affiché${S.t ? ' (' + esc(age(S.t)) + ')' : ''}. Une estimation reste une estimation : les hypothèses sont affichées dans chaque fiche.</p></article>`;
  }
  function rendre() {
    viderGraphs(); S.seq++; S.fiche = null; ecrireLS(LS.onglet, S.onglet);
    el.querySelectorAll('[data-onglet]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.onglet === S.onglet)));
    if (S.onglet === 'entreprises') vueEntreprises(); else if (S.onglet === 'liste') vueListe(); else if (S.onglet === 'actifs') vueActifs(); else vueMethode();
  }
  const rechargerTableau = () => { ecrireLS(LS.filtre, S.filtre); S.page = 1; rendre(); };

  /* ───── événements ───── */
  el.addEventListener('click', async e => {
    const t = e.target, b = t.closest('button, th[data-tri], tr[data-tk]'); if (!b) return;
    if (b.dataset.onglet) { S.onglet = b.dataset.onglet; rendre(); return; }
    if (b.dataset.etoile) { e.stopPropagation(); const tk = b.dataset.etoile; S.liste = suivie(tk) ? S.liste.filter(x => x !== tk) : [...S.liste, tk]; sauverListe(); if (S.fiche) { b.setAttribute('aria-pressed', String(suivie(tk))); b.textContent = suivie(tk) ? '★ Suivie' : '☆ Suivre'; } else { const pos = corps.scrollTop; rendre(); corps.scrollTop = pos; } return; }
    if (b.dataset.retour !== undefined) { rendre(); return; }
    if (b.dataset.expliquer !== undefined && S.fiche && S.fiche.f) { parler(explication(S.fiche.f)); return; }
    if (b.dataset.lireActif) { const A = S.actifs[b.dataset.lireActif]; if (A) parler(phraseActifLT(A)); return; }
    if (b.dataset.page) { S.page += +b.dataset.page; rendre(); corps.scrollTop = 0; return; }
    if (b.dataset.badge) { S.filtre.badge = S.filtre.badge === b.dataset.badge ? '' : b.dataset.badge; rechargerTableau(); return; }
    if (b.dataset.rapide !== undefined) { const on = S.filtre.badge === 'PAS CHÈRE' && S.filtre.qMin >= 7; Object.assign(S.filtre, on ? { badge: '', qMin: 0 } : { badge: 'PAS CHÈRE', qMin: 7, tri: 'mos', sens: -1 }); rechargerTableau(); return; }
    if (b.dataset.tri) { const k = b.dataset.tri; S.filtre.sens = S.filtre.tri === k ? -S.filtre.sens : (k === 'nom' || k === 'tk' || k === 'secteur' || k === 'pays' ? 1 : -1); S.filtre.tri = k; rechargerTableau(); return; }
    if (b.dataset.tk) ouvrirFiche(b.dataset.tk);
  });
  el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-tk]')) { e.preventDefault(); ouvrirFiche(e.target.dataset.tk); } else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('th[data-tri]')) { e.preventDefault(); e.target.click(); }
    else if (e.key === 'Enter' && e.target.matches('[data-ajout]')) { const v = e.target.value.trim().toUpperCase(), l = S.lignes.find(x => x.tk === v) || S.lignes.find(x => x.nom.toUpperCase().includes(v)); if (l && !suivie(l.tk)) { S.liste.push(l.tk); sauverListe(); rendre(); } else dire(l ? 'Déjà dans ta liste.' : 'Aucune entreprise ne correspond.', !l); } });
  el.addEventListener('change', e => { const f = e.target.dataset && e.target.dataset.f; if (f && f !== 'texte') { S.filtre[f] = f === 'qMin' ? +e.target.value : e.target.value; rechargerTableau(); } });
  let tFiltre = null; el.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.f === 'texte') { clearTimeout(tFiltre); const v = e.target.value; tFiltre = setTimeout(() => { S.filtre.texte = v; S.page = 1; ecrireLS(LS.filtre, S.filtre); const pos = e.target.selectionStart; rendre(); const i = zone.querySelector('[data-f="texte"]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) { /* */ } } }, 250); } });

  function fermer() { if (S.ferme) return; S.ferme = true; clearInterval(S.minuteur); clearTimeout(tFiltre); viderGraphs(); el.remove(); instance = null; try { onFermer(); } catch (e) { /* */ } }
  instance = { fermer, etat: () => ({ actif: true, onglet: S.onglet, lignes: S.lignes.length, liste: S.liste.slice(), fiche: S.fiche && S.fiche.tk, workerOk: S.workerOk, filtre: { ...S.filtre } }), ouvrirFiche, rendre, aller: o => { S.onglet = o; rendre(); }, lignes: () => S.lignes };
  zone.innerHTML = '<p class="tp-att">Chargement du panier…</p>';
  try { await chargerIndex(); rendre(); } catch (e) { zone.innerHTML = `<p class="tp-panne" role="alert">${esc(e.message)}</p>`; }
  liste_depuis_worker().then(() => { if (!S.ferme && !S.fiche && (S.onglet === 'liste')) rendre(); }); evenements(); S.minuteur = setInterval(evenements, 5 * 60e3);
  return instance;
}
export function fermer() { if (instance) instance.fermer(); }
/* médianes du secteur (PER, EV/EBITDA, rendement FCF) calculées sur l'index */
function medianesSecteur(lignes, l) {
  const S = lignes.filter(x => x.secteur === l.secteur && x.pays === l.pays), m = k => { const v = S.map(x => x[k]).filter(x => Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };
  return S.length >= 3 ? { n: S.length, per: m('per'), ev: m('ev'), fy: m('fy') } : null;
}
