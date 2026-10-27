import { rapport } from '../agent-m6/rapports.js';
import { construireSante } from '../agent-m6/sante.js';
import { obtenirM6 } from './m6-page.js';
import { hotesChargees, obtenirHotePaire, paireActive } from './pilotes-paires.js';
import { regimePour, regimesMemo, derniereSimulation, santeGlobale } from './services-m6.js';

/* ═════════════ RAPPORTS DE L'AGENT À RAYLÉ, CÔTÉ PAGE (M6) ═════════════
   Rayle est la SEULE voix : cette fonction assemble les données structurées de l'agent (compte, gardien, tilt, pilotes des paires, régime, simulation, santé) et rapports.js (pur) en fait des phrases.
   Utilisée par la voix (voix-poste-page.js : traiterM6) et par l'ordre du bus `mars/agent_rapport`. Sans IA. */
async function contexte(paire) {
  const m6 = await obtenirM6(), vue = m6.vue(), hotes = hotesChargees(), pilotes = {};
  for (const [p, h] of Object.entries(hotes)) { try { pilotes[p] = h.vue(); } catch (e) { /* hôte en cours de chargement */ } }
  // setups en cours jugés par le gardien (alertes d'ENTRÉE récentes qui portent une décision)
  const maintenant = Date.now(), jugements = [];
  for (const [p, v] of Object.entries(pilotes)) for (const a of (v.alertes || []).slice(0, 5)) if (a.type === 'ENTREE' && a.gardien && maintenant - a.t < 2 * 3600e3) jugements.push({ paire: p, nomStrategie: a.nomStrategie, texte: a.gardien.texte });
  return { m6: vue, pilotes, regimes: regimesMemo(), simulation: derniereSimulation(), bilan: m6.bilan(), sante: null, maintenant, paire: paire || 'BTC', jugements };
}
export async function rapportVocal(sujet, paire = null) {
  const c = await contexte(paire);
  if (sujet === 'regime') { try { c.regimes[c.paire] = await regimePour(c.paire); } catch (e) { c.regimes[c.paire] = { ok: false, erreur: String(e && e.message || e) }; } }
  if (sujet === 'sante') { const s = await santeGlobale(); c.sante = s.entrees; }
  return rapport(sujet, c);
}

export function brancherOrdresRapports(sur) {
  sur('agent_rapport', async ({ sujet }) => {
    const r = await rapportVocal(sujet);
    try { if (r.ouvrir && sujet !== 'recherche') { const M = await import('./fenetre-agent.js'); await M.ouvrirPoste({ onglet: r.ouvrir }); } } catch (e) { /* la réponse parlée suffit */ }
    return { ok: true, texte: r.texte };
  }, 60000);
  sur('suspendre_strategie', async ({ nom }) => {
    const { trouverStrategie } = await import('../agent-btc/voix-poste.js'), cibles = [];
    for (const p of ['BTC', 'SOL', 'DOGE']) { const h = hotesChargees()[p] || (paireActive(p) ? await obtenirHotePaire(p, { demarrer: true }) : null); if (!h) continue; const t = trouverStrategie(h.vue(), nom, h.tousLesTrades()); if (t.s) cibles.push([p, h, t.s]); }
    if (!cibles.length) return { ok: false, erreur: 'aucune stratégie ne correspond à « ' + nom + ' »' };
    if (cibles.length > 1) return { ok: false, erreur: 'plusieurs stratégies correspondent (' + cibles.map(([p, , s]) => s.nom + ' sur ' + p).join(', ') + ') : précise la paire' };
    const [p, h, s] = cibles[0], r = await h.commande({ type: 'suspendre', id: s.id, raison: 'suspendue à la demande de Justin' });
    return r.ok ? { ok: true, texte: 'Stratégie « ' + s.nom + ' » suspendue sur ' + p + '. Elle ne sera jamais réactivée automatiquement.' } : { ok: false, erreur: r.erreur };
  }, 30000);
}
export { construireSante };
