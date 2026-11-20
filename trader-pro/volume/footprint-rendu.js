/* ═════════════ FOOTPRINT : DESSIN DANS LES BOUGIES (v4.1) ═════════════
   Appelé par la couche (primitive) de volume-ui.js à chaque image, pour les SEULES bougies visibles. Aucune donnée inventée : une bougie sans transactions affiche « pas d'empreinte disponible ».
   Trois modes : « bidask » (vendeurs à gauche × acheteurs à droite), « delta » (delta par niveau), « volume » (profil horizontal dans la bougie). POC de la bougie encadré, déséquilibres 3:1 en gras,
   déséquilibres empilés (≥ 3) soulignés dans la marge, liseré cyan sur les niveaux de réaction (phase 3). Le corps et les mèches restent visibles en fin contour (les bougies natives sont rendues transparentes). */
import { PARAMS_FOOTPRINT as P, regrouperPrix, tailleCible, analyserBougie, intensite, surNiveau, ligneDuPrix } from './footprint-calcul.js';
import { TEXTE_ABSENT } from './footprint-donnees.js';

export const COULEUR_REACTION = '#7fb3c2';   // teinte discrète des niveaux (palette v6)
const VERT = [95, 184, 148], ROUGE = [216, 106, 106], rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const kfmt = v => { const a = Math.abs(v); const d = (x, n) => (+x.toFixed(n)).toString().replace('.', ','); return a >= 1e6 ? d(v / 1e6, 1) + 'M' : a >= 1e3 ? d(v / 1e3, a >= 1e4 ? 0 : 1) + 'k' : a >= 100 ? d(v, 0) : a >= 10 ? d(v, 1) : d(v, 2); };
const sk = v => (v >= 0 ? '+' : '−') + kfmt(Math.abs(v));

export const seuilMode = mode => (mode === 'bidask' ? P.seuilDeltaPx : P.seuilVolumePx);
/* espacement entre bougies en pixels (mesuré sur les coordonnées : fiable quel que soit le zoom) */
export function espacement(env) { const B = env.bars; for (let i = B.length - 1; i > 0; i--) { const a = env.xDe(B[i].t), b = env.xDe(B[i - 1].t); if (a != null && b != null) return Math.abs(a - b); } return 0; }

/* cases d'une bougie : archive d'abord (taille chargée), sinon le direct ; renvoie { niveaux, partielle, origine } ou { raison } */
export function casesBougie(env, b, cible) {
  const { actif, unite, store, live } = env;
  const archive = store.cases(actif, unite, cible.source, b.t);
  if (archive && archive.length) return { niveaux: regrouperPrix(archive, cible.source, cible.pas), origine: 'archive', partielle: false };
  const direct = live && live.casesBougie(unite, b.t);
  if (direct && direct.length) { const fin = live.fin; return { niveaux: regrouperPrix(direct, fin, Math.max(cible.pas, fin)), origine: 'direct', partielle: live.partielle(unite, b.t) }; }
  const e = store.etatBougie(actif, unite, b.t);
  return { raison: e && e.texte, code: e && e.code };
}

