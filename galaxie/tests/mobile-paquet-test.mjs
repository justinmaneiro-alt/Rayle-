// V8 : paquet mobile publié par le service Kepler (agent-pc/bundle-mobile.mjs). Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/mobile-paquet-test.mjs
import fs from 'node:fs';
import { dossierAgent } from '../../agent-pc/etat-agent.mjs';
import { performanceMobile, construirePaquet, plafonner, empreintePaquet, creerPousseur, MAX_OCTETS, INTERVALLE_MS } from '../../agent-pc/bundle-mobile.mjs';
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const dossier = dossierAgent();
if (!fs.existsSync(dossier)) { console.log('dossier de l\u2019agent absent : test ignoré'); process.exit(0); }
const p = plafonner(construirePaquet(dossier, 1000)), taille = Buffer.byteLength(JSON.stringify(p));
v('le paquet réel tient dans le plafond (' + Math.round(taille / 1024) + ' Ko)', taille <= MAX_OCTETS);
v('version 1 et heure posées', p.v === 1 && p.t === 1000);
v('les positions du jour sont présentes quand le service en a publié', !fs.existsSync(dossier + '/positions.json') || (p.positions && Array.isArray(p.positions.types)));
v('aucun secret ne traverse (jeton, clé)', !/jeton|X-Rayle-Token|api[_-]?key|secret/i.test(JSON.stringify(p)));
v('empreinte stable et indépendante de l\u2019heure', empreintePaquet(p) === empreintePaquet({ ...p, t: 99999, serviceLe: 5, donnees: null }));
v('empreinte sensible au contenu', empreintePaquet(p) !== empreintePaquet({ ...p, phase: 'autre' }));
const gros = { v: 1, t: 1, positions: { types: Array.from({ length: 60 }, (_, i) => ({ i, texte: 'x'.repeat(8000) })), exploration: [1] }, pistes: { toutes: Array.from({ length: 40 }, () => ({ texte: 'y'.repeat(4000) })) }, donnees: { flux: 'z'.repeat(20000) } };
const r = plafonner(gros); v('un paquet trop gros est réduit sous le plafond', Buffer.byteLength(JSON.stringify(r)) <= MAX_OCTETS);
// pousseur : jamais trop souvent, jamais si inchangé
const envois = []; let t = Date.now();
const S = { configure: true, publierMobile: async x => { envois.push(x); } };
let contenu = { v: 1, t: 0, phase: 'attente', positions: { propositions: [] } };
const construire = (d, now) => ({ ...contenu, t: now });   // contenu fixe : le service réel écrit en continu, le test doit rester déterministe
const pousser = creerPousseur({ dossier, S, maintenant: () => t, construire });
let a = await pousser(); v('premier envoi', a.envoye === true && envois.length === 1);
t += 60e3; a = await pousser(); v('trop tôt (moins de 5 min) : rien', a.envoye === false && a.raison === 'trop tôt' && envois.length === 1);
t += INTERVALLE_MS; a = await pousser(); v('inchangé : rien', a.envoye === false && a.raison === 'inchangé' && envois.length === 1);
t += 31 * 60e3; a = await pousser(); v('rafraîchi après 30 minutes même inchangé', a.envoye === true && envois.length === 2);
a = await creerPousseur({ dossier, S: { configure: false }, maintenant: () => t })(); v('Worker non configuré : rien, sans erreur', a.envoye === false);
const panne = creerPousseur({ dossier, S: { configure: true, publierMobile: async () => { throw new Error('HTTP 503'); } }, maintenant: () => t, journal: () => {} });
a = await panne(true); v('Worker en panne : message, pas d\u2019exception', a.envoye === false && /503/.test(a.raison));
// performance simulée : jamais d'invention, seulement les propositions clôturées
const J = 86400e3, T0 = Date.UTC(2026, 9, 1);
const props = [{ statut: 'cloturee', agent: 'rebond', actif: 'BTC', resultat: { R: 2, tSortie: T0 } }, { statut: 'cloturee', agent: 'rebond', actif: 'SOL', resultat: { R: -1, tSortie: T0 + J } }, { statut: 'cloturee', agent: 'continuation', actif: 'BTC', resultat: { R: -1, tSortie: T0 + 2 * J } },
  { statut: 'cloturee', agent: 'rebond', actif: 'BTC', resultat: { R: 1.5, tSortie: T0 + 3 * J } }, { statut: 'en_attente', agent: 'rebond', actif: 'BTC' }, { statut: 'ouverte', agent: 'extremes', actif: 'DOGE' }];
const perf = performanceMobile(props, { risquePct: 0.5 });
v('performance : 4 trades clôturés comptés, les autres ignorés', perf.tous.n === 4 && perf.parAgent.extremes === undefined);
v('performance : courbe cumulée juste (2, 1, 0, 1,5)', JSON.stringify(perf.tous.courbe.map(x => x[1])) === '[2,1,0,1.5]');
v('performance : résultat en % au risque choisi', Math.abs(perf.tous.pct - 0.5 * 1.5) < 1e-9);
v('performance : par agent et par actif', perf.parAgent.rebond.n === 3 && perf.parActif.BTC.n === 3 && perf.parActif.SOL.Rtotal === -1);
v('performance : drawdown et séries', perf.tous.drawdownR === 2 && perf.tous.pireSerie === 2 && perf.tous.meilleureSerie === 1);
v('performance : résultat par jour', perf.tous.jours['2026-10-01'] === 2 && perf.tous.jours['2026-10-02'] === -1);
const vide = performanceMobile([], {}); v('performance : sans trade, rien d’inventé', vide.tous.n === 0 && vide.tous.reussite === null && vide.tous.courbe.length === 0);
v('performance : la mention « pas une promesse » accompagne les chiffres', /pas une promesse/.test(vide.pasUnePromesse));
console.log(`\nPaquet mobile : ${ok} vérifications réussies, ${ko} échec(s).`); process.exit(ko ? 1 : 0);
