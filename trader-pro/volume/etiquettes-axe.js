/* ═════════════ ÉTIQUETTES SUR L'AXE DES PRIX + ZONES (v6, A6) ═════════════
   Règle de lisibilité : pas plus de 2 textes flottants dans la zone des bougies ; toutes les autres étiquettes vont sur l'axe des prix, EMPILÉES sans chevauchement (décalage automatique).
   `empiler` est pur (testé). `creerEtiquettesAxe` et `creerZones` sont des primitives Lightweight Charts v5 (attachPrimitive sur la série de bougies). */

/* positions y (pixels) triées → positions décalées d'au moins `ecart`, dans [min, max]. Ordre conservé. Si ça ne rentre pas, on tasse au mieux. */
export function empiler(ys, ecart = 15, min = 0, max = Infinity) {
  const n = ys.length; if (!n) return []; const idx = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]); const p = idx.map(i => Math.max(min, Math.min(max, ys[i])));
  for (let k = 1; k < n; k++) if (p[k] < p[k - 1] + ecart) p[k] = p[k - 1] + ecart;            // vers le bas
  if (p[n - 1] > max) { p[n - 1] = max; for (let k = n - 2; k >= 0; k--) if (p[k] > p[k + 1] - ecart) p[k] = p[k + 1] - ecart; }   // si ça déborde en bas, on remonte
  if (p[0] < min) { p[0] = min; for (let k = 1; k < n; k++) if (p[k] < p[k - 1] + ecart) p[k] = p[k - 1] + ecart; }
  const out = new Array(n); idx.forEach((i, k) => { out[i] = p[k]; }); return out;
}

/* étiquettes sur l'axe : liste [{ prix, texte, fond, couleur }] ; chaque étiquette est un « price axis view » de la primitive */
export function creerEtiquettesAxe({ ecart = 15 } = {}) {
  let serie = null, demander = null, liste = [], vues = []; const hauteur = () => { try { const h = serie && serie.getPane && serie.getPane().getHeight(); return h > 40 ? h - 8 : 4000; } catch (e) { return 4000; } };
  const rafraichir = () => {
    if (!serie) { vues = []; return; } const pos = liste.map(e => { let y = null; try { y = serie.priceToCoordinate(e.prix); } catch (er) { y = null; } return y; });
    const ok = liste.map((e, i) => i).filter(i => pos[i] != null && Number.isFinite(pos[i])); const ys = empiler(ok.map(i => pos[i]), ecart, 8, hauteur());
    vues = ok.map((i, k) => ({ coordinate: () => ys[k], fixedCoordinate: () => ys[k], text: () => liste[i].texte, textColor: () => liste[i].couleur || '#05080c', backColor: () => liste[i].fond || '#8a9aa4', visible: () => true, tickVisible: () => true }));
  };
  return { attached(p) { serie = p.series; demander = p.requestUpdate; }, detached() { serie = null; demander = null; }, updateAllViews() { rafraichir(); }, priceAxisViews() { return vues; }, paneViews() { return []; },
    set(L) { liste = (L || []).filter(e => e && Number.isFinite(e.prix)); rafraichir(); if (demander) demander(); }, taille: () => liste.length };
}

/* zones : liste [{ bas, haut, fond, bord }] dessinées sur toute la largeur du graphique, SOUS les bougies */
export function creerZones() {
  let serie = null, demander = null, liste = [];
  const o = { attached(p) { serie = p.series; demander = p.requestUpdate; }, detached() { serie = null; demander = null; }, updateAllViews() { /* lu au dessin */ },
    paneViews() { return [{ zOrder: () => 'bottom', renderer: () => ({ draw() { /* fond seulement */ }, drawBackground: cible => cible.useBitmapCoordinateSpace(sc => { if (!serie) return; const c = sc.context, vr = sc.verticalPixelRatio, W = sc.bitmapSize.width;
      for (const z of liste) { let y1 = null, y2 = null; try { y1 = serie.priceToCoordinate(z.haut); y2 = serie.priceToCoordinate(z.bas); } catch (e) { continue; } if (y1 == null || y2 == null) continue; const top = Math.min(y1, y2) * vr, h = Math.max(1, Math.abs(y2 - y1) * vr);
        if (z.fond) { c.fillStyle = z.fond; c.fillRect(0, top, W, h); } if (z.bord) { c.strokeStyle = z.bord; c.lineWidth = Math.max(1, sc.horizontalPixelRatio * 0.8); c.setLineDash(z.tirets ? [4 * sc.horizontalPixelRatio, 4 * sc.horizontalPixelRatio] : []); c.strokeRect(0, top, W, h); c.setLineDash([]); } } }) }) }]; },
    set(L) { liste = (L || []).filter(z => z && Number.isFinite(z.bas) && Number.isFinite(z.haut)); if (demander) demander(); }, taille: () => liste.length };
  return o;
}
