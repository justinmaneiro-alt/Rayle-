// Bataille navale : données, formes de coque, mer, météo, polaire de vitesse, scénarios, plan de l'intérieur, choix d'un océan (fonctions pures).   node tests/univers-navale-test.mjs
import assert from 'node:assert/strict';
const U = '../js/univers/';
const { TYPES, NATIONS, ORDRE_TYPES, ORDRE_NATIONS, ALLIANCES, ennemis, tirerScenario, SCENARIOS } = await import(U + 'donnees/navires.js?v=2026.10.14.4');
const { formeCoque, plan } = await import(U + 'navale/navire-geo.js?v=2026.10.14.4');
const { trainsDeVagues, hauteurMer, normaleMer } = await import(U + 'navale/mer.js?v=2026.10.14.4');
const { houleDepuisVent, echelleBeaufort, directionTexte, phaseJournee, depuisCodeWMO, surcharger, resume } = await import(U + 'navale/meteo.js?v=2026.10.14.4');
const { polaire, facteurVent, angleAuVent, avant, dirVent } = await import(U + 'navale/flotte.js?v=2026.10.14.4');
const { planInterieur, EYE, TEXTES } = await import(U + 'navale/interieur.js?v=2026.10.14.4');
const { choisirOcean, OCEANS } = await import(U + 'transitions.js?v=2026.10.14.4');

let ok = 0; const t = async (nom, f) => { try { await f(); ok++; console.log('  ✔ ' + nom); } catch (e) { console.error('  ✘ ' + nom + '\n    ' + (e && e.stack || e)); process.exitCode = 1; } };
const graine = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

