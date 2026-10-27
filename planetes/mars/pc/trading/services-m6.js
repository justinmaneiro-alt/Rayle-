import { calculerRegime } from '../agent-m6/regime.js';
import { chargerContexteRegime } from '../agent-m6/regime-donnees.js';
import { simulerEvaluation } from '../agent-m6/simulation-eval.js';
import { validerLecture, verifierSurDonnees, rapportCapture, dessinsDepuisCapture, dimensionsReduites } from '../agent-m6/capture.js';
import { construireSante } from '../agent-m6/sante.js';
import { recouper } from '../agent-m6/integrite.js';
import { analyserKraken, ORDRE_PAIRES } from '../agent-m6/paires.js';
import { verifierColonnes } from '../agent-m6/causalite.js';
import { lireGraphique } from '../agent-m6/chart-etat.js';
import { versBougies, tranche } from '../agent-btc/colonnes.js';
import { obtenirM6, commandeM6, m6Charge, infosStockageM6, synchroniserIdees } from './m6-page.js';
import { hotesChargees, obtenirHotePaire, paireActive } from './pilotes-paires.js';
import { journalErreurs, sauvegardesBtc } from './pilote-page.js';
import { GraphiqueAgent, bougiesDe } from './chart-api.js';

/* ═════════════ SERVICES DE LA PAGE POUR LES ONGLETS M6 (régime, simulation, capture, santé) ═════════════
   Chaque service appelle les modules purs avec les données des hôtes de paires ; rien de nouveau n'est calculé ici. Les réseaux sont injectables pour les tests
   (window.__RAYLE_POSTE_TEST__.lireReseau, .lireCapture, .lireKraken). Pas de donnée inventée : une source en panne = « indisponible ». */
const test = () => window.__RAYLE_POSTE_TEST__ || {};
const lireReseau = url => (test().lireReseau ? test().lireReseau(url) : fetch(url, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }));
const cacheRegime = {}, memoRegimes = {}, memoSimulations = {};

/* ── Régime de marché ── */
/* État du compte lisible (jamais l'objet brut) : nombre de trades, dernier enregistrement, taille. */
function resumeCompte(inst) {
  if (!inst || !inst.journal) return null;
  let tout = []; try { tout = inst.journal.tout() || []; } catch (e) { return null; }
  let taille = 0; try { taille = JSON.stringify(inst.etat()).length; } catch (e) { /* taille inconnue */ }
  const dernier = tout.reduce((m, x) => Math.max(m, Number(x.sortieLe || x.entreeLe || x.creeLe || 0)), 0);
  return { nTrades: tout.length, positionsOuvertes: tout.filter(x => !x.sortieLe && x.statut !== 'ferme').length, dernier: dernier || null, tailleKo: Math.round(taille / 102.4) / 10 };
}
export async function regimePour(paire, { force = false } = {}) {
  const h = await obtenirHotePaire(paire, { demarrer: true }), s = h.serie();
  if (!s || s.n < 1200) return { ok: false, erreur: 'historique de ' + paire + ' insuffisant : active l’agent pour cette paire' };
  const cle = paire + ':' + s.t[s.n - 1], m = memoRegimes[paire]; if (!force && m && m.cle === cle && Date.now() - m.quand < 10 * 60e3) return m.valeur;
  const ctx = await chargerContexteRegime({ paire, lire: lireReseau, cache: cacheRegime });
  const r = calculerRegime({ serie: s.n > 40000 ? tranche(s, s.n - 40000, s.n) : s, funding: ctx.funding, fearGreed: ctx.fearGreed, global: ctx.global, paire });
  if (r.ok) r.sources = { financement: ctx.financementEtat.etat, peurCupidite: ctx.fearGreed.etat, global: ctx.global.etat };
  memoRegimes[paire] = { cle, quand: Date.now(), valeur: r }; return r;
}
export const regimesMemo = () => Object.fromEntries(Object.entries(memoRegimes).map(([p, x]) => [p, x.valeur]));

