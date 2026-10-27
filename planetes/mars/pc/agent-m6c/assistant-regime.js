import { tranche } from '../agent-btc/colonnes.js';
import { percentile } from '../agent-m6/regime.js';
import { CODES, decrire, segments } from './detecteur-regime.js';
import { CRITERES_M6C } from './criteres-m6c.js';
import { contexteRegime, REGLES, ORDRE_REGLES } from './regles-regime.js';

/* ═════════════ ASSISTANT DE MARCHÉ PAR RÉGIME, TEMPS RÉEL (M6c ; module pur, testé : m6c-assistant-test.mjs) ═════════════
   À partir des dernières bougies M15 FERMÉES d'une paire, dit dans quel état est le marché et ce que chaque règle en pense. Zéro IA : des règles et des modèles de phrases.
   - Une règle n'émet un signal d'ENTRÉE que si son statut est « SIGNAL » (elle a passé TOUS les critères de criteres-m6c.js, jeu final compris). Sinon elle est en « INFORMATION » : l'assistant
     décrit (« cassure valide, volume confirmé »), il ne propose pas d'entrée. Les statuts viennent de resultats-m6c.js (mesures réelles) ; sans eux, tout est INFORMATION.
   - « NE PAS ENTRER : range » est un filtre, donc une consigne d'information toujours permise.
   - « ÇA CRAINT » (sortie) : perte de structure, volume d'épuisement, divergence, financement extrême, régime qui change, clôture sous le stop suiveur — avec la RAISON de chacun.
   - Les alertes respectent une fréquence maximale par type (`limiterFrequence`). Le gardien prop juge la PRÉSENTATION des entrées (comme pour l'agent existant) ; aucun ordre n'existe. */
const FENETRE_BOUGIES = 30000;                                    // ≈ 312 jours de M15 : de quoi chauffer la MA200 H1 et le contexte
const fmt = x => Math.round(x).toLocaleString('fr-FR');
const NOM_PAIRE = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' };

/* RSI de Wilder (période 14) sur un tableau de clôtures. */
export function rsi(c, p = 14) {
  const n = c.length, out = new Float64Array(n).fill(NaN); if (n <= p) return out;
  let g = 0, l = 0; for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; } g /= p; l /= p; out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < n; i++) { const d = c[i] - c[i - 1]; g = (g * (p - 1) + (d > 0 ? d : 0)) / p; l = (l * (p - 1) + (d < 0 ? -d : 0)) / p; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  return out;
}