await t('quatre types de navires et quatre nations, deux alliances', () => {
  assert.deepEqual(ORDRE_TYPES, ['voilier', 'brick', 'fregate', 'vaisseau']); assert.deepEqual(ORDRE_NATIONS, ['france', 'espagne', 'angleterre', 'portugal']);
  for (const id of ORDRE_TYPES) { const d = TYPES[id]; assert.ok(d.longueur > 10 && d.largeur > 3 && d.canons > 0 && d.equipage > 5 && d.pv > 50, id); }
  assert.ok(TYPES.vaisseau.longueur > TYPES.fregate.longueur && TYPES.fregate.longueur > TYPES.brick.longueur && TYPES.brick.longueur > TYPES.voilier.longueur, 'proportions croissantes');
  assert.ok(Math.abs(TYPES.vaisseau.longueur - 69) < 2 && TYPES.vaisseau.ponts === 3, 'vaisseau type HMS Victory : ~69 m, trois ponts');
  assert.equal(ennemis('france', 'angleterre'), true); assert.equal(ennemis('france', 'espagne'), false); assert.equal(ennemis('angleterre', 'portugal'), false);
  assert.deepEqual(Object.keys(ALLIANCES).sort(), ['anglo', 'bourbon']);
});
await t('scénarios aléatoires : 1 à 4 navires par nation, deux camps opposés pour les combats', () => {
  for (let i = 0; i < 300; i++) {
    const r = graine(i + 1);
    for (const nom of ['balade', 'duo', 'escarmouche', 'bataille']) {
      const s = tirerScenario(r, nom); assert.equal(s.nom, nom); assert.ok(s.navires.length >= 1);
      const compte = {}; for (const n of s.navires) { assert.ok(TYPES[n.type] && NATIONS[n.nation], 'type/nation valides'); compte[n.nation] = (compte[n.nation] || 0) + 1; }
      for (const c of Object.values(compte)) assert.ok(c >= 1 && c <= 4, nom + ' : ' + JSON.stringify(compte));
      if (nom === 'balade') assert.equal(s.navires.length, 1); if (nom === 'duo') assert.equal(s.navires.length, 2);
      if (nom === 'escarmouche' || nom === 'bataille') { const camps = new Set(s.navires.map(n => NATIONS[n.nation].alliance)); assert.equal(camps.size, 2, 'deux camps'); }
    }
  }
  assert.ok(Object.keys(SCENARIOS).length >= 4);
});
await t('coque : largeur, quille et pont cohérents pour chaque type', () => {
  for (const id of ORDRE_TYPES) {
    const S = formeCoque(TYPES[id]), L = TYPES[id].longueur;
    for (let u = 0; u <= 1.0001; u += .05) {
      assert.ok(S.demiLargeur(u) >= 0 && S.demiLargeur(u) <= TYPES[id].largeur / 2 + 1e-6, id + ' demi-largeur à u=' + u);
      assert.ok(S.yPont(u) > S.yQuille(u) + 1, id + ' pont au-dessus de la quille'); assert.ok(S.yHaut(u) >= S.yPont(u));
    }
    assert.ok(Math.abs(S.zDe(0) - L / 2) < 1e-9 && Math.abs(S.zDe(1) + L / 2) < 1e-9 && Math.abs(S.uDe(S.zDe(.3)) - .3) < 1e-9, 'poupe +z, proue −z');
    assert.ok(S.x(.5, .5) > 0 && S.x(.5, S.vDepuisY(.5, S.yPont(.5))) > S.x(.5, 0), 'la coque s’évase de la quille au pont');
  }
});
await t('plan de mâture : un mât (voilier), deux (brick), trois (frégate, vaisseau) ; voiles et sabords', () => {
  const attendu = { voilier: 1, brick: 2, fregate: 3, vaisseau: 3 };
  for (const id of ORDRE_TYPES) { const P = plan(TYPES[id]); assert.equal(P.masts.length, attendu[id], id); assert.ok(P.voiles.length >= 3); for (const m of P.masts) assert.ok(m.u > 0 && m.u < 1 && m.hauteur > 10); }
  assert.equal(plan(TYPES.vaisseau).rangees.length, 3, 'trois batteries'); assert.equal(plan(TYPES.fregate).rangees.length, 1);
  assert.ok(plan(TYPES.vaisseau).canonsParBord * 2 >= 70, 'vaisseau de 74 canons');
});
await t('mer : hauteur bornée, périodique dans le temps, normale unitaire tournée vers le haut', () => {
  for (const [ms, dir] of [[3, 90], [12, 250], [22, 10]]) {
    const T = trainsDeVagues(houleDepuisVent(ms), dir); assert.equal(T.length, 4); let max = 0;
    for (let i = 0; i < 400; i++) { const x = (i * 37) % 500 - 250, z = (i * 91) % 500 - 250, h = hauteurMer(T, x, z, i * .3); max = Math.max(max, Math.abs(h)); const n = normaleMer(T, x, z, i * .3); assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-9 && n[1] > 0, 'normale'); }
    assert.ok(max < houleDepuisVent(ms) * 1.3 + .1, 'amplitude ≤ houle (' + max + ')');
  }
  const f = trainsDeVagues(2, 0); assert.ok(f.every(o => o.A > 0 && o.L > 0 && o.w > 0));
  assert.ok(Math.abs(Math.hypot(f[0].dx, f[0].dz) - 1) < 1e-9);
});
await t('météo : Beaufort, houle, direction du vent, phases du jour, codes WMO', () => {
  assert.equal(echelleBeaufort(0).force, 0); assert.equal(echelleBeaufort(5).force, 3); assert.equal(echelleBeaufort(12).force, 6); assert.equal(echelleBeaufort(30).force, 11); assert.equal(echelleBeaufort(40).force, 12);
  assert.ok(houleDepuisVent(0) >= .35 && houleDepuisVent(40) <= 5.5 && houleDepuisVent(10) > houleDepuisVent(5));
  assert.equal(directionTexte(0), 'nord'); assert.equal(directionTexte(90), 'est'); assert.equal(directionTexte(180), 'sud'); assert.equal(directionTexte(270), 'ouest'); assert.equal(directionTexte(359), 'nord');
  assert.equal(phaseJournee(30), 'jour'); assert.equal(phaseJournee(-20), 'nuit'); assert.equal(phaseJournee(0, true), 'aube'); assert.equal(phaseJournee(0, false), 'crepuscule');
  const d = depuisCodeWMO(0, 0), o = depuisCodeWMO(95, 100), b = depuisCodeWMO(45, 90); assert.ok(d.pluie === 0 && o.orage > 0 && b.brouillard > 0, JSON.stringify([d, o, b]));
});
await t('météo forcée : tempête, pluie, brouillard, calme, nuit, aube… + résumé en français', () => {
  const base = { ventMs: 6, ventDir: 200, nuages: .3, pluie: 0, orage: 0, brouillard: 0, moment: 'jour', jour: 1, soleilAlt: 45, lat: 46, lon: -2, source: 'test' };
  const tp = surcharger(base, { meteo: 'tempete' }); assert.ok(tp.ventMs >= 20 && tp.orage === 1 && tp.houle > 3 && tp.beaufort.force >= 9);
  assert.ok(surcharger(base, { meteo: 'pluie' }).pluie > .5); assert.ok(surcharger(base, { meteo: 'brouillard' }).brouillard > .5); assert.ok(surcharger(base, { meteo: 'calme' }).ventMs < 3);
  const cl = surcharger(tp, { meteo: 'clair' }); assert.ok(cl.pluie === 0 && cl.orage === 0 && cl.brouillard === 0);
  const nuit = surcharger(base, { moment: 'nuit' }); assert.equal(nuit.jour, 0); assert.ok(nuit.soleilAlt < -10); assert.equal(surcharger(base, { moment: 'aube' }).moment, 'aube');
  assert.equal(surcharger(base, { vent: 15 }).ventMs, 15); assert.equal(base.ventMs, 6, 'l’original n’est pas modifié');
  assert.match(resume(nuit), /nuit/i); assert.match(resume(tp), /tempête|orage|vent/i);
});
await t('polaire de vitesse : interdite face au vent, maximale au travers, vent faible/fort', () => {
  assert.equal(polaire(0), 0); assert.equal(polaire(30), 0); assert.equal(polaire(-41), 0); assert.ok(polaire(42.1) < .02);
  assert.ok(polaire(90) > .7 && polaire(110) >= .99 && polaire(180) < polaire(110) && polaire(180) > .5);
  for (let a = 0; a <= 180; a += 5) { const p = polaire(a); assert.ok(p >= 0 && p <= 1.0001 && polaire(-a) === p, 'a=' + a); }
  assert.ok(facteurVent(0) >= .42 && facteurVent(9) === 1 && facteurVent(30) < facteurVent(9), 'plancher et tempête');
});
await t('géométrie : cap, vent et angle au vent', () => {
  assert.deepEqual(avant(0).map(v => +v.toFixed(6) + 0), [0, -1]); assert.ok(Math.abs(avant(Math.PI / 2)[0] + 1) < 1e-9, 'cap 90° = vers l’est… (x = −sin)');
  // cap nord (0) avec vent du nord (0°) : face au vent
  assert.ok(Math.abs(angleAuVent(0, 0)) < 1e-6); assert.ok(Math.abs(Math.abs(angleAuVent(0, 180)) - 180) < 1e-6, 'vent dans le dos');
  assert.ok(Math.abs(Math.abs(angleAuVent(0, 90)) - 90) < 1e-6, 'vent de travers');
  const [vx, vz] = dirVent(0); assert.ok(Math.abs(vx) < 1e-9 && vz > .99, 'vent venant du nord souffle vers le sud (+z)');
});
await t('intérieur : niveaux, ponts, salles et trappes cohérents pour chaque type', () => {
  const attendu = { voilier: ['pont', 'faux', 'cale'], brick: ['pont', 'faux', 'cale'], fregate: ['pont', 'batterie', 'faux', 'cale'], vaisseau: ['pont', 'batterie', 'batterie', 'batterie', 'faux', 'cale'] };
  for (const id of ORDRE_TYPES) {
    const S = formeCoque(TYPES[id]), P = planInterieur(S, TYPES[id]);
    assert.deepEqual(P.niveaux.map(n => n.role), attendu[id], id);
    for (let k = 1; k < P.niveaux.length; k++) { const n = P.niveaux[k], h = P.niveaux[k - 1]; assert.ok(n.plafond < (k === 1 ? h.sol : h.sol), 'plafond sous le pont du dessus'); assert.ok(Math.abs(n.plafond - n.sol - n.h) < 1e-9); assert.ok(n.h >= 1.3 && n.h <= 2.7, id + ' hauteur sous barrots ' + n.h); assert.ok(n.sol > S.yQuille(.5) - 0.01, id + ' le sol est au-dessus de la quille'); }
    assert.ok(EYE - .28 <= Math.max(...P.niveaux.slice(1).map(n => n.h)) + 1e-9);
    assert.equal(P.trappes.length, 2); const masts = plan(TYPES[id]).masts; for (const u of P.trappes) for (const m of masts) assert.ok(Math.abs(u - m.u) > .05, id + ' trappe ' + u + ' trop près du mât ' + m.u);
    const ids = new Set(P.niveaux.flatMap(n => n.salles.map(s => s.id)));
    for (const s of ['cabine', 'cuisine', 'hamacs', 'infirmerie', 'soute', 'cale']) assert.ok(ids.has(s), id + ' : salle ' + s + ' absente');
    assert.equal(ids.has('batterie'), id === 'fregate' || id === 'vaisseau', id + ' batterie');
    for (const n of P.niveaux) for (const s of n.salles) { assert.ok(s.u0 >= 0 && s.u1 <= 1 && s.u0 < s.u1, id + ' ' + s.id); assert.ok(TEXTES[s.id] && TEXTES[s.id].length >= 1, 'texte guidé pour ' + s.id); }
  }
  const vv = planInterieur(formeCoque(TYPES.vaisseau), TYPES.vaisseau); assert.deepEqual(vv.niveaux.filter(n => n.role === 'batterie').map(n => n.nom), ['Batterie haute', 'Batterie moyenne', 'Batterie basse']);
});
await t('choix d’un océan : demandé, le plus proche de la position, ou au hasard', () => {
  assert.equal(choisirOcean({ texte: 'la Manche' }).nom, 'la Manche'); assert.equal(choisirOcean({ texte: 'les Caraïbes' }).nom, 'la mer des Caraïbes'); assert.equal(choisirOcean({ texte: 'Trafalgar' }).nom, 'le cap Trafalgar');
  assert.equal(choisirOcean({ position: { lat: 48.8, lon: 2.3 } }).nom, 'la Manche', 'depuis Paris : la Manche');
  assert.equal(choisirOcean({ position: { lat: 14.6, lon: -61 } }).nom, 'la mer des Caraïbes', 'depuis la Martinique');
  const c = choisirOcean({ lat: 10, lon: 20 }); assert.deepEqual([c.lat, c.lon], [10, 20]);
  assert.ok(OCEANS.some(o => o.nom === choisirOcean({ rnd: () => .5 }).nom));
  for (const o of OCEANS) assert.ok(Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180 && o.nom && o.mots.length);
});
console.log(ok + ' tests réussis');
