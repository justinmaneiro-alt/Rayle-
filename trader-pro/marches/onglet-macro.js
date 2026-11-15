/* Onglet « Macro » : taux US 2 / 10 / 30 ans, pente de la courbe, taux réels contre l'or, dollar (DXY). Chaque bloc se charge seul, avec sa source et son âge. */
import { creerVue, esc, nf, pct, cls, pastille } from '../commun/ui.js';
import { lireSnapshot, lireJour, lireActifPro } from '../commun/donnees.js';
import { monterGraphique, COULEURS } from '../commun/graph.js';
import { depuisSnapshotJour, depuisBougies, corrActifTaux, glissante } from '../commun/series.js';

const mesure = (d, id) => { for (const s of (d && d.sections) || []) for (const m of s.mesures || []) if (m.id === id) return m; return null; };
const serieMesure = m => (m && Array.isArray(m.serie) ? m.serie.filter(p => Array.isArray(p) && Number.isFinite(p[1])).map(p => ({ t: p[0], v: p[1] })) : []);
const jourDe = t => new Date(t).toISOString().slice(0, 10);
/* petite courbe des taux en SVG : maturités 2 / 10 / 30 ans, aujourd'hui et il y a ~3 mois (les points des séries sont des séances) */
export function svgCourbe(courbes) {
  const W = 320, Hh = 130, P = 26, X = [0, 1, 2], tous = courbes.flatMap(c => c.v).filter(Number.isFinite); if (!tous.length) return '';
  const mn = Math.min(...tous) - 0.1, mx = Math.max(...tous) + 0.1, px = i => P + i * (W - 2 * P) / 2, py = v => Hh - 22 - (v - mn) / (mx - mn || 1) * (Hh - 40);
  const noms = ['2 ans', '10 ans', '30 ans'];
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Courbe des taux américains" class="tp-svg">${courbes.map(c => `<polyline fill="none" stroke="${c.couleur}" stroke-width="2" ${c.pointille ? 'stroke-dasharray="4 4"' : ''} points="${X.map(i => Number.isFinite(c.v[i]) ? px(i) + ',' + py(c.v[i]).toFixed(1) : '').filter(Boolean).join(' ')}"/>${X.map(i => (Number.isFinite(c.v[i]) ? `<circle cx="${px(i)}" cy="${py(c.v[i]).toFixed(1)}" r="3" fill="${c.couleur}"/><text x="${px(i)}" y="${(py(c.v[i]) - 7).toFixed(1)}" text-anchor="middle" fill="${c.couleur}" font-size="10">${c.v[i].toFixed(2)}</text>` : '')).join('')}`).join('')}${X.map(i => `<text x="${px(i)}" y="${Hh - 6}" text-anchor="middle" fill="#8497a1" font-size="11">${noms[i]}</text>`).join('')}</svg><p class="tp-doux">${courbes.map(c => `<span style="color:${c.couleur}">${c.pointille ? '- - -' : '———'} ${esc(c.nom)}</span>`).join(' · ')}</p>`;
}
export function monter(zone) {
  const E = { graphs: [], vues: [], seq: 0 };
  zone.innerHTML = `<article class="tp-carte"><h3>Taux américains et courbe</h3><div data-cartes></div></article>
    <article class="tp-carte"><h3>Rendements 2 ans et 10 ans, et pente (10 ans − 2 ans)</h3><div data-taux></div></article>
    <article class="tp-carte"><h3>Taux réels (TIPS 10 ans) contre l’or</h3><div data-reels></div></article>
    <article class="tp-carte"><h3>Dollar (indice DXY)</h3><div data-dxy></div></article>`;
  const q = s => zone.querySelector(s), n = ++E.seq;
  const vue = (sel) => { const v = creerVue(q(sel)); E.vues.push(v); return v; };
  const garder = G => { E.graphs.push(G); return G; };
  const detruitSi = G => { if (n !== E.seq) { G.detruire(); return true; } return false; };

  /* 1 · cartes + courbe : FRED via le robot (marches-macro.json) */
  vue('[data-cartes]').lire('macro', () => lireSnapshot('marches-macro.json', { valider: d => (d && d.sections ? true : 'panneau vide') }), (d, m) => {
    const ids = [['taux.ust2', '2 ans'], ['taux.ust10', '10 ans'], ['taux.ust30', '30 ans'], ['taux.pente10_2', 'Pente 10−2'], ['taux.reel10', 'Taux réel 10 ans'], ['taux.fed', 'Fed (borne haute)']];
    const M = ids.map(([id, nom]) => [mesure(d, id), nom]).filter(([x]) => x && Number.isFinite(x.valeur));
    const cv = ['taux.ust2', 'taux.ust10', 'taux.ust30'].map(id => serieMesure(mesure(d, id)));
    const ok = cv.every(s => s.length > 20), courbes = ok ? [{ nom: 'dernière séance', couleur: COULEURS.accent, v: cv.map(s => s[s.length - 1].v) }, { nom: 'il y a ' + (cv[0].length - 1) + ' séances', couleur: COULEURS.gris, pointille: true, v: cv.map(s => s[0].v) }] : [];
    q('[data-cartes]').innerHTML = `<div class="tp-cartes">${M.map(([x, nom]) => `<div><small>${esc(nom)}</small><b>${nf(x.valeur, 2)} ${esc(x.unite || '')}</b><span>${esc((x.source || '').replace(/ · .*/, ''))} · ${esc((x.horodatage || '').slice(0, 10))}</span></div>`).join('') || '<p class="tp-doux">Aucune mesure disponible.</p>'}</div>${courbes.length ? svgCourbe(courbes) : ''}<p class="tp-doux">${pastille('FRED (Réserve fédérale de Saint-Louis)', m.t, { garde: m.copie })} · les rendements sont publiés avec un jour ouvré de retard.</p>`;
  });
  /* 2 · 2 ans, 10 ans et pente : historiques journaliers */
  vue('[data-taux]').lire('taux', async () => { const [a, b] = await Promise.all([lireJour('US2Y'), lireJour('US10Y')]); return { t: Math.min(a.t, b.t), origine: a.origine, horsLigne: a.horsLigne || b.horsLigne, donnees: { a: a.donnees, b: b.donnees } }; }, async (D, m) => {
    const A = depuisSnapshotJour(D.a).slice(-520), B = depuisSnapshotJour(D.b).slice(-520), ma = new Map(A.map(x => [x.d, x.c])), pente = B.filter(x => ma.has(x.d)).map(x => ({ d: x.d, v: +(x.c - ma.get(x.d)).toFixed(3) }));
    const box = q('[data-taux]'); box.innerHTML = '<div class="tp-graph" data-g></div><p class="tp-doux" data-i></p>';
    const dernier = (S) => S.length ? S[S.length - 1] : null, d2 = dernier(A), d10 = dernier(B), dp = dernier(pente);
    q('[data-taux] [data-i]').innerHTML = `${d2 ? `2 ans <b>${nf(d2.c, 2)} %</b>` : ''} · ${d10 ? `10 ans <b>${nf(d10.c, 2)} %</b>` : ''} · pente <b class="${cls(dp && dp.v)}">${dp ? (dp.v >= 0 ? '+' : '−') + nf(Math.abs(dp.v), 2) : '—'} pt</b>${dp && dp.v < 0 ? ' (courbe inversée : le 2 ans rapporte plus que le 10 ans)' : ''} · ${pastille('Yahoo Finance (instantané du robot)', m.t, { garde: m.copie })}`;
    try { const G = garder(await monterGraphique(q('[data-taux] [data-g]'), { hauteur: 330, intraday: false, dec: 2 })); if (detruitSi(G)) return;
      G.ligne(A.map(x => ({ d: x.d, v: x.c })), { couleur: COULEURS.orange, titre: '2 ans', pane: 0 }); G.ligne(B.map(x => ({ d: x.d, v: x.c })), { couleur: COULEURS.accent, titre: '10 ans', pane: 0 }); G.histo(pente, { pane: 1 });
      try { const P = G.chart.panes(); if (P[0]) P[0].setStretchFactor(2.4); if (P[1]) P[1].setStretchFactor(1); } catch (e) { /* */ } G.ajuster();
    } catch (e) { q('[data-taux] [data-g]').innerHTML = '<p class="tp-panne">Graphique indisponible : ' + esc(e.message) + '</p>'; }
  });
  /* 3 · taux réels (échelle de gauche) contre l'or (échelle de droite) */
  vue('[data-reels]').lire('reels', async () => { const [s, o] = await Promise.all([lireSnapshot('sante.json', { valider: d => (d && d.reels && d.reels.serie ? true : 'taux réels absents') }), lireActifPro('or')]); return { t: Math.min(s.t, o.t), origine: s.origine, horsLigne: s.horsLigne || o.horsLigne, donnees: { reels: s.donnees.reels, or: o.donnees.j, orSource: o.donnees.source } }; }, async (D, m) => {
    const R = D.reels.serie.map(x => ({ d: x.date, t: Date.parse(x.date + 'T00:00:00Z'), c: x.v })).filter(x => Number.isFinite(x.c)), O = depuisBougies(D.or);
    const c60 = corrActifTaux(O, R, 60), c250 = corrActifTaux(O, R, 250);
    const box = q('[data-reels]'); box.innerHTML = `<div class="tp-graph" data-g></div><p class="tp-doux" data-i></p>`;
    const f = c => (c.r == null ? 'indisponible' : (c.r >= 0 ? '+' : '−') + Math.abs(c.r).toFixed(2).replace('.', ',') + ' sur ' + c.n + ' jours');
    q('[data-reels] [data-i]').innerHTML = `Corrélation entre le rendement de l’or et la variation du taux réel : <b>${f(c60)}</b> (60 j), <b>${f(c250)}</b> (250 j). Une valeur négative signifie que l’or monte quand le taux réel baisse. ${pastille(D.reels.source || 'Trésor américain', m.t, { garde: m.copie })} · or : ${esc(D.orSource || '')}`;
    try { const G = garder(await monterGraphique(q('[data-reels] [data-g]'), { hauteur: 300, intraday: false, dec: 2, gauche: true })); if (detruitSi(G)) return;
      G.ligne(R.slice(-500).map(x => ({ d: x.d, v: x.c })), { couleur: COULEURS.orange, echelle: 'left', titre: 'Taux réel 10 ans (%)' }); G.ligne(O.slice(-500).map(x => ({ d: x.d, v: x.c })), { couleur: COULEURS.or, echelle: 'right', titre: 'Or', format: { type: 'price', precision: 0, minMove: 1 } }); G.ajuster();
    } catch (e) { q('[data-reels] [data-g]').innerHTML = '<p class="tp-panne">Graphique indisponible : ' + esc(e.message) + '</p>'; }
  });
  /* 4 · dollar */
  vue('[data-dxy]').lire('dxy', () => lireJour('DXY'), async (d, m) => {
    const S = depuisSnapshotJour(d).slice(-520), der = S[S.length - 1], mois = S[Math.max(0, S.length - 22)];
    q('[data-dxy]').innerHTML = `<div class="tp-graph" data-g></div><p class="tp-doux">${der ? `DXY <b>${nf(der.c, 2)}</b> (${esc(der.d)})` : ''}${mois && der ? ` · sur ~1 mois <b class="${cls(der.c - mois.c)}">${pct((der.c / mois.c - 1) * 100)}</b>` : ''} · ${pastille('Yahoo Finance (instantané du robot)', m.t, { garde: m.copie })}</p>`;
    try { const G = garder(await monterGraphique(q('[data-dxy] [data-g]'), { hauteur: 240, intraday: false, dec: 2 })); if (detruitSi(G)) return; G.ligne(S.map(x => ({ d: x.d, v: x.c })), { couleur: COULEURS.accent, titre: 'DXY' }); G.ajuster(); }
    catch (e) { q('[data-dxy] [data-g]').innerHTML = '<p class="tp-panne">Graphique indisponible : ' + esc(e.message) + '</p>'; }
  });
  return { detruire() { E.seq++; E.vues.forEach(v => v.detruire()); E.graphs.forEach(g => g.detruire()); E.graphs = []; } };
}
export { glissante };
