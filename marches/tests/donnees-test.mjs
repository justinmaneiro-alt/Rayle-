// Tests de la couche de données RAYLE MARCHÉS : node marches/tests/donnees-test.mjs
// Connecteurs rejoués sur des réponses RÉELLES enregistrées (fixtures), faux serveurs en panne, normalisation, source + horodatage partout, API, copilote, corrélations.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { creerHub } from '../donnees/hub.js';
import { mesure, mesureTexte, indisponible, presentable, provenance, FREQUENCES } from '../donnees/normaliser.js';
import { lireCsv, lireFred, lireBce, lireIcs, lireFomc, lireBceCalendrier, lireRss, lireInsee, periodeVersMs } from '../donnees/analyseurs.js';
import { lireCommande, suggestions, calendrier14, filtrerActus, correlations, pearson } from '../donnees/panneaux.js';
import { gererMarches, construirePanneau } from '../donnees/api.js';
import { repondre } from '../donnees/copilote.js';
import { SOURCES, ABANDONNEES } from '../donnees/registre.js';
import { LOTS } from '../donnees/connecteurs.js';

let ok = 0, ko = 0;
const t = async (nom, f) => { try { await f(); ok++; } catch (e) { ko++; console.log('ÉCHEC : ' + nom + '\n   ' + String(e && e.message || e).split('\n').slice(0, 4).join('\n   ')); } };

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/reponses.json', import.meta.url), 'utf8'));
const T0 = Date.parse(fx.enregistreLe);
const cle = u => String(u).replace(/start_timestamp=\d+&end_timestamp=\d+/, 'DVOL').replace(/cosd=\d{4}-\d{2}-\d{2}/, 'cosd=X').replace(/\/v1\/\d{4}-\d{2}-\d{2}\.\./, '/v1/DEBUT..').replace(/&timespan=\w+/, '');
const index = new Map(Object.entries(fx.reponses).map(([u, r]) => [cle(u), r]));
const fauxReseau = (surcharge = {}) => async (url) => {
  const k = cle(url); for (const [motif, rep] of Object.entries(surcharge)) if (url.includes(motif)) { if (rep === 'reseau') throw new TypeError('fetch failed'); if (typeof rep === 'function') return rep(url); return new Response(rep.corps, { status: rep.status }); }
  const r = index.get(k); if (!r) return new Response('absent des fixtures : ' + url, { status: 404 });
  return new Response(r.corps, { status: r.status });
};
const hubFx = (surcharge, extra = {}) => creerHub({ fetch: fauxReseau(surcharge), maintenant: () => T0, env: {}, attente: async () => {}, ...extra });

/* ─── 1. normalisation ─── */
await t('mesure : champs communs et fraîcheur', () => {
  const m = mesure({ id: 'x', libelle: 'X', valeur: 2.5, unite: '%', source: 'S', sourceId: 's', horodatage: T0 - 3600e3, frequence: 'quotidien' }, T0);
  for (const k of ['valeur', 'unite', 'source', 'horodatage', 'fraicheur', 'retardSecondes', 'retardTexte', 'etat']) assert.ok(k in m, k); assert.equal(m.etat, 'ok'); assert.equal(m.fraicheur, 'quotidien'); assert.equal(m.retardTexte, '60 min');
  assert.equal(mesure({ id: 'x', libelle: 'X', valeur: 1, source: 'S', sourceId: 's', horodatage: T0 - 20 * 864e5, frequence: 'quotidien' }, T0).etat, 'perime');
  assert.equal(mesure({ id: 'x', libelle: 'X', valeur: 1, source: 'S', sourceId: 's', horodatage: T0 - 60e3, frequence: 'temps_reel' }, T0).fraicheur, 'temps réel');
});
await t('jamais un zéro de remplacement : valeur absente, NaN, horodatage absent = indisponible', () => {
  for (const v of [null, undefined, NaN, 'abc', Infinity]) { const m = mesure({ id: 'x', libelle: 'X', valeur: v, source: 'S', sourceId: 's', horodatage: T0 }, T0); assert.equal(m.etat, 'indisponible'); assert.equal(m.valeur, null); }
  assert.equal(mesure({ id: 'x', libelle: 'X', valeur: 0, source: 'S', sourceId: 's', horodatage: null }, T0).etat, 'indisponible');
  assert.equal(mesure({ id: 'x', libelle: 'X', valeur: 0, source: 'S', sourceId: 's', horodatage: T0 }, T0).valeur, 0, 'un vrai zéro reste un zéro');
  const i = indisponible('a', 'A', 'S', 's', 'panne', T0); assert.ok(presentable(i)); assert.equal(i.valeur, null);
});
await t('presentable : refuse source ou horodatage manquants', () => {
  assert.equal(presentable({ id: 'a', source: 'S', sourceId: 's', valeur: 1, horodatage: null, fraicheur: 'x', etat: 'ok' }), false);
  assert.equal(presentable({ id: 'a', source: '', sourceId: 's', valeur: 1, horodatage: new Date().toISOString(), fraicheur: 'x', etat: 'ok' }), false);
  assert.ok(presentable(mesure({ id: 'a', libelle: 'A', valeur: 1, source: 'S', sourceId: 's', horodatage: T0 }, T0)));
});
await t('provenance : source, date, retard ; périmé le dit', () => {
  const m = mesure({ id: 'a', libelle: 'A', valeur: 1, source: 'FRED', sourceId: 'fred', horodatage: Date.parse('2026-11-12T00:00:00Z'), delaiPublication: 'avec 1 jour de retard' }, Date.parse('2026-11-13T12:00:00Z'));
  const p = provenance(m); assert.match(p, /Source : FRED/); assert.match(p, /12\/11\/2026/); assert.match(p, /1 jour de retard/);
  assert.match(provenance(indisponible('a', 'A', 'FRED', 'fred', 'HTTP 500', T0)), /indisponible/);
});
await t('mesureTexte exige aussi source et horodatage', () => { assert.equal(mesureTexte({ id: 'a', libelle: 'A', texte: 'x', source: 'S', sourceId: 's', horodatage: null }, T0).etat, 'indisponible'); });

