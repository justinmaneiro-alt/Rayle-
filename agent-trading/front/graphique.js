/* ═════════════ GRAPHIQUE (Lightweight Charts™ de TradingView, Apache-2.0, + primitives maison) ═════════════
   Bougies M15 / H1 live, volume net (delta par bougie + CVD) dans un 2e panneau, viseur, glisser / zoomer / pincer (natifs),
   étiquette de prix + compte à rebours de la bougie, profils de volume placés par l'agent (VAH / POC / VAL en traits fins),
   niveaux et zones surveillées, positions = 3 PETITS traits (entrée, SL, TP) + badge, jamais d'un bord à l'autre, étiquettes jamais superposées.
   Aucun calcul de P&L ici : le badge affiche le P&L publié par le moteur. */
import { etendueTrait } from '../commun/traits.js';
import { fmtPrix, fmtQte, fmtUSD } from '../commun/format.js';
import { PAR_ID, UNITES } from '../commun/actifs.js';

const URL_LIB = new URL('./vendor/lightweight-charts.js', import.meta.url).href;
let chargement = null;
export function chargerLib() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  return chargement || (chargement = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = URL_LIB; s.onload = () => ok(window.LightweightCharts); s.onerror = () => ko(new Error('graphique indisponible')); document.head.appendChild(s); }));
}
const FMT_H = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
const FMT_J = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short' });
const FMT_JH = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const couleur = (el, v) => getComputedStyle(el).getPropertyValue(v).trim();
const alpha = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

/* temps (ms) → indice logique du graphique (interpolé, extrapolé au-delà de la dernière bougie) */
export function indiceLogique(donnees, tMs, pasMs) {
  const t = tMs / 1000; if (!donnees.length) return null;
  const d0 = donnees[0].time, dn = donnees[donnees.length - 1].time, pas = pasMs / 1000;
  if (t >= dn) return donnees.length - 1 + (t - dn) / pas;
  if (t <= d0) return (t - d0) / pas;
  let lo = 0, hi = donnees.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (donnees[m].time <= t) lo = m; else hi = m; }
  return lo + (t - donnees[lo].time) / Math.max(1, donnees[hi].time - donnees[lo].time);
}

/* placement des étiquettes sans chevauchement : on pousse vers le bas puis on recentre si on sort */
export function placerEtiquettes(etiquettes, hauteur, hMax) {
  const l = etiquettes.slice().sort((a, b) => a.y - b.y), places = [];
  const chevauche = (a, b) => a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && a.y < b.y + hauteur + 2 && b.y < a.y + hauteur + 2;
  for (const e of l) {
    for (let essai = 0; essai < 50; essai++) { const g = places.find(p => chevauche(e, p)); if (!g) break; e.y = g.y + hauteur + 2; }
    places.push(e);
  }
  // si la pile sort par le bas, on la remonte d'un bloc (l'ordre et les écarts sont gardés)
  const debord = places.length ? Math.max(...places.map(e => e.y)) + hauteur - hMax : 0;
  if (debord > 0) for (const e of places) e.y = Math.max(0, e.y - debord);
  return places;
}

/* coordonnée x d'un indice logique FRACTIONNAIRE (logicalToCoordinate n'accepte bien que des entiers) */
export function xDe(ts, l) {
  if (l == null || !Number.isFinite(l)) return null;
  const a = Math.floor(l), xa = ts.logicalToCoordinate(a); if (xa == null) return null;
  if (l === a) return xa;
  const xb = ts.logicalToCoordinate(a + 1); return xb == null ? xa : xa + (l - a) * (xb - xa);
}

class Primitive {
  constructor(dessiner, axe) { this._d = dessiner; this._axe = axe; this._vues = [{ zOrder: () => 'top', renderer: () => ({ draw: cible => cible.useMediaCoordinateSpace(s => { try { this._d(s.context, s.mediaSize, this); } catch (e) { if (!this._signale) { this._signale = true; console.error('primitive graphique :', e); } } }) }) }]; }
  attached(p) { this.chart = p.chart; this.series = p.series; this.maj = p.requestUpdate; }
  detached() { this.chart = this.series = null; }
  updateAllViews() {}
  paneViews() { return this._vues; }
  priceAxisViews() { return this._axe ? this._axe(this) : []; }
}

