// Fond « Espace » : positions des astres (ui/astro.js), commandes vocales, faits, ISS, choix de la caméra (ui/espace.js).   node tests/espace-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ctx = { console, setTimeout, clearTimeout, Math, Date };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['../ui/astro.js', '../ui/espace.js']) vm.runInContext(fs.readFileSync(new URL(f, import.meta.url), 'utf8'), ctx);
const UI = ctx.RayleUI, A = UI.astro, E = UI.espace;
const U = (a, m, j, h, mi = 0) => Date.UTC(a, m - 1, j, h, mi);

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' : ' + a + ' vs ' + b + ' (±' + tol + ')');

await t('planètes : événements célestes connus (Mars au plus près 2003, oppositions, plus grandes élongations de Vénus et Mercure)', () => {
  proche(A.planete('mars', U(2003, 8, 27, 9, 51)).dist, .3727, .004, 'Mars au plus près de la Terre (UA)');
  proche(A.planete('jupiter', U(2023, 11, 3, 12)).elongation, 180, 3, 'opposition de Jupiter');
  proche(A.planete('saturne', U(2023, 8, 27, 12)).elongation, 180, 3, 'opposition de Saturne');
  proche(A.planete('mars', U(2022, 12, 8, 12)).elongation, 180, 4, 'opposition de Mars');
  proche(A.planete('venus', U(2020, 3, 24, 12)).elongation, 46.1, .8, 'plus grande élongation de Vénus');
  proche(A.planete('mercure', U(2022, 1, 7, 12)).elongation, 19.2, .8, 'plus grande élongation de Mercure');
  assert.equal(A.planete('pluton', Date.now()), null);
});
await t('planètes : toujours des valeurs plausibles sur 100 ans (distances, élongations de Vénus et Mercure)', () => {
  const lim = { mercure: [.5, 1.45, 28.5], venus: [.25, 1.75, 48], mars: [.36, 2.7, 180], jupiter: [3.9, 6.5, 180], saturne: [7.9, 11.1, 180], uranus: [17.2, 21.1, 180], neptune: [28.7, 31.4, 180] };
  for (let an = 1950; an <= 2050; an += 3) for (const p of A.PLANETES) {
    const q = A.planete(p, U(an, 4, 11, 12)), [dmin, dmax, emax] = lim[p];
    assert.ok(q.dist >= dmin && q.dist <= dmax, p + ' ' + an + ' distance ' + q.dist);
    assert.ok(q.elongation <= emax, p + ' ' + an + ' élongation ' + q.elongation);
    assert.ok(q.ra >= 0 && q.ra < 360 && Math.abs(q.dec) < 30, p + ' ' + an + ' reste près de l’écliptique');
  }
});
await t('soleil : ascension droite cohérente avec le point subsolaire du Globe (temps sidéral + longitude)', () => {
  for (const ts of [U(2026, 10, 11, 12), U(2026, 3, 20, 3), U(2026, 12, 21, 18), U(2030, 7, 1, 7)]) {
    const s = A.soleil(ts), q = A.soleilEq(ts);
    const diff = Math.abs((((A.gmst(ts) + s.lon) - q.ra) % 360 + 540) % 360 - 180);
    assert.ok(diff < .1, 'écart ' + diff);
    proche(s.lat, q.dec, .05, 'déclinaison');
  }
  proche(A.soleilEq(U(2026, 6, 21, 12)).dec, 23.44, .1, 'solstice d’été');
  proche(A.soleilEq(U(2026, 3, 20, 15)).ra % 360, 0, 1.5, 'équinoxe : ascension droite 0 h');
});
await t('lune : phase réelle (nouvelle lune, pleine lune), distance dans les bornes, éclairée par le soleil', () => {
  const dl = ts => (((A.luneEq(ts).ecl - A.soleilEq(ts).ecl) % 360) + 360) % 360;          // différence de longitude écliptique (définition des phases)
  const nl = U(2000, 1, 6, 18, 14); proche(((dl(nl) + 180) % 360) - 180, 0, 1.2, 'nouvelle lune');
  proche(dl(U(2024, 6, 22, 1, 8)), 180, 1.2, 'pleine lune du 22 juin 2024');
  proche(dl(U(2025, 10, 29, 16, 21)), 90, 1.5, 'premier quartier du 29 octobre 2025');
  proche(dl(U(2026, 3, 3, 11, 38)), 180, 1.5, 'pleine lune du 3 mars 2026 (éclipse totale)');
  for (let j = 0; j < 400; j += 7) { const d = A.luneEq(U(2026, 1, 1, 0) + j * 864e5).distKm; assert.ok(d > 355000 && d < 407000, 'distance ' + d); }
  // la phase géométrique et la phase moyenne (ambiance) restent proches
  for (let j = 0; j < 60; j += 3) { const ts = U(2026, 9, 1, 0) + j * 864e5, g = dl(ts), e = A.lune(ts).eclairee, ge = (1 - Math.cos(g * Math.PI / 180)) / 2; assert.ok(Math.abs(ge - e) < .12, 'phase ' + j + ' : ' + ge + ' vs ' + e); }
});
await t('direction() : repère du monde de la scène (pôle nord = +y, α croissant vers −z comme dir() du Globe)', () => {
  const d = A.direction(0, 0); proche(d[0], 1, 1e-9); proche(d[1], 0, 1e-9);
  const n = A.direction(123, 90); proche(n[1], 1, 1e-9);
  const e = A.direction(90, 0); proche(e[2], -1, 1e-9);
  proche(A.separation({ ra: 10, dec: 0 }, { ra: 40, dec: 0 }), 30, 1e-9);
});
await t('commandes vocales : « montre-moi Mars / Jupiter / Saturne / la lune / le soleil / l’ISS »', () => {
  const a = x => { const r = E.analyser(x); return r ? r.type + ':' + (r.cible || r.cle + '=' + r.valeur || '') : null; };
  assert.equal(a('montre-moi Mars'), 'vers:mars'); assert.equal(a('Raylé, montre-moi Jupiter'), 'vers:jupiter'); assert.equal(a('montre-moi Saturne'), 'vers:saturne');
  assert.equal(a('montre-moi la lune'), 'vers:lune'); assert.equal(a('montre-moi le soleil'), 'vers:soleil'); assert.equal(a('montre-moi l’ISS'), 'vers:iss');
  assert.equal(a('montre moi la station spatiale'), 'vers:iss'); assert.equal(a('emmène-moi sur Vénus'), 'vers:venus'); assert.equal(a('va sur Mercure'), 'vers:mercure');
  assert.equal(a('affiche Neptune'), 'vers:neptune'); assert.equal(a('regarde la planète Uranus'), 'vers:uranus'); assert.equal(a('zoome sur Saturne'), 'vers:saturne'); assert.equal(a('vole vers la lune'), 'vers:lune');
  assert.equal(a('montre-moi Mars s’il te plaît'), 'vers:mars');
});
await t('commandes vocales : retour sur la Terre', () => {
  for (const p of ['reviens sur la Terre', 'retour sur la terre', 'retourne sur la Terre', 'reviens à la Terre', 'ramène-moi sur la terre', 'recentre la Terre', 'reviens en vue d’ensemble'])
    assert.equal(E.analyser(p).type, 'retour', p);
});
await t('commandes vocales : activer / désactiver les éléments', () => {
  const a = x => { const r = E.analyser(x); return r ? r.cle + '=' + r.valeur : null; };
  assert.equal(a('désactive les planètes'), 'planetes=false'); assert.equal(a('active les planètes'), 'planetes=true'); assert.equal(a('désactive les astéroïdes'), 'asteroides=false');
  assert.equal(a('active les astéroïdes'), 'asteroides=true'); assert.equal(a('coupe les satellites'), 'satellites=false'); assert.equal(a('active les satellites'), 'satellites=true');
  assert.equal(a('enlève les comètes'), 'asteroides=false'); assert.equal(a('désactive les aurores'), 'aurores=false'); assert.equal(a('cache la voie lactée'), 'voielactee=false');
  assert.equal(a('active la lune'), 'lune=true'); assert.equal(a('désactive la lune'), 'lune=false'); assert.equal(a('active les nébuleuses'), 'voielactee=true'); assert.equal(a('désactive le lens flare'), 'flare=false');
  assert.equal(a('affiche les planètes'), 'planetes=true'); assert.equal(a('remets les satellites'), 'satellites=true');
});
await t('commandes vocales : ne vole ni les questions ni les autres commandes', () => {
  for (const q of ['quelle est la distance de Mars', 'combien de lunes a Saturne', 'c’est quoi l’ISS', 'montre-moi le graphique', 'montre-moi la carte de Paris', 'affiche le bitcoin', 'ouvre le terminal',
    'montre-moi le calendrier de mars', 'passe en thème Aurore', 'fond espace', 'mode éco', 'ambiance nuit', 'plus de vent', 'mars', 'jupiter', 'la lune', 'reviens', 'retour', 'ferme tout', 'active le micro', 'désactive le son',
    'coupe l’écoute', 'montre-moi mon dernier message', 'affiche les panneaux', 'montre la lune de miel', 'va sur Terre-Neuve'])
    assert.equal(E.analyser(q), null, 'ne doit pas être pris : ' + q);
});
await t('éléments : tous actifs par défaut, mémorisés, événement émis', () => {
  const evts = []; ctx.RayleBus = { emit: (n, d) => evts.push([n, d]) };
  assert.ok(Object.values(E.elements()).every(v => v === true) && Object.keys(E.elements()).length === 7);
  assert.equal(E.regler('planetes', false), true); assert.equal(E.elements().planetes, false); assert.equal(evts.at(-1)[0], 'espace:elements');
  assert.equal(E.regler('n’importe quoi', true), false); E.regler('planetes', true);
});
await t('faits : 1 ou 2 phrases courtes avec les chiffres du jour (distances calculées)', () => {
  const ts = U(2026, 10, 11, 12);
  const mars = E.faits('mars', { ts }); assert.match(mars, /^Mars est à \d+ millions de kilomètres/); assert.match(mars, /Olympus Mons/); assert.ok(mars.split('. ').length <= 3);
  assert.match(E.faits('jupiter', { ts }), /Grande Tache rouge/); assert.match(E.faits('saturne', { ts }), /anneaux/);
  assert.match(E.faits('soleil', { ts }), /8,\d minutes/); assert.match(E.faits('lune', { ts }), /kilomètres ce soir, éclairée à \d+ %/);
  assert.equal(E.faits('terre', { ts }), 'De retour sur la Terre.');
  for (const c of A.PLANETES) assert.ok(E.faits(c, { ts }).length > 40 && E.faits(c, { ts }).length < 260, c);
  const mm = +/(\d+(?:,\d)?) millions/.exec(E.faits('mars', { ts }))[1].replace(',', '.'); const d = A.planete('mars', ts).dist * 149.6; assert.ok(Math.abs(mm - d) < 1.5, 'distance de Mars cohérente');
});

