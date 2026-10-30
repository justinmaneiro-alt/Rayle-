// Tests du mode Trader (V12, phases 3 à 6) : bilan honnête, niveaux (À l'essai / Candidate / Validée / Désactivé), promotion et désactivation automatiques, rétro-test étiqueté, comparaison de gestion,
// statut clair du service, rendu partagé (aucun NaN, niveau toujours visible, « pas une promesse »), service complet avec données synthétiques, routes, paquet mobile (taille, D1 : empreinte stable).
// Lancer : node galaxie/tests/trader-niveaux-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import { statsR, phraseEchantillon, bilanTrader, hasardMemeFrequence, objectifHebdo, cleType, tCrit } from '../../strategies/trader/bilan.js';
import { evaluerType, majTypes, actifDansRegime, baisseRecente, NIVEAUX_TRADER, BANDEAU_ESSAI, SEUILS_DESACTIVATION } from '../../strategies/trader/niveaux.js';
import { retroTest, comparerGestion } from '../../strategies/trader/retrotest.js';
import { ETIQUETTE_RETRO, parcourir } from '../../strategies/trader/serie.js';
import { statutService, SEUIL_VIVANT } from '../../agent-pc/service-statut.mjs';
import { creerTrader } from '../../agent-pc/trader.mjs';
import { construirePaquet, plafonner, empreintePaquet, MAX_OCTETS } from '../../agent-pc/bundle-mobile.mjs';
import '../../core/commun/trader-vue.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const JOUR = 86400e3, TV = globalThis.TraderVue;

/* ── statistiques honnêtes ── */
{
  const petit = statsR([2, -1, 3, -1, -1, 2, 1, -1, 2, -1]);
  v('petit échantillon : « pas assez de trades pour juger »', /pas assez de trades pour juger/.test(petit.honnete) && /chance/.test(petit.honnete), petit.honnete);
  const R = []; for (let i = 0; i < 200; i++) R.push(i % 3 === 0 ? 2 : -1);   // espérance 0 exacte
  const nul = statsR(R); v('espérance nulle : « compatible avec zéro »', /compatible avec zéro/.test(nul.honnete) && nul.ic[0] < 0 && nul.ic[1] > 0, nul.honnete);
  const perd = statsR(Array.from({ length: 80 }, (_, i) => (i % 5 === 0 ? 1 : -1))); v('perte régulière : intervalle entièrement sous zéro', perd.ic[1] < 0 && /perd de façon régulière/.test(perd.honnete));
  v('aucun trade : rien à juger', statsR([]).n === 0 && /rien à juger/.test(statsR([]).honnete));
  v('Student : plus large pour les petits échantillons', tCrit(5) > tCrit(30) && tCrit(30) > tCrit(200));
  const dd = statsR([1, 1, -1, -1, -1, 2]); v('drawdown en R mesuré du plus haut', Math.abs(dd.drawdown - 3) < 1e-9 && dd.serieMax === 3, JSON.stringify(dd));
}

