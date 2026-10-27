/* ═════════════ INTÉGRITÉ DES DONNÉES DE MARCHÉ (M6 ; module pur, testé : planetes/mars/tests/m6-fiabilite-test.mjs) ═════════════
   Une stratégie testée sur des données fausses ne vaut rien. Ce module contrôle des bougies { t, o, h, l, c, v } :
   - TROUS (bougies manquantes), DOUBLONS, ORDRE (bougies qui reculent), HEURES DÉCALÉES (ouverture non alignée sur le pas, ou série entière décalée d'une ou plusieurs heures par rapport à une autre source) ;
   - BOUGIES INVALIDES (prix ≤ 0, haut < bas, clôture hors de l'intervalle), SAUTS ABERRANTS (variation d'une bougie à l'autre bien au-delà de ce que le marché permet), VOLUME NUL en série ;
   - FRAÎCHEUR (la dernière bougie fermée est-elle récente ?) ;
   - RECOUPEMENT de deux sources (Binance pour l'historique profond, Kraken pour la bourse où l'on trade) : écart de prix typique, corrélation des variations, décalage horaire détecté.
   Rien n'est « réparé » en silence : on mesure et on dit. */
export const PAS = { M15: 900e3, H1: 3600e3, H4: 14400e3, D1: 86400e3 };

const mediane = a => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); if (!b.length) return NaN; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

/* Audit d'une liste de bougies BRUTES (avant dédoublonnage : c'est là que les doublons se voient). `pas` en ms. */
export function auditerBougies(bougies, { pas = PAS.M15, sautMaxPct = 25, trouMaxBougiesOk = 0 } = {}) {
  const n = bougies.length, trous = [], doublons = [], invalides = [], desalignees = [], sauts = [];
  let reculs = 0, volumeNul = 0, serieNulle = 0, maxSerieNulle = 0;
  for (let i = 0; i < n; i++) {
    const b = bougies[i];
    const bon = b && [b.o, b.h, b.l, b.c].every(x => Number.isFinite(x) && x > 0) && b.h >= Math.max(b.o, b.c) - 1e-9 && b.l <= Math.min(b.o, b.c) + 1e-9 && Number.isFinite(b.t);
    if (!bon) { invalides.push(i); continue; }
    if (b.t % pas !== 0) desalignees.push(i);
    if (!(b.v > 0)) { volumeNul++; serieNulle++; if (serieNulle > maxSerieNulle) maxSerieNulle = serieNulle; } else serieNulle = 0;
    if (i > 0 && bougies[i - 1] && Number.isFinite(bougies[i - 1].t)) {
      const e = b.t - bougies[i - 1].t;
      if (e === 0) doublons.push(i);
      else if (e < 0) reculs++;
      else if (e > pas + 1) trous.push({ de: bougies[i - 1].t + pas, a: b.t, manquantes: Math.round(e / pas) - 1 });
      const pr = bougies[i - 1].c, saut = Math.abs(b.o / pr - 1) * 100;
      if (pr > 0 && saut > sautMaxPct) sauts.push({ index: i, t: b.t, pct: saut });
    }
  }
  const manquantes = trous.reduce((s, x) => s + x.manquantes, 0), grandsTrous = trous.filter(x => x.manquantes >= 4 * (3600e3 / pas || 1));
  const problemes = [];
  if (invalides.length) problemes.push({ gravite: 'ko', code: 'invalides', texte: invalides.length + ' bougie(s) invalide(s) (prix nul, haut < bas…)' });
  if (reculs) problemes.push({ gravite: 'ko', code: 'ordre', texte: reculs + ' bougie(s) qui reculent dans le temps' });
  if (desalignees.length) problemes.push({ gravite: 'ko', code: 'desalignees', texte: desalignees.length + ' bougie(s) dont l’heure n’est pas alignée sur le pas : heures décalées' });
  if (doublons.length) problemes.push({ gravite: 'attention', code: 'doublons', texte: doublons.length + ' doublon(s) (même heure deux fois)' });
  if (sauts.length) problemes.push({ gravite: 'attention', code: 'sauts', texte: sauts.length + ' saut(s) de prix de plus de ' + sautMaxPct + ' % entre deux bougies' });
  if (manquantes > trouMaxBougiesOk) problemes.push({ gravite: grandsTrous.length ? 'attention' : 'info', code: 'trous', texte: manquantes + ' bougie(s) manquante(s) en ' + trous.length + ' trou(s) dont ' + grandsTrous.length + ' de plus de 4 h' });
  if (maxSerieNulle >= 8) problemes.push({ gravite: 'attention', code: 'volume_nul', texte: 'volume nul pendant ' + maxSerieNulle + ' bougies de suite' });
  const niveau = problemes.some(p => p.gravite === 'ko') ? 'ko' : problemes.some(p => p.gravite === 'attention') ? 'attention' : 'ok';
  return { n, niveau, trous, manquantes, doublons: doublons.length, invalides: invalides.length, desalignees: desalignees.length, reculs, sauts, volumeNul, problemes,
    phrase: niveau === 'ok' ? n.toLocaleString('fr-FR') + ' bougies contrôlées : aucun trou, doublon ni décalage.' : problemes.map(p => p.texte).join(' ; ') + '.' };
}