/* ── Simulation de réussite de l'évaluation ── */
export async function simulationPour({ paire, strategie = null, hypothese = null, risques = null, graine = null }) {
  const m6 = await obtenirM6(), compte = m6.gardien().compte, regles = m6.etat().regles;
  let R, trades = null, freq, source;
  if (hypothese) {                                                      // « et si » : une stratégie supposée (taux de réussite, gain moyen en R, trades par semaine) — marqué HYPOTHÉTIQUE
    const taux = Math.max(0.05, Math.min(0.95, Number(hypothese.taux))), gain = Math.max(0.2, Math.min(10, Number(hypothese.gainR))), perte = Math.max(0.2, Math.min(3, Number(hypothese.perteR || 1)));
    if (![taux, gain, perte].every(Number.isFinite)) return { ok: false, erreur: 'paramètres de l’hypothèse invalides' };
    R = []; for (let i = 0; i < 200; i++) R.push((i + 0.5) / 200 < taux ? gain : -perte);
    freq = Number(hypothese.parSemaine) || 2; source = 'HYPOTHÉTIQUE : ' + Math.round(taux * 100) + ' % de réussite, +' + gain + ' R / −' + perte + ' R, ' + freq + ' trade(s) par semaine (rien de mesuré)';
  } else {
    const h = await obtenirHotePaire(paire, { demarrer: true }), tous = h.tousLesTrades().filter(x => x.strategie === strategie && x.source !== undefined);
    if (!tous.length) return { ok: false, erreur: 'cette stratégie n’a pas de trades hors échantillon ni de jeu final' };
    const liste = tous.filter(x => x.source !== 'entrainement'); R = liste.map(x => x.R); trades = liste.map(x => ({ R: x.R, tSortie: x.tSortie || x.t }));
    const t0 = Math.min(...liste.map(x => x.t)), t1 = Math.max(...liste.map(x => x.tSortie || x.t)), semaines = Math.max(1, (t1 - t0) / (7 * 86400e3)); freq = Math.max(0.2, Math.min(5, liste.length / semaines));
    const carte = h.vue().strategies.find(s => s.id === strategie); source = (carte ? carte.nom + ' (' + carte.statutLibelle + ')' : strategie) + ' · ' + liste.length + ' trades (hors échantillon, jeu final et suivi réel), ' + freq.toFixed(1).replace('.', ',') + ' par semaine' + (carte && carte.statut === 'rejetee' ? ' · NON VALIDÉE' : '');
  }
  const r = simulerEvaluation({ R, trades, tradesParSemaine: freq, regles, gain: compte.gainTotal, pic: compte.picEquite, risquesPct: risques || undefined, graine: graine == null ? undefined : graine });
  if (r.ok) { r.source = source; r.paire = paire; r.strategie = strategie; r.hypothetique = !!hypothese; }
  memoSimulations[paire] = r; memoSimulations.derniere = r; return r;
}
export const derniereSimulation = () => memoSimulations.derniere || null;

