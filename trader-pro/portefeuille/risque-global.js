/* ═════════════ RISQUE GLOBAL DU PORTEFEUILLE (v6, B4) — pur et testé. Lecture seule : une alerte, jamais un blocage ni un ordre. ═════════════
   Positions = positions ouvertes de l'import XTB + saisies rapides (« Je l'ai pris », voix). Risque d'une position = perte en € si son stop est touché (positif).
   Facteurs : une position or + argent + EUR/USD à l'achat est UN gros pari « contre le dollar ». Corrélations : celles de Couverture si disponibles, sinon une table d'estimation, dite comme telle. */
export const REGLAGES_DEFAUT = Object.freeze({ capital: 0, risquePos: 100, limiteJourPct: 2, limiteSemainePct: 5 });
/* poids des facteurs par actif (long) : dollar négatif = l'actif monte quand le dollar baisse */
export const FACTEURS = Object.freeze({
  or: { metaux: 1, dollar: -0.6 }, argent: { metaux: 1, dollar: -0.5 }, xagusd: { metaux: 1, dollar: -0.5 }, xauusd: { metaux: 1, dollar: -0.6 },
  eurusd: { dollar: -1 }, gbpusd: { dollar: -1 }, audusd: { dollar: -1 }, usdchf: { dollar: 1 }, usdjpy: { dollar: 1 }, dxy: { dollar: 1 },
  us100: { actionsUS: 1 }, us500: { actionsUS: 1 }, btc: { crypto: 1 }, sol: { crypto: 1 }, us10y: { taux: 1 }, us2y: { taux: 1 }, wti: { energie: 1 }
});
export const NOM_FACTEUR = Object.freeze({ dollar: 'dollar', metaux: 'or / métaux', actionsUS: 'actions US', crypto: 'crypto', taux: 'taux', energie: 'énergie' });
/* corrélations d'estimation (rendements quotidiens typiques) quand celles de Couverture manquent */
const PRIOR = { 'or|argent': 0.8, 'or|eurusd': 0.4, 'argent|eurusd': 0.4, 'us100|us500': 0.92, 'btc|sol': 0.8, 'btc|us100': 0.45, 'sol|us100': 0.45, 'eurusd|usdchf': -0.9, 'dxy|eurusd': -0.95, 'dxy|or': -0.4 };
const NORM = { xauusd: 'or', gold: 'or', xagusd: 'argent', silver: 'argent' };
export const actifNorm = a => { const k = String(a || '').toLowerCase(); return NORM[k] || k; };
export function creerCorr(json, fenetre = '30') {
  const C = json && json.correlations && json.correlations[fenetre], ids = C && C.actifs ? C.actifs.map(a => a.id) : null, M = C && (C.matrice || C.matrix || C.valeurs);
  return (a, b) => { a = actifNorm(a); b = actifNorm(b); if (a === b) return { v: 1, source: 'identique' }; if (ids && Array.isArray(M)) { const i = ids.indexOf(a), j = ids.indexOf(b); if (i >= 0 && j >= 0 && Number.isFinite(M[i] && M[i][j])) return { v: M[i][j], source: 'Couverture (' + fenetre + ' j)' }; } const p = PRIOR[a + '|' + b] ?? PRIOR[b + '|' + a]; return p == null ? { v: 0, source: 'inconnue' } : { v: p, source: 'estimation' }; };
}
/* positions unifiées : ouvertes XTB (via `traduire(ticker)` → id d'actif) + saisies rapides { id, actif, sens, risque } ; une position fermée en un toucher (`fermee: true`) est ignorée */
export function unifier({ ouvertes = [], saisies = [], traduire = t => t }) {
  const L = []; for (const o of ouvertes) { const a = actifNorm(traduire(o.ticker)); L.push({ id: 'x:' + (o.id || o.ticker), actif: a, sens: o.sens === 'BUY' ? 1 : -1, risque: Number.isFinite(o.risqueAuStop) && o.risqueAuStop < 0 ? -o.risqueAuStop : (Number.isFinite(o.risque) ? o.risque : null), sansStop: o.sl == null, origine: 'XTB' }); }
  for (const s of saisies) if (!s.fermee) L.push({ id: 's:' + s.id, actif: actifNorm(s.actif), sens: s.sens === 'BUY' || s.sens === 1 ? 1 : -1, risque: Number.isFinite(s.risque) ? s.risque : null, sansStop: !Number.isFinite(s.risque), origine: 'saisie' });
  return L;
}
export function analyser(positions, { corr = creerCorr(null), capital = 0 } = {}) {
  const total = positions.reduce((s, p) => s + (p.risque || 0), 0), sansStop = positions.filter(p => p.sansStop).length, F = {};
  for (const p of positions) { const f = FACTEURS[p.actif]; if (!f || !p.risque) continue; for (const [k, w] of Object.entries(f)) F[k] = (F[k] || 0) + p.sens * w * p.risque; }
  const expo = Object.entries(F).map(([k, v]) => ({ facteur: k, nom: NOM_FACTEUR[k] || k, risque: Math.abs(v), sens: v >= 0 ? 1 : -1, pct: total > 0 ? Math.abs(v) / total : 0, phrase: phraseFacteur(k, v) })).sort((a, b) => b.risque - a.risque);
  const paires = []; for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) { const a = positions[i], b = positions[j]; if (a.actif === b.actif && a.sens === b.sens) { paires.push({ a: a.actif, b: b.actif, corr: 1, source: 'même actif', sens: a.sens }); continue; } const c = corr(a.actif, b.actif), eff = c.v * a.sens * b.sens; if (eff > 0.7) paires.push({ a: a.actif, b: b.actif, corr: c.v, effective: eff, source: c.source, sens: a.sens }); }
  return { total, totalPct: capital > 0 ? total / capital * 100 : null, n: positions.length, sansStop, expo, paires, gros: expo.find(e => e.pct >= 0.6 && e.risque > 0) || null };
}
function phraseFacteur(k, v) { const s = v >= 0 ? 1 : -1; if (k === 'dollar') return s < 0 ? 'pari contre le dollar' : 'pari pour le dollar'; if (k === 'metaux') return s > 0 ? 'pari à la hausse sur l’or et les métaux' : 'pari à la baisse sur l’or et les métaux'; if (k === 'actionsUS') return s > 0 ? 'pari à la hausse sur les actions US' : 'pari à la baisse sur les actions US'; if (k === 'crypto') return s > 0 ? 'pari à la hausse sur la crypto' : 'pari à la baisse sur la crypto'; return (s > 0 ? 'hausse' : 'baisse') + ' ' + (NOM_FACTEUR[k] || k); }
/* pertes réalisées sur le jour et la semaine (heure de Paris, semaine du lundi) à partir des positions fermées XTB */
export function pertesRealisees(fermees, maintenant = Date.now(), partiesParis) {
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }), cle = t => f.format(new Date(t)), auj = cle(maintenant);
  const d = new Date(maintenant), dow = (d.getUTCDay() + 6) % 7, debutSem = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow); let jour = 0, semaine = 0;
  for (const x of fermees || []) { if (!Number.isFinite(x.tFerm) || !Number.isFinite(x.pnl)) continue; if (x.tFerm >= debutSem && x.tFerm <= maintenant + 3600e3) semaine += x.pnl; if (cle(x.tFerm) === auj) jour += x.pnl; }
  return { jour, semaine };
}
/* budget de risque : limites en % du capital, pertes réalisées + risque déjà engagé ; renvoie ce qui reste et l'état (ok / proche / atteinte) */
export function budget({ reglages = REGLAGES_DEFAUT, pertes = { jour: 0, semaine: 0 }, engage = 0 } = {}) {
  const R = { ...REGLAGES_DEFAUT, ...reglages }, capital = R.capital, limJ = capital * R.limiteJourPct / 100, limS = capital * R.limiteSemainePct / 100;
  const perteJ = Math.max(0, -pertes.jour), perteS = Math.max(0, -pertes.semaine), resteJ = limJ - perteJ - engage, resteS = limS - perteS - engage;
  const etat = (reste, lim) => (!(lim > 0) ? 'inconnu' : reste <= 0 ? 'atteinte' : reste < lim * 0.25 ? 'proche' : 'ok');
  return { capital, risquePos: R.risquePos, jour: { limite: limJ, perte: perteJ, reste: resteJ, etat: etat(resteJ, limJ) }, semaine: { limite: limS, perte: perteS, reste: resteS, etat: etat(resteS, limS) } };
}
/* taille d'une nouvelle position : le risque voulu est borné par ce qui reste ; renvoie aussi l'avertissement (alerte, pas blocage) */
export function risqueAutorise(voulu, b) {
  if (!(b.capital > 0)) return { risque: voulu, avertissement: null, depasse: false };
  const reste = Math.min(b.jour.reste, b.semaine.reste), risque = Math.max(0, Math.min(voulu, reste)), depasse = voulu > reste + 1e-9;
  let a = null; if (b.jour.etat === 'atteinte') a = 'limite du jour atteinte : nouvelle position déconseillée'; else if (b.semaine.etat === 'atteinte') a = 'limite de la semaine atteinte : nouvelle position déconseillée'; else if (depasse) a = `il ne te reste que ${Math.round(Math.max(0, reste))} € de budget de risque (jour / semaine) : taille réduite à ${Math.round(risque)} €`;
  return { risque, avertissement: a, depasse };
}
export function phraseRisque(A, b) {
  if (!A.n) return 'Aucune position ouverte : ton risque en cours est nul.';
  const p = [`Si tous tes stops sont touchés, tu perds ${Math.round(A.total)} euros${A.totalPct != null ? `, soit ${A.totalPct.toFixed(1).replace('.', ',')} pour cent de ton capital` : ''}.`];
  if (A.gros) p.push(`Attention : ${Math.round(A.gros.pct * 100)} pour cent de ce risque est un seul ${A.gros.phrase}.`);
  if (A.paires.length) p.push(`${A.paires.length} paire${A.paires.length > 1 ? 's' : ''} de positions très corrélées dans le même sens.`);
  if (A.sansStop) p.push(`${A.sansStop} position${A.sansStop > 1 ? 's' : ''} sans stop : le risque réel est plus grand.`);
  if (b && b.jour.etat === 'atteinte') p.push('La limite de perte du jour est atteinte.'); else if (b && b.semaine.etat === 'atteinte') p.push('La limite de perte de la semaine est atteinte.');
  return p.join(' ');
}
