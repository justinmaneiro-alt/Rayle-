// Position de l'entité (js/rayle/position-entite.js) : placement sur tous les écrans, sauvegarde, position par vue, panneaux, glisser, rangement :   node tests/entite-position-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; } };
const lire = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ───── page simulée : corps, entité, barre du bas, titre, panneaux ─────
function page({ largeur = 1280, hauteur = 800, stockage = {} } = {}) {
  const classes = new Set(), props = {}, anims = [], gestes = {}, decalages = [];
  const el = (nom, rect, extra = {}) => Object.assign({ nom, offsetParent: {}, hidden: false, children: [], offsetHeight: rect.height || 0, offsetWidth: rect.width || 0, getBoundingClientRect: () => ({ left: rect.left || 0, top: rect.top || 0, right: (rect.left || 0) + (rect.width || 0), bottom: (rect.top || 0) + (rect.height || 0), width: rect.width || 0, height: rect.height || 0 }) }, extra);
  const reactor = {
    style: { setProperty: (k, v) => { props[k] = v; }, getPropertyValue: k => props[k] || '', removeProperty: k => { delete props[k]; } },
    animate: (kf, o) => { anims.push([kf, o]); }, setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect: () => {
      if (!classes.has('ent-fixe')) return { left: (largeur - 520) / 2, top: 90, width: 520, height: 520, right: 0, bottom: 0 };
      const x = parseFloat(props['--ent-x']) || 0, y = parseFloat(props['--ent-y']) || 0, w = parseFloat(props['--ent-w']) || 0; return { left: x, top: y, width: w, height: w, right: x + w, bottom: y + w };
    },
    addEventListener(n, f) { (gestes[n] = gestes[n] || []).push(f); },
  };
  const barre = el('barre', { left: 0, top: hauteur - 120, width: largeur, height: 120 }), titre = el('titre', { left: 0, top: 0, width: 200, height: 40 });
  const panneaux = [], minuteries = [];
  const docEcouteurs = {};
  const bus = {}; const fusions = {};
  const ctx = {
    console, setTimeout: f => { minuteries.push(f); return 0; }, clearTimeout() {}, requestAnimationFrame: f => { f(); return 0; }, innerWidth: largeur, innerHeight: hauteur,
    localStorage: { getItem: k => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = String(v); }, removeItem: k => { delete stockage[k]; } },
    getComputedStyle: () => ({ position: 'static' }),
    addEventListener() {},
    document: {
      body: { classList: { add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)), contains: c => classes.has(c), toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)) } },
      getElementById: id => id === 'reactor' ? reactor : id === 'barre' ? barre : null,
      querySelector: s => s === '.titre' ? titre : null,
      querySelectorAll: s => /\.pn/.test(s) ? panneaux : [],
      addEventListener: (n, f) => { (docEcouteurs[n] = docEcouteurs[n] || []).push(f); },
    },
    RayleUnivers: { decaler: px => decalages.push(px) },
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(lire('js/commun/bus.js'), ctx);
  vm.runInContext(lire('js/rayle/position-entite.js'), ctx);
  const E = ctx.RayleEntitePosition, B = ctx.RayleBus;
  return {
    E, B, ctx, classes, props, anims, gestes, decalages, stockage, panneaux, reactor, barre,
    univers(oui, planete = null) { classes[oui ? 'add' : 'delete']('univers-actif'); B.fusion('univers', { ouvert: !!oui }); B.fusion('planete', { interieur: planete }); B.emit('etat:univers', { ouvert: !!oui }); },
    ouvrirPanneau(rect) { panneaux.push(Object.assign({ offsetParent: { getBoundingClientRect: () => ({ left: 0, top: 0 }), scrollLeft: 0, scrollTop: 0 }, offsetLeft: rect.x, offsetTop: rect.y, offsetWidth: rect.w, offsetHeight: rect.h }, {})); B.fusion('panneaux', { n: panneaux.length }); B.emit('etat:panneaux', { n: panneaux.length }); },
    fermerPanneaux() { panneaux.length = 0; B.fusion('panneaux', { n: 0 }); B.emit('etat:panneaux', { n: 0 }); },
    tire(n, e) { (gestes[n] || []).forEach(f => f(e)); },
    avancer() { while (minuteries.length) minuteries.shift()(); },
  };
}
const J = x => JSON.parse(JSON.stringify(x));          // objets créés dans le contexte simulé : on compare leur contenu
const rectEntite = p => ({ x: parseFloat(p.props['--ent-x']), y: parseFloat(p.props['--ent-y']), w: parseFloat(p.props['--ent-w']) });

