/* Tests du briefing du jour et de la revue du dimanche (v6, B6). node trader-pro/tests/briefing-test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { construireBriefing, construireRevue } from '../commun/briefing.js';
import { briefingMatin, revueDimanche } from '../worker/src/rapports.js';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const D = { date: 'lundi 23 novembre', mouvements: [{ actif: 'or', prix: 3524, variationPct: -2.1 }, { actif: 'btc', prix: 59000, variationPct: -3.4 }, { actif: 'eurusd', prix: 1.0976, variationPct: 0.1 }], niveaux: [{ actif: 'or', nom: 'ta ligne', prix: 3500, distancePct: -0.7 }, { actif: 'btc', nom: 'le haut de ta boîte', prix: 61000, distancePct: 3.2 }],
  annonces: [{ heure: '14:30', titre: 'US CPI', impact: 'fort' }], alertes: { actives: 2, recentes: ['Or : cassure MA200 H4 à la baisse'] }, risque: { total: 300, totalPct: 6, jourReste: 40, etatJour: 'proche' }, donnees: { voyant: 'vert', phrase: 'Données à jour.' } };
const b = construireBriefing(D);
v(['mouvements', 'niveaux', 'annonces', 'alertes', 'risque', 'donnees'].every(id => b.sections.some(s => s.id === id)), 'briefing : les 6 blocs demandés (mouvements, niveaux, annonces, alertes et flèches, risque, état des données)');
v(b.mots >= 60 && b.mots <= 190, 'texte parlé d\'environ une minute : ' + b.mots + ' mots (≈ ' + Math.round(b.mots / 2.6) + ' s)'); v(/Bitcoin, moins 3,4 pour cent/.test(b.voix) && /14 heures 30/.test(b.voix) && /aucun ordre/.test(b.voix), 'phrases courtes et parlables (« moins 3,4 pour cent », « 14 heures 30 »)');
v(b.telegram.startsWith('☀️ Briefing du lundi 23 novembre') && /• US CPI|14:30 · US CPI/.test(b.telegram), 'version Telegram en texte');
v(construireBriefing({ ...D, annonces: [] }).sections.find(s => s.id === 'annonces').lignes[0] === 'Aucune annonce importante aujourd’hui.', 'sans annonce : le dit');
v(/limite du jour est atteinte/.test(construireBriefing({ ...D, risque: { ...D.risque, etatJour: 'atteinte' } }).voix), 'limite atteinte : annoncée');
const rv = construireRevue({ trades: [{ pnl: 120, R: 1.2, setup: 'rebond MA200' }, { pnl: -100, R: -1, setup: 'cassure' }, { pnl: 80, R: 0.8, setup: 'rebond MA200' }], limites: { jourDepasse: false, semaineDepassee: false }, fleches: '2 fiables, 1 fragile', joursSansImport: 9 });
v(rv.pnl === 100 && /3 trades : 2 gagnants, résultat \+100 €/.test(rv.lignes[0]) && /Meilleur setup : rebond MA200/.test(rv.lignes[1]) && /respectées/.test(rv.lignes[2]) && /aucun import XTB depuis 9 jours/.test(rv.lignes.join(' ')), 'revue : trades en € et R, setups gagnants / perdants, limites, rappel d\'import après 7 jours');
v(!/aucun import/.test(construireRevue({ trades: [], joursSansImport: 3 }).lignes.join(' ')) && /Aucun trade/.test(construireRevue({ trades: [] }).lignes[0]), 'import récent : pas de rappel ; semaine vide : dit');
/* Worker : un seul envoi par jour, réglable */
const depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:'))); const T = Date.UTC(2026, 10, 23, 6, 45); const envoyes = [];
const sig = { actifs: { or: { derniere: { J: { derniere: { t: 1, c: 3600 } }, H1: { derniere: { t: 2, c: 3524 } } } } } }, cal = { evenements: [{ title: 'US CPI', date: '2026-11-23T14:30:00+01:00', impact: 'High' }, { title: 'Autre', date: '2026-11-24T10:00:00+01:00', impact: 'High' }, { title: 'Bas', date: '2026-11-23T10:00:00+01:00', impact: 'Low' }] }, idx = { fichiers: { a: { t: T - 600e3, ok: true } } };
const fetchSim = async (u, o) => { if (/signaux/.test(u)) return { ok: true, json: async () => sig }; if (/calendrier2/.test(u)) return { ok: true, json: async () => cal }; if (/index\.json/.test(u)) return { ok: true, json: async () => idx }; if (/telegram/.test(u)) { envoyes.push(JSON.parse(o.body).text); return { ok: true }; } throw new Error('?' + u); };
await depot.kvEcrire('dessins:or', [{ id: 'd', type: 'horizontale', p: 3500 }]); const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' };
let r = await briefingMatin(env, depot, T, { fetchFn: fetchSim }); v(r === 'envoyé' && envoyes.length === 1 && /US CPI/.test(envoyes[0]) && !/Autre/.test(envoyes[0]) && /ta ligne/.test(envoyes[0]) && /3.524/.test(envoyes[0]), 'Worker : briefing envoyé (annonce du jour seulement, niveau tracé proche, prix)');
r = await briefingMatin(env, depot, T + 5 * 60e3, { fetchFn: fetchSim }); v(r === 'déjà envoyé' && envoyes.length === 1, 'pas de second briefing le même jour');
await depot.kvEcrire('sync', { cles: { rayle_briefing_reglage_v1: { valeur: { actif: false }, maj: 1, appareil: 'x' } } }); r = await briefingMatin(env, depot, T + 86400e3, { fetchFn: fetchSim }); v(r === 'désactivé' && envoyes.length === 1, 'réglable : désactivé = aucun envoi');
await depot.ecrireLignes('fermees', [{ id: 'a', sens: 'BUY', ticker: 'GOLD', pnl: 50, tOuv: T - 3 * 86400e3, tFerm: T - 2 * 86400e3 }, { id: 'b', sens: 'BUY', ticker: 'GOLD', pnl: -30, tOuv: T - 30 * 86400e3, tFerm: T - 29 * 86400e3 }], 1);
const TD = Date.UTC(2026, 10, 22, 17, 5); r = await revueDimanche(env, depot, TD, { fetchFn: fetchSim }); v(r === 'envoyé' && /1 trade : 1 gagnant/.test(envoyes.at(-1)), 'Worker : revue du dimanche (seulement les trades de la semaine)'); r = await revueDimanche(env, depot, TD + 5 * 60e3, { fetchFn: fetchSim }); v(r === 'déjà envoyée', 'une seule revue par dimanche');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `briefing-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
