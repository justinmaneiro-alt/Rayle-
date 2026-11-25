/* Tests du carnet de prévisions (phase 6) : enregistrement (pas de doublon), vérification à +1, +3, +5 jours (juste / faux / neutre / invalidé), fiabilité par actif / unité / situation, confiance adaptée
   et dite honnêtement, Worker, passage GitHub Actions. Usage : node trader-pro/tests/previsions-test.mjs */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { enregistrer, verifier, statistiques, fiabiliteSituation, creerPrevisions, resumeParle, statsDe, filtrer, JOUR, H, MIN_CAS } from '../copilote/previsions.js';
import { composerPoint } from '../point/composer.js';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
import { traiterCopilote } from '../worker/src/copilote.js';
import { passage, executer, lireFiches } from '../../outils-donnees/previsions.mjs';
import { htmlFiabilite } from '../copilote/fiabilite-ui.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const T0 = Date.UTC(2026, 10, 10, 8, 0), S = (o = {}) => ({ actif: 'or', sens: -1, situation: 'tendance_alignee', unite: 'J', prix0: 3600, invalidation: { prix: 3650, nom: 'le plus haut de la veille' }, objectifPct: -1.7, confiance: 'signal moyen', ...o });
/* H1 : prix qui suit une fonction du temps (en jours depuis T0) */
const barres = f => { const B = []; for (let t = T0 - 2 * JOUR; t < T0 + 8 * JOUR; t += H) B.push({ t, o: f((t - T0) / JOUR), h: f((t - T0) / JOUR) + 1, l: f((t - T0) / JOUR) - 1, c: f((t - T0 + H) / JOUR) }); return B; };

console.log('— enregistrement —');
{
  let r = enregistrer([], [S()], T0, { atrJ: { or: 60 } }); v(r.ajoutees === 1 && r.liste[0].sens === -1 && r.liste[0].inval.prix === 3650 && r.liste[0].horizonJours === 5 && r.liste[0].atrJ === 60 && r.liste[0].statut === 'ouvert', 'le scénario principal est enregistré (actif, direction, horizon, invalidation, ATR)');
  v(enregistrer(r.liste, [S()], T0 + 3 * H, { atrJ: { or: 60 } }).ajoutees === 0, 'même scénario 3 h plus tard : pas de doublon');
  v(enregistrer(r.liste, [S()], T0 + 13 * H, { atrJ: { or: 60 } }).ajoutees === 1, 'toutes les 12 h : une nouvelle prévision');
  v(enregistrer(r.liste, [S({ sens: 1 })], T0 + 1 * H).ajoutees === 1, 'changement de sens : enregistré tout de suite');
  v(enregistrer(r.liste, [S({ situation: 'balayage' })], T0 + 3 * H).ajoutees === 1 && enregistrer(r.liste, [S({ situation: 'tendance_mixte' })], T0 + 3 * H).ajoutees === 0, 'un événement clé nouveau (balayage) : enregistré ; un simple changement de contexte : non');
  v(enregistrer([], [S({ sens: 0 }), { actif: 'btc' }, null], T0).ajoutees === 0, 'scénario sans direction ou sans prix : ignoré');
  v(enregistrer(Array.from({ length: 700 }, (_, i) => ({ id: 'x' + i, actif: 'btc', t: i, sens: 1, verifs: {} })), [], T0).liste.length === 600, 'carnet borné à 600 prévisions');
}

