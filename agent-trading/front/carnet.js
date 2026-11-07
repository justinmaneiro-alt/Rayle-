/* ═════════════ CARNET KRAKEN EN DIRECT (échelle de prix, tailles, cumuls, murs, ordres qui apparaissent / disparaissent) ═════════════
   Source : WebSocket public de Kraken Futures, ouvert par le navigateur (carnet-kraken.js) : chaque actif affiche SON instrument, nommé en en-tête.
   Colonnes : cumul acheteurs | acheteurs | PRIX | vendeurs | cumul vendeurs. Regroupement des prix au choix (mémorisé par actif).
   Spread, déséquilibre acheteurs / vendeurs (± 0,5 %), âge de la dernière mise à jour, grosses transactions de CET actif.
   Contrôle : milieu du carnet à moins de 0,1 % du prix affiché, sinon erreur claire et carnet masqué (jamais deux carnets mélangés).
   Murs et cases regardées : publiés par le moteur (affichage seulement). */
import { pluriel } from './or/texte-or.js';
import { fmtPrix, fmtNombre, heureParis } from '../commun/format.js';
import { PAR_ID } from '../commun/actifs.js';
import { creerFluxKraken, regrouper, meilleurs, desequilibre, controlePrix, pasProposes, seuilGros } from './carnet-kraken.js';

const LIGNE = 15, MAX_LIGNES = 160;   // lignes dessinées de chaque côté (le carnet complet reste en mémoire)
const couleur = (el, v) => getComputedStyle(el).getPropertyValue(v).trim();
const lireL = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const ecrireL = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* */ } };

