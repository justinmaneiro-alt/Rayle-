// V8 : « paquet mobile » de Kepler. Le téléphone et la tablette ne voient jamais le PC (GitHub Pages ne parle pas à 127.0.0.1) : le service du PC publie donc UNE copie compacte de ce que
// montre la fenêtre Agent (positions du jour, bilan, types de setup, meilleures pistes, équipe, occasions, données) vers le Worker, qui la garde en UNE ligne et la rend avec l'heure de mise à jour.
// Aucun secret, aucun ordre. La copie est plafonnée (MAX_OCTETS), n'est renvoyée que si elle change, et jamais plus d'une fois toutes les INTERVALLE_MS (budget de la base D1 du Worker).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fichiersAgent, lireJson, chargerEtat } from './etat-agent.mjs';
import { lireEquipe, resumeEquipe } from './equipe/equipe.mjs';
import { lirePepiniere, resumePepiniere } from './pepiniere.mjs';
import { statutFlux } from './flux/service-flux.mjs';
import { resumeOccasions, resumeExemples } from '../strategies/autonomie.js';
import { pistesDepuis, meilleuresPistes, PROFIL_45_RR2 } from '../strategies/pistes.js';
import { phraseFraisEtat, fraisMoyenR, strategiesActives } from '../strategies/agent-etat.js';
import { entonnoir } from '../strategies/diagnostic-v4.js';

/* Performance simulée pour les courbes du téléphone : propositions CLÔTURÉES seulement (jamais d'invention). Rend, pour « tous », chaque agent et chaque actif : courbe cumulée en R (≤ 200 points) et résultat par jour. */
export function performanceMobile(propositions, { risquePct = 0.5, maxPoints = 200 } = {}) {
  const closes = (propositions || []).filter(p => p && p.statut === 'cloturee' && p.resultat && Number.isFinite(p.resultat.R)).sort((a, b) => a.resultat.tSortie - b.resultat.tSortie);
  const jourDe = t => new Date(t).toISOString().slice(0, 10);
  const serie = l => {
    let cum = 0, pts = l.map(p => [p.resultat.tSortie, +(cum += p.resultat.R).toFixed(3)]);
    if (pts.length > maxPoints) { const pas = pts.length / maxPoints; pts = Array.from({ length: maxPoints }, (_, i) => pts[Math.min(pts.length - 1, Math.round(i * pas))]); }
    const jours = {}; for (const p of l) { const j = jourDe(p.resultat.tSortie); jours[j] = +((jours[j] || 0) + p.resultat.R).toFixed(3); }
    const R = l.map(p => p.resultat.R), g = R.filter(x => x > 0), pe = R.filter(x => x <= 0);
    let pg = 0, pp = 0, c = 0, d = 0; for (const x of R) { if (x > 0) { c++; d = 0; pg = Math.max(pg, c); } else { d++; c = 0; pp = Math.max(pp, d); } }
    let pic = 0, dd = 0, acc = 0; for (const x of R) { acc += x; pic = Math.max(pic, acc); dd = Math.max(dd, pic - acc); }
    return { n: l.length, Rtotal: +R.reduce((a, b) => a + b, 0).toFixed(3), pct: +(R.reduce((a, b) => a + b, 0) * risquePct).toFixed(3), reussite: l.length ? g.length / l.length : null, rrMoyen: g.length && pe.length ? (g.reduce((a, b) => a + b, 0) / g.length) / -(pe.reduce((a, b) => a + b, 0) / pe.length) : null,
      esperance: l.length ? R.reduce((a, b) => a + b, 0) / l.length : null, drawdownR: +dd.toFixed(3), meilleureSerie: pg, pireSerie: pp, courbe: pts, jours };
  };
  const groupes = cle => { const m = {}; for (const p of closes) (m[p[cle]] = m[p[cle]] || []).push(p); return Object.fromEntries(Object.entries(m).map(([k, l]) => [k, serie(l)])); };
  return { risquePct, tous: serie(closes), parAgent: groupes('agent'), parActif: groupes('actif'), pasUnePromesse: 'Simulation avec frais et glissement ; estimation à partir du passé, pas une promesse.' };
}

export const MAX_OCTETS = 300 * 1024, INTERVALLE_MS = 5 * 60e3, VERSION_PAQUET = 1;

