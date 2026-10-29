/* ═════════════ ÉCRANS « POSITIONS DU JOUR », « BILAN », « POURQUOI PAS PLUS », « RÉGLAGES » ET « EXEMPLES » (V7, phases 3 à 6 ; module PUR, testé : galaxie/tests/positions-ui-test.mjs) ═════════════
   Rend du HTML à partir de la vue publiée par le service (route /__agent/positions). Rien n'est inventé : sans données, l'écran le dit. Le niveau de preuve est TOUJOURS visible à côté de chaque position, avec les
   statistiques réelles de son type de setup ; aucune interface n'envoie d'ordre. Le dessin d'une position (bougies, zone d'entrée, stop, cibles) est un SVG pur, lisible au doigt (viewBox, sans dépendance). */
export const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fr = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('.', ','));
const prix = x => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('fr-FR', { maximumFractionDigits: x >= 1000 ? 0 : x >= 10 ? 2 : 4 }));
const pct = x => (x == null || !Number.isFinite(x) ? '—' : Math.round(x * 100) + ' %');
const R = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '−') + fr(Math.abs(x), d) + ' R');
const quand = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const NOMS_AGENTS = { rebond: 'Rebond', continuation: 'Continuation', extremes: 'Extrêmes', libre: 'Hypothèse' };
export const NIVEAUX_TXT = { validee: 'Validée', candidate: 'Candidate (en observation)', non_concluante: 'Testée : non concluante', non_testee: 'Idée non testée' };
const carte = (titre, corps, cls = '') => '<section class="av4-carte av7-carte ' + cls + '"><h4>' + titre + '</h4>' + corps + '</section>';
export const indisponible = raison => '<p class="av4-indispo">Le service du PC ne répond pas (' + esc(raison) + '). Les positions sont calculées par Kepler sur ton PC : lance-le (node agent-pc/service.mjs) ou ouvre Rayle depuis l’application PC. Sur téléphone, la lecture passe par le Worker quand le PC est éteint.</p>';

