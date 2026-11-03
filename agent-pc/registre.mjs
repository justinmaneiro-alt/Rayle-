// KEPLER V8 : LE REGISTRE UNIQUE DES TRADES (construit par le service à partir des deux moteurs, Trader et Volume, puis publié dans le Worker / D1).
// Chaque écran (PC, tablette, téléphone) lit CE registre et le calcule avec shared/portfolio.js : plus aucun calcul de portefeuille ailleurs.
// Rôle du service : construire les lignes, numéroter la version (elle ne change que si une ligne change), appliquer la règle « jamais deux sens sur un actif » entre les deux moteurs,
// journaliser les signaux ignorés, envoyer les notifications (proposition, entrée touchée, sortie) depuis les CHANGEMENTS du registre. SIMULATION UNIQUEMENT.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { lireJson, ecrireJson } from './etat-agent.mjs';
const K = createRequire(import.meta.url)('../shared/portfolio.js');

export const FICHIER_REGISTRE = 'registre.json', FICHIER_CORRECTIONS = 'registre-corrections.json';   // corrections : écrites par tools/audit-kepler.mjs (trades recalculés sur les vraies bougies Kraken)
const PAS = { M15: 900e3, H1: 3600e3 }, MAX_LIGNES = 1500, MAX_IGNORES = 200;
const sansSuffixe = n => String(n || '—').replace(/\s*[·\-–|]\s*(H1|M15|H4)\s*$/i, '').trim();
const STATUT_TRADER = { en_attente: 'en_attente', ouverte: 'ouverte', cloturee: 'cloturee', expiree: 'annulee', annulee: 'annulee', perdue: 'annulee' };
const STATUT_VOLUME = { en_attente: 'en_attente', ouverte: 'ouverte', terminee: 'cloturee', annulee: 'annulee' };

/* Prix de sortie RÉEL d'un trade du moteur Trader (sortie partielle possible : on garde le niveau de la DERNIÈRE sortie). */
function sortieTrader(p, R) {
  const m = String((p.resultat && p.resultat.motif) || '');
  if (/cible 2/.test(m)) return p.cible2; if (/cible 1/.test(m)) return p.cible1;
  if (/remont|entrée/.test(m)) return p.entree; if (/stop touché/.test(m) && !/suiveur/.test(m)) return p.stop;
  return null;   // sortie au temps / suiveur : déduit du R par le module
}
export function ligneTrader(p, debutV8) {
  const statut = STATUT_TRADER[p.statut]; if (!statut || p.fantome || p.source === 'retro') return null;
  const r = p.resultat || null, R = statut === 'cloturee' && r && Number.isFinite(r.R) ? r.R : null;
  const ancien = p.tf === 'H1' && (p.tSignal || 0) < debutV8;
  return { id: p.id, actif: p.actif, sens: p.sens, strategie: sansSuffixe(p.nom || p.setup), source: 'trader', tf: 'M15', contexte: p.tf === 'H1' ? 'H1' : null, ancienFormat: ancien,
    // heure du signal = CLÔTURE de la bougie M15 qui l'a donné (le moteur garde son ouverture) ; validité = ttl bougies ensuite
    tSignal: p.tSignal + PAS.M15, tValide: p.tSignal + ((p.ttl || 16) + 1) * PAS.M15, tEntree: p.tEntree || null, entree: p.entree, stop: p.stop, tp: p.cible1 ?? null, tp2: p.cible2 ?? null,
    statut, tSortie: statut === 'cloturee' ? (p.tSortieBougie || p.tSortie || null) : (statut === 'annulee' ? p.tSortie || null : null), sortie: statut === 'cloturee' ? sortieTrader(p, R) : null,
    raison: statut === 'cloturee' ? K.raisonSortie(r && r.motif, R) : statut === 'annulee' ? (/expir/.test((r && r.motif) || p.statut) ? 'expiration' : 'annulee') : null,
    motif: (r && r.motif) || '', fraisR: r && Number.isFinite(r.couts) ? r.couts : null, R, note: p.raison || '' };
}
export function ligneVolume(sg, debutV8) {
  const statut = STATUT_VOLUME[sg.statut]; if (!statut) return null;
  const cible = sg.sens > 0 ? sg.niveau + sg.rr * (sg.niveau - sg.stop) : sg.niveau - sg.rr * (sg.stop - sg.niveau), ancien = sg.tf === 'H1' && (sg.format === 'ancien' || (sg.tSignal || 0) < debutV8);
  const R = statut === 'cloturee' && Number.isFinite(sg.R) ? sg.R : null, motif = sg.resultat === 'stop' ? 'stop touché' : sg.resultat === 'cible' ? 'cible atteinte' : sg.resultat === 'temps' ? 'sortie au temps' : String(sg.resultat || sg.raison_fin || '');
  return { id: sg.id, actif: sg.actif, sens: sg.sens, strategie: sansSuffixe((sg.nom || sg.setup || '').replace(/_/g, ' ')), source: 'volume', tf: 'M15', contexte: sg.tf === 'H1' ? 'H1' : null, ancienFormat: ancien,
    tSignal: sg.tSignal, tValide: sg.tBarre + ((sg.validite || 4) + 1) * (ancien ? PAS.H1 : (sg.tf === 'H1' ? PAS.H1 : PAS.M15)), tEntree: sg.tEntree || null, entree: sg.niveau, stop: sg.stop, tp: cible,
    statut, tSortie: statut === 'cloturee' ? sg.tSortie || null : null, sortie: statut === 'cloturee' && Number.isFinite(sg.sortie) ? sg.sortie : null,
    raison: statut === 'cloturee' ? K.raisonSortie(motif, R) : statut === 'annulee' ? (/barres|délai|expir/.test(sg.raison_fin || '') ? 'expiration' : 'annulee') : null, motif, fraisR: Number.isFinite(sg.fraisR) ? sg.fraisR : null, R, note: sg.raison || '' };
}