/* Signes de faiblesse contre une direction (sens +1 = on est acheteur, −1 = vendeur). Ne regarde que le passé. */
export function evaluerSortie(ctx, j, { sens, position = null, funding = null }) {
  const m = ctx.m15, R = ctx.reg, k = R.idxH1[j], H = ctx.h1.serie, raisons = [], ajout = (code, texte, grave = false) => raisons.push({ code, texte, grave });
  if (k < 0) return { raisons, conseille: false };
  if (R.regime[j] !== (sens > 0 ? CODES.HAUSSIER : CODES.BAISSIER)) ajout('regime', 'le régime a changé : ce n’est plus une ' + (sens > 0 ? 'tendance haussière' : 'tendance baissière') + ' (' + (R.regime[j] === CODES.RANGE ? 'range' : R.regime[j] === CODES.TRANSITION ? 'transition' : 'tendance inverse') + ')', true);
  if (R.det.structure[k] === -sens) ajout('structure', 'perte de structure : ' + (sens > 0 ? 'sommets et creux descendants' : 'sommets et creux montants') + ' en H1');
  const vm = ctx.volMoy20[j], ampl = m.h[j] - m.l[j];
  if (vm > 0 && m.v[j] >= 2.5 * vm && ampl > 0 && (sens > 0 ? (m.h[j] - m.c[j]) / ampl >= 0.6 : (m.c[j] - m.l[j]) / ampl >= 0.6)) ajout('epuisement', 'volume d’épuisement : volume ' + (m.v[j] / vm).toFixed(1).replace('.', ',') + ' fois la normale avec un rejet ' + (sens > 0 ? 'depuis le haut' : 'depuis le bas'));
  // divergence RSI H1 : nouveau sommet (creux) du prix avec un RSI plus faible (plus fort) d'au moins 3 points
  const r = rsi(H.c), deb = Math.max(15, k - 40);
  { let ref = -1; for (let q = deb; q <= k - 6; q++) if (ref < 0 || (sens > 0 ? H.h[q] > H.h[ref] : H.l[q] < H.l[ref])) ref = q;
    let cur = -1; for (let q = k - 5; q <= k; q++) if (cur < 0 || (sens > 0 ? H.h[q] > H.h[cur] : H.l[q] < H.l[cur])) cur = q;
    if (ref > 0 && cur > 0 && (sens > 0 ? H.h[cur] > H.h[ref] && r[cur] < r[ref] - 3 : H.l[cur] < H.l[ref] && r[cur] > r[ref] + 3)) ajout('divergence', 'divergence RSI en H1 : le prix ' + (sens > 0 ? 'refait un sommet' : 'refait un creux') + ' mais pas le RSI (' + Math.round(r[ref]) + ' puis ' + Math.round(r[cur]) + ')'); }
  if (funding && funding.length >= 12) { const taux = funding.map(x => x.taux), p = percentile(taux.slice(-90), taux[taux.length - 1]); if (p != null && (sens > 0 ? p >= 0.9 : p <= 0.1)) ajout('financement', 'financement extrême : ' + (sens > 0 ? 'acheteurs très surchargés' : 'vendeurs très surchargés') + ' (' + Math.round(p * 100) + 'e centile des 30 derniers jours)'); }
  if (position && position.suivi > 0 && position.indexEntree != null) {
    let ext = sens > 0 ? -Infinity : Infinity; for (let q = position.indexEntree; q < j; q++) ext = sens > 0 ? Math.max(ext, m.h[q]) : Math.min(ext, m.l[q]);
    const stopSuiveur = sens > 0 ? Math.max(position.stop, ext - position.suivi) : Math.min(position.stop, ext + position.suivi);
    if (sens > 0 ? m.c[j] < stopSuiveur : m.c[j] > stopSuiveur) ajout('stop', 'clôture ' + (sens > 0 ? 'sous' : 'au-dessus d') + 'e le stop suiveur (' + fmt(stopSuiveur) + ')', true);
  }
  return { raisons, conseille: raisons.some(x => x.grave) || raisons.length >= 2 };
}

/* Fréquence maximale par type d'alerte : `historique` = [{ type, t }] ; rend { gardees, historique }. */
export function limiterFrequence(alertes, historique, maintenant, c = CRITERES_M6C.alertes) {
  const reposH = { ENTREE: c.reposMinEntreeH, RANGE: c.reposMinRangeH, SORTIE: c.reposMinSortieH, ATTENTION: c.reposMinSortieH, OBSERVATION: c.reposMinEntreeH };
  const hist = historique.filter(x => maintenant - x.t < 48 * 3600e3), gardees = [];
  for (const a of alertes) { const r = (reposH[a.type] || 1) * 3600e3, memeCle = hist.some(x => x.type === a.type && x.cle === a.cle && maintenant - x.t < r), memeType = (a.type === 'ENTREE' || a.type === 'RANGE') && hist.some(x => x.type === a.type && maintenant - x.t < r); if (memeCle || memeType) continue; gardees.push(a); hist.push({ type: a.type, cle: a.cle, t: maintenant }); }
  return { gardees, historique: hist };
}

/* Analyse complète de la dernière bougie fermée.
   entrée : { serie, paire, statuts?: { id: 'SIGNAL' | 'INFORMATION' }, parametres?: { id: params }, funding?, position?: { sens, entree, stop, suivi, indexEntree }, observation?: boolean, maintenant? }
   sortie : { ok, paire, regime (description), regles: [...], alertes: [...], phrases: [...], dessins: [...], t } */
