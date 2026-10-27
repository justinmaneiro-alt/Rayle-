import { creerRegistre } from '../agent-ms/registre-ms.js';
import { validerStrategie } from '../agent-ms/strategie-ms.js';
import { grouperPaires, courbesCapital, simulationProp } from '../agent-ms/test-ms.js';
import { avancerMS, etatMSVide, etiquetteConfiance, perfDirect } from '../agent-ms/alertes-ms.js';
import { traiter } from '../agent-ms/worker-ms.js';
import { configMoteurDe, coutsDe } from '../agent-m6/couts.js';
import { ORDRE_PAIRES } from '../agent-m6/paires.js';
import { tranche } from '../agent-btc/colonnes.js';
import { obtenirHotePaire, hotesChargees, paireActive } from './pilotes-paires.js';
import { GraphiqueAgent } from './chart-api.js';
import { jugerAlerteGlobal, obtenirM6 } from './m6-page.js';

/* ═════════════ « TESTE MA STRATÉGIE » CÔTÉ PAGE (V1) ═════════════
   Relie le moteur pur (planetes/mars/pc/agent-ms/) aux hôtes de paires (bougies), au graphique, à Rayle (alertes, voix), à la simulation de compte prop (gardien) et à Telegram.
   Les calculs lourds tournent dans un Worker de navigateur (worker-ms.js). Rien n'est envoyé hors de la page, sauf le message Telegram d'une alerte (route /telegram/envoyer du Worker Raylé, jeton jamais ici)
   et seulement si le Veilleur n'est pas déjà en train de l'envoyer. Aucun ordre, aucune clé de courtier, aucune IA sauf la traduction d'un texte libre, à la demande.
   Stockage : navigateur (`rayle_ms_registre`, `rayle_ms_etat`, `rayle_ms_rapports`), jamais le dépôt. Tests : window.__RAYLE_POSTE_TEST__ = { calculateurMS, sansAlertesMS, envoyerTelegram, lireVeilleur }. */
const test = () => window.__RAYLE_POSTE_TEST__ || {};
const CLE_REG = 'rayle_ms_registre', CLE_ETAT = 'rayle_ms_etat', CLE_RAPPORTS = 'rayle_ms_rapports', CLE_COUTS = 'rayle_ms_couts';
const lire = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, ecrire = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const json = (k, defaut) => { try { const t = lire(k); return t ? JSON.parse(t) : defaut; } catch (e) { return defaut; } };
const FENETRE_LIVE = 16000, MAX_RATTRAPAGE = 6;

/* ── registre et état des alertes ── */
let registre = creerRegistre(json(CLE_REG, null)), etatAlertes = (() => { const e = json(CLE_ETAT, null); return e && e.version === 1 && e.comptes ? e : etatMSVide(); })();
const rapports = json(CLE_RAPPORTS, {}), ecouteurs = new Set();
export const reg = () => registre;
export const surChangementMS = f => { ecouteurs.add(f); return () => ecouteurs.delete(f); };
const diffuser = () => { for (const f of ecouteurs) { try { f(); } catch (e) { /* écouteur cassé */ } } };
export function sauverRegistre() { ecrire(CLE_REG, JSON.stringify(registre.etat())); diffuser(); copierPourVeilleur(); }
const sauverEtat = () => ecrire(CLE_ETAT, JSON.stringify(etatAlertes));
export const rapportDe = id => rapports[id] || null;
function memoriserRapport(id, rapport) {
  // on garde le rapport pour l'affichage (les trades servent à la simulation de compte et aux repères du graphique) ; seulement les champs utiles, taille bornée
  const m = { ...rapport, trades: (rapport.trades || []).slice(-400).map(x => ({ t: x.t, tSortie: x.tSortie, sens: x.sens, prixEntree: x.prixEntree, prixSortie: x.prixSortie, stop: x.stop, R: x.R, motif: x.motif, regime: x.regime })) };
  rapports[id] = m; ecrire(CLE_RAPPORTS, JSON.stringify(rapports)); return m;
}
export const comptes = () => etatAlertes.comptes;
export const couts = paire => { const s = json(CLE_COUTS, {})[paire] || {}; return { ...coutsDe(paire), ...s }; };
export function reglerCouts(paire, patch, confirme) {
  if (!confirme) return { ok: false, erreur: 'changer les coûts exige une confirmation : seuls les VRAIS coûts de ton compte le justifient (les ajuster après avoir vu un résultat est de la sur-optimisation)' };
  const tous = json(CLE_COUTS, {}), p = {}; for (const k of ['fraisPct', 'spreadPct', 'glissementPct']) { const x = Number(patch[k]); if (patch[k] != null && Number.isFinite(x) && x >= 0 && x <= 1) p[k] = x; }
  tous[paire] = { ...(tous[paire] || {}), ...p }; ecrire(CLE_COUTS, JSON.stringify(tous)); return { ok: true };
}
const configDe = paire => { const c = couts(paire); return { fraisPct: c.fraisPct, spreadPct: c.spreadPct, glissementPct: c.glissementPct, risquePct: 1 }; };

