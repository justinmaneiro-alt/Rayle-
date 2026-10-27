import { atr, bollinger, ema, macd, niveauxCles, profilVolume, rsi, sma, vwap } from '../trading/indicateurs.js';
import { volumeNet } from '../trading/dashboard.js';

/* ═════════════ « CHART STATE API » : l'agent LIT tout le graphique (M6 ; module pur, testé : planetes/mars/tests/m6-graphique-test.mjs) ═════════════
   Rend, pour une période visible : chaque bougie, la valeur de chaque indicateur à chaque bougie (MA, EMA, RSI, MACD, Bollinger, ATR, VWAP, volume, volume net, delta, CVD, score), les niveaux
   (supports / résistances, profil de volume : POC et zone de valeur), les dessins (ceux de l'agent ET les tiens), l'unité de temps et la période. Tout est causal : la valeur d'un indicateur à la
   bougie i ne dépend que des bougies 0..i (testé par le poison du futur). Les supports / résistances et le profil de volume « à la bougie i » se calculent sur le passé SEUL (niveauxA, profilA).
   Les indicateurs reprennent les calculs du dashboard de l'ancien terminal (tendance contre l'EMA 200, RSI 14, volume net sur 20 bougies, supports / résistances, score 0-100) : ce sont ceux de ton
   Pine Script d'origine tels qu'ils avaient été portés (le script lui-même n'est pas dans le dépôt : si une formule diffère, donne-le et je l'aligne). Valeur absente (recul insuffisant) = null, jamais 0. */
export const CATALOGUE_INDICATEURS = Object.freeze({
  ma:       { nom: 'Moyenne mobile simple', defaut: { periode: 200 }, panneau: 'prix' },
  ema:      { nom: 'Moyenne mobile exponentielle', defaut: { periode: 200 }, panneau: 'prix' },
  rsi:      { nom: 'RSI', defaut: { periode: 14 }, panneau: 'bas' },
  macd:     { nom: 'MACD', defaut: { rapide: 12, lent: 26, signal: 9 }, panneau: 'bas' },
  bollinger:{ nom: 'Bandes de Bollinger', defaut: { periode: 20, k: 2 }, panneau: 'prix' },
  atr:      { nom: 'ATR', defaut: { periode: 14 }, panneau: 'bas' },
  vwap:     { nom: 'VWAP du jour (UTC)', defaut: {}, panneau: 'prix' },
  volume:   { nom: 'Volume', defaut: {}, panneau: 'bas' },
  volume_net: { nom: 'Volume net (20 bougies, en dollars)', defaut: { fenetre: 20 }, panneau: 'bas' },
  delta:    { nom: 'Delta (acheteurs − vendeurs)', defaut: {}, panneau: 'bas' },
  cvd:      { nom: 'Delta cumulé (CVD)', defaut: {}, panneau: 'bas' },
  score:    { nom: 'Score 0-100 (tendance, RSI, volume net)', defaut: {}, panneau: 'bas' }
});

/* « ma200 », « ema50 », « rsi14 », « atr14 », « macd », « bollinger », « bollinger20 », « ma:200 »… → { id, type, params } ou null. */
export function parserIndicateur(entree) {
  if (entree && typeof entree === 'object') { const type = entree.type || entree.id; return CATALOGUE_INDICATEURS[type] ? { id: entree.id || type + (entree.params && entree.params.periode ? entree.params.periode : ''), type, params: { ...CATALOGUE_INDICATEURS[type].defaut, ...(entree.params || {}) } } : null; }
  const s = String(entree || '').toLowerCase().trim().replace(/[\s_-]+/g, '_').replace('volumenet', 'volume_net');
  const m = s.match(/^(ma|ema|rsi|atr|bollinger|macd|vwap|volume_net|volume|delta|cvd|score)(?::|_)?(\d+)?$/); if (!m) return null;
  const type = m[1], cat = CATALOGUE_INDICATEURS[type], params = { ...cat.defaut }, n = m[2] ? Number(m[2]) : null;
  if (n != null) { if (n < 2 || n > 1000) return null; if ('periode' in params) params.periode = n; else if (type === 'volume_net') params.fenetre = n; }
  return { id: type + (n != null ? n : (('periode' in cat.defaut) ? cat.defaut.periode : '')), type, params };
}

