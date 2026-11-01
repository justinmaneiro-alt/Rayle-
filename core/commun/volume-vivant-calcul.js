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
    return { attente: toutes.filter(p => p.statut === 'en_attente'), cours: toutes.filter(p => p.statut === 'ouverte'), finies: toutes.filter(p => p.statut === 'terminee'), annulees: toutes.filter(p => p.statut === 'annulee').length };
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

  /* ── Trades de l'agent Kepler (mode Trader) et portefeuille virtuel PILOTÉ par eux ──
     Tout trade suivi en direct (en attente / ouvert / terminé) est ramené à une forme commune. Le portefeuille virtuel (départ 10 000 $, risque par trade réglable) applique le R de chaque trade TERMINÉ
     au capital du moment (intérêts composés), puis ajoute le résultat FLOTTANT des positions ouvertes au dernier prix connu. Rien n'est inventé : sans trade, le capital reste au départ. */
  const fin = x => typeof x === 'number' && Number.isFinite(x);
  const STATUT = { cloturee: 'terminee', terminee: 'terminee', ouverte: 'ouverte', en_attente: 'en_attente' };
  const typeSortie = (motif, R) => (/objectif|cible|tp|profit/i.test(motif || '') ? 'TP' : /stop|sl|perte/i.test(motif || '') ? 'SL' : (R > 0 ? 'TP' : 'SL'));
  function normaliser(p, actif, source) {
    if (!p || p.fantome || p.demo || p.id == null) return null; const st = STATUT[p.statut]; if (!st) return null;
    const R = fin(p.R) ? p.R : (p.resultat && fin(p.resultat.R) ? p.resultat.R : null); if (st === 'terminee' && (R == null || !fin(p.tSortie))) return null;
    const entree = p.entree, stop = p.stop, cible = fin(p.cible1) ? p.cible1 : p.cible; if (!fin(entree) || !fin(stop) || entree === stop) return null; const sens = Number(p.sens) < 0 ? -1 : 1;
    return { id: p.id, actif: p.actif || actif, tf: p.tf || '', nom: p.nom || p.setup || '', sens, entree, stop, cible: fin(cible) ? cible : null, statut: st, tSignal: p.tSignal || p.t || null, tEntree: p.tEntree || null, tSortie: p.tSortie || null, R, motif: (p.resultat && p.resultat.motif) || p.raisonFin || '', source,
      sortie: st === 'terminee' ? entree + sens * R * Math.abs(entree - stop) : null, type: st === 'terminee' ? typeSortie((p.resultat && p.resultat.motif) || p.raisonFin || '', R) : null };   // prix de sortie déduit du R (exact par définition du R, avant arrondis)
  }
  function tousTrades(vueTrader, vueVolume, actif = null) {
    const vus = new Set(), sortie = [], ajouter = (p, a, src) => { const n = normaliser(p, a, src); if (!n || (actif && n.actif !== actif) || vus.has(n.id)) return; vus.add(n.id); sortie.push(n); };
    if (vueTrader) { for (const p of vueTrader.actives || []) ajouter(p, p.actif, 'trader'); for (const p of vueTrader.recentes || []) ajouter(p, p.actif, 'trader'); }
    if (vueVolume && vueVolume.actifs) for (const [a, x] of Object.entries(vueVolume.actifs)) for (const p of (x && x.positions) || []) ajouter(p, a, 'volume');
    return sortie;
  }
  function dernierPrix(vueTrader, vueVolume, actif) {
    const t = vueTrader && vueTrader.bougies && vueTrader.bougies[actif], d = t && t.length ? t[t.length - 1] : null; if (d && fin(d[4])) return d[4];
    const v = vueVolume && vueVolume.actifs && vueVolume.actifs[actif] && vueVolume.actifs[actif].m15, b = v && v.bougies && v.bougies.length ? v.bougies[v.bougies.length - 1] : null; return b && fin(b[4]) ? b[4] : null;
  }
  function portefeuilleTrades(trades, prix = {}, { capital0 = 10000, risquePct = 1, maintenant = Date.now() } = {}) {
    const finis = trades.filter(t => t.statut === 'terminee').sort((a, b) => a.tSortie - b.tSortie), ouverts = trades.filter(t => t.statut === 'ouverte');
    let cap = capital0, pic = capital0, dd = 0, gagnes = 0, sommeR = 0, semaine = 0; const courbe = [[finis.length ? (finis[0].tEntree || finis[0].tSortie) - 60e3 : maintenant, capital0]];
    for (const t of finis) { const pnl = cap * risquePct / 100 * t.R; cap += pnl; sommeR += t.R; if (t.R > 0) gagnes++; if (t.tSortie >= maintenant - 7 * 86400e3) semaine += pnl; if (cap > pic) pic = cap; dd = Math.max(dd, (pic - cap) / pic); courbe.push([t.tSortie, cap]); }
    let flottant = 0, flottantR = 0; const detailOuverts = [];
    for (const t of ouverts) { const px = prix[t.actif]; if (!fin(px)) continue; const r = t.sens * (px - t.entree) / Math.abs(t.entree - t.stop), usd = cap * risquePct / 100 * r; flottant += usd; flottantR += r; detailOuverts.push({ id: t.id, actif: t.actif, R: r, usd }); }
    const total = cap + flottant; if (ouverts.length) { courbe.push([maintenant, total]); if (total > pic) pic = total; dd = Math.max(dd, (pic - total) / pic); }
    return { source: 'trades', capital0, capital: total, realiseUsd: cap - capital0, flottantUsd: flottant, flottantR, cumulR: sommeR, gainUsd: total - capital0, gainPct: (total / capital0 - 1) * 100, semaineUsd: semaine, nTrades: finis.length, nOuverts: ouverts.length, nEnAttente: trades.filter(t => t.statut === 'en_attente').length,
      tauxReussite: finis.length ? gagnes / finis.length : 0, rMoyen: finis.length ? sommeR / finis.length : 0, drawdownMaxPct: dd * 100, risquePct, courbe, parStrategie: [], detailOuverts };
  }
  /* ── Fenêtre visible du graphique, façon TradingView : position FLOTTANTE (au pixel près, pas de saut de bougie en bougie). `visibles` = largeur en nombre de bougies (réel), `gauche` = indice logique du bord
     gauche (réel ; null = on suit le direct, avec `margeDroite` bougies de vide à droite). Aucune butée arbitraire : on peut sortir des données des deux côtés, la seule règle est qu'il reste au moins
     une bougie à l'écran. Fonctions pures, testées. ── */
  const MIN_VISIBLES = 5, bornes = (x, a, b) => Math.max(a, Math.min(b, x));
  function fenetreLibre(n, visibles, gauche, defaut, margeDroite = 4) {
    const vis = bornes(visibles || defaut, MIN_VISIBLES, Math.max(n * 3, 30)), g0 = n + margeDroite - vis, g = gauche == null ? g0 : bornes(gauche, -(vis - 1), Math.max(0, n - 1));
    return { vis, gauche: g, droite: g + vis, i0: Math.floor(g), i1: Math.ceil(g + vis), live: gauche == null || Math.abs(g - g0) < 0.3 };
  }
  /* Zoom autour d'une ancre (0 = bord gauche, 1 = bord droit) : la bougie sous le curseur reste sous le curseur. facteur > 1 = on dézoome. */
  function zoomLibre({ n, visibles, gauche, facteur, ancre = 1, defaut, margeDroite }) {
    const f = fenetreLibre(n, visibles, gauche, defaut, margeDroite), a = bornes(ancre, 0, 1), idx = f.gauche + a * f.vis, nv = bornes(f.vis * facteur, MIN_VISIBLES, Math.max(n * 3, 30));
    return { visibles: nv, gauche: bornes(idx - a * nv, -(nv - 1), Math.max(0, n - 1)) };
  }
  /* `barres` > 0 : on avance vers le futur ; < 0 : on remonte dans le passé. Revient en mode « direct » quand on retombe sur la position d'origine. */
  function deplacerLibre({ n, visibles, gauche, barres, defaut, margeDroite = 4 }) {
    const f = fenetreLibre(n, visibles, gauche, defaut, margeDroite), g = bornes(f.gauche + barres, -(f.vis - 1), Math.max(0, n - 1)), g0 = n + margeDroite - f.vis;
    return { visibles: f.vis, gauche: gauche != null && Math.abs(g - g0) < 0.15 ? null : g };   // l'aimant du direct ne joue que quand on revient vers lui, jamais quand on en part
  }
  const centrerLibre = ({ n, visibles, idx, defaut }) => { const vis = fenetreLibre(n, visibles, null, defaut).vis; return { visibles: vis, gauche: idx - vis / 2 }; };

  /* ── Tableau d'historique : TOUTES les positions (en attente, ouvertes, terminées) avec résultat en R, gain simulé en $ (capital composé dans l'ordre des sorties), durée, type de clôture TP / SL ; et le résumé
     de ce qui a marché ou non (réussite, R moyen, facteur de profit, meilleur / pire, baisse max, par stratégie et par actif). Aucune valeur inventée : un trade sans R n'a pas de résultat. ── */
  function tableHistorique(trades, { capital0 = 10000, risquePct = 1, prix = {} } = {}) {
    const finis = trades.filter(t => t.statut === 'terminee').sort((a, b) => a.tSortie - b.tSortie), pnl = new Map(); let cap = capital0, pic = capital0, ddR = 0, cum = 0, picR = 0;
    for (const t of finis) { const usd = cap * risquePct / 100 * t.R; cap += usd; pnl.set(t.id, { usd, capApres: cap }); cum += t.R; picR = Math.max(picR, cum); ddR = Math.max(ddR, picR - cum); pic = Math.max(pic, cap); }
    const ligne = t => { const p = pnl.get(t.id), px = prix[t.actif], flott = t.statut === 'ouverte' && fin(px) ? t.sens * (px - t.entree) / Math.abs(t.entree - t.stop) : null;
      return { id: t.id, actif: t.actif, tf: t.tf, sens: t.sens, nom: t.nom, statut: t.statut, tEntree: t.tEntree || t.tSignal || null, tSortie: t.tSortie || null, entree: t.entree, stop: t.stop, cible: t.cible, sortie: t.sortie, R: t.R, flottantR: flott, type: t.type, motif: t.motif, usd: p ? p.usd : (flott != null ? cap * risquePct / 100 * flott : null), capApres: p ? p.capApres : null, dureeMs: t.tSortie && (t.tEntree || t.tSignal) ? t.tSortie - (t.tEntree || t.tSignal) : null, rr: fin(t.cible) ? Math.abs(t.cible - t.entree) / Math.abs(t.entree - t.stop) : null }; };
    const vivants = trades.filter(t => t.statut !== 'terminee').sort((a, b) => (b.tSignal || 0) - (a.tSignal || 0)), lignes = vivants.concat(finis.slice().reverse()).map(ligne);
    const gains = finis.filter(t => t.R > 0), pertes = finis.filter(t => t.R <= 0), sg = a => a.reduce((s, t) => s + t.R, 0), groupe = cle => { const m = new Map(); for (const t of finis) { const k = cle(t) || '—'; const e = m.get(k) || { cle: k, n: 0, gagnes: 0, R: 0 }; e.n++; e.R += t.R; if (t.R > 0) e.gagnes++; m.set(k, e); } return [...m.values()].map(e => ({ ...e, taux: e.gagnes / e.n, rMoyen: e.R / e.n })).sort((a, b) => b.R - a.R); };
    const resume = { n: finis.length, gagnes: gains.length, perdus: pertes.length, taux: finis.length ? gains.length / finis.length : null, cumulR: sg(finis), rMoyen: finis.length ? sg(finis) / finis.length : null, facteurProfit: pertes.length && sg(pertes) < 0 ? sg(gains) / Math.abs(sg(pertes)) : null, meilleur: finis.length ? Math.max(...finis.map(t => t.R)) : null, pire: finis.length ? Math.min(...finis.map(t => t.R)) : null,
      baisseMaxR: ddR, gainUsd: cap - capital0, ouverts: trades.filter(t => t.statut === 'ouverte').length, enAttente: trades.filter(t => t.statut === 'en_attente').length, parNom: groupe(t => t.nom), parActif: groupe(t => t.actif) };
    return { lignes, resume };
  }

  /* Flux d'exécution : ce que l'agent a fait, le plus récent d'abord (signal, entrée touchée, sortie avec son R). */
  function fluxExecution(trades, max = 40) {
    const ev = []; const sens = t => (t.sens > 0 ? 'ACHAT' : 'VENTE') + ' ' + t.actif + (t.tf ? ' ' + t.tf : '');
    for (const t of trades) {
      if (fin(t.tSignal)) ev.push({ t: t.tSignal, type: 'signal', id: t.id, texte: 'Signal ' + sens(t) + ' : ordre limite à ' + prixTexte(t.entree) + ', stop ' + prixTexte(t.stop) + (t.cible != null ? ', objectif ' + prixTexte(t.cible) : '') });
      if (fin(t.tEntree)) ev.push({ t: t.tEntree, type: 'entree', id: t.id, texte: 'Entrée touchée ' + sens(t) + ' à ' + prixTexte(t.entree) });
      if (t.statut === 'terminee') ev.push({ t: t.tSortie, type: 'sortie', id: t.id, gain: t.R > 0, texte: 'Sortie ' + sens(t) + ' : ' + (t.type ? t.type + ' touché · ' : '') + (t.R > 0 ? '✔ ' : '✖ ') + signe(t.R) + ' R' + (t.motif ? ' (' + t.motif + ')' : '') });
    }
    return ev.sort((a, b) => b.t - a.t || (b.type === 'sortie') - (a.type === 'sortie')).slice(0, max);
  }

  /* Carnet d'ordres en échelle (DOM) : la liquidité enregistrée est regroupée par DISTANCE au prix (en %), pas par prix exact. Renvoie les lignes vendeuses (loin en haut), acheteuses (loin en bas),
     la part de chaque ligne par rapport à la plus grosse, et les totaux. `variation` compare une taille à la précédente : +1 elle grossit, −1 elle fond, 0 stable (seuil relatif). */
  function niveauxDom(c, max = 12) {
    if (!c || !c.ok || !Array.isArray(c.echelle) || !c.echelle.length) return null;
    const e = c.echelle.slice(0, max), m = Math.max(1, ...e.map(l => Math.max(l.bidUsd || 0, l.askUsd || 0)));
    const ligne = (l, cote) => { const usd = cote === 'ask' ? l.askUsd || 0 : l.bidUsd || 0; return { cle: cote + l.distancePct, cote, distance: (cote === 'ask' ? '+' : '−') + l.distancePct + ' %', usd, part: Math.min(1, usd / m) }; };
    const asks = e.map(l => ligne(l, 'ask')).reverse(), bids = e.map(l => ligne(l, 'bid')), tb = bids.reduce((s, l) => s + l.usd, 0), ta = asks.reduce((s, l) => s + l.usd, 0);
    return { asks, bids, prix: c.prix, totalBid: tb, totalAsk: ta, partAchat: tb + ta > 0 ? tb / (tb + ta) : 0.5 };
  }
  const variation = (avant, apres, seuil = 0.03) => (avant == null || !(avant > 0) ? (apres > 0 && avant != null ? 1 : 0) : apres > avant * (1 + seuil) ? 1 : apres < avant * (1 - seuil) ? -1 : 0);

  const API = { niveauxDom, variation, normaliser, typeSortie, tousTrades, MIN_VISIBLES, fenetreLibre, zoomLibre, deplacerLibre, centrerLibre, tableHistorique, dernierPrix, portefeuilleTrades, fluxExecution, reglesProp, REGLES_PROP, fr, prixTexte, usd, signe, compact, il, barreEtat, listes, lignePosition, repere, indexTemps, positionsAffichees, decoderHeat, niveauDetail, couches, volumeNetTrace, rejoueTrimestres, courbeJours };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else racine.VolumeVivantCalcul = API;
}(typeof window !== 'undefined' ? window : globalThis));
