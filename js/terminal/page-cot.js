/* ═════════════ PAGE « COT » : positions des spéculateurs (CFTC), évolution sur 1 an, extrêmes, centile ═════════════ */
import { appelWorker, chemin, defiler, demanderARayle, esc, jourCourt, jourLong, nombre, sansAnimation, sens, signe } from './hud.js?v=2026.10.10.4';

export const ACTIFS_COT = [['XAU', 'Or'], ['NDX', 'Nasdaq 100'], ['SPX', 'S&P 500'], ['BTC', 'Bitcoin'], ['EUR', 'Euro'], ['XAG', 'Argent'], ['WTI', 'Pétrole']];
const NOMS_PARLES = { XAU: "l'or", NDX: 'le Nasdaq 100', SPX: 'le S&P 500', BTC: 'le Bitcoin', EUR: "l'euro", XAG: "l'argent", WTI: 'le pétrole' };

export function creerPageCot({ racine }) {
  racine.innerHTML =
    '<div class="pc-tete"><h2>RAPPORTS COT <span class="px" id="pcSrc">CFTC</span></h2>'
    + '<div class="pc-onglets" id="pcOnglets"></div>'
    + '<div class="pm-actions"><span class="pc-periodes" id="pcPer"><button type="button" data-s="52" class="actif">1 an</button><button type="button" data-s="156">3 ans</button></span>'
    + '<button type="button" id="pcExpl">🎙 Raylé explique</button></div></div>'
    + '<div class="pc-corps" id="pcCorps"><div class="loading">Chargement du rapport COT…</div></div>';
  const corps = racine.querySelector('#pcCorps'), srcEl = racine.querySelector('#pcSrc'), onglets = racine.querySelector('#pcOnglets');
  let actif = 'XAU', semaines = 52, ouverte = false, jeton = 0, donnees = null, largeur = 760;

  ACTIFS_COT.forEach(([k, nom]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.k = k; b.textContent = nom; b.onclick = () => choisir(k); onglets.appendChild(b); });
  const majOnglets = () => onglets.querySelectorAll('button').forEach(b => b.classList.toggle('actif', b.dataset.k === actif));

  function graphe(serie, nom) {
    const W = largeur, H = W < 520 ? 250 : 270, g = W < 520 ? 40 : 46, d = 14, h = 26, b = 30;   // sur téléphone : un graphique plus étroit, donc des textes lisibles
    const nets = serie.map(x => x.net), mn = Math.min(0, ...nets), mx = Math.max(0, ...nets), marge = (mx - mn) * 0.08 || 1;
    // graduations « rondes » (50 k, 100 k…) plutôt que des valeurs quelconques
    const brut = (mx - mn + 2 * marge) / 4, pw = Math.pow(10, Math.floor(Math.log10(brut))), pasRond = [1, 2, 2.5, 5, 10].map(k => k * pw).find(v => v >= brut) || brut;
    const lo = Math.floor((mn - marge) / pasRond) * pasRond, hi = Math.ceil((mx + marge) / pasRond) * pasRond;
    const X = i => g + i * (W - g - d) / Math.max(1, serie.length - 1), Y = v => h + (hi - v) / (hi - lo) * (H - h - b);
    const pts = serie.map((x, i) => [X(i), Y(x.net)]);
    const iMax = nets.indexOf(Math.max(...nets)), iMin = nets.indexOf(Math.min(...nets));
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pc-svg" id="pcSvg" role="img" aria-label="Position nette des non-commerciaux, ' + esc(nom) + '">'
      + '<defs><linearGradient id="pcDeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3399" stop-opacity=".45"/><stop offset="1" stop-color="#ff3399" stop-opacity="0"/></linearGradient></defs>';
    const nbGrad = Math.round((hi - lo) / pasRond);
    for (let i = 0; i <= nbGrad; i++) { const v = lo + i * pasRond; s += '<line class="g" x1="' + g + '" x2="' + (W - d) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (g - 6) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + nombre(Math.round(v / 1000), 0) + ' k</text>'; }
    s += '<line class="zero" x1="' + g + '" x2="' + (W - d) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '"/>';
    s += '<path class="aire" d="' + chemin(pts) + ' L' + X(serie.length - 1).toFixed(1) + ' ' + Y(0).toFixed(1) + ' L' + g + ' ' + Y(0).toFixed(1) + ' Z" fill="url(#pcDeg)"/>';
    s += '<path class="courbe" pathLength="1" d="' + chemin(pts) + '"/>';
    const etiq = (i, cl, txt) => '<g class="ext ' + cl + '"><circle cx="' + pts[i][0].toFixed(1) + '" cy="' + pts[i][1].toFixed(1) + '" r="4"/><text x="' + Math.min(W - 70, Math.max(g + 4, pts[i][0] - 30)).toFixed(1) + '" y="' + (pts[i][1] + (cl === 'max' ? -9 : 17)).toFixed(1) + '">' + txt + ' ' + jourCourt(serie[i].date) + '</text></g>';
    if (iMax !== iMin) s += etiq(iMax, 'max', 'max') + etiq(iMin, 'min', 'min');
    const nbDates = Math.min(6, serie.length);
    for (let k = 0; k < nbDates; k++) { const i = Math.round(k * (serie.length - 1) / Math.max(1, nbDates - 1)); s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + jourCourt(serie[i].date) + '</text>'; }
    const dernier = pts[pts.length - 1];
    s += '<circle class="actuel" cx="' + dernier[0].toFixed(1) + '" cy="' + dernier[1].toFixed(1) + '" r="5"/>';
    s += '<line class="curseur" id="pcCur" x1="0" x2="0" y1="' + h + '" y2="' + (H - b) + '" style="display:none"/></svg>';
    return s;
  }
  function barres(serie) {
    const dern = serie.slice(-26), W = 380, H = 150, m = 14;
    const mx = Math.max(...dern.map(x => Math.max(x.long, x.short))) || 1, bw = (W - 2 * m) / dern.length;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pc-barres" role="img" aria-label="Achats et ventes des spéculateurs, 26 dernières semaines"><line class="zero" x1="' + m + '" x2="' + (W - m) + '" y1="' + (H / 2) + '" y2="' + (H / 2) + '"/>';
    dern.forEach((x, i) => {
      const hl = x.long / mx * (H / 2 - 8), hs = x.short / mx * (H / 2 - 8), xx = m + i * bw + 1;
      s += '<rect class="long" style="--i:' + i + '" x="' + xx.toFixed(1) + '" y="' + (H / 2 - hl).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + hl.toFixed(1) + '"><title>' + jourCourt(x.date) + ' · achats ' + nombre(x.long) + '</title></rect>';
      s += '<rect class="short" style="--i:' + i + '" x="' + xx.toFixed(1) + '" y="' + (H / 2) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + hs.toFixed(1) + '"><title>' + jourCourt(x.date) + ' · ventes ' + nombre(x.short) + '</title></rect>';
    });
    return s + '</svg>';
  }
  function jauge(p) {
    if (p == null) return '';
    const col = p >= 90 ? 'var(--warn)' : p <= 10 ? 'var(--warn)' : 'var(--neon2)';
    return '<div class="pc-jauge" role="img" aria-label="Centile ' + p + ' sur 100"><div class="pc-rail"><i style="--p:' + p + '%;background:' + col + '"></i></div><div class="pc-reperes"><span>vendeur extrême</span><span>neutre</span><span>acheteur extrême</span></div></div>';
  }

  function rendre(d) {
    donnees = d;
    largeur = Math.max(320, Math.min(760, Math.round(corps.clientWidth - 4) || 760));
    const s = d.stats, x = s.derniere, serie = d.serie;
    const kpi = (nom, val, extra) => '<div class="pc-kpi"><span class="k">' + nom + '</span>' + val + (extra || '') + '</div>';
    const vs = v => '<b class="' + sens(v) + '">' + signe(v, 0) + '</b>';
    corps.innerHTML =
      '<div class="pc-kpis">'
      + kpi('Position nette (spéculateurs)', '<b class="gros ' + sens(x.net) + '" data-v="' + x.net + '" data-from="0" data-dec="0" data-pre="' + (x.net > 0 ? '+' : '') + '">' + signe(x.net, 0) + '</b>', '<small>' + nombre(x.long) + ' achats · ' + nombre(x.short) + ' ventes</small>')
      + kpi('Sur une semaine', vs(s.variation_semaine)) + kpi('Sur 4 semaines', vs(s.variation_4_semaines))
      + kpi("Part de l'intérêt ouvert", '<b>' + (x.pct_oi == null ? '—' : nombre(x.pct_oi, 1) + ' %') + '</b>', '<small>intérêt ouvert ' + nombre(x.oi) + '</small>')
      + kpi('Commerciaux (couvertures)', '<b class="' + sens(x.commerciaux_net) + '">' + signe(x.commerciaux_net, 0) + '</b>', '<small>en général l’inverse des spéculateurs</small>')
      + '</div>'
      + '<div class="pc-grille"><section class="pc-carte large"><h3>Position nette des non-commerciaux · ' + (semaines > 52 ? '3 ans' : '1 an') + '</h3>' + graphe(serie, d.nom)
      + '<div class="pc-bulle" id="pcBulle" hidden></div></section>'
      + '<section class="pc-carte"><h3>Positionnement</h3><div class="pc-centile"><b data-v="' + (s.percentile_1an == null ? '' : s.percentile_1an) + '" data-from="0" data-dec="0" data-suf="e">' + (s.percentile_1an == null ? '—' : '') + '</b><span> centile sur 1 an · ' + (s.percentile_3ans == null ? '—' : s.percentile_3ans) + 'e sur 3 ans</span></div>'
      + jauge(s.percentile_1an)
      + '<p class="pc-lecture">' + esc(s.lecture) + '.</p>'
      + '<p class="pc-extremes">Plus bas sur un an : <b>' + signe(s.min_1an.valeur, 0) + '</b> (' + jourCourt(s.min_1an.date) + ') · plus haut : <b>' + signe(s.max_1an.valeur, 0) + '</b> (' + jourCourt(s.max_1an.date) + ')</p></section>'
      + '<section class="pc-carte"><h3>Achats et ventes · 26 semaines</h3>' + barres(serie) + '</section>'
      + '<section class="pc-carte"><h3>Dernières semaines</h3><table class="pm-tab pc-tab"><thead><tr><th>Date</th><th>Achats</th><th>Ventes</th><th>Net</th></tr></thead><tbody>'
      + serie.slice(-8).reverse().map(r => '<tr><td>' + jourCourt(r.date) + '</td><td>' + nombre(r.long) + '</td><td>' + nombre(r.short) + '</td><td class="' + sens(r.net) + '">' + signe(r.net, 0) + '</td></tr>').join('')
      + '</tbody></table></section></div>'
      + '<p class="pc-note">Rapport « Legacy » de la CFTC (futures) : positions au mardi ' + esc(jourLong(x.date)) + ', publiées le vendredi ' + esc(jourLong(x.publication)) + '. Retard de trois jours : à lire comme un contexte, pas comme un signal.</p>';
    defiler(corps, 900);
    srcEl.textContent = 'CFTC · ' + d.nom + ' · positions du ' + jourCourt(x.date);
    liaison();
    RayleBus.fusion('terminal', { page_cot: { actif, contrat: d.nom, date_positions: x.date, net: x.net, variation_semaine: s.variation_semaine, centile_1an: s.percentile_1an, lecture: s.lecture } });
  }
  function liaison() {
    const svg = corps.querySelector('#pcSvg'); if (!svg || !donnees) return;
    const serie = donnees.serie, cur = svg.querySelector('#pcCur'), bulle = corps.querySelector('#pcBulle');
    const bouge = e => {
      const r = svg.getBoundingClientRect(), t = e.touches ? e.touches[0] : e;
      const W = largeur, g = W < 520 ? 40 : 46, d = 14, vx = (t.clientX - r.left) / r.width * W;
      const i = Math.max(0, Math.min(serie.length - 1, Math.round((vx - g) / (W - g - d) * (serie.length - 1))));
      const x = g + i * (W - g - d) / Math.max(1, serie.length - 1);
      cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.style.display = '';
      const p = serie[i];
      bulle.hidden = false; bulle.innerHTML = '<b>' + jourCourt(p.date) + '</b> net <span class="' + sens(p.net) + '">' + signe(p.net, 0) + '</span><br>achats ' + nombre(p.long) + ' · ventes ' + nombre(p.short);
      bulle.style.left = Math.min(r.width - 150, Math.max(0, x / W * r.width + 10)) + 'px';
    };
    const sort = () => { cur.style.display = 'none'; bulle.hidden = true; };
    svg.addEventListener('mousemove', bouge); svg.addEventListener('touchmove', bouge, { passive: true }); svg.addEventListener('mouseleave', sort); svg.addEventListener('touchend', sort);
  }

  async function charger() {
    const moi = ++jeton;
    corps.classList.add('maj');
    try {
      const d = await appelWorker('/cot?actif=' + actif + '&semaines=' + semaines, null, 30000);
      if (moi !== jeton) return;
      rendre(d);
    } catch (e) {
      if (moi !== jeton) return;
      corps.innerHTML = '<div class="needkey">' + (e.code === 401 ? "Code d'accès refusé : vérifie ⚙ Réglages de Raylé." : 'Rapport COT indisponible : ' + esc(e.message) + '.') + '</div>';
    } finally { corps.classList.remove('maj'); }
  }
  function choisir(k) { if (!ACTIFS_COT.some(a => a[0] === k)) return false; actif = k; majOnglets(); charger(); return true; }
  racine.querySelector('#pcPer').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    semaines = +b.dataset.s; racine.querySelectorAll('#pcPer button').forEach(x => x.classList.toggle('actif', x === b)); charger();
  });
  racine.querySelector('#pcExpl').onclick = () => demanderARayle('Raylé, explique-moi le rapport COT sur ' + (NOMS_PARLES[actif] || actif) + '.');
  majOnglets();

  return {
    ouvrir(opts) { ouverte = true; if (opts && opts.actif && ACTIFS_COT.some(a => a[0] === opts.actif)) { actif = opts.actif; majOnglets(); } charger(); },
    fermer() { ouverte = false; jeton++; },
    choisir
  };
}
