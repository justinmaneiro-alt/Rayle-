// Test du « chercheur » du Veilleur (recherche de l'agent BTC en arrière-plan) avec un faux échange, un faux Worker (Telegram), un faux détecteur de jeu et un dossier temporaire.
// Lancer :  node galaxie/tests/chercheur-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerChercheur } from '../../app-pc/veilleur/chercheur.mjs';
import { stockagePilote } from '../../app-pc/veilleur/pilote-fichier.mjs';
import { creerDetecteurJeu, chargeEntre } from '../../app-pc/veilleur/charge-systeme.mjs';
import { marcheM5, DERIVE_PLANTEE } from '../../planetes/mars/tests/synth-m5.mjs';
import { fauxBinance } from '../../planetes/mars/tests/faux-binance.mjs';

let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const PAS = 900e3, derive = DERIVE_PLANTEE, now0 = Math.floor(Date.UTC(2024, 2, 5, 12, 0) / PAS) * PAS;
const serie = marcheM5({ n: 110700, graine: 9, derive, t0: now0 - 110000 * PAS }), horloge = { t: now0 };
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-chercheur-'));
const telegram = [], faux = { echec: false };
const fetchImpl = async (url, opts) => { if (/telegram\/envoyer/.test(String(url))) { if (faux.echec) return { ok: false, status: 503, json: async () => ({}) }; telegram.push({ url: String(url), jeton: opts.headers['X-Rayle-Token'], ...JSON.parse(opts.body) }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } throw new Error('URL inattendue ' + url); };
fs.writeFileSync(path.join(dossier, 'config.local.json'), JSON.stringify({ url: 'https://worker.test', jeton: 'jeton-secret-test' }));
const detecteur = { jeu: false, evaluer: async () => ({ jeu: detecteur.jeu, raison: detecteur.jeu ? 'programme de jeu lancé : test.exe' : null }) };
const c = creerChercheur({ dossier, fetchImpl, maintenant: () => horloge.t, lire: fauxBinance(serie, horloge), detecteur, sansPriorite: true, trancheMs: 60000 });

// ── sans état du pilote : rien à chercher, mais les données arrivent ──
let r = await c.cycle();
v('premier cycle : les données sont téléchargées (≈ 3 ans de M15 simulés)', c.histo.serie().n > 100000 && c.etat.donnees.source === 'binance', JSON.stringify(c.etat.donnees));
v('sans réglage : pas de recherche en arrière-plan (désactivée par défaut), raison claire', r.recherche && !r.recherche.fait && /non activée/.test(r.recherche.raison), JSON.stringify(r.recherche));

// ── on crée l'état comme le ferait la page : profil, idée validée ──
const regle = { nom: 'New York + volume + delta', cote: 'long', conditions: [{ type: 'session', valeurs: [2] }, { type: 'volume', min: 1 }, { type: 'delta', sens: 'avec', ratioMin: 0 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 };
let idee; await c.pilote.modifier(p => { p.commande({ type: 'profil', patch: { cible: 1, arrierePlan: { actif: false, heureDebut: '22:00', heureFin: '07:00', pauseDansJeu: true, processusJeu: ['monjeu.exe'] } } }); idee = p.commande({ type: 'idee_proposer', regle, origine: 'constructeur' }).id; p.commande({ type: 'idee_valider', id: idee }); });
r = await c.cycle(); v('arrière-plan non activé : aucune recherche', !r.recherche.fait && /non activée/.test(r.recherche.raison), r.recherche.raison);
await c.pilote.modifier(p => { p.commande({ type: 'profil', patch: { arrierePlan: { actif: true, heureDebut: '00:00', heureFin: '00:00', pauseDansJeu: true, processusJeu: ['monjeu.exe'] } } }); });
// hors des heures : fenêtre 03:00–04:00 alors que l'horloge est à midi (heure locale du test : on la calcule)
const hh = new Date(horloge.t).getHours(), fm = h => String((h + 24) % 24).padStart(2, '0') + ':00';
await c.pilote.modifier(p => { p.commande({ type: 'profil', patch: { arrierePlan: { actif: true, heureDebut: fm(hh + 3), heureFin: fm(hh + 4), pauseDansJeu: true, processusJeu: [] } } }); });
r = await c.cycle(); v('hors des heures réglées : aucune recherche', !r.recherche.fait && /hors des heures/.test(r.recherche.raison), r.recherche.raison);
await c.pilote.modifier(p => { p.commande({ type: 'profil', patch: { arrierePlan: { actif: true, heureDebut: fm(hh - 1), heureFin: fm(hh + 1), pauseDansJeu: true, processusJeu: [] } } }); });
// pendant que je joue : pause
detecteur.jeu = true; r = await c.cycle();
v('pendant le jeu : la recherche est en pause (raison écrite, état « pause_jeu »)', !r.recherche.fait && /pause : programme de jeu/.test(r.recherche.raison) && c.etat.phase === 'pause_jeu', r.recherche.raison);
v('aucune variante n’a été testée pendant la pause', c.pilote.etat().recherche.N === c.pilote.etat().recherche.Navant);
detecteur.jeu = false;
// pause manuelle
await c.pilote.modifier(p => p.commande({ type: 'recherche_pause' })); r = await c.cycle(); v('pause manuelle respectée', !r.recherche.fait && /en pause/.test(r.recherche.raison));
await c.pilote.modifier(p => p.commande({ type: 'recherche_reprise' }));
// recherche réelle : l'idée validée est testée par le vrai protocole
r = await c.cycle();
let e = c.pilote.etat();
v('la recherche tourne : l’idée est testée, une stratégie est VALIDÉE (backtest)', r.recherche.fait && e.bibliotheque.strategies.length === 1 && e.bibliotheque.strategies[0].statut === 'validee', JSON.stringify(r.recherche).slice(0, 200));
v('le coffre du jeu final contient UNE ouverture, enregistrée dans le fichier', e.coffre.ouverts.length === 1 && fs.existsSync(c.pilote.fichier));
v('notification de validation envoyée sur Telegram, une seule fois, avec le jeton d’appareil', telegram.filter(t => /VALIDÉE/.test(t.texte)).length === 1 && telegram[0].jeton === 'jeton-secret-test' && telegram[0].url === 'https://worker.test/telegram/envoyer', JSON.stringify(telegram.map(t => t.texte.slice(0, 40))));
const nTel = telegram.length; await c.cycle(); v('un cycle de plus : aucune notification en double', telegram.length === nTel);
v('le journal et l’état ne contiennent aucun secret', !/jeton-secret-test/.test(fs.readFileSync(c.fichiers.etat, 'utf8')) && !(fs.existsSync(c.fichiers.journal) && /jeton-secret-test/.test(fs.readFileSync(c.fichiers.journal, 'utf8'))) && !/jeton-secret-test/.test(fs.readFileSync(c.pilote.fichier, 'utf8')));
// objectif atteint : plus de recherche ; une suspension la relance
r = await c.cycle(); v('objectif atteint : la recherche s’arrête', !r.recherche.fait && /objectif atteint/.test(r.recherche.raison), r.recherche.raison);
const id = c.pilote.etat().bibliotheque.strategies[0].id; await c.pilote.modifier(p => p.commande({ type: 'suspendre', id, raison: 'test' }));
const permis = await c.peutChercher(); v('une stratégie suspendue relance la recherche (objectif de nouveau non atteint)', permis.ok === true, JSON.stringify(permis));
// Telegram en panne : l'échec est noté, pas de boucle infinie, l'application garde la notification
faux.echec = true; await c.pilote.modifier(p => { p.notifier('test', 'Essai', 'texte de test'); }); const n0 = telegram.length; await c.cycle(); await c.cycle();
const notif = c.pilote.etat().notifications.find(n => n.type === 'test'); v('Telegram en panne : échec enregistré, une seule tentative, aucune perte', telegram.length === n0 && notif && notif.telegramEchec && !notif.canaux.telegram, JSON.stringify(notif));
// direct : bougies fermées traitées, alertes avec le nom de la stratégie
faux.echec = false; await c.pilote.modifier(p => p.commande({ type: 'reactiver', id }));
const avant = c.pilote.etat().derniereBarre; for (let k = 0; k < 4; k++) { horloge.t += 24 * 4 * PAS; await c.cycle(); }
v('direct : les nouvelles bougies fermées sont suivies (derniereBarre avance)', c.pilote.etat().derniereBarre > avant);
// concurrence : deux écrivains, aucune mise à jour perdue
const A = stockagePilote(dossier), B = stockagePilote(dossier), base = (A.etat().compteTest || 0);
await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? A : B).modifier(p => { const e = p.etat(); e.compteTest = (e.compteTest || 0) + 1; })));
v('deux écrivains simultanés : 40 modifications, aucune perdue', A.etat().compteTest === base + 40, A.etat().compteTest + ' vs ' + (base + 40));
v('verrou libéré', !fs.existsSync(path.join(dossier, 'pilote.verrou')));
// détecteur de jeu
{ const d = creerDetecteurJeu({ dossier, lireProcessus: async () => ['explorer.exe', 'Valorant.exe'], lireMesure: (() => { let t = 0; return () => { t += 100; return { idle: t * 0.9, total: t }; }; })() });
  let x = await d.evaluer({ processusJeu: ['valorant'] }); v('détecteur : programme de jeu reconnu (insensible à la casse, sans .exe)', x.jeu && /valorant/i.test(x.raison), JSON.stringify(x));
  x = await d.evaluer({ processusJeu: ['autre.exe'] }); v('détecteur : un programme absent de la liste ne déclenche rien', !x.jeu);
  x = await d.evaluer({ processusJeu: ['valorant'], pauseDansJeu: false }); v('détecteur : « pause dans le jeu » décochée → jamais de pause', !x.jeu);
  fs.writeFileSync(d.drapeau, '1'); x = await d.evaluer({}); v('détecteur : mode jeu de Rayle (fichier drapeau)', x.jeu && /mode jeu/.test(x.raison)); fs.unlinkSync(d.drapeau);
  const d2 = creerDetecteurJeu({ dossier, fenetre: 3, lireProcessus: async () => [], lireMesure: (() => { let t = 0, i = 0; return () => { t += 100; i++; return { idle: i * 10, total: t }; }; })() });
  let y; for (let k = 0; k < 4; k++) y = await d2.evaluer({}); v('détecteur : processeur très occupé en continu → pause', y.jeu && /processeur très occupé/.test(y.raison), JSON.stringify(y));
  v('chargeEntre : calcul de la charge', Math.abs(chargeEntre({ idle: 0, total: 0 }, { idle: 25, total: 100 }) - 0.75) < 1e-9); }
fs.rmSync(dossier, { recursive: true, force: true });
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
