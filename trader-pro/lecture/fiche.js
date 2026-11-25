/* ═════════════ FICHE DE LECTURE D'UN ACTIF : JSON horodaté, calculé par le code (jamais par l'IA), stocké dans D1 et lisible par tous les appareils ═════════════
   Tout ce que Rayle dit en phase 4 (les points) vient d'ICI : chaque chiffre cité doit exister dans cette fiche (vérification automatique, trader-pro/point/verifier.js).
   Sources non disponibles → le champ vaut null ou « disponible: false » avec la raison. Rien n'est inventé. Lecture seule : aucun ordre. */
import { tendanceUnite, croisementsMa200, bougiesVolumeRecentes, mouvementRecent, mouvementSessions, mouvementNuit, niveauxLecture, regime, calibrerSeuil, grosMouvements, statsTendanceJ, cloturees, PAS, H, J } from './calculs.js';
import { scoreMarche } from '../commun/score.js';
import { analyserCot } from '../marches/cot.js';
import { classerEvenement } from '../marches/calendrier.js';
import { desequilibreN } from '../volume/carnet-calcul.js';
import { atr as atrSerie, dernier } from '../commun/analyse.js';
import { sessionEn, heureParis, TZ } from './sessions.js';

export const VERSION_FICHE = 1;
export const ACTIFS_COPILOTE = Object.freeze([
  { id: 'or', nom: 'l’or', nomCourt: 'Or', devises: ['USD'], mots: /\bgold\b|\bxau\b|bullion|precious|\bor\b|safe.haven|valeur refuge/i },
  { id: 'us100', nom: 'le Nasdaq 100', nomCourt: 'Nasdaq 100', devises: ['USD'], mots: /nasdaq|tech stocks|big tech|semiconductor|chip|nvidia|apple|microsoft|tesla|ai\b/i },
  { id: 'us500', nom: 'le S&P 500', nomCourt: 'S&P 500', devises: ['USD'], mots: /s&p|stocks|wall street|equities|dow\b/i },
  { id: 'btc', nom: 'le Bitcoin', nomCourt: 'Bitcoin', devises: ['USD'], mots: /bitcoin|btc|crypto|saylor|etf/i },
  { id: 'sol', nom: 'Solana', nomCourt: 'Solana', devises: ['USD'], mots: /solana|\bsol\b|crypto/i },
  { id: 'petrole', nom: 'le pétrole', nomCourt: 'Pétrole', devises: ['USD'], mots: /\boil\b|crude|wti|brent|opec|opep|petrol|pétrole|\bgas\b|sanction|refiner/i },
  { id: 'dxy', nom: 'le dollar (DXY)', nomCourt: 'Dollar (DXY)', devises: ['USD'], mots: /dollar|\bdxy\b|greenback|\busd\b|treasury|yields?\b|fed\b|powell/i }
]);
export const actifParId = Object.freeze(Object.fromEntries(ACTIFS_COPILOTE.map(a => [a.id, a])));
const arr = (v, d = 2) => (Number.isFinite(v) ? +v.toFixed(d) : null);

