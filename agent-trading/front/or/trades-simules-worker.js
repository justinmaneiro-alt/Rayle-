/* Worker de l'écran « Trades simulés » : charge le JSON (≈ 4 Mo), prépare les listes filtrées et les fenêtres de bougies, hors du fil principal.
   Messages : { id, type: 'charger', url } · { id, type: 'liste', variante, filtre, debut, fin } · { id, type: 'trade', variante, index } · { id, type: 'ensemble', variante, debut, fin } */
import { lister, resume, fenetre, dessin, fiche } from './trades-simules-calcul.js';
let D = null;
const reponse = (id, o) => postMessage({ id, ...o });
onmessage = async e => {
  const m = e.data || {}, id = m.id;
  try {
    if (m.type === 'charger') {
      const r = await fetch(m.url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      D = await r.json();
      reponse(id, { ok: true, variantes: D.variantes.map(v => ({ id: v.id, famille: v.famille, n: v.trades.length })), dates: D.dates, genere: D.genere, source: D.source, capital: D.capital, risquePct: D.risquePct, debut: D.bars.length ? D.bars[0][0] : null, fin: D.bars.length ? D.bars[D.bars.length - 1][0] : null });
      return;
    }
    if (!D) throw new Error('données non chargées');
    const v = D.variantes.find(x => x.id === m.variante); if (!v && m.type !== 'ping') throw new Error('variante inconnue : ' + m.variante);
    if (m.type === 'liste') {
      const idx = lister(v.trades, m.filtre, { debut: m.debut ?? -Infinity, fin: m.fin ?? Infinity }), s = resume(v.trades, idx);
      reponse(id, { ok: true, indices: idx, resume: s, lignes: idx.map(i => { const t = v.trades[i]; return { i, te: t.te, sens: t.sens, Rnet: t.Rnet, sortie: t.sortie }; }) });
    } else if (m.type === 'trade') {
      const t = v.trades[m.index]; if (!t) throw new Error('trade introuvable');
      reponse(id, { ok: true, trade: t, bars: fenetre(D.bars, t), dessin: dessin(t), fiche: fiche(t, { capital: D.capital, risquePct: D.risquePct }) });
    } else if (m.type === 'ensemble') {
      const idx = lister(v.trades, m.filtre || 'tous', { debut: m.debut, fin: m.fin }), a = m.debut, b = m.fin;
      let lo = 0, hi = D.bars.length; while (lo < hi) { const q = (lo + hi) >> 1; if (D.bars[q][0] < a) lo = q + 1; else hi = q; }
      let c = lo; while (c < D.bars.length && D.bars[c][0] <= b) c++;
      reponse(id, { ok: true, bars: D.bars.slice(lo, Math.min(c, lo + 9000)), trades: idx.map(i => ({ i, dessin: dessin(v.trades[i]), trade: v.trades[i] })), mouvements: (D.mouvements || []).filter(q => q.t >= a && q.t <= b) });
    } else throw new Error('message inconnu');
  } catch (err) { reponse(id, { ok: false, erreur: String(err.message || err) }); }
};