/* ── Capture d'écran ── */
export async function reduireImage(fichier, max = 1600) {
  const url = await new Promise((ok, ko) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => ko(new Error('lecture du fichier impossible')); f.readAsDataURL(fichier); });
  if (test().sansCanvas) return url;
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('ce fichier n’est pas une image lisible')); i.src = url; });
  const d = dimensionsReduites(img.naturalWidth, img.naturalHeight, max), c = document.createElement('canvas'); c.width = d.l; c.height = d.h; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, d.l, d.h); x.drawImage(img, 0, 0, d.l, d.h);
  return c.toDataURL('image/jpeg', 0.82);
}
export async function lireCapturePage({ image, paire, unite = null, consigne = '' }) {
  let brut;
  if (test().lireCapture) brut = await test().lireCapture(image, consigne);
  else {
    if (typeof workerReady === 'undefined' || !workerReady()) return { ok: false, erreur: 'Worker non configuré (⚙ Réglages de Raylé) : la lecture d’une capture passe par lui' };
    const res = await window.wfetch('/agent/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, consigne }) }, 70000);
    if (res.status === 404) return { ok: false, erreur: 'le Worker n’a pas encore la route /agent/capture (à déployer avec ton accord : voir docs/deploiement-worker.md)' };
    if (res.status === 429) return { ok: false, erreur: 'trop de captures envoyées, patiente une minute' };
    if (!res.ok) { let d = ''; try { d = (await res.json()).error || ''; } catch (e) { /* corps illisible */ } return { ok: false, erreur: 'le Worker a répondu ' + res.status + (d ? ' : ' + d : '') }; }
    brut = await res.json();
  }
  if (brut && brut.erreur) return { ok: false, erreur: brut.erreur };
  const val = validerLecture(brut && brut.lecture ? brut.lecture : brut); if (!val.ok) return { ok: false, erreur: val.erreur };
  const lecture = val.lecture, p = paire || lecture.paire || 'BTC', u = unite || lecture.unite || 'H1';
  const h = await obtenirHotePaire(p, { demarrer: true }), s = h.serie(); if (!s || !s.n) return { ok: false, erreur: 'historique de ' + p + ' absent : active l’agent pour cette paire' };
  const derniersPrix = {}; for (const [q, x] of Object.entries(hotesChargees())) { const sq = x.serie && x.serie(); if (sq && sq.n) derniersPrix[q] = sq.c[sq.n - 1]; }
  const verif = verifierSurDonnees(lecture, bougiesDe(s, u, 1500), { paire: p, derniersPrix }), rapport = rapportCapture(lecture, verif, { paire: p });
  return { ok: true, lecture, avertissements: val.avertissements, verification: verif, rapport, paire: p, unite: u, moteur: brut && brut.moteur || null, dessins: verif.ok ? dessinsDepuisCapture(lecture, verif, { maintenant: s.t[s.n - 1] }) : [], dessinsCales: verif.ok ? dessinsDepuisCapture(lecture, verif, { cale: true, maintenant: s.t[s.n - 1] }) : [] };
}

/* ── Santé de l'agent ── */
export async function recouperKraken(paire) {
  const h = await obtenirHotePaire(paire, { demarrer: true }), s = h.serie(); if (!s || s.n < 100) return { niveau: 'ko', phrase: 'pas d’historique à recouper' };
  let kr; try { kr = test().lireKraken ? await test().lireKraken(paire) : await fetch('/__veilleur/kraken?paire=' + paire, { cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); } catch (e) { return { niveau: 'inconnu', phrase: 'recoupement avec Kraken indisponible (' + String(e && e.message || e).slice(0, 60) + ') : Kraken n’accepte pas les appels directs du navigateur, il faut l’application PC (Veilleur) ou le Worker' }; }
  let bougies; try { bougies = analyserKraken(kr, paire); } catch (e) { return { niveau: 'ko', phrase: 'réponse de Kraken illisible : ' + e.message }; }
  const mien = versBougies(s, Math.max(0, s.n - 1500), s.n).filter(b => b.t >= (bougies[0] ? bougies[0].t : 0)), r = recouper(mien, bougies, { nomA: 'Binance', nomB: 'Kraken', tolPct: paire === 'DOGE' ? 1 : 0.5 });
  h.definirRecoupement(r); return r;
}
export async function santeGlobale() {
  const hotes = hotesChargees(), paires = {};
  for (const p of ORDRE_PAIRES) {
    const h = hotes[p] || (p === 'BTC' || paireActive(p) ? await obtenirHotePaire(p, { demarrer: true }).catch(() => null) : null);
    if (h && h.santeEntrees) paires[p] = h.santeEntrees(); else paires[p] = { n: 0 };
  }
  const v = ((hotes.BTC || Object.values(hotes)[0]) ? (hotes.BTC || Object.values(hotes)[0]).vue() : null);
  let sauv = null; try { if (sauvegardesBtc) sauv = await sauvegardesBtc.etat('pilote'); } catch (e) { /* illisible */ }
  let veilleur = { actif: false }; try { const r = await fetch('/__veilleur/chercheurs', { cache: 'no-store' }).then(x => x.json()); const en = Object.entries(r.chercheurs || {}).filter(([, c]) => c.enMarche); veilleur = en.length ? { actif: true, detail: 'recherche en arrière-plan : ' + en.map(([p]) => p).join(', ') } : { actif: true, detail: 'aucune recherche en arrière-plan en ce moment' }; } catch (e) { /* pas de serveur local */ }
  const m6 = await obtenirM6(), g = m6.gardien();
  const recherche = v ? { enCours: !!v.rechercheEnCours, pause: v.recherche.pause, objectifAtteint: v.recherche.objectifAtteint, N: v.recherche.N, majLe: v.recherche.miseAJourLe, stagnation: v.recherche.stagnation } : null;
  return { entrees: { paires, recherche, sauvegardes: sauv, veilleur, gardien: { niveau: g.verdict.niveau, phrase: g.verdict.phrase }, erreurs: journalErreurs.tout(), causalite: causaliteMemo }, m6: { charge: infosStockageM6().charge || null, resume: resumeCompte(m6Charge()), stockage: infosStockageM6() }, sante: null };
}
let causaliteMemo = null;
/* Test du poison du futur SUR TES DONNÉES : les indicateurs du graphique calculés sur la série entière, tronquée ou empoisonnée au-delà de plusieurs instants doivent donner les mêmes valeurs. */
export async function testerCausalite(paire = 'BTC') {
  const h = await obtenirHotePaire(paire, { demarrer: true }), s = h.serie(); if (!s || s.n < 3000) return { ok: false, phrase: 'pas assez de bougies pour le test' };
  const fin = tranche(s, s.n - 2400, s.n), colonnes = x => { const E = lireGraphique({ bougies: versBougies(x), indicateurs: ['ma200', 'ema50', 'rsi14', 'atr14', 'macd', 'bollinger', 'vwap', 'volume', 'delta', 'score'], derniers: 5000 }), o = {}; for (const [id, ind] of Object.entries(E.indicateurs)) for (const [n, t] of Object.entries(ind.valeurs)) o[id + '.' + n] = Float64Array.from(t, v => (v == null ? NaN : v)); return o; };
  const r = verifierColonnes(colonnes, fin, [900, 1500, 2100], { de: 300 });
  causaliteMemo = { ok: r.ok, phrase: r.ok ? 'Aucune fuite du futur sur tes ' + paire + ' (' + r.testes + ' contrôles, ' + new Date().toLocaleString('fr-FR') + ').' : 'FUITE DU FUTUR détectée sur ' + r.violations.length + ' mesure(s) : ' + r.violations[0].mesure + ' (' + r.violations[0].methode + ').' };
  return causaliteMemo;
}
export { construireSante, GraphiqueAgent, commandeM6, synchroniserIdees };

/* ── Traduction d'une idée collée en règle (Worker, À LA DEMANDE, une seule requête) ── */
export async function traduireIdeeWorker(texte) {
  if (test().traduireIdee) { try { const r = await test().traduireIdee(texte); return r && r.regle ? { ok: true, regle: r.regle, explication: r.explication || '' } : { ok: false, erreur: (r && r.erreur) || 'aucune règle' }; } catch (e) { return { ok: false, erreur: String(e && e.message || e) }; } }
  if (typeof workerReady === 'undefined' || !workerReady()) return { ok: false, erreur: 'Worker non configuré (⚙ Réglages de Raylé) : la traduction passe par lui. Tu peux aussi écrire la règle dans le constructeur du laboratoire.' };
  try {
    const res = await window.wfetch('/agent/idee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: String(texte).slice(0, 600) }) }, 40000);
    if (res.status === 404) return { ok: false, erreur: 'le Worker n’a pas encore la route /agent/idee (à déployer avec ton accord : voir docs/deploiement-worker.md)' };
    if (!res.ok) return { ok: false, erreur: 'le Worker a répondu ' + res.status };
    const j = await res.json(); return j.regle ? { ok: true, regle: j.regle, explication: j.explication || '' } : { ok: false, erreur: j.erreur || 'aucune règle dans la réponse' };
  } catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
}