/* ─── 2. analyseurs ─── */
await t('lireCsv : guillemets et virgules internes', () => assert.deepEqual(lireCsv('a,b\n"x,y",2\n'), [['a', 'b'], ['x,y', '2']]));
await t('lireFred : cases vides et points écartés', () => { const r = lireFred('observation_date,A\n2026-01-01,1.5\n2026-01-02,\n2026-01-03,.\n2026-01-04,2'); assert.equal(r.A.length, 2); assert.throws(() => lireFred('<html>')); });
await t('lireBce / périodes', () => { assert.equal(periodeVersMs('2026-Q2'), Date.UTC(2026, 3, 1)); assert.equal(lireBce('TIME_PERIOD,OBS_VALUE\n2026-01-02,1.1\n2026-01-03,x').length, 1); });
await t('lireInsee', () => assert.deepEqual(lireInsee('<Obs TIME_PERIOD="2026-01" OBS_VALUE="100.5"/><Obs TIME_PERIOD="2026-02" OBS_VALUE="101"/>').map(p => p[1]), [100.5, 101]));
await t('lireIcs : fuseau d\'été et d\'hiver américains', () => {
  const e = lireIcs('BEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20260715T083000\nSUMMARY:CPI\nCATEGORIES:IMPORTANT, BLS\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20261211T083000\nSUMMARY:Emploi\\, mensuel\nEND:VEVENT');
  assert.equal(new Date(e[0].debutMs).toISOString(), '2026-07-15T12:30:00.000Z'); assert.equal(new Date(e[1].debutMs).toISOString(), '2026-12-11T13:30:00.000Z'); assert.equal(e[0].importance, 'importante'); assert.equal(e[1].titre, 'Emploi, mensuel');
});
await t('lireFomc / lireBceCalendrier / lireRss : sur des pages vraies enregistrées', () => {
  const f = lireFomc(fx.reponses['https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'].corps); assert.ok(f.length >= 6 && f.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.fin)));
  const b = lireBceCalendrier(fx.reponses['https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'].corps); assert.ok(b.some(x => /monetary policy meeting/i.test(x.titre)));
  const r = lireRss(fx.reponses['https://www.bls.gov/feed/bls_latest.rss'].corps); assert.ok(r.length && r[0].titre && r[0].publieMs);
  assert.throws(() => lireFomc('<html></html>')); assert.throws(() => lireRss('pas du xml'));
  assert.ok(lireRss('<rss><item><title>T</title><link><![CDATA[https://x.y/a]]></link><pubDate>Fri, 13 Nov 2026 10:00:00 GMT</pubDate><description>' + 'a'.repeat(900) + '</description></item></rss>')[0].resume.length <= 220, 'résumé court');
});