export function dessiner(sc, env) {
  const { chart, opts, bars } = env, mode = opts.empMode || 'bidask', c = sc.context, hr = sc.horizontalPixelRatio, vr = sc.verticalPixelRatio;
  const esp = espacement(env), r = chart.timeScale().getVisibleRange(); env.rendu = { actif: false, esp, lignes: new Map() };
  if (!r || !bars.length || esp < 30) return;
  const I = env.store.info(env.actif), sansSource = !I && !(env.live && env.live.nHeures && env.live.nHeures() > 0);   // archive absente ou injoignable et rien en direct : jamais de cases grises, on retombe sur les bougies normales
  const modeFP = env.footprint !== false && env.opts.empreinte && esp >= seuilMode(mode) && !sansSource;
  if (!modeFP) { env.rendu.actif = false; return env.opts.vd ? dessinerVD(sc, env, r) : undefined; }
  env.rendu.actif = true;
  /* pixels par unité de prix, mesuré autour du dernier cours */
  const ref = bars[bars.length - 1].c, dref = Math.max(ref * 1e-4, 1e-9), y0 = env.yDe(ref), y1 = env.yDe(ref + dref); if (y0 == null || y1 == null) return; const pxParPrix = Math.abs(y1 - y0) / dref; env.rendu.px = pxParPrix;
  const aRattraper = new Set(), visibles = []; for (const b of bars) { const tt = Math.floor(b.t / 1000); if (tt >= r.from - 2 && tt <= r.to + 2) visibles.push(b); }
  const tailles = I ? I.tailles[env.unite] : null, ligneMin = mode === 'volume' ? P.hauteurLigneProfil : P.hauteurLigneMin, minPas = (visibles.length ? Math.max(...visibles.map(b => b.h - b.l)) : 0) / P.maxCases;
  const cible = tailles ? tailleCible(tailles, pxParPrix, ligneMin, minPas) : env.live ? tailleCible([env.live.fin], pxParPrix, ligneMin, minPas) : null;
  if (cible && I && visibles.length) env.store.assurer(env.actif, env.unite, cible.source, visibles[0].t, visibles[visibles.length - 1].t);
  const w = Math.max(20, esp * 0.84), demi = w / 2;
  c.textBaseline = 'middle'; env.rendu.cible = cible; env.rendu.pas = cible ? cible.pas : null;
  for (const b of visibles) {
    const x = env.xDe(b.t), yH = env.yDe(b.h), yL = env.yDe(b.l), yO = env.yDe(b.o), yC = env.yDe(b.c); if (x == null || yH == null || yL == null) continue;
    const haut = b.c >= b.o, coul = haut ? VERT : ROUGE; let res = cible ? casesBougie(env, b, cible) : { raison: TEXTE_ABSENT };
    const A = res.niveaux ? analyserBougie(res.niveaux) : null; env.rendu.lignes.set(b.t, { A, pas: cible && cible.pas, res });
    if (env.live && env.demanderHeures && (res.code === 'direct' || (res.origine === 'direct' && res.partielle))) for (const h of env.live.heuresAFaire(env.unite, b.t)) aRattraper.add(h);
    const xg = (x - demi) * hr, xd = (x + demi) * hr, xc = x * hr;
    if (A) {
      const pas = cible.pas, maxV = A.maxVolume, maxD = Math.max(1e-9, ...A.rows.map(q => Math.abs(q.delta)));
      for (const q of A.rows) {
        const ya = env.yDe(q.prix + pas), yb = env.yDe(q.prix); if (ya == null || yb == null) continue; const h = (yb - ya), top = ya * vr, hp = Math.max(1, h * vr - 1);
        if (top > sc.bitmapSize.height || top + hp < 0) continue;
        if (mode === 'bidask') {
          c.fillStyle = rgba(ROUGE, 0.06 + 0.55 * intensite(q.vente, maxV)); c.fillRect(xg, top, xc - xg - 0.5 * hr, hp); c.fillStyle = rgba(VERT, 0.06 + 0.55 * intensite(q.achat, maxV)); c.fillRect(xc + 0.5 * hr, top, xd - xc - 0.5 * hr, hp);
        } else if (mode === 'delta') {
          c.fillStyle = rgba(q.delta >= 0 ? VERT : ROUGE, 0.05 + 0.6 * Math.abs(q.delta) / maxD); c.fillRect(xg, top, xd - xg, hp);
        } else {
          const L = (xd - xg) * intensite(q.volume, maxV), part = q.volume > 0 ? q.vente / q.volume : 0.5; c.fillStyle = rgba(ROUGE, 0.55); c.fillRect(xg, top, L * part, hp); c.fillStyle = rgba(VERT, 0.55); c.fillRect(xg + L * part, top, L * (1 - part), hp);
        }
        if (q.poc) { c.strokeStyle = '#e6edf2'; c.lineWidth = Math.max(1, hr); c.strokeRect(xg + 0.5 * hr, top + 0.5 * vr, xd - xg - hr, hp - vr); }
        const niv = env.reaction && env.opts.reaction ? surNiveau(q.prix, pas, env.reaction) : null;
        if (niv) { c.fillStyle = COULEUR_REACTION; c.fillRect(xg - 2 * hr, top, 2 * hr, hp); c.fillRect(xd, top, 2 * hr, hp); c.strokeStyle = 'rgba(127,179,194,.9)'; c.lineWidth = Math.max(1, hr); c.beginPath(); c.moveTo(xg, top + hp / 2); c.lineTo(xd, top + hp / 2); c.stroke(); }
        if (q.empile) { c.fillStyle = q.deseq === 'achat' ? 'rgba(95,184,148,1)' : 'rgba(216,106,106,1)'; const mx = q.deseq === 'achat' ? xd + 3 * hr : xg - 5 * hr; c.fillRect(mx, top, 2 * hr, hp); }
        if (h >= 11) {
          const taille = Math.min(12, Math.max(10, h - 2)); c.font = `${taille * hr}px ui-monospace, Consolas, monospace`;
          if (mode === 'bidask') {
            const ds = q.deseq; c.textAlign = 'right'; c.font = `${ds === 'vente' ? '700 ' : ''}${taille * hr}px ui-monospace, Consolas, monospace`; c.fillStyle = ds === 'vente' ? '#ff9a9a' : 'rgba(232,170,170,.92)'; c.fillText(q.vente > 0 ? kfmt(q.vente) : '·', xc - 3 * hr, top + hp / 2);
            c.textAlign = 'left'; c.font = `${ds === 'achat' ? '700 ' : ''}${taille * hr}px ui-monospace, Consolas, monospace`; c.fillStyle = ds === 'achat' ? '#8cf0bf' : 'rgba(170,222,196,.92)'; c.fillText(q.achat > 0 ? kfmt(q.achat) : '·', xc + 3 * hr, top + hp / 2);
          } else if (mode === 'delta') { c.textAlign = 'center'; c.fillStyle = q.delta >= 0 ? '#9be8c2' : '#f0a4a4'; c.fillText(sk(q.delta), xc, top + hp / 2); }
          else if (h >= 11) { c.textAlign = 'left'; c.fillStyle = 'rgba(225,235,240,.9)'; c.fillText(kfmt(q.volume), xg + 3 * hr, top + hp / 2); }
        }
      }
    }
    /* corps et mèche en fin contour (par-dessus les cases) */
    c.strokeStyle = A ? rgba(coul, 0.95) : 'rgba(150,160,170,.85)'; c.lineWidth = Math.max(1, hr); c.beginPath(); c.moveTo(xc, yH * vr); c.lineTo(xc, Math.min(yO, yC) * vr); c.moveTo(xc, Math.max(yO, yC) * vr); c.lineTo(xc, yL * vr); c.stroke();
    const yt = Math.min(yO, yC) * vr, hh = Math.max(1, Math.abs(yC - yO) * vr); c.strokeRect(xg, yt, xd - xg, hh);

    /* totaux sous la bougie : delta et volume ; ou la raison de l'absence d'empreinte */
    c.textAlign = 'center'; c.font = `${10 * hr}px ui-monospace, Consolas, monospace`; const yBas = yL * vr + 11 * vr;
    if (A) {
      c.fillStyle = A.total.delta >= 0 ? 'rgba(95,184,148,.95)' : 'rgba(216,106,106,.95)'; c.fillText('Δ ' + sk(A.total.delta), xc, yBas); c.fillStyle = 'rgba(190,200,208,.85)'; c.fillText('V ' + kfmt(A.total.volume), xc, yBas + 12 * vr);
      if (res.partielle) { c.fillStyle = 'rgba(241,211,79,.85)'; c.fillText(env.rattrapageEnCours && env.rattrapageEnCours() ? 'partielle · rattrapage…' : 'empreinte partielle', xc, yBas + 24 * vr); }
    }
  }
  c.textAlign = 'start'; c.textBaseline = 'alphabetic';
  if (aRattraper.size && env.demanderHeures) env.demanderHeures([...aRattraper]);
}
const deltaEtVolume = b => { if (Number.isFinite(b.bv)) return 2 * b.bv - (b.v || 0); const e = b.h - b.l; return e > 0 && b.v > 0 ? b.v * ((b.c - b.l) - (b.h - b.c)) / e : 0; };