export function creerGraphique(el, { racine, surSelection }) {
  const etat = { actif: null, unite: 'M15', donnees: [], positions: [], passees: [], montrerPassees: false, selection: null, profils: [], annotations: [], prix: null, tPrix: null, derniereBougie: null, live: false };
  let LW = null, chart = null, bougies = null, deltaS = null, cvdS = null, volS = null, zones = { traits: [] }, resize = null;
  const C = () => ({ haussier: couleur(racine, '--at-haussier'), baissier: couleur(racine, '--at-baissier'), achat: couleur(racine, '--at-achat'), vente: couleur(racine, '--at-vente'), texte: couleur(racine, '--at-texte'), doux: couleur(racine, '--at-doux'), gain: couleur(racine, '--at-gain'), perte: couleur(racine, '--at-perte'), accent: couleur(racine, '--at-accent'), sable: couleur(racine, '--at-sable'), mono: couleur(racine, '--at-mono') || 'monospace' });

  /* ─── positions : 3 petits traits + badge ─── */
  const primPositions = new Primitive((ctx, taille, P) => {
    if (!P.series || !etat.donnees.length) return;
    const c = C(), ts = P.chart.timeScale(), pasM15 = UNITES.M15, H = 16, etiquettes = []; zones.traits = [];
    const liste = etat.positions.concat(etat.montrerPassees ? etat.passees : []);
    const iActuel = indiceLogique(etat.donnees, Date.now(), UNITES[etat.unite]);
    for (const tr of liste) {
      const ouverte = tr.statut === 'ouvert' || tr.statut === 'propose', passee = !ouverte;
      const t0 = tr.tEntree || tr.tSignal, i0m = Math.floor(t0 / pasM15) * pasM15;
      // étendue en bougies M15 (règle partagée), convertie en temps puis en indice du graphique affiché (M15 ou H1)
      const n = tr.nTrait || 8, iAct15 = Math.floor((Date.now() - i0m) / pasM15), iSortie15 = tr.tSortie ? Math.floor((tr.tSortie - i0m) / pasM15) : null;
      const [, fin15] = etendueTrait({ indexEntree: 0, n, indexActuel: iAct15, ouverte, indexSortie: iSortie15 });
      const l0 = indiceLogique(etat.donnees, i0m, UNITES[etat.unite]), l1 = indiceLogique(etat.donnees, i0m + fin15 * pasM15, UNITES[etat.unite]);
      let x0 = xDe(ts, l0), x1 = xDe(ts, l1);
      if (x0 == null || x1 == null) continue;
      if (x1 - x0 < 36) x1 = x0 + 36;                    // jamais trop petits
      if (x1 < 0 || x0 > taille.width) continue;
      const sel = etat.selection === tr.id, attenue = etat.selection && !sel, a = passee ? 0.22 : attenue ? 0.45 : 1;
      const col = tr.sens === 'achat' ? c.achat : c.vente;
      const lignes = [['ENTRÉE', tr.prixEntree != null ? tr.prixEntree : tr.entree, [], sel ? 2.4 : 1.6], ['SL', tr.stop, [5, 4], sel ? 1.6 : 1], ['TP', tr.objectif, [2, 3], sel ? 1.6 : 1]];
      for (const [nom, prix, tirets, ep] of lignes) {
        const y = P.series.priceToCoordinate(prix); if (y == null) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = ep; ctx.setLineDash(tirets);
        ctx.beginPath(); ctx.moveTo(Math.round(x0) + .5, Math.round(y) + .5); ctx.lineTo(Math.round(x1) + .5, Math.round(y) + .5); ctx.stroke(); ctx.restore();
        zones.traits.push({ id: tr.id, x0, x1, y });
        if (!passee || sel) etiquettes.push({ x: x0, y: y - H / 2, w: 0, texte: `${nom} ${fmtPrix(tr.actif, prix)}`, col, a, yTrait: y });
      }
      if (!passee || sel) {
        const yE = P.series.priceToCoordinate(tr.prixEntree != null ? tr.prixEntree : tr.entree);
        if (yE != null) {
          const pnl = tr.pnlAffiche;
          etiquettes.push({ x: x1 + 4, y: yE - H / 2, w: 0, badge: true, texte: `${tr.sens === 'achat' ? '▲ ACHAT' : '▼ VENTE'} ${fmtQte(tr.actif, tr.quantite)} ${PAR_ID[tr.actif] ? PAR_ID[tr.actif].unite : ''}`, pnl, statut: tr.statut, col, a, yTrait: yE });
        }
      }
    }
    // étiquettes : mesure, placement sans chevauchement, dessin
    ctx.font = `600 11px ${c.mono}`;
    for (const e of etiquettes) {
      e.suffixe = e.badge ? (e.statut === 'propose' ? ' · en attente' : e.pnl != null ? ' · ' + fmtUSD(e.pnl, 0, true) : '') : '';
      e.w = ctx.measureText(e.texte + e.suffixe).width + 10;
      if (!e.badge) e.x = Math.max(2, e.x - e.w - 4);    // étiquette à GAUCHE du début du trait
      if (e.badge && e.x + e.w > taille.width - 2) e.x = taille.width - e.w - 2;
    }
    for (const e of placerEtiquettes(etiquettes, H, taille.height)) {
      ctx.save(); ctx.globalAlpha = e.a;
      ctx.fillStyle = 'rgba(8,12,18,.88)'; ctx.strokeStyle = e.col; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(e.x, e.y, e.w, H, 3) : ctx.rect(e.x, e.y, e.w, H); ctx.fill(); ctx.stroke();
      ctx.fillStyle = e.col; ctx.textBaseline = 'middle'; ctx.fillText(e.texte, e.x + 5, e.y + H / 2 + .5);
      if (e.suffixe) { const w0 = ctx.measureText(e.texte).width; ctx.fillStyle = e.statut === 'propose' ? c.doux : e.pnl >= 0 ? c.gain : c.perte; ctx.fillText(e.suffixe, e.x + 5 + w0, e.y + H / 2 + .5); }
      if (Math.abs(e.y + H / 2 - e.yTrait) > 3 && !e.badge) { ctx.strokeStyle = e.col; ctx.globalAlpha = e.a * .5; ctx.beginPath(); ctx.moveTo(e.x + e.w, e.y + H / 2); ctx.lineTo(e.x + e.w + 4, e.yTrait); ctx.stroke(); }
      ctx.restore();
    }
  });

  /* ─── profils de volume (placés par l'agent) + niveaux + zones ─── */
  const primProfils = new Primitive((ctx, taille, P) => {
    if (!P.series || !etat.donnees.length) return;
    const c = C(), ts = P.chart.timeScale();
    for (const z of etat.annotations.filter(a => a.type === 'zone')) {
      const y0 = P.series.priceToCoordinate(z.pMax), y1 = P.series.priceToCoordinate(z.pMin); if (y0 == null || y1 == null) continue;
      ctx.fillStyle = alpha(c.accent, .06); ctx.fillRect(0, y0, taille.width, y1 - y0);
      ctx.fillStyle = alpha(c.accent, .7); ctx.font = `10px ${c.mono}`; ctx.fillText('◇ ' + (z.nom || 'zone surveillée'), 6, y0 + 11);
    }
    for (const n of etat.annotations.filter(a => a.type === 'niveau')) {
      const y = P.series.priceToCoordinate(n.prix); if (y == null) continue;
      ctx.save(); ctx.strokeStyle = alpha(c.sable, .7); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(taille.width, y + .5); ctx.stroke(); ctx.restore();
      ctx.fillStyle = alpha(c.sable, .9); ctx.font = `10px ${c.mono}`; ctx.fillText(n.nom || 'niveau', 6, y - 3);
    }
    for (const p of etat.profils) {
      if (!p.niveaux || !p.niveaux.length) continue;
      let x0 = xDe(ts, indiceLogique(etat.donnees, p.debut, UNITES[etat.unite])), x1 = xDe(ts, indiceLogique(etat.donnees, p.fin, UNITES[etat.unite]) + 1);
      if (x0 == null || x1 == null) continue; x0 = Math.max(0, x0); x1 = Math.min(taille.width, x1); if (x1 - x0 < 20) continue;
      const vmax = Math.max(...p.niveaux.map(n => n[1])), largeur = Math.min(160, (x1 - x0) * 0.35), pas = p.pas || (p.niveaux.length > 1 ? p.niveaux[1][0] - p.niveaux[0][0] : 1);
      for (const [px, v, va, vv] of p.niveaux) {
        const ya = P.series.priceToCoordinate(px + pas), yb = P.series.priceToCoordinate(px); if (ya == null || yb == null) continue;
        const h = Math.max(1, yb - ya - 0.5), w = v / vmax * largeur, dansZone = px >= p.val - 1e-9 && px < p.vah;
        if (va + vv > 0) { const wa = w * va / (va + vv); ctx.fillStyle = alpha(c.achat, dansZone ? .32 : .16); ctx.fillRect(x0, ya, wa, h); ctx.fillStyle = alpha(c.vente, dansZone ? .32 : .16); ctx.fillRect(x0 + wa, ya, w - wa, h); }
        else { ctx.fillStyle = alpha(c.doux, dansZone ? .28 : .14); ctx.fillRect(x0, ya, w, h); }
      }
      for (const [nom, prix, col] of [['VAH', p.vah, c.accent], ['POC', p.poc, c.sable], ['VAL', p.val, c.accent]]) {
        const y = P.series.priceToCoordinate(prix); if (y == null) continue;
        ctx.save(); ctx.strokeStyle = alpha(col, .85); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + .5); ctx.lineTo(x1, Math.round(y) + .5); ctx.stroke(); ctx.restore();
        ctx.fillStyle = alpha(col, .95); ctx.font = `10px ${c.mono}`; ctx.fillText(`${nom} ${p.etiquette || ''}`.trim(), x0 + 3, y - 3);   // à GAUCHE : la droite est réservée aux positions
      }
      if (p.source && p.source !== 'reel') { ctx.fillStyle = alpha(c.doux, .8); ctx.font = `9px ${c.mono}`; ctx.fillText(p.source === 'approx' ? 'profil approx. (bougies)' : 'profil mixte', x0 + 2, (P.series.priceToCoordinate(p.val) || 0) + 12); }
    }
  });

  /* ─── étiquette de prix + compte à rebours (axe de droite) ─── */
  const primPrix = new Primitive(() => {}, P => {
    if (!P.series || etat.prix == null) return [];
    const c = C(), y = P.series.priceToCoordinate(etat.prix); if (y == null) return [];
    const der = etat.derniereBougie, coul = der && der.close >= der.open ? c.haussier : c.baissier;
    const fin = (Math.floor(Date.now() / UNITES[etat.unite]) + 1) * UNITES[etat.unite], reste = Math.max(0, fin - Date.now());
    const mm = Math.floor(reste / 60000), ss = Math.floor(reste % 60000 / 1000), h = Math.floor(mm / 60);
    const cr = h ? `${h}:${String(mm % 60).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    const vue = (coord, texte, fond) => ({ coordinate: () => coord, text: () => texte, textColor: () => '#ffffff', backColor: () => fond, visible: () => true, tickVisible: () => true });
    return [vue(y, fmtPrix(etat.actif, etat.prix), etat.live ? coul : c.doux), vue(y + 17, etat.live ? cr : 'hors ligne', 'rgba(20,28,38,.95)')];
  });

  async function monter() {
    LW = await chargerLib();
    const c = C();
    chart = LW.createChart(el, {
      autoSize: true, layout: { attributionLogo: false, background: { type: 'solid', color: 'transparent' }, textColor: c.doux, fontFamily: c.mono, fontSize: 11, panes: { separatorColor: 'rgba(143,208,227,.12)' } },
      grid: { vertLines: { color: 'rgba(143,208,227,.05)' }, horzLines: { color: 'rgba(143,208,227,.05)' } },
      crosshair: { mode: LW.CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(143,208,227,.15)' },
      timeScale: { borderColor: 'rgba(143,208,227,.15)', rightOffset: 8, barSpacing: 8, timeVisible: true, secondsVisible: false, tickMarkFormatter: (t, type) => (type <= 2 ? FMT_J.format(t * 1000) : FMT_H.format(t * 1000)) },
      localization: { locale: 'fr-FR', timeFormatter: t => FMT_JH.format(t * 1000), priceFormatter: p => fmtPrix(etat.actif, p) },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true }, handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
    });
    bougies = chart.addSeries(LW.CandlestickSeries, { upColor: c.haussier, downColor: c.baissier, wickUpColor: c.haussier, wickDownColor: c.baissier, borderVisible: false, lastValueVisible: false, priceLineVisible: true, priceLineStyle: 2 });
    // volume TOTAL (réel, Kraken) en gris pâle ; volume net (delta) par-dessus quand il est connu (enregistré)
    volS = chart.addSeries(LW.HistogramSeries, { priceScaleId: 'vol', color: 'rgba(138,154,166,.22)', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 1);
    deltaS = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 1);
    cvdS = chart.addSeries(LW.LineSeries, { color: c.sable, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, priceScaleId: 'left' }, 1);
    try { chart.panes()[1].setHeight(Math.max(60, Math.round(el.clientHeight * 0.18))); } catch (e) { /* ancienne version */ }
    bougies.attachPrimitive(primProfils); bougies.attachPrimitive(primPositions); bougies.attachPrimitive(primPrix);
    chart.subscribeClick(p => {
      if (!p.point) return;
      let meilleur = null;
      for (const z of zones.traits) if (p.point.x >= z.x0 - 6 && p.point.x <= z.x1 + 6) { const d = Math.abs(p.point.y - z.y); if (d < 10 && (!meilleur || d < meilleur.d)) meilleur = { id: z.id, d }; }
      selectionner(meilleur ? (etat.selection === meilleur.id ? null : meilleur.id) : null);
    });
    resize = setInterval(() => primPrix.maj && primPrix.maj(), 1000);   // compte à rebours
  }
  function selectionner(id) { etat.selection = id; primPositions.maj && primPositions.maj(); surSelection && surSelection(id); }

  function donneesDe(liste) {
    const b = [], d = [], v = [], vol = [];
    for (const x of liste) {
      const t = x[0] / 1000; b.push({ time: t, open: x[1], high: x[2], low: x[3], close: x[4] }); vol.push({ time: t, value: x[5] || 0 });
      // delta et CVD : valeurs PUBLIÉES par le moteur (rien n'est additionné ici) ; inconnus = vide, jamais inventés
      const dl = x[6] != null && x[7] != null && x[8] ? Math.round((x[6] - x[7]) * 1e6) / 1e6 : null;
      d.push(dl != null ? { time: t, value: dl, color: dl >= 0 ? alpha(C().achat, .7) : alpha(C().vente, .7) } : { time: t });
      v.push(x[9] != null ? { time: t, value: x[9] } : { time: t });
    }
    return { b, d, v, vol };
  }
  return {
    pret: monter(),
    afficher({ actif, unite, liste, recadrer }) {
      if (!chart) return;
      const changement = actif !== etat.actif || unite !== etat.unite;
      etat.actif = actif; etat.unite = unite;
      const { b, d, v, vol } = donneesDe(liste || []); etat.donnees = b.map(x => Object.assign({}, x)); etat.derniereBougie = b[b.length - 1] || null;
      bougies.setData(b); volS.setData(vol); deltaS.setData(d); cvdS.setData(v);
      bougies.applyOptions({ priceFormat: { type: 'price', precision: (PAR_ID[actif] || {}).decimales ?? 2, minMove: (PAR_ID[actif] || {}).tick || 0.01 } });
      if (changement || recadrer) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, b.length - 110), to: b.length + 8 });
    },
    /* bougie live : mise à jour fluide de la dernière (ou ajout) */
    bougieLive(liste) {
      if (!chart || !liste || !liste.length) return;
      const { b, d, v, vol } = donneesDe(liste);
      for (let i = 0; i < b.length; i++) {
        const der = etat.donnees[etat.donnees.length - 1];
        if (der && b[i].time < der.time) continue;
        bougies.update(Object.assign({}, b[i])); volS.update(vol[i]); if (!der || b[i].time > der.time) etat.donnees.push(b[i]); else etat.donnees[etat.donnees.length - 1] = b[i];
        if (d[i].value != null) deltaS.update(d[i]);
        if (v[i].value != null) cvdS.update(v[i]);   // CVD en direct (valeur du moteur)
      }
      etat.derniereBougie = etat.donnees[etat.donnees.length - 1];
    },
    surcouches({ positions, passees, profils, annotations, prix, tPrix, live }) {
      etat.positions = positions || []; etat.passees = passees || []; etat.profils = profils || []; etat.annotations = annotations || []; etat.prix = prix; etat.tPrix = tPrix; etat.live = live;
      primPositions.maj && primPositions.maj(); primProfils.maj && primProfils.maj(); primPrix.maj && primPrix.maj();
    },
    montrerPassees(v) { etat.montrerPassees = v; primPositions.maj && primPositions.maj(); },
    selectionner, recadrer() { if (chart) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, etat.donnees.length - 110), to: etat.donnees.length + 8 }); },
    _etat: etat, _zones: zones, _lw: () => ({ chart, bougies, primProfils, primPositions }),
    detruire() { clearInterval(resize); try { chart && chart.remove(); } catch (e) { /* */ } }
  };
}
