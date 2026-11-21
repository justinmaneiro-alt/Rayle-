/* ═════════════ PANNEAU DE DROITE À ONGLETS (v6, A4) ═════════════
   Trois onglets : « Carnet » (profil crypto / perpétuel), « Bougies HTF / ICT » et « Bougie du jour » (tous les actifs). L'onglet par défaut dépend du profil de l'actif ; le dernier choix est mémorisé par actif.
   Ce module ne connaît pas le graphique principal : volume-ui.js lui passe l'état (ctx.S), les options et quelques fonctions. Lecture seule : aucun ordre. */
import { PALIERS, PALIER_DEFAUT, carnetRegroupe, desequilibreN, pointsCourbe } from './carnet-calcul.js';
import { agreger, volumeRelatifJour, atrDaily, jourDe, H } from './ict-calcul.js';
import { construire, REPERES_ICT, COULEURS_ICT, ICT_DEFAUT } from './ict-affichage.js';
import { creerZones, creerEtiquettesAxe } from './etiquettes-axe.js';
import { etiquettesAxe as etiqIct } from './ict-affichage.js';
import { profilDe, NOM_ONGLET, ongletInitial } from './profils-actifs.js';
import { profil, serieDelta, cvd, deltaReel } from './volume-calcul.js';
import { construireHtf, placerEtiquettes, NB_DEFAUT, NOMS as NOMS_HTF } from './htf-calcul.js';

