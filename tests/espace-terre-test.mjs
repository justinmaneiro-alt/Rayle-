// Terre vivante : horloge virtuelle, rotation à la main, lieux (villes, pays, monuments), phrases (points, trajets, frontières, temps, trafic, actualités), trafic simulé, textures 8k, palier Ultra.
//   node tests/espace-terre-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const racine = new URL('../', import.meta.url), lire = f => fs.readFileSync(new URL(f, racine), 'utf8');
const ctx = { console, setTimeout, clearTimeout, Math, Date, Intl, localStorage: { getItem: () => null, setItem() { } } };
ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/rayle/pays-donnees.js', 'ui/astro.js', 'ui/espace-lieux.js', 'ui/espace.js', 'ui/espace-pays-centres.js', 'ui/espace-temps.js', 'ui/espace-terre-donnees.js', 'ui/espace-terre.js']) vm.runInContext(lire(f), ctx, { filename: f });
const UI = ctx.RayleUI, T = UI.espaceTerre, H = UI.horloge, D = UI.espaceTerreDonnees;

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 16).join('\n    ')); process.exitCode = 1; } };
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' : ' + a + ' vs ' + b + ' (±' + tol + ')');
const a = q => JSON.parse(JSON.stringify(T.analyser(q, {}) || {}));      // JSON : le contexte vm a ses propres Array

