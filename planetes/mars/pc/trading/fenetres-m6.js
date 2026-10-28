import { obtenirM6, surChangementM6 } from './m6-page.js';
import { hotesChargees, paireActive, surChangement, obtenirHotePaire } from './pilotes-paires.js';
import { regimePour, regimesMemo, derniereSimulation } from './services-m6.js';
import { assistantsMemo, assistantTick } from './assistant-page.js';
import { tableauM6c } from '../agent-m6c/performance-m6c.js';
import { lireEtatAgent } from './agent-accueil.js';
import { regimesActifs, regimesActifsMemo } from './regime-actifs-page.js';
import { reelAgent, reelPropositions, reelRegimes } from '../agent-v3/synthese-agent.js';

/* ═════════════ LES SIX FENÊTRES DE PERFORMANCE DE L'AGENT SUR LA TABLE DE MARS (M6) ═════════════
   Performance des stratégies (BACKTEST) · Gardien prop (RÉEL) · Propositions de l'agent (RÉEL / SIMULÉ) · Régime de marché (RÉEL + ESTIMÉ) · Journal et tilt (RÉEL) · Probabilité de réussite (ESTIMÉ).
   Chaque fenêtre porte son étiquette et dit « en préparation » plutôt que d'inventer un chiffre. Un clic ouvre le poste de pilotage sur l'onglet correspondant (exemples.js : `onglet`).
   Aucune requête réseau n'est lancée pour une paire que tu n'as pas activée. Le régime n'est calculé (réseau gratuit, cache de 10 minutes) que pour les paires activées, au plus une fois toutes les 15 minutes. */
const NOM = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' }, $ = v => Math.round(v).toLocaleString('fr-FR') + ' $';
const couleurNiveau = n => ({ VERT: undefined, ORANGE: '#ffb347', ROUGE: '#ff6b6b', BLOQUE: '#ff6b6b' }[n]);