export function analyserAssistant({ serie, paire = 'BTC', statuts = {}, parametres = {}, funding = null, position = null, observation = true, maintenant = null, ctx: ctxDonne = null }) {
  if (!serie || serie.n < 3000) return { ok: false, paire, erreur: 'historique trop court (' + (serie ? serie.n : 0) + ' bougies M15 ; il en faut au moins 3 000)' };
  const s = ctxDonne ? null : (serie.n > FENETRE_BOUGIES ? tranche(serie, serie.n - FENETRE_BOUGIES, serie.n) : serie), ctx = ctxDonne || contexteRegime(s), j = ctx.n - 1, H = ctx.h1.serie, k = ctx.reg.idxH1[j];
  if (k < 0) return { ok: false, paire, erreur: 'pas encore de bougie H1 fermée' };
  const desc = decrire(ctx.reg.det, H, k), nom = NOM_PAIRE[paire] || paire, t = ctx.m15.t[j] + 900e3, px = ctx.m15.c[j], alertes = [], phrases = [];
  const regles = [];
  for (const id of ORDRE_REGLES) {
    const R = REGLES[id], p = parametres[id] || R.defaut, sig = R.signaux(ctx, p), statut = statuts[id] === 'SIGNAL' ? 'SIGNAL' : 'INFORMATION', tire = sig.sens[j] !== 0;
    const fausses = sig.evenements.filter(e => e.t >= ctx.m15.t[j] - 900e3 * 2);
    regles.push({ id, nom: R.nom, statut, signal: tire ? { sens: sig.sens[j], stop: sig.stop[j], suivi: sig.suivi[j] || null, cible: Number.isFinite(sig.cible[j]) ? sig.cible[j] : null } : null, faussesRecentes: fausses });
    if (tire && id !== 'range_trade' || tire && statut === 'SIGNAL') {
      const sens = sig.sens[j], stop = sig.stop[j], suivi = sig.suivi[j], info = statut !== 'SIGNAL';
      const detail = (id === 'cassure_range' ? (p.mode === 'retest' ? 'cassure valide, volume confirmé, retest tenu' : 'cassure de qualité (volume en expansion, delta dans le sens)') : 'entrée ' + (id === 'tendance_cassure' ? 'sur cassure de qualité' : 'sur repli repris') + ' dans la tendance');
      const texte = (info ? 'INFORMATION (règle non validée, aucune entrée proposée) · ' : '') + (!info && id === 'range_trade' ? 'RISQUE RÉDUIT DE MOITIÉ (trade du range) · ' : '') + nom + ' · ' + (sens > 0 ? 'achat' : 'vente') + ' possible vers ' + fmt(px) + ' : ' + detail + ' · stop ' + fmt(stop) + (suivi ? ' puis stop suiveur à ' + fmt(suivi) + ' de distance' : '') + (Number.isFinite(sig.cible[j]) ? ' · objectif ' + fmt(sig.cible[j]) : '');
      if (!info) alertes.push({ id: 'E:m6c:' + id + ':' + ctx.m15.t[j], type: 'ENTREE', risqueFacteur: id === 'range_trade' ? 0.5 : 1, paire, strategie: 'm6c:' + id, nomStrategie: R.nom, validee: true, t, tSignal: ctx.m15.t[j], sens, entree: px, stop, cible: Number.isFinite(sig.cible[j]) ? sig.cible[j] : null, suivi: suivi || null, cle: id + ':' + sens, texte });
      else if (observation) alertes.push({ id: 'O:m6c:' + id + ':' + ctx.m15.t[j], type: 'OBSERVATION', paire, strategie: 'm6c:' + id, nomStrategie: R.nom, t, tSignal: ctx.m15.t[j], sens, prix: px, cle: id + ':' + sens, texte });
      phrases.push(texte);
    }
    for (const e of fausses) { const txt = e.type === 'evitee' ? 'Fausse cassure évitée : le prix est rentré dans la boîte, je n’ai pas pris la cassure ' + (e.sens > 0 ? 'haussière' : 'baissière') + '.' : 'Attention, fausse cassure probable : le prix est rentré dans la boîte après une cassure ' + (e.sens > 0 ? 'haussière' : 'baissière') + '.'; alertes.push({ id: 'F:m6c:' + e.t, type: 'ATTENTION', paire, t, tSignal: e.t, cle: 'fausse:' + e.sens, texte: txt }); phrases.push(txt); }
  }
  if (desc.code === CODES.RANGE) {
    const txt = 'NE PAS ENTRER : range détecté sur ' + nom + ', bornes ' + fmt(desc.bas) + ' et ' + fmt(desc.haut) + ' (' + desc.touchesBas + ' touches en bas, ' + desc.touchesHaut + ' en haut, depuis ' + Math.round(desc.ageH) + ' heures' + (desc.compression ? ', volatilité comprimée' : '') + '), pas de position.';
    alertes.push({ id: 'R:m6c:' + Math.round(desc.bas) + ':' + Math.round(desc.haut), type: 'RANGE', paire, t, tSignal: ctx.m15.t[j], cle: 'range:' + Math.round(desc.bas / 10) + ':' + Math.round(desc.haut / 10), haut: desc.haut, bas: desc.bas, texte: txt });
  }
  // « ça craint » : avec une position (simulée ou saisie) = SORTIE ; sans position = avertissement sur le sens du régime courant
  let sortie = null;
  if (position) sortie = evaluerSortie(ctx, j, { sens: position.sens, position, funding });
  else if (desc.code === CODES.HAUSSIER || desc.code === CODES.BAISSIER) sortie = evaluerSortie(ctx, j, { sens: desc.code === CODES.HAUSSIER ? 1 : -1, funding });
  if (sortie && sortie.conseille) {
    const sensTxt = position ? (position.sens > 0 ? 'ton achat' : 'ta vente') : (desc.code === CODES.HAUSSIER ? 'les acheteurs' : 'les vendeurs');
    const txt = (position ? 'ÇA CRAINT, sortie conseillée sur ' : 'ÇA CRAINT pour ') + nom + ' (' + sensTxt + ') : ' + sortie.raisons.map(x => x.texte).join(' ; ') + '.';
    alertes.push({ id: 'S:m6c:' + ctx.m15.t[j], type: position ? 'SORTIE' : 'ATTENTION', paire, t, tSignal: ctx.m15.t[j], cle: 'sortie:' + sortie.raisons.map(x => x.code).join('+'), raisons: sortie.raisons, texte: txt }); phrases.push(txt);
  }
  if (desc.code === CODES.RANGE && !phrases.length) phrases.push('On est en range entre ' + fmt(desc.bas) + ' et ' + fmt(desc.haut) + ', je ne propose rien.');
  const premiere = desc.phrase; phrases.unshift(premiere);
  return { ok: true, paire, nom, t, prix: px, regime: desc, regles, alertes, sortie, phrases, dessins: dessinsRegime({ ctx, desc, paire }), ctxIndex: j };
}

