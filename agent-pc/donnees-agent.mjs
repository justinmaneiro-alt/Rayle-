// Données de l'agent : bougies M15 de BTC, SOL et DOGE (Binance, delta réel ; secours Bitstamp pour BTC), mises à jour chaque jour, trous signalés, dérivés (financement, intérêt ouvert).
// Kraken (le marché où Justin trade) : fichiers OHLCVT téléchargeables à part (kraken-ohlcvt.mjs) et API OHLC pour le recoupement des dernières bougies. Les données restent pour la recherche
// PERSONNELLE de Justin : sur le disque du PC, jamais dans git, jamais republiées.
import fs from 'node:fs';
import path from 'node:path';
import { creerHistorique } from '../planetes/mars/pc/agent-btc/historique.js';
import { paire as infoPaire, sourceBinance, ORDRE_PAIRES } from '../planetes/mars/pc/agent-m6/paires.js';
import { stockageFichier } from '../app-pc/veilleur/stockage-fichier.mjs';
import { mettreAJourDerives } from './derives.mjs';
import { lireSerie as lireKraken, INTERVALLES } from './kraken-ohlcvt.mjs';

export const lireReseau = async url => { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Rayle-agent' }, signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
export const lireOctets = async url => { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Rayle-agent' }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return new Uint8Array(await r.arrayBuffer()); };
export const jourDe = t => new Date(t).toISOString().slice(0, 10);

export function creerDonnees({ dossier, paires = ORDRE_PAIRES, lire = lireReseau, lireOctetsImpl = lireOctets, maintenant = () => Date.now(), annees = 9.5, journal = () => {} } = {}) {
  const histos = {};
  for (const p of paires) {
    const info = infoPaire(p), debut = (maintenant() - info.debutHistorique) / (365.25 * 86400e3);
    histos[p] = creerHistorique({ stockage: stockageFichier(path.join(dossier, p.toLowerCase())), lire, maintenant, annees: Math.min(annees, debut), ...(p === 'BTC' ? {} : { sources: { binance: sourceBinance(p) }, ordre: ['binance'] }) });
  }
  const infoSerie = p => { const h = histos[p], s = h.serie(), e = h.etat(); return { paire: p, n: s.n, debut: e.debut, fin: e.fin, jourFin: e.fin ? jourDe(e.fin - 1) : null, annees: e.annees, source: e.source, secours: !!e.secours, trous: (e.lacunes || []).length, bougiesManquantes: (e.lacunes || []).reduce((a, x) => a + x.manquantes, 0), majLe: e.majLe, erreur: e.erreur }; };
  return {
    histos, serie: p => histos[p].serie(), infoSerie,
    async charger() { for (const p of paires) await histos[p].charger(); return paires.map(infoSerie); },
    /* Mise à jour QUOTIDIENNE : complète l'historique, comble les trous réparables (la synchronisation reprend tout ce qui manque), vérifie l'intégrité, charge les dérivés. Rend un compte rendu par paire. */
    async maintenirChaqueJour({ avecDerives = true, surProgres = () => {} } = {}) {
      const rapport = [];
      for (const p of paires) {
        const r = { paire: p }; surProgres({ paire: p, phase: 'bougies' });
        try { await histos[p].synchroniser({}); Object.assign(r, infoSerie(p)); r.integrite = verifierIntegrite(histos[p].serie()); } catch (e) { r.erreur = String(e.message).slice(0, 150); }
        if (avecDerives) { surProgres({ paire: p, phase: 'derives' }); try { r.derives = await mettreAJourDerives({ paire: p, dossier, fetchJson: lire, fetchOctets: lireOctetsImpl, maintenant }); } catch (e) { r.derives = { erreurs: [String(e.message).slice(0, 100)] }; } }
        rapport.push(r); journal('données ' + p + ' : ' + (r.erreur ? 'ERREUR ' + r.erreur : r.n + ' bougies jusqu’au ' + r.jourFin + ', ' + r.trous + ' trou(s)'));
      }
      return rapport;
    },
    /* Mise à jour COURTE (chaque minute) : bougies fermées depuis la dernière. Rend { BTC: nouvelles… } */
    async actualiser() { const out = {}; for (const p of paires) { try { const r = await histos[p].actualiser(); out[p] = { nouvelles: r.nouvelles ? r.nouvelles.length : 0, erreur: r.erreur || null }; } catch (e) { out[p] = { nouvelles: 0, erreur: String(e.message).slice(0, 100) }; } } return out; },
    kraken(dossierExtrait, p, intervalle = 15) { const s = lireKraken(dossierExtrait, p, intervalle); return { n: s.bougies.length, resume: s.resume, sources: s.sources }; }
  };
}
/* Intégrité d'une série M15 : horodatages strictement croissants, bougies cohérentes (h ≥ max(o,c), l ≤ min(o,c), prix > 0). Rend { ok, problemes }. */
export function verifierIntegrite(s) {
  let desordre = 0, incoherentes = 0, doublons = 0;
  for (let i = 0; i < s.n; i++) {
    if (i > 0) { if (s.t[i] === s.t[i - 1]) doublons++; else if (s.t[i] < s.t[i - 1]) desordre++; }
    if (!(s.o[i] > 0 && s.c[i] > 0 && s.h[i] >= Math.max(s.o[i], s.c[i]) - 1e-9 * s.h[i] && s.l[i] <= Math.min(s.o[i], s.c[i]) + 1e-9 * s.l[i])) incoherentes++;
  }
  return { ok: !desordre && !incoherentes && !doublons, desordre, incoherentes, doublons, n: s.n };
}
export { INTERVALLES };
