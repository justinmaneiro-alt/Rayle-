/* ═════════════ WORKER DE L'AGENT DE TRADING (relais, aucun calcul) ═════════════
   Le moteur (PC) publie un état numéroté ; ce Worker le garde et le relaie TEL QUEL à tous les écrans (PC, tablette, téléphone) :
   mêmes octets pour tout le monde, donc mêmes chiffres. Aucun calcul de P&L ici. Aucun secret : les jetons sont vérifiés par le /ping du Worker principal.
   Routes :  GET /flux (WebSocket, 1er message {type:'auth', role:'moteur'|'ecran', jeton})   GET /etat (dernier état, en-tête X-Rayle-Token)   GET /sante */
import { DurableObject } from 'cloudflare:workers';

const enTetes = (req, env) => {
  const o = req.headers.get('Origin') || '', ok = String(env.ORIGINES || '').split(',').map(s => s.trim()).includes(o);
  return { 'Access-Control-Allow-Origin': ok ? o : 'null', 'Access-Control-Allow-Headers': 'X-Rayle-Token, Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' };
};
const json = (o, code, h) => new Response(JSON.stringify(o), { status: code || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, h || {}) });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), h = enTetes(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const objet = env.ETAT.get(env.ETAT.idFromName('principal'));
    if (url.pathname === '/flux') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket attendu' }, 426, h);
      return objet.fetch(req);
    }
    if (url.pathname === '/etat' || url.pathname === '/sante') return objet.fetch(req);
    return json({ error: 'route inconnue' }, 404, h);
  }
};

async function empreinte(t) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }

