/* ═════════════ PAGE « MARCHÉS » : tableaux HUD animés (rendements, écarts, courbes, indices, actions, matières, dollar, VIX, crypto) ═════════════ */
import { appelWorker, clignoter, defiler, demanderARayle, esc, hhmm, instantane, nombre, sansAnimation, sens, signe } from './hud.js?v=2026.10.10.4';

const SECTIONS = [
  ['rendements', 'Rendements obligataires', '▤'], ['indices', 'Indices', '◈'], ['actions', 'Grandes actions du Nasdaq', '▦'],
  ['matieres', 'Matières premières', '◆'], ['dollar_vix', 'Dollar · VIX · devises', '$'], ['crypto', 'Crypto', '₿']
];

export function creerPageMarches({ racine }) {
  racine.innerHTML =
    '<div class="pm-tete"><h2>MARCHÉS <span class="px" id="pmSrc">—</span></h2>'
    + '<div class="pm-actions"><button type="button" id="pmAct">↻ Actualiser</button><button type="button" id="pmExpl">🎙 Raylé commente</button></div></div>'
    + '<div class="pm-grille" id="pmGrille"><div class="loading">Chargement des marchés…</div></div>';
  const grille = racine.querySelector('#pmGrille'), srcEl = racine.querySelector('#pmSrc');
  let minuteur = null, ouverte = false, dernier = null, avant = null, section = '', jeton = 0;

  const cellVar = (l, k, pts) => {
    const v = pts ? (l.variation_pts != null ? l.variation_pts * 100 : null) : l.variation_pct;
    return '<td class="var ' + sens(v) + '" data-k="v' + k + '" data-v="' + (v == null ? '' : v) + '">' + (v == null ? '—' : (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + signe(v, pts ? 1 : 2, pts ? ' pb' : ' %')) + '</td>';
  };
  const ligne = (l, k, o) => {
    o = o || {};
    const dec = o.dec != null ? o.dec : (l.prix >= 1000 ? 0 : l.prix >= 10 ? 2 : l.prix >= 1 ? 3 : 4);
    const barre = !o.pts && l.variation_pct != null ? '<i class="pm-barre ' + sens(l.variation_pct) + '" style="--w:' + Math.min(100, Math.abs(l.variation_pct) * 22).toFixed(0) + '%"></i>' : '';
    return '<tr><td class="nom">' + esc(l.label) + (l.secours ? '<span class="tag">SECOURS</span>' : '') + '</td>'
      + '<td class="val" data-k="p' + k + '" data-v="' + (l.prix == null ? '' : l.prix) + '"' + (l.prix == null ? '' : ' data-from="' + (l.veille != null ? l.veille : l.prix) + '" data-dec="' + dec + '"') + '>' + (l.prix == null ? '—' : '') + '</td>'
      + cellVar(l, k, o.pts) + '<td class="bar">' + barre + '</td></tr>';
  };
  const tableau = (lignes, pre, o) => '<table class="pm-tab"><tbody>' + lignes.map((l, i) => ligne(l, pre + i, o)).join('') + '</tbody></table>';

  /* Courbe des taux : le dessin suit la largeur réelle du panneau (px), l'échelle verticale s'adapte aux données avec une marge */
  function echelle(mn, mx) {                       // graduations « rondes » qui encadrent les données
    const brut = (mx - mn) / 4, pas = [0.1, 0.2, 0.25, 0.5, 1, 2, 5].find(x => x >= brut) || 5;
    const bas = Math.floor((mn - (mx - mn) * 0.08) / pas) * pas, haut = Math.ceil((mx + (mx - mn) * 0.08) / pas) * pas;
    const ticks = []; for (let v = bas; v <= haut + pas / 2; v += pas) ticks.push(+v.toFixed(4));
    return { bas, haut, ticks, pas };
  }
  function courbesSvg(c, W) {
    const pays = [['us', 'États-Unis', '#ff3399'], ['allemagne', 'Allemagne', '#17d98a'], ['france', 'France', '#f5b642']].filter(p => c[p[0]] && c[p[0]].length >= 2);
    if (!pays.length) return '<div class="loading">Courbes indisponibles</div>';
    W = Math.max(240, Math.round(W || 360));
    const H = Math.round(Math.min(280, Math.max(170, W * 0.52))), gauche = 46, droite = 26, haut = 16, bas = 30;
    const vals = pays.flatMap(p => c[p[0]].map(x => x.rendement));
    const ech = echelle(Math.min(...vals), Math.max(...vals));
    const ans = [...new Set(pays.flatMap(p => c[p[0]].map(x => x.ans)))].sort((u, v) => u - v);
    const a0 = Math.log(ans[0]), a1 = Math.log(ans[ans.length - 1]);
    const X = a => gauche + (a1 === a0 ? 0.5 : (Math.log(a) - a0) / (a1 - a0)) * (W - gauche - droite);
    const Y = v => haut + (1 - (v - ech.bas) / (ech.haut - ech.bas)) * (H - haut - bas);
    const dec = ech.pas < 1 ? 1 : 0;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" class="pm-courbe" role="img" aria-label="Courbes de rendement">';
    ech.ticks.forEach(v => { s += '<line x1="' + gauche + '" x2="' + (W - droite) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" class="g"/><text x="' + (gauche - 6) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + v.toFixed(dec).replace('.', ',') + ' %</text>'; });
    ans.forEach(a => { s += '<text x="' + X(a).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + a + ' ans</text>'; });
    pays.forEach(([k, nom, col], i) => {
      const pts = c[k].map(x => [X(x.ans), Y(x.rendement)]);
      s += '<path class="ligne" style="--d:' + (i * 0.25) + 's" d="' + pts.map((p, j) => (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + '" stroke="' + col + '" fill="none"/>';
      c[k].forEach((x, j) => { s += '<circle cx="' + pts[j][0].toFixed(1) + '" cy="' + pts[j][1].toFixed(1) + '" r="3.2" fill="' + col + '"/>'; });
    });
    return s + '</svg><div class="pm-legende">' + pays.map(p => '<span><i style="background:' + p[2] + '"></i>' + p[1] + '</span>').join('') + '</div>';
  }
  let largeurCourbe = 0, obsCourbe = null;
  function dessinerCourbes(force) {
    const boite = grille.querySelector('.pm-courbe-boite'); if (!boite || !dernier) return;
    const w = Math.floor(boite.clientWidth);
    if (!w || (!force && Math.abs(w - largeurCourbe) < 6)) return;
    largeurCourbe = w; boite.innerHTML = courbesSvg(dernier.rendements.courbes, w);
  }

  function ecartsHtml(ec) {
    const max = Math.max(60, ...ec.filter(e => e.bp != null).map(e => Math.abs(e.bp)));
    return ec.map(e => {
      if (e.bp == null) return '<div class="pm-ecart"><span class="nom">' + esc(e.label) + '</span><span class="val">—</span></div>';
      const w = Math.min(100, Math.abs(e.bp) / max * 100).toFixed(0);
      return '<div class="pm-ecart" title="' + esc(e.note) + '"><span class="nom">' + esc(e.label) + '</span>'
        + '<span class="val ' + (e.inversee ? 'down' : '') + '" data-k="e' + esc(e.label) + '" data-v="' + e.bp + '" data-from="0" data-dec="0" data-suf=" pb"></span>'
        + '<span class="pm-ec-barre"><i class="' + (e.bp < 0 ? 'neg' : 'pos') + '" style="width:' + w + '%"></i></span>'
        + '<span class="var ' + sens(e.variation_bp) + '">' + (e.variation_bp == null ? '' : signe(e.variation_bp, 1, ' pb')) + '</span>'
        + (e.inversee ? '<span class="tag alerte">INVERSÉE</span>' : '') + '</div>';
    }).join('');
  }

  function rendre(d) {
    avant = dernier ? instantane(grille) : null;
    dernier = d;
    const r = d.rendements;
    const cartes = [];
    cartes.push('<section class="pm-carte large" data-s="rendements"><h3>▤ Rendements obligataires</h3><div class="pm-deux"><div>' + tableau(r.lignes, 'r', { pts: true, dec: 3 })
      + '</div><div><h4>Écarts</h4>' + ecartsHtml(r.ecarts) + '<h4>Courbes</h4><div class="pm-courbe-boite"></div></div></div></section>');
    for (const [id, titre, ico] of SECTIONS.slice(1)) {
      cartes.push('<section class="pm-carte" data-s="' + id + '"><h3>' + ico + ' ' + titre + '</h3>' + tableau(d[id], id[0] + id.length, id === 'dollar_vix' ? { dec: 3 } : id === 'crypto' ? { dec: 0 } : null) + '</section>');
    }
    grille.innerHTML = cartes.join('');
    dessinerCourbes(true);
    if (typeof ResizeObserver !== 'undefined' && !obsCourbe) { obsCourbe = new ResizeObserver(() => dessinerCourbes(false)); obsCourbe.observe(grille); }
    grille.querySelectorAll('.pm-carte').forEach((c, i) => { c.style.animationDelay = (i * 90) + 'ms'; });
    defiler(grille, 900);
    clignoter(grille, avant);
    const srcs = [...new Set([r.lignes, d.indices, d.matieres, d.crypto].flat().map(x => x.source).filter(Boolean))].join(', ');
    srcEl.innerHTML = esc(srcs || '—') + (d.perime ? ' <span class="tag alerte">ANCIENNE COPIE</span>' : '') + ' · màj ' + hhmm(d.maj);
    if (section) allerA(section);
    RayleBus.fusion('terminal', { page_marches: {
      maj: d.maj, rendements: Object.fromEntries(r.lignes.filter(x => x.prix != null).map(x => [x.label, x.prix])),
      ecarts_pb: Object.fromEntries(r.ecarts.filter(x => x.bp != null).map(x => [x.label, x.bp])),
      indices: Object.fromEntries(d.indices.filter(x => x.prix != null).map(x => [x.label, x.variation_pct])),
      dollar_vix: Object.fromEntries(d.dollar_vix.filter(x => x.prix != null).map(x => [x.label, x.prix]))
    } });
  }

  async function charger(silencieux) {
    const moi = ++jeton;
    try {
      const d = await appelWorker('/marches', null, 25000);
      if (moi !== jeton) return;
      rendre(d);
    } catch (e) {
      if (moi !== jeton) return;
      if (!dernier) grille.innerHTML = '<div class="needkey">' + (e.code === 401 ? "Code d'accès refusé : vérifie ⚙ Réglages de Raylé." : 'Marchés indisponibles : ' + esc(e.message) + '.<br>Nouvel essai automatique, ou appuie sur ↻.') + '</div>';
      else srcEl.innerHTML = '<span class="tag alerte">MISE À JOUR IMPOSSIBLE</span> données de ' + hhmm(dernier.maj);
    }
  }
  function planifier() { clearTimeout(minuteur); if (ouverte) minuteur = setTimeout(async () => { if (!document.hidden) await charger(true); planifier(); }, 60000); }

  function allerA(id) {
    const el = grille.querySelector('[data-s="' + id + '"]'); if (!el) return;
    el.scrollIntoView({ behavior: sansAnimation() ? 'auto' : 'smooth', block: 'start' });
    el.classList.remove('pm-focus'); void el.offsetWidth; el.classList.add('pm-focus');
    section = '';
  }
  racine.querySelector('#pmAct').onclick = () => charger();
  racine.querySelector('#pmExpl').onclick = () => demanderARayle('Raylé, commente la page Marchés : rendements, écarts, indices et matières premières.');

  return {
    ouvrir(opts) { ouverte = true; section = (opts && opts.section) || ''; if (dernier && !section) { defiler(grille, 600); } charger(); planifier(); },
    fermer() { ouverte = false; clearTimeout(minuteur); jeton++; },
    actualiser: () => charger(), allerA
  };
}
