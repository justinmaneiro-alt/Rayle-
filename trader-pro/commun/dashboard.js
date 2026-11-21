/* ═════════════ DASHBOARD PRO D'UN ACTIF : score de marché, tendance / RSI / MA200 (H1, H4, Jour), volume net USD, données pro ═════════════
   Utilisé par le panneau « Données » du terminal ET par Marchés > Actifs : même module, mêmes chiffres. Chaque bloc porte sa source et ne reste jamais sur « Chargement… ».
   monterDashboard(zone, id, { prixRef: () => nombre | null, parler }) → { detruire, resume } */
import { esc, nf, pct, cls, pastille, age } from './ui.js';
import { lectureProgressive, parId, lireActifPro, lireCot, lireJour, lireSnapshot, lireCalendrier } from './donnees.js';
import { rsi, sma, atr, dernier, tendance } from './analyse.js';
import { depuisSnapshotJour } from './series.js';
import { analyserCot } from '../marches/cot.js';
import { lireEvenements, filtrer, compteARebours, heureParis } from '../marches/calendrier.js';
import { scoreMarche, historiqueScore, phraseScore, COMPOSANTS } from './score.js';
import { lireFlux, cumul, enJours, resume as resumeFlux } from './volume-net.js';
import { niveauxUniteEtJour, NOM_UNITE } from './lecture-unite.js';
import { monterGraphique, COULEURS } from './graph.js';

const UNITES = ['H1', 'H4', 'J'], CLE_U = { H1: 'h1', H4: 'h4', J: 'j' };
const sg = (v, d = 0) => (Number.isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d) : '—');
const mesure = (d, id) => { for (const s of (d && d.sections) || []) for (const m of s.mesures || []) if (m.id === id) return m; return null; };
const serieMesure = m => (m && Array.isArray(m.serie) ? m.serie.filter(p => Array.isArray(p) && Number.isFinite(p[1])).map(p => ({ t: p[0], v: p[1] })) : []);
const ANN = { btc: 365, sol: 365 };

/* ───── lecture de tout ce qu'il faut pour un actif (copie locale d'abord, réseau ensuite) ───── */
async function lireTout(id) {
  const a = parId[id], R = await Promise.allSettled([lireActifPro(id, { delai: 8000 }), a.cot ? lireCot(a.cot, { delai: 8000 }) : Promise.reject(new Error('pas de COT')), lireSnapshot('marches-macro.json', { delai: 8000, valider: d => (d && d.sections ? true : 'macro vide') }), lireJour('US10Y', { delai: 8000 }), lireJour('DXY', { delai: 8000 }), lireCalendrier({ delai: 8000 })]);
  const ok = i => (R[i].status === 'fulfilled' ? R[i].value : null);
  if (!ok(0)) throw new Error(R[0].reason && R[0].reason.message || 'données de l’actif indisponibles');
  const us10 = ok(3) ? depuisSnapshotJour(ok(3).donnees).map(x => ({ t: x.t, v: x.c })) : [], dxy = ok(4) ? depuisSnapshotJour(ok(4).donnees).map(x => ({ t: x.t, c: x.c })) : [];
  return { t: Math.min(...[0, 1, 2].map(i => (ok(i) ? ok(i).t : Infinity)).filter(Number.isFinite), Date.now()), donnees: { pro: ok(0).donnees, source: ok(0).donnees.source, cotBrut: ok(1) ? ok(1).donnees : null, macro: { reel10: ok(2) ? serieMesure(mesure(ok(2).donnees, 'taux.reel10')) : [], us10, dxy }, calendrier: ok(5) ? ok(5).donnees : null } };
}

