import { activerAgent, activerDeriv, demanderNotifications, obtenirAgent, surChangement } from './session-agent.js';
import { AIDE_MESURES } from '../agent-btc/micro-explications.js';
import { age, heureParis } from './serie.js';

/* ═════════════ PANNEAU « AGENT BTC » (onglet du bas de l'espace de travail, en grand) ═════════════
   Phase du marché, direction du volume, setup en cours, prochaine zone importante, état de la stratégie, alertes, journal d'expériences, et deux tableaux de performance SÉPARÉS et étiquetés
   (backtest hors échantillon / jeu final ; compte simulé en direct). Chaque donnée affiche sa source et son heure ; une donnée absente est dite absente. Aucune IA, aucun ordre. */
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sg = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + nb(v, d));
const pc = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : nb(v * 100, d) + ' %');
const px = v => (v == null ? '—' : nb(v, 0));
const sensTxt = s => (s > 0 ? 'ACHAT' : 'VENTE');
const ETIQUETTES = { jamais: ['PAS DE RECHERCHE', 'neutre'], en_recherche: ['EN RECHERCHE', 'info'], validee: ['VALIDÉE', 'ok'], rejetee: ['REJETÉE', 'ko'], aucune: ['AUCUNE STRATÉGIE ROBUSTE TROUVÉE', 'ko'], attente_jeu_final: ['EN ATTENTE DU JEU FINAL', 'info'], interrompue: ['RECHERCHE INTERROMPUE', 'neutre'], refus_historique: ['HISTORIQUE TROP COURT', 'neutre'] };
const DECISIONS = { garder: 'GARDER', ajuster: 'AJUSTER', supprimer: 'SUPPRIMER', recommencer: 'RECOMMENCER' };

