// V14 : le suivi en direct du tableau vivant (agent-pc/volume-v14.mjs) sur des données SYNTHÉTIQUES et une horloge injectée : signaux sans doublon, états en attente / ouverte / terminée / annulée,
// portefeuille virtuel composé, reprise après redémarrage, paquet mobile compact, intégrité du chargeur de données (historique + direct).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerVolume, compacterVolume, CONFIGS_DEFAUT } from '../../agent-pc/volume-v14.mjs';
import { chargerSerie } from '../../agent-pc/volume-donnees.mjs';
import { creerConstructeur, agregerH1 } from '../../strategies/volume/serie-volume.js';
import { trancheDe, MS15 } from '../../strategies/liquidite/barres-flux.js';
import { portefeuille } from '../../strategies/volume/simulation-volume.js';
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const T0 = Date.UTC(2026, 0, 5, 0, 0);
function marche(nb, graine, depart) {
  let x = graine >>> 0; const alea = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }, out = []; let p = depart;
  for (let i = 0; i < nb; i++) { const o = p, c = p * (1 + (alea() - 0.5) * 0.008), h = Math.max(o, c) * (1 + alea() * 0.003), l = Math.min(o, c) * (1 - alea() * 0.003), vol = 1e6 * (0.5 + alea()), a = vol * Math.min(0.95, Math.max(0.05, 0.5 + (c - o) / o * 60 + (alea() - 0.5) * 0.2)); const fp = []; const ks = new Set(); for (let k = 0; k < 8; k++) { const kk = trancheDe(l + (h - l) * (k + 0.5) / 8); if (!ks.has(kk)) { ks.add(kk); fp.push([kk, Math.round(a / 8), Math.round((vol - a) / 8)]); } } fp.sort((u, v) => u[0] - v[0]); out.push({ t: T0 + i * MS15, achatUsd: Math.round(a), venteUsd: Math.round(vol - a), n: 10, plusGrosUsd: 1000, ouv: o, haut: h, bas: l, cloture: c, fp }); p = c; }
  return out;
}
const toutes = { BTC: marche(2200, 3, 80000), SOL: marche(2200, 5, 100) };
let nBarres = 1500;
const fabrique = actif => { const cons = creerConstructeur(); for (const b of toutes[actif].slice(0, nBarres)) cons.ajouter(b); const m15 = cons.finir(), dernier = new Date(m15.t[m15.nBarres - 1]).toISOString().slice(0, 10); return { actif, m15, h1: agregerH1(m15), jours: 15, de: '2026-01-05', a: dernier, trous: 0, barres: m15.nBarres, direct: 0 }; };
const horloge = () => T0 + nBarres * MS15 + 60e3;
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'volume-svc-'));
// configuration forcée : beaucoup de signaux (seuil de delta nul, risque minimal 1 ATR) pour exercer le suivi
fs.writeFileSync(path.join(dossier, 'volume-v14-recherche.json'), JSON.stringify({ t: 1, nEssais: 12, finalistes: [], configs: [{ setup: 'acceptation_hors_valeur', tf: 'H1', params: { relatif: 0, rr: 2, riskMinAtr: 1 }, niveau: 'a_lessai', oosR: 0.05, oosN: 100 }] }));
const mk = () => creerVolume({ dossier, maintenant: horloge, actifs: ['BTC', 'SOL'], chargerLaSerie: (a) => fabrique(a), lireDirect: () => ({ barres: [], lignes: 0 }), journal: () => {}, erreur: (c, e) => { throw e; } });
let v = mk(); v.etat().demarreLe = T0 + 700 * MS15;                // suivi démarré avant les barres 700+ : les signaux plus anciens sont ignorés (le passé est « rejoué », pas « suivi »)
nBarres = 1500; let r = await v.cycle({ force: true }); ok(r.ok, 'premier cycle');
const sig1 = v.etat().signaux.length; ok(sig1 === 0, 'au démarrage, seuls les signaux des 6 dernières barres sont repris (' + sig1 + ')');
// l'horloge avance barre par barre : les signaux arrivent un par un, sans doublon
const vus = new Set(); for (let k = 1501; k <= 2100; k += 1) { nBarres = k; await v.cycle({ force: true }); }
const S = v.etat().signaux; ok(S.length > 3, 'des propositions ont été suivies (' + S.length + ')'); ok(new Set(S.map(x => x.id)).size === S.length, 'aucun doublon d’identifiant');
ok(S.every(x => ['en_attente', 'ouverte', 'terminee', 'annulee'].includes(x.statut)), 'statuts valides'); ok(S.every(x => x.tSignal > v.etat().demarreLe - 6 * 3600e3), 'aucune proposition antérieure au démarrage');
const par = { en_attente: 0, ouverte: 0, terminee: 0, annulee: 0 }; for (const x of S) par[x.statut]++; ok(par.terminee > 0, 'des trades terminés : ' + JSON.stringify(par));
ok(S.filter(x => x.statut === 'terminee').every(x => Number.isFinite(x.R) && x.tEntree && x.tSortie > x.tEntree), 'chaque trade terminé a un R fini, une entrée et une sortie');
ok(S.filter(x => x.statut === 'en_attente' || x.statut === 'ouverte').length <= 2, 'une position à la fois par setup et par actif (au plus 2 vivantes pour 2 actifs)');
// une proposition ne change jamais de niveaux une fois créée, et rejouée à un autre moment donne le MÊME résultat (déterminisme)
const avant = JSON.stringify(S.filter(x => x.statut === 'terminee').map(x => [x.id, x.R, x.resultat])); v.suivre({ BTC: fabrique('BTC'), SOL: fabrique('SOL') }); ok(avant === JSON.stringify(v.etat().signaux.filter(x => x.statut === 'terminee').map(x => [x.id, x.R, x.resultat])), 'rejouer le suivi donne exactement les mêmes trades');
// portefeuille : cohérent avec le moteur pur, composé, persistant
const vue = v.vue(); const fermes = S.filter(x => x.statut === 'terminee').map(x => ({ cle: x.cle, actif: x.actif, setup: x.setup, tEntree: x.tEntree, tSortie: x.tSortie, R: x.R, ouvert: false }));
const attendu = portefeuille(fermes, { capital0: 10000, risquePct: 1, risqueParCle: v.reglerRisques() }); ok(Math.abs(vue.portefeuille.capital - attendu.capital) < 0.01, 'capital de la vue = portefeuille pur (' + vue.portefeuille.capital + ')');
ok(vue.portefeuille.capital0 === 10000 && vue.portefeuille.risqueAConfirmer === true && /SIMULÉ/.test(vue.portefeuille.etiquette), 'étiquettes : simulé, risque à confirmer'); ok(vue.avertissement.includes('aucun ordre'), 'avertissement : aucun ordre');
ok(vue.verdict && /Recherche pas encore faite|Aucune stratégie validée|validée/.test(vue.verdict.texte), 'verdict présent'); ok(vue.actifs.BTC.h1.bougies.length === 120 && vue.actifs.BTC.m15.bougies.length === 160, 'séries du graphique'); ok(Array.isArray(vue.actifs.SOL.footprint), 'empreinte des dernières barres');
// reprise après redémarrage : l'état revient du fichier, sans perte ni doublon
const v2 = mk(); ok(v2.etat().signaux.length === S.length && v2.etat().demarreLe === v.etat().demarreLe, 'état relu du fichier après redémarrage'); nBarres = 2101; await v2.cycle({ force: true }); ok(new Set(v2.etat().signaux.map(x => x.id)).size === v2.etat().signaux.length, 'toujours sans doublon après redémarrage');
// pause automatique : un type qui perd de façon stable après 30 trades suivis est mis en pause ; un type qui gagne voit son risque monter (plafonné)
{ const w = mk(); const e = w.etat(); e.signaux = Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, actif: 'BTC', cle: 'perdant', setup: 'diamant', statut: 'terminee', R: i % 5 === 0 ? 1 : -0.8, tEntree: i, tSortie: i + 1 })).concat(Array.from({ length: 40 }, (_, i) => ({ id: 'g' + i, actif: 'SOL', cle: 'gagnant', setup: 'diamant', statut: 'terminee', R: i % 2 ? 1.5 : -1, tEntree: i, tSortie: i + 1 })));
  const risques = w.reglerRisques(); ok(e.pauses.perdant && e.pauses.perdant.n === 40, 'un type qui perd après 30 trades est mis en pause automatiquement'); ok(risques.gagnant > 1 && risques.gagnant <= 1.5, 'un type qui gagne voit son risque monter, plafonné à 1,5 % (' + risques.gagnant + ')'); }
