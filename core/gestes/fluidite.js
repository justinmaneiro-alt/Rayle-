"use strict";
/* ═════════════ GESTES V10 : « Test de fluidité (60 s) », analyse, corrections, comparaison téléphone / PC ═════════════
   Pendant 60 s de VRAIS gestes, enregistre sur les deux appareils tout ce que la chaîne produit (voir fluidite-calcul.js pour le format) : images/s de la caméra et de la détection, durée de détection,
   débit, pertes, gigue, délai de bout en bout (horloges synchronisées), images/s de rendu du PC, durée du moteur, pertes de main, actions, clics suspects, tremblement, batterie, mode d'économie.
   Puis : analyse en français (« goulot d'étranglement : … »), correction proposée avec un bouton « Appliquer », export de la trace en JSON (pour la rejouer dans les tests), et réglage automatique du
   filtre sur CETTE trace. Rien ne part sur Internet ; la dernière trace reste sur cet appareil (rayle_fluidite_trace). Le test ne fait rien tant que tu ne cliques pas. */
const Fluidite = (() => {
  const FC = () => window.FluiditeCalcul, G = () => window.Gestes, R = () => window.CameraRelais, UI = () => window.GestesUI;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CLE_TRACE = 'rayle_fluidite_trace', CLE_HIST = 'rayle_fluidite_historique';
  const lire = (c, def) => { try { return JSON.parse(localStorage.getItem(c) || 'null') || def; } catch (e) { return def; } };
  const ecrire = (c, v) => { try { localStorage.setItem(c, typeof v === 'string' ? v : JSON.stringify(v)); return true; } catch (e) { return false; } };
  let enCours = null, derniere = lire(CLE_HIST, []).slice(-1)[0] || null, dernierTrace = null, bandeau = null;

  function bandeauEl() {
    if (bandeau) return bandeau; bandeau = document.createElement('div'); bandeau.id = 'fluidite-bandeau'; bandeau.setAttribute('role', 'status'); bandeau.hidden = true;
    bandeau.innerHTML = '<b>Test de fluidité</b> <span data-k="msg"></span><progress max="100" value="0"></progress><button type="button" data-k="stop">Arrêter</button>'; document.body.appendChild(bandeau);
    bandeau.querySelector('[data-k="stop"]').addEventListener('click', () => arreter(true)); return bandeau;
  }
  const dire = t => { const b = bandeauEl(); b.hidden = false; b.querySelector('[data-k="msg"]').textContent = t; };

  /* Enregistre `secondes` secondes. Renvoie la trace (aussi mémorisée). `consigne` : texte affiché pendant le test. */
  function enregistrer(secondes = 60, { consigne = 'Fais tes gestes habituels : pointer, cliquer, déplacer une fenêtre, tourner un objet 3D, rester immobile quelques secondes.' } = {}) {
    return new Promise((resolve, reject) => {
      const g = G(), calc = FC(); if (!g || !calc) return reject(new Error('Le banc de mesure n’est pas chargé.'));
      const e = g.etat(); if (!e.actif) return reject(new Error('Active d’abord les gestes (⚙ → Gestes), puis relance le test.'));
      if (enCours) return reject(new Error('Un test est déjà en cours.'));
      const rec = calc.creerEnregistreur(), mot = g.moteur(), opt = mot && mot.options ? mot.options : {}, ecran = { l: innerWidth, h: innerHeight };
      const GV5 = window.GestesV5; let n = 0;
      rec.entete({ ecran, prefs: g.reglages(), source: e.source, moteur: { miroir: opt.miroir, droitier: opt.droitier, zone: opt.zone, lissage: opt.lissage, ratio: opt.ratio, predictionMs: opt.predictionMs, zoneMorte: opt.zoneMorte, sensibiliteClic: opt.sensibiliteClic, seuilFerme: opt.seuilFerme, seuilOuvre: opt.seuilOuvre, modeRelatif: opt.modeRelatif, exigerEngagement: opt.exigerEngagement, engagementMs: opt.engagementMs } });
      const debut = performance.now(); let derniereSeconde = -1;
      const off1 = g.ecouterTrames((frame, sortie, ms) => {
        const tp = performance.now(), main = frame.mains && frame.mains[0], et = sortie.etat || {};
        let ref = null; try { if (main && GV5) ref = calc.refEcran(main, mot.options, ecran); } catch (x) { ref = null; }
        rec.trame({ tp, tt: frame.tt != null ? frame.tt : null, seq: frame.seq, dt: frame.dt, n: frame.mains.length, conf: frame.conf, lat: frame.lat, mot: +ms.toFixed(3), aff: null, ref: ref && [+ref[0].toFixed(1), +ref[1].toFixed(1)], cur: et.curseur ? [+et.curseur.x.toFixed(1), +et.curseur.y.toFixed(1)] : null, pose: et.pose || null, ratio: frame.ratio, mains: frame.mains.map(m => ({ lat: m.lat, pts: m.pts.map(p => [p[0], p[1]]) })) });
        const idx = rec.trace.frames.length - 1; if (idx >= 0) requestAnimationFrame(t => { const f = rec.trace.frames[idx]; if (f) f.aff = +(t - tp).toFixed(2); });   // arrivée → image affichée
        for (const a of sortie.actions) if (a.a !== 'curseur' && a.a !== 'deplace' && a.a !== 'defile' && a.a !== 'deux') rec.action(tp, { a: a.a, n: a.n, x: a.x == null ? undefined : Math.round(a.x), y: a.y == null ? undefined : Math.round(a.y) });
        for (const ev of sortie.evenements) rec.evenement(tp, ev.type);
        n++;
      });
      const A = window.GestesV5Actions; if (A && A.ecouterImage) A.ecouterImage((dt, x, y, t) => { if (dt > 0 && dt < 500) rec.rendu(dt); rec.affiche(t, x, y); });
      const relais = R(); if (relais && relais.definirSurTelephone) relais.definirSurTelephone(s => { rec.tel({ ...s, t: Math.floor((performance.now() - debut) / 1000) }); });
      enCours = { rec, annule: false, off1 };
      dire(consigne + ' (' + secondes + ' s)');
      const prog = bandeauEl().querySelector('progress');
      const iv = setInterval(() => {
        const s = (performance.now() - debut) / 1000; prog.value = Math.min(100, s / secondes * 100);
        if (Math.floor(s) !== derniereSeconde) { derniereSeconde = Math.floor(s); bandeauEl().querySelector('[data-k="msg"]').textContent = consigne + ' — ' + Math.max(0, Math.ceil(secondes - s)) + ' s · ' + n + ' trames'; }
        if (s >= secondes || (enCours && enCours.annule)) fin();
      }, 250);
      function fin() {
        clearInterval(iv); off1(); if (A && A.ecouterImage) A.ecouterImage(null); if (relais && relais.definirSurTelephone) relais.definirSurTelephone(null);
        const annule = enCours && enCours.annule; enCours = null; bandeauEl().hidden = true;
        const trace = rec.fin(performance.now() - debut); const r = relais && relais.etat ? relais.etat() : {};
        trace.decalage = { ms: r.decalage, rttMs: r.rttMin }; trace.duree = Math.round(trace.duree);
        if (annule && trace.frames.length < 30) return reject(new Error('Test interrompu.'));
        dernierTrace = trace; resolve(trace);
      }
    });
  }
  function arreter(annule) { if (enCours) enCours.annule = true; void annule; }

  function contexte() {
    const r = R() ? R().etat() : {}, p = G().reglages();
    return { calculPossibleSurPc: !!(R() && r.liaison === 'direct'), modePc: r.calcul === 'pc', nbMainsTel: r.tel ? r.tel.mains : 2, calculPcAutorise: !!p.calculPc };
  }
  function analyserTrace(trace) {
    const calc = FC(), m = calc.calculer(trace), a = calc.analyser(m, contexte());
    const meilleur = r => r; void meilleur;
    return { metrics: m, analyse: a };
  }
  function memoriser(trace, res, etiquette) {
    const h = lire(CLE_HIST, []); h.push({ date: new Date().toISOString(), etiquette: etiquette || '', origine: trace.origine, metrics: res.metrics, goulot: res.analyse.goulot });
    while (h.length > 8) h.shift(); ecrire(CLE_HIST, h); derniere = h[h.length - 1];
    const json = FC().compacter({ ...trace, frames: trace.frames.slice(0, 4200) }); if (json.length < 3.8e6) ecrire(CLE_TRACE, json);
  }

  // ── affichage du résultat ──
  const fmt = (v, u = '') => v == null ? '—' : v + u;
  function ligneObjectif(o) { return '<tr class="' + (o.ok === true ? 'ok' : o.ok === false ? 'ko' : '') + '"><td>' + esc(o.nom) + '</td><td>' + fmt(o.valeur) + '</td><td>' + esc(o.cible) + '</td><td>' + (o.ok === true ? '✔' : o.ok === false ? '✘' : '?') + '</td></tr>'; }
  function afficherResultat(trace, res, { avant = null, titre = 'Résultat du test de fluidité' } = {}) {
    const ui = UI(); if (!ui || !ui.ouvrirModale) return null; const a = res.analyse, m = res.metrics;
    const constats = a.constats.map((c, i) => '<div class="fl-constat ' + c.gravite + '"><b>' + esc(c.titre) + '</b><div>' + esc(c.detail) + '</div>' + (c.correction ? '<div class="fl-corr">Correction proposée : ' + esc(c.correction.libelle) + (c.correction.option === 'confidentialite' ? ' <i>(la vidéo quitte le téléphone, en direct vers ton PC, sans serveur ni enregistrement : à toi de décider)</i>' : '') + ' <button type="button" data-fl="appliquer" data-i="' + i + '">Appliquer</button></div>' : '<div class="fl-corr">Pas de réglage automatique pour ce point.</div>') + '</div>').join('');
    const cmp = avant ? '<h4 class="gm-h">Avant → après (même mode d’emploi)</h4><div class="gm-note">Débit ' + fmt(avant.debit.mediane) + ' → ' + fmt(m.debit.mediane) + ' /s · délai p95 ' + fmt(avant.delai.p95) + ' → ' + fmt(m.delai.p95) + ' ms · tremblement ' + fmt(avant.tremblementPx) + ' → ' + fmt(m.tremblementPx) + ' px · clics suspects/min ' + fmt(avant.fauxParMinute) + ' → ' + fmt(m.fauxParMinute) + '</div>' : '';
    const html = '<div class="gm-etat ' + (a.constats.length ? (a.constats[0].gravite === 'rouge' ? 'ko' : '') : 'ok') + '"><b>' + esc(a.goulot) + '</b><div>' + esc(a.resume) + '</div></div>' +
      '<table class="gm-tab fl-obj"><thead><tr><th>Objectif</th><th>Mesuré</th><th>Visé</th><th></th></tr></thead><tbody>' + a.objectifs.map(ligneObjectif).join('') + '</tbody></table>' + cmp + constats +
      '<h4 class="gm-h">Détail des mesures</h4><div class="gm-note fl-detail">' + [
        'Trames : ' + m.images + ' en ' + m.duree + ' s' + (trace.origine === 'simulation' ? ' (trace SIMULÉE)' : ''),
        'Caméra du téléphone : ' + fmt(m.camera.fps, ' images/s') + ' · détection : ' + fmt(m.detection.fps, ' images/s') + ', ' + fmt(m.detection.msParImage, ' ms') + ' par image',
        'Réseau : gigue ' + fmt(m.gigue.p95, ' ms') + ' (p95) · pertes ' + (m.perte == null ? '—' : Math.round(m.perte * 100) + ' %') + ' · pertes de main ' + m.pertesDeMain,
        'Délai : ' + fmt(m.delai.p50, ' ms') + ' (médiane) · composantes (téléphone / réseau / moteur / affichage) ' + [m.delai.composantes.telephone, m.delai.composantes.reseau, m.delai.composantes.moteurPc, m.delai.composantes.affichage].map(x => fmt(x)).join(' / ') + ' ms',
        'PC : ' + fmt(m.rendu.fps, ' images/s') + ' (pire 1 % : ' + fmt(m.rendu.pire1pc) + ') · moteur ' + fmt(m.moteurMs, ' ms'),
        'Curseur : tremblement au repos ' + fmt(m.tremblementPx, ' px') + ' (' + m.tremblementFenetres + ' fenêtres) · retard en mouvement ' + fmt(m.retardMs, ' ms'),
        'Actions : ' + m.actions.total + ' (' + Object.entries(m.actions.parType).map(([k, v]) => k + ' ' + v).join(', ') + ') · clics suspects ' + m.clicsSuspects + ' sur ' + m.clics,
        'Téléphone : batterie ' + (m.telephone.batterie == null ? '—' : Math.round(m.telephone.batterie * 100) + ' %') + (m.telephone.economie ? ' · économie' : '') + ' · calcul ' + fmt(m.telephone.calcul) + ' · cadence ' + (m.detection.tendance == null ? '—' : (m.detection.tendance > 0.05 ? '−' + Math.round(m.detection.tendance * 100) + ' % au fil du test' : 'stable'))
      ].map(l => '<div>' + esc(l) + '</div>').join('') + '</div>' +
      '<div class="gm-actions"><button type="button" data-fl="filtre">Régler le filtre sur ma trace</button><button type="button" data-fl="exporter" class="ghost">Exporter la trace (JSON)</button><button type="button" data-fl="refaire" class="ghost">Refaire le test</button></div><div id="fl-retour" class="gm-note"></div>';
    const modale = ui.ouvrirModale(titre, html);
    const racine = document.getElementById('gestes-modale');
    racine.onclick = async ev => {
      const b = ev.target.closest('[data-fl]'); if (!b) return; const k = b.dataset.fl, retour = racine.querySelector('#fl-retour');
      if (k === 'appliquer') { const c = a.constats[+b.dataset.i]; if (c && c.correction) { b.disabled = true; retour.textContent = appliquerCorrection(c.correction); } }
      else if (k === 'exporter') { exporter(trace); retour.textContent = 'Trace exportée (fichier JSON dans les téléchargements). Elle se rejoue avec FluiditeCalcul.rejouer.'; }
      else if (k === 'filtre') { b.disabled = true; retour.textContent = 'Calcul en cours sur ta trace…'; await new Promise(r => setTimeout(r, 30)); retour.textContent = reglerFiltre(trace); }
      else if (k === 'refaire') { lancer(); }
    };
    return modale;
  }
  /* « Appliquer » : réglages de la page (Gestes.regler) et du téléphone (message sur le canal de contrôle). Retourne le texte à afficher. */
  function appliquerCorrection(c) {
    const dit = [];
    if (c.page) { G().regler(c.page); dit.push('réglages de la page : ' + Object.entries(c.page).map(([k, v]) => k + ' = ' + v).join(', ')); }
    if (c.tel) {
      const tel = { ...c.tel };
      if (tel.calcul === 'pc') { G().regler({ calculPc: true }); activerCalculPc(true); delete tel.calcul; dit.push('calcul sur le PC demandé : accepte-le sur l’écran du téléphone'); }
      if (Object.keys(tel).length) { const ok = R() && R().envoyerReglages ? R().envoyerReglages(tel) : false; dit.push(ok ? 'réglages envoyés au téléphone : ' + Object.entries(tel).map(([k, v]) => k + ' = ' + v).join(', ') : 'le téléphone n’est pas joignable : réglages non envoyés'); }
    }
    return 'Appliqué — ' + dit.join(' · ') + '. Relance le test pour mesurer le changement.';
  }
  function reglerFiltre(trace) {
    const calc = FC(); if (!trace.frames.some(f => f.mains)) return 'Cette trace ne contient pas les points de la main : impossible de la rejouer.';
    try {
      const c = calc.calibrerFiltre(trace), patch = { lissage: c.lissage, zoneMorte: 6 }; G().regler(patch);
      return (c.tenu ? 'Filtre réglé sur ta trace : lissage ' + Math.round(c.lissage * 100) + ' %, zone morte 6 px. ' : 'Aucun lissage ne tient à la fois le tremblement (< 2 px) et le retard (< 70 ms) sur ta trace : le moins mauvais est appliqué (lissage ' + Math.round(c.lissage * 100) + ' %). ') + 'Essais : ' + c.essais.map(e => Math.round(e.lissage * 100) + ' % → ' + fmt(e.tremblementPx) + ' px / ' + fmt(e.retardMs) + ' ms').join(' · ');
    } catch (e) { return 'Calcul impossible : ' + e.message; }
  }
  function exporter(trace) { const a = document.createElement('a'), u = URL.createObjectURL(new Blob([FC().compacter(trace)], { type: 'application/json' })); a.href = u; a.download = 'fluidite-' + Date.now() + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }

  // ── mode « calcul sur le PC » : demande, réception de la vidéo, détection locale ──
  let pcActif = false;
  function activerCalculPc(oui) {
    const r = R(); if (!r || !r.demanderCalculPc) return false;
    pcActif = !!oui; const ok = r.demanderCalculPc(!!oui);
    if (!oui && window.DetectionPc) window.DetectionPc.arreter();
    return ok;
  }
  function brancherPiste() {
    const r = R(); if (!r || !r.definirSurPiste || brancherPiste.fait) return; brancherPiste.fait = true;
    r.definirSurPiste(async flux => {
      if (!window.DetectionPc) return;
      if (!flux) { window.DetectionPc.arreter(); return; }
      const g = G(), p = g.reglages(); if (!p.calculPc) return;   // sécurité : sans autorisation locale, la vidéo reçue est ignorée
      await window.DetectionPc.demarrer(flux, { base: g.baseModele(), mains: 2, rtt: () => (R().etat().rtt), injecter: f => g.injecterPc(f) });
    });
  }

  // ── comparaison « calcul sur le téléphone » / « calcul sur le PC » (2 × 30 s) ──
  function noter(m) {   // plus c'est haut, mieux c'est : débit utile, sans délai ni pertes de main
    if (m.debit.mediane == null) return 0; const d = m.delai.p95 == null ? 60 : m.delai.p95;
    return m.debit.mediane - Math.max(0, d - 40) * 0.4 - m.pertesDeMain * 2 - (m.perte || 0) * 60;
  }
  async function comparer() {
    const r = R(), g = G(); if (!r || !g.etat().actif) throw new Error('Active d’abord les gestes avec la caméra du téléphone.');
    if (!g.reglages().calculPc) throw new Error('Le calcul sur le PC est désactivé (réglage ⚙ « Autoriser le calcul sur le PC »).');
    brancherPiste();
    activerCalculPc(false); await new Promise(res => setTimeout(res, 1500));
    const A = await enregistrer(30, { consigne: 'Mode 1/2 — calcul sur le TÉLÉPHONE : fais tes gestes habituels' });
    activerCalculPc(true); dire('Mode 2/2 : attente de l’accord du téléphone (accepte sur son écran)…');
    let ok = false; for (let i = 0; i < 40 && !ok; i++) { await new Promise(res => setTimeout(res, 500)); ok = r.etat().calcul === 'pc' && window.DetectionPc && window.DetectionPc.etat().actif && window.DetectionPc.etat().recues > 10; }
    if (!ok) { activerCalculPc(false); bandeauEl().hidden = true; throw new Error('Le téléphone n’a pas accepté (ou la vidéo directe n’est pas arrivée). Le calcul est resté sur le téléphone.'); }
    const B = await enregistrer(30, { consigne: 'Mode 2/2 — calcul sur le PC : refais les mêmes gestes' });
    const ra = analyserTrace(A), rb = analyserTrace(B), na = noter(ra.metrics), nb = noter(rb.metrics), meilleur = nb > na + 3 ? 'pc' : 'telephone';
    return { A, B, ra, rb, na, nb, meilleur };
  }
  function afficherComparaison(c) {
    const ui = UI(); if (!ui) return; const ligne = (nom, m) => '<tr><td>' + nom + '</td><td>' + fmt(m.debit.mediane) + '</td><td>' + fmt(m.debit.min) + '</td><td>' + fmt(m.delai.p95) + '</td><td>' + m.pertesDeMain + '</td></tr>';
    ui.ouvrirModale('Téléphone ou PC : quel calcul est le plus fluide ?', '<div class="gm-etat ok"><b>Recommandation : ' + (c.meilleur === 'pc' ? 'calcul sur le PC' : 'calcul sur le téléphone') + '</b><div>' + (c.meilleur === 'pc' ? 'Le PC détecte plus vite et sans à-coups. La vidéo quitte alors le téléphone (en direct vers le PC, sans serveur, sans enregistrement).' : 'Le téléphone suffit : rien d’autre que les points de ta main ne quitte le téléphone (confidentialité maximale).') + '</div></div>' +
      '<table class="gm-tab"><thead><tr><th></th><th>Paquets/s</th><th>Minimum</th><th>Délai p95 (ms)</th><th>Pertes de main</th></tr></thead><tbody>' + ligne('Téléphone', c.ra.metrics) + ligne('PC', c.rb.metrics) + '</tbody></table>' +
      '<div class="gm-actions"><button type="button" data-fl="pc">Utiliser le calcul sur le PC</button><button type="button" data-fl="tel" class="ghost">Rester sur le téléphone (points seulement)</button></div><div id="fl-retour" class="gm-note"></div>');
    const racine = document.getElementById('gestes-modale');
    racine.onclick = ev => { const b = ev.target.closest('[data-fl]'); if (!b) return; const retour = racine.querySelector('#fl-retour'); if (b.dataset.fl === 'pc') { G().regler({ calculPc: true }); brancherPiste(); activerCalculPc(true); retour.textContent = 'Calcul sur le PC activé (le téléphone l’a déjà accepté pour cette session).'; } else { activerCalculPc(false); G().regler({ calculPc: false }); retour.textContent = 'Calcul sur le téléphone : seuls les points de la main quittent le téléphone.'; } };
  }

  async function lancer({ secondes = 60 } = {}) {
    try {
      const trace = await enregistrer(secondes), res = analyserTrace(trace), avant = derniere && derniere.origine !== 'simulation' ? derniere.metrics : null;
      memoriser(trace, res); afficherResultat(trace, res, { avant }); return { trace, res };
    } catch (e) { const ui = UI(); if (ui && ui.ouvrirModale) ui.ouvrirModale('Test de fluidité', '<div class="gm-err">' + esc(e.message) + '</div>'); return null; }
  }
  async function lancerComparaison() {
    try { const c = await comparer(); afficherComparaison(c); return c; }
    catch (e) { const ui = UI(); if (ui && ui.ouvrirModale) ui.ouvrirModale('Comparaison téléphone / PC', '<div class="gm-err">' + esc(e.message) + '</div>'); return null; }
  }
  /* Analyse d'une trace déjà enregistrée (fichier exporté ou simulée) sans toucher aux gestes : sert aux tests et à « rejouer une session ». */
  function analyserFichier(trace) { const res = analyserTrace(trace); afficherResultat(trace, res, { titre: 'Analyse d’une trace enregistrée' }); return res; }

  return { lancer, lancerComparaison, enregistrer, arreter, analyserTrace, analyserFichier, appliquerCorrection, reglerFiltre, activerCalculPc, brancherPiste, exporter, noter, derniere: () => derniere, derniereTrace: () => dernierTrace, enCours: () => !!enCours, contexte };
})();
window.Fluidite = Fluidite;