// ── ISS : API simulée à partir d'une vraie orbite (inclinaison 51,64°, période 92,9 min) ──
function verite(t0, omegaIn, u0) {                                  // « vraie » ISS : position terrestre à l'instant ts (ms)
  return ts => {
    const i = 51.64 * Math.PI / 180, u = u0 + 2 * Math.PI / (92.9 * 60) * (ts - t0) / 1000;
    const lat = Math.asin(Math.sin(i) * Math.sin(u)) * 180 / Math.PI;
    const ra = omegaIn + Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u)) * 180 / Math.PI;
    return { lat, lon: ((ra - A.gmst(ts) + 540) % 360 + 360) % 360 - 180 };
  };
}
const reponse = (j, ok = true, status = 200) => ({ ok, status, json: async () => j });
function iss(o = {}) {
  const mem = new Map(Object.entries(o.stock || {})); let now = o.now ?? U(2026, 10, 11, 12); const appels = [];
  const api = verite(U(2026, 10, 11, 0), 100, 1.0);
  const m = E.creerISS({ maintenant: () => now, stockage: { get: k => mem.get(k) ?? null, set: (k, v) => v == null ? mem.delete(k) : mem.set(k, v) },
    fetch: o.fetch || (async u => { appels.push(u); const ts = /timestamps=([\d,]+)/.exec(u)[1].split(',').map(Number); return reponse(ts.map(s => { const p = api(s * 1000); return { latitude: p.lat, longitude: p.lon, altitude: 421.5, velocity: 27580, timestamp: s }; })); }) });
  return { m, mem, appels, api, avance: ms => { now += ms; }, now: () => now };
}
await t('ISS : sans réseau ni cache, orbite d’exemple simulée (jamais d’erreur) ; latitude toujours entre ±51,64°', () => {
  const x = iss({ fetch: async () => { throw new Error('hors ligne'); } });
  const e = x.m.etat(); assert.equal(e.simule, true); assert.ok(isFinite(e.lat) && isFinite(e.lon) && Math.abs(e.lat) <= 51.7);
  let max = 0; for (let k = 0; k < 400; k++) max = Math.max(max, Math.abs(x.m.position(x.now() + k * 20000).lat)); assert.ok(max > 51 && max <= 51.7, 'latitude maximale ' + max);
});
await t('ISS : position réelle lue, orbite recalée (erreur < 1° après 30 min), cache de 10 min', async () => {
  const x = iss(); const e0 = await x.m.charger(); assert.equal(e0.simule, false); assert.equal(x.appels.length, 1);
  assert.ok(/api\.wheretheiss\.at\/v1\/satellites\/25544\/positions/.test(x.appels[0]) && !/key|token/i.test(x.appels[0]), 'API publique, sans clé');
  const v0 = x.api(x.now()); proche(e0.lat, v0.lat, .3, 'latitude'); proche(Math.abs(((e0.lon - v0.lon + 540) % 360) - 180), 0, .3, 'longitude'); assert.equal(e0.alt, 421.5);
  const futur = x.now() + 30 * 60000, p = x.m.position(futur), v = x.api(futur);
  proche(p.lat, v.lat, 1, 'latitude à +30 min'); proche(Math.abs(((p.lon - v.lon + 540) % 360) - 180), 0, 1, 'longitude à +30 min');
  await x.m.charger(); await x.m.charger(); assert.equal(x.appels.length, 1, 'cache 10 min');
  x.avance(11 * 60000); await x.m.charger(); assert.equal(x.appels.length, 2);
});
await t('ISS : sens du déplacement (montant ou descendant) bien retrouvé', async () => {
  for (const u0 of [.3, 2.6, 3.6, 5.5]) {
    const mem = new Map(); const now = U(2026, 10, 11, 12), api = verite(now - 1000, 40, u0);
    const m = E.creerISS({ maintenant: () => now, stockage: { get: k => mem.get(k) ?? null, set: (k, v) => mem.set(k, v) }, fetch: async u => { const ts = /timestamps=([\d,]+)/.exec(u)[1].split(',').map(Number); return reponse(ts.map(s => { const p = api(s * 1000); return { latitude: p.lat, longitude: p.lon, altitude: 420, velocity: 27600, timestamp: s }; })); } });
    await m.charger(true); const f = now + 12 * 60000, p = m.position(f), v = api(f);
    proche(p.lat, v.lat, 1.2, 'u0=' + u0 + ' latitude'); proche(Math.abs(((p.lon - v.lon + 540) % 360) - 180), 0, 1.2, 'u0=' + u0 + ' longitude');
  }
});
await t('ISS : panne réseau, erreur HTTP, réponse vide → la dernière position connue continue d’orbiter (simulée)', async () => {
  const x = iss(); await x.m.charger(); const avant = x.m.position(x.now() + 40 * 60000);
  for (const mode of ['reseau', 'http', 'vide', 'cassee']) {
    const y = iss({ stock: Object.fromEntries(x.mem), now: x.now() + 20 * 60000, fetch: async () => mode === 'reseau' ? (() => { throw new Error('hors ligne'); })() : mode === 'http' ? reponse({}, false, 503) : mode === 'vide' ? reponse([]) : { ok: true, json: async () => { throw new Error('JSON'); } } });
    const e = await y.m.charger(true); assert.equal(e.simule, true, mode); assert.ok(y.m.erreur(), mode + ' : erreur notée');
    const p = y.m.position(x.now() + 40 * 60000); proche(p.lat, avant.lat, 1.5, mode + ' latitude'); proche(Math.abs(((p.lon - avant.lon + 540) % 360) - 180), 0, 1.5, mode + ' longitude');
  }
});
await t('ISS : traînée (suite de positions) et altitude en rayons terrestres', async () => {
  const x = iss(); await x.m.charger(); const tr = x.m.trace(x.now(), 45, 5, 1);
  assert.equal(tr.length, 51); assert.ok(tr.every(p => isFinite(p.ra) && isFinite(p.dec)));
  proche(x.m.position(x.now()).r, 1 + 421.5 / 6371, 1e-6);
  const a = tr[0], b = tr[1]; assert.ok(A.separation(a, b) > 3 && A.separation(a, b) < 5, 'environ 3,9° par minute');
});
await t('caméra : choisit une vue où la Terre est bien éclairée, avec la Lune ou une planète dans le champ', () => {
  const ts = U(2026, 10, 11, 12), s = A.soleilEq(ts), l = A.luneEq(ts);
  const ctxe = { soleil: A.direction(s.ra, s.dec), lune: A.direction(l.ra, l.dec), aspect: 1.78, planetes: A.PLANETES.map(n => { const q = A.planete(n, ts); return { nom: n, dir: A.direction(q.ra, q.dec), poids: 1 }; }) };
  const v = E.choisirVue(ctxe); assert.ok(v && v.score > 3, 'score ' + (v && v.score));
  const c = E.vueVecteur(v.yaw, v.pitch), eclairee = (1 + c.reduce((a, x, i) => a + x * ctxe.soleil[i], 0)) / 2;
  assert.ok(eclairee > .35 && eclairee < .95, 'Terre éclairée à ' + Math.round(eclairee * 100) + ' %');
  const mauvais = E.evaluerVue((Math.atan2(-ctxe.soleil[0], -ctxe.soleil[2]) * 180 / Math.PI + 360) % 360, 8, ctxe);   // caméra côté nuit
  assert.ok(v.score > mauvais, 'meilleur que la face nuit');
  const w = E.choisirVue(ctxe, { loinDe: v.yaw, ecartMin: 60 }); assert.ok(Math.abs(((w.yaw - v.yaw + 540) % 360) - 180) >= 60, 'la dérive change vraiment de vue');
});
await t('échelle : « échelle réaliste », « mode pédagogique », « passe en tailles réelles » ; pas de faux positifs', () => {
  for (const [phrase, mode] of [['échelle réaliste', 'realiste'], ['mode réaliste', 'realiste'], ['passe en échelle réaliste', 'realiste'], ['mets les tailles réelles', 'realiste'], ['active l’échelle réelle', 'realiste'],
    ['échelle pédagogique', 'pedagogique'], ['mode pédagogique', 'pedagogique'], ['repasse en mode pédagogique', 'pedagogique'], ['passe en vue éducative', 'pedagogique']]) {
    const a = E.analyser(phrase); assert.ok(a && a.type === 'echelle' && a.mode === mode, phrase + ' → ' + JSON.stringify(a));
  }
  for (const phrase of ['montre-moi Mars', 'désactive les planètes', 'reviens sur la Terre', 'quelle est la taille de Mars', 'mode éco', 'je suis réaliste']) { const a = E.analyser(phrase); assert.ok(!a || a.type !== 'echelle', phrase + ' → ' + JSON.stringify(a)); }
});
await t('échelle : exécution, mémorisation et valeur par défaut pédagogique', () => {
  assert.equal(E.echelle(), 'pedagogique');
  const r = E.executer({ type: 'echelle', mode: 'realiste' }); assert.match(r, /réaliste/); assert.equal(E.echelle(), 'realiste');
  assert.equal(E.reglerEchelle('n’importe quoi'), false); assert.equal(E.echelle(), 'realiste');
  assert.match(E.executer({ type: 'echelle', mode: 'pedagogique' }), /pédagogique/); assert.equal(E.echelle(), 'pedagogique');
});
console.log(ok + ' groupes réussis');
