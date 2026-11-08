/* ═════════════ TERMINAL : OUTILS DE DESSIN, SURVEILLANCE, ALERTES, REGISTRE, ZONES DE RÉACTION (phase B) ═════════════
   Outils : ligne horizontale, zone, ligne de tendance, rayon, ligne verticale, mesure, texte, gomme ; sélection, déplacement, édition
   (prix, étiquette, couleur, épaisseur, « m'alerter », alertes par type, unité surveillée), suppression, « tout effacer » (confirmation),
   annuler / rétablir. Objets mémorisés par actif sur l'appareil (IndexedDB « rayle-terminal-outils »), export / import JSON.
   Surveillance : règles figées alertes-terminal-v1 (regles-terminal.js), bougies CLOSES de l'unité de chaque objet, sans repeint.
   Information de lecture seulement : jamais un ordre, jamais un signal ni une promesse. */
import { creer, modifier, deplacer, toucher, aimanter, creerHistorique, exporter, importer, libelle, NOMS_OBJETS, PALETTE, SURVEILLES, TYPES_OBJETS } from './objets-calcul.js';
import { surveiller, closes, excursion, bilanRegistre, zonesReaction, alerteActive } from './surveillance-terminal.js';
import { admettre, texteAlerte, phraseAlerte, MENTION, MENTION_OUVERT, TEXTES } from './alertes-calcul.js';
import { REGLES_TERMINAL, TEXTE_REGLES_TERMINAL } from './regles-terminal.js';
import { ouvrirStockage } from './stockage-terminal.js';
import { PAR_ID_T, UNITES, ORDRE_UNITES, fmt } from './actifs-terminal.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : { ...d, ...JSON.parse(v) }; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };
const HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const heure = t => HEURE.format(new Date(t));
const DEUX_POINTS = ['zone', 'tendance', 'rayon', 'mesure'];
export const REGLAGES_ALERTES = Object.freeze({ son: true, notif: false, telegram: false, voix: false });

