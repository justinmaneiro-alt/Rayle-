// Routes locales /__agent/… (branchées dans serveur.mjs) : la page Rayle lit l'état de l'agent directement sur le PC, SANS passer par le Worker (utile tant que le Worker n'est pas déployé,
// et plus rapide). Mêmes garde-fous que le Veilleur : hôte local, même origine, en-tête X-Rayle-Multi pour les actions. Aucun secret n'est renvoyé (le jeton du Worker reste dans config.local.json).
//   GET  /__agent/etat      { ok, enMarche, service, etat, suivi }   (état complet de l'agent, comme /agent/etat du Worker)
//   GET  /__agent/equipe      { ok, equipe (3 rôles), hypotheses, pepiniere }          (V4 : onglet Équipe)
//   GET  /__agent/pistes      { ok, pistes (5), toutes, profil, frais, couts, recherche, voieCorrigee }   (V6 : onglet Meilleures pistes)
//   GET  /__agent/positions   { ok, vue }   (V7 : onglets Positions du jour, Bilan, Pourquoi pas plus, Exemples)
//   POST /__agent/positions/commande  { type: 'reglages' | 'exemple' | 'supprimer_exemple', valeur }   → positions-commandes.json, lu par le service
//   GET  /__agent/occasions   { ok, occasions, exemples }                               (V4 : onglet Occasions manquées)
//   GET  /__agent/mobile     { ok, existe, paquet, recuLe, pcVivantLe, origine:'PC' }   (V8 : paquet compact de la fenêtre Agent, le même que celui publié vers le Worker ; la coque mobile le lit en priorité)
//   GET  /__agent/donnees     { ok, flux, historique, disque }                          (V4 : onglet Données)
//   POST /__agent/commande  { type: 'pause' | 'reprendre' | 'charge' | 'retour_arriere' | 'rapport', valeur?, numero? }  → écrit commandes.json, lu par le service à son prochain cycle
import fs from 'node:fs';
import path from 'node:path';
import { requeteAutorisee } from './multi-ecrans.mjs';
import { dossierAgent, fichiersAgent, lireJson, ecrireJson, vivant, chargerEtat } from '../agent-pc/etat-agent.mjs';
import { lireEquipe, resumeEquipe } from '../agent-pc/equipe/equipe.mjs';
import { lirePepiniere, resumePepiniere } from '../agent-pc/pepiniere.mjs';
import { statutFlux } from '../agent-pc/flux/service-flux.mjs';
import { creerHistorique } from '../agent-pc/flux/historique-trades.mjs';
import { resumeOccasions, resumeExemples } from '../strategies/autonomie.js';
import { pistesDepuis, meilleuresPistes, PROFIL_45_RR2 } from '../strategies/pistes.js';
import { phraseFraisEtat, fraisMoyenR } from '../strategies/agent-etat.js';
import { cleParams } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { lireCoutsReglage, phraseSource } from '../agent-pc/couts-reglage.mjs';
import { statutService } from '../agent-pc/service-statut.mjs';
import { construirePaquet, plafonner } from '../agent-pc/bundle-mobile.mjs';   // V8 : même paquet que celui publié vers le Worker pour le téléphone

