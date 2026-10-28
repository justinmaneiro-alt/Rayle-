// Routes locales /__flux/… (branchées dans serveur.mjs) : la fenêtre « Carte de liquidité » lit le carnet enregistré par le service PC, SANS passer par le Worker (les données sont sur ce PC et ne
// quittent jamais ce PC). Mêmes garde-fous que le Veilleur et l'agent : hôte local et même origine (requeteAutorisee). Lecture seule : aucune route n'écrit ni ne passe d'ordre.
//   GET /__flux/statut                                      { ok, enregistre, phrase, jours, octets, trous… }
//   GET /__flux/plage?cle=binance-spot-BTC                  { debut, fin } (ms) : de quand à quand on peut rejouer
//   GET /__flux/profondeur?cle=…&t0=…&t1=…                  octets : segments (strategies/liquidite/format-profondeur.js : decoderSegments), au plus 1 800 secondes par appel
//   GET /__flux/lignes?type=trades|evenements|liquidations&cle=…&t0=…&t1=…   { ok, lignes } (au plus 20 000)
//   GET /__flux/analyse?actif=BTC&venue=binance-spot&minutes=20   { ok, analyse } (murs, aimants, « où va le marché ? »)
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
    if (req.method !== 'GET') return json(405, { ok: false, erreur: 'lecture seule' });
    const u = new URL(req.url, 'http://x'), q = u.searchParams, route = chemin.replace(/^\/__flux\//, '');
    try {
      if (route === 'statut') return json(200, { ok: true, ...statutFlux(dossier()) });
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
  return { gerer };
}
