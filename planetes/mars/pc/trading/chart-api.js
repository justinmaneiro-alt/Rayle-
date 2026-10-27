import { creerDessins, lireTemps } from '../agent-m6/dessins.js';
import { lireGraphique, resumeEtat } from '../agent-m6/chart-etat.js';
import { testerZone, explicationZone } from '../agent-m6/zone-test.js';
import { expliquerBougie } from '../agent-m6/bougie.js';
import { regrouper, versBougies, MS, tranche } from '../agent-btc/colonnes.js';
import { ORDRE_PAIRES } from '../agent-m6/paires.js';

/* ═════════════ API DU GRAPHIQUE, CÔTÉ PAGE (M6) : l'agent LIT et TRACE par outils structurés ═════════════
   Un point d'entrée unique, `window.GraphiqueAgent`, utilisé par : les ordres du bus (voix et IA de Raylé, déclarés dans planetes/mars/manifeste.json), le graphique du poste de pilotage (qui dessine
   ce qui est ici) et les tests. Les dessins sont rangés par paire : { BTC: magasin, SOL: magasin, DOGE: magasin }. Tes dessins (auteur « utilisateur ») sont gardés sur cet appareil
   (localStorage `rayle_dessins_<paire>`) ; ceux de l'agent sont recalculés et ne sont pas sauvegardés.
   Aucune donnée n'est inventée : sans historique chargé, chaque fonction répond « historique absent ». */
const hotesParPaire = new Map(), magasins = new Map(), ecouteurs = new Set();
let fournisseurHote = async paire => { const { obtenirHotePaire } = await import('./pilotes-paires.js'); return obtenirHotePaire(paire, { demarrer: true }); };
export const definirFournisseurHote = f => { fournisseurHote = f; hotesParPaire.clear(); };      // tests
const lireLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, ecrireLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* interdit */ } };
const CLE = p => 'rayle_dessins_' + p;
const diffuser = paire => { for (const f of ecouteurs) { try { f(paire); } catch (e) { /* écouteur cassé */ } } };

export function magasin(paire) {
  paire = String(paire || 'BTC').toUpperCase();
  if (!magasins.has(paire)) {
    const m = creerDessins({ contexte: () => { const h = hotesParPaire.get(paire), s = h && h.serie && h.serie(); return s && s.n ? { prixRef: s.c[s.n - 1], tMin: s.t[0], maintenant: s.t[s.n - 1] + 900e3 } : {}; } });
    const sauve = lireLocal(CLE(paire)); if (sauve) { try { m.importer(sauve); } catch (e) { /* sauvegarde illisible */ } }
    m.surChangement(() => { const u = creerDessinsUtilisateur(m); ecrireLocal(CLE(paire), u); diffuser(paire); });
    magasins.set(paire, m);
  }
  return magasins.get(paire);
}
const creerDessinsUtilisateur = m => JSON.stringify({ format: 'rayle-dessins-1', dessins: m.lister({ auteur: 'utilisateur' }) });
export const surChangement = f => { ecouteurs.add(f); return () => ecouteurs.delete(f); };

async function hote(paire) {
  paire = String(paire || 'BTC').toUpperCase(); if (!ORDRE_PAIRES.includes(paire)) throw new Error('paire inconnue : ' + paire);
  if (!hotesParPaire.has(paire)) hotesParPaire.set(paire, await fournisseurHote(paire));
  return hotesParPaire.get(paire);
}
/* Bougies d'une unité (M15, H1, H4, D1), objets { t, o, h, l, c, v, vb }, du passé complet connu. Les bougies en cours ne sont jamais incluses (le regroupement ne rend que les complètes). */
export function bougiesDe(serie, unite = 'M15', max = 6000) {
  if (!serie || !serie.n) return [];
  if (unite === 'M15') return versBougies(serie, Math.max(0, serie.n - max), serie.n);
  const ms = MS[unite]; if (!ms) throw new Error('unité inconnue : ' + unite);
  const depuis = Math.max(0, serie.n - max * (ms / MS.M15) - 64); return versBougies(regrouper(tranche(serie, depuis, serie.n), ms).serie);
}