export function construireReels(m6vue, vuesPaires, regimes, simulation, m6c = null, v3 = null) {
  const out = {}, g = m6vue.gardien, c = m6vue.compte, t = m6vue.tilt;
  const cl = p => (p >= 0.8 ? 'ko' : p >= 0.5 ? 'warn' : 'ok');
  out['gardien-prop'] = { etat: 'ok', etiquette: 'RÉEL', jauges: [
    { nom: 'Perte du jour', texte: $(g.jauges.perteJour.valeur) + ' / ' + $(g.jauges.perteJour.limite), part: g.jauges.perteJour.part, couleur: cl(g.jauges.perteJour.part) },
    { nom: 'Drawdown', texte: $(g.jauges.drawdown.valeur) + ' / ' + $(g.jauges.drawdown.limite), part: g.jauges.drawdown.part, couleur: cl(g.jauges.drawdown.part) },
    { nom: 'Objectif +' + m6vue.regles.objectifPct + ' %', texte: (c.gainTotal >= 0 ? '+' : '−') + $(Math.abs(c.gainTotal)) + ' / ' + $(g.jauges.objectif.limite), part: g.jauges.objectif.part, couleur: 'info' }
  ], pied: g.niveau + ' · marge ' + $(c.margeRestante) + (g.coupeCircuit.actif ? ' · COUPE-CIRCUIT' : '') };
  const semaine = m6vue.journal.length ? null : null;
  out['journal-tilt'] = { etat: 'ok', etiquette: 'RÉEL', liste: [
    { g: 'Trades au journal', d: String(m6vue.nJournal), c: '#cfeaff' }, { g: 'Tilt', d: t.niveau + ' · ' + t.score + '/100', c: couleurNiveau(t.niveau) || '#41e0a0' },
    { g: 'Positions ouvertes', d: String(m6vue.positionsOuvertes) }, { g: 'Pertes d’affilée', d: String(c.pertesConsecutives), c: c.pertesConsecutives >= 2 ? '#ffb347' : undefined }, { g: 'Trades aujourd’hui', d: c.tradesJour + ' / ' + m6vue.regles.tradesParJourMax }
  ], entete: t.signaux.length ? t.signaux[0].nom + ' : ' + t.signaux[0].detail : 'Aucun signal de tilt', pied: 'saisi par toi' };
  // propositions de l'agent : alertes d'ENTRÉE récentes jugées par le gardien
  const props = [], maintenant = Date.now();
  for (const [p, v] of Object.entries(vuesPaires)) for (const a of (v.alertes || []).slice(0, 6)) if (a.type === 'ENTREE' && maintenant - a.t < 12 * 3600e3) props.push({ p, a });
  const prepar = []; for (const [p, v] of Object.entries(vuesPaires)) for (const s of (v.strategies || [])) if (s.setup && s.setup.statut === 'preparation') prepar.push({ p, s });
  out['propositions-agent'] = (Object.keys(vuesPaires).length === 0) ? { etat: 'bientot', message: 'active l’agent sur une paire' } : { etat: 'ok', etiquette: props.length ? 'SIMULÉ' : 'RÉEL',
    liste: [...props.slice(0, 3).map(({ p, a }) => ({ g: p + ' ' + (a.sens > 0 ? 'ACHAT' : 'VENTE') + ' · ' + a.nomStrategie, d: a.gardien ? a.gardien.decision : '—', c: a.gardien && a.gardien.decision === 'PASS' ? '#41e0a0' : a.gardien && a.gardien.decision === 'BLOCK' ? '#ff6b6b' : '#ffb347' })), ...prepar.slice(0, 2).map(({ p, s }) => ({ g: p + ' préparation · ' + s.nom, d: 'à surveiller', c: '#ffb347' }))],
    vide: 'Pas de setup : l’agent n’alerte que s’il y a une stratégie validée', entete: props.length ? 'Entrées proposées (jugées par le gardien)' : null, pied: 'aucun ordre n’est passé' };
  // performance des stratégies : courbes de capital en R (hors échantillon = BACKTEST)
  const courbes = []; for (const [p, v] of Object.entries(vuesPaires)) for (const s of (v.strategies || [])) if (s.horsEchantillon && s.horsEchantillon.courbeR && s.horsEchantillon.courbeR.length > 3 && ['validee', 'confirmee', 'surveillance', 'suspendue'].includes(s.statut)) courbes.push({ nom: p + ' · ' + s.nom, valeurs: Array.from(s.horsEchantillon.courbeR), fin: s.horsEchantillon.Rtotal != null ? s.horsEchantillon.Rtotal : s.horsEchantillon.courbeR[s.horsEchantillon.courbeR.length - 1] });
  const courbesM6c = []; if (m6c) for (const p of m6c.paires) { const t = tableauM6c({ paire: p }); if (t.ok && t.meilleure && t.meilleure.courbeR && t.meilleure.courbeR.length > 3) courbesM6c.push({ nom: p + ' · ' + t.meilleure.nom + ' (INFORMATION)', valeurs: Array.from(t.meilleure.courbeR), fin: t.meilleure.Rtotal }); }
  if (!courbes.length && courbesM6c.length) out['perf-strategies'] = { etat: 'ok', etiquette: 'BACKTEST', courbes: courbesM6c.slice(0, 4), pied: 'assistant de régime · hors échantillon, frais déduits · aucune règle n’a battu le hasard : information seulement' };
  else out['perf-strategies'] = courbes.length ? { etat: 'ok', etiquette: 'BACKTEST', courbes: courbes.slice(0, 4), pied: 'hors échantillon, frais déduits · ne garantit rien' } : { etat: 'bientot', message: Object.keys(vuesPaires).length ? 'aucune stratégie validée à ce jour' : 'active l’agent sur une paire' };
  // régime
  const lg = []; for (const p of ['BTC', 'SOL', 'DOGE']) { const r = regimes[p]; if (r && r.ok) lg.push({ g: NOM[p], d: r.score + '/100 · ' + r.etiquette.nom.split(' ')[0] + (r.etiquette.nom.split(' ')[1] ? ' ' + r.etiquette.nom.split(' ')[1] : ''), c: r.zone && r.zone.code === 'RISK_ON' ? '#41e0a0' : r.zone && r.zone.code === 'RISK_OFF' ? '#ff6b6b' : '#cfeaff' }); }
  if (m6c) for (const p of m6c.paires) { const a = m6c.assistants[p]; if (a && a.ok) lg.push({ g: NOM[p] + ' · assistant', d: a.regime.nom + (a.regime.code === 3 ? ' ' + Math.round(a.regime.bas).toLocaleString('fr-FR') + '–' + Math.round(a.regime.haut).toLocaleString('fr-FR') : ''), c: a.regime.code === 1 ? '#41e0a0' : a.regime.code === 2 ? '#ff6b6b' : a.regime.code === 3 ? '#ffb347' : '#cfeaff' }); }
  out['regime-marche'] = lg.length ? { etat: 'ok', etiquette: 'MIXTE', liste: lg, entete: '100 = sain, 0 = défensif', pied: 'Binance, CoinGecko · ne prédit rien' } : { etat: 'bientot', message: 'calcul en cours ou paire non activée' };
  // probabilité de réussite
  const s = simulation, ref = s && s.ok ? (s.niveaux.find(x => s.plage && x.risquePct === s.plage.de) || s.niveaux[1] || s.niveaux[0]) : null;
  out['proba-evaluation'] = ref ? { etat: 'ok', etiquette: s.hypothetique ? 'HYPOTHÉTIQUE' : 'ESTIMÉ', liste: [{ g: 'Objectif avant limites', d: Math.round(ref.pObjectif.moy * 100) + ' %', c: '#41e0a0' }, { g: 'Fourchette', d: Math.round(ref.pObjectif.bas * 100) + ' à ' + Math.round(ref.pObjectif.haut * 100) + ' %' }, { g: 'Drawdown touché', d: Math.round(ref.pDrawdown.moy * 100) + ' %', c: '#ff6b6b' }, { g: 'Perte du jour touchée', d: Math.round(ref.pJour.moy * 100) + ' %', c: '#ff6b6b' }], entete: 'à ' + ref.risquePct + ' % de risque par trade', pied: s.n + ' trades · pas une promesse' } : { etat: 'bientot', message: 'lance une simulation dans le poste' };
  // V3b : l'agent Kepler (service PC, sinon Worker) et le régime de chaque actif remplacent les messages « active l'agent sur une paire » / « paire non activée »
  if (v3) {
    const aProps = out['propositions-agent'] && out['propositions-agent'].etat === 'ok' && out['propositions-agent'].liste && out['propositions-agent'].liste.length && out['propositions-agent'].etiquette === 'SIMULÉ';
    if (!aProps) out['propositions-agent'] = reelPropositions(v3.lecture);
    const rg = reelRegimes(v3.regimes, v3.lecture); if (rg.etat === 'ok' || out['regime-marche'].etat !== 'ok') out['regime-marche'] = rg;
    out['agent-btc'] = reelAgent(v3.lecture);
  }
  return out;
}

