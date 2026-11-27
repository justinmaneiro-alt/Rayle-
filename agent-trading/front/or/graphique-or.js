/* ═════════════ GRAPHIQUE DE L'OR (TradingView Lightweight Charts™ v5.2.1, Apache-2.0 ; logo d'attribution TradingView laissé visible) ═════════════
   Bougies : prix Kraken PF_XAUUSD, heure de Paris. Volume : référence Binance XAUUSDT (étiqueté). Exactement trois couches, cochables :
     1. zones de volume (rectangles semi-transparents) ; 2. supports / résistances (traits fins, étiquette courte au bord droit, sans chevauchement) ;
     3. zones de retournement (3 à 5, cadre fin + étiquette « tenue 4/6 »).
   Outil « Position » : entrée, stop, objectif posés au clic puis déplaçables ; ratio gain / risque affiché. Trades du journal : marques. */
import { chargerLib } from '../graphique.js';
import { espacerEtiquettes } from '../etiquettes-calcul.js';
import { filtrerProposes, atrSimple, etiquettesLibres, reduireMA } from './proposes-filtre.js';
import { tempsGraphique, tempsMonotones } from './temps-or.js';
import { libelle, libellePosition, aimanter, NOMS as NOMS_OUTILS } from './outils-calcul.js';
import { fiche as ficheMouv, etiquette as etiquetteMouv } from './mouvements-calcul.js';
import { LIBELLES } from './institutionnel-calcul.js';
import { dessinerInstitutionnel } from './institutionnel-dessin.js';
import { dessinerStructure } from './structure-dessin.js';
import { dessinerSchemas } from './schemas-dessin.js';
import { dessinerIct } from './ict-dessin.js';
import { COUCHES_ICT } from './ict-or.js';
import { dessinerRayle } from './rayle-dessin.js';
import { COUCHES_RAYLE, COUCHES_RAYLE_DEFAUT } from './rayle-couches.js';
import { zonesAffichage, liquiditeAffichage, dedoublonnerLiquidite, atrH1, detailZone } from './zones-affichage-v1.js';
import { normaliserZones } from './zones-fines-v1.js';
import { zoneMasquee, distanceRect } from './suppression-calcul.js';
import { dessinerZone, dessinerLiquidite } from './zones-affichage-dessin.js';

export const COUCHES = Object.freeze({ sr: 'Supports et résistances', liquidite: 'Zones de liquidité', boitesPos: 'Boîtes de position (3 dernières flèches)', boitesToutes: 'Boîtes de position : toutes les flèches', zonesLisibles: 'Grosses zones lisibles (R1, R2, R3, S1, S2, S3)', autresNiveaux: 'Réafficher les autres niveaux (zones et niveaux majeurs détaillés)', volume: 'Zones de volume', mouvements: 'Mouvements H1', ...LIBELLES, structure: 'Structure de marché H1 / H4 (cassures, impulsions, retournements)', retournements: 'Retournements : toutes les zones (probabilité mesurée)', rsi: 'RSI 14 (sous-fenêtre) + divergences', divCachees: 'Divergences cachées', schemas: 'Schémas de retournement (double sommet, tête et épaules, balayage, bougies)', ...COUCHES_ICT, ...COUCHES_RAYLE });
const COUCHES_DEFAUT = Object.freeze({ sr: true, liquidite: true, boitesPos: true, boitesToutes: false, zonesLisibles: true, autresNiveaux: false, volume: false, mouvements: true, structure: false, retournements: false, rsi: true, divCachees: false, schemas: false, ...Object.fromEntries(Object.keys(COUCHES_ICT).map(k => [k, false])), ...COUCHES_RAYLE_DEFAUT, ...Object.fromEntries(Object.keys(LIBELLES).map(k => [k, false])) });
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } };
const nb = (p, d = 2) => Number(p).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, ' ');

class Primitive {
  constructor(dessiner, z = 'top') { this._d = dessiner; this._vues = [{ zOrder: () => z, renderer: () => ({ draw: c => c.useMediaCoordinateSpace(s => { try { this._d(s.context, s.mediaSize); } catch (e) { if (!this._e) { this._e = 1; console.error('graphique or :', e); } } }) }) }]; }
  attached(p) { this.chart = p.chart; this.series = p.series; this.maj = p.requestUpdate; }
  detached() { this.chart = this.series = null; }
  updateAllViews() {} paneViews() { return this._vues; }
}

/* ratio gain / risque (pur, testé) */
export function ratio(pos) {
  if (!pos || !(pos.entree > 0) || !(pos.stop > 0) || !(pos.objectif > 0)) return null;
  const risque = Math.abs(pos.entree - pos.stop), gain = Math.abs(pos.objectif - pos.entree); if (!risque) return null;
  const sens = pos.stop < pos.entree ? 'achat' : 'vente', coherent = sens === 'achat' ? pos.objectif > pos.entree : pos.objectif < pos.entree;
  return { sens, risque, gain, rr: gain / risque, coherent };
}