const close = b => b.map(x => x.c);
const ouNul = a => a.map(x => (x == null || !Number.isFinite(x) ? null : x));

/* Score 0-100 PAR BOUGIE : même formule que dashboard.js (colonne) à chaque bougie, pour l'unité de temps des bougies données. Null tant que l'EMA 200 n'existe pas. */
export function scorePine(bougies, { volumeReel = true } = {}) {
  const c = close(bougies), e200 = ema(c, 200), r = rsi(c, 14), out = new Array(bougies.length).fill(null);
  let net = 0; const f = 20, ter = bougies.map(b => (b.c >= b.o ? 1 : -1) * b.v * b.c);
  for (let i = 0; i < bougies.length; i++) {
    net += ter[i]; if (i >= f) net -= ter[i - f];
    if (e200[i] == null) continue;
    const bull = c[i] > e200[i], netOk = volumeReel && i >= f - 1 && bougies.slice(Math.max(0, i - f + 1), i + 1).some(b => b.v > 0);
    out[i] = Math.max(0, Math.min(100, Math.round((bull ? 60 : 40) + ((r[i] != null ? r[i] - 50 : 0) * 0.3) + (!netOk ? 0 : net >= 0 ? 5 : -5))));
  }
  return out;
}

/* Calcule un indicateur sur TOUTES les bougies données (la chauffe est incluse). Rend { colonnes: {nom: [..]}, etat, note }. */
export function calculerIndicateur(bougies, spec, { volumeReel = true } = {}) {
  const p = spec.params, c = close(bougies), aDelta = bougies.some(b => Number.isFinite(b.vb)), aVolume = bougies.some(b => b.v > 0);
  switch (spec.type) {
    case 'ma': return { colonnes: { valeur: ouNul(sma(c, p.periode)) }, etat: 'reel' };
    case 'ema': return { colonnes: { valeur: ouNul(ema(c, p.periode)) }, etat: 'reel' };
    case 'rsi': return { colonnes: { valeur: ouNul(rsi(c, p.periode)) }, etat: 'reel' };
    case 'atr': return { colonnes: { valeur: ouNul(atr(bougies, p.periode)) }, etat: 'reel' };
    case 'macd': { const m = macd(c, p.rapide, p.lent, p.signal); return { colonnes: { macd: ouNul(m.macd), signal: ouNul(m.signal), histogramme: ouNul(m.histogramme) }, etat: 'reel' }; }
    case 'bollinger': { const b = bollinger(c, p.periode, p.k); return { colonnes: { milieu: ouNul(b.milieu), haut: ouNul(b.haut), bas: ouNul(b.bas) }, etat: 'reel' }; }
    case 'vwap': return aVolume ? { colonnes: { valeur: ouNul(vwap(bougies)) }, etat: 'reel' } : { colonnes: { valeur: new Array(bougies.length).fill(null) }, etat: 'indisponible', note: 'pas de volume sur cet instrument' };
    case 'volume': return aVolume ? { colonnes: { valeur: bougies.map(b => (b.v > 0 ? b.v : null)) }, etat: 'reel' } : { colonnes: { valeur: new Array(bougies.length).fill(null) }, etat: 'indisponible', note: 'pas de volume sur cet instrument' };
    case 'volume_net': {
      if (!volumeReel || !aVolume) return { colonnes: { valeur: new Array(bougies.length).fill(null) }, etat: 'indisponible', note: 'volume net seulement avec un volume réel' };
      const out = new Array(bougies.length).fill(null), f = p.fenetre; let net = 0; const ter = bougies.map(b => (b.c >= b.o ? 1 : -1) * b.v * b.c);
      for (let i = 0; i < bougies.length; i++) { net += ter[i]; if (i >= f) net -= ter[i - f]; if (i >= f - 1) out[i] = net; }
      return { colonnes: { valeur: out }, etat: 'reel' };
    }
    case 'delta': case 'cvd': {
      const d = bougies.map(b => (Number.isFinite(b.vb) ? 2 * b.vb - b.v : (b.v > 0 ? (b.c >= b.o ? 1 : -1) * b.v : null)));      // sans volume acheteur : signe de la bougie × volume (ESTIMÉ)
      const etat = !aVolume ? 'indisponible' : aDelta ? 'reel' : 'estime', note = etat === 'estime' ? 'delta ESTIMÉ (signe de la bougie × volume) : la source ne donne pas le volume acheteur' : etat === 'indisponible' ? 'pas de volume' : undefined;
      if (spec.type === 'delta') return { colonnes: { valeur: etat === 'indisponible' ? d.map(() => null) : d }, etat, note };
      let s = 0; return { colonnes: { valeur: etat === 'indisponible' ? d.map(() => null) : d.map(x => { s += x || 0; return s; }) }, etat, note };
    }
    case 'score': return { colonnes: { valeur: scorePine(bougies, { volumeReel }) }, etat: 'reel' };
    default: return { colonnes: {}, etat: 'indisponible', note: 'indicateur inconnu' };
  }
}

