// Test du SERVICE PC avec les positions branchées (V7) : le cycle calcule les positions, la commande « niveau de preuve » s'applique, le rapport du matin part, les routes lisent le fichier.
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/positions-service-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerService } from '../../agent-pc/service.mjs';
import { creerRoutesAgent } from '../../app-pc/agent-routes.mjs';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import * as E from '../../strategies/agent-etat.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-service-')); process.env.RAYLE_VEILLEUR_DOSSIER = path.join(dossier, 'veilleur'); process.env.RAYLE_AGENT_DOSSIER = dossier;
const FIN = Math.floor(Date.UTC(2026, 9, 27, 8, 0) / 900e3) * 900e3 + 5 * 60e3;       // mardi 27 octobre 2026, 08:05 UTC (après l'heure du rapport du matin)
let horloge = FIN; const maintenant = () => horloge;
const TOTAL = 90000, m15 = marcheMixte(TOTAL, 9), decal = (FIN - (TOTAL + 1) * 900e3) - m15.t[0]; for (let i = 0; i < m15.n; i++) m15.t[i] += decal;
const series = { BTC: m15, SOL: m15, DOGE: m15 };
const donnees = { async charger() { return []; }, async maintenirChaqueJour() { return ['BTC', 'SOL', 'DOGE'].map(p => ({ paire: p, n: m15.n, jourFin: '2026-10-27', trous: 0, integrite: { ok: true } })); }, async actualiser() { return {}; }, serie: p => series[p] };
const telegram = []; const W = { configure: true, battement: async () => ({ commandes: [] }), synchroniser: async (etat) => ({ ok: true, regles: E.exporterRegles(etat).length, suiviWorker: {} }), etat: async () => null, commandesTraitees: async () => ({}), telegram: async (texte, type) => { telegram.push({ texte, type }); } };
const jeuLibre = { async evaluer() { return { jeu: false, raison: null }; } };
const svc = creerService({ dossier, maintenant, donnees, sync: W, ecrire: async () => ({ lignes: ['x'], source: 'modèle' }), executer: async () => ({ resumes: [] }), detecteur: jeuLibre, sansPriorite: true, tranchesMs: 1000, avecPositions: true });
await svc.demarrer();
const cr = await svc.cycle();
v('le cycle calcule les positions des trois actifs', cr.positions && cr.positions.calculs === 3, JSON.stringify(cr.positions));
v('positions.json est écrit à côté de agent.json, avec la vue publiée', fs.existsSync(path.join(dossier, 'positions.json')) && JSON.parse(fs.readFileSync(path.join(dossier, 'positions.json'), 'utf8')).vuePubliee.ok === true);
const vue = svc.positions().vue();
v('la vue dit le niveau de preuve utilisé : équilibré (v4) par défaut', /équilibré/.test(vue.versionCriteres) && vue.reglages.versionCriteres === 'equilibre');
fs.writeFileSync(path.join(dossier, 'commandes.json'), JSON.stringify([{ type: 'niveau_preuve', valeur: 'strict' }]));
await svc.cycle();
v('la commande « niveau de preuve : strict » s’applique (v3, jamais modifiée)', svc.etat().parametresRisque.niveauPreuve === 'strict' && /strict/.test(svc.positions().vue().versionCriteres));
fs.writeFileSync(path.join(dossier, 'commandes.json'), JSON.stringify([{ type: 'niveau_preuve', valeur: 'equilibre' }]));
await svc.cycle();
v('…et on revient à équilibré', svc.etat().parametresRisque.niveauPreuve === 'equilibre');
for (let i = 0; i < 400 && svc.positions().enCours().mesure; i++) await new Promise(r => setTimeout(r, 25));
const attendu = telegram.filter(t => /Kepler — positions du/.test(t.texte));
v('le rapport du matin des positions part une fois, sans ordre', attendu.length === 1 && /aucun ordre/i.test(attendu[0].texte), String(attendu.length));
await svc.cycle();
v('…et pas une seconde fois le même jour', telegram.filter(t => /Kepler — positions du/.test(t.texte)).length === 1);
// routes
const routes = creerRoutesAgent(process.env);
const appeler = (methode, chemin, corps = null) => new Promise(resolve => {
  const req = { method: methode, url: chemin, headers: { host: '127.0.0.1:8000', 'x-rayle-multi': '1', 'content-type': 'application/json', origin: 'http://127.0.0.1:8000' }, socket: { remoteAddress: '127.0.0.1' }, on(ev, f) { if (ev === 'data' && corps) setTimeout(() => f(Buffer.from(JSON.stringify(corps))), 0); if (ev === 'end') setTimeout(f, 1); return this; }, destroy() {} };
  const res = { code: 0, writeHead(c) { this.code = c; }, end(t) { resolve({ code: this.code, json: JSON.parse(t) }); } };
  routes.gerer(req, res, chemin);
});
const g = await appeler('GET', '/__agent/positions');
v('GET /__agent/positions lit positions.json', g.code === 200 && g.json.existe === true && g.json.vue && g.json.vue.ok, JSON.stringify(g).slice(0, 200));
const pc = await appeler('POST', '/__agent/positions/commande', { type: 'reglages', valeur: { risquePct: 0.25 } });
v('POST /__agent/positions/commande écrit la commande (réglages) pour le service', pc.code === 200 && JSON.parse(fs.readFileSync(path.join(dossier, 'positions-commandes.json'), 'utf8'))[0].type === 'reglages');
const pm = await appeler('POST', '/__agent/positions/commande', { type: 'ordre_reel' });
v('une commande inconnue est refusée', pm.code === 400);
const np = await appeler('POST', '/__agent/commande', { type: 'niveau_preuve', valeur: 'strict' });
v('POST /__agent/commande accepte « niveau_preuve »', np.code === 200);
await svc.cycle();
v('le service applique les réglages reçus de l’écran', svc.positions().reglages().risquePct === 0.25);
fs.rmSync(dossier, { recursive: true, force: true });
console.log('Service avec positions : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
