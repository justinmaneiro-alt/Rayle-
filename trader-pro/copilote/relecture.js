/* ═════════════ RELECTURE BOUGIE PAR BOUGIE : le graphique du copilote (« Montre-moi », « Regarde ça », Formation) ═════════════
   Un vrai graphique de bougies (Lightweight Charts) centré sur un mouvement, avec la MA200, les barres de volume colorées (cyan = achat fort, magenta = vente forte, comme « Bougies volume »), les niveaux surlignés
   et une lecture qui rejoue le mouvement bougie par bougie. On peut mettre en pause à n'importe quelle bougie et demander « qu'est-ce que tu vois là ? » : Rayle décrit CETTE bougie avec les outils
   (volume relatif, MA200, session, mouvement) en n'utilisant que les bougies jusqu'à elle (jamais l'avenir). Fonctions pures testées + montage navigateur. Lecture seule : aucun ordre. */
import { creerCalcul, SEUIL_DEFAUT, SEUIL_EXTREME, NOM_CONTEXTE } from '../volume/bougies-volume-calcul.js';
import { sessionEn, heureParis, jourHeureParis } from '../lecture/sessions.js';

export const PAS = { H1: 3600e3, H4: 4 * 3600e3, J: 86400e3 }, NOM_UNITE = { H1: 'H1', H4: 'H4', J: 'Daily' };
const fr = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '?');
export const COULEURS_VOLUME = Object.freeze({ achat: '#00E5FF', vente: '#FF2BD6', neutre: 'rgba(143,208,227,.28)' });

/* indices de la fenêtre à afficher : de la bougie qui contient t0 (moins une marge) à celle qui contient t1 (plus une marge) */
export function fenetreRelecture(B, t0, t1, { avant = 40, apres = 12 } = {}) {
  if (!B || !B.length) return { debut: 0, fin: -1, i0: 0, i1: -1 };
  const idx = t => { let r = 0; for (let i = 0; i < B.length; i++) { if (B[i].t <= t) r = i; else break; } return r; }, i0 = idx(t0), i1 = idx(t1);
  return { debut: Math.max(0, i0 - avant), fin: Math.min(B.length - 1, i1 + apres), i0, i1 };
}
/* tout ce que disent les outils sur la bougie i, avec le passé seulement */
export function infosBougie(B, calc, i, unite = 'H4') {
  const b = B[i], rel = calc.rel(i), ma = calc.ma(i), atr = calc.atr(i), dir = b.c > b.o ? 1 : b.c < b.o ? -1 : 0, prec = i > 0 ? B[i - 1].c : b.o;
  const niveau = rel != null && rel >= SEUIL_EXTREME ? 'extreme' : rel != null && rel >= SEUIL_DEFAUT ? 'fort' : null;
  return { i, t: b.t, tFin: b.t + PAS[unite], o: b.o, h: b.h, l: b.l, c: b.c, dir, rel, niveau, ma, atr, positionMa: ma == null ? null : (b.c >= ma ? 'dessus' : 'dessous'), ecartMaAtr: ma != null && atr ? (b.c - ma) / atr : null, ecartMaPct: ma != null ? (b.c / ma - 1) * 100 : null, contexte: calc.ctx(i), variationPct: (b.c / prec - 1) * 100, tailleAtr: atr ? (b.h - b.l) / atr : null, session: sessionEn(b.t).nom };
}
const dec = (v, ref) => (Math.abs(ref) >= 100 ? 0 : 2);
/* « qu'est-ce que tu vois là ? » : une lecture parlée de la bougie */
export function texteBougie(info, { nom = 'l’actif', unite = 'H4', depuisDebut = null } = {}) {
  const P = [`Bougie ${NOM_UNITE[unite]} de ${jourHeureParis(info.t)}, session ${info.session} : ${info.dir > 0 ? 'haussière' : info.dir < 0 ? 'baissière' : 'neutre'}, clôture à ${fr(info.c, dec(0, info.c))}, ${fr(Math.abs(info.variationPct), 1)} % ${info.variationPct >= 0 ? 'au-dessus' : 'en dessous'} de la clôture précédente${info.tailleAtr != null ? `, taille ${fr(info.tailleAtr, 1)} ATR` : ''}.`];
  if (info.rel == null) P.push('Je n’ai pas de volume fiable pour cette bougie, donc je ne dis rien sur le volume.');
  else if (info.niveau) P.push(`Le volume est ${fr(info.rel, 1)} fois la normale : c’est une bougie à volume ${info.niveau === 'extreme' ? 'extrême' : 'fort'} ${info.dir > 0 ? 'acheteuse' : 'vendeuse'}${info.contexte ? ', ' + NOM_CONTEXTE[info.contexte] : ''}. Ça dit qu’il s’est passé quelque chose ici, pas dans quel sens ça continue.`);
  else P.push(`Le volume est ordinaire (${fr(info.rel, 1)} fois la normale) : rien de particulier de ce côté.`);
  if (info.ma != null) P.push(`Elle clôture ${info.positionMa === 'dessus' ? 'au-dessus' : 'sous'} la MA200 (${fr(info.ma, dec(0, info.ma))}), à ${fr(Math.abs(info.ecartMaAtr), 1)} ATR${Math.abs(info.ecartMaAtr) >= 6 ? ' : le prix est très étiré de sa moyenne' : Math.abs(info.ecartMaAtr) < 0.5 ? ' : le prix est au contact de la moyenne, zone où l’on regarde les cassures et les rebonds' : ''}.`);
  if (depuisDebut != null) P.push(`Depuis le début du mouvement qu’on regarde, le prix a fait ${depuisDebut >= 0 ? '+' : '−'}${fr(Math.abs(depuisDebut), 1)} %.`);
  P.push('Ce sont des tendances générales, pas une règle : à confirmer avec le contexte.'); return P.join(' ');
}
/* données de la relecture : bougies de la fenêtre, MA200 (calculée sur tout l'historique), volume coloré, marqueurs */
export function donneesRelecture(Btout, actif, unite, t0, t1, { avant, apres } = {}) {
  const calc = creerCalcul(actif).maj(Btout), W = fenetreRelecture(Btout, t0, t1, { avant, apres }), bougies = Btout.slice(W.debut, W.fin + 1);
  const ma = [], vol = []; for (let i = W.debut; i <= W.fin; i++) { const m = calc.ma(i); if (m != null) ma.push({ t: Btout[i].t, v: m }); const rel = calc.rel(i), niv = rel != null && rel >= SEUIL_DEFAUT; vol.push({ t: Btout[i].t, v: Btout[i].v || 0, couleur: niv ? (Btout[i].c >= Btout[i].o ? COULEURS_VOLUME.achat : COULEURS_VOLUME.vente) : COULEURS_VOLUME.neutre }); }
  return { calc, W, bougies, ma, vol, i0: W.i0 - W.debut, i1: W.i1 - W.debut, debut: W.debut };
}