/* Dessins du graphique (format de agent-m6/dessins.js, groupe « regime-m6c ») : zones de régime des derniers jours, bornes du range, niveau de cassure. */
export function dessinsRegime({ ctx, desc, paire, jours = 10 }) {
  const H = ctx.h1.serie, det = ctx.reg.det, fin = ctx.reg.idxH1[ctx.n - 1], debut = Math.max(0, fin - jours * 24), out = [], G = 'regime-m6c', segs = segments(det, H, { depuis: debut, jusqu: fin + 1 });
  for (const sg of segs.slice(-14)) {
    if (sg.code === CODES.TRANSITION) continue;
    let hi = -Infinity, lo = Infinity; for (let q = 0; q < H.n; q++) { if (H.t[q] < sg.t0) continue; if (H.t[q] >= sg.t1) break; if (H.h[q] > hi) hi = H.h[q]; if (H.l[q] < lo) lo = H.l[q]; }
    if (!(hi > lo)) continue;
    if (sg.code === CODES.RANGE && sg.haut > sg.bas) out.push({ type: 'zone', auteur: 'agent', groupe: G, couleur: 'alerte', etiquette: 'RANGE', prixHaut: sg.haut, prixBas: sg.bas, de: sg.t0, a: sg.t1, note: 'range détecté (bornes ' + fmt(sg.bas) + ' – ' + fmt(sg.haut) + ')' });
    else if (sg.code === CODES.HAUSSIER || sg.code === CODES.BAISSIER) out.push({ type: 'zone', auteur: 'agent', groupe: G, couleur: sg.code === CODES.HAUSSIER ? 'haussier' : 'baissier', etiquette: sg.code === CODES.HAUSSIER ? 'TENDANCE ↑' : 'TENDANCE ↓', prixHaut: hi, prixBas: lo, de: sg.t0, a: sg.t1, note: 'régime ' + (sg.code === CODES.HAUSSIER ? 'tendance haussière' : 'tendance baissière') });
  }
  if (desc.code === CODES.RANGE) { out.push({ type: 'ligne_h', auteur: 'agent', groupe: G, couleur: 'alerte', etiquette: 'borne haute', prix: desc.haut }, { type: 'ligne_h', auteur: 'agent', groupe: G, couleur: 'alerte', etiquette: 'borne basse', prix: desc.bas }); }
  else { const R = ctx.reg, j = ctx.n - 1; if (R.lrK[j] >= 0 && R.idxH1[j] - R.lrK[j] <= 12) out.push({ type: 'ligne_h', auteur: 'agent', groupe: G, couleur: 'info', etiquette: 'niveau de cassure (haut du range)', prix: R.lrHaut[j] }, { type: 'ligne_h', auteur: 'agent', groupe: G, couleur: 'info', etiquette: 'niveau de cassure (bas du range)', prix: R.lrBas[j] }); }
  return out;
}
