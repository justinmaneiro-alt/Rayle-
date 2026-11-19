/* ═════════════ DESSINS SUR LE GRAPHIQUE : barre d'outils, tracé (souris et doigt), sélection, flèches de niveau ═════════════
   Quatre outils seulement : ligne horizontale, trendline, boîte, Fibonacci. Les dessins sont enregistrés par actif (avec l'unité où ils ont été tracés) et visibles sur toutes les unités ;
   ils sont évalués UNIQUEMENT à la clôture des bougies de leur unité d'origine (niveaux.js). Rendu : « primitive » du graphique (suit le zoom et le défilement). Lecture seule : aucun ordre.
   Interaction : sur PC, glisser pour tracer ; au doigt, glisser OU toucher deux points. Poignées pour étirer, corps pour déplacer, Suppr / Échap au clavier. */
import { creer, modifier, bande, evaluer, fibo, ancrageAuto, fusionnerEvenements, libelle, phrase, prixTexte, COULEURS, NOMS, NOM_UNITE, PAS, UNITES, FIB } from './niveaux.js';
import { lireDessins, ecrireDessins, synchroniser, fusionner, visibles } from './dessins-stockage.js';
import { supprimer as supprimerDessin, remplacer } from './dessins-fusion.js';
import { contexteEvenement, libelleContexte } from './contexte.js';

const ETAT_COULEUR = { actif: '#8497a1', touché: '#e8a85a', cassé: '#d86a6a', retesté: '#5fb894' };
const OUTILS = [['horizontale', '─', 'Ligne horizontale : un toucher sur le prix'], ['tendance', '╱', 'Trendline : glisser, ou toucher deux points'], ['boite', '▭', 'Boîte : glisser, ou toucher deux coins'], ['fibo', 'Fib', 'Fibonacci : de A (départ) vers B (fin de l’impulsion)']];
const LS_OUVERT = 'rayle_tp_dessins_barre';
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
function distSegment(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); }