export async function lire({ paire = 'BTC', unite = 'M15', indicateurs = ['ma200', 'rsi14'], derniers = 300, de = null, a = null, inclureSerie = true } = {}) {
  paire = paire.toUpperCase(); const h = await hote(paire), s = h.serie();
  if (!s || !s.n) return { ok: false, erreur: 'historique absent : active l’agent pour ' + paire };
  const bs = bougiesDe(s, unite), d = h.vue().donnees;
  const E = lireGraphique({ bougies: bs, unite, paire, indicateurs, derniers, de: de != null ? lireTemps(de) : null, a: a != null ? lireTemps(a) : null, dessins: magasin(paire).lister(), volumeReel: true, inclureSerie, source: d ? d.source : null });
  dernierEtat = E; return E;
}
let dernierEtat = null;

export async function tracer(paire, spec) { paire = paire.toUpperCase(); await hote(paire); return magasin(paire).ajouter(spec); }
export function masquer(paire, cible, masque = true) { const m = magasin(paire), parId = m.trouver(cible); return parId ? m.masquer(cible, masque) : m.masquerGroupe(cible, masque); }
export function effacer(paire, cible) { const m = magasin(paire), parId = m.trouver(cible); return parId ? m.supprimer(cible) : m.supprimerGroupe(cible); }
/* Cherche une cible (id ou groupe) dans toutes les paires. */
export function trouverCible(cible) {
  for (const p of ORDRE_PAIRES) { const m = magasin(p); if (m.trouver(cible) || m.groupes().some(g => g.groupe === cible)) return p; }
  return null;
}

/* « Tester ma zone » : zone donnée par ses prix ou identifiant d'un dessin de type zone. */
export async function testerZoneDe(paire, zone, options = {}) {
  paire = paire.toUpperCase(); const h = await hote(paire), s = h.serie(); if (!s || !s.n) return { ok: false, erreur: 'historique absent : active l’agent pour ' + paire };
  const d = h.vue().donnees, cfgPaire = (h.vue().couts) || {}, r = testerZone(s, zone, { config: cfgPaire, ...options });
  if (r.ok) r.texte = explicationZone(r); return r;
}
export async function testerMaZone(paire = null) {
  const cherche = paire ? [paire.toUpperCase()] : ORDRE_PAIRES;
  let meilleure = null;
  for (const p of cherche) for (const d of magasin(p).lister({ auteur: 'utilisateur', type: 'zone' })) if (!meilleure || d.creeLe > meilleure.d.creeLe) meilleure = { p, d };
  if (!meilleure) return { ok: false, erreur: 'je ne vois aucune zone tracée par toi : trace une zone sur le graphique de l’agent' };
  const r = await testerZoneDe(meilleure.p, { prixHaut: meilleure.d.prixHaut, prixBas: meilleure.d.prixBas }); return { ...r, paire: meilleure.p, dessin: meilleure.d.id };
}
export async function expliquerUneBougie(paire, quand) {
  paire = paire.toUpperCase(); const h = await hote(paire), s = h.serie(); if (!s || !s.n) return { ok: false, erreur: 'historique absent : active l’agent pour ' + paire };
  let t = String(quand).toLowerCase() === 'derniere' || String(quand).toLowerCase() === 'dernière' ? s.t[s.n - 1] : lireTemps(quand);
  if (!Number.isFinite(t)) return { ok: false, erreur: 'date illisible : donne « derniere » ou une date comme 2026-10-22T14:30' };
  t = Math.floor(t / MS.M15) * MS.M15; return expliquerBougie(s, t, { paire });
}

export const GraphiqueAgent = { lire, tracer, masquer, effacer, magasin, trouverCible, testerZone: testerZoneDe, testerMaZone, expliquerBougie: expliquerUneBougie, bougiesDe, surChangement, resume: resumeEtat, dernierEtat: () => dernierEtat, paires: ORDRE_PAIRES };
if (typeof window !== 'undefined') window.GraphiqueAgent = GraphiqueAgent;

