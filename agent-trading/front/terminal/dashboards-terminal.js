/* ═════════════ TERMINAL : SECTIONS DE LA PAGE QUI DÉFILE (2026-11-08, remplace le panneau bas à onglets ; ancienne version : idees/) ═════════════
   Tableau de bord multi-unités, santé du marché, calendrier et annonces, COT complet, rapports et analyses publics, actualités, cotations.
   Sources : Kraken (relais du PC ou relais dédié), Binance (acheteurs / vendeurs), CFTC en direct (CORS ouvert), routes DÉJÀ EN LIGNE du
   Worker de Rayle par window.wjson (le Worker n'est pas modifié), serveur du PC pour ce qui n'a pas de CORS (Yahoo, flux RSS, calendrier).
   Jamais un chiffre inventé : une source absente s'affiche « indisponible » avec la raison. Chaque section n'est calculée que visible. */
import { resumeCot, COT_ABSENT, annonces, prochaine, dansMinutes, actusFinance } from './dashboards-calcul.js';
import { ACTIFS_TERMINAL, PAR_ID_T, UNITES, fmt } from './actifs-terminal.js';
import { tickers, ticker24hBinance, cotCftc, volNetBinance, cotesJour, rapportsPublics, calendrierBrut } from './sources-terminal.js';
import { colonne, colonneGlobale, detailScore, SCORE_V1, rangAtr, volumesRecents, seances, correlation, motCorrelation, cotComplet, CATEGORIES_COT,
  calendrierSemaine, filtrerCalendrier, compteARebours, LIES, CORRELES, variationJour } from './tableau-calcul.js';
import { niveauxPeriode } from '../or/niveaux-periode.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nbr = (x, d = 0) => x == null || !Number.isFinite(+x) ? '—' : (+x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, ' ');
const sg = (x, d = 0) => x == null ? '—' : (x > 0 ? '+' : '') + nbr(x, d);
const usd = x => { if (x == null || !Number.isFinite(x)) return '—'; const a = Math.abs(x), s = x > 0 ? '+' : x < 0 ? '−' : ''; return s + (a >= 1e9 ? nbr(a / 1e9, 2) + ' Md $' : a >= 1e6 ? nbr(a / 1e6, 2) + ' M $' : a >= 1e3 ? nbr(a / 1e3, 1) + ' k $' : nbr(a, 0) + ' $'); };
const TZ = 'Europe/Paris';
const HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const HM = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const DATE = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const heure = t => HEURE.format(new Date(t));
const wj = () => (typeof globalThis.wjson === 'function' ? globalThis.wjson : null);
const pause = () => new Promise(r => setTimeout(r, 0));
const UNITES_TB = ['M5', 'M15', 'H1', 'J'];
const lireL = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const ecrireL = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };

/* ── petits graphiques SVG (aucune bibliothèque, rendu en une passe) ── */
function spark(vals, { l = 220, h = 46, col = '#8fd0e3', ligne2 = null, col2 = '#c9b27a', barres = false, ref = null, aria = '' } = {}) {
  const V = vals.filter(Number.isFinite), V2 = ligne2 ? ligne2.filter(Number.isFinite) : []; if (V.length < 2) return '<span class="tr-doux">—</span>';
  const tous = barres ? [0, ...V] : V.concat(V2, ref != null ? [ref] : []), mn = Math.min(...tous), mx = Math.max(...tous), k = mx - mn || 1;
  const y = v => (h - 3 - (v - mn) / k * (h - 6)).toFixed(1), x = (i, n) => (i / (n - 1) * (l - 2) + 1).toFixed(1);
  const pts = (A) => A.map((v, i) => Number.isFinite(v) ? `${x(i, A.length)},${y(v)}` : null).filter(Boolean).join(' ');
  let s = `<svg class="tr-spark" viewBox="0 0 ${l} ${h}" width="${l}" height="${h}" role="img" aria-label="${esc(aria)}">`;
  if (barres) { const bw = (l - 2) / V.length; V.forEach((v, i) => { s += `<rect x="${(1 + i * bw).toFixed(1)}" y="${y(v)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${(h - 3 - y(v)).toFixed(1)}" fill="${col}" opacity=".55"/>`; }); }
  else s += `<polyline points="${pts(vals)}" fill="none" stroke="${col}" stroke-width="1.4"/>`;
  if (ligne2) s += `<polyline points="${pts(ligne2)}" fill="none" stroke="${col2}" stroke-width="1" stroke-dasharray="3 2"/>`;
  if (ref != null) s += `<line x1="0" x2="${l}" y1="${y(ref)}" y2="${y(ref)}" stroke="#c9b27a" stroke-width="1" stroke-dasharray="2 3"/>`;
  return s + '</svg>';
}
/* courbes multiples avec axe (COT) */
function courbes(series, { l = 1500, h = 260, dates = [] } = {}) {
  const tous = series.flatMap(s => s.v).filter(Number.isFinite); if (tous.length < 4) return '<p class="tr-doux">Pas assez de semaines pour le graphique.</p>';
  const mn = Math.min(0, ...tous), mx = Math.max(0, ...tous), k = mx - mn || 1, g = 58, n = Math.max(...series.map(s => s.v.length));
  const y = v => (h - 22 - (v - mn) / k * (h - 34)).toFixed(1), x = i => (g + i / (n - 1) * (l - g - 8)).toFixed(1);
  let s = `<svg class="tr-courbes" viewBox="0 0 ${l} ${h}" role="img" aria-label="Positions nettes par catégorie">`;
  const ticks = [0]; for (const v of [mx, (mx + mn) / 2, mn]) if (ticks.every(u => Math.abs(y(u) - y(v)) > 16)) ticks.push(v);
  for (const v of ticks) s += `<line x1="${g}" x2="${l - 8}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(143,208,227,${v === 0 ? '.35' : '.08'})"/><text x="${g - 6}" y="${+y(v) + 4}" text-anchor="end">${esc(nbr(v / 1000, 0))} k</text>`;
  for (const i of [0, Math.floor((n - 1) / 2), n - 1]) if (dates[i]) s += `<text x="${x(i)}" y="${h - 5}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(dates[i])}</text>`;
  for (const se of series) s += `<polyline points="${se.v.map((v, i) => Number.isFinite(v) ? `${x(i)},${y(v)}` : null).filter(Boolean).join(' ')}" fill="none" stroke="${se.col}" stroke-width="1.6"/>`;
  return s + '</svg>';
}
const barreCentre = (r) => r == null ? '<span class="tr-doux">—</span>' : `<span class="tr-jauge-c" title="${nbr(r, 2)}"><i style="${r >= 0 ? `left:50%;width:${Math.abs(r) * 50}%` : `right:50%;width:${Math.abs(r) * 50}%`}" class="${r >= 0 ? 'h' : 'b'}"></i></span>`;