/* annonces du jour (jour de Paris) pour cet actif : { t, titre, pays, impact, prevu, precedent, actuel, genre, code } */
export function agendaDuJour(evenements, actif, maintenant = Date.now(), { max = 8 } = {}) {
  const a = actifParId[actif], jour = t => new Date(t).toLocaleDateString('fr-CA', { timeZone: TZ.paris }), auj = jour(maintenant);
  return (evenements || []).filter(e => jour(e.t) === auj && (e.impact === 'fort' || e.impact === 'moyen') && (!a || a.devises.includes(e.pays))).slice(0, max)
    .map(e => ({ t: e.t, heureParis: heureParis(e.t), titre: e.titre, pays: e.pays, impact: e.impact, prevu: e.prevu || null, precedent: e.precedent || null, actuel: e.actuel || null, passee: e.t <= maintenant, ...classerEvenement(e.titre, e.pays) }));
}
/* actualités des 12 dernières heures qui concernent l'actif ; `items` : { titre, source, t, lien, score?, actifs? } */
export function actusDe(items, actif, maintenant = Date.now(), { heures = 12, max = 5 } = {}) {
  const a = actifParId[actif];
  return (items || []).filter(x => x && x.titre && Number.isFinite(x.t) && x.t >= maintenant - heures * H && x.t <= maintenant + 5 * 60e3 && (Array.isArray(x.actifs) ? x.actifs.includes(actif) : (a ? a.mots.test(`${x.titre} ${x.resume || ''}`) : true)))
    .sort((p, q) => (q.score || 0) - (p.score || 0) || q.t - p.t).slice(0, max).map(x => ({ titre: String(x.titre).slice(0, 160), source: x.source || null, t: x.t, score: Number.isFinite(x.score) ? x.score : null, nbSources: x.nbSources || null, lien: /^https?:\/\//.test(x.lien || '') ? x.lien : null }));
}

export function construireFiche(E, maintenant = Date.now()) {
  const a = actifParId[E.id] || { id: E.id, nom: E.nom || E.id, nomCourt: E.nom || E.id }, B = E.B || {}, J_ = cloturees(B.J, PAS.J, maintenant), H1c = cloturees(B.H1, PAS.H1, maintenant);
  const derniereBarre = [...(B.M5 || []), ...(B.M15 || []), ...(B.H1 || [])].reduce((m, b) => Math.max(m, b.t), 0);
  const prix = Number.isFinite(E.prix) ? E.prix : (B.M15 && B.M15.length ? B.M15[B.M15.length - 1].c : B.H1 && B.H1.length ? B.H1[B.H1.length - 1].c : null);
  const atrJ = J_.length > 20 ? dernier(atrSerie(J_, 14)) : null;
  const F = { version: VERSION_FICHE, actif: a.id, nom: a.nomCourt || a.nom, t: maintenant, prix: arr(prix, 6), tPrix: E.tPrix || derniereBarre || null, sourcePrix: E.source || null, session: null, tendance: {}, interne: {}, biais: null, croisements: [], volume: {}, mouvement: {}, sessions: [], nuit: null, niveaux: null, regime: {}, score: null, cot: null, carnet: null, flux: null, agenda: [], actus: [], evenements: [], atrJ: arr(atrJ, 6), manques: [] };
  const s = sessionEn(maintenant); F.session = { id: s.id, nom: s.nom, debut: s.debut, fin: s.fin };

  for (const u of ['J', 'H4', 'H1']) { F.tendance[u] = tendanceUnite(B[u], u, maintenant); if (!F.tendance[u].dispo) F.manques.push(`tendance ${u} : ${F.tendance[u].raison}`); }
  for (const u of ['M15', 'M5']) if (B[u] && B[u].length) { const t = tendanceUnite(B[u], u, maintenant); F.interne[u] = t.dispo ? { sens: t.sens, position: t.position || null, ecartAtr: t.ecartAtr ?? null } : { dispo: false }; }
  const sJ = F.tendance.J.sens, s4 = F.tendance.H4.sens; F.biais = sJ && sJ === s4 ? sJ : (sJ || s4 ? 'mixte' : null);

  const unitesCroisement = ['J', 'H4', 'H1'].concat(B.M15 && B.M15.length > 210 ? ['M15'] : []).concat(B.M5 && B.M5.length > 210 ? ['M5'] : []);
  for (const u of unitesCroisement) F.croisements.push(...croisementsMa200(B[u], u, a.id, maintenant).slice(0, u === 'J' ? 4 : 3));
  for (const u of ['J', 'H4', 'H1']) F.volume[u] = bougiesVolumeRecentes(B[u], u, a.id, maintenant);
  for (const u of ['H1', 'H4', 'J']) F.mouvement[u] = mouvementRecent(B[u], u, maintenant);
  const Bsess = B.M15 && B.M15.length > 100 ? 'M15' : 'H1';
  F.sessions = mouvementSessions(B[Bsess], Bsess, maintenant, { atrJ }); F.uniteSessions = Bsess; F.nuit = mouvementNuit(B[Bsess], Bsess, maintenant, F.sessions);
  F.niveaux = niveauxLecture(B, maintenant, { sessionsMv: F.sessions });
  for (const u of ['J', 'H4']) F.regime[u] = regime(B[u], u, maintenant);
  F.statsJ = statsTendanceJ(B.J, maintenant);   // ce que fait d'habitude l'actif sur 5 jours dans la même situation de tendance Daily
  F.h1 = H1c.slice(-120).map(b => [b.t, +b.o.toFixed(6), +b.h.toFixed(6), +b.l.toFixed(6), +b.c.toFixed(6)]);   // 120 dernières bougies H1 closes : le prix à n'importe quelle heure (récit d'une absence), page « Montre-moi »

  /* score de marché, COT, flux, carnet */
  try {
    if (J_.length >= 60) { const cot = E.cotBrut ? analyserCot(E.cotBrut) : null, S = scoreMarche({ id: a.id, B: { H1: B.H1 || [], H4: B.H4 || [], J: B.J || [] }, prix, cot, macro: E.macro || null, flux: E.flux || null, ann: a.id === 'btc' || a.id === 'sol' ? 365 : 252 });
      F.score = { score100: S.score100, verdict: S.verdict, confiance: arr(S.confiance, 2), composants: S.composants.filter(c => c.dispo).map(c => ({ nom: c.nom, points: arr(c.points, 0) })), manquants: S.manquants };
      const d = cot && cot.dernier; if (d) F.cot = { date: d.date, indexSpec: d.indexSpec, extreme: d.extremeSpec, netSpec: d.spec, varSpec: d.varSpec, libelle: cot.libelle }; }
  } catch (e) { F.manques.push('score : ' + String(e.message || e).slice(0, 80)); }
  if (E.flux && E.flux.jours && E.flux.jours.length >= 5) { const L = E.flux.jours.slice(-5), net = L.reduce((x, y) => x + y.net, 0), tot = L.reduce((x, y) => x + y.total, 0); if (tot > 0) F.flux = { source: E.flux.source, net5jPct: arr(net / tot * 100, 1) }; }
  if (E.carnet && E.carnet.bids && E.carnet.asks) { const d10 = desequilibreN(E.carnet, 10), d25 = desequilibreN(E.carnet, 25); if (d10) F.carnet = { t: E.carnet.t || maintenant, source: E.carnet.source || null, acheteursPct10: arr(d10.part * 100, 0), acheteursPct25: d25 ? arr(d25.part * 100, 0) : null }; }
  F.agenda = agendaDuJour(E.evenements, a.id, maintenant); F.actus = actusDe(E.actus, a.id, maintenant);

  /* gros mouvements (seuil calibré sur l'historique H4) */
  const cal = E.seuilCalibre || calibrerSeuil(B.H4, maintenant); F.calibrage = cal;
  const gros = grosMouvements(B.H4, maintenant, { seuil: cal.seuil, heures: 72 }); F.grosMouvements = gros;
  F.evenements = evenementsDe(F, gros, maintenant);
  return F;
}

/* journal des faits notables des 72 dernières heures (alimente « Ce que tu as raté » et les alertes) : triés du plus récent au plus ancien */
export function evenementsDe(F, gros, maintenant, { heures = 72 } = {}) {
  const t0 = maintenant - heures * H, L = [];
  for (const c of F.croisements) if (c.tFin >= t0 && (c.statut !== 'echouee' || c.fortVolume)) L.push({ type: 'croisement_ma200', t: c.tFin, unite: c.unite, dir: c.dir, statut: c.statut, vraieCassure: c.vraieCassure, volumeRelMax: c.volumeRelMax, prix: c.prix, ma200: c.ma200 });
  for (const u of ['J', 'H4', 'H1']) { const V = F.volume[u]; if (V && V.disponible) for (const v of V.liste) if (v.tFin >= t0 && v.niveau === 'extreme') L.push({ type: 'volume_extreme', t: v.tFin, unite: u, dir: v.dir, volumeRel: v.volumeRel, contexte: v.contexte, positionMa200: v.positionMa200, prix: v.prixClos }); }
  for (const g of gros) L.push({ type: 'gros_mouvement', t: g.fin, dir: g.sens, depart: g.depart, pct: g.pct, atrH4: g.atrH4, bougiesH4: g.bougiesH4, plusHaut: g.plusHaut, plusBas: g.plusBas });
  for (const b of (F.niveaux && F.niveaux.balayages) || []) if (b.t >= t0) L.push({ type: 'balayage', t: b.t + 3600e3, niveau: b.niveau, prix: b.prix, cote: b.type, sensProbable: b.sensProbable });
  return L.sort((x, y) => y.t - x.t);
}
