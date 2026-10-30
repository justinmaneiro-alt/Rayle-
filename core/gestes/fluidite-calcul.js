"use strict";
/* ═════════════ GESTES V10 : banc de mesure de la fluidité, calcul PUR (aucun accès au DOM, testé sous Node) ═════════════
   Une TRACE est l'enregistrement d'une session (60 s de vrais gestes, ou une simulation) :
     { version:1, origine:'reel'|'simulation', ecran:{l,h}, duree, prefs, tel,
       frames:[{ tp (arrivée sur le PC, ms), tt (heure du téléphone), seq, dt (capture→détection, ms), n (mains), conf, lat (délai capture→arrivée, ms),
                 mot (temps du moteur, ms), aff (arrivée→image affichée, ms), ref:[x,y] (bout de l'index, écran, sans filtre), cur:[x,y], pose, mains }],
       tel:[{ t, cam, det, detMs, bat, charge, eco, res, calcul, thermique }]     une ligne par seconde, envoyée par le téléphone
       rendu:[ms entre deux images du PC], affiche:[[t,x,y]] (position affichée, ≤ 60/s), actions:[{t,a}], evenements:[{t,type}] }
   Ce module sait : calculer les mesures, les ANALYSER en français (goulot + correction + « Appliquer »), DÉGRADER une trace (gigue, pertes, 15 images/s) et REJOUER une trace dans le moteur
   pour mesurer un changement sur la MÊME trace (tremblement, retard, faux clics). Rien n'est inventé : une mesure absente reste `null`. */