export function creerDashboards(R, T) {
  const D = { cot: null, cotErr: null, cotActif: null, cotSrc: '', annonces: [], semaine: [], calErr: null, calSrc: '', actus: [], actusErr: null, cot_t: 0, cal_t: 0, act_t: 0, cotations: {}, cotErr2: null,
    tableau: null, tabErr: null, tab_t: 0, tabActif: null, enCalcul: false, hist: { spread: [], achat: [] }, corr: null, corrErr: null, corr_t: 0, corrActif: null, lies: null, liesErr: null, lies_t: 0,
    rapports: null, rapErr: null, rap_t: 0, filtre: lireL('rayle_term_cal_filtre', { devises: [], impact: 'faible' }), detruit: false };
  const zone = id => R.querySelector(`[data-section="${id}"] [data-c]`);
  const sous = (id, t) => { const e = R.querySelector(`[data-section="${id}"] [data-sous]`); if (e) e.textContent = t; };
  const pDash = R.querySelector('[data-panneau="dash"]');
  pDash.innerHTML = `<div class="tr-dash"><section class="tr-carte" data-d="cotations"><h3>Cotations <small>Kraken Futures · un clic change l’actif</small></h3><div data-cc></div></section></div>`;
  const TT = () => T.terminal();
  const visible = id => T.visible(id);

  /* ═════ TABLEAU DE BORD MULTI-UNITÉS ═════ */
  async function calculerTableau() {
    if (D.enCalcul || D.detruit) return; D.enCalcul = true; const actif = T.actif(), A = PAR_ID_T[actif], t0 = Date.now();
    try {
      const cols = {}, c = TT().etatCarnet(), ach = c && Number.isFinite(c.desequilibre) ? c.desequilibre : null, prix = TT().prix();
      for (const u of UNITES_TB) {
        if (actif !== T.actif()) return;
        let B = [], se = null; try { se = await TT().serieDe(actif, u); B = se.bougies(); } catch (e) { cols[u] = { pret: false, raison: 'bougies indisponibles' }; continue; }
        // moins de 220 bougies (SMA 200 impossible) : l'historique de référence se complète en arrière-plan, le tableau se recalcule ensuite
        if (B.filter(b => !b.bande).length < 220) { const i = se.info(); if (!i.enCours && !i.toutFini) se.remonterTout({ surPage: () => { D.tab_t = 0; } }); }
        await pause();
        const K = B.filter(b => !b.bande); let niv = [];
        try { const np = niveauxPeriode(K.slice(-1500), { periode: u, maintenant: Date.now(), prix: prix || (K.length ? K[K.length - 1].c : null) }); niv = (np && np.bandes) || []; } catch (e) { niv = []; }
        let vol = null, volSrc = null;
        if (A.ref && A.ref.source === 'binance-f') { try { vol = await volNetBinance(A.ref.symbole, u, 20); volSrc = A.ref.nom; } catch (e) { vol = null; } }
        cols[u] = { ...colonne({ B: K, niveaux: niv, vol, acheteurs: ach, prix }), volSrc };
        await pause();
      }
      cols.G = colonneGlobale(cols, prix);
      D.tableau = { actif, cols, t: Date.now(), ms: Date.now() - t0, carnet: ach }; D.tabErr = null; D.tab_t = Date.now(); D.tabActif = actif;
    } catch (e) { D.tabErr = String(e.message || e); }
    finally { D.enCalcul = false; }
    rendreTableau();
  }
  function rendreTableau() {
    const z = zone('tableau'); if (!z) return; const x = D.tableau, actif = T.actif();
    if (D.tabErr) { z.innerHTML = `<p class="tr-doux">Tableau indisponible : ${esc(D.tabErr)}</p>`; return; }
    if (!x || x.actif !== actif) { z.innerHTML = '<p class="tr-doux">Calcul du tableau sur M5, M15, H1 et Jour…</p>'; return; }
    const U = [...UNITES_TB, 'G'], nomU = u => (u === 'J' ? 'Jour' : u === 'G' ? 'Global' : u), A = PAR_ID_T[actif];
    const cel = (u, f) => { const c = x.cols[u]; return c && c.pret ? f(c) : `<td class="tr-doux">${esc((c && c.raison) || '—')}</td>`; };
    const tend = c => `<td class="${c.tendance.sens === 'haussière' ? 'tr-up' : c.tendance.sens === 'baissière' ? 'tr-down' : 'tr-doux'}" title="${esc(c.tendance.raison)}">${c.tendance.sens === 'haussière' ? '▲ haussière' : c.tendance.sens === 'baissière' ? '▼ baissière' : c.tendance.sens}${c.tendance.faible ? ' <small>(faible)</small>' : ''}</td>`;
    const rs = c => `<td class="tr-mono ${c.rsi >= 70 ? 'tr-down' : c.rsi <= 30 ? 'tr-up' : ''}">${c.rsi == null ? '—' : nbr(c.rsi, 1)}${c.rsi >= 70 ? ' <small>suracheté</small>' : c.rsi <= 30 ? ' <small>survendu</small>' : ''}</td>`;
    const vn = c => `<td class="tr-mono ${c.volNet && c.volNet.net > 0 ? 'tr-up' : c.volNet && c.volNet.net < 0 ? 'tr-down' : 'tr-doux'}">${c.volNet ? usd(c.volNet.net) : 'indisponible'}</td>`;
    const sc = (c, u) => `<td><span class="tr-score ${c.score.couleur}" tabindex="0" data-score="${u}" title="${esc(c.score.moyenne ? `Global = moyenne pondérée des scores (M5 1, M15 1, H1 2, Jour 3). ${SCORE_V1.mention}.` : detailScore(c.score))}">${c.score.total}<small>/100</small></span> <small>${esc(c.score.mot)}</small></td>`;
    z.innerHTML = `<div class="tr-defile-x"><table class="tr-tb">
      <thead><tr><th></th>${U.map(u => `<th>${nomU(u)}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><th>Tendance</th>${U.map(u => cel(u, tend)).join('')}</tr>
        <tr><th>RSI (14)</th>${U.map(u => cel(u, rs)).join('')}</tr>
        <tr><th>Vol net USD</th>${U.map(u => cel(u, vn)).join('')}</tr>
        <tr><th>Support</th>${U.map(u => cel(u, c => `<td class="tr-mono tr-up">${c.support != null ? fmt(actif, c.support) : '—'}</td>`)).join('')}</tr>
        <tr><th>Résistance</th>${U.map(u => cel(u, c => `<td class="tr-mono tr-down">${c.resistance != null ? fmt(actif, c.resistance) : '—'}</td>`)).join('')}</tr>
        <tr><th>Score</th>${U.map(u => cel(u, c => sc(c, u))).join('')}</tr>
        <tr class="tr-tb-mini"><th>Tendance <small>(60 bougies, SMA 200 en pointillés)</small></th>${U.map(u => u === 'G' ? '<td class="tr-doux">—</td>' : cel(u, c => `<td>${spark(c.mini, { l: 150, h: 40, ligne2: c.miniMa, col: c.tendance.sens === 'haussière' ? '#4fd18b' : '#ef6a5f', aria: 'tendance ' + nomU(u) })}</td>`)).join('')}</tr>
      </tbody></table></div>
      <div class="tr-score-detail" data-score-detail><b>Score : ${esc(SCORE_V1.mention)}.</b> ${esc(SCORE_V1.texte)} <small>(${SCORE_V1.id}, formule figée)</small></div>
      <p class="tr-mini">Tendance : prix face à la SMA 200 de CHAQUE unité (« faible » : pente de la SMA contraire). Support et résistance : niveaux automatiques (règles niveaux-periode-v1) les plus proches du prix.
      Vol net USD : acheteurs moins vendeurs au marché sur les 20 dernières bougies de l’unité${A.ref ? `, source ${esc(A.ref.nom)}` : ' — <b>indisponible pour cet actif</b> : aucune source gratuite ne publie les acheteurs et vendeurs de l’indice'}. Carnet : ${x.carnet != null ? nbr(x.carnet * 100, 0) + ' % d’acheteurs à ± 0,5 %' : 'pas encore reçu'}. Calculé en ${x.ms} ms à ${HM.format(new Date(x.t))}.</p>`;
  }
  R.addEventListener('focusin', e => { const s = e.target.closest && e.target.closest('[data-score]'); if (s) montrerScore(s.dataset.score); });
  R.addEventListener('mouseover', e => { const s = e.target.closest && e.target.closest('[data-score]'); if (s) montrerScore(s.dataset.score); });
  function montrerScore(u) { const x = D.tableau, el = R.querySelector('[data-score-detail]'); if (!x || !el) return; const c = x.cols[u]; if (!c || !c.pret) return; el.textContent = c.score.moyenne ? `Global : moyenne pondérée des scores des unités (M5 1, M15 1, H1 2, Jour 3) = ${c.score.total}/100. ${SCORE_V1.mention}.` : `${u === 'J' ? 'Jour' : u} : ${detailScore(c.score)}`; }

  /* ═════ SANTÉ DU MARCHÉ ═════ */
  function echantillonner() { const c = TT().etatCarnet(); if (!c) return; const H = D.hist; H.spread.push(c.spread); H.achat.push(Number.isFinite(c.desequilibre) ? c.desequilibre * 100 : null); if (H.spread.length > 200) { H.spread.shift(); H.achat.shift(); } }
  async function chargerCorrelations() {
    const actif = T.actif(), L = CORRELES[actif] || []; D.corrActif = actif;
    try {
      const [d, J] = await Promise.all([cotesJour(L.map(x => x[0]), { range: '6mo' }), TT().serieDe(actif, 'J').then(s => s.bougies().filter(b => !b.bande).map(b => ({ t: b.t, c: b.c }))).catch(() => [])]);
      D.corr = { source: d.source, L: L.map(([s, nom]) => { const c = d.cotes[s]; return { s, nom, ...(c && c.serie ? correlation(J, c.serie, 60) : { r: null, n: 0 }), erreur: c && c.erreur }; }) }; D.corrErr = null; D.corr_t = Date.now();
    } catch (e) { D.corr = null; D.corrErr = String(e.message || e); }
    rendreSante(true);
  }
  async function chargerLies() {
    const actif = T.actif(), Ls = LIES[actif]; if (!Ls) return;
    try { const d = await cotesJour(Ls.syms, { range: '5d' }); D.lies = { actif, source: d.source, L: Ls.syms.map(s => ({ s, ...(d.cotes[s] || { erreur: 'absent' }) })) }; D.liesErr = null; D.lies_t = Date.now(); }
    catch (e) { D.lies = null; D.liesErr = String(e.message || e); }
    rendreSante(true);
  }
  let santeAvant = '';
  function rendreSante(force = false) {
    echantillonner();
    const z = zone('sante'); if (!z || (!force && !visible('sante'))) return;
    const s = T.sante(), actif = T.actif(), A = PAR_ID_T[actif], ser = TT().serie(), B = ser ? ser.bougies() : [];
    sous('sante', `${A.nom} · ${T.unite() === 'J' ? 'Jour' : T.unite()} · volatilité, volume, spread, carnet, séances, corrélations, entreprises liées`);
    const ra = rangAtr(B), vr = volumesRecents(B, 50), now = Date.now(), SE = seances(now), H = D.hist, d = s && s.desequilibre;
    const jour0 = (() => { const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(now)); const h = +p.find(x => x.type === 'hour').value, m = +p.find(x => x.type === 'minute').value; return now - (h * 60 + m) * 60e3; })();
    const pos = t => Math.max(0, Math.min(100, (t - jour0) / 864e5 * 100));
    const barreSeance = x => { const a = pos(x.debutUtc), b = pos(x.finUtc); return `<div class="tr-seance ${x.ouverte ? 'ouverte' : ''}"><span>${esc(x.nom)}</span><div class="tr-seance-piste"><i style="left:${a}%;width:${Math.max(0.5, b - a)}%"></i><b style="left:${pos(now)}%"></b></div><em>${x.weekend ? 'week-end' : x.ouverte ? `ouverte · ferme dans ${compteARebours(x.fermeDans)}` : x.ouvreDans != null ? `fermée · ouvre dans ${compteARebours(x.ouvreDans)}` : 'fermée'}</em></div>`; };
    const lies = D.lies && D.lies.actif === actif ? D.lies : null, Ls = LIES[actif];
    const html = `<div class="tr-grille">
      <div class="tr-carte"><h3>Volatilité <small>ATR (14) et rang historique</small></h3>
        ${s && s.volatilite ? `<p class="tr-gros">${esc(s.volatilite.mot)} <small>ATR ${fmt(actif, s.volatilite.atr)} · ${nbr(s.volatilite.rapport, 2)} × sa médiane récente</small></p>` : '<p class="tr-doux">En attente des bougies…</p>'}
        ${ra ? `<p>Rang historique : <b>${ra.rang}e centile</b> <small>sur ${nbr(ra.n)} valeurs d’ATR de l’historique chargé (100 = le plus agité)</small></p>${spark(ra.serie, { l: 300, h: 56, aria: 'ATR 200 dernières bougies' })}` : ''}</div>
      <div class="tr-carte"><h3>Volume relatif <small>50 dernières bougies, médiane en pointillés</small></h3>
        ${s && s.volumeRelatif ? `<p class="tr-gros">${esc(s.volumeRelatif.mot)} <small>${nbr(s.volumeRelatif.rapport, 2)} × la médiane des 20 dernières bougies</small></p>` : '<p class="tr-doux">—</p>'}
        ${vr.v.length > 5 ? spark(vr.v, { l: 300, h: 56, barres: true, ref: vr.mediane, aria: 'volumes' }) : ''}<p class="tr-mini">Volume des bougies Kraken (le volume du perpétuel, pas celui du marché au comptant).</p></div>
      <div class="tr-carte"><h3>Spread <small>écart entre meilleur vendeur et meilleur acheteur</small></h3>
        ${s && s.spread != null ? `<p class="tr-gros tr-mono">${fmt(actif, s.spread)} <small>${nbr(s.spreadPct, 3)} % du prix</small></p>` : '<p class="tr-doux">Carnet pas encore reçu.</p>'}
        ${H.spread.filter(Number.isFinite).length > 3 ? spark(H.spread, { l: 300, h: 46, col: '#c9b27a', aria: 'spread' }) + `<p class="tr-mini">${H.spread.length} relevés, un toutes les 3 s depuis l’ouverture du terminal.</p>` : ''}</div>
      <div class="tr-carte"><h3>Acheteurs / vendeurs <small>carnet à ± 0,5 % du prix</small></h3>
        ${d ? `<div class="tr-partage"><i style="width:${nbr(d.achat * 100, 1).replace(',', '.')}%"></i></div><p><span class="tr-up">${nbr(d.achat * 100, 0)} % acheteurs</span> · <span class="tr-down">${nbr((1 - d.achat) * 100, 0)} % vendeurs</span></p>` : '<p class="tr-doux">Carnet pas encore reçu.</p>'}
        ${H.achat.filter(Number.isFinite).length > 3 ? spark(H.achat, { l: 300, h: 46, ref: 50, aria: 'part des acheteurs' }) : ''}</div>
      <div class="tr-carte tr-large"><h3>Séances <small>heure de Paris, aujourd’hui ; le trait clair = maintenant</small></h3>${SE.map(barreSeance).join('')}
        <p class="tr-mini">Tokyo 9 h-18 h, Londres 8 h-16 h 30, New York 9 h 30-16 h (heures locales des bourses, changements d’heure compris). Les cryptos s’échangent tout le temps ; l’or et le Nasdaq suivent ces séances.</p></div>
      <div class="tr-carte"><h3>Corrélations <small>rendements journaliers, 60 jours</small></h3>
        ${D.corr && D.corrActif === actif ? `<table class="tr-tab">${D.corr.L.map(c => `<tr><td>${esc(c.nom)}</td><td>${barreCentre(c.r)}</td><td class="tr-mono">${c.r == null ? (c.erreur ? 'indisponible' : '—') : sg(c.r, 2)}</td><td><small>${esc(motCorrelation(c.r))}</small></td></tr>`).join('')}</table><p class="tr-mini">Source : ${esc(D.corr.source)}. Une corrélation passée ne dit pas l’avenir.</p>`
          : `<p class="tr-doux">${D.corrErr ? 'Indisponible : ' + esc(D.corrErr) : 'Chargement…'}</p>`}</div>
      <div class="tr-carte"><h3>${esc(Ls ? Ls.titre : 'Instruments liés')} <small>variation du jour</small></h3>
        ${lies ? `<table class="tr-tab">${lies.L.map(c => { const v = variationJour(c); return `<tr><td><b>${esc(c.s)}</b> <small>${esc(c.nom && c.nom !== c.s ? c.nom : '')}</small></td><td class="tr-mono">${c.prix != null ? nbr(c.prix, c.prix < 10 ? 3 : 2) : '—'}</td><td class="tr-mono ${v > 0 ? 'tr-up' : v < 0 ? 'tr-down' : ''}">${v == null ? (c.erreur ? 'indisponible' : '—') : sg(v, 2) + ' %'}</td></tr>`; }).join('')}</table><p class="tr-mini">${esc(Ls.note)}. Source : ${esc(lies.source)}.</p>`
          : `<p class="tr-doux">${D.liesErr ? 'Indisponible : ' + esc(D.liesErr) : 'Chargement…'}</p>`}</div>
    </div>`;
    if (html !== santeAvant) { z.innerHTML = html; santeAvant = html; }
  }

  /* ═════ CALENDRIER ═════ */
  async function chargerCalendrier() {
    try { const r = await calendrierBrut(); D.semaine = calendrierSemaine(r.liste); D.annonces = annonces(r.liste); D.calSrc = r.source; D.calErr = null; D.cal_t = Date.now(); }
    catch (e) { D.calErr = 'Calendrier indisponible : ' + (e.message || e); }
    rendreCal(); try { TT().graph.redessiner(); } catch (e) { /* */ }
  }
  function rendreCal() {
    const z = zone('calendrier'); if (!z) return; if (D.calErr) { z.innerHTML = `<p class="tr-doux">${esc(D.calErr)}</p>`; return; }
    if (!D.semaine.length) { z.innerHTML = '<p class="tr-doux">Chargement du calendrier…</p>'; return; }
    const now = Date.now(), F = D.filtre, devs = [...new Set(D.semaine.map(e => e.devise))].sort(), L = filtrerCalendrier(D.semaine, { devises: F.devises, impactMin: F.impact });
    const p = prochaine(D.annonces, now); sous('calendrier', `ForexFactory · semaine en cours · heure de Paris · ${D.calSrc}`);
    let j = '';
    z.innerHTML = `${p ? `<div class="tr-rebours"><span>Prochaine annonce forte</span><b>${esc(p.devise)} ${esc(p.titre)}</b><em>${esc(heure(p.t))}</em><strong data-rebours="${p.t}">${compteARebours(p.t - now)}</strong></div>` : '<p class="tr-doux">Aucune annonce forte à venir cette semaine (la source ne couvre que la semaine en cours).</p>'}
      <div class="tr-filtres"><span>Devises :</span>${devs.map(d => `<label class="tr-puce"><input type="checkbox" data-cal-dev="${esc(d)}" ${!F.devises.length || F.devises.includes(d) ? 'checked' : ''}> ${esc(d)}</label>`).join('')}
        <label>Impact minimum <select data-cal-imp><option value="faible" ${F.impact === 'faible' ? 'selected' : ''}>tous</option><option value="moyen" ${F.impact === 'moyen' ? 'selected' : ''}>moyen et fort</option><option value="fort" ${F.impact === 'fort' ? 'selected' : ''}>fort seulement</option></select></label>
        <span class="tr-mini">Alerte 15 min avant chaque annonce forte ; l’heure des annonces fortes est surlignée sur le graphique.</span></div>
      <div class="tr-defile-x"><table class="tr-tableau tr-cal"><thead><tr><th>Heure</th><th>Devise</th><th>Impact</th><th>Annonce</th><th>Précédent</th><th>Prévision</th><th>Résultat</th></tr></thead><tbody>${L.map(e => { const jj = JOUR.format(new Date(e.t)); const t = jj !== j ? `<tr class="tr-cal-jour"><td colspan="7">${esc(jj)}</td></tr>` : ''; j = jj;
        return t + `<tr class="${e.t < now ? 'passe' : ''} ${p && e.t === p.t && e.titre === p.titre ? 'prochaine' : ''}"><td class="tr-mono">${esc(HM.format(new Date(e.t)))}</td><td><b>${esc(e.devise)}</b></td><td><span class="tr-impact imp-${e.impact}">${e.impact === 'ferie' ? 'férié' : e.impact}</span></td><td>${esc(e.titre)}</td><td class="tr-mono">${esc(e.precedent || '—')}</td><td class="tr-mono">${esc(e.prevu || '—')}</td><td class="tr-mono">${e.reel ? `<b>${esc(e.reel)}</b>` : '—'}</td></tr>`; }).join('') || '<tr><td colspan="7" class="tr-doux">Aucune annonce avec ces filtres.</td></tr>'}</tbody></table></div>`;
  }
  R.addEventListener('change', e => {
    const dv = e.target.closest('[data-cal-dev]'), im = e.target.closest('[data-cal-imp]'); if (!dv && !im) return;
    if (dv) { const tous = [...R.querySelectorAll('[data-cal-dev]')], ch = tous.filter(x => x.checked).map(x => x.dataset.calDev); D.filtre.devises = ch.length === tous.length ? [] : ch; }
    if (im) D.filtre.impact = im.value; ecrireL('rayle_term_cal_filtre', D.filtre); rendreCal();
  });
  const rebours = setInterval(() => { for (const e of R.querySelectorAll('[data-rebours]')) e.textContent = compteARebours(+e.dataset.rebours - Date.now()); }, 1000);
  /* heure des annonces fortes surlignée sur le graphique */
  try {
    T.graph.ajouterPrimitive((ctx, Dm) => {
      const L = D.annonces.filter(a => a.impact === 'fort'); if (!L.length) return; const G = T.graph; ctx.font = '10px Segoe UI, system-ui, sans-serif';
      for (const a of L) { const x = G.xDe(a.t); if (x == null || x < 0 || x > Dm.width) continue; const xx = Math.round(x) + 0.5;
        ctx.strokeStyle = 'rgba(201,178,122,.55)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, Dm.height); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#c9b27a'; ctx.save(); ctx.translate(xx + 3, 14); ctx.fillText(`${a.devise} ${a.titre.slice(0, 28)} · ${HM.format(new Date(a.t))}`, 0, 0); ctx.restore(); }
    }, 'bottom');
  } catch (e) { /* graphique pas prêt */ }

  /* ═════ COT COMPLET ═════ */
  async function chargerCot(actif) {
    const A = PAR_ID_T[actif]; if (D.cotActif !== actif) { D.cot = null; D.cotErr = null; rendreCot(); }   // jamais le COT d'un autre actif à l'écran
    D.cotActif = actif;
    if (!A.cot) { D.cot = null; D.cotErr = COT_ABSENT[actif] || 'Pas de rapport COT pour cet actif.'; return rendreCot(); }
    try { const r = await cotCftc(A.cot, { semaines: 78 }); if (T.actif() !== actif) return; D.cot = cotComplet(r.lignes, r.nom); D.cotSrc = 'CFTC en direct (publicreporting.cftc.gov)'; D.cotErr = D.cot ? null : 'réponse CFTC vide'; }
    catch (e) {
      const w = wj(); D.cot = null;
      if (w) { try { const x = resumeCot(await w(`/cot?actif=${A.cot}&semaines=52`, 20000)); if (x) { D.cot = { ancien: x }; D.cotSrc = 'CFTC par le Worker de Rayle (résumé)'; D.cotErr = null; } } catch (x2) { /* */ } }
      if (!D.cot) D.cotErr = 'COT indisponible : ' + (e.message || e);
    }
    D.cot_t = Date.now(); rendreCot();
  }
  function rendreCot() {
    const z = zone('cot'); if (!z) return; if (D.cotErr) { z.innerHTML = `<p class="tr-doux">${esc(D.cotErr)}</p>`; return; }
    const x = D.cot; if (!x) { z.innerHTML = '<p class="tr-doux">Chargement…</p>'; return; }
    if (x.ancien) { const a = x.ancien; z.innerHTML = `<p><b>${esc(a.nom)}</b> · positions du mardi ${esc(a.date)}</p><table class="tr-tableau"><thead><tr><th>Catégorie</th><th>Achats</th><th>Ventes</th><th>Net</th></tr></thead><tbody>${a.categories.map(k => `<tr><td>${esc(k.nom)}</td><td>${nbr(k.long)}</td><td>${nbr(k.short)}</td><td>${sg(k.net)}</td></tr>`).join('')}</tbody></table><p class="tr-mini">${esc(D.cotSrc)} : la CFTC en direct n’a pas répondu, seul le résumé est disponible.</p>`; return; }
    const COL = { spec: '#8fd0e3', comm: '#c9b27a', petits: '#9aa7b0' }, S = x.serie.slice(-78);
    sous('cot', `${x.nom} · CFTC · Legacy futures only · hebdomadaire`);
    z.innerHTML = `<p class="tr-gros"><b>${esc(x.nom)}</b> <small>positions du mardi ${esc(DATE.format(new Date(x.date + 'T12:00:00Z')))}, publiées le vendredi ${esc(DATE.format(new Date(x.publication + 'T12:00:00Z')))} · intérêt ouvert ${nbr(x.oi)} contrats (${sg(x.oiVar)} sur la semaine)</small></p>
      <div class="tr-defile-x"><table class="tr-tableau tr-cot-tab"><thead><tr><th>Catégorie</th><th>Achats</th><th>Ventes</th><th>Net</th><th>Variation du net (semaine)</th><th>Achats / ventes (semaine)</th><th>Net en % de l’intérêt ouvert</th><th>Achats · ventes en % de l’intérêt ouvert</th></tr></thead>
      <tbody>${x.categories.map(k => `<tr><td><i class="tr-pt" style="background:${COL[k.id]}"></i>${esc(k.nom)}</td><td class="tr-mono">${nbr(k.long)}</td><td class="tr-mono">${nbr(k.short)}</td><td class="tr-mono ${k.net > 0 ? 'tr-up' : k.net < 0 ? 'tr-down' : ''}">${sg(k.net)}</td><td class="tr-mono">${sg(k.variation)}</td><td class="tr-mono">${sg(k.varLong)} · ${sg(k.varShort)}</td><td class="tr-mono">${sg(k.pctOi, 1)} %</td><td class="tr-mono">${nbr(k.pctLong, 1)} % · ${nbr(k.pctShort, 1)} %</td></tr>`).join('')}</tbody></table></div>
      <h4 class="tr-sous">Positions nettes sur ${S.length} semaines</h4>
      <p class="tr-legende">${CATEGORIES_COT.map(k => `<span><i class="tr-pt" style="background:${COL[k.id]}"></i>${esc(k.nom)}</span>`).join('')}</p>
      ${courbes(CATEGORIES_COT.map(k => ({ col: COL[k.id], v: S.map(p => p[k.id]) })), { dates: S.map(p => DATE.format(new Date(p.date + 'T12:00:00Z'))) })}
      <p class="tr-doux">Lecture : ${esc(x.lecture || '—')}. Les commerciaux (producteurs, couvertures) font en général l’inverse des spéculateurs.</p><p class="tr-mini">Source : ${esc(D.cotSrc)}, gratuite, sans clé.</p>`;
  }

  /* ═════ RAPPORTS ET ANALYSES (sources publiques) ═════ */
  async function chargerRapports() {
    try { D.rapports = await rapportsPublics(); D.rapErr = null; D.rap_t = Date.now(); } catch (e) { D.rapports = null; D.rapErr = String(e.message || e); D.rap_t = Date.now(); }
    rendreRapports();
  }
  function rendreRapports() {
    const z = zone('rapports'); if (!z) return;
    if (D.rapErr) { z.innerHTML = `<p class="tr-doux">Rapports indisponibles : ${esc(D.rapErr)}.</p><p class="tr-mini">Sources prévues : Fed (communiqués, procès-verbaux), BCE, BRI (discours des banquiers centraux), Banque d’Angleterre, World Gold Council, ING Think. FMI : refuse les lecteurs automatiques.</p>`; return; }
    const d = D.rapports; if (!d) { z.innerHTML = '<p class="tr-doux">Chargement des rapports publics…</p>'; return; }
    const tous = d.sources.flatMap(s => s.items.map(i => ({ ...i, source: s.nom, banque: s.banque }))).filter((i, k, A) => A.findIndex(j => j.lien && j.lien === i.lien) === k).sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 24);
    z.innerHTML = `<div class="tr-rapports">${tous.map(i => `<article class="tr-rapport"><header><span class="tr-pastille">${esc(i.banque)}</span><time>${i.date ? esc(DATE.format(new Date(i.date))) : 'date inconnue'}</time></header><h4>${i.lien ? `<a href="${esc(i.lien)}" target="_blank" rel="noopener">${esc(i.titre)}</a>` : esc(i.titre)}</h4>${i.resume && i.resume !== i.titre ? `<p>${esc(i.resume)}</p>` : ''}<footer>${esc(i.source)}</footer></article>`).join('')}</div>
      <h4 class="tr-sous">État des sources</h4><ul class="tr-liste">${d.sources.map(s => `<li><span class="tr-pastille ${s.ok ? 'ok' : 'ko'}">${s.ok ? 'lue' : 'en panne'}</span> ${esc(s.nom)}${s.ok ? ` <small>${s.items.length} éléments${s.items[0] && s.items[0].date && Date.now() - s.items[0].date > 180 * 864e5 ? ' · flux peu à jour (dernier élément ' + esc(DATE.format(new Date(s.items[0].date))) + ')' : ''}</small>` : ` <small>${esc(s.erreur)}</small>`}</li>`).join('')}${d.ecartees.map(s => `<li><span class="tr-pastille at">écartée</span> ${esc(s.nom)} <small>${esc(s.raison)}</small></li>`).join('')}</ul>
      <p class="tr-mini">Titre, date, source, lien et le court résumé publié par la source elle-même. Aucune source payante, aucun contenu protégé copié. Lu par le PC (ces sites n’ont pas d’en-tête CORS), mis à jour toutes les 30 min.</p>`;
  }

  /* ═════ ACTUALITÉS ═════ */
  async function chargerActus() {
    const w = wj(); if (!w) { D.actusErr = 'Worker de Rayle non connecté (ouvrir le terminal depuis Rayle).'; return rendreActus(); }
    try { const d = await w('/actualites/fil?portee=monde', 20000); D.actus = d && Array.isArray(d.sujets) ? d.sujets : []; D.actusErr = null; D.act_t = Date.now(); }
    catch (e) { D.actusErr = 'Actualités indisponibles : ' + (e.message || e); }
    rendreActus();
  }
  function rendreActus() {
    const z = zone('actus'); if (!z) return; if (D.actusErr) { z.innerHTML = `<p class="tr-doux">${esc(D.actusErr)}</p>`; return; }
    const L = actusFinance(D.actus, T.actif(), 16);
    z.innerHTML = L.length ? `<div class="tr-rapports">${L.map(s => `<article class="tr-rapport"><header>${s.t ? `<time>${esc(heure(s.t))}</time>` : ''}<span class="tr-pastille">${s.medias.length} média${s.medias.length > 1 ? 's' : ''}</span></header><h4>${s.lien ? `<a href="${esc(s.lien)}" target="_blank" rel="noopener">${esc(s.titre)}</a>` : esc(s.titre)}</h4>${s.resume ? `<p>${esc(s.resume.slice(0, 260))}</p>` : ''}<footer>${esc(s.medias.slice(0, 4).join(', '))}</footer></article>`).join('')}</div>` : '<p class="tr-doux">Aucune actualité financière dans le fil du moment.</p>';
  }

  /* ═════ COTATIONS ═════ */
  async function chargerCotations() {
    try {
      D.cotations = await tickers(ACTIFS_TERMINAL.map(a => a.symbole));
      await Promise.all(ACTIFS_TERMINAL.filter(a => !D.cotations[a.symbole] && a.ref && a.ref.source === 'binance-f' && a.id !== 'OR').map(async a => { try { const t = await ticker24hBinance(a.ref.symbole); if (+t.lastPrice > 0) D.cotations[a.symbole] = { last: +t.lastPrice, open24h: +t.openPrice, source: 'Binance' }; } catch (e) { /* inconnu */ } }));
      D.cotErr2 = Object.keys(D.cotations).length ? null : 'aucune cotation reçue';
    } catch (e) { D.cotErr2 = String(e.message || e); }
    rendreCotations();
  }
  function rendreCotations() {
    const z = pDash.querySelector('[data-cc]');
    z.innerHTML = `<table class="tr-tab tr-cot">${ACTIFS_TERMINAL.map(a => {
      const t = D.cotations[a.symbole], p = t && (t.last || t.markPrice), o = t && t.open24h, v = p && o ? (p / o - 1) * 100 : null;
      return `<tr data-actif="${a.id}" class="${a.id === T.actif() ? 'actif' : ''}"><td>${esc(a.nom)}</td><td class="tr-mono">${p ? fmt(a.id, p) : '—'}${t && t.source ? ` <small class="tr-doux">${esc(t.source)}</small>` : ''}</td><td class="tr-mono ${v > 0 ? 'tr-up' : v < 0 ? 'tr-down' : ''}">${v == null ? (p ? '—' : 'non servi') : (v > 0 ? '+' : '') + nbr(v, 2) + ' %'}</td></tr>`;
    }).join('')}</table>${D.cotErr2 ? `<p class="tr-doux">${esc(D.cotErr2)}</p>` : ''}<p class="tr-mini">« non servi » : ni le serveur du PC ni le relais en ligne ne lisent ce symbole pour l’instant.</p>`;
  }
  pDash.addEventListener('click', e => { const tr = e.target.closest('tr[data-actif]'); if (tr) T.choisirActif(tr.dataset.actif); });

  /* ═════ planification : une section n'est calculée que si elle est à l'écran (ou jamais calculée) ═════ */
  function tick(force = false) {
    if (D.detruit) return; const now = Date.now(), a = T.actif();
    if (visible('tableau') && (force || D.tabActif !== a || now - D.tab_t > 60e3)) calculerTableau(); else if (D.tableau && D.tableau.actif !== a) rendreTableau();
    if (force || D.cotActif !== a || now - D.cot_t > 3600e3) chargerCot(a);
    if (force || now - D.cal_t > 15 * 60e3) chargerCalendrier();
    if (visible('sante') && (force || D.corrActif !== a || now - D.corr_t > 30 * 60e3)) chargerCorrelations();
    if (visible('sante') && (force || !D.lies || D.lies.actif !== a || now - D.lies_t > 5 * 60e3)) chargerLies();
    if (visible('rapports') && (force || now - D.rap_t > 30 * 60e3)) chargerRapports();
    if (force || now - D.act_t > 10 * 60e3) chargerActus(); else rendreActus();
    chargerCotations(); rendreSante();
  }
  const offSec = T.on('section', () => tick(false));
  const api = {
    actualiser: (force = false) => tick(force),
    rendreSante: () => rendreSante(), rendreCotations, calculerTableau,
    donnees: () => ({ cot: D.cot && !D.cot.ancien ? { nom: D.cot.nom, date: D.cot.date, categories: [{ nom: 'Spéculateurs (non commerciaux)', net: D.cot.categories[0].net }], lecture: D.cot.lecture, complet: D.cot } : D.cot && D.cot.ancien ? D.cot.ancien : null,
      cotErreur: D.cotErr, annonces: D.annonces, semaine: D.semaine, calErreur: D.calErr, actus: actusFinance(D.actus, T.actif(), 5), cotations: D.cotations,
      tableau: D.tableau && D.tableau.actif === T.actif() ? D.tableau : null, correlations: D.corr && D.corrActif === T.actif() ? D.corr : null, lies: D.lies && D.lies.actif === T.actif() ? D.lies : null,
      rapports: D.rapports ? D.rapports.sources.flatMap(s => s.items.slice(0, 2).map(i => ({ titre: i.titre, date: i.date, source: s.banque }))).sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 6) : null, seances: seances(Date.now()) }),
    detruire() { D.detruit = true; clearInterval(rebours); offSec(); }
  };
  return api;
}
