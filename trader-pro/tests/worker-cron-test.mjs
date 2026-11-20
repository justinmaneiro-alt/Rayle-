/* Tests du routeur de tâches planifiées et du budget du Worker (v6). node trader-pro/tests/worker-cron-test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { tachesDuPassage, lancerTaches, heureParis } from '../worker/src/cron.js';
import { compterDepot, viderBudget, alerterBudget, repondreBudget, compteur } from '../worker/src/budget.js';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const U = (y, mo, j, h, mi) => Date.UTC(y, mo - 1, j, h, mi);
/* novembre 2026 : heure de Paris = UTC + 1. Lundi 23 nov. */
v(tachesDuPassage(U(2026, 11, 23, 6, 45)).includes('briefing'), 'lundi 7 h 45 Paris (6 h 45 UTC) : briefing'); v(tachesDuPassage(U(2026, 11, 23, 6, 47)).includes('briefing'), 'lundi 7 h 47 : briefing (fenêtre de 5 minutes)'); v(!tachesDuPassage(U(2026, 11, 23, 6, 50)).includes('briefing'), 'lundi 7 h 50 : plus de briefing (un seul envoi)');
v(!tachesDuPassage(U(2026, 11, 22, 6, 45)).includes('briefing') && !tachesDuPassage(U(2026, 11, 21, 6, 45)).includes('briefing'), 'dimanche et samedi : pas de briefing du jour');
v(tachesDuPassage(U(2026, 11, 22, 17, 0)).includes('revue') && !tachesDuPassage(U(2026, 11, 23, 17, 0)).includes('revue'), 'dimanche 18 h Paris : revue ; pas le lundi');
/* été : Paris = UTC + 2 → 7 h 45 Paris = 5 h 45 UTC */
v(tachesDuPassage(U(2026, 7, 6, 5, 45)).includes('briefing') && !tachesDuPassage(U(2026, 7, 6, 6, 45)).includes('briefing'), 'heure d\'été : briefing à 5 h 45 UTC (7 h 45 Paris)');
v(heureParis(U(2026, 11, 23, 6, 45)).h === 7 && heureParis(U(2026, 7, 6, 5, 45)).h === 7, 'heure de Paris (hiver et été)');
/* clôtures */
v(tachesDuPassage(U(2026, 11, 23, 13, 0)).includes('cloture-h1') && !tachesDuPassage(U(2026, 11, 23, 13, 0)).includes('cloture-h4'), '13 h : clôture H1 seulement');
v(tachesDuPassage(U(2026, 11, 23, 12, 2)).includes('cloture-h4') && !tachesDuPassage(U(2026, 11, 23, 12, 7)).includes('cloture-h1'), '12 h 02 : clôture H4 ; 12 h 07 : plus rien');
v(tachesDuPassage(U(2026, 11, 23, 0, 0)).includes('cloture-jour') && tachesDuPassage(U(2026, 11, 23, 0, 0)).includes('cloture-h4'), 'minuit UTC : clôtures Daily, H4 et H1');
v(['budget', 'alertes-prix', 'rappel-import', 'alertes-invest'].every(t => tachesDuPassage(U(2026, 11, 23, 14, 30)).includes(t)), 'à tout passage : budget, alertes de prix, rappel, Investissement');
/* isolation : l'échec d'une tâche n'empêche pas les autres */
const r = await lancerTaches(['a', 'b', 'c'], { a: async () => 'fait', b: async () => { throw new Error('panne source'); } }); v(r.a === 'fait' && /panne source/.test(r.b) && r.c === 'absente', 'une tâche en panne n\'empêche pas les autres');
/* budget */
const depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:'))), d = compterDepot(depot);
compteur.vider(); await d.kvEcrire('x', 1); await d.kvLire('x'); await d.kvLire('x'); compteur.ajouter('requetes', 40); let l = compteur.lire(); v(l.d1Ecrites === 1 && l.d1Lues === 2 && l.requetes === 40, 'le dépôt compte les lectures et écritures D1 (' + JSON.stringify(l) + ')');
const T = U(2026, 11, 23, 12, 0); let b = await viderBudget(depot, compteur, T); v(b.budget.requetes === 41 && b.budget.crons === 1 && b.niveau.niveau === 'ok', 'passage du cron : budget écrit une fois (requêtes ' + b.budget.requetes + ')');
v(compteur.lire().requetes === 0, 'compteurs remis à zéro après écriture'); const rep = await repondreBudget(depot, compteur, T + 1000); v(rep.jour === '2026-11-23' && rep.ralentir === 1 && /tout va bien/.test(rep.texte), 'GET /budget : consommation du jour, aucun ralentissement');
b = await viderBudget(depot, compteur, T + 86400e3); v(b.budget.jour === '2026-11-24' && b.budget.requetes === 1, 'nouveau jour UTC : compteurs repartent de zéro');
/* 70 % : alerte Telegram une seule fois par jour et par limite + ralentissement */
const gros = { ...b.budget, requetes: 75000 }; await depot.kvEcrire('budget', gros); const rep2 = await repondreBudget(depot, compteur, T + 86400e3 + 5000); v(rep2.niveau === 'alerte' && rep2.ralentir === 4 && rep2.pire === 'requetes', 'à 75 % : niveau alerte, rafraîchissements non essentiels ralentis ×4');
let envoyes = 0; const fetchTg = async () => { envoyes++; return { ok: true }; }; const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' };
const n = (await import('../commun/budget-cf.js')).niveau(gros); v(await alerterBudget(env, depot, { ...gros, alertes: {} }, n, fetchTg) === true && envoyes === 1, 'alerte Telegram envoyée à 70 %'); const apres = (await depot.kvLire('budget')); v(await alerterBudget(env, depot, apres, n, fetchTg) === false && envoyes === 1, 'pas de seconde alerte le même jour pour la même limite');
v(await alerterBudget({}, depot, { ...gros, alertes: {} }, n, fetchTg) === false, 'sans secrets Telegram : aucun envoi, aucune erreur');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `worker-cron-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