export function demarrerFenetresM6({ majReel, actif = () => true }) {
  let arrete = false, minuterie = null, dernierRegime = 0;
  /* L'état de l'agent Kepler et les régimes par actif ne dépendent PAS de l'ancien pilote : lus même si le reste échoue. */
  async function lireV3() {
    let lecture = null; try { lecture = await lireEtatAgent(); } catch (e) { lecture = null; }
    const signature = () => Object.values(regimesActifsMemo()).map(x => x.t).join(',');
    const avant = signature(); regimesActifs().then(() => { if (signature() !== avant) planifier(300); }).catch(() => {});   // mis en cache 15 min : on ne redessine que si du neuf est arrivé
    return { lecture, regimes: regimesActifsMemo() };
  }
  async function tick() {
    if (arrete || !actif()) return;
    let v3 = null; try { v3 = await lireV3(); } catch (e) { v3 = null; }
    try {
      const m6 = await obtenirM6(), vue = m6.vue(), hotes = hotesChargees(), vuesPaires = {};
      for (const p of ['BTC', 'SOL', 'DOGE']) { let h = hotes[p]; if (!h && (p === 'BTC' || paireActive(p))) { try { h = await obtenirHotePaire(p, { demarrer: true }); } catch (e) { h = null; } } if (h) { try { vuesPaires[p] = h.vue(); } catch (e) { /* en chargement */ } } }
      if (Date.now() - dernierRegime > 15 * 60e3) { dernierRegime = Date.now(); for (const p of Object.keys(vuesPaires)) { if (vuesPaires[p].donnees && vuesPaires[p].donnees.n) regimePour(p).then(() => planifier(500)).catch(() => {}); } }
      try { await assistantTick(Object.keys(vuesPaires)); } catch (e) { /* l'assistant ne doit jamais bloquer les fenêtres */ }
      const reels = construireReels(vue, vuesPaires, regimesMemo(), derniereSimulation(), { paires: Object.keys(vuesPaires), assistants: assistantsMemo() }, v3);
      for (const [id, r] of Object.entries(reels)) majReel(id, r);
    } catch (e) {
      for (const id of ['gardien-prop', 'journal-tilt', 'perf-strategies', 'proba-evaluation']) majReel(id, { etat: 'indisponible', erreur: String(e && e.message || e) });
      if (v3) { majReel('agent-btc', reelAgent(v3.lecture)); majReel('propositions-agent', reelPropositions(v3.lecture)); majReel('regime-marche', reelRegimes(v3.regimes, v3.lecture)); }
      else for (const id of ['propositions-agent', 'regime-marche', 'agent-btc']) majReel(id, { etat: 'indisponible', erreur: String(e && e.message || e) });
    }
  }
  const planifier = ms => { clearTimeout(minuterie); minuterie = setTimeout(tick, ms); };
  const off1 = surChangementM6(() => planifier(400)), off2 = surChangement(() => planifier(1500)), iv = setInterval(tick, 30000);
  tick();
  return () => { arrete = true; clearTimeout(minuterie); clearInterval(iv); off1(); off2(); };
}