/* ── dessin SVG pur ── */
/* `bougies` : [[t, o, h, l, c], …] (les plus récentes à la fin). `p` : une proposition (zone, limite, stop, cible, cible2, sens, t) ; `marques` : [{ t, prix, texte }] (exemples). Rend { svg, echelle } ; l'échelle permet de convertir un clic en (temps, prix). */
export function svgBougies(bougies, { p = null, marques = [], largeur = 560, hauteur = 220, nMax = 96, titre = '' } = {}) {
  const b = (bougies || []).slice(-nMax); if (b.length < 5) return { svg: '<p class="av4-doux">Pas assez de bougies pour dessiner.</p>', echelle: null };
  const niv = p ? [p.limite, p.stop, p.cible, p.cible2, p.zone && p.zone[0], p.zone && p.zone[1]].filter(Number.isFinite) : [];
  for (const m of marques) if (Number.isFinite(m.prix)) niv.push(m.prix);
  let hi = Math.max(...b.map(x => x[2]), ...niv), lo = Math.min(...b.map(x => x[3]), ...niv); const marge = (hi - lo) * 0.06 || hi * 0.001; hi += marge; lo -= marge;
  const gauche = 6, droite = 62, haut = 8, bas = 18, W = largeur, H = hauteur, pw = W - gauche - droite, ph = H - haut - bas, pas = pw / b.length, y = v => haut + (hi - v) / (hi - lo) * ph, x = i => gauche + pas * (i + 0.5);
  const echelle = { gauche, droite, haut, bas, W, H, pas, n: b.length, t0: b[0][0], dt: b.length > 1 ? b[1][0] - b[0][0] : 900e3, hi, lo, y: v => y(v), prixDe: py => hi - (py - haut) / ph * (hi - lo), indexDe: px => Math.max(0, Math.min(b.length - 1, Math.floor((px - gauche) / pas))), bougies: b };
  const o = [];
  o.push('<svg class="av7-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(titre || 'Graphique des bougies') + '" preserveAspectRatio="xMidYMid meet">');
  for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3, yy = y(v); o.push('<line x1="' + gauche + '" x2="' + (W - droite) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" class="av7-grille"/><text x="' + (W - droite + 4) + '" y="' + (yy + 3).toFixed(1) + '" class="av7-axe">' + esc(prix(v)) + '</text>'); }
  if (p && p.zone) { const y1 = y(p.zone[1]), y2 = y(p.zone[0]), i0 = Math.max(0, b.findIndex(c => c[0] >= p.t)); o.push('<rect x="' + x(i0).toFixed(1) + '" y="' + Math.min(y1, y2).toFixed(1) + '" width="' + (W - droite - x(i0)).toFixed(1) + '" height="' + Math.max(2, Math.abs(y2 - y1)).toFixed(1) + '" class="av7-zone"/>'); }
  for (let i = 0; i < b.length; i++) { const [, op, h, l, c] = b[i], haussier = c >= op, cl = haussier ? 'av7-h' : 'av7-b', yc = Math.min(y(op), y(c)), hc = Math.max(1, Math.abs(y(op) - y(c))); o.push('<line x1="' + x(i).toFixed(1) + '" x2="' + x(i).toFixed(1) + '" y1="' + y(h).toFixed(1) + '" y2="' + y(l).toFixed(1) + '" class="' + cl + '"/><rect x="' + (x(i) - pas * 0.32).toFixed(1) + '" y="' + yc.toFixed(1) + '" width="' + (pas * 0.64).toFixed(1) + '" height="' + hc.toFixed(1) + '" class="' + cl + ' av7-corps"/>'); }
  const ligne = (v, cls, txt) => { if (!Number.isFinite(v)) return; o.push('<line x1="' + gauche + '" x2="' + (W - droite) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="av7-niv ' + cls + '"/><text x="' + (W - droite + 4) + '" y="' + (y(v) + 3).toFixed(1) + '" class="av7-etiq ' + cls + '">' + esc(txt) + '</text>'); };
  if (p) { ligne(p.limite, 'av7-entree', 'entrée'); ligne(p.stop, 'av7-stop', 'stop'); ligne(p.cible, 'av7-cible', 'cible 1'); ligne(p.cible2, 'av7-cible', 'cible 2'); }
  for (const m of marques) { const i = Math.max(0, b.findIndex(c => c[0] >= m.t)); if (!(m.t >= b[0][0])) continue; o.push('<circle cx="' + x(i).toFixed(1) + '" cy="' + y(m.prix).toFixed(1) + '" r="4" class="av7-marque"/>' + (m.texte ? '<text x="' + (x(i) + 6).toFixed(1) + '" y="' + (y(m.prix) - 5).toFixed(1) + '" class="av7-etiq">' + esc(m.texte) + '</text>' : '')); }
  o.push('</svg>');
  return { svg: o.join(''), echelle };
}

/* Convertit un clic (coordonnées SVG) en { index, t, prix }. */
export function pointDepuisClic(echelle, px, py) {
  if (!echelle) return null; const i = echelle.indexDe(px), c = echelle.bougies[i];
  return { index: i, t: c[0], prix: +echelle.prixDe(py).toFixed(echelle.hi > 1000 ? 1 : echelle.hi > 10 ? 3 : 5) };
}

/* ── statistiques réelles du type de setup, en clair ── */
export function htmlPreuve(preuve) {
  const e = preuve || {}, n = e.niveau || 'non_testee';
  const stat = e.n ? 'réussite ' + pct(e.tauxReussite) + ' · gain / perte moyens ' + fr(e.rrMoyen, 1) + ' · espérance après frais <b>' + R(e.esperance) + '</b>' + (e.fourchette ? ' (fourchette à 95 % : ' + R(e.fourchette[0]) + ' à ' + R(e.fourchette[1]) + ')' : '') + ' · ' + e.n + ' trades hors échantillon' : 'aucun trade mesuré';
  const msg = n === 'validee' ? '' : n === 'candidate' ? '<p class="av7-alerte">Pas encore validée : prends-la comme un test, pas comme un signal fiable.</p>' : '<p class="av7-alerte">Preuve insuffisante : prends-la comme une idée, pas comme un signal fiable.</p>';
  return '<p class="av7-preuve"><span class="av7-niveau" data-niveau="' + esc(n) + '">' + esc(NIVEAUX_TXT[n] || n) + '</span> ' + stat + '</p>' + msg;
}

/* Une carte de position. */
export function htmlCarteProposition(p, bougies) {
  const achat = p.sens > 0, g = svgBougies(bougies && bougies[p.actif], { p, titre: (achat ? 'Achat ' : 'Vente ') + p.actif });
  const ouverte = p.statut === 'ouverte', conf = p.confluence || {};
  return '<article class="av7-pos" data-sens="' + (achat ? 'achat' : 'vente') + '" data-agent="' + esc(p.agent) + '" data-niveau="' + esc(p.preuve ? p.preuve.niveau : 'non_testee') + '">'
    + '<header><b class="av7-sens">' + (achat ? 'ACHAT' : 'VENTE') + '</b> ' + esc(p.actif) + ' <span class="av7-tf">' + esc(p.tf) + '</span> ' + (p.diamant || conf.diamant ? '<span class="av7-diamant" title="Zone de confluence premium">💎 zone diamant</span>' : '') + '<span class="av7-agent">' + esc(NOMS_AGENTS[p.agent] || p.agent) + ' · ' + esc(p.nomType || p.type) + '</span></header>'
    + '<div class="av7-etat">' + (ouverte ? 'Entrée touchée (position ouverte en simulation)' : 'Ordre limite en attente') + ' · valable jusqu’à ' + esc(quand(p.tValide)) + '</div>'
    + '<table class="av4-tab av7-tab"><tbody><tr><th>Zone d’entrée</th><td>' + (p.zone ? prix(p.zone[0]) + ' – ' + prix(p.zone[1]) : prix(p.limite)) + '</td><th>Ordre limite</th><td>' + prix(p.limite) + '</td></tr>'
    + '<tr><th>Stop</th><td>' + prix(p.stop) + '</td><th>Rapport gain / risque</th><td>' + fr(p.rr, 1) + ' pour 1</td></tr>'
    + '<tr><th>Cible 1</th><td>' + prix(p.cible) + (p.cibleNom ? ' <small>(' + esc(p.cibleNom) + ')</small>' : '') + '</td><th>Cible 2</th><td>' + (p.cible2 ? prix(p.cible2) : '—') + '</td></tr></tbody></table>'
    + '<p class="av7-raison"><b>Pourquoi :</b> ' + esc(p.raison) + '</p>' + htmlPreuve(p.preuve) + '<p class="av7-invalide"><b>Annulée si :</b> ' + esc(p.invalidation) + '.</p>' + g.svg + '</article>';
}

/* ── onglet « Positions du jour » ── */
export function htmlPositions(d) {
  if (!d || d.existe === false) return '<p class="av4-doux">' + esc((d && d.note) || 'Kepler n’a pas encore calculé de position sur ce PC.') + '</p>';
  const v = d.vue; if (!v) return indisponible('vue vide');
  const bougies = v.bougies || {}, l = [];
  l.push('<div class="av4-garde">' + esc(v.avertissement) + '</div>');
  l.push('<p class="av7-version">Niveau de preuve : <b>' + esc(v.versionCriteres) + '</b> · ' + (v.mesureEnCours ? 'mesure en cours sur ' + esc(v.mesureEnCours) + '…' : 'dernier calcul ' + esc(quand(v.dernierCycle))) + (d.enMarche === false ? ' · <b>service arrêté</b>' : '') + '</p>');
  const props = v.propositions || [];
  l.push(props.length ? '<div class="av7-liste">' + props.map(p => htmlCarteProposition(p, bougies)).join('') + '</div>' : htmlAucune(v));
  const z = Object.entries(v.zonesDiamant || {}).flatMap(([a, zs]) => (zs || []).map(x => ({ ...x, actif: a })));
  if (z.length) l.push(carte('💎 Zones diamant à surveiller', '<ul class="av4-l">' + z.slice(0, 8).map(x => '<li><b>' + esc(x.actif) + ' ' + esc(x.tf) + '</b> ' + prix(x.niveau) + ' (' + (x.cote === 'support' ? 'support' : 'résistance') + ', à ' + fr(x.distancePct) + ' %)' + (x.enApproche ? ' <span class="av7-approche">le prix approche</span>' : '') + ' — ' + esc(x.resume) + '</li>').join('') + '</ul><p class="av4-doux">Une zone diamant est une zone où plusieurs éléments se superposent (balayage de liquidité, plus bas égaux, extrême de la veille, POC, VWAP, absorption, mur du carnet…). Ce n’est pas une prédiction : la preuve est dans les statistiques de chaque type de position.</p>'));
  return l.join('');
}
/* Quand rien n'est proposé : jamais « rien » sans explication. */
export function htmlAucune(v) {
  const hs = v.hypotheses_du_moment || [], bougies = v.bougies || {}, r = v.reglages || {};
  const carteHyp = h => (h.type === 'preuve' && h.limite != null)
    ? '<div class="av7-hyp"><b>Meilleure position du moment, masquée par ton niveau de preuve :</b>' + htmlCarteProposition({ ...h, confluence: h.confluence || {}, diamant: h.confluence && h.confluence.diamant }, bougies) + '<span class="av7-pourquoi">' + esc(h.pourquoi || '') + '</span>' + (h.quand ? '<br><span class="av7-quand">' + esc(h.quand) + '</span>' : '') + '</div>'
    : '<div class="av7-hyp"><b>' + esc(h.actif) + (h.tf ? ' ' + esc(h.tf) : '') + '</b> — ' + esc(h.raison || '') + '<br><span class="av7-pourquoi">Pourquoi elle n’est pas proposée : ' + esc(h.pourquoi || '') + '</span>' + (h.quand ? '<br><span class="av7-quand">Quand elle le deviendrait : ' + esc(h.quand) + '</span>' : '') + '</div>';
  const corps = hs.length ? hs.map(carteHyp).join('') : '<p>Aucune configuration ne passe le filtre qualité pour l’instant, et aucune zone à surveiller n’est assez nette. Je recalcule à chaque clôture de bougie.</p>';
  const bascule = '<label class="av7-opt"><input type="checkbox" data-av7-reg="afficherIdees"' + (r.afficherIdees ? ' checked' : '') + '> Montrer aussi les idées non testées et les types non concluants (clairement étiquetés, avec leurs vraies statistiques)</label>';
  return carte('Aucune position proposée pour l’instant', corps + bascule + '<p class="av4-doux">Par défaut, seules les positions « Candidate » ou « Validée » sont montrées : les autres ont des statistiques insuffisantes ou négatives.</p>', 'av7-aucune');
}

/* ── onglet « Bilan » ── */
export function htmlBilan(d) {
  if (!d || d.existe === false || !d.vue) return '<p class="av4-doux">Pas encore de bilan : aucune position proposée n’a été suivie.</p>';
  const v = d.vue, B = v.bilan, l = [];
  l.push('<div class="av4-garde">Tout vient de la simulation (frais et glissement réalistes, ordres limites avec file d’attente). Rien n’est retouché, rien n’est promis.</div>');
  l.push(carte('Où on en est', '<p class="av7-phrase">' + esc(B.tous.phrase) + '</p><p class="av7-hebdo">' + esc(v.phraseHebdo) + '</p>' + (B.tous.hasard && B.tous.hasard.assez ? '<p>Comparaison avec des positions prises <b>au hasard</b> (mêmes distances, mêmes périodes) : espérance ' + R(B.tous.hasard.esperance) + ' contre ' + R(B.tous.esperance) + ' pour les positions de Kepler' + (B.tous.ecartHasard != null ? ' (écart ' + R(B.tous.ecartHasard) + ')' : '') + '.</p>' : '<p class="av4-doux">Comparaison avec le hasard : pas encore assez de positions terminées.</p>')));
  const ligne = b => '<tr><th>' + esc(b.agent ? NOMS_AGENTS[b.agent] : 'Tous') + '</th><td>' + b.semaine + ' / ' + b.mois + '</td><td>' + b.executees + '</td><td>' + b.cloturees + '</td><td>' + pct(b.tauxReussite) + '</td><td>' + fr(b.rrRealise, 1) + '</td><td><b>' + R(b.Rtotal, 1) + '</b> <small>(' + (b.pctTotal >= 0 ? '+' : '−') + fr(Math.abs(b.pctTotal), 1) + ' % à ' + fr(b.risquePct) + ' %)</small></td><td>' + b.pireSerie + '</td></tr>';
  l.push(carte('Par agent', '<div class="av7-defile"><table class="av4-tab av7-tab"><thead><tr><th></th><th>Propositions semaine / mois</th><th>Entrées</th><th>Terminées</th><th>Réussite</th><th>Gain / perte réalisés</th><th>Résultat</th><th>Pire série</th></tr></thead><tbody>' + B.parAgent.map(ligne).join('') + ligne(B.tous) + '</tbody></table></div>'));
  l.push(carte('Niveau de preuve de chaque type de position', htmlTypes(v.types || [])));
  if ((v.journalNiveaux || []).length) l.push(carte('Promotions et rétrogradations', '<ul class="av4-journal">' + v.journalNiveaux.slice(0, 12).map(e => '<li><small>' + esc(quand(e.t)) + '</small> ' + esc(e.texte) + '</li>').join('') + '</ul>'));
  const prof = Object.entries(v.mesures || {}).flatMap(([a, m]) => (m.profil && m.profil.phrases) || []);
  if (prof.length) l.push(carte('Ce que Kepler a appris de chaque actif', '<ul class="av4-l">' + prof.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul><p class="av4-doux">Mesuré sur la zone de recherche seulement. Un contexte « écarté » perd de façon répétée : les positions qui en viennent sont masquées.</p>'));
  if (v.occasions && v.occasions.total) l.push(carte('Occasions manquées', '<p>' + esc(v.occasions.resume) + '</p>'));
  l.push('<p class="av4-doux">Essais comptés : ' + (v.essais ? v.essais.total : '—') + ' (le compteur ne baisse jamais) · jeux finaux ouverts : ' + (v.essais ? v.essais.jeuxFinauxOuverts : '—') + ' · critères ' + esc(v.versionCriteres) + ' (empreinte ' + esc(v.empreinteV4) + ').</p>');
  return l.join('');
}
/* Honnêteté sur les ordres limites : combien posés, remplis, jamais touchés, partis sans nous, remplis du mauvais côté (sélection adverse). */
export function htmlOrdres(o) {
  if (!o || !o.poses) return '<small>—</small>';
  return '<small>' + o.poses + ' posés, ' + o.remplis + ' remplis (' + pct(o.remplis / o.poses) + '), ' + o.nonRemplis + ' jamais touchés, ' + o.partisSansNous + ' partis sans nous, ' + pct(o.remplis ? o.adverses / o.remplis : null) + ' remplis du mauvais côté</small>';
}
export function htmlTypes(types) {
  if (!types.length) return '<p class="av4-doux">Les types de position n’ont pas encore été mesurés (la première mesure prend quelques minutes).</p>';
  return '<div class="av7-defile"><table class="av4-tab av7-tab"><thead><tr><th>Type</th><th>Actif</th><th>Niveau</th><th>Trades</th><th>Réussite</th><th>Espérance</th><th>Ordres limites</th></tr></thead><tbody>' + types.map(t => '<tr><td>' + esc(t.nomType) + ' <small>' + esc(t.tf) + '</small></td><td>' + esc(t.actif) + '</td><td><span class="av7-niveau" data-niveau="' + esc(t.niveau) + '">' + esc(NIVEAUX_TXT[t.niveau] || t.niveau) + '</span></td><td>' + (t.n || 0) + '</td><td>' + pct(t.tauxReussite) + '</td><td>' + R(t.esperance) + (t.fourchette ? ' <small>[' + fr(t.fourchette[0]) + ' ; ' + fr(t.fourchette[1]) + ']</small>' : '') + '</td><td>' + htmlOrdres(t.ordres) + '</td></tr>').join('') + '</tbody></table></div>';
}

/* ── onglet « Pourquoi pas plus » ── */
export function htmlPourquoi(d, pistes = null) {
  if (!d || d.existe === false || !d.vue) return '<p class="av4-doux">Rien à expliquer encore : les types de position n’ont pas été mesurés.</p>';
  const v = d.vue, l = [];
  l.push('<div class="av4-garde">Pour chaque type de position : ce qui lui manque pour passer de « Candidate » à « Validée » (ou de « non concluante » à « Candidate »). Les critères sont ceux de la version ' + esc(v.versionCriteres) + ' ; ils ne sont jamais assouplis pour faire passer une stratégie.</div>');
  const types = (v.types || []).filter(t => t.niveau !== 'validee');
  l.push(types.length ? types.map(t => carte(esc(t.nomType) + ' · ' + esc(t.actif) + ' ' + esc(t.tf), '<p><span class="av7-niveau" data-niveau="' + esc(t.niveau) + '">' + esc(NIVEAUX_TXT[t.niveau]) + '</span> — ' + (t.n || 0) + ' trades, espérance ' + R(t.esperance) + '</p><p>' + esc(t.pourquoi || '') + '</p>' + (t.jeuFinal && t.jeuFinal.ouvert ? '<p class="av4-doux">Jeu final ouvert une fois : ' + (t.jeuFinal.ok ? 'confirmé' : 'non confirmé') + '.</p>' : ''))).join('') : '<p class="av4-doux">Tous les types mesurés sont déjà « Validée ».</p>');
  if (pistes && pistes.pistes && pistes.pistes.length) l.push(carte('Les meilleures pistes de la recherche : strict ou équilibré ?', pistes.pistes.map(p => { const n = p.niveaux || {}; return '<div class="av7-piste"><b>' + esc(p.nom) + ' · ' + esc(p.paire) + '</b><br>Niveau strict (v3) : <span class="av7-niveau" data-niveau="' + esc(n.strict ? n.strict.niveau : 'non_testee') + '">' + esc(NIVEAUX_TXT[n.strict ? n.strict.niveau : 'non_testee']) + '</span> · Niveau équilibré (v4) : <span class="av7-niveau" data-niveau="' + esc(n.equilibre ? n.equilibre.niveau : 'non_testee') + '">' + esc(NIVEAUX_TXT[n.equilibre ? n.equilibre.niveau : 'non_testee']) + '</span>' + (n.equilibre ? '<br><small>' + esc(n.equilibre.pourquoi) + '</small>' : '') + '</div>'; }).join('')));
  return l.join('');
}

/* ── onglet « Réglages » (positions) ── */
export function htmlReglages(d) {
  if (!d || !d.vue) return '<p class="av4-doux">Les réglages apparaîtront dès que le service aura calculé une première fois.</p>';
  const r = d.vue.reglages, ck = (k, texte) => '<label class="av7-opt"><input type="checkbox" data-av7-reg="' + k + '"' + (r[k] ? ' checked' : '') + '> ' + texte + '</label>';
  const ag = (a, texte) => '<label class="av7-opt"><input type="checkbox" data-av7-agent="' + a + '"' + (r.agents[a] ? ' checked' : '') + '> ' + texte + '</label>';
  const un = (u) => '<label class="av7-opt"><input type="checkbox" data-av7-unite="' + u + '"' + (r.unites.includes(u) ? ' checked' : '') + '> ' + u + '</label>';
  const ac = (a) => '<label class="av7-opt"><input type="checkbox" data-av7-actif="' + a + '"' + (r.actifs.includes(a) ? ' checked' : '') + '> ' + a + '</label>';
  const nombre = (k, min, max, pas, texte) => '<label class="av7-opt">' + texte + ' <input type="number" data-av7-num="' + k + '" min="' + min + '" max="' + max + '" step="' + pas + '" value="' + esc(r[k]) + '"></label>';
  return carte('Agents', ag('rebond', 'Rebond (balayage de liquidité, absorption)') + ag('continuation', 'Continuation (repli dans une tendance)') + ag('extremes', 'Extrêmes (fin de range, après une cascade)'))
    + carte('Actifs et unités de temps', ['BTC', 'SOL', 'DOGE'].map(ac).join('') + '<br>' + ['M15', 'H1'].map(un).join(''))
    + carte('Combien et quelle qualité', nombre('maxParAgent', 1, 6, 1, 'Positions actives par agent (au plus)') + nombre('maxNouvellesParJour', 1, 15, 1, 'Nouvelles positions par jour (au plus)') + nombre('confluenceMin', 1, 4, 1, 'Éléments de confluence minimum') + nombre('risquePct', 0.05, 2, 0.05, 'Risque par trade (%), pour les résultats en %')
      + '<label class="av7-opt">Niveau de preuve minimum affiché <select data-av7-sel="niveauPreuveMin"><option value="validee"' + (r.niveauPreuveMin === 'validee' ? ' selected' : '') + '>Validée seulement</option><option value="candidate"' + (r.niveauPreuveMin === 'candidate' ? ' selected' : '') + '>Candidate et plus</option></select></label>' + ck('afficherIdees', 'Montrer aussi les idées non testées et les types non concluants (clairement étiquetés)'))
    + carte('Alertes Telegram', ck('alertesObservation', 'Alertes « Observation (non validé) » pour les positions Candidate (désactivées par défaut)') + ck('surveillance', 'Mode « trade à surveiller » : prévenir quand le prix approche d’une zone diamant') + '<p class="av4-doux">Une position Validée envoie une alerte normale (marquée SIMULATION tant que son type n’a pas fini la phase de simulation en direct : 4 semaines ou 30 trades). Jamais d’ordre réel.</p>')
    + carte('Niveau de preuve', '<p>Version actuelle : <b>' + esc(d.vue.versionCriteres) + '</b>.</p><label class="av7-opt"><input type="radio" name="av7-niv" data-av7-niveau-preuve="equilibre"' + (r.versionCriteres === 'equilibre' ? ' checked' : '') + '> Équilibré (v4) — Candidate à +0,08 R, Validée à +0,12 R</label><label class="av7-opt"><input type="radio" name="av7-niv" data-av7-niveau-preuve="strict"' + (r.versionCriteres === 'strict' ? ' checked' : '') + '> Strict (v3) — un seul niveau, +0,25 R</label><p class="av4-doux">Les deux versions restent disponibles ; l’ancienne n’est jamais modifiée.</p>');
}

/* ── onglet « Exemples » : marquer « ici j'aurais pris ça » sur le graphique ── */
export function htmlExemples(d, { actif = 'BTC', marquage = null } = {}) {
  if (!d || !d.vue) return '<p class="av4-doux">Les exemples seront disponibles dès que le service aura des bougies à montrer.</p>';
  const v = d.vue, g = svgBougies((v.bougies || {})[actif], { marques: (v.exemples || []).filter(e => e.actif === actif).map(e => ({ t: e.t, prix: e.entree, texte: e.avis === 'bon' ? '✔' : '✘' })), titre: 'Graphique ' + actif + ' pour marquer un exemple' });
  const etape = !marquage ? 0 : marquage.entree == null ? 0 : marquage.stop == null ? 1 : marquage.cible == null ? 2 : 3;
  const consignes = ['1. Touche le graphique : le moment et le prix d’ENTRÉE.', '2. Touche le prix du STOP.', '3. Touche le prix de la CIBLE.', 'Prêt : choisis « J’aurais pris ça » ou « Pas bon ».'];
  const choix = '<p class="av7-actifs">' + ['BTC', 'SOL', 'DOGE'].map(a => '<button type="button" class="av4-bouton' + (a === actif ? ' actif' : '') + '" data-av7-actif-ex="' + a + '">' + a + '</button>').join(' ') + '</p>';
  const recap = marquage && marquage.entree != null ? '<p>Entrée ' + prix(marquage.entree) + (marquage.stop != null ? ' · stop ' + prix(marquage.stop) : '') + (marquage.cible != null ? ' · cible ' + prix(marquage.cible) : '') + ' <button type="button" class="av4-bouton" data-av7-ex-raz>Effacer</button></p>' : '';
  const boutons = '<p class="av7-actions"><button type="button" class="av4-bouton" data-av7-ex-ajouter="bon"' + (etape < 3 ? ' disabled' : '') + '>✔ J’aurais pris ça</button> <button type="button" class="av4-bouton" data-av7-ex-ajouter="mauvais"' + (marquage && marquage.entree != null ? '' : ' disabled') + '>✘ Pas bon</button></p>';
  const liste = (v.exemples || []).slice(0, 10).map(e => '<li><b>' + esc(quand(e.t)) + '</b> ' + esc(e.actif) + ' · ' + (e.avis === 'bon' ? 'j’aurais ' + (e.sens === 'achat' ? 'acheté' : 'vendu') : 'pas bon') + ' vers ' + prix(e.entree) + ' — ' + (e.analyse ? esc(e.analyse.pourquoi) : 'analyse en cours…') + '</li>').join('');
  return '<div class="av4-garde">' + esc(v.gardeExemples) + '</div>' + carte('Marquer un exemple', choix + '<p class="av7-consigne">' + esc(consignes[etape]) + '</p><div class="av7-graphe" data-av7-graphe>' + g.svg + '</div>' + recap + boutons)
    + carte('Tes exemples', '<p>' + esc(v.resumeExemples) + '</p>' + (liste ? '<ul class="av4-journal">' + liste + '</ul>' : ''))
    + ((v.hypotheses || []).length ? carte('Hypothèses nées de tes exemples (testées sur d’autres données)', '<ul class="av4-journal">' + v.hypotheses.slice(0, 8).map(h => '<li><b>' + esc(h.titre) + '</b> — ' + (h.resultat ? esc(NIVEAUX_TXT[h.resultat.niveau]) + ' : ' + h.resultat.n + ' trades, ' + R(h.resultat.esperance) : 'à tester') + '</li>').join('') + '</ul>') : '');
}
