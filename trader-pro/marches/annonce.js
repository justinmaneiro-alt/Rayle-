/* ═════════════ ANNONCES ÉCONOMIQUES NOTÉES : note d'importance 0-100, réaction historique mesurée, scénarios par actif (module PUR, testé) ═════════════
   Chaque annonce du calendrier reçoit une note d'importance transparente : type d'annonce, actifs concernés, écart possible avec le consensus, contexte du moment, réaction historique MESURÉE dans notre base.
   Les scénarios « au-dessus / en dessous / conforme au consensus » sont des TENDANCES HABITUELLES, jamais une prévision ni un ordre ; Rayle ne dit jamais « vas-y » ni « n'y va pas ». */
import { classerEvenement, nombre } from './calendrier.js';
import { instantLocal, TZ } from '../lecture/sessions.js';

export const ACTIFS = Object.freeze(['or', 'us100', 'us500', 'btc', 'sol', 'petrole', 'dxy']);
export const NOMS = Object.freeze({ or: 'l’or', us100: 'le Nasdaq', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', petrole: 'le pétrole', dxy: 'le dollar' });
export const COURTS = Object.freeze({ or: 'Or', us100: 'Nasdaq', us500: 'S&P 500', btc: 'Bitcoin', sol: 'Solana', petrole: 'Pétrole', dxy: 'Dollar' });
export const HORIZONS = Object.freeze([['p15', '15 min', 15], ['p60', '1 h', 60], ['p240', '4 h', 240], ['pj', 'clôture du jour', null]]);
const INVERSE = /unemployment|jobless|claims|inventor|deficit|stocks/i;   // un chiffre plus haut = économie plus faible (ou, pour les stocks de pétrole, offre plus abondante)

/* ───── famille d'une annonce ───── */
export const FAMILLES = Object.freeze([
  { id: 'discours', nom: 'prise de parole', motif: /speaks|speech|testimony|remarks|press conference/i, actifs: ['or', 'us100', 'us500', 'dxy'] },
  { id: 'taux', nom: 'décision ou ton d’une banque centrale', motif: /federal funds|fomc|rate decision|interest rate|monetary policy|minutes|main refinancing|deposit facility|cash rate|official bank rate|rate statement/i, actifs: ['or', 'us100', 'us500', 'btc', 'sol', 'dxy', 'petrole'] },
  { id: 'inflation', nom: 'inflation', motif: /\bcpi\b|\bppi\b|\bpce\b|inflation|price index|deflator/i, actifs: ['or', 'us100', 'us500', 'btc', 'sol', 'dxy'] },
  { id: 'emploi', nom: 'emploi', motif: /non-?farm|nfp|employment|unemployment|jobless|claims|\badp\b|jolts|payroll|hourly earnings/i, actifs: ['or', 'us100', 'us500', 'btc', 'sol', 'dxy', 'petrole'] },
  { id: 'petrole', nom: 'pétrole (stocks, OPEP)', motif: /crude oil|eia|api crude|opec|natural gas storage|oil inventor/i, actifs: ['petrole', 'dxy'] },
  { id: 'croissance', nom: 'croissance et activité', motif: /\bgdp\b|retail sales|\bism\b|\bpmi\b|durable|industrial production|consumer (confidence|sentiment)|housing|building permits|factory orders|trade balance|philly|empire state/i, actifs: ['dxy', 'us500', 'us100', 'or', 'petrole'] }
]);
export const familleDe = titre => FAMILLES.find(f => f.motif.test(String(titre || ''))) || { id: 'autre', nom: 'autre indicateur', actifs: ['dxy'] };
/* clé stable d'un type d'annonce (pour retrouver « les dernières fois ») : « USD|NFP », « USD|core cpi m/m », « USD|crude oil inventories » */
export function cleType(titre, pays = 'USD') {
  const c = classerEvenement(titre, pays); if (c.code) return `${pays}|${c.code}`;
  return `${pays}|${String(titre || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/\b(prelim|final|flash|revised|advance)\b/g, '').replace(/\s+/g, ' ').trim().slice(0, 50)}`;
}
export const idEvenement = e => `${cleType(e.titre, e.pays)}@${e.t}`;

/* ───── mesure de la réaction d'un actif à une annonce, sur bougies M15 (clôturées uniquement) ───── */
const M15 = 900e3;
export function prixM15(B, t, tolMs = 30 * 60e3) {
  let lo = 0, hi = B.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (B[m].t + M15 <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r >= 0 && t - (B[r].t + M15) <= tolMs ? B[r].c : null;
}
/* { p15, p60, p240, pj } en % depuis le dernier cours AVANT l'annonce ; null quand l'horizon n'est pas encore atteint ou que le marché était fermé ; pj = jusqu'à 22 h UTC (fin de séance des futures) */
export function mesurerAnnonce(t, B, maintenant = Date.now()) {
  const base = prixM15(B, t); const out = { p15: null, p60: null, p240: null, pj: null }; if (base == null) return out;
  for (const [k, , min] of HORIZONS) {
    const cible = k === 'pj' ? Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate(), 22) : t + min * 60e3;
    if (cible <= t + 14 * 60e3 || maintenant < cible + M15) continue; const p = prixM15(B, cible); if (p != null) out[k] = +((p / base - 1) * 100).toFixed(3);
  }
  return out;
}
/* statistiques « les dernières fois » : entrées { k, t, mesures: { actif: { p15, p60, p240, pj } } } ; au moins 3 cas par horizon, sinon « pas assez de cas » */
export function statsHistorique(histo, k, actif, { n = 8, min = 3, exclure = null } = {}) {
  const L = (histo || []).filter(x => x.k === k && x.t !== exclure && x.mesures && x.mesures[actif]).sort((a, b) => b.t - a.t).slice(0, n), out = { cas: L.length, horizons: {} };
  for (const [h] of HORIZONS) { const v = L.map(x => x.mesures[actif][h]).filter(Number.isFinite); out.horizons[h] = v.length >= min ? { n: v.length, moyenne: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2), amplitude: +(v.reduce((s, x) => s + Math.abs(x), 0) / v.length).toFixed(2), hausses: v.filter(x => x > 0).length, baisses: v.filter(x => x < 0).length } : { n: v.length, insuffisant: true }; }
  return out;
}

/* ───── note d'importance 0-100 ───── */
const C = x => Math.max(0, Math.round(x));
export function noteAnnonce(e, { maintenant = Date.now(), histo = [], fiches = null } = {}) {
  const c = classerEvenement(e.titre, e.pays), fam = familleDe(e.titre), D = [];
  let type = { fort: 12, moyen: 6, faible: 2 }[e.impact] ?? 2, why = `impact ${e.impact || 'inconnu'} selon la source`;
  if (c.code === 'FOMC') { type = 30; why = 'décision de taux de la Fed'; } else if (c.code === 'NFP' || c.code === 'CPI') { type = 30; why = c.code === 'NFP' ? 'emploi américain (NFP)' : 'inflation américaine (CPI)'; }
  else if (/core (cpi|pce)|\bpce\b/i.test(e.titre)) { type = 24; why = 'inflation préférée de la Fed'; } else if (c.genre === 'Décision de taux') { type = 26; why = 'décision de taux d’une banque centrale'; }
  else if (c.genre === 'Compte rendu') { type = 14; why = 'compte rendu de réunion'; } else if (c.genre === 'Discours') { type = e.impact === 'fort' ? 16 : 10; why = 'prise de parole'; }
  else if (fam.id === 'petrole') { type = Math.max(type, 14); why = 'stocks de pétrole'; } else if (fam.id === 'croissance' && e.impact === 'fort') { type = 16; why = 'indicateur de croissance majeur'; }
  D.push({ id: 'type', libelle: 'Type d’annonce', points: type, max: 30, pourquoi: why });
  const na = fam.actifs.length; D.push({ id: 'actifs', libelle: 'Actifs concernés', points: C(Math.min(15, na * 2.5)), max: 15, pourquoi: fam.actifs.map(a => COURTS[a]).join(', ') });
  const a = nombre(e.prevu), b = nombre(e.precedent); let ec = 5, ecW = 'consensus ou précédent non publié par la source : écart inconnu';
  if (a != null && b != null) { const rel = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9); ec = C(Math.min(15, 40 * rel)); ecW = `consensus ${e.prevu} contre précédent ${e.precedent}`; }
  D.push({ id: 'ecart', libelle: 'Écart possible avec le consensus', points: ec, max: 15, pourquoi: ecW });
  const dt = e.t - maintenant; let ctx = dt < -3 * 3600e3 ? 0 : dt <= 2 * 3600e3 ? 10 : dt <= 24 * 3600e3 ? 6 : dt <= 72 * 3600e3 ? 3 : 0, ctxW = dt < -3 * 3600e3 ? 'annonce passée' : dt <= 2 * 3600e3 ? 'dans moins de 2 heures (ou à l’instant)' : dt <= 24 * 3600e3 ? 'dans les 24 heures' : dt <= 72 * 3600e3 ? 'dans les 3 jours' : 'plus tard';
  if (fiches) { const f = fam.actifs.map(x => fiches[x]).filter(Boolean); if (f.some(x => x.regime && x.regime.H4 && x.regime.H4.compression)) { ctx += 5; ctxW += ' ; volatilité comprimée (un mouvement peut se déclencher)'; } else if (f.some(x => x.regime && x.regime.H4 && x.regime.H4.atrVsMediane >= 1.2)) { ctx += 5; ctxW += ' ; marché déjà agité'; } }
  D.push({ id: 'contexte', libelle: 'Contexte du moment', points: Math.min(20, ctx), max: 20, pourquoi: ctxW });
  const k = cleType(e.titre, e.pays); let hist = 0, histW = 'pas assez de cas mesurés dans notre base';
  const S = fam.actifs.map(x => ({ x, s: statsHistorique(histo, k, x, { exclure: e.t }) })).filter(o => o.s.horizons.p60 && !o.s.horizons.p60.insuffisant);
  if (S.length) { const best = S.reduce((m, o) => (o.s.horizons.p60.amplitude > m.s.horizons.p60.amplitude ? o : m)); hist = C(Math.min(20, best.s.horizons.p60.amplitude * 20)); histW = `${COURTS[best.x]} a bougé en moyenne de ${best.s.horizons.p60.amplitude.toLocaleString('fr-FR')} % dans l’heure (${best.s.horizons.p60.n} cas)`; }
  D.push({ id: 'historique', libelle: 'Réaction historique mesurée', points: hist, max: 20, pourquoi: histW });
  return { score: Math.min(100, D.reduce((s, d) => s + d.points, 0)), detail: D, famille: fam.id, cle: k };
}