export function creerGraphiqueOr(el, { surClicPrix, mobile = false } = {}) {
  const etat = { tactile: false, lecture: null, bougies: [], volumes: [], cle: null, debutKraken: null, ecart: null, chargementAncien: false, masques: [], hl: null, suppr: null, zonesVol: [], h1: [], aff: null, cadresZ: [], niveaux: [], retournement: [], bandes: [], liquidite: [], balayages: [], a: null, cadres: [], marques: [], tSerie: new Map(), barres: new Map(), couches: (() => { const c = { ...COUCHES_DEFAUT, ...lire('rayle_or_couches_v2', {}) }; if (!lire('rayle_or_rsi_defaut_v1', false)) { c.rsi = true; c.fleches = true; ecrire('rayle_or_rsi_defaut_v1', true); } return c; })(),   // une seule fois : RSI et flèches de lecture allumés par défaut, puis le choix est mémorisé pos: lire('rayle_or_position', null), outil: null, prix: null,
    outils: { objets: [], proposes: [], croix: [], fleches10: [], selection: null }, modeOutil: null, brouillon: [], aimant: true, outilsCadres: [] };
  let LW = null, chart = null, serie = null, vol = null, pret = null, maSerie = null, rsiSerie = null, rsiHaut = null, rsiBas = null, rsiDiv = [];
  /* couche « Mouvements H1 » (mouvements-v1.js, définition figée) : rétrospectif, jamais un signal ; H1 seulement ; données calculées dans un Worker (mouvements-ui.js) */
  const mouv = { liste: [], h1: false, cadres: [] };
  const mouvementSous = (x, y) => {   // clic seulement (pas au survol) et jamais pendant un outil de dessin
    if (etat.outil || etat.modeOutil || !mouv.h1 || etat.couches.mouvements === false || ictOn()) return null;
    const c = mouv.cadres.find(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1); if (!c) return null;
    const L = ficheMouv(c.m); return { p: c.m.depart, texte: L[0] + ' · ' + etiquetteMouv(c.m), detail: L.slice(1), mouvement: true };
  };
  const C = { liquidite: '#c39be0', flecheHaut: '#4fd18b', flecheBas: '#ef5f5f', refHaut: '#5fb894', refBas: '#d86a6a', bande: 'rgba(201,178,122,.07)', sable: '#c9b27a', haut: '#5fb894', bas: '#d86a6a', volZone: '143,136,204', support: '#86c3e8', resistance: '#e2ae62', retour: '#e8e2cf', texte: '#cfd8dc', doux: '#7d8a90', fond: 'rgba(8,12,16,.86)' };
  const yDe = p => serie ? serie.priceToCoordinate(p) : null;
  /* ICT ÉPURÉ : quand l'ICT est actif, les autres couches de niveaux de Rayle (proposés, VAH / VAL, bas de la semaine, chiffres ronds, zones de réaction, boîtes) ne sont pas tracées : un prix = une seule ligne */
  const ictOn = () => !!(inst && inst.ict);

  /* graphique propre (terminal pro, trader-pro/terminal) : ni bande « historique de référence », ni niveaux proposés tant que « Détails » n'est pas ouvert */
  const propre = () => { const c = document.documentElement.classList; return c.contains('tp-terminal') && !c.contains('tp-details'); };
  /* bande « historique de référence » : tout ce qui est avant la première bougie Kraken (Binance décalé de l'écart mesuré) */
  function xDebutKraken(T) {
    if (!chart || etat.debutKraken == null || !etat.bougies.length || !etat.bougies[0].ref) return null;
    const ts = chart.timeScale(), x = ts.timeToCoordinate(tempsGraphique(etat.debutKraken)); if (x != null) return x;
    const r = ts.getVisibleRange(); if (!r) return null;
    return tempsGraphique(etat.debutKraken) <= r.from ? -1 : T.width;   // perpétuel à gauche de la vue : pas de bande ; à droite : toute la largeur
  }
  /* v4 : « raccord de source » = une fine ligne pointillée verticale (plus de bande ni d'étiquette) là où l'historique de référence rejoint le cours direct ; info-bulle sur la pastille « i » */
  let elRaccord = null;
  function poserRaccord() {
    const x = etat.xRaccord;
    if (x == null) { if (elRaccord) elRaccord.style.display = 'none'; return; }
    if (!elRaccord) { elRaccord = document.createElement('div'); elRaccord.className = 'tp-raccord'; elRaccord.innerHTML = '<i role="img" tabindex="0">i</i>'; el.appendChild(elRaccord); }
    elRaccord.style.display = 'block'; elRaccord.style.left = Math.round(x) + 'px';
    let extra = ''; try { extra = typeof window.RayleRaccordTexte === 'function' ? window.RayleRaccordTexte() || '' : ''; } catch (e) { /* info-bulle facultative */ }
    const t = 'Raccord de source : à gauche, l’historique de référence (recalé sur le cours direct) ; à droite, le cours direct. ' + (extra || (etat.ecart != null ? 'Écart mesuré à ce raccord : ' + (etat.ecart >= 0 ? '+' : '−') + nb(Math.abs(etat.ecart)) + '.' : 'Écart non mesuré.'));
    const i = elRaccord.firstChild; if (i.getAttribute('aria-label') !== t) { i.title = t; i.setAttribute('aria-label', t); }
  }
  const primBande = new Primitive((ctx, T) => { const x = xDebutKraken(T); etat.xRaccord = x == null || x <= 0 || x >= T.width ? null : x; poserRaccord(); }, 'bottom');
  /* zones-affichage-v1 : calcul à chaque jeu de données (jamais dans le dessin) */
  const FMT_F = (lo, hi) => (nb(lo) === nb(hi) ? nb((lo + hi) / 2) : nb(lo) + '–' + nb(hi));
  const zoneTexte = z => z.elements.length === 1 ? z.elements[0].nom + (z.retournee ? ' · retournée' : '') : `${z.cote === 'resistance' ? 'Résistance' : 'Support'} ${FMT_F(z.bas, z.haut)} · ${z.elements.length} niveaux fusionnés${z.retournee ? ' · retournée' : ''}`;
  const detailZoneG = z => [...detailZone(z, nb), ...(z.elements.length === 1 && z.elements[0].detail ? z.elements[0].detail : [])];
  function calculerAff() {
    const h1 = etat.h1 || []; if (h1.length < 30) { etat.aff = null; return; }
    const A = atrH1(h1), ref = etat.prix ?? h1[h1.length - 1].c; if (!A) { etat.aff = null; return; }
    const sr = etat.bandes.map(b => ({ id: 'sr' + Math.round(b.p * 100), kind: 'sr', bas: b.bas, haut: b.haut, p: b.p, nom: b.texte, detail: b.detail, fort: !!b.fort, tDebut: b.tDerniere, touches: b.touches }));
    const vol = etat.zonesVol.map(z => ({ id: 'v' + Math.round(((z.bas + z.haut) / 2) * 100), kind: 'volume', bas: z.bas, haut: z.haut, nom: 'Zone de volume', force: z.force || 0, tDebut: z.tFormation }));
    const liqItems = [...etat.liquidite.map(z => ({ p: z.p, sorte: z.sorte, raisons: z.raisons, depuis: z.depuis, texte: z.texte })), ...etat.balayages.map(b => ({ p: b.p, sorte: b.sorte, raisons: [b.raison], balayeeT: b.t }))];
    const L = liquiditeAffichage(h1, liqItems, { a: A });
    const srA = zonesAffichage(h1, sr, { prix: ref, a: A }), regr = L => normaliserZones(L, A).map(z => ({ ...z, dist: Math.abs(z.p - ref), distAtr: Math.abs(z.p - ref) / A })).sort((x, y) => x.dist - y.dist).map((z, k) => ({ ...z, proche: k < 6 }));   // zones fines : 0,3 ATR minimum, fusion (dessin = surveillance)
    srA.actives = regr(srA.actives); srA.traces = srA.traces.length ? normaliserZones(srA.traces, A) : srA.traces;
    etat.aff = { sr: srA, vol: zonesAffichage(h1, vol, { prix: ref, a: A }), liq: { actives: dedoublonnerLiquidite(L.actives, A), balayees: dedoublonnerLiquidite(L.balayees, A) }, a: A };
  }
  /* sans bougies H1 (tests isolés) : zones nées à leur dernier pivot, actives, jamais plus épaisses que 0,3 ATR */
  function secoursAff() {
    const ref = etat.prix ?? 0, a = etat.a || 1, mk = (e, i) => ({ ...e, cote: e.p > ref ? 'resistance' : 'support', actif: true, tFin: null, epaisseur: Math.min(e.haut - e.bas, 0.3 * a), elements: [e], proche: i < 6 });
    const sr = etat.bandes.map((b, i) => mk({ id: 'sr' + i, kind: 'sr', bas: b.bas, haut: b.haut, p: b.p, nom: b.texte, detail: b.detail, fort: !!b.fort, tDebut: b.tDerniere }, i));
    return { sr: { actives: sr, traces: [] }, vol: { actives: [], traces: [] }, liq: { actives: etat.liquidite.map(z => ({ p: z.p, sorte: z.sorte, n: 1, tPremier: z.depuis, tDernier: z.depuis, tBalayage: null, texte: z.texte, detail: ['zone de liquidité ' + z.sorte + ' non balayée : ' + (z.raisons || []).join(', ')] })), balayees: [] } };
  }
  const primFond = new Primitive((ctx, T) => {
    if (!serie) return;
    if (etat.couches.volume && etat.aff) for (const z of [...etat.aff.vol.traces, ...etat.aff.vol.actives]) {   // zones-affichage-v1 : de la formation à l'invalidation, jamais pleine largeur
      const f = (z.elements && z.elements[0] && z.elements[0].force) || 0; dessinerZone(ctx, T, z, { xDeT, yDe, rgb: C.volZone, opa: (0.10 + 0.15 * f) / 0.11, fs: 10 });
    }
  }, 'bottom');

  /* niveaux calculés masqués par l'utilisateur (suppression-niveaux.js) : jamais dessinés, jamais cliquables */
  const masquerAff = G => { if (!etat.masques.length) return G; const a = G.a || etat.a || 1, f = L => L.filter(z => !zoneMasquee(etat.masques, 'zone', z.bas, z.haut, a)), fl = L => L.filter(z => !zoneMasquee(etat.masques, 'liq', z.p, z.p, a));
    return { ...G, sr: { ...G.sr, actives: f(G.sr.actives), traces: f(G.sr.traces) }, liq: { ...G.liq, actives: fl(G.liq.actives), balayees: fl(G.liq.balayees) } }; };
  const cleZ = (kind, z) => 'z:' + kind + ':' + Math.round(z.p * 100);
  const surligner = (ctx, c, kind, z) => { if (c && etat.hl && etat.hl === cleZ(kind, z)) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(c.x0, Math.round(c.ym) + 0.5); ctx.lineTo(c.x1, Math.round(c.ym) + 0.5); ctx.stroke(); ctx.restore(); } };
  const primTexte = new Primitive((ctx, T) => {
    if (!serie) return;
    const fs = mobile ? 10 : 11; ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`;
    /* supports et résistances de LA PÉRIODE (au plus 4 au-dessus, 4 au-dessous) : les plus forts bien visibles, les autres discrets ;
       liquidité en pointillés ; étiquettes courtes alignées à droite, SANS trait de rappel : une étiquette qui chevaucherait est omise (détail au survol) */
    const etq = [], hors = { haut: null, bas: null }, xDe = t => { const x = chart.timeScale().timeToCoordinate(etat.tSerie.get(t) ?? tempsGraphique(t)); return x == null ? 0 : Math.max(0, x); };
    etat.cadresZ = [];
    const G0 = etat.aff || secoursAff(), G = masquerAff(G0);
    if (etat.couches.sr !== false && !lisibleV8() && !ictOn()) {
      for (const z of G.sr.traces) { const c = dessinerZone(ctx, T, z, { xDeT, yDe, fs }); if (c) { c.z = z; c.kind = 'sr'; etat.cadresZ.push(c); surligner(ctx, c, 'sr', z); } }   // traces très pâles, limitées à leur durée
      for (const z of G.sr.actives) {
        const col = z.cote === 'resistance' ? C.resistance : C.support, y0 = yDe(z.p + z.epaisseur / 2), y1 = yDe(z.p - z.epaisseur / 2); if (y0 == null || y1 == null) continue;
        if (y1 < 0 || y0 > T.height) { const k = y1 < 0 ? 'haut' : 'bas', b = { p: z.p, texte: zoneTexte(z), detail: detailZoneG(z) }; if (!hors[k] || Math.abs(b.p - (etat.prix ?? b.p)) < Math.abs(hors[k].p - (etat.prix ?? b.p))) hors[k] = b; continue; }
        const c = dessinerZone(ctx, T, z, { xDeT, yDe, fs }); if (!c) continue; c.z = z; c.kind = 'sr'; etat.cadresZ.push(c); surligner(ctx, c, 'sr', z);
        if (z.proche) etq.push({ y: c.ym, texte: zoneTexte(z), col, prio: z.elements.some(e => e.fort) ? 3 : 1.5, gras: z.elements.some(e => e.fort), g: { texte: zoneTexte(z), detail: detailZoneG(z), p: z.p } });
      }
    }
    if (etat.couches.liquidite !== false && !ictOn()) {
      for (const z of [...G.liq.balayees, ...G.liq.actives]) {
        const c = dessinerLiquidite(ctx, T, z, { xDeT, yDe }); if (!c) continue; c.z = z; c.kind = 'liq'; etat.cadresZ.push(c); surligner(ctx, c, 'liq', z);
        if (z.tBalayage == null) etq.push({ y: c.ym, texte: z.texte, col: C.liquidite, prio: 2, g: { texte: z.texte, detail: z.detail, p: z.p } });
      }
    }
    for (const [k, b] of Object.entries(hors)) if (b) { const t = `${k === 'haut' ? '▲' : '▼'} ${b.texte}${etat.prix != null ? ` · ${b.p >= etat.prix ? '+' : '−'}${nb(Math.abs(b.p - etat.prix), 0)} $` : ''}`; etq.push({ y: k === 'haut' ? fs : T.height - fs, texte: t, col: C.doux, prio: 2.5, g: { texte: t, detail: b.detail, p: b.p, bord: k } }); }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
    etat.cadres = [];
    const wMax = Math.max(120, T.width * (mobile ? 0.66 : 0.45)), h = fs + 6, places = [];
    for (const e of etq.sort((x, y) => y.prio - x.prio)) {
      const y = Math.max(h / 2 + 1, Math.min(T.height - h / 2 - 1, e.y));
      if (places.some(q => Math.abs(q - y) < h + 2)) continue;   // chevauchement : étiquette omise (jamais d'éventail)
      places.push(y); ctx.font = `${e.gras ? '600 ' : ''}${fs}px system-ui, 'Segoe UI', sans-serif`;
      let t = e.texte; while (ctx.measureText(t).width > wMax - 10 && t.length > 8) t = t.slice(0, -2);
      if (t !== e.texte) t = t.replace(/\s*\S?$/, '') + '…';
      const w = ctx.measureText(t).width + 10, x = T.width - w - 2, y0 = y - h / 2;
      ctx.fillStyle = C.fond; ctx.fillRect(x, y0, w + 2, h); ctx.fillStyle = e.col; ctx.globalAlpha = e.prio === 1 ? 0.75 : 1; ctx.fillText(t, x + 5, y + fs / 2 - 1); ctx.globalAlpha = 1;
      etat.cadres.push({ x, y: y0, w, h, g: e.g });
    }
    ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`;
    // (l'ancien outil Position en blocs de couleur est remplacé par l'outil Position en lignes : couche des outils ci-dessous)
  });

  /* temps ↔ abscisse pour n'importe quel instant (ancres valables sur toutes les unités) : index logique des bougies affichées */
  const perBougie = () => { const B = etat.bougies; return B.length > 1 ? B[B.length - 1].t - B[B.length - 2].t : 3600e3; };
  const kDeT = t => { const B = etat.bougies; let lo = 0, hi = B.length; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m].t <= t) lo = m + 1; else hi = m; } return lo - 1; };
  function xDeT(t) { const B = etat.bougies; if (!chart || !B.length || t == null) return null; const k = kDeT(t), per = perBougie();
    const lg = k < 0 ? -(B[0].t - t) / per : k >= B.length - 1 ? B.length - 1 + (t - B[B.length - 1].t) / per : k + (t - B[k].t) / ((B[k + 1].t - B[k].t) || per);
    return chart.timeScale().logicalToCoordinate(lg); }
  function tDeX(x) { const B = etat.bougies; if (!chart || !B.length) return null; const lg = chart.timeScale().coordinateToLogical(x); if (lg == null) return null; const per = perBougie(), k = Math.floor(lg);
    if (k >= B.length - 1) return Math.round(B[B.length - 1].t + (lg - (B.length - 1)) * per); if (k < 0) return Math.round(B[0].t + lg * per); return Math.round(B[k].t + (lg - k) * (B[k + 1].t - B[k].t)); }
  const bougieA = x => { const B = etat.bougies; if (!chart || !B.length) return null; const lg = chart.timeScale().coordinateToLogical(x); if (lg == null) return null; const k = Math.round(lg); return k >= 0 && k < B.length ? B[k] : null; };
  const tBougie = t => { const k = kDeT(t); return k >= 0 ? etat.bougies[k].t : null; };
  const COUL_PROP = 'rgba(201,178,122,.55)', COUL_CROIX = '#e2ae62';
  const primOutils = new Primitive((ctx, T) => {
    if (!serie || !chart) return; const O = etat.outils, fs = mobile ? 10 : 11; etat.outilsCadres = [];
    const trait = (x0, y0, x1, y1, col, w, dash = [], alpha = 1) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = alpha; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; };
    const texte = (t, x, y, col, alpha = 0.95) => { ctx.font = `${fs}px system-ui, 'Segoe UI', sans-serif`; ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.fillText(t, x, y); ctx.globalAlpha = 1; };
    const poignee = (x, y, col) => { ctx.fillStyle = '#0b1117'; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 6.3); ctx.fill(); ctx.stroke(); };
    const hy = y => Math.round(y) + 0.5;
    /* niveaux proposés : proches du prix (± 8 ATR), fusionnés (0,5 ATR), 6 au plus, étiquettes sans chevauchement (correctif H4/Jour) */
    { const B = etat.bougies, prix = B.length ? B[B.length - 1].c : NaN, gardes = propre() || ictOn() ? [] : filtrerProposes(O.proposes, prix, atrSimple(B)), ys = {};
      for (const pr of gardes) { const y = yDe(pr.p); if (y != null) ys[pr.cle] = y; }
      const libres = etiquettesLibres(gardes, ys, fs + 3);
      for (const pr of gardes) { const y = ys[pr.cle]; if (y == null || y < 0 || y > T.height) continue;
        trait(0, hy(y), T.width, hy(y), COUL_PROP, etat.hl === 'pr:' + pr.cle ? 3 : 1, [3, 4], 0.7); if (libres.has(pr.cle)) texte(`proposé ${pr.unite === 'J' ? 'Jour' : pr.unite} ${nb(pr.p, 0)}`, 4, y - 3, C.sable, 0.75); etat.outilsCadres.push({ sorte: 'propose', y, pr }); } }
    for (const o of O.objets) {
      const sel = O.selection === o.id, col = o.couleur || C.texte, w = (o.epaisseur || 1) + (sel ? 0.5 : 0) + (etat.hl === 'obj:' + o.id ? 2 : 0), lab = libelle(o) + (o.alerte ? ' · alerte' : '') + (o.retourne ? '' : '');
      if (o.type === 'horizontale') { const y = yDe(o.p); if (y == null || y < -2 || y > T.height + 2) continue; trait(0, hy(y), T.width, hy(y), col, w); texte(lab, 4, y - 3, col); if (sel) { poignee(8, y, col); poignee(T.width - 8, y, col); } etat.outilsCadres.push({ sorte: 'objet', o, y }); }
      else if (o.type === 'zone') { const y0 = yDe(o.haut), y1 = yDe(o.bas); if (y0 == null || y1 == null) continue; ctx.globalAlpha = 0.07; ctx.fillStyle = col; ctx.fillRect(0, y0, T.width, Math.max(1, y1 - y0)); ctx.globalAlpha = 1;
        trait(0, hy(y0), T.width, hy(y0), col, w, [], 0.6); trait(0, hy(y1), T.width, hy(y1), col, w, [], 0.6); texte(lab, 4, y0 - 3, col); if (sel) { poignee(8, y0, col); poignee(8, y1, col); } etat.outilsCadres.push({ sorte: 'objet', o, y0, y1 }); }
      else if (o.type === 'tendance' || o.type === 'rayon') { const x1 = xDeT(o.t1), y1 = yDe(o.p1), x2 = xDeT(o.t2), y2 = yDe(o.p2); if ([x1, y1, x2, y2].some(v => v == null) || x2 === x1) continue;
        const pente = (y2 - y1) / (x2 - x1), xd = T.width, yd = y1 + pente * (xd - x1);
        if (o.type === 'tendance') { trait(x1, y1, x2, y2, col, w); trait(x2, y2, xd, yd, col, w, [4, 4], 0.5); } else trait(x1, y1, xd, yd, col, w);
        texte(lab, Math.max(4, x1 + 4), y1 - 4, col); if (sel) { poignee(x1, y1, col); poignee(x2, y2, col); } etat.outilsCadres.push({ sorte: 'objet', o, x1, y1, x2, y2, xd, yd }); }
      else if (o.type === 'position') { const x0 = Math.max(0, o.t0 != null ? (xDeT(o.t0) ?? T.width * 0.6) : T.width * 0.6), L = [['entree', C.texte], ['stop', C.bas], ['objectif', C.haut]], ys = {};
        for (const [k, c] of L) { const y = yDe(o[k]); if (y == null) continue; ys[k] = y; trait(x0, hy(y), T.width, hy(y), c, w, k === 'entree' ? [] : [], 0.95); if (sel) poignee(x0 + 6, y, c); }
        if (ys.entree != null) { const t = libellePosition(o); ctx.font = `${fs}px system-ui, sans-serif`; texte(t, x0 + 4, ys.entree - 4, C.texte); }
        etat.outilsCadres.push({ sorte: 'objet', o, x0, ys }); }
    }
    for (const c of O.croix) { const x = xDeT(tBougie(c.t) ?? c.t), y = yDe(c.niveau); if (x == null || y == null || x < -6 || x > T.width + 6) continue; const d = 4.5;
      trait(x - d, y - d, x + d, y + d, COUL_CROIX, 1.6); trait(x - d, y + d, x + d, y - d, COUL_CROIX, 1.6); etat.outilsCadres.push({ sorte: 'croix', c, x, y }); }
    for (const b of etat.brouillon) { const x = xDeT(b.t), y = yDe(b.p); if (x != null && y != null) poignee(x, y, C.sable); }
  });
  /* objet du dessin sous le pointeur (distance en pixels) */
  function outilSous(x, y, tol = 6) {
    let best = null; const prendre = (d, r) => { if (d <= tol && (!best || d < best.d)) best = { d, ...r }; };
    const dSeg = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L)); return Math.hypot(x - (x0 + u * dx), y - (y0 + u * dy)); };
    for (const c of etat.outilsCadres) {
      if (c.sorte === 'croix') prendre(Math.hypot(x - c.x, y - c.y), { c }); else if (c.sorte === 'propose') prendre(Math.abs(y - c.y), { pr: c.pr });
      else { const o = c.o;
        if (o.type === 'horizontale') prendre(Math.abs(y - c.y), { o, part: 'p' });
        else if (o.type === 'zone') { const d0 = Math.abs(y - c.y0), d1 = Math.abs(y - c.y1); if (y > c.y0 + tol && y < c.y1 - tol) prendre(tol - 0.1, { o, part: 'tout' }); else prendre(Math.min(d0, d1), { o, part: d0 <= d1 ? 'haut' : 'bas' }); }
        else if (o.type === 'tendance' || o.type === 'rayon') { const da = Math.hypot(x - c.x1, y - c.y1), db = Math.hypot(x - c.x2, y - c.y2); if (da <= tol + 2) prendre(da - 2, { o, part: 'a1' }); else if (db <= tol + 2) prendre(db - 2, { o, part: 'a2' }); else prendre(Math.min(dSeg(c.x1, c.y1, c.x2, c.y2), dSeg(c.x2, c.y2, c.xd, c.yd)), { o, part: 'tout' }); }
        else if (o.type === 'position') { if (x < c.x0 - tol) continue; for (const k of ['entree', 'stop', 'objectif']) if (c.ys[k] != null) prendre(Math.abs(y - c.ys[k]), { o, part: k }); } }
    }
    return best;
  }
  const pointBougie = (b, t) => b.ref ? { time: t, open: b.o, high: b.h, low: b.l, close: b.c, color: b.c >= b.o ? C.refHaut : C.refBas, wickColor: b.c >= b.o ? C.refHaut : C.refBas } : { time: t, open: b.o, high: b.h, low: b.l, close: b.c };
  const pointVolume = (b, t) => ({ time: t, value: b.v, color: b.c >= b.o ? 'rgba(95,184,148,.35)' : 'rgba(216,106,106,.35)' });
  let sig = null;   // signature des données déjà envoyées : seule la dernière bougie change → update (pas de setData de 20 000 bougies)
  function versSerie() {
    if (!serie) return;
    /* v12 : CAUSE de l'échelle cassée (bougies écrasées, moitié droite vide). La référence de volume (Binance) a des bougies à des heures où le prix n'en a pas (week-ends, pauses) :
       ces dates en trop s'ajoutaient à l'axe du temps de Lightweight Charts, décalaient tous les indices et la vue par défaut (calculée sur le nombre de bougies) tombait des mois en arrière.
       Le volume n'est donc dessiné que sous les bougies qui existent. */
    const B = etat.bougies, Bt = new Set(B.map(b => b.t)), V = etat.volumes.filter(v => Bt.has(v.t)), s = { n: B.length, t0: B.length ? B[0].t : null, nv: V.length, v0: V.length ? V[0].t : null, ref: B.length ? B.filter(b => b.ref).length : 0, e: etat.ecart };
    if (sig && s.t0 === sig.t0 && s.v0 === sig.v0 && s.ref === sig.ref && s.e === sig.e && s.n >= sig.n && s.n - sig.n <= 1 && s.nv >= sig.nv && s.nv - sig.nv <= 1 && B.length) {
      const tb = tempsMonotones(B.slice(-3).map(b => b.t)); for (let i = Math.max(0, B.length - 2), j = tb.length - (B.length - Math.max(0, B.length - 2)); i < B.length; i++, j++) { serie.update(pointBougie(B[i], tb[j])); etat.tSerie.set(B[i].t, tb[j]); etat.barres.set(tb[j], B[i]); }
      for (const x of V.slice(-2)) { const tx = etat.tSerie.get(x.t); if (tx != null) vol.update(pointVolume(x, tx)); }   // v12 : même date graphique que la bougie du même instant
    } else {
      const tb = tempsMonotones(B.map(b => b.t)), tm = new Map(B.map((b, i) => [b.t, tb[i]]));
      serie.setData(B.map((b, i) => pointBougie(b, tb[i]))); vol.setData(V.map(b => pointVolume(b, tm.get(b.t))));
      etat.tSerie = tm; etat.barres = new Map(B.map((b, i) => [tb[i], b]));
    }
    sig = s;
    if (marqueurs) marqueurs.setMarkers(marquesLW());
  }
  /* vue par défaut : les 150 dernières bougies, calées à droite, petite marge */
  const VUE_DEFAUT = 150, MARGE_DROITE = 5;
  /* ICT épuré : une marge de 18 bougies à droite pour les petits carrés (nom des lignes), rétablie quand l'ICT s'éteint */
  const margeIct = () => { try { return inst.ict ? 18 : MARGE_DROITE; } catch (e) { return MARGE_DROITE; } };
  function vueDefaut() { if (!chart || !etat.bougies.length) return; const n = etat.bougies.length; chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - VUE_DEFAUT), to: n - 1 + margeIct() }); }
  /* v12 : l'échelle ne doit JAMAIS rester cassée (bougies écrasées au milieu, moitié droite vide). `recaler()` = échelle verticale automatique + vue par défaut (dernières bougies à droite, petite marge) ;
     la garde ci-dessous le fait toute seule tant que l'utilisateur n'a pas lui-même déplacé ou zoomé le graphique. */
  etat.vueUser = false;
  function recaler() { if (!chart || !etat.bougies.length) return; try { chart.priceScale('right').setAutoScale(true); } catch (e) { /* ignoré */ } etat.vueUser = false; vueDefaut(); }
  function mesureVue() {
    if (!chart || !serie || !etat.bougies.length) return null; const B = etat.bougies, n = B.length; let L = null, P = null; try { L = chart.timeScale().getVisibleLogicalRange(); P = chart.priceScale('right').getVisibleRange(); } catch (e) { return null; } if (!L || !P || !(P.to > P.from)) return null;
    const i0 = Math.max(0, Math.ceil(L.from)), i1 = Math.min(n - 1, Math.floor(L.to)); let lo = Infinity, hi = -Infinity; for (let i = i0; i <= i1; i++) { if (B[i].l < lo) lo = B[i].l; if (B[i].h > hi) hi = B[i].h; }
    return { n, droiteVide: L.to - (n - 1), gaucheHors: L.from > n - 1, occupe: hi > lo ? (hi - lo) / (P.to - P.from) : 1, dedans: lo >= P.from - (P.to - P.from) * 0.05 && hi <= P.to + (P.to - P.from) * 0.05 };
  }
  const vueCassee = m => !!m && (m.droiteVide > 30 || m.gaucheHors || m.occupe < 0.3 || !m.dedans);
  function garde() { if (etat.vueUser || !chart || document.hidden || !el || el.clientWidth === 0 || getComputedStyle(el).visibility === 'hidden') return; if (vueCassee(mesureVue())) recaler(); }
  let marqueurs = null;
  /* marques du graphique (dessinées par Lightweight Charts, à la bougie près) : flèches de rebond, zones de liquidité balayées, trades du journal */
  const tDe = t => etat.tSerie.get(t) ?? tempsGraphique(t);
  const marquesLW = () => [
    ...(etat.couches.liquidite !== false ? etat.balayages.map(b => ({ id: 'b' + b.t + b.sorte, time: tDe(b.t), position: b.sorte === 'haute' ? 'aboveBar' : 'belowBar', color: 'rgba(195,155,224,.75)', shape: 'circle', size: 0.35 })) : []),
    ...marquesJournal()].filter(m => m.time != null).sort((a, b) => a.time - b.time);
  const marquesJournal = () => etat.marques.filter(m => m.t).map(m => ({ time: tDe(m.t), position: m.sens === 'achat' ? 'belowBar' : 'aboveBar', color: m.r == null ? '#cfd8dc' : m.r >= 0 ? C.haut : C.bas, shape: m.sens === 'achat' ? 'arrowUp' : 'arrowDown', text: m.texte || '' })).sort((a, b) => a.time - b.time);

  async function monter() {
    LW = await chargerLib();
    chart = LW.createChart(el, {
      autoSize: true,
      layout: { attributionLogo: true, background: { type: 'solid', color: 'transparent' }, textColor: C.doux, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: mobile ? 10 : 11 },
      grid: { vertLines: { color: 'rgba(143,208,227,.05)' }, horzLines: { color: 'rgba(143,208,227,.05)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },   // l'échelle se cale sur les bougies VISIBLES (+ marge) : ni les niveaux ni le volume ne la tirent
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: MARGE_DROITE },
      crosshair: { mode: 0 }, localization: { locale: 'fr-FR', priceFormatter: p => nb(p) }
    });
    serie = chart.addSeries(LW.CandlestickSeries, { upColor: C.haut, downColor: C.bas, wickUpColor: C.haut, wickDownColor: C.bas, borderVisible: false, priceLineColor: '#cfd8dc', priceLineStyle: 2 });
    // volume : son propre panneau sous le graphique, avec sa propre échelle
    vol = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 1);
    try { const P = chart.panes(); P[0].setStretchFactor(mobile ? 4 : 5); P[1].setStretchFactor(1); } catch (e) { /* ancienne version : panneau par défaut */ }
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0 }, borderVisible: false });
    serie.attachPrimitive(primBande); serie.attachPrimitive(primFond); serie.attachPrimitive(primTexte); serie.attachPrimitive(primOutils); serie.attachPrimitive(primMouv); serie.attachPrimitive(primInst); serie.attachPrimitive(primLecture);
    if (LW.createSeriesMarkers) marqueurs = LW.createSeriesMarkers(serie, []);
    chart.subscribeClick(p => {
      if (!p.point || !serie) return; const prix = serie.coordinateToPrice(p.point.y); if (prix == null) return;
      if (etat.modeOutil) return;   // création : gérée par les événements du pointeur (brancherGlisserOutils), un clic n'est jamais perdu
      if (etat.outil) { poser(prix); return; }
      if (glisseFait) { glisseFait = false; return; }
      const h = outilSous(p.point.x, p.point.y); if (h && h.o) { etat.outils.selection = h.o.id; redessiner(); api.surSelectionOutil && api.surSelectionOutil(h.o.id); return; }
      if (h && h.pr) { api.surClicPropose && api.surClicPropose(h.pr); return; }
      if (etat.outils.selection) { etat.outils.selection = null; redessiner(); api.surSelectionOutil && api.surSelectionOutil(null); }
      surClicPrix && surClicPrix(prix, p);
    });
    // glisser vers la gauche : arrivée près du bord des données → un morceau plus ancien (Kraken, puis la référence)
    chart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r && r.from < 40 && etat.bougies.length && api.surBordGauche) api.surBordGauche(); redessiner(); });
    /* l'ancien glisser des traits de position (blocs) est remplacé par celui des outils */ brancherGlisserOutils(); brancherInfo(); versSerie(); vueDefaut();
    for (const ev of ['pointerdown', 'wheel', 'touchstart']) el.addEventListener(ev, () => { etat.vueUser = true; }, { capture: true, passive: true });   // v12 : l'utilisateur a pris la main sur la vue
    setInterval(garde, 1200);
    return api;
  }
  /* création d'un outil : 1 clic (ligne), 2 clics (zone, tendance, rayon), 3 clics (position : entrée, stop, objectif) ; aimantation facultative */
  const POINTS = { horizontale: 1, zone: 2, tendance: 2, rayon: 2, position: 3 };
  function poserOutil(x, y) {
    let p = serie.coordinateToPrice(y), t = tDeX(x); if (p == null || t == null) return;
    if (etat.aimant) { const b = bougieA(x), tol = Math.abs(serie.coordinateToPrice(y) - serie.coordinateToPrice(y + 8)); p = aimanter(p, b, tol); if (b && (etat.modeOutil === 'tendance' || etat.modeOutil === 'rayon')) t = b.t; }
    etat.brouillon.push({ t, p: Math.round(p * 100) / 100 }); const type = etat.modeOutil;
    if (etat.brouillon.length >= POINTS[type]) { const pts = etat.brouillon; etat.brouillon = []; etat.modeOutil = null; redessiner(); api.surCreationOutil && api.surCreationOutil(type, pts); }
    else { redessiner(); api.surEtapeOutil && api.surEtapeOutil(type, etat.brouillon.length); }
  }
  /* déplacer un objet à la souris (ou au doigt) : ligne, bord de zone, ancre ou droite entière, ligne de la position */
  let glisseFait = false;
  function brancherGlisserOutils() {
    let prise = null;
    let pose = null;
    el.addEventListener('pointerdown', e => {
      if (etat.modeOutil && serie) { const r = el.getBoundingClientRect(); pose = { x: e.clientX - r.left, y: e.clientY - r.top }; return; }
      if (etat.modeOutil || etat.outil || !serie) return; const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, h = outilSous(x, y, e.pointerType === 'touch' ? 12 : 6);
      if (!h || !h.o) return; prise = { h, x0: x, y0: y, p0: serie.coordinateToPrice(y), t0: tDeX(x), orig: { ...h.o }, bouge: false };
      e.preventDefault(); e.stopPropagation(); chart.applyOptions({ handleScroll: false, handleScale: false }); el.setPointerCapture && el.setPointerCapture(e.pointerId);
    }, true);
    el.addEventListener('pointermove', e => {
      if (!prise) return; const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; if (!prise.bouge && Math.hypot(x - prise.x0, y - prise.y0) < 3) return; prise.bouge = true;
      const p = serie.coordinateToPrice(y), t = tDeX(x); if (p == null) return; const dp = p - prise.p0, dt = t != null && prise.t0 != null ? t - prise.t0 : 0, o = prise.orig, part = prise.h.part, ch = {};
      const r2 = v => Math.round(v * 100) / 100;
      if (o.type === 'horizontale') ch.p = r2(p);
      else if (o.type === 'zone') { if (part === 'tout') { ch.bas = r2(o.bas + dp); ch.haut = r2(o.haut + dp); } else ch[part] = r2(p); }
      else if (o.type === 'tendance' || o.type === 'rayon') { if (part === 'a1') { ch.t1 = t; ch.p1 = r2(p); } else if (part === 'a2') { ch.t2 = t; ch.p2 = r2(p); } else { ch.t1 = o.t1 + dt; ch.t2 = o.t2 + dt; ch.p1 = r2(o.p1 + dp); ch.p2 = r2(o.p2 + dp); } }
      else if (o.type === 'position') ch[part] = r2(p);
      prise.champs = ch; const i = etat.outils.objets.findIndex(q => q.id === o.id); if (i >= 0) etat.outils.objets[i] = { ...o, ...ch }; redessiner();
    }, true);
    el.addEventListener('pointerup', e => {
      if (!pose || !etat.modeOutil) { pose = null; return; } const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, P = pose; pose = null;
      if (Math.hypot(x - P.x, y - P.y) > 6 || !chart || y > chart.panes()[0].getHeight() || x > chart.timeScale().width()) return;   // glisser = déplacer le graphique ; hors du panneau des prix : ignoré
      poserOutil(x, y);
    }, true);
    const fin = () => { if (!prise) return; const P = prise; prise = null; chart.applyOptions({ handleScroll: true, handleScale: true });
      if (P.bouge && P.champs) { glisseFait = true; api.surModifOutil && api.surModifOutil(P.orig.id, P.champs); setTimeout(() => { glisseFait = false; }, 300); }
      else { etat.outils.selection = P.orig.id; redessiner(); api.surSelectionOutil && api.surSelectionOutil(P.orig.id); } };
    el.addEventListener('pointerup', fin, true); el.addEventListener('pointercancel', fin, true);
  }
  /* outil Position : clic 1 = entrée, clic 2 = stop, clic 3 = objectif ; ensuite, glisser un trait le déplace */
  function poser(prix) {
    const o = etat.outil; prix = Math.round(prix * 100) / 100;
    if (o === 'entree') { etat.pos = { entree: prix, stop: null, objectif: null }; etat.outil = 'stop'; }
    else if (o === 'stop') { etat.pos.stop = prix; etat.outil = 'objectif'; }
    else if (o === 'objectif') { etat.pos.objectif = prix; etat.outil = null; }
    ecrire('rayle_or_position', etat.pos); api.surPosition && api.surPosition(etat.pos, etat.outil); redessiner();
  }
  function brancherGlisser() {
    let prise = null;
    el.addEventListener('pointerdown', e => {
      if (!etat.pos || etat.outil || !serie) return; const r = el.getBoundingClientRect(), y = e.clientY - r.top;
      for (const k of ['entree', 'stop', 'objectif']) { const yk = etat.pos[k] ? yDe(etat.pos[k]) : null; if (yk != null && Math.abs(yk - y) < (e.pointerType === 'touch' ? 14 : 6) && e.clientX - r.left > r.width * 0.55) { prise = k; e.preventDefault(); e.stopPropagation(); chart.applyOptions({ handleScroll: false, handleScale: false }); el.setPointerCapture && el.setPointerCapture(e.pointerId); return; } }
    }, true);
    el.addEventListener('pointermove', e => { if (!prise) return; const r = el.getBoundingClientRect(), p = serie.coordinateToPrice(e.clientY - r.top); if (p != null) { etat.pos[prise] = Math.round(p * 100) / 100; redessiner(); } }, true);
    const fin = () => { if (!prise) return; prise = null; chart.applyOptions({ handleScroll: true, handleScale: true }); ecrire('rayle_or_position', etat.pos); api.surPosition && api.surPosition(etat.pos, null); };
    el.addEventListener('pointerup', fin, true); el.addEventListener('pointercancel', fin, true);
  }
  /* détail d'une étiquette au survol (souris) ou au clic / toucher (épinglé jusqu'au clic suivant) */
  function brancherInfo() {
    const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const tip = document.createElement('div'); tip.className = 'tor-info'; tip.hidden = true; tip.setAttribute('role', 'tooltip');
    tip.style.cssText = 'position:absolute;right:8px;z-index:4;max-width:min(360px,80%);padding:7px 10px;background:#0b1117;border:1px solid rgba(143,208,227,.4);border-radius:5px;color:#d7e3ea;font:12.5px/1.4 system-ui,sans-serif;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.5)';
    el.appendChild(tip);
    let epingle = null;
    const hparis = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const infoOutil = (x, y) => { const h = outilSous(x, y); if (!h) return null;
      if (h.c) return { p: h.c.niveau, texte: `Cassure confirmée · ${nb(h.c.niveau)}`, detail: [`clôture à au moins 0,5 ATR au-delà de l’objet (bougie H1 du ${hparis(h.c.t)})`, 'l’objet est marqué « retourné »', 'information de lecture, pas un signal ni une promesse'] };
      if (h.pr) return { p: h.pr.p, texte: `Niveau proposé ${h.pr.unite === 'J' ? 'Jour' : h.pr.unite} · ${nb(h.pr.p)}`, detail: [`grand ${h.pr.sorte} de swing (fractale de 60 bougies de chaque côté) du ${hparis(h.pr.t)}`, 'clic : confirmer en « mon niveau » ou supprimer (liste des outils)'] };
      const o = h.o; return { p: o.p ?? o.entree ?? o.p1 ?? o.bas, texte: libelle(o), detail: [NOMS_OUTILS[o.type] + (o.retourne ? ' · retourné' : ''), o.alerte ? 'alerte de prix active' : 'clic : sélectionner, glisser : déplacer', 'surveillé à la clôture des bougies H1 tant que Rayle est ouvert'] }; };
    const structSous = (x, y) => { const L = inst.cadresS || []; const c = L.find(q => q.kind === 'evt' && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) || L.find(q => q.kind === 'bos' && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) || L.find(q => q.kind === 'zone' && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1); return c ? c.g : null; };
    const zoneSous = (x, y) => { const c = (etat.cadresZ || []).find(q => x >= q.x0 - 2 && x <= q.x1 + 2 && y >= q.y0 - 3 && y <= q.y1 + 3); return c ? c.g : null; };
    const schSous = (x, y) => { const L = inst.cadresSch || []; const c = L.find(q => q.kind === 'div' && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) || L.find(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1); return c ? c.g : null; };
    const ictSous = (x, y) => { const L = inst.cadresIct || []; const c = L.find(q => q.kind !== 'kz' && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) || L.find(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1); return c ? c.g : null; };
    const raySous = (x, y) => { const L = inst.cadresRay || []; const c = L.find(q => q.kind !== 'ma' && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) || L.find(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1); return c ? c.g : null; };
    const trouver = (x, y) => { if (ictOn()) return marqueSous(x, y) || infoOutil(x, y); const c = etat.cadres.find(c => x >= c.x - 2 && x <= c.x + c.w + 2 && y >= c.y - 2 && y <= c.y + c.h + 2); return c ? c.g : (marqueSous(x, y) || infoOutil(x, y) || structSous(x, y) || schSous(x, y) || ictSous(x, y) || raySous(x, y) || zoneSous(x, y)); };
    /* flèche ou marque de balayage sous le pointeur (au-dessus de la mèche haute, ou sous la mèche basse, de la bougie) */
    const NOMS = { 'résistance': 'sous une résistance', support: 'sur un support', 'liquidité haute': 'sous une zone de liquidité haute', 'liquidité basse': 'sur une zone de liquidité basse' };
    function marqueSous(x, y) {
      if (!chart) return null; const t = chart.timeScale().coordinateToTime(x), b = t != null ? etat.barres.get(t) : null; if (!b) return null;
      const yH = yDe(b.h), yL = yDe(b.l), dessus = yH != null && y <= yH + 3 && y >= yH - 30, dessous = yL != null && y >= yL - 3 && y <= yL + 30;
      const hpar = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const z = etat.couches.liquidite !== false && etat.balayages.find(q => q.t === b.t && (q.sorte === 'haute' ? dessus : dessous));
      if (z) return { p: z.p, texte: `Liquidité ${z.sorte} ${nb(z.p, 0)} balayée`, detail: [`${z.raison} dépassé par cette bougie`] };
      return null;
    }
    /* marque réellement affichée (flèche, point gris, trade du journal) sous le pointeur : elle garde son infobulle, la corbeille ne s'y applique pas */
    function marqueVisibleSous(x, y) {
      if (!chart) return false; const t = chart.timeScale().coordinateToTime(x); if (t == null) return false;
      const b = etat.barres.get(t); if (!b) return false; const yH = yDe(b.h), yL = yDe(b.l); if (yH == null || yL == null) return false;
      return marquesLW().some(m => m.time === t && (m.position === 'aboveBar' ? y <= yH + 3 && y >= yH - 28 : y >= yL - 3 && y <= yL + 28));
    }
    const montrer = (g, y) => {
      const L = (g.detail || []).filter(d => d !== g.texte);
      tip.innerHTML = `<b>${esc(g.bord ? texteBord(g, etat.prix) : g.texte)}</b>${L.length ? '<ul style="margin:4px 0 0;padding-left:16px">' + L.map(d => `<li>${esc(d)}</li>`).join('') + '</ul>' : ''}<div style="color:#7d8a90;margin-top:3px">${etat.prix != null ? `à ${nb(Math.abs(g.p - etat.prix), 2)} $ du prix` : ''}</div>`;
      tip.hidden = false; tip.style.top = Math.max(4, Math.min(y + 16, el.clientHeight - tip.offsetHeight - 4)) + 'px';
    };
    const pos = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('pointermove', e => { if (epingle || etat.outilPro) return; const [x, y] = pos(e), g = trouver(x, y); if (g) montrer(g, y); else tip.hidden = true; el.style.cursor = g ? 'help' : ''; if (etat.suppr && !etat.modeOutil && e.pointerType === 'mouse' && !marqueVisibleSous(x, y) && etat.suppr.survol(x, y, e)) el.style.cursor = 'pointer'; });
    el.addEventListener('pointerleave', () => { if (!epingle) tip.hidden = true; });
    let basPt = null, basT = 0, dernierTap = 0; el.addEventListener('pointerdown', e => { basPt = [e.clientX, e.clientY]; basT = Date.now(); }, true);
    /* appui du doigt : la bibliothèque de graphique peut retenir le « click » synthétique ; l'appui court sans glisser ouvre la fenêtre de suppression */
    el.addEventListener('pointerup', e => {
      if (e.pointerType !== 'touch' || !etat.suppr || etat.outilPro || etat.modeOutil || (etat.brouillon && etat.brouillon.length) || !basPt) return;
      if (e.target.closest && e.target.closest('.tor-sup, .tor-sup-toast')) return;
      if (Math.hypot(e.clientX - basPt[0], e.clientY - basPt[1]) > 10 || Date.now() - basT > 600) return;
      const [sx, sy] = pos(e); if (!marqueVisibleSous(sx, sy) && etat.suppr.clic(sx, sy, e)) { dernierTap = Date.now(); tip.hidden = true; epingle = null; }
    }, true);
    el.addEventListener('click', e => { if (etat.outilPro || (e.target.closest && e.target.closest('.tor-sup, .tor-sup-toast'))) return; if (Date.now() - dernierTap < 500) { e.stopPropagation(); return; }   // la fenêtre de suppression gère ses propres clics
      if (etat.suppr && !etat.modeOutil && !(etat.brouillon && etat.brouillon.length) && !(basPt && Math.hypot(e.clientX - basPt[0], e.clientY - basPt[1]) > 5)) { const [sx, sy] = pos(e); if (!marqueVisibleSous(sx, sy) && etat.suppr.clic(sx, sy, e)) { e.stopPropagation(); tip.hidden = true; epingle = null; return; } }
      const [x, y] = pos(e), g = trouver(x, y) || mouvementSous(x, y); if (g) { e.stopPropagation(); epingle = epingle === g.texte ? null : g.texte; if (epingle) montrer(g, y); else tip.hidden = true; } else if (epingle) { epingle = null; tip.hidden = true; } }, true);
    api.fermerInfo = () => { tip.hidden = true; epingle = null; };
    api.info = (texte) => { const c = etat.cadres.find(c => c.g.texte === texte); if (!c) return null; montrer(c.g, c.y); epingle = texte; return tip.innerText; };
  }
  /* rectangles des mouvements : de la bougie de départ à la bougie de fin (pointillés si « en cours »), marqueur fin sur l'extrême de la bougie de départ, étiquette discrète */
  const primMouv = new Primitive((ctx, T) => {
    mouv.cadres = [];
    if (!chart || !serie || !mouv.h1 || etat.couches.mouvements === false || ictOn() || !mouv.liste.length || !etat.bougies.length) return;
    const ts = chart.timeScale(), vis = ts.getVisibleLogicalRange(), demi = Math.max(1, (ts.options().barSpacing || 6) / 2), fs = mobile ? 9 : 10;
    for (const m of mouv.liste) {
      const k0 = kDeT(m.t0), k1 = kDeT(m.t1); if (k0 < 0 || k1 < k0) continue; if (vis && (k1 < vis.from - 8 || k0 > vis.to + 8)) continue;
      const x0 = xDeT(m.t0), x1 = xDeT(m.t1); if (x0 == null || x1 == null) continue;
      let hi = -Infinity, lo = Infinity; for (let k = k0; k <= k1; k++) { const b = etat.bougies[k]; if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; }
      const yH = yDe(hi), yL = yDe(lo); if (yH == null || yL == null) continue;
      const xa = x0 - demi, w = x1 - x0 + 2 * demi, col = m.d > 0 ? '95,184,148' : '216,106,106';
      ctx.fillStyle = 'rgba(' + col + ',' + (m.enCours ? '.08' : '.13') + ')'; ctx.fillRect(xa, yH, w, yL - yH);
      ctx.strokeStyle = 'rgba(' + col + ',' + (m.enCours ? '.85' : '.5') + ')'; ctx.lineWidth = 1; ctx.setLineDash(m.enCours ? [4, 3] : []); ctx.strokeRect(xa + 0.5, yH + 0.5, w - 1, yL - yH - 1); ctx.setLineDash([]);
      const yd = yDe(m.depart); if (yd != null) { ctx.strokeStyle = 'rgba(' + col + ',.95)'; ctx.beginPath(); ctx.moveTo(x0 - demi, Math.round(yd) + 0.5); ctx.lineTo(x0 + demi, Math.round(yd) + 0.5); ctx.stroke(); }   // marqueur fin sur le plus bas / plus haut du départ
      if (demi >= 2.5) { ctx.font = (fs) + "px system-ui, 'Segoe UI', sans-serif"; ctx.fillStyle = 'rgba(' + col + ',.95)'; const t = etiquetteMouv(m), tw = ctx.measureText(t).width, tx = Math.max(2, Math.min(T.width - tw - 2, xa)); ctx.fillText(t, tx, m.d > 0 ? Math.max(fs, yH - 3) : Math.min(T.height - 2, yL + fs + 1)); }
      mouv.cadres.push({ x0: xa, x1: xa + w, y0: yH, y1: yL, m });
    }
  }, 'bottom');
  /* outils institutionnels (VWAP, profil de volume, CVD, séances…) : modèle calculé par institutionnel-or.js, dessiné par institutionnel-dessin.js */
  /* ── mode Direct v8 : lecture (boîtes de position, grosses zones R1…S3, MA200 colorée par le régime) ── */
  const lecture = { boites: [], zones: [], ma: 0, etiq: [], zonesPix: [], boitesPix: [] };
  const lisibleV8 = () => !!(etat.lecture && etat.lecture.zones && etat.couches.zonesLisibles !== false && !etat.couches.autresNiveaux);
  const primLecture = new Primitive((ctx, T) => {
    lecture.boites = []; lecture.zones = []; lecture.etiq = []; lecture.zonesPix = []; lecture.boitesPix = []; lecture.ma = 0;
    lecture.reglageX = null; const L = etat.lecture; if (!L || !chart || !serie || !etat.bougies.length) return;
    const fs = mobile ? 10 : 11, derT = etat.bougies[etat.bougies.length - 1].t, xFin = (xDeT(derT) ?? T.width) + (mobile ? 8 : 14), pas = perBougie();
    if (lisibleV8() && !ictOn()) {
      const utilises = [];
      for (const z of L.zones) {
        const y0 = yDe(z.haut), y1 = yDe(z.bas); if (y0 == null || y1 == null || y1 < 0 || y0 > T.height) continue;
        const h = Math.max(2, y1 - y0), col = z.sens === 'resistance' ? '226,174,98' : '134,195,232', x0 = Math.max(0, z.tDebut != null ? (xDeT(z.tDebut) ?? 0) : 0);
        ctx.fillStyle = `rgba(${col},.10)`; ctx.fillRect(x0, y0, T.width - x0, h); ctx.strokeStyle = `rgba(${col},.55)`; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x0, Math.round(y0) + 0.5); ctx.lineTo(T.width, Math.round(y0) + 0.5); ctx.moveTo(x0, Math.round(y1) + 0.5); ctx.lineTo(T.width, Math.round(y1) + 0.5); ctx.stroke();
        ctx.font = `600 ${fs}px system-ui, 'Segoe UI', sans-serif`; const t = `${z.etiquette}  ${z.plage}${z.niveauNom && z.niveauType === 'structure' ? '  ' + z.niveauNom : ''}`, w = ctx.measureText(t).width + 8;
        let yt = y0 + h / 2; for (let k = 0; k < 6 && utilises.some(u => Math.abs(u - yt) < fs + 4); k++) yt += fs + 4; utilises.push(yt);
        const xt = T.width - w - 4; ctx.fillStyle = 'rgba(8,12,16,.78)'; ctx.fillRect(xt, yt - fs, w, fs + 4); ctx.fillStyle = `rgba(${col},1)`; ctx.fillText(t, xt + 4, yt + 1);
        lecture.zones.push({ etiquette: z.etiquette }); lecture.etiq.push({ x: xt, y: yt - fs, w, h: fs + 4, texte: t }); lecture.zonesPix.push({ etiquette: z.etiquette, y0, y1, bas: z.bas, haut: z.haut, nom: `${z.etiquette} ${z.plage}`, x1: T.width });
      }
    }
    const tout = !!etat.couches.boitesToutes, quelques = tout || etat.couches.boitesPos !== false;
    if (quelques && L.boites && !ictOn()) {
      const B = L.boites.filter(b => b.visible !== false), liste = tout ? B : B.slice(-3);
      for (const b of liste) {
        const xa = xDeT(b.t0 - pas); if (xa == null) continue; let xb = b.figee ? xDeT(b.tFin - pas) : xFin; if (xb == null) xb = xFin; const x0 = Math.max(0, xa); if (xb < 0 || x0 > T.width) continue; xb = Math.max(x0 + 3, xb);
        const ye = yDe(b.entree), ys = yDe(b.stop), y1 = yDe(b.tp1), y2 = yDe(b.tp2); if ([ye, ys, y1, y2].some(v => v == null)) continue;
        const gris = b.figee, aa = gris ? 0.07 : 0.15;
        ctx.fillStyle = `rgba(216,106,106,${aa})`; ctx.fillRect(x0, Math.min(ye, ys), xb - x0, Math.abs(ys - ye)); ctx.fillStyle = `rgba(95,184,148,${aa})`; ctx.fillRect(x0, Math.min(ye, y1), xb - x0, Math.abs(y1 - ye));
        ctx.strokeStyle = gris ? 'rgba(160,170,176,.55)' : 'rgba(207,216,220,.7)'; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x0, Math.round(ye) + 0.5); ctx.lineTo(xb, Math.round(ye) + 0.5); ctx.stroke();
        ctx.strokeStyle = gris ? 'rgba(216,106,106,.35)' : 'rgba(216,106,106,.8)'; ctx.beginPath(); ctx.moveTo(x0, Math.round(ys) + 0.5); ctx.lineTo(xb, Math.round(ys) + 0.5); ctx.stroke();
        ctx.strokeStyle = gris ? 'rgba(95,184,148,.35)' : 'rgba(95,184,148,.8)'; ctx.beginPath(); ctx.moveTo(x0, Math.round(y1) + 0.5); ctx.lineTo(xb, Math.round(y1) + 0.5); ctx.stroke();
        ctx.setLineDash([3, 3]); ctx.strokeStyle = gris ? 'rgba(95,184,148,.3)' : 'rgba(95,184,148,.6)'; ctx.beginPath(); ctx.moveTo(x0, Math.round(y2) + 0.5); ctx.lineTo(xb, Math.round(y2) + 0.5); ctx.stroke(); ctx.setLineDash([]);
        if (b.figee) { ctx.font = `600 ${fs}px system-ui, 'Segoe UI', sans-serif`; const t = b.libelle, w = ctx.measureText(t).width + 6, xr = Math.max(x0 + 2, xb - w - 2), yr = (b.R >= 0 ? Math.min(ye, y1) : Math.max(ye, ys)) + (b.R >= 0 ? -3 : fs + 1); ctx.fillStyle = 'rgba(8,12,16,.7)'; ctx.fillRect(xr, yr - fs, w, fs + 3); ctx.fillStyle = b.R >= 0 ? '#5fb894' : '#d86a6a'; ctx.fillText(t, xr + 3, yr); }
        lecture.boites.push({ id: b.id, figee: !!b.figee }); lecture.boitesPix.push({ id: b.id, x0, x1: xb, ye, ys, y1, y2, libelle: b.libelle, figee: !!b.figee });
      }
    }
    if (L.regime && L.regime.length && inst.ray && inst.ray.ma && inst.ray.ma.length > 1 && etat.couches.rayMa !== false) {
      const pts = reduireMA(inst.ray.ma, etat.bougies); ctx.lineWidth = 2; ctx.setLineDash([]);
      for (const sg of L.regime) {
        if (!sg.dir) continue; ctx.strokeStyle = sg.dir > 0 ? 'rgba(95,184,148,.95)' : 'rgba(216,106,106,.95)'; ctx.beginPath(); let debut = true, n = 0;
        for (const q of pts) { if (q.t < sg.t0 || q.t > sg.t1) { if (q.t > sg.t1) break; continue; } const x = xDeT(q.t), y = yDe(q.v); if (x == null || y == null || x < -20 || x > T.width + 20) { debut = true; continue; } if (debut) { ctx.moveTo(x, y); debut = false; } else ctx.lineTo(x, y); n++; }
        if (n) { ctx.stroke(); lecture.ma += n; }
      }
      ctx.lineWidth = 1;
    }
  }, 'top');

  const inst = { m: null, props: [], struct: null, cadresS: [], sch: null, cadresSch: [], ict: null, cadresIct: [], ray: null, cadresRay: [] };
  const primInst = new Primitive((ctx, T) => { if (!chart || !serie || !etat.bougies.length) return; dessinerInstitutionnel(ctx, T, inst.m, { xDeT, yDe, mobile, props: inst.props, fusion: !!etat.lecture }); inst.cadresS = (etat.couches.structure || etat.couches.retournements) ? dessinerStructure(ctx, T, inst.struct, { xDeT, yDe, mobile }) : []; inst.cadresSch = (etat.couches.rsi || etat.couches.divCachees || etat.couches.schemas) && inst.sch ? dessinerSchemas(ctx, T, inst.sch, { xDeT, yDe, mobile }) : []; inst.cadresIct = inst.ict ? dessinerIct(ctx, T, inst.ict, { xDeT, yDe, mobile, barres: etat.bougies, reserve: { w: 480, h: etat.reserveHaut || 0 } }) : []; if (inst.ict) autresRayle(inst.cadresIct); inst.cadresRay = inst.ray ? dessinerRayle(ctx, T, (r => ictOn() ? { ...r, niveaux: [], boites: [], ligne: null, structure: [], scenarios: null } : lisibleV8() ? { ...r, niveaux: [] } : r)(inst.ray && inst.ray.ma ? { ...inst.ray, ma: reduireMA(inst.ray.ma, etat.bougies) } : inst.ray), { xDeT, yDe, mobile }) : []; }, 'top');
  /* les niveaux de Rayle qui tombent sur un objet ICT ne sont pas tracés une deuxième fois : leur nom est ajouté à la bulle de l'objet ICT */
  function autresRayle(cadres) {
    const atrI = (inst.ict && inst.ict.atr) || etat.a || 1, tol = 0.1 * atrI, N = [];
    for (const n of (inst.ray && inst.ray.niveaux) || []) N.push({ p: n.p, nom: n.etiquette });
    for (const q of etat.autresNiveaux || []) N.push({ p: q.p, nom: q.nom });
    for (const pr of (etat.outils && etat.outils.proposes) || []) N.push({ p: pr.p, nom: 'niveau proposé ' + (pr.unite === 'J' ? 'Jour' : pr.unite) + ' ' + nb(pr.p, 1) });
    const vus = new Map();
    for (const c of cadres) { const o = c.objet; if (!o) continue; if (!vus.has(o)) { const A = []; for (const q of N) { const dans = o.p != null ? Math.abs(q.p - o.p) <= tol : o.bas != null ? q.p >= o.bas - tol && q.p <= o.haut + tol : false; if (dans && q.nom && !A.includes(q.nom)) A.push(q.nom); } vus.set(o, [...(o.autres || []), ...A]); } c.autres = vus.get(o); }
  }
  const redessiner = () => { try { majPastilles(inst.ict); appliquerMarges(); } catch (e) { /* graphique pas prêt */ } primTexte.maj && primTexte.maj(); primFond.maj && primFond.maj(); primMouv.maj && primMouv.maj(); primInst.maj && primInst.maj(); primLecture.maj && primLecture.maj(); };

  /* marge haute réservée (badge, barre d'outils) : une fraction de la hauteur du panneau des prix, la même avec ou sans ICT */
  function appliquerMarges() { if (!chart || !serie) return; let h = 0; try { h = chart.panes()[0].getHeight(); } catch (e) { /* version sans getHeight */ } if (!h) h = Math.round((el.clientHeight || 600) * 0.7); const top = Math.round(Math.max(0.08, Math.min(0.45, (etat.reserveHaut || 0) / h)) * 1000) / 1000; if (top === etat.topApplique) return; etat.topApplique = top; try { serie.priceScale().applyOptions({ scaleMargins: { top, bottom: 0.08 } }); } catch (e) { /* */ } }
  /* pastilles de l'axe : le PRIX seulement, en blanc, pour la BSL et la SSL visées (lignes de prix sans trait : elles n'entrent jamais dans l'échelle) */
  const pastilles = []; let cleP = null; function majPastilles(m) {
    if (!serie) return; const cle = JSON.stringify(((m && m.pastilles) || []).map(q => q.p)); if (cle === cleP) return; cleP = cle; for (const q of pastilles.splice(0)) { try { serie.removePriceLine(q.ligne); } catch (e) { /* */ } }
    for (const q of (m && m.pastilles) || []) { try { pastilles.push({ prix: q.p, ligne: serie.createPriceLine({ price: q.p, color: '#eef2f6', lineVisible: false, axisLabelVisible: true, title: '', axisLabelColor: '#eef2f6', axisLabelTextColor: '#10151a' }) }); } catch (e) { /* */ } }
  }
  const api = {
    pret: () => pret,
    /* L : bougies affichées (référence décalée « ref: true » puis Kraken) ; cle : la période (nouvelle période → vue par défaut) */
    bougies(L, volumes, { cle = null, debutKraken = null, ecart = null } = {}) {
      /* 2026-11-15 : une série qui passe de quelques bougies (bougie en direct seule) à tout l'historique recadre aussi la vue (sinon le graphique restait calé tout à gauche en H4 et Jour) */
      const nouvelle = (cle !== etat.cle) || (!etat.bougies.length && L.length) || (etat.bougies.length < 20 && L.length >= 50);
      etat.bougies = L; if (volumes) etat.volumes = volumes; etat.cle = cle; etat.debutKraken = debutKraken; etat.ecart = ecart;
      if (nouvelle) { sig = null; etat.vueUser = false; }
      try { versSerie(); } catch (e) { console.warn('bougies :', e.message); }
      if (nouvelle && chart && L.length) vueDefaut();
      redessiner();
    },
    vueDefaut, recaler, mesureVue, vueCassee,
    majDerniere(b) {
      if (!serie || !b) return; const der = etat.bougies[etat.bougies.length - 1]; sig = sig && { ...sig, n: etat.bougies.length };
      if (der && b.t < der.t) return;
      if (!der) return;
      try { serie.update({ time: tempsGraphique(b.t), open: b.o, high: b.h, low: b.l, close: b.c }); } catch (e) { console.warn('bougie en cours :', e.message); }
    },
    couches(c) { if (c) { etat.couches = { ...etat.couches, ...c }; ecrire('rayle_or_couches_v2', etat.couches); redessiner(); if (marqueurs) marqueurs.setMarkers(marquesLW()); } return { ...etat.couches }; },
    institutionnel(m) { inst.m = m; redessiner(); },
    propositions(L) { inst.props = L || []; redessiner(); },
    structure(m) { inst.struct = m; redessiner(); },
    schemas(m) { inst.sch = m; redessiner(); },
    ict(m) { const avant = !!inst.ict; inst.ict = m; if (!!m !== avant && chart && etat.bougies.length) { try { const ts = chart.timeScale(), r = ts.getVisibleLogicalRange(), n = etat.bougies.length, g = margeIct(); if (r && etat.vueUser) { const d = g - (r.to - (n - 1)); ts.setVisibleLogicalRange({ from: r.from, to: r.to + d }); } else vueDefaut(); } catch (e) { /* vue pas prête */ } } redessiner(); },
    /* place libre en haut du graphique pour le badge et la barre d'outils : l'échelle de prix ne dépend ni de l'ICT ni de ses objets */
    reserverHaut(px) { const v = Math.max(0, Math.round(px || 0)); if (v === etat.reserveHaut) return v; etat.reserveHaut = v; appliquerMarges(); redessiner(); return v; },
    pastillesAxe: () => pastilles.map(q => q.prix),
    niveauxAutres(L) { etat.autresNiveaux = Array.isArray(L) ? L : []; },
    rayle(m) { inst.ray = m; redessiner(); },
    /* terminal tactile (tactile-v1.js) : volume masqué (le panneau du volume est réduit à presque rien), la bande RSI reste celle de la couche « rsi » */
    tactile(on) { etat.tactile = !!on; try { vol.applyOptions({ visible: !on }); const P = chart.panes(); P[1].setStretchFactor(on ? 0.001 : 1); } catch (e) { /* */ } redessiner(); return etat.tactile; },
    /* mode Direct v8 : boîtes de position, grosses zones lisibles, MA200 colorée par le régime ({ boites, zones, regime }) ; null = rien (autres modes) */
    xReglage: () => lecture.reglageX == null ? null : lecture.reglageX,
    lectureV8(L) { etat.lecture = L || null; redessiner(); return etat.lecture ? { boites: (etat.lecture.boites || []).length, zones: (etat.lecture.zones || []).length } : null; },
    lectureV8Etat: () => ({ reglageX: lecture.reglageX == null ? null : lecture.reglageX, boites: lecture.boites.length, zones: lecture.zones.length, lisible: lisibleV8(), ma: lecture.ma, etiq: lecture.etiq.slice(), zonesPix: lecture.zonesPix.slice(), boitesPix: lecture.boitesPix.slice() }),
    margeDroite(n) { if (chart) chart.applyOptions({ timeScale: { rightOffset: n } }); },
    rayleEtat: () => ({ cadres: (inst.cadresRay || []).length, types: (inst.cadresRay || []).reduce((o, c) => (o[c.kind] = (o[c.kind] || 0) + 1, o), {}), cadresListe: (inst.cadresRay || []).map(c => ({ kind: c.kind, x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, texte: c.g && c.g.texte })), etiquettes: ((inst.cadresRay && inst.cadresRay.etiquettes) || []).map(r => ({ x0: r.x0, y0: r.y0, w: r.w, h: r.h })) }),
    ictCadreA: (x, y) => { const L = (inst.cadresIct || []).filter(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1 && q.objet); const surface = q => (q.x1 - q.x0) * (q.y1 - q.y0); return L.find(q => q.carre) || L.filter(q => q.kind !== 'bande').sort((a, b) => surface(a) - surface(b))[0] || L[0] || null; },
    ictEtat: () => ({ carres: ((inst.cadresIct && inst.cadresIct.carres) || []).map(c => ({ ...c })), reserveHaut: etat.reserveHaut || 0, pastilles: pastilles.length, etiquettes: { demandees: (inst.cadresIct && inst.cadresIct.etiquettesDemandees) || 0, posees: ((inst.cadresIct && inst.cadresIct.etiquettes) || []).filter(e => !e.replie).length }, cadres: (inst.cadresIct || []).length, types: (inst.cadresIct || []).reduce((o, c) => (o[c.kind] = (o[c.kind] || 0) + 1, o), {}) }),
    schemasEtat: () => ({ cadres: (inst.cadresSch || []).length, types: (inst.cadresSch || []).reduce((o, c) => (o[c.kind] = (o[c.kind] || 0) + 1, o), {}) }),
    /* panneau RSI sous le graphique (3e panneau) : points [{ t, v }] ou null pour le retirer ; divs : segments de divergence sur le RSI */
    /* RSI 14 (Wilder) : UNE seule sous-fenêtre sous le prix (volet 2), jamais deux. Ligne dorée, 70 / 30 discrets, 50 en pointillé très léger, remplissage léger au-dessus de 70 et sous 30.
       divs : [{ t1, t2, r1, r2, dir, label, confirmeT }] → petit trait entre les deux pivots + étiquette « div » (posée seulement une fois le second pivot confirmé : jamais de repaint). */
    async rsi(points, divs = []) {
      await pret; if (!chart || !LW) return;
      const retirer = () => { for (const q of rsiDiv) { try { chart.removeSeries(q); } catch (e) { /* */ } } rsiDiv = []; for (const q of [rsiSerie, rsiHaut, rsiBas]) if (q) { try { chart.removeSeries(q); } catch (e) { /* */ } } rsiSerie = rsiHaut = rsiBas = null; };
      if (!points || !points.length) { retirer(); return false; }
      if (!rsiSerie) {
        const commun = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => ({ priceRange: { minValue: 5, maxValue: 95 } }) };
        const transp = 'rgba(0,0,0,0)';
        rsiHaut = chart.addSeries(LW.BaselineSeries, { ...commun, baseValue: { type: 'price', price: 70 }, topFillColor1: 'rgba(216,106,106,.22)', topFillColor2: 'rgba(216,106,106,.05)', bottomFillColor1: transp, bottomFillColor2: transp, topLineColor: transp, bottomLineColor: transp, lineWidth: 1 }, 2);
        rsiBas = chart.addSeries(LW.BaselineSeries, { ...commun, baseValue: { type: 'price', price: 30 }, bottomFillColor1: 'rgba(95,184,148,.22)', bottomFillColor2: 'rgba(95,184,148,.05)', topFillColor1: transp, topFillColor2: transp, topLineColor: transp, bottomLineColor: transp, lineWidth: 1 }, 2);
        rsiSerie = chart.addSeries(LW.LineSeries, { ...commun, color: '#ffc266', lineWidth: 1, lastValueVisible: true, priceFormat: { type: 'custom', formatter: v => Number(v).toFixed(0), minMove: 1 } }, 2);
        rsiSerie.createPriceLine({ price: 70, color: 'rgba(216,106,106,.45)', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '70' });
        rsiSerie.createPriceLine({ price: 30, color: 'rgba(95,184,148,.45)', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '30' });
        rsiSerie.createPriceLine({ price: 50, color: 'rgba(255,224,138,.16)', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });
        try { const P = chart.panes(); P[0].setStretchFactor(mobile ? 4 : 5); P[1].setStretchFactor(etat.tactile ? 0.001 : 1); if (P[2]) P[2].setStretchFactor(mobile ? 1.4 : 1.6); } catch (e) { /* */ }
      }
      const m = new Map(); for (const q of points) { const tt = tDe(q.t); if (tt != null && Number.isFinite(q.v)) m.set(tt, q.v); }
      const data = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
      rsiSerie.setData(data); rsiHaut.setData(data); rsiBas.setData(data);
      for (const q of rsiDiv) { try { chart.removeSeries(q); } catch (e) { /* */ } } rsiDiv = [];
      for (const d of divs.slice(-8)) {
        const t1 = tDe(d.t1), t2 = tDe(d.t2); if (t1 == null || t2 == null || t1 >= t2) continue;
        const couleur = d.dir > 0 ? '#5fb894' : '#d86a6a';
        const q = chart.addSeries(LW.LineSeries, { color: couleur, lineWidth: 2, lineStyle: d.cachee ? 2 : 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null }, 2);
        q.setData([{ time: t1, value: d.r1 }, { time: t2, value: d.r2 }]);
        if (LW.createSeriesMarkers) { try { LW.createSeriesMarkers(q, [{ time: t2, position: d.dir > 0 ? 'belowBar' : 'aboveBar', color: couleur, shape: 'circle', size: 0.2, text: d.label || 'div' }]); } catch (e) { /* marques indisponibles */ } }
        rsiDiv.push(q);
      }
      return true;
    },
    rsiEtat: () => { let panneaux = 0, lignes = 0; try { panneaux = chart ? chart.panes().length : 0; } catch (e) { /* */ } lignes = rsiSerie ? 1 : 0; return { actif: !!rsiSerie, lignes, panneaux, divergences: rsiDiv.length, remplissages: (rsiHaut ? 1 : 0) + (rsiBas ? 1 : 0) }; },
    structureEtat: () => ({ cadres: (inst.cadresS || []).length, types: (inst.cadresS || []).reduce((o, c) => (o[c.kind] = (o[c.kind] || 0) + 1, o), {}) }),
    mouvements(liste, { h1 = false } = {}) { mouv.liste = liste || []; mouv.h1 = !!h1; redessiner(); return mouv.liste.length; },
    mouvementsEtat: () => ({ h1: mouv.h1, actif: mouv.h1 && etat.couches.mouvements !== false, total: mouv.liste.length, dessines: mouv.cadres.length, cadres: mouv.cadres.map(c => ({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, sens: c.m.sens, bougies: c.m.bougies, enCours: !!c.m.enCours, t0: c.m.t0 })) }),
    zonesH1: () => (etat.aff ? [...etat.aff.sr.actives, ...etat.aff.sr.traces] : []).map(z => ({ id: z.id, cote: z.cote, bas: z.bas, haut: z.haut, tDebut: z.tDebut, tFin: z.tFin ?? null, retournee: !!z.retournee, nom: z.elements ? zoneTexte(z) : (z.nom || z.id), force: z.elements ? z.elements.reduce((u, e) => u + (e.touches || 1), 0) : 1 })),
    marquesAffichees: () => marquesLW(),
    dessin({ zonesVol, niveaux, retournement, prix, a, bandes, liquidite, balayages, h1 }) { if (h1) etat.h1 = h1; if (bandes) etat.bandes = bandes; if (liquidite) etat.liquidite = liquidite; if (balayages) etat.balayages = balayages; if (zonesVol) etat.zonesVol = zonesVol.slice().sort((x, y) => (y.force || 0) - (x.force || 0)).slice(0, 3); if (niveaux) etat.niveaux = niveaux; if (retournement) etat.retournement = retournement; if (a != null) etat.a = a; if (prix != null) etat.prix = prix; calculerAff(); redessiner(); },
    etiquettes: () => etat.cadres.map(c => ({ texte: c.g.texte, bord: c.g.bord || null, n: c.g.n, detail: c.g.detail, x: c.x, y: c.y, w: c.w, h: c.h })),
    tempsDeBougie: t => { const tb = tBougie(t); return tb == null ? null : tDe(tb); },
    marques(L) { etat.marques = L || []; if (marqueurs) marqueurs.setMarkers(marquesLW()); },
    outil(v) { etat.outil = v; if (v === 'entree') etat.pos = null; redessiner(); return etat.outil; },
    /* outils dessinés (terminal-outils.js) */
    outils(d) { if (d) { etat.outils = { ...etat.outils, ...d, objets: d.objets ? d.objets.map(o => ({ ...o })) : etat.outils.objets }; if (marqueurs) marqueurs.setMarkers(marquesLW()); redessiner(); } return etat.outils; },
    modeOutil(type) { etat.modeOutil = POINTS[type] ? type : null; etat.brouillon = []; redessiner(); return etat.modeOutil; },
    aimant(v) { if (v != null) etat.aimant = !!v; return etat.aimant; },
    async ma200(points, { couleur = 'rgba(201,178,122,.85)' } = {}) { await pret; if (!points) { if (maSerie) { chart.removeSeries(maSerie); maSerie = null; } return; }
      if (!maSerie) maSerie = chart.addSeries(LW.LineSeries, { color: couleur, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null });
      const m = new Map(); for (const q of points) { const tt = tDe(q.t); if (tt != null && Number.isFinite(q.v)) m.set(tt, q.v); } maSerie.setData([...m.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }))); return maSerie; },
    conteneur: () => el,
    masques(l) { etat.masques = Array.isArray(l) ? l.slice() : []; redessiner(); return etat.masques.length; },
    surbrillance(cle) { if (etat.hl === cle) return; etat.hl = cle || null; redessiner(); },
    brancherSuppression(h) { etat.suppr = h || null; },
    /* éléments sous le pointeur qu'on peut supprimer ou masquer (tolérance en pixels) : dessins, niveaux proposés, zones support / résistance et liquidité ; jamais les flèches */
    candidatsSuppr(x, y, tol) {
      const L = [], h = outilSous(x, y, tol);
      if (h && h.o) { const o = h.o, bas = o.bas ?? o.p ?? o.p1 ?? o.entree, haut = o.haut ?? o.p ?? o.p2 ?? o.entree; L.push({ type: 'objet', cle: 'obj:' + o.id, o, d: h.d, nom: libelle(o) || NOMS_OUTILS[o.type], bas: Math.min(bas, haut), haut: Math.max(bas, haut) }); }
      else if (h && h.pr) L.push({ type: 'propose', cle: 'pr:' + h.pr.cle, pr: h.pr, d: h.d, nom: `Niveau proposé ${h.pr.unite === 'J' ? 'Jour' : h.pr.unite} (${h.pr.sorte})`, bas: h.pr.p, haut: h.pr.p });
      for (const c of etat.cadresZ || []) { if (!c.z) continue; const d = distanceRect(x, y, { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 }); if (d > tol) continue; const z = c.z, bas = z.bas ?? z.p, haut = z.haut ?? z.p; L.push({ type: 'zone', kind: c.kind, cle: cleZ(c.kind, z), z, d, nom: c.g && c.g.texte ? c.g.texte : (z.texte || 'Niveau'), bas: Math.min(bas, haut), haut: Math.max(bas, haut) }); }
      for (const q of lecture.zonesPix) { const d = distanceRect(x, y, { x0: 0, x1: q.x1, y0: q.y0, y1: q.y1 }); if (d > tol) continue; L.push({ type: 'zone', kind: 'sr', cle: 'z:sr:' + Math.round(((q.bas + q.haut) / 2) * 100), z: { bas: q.bas, haut: q.haut, p: (q.bas + q.haut) / 2 }, d, nom: q.nom, bas: q.bas, haut: q.haut }); }   // grosses zones lisibles (v8) : même suppression que les autres niveaux
      return L;
    },
    xDeT, tDeX, outilsCadres: () => etat.outilsCadres.map(c => ({ sorte: c.sorte, id: c.o ? c.o.id : c.pr ? c.pr.cle : null, y: c.y ?? c.y0 ?? (c.ys && c.ys.entree) ?? c.y1, x: c.x ?? c.x1 ?? c.x0 ?? null, ys: c.ys || null, y0: c.y0, y1: c.y1, x1: c.x1, x2: c.x2, y2: c.y2 })),
    position: () => etat.pos, poserPosition(p) { etat.pos = p ? { entree: p.entree, stop: p.stop, objectif: p.objectif } : null; ecrire('rayle_or_position', etat.pos); },   // données seulement (dessin : outil Position en lignes)
    effacerPosition() { etat.pos = null; etat.outil = null; ecrire('rayle_or_position', null); redessiner(); },
    allerA(t) { if (!chart) return; const ts = chart.timeScale(), s = tempsGraphique(t); ts.setVisibleRange({ from: s - 60 * 3600, to: s + 30 * 3600 }); },
    yDe, chart: () => chart, serie: () => serie, etat: () => etat,
    detruire() { try { chart && chart.remove(); } catch (e) { /* */ } }
  };
  pret = monter();
  return api;
}