/* ─── 3. chaque connecteur contre une réponse réelle enregistrée ─── */
const lotsAttendus = { fred: 14, 'kraken-spot': 2, 'kraken-jours': 2, 'kraken-futures': 2, 'binance-spot': 2, 'binance-derives': 3, deribit: 3, altme: 1, mempool: 2, defillama: 2, bce: 2, frankfurter: 1, eurostat: 2, insee: 1, cftc: 10, cboe: 1 };
const hub = hubFx();
const toutes = [];
for (const [id, n] of Object.entries(lotsAttendus)) await t('connecteur ' + id + ' : ' + n + ' mesures réelles, source et horodatage', async () => {
  const r = await hub.lot(id, { force: true }); assert.ok(!r.erreur, r.erreur); assert.equal(r.mesures.length, n, r.mesures.map(m => m.id).join()); assert.deepEqual(r.partiel, [], 'partiel : ' + r.partiel.join(' | '));
  for (const m of r.mesures) { assert.ok(presentable(m), 'non présentable : ' + m.id); assert.ok(m.source && m.horodatage && m.fraicheur, m.id); assert.ok(typeof m.valeur === 'number' && isFinite(m.valeur), m.id); toutes.push(m); }
});
for (const id of ['edgar', 'calendrier', 'rss-officiels', 'rss-medias']) await t('connecteur ' + id + ' : éléments avec source et date', async () => {
  const r = await hub.lot(id, { force: true }); assert.ok(!r.erreur, r.erreur); assert.ok(r.items.length > 0);
  for (const i of r.items) { assert.ok(i.source && i.titre, JSON.stringify(i).slice(0, 80)); assert.ok(isFinite(i.publieMs || i.dateMs), 'date : ' + i.titre); if (i.type === 'actu') assert.ok(i.lien && (i.resume || '').length <= 220); }
});
await t('valeurs réalistes (pas de zéro caché, bornes)', () => {
  const m = Object.fromEntries(toutes.map(x => [x.id, x]));
  assert.ok(m['btc.kraken'].valeur > 1000); assert.ok(m['or.paxg'].valeur > 500); assert.ok(m['taux.ust10'].valeur > 0 && m['taux.ust10'].valeur < 20); assert.ok(m['marche.vix'].valeur > 5 && m['marche.vix'].valeur < 100);
  assert.ok(m['chf.frankfurter'].valeur > 0.3 && m['chf.frankfurter'].valeur < 2); assert.ok(m['crypto.fng'].valeur >= 0 && m['crypto.fng'].valeur <= 100); assert.ok(m['btc.putcall'].valeur > 0);
  assert.ok(m['cot.or.spec'].serie.length > 20, 'historique COT'); assert.match(m['cot.or.spec'].note, /positions du mardi/);
  assert.ok(Math.abs(m['macro.cpi'].valeur) < 30, 'glissement annuel plausible');
});
await t('le proxy PAXG n\'est jamais présenté comme le XAU/USD', async () => { const r = await hub.lot('kraken-spot'); const o = r.mesures.find(x => x.id === 'or.paxg'); assert.match(o.libelle + o.note, /proxy/i); assert.match(o.note, /PAS le XAU/); });
await t('chaque mesure de tous les lots porte source + horodatage + fraîcheur (bilan)', () => { assert.ok(toutes.length >= 40, 'mesures : ' + toutes.length); assert.ok(toutes.every(presentable)); });