export function creerRegistre({ dossier, maintenant = () => Date.now(), journal = () => {}, erreur = () => {} } = {}) {
  const fichier = path.join(dossier, FICHIER_REGISTRE);
  let etat = lireJson(fichier, null); if (!etat || etat.schema !== 1) etat = { schema: 1, version: 0, empreinte: null, debutV8: maintenant(), risquePct: K.RISQUE_DEFAUT, ignores: [], statuts: null, corrections: {}, trades: [], t: null };
  if (!etat.debutV8) etat.debutV8 = maintenant(); if (!Array.isArray(etat.ignores)) etat.ignores = []; if (!etat.corrections) etat.corrections = {};
  let sources = { trader: () => [], volume: () => [] };
  const sauver = () => { try { ecrireJson(fichier, etat, { copies: 1 }); } catch (e) { erreur('registre', e); } };

  /* Lignes vivantes des DEUX moteurs (pour la règle des sens opposés), calculées depuis les états bruts : elles ne dépendent pas du dernier registre publié. */
  function vivants() { const out = []; for (const [src, f] of Object.entries(sources)) { try { for (const x of f() || []) { const l = src === 'trader' ? ligneTrader(x, etat.debutV8) : ligneVolume(x, etat.debutV8); if (l && (l.statut === 'ouverte' || l.statut === 'en_attente')) out.push(l); } } catch (e) { /* source indisponible */ } } return out; }
  /* Règle commune : un signal de sens opposé à une position vivante (ouverte ou en attente) du même actif est IGNORÉ et journalisé. Rend true si le signal doit être ignoré. */
  function filtrerSignal(sig) {
    const c = K.conflitInverse(vivants(), sig); if (!c) return false;
    const ig = { id: 'ignore|' + sig.id, actif: sig.actif, sens: sig.sens, strategie: sansSuffixe(sig.strategie), source: sig.source, tf: 'M15', tSignal: sig.tSignal, entree: sig.entree, stop: sig.stop, tp: sig.tp ?? null, statut: 'ignoree',
      raison: 'ignore_inverse', note: 'ignoré : position inverse ouverte (' + (c.sens > 0 ? 'achat' : 'vente') + ' ' + c.actif + ' ' + (c.statut === 'ouverte' ? 'en cours' : 'en attente') + ')' };
    if (!etat.ignores.some(x => x.id === ig.id) && Number.isFinite(+ig.entree) && Number.isFinite(+ig.stop)) { etat.ignores.push(ig); etat.ignores = etat.ignores.slice(-MAX_IGNORES); journal('registre', ig.note + ' — signal ' + (sig.sens > 0 ? 'ACHAT' : 'VENTE') + ' ' + sig.actif + ' (' + ig.strategie + ').'); }
    return true;
  }

  /* Reconstruit le registre ; la version ne monte que si une ligne a changé. Rend { registre, change }. */
  function construire() {
    try { const c = lireJson(path.join(dossier, FICHIER_CORRECTIONS), null); if (c && c.corrections) etat.corrections = c.corrections; } catch (e) { /* pas d'audit */ }
    const lignes = []; const vus = new Set();
    for (const [src, f] of Object.entries(sources)) { let liste = []; try { liste = f() || []; } catch (e) { erreur('registre : source ' + src, e); }
      for (const x of liste) { const l = src === 'trader' ? ligneTrader(x, etat.debutV8) : ligneVolume(x, etat.debutV8); if (!l || vus.has(l.id)) continue; vus.add(l.id); const corr = etat.corrections[l.id]; lignes.push(corr ? { ...l, ...corr, audite: true } : l); } }
    for (const ig of etat.ignores) if (!vus.has(ig.id)) { vus.add(ig.id); lignes.push(ig); }
    lignes.sort((a, b) => (a.tSignal || 0) - (b.tSignal || 0) || (a.id < b.id ? -1 : 1));
    const trades = lignes.slice(-MAX_LIGNES), h = K.empreinte(JSON.stringify(trades) + '|' + etat.risquePct), change = h !== etat.empreinte;
    if (change) { etat.version = (etat.version || 0) + 1; etat.empreinte = h; etat.trades = trades; etat.t = maintenant(); }
    return { registre: publie(), change };
  }
  const publie = () => ({ v: 1, version: etat.version, t: etat.t, risquePct: etat.risquePct, debut: etat.debutV8, trades: etat.trades });

  /* Notifications à partir des CHANGEMENTS de statut (une seule voie pour les deux moteurs). Au tout premier passage : rien n'est envoyé (on apprend l'état actuel). */
  function evenements(prix = {}) {
    const calc = K.calculer(publie(), prix, { maintenant: maintenant() }), avant = etat.statuts, apres = {}, ev = [];
    const vivantes = new Map(calc.vivantes.map(l => [l.id, l]));
    for (const t of calc.trades) {
      apres[t.id] = t.statut; if (!avant) continue; const a = avant[t.id];
      if (a === t.statut) continue;
      if (!a && t.statut === 'en_attente') ev.push({ type: 'proposition', ligne: vivantes.get(t.id) || t });
      if (t.statut === 'ouverte' && a !== 'ouverte') ev.push({ type: 'entree', ligne: vivantes.get(t.id) || t });
      if (t.statut === 'cloturee' && a !== 'cloturee') ev.push({ type: 'sortie', ligne: { ...t, numero: (calc.numeros[t.id] || 1), pnlUsd: calc.pnl[t.id] ? calc.pnl[t.id].usd : null } });
    }
    etat.statuts = apres; return ev;
  }
  function reglerRisque(r) { const x = K.bornerRisque(r); if (x === etat.risquePct) return false; etat.risquePct = x; journal('registre', 'Risque par trade réglé à ' + x + ' % (réglage du Worker).'); return true; }
  /* Corrections de l'audit (tools/audit-kepler.mjs) : remplacent les champs recalculés sur les vraies bougies, sans toucher aux moteurs. */
  function appliquerCorrections(c) { etat.corrections = { ...etat.corrections, ...c }; etat.empreinte = null; }

  return { brancher: s => { sources = { ...sources, ...s }; }, vivants, filtrerSignal, construire, publie, evenements, reglerRisque, appliquerCorrections, sauver, etat: () => etat, fichier };
}
export const lireRegistre = dossier => { const e = lireJson(path.join(dossier, FICHIER_REGISTRE), null); return e && e.schema === 1 ? { v: 1, version: e.version, t: e.t, risquePct: e.risquePct, debut: e.debutV8, trades: e.trades || [] } : null; };
export const registreExiste = dossier => fs.existsSync(path.join(dossier, FICHIER_REGISTRE));
