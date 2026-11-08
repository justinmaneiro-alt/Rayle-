/* ═════════════ RELAIS DU TABLEAU DE BORD DE L'OR ET DU MODE TÉLÉ (Worker Cloudflare DÉDIÉ, SANS AUCUN SECRET, offre gratuite) ═════════════
   N'est PAS le Worker principal « rayle » (jamais touché). Aucune clé, aucune donnée personnelle, rien n'est conservé.
   1) Kraken Futures n'envoie pas d'en-tête CORS : ce relais lit SEULEMENT des données publiques du perpétuel de l'or PF_XAUUSD (liste blanche fixe).
        GET /kraken/bougies?res=5m|15m|1h|4h|1d&from=<s>&to=<s>  → /api/charts/v1/trade/PF_XAUUSD/<res>   (cache 10 s)
        GET /kraken/ticker                                         → /derivatives/api/v3/tickers/PF_XAUUSD   (cache 2 s)
        GET /kraken/instrument                                     → fiche PF_XAUUSD (taille du contrat, pas)  (cache 1 h)
        Terminal (2026-11-08) : paramètre facultatif &sym= parmi SYMBOLES (défaut PF_XAUUSD : ancien comportement) ; GET /kraken/tickers → tickers des SYMBOLES
   2) Mode télé : appairage par code à 4 chiffres. Un objet durable « Salon » par code (objet SQLite de l'offre gratuite), WebSocket seulement,
      AUCUN stockage : les messages passent de la télécommande à la télé et disparaissent. Liste blanche de commandes, 20 messages/s au plus,
      512 octets au plus, salon fermé après 30 min sans télécommande et 3 h au total.
        GET /tele/ws?code=1234&role=tele|commande  (WebSocket)
        GET /sante → ok
   Déploiement : npx.cmd wrangler deploy --config relais-or/wrangler.toml */
const ORIGINES = ['https://justinmaneiro-alt.github.io', 'http://127.0.0.1:8000', 'http://127.0.0.1:8011', 'http://localhost:8000'];
export const RESOLUTIONS = ['5m', '15m', '1h', '4h', '1d'];
/* terminal de Rayle (2026-11-08) : liste blanche FIXE des perpétuels publics lus (or, Nasdaq 100, Bitcoin, Solana, Dogecoin, + QQQx pour l'historique ancien du Nasdaq) */
export const SYMBOLES = ['PF_XAUUSD', 'PF_US100USD', 'PF_XBTUSD', 'PF_SOLUSD', 'PF_DOGEUSD', 'PF_QQQXUSD'];
export const COMMANDES = ['playlist', 'mix', 'pause', 'reprendre', 'pause_reprendre', 'suivant', 'precedent', 'volume_plus', 'volume_moins', 'muet', 'stop', 'melange', 'or', 'terre', 'musique', 'ping'];
const KRAKEN = 'https://futures.kraken.com';

