/* ═════════════ CONTRÔLES QUALITÉ DES DONNÉES (v6, B2) — pur, exécuté chaque nuit par GitHub Actions (outils-donnees/controle-nuit.mjs) ═════════════
   Cherche : prix aberrants (saut de plus de 12 ATR (médiane des amplitudes) d'une clôture à l'autre, sans raison), trous dans les bougies (marchés 24/7), doublons, valeurs nulles ou incohérentes,
   incohérences entre fenêtres (même actif, même prix partout ; un seul calendrier). Chaque problème a une gravité : « grave » (fausse un chiffre affiché) ou « info ». */
export const PAS_BOUGIE = Object.freeze({ '5m': 300e3, '15m': 900e3, '1h': 3600e3, '1d': 86400e3 });
export const ACTIFS_24_7 = Object.freeze(['BTC_USD', 'SOL_USD']);
export const PRIX_ACTIFS = Object.freeze({ or: 'GC_F', us100: '_NDX', us500: '_GSPC', btc: 'BTC_USD', sol: 'SOL_USD', eurusd: 'EURUSD_X', usdchf: 'CHF_X', dxy: 'DX_Y_NYB' });   // pro-<actif>.json ↔ bougies-<symbole>-1h.json
/* amplitude typique : MÉDIANE des vraies amplitudes sur toute la série (robuste : un saut aberrant ne gonfle pas la mesure qui doit le détecter) */
const atr = B => { const R = []; for (let i = 1; i < B.length; i++) R.push(Math.max(B[i][2] - B[i][3], Math.abs(B[i][2] - B[i - 1][4]), Math.abs(B[i][3] - B[i - 1][4]))); if (!R.length) return null; R.sort((x, y) => x - y); return R[R.length >> 1]; };