/* ─── 4. faux serveurs en panne : le terminal ne plante jamais ─── */
for (const [nom, rep] of [['réseau coupé', 'reseau'], ['HTTP 500', { status: 500, corps: 'erreur' }], ['HTTP 429', { status: 429, corps: 'trop' }], ['HTTP 451', { status: 451, corps: 'interdit' }], ['réponse HTML au lieu de JSON', { status: 200, corps: '<html>maintenance</html>' }], ['JSON vide', { status: 200, corps: '{}' }], ['délai dépassé', () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }]]) {
  await t('panne « ' + nom + ' » : aucune exception, erreur nommée, aucune valeur inventée', async () => {
    const h = hubFx({ 'kraken.com': rep, 'fred.stlouisfed.org': rep, 'deribit.com': rep, 'publicreporting.cftc.gov': rep, 'binance': rep }); let appels = 0; const f0 = h.get;
    for (const id of ['kraken-spot', 'fred', 'deribit', 'cftc', 'binance-derives']) { const r = await h.lot(id, { force: true }); assert.ok(r.erreur, id + ' devrait signaler une erreur'); assert.equal(r.mesures.length, 0, id + ' ne doit rien inventer'); assert.ok(String(r.erreur).length > 3); }
    const p = await construirePanneau(h, 'or', {}, T0); assert.ok(p.sections.length >= 1); for (const s of p.sections) for (const m of s.mesures) { assert.equal(m.etat, 'indisponible', m.id); assert.equal(m.valeur, null, m.id); assert.ok(m.source && m.note); }
  });
}
await t('panne partielle : une série FRED manquante ne tue pas les autres', async () => {
  const h = hubFx({ 'id=DFII10': { status: 500, corps: 'x' } }); const r = await h.lot('fred', { force: true }); assert.equal(r.mesures.length, 13); assert.ok(r.partiel.some(x => /DFII10/.test(x)), r.partiel.join());
});
await t('source coupée après un succès : dernière valeur CONNUE, datée, marquée périmée', async () => {
  let coupe = false; const h = creerHub({ fetch: async (u, o) => coupe ? new Response('x', { status: 503 }) : fauxReseau()(u, o), maintenant: () => T0, attente: async () => {} });
  const a = await h.lot('kraken-spot', { force: true }); assert.ok(!a.erreur); coupe = true; const b = await h.lot('kraken-spot', { force: true });
  assert.ok(b.copie && b.erreur, 'copie signalée'); assert.equal(b.mesures.length, 2); for (const m of b.mesures) { assert.equal(m.etat, 'perime'); assert.ok(m.valeur > 0 && m.horodatage); assert.match(m.note, /dernière valeur connue/); }
  assert.equal(h.etatSources().find(s => s.id === 'kraken').statut, 'en_panne');
});
await t('échec mémorisé : une source en panne n\'est pas martelée', async () => {
  let n = 0; const h = creerHub({ fetch: async () => { n++; return new Response('x', { status: 500 }); }, maintenant: () => T0, attente: async () => {} });
  await h.lot('altme', { force: true }); const apres = n; await h.lot('altme'); await h.lot('altme'); assert.equal(n, apres, 'pas de nouvel appel pendant 60 s');
});
await t('nouvelles tentatives : 500 puis succès', async () => {
  let n = 0; const base = fauxReseau(); const h = creerHub({ fetch: async (u, o) => (++n === 1 ? new Response('x', { status: 500 }) : base(u, o)), maintenant: () => T0, attente: async () => {} });
  const r = await h.lot('altme', { force: true }); assert.ok(!r.erreur); assert.equal(r.mesures.length, 1); assert.ok(n >= 2);
});
await t('liste blanche : domaine non autorisé refusé', async () => { const h = hubFx(); await assert.rejects(h.get('fred', 'https://exemple.invalid/x'), /non autorisé/); await assert.rejects(h.get('fred', 'http://fred.stlouisfed.org/x'), /non autorisé/); });
await t('limitation d\'appels : écart minimal respecté par source', async () => {
  const pauses = []; const h = creerHub({ fetch: fauxReseau(), maintenant: () => T0, attente: async ms => { pauses.push(ms); } }); await h.lot('cftc', { force: true }); assert.ok(pauses.length >= 4 && pauses.every(p => p > 0), 'pauses : ' + pauses.length);
});
await t('sources facultatives désactivées par défaut, sans clé', async () => {
  const h = hubFx(); for (const id of ['yahoo', 'finnhub', 'twelvedata']) { const r = await h.lot(id); assert.ok(r.desactive); assert.equal(r.mesures.length, 0); }
  const e = h.etatSources().filter(s => ['yahoo', 'finnhub', 'twelvedata'].includes(s.id)); assert.ok(e.every(s => s.statut === 'desactivee' && !s.defaut));
  const h2 = creerHub({ fetch: async () => new Response(JSON.stringify({ c: 400, pc: 399, t: Math.floor(T0 / 1000) }), { status: 200 }), maintenant: () => T0, env: { FINNHUB_KEY: 'k' }, attente: async () => {} }); const r = await h2.lot('finnhub'); assert.equal(r.mesures[0].valeur, 400); assert.match(r.mesures[0].note, /ETF/);
});
await t('registre : chaque source a nom, fréquence, clé, limites, conditions ; abandonnées documentées', () => {
  assert.ok(SOURCES.length >= 20); for (const s of SOURCES) { assert.ok(s.id && s.nom && s.frequence && s.limite && s.conditions && 'cle' in s, s.id); assert.ok(FREQUENCES[s.frequence], s.id); }
  assert.ok(ABANDONNEES.length >= 5 && ABANDONNEES.every(a => a.raison.length > 10)); for (const l of LOTS) assert.ok(SOURCES.some(s => s.id === l.source), l.id);
});

