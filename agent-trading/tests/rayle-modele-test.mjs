/* Tests des modèles d'affichage de la stratégie Rayle (purs) : événements Épuré / Complet, phrases de mesure (n et base toujours présents, jamais « fort » sans écart net),
   étiquettes de boîtes, archives grisées, bandeau d'état, compteur d'objets (12 au plus en Épuré). */
import * as MA from '../front/or/ma-evenements-v1.js'; import * as Z from '../front/or/boites-v1.js';
import * as M1 from '../front/or/rayle-modele-calcul.js'; import * as M2 from '../front/or/rayle-modele-boites.js'; import { prng } from '../recherche-or/stats.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, t0 = Date.UTC(2026, 0, 5), g = prng(21), B = []; let c = 4000; for (let i = 0; i < 1500; i++) { const o = c; c = o + (g() - 0.5) * 7 + Math.sin(i / 37) * 3; B.push({ t: t0 + i * H, o, h: Math.max(o, c) + g() * 2, l: Math.min(o, c) - g() * 2, c, v: 50 + g() * 100 }); }
const res = MA.analyser(B), stats = { evenements: { cassure_confirmee: { haussier: { long: { n: 52, taux: 0.44 } }, baissier: { long: { n: 40, taux: 0.3 } } }, cassure: { haussier: { long: { n: 60, taux: 0.3 } }, baissier: { long: { n: 60, taux: 0.3 } } }, rebond: { haussier: { long: { n: 20, taux: 0.3 } }, baissier: { long: { n: 20, taux: 0.3 } } }, cassure_fausse: { haussier: { long: { n: 20, taux: 0.3 } }, baissier: { long: { n: 20, taux: 0.3 } } } }, classes: {} };
const ep = M1.evenementsAffiches(res, B, { vue: 'epure', stats }), co = M1.evenementsAffiches(res, B, { vue: 'complet', stats });
v(ep.length <= 2, 'Épuré : 2 événements au plus (' + ep.length + ')'); v(co.length > ep.length && co.length <= 12, 'Complet : davantage, 12 au plus (' + co.length + ')');
v(ep.every(e => !e.grise || true) && co.some(e => e.grise), 'Complet : les anciens événements sont grisés, jamais effacés');
v(ep.every(e => e.detail.some(d => /clôture de la bougie H1/.test(d)) && e.detail.some(d => /jamais un ordre/.test(d))), 'chaque événement est daté à sa clôture et dit « jamais un ordre »');
const txt = JSON.stringify(co); v(!/(achète|achetez|vends|vendez)/i.test(txt), 'aucun mot d\'ordre dans les textes');
// phrases de mesure
const cel = { assez: true, n: 120, taux: 0.3, ic: [0.25, 0.36], base: 0.3, part: 0.3, basePart: 0.3, verdict: 'pas nettement différent de la base' };
const ph = M1.phraseCellule(cel, '2015–2025'); v(/n = 120/.test(ph) && /contre 30 % pour la base/.test(ph) && /pas nettement différent/.test(ph), 'phrase : n, base et verdict honnête (' + ph + ')');
v(/pas assez de données/.test(M1.phraseCellule({ assez: false, n: 12 }, 'x')), 'phrase : n < 30 = pas assez de données');
v(!/fort|probable/i.test(ph), 'jamais « fort » ni « probable » sans écart net');
// compteur d'objets : Épuré
const mm = { evenements: ep, boites: [1, 2, 3, 4].map(() => ({})), ligne: {}, structure: [1, 2, 3], scenarios: { actifs: [1, 2] } }; v(M1.compterObjets(mm) <= 12 + 0 && M1.compterObjets(mm) === ep.length + 4 + 1 + 3 + 2, 'compteur d\'objets : événements + boîtes + ligne + cassures + scénarios');
// boîtes : étiquettes et archives
const zq = { id: 'vente|8000', cote: 'vente', prix: 4010, bas: 4009, haut: 4011, conf: 2, natures: ['swing_h4', 'volume'], niveaux: [{ nom: 'Sommet H4', nature: 'swing_h4', p: 4010 }], tFormation: B[1400].t, tInval: null, invalide: false, atr: 5, distAtr: 1, proba: 0.6, n: 20, qualifie: true, cellule: null };
v(M2.etiquetteZone(zq) === 'Zone de vente · 60 % · n = 20 (peu de cas)', 'étiquette : « Zone de vente · 60 % · n = 20 » avec « peu de cas » sous 30 (' + M2.etiquetteZone(zq) + ')');
v(M2.etiquetteZone({ ...zq, n: 80 }) === 'Zone de vente · 60 % · n = 80', 'étiquette sans mention à partir de 30');
const arch = [{ id: 'achat|7000', cote: 'achat', prix: 3990, bas: 3989, haut: 3991, tDebut: B[1000].t, tFin: B[1100].t, etiquette: 'Zone d\'achat · 55 % · n = 40', detail: [] }];
const bc = M2.boitesAffichees({ zones: [zq] }, { stats: null, tDerniere: B[1499].t, vue: 'complet', archives: arch }), be = M2.boitesAffichees({ zones: [zq] }, { stats: null, tDerniere: B[1499].t, vue: 'epure', archives: arch });
v(bc.length === 2 && bc[1].grise && /terminée/.test(bc[1].etiquette) && be.length === 1, 'archives grisées en Complet seulement ; Épuré : la zone seule');
v(bc[0].tFin === B[1499].t + 40 * H && bc[0].tDebut === zq.tFormation, 'boîte : de sa formation à 40 bougies à droite');
// bandeau
const sm = { etat: { tendance: 1, impulsionActive: null, chochEnCours: null, dernierBos: { dir: 1 } } }, b = M2.bandeau({ h1: sm, h4: { etat: { tendance: -1 } }, ligne: { texte: 'Retournement baissier si clôture H1 sous 4 040' }, sel: { zones: [zq] }, prix: 4000, atr: 5 });
v(/Tendance H4 baissière · H1 haussière/.test(b) && /sous 4 040/.test(b) && /prochaine zone : vente 4 010/.test(b) && /mouvement en cours/.test(b), 'bandeau : tendance H1/H4, ligne, prochaine zone, mouvement (' + b + ')');
v(/aucune zone forte/.test(M2.bandeau({ h1: sm, h4: null, ligne: null, sel: { zones: [] }, prix: 4000, atr: 5 })), 'bandeau : aucune zone forte à proximité');
// document de stratégie : sceau SHA-256 et mentions obligatoires
{ const fs = await import('node:fs'), crypto = await import('node:crypto');
  const doc = fs.readFileSync(new URL('../STRATEGIE-RAYLE.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), sc = JSON.parse(fs.readFileSync(new URL('../STRATEGIE-RAYLE.sceau.json', import.meta.url), 'utf8'));
  v(sc.sha256 === crypto.createHash('sha256').update(doc).digest('hex'), 'document de stratégie : sceau SHA-256 à jour');
  v(/aucune règle automatique n.a prouvé un avantage/i.test(doc) && /en observation/.test(doc) && /Scénarios, pas prévisions/.test(doc) && /10 000 \$/.test(doc) && /3 %/.test(doc) && /6 %/.test(doc) && /break-even|équilibre après \+1 R/.test(doc) && /moyenne à la baisse/.test(doc), 'document : mention d\'honnêteté, compte prop (10 000 $, 3 %, 6 %), gestion (équilibre après +1 R, jamais de moyenne à la baisse)');
  for (const m of ['ma-evenements-v1', 'boites-v1', 'carnet-lecture-v1', 'feuille-decision-v1', 'scenarios-v1']) { const x = JSON.parse(fs.readFileSync(new URL(`../front/or/${m}.sceau.json`, import.meta.url), 'utf8')), src = fs.readFileSync(new URL(`../front/or/${m}.js`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'); v(x.version === m && x.sha256 === crypto.createHash('sha256').update(src).digest('hex'), `sceau SHA-256 de ${m}.js à jour`); } }
console.log(`rayle-modele : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
