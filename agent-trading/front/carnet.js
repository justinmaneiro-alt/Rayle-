/* ═════════════ CARNET VIVANT (échelle de prix complète, tailles, cumuls, murs, ordres qui apparaissent / disparaissent) ═════════════
   Colonnes : cumul acheteurs | acheteurs | PRIX | vendeurs | cumul vendeurs. Petits cadres blancs = cases que l'agent analyse en ce moment.
   Affichage seulement : toutes les valeurs viennent de l'état publié par le moteur. */
import { fmtPrix, fmtNombre, heureParis } from '../commun/format.js';

const LIGNE = 15;
const couleur = (el, v) => getComputedStyle(el).getPropertyValue(v).trim();

export function creerCarnet(el, { racine }) {
  el.innerHTML = '<div class="at-cn-tete"><span>Cumul</span><span>Acheteurs</span><span>Prix</span><span>Vendeurs</span><span>Cumul</span></div>'
    + '<div class="at-cn-defil"><canvas></canvas></div><div class="at-cn-bas"><button type="button" class="at-btn at-cn-centrer">⌖ Centrer</button><span class="at-cn-info"></span></div>'
    + '<div class="at-cn-gros"><h4>Grosses transactions</h4><ol></ol></div>';
  const defil = el.querySelector('.at-cn-defil'), canvas = el.querySelector('canvas'), ctx = canvas.getContext('2d'), info = el.querySelector('.at-cn-info'), gros = el.querySelector('.at-cn-gros ol');
  let actif = null, donnees = null, avant = new Map(), flashs = [], centrer = true, anim = null, lignes = [];
  el.querySelector('.at-cn-centrer').onclick = () => { centrer = true; dessiner(); };
  defil.addEventListener('scroll', () => { if (!defil._auto) centrer = false; defil._auto = false; }, { passive: true });

  function dureeFlash() { const v = couleur(racine, '--at-d-flash'); return parseFloat(v) || 650; }
  function maj(a, x) {
    if (a !== actif) { actif = a; avant = new Map(); flashs = []; centrer = true; }
    donnees = x;
    if (!x || !x.carnet) { info.textContent = x && x.porte && !x.porte.ok ? 'Carnet : ' + (x.porte.raison || 'indisponible') : 'Carnet en attente…'; ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    const c = x.carnet, nouveau = new Map(), t = performance.now();
    for (const [p, q] of c.bids) nouveau.set('b' + p, q);
    for (const [p, q] of c.asks) nouveau.set('a' + p, q);
    if (avant.size) {
      for (const [k, q] of nouveau) { const q0 = avant.get(k) || 0; if (q > q0 * 1.5 && q - q0 > 0) flashs.push({ k, t, type: 'apparu' }); }
      for (const [k, q0] of avant) { const q = nouveau.get(k) || 0; if (q < q0 * 0.4) flashs.push({ k, t, type: 'disparu' }); }
      if (flashs.length > 400) flashs = flashs.slice(-400);
    }
    avant = nouveau;
    info.textContent = `pas ${fmtPrix(a, c.pas)} · ${c.profondeur.niveauxBids} niveaux acheteurs / ${c.profondeur.niveauxAsks} vendeurs chez Kraken`;
    gros.innerHTML = (x.gros || []).slice(-8).reverse().map(g => `<li class="${g.cote === 'buy' ? 'at-achat' : 'at-vente'}"><time>${heureParis(g.t, true)}</time> ${g.cote === 'buy' ? 'achat' : 'vente'} ${fmtNombre(g.q, 3)} à ${fmtPrix(a, g.p)} <b>${fmtNombre(g.usd / 1000, 0)} k$</b></li>`).join('') || '<li class="at-doux">aucune pour l’instant</li>';
    dessiner();
  }

  function dessiner() {
    if (!donnees || !donnees.carnet) return;
    const c = donnees.carnet, a = actif, dpr = window.devicePixelRatio || 1, W = defil.clientWidth || 300;
    lignes = c.asks.slice().reverse().map(r => ({ cote: 'a', p: r[0], q: r[1], cum: r[2] })).concat(c.bids.map(r => ({ cote: 'b', p: r[0], q: r[1], cum: r[2] })));
    const H = lignes.length * LIGNE;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const col = { achat: couleur(racine, '--at-achat'), vente: couleur(racine, '--at-vente'), fa: couleur(racine, '--at-carnet-achat'), fv: couleur(racine, '--at-carnet-vente'), texte: couleur(racine, '--at-texte'), doux: couleur(racine, '--at-doux'), mur: couleur(racine, '--at-mur'), regard: couleur(racine, '--at-regard'), mono: couleur(racine, '--at-mono') || 'monospace' };
    const qMax = Math.max(...lignes.map(l => l.q), 1e-9), cumMax = Math.max(c.bids.length ? c.bids[c.bids.length - 1][2] : 0, c.asks.length ? c.asks[c.asks.length - 1][2] : 0, 1e-9);
    const xP = W * 0.4, wP = W * 0.2, wC = W * 0.2, seau = (cote, p) => (cote === 'b' ? Math.floor(p / c.pas + 1e-9) : Math.ceil(p / c.pas - 1e-9)) * c.pas, memeSeau = (a1, b1) => Math.abs(a1 - b1) < c.pas * 1e-6,
      murs = (donnees.murs || []).map(m => ({ cote: m.cote === 'achat' ? 'b' : 'a', p: m.p }));
    const regards = (donnees.regard || []).map(r => r.p), t = performance.now(), dF = dureeFlash();
    ctx.font = `11px ${col.mono}`; ctx.textBaseline = 'middle';
    let yMid = 0;
    lignes.forEach((l, i) => {
      const y = i * LIGNE, achat = l.cote === 'b', k = l.cote + l.p;
      if (!achat && lignes[i + 1] && lignes[i + 1].cote === 'b') yMid = y + LIGNE;
      // cumul (pâle) et taille (vive)
      const wc = l.cum / cumMax * wC, wq = Math.max(1, l.q / qMax * wC);
      ctx.fillStyle = achat ? col.fa : col.fv; ctx.globalAlpha = .35;
      if (achat) ctx.fillRect(xP - wC - wC + (wC - wc), y + 1, wc, LIGNE - 2); else ctx.fillRect(xP + wP + wC, y + 1, wc, LIGNE - 2);
      ctx.globalAlpha = 1; ctx.fillStyle = achat ? col.fa : col.fv;
      if (achat) ctx.fillRect(xP - wq, y + 1, wq, LIGNE - 2); else ctx.fillRect(xP + wP, y + 1, wq, LIGNE - 2);
      // flash d'apparition / disparition
      const f = flashs.findLast ? flashs.findLast(z => z.k === k) : flashs.filter(z => z.k === k).pop();
      if (f && t - f.t < dF) { ctx.globalAlpha = 1 - (t - f.t) / dF; ctx.fillStyle = f.type === 'apparu' ? (achat ? col.achat : col.vente) : 'rgba(255,255,255,.55)'; ctx.fillRect(achat ? 0 : xP + wP, y + 1, achat ? xP : W - xP - wP, LIGNE - 2); ctx.globalAlpha = 1; }
      // textes
      const mur = murs.some(m => m.cote === l.cote && memeSeau(seau(l.cote, m.p), l.p));
      ctx.fillStyle = mur ? col.mur : col.doux; ctx.textAlign = 'right';
      if (achat) { ctx.fillText(fmtNombre(l.cum, 2), xP - wC - 4, y + LIGNE / 2); ctx.fillStyle = mur ? col.mur : col.texte; ctx.fillText(fmtNombre(l.q, 3), xP - 4, y + LIGNE / 2); }
      ctx.textAlign = 'center'; ctx.fillStyle = achat ? col.achat : col.vente; ctx.font = `${mur ? '700 ' : ''}11px ${col.mono}`; ctx.fillText(fmtPrix(a, l.p), xP + wP / 2, y + LIGNE / 2); ctx.font = `11px ${col.mono}`;
      ctx.textAlign = 'left';
      if (!achat) { ctx.fillStyle = mur ? col.mur : col.texte; ctx.fillText(fmtNombre(l.q, 3), xP + wP + 4, y + LIGNE / 2); ctx.fillStyle = mur ? col.mur : col.doux; ctx.fillText(fmtNombre(l.cum, 2), xP + wP + wC + 4, y + LIGNE / 2); }
      if (mur) { ctx.strokeStyle = col.mur; ctx.lineWidth = 1; ctx.strokeRect(.5, y + .5, W - 1, LIGNE - 1); }
      if (regards.some(p => memeSeau(seau(l.cote, p), l.p))) { ctx.strokeStyle = col.regard; ctx.lineWidth = 1.5; ctx.strokeRect(xP + 1, y + 1.5, wP - 2, LIGNE - 3); }
    });
    // écart acheteur / vendeur
    ctx.strokeStyle = 'rgba(143,208,227,.5)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, yMid + .5); ctx.lineTo(W, yMid + .5); ctx.stroke(); ctx.setLineDash([]);
    if (centrer) { defil._auto = true; defil.scrollTop = Math.max(0, yMid - defil.clientHeight / 2); }
    if (flashs.some(z => t - z.t < dF)) { if (!anim) anim = requestAnimationFrame(() => { anim = null; dessiner(); }); }
  }
  return { maj, dessiner, detruire() { if (anim) cancelAnimationFrame(anim); } };
}