console.log('— vérification à +1, +3 et +5 jours —');
{
  const prev = () => enregistrer([], [S({ sens: -1 })], T0, { atrJ: { or: 60 } }).liste;
  /* prix qui baisse de 100 par jour : juste partout */
  let V = verifier(prev(), { or: barres(d => 3600 - 100 * d) }, T0 + 6 * JOUR); const p = V.liste[0];
  v(p.verifs.j1 === 'juste' && p.verifs.j3 === 'juste' && p.verifs.j5 === 'juste' && p.statut === 'clos' && V.verifiees === 3, 'baisse nette : juste à +1, +3 et +5 jours, prévision close');
  V = verifier(prev(), { or: barres(d => 3600 - 100 * d) }, T0 + 2 * JOUR); v(V.liste[0].verifs.j1 === 'juste' && V.liste[0].verifs.j3 === null && V.liste[0].statut === 'ouvert', 'à +2 jours : seulement l’échéance à +1 jour est jugée, le reste attend');
  v(verifier(prev(), { or: barres(d => 3600 - 100 * d) }, T0 + 1 * JOUR + 30 * 60e3).liste[0].verifs.j1 === null, 'avant la clôture de la bougie d’échéance : rien n’est jugé');
  V = verifier(prev(), { or: barres(d => 3600 + 100 * d) }, T0 + 6 * JOUR); const f = V.liste[0]; v(f.verifs.j1 === 'invalide' && f.verifs.j3 === 'invalide' && f.verifs.j5 === 'invalide' && f.statut === 'clos', 'le prix monte au-delà du niveau d’invalidation (clôture H1) : « invalidé » et clos');
  V = verifier(prev(), { or: barres(d => 3600 + 20 * d) }, T0 + 6 * JOUR); v(V.liste[0].verifs.j1 === 'faux' || V.liste[0].verifs.j1 === 'neutre', 'remontée sans franchir l’invalidation : faux ou neutre, jamais « juste » (' + V.liste[0].verifs.j1 + ')');
  V = verifier(prev(), { or: barres(d => 3600 + 0.5 * d) }, T0 + 6 * JOUR); v(V.liste[0].verifs.j1 === 'neutre' && V.liste[0].verifs.j5 === 'neutre', 'le prix ne bouge presque pas (moins de 0,25 ATR) : « neutre », compté à part');
  const haussier = enregistrer([], [S({ sens: 1, invalidation: { prix: 3550, nom: 'x' } })], T0, { atrJ: { or: 60 } }).liste; V = verifier(haussier, { or: barres(d => 3600 + 100 * d) }, T0 + 6 * JOUR); v(V.liste[0].verifs.j3 === 'juste', 'scénario haussier : juste si le prix monte');
  v(verifier(prev(), {}, T0 + 6 * JOUR).verifiees === 0 && verifier(prev(), { or: [] }, T0 + 6 * JOUR).verifiees === 0, 'sans bougies : rien n’est jugé (jamais inventé)');
  const sansInval = enregistrer([], [S({ invalidation: null })], T0, { atrJ: { or: 60 } }).liste; v(verifier(sansInval, { or: barres(d => 3600 + 100 * d) }, T0 + 6 * JOUR).liste[0].verifs.j1 === 'faux', 'sans niveau d’invalidation : jugé sur le prix seul');
  v(verifier(V.liste, { or: [] }, T0 + 9 * JOUR).liste[0].statut === 'clos', 'une prévision close n’est plus touchée');
  /* week-end : l'échéance tombe dans un trou de bougies, on prend la dernière clôture connue */
  const trou = barres(d => 3600 - 100 * d).filter(b => !(b.t >= T0 + 1 * JOUR - 3 * H && b.t < T0 + 1 * JOUR + 30 * H)); v(verifier(prev(), { or: trou }, T0 + 6 * JOUR).liste[0].verifs.j1 === 'juste', 'marché fermé à l’échéance : dernière clôture connue');
}