export class EtatAgent extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.cache = new Map();        // type ou historique:actif:unite → texte JSON (relayé tel quel)
    this.moteurVu = 0;
    this.pret = ctx.blockConcurrencyWhile(async () => {
      const l = await ctx.storage.get(['etat', 'lent', 'courbe', 'moteurVu']);
      for (const k of ['etat', 'lent', 'courbe']) if (l.get(k)) this.cache.set(k, l.get(k));
      this.moteurVu = l.get('moteurVu') || 0;
      const hist = await ctx.storage.list({ prefix: 'historique:' });
      for (const [k, v] of hist) this.cache.set(k, v);
    });
    this.dernierStockage = {};
  }

  /* jeton valide ? cache 1 h (empreinte seulement, jamais le jeton) ; sinon on demande au Worker principal */
  async jetonValide(jeton) {
    if (!jeton || jeton.length < 8) return false;
    const k = 'jeton:' + await empreinte(jeton), c = await this.ctx.storage.get(k);
    if (c && c > Date.now()) return true;
    try {
      const r = await fetch(this.env.WORKER_RAYLE.replace(/\/+$/, '') + '/ping', { headers: { 'X-Rayle-Token': jeton } });
      if (r.ok) { await this.ctx.storage.put(k, Date.now() + 3600e3); return true; }
    } catch (e) { /* injoignable : refus */ }
    return false;
  }

  async fetch(req) {
    await this.pret;
    const url = new URL(req.url), h = enTetes(req, this.env);
    if (url.pathname === '/sante') return json({ ok: true, moteurVu: this.moteurVu, ecrans: this.ecrans().length, moteur: this.moteurs().length > 0 }, 200, h);
    if (url.pathname === '/etat') {
      if (!(await this.jetonValide(req.headers.get('X-Rayle-Token') || ''))) return json({ error: 'jeton refusé' }, 401, h);
      const e = this.cache.get('etat');
      return new Response(`{"moteurVu":${this.moteurVu},"enLigne":${this.moteurs().length > 0},"etat":${e || 'null'},"lent":${this.cache.get('lent') || 'null'}}`, { headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, h) });
    }
    const paire = new WebSocketPair();
    this.ctx.acceptWebSocket(paire[1]);
    paire[1].serializeAttachment({ role: null, depuis: Date.now() });
    return new Response(null, { status: 101, webSocket: paire[0] });
  }

  moteurs(sauf) { return this.ctx.getWebSockets().filter(w => { if (w === sauf) return false; const a = w.deserializeAttachment(); return a && a.role === 'moteur'; }); }
  ecrans(sauf) { return this.ctx.getWebSockets().filter(w => { if (w === sauf) return false; const a = w.deserializeAttachment(); return a && a.role === 'ecran'; }); }

  informerMoteur(sauf) {
    const ecrans = this.ecrans(sauf), focus = [...new Set(ecrans.map(w => w.deserializeAttachment().focus).filter(Boolean))];
    for (const m of this.moteurs()) try { m.send(JSON.stringify({ type: 'spectateurs', n: ecrans.length, focus })); } catch (e) { /* fermé */ }
  }
  diffuser(texte) { for (const w of this.ecrans()) try { w.send(texte); } catch (e) { /* fermé */ } }
  envoyerEtatMoteur(ws, sauf) { const en = this.moteurs(sauf).length > 0; const t = JSON.stringify({ type: 'moteur', enLigne: en, moteurVu: this.moteurVu }); if (ws) ws.send(t); else this.diffuser(t); }

  async webSocketMessage(ws, msg) {
    await this.pret;
    if (typeof msg !== 'string' || msg.length > 1048000) return;
    const att = ws.deserializeAttachment() || {};
    if (!att.role) {
      let m; try { m = JSON.parse(msg); } catch (e) { ws.close(1008, 'illisible'); return; }
      if (m.type !== 'auth' || !(m.role === 'moteur' || m.role === 'ecran')) { ws.close(1008, 'auth attendue'); return; }
      if (!(await this.jetonValide(m.jeton))) { ws.send(JSON.stringify({ type: 'auth', ok: false })); ws.close(1008, 'jeton refusé'); return; }
      if (m.role === 'moteur') for (const ancien of this.moteurs()) try { ancien.close(1000, 'remplacé'); } catch (e) { /* */ }
      ws.serializeAttachment({ role: m.role, depuis: Date.now(), focus: m.focus || null });
      ws.send(JSON.stringify({ type: 'auth', ok: true }));
      if (m.role === 'ecran') {
        for (const [k, v] of this.cache) if (k.startsWith('historique:')) ws.send(v);
        for (const k of ['courbe', 'lent', 'etat']) if (this.cache.get(k)) ws.send(this.cache.get(k));
        this.envoyerEtatMoteur(ws);
      } else this.envoyerEtatMoteur(null);
      this.informerMoteur();
      return;
    }
    if (att.role === 'ecran') {   // un écran ne peut que dire ce qu'il regarde
      let m; try { m = JSON.parse(msg); } catch (e) { return; }
      if (m.type === 'focus' && (m.actif == null || /^[A-Z0-9]{2,8}$/.test(m.actif))) { att.focus = m.actif; ws.serializeAttachment(att); this.informerMoteur(); }
      return;
    }
    // moteur : on garde et on relaie tel quel
    const type = (msg.match(/^\{"type":"([a-z-]+)"/) || [])[1]; if (!type) return;
    let cle = type;
    if (type === 'historique') { const m = msg.slice(0, 200).match(/"actif":"([A-Z0-9]+)","unite":"(M15|H1)"/); if (!m) return; cle = 'historique:' + m[1] + ':' + m[2]; }
    this.cache.set(cle, msg); this.moteurVu = Date.now();
    this.diffuser(msg);
    // stockage durable (dernier état si le moteur s'éteint) : limité pour le plan gratuit
    const dernier = this.dernierStockage[cle] || 0, delai = type === 'etat' ? 30000 : 0;
    if (Date.now() - dernier >= delai) { this.dernierStockage[cle] = Date.now(); await this.ctx.storage.put({ [cle]: msg, moteurVu: this.moteurVu }); }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment() || {};
    try { ws.close(1000, 'fin'); } catch (e) { /* déjà */ }
    if (att.role === 'moteur') { await this.ctx.storage.put('moteurVu', this.moteurVu); this.envoyerEtatMoteur(null, ws); }
    if (att.role === 'ecran') this.informerMoteur(ws);
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }
}
