/* Flèches simples v6 : exception « 2ᵉ touche », raison des points gris, non-repaint, garde-fous conservés, entrée/stop/TP.   node agent-trading/tests/fleches-simples-v6-test.mjs */
import { serieKraken } from '../recherche-or/fleches-simples-rejeu.mjs'; import { serie13 } from '../recherche-or/fleches-v6-diag.mjs';
import * as V5 from '../front/or/fleches-simples-v5.js'; import * as V6 from '../front/or/fleches-simples-v6.js'; import { zonesDirect } from '../front/or/zones-direct.js';
import { niveauxSignal } from '../front/or/signal-niveaux.js'; import { evenements, formater } from '../front/or/fleches-notif.js'; import { atrSerie } from '../front/or/fleches-terminal-v1.js';
const H = 3600e3; let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const cle = f => f.id, K = serie13(), now = K.at(-1).t + H, o = { maintenant: now, bougies: 1e5 };
const r5 = V5.calculer(K, zonesDirect, o), r6 = V6.calculer(K, zonesDirect, o), r6s = V6.calculer(K, zonesDirect, { ...o, exception: false });
v('sans l\'exception, v6 = v5 flèche pour flèche (même règles, mêmes ids)', r5.fleches.map(cle).join() === r6s.fleches.map(cle).join() && r5.fleches.length > 20);
v('avec l\'exception, aucune flèche n\'est retirée ni ajoutée : seules des grises passent en couleur', r5.fleches.map(cle).join() === r6.fleches.map(cle).join());
const gris5 = r5.fleches.filter(f => f.contre).length, gris6 = r6.fleches.filter(f => f.contre).length; v('l\'exception transforme au moins un point gris en flèche colorée', gris6 < gris5, `${gris5} → ${gris6}`);
// ── cas 1 : double sommet 4 131–4 144 (5 nov. puis 9 nov.)
const c1 = r6.fleches.find(f => f.type === 'retournement' && f.dir < 0 && f.niveauNom === 'VAH mensuel' && f.tCloture === Date.UTC(2026, 10, 9, 21));
v('cas 1 : la 2ᵉ touche du 9 nov. 21:00 sur 4 131–4 144 est une VENTE colorée (plus un point gris)', c1 && !c1.contre && c1.deuxiemeTouche && c1.deuxiemeTouche.rebondAtr >= 1, JSON.stringify(c1 && c1.deuxiemeTouche));
v('cas 1 : l\'infobulle porte l\'étiquette « 2ᵉ touche : double sommet/double creux » et entrée/stop/TP', c1 && V6.detail(c1).some(x => x.startsWith(V6.ETIQUETTE_DEUX)) && V6.detail(c1).some(x => /Stop .*TP1 .*TP2/.test(x)));
v('cas 1 : la 1ʳᵉ touche (5 nov.) reste une vente rouge', r6.fleches.some(f => f.dir < 0 && f.niveauNom === 'VAH mensuel' && f.tCloture === Date.UTC(2026, 10, 5, 4) && !f.contre));
v('cas 1 : notification émise pour la 2ᵉ touche (plus un point gris)', evenements([c1], { maintenant: c1.tCloture + 1000 }).length === 1 && /2ᵉ touche/.test(formater({ genre: 'fleche', f: c1 }).corps));
// ── cas 2 : support du bas (3 880–3 893) : rebond du 13 nov. — diagnostic honnête
const dernier = r6.contacts.filter(k => k.dir > 0 && /swing/.test(k.raison)).pop();
v('cas 2 : le rebond sur le support du bas porte une raison explicite (zone de swing pas encore assez touchée), pas de flèche', dernier && dernier.zoneBas > 3870 && dernier.zoneHaut < 3900 && !r6.fleches.some(f => f.tCloture >= Date.UTC(2026, 10, 12, 13)), JSON.stringify(dernier));
// ── garde-fous conservés
v('chute du 12 novembre (6 h–19 h UTC) : zéro achat vert', r6.fleches.filter(f => f.type === 'retournement' && f.dir > 0 && !f.contre && f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19)).length === 0);
v('cassure MA200 baissière du 10 novembre (17:00 UTC) conservée', r6.fleches.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 10, 16) && f.tCloture <= Date.UTC(2026, 10, 10, 22)));
v('vente rouge du 5 novembre conservée', r6.fleches.some(f => f.dir < 0 && !f.contre && f.tCloture >= Date.UTC(2026, 10, 5) && f.tCloture < Date.UTC(2026, 10, 6)));
{ let bon = true; for (const [i, f] of r6.fleches.entries()) for (const g of r6.fleches.slice(i + 1)) if (f.type === 'retournement' && g.type === 'retournement' && f.levelId === g.levelId && Math.abs(f.i - g.i) < 24) bon = false; v('repos de 24 bougies par niveau conservé (deux flèches du même niveau ≥ 24 bougies)', bon); }
{ let bon = true; for (let k = 1; k < r6.fleches.length; k++) { const a = r6.fleches[k - 1], b = r6.fleches[k]; if (a.type !== 'ma_cassure' && b.type !== 'ma_cassure' && b.i - a.i < V6.P.distanceMin) bon = false; } v('6 bougies minimum entre deux retournements', bon); }
{ const ts = [...r6.fleches.map(f => f.t), ...r6.contacts.map(k => k.t)]; v('aucune superposition : un seul marqueur (flèche ou contact) par bougie', new Set(ts).size === ts.length); }
// ── non-repaint : flux bougie par bougie
{ const final = new Set(r6.fleches.map(cle)); let bon = true, bonC = true;
  for (const n of [900, 1000, 1100, 1250, K.length - 1]) { const P = V6.calculer(K.slice(0, n), zonesDirect, { maintenant: K[n - 1].t + H, bougies: 1e5 }); if (!P.fleches.every(f => final.has(cle(f))) || r6.fleches.filter(f => f.i < n).length !== P.fleches.length) bon = false; }
  v('non-repaint : le rendu après n bougies = le début du rendu complet (5 coupes, flux simulé)', bon);
  const R = V6.calculer(K, zonesDirect, o); v('rendu reproductible', R.fleches.map(cle).join() === r6.fleches.map(cle).join()); }
{ const dep = 1100, P = V6.calculer(K, zonesDirect, { ...o, depart: dep, deja: r6.fleches.filter(f => f.i < dep - 1) }); v('reprise avec registre = rendu complet (mêmes flèches après le départ)', P.fleches.map(cle).join() === r6.fleches.filter(f => f.i >= dep - 1).map(cle).join()); }
// ── raisons affichées
v('chaque contact porte une raison « bloqué : … » ou « en attente : … » et un niveau', r6.contacts.length > 20 && r6.contacts.every(k => /^(bloqué|en attente) : /.test(k.raison) && k.zoneHaut >= k.zoneBas));
v('« en attente » seulement pour la dernière bougie close (sinon remplacé par la flèche ou par « pas de rebond confirmé »)', r6.contacts.filter(k => /^en attente/.test(k.raison)).every(k => k.t === K.at(-1).t));
v('les raisons exigées existent : cooldown, zone cassée, garde-fou chute', ['cooldown', 'zone cassée', 'garde-fou chute'].every(m => r6.contacts.some(k => k.raison.includes(m))));
v('points gris contre-tendance : raison « bloqué : contre-tendance (MA200 … » dans l\'infobulle', r6.fleches.filter(f => f.contre).every(f => /^bloqué : contre-tendance \(MA200 (baissière|haussière) à \d/.test(V6.detail(f)[0])));
v('aucune notification pour un contact ni pour un point gris', evenements(r6.fleches.filter(f => f.contre), { maintenant: now }).length === 0 && evenements(r6.contacts.map(k => ({ ...k, type: 'contact', tCloture: now })), { maintenant: now }).filter(e => e.f.raison).length >= 0);
{ // contact « en attente » synthétique : touche sans bougie de confirmation
  const A = atrSerie(K), z = { id: 'T', cote: 'support', bas: 100, haut: 110, tDebut: 0, tFin: null, force: 99, nom: 'test' };
  const B = Array.from({ length: 40 }, (_, i) => ({ t: i * H, o: 130, h: 132, l: 128, c: 130, v: 1 })); B[39] = { t: 39 * H, o: 120, h: 125, l: 108, c: 108, v: 1 };
  const N = V6.evenementsNiveauxV6(B, Array(40).fill(5), [z]); v('en attente : touche sans clôture hors zone = contact « bougie de confirmation pas encore close »', N.events.length === 0 && N.contacts.some(k => k.i === 39 && /^en attente : bougie de confirmation pas encore close/.test(k.raison))); }
// ── exception : cas synthétiques
{ const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i)); const B = mk(140, i => ({ t: i * H, o: 100, h: 101, l: 99, c: 100, v: 1 })), A = Array(140).fill(10);
  const zone = { zoneBas: 100, zoneHaut: 104 }, hist = [{ i: 20, c: 106, dir: 1, ...zone }]; const f = { levelId: 'x', dir: 1, i: 70, att0: 69, ...zone };
  for (let i = 21; i < 60; i++) B[i] = { t: i * H, o: 110, h: 120, l: 109, c: 112, v: 1 };            // le prix repart de 106 vers 120 : rebond de 14 ≥ 1 ATR
  v('exception : rebond ≥ 1 ATR depuis la confirmation précédente, niveau non cassé → 2ᵉ touche', !!V6.deuxiemeTouche(B, A, hist, f));
  v('exception : au-delà de 120 bougies → refusée', !V6.deuxiemeTouche(B, A, hist, { ...f, i: 150 }) && !V6.deuxiemeTouche(B, A, [{ ...hist[0], i: 0 }], { ...f, i: 125 }));
  const B2 = B.map(b => ({ ...b })); for (let i = 21; i < 60; i++) B2[i] = { ...B2[i], h: 108, c: 107 };
  v('exception : rebond < 1 ATR → refusée', !V6.deuxiemeTouche(B2, A, hist, f));
  const B3 = B.map(b => ({ ...b })); B3[40] = { ...B3[40], c: 96 };
  v('exception : clôture à > 0,3 ATR de l\'autre côté entre les deux touches (zone cassée) → refusée', !V6.deuxiemeTouche(B3, A, hist, f));
  const B4 = B.map(b => ({ ...b })); B4[40] = { ...B4[40], l: 90, c: 99.5 };
  v('exception : une mèche qui dépasse sans clôture ne casse pas la zone → acceptée', !!V6.deuxiemeTouche(B4, A, hist, f));
  v('exception : sens opposé ou autre niveau → refusée', !V6.deuxiemeTouche(B, A, hist, { ...f, dir: -1 }) && !V6.deuxiemeTouche(B, A, hist, { ...f, zoneBas: 300, zoneHaut: 304 })); }
