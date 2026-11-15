/* ═════════════ TERMINAL « PRO » H4 / JOUR : branché sur le terminal existant (agent-trading/front/or.html) sans le réécrire ═════════════
   Ajoute : MA200 H4 et MA200 J calculées sur de VRAIES bougies H4 et Jour (visibles sur toutes les unités de temps, étiquetées « MA200 H4 » et « MA200 J ») ; les niveaux Jour / H4 les plus forts (3 au plus de chaque côté,
   étiquettes qui ne se chevauchent jamais) ; les signaux H4 / Jour (bougie clôturée, jamais redessinés) avec leur fiche d'ordre ; un bouton « H4 / Jour » (panneau) et un bouton « Détails ».
   Graphique PROPRE par défaut : tout le reste (zones, boîtes de position, flèches H1, volume, RSI, bandeaux de sources…) est derrière « Détails ». Lecture seule : aucun ordre n'est envoyé. */
import { lireActifPro } from '../commun/donnees.js';
import { lireHJ, projeterMA, idSignal } from './lecture-hj.js';
import { parler } from '../../agent-trading/front/or/tableau-or.js';
import { ma200Unite, bandeauMA, niveauxUniteEtJour, sansChevauchement, avecRang, NOM_UNITE } from '../commun/lecture-unite.js';

const ID_PRO = { OR: 'or', NASDAQ: 'us100', SP500: 'us500', BTC: 'btc', SOL: 'sol' };
const NOMS = { or: 'Or', us100: 'Nasdaq 100', us500: 'S&P 500', btc: 'Bitcoin', sol: 'Solana' };
const LS = { details: 'rayle_tp_details', avant: 'rayle_tp_couches_avant', vus: 'rayle_tp_hj_vus', alerte: 'rayle_tp_hj_alertes' };
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '—');
const dateParis = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const COULEURS = { ma: '#f1d34f', hausse: '#5fb894', baisse: '#d86a6a' };

