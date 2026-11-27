/* ═════════════ BOUGIES VOLUME : AFFICHAGE SUR UN GRAPHIQUE LIGHTWEIGHT CHARTS (mode Volume et mode Classique) ═════════════
   Colore les bougies à fort volume (cyan = acheteur, magenta = vendeur), petit point sur les extrêmes, zones laissées par les extrêmes, légende, fenêtre « Et après ? ».
   Méthode : on enveloppe setData / update de la série (bougies et, en mode Volume, histogramme du volume) pour ajouter la couleur de chaque point ; les données d'origine ne sont jamais modifiées.
   Rien n'est recalculé en entier à chaque image : calculs en cache (bougies-volume-calcul.js), seule la dernière bougie est recalculée. Lecture seule : aucun ordre. */
import { creerCalcul, classe, zones, dernierClos, SEUILS, SEUIL_DEFAUT, COULEURS, PAS, volumeDisponible } from './bougies-volume-calcul.js';
import { infoBougie, fenetreHtml } from './bougies-volume-texte.js';

const RGB = { achat: [0, 229, 255], vente: [255, 43, 214] };
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export const CLES = { actif: m => 'rayle_bv_actif_' + m, seuil: 'rayle_bv_seuil', zones: 'rayle_bv_zones', alertes: 'rayle_bv_alertes' };
export const ALERTES_DEFAUT = Object.freeze({ voix: false, telegram: false });

/* réglages mémorisés (partagés par les deux modes sauf l'interrupteur : actif par défaut en Volume, désactivé par défaut en Classique) */
export function lireReglages(mode, lireLS) {
  const seuil = lireLS(CLES.seuil, SEUIL_DEFAUT), actif = lireLS(CLES.actif(mode), mode === 'volume'), zonesOn = lireLS(CLES.zones, true), al = lireLS(CLES.alertes, ALERTES_DEFAUT);
  return { actif: actif === true, seuil: SEUILS.includes(seuil) ? seuil : SEUIL_DEFAUT, zones: zonesOn !== false, alertes: { ...ALERTES_DEFAUT, ...(al && typeof al === 'object' ? al : {}) } };
}