// ── entrée / stop / TP
{ const vente = niveauxSignal({ type: 'retournement', dir: -1, prix: 4142, atr: 14, zoneBas: 4131, zoneHaut: 4144 }), achat = niveauxSignal({ type: 'retournement', dir: 1, prix: 4088, atr: 13, zoneBas: 4075, zoneHaut: 4085 }), ma = niveauxSignal({ type: 'ma_cassure', dir: -1, prix: 3980, atr: 18, niveau: 4000 });
  v('vente : stop AU-DESSUS de l\'entrée (bord haut + 0,2 ATR), TP1 et TP2 en dessous', vente.stop > vente.entree && Math.abs(vente.stop - (4144 + 0.2 * 14)) < 1e-9 && vente.tp1 < vente.entree && vente.tp2 < vente.tp1 && Math.abs(vente.tp1 - (vente.entree - vente.r)) < 1e-9 && Math.abs(vente.tp2 - (vente.entree - 2 * vente.r)) < 1e-9);
  v('achat : stop EN DESSOUS de l\'entrée (bord bas − 0,2 ATR), TP1 et TP2 au-dessus', achat.stop < achat.entree && Math.abs(achat.stop - (4075 - 0.2 * 13)) < 1e-9 && achat.tp1 > achat.entree && achat.tp2 > achat.tp1);
  v('cassure MA200 baissière : stop de l\'autre côté de la MA200 à 1 ATR, objectifs en dessous', Math.abs(ma.stop - 4018) < 1e-9 && ma.stop > ma.entree - 1e-9 + 0 && ma.tp1 < ma.entree && ma.tp2 < ma.tp1);
  v('toutes les flèches affichées ont des niveaux cohérents (R > 0, bon côté)', r6.fleches.filter(f => !f.contre).every(f => { const n = niveauxSignal(f); return n && n.r > 0 && (f.dir > 0 ? n.stop < n.entree && n.tp1 > n.entree : n.stop > n.entree && n.tp1 < n.entree); })); }
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