export function monterPanneau(ctx) {
  const { zone, LW, S, opts, esc, nf, compact, sgn, prix, tH, parId, NOM_U } = ctx, $ = s => zone.querySelector(s);
  zone.innerHTML = `<div class="tpv-onglets" data-onglets role="tablist" aria-label="Panneau de droite"></div>
    <div class="tpv-pan" data-pan="carnet"></div>
    <div class="tpv-pan" data-pan="ict" hidden>
      <p class="tpv-lecture" data-lecture>Lecture en cours…</p>
      <div class="tpv-ict-barre"><label>Bougies <select data-htf><option value="S">Weekly</option><option value="J">Daily</option><option value="M">Monthly</option></select></label><label>Nombre <select data-htf-n><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label><button type="button" data-ict-principal aria-pressed="false" title="Reporte les repères choisis sur le grand graphique, avec étiquettes sur l’axe des prix seulement">Afficher sur le graphique principal</button></div>
      <canvas class="tpv-htf" data-htf-cv width="260" height="420" aria-label="Dernières bougies en grand et zones de rebond"></canvas>
      <p class="tpv-htf-proche" data-htf-proche></p>
      <details class="tpv-ict-det"><summary>Repères du graphique principal</summary><div class="tpv-ict-liste" data-ict-liste>${REPERES_ICT.map(([k, n]) => `<label><input type="checkbox" data-ict="${k}"> ${esc(n)}</label>`).join('')}</div></details>
    </div>
    <div class="tpv-pan" data-pan="jour" hidden>
      <div class="tpv-jour-barre"><label>Bougie <select data-jour-tf><option value="J">Daily</option><option value="S">Weekly</option></select></label></div>
      <canvas class="tpv-jour" data-jour width="250" height="300" aria-label="Bougie du jour en grand"></canvas>
      <div data-jour-texte class="tpv-jour-texte"></div>
    </div>
    <details class="tpv-details" data-details><summary>Détails</summary><div data-details-corps></div></details>`;
  const cleOnglet = a => `rayle_tpv_onglet_${a}`, cleMemo = (k, a) => `rayle_tpv_${k}_${a}`;
  let onglet = ongletInitial(S.actif, ctx.lireLS(cleOnglet(S.actif), null));

  /* ───── onglets ───── */
  function dessinerOnglets() {
    const p = profilDe(S.actif); $('[data-onglets]').innerHTML = p.onglets.map(k => `<button type="button" role="tab" data-onglet="${k}" aria-selected="${k === onglet}">${NOM_ONGLET[k]}</button>`).join('');
    for (const k of ['carnet', 'ict', 'jour']) $(`[data-pan="${k}"]`).hidden = k !== onglet;
  }
  function choisir(k, { memoriser = true } = {}) {
    const p = profilDe(S.actif); if (!p.onglets.includes(k)) k = p.droite; onglet = k; if (memoriser) ctx.ecrireLS(cleOnglet(S.actif), k); dessinerOnglets(); rendre();
  }
  function changerActif() { onglet = ongletInitial(S.actif, ctx.lireLS(cleOnglet(S.actif), null)); dessinerOnglets(); $('[data-htf]').value = ctx.lireLS(cleMemo('htf', S.actif), 'S'); $('[data-htf-n]').value = String(nbHtf()); $('[data-jour-tf]').value = ctx.lireLS(cleMemo('jourtf', S.actif), 'J'); synchroIct(); }

  /* ───── Carnet (crypto / perpétuel) ───── */
  const palierDe = a => { const L = PALIERS[a] || [1]; const m = ctx.lireLS(cleMemo('palier', a), null); return L.includes(m) ? m : (PALIER_DEFAUT[a] || L[0]); };
  const fmtPalier = p => nf(p, p < 1 ? (p < 0.1 ? 2 : 1) : 0);
  function rendreCarnet() {
    const c = $('[data-pan="carnet"]'), a = S.actif, A = parId[a]; if (!c || c.hidden) return;
    const palier = palierDe(a), cumul = ctx.lireLS('rayle_tpv_cumul', false) === true, bk = S.bookAff || S.book, e = S.etatFlux[S.parSource || opts.carnetSource] || S.etatFlux.Binance || {};
    const seuilMem = ctx.lireLS(cleMemo('seuilgros', a), null), tail = S.gros.tailles(), seuilAuto = tail.length > 20 ? ctx.seuilGrosses(tail) : null, seuil = seuilMem != null ? seuilMem : seuilAuto;
    if (!c.querySelector('[data-carnet-corps]')) { c.innerHTML = '<div class="tpv-carnet-barre" data-carnet-barre></div><div data-carnet-corps></div>'; c.dataset.a = ''; }
    if (c.dataset.a !== a) { c.dataset.a = a; c.querySelector('[data-carnet-barre]').innerHTML = `<label>Palier <select data-palier>${(PALIERS[a] || [1]).map(p => `<option value="${p}"${p === palier ? ' selected' : ''}>${fmtPalier(p)}</option>`).join('')}</select></label><label><input type="checkbox" data-cumul${cumul ? ' checked' : ''}> Cumul</label><label>Gros flux ≥ <input type="number" min="0" step="any" data-seuil-gros value="${seuilMem != null ? seuilMem : ''}" placeholder="auto"></label><button type="button" data-seuil-auto>Auto</button>`; }
    let h = '';
    if (!bk) h += `<h4>Carnet ${esc(opts.carnetSource)}</h4><p class="tpv-doux">${e.etat === 'erreur' ? 'Flux injoignable : ' + esc(e.raison || '') : 'Connexion au carnet…'}</p>`;
    else {
      const R = carnetRegroupe(bk, palier, { n: 12 });
      if (!R) h += '<p class="tpv-doux">Carnet vide.</p>';
      else {
        const ligne = (x, cote) => { const w = Math.round(100 * (cumul ? x.cumul / R.maxCumul : x.qte / R.maxQte)); const reac = ctx.niveauProche(S.reaction, x.prix, S.reactionAtr, 0.1); return `<div class="tpv-ligne tpv-${cote}${x.gros ? ' tpv-gros' : ''}${reac ? ' tpv-reac' : ''}" title="${esc(prix(a, x.prix))} · ${compact(x.qte)} · cumul ${compact(x.cumul)}"><i style="width:${w}%"></i><span>${prix(a, x.prix)}</span><b>${compact(cumul ? x.cumul : x.qte)}</b></div>`; };
        const d10 = desequilibreN(bk, 10), d25 = desequilibreN(bk, 25), H = S.histoDeseq ? S.histoDeseq.liste() : [];
        const jauge = (d, nom) => d ? `<div class="tpv-jauge" title="${nom} niveaux : acheteurs ${compact(d.acheteurs)} · vendeurs ${compact(d.vendeurs)}"><span>${nom}</span><i><u style="width:${Math.round(d.part * 100)}%"></u></i><b class="${d.ratio >= 0 ? 'tpv-h' : 'tpv-b'}">${d.ratio >= 0 ? '+' : '−'}${nf(Math.abs(d.ratio) * 100, 0)} %</b></div>` : '';
        const spark = H.length > 2 ? `<svg class="tpv-spark" viewBox="0 0 220 26" preserveAspectRatio="none" aria-label="Déséquilibre sur 15 minutes"><line x1="0" x2="220" y1="13" y2="13"/><polyline points="${pointsCourbe(H.map(x => x.r10), 220, 26)}"/></svg><small class="tpv-doux">déséquilibre (10 niveaux) sur ${H.length > 1 ? Math.max(1, Math.round((H[H.length - 1].t - H[0].t) / 60000)) : 0} min</small>` : '';
        h += `<h4>Carnet ${esc(opts.carnetSource)} <small>${esc(ctx.ageDonnee(bk.t))}${bk.profond ? ' · profondeur 1 000 niveaux' : ''}</small></h4>${jauge(d10, '10')}${jauge(d25, '25')}${spark}<div class="tpv-lad">${R.ventes.slice().reverse().map(x => ligne(x, 'ask')).join('')}<div class="tpv-mid">${prix(a, R.milieu)} <small>spread ${prix(a, R.spread)}</small></div>${R.achats.map(x => ligne(x, 'bid')).join('')}</div>${R.seuil > 0 ? `<p class="tpv-doux">Gros ordres : plus de 3 × la médiane (${compact(R.mediane)}) des 50 premiers paliers, en surbrillance.</p>` : ''}`;
      }
    }
    const L = S.gros.liste().filter(x => seuil == null || x.qte >= seuil).slice(0, 12);
    h += `<h4>Gros flux <small>seuil ≥ ${seuil != null ? compact(seuil) : '…'}</small></h4><div class="tpv-flux">${L.map(x => `<div class="${x.cote === 'achat' ? 'tpv-h' : 'tpv-b'}"><span>${tH.format(new Date(x.t))}</span><b>${x.cote === 'achat' ? 'ACHAT' : 'VENTE'}</b><span>${compact(x.qte)} @ ${prix(a, x.prix)}</span></div>`).join('') || '<p class="tpv-doux">Aucune grosse transaction au-dessus du seuil.</p>'}</div>`;
    const corps = c.querySelector('[data-carnet-corps]'); if (corps.dataset.h !== h) { corps.innerHTML = h; corps.dataset.h = h; }
  }

  /* ───── Bougies HTF / ICT : miniature (même moteur, mêmes gestes) + repères ───── */
  let mini = null, serieMini = null, zonesMini = null, etiqMini = null, lignesMini = [], marqueursMini = null, echMini = null, tIct = 0;
  function creerMini() {
    if (mini) return; const hote = $('[data-mini]');
    mini = LW.createChart(hote, { autoSize: true, layout: { background: { type: 'solid', color: '#000' }, textColor: '#aebcc4', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 10, attributionLogo: false }, grid: { vertLines: { color: '#0b1116' }, horzLines: { color: '#0b1116' } }, rightPriceScale: { borderColor: '#1a232b' }, timeScale: { borderColor: '#1a232b', rightOffset: 4, barSpacing: 7, minBarSpacing: 1.5 }, crosshair: { mode: 0 }, handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true }, handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true } });
    serieMini = mini.addSeries(LW.CandlestickSeries, { upColor: '#5fb894', downColor: '#d86a6a', wickUpColor: '#5fb894', wickDownColor: '#d86a6a', borderVisible: false, priceLineVisible: false });
    zonesMini = creerZones(); serieMini.attachPrimitive(zonesMini); etiqMini = creerEtiquettesAxe({ ecart: 13 }); serieMini.attachPrimitive(etiqMini);
    try { echMini = ctx.creerEchelles({ chart: mini, serie: serieMini, hote, LW, panneau: 0 }); } catch (e) { echMini = null; }
  }
  const tfHtf = () => ctx.lireLS(cleMemo('htf', S.actif), 'S'), nbHtf = () => { const n = ctx.lireLS(cleMemo('htfn', S.actif), null); return [3, 4, 5].includes(n) ? n : NB_DEFAUT[tfHtf()] || 4; };
  let htfDernier = null;
  const fmtDate = (t, tf) => (tf === 'M' ? new Date(t).toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'short', year: '2-digit' }) : new Date(t).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }));
  /* v7 : les dernières bougies en grand (toute la hauteur), zones de rebond tracées en travers, étiquettes à droite sans chevauchement, prix actuel et distances */
  function dessinerHtf() {
    const cv = $('[data-htf-cv]'), pr = $('[data-htf-proche]'); if (!cv || !htfDernier) return; const a = S.actif, tf = tfHtf(), dernier = S.bars.length ? S.bars[S.bars.length - 1].c : null;
    const R = construireHtf(htfDernier.J, { tf, n: nbHtf(), prixLive: dernier, fmt: v => prix(a, v) });
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 260, Hh = Math.max(300, cv.clientHeight || 420); cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
    if (!R.ok) { g.fillStyle = '#7f8f99'; g.font = '12px system-ui, sans-serif'; g.fillText(R.raison, 10, 24); pr.textContent = ''; return; }
    const droite = Math.min(92, W * 0.34), pied = 60, haut = 14, bas = Hh - pied, gauche = 6, zoneW = W - droite - gauche, y = p => haut + (R.haut - p) / (R.haut - R.bas) * (bas - haut);
    g.font = '10px ui-monospace, Consolas, monospace'; g.textBaseline = 'middle';
    for (const z of R.zones) { g.fillStyle = 'rgba(170,180,190,.13)'; g.fillRect(gauche, y(z.haut), zoneW + droite * 0.15, Math.max(2, y(z.bas) - y(z.haut))); g.fillStyle = 'rgba(170,180,190,.55)'; g.textAlign = 'left'; g.fillText('FVG', gauche + zoneW + 4, y((z.bas + z.haut) / 2)); }
    const n = R.bougies.length, pas = zoneW / n, corps = Math.min(58, pas * 0.56);
    /* niveaux : traits en travers des bougies, étiquettes à droite (empilées) */
    const ys = R.niveaux.map(l => y(l.prix)), yl = placerEtiquettes(ys, 25, haut + 12, bas - 12);
    R.niveaux.forEach((l, i) => { g.strokeStyle = 'rgba(127,179,194,.55)'; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(gauche, ys[i]); g.lineTo(gauche + zoneW, ys[i]); g.stroke(); g.setLineDash([]); g.strokeStyle = 'rgba(127,179,194,.35)'; g.beginPath(); g.moveTo(gauche + zoneW, ys[i]); g.lineTo(gauche + zoneW + 5, yl[i]); g.stroke();
      g.fillStyle = 'rgba(127,179,194,.95)'; g.textAlign = 'left'; g.fillText(l.texte, gauche + zoneW + 7, yl[i] - 5); g.fillStyle = '#aebcc4'; g.fillText(prix(a, l.prix), gauche + zoneW + 7, yl[i] + 5); });
    /* bougies */
    R.bougies.forEach((b, i) => {
      const cx = gauche + pas * (i + 0.5), up = b.c >= b.o, col = up ? '#5fb894' : '#d86a6a', yo = y(b.o), yc = y(b.c);
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, y(b.h)); g.lineTo(cx, y(b.l)); g.stroke(); g.lineWidth = 1;
      g.fillStyle = up ? 'rgba(95,184,148,.55)' : 'rgba(216,106,106,.55)'; const top = Math.min(yo, yc), hc = Math.max(2, Math.abs(yo - yc)); g.fillRect(cx - corps / 2, top, corps, hc); g.strokeStyle = col; g.strokeRect(cx - corps / 2 + 0.5, top + 0.5, corps - 1, hc - 1);
      g.textAlign = 'center'; g.fillStyle = b.enCours ? '#e6edf2' : '#8a9aa4'; g.fillText(fmtDate(b.t, tf), cx, bas + 10); g.fillStyle = '#f1d34f'; g.fillText(b.enCours ? 'en cours' : '', cx, bas + 22); g.fillStyle = '#aebcc4'; g.fillText(b.amplitudePct != null ? nf(b.amplitudePct, 1) + ' %' : '—', cx, bas + 35); g.fillStyle = b.volRel != null && b.volRel >= 1.3 ? '#e6edf2' : '#6b7a84'; g.fillText(b.volRel != null ? '×' + nf(b.volRel, 1) : 'vol. —', cx, bas + 48);
    });
    /* prix actuel : ligne bien visible, étiquette sur l'axe */
    const yp = y(R.prix); g.strokeStyle = '#f1d34f'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(gauche, yp); g.lineTo(gauche + zoneW + 4, yp); g.stroke(); g.lineWidth = 1; g.fillStyle = '#f1d34f'; g.fillRect(gauche + zoneW + 4, yp - 8, droite - 6, 16); g.fillStyle = '#05080c'; g.textAlign = 'left'; g.font = 'bold 10px ui-monospace, Consolas, monospace'; g.fillText(prix(a, R.prix), gauche + zoneW + 7, yp);
    pr.innerHTML = [R.resistance ? '<span class="tpv-b">' + esc(R.resistance.phrase) + '</span>' : '', R.support ? '<span class="tpv-h">' + esc(R.support.phrase) + '</span>' : ''].filter(Boolean).join('<br>');
  }
  async function majIct() {
    const c = $('[data-pan="ict"]'); if (!c || c.hidden) return; const seq = ++tIct, a = S.actif;
    let J = null; try { J = await ctx.donneesJ(); } catch (e) { J = null; } if (seq !== tIct) return;
    if (!J || J.length < 20) { $('[data-lecture]').textContent = 'Pas assez de bougies Daily pour lire le contexte (' + (J ? J.length : 0) + ').'; return; }
    const fmt = v => prix(a, v), A = construire(J, { ...ICT_DEFAUT, ...(opts.ict || {}) }, { fmt });
    htfDernier = { J }; dessinerHtf();
    $('[data-lecture]').textContent = A.lecture; ctx.surIct(A);
  }
  const demanderIct = () => { clearTimeout(demanderIct.t); demanderIct.t = setTimeout(majIct, 120); };
  function synchroIct() {
    zone.querySelectorAll('[data-ict]').forEach(i => { i.checked = !!({ ...ICT_DEFAUT, ...(opts.ict || {}) })[i.dataset.ict]; });
    const b = $('[data-ict-principal]'); if (b) b.setAttribute('aria-pressed', String(!!opts.ictPrincipal));
  }

  /* ───── Bougie du jour ───── */
  async function rendreJour() {
    const c = $('[data-pan="jour"]'); if (!c || c.hidden) return; const a = S.actif, A = parId[a], profilA = profilDe(a), tf = ctx.lireLS(cleMemo('jourtf', a), 'J'), cv = $('[data-jour]'), tx = $('[data-jour-texte]'); const seq = (rendreJour.seq = (rendreJour.seq || 0) + 1);
    let J = null, H1 = null; if (!tx.innerHTML.trim()) tx.textContent = 'Chargement de la bougie du jour…'; try { J = await ctx.donneesJ(); } catch (e) { J = null; } if (seq !== rendreJour.seq) return;
    if (!J || J.length < 22) { tx.textContent = 'Bougies Daily indisponibles pour cet actif.'; return; }
    if (S.unite === 'H1') H1 = S.bars; else { corpsJour(J, null, seq); try { H1 = await ctx.donneesH1(); } catch (e) { H1 = null; } if (seq !== rendreJour.seq) return; }
    corpsJour(J, H1, seq);
  }
  function corpsJour(J, H1, seq) {
    const a = S.actif, A = parId[a], profilA = profilDe(a), tf = ctx.lireLS(cleMemo('jourtf', a), 'J'), cv = $('[data-jour]'), tx = $('[data-jour-texte]');
    const G = agreger(J, tf), cour = { ...G[G.length - 1] }, prec = G[G.length - 2] || null, dernier = S.bars.length ? S.bars[S.bars.length - 1].c : cour.c;
    if (Number.isFinite(dernier) && S.bars.length && S.bars[S.bars.length - 1].t >= cour.t) { cour.c = dernier; cour.h = Math.max(cour.h, dernier); cour.l = Math.min(cour.l, dernier); }
    const debut = cour.t, X = (H1 || []).filter(b => b.t >= debut), reel = !!(X.length && deltaReel(X) && profilA.id === 'crypto'); let P = null; if (X.length >= 3) { try { P = profil(X, { niveaux: 26 }); } catch (e) { P = null; } }
    const atr = atrDaily(J, 'J'), rv = volumeRelatifJour(J), D = X.length ? serieDelta(X).reduce((s, v) => s + v, 0) : null, CV = X.length ? cvd(X) : [];
    dessinerJour(cv, { cour, prec, P, a, A }); const f = v => prix(a, v);
    const ligne = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
    tx.innerHTML = [ligne('Ouverture', f(cour.o)), ligne('Plus haut', f(cour.h)), ligne('Plus bas', f(cour.l)), ligne('Prix', f(cour.c)),
      rv ? ligne('Volume relatif', `<em class="${rv.ratio >= 0 ? 'tpv-h' : 'tpv-b'}">${rv.ratio >= 0 ? '+' : '−'}${nf(Math.abs(rv.ratio) * 100, 0)} %</em> <small>(moyenne 20 j, même moment)</small>`) : '',
      atr && tf === 'J' ? ligne('Range / ATR', `${nf((cour.h - cour.l) / atr * 100, 0)} % <small>${(cour.h - cour.l) / atr >= 1 ? 'la journée a fait son mouvement' : 'il reste de la marge'}</small>`) : '',
      D != null ? ligne('Delta du jour', `<em class="${D >= 0 ? 'tpv-h' : 'tpv-b'}">${sgn(D)}${reel ? '' : ' ~'}</em>`) : '', CV.length ? ligne('CVD de séance', `${sgn(CV[CV.length - 1])}${reel ? '' : ' ~'}`) : '',
      P ? ligne('POC / zone de valeur', `${f(P.poc.prix)} · ${f(P.val)}–${f(P.vah)}`) : ''].join('') + `<p class="tpv-doux">${P ? (reel ? 'Profil construit avec les transactions (volume réel, côté de l’agresseur).' : 'Profil approché : volume des bougies H1 réparti par niveau de prix (approximation).') : 'Pas assez de bougies H1 pour le profil de la séance.'} ${D != null && !reel ? 'Delta estimé depuis les bougies.' : ''}</p>`;
  }
  function dessinerJour(cv, { cour, prec, P, a, A }) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 250, Hh = 300; cv.width = W * dpr; cv.height = Hh * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, Hh);
    const hautV = Math.max(cour.h, prec ? prec.h : -Infinity), basV = Math.min(cour.l, prec ? prec.l : Infinity), marge = (hautV - basV) * 0.06 || 1, top = hautV + marge, bot = basV - marge, y = p => 12 + (top - p) / (top - bot) * (Hh - 24), xAxe = 8;
    g.font = '10px ui-monospace, Consolas, monospace'; g.textBaseline = 'middle';
    const col = x => (x.c >= x.o ? '#5fb894' : '#d86a6a'), cx = W * 0.64, demi = Math.min(48, W * 0.2), cg = W * 0.17, dg = Math.min(14, W * 0.06);
    /* bougie de la veille en fantôme */
    if (prec) { g.globalAlpha = 0.32; g.strokeStyle = col(prec); g.fillStyle = col(prec); g.beginPath(); g.moveTo(cg, y(prec.h)); g.lineTo(cg, y(prec.l)); g.stroke(); const t0 = Math.min(y(prec.o), y(prec.c)); g.fillRect(cg - dg, t0, dg * 2, Math.max(1, Math.abs(y(prec.o) - y(prec.c)))); g.globalAlpha = 1; g.fillStyle = '#6b7a84'; g.textAlign = 'center'; g.fillText('veille', cg, Hh - 4); }
    /* grande bougie : mèche, corps translucide, profil à l'intérieur */
    const coul = col(cour), yo = y(cour.o), yc = y(cour.c);
    g.strokeStyle = coul; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, y(cour.h)); g.lineTo(cx, y(cour.l)); g.stroke(); g.lineWidth = 1;
    g.fillStyle = coul === '#5fb894' ? 'rgba(95,184,148,.14)' : 'rgba(216,106,106,.14)'; g.fillRect(cx - demi, Math.min(yo, yc), demi * 2, Math.max(2, Math.abs(yo - yc))); g.strokeStyle = coul; g.strokeRect(cx - demi + 0.5, Math.min(yo, yc) + 0.5, demi * 2 - 1, Math.max(2, Math.abs(yo - yc)) - 1);
    if (P) { const mv = Math.max(...P.bins.map(b => b.v)) || 1; for (const b of P.bins) { const y1 = y(Math.min(b.hi, cour.h)), y2 = y(Math.max(b.lo, cour.l)); if (y2 <= y1) continue; const L = (demi * 2 - 2) * b.v / mv, dansVa = b.hi > P.val && b.lo < P.vah; g.fillStyle = dansVa ? 'rgba(200,210,218,.34)' : 'rgba(200,210,218,.16)'; g.fillRect(cx - demi + 1, y1, L, Math.max(1, y2 - y1 - 1)); }
      g.strokeStyle = '#e6edf2'; g.setLineDash([]); g.beginPath(); g.moveTo(cx - demi, y(P.poc.prix)); g.lineTo(cx + demi, y(P.poc.prix)); g.stroke(); g.fillStyle = '#e6edf2'; g.textAlign = 'left'; g.fillText('POC', cx + demi + 4, y(P.poc.prix)); g.strokeStyle = 'rgba(200,210,218,.5)'; g.setLineDash([3, 3]); for (const v of [P.vah, P.val]) { g.beginPath(); g.moveTo(cx - demi, y(v)); g.lineTo(cx + demi, y(v)); g.stroke(); } g.setLineDash([]); g.fillStyle = 'rgba(200,210,218,.7)'; g.fillText('VAH', cx + demi + 4, y(P.vah)); g.fillText('VAL', cx + demi + 4, y(P.val)); }
    /* prix actuel et repères à gauche */
    g.textAlign = 'left'; for (const [v, t, c] of [[cour.h, 'H', '#aebcc4'], [cour.l, 'B', '#aebcc4'], [cour.o, 'O', '#6b7a84'], [cour.c, 'C', coul]]) { g.fillStyle = c; g.fillText(`${t} ${prix(a, v)}`, xAxe, Math.max(8, Math.min(Hh - 8, y(v)))); }
    g.setLineDash([2, 3]); g.strokeStyle = coul; g.beginPath(); g.moveTo(cx - demi, y(cour.c)); g.lineTo(cx + demi, y(cour.c)); g.stroke(); g.setLineDash([]);
  }

  /* ───── Détails (le texte long est ici, pas dans l'écran principal) ───── */
  function rendreDetails() { const d = $('[data-details-corps]'); if (!d) return; const h = ctx.detailsHtml(); if (d.dataset.h !== h) { d.innerHTML = h; d.dataset.h = h; } }

  /* ───── rendu général ───── */
  function rendre() { if (onglet === 'carnet') rendreCarnet(); else if (onglet === 'ict') demanderIct(); else rendreJour(); rendreDetails(); }

  /* ───── événements ───── */
  zone.addEventListener('click', ev => {
    const o = ev.target.closest('[data-onglet]'); if (o) { choisir(o.dataset.onglet); return; }
    if (ev.target.closest('[data-seuil-auto]')) { ctx.ecrireLS(cleMemo('seuilgros', S.actif), null); const i = $('[data-seuil-gros]'); if (i) i.value = ''; rendreCarnet(); return; }
    if (ev.target.closest('[data-ict-principal]')) { opts.ictPrincipal = !opts.ictPrincipal; ctx.sauverOpts(); synchroIct(); ctx.surIct(null, true); return; }
  });
  zone.addEventListener('change', ev => {
    const t = ev.target;
    if (t.matches('[data-palier]')) { ctx.ecrireLS(cleMemo('palier', S.actif), +t.value); rendreCarnet(); return; }
    if (t.matches('[data-cumul]')) { ctx.ecrireLS('rayle_tpv_cumul', t.checked); rendreCarnet(); return; }
    if (t.matches('[data-seuil-gros]')) { const v = parseFloat(t.value); ctx.ecrireLS(cleMemo('seuilgros', S.actif), Number.isFinite(v) && v > 0 ? v : null); rendreCarnet(); return; }
    if (t.matches('[data-htf]')) { ctx.ecrireLS(cleMemo('htf', S.actif), t.value); ctx.ecrireLS(cleMemo('htfn', S.actif), null); $('[data-htf-n]').value = String(nbHtf()); majIct(); return; }
    if (t.matches('[data-htf-n]')) { ctx.ecrireLS(cleMemo('htfn', S.actif), +t.value); dessinerHtf(); return; }
    if (t.matches('[data-jour-tf]')) { ctx.ecrireLS(cleMemo('jourtf', S.actif), t.value); rendreJour(); return; }
    if (t.matches('[data-ict]')) { opts.ict = { ...ICT_DEFAUT, ...(opts.ict || {}), [t.dataset.ict]: t.checked }; ctx.sauverOpts(); majIct(); ctx.surIct(null, true); }
  });
  changerActif(); dessinerOnglets();
  return { rendre, rendreCarnet, majIct: demanderIct, rendreJour, choisir, changerActif, onglet: () => onglet, rendreDetails, synchroIct, dessinerOnglets,
    dessinerHtf, detruire() { /* rien à détruire : canvas */ } };
}