/* ─── 5. panneaux, calendrier, corrélations ─── */
await t('commandes : OR, US100, COT OR, FRED <série>, CAL…', () => {
  assert.deepEqual(lireCommande('OR'), { panneau: 'or', actif: null }); assert.deepEqual(lireCommande('/cot or'), { panneau: 'cot', actif: 'or' }); assert.deepEqual(lireCommande('FRED dfii10'), { panneau: 'fred', serie: 'DFII10' });
  for (const [c, p] of [['US100', 'us100'], ['BTC', 'btc'], ['USD', 'usd'], ['CHF', 'chf'], ['MACRO', 'macro'], ['CAL', 'calendrier'], ['NEWS', 'actualites'], ['SOURCES', 'sources'], ['CORR', 'correlations']]) assert.equal(lireCommande(c).panneau, p, c);
  assert.equal(lireCommande('zzz'), null); assert.ok(suggestions('co').some(s => s.commande === 'COT OR' || s.commande === 'COT'));
});
await t('calendrier : 14 jours, heure de Paris, tri', async () => {
  const r = await hub.lot('calendrier', { force: true }), c = calendrier14(r.items, T0, 14); assert.ok(c.length > 0); for (let i = 1; i < c.length; i++) assert.ok(c[i].dateMs >= c[i - 1].dateMs); assert.ok(c.every(x => x.dateMs <= T0 + 14 * 864e5 && x.quand && x.source));
  const bls = c.find(x => x.sourceId === 'bls-cal' && x.heureConnue); if (bls) assert.match(bls.quand, /\d{2}:\d{2}/);
});
await t('pearson et corrélations : valeurs connues, jamais d\'interpolation', () => {
  assert.equal(Math.round(pearson([1, 2, 3, 4, 5, 6, 7, 8, 9], [2, 4, 6, 8, 10, 12, 14, 16, 18]) * 100), 100); assert.equal(Math.round(pearson([1, 2, 3, 4, 5, 6, 7, 8, 9], [9, 8, 7, 6, 5, 4, 3, 2, 1]) * 100), -100); assert.equal(pearson([1, 2], [1, 2]), null);
  const J = 864e5, d0 = Date.UTC(2026, 0, 5), mk = f => { const o = []; let v = 100; for (let i = 0; i < 80; i++) { const t = d0 + i * J; if ([0, 6].includes(new Date(t).getUTCDay())) continue; v *= 1 + f(i); o.push([t, v]); } return o; };
  const a = mk(i => 0.01 * Math.sin(i * 1.3)), c = correlations({ 'or.paxg.jour': a, 'us100.fred': a.map(([t, v]) => [t, v * 2]), 'btc.kraken.jour': mk(i => -0.01 * Math.sin(i * 1.3)) }, 90, T0);
  const ia = c.actifs.findIndex(x => x.id === 'or'), ib = c.actifs.findIndex(x => x.id === 'us100'), ic = c.actifs.findIndex(x => x.id === 'btc'); assert.equal(c.matrice[ia][ib].r, 1); assert.ok(c.matrice[ia][ic].r < -0.95); assert.ok(c.matrice[ia][ib].n > 20); assert.ok(c.calculeLe && c.dernierJour);
  assert.equal(correlations({}, 30, T0).actifs.length, 0);
});
await t('panneau corrélations sur les vraies séries enregistrées', async () => {
  const h = hubFx(); const p = await construirePanneau(h, 'correlations', {}, T0); assert.ok(p.correlations[30].actifs.length >= 4, 'actifs : ' + p.correlations[30].actifs.length); const m = p.correlations[90].matrice; for (const l of m) for (const x of l) if (x.r != null) assert.ok(x.r >= -1 && x.r <= 1);
});
await t('actualités : filtre par actif, dédoublonnage', async () => {
  const items = [{ type: 'actu', titre: 'Gold hits record', publieMs: 2, actifs: ['or'] }, { type: 'actu', titre: 'Gold hits record', publieMs: 1, actifs: ['or'] }, { type: 'actu', titre: 'Bitcoin falls', publieMs: 3, actifs: ['btc'] }];
  assert.equal(filtrerActus(items, 'or').length, 1); assert.equal(filtrerActus(items, null).length, 2);
});