/* ctx : { id, nomActif, graph, LW, tactile, uniteAffichee(), barresAffichees(), barresOrigine(u), analyse(), temps(t), parler, notifier, telegramActif(), envoyerTelegram(texte), maintenant() } */
export function monterDessins(ctx) {
  const { id, graph, tactile } = ctx, chart = graph.chart(), serie = graph.serie(), conteneur = graph.conteneur(), now = ctx.maintenant || (() => Date.now());
  const E = { liste: lireDessins(id), sel: null, mode: 'select', brouillon: null, attente: false, glisse: null, claim: false, syncFait: false, barres: [], ouvert: lire(LS_OUVERT, false) === true, derEval: 0, cleMarq: '' };
  const tolHit = tactile ? 20 : 9, tolSnap = tactile ? 12 : 7, rPoignee = tactile ? 9 : 5;
  E.barres = ctx.barresAffichees() || [];
  const vis = () => visibles(E.liste), parId = i => vis().find(o => o.id === i) || null;

  /* ───── conversions temps ↔ pixels (par les bougies affichées ; au-delà des bougies : pas de temps de l'unité) ───── */
  const pasAff = () => PAS[ctx.uniteAffichee()] || PAS.H1;
  const sp = () => { try { return chart.timeScale().options().barSpacing || 6; } catch (e) { return 6; } };
  const xBougie = k => { const B = E.barres, t = ctx.temps(B[k].t); if (t == null) return null; const x = chart.timeScale().timeToCoordinate(t); return Number.isFinite(x) ? x : null; };
  function X(t) {
    const B = E.barres, n = B.length; if (!n) return null; let lo = 0, hi = n - 1;
    if (t <= B[0].t) { const x0 = xBougie(0); return x0 == null ? null : x0 - (B[0].t - t) / pasAff() * sp(); }
    if (t >= B[n - 1].t) { const x1 = xBougie(n - 1); return x1 == null ? null : x1 + (t - B[n - 1].t) / pasAff() * sp(); }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (B[m].t <= t) lo = m; else hi = m; }
    const xa = xBougie(lo), xb = xBougie(hi); if (xa == null || xb == null) return null; return xa + (t - B[lo].t) / (B[hi].t - B[lo].t) * (xb - xa);
  }
  function T(x) {
    const B = E.barres, n = B.length; if (!n) return null; const x0 = xBougie(0), x1 = xBougie(n - 1); if (x0 == null || x1 == null) return null;
    if (x <= x0) return B[0].t - (x0 - x) / sp() * pasAff(); if (x >= x1) return B[n - 1].t + (x - x1) / sp() * pasAff();
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1, xm = xBougie(m); if (xm == null) return null; if (xm <= x) lo = m; else hi = m; }
    const xa = xBougie(lo), xb = xBougie(hi); return B[lo].t + (x - xa) / (xb - xa || 1) * (B[hi].t - B[lo].t);
  }
  const Y = p => { const y = serie.priceToCoordinate(p); return Number.isFinite(y) ? y : null; }, P = y => { const p = serie.coordinateToPrice(y); return Number.isFinite(p) ? p : null; };
  const largeur = () => { try { return conteneur.clientWidth - (chart.priceScale('right').width() || 0); } catch (e) { return conteneur.clientWidth; } };
  /* aimantation : le prix cliqué va à l'ouverture / haut / bas / clôture de la bougie sous le doigt, s'il en est à moins de tolSnap pixels */
  function aimanter(x, y) {
    const t = T(x), B = E.barres; if (t == null || !B.length) return P(y);
    let lo = 0, hi = B.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (B[m].t <= t) lo = m; else hi = m; } const b = Math.abs(B[lo].t - t) <= Math.abs(B[hi].t - t) ? B[lo] : B[hi];
    let best = null, bd = tolSnap + 1; for (const p of [b.h, b.l, b.o, b.c]) { const py = Y(p); if (py != null && Math.abs(py - y) < bd) { bd = Math.abs(py - y); best = p; } }
    return best != null ? best : P(y);
  }

  /* ───── géométrie écran d'un dessin (null si hors plage de calcul) ───── */
  function ecran(o) {
    const W = largeur();
    if (o.type === 'horizontale') { const y = Y(o.p); return y == null ? null : { y, W }; }
    if (o.type === 'tendance') { const a = { x: X(o.t1), y: Y(o.p1) }, b = { x: X(o.t2), y: Y(o.p2) }; if ([a.x, a.y, b.x, b.y].some(v => v == null)) return null; const k = b.x !== a.x ? (b.y - a.y) / (b.x - a.x) : 0; return { a, b, fin: { x: W + 40, y: b.y + k * (W + 40 - b.x) }, W }; }
    if (o.type === 'boite') { const x1 = X(o.t1), x2 = X(o.t2), y1 = Y(o.haut), y2 = Y(o.bas); if ([x1, x2, y1, y2].some(v => v == null)) return null; return { x1, x2, y1, y2, W }; }
    if (o.type === 'fibo') {
      const F = fibo(o), a = { x: X(o.t1), y: Y(o.p1) }, b = { x: X(o.t2), y: Y(o.p2) }; if ([a.x, a.y, b.x, b.y].some(v => v == null)) return null; const xd = Math.max(a.x, b.x);
      const zh = Y(F.zone.haut), zb = Y(F.zone.bas), ph = Y(F.premium.haut), pb = Y(F.premium.bas), y382 = Y(F.ligne382.prix); if ([zh, zb, ph, pb, y382].some(v => v == null)) return null;
      return { F, a, b, xd, W, zone: { y1: zh, y2: zb }, premium: { y1: ph, y2: pb }, y382, obj: F.objectifs.map(q => ({ ...q, y: Y(q.prix) })), yInv: a.y };
    }
    return null;
  }
  /* poignées : { id, x, y, champ } — déplacer une poignée modifie les champs correspondants */
  function poignees(o, g) {
    if (!g || o.verrou) return [];
    if (o.type === 'tendance' || o.type === 'fibo') return [{ id: 'a', x: g.a.x, y: g.a.y }, { id: 'b', x: g.b.x, y: g.b.y }];
    if (o.type === 'boite') { const { x1, x2, y1, y2 } = g, mx = (x1 + x2) / 2, my = (y1 + y2) / 2; return [{ id: 'nw', x: x1, y: y1 }, { id: 'n', x: mx, y: y1 }, { id: 'ne', x: x2, y: y1 }, { id: 'e', x: x2, y: my }, { id: 'se', x: x2, y: y2 }, { id: 's', x: mx, y: y2 }, { id: 'sw', x: x1, y: y2 }, { id: 'w', x: x1, y: my }]; }
    return [];
  }
  function toucherCorps(o, g, p) {
    if (!g) return false;
    if (o.type === 'horizontale') return Math.abs(p.y - g.y) <= tolHit;
    if (o.type === 'tendance') return distSegment(p, g.a, g.fin) <= tolHit;
    if (o.type === 'boite') { const x1 = Math.min(g.x1, g.x2), x2 = Math.max(g.x1, g.x2), y1 = Math.min(g.y1, g.y2), y2 = Math.max(g.y1, g.y2); return p.x >= x1 - tolHit && p.x <= x2 + tolHit && p.y >= y1 - tolHit && p.y <= y2 + tolHit; }
    if (o.type === 'fibo') {
      if (distSegment(p, g.a, g.b) <= tolHit) return true; if (p.x < g.xd - tolHit) return false;
      const zy = [g.zone.y1, g.zone.y2, g.premium.y1, g.premium.y2], ymin = Math.min(...zy), ymax = Math.max(...zy); if (p.y >= ymin - 2 && p.y <= ymax + 2) return true;
      return [g.y382, g.yInv, ...g.obj.map(q => q.y)].some(y => y != null && Math.abs(p.y - y) <= tolHit);
    }
    return false;
  }
  /* quel dessin (ou poignée) est sous le point ? la sélection courante a priorité */
  function sous(p) {
    const L = vis(), ordre = [...L.filter(o => o.id === E.sel), ...L.filter(o => o.id !== E.sel).reverse()];
    for (const o of ordre) { if (o.id !== E.sel) continue; const g = ecran(o); for (const h of poignees(o, g)) if (dist2(h, p) <= (rPoignee + (tactile ? 8 : 4)) ** 2) return { o, poignee: h.id }; }
    for (const o of ordre) { const g = ecran(o); if (toucherCorps(o, g, p)) return { o, poignee: null }; }
    return null;
  }

  /* ───── rendu (primitive du graphique) ───── */
  const FONT = '11px ui-monospace, Consolas, monospace';
  function etiquette(c, texte, x, y, { couleur = '#d7e3ea', fond = 'rgba(5,8,12,.82)', align = 'left', bord = null } = {}) {
    c.font = FONT; const w = c.measureText(texte).width + 8, h = 15, x0 = align === 'right' ? x - w : x; c.fillStyle = fond; c.fillRect(x0, y - h / 2, w, h); if (bord) { c.strokeStyle = bord; c.lineWidth = 1; c.strokeRect(x0 + .5, y - h / 2 + .5, w - 1, h - 1); }
    c.fillStyle = couleur; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(texte, x0 + 4, y + .5); return { x0, w, h };
  }
  const badge = (o, texte) => `${NOM_UNITE[o.unite]}${o.verrou ? ' 🔒' : ''}${o.alerte === false ? ' · muet' : ''}${texte ? ' · ' + texte : ''}`;
  function dessinerUn(c, o, W, H, etatsSel) {
    const g = ecran(o); if (!g) return; const sel = o.id === E.sel, ev = E.evals && E.evals.get(o.id), etat = ev ? ev.etat : 'actif', autre = o.unite !== ctx.uniteAffichee(), col = o.couleur, alpha = autre ? 0.78 : 1, bc = ETAT_COULEUR[etat];
    c.save(); c.globalAlpha = alpha; c.lineWidth = sel ? 2 : 1.4; c.strokeStyle = col; c.fillStyle = col;
    if (o.type === 'horizontale') {
      if (g.y < -20 || g.y > H + 20) { c.restore(); return; } c.beginPath(); c.moveTo(0, g.y); c.lineTo(W, g.y); c.stroke();
      etiquette(c, `${prixTexte(o.p)} · ${badge(o, etat)}`, W - 4, g.y - 10, { couleur: col, align: 'right', bord: bc });
    } else if (o.type === 'tendance') {
      c.beginPath(); c.moveTo(g.a.x, g.a.y); c.lineTo(g.b.x, g.b.y); c.stroke(); c.setLineDash([5, 5]); c.globalAlpha = alpha * 0.6; c.beginPath(); c.moveTo(g.b.x, g.b.y); c.lineTo(g.fin.x, g.fin.y); c.stroke(); c.setLineDash([]); c.globalAlpha = alpha;
      const lx = Math.max(4, Math.min(W - 120, g.a.x + 6)); etiquette(c, `${NOMS.tendance} · ${badge(o, etat)}`, lx, g.a.y - 14, { couleur: col, bord: bc });
    } else if (o.type === 'boite') {
      const x1 = Math.min(g.x1, g.x2), x2 = Math.max(g.x1, g.x2), y1 = Math.min(g.y1, g.y2), y2 = Math.max(g.y1, g.y2);
      c.fillStyle = rgba(col, sel ? 0.2 : 0.13); c.fillRect(x1, y1, x2 - x1, y2 - y1); c.strokeStyle = col; c.strokeRect(x1 + .5, y1 + .5, x2 - x1, y2 - y1);
      c.setLineDash([4, 4]); c.globalAlpha = alpha * 0.5; c.beginPath(); c.moveTo(x2, y1); c.lineTo(W, y1); c.moveTo(x2, y2); c.lineTo(W, y2); c.stroke(); c.setLineDash([]); c.globalAlpha = alpha;
      etiquette(c, `${prixTexte(o.haut)} – ${prixTexte(o.bas)} · ${badge(o, etat)}`, Math.max(4, Math.min(W - 160, x1 + 4)), Math.max(10, y1 - 10), { couleur: col, bord: bc });
    } else if (o.type === 'fibo') {
      const F = g.F, xa = Math.min(g.xd, W), larg = W - xa; c.setLineDash([3, 4]); c.globalAlpha = alpha * 0.55; c.beginPath(); c.moveTo(g.a.x, g.a.y); c.lineTo(g.b.x, g.b.y); c.stroke(); c.setLineDash([]); c.globalAlpha = alpha;
      if (larg > 0) {
        c.fillStyle = 'rgba(150,160,170,0.16)'; c.fillRect(xa, Math.min(g.zone.y1, g.zone.y2), larg, Math.abs(g.zone.y2 - g.zone.y1));
        c.fillStyle = 'rgba(150,160,170,0.30)'; c.fillRect(xa, Math.min(g.premium.y1, g.premium.y2), larg, Math.abs(g.premium.y2 - g.premium.y1));
        c.lineWidth = 1; c.strokeStyle = rgba(col, 0.8); for (const y of [g.zone.y1, g.zone.y2]) { c.beginPath(); c.moveTo(xa, y); c.lineTo(W, y); c.stroke(); }
        c.strokeStyle = rgba(col, 0.55); c.beginPath(); c.moveTo(xa, g.y382); c.lineTo(W, g.y382); c.stroke();
        c.setLineDash([6, 4]); for (const q of g.obj) { c.beginPath(); c.moveTo(xa, q.y); c.lineTo(W, q.y); c.stroke(); } c.beginPath(); c.moveTo(xa, g.yInv); c.lineTo(W, g.yInv); c.stroke(); c.setLineDash([]);
      }
      const px = n => prixTexte(n), nf = r => String(r).replace('.', ','); let lx = W - 4;
      etiquette(c, `${nf(FIB.zoneHaut)}–${nf(FIB.zoneBas)} · ${px(F.zone.haut)}–${px(F.zone.bas)} · ${badge(o, etat)}`, lx, (g.zone.y1 + g.zone.y2) / 2 - 8, { couleur: col, align: 'right', bord: bc });
      etiquette(c, `premium ${nf(FIB.premiumHaut)}–${nf(FIB.premiumBas)}`, lx, (g.premium.y1 + g.premium.y2) / 2 + 8, { couleur: '#aebcc4', align: 'right' });
      etiquette(c, `${nf(FIB.ligne)} · ${px(F.ligne382.prix)}`, lx, g.y382, { couleur: '#aebcc4', align: 'right' });
      for (const q of g.obj) etiquette(c, `${nf(q.r)} · objectif ${px(q.prix)}`, lx, q.y, { couleur: '#aebcc4', align: 'right' });
      etiquette(c, `100 % · invalidation ${px(F.invalidation)}`, lx, g.yInv + (F.dir > 0 ? 9 : -9), { couleur: '#aebcc4', align: 'right' });
    }
    if (sel) { c.globalAlpha = 1; for (const h of poignees(o, g)) { c.beginPath(); c.arc(h.x, h.y, rPoignee, 0, Math.PI * 2); c.fillStyle = '#05080c'; c.fill(); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); } }
    c.restore();
  }
  function dessinerBrouillon(c, W, H) {
    const b = E.brouillon; if (!b) return; const o = b.apercu; if (!o) return; c.save(); c.globalAlpha = 0.8; dessinerUn(c, { ...o, id: '__brouillon', verrou: true }, W, H); c.restore();
  }
  const primitive = {
    req: null, attached(p) { this.req = p.requestUpdate; }, detached() { this.req = null; }, updateAllViews() { /* rien */ },
    paneViews() { return [{ zOrder: () => 'top', renderer: () => ({ draw(cible) { cible.useBitmapCoordinateSpace(sc => {
      try { E.barres = ctx.barresAffichees() || E.barres; const c = sc.context, W = sc.mediaSize.width, H = sc.mediaSize.height; c.save(); c.scale(sc.horizontalPixelRatio, sc.verticalPixelRatio); c.beginPath(); c.rect(0, 0, W, H); c.clip();
        for (const o of vis()) dessinerUn(c, o, W, H); dessinerBrouillon(c, W, H); c.restore(); } catch (e) { /* le rendu ne doit jamais casser le graphique */ }
    }); } }) }]; }
  };
  serie.attachPrimitive(primitive);
  const redessiner = () => { try { E.barres = ctx.barresAffichees() || E.barres; primitive.req && primitive.req(); } catch (e) { /* */ } };

  /* ───── barre d'outils ───── */
  const barre = document.createElement('div'); barre.className = 'tp-dessin-barre'; barre.dataset.ouvert = E.ouvert ? '1' : '0'; if (tactile) barre.classList.add('tp-tactile');
  barre.setAttribute('role', 'toolbar'); barre.setAttribute('aria-label', 'Outils de dessin');
  barre.innerHTML = `<button type="button" class="tp-d-bascule" data-d="bascule" aria-label="Outils de dessin" aria-expanded="${E.ouvert}" title="Outils de dessin">✎</button>
    <span class="tp-d-outils" data-d-outils>${[['select', '↖', 'Sélectionner / déplacer'], ...OUTILS].map(([k, g, t]) => `<button type="button" data-outil="${k}" aria-pressed="${k === 'select'}" aria-label="${esc(k === 'select' ? 'Sélectionner' : NOMS[k])}" title="${esc(t)}">${g}</button>`).join('')}<button type="button" class="tp-d-auto" data-d="auto" hidden title="Ancrage automatique : dernier creux et sommet majeurs de l’unité affichée">Auto</button></span>
    <span class="tp-d-sel" data-d-sel hidden><span class="tp-d-couleurs">${COULEURS.map(c => `<button type="button" class="tp-d-c" data-couleur="${c}" style="--c:${c}" aria-label="Couleur ${c}" title="Couleur"></button>`).join('')}</span><button type="button" data-d="verrou" aria-pressed="false" aria-label="Verrouiller" title="Verrouiller (plus de déplacement)">🔒</button><button type="button" data-d="alerte" aria-pressed="true" aria-label="Alertes de ce niveau" title="Alertes voix et Telegram de ce niveau">🔔</button><button type="button" data-d="suppr" aria-label="Supprimer" title="Supprimer ce dessin">🗑</button></span>
    <span class="tp-d-aide" data-d-aide role="status" aria-live="polite"></span>`;
  conteneur.appendChild(barre);
  const b$ = s => barre.querySelector(s), btnOutil = k => barre.querySelector(`[data-outil="${k}"]`);
  const AIDES = { horizontale: 'Touche le prix pour poser la ligne.', tendance: 'Glisse du premier au second point (ou touche deux points).', boite: 'Glisse d’un coin à l’autre (ou touche deux coins).', fibo: 'Glisse de A (départ) à B (fin de l’impulsion), ou « Auto ».' };
  function majBarre() {
    barre.dataset.ouvert = E.ouvert ? '1' : '0'; b$('[data-d="bascule"]').setAttribute('aria-expanded', String(E.ouvert));
    for (const k of ['select', ...OUTILS.map(x => x[0])]) btnOutil(k).setAttribute('aria-pressed', String(E.mode === k));
    b$('[data-d="auto"]').hidden = E.mode !== 'fibo'; const o = E.sel ? parId(E.sel) : null; b$('[data-d-sel]').hidden = !o;
    if (o) { for (const c of barre.querySelectorAll('[data-couleur]')) c.setAttribute('aria-pressed', String(c.dataset.couleur === o.couleur)); const v = b$('[data-d="verrou"]'), a = b$('[data-d="alerte"]'); v.setAttribute('aria-pressed', String(!!o.verrou)); v.textContent = o.verrou ? '🔒' : '🔓'; a.setAttribute('aria-pressed', String(o.alerte !== false)); a.textContent = o.alerte !== false ? '🔔' : '🔕'; }
    b$('[data-d-aide]').textContent = E.mode !== 'select' ? (E.attente ? 'Touche le second point.' : AIDES[E.mode]) : '';
    conteneur.style.cursor = E.mode !== 'select' ? 'crosshair' : '';
  }
  function choisirMode(m) { E.mode = m; E.brouillon = null; E.attente = false; if (m !== 'select') selectionner(null); majBarre(); redessiner(); }
  function selectionner(i) { E.sel = i; majBarre(); redessiner(); }

  /* ───── persistance et synchronisation ───── */
  let tSync = null;
  function sauver({ sync = true } = {}) { ecrireDessins(id, E.liste); if (sync) { clearTimeout(tSync); tSync = setTimeout(pousser, 800); } }
  async function pousser() {
    const r = await synchroniser(id, E.liste); if (r && r.ok && r.dessins) { E.liste = fusionner(E.liste, r.dessins, now()); ecrireDessins(id, E.liste); redessiner(); majBarre(); }
    E.synchro = r; return r;
  }
  function modifierDessin(o, champs) { const n = modifier(o, champs, now()); if (!n) return null; E.liste = remplacer(E.liste, n); return n; }
  function ajouter(type, d) { const o = creer(type, { ...d, unite: ctx.uniteAffichee() }, { t: now() }); if (!o) return null; E.liste = remplacer(E.liste, o); sauver(); evaluerTout(true); return o; }
  function supprimer(i) { E.liste = supprimerDessin(E.liste, i, now()); if (E.sel === i) E.sel = null; sauver(); majBarre(); evaluerTout(true); redessiner(); }

  /* ───── interactions ───── */
  const posDe = e => { const r = conteneur.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function reclamer(e) {
    if (!E.claim) { E.claim = true; try { chart.applyOptions({ handleScroll: false, handleScale: false }); } catch (err) { /* */ } }
    try { e.preventDefault(); e.stopPropagation(); } catch (err) { /* */ } try { conteneur.setPointerCapture(e.pointerId); } catch (err) { /* */ }
  }
  function relacher(e) {
    if (E.claim) { E.claim = false; try { chart.applyOptions({ handleScroll: true, handleScale: true }); /* l'objet d'options de Lightweight Charts est modifié sur place : on remet explicitement à vrai, comme le fait le graphique */ } catch (err) { /* */ } }
    try { if (e) conteneur.releasePointerCapture(e.pointerId); } catch (err) { /* */ }
  }
  const bloquer = e => { if (E.claim) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); } };
  for (const n of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'dblclick', 'wheel']) conteneur.addEventListener(n, bloquer, { capture: true, passive: false });
  const pointDe = (p, snap = true) => { const t = T(p.x), prix = snap ? aimanter(p.x, p.y) : P(p.y); return t == null || prix == null ? null : { t, p: prix }; };
  function apercu(type, a, b) {
    const d = { unite: ctx.uniteAffichee(), couleur: COULEURS[0] };
    if (type === 'tendance') return creer('tendance', { ...d, t1: a.t, p1: a.p, t2: b.t, p2: b.p }, { id: '__brouillon' });
    if (type === 'boite') return creer('boite', { ...d, t1: a.t, p1: a.p, t2: b.t, p2: b.p }, { id: '__brouillon' });
    if (type === 'fibo') return creer('fibo', { ...d, t1: a.t, p1: a.p, t2: b.t, p2: b.p }, { id: '__brouillon' });
    return null;
  }
  function finirTrace(a, b) {
    const type = E.mode, o = ajouter(type, type === 'tendance' || type === 'fibo' ? { t1: a.t, p1: a.p, t2: b.t, p2: b.p } : { t1: a.t, p1: a.p, t2: b.t, p2: b.p }); E.brouillon = null; E.attente = false; E.mode = 'select'; if (o) selectionner(o.id); else { majBarre(); redessiner(); }
  }
  function surBas(e) {
    if (e.target.closest && e.target.closest('.tp-dessin-barre, .tp-fleche-info')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return; const p = posDe(e);
    if (E.mode !== 'select') {
      const pt = pointDe(p); if (!pt) return; reclamer(e);
      if (E.mode === 'horizontale') { const o = ajouter('horizontale', { p: pt.p }); E.mode = 'select'; if (o) selectionner(o.id); else majBarre(); relacher(e); return; }
      if (E.attente && E.brouillon) { finirTrace(E.brouillon.a, pt); relacher(e); return; }
      E.brouillon = { a: pt, b: pt, depart: p, apercu: null, tap: true }; majBarre(); return;
    }
    const h = sous(p);
    if (!h) { if (E.sel) selectionner(null); return; }
    reclamer(e); if (E.sel !== h.o.id) selectionner(h.o.id);
    if (!h.o.verrou) E.glisse = { poignee: h.poignee, depart: p, orig: { ...h.o }, ptDepart: pointDe(p, false), bouge: false }; redessiner();
  }
  function surMouvement(e) {
    const p = posDe(e);
    if (E.brouillon && (E.claim || E.attente)) {
      const pt = pointDe(p); if (!pt) return; const b = E.brouillon; b.b = pt; if (Math.hypot(p.x - b.depart.x, p.y - b.depart.y) > 6 || E.attente) b.apercu = apercu(E.mode, b.a, pt); redessiner(); if (E.claim) e.preventDefault(); return;
    }
    if (E.glisse && E.claim) {
      const G = E.glisse, o = parId(G.orig.id); if (!o) return; if (!G.bouge && Math.hypot(p.x - G.depart.x, p.y - G.depart.y) < 4) return; G.bouge = true;
      const cur = pointDe(p, G.poignee != null), dt = cur && G.ptDepart ? cur.t - G.ptDepart.t : 0, dp = cur && G.ptDepart ? cur.p - G.ptDepart.p : 0, g0 = G.orig; let ch = null;
      if (!cur) return;
      if (G.poignee == null) { ch = o.type === 'horizontale' ? { p: g0.p + dp } : o.type === 'boite' ? { t1: g0.t1 + dt, t2: g0.t2 + dt, bas: g0.bas + dp, haut: g0.haut + dp } : { t1: g0.t1 + dt, t2: g0.t2 + dt, p1: g0.p1 + dp, p2: g0.p2 + dp }; }
      else if (o.type === 'boite') { const hd = G.poignee; ch = {}; if (hd.includes('w')) ch.t1 = cur.t; if (hd.includes('e')) ch.t2 = cur.t; if (hd.includes('n')) ch.haut = cur.p; if (hd.includes('s')) ch.bas = cur.p; if (ch.t1 != null && ch.t1 > g0.t2) { ch.t2 = ch.t1; delete ch.t1; } }
      else if (o.type === 'tendance' || o.type === 'fibo') ch = G.poignee === 'a' ? { t1: cur.t, p1: cur.p } : { t2: cur.t, p2: cur.p };
      if (ch) { const n = modifierDessin({ ...o, ...g0 }, ch); if (n) E.liste = remplacer(E.liste, { ...n, evenements: o.evenements }); redessiner(); }
      e.preventDefault(); return;
    }
  }
  function surHaut(e) {
    if (E.brouillon && E.claim) {
      const b = E.brouillon, p = posDe(e), pt = pointDe(p) || b.b;
      if (Math.hypot(p.x - b.depart.x, p.y - b.depart.y) > 12) { finirTrace(b.a, pt); relacher(e); return; }   // glissé : tracé terminé
      E.attente = true; b.b = pt; majBarre(); relacher(e); return;                                           // simple toucher : on attend le second point
    }
    if (E.glisse) { const G = E.glisse; E.glisse = null; if (G.bouge) { const o = parId(G.orig.id); if (o) { E.liste = remplacer(E.liste, { ...o, cree: now(), evenements: [], maj: now() }); sauver(); evaluerTout(true); } } }   /* le niveau a bougé : ses anciennes flèches n'ont plus de sens, on repart de zéro (sans annonce) */
    relacher(e); redessiner();
  }
  conteneur.addEventListener('pointerdown', surBas, { capture: true });
  conteneur.addEventListener('pointermove', surMouvement, { capture: true });
  conteneur.addEventListener('pointerup', surHaut, { capture: true });
  conteneur.addEventListener('pointercancel', e => { E.brouillon = null; E.attente = false; E.glisse = null; relacher(e); majBarre(); redessiner(); }, { capture: true });
  const surClavier = e => {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'Escape') { if (E.mode !== 'select' || E.brouillon) choisirMode('select'); else selectionner(null); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && E.sel && !(parId(E.sel) || {}).verrou) { supprimer(E.sel); e.preventDefault(); }
  };
  document.addEventListener('keydown', surClavier);
  barre.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.outil) { choisirMode(b.dataset.outil === E.mode && E.mode !== 'select' ? 'select' : b.dataset.outil); return; }
    const o = E.sel ? parId(E.sel) : null;
    if (b.dataset.couleur && o) { const n = modifierDessin(o, { couleur: b.dataset.couleur }); if (n) { sauver(); majBarre(); redessiner(); } return; }
    switch (b.dataset.d) {
      case 'bascule': E.ouvert = !E.ouvert; ecrire(LS_OUVERT, E.ouvert); if (!E.ouvert) choisirMode('select'); majBarre(); break;
      case 'verrou': if (o) { modifierDessin(o, { verrou: !o.verrou }); sauver(); majBarre(); redessiner(); } break;
      case 'alerte': if (o) { modifierDessin(o, { alerte: o.alerte === false }); sauver(); majBarre(); redessiner(); } break;
      case 'suppr': if (o && !o.verrou) supprimer(o.id); break;
      case 'auto': { const B = ctx.barresAffichees() || [], a = ancrageAuto(B); if (!a) { b$('[data-d-aide]').textContent = 'Pas d’impulsion majeure détectée sur cette unité.'; break; } const n = ajouter('fibo', { ...a, auto: true }); E.mode = 'select'; if (n) selectionner(n.id); break; }
    }
  });
  const keyOk = () => { barre.dataset.ouvert = E.ouvert ? '1' : '0'; }; keyOk();

  /* ───── évaluation à la clôture, flèches, annonces ───── */
  E.evals = new Map();
  function annoncer(o, ev) {
    if (o.alerte === false) return; const texte = phrase(ctx.nomActif, o, ev), c = contexteEvenement(ctx.analyse && ctx.analyse(), { ...ev, annonce: ctx.dansAnnonce ? ctx.dansAnnonce(ev.tFin) : false }), cx = libelleContexte(c, ev);
    try { ctx.parler(texte); } catch (e) { /* */ } try { ctx.notifier && ctx.notifier(texte + (cx ? ' · ' + cx : ''), { niveau: 'info', dit: false, raison: 'niveau tracé' }); } catch (e) { /* */ }
    try { if (ctx.telegramActif && ctx.telegramActif() && ctx.envoyerTelegram) ctx.envoyerTelegram(`${texte}${cx ? ' · ' + cx : ''} · lecture seule, aucun ordre`); } catch (e) { /* */ }
  }
  function evaluerTout(force = false) {
    const t = now(); if (!force && t - E.derEval < 20000) return; E.derEval = t; let change = false, aAnnoncer = [];
    for (const o of vis()) {
      const B = ctx.barresOrigine(o.unite); if (!B || B.length < 30) { continue; }
      let r; try { r = evaluer(o, B, { maintenant: t }); } catch (e) { continue; }
      E.evals.set(o.id, r);
      const avant = o.evenements || [], calcules = r.evenements.map(e => ({ ...e, vueLe: e.tFin <= o.cree ? e.tFin : null })), fus = fusionnerEvenements(avant, calcules);
      if (fus.length !== avant.length) {
        const neufs = fus.filter(e => !avant.some(x => x.id === e.id));
        const recents = neufs.filter(e => e.vueLe == null && t - e.tFin < 36 * 3600e3 && e.tFin <= t); for (const e of neufs) if (e.vueLe == null) e.vueLe = t;
        E.liste = remplacer(E.liste, { ...o, evenements: fus, maj: t }); change = true; if (E.syncFait) for (const e of recents) aAnnoncer.push([{ ...o, evenements: fus }, e]);
      }
    }
    if (change) { sauver(); }
    for (const [o, e] of aAnnoncer.slice(0, 3)) annoncer(o, e);
    E.cleMarq = ''; redessiner();
  }
  /* marqueurs pour le graphique : { time, position, color, shape, size, info: texte } (le temps est converti par `temps` fourni par l'appelant) */
  function marqueurs(B, u, indexSur) {
    const out = [], pas = PAS[u];
    for (const o of vis()) for (const e of o.evenements || []) {
      const k = indexSur(B, e, pas); if (k < 0) continue; const t = ctx.temps(B[k].t); if (t == null) continue;
      const dis = e.type === 'retest', bull = e.dir > 0, c = bull ? [95, 184, 148] : [216, 106, 106], cx = libelleContexte(contexteEvenement(ctx.analyse && ctx.analyse(), { ...e, annonce: ctx.dansAnnonce ? ctx.dansAnnonce(e.tFin) : false }), e);
      out.push({ time: t, position: bull ? 'belowBar' : 'aboveBar', color: `rgba(${c[0]},${c[1]},${c[2]},${dis ? 0.6 : 1})`, shape: bull ? 'arrowUp' : 'arrowDown', size: (dis ? 0.9 : 1.3) * (tactile ? 1.25 : 1), haut: !bull, prix: e.entree, texte: `${bull ? '▲' : '▼'} ${libelle(e)}${cx ? '\n' + cx : ''}${ctx.historique ? '\n' + ctx.historique(o, e) : ''}`, dir: e.dir });
    }
    return out;
  }
  /* première synchronisation : on récupère les dessins des autres appareils AVANT d'annoncer quoi que ce soit (pas de double annonce) */
  (async () => { try { await pousser(); } catch (e) { /* hors ligne */ } E.syncFait = true; evaluerTout(true); })();
  majBarre();
  const minuteur = setInterval(() => { if (!document.hidden) evaluerTout(); }, 30000);
  const resynchro = setInterval(() => { if (!document.hidden) pousser(); }, 5 * 60000);
  return {
    evaluer: evaluerTout, marqueurs, cle: () => vis().map(o => o.id + ':' + (o.evenements || []).length).join(','), redessiner, majBarre,
    detruire() { clearInterval(minuteur); clearInterval(resynchro); document.removeEventListener('keydown', surClavier); try { serie.detachPrimitive(primitive); } catch (e) { /* */ } barre.remove(); },
    etat: () => ({ dessins: vis().map(o => ({ id: o.id, type: o.type, unite: o.unite, couleur: o.couleur, verrou: !!o.verrou, alerte: o.alerte !== false, etat: (E.evals.get(o.id) || {}).etat || 'actif', evenements: (o.evenements || []).length, p: o.p, p1: o.p1, p2: o.p2, t1: o.t1, t2: o.t2, bas: o.bas, haut: o.haut })), selection: E.sel, mode: E.mode, ouvert: E.ouvert, syncFait: E.syncFait, claim: E.claim }),
    /* pour les tests : pixels d'un dessin */
    pixels: i => { const o = parId(i); return o ? ecran(o) : null; },
    px: { X, Y, T, P }, ajouter, supprimer, selectionner, choisirMode, liste: () => vis(), toutesLesDonnees: () => E.liste, evaluations: () => [...E.evals.entries()]
  };
}