console.log('— fiabilité mesurée —');
{
  const mk = (n, juste, sit, actif = 'or', t = T0, unite = 'J') => Array.from({ length: n }, (_, i) => ({ id: `${actif}|${sit}|${i}`, actif, t: t + i * H, sens: -1, unite, situation: sit, verifs: { j1: i < juste ? 'juste' : 'faux', j3: i < juste ? 'juste' : i % 2 ? 'faux' : 'invalide', j5: null }, statut: 'ouvert' }));
  const L = [...mk(10, 7, 'cassure_ma200_volume'), ...mk(8, 2, 'balayage', 'btc', T0, 'H4'), ...mk(3, 3, 'volume_extreme_fin')], maint = T0 + 20 * H;
  const st = statistiques(L, maint); v(st.total === 21 && st.global.n === 21 && st.global.juste === 12, 'statistiques globales : 21 vérifiées, 12 justes');
  v(st.parActif.or.n === 13 && st.parActif.btc.n === 8 && st.parUnite.J.n === 13 && st.parUnite.H4.n === 8 && st.parSituation.cassure_ma200_volume.juste === 7, 'par actif, par unité de temps, par type de situation');
  const a = fiabiliteSituation(L, { actif: 'or', situation: 'cassure_ma200_volume', maintenant: maint }); v(/m’a donné raison 7 fois sur 10 ce mois-ci/.test(a.texte) && a.taux === 0.7 && a.ajuste('signal moyen') === 'signal assez solide', '« ce type de situation m’a donné raison 7 fois sur 10 ce mois-ci » + confiance relevée');
  const m = fiabiliteSituation(L, { situation: 'balayage', maintenant: maint }); v(/Attention : .*me réussit mal ce mois-ci : je n’ai eu raison que 2 fois sur 8/.test(m.texte) && m.ajuste('signal assez solide') === 'signal faible' && m.ajuste('signal moyen') === 'signal faible', 'situation qui réussit mal : dit franchement + confiance baissée');
  const p = fiabiliteSituation(L, { situation: 'volume_extreme_fin', maintenant: maint }); v(/je n’ai que 3 cas vérifiés ce mois-ci : trop tôt pour juger/.test(p.texte) && p.ajuste('signal moyen') === 'signal moyen', 'moins de 5 cas : « trop tôt pour juger », confiance inchangée');
  v(fiabiliteSituation([], { situation: 'balayage', maintenant: maint }).texte === '' && fiabiliteSituation(L, { situation: 'balayage', maintenant: maint + 40 * JOUR }).texte === '', 'rien à dire sans cas (ou cas trop anciens : « ce mois-ci » = 30 jours)');
  const R = resumeParle(st); v(/À trois jours, j’ai eu raison 12 fois sur 21 \(57 %\)/.test(R) && /Ma meilleure situation : une cassure de la MA200 avec volume \(7 fois sur 10\)/.test(R) && /me réussit le moins : un balayage de niveau clé \(2 fois sur 8\)/.test(R), 'résumé parlé : taux, meilleure et pire situation : ' + R.slice(0, 120));
  v(/pas encore enregistré/.test(resumeParle(statistiques([]))) && /trop tôt pour juger/.test(resumeParle(statistiques(mk(3, 2, 'balayage')))), 'carnet vide ou presque : « trop tôt »');
  v(statsDe(filtrer(L, { actif: 'btc' }), 3).n === 8 && filtrer(L, { jours: 1, maintenant: T0 + 40 * JOUR }).length === 0, 'filtres par actif et par durée');
  const h = htmlFiabilite(L, maint); v(/Fiabilité|En clair/.test(h) && /Par actif/.test(h) && /Par type de situation/.test(h) && /trop tôt/.test(h) && /<script/i.test(h) === false, 'fenêtre « Fiabilité de Rayle » : tableaux par actif, unité, situation');
  v(/Aucune prévision enregistrée/.test(htmlFiabilite([])), 'fenêtre vide : message clair');
}

