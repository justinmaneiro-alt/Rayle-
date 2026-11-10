/* Worker de la couche « Mouvements H1 » : détecte et décrit les mouvements hors du fil principal (l'interface n'est jamais bloquée).
   Message : { id, bars: Float64Array [t, o, h, l, c, …], seuil, maintenant } → { id, ok, moves, stats, n, ms, debut, fin } */
import { calculer } from './mouvements-calcul.js';
onmessage = e => {
  const m = e.data || {}, t0 = Date.now();
  try {
    const a = m.bars, B = []; for (let i = 0; i + 4 < a.length; i += 5) B.push({ t: a[i], o: a[i + 1], h: a[i + 2], l: a[i + 3], c: a[i + 4] });
    const r = calculer(B, { seuilAtr: m.seuil, maintenant: m.maintenant }); postMessage({ id: m.id, ok: true, ...r, ms: Date.now() - t0 });
  } catch (err) { postMessage({ id: m.id, ok: false, erreur: String(err.message || err) }); }
};