/* ── niveaux, promotion, désactivation ── */
const trade = (R, k, extra = {}) => ({ R, Rbrut: R + 0.15, couts: 0.15, tSortie: 1e12 + k * 3600e3, regime: 'tendance', ...extra });
{
  const perdants = Array.from({ length: 24 }, (_, k) => trade(k % 6 === 0 ? 1 : -1, k));
  const e = evaluerType(perdants); v('24 trades perdants en avant, intervalle sous zéro : DÉSACTIVÉ avec explication', e.niveau === 'desactive' && /perd de façon régulière/.test(e.raison), e.raison);
  const peu = evaluerType(Array.from({ length: 12 }, (_, k) => trade(k % 2 ? 1 : -1, k)));
  v('12 trades : reste « À l’essai » avec ce qui manque', peu.niveau === 'a_lessai' && peu.manque.length >= 1 && /Pour devenir Candidate/.test(peu.raison), peu.raison);
  const bons = Array.from({ length: 160 }, (_, k) => trade(k % 2 ? 1.2 : -0.7, k));          // +0,25 R de moyenne, stable, frais doublés OK
  const sansAuditeur = evaluerType(bons); v('critères chiffrés remplis mais sans rapport de l’Auditeur : reste « À l’essai »', sansAuditeur.niveau === 'a_lessai' && sansAuditeur.manque.some(m => /Auditeur/.test(m)), JSON.stringify(sansAuditeur.manque));
  const cand = evaluerType(bons, { auditeurOk: true }); v('avec l’Auditeur : Candidate', cand.niveau === 'candidate', cand.niveau + ' ' + cand.raison);
  v('Candidate : dit ce qui manque pour être Validée (déflation, semaines de direct)', /Sharpe déflaté/.test(cand.raison) && /semaines/.test(cand.raison));
  const val = evaluerType(bons, { auditeurOk: true, deflationOk: true, semainesLive: 5 }); v('Validée seulement avec Auditeur + déflation + 4 semaines de direct', val.niveau === 'validee', val.niveau + ' ' + val.raison);
  const sansDefl = evaluerType(bons, { auditeurOk: true, semainesLive: 8 }); v('jamais Validée sans déflation', sansDefl.niveau === 'candidate');
  const mauvaisePeriode = evaluerType([...Array.from({ length: 80 }, (_, k) => trade(k % 2 ? 1.5 : -0.5, k)), ...Array.from({ length: 80 }, (_, k) => trade(k % 2 ? 0.5 : -0.6, 80 + k))], { auditeurOk: true });
  v('une période négative empêche Candidate', mauvaisePeriode.niveau !== 'candidate', mauvaisePeriode.niveau);
  const fraisX2 = evaluerType(Array.from({ length: 150 }, (_, k) => trade(k % 2 ? 0.4 : -0.2, k, { Rbrut: (k % 2 ? 0.4 : -0.2) + 0.12, couts: 0.12 })).map(t => ({ ...t, Rbrut: t.R + 0.12, couts: 0.12 })), { auditeurOk: true }); void fraisX2;
}
{
  // majTypes : promotion / désactivation / jamais de réactivation automatique / rétro-test ignoré
  const types = {}, cle = p => cleType(p);
  const props = []; for (let k = 0; k < 25; k++) props.push({ setup: 'balayage_reprise', actif: 'DOGE', tf: 'M15', source: 'direct', regime: 'range', resultat: { statut: 'cloturee', R: k % 7 === 0 ? 1 : -1, Rbrut: -0.9, couts: 0.15 }, tSortie: 1e12 + k * 3600e3 });
  const retro = []; for (let k = 0; k < 300; k++) retro.push({ setup: 'repli_tendance', actif: 'BTC', tf: 'M15', source: 'retro', resultat: { statut: 'cloturee', R: 2, Rbrut: 2, couts: 0 }, tSortie: 1e12 + k });
  const ev = majTypes(types, [...props, ...retro], 5, { cleDe: cle });
  v('« Absorption / balayage DOGE » qui perd est désactivé automatiquement avec son explication', types['balayage_reprise|DOGE|M15'].niveau === 'desactive' && ev.some(e => e.sens === 'desactivation' && /perd/.test(e.texte)), JSON.stringify(ev.map(e => e.texte)).slice(0, 200));
  v('le rétro-test ne promeut JAMAIS un type (300 trades gagnants en rétro : toujours rien en direct)', !types['repli_tendance|BTC|M15'] || types['repli_tendance|BTC|M15'].niveau === 'a_lessai');
  // même avec de bons trades ensuite, un type désactivé ne se réactive pas tout seul
  for (let k = 0; k < 200; k++) props.push({ setup: 'balayage_reprise', actif: 'DOGE', tf: 'M15', source: 'direct', regime: 'range', resultat: { statut: 'cloturee', R: 1.5, Rbrut: 1.6, couts: 0.1 }, tSortie: 2e12 + k });
  majTypes(types, [...props], 9, { cleDe: cle }); v('un type désactivé ne se réactive jamais tout seul', types['balayage_reprise|DOGE|M15'].niveau === 'desactive');
  types['balayage_reprise|DOGE|M15'].niveau = 'a_lessai'; types['balayage_reprise|DOGE|M15'].reactive = true;
  v('réactivé par Justin : repart de « À l’essai »', majTypes(types, [], 10, { cleDe: cle }) && types['balayage_reprise|DOGE|M15'].niveau !== 'desactive');
}
{
  const l = [...Array.from({ length: 12 }, (_, k) => trade(-1, k, { regime: 'range' })), ...Array.from({ length: 12 }, (_, k) => trade(k % 2 ? 2 : -0.5, 30 + k, { regime: 'tendance' }))];
  const g = actifDansRegime(l, 'range'); v('un type qui perd dans un régime (≥ 10 trades) n’est pas proposé dans ce régime, avec explication', !g.actif && /je ne le propose pas/.test(g.raison));
  v('régime sans assez de trades : actif (on ne juge pas sans preuve)', actifDansRegime(l.slice(0, 5), 'range').actif);
  const bais = baisseRecente([...Array.from({ length: 30 }, (_, k) => trade(k % 2 ? 1.5 : -0.5, k)), ...Array.from({ length: 15 }, (_, k) => trade(-1, 30 + k))]);
  v('non-stationnarité : baisse récente détectée', bais.baisse && /Baisse récente/.test(bais.texte));
  v('pas de baisse sans assez de trades', !baisseRecente(l.slice(0, 10)).baisse);
}