await t('horloge : réelle par défaut, accélérée, figée, décalée, retour au réel ; bornée à ±200 ans', () => {
  let maintenant = 1e12; H._source(() => maintenant);
  assert.equal(H.maintenant(), 1e12); assert.ok(H.estReel());
  H.regler(3600); maintenant += 1000; assert.equal(H.maintenant(), 1e12 + 3600e3, 'une seconde réelle = une heure'); assert.equal(H.nomEchelle(), '1 heure par seconde'); assert.ok(!H.estReel());
  H.pause(true); const fige = H.maintenant(); maintenant += 5000; assert.equal(H.maintenant(), fige); assert.equal(H.nomEchelle(), 'temps figé');
  H.pause(false); maintenant += 1000; assert.equal(H.maintenant(), fige + 3600e3);
  H.retourReel(); assert.equal(H.maintenant(), maintenant); assert.ok(H.estReel());
  H.decaler(-6 * 3600e3); assert.equal(H.maintenant(), maintenant - 6 * 3600e3); assert.ok(!H.estReel());
  H.retourReel(); H.regler(1e7); maintenant += 365 * 86400e3 * 1000; assert.ok(Math.abs(H.maintenant() - maintenant) <= 200 * 365.25 * 86400e3 + 1, 'borné à ±200 ans');
  assert.equal(H.regler(0), false); assert.equal(H.regler('x'), false);
  assert.match(H.formater(Date.UTC(2026, 9, 14, 12, 34)), /^14 oct\. 2026 · 12:34 UTC$/);
  H._source(() => Date.now());
});
await t('rotation à la main : le geste tourne, l’élan retombe, zéro remet l’orientation réelle', () => {
  const M = UI.terreMain; M.zero(); assert.equal(M.angle(), 0); M.glisser(.3); assert.ok(Math.abs(M.angle() - .3) < 1e-9);
  const v = M.angle(); M.maj(.016); assert.equal(M.angle(), v, 'juste après le geste, pas d’élan encore');
  M.lancer(.05); const a1 = M.maj(.5), a2 = M.maj(.5); assert.ok(a2 > a1 && a1 > v, 'la Terre continue de tourner'); for (let i = 0; i < 400; i++) M.maj(.1); const fin = M.angle(); M.maj(1); assert.equal(M.angle(), fin, 'l’élan s’éteint');
  assert.equal(M.activer(true), true); assert.equal(M.activer(false), false); M.zero(); assert.equal(M.angle(), 0);
});
await t('centres des pays : 177 pays avec centre plausible ; la France et le Japon sont au bon endroit', () => {
  const c = UI.espacePaysCentres; assert.ok(c.length >= 170); for (const [num, lat, lon, e] of c) { assert.ok(/^\d{3}$/.test(num) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && e > 0, num); }
  const fr = c.find(x => x[0] === '250'); proche(fr[1], 46.7, 3, 'France lat'); proche(fr[2], 1.8, 4, 'France lon');
  const ru = c.find(x => x[0] === '643'); assert.ok(ru[2] > 60 && ru[2] < 150, 'Russie : longitude ' + ru[2]);
  const names = new Set((ctx.RaylePays || []).map(l => l[0])); for (const [num] of c) assert.ok(names.has(num), 'pays inconnu de RaylePays : ' + num);
});
await t('lieux : ville, capitale, monument, pays (nom français, alias, articles) → coordonnées', () => {
  const l = x => T.lieu(x);
  proche(l('Lyon').lat, 45.76, .05); proche(l('Tokyo').lon, 139.69, .3); assert.equal(l('Tokyo').type, 'capitale'); assert.equal(l('Lyon').type, 'ville'); assert.equal(l('Lyon').pays, 'France');
  assert.equal(l('la tour Eiffel').type, 'monument'); assert.equal(l('le Japon').type, 'pays'); assert.equal(l('l’Allemagne').nom, 'Allemagne'); assert.equal(l('Côte d’Ivoire').type, 'pays');
  assert.equal(l('États-Unis').type, 'pays'); assert.match(l('usa').nom, /^États-Unis/); assert.equal(l('royaume uni').type, 'pays'); assert.equal(l('Sri Lanka').type, 'pays'); assert.equal(l('Paris sur le globe').nom, 'Paris');
  assert.equal(l('zzzzville'), null); assert.ok(l('Japon').zoom >= 1.35 && l('Russie').zoom <= 2.5 && l('Luxembourg').zoom >= 1.35);
  assert.equal(T.ciblePour(l('Lyon')).split(',').length, 4);
  const geo = UI.espace.geoDe(T.ciblePour(l('Lyon'))); assert.ok(geo && geo.zoom === 1.3 && /Lyon/.test(geo.nom), 'geoDe lit le zoom');
  assert.equal(UI.espace.geoDe('geo:35.68,139.69,Tokyo').zoom, 1.5, 'ancien format conservé');
});
await t('phrases : épingles (une, plusieurs, couleur), trajets, frontières, effacer, zoom, sans voler les ordres existants', () => {
  const e = a('place un point à Tokyo'); assert.deepEqual([e.action, e.lieux], ['epingle', ['tokyo']]);
  assert.deepEqual(a('place un point rouge à Tokyo').couleur, 'rouge'); assert.deepEqual(a('pose une épingle bleue sur Lyon').lieux, ['lyon']); assert.equal(a('mets un marqueur à Paris et un à Tokyo').lieux.length, 2);
  assert.deepEqual(a('marque Tokyo').lieux, ['tokyo']); assert.equal(a('place un point à la tour Eiffel sur le globe').lieux[0], 'la tour eiffel');
  const tr = a('trace un trajet de Paris à Tokyo'); assert.deepEqual([tr.action, tr.de, tr.vers], ['trajet', 'paris', 'tokyo']); assert.equal(a('relie Paris et Tokyo').action, 'trajet'); assert.equal(a('dessine une route de Lyon à Marseille').vers, 'marseille');
  assert.deepEqual([a('trace les frontières du Japon').action, a('trace les frontières du Japon').lieu], ['frontieres', 'japon']); assert.equal(a('montre les contours de la France').lieu, 'la france');
  assert.equal(a('efface les points').quoi, 'epingles'); assert.equal(a('efface tout sur la Terre').quoi, 'tout'); assert.equal(a('supprime les trajets').quoi, 'trajets'); assert.equal(a('efface les frontières').quoi, 'frontieres'); assert.equal(a('enlève tous les marqueurs').quoi, 'epingles');
  assert.deepEqual([a('zoome sur Tokyo').action, a('zoome sur Tokyo').lieu], ['zoom-lieu', 'tokyo']); assert.equal(a('emmène-moi à Lyon sur le globe').action, 'zoom-lieu'); assert.equal(T.analyser('emmène-moi à Lyon', {}), null, 'sans « sur le globe », les cartes gardent la main'); assert.equal(T.analyser('va à Paris', {}), null); assert.equal(a('survole le Japon').action, 'zoom-lieu');
  for (const q of ['montre-moi Mars', 'montre-moi le Japon', 'zoome dessus', 'recule', 'reviens sur la Terre', 'active les planètes', 'échelle réaliste', 'garde cette vue', 'quelle heure est-il', 'efface le graphique', 'place un ordre à 70000', 'trace une ligne de support']) assert.equal(T.analyser(q, {}), null, q);
});
await t('phrases : temps (accélérer, présélections, figer, reprendre, réel, décalage), rotation, trafic, villes, actualités', () => {
  assert.deepEqual([a('accélère le temps').action, a('accélère le temps').mode], ['temps', 'plus']); assert.equal(a('accélère le temps ×3600').k, 3600); assert.equal(a('mets le temps à x600').k, 600);
  assert.equal(a('une heure par seconde').k, 3600); assert.equal(a('un jour par seconde').k, 86400); assert.equal(a('dix minutes par seconde').k, 600);
  assert.equal(a('fige le temps').mode, 'pause'); assert.equal(a('reprends le temps').mode, 'reprise'); assert.equal(a('remets l’heure réelle').mode, 'reel'); assert.equal(a('ralentis le temps').mode, 'moins');
  const d = a('avance de 3 heures'); assert.equal(a('avance le temps de 3 heures').ms, 3 * 3600e3); assert.equal(a('recule le temps de 2 jours').ms, -2 * 86400e3); void d;
  assert.deepEqual([a('fais tourner la Terre à la main').action, a('fais tourner la Terre à la main').oui], ['main', true]); assert.equal(a('arrête la rotation à la main').oui, false); assert.equal(a('remets la Terre en place').action, 'zero'); assert.equal(a('tourne la Terre vers l’est').sens, 1);
  assert.deepEqual([a('affiche les vols').cle, a('affiche les vols').oui], ['vols', true]); assert.equal(a('masque les bateaux').oui, false); assert.equal(a('cache les avions').cle, 'vols'); assert.equal(a('affiche le trafic').cle, 'trafic');
  assert.deepEqual([a('masque les lumières des villes').cle, a('masque les lumières des villes').oui], ['villes', false]); assert.equal(a('affiche les villes lumineuses').oui, true);
  assert.equal(a('affiche les vols en temps réel').action, 'vols-reels'); assert.equal(a('remets les vols simulés').oui, false);
  assert.deepEqual([a('montre les actualités du Japon sur le globe').action, a('montre les actualités du Japon sur le globe').lieu], ['actus', 'japon']); assert.equal(T.analyser('montre les actualités', {}), null, 'sans contexte : l’agent d’actualités garde la main');
  assert.equal(T.analyser('quelles sont les actualités', {}), null); assert.equal(T.analyser('quel temps fait-il', {}), null); assert.equal(T.analyser('combien de temps dure un jour sur Mars', {}), null);
  assert.equal(T.analyser('montre les actualités de ce pays', { lieuAffiche: true }).action, 'actus');
});
await t('exécution : épingles, trajet, frontières, effacer, temps, couches ; messages honnêtes quand le lieu est inconnu', () => {
  T.effacer('tout'); const appels = []; const deps = { vers: c => appels.push(c), scene: () => ({ majObjets() { appels.push('objets'); }, majCouches() { appels.push('couches'); } }) };
  let r = T.executer(a('place un point rouge à Tokyo'), deps); assert.ok(r.ok && /Tokyo/.test(r.texte) && T.etat.epingles.length === 1 && T.etat.epingles[0].couleur === 'rouge'); assert.ok(appels.some(x => /^geo:35\.6.*Tokyo/.test(x)), appels.join(' | '));
  r = T.executer(a('place un point à Tokyo'), deps); assert.equal(T.etat.epingles.length, 1, 'pas de doublon au même endroit');
  r = T.executer(a('place un point à Zzzville'), deps); assert.ok(!r.ok && /Je ne connais pas/.test(r.texte) && /Zzzville|zzzville/i.test(r.texte));
  r = T.executer(a('place un point à Lyon et Paris'), deps); assert.equal(T.etat.epingles.length, 3);
  r = T.executer(a('trace un trajet de Paris à Tokyo'), deps); assert.ok(r.ok && /grand cercle/.test(r.texte) && T.etat.traces.length === 1); const km = +r.texte.match(/([\d ]+) kilomètres/)[1].replace(/ /g, ''); proche(km, 9710, 200, 'Paris–Tokyo');
  r = T.executer(a('trace un trajet de Paris à Zzzville'), deps); assert.ok(!r.ok);
  r = T.executer(a('trace les frontières du Japon'), deps); assert.ok(r.ok && /1:110/.test(r.texte) && T.etat.traces.some(x => x.type === 'frontieres' && x.num === '392'));
  r = T.executer(a('trace les frontières de Lyon'), deps); assert.ok(!r.ok && /pays/.test(r.texte)); r = T.executer(a('trace les frontières du Japon'), deps); assert.match(r.texte, /déjà/);
  r = T.executer(a('efface les points'), deps); assert.ok(r.ok && /point/.test(r.texte) && T.etat.epingles.length === 0 && T.etat.traces.length === 2); r = T.executer(a('efface tout sur la Terre'), deps); assert.equal(T.etat.traces.length, 0);
  r = T.executer(a('efface les points'), deps); assert.ok(/rien à effacer/.test(r.texte));
  for (let i = 0; i < T.MAX_EPINGLES + 5; i++) T.ajouterEpingle({ nom: 'x' + i, lat: i * .5 - 20, lon: i }, null); assert.equal(T.etat.epingles.length, T.MAX_EPINGLES, 'limite d’épingles'); T.effacer('tout');
  H._source(() => Date.now()); r = T.executer(a('accélère le temps ×60'), deps); assert.ok(r.ok && H.echelle() === 60 && /Le temps s’écoule/.test(r.texte)); r = T.executer(a('fige le temps'), deps); assert.ok(H.enPause()); T.executer(a('remets l’heure réelle'), deps); assert.ok(H.estReel());
  r = T.executer(a('masque les vols'), deps); assert.equal(T.etat.couches.vols, false); T.executer(a('affiche les vols'), deps); assert.equal(T.etat.couches.vols, true);
  r = T.executer(a('montre les actualités du Japon sur le globe'), { vers() { }, scene: () => null }); assert.ok(!r.ok && /pas accès à une source/.test(r.texte), 'sans Worker : « je n’ai pas de source », rien d’inventé');
  let demande = null; r = T.executer(a('montre les actualités du Japon sur le globe'), { vers() { }, scene: () => null, actus: (nom, l) => { demande = [nom, l.type]; } }); assert.ok(r.ok && demande[0] === 'Japon' && demande[1] === 'pays');
});
await t('trafic : routes et voies valides, positions déterministes, aller-retour sans saut, mouvement accéléré visible, réalité sans accélération', () => {
  const air = new Set(D.AEROPORTS.map(x => x[0])); for (const [x, y, p] of D.ROUTES_AERIENNES) { assert.ok(air.has(x) && air.has(y) && x !== y && p >= 1 && p <= 5, x + '-' + y); }
  assert.ok(T.routes().length >= 200 && D.AEROPORTS.length >= 60 && D.VOIES_MARITIMES.length >= 10);
  for (const [lat, lon] of D.AEROPORTS.map(x => [x[2], x[3]])) assert.ok(Math.abs(lat) <= 90 && Math.abs(lon) <= 180);
  const A1 = T.creerAvions(500, 7), A2 = T.creerAvions(500, 7); assert.deepEqual(A1.slice(0, 20), A2.slice(0, 20)); assert.notDeepEqual(T.creerAvions(500, 8).slice(0, 5), A1.slice(0, 5));
  const avion = A1[0], T0 = Date.UTC(2026, 9, 14, 12); const p0 = T.positionAvion(avion, T0, 'pedagogique'), p1 = T.positionAvion(avion, T0 + 1000, 'pedagogique');
  assert.ok(Math.abs(Math.hypot(...p0.v) - 1) < 1e-9, 'sur la sphère'); const ang = Math.acos(Math.min(1, p0.v[0] * p1.v[0] + p0.v[1] * p1.v[1] + p0.v[2] * p1.v[2])) * 6371; assert.ok(ang > 20 && ang < 120, 'un avion parcourt ' + ang.toFixed(0) + ' km par seconde en mode pédagogique');
  const r0 = T.positionAvion(avion, T0, 'realiste'), r1 = T.positionAvion(avion, T0 + 1000, 'realiste'); const dr = Math.acos(Math.min(1, r0.v[0] * r1.v[0] + r0.v[1] * r1.v[1] + r0.v[2] * r1.v[2])) * 6371; assert.ok(dr < 1, 'temps réel : < 1 km par seconde (' + dr.toFixed(3) + ')');
  let saut = 0, prec = null; for (let s = 0; s < 4000; s += 1) { const p = T.positionAvion(avion, T0 + s * 1000, 'pedagogique').v; if (prec) saut = Math.max(saut, Math.acos(Math.min(1, p[0] * prec[0] + p[1] * prec[1] + p[2] * prec[2])) * 6371); prec = p; } assert.ok(saut < 150, 'pas de téléportation : saut max ' + saut.toFixed(0) + ' km');
  for (const w of T.voies()) { assert.ok(w.poly.length >= 5 && w.km > 500, w.id); for (const p of w.poly) assert.ok(Math.abs(Math.hypot(...p) - 1) < 1e-6); for (let i = 1; i < w.poly.length; i++) assert.ok(Math.acos(Math.min(1, w.poly[i][0] * w.poly[i - 1][0] + w.poly[i][1] * w.poly[i - 1][1] + w.poly[i][2] * w.poly[i - 1][2])) * 6371 < 400, w.id + ' : segment trop long'); }
  const bat = T.creerNavires(100, 3); for (let s = 0; s < 20; s++) { const p = T.positionNavire(bat[s], T0 + s * 3.7e6, 'pedagogique'); assert.ok(Math.abs(Math.hypot(...p.v) - 1) < 1e-6 && p.alt > 1); }
  const L = vers => T.vers(vers); const suez = T.voies().find(w => w.id === 'mediterranee-suez'); const p = suez.poly[Math.floor(suez.poly.length / 2)], g = L(p); assert.ok(Math.abs(g.lat) < 40 && g.lon > -10 && g.lon < 70, 'la voie Suez traverse bien la région attendue');
});
await t('textures et Ultra : fichiers 8k présents et légers, réglage Ultra manuel seulement, textures 8k utilisées par la scène Univers en qualité Haute', () => {
  for (const f of ['terre-jour-8192.jpg', 'terre-nuit-8192.jpg']) { const b = fs.readFileSync(new URL('ui/assets/' + f, racine)); assert.equal(b[0], 0xff); assert.equal(b[1], 0xd8); let w = 0, h = 0; for (let i = 2; i < b.length;) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xc3) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; } i += 2 + b.readUInt16BE(i + 2); } assert.deepEqual([w, h], [8192, 4096], f); assert.ok(b.length < 6e6, f + ' : ' + b.length); }
  const settings = lire('ui/settings.js'), glo = lire('ui/fond-globe.js'), bg = lire('ui/background.js');
  assert.match(settings, /ANIMS=\{max:'Max',auto:'Auto',eco:'Éco',ultra:'Ultra'\}/); assert.ok(!/palierAuto\s*=\s*[^;]*ultra/.test(settings), 'le palier automatique ne choisit jamais Ultra');
  assert.match(settings, /function avertirUltra/); assert.match(bg, /UI\.changer\('anim','max'\)/, 'repli automatique si trop lent'); assert.match(glo, /terre-jour-'\+px/); assert.match(glo, /textures 8k indisponibles/); assert.match(lire('js/univers/espace/terre.js'), /8192/, 'la scène Univers charge les textures 8k en qualité Haute');
  const c = new Function('window', lire('ui/themes.js') + ';' + lire('ui/settings.js') + ';return window.RayleUI;');
  void c;
});
await t('credits : textures 8k, contours, données du trafic et sources sont documentés', () => {
  const cr = lire('CREDITS.md'); for (const m of ['terre-jour-8192', 'terre-nuit-8192', 'Blue Marble', 'Black Marble', 'world-atlas', 'OpenSky']) assert.ok(cr.includes(m), 'CREDITS.md ne mentionne pas ' + m);
});

console.log(ok + ' tests réussis');
