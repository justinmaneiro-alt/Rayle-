/* ═════════════ FICHE DÉTAILLÉE (onglets : Synthèse · Valorisation · Qualité et santé · Saisonnalité · Technique · Sur XTB · Données et sources) ═════════════
   Rendu pur en HTML + montage des graphiques. Tout chiffre affiché garde sa source et sa date (onglet « Données et sources »). Ni prévision ni conseil. */
import { esc, nf, pct, age } from '../commun/ui.js';
import { monterGraphique, COULEURS } from '../commun/graph.js';
import { sma } from '../commun/analyse.js';
import { analyserUnite, styleFleche } from '../terminal/ma200-h4.js';
import { HORIZONS, NOM_FACTEUR, verdictLigne, pourquoi, LIBELLES } from './modele.js';
import { dcf2, dcfInverse, HYP2 } from './analyse-v2.js';
import { statsFenetre, meilleuresFenetres, carteChaleur, decoder, libelleFenetre, MOIS } from './saison.js';
import { DRAPEAU, NOM_PAYS } from './pays.js';

const fin = x => typeof x === 'number' && Number.isFinite(x), J = 86400e3;
export const ONGLETS_FICHE = [['synthese', 'Synthèse'], ['valo', 'Valorisation'], ['qualite', 'Qualité et santé'], ['saison', 'Saisonnalité'], ['technique', 'Technique'], ['xtb', 'Sur XTB'], ['sources', 'Données et sources']];
export const CLASSE_LIB = { [LIBELLES.TRES]: 'lt-tres', [LIBELLES.ATTR]: 'lt-pas', [LIBELLES.NEUTRE]: 'lt-juste', [LIBELLES.PEU]: 'lt-peu', [LIBELLES.EVITER]: 'lt-chere', [LIBELLES.ND]: 'lt-nd' };
export const badgeLib = lib => `<span class="lt-badge ${CLASSE_LIB[lib] || 'lt-nd'}">${esc(lib)}</span>`;
const pc = (v, d = 1) => (fin(v) ? nf(v * 100, d) + ' %' : '—'), x1 = v => (fin(v) ? nf(v, 1) : '—'), sg = (v, d = 0) => (fin(v) ? (v >= 0 ? '+' : '−') + nf(Math.abs(v) * 100, d) + ' %' : '—');
const Md = (v, dev = '') => (fin(v) ? nf(v / 1e9, Math.abs(v) >= 1e10 ? 1 : 2) + ' Md' + dev : '—'), M = (v, d = 0) => (fin(v) ? nf(v / 1e6, d) + ' M' : '—');
const symDev = d => ({ EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', SEK: 'SEK', NOK: 'NOK', DKK: 'DKK', PLN: 'PLN', JPY: '¥' })[d] || d || '';
export const drapeau = p => DRAPEAU[p] || '';
const nomPays = p => NOM_PAYS[p] || p || '—';

/* ───── radar des facteurs (SVG) ───── */
export function radar(f, cles) {
  const L = cles.filter(k => fin(f[k])), n = L.length; if (n < 3) return '<p class="tp-doux">Pas assez de facteurs pour tracer le radar.</p>';
  const R = 70, cx = 100, cy = 95, pt = (i, v) => { const a = -Math.PI / 2 + 2 * Math.PI * i / n; return [cx + R * v / 100 * Math.cos(a), cy + R * v / 100 * Math.sin(a)]; };
  const grille = [25, 50, 75, 100].map(r => `<polygon points="${L.map((_, i) => pt(i, r).join(',')).join(' ')}" fill="none" stroke="rgba(143,208,227,.14)"/>`).join('');
  const axes = L.map((k, i) => { const [x, y] = pt(i, 100), [tx, ty] = pt(i, 122); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(143,208,227,.14)"/><text x="${tx}" y="${ty}" text-anchor="middle" font-size="8.5" fill="#8497a1">${esc(NOM_FACTEUR[k] || k)}</text>`; }).join('');
  return `<svg class="lt-radar" viewBox="0 0 200 190" role="img" aria-label="Radar des facteurs">${grille}${axes}<polygon points="${L.map((k, i) => pt(i, f[k]).join(',')).join(' ')}" fill="rgba(143,208,227,.22)" stroke="#8fd0e3" stroke-width="1.5"/>${L.map((k, i) => { const [x, y] = pt(i, f[k]); return `<circle cx="${x}" cy="${y}" r="2.4" fill="#fff"/>`; }).join('')}</svg>`;
}
const jauge = (V, P) => {
  if (!V) return '';
  const max = Math.max(V.opt * 1.2, P * 1.15, V.central * 1.4), pos = x => Math.max(0, Math.min(100, x / max * 100)).toFixed(1), n2 = x => nf(x, x >= 100 ? 0 : 2);
  return `<div class="lt-jauge" role="img" aria-label="Prix ${nf(P, 2)} contre valeur estimée ${nf(V.central, 2)}"><i class="lt-j-fourchette" style="left:${pos(V.pess)}%;width:${(pos(V.opt) - pos(V.pess)).toFixed(1)}%"></i><i class="lt-j-central" style="left:${pos(V.central)}%"></i><i class="lt-j-prix" style="left:${pos(P)}%"></i></div>
    <div class="lt-j-legende"><span>pessimiste <b>${n2(V.pess)}</b></span><span>centrale <b>${n2(V.central)}</b></span><span>optimiste <b>${n2(V.opt)}</b></span><span class="lt-prix-leg">prix actuel <b>${n2(P)}</b></span></div>`;
};
/* petit graphique SVG d'une série annuelle avec la médiane */
function courbeAnnuelle(titre, pts, fmt = x => nf(x, 1)) {
  const P = pts.filter(p => fin(p[1])); if (P.length < 2) return `<div class="lt-mini"><b>${esc(titre)}</b><p class="tp-doux">Historique insuffisant.</p></div>`;
  const v = P.map(p => p[1]), mn = Math.min(...v), mx = Math.max(...v), med = [...v].sort((a, b) => a - b)[v.length >> 1], W = 220, H = 70, y = x => H - 8 - (mx === mn ? 0.5 : (x - mn) / (mx - mn)) * (H - 20), xx = i => 10 + i * (W - 20) / (P.length - 1);
  return `<div class="lt-mini"><b>${esc(titre)}</b> <small>médiane ${fmt(med)} · actuel ${fmt(v[v.length - 1])}</small><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titre)}"><line x1="10" x2="${W - 10}" y1="${y(med)}" y2="${y(med)}" stroke="#f1d34f" stroke-dasharray="3 3"/><polyline fill="none" stroke="#8fd0e3" stroke-width="1.6" points="${P.map((p, i) => `${xx(i)},${y(p[1])}`).join(' ')}"/>${P.map((p, i) => `<circle cx="${xx(i)}" cy="${y(p[1])}" r="2" fill="#fff"/>`).join('')}</svg><div class="lt-mini-ax">${P.map(p => `<span>${esc(String(p[0]).slice(0, 4))}</span>`).join('')}</div></div>`;
}

/* ───── contenu des onglets ───── */
function ongletSynthese(c) {
  const { l, f, V4, S } = c, why = pourquoi(l, V4[c.horizon]), fa = l.f || {}, cles = l.c === 'action' ? ['val', 'qua', 'mom', 'gro', 'ris', 'bil', 'iv'] : ['mom', 'ma', 'ris', 'sai', 'ppp', 'carry', 'erp', 'niv'];
  const cartes = HORIZONS.map(h => { const v = V4[h.id]; return `<button type="button" class="lt-hcarte ${c.horizon === h.id ? 'actif' : ''}" data-horizon="${h.id}"><small>${esc(h.nom)}</small>${badgeLib(v.lib)}<b>${v.score == null ? '—' : nf(v.score, 0)}</b><span>confiance ${esc(v.confLib)} (${v.conf} %)</span></button>`; }).join('');
  const bad = V4[c.horizon].badges.map(b => `<li class="lt-b-${b.id}">${esc(b.texte)}</li>`).join('');
  return `<div class="lt-synthese"><article class="tp-carte"><h3>Les quatre horizons côte à côte</h3><div class="lt-horizons">${cartes}</div>${bad ? `<ul class="lt-avert">${bad}</ul>` : ''}
    <p class="tp-doux">Score 0-100 : moyenne pondérée de percentiles, neutre par secteur et par zone. Clique un horizon pour l’appliquer à la liste.</p></article>
    <article class="tp-carte"><h3>Pourquoi ${esc(V4[c.horizon].lib.toLowerCase())} sur ${esc(HORIZONS.find(h => h.id === c.horizon).nom)} ?</h3><ol class="lt-pourquoi">${why.map(w => `<li>${esc(w)}</li>`).join('')}</ol></article>
    <article class="tp-carte"><h3>Radar des facteurs <small>(percentiles 0-100 dans ${esc(l.s || 'sa classe')} · ${esc(l.z || '')})</small></h3>${radar(fa, cles)}</article></div>`;
}
function ongletValo(c) {
  const { l, f } = c, F = f.fond; if (!F) return `<article class="tp-carte"><h3>Valorisation</h3><p class="tp-doux">${l.c === 'action' ? 'Comptes indisponibles pour cette société : ' + esc(l.av || 'aucune source gratuite') : 'Pas de valeur intrinsèque pour cette classe d’actif : le modèle utilise les prix, la saisonnalité et les références de taux (voir l’onglet Synthèse).'}</p></article>`;
  const P = f.px, V = F.valeur, I = F.dcfIn, m = F.methodes || [], info = F.info || [], pairs = c.pairs || [];
  const tabM = [...m.map(x => ({ ...x, info: false })), ...info.map(x => ({ ...x, info: true }))].map(x => `<tr class="${x.info ? 'lt-info' : ''}"><td><b>${esc(x.nom)}</b><br><small>${(x.detail || []).map(esc).join('<br>')}</small></td><td class="lt-num">${nf(x.pess, 2)}</td><td class="lt-num"><b>${nf(x.central, 2)}</b></td><td class="lt-num">${nf(x.opt, 2)}</td></tr>`).join('') || '<tr><td colspan="4" class="tp-doux">Aucune méthode applicable.</td></tr>';
  const hist = F.annees || [], inv = F.implicite;
  const dcfBloc = I ? `<article class="tp-carte"><h3>DCF aux hypothèses modifiables</h3><p class="tp-doux">Modifie les hypothèses : la valeur par action est recalculée sur-le-champ (deux étapes : croissance puis fondu vers la croissance terminale).</p>
    <div class="lt-dcf" data-dcf><label>Flux de trésorerie libre de départ (M)<input type="number" step="1" data-d="base" value="${Math.round(I.base / 1e6)}"></label><label>Croissance, étape 1 (% / an)<input type="number" step="0.5" data-d="g1" value="${(I.g1 * 100).toFixed(1)}"></label><label>Croissance terminale (%)<input type="number" step="0.1" max="2.5" data-d="gt" value="${(I.gt * 100).toFixed(1)}"></label><label>Taux d’actualisation WACC (%)<input type="number" step="0.1" data-d="r" value="${(I.r * 100).toFixed(1)}"></label></div>
    <p class="lt-dcf-sortie" data-dcf-out></p><p class="tp-doux">Plafonds du modèle : croissance étape 1 ≤ min(historique, ${(HYP2.croissanceMax * 100).toFixed(0)} %), croissance terminale ≤ ${(HYP2.croissanceTerminaleMax * 100).toFixed(1)} %. Ici tu peux dépasser : le résultat est alors ta propre hypothèse.</p></article>
    <article class="tp-carte"><h3>DCF inversé : que suppose le prix actuel ?</h3><p class="lt-grand" data-inverse>${inv && fin(inv.g) ? `Le prix de ${nf(P, 2)} ${symDev(f.d)} suppose déjà une croissance du flux libre de ${pc(inv.g, 1)} par an pendant ${I.n1} ans.` : inv && inv.hors === 'haut' ? 'Le prix suppose une croissance supérieure à 40 % par an : incompatible avec les comptes.' : inv && inv.hors === 'bas' ? 'Le prix est inférieur à la valeur obtenue même avec −15 % de croissance par an.' : 'DCF inversé non calculable.'}</p>
    <p class="tp-doux">Historique de la société : ${pc(I.gHist, 1)} par an. ${fin(inv && inv.g) && inv.g > Math.max(I.gHist || 0, 0.12) ? 'Le prix suppose plus que ce que la société a déjà fait : hypothèse exigeante.' : fin(inv && inv.g) ? 'Le prix suppose moins que ce que la société a déjà fait.' : ''}</p></article>` : '';
  return `<article class="tp-carte"><h3>Valeur estimée <small>(médiane des méthodes de valorisation ; Graham n’intervient plus)</small></h3>${V ? jauge(V, P) : '<p class="tp-doux">Pas de valeur estimée : ' + esc((F.avertissements || [])[0] || 'données insuffisantes') + '</p>'}
    ${V ? `<p class="lt-grand">Marge de sécurité ${sg(F.mos)} · fourchette ${nf(V.pess, 2)} – ${nf(V.opt, 2)} ${symDev(f.d)}</p>` : ''}${V && V.central > HYP2.seuilHypothese * P ? '<p class="tp-avert">Valeur estimée supérieure à 4 × le prix : hypothèse à vérifier.</p>' : ''}
    <div class="tp-tableau-defil"><table class="tp-t"><tr><th>Méthode</th><th class="lt-num">Pessimiste</th><th class="lt-num">Centrale</th><th class="lt-num">Optimiste</th></tr>${tabM}</table></div></article>
    ${dcfBloc}
    <article class="tp-carte"><h3>Multiples contre l’historique de la société</h3><div class="lt-minis">${courbeAnnuelle('PER', hist.map(a => [a.fin, a.per]))}${courbeAnnuelle('EV / EBITDA', hist.map(a => [a.fin, a.evEbitda]))}${courbeAnnuelle('Rendement du flux libre', hist.map(a => [a.fin, a.fcfY]), x => pc(x, 1))}</div><p class="tp-doux">Ligne jaune : médiane de l’historique disponible (${hist.length} exercices ; Yahoo Finance donne environ 4 ans hors États-Unis, la SEC plus de 10 ans).</p></article>
    <article class="tp-carte"><h3>Comparaison aux pairs <small>(même secteur, même zone, capitalisation proche)</small></h3>${pairs.length ? `<div class="tp-tableau-defil"><table class="tp-t lt-t"><tr><th>Société</th><th class="lt-num">PER</th><th class="lt-num">Marge</th><th class="lt-num">Qualité</th><th class="lt-num">Valeur rel.</th></tr>${pairs.map(p => `<tr data-id="${esc(p.id)}" tabindex="0"><td><b>${esc(p.id)}</b> ${esc(p.n)}</td><td class="lt-num">${x1(p.r.per)}</td><td class="lt-num">${sg(p.r.mos)}</td><td class="lt-num">${fin(p.f.qua) ? nf(p.f.qua, 0) : '—'}</td><td class="lt-num">${fin(p.f.val) ? nf(p.f.val, 0) : '—'}</td></tr>`).join('')}</table></div>` : '<p class="tp-doux">Pas de pairs comparables dans l’univers.</p>'}</article>
    ${(F.hypotheses || []).length ? `<article class="tp-carte"><h3>Hypothèses des multiples</h3><ul class="tp-liste lt-hyp">${F.hypotheses.slice(0, 6).map(h => `<li>${esc(h)}</li>`).join('')}</ul></article>` : ''}`;
}
function ongletQualite(c) {
  const { l, f } = c, F = f.fond; if (!F) return '<article class="tp-carte"><h3>Qualité et santé</h3><p class="tp-doux">Comptes indisponibles.</p></article>';
  const R = F.ratios || {}, Q = F.qualite, pk = F.piotroski || {}, az = F.altman || {}, r = l.r || {};
  const barres = [['Qualité (ROIC, rentabilité brute, accruals…)', l.f.qua], ['Solidité du bilan', l.f.bil], ['Avantage durable', l.f.moat], ['Croissance', l.f.gro]].filter(x => fin(x[1])).map(([n, v]) => `<div class="lt-q-ligne"><span>${esc(n)}</span><i><u style="width:${Math.round(v)}%"></u></i><b>${nf(v, 0)} / 100</b></div>`).join('');
  return `<article class="tp-carte"><h3>Qualité et santé</h3><div class="lt-qualite">${barres}</div>${Q ? `<div class="lt-qualite">${Q.parts.map(p => `<div class="lt-q-ligne"><span>${esc(p.nom)}</span><i><u style="width:${Math.round(p.v * 100)}%"></u></i><b>${esc(p.note || '')}</b></div>`).join('')}</div>` : ''}
    <div class="tp-cartes"><div><small>Marge opérationnelle</small><b>${pc(R.margeOp)}</b></div><div><small>Marge nette</small><b>${pc(R.margeNette)}</b></div><div><small>ROIC</small><b>${pc(R.roic)}</b></div><div><small>ROE</small><b>${pc(R.roe)}</b></div><div><small>Rentabilité brute (Novy-Marx)</small><b>${pc(r.gprof)}</b></div><div><small>Dette nette / EBITDA</small><b>${x1(R.detteNetteEbitda)}</b></div><div><small>Couverture des intérêts</small><b>${x1(r.icov)}</b></div><div><small>Accruals (qualité des profits)</small><b>${fin(r.accr) ? nf(-r.accr * 100, 1) + ' %' : '—'}</b></div>
    <div><small>Dilution (actions / an)</small><b>${fin(r.dil) ? sg(-r.dil, 1) : '—'}</b></div><div><small>Croissance du CA (5 ans)</small><b>${pc(R.croissanceCA)}</b></div><div><small>Croissance du BPA (5 ans)</small><b>${pc(R.croissanceBPA)}</b></div><div><small>Altman Z-score</small><b>${az.z == null ? '—' : nf(az.z, 2)}</b><span>${esc(az.zone ? 'zone ' + az.zone : 'non applicable')}</span></div></div>
    <h4>Piotroski F-score : ${pk.score == null ? '—' : pk.score + ' / 9'} <small>(${pk.calculables || 0} critères calculables)</small></h4><ul class="lt-pk">${(pk.criteres || []).map(x => `<li class="${x.ok === true ? 'ok' : x.ok === false ? 'ko' : 'nd'}">${x.ok === true ? '✔' : x.ok === false ? '✘' : '·'} ${esc(x.nom)}</li>`).join('')}</ul></article>
    <article class="tp-carte"><h3>Résultats annuels</h3><div class="tp-tableau-defil"><table class="tp-t"><tr><th>Exercice</th><th class="lt-num">Chiffre d’affaires</th><th class="lt-num">Résultat net</th><th class="lt-num">Flux libre</th><th class="lt-num">BPA</th></tr>${(F.annees || []).slice(-8).reverse().map(a => `<tr><td>${esc(a.fin)}</td><td class="lt-num">${Md(a.rev)}</td><td class="lt-num">${Md(a.ni)}</td><td class="lt-num">${Md(a.fcf)}</td><td class="lt-num">${fin(a.eps) ? nf(a.eps, 2) : '—'}</td></tr>`).join('')}</table></div></article>`;
}
function ongletSaison(c) {
  const { f, S } = c, M = decoder(f.saison), Mb = S.ref && S.ref[c.l.p] ? decoder(S.ref[c.l.p]) : null, fen = c.fenetre, st = statsFenetre(M, fen.a, fen.b, Mb), annees = Object.keys(M).length;
  if (annees < 10) return `<article class="tp-carte"><h3>Saisonnalité</h3><p class="tp-doux"><b>Non significatif</b> : ${annees} année(s) d’historique seulement ; il en faut au moins 10.</p></article>`;
  const couleur = v => { if (!fin(v)) return 'transparent'; const a = Math.min(0.85, Math.abs(v) / 0.09); return v >= 0 ? `rgba(95,184,148,${a.toFixed(2)})` : `rgba(216,106,106,${a.toFixed(2)})`; };
  const heat = `<div class="tp-tableau-defil"><table class="lt-heat"><tr><th></th>${MOIS.map((m, i) => `<th class="${fen && inFen(i + 1, fen) ? 'sel' : ''}">${esc(m)}</th>`).join('')}</tr>${carteChaleur(M).slice(0, 20).map(r => `<tr><th>${r.y}</th>${r.mois.map(v => `<td style="background:${couleur(v)}" title="${fin(v) ? sg(v, 1) : ''}">${fin(v) ? nf(v * 100, 0) : ''}</td>`).join('')}</tr>`).join('')}</table></div>`;
  const best = meilleuresFenetres(M, Mb, 5), ligneW = (x, titre) => `<tr><td>${esc(titre)}</td><td class="lt-num">${sg(x.median, 1)}</td><td class="lt-num">${pc(x.pctPositif, 0)}</td><td class="lt-num">${fin(x.excesMedian) ? sg(x.excesMedian, 1) : '—'}</td><td class="lt-num">${x.n}</td></tr>`;
  return `<article class="tp-carte"><h3>Fenêtre de détention : ${esc(libelleFenetre(fen.a, fen.b))}</h3><p class="tp-doux">Achat au début du premier mois, vente à la fin du dernier, sur ${st.n} année(s). Change la fenêtre dans la barre du haut.</p>
    <div class="tp-cartes"><div><small>Rendement médian</small><b class="${st.median > 0 ? 'tp-hausse' : 'tp-baisse'}">${st.significatif ? sg(st.median, 1) : 'non significatif'}</b></div><div><small>Années positives</small><b>${st.significatif ? pc(st.pctPositif, 0) : '—'}</b></div><div><small>Excès contre l’indice (médiane)</small><b>${fin(st.excesMedian) ? sg(st.excesMedian, 1) : '—'}</b></div><div><small>Pire / meilleure année</small><b>${st.significatif ? sg(st.pire, 0) + ' / ' + sg(st.meilleur, 0) : '—'}</b></div></div></article>
    <article class="tp-carte"><h3>Carte de chaleur mois × année <small>(rendement mensuel en %)</small></h3>${heat}</article>
    <article class="tp-carte"><h3>Meilleures fenêtres (1 à 6 mois)</h3>${best.length ? `<div class="tp-tableau-defil"><table class="tp-t"><tr><th>Fenêtre</th><th class="lt-num">Médiane</th><th class="lt-num">% positif</th><th class="lt-num">Excès</th><th class="lt-num">Années</th></tr>${best.map(x => ligneW(x, libelleFenetre(x.a, x.b))).join('')}</table></div>` : '<p class="tp-doux">Aucune fenêtre ne ressort (positive au moins 70 % des années).</p>'}<p class="tp-doux">Historique de ${annees} ans, mois en cours exclu. Une saisonnalité passée ne prédit pas l’avenir ; elle est testée honnêtement dans l’onglet Méthode.</p></article>`;
}
const inFen = (m, { a, b }) => (a <= b ? m >= a && m <= b : m >= a || m <= b);
function ongletTechnique(c) {
  const s = c.f.tech && c.f.tech.setup;
  return `<article class="tp-carte"><h3>Graphique ${c.unite === 'S' ? 'hebdomadaire' : 'journalier'} <span class="lt-bascule"><button type="button" data-unite="J" aria-pressed="${c.unite !== 'S'}">Jour</button><button type="button" data-unite="S" aria-pressed="${c.unite === 'S'}">Semaine</button></span></h3><div class="tp-graph" data-graphe-tech></div>
    <p class="tp-doux">MA200 et flèches de suivi de tendance : les mêmes règles que le Terminal (cassure = grosse flèche, rebond = petite flèche ; une flèche confirmée ne bouge plus). Niveaux : plus fort support et plus forte résistance Daily.</p></article>
    ${s ? `<article class="tp-carte"><h3>Setup tactique : ${nf(s.score, 0)} / 100</h3><ul class="tp-liste">${(s.why || []).map(w => `<li>${esc(w)}</li>`).join('')}</ul><div class="tp-cartes"><div><small>Distance à la MA200 Daily</small><b>${fin(s.dist) ? nf(s.dist, 1) + ' ATR' : '—'}</b></div><div><small>Support Daily</small><b>${fin(s.support) ? nf(s.support, 2) : '—'}</b></div><div><small>Résistance Daily</small><b>${fin(s.resistance) ? nf(s.resistance, 2) : '—'}</b></div><div><small>Dernière flèche</small><b>${s.dArrow ? (s.dArrow.dir > 0 ? 'achat' : 'vente') + ' (' + s.dArrow.type + ') il y a ' + s.dArrow.jours + ' j' : 'aucune récente'}</b></div></div></article>` : ''}`;
}
function ongletXtb(c) {
  const { l, f } = c, sym = f.id || l.id, verif = l.vx ? 'confirmé dans la table des marges officielle de XTB' : 'déduit de la convention XTB (TICKER.PAYS) : non vérifié, car XTB ne publie pas la liste de ses actions au comptant';
  return `<article class="tp-carte"><h3>Sur XTB</h3><div class="lt-xtb"><div><small>Symbole à taper dans xStation</small><b class="lt-grand">${esc(sym)}</b> <button type="button" data-copier="${esc(sym)}">Copier</button><p class="tp-doux">${esc(verif)}.</p></div>
    <div><small>Disponibilité</small><b>${esc(l.da || '—')}</b></div><div><small>PEA</small><b>${l.pea ? 'oui (éligible d’après le pays de cotation ; vérifie l’ISIN chez XTB)' : 'non'}</b></div><div><small>Devise de cotation</small><b>${esc(l.d || '—')}${l.df && l.df !== l.d ? ' · comptes en ' + esc(l.df) : ''}</b></div>
    <div><small>Symbole Yahoo (prix)</small><b>${esc(l.y)}</b></div>${f.isin ? `<div><small>ISIN</small><b>${esc(f.isin)}</b></div>` : ''}<div><small>Palier d’analyse</small><b>${esc(l.pal || '—')}</b> <span class="tp-doux">${l.pal === 'A' ? '(analyse fondamentale complète)' : '(analyse prix ; fondamentaux si disponibles)'}</span></div>${(l.ix || []).length ? `<div><small>Indices</small><b>${esc(l.ix.join(', '))}</b></div>` : ''}</div></article>`;
}
function ongletSources(c) {
  const { l, f } = c, F = f.fond;
  return `<article class="tp-carte"><h3>Données et sources</h3><ul class="tp-liste lt-hyp"><li><b>Prix</b> : Yahoo Finance, ${esc(age(f.t))} (${esc(f.bourse || '—')}, devise ${esc(f.d || '—')}${f.k && f.k !== 1 ? ', pence converties en livres' : ''}).</li>
    ${F ? `<li><b>Comptes annuels</b> : ${esc(f.source || '—')}, dernier exercice ${esc(F.fin || '—')} (devise des comptes ${esc(F.devF || '—')}).${F.conversion ? ' Les comptes sont convertis en ' + esc(F.conversion.vers) + ' au taux du jour : approximation pour les multiples historiques.' : ''}</li>` : ''}
    <li><b>Saisonnalité</b> : clôtures mensuelles ajustées Yahoo, jusqu’à 20 ans ; indice de référence du pays.</li><li><b>Taux, parité de pouvoir d’achat, résultats</b> : FRED, Banque mondiale, Nasdaq (voir l’onglet Méthode de la fenêtre).</li>
    <li><b>Liste des instruments</b> : table des marges officielle de XTB et compositions d’indices (Wikipédia).</li><li><b>Calcul</b> : ${esc(age(l.t))} ; complétude des données ${fin(l.comp) ? Math.round(l.comp * 100) + ' %' : '—'}.</li></ul>
    ${(F && F.avertissements || []).length ? `<h4>Avertissements</h4><ul class="lt-avert">${F.avertissements.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}<p class="tp-doux">Estimations chiffrées avec leurs hypothèses visibles : ni prévision ni conseil en investissement.</p></article>`;
}
const RENDUS = { synthese: ongletSynthese, valo: ongletValo, qualite: ongletQualite, saison: ongletSaison, technique: ongletTechnique, xtb: ongletXtb, sources: ongletSources };

/* ───── montage : en-tête, onglets, graphiques, DCF interactif ───── */
export function rendreFiche(c) {
  const { l, f, V4, horizon } = c, v = V4[horizon], dev = symDev(l.d), nomBlocs = ONGLETS_FICHE.filter(([k]) => !(k === 'qualite' && l.c !== 'action'));
  c.onglet = c.onglet && nomBlocs.some(([k]) => k === c.onglet) ? c.onglet : 'synthese';
  const entete = `<div class="lt-fiche-tete"><button type="button" data-retour>◀ Retour</button><div><h2>${drapeau(l.p)} ${esc(l.n)} <small>${esc(l.id)} · ${esc(l.c)}${l.s ? ' · ' + esc(l.s) : ''} · ${esc(nomPays(l.p))}</small></h2><p class="tp-doux">${nf(l.px, l.px >= 100 ? 0 : 2)} ${esc(dev)} · calcul ${esc(age(l.t))}${l.cap ? ' · capitalisation ' + nf(l.cap / 1000, l.cap >= 10000 ? 0 : 1) + ' Md€' : ''}</p></div>
    <div class="lt-fiche-actions">${badgeLib(v.lib)}<span class="lt-grand">${v.score == null ? '—' : nf(v.score, 0) + ' / 100'}</span><button type="button" class="lt-etoile" data-etoile="${esc(l.id)}" aria-pressed="${c.suivie}">${c.suivie ? '★ Suivie' : '☆ Suivre'}</button><button type="button" data-expliquer>🔊 Rayle explique</button></div></div>
    <nav class="lt-onglets-fiche" role="tablist">${nomBlocs.map(([k, n]) => `<button type="button" role="tab" data-fonglet="${k}" aria-selected="${k === c.onglet}">${esc(n)}</button>`).join('')}</nav>`;
  c.zone.innerHTML = `<div class="lt-fiche">${entete}<div data-fcorps>${RENDUS[c.onglet](c)}</div></div>`;
  if (c.onglet === 'technique') montrerTechnique(c); if (c.onglet === 'valo') brancherDcf(c);
}
function brancherDcf(c) {
  const F = c.f.fond, I = F && F.dcfIn, boite = c.zone.querySelector('[data-dcf]'); if (!I || !boite) return;
  const lire = k => parseFloat(boite.querySelector(`[data-d="${k}"]`).value), maj = () => {
    const base = lire('base') * 1e6, g1 = lire('g1') / 100, gt = lire('gt') / 100, r = lire('r') / 100, out = c.zone.querySelector('[data-dcf-out]');
    const v = dcf2(base, g1, gt, r, I.dette, I.treso, I.actions, { n1: I.n1, n2: I.n2 }), P = I.prix;
    out.innerHTML = v == null ? '<span class="tp-baisse">Hypothèses incohérentes (le taux doit dépasser la croissance terminale).</span>' : `Valeur par action : <b class="lt-grand">${nf(v, 2)} ${esc(symDev(c.f.d))}</b> contre un prix de ${nf(P, 2)} → marge de sécurité <b class="${v > P ? 'tp-hausse' : 'tp-baisse'}">${sg((v - P) / v)}</b>.`;
    const iv = dcfInverse(base, gt, r, I.dette, I.treso, I.actions, P), el = c.zone.querySelector('[data-inverse]'); if (el && iv && fin(iv.g)) el.textContent = `Avec ces hypothèses, le prix de ${nf(P, 2)} suppose une croissance du flux libre de ${pc(iv.g, 1)} par an pendant ${I.n1} ans.`;
  };
  boite.addEventListener('input', maj); maj();
}
async function montrerTechnique(c) {
  const box = c.zone.querySelector('[data-graphe-tech]'); if (!box) return; const T = c.f.tech; if (!T || !T.d || T.d.length < 30) { box.innerHTML = '<p class="tp-panne">Historique indisponible.</p>'; return; }
  try {
    const G = await monterGraphique(box, { hauteur: 340, intraday: false, dec: c.f.px >= 100 ? 0 : 2 }); if (c.annule && c.annule()) { G.detruire(); return; } c.graphs.push(G);
    if (c.unite === 'S') { const W = (T.w || []).map(p => ({ t: p[0] * J, c: p[1] })), m = sma(W.map(x => x.c), 200); const s = G.ligne(W.map(x => ({ t: x.t, v: x.c })), { couleur: COULEURS.accent, titre: 'prix (semaine)' }); G.ligne(W.map((x, i) => ({ t: x.t, v: m[i] })).filter(p => p.v != null), { couleur: COULEURS.or, titre: 'MA200 semaines' }); }
    else {
      const B = T.d.map(p => ({ t: p[0] * J, o: p[1], h: p[2], l: p[3], c: p[4], v: p[5] * 1000 })), a = analyserUnite(B, 'J', { maintenant: Date.now() + J }), s = G.bougies(a.B);
      G.ligne(a.B.map((b, i) => ({ t: b.t, v: a.M[i] })).filter(p => p.v != null), { couleur: COULEURS.or, titre: 'MA200' });
      G.marqueurs(s, a.fleches.map(fl => { const st = styleFleche(fl); return { time: Math.floor(fl.t / 1000), position: st.position, color: st.couleur, shape: st.forme, size: fl.type === 'cassure' ? 2 : 1 }; }));
      const su = T.setup; if (su && fin(su.support)) G.niveau(s, su.support, { couleur: COULEURS.hausse, titre: 'support' }); if (su && fin(su.resistance)) G.niveau(s, su.resistance, { couleur: COULEURS.baisse, titre: 'résistance' });
    }
    G.ajuster();
  } catch (e) { box.innerHTML = '<p class="tp-panne">Graphique indisponible.</p>'; }
}
