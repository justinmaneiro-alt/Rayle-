// Test du Veilleur (coeur) : faux echange (bougies synthetiques), faux Worker (calendrier + Telegram), dossier temporaire. AUCUN message reel, AUCUN reseau.
// Verifie : rien d'envoye sans strategie validee, alertes ENTREE/PREPARATION via le circuit complet, MACRO, anti-saturation, desactivation, faux signal sans envoi, pas de secret dans les fichiers.
// Lancer :  node galaxie/tests/veilleur-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerVeilleur } from '../../app-pc/veilleur/coeur.mjs';
import { CRITERES } from '../../planetes/mars/pc/agent-btc/criteres.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import { versBougies } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { etVersUtc } from '../../planetes/mars/pc/finance/calendrier-calcul.js';
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const permissif = Object.freeze({ ...CRITERES, version: 99, recherche: { tradesMin: 5, esperanceMin: -9, factProfitMin: 0 }, horsEchantillon: { esperanceMin: -9, tradesMin: 5, factProfitMin: 0, drawdownMaxR: 9999, parSemaineMax: 99, parSemaineMin: 0, trimestresPositifsMin: 0, trimestresTradesMin: 1, concentrationMax: 9 },
  robustesse: { voisinsPositifsMin: 0, voisinsMin: 0, medianeVoisinsVsMeilleur: -99 }, monteCarlo: { simulations: 200, drawdownP95MaxR: 9999, esperanceP5Min: -99 }, comparaisonsMultiples: { facteur: 0 }, jeuFinal: { esperanceMin: -9, tradesMin: 1, factProfitMin: 0, drawdownMaxR: 9999, parSemaineMax: 99 } });
const MARCHE = versBougies(marcheMixte(112000, 21)), PAS = 900e3;
const horloge = { t: MARCHE[100000].t + 2 * 60e3 };
const JETON_TEST = 'rd_FAUXJETONDETEST123456';
const telegram = [], appels = [];
let evenementsCal = [], telegramEnPanne = null, ffDirect = false, csvResultats = 'symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay\n', blsPoints = null;
const serieBls = (annee, mois, vals) => ({ Results: { series: [{ data: vals.map((x, i) => { const k = annee * 12 + (mois - 1) - i; return { year: String(Math.floor(k / 12)), period: 'M' + String((k % 12) + 1).padStart(2, '0'), value: String(x) }; }) }] } });
const fauxFetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('data-api.binance.vision')) {
    const u = new URL(url), t0 = +u.searchParams.get('startTime'), lim = +u.searchParams.get('limit');
    const l = MARCHE.filter(b => b.t >= t0 && b.t + PAS <= horloge.t).slice(0, lim).map(b => [b.t, b.o, b.h, b.l, b.c, b.v, 0, 0, 1, b.vb, 0, 0]);
    return new Response(JSON.stringify(l), { status: 200 });
  }
  // sources MACRO lues directement par le Veilleur (Node)
  if (url.includes('nfs.faireconomy.media')) return ffDirect ? new Response(JSON.stringify(evenementsCal), { status: 200 }) : new Response('panne', { status: 503 });
  if (url.includes('federalreserve.gov/json/calendar.json')) return new Response(JSON.stringify({ events: [] }), { status: 200 });
  if (url.includes('bls.gov/schedule')) return new Response('BEGIN:VCALENDAR\nEND:VCALENDAR\n', { status: 200 });
  if (url.includes('alphavantage.co')) return new Response(csvResultats, { status: 200 });
  if (url.includes('api.bls.gov')) return blsPoints ? new Response(JSON.stringify(blsPoints), { status: 200 }) : new Response('{}', { status: 500 });
  if (url.startsWith('https://worker.test')) {
    appels.push({ url, jeton: opts.headers && opts.headers['X-Rayle-Token'] });
    if (!opts.headers || opts.headers['X-Rayle-Token'] !== JETON_TEST) return new Response('{"error":"jeton refuse"}', { status: 401 });
    if (url.endsWith('/calendar')) return new Response(JSON.stringify(evenementsCal), { status: 200 });
    if (url.endsWith('/telegram/envoyer')) { if (telegramEnPanne) return new Response(JSON.stringify({ error: 'panne' }), { status: telegramEnPanne }); telegram.push(JSON.parse(opts.body)); return new Response('{"ok":true}', { status: 200 }); }
  }
  return new Response('{}', { status: 404 });
};
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'veilleur-test-'));
const ecrire = (f, o) => { const p = path.join(dossier, f); fs.writeFileSync(p, JSON.stringify(o)); const t = new Date(Date.now() + (ecrire.n = (ecrire.n || 0) + 1) * 5000); fs.utimesSync(p, t, t); };
ecrire('config.local.json', { url: 'https://worker.test', jeton: JETON_TEST });
ecrire('reglages.json', { actif: true, silence: false, types: { OBSERVATION: false }, reposMinutes: 0, maxParJour: 50, maxParSemaine: 100 });
const vv = creerVeilleur({ dossier, fetchImpl: fauxFetch, maintenant: () => horloge.t, criteres: permissif });

