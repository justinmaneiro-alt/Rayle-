// Moteur d'ambiance (ui/astro.js + ui/ambiance.js) : moment, soleil, mapping du thème, commandes vocales, cache et pannes de la météo.   node tests/ambiance-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ctx = { console, setTimeout, clearTimeout, Math, Date };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['../ui/astro.js', '../ui/ambiance.js']) vm.runInContext(fs.readFileSync(new URL(f, import.meta.url), 'utf8'), ctx);
const UI = ctx.RayleUI, A = UI.ambiance, astro = UI.astro;

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };
const CASTRES = { lat: 43.6063, lon: 2.2411 };
const utc = (a, m, j, h, mi = 0) => Date.UTC(a, m - 1, j, h, mi);

// moteur isolé : stockage mémoire, horloge, réseau et thème simulés
function moteur(o = {}) {
  const mem = new Map(Object.entries(o.stock || {}));
  const evts = [], themes = [];
  let now = o.now ?? utc(2026, 6, 21, 10);
  const m = A.creer({
    maintenant: () => now,
    stockage: { get: k => mem.has(k) ? mem.get(k) : null, set: (k, v) => { if (v == null) mem.delete(k); else mem.set(k, v); } },
    bus: { emit: (n, d) => evts.push([n, d]), fournir() {}, on() { return () => {}; }, demander() {} },
    fetch: o.fetch || null,
    themeActuel: () => themes.length ? themes[themes.length - 1] : 'originel',
    changerTheme: id => themes.push(id),
    themeManuelDepuis: undefined
  });
  return { m, mem, evts, themes, avance: ms => { now += ms; }, set: v => { now = v; }, now: () => now };
}
const reponse = (j, ok = true, status = 200) => ({ ok, status, json: async () => j });
const meteoJSON = (code, kmh = 10, dir = 270, temp = 14) => ({ current: { temperature_2m: temp, weather_code: code, wind_speed_10m: kmh, wind_direction_10m: dir, cloud_cover: 50 } });