export function monterDashboard(zone, id, { prixRef = () => null, parler = null } = {}) {
  const a = parId[id], E = { id, D: null, flux: {}, unite: 'H4', graphs: [], seq: 0, fini: false, S: null };
  if (typeof document !== 'undefined' && !document.querySelector('link[data-tp-dash-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./dashboard.css', import.meta.url).href; l.dataset.tpDashCss = ''; document.head.appendChild(l); }
  zone.innerHTML = '<div class="tp-dash"><div data-score><p class="tp-att">Calcul du score…</p></div><div data-tend></div><div data-flux><p class="tp-att">Lecture du volume…</p></div><div data-pro></div></div>';
  const q = s => zone.querySelector(s);
  const detruireGraphs = () => { E.graphs.forEach(g => { try { g.detruire(); } catch (e) { /* */ } }); E.graphs = []; };
  const barres = unite => { const d = E.D.pro; return { H1: d.h1, H4: d.h4, J: d.j }[unite] || []; };
  const prixCourant = () => { const p = prixRef(); return Number.isFinite(p) ? p : (E.D && E.D.pro.prix); };

  function calculerScore() {
    const d = E.D, B = { H1: d.pro.h1, H4: d.pro.h4, J: d.pro.j }, F = E.flux.J, cot = d.cotBrut ? analyserCot(d.cotBrut) : null;
    const flux = F && F.source ? { source: F.source, unite: F.unite, jours: enJours(F.barres) } : { source: null, raison: F ? F.raison : 'lecture du volume en cours' };
    E.donneesScore = { id, B, prix: prixCourant(), cot, cotBrut: d.cotBrut, macro: d.macro, flux, ann: ANN[id] || 252 }; E.S = scoreMarche(E.donneesScore); return E.S;
  }
  /* ───── 1. score ───── */
  async function dessinerScore() {
    const S = calculerScore(), box = q('[data-score]'); detruireGraphs();
    const coul = S.score100 == null ? '' : S.score100 >= 58 ? 'tp-hausse' : S.score100 <= 42 ? 'tp-baisse' : 'tp-neutre', pos = S.score100 == null ? 50 : S.score100;
    box.innerHTML = `<article class="tp-carte tp-score"><h3>Score de marché · ${esc(a.nom)}</h3>
      <div class="tp-score-tete"><b class="tp-score-n ${coul}">${S.score100 == null ? '—' : S.score100}</b><span>sur 100 · <b class="tp-verdict ${coul}">${esc(S.verdict)}</b><br><small>confiance ${Math.round(S.confiance * 100)} %${S.manquants.length ? ' · indisponible : ' + esc(S.manquants.join(', ')) : ''}</small></span></div>
      <div class="tp-jauge" role="img" aria-label="Score ${S.score100} sur 100"><i style="left:${pos}%"></i></div><div class="tp-jauge-l"><span>0 · Vendeur fort</span><span>50 · Neutre</span><span>Acheteur fort · 100</span></div>
      <table class="tp-t tp-comp"><tr><th>Composante (cliquer pour le détail)</th><th>Poids</th><th>Note</th><th>Points</th></tr>${S.composants.map(c => `<tr class="tp-ligne-comp ${c.dispo ? '' : 'tp-off'}" data-comp="${c.id}" tabindex="0" role="button" aria-expanded="false"><td><b>▸ ${esc(c.nom)}</b>${c.dispo ? '' : `<br><small>indisponible : ${esc(c.note || '')}</small>`}</td><td>${c.dispo ? nf(c.part * 100, 0) + ' %' : '—'}<br><small>(prévu ${c.poids})</small></td><td class="${cls(c.valeur)}">${c.dispo ? sg(c.valeur, 2) : '—'}</td><td class="${cls(c.points)}">${c.dispo ? sg(c.points, 0) : '—'}</td></tr>${c.dispo ? `<tr class="tp-det" data-det="${c.id}" hidden><td colspan="4"><small>${c.detail.map(esc).join('<br>')}${c.note ? '<br><i>' + esc(c.note) + '</i>' : ''}</small></td></tr>` : ''}`).join('')}</table>
      <p class="tp-doux" data-phrase>${esc(phraseScore(a.nom, S))}</p><p><button type="button" data-lire-score>Rayle l’explique à la voix</button></p>
      <details><summary>Comment le score est calculé</summary><ul class="tp-liste">${COMPOSANTS.map(c => `<li><b>${esc(c.nom)} (${c.poids})</b> : ${esc(c.regle)}</li>`).join('')}</ul><p class="tp-doux">Chaque composante est notée de −1 à +1, multipliée par son poids ; une composante sans donnée est retirée et les autres sont renormalisées. Le score décrit le marché, il ne prévoit rien.</p></details>
      <h4>Historique du score (Jour)</h4><div class="tp-graph" data-hist></div><p class="tp-doux">Calculé jour par jour avec les seules données connues ce jour-là ; sans H1 / H4 ni flux de volume (pas d’historique long).</p></article>`;
    const H = historiqueScore(E.donneesScore, { jours: 180, pas: 2 }), hb = box.querySelector('[data-hist]');
    if (H.length < 5) { hb.innerHTML = '<p class="tp-doux">Historique insuffisant.</p>'; return; }
    try { const n = E.seq, G = await monterGraphique(hb, { hauteur: 170, intraday: false, dec: 0 }); if (n !== E.seq) { G.detruire(); return; } E.graphs.push(G); const l = G.ligne(H.map(p => ({ t: p.t, v: (p.score + 100) / 2 })), { couleur: COULEURS.accent, titre: 'score' }); G.niveau(l, 50, { couleur: COULEURS.gris, style: 2 }); G.ajuster(); } catch (e) { hb.innerHTML = '<p class="tp-panne">Graphique indisponible : ' + esc(e.message) + '</p>'; }
  }
  /* ───── 2. tendance / RSI / position vs MA200 : H1, H4, Jour ───── */
  function dessinerTendance() {
    const px = prixCourant(), L = UNITES.map(u => { const X = barres(u), T = tendance(X), r = dernier(rsi(X.map(b => b.c), 14)), M = dernier(sma(X.map(b => b.c), 200)); return { u, T, r, M, dist: M && px ? (px / M - 1) * 100 : null }; });
    q('[data-tend]').innerHTML = `<article class="tp-carte"><h3>Tendance, RSI et MA200</h3><table class="tp-t"><tr><th></th>${L.map(x => `<th>${NOM_UNITE[x.u]}</th>`).join('')}</tr>
      <tr><th>Tendance</th>${L.map(x => `<td class="${x.T.sens === 'haussière' ? 'tp-hausse' : x.T.sens === 'baissière' ? 'tp-baisse' : 'tp-neutre'}" title="${esc(x.T.raison)}">${esc(x.T.sens)}</td>`).join('')}</tr>
      <tr><th>RSI 14</th>${L.map(x => `<td>${x.r == null ? '—' : x.r.toFixed(0)}</td>`).join('')}</tr>
      <tr><th>Prix vs MA200</th>${L.map(x => `<td class="${cls(x.dist)}">${x.dist == null ? 'MA200 indisponible' : (x.dist >= 0 ? 'au-dessus ' : 'sous ') + nf(Math.abs(x.dist), 1) + ' %'}</td>`).join('')}</tr></table>
      <p class="tp-doux">Lecture descriptive (prix et pente de la MA50 contre la MA200), jamais un signal. ${pastille(E.D.pro.source || 'robot', E.D.pro.tPrix || E.t, { garde: E.copie })}</p></article>`;
  }
  /* ───── 3. volume net ───── */
  async function lireUnite(u) { if (E.flux[u] && Date.now() - E.flux[u].lu < 600e3) return E.flux[u]; const r = await lireFlux(id, u, { bougies: barres(u).slice(-200) }); r.lu = Date.now(); E.flux[u] = r; return r; }
  async function dessinerFlux() {
    const u = E.unite, box = q('[data-flux]'), n = ++E.seq; const F = await lireUnite(u); if (n !== E.seq) return;
    const L = F.barres.slice(-(u === 'H1' ? 72 : u === 'H4' ? 60 : 60)), usd = F.unite === 'USD', U = F.unite === 'USD' ? '$' : F.unite;
    const M = v => (Number.isFinite(v) ? (usd ? (Math.abs(v) >= 1e9 ? nf(v / 1e9, 2) + ' Md$' : Math.abs(v) >= 1e6 ? nf(v / 1e6, 1) + ' M$' : nf(v / 1e3, 0) + ' k$') : (Math.abs(v) >= 1e9 ? nf(v / 1e9, 2) + ' Md' : Math.abs(v) >= 1e6 ? nf(v / 1e6, 1) + ' M' : nf(v, 0)) + ' ' + U) : '—');
    const tabs = `<div class="tp-tfs" role="group" aria-label="Unité du volume">${UNITES.map(x => `<button type="button" data-fu="${x}" aria-pressed="${x === u}">${NOM_UNITE[x]}</button>`).join('')}</div>`;
    if (!F.source) { box.innerHTML = `<article class="tp-carte"><h3>Volume net entrant / sortant</h3>${tabs}<p class="tp-doux"><b>Non disponible</b> : ${esc(F.raison || '')}</p></article>`; box.querySelectorAll('[data-fu]').forEach(b => b.onclick = () => { E.unite = b.dataset.fu; dessinerFlux(); }); return; }
    const R = resumeFlux(L), autres = await Promise.all(UNITES.map(async x => { try { const f = x === u ? F : await lireUnite(x); if (n !== E.seq) return null; const l = f.barres.slice(-(x === 'H1' ? 72 : 60)); return f.source ? { x, r: resumeFlux(l), n: l.length, f } : { x, r: null }; } catch (e) { return { x, r: null }; } }));
    if (n !== E.seq) return;
    const puce = o => (o && o.r ? `<button type="button" class="tp-puce-flux ${o.r.net >= 0 ? 'tp-entrant' : 'tp-sortant'}" data-fu="${o.x}" aria-pressed="${o.x === u}"><small>${NOM_UNITE[o.x]}</small><b>${o.r.net >= 0 ? 'Argent entrant' : 'Argent sortant'}</b><span>${o.r.net >= 0 ? '+' : '−'}${M(Math.abs(o.r.net))}</span></button>` : `<button type="button" class="tp-puce-flux" data-fu="${o.x}"><small>${NOM_UNITE[o.x]}</small><b>—</b><span>indisponible</span></button>`);
    box.innerHTML = `<article class="tp-carte"><h3>Volume net entrant / sortant ${F.source === 'estimation' ? '<span class="tp-etiq">ESTIMATION</span>' : '<span class="tp-etiq tp-etiq-ok">RÉEL</span>'}</h3><div class="tp-puces-flux">${autres.map(puce).join('')}</div>
      <p class="tp-ligne">Sur les ${L.length} dernières bougies ${NOM_UNITE[u]} : <b class="${cls(R.net)}">${R.net >= 0 ? 'argent entrant' : 'argent sortant'} : ${M(Math.abs(R.net))} net</b> (achats ${M(R.achats)} − ventes ${M(R.ventes)}, ${R.partNette == null ? '—' : sg(R.partNette * 100, 1) + ' % du volume'}).</p>
      <div class="tp-graph" data-fl></div><p class="tp-doux">Barres : volume net de chaque bougie (vert = achats agresseurs > ventes, rouge = l’inverse) ; ligne : cumul. ${esc(F.source === 'reel' ? 'Source : ' + F.nom + ' (valeur en USDT ≈ USD).' : 'Estimation : ' + F.nom + (F.raison ? ' (' + F.raison + ')' : '') + '. Ce n’est pas une donnée réelle acheteur / vendeur.')}</p></article>`;
    box.querySelectorAll('[data-fu]').forEach(b => b.onclick = () => { E.unite = b.dataset.fu; dessinerFlux(); });
    try { const G = await monterGraphique(box.querySelector('[data-fl]'), { hauteur: 210, intraday: u !== 'J', dec: 0 }); if (n !== E.seq) { G.detruire(); return; } E.graphs.push(G);
      G.histo(L.map(x => ({ t: x.t, v: x.net })), { couleur: COULEURS.hausse, pane: 0, format: { type: 'volume' } }); G.ligne(cumul(L), { couleur: COULEURS.accent, epaisseur: 2, echelle: 'left', titre: 'cumul', format: { type: 'volume' } }); G.chart.applyOptions({ leftPriceScale: { visible: true, borderVisible: false } }); G.ajuster(); } catch (e) { box.querySelector('[data-fl]').innerHTML = '<p class="tp-panne">Graphique indisponible : ' + esc(e.message) + '</p>'; }
  }
  /* ───── 4. données pro ───── */
  function dessinerPro() {
    const d = E.D, J = d.pro.j, px = prixCourant(), maintenant = Date.now(); if (!J.length || !Number.isFinite(px)) { q('[data-pro]').innerHTML = ''; return; }
    const dernBarre = J[J.length - 1], aujourdhui = Math.floor(maintenant / 86400e3) * 86400e3, enCours = dernBarre.t >= aujourdhui, clos = enCours ? J.slice(0, -1) : J;
    const perf = n => { const b = clos[clos.length - n]; return b && b.c ? (px / b.c - 1) * 100 : null; };
    const jour = perf(1), sem = perf(5), mois = perf(21);
    const A = dernier(atr(J, 14)), rg = enCours ? dernBarre.h - dernBarre.l : null;
    const niv = niveauxUniteEtJour(J, J, px, { unite: 'J' }), R1 = niv.find(n => n.cote === 'R'), S1 = niv.find(n => n.cote === 'S');
    const dN = n => (n ? `${n.nom} ${nf(n.prix, a.dec)} · ${nf(Math.abs(n.prix - px), a.dec)} pts (${nf(Math.abs(n.prix / px - 1) * 100, 1)} %, ${A ? nf(Math.abs(n.prix - px) / A, 1) + ' ATR' : ''})` : '—');
    const ev = d.calendrier ? filtrer(lireEvenements(d.calendrier), { impacts: ['fort'], actif: id, max: 1, depuisMs: 0, maintenant })[0] : null;
    q('[data-pro]').innerHTML = `<article class="tp-carte"><h3>Données pro</h3><div class="tp-cartes">
      <div><small>Performance</small><b class="${cls(jour)}">${jour == null ? '—' : pct(jour, 2)}</b><span>jour · semaine <span class="${cls(sem)}">${sem == null ? '—' : pct(sem, 1)}</span> · mois <span class="${cls(mois)}">${mois == null ? '—' : pct(mois, 1)}</span></span></div>
      <div><small>ATR 14 jours</small><b>${A ? nf(A, a.dec) : '—'}</b><span>${A ? nf(A / px * 100, 2) + ' % du prix' : ''}${rg != null && A ? ' · amplitude du jour ' + nf(rg / A * 100, 0) + ' % de l’ATR' : ''}</span></div>
      <div><small>Niveaux clés (Jour)</small><b></b><span>▲ ${esc(dN(R1))}<br>▼ ${esc(dN(S1))}</span></div>
      <div><small>Prochaine annonce importante</small><b></b><span>${ev ? `${esc(ev.titre)} (${esc(ev.pays)})<br>${esc(heureParis(ev.t))} · dans <span data-cr="${ev.t}">${esc(compteARebours(ev.t, maintenant))}</span>` : 'aucune annonce à fort impact cette semaine pour cet actif'}</span></div></div>
      <p class="tp-doux">Prix de référence ${nf(px, a.dec)}${id === 'or' ? ' (XAU/USD de l’appli)' : ''} ; performances contre les clôtures Daily de l’instantané du robot (semaine = 5 séances, mois = 21 séances).</p></article>`;
  }
  function tout() { dessinerTendance(); dessinerPro(); dessinerScore(); dessinerFlux(); }
  let rafraichi = false;
  lectureProgressive('dash|' + id, () => lireTout(id), m => {
    if (E.fini) return;
    if (m.statut === 'erreur') { if (!E.D) zone.innerHTML = `<p class="tp-panne" role="alert">${esc(m.erreur)} — aucune donnée. <button type="button" data-reessayer-dash>Réessayer</button></p>`; return; }
    E.D = m.donnees; E.t = m.t; E.copie = m.statut === 'cache'; E.flux = rafraichi ? E.flux : {}; rafraichi = true;
    if (!q('[data-score]')) zone.innerHTML = '<div class="tp-dash"><div data-score></div><div data-tend></div><div data-flux></div><div data-pro></div></div>';
    tout();
    lireUnite('J').then(() => { if (!E.fini) { const n = E.seq; dessinerScore(); } }).catch(() => {});
  });
  const basculer = ligne => { const det = ligne.parentNode.querySelector('[data-det="' + ligne.dataset.comp + '"]'); if (!det) return; det.hidden = !det.hidden; ligne.setAttribute('aria-expanded', String(!det.hidden)); const b = ligne.querySelector('b'); if (b) b.textContent = (det.hidden ? '▸ ' : '▾ ') + b.textContent.slice(2); };
  zone.addEventListener('keydown', e => { const l = e.target.closest && e.target.closest('[data-comp]'); if (l && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); basculer(l); } });
  zone.addEventListener('click', e => {
    const lc = e.target.closest('[data-comp]'); if (lc) { basculer(lc); return; }
    if (e.target.closest('[data-reessayer-dash]')) { zone.innerHTML = ''; monterDashboard(zone, id, { prixRef, parler }); return; }
    if (e.target.closest('[data-lire-score]') && E.S) { const t = phraseScore(a.nom, E.S); if (parler) parler(t); else { try { if (window.TraderPro && window.TraderPro.parler) window.TraderPro.parler(t); else if (typeof window.speak === 'function') window.speak(t); } catch (er) { /* pas de voix */ } } }
  });
  const minuteur = setInterval(() => { zone.querySelectorAll('[data-cr]').forEach(n => { n.textContent = compteARebours(+n.dataset.cr, Date.now()); }); }, 1000);
  return { rafraichir() { if (E.D && !E.fini) { dessinerTendance(); dessinerPro(); dessinerScore(); } }, detruire() { E.fini = true; E.seq++; clearInterval(minuteur); detruireGraphs(); }, resume: () => (E.S ? phraseScore(a.nom, E.S) : ''), score: () => E.S };
}

/* score sans interface (voix de Rayle) : mêmes données, mêmes règles que le panneau */
export async function calculerScoreActif(id) {
  const r = await lireTout(id), D = r.donnees, F = await lireFlux(id, 'J', { bougies: (D.pro.j || []).slice(-200) }).catch(() => null), cot = D.cotBrut ? analyserCot(D.cotBrut) : null;
  const flux = F && F.source ? { source: F.source, unite: F.unite, jours: enJours(F.barres) } : { source: null, raison: F ? F.raison : 'indisponible' };
  return scoreMarche({ id, B: { H1: D.pro.h1, H4: D.pro.h4, J: D.pro.j }, prix: D.pro.prix, cot, cotBrut: D.cotBrut, macro: D.macro, flux, ann: ANN[id] || 252 });
}