/* Supports / résistances et profil de volume tels que connus À LA BOUGIE i (passé seul). */
export function niveauxA(bougies, i, { fenetre = 400, fenetreProfil = 120 } = {}) {
  const fin = Math.min(bougies.length, i + 1), a = Math.max(0, fin - fenetre), seg = bougies.slice(a, fin);
  const av = atr(seg, 14), at = av.length ? av[av.length - 1] : null, nc = seg.length >= 30 ? niveauxCles(seg, at) : { supports: [], resistances: [], atr: null };
  const pv = profilVolume(bougies.slice(Math.max(0, fin - fenetreProfil), fin));
  return { index: fin - 1, t: fin ? bougies[fin - 1].t : null, supports: nc.supports.map(x => ({ prix: x.prix, touches: x.touches, force: x.force })), resistances: nc.resistances.map(x => ({ prix: x.prix, touches: x.touches, force: x.force })), atr: nc.atr,
    profil: pv ? { poc: pv.poc, vah: pv.vah, val: pv.val, fenetre: Math.min(fenetreProfil, fin) } : null };
}

const num = x => (x == null || !Number.isFinite(x) ? null : x);
const indexTemps = (bougies, t) => { let a = 0, b = bougies.length; while (a < b) { const m = (a + b) >> 1; if (bougies[m].t < t) a = m + 1; else b = m; } return a; };

