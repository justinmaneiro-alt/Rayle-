// M6 partie 2 : l'agent sur trois paires indépendantes (BTC, SOL, DOGE) : données, compteur de variantes, coûts, stockage, sauvegardes et récupération après corruption.
// Lancer :  node planetes/mars/tests/m6-paires-test.mjs
import { creerHoteLocal } from '../pc/agent-btc/hote-local.js';
import { ouvrirStockageBtc } from '../pc/agent-btc/stockage-btc.js';
import { creerPilote, etatPiloteVide } from '../pc/agent-btc/pilote-coeur.js';
import { VARIANTES_AVANT, plancherVariantes } from '../pc/agent-btc/essais-anterieurs.js';
import { prochainChantier, etatInitial } from '../pc/agent-btc/recherche-continue.js';
import { sourceBinance, PAIRES } from '../pc/agent-m6/paires.js';
import { creerSauvegardes, empreinte } from '../pc/agent-m6/reproductibilite.js';
import { creerJournalErreurs } from '../pc/agent-m6/sante.js';
import { marcheM5 } from './synth-m5.mjs';
import { fauxBinance } from './faux-binance.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const PAS = 900e3, now0 = Math.floor(Date.UTC(2025, 5, 1, 12, 0) / PAS) * PAS, N = 9000, t0 = now0 - N * PAS;

// ── compteurs de variantes et coûts par paire ──
v('plancher BTC = 643 101 (inchangé)', plancherVariantes('BTC') === VARIANTES_AVANT.total && VARIANTES_AVANT.total === 643101);
v('plancher SOL et DOGE = 3 101 (familles conçues en regardant BTC ; les essais à blanc BTC ne disent rien de leurs données)', plancherVariantes('SOL') === 3101 && plancherVariantes('DOGE') === 3101);
{
  const btc = creerPilote({}), sol = creerPilote({ paire: 'SOL' }), doge = creerPilote({ paire: 'DOGE' });
  v('état neuf : paire, compteur et coûts propres', btc.vue().paire === 'BTC' && sol.vue().paire === 'SOL' && doge.vue().recherche.N === 3101 && btc.vue().recherche.N === 643101 && doge.vue().couts.spreadPct === PAIRES.DOGE.couts.spreadPct && btc.vue().couts.spreadPct === 0.02);
  const ancien = etatPiloteVide(Date.now()); delete ancien.paire; delete ancien.couts;
  const recharge = creerPilote({ etat: ancien }); v('ancien état BTC (sans paire ni coûts) : rechargé comme BTC aux coûts historiques', recharge.vue().paire === 'BTC' && recharge.vue().couts.fraisPct === 0.06 && recharge.vue().couts.glissementPct === 0.02);
  // coûts : confirmation obligatoire, bornes
  const r0 = doge.commande({ type: 'couts', fraisPct: 0.03, spreadPct: 0.05, glissementPct: 0.05 }); v('changer les coûts sans confirmation : refusé', !r0.ok && /sur-optimisation/.test(r0.erreur));
  const r1 = doge.commande({ type: 'couts', fraisPct: 0.03, spreadPct: 0.05, glissementPct: 0.05, confirme: true }); v('changer les coûts avec confirmation : accepté et journalisé', r1.ok && doge.vue().couts.fraisPct === 0.03 && doge.etat().journalReglages.some(x => x.type === 'couts'));
  v('coûts absurdes refusés', !doge.commande({ type: 'couts', fraisPct: 9, spreadPct: 0, glissementPct: 0, confirme: true }).ok);
  v('les coûts de la paire vont au moteur', doge.preparerTranche().config.fraisPct === 0.03 && doge.preparerTranche().config.spreadPct === 0.05 && sol.preparerTranche().config.spreadPct === PAIRES.SOL.couts.spreadPct);
  v('la charge de recherche porte la paire', sol.preparerTranche().profil.paire === 'SOL');
  // la recherche ne teste pas « nombres ronds » (pas 5 000 / 10 000 $) hors BTC
  const e = etatInitial(); e.niveau = 2; e.curseur = 4;
  const c1 = prochainChantier(e, { paire: 'SOL' }), c2 = prochainChantier(e, { paire: 'BTC' }), c3 = prochainChantier(e, {});
  v('nombres ronds : sautés pour SOL, gardés pour BTC et sans paire', c1.saute === true && c2.id === 'prix_ronds@m' && c3.id === 'prix_ronds@m', JSON.stringify([c1.id, c2.id, c3.id]));
}