export function cors(origine) {
  const ok = ORIGINES.includes(origine) || /^http:\/\/(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+):\d+$/.test(origine || '');
  return { 'Access-Control-Allow-Origin': ok ? origine : ORIGINES[0], 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
}

export function cible(url) {
  const u = new URL(url), p = u.searchParams, sym = p.get('sym') || 'PF_XAUUSD';
  if (!SYMBOLES.includes(sym)) return { erreur: 'sym doit être ' + SYMBOLES.join(', ') };
  if (u.pathname === '/kraken/tickers') return { url: `${KRAKEN}/derivatives/api/v3/tickers`, ttl: 2, filtre: 'tickers' };
  if (u.pathname === '/kraken/bougies') {
    const res = p.get('res'); if (!RESOLUTIONS.includes(res)) return { erreur: 'res doit être 5m, 15m, 1h, 4h ou 1d' };
    const from = Number(p.get('from')), to = p.get('to') == null ? null : Number(p.get('to'));
    if (!Number.isInteger(from) || from < 1.5e9 || from > 4e9) return { erreur: 'from (secondes) invalide' };
    if (to != null && (!Number.isInteger(to) || to <= from || to > 4e9)) return { erreur: 'to (secondes) invalide' };
    return { url: `${KRAKEN}/api/charts/v1/trade/${sym}/${res}?from=${from}${to != null ? '&to=' + to : ''}`, ttl: 10 };
  }
  if (u.pathname === '/kraken/ticker') return { url: `${KRAKEN}/derivatives/api/v3/tickers/${sym}`, ttl: 2 };
  if (u.pathname === '/kraken/instrument') return { url: `${KRAKEN}/derivatives/api/v3/instruments`, ttl: 3600, filtre: 'instrument', sym };
  return null;
}

/* message admis de la télécommande vers la télé (pur, testé) : jamais de texte libre, jamais de donnée personnelle */
export function admettre(brut) {
  if (typeof brut !== 'string' || brut.length > 512) return null;
  let m; try { m = JSON.parse(brut); } catch (e) { return null; }
  if (!m || m.t !== 'cmd' || !COMMANDES.includes(m.cmd)) return null;
  const o = { t: 'cmd', cmd: m.cmd };
  if (m.v != null) { const v = Number(m.v); if (!Number.isFinite(v) || v < 0 || v > 100) return null; o.v = Math.round(v); }
  return o;
}
/* message admis de la télé vers la télécommande : seulement un petit état (morceau en cours, vue) */
export function admettreEtat(brut) {
  if (typeof brut !== 'string' || brut.length > 512) return null;
  let m; try { m = JSON.parse(brut); } catch (e) { return null; }
  if (!m || m.t !== 'etat') return null;
  const o = { t: 'etat' };
  if (typeof m.vue === 'string' && /^(or|terre|musique)$/.test(m.vue)) o.vue = m.vue;
  if (typeof m.titre === 'string') o.titre = m.titre.slice(0, 120);
  if (typeof m.lecture === 'boolean') o.lecture = m.lecture;
  if (m.volume != null && Number.isFinite(+m.volume)) o.volume = Math.max(0, Math.min(100, Math.round(+m.volume)));
  return o;
}

export class Salon {
  constructor(state) { this.state = state; this.debut = Date.now(); this.dernierCmd = Date.now(); this.debits = new Map(); }
  async fetch(req) {
    const u = new URL(req.url), role = u.searchParams.get('role');
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
    if (role !== 'tele' && role !== 'commande') return new Response('role invalide', { status: 400 });
    if (role === 'tele' && this.state.getWebSockets('tele').length) return new Response('code déjà utilisé', { status: 409 });
    if (role === 'commande' && !this.state.getWebSockets('tele').length) return new Response('aucune télé avec ce code', { status: 404 });
    if (this.state.getWebSockets('commande').length >= 4) return new Response('trop de télécommandes', { status: 429 });
    const paire = new WebSocketPair();
    this.state.acceptWebSocket(paire[1], [role]);
    if (role === 'commande') { this.dernierCmd = Date.now(); for (const t of this.state.getWebSockets('tele')) try { t.send(JSON.stringify({ t: 'appaire' })); } catch (e) { /* fermée */ } }
    await this.state.storage.setAlarm(Date.now() + 60e3);
    return new Response(null, { status: 101, webSocket: paire[0] });
  }
  webSocketMessage(ws, brut) {
    const role = this.state.getTags(ws)[0], s = Math.floor(Date.now() / 1000), d = this.debits.get(ws) || { s, n: 0 };
    if (d.s !== s) { d.s = s; d.n = 0; } d.n++; this.debits.set(ws, d); if (d.n > 20) return;
    if (role === 'commande') {
      const m = admettre(brut); if (!m) return; this.dernierCmd = Date.now();
      for (const t of this.state.getWebSockets('tele')) try { t.send(JSON.stringify(m)); } catch (e) { /* fermée */ }
    } else {
      const m = admettreEtat(brut); if (!m) return;
      for (const c of this.state.getWebSockets('commande')) try { c.send(JSON.stringify(m)); } catch (e) { /* fermée */ }
    }
  }
  webSocketClose(ws) { try { ws.close(1000, 'fin'); } catch (e) { /* déjà fermée */ } }
  async alarm() {
    const now = Date.now(), seule = !this.state.getWebSockets('commande').length;
    if (now - this.debut > 3 * 3600e3 || (seule && now - this.dernierCmd > 30 * 60e3)) { for (const w of this.state.getWebSockets()) try { w.close(1000, 'salon expiré'); } catch (e) { /* */ } return; }
    if (this.state.getWebSockets().length) await this.state.storage.setAlarm(now + 60e3);
  }
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url), h = cors(req.headers.get('Origin'));
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    if (req.method !== 'GET') return new Response('GET seulement', { status: 405, headers: h });
    if (u.pathname === '/sante') return new Response('ok', { headers: h });
    if (u.pathname === '/tele/ws') {
      const code = u.searchParams.get('code') || '';
      if (!/^\d{4}$/.test(code)) return new Response('code à 4 chiffres attendu', { status: 400, headers: h });
      return env.SALONS.get(env.SALONS.idFromName('salon-' + code)).fetch(req);
    }
    const c = cible(req.url);
    if (!c) return new Response('route inconnue', { status: 404, headers: h });
    if (c.erreur) return new Response(c.erreur, { status: 400, headers: h });
    const cache = caches.default, cle = new Request(c.sym ? c.url + '?_s=' + c.sym : c.url);
    let r = await cache.match(cle);   // instrument : une clé de cache par symbole (la liste Kraken est filtrée)
    if (!r) {
      const brut = await fetch(c.url, { headers: { 'User-Agent': 'rayle-or-relais' } });
      if (!brut.ok) return new Response('source Kraken indisponible (' + brut.status + ')', { status: 502, headers: h });
      let corps = await brut.text();
      if (c.filtre === 'tickers') { try { const d = JSON.parse(corps); corps = JSON.stringify({ tickers: (d.tickers || []).filter(x => SYMBOLES.includes(x.symbol)) }); } catch (e) { return new Response('réponse Kraken illisible', { status: 502, headers: h }); } }
      if (c.filtre === 'instrument') { try { const d = JSON.parse(corps); corps = JSON.stringify({ instrument: (d.instruments || []).find(i => i.symbol === (c.sym || 'PF_XAUUSD')) || null }); } catch (e) { return new Response('réponse Kraken illisible', { status: 502, headers: h }); } }
      r = new Response(corps, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${c.ttl}` } });
      ctx.waitUntil(cache.put(cle, r.clone()));
    }
    const o = new Response(r.body, r); for (const [k, v] of Object.entries(h)) o.headers.set(k, v); o.headers.set('Cache-Control', 'no-store');
    return o;
  }
};