/* en dessous du seuil de lisibilité : l'affichage de la v4 (volume et delta au-dessus de la bougie), inchangé */
function dessinerVD(sc, env, r) {
  const c = sc.context, hr = sc.horizontalPixelRatio, vr = sc.verticalPixelRatio; c.textAlign = 'center'; c.font = `${(env.rendu.esp >= 60 ? 11 : 10) * hr}px ui-monospace, monospace`;
  for (const b of env.bars) {
    const tt = Math.floor(b.t / 1000); if (tt < r.from - 2 || tt > r.to + 2) continue; const x = env.xDe(b.t), yH = env.yDe(b.h); if (x == null || yH == null) continue; const d = deltaEtVolume(b);
    c.fillStyle = 'rgba(190,200,208,.85)'; c.fillText('V ' + kfmt(b.v || 0), x * hr, (yH - 14) * vr); c.fillStyle = d >= 0 ? 'rgba(95,184,148,.95)' : 'rgba(216,106,106,.95)'; c.fillText('Δ ' + sk(d), x * hr, (yH - 3) * vr);
  }
  c.textAlign = 'start';
}

/* texte d'une case (survol ou toucher) */
export function infoCase(env, tMs, prix, nf = v => String(v)) {
  const L = env.rendu && env.rendu.lignes.get(tMs); if (!env.rendu || !env.rendu.actif) return null;
  if (!L || !L.A) { const e = L && L.res && L.res.raison; return e ? `Bougie sans empreinte : ${e}.` : null; }
  const q = ligneDuPrix(L.A, prix, L.pas); const niv = q && env.reaction ? surNiveau(q.prix, L.pas, env.reaction) : null;
  if (!q) return `Δ bougie ${sk(L.A.total.delta)} · volume ${kfmt(L.A.total.volume)} · ${L.A.total.n.toLocaleString('fr-FR')} transactions${L.res.partielle ? ' · empreinte partielle (écoute commencée après l’ouverture)' : ''}`;
  return `<b>${nf(q.prix)} → ${nf(q.prix + L.pas)}</b><br>Acheteurs agressifs ${kfmt(q.achat)} · vendeurs ${kfmt(q.vente)}<br>Delta ${sk(q.delta)} · ${q.n.toLocaleString('fr-FR')} transactions${q.poc ? '<br>POC de la bougie' : ''}${q.deseq ? `<br>Déséquilibre ${q.deseq === 'achat' ? 'acheteur' : 'vendeur'} 3:1${q.empile ? ' (empilé)' : ''}` : ''}${niv ? `<br><span style="color:${COULEUR_REACTION}">Niveau de réaction ×${niv.reactions}</span>` : ''}${L.res.partielle ? '<br><i>empreinte partielle</i>' : ''}`;
}