/* Fraîcheur : `derniere` = ouverture de la dernière bougie FERMÉE connue. Une bougie de pas P est disponible à derniere + P ; on tolère 2 pas + 90 s avant de parler de données périmées. */
export function fraicheur(derniere, maintenant, pas = PAS.M15, tolerancePas = 2) {
  if (!Number.isFinite(derniere)) return { etat: 'ko', ageMs: null, phrase: 'aucune donnée' };
  const ageMs = maintenant - (derniere + pas), retardPas = Math.max(0, ageMs / pas);
  const etat = ageMs <= tolerancePas * pas + 90e3 ? 'ok' : ageMs <= 8 * pas ? 'attention' : 'ko';
  return { etat, ageMs: Math.max(0, ageMs), retardPas, phrase: etat === 'ok' ? 'à jour (dernière bougie fermée il y a ' + minutes(ageMs) + ')' : 'PÉRIMÉ : dernière bougie fermée il y a ' + minutes(ageMs) };
}
const minutes = ms => { const m = Math.round(ms / 60e3); return m < 90 ? m + ' min' : m < 36 * 60 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' j'; };

/* Recoupement de deux séries de bougies { t, c, v } (listes). Les prix peuvent différer légèrement (USDT contre USD) : on mesure l'écart relatif des clôtures sur les heures communes,
   la corrélation des variations, et on cherche un décalage horaire (±k pas) qui améliorerait la corrélation. Les volumes sont dans la même unité (coins) : rapport médian. */
export function recouper(a, b, { pas = PAS.M15, tolPct = 0.5, decalageMax = 8, nomA = 'A', nomB = 'B' } = {}) {
  const mb = new Map(b.map(x => [x.t, x])), communes = [];
  for (const x of a) { const y = mb.get(x.t); if (y) communes.push([x, y]); }
  const manque = { surA: a.length - communes.length, surB: b.length - communes.length };
  if (communes.length < 20) return { ok: false, niveau: 'ko', communes: communes.length, phrase: 'recoupement impossible : seulement ' + communes.length + ' bougies communes entre ' + nomA + ' et ' + nomB + '.' };
  const ecarts = communes.map(([x, y]) => Math.abs(x.c / y.c - 1) * 100), ecartMed = mediane(ecarts), ecartMax = Math.max(...ecarts), horsTol = ecarts.filter(e => e > tolPct).length / ecarts.length;
  const ra = [], rb = [];
  for (let i = 1; i < communes.length; i++) { const [x0, y0] = communes[i - 1], [x1, y1] = communes[i]; if (x1.t - x0.t === pas) { ra.push(Math.log(x1.c / x0.c)); rb.push(Math.log(y1.c / y0.c)); } }
  const corr = correlation(ra, rb);
  // décalage : corrélation des variations de A contre celles de B décalées de d pas
  const va = new Map(), vb = new Map();
  for (let i = 1; i < a.length; i++) if (a[i].t - a[i - 1].t === pas) va.set(a[i].t, Math.log(a[i].c / a[i - 1].c));
  for (let i = 1; i < b.length; i++) if (b[i].t - b[i - 1].t === pas) vb.set(b[i].t, Math.log(b[i].c / b[i - 1].c));
  let meilleur = { d: 0, c: corr };
  for (let d = -decalageMax; d <= decalageMax; d++) {
    if (d === 0) continue; const xs = [], ys = [];
    for (const [t, r] of va) { const s = vb.get(t + d * pas); if (s != null) { xs.push(r); ys.push(s); } }
    if (xs.length < 50) continue; const c = correlation(xs, ys); if (c > meilleur.c + 0.1) meilleur = { d, c };
  }
  const ratiosVol = communes.filter(([x, y]) => x.v > 0 && y.v > 0).map(([x, y]) => x.v / y.v), ratioVol = mediane(ratiosVol);
  const problemes = [];
  if (meilleur.d !== 0) problemes.push('HEURES DÉCALÉES : ' + nomA + ' correspond mieux à ' + nomB + ' décalée de ' + meilleur.d + ' pas (corrélation ' + meilleur.c.toFixed(2) + ' contre ' + corr.toFixed(2) + ')');
  if (ecartMed > tolPct) problemes.push('écart médian des clôtures de ' + ecartMed.toFixed(2) + ' % (> ' + tolPct + ' %)');
  if (horsTol > 0.05) problemes.push(Math.round(horsTol * 100) + ' % des bougies s’écartent de plus de ' + tolPct + ' %');
  if (corr < 0.9) problemes.push('variations peu corrélées (' + corr.toFixed(2) + ')');
  const niveau = meilleur.d !== 0 || corr < 0.8 ? 'ko' : problemes.length ? 'attention' : 'ok';
  return { ok: niveau === 'ok', niveau, communes: communes.length, ...manque, ecartMedianPct: ecartMed, ecartMaxPct: ecartMax, partHorsTolerance: horsTol, correlation: corr, decalage: meilleur.d, ratioVolumeMedian: ratioVol,
    problemes, phrase: nomA + ' contre ' + nomB + ' sur ' + communes.length.toLocaleString('fr-FR') + ' bougies : écart médian ' + ecartMed.toFixed(3) + ' %, corrélation ' + corr.toFixed(3) + (problemes.length ? ' ; ' + problemes.join(' ; ') : ' ; cohérent') + '.' };
}
export function correlation(x, y) {
  const n = Math.min(x.length, y.length); if (n < 3) return NaN;
  let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; } const mx = sx / n, my = sy / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
