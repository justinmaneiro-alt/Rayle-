// Routes locales /__flux/… (branchées dans serveur.mjs) : la fenêtre « Carte de liquidité » lit le carnet enregistré par le service PC, SANS passer par le Worker (les données sont sur ce PC et ne
// quittent jamais ce PC). Mêmes garde-fous que le Veilleur et l'agent : hôte local et même origine (requeteAutorisee). Lecture seule : aucune route n'écrit ni ne passe d'ordre.
//   GET /__flux/statut                                      { ok, enregistre, phrase, jours, octets, trous… }
//   GET /__flux/plage?cle=binance-spot-BTC                  { debut, fin } (ms) : de quand à quand on peut rejouer
//   GET /__flux/profondeur?cle=…&t0=…&t1=…                  octets : segments (strategies/liquidite/format-profondeur.js : decoderSegments), au plus 1 800 secondes par appel
//   GET /__flux/lignes?type=trades|evenements|liquidations&cle=…&t0=…&t1=…   { ok, lignes } (au plus 20 000)
//   GET /__flux/exemples                                   { ok, exemples } (« ici j'aurais acheté / vendu » notés par Justin)
//   POST /__flux/exemples  { t, sens: 'achat'|'vente', actif, flux, prix }   ajoute UN exemple (la SEULE écriture : un exemple de Justin, jamais un ordre)
//   GET /__flux/analyse?actif=BTC&venue=binance-spot&minutes=20   { ok, analyse } (murs, aimants, « où va le marché ? »)
import fs from 'node:fs';
import path from 'node:path';
import { requeteAutorisee } from './multi-ecrans.mjs';
import { dossierAgent } from '../agent-pc/etat-agent.mjs';
import { statutFlux } from '../agent-pc/flux/service-flux.mjs';
import { analyserActif, stockageDe, VENUES } from '../agent-pc/flux/analyse-liquidite.mjs';

const ACTIFS = ['BTC', 'SOL', 'DOGE'], TYPES = ['trades', 'evenements', 'liquidations'];
const cleValide = c => { const m = /^(binance-spot|binance-fut|kraken)-(BTC|SOL|DOGE)$/.exec(String(c || '')); return m ? { venue: m[1], actif: m[2] } : null; };
export function creerRoutesFlux(env = process.env) {
  const dossier = () => dossierAgent(env);
  async function gerer(req, res, chemin) {
    const json = (code, obj) => { const t = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(t) }); res.end(t); };
    const refus = requeteAutorisee(req); if (refus) return json(403, { ok: false, erreur: refus });
    const u = new URL(req.url, 'http://x'), q = u.searchParams, route = chemin.replace(/^\/__flux\//, '');
    if (req.method === 'POST' && route === 'exemples') return recevoirExemple(req, json);
    if (req.method !== 'GET') return json(405, { ok: false, erreur: 'lecture seule' });
    try {
      if (route === 'statut') return json(200, { ok: true, ...statutFlux(dossier()) });
      if (route === 'exemples') { const f = path.join(dossier(), 'exemples.jsonl'); let l = []; try { l = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { /* aucun */ } return json(200, { ok: true, exemples: l.slice(-500) }); }
      const c = cleValide(q.get('cle'));
      if (route === 'plage') { if (!c) return json(400, { ok: false, erreur: 'flux inconnu' }); return json(200, { ok: true, plage: stockageDe(dossier()).plageEnregistree(q.get('cle')) }); }
      if (route === 'profondeur') {
        if (!c) return json(400, { ok: false, erreur: 'flux inconnu' }); const t1 = Number(q.get('t1')) || Date.now(), t0 = Math.max(Number(q.get('t0')) || t1 - 600e3, t1 - 1800e3);
        const r = stockageDe(dossier()).lireProfondeurOctets(q.get('cle'), t0, t1); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': r.octets.length, 'X-Secondes': String(r.secondes) }); return res.end(Buffer.from(r.octets));
      }
      if (route === 'lignes') {
        if (!c || !TYPES.includes(q.get('type'))) return json(400, { ok: false, erreur: 'paramètres invalides' }); const t1 = Number(q.get('t1')) || Date.now(), t0 = Math.max(Number(q.get('t0')) || t1 - 600e3, t1 - 3600e3);
        return json(200, { ok: true, lignes: stockageDe(dossier()).lireLignes(q.get('type'), q.get('cle'), t0, t1).slice(-20000) });
      }
      if (route === 'analyse') {
        const actif = String(q.get('actif') || 'BTC').toUpperCase(), venue = q.get('venue') || 'binance-spot'; if (!ACTIFS.includes(actif) || !VENUES.includes(venue)) return json(400, { ok: false, erreur: 'paramètres invalides' });
        const minutes = Math.min(60, Math.max(2, Number(q.get('minutes')) || 20)), maintenant = Number(q.get('t')) || Date.now();
        return json(200, { ok: true, analyse: await analyserActif({ dossier: dossier(), actif, venue, minutes, maintenant }) });
      }
      return json(404, { ok: false, erreur: 'route inconnue' });
    } catch (e) { return json(500, { ok: false, erreur: String(e.message).slice(0, 160) }); }
  }
  const lireCorps = req => new Promise((resolve, reject) => { let n = 0; const m = []; req.on('data', c => { n += c.length; if (n > 4096) { reject(new Error('corps trop gros')); req.destroy(); } else m.push(c); }); req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(m).toString('utf8') || '{}')); } catch (e) { reject(new Error('JSON invalide')); } }); req.on('error', reject); });
  async function recevoirExemple(req, json) {
    try {
      const b = await lireCorps(req), t = Number(b.t), actif = String(b.actif || '').toUpperCase();
      if (!(t > 1e12) || !['achat', 'vente'].includes(b.sens) || !ACTIFS.includes(actif)) return json(400, { ok: false, erreur: 'exemple invalide (t, sens achat|vente, actif BTC|SOL|DOGE)' });
      const ex = { t, sens: b.sens, actif, flux: String(b.flux || '').slice(0, 20), prix: Number(b.prix) || null, source: String(b.source || 'carte').slice(0, 20), cree: Date.now() };
      fs.mkdirSync(dossier(), { recursive: true }); fs.appendFileSync(path.join(dossier(), 'exemples.jsonl'), JSON.stringify(ex) + '\n'); return json(200, { ok: true, exemple: ex });
    } catch (e) { return json(400, { ok: false, erreur: String(e.message).slice(0, 100) }); }
  }
  return { gerer };
}