export function creerBougiesVolume(cfg) {
  const { mode, chart, conteneur, lireLS, ecrireLS, temps, bars, actif, unite, serie: serieDe, serieVol: serieVolDe = () => null, couleursNormales = { haut: [95, 184, 148], bas: [216, 106, 106] }, bloque = () => false } = cfg;
  const R = lireReglages(mode, lireLS), E = { on: R.actif, seuil: R.seuil, zones: R.zones, pause: false, calcs: new Map(), calc: null, B: [], idx: new Map(), tIdx: [], sig: '', colores: [], zonesL: [], cle: '', serie: null, serieVol: null, prim: null, popup: null, ouvertI: null, dispo: true };
  const pas = () => PAS[unite()] || PAS.H4;
  const peint = () => E.on && !E.pause && E.dispo;

  /* ───── couleur d'un point ───── */
  function ptBougie(p) {
    if (!p || p.open === undefined) return p; const i = E.idx.get(p.time); if (i === undefined) return p;
    const c = classe(E.B, E.calc, i, E.seuil);
    if (!c.niveau) { const n = c.dir < 0 ? couleursNormales.bas : couleursNormales.haut, k = rgba(n, 0.45); return { ...p, color: k, wickColor: k, borderColor: k }; }
    const k = rgba(c.dir > 0 ? RGB.achat : RGB.vente, 1); return { ...p, color: k, wickColor: k, borderColor: k };
  }
  function ptVolume(p) {
    if (!p || p.value === undefined) return p; const i = E.idx.get(p.time); if (i === undefined) return p;
    const c = classe(E.B, E.calc, i, E.seuil); if (!c.niveau) return p; return { ...p, color: rgba(c.dir > 0 ? RGB.achat : RGB.vente, c.niveau === 2 ? 1 : 0.6) };
  }
  /* enveloppe setData / update d'une série */
  function habiller(s, fn) {
    if (!s || s.__bv) return; const sd = s.setData.bind(s), up = s.update.bind(s); let brut = [];
    try { brut = (s.data() || []).slice(); } catch (e) { brut = []; }
    s.__bv = { fn, appliquer: () => sd(peint() ? brut.map(fn) : brut), brut: () => brut };
    s.setData = d => { brut = Array.isArray(d) ? d.slice() : []; try { maj(); aligner(brut); } catch (e) { /* la coloration ne doit jamais casser le graphique */ } return sd(peint() ? brut.map(fn) : d); };
    s.update = (p, h) => { let k = brut.length - 1; while (k >= 0 && brut[k].time > p.time) k--; if (k >= 0 && brut[k].time === p.time) brut[k] = p; else brut.splice(k + 1, 0, p); try { maj(); alignerUpdate(p); } catch (e) { /* idem */ } return up(peint() ? fn(p) : p, h); };
  }
  const reappliquer = () => { for (const s of [E.serie, E.serieVol]) if (s && s.__bv) { try { s.__bv.appliquer(); } catch (e) { /* série fermée */ } } demander(); };

  /* ───── données calculées (cache) ───── */
  const calcPour = () => { const k = actif() + '|' + unite(); if (!E.calcs.has(k)) E.calcs.set(k, creerCalcul(actif())); return E.calcs.get(k); };
  const tAt = i => (E.tIdx[i] != null ? E.tIdx[i] : (E.B[i] ? temps(E.B[i].t) : null));
  const dispoPour = () => volumeDisponible(actif()) && !!PAS[unite()];
  function recoller() { for (const x of E.colores) x.time = tAt(x.i); for (const z of E.zonesL) z.time = tAt(z.i); }
  /* les points envoyés à la série sont alignés 1 pour 1 avec les bougies : leur date graphique fait foi (le graphique d'origine a ses propres dates) */
  function aligner(d) { const n = E.B.length; if (!d || d.length !== n || !n) return; E.tIdx = new Array(n); E.idx = new Map(); for (let k = 0; k < n; k++) { E.tIdx[k] = d[k].time; E.idx.set(d[k].time, k); } E.alignee = E.cle; recoller(); }
  function alignerUpdate(p) {
    const B = E.B, n = B.length; if (!n || !p || E.idx.has(p.time)) return; const proche = k => k >= 0 && Math.abs(B[k].c - p.close) <= 1e-9 * Math.max(1, Math.abs(p.close)) && Math.abs(B[k].o - p.open) <= 1e-9 * Math.max(1, Math.abs(p.open));
    const k = proche(n - 1) ? n - 1 : proche(n - 2) ? n - 2 : n - 1; E.idx.set(p.time, k); E.tIdx[k] = p.time; recoller();
  }
  function maj() {
    E.dispo = dispoPour(); const B = bars() || []; E.B = B; E.calc = calcPour(); const dernier = B.length ? B[B.length - 1] : null;
    const sig = [actif(), unite(), B.length, B.length ? B[0].t : 0, dernier ? dernier.t + '/' + dernier.c + '/' + dernier.v + '/' + dernier.h + '/' + dernier.l : '', E.seuil, E.dispo].join('|'); if (sig === E.sig) return; E.sig = sig;
    if (!E.dispo || B.length < 30 || !B.some(b => b.v > 0)) { E.colores = []; E.zonesL = []; E.idx = new Map(); E.tIdx = []; E.cle = ''; majLegende(); return; }
    E.calc.maj(B);
    const cle = [actif(), unite(), B.length, B[0].t, E.seuil].join('|');
    if (cle !== E.cle) { E.cle = cle; E.alignee = null; E.idx = new Map(); E.tIdx = new Array(B.length); B.forEach((b, i) => { const t = temps(b.t); E.tIdx[i] = t; if (t != null) E.idx.set(t, i); }); E.coloresBase = null; }
    const ancre = B.length - 1;
    if (!E.coloresBase) { E.coloresBase = []; for (let i = 0; i < ancre; i++) { const r = E.calc.rel(i); if (r == null || r < E.seuil) continue; const c = classe(B, E.calc, i, E.seuil); if (c.niveau) E.coloresBase.push({ i, niveau: c.niveau, dir: c.dir, t: B[i].t, time: tAt(i) }); } }
    E.colores = E.coloresBase.slice(); { const c = classe(B, E.calc, ancre, E.seuil); if (c.niveau) E.colores.push({ i: ancre, niveau: c.niveau, dir: c.dir, t: B[ancre].t, time: tAt(ancre) }); }
    const dc = dernierClos(B, pas()), zk = [cle, dc, dc >= 0 ? B[dc].c : 0].join('|'); if (zk !== E.zk) { E.zk = zk; E.zonesL = zones(B, E.calc, { pas: pas() }).map(z => ({ ...z, time: tAt(z.i) })); }
    majLegende();
  }

  /* ───── primitive : zones (fond), points des extrêmes, contour de la bougie en cours (premier plan) ───── */
  const ts = () => chart.timeScale(), xDe = t => (t == null ? null : ts().timeToCoordinate(t)), yDe = p => E.serie.priceToCoordinate(p);
  function dessinerZones(sc) {
    if (!peint() || !E.zones || !E.zonesL.length) return; const c = sc.context, hr = sc.horizontalPixelRatio, vr = sc.verticalPixelRatio, W = sc.bitmapSize.width;
    for (const z of E.zonesL) { const x0 = xDe(z.time), y1 = yDe(z.haut), y2 = yDe(z.bas); if (x0 == null || y1 == null || y2 == null) continue; c.fillStyle = rgba(z.dir > 0 ? RGB.achat : RGB.vente, 0.12); const h = Math.max(2 * vr, (y2 - y1) * vr); c.fillRect(Math.max(0, x0 * hr), y1 * vr, W - Math.max(0, x0 * hr), h); }
    if (E.nomsPropres !== false) { const fs = window.innerWidth >= 1100 ? 13 : window.innerWidth >= 700 ? 12 : 11; c.font = `bold ${fs * hr}px system-ui, sans-serif`; let n = 0; for (const z of E.zonesL.slice(-4)) { const y1 = yDe(z.haut); if (y1 == null) continue; const nom = z.dir > 0 ? 'Zone de volume extrême acheteur' : 'Zone de volume extrême vendeur', w = c.measureText(nom).width; c.fillStyle = 'rgba(10,14,18,.86)'; c.fillRect(W - w - 14 * hr, (y1 + 2 + n * (fs + 7)) * vr, w + 10 * hr, (fs + 5) * vr); c.fillStyle = rgba(z.dir > 0 ? RGB.achat : RGB.vente, 1); c.fillText(nom, W - w - 9 * hr, (y1 + 2 + n * (fs + 7) + fs + 1) * vr); n++; } }
  }
  function dessinerPoints(sc) {
    if (!peint() || !E.colores.length) return; const c = sc.context, hr = sc.horizontalPixelRatio, vr = sc.verticalPixelRatio, W = sc.bitmapSize.width / hr, sp = ts().options().barSpacing || 8, B = E.B, pasMs = pas(), maintenant = Date.now();
    for (const x of E.colores) {
      const px = xDe(x.time); if (px == null || px < -30 || px > W + 30) continue; const b = B[x.i], col = rgba(x.dir > 0 ? RGB.achat : RGB.vente, 1);
      if (x.niveau === 2) { const y = x.dir > 0 ? yDe(b.h) : yDe(b.l); if (y != null) { c.fillStyle = col; c.beginPath(); c.arc(px * hr, (y + (x.dir > 0 ? -7 : 7)) * vr, Math.max(2.5, Math.min(4, sp * 0.35)) * hr, 0, 2 * Math.PI); c.fill(); } }
      if (b.t + pasMs > maintenant) {   // bougie en cours : contour pointillé + mention, définitive à la clôture
        const y1 = yDe(Math.max(b.o, b.c)), y2 = yDe(Math.min(b.o, b.c)), yH = yDe(b.h); if (y1 == null || y2 == null) continue; const demi = Math.max(3, sp * 0.45);
        c.save(); c.strokeStyle = col; c.lineWidth = Math.max(1, hr); c.setLineDash([3 * hr, 3 * hr]); c.strokeRect((px - demi) * hr, (y1 - 2) * vr, demi * 2 * hr, Math.max(4, y2 - y1 + 4) * vr); c.setLineDash([]);
        c.fillStyle = col; c.font = `${10 * hr}px system-ui, sans-serif`; c.textAlign = 'center'; c.fillText('en cours', px * hr, ((yH != null ? yH : y1) - (x.niveau === 2 && x.dir > 0 ? 16 : 8)) * vr); c.restore();
      }
    }
  }
  function creerPrim() {
    return { req: null, attached(p) { this.req = p.requestUpdate; }, detached() { this.req = null; }, updateAllViews() { /* tout est lu au dessin */ },
      paneViews() { return [{ zOrder: () => 'bottom', renderer: () => ({ draw() { /* fond seulement */ }, drawBackground: cible => cible.useBitmapCoordinateSpace(sc => { try { dessinerZones(sc); } catch (e) { /* ne casse pas le graphique */ } }) }) },
        { zOrder: () => 'top', renderer: () => ({ draw: cible => cible.useBitmapCoordinateSpace(sc => { try { dessinerPoints(sc); } catch (e) { /* idem */ } }) }) }]; } };
  }
  let tDem = 0; function demander() { if (E.prim && E.prim.req) E.prim.req(); }

  /* ───── légende discrète en haut à gauche ───── */
  let leg = null;
  function majLegende() {
    if (!conteneur) return; if (!leg) { leg = document.createElement('div'); leg.className = 'bv-legende bv-leg-' + mode; leg.setAttribute('aria-label', 'Légende des bougies volume'); conteneur.appendChild(leg); }
    leg.hidden = !(E.on && E.dispo);
    leg.innerHTML = `<span style="color:${COULEURS.achat}">●</span> Achat fort <span style="color:${COULEURS.vente}">●</span> Vente forte <span class="bv-pt">●</span> = extrême · seuil ×${String(E.seuil).replace('.', ',')}`;
  }

  /* ───── fenêtre « Et après ? » ───── */
  function fermerFenetre() { if (E.popup) E.popup.hidden = true; E.ouvertI = null; }
  function ouvrirFenetre(i, point) {
    if (!conteneur) return; if (!E.popup) { E.popup = document.createElement('div'); E.popup.className = 'bv-fenetre'; E.popup.setAttribute('role', 'dialog'); E.popup.setAttribute('aria-label', 'Et après ?'); conteneur.appendChild(E.popup); E.popup.addEventListener('click', ev => { if (ev.target.closest('[data-bv-fermer]')) fermerFenetre(); }); }
    const I = infoBougie(E.B, E.calc, i, { seuil: E.seuil, pas: pas(), actif: actif(), unite: unite() }); E.popup.innerHTML = fenetreHtml(I); E.popup.hidden = false; E.ouvertI = i;
    const W = conteneur.clientWidth, Hh = conteneur.clientHeight, w = Math.min(310, W - 16); E.popup.style.width = w + 'px';
    const px = point ? point.x : W / 2, gauche = px > W / 2 ? Math.max(8, px - w - 24) : Math.min(W - w - 8, px + 24); E.popup.style.left = gauche + 'px'; E.popup.style.top = '40px'; E.popup.style.maxHeight = Math.max(160, Hh - 56) + 'px';
  }
  function surClic(p) {
    if (!peint() || bloque()) return; if (!p || p.time == null) { return; } const i = E.idx.get(p.time); if (i === undefined) { fermerFenetre(); return; }
    const c = classe(E.B, E.calc, i, E.seuil); if (c.niveau) ouvrirFenetre(i, p.point); else fermerFenetre();
  }

  /* ───── branchement sur la série (peut être remplacée par le graphique d'origine) ───── */
  function attacher() {
    const s = serieDe(), sv = serieVolDe(); let neuf = false;
    if (s && s !== E.serie) { if (E.serie && E.prim) { try { E.serie.detachPrimitive(E.prim); } catch (e) { /* déjà détachée */ } } E.serie = s; E.prim = creerPrim(); try { s.attachPrimitive(E.prim); } catch (e) { E.prim = null; } habiller(s, ptBougie); neuf = true; }
    if (sv && sv !== E.serieVol) { E.serieVol = sv; habiller(sv, ptVolume); neuf = true; }
    return neuf;
  }
  chart.subscribeClick(surClic);
  attacher(); maj(); if (E.on) reappliquer();

  const api = {
    /* à appeler quand les bougies ou l'actif / l'unité changent (rapide : seule la dernière bougie est recalculée) */
    maj(opts = {}) { const neuf = attacher(); maj(); if (neuf || opts.reappliquer) reappliquer(); else demander(); if (E.ouvertI != null && E.ouvertI >= E.B.length) fermerFenetre(); },
    /* la dernière bougie vient d'être mise à jour (flux en direct) : légère */
    majDerniere() { if (!E.on || !E.dispo) return; maj(); demander(); },
    actifChange() { E.dispo = dispoPour(); E.colores = []; E.coloresBase = null; E.zonesL = []; E.cle = ''; E.sig = ''; E.zk = ''; fermerFenetre(); majLegende(); },
    actif: () => E.on, seuil: () => E.seuil, zones: () => E.zones, disponible: () => E.dispo,
    zonesNommees: () => (E.zones && E.on ? E.zonesL.map(z => ({ bas: z.bas, haut: z.haut, dir: z.dir })) : []), noms(v) { E.nomsPropres = v !== false; },
     definirActif(v) { E.on = !!v; ecrireLS(CLES.actif(mode), E.on); if (!E.on) fermerFenetre(); maj(); reappliquer(); majLegende(); },
    definirSeuil(s) { if (!SEUILS.includes(s)) return; E.seuil = s; ecrireLS(CLES.seuil, s); maj(); reappliquer(); },
    definirZones(v) { E.zones = !!v; ecrireLS(CLES.zones, E.zones); demander(); },
    pause(v) { if (E.pause === !!v) return; E.pause = !!v; reappliquer(); majLegende(); },   // empreinte (footprint) affichée : on rend les bougies telles quelles
    centrer(tMs) { try { const i = E.B.findIndex(b => b.t === tMs); if (i < 0) return false; const r = ts().getVisibleLogicalRange(), larg = r ? Math.max(20, r.to - r.from) : 60; ts().setVisibleLogicalRange({ from: i - larg / 2, to: i + larg / 2 }); const p = { x: conteneur ? conteneur.clientWidth / 2 : 100 }; if (peint() && classe(E.B, E.calc, i, E.seuil).niveau) ouvrirFenetre(i, p); return true; } catch (e) { return false; } },
    indice: t => E.idx.get(t), classeDe: i => (E.calc && E.B[i] ? classe(E.B, E.calc, i, E.seuil) : null), peint: () => peint(),
    donnees: () => ({ B: E.B, calc: E.calc, seuil: E.seuil, pas: pas(), actif: actif(), unite: unite() }),
    ouvrirFenetre: i => { if (E.calc && i >= 0 && i < E.B.length) ouvrirFenetre(i, null); }, fermerFenetre,
    etat: () => ({ actif: E.on, disponible: E.dispo, seuil: E.seuil, zonesAffichees: E.zones, nFort: E.colores.length, nExtreme: E.colores.filter(x => x.niveau === 2).length, nZones: E.zonesL.length, enCours: E.colores.some(x => E.B[x.i] && E.B[x.i].t + pas() > Date.now()), fenetreOuverte: !!(E.popup && !E.popup.hidden), legende: leg ? leg.textContent : '', pause: E.pause,
      fort: E.colores.map(x => ({ t: x.t, niveau: x.niveau, dir: x.dir })), couleurDerniere: (() => { const s = E.serie && E.serie.__bv ? E.serie.__bv.brut() : []; const p = s.length ? ptBougie(s[s.length - 1]) : null; return p ? p.color || null : null; })() }),
    detruire() { try { chart.unsubscribeClick(surClic); } catch (e) { /* rien */ } try { if (E.serie && E.prim) E.serie.detachPrimitive(E.prim); } catch (e) { /* rien */ } if (leg) leg.remove(); if (E.popup) E.popup.remove(); void tDem; }
  };
  majLegende();
  return api;
}

