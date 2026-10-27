import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';
import { creerHistorique } from '../pc/agent-btc/historique.js';

/* Aides des tests Node de l'agent BTC : un « disque » dans un dossier (mêmes méthodes que stockage-btc.js), le vrai réseau (fetch de Node) et un cache local des VRAIES bougies
   (dossier donnees-btc-cache/, ignoré par git) pour ne pas retélécharger quatre ans de bougies à chaque essai. */
const racine = fileURLToPath(new URL('../../..', import.meta.url));
export const DOSSIER_CACHE = path.join(racine, 'donnees-btc-cache');

export function stockageFichiers(dossier = DOSSIER_CACHE) {
  fs.mkdirSync(dossier, { recursive: true });
  const f = k => path.join(dossier, k.replace(/[^A-Za-z0-9_.-]/g, '_') + '.bin');
  return {
    type: 'fichiers',
    lire: async k => { try { return v8.deserialize(fs.readFileSync(f(k))); } catch (e) { return null; } },
    ecrire: async (k, v) => { fs.writeFileSync(f(k), v8.serialize({ ...v, cle: k })); },
    supprimer: async k => { try { fs.unlinkSync(f(k)); } catch (e) { /* absent */ } },
    vider: async () => { for (const x of fs.readdirSync(dossier)) fs.unlinkSync(path.join(dossier, x)); },
    liste: async () => fs.readdirSync(dossier).filter(x => x.endsWith('.bin')).map(x => x.slice(0, -4).replace(/^M15_/, 'M15:'))
  };
}
export const lireReseau = async url => { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Rayle-test' }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

/* Historique RÉEL (cache local complété par le réseau). Rend { serie, etat }. */
export async function historiqueReel({ annees = 4, surProgres = null, maintenant = () => Date.now() } = {}) {
  const h = creerHistorique({ stockage: stockageFichiers(), lire: lireReseau, annees, maintenant });
  const etat = await h.synchroniser({ surProgres: surProgres || (() => {}) });
  return { serie: h.serie(), etat, historique: h };
}