// paquet mobile compact
const c = compacterVolume(vue); ok(!c.actifs.BTC.footprint || c.actifs.BTC.footprint.length <= 3, 'empreinte réduite pour le téléphone'); ok(Buffer.byteLength(JSON.stringify(c)) < 120000, 'paquet mobile < 120 Ko (' + Buffer.byteLength(JSON.stringify(c)) + ')'); ok(c.actifs.BTC.h1.bougies.length <= 72, 'bougies H1 réduites');
// défauts
ok(CONFIGS_DEFAUT.length >= 1 && CONFIGS_DEFAUT[0].niveau === 'a_lessai', 'sans recherche, le setup par défaut est « À l’essai »');
// chargeur : un historique incomplet ne se présente jamais comme à jour
{ const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'volume-vide-')); ok(chargerSerie('SOL', { dossier: d2 }) === null, 'sans fichiers de transactions : null (jamais de série inventée)'); const w = creerVolume({ dossier: d2, maintenant: horloge, actifs: ['SOL'], lireDirect: () => ({ barres: [] }), journal: () => {}, erreur: () => {} }); const rr = await w.cycle({ force: true }); ok(rr.ok === false && /Aucun historique/.test(w.vue().indisponible), 'état « indisponible » dit en clair'); }
{ const w = creerVolume({ dossier: fs.mkdtempSync(path.join(os.tmpdir(), 'volume-vieux-')), maintenant: () => T0 + 400 * 86400e3, actifs: ['BTC'], chargerLaSerie: a => fabrique(a), lireDirect: () => ({ barres: [] }), journal: () => {}, erreur: () => {} }); await w.cycle({ force: true }); ok(w.vue().indisponible, 'historique vieux de plus de 5 jours : pas de suivi en direct, raison donnée'); }
console.log('volume-service : ' + n + ' vérifications OK');
