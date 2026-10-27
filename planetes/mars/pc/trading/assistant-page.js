import { analyserAssistant, limiterFrequence } from '../agent-m6c/assistant-regime.js';
import { STATUTS_M6C } from '../agent-m6c/resultats-m6c.js';
import { chargerContexteRegime } from '../agent-m6/regime-donnees.js';
import { obtenirHotePaire } from './pilotes-paires.js';
import { GraphiqueAgent } from './chart-api.js';
import { jugerAlerteGlobal } from './m6-page.js';

/* ═════════════ ASSISTANT DE RÉGIME, CÔTÉ PAGE (M6c) ═════════════
   Relie assistant-regime.js (pur) aux hôtes de paires (bougies), au graphique (zones de régime, bornes, niveaux de cassure : groupe « regime-m6c »), à Rayle (alertes) et à la voix.
   Calcul local, aucune IA, aucun ordre. Les alertes respectent la fréquence maximale (criteres-m6c.js) ; l'historique des alertes vit dans le navigateur (`rayle_m6c_hist`).
   Telegram : envoyé par le Veilleur (app-pc/veilleur/chercheur.mjs), pas d'ici, pour ne pas doubler les messages. */
const test = () => window.__RAYLE_POSTE_TEST__ || {};
const lireReseau = url => (test().lireReseau ? test().lireReseau(url) : fetch(url, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }));
const memo = {}, cacheDonnees = {}, CLE_HIST = 'rayle_m6c_hist', CLE_ACTIF = 'rayle_m6c_actif';
const lireLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, ecrireLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage interdit */ } };
export const assistantActif = () => lireLocal(CLE_ACTIF) !== '0';
export const reglerAssistant = on => ecrireLocal(CLE_ACTIF, on ? '1' : '0');
export const assistantsMemo = () => Object.fromEntries(Object.entries(memo).map(([p, x]) => [p, x.valeur]));

/* Analyse d'une paire à partir de son hôte (bougies chargées). Mémorisée tant que la dernière bougie fermée ne change pas. */
export async function assistantPour(paire, { force = false } = {}) {
  const h = await obtenirHotePaire(paire, { demarrer: true }), s = h.serie();
  if (!s || s.n < 3000) return { ok: false, paire, erreur: 'historique de ' + paire + ' insuffisant : active l’agent pour cette paire' };
  const cle = paire + ':' + s.t[s.n - 1], m = memo[paire]; if (!force && m && m.cle === cle) return m.valeur;
  let funding = null; try { const c = await chargerContexteRegime({ paire, lire: lireReseau, cache: cacheDonnees }); funding = c.funding; } catch (e) { /* le financement est facultatif */ }
  const valeur = analyserAssistant({ serie: s, paire, statuts: STATUTS_M6C[paire] || {}, funding, maintenant: Date.now() });
  memo[paire] = { cle, valeur, nouveau: true }; return valeur;
}

export async function tracerRegime(paire, a) {
  if (!a || !a.ok) return 0;
  try { GraphiqueAgent.effacer(paire, 'regime-m6c'); } catch (e) { /* groupe absent */ }
  let n = 0; for (const d of a.dessins) { try { const r = await GraphiqueAgent.tracer(paire, d); if (r && r.ok !== false) n++; } catch (e) { /* un dessin refusé ne bloque pas les autres */ } }
  return n;
}

export function alerteRegimeVersRayle(a) {
  const bus = window.RayleBus, icone = { ENTREE: '🚨', SORTIE: '⚠️', RANGE: '⏸', ATTENTION: '⚠️', OBSERVATION: '👁' }[a.type] || '·';
  try { if (bus) bus.emit('raylé:alerte-prix', { actif: a.paire + ' · ' + ({ RANGE: 'NE PAS ENTRER', SORTIE: 'ÇA CRAINT', ATTENTION: 'ATTENTION', ENTREE: 'ENTRÉE', OBSERVATION: 'INFORMATION' }[a.type] || a.type), texte: a.texte, prix: a.entree || a.prix || null, t: a.t }); } catch (e) { /* fenêtre indisponible */ }
  if (a.type === 'ENTREE' || a.type === 'SORTIE') { try { if (window.Entite && Entite.alerte) Entite.alerte(9000); if (bus) bus.emit('raylé:alerte', { ms: 9000 }); } catch (e) { /* entité absente */ } }
  try { if (typeof addLine === 'function') addLine('sys', icone + ' Assistant de régime · ' + a.texte); } catch (e) { /* journal absent */ }
  if (a.type === 'SORTIE' || a.type === 'ENTREE') { try { if (typeof speak === 'function') speak(a.type === 'SORTIE' ? 'Justin, ça craint sur ' + a.paire + '. ' + a.raisons.map(r => r.texte).slice(0, 2).join('. ') + '.' : 'Justin, setup ' + a.paire + ' de l’assistant de régime. Ce n’est pas un conseil.'); } catch (e) { /* voix indisponible */ } }
}

/* Un passage de l'assistant : pour chaque paire fournie, analyse, trace sur le graphique, et diffuse les alertes nouvelles (fréquence limitée). Rend les alertes diffusées. */
export async function assistantTick(paires, { diffuser = alerteRegimeVersRayle } = {}) {
  if (!assistantActif()) return [];
  const sorties = [];
  for (const p of paires) {
    try {
      const m = memo[p], avant = m && m.cle, a = await assistantPour(p), neuf = !memo[p] || memo[p].cle !== avant || (memo[p] && memo[p].nouveau);
      if (!a.ok || !neuf) continue; memo[p].nouveau = false;
      await tracerRegime(p, a);
      let hist = []; try { hist = JSON.parse(lireLocal(CLE_HIST) || '[]'); } catch (e) { hist = []; }
      const r = limiterFrequence(a.alertes.map(x => ({ ...x, paire: p })), hist, Date.now()); ecrireLocal(CLE_HIST, JSON.stringify(r.historique.slice(-60)));
      for (const al of r.gardees) { if (al.type === 'ENTREE') { try { const g = jugerAlerteGlobal(al); if (g) { al.gardien = g; al.texte = (g.decision === 'BLOCK' ? 'BLOQUÉ par le gardien · ' : '') + al.texte + ' · ' + g.texte; } } catch (e) { /* gardien indisponible : alerte présentée sans jugement */ } } try { diffuser(al); } catch (e) { /* diffusion cassée */ } sorties.push(al); }
    } catch (e) { /* une paire en chargement : au prochain passage */ }
  }
  return sorties;
}

export async function repondreVoixM6c(det) {
  const { repondreM6c } = await import('../agent-m6c/voix-m6c.js'), { tableauM6c } = await import('../agent-m6c/performance-m6c.js');
  const paire = det.paire || (window.PosteAgent && window.PosteAgent.paire && window.PosteAgent.paire()) || 'BTC', a = await assistantPour(paire, { force: true });
  if (a.ok) await tracerRegime(paire, a);
  return repondreM6c(det, a, tableauM6c({ paire }));
}