/* ─── 6. API et état des sources ─── */
const appel = async (h, chemin) => { const r = await gererMarches(new Request('http://x' + chemin), { hub: h, maintenant: () => T0 }); return { status: r.status, j: await r.json() }; };
await t('API : panneaux de toute la liste, 200, valeurs avec source', async () => {
  const h = hubFx(); for (const id of ['ensemble', 'or', 'us100', 'btc', 'usd', 'chf', 'macro', 'cot', 'calendrier', 'actualites', 'correlations', 'sources']) { const { status, j } = await appel(h, '/marches/panneau?id=' + id); assert.equal(status, 200, id); assert.ok(j.titre, id); for (const s of j.sections || []) for (const m of s.mesures) assert.ok(m.source && (m.etat === 'indisponible' || m.horodatage), id + ' ' + m.id); }
  const { j } = await appel(h, '/marches/panneau?id=or'); assert.ok(j.absent.length >= 1, 'les données manquantes sont déclarées'); assert.ok(j.evenements && j.actualites);
});
await t('API : « État des sources » reflète une panne simulée', async () => {
  const h = hubFx({ 'api.alternative.me': { status: 500, corps: 'x' } }); await appel(h, '/marches/panneau?id=btc'); const { j } = await appel(h, '/marches/sources'); const a = j.sources.find(s => s.id === 'altme'), k = j.sources.find(s => s.id === 'kraken');
  assert.equal(a.statut, 'en_panne'); assert.ok(a.derniereErreur); assert.equal(k.statut, 'ok'); assert.ok(k.dernierSucces); assert.ok(j.sources.length >= 20);
  const y = j.sources.find(s => s.id === 'yahoo'); assert.equal(y.statut, 'desactivee');
});
await t('API : route inconnue 404, méthode POST refusée, FRED libre validée', async () => {
  const h = hubFx(); assert.equal((await appel(h, '/marches/zzz')).status, 404); const r = await gererMarches(new Request('http://x/marches/panneau', { method: 'POST' }), { hub: h }); assert.equal(r.status, 405);
  const f = await appel(h, '/marches/panneau?id=fred&serie=../etc'); assert.ok(f.j.erreurs.length); const g = await appel(h, '/marches/panneau?id=fred&serie=DFII10'); assert.equal(g.j.sections[0].mesures[0].etat === 'indisponible' || g.j.sections[0].mesures[0].valeur > 0, true);
});
await t('API : calendrier non vérifié quand toutes les sources officielles sont en panne', async () => {
  const h = hubFx({ 'federalreserve.gov': { status: 500, corps: 'x' }, 'ecb.europa.eu': { status: 500, corps: 'x' }, 'bls.gov': { status: 500, corps: 'x' } }); const { j } = await appel(h, '/marches/panneau?id=calendrier'); assert.equal(j.nonVerifie, true); assert.match(j.mentions, /calendrier non vérifié/); assert.deepEqual(j.evenements, []);
});

/* ─── 7. copilote ─── */
await t('copilote : cite source et date de chaque chiffre', async () => {
  const r = await repondre('que font les taux réels ?', hubFx()); assert.ok(r.trouve); assert.match(r.texte, /FRED · DFII10/); assert.match(r.texte, /donnée du \d{2}\/\d{2}\/\d{4}/); assert.match(r.texte, /2,86|\d,\d+ %/); assert.ok(r.mesures.includes('taux.reel10'));
  const b = await repondre('où en est le bitcoin ?', hubFx()); assert.match(b.texte, /Kraken|Binance|Deribit/); assert.match(b.texte, /source :/);
});
await t('copilote : « je n\'ai pas cette donnée » quand elle manque', async () => {
  assert.match((await repondre('quelle est la météo à Lyon ?', hubFx())).texte, /Je n'ai pas cette donnée/);
  const p = await repondre('quels sont les taux réels ?', hubFx({ 'fred.stlouisfed.org': { status: 500, corps: 'x' } })); assert.equal(p.trouve, false); assert.match(p.texte, /Je n'ai pas cette donnée/); assert.doesNotMatch(p.texte, /\d,\d\d %/);
});
await t('copilote : une donnée périmée est dite périmée', async () => {
  let coupe = false; const h = creerHub({ fetch: async (u, o) => coupe ? new Response('x', { status: 500 }) : fauxReseau()(u, o), maintenant: () => T0, attente: async () => {} }); await h.lot('fred', { force: true }); coupe = true; await h.lot('fred', { force: true });
  const r = await repondre('taux réels', h); assert.match(r.texte, /périmée/i);
});

console.log((ko ? '✗ ' : '✓ ') + ok + ' réussis, ' + ko + ' échec(s)'); process.exit(ko ? 1 : 0);