// 1. demarrage : historique charge, aucune strategie -> rien envoye
let cr = await vv.cycle();
v('demarrage : historique charge', vv.etat().donnees && vv.etat().donnees.n > 90000, JSON.stringify(vv.etat().donnees));
v('sans strategie : aucune alerte, rien envoye', telegram.length === 0 && cr.alertes.length === 0);

// 2. recherche (criteres permissifs de test) -> strategie validee
const ag = vv.agent(); ag.lancerRecherche({ generationsMax: 1 });
for (let i = 0; i < 4000 && ag.instantane().recherche.enCours; i++) await new Promise(r => setTimeout(r, 5));
v('strategie validee (criteres de TEST)', ag.instantane().etatStrategie === 'validee');

// 3. suivi bougie par bougie : alertes via le circuit
let prep = 0, ent = 0;
for (let k = 100001; k < 108000 && ent < 2; k++) {
  horloge.t = MARCHE[k].t + PAS + 10e3;
  cr = await vv.cycle();
  ent = telegram.filter(m => m.type === 'ENTREE').length; prep = telegram.filter(m => m.type === 'PREPARATION').length;
}
v('direct : une ENTREE est partie sur Telegram (via la route du Worker)', ent >= 1, 'ent=' + ent + ' prep=' + prep);
v('direct : une PREPARATION est partie', prep >= 1);
const e1 = (telegram.find(m => m.type === 'ENTREE') || { texte: '' }).texte;
v('ENTREE : sens, entree, stop, objectif, R, taille, phase, raison, invalidation', ['Sens', 'Entrée', 'Stop', 'Objectif', 'R)', 'Taille', 'Phase du marché', 'Raison', 'Invalidation'].every(s => e1.includes(s)), e1);
v('Telegram : jeton d appareil en en-tete, jamais dans le corps', telegram.every(m => !JSON.stringify(m).includes(JETON_TEST)) && appels.filter(a => a.url.endsWith('envoyer')).every(a => a.jeton === JETON_TEST));
const lignes = fs.readFileSync(path.join(dossier, 'alertes.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
v('application : les alertes sont aussi dans le fichier lu par Rayle', lignes.length >= 2 && lignes.every(l => l.id && l.texte && l.canaux.includes('application')));
v('pas de doublon : chaque identifiant une seule fois', new Set(lignes.map(l => l.id)).size === lignes.length);
v('aucune alerte OBSERVATION (type desactive)', !lignes.some(l => l.type === 'OBSERVATION'));

// 4. desactivation
const avant = telegram.length, nAvant = lignes.length;
ecrire('reglages.json', { actif: false });
for (let k = 108000; k < 108300; k++) { horloge.t = MARCHE[k].t + PAS + 10e3; await vv.cycle(); }
v('veilleur desactive : plus rien n est envoye', telegram.length === avant && fs.readFileSync(path.join(dossier, 'alertes.jsonl'), 'utf8').split('\n').filter(Boolean).length === nAvant);
v('etat ecrit avec le battement de coeur', JSON.parse(fs.readFileSync(path.join(dossier, 'etat.json'), 'utf8')).actif === false);

// 5. MACRO (reactive, observation active)
ecrire('reglages.json', { actif: true, silence: false, types: { OBSERVATION: true }, reposMinutes: 0 });
const dans = min => new Date(horloge.t + min * 60000).toISOString();
evenementsCal = [{ date: dans(50), country: 'USD', impact: 'High', title: 'CPI m/m', forecast: '0.3%', previous: '0.2%' }, { date: dans(50), country: 'EUR', impact: 'Low', title: 'Truc mineur' }, { date: dans(50), country: 'CHF', impact: 'High', title: 'Autre devise' }];
horloge.t += 15 * 60000; cr = await vv.cycle();
const macro = telegram.filter(m => m.type === 'MACRO');
v('MACRO : rappel avant evenement a fort impact (USD)', macro.length === 1 && macro[0].texte.includes('CPI') && macro[0].texte.includes('précédent 0.2%'), JSON.stringify(macro));
v('MACRO : impact faible et autres devises ignores', !JSON.stringify(macro).includes('mineur') && !JSON.stringify(macro).includes('Autre'));
horloge.t += 6 * 60000; await vv.cycle();
v('MACRO : pas de doublon au cycle suivant', telegram.filter(m => m.type === 'MACRO').length === 1);

// 5b. MACRO en direct (sans Worker) : resultats d'une tres grande valeur + « reel » BLS apres publication
ffDirect = true;
{
  const dateEt = new Date(horloge.t + 86400e3).toISOString().slice(0, 10), [Y, M, D] = dateEt.split('-').map(Number);
  csvResultats += 'AAPL,APPLE INC,' + dateEt + ',2026-09-30,1.85,USD,post-market\nXYZ,HORS LISTE,' + dateEt + ',2026-09-30,1,USD,pre-market\n';
  horloge.t = etVersUtc(Y, M, D, 16, 15) - 50 * 60000;            // 50 minutes avant les resultats d'Apple
  const avantMacro = telegram.filter(m => m.type === 'MACRO').length;
  evenementsCal = [];                                              // plus d'evenement du calendrier public
  vv.cycle && await vv.cycle(); horloge.t += 6 * 60000; await vv.cycle();
  const nouveaux = telegram.filter(m => m.type === 'MACRO').slice(avantMacro);
  v('MACRO direct : rappel des resultats d une tres grande valeur (Apple) 60 min avant, valeur hors liste ignoree', nouveaux.some(m => /Résultats APPLE/.test(m.texte)) && !nouveaux.some(m => /HORS LISTE|XYZ/.test(m.texte)), JSON.stringify(nouveaux.map(m => m.texte.slice(0, 80))));
  // CPI americain publie il y a 20 minutes : le « reel » vient du BLS (officiel)
  const dateCpi = new Date(horloge.t - 20 * 60000), moisRef = new Date(Date.UTC(dateCpi.getUTCFullYear(), dateCpi.getUTCMonth() - 1, 1));
  evenementsCal = [{ date: dateCpi.toISOString(), country: 'USD', impact: 'High', title: 'CPI m/m', forecast: '0.3%', previous: '0.2%' }];
  blsPoints = serieBls(moisRef.getUTCFullYear(), moisRef.getUTCMonth() + 1, [336.3, 334.1, 333.0]);
  const avantCpi = telegram.filter(m => m.type === 'MACRO').length;
  delete vv.__x; await new Promise(r => setTimeout(r, 0));
  horloge.t += 10 * 60000; await vv.cycle();
  const cpi = telegram.filter(m => m.type === 'MACRO').slice(avantCpi);
  v('MACRO direct : resultat du CPI americain avec la valeur officielle du BLS (0.7%)', cpi.some(m => /Résultat : CPI m\/m/.test(m.texte) && /Publié : 0\.7%/.test(m.texte) && /prévu 0\.3%/.test(m.texte)), JSON.stringify(cpi.map(m => m.texte.slice(0, 120))));
}
ffDirect = false;

// 6. telegram en panne : alerte gardee en attente puis renvoyee
telegramEnPanne = 503;
const r1 = await vv.traiter({ id: 'P:test:1', cle: 'P:test:1', type: 'PREPARATION', t: horloge.t, sens: 1, texte: 'PRÉPARATION · panne', phase: 'range' }, horloge.t);
v('panne Telegram : alerte visible dans l application', r1.envoyer && r1.canaux.includes('application') && !r1.canaux.includes('telegram'));
v('panne Telegram : mise en attente', vv.etat().canaux.telegram.ok === false && JSON.parse(fs.readFileSync(path.join(dossier, 'file-attente.json'), 'utf8')).length === 1);
telegramEnPanne = null; horloge.t += 21e3; const avantR = telegram.length; await vv.cycle();
v('Telegram revenu : l alerte en attente part', telegram.length > avantR && telegram.some(m => m.texte.includes('panne')));

// 7. faux signal : circuit complet SANS envoi
const avantF = telegram.length;
const rf = await vv.alerteDeTest({ sansEnvoi: true });
v('faux signal : passe par le circuit (application) sans message Telegram', rf.envoyer && rf.canaux.join() === 'application' && telegram.length === avantF, JSON.stringify(rf));
const dernier = fs.readFileSync(path.join(dossier, 'alertes.jsonl'), 'utf8').trim().split('\n').pop();
v('faux signal : clairement etiquete test', /FAUX SIGNAL/.test(dernier) && JSON.parse(dernier).validee === false);

// 8. jeton refuse : erreur, pas de plantage
ecrire('config.local.json', { url: 'https://worker.test', jeton: 'rd_MAUVAISJETON' });
const r2 = await vv.traiter({ id: 'P:test:2', cle: 'P:test:2', type: 'PREPARATION', t: horloge.t, sens: 1, texte: 'PRÉPARATION · x', phase: 'range' }, horloge.t + 1e6);
v('jeton refuse : pas de plantage, erreur notee', r2.envoyer && vv.etat().canaux.telegram.ok === false);

// 9. aucun secret ecrit dans les journaux / etat / alertes
const tout = fs.readdirSync(dossier).filter(f => f !== 'config.local.json' && fs.statSync(path.join(dossier, f)).isFile()).map(f => fs.readFileSync(path.join(dossier, f), 'latin1')).join('\n');
v('aucun jeton dans le journal, l etat, les alertes', !tout.includes('FAUXJETONDETEST') && !tout.includes('MAUVAISJETON'));
vv.arreter();
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
