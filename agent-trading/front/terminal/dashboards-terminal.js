/* ═════════════ TERMINAL : DASHBOARDS DU PANNEAU BAS (COT, calendrier, actualités, santé du marché, cotations) ═════════════
   Données : routes DÉJÀ EN LIGNE du Worker de Rayle par window.wjson (jeton de l'appareil ; le Worker n'est pas modifié), Kraken par le relais.
   Hors de Rayle (page seule, sans jeton) : « Worker de Rayle non connecté », jamais un chiffre inventé. */
import { resumeCot, COT_ABSENT, annonces, prochaine, dansMinutes, actusFinance } from './dashboards-calcul.js';
import { ACTIFS_TERMINAL, PAR_ID_T, fmt } from './actifs-terminal.js';
import { tickers, ticker24hBinance } from './sources-terminal.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nbr = (x, d = 0) => x == null || !Number.isFinite(+x) ? '—' : (+x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, ' ');
const sg = x => x == null ? '—' : (x > 0 ? '+' : '') + nbr(x);
const HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const heure = t => HEURE.format(new Date(t));
const wj = () => (typeof globalThis.wjson === 'function' ? globalThis.wjson : null);

export function creerDashboards(el, T) {
  const D = { cot: null, cotErr: null, cotActif: null, annonces: [], calErr: null, actus: [], actusErr: null, cot_t: 0, cal_t: 0, act_t: 0, cotations: {}, cotErr2: null };
  el.innerHTML = `<div class="tr-dash">
    <section class="tr-carte" data-d="cotations"><h3>Cotations <small>Kraken Futures</small></h3><div data-c></div></section>
    <section class="tr-carte" data-d="sante"><h3>Santé du marché <small data-s-actif></small></h3><div data-c></div></section>
    <section class="tr-carte" data-d="calendrier"><h3>Annonces économiques <small>ForexFactory · impact fort et moyen</small></h3><div data-c></div></section>
    <section class="tr-carte" data-d="cot"><h3>Rapport COT <small>CFTC · hebdomadaire</small></h3><div data-c></div></section>
    <section class="tr-carte tr-large" data-d="actus"><h3>Actualités financières <small>médias internationaux, regroupés</small></h3><div data-c></div></section>
  </div>`;
  const c = id => el.querySelector(`[data-d="${id}"] [data-c]`);

  async function chargerCot(actif) {
    const A = PAR_ID_T[actif]; D.cotActif = actif;
    if (!A.cot) { D.cot = null; D.cotErr = COT_ABSENT[actif] || 'Pas de rapport COT pour cet actif.'; return rendreCot(); }
    const w = wj(); if (!w) { D.cot = null; D.cotErr = 'Worker de Rayle non connecté (ouvrir le terminal depuis Rayle).'; return rendreCot(); }
    try { D.cot = resumeCot(await w(`/cot?actif=${A.cot}&semaines=52`, 20000)); D.cotErr = D.cot ? null : 'réponse COT vide'; D.cot_t = Date.now(); }
    catch (e) { D.cot = null; D.cotErr = 'COT indisponible : ' + (e.message || e); }
    rendreCot();
  }
  function rendreCot() {
    const z = c('cot'); if (D.cotErr) { z.innerHTML = `<p class="tr-doux">${esc(D.cotErr)}</p>`; return; }
    const x = D.cot; if (!x) { z.innerHTML = '<p class="tr-doux">Chargement…</p>'; return; }
    const ser = x.serie.slice(-26), mx = Math.max(1, ...ser.map(p => Math.abs(p.net)));
    z.innerHTML = `<p><b>${esc(x.nom)}</b> · positions du mardi ${esc(x.date)}${x.publication ? `, publiées le ${esc(x.publication)}` : ''}</p>
      <table class="tr-tab"><thead><tr><th>Catégorie</th><th>Achat</th><th>Vente</th><th>Net</th></tr></thead><tbody>${x.categories.map(k => `<tr><td>${esc(k.nom)}</td><td>${nbr(k.long)}</td><td>${nbr(k.short)}</td><td class="${k.net > 0 ? 'tr-up' : k.net < 0 ? 'tr-down' : ''}">${sg(k.net)}</td></tr>`).join('')}</tbody></table>
      <p class="tr-doux">Spéculateurs : ${sg(x.variation1)} sur 1 semaine, ${sg(x.variation4)} sur 4 semaines${x.pctOi != null ? ` · net = ${nbr(x.pctOi, 1)} % de l’intérêt ouvert` : ''} · ${x.centile1an != null ? `${x.centile1an}e centile sur 1 an` : ''}</p>
      <div class="tr-barres" aria-label="Position nette des spéculateurs, 26 semaines">${ser.map(p => `<i title="${esc(p.date)} : ${sg(p.net)}" style="height:${Math.round(Math.abs(p.net) / mx * 100)}%" class="${p.net >= 0 ? 'h' : 'b'}"></i>`).join('')}</div>
      ${x.lecture ? `<p class="tr-doux">Lecture : ${esc(x.lecture)}.</p>` : ''}<p class="tr-mini">${esc(x.source || '')}</p>`;
  }

  async function chargerCalendrier() {
    const w = wj(); if (!w) { D.calErr = 'Worker de Rayle non connecté.'; return rendreCal(); }
    try { const l = await w('/calendar', 15000); D.annonces = annonces(l); D.calErr = null; D.cal_t = Date.now(); }
    catch (e) { D.calErr = 'Calendrier indisponible : ' + (e.message || e); }
    rendreCal();
  }
  function rendreCal() {
    const z = c('calendrier'); if (D.calErr) { z.innerHTML = `<p class="tr-doux">${esc(D.calErr)}</p>`; return; }
    const now = Date.now(), L = D.annonces.filter(e => e.t >= now - 2 * 3600e3).slice(0, 14);
    if (!L.length) { z.innerHTML = '<p class="tr-doux">Aucune annonce à fort ou moyen impact d’ici la fin de la semaine (source : semaine en cours seulement).</p>'; return; }
    const p = prochaine(D.annonces, now);
    z.innerHTML = (p ? `<p class="tr-alerte-douce">Prochaine annonce forte : <b>${esc(p.devise)} ${esc(p.titre)}</b> ${dansMinutes(p, now) < 120 ? `dans ${dansMinutes(p, now)} min` : heure(p.t)}</p>` : '')
      + `<ol class="tr-liste">${L.map(e => `<li class="${e.t < now ? 'passe' : ''}"><time>${heure(e.t)}</time> <b class="imp-${e.impact}">${esc(e.devise)}</b> ${esc(e.titre)}${e.prevu ? ` <small>prévu ${esc(e.prevu)}</small>` : ''}${e.precedent ? ` <small>préc. ${esc(e.precedent)}</small>` : ''}${e.reel ? ` <small>réel ${esc(e.reel)}</small>` : ''}</li>`).join('')}</ol>`;
  }

  async function chargerActus() {
    const w = wj(); if (!w) { D.actusErr = 'Worker de Rayle non connecté.'; return rendreActus(); }
    try { const d = await w('/actualites/fil?portee=monde', 20000); D.actus = d && Array.isArray(d.sujets) ? d.sujets : []; D.actusErr = null; D.act_t = Date.now(); }
    catch (e) { D.actusErr = 'Actualités indisponibles : ' + (e.message || e); }
    rendreActus();
  }
  function rendreActus() {
    const z = c('actus'); if (D.actusErr) { z.innerHTML = `<p class="tr-doux">${esc(D.actusErr)}</p>`; return; }
    const L = actusFinance(D.actus, T.actif());
    z.innerHTML = L.length ? `<ol class="tr-liste">${L.map(s => `<li>${s.t ? `<time>${heure(s.t)}</time> ` : ''}${s.lien ? `<a href="${esc(s.lien)}" target="_blank" rel="noopener">${esc(s.titre)}</a>` : esc(s.titre)} <small>${esc(s.medias.slice(0, 3).join(', '))}</small></li>`).join('')}</ol>` : '<p class="tr-doux">Aucune actualité financière dans le fil du moment.</p>';
  }

  async function chargerCotations() {
    try {
      D.cotations = await tickers(ACTIFS_TERMINAL.map(a => a.symbole));
      // relais ancien : cryptos par Binance (étiqueté), jamais un prix d'un autre actif
      await Promise.all(ACTIFS_TERMINAL.filter(a => !D.cotations[a.symbole] && a.ref && a.ref.source === 'binance-f' && a.id !== 'OR').map(async a => { try { const t = await ticker24hBinance(a.ref.symbole); if (+t.lastPrice > 0) D.cotations[a.symbole] = { last: +t.lastPrice, open24h: +t.openPrice, source: 'Binance' }; } catch (e) { /* inconnu */ } }));
      D.cotErr2 = Object.keys(D.cotations).length ? null : 'aucune cotation reçue';
    }
    catch (e) { D.cotErr2 = String(e.message || e); }
    rendreCotations();
  }
  function rendreCotations() {
    const z = c('cotations');
    z.innerHTML = `<table class="tr-tab tr-cot"><tbody>${ACTIFS_TERMINAL.map(a => {
      const t = D.cotations[a.symbole], p = t && (t.last || t.markPrice), o = t && t.open24h, v = p && o ? (p / o - 1) * 100 : null;
      return `<tr data-actif="${a.id}" class="${a.id === T.actif() ? 'actif' : ''}"><td>${esc(a.nom)}</td><td class="tr-mono">${p ? fmt(a.id, p) : '—'}${t && t.source ? ` <small class="tr-doux">${esc(t.source)}</small>` : ''}</td><td class="tr-mono ${v > 0 ? 'tr-up' : v < 0 ? 'tr-down' : ''}">${v == null ? 'non servi' : (v > 0 ? '+' : '') + nbr(v, 2) + ' %'}</td></tr>`;
    }).join('')}</tbody></table>${D.cotErr2 ? `<p class="tr-doux">${esc(D.cotErr2)}</p>` : ''}<p class="tr-mini">« non servi » : le relais en ligne ne lit pas encore ce symbole.</p>`;
  }
  el.addEventListener('click', e => { const tr = e.target.closest('tr[data-actif]'); if (tr) T.choisirActif(tr.dataset.actif); });

  function rendreSante() {
    const s = T.sante(), z = c('sante'); el.querySelector('[data-s-actif]').textContent = PAR_ID_T[T.actif()].nom + ' · ' + T.unite();
    if (!s) { z.innerHTML = '<p class="tr-doux">En attente des données…</p>'; return; }
    const d = s.desequilibre;
    z.innerHTML = `<dl class="tr-dl">
      <dt>Volatilité</dt><dd>${s.volatilite ? `${esc(s.volatilite.mot)} <small>ATR ${fmt(T.actif(), s.volatilite.atr)} · ${nbr(s.volatilite.rapport, 2)} × sa médiane</small>` : '—'}</dd>
      <dt>Volume relatif</dt><dd>${s.volumeRelatif ? `${esc(s.volumeRelatif.mot)} <small>${nbr(s.volumeRelatif.rapport, 2)} × la médiane des 20 dernières bougies</small>` : '—'}</dd>
      <dt>Spread</dt><dd>${s.spread != null ? `${fmt(T.actif(), s.spread)} <small>${nbr(s.spreadPct, 3)} %</small>` : '—'}</dd>
      <dt>Acheteurs / vendeurs</dt><dd>${d ? `${nbr(d.achat * 100, 0)} % / ${nbr((1 - d.achat) * 100, 0)} % <small>carnet à ± 0,5 %</small>` : '—'}</dd></dl>`;
  }

  const api = {
    async actualiser(force = false) {
      const now = Date.now(), a = T.actif();
      if (force || D.cotActif !== a || now - D.cot_t > 3600e3) chargerCot(a);
      if (force || now - D.cal_t > 15 * 60e3) chargerCalendrier();
      if (force || now - D.act_t > 10 * 60e3) chargerActus(); else rendreActus();
      chargerCotations(); rendreSante();
    },
    rendreSante, rendreCotations,
    donnees: () => ({ cot: D.cot, cotErreur: D.cotErr, annonces: D.annonces, calErreur: D.calErr, actus: actusFinance(D.actus, T.actif(), 5), cotations: D.cotations })
  };
  return api;
}
