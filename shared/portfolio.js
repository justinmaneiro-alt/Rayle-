/* ═════════════ KEPLER V8 : LE SEUL CALCUL DU PORTEFEUILLE (PC, tablette, téléphone, service, Worker, Telegram) ═════════════
   Module pur, sans dépendance, chargé tel quel par le navigateur (window.KeplerPortefeuille) et par Node (require / createRequire).
   Une seule entrée : le REGISTRE des trades (source de vérité stockée dans le Worker / D1, publiée par le service Kepler) + un prix par actif.
   Une seule sortie : capital, réalisé, flottant, réussite, R moyen, baisse max, objectif, courbe, stats par stratégie et par actif.
   Même registre + même prix = même résultat AU CENTIME sur tous les appareils (test : galaxie/tests/portfolio-v8-test.mjs).
   SIMULATION UNIQUEMENT : aucun ordre réel n'est jamais passé.

   Règles de calcul (choisies une fois, appliquées partout) :
   - capital = 10 000 $ + somme des P&L réalisés (frais inclus) + somme des P&L flottants des positions ouvertes ;
   - P&L réalisé d'un trade = R net (frais et glissement déjà retirés) × risque engagé, le risque engagé étant « capital réalisé du moment × risque % »
     (capital composé dans l'ordre des sorties, arrondi au centime à chaque trade) : la courbe dépend donc du réglage de risque ;
   - P&L flottant = quantité × (prix − entrée) × sens, la quantité étant celle affichée : (capital réalisé × risque %) / |entrée − stop|, arrondie au pas de lot Kraken ;
   - stats = une seule fonction (`stats`), sur une seule période, celle du registre (indiquée dans `periode`). */