export async function monterPro(T) {
  const actif = (document.body.dataset.actif || 'OR'), id = ID_PRO[actif], tactile = document.documentElement.classList.contains('tm-tactile'), barre = tactile ? document.querySelector('.tt-periodes') : document.querySelector('.tor-periodes') || document.querySelector('.tt-periodes');
  document.documentElement.classList.add('tp-terminal'); document.documentElement.classList.toggle('tp-details', lire(LS.details, false) === true);
  const E = { id, D: null, L: null, bt: null, series: {}, lignes: [], marqueurs: null, cle: '', panneau: null, details: lire(LS.details, false) === true, seq: 0 };
  /* ───── boutons ───── */
  const bDet = document.createElement('button'); bDet.type = 'button'; bDet.className = 'tp-b-details'; bDet.textContent = 'Détails'; bDet.setAttribute('aria-pressed', String(E.details)); bDet.title = 'Afficher tous les calques, bandeaux et sources du terminal';
  const bHJ = document.createElement('button'); bHJ.type = 'button'; bHJ.className = 'tp-b-hj'; bHJ.textContent = 'Signaux H4 / J'; bHJ.setAttribute('aria-expanded', 'false');
  /* PC : à la suite des unités de temps ; tactile : sur une ligne à part sous les unités de temps (la grille de 5 colonnes du mode tactile ne les accueille pas) */
  if (tactile || (barre && barre.classList.contains('tt-periodes'))) { const ligne = document.createElement('div'); ligne.className = 'tp-ligne-boutons'; ligne.append(bHJ, bDet); E.ligneTactile = ligne; } else if (barre) { barre.appendChild(bHJ); barre.appendChild(bDet); } else document.body.append(bHJ, bDet);
  const attendreGraphique = async () => { for (let i = 0; i < 200; i++) { const g = T.graph; if (g && g.chart && g.chart() && g.serie && g.serie() && T.moteur) return g; await new Promise(r => setTimeout(r, 250)); } return null; };
  const graph = await attendreGraphique(); if (!graph) return null;
  const LW = window.LightweightCharts;
  if (E.ligneTactile) (graph.conteneur() || document.body).appendChild(E.ligneTactile);   // tactile : sur le graphique, sous la légende des MA200

  /* ───── graphique propre / détails ───── */
  const COUCHES_PROPRES = () => Object.fromEntries(Object.keys(graph.couches()).map(k => [k, false]));
  function appliquerDetails(b, { sauver = true } = {}) {
    E.details = b; ecrire(LS.details, b); document.documentElement.classList.toggle('tp-details', b); bDet.setAttribute('aria-pressed', String(b));
    try { if (b) { const av = lire(LS.avant, null); if (av) graph.couches({ ...av, rayMa: false }); } else { if (sauver) ecrire(LS.avant, graph.couches()); graph.couches(COUCHES_PROPRES()); } } catch (e) { console.warn('[tp] couches :', e.message); }
    setTimeout(() => { try { graph.chart().timeScale().applyOptions({}); graph.chart().resize(graph.conteneur().clientWidth, graph.conteneur().clientHeight); } catch (e) { /* */ } }, 50);
  }
  if (!E.details) { appliquerDetails(false, { sauver: !lire(LS.avant, null) }); for (const ms of [2500, 7000]) setTimeout(() => { if (!E.details) appliquerDetails(false, { sauver: false }); }, ms); }   // le mode tactile règle ses propres calques un peu plus tard : on réaffirme le graphique propre
  bDet.addEventListener('click', () => appliquerDetails(!E.details));
  /* UNE seule moyenne sur le graphique : la MA200 de l'unité affichée (la nôtre). Les anciennes options « MA200 » du terminal sont coupées (et masquées par terminal-pro.css). */
  const couperAnciennesMA = () => { try { for (const k of ['ma200', 'ma200H1']) { const c = document.querySelector(`[data-or="${k}"]`); if (c && c.checked) c.click(); } const cc = graph.couches(); if (cc && cc.rayMa) graph.couches({ ...cc, rayMa: false }); } catch (e) { /* option absente */ } };
  couperAnciennesMA(); for (const ms of [2500, 7000]) setTimeout(couperAnciennesMA, ms);

  /* ───── dessin sur le graphique : UNE moyenne (celle de l'unité affichée), des niveaux sans chevauchement ───── */
  const temps = t => { try { return graph.tempsDeBougie(t); } catch (e) { return null; } };
  const uniteAffichee = () => { const p = T.moteur.S.periode; return p === 'H4' || p === 'J' ? p : 'H1'; };
  function ligneMA(titre) { if (!E.series.ma) E.series.ma = graph.chart().addSeries(LW.LineSeries, { color: COULEURS.ma, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null }); E.series.ma.applyOptions({ title: titre }); return E.series.ma; }
  /* après un changement d'unité de temps, le graphique d'origine pouvait rester calé sur l'ancienne plage (H4 → Jour : une seule bougie tout à gauche) : on le recadre sur les dernières bougies pendant 10 s, seulement si la dernière bougie n'est pas visible */
  function recadrer(B) {
    const per = T.moteur.S.periode; if (per !== E.derPeriode) { E.derPeriode = per; E.recadrerJusqua = Date.now() + 10000; }
    if (!(Date.now() < E.recadrerJusqua) || B.length < 30) return;
    try { const ts = graph.chart().timeScale(), r = ts.getVisibleLogicalRange(), n = B.length; if (!r || r.to < n - 12 || r.from > n) ts.setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n - 1 + 5 }); } catch (e) { /* graphique en cours de rechargement */ }
  }
  /* prix de référence pour les distances : le XAU/USD de l'appli pour l'or, sinon le dernier cours du graphique */
  const prixRef = B => (window.__tpPrixRef && Number.isFinite(window.__tpPrixRef.prix) ? window.__tpPrixRef.prix : B[B.length - 1].c);
  function dessiner(force = false) {
    const B = T.moteur.serie() || []; if (B.length < 5) return; recadrer(B);
    const u = uniteAffichee(), bj = u === 'J' ? B : (E.D && E.D.j && E.D.j.length ? E.D.j : null);
    const cle = `${u}|${B.length}|${B[B.length - 1].t}|${bj ? bj.length : 0}`;
    if (force || cle !== E.cle) {
      E.cle = cle;
      /* la MA200 de l'unité affichée, sur ses vraies bougies ; sous 200 bougies affichées, repli sur l'instantané de la MÊME unité */
      let S = ma200Unite(B), source = 'bougies affichées';
      if (!S.length && E.D) { const alt = { H1: E.D.h1, H4: E.D.h4, J: E.D.j }[u]; if (alt && alt.length) { S = ma200Unite(alt); source = 'instantané du robot'; } }
      const m = new Map(); for (const p of S) { const t = temps(p.t); if (t != null && Number.isFinite(p.v)) m.set(t, p.v); }
      ligneMA('MA200 ' + NOM_UNITE[u]).setData([...m.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value })));
      E.ma = { unite: u, source, derniere: S.length ? S[S.length - 1].v : null };
      legendeMA(B, u);
      E.cand = niveauxUniteEtJour(B, bj, B[B.length - 1].c, { unite: u }); E.cleNiv = null;
    }
    niveauxSansChevauchement(B, u);
  }
  /* niveaux : 3 au plus de chaque côté ; deux étiquettes à moins de 24 px l'une de l'autre → on garde la plus proche du prix. Recalculé à chaque passage (zoom, défilement, taille). */
  function niveauxSansChevauchement(B, u) {
    const s = graph.serie(), px = B[B.length - 1].c, gardes = sansChevauchement(avecRang(E.cand || [], px, u), p => { try { return s.priceToCoordinate(p); } catch (e) { return NaN; } }, 24);
    const k = gardes.map(n => n.nom + n.src + Math.round(n.prix * 100)).join('|'); if (k === E.cleNiv) return; E.cleNiv = k;
    for (const l of E.lignes) { try { s.removePriceLine(l); } catch (e) { /* */ } } E.lignes = [];
    for (const n of gardes) E.lignes.push(s.createPriceLine({ price: n.prix, color: n.cote === 'R' ? 'rgba(216,106,106,.8)' : 'rgba(95,184,148,.8)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `${n.nom} ${n.src === 'J' ? 'Jour' : n.src} ${nf(n.prix, 0)}` }));
    E.niveaux = gardes;
  }

  /* bandeau du haut : seulement la MA200 de l'unité affichée (valeur + distance du prix en %) */
  function legendeMA(B, u) {
    const c = graph.conteneur(); if (!c) return; let el = c.querySelector('.tp-ma-legende'); if (!el) { el = document.createElement('div'); el.className = 'tp-ma-legende'; c.appendChild(el); }
    const b = bandeauMA(B, u, prixRef(B)), v = b.ok ? b : (E.ma && Number.isFinite(E.ma.derniere) ? { ok: true, nom: 'MA200 ' + NOM_UNITE[u], valeur: E.ma.derniere, distancePct: prixRef(B) / E.ma.derniere * 100 - 100 } : b);
    el.innerHTML = v.ok ? `<span style="color:${COULEURS.ma}">${esc(v.nom)} ${nf(v.valeur, 0)} · prix ${nf(Math.abs(v.distancePct), 1)} % ${v.distancePct >= 0 ? 'au-dessus' : 'sous'}</span>` : `<span style="color:${COULEURS.ma}">${esc(v.nom)} : ${esc(v.raison)}</span>`;
    el.title = 'Moyenne mobile simple sur 200 bougies ' + NOM_UNITE[u] + (E.ma ? ' (' + E.ma.source + ')' : '') + ' ; distance calculée avec le prix de référence de l’appli';
  }

  /* l'or a UN seul prix dans l'appli : le XAU/USD au comptant (celui de l'accueil et de XTB), ou son dernier cours de clôture avec la mention « marché fermé ».
     Le graphique trace le perpétuel Kraken (bougies) : son dernier cours n'est donc pas affiché sur l'échelle, et l'en-tête montre le prix de référence (voir tableau-or.js : window.__tpPrixRef). */
  async function majSpot() {
    if (id !== 'or' || document.hidden) return; let p = null;
    try { const tp = window.parent !== window ? window.parent.TraderPro : window.TraderPro; p = tp && tp.prixOr ? await tp.prixOr() : null; } catch (e) { p = null; }
    if (!p) { try { p = await (await import('../commun/donnees.js')).prixOr(); } catch (e) { p = null; } }
    window.__tpPrixRef = p && p.reference ? p : null;
    const etiq = document.querySelector('.tor-titre small'); if (etiq && window.__tpPrixRef) { etiq.textContent = 'XAU/USD · bougies Kraken'; etiq.title = p.source + (p.note ? ' — ' + p.note : ''); }
    const cible = document.querySelector('[data-or-prix]'); if (cible && window.__tpPrixRef) { cible.textContent = nf(p.prix, 2); cible.title = p.source + (p.note ? ' — ' + p.note : ''); const v = document.querySelector('[data-or-var]'); if (v) v.textContent = p.ferme ? 'marché fermé · dernier cours' : (Number.isFinite(p.pct) ? (p.pct >= 0 ? '+' : '') + nf(p.pct, 2) + ' % sur le jour' : ''); }
    try { if (window.__tpPrixRef) graph.serie().applyOptions({ lastValueVisible: false, priceLineVisible: false }); } catch (e) { /* option absente */ }
  }

  /* ───── données, alertes ───── */
  const idsVus = () => new Set(lire(LS.vus, null) || []);
  async function charger() {
    if (!id) { E.L = { ok: false, raison: 'Les signaux H4 / Jour sont disponibles pour l’or, le Nasdaq 100, le S&P 500, le Bitcoin et Solana.' }; rendrePanneau(); return; }
    const n = ++E.seq;
    try { const r = await lireActifPro(id, { delai: 8000 }); if (n !== E.seq) return; E.D = r.donnees; E.meta = r; E.L = lireHJ(E.D); } catch (e) { E.L = { ok: false, raison: 'Données H4 / Jour indisponibles : ' + (e && e.message || e) + ' (le robot publie ces séries toutes les 30 minutes).' }; }
    dessiner(true); rendrePanneau(); alerter();
  }
  async function chargerBacktest() { try { const r = await fetch(new URL('./backtest-hj.json', import.meta.url), { cache: 'no-cache' }); if (r.ok) E.bt = await r.json(); } catch (e) { /* le panneau le dit */ } rendrePanneau(); }
  const verdictDe = tf => { const a = E.bt && E.bt.actifs.find(x => x.id === id); return a && a.tf[tf] && a.tf[tf].verdict ? a.tf[tf].verdict.niveau : null; };
  function alerter() {
    if (!E.L || !E.L.ok) return; const vus = idsVus(), premier = lire(LS.vus, null) === null, tout = lire(LS.alerte, {}).tout === true, nouveaux = [];
    for (const s of E.L.signaux) { const k = idSignal(id, s); if (!vus.has(k)) { vus.add(k); if (!premier && Date.now() - s.tCloture < 36 * 3600e3 && (tout || verdictDe(s.tf) !== 'negatif')) nouveaux.push(s); } }
    for (const c of E.L.contacts) { const k = `contact|${id}|${c.type}|${new Date().toISOString().slice(0, 10)}`; if (!vus.has(k)) { vus.add(k); if (!premier) nouveaux.push({ contact: c }); } }
    ecrire(LS.vus, [...vus].slice(-400));
    for (const s of nouveaux.slice(0, 3)) { const texte = s.contact ? `${NOMS[id]} touche ${s.contact.type} à ${nf(s.contact.prix, 0)}.` : `Nouveau signal ${s.tf === 'J' ? 'Jour' : 'H4'} sur ${NOMS[id]} : ${s.dir > 0 ? 'achat' : 'vente'}, ${s.type}. Entrée vers ${nf(s.entree, 0)}, stop ${nf(s.sl, 0)}, objectif ${nf(s.tp, 0)}.`; parler(texte); try { if (T.notifier) T.notifier(texte, { niveau: 'info', dit: false, raison: 'signal H4 / Jour' }); } catch (e) { /* */ } try { if (lire(LS.alerte, {}).telegram !== false && T.envoyerTelegram) T.envoyerTelegram(texte + ' (lecture seule, aucun ordre)'); } catch (e) { /* */ } }
  }

  /* ───── panneau « H4 / Jour » ───── */
  function ficheTexte(s) { return `Entrée ${nf(s.entree, 2)} · stop ${nf(s.sl, 2)} · objectif ${nf(s.tp, 2)} · R/R ${nf(s.rr, 1)}`; }
  function rendrePanneau() {
    const p = E.panneau; if (!p) return; const L = E.L, ok = L && L.ok, att = lire(LS.alerte, {});
    const bt = tf => { const a = E.bt && E.bt.actifs.find(x => x.id === id), r = a && a.tf[tf]; if (!r || r.erreur) return `<tr><th>${tf === 'J' ? 'Jour' : 'H4'}</th><td colspan="4">${esc(r ? r.erreur : 'pas de backtest pour cet actif')}</td></tr>`; const o = r.horsEchantillon; return `<tr><th>${tf === 'J' ? 'Jour' : 'H4'}</th><td>${r.parMois}/mois</td><td>${o.n} trades</td><td>${Math.round(o.reussite * 100)} % · ${o.rMoyen > 0 ? '+' : ''}${nf(o.rMoyen, 2)} R · PF ${o.profitFactor == null ? '—' : nf(o.profitFactor, 2)}</td><td><span class="tp-v tp-v-${r.verdict.niveau}" title="${esc(r.verdict.texte)}">${esc({ positif: 'positif', fragile: 'fragile', negatif: 'NON RENTABLE', insuffisant: 'insuffisant' }[r.verdict.niveau] || r.verdict.niveau)}</span></td></tr>`; };
    p.innerHTML = `<header><b>Signaux H4 / Jour · ${esc(NOMS[id] || actif)}</b><button type="button" data-fermer aria-label="Fermer">✕</button></header>
      ${!ok ? `<p class="tp-doux">${esc(L ? L.raison : 'Chargement…')}</p>` : `
      <p class="tp-ligne">Biais Jour : <b class="${L.biais > 0 ? 'tp-h' : L.biais < 0 ? 'tp-b' : ''}">${esc(L.biaisTexte)}</b></p>
      <p class="tp-doux">Prix ${nf(L.prix)} · MA200 J ${nf(L.ma200J)} (${L.distanceMaJ > 0 ? '+' : ''}${nf(L.distanceMaJ, 1)} %) · MA200 H4 ${nf(L.ma200H4)} · ATR H4 ${nf(L.atrH4)}. Les signaux sont calculés à la clôture des bougies H4 et Jour ; ils ne se redessinent jamais.</p>
      <h4>Niveaux les plus forts</h4><p class="tp-niv">${L.niveaux.map(n => `<span class="${n.cote === 'R' ? 'tp-b' : 'tp-h'}">${esc(n.nom)} ${esc(n.src)} ${nf(n.prix, 0)}</span>`).join(' · ') || '—'}</p>
      <h4>Signaux des 90 derniers jours</h4>${L.signaux.length ? `<ul class="tp-sigs">${L.signaux.slice(0, 12).map((s, i) => `<li class="${s.dir > 0 ? 'tp-h' : 'tp-b'}"><b>${s.dir > 0 ? '▲ achat' : '▼ vente'} ${s.tf === 'J' ? 'Jour' : 'H4'}</b> <span>${esc(s.type)}${s.source ? ' · ' + esc(s.source) : ''}</span><small>${esc(dateParis(s.tCloture))} · ${esc(ficheTexte(s))}</small><button type="button" data-fiche="${i}">Fiche d’ordre</button><div class="tp-fiche" data-fiche-zone="${i}"></div></li>`).join('')}</ul>` : '<p class="tp-doux">Aucun signal ces 90 jours : c’est normal, il n’y en a que quelques-uns par mois.</p>'}
      <h4>Backtest (hors échantillon) pour cet actif</h4><table class="tp-bt">${bt('J')}${bt('H4')}</table><p class="tp-doux">Rapport complet et limites : <code>trader-pro/terminal/BACKTEST-HJ.md</code>. Un backtest ne garantit rien ; un verdict « non rentable » signifie que ces règles n’ont pas d’avantage démontré ici.</p>
      <h4>Alertes</h4><label class="tp-case"><input type="checkbox" data-al="telegram"${att.telegram !== false ? ' checked' : ''}> Telegram (terminal ouvert ; robot GitHub appli fermée)</label><label class="tp-case"><input type="checkbox" data-al="tout"${att.tout ? ' checked' : ''}> Alerter aussi quand le backtest est négatif</label><p class="tp-doux">La voix de Rayle annonce chaque nouveau signal H4 / Jour et chaque contact avec la MA200 H4 ou J, ou avec un niveau Jour fort.</p>`}`;
  }
  function ouvrirPanneau(o) {
    if (!E.panneau) { E.panneau = document.createElement('aside'); E.panneau.className = 'tp-panneau'; E.panneau.setAttribute('aria-label', 'Signaux H4 / Jour'); document.body.appendChild(E.panneau); E.panneau.addEventListener('click', async ev => {
      if (ev.target.closest('[data-fermer]')) { ouvrirPanneau(false); return; }
      const f = ev.target.closest('[data-fiche]'); if (f && E.L && E.L.ok) { const zone = E.panneau.querySelector(`[data-fiche-zone="${f.dataset.fiche}"]`); if (zone.innerHTML) { zone.innerHTML = ''; return; } try { const m = await import('../commun/fiche-ordre.js'); zone.innerHTML = await m.ficheHtml(E.L.signaux[+f.dataset.fiche], { actif: id }); } catch (e) { zone.innerHTML = '<p class="tp-doux">Fiche indisponible : ' + esc(e && e.message || e) + '</p>'; } }
    }); E.panneau.addEventListener('change', ev => { const c = ev.target.closest('[data-al]'); if (c) { const a = lire(LS.alerte, {}); a[c.dataset.al] = c.checked; ecrire(LS.alerte, a); } }); }
    E.panneau.hidden = !o; bHJ.setAttribute('aria-expanded', String(!!o)); document.documentElement.classList.toggle('tp-panneau-ouvert', !!o); if (o) rendrePanneau();
  }
  bHJ.addEventListener('click', () => ouvrirPanneau(!(E.panneau && !E.panneau.hidden)));

  /* ───── cycle ───── */
  await charger(); chargerBacktest(); majSpot(); const spot = setInterval(majSpot, 30000);
  const suivi = setInterval(() => dessiner(), 1500), maj = setInterval(() => { if (!document.hidden) charger(); }, 120000);
  window.addEventListener('pagehide', () => { clearInterval(suivi); clearInterval(maj); clearInterval(spot); });
  return { charger, majSpot, dessiner: () => dessiner(true), lecture: () => E.L, niveaux: () => (E.niveaux || []).map(n => ({ nom: n.nom, src: n.src, cote: n.cote, prix: n.prix, y: graph.serie().priceToCoordinate(n.prix) })), etat: () => ({ id, details: E.details, niveaux: E.lignes.length, signaux: E.L && E.L.signaux ? E.L.signaux.length : 0, ma: Object.keys(E.series) }), ouvrirPanneau, appliquerDetails };
}