/* ───── scénarios : au-dessus / en dessous / conforme au consensus ───── */
const H = 'haut', B = 'bas', N = 'neutre', M = 'mixte';
const EFFETS = {
  inflation: { dessus: { dxy: [H, 'des taux plus hauts attendus soutiennent le dollar'], or: [B, 'les taux plus hauts pèsent sur l’or, même si l’inflation le soutient en principe'], us100: [B, 'les valeurs de croissance souffrent de taux plus hauts'], us500: [B, 'taux plus hauts, valorisations sous pression'], btc: [B, 'moins de liquidité attendue'], sol: [B, 'moins de liquidité attendue'] } },
  emploi: { dessus: { dxy: [H, 'une économie solide limite les baisses de taux'], or: [B, 'taux et dollar plus fermes'], us100: [M, 'bonne croissance mais taux plus hauts'], us500: [M, 'bonne croissance mais taux plus hauts'], btc: [B, 'moins de baisses de taux attendues'], sol: [B, 'moins de baisses de taux attendues'], petrole: [H, 'demande jugée solide'] } },
  croissance: { dessus: { dxy: [H, 'économie plus forte, taux plus fermes'], or: [B, 'pression légère via les taux'], us500: [H, 'la croissance soutient les bénéfices'], us100: [M, 'croissance contre taux'], petrole: [H, 'demande jugée solide'], btc: [M, 'effets contraires'] } },
  taux: { dessus: { dxy: [H, 'ton plus ferme que prévu'], or: [B, 'taux plus hauts plus longtemps'], us100: [B, 'valorisations sous pression'], us500: [B, 'valorisations sous pression'], btc: [B, 'liquidité attendue plus rare'], sol: [B, 'liquidité attendue plus rare'], petrole: [B, 'dollar plus ferme'] } },
  petrole: { dessus: { petrole: [B, 'stocks plus élevés que prévu = offre abondante'], dxy: [N, 'effet indirect faible'] } },
  discours: { dessus: { dxy: [M, 'dépend du ton : plus ferme = dollar en hausse'], or: [M, 'dépend du ton : plus accommodant = or en hausse'], us100: [M, 'dépend du ton'], us500: [M, 'dépend du ton'] } }
};
const SENS = { haut: 'plutôt en hausse', bas: 'plutôt en baisse', neutre: 'peu concerné', mixte: 'réaction incertaine (effets contraires)' };
const inverse = s => ({ haut: B, bas: H, neutre: N, mixte: M })[s];
/* niveaux à surveiller sur le graphique, tirés de la fiche de lecture (MA200, supports / résistances, PDH / PDL) */
export function niveauxDeFiche(f) {
  if (!f || !f.prix) return null; const L = [], T = f.tendance || {};
  if (T.H4 && T.H4.ma200) L.push({ nom: 'MA200 H4', prix: T.H4.ma200 }); if (T.J && T.J.ma200) L.push({ nom: 'MA200 Jour', prix: T.J.ma200 });
  const r = f.niveaux && f.niveaux.reperes || {}; for (const k of ['PDH', 'PDL']) if (r[k]) L.push({ nom: k, prix: r[k] });
  const s = f.niveaux && f.niveaux.supports && f.niveaux.supports[0], re = f.niveaux && f.niveaux.resistances && f.niveaux.resistances[0]; if (s) L.push({ nom: 'support (' + s.unite + ')', prix: s.prix }); if (re) L.push({ nom: 'résistance (' + re.unite + ')', prix: re.prix });
  const dessus = L.filter(x => x.prix > f.prix).sort((a, b) => a.prix - b.prix)[0] || null, dessous = L.filter(x => x.prix <= f.prix).sort((a, b) => b.prix - a.prix)[0] || null;
  return { tous: L, dessus, dessous };
}
export function scenariosAnnonce(e, { fiches = {}, maintenant = Date.now() } = {}) {
  const fam = familleDe(e.titre), tab = EFFETS[fam.id] && EFFETS[fam.id].dessus, inv = INVERSE.test(e.titre);
  if (!tab) return { famille: fam.id, scenarios: [], note: 'Pas de grille de scénarios pour ce type d’annonce : Rayle se limite à la note et à l’historique.' };
  const effet = (actif, sens) => { const x = tab[actif]; if (!x) return null; let s = x[0]; if (sens === 'dessous') s = inverse(s); const f = fiches[actif], nv = niveauxDeFiche(f);
    return { actif, nom: COURTS[actif], sens: s, phrase: `${COURTS[actif]} ${SENS[s]} (${x[1]}${sens === 'dessous' ? ', raisonnement inverse' : ''})`, niveaux: nv ? { dessus: nv.dessus, dessous: nv.dessous } : null,
      invalide: s === H && nv && nv.dessous ? `une clôture H1 sous ${nv.dessous.nom} (${nv.dessous.prix})` : s === B && nv && nv.dessus ? `une clôture H1 au-dessus de ${nv.dessus.nom} (${nv.dessus.prix})` : null }; };
  const lis = sens => fam.actifs.map(a => effet(a, sens)).filter(Boolean);
  const nomDessus = inv ? 'Si le chiffre est AU-DESSUS du consensus (économie plus faible / offre plus abondante)' : 'Si le chiffre est AU-DESSUS du consensus', nomDessous = inv ? 'Si le chiffre est EN DESSOUS du consensus (économie plus forte / offre plus rare)' : 'Si le chiffre est EN DESSOUS du consensus';
  const vraiDessus = inv ? 'dessous' : 'dessus', vraiDessous = inv ? 'dessus' : 'dessous';
  return { famille: fam.id, inverse: inv, scenarios: [
    { id: 'dessus', titre: nomDessus, effets: lis(vraiDessus) },
    { id: 'dessous', titre: nomDessous, effets: lis(vraiDessous) },
    { id: 'conforme', titre: 'Si le chiffre est CONFORME au consensus', effets: [], texte: 'Réaction en général limitée : la direction suit alors la tendance et les niveaux (MA200, supports / résistances). Une fausse mèche dans les premières minutes est fréquente.' }
  ], note: 'Tendances habituelles, pas une règle : le marché réagit à l’écart avec ce qui était anticipé, et la première réaction est souvent corrigée.' };
}
/* conseil du copilote : prudence avant l'annonce, volatilité attendue (historique mesuré, sinon ATR) */
export function conseilAnnonce(e, note, { histo = [], fiches = {}, maintenant = Date.now() } = {}) {
  const fam = familleDe(e.titre), k = cleType(e.titre, e.pays), cible = fam.actifs.includes('or') ? 'or' : fam.actifs[0], s = statsHistorique(histo, k, cible, { exclure: e.t }), h = s.horizons.p60, f = fiches[cible];
  let vol = null; if (h && !h.insuffisant) vol = `sur les ${h.n} dernières fois, ${NOMS[cible]} a bougé en moyenne de ${h.amplitude.toLocaleString('fr-FR')} % dans l’heure qui a suivi`;
  else if (f && f.tendance && f.tendance.H1 && f.tendance.H1.atrPct) vol = `pas assez de cas mesurés ; pour repère, l’ATR H1 de ${NOMS[cible]} est de ${f.tendance.H1.atrPct.toLocaleString('fr-FR')} %`;
  const avant = e.t > maintenant ? `Prudence avant l’annonce (note ${note.score}/100)` : 'Annonce déjà publiée';
  return `${avant}${vol ? ' : ' + vol : ''}. ${e.t > maintenant ? 'Les premières minutes sont souvent erratiques ; attendre la clôture de la bougie M15 suivant la publication évite de lire une mèche.' : 'Regarde si la réaction tient après 15 minutes et si elle respecte les niveaux ci-dessous.'} Je ne décide pas à ta place.`;
}
/* dates déterministes pour amorcer l'historique (heure de New York gérée avec l'heure d'été) : NFP = 1er vendredi du mois 8 h 30 ; stocks de pétrole EIA = mercredi 10 h 30 */
export function datesNfp(de, a) {
  const out = []; const d0 = new Date(de); let y = d0.getUTCFullYear(), m = d0.getUTCMonth();
  for (let k = 0; k < 40; k++) { const j = new Date(Date.UTC(y, m, 1)); while (j.getUTCDay() !== 5) j.setUTCDate(j.getUTCDate() + 1); const t = instantLocal(y, m + 1, j.getUTCDate(), 8, 30, TZ.newyork); if (t >= de && t < a) out.push(t); m++; if (m > 11) { m = 0; y++; } if (Date.UTC(y, m, 1) > a) break; }
  return out;
}
export function datesEia(de, a) {
  const out = []; for (let t = de - 86400e3; t < a + 86400e3; t += 86400e3) { const d = new Date(t); if (d.getUTCDay() !== 3) continue; const x = instantLocal(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 10, 30, TZ.newyork); if (x >= de && x < a) out.push(x); }
  return out;
}
