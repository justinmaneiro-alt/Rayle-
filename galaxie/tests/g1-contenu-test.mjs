import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const C = createRequire(import.meta.url)('../../core/commun/g1-contenu.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
ok(C.themeValide('jarvis') === 'jarvis' && C.themeValide('x') === 'aurore' && C.themeValide(null) === 'aurore', 'thème');
ok(C.couleurValide('cyan') === 'cyan' && C.couleurValide('toString') === 'ambre' && C.couleurValide(undefined) === 'ambre', 'couleur');
ok(Object.keys(C.PALETTES).length === 5, 'cinq couleurs');
const mk = () => ({ ETATS: Object.fromEntries(['idle', 'veille', 'listening', 'speaking', 'deverrouille', 'thinking', 'alerte'].map(k => [k, { c: [.1, .2, .3], d: [.4, .5, .6] }])),
  CASCADES: Object.fromEntries(['idle', 'veille', 'listening', 'speaking', 'deverrouille', 'thinking', 'alerte'].map(k => [k, { col: [.7, .8, .9] }])) });
const { ETATS, CASCADES } = mk();
ok(C.appliquerPalette(ETATS, CASCADES, 'rose') === true && ETATS.idle.c[0] === 1 && ETATS.speaking.d[2] === 1, 'rose appliquée');
ok(ETATS.thinking.c[0] === .1 && ETATS.alerte.d[0] === .4 && CASCADES.alerte.col[0] === .7, 'réflexion et alerte intactes');
C.appliquerPalette(ETATS, CASCADES, 'violet'); ok(ETATS.idle.c[0] === .62, 'violet');
C.appliquerPalette(ETATS, CASCADES, null); ok(ETATS.idle.c[0] === .1 && CASCADES.idle.col[2] === .9, 'retour aux couleurs d’origine');
C.appliquerPalette(ETATS, CASCADES, 'cyan'); ok(ETATS.veille.d[1] === .5, 'cyan = origine');
ok(C.libelleEtat('listening', true) === 'ÉCOUTE' && C.libelleEtat('idle', false) === 'HORS LIGNE' && C.libelleEtat('zzz', true) === 'VEILLE', 'libellés');
ok(/latitude=43\.3&longitude=-0\.4/.test(C.urlPrevision(43.3, -0.4)) && /european_aqi/.test(C.urlAir(1, 2)), 'urls');
const prev = { current: { time: '2026-10-24T14:30', temperature_2m: 17.2, apparent_temperature: 16, relative_humidity_2m: 60, wind_speed_10m: 11, uv_index: 2.1 },
  hourly: { temperature_2m: Array.from({ length: 24 }, (_, i) => 10 + Math.sin(i / 4) * 6), apparent_temperature: [1, 2, 3], relative_humidity_2m: [50, 55, 60] },
  daily: { temperature_2m_min: [9], temperature_2m_max: [19], sunrise: ['2026-10-24T08:01'], sunset: ['2026-10-24T18:40'], precipitation_probability_max: [35] } };
const r = C.resumeDetail(prev, { current: { european_aqi: 33, pm2_5: 8.4 }, hourly: { european_aqi: [30, 33, null, 40] } });
ok(r.temp === 17.2 && r.min === 9 && r.max === 19 && r.pluie === 35 && r.uv === 2.1 && r.lever === '08:01' && r.coucher === '18:40', 'résumé');
ok(r.aqi === 33 && r.pm25 === 8.4 && r.serieAir.length === 3 && r.heures.now === 14.5, 'air et heure');
const vide = C.resumeDetail({}, null);
ok(vide.temp === null && vide.aqi === null && vide.lever === null && vide.serieAir.length === 0, 'données absentes = null');
ok(C.niveauAir(15) === 'bon' && C.niveauAir(70) === 'médiocre' && C.niveauAir(130) === 'très mauvais' && C.niveauAir(null) === '—', 'niveaux d’air');
const cj = C.courbeJour(r.heures, 300, 70);
ok(cj && /^M/.test(cj.d) && /Z$/.test(cj.aire) && cj.maintenant > 185 && cj.maintenant < 193, 'courbe du jour');
ok(C.courbeJour({ t: [1, null], now: 1 }, 300, 70) === null && C.courbeJour(null, 3, 3) === null, 'courbe trop courte');
console.log('g1-contenu : ' + n + ' vérifications OK');