/* barre de commandes : bouton « Bougies volume », seuil, bouton « Zones » (même rendu dans les deux modes) */
export function monterCommandes(hote, ctrl, { avant = null, lireLS } = {}) {
  const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.bv = ''; bt.className = 'bv-bouton'; bt.textContent = 'Bougies volume'; bt.title = 'Repère les bougies à fort volume : cyan = acheteur, magenta = vendeur (volume ≥ seuil × médiane des 50 bougies précédentes)';
  const sel = document.createElement('select'); sel.dataset.bvSeuil = ''; sel.className = 'bv-seuil'; sel.setAttribute('aria-label', 'Seuil de volume relatif'); sel.title = 'Seuil de fort volume (× la médiane des 50 bougies précédentes)'; sel.innerHTML = SEUILS.map(s => `<option value="${s}">×${String(s).replace('.', ',')}</option>`).join('');
  const bz = document.createElement('button'); bz.type = 'button'; bz.dataset.bvZones = ''; bz.className = 'bv-bouton bv-zones'; bz.textContent = 'Zones'; bz.title = 'Affiche ou masque les zones laissées par les bougies à volume extrême (8 plus récentes intactes)';
  const titre = bt.title, maj = () => { const on = ctrl.actif(), ok = ctrl.disponible(); bt.setAttribute('aria-pressed', String(on && ok)); bt.disabled = !ok; bt.classList.toggle('bv-indispo', !ok); bt.title = ok ? titre : 'Volume non disponible pour cet actif'; sel.value = String(ctrl.seuil()); sel.hidden = !(on && ok); bz.hidden = !(on && ok); bz.setAttribute('aria-pressed', String(ctrl.zones())); };
  bt.addEventListener('click', () => { if (!ctrl.disponible()) return; ctrl.definirActif(!ctrl.actif()); maj(); });
  sel.addEventListener('change', () => { ctrl.definirSeuil(+sel.value); maj(); });
  bz.addEventListener('click', () => { ctrl.definirZones(!ctrl.zones()); maj(); });
  if (avant && avant.parentNode === hote) hote.insertBefore(bt, avant); else hote.appendChild(bt); bt.after(sel); sel.after(bz); void lireLS; maj();
  return { maj, elements: { bouton: bt, seuil: sel, zones: bz } };
}