/* ── calcul : Worker de navigateur, ou en processus (tests, navigateur sans Worker) ── */
let worker = null, noMsg = 0; const attentes = new Map();
function obtenirWorker() {
  if (test().calculateurMS) return test().calculateurMS;
  if (worker) return worker; if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('../agent-ms/worker-ms.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const a = attentes.get(e.data && e.data.id); if (!a) return; attentes.delete(e.data.id); e.data.type === 'erreur' ? a.ko(new Error(e.data.message)) : a.ok(e.data); };
    worker.onerror = e => { for (const a of attentes.values()) a.ko(new Error('Worker de calcul : ' + (e.message || 'erreur'))); attentes.clear(); worker = null; };
  } catch (e) { worker = null; }
  return worker;
}
function calculer(msg) {
  const w = obtenirWorker(), id = ++noMsg; msg = { ...msg, id };
  if (!w) return new Promise((ok, ko) => setTimeout(() => { try { ok(traiter(msg)); } catch (e) { ko(e); } }, 20));          // sans Worker : calcul dans la page (plus lent)
  if (typeof w === 'function') return Promise.resolve(w(msg));
  return new Promise((ok, ko) => { attentes.set(id, { ok, ko }); w.postMessage(msg); });
}

/* ── séries des paires ── */
async function serieDe(paire) {
  if (!(paire === 'BTC' || paireActive(paire) || hotesChargees()[paire])) return { ok: false, erreur: 'historique de ' + paire + ' absent : active l’agent pour cette paire (Système > Santé)' };
  const h = await obtenirHotePaire(paire, { demarrer: false }), s = h.serie();
  if (!s || s.n < 3000) return { ok: false, erreur: 'historique de ' + paire + ' insuffisant : active l’agent pour cette paire' };
  return { ok: true, s };
}