(function (racine) {
  const GV5 = () => racine.GestesV5 || (typeof require === 'function' ? require('./gestes-v5-calcul.js') : null);

  // ── statistiques ──
  const nombres = l => l.filter(x => Number.isFinite(x));
  const trier = l => nombres(l).sort((a, b) => a - b);
  function percentile(l, p) { const s = trier(l); if (!s.length) return null; const k = (s.length - 1) * p, a = Math.floor(k), b = Math.ceil(k); return s[a] + (s[b] - s[a]) * (k - a); }
  const mediane = l => percentile(l, 0.5);
  const moyenne = l => { const s = nombres(l); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };
  const ecartType = l => { const s = nombres(l), m = moyenne(s); return s.length > 1 ? Math.sqrt(s.reduce((a, x) => a + (x - m) * (x - m), 0) / s.length) : 0; };
  const arrondi = (v, n = 1) => v == null || !Number.isFinite(v) ? null : +v.toFixed(n);

  // ── mesures d'une trace ──
  /* Paquets reçus par seconde : seulement les secondes où une main est vue (sans main, le téléphone n'envoie qu'un battement de 10/s). */
  function debits(frames) {
    const bins = new Map();
    for (const f of frames) { const k = Math.floor(f.tp / 1000), b = bins.get(k) || { n: 0, avecMain: 0 }; b.n++; if (f.n > 0) b.avecMain++; bins.set(k, b); }
    const utiles = [...bins.values()].filter(b => b.avecMain >= b.n * 0.6 && b.avecMain >= 3).map(b => b.n);
    return { parSeconde: utiles, mediane: mediane(utiles), p5: percentile(utiles, 0.05), min: utiles.length ? Math.min(...utiles) : null, sous30: utiles.length ? utiles.filter(x => x < 30).length / utiles.length : null };
  }
  function pertes(frames) {
    let attendus = 0, recus = 0, dernier = null;
    for (const f of frames) { if (f.seq == null) continue; if (dernier !== null) { let d = (f.seq - dernier) & 0xFFFF; if (d > 32767) d -= 65536; if (d > 0) { attendus += d; recus++; dernier = f.seq; } } else { dernier = f.seq; recus++; attendus++; } }
    return { attendus, recus, perte: attendus ? Math.max(0, (attendus - recus) / attendus) : null };
  }
  function gigue(frames) {
    const t = frames.filter(f => f.n > 0).map(f => f.tp), ecarts = []; for (let i = 1; i < t.length; i++) ecarts.push(t[i] - t[i - 1]);
    if (ecarts.length < 5) return { ecartType: null, p95: null, intervalle: null };
    const med = mediane(ecarts); return { ecartType: arrondi(ecartType(ecarts)), p95: arrondi(percentile(ecarts.map(e => Math.abs(e - med)), 0.95)), intervalle: arrondi(med) };
  }
  /* Pertes de main : disparitions BRÈVES (0,1 à 3 s) d'une main qui était là, signe d'une détection qui décroche. */
  function pertesDeMain(frames) {
    let n = 0, depuisVide = null, derniereMain = null;
    for (const f of frames) {
      if (f.n > 0) { if (depuisVide !== null && derniereMain !== null) { const d = f.tp - derniereMain; if (d >= 100 && d <= 3000) n++; } depuisVide = null; derniereMain = f.tp; }
      else if (depuisVide === null) depuisVide = f.tp;
    }
    return n;
  }
  /* Tremblement au repos (px) : fenêtres de 1 s où le bout de l'index, sans filtre, reste dans un petit cercle (la main est RÉELLEMENT immobile), puis étendue de la position AFFICHÉE
     (95e centile de la distance au centre × 2). */
  function tremblement(trace) {
    const ref = trace.frames.filter(f => f.ref && f.n > 0), aff = trace.affiche && trace.affiche.length ? trace.affiche : trace.frames.filter(f => f.cur).map(f => [f.tp, f.cur[0], f.cur[1]]);
    if (ref.length < 20 || aff.length < 20) return { px: null, fenetres: 0 };
    const sortie = []; let i0 = 0;
    for (let i = 0; i < ref.length; i++) {   // fenêtre de 1,4 s sans mouvement de la main ; on ne mesure que la dernière seconde (le curseur a eu 0,4 s pour se poser)
      while (ref[i].tp - ref[i0].tp > 1400) i0++;
      if (ref[i].tp - ref[i0].tp < 1300) continue;
      const w = ref.slice(i0, i + 1), cx = moyenne(w.map(f => f.ref[0])), cy = moyenne(w.map(f => f.ref[1]));
      const rayon = Math.max(...w.map(f => Math.hypot(f.ref[0] - cx, f.ref[1] - cy)));
      if (rayon > 28 || w.some(f => f.pose && f.pose !== 'pointer')) continue;   // la main bouge, ou ce n'est pas un doigt pointé : pas un « repos »
      const debut = ref[i].tp - 1000, a = aff.filter(p => p[0] >= debut && p[0] <= ref[i].tp); if (a.length < 8) continue;
      const mx = moyenne(a.map(p => p[1])), my = moyenne(a.map(p => p[2])), d = a.map(p => Math.hypot(p[1] - mx, p[2] - my));
      sortie.push(2 * percentile(d, 0.95)); i0 = i;   // fenêtres indépendantes
    }
    return { px: sortie.length ? arrondi(mediane(sortie)) : null, fenetres: sortie.length };
  }
  /* Retard du curseur en mouvement (ms) : décalage qui rapproche le mieux la position AFFICHÉE de la position visée sans filtre. */
  function retardMouvement(trace) {
    const ref = trace.frames.filter(f => f.ref && f.n > 0 && f.cur);
    if (ref.length < 30) return null;
    const vit = []; for (let i = 1; i < ref.length; i++) { const dt = (ref[i].tp - ref[i - 1].tp) / 1000; vit.push(dt > 0 ? Math.hypot(ref[i].ref[0] - ref[i - 1].ref[0], ref[i].ref[1] - ref[i - 1].ref[1]) / dt : 0); }
    if (percentile(vit, 0.9) < 150) return null;   // pas assez de mouvement dans la trace pour juger
    const val = i => ref[i].tp, interp = (t, cle) => { let lo = 0, hi = ref.length - 1; if (t <= val(0)) return ref[0][cle]; if (t >= val(hi)) return ref[hi][cle]; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (val(m) <= t) lo = m; else hi = m; } const u = (t - val(lo)) / Math.max(1e-6, val(hi) - val(lo)); return [ref[lo][cle][0] + (ref[hi][cle][0] - ref[lo][cle][0]) * u, ref[lo][cle][1] + (ref[hi][cle][1] - ref[lo][cle][1]) * u]; };
    let meilleur = null;
    for (let L = 0; L <= 240; L += 8) {
      let s = 0, n = 0;
      for (let i = 1; i < ref.length; i++) { if (vit[i - 1] < 150) continue; const c = interp(ref[i].tp, 'cur'), r = interp(ref[i].tp - L, 'ref'); s += Math.hypot(c[0] - r[0], c[1] - r[1]); n++; }
      if (n < 10) continue; s /= n; if (!meilleur || s < meilleur.s) meilleur = { L, s };
    }
    return meilleur ? meilleur.L : null;
  }
  /* Clics SUSPECTS (faux déclenchements probables) : rebond (deux clics à moins de 180 ms), clic pendant une détection peu sûre, clic en pleine course de la main. */
  function clicsSuspects(trace) {
    const clics = (trace.actions || []).filter(a => a.a === 'clic'); let n = 0; const raisons = { rebond: 0, confiance: 0, vitesse: 0 };
    clics.forEach((c, i) => {
      const prec = clics[i - 1];
      if (prec && c.t - prec.t < 180 && c.n !== 2) { n++; raisons.rebond++; return; }
      const avant = trace.frames.filter(f => f.tp <= c.t && f.tp >= c.t - 200 && f.n > 0);
      if (avant.length >= 3 && moyenne(avant.map(f => f.conf == null ? 1 : f.conf)) < 0.55) { n++; raisons.confiance++; return; }
      const refs = avant.filter(f => f.ref); if (refs.length >= 3) { const a = refs[0], b = refs[refs.length - 1], dt = Math.max(0.03, (b.tp - a.tp) / 1000); if (Math.hypot(b.ref[0] - a.ref[0], b.ref[1] - a.ref[1]) / dt > 1800) { n++; raisons.vitesse++; } }
    });
    return { clics: clics.length, suspects: n, raisons };
  }
  function calculer(trace) {
    const fr = trace.frames || [], duree = Math.max(1, (trace.duree != null ? trace.duree : (fr.length ? fr[fr.length - 1].tp - fr[0].tp : 0))) / 1000;
    const tel = trace.tel || [], rendu = trace.rendu || [];
    const lat = fr.filter(f => f.lat != null && f.n > 0).map(f => f.lat + (f.aff || 0)), lat0 = fr.filter(f => f.lat != null && f.n > 0);
    const deb = debits(fr), per = pertes(fr), gig = gigue(fr), tre = tremblement(trace), act = trace.actions || [], cl = clicsSuspects(trace);
    const fpsRendu = rendu.length ? 1000 / mediane(rendu) : null, pire1 = rendu.length ? 1000 / percentile(rendu, 0.99) : null;
    const comp = name => { const v = lat0.map(f => name === 'tel' ? f.dt : name === 'reseau' ? Math.max(0, f.lat - (f.dt || 0)) : name === 'pc' ? (f.mot || 0) : (f.aff || 0)); return arrondi(mediane(v)); };
    return {
      duree: arrondi(duree), images: fr.length,
      debit: { mediane: deb.mediane, p5: deb.p5, min: deb.min, sous30: deb.sous30 == null ? null : arrondi(deb.sous30, 2) },
      perte: per.perte == null ? null : arrondi(per.perte, 3), gigue: gig, pertesDeMain: pertesDeMain(fr),
      delai: { p50: arrondi(mediane(lat)), p95: arrondi(percentile(lat, 0.95)), composantes: { telephone: comp('tel'), reseau: comp('reseau'), moteurPc: comp('pc'), affichage: comp('aff') } },
      camera: { fps: arrondi(mediane(tel.map(s => s.cam))), min: arrondi(Math.min(...nombres(tel.map(s => s.cam))) === Infinity ? null : Math.min(...nombres(tel.map(s => s.cam)))) },
      detection: { fps: arrondi(mediane(tel.map(s => s.det))), msParImage: arrondi(mediane(tel.map(s => s.detMs))), msP95: arrondi(percentile(tel.map(s => s.detMs), 0.95)), tendance: tendance(tel.map(s => s.det)) },
      telephone: { batterie: dernier(tel, 'bat'), enCharge: dernier(tel, 'charge'), economie: dernier(tel, 'eco'), resolution: dernier(tel, 'res'), calcul: dernier(tel, 'calcul'), thermique: dernier(tel, 'thermique') },
      rendu: { fps: arrondi(fpsRendu), pire1pc: arrondi(pire1) },
      moteurMs: arrondi(mediane(fr.filter(f => f.mot != null).map(f => f.mot)), 2),
      tremblementPx: tre.px, tremblementFenetres: tre.fenetres, retardMs: retardMouvement(trace),
      actions: { total: act.length, parType: act.reduce((o, a) => { o[a.a] = (o[a.a] || 0) + 1; return o; }, {}) },
      clics: cl.clics, clicsSuspects: cl.suspects, fauxParMinute: arrondi(cl.suspects / (duree / 60), 2), raisonsSuspects: cl.raisons
    };
  }
  const dernier = (l, k) => { for (let i = l.length - 1; i >= 0; i--) if (l[i] && l[i][k] != null) return l[i][k]; return null; };
  /* Chute de cadence entre le premier et le dernier tiers (limitation thermique du téléphone) : fraction perdue, 0 si stable. */
  function tendance(v) { const s = nombres(v); if (s.length < 9) return null; const t = Math.floor(s.length / 3), a = mediane(s.slice(0, t)), b = mediane(s.slice(-t)); return a > 0 ? arrondi(Math.max(0, (a - b) / a), 2) : null; }

  // ── analyse en français ──
  const OBJECTIFS = { debitMedian: 45, debitMin: 30, delaiP95: 80, tremblementPx: 2, fauxParMinute: 1, cibles: 0.95 };
  /* Retourne { goulot, resume, constats:[{ id, gravite, titre, detail, correction:{ libelle, page, tel, option } | null }], objectifs:[{nom, valeur, cible, ok}] }.
     `page` = réglages de la page Rayle (Gestes.regler), `tel` = réglages envoyés au téléphone. `contexte` : { calculPossibleSurPc, modePc, resolutionsDisponibles }. */
  function analyser(m, contexte = {}) {
    const C = [], ctx = Object.assign({ calculPossibleSurPc: true, modePc: false, nbMainsTel: 2 }, contexte), RES = [320, 480, 640];
    const res = m.telephone && m.telephone.resolution ? +m.telephone.resolution : 640, resInf = RES.filter(r => r < res).pop();
    const det = m.detection || {}, deb = m.debit || {}, del = m.delai || {}, comp = del.composantes || {};
    const camFps = m.camera && m.camera.fps, detLente = !ctx.modePc && det.fps != null && (det.msParImage > 22 || (det.fps < 40 && (camFps == null || camFps - det.fps >= 8)));   // la détection suit la caméra mais la caméra est lente : ce n'est pas la détection
    if (detLente) {
      const prop = { tel: {}, libelle: '' };
      if (resInf) { prop.tel.res = resInf; prop.libelle = 'Baisser la résolution de la caméra du téléphone à ' + resInf + ' × ' + Math.round(resInf * 0.75); }
      if (ctx.nbMainsTel > 1) { prop.tel.mains = 1; prop.libelle += (prop.libelle ? ', ' : 'Détecter ') + 'une seule main'; }
      if (!m.telephone.economie) { prop.tel.eco = true; prop.libelle += (prop.libelle ? ' et ' : 'Couper ') + 'l’aperçu du téléphone'; }
      const aucune = !Object.keys(prop.tel).length;
      C.push({ id: 'detection-telephone', gravite: det.fps < 25 ? 'rouge' : 'orange', titre: 'Goulot d’étranglement : détection sur le téléphone (' + det.fps + ' images/s, ' + det.msParImage + ' ms par image)',
        detail: aucune ? 'Le téléphone est déjà au plus léger. Le mode « calcul sur le PC » enlève ce goulot (la vidéo part en direct vers le PC, jamais via un serveur).' : 'La détection de la main sur le téléphone est trop lente pour tenir 45 paquets par seconde.',
        correction: aucune ? (ctx.calculPossibleSurPc ? { libelle: 'Passer en « calcul sur le PC » (vidéo en direct téléphone → PC, jamais enregistrée)', tel: { calcul: 'pc' }, option: 'confidentialite' } : null) : { libelle: prop.libelle, tel: prop.tel } });
    }
    if (m.camera && m.camera.fps != null && m.camera.fps < 40 && !detLente) {
      C.push({ id: 'camera-lumiere', gravite: m.camera.fps < 24 ? 'rouge' : 'orange', titre: 'Caméra du téléphone à ' + m.camera.fps + ' images/s', detail: 'Souvent un manque de lumière : la caméra allonge le temps de pose et baisse sa cadence. Plus de lumière sur la main, 40 à 60 cm du téléphone.', correction: { libelle: 'Régler la caméra pour privilégier la cadence', tel: { cadence: true } } });
    }
    if (det.tendance != null && det.tendance >= 0.25 && !ctx.modePc) {
      C.push({ id: 'thermique', gravite: 'orange', titre: 'Cadence qui s’effondre avec le temps (−' + Math.round(det.tendance * 100) + ' %)', detail: 'Le téléphone chauffe et se bride tout seul. Le mode économe garde la fluidité plus longtemps.', correction: { libelle: 'Passer en mode économe (résolution réduite, aperçu coupé)', tel: { eco: true, res: Math.min(res, 480) } } });
    }
    if (m.telephone && m.telephone.batterie != null && m.telephone.batterie < 0.2 && !m.telephone.enCharge) {
      C.push({ id: 'batterie', gravite: 'orange', titre: 'Batterie du téléphone basse (' + Math.round(m.telephone.batterie * 100) + ' %)', detail: 'Le système réduit les performances quand la batterie est faible. Branche le téléphone.', correction: null });
    }
    if ((m.gigue && m.gigue.p95 != null && m.gigue.p95 > 30) || (m.perte != null && m.perte > 0.05)) {
      const g = m.gigue && m.gigue.p95;
      C.push({ id: 'reseau', gravite: (g > 60 || m.perte > 0.15) ? 'rouge' : 'orange', titre: 'Réseau : ' + (g != null ? 'gigue de ' + g + ' ms' : '') + (m.perte > 0.05 ? (g != null ? ', ' : '') + Math.round(m.perte * 100) + ' % de paquets perdus' : ''),
        detail: 'Le Wi-Fi arrive par à-coups. Rapproche le téléphone du routeur, passe en 5 GHz. Le curseur peut absorber une partie de la gigue avec un petit tampon.',
        correction: { libelle: 'Ajouter un tampon d’interpolation de ' + Math.min(70, Math.round(g || 30)) + ' ms au curseur', page: { tamponMs: Math.min(70, Math.round(g || 30)) } } });
    }
    if (m.retardMs != null && m.retardMs > 60) {
      C.push({ id: 'lissage', gravite: m.retardMs > 110 ? 'rouge' : 'orange', titre: 'Lissage trop fort : retard de ' + m.retardMs + ' ms', detail: 'Le curseur traîne derrière la main en mouvement. On diminue le lissage et on augmente la prédiction.',
        correction: { libelle: 'Lissage plus léger, prédiction plus longue', page: { lissage: 0.3, predictionMs: 45 } } });
    }
    if (m.tremblementPx != null && m.tremblementPx > OBJECTIFS.tremblementPx) {
      C.push({ id: 'tremblement', gravite: m.tremblementPx > 5 ? 'rouge' : 'orange', titre: 'Tremblement du curseur au repos : ' + m.tremblementPx + ' px (objectif < 2 px)', detail: 'La main est immobile mais le curseur bouge encore. On augmente le lissage à l’arrêt (le filtre reste vif en mouvement rapide).',
        correction: { libelle: 'Lissage plus fort à l’arrêt', page: { lissage: Math.min(0.85, 0.65) } } });
    }
    if (m.fauxParMinute != null && m.fauxParMinute >= OBJECTIFS.fauxParMinute) {
      const r = m.raisonsSuspects || {}, plus = Object.entries(r).sort((a, b) => b[1] - a[1])[0];
      C.push({ id: 'faux-clics', gravite: m.fauxParMinute >= 3 ? 'rouge' : 'orange', titre: 'Seuil de pincement trop bas : ' + m.clicsSuspects + ' clic' + (m.clicsSuspects > 1 ? 's' : '') + ' suspect' + (m.clicsSuspects > 1 ? 's' : '') + ' (' + m.fauxParMinute + ' par minute)',
        detail: 'Plus fréquent : ' + ({ rebond: 'le pincement qui « rebondit » (deux clics à la suite)', confiance: 'une détection peu sûre', vitesse: 'un clic pendant que la main bouge vite' }[plus && plus[0]] || 'clics isolés') + '. On rend le pincement plus exigeant.',
        correction: { libelle: 'Pincement plus exigeant (sensibilité −15 %)', page: { sensibiliteClic: 0.85 } } });
    }
    if (del.p95 != null && del.p95 > OBJECTIFS.delaiP95 && !C.some(c => c.id === 'reseau' || c.id === 'detection-telephone')) {
      const plus = Object.entries(comp).filter(e => e[1] != null).sort((a, b) => b[1] - a[1])[0];
      C.push({ id: 'delai', gravite: del.p95 > 140 ? 'rouge' : 'orange', titre: 'Délai de bout en bout : ' + del.p95 + ' ms au 95e centile (objectif < 80)', detail: 'Plus grosse part : ' + ({ telephone: 'détection sur le téléphone', reseau: 'transport réseau', moteurPc: 'traitement sur le PC', affichage: 'affichage' }[plus && plus[0]] || '—') + ' (' + (plus ? plus[1] : '—') + ' ms).', correction: null });
    }
    if (m.rendu && m.rendu.fps != null && m.rendu.fps < 50) {
      C.push({ id: 'rendu-pc', gravite: 'orange', titre: 'Le PC affiche ' + m.rendu.fps + ' images/s', detail: 'Rayle ou un autre programme occupe la carte graphique : le curseur ne peut pas être plus fluide que l’écran. Ferme les programmes lourds ou active le mode jeu.', correction: null });
    }
    const ordre = { rouge: 0, orange: 1, vert: 2 }; C.sort((a, b) => ordre[a.gravite] - ordre[b.gravite]);
    const objectifs = [
      { nom: 'Paquets/s (médiane)', valeur: deb.mediane, cible: '≥ ' + OBJECTIFS.debitMedian, ok: deb.mediane == null ? null : deb.mediane >= OBJECTIFS.debitMedian },
      { nom: 'Paquets/s (minimum)', valeur: deb.min, cible: '≥ ' + OBJECTIFS.debitMin, ok: deb.min == null ? null : deb.min >= OBJECTIFS.debitMin },
      { nom: 'Délai bout en bout (95e centile)', valeur: del.p95, cible: '< ' + OBJECTIFS.delaiP95 + ' ms', ok: del.p95 == null ? null : del.p95 < OBJECTIFS.delaiP95 },
      { nom: 'Tremblement au repos', valeur: m.tremblementPx, cible: '< ' + OBJECTIFS.tremblementPx + ' px', ok: m.tremblementPx == null ? null : m.tremblementPx < OBJECTIFS.tremblementPx },
      { nom: 'Faux clics par minute', valeur: m.fauxParMinute, cible: '< ' + OBJECTIFS.fauxParMinute, ok: m.fauxParMinute == null ? null : m.fauxParMinute < OBJECTIFS.fauxParMinute }
    ];
    if (deb.mediane != null && deb.mediane < OBJECTIFS.debitMedian && !C.length) C.push({ id: 'debit-inconnu', gravite: 'orange', titre: 'Débit de ' + deb.mediane + ' paquets/s sans cause évidente', detail: 'Aucune mesure du téléphone n’est arrivée (téléphone ancien ou liaison par le Worker). Vérifie que la page caméra est à jour.', correction: null });
    const goulot = C.length ? C[0].titre : 'Aucun goulot : toutes les mesures sont dans les objectifs.';
    return { goulot, resume: C.length ? C.length + ' point' + (C.length > 1 ? 's' : '') + ' à corriger' : 'Tout est dans les objectifs.', constats: C, objectifs };
  }

  // ── dégradation d'une trace (gigue, pertes, cadence) pour tester la robustesse ──
  function alea(g) { let s = g >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* frames : [{ t, ratio, mains }] (temps du téléphone). Renvoie les trames avec une heure d'ARRIVÉE `tp`, dans l'ordre d'arrivée.
     opts : ips (ne garde qu'une trame sur n pour tomber à cette cadence), gigue (écart-type de l'arrivée, ms), perte (0…1), retard (ms constant), graine. */
  function degrader(frames, { ips = null, gigue = 0, perte = 0, retard = 0, graine = 1 } = {}) {
    const r = alea(graine), gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
    let src = frames;
    if (ips) { const pas = 1000 / ips; let prochain = src.length ? src[0].t : 0; src = src.filter(f => { if (f.t >= prochain) { prochain = f.t + pas; return true; } return false; }); }
    let seq = 0; const out = [];
    for (const f of src) {
      seq = (seq + 1) & 0xFFFF; if (perte > 0 && r() < perte) continue;
      out.push({ ...f, seq, tp: f.t + retard + Math.max(0, gigue ? gauss() * gigue + gigue : 0) });
    }
    out.sort((a, b) => a.tp - b.tp);
    // le canal non ordonné de la liaison directe : une trame arrivée plus tard que la suivante est ÉCARTÉE par le PC (jamais traitée en retard)
    const gardees = []; let seqMax = -1; for (const f of out) { if (f.t > seqMax) { gardees.push(f); seqMax = f.t; } }
    return gardees;
  }

  // ── rejeu d'une trace dans le moteur : mesures comparables avant/après ──
  /* trace.frames doit porter `mains` (points). Renvoie une trace NOUVELLE (celle que le moteur produit avec ces réglages), prête pour `calculer`. */
  function rejouer(trace, optionsMoteur = {}, { rendu = null } = {}) {
    const V = GV5(); if (!V) throw new Error('moteur V5 absent');
    const ecran = trace.ecran || { l: 1920, h: 1080 }, m = V.creerMoteur(Object.assign({ ecran, exigerEngagement: false }, trace.moteur || {}, optionsMoteur));
    const sortie = { version: 1, origine: 'rejeu', ecran, duree: trace.duree, frames: [], actions: [], evenements: [], rendu: trace.rendu, tel: trace.tel, affiche: [] };
    let t0 = null;
    for (const f of trace.frames) {
      if (!f.mains) continue; if (t0 === null) t0 = f.tp;
      const horloge = f.t != null ? f.t : f.tp; const s = m.traiter({ t: horloge, ratio: f.ratio || 4 / 3, mains: f.mains });
      const cur = [...s.actions].reverse().find(a => a.a === 'curseur' || a.a === 'deplace');
      for (const a of s.actions) if (a.a === 'clic' || a.a === 'prise' || a.a === 'ranger' || a.a === 'fermer' || a.a === 'accueil') sortie.actions.push({ t: f.tp, a: a.a, n: a.n, x: a.x, y: a.y });
      for (const e of s.evenements) sortie.evenements.push({ t: f.tp, type: e.type });
      const main = f.mains[0], ref = main ? refEcran(main, m.options, ecran) : null;
      sortie.frames.push({ tp: f.tp, tt: f.t, seq: f.seq, dt: f.dt || 0, n: f.mains.length, conf: f.conf, lat: f.lat, mot: 0, aff: 0, ref, cur: cur ? [cur.x, cur.y] : (s.etat && s.etat.curseur ? [s.etat.curseur.x, s.etat.curseur.y] : null), pose: s.etat && s.etat.pose, mains: f.mains });
      if (cur) sortie.affiche.push([f.tp, cur.x, cur.y]);
    }
    if (rendu) sortie.affiche = simulerRendu(sortie.frames.filter(f => f.cur).map(f => ({ ta: f.tp, t: f.tt != null ? f.tt : f.tp, x: f.cur[0], y: f.cur[1] })), rendu).positions;
    return sortie;
  }
  function refEcran(main, o, ecran) {
    const V = GV5(), p = main.pts[8], ratio = o.ratio || 4 / 3, u = (o.miroir ? 1 - p[0] : p[0]);
    return V.versEcran(u, p[1], Object.assign({}, o, { ecran, zone: o.zone }));
  }

  // ── rendu du curseur à la cadence de l'écran : interpolation + prédiction courte (module pur, utilisé par gestes-v5-actions.js) ──
  /* Entrée : des positions qui arrivent par à-coups (30 à 60 Hz, avec de la gigue). Sortie : une position à CHAQUE image de l'écran (60 à 144 Hz), sans saut.
     Principe : vitesse estimée sur les deux dernières mesures, extrapolation bornée à `predictionMax` ms, puis rattrapage exponentiel (constante `tau`) pour que l'arrivée d'une
     mesure corrigeant l'extrapolation ne fasse jamais « sauter » l'anneau. `tampon` (ms) retarde volontairement pour absorber la gigue (réglable : « tamponMs »). */
  function creerRendu({ predictionMax = 45, tau = 16, tampon = 0, tele = 220, avance = 8 } = {}) {
    let a = null, b = null, pos = null, tPos = 0, o = { predictionMax, tau, tampon, tele, avance };
    return {
      echantillon(t, x, y) { const p = { t, x, y }; if (b && t <= b.t) return; if (b && t - b.t > 400) { a = null; pos = null; } else a = b; b = p; },   // après une longue absence on repart de la nouvelle position (pas de glissade depuis l'ancienne)
      /* Position à afficher à l'instant `t` (même horloge que `echantillon`). */
      position(t) {
        if (!b) return null;
        let cible;
        const tt = t - o.tampon;
        if (!a) cible = { x: b.x, y: b.y };
        else if (Math.hypot(b.x - a.x, b.y - a.y) > o.tele * Math.max(1, (b.t - a.t) / 16)) { cible = { x: b.x, y: b.y }; pos = null; }   // saut volontaire (clic, prise, aimantation forte) : pas de glissade
        else {
          const dt = Math.max(1, b.t - a.t), vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt, age = tt - b.t;
          const e = Math.max(0, Math.min(age + o.avance, o.predictionMax));   // on ne prédit jamais plus de predictionMax au-delà de la dernière mesure
          cible = { x: b.x + vx * e, y: b.y + vy * e };
        }
        if (!pos) { pos = { x: cible.x, y: cible.y }; tPos = t; return pos; }
        const dt = Math.max(0, t - tPos), k = 1 - Math.exp(-dt / Math.max(1, o.tau)); tPos = t;
        pos = { x: pos.x + (cible.x - pos.x) * k, y: pos.y + (cible.y - pos.y) * k };
        return pos;
      },
      regler(p) { Object.assign(o, p); }, reinitialiser() { a = b = pos = null; }
    };
  }
  /* Simule l'écran : `hz` images/s, positions d'entrée { ta (arrivée), t (mesure), x, y }. Renvoie la position affichée à chaque image, le plus grand saut et les statistiques de retard. */
  function simulerRendu(entrees, { hz = 120, naif = false, predictionMax, tau, tampon, avance } = {}) {
    if (!entrees.length) return { positions: [], sautMax: 0, sautP99: 0 };
    const decal = Math.min(...entrees.map(e => e.ta - (e.t != null ? e.t : e.ta)));
    const dts = []; for (let i = 1; i < entrees.length; i++) { const d = (entrees[i].t != null ? entrees[i].t - entrees[i - 1].t : entrees[i].ta - entrees[i - 1].ta); if (d > 0 && d < 500) dts.push(d); }
    const dtm = dts.length ? mediane(dts) : 16, fCad = Math.max(0, Math.min(1, (1000 / dtm - 12) / 18));   // comme la page : la prédiction s'éteint sous 20 images/s   // comme la page : l'heure de mesure est ramenée à l'horloge de l'écran par le paquet le moins retardé
    const r = creerRendu({ predictionMax: (predictionMax != null ? predictionMax : 45) * (naif ? 1 : fCad), tau, tampon, avance: (avance != null ? avance : 8) * (naif ? 1 : fCad) }), pas = 1000 / hz, t0 = entrees[0].ta, t1 = entrees[entrees.length - 1].ta + 100, positions = []; let k = 0, derniere = null, sauts = [];
    for (let t = t0; t <= t1; t += pas) {
      while (k < entrees.length && entrees[k].ta <= t) { r.echantillon(Math.min(entrees[k].ta, (entrees[k].t != null ? entrees[k].t : entrees[k].ta) + decal), entrees[k].x, entrees[k].y); derniere = entrees[k]; k++; }
      if (!derniere) continue;
      const p = naif ? { x: derniere.x, y: derniere.y } : r.position(t); if (!p) continue;
      if (positions.length) sauts.push(Math.hypot(p.x - positions[positions.length - 1][1], p.y - positions[positions.length - 1][2]));
      positions.push([t, p.x, p.y]);
    }
    return { positions, sautMax: sauts.length ? Math.max(...sauts) : 0, sautP99: percentile(sauts, 0.99) || 0, images: positions.length };
  }

  // ── auto-calibrage du filtre sur une trace : le plus léger qui tient le tremblement sous 2 px ──
  function calibrerFiltre(trace, { candidats = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9], tremblementMax = 2, retardMax = 70 } = {}) {
    const essais = candidats.map(l => { const t = rejouer(trace, { lissage: l }), m = calculer(t); return { lissage: l, tremblementPx: m.tremblementPx, retardMs: m.retardMs }; });
    const valables = essais.filter(e => (e.tremblementPx == null || e.tremblementPx <= tremblementMax) && (e.retardMs == null || e.retardMs <= retardMax));
    const choix = valables.length ? valables.reduce((a, b) => (a.lissage <= b.lissage ? a : b)) : essais.reduce((a, b) => ((a.tremblementPx == null ? 1e9 : a.tremblementPx) + (a.retardMs || 0) / 20 <= (b.tremblementPx == null ? 1e9 : b.tremblementPx) + (b.retardMs || 0) / 20 ? a : b));
    return { lissage: choix.lissage, tenu: valables.length > 0, essais };
  }

  /* Recherche des seuils de pincement qui maximisent les clics voulus sans dépasser `fauxMax` faux clics par minute. `intentions` : instants (ms de la trace) des clics VOULUS (trace étiquetée, mini-jeu ou simulation).
     Un clic est « réussi » s'il tombe à moins de `fenetre` ms d'une intention, « faux » sinon. */
  function optimiserSeuils(trace, intentions, { fauxMax = 1, fenetre = 350, grille = null } = {}) {
    const g = grille || [[0.24, 0.38], [0.27, 0.42], [0.30, 0.45], [0.33, 0.48], [0.36, 0.52]], minutes = Math.max(1 / 60, (trace.duree || 1) / 60000), res = [];
    for (const [f, o] of g) {
      const t = rejouer(trace, { seuilFerme: f, seuilOuvre: o }), clics = t.actions.filter(a => a.a === 'clic');
      const ok = intentions.filter(i => clics.some(c => Math.abs(c.t - i) <= fenetre)).length, faux = clics.filter(c => !intentions.some(i => Math.abs(c.t - i) <= fenetre)).length;
      res.push({ seuilFerme: f, seuilOuvre: o, rappel: intentions.length ? ok / intentions.length : null, faux, fauxParMinute: faux / minutes });
    }
    const bons = res.filter(r => r.fauxParMinute < fauxMax).sort((a, b) => (b.rappel || 0) - (a.rappel || 0));
    return { choix: bons[0] || res.slice().sort((a, b) => a.fauxParMinute - b.fauxParMinute)[0], essais: res, fauxTenu: bons.length > 0 };
  }

  // ── comparaison « calcul sur le téléphone » / « calcul sur le PC » ──
  /* Note d'un mode (plus haut = mieux) : débit utile, moins le délai au-delà de 40 ms, les pertes de main et les paquets perdus. */
  function noterMode(m) {
    if (!m || m.debit.mediane == null) return 0; const d = m.delai.p95 == null ? 60 : m.delai.p95;
    return m.debit.mediane - Math.max(0, d - 40) * 0.4 - m.pertesDeMain * 2 - (m.perte || 0) * 60;
  }
  /* Recommande un mode d'après deux mesures. Le PC doit gagner nettement (plus de 3 points) : sinon on reste sur le téléphone, qui garde la confidentialité maximale (points seulement). */
  function recommander(mTel, mPc) {
    const a = noterMode(mTel), b = noterMode(mPc), meilleur = b > a + 3 ? 'pc' : 'telephone', f = x => (x == null ? '—' : x);
    if (mTel.debit.mediane == null && mPc.debit.mediane == null) return { meilleur: 'telephone', na: a, nb: b, raison: 'Aucune main n’a été vue pendant les deux mesures : refais la comparaison en faisant tes gestes devant la caméra (en attendant, le téléphone garde la confidentialité maximale).', sansMesure: true };
    const raison = meilleur === 'pc' ? 'Le PC tient ' + f(mPc.debit.mediane) + ' paquets/s (délai ' + f(mPc.delai.p95) + ' ms) contre ' + f(mTel.debit.mediane) + ' sur le téléphone (délai ' + f(mTel.delai.p95) + ' ms).'
      : (b > a - 3 ? 'Les deux modes se valent (' + f(mTel.debit.mediane) + ' et ' + f(mPc.debit.mediane) + ' paquets/s) : le téléphone suffit et garde la confidentialité maximale.' : 'Le téléphone fait mieux (' + f(mTel.debit.mediane) + ' contre ' + f(mPc.debit.mediane) + ' paquets/s).');
    return { meilleur, na: a, nb: b, raison };
  }

  // ── mini-jeu « Cibles » : score objectif ──
  /* essais : [{ taille (px), reussi (bool), ms (durée jusqu'au clic), erreur (px, distance au centre) }] */
  function scoreCibles(essais) {
    if (!essais.length) return { essais: 0, reussite: null, tempsMoyen: null, precisionPx: null, parTaille: {}, ok: null };
    const ok = essais.filter(e => e.reussi), par = {};
    for (const e of essais) { const k = String(e.taille), b = par[k] || (par[k] = { essais: 0, reussis: 0 }); b.essais++; if (e.reussi) b.reussis++; }
    for (const k of Object.keys(par)) par[k].taux = arrondi(par[k].reussis / par[k].essais, 2);
    const grandes = essais.filter(e => e.taille >= 48), tauxGrandes = grandes.length ? grandes.filter(e => e.reussi).length / grandes.length : null;
    return { essais: essais.length, reussite: arrondi(ok.length / essais.length, 3), reussiteCibles48: tauxGrandes == null ? null : arrondi(tauxGrandes, 3), tempsMoyen: arrondi(moyenne(ok.map(e => e.ms)), 0), precisionPx: arrondi(moyenne(ok.map(e => e.erreur)), 1), parTaille: par, ok: tauxGrandes == null ? null : tauxGrandes >= OBJECTIFS.cibles };
  }

  // ── enregistreur de trace (côté page : appelé à chaque trame, aucune allocation inutile) ──
  function creerEnregistreur({ maxFrames = 9000, avecPoints = true } = {}) {
    const T = { version: 1, origine: 'reel', debut: new Date().toISOString(), ecran: null, duree: 0, prefs: null, frames: [], tel: [], rendu: [], affiche: [], actions: [], evenements: [], decalage: null };
    let t0 = null, dernierAff = -1e9;
    return {
      trace: T,
      entete(o) { Object.assign(T, o); },
      trame(f) { if (t0 === null) t0 = f.tp; if (T.frames.length >= maxFrames) return; T.frames.push({ ...f, tp: +(f.tp - t0).toFixed(2), mains: avecPoints ? f.mains : undefined }); },
      tel(s) { if (t0 === null) return; T.tel.push({ ...s, t: s.t != null ? s.t : T.tel.length }); },
      rendu(dt) { if (T.rendu.length < 60000) T.rendu.push(+dt.toFixed(2)); },
      affiche(t, x, y) { if (t0 === null) return; const tt = t - t0; if (tt - dernierAff < 16) return; dernierAff = tt; if (T.affiche.length < 12000) T.affiche.push([+tt.toFixed(1), +x.toFixed(1), +y.toFixed(1)]); },
      action(t, a) { if (t0 === null) return; T.actions.push({ t: +(t - t0).toFixed(1), ...a }); },
      evenement(t, type) { if (t0 === null) return; T.evenements.push({ t: +(t - t0).toFixed(1), type }); },
      fin(duree) { T.duree = duree != null ? duree : (T.frames.length ? T.frames[T.frames.length - 1].tp : 0); return T; },
      origine: () => t0
    };
  }
  /* Allège une trace pour le stockage : points arrondis à 4 décimales (≈ 0,3 px d'écran). */
  function compacter(trace) { return JSON.stringify(trace, (k, v) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10000) / 10000 : v); }

  racine.FluiditeCalcul = { refEcran, OBJECTIFS, percentile, mediane, moyenne, ecartType, calculer, analyser, degrader, rejouer, creerRendu, simulerRendu, calibrerFiltre, optimiserSeuils, scoreCibles, noterMode, recommander, creerEnregistreur, compacter, debits, pertes, gigue, tremblement, retardMouvement, clicsSuspects, tendance };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.FluiditeCalcul;
})(typeof globalThis !== 'undefined' ? globalThis : window);
