"use strict";
/* ═════════════ FENÊTRE AGENT LISIBLE (V13) : CALCULS ET TEXTES PURS (testés : galaxie/tests/agent-lisible-test.mjs) ═════════════
   Une seule vue principale pour PC, tablette et téléphone. Elle ne montre QUE ce que le mode Trader (vue publiée par le service Kepler) calcule vraiment : positions en attente / en cours / terminées,
   bilan simulé après frais, courbe de cumul en R. Aucune valeur inventée, aucun exemple : sans donnée, un état vide honnête. Script classique : window.AgentLisible (le DOM est dans agent-lisible.js). */
(function (root) {
  const PAS = 900e3, MAX_ZONES = 3, SEUIL_ECHANTILLON = 20;
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fin = x => typeof x === 'number' && Number.isFinite(x);
  const fr = (x, d = 2) => (!fin(x) ? '—' : (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('.', ','));
  const sg = (x, d = 1) => (!fin(x) ? '—' : (x >= 0 ? '+' : '−') + fr(Math.abs(x), d));
  const prix = x => (!fin(x) ? '—' : (Math.abs(x) >= 1000 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(2) : x.toFixed(4)).replace('.', ','));
  const heure = t => (t ? new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) : '—');
  const jour = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const duree = ms => { if (!(ms >= 0)) return 'un moment'; const m = Math.round(ms / 60000); if (m < 2) return 'moins de 2 min'; if (m < 120) return m + ' min'; const h = Math.round(m / 60); return h < 48 ? h + ' h' : Math.round(h / 24) + ' j'; };
  const ACTIFS = ['BTC', 'SOL', 'DOGE'];
  const NIVEAUX = { validee: 'Validée', candidate: 'Candidate', a_lessai: 'À l’essai', desactive: 'Désactivé' };
  const COULEURS = { gain: '#27d98a', perte: '#ff4d5e', attente: '#7fc8ff', texte: '#e8f2f5' };   // un seul code couleur : vert = gain / achat favorable, rouge = perte / stop, bleu clair = zone d'entrée en attente
  const enAttente = p => p.statut === 'en_attente', enCours = p => p.statut === 'ouverte', termine = p => p.statut === 'cloturee' && p.resultat && fin(p.resultat.R);
  const reelle = p => !p.fantome && !p.demo;

  /* Quatre chiffres : trades terminés, taux de réussite, R moyen après frais, cumul en R. Vue vide = « pas encore de trade terminé ». */
  function quatreChiffres(vue) {
    const s = vue && vue.bilan && vue.bilan.tous && vue.bilan.tous.stats, n = s && fin(s.n) ? s.n : 0;
    if (!n) return { n: 0, taux: null, rMoyen: null, cumul: null, petit: true, vide: true, note: 'Pas encore de trade terminé' };
    return { n, taux: fin(s.taux) ? s.taux : null, rMoyen: fin(s.esperance) ? s.esperance : null, cumul: fin(s.total) ? s.total : null, petit: n < SEUIL_ECHANTILLON, vide: false, note: n < SEUIL_ECHANTILLON ? 'échantillon trop petit pour juger' : '' };
  }

  /* Positions en attente ou en cours d'un actif, les plus proches du prix d'abord. `visibles` : au plus 3 sur le graphique ; `autres` : le reste (dans la liste seulement). */
  function positionsActif(vue, actif) { return ((vue && vue.actives) || []).filter(p => p.actif === actif && (enAttente(p) || enCours(p)) && reelle(p) && fin(p.entree) && fin(p.stop)); }
  function positionsVisibles(vue, actif, prixActuel, max = MAX_ZONES) {
    const l = positionsActif(vue, actif), ref = fin(prixActuel) ? prixActuel : null;
    const tri = l.slice().sort((a, b) => (ref == null ? 0 : Math.abs(a.entree - ref) - Math.abs(b.entree - ref)) || (enCours(b) - enCours(a)) || b.t - a.t);
    return { visibles: tri.slice(0, max), autres: tri.slice(max) };
  }
  /* Les trois groupes de la liste, pour un actif. */
  function groupes(vue, actif) {
    const act = positionsActif(vue, actif), tri = (a, b) => a.t - b.t;
    const term = ((vue && vue.recentes) || []).filter(p => p.actif === actif && termine(p) && reelle(p)).sort((a, b) => (b.tSortie || b.t) - (a.tSortie || a.t));
    return { attente: act.filter(enAttente).sort(tri), cours: act.filter(enCours).sort(tri), terminees: term };
  }
  /* Nombre de positions à surveiller par actif (pastilles des trois boutons). */
  function comptes(vue) { const o = {}; for (const a of ACTIFS) o[a] = positionsActif(vue, a).length; return o; }

  const ratio = p => { const r = fin(p.rr) ? p.rr : null; return r == null ? '' : '1:' + (Math.abs(r - Math.round(r)) < 0.05 ? String(Math.round(r)) : r.toFixed(1).replace('.', ',')); };
  /* « ACHAT en attente · 1:3 » */
  const etiquette = p => (p.sens > 0 ? 'ACHAT' : 'VENTE') + (enCours(p) ? ' en cours' : ' en attente') + (ratio(p) ? ' · ' + ratio(p) : '');

  /* Étiquettes qui ne se chevauchent pas : deux niveaux plus proches que `ecartMin` pixels deviennent UNE étiquette (textes joints, position moyenne). Entrée : [{ y, texte, couleur }]. */
  function fusionnerEtiquettes(items, ecartMin = 18) {
    const l = items.filter(i => fin(i.y)).slice().sort((a, b) => a.y - b.y), out = [];
    for (const i of l) {
      const d = out[out.length - 1];
      if (d && i.y - d.yMax < ecartMin) { d.textes.push(i.texte); d.somme += i.y; d.n++; d.yMax = i.y; d.y = d.somme / d.n; if (i.couleur && !d.couleur) d.couleur = i.couleur; }
      else out.push({ y: i.y, yMax: i.y, somme: i.y, n: 1, textes: [i.texte], couleur: i.couleur });
    }
    return out.map(d => ({ y: d.y, texte: d.textes.join(' / '), couleur: d.couleur, fusion: d.n > 1 }));
  }

  /* Marqueurs des positions terminées (✔ vert +R / ✖ rouge −R), sur l'heure de la bougie M15 de sortie. */
  function marqueursTermines(vue, actif) {
    const parTemps = new Map();   // deux sorties dans la même bougie : un seul marqueur (la dernière)
    for (const p of ((vue && vue.recentes) || []).filter(p => p.actif === actif && termine(p) && reelle(p) && fin(p.tSortie)).sort((a, b) => a.tSortie - b.tSortie)) {
      const gain = p.resultat.R >= 0, time = Math.floor(p.tSortie / PAS) * PAS / 1000;
      parTemps.set(time, { time, gain, R: p.resultat.R, texte: (gain ? '✔ ' : '✖ ') + sg(p.resultat.R, 1) + ' R', id: p.id });
    }
    return [...parTemps.values()].sort((a, b) => a.time - b.time);
  }

  /* Courbe de cumul en R alignée sur les bougies : UNE valeur par bougie (0 avant le premier trade terminé, puis le cumul au moment de la sortie), pour que la mini-courbe partage exactement l'axe de temps
     du graphique. Pas de trade terminé : la courbe est vide côté affichage. */
  function courbeAlignee(vue, bougies) {
    const c = ((vue && vue.courbe) || []).filter(p => Array.isArray(p) && fin(p[0]) && fin(p[1])).sort((a, b) => a[0] - b[0]); let i = 0, v = 0;
    return (bougies || []).map(b => { while (i < c.length && Math.floor(c[i][0] / 1000) < b.time + PAS / 1000) { v = c[i][1]; i++; } return { time: b.time, value: v }; });
  }

  /* Prix de référence : la dernière clôture connue (bougies passées en argument, sinon celles de la vue). */
  function prixActuel(vue, actif, bougies) {
    const b = bougies && bougies.length ? bougies[bougies.length - 1] : null; if (b && fin(b.close)) return b.close;
    const v = vue && vue.bougies && vue.bougies[actif]; const d = v && v.length ? v[v.length - 1] : null; return d && fin(d[4]) ? d[4] : null;
  }
  function bougiesDeLaVue(vue, actif) { const v = vue && vue.bougies && vue.bougies[actif]; return Array.isArray(v) ? v.map(x => ({ time: Math.floor(x[0] / 1000), open: x[1], high: x[2], low: x[3], close: x[4] })) : []; }

  /* ── textes (HTML) ── */
  /* Barre d'état, une ligne : service, dernière bougie, trois gros boutons d'actif, « simulation, aucun ordre réel ». */
  function htmlBarreEtat({ service, vue, actif, comptes: cp, maintenant = Date.now(), origine = null, recuLe = null }) {
    let svc;
    if (service && service.enMarche === true) svc = '<span class="al-svc" data-etat="marche"><i></i>Service en marche</span>';
    else if (service && service.enMarche === false) svc = '<span class="al-svc" data-etat="arret"><i></i>Service arrêté' + (service.arretDepuis != null ? ' depuis ' + esc(duree(service.arretDepuis)) : '') + '</span>';
    else svc = '<span class="al-svc" data-etat="inconnu"><i></i>Service : état inconnu</span>';
    const d = vue && vue.donnees && vue.donnees[actif], derniere = d && d.derniereBougie ? 'Dernière bougie ' + heure(d.derniereBougie) : 'Dernière bougie : indisponible';
    const copie = origine === 'Worker' ? ' <span class="al-copie">copie du serveur' + (recuLe ? ' de ' + esc(heure(recuLe)) : '') + '</span>' : '';
    return '<div class="al-barre" role="group" aria-label="État de l’agent">' + svc + '<span class="al-bougie">' + esc(derniere) + '</span>' + copie
      + '<span class="al-actifs" role="tablist" aria-label="Actif">' + ACTIFS.map(a => '<button type="button" role="tab" class="al-actif" data-al-actif="' + a + '" aria-selected="' + (a === actif ? 'true' : 'false') + '">' + a + (cp && cp[a] ? '<b class="al-n">' + cp[a] + '</b>' : '') + '</button>').join('') + '</span>'
      + '<span class="al-sim">simulation, aucun ordre réel</span></div>';
  }
  /* Quatre chiffres sur une rangée ; « échantillon trop petit pour juger » en petit si moins de 20 trades. */
  function htmlChiffres(c) {
    if (!c || c.vide) return '<div class="al-chiffres" data-vide="1"><span class="al-vide-c">Pas encore de trade terminé</span></div>';
    const case_ = (nom, val, cls) => '<div class="al-chiffre"><b class="' + (cls || '') + '">' + val + '</b><span>' + nom + '</span></div>';
    const sgn = x => (!fin(x) ? '' : x >= 0 ? 'al-gain' : 'al-perte');
    return '<div class="al-chiffres">' + case_('trades terminés', String(c.n)) + case_('réussite', c.taux == null ? '—' : Math.round(c.taux * 100) + ' %') + case_('R moyen / trade', c.rMoyen == null ? '—' : sg(c.rMoyen, 2), sgn(c.rMoyen)) + case_('cumul', c.cumul == null ? '—' : sg(c.cumul, 1) + ' R', sgn(c.cumul))
      + (c.petit ? '<small class="al-petit">' + esc(c.note) + '</small>' : '') + '</div>';
  }
  /* État vide propre : jamais de fausse position. */
  function htmlVide(vue, actif, maintenant = Date.now()) {
    const t = vue && vue.dernierCycle ? ' Dernière analyse : ' + esc(heure(vue.dernierCycle)) + '.' : ' Aucune analyse reçue pour l’instant.';
    return '<p class="al-vide">Aucune position en attente. Kepler surveille BTC / SOL / DOGE.' + t + '</p>';
  }
  /* Explication ouverte au clic sur une ligne. */
  function htmlExplication(p) {
    const lignes = [];
    if (p.nom) lignes.push('<p><b>Type</b> ' + esc(p.nom) + (p.niveau ? ' · niveau ' + esc(NIVEAUX[p.niveau] || p.niveau) : '') + '</p>');
    if (p.raison) lignes.push('<p><b>Pourquoi</b> ' + esc(p.raison) + '</p>');
    if (p.confluences && p.confluences.length) lignes.push('<p><b>Confluences</b> ' + esc(p.confluences.join(' · ')) + '</p>');
    if (fin(p.cible2)) lignes.push('<p><b>Objectif 2</b> ' + prix(p.cible2) + (fin(p.rr2) ? ' (1:' + fr(p.rr2, 1) + ')' : '') + '</p>');
    if (p.invalidation) lignes.push('<p><b>Ce qui l’invalide</b> ' + esc(p.invalidation) + '</p>');
    if (p.confiance) lignes.push('<p><b>Confiance honnête</b> ' + esc(p.confiance) + '</p>');
    if (p.resultat && p.resultat.motif) lignes.push('<p><b>Sortie</b> ' + esc(p.resultat.motif) + '</p>');
    return lignes.join('') || '<p>Pas de détail enregistré pour cette position.</p>';
  }
  /* Une ligne par position, sans phrase d'explication (elle s'ouvre au clic). */
  function htmlLigne(p, genre) {
    const sens = p.sens > 0 ? 'ACHAT' : 'VENTE', id = esc(p.id);
    if (genre === 'terminee') {
      const R = p.resultat.R, g = R >= 0;
      return '<li class="al-ligne" data-id="' + id + '" data-genre="terminee" data-gain="' + (g ? '1' : '0') + '"><button type="button" class="al-ligne-b" data-al-ligne="' + id + '" aria-expanded="false"><span class="al-sens">' + sens + '</span><span class="al-res ' + (g ? 'al-gain' : 'al-perte') + '">' + (g ? '✔ ' : '✖ ') + sg(R, 1) + ' R</span><span class="al-date">' + esc(jour(p.tSortie || p.t)) + '</span></button><div class="al-expl" hidden>' + htmlExplication(p) + '</div></li>';
    }
    return '<li class="al-ligne" data-id="' + id + '" data-genre="' + genre + '" data-sens="' + (p.sens > 0 ? 'achat' : 'vente') + '"><button type="button" class="al-ligne-b" data-al-ligne="' + id + '" aria-expanded="false"><span class="al-sens">' + sens + '</span><span class="al-act">' + esc(p.actif) + '</span>'
      + '<span class="al-niv"><small>entrée</small>' + prix(p.entree) + '</span><span class="al-niv al-stop"><small>stop</small>' + prix(p.stop) + '</span><span class="al-niv al-obj"><small>objectif</small>' + prix(p.cible1) + '</span><span class="al-rr">' + esc(ratio(p)) + '</span>'
      + '<span class="al-val">valable jusqu’à ' + esc(heure(p.tValide)) + '</span></button><button type="button" class="al-voir" data-al-voir="' + id + '">Voir sur le graphique</button><div class="al-expl" hidden>' + htmlExplication(p) + '</div></li>';
  }
  /* Les trois groupes repliables : En attente (ouvert), En cours, Terminées (replié). */
  function htmlListes(g, ouverts = {}) {
    const ouvert = (k, defaut) => (ouverts[k] == null ? defaut : ouverts[k]);
    const bloc = (cle, titre, liste, genre, defaut) => '<details class="al-groupe" data-groupe="' + cle + '"' + (ouvert(cle, defaut) ? ' open' : '') + '><summary>' + titre + ' <b class="al-n">' + liste.length + '</b></summary>'
      + (liste.length ? '<ul class="al-liste">' + liste.map(p => htmlLigne(p, genre)).join('') + '</ul>' : '<p class="al-rien">Aucune.</p>') + '</details>';
    return bloc('attente', 'En attente', g.attente, 'attente', true) + bloc('cours', 'En cours', g.cours, 'cours', true) + bloc('terminees', 'Terminées', g.terminees.slice(0, 30), 'terminee', false);
  }
  /* Ce que contient le bouton « Détails » (rien n'est supprimé : tout est rangé là). Sert au test « rien de perdu ». */
  const DETAILS = Object.freeze([
    { id: 'agent', nom: 'Rapport et stratégies' }, { id: 'details', nom: 'Poste de pilotage' }, { id: 'positions', nom: 'Positions du jour' }, { id: 'bilan', nom: 'Bilan complet' },
    { id: 'pourquoi', nom: 'Pourquoi pas plus' }, { id: 'liquidite', nom: 'Liquidité' }, { id: 'equipe', nom: 'Équipe' }, { id: 'occasions', nom: 'Occasions manquées' }, { id: 'donnees', nom: 'Sources de données' }
  ]);

  const api = { PAS, MAX_ZONES, SEUIL_ECHANTILLON, ACTIFS, COULEURS, DETAILS, NIVEAUX, esc, fr, sg, prix, heure, jour, duree, quatreChiffres, positionsActif, positionsVisibles, groupes, comptes, ratio, etiquette, fusionnerEtiquettes,
    marqueursTermines, courbeAlignee, prixActuel, bougiesDeLaVue, htmlBarreEtat, htmlChiffres, htmlVide, htmlExplication, htmlLigne, htmlListes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AgentLisibleCalcul = api;
})(typeof window !== 'undefined' ? window : globalThis);
