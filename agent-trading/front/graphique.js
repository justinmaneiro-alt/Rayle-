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

/* étiquettes d'une même colonne : écart vertical minimal (14 px), ordre gardé, dans le cadre */
export function espacer(etiquettes, ecart = 14, hMax = Infinity) {
  const l = etiquettes.slice().sort((a, b) => a.y - b.y);
  for (let i = 1; i < l.length; i++) if (l[i].y < l[i - 1].y + ecart) l[i].y = l[i - 1].y + ecart;
  const debord = l.length ? l[l.length - 1].y - (hMax - 2) : 0;
  if (debord > 0) { l[l.length - 1].y -= debord; for (let i = l.length - 2; i >= 0; i--) if (l[i].y > l[i + 1].y - ecart) l[i].y = l[i + 1].y - ecart; }
  return l;
}
export const BOUGIES_DEFAUT = 120, MARGE_DROITE = 12;

/* bougie de volume net (bougie compacte publiée par le moteur → bougie du 3e panneau) : ouverture = CVD avant la bougie, clôture = CVD après ;
   mèches = extrêmes enregistrés pendant la bougie (sinon égales au corps : rien d'inventé) ; grisée si le volume net est incomplet ; vide si inconnu */
export function bougieCvd(x, t = x[0] / 1000) {
  if (x[9] == null || x[6] == null || x[7] == null) return { time: t };
  const dl = x[6] - x[7], fin = x[9], debut = fin - dl, complet = !!x[8];
  const haut = complet && x[11] != null ? Math.max(debut + x[11], debut, fin) : Math.max(debut, fin), bas = complet && x[10] != null ? Math.min(debut + x[10], debut, fin) : Math.min(debut, fin);
  const o = { time: t, open: debut, high: haut, low: bas, close: fin };
  if (!complet) { const g = 'rgba(138,154,166,.45)'; o.color = g; o.wickColor = g; }
  return o;
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
  const etat = { actif: null, unite: 'M15', donnees: [], positions: [], passees: [], rejoue: null, montrerPassees: false, selection: null, profils: [], annotations: [], prix: null, tPrix: null, derniereBougie: null, live: false, backtest: null, premierConnu: null };
  let LW = null, chart = null, bougies = null, deltaS = null, cvdS = null, volS = null, cvdB = null, zones = { traits: [] }, resize = null;
  const C = () => ({ haussier: couleur(racine, '--at-haussier'), baissier: couleur(racine, '--at-baissier'), achat: couleur(racine, '--at-achat'), vente: couleur(racine, '--at-vente'), texte: couleur(racine, '--at-texte'), doux: couleur(racine, '--at-doux'), gain: couleur(racine, '--at-gain'), perte: couleur(racine, '--at-perte'), accent: couleur(racine, '--at-accent'), sable: couleur(racine, '--at-sable'), mono: couleur(racine, '--at-mono') || 'monospace' });

  /* ─── positions : 3 petits traits + badge ─── */
  const primPositions = new Primitive((ctx, taille, P) => {
    if (!P.series || !etat.donnees.length) return;
    const c = C(), ts = P.chart.timeScale(), pasM15 = UNITES.M15, H = 16, etiquettes = []; zones.traits = [];
    const liste = etat.positions.concat(etat.montrerPassees ? etat.passees : [], etat.rejoue && etat.rejoue.actif === etat.actif ? [etat.rejoue] : []);
    const iActuel = indiceLogique(etat.donnees, Date.now(), UNITES[etat.unite]);
    for (const tr of liste) {
      const rej = !!tr.rejoue, ouverte = !rej && (tr.statut === 'ouvert' || tr.statut === 'propose'), passee = !ouverte && !rej;
      const t0 = tr.tEntree || tr.tSignal, i0m = Math.floor(t0 / pasM15) * pasM15;
      // étendue en bougies M15 (règle partagée), convertie en temps puis en indice du graphique affiché (M15 ou H1)
      const n = tr.nTrait || 8, iAct15 = Math.floor((Date.now() - i0m) / pasM15), iSortie15 = tr.tSortie ? Math.floor((tr.tSortie - i0m) / pasM15) : null;
      const [, fin15] = etendueTrait({ indexEntree: 0, n, indexActuel: iAct15, ouverte, indexSortie: iSortie15 });
      const l0 = indiceLogique(etat.donnees, i0m, UNITES[etat.unite]), l1 = indiceLogique(etat.donnees, i0m + fin15 * pasM15, UNITES[etat.unite]);
      let x0 = xDe(ts, l0), x1 = xDe(ts, l1);
      if (x0 == null || x1 == null) continue;
      if (x1 - x0 < 36) x1 = x0 + 36;                    // jamais trop petits
      if (x1 < 0 || x0 > taille.width) continue;
      const sel = etat.selection === tr.id || rej, attenue = etat.selection && !sel, a = passee ? 0.22 : attenue ? 0.45 : rej ? 0.9 : 1;
      const col = tr.sens === 'achat' ? c.achat : c.vente;
      const lignes = [['ENTRÉE', tr.prixEntree != null ? tr.prixEntree : tr.entree, rej ? [6, 3] : [], sel ? 2.2 : 1.6], ['SL', tr.stop, [5, 4], sel ? 1.6 : 1], ['TP', tr.objectif, [2, 3], sel ? 1.6 : 1]];
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
          const cat = tr.categorie === 'grande' ? ' GRANDE' : '';
          etiquettes.push({ x: x1 + 4, y: yE - H / 2, w: 0, badge: true, texte: `${rej ? 'REJOUÉ · ' : ''}${tr.sens === 'achat' ? '▲ ACHAT' : '▼ VENTE'}${cat} ${fmtQte(tr.actif, tr.quantite)} ${PAR_ID[tr.actif] ? PAR_ID[tr.actif].unite : ''}`, pnl, statut: rej ? 'rejoue' : tr.statut, col, a, yTrait: yE });
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
      // texte seul (jamais de carré de couleur) : un léger contour sombre le rend lisible sur les bougies
      ctx.save(); ctx.globalAlpha = e.a; ctx.setLineDash([]); ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      const ecrire = (txt, x, col) => { ctx.strokeStyle = 'rgba(5,8,12,.9)'; ctx.lineWidth = 3; ctx.strokeText(txt, x, e.y + H / 2 + .5); ctx.fillStyle = col; ctx.fillText(txt, x, e.y + H / 2 + .5); };
      ecrire(e.texte, e.x + 5, e.col);
      if (e.suffixe) { const w0 = ctx.measureText(e.texte).width; ecrire(e.suffixe, e.x + 5 + w0, e.statut === 'propose' ? c.doux : e.pnl >= 0 ? c.gain : c.perte); }
      if (Math.abs(e.y + H / 2 - e.yTrait) > 3 && !e.badge) { ctx.strokeStyle = e.col; ctx.globalAlpha = e.a * .5; ctx.beginPath(); ctx.moveTo(e.x + e.w, e.y + H / 2); ctx.lineTo(e.x + e.w + 4, e.yTrait); ctx.stroke(); }
      ctx.restore();
    }
  });

  /* ─── profils de volume (placés par l'agent) + niveaux + zones ─── */
  const primProfils = new Primitive((ctx, taille, P) => {
    if (!P.series || !etat.donnees.length) return;
    const c = C(), ts = P.chart.timeScale();
    const etqAnn = [];
    for (const z of etat.annotations.filter(a => a.type === 'zone')) {
      const y0 = P.series.priceToCoordinate(z.pMax), y1 = P.series.priceToCoordinate(z.pMin); if (y0 == null || y1 == null) continue;
      ctx.fillStyle = alpha(c.accent, .06); ctx.fillRect(0, y0, taille.width, y1 - y0);
      etqAnn.push({ y: y0 + 8, texte: '◇ ' + (z.nom || 'zone'), col: alpha(c.accent, .8) });
    }
    for (const n of etat.annotations.filter(a => a.type === 'niveau')) {
      const y = P.series.priceToCoordinate(n.prix); if (y == null) continue;
      ctx.save(); ctx.strokeStyle = alpha(c.sable, .7); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(taille.width, y + .5); ctx.stroke(); ctx.restore();
      etqAnn.push({ y: y - 7, texte: n.nom || 'niveau', col: alpha(c.sable, .9) });
    }
    const toutes = etqAnn.map(e => Object.assign(e, { x: 6 }));
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
      const etq = [], suff = p.etiquette === 'agent' ? '·IA' : '';
      for (const [nom, prix, col] of [['VAH', p.vah, c.accent], ['POC', p.poc, c.sable], ['VAL', p.val, c.accent]]) {
        const y = P.series.priceToCoordinate(prix); if (y == null) continue;
        ctx.save(); ctx.strokeStyle = alpha(col, .85); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + .5); ctx.lineTo(x1, Math.round(y) + .5); ctx.stroke(); ctx.restore();
        etq.push({ y: y - 6, yTrait: y, texte: nom + suff, col: alpha(col, .95) });
      }
      if (p.source && p.source !== 'reel') { const yv = P.series.priceToCoordinate(p.val); if (yv != null) etq.push({ y: yv + 7, yTrait: yv, texte: p.source === 'approx' ? 'approx.' : 'mixte', col: alpha(c.doux, .85) }); }
      toutes.push(...etq.map(e => Object.assign(e, { x: x0 + 3 })));
    }
    // étiquettes COURTES, à GAUCHE (la droite est réservée aux positions) ; celles qui partagent une colonne (< 130 px)
    // sont espacées ENSEMBLE : jamais à moins de 14 px l'une de l'autre, même entre profil et niveaux de l'agent
    const colonnes = [];
    for (const e of toutes.sort((a, b) => a.x - b.x)) { const g = colonnes.find(k => Math.abs(k.x - e.x) < 130); if (g) g.l.push(e); else colonnes.push({ x: e.x, l: [e] }); }
    ctx.font = `10px ${c.mono}`; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    etat._etqProfils = [];
    for (const g of colonnes) for (const e of espacer(g.l, 14, taille.height)) {
      ctx.strokeStyle = 'rgba(5,8,12,.9)'; ctx.lineWidth = 3; ctx.strokeText(e.texte, e.x, e.y); ctx.fillStyle = e.col; ctx.fillText(e.texte, e.x, e.y);
      etat._etqProfils.push({ x: g.x, y: e.y, texte: e.texte });
    }
  });

  /* ─── bouton « Backtest » : positions REJOUÉES en petits traits très pâles (entrée, SL, TP), numérotées ─── */
  const primBacktest = new Primitive((ctx, taille, P) => {
    if (!P.series || !etat.backtest || !etat.donnees.length) return;
    const c = C(), ts = P.chart.timeScale(); etat._btgDessines = 0;
    ctx.save(); ctx.font = `600 10px ${c.mono}`; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const t of etat.backtest) {
      let x0 = xDe(ts, indiceLogique(etat.donnees, t.tEntree, UNITES[etat.unite])), x1 = xDe(ts, indiceLogique(etat.donnees, t.tSortie, UNITES[etat.unite]));
      if (x0 == null || x1 == null) continue; if (x1 - x0 < 24) x1 = x0 + 24; if (x1 < 0 || x0 > taille.width) continue;
      const col = t.sens === 'achat' ? c.achat : c.vente;
      for (const [prix, tirets, ep] of [[t.entree, [], 1.2], [t.stop, [4, 3], 1], [t.objectif, [2, 3], 1]]) {
        const y = P.series.priceToCoordinate(prix); if (y == null) continue;
        ctx.globalAlpha = 0.38; ctx.strokeStyle = col; ctx.lineWidth = ep; ctx.setLineDash(tirets);
        ctx.beginPath(); ctx.moveTo(Math.round(x0) + .5, Math.round(y) + .5); ctx.lineTo(Math.round(x1) + .5, Math.round(y) + .5); ctx.stroke();
      }
      const yE = P.series.priceToCoordinate(t.entree);
      if (yE != null) { const txt = `${t.n} REJOUÉ ${t.R > 0 ? '+' : ''}${t.R.toFixed(2).replace('.', ',')} R`; ctx.globalAlpha = 0.6; ctx.setLineDash([]); ctx.strokeStyle = 'rgba(5,8,12,.9)'; ctx.lineWidth = 3; ctx.strokeText(txt, x0, yE - 8); ctx.fillStyle = col; ctx.fillText(txt, x0, yE - 8); }
      etat._btgDessines++;
    }
    ctx.restore();
  });

  /* ─── bougies de volume net : zone « incomplet » (avant le démarrage du moteur : volume net inconnu, rien n'est dessiné) ─── */
  const primCvdIncomplet = new Primitive((ctx, taille, P) => {
    if (!P.chart || !etat.donnees.length) return;
    const c = C(), ts = P.chart.timeScale(), i0 = etat.premierConnu == null ? etat.donnees.length : etat.premierConnu;
    const x = i0 <= 0 ? null : xDe(ts, i0 - 0.5); const xFin = x == null ? (i0 > 0 ? taille.width : 0) : Math.min(taille.width, x);
    if (xFin <= 0) return;
    ctx.save(); ctx.fillStyle = 'rgba(138,154,166,.07)'; ctx.fillRect(0, 0, xFin, taille.height);
    ctx.font = `10px ${c.mono}`; ctx.fillStyle = alpha(c.doux, .8); ctx.textBaseline = 'top';
    const txt = ['incomplet : volume net non enregistré', 'incomplet'].find(s => xFin > ctx.measureText(s).width + 12); if (txt) ctx.fillText(txt, 6, 4);
    ctx.restore();
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
      timeScale: { borderColor: 'rgba(143,208,227,.15)', rightOffset: MARGE_DROITE, barSpacing: 8, timeVisible: true, secondsVisible: false, tickMarkFormatter: (t, type) => (type <= 2 ? FMT_J.format(t * 1000) : FMT_H.format(t * 1000)) },
      localization: { locale: 'fr-FR', timeFormatter: t => FMT_JH.format(t * 1000), priceFormatter: p => fmtPrix(etat.actif, p) },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true }, handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
    });
    bougies = chart.addSeries(LW.CandlestickSeries, { upColor: c.haussier, downColor: c.baissier, wickUpColor: c.haussier, wickDownColor: c.baissier, borderVisible: false, lastValueVisible: false, priceLineVisible: true, priceLineStyle: 2 });
    // volume TOTAL (réel, Kraken) en gris pâle ; volume net (delta) par-dessus quand il est connu (enregistré)
    volS = chart.addSeries(LW.HistogramSeries, { priceScaleId: 'vol', color: 'rgba(138,154,166,.22)', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 1);
    deltaS = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 1);
    cvdS = chart.addSeries(LW.LineSeries, { color: c.sable, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, priceScaleId: 'left' }, 1);
    // 3e panneau : BOUGIES DE VOLUME NET (CVD de chaque bougie : corps début → fin, mèches = extrêmes enregistrés pendant la bougie), même axe du temps
    cvdB = chart.addSeries(LW.CandlestickSeries, { upColor: alpha(c.gain, .85), downColor: alpha(c.perte, .85), wickUpColor: alpha(c.gain, .85), wickDownColor: alpha(c.perte, .85), borderVisible: false, lastValueVisible: false, priceLineVisible: false, priceFormat: { type: 'volume' } }, 2);
    try { chart.panes()[1].setHeight(Math.max(50, Math.round(el.clientHeight * 0.15))); chart.panes()[2].setHeight(Math.max(56, Math.round(el.clientHeight * 0.17))); } catch (e) { /* ancienne version */ }
    cvdB.attachPrimitive(primCvdIncomplet);
    bougies.attachPrimitive(primProfils); bougies.attachPrimitive(primPositions); bougies.attachPrimitive(primBacktest); bougies.attachPrimitive(primPrix);
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
    const b = [], d = [], v = [], vol = [], cb = [];
    for (const x of liste) {
      const t = x[0] / 1000; b.push({ time: t, open: x[1], high: x[2], low: x[3], close: x[4] }); vol.push({ time: t, value: x[5] || 0 });
      // delta et CVD : valeurs PUBLIÉES par le moteur (rien n'est additionné ici) ; inconnus = vide, jamais inventés
      const dl = x[6] != null && x[7] != null && x[8] ? Math.round((x[6] - x[7]) * 1e6) / 1e6 : null;
      d.push(dl != null ? { time: t, value: dl, color: dl >= 0 ? alpha(C().achat, .7) : alpha(C().vente, .7) } : { time: t });
      v.push(x[9] != null ? { time: t, value: x[9] } : { time: t });
      cb.push(bougieCvd(x, t));
    }
    return { b, d, v, vol, cb };
  }
  return {
    pret: monter(),
    afficher({ actif, unite, liste, recadrer }) {
      if (!chart) return;
      const changement = actif !== etat.actif || unite !== etat.unite;
      etat.actif = actif; etat.unite = unite;
      const { b, d, v, vol, cb } = donneesDe(liste || []); etat.donnees = b.map(x => Object.assign({}, x)); etat.derniereBougie = b[b.length - 1] || null;
      bougies.setData(b); volS.setData(vol); deltaS.setData(d); cvdS.setData(v); cvdB.setData(cb);
      const k = cb.findIndex(x => x.open != null); etat.premierConnu = k < 0 ? null : k; etat.nCvd = cb.filter(x => x.open != null).length;
      bougies.applyOptions({ priceFormat: { type: 'price', precision: (PAR_ID[actif] || {}).decimales ?? 2, minMove: (PAR_ID[actif] || {}).tick || 0.01 } });
      if (changement || recadrer) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, b.length - BOUGIES_DEFAUT), to: b.length + MARGE_DROITE });
    },
    /* bougie live : mise à jour fluide de la dernière (ou ajout) */
    bougieLive(liste) {
      if (!chart || !liste || !liste.length) return;
      const { b, d, v, vol, cb } = donneesDe(liste);
      for (let i = 0; i < b.length; i++) {
        const der = etat.donnees[etat.donnees.length - 1];
        if (der && b[i].time < der.time) continue;
        bougies.update(Object.assign({}, b[i])); volS.update(vol[i]); if (!der || b[i].time > der.time) etat.donnees.push(b[i]); else etat.donnees[etat.donnees.length - 1] = b[i];
        if (d[i].value != null) deltaS.update(d[i]);
        if (v[i].value != null) cvdS.update(v[i]);   // CVD en direct (valeur du moteur)
        if (cb[i].open != null) { cvdB.update(cb[i]); if (etat.premierConnu == null) etat.premierConnu = etat.donnees.length - 1; }   // bougie de volume net en cours, dessinée en direct
      }
      etat.derniereBougie = etat.donnees[etat.donnees.length - 1];
    },
    surcouches({ positions, passees, profils, annotations, prix, tPrix, live }) {
      etat.positions = positions || []; etat.passees = passees || []; etat.profils = profils || []; etat.annotations = annotations || []; etat.prix = prix; etat.tPrix = tPrix; etat.live = live;
      primPositions.maj && primPositions.maj(); primProfils.maj && primProfils.maj(); primPrix.maj && primPrix.maj();
    },
    montrerPassees(v) { etat.montrerPassees = v; primPositions.maj && primPositions.maj(); },
    selectionner, recadrer() { if (chart) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, etat.donnees.length - BOUGIES_DEFAUT), to: etat.donnees.length + MARGE_DROITE }); },
    toutVoir() { if (chart) chart.timeScale().fitContent(); },
    /* centre la vue sur un instant (ms) : exemples du backtest */
    allerA(tMs, demiLargeur = 50) { if (!chart || !etat.donnees.length) return false; const i = indiceLogique(etat.donnees, tMs, UNITES[etat.unite]); if (i == null || i < 0) return false; chart.timeScale().setVisibleLogicalRange({ from: i - demiLargeur, to: i + demiLargeur }); return true; },
    /* position REJOUÉE (backtest) en petits traits, ou null pour l'enlever */
    rejoue(sig) { etat.rejoue = sig ? Object.assign({}, sig, { rejoue: true, nTrait: sig.tSortie ? Math.max(4, Math.round((sig.tSortie - (sig.tEntree || sig.tSignal)) / UNITES.M15) + 2) : 12, pnlAffiche: sig.pnl }) : null; primPositions.maj && primPositions.maj(); },
    /* positions REJOUÉES du bouton « Backtest » (liste publiée par le moteur), ou null pour effacer */
    backtest(liste) { etat.backtest = liste && liste.length ? liste : (liste ? [] : null); primBacktest.maj && primBacktest.maj(); },
    _etat: etat, _zones: zones, _lw: () => ({ chart, bougies, primProfils, primPositions, cvdB }),
    detruire() { clearInterval(resize); try { chart && chart.remove(); } catch (e) { /* */ } }
  };
}