/* ── test d'une stratégie sur une ou plusieurs paires (zone de recherche seulement ; jeu final jamais touché) ── */
export async function testerSurPaires(id, paires, { progres = () => {}, tirages = undefined } = {}) {
  const rec = registre.obtenir(id); if (!rec) return { ok: false, erreur: 'stratégie introuvable' };
  const v = validerStrategie(rec.strategie); if (!v.ok) return { ok: false, erreur: 'stratégie invalide : ' + v.erreurs.join(' ; ') };
  const nVariantes = registre.variantesAvecTest(id), par = {};
  for (const p of paires) {
    progres('Test sur ' + p + '…');
    const s = await serieDe(p); if (!s.ok) { par[p] = { ok: false, erreur: s.erreur }; continue; }
    try { const r = await calculer({ type: 'tester', m15: s.s, strat: v.strategie, config: configDe(p), nVariantes, tirages }); par[p] = r.rapport; }
    catch (e) { par[p] = { ok: false, erreur: 'calcul impossible : ' + String(e && e.message || e) }; }
  }
  const utiles = Object.entries(par).filter(([, r]) => r.ok);
  if (!utiles.length) return { ok: false, erreur: Object.values(par).map(r => r.erreur).join(' ; '), paires: par };
  const groupe = utiles.length > 1 ? grouperPaires(par) : null;
  const meilleur = groupe || utiles[0][1], enr = registre.enregistrerTest(id, { verdict: meilleur.verdict.code, paires: utiles.map(([p]) => p), esperance: meilleur.stats.esperance, n: meilleur.n });
  const res = { ok: true, id, t: Date.now(), cle: rec.cle, nVariantes: enr ? enr.nVariantes : nVariantes, nouvelleVariante: enr ? enr.nouvelle : true, paires: {}, groupe: groupe && { ...groupe, trades: undefined }, jeuFinalTouche: false };
  for (const [p, r] of Object.entries(par)) res.paires[p] = r.ok ? memoriserRapport(id + ':' + p, r) : r;
  const tousTrades = utiles.flatMap(([p, r]) => r.trades.map(x => ({ ...x, paire: p })));
  res.capital = courbesCapital(tousTrades, { capital: 10000, risques: [0.25, 0.5, 1] });
  try { const m6 = await obtenirM6(), vue = m6.vue(); res.prop = simulationProp(tousTrades, { regles: vue.regles, gain: vue.compte.gainTotal, pic: vue.compte.picEquite, risques: [0.25, 0.5, 1] }); } catch (e) { res.prop = simulationProp(tousTrades, { risques: [0.25, 0.5, 1] }); }
  rapports[id] = { t: res.t, cle: rec.cle, nVariantes: res.nVariantes, groupe: res.groupe, capital: res.capital, prop: res.prop, paires: Object.keys(res.paires) }; ecrire(CLE_RAPPORTS, JSON.stringify(rapports));
  sauverRegistre(); return res;
}
export const dernierResume = id => rapports[id] || null;

/* ── repères sur le graphique : les derniers trades du test (entrée, sortie) ── */
export async function tracerSignaux(id, paire, max = 40) {
  const rec = registre.obtenir(id), r = rapports[id + ':' + paire]; if (!rec || !r || !r.trades) return { ok: false, erreur: 'lance d’abord un test sur ' + paire };
  const groupe = 'Mes stratégies · ' + rec.nom; try { GraphiqueAgent.effacer(paire, groupe); } catch (e) { /* groupe absent */ }
  let n = 0;
  for (const x of r.trades.slice(-max)) {
    const a = await GraphiqueAgent.tracer(paire, { type: 'marqueur', quand: x.t, prix: x.prixEntree, forme: x.sens > 0 ? 'fleche_haut' : 'fleche_bas', etiquette: (x.sens > 0 ? 'Achat' : 'Vente') + ' ' + rec.nom, groupe, couleur: x.sens > 0 ? 'haussier' : 'baissier' });
    const b = await GraphiqueAgent.tracer(paire, { type: 'marqueur', quand: x.tSortie, prix: x.prixSortie, forme: 'cercle', etiquette: 'Sortie ' + (x.R >= 0 ? '+' : '−') + Math.abs(x.R).toFixed(1).replace('.', ',') + ' R', groupe, couleur: x.R >= 0 ? 'haussier' : 'baissier' });
    if ((a && a.ok !== false) || (b && b.ok !== false)) n++;
  }
  return { ok: true, n, groupe };
}