await t('soleil : point subsolaire inchangé (formule déplacée de fond-globe.js, pas dupliquée)', () => {
  const s = astro.soleil(utc(2026, 6, 21, 12));
  assert.ok(Math.abs(s.lat - 23.4) < .6, 'déclinaison au solstice : ' + s.lat);
  assert.ok(Math.abs(s.lon) < 4, 'midi UTC : le soleil est près de Greenwich : ' + s.lon);
  const src = fs.readFileSync(new URL('../ui/fond-globe.js', import.meta.url), 'utf8');
  assert.ok(/UI\.astro\.soleil/.test(src) && !/357\.529/.test(src), 'fond-globe.js utilise ui/astro.js');
});
await t('hauteur du soleil à Castres : midi d’été haut, minuit sous l’horizon, équinoxe cohérent', () => {
  const midi = astro.position(utc(2026, 6, 21, 11, 10), CASTRES.lat, CASTRES.lon);   // midi solaire ≈ 11 h 50 UTC… ici 13 h 10 locale
  assert.ok(midi.altitude > 60 && midi.altitude < 71, 'altitude de midi : ' + midi.altitude);
  assert.ok(Math.abs(midi.azimut - 180) < 30, 'au sud : ' + midi.azimut);
  const minuit = astro.position(utc(2026, 6, 21, 23, 0), CASTRES.lat, CASTRES.lon);
  assert.ok(minuit.altitude < -10, 'minuit : ' + minuit.altitude);
  const eq = astro.position(utc(2026, 3, 20, 11, 50), CASTRES.lat, CASTRES.lon);
  assert.ok(Math.abs(eq.altitude - (90 - CASTRES.lat)) < 3, 'équinoxe : ' + eq.altitude);
});
await t('moment : aube le matin, jour, crépuscule le soir, nuit — en hiver comme en été', () => {
  const m = ts => { const p = astro.position(ts, CASTRES.lat, CASTRES.lon); return astro.moment(p.altitude, p.matin); };
  assert.equal(m(utc(2026, 6, 21, 10)), 'jour');
  assert.equal(m(utc(2026, 6, 21, 0, 30)), 'nuit');
  assert.equal(m(utc(2026, 12, 21, 12, 0)), 'jour');
  assert.equal(m(utc(2026, 12, 21, 18, 30)), 'nuit');
  const suite = []; for (let h = 3; h <= 8; h += .25) suite.push(m(utc(2026, 6, 21, Math.floor(h), (h % 1) * 60)));
  assert.equal(suite[0], 'nuit'); assert.ok(suite.includes('aube'), 'aube vue le matin'); assert.equal(suite.at(-1), 'jour');
  assert.ok(!suite.includes('crepuscule'), 'pas de crépuscule le matin');
  const soir = []; for (let h = 18; h <= 23; h += .25) soir.push(m(utc(2026, 6, 21, Math.floor(h), (h % 1) * 60)));
  assert.ok(soir.includes('crepuscule') && !soir.includes('aube'), 'crépuscule le soir'); assert.equal(soir.at(-1), 'nuit');
  assert.equal(astro.moment(3, true), 'aube'); assert.equal(astro.moment(3, false), 'crepuscule'); assert.equal(astro.moment(-10, true), 'nuit'); assert.equal(astro.moment(20, false), 'jour');
});
await t('luminosité progressive et lune : cycle de 29,5 jours', () => {
  assert.equal(astro.luminosite(-30), 0); assert.equal(astro.luminosite(40), 1);
  const a = astro.luminosite(-2), b = astro.luminosite(2); assert.ok(0 < a && a < b && b < 1);
  const nouvelle = astro.lune(utc(2000, 1, 6, 18, 14)), pleine = astro.lune(utc(2000, 1, 6, 18, 14) + 14.765 * 864e5);
  assert.ok(nouvelle.eclairee < .001 && pleine.eclairee > .999, 'nouvelle / pleine');
  assert.ok(Math.abs(astro.lune(utc(2026, 10, 10, 16)).eclairee) < .02, 'nouvelle lune du 10 octobre 2026');
});
await t('codes météo Open-Meteo → météo visuelle', () => {
  const c = n => A.depuisWMO(n);
  assert.equal(c(0).meteo, 'clair'); assert.equal(c(3).meteo, 'nuageux'); assert.equal(c(45).meteo, 'brouillard'); assert.equal(c(53).meteo, 'bruine');
  assert.equal(c(63).meteo, 'pluie'); assert.equal(c(81).meteo, 'pluie'); assert.equal(c(75).meteo, 'neige'); assert.equal(c(86).meteo, 'neige'); assert.equal(c(95).meteo, 'orage'); assert.equal(c(99).intensite, 1);
  assert.ok(c(65).intensite > c(61).intensite, 'plus fort = plus intense'); assert.equal(c(42).meteo, 'clair', 'code inconnu → ciel clair');
});
await t('thème automatique : table par défaut (matin dégagé → Ambre, nuit → Nébuleuse, orage → Arc…) et priorité de la météo', () => {
  const e = (moment, meteo = 'clair', intensite = 0) => ({ moment, meteo, intensite });
  const map = A.MAPPING_DEFAUT;
  assert.equal(map[A.themeCle(e('aube'))], 'ambre'); assert.equal(map[A.themeCle(e('nuit'))], 'nebuleuse'); assert.equal(map[A.themeCle(e('crepuscule'))], 'originel');
  assert.equal(map[A.themeCle(e('jour'))], 'arc'); assert.equal(map[A.themeCle(e('nuit', 'orage', .8))], 'arc');
  assert.equal(A.themeCle(e('jour', 'pluie', .6)), 'pluie'); assert.equal(A.themeCle(e('jour', 'bruine', .4)), 'pluie'); assert.equal(A.themeCle(e('nuit', 'neige', .5)), 'neige');
  assert.equal(A.themeCle(e('jour', 'pluie', .1)), 'jour', 'une pluie à peine marquée ne change pas le thème');
  assert.equal(A.themeCle(e('jour', 'nuageux', .9)), 'jour');
  assert.ok(Object.values(map).every(id => A.THEMES_IDS.includes(id)), 'tous les thèmes existent');
});
await t('thème automatique : s’applique, mais le choix manuel reste prioritaire N heures, puis l’auto reprend', async () => {
  const x = moteur({ now: utc(2026, 6, 21, 0, 30) });                          // nuit à Castres
  assert.equal(x.m.etat().moment, 'nuit');
  x.m.appliquerThemeAuto(); assert.deepEqual(x.themes, ['nebuleuse']);
  x.mem.set('rayle_ui_theme_manuel', String(x.now()));                          // l'utilisateur vient de choisir un thème
  x.set(utc(2026, 6, 21, 10)); x.m.recalculer();
  x.mem.set('rayle_ui_theme_manuel', String(x.now() - 3600000));               // choisi il y a 1 h
  assert.equal(x.m.appliquerThemeAuto(), null, 'pas de changement pendant la période de priorité');
  assert.deepEqual(x.themes, ['nebuleuse']);
  x.mem.set('rayle_ui_theme_manuel', String(utc(2026, 6, 21, 10) - 4 * 3600000)); // il y a 4 h (réglage : 3 h)
  x.m.appliquerThemeAuto(); assert.deepEqual(x.themes, ['nebuleuse', 'arc']);
  x.m.regler('themeHeures', 6); x.set(utc(2026, 6, 22, 0, 30)); x.mem.set('rayle_ui_theme_manuel', String(x.now() - 4 * 3600000)); x.m.recalculer();
  assert.equal(x.m.appliquerThemeAuto(), null, 'avec 6 h de priorité, 4 h ne suffisent pas');
});
await t('thème automatique coupé : rien ne change ; mapping modifiable', () => {
  const x = moteur({ now: utc(2026, 6, 21, 0, 30) });
  x.m.regler('themeAuto', false); assert.equal(x.m.appliquerThemeAuto(), null); assert.deepEqual(x.themes, []);
  x.m.regler('themeAuto', true); x.m.regler('mapping', { nuit: 'rouge' }); assert.equal(x.themes.at(-1), 'rouge');
  const y = moteur({ now: utc(2026, 6, 21, 0, 30) }); y.m.regler('mode', 'off'); assert.equal(y.m.appliquerThemeAuto(), null, 'mode off : aucun thème automatique');
});
await t('mode manuel : force le moment et la météo, durée facultative, puis retour automatique', () => {
  const x = moteur({ now: utc(2026, 6, 21, 10) });
  assert.equal(x.m.etat().moment, 'jour');
  x.m.forcer({ moment: 'nuit', meteo: 'pluie', intensite: .7 }, { dureeMs: 10 * 60000 });
  let e = x.m.etat(); assert.equal(e.moment, 'nuit'); assert.equal(e.meteo, 'pluie'); assert.equal(e.source, 'manuel'); assert.equal(e.mode, 'manuel'); assert.ok(e.soleil.altitude < 0);
  x.avance(9 * 60000); assert.equal(x.m.recalculer().moment, 'nuit');
  x.avance(2 * 60000); e = x.m.recalculer(); assert.equal(e.moment, 'jour'); assert.equal(e.source, 'auto'); assert.equal(e.mode, 'auto');
  x.m.forcer({ meteo: 'neige' }); x.m.forcer({ vent: .8 }); e = x.m.etat();
  assert.equal(e.meteo, 'neige'); assert.equal(e.vent.vitesse, .8, 'les réglages forcés se cumulent');
  x.m.auto(); assert.equal(x.m.etat().source, 'auto'); assert.equal(x.m.etat().meteo, 'clair');
});
await t('événements « ambiance » : un seul par vrai changement, pas de bruit', () => {
  const x = moteur({ now: utc(2026, 6, 21, 10) });
  x.m.recalculer(true); x.evts.length = 0;
  x.m.recalculer(); x.m.recalculer(); assert.equal(x.evts.length, 0, 'rien n’a changé');
  x.m.forcer({ meteo: 'orage', intensite: .8 }); assert.equal(x.evts.filter(e => e[0] === 'ambiance').length, 1);
  assert.equal(x.evts.at(-1)[1].meteo, 'orage');
});
await t('transitions douces : les valeurs continues rejoignent la cible en plusieurs secondes, sans saut', () => {
  const x = moteur({ now: utc(2026, 6, 21, 10) });
  x.m.recalculer(true); x.m.avancer(.016);
  x.m.forcer({ meteo: 'pluie', intensite: .9 });
  const L = x.m.lisse(); assert.ok(L.pluie < .05, 'pas de saut à l’instant du changement');
  x.m.avancer(.1); assert.ok(L.pluie > 0 && L.pluie < .1, 'monte progressivement');
  let t = 0; while (t < 4) { x.m.avancer(.05); t += .05; } assert.ok(L.pluie > .3 && L.pluie < .85, 'à 4 s : en cours de route (' + L.pluie.toFixed(2) + ')');
  while (t < 20) { x.m.avancer(.05); t += .05; } assert.ok(Math.abs(L.pluie - .9) < .03, 'à 20 s : arrivé');
  x.m.forcer({ moment: 'nuit' }); x.m.avancer(.05); assert.ok(L.jour > .8, 'le jour ne s’éteint pas d’un coup');
  const y = moteur({ now: utc(2026, 6, 21, 10) }); y.m.regler('mode', 'off'); y.m.avancer(.1); assert.equal(y.m.vent(), 0);
});
await t('météo réelle : lue, mise en cache 15 min (un seul appel), puis rafraîchie', async () => {
  let n = 0; const urls = [];
  const x = moteur({ fetch: async u => { n++; urls.push(u); return reponse(meteoJSON(63, 24, 250, 11.4)); } });
  await x.m.chargerMeteo(); const e = x.m.etat();
  assert.equal(e.meteo, 'pluie'); assert.equal(e.vent.kmh, 24); assert.equal(e.vent.direction, 250); assert.equal(e.temperature, 11.4);
  assert.ok(/api\.open-meteo\.com/.test(urls[0]) && /latitude=43\.61/.test(urls[0]) && /longitude=2\.24/.test(urls[0]), 'Castres par défaut, coordonnées arrondies : ' + urls[0]);
  assert.ok(!/key|apikey|token/i.test(urls[0]), 'aucune clé');
  await x.m.chargerMeteo(); await x.m.chargerMeteo(); assert.equal(n, 1, 'cache de 15 min');
  x.avance(14 * 60000); await x.m.chargerMeteo(); assert.equal(n, 1);
  x.avance(2 * 60000); await x.m.chargerMeteo(); assert.equal(n, 2, 'après 15 min : nouvel appel');
  await x.m.chargerMeteo(true); assert.equal(n, 3, 'forcé');
});
await t('panne réseau, erreur HTTP ou réponse vide : on garde la dernière météo connue, sinon ciel clair — jamais d’exception', async () => {
  const x = moteur({ fetch: async () => { throw new Error('hors ligne'); } });
  await x.m.chargerMeteo(); assert.equal(x.m.etat().meteo, 'clair', 'rien de connu : ciel clair'); assert.ok(/hors ligne/.test(x.m.erreur()));
  let mode = 'ok'; const y = moteur({ fetch: async () => mode === 'ok' ? reponse(meteoJSON(75, 5)) : mode === 'http' ? reponse({}, false, 503) : mode === 'vide' ? reponse({}) : (() => { throw new Error('délai'); })() });
  await y.m.chargerMeteo(); assert.equal(y.m.etat().meteo, 'neige');
  for (const mm of ['http', 'vide', 'panne']) { mode = mm; y.avance(20 * 60000); await y.m.chargerMeteo(); assert.equal(y.m.etat().meteo, 'neige', mm + ' : dernière météo conservée'); assert.ok(y.m.erreur(), mm + ' : erreur notée'); }
  mode = 'ok'; y.avance(20 * 60000); await y.m.chargerMeteo(); assert.equal(y.m.erreur(), null, 'rétabli');
  const z = moteur({ fetch: async () => ({ ok: true, json: async () => { throw new Error('JSON cassé'); } }) }); await z.m.chargerMeteo(); assert.equal(z.m.etat().meteo, 'clair');
  const s = moteur({}); await s.m.chargerMeteo(); assert.equal(s.m.etat().meteo, 'clair', 'sans fetch du tout : pas de plantage');
});
await t('hors ligne au démarrage : la météo du cache (même ancienne) est reprise plutôt qu’un ciel vide', async () => {
  const a = moteur({ fetch: async () => reponse(meteoJSON(65, 30)) }); await a.m.chargerMeteo();
  const cache = a.mem.get('rayle_amb_meteo');
  const b = moteur({ stock: { rayle_amb_meteo: cache }, now: a.now() + 3 * 3600000, fetch: async () => { throw new Error('hors ligne'); } });
  assert.equal(b.m.etat().meteo, 'pluie', 'cache repris dès le démarrage');
  await b.m.chargerMeteo(); assert.equal(b.m.etat().meteo, 'pluie');
});
await t('lieu : Castres par défaut ; lieu des Réglages ; dernière position consentie ; le plus récent l’emporte', async () => {
  const x = moteur({ fetch: async () => reponse(meteoJSON(0)) });
  assert.equal(x.m.lieu().nom, 'Castres'); assert.equal(x.m.lieu().source, 'défaut');
  x.avance(1000); x.m.regler('lieu', { nom: 'Lyon', lat: 45.76, lon: 4.84 }); assert.equal(x.m.lieu().nom, 'Lyon'); assert.equal(x.m.lieu().source, 'réglages');
  x.avance(1000); x.m.noterPosition({ lat: 48.85, lon: 2.35 }); assert.equal(x.m.lieu().source, 'position'); assert.equal(Math.round(x.m.lieu().lat), 49);
  x.avance(1000); x.m.regler('lieu', { nom: 'Nice', lat: 43.7, lon: 7.26 }); assert.equal(x.m.lieu().nom, 'Nice', 'le lieu choisi ensuite remplace la position mémorisée');
  x.m.regler('lieu', null); assert.equal(x.m.lieu().nom, 'Castres');
  const y = moteur({ fetch: async () => reponse({ results: [{ name: 'Albi', country: 'France', latitude: 43.93, longitude: 2.15 }] }) });
  assert.equal(JSON.stringify(await y.m.chercherLieu('Albi')), JSON.stringify({ nom: 'Albi (France)', lat: 43.93, lon: 2.15 }));
});
await t('commandes vocales (sans IA) : ambiances', () => {
  const a = x => { const r = A.analyser(x); return r ? r.type + ':' + (r.preset || r.valeur || r.delta || (r.theme ? 'theme' : '')) : null; };
  assert.equal(a('ambiance pluie'), 'preset:pluie'); assert.equal(a('Raylé, mets l’ambiance orage'), 'preset:orage'); assert.equal(a('mets l’ambiance détente'), 'preset:detente');
  assert.equal(a('passe en ambiance nuit'), 'preset:nuit'); assert.equal(a('ambiance brouillard'), 'preset:brouillard'); assert.equal(a('ambiance neigeuse'), 'preset:neige');
  assert.equal(a('mets une ambiance de pluie'), 'preset:pluie'); assert.equal(a('ambiance concentration'), 'preset:focus'); assert.equal(a('ambiance clair'), 'preset:clair');
  assert.equal(a('passe en mode nuit'), 'preset:nuit'); assert.equal(a('mode jour'), 'preset:jour'); assert.equal(a('active le mode nuit'), 'preset:nuit');
  assert.equal(a('il neige'), 'preset:neige'); assert.equal(a('fais pleuvoir'), 'preset:pluie'); assert.equal(a('fais neiger'), 'preset:neige'); assert.equal(a('mets de la pluie'), 'preset:pluie'); assert.equal(a('fais venir l’orage'), null);
  assert.equal(a('il pleut'), 'preset:pluie'); assert.equal(a('ambiance crépuscule'), 'preset:crepuscule'); assert.equal(a('ambiance du matin'), 'preset:aube');
});
await t('commandes vocales : auto, off, adapter à la météo, retour', () => {
  const a = x => { const r = A.analyser(x); return r ? r.type + (r.theme ? '+theme' : '') : null; };
  assert.equal(a('ambiance auto'), 'auto'); assert.equal(a('ambiance automatique'), 'auto'); assert.equal(a('ambiance réelle'), 'auto'); assert.equal(a('remets l’ambiance normale'), 'auto');
  assert.equal(a('retour à l’ambiance automatique'), 'auto'); assert.equal(a('reviens en automatique'), 'auto');
  assert.equal(a('adapte l’ambiance à la météo'), 'auto+theme'); assert.equal(a('adapte le thème à la météo'), 'auto+theme');
  assert.equal(a('coupe l’ambiance'), 'off'); assert.equal(a('désactive l’ambiance'), 'off'); assert.equal(a('ambiance off'), 'off'); assert.equal(a('sans ambiance'), 'off');
});
await t('commandes vocales : vent, intensité, durée', () => {
  const r = x => A.analyser(x);
  assert.equal(JSON.stringify(r('plus de vent')), JSON.stringify({ type: 'vent', delta: .25, duree: null })); assert.equal(r('moins de vent').delta, -.25);
  assert.equal(r('pas de vent').valeur, 0); assert.equal(r('sans vent').valeur, 0); assert.equal(r('coupe le vent').valeur, 0); assert.equal(r('beaucoup de vent').valeur, .85); assert.equal(r('mets du vent fort') , null, 'tournure non prévue → passe à l’IA');
  assert.equal(r('plus de pluie').type, 'intensite'); assert.equal(r('moins de neige').delta, -.2);
  assert.equal(r('ambiance pluie pendant 10 minutes').duree, 10 * 60000); assert.equal(r('ambiance orage pendant une heure').duree, 3600000); assert.equal(r('ambiance nuit pendant 2 heures').duree, 7200000);
  assert.equal(r('ambiance détente pendant un quart d’heure').duree, 15 * 60000); assert.equal(r('il neige pendant une demi-heure').duree, 30 * 60000); assert.equal(r('ambiance pluie pendant trente minutes').duree, 30 * 60000);
  assert.equal(r('ambiance pluie pendant 3 jours').duree, null, 'durée non comprise : ignorée, la commande reste valable');
  assert.equal(r('ambiance pluie pendant 3 jours').type, 'preset');
});
await t('commandes vocales : ne vole ni les questions ni les autres commandes', () => {
  for (const q of ['quelle est l’ambiance ce soir', 'il pleut à Paris ?', 'est-ce qu’il neige à Lyon', 'quel temps fait-il', 'la météo de demain', 'combien de vent aujourd’hui', 'pourquoi il pleut',
    'mets le graphique en nuit', 'affiche le bitcoin', 'ouvre le terminal', 'ferme tout', 'passe en thème Aurore', 'fond globe', 'mode éco', 'entité neurones', 'mode graphique', 'l’orage', 'pluie', 'nuit', 'ambiance',
    'raconte une histoire', 'plus de bruit', 'la neige est belle', 'c’est quoi une ambiance détente', 'mets de la musique', 'mode trading', 'ambiance du terminal'])
    assert.equal(A.analyser(q), null, 'ne doit pas être pris : ' + q);
});
await t('exécution : phrases de confirmation, durée, retour auto', () => {
  const x = moteur({ now: utc(2026, 6, 21, 10) });
  assert.match(x.m.executer(A.analyser('ambiance pluie pendant 10 minutes')), /pluie pendant 10 minutes.*retour à l'automatique/);
  assert.equal(x.m.etat().meteo, 'pluie');
  assert.match(x.m.executer(A.analyser('plus de vent')), /Vent renforcé/);
  assert.match(x.m.executer(A.analyser('pas de vent')), /Plus de vent/);
  assert.match(x.m.executer(A.analyser('moins de pluie')), /calme/);
  assert.match(x.m.executer(A.analyser('adapte l’ambiance à la météo')), /automatique/); assert.equal(x.m.etat().source, 'auto');
  assert.match(x.m.executer(A.analyser('coupe l’ambiance')), /désactivée/); assert.equal(x.m.reglages().mode, 'off');
  assert.match(x.m.executer(A.analyser('ambiance auto')), /automatique/);
  assert.match(x.m.executer(A.analyser('moins de pluie')), /ni pluie/);
});
await t('outil « ambiance » de l’IA : règle ambiance, vent, thème, fond et entité d’un coup', () => {
  const calls = []; UI.changer = (k, v, o) => calls.push([k, v, o]);
  const x = moteur({ now: utc(2026, 6, 21, 10) });
  const r = x.m.executerAgent({ type: 'ambiance', ambiance: 'detente', vent: 'leger', theme: 'ambre', fond: 'globe', entite: 'neurones', duree_minutes: 45 });
  assert.match(r, /ambiance détente/); assert.match(r, /thème ambre/); assert.match(r, /fond espace/, 'l’ancien « globe » devient l’Espace'); assert.match(r, /entité neurones/);
  assert.deepEqual(calls.map(c => c.slice(0, 2).join('=')), ['theme=ambre', 'fond=espace', 'entite=neurones']);
  assert.equal(calls[0][2], undefined, 'le thème demandé par l’IA est un choix explicite (priorité manuelle)');
  const e = x.m.etat(); assert.equal(e.moment, 'crepuscule'); assert.equal(e.vent.vitesse, .25); assert.equal(x.m.manuel().fin, x.now() + 45 * 60000);
  assert.match(x.m.executerAgent({ ambiance: 'auto', theme: 'auto' }), /ambiance automatique.*thème automatique/); assert.equal(x.m.etat().source, 'auto');
  assert.equal(x.m.executerAgent({ ambiance: 'n’importe quoi', fond: 'galaxie', theme: 'violet' }), '', 'valeurs inconnues ignorées');
  // « emmène-moi voir Saturne » : le fond Espace s’en charge (vol + faits)
  const vus = []; UI.espace = { executer: a => { vus.push(a.type + ':' + (a.cible || '')); return 'Direction Saturne. Faits.'; } };
  assert.equal(x.m.executerAgent({ astre: 'saturne' }), 'Direction Saturne. Faits.'); assert.equal(x.m.executerAgent({ astre: 'terre', ambiance: 'pluie' }).endsWith('Direction Saturne. Faits.'), true);
  assert.equal(x.m.executerAgent({ astre: 'pluton' }), ''); assert.deepEqual(vus, ['vers:saturne', 'retour:', ]);
  assert.equal(x.m.executerAgent({ ambiance: 'orage', intensite: 5 }).includes('intensité 100 %'), true, 'intensité bornée');
});
await t('initiative : remarque UNE fois, seulement pour un vrai changement vu page ouverte, en auto', () => {
  const clair = { source: 'auto', mode: 'auto', meteo: 'clair', intensite: 0, meteoSession: true }, pluie = { source: 'auto', mode: 'auto', meteo: 'pluie', intensite: .6, meteoSession: true };
  const r = A.remarque(clair, pluie, 'Castres'); assert.match(r.texte, /pleuvoir sur Castres/); assert.equal(r.local, true); assert.ok(r.importance <= 1, 'ni Discrète ne la dirait');
  assert.equal(A.remarque({ ...clair, meteoSession: false }, pluie, 'Castres'), null, 'jamais au chargement de la page');
  assert.equal(A.remarque(pluie, { ...pluie, intensite: .9 }, 'x'), null, 'déjà en train de pleuvoir');
  assert.equal(A.remarque(clair, { ...pluie, intensite: .2 }, 'x'), null, 'trop léger pour être dit');
  assert.equal(A.remarque(clair, { ...pluie, source: 'manuel' }, 'x'), null, 'jamais pour une ambiance forcée');
  assert.equal(A.remarque(clair, { ...pluie, mode: 'off' }, 'x'), null);
  assert.match(A.remarque(clair, { ...pluie, meteo: 'neige' }, 'Lyon').texte, /neiger/); assert.match(A.remarque(clair, { ...pluie, meteo: 'orage' }, 'Lyon').texte, /orage/);
  const d = new Date().toISOString().slice(0, 13); assert.equal(A.remarque(clair, pluie, 'a').id, 'ambiance-pluie-' + d, 'identifiant stable : l’initiative ne la redit pas');
  // le moteur n’appelle surChangement qu’après une première météo reçue pendant la session
  const vus = []; const mem = new Map(); let now = utc(2026, 6, 21, 10), code = 0;
  const m = A.creer({ maintenant: () => now, stockage: { get: k => mem.get(k) ?? null, set: (k, v) => v == null ? mem.delete(k) : mem.set(k, v) }, bus: { emit() {}, fournir() {}, on() {}, demander() {} },
    fetch: async () => reponse(meteoJSON(code)), changerTheme() {}, themeActuel: () => 'x', surChangement: (a, b) => vus.push(A.remarque(a, b, 'Castres')) });
  return (async () => {
    code = 0; await m.chargerMeteo(); code = 63; now += 20 * 60000; await m.chargerMeteo();
    assert.equal(vus.filter(Boolean).length, 1, 'une seule remarque pour clair → pluie');
    code = 65; now += 20 * 60000; await m.chargerMeteo(); assert.equal(vus.filter(Boolean).length, 1, 'pas de seconde remarque tant qu’il pleut');
  })();
});
await t('mode off : plus aucun effet continu (le jour reste calculé), état toujours disponible', () => {
  const x = moteur({ now: utc(2026, 6, 21, 10), fetch: async () => reponse(meteoJSON(95)) });
  x.m.regler('mode', 'off'); x.m.avancer(10);
  const L = x.m.lisse(); assert.equal(L.pluie + L.neige + L.brouillard + L.orage, 0); assert.ok(L.jour > .9); assert.equal(x.m.etat().mode, 'off');
});
console.log(ok + ' groupes réussis');
