/* ═════════════ TABLEAU VIVANT V14 : calculs purs de l'affichage (testés : galaxie/tests/volume-vivant-test.mjs) ═════════════
   Aucune valeur inventée : tout ce qui est affiché vient de la vue publiée par le service (volume-v14.json) ; ce qui manque est DIT. */
(function (racine) {
  const fr = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const prixTexte = p => (p == null ? '—' : p >= 1000 ? fr(p, 0) : p >= 10 ? fr(p, 2) : fr(p, 4));
  const usd = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : (x < 0 ? '−' : '') + fr(Math.abs(x), d) + ' $');
  const signe = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '−') + fr(Math.abs(x), d));
  const compact = x => { const a = Math.abs(x); const s = a >= 1e9 ? fr(a / 1e9, 1) + ' G' : a >= 1e6 ? fr(a / 1e6, 1) + ' M' : a >= 1e3 ? fr(a / 1e3, 0) + ' k' : fr(a, 0); return (x < 0 ? '−' : '') + s; };
  function il(t, maintenant) { if (!t) return '—'; const s = Math.max(0, Math.round((maintenant - t) / 1000)); return s < 90 ? s + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : s < 172800 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' j'; }

  /* Barre d'état : service, dernière bougie, carnet enregistré, rappel « simulation ». */
  function barreEtat(vue, service, maintenant) {
    const enMarche = service ? !!service.enMarche : null, bougies = Object.values(vue.derniereBarre || {}), derniere = bougies.length ? Math.max(...bougies) : null;
    return { service: enMarche == null ? 'service : état inconnu' : enMarche ? 'Service Kepler en marche' : 'Service arrêté (données d’il y a ' + il(vue.t, maintenant) + ')', serviceOk: enMarche !== false, bougie: derniere ? 'dernière bougie il y a ' + il(derniere, maintenant) : 'aucune bougie',
      carnet: vue.carnetJours != null ? 'carnet enregistré depuis ' + fr(vue.carnetJours, 1) + ' j' : 'carnet non enregistré', simulation: 'simulation, aucun ordre réel' };
  }
  /* Classe les positions suivies en direct : en attente / en cours / terminées (les plus récentes d'abord). */
  function listes(vue, actif = null) {
    const toutes = []; for (const [a, x] of Object.entries(vue.actifs || {})) { if (actif && a !== actif) continue; for (const p of x.positions || []) toutes.push({ ...p, actif: a }); }
    toutes.sort((p, q) => (q.tSignal || 0) - (p.tSignal || 0));
    return { attente: toutes.filter(p => p.statut === 'en_attente'), cours: toutes.filter(p => p.statut === 'ouverte'), finies: toutes.filter(p => p.statut === 'terminee').slice(0, 30), annulees: toutes.filter(p => p.statut === 'annulee').length };
  }
  /* Phrase en français pour une position (une ligne, explication au clic). */
  function lignePosition(p) {
    const sens = p.sens > 0 ? 'Achat' : 'Vente', base = sens + ' ' + p.actif + ' ' + p.tf + ' à ' + prixTexte(p.entree) + ' · stop ' + prixTexte(p.stop) + ' · objectif ' + prixTexte(p.cible);
    if (p.statut === 'terminee') return { texte: base + ' · ' + (p.R > 0 ? '✔' : '✖') + ' ' + signe(p.R) + ' R', gagnant: p.R > 0 };
    return { texte: base, gagnant: null };
  }
  /* Découpe en unités l'échelle de prix et convertit en coordonnées : renvoie des fonctions x(i), y(prix). */
  function repere({ n, largeur, hauteur, marge, hauts, bas, rempli = 0.04, droite = 0 }) {
    const lo = Math.min(...bas), hi = Math.max(...hauts), pad = (hi - lo) * rempli || hi * 0.001, min = lo - pad, max = hi + pad, W = largeur - marge.g - marge.d - droite, H = hauteur - marge.h - marge.b, pas = W / Math.max(1, n);
    return { min, max, W, H, pas, x: i => marge.g + (i + 0.5) * pas, y: p => marge.h + (1 - (p - min) / (max - min)) * H, bas: marge.h + H };
  }
  const indexTemps = (ts, t) => { let lo = 0, hi = ts.length - 1; if (!ts.length || t < ts[0][0]) return -1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (ts[k][0] <= t) lo = k; else hi = k - 1; } return lo; };
  /* Zones d'une position sur le graphique : au plus 3 par actif (en attente / en cours d'abord, puis la dernière terminée). */
  function positionsAffichees(positions, max = 3) {
    const vivantes = positions.filter(p => p.statut === 'en_attente' || p.statut === 'ouverte'), finies = positions.filter(p => p.statut === 'terminee').slice(-1);
    return vivantes.concat(finies).slice(-max);
  }
  /* Heatmap : décode la chaîne de chiffres (0..9) en matrice et renvoie les cellules d'une colonne. */
  function decoderHeat(h) { if (!h || !h.data) return null; return { ...h, val: (i, j) => { const c = h.data.charCodeAt(i * h.nPrix + j) - 48; return c > 0 ? c / 9 : 0; } }; }
  /* Niveaux de détail : l'écran mobile ou le mode léger allège (moins de colonnes de heatmap, empreinte seulement au zoom). */
  function niveauDetail({ largeur, leger = false }) { return leger || largeur < 520 ? { heatPas: 2, footprint: false, animations: false } : { heatPas: 1, footprint: true, animations: true }; }
  function couches(preset) { return preset === 'epure' ? { heat: false, profil: true, footprint: false, positions: true, rejoue: false, murs: false } : { heat: true, profil: true, footprint: true, positions: true, rejoue: true, murs: true }; }

  /* Volume net : barres signées + CVD, normalisés pour le tracé ; renvoie aussi la phrase du service. */
  function volumeNetTrace(bougies, cvd) {
    const d = bougies.map(b => b[5] - b[6]), maxAbs = Math.max(1, ...d.map(Math.abs)), c = cvd || [], cmin = c.length ? Math.min(...c) : 0, cmax = c.length ? Math.max(...c) : 1;
    return { barres: d.map(x => x / maxAbs), cvd: c.map(x => (cmax === cmin ? 0.5 : (x - cmin) / (cmax - cmin))) };
  }
  function rejoueTrimestres(r) { if (!r || !r.configs) return []; return r.configs.map(c => ({ cle: c.cle, n: c.stats.n, rMoyen: c.stats.rMoyen, tauxReussite: c.stats.tauxReussite, ic95: c.stats.ic95, drawdownR: c.stats.drawdownR, trimestres: c.stats.trimestres, parActif: c.parActif })); }
  /* Courbe de capital normalisée "jours depuis le début" pour comparer live et rejoué. */
  function courbeJours(courbe, t0 = null) { if (!courbe || !courbe.length) return []; const d0 = t0 != null ? t0 : courbe[0][0]; return courbe.map(([t, c]) => [(t - d0) / 86400e3, c]); }

  /* Règles prop SIMULÉES (défauts prudents de CLAUDE.md, réglables) : objectif de gain, baisse maximale tolérée, risque par trade. Jamais un verdict réel : le contrat du courtier reste à vérifier. */
  const REGLES_PROP = { objectifPct: 10, drawdownPct: 6, risqueMaxPct: 1 };
  function reglesProp(p, r = REGLES_PROP) { if (!p) return null; const gain = Number(p.gainPct) || 0, dd = Number(p.drawdownMaxPct) || 0, k = (v, m) => Math.max(0, Math.min(1, v / m));
    return { objectif: { valeur: gain, limite: r.objectifPct, part: k(gain, r.objectifPct), atteint: gain >= r.objectifPct }, drawdown: { valeur: dd, limite: r.drawdownPct, part: k(dd, r.drawdownPct), depasse: dd >= r.drawdownPct }, risque: { valeur: Number(p.risquePct) || 0, limite: r.risqueMaxPct, depasse: (Number(p.risquePct) || 0) > r.risqueMaxPct } }; }

  /* Noyau 3D de l'agent : points sur une sphère (spirale de Fibonacci), rotation et projection en perspective. Humeur d'après l'état RÉEL (jamais décorative). */
  function pointsSphere(n) { const r = []; for (let i = 0; i < n; i++) { const y = 1 - 2 * (i + .5) / n, rr = Math.sqrt(1 - y * y), a = i * 2.399963; r.push([Math.cos(a) * rr, y, Math.sin(a) * rr]); } return r; }
  function projeter(pts, ax, ay, rayon, cx, cy) { const ca = Math.cos(ay), sa = Math.sin(ay), cb = Math.cos(ax), sb = Math.sin(ax); return pts.map(([x, y, z]) => { const x1 = x * ca + z * sa, z1 = -x * sa + z * ca, y1 = y * cb - z1 * sb, z2 = y * sb + z1 * cb, f = 1 / (1.8 - z2 * .5); return { x: cx + x1 * rayon * f * 1.4, y: cy + y1 * rayon * f * 1.4, z: z2, f }; }); }
  function humeurNoyau(vue, service, actif = null) { if (!vue) return { id: 'attente', texte: 'En attente des données', couleur: '#7d8c95', vitesse: .2 }; if (service && service.enMarche === false) return { id: 'arret', texte: 'Service arrêté', couleur: '#7d8c95', vitesse: .15 };
    const l = listes(vue, actif), n = l.cours.length; if (n) { const s = l.cours[0].sens; return { id: 'position', texte: n + ' position' + (n > 1 ? 's' : '') + ' en cours', couleur: s > 0 ? '#3ecf8e' : '#ef5b5b', vitesse: 1 }; }
    if (l.attente.length) return { id: 'preparation', texte: l.attente.length + ' en préparation', couleur: '#c9b27a', vitesse: .7 }; return { id: 'veille', texte: 'Surveille le marché', couleur: '#8fd0e3', vitesse: .45 }; }

  const API = { pointsSphere, projeter, humeurNoyau, reglesProp, REGLES_PROP, fr, prixTexte, usd, signe, compact, il, barreEtat, listes, lignePosition, repere, indexTemps, positionsAffichees, decoderHeat, niveauDetail, couches, volumeNetTrace, rejoueTrimestres, courbeJours };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else racine.VolumeVivantCalcul = API;
}(typeof window !== 'undefined' ? window : globalThis));