const sans = (o, cles) => { const c = { ...o }; for (const k of cles) delete c[k]; return c; };
/* Garde les plus petites versions : listes plafonnées, aucun champ lourd inutile sur un téléphone. */
export function construirePaquet(dossier, maintenant = Date.now()) {
  const F = fichiersAgent(dossier), service = lireJson(F.service, null);
  const pos = lireJson(path.join(dossier, 'positions.json'), null), vue = pos && pos.vuePubliee ? pos.vuePubliee : null;
  const paquet = { v: VERSION_PAQUET, t: maintenant, serviceLe: service && service.vivantLe || null, phase: service && service.phase || null };
  if (vue) {
    const v = { ...vue };
    v.types = (v.types || []).slice(0, 60);
    v.exploration = (v.exploration || []).slice(0, 12);
    paquet.positions = v;
    paquet.performance = performanceMobile(pos.propositions, { risquePct: (v.reglages && v.reglages.risquePct) || 0.5 });
  }
  const tr = lireJson(path.join(dossier, 'trader.json'), null);
  if (tr && tr.vuePubliee) {      // V12 : mode Trader (le même contenu que la fenêtre PC, allégé pour le téléphone)
    const t = { ...tr.vuePubliee }; delete t.gestions; delete t.niveaux; t.recentes = (t.recentes || []).slice(0, 25); t.journalNiveaux = (t.journalNiveaux || []).slice(0, 10); t.pourquoi = (t.pourquoi || []).slice(0, 12);
    t.bougies = Object.fromEntries(Object.entries(t.bougies || {}).map(([a, l]) => [a, (l || []).slice(-90)])); t.courbe = (t.courbe || []).slice(-120);
    if (t.bilan) { t.bilan = { ...t.bilan, parType: (t.bilan.parType || []).slice(0, 14) }; delete t.bilan.parActif; delete t.bilan.parTf; delete t.bilan.parStyle; }
    paquet.trader = t;
  }
  if (fs.existsSync(F.etat)) {
    const etat = chargerEtat(dossier), toutes = pistesDepuis(etat.backtests), top = meilleuresPistes(etat.backtests, { n: 5 }), pep = lirePepiniere(dossier);
    toutes.sort((a, b) => (b.bootstrapBas == null ? -9 : b.bootstrapBas) - (a.bootstrapBas == null ? -9 : a.bootstrapBas));
    const leger = p => sans(p, ['retenus', 'bougies', 'courbe', 'serie']);
    let ent = null; try { ent = entonnoir(etat.backtests); } catch (e) { /* pas d'entonnoir */ }
    paquet.pistes = { pistes: top.map(leger), toutes: toutes.slice(0, 40).map(leger), profil: PROFIL_45_RR2, frais: { phrase: phraseFraisEtat(etat), coutMoyenR: fraisMoyenR(etat) },
      recherche: { phase: service && service.phase, raison: service && service.raison }, variantes: Object.values(etat.compteurVariantes || {}).reduce((a, b) => a + b, 0), entonnoir: ent };
    const eq = lireEquipe(dossier);
    paquet.equipe = { equipe: resumeEquipe(eq, etat, maintenant), hypotheses: eq.hypotheses.slice(-10).reverse().map(h => ({ id: h.id, titre: h.titre, raison: h.raison, statut: h.statut, t: h.t })), pepiniere: resumePepiniere(pep, maintenant), rapportQuotidien: etat.rapportQuotidien || null };
    paquet.agent = { enMarche: !!(service && maintenant - service.vivantLe < 120000), versionActive: etat.active || null, alertes: (etat.alertes || []).slice(-8).reverse(), rapport: etat.rapport || null, pause: !!(etat.parametresRisque && etat.parametresRisque.pause), charge: etat.parametresRisque && etat.parametresRisque.charge || null,
      versions: (etat.versions || []).slice(-8).reverse().map(v => ({ numero: v.numero, t: v.creeLe, raison: String(v.raison || '').slice(0, 160), nStrategies: (v.strategies || []).length, active: !!v.active })),
      strategies: strategiesActives(etat).slice(0, 20).map(x => ({ id: x.id, nom: x.nom, paire: x.paire, phase: x.phase, debut: x.debutSimulation || null })) };
  }
  const o = lireJson(path.join(dossier, 'occasions.json'), {}) || {}, liste = Object.entries(o).flatMap(([p, j]) => ((j && j.liste) || []).map(x => ({ ...x, actif: p }))).sort((a, b) => b.t - a.t);
  let ex = []; try { ex = fs.readFileSync(path.join(dossier, 'exemples.jsonl'), 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { /* aucun */ }
  paquet.occasions = { ...resumeOccasions({ liste }), recentes: liste.filter(x => !x.prise).slice(0, 12) };
  paquet.exemples = { ...resumeExemples(ex), recents: ex.slice(-10).reverse() };
  try { paquet.donnees = { flux: statutFlux(dossier) }; } catch (e) { paquet.donnees = null; }
  return paquet;
}

/* Réduit jusqu'à tenir dans MAX_OCTETS : on retire d'abord le plus lourd et le moins utile sur petit écran. */
export function plafonner(paquet, max = MAX_OCTETS) {
  const taille = () => Buffer.byteLength(JSON.stringify(paquet));
  const etapes = [() => { if (paquet.trader) paquet.trader.recentes = paquet.trader.recentes.slice(0, 10); }, () => { if (paquet.trader) delete paquet.trader.retro; }, () => { if (paquet.positions) paquet.positions.types = paquet.positions.types.slice(0, 25); }, () => { if (paquet.pistes) paquet.pistes.toutes = paquet.pistes.toutes.slice(0, 15); },
    () => { if (paquet.positions) delete paquet.positions.exploration; }, () => { if (paquet.positions) delete paquet.positions.types; }, () => { delete paquet.donnees; }];
  for (const e of etapes) { if (taille() <= max) break; e(); }
  return paquet;
}

/* Empreinte du CONTENU utile seulement : ni l'heure, ni les compteurs qui bougent à chaque cycle (prix, état de marche, horloges du carnet). La copie n'est renvoyée que si cela change. */
export const empreintePaquet = p => {
  const pos = p.positions || {}, ag = p.agent || {};
  const utile = { propositions: pos.propositions, recentes: pos.recentes, types: (pos.types || []).map(x => [x.type, x.niveau, x.n, x.esperance]), bilan: pos.bilan, reglages: pos.reglages, pistes: p.pistes, equipe: p.equipe, occasions: p.occasions, exemples: p.exemples,
    trader: p.trader && { actives: (p.trader.actives || []).map(x => [x.id, x.statut, x.niveau]), recentes: (p.trader.recentes || []).slice(0, 12).map(x => [x.id, x.statut, x.resultat && x.resultat.R]), phrase: p.trader.bilan && p.trader.bilan.phrase, types: (p.trader.types || []).map(x => [x.cle, x.niveau, x.n]), reglages: p.trader.reglages },
    alertes: ag.alertes, active: ag.versionActive, pause: ag.pause, phase: p.phase };
  return createHash('sha1').update(JSON.stringify(utile)).digest('hex').slice(0, 16);
};

/* Pousseur : appelé à chaque cycle du service ; n'envoie que si le contenu a changé ET que l'intervalle minimal est écoulé (ou si `forcer`). */
export function creerPousseur({ dossier, S, journal = () => {}, maintenant = () => Date.now(), construire = construirePaquet }) {
  let derniere = null, dernierEssai = 0, dernierEnvoi = 0;
  return async function pousser(forcer = false) {
    if (!S || !S.configure || !S.publierMobile) return { envoye: false, raison: 'Worker non configuré' };
    const t = maintenant();
    if (!forcer && t - dernierEssai < INTERVALLE_MS) return { envoye: false, raison: 'trop tôt' };
    const p = plafonner(construire(dossier, t)), h = empreintePaquet(p);
    dernierEssai = t;
    if (!forcer && h === derniere && t - dernierEnvoi < 30 * 60e3) { return { envoye: false, raison: 'inchangé' }; }   // inchangé : on ne réécrit pas (rafraîchi toutes les 30 min au plus tard)
    try { await S.publierMobile(p); derniere = h; dernierEnvoi = t; return { envoye: true, octets: Buffer.byteLength(JSON.stringify(p)) }; }
    catch (e) { journal('paquet mobile : ' + String(e.message).slice(0, 120)); return { envoye: false, raison: String(e.message).slice(0, 120) }; }
  };
}
