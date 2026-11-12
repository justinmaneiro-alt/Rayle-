/* ═════════════ RSI 14 SOUS LE PRIX : interface (case dans Couches, mise à jour à chaque changement, infobulle des divergences) ═════════════
   Calcul : rsi-lecture-v1.js. Dessin : graph.rsi() (une seule sous-fenêtre). Un SEUL RSI à l'écran : il suit la timeframe affichée du graphique.
   Case « RSI » dans Couches, activée par défaut, état mémorisé (couche « rsi » du graphique). Information de lecture, jamais un ordre. */
import * as R from './rsi-lecture-v1.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function monterRsi(T, { intervalleMs = 700 } = {}) {
  const graph = T.graph, E = { cle: '', analyse: null, bougies: 0, dessine: false, divs: [] };
  const zone = T.R && T.R.querySelector('[data-graph]');
  const bulle = document.createElement('div'); bulle.className = 'tor-ft-bulle'; bulle.hidden = true; bulle.setAttribute('role', 'tooltip');
  if (zone) { zone.style.position = zone.style.position || 'relative'; zone.appendChild(bulle); }
  const periode = () => { try { return (T.moteur && T.moteur.S && T.moteur.S.periode) || (T.etat && T.etat().periode) || ''; } catch (e) { return ''; } };

  function maj(force = false) {
    const actif = graph.couches().rsi !== false, B = (graph.etat().bougies || []).filter(b => b && Number.isFinite(b.c));
    const dernier = B.length ? B[B.length - 1] : null, cle = [actif, periode(), B.length, dernier && dernier.t, dernier && dernier.c].join('|');
    if (!force && cle === E.cle) return false; E.cle = cle;
    if (!actif || B.length < R.P.periode + 2) { if (E.dessine) { graph.rsi(null); E.dessine = false; } E.analyse = null; E.divs = []; return true; }
    const a = R.analyser(B); E.analyse = a; E.bougies = B.length;
    const pts = []; a.rsi.forEach((v, i) => { if (v != null) pts.push({ t: B[i].t, v }); });
    E.divs = a.divergences.filter(d => d.i2 >= B.length - 400);
    graph.rsi(pts.slice(-1500), E.divs); E.dessine = true; return true;
  }

  let abonne = false;
  function abonner() {
    if (abonne) return; const ch = graph.chart && graph.chart(); if (!ch) return; abonne = true;
    ch.subscribeCrosshairMove(p => {
      if (!p || !p.point || p.time == null || !E.divs.length || (p.paneIndex != null && p.paneIndex !== 2)) { bulle.hidden = true; return; }
      const d = E.divs.find(x => { const t1 = graph.tempsDeBougie ? graph.tempsDeBougie(x.t1) : null, t2 = graph.tempsDeBougie ? graph.tempsDeBougie(x.t2) : null; return t1 != null && t2 != null && p.time >= t1 && p.time <= t2; });
      if (!d) { bulle.hidden = true; return; }
      bulle.innerHTML = `<div class="tor-ft-f"><b>${esc(d.nom)}</b><span>${esc(R.texteDivergence(d))}</span></div>`; bulle.hidden = false;
      const w = bulle.offsetWidth || 260; bulle.style.left = Math.max(4, Math.min(p.point.x + 12, (zone ? zone.clientWidth : 600) - w - 4)) + 'px'; bulle.style.top = Math.max(4, p.point.y - 70) + 'px';
    });
  }
  const pompe = setInterval(() => { try { abonner(); maj(); } catch (e) { console.warn('RSI :', e.message); } }, intervalleMs);
  const api = {
    maj, analyse: () => E.analyse,
    etat: () => ({ actif: graph.couches().rsi !== false, dessine: E.dessine, periode: periode(), bougies: E.bougies, dernier: E.analyse ? E.analyse.dernier : null, divergences: E.divs.length, graphe: graph.rsiEtat ? graph.rsiEtat() : null }),
    detruire() { clearInterval(pompe); }
  };
  setTimeout(() => { try { maj(true); } catch (e) { /* */ } }, 300);
  return api;
}