console.log('— Rayle adapte sa confiance dans ses points —');
{
  const H1 = []; let p = 3700; for (let i = 120; i >= 1; i--) { const t = T0 - i * H, c = p - 1.3; H1.push([t, p, Math.max(p, c) + 1, Math.min(p, c) - 1, c]); p = c; }
  const F = { version: 1, actif: 'or', nom: 'Or', t: T0, prix: p, tPrix: T0 - 300000, atrJ: 80, h1: H1, tendance: { J: { dispo: true, sens: 'baissier', ma200: 4283, ecartAtr: -7, atrPct: 2.4 }, H4: { dispo: true, sens: 'baissier', ma200: 3909, ecartAtr: -8.9, atr: 38 }, H1: { dispo: true } }, biais: 'baissier', regime: { H4: { dispo: true, type: 'tendance', efficacite: 0.4, compression: false } }, niveaux: { reperes: { PDH: 3693, PDL: 3571 }, supports: [{ prix: 3505, unite: 'J' }], resistances: [{ prix: 3880, unite: 'H4' }] }, sessions: [], score: { score100: 18, verdict: 'Vendeur fort', composants: [], manquants: [] }, statsJ: { dispo: true, cas: 100, petit: false, partHaussePct: 40, hausseMaxMedianePct: 1.4, baisseMaxMedianePct: -1.7 }, agenda: [], volume: { J: { disponible: true, liste: [] }, H4: { disponible: true, liste: [] }, H1: { disponible: true, liste: [] } }, evenements: [], grosMouvements: [], croisements: [], manques: [] };
  const base = composerPoint({ type: 'actif', fiches: { or: F }, maintenant: T0, depuis: T0 - 9 * H }); const confBase = base.confiances.or;
  const mauvais = Array.from({ length: 10 }, (_, i) => ({ id: 'a' + i, actif: 'or', t: T0 - 5 * JOUR + i * H, sens: -1, unite: 'J', situation: 'tendance_alignee', verifs: { j1: 'faux', j3: i < 2 ? 'juste' : 'faux', j5: null }, statut: 'ouvert' }));
  const P = composerPoint({ type: 'actif', fiches: { or: F }, maintenant: T0, depuis: T0 - 9 * H, previsions: creerPrevisions(mauvais) });
  v(P.confiances.or === 'signal faible' && /me réussit mal ce mois-ci : je n’ai eu raison que 2 fois sur 10/.test(P.texteParle) && P.retirees.length === 0, 'situation qui me réussit mal : « signal faible » + phrase honnête dans le conseil (base : ' + confBase + ')');
  const bons = mauvais.map((x, i) => ({ ...x, verifs: { j1: 'juste', j3: i < 8 ? 'juste' : 'faux', j5: null } })), P2 = composerPoint({ type: 'actif', fiches: { or: F }, maintenant: T0, depuis: T0 - 9 * H, previsions: creerPrevisions(bons) });
  v(/m’a donné raison 8 fois sur 10 ce mois-ci/.test(P2.texteParle) && P2.retirees.length === 0 && verifierOk(P2), 'situation qui me réussit : « m’a donné raison 8 fois sur 10 ce mois-ci », chiffres vérifiés');
  v(P.scenarios.length === 1 && P.scenarios[0].situation === 'tendance_alignee' && P.scenarios[0].sens === -1 && P.scenarios[0].invalidation && P.scenarios[0].prix0 > 0, 'le point expose son scénario principal (ce qui est enregistré au carnet)');
}
function verifierOk(P) { return P.texteParle.length > 100; }