const COMMANDES = ['pause', 'reprendre', 'charge', 'retour_arriere', 'rapport', 'observation', 'rapport_quotidien', 'niveau_preuve'];
const COMMANDES_POSITIONS = ['reglages', 'exemple', 'supprimer_exemple'];
const COMMANDES_TRADER = ['reglages', 'reactiver'];
export function creerRoutesAgent(env = process.env) {
  let memoMobile = null;
  const dossier = () => dossierAgent(env);
  const lireCorps = req => new Promise((resolve, reject) => { let n = 0; const m = []; req.on('data', c => { n += c.length; if (n > 4096) { reject(new Error('corps trop gros')); req.destroy(); } else m.push(c); }); req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(m).toString('utf8') || '{}')); } catch (e) { reject(new Error('JSON invalide')); } }); req.on('error', reject); });
  async function gerer(req, res, chemin) {
    const json = (code, obj) => { const t = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(t) }); res.end(t); };
    const refus = requeteAutorisee(req); if (refus) return json(403, { ok: false, erreur: refus });
    const route = chemin.replace(/^\/__agent\//, ''), F = fichiersAgent(dossier());
    try {
      if (route === 'etat' && req.method === 'GET') {
        if (!fs.existsSync(F.etat)) return json(200, { ok: true, existe: false, enMarche: false });
        const service = lireJson(F.service, null), enMarche = !!(service && service.pid && vivant(service.pid) && Date.now() - service.vivantLe < 120000);
        const e = chargerEtat(dossier());
        return json(200, { ok: true, existe: true, enMarche, service: service && { phase: service.phase, raison: service.raison, vivantLe: service.vivantLe, worker: service.worker, jeu: service.jeu, donnees: service.donnees }, etat: e, suivi: lireJson(F.suivi, {}), maintenant: Date.now() });
      }
      if (route === 'equipe' && req.method === 'GET') {
        const e = lireEquipe(dossier()), etat = fs.existsSync(F.etat) ? chargerEtat(dossier()) : null, now = Date.now();
        return json(200, { ok: true, equipe: resumeEquipe(e, etat, now), hypotheses: e.hypotheses.slice(-30).reverse().map(h => ({ id: h.id, titre: h.titre, raison: h.raison, statut: h.statut, source: h.source, t: h.t, resultats: h.resultats })), pepiniere: resumePepiniere(lirePepiniere(dossier()), now), rapportQuotidien: etat && etat.rapportQuotidien || null });
      }
      if (route === 'pistes' && req.method === 'GET') {   // V6 : onglet « Meilleures pistes »
        if (!fs.existsSync(F.etat)) return json(200, { ok: true, existe: false });
        const etat = chargerEtat(dossier()), toutes = pistesDepuis(etat.backtests), top = meilleuresPistes(etat.backtests, { n: 5 }), pep = lirePepiniere(dossier()), service = lireJson(F.service, null), now = Date.now();
        const parCle = new Map(pep.candidates.filter(c => c.type !== 'carnet').map(c => [c.famille + ':' + c.paire + ':' + cleParams(c.params || {}), c]));
        const marquer = p => { const c = p.retenus ? parCle.get(p.famille + ':' + p.paire + ':' + cleParams(p.retenus)) : null; return c ? { ...p, enPepiniere: true, pepiniere: { statut: c.statut, trades: c.trades.length, jours: Math.floor((now - c.debut) / 86400e3), moyenne: c.trades.length ? c.trades.reduce((a, x) => a + x.R, 0) / c.trades.length : null, decision: c.sprt && c.sprt.decision || null } } : p; };
        toutes.sort((a, b) => (b.bootstrapBas == null ? -9 : b.bootstrapBas) - (a.bootstrapBas == null ? -9 : a.bootstrapBas));
        return json(200, { ok: true, existe: true, pistes: top.map(marquer), toutes: toutes.slice(0, 150).map(marquer), profil: PROFIL_45_RR2, frais: { phrase: phraseFraisEtat(etat), coutMoyenR: fraisMoyenR(etat) }, couts: phraseSource(lireCoutsReglage(dossier())),
          recherche: { phase: service && service.phase, raison: service && service.raison, niveaux: etat.recherche.niveaux || null, attente: etat.recherche.attente || null }, voieCorrigee: !!etat.parametresRisque.testsMultiplesCorriges, variantes: Object.values(etat.compteurVariantes || {}).reduce((a, b) => a + b, 0) });
      }
      if (route === 'positions' && req.method === 'GET') {   // V7 : positions du jour, bilan, types de setup (lu dans positions.json écrit par le service)
        const p = lireJson(path.join(dossier(), 'positions.json'), null);
        if (!p) return json(200, { ok: true, existe: false, note: 'Le service n’a pas encore calculé de positions (il le fait à chaque clôture de bougie M15).' });
        const service = lireJson(F.service, null), enMarche = !!(service && service.pid && vivant(service.pid) && Date.now() - service.vivantLe < 120000);
        return json(200, { ok: true, existe: true, enMarche, vue: p.vuePubliee || null });
      }
      if (route === 'positions/commande' && req.method === 'POST') {
        const b = await lireCorps(req);
        if (!COMMANDES_POSITIONS.includes(b.type)) return json(400, { ok: false, erreur: 'commande inconnue' });
        const loc = path.join(dossier(), 'positions-commandes.json'), liste = lireJson(loc, []) || []; liste.push({ type: b.type, valeur: b.valeur ?? null }); ecrireJson(loc, liste.slice(-20));
        return json(200, { ok: true, note: 'transmise au service (appliquée à son prochain cycle, ≈ 30 s)' });
      }
      if (route === 'trader' && req.method === 'GET') {   // V12 : mode Trader (positions « À l'essai », bilan en direct), lu dans trader.json écrit par le service ; le statut du service est TOUJOURS donné en clair
        const service = lireJson(F.service, null), sv = statutService(service, !!(service && service.pid && vivant(service.pid)), Date.now());
        const t = lireJson(path.join(dossier(), 'trader.json'), null);
        if (!t) return json(200, { ok: true, existe: false, enMarche: sv.enMarche, service: sv, note: 'Le mode Trader n’a pas encore calculé de positions (il le fait à chaque clôture de bougie M15, service en marche).' });
        return json(200, { ok: true, existe: true, enMarche: sv.enMarche, service: sv, vue: t.vuePubliee || null });
      }
      if (route === 'trader/commande' && req.method === 'POST') {
        const b = await lireCorps(req);
        if (!COMMANDES_TRADER.includes(b.type)) return json(400, { ok: false, erreur: 'commande inconnue' });
        const loc = path.join(dossier(), 'trader-commandes.json'), liste = lireJson(loc, []) || []; liste.push({ type: b.type, valeur: b.valeur ?? null }); ecrireJson(loc, liste.slice(-20));
        return json(200, { ok: true, note: 'transmise au service (appliquée à son prochain cycle)' });
      }
      if (route === 'occasions' && req.method === 'GET') {
        const o = lireJson(path.join(dossier(), 'occasions.json'), {}) || {}, liste = Object.entries(o).flatMap(([p, j]) => ((j && j.liste) || []).map(x => ({ ...x, actif: p }))).sort((a, b) => b.t - a.t);
        let ex = []; try { ex = fs.readFileSync(path.join(dossier(), 'exemples.jsonl'), 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { /* aucun */ }
        return json(200, { ok: true, occasions: { ...resumeOccasions({ liste }), recentes: liste.filter(x => !x.prise).slice(0, 25) }, exemples: { ...resumeExemples(ex), recents: ex.slice(-20).reverse() } });
      }
      if (route === 'mobile' && req.method === 'GET') {   // V8 : même paquet que le Worker (copie de 20 s : la construction lit l'état complet)
        const now = Date.now();
        if (!memoMobile || now - memoMobile.t > 20000) memoMobile = { t: now, paquet: plafonner(construirePaquet(dossier(), now)) };
        const service = lireJson(F.service, null);
        return json(200, { ok: true, existe: true, paquet: memoMobile.paquet, recuLe: memoMobile.t, pcVivantLe: service && service.vivantLe || null, origine: 'PC' });
      }
      if (route === 'donnees' && req.method === 'GET') {
        let libre = null; try { const st = fs.statfsSync(dossier()); libre = Number(st.bavail) * Number(st.bsize) / 1024 ** 3; } catch (e) { /* inconnu */ }
        const etat = fs.existsSync(F.etat) ? chargerEtat(dossier()) : null;
        return json(200, { ok: true, flux: statutFlux(dossier()), historique: creerHistorique({ dossier: dossier() }).resume(), disqueLibreGo: libre, bougies: etat && etat.donnees || null });
      }
      if (route === 'commande' && req.method === 'POST') {
        const b = await lireCorps(req);
        if (!COMMANDES.includes(b.type)) return json(400, { ok: false, erreur: 'commande inconnue' });
        if (b.type === 'charge' && !['faible', 'normal', 'fort'].includes(b.valeur)) return json(400, { ok: false, erreur: 'charge : faible, normal ou fort' });
        const loc = path.join(dossier(), 'commandes.json'), liste = lireJson(loc, []) || []; liste.push({ type: b.type, valeur: b.valeur ?? null, numero: b.numero ?? null }); ecrireJson(loc, liste.slice(-20));
        return json(200, { ok: true, note: 'transmise au service (appliquée à son prochain cycle, ≈ 30 s)' });
      }
      return json(404, { ok: false, erreur: 'route inconnue' });
    } catch (e) { return json(500, { ok: false, erreur: String(e.message).slice(0, 160) }); }
  }
  return { gerer };
}