/* ───── montage navigateur ───── */
export async function ouvrirRelecture({ actif, unite = 'H4', t0, t1, niveaux = [], titre = 'Relecture', nom = 'l’actif', lireBougies, racine = document.body, parler = null, auDemarrage = true } = {}) {
  const [{ monterGraphique, COULEURS }, donnees] = await Promise.all([import('../commun/graph.js'), import('../commun/donnees.js')]);
  const D0 = await (lireBougies ? lireBougies() : donnees.lireActifPro(actif, { delai: 12000 }).then(r => ({ H1: r.donnees.h1, H4: r.donnees.h4, J: r.donnees.j })[unite]));
  const R = donneesRelecture(D0, actif, unite, t0, t1), dec2 = Math.abs(D0[D0.length - 1].c) >= 100 ? 0 : 2;
  const el = document.createElement('section'); el.className = 'tp tp-relecture'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', titre);
  el.innerHTML = `<header class="tp-tete"><b>${titre.replace(/</g, '&lt;')}</b><span class="tp-doux">${NOM_UNITE[unite]} · heure de Paris</span><button type="button" data-fermer aria-label="Fermer">✕</button></header>
    <div class="tp-rel-graph" data-graph></div>
    <div class="tp-rel-ctrl" role="group" aria-label="Lecture"><button type="button" data-debut title="Revenir au début">⏮</button><button type="button" data-prec title="Bougie précédente">◀</button><button type="button" data-jouer title="Lecture / pause">▶</button><button type="button" data-suiv title="Bougie suivante">▶|</button><input type="range" min="0" max="${R.bougies.length - 1}" value="${Math.max(0, R.i0 - 3)}" data-curseur aria-label="Bougie affichée"><select data-vitesse aria-label="Vitesse"><option value="900">lent</option><option value="450" selected>normal</option><option value="200">rapide</option></select></div>
    <p class="tp-rel-legende">Volume : <span style="color:${COULEURS_VOLUME.achat}">■ achat fort</span> <span style="color:${COULEURS_VOLUME.vente}">■ vente forte</span> · ligne bleue : MA200 · pointillés : niveaux du point</p>
    <div class="tp-rel-texte" data-texte role="status" aria-live="polite">Appuie sur ▶ pour rejouer le mouvement bougie par bougie, ou mets en pause et demande ce que Rayle voit.</div>
    <p class="tp-actions"><button type="button" data-voir>Qu’est-ce que tu vois là ?</button> <button type="button" data-lire-tout>Rayle, rejoue et explique</button></p>`;
  racine.appendChild(el);
  const $ = s => el.querySelector(s), G = await monterGraphique($('[data-graph]'), { hauteur: 320, intraday: unite !== 'J', dec: dec2 });
  const serie = G.bougies(R.bougies), vol = G.histo(R.vol.map(x => ({ t: x.t, v: x.v, couleur: x.couleur })), { echelle: 'vol' }); try { G.chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } }); } catch (e) { /* échelle de volume facultative */ }
  const lignes = []; G.ligne(R.ma, { couleur: COULEURS.accent, epaisseur: 1.5, titre: 'MA200' });
  const pxFin = D0[D0.length - 1].c; for (const n of niveaux.slice().sort((a, b) => Math.abs(a.prix - pxFin) - Math.abs(b.prix - pxFin)).slice(0, 5)) lignes.push(G.niveau(serie, n.prix, { couleur: COULEURS.or, titre: String(n.nom || '').replace(/^(la|le|un|une) /, '').slice(0, 22) }));
  let i = Math.max(0, R.i0 - 3), minuteur = null; const total = R.bougies.length;
  const afficher = k => { i = Math.min(total - 1, Math.max(0, k)); serie.setData(R.bougies.slice(0, i + 1).map(b => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c }))); vol.setData(R.vol.slice(0, i + 1).map(x => ({ time: Math.floor(x.t / 1000), value: x.v, color: x.couleur }))); $('[data-curseur]').value = String(i); try { G.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, i - 60), to: i + 6 }); } catch (e) { /* plage facultative */ } };
  const parole = () => { const info = infosBougie(D0, R.calc, R.debut + i, unite), tx = texteBougie(info, { nom, unite, depuisDebut: (R.bougies[i].c / R.bougies[Math.max(0, R.i0)].o - 1) * 100 }); $('[data-texte]').textContent = tx; return tx; };
  const pause = () => { if (minuteur) { clearInterval(minuteur); minuteur = null; $('[data-jouer]').textContent = '▶'; } };
  const jouer = () => { if (minuteur) { pause(); return; } if (i >= total - 1) afficher(Math.max(0, R.i0 - 3)); $('[data-jouer]').textContent = '⏸'; minuteur = setInterval(() => { if (i >= total - 1) { pause(); return; } afficher(i + 1); const info = infosBougie(D0, R.calc, R.debut + i, unite); if (info.niveau) $('[data-texte]').textContent = `Bougie à volume ${info.niveau === 'extreme' ? 'extrême' : 'fort'} : ${fr(info.rel, 1)} fois la normale.`; }, +$('[data-vitesse]').value); };
  el.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-fermer]')) { pause(); try { G.detruire(); } catch (x) { /* */ } el.remove(); return; }
    if (t.closest('[data-jouer]')) jouer(); else if (t.closest('[data-debut]')) { pause(); afficher(Math.max(0, R.i0 - 3)); } else if (t.closest('[data-prec]')) { pause(); afficher(i - 1); } else if (t.closest('[data-suiv]')) { pause(); afficher(i + 1); }
    else if (t.closest('[data-voir]')) { pause(); const tx = parole(); if (parler) parler(tx); }
    else if (t.closest('[data-lire-tout]')) { pause(); afficher(R.i0); const a = parole(); afficher(Math.min(total - 1, R.i1)); const b = parole(); if (parler) parler(`On commence ici. ${a} Et à la fin du mouvement : ${b}`); }
  });
  $('[data-curseur]').addEventListener('input', e => { pause(); afficher(+e.target.value); });
  afficher(Math.max(0, R.i0 - 3)); if (auDemarrage) setTimeout(jouer, 600);
  return { el, afficher, jouer, pause, parole, fermer: () => el.querySelector('[data-fermer]').click() };
}
