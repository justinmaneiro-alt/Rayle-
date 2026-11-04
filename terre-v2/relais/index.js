/* ═════════════ RELAIS DE LA TERRE 2.0 (Worker Cloudflare séparé, SANS SECRET) ═════════════
   Seulement pour les sources publiques sans CORS. Liste blanche fixe, paramètres validés, cache court, rien n'est stocké.
     GET /avions?lat=&lon=&dist=      → https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{dist}  (dist ≤ 250 NM ; cache 5 s)
     GET /firms?cle=&zone=o,s,e,n     → NASA FIRMS area CSV (VIIRS NOAA-20 NRT, 1 jour) ; la clé est celle de l'utilisateur, jamais conservée ; cache 30 min
     GET /sante                        → ok
   N'est PAS le Worker principal « rayle ». Déploiement : npx.cmd wrangler deploy --config terre-v2/relais/wrangler.toml */
const ORIGINES = ['https://justinmaneiro-alt.github.io', 'http://127.0.0.1:8000', 'http://127.0.0.1:8011', 'http://localhost:8000'];
const nombre = (v, min, max) => { const x = Number(v); return Number.isFinite(x) && x >= min && x <= max ? x : null; };

export function cors(origine) {
  const ok = ORIGINES.includes(origine) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origine || '');
  return { 'Access-Control-Allow-Origin': ok ? origine : ORIGINES[0], 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
}
export function cible(url) {
  const u = new URL(url), p = u.searchParams;
  if (u.pathname === '/avions') {
    const lat = nombre(p.get('lat'), -90, 90), lon = nombre(p.get('lon'), -180, 180), dist = nombre(p.get('dist'), 1, 250);
    if (lat == null || lon == null || dist == null) return { erreur: 'paramètres lat, lon, dist (≤ 250) requis' };
    return { url: `https://api.adsb.lol/v2/lat/${lat.toFixed(3)}/lon/${lon.toFixed(3)}/dist/${Math.round(dist)}`, ttl: 5, type: 'application/json' };
  }
  if (u.pathname === '/firms') {
    const cle = p.get('cle') || '', zone = (p.get('zone') || '').split(',').map(Number);
    if (!/^[A-Za-z0-9]{16,64}$/.test(cle)) return { erreur: 'clé FIRMS invalide' };
    if (zone.length !== 4 || zone.some(x => !Number.isFinite(x)) || zone[0] < -180 || zone[2] > 180 || zone[1] < -90 || zone[3] > 90 || zone[0] >= zone[2] || zone[1] >= zone[3]) return { erreur: 'zone o,s,e,n invalide' };
    return { url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${cle}/VIIRS_NOAA20_NRT/${zone.map(x => x.toFixed(2)).join(',')}/1`, ttl: 1800, type: 'text/csv; charset=utf-8', sansCleDansCache: true };
  }
  return null;
}

export default {
  async fetch(req) {
    const h = cors(req.headers.get('Origin'));
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.method !== 'GET') return new Response('méthode refusée', { status: 405, headers: h });
    const u = new URL(req.url);
    if (u.pathname === '/sante') return new Response('ok', { headers: h });
    const c = cible(req.url);
    if (!c) return new Response('route inconnue', { status: 404, headers: h });
    if (c.erreur) return new Response(c.erreur, { status: 400, headers: h });
    try {
      const r = await fetch(c.url, { headers: { 'User-Agent': 'rayle-terre-relais/1 (projet personnel)', 'Accept': c.type }, cf: { cacheTtl: c.ttl, cacheEverything: true } });
      const corps = await r.arrayBuffer();
      return new Response(corps, { status: r.status, headers: { ...h, 'Content-Type': c.type, 'Cache-Control': `public, max-age=${c.ttl}` } });
    } catch (e) { return new Response('source indisponible', { status: 502, headers: h }); }
  }
};
