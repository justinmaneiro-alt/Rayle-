import http from 'node:http';

/* Faux Worker de Raylé pour les tests du terminal de Mars : /ping et /marche (même forme que la vraie route : source, secours, différé, note, maj, bougies).
   Bougies DÉTERMINISTES (marche aléatoire par instrument, 500 bougies arrêtées à `maintenant`) ; le volume du Nasdaq vient de « l'indice », celui de l'or est nul
   (comme Twelve Data) et le contrat à terme GC=F en a un (le proxy). Scénarios modifiables en cours de test : panne d'un instrument, tout en panne, secours, lenteur.
   Chaque requête est notée dans `journal`. */
const PAS = { '15min': 900e3, '1h': 3600e3, '4h': 14400e3, '1day': 86400e3 };
const BASE = { BTC: 68000, SOL: 150, DOGE: 0.18, EUR: 1.08, NDX: 29800, XAU: 4150, 'Y:NQ=F': 30050, 'Y:GC=F': 4155, 'Y:DX-Y.NYB': 101.6, 'Y:^TNX': 5.1, 'Y:^VIX': 16.5 };
const NOM = { BTC: 'Bitcoin', SOL: 'Solana', EUR: 'EUR/USD', NDX: 'US100 (Nasdaq 100 cash)', XAU: 'Or (XAU/USD)', 'Y:NQ=F': 'NQ=F', 'Y:GC=F': 'GC=F', 'Y:DX-Y.NYB': 'DX-Y.NYB', 'Y:^TNX': '^TNX', 'Y:^VIX': '^VIX' };
const SRC = { NDX: ['Yahoo Finance', '^NDX', true], XAU: ['Twelve Data', 'XAU/USD', false], BTC: ['Kraken', 'XBTUSD', false], SOL: ['Kraken', 'SOLUSD', false], EUR: ['Twelve Data', 'EUR/USD', false] };
function alea(g) { let a = g >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function bougies(actif, iv, n, fin) {
  const pas = PAS[iv], base = BASE[actif] || 100, a = alea([...actif + iv].reduce((s, c) => s * 31 + c.charCodeAt(0), 7)), out = [];
  const bruit = base * (iv === '1day' ? 0.009 : iv === '4h' ? 0.005 : iv === '1h' ? 0.0028 : 0.0015);
  let c = base * (0.97 + a() * 0.02);
  const debut = Math.floor(fin / pas) * pas - (n - 1) * pas;
  for (let i = 0; i < n; i++) {
    const o = c, tendance = Math.sin(i / 23) * bruit * 0.25, cl = o + (a() - 0.49) * bruit + tendance, h = Math.max(o, cl) + a() * bruit * 0.5, l = Math.min(o, cl) - a() * bruit * 0.5;
    const vol = actif === 'XAU' || actif === 'EUR' || actif.startsWith('Y:DX') || actif.startsWith('Y:^') ? 0 : Math.round((1 + a()) * (actif === 'NDX' ? 2.5e6 : 6000));
    out.push({ t: debut + i * pas, o, h, l, c: cl, v: vol }); c = cl;
  }
  const dec = base * (1 + (a() - 0.5) * 0.004) - out[out.length - 1].c;   // toutes les unités se terminent près du même prix (comme un vrai marché)
  return out.map(x => ({ ...x, o: x.o + dec, h: x.h + dec, l: x.l + dec, c: x.c + dec }));
}
export function demarrerFauxWorkerMarche(port = 8797) {
  const journal = [], scenario = { pannes: new Set(), toutEnPanne: false, secoursXAU: false, delai: 0, maintenant: () => Date.now() };
  const srv = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const u = new URL(req.url, 'http://x'); journal.push(u.pathname + u.search);
    const rep = (o, c = 200) => { res.writeHead(c, cors); res.end(JSON.stringify(o)); };
    const faire = () => {
      if (u.pathname === '/ping') return rep({ ok: true, version: 'faux-marche', adresse: 'tu', voix: 'Test', feminin: true, vitesse: -8, ia: ['Local'], d1: false, mode: 'normal' });
      if (u.pathname === '/securite/etat') return rep({ appareil: null, appaire: false, configure: false, deverrouille: false, expire_dans: 0, bloque_dans: 0, defi_dans: 0 });
      if (['/evenements', '/reglages', '/memoire', '/souvenirs'].includes(u.pathname)) return rep({ alertes: [], mode: 'normal', notes: [], items: [] });
      if (u.pathname === '/marche') {
        const actif = u.searchParams.get('actif'), iv = u.searchParams.get('intervalle'), n = Math.min(500, Number(u.searchParams.get('n')) || 250);
        if (!PAS[iv] || !(actif in BASE)) return rep({ error: 'paramètres invalides' }, 400);
        if (scenario.toutEnPanne || scenario.pannes.has(actif)) return rep({ error: 'données indisponibles pour ' + actif, essais: ['Yahoo Finance : HTTP 429', 'Twelve Data : budget du jour atteint'] }, 502);
        const s = SRC[actif] || ['Yahoo Finance', actif.replace(/^Y:/, ''), true], secours = actif === 'XAU' && scenario.secoursXAU;
        const bars = bougies(actif, iv, n, scenario.maintenant());
        return rep({ actif, nom: NOM[actif], intervalle: iv, source: secours ? 'Yahoo Finance' : s[0], symbole_source: secours ? 'GC=F' : s[1], secours, differe: secours ? true : s[2], note: secours ? "SECOURS : contrat à terme sur l'or" : actif === 'XAU' ? 'or comptant' : 'indice Nasdaq 100 au comptant', maj: new Date().toISOString(), cache: 'non', bougies: bars });
      }
      if (u.pathname === '/contexte') {
        if (scenario.toutEnPanne || scenario.contexteEnPanne) return rep({ error: 'contexte indisponible : toutes les sources ont échoué' }, 502);
        const L = (id, label, prix, v, unite = '', source = 'Yahoo Finance', secours = false) => ({ id, label, unite, prix, veille: prix / (1 + v / 100), variation_pct: v, source, secours });
        return rep({ maj: new Date(scenario.maintenant()).toISOString(), lignes: [L('VIX', 'VIX', 16.5, 2.1), L('DXY', 'Dollar (DXY)', 101.6, -0.3), L('US10Y', 'Taux US 10 ans', 4.1, 0.6, '%'), L('NVDA', 'Nvidia', 190.2, 1.4, '', 'Finnhub'), L('AAPL', 'Apple', 250.1, -0.2), L('MSFT', 'Microsoft', 520.3, 0.5), L('AMZN', 'Amazon', 230, 0.9), L('GOOGL', 'Alphabet', 190, -0.7), L('META', 'Meta', 700, 0.3), L('AVGO', 'Broadcom', 360, 1.1), L('TSLA', 'Tesla', 330, -1.6, '', 'Yahoo Finance', scenario.secoursContexte === true)] });
      }
      rep({ error: 'route inconnue' }, 404);
    };
    scenario.delai ? setTimeout(faire, scenario.delai) : faire();
  });
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok({ url: 'http://127.0.0.1:' + port, journal, scenario, fermer: () => new Promise(r => srv.close(r)) })));
}