/* un fichier de bougies { b: [[t, o, h, l, c, v]] } ; recentes = nombre de dernières bougies où un saut est GRAVE (ce qui est affiché) */
export function controlerBougies(nom, d, { unite = '1h', actif = '', recentes = 48, seuilAtr = 12 } = {}) {
  const P = [], B = d && Array.isArray(d.b) ? d.b : null, pas = PAS_BOUGIE[unite];
  if (!B || !B.length) return [{ gravite: 'grave', fichier: nom, type: 'vide', detail: 'fichier vide ou illisible' }];
  const vus = new Set(); let doublons = 0, nuls = 0, incoh = 0;
  for (const x of B) { const [t, o, h, l, c] = x; if (vus.has(t)) doublons++; vus.add(t); if (![o, h, l, c].every(y => Number.isFinite(y) && y > 0)) { nuls++; continue; } if (h < l || h < Math.max(o, c) - 1e-9 || l > Math.min(o, c) + 1e-9) incoh++; }
  if (doublons) P.push({ gravite: 'info', fichier: nom, type: 'doublons', detail: doublons + ' horodatage(s) en double' });
  if (nuls) P.push({ gravite: nuls > 3 ? 'grave' : 'info', fichier: nom, type: 'nulles', detail: nuls + ' bougie(s) à valeur nulle ou absente' });
  if (incoh) P.push({ gravite: 'info', fichier: nom, type: 'incoherentes', detail: incoh + ' bougie(s) incohérente(s) (haut < bas ou corps hors mèches)' });
  const S = B.filter(x => [x[1], x[2], x[3], x[4]].every(y => Number.isFinite(y) && y > 0)).sort((a, b) => a[0] - b[0]), a = atr(S) || 0;
  if (a > 0) {   // sauts regroupés par fichier : une seule ligne (nombre, le plus fort, le plus récent) ; GRAVE seulement si l'un d'eux est dans les dernières bougies (ce qui est affiché)
    const sauts = []; for (let i = 1; i < S.length; i++) { const x = Math.abs(S[i][4] - S[i - 1][4]) / a; if (x > seuilAtr) sauts.push({ i, x, t: S[i][0], de: S[i - 1][4], a: S[i][4] }); }
    if (sauts.length) { const fort = sauts.reduce((m, y) => (y.x > m.x ? y : m)), recent = sauts.filter(y => y.i >= S.length - recentes), dernier = recent.length ? recent[recent.length - 1] : sauts[sauts.length - 1];
      P.push({ gravite: recent.length ? 'grave' : 'info', fichier: nom, type: 'aberrant', detail: sauts.length + ' saut(s) de plus de ' + seuilAtr + ' ATR ; le plus fort : ' + fort.x.toFixed(1) + ' ATR le ' + new Date(fort.t).toISOString().slice(0, 16) + ' (' + +fort.de.toPrecision(7) + ' → ' + +fort.a.toPrecision(7) + ') ; le plus récent : ' + new Date(dernier.t).toISOString().slice(0, 16) }); } }
  if (pas && ACTIFS_24_7.includes(actif)) {   // trous : GRAVE seulement si le dernier trou de plus de 6 bougies date de moins de 7 jours (ce qui est affiché)
    let trous = 0, maxTrou = 0, finDernier = 0, dernierGros = 0; for (let i = 1; i < S.length; i++) { const m = Math.round((S[i][0] - S[i - 1][0]) / pas) - 1; if (m > 2) { trous++; maxTrou = Math.max(maxTrou, m); finDernier = S[i][0]; if (m > 6) dernierGros = S[i][0]; } }
    if (trous) P.push({ gravite: dernierGros && Date.now() - dernierGros < 7 * 86400e3 ? 'grave' : 'info', fichier: nom, type: 'trous', detail: trous + ' trou(s) de plus de 2 bougies sur un marché 24/7 (le plus long : ' + maxTrou + ' ; le dernier finit le ' + new Date(finDernier).toISOString().slice(0, 16) + ')' }); }
  return P;
}
/* cohérence entre fenêtres : le prix de pro-<actif>.json (analyse) doit être proche de la dernière clôture H1 des bougies du même actif */
export function controlerCoherence(pro, bougies, { tolerance = 0.03 } = {}) {
  const P = [];
  for (const [actif, sym] of Object.entries(PRIX_ACTIFS)) { const p = pro && pro[actif], b = bougies && bougies[sym]; if (!p || !Number.isFinite(p.prix) || !b || !b.length) continue; const dernier = b[b.length - 1][4], ecart = Math.abs(p.prix / dernier - 1);
    if (ecart > tolerance) P.push({ gravite: 'grave', fichier: 'pro-' + actif + '.json', type: 'incoherence-prix', detail: actif + ' : ' + p.prix + ' dans l’analyse contre ' + dernier + ' dans les bougies H1 (' + (ecart * 100).toFixed(1) + ' % d’écart)' }); }
  return P;
}
/* un seul calendrier : les événements à venir de deux fichiers doivent coïncider (clé = date à la minute + titre normalisé) */
export function controlerCalendriers(A, B, { maintenant = Date.now(), seuil = 0.8 } = {}) {
  const cle = e => new Date(e.t || e.date || e.heure).toISOString().slice(0, 16) + '|' + String(e.titre || e.nom || e.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  const ev = L => (Array.isArray(L) ? L : (L && (L.evenements || L.events || L.items)) || []).filter(e => { const t = Date.parse(e.t || e.date || e.heure); return Number.isFinite(t) && t > maintenant && t < maintenant + 7 * 86400e3; });
  let ea = [], eb = []; try { ea = ev(A); eb = ev(B); } catch (e) { return [{ gravite: 'info', fichier: 'calendrier', type: 'illisible', detail: 'format de calendrier non reconnu' }]; }
  if (!ea.length || !eb.length) return []; const sa = new Set(ea.map(cle)), sb = new Set(eb.map(cle)); const commun = [...sa].filter(k => sb.has(k)).length, part = commun / Math.max(sa.size, sb.size);
  return part < seuil ? [{ gravite: 'info', fichier: 'calendrier2.json / marches-calendrier.json', type: 'calendriers-differents', detail: Math.round(part * 100) + ' % d’événements communs sur 7 jours (attendu ≥ ' + Math.round(seuil * 100) + ' %)' }] : [];
}
/* persistance : un problème GRAVE compte une « nuit » de plus s'il était déjà là la nuit précédente ; au bout de 2 nuits : alerte Telegram (une seule fois par épisode) */
export function persistance(precedent, problemes, maintenant = Date.now()) {
  const cles = {}; for (const p of problemes.filter(x => x.gravite === 'grave')) { const k = p.fichier + '|' + p.type, ancien = precedent && precedent.consecutif && precedent.consecutif[k]; cles[k] = { nuits: ancien ? ancien.nuits + 1 : 1, depuis: ancien ? ancien.depuis : maintenant, alerte: ancien ? !!ancien.alerte : false }; }
  const aAlerter = Object.entries(cles).filter(([, v]) => v.nuits >= 2 && !v.alerte).map(([k]) => k); for (const k of aAlerter) cles[k].alerte = true; return { consecutif: cles, aAlerter };
}
export function rapport({ problemes, precedent, maintenant = Date.now() }) {
  const pers = persistance(precedent, problemes, maintenant), graves = problemes.filter(p => p.gravite === 'grave').length;
  return { t: maintenant, version: 1, resume: graves ? graves + ' problème(s) grave(s), ' + (problemes.length - graves) + ' information(s)' : problemes.length ? 'aucun problème grave, ' + problemes.length + ' information(s)' : 'aucun problème', graves, problemes: problemes.slice(0, 80), consecutif: pers.consecutif, aAlerter: pers.aAlerter };
}