// ── un hôte DOGE complet : données, stockage séparé, sauvegarde, corruption ──
const serie = marcheM5({ n: N, graine: 5, t0, prix: 0.08, bruitPct: 0.2 });
const horloge = { t: now0 }, urls = [];
const base = fauxBinance(serie, horloge), lire = async url => { urls.push(url); return base(url); };
const stockageDoge = await ouvrirStockageBtc(null), stockageBtc = await ouvrirStockageBtc(null);
const erreurs = creerJournalErreurs(20), sauvegardes = creerSauvegardes(stockageDoge, { garder: 3 });
let horlogeApp = now0; const maintenant = () => horlogeApp;
const hote = creerHoteLocal({ stockage: stockageDoge, lire, maintenant, periodeMs: 3600e3, annees: N * PAS / (365.25 * 86400e3) + 0.01, paire: 'DOGE', sources: { binance: sourceBinance('DOGE') }, ordreSources: ['binance'], sauvegardes, erreurs });
await hote.demarrer({ synchro: true, boucleDirect: false });
const d = hote.vue().donnees;
v('DOGE : historique chargé depuis Binance DOGEUSDT, delta réel', d.n >= N - 5 && d.source === 'binance' && d.deltaReelPct > 0.99 && urls.length > 5 && urls.every(u => /symbol=DOGEUSDT/.test(u)), JSON.stringify([d.n, d.source, urls[0]]));
v('DOGE : la vue dit sa paire, ses coûts et son compteur', hote.vue().paire === 'DOGE' && hote.vue().recherche.N === 3101 && hote.vue().couts.spreadPct === 0.06);
v('DOGE : prix minuscules préservés (0,08 $)', Math.abs(hote.serie().c[100] - 0.08) < 0.05 && hote.serie().c[100] > 0.001);
const integ = hote.integrite(); v('DOGE : audit d’intégrité propre sur les données de test', integ && integ.niveau === 'ok' && integ.n === d.n, integ && integ.phrase);
hote.definirRecoupement({ niveau: 'ok', phrase: 'DOGE contre Kraken : cohérent' }); v('recoupement transmis à la santé', hote.santeEntrees().recoupement.niveau === 'ok' && hote.santeEntrees().paire === 'DOGE');
v('BTC et DOGE ne partagent aucun stockage', (await stockageBtc.lire('pilote')) === null && (await stockageDoge.lire('pilote')) !== null && (await stockageDoge.lire('pilote')).somme === empreinte(JSON.stringify((await stockageDoge.lire('pilote')).valeur)));
// sauvegarde horaire : une sauvegarde est faite à la première écriture, puis pas avant une heure
await hote.commande({ type: 'profil', patch: { risquePct: 0.5 } }); await new Promise(r => setTimeout(r, 30));
let e1 = await sauvegardes.etat('pilote'); v('première sauvegarde de secours faite', e1.n === 1 && e1.corrompues === 0, JSON.stringify(e1));
await hote.commande({ type: 'profil', patch: { risquePct: 0.6 } }); await new Promise(r => setTimeout(r, 30));
e1 = await sauvegardes.etat('pilote'); v('pas de seconde sauvegarde avant une heure', e1.n === 1);
horlogeApp += 3601e3; await hote.commande({ type: 'profil', patch: { risquePct: 0.7 } }); await new Promise(r => setTimeout(r, 30));
e1 = await sauvegardes.etat('pilote'); v('une heure plus tard : nouvelle sauvegarde', e1.n === 2);
hote.detruire();

// corruption de l'état principal → restauration de la dernière sauvegarde valide, et le dit
{
  const brut = await stockageDoge.lire('pilote'), abime = JSON.parse(JSON.stringify(brut)); abime.valeur.profil.risquePct = 5;         // somme de contrôle désormais fausse
  await stockageDoge.ecrire('pilote', abime);
  const h2 = creerHoteLocal({ stockage: stockageDoge, lire, maintenant, periodeMs: 3600e3, paire: 'DOGE', sources: { binance: sourceBinance('DOGE') }, ordreSources: ['binance'], sauvegardes, erreurs });
  await h2.demarrer({ synchro: false, boucleDirect: false });
  v('état corrompu détecté : le profil falsifié (5 %) n’est PAS repris', h2.vue().profil.risquePct !== 5, h2.vue().profil.risquePct);
  v('état corrompu : restauré depuis la sauvegarde, avec un message clair', /restauré depuis la sauvegarde/.test(h2.vue().erreur || '') && erreurs.tout().some(x => /corrompu/.test(x.message)), h2.vue().erreur);
  h2.detruire();
  // sans sauvegarde valide : redémarrage à zéro, dit clairement
  const vide = await ouvrirStockageBtc(null); await vide.ecrire('pilote', abime);
  const h3 = creerHoteLocal({ stockage: vide, lire, maintenant, periodeMs: 3600e3, paire: 'DOGE', sauvegardes: creerSauvegardes(vide), erreurs });
  await h3.demarrer({ synchro: false, boucleDirect: false });
  v('corrompu et aucune sauvegarde : redémarrage à zéro annoncé', /aucune sauvegarde valide/.test(h3.vue().erreur || '') && h3.vue().profil.risquePct !== 5);
  h3.detruire();
}
// un état ancien (sans somme de contrôle) se recharge normalement
{
  const s = await ouvrirStockageBtc(null), etat = etatPiloteVide(Date.now(), 'SOL'); etat.profil.risquePct = 0.4; await s.ecrire('pilote', { valeur: etat });
  const h = creerHoteLocal({ stockage: s, lire, maintenant, periodeMs: 3600e3, paire: 'SOL' }); await h.demarrer({ synchro: false, boucleDirect: false });
  v('ancien état sans somme de contrôle : rechargé tel quel', h.vue().profil.risquePct === 0.4 && h.vue().paire === 'SOL'); h.detruire();
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