await t('défaut sur téléphone : en Univers la petite bulle va en bas à droite (la barre du haut prend la moitié de l’écran)', () => {
  const E = page().E._, S = { global: null, vues: {} };
  assert.equal(J(E.resoudre(S, 'systeme', false).pos).coin, 'hd'); assert.equal(J(E.resoudre(S, 'systeme', true).pos).coin, 'bd');
  assert.equal(J(E.resoudre(S, 'accueil', true).pos).mode, 'centre', 'accueil : toujours grande au centre');
  assert.equal(J(E.resoudre({ global: { mode: 'cote', cote: 'gauche' }, vues: {} }, 'systeme', true).pos).mode, 'cote', 'un choix de l’utilisateur prime sur le défaut');
  const p = page({ largeur: 390, hauteur: 844 }); p.ctx.innerWidth = 390; p.univers(true); assert.equal(p.E.valeur(), 'coin:bd');
  assert.ok(p.E.options().every(o => o.court && o.court.length <= 16), 'libellés courts pour la barre de l’Univers');
});
await t('défauts : accueil = grande au centre ; Univers = petite en haut à droite (comme avant)', () => {
  const p = page(); assert.equal(p.E.valeur(), 'centre'); assert.equal(p.E.etat().source, 'defaut');
  assert.ok(!p.classes.has('ent-fixe'), 'au centre de l’accueil : mise en page normale, aucun style ajouté');
  p.univers(true); assert.equal(p.E.valeur(), 'coin:hd'); assert.ok(p.classes.has('ent-fixe') && p.classes.has('ent-coin'));
  p.univers(false); assert.equal(p.E.valeur(), 'centre');
});
await t('les sept positions du sélecteur existent et se règlent par leur valeur', () => {
  const p = page(); const o = p.E.options(); assert.equal(o.length, 7);
  assert.deepEqual(J(o.map(x => x.valeur)), ['coin:hg', 'coin:hd', 'coin:bg', 'coin:bd', 'centre', 'cote:gauche', 'cote:droite']);
  for (const x of o) { assert.ok(p.E.definirValeur(x.valeur), x.valeur); assert.equal(p.E.valeur(), x.valeur); }
  assert.equal(p.E.definirValeur('nimporte:quoi'), false); assert.equal(p.E.definirValeur('coin:zz'), true, 'angle inconnu : repli sur un angle valide'); assert.equal(p.E.valeur(), 'coin:bd');
});
await t('petite dans un coin : ancrée dans l’angle choisi, au-dessus de la barre du bas, sous le titre', () => {
  const p = page({ largeur: 1280, hauteur: 800 }); p.univers(true);
  const barreHaut = 800 - 120;
  for (const [c, att] of [['hg', { gauche: true, haut: true }], ['hd', { gauche: false, haut: true }], ['bg', { gauche: true, haut: false }], ['bd', { gauche: false, haut: false }]]) {
    p.E.coin(c); const r = rectEntite(p);
    assert.ok(r.w >= 68 && r.w <= 96, 'petite : ' + r.w);
    assert.equal(r.x < 640, att.gauche, c + ' côté'); assert.equal(r.y < 400, att.haut, c + ' haut/bas');
    assert.ok(r.y + r.w <= barreHaut, c + ' : ne couvre pas la barre du bas'); assert.ok(r.x >= 0 && r.x + r.w <= 1280);
  }
});
await t('grande au centre (Univers) et grande sur le côté : dans l’écran, sans couvrir la barre, collée au bon côté', () => {
  const p = page({ largeur: 1280, hauteur: 800 }); p.univers(true);
  p.E.centre(); let r = rectEntite(p); assert.ok(r.w > 300 && r.w <= 560, 'grande : ' + r.w); assert.ok(Math.abs(r.x + r.w / 2 - 640) <= 1, 'centrée'); assert.ok(r.y + r.w <= 680);
  p.E.cote('gauche'); r = rectEntite(p); assert.ok(r.x <= 12 && r.w > 300, 'collée à gauche'); assert.ok(r.y + r.w <= 680);
  p.E.cote('droite'); r = rectEntite(p); assert.ok(r.x + r.w >= 1280 - 12, 'collée à droite'); assert.ok(r.y >= 0);
});
await t('tous les écrans (téléphone portrait et paysage, tablette, PC, grand écran) × 7 positions : toujours entièrement visible et jamais sur la barre du bas', () => {
  const E = page().E._;
  for (const [w, h, bas] of [[390, 844, 130], [844, 390, 70], [768, 1024, 100], [1024, 768, 100], [1280, 800, 90], [1920, 1080, 90], [360, 640, 130]]) {
    const z = { haut: { g: 50, d: 50 }, bas, gauche: 0, droite: 0, bloc: null };
    for (const pos of [{ mode: 'coin', coin: 'hg' }, { mode: 'coin', coin: 'hd' }, { mode: 'coin', coin: 'bg' }, { mode: 'coin', coin: 'bd' }, { mode: 'centre' }, { mode: 'cote', cote: 'gauche' }, { mode: 'cote', cote: 'droite' }]) {
      const r = E.placement(pos, { w, h }, z, { k: 1 }), nom = w + '×' + h + ' ' + JSON.stringify(pos) + ' → ' + JSON.stringify(r);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.w <= h, 'hors écran : ' + nom);
      assert.ok(r.y + r.w <= h - bas + 1, 'sur la barre du bas : ' + nom);
      if (pos.mode !== 'coin' || pos.coin[0] === 'h') assert.ok(r.y >= 49, 'sous le titre : ' + nom);
      if (pos.mode === 'cote') assert.ok(pos.cote === 'gauche' ? r.x <= 12 : r.x + r.w >= w - 12, 'pas collée au côté : ' + nom);
      if (pos.mode === 'coin') assert.ok(r.w <= 96, 'pas petite : ' + nom);
    }
  }
});
await t('sur téléphone, « grande sur le côté » laisse de la place à la scène (moins des deux tiers de la largeur)', () => {
  const E = page().E._, r = E.placement({ mode: 'cote', cote: 'droite' }, { w: 390, h: 844 }, { haut: { g: 50, d: 50 }, bas: 130, gauche: 0, droite: 0, bloc: null }, { k: 1 });
  assert.ok(r.w <= 390 * .66, 'trop large : ' + r.w);
});
await t('le réglage de taille (70–150 %) agit sur les positions grandes, pas sur la petite', () => {
  const E = page().E._, z = { haut: { g: 50, d: 50 }, bas: 100, gauche: 0, droite: 0, bloc: null }, vp = { w: 1280, h: 900 };
  assert.ok(E.placement({ mode: 'centre' }, vp, z, { k: .7 }).w < E.placement({ mode: 'centre' }, vp, z, { k: 1 }).w);
  assert.equal(E.placement({ mode: 'coin', coin: 'bd' }, vp, z, { k: 1.5 }).w, E.placement({ mode: 'coin', coin: 'bd' }, vp, z, { k: .7 }).w);
});
await t('une carte ou une légende de l’Univers en bas à gauche : l’entité se place au-dessus d’elle', () => {
  const E = page().E._, z = { haut: { g: 50, d: 50 }, bas: 100, gauche: 0, droite: 0, bloc: { x0: 12, x1: 440, haut: 380 } }, vp = { w: 1280, h: 800 };
  const bg = E.placement({ mode: 'coin', coin: 'bg' }, vp, z, { k: 1 }); assert.ok(bg.y + bg.w <= 380 - 6 + 1, 'au-dessus de la carte : ' + JSON.stringify(bg));
  const bd = E.placement({ mode: 'coin', coin: 'bd' }, vp, z, { k: 1 }); assert.ok(bd.y + bd.w > 600, 'en bas à droite : la carte n’y est pas, aucun recul');
  const g = E.placement({ mode: 'cote', cote: 'gauche' }, vp, z, { k: 1 }); assert.ok(g.y + g.w <= 380 - 6 + 1 || g.y + g.w <= 700, 'côté gauche : au-dessus de la carte');
});
await t('plus proche : centre, côtés, angles — d’après l’endroit où on lâche l’entité', () => {
  const E = page().E._;
  assert.deepEqual(J(E.plusProche(.5, .5)), { mode: 'centre' }); assert.deepEqual(J(E.plusProche(.6, .4)), { mode: 'centre' });
  assert.deepEqual(J(E.plusProche(.05, .5)), { mode: 'cote', cote: 'gauche' }); assert.deepEqual(J(E.plusProche(.95, .55)), { mode: 'cote', cote: 'droite' });
  assert.deepEqual(J(E.plusProche(.05, .05)), { mode: 'coin', coin: 'hg' }); assert.deepEqual(J(E.plusProche(.9, .1)), { mode: 'coin', coin: 'hd' });
  assert.deepEqual(J(E.plusProche(.1, .9)), { mode: 'coin', coin: 'bg' }); assert.deepEqual(J(E.plusProche(.8, .95)), { mode: 'coin', coin: 'bd' });
});
await t('sauvegarde entre les sessions : la position choisie revient au rechargement', () => {
  const stockage = {}; let p = page({ stockage }); p.univers(true); p.E.coin('bg');
  assert.ok(JSON.parse(stockage.rayle_entite_pos).coin === 'bg');
  p = page({ stockage }); assert.equal(p.E.valeur(), 'coin:bg', 'accueil, après rechargement'); p.univers(true); assert.equal(p.E.valeur(), 'coin:bg', 'et dans l’Univers : la position choisie vaut partout');
  p.E.cote('gauche'); p = page({ stockage }); assert.equal(p.E.valeur(), 'cote:gauche');
  p.E.reinitialiser(); assert.equal(stockage.rayle_entite_pos, undefined); assert.equal(p.E.valeur(), 'centre');
});
await t('un stockage corrompu ou refusé ne casse rien', () => {
  const p = page({ stockage: { rayle_entite_pos: '{pas du json', rayle_entite_pos_vues: '42' } }); assert.equal(p.E.valeur(), 'centre');
  const q = page({ stockage: { rayle_entite_pos: JSON.stringify({ mode: 'coin', coin: 'zz' }), rayle_entite_pos_vues: JSON.stringify({ mars: { mode: 'nimporte' } }) } }); assert.equal(q.E.valeur(), 'coin:bd', 'angle inconnu → angle valide'); q.univers(true, 'mars'); assert.equal(q.E.etat().memorisee, false);
});
await t('chaque planète mémorise sa propre position (et la sienne seulement)', () => {
  const stockage = {}; const p = page({ stockage });
  p.univers(true, 'mars'); p.E.coin('bg'); assert.equal(p.E.etat().memorisee, false, 'sans mémorisation, c’est la position générale');
  p.E.memoriserVue(true); assert.equal(p.E.etat().memorisee, true); assert.equal(p.E.etat().vue, 'mars');
  p.E.cote('droite'); assert.equal(p.E.valeur(), 'cote:droite', 'on change la position mémorisée de Mars');
  p.univers(true, null); assert.equal(p.E.etat().vue, 'systeme'); assert.equal(p.E.valeur(), 'coin:bg', 'le système solaire garde la position générale (changer Mars ne l’a pas touchée)');
  p.univers(true, 'terre'); assert.equal(p.E.valeur(), 'coin:bg');
  p.univers(true, 'mars'); assert.equal(p.E.valeur(), 'cote:droite', 'retour sur Mars : sa position revient');
  assert.deepEqual(JSON.parse(stockage.rayle_entite_pos_vues), { mars: { mode: 'cote', coin: 'bg', cote: 'droite' } });
  p.E.memoriserVue(false); assert.equal(p.E.valeur(), 'coin:bg', 'oublier la position de Mars : retour à la générale');
  const q = page({ stockage }); q.univers(true, 'mars'); assert.equal(q.E.valeur(), 'coin:bg');
});
await t('quand un panneau s’ouvre : petite dans un angle LIBRE, puis retour à la position choisie', () => {
  const p = page({ largeur: 1280, hauteur: 800 }); p.E.centre();
  p.ouvrirPanneau({ x: 10, y: 60, w: 380, h: 600 });                       // colonne de gauche prise
  assert.ok(p.classes.has('ent-fixe') && p.classes.has('ent-coin'), 'petite, hors de la mise en page');
  const r = rectEntite(p); assert.ok(r.w <= 96); assert.ok(r.x > 400, 'pas sur le panneau de gauche : ' + JSON.stringify(r));
  assert.equal(p.E.valeur(), 'centre', 'la position choisie n’est pas modifiée');
  p.fermerPanneaux(); assert.ok(!p.classes.has('ent-fixe'), 'retour au centre'); assert.ok(p.classes.has('ent-centre'));
  p.E.coin('hg'); p.ouvrirPanneau({ x: 10, y: 60, w: 380, h: 600 }); const r2 = rectEntite(p); assert.ok(r2.x > 400, 'angle préféré occupé → un angle libre : ' + JSON.stringify(r2));
  p.fermerPanneaux(); const r3 = rectEntite(p); assert.ok(r3.x < 100 && r3.y < 100, 'revenue dans son angle');
});
await t('panneaux des deux côtés : un angle libre est cherché, sinon en haut au centre ; jamais sur le panneau', () => {
  const E = page().E._, z = { haut: { g: 50, d: 50 }, bas: 100, gauche: 0, droite: 0, bloc: null }, vp = { w: 1280, h: 800 };
  const gauche = { x: 10, y: 58, w: 390, h: 640 }, droite = { x: 880, y: 58, w: 390, h: 640 };
  const c = E.coinLibre({ mode: 'coin', coin: 'hd' }, vp, z, [gauche, droite]);
  const r = E.rectCoin(c, vp, z); for (const pn of [gauche, droite]) assert.ok(!(r.x < pn.x + pn.w && r.x + r.w > pn.x && r.y < pn.y + pn.h && r.y + r.w > pn.y), c + ' recouvre un panneau');
  assert.equal(E.coinLibre({ mode: 'coin', coin: 'bd' }, vp, z, []), 'bd', 'rien d’ouvert : l’angle préféré');
  assert.equal(E.coinLibre({ mode: 'coin', coin: 'hg' }, vp, z, [{ x: 0, y: 0, w: 1280, h: 800 }]), 'hg', 'tout est pris : l’angle préféré (les panneaux restent au-dessus)');
});
await t('transitions : un changement de position est animé (translation + échelle), pas le premier affichage', () => {
  const p = page(); p.univers(true); const avant = p.anims.length; p.E.coin('bd'); assert.ok(p.anims.length > avant, 'animation lancée');
  const [kf, o] = p.anims.at(-1); assert.match(kf[0].transform, /translate\(.*\) scale\(/); assert.equal(kf[1].transform, 'none'); assert.ok(o.duration >= 300 && o.duration <= 800);
});
await t('glisser l’entité : elle suit le doigt puis se cale sur l’angle le plus proche, sans déclencher le micro', () => {
  const p = page({ largeur: 1000, hauteur: 800 }); p.univers(true); p.E.coin('hd');
  const e = (x, y) => ({ pointerId: 1, pointerType: 'touch', button: 0, clientX: x, clientY: y, stopImmediatePropagation() { this.stoppe = true; }, preventDefault() {} });
  const r0 = rectEntite(p); p.tire('pointerdown', e(r0.x + 10, r0.y + 10));
  p.tire('pointermove', e(300, 300)); assert.ok(p.classes.has('ent-glisse'), 'en cours de glissement'); assert.ok(Math.abs(parseFloat(p.props['--ent-x']) - (300 - 10)) < 1, 'suit le doigt');
  p.tire('pointermove', e(80, 640)); p.tire('pointerup', e(80, 640));
  assert.ok(!p.classes.has('ent-glisse')); assert.equal(p.E.valeur(), 'coin:bg', 'lâchée en bas à gauche → angle bas-gauche');
  const clic = e(0, 0); p.tire('click', clic); assert.ok(clic.stoppe, 'le clic qui suit un glissement est avalé (pas de « toucher pour parler »)');
  p.avancer();
  const clic2 = e(0, 0); p.tire('click', clic2); assert.ok(!clic2.stoppe, 'un vrai toucher ensuite passe');
});
await t('glisser vers le centre ou vers un bord : grande au centre / sur le côté', () => {
  const p = page({ largeur: 1000, hauteur: 800 }); p.univers(true);
  const e = (x, y) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, stopImmediatePropagation() {}, preventDefault() {} });
  const r0 = rectEntite(p), geste = (x, y) => { const a = rectEntite(p), m = a.w / 2; p.tire('pointerdown', e(a.x + m, a.y + m)); p.tire('pointermove', e(x, y)); p.tire('pointerup', e(x, y)); };
  geste(520, 410); assert.equal(p.E.valeur(), 'centre');
  geste(60, 400); assert.equal(p.E.valeur(), 'cote:gauche');
  geste(950, 420); assert.equal(p.E.valeur(), 'cote:droite');
  assert.ok(r0.w < 100);
});
await t('un geste de souris rapide ne perd pas l’entité : le pointeur est capturé dès l’appui', () => {
  const p = page({ largeur: 1000, hauteur: 800 }); p.univers(true); const captures = [];
  p.reactor.setPointerCapture = id => captures.push(id); p.reactor.releasePointerCapture = id => captures.push('rel' + id);
  const e = (x, y) => ({ pointerId: 7, pointerType: 'mouse', button: 0, clientX: x, clientY: y, stopImmediatePropagation() {}, preventDefault() {} });
  const r = rectEntite(p); p.tire('pointerdown', e(r.x + 40, r.y + 40)); assert.deepEqual(J(captures), [7], 'capturé à l’appui, avant tout déplacement');
  p.tire('pointermove', e(100, 600)); p.tire('pointerup', e(100, 600)); assert.ok(captures.includes('rel7'), 'relâché à la fin');
});
await t('un simple toucher (sans glissement) ne déplace rien', () => {
  const p = page(); p.univers(true); p.E.coin('bd'); const avant = p.E.valeur();
  const e = { pointerId: 2, pointerType: 'touch', button: 0, clientX: 900, clientY: 700, stopImmediatePropagation() {}, preventDefault() {} };
  p.tire('pointerdown', e); p.tire('pointermove', Object.assign({}, e, { clientX: 903 })); p.tire('pointerup', e); assert.equal(p.E.valeur(), avant); assert.ok(!p.classes.has('ent-glisse'));
});
await t('Raylé rangée en bulle ou discrète : la position n’intervient pas (leurs règles gardent la main)', () => {
  const p = page(); p.univers(true); assert.ok(p.classes.has('ent-fixe'));
  p.classes.add('rayle-rangee'); p.B.emit('rayle:rangee', { actif: true }); assert.ok(!p.classes.has('ent-fixe') && p.props['--ent-x'] === undefined);
  p.classes.delete('rayle-rangee'); p.B.emit('rayle:rangee', { actif: false }); assert.ok(p.classes.has('ent-fixe'), 'revenue à sa place quand on la rouvre');
  p.classes.add('rayle-discrete'); p.B.emit('rayle:discrete', { actif: true }); assert.ok(!p.classes.has('ent-fixe'));
});
await t('terminal, anatomie : l’entité n’est pas touchée (autre vue)', () => {
  const p = page(); p.univers(true); p.B.fournir('vue', () => 'terminal'); p.B.emit('vue:changee', { vue: 'terminal' }); assert.ok(!p.classes.has('ent-fixe'));
  p.B.fournir('vue', () => 'rayle'); p.B.emit('vue:changee', { vue: 'rayle' }); assert.ok(p.classes.has('ent-fixe'));
});
await t('sur le côté dans l’Univers : la scène est décalée pour occuper le reste ; ailleurs, aucun décalage', () => {
  const p = page({ largeur: 1280, hauteur: 800 }); p.univers(true);
  p.E.cote('gauche'); let d = p.decalages.at(-1); assert.ok(d > 100, 'scène poussée vers la droite : ' + d);
  p.E.cote('droite'); d = p.decalages.at(-1); assert.ok(d < -100, 'scène poussée vers la gauche : ' + d);
  p.E.coin('hd'); assert.equal(p.decalages.at(-1), 0); p.E.centre(); assert.equal(p.decalages.at(-1), 0);
  p.E.cote('gauche'); p.ouvrirPanneau({ x: 10, y: 60, w: 380, h: 300 }); assert.equal(p.decalages.at(-1), 0, 'panneau ouvert : entité petite, scène recentrée');
  p.fermerPanneaux(); assert.ok(p.decalages.at(-1) > 100);
});
await t('bus : « entite:position » à chaque changement, état partagé pour l’IA', () => {
  const p = page(); const vus = []; p.B.on('entite:position', d => vus.push(d)); p.E.coin('hg');
  assert.ok(vus.length >= 1); const d = vus.at(-1); assert.equal(d.valeur, 'coin:hg'); assert.equal(d.mode, 'coin'); assert.equal(p.B.etat('entite').coin, 'hg');
});
await t('le script ne dépend d’aucune bibliothèque et passe en strict', () => {
  const src = lire('js/rayle/position-entite.js'); assert.match(src, /^"use strict";/); assert.ok(!/\bimport\b|require\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
});
console.log(ok + ' tests réussis');