console.log('— Worker et passage GitHub Actions —');
{
  const depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:'))), env = { LECTURE_CODE: 'code-ecriture-de-test-123456' }, autoriser = async rq => (rq.headers.get('X-Portefeuille-Code') === 'code-portefeuille-123456' ? { ok: true } : { ok: false, code: 401, raison: 'code refusé' });
  const W = async (url, init = {}) => (await traiterCopilote(new Request(url, init), env, depot, { cors: {}, autoriser })) || new Response('{}', { status: 404 }), L = { 'X-Lecture-Code': env.LECTURE_CODE }, A = { 'X-Portefeuille-Code': 'code-portefeuille-123456' };
  v((await W('https://w.test/copilote/previsions')).status === 401 && (await W('https://w.test/copilote/previsions', { method: 'PUT', headers: A, body: '{"previsions":[]}' })).status === 401, 'lecture sans code et écriture avec le code de l’appli : refusées (seul GitHub Actions écrit)');
  v((await W('https://w.test/copilote/previsions', { method: 'PUT', headers: L, body: 'x' })).status === 400, 'format invalide refusé');
  const E = [{ id: 'or|1', actif: 'or', t: 1, sens: -1, verifs: { j1: 'juste' } }]; v((await W('https://w.test/copilote/previsions', { method: 'PUT', headers: L, body: JSON.stringify({ previsions: E }) })).status === 200, 'écriture par GitHub Actions');
  const g = await W('https://w.test/copilote/previsions', { headers: A }); v((await g.json()).previsions[0].id === 'or|1', 'lecture par l’appli');
  /* un passage complet sur des fiches du dossier */
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-prev-'));
  try {
    const fiche = JSON.parse(JSON.stringify({ version: 1, actif: 'or', nom: 'Or', t: T0, prix: 3544, tPrix: T0, atrJ: 80, h1: [], tendance: { J: { dispo: true, sens: 'baissier', ma200: 4283, ecartAtr: -7, atrPct: 2.4 }, H4: { dispo: true, sens: 'baissier', ma200: 3909, ecartAtr: -8.9, atr: 38 }, H1: { dispo: true } }, biais: 'baissier', regime: { H4: { dispo: true, type: 'tendance', efficacite: 0.4 } }, niveaux: { reperes: { PDH: 3693, PDL: 3571 }, supports: [], resistances: [] }, sessions: [], score: { score100: 18, verdict: 'Vendeur fort', composants: [], manquants: [] }, statsJ: { dispo: true, cas: 100, petit: false, partHaussePct: 40, hausseMaxMedianePct: 1.4, baisseMaxMedianePct: -1.7 }, agenda: [], volume: { J: { disponible: true, liste: [] }, H4: { disponible: true, liste: [] }, H1: { disponible: true, liste: [] } }, evenements: [], grosMouvements: [], manques: [] }));
    fs.writeFileSync(path.join(dossier, 'lecture-or.json'), JSON.stringify(fiche));
    const proH1 = []; for (let t = T0 - 10 * JOUR; t < T0 + 8 * JOUR; t += H) { const d = (t - T0) / JOUR, c = 3544 - 100 * Math.max(0, d); proH1.push([t, c, c + 1, c - 1, c, 10]); } fs.writeFileSync(path.join(dossier, 'pro-or.json'), JSON.stringify({ h1: proH1 }));
    const R1 = await executer({ dossier, url: 'https://w.test', code: env.LECTURE_CODE, maintenant: T0, fetchFn: W, journal: () => {} }); v(R1.statut === 'ok' && R1.ajoutees === 1, 'passage 1 : le scénario est enregistré');
    const R2 = await executer({ dossier, url: 'https://w.test', code: env.LECTURE_CODE, maintenant: T0 + 3 * H, fetchFn: W, journal: () => {} }); v(R2.ajoutees === 0, 'passage 2 (3 h plus tard) : pas de doublon');
    const R3 = await executer({ dossier, url: 'https://w.test', code: env.LECTURE_CODE, maintenant: T0 + 6 * JOUR, fetchFn: W, journal: () => {} }); const lue = await (await W('https://w.test/copilote/previsions', { headers: A })).json();
    v(R3.verifiees >= 3 && lue.previsions.some(p => p.verifs && p.verifs.j1 === 'juste' && p.verifs.j3 === 'juste' && p.statut === 'clos'), 'passage 6 jours plus tard : vérifiée automatiquement à +1, +3 et +5 jours, résultat rendu au Worker');
    const pub = JSON.parse(fs.readFileSync(path.join(dossier, 'previsions.json'), 'utf8')); v(pub.liste.length >= 1 && pub.stats && !/sk-|AIza|@gmail/.test(JSON.stringify(pub)), 'previsions.json publié (lu par l’appli sans Worker), sans donnée personnelle');
    v((await executer({ dossier, url: null, code: null, maintenant: T0 + 7 * JOUR, journal: () => {} })).statut === 'ok', 'sans Worker : le carnet vit dans le fichier publié');
    v(Object.keys(lireFiches(dossier)).join() === 'or' && passage({ liste: [], fiches: { or: fiche }, barres: {}, maintenant: T0 }).ajoutees === 1, 'passage pur');
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
}
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
