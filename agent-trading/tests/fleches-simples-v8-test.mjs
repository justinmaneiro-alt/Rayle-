/* Flèches v8 « Direct » (gros mouvements) : confirmation, espace, tardif, alerte de contact, boîtes de position, zones lisibles, cas de contrôle, non-repaint, flux simulé.   node agent-trading/tests/fleches-simples-v8-test.mjs */
import { serie13 } from '../recherche-or/fleches-v6-diag.mjs';
import * as V7 from '../front/or/fleches-simples-v7.js'; import * as V8 from '../front/or/fleches-simples-v8.js'; import { zonesDirect } from '../front/or/zones-direct.js';
import { niveauxSignal } from '../front/or/signal-niveaux.js'; import { evenements, formater, creerNotifieur } from '../front/or/fleches-notif.js'; import { atrSerie } from '../front/or/fleches-terminal-v1.js';
const H = 3600e3; let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const K = serie13(), now = K.at(-1).t + H, o = { maintenant: now, bougies: 1e5 }, cle = f => f.id, U = (m, j, h) => Date.UTC(2026, m, j, h);
const r7 = V7.calculer(K, zonesDirect, o), r8 = V8.calculer(K, zonesDirect, o);
const col = f => !f.contre && !f.invalidee;
// ── v7 intacte
v('la v7 (module séparé) donne toujours 51 flèches sur la série de référence', r7.fleches.length === 51);
v('v8 : version et module distincts', V8.VERSION === 'fleches-simples-v8' && r8.fleches.every(f => f.version === 'fleches-simples-v8'));
// ── cas de contrôle (voir RAPPORT-FLECHES-GROS-MOUVEMENTS.md : deux règles relâchées pour garder la vente du 12 nov.)
v('contrôle : vente rouge du 5 nov. (VAH mensuel)', r8.fleches.some(f => f.type === 'retournement' && f.dir < 0 && col(f) && f.tCloture >= U(10, 5, 0) && f.tCloture < U(10, 6, 0) && f.zoneHaut > 4130 && f.zoneBas < 4150));
v('contrôle : vente rouge du 9 nov. sur 4 131–4 144 (2ᵉ touche)', r8.fleches.some(f => f.type === 'retournement' && f.dir < 0 && col(f) && f.deuxiemeTouche && f.tCloture >= U(10, 9, 20) && f.tCloture <= U(10, 10, 2)));
v('contrôle : vente rouge sur 3 963–3 976 le 12 nov. (début de la dernière chute)', r8.fleches.some(f => f.type === 'retournement' && f.dir < 0 && col(f) && f.tCloture >= U(10, 12, 6) && f.tCloture <= U(10, 12, 14) && f.zoneBas < 3970 && f.zoneHaut > 3965));
v('contrôle : rebond après base du 2 nov. (≈ 3 870)', r8.fleches.some(f => f.type === 'rebond_base' && f.dir > 0 && f.tCloture === U(10, 2, 0)));
v('contrôle : cassure MA200 baissière du 10 nov. calculée (flèche masquée par défaut, ligne colorée)', r8.fleches.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= U(10, 10, 16) && f.tCloture <= U(10, 10, 22)));
v('contrôle : zéro achat coloré dans la chute du 12 nov. (6 h–19 h UTC) hors stabilisation', r8.fleches.filter(f => f.dir > 0 && f.type !== 'ma_cassure' && col(f) && !f.stabilisation && f.tCloture >= U(10, 12, 6) && f.tCloture <= U(10, 12, 19)).length === 0);
// ── règle 4 : grosse zone
v('grosse zone : chaque flèche de niveau est sur un trait plein (structure) ou une zone de ≥ 3 touches vues ou à réaction ≥ 3 ATR', r8.fleches.filter(f => f.type === 'retournement').every(f => f.niveauType === 'structure' || (f.niveauType === 'swing' && (f.touchesVues >= 3 || (f.reaction && f.reaction.atr >= 3)))));
// ── règle 5 : confirmation (machine à états, zone fournie à la main)
{
  const mk = (specs) => { let t = Date.UTC(2026, 0, 5); return specs.map(([op, c, h, l]) => { const b = { t, o: op, c, h, l, v: 1 }; t += H; return b; }); };
  const base = []; for (let k = 0; k < 30; k++) base.push([110, 110.5 + (k % 2 ? 1 : -1) * 0.5, 113, 107]);
  const zone = B => ({ id: 'z', cote: 'support', bas: 100, haut: 102, tDebut: B[0].t, tFin: null, nom: 'Test', force: 99, retournee: false });
  const fini = (specs) => { const B = mk(base.concat(specs)), A = atrSerie(B); return { B, A, ev: V8.evenementsNiveauxV8(B, A, [zone(B)]).events }; };
  // A : le prix descend dans la zone puis UNE clôture au-dessus avec un gros corps
  const desc = [[110, 106, 111, 105], [106, 101.5, 107, 100.5]];
  let r = fini(desc.concat([[101, 107, 108, 100.5]]));
  const a = r.A[r.A.length - 1];
  v('confirmation : un gros corps (> 0,6 ATR) hors de la zone confirme en UNE clôture', r.ev.length === 1 && r.ev[0].confirmation === 'corps' && 6 > V8.P.corpsAtr * a, JSON.stringify(r.ev));
  r = fini(desc.concat([[101.6, 102.6, 103, 100.5]]));
  v('confirmation : un petit corps hors de la zone ne confirme PAS en une clôture', r.ev.length === 0);
  r = fini(desc.concat([[101.6, 102.6, 103, 100.5], [102.6, 103.2, 103.6, 102.4]]));
  v('confirmation : deux clôtures consécutives hors de la zone confirment (à la 2ᵉ bougie)', r.ev.length === 1 && r.ev[0].confirmation === '2 clôtures' && r.ev[0].i === r.B.length - 1, JSON.stringify(r.ev.map(e => e.i)));
  r = fini(desc.concat([[101.6, 102.6, 103, 100.5], [102.6, 101.8, 103, 101.5]]));
  v('confirmation : si la 2ᵉ bougie rentre dans la zone, la série d\'une clôture est annulée (pas de flèche)', r.ev.length === 0);
}
// ── règle 6 et 7 : unités
{
  const f = { dir: 1, prix: 100, atr: 2, zoneBas: 95, zoneHaut: 98, levelId: 'a', type: 'retournement' }; // stop = 95 - 0,4 = 94,6 ; R = 5,4
  const z = (bas, haut, extra = {}) => ({ id: 'q' + bas, tDebut: 1, bas, haut, niveauType: 'structure', ...extra });
  const e1 = V8.espaceDevant(f, [z(105, 105)]), e2 = V8.espaceDevant(f, [z(120, 121)]), e3 = V8.espaceDevant(f, []);
  v('espace : niveau à 5 pts pour R = 5,4 → ≈ 0,93 R', Math.abs(e1.espace - 5 / 5.4) < 1e-6, e1.espace);
  v('espace : niveau à 20 pts → ≈ 3,7 R ; aucun niveau → illimité', e2.espace > 3.5 && e3.espace === Infinity);
  v('espace : un niveau collé à la zone tradée (même bande) n\'est pas un « prochain niveau »', V8.espaceDevant(f, [z(98.5, 99)]).espace === Infinity);
  v('espace : une zone faible (< 10 touches, pas de réaction) ne compte pas', V8.espaceDevant(f, [z(105, 105, { niveauType: 'swing', touchesVues: 4 })]).espace === Infinity);
}
// ── règles 6 et 7 sur la série : plus de flèches tardives / sans espace
{ const sans = V8.calculer(K, zonesDirect, { ...o, tardif: false, espace: false }); v('espace + tardif retirent des flèches (mesure)', sans.fleches.length > r8.fleches.length, `${sans.fleches.length} / ${r8.fleches.length}`);
  v('aucune flèche de niveau gardée n\'est tardive (> 2,5 ATR du bord de la zone à la clôture)', r8.fleches.filter(f => f.type === 'retournement').every(f => (f.dir > 0 ? f.prix - f.zoneHaut : f.zoneBas - f.prix) <= V8.P.tardifAtr * f.atr + 1e-9)); }