export function creerPanneauAgent({ client } = {}) {
  const racine = document.createElement('div'); racine.className = 'tg-agent';
  racine.innerHTML = '<div class="ag-haut" data-s="haut"></div><div class="ag-grille"><section class="ag-c" data-s="marche"></section><section class="ag-c" data-s="setup"></section><section class="ag-c ag-micro" data-s="micro"></section><section class="ag-c" data-s="strategie"></section><section class="ag-c ag-large" data-s="perf"></section><section class="ag-c" data-s="alertes"></section><section class="ag-c" data-s="journal"></section></div><div class="ag-bas" data-s="controles"></div><p class="ag-avert">Ni conseil financier, ni ordre : l’agent explique et alerte, il n’exécute rien et n’a aucune clé de courtier. Les résultats passés ne garantissent rien. Il ne calcule que lorsque Rayle est ouvert.</p>';
  const zones = {}; for (const z of racine.querySelectorAll('[data-s]')) zones[z.dataset.s] = z;
  let agent = null, dernier = {}, planifie = null, detruit = false, desabonner = null;
  const ecrire = (nom, html) => { if (dernier[nom] !== html) { dernier[nom] = html; zones[nom].innerHTML = html; } };
  const ligne = (k, v, cls) => '<div class="ag-l"><span>' + k + '</span><b class="' + (cls || '') + '">' + v + '</b></div>';

  function rendre() {
    planifie = null; if (detruit || !agent) return;
    const s = agent.instantane(), d = s.donnees, L = s.lecture, [etiq, cls] = ETIQUETTES[s.etatStrategie] || [s.etatStrategie, 'neutre'];
    // ── en-tête : état de la stratégie et des données ──
    const prog = d.progres, r = s.recherche;
    let donnees;
    if (prog && prog.phase === 'erreur') donnees = '<span class="ag-alerte">INDISPONIBLE : ' + esc(prog.message) + '</span>';
    else if (prog) donnees = 'Téléchargement de l’historique… ' + nb(prog.bougies) + ' bougies' + (prog.fin ? ' (jusqu’au ' + new Date(prog.fin).toISOString().slice(0, 10) + ')' : '') + (prog.source ? ' · ' + esc(prog.source) : '') + '<progress></progress>';
    else if (!d.n) donnees = 'Aucun historique : <button type="button" class="tg-btn" data-a="activer">Activer l’agent et télécharger l’historique (≈ 1 minute, 140 000 bougies)</button>';
    else donnees = '<b>' + (d.source === 'binance' ? 'Binance BTC/USDT' : d.source === 'bitstamp' ? 'Bitstamp BTC/USD' : esc(d.source || '?')) + '</b>' + (d.secours ? ' <em class="ag-alerte">SECOURS</em>' : '') + ' · ' + nb(d.n) + ' bougies M15 (' + nb(d.annees, 1) + ' ans) · dernière bougie fermée ' + heureParis(d.fin - 900e3) + ' · delta <b>' + (d.deltaReelPct > 0.99 ? 'RÉEL' : d.deltaReelPct > 0 ? 'MIXTE' : 'ESTIMÉ') + '</b> · mis à jour ' + age(Date.now() - (d.majLe || Date.now())) + (d.lacunes ? ' · ' + d.lacunes + ' trou(s)' : '') + (d.erreur ? ' · <span class="ag-alerte">dernière mise à jour : ' + esc(d.erreur) + '</span>' : '') + (d.prix ? ' · prix ' + px(d.prix) + ' $' : '');
    ecrire('haut', '<div class="ag-etat ' + cls + '"><b>Stratégie : ' + etiq + '</b>' + (r.enCours ? ' <span>' + esc(r.famille || '') + ' · ' + nb(r.fait) + '/' + nb(r.total) + ' · ' + nb(r.N) + ' variantes testées</span>' : s.verdict ? ' <span>' + esc(s.verdict.resume) + '</span>' : '') + (!r.enCours && s.derniereRecherche && s.verdict && s.derniereRecherche.finiLe !== s.verdict.finiLe ? ' <span>Dernière recherche (' + heureParis(s.derniereRecherche.finiLe) + ') : ' + esc(s.derniereRecherche.resume) + ' La stratégie validée est conservée.</span>' : '') + '</div><div class="ag-src">' + donnees + '</div>');
    // ── marché ──
    if (!L || !L.ok) ecrire('marche', '<h4>Marché maintenant</h4><p class="ag-vide">' + (d.n ? esc((L && L.raison) || 'Lecture indisponible.') : 'En attente de l’historique.') + '</p>');
    else {
      const z = L.zones, ph = L.phase, f1 = x => (x == null ? '—' : x);
      ecrire('marche', '<h4>Marché maintenant <small>M15 · contexte H1 / H4</small></h4>'
        + ligne('Phase H1', esc(ph.phase) + (ph.enChangement ? ' <small>(signal brut : ' + esc(ph.brute) + ', à confirmer)</small>' : ''), ph.code === 1 ? 'hausse' : ph.code === 2 ? 'baisse' : '')
        + ligne('Phase H4', esc(L.phaseH4.phase), L.phaseH4.code === 1 ? 'hausse' : L.phaseH4.code === 2 ? 'baisse' : '')
        + '<details><summary>Pourquoi cette phase ?</summary><p>' + esc(ph.intro) + '</p><ul>' + ph.raisons.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>'
        + ligne('Volume 4 h', nb(L.volume.v4h, 0) + ' BTC <small>(' + (L.volume.relatif4h == null ? '—' : nb(L.volume.relatif4h, 2) + ' × la normale') + ')</small>')
        + ligne('Direction du volume', esc(L.direction.lecture), L.direction.delta24h > 0 ? 'hausse' : L.direction.delta24h < 0 ? 'baisse' : '')
        + ligne('Delta 4 h / 24 h ' + (L.direction.estime ? '<em class="ag-alerte">ESTIMÉ</em>' : '<em class="ag-ok">RÉEL</em>'), sg(L.direction.delta4h, 0) + ' / ' + sg(L.direction.delta24h, 0) + ' BTC')
        + (L.direction.divergence ? ligne('Divergence', esc(L.direction.divergence), 'alerte') : '')
        + ligne('Volatilité', esc(L.volatilite.note) + ' <small>(ATR H1 ' + px(L.volatilite.atrH1) + ' $, percentile ' + pc(L.volatilite.percentile) + ')</small>')
        + ligne('MA200 H1 / H4', px(L.ma200.h1) + ' / ' + px(L.ma200.h4) + ' <small>(pente H4 ' + sg(L.ma200.penteH4Pct, 1) + ' % sur 5 j)</small>')
        + ligne('Structure H1 / H4', esc(L.structure.h1) + ' / ' + esc(L.structure.h4))
        + (L.profil ? ligne('Profil 7 j : POC', px(L.profil.poc) + ' <small>zone de valeur ' + px(L.profil.val) + ' – ' + px(L.profil.vah) + '</small>') + ligne('Nœuds hauts / bas', (L.profil.hvn.map(px).join(', ') || '—') + ' / ' + (L.profil.lvn.map(px).join(', ') || '—')) : '')
        + ligne('Zone au-dessus', z.dessus ? esc(z.dessus.type) + ' ' + px(z.dessus.prix) + ' <small>(' + nb(z.dessus.distanceATR, 1) + ' ATR)</small>' : '—')
        + ligne('Zone en dessous', z.dessous ? esc(z.dessous.type) + ' ' + px(z.dessous.prix) + ' <small>(' + nb(z.dessous.distanceATR, 1) + ' ATR)</small>' : '—'));
    }
    // ── microstructure (M4) : chaque mesure a sa phrase d'explication ; RÉEL / ESTIMÉ / INDISPONIBLE ──
    const mc = s.micro, dv = s.deriv; let hm = '<h4>Microstructure <small>sessions · liquidité · flux · dérivés Binance</small></h4>';
    const aide = id => '<small class="ag-aide">' + esc(AIDE_MESURES[id] || '') + '</small>', etq = (e, tx) => '<em class="' + (e === 'reel' ? 'ag-ok' : 'ag-alerte') + '">' + (tx || (e === 'reel' ? 'RÉEL' : e === 'estime' ? 'ESTIMÉ' : 'INDISPONIBLE')) + '</em>';
    if (!mc || !mc.ok) hm += '<p class="ag-vide">' + esc(mc && mc.raison || (d.n ? 'Mesures indisponibles.' : 'En attente de l’historique.')) + '</p>';
    else {
      const ses = mc.session, z = (mc.zones || []).slice(0, 4), w = mc.vwap, f = mc.flux, ro = (mc.ronds || []).slice().sort((u, v) => u.distanceATR - v.distanceATR)[0];
      hm += ligne('Session en cours', esc(ses.nom) + (ses.asie ? ' <small>· Asie ' + px(ses.asie.bas) + ' – ' + px(ses.asie.haut) + '</small>' : ses.code === 0 ? ' <small>· Asie en cours, extrêmes inconnus</small>' : '')) + aide('sessions');
      hm += ligne('Zones de liquidité proches', z.length ? z.map(x => esc(x.type) + ' ' + px(x.prix) + ' <small>(' + (x.cote === 'dessus' ? '↑' : '↓') + nb(x.distanceATR, 1) + ' ATR)</small>').join('<br>') : '—') + aide('liquidite');
      hm += ligne('VWAP du jour ' + etq('reel', 'RÉEL · Binance'), w ? px(w.prix) + ' <small>(prix à ' + sg(w.ecarts, 1) + ' σ)</small>' : '—') + aide('vwap');
      hm += ligne('Prix rond le plus proche', ro ? px(ro.prix) + ' <small>(' + nb(ro.distanceATR, 1) + ' ATR)</small>' : '—') + aide('prix_ronds');
      hm += ligne('Déséquilibre acheteur / vendeur ' + etq(f.estime ? 'estime' : 'reel'), f.deltaRatio == null ? '—' : sg(f.deltaRatio * 100, 0) + ' % du volume <small>(volume ' + nb(f.volRel, 1) + ' × normale)</small>', f.deltaRatio > 0.05 ? 'hausse' : f.deltaRatio < -0.05 ? 'baisse' : '') + aide('desequilibre');
      hm += ligne('Absorption', f.absorption ? esc(f.absorption.texte) : 'aucune sur la dernière bougie', f.absorption ? 'alerte' : '') + aide('absorption');
      hm += ligne('Volatilité', esc(mc.volatilite.note)) + aide('volatilite');
      const fi = mc.financement, oo = mc.interetOuvert, lq = mc.liquidations;
      hm += ligne('Financement ' + etq(fi.etat), fi.etat === 'reel' ? nb(fi.tauxPct, 4) + ' % / 8 h <small>(rang ' + pc(fi.rang) + ' sur 90 j)</small><br><small>' + esc(fi.note) + '</small>' : 'données non chargées') + aide('financement');
      hm += ligne('Intérêt ouvert ' + etq(oo.etat), oo.etat === 'reel' ? nb(oo.valeur, 0) + ' BTC <small>(' + sg((oo.var1h || 0) * 100, 2) + ' % en 1 h)</small><br><small>' + esc(oo.lecture) + '</small>' : 'données non chargées') + aide('interet_ouvert');
      hm += ligne('Liquidations ' + etq(lq.etat), lq.estime && !lq.aucune ? 'purge probable des ' + esc(lq.cote) + ' <small>(OI ' + sg(lq.oiVar1h * 100, 1) + ' %, bougie ' + nb(lq.amplitudeATR, 1) + ' ATR)</small>' : lq.etat === 'indisponible' ? 'aucune donnée (jamais de montant réel)' : 'aucune purge détectée') + aide('liquidations');
    }
    if (dv && dv.possible) {
      const pr = dv.progres;
      hm += '<div class="ag-derives">' + (pr && pr.phase === 'erreur' ? '<span class="ag-alerte">INDISPONIBLE : ' + esc(pr.message) + '</span> '
        : pr ? 'Téléchargement des dérivés… ' + esc(pr.phase) + (pr.total ? ' ' + pr.fait + '/' + pr.total : '') + ' '
        : dv.funding ? '<small>Dérivés Binance : ' + nb(dv.funding) + ' relevés de financement, ' + nb(dv.metrics) + ' relevés de 5 min' + (dv.finMetrics ? ' (jusqu’au ' + heureParis(dv.finMetrics) + ')' : '') + '. Une seule plateforme.</small> ' : '')
        + (!dv.funding && !pr ? '<button type="button" class="tg-btn" data-a="deriv">Activer financement et intérêt ouvert (≈ 2 minutes, gratuit)</button>' : '') + '</div>';
    }
    ecrire('micro', hm);
    // ── setup ──
    const st = s.setup; let hs = '<h4>Setup en cours</h4>';
    if (!st) hs += '<p class="ag-vide">Pas encore évalué.</p>';
    else if (st.statut === 'entree') hs += '<div class="ag-carte entree"><b>ENTRÉE · ' + sensTxt(st.sens) + '</b>' + (st.validee ? '' : ' <em class="ag-alerte">STRATÉGIE NON VALIDÉE · observation</em>') + ligne('Stratégie', esc(st.nomStrategie)) + ligne('Entrée (≈ prochaine ouverture)', px(st.entree) + ' $') + ligne('Stop', px(st.stop) + ' $ <small>(' + nb(st.distancePct, 2) + ' %)</small>') + ligne('Objectif', px(st.cible) + ' $ <small>(' + st.R + ' R)</small>') + ligne('Taille (risque ' + nb(st.risquePct, 1) + ' % = ' + nb(st.risqueCash, 0) + ' €)', nb(st.quantite, 4) + ' BTC ≈ ' + nb(st.notionnel, 0) + ' $') + ligne('Phase du marché', esc(st.phase || '—')) + ligne('Qualité', esc(st.qualite)) + '<p class="ag-inval">' + esc(st.invalidation) + '</p></div>';
    else if (st.statut === 'preparation') hs += '<div class="ag-carte prep"><b>PRÉPARATION · ' + sensTxt(st.sens) + ' possible</b><p>' + esc(st.texte.replace(/^PRÉPARATION · /, '')) + '</p>' + ligne('Distance au niveau', nb(st.distanceATR, 2) + ' ATR H1') + ligne('Phase du marché', esc(st.phase || '—')) + '<p class="ag-inval">Ce n’est pas une entrée : aucune position n’est proposée tant que toutes les conditions ne sont pas réunies.</p></div>';
    else hs += '<p class="ag-vide"><b>Pas de setup.</b> ' + esc(st.raison || '') + '</p>';
    ecrire('setup', hs);
    // ── stratégie ──
    const S = s.strategie; let hst = '<h4>Stratégie</h4>';
    if (!S) hst += '<p class="ag-vide">' + (s.verdict ? esc(s.verdict.resume) + ' ' + nb(s.verdict.nVariantes) + ' variantes testées.' : 'Aucune recherche faite. Lance la recherche : elle teste cinq idées (cassure de range, retour sur le POC, faux breakout, repli sur moyenne, expansion après compression) sur tout l’historique.') + '</p>';
    else hst += '<div class="ag-nom">' + esc(S.nom) + ' <em class="' + (S.validee ? 'ag-ok' : 'ag-alerte') + '">' + (S.validee ? 'VALIDÉE' : 'REJETÉE') + '</em></div><p>' + esc(S.description) + '</p><p class="ag-par">Paramètres : ' + esc(Object.entries(S.params).map(([k, v]) => k + ' = ' + v).join(' · ')) + '</p>'
      + '<details><summary>Critères hors échantillon (' + S.horsEchantillon.n + ' trades)</summary><table class="ag-crit">' + S.juge.lignes.map(l => '<tr class="' + (l.ok ? 'ok' : 'ko') + '"><td>' + (l.ok ? '✓' : '✗') + '</td><td>' + esc(l.critere) + '</td><td>' + (l.valeur == null ? '—' : nb(l.valeur, 2)) + esc(l.unite || '') + '</td><td>' + esc(l.seuil) + '</td></tr>').join('') + '</table></details>'
      + (S.jeuFinal ? '<details><summary>Jeu final (ouvert une seule fois, ' + new Date(S.jeuFinal.debut).toISOString().slice(0, 10) + ' → ' + new Date(S.jeuFinal.fin).toISOString().slice(0, 10) + ')</summary><table class="ag-crit">' + S.jeuFinal.juge.lignes.map(l => '<tr class="' + (l.ok ? 'ok' : 'ko') + '"><td>' + (l.ok ? '✓' : '✗') + '</td><td>' + esc(l.critere) + '</td><td>' + (l.valeur == null ? '—' : nb(l.valeur, 2)) + esc(l.unite || '') + '</td><td>' + esc(l.seuil) + '</td></tr>').join('') + '</table></details>' : '');
    hst += '<details><summary>Critères d’acceptation (écrits avant les tests, version ' + s.criteres.version + ')</summary><ul>' + s.criteres.textes.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details><p class="ag-par">' + nb(s.nVariantes) + ' variantes testées au total : plus on teste, plus un bon résultat peut venir du hasard, donc le seuil de validation monte avec ce compteur.</p>';
    ecrire('strategie', hst);
    // ── performance ──
    const bt = S && S.horsEchantillon, jf = S && S.jeuFinal && S.jeuFinal.stats, cv = s.compte.valide, cc = s.compte.candidate;
    const tab = (titre, sous, st2, courbeId, extra) => '<div class="ag-perf"><h5>' + titre + '</h5><small>' + sous + '</small>' + (st2 && st2.n ? ligne('Trades', nb(st2.n)) + ligne('Taux de réussite', pc(st2.tauxReussite)) + ligne('R moyen (espérance)', sg(st2.esperance, 2) + ' R', st2.esperance > 0 ? 'hausse' : 'baisse') + ligne('Facteur de profit', nb(st2.factProfit, 2)) + ligne('Creux maximal', nb(st2.ddR, 1) + ' R') + ligne('Trades par semaine', nb(st2.parSemaine, 2)) + (extra || '') : '<p class="ag-vide">Aucun trade.</p>') + (courbeId ? '<canvas class="ag-courbe" data-courbe="' + courbeId + '" width="320" height="90"></canvas>' : '') + '</div>';
    ecrire('perf', '<h4>Performance <small>deux mesures séparées</small></h4><div class="ag-perfs">'
      + tab('BACKTEST hors échantillon', 'walk-forward, paramètres choisis sur l’entraînement seulement · frais, spread et glissement inclus', bt, 'bt')
      + (jf ? tab('BACKTEST jeu final', 'ouvert une seule fois', jf, null) : '')
      + tab('COMPTE SIMULÉ en direct', 'positions suivies jusqu’au résultat, sans aucun ordre réel · capital de départ ' + nb(cv.capital0) + ' €' + (cv.n ? ' · actuel ' + nb(cv.capitalFinal, 0) + ' €' : ''), cv, 'compte', '')
      + (cc.n ? tab('COMPTE SIMULÉ candidate NON validée', 'observation seulement', cc, null) : '') + '</div><p class="ag-avert">Les résultats passés ne garantissent rien.</p>');
    // ── alertes ──
    ecrire('alertes', '<h4>Alertes</h4>' + (s.alertes.length ? '<ul class="ag-liste">' + s.alertes.slice(0, 12).map(a => '<li class="' + a.type.toLowerCase() + '"><b>' + (a.type === 'ENTREE' ? 'ENTRÉE' : 'PRÉPARATION') + '</b> <small>' + heureParis(a.t) + '</small><span>' + esc(a.texte) + '</span></li>').join('') + '</ul>' : '<p class="ag-vide">Aucune alerte. Sans stratégie validée, l’agent n’en émet pas.</p>'));
    // ── journal ──
    ecrire('journal', '<h4>Journal d’expériences <small>' + s.journal.length + ' entrées</small></h4><ul class="ag-liste ag-journal">' + (s.journal.length ? s.journal.slice().reverse().slice(0, 40).map(j => '<li><b class="d-' + (j.decision || 'n') + '">' + (DECISIONS[j.decision] || (j.etape || '').toUpperCase()) + '</b> <small>' + (j.famille ? esc(j.famille) + (j.generation != null ? ' · génération ' + j.generation : '') : esc(j.etape || '')) + '</small><span>' + esc(j.pourquoi || '') + '</span></li>').join('') : '<li class="ag-vide">Vide : aucune expérience encore.</li>') + '</ul>');
    // ── contrôles ──
    const rg = s.reglages, focus = zones.controles.contains(document.activeElement);
    if (!focus) ecrire('controles', '<button type="button" class="tg-btn" data-a="recherche"' + (r.enCours || !d.n ? ' disabled' : '') + '>' + (s.verdict ? '↻ Relancer la recherche' : '▶ Lancer la recherche de stratégie') + '</button><button type="button" class="tg-btn" data-a="stop"' + (r.enCours ? '' : ' disabled') + '>■ Arrêter</button><button type="button" class="tg-btn" data-a="maj">↻ Mettre à jour les données</button>'
      + '<label>Capital <input type="number" data-r="capital" value="' + rg.capital + '" min="100" step="500"> €</label><label>Risque <input type="number" data-r="risquePct" value="' + rg.risquePct + '" min="0.1" max="5" step="0.1"> %</label><label>Max / semaine <input type="number" data-r="maxParSemaine" value="' + rg.maxParSemaine + '" min="1" max="5"></label><label>Repos <input type="number" data-r="reposHeures" value="' + rg.reposHeures + '" min="0" max="48"> h</label>'
      + '<label>Calcul <select data-r="charge"><option value="douce"' + (rg.charge === 'douce' ? ' selected' : '') + '>doux (je joue)</option><option value="normale"' + (rg.charge === 'normale' ? ' selected' : '') + '>normal</option><option value="max"' + (rg.charge === 'max' ? ' selected' : '') + '>maximum</option></select></label>'
      + '<label title="Montre aussi les setups d’une candidate non validée, sans alerte d’entrée"><input type="checkbox" data-r="observation"' + (rg.observation ? ' checked' : '') + '> mode observation</label><label><input type="checkbox" data-r="notifications"' + (rg.notifications ? ' checked' : '') + '> notifications du navigateur</label>');
    dessinerCourbes(s);
  }
  function dessinerCourbes(s) {
    for (const cv of racine.querySelectorAll('canvas[data-courbe]')) {
      const id = cv.dataset.courbe, g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
      const S = s.strategie, y = id === 'compte' ? s.compte.valide.courbe : null;
      let serie = null, lib = '';
      if (id === 'compte') { serie = y && y.length > 1 ? y : null; lib = 'capital (€)'; }
      else if (S && S.horsEchantillon && S.horsEchantillon.courbeR) { serie = S.horsEchantillon.courbeR; lib = 'courbe hors échantillon en R'; }
      g.fillStyle = 'rgba(2,10,20,.6)'; g.fillRect(0, 0, cv.width, cv.height);
      if (!serie || serie.length < 2) { g.fillStyle = '#6b8796'; g.font = '11px monospace'; g.fillText('courbe de capital : pas encore de trades', 8, 48); continue; }
      const mn = Math.min(...serie), mx = Math.max(...serie), X = i => 6 + i / (serie.length - 1) * (cv.width - 12), Y = v => cv.height - 8 - (v - mn) / ((mx - mn) || 1) * (cv.height - 20);
      g.strokeStyle = '#4de3ff'; g.lineWidth = 1.6; g.beginPath(); serie.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
      g.fillStyle = '#6b8796'; g.font = '10px monospace'; g.fillText(lib + ' · ' + nb(serie[0], 0) + ' → ' + nb(serie[serie.length - 1], 0), 6, 11);
    }
  }
  const planifier = () => { if (!planifie && !detruit) planifie = setTimeout(rendre, 250); };

  racine.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b || !agent) return;
    const a = b.dataset.a;
    if (a === 'activer') { await activerAgent(); }
    else if (a === 'deriv') { await activerDeriv(); }
    else if (a === 'recherche') agent.lancerRecherche({ generationsMax: 2 });
    else if (a === 'stop') agent.arreterRecherche();
    else if (a === 'maj') { await agent.miseAJour(); }
    planifier();
  });
  racine.addEventListener('change', async e => {
    const i = e.target.closest('[data-r]'); if (!i || !agent) return;
    const k = i.dataset.r, val = i.type === 'checkbox' ? i.checked : i.value;
    await agent.reglages({ [k]: val }); if (k === 'notifications' && val) demanderNotifications(); dernier.controles = null; planifier();
  });

  async function init() {
    agent = await obtenirAgent({ demarrer: true }); if (detruit) return;
    desabonner = surChangement(planifier); rendre();
  }
  init().catch(e => { racine.insertAdjacentHTML('afterbegin', '<p class="ag-alerte">Agent indisponible : ' + esc(e.message) + '</p>'); });
  return { racine, maj() { planifier(); }, detruire() { detruit = true; if (planifie) clearTimeout(planifie); if (desabonner) desabonner(); } };
}