export function creerCarnet(el, { racine, WS } = {}) {
  el.innerHTML = '<p class="at-cn-instr" data-cn-instr>—</p>'
    + '<div class="at-cn-barre"><label>Regrouper <select data-cn-pas></select></label><span data-cn-spread></span><span data-cn-deseq></span><span data-cn-age></span></div>'
    + '<p class="at-cn-erreur" data-cn-erreur role="alert" hidden></p>'
    + '<div class="at-cn-tete"><span>Cumul</span><span>Acheteurs</span><span>Prix</span><span>Vendeurs</span><span>Cumul</span></div>'
    + '<div class="at-cn-defil"><canvas></canvas></div><div class="at-cn-bas"><button type="button" class="at-btn at-cn-centrer">⌖ Centrer</button><span class="at-cn-info"></span></div>'
    + '<div class="at-cn-gros"><h4>Grosses transactions <small data-cn-gros-actif></small></h4><ol></ol></div>';
  const q = s => el.querySelector(s), defil = q('.at-cn-defil'), canvas = q('canvas'), ctx = canvas.getContext('2d'), info = q('.at-cn-info'), gros = q('.at-cn-gros ol'), selPas = q('[data-cn-pas]'), erreur = q('[data-cn-erreur]');
  let koDepuis = 0, actif = null, symbole = null, prixActif = null, moteur = null, avant = new Map(), flashs = [], centrer = true, anim = null, image = null, pas = null, verifie = null;
  const etatCx = { connexion: '—', erreur: null, resync: 0 };
  const flux = creerFluxKraken({ WS, surMaj: () => planifier(), surEtat: e => { Object.assign(etatCx, e); planifier(); } });
  q('.at-cn-centrer').onclick = () => { centrer = true; dessiner(); };
  defil.addEventListener('scroll', () => { if (!defil._auto) centrer = false; defil._auto = false; }, { passive: true });
  selPas.addEventListener('change', () => { pas = Number(selPas.value); ecrireL('rayle_at_cn_pas_' + actif, selPas.value); avant = new Map(); dessiner(); });
  const tick = setInterval(() => majTexte(), 1000);

  function dureeFlash() { const v = couleur(racine, '--at-d-flash'); return parseFloat(v) || 650; }
  let minCtl = null; function planifierControle() { if (!minCtl) minCtl = setTimeout(() => { minCtl = null; dessiner(); }, 3100); }
  function planifier() { if (!image) image = requestAnimationFrame(() => { image = null; dessiner(); }); }

  /* appelé à chaque état du moteur : actif affiché, prix de l'actif, murs, cases regardées */
  function maj(a, x) {
    const ins = PAR_ID[a];
    if (a !== actif) {
      actif = a; koDepuis = 0; symbole = ins ? ins.symbole : null; avant = new Map(); flashs = []; centrer = true; pas = null; verifie = null;
      q('[data-cn-instr]').textContent = ins ? `Kraken Futures · ${ins.symbole} · ${ins.nom} (perpétuel)` : '—';
      q('[data-cn-gros-actif]').textContent = ins ? ins.symbole : '';
      ctx.clearRect(0, 0, canvas.width, canvas.height); gros.innerHTML = '';
      if (symbole) flux.changer(symbole);
    }
    prixActif = x && x.prix > 0 ? x.prix : null; moteur = x || null; planifier();
  }

  function remplirPas(c, m) {
    const tk = (PAR_ID[actif] || {}).tick || c.tick;   // l'instantané Futures envoie tickSize = null : pas de prix de l'instrument (actifs.js)
    if (pas != null || !tk || !m) return;
    const L = pasProposes(tk, m.milieu), mem = Number(lireL('rayle_at_cn_pas_' + actif, ''));
    // défaut : le plus petit pas qui donne au moins 0,005 % du prix (lisible)
    pas = L.includes(mem) ? mem : (L.find(p => p >= m.milieu * 0.00005) || L[0]);
    selPas.innerHTML = L.map(p => `<option value="${p}" ${p === pas ? 'selected' : ''}>${fmtPrix(actif, p)}</option>`).join('');
  }

  function majTexte() {
    const c = flux.carnet(), e = flux.etat(), m = c && c.pret ? meilleurs(c) : null;
    q('[data-cn-age]').textContent = e.age != null ? `mis à jour il y a ${e.age < 1500 ? 'moins de 1 s' : Math.round(e.age / 1000) + ' s'} · ${etatCx.connexion}` : etatCx.connexion;
    if (!m) return;
    q('[data-cn-spread]').textContent = `spread ${fmtPrix(actif, m.spread)} (${fmtNombre(m.spread / m.milieu * 1e4, 1)} pb)`;
    const d = desequilibre(c, m.milieu);
    q('[data-cn-deseq]').textContent = d == null ? '' : `acheteurs ${fmtNombre(d * 100, 0)} % / vendeurs ${fmtNombre((1 - d) * 100, 0)} % (± 0,5 %)`;
  }

  function dessiner() {
    const c = flux.carnet(); majTexte();
    if (!c || !c.pret || c.symbole !== symbole) { info.textContent = etatCx.erreur ? 'Carnet : ' + etatCx.erreur : `Carnet ${symbole || ''} en attente…`; return; }
    const m = meilleurs(c); if (!m) return;
    remplirPas(c, m);
    // contrôle : le carnet doit être celui de l'actif affiché (milieu à moins de 0,1 % du prix)
    verifie = controlePrix(m.milieu, prixActif);
    // un écart d'un instant (dernier prix échangé de quelques secondes sur un marché calme) n'est pas une erreur : il doit durer 3 s
    if (verifie.ok === false) koDepuis = koDepuis || Date.now(); else koDepuis = 0;
    if (verifie.ok === false && Date.now() - koDepuis >= 3000) {
      erreur.hidden = false; erreur.textContent = `Erreur : le carnet ${symbole} (milieu ${fmtPrix(actif, m.milieu)}) s’écarte de ${fmtNombre(verifie.ecart * 100, 2)} % du prix affiché de ${actif} (${fmtPrix(actif, prixActif)}). Carnet masqué tant que l’écart dépasse 0,1 %.`;
      ctx.clearRect(0, 0, canvas.width, canvas.height); el.dataset.controle = 'ko'; return;
    }
    erreur.hidden = true; el.dataset.controle = verifie.ok ? 'ok' : verifie.ok === false ? 'ecart-bref' : 'inconnu'; if (verifie.ok === false) planifierControle();
    const G = regrouper(c, pas), a = actif, dpr = window.devicePixelRatio || 1, W = defil.clientWidth || 300;
    const asks = G.asks.slice(0, MAX_LIGNES), bids = G.bids.slice(0, MAX_LIGNES);
    // flashs : apparition / disparition sur les niveaux regroupés
    const nouveau = new Map(), t = performance.now();
    for (const [p, qq] of bids) nouveau.set('b' + p, qq); for (const [p, qq] of asks) nouveau.set('a' + p, qq);
    if (avant.size) {
      for (const [k, qq] of nouveau) { const q0 = avant.get(k) || 0; if (qq > q0 * 1.5 && qq - q0 > 0) flashs.push({ k, t, type: 'apparu' }); }
      for (const [k, q0] of avant) { const qq = nouveau.get(k) || 0; if (qq < q0 * 0.4) flashs.push({ k, t, type: 'disparu' }); }
      if (flashs.length > 400) flashs = flashs.slice(-400);
    }
    avant = nouveau;
    const lignes = asks.slice().reverse().map(r => ({ cote: 'a', p: r[0], q: r[1], cum: r[2] })).concat(bids.map(r => ({ cote: 'b', p: r[0], q: r[1], cum: r[2] })));
    const H = lignes.length * LIGNE;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const col = { achat: couleur(racine, '--at-achat'), vente: couleur(racine, '--at-vente'), fa: couleur(racine, '--at-carnet-achat'), fv: couleur(racine, '--at-carnet-vente'), texte: couleur(racine, '--at-texte'), doux: couleur(racine, '--at-doux'), mur: couleur(racine, '--at-mur'), regard: couleur(racine, '--at-regard'), mono: couleur(racine, '--at-mono') || 'monospace' };
    const qMax = Math.max(...lignes.map(l => l.q), 1e-9), cumMax = Math.max(bids.length ? bids[bids.length - 1][2] : 0, asks.length ? asks[asks.length - 1][2] : 0, 1e-9);
    const xP = W * 0.4, wP = W * 0.2, wC = W * 0.2, seau = (cote, p) => Math.round((cote === 'b' ? Math.floor(p / pas + 1e-9) : Math.ceil(p / pas - 1e-9)) * pas * 1e8) / 1e8, memeSeau = (a1, b1) => Math.abs(a1 - b1) < pas * 1e-6,
      murs = ((moteur && moteur.murs) || []).map(x => ({ cote: x.cote === 'achat' ? 'b' : 'a', p: x.p }));
    const regards = ((moteur && moteur.regard) || []).map(r => r.p), dF = dureeFlash();
    ctx.font = `11px ${col.mono}`; ctx.textBaseline = 'middle';
    let yMid = 0;
    lignes.forEach((l, i) => {
      const y = i * LIGNE, achat = l.cote === 'b', k = l.cote + l.p;
      if (!achat && lignes[i + 1] && lignes[i + 1].cote === 'b') yMid = y + LIGNE;
      const wc = l.cum / cumMax * wC, wq = Math.max(1, l.q / qMax * wC);
      ctx.fillStyle = achat ? col.fa : col.fv; ctx.globalAlpha = .35;
      if (achat) ctx.fillRect(xP - wC - wC + (wC - wc), y + 1, wc, LIGNE - 2); else ctx.fillRect(xP + wP + wC, y + 1, wc, LIGNE - 2);
      ctx.globalAlpha = 1; ctx.fillStyle = achat ? col.fa : col.fv;
      if (achat) ctx.fillRect(xP - wq, y + 1, wq, LIGNE - 2); else ctx.fillRect(xP + wP, y + 1, wq, LIGNE - 2);
      const f = flashs.findLast ? flashs.findLast(z => z.k === k) : flashs.filter(z => z.k === k).pop();
      if (f && t - f.t < dF) { ctx.globalAlpha = 1 - (t - f.t) / dF; ctx.fillStyle = f.type === 'apparu' ? (achat ? col.achat : col.vente) : 'rgba(255,255,255,.55)'; ctx.fillRect(achat ? 0 : xP + wP, y + 1, achat ? xP : W - xP - wP, LIGNE - 2); ctx.globalAlpha = 1; }
      const mur = murs.some(z => z.cote === l.cote && memeSeau(seau(l.cote, z.p), l.p));
      ctx.fillStyle = mur ? col.mur : col.doux; ctx.textAlign = 'right';
      if (achat) { ctx.fillText(fmtNombre(l.cum, 2), xP - wC - 4, y + LIGNE / 2); ctx.fillStyle = mur ? col.mur : col.texte; ctx.fillText(fmtNombre(l.q, 3), xP - 4, y + LIGNE / 2); }
      ctx.textAlign = 'center'; ctx.fillStyle = achat ? col.achat : col.vente; ctx.font = `${mur ? '700 ' : ''}11px ${col.mono}`; ctx.fillText(fmtPrix(a, l.p), xP + wP / 2, y + LIGNE / 2); ctx.font = `11px ${col.mono}`;
      ctx.textAlign = 'left';
      if (!achat) { ctx.fillStyle = mur ? col.mur : col.texte; ctx.fillText(fmtNombre(l.q, 3), xP + wP + 4, y + LIGNE / 2); ctx.fillStyle = mur ? col.mur : col.doux; ctx.fillText(fmtNombre(l.cum, 2), xP + wP + wC + 4, y + LIGNE / 2); }
      if (mur) { ctx.strokeStyle = col.mur; ctx.lineWidth = 1; ctx.strokeRect(.5, y + .5, W - 1, LIGNE - 1); }
      if (regards.some(p => memeSeau(seau(l.cote, p), l.p))) { ctx.strokeStyle = col.regard; ctx.lineWidth = 1.5; ctx.strokeRect(xP + 1, y + 1.5, wP - 2, LIGNE - 3); }
    });
    ctx.strokeStyle = 'rgba(143,208,227,.5)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, yMid + .5); ctx.lineTo(W, yMid + .5); ctx.stroke(); ctx.setLineDash([]);
    if (centrer) { defil._auto = true; defil.scrollTop = Math.max(0, yMid - defil.clientHeight / 2); }
    info.textContent = `${c.bids.size} niveaux acheteurs / ${c.asks.size} vendeurs reçus (carnet complet) · séquences contrôlées (pas de checksum dans l’API Futures)${etatCx.resync ? ` · ${pluriel(etatCx.resync, 'resynchronisation')}` : ''}`;
    // grosses transactions de CET actif (flux du même instrument)
    const tr = flux.transactions(), s = seuilGros(tr.map(x => x.usd)), G2 = tr.filter(x => x.usd >= s).slice(-8).reverse();
    gros.innerHTML = G2.map(g => `<li class="${g.cote === 'buy' ? 'at-achat' : 'at-vente'}"><time>${heureParis(g.t, true)}</time> ${g.cote === 'buy' ? 'achat' : 'vente'} ${fmtNombre(g.q, 3)} à ${fmtPrix(a, g.p)} <b>${fmtNombre(g.usd / 1000, 1)} k$</b></li>`).join('') || '<li class="at-doux">aucune pour l’instant</li>';
    if (flashs.some(z => t - z.t < dF)) { if (!anim) anim = requestAnimationFrame(() => { anim = null; dessiner(); }); }
  }
  return { maj, dessiner, controle: () => verifie, _flux: flux, detruire() { if (anim) cancelAnimationFrame(anim); if (image) cancelAnimationFrame(image); clearInterval(tick); flux.fermer(); } };
}