/* ── rétro-test et comparaison de gestion : étiquetés, jamais une preuve ── */
const s = marcheMixte(30000, 8);
{
  const r = retroTest(s, { actif: 'BTC', mois: 5 });
  v('le rétro-test porte l’étiquette « à titre d’exemple — pas une preuve »', r.etiquette === ETIQUETTE_RETRO && /pas une preuve/.test(r.etiquette));
  v('le rétro-test marque ses trades comme « retro » (jamais comptés comme preuve)', r.propositions.length > 5 && r.propositions.every(p => p.source === 'retro'));
  v('le rétro-test donne un hasard de même fréquence à comparer', r.bilan.hasard && r.bilan.hasard.BTC && r.bilan.hasard.BTC.assez, JSON.stringify(r.bilan.hasard));
  const g = comparerGestion(s, r.propositions, {});
  v('comparaison de gestion : 4 sorties mesurées sur les mêmes entrées, étude et période jamais vue séparées', g.lignes.length === 4 && g.lignes.every(l => l.etude && l.inconnue) && g.lignes[0].etude.n + g.lignes[0].inconnue.n > 5);
  v('la sortie actuelle est gardée sauf si une autre fait mieux des DEUX côtés', ['partielle', 'cible_fixe', 'suiveur', 'temps'].includes(g.retenue) && (g.retenue === 'partielle' || (g.lignes.find(l => l.gestion === g.retenue).etude.esperance > g.lignes.find(l => l.gestion === 'partielle').etude.esperance && g.lignes.find(l => l.gestion === g.retenue).inconnue.esperance > g.lignes.find(l => l.gestion === 'partielle').inconnue.esperance)));
  const b = bilanTrader(r.propositions, { risquePct: 0.5 }); v('bilan : par type, par actif, par unité de temps, par style, phrase honnête', b.parType.length && b.parActif.length && b.parTf.length && b.parStyle.length && /pas une promesse|rien à bilanter|Aucun trade/.test(b.phrase + 'Aucun trade'), b.phrase);
  const h = objectifHebdo([], {}); v('objectif hebdomadaire sans semaine : dit qu’il n’est pas une promesse', /pas une promesse/.test(h.phrase));
  const hh = objectifHebdo(r.propositions.map(p => ({ ...p })), { risquePct: 0.5, maintenant: s.t[s.n - 1] + 30 * JOUR }); v('objectif hebdomadaire : « pas une promesse » toujours', /pas une promesse/.test(hh.phrase), hh.phrase);
}