/* ── alertes : à chaque bougie M15 fermée, pour les stratégies VALIDÉES par l'utilisatrice et mises en alertes ── */
export function strategiesEnAlertes() {
  return registre.alertesActives().map(r => {
    const direct = [], dv = r.dernierTest && r.dernierTest.cle === r.cle ? r.dernierTest.verdict : (r.variantes.length ? r.variantes[r.variantes.length - 1].verdict : null);
    for (const k of Object.keys(etatAlertes.comptes)) if (k.startsWith(r.id + ':')) direct.push(...(etatAlertes.comptes[k].fermees || []));
    return { id: r.id, nom: r.nom, strategie: r.strategie, confiance: etiquetteConfiance({ dernierVerdict: dv, direct: perfDirect({ fermees: direct }) }) };
  });
}
export const performanceDirect = id => { const f = []; let ouvertes = 0; for (const [k, c] of Object.entries(etatAlertes.comptes)) if (k.startsWith(id + ':')) { f.push(...(c.fermees || [])); ouvertes += (c.ouvertes || []).length + (c.attente || []).length; } return { ...perfDirect({ fermees: f }), ouvertes, fermees: f.slice(-20) }; };

const veilleurActif = async () => { if (test().lireVeilleur) return !!(await test().lireVeilleur()); try { const r = await fetch('/__veilleur/etat', { cache: 'no-store' }); return r.ok ? !!(await r.json()).enMarche : false; } catch (e) { return false; } };
async function copierPourVeilleur() {
  if (test().sansVeilleurMS) return;
  try { await fetch('/__veilleur/ms-etat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1' }, body: JSON.stringify({ strategies: strategiesEnAlertes() }) }); } catch (e) { /* le Veilleur n'est pas joint : l'application ouverte suffit */ }
}
const nomPaire = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' };
export function alerteMSVersRayle(a) {
  const bus = window.RayleBus;
  try { if (bus) bus.emit('raylé:alerte-prix', { actif: a.paire + ' · ' + a.nomStrategie + ' · ' + a.etiquette, texte: a.texte + (a.jugement ? ' · ' + a.jugement.texte : ''), prix: a.entree || a.sortie }); } catch (e) { /* bus absent */ }
  try { if (window.Entite && Entite.alerte) Entite.alerte(7000); if (bus) bus.emit('raylé:alerte', { ms: 7000 }); } catch (e) { /* entité absente */ }
  try { if (typeof addLine === 'function') addLine('sys', (a.type === 'ENTREE' ? '🚨 ' : '↩ ') + a.texte); } catch (e) { /* journal absent */ }
  if (a.type === 'ENTREE') { try { if (typeof speak === 'function') speak('Justin, signal de ta stratégie ' + a.nomStrategie + ', ' + (a.etiquette === 'NON VALIDÉE' ? 'non validée' : a.etiquette.toLowerCase()) + ' : ' + (a.sens > 0 ? 'achat ' : 'vente ') + (nomPaire[a.paire] || a.paire) + '.'); } catch (e) { /* voix absente */ } }
}
async function envoyerTelegram(a) {
  const envoyer = test().envoyerTelegram || (async (texte, type) => {
    if (typeof workerReady !== 'function' || !workerReady()) throw new Error('Worker verrouillé');
    const res = await window.wfetch('/telegram/envoyer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte, type }) }, 20000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
  });
  await envoyer((a.type === 'ENTREE' ? (a.jugement && a.jugement.decision === 'BLOCK' ? '⛔ ' : '🟢 ') : '🟡 ') + '[' + a.paire + '] ' + a.texte + (a.jugement ? ' · ' + a.jugement.texte : '') + (a.aide ? '\nRégime : ' + a.aide.regime : ''), a.type === 'ENTREE' ? 'OBSERVATION' : 'OBSERVATION');
}
let verrouTick = false;
export async function tickAlertesMS({ diffuserAlerte = alerteMSVersRayle } = {}) {
  if (verrouTick) return []; verrouTick = true;
  const sorties = [];
  try {
    const strats = strategiesEnAlertes(); if (!strats.length) return [];
    const parVeilleur = await veilleurActif();
    for (const p of ORDRE_PAIRES) {
      const h = hotesChargees()[p] || (p === 'BTC' || paireActive(p) ? await obtenirHotePaire(p, { demarrer: true }).catch(() => null) : null); if (!h) continue;
      const s = h.serie(); if (!s || s.n < 3000) continue;
      const derniere = etatAlertes.derniereBarre[p] || null, idx = []; for (let i = s.n - 1; i >= 0 && idx.length < MAX_RATTRAPAGE && (derniere == null || s.t[i] > derniere); i--) idx.unshift(i);
      if (derniere == null) idx.splice(0, idx.length - 1);        // première fois : on part de la dernière bougie, rien n'est rejoué
      if (!idx.length) continue;
      const fenetres = idx.map(i => tranche(s, Math.max(0, i + 1 - FENETRE_LIVE), i + 1));
      const r = await calculer({ type: 'avancer', fenetres, strategies: strats, etat: etatAlertes, paire: p, config: configDe(p) });
      etatAlertes = r.etat; sauverEtat();
      for (const a of r.alertes) {
        if (a.type === 'ENTREE') { try { const g = jugerAlerteGlobal({ ...a, entree: a.entree, cible: a.cible }); if (g) { a.jugement = g; a.texte = (g.decision === 'BLOCK' ? 'BLOQUÉ par le gardien · ' : '') + a.texte; } } catch (e) { /* gardien indisponible */ } }
        try { diffuserAlerte(a); } catch (e) { /* la présentation ne bloque jamais le suivi */ }
        if (!parVeilleur) { try { await envoyerTelegram(a); } catch (e) { /* Telegram indisponible : l'alerte reste dans Rayle */ } }
        sorties.push(a);
      }
    }
    diffuser();
  } finally { verrouTick = false; }
  return sorties;
}
let minuterie = null;
export function demarrerAlertesMS({ periodeMs = 60000 } = {}) {
  if (minuterie || test().sansAlertesMS) return () => {};
  minuterie = setInterval(() => { if (!document.hidden) tickAlertesMS().catch(() => {}); }, periodeMs); setTimeout(() => tickAlertesMS().catch(() => {}), 4000);
  return () => { clearInterval(minuterie); minuterie = null; };
}
export const _reinitialiser = (etat = null) => { registre = creerRegistre(etat); etatAlertes = etatMSVide(); for (const k of Object.keys(rapports)) delete rapports[k]; };

/* ── texte libre → règle structurée par l'IA (à la demande, une seule fois ; route /agent/idee du Worker, comme le laboratoire) ── */
export async function traduireTexteIA(texte) {
  const traduire = test().traduireIdee || (async t => {
    if (typeof workerReady !== 'function' || !workerReady()) throw new Error('Worker non configuré (⚙ Réglages de Raylé)');
    const res = await window.wfetch('/agent/idee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: t }) }, 40000);
    if (res.status === 404) throw new Error('le Worker n’a pas encore la route /agent/idee (à déployer avec ton accord : voir docs/deploiement-worker.md)');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  });
  let rep; try { rep = await traduire(String(texte).slice(0, 600)); } catch (e) { return { ok: false, erreur: 'Traduction impossible : ' + String(e && e.message || e) }; }
  if (!rep || !rep.regle) return { ok: false, erreur: (rep && rep.erreur) || 'Le Worker n’a pas pu traduire cette idée en règle.' };
  const { depuisRegleLab } = await import('../agent-ms/strategie-ms.js'), v = depuisRegleLab(rep.regle);
  return v.ok ? { ok: true, strategie: v.strategie, explication: rep.explication || null, avertissements: v.avertissements } : { ok: false, erreur: 'La règle proposée est refusée : ' + v.erreurs.join(' ; ') };
}
export const historiqueDispo = async () => { const o = {}; for (const p of ORDRE_PAIRES) { try { o[p] = p === 'BTC' || paireActive(p) || !!hotesChargees()[p]; } catch (e) { o[p] = false; } } return o; };
/* tests : placer la dernière bougie traitée (pour rejouer quelques bougies sans attendre un vrai quart d'heure) */
export const _test = { definirDerniereBarre: (p, t) => { etatAlertes.derniereBarre[p] = t; }, etat: () => etatAlertes, rapports: () => rapports };
