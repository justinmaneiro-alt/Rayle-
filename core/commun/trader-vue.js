"use strict";
/* ═════════════ MODE TRADER : RENDU PARTAGÉ PC / TABLETTE / TÉLÉPHONE (V12, phase 5 ; pur, testé : galaxie/tests/trader-vue-test.mjs) ═════════════
   Le même HTML, les mêmes données (vue publiée par le service : /__agent/trader ou paquet mobile), trois présentations (le CSS s'adapte). Script classique : window.TraderVue.
   Règles : jamais de chiffre inventé (« — » ou « indisponible »), le niveau de chaque position est toujours visible (Validée / Candidate / À l'essai), « pas de preuve statistique » sur le niveau
   À l'essai, « pas une promesse » sur tout rendement, rétro-test toujours étiqueté « à titre d'exemple — pas une preuve ». Aucun ordre n'est passé. */
(function (root) {
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fr = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('.', ','));
  const sg = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '−') + fr(Math.abs(x), d));
  const prix = x => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) >= 1000 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(2) : x.toFixed(4)).replace('.', ','));
  const quand = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const age = (t, m = Date.now()) => { if (!t) return '—'; const mn = Math.round((m - t) / 60000); return mn < 2 ? 'à l’instant' : mn < 120 ? 'il y a ' + mn + ' min' : mn < 2880 ? 'il y a ' + Math.round(mn / 60) + ' h' : 'il y a ' + Math.round(mn / 1440) + ' j'; };
  const NIVEAUX = { validee: 'Validée', candidate: 'Candidate', a_lessai: 'À l’essai', desactive: 'Désactivé' };
  const PAS_UNE_PROMESSE = 'Estimation à partir du passé, pas une promesse.';
  const ETIQUETTE_RETRO = 'rétro-test à titre d’exemple — pas une preuve';

  /* Bandeau de statut du service : jamais un message flou. `service` vient de /__agent/trader (statutService) ; absent = on ne sait pas. */
  function serviceHtml(service, v, maintenant) {
    const m = maintenant || Date.now(); let h = '';
    if (service && !service.enMarche) h += '<div class="tv-bande tv-alerte" role="status"><b>' + esc(service.phraseCourte || 'Le service est arrêté.') + '</b> ' + esc(service.commande ? 'Redémarre-le avec : ' + service.commande + ' (une seule étape).' : '') + '</div>';
    if (v && v.donnees) {
      const l = Object.entries(v.donnees).map(([a, d]) => a + ' : bougie de ' + quand(d.derniereBougie) + ' (' + age(d.derniereBougie, m) + ')').join(' · ');
      h += '<div class="tv-bande" data-tv-age>Âge des dernières données : ' + esc(l || 'inconnu') + (v.dernierCycle ? ' · dernier calcul ' + esc(age(v.dernierCycle, m)) : '') + '.</div>';
    }
    return h;
  }
  const badge = p => '<span class="tv-niv" data-niv="' + esc(p.niveau) + '">' + esc(NIVEAUX[p.niveau] || p.niveau) + '</span>';

  /* Une position proposée = une carte. */
  function carte(p, m) {
    const achat = p.sens > 0, risque = Math.abs(p.entree - p.stop), pct = p.entree ? risque / p.entree * 100 : null;
    const statut = '<span class="tv-statut" data-s="' + esc(p.statut) + '">' + esc(p.statutTexte || p.statut) + '</span>';
    const res = p.resultat && p.resultat.statut === 'cloturee' ? '<p class="tv-res" data-gain="' + (p.resultat.R >= 0 ? '1' : '0') + '">Résultat simulé après frais : <b>' + sg(p.resultat.R, 2) + ' R</b></p>' : '';
    return '<article class="tv-carte" data-sens="' + (achat ? 'achat' : 'vente') + '" data-id="' + esc(p.id) + '" data-niveau="' + esc(p.niveau) + '">'
      + '<header><b class="tv-actif">' + esc(p.actif) + '</b> <span class="tv-tf">' + esc(p.tf) + '</span> <span class="tv-sens">' + (achat ? 'ACHAT' : 'VENTE') + ' limite</span> ' + badge(p) + (p.diamant ? ' <span class="tv-diam" title="quatre confluences ou plus">💎</span>' : '') + '</header>'
      + '<p class="tv-nom">' + esc(p.nom) + '</p>'
      + '<table class="tv-niveaux"><tbody><tr><th>Entrée (ordre limite)</th><td>' + prix(p.entree) + '</td><th>Stop</th><td>' + prix(p.stop) + ' <small>(' + fr(pct, 2) + ' %)</small></td></tr>'
      + '<tr><th>Cible 1 <small>' + esc(p.cible1Nom || '') + '</small></th><td>' + prix(p.cible1) + '</td><th>Cible 2 <small>' + esc(p.cible2Nom || '') + '</small></th><td>' + prix(p.cible2) + '</td></tr>'
      + '<tr><th>RR à la cible 1</th><td>' + fr(p.rr, 1) + '</td><th>RR à la cible 2</th><td>' + fr(p.rr2, 1) + '</td></tr></tbody></table>'
      + '<p class="tv-raison"><b>Pourquoi :</b> ' + esc(p.raison) + '</p>'
      + '<p class="tv-conf"><b>Confluences (' + p.nConfluences + ') :</b> ' + esc((p.confluences || []).join(' · ') || 'aucune') + '</p>'
      + '<p class="tv-inval"><b>Ce qui l’invalide :</b> ' + esc(p.invalidation || '—') + '</p>'
      + '<p class="tv-confiance"><b>Confiance honnête :</b> ' + esc(p.confiance) + '</p>'
      + '<footer>' + statut + ' <small>proposée ' + esc(age(p.t, m)) + ' · valable jusqu’à ' + esc(quand(p.tValide)) + '</small> <button type="button" class="tv-btn" data-tv-voir="' + esc(p.id) + '">Voir sur le graphique</button></footer>' + res + '</article>';
  }

  /* Graphique en bougies avec les zones de chaque position (entrée, stop, cibles) : SVG autonome. */
  function svgGraphe(bougies, positions, largeur, hauteur) {
    const W = largeur || 640, H = hauteur || 260, b = (bougies || []).slice(-120); if (b.length < 5) return '<p class="tv-doux">Pas assez de bougies pour dessiner le graphique.</p>';
    let hi = -Infinity, lo = Infinity; for (const x of b) { if (x[2] > hi) hi = x[2]; if (x[3] < lo) lo = x[3]; }
    for (const p of positions || []) for (const v of [p.entree, p.stop, p.cible1, p.cible2]) if (Number.isFinite(v)) { if (v > hi) hi = v; if (v < lo) lo = v; }
    const marge = (hi - lo) * 0.05 || 1; hi += marge; lo -= marge; const dx = (W - 58) / b.length, y = v => 6 + (hi - v) / (hi - lo) * (H - 12);
    let s = '<svg class="tv-graphe" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Graphique M15 avec les positions proposées">';
    (positions || []).forEach(p => {
      const c = p.sens > 0 ? '#27d98a' : '#ff4d5e'; const zone = (a, z, col, op) => '<rect x="0" y="' + y(Math.max(a, z)) + '" width="' + (W - 58) + '" height="' + Math.abs(y(a) - y(z)) + '" fill="' + col + '" opacity="' + op + '"/>';
      s += zone(p.entree, p.stop, '#ff4d5e', 0.1) + zone(p.entree, p.cible1, '#27d98a', 0.1);
      for (const [v, t, col, d] of [[p.entree, 'entrée', '#8fd0e3', ''], [p.stop, 'stop', '#ff4d5e', '4 3'], [p.cible1, 'cible 1', '#27d98a', '4 3'], [p.cible2, 'cible 2', '#27d98a', '2 4']]) s += '<line x1="0" x2="' + (W - 58) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + col + '" stroke-width="1" ' + (d ? 'stroke-dasharray="' + d + '"' : '') + '/><text x="' + (W - 56) + '" y="' + (y(v) + 3) + '" fill="' + col + '" font-size="9">' + t + '</text>';
      void c;
    });
    b.forEach((x, i) => { const up = x[4] >= x[1], col = up ? '#27d98a' : '#ff4d5e', cx = i * dx + dx / 2; s += '<line x1="' + cx + '" x2="' + cx + '" y1="' + y(x[2]) + '" y2="' + y(x[3]) + '" stroke="' + col + '"/><rect x="' + (cx - Math.max(1, dx * 0.35)) + '" y="' + y(Math.max(x[1], x[4])) + '" width="' + Math.max(2, dx * 0.7) + '" height="' + Math.max(1, Math.abs(y(x[1]) - y(x[4]))) + '" fill="' + col + '"/>'; });
    return s + '</svg>';
  }
  /* Courbe de capital simulé en R : seulement les trades terminés, jamais de démo. */
  function svgCourbe(pts, largeur, hauteur) {
    if (!pts || pts.length < 2) return '<p class="tv-doux">Pas encore assez de trades terminés pour tracer une courbe : elle se construit en direct.</p>';
    const W = largeur || 640, H = hauteur || 140, v = pts.map(p => p[1]), hi = Math.max(0, ...v), lo = Math.min(0, ...v), e = hi - lo || 1, y = x => 8 + (hi - x) / e * (H - 16), dx = (W - 10) / (pts.length - 1);
    return '<svg class="tv-courbe" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Capital simulé en R"><line x1="0" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#566770" stroke-dasharray="3 3"/><polyline fill="none" stroke="#8fd0e3" stroke-width="2" points="' + pts.map((p, i) => (5 + i * dx).toFixed(1) + ',' + y(p[1]).toFixed(1)).join(' ') + '"/><text x="6" y="12" fill="#9fb2bb" font-size="10">' + sg(v[v.length - 1], 1) + ' R</text></svg>';
  }
  /* Positions du graphique de l'écran « Agent » : les vraies propositions (en attente ou ouvertes) d'un actif, au format de agent-v3/courbes-v3. */
  function positionsGraphique(v, actif) {
    if (!v || !v.actives) return [];
    return v.actives.filter(p => p.actif === actif).map(p => ({ id: p.id, nom: p.nom + ' · ' + NIVEAUX[p.niveau], sens: p.sens, entree: p.entree, stop: p.stop, cibles: [p.cible1, p.cible2], R: p.rr2, t: p.t, statut: p.statut === 'ouverte' ? 'en cours' : 'en préparation', trader: true, niveau: p.niveau }));
  }
  const entete = v => '<div class="tv-garde" role="note"><b>' + esc(v.bandeau) + '</b></div>';

  function positionsHtml(v, opts) {
    const o = opts || {}, m = o.maintenant || Date.now(); let h = serviceHtml(o.service, v, m);
    if (!v) return h + '<p class="tv-doux">Le mode Trader n’a pas encore calculé de position : il le fait à chaque clôture de bougie M15, service en marche.</p>';
    h += entete(v);
    const act = v.actives || [], niveaux = ['validee', 'candidate', 'a_lessai'];
    const filtre = '<p class="tv-doux">Affichage : <b>' + esc(NIVEAUX[v.reglages.niveauMin] || 'tout') + (v.reglages.niveauMin === 'a_lessai' ? ' et au-dessus (tout)' : ' et au-dessus') + '</b> · style <b>' + esc(v.style.nom) + '</b> (au moins ' + v.style.confluenceMin + ' confluence(s), RR ≥ ' + fr(v.style.rrMin, 1) + ', ' + v.style.maxParJour + ' propositions par actif et par jour au plus) · ' + niveaux.map(n => NIVEAUX[n] + ' : ' + act.filter(p => p.niveau === n).length).join(' · ') + '.</p>';
    h += filtre;
    if (act.length) {
      const actifs = Object.keys(v.bougies || {});
      h += actifs.map(a => { const ps = act.filter(p => p.actif === a); return ps.length ? '<section class="tv-bloc"><h4>' + esc(a) + ' · M15</h4>' + svgGraphe(v.bougies[a], ps, o.largeur, o.hauteur) + '</section>' : ''; }).join('');
      h += '<div class="tv-liste">' + act.map(p => carte(p, m)).join('') + '</div>';
    } else h += '<section class="tv-bloc"><h4>Aucune position à suivre en ce moment</h4>' + pourquoiCourt(v) + '</section>';
    const rec = (v.recentes || []).filter(p => p.statut !== 'en_attente' && p.statut !== 'ouverte').slice(0, 8);
    if (rec.length) h += '<section class="tv-bloc"><h4>Dernières positions terminées</h4><ul class="tv-l">' + rec.map(p => '<li><b>' + esc(p.actif) + ' ' + esc(p.tf) + '</b> ' + (p.sens > 0 ? 'achat' : 'vente') + ' · ' + esc(p.nom) + ' · ' + badge(p) + ' · ' + esc(p.statutTexte) + (p.resultat && p.resultat.statut === 'cloturee' ? ' · <b>' + sg(p.resultat.R, 2) + ' R</b>' : '') + '</li>').join('') + '</ul></section>';
    return h + '<p class="tv-doux">' + esc(v.avertissement) + '</p>';
  }
  function pourquoiCourt(v) {
    const l = (v.pourquoi || []).slice(0, 5), an = Object.entries(v.analyses || {}).map(([a, x]) => a + ' : biais ' + (x.biais > 0 ? 'haussier' : x.biais < 0 ? 'baissier' : 'neutre') + ', régime ' + x.regime).join(' · ');
    return '<p class="tv-doux">Lecture du moment : ' + esc(an || 'pas encore d’analyse') + '.</p>' + (l.length ? '<ul class="tv-l">' + l.map(x => '<li>' + esc(x.actif) + ' · ' + esc(x.setup) + ' ' + (x.sens > 0 ? 'achat' : 'vente') + ' : ' + esc(x.pourquoi) + '</li>').join('') + '</ul>' : '<p class="tv-doux">Aucun déclencheur n’a presque abouti : les conditions des quatre setups ne sont pas réunies.</p>');
  }

  function bilanHtml(v, opts) {
    const o = opts || {}; let h = serviceHtml(o.service, v, o.maintenant); if (!v) return h + '<p class="tv-doux">Pas encore de bilan : le mode Trader n’a rien suivi pour l’instant.</p>';
    const b = v.bilan, s = b.tous.stats;
    h += entete(v) + '<section class="tv-bloc"><h4>Bilan en direct (simulation, frais et glissement inclus)</h4><p class="tv-gros">' + esc(b.phrase) + '</p>' + svgCourbe(v.courbe, o.largeur, 140)
      + '<table class="tv-tab"><tbody><tr><th>Propositions</th><td>' + b.tous.propositions + '</td><th>Entrées exécutées</th><td>' + b.tous.executees + '</td></tr><tr><th>Taux de réussite</th><td>' + (s.taux == null ? '—' : Math.round(s.taux * 100) + ' %') + '</td><th>RR réalisé</th><td>' + fr(s.rrRealise, 1) + '</td></tr>'
      + '<tr><th>Espérance</th><td>' + (s.esperance == null ? '—' : sg(s.esperance, 2) + ' R par trade') + '</td><th>Intervalle à 95 %</th><td>' + (s.ic ? fr(s.ic[0], 2) + ' à ' + fr(s.ic[1], 2) : '—') + '</td></tr>'
      + '<tr><th>Résultat</th><td>' + (s.n ? sg(b.totalPct, 1) + ' % <small>(à ' + fr(b.risquePct, 1) + ' % de risque par trade)</small>' : '—') + '</td><th>Pire creux</th><td>' + (s.n ? fr(s.drawdown, 1) + ' R' : '—') + '</td></tr></tbody></table></section>';
    h += '<section class="tv-bloc"><h4>Objectif hebdomadaire (+1 % / +2 %) comparé au simulé réel</h4><p>' + esc(v.objectifHebdo.phrase) + '</p></section>';
    const ligne = x => '<tr><td>' + esc(x.cle) + '</td><td>' + x.propositions + '</td><td>' + x.executees + '</td><td>' + (x.stats.taux == null ? '—' : Math.round(x.stats.taux * 100) + ' %') + '</td><td>' + (x.stats.esperance == null ? '—' : sg(x.stats.esperance, 2)) + '</td><td>' + (x.stats.ic ? fr(x.stats.ic[0], 2) + ' ; ' + fr(x.stats.ic[1], 2) : '—') + '</td><td class="tv-hon">' + esc(x.stats.honnete) + '</td></tr>';
    const nom = c => c.split('|').map((t, i) => (i === 0 && v.setups[t] ? v.setups[t] : t)).join(' · ');
    const tab = (titre, l, f) => l.length ? '<section class="tv-bloc"><h4>' + titre + '</h4><div class="tv-defil"><table class="tv-tab"><thead><tr><th>Type</th><th>Prop.</th><th>Exéc.</th><th>Réussite</th><th>Espér. R</th><th>IC 95 %</th><th>Lecture honnête</th></tr></thead><tbody>' + l.map(x => ligne({ ...x, cle: f(x.cle) })).join('') + '</tbody></table></div></section>' : '';
    h += tab('Par type de setup (setup · actif · unité de temps)', b.parType, nom) + tab('Par setup', b.parSetup, c => v.setups[c] || c);
    if (b.parActif) h += tab('Par actif', b.parActif, c => c) + tab('Par unité de temps', b.parTf, c => c) + tab('Par style', b.parStyle, c => (v.styles[c] ? v.styles[c].nom : c));
    h += typesHtml(v);
    if (v.retro && Object.keys(v.retro).length) {
      h += '<section class="tv-bloc tv-retro"><h4>Rétro-test sur les 12 derniers mois — ' + ETIQUETTE_RETRO + '</h4><p class="tv-doux">Le moteur rejoué sans être modifié (règles fixées à l’avance). Il ne promeut jamais un type : seuls les trades suivis en avant comptent.</p><ul class="tv-l">'
        + Object.entries(v.retro).map(([a, r]) => '<li><b>' + esc(a) + '</b> : ' + r.n + ' propositions, ' + r.stats.n + ' trades terminés, faux signaux (perdants) ' + (r.faux == null ? '—' : Math.round(r.faux * 100) + ' %') + ', espérance ' + (r.stats.esperance == null ? '—' : sg(r.stats.esperance, 2) + ' R [' + fr(r.stats.ic && r.stats.ic[0], 2) + ' ; ' + fr(r.stats.ic && r.stats.ic[1], 2) + ']') + (r.hasard && r.hasard.assez ? ' · entrées au hasard de même fréquence : ' + sg(r.hasard.esperance, 2) + ' R' : '') + '</li>').join('') + '</ul></section>';
    }
    if (v.gestion) h += '<section class="tv-bloc tv-retro"><h4>Comparaison de gestion des sorties — ' + esc(v.gestion.etiquette) + '</h4><p>' + esc(v.gestion.phrase) + '</p><ul class="tv-l">' + v.gestion.lignes.map(l => '<li>' + esc(l.texte) + ' : étude ' + sg(l.etude, 2) + ' R (' + l.nEtude + ') · période jamais vue ' + sg(l.inconnue, 2) + ' R (' + l.nInconnue + ')</li>').join('') + '</ul></section>';
    return h + '<p class="tv-doux">' + esc(PAS_UNE_PROMESSE) + ' ' + esc(v.avertissement) + '</p>';
  }
  function typesHtml(v) {
    if (!v.types || !v.types.length) return '<section class="tv-bloc"><h4>Niveaux des types de setup</h4><p class="tv-doux">Aucun type n’a encore de trade terminé suivi en direct : tous sont « À l’essai ».</p></section>';
    return '<section class="tv-bloc"><h4>Niveaux des types de setup (promotion et désactivation automatiques)</h4><ul class="tv-l">' + v.types.map(t => '<li data-niv="' + esc(t.niveau) + '"><b>' + esc(t.nom) + '</b> ' + '<span class="tv-niv" data-niv="' + esc(t.niveau) + '">' + esc(t.niveauTexte) + '</span> · ' + t.n + ' trade(s) en direct' + (t.esperance == null ? '' : ' · ' + sg(t.esperance, 2) + ' R') + '<small>' + esc(t.raison || '') + (t.baisse ? ' ' + esc(t.baisse) : '') + '</small>' + (t.niveau === 'desactive' ? ' <button type="button" class="tv-btn" data-tv-reactiver="' + esc(t.cle) + '">Réactiver</button>' : '') + '</li>').join('') + '</ul>' + (v.fantomes ? '<p class="tv-doux">' + v.fantomes + ' proposition(s) « fantôme » suivies en silence pour les types désactivés (ni affichées ni alertées).</p>' : '') + '</section>';
  }
  function pourquoiHtml(v, opts) {
    const o = opts || {}; let h = serviceHtml(o.service, v, o.maintenant); if (!v) return h + '<p class="tv-doux">Pas encore de lecture du marché.</p>';
    return h + '<section class="tv-bloc"><h4>Pourquoi pas plus de positions ?</h4><p>Le mode Trader propose dès que les conditions de ses quatre setups sont réunies, avec au plus ' + v.style.maxParJour + ' propositions par actif et par jour. Voici ce qui a presque abouti ou ce qui a été refusé :</p>' + pourquoiCourt(v) + '</section>';
  }
  function reglagesHtml(v) {
    if (!v) return '<p class="tv-doux">Les réglages apparaissent dès que le service a démarré.</p>';
    const r = v.reglages;
    return '<section class="tv-bloc"><h4>Réglages du mode Trader</h4>'
      + '<label class="tv-champ">Style <select data-tv-reg="style">' + Object.entries(v.styles).map(([k, s]) => '<option value="' + k + '"' + (r.style === k ? ' selected' : '') + '>' + esc(s.nom) + ' — ' + s.confluenceMin + ' confluence(s), RR ≥ ' + fr(s.rrMin, 1) + ', ' + s.maxParJour + '/jour</option>').join('') + '</select></label>'
      + '<label class="tv-champ">N’afficher que <select data-tv-reg="niveauMin"><option value="a_lessai"' + (r.niveauMin === 'a_lessai' ? ' selected' : '') + '>tout (À l’essai, Candidate, Validée)</option><option value="candidate"' + (r.niveauMin === 'candidate' ? ' selected' : '') + '>Candidate et Validée</option><option value="validee"' + (r.niveauMin === 'validee' ? ' selected' : '') + '>Validée seulement</option></select></label>'
      + '<label class="tv-case"><input type="checkbox" data-tv-reg="alertesObservation"' + (r.alertesObservation ? ' checked' : '') + '> alertes Telegram « Observation (non validé) » pour les niveaux Candidate et À l’essai (désactivées par défaut)</label>'
      + '<label class="tv-case"><input type="checkbox" data-tv-reg="afficherDemo"' + (r.afficherDemo ? ' checked' : '') + '> afficher aussi les positions de démonstration (DÉMO) sur le graphique</label>'
      + '<p class="tv-doux">Les critères des niveaux Candidate et Validée ne se règlent pas ici et ne changent jamais pour « sauver » un type. Les alertes d’entrée « officielles » ne partent que pour le niveau Validée.</p></section>' + typesHtml(v);
  }
  root.TraderVue = { esc, fr, sg, prix, carte, svgGraphe, svgCourbe, positionsGraphique, positionsHtml, bilanHtml, pourquoiHtml, reglagesHtml, typesHtml, serviceHtml, pourquoiCourt, NIVEAUX, ETIQUETTE_RETRO, PAS_UNE_PROMESSE };
})(typeof window !== 'undefined' ? window : globalThis);