// ── règle 11 : alerte de contact
{ const al = r8.alertes; v('alertes de contact : produites, jamais un marqueur (ni flèche ni point)', al.length > 0 && al.every(a => !r8.fleches.some(f => f.id === a.id) && !r8.contacts.some(k => k.id === a.id)));
  const par = new Map(); let bon = true; for (const a of al.slice().sort((x, y) => x.t - y.t)) { const d = par.get(a.levelId); if (d != null && a.t - d < V8.P.contactRepos * H) bon = false; par.set(a.levelId, a.t); }
  v('alertes de contact : jamais deux sur la même zone à moins de 24 bougies', bon);
  const e = evenements([], { maintenant: al.at(-1).tCloture + 1000, alertes: al.slice(-2) }), t = formater(e[0]);
  v('alertes de contact : notification « Attention : prix sur … surveille un retournement », texte seul', e.length >= 1 && /Attention : prix sur/.test(t.titre) && /surveille un retournement/.test(t.titre));
  const ctx = []; const n = creerNotifieur({ canaux: [async m => ctx.push(m)], maintenant: () => al.at(-1).tCloture + 1000 }); await n.traiter([], { alertes: al.slice(-1) }); await n.traiter([], { alertes: al.slice(-1) });
  v('alertes de contact : dédoublonnées (une seule notification)', ctx.length === 1);
  const sans = []; const n2 = creerNotifieur({ canaux: [async m => sans.push(m)], maintenant: () => al.at(-1).tCloture + 1000 }); await n2.traiter([], { alertes: [] }); v('alertes de contact désactivées : rien n\'est envoyé', sans.length === 0); }