/* L'état complet du graphique. options : { bougies (toutes celles qu'on a, la chauffe incluse), unite, paire, indicateurs: ['ma200','rsi14',…], derniers: n | de, a: instants (ms), dessins, volumeReel, inclureSerie }. */
export function lireGraphique({ bougies, unite = 'M15', paire = null, indicateurs = ['ma200', 'rsi14'], derniers = 300, de = null, a = null, dessins = [], volumeReel = true, inclureSerie = true, source = null } = {}) {
  const avert = [], total = bougies.length;
  if (!total) return { ok: false, erreur: 'aucune bougie chargée', avertissements: ['historique absent : active l’agent'] };
  let i0 = 0, i1 = total;
  if (de != null || a != null) { i0 = de != null ? indexTemps(bougies, de) : 0; i1 = a != null ? Math.min(total, indexTemps(bougies, a + 1)) : total; if (i1 <= i0) return { ok: false, erreur: 'période vide : aucune bougie entre ces deux instants' }; }
  else i0 = Math.max(0, total - Math.max(1, Math.min(derniers, 5000)));
  const specs = [], ind = {};
  for (const e of indicateurs) { const s = parserIndicateur(e); if (!s) { avert.push('indicateur inconnu ignoré : « ' + (typeof e === 'string' ? e : JSON.stringify(e)) + ' »'); continue; } if (!specs.some(x => x.id === s.id)) specs.push(s); }
  for (const s of specs) {
    const r = calculerIndicateur(bougies, s, { volumeReel }), cols = {}, derniere = {};
    for (const [nom, tab] of Object.entries(r.colonnes)) { cols[nom] = inclureSerie ? tab.slice(i0, i1).map(num) : undefined; derniere[nom] = num(tab[i1 - 1]); }
    ind[s.id] = { type: s.type, nom: CATALOGUE_INDICATEURS[s.type].nom, params: s.params, etat: r.etat, note: r.note || null, derniere, ...(inclureSerie ? { valeurs: cols } : {}) };
    if (r.etat === 'estime') avert.push(s.id + ' : ' + r.note);
    if (r.etat === 'indisponible') avert.push(s.id + ' : ' + r.note);
  }
  const fenetre = bougies.slice(i0, i1), der = fenetre[fenetre.length - 1];
  const dess = dessins.filter(d => d.visible !== false);
  return { ok: true, paire, unite, source, periode: { de: fenetre[0].t, a: der.t, n: fenetre.length, indexDe: i0, indexA: i1 - 1, totalChargees: total },
    derniere: { t: der.t, o: der.o, h: der.h, l: der.l, c: der.c, v: der.v }, ...(inclureSerie ? { bougies: fenetre.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vb: Number.isFinite(b.vb) ? b.vb : null })) } : {}),
    indicateurs: ind, niveaux: niveauxA(bougies, i1 - 1), dessins: dess, dessinsAgent: dess.filter(d => d.auteur === 'agent').length, dessinsUtilisateur: dess.filter(d => d.auteur === 'utilisateur').length, avertissements: avert };
}

/* Valeurs de tout ce qui se lit à UNE bougie (clic sur une bougie). */
export function valeursA(etat, t) {
  if (!etat.ok || !etat.bougies) return null; const i = etat.bougies.findIndex(b => b.t === t); if (i < 0) return null;
  const out = { bougie: etat.bougies[i], indicateurs: {} };
  for (const [id, ind] of Object.entries(etat.indicateurs)) { if (!ind.valeurs) continue; const v = {}; for (const [nom, tab] of Object.entries(ind.valeurs)) v[nom] = tab[i]; out.indicateurs[id] = v; }
  return out;
}

const f1 = x => (x == null ? '—' : Math.abs(x) >= 1000 ? x.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : Math.abs(x) >= 1 ? x.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : x.toLocaleString('fr-FR', { maximumSignificantDigits: 4 }));
/* Phrase de synthèse (pour la voix : sans IA). */
export function resumeEtat(e) {
  if (!e.ok) return 'Je ne peux pas lire le graphique : ' + e.erreur + '.';
  const p = [(e.paire || 'Le graphique') + ' en ' + e.unite + ' : ' + e.periode.n + ' bougies, dernière clôture ' + f1(e.derniere.c) + '.'];
  const r = e.indicateurs.rsi14 || Object.values(e.indicateurs).find(x => x.type === 'rsi'); if (r && r.derniere.valeur != null) p.push('RSI ' + f1(r.derniere.valeur) + '.');
  const m = Object.values(e.indicateurs).find(x => x.type === 'ma' || x.type === 'ema'); if (m && m.derniere.valeur != null) p.push('Le prix est ' + (e.derniere.c > m.derniere.valeur ? 'au-dessus' : 'sous') + ' la ' + (m.type === 'ma' ? 'MA ' : 'EMA ') + m.params.periode + ' (' + f1(m.derniere.valeur) + ').');
  const n = e.niveaux; if (n.supports[0]) p.push('Support proche ' + f1(n.supports[0].prix) + '.'); if (n.resistances[0]) p.push('Résistance proche ' + f1(n.resistances[0].prix) + '.'); if (n.profil) p.push('POC ' + f1(n.profil.poc) + '.');
  p.push(e.dessinsAgent + ' dessin(s) de l’agent, ' + e.dessinsUtilisateur + ' à toi.');
  return p.join(' ');
}
