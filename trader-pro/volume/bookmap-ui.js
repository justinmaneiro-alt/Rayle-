/* ═════════════ BOOKMAP : ÉCRAN (v12, phase 2) ═════════════
   Un canvas 2D dans le terminal Volume : carte de chaleur de la liquidité (une colonne par seconde ou par 10 secondes), bulles des grosses transactions, fine ligne de prix,
   profil du carnet actuel à droite, axe des prix. Fluidité : on ne dessine QUE la zone visible (une image de nCols × nRows pixels, agrandie), 5 images par seconde au repos,
   davantage pendant un geste, rien quand la page est cachée. Les données arrivent par bookmap-flux.js et sont gardées localement (bookmap-stockage.js). */
import { palierBookmap, creerGrille, creerBulles, seuilAuto, MULTIPLICATEURS_SEUIL, rayonBulle, paletteChaleur, referenceContraste, dureeConseillee, DEMI_FENETRE } from './bookmap-calcul.js';
import { demarrerFlux, BOOKMAP_POSSIBLE } from './bookmap-flux.js';
import { creerStockage, creerMagasinIDB } from './bookmap-stockage.js';

const NOMS = { or: 'Or', btc: 'Bitcoin', sol: 'Solana' };
const REGLAGES_DEFAUT = { contraste: 1.6, multSeuil: 1, echelle: 'secondes' };
const PX_COL = 3, AXE = 62, PROFIL = 74, BAS = 20;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = (t, avecS) => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()) + (avecS ? ':' + p(d.getSeconds()) : ''); };
const joli = (x, ref) => { const d = Math.max(0, Math.min(6, Math.ceil(-Math.log10(ref || 1) - 1e-9))); return (+x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '); };

export function creerBookmap({ hote, lireLS = (k, d) => d, ecrireLS = () => {}, WS = globalThis.WebSocket, fetchFn, magasin = null, maintenant = () => Date.now(), surChange = () => {} } = {}) {
  const racine = document.createElement('div'); racine.className = 'tpv-bm'; racine.hidden = true;
  racine.innerHTML = `<div class="tpv-bm-barre">
      <span class="tpv-bm-titre" data-bm-titre>Bookmap</span><span class="tpv-bm-statut" data-bm-statut role="status"></span><span class="tpv-vide"></span>
      <label title="Contraste de la carte de chaleur : plus haut = les petits ordres ressortent">Contraste <input type="range" data-bm-contraste min="0.5" max="5" step="0.1" aria-label="Contraste"></label>
      <label title="Taille minimale d’une transaction pour être dessinée en bulle (multiple du seuil automatique)">Bulles <select data-bm-seuil aria-label="Seuil des bulles">${MULTIPLICATEURS_SEUIL.map(m => `<option value="${m}">≥ ×${String(m).replace('.', ',')}</option>`).join('')}</select></label>
      <label title="Secondes : une colonne par seconde (environ 5 minutes visibles) · Minutes : une colonne par 10 secondes (environ 50 minutes)">Temps <select data-bm-echelle aria-label="Échelle de temps"><option value="secondes">Secondes</option><option value="minutes">Minutes</option></select></label>
      <button type="button" data-bm-auto title="Recentre le prix et reviens à maintenant">Auto</button></div>
    <canvas class="tpv-bm-canvas" data-bm-canvas aria-label="Bookmap : carte de chaleur de la liquidité"></canvas>
    <p class="tpv-bm-note" data-bm-note></p>`;
  hote.appendChild(racine);
  const $ = s => racine.querySelector(s), cv = $('[data-bm-canvas]'), ctx = cv.getContext('2d', { alpha: false });
  const off = document.createElement('canvas'), octx = off.getContext('2d'), PAL = paletteChaleur();
  /* table d'intensité (x^0,6) : aucune puissance calculée par case */
  const LUT = new Uint16Array(1024); for (let i = 0; i < 1024; i++) LUT[i] = Math.round(Math.pow(i / 1023, 0.6) * 255) * 3;
  let img = null;
  const R = { actif: null, palier: 1, G: null, B: null, flux: null, stock: null, dureeMs: 3 * 3600e3, vue: { demi: 110, centre: null, decalage: 0 }, reglages: { ...REGLAGES_DEFAUT }, dernierMid: null, sauve: 0, nSauve: 0, nBulleSauve: 0, tDebut: 0, dessins: 0, msDessin: 0, minuteur: 0, sale: true, geste: 0, etatFlux: {}, charge: null, actif_: false, rafale: [] };
  const magasinEff = magasin || creerMagasinIDB();
  const cle = a => 'rayle_tpv_bm_' + a;

  /* ───── réglages ───── */
  const appliquerReglages = () => { $('[data-bm-contraste]').value = R.reglages.contraste; $('[data-bm-seuil]').value = String(R.reglages.multSeuil); $('[data-bm-echelle]').value = R.reglages.echelle; };
  const sauverReglages = () => { if (R.actif) ecrireLS(cle(R.actif), R.reglages); };
  racine.addEventListener('input', ev => { if (ev.target.matches('[data-bm-contraste]')) { R.reglages.contraste = +ev.target.value; sauverReglages(); R.sale = true; } });
  racine.addEventListener('change', ev => {
    if (ev.target.matches('[data-bm-seuil]')) { R.reglages.multSeuil = +ev.target.value; sauverReglages(); R.sale = true; }
    if (ev.target.matches('[data-bm-echelle]')) { R.reglages.echelle = ev.target.value; sauverReglages(); R.sale = true; surChange(); }
  });
  $('[data-bm-auto]').addEventListener('click', () => { R.vue.centre = null; R.vue.decalage = 0; R.vue.demi = 110; R.sale = true; });

  /* ───── géométrie ───── */
  const geo = () => { const W = cv.clientWidth, H = cv.clientHeight, pl = Math.max(40, W - AXE - PROFIL), ph = Math.max(40, H - BAS), pas = R.reglages.echelle === 'minutes' ? 10000 : 1000, nCols = Math.max(20, Math.floor(pl / PX_COL)); return { W, H, pl, ph, pas, nCols }; };
  function redimensionner() { const dpr = Math.min(2, globalThis.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return false; if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); } ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return true; }
  const pasNice = bruts => { const e = Math.pow(10, Math.floor(Math.log10(bruts))), r = bruts / e; return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * e; };

  /* ───── dessin ───── */
  function dessiner() {
    if (!R.actif_ || racine.hidden || !redimensionner()) return; const t0 = performance.now();
    const g = geo(), { W, H, pl, ph, pas, nCols } = g, G = R.G, now = maintenant();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const mid = R.dernierMid, centre = R.vue.centre != null ? R.vue.centre : (mid != null ? mid / R.palier : null);
    if (!G || centre == null) { ctx.fillStyle = '#6b7a84'; ctx.font = '12px ui-monospace, Consolas, monospace'; ctx.fillText('En attente du carnet Binance…', 14, 28); R.msDessin = performance.now() - t0; return; }
    const demi = Math.max(8, Math.min(DEMI_FENETRE, R.vue.demi)), binHaut = Math.ceil(centre + demi), binBas = Math.floor(centre - demi), nRows = binHaut - binBas + 1, rowPx = ph / nRows;
    const tFin = Math.ceil((now - R.vue.decalage) / pas) * pas, X = G.matrice(tFin, pas, nCols, binBas, binHaut);
    const yBin = b => (binHaut + 0.5 - b) * rowPx, yPrix = p => yBin(p / R.palier);
    /* carte de chaleur : une image nCols × nRows agrandie (pixels nets) */
    const ref = referenceContraste(X.M);
    if (off.width !== nCols || off.height !== nRows) { off.width = nCols; off.height = nRows; img = null; }
    if (!img) img = octx.createImageData(nCols, nRows); const d = img.data, M = X.M, inv = ref > 0 ? R.reglages.contraste / ref : 0;
    for (let i = 0; i < M.length; i++) { const q = M[i], o = i * 4; if (q > 0 && inv > 0) { const x = q * inv, k = LUT[x >= 1 ? 1023 : (x * 1023) | 0]; d[o] = PAL[k]; d[o + 1] = PAL[k + 1]; d[o + 2] = PAL[k + 2]; } else { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; } d[o + 3] = 255; }
    octx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, nCols, nRows, 0, 0, nCols * PX_COL, ph);
    const xCol = j => (j + 0.5) * PX_COL;
    /* ligne de prix */
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1; ctx.beginPath(); let debut = true;
    for (let j = 0; j < nCols; j++) { const m = X.mids[j]; if (m == null) { debut = true; continue; } const y = yPrix(m); if (y < -50 || y > ph + 50) { debut = true; continue; } if (debut) { ctx.moveTo(xCol(j), y); debut = false; } else ctx.lineTo(xCol(j), y); } ctx.stroke();
    /* bulles */
    const auto = seuilAuto(R.B.tailles()), seuil = auto * R.reglages.multSeuil; let nb = 0;
    if (seuil > 0) for (const b of R.B.visibles(X.tDebut, tFin, seuil).slice(-700)) {
      const x = (b.t - X.tDebut) / pas * PX_COL, y = yPrix(b.p); if (x < 0 || x > nCols * PX_COL || y < 0 || y > ph) continue; const r = rayonBulle(b.q, seuil);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = b.cote === 'achat' ? 'rgba(80,200,140,.55)' : 'rgba(230,90,90,.55)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = b.cote === 'achat' ? 'rgba(150,255,200,.9)' : 'rgba(255,160,160,.9)'; ctx.stroke(); nb++;
    }
    /* profil du carnet actuel (à droite de la carte) */
    const niv = R.flux && R.flux.carnet.pret() ? R.flux.carnet.niveaux(R.palier, DEMI_FENETRE).niveaux : []; const vus = []; for (const n of niv) if (n.bin >= binBas && n.bin <= binHaut) vus.push(n.qte); vus.sort((a, b) => a - b); const max = vus.length ? vus[Math.min(vus.length - 1, Math.floor(vus.length * 0.95))] : 0;   /* 95e centile : un mur géant ne doit pas écraser tout le profil */
    ctx.fillStyle = '#05080c'; ctx.fillRect(pl, 0, PROFIL + AXE, H);
    if (max > 0) for (const n of niv) { if (n.bin < binBas || n.bin > binHaut) continue; const w = Math.max(1, Math.min(1, n.qte / max) * (PROFIL - 6)); ctx.fillStyle = n.cote === 'b' ? 'rgba(95,184,148,.8)' : 'rgba(216,106,106,.8)'; ctx.fillRect(pl + PROFIL - w, yBin(n.bin) - rowPx / 2 + 0.5, w, Math.max(1, rowPx - 1)); }
    /* axe des prix */
    ctx.font = '10px ui-monospace, Consolas, monospace'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#8aa0aa'; const sb = Math.max(1, pasNice(30 / rowPx));
    for (let b = Math.ceil(binBas / sb) * sb; b <= binHaut; b += sb) { const y = yBin(b); if (y < 8 || y > ph - 6) continue; ctx.fillRect(pl + PROFIL, y, 4, 1); ctx.fillText(joli(b * R.palier, R.palier), pl + PROFIL + 7, y); }
    if (mid != null) { const y = yPrix(mid); if (y > 6 && y < ph - 6) { ctx.fillStyle = '#14212b'; ctx.fillRect(pl + PROFIL, y - 8, AXE - 2, 16); ctx.strokeStyle = '#8fd0e3'; ctx.strokeRect(pl + PROFIL + 0.5, y - 7.5, AXE - 3, 15); ctx.fillStyle = '#d8f2fb'; ctx.fillText(joli(mid, R.palier), pl + PROFIL + 5, y + 0.5); } }
    /* axe du temps */
    ctx.fillStyle = '#05080c'; ctx.fillRect(0, ph, pl, BAS); ctx.fillStyle = '#8aa0aa'; ctx.textBaseline = 'middle'; const pasTexte = pas === 1000 ? 30000 : 300000;
    for (let t = Math.ceil(X.tDebut / pasTexte) * pasTexte; t < tFin; t += pasTexte) { const x = (t - X.tDebut) / pas * PX_COL; if (x < 20 || x > pl - 30) continue; ctx.fillRect(x, ph, 1, 4); ctx.fillText(hhmm(t, pas === 1000), x - 14, ph + 11); }
    /* marque « mémorisé depuis » */
    const prem = G.premiereDate(); if (prem != null && prem > X.tDebut && prem < tFin) { const x = (prem - X.tDebut) / pas * PX_COL; ctx.strokeStyle = 'rgba(143,208,227,.5)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ph); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(143,208,227,.8)'; ctx.textBaseline = 'top'; ctx.fillText('la carte commence ici (' + hhmm(prem, true) + ')', Math.min(x + 4, pl - 190), 4); }
    R.nBulles = nb; R.seuil = seuil; R.auto = auto; R.ref = ref; R.msDessin = R.msDessin * 0.8 + (performance.now() - t0) * 0.2; R.dessins++; R.sale = false; majTexte();
  }
  function majTexte() {
    const e = R.etatFlux, G = R.G, couv = G ? G.couverture() : 0, min = Math.floor(couv / 60000), h = couv < 60000 ? Math.round(couv / 1000) + ' s' : min >= 60 ? Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0') : min + ' min';
    const etat = e.carnet === 'connecte' && e.trades === 'connecte' ? 'en direct' : (e.carnet || 'connexion') + ' / ' + (e.trades || 'connexion');
    $('[data-bm-titre]').textContent = 'Bookmap · ' + (NOMS[R.actif] || '') + ' · Binance perpétuel';
    $('[data-bm-statut]').textContent = etat + ' · ' + (R.palier ? 'case ' + joli(R.palier, R.palier) : '') + (R.seuil ? ' · bulle ≥ ' + (R.seuil >= 10 ? Math.round(R.seuil) : R.seuil.toPrecision(2)) : ' · bulles : mesure en cours');
    $('[data-bm-note]').textContent = 'Carte gardée sur cet appareil : ' + h + ' affichées' + (R.charge && R.charge.colonnes ? ' dont ' + R.charge.colonnes + ' s relues de la visite précédente' : '') + ' (jusqu’à ' + Math.round(R.dureeMs / 3600e3 * 10) / 10 + ' h). La carte a commencé à l’ouverture de la page : Binance ne fournit aucun historique du carnet. Lecture seule, aucun ordre.';
  }

  /* ───── données ───── */
  function surCarnet(carnet, t) {
    const m = carnet.meilleurs().mid; if (!(m > 0)) return; R.dernierMid = m;
    if (!R.G) { const prev = R.palierStocke; let p = palierBookmap(m, R.actif); if (prev && prev / p <= 2 && p / prev <= 2) p = prev; R.palier = p; R.G = creerGrille({ palier: p, dureeMs: R.dureeMs }); if (R.chargeBrut) { R.G.inserer(R.chargeBrut.colonnes); R.B.inserer(R.chargeBrut.bulles); } R.chargeBrut = null; }
    const N = carnet.niveaux(R.palier, DEMI_FENETRE), tc = R.G.courante(); R.G.ajouter(N.mid, N.niveaux, t); const ts = Math.floor(t / 1000);   /* redessin seulement à chaque nouvelle seconde (la carte avance d'une colonne par seconde) */
    if (ts !== R.derniereSeconde) { R.derniereSeconde = ts; R.sale = true; }
  }
  function surTrade(tr) { const auto = seuilAuto(R.B.tailles()); if (R.B.ajouter(tr, Math.max(auto * MULTIPLICATEURS_SEUIL[0], 0)) && tr.qte >= auto * R.reglages.multSeuil && maintenant() - (R.tBulle || 0) > 400) { R.tBulle = maintenant(); R.sale = true; } }
  async function sauvegarder(force = false) {
    if (!R.G || !R.stock) return; const cols = R.G.colonnes(), nouvelles = cols.filter(c => c.t > R.sauve && c.n > 0); const bl = R.B.liste().filter(b => b.t > R.sauveB); if (!nouvelles.length && !bl.length) return; if (!force && nouvelles.length < 20 && !bl.length) return;
    R.sauve = nouvelles.length ? nouvelles[nouvelles.length - 1].t : R.sauve; R.sauveB = bl.length ? bl[bl.length - 1].t : R.sauveB;
    try { await R.stock.sauver({ palier: R.palier, cols: nouvelles, bulles: bl }); R.nSauve += nouvelles.length; R.nBulleSauve += bl.length; await R.stock.purger({ dureeMs: R.dureeMs }); } catch (e) { /* stockage plein ou refusé : la carte continue sans mémoire */ }
  }
  async function mesurerDuree() { let q = null, u = 0; try { const s = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; if (s) { q = s.quota; u = s.usage; } } catch (e) { /* inconnu */ } return dureeConseillee({ memoireGo: navigator.deviceMemory || null, quotaOctets: q, usageOctets: u }); }

  /* ───── cycle de vie ───── */
  async function activer(actif) {
    if (!BOOKMAP_POSSIBLE(actif)) return false; if (R.actif_ && R.actif === actif) return true; desactiver();
    R.actif = actif; R.actif_ = true; racine.hidden = false; R.reglages = { ...REGLAGES_DEFAUT, ...lireLS(cle(actif), {}) }; appliquerReglages(); R.B = creerBulles(); R.G = null; R.dernierMid = null; R.vue = { demi: 110, centre: null, decalage: 0 }; R.etatFlux = {}; R.charge = null; R.sauve = 0; R.sauveB = 0; R.palierStocke = null;
    R.dureeMs = await mesurerDuree(); if (!R.actif_ || R.actif !== actif) return false;
    R.stock = creerStockage({ magasin: magasinEff, actif, maintenant });
    try { const c = await R.stock.charger({ dureeMs: R.dureeMs }); R.palierStocke = c.palierStocke; const bons = c.palierStocke ? await R.stock.charger({ dureeMs: R.dureeMs, palier: c.palierStocke }) : c; R.chargeBrut = bons.colonnes.length ? { colonnes: bons.colonnes, bulles: bons.bulles } : null; R.charge = { colonnes: bons.colonnes.length, blocs: bons.blocs }; R.sauve = bons.colonnes.length ? bons.colonnes[bons.colonnes.length - 1].t : 0; R.sauveB = bons.bulles.length ? bons.bulles[bons.bulles.length - 1].t : 0; } catch (e) { R.charge = null; }
    if (!R.actif_ || R.actif !== actif) return false;
    R.flux = demarrerFlux({ actif, surCarnet, surTrade, surEtat: e => { R.etatFlux = e; R.sale = true; }, WS, fetchFn: fetchFn || undefined, maintenant });
    const boucle = () => { R.minuteur = setTimeout(boucle, R.geste && maintenant() - R.geste < 1500 ? 50 : 200); if (document.hidden || racine.hidden) return; if (R.sale || maintenant() - (R.dernierDessin || 0) > 900) { R.dernierDessin = maintenant(); dessiner(); } if (maintenant() - R.tSauve > 30000 || !R.tSauve) { R.tSauve = maintenant(); sauvegarder(); } }; R.tSauve = maintenant(); boucle();
    surChange(); return true;
  }
  function desactiver() {
    if (!R.actif_) return; sauvegarder(true); clearTimeout(R.minuteur); R.minuteur = 0; try { R.flux && R.flux.fermer(); } catch (e) { /* déjà fermé */ } R.flux = null; R.actif_ = false; racine.hidden = true; R.G = null; R.B = null; surChange();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) sauvegarder(true); }); globalThis.addEventListener && globalThis.addEventListener('pagehide', () => sauvegarder(true));

  /* ───── gestes : molette = zoom vertical, glisser = déplacer (prix et temps), double appui = Auto, pincement = zoom vertical ───── */
  const pts = new Map(); let dist0 = 0, demi0 = 0, dernier = null;
  cv.addEventListener('pointerdown', ev => { try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignoré */ } pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); dernier = { x: ev.clientX, y: ev.clientY }; R.geste = maintenant(); if (pts.size === 2) { const [a, b] = [...pts.values()]; dist0 = Math.hypot(a.x - b.x, a.y - b.y); demi0 = R.vue.demi; } });
  cv.addEventListener('pointermove', ev => {
    if (!pts.has(ev.pointerId)) return; pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); R.geste = maintenant(); const g = geo();
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (dist0 > 20) { R.vue.demi = Math.max(8, Math.min(DEMI_FENETRE, demi0 * dist0 / d)); R.sale = true; } return; }
    if (!dernier) return; const dy = ev.clientY - dernier.y, dx = ev.clientX - dernier.x; dernier = { x: ev.clientX, y: ev.clientY };
    const rowPx = g.ph / (2 * R.vue.demi + 1); if (R.vue.centre == null && R.dernierMid != null) R.vue.centre = R.dernierMid / R.palier; if (R.vue.centre != null) R.vue.centre += dy / rowPx;
    R.vue.decalage = Math.max(0, R.vue.decalage + dx / PX_COL * g.pas); R.sale = true;
  });
  const fin = ev => { pts.delete(ev.pointerId); dernier = pts.size === 1 ? [...pts.values()][0] : null; };
  cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
  cv.addEventListener('wheel', ev => { ev.preventDefault(); const f = Math.exp(ev.deltaY * 0.0015); R.vue.demi = Math.max(8, Math.min(DEMI_FENETRE, R.vue.demi * f)); R.geste = maintenant(); R.sale = true; }, { passive: false });
  cv.addEventListener('dblclick', () => { R.vue.centre = null; R.vue.decalage = 0; R.vue.demi = 110; R.sale = true; });
  if (globalThis.ResizeObserver) new ResizeObserver(() => { R.sale = true; }).observe(cv);

  return {
    activer, desactiver, estActif: () => !!R.actif_, racine, dessiner: () => { R.sale = true; dessiner(); },
    regler(o) { Object.assign(R.reglages, o); appliquerReglages(); sauverReglages(); R.sale = true; },
    etat: () => ({ actif: R.actif, enMarche: !!R.actif_, palier: R.palier, colonnes: R.G ? R.G.colonnes().length : 0, couvertureMs: R.G ? R.G.couverture() : 0, bulles: R.B ? R.B.liste().length : 0, bullesAffichees: R.nBulles || 0, seuil: R.seuil || 0, seuilAuto: R.auto || 0, dessins: R.dessins, msDessin: +R.msDessin.toFixed(2), flux: R.flux ? R.flux.etat() : R.etatFlux, mid: R.dernierMid, dureeMs: R.dureeMs, relues: R.charge ? R.charge.colonnes : 0, sauvees: R.nSauve, bullesSauvees: R.nBulleSauve, reglages: { ...R.reglages }, vue: { ...R.vue }, ref: R.ref || 0 }),
    sauvegarder, vue: R.vue, deplacer(o) { Object.assign(R.vue, o); R.sale = true; }
  };
}