/* Ordres du bus (planetes/mars/manifeste.json). `sur(action, fn, délai)` vient de ordres-mars.js. Chaque réponse est une phrase prête à être dite. */
export function brancherOrdresGraphique(sur) {
  const nom = p => ({ BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' }[p] || p);
  const montrer = async paire => { try { const M = await import('./fenetre-agent.js'); const p = await M.ouvrirPoste({ onglet: 'graphique' }); if (p && p.choisirPaire) await p.choisirPaire(paire); } catch (e) { /* le poste ne s'ouvre pas : les dessins restent mémorisés */ } };
  const resultat = async (r, ok) => (r.ok ? { ok: true, texte: ok } : { ok: false, erreur: (r.erreurs && r.erreurs.join(' ; ')) || r.erreur || 'impossible' });
  sur('lire_graphique', async ({ paire, unite }) => { const E = await lire({ paire, unite, derniers: 300 }); return E.ok ? { ok: true, texte: resumeEtat(E) } : { ok: false, erreur: E.erreur }; }, 30000);
  sur('tracer_zone', async ({ paire, prix_haut, prix_bas, de, etiquette, groupe }) => { const r = await tracer(paire, { type: 'zone', prixHaut: prix_haut, prixBas: prix_bas, de, etiquette, groupe }); if (r.ok) await montrer(paire); return resultat(r, 'Zone « ' + etiquette + ' » tracée sur ' + nom(paire) + ', groupe ' + groupe + '.'); }, 30000);
  sur('tracer_ligne', async ({ paire, prix, etiquette, groupe }) => { const r = await tracer(paire, { type: 'ligne_h', prix, etiquette, groupe }); if (r.ok) await montrer(paire); return resultat(r, 'Niveau « ' + etiquette + ' » tracé sur ' + nom(paire) + '.'); }, 30000);
  sur('tracer_trade', async ({ paire, sens, entree, stop, objectif, etiquette, groupe }) => { const r = await tracer(paire, { type: 'trade', sens, entree, stop, objectif, etiquette, groupe, quand: 'maintenant' }); if (r.ok) await montrer(paire); return resultat(r, 'Plan de trade tracé : ' + sens + ', ' + r.dessin.R.toFixed(1).replace('.', ',') + ' R. C’est un tracé, pas un ordre.'); }, 30000);
  sur('placer_marqueur', async ({ paire, quand, prix, forme, etiquette, groupe }) => { const r = await tracer(paire, { type: 'marqueur', quand, prix, forme, etiquette, groupe }); if (r.ok) await montrer(paire); return resultat(r, 'Marqueur placé sur ' + nom(paire) + '.'); }, 30000);
  sur('masquer_dessins', async ({ cible, etat }) => { const p = trouverCible(cible); if (!p) return { ok: false, erreur: 'aucun dessin ni groupe nommé « ' + cible + ' »' }; const r = masquer(p, cible, etat === 'masquer'); return resultat(r, (r.n > 1 ? r.n + ' dessins ' : 'Dessin ') + (etat === 'masquer' ? 'masqué' : 'réaffiché') + (r.n > 1 ? 's.' : '.')); }, 10000);
  sur('effacer_dessins', async ({ cible }) => { const p = trouverCible(cible); if (!p) return { ok: false, erreur: 'aucun dessin ni groupe nommé « ' + cible + ' »' }; const r = effacer(p, cible); return resultat(r, r.n + ' dessin' + (r.n > 1 ? 's effacés.' : ' effacé.')); }, 10000);
  sur('tester_zone', async ({ paire, prix_haut, prix_bas }) => { const r = await testerZoneDe(paire, { prixHaut: prix_haut, prixBas: prix_bas }); return r.ok ? { ok: true, texte: r.texte } : { ok: false, erreur: r.erreur }; }, 60000);
  sur('tester_ma_zone', async () => { const r = await testerMaZone(); return r.ok ? { ok: true, texte: r.texte } : { ok: false, erreur: r.erreur }; }, 60000);
  sur('expliquer_bougie', async ({ paire, quand }) => { const r = await expliquerUneBougie(paire, quand); return r.ok ? { ok: true, texte: r.texte } : { ok: false, erreur: r.erreur }; }, 30000);
  sur('rejouer', async ({ quoi }) => { const M = await import('./fenetre-agent.js'), p = await M.ouvrirPoste({ onglet: 'graphique' }); if (!p) return { ok: false, erreur: 'le poste de pilotage ne s’est pas ouvert' }; if (quoi === 'dernier_trade') { const x = await p.dernierTrade(true); return x ? { ok: true, texte: 'Rejeu du dernier trade : avance avec le bouton « Pas suivant ».' } : { ok: false, erreur: 'aucun trade à rejouer' }; } return p.rejouerPeriode ? { ok: true, texte: await p.rejouerPeriode() } : { ok: false, erreur: 'rejeu de période indisponible' }; }, 60000);
}