(function (racine) {
  'use strict';
  const VERSION_MODULE = 8;
  const CAPITAL_DEPART = 10000, RISQUE_DEFAUT = 1, RISQUE_MIN = 0.1, RISQUE_MAX = 2;
  const ACTIFS = ['BTC', 'ETH', 'SOL', 'HYPE', 'DOGE'];
  /* Format des prix par actif (affichage, axe compris) : BTC 0 décimale, ETH 2, SOL 2, HYPE 3, DOGE 5. */
  const DECIMALES = { BTC: 0, ETH: 2, SOL: 2, HYPE: 3, DOGE: 5 };
  /* Pas de lot Kraken (AssetPairs.lot_decimals = 8 pour les cinq paires, vérifié le 2026-11-03) et quantité minimale (ordermin). */
  const LOT = { BTC: { pas: 1e-8, min: 0.00006 }, ETH: { pas: 1e-8, min: 0.002 }, SOL: { pas: 1e-8, min: 0.05 }, HYPE: { pas: 1e-8, min: 0.06 }, DOGE: { pas: 1e-8, min: 50 } };
  /* Paires Kraken (ticker public, CORS ouvert) : la même source de prix pour tous les écrans. */
  const KRAKEN = { BTC: 'XBTUSD', ETH: 'ETHUSD', SOL: 'SOLUSD', HYPE: 'HYPEUSD', DOGE: 'XDGUSD' };
  const KRAKEN_CLE = { XXBTZUSD: 'BTC', XBTUSD: 'BTC', XETHZUSD: 'ETH', ETHUSD: 'ETH', SOLUSD: 'SOL', HYPEUSD: 'HYPE', XDGUSD: 'DOGE', XXDGZUSD: 'DOGE' };
  const HISTORIQUE_COURT = { HYPE: 'Historique de HYPE court (cotation Binance depuis le 24/09/2026, Kraken depuis janvier 2026) : les statistiques sur HYPE sont peu fiables.' };
  const OBJECTIF = { objectifPct: 10, baisseMaxPct: 6 };
  const STATUTS = ['en_attente', 'ouverte', 'cloturee', 'annulee', 'ignoree'];
  const LIBELLE_STATUT = { en_attente: 'en attente', ouverte: 'ouverte', cloturee: 'clôturée', annulee: 'annulée', ignoree: 'ignorée' };

  const fin = x => typeof x === 'number' && Number.isFinite(x);
  const c2 = x => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100;   // arrondi au centime, identique partout
  const bornerRisque = r => { const x = Number(r); return fin(x) && x > 0 ? Math.min(RISQUE_MAX, Math.max(RISQUE_MIN, x)) : RISQUE_DEFAUT; };

  /* ── Nombres à la française, sans dépendre de l'ICU du navigateur ou de Node (même texte partout) ── */
  const ESP = ' ';   // espace fine insécable (séparateur des milliers en français)
  function nombre(x, d = 2) {
    if (!fin(x)) return '—';
    const neg = x < 0, a = Math.abs(x), s = a.toFixed(d), [ent, dec] = s.split('.');
    const groupes = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ESP);
    const txt = groupes + (dec ? ',' + dec : '');
    return (neg && Number(s) !== 0 ? '−' : '') + txt;
  }
  const decimalesDe = (actif, x) => (DECIMALES[actif] != null ? DECIMALES[actif] : !fin(x) ? 2 : Math.abs(x) >= 1000 ? 0 : Math.abs(x) >= 10 ? 2 : Math.abs(x) >= 1 ? 3 : 5);
  const prix = (actif, x) => nombre(x, decimalesDe(actif, x));
  const usd = (x, d = 2) => (fin(x) ? nombre(x, d) + ' $' : '—');
  const signe = (x, d = 2) => (fin(x) ? (Number(x.toFixed(d)) >= 0 ? '+' : '−') + nombre(Math.abs(x), d) : '—');
  const signeUsd = (x, d = 2) => (fin(x) ? signe(x, d) + ' $' : '—');
  /* Graduations « rondes » d'un axe de prix, sans doublon une fois formatées (corrige les prix répétés sur l'axe Y). */
  function graduations(actif, min, max, cible = 5) {
    if (!(max > min)) return [];
    const brut = (max - min) / cible, p10 = Math.pow(10, Math.floor(Math.log10(brut))), k = brut / p10, pasR = (k < 1.5 ? 1 : k < 3 ? 2 : k < 7 ? 5 : 10) * p10, d = DECIMALES[actif];
    const pasMin = d != null ? Math.pow(10, -d) : 0, pas = Math.max(pasR, pasMin), out = [], vus = new Set();
    for (let v = Math.ceil(min / pas) * pas; v <= max + pas * 1e-9; v += pas) { const t = prix(actif, v); if (vus.has(t)) continue; vus.add(t); out.push({ v, texte: t }); }
    return out;
  }

  /* ── Taille de position ── */
  function taille({ actif, capital, risquePct, entree, stop, tp = null }) {
    const ecart = Math.abs(entree - stop), lot = LOT[actif] || { pas: 1e-8, min: 0 };
    if (!fin(capital) || !fin(entree) || !fin(stop) || !(ecart > 0)) return null;
    const brut = (capital * bornerRisque(risquePct) / 100) / ecart, quantite = Math.floor(brut / lot.pas + 1e-6) * lot.pas;
    const q = Number(quantite.toFixed(8)), risqueUsd = c2(q * ecart), gainVise = fin(tp) ? c2(q * Math.abs(tp - entree)) : null;
    return { quantite: q, notionnel: c2(q * entree), risqueUsd, gainVise, rr: fin(tp) ? Math.abs(tp - entree) / ecart : null, sousMinimum: q < lot.min, pasLot: lot.pas };
  }
  /* Quantité lisible (moins de décimales pour les gros volumes). */
  function quantiteTexte(actif, q) { if (!fin(q)) return '—'; const d = q >= 1000 ? 0 : q >= 10 ? 2 : q >= 1 ? 4 : 6; return nombre(q, d) + ' ' + actif; }

  /* ── Libellé de sortie : TP, SL, « Stop suiveur (gain) », expiration, sortie au temps ── */
  function raisonSortie(motif, R) {
    const m = String(motif || '').toLowerCase();
    if (/expir/.test(m)) return 'expiration';
    if (/temps|durée/.test(m)) return 'temps';
    if (/cible|objectif|\btp\b|profit/.test(m)) return 'tp';
    if (/suiveur|remont|entrée touch|break|trail/.test(m)) return fin(R) && R > 0 ? 'stop_suiveur_gain' : 'sl';
    if (/stop|\bsl\b|perte/.test(m)) return fin(R) && R > 0.05 ? 'stop_suiveur_gain' : 'sl';
    return fin(R) ? (R > 0 ? 'tp' : 'sl') : null;
  }
  const LIBELLE_SORTIE = { tp: 'TP', sl: 'SL', stop_suiveur_gain: 'Stop suiveur (gain)', expiration: 'Expiration', temps: 'Sortie au temps' };
  const libelleSortie = r => LIBELLE_SORTIE[r] || '—';

  /* ── Normalisation d'une ligne du registre (tolère les anciens champs) ── */
  function normaliser(x) {
    if (!x || x.id == null) return null; const statut = STATUTS.includes(x.statut) ? x.statut : null; if (!statut) return null;
    const entree = +x.entree, stop = +x.stop; if (!fin(entree) || !fin(stop) || entree === stop) return null;
    const R = fin(x.R) ? x.R : null, sens = Number(x.sens) < 0 ? -1 : 1, tp = fin(x.tp) ? x.tp : null;
    if (statut === 'cloturee' && (R == null || !fin(x.tSortie))) return null;
    const raison = x.raison || (statut === 'cloturee' ? raisonSortie(x.motif, R) : null);
    return { id: String(x.id), actif: String(x.actif), sens, strategie: x.strategie || '—', tf: x.tf || 'M15', contexte: x.contexte || null, ancienFormat: !!x.ancienFormat,
      tSignal: fin(x.tSignal) ? x.tSignal : null, tEntree: fin(x.tEntree) ? x.tEntree : null, tValide: fin(x.tValide) ? x.tValide : null, entree, stop, tp, statut,
      tSortie: fin(x.tSortie) ? x.tSortie : null, sortie: fin(x.sortie) ? x.sortie : (statut === 'cloturee' ? entree + sens * R * Math.abs(entree - stop) : null), raison, motif: x.motif || '',
      fraisR: fin(x.fraisR) ? x.fraisR : null, R, source: x.source || '', note: x.note || '' };
  }
  const trier = (l, k) => l.slice().sort((a, b) => (a[k] || 0) - (b[k] || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  /* ── Stats : UNE fonction pour tout (verdict, tableaux, réglages, Telegram) ── */
  function stats(trades) {
    const l = trades.filter(t => t.statut === 'cloturee' && fin(t.R)), n = l.length, Rs = l.map(t => t.R), somme = Rs.reduce((a, b) => a + b, 0), moy = n ? somme / n : null;
    const v = n > 1 ? Rs.reduce((a, b) => a + (b - moy) * (b - moy), 0) / (n - 1) : null, e = v != null ? 1.96 * Math.sqrt(v / n) : null;
    let cum = 0, pic = 0, dd = 0; for (const t of trier(l, 'tSortie')) { cum += t.R; pic = Math.max(pic, cum); dd = Math.max(dd, pic - cum); }
    const g = Rs.filter(r => r > 0), p = Rs.filter(r => r <= 0), sp = p.reduce((a, b) => a + b, 0);
    return { n, gagnes: g.length, perdus: p.length, taux: n ? g.length / n : null, rMoyen: moy, cumulR: somme, ic95: e != null ? [moy - e, moy + e] : null, baisseMaxR: dd,
      facteurProfit: sp < 0 ? g.reduce((a, b) => a + b, 0) / Math.abs(sp) : null, meilleur: n ? Math.max(...Rs) : null, pire: n ? Math.min(...Rs) : null,
      prouve: !!(e != null && n >= 30 && moy - e > 0) };
  }
  const grouper = (trades, cle) => { const m = new Map(); for (const t of trades) { const k = cle(t) || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(t); } return [...m.entries()].map(([k, l]) => ({ cle: k, ...stats(l) })).filter(x => x.n).sort((a, b) => b.cumulR - a.cumulR); };

  /* ── Numérotation #1, #2… des positions vivantes d'un même actif (même sens : les sens opposés sont interdits) ── */
  function numeroter(trades) {
    const num = {}, parActif = {};
    for (const t of trier(trades.filter(x => x.statut === 'ouverte' || x.statut === 'en_attente'), 'tSignal')) { parActif[t.actif] = (parActif[t.actif] || 0) + 1; num[t.id] = parActif[t.actif]; }
    return num;
  }
  /* Signal de sens opposé à une position vivante du même actif ? (règle : jamais deux sens sur un actif) */
  function conflitInverse(trades, { actif, sens }) { return trades.find(t => t.actif === actif && (t.statut === 'ouverte' || t.statut === 'en_attente') && Math.sign(t.sens) !== Math.sign(sens)) || null; }

  /* ── LE calcul : registre + prix → portefeuille complet ── */
  function calculer(registre, prixParActif = {}, { maintenant = Date.now(), filtre = null, capital0 = CAPITAL_DEPART } = {}) {
    const reg = registre || {}, risquePct = bornerRisque(reg.risquePct), tous = (reg.trades || []).map(normaliser).filter(Boolean), trades = filtre ? tous.filter(filtre) : tous;
    const clos = trier(trades.filter(t => t.statut === 'cloturee'), 'tSortie'), ouverts = trier(trades.filter(t => t.statut === 'ouverte'), 'tEntree'), attente = trier(trades.filter(t => t.statut === 'en_attente'), 'tSignal');
    let cap = capital0, pic = capital0, ddPct = 0, frais = 0; const pnl = {}, courbe = [[clos.length ? (clos[0].tEntree || clos[0].tSortie) - 60e3 : (reg.debut || maintenant), capital0]];
    for (const t of clos) { const risqueUsd = c2(cap * risquePct / 100), p = c2(t.R * risqueUsd); cap = c2(cap + p); if (t.fraisR != null) frais = c2(frais + t.fraisR * risqueUsd); pnl[t.id] = { usd: p, risqueUsd, capApres: cap }; pic = Math.max(pic, cap); ddPct = Math.max(ddPct, (pic - cap) / pic * 100); courbe.push([t.tSortie, cap]); }
    const realise = cap, num = numeroter(trades), lignesVivantes = [];
    let flottant = 0, flottantR = 0, prixT = null;
    for (const t of ouverts.concat(attente)) {
      const tl = taille({ actif: t.actif, capital: realise, risquePct, entree: t.entree, stop: t.stop, tp: t.tp }), px = prixParActif[t.actif], pxv = fin(px) ? px : null;
      let fR = null, fUsd = null; if (t.statut === 'ouverte' && pxv != null && tl) { fR = t.sens * (pxv - t.entree) / Math.abs(t.entree - t.stop); fUsd = c2(tl.quantite * (pxv - t.entree) * t.sens); flottant = c2(flottant + fUsd); flottantR += fR; }
      lignesVivantes.push({ ...t, numero: num[t.id] || 1, taille: tl, prix: pxv, flottantR: fR, flottantUsd: fUsd });
    }
    const capital = c2(realise + flottant); pic = Math.max(pic, capital); ddPct = Math.max(ddPct, (pic - capital) / pic * 100);
    if (ouverts.length) courbe.push([maintenant, capital]);
    const risqueParActif = {}; for (const l of lignesVivantes) if (l.taille) { const r = (risqueParActif[l.actif] = risqueParActif[l.actif] || { usd: 0, ouvertes: 0, enAttente: 0, sens: l.sens }); r.usd = c2(r.usd + l.taille.risqueUsd); if (l.statut === 'ouverte') r.ouvertes++; else r.enAttente++; }
    const s = stats(trades), semaine = clos.filter(t => t.tSortie >= maintenant - 7 * 86400e3).reduce((a, t) => c2(a + pnl[t.id].usd), 0);
    const gainPct = (capital / capital0 - 1) * 100, periode = { de: clos.length ? clos[0].tSortie : null, a: clos.length ? clos[clos.length - 1].tSortie : null, texte: clos.length ? 'depuis le début du registre (' + dateCourte(clos[0].tEntree || clos[0].tSortie) + ')' : 'aucun trade clôturé' };
    return { v: VERSION_MODULE, version: reg.version != null ? reg.version : null, t: maintenant, risquePct, capital0, capital, capitalRealise: realise, realiseUsd: c2(realise - capital0), flottantUsd: flottant, flottantR, gainUsd: c2(capital - capital0), gainPct, semaineUsd: semaine, fraisUsd: frais,
      nClos: clos.length, nOuverts: ouverts.length, nEnAttente: attente.length, nAnnules: trades.filter(t => t.statut === 'annulee').length, nIgnores: trades.filter(t => t.statut === 'ignoree').length,
      stats: s, tauxReussite: s.taux, rMoyen: s.rMoyen, cumulR: s.cumulR, baisseMaxPct: ddPct, objectif: { ...OBJECTIF, gainPct, atteint: gainPct >= OBJECTIF.objectifPct, baisseDepassee: ddPct >= OBJECTIF.baisseMaxPct, part: Math.max(0, Math.min(1, gainPct / OBJECTIF.objectifPct)), partBaisse: Math.max(0, Math.min(1, ddPct / OBJECTIF.baisseMaxPct)) },
      courbe, periode, parStrategie: grouper(trades, t => t.strategie), parActif: grouper(trades, t => t.actif), vivantes: lignesVivantes, risqueParActif, pnl, numeros: num, trades };
  }
  /* Courbe rejouée à un autre risque (aperçu dans les réglages) : même calcul, risque changé. */
  const rejouer = (registre, risquePct, opts) => calculer({ ...registre, risquePct }, {}, opts).courbe;

  /* ── Étiquettes et textes communs (graphique, fiche « À copier », notifications) ── */
  const sensTexte = s => (s > 0 ? 'ACHAT' : 'VENTE');
  const heure = t => (fin(t) ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '—');
  function dateCourte(t) { if (!fin(t)) return '—'; const d = new Date(t + 0), f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); return f.format(d).replace(',', ''); }
  function etiquetteVivante(l) { return '#' + l.numero + ' ' + sensTexte(l.sens) + (l.statut === 'en_attente' ? ' · en attente' : ' · ' + (l.flottantR == null ? '—' : signe(l.flottantR, 2) + ' R') + ' · ' + (l.flottantUsd == null ? '—' : signeUsd(l.flottantUsd))); }
  /* Fiche « À COPIER » : les valeurs à recopier chez le courtier, dans l'ordre. */
  function ficheCopie(l) {
    const tl = l.taille || {}, q = tl.quantite;
    return { titre: sensTexte(l.sens) + ' ' + l.actif, sens: l.sens, actif: l.actif, numero: l.numero, quantite: quantiteTexte(l.actif, q), quantiteBrute: q, notionnel: usd(tl.notionnel), entree: prix(l.actif, l.entree), stop: prix(l.actif, l.stop), objectif: l.tp != null ? prix(l.actif, l.tp) : '—',
      risque: usd(tl.risqueUsd), gainVise: tl.gainVise != null ? usd(tl.gainVise) : '—', rr: tl.rr != null ? '1:' + nombre(tl.rr, 1) : '—', validite: l.statut === 'en_attente' && l.tValide ? 'valable jusqu’à ' + heure(l.tValide) : null, statut: l.statut, ancienFormat: l.ancienFormat,
      texte: [sensTexte(l.sens) + ' ' + l.actif, 'Quantité : ' + quantiteTexte(l.actif, q), 'Entrée : ' + prix(l.actif, l.entree), 'Stop : ' + prix(l.actif, l.stop), 'Objectif : ' + (l.tp != null ? prix(l.actif, l.tp) : '—')].join('\n') };
  }
  /* Message Telegram, lisible d'un coup d'œil (proposition, entrée touchée, sortie). */
  function messageTelegram(type, l, { raisonTexte = '' } = {}) {
    const tl = l.taille || {}, rond = l.sens > 0 ? '🟢' : '🔴', q = quantiteTexte(l.actif, tl.quantite) + ' (≈ ' + nombre(tl.notionnel, 0) + ' $)', L = [];
    if (type === 'proposition') {
      L.push(rond + ' ' + sensTexte(l.sens) + ' ' + l.actif + ' · M15' + (l.numero > 1 ? ' · #' + l.numero : ''), 'Quantité : ' + q, 'Entrée : ' + prix(l.actif, l.entree), 'Stop : ' + prix(l.actif, l.stop) + ' (−' + nombre(tl.risqueUsd, 0) + ' $)');
      if (l.tp != null) L.push('Objectif : ' + prix(l.actif, l.tp) + ' (+' + nombre(tl.gainVise, 0) + ' $)');
      L.push('R:R 1:' + nombre(tl.rr, 1) + (l.tValide ? ' · valable jusqu’à ' + heure(l.tValide) : ''));
      if (raisonTexte) L.push('Raison : ' + raisonTexte);
    } else if (type === 'entree') {
      L.push('✅ ENTRÉE TOUCHÉE · ' + sensTexte(l.sens) + ' ' + l.actif + (l.numero > 1 ? ' #' + l.numero : '') + ' · ' + heure(l.tEntree), 'Quantité : ' + q, 'Entrée : ' + prix(l.actif, l.entree), 'Stop : ' + prix(l.actif, l.stop) + (l.tp != null ? ' · Objectif : ' + prix(l.actif, l.tp) : ''));
    } else {
      const R = l.R, usdR = l.pnlUsd, ok = R > 0;
      L.push((ok ? '💰' : '🛑') + ' SORTIE · ' + sensTexte(l.sens) + ' ' + l.actif + (l.numero > 1 ? ' #' + l.numero : '') + ' · ' + libelleSortie(l.raison) + ' · ' + heure(l.tSortie), 'Sortie : ' + prix(l.actif, l.sortie) + ' (entrée ' + prix(l.actif, l.entree) + ')', 'Résultat : ' + signe(R, 2) + ' R · ' + signeUsd(usdR));
    }
    L.push('Simulation, aucun ordre réel.');
    return L.join('\n');
  }

  /* ── Prix Kraken (ticker public) : même source et même lecture sur tous les écrans ── */
  const urlPrixKraken = (actifs = ACTIFS) => 'https://api.kraken.com/0/public/Ticker?pair=' + actifs.map(a => KRAKEN[a]).filter(Boolean).join(',');
  function lirePrixKraken(j) { const o = {}; if (!j || !j.result) return o; for (const [k, v] of Object.entries(j.result)) { const a = KRAKEN_CLE[k]; const x = v && v.c ? parseFloat(v.c[0]) : NaN; if (a && Number.isFinite(x) && x > 0) o[a] = x; } return o; }

  /* Empreinte courte (version du registre) : FNV-1a sur le JSON des trades. */
  function empreinte(texte) { let h = 0x811c9dc5; for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }

  const API = { VERSION_MODULE, CAPITAL_DEPART, RISQUE_DEFAUT, RISQUE_MIN, RISQUE_MAX, ACTIFS, DECIMALES, LOT, KRAKEN, HISTORIQUE_COURT, OBJECTIF, STATUTS, LIBELLE_STATUT, LIBELLE_SORTIE,
    c2, bornerRisque, nombre, prix, usd, signe, signeUsd, graduations, taille, quantiteTexte, raisonSortie, libelleSortie, normaliser, stats, grouper, numeroter, conflitInverse, calculer, rejouer,
    sensTexte, heure, dateCourte, etiquetteVivante, ficheCopie, messageTelegram, urlPrixKraken, lirePrixKraken, empreinte };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else racine.KeplerPortefeuille = API;
}(typeof window !== 'undefined' ? window : globalThis));