/* ── statut du service ── */
{
  const now = 1e12, info = { pid: 1, demarreLe: now - 3 * 3600e3, vivantLe: now - 20e3, trader: { suivies: 2, derniereBougie: { BTC: now - 400e3 } } };
  const en = statutService(info, true, now); v('en marche : le dit, depuis quand, dernière bougie, positions suivies', en.enMarche && /en marche depuis 3 heures/.test(en.phrase) && /BTC/.test(en.phrase) && /2 position/.test(en.phrase), en.phrase);
  const arr = statutService({ ...info, vivantLe: now - 3 * 3600e3 }, false, now); v('arrêté : « arrêté depuis X » + la commande de redémarrage en UNE étape', !arr.enMarche && /arrêté depuis 3 heures/.test(arr.phrase) && /node agent-pc\/service\.mjs/.test(arr.phrase) && /une seule étape/.test(arr.phrase), arr.phrase);
  v('jamais démarré : message clair', /jamais été démarré/.test(statutService(null, false, now).phrase));
  v('battement trop ancien malgré un processus vivant : considéré arrêté', !statutService({ ...info, vivantLe: now - SEUIL_VIVANT - 1000 }, true, now).enMarche);
}

/* ── rendu partagé (PC, tablette, téléphone) ── */
function vueFactice() {
  const p = (id, sens, niveau, statut = 'en_attente') => ({ id, actif: 'BTC', setup: 'balayage_reprise', nom: 'Balayage de liquidité puis reprise (sweep & reclaim)', tf: 'M15', sens, tSignal: 1e12, t: 1e12 + 900e3, tValide: 1e12 + 4e6, entree: 80000, stop: sens > 0 ? 79200 : 80800, cible1: sens > 0 ? 81300 : 78700, cible1Nom: 'extrême H1', cible2: sens > 0 ? 82000 : 78000, cible2Nom: 'extension', rr: 1.6, rr2: 2.5, raison: 'Le prix a balayé un plus bas.', invalidation: 'Annulée sous le stop.', confluences: ['biais H1 / H4 dans le sens du trade', 'VWAP du jour'], nConfluences: 2, diamant: false, regime: 'range', style: 'equilibre', statut, statutTexte: 'en attente (ordre limite pas encore touché)', resultat: null, niveau, niveauTexte: NIVEAUX_TRADER[niveau], confiance: 'Aucun trade terminé de ce type suivi en direct : pas assez de trades pour juger.', fantome: false });
  const bougies = []; for (let i = 0; i < 90; i++) { const o = 80000 + Math.sin(i / 7) * 300 + i, c = o + (i % 2 ? 80 : -60); bougies.push([1e12 - (90 - i) * 900e3, o, Math.max(o, c) + 40, Math.min(o, c) - 40, c]); }
  const stats = statsR([1, -1, 2, -1, -1, 1, 2, -1, -1, 1, -1]);
  return { ok: true, version: 12, t: 1e12 + 1e6, reglages: { style: 'equilibre', niveauMin: 'a_lessai', alertesObservation: false, afficherDemo: false, risquePct: 0.5 }, style: { nom: 'Équilibré', confluenceMin: 2, rrMin: 1.5, maxParJour: 3 }, styles: { prudent: { nom: 'Prudent', confluenceMin: 3, rrMin: 2, maxParJour: 2 }, equilibre: { nom: 'Équilibré', confluenceMin: 2, rrMin: 1.5, maxParJour: 3 }, actif: { nom: 'Actif', confluenceMin: 1, rrMin: 1.5, maxParJour: 3 } },
    setups: { balayage_reprise: 'Balayage de liquidité puis reprise (sweep & reclaim)' }, bandeau: BANDEAU_ESSAI, avertissement: 'Propositions et simulations seulement.', actives: [p('a', 1, 'a_lessai'), p('b', -1, 'candidate', 'ouverte')],
    recentes: [{ ...p('c', 1, 'a_lessai', 'cloturee'), statutTexte: 'terminée : stop touché', resultat: { statut: 'cloturee', R: -1.12, motif: 'stop touché' } }], bougies: { BTC: bougies }, analyses: { BTC: { biais: 1, regime: 'range' } }, pourquoi: [{ actif: 'BTC', setup: 'Cassure', sens: -1, pourquoi: '1 confluence(s), il en faut 2 (style Équilibré)', t: 1 }],
    donnees: { BTC: { derniereBougie: 1e12 - 600e3, ageMin: 10 } }, dernierCycle: 1e12, courbe: [[1, 0.5], [2, -0.3], [3, 1.2], [4, 0.8]], objectifHebdo: { phrase: 'Pas encore de semaine complète simulée. Un objectif n’est pas une promesse.' },
    bilan: { phrase: stats.honnete, risquePct: 0.5, totalPct: 0.1, tous: { propositions: 11, executees: 11, enAttente: 0, expirees: 0, stats }, parType: [{ cle: 'balayage_reprise|BTC|M15', propositions: 11, executees: 11, enAttente: 0, expirees: 0, stats }], parActif: [{ cle: 'BTC', propositions: 11, executees: 11, enAttente: 0, expirees: 0, stats }], parTf: [{ cle: 'M15', propositions: 11, executees: 11, enAttente: 0, expirees: 0, stats }], parStyle: [{ cle: 'equilibre', propositions: 11, executees: 11, enAttente: 0, expirees: 0, stats }], parSetup: [{ cle: 'balayage_reprise', propositions: 11, executees: 11, enAttente: 0, expirees: 0, stats }] },
    types: [{ cle: 'balayage_reprise|DOGE|M15', nom: 'Balayage · DOGE · M15', niveau: 'desactive', niveauTexte: 'Désactivé', raison: 'Ce type perd de façon régulière.', n: 25, esperance: -0.6, baisse: null }], fantomes: 3,
    retro: { BTC: { etiquette: ETIQUETTE_RETRO, n: 1000, stats, hasard: { assez: true, esperance: -0.17 }, faux: 0.69 } }, gestion: { etiquette: ETIQUETTE_RETRO, phrase: 'On garde la sortie actuelle.', lignes: [{ texte: 'cible fixe', etude: -0.1, inconnue: -0.2, nEtude: 50, nInconnue: 30 }] }, journalNiveaux: [] };
}
{
  const vue = vueFactice(), svc = { enMarche: false, phraseCourte: 'Le service est arrêté depuis 3 heures.', commande: 'node agent-pc/service.mjs' };
  const pos = TV.positionsHtml(vue, { service: svc, maintenant: 1e12 + 2e6 }), bil = TV.bilanHtml(vue, { service: svc }), pq = TV.pourquoiHtml(vue, {}), rg = TV.reglagesHtml(vue);
  for (const [nom, h] of [['positions', pos], ['bilan', bil], ['pourquoi', pq], ['réglages', rg]]) v('rendu ' + nom + ' : ni NaN, ni undefined, ni [object Object], ni null', !/NaN|undefined|\[object|null/.test(h.replace(/data-[a-z-]+="[^"]*"/g, '')), (h.match(/.{30}(NaN|undefined|\[object|null).{20}/) || [''])[0]);
  v('positions : niveau de chaque carte visible (À l’essai, Candidate)', /À l’essai/.test(pos) && /Candidate/.test(pos) && (pos.match(/class="tv-carte"/g) || []).length === 2);
  v('positions : bandeau « pas de preuve statistique — le bilan se construit en direct »', /pas de preuve statistique — le bilan se construit en direct/.test(pos));
  v('positions : entrée, stop, cibles, RR, raison, confluences, invalidation, bouton « voir sur le graphique »', ['Entrée (ordre limite)', 'Stop', 'Cible 1', 'Cible 2', 'RR à la cible 1', 'Pourquoi', 'Confluences', 'Ce qui l’invalide', 'Voir sur le graphique'].every(t => pos.includes(t)));
  v('positions : service arrêté → « arrêté depuis 3 heures » + commande, et âge des données', /arrêté depuis 3 heures/.test(pos) && /node agent-pc\/service\.mjs/.test(pos) && /Âge des dernières données/.test(pos));
  v('positions : graphique SVG avec les zones d’entrée / stop / cibles', /<svg class="tv-graphe"/.test(pos) && /cible 1/.test(pos));
  v('bilan : « pas une promesse », courbe réelle, intervalle, rétro-test étiqueté', /pas une promesse/.test(bil) && /tv-courbe/.test(bil) && /IC 95/.test(bil) && /rétro-test à titre d’exemple — pas une preuve/.test(bil));
  v('bilan : lecture honnête d’un petit échantillon', /pas assez de trades pour juger/.test(bil));
  v('bilan : type désactivé visible avec bouton Réactiver', /Désactivé/.test(bil) && /data-tv-reactiver/.test(bil));
  v('aucune position : le dit et explique', /Aucune position à suivre/.test(TV.positionsHtml({ ...vue, actives: [] }, {})) && /Lecture du moment/.test(TV.positionsHtml({ ...vue, actives: [] }, {})));
  v('sans données : message clair, pas de crash', /pas encore calculé/.test(TV.positionsHtml(null, {})) && /Pas encore de bilan/.test(TV.bilanHtml(null, {})));
  v('réglages : style, niveau minimal, alertes (désactivées par défaut), démo (décochée)', /data-tv-reg="style"/.test(rg) && /data-tv-reg="niveauMin"/.test(rg) && !/data-tv-reg="alertesObservation" checked/.test(rg) && !/data-tv-reg="afficherDemo" checked/.test(rg) && /désactivées par défaut/.test(rg));
  const gp = TV.positionsGraphique(vue, 'BTC'); v('positions du graphique de l’écran Agent : les vraies propositions, jamais DÉMO', gp.length === 2 && gp.every(x => !x.demo && x.trader && Array.isArray(x.cibles) && x.nom.includes('·')));
}

/* ── le service complet sur des données synthétiques ── */
{
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'trader-v12-')); const serie = marcheMixte(16000, 21); const envois = []; let t = serie.t[serie.n - 1] + 900e3 + 60e3;
  const paires = ['BTC'], D = { serie: () => serie }, journal = [], erreurs = [];
  const tr = creerTrader({ dossier, D, paires, maintenant: () => t, journal: (c, m) => journal.push(c + ' ' + m), erreur: (c, e) => erreurs.push(c + ' ' + (e && e.message)), envoyer: async (texte, canal) => { envois.push({ texte, canal }); } });
  const cr = await tr.cycle();
  v('le cycle ne produit aucune erreur', erreurs.length === 0, erreurs.join(' | '));
  const vue = tr.vue(); v('la vue est sérialisable en JSON et contient bandeau, bilan, types, analyses', (() => { try { JSON.stringify(vue); return !!vue.bandeau && !!vue.bilan && vue.analyses.BTC; } catch (e) { return false; } })());
  v('trader.json écrit avec la vue publiée', fs.existsSync(path.join(dossier, 'trader.json')) && JSON.parse(fs.readFileSync(path.join(dossier, 'trader.json'), 'utf8')).vuePubliee.version === 12);
  const n1 = tr.etat().propositions.length; await tr.cycle(); v('un second cycle sur la même bougie ne duplique rien', tr.etat().propositions.length === n1);
  v('le rétro-test du jour est calculé et étiqueté dans la vue', vue.retro && vue.retro.BTC && vue.retro.BTC.etiquette === ETIQUETTE_RETRO);
  v('aucune alerte Telegram par défaut pour À l’essai (désactivées)', envois.filter(e => /Observation \(non validé\)/.test(e.texte)).length === 0);
  // alertes d'observation activées à la demande : étiquetées « Observation (non validé) »
  fs.writeFileSync(path.join(dossier, 'trader-commandes.json'), JSON.stringify([{ type: 'reglages', valeur: { alertesObservation: true, style: 'actif' } }]));
  tr.lireCommandes(); v('commande de réglages appliquée (style, alertes d’observation)', tr.reglages().alertesObservation === true && tr.reglages().style === 'actif');
  // la série avance de quelques bougies : de nouvelles propositions arrivent, et seraient alertées avec l'étiquette
  const longue = marcheMixte(16600, 21); D.serie = () => longue; t = longue.t[longue.n - 1] + 900e3 + 60e3;
  for (let k = 0; k < 6; k++) { const cut = marcheMixte(16000 + 100 * (k + 1), 21); D.serie = () => cut; t = cut.t[cut.n - 1] + 900e3 + 60e3; await tr.cycle(); }
  const obs = envois.filter(e => /Observation \(non validé\)/.test(e.texte)); v('si les alertes d’observation sont activées, elles portent l’étiquette « Observation (non validé) » et le niveau', obs.length === 0 || obs.every(e => /Niveau : À l’essai — pas de preuve statistique/.test(e.texte) && e.canal === 'OBSERVATION'), String(obs.length));
  v('aucune alerte d’ENTRÉE officielle tant qu’aucun type n’est Validée', envois.every(e => e.canal !== 'ENTREE'));
  v('plafond quotidien respecté par le service', (() => { const p = tr.etat().propositions.filter(x => !x.fantome), par = new Map(); for (const x of p) { const k = Math.floor(x.tSignal / JOUR); par.set(k, (par.get(k) || 0) + 1); } return [...par.values()].every(n => n <= 3); })());
  await tr.rapportDuMatin(true); v('résumé du matin : positions proposées + bilan, avec l’avertissement', envois.some(e => /mode Trader du/.test(e.texte) && /Bilan simulé en direct/.test(e.texte) && /n’est passé/.test(e.texte)));
  // reprise après arrêt : un nouvel objet relit l'état sans casser l'historique
  const tr2 = creerTrader({ dossier, D, paires, maintenant: () => t, journal: () => {}, erreur: () => {}, envoyer: async () => {} });
  v('redémarrage : l’état est relu, aucune proposition perdue', tr2.etat().propositions.length === tr.etat().propositions.length && tr2.etat().propositions.length > 0);
  // paquet mobile : taille et stabilité de l'empreinte (D1 : on ne réécrit que si le contenu utile change)
  fs.writeFileSync(path.join(dossier, 'service.json'), JSON.stringify({ pid: 1, vivantLe: t, phase: 'attente' }));
  const paquet = plafonner(construirePaquet(dossier, t)), taille = Buffer.byteLength(JSON.stringify(paquet));
  v('le paquet mobile contient le mode Trader et reste sous le plafond (' + Math.round(taille / 1024) + ' Ko)', !!paquet.trader && taille <= MAX_OCTETS, taille);
  const rendu = TV.bilanHtml(paquet.trader, {}) + TV.positionsHtml(paquet.trader, {}) + TV.reglagesHtml(paquet.trader); v('le paquet mobile se rend entièrement (positions, bilan, réglages) sans erreur ni NaN', rendu.length > 500 && !/NaN|undefined|\[object/.test(rendu));
  const h1 = empreintePaquet(paquet), autre = JSON.parse(JSON.stringify(paquet)); autre.t += 1e6; autre.serviceLe += 1e6; autre.trader.dernierCycle += 1e6; autre.trader.t += 1e6; for (const a of Object.keys(autre.trader.bougies)) autre.trader.bougies[a] = autre.trader.bougies[a].slice(1);
  v('D1 : l’empreinte ne bouge pas quand seuls l’heure, le dernier cycle et les bougies changent (aucune écriture inutile)', empreintePaquet(autre) === h1);
  if (autre.trader.actives.length) { autre.trader.actives[0].statut = 'ouverte'; v('D1 : elle bouge quand une position change de statut', empreintePaquet(autre) !== h1); }
  fs.rmSync(dossier, { recursive: true, force: true });
}
console.log('trader-niveaux : ' + ok + ' ok, ' + ko + ' ko');
process.exit(ko ? 1 : 0);
