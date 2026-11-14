/* Worker du calcul des marchés : statistiques par actif, flèches v8 en lecture seule, couverture, performances. Aucun calcul lourd sur le fil principal.
   Messages : { id, type, ... } → { id, ok, resultat } ; types : voir calcul-dispatch.js */
import { repondre } from './calcul-dispatch.js';
self.onmessage = async e => { const { id } = e.data || {}; try { const resultat = await repondre(e.data); self.postMessage({ id, ok: true, resultat }); } catch (err) { self.postMessage({ id, ok: false, erreur: String(err && err.message || err) }); } };
