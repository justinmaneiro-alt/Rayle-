// V8 : aide des tests de la coque mobile : appareil émulé + faux Worker + fausses sources externes (Binance, Open-Meteo, images), sans réseau.
import { ouvrirAppareil, APPAREILS, attendre, galaxieChargee, ko, BASE } from './v7b-aide.mjs';
import { demarrerFauxWorkerMobile } from './mock-worker-mobile.mjs';
export { attendre, galaxieChargee, ko, BASE, APPAREILS };

const PAS = { '15m': 900e3, '1h': 3600e3, '4h': 14400e3 };
const BASES = { BTCUSDT: 80000, SOLUSDT: 100, DOGEUSDT: 0.08 };
const alea = graine => { let s = graine >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
export function klines(sym, iv, limite) {
  const pas = PAS[iv] || 900e3, r = alea(sym.length * 7919 + (pas / 1000)), base = BASES[sym] || 100, fin = Math.floor(Date.now() / pas) * pas, out = []; let c = base;
  for (let i = limite - 1; i >= 0; i--) { const t = fin - i * pas, o = c, ch = (r() - 0.5) * base * 0.004, cl = o + ch, h = Math.max(o, cl) + r() * base * 0.002, l = Math.min(o, cl) - r() * base * 0.002, v = 50 + r() * 200, achat = v * (0.35 + r() * 0.3); c = cl;
    out.push([t, String(o), String(h), String(l), String(cl), String(v), t + pas - 1, '0', 10, String(achat), '0', '0']); }
  return out;
}
const svg = (n, w = 480, h = 270) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="hsl(${(n * 47) % 360},40%,28%)"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="hsl(${(n * 47 + 40) % 360},50%,50%)"/></svg>`;

export async function installerSources(page, { stats = {}, pc = null } = {}) {
  await page.setRequestInterception(true);
  if (process.env.RAYLE_DEBUG_404) page.on('requestfailed', r => console.log('ECHEC', r.url().slice(0, 150), r.failure() && r.failure().errorText));
  page.on('request', req => {
    const u = new URL(req.url()), h = u.hostname, rep = (corps, type = 'application/json', code = 200) => req.respond({ status: code, contentType: type, headers: { 'Access-Control-Allow-Origin': '*' }, body: typeof corps === 'string' ? corps : JSON.stringify(corps) });
    const compte = k => { stats[k] = (stats[k] || 0) + 1; };
    if (u.pathname.startsWith('/__agent/') && !pc) { compte('pc-absent'); return rep({ ok: false, erreur: 'pas de PC dans ce test' }); }   // la page tente d'abord le service du PC : ici il n'y en a pas
    if (h === 'data-api.binance.vision') {
      compte('binance');
      if (u.pathname.endsWith('/ticker/24hr')) { const syms = JSON.parse(u.searchParams.get('symbols') || '[]'); return rep(syms.map((s, i) => ({ symbol: s, lastPrice: String(BASES[s] * (1 + i * 0.001)), priceChangePercent: String([1.2, -0.8, 0.3][i % 3]) }))); }
      if (u.pathname.endsWith('/klines')) { compte('klines'); return rep(klines(u.searchParams.get('symbol'), u.searchParams.get('interval'), +u.searchParams.get('limit') || 100)); }
    }
    if (h === 'api.open-meteo.com') { compte('meteo'); return rep({ current: { temperature_2m: 14.2, apparent_temperature: 12.8, weather_code: 3, wind_speed_10m: 18, precipitation: 0 }, daily: { time: ['2026-10-29', '2026-10-30', '2026-10-31'], temperature_2m_max: [15, 13, 16], temperature_2m_min: [8, 7, 9], weather_code: [3, 61, 0], precipitation_probability_max: [10, 70, 5] } }); }
    if (h === 'geocoding-api.open-meteo.com') { compte('geocodage'); return rep({ results: [{ name: 'Bordeaux', admin1: 'Nouvelle-Aquitaine', country: 'France', latitude: 44.84, longitude: -0.58 }, { name: 'Bordeaux', admin1: 'Québec', country: 'Canada', latitude: 45.5, longitude: -73.7 }] }); }
    if (h === 'img.test') { compte('images'); const n = +(/(\d+)/.exec(u.pathname) || [0, 0])[1]; return rep(svg(n), 'image/svg+xml'); }
    if (h === 'upload.wikimedia.org' || h === 'commons.wikimedia.org' || h === 'tile.openstreetmap.org' || /tile|arcgisonline/.test(h)) { compte('photos'); return rep(svg(7, 960, 640), 'image/svg+xml'); }
    if (/tradingview/.test(h)) { compte('tradingview'); return rep('', 'text/javascript'); }
    if (/usgs\.gov/.test(h)) { compte('usgs'); return rep({ features: [{ id: 'us1', properties: { mag: 5.4, place: '40 km de Test', time: Date.now() - 3600e3, url: 'https://earthquake.usgs.gov/x', title: 'M 5.4 - 40 km de Test', type: 'earthquake', alert: null, tsunami: 0, sig: 450 }, geometry: { type: 'Point', coordinates: [10, 40, 12] } }] }); }
    if (/eonet/.test(h)) { compte('eonet'); return rep({ events: [] }); }
    if (/faireconomy|allorigins|raw\.githubusercontent|gdacs/.test(h)) { compte('externes'); return rep([]); }
    return req.continue();
  });
  return stats;
}

/* Ouvre Rayle sur un appareil émulé, Worker débloqué (faux Worker), sources externes simulées. */
export async function ouvrirMobile(cle = 'telephone', { scenario = {}, storage = {}, paysage = false, attente = 3500, url = '/index.html', avant = null, deverrouille = true } = {}) {
  const worker = await demarrerFauxWorkerMobile(), stats = {};
  Object.assign(worker.scenario, scenario);
  const st = { rayle_m_sw: '0', ...(deverrouille ? { rayle_worker_url: worker.url, rayle_worker_token: 'test' } : {}), ...storage };
  const o = await ouvrirAppareil(cle, { url, paysage, attente, storage: st, avant: async page => { await installerSources(page, { stats }); if (avant) await avant(page); } });
  const fermer = async () => { await o.navigateur.close(); await worker.fermer(); };
  return { ...o, worker, stats, fermer };
}
export const texte = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);
export const existe = (page, sel) => page.evaluate(s => !!document.querySelector(s), sel);
export const visible = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && c.opacity !== '0'; }, sel);
/* Un élément est « recouvert » si, à son centre, l'élément du dessus n'est ni lui ni un de ses descendants. */
export const recouvert = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const t = document.elementFromPoint(x, y); return !(t && (t === e || e.contains(t))); }, sel);