// ── boîtes de position
{
  const mk = (bars) => { let t = Date.UTC(2026, 0, 5); return bars.map(([c, h, l]) => ({ t: t += H, o: c, c, h, l, v: 1 })); };
  const f = B => ({ id: 'x', type: 'retournement', dir: 1, t: B[0].t, tCloture: B[0].t + H, i: 0, prix: 100, atr: 2, zoneBas: 95, zoneHaut: 98, levelId: 'a' }); // stop 94,6 ; R 5,4 ; TP1 105,4 ; TP2 110,8
  const att = (bars, b = mk(bars)) => V8.boite(b, f(b));
  const flat = n => Array.from({ length: n }, () => [100, 101, 99]);
  v('boîte : stop touché = −1 R, figée', (b => b.etat === 'stop' && b.R === -1 && b.figee && b.libelle === '−1 R')(att([[100, 101, 99], [99, 100, 94]])));
  v('boîte : TP1 seul puis fin de fenêtre = +1 R (expirée)', (b => b.etat === 'expiree' && b.R === 1 && b.libelle === '+1 R')(att([[100, 101, 99], [105, 106, 100], ...flat(49)])));
  v('boîte : TP2 touché = +2 R, figée', (b => b.etat === 'tp2' && b.R === 2 && b.libelle === '+2 R')(att([[100, 101, 99], [105, 106, 100], [110, 111.5, 105]])));
  v('boîte : stop et TP1 dans la même bougie = le stop (−1 R)', (b => b.etat === 'stop' && b.R === -1)(att([[100, 101, 99], [100, 106, 94]])));
  v('boîte : TP1 puis stop = +1 R encaissé', (b => b.etat === 'tp1' && b.R === 1)(att([[100, 101, 99], [105, 106, 100], [95, 100, 94]])));
  v('boîte : rien touché après 48 bougies = expirée avec le résultat du moment', (b => b.etat === 'expiree' && b.expiree && b.R === 0 && b.libelle === '+0 R')(att([[100, 101, 99], ...flat(50)])));
  v('boîte : encore ouverte (peu de bougies) = non figée', (b => b.etat === 'ouverte' && !b.figee)(att([[100, 101, 99], [101, 102, 100]])));
  const nv = niveauxSignal(f(mk([[100, 101, 99]])));
  v('boîte : mêmes valeurs que le signal (entrée, stop, TP1, TP2)', (b => b.entree === nv.entree && b.stop === nv.stop && b.tp1 === nv.tp1 && b.tp2 === nv.tp2)(att([[100, 101, 99]])));
  const vente = bars => { const b = mk(bars); return V8.boite(b, { id: 'v', type: 'retournement', dir: -1, t: b[0].t, tCloture: b[0].t + H, i: 0, prix: 100, atr: 2, zoneBas: 102, zoneHaut: 105, levelId: 'b' }); };
  v('boîte (vente) : stop au-dessus, −1 R', (b => b.etat === 'stop' && b.R === -1)(vente([[100, 101, 99], [101, 106, 100]])));
  v('boîte (vente) : cible en dessous, +2 R', (b => b.etat === 'tp2' && b.R === 2)(vente([[100, 101, 99], [90, 100, 88]])));
  v('série : une boîte par flèche colorée non invalidée, résultats cohérents', r8.boites.length === r8.fleches.filter(col).length && r8.boites.every(b => ['stop', 'tp1', 'tp2', 'expiree', 'ouverte'].includes(b.etat) && (b.etat !== 'tp2' || b.R === 2) && (b.etat !== 'stop' || b.R === -1)));
}
// ── zones lisibles
{ const Z = V8.zonesLisibles(r8.zones, K.at(-1).c); const R = Z.filter(z => z.sens === 'resistance'), S = Z.filter(z => z.sens === 'support');
  v('zones lisibles : au plus 3 résistances et 3 supports', R.length <= 3 && S.length <= 3 && Z.length > 0);
  v('zones lisibles : R1 plus proche que R2, S1 plus proche que S2 (ordre de distance)', R.every((z, k) => !k || R[k - 1].bas <= z.bas + 1e-6) && S.every((z, k) => !k || S[k - 1].haut >= z.haut - 1e-6));
  v('zones lisibles : étiquettes courtes R1/S1… et plage de prix', Z.every(z => /^[RS][1-3]$/.test(z.etiquette) && z.plage));
  const seg = V8.segmentsRegimeMa(r8.fleches, K[0].t, K.at(-1).t + H);
  v('régime MA200 : segments contigus, dernier segment baissier après la cassure du 10 nov.', seg.length >= 2 && seg.at(-1).dir === -1 && seg.every((s, k) => !k || seg[k - 1].t1 === s.t0)); }