export async function monterDessin(T, { stockage = null, maintenant = () => Date.now(), intervalle = 60e3 } = {}) {
  const st = stockage || await ouvrirStockage();
  const E = { objets: [], hist: null, sel: null, brouillon: null, mesure: null, survol: null, drag: null, aimant: lire('rayle_term_aimant', { v: true }).v, resultats: new Map(), zones: [], zoneChoisie: null,
    alertes: (await st.tout('alertes')).sort((a, b) => b.recu - a.recu), nonLues: 0, regl: lire('rayle_term_alertes_regl', { ...REGLAGES_ALERTES }), registre: null, detruit: false, prets: false };
  E.nonLues = E.alertes.filter(a => !a.lu).length;
  const G = T.graph, el = G.element;
  const nomA = id => (PAR_ID_T[id] || {}).nom || id;
  const f = p => fmt(T.actif(), p);

  /* ── objets de l'actif affiché ── */
  async function chargerObjets() { const L = (await st.lire('objets', T.actif())) || []; E.objets = L; E.hist = creerHistorique(L); E.sel = null; fermerEdition(); G.redessiner(); majBoutons(); }
  async function sauver() { await st.ecrire('objets', E.objets, T.actif()); }
  function appliquer(nouveaux, { garderSel = true } = {}) { E.objets = E.hist.appliquer(nouveaux); if (!garderSel || !E.objets.some(o => o.id === E.sel)) E.sel = null; sauver(); G.redessiner(); majBoutons(); planifierSurveillance(); T.emettre('objets', E.objets); }
  function ajouterObjet(o) { appliquer(E.objets.concat(o)); E.sel = o.id; ouvrirEdition(o); return o; }
  function majBoutons() { const a = T.q('[data-a="annuler"]'), r = T.q('[data-a="retablir"]'), m = T.q('[data-a="aimant"]'); if (a) a.disabled = !E.hist.peutAnnuler(); if (r) r.disabled = !E.hist.peutRetablir(); if (m) m.classList.toggle('actif', E.aimant); }

  /* ── coordonnées ── */
  const largeurPanneau = () => { const c = G.chart(); try { return c ? c.timeScale().width() : el.clientWidth; } catch (e) { return el.clientWidth; } };
  const pos = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const X = t => G.xDe(t), Y = p => G.yDe(p);
  function prixAimante(x, y) {
    let p = G.prixDe(y); if (!E.aimant || p == null) return p;
    const t = G.tDe(x), B = G.bougies(); if (t == null || !B.length) return p;
    let lo = 0, hi = B.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m].t < t - T.graph.ms() / 2) lo = m + 1; else hi = m; }
    const tol = Math.abs(G.prixDe(y) - G.prixDe(y + 8)); return aimanter(p, B[lo], tol);
  }

  /* ── dessin ── */
  G.ajouterPrimitive((ctx, D) => {
    const c = T.couches(), W = D.width, H = D.height;
    ctx.font = '11px Segoe UI, system-ui, sans-serif';
    // zones de réaction proposées
    if (c.zonesVol) for (const z of E.zones) {
      const y1 = Y(z.haut), y2 = Y(z.bas); if (y1 == null || y2 == null) continue; const x0 = Math.max(0, X(z.depuis) ?? 0), w = W - x0;
      ctx.fillStyle = z === E.zoneChoisie ? 'rgba(201,178,122,.16)' : 'rgba(201,178,122,.07)'; ctx.fillRect(x0, y1, w, Math.max(2, y2 - y1));
      ctx.strokeStyle = 'rgba(201,178,122,.45)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y1 + 0.5, w - 1, Math.max(2, y2 - y1));
      const t = `zone de réaction · testée ${z.tests} fois, a tenu ${z.tenues}`; const tw = ctx.measureText(t).width + 8, xx = Math.max(4, W * 0.55 - tw);
      ctx.fillStyle = 'rgba(5,8,12,.85)'; ctx.fillRect(xx, (y1 + y2) / 2 - 8, tw, 15); ctx.fillStyle = '#c9b27a'; ctx.fillText(t, xx + 4, (y1 + y2) / 2 + 4);
    }
    if (c.outils !== false) for (const o of E.objets) dessinerObjet(ctx, o, W, H, o.id === E.sel || o.id === E.survol);
    if (E.brouillon) dessinerObjet(ctx, E.brouillon, W, H, true, true);
    if (E.mesure) dessinerMesure(ctx, E.mesure);
    // flèches et croix des outils (registre de la surveillance)
    if (c.fleches !== false) {
      const r = E.resultats.get(T.actif()); if (r) {
        for (const fl of r.fleches) { const x = X(fl.t), y = Y(fl.prix); if (x == null || y == null || x < -10 || x > W + 10) continue; const h = fl.sens === 'hausse'; ctx.fillStyle = h ? '#4fd18b' : '#ef6a5f'; ctx.beginPath(); const yy = h ? y + 14 : y - 14; ctx.moveTo(x, h ? yy - 7 : yy + 7); ctx.lineTo(x - 5, h ? yy + 2 : yy - 2); ctx.lineTo(x + 5, h ? yy + 2 : yy - 2); ctx.closePath(); ctx.fill(); }
        for (const cr of r.croix) { const x = X(cr.t), y = Y(cr.niveau); if (x == null || y == null || x < -10 || x > W + 10) continue; ctx.strokeStyle = '#e8eef2'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke(); }
      }
    }
  }, 'top');
  function dessinerObjet(ctx, o, W, H, actif, brouillon = false) {
    const col = o.couleur || '#8fd0e3', lw = (o.epaisseur || 1) + (actif ? 0.6 : 0);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.setLineDash(brouillon ? [4, 3] : []);
    const etq = (x, y, t) => { if (!t) return; const w = ctx.measureText(t).width + 8; const xx = Math.min(W - w - 2, Math.max(2, x)); ctx.fillStyle = 'rgba(5,8,12,.85)'; ctx.fillRect(xx, y - 15, w, 14); ctx.fillStyle = col; ctx.fillText(t, xx + 4, y - 4); };
    const poignee = (x, y) => { if (!actif) return; ctx.fillStyle = '#05080c'; ctx.fillRect(x - 3.5, y - 3.5, 7, 7); ctx.strokeRect(x - 3.5, y - 3.5, 7, 7); ctx.fillStyle = col; };
    const retourne = o.retourne ? ' · retourné' : '';
    if (o.type === 'horizontale') { const y = Y(o.p); if (y == null) return; ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); ctx.stroke(); etq(8, y, `${o.etiquette || ''} ${f(o.p)}${o.alerte ? ' 🔔' : ''}${retourne}`.trim()); }
    else if (o.type === 'zone') { const y1 = Y(o.haut), y2 = Y(o.bas); if (y1 == null || y2 == null) return; const x0 = Math.max(0, X(o.t1) ?? 0); ctx.globalAlpha = 0.1; ctx.fillRect(x0, y1, W - x0, y2 - y1); ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(x0, Math.round(y1) + 0.5); ctx.lineTo(W, Math.round(y1) + 0.5); ctx.moveTo(x0, Math.round(y2) + 0.5); ctx.lineTo(W, Math.round(y2) + 0.5); ctx.stroke(); etq(x0 + 6, y1, `${o.etiquette || 'zone'} ${f(o.bas)} – ${f(o.haut)}${o.alerte ? ' 🔔' : ''}${retourne}`); if (actif) { poignee(x0 + 10, y1); poignee(x0 + 10, y2); } }
    else if (o.type === 'tendance' || o.type === 'rayon') {
      const x1 = X(o.t1), y1 = Y(o.p1), x2 = X(o.t2), y2 = Y(o.p2); if ([x1, y1, x2, y2].some(v => v == null)) return;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const k = x2 !== x1 ? (y2 - y1) / (x2 - x1) : 0, xe = W, ye = y2 + k * (xe - x2);
      if (o.type === 'rayon') { ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(xe, ye); ctx.stroke(); } else if (!brouillon) { ctx.globalAlpha = 0.35; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(xe, ye); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      etq(x2 + 6, y2, `${o.etiquette || ''}${o.alerte ? ' 🔔' : ''}${retourne}`.trim()); poignee(x1, y1); poignee(x2, y2);
    }
    else if (o.type === 'verticale') { const x = X(o.t1); if (x == null) return; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); ctx.stroke(); etq(x + 4, 18, o.etiquette || heure(o.t1)); }
    else if (o.type === 'texte') { const x = X(o.t1), y = Y(o.p1); if (x == null || y == null) return; ctx.font = `${12 + 2 * ((o.epaisseur || 1) - 1)}px Segoe UI, system-ui, sans-serif`; ctx.fillStyle = col; ctx.fillText(o.texte, x, y); if (actif) { const w = ctx.measureText(o.texte).width; ctx.strokeRect(x - 3, y - 14, w + 6, 19); } ctx.font = '11px Segoe UI, system-ui, sans-serif'; }
    ctx.setLineDash([]);
  }
  function dessinerMesure(ctx, m) {
    const x1 = X(m.t1), y1 = Y(m.p1), x2 = X(m.t2), y2 = Y(m.p2); if ([x1, y1, x2, y2].some(v => v == null)) return;
    const haut = m.p2 >= m.p1; ctx.fillStyle = haut ? 'rgba(79,209,139,.10)' : 'rgba(239,106,95,.10)'; ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.strokeStyle = haut ? '#4fd18b' : '#ef6a5f'; ctx.setLineDash([3, 3]); ctx.strokeRect(Math.min(x1, x2) + 0.5, Math.min(y1, y2) + 0.5, Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.setLineDash([]);
    const n = Math.round(Math.abs(m.t2 - m.t1) / G.ms()), d = m.p2 - m.p1, h = Math.abs(m.t2 - m.t1) / 3600e3;
    const t = `${d >= 0 ? '+' : '−'}${f(Math.abs(d))} (${(d / m.p1 * 100).toFixed(2).replace('.', ',')} %) · ${n} bougies · ${h >= 48 ? (h / 24).toFixed(1).replace('.', ',') + ' j' : h.toFixed(1).replace('.', ',') + ' h'}`;
    const w = ctx.measureText(t).width + 10, xx = Math.min(x1, x2) + Math.abs(x2 - x1) / 2 - w / 2, yy = Math.max(y1, y2) + 6;
    ctx.fillStyle = 'rgba(5,8,12,.9)'; ctx.fillRect(xx, yy, w, 17); ctx.fillStyle = '#e8eef2'; ctx.fillText(t, xx + 5, yy + 12);
  }

  /* ── interactions à la souris (capturées avant le graphique : pointerdown annulé = pas de défilement du graphique) ── */
  function nouveau(type, a, b) {
    const base = { actif: T.actif(), unite: T.unite(), cree: maintenant() };
    if (type === 'horizontale') return creer('horizontale', { ...base, p: a.p });
    if (type === 'verticale') return creer('verticale', { ...base, t1: a.t });
    if (type === 'zone') return creer('zone', { ...base, t1: Math.min(a.t, b.t), bas: a.p, haut: b.p });
    if (type === 'tendance' || type === 'rayon') return creer(type, { ...base, t1: a.t, p1: a.p, t2: b.t, p2: b.p });
    return null;
  }
  function verrouGraphique(on) { const c = G.chart(); if (c) c.applyOptions({ handleScroll: !on, handleScale: !on }); }
  const surDown = e => {
    if (e.button !== 0 || E.detruit) return;
    const { x, y } = pos(e); if (x > largeurPanneau()) return;
    const outil = T.outil(), t = G.tDe(x), p = prixAimante(x, y); if (t == null || p == null) return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (outil === 'position') return;   // module des positions (phase C)
    if (outil === 'curseur' || outil === 'gomme') {
      const h = toucher(E.objets, x, y, X, Y, 7);
      if (outil === 'gomme') { if (h) { stop(); appliquer(E.objets.filter(o => o.id !== h.objet.id)); fermerEdition(); } return; }
      if (h) { stop(); E.sel = h.objet.id; ouvrirEdition(h.objet); E.drag = { id: h.objet.id, poignee: h.poignee, t0: t, p0: p, avant: h.objet, bouge: false }; verrouGraphique(true); el.setPointerCapture && el.setPointerCapture(e.pointerId); G.redessiner(); return; }
      const z = T.couches().zonesVol && E.zones.find(z => { const y1 = Y(z.haut), y2 = Y(z.bas); return y1 != null && y >= Math.min(y1, y2) - 2 && y <= Math.max(y1, y2) + 2; });
      if (z) { stop(); choisirZone(z); return; }
      if (E.sel) { E.sel = null; fermerEdition(); G.redessiner(); }
      if (E.mesure && !E.mesure.enCours) { E.mesure = null; G.redessiner(); }
      return;
    }
    stop();
    if (outil === 'texte') { ouvrirTexte(t, p); return; }
    if (outil === 'horizontale' || outil === 'verticale') { const o = nouveau(outil, { t, p }); if (o) ajouterObjet(o); T.choisirOutil('curseur'); return; }
    if (DEUX_POINTS.includes(outil)) {
      if (!E.brouillon && !(E.mesure && E.mesure.enCours)) {
        if (outil === 'mesure') { E.mesure = { t1: t, p1: p, t2: t, p2: p, enCours: true }; }
        else E.brouillon = Object.assign(nouveau(outil, { t, p }, { t: t + G.ms(), p: p * 1.0001 }) || {}, { _a: { t, p } });
        verrouGraphique(true); G.redessiner(); return;
      }
      if (outil === 'mesure') { E.mesure.enCours = false; verrouGraphique(false); T.choisirOutil('curseur'); G.redessiner(); return; }
      const a = E.brouillon._a, o = nouveau(outil, a, { t, p }); E.brouillon = null; verrouGraphique(false); if (o) ajouterObjet(o); T.choisirOutil('curseur');
    }
  };
  const surMove = e => {
    if (E.detruit) return; const { x, y } = pos(e), t = G.tDe(x), p = prixAimante(x, y); if (t == null || p == null) return;
    if (E.drag) {
      const o = E.objets.find(q => q.id === E.drag.id); if (!o) return; const dt = t - E.drag.t0, dp = p - E.drag.p0, a = E.drag.avant; let n;
      if (E.drag.poignee === 'p1') n = modifier(a, { t1: a.t1 + dt, p1: a.p1 + dp }); else if (E.drag.poignee === 'p2') n = modifier(a, { t2: a.t2 + dt, p2: a.p2 + dp });
      else if (E.drag.poignee === 'haut') n = modifier(a, { haut: a.haut + dp }); else if (E.drag.poignee === 'bas') n = modifier(a, { bas: a.bas + dp });
      else n = deplacer(a, o.type === 'horizontale' ? 0 : dt, dp);
      if (n) { E.objets = E.objets.map(q => q.id === n.id ? n : q); E.drag.bouge = true; G.redessiner(); }
      return;
    }
    if (E.brouillon) { const a = E.brouillon._a, n = nouveau(T.outil(), a, { t: t === a.t ? t + G.ms() : t, p: p === a.p ? p * 1.00005 : p }); if (n) { E.brouillon = Object.assign(n, { _a: a }); G.redessiner(); } return; }
    if (E.mesure && E.mesure.enCours) { E.mesure.t2 = t; E.mesure.p2 = p; G.redessiner(); return; }
    if (T.outil() === 'curseur' || T.outil() === 'gomme') { const h = x <= largeurPanneau() ? toucher(E.objets, x, y, X, Y, 7) : null, id = h ? h.objet.id : null; if (id !== E.survol) { E.survol = id; el.style.cursor = id ? (T.outil() === 'gomme' ? 'not-allowed' : 'move') : ''; G.redessiner(); } }
  };
  const surUp = () => {
    if (!E.drag) return; const d = E.drag; E.drag = null; verrouGraphique(false);
    if (d.bouge) { const fin = E.objets; E.objets = E.hist.etat(); appliquer(fin); const o = fin.find(q => q.id === d.id); if (o) ouvrirEdition(o); }
  };
  el.addEventListener('pointerdown', surDown, true); el.addEventListener('pointermove', surMove, true); window.addEventListener('pointerup', surUp, true);
  const offOutil = T.on('outil', o => { E.brouillon = null; if (!(E.mesure && !E.mesure.enCours) || o !== 'curseur') E.mesure = o === 'mesure' ? null : E.mesure; verrouGraphique(false); const g = T.q('[data-graph]'); if (o === 'curseur') g.removeAttribute('data-outil-actif'); else g.setAttribute('data-outil-actif', o); G.redessiner(); });
  const offAction = T.on('action', a => {
    if (a === 'annuler') { const s = E.hist.annuler(); if (s) { E.objets = s; sauver(); G.redessiner(); majBoutons(); fermerEdition(); planifierSurveillance(); } }
    else if (a === 'retablir') { const s = E.hist.retablir(); if (s) { E.objets = s; sauver(); G.redessiner(); majBoutons(); fermerEdition(); planifierSurveillance(); } }
    else if (a === 'aimant') { E.aimant = !E.aimant; ecrire('rayle_term_aimant', { v: E.aimant }); majBoutons(); }
    else if (a === 'tout-effacer') toutEffacer();
    else if (a === 'supprimer-selection') { if (E.sel) { appliquer(E.objets.filter(o => o.id !== E.sel)); fermerEdition(); } }
    else if (a === 'echap') { E.brouillon = null; if (E.mesure) E.mesure = null; E.sel = null; fermerEdition(); verrouGraphique(false); G.redessiner(); }
    else if (a === 'alertes') T.ongletBas('alertes');
  });
  function toutEffacer(confirme = null) {
    const n = E.objets.filter(o => o.origine !== 'rayle').length; if (!n) { T.bandeau('Rien à effacer : aucun objet dessiné sur ' + nomA(T.actif()) + '.'); return false; }
    const ok = confirme != null ? confirme : confirm(`Supprimer les ${n} objets que tu as dessinés sur ${nomA(T.actif())} ? (Annuler avec Ctrl+Z.)`);
    if (!ok) return false; appliquer(E.objets.filter(o => o.origine === 'rayle')); fermerEdition(); T.bandeau(`${n} objets supprimés (Ctrl+Z pour annuler).`); return true;
  }

  /* ── édition d'un objet ── */
  const panneau = T.q('[data-edition]');
  function fermerEdition() { panneau.hidden = true; panneau.innerHTML = ''; }
  function ouvrirEdition(o) {
    const sv = SURVEILLES.includes(o.type), champsPrix = o.type === 'horizontale' ? `<label>Prix <input data-e="p" type="number" step="any" value="${o.p}"></label>` : o.type === 'zone' ? `<label>Haut <input data-e="haut" type="number" step="any" value="${o.haut}"></label><label>Bas <input data-e="bas" type="number" step="any" value="${o.bas}"></label>` : o.type === 'texte' ? `<label>Texte <input data-e="texte" type="text" value="${esc(o.texte)}"></label>` : '';
    panneau.innerHTML = `<h4>${esc(NOMS_OBJETS[o.type])}${o.retourne ? ' · retourné' : ''}${o.origine === 'zone-reaction' ? ' · zone de réaction' : ''}</h4>${champsPrix}
      <label>Étiquette <input data-e="etiquette" type="text" maxlength="60" value="${esc(o.etiquette)}"></label>
      <label>Couleur <select data-e="couleur">${PALETTE.map(c => `<option value="${c}" ${c === o.couleur ? 'selected' : ''} style="color:${c}">■ ${c}</option>`).join('')}</select></label>
      <label>Épaisseur <select data-e="epaisseur">${[1, 2, 3].map(k => `<option ${k === o.epaisseur ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      ${sv ? `<label>Surveillé en <select data-e="unite">${ORDRE_UNITES.map(u => `<option value="${u}" ${u === o.unite ? 'selected' : ''}>${u === 'J' ? 'Jour' : u}</option>`).join('')}</select></label>
      <label>M’alerter <span><input data-e="alerte" type="checkbox" ${o.alerte ? 'checked' : ''}> quand le prix l’atteint</span></label>
      <label>Alertes <span>${['approche', 'touche', 'rebond', 'cassure'].map(k => `<label style="display:inline-flex;gap:3px;margin-right:6px"><input type="checkbox" data-al="${k}" ${o.alertes[k] !== false ? 'checked' : ''}>${TEXTES[k]}</label>`).join('')}</span></label>` : ''}
      <div class="tr-ligne-btn"><button type="button" class="tr-btn" data-e-a="supprimer">Supprimer</button><button type="button" class="tr-btn" data-e-a="fermer">Fermer</button></div>`;
    panneau.hidden = false; panneau.dataset.id = o.id; delete panneau.dataset.pos;
  }
  panneau.addEventListener('change', e => {
    const o = E.objets.find(q => q.id === panneau.dataset.id); if (!o) return; const k = e.target.dataset.e, al = e.target.dataset.al; let ch = {};
    if (al) ch = { alertes: { [al]: e.target.checked } }; else if (k === 'alerte') ch = { alerte: e.target.checked }; else if (k === 'epaisseur') ch = { epaisseur: +e.target.value }; else if (['p', 'haut', 'bas'].includes(k)) ch = { [k]: +e.target.value }; else if (k) ch = { [k]: e.target.value };
    const n = modifier(o, ch); if (!n) { T.bandeau('Valeur refusée.'); ouvrirEdition(o); return; }
    appliquer(E.objets.map(q => q.id === n.id ? n : q));
  });
  panneau.addEventListener('click', e => { const a = e.target.dataset.eA; if (a === 'supprimer') { appliquer(E.objets.filter(o => o.id !== panneau.dataset.id)); fermerEdition(); } else if (a === 'fermer') { E.sel = null; fermerEdition(); G.redessiner(); } });
  function ouvrirTexte(t, p) {
    panneau.innerHTML = `<h4>Texte</h4><form data-texte><label>Texte <input type="text" maxlength="140" required autofocus></label><div class="tr-ligne-btn"><button class="tr-btn" type="submit">Poser</button><button class="tr-btn" type="button" data-e-a="fermer">Annuler</button></div></form>`;
    panneau.hidden = false; const fo = panneau.querySelector('form'), inp = fo.querySelector('input'); setTimeout(() => inp.focus(), 0);
    fo.onsubmit = ev => { ev.preventDefault(); const o = creer('texte', { actif: T.actif(), unite: T.unite(), cree: maintenant(), t1: t, p1: p, texte: inp.value }); T.choisirOutil('curseur'); if (o) ajouterObjet(o); else fermerEdition(); };
  }
  /* zone de réaction cliquée : l'utiliser comme support ou résistance → objet ordinaire avec les mêmes alertes */
  function choisirZone(z) {
    E.zoneChoisie = z; G.redessiner(); const res = T.prix() != null && z.p > T.prix();
    panneau.innerHTML = `<h4>Zone de réaction</h4><p class="tr-doux">${f(z.bas)} – ${f(z.haut)} · testée ${z.tests} fois, a tenu ${z.tenues} (sur les ${REGLES_TERMINAL.profilBougies} dernières bougies ${esc(T.unite())})</p><p class="tr-mini">${esc(MENTION)}</p>
      <div class="tr-ligne-btn"><button class="tr-btn" type="button" data-z="1">Utiliser comme ${res ? 'résistance' : 'support'}</button><button class="tr-btn" type="button" data-e-a="fermer">Fermer</button></div>`;
    panneau.hidden = false;
    panneau.querySelector('[data-z]').onclick = () => { E.zoneChoisie = null; const o = creer('zone', { actif: T.actif(), unite: T.unite(), cree: maintenant(), t1: maintenant(), bas: z.bas, haut: z.haut, etiquette: `${res ? 'résistance' : 'support'} (zone de réaction ${z.tenues}/${z.tests})`, couleur: res ? PALETTE[3] : PALETTE[2], origine: 'zone-reaction' }); if (o) ajouterObjet(o); };
  }
  function majZones() { if (!T.couches().zonesVol || !T.serie()) { E.zones = []; return; } E.zones = zonesReaction(closes(T.serie().bougies(), G.ms(), maintenant()), { ms: G.ms() }); G.redessiner(); }

  /* ── surveillance (tous les actifs qui ont des objets, chacun dans l'unité de ses objets) ── */
  let tSurv = null; const planifierSurveillance = () => { if (tSurv) return; tSurv = setTimeout(() => { tSurv = null; surveillerTout(); }, 300); };
  async function tousObjets() { const L = []; for (const a of Object.keys(PAR_ID_T)) { const o = a === T.actif() ? E.objets : (await st.lire('objets', a)) || []; L.push(...o); } return L; }
  async function surveillerTout() {
    if (E.detruit) return; const now = maintenant(), objs = (await tousObjets()).filter(o => SURVEILLES.includes(o.type)), groupes = new Map();
    for (const o of objs) { const k = o.actif + '|' + o.unite; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(o); }
    const parActif = new Map();
    for (const [k, L] of groupes) {
      const [a, u] = k.split('|'); let s; try { s = await T.serieDe(a, u); } catch (e) { continue; } if (E.detruit) return;
      if (a !== T.actif() || u !== T.unite()) await s.rafraichir();
      const ms = UNITES[u].ms, Ctout = closes(s.bougies(), ms, now), t0 = Math.min(...L.map(o => o.cree)); let i0 = Ctout.findIndex(b => b.t + ms > t0); if (i0 < 0) i0 = Ctout.length; const C = Ctout.slice(Math.max(0, i0 - 40));
      const r = surveiller(C, L, ms);
      const acc = parActif.get(a) || { ev: [], fleches: [], croix: [], etats: {} }; acc.ev.push(...r.ev); acc.fleches.push(...r.fleches); acc.croix.push(...r.croix); Object.assign(acc.etats, r.etats); parActif.set(a, acc);
      for (const ev of r.ev) await enregistrer(ev, now, ms, L.find(o => o.id === ev.objet));
      for (const ev of r.ev) { if (ev.type === 'alerte') continue; if (await st.lire('suivis', ev.id)) continue; const x = excursion(C, ev); if (x) await st.ajouter('suivis', { ...x, mesure: now, version: REGLES_TERMINAL.version }); }
    }
    E.resultats = parActif;
    // état « retourné » des objets de l'actif affiché (affichage seulement ; ne change pas l'objet)
    const et = (parActif.get(T.actif()) || {}).etats || {}; let ch = false; E.objets = E.objets.map(o => { const r = !!(et[o.id] && et[o.id].retourne); if (!!o.retourne !== r) { ch = true; return { ...o, retourne: r }; } return o; });
    if (ch) { E.hist.remplacer(E.objets); majBoutons(); }
    G.redessiner(); if (T.sectionVisible ? T.sectionVisible('registre') : (T.ongletOuvert && T.ongletOuvert() === 'registre')) rendreRegistre();
    T.emettre('surveillance', { resultats: parActif });
  }
  async function enregistrer(ev, now, ms, o) {
    const neuf = await st.ajouter('registre', { ...ev, enregistre: now, version: REGLES_TERMINAL.version });
    if (!neuf || !o || !alerteActive(o, ev.type)) return;
    const ad = admettre(E.alertes, ev, { maintenant: now, ms }); if (!ad.ok) return;
    const nomObjet = o.etiquette || NOMS_OBJETS[o.type];
    alerter({ ...ev, texte: texteAlerte(ev, { nomActif: nomA(ev.actif), nomObjet, fmt: p => fmt(ev.actif, p) }), phrase: phraseAlerte(ev, { nomActif: nomA(ev.actif), fmt: p => fmt(ev.actif, p) }) });
  }
  /* alerte : historique, son discret, notification, Telegram (si activé), émise pour Rayle (voix, phase D) */
  async function alerter(a) {
    const rec = { id: a.id, objet: a.objet, type: a.type, actif: a.actif, unite: a.unite, t: a.t, prix: a.prix, niveau: a.niveau, texte: a.texte, phrase: a.phrase, recu: maintenant(), lu: false };
    E.alertes.unshift(rec); E.nonLues++; await st.ecrire('alertes', rec); majCloche(); rendreAlertes();
    if (E.regl.son) bip();
    if (E.regl.notif && typeof Notification !== 'undefined' && Notification.permission === 'granted') { try { new Notification('Rayle · ' + nomA(a.actif), { body: a.texte + '\n' + MENTION, tag: a.id, silent: true }); } catch (e) { /* */ } }
    if (E.regl.telegram) envoyerTelegram(a.texte);
    T.emettre('alerte', rec);
  }
  let audio = null;
  function bip() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 740; g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.05, audio.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18); o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.2); } catch (e) { /* pas de son */ } }
  /* pont Telegram EXISTANT du Worker de Rayle (route /telegram/envoyer), jamais modifié ; seulement si activé */
  async function envoyerTelegram(texte) {
    try {
      const w = (window.RayleBus && RayleBus.demander('worker')) || {}, sto = k => { try { const v = localStorage.getItem(k); return v ? (v.startsWith('"') ? JSON.parse(v) : v) : ''; } catch (e) { return ''; } };
      const url = (w.url || sto('rayle_worker_url')).replace(/\/+$/, ''), jeton = w.token || sto('rayle_worker_appareil') || sto('rayle_worker_token');
      if (!url || !jeton) { T.bandeau('Telegram : Rayle n’est pas configurée sur cet appareil.'); return; }
      const r = await fetch(url + '/telegram/envoyer', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Token': jeton }, body: JSON.stringify({ type: 'ENTREE', texte: 'INFO MARCHÉ, pas un signal\n' + texte }) });
      if (!r.ok) T.bandeau('Telegram refusé (' + r.status + ').');
    } catch (e) { T.bandeau('Telegram indisponible : ' + e.message); }
  }
  function majCloche() { const i = T.q('[data-alertes-n]'); if (!i) return; i.hidden = !E.nonLues; i.textContent = E.nonLues > 99 ? '99+' : E.nonLues; }

  /* ── panneaux du bas : alertes, registre ── */
  const pA = T.panneau('alertes'), pR = T.panneau('registre');
  function rendreAlertes() {
    pA.innerHTML = `<div class="tr-filtres"><b>Alertes</b><label><input type="checkbox" data-r="son" ${E.regl.son ? 'checked' : ''}> son discret</label><label><input type="checkbox" data-r="notif" ${E.regl.notif ? 'checked' : ''}> notification</label><label><input type="checkbox" data-r="telegram" ${E.regl.telegram ? 'checked' : ''}> Telegram</label><label><input type="checkbox" data-r="voix" ${E.regl.voix ? 'checked' : ''}> annoncées par Rayle</label>
      <form data-libre style="display:inline-flex;gap:4px"><input type="number" step="any" placeholder="alerte de prix libre" aria-label="Prix" style="width:150px"><button class="tr-btn" type="submit">Ajouter</button></form>
      <button class="tr-btn" type="button" data-x="lu">Tout marquer lu</button><button class="tr-btn" type="button" data-x="export">Exporter mes objets</button><label class="tr-btn" style="cursor:pointer">Importer<input type="file" accept="application/json" data-x="import" hidden></label></div>
      <p class="tr-mini">${esc(MENTION)} ${esc(MENTION_OUVERT)} Anti-doublon : une alerte du même type pour le même objet au plus toutes les ${REGLES_TERMINAL.delaiAlerteMin} min.</p>
      ${E.alertes.length ? `<table class="tr-tableau"><thead><tr><th>Heure</th><th>Actif</th><th>Événement</th></tr></thead><tbody>${E.alertes.slice(0, 200).map(a => `<tr class="${a.lu ? '' : 'nonlu'}"><td class="tr-mono">${heure(a.recu)}</td><td>${esc(nomA(a.actif))}</td><td>${esc(a.texte)}</td></tr>`).join('')}</tbody></table>` : '<p class="tr-doux">Aucune alerte pour l’instant. Dessine une ligne ou une zone : ses alertes sont actives par défaut.</p>'}`;
  }
  pA.addEventListener('change', async e => {
    const r = e.target.dataset.r;
    if (r) { E.regl[r] = e.target.checked; if (r === 'notif' && e.target.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (x) { /* */ } } ecrire('rayle_term_alertes_regl', E.regl); return; }
    if (e.target.dataset.x === 'import') { const fi = e.target.files[0]; if (!fi) return; try { const L = importer(await fi.text()).filter(o => o.actif === T.actif() || !o.actif).map(o => ({ ...o, actif: T.actif() })); const ids = new Set(E.objets.map(o => o.id)); appliquer(E.objets.concat(L.filter(o => !ids.has(o.id)))); T.bandeau(`${L.length} objets importés.`); } catch (x) { T.bandeau('Import refusé : ' + x.message); } }
  });
  pA.addEventListener('submit', e => { e.preventDefault(); const v = +e.target.querySelector('input').value; if (!(v > 0)) return; const o = creer('horizontale', { actif: T.actif(), unite: T.unite(), cree: maintenant(), p: v, alerte: true, etiquette: 'alerte de prix', alertes: { approche: false, touche: false, rebond: false, cassure: false } }); if (o) { ajouterObjet(o); T.bandeau(`Alerte de prix posée à ${f(v)}.`); } });
  pA.addEventListener('click', async e => {
    const x = e.target.dataset.x;
    if (x === 'lu') { for (const a of E.alertes) if (!a.lu) { a.lu = true; await st.ecrire('alertes', a); } E.nonLues = 0; majCloche(); rendreAlertes(); }
    if (x === 'export') { const b = new Blob([exporter(E.objets)], { type: 'application/json' }), u = URL.createObjectURL(b), l = document.createElement('a'); l.href = u; l.download = `rayle-terminal-${T.actif()}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
  });
  async function rendreRegistre() {
    const reg = (await st.tout('registre')).sort((a, b) => b.t - a.t), sv = await st.tout('suivis'), B = bilanRegistre(reg, sv), S = new Map(sv.map(s => [s.id, s]));
    const nom = { horizontale: 'Ligne', zone: 'Zone', tendance: 'Tendance', rayon: 'Rayon' };
    pR.innerHTML = `<p class="tr-mini">Registre daté en ajout seul (${esc(REGLES_TERMINAL.version)}) : jamais modifié, jamais utilisé comme décision. Excursions mesurées sur les ${REGLES_TERMINAL.excursionBougies} bougies suivantes. « Pas assez de données » sous ${REGLES_TERMINAL.minEvenements} événements.</p>
      <h4 class="tr-sous">Bilan par type d’outil</h4>${B.length ? `<table class="tr-tableau"><thead><tr><th>Outil</th><th>Événement</th><th>Nombre</th><th>Mesurés</th><th>Excursion favorable (médiane)</th><th>Défavorable (médiane)</th></tr></thead><tbody>${B.map(b => `<tr><td>${nom[b.outil]}</td><td>${TEXTES[b.type]}</td><td>${b.n}</td><td>${b.mesures}</td>${b.assez ? `<td>${b.favAtr.toFixed(2).replace('.', ',')} ATR · ${b.favPct.toFixed(2).replace('.', ',')} %</td><td>${b.advAtr.toFixed(2).replace('.', ',')} ATR · ${b.advPct.toFixed(2).replace('.', ',')} %</td>` : '<td colspan="2" class="tr-doux">pas assez de données</td>'}</tr>`).join('')}</tbody></table>` : '<p class="tr-doux">Aucun événement enregistré.</p>'}
      <h4 class="tr-sous">Événements (${reg.length})</h4>${reg.length ? `<table class="tr-tableau"><thead><tr><th>Bougie</th><th>Actif</th><th>Unité</th><th>Outil</th><th>Événement</th><th>Niveau</th><th>Excursion</th></tr></thead><tbody>${reg.slice(0, 300).map(e => { const s = S.get(e.id); return `<tr><td class="tr-mono">${heure(e.t)}</td><td>${esc(nomA(e.actif))}</td><td>${esc(e.unite)}</td><td>${nom[e.outil] || esc(e.outil)}</td><td>${TEXTES[e.type] || esc(e.type)}</td><td class="tr-mono">${fmt(e.actif, e.niveau)}</td><td class="tr-mono">${s ? `+${s.favAtr.toFixed(2)} / −${s.advAtr.toFixed(2)} ATR` : '<span class="tr-doux">en attente</span>'}</td></tr>`; }).join('')}</tbody></table>` : ''}
      <details><summary>Règles figées ${esc(REGLES_TERMINAL.version)}</summary><pre class="tr-regles">${esc(TEXTE_REGLES_TERMINAL)}</pre></details>`;
  }
  const offOnglet = T.on('onglet', o => { if (o === 'registre') rendreRegistre(); if (o === 'alertes') rendreAlertes(); });
  const offActif = T.on('actif', () => { chargerObjets(); });
  const offSerie = T.on('serie', () => { majZones(); planifierSurveillance(); });
  const offCouches = T.on('couches', () => { majZones(); G.redessiner(); });
  const offClot = T.on('cloture', () => { majZones(); planifierSurveillance(); });
  const minuterie = setInterval(() => { if (!document.hidden) surveillerTout(); }, intervalle);

  await chargerObjets(); rendreAlertes(); majCloche(); E.prets = true; planifierSurveillance();
  return {
    E, objets: () => E.objets, ajouter: o => ajouterObjet(o), appliquer, toutEffacer, surveillerTout, rendreRegistre, rendreAlertes, alerter, zones: () => E.zones, choisirZone, st,
    creerObjet(type, d) { const o = creer(type, { actif: T.actif(), unite: T.unite(), cree: maintenant(), ...d }); return o ? ajouterObjet(o) : null; },
    supprimer(id) { appliquer(E.objets.filter(o => o.id !== id)); },
    detruire() { E.detruit = true; clearInterval(minuterie); clearTimeout(tSurv); el.removeEventListener('pointerdown', surDown, true); el.removeEventListener('pointermove', surMove, true); window.removeEventListener('pointerup', surUp, true); for (const off of [offOutil, offAction, offOnglet, offActif, offSerie, offCouches, offClot]) off(); }
  };
}