// ── invariants
v('cohérence levelId : id = type|t|dir|levelId pour chaque flèche', r8.fleches.every(f => f.id === `${f.type}|${f.t}|${f.dir}|${f.levelId}` && f.levelId));
v('indexApparition = indexDessin (décidé à la clôture de la bougie)', r8.fleches.every(f => f.indexApparition === f.indexDessin && f.indexDessin === f.i));
{ const ts = [...r8.fleches.map(f => f.t), ...r8.contacts.map(k => k.t)]; v('un seul marqueur (flèche ou point) par bougie : aucune superposition', new Set(ts).size === ts.length); }
{ let bon = true; for (let k = 1; k < r8.fleches.length; k++) { const a = r8.fleches[k - 1], b = r8.fleches[k]; if (a.type !== 'ma_cassure' && b.type !== 'ma_cassure' && b.i - a.i < V8.P.distanceMin) bon = false; } v('6 bougies minimum entre deux flèches (hors MA200)', bon); }
{ const col2 = r8.fleches.filter(f => !f.contre); let bon = true; for (const f of col2) for (const g of col2) if (g !== f && f.dir !== g.dir && g.i > f.i && g.i - f.i < 12 && g.type !== 'ma_cassure' && !f.invalidee && !g.deuxiemeTouche) bon = false; v('anti-aller-retour conservé (12 bougies)', bon); }
{ const inv = r8.fleches.filter(f => f.invalidee); v('invalidation : jamais supprimée, marquée invalidée avec l\'heure', inv.length > 0 && inv.every(f => f.invalideeT > f.tCloture && r8.fleches.includes(f))); }
// ── non-repaint et flux simulé
{ const final = new Set(r8.fleches.map(cle)); let bon = true;
  for (const n of [900, 1000, 1100, 1250, K.length - 1]) { const P = V8.calculer(K.slice(0, n), zonesDirect, { maintenant: K[n - 1].t + H, bougies: 1e5 }); if (!P.fleches.every(f => final.has(cle(f))) || r8.fleches.filter(f => f.i < n).length !== P.fleches.length) bon = false; }
  v('non-repaint : le rendu après n bougies = le début du rendu complet (5 coupes)', bon); }
{ let reg = [], bon = true;
  for (const n of [1250, 1300, 1350, 1400, K.length]) { const S = K.slice(0, n), r = V8.calculer(S, zonesDirect, { maintenant: S[n - 1].t + H, bougies: 1e5 }); const avant = reg.map(f => f.id); reg = V8.fusionnerRegistre(reg, r.fleches, r.invalidees || []); if (!avant.every(id => reg.some(f => f.id === id))) bon = false; if (!r.fleches.every(f => f.indexApparition === f.indexDessin)) bon = false; }
  v('flux simulé : le registre ne perd jamais une flèche posée, indexApparition = indexDessin', bon && reg.length > 0); }
{ // les alertes de contact ne repeignent pas : même liste après coupe
  const final = new Set(r8.alertes.map(a => a.id)); let bon = true; for (const n of [1100, 1250]) { const P = V8.calculer(K.slice(0, n), zonesDirect, { maintenant: K[n - 1].t + H, bougies: 1e5 }); if (!P.alertes.every(a => final.has(a.id))) bon = false; } v('non-repaint : les alertes de contact posées ne changent pas', bon); }
v('niveau masqué : l\'option exclure fonctionne aussi en v8', V8.calculer(K, zonesDirect, { ...o, exclure: () => false }).fleches.map(cle).join() === r8.fleches.map(cle).join());
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
