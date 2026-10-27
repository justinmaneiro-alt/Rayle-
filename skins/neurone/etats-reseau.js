/* ═════════════ ÉTATS DE L'ENTITÉ RAYLÉ (module pur, testé sous Node : galaxie/tests/etats-reseau-test.mjs) ═════════════
   Source UNIQUE de l'apparence de l'entité : le soleil de la galaxie (galaxie/soleil.js, Three.js) et l'entité de l'accueil
   (skins/neurone/entite-reseau.js, WebGL natif) lisent ici les mêmes états, les mêmes couleurs, la même vie.
   Aucune dépendance au navigateur.
   Vie de l'entité :
   · veille : respiration lente, dérive organique, étincelles de neurones au hasard, petites vagues qui traversent le nuage,
     et de temps en temps une « pensée » spontanée (flash du réseau, éclair interne, rafale d'étincelles) ;
   · écoute : les filaments se resserrent vers le cœur, l'entité s'éclaire au rythme de la voix ;
   · réflexion : tourbillon, impulsions rapides le long des connexions, violet ;
   · parole : pulsations suivant l'amplitude de la voix, une vague part du cœur à chaque pic ;
   · alerte : secousse courte, vague et flash orange ;
   · regard : légère inclinaison vers le curseur ou le doigt ; une onde à chaque clic ou toucher ;
   · naissance : le nuage se forme du cœur vers l'extérieur (séquence de démarrage).
   Tous les changements passent par un lissage : jamais de saut brusque.
   « deverrouille » (accès déverrouillé : vert et or) et « verrouille » (Worker absent ou accès refusé : gris) servent à l'accueil. */
export const ETATS = {
  idle:         { c: [.28, .78, 1.0], d: [.86, .97, 1.0], agite: .12, tour: .10, rayon: .69, lum: .55, vitesse: .7,  flash: 11,  serre: 0,  tourb: 0,  pulse: 1,   etinc: 1,   voix: .3, vague: 7 },
  veille:       { c: [.30, .82, 1.0], d: [.88, .98, 1.0], agite: .18, tour: .14, rayon: .71, lum: .75, vitesse: .8,  flash: 8,   serre: 0,  tourb: 0,  pulse: 1,   etinc: 1.2, voix: .3, vague: 6 },
  listening:    { c: [.30, .85, 1.0], d: [.90, .98, 1.0], agite: .35, tour: .28, rayon: .62, lum: 1.05, vitesse: 1.2, flash: 5,  serre: .7, tourb: 0,  pulse: 1.1, etinc: .5,  voix: .9, vague: 0 },
  thinking:     { c: [.78, .42, 1.0], d: [1.0, .45, .80], agite: .55, tour: .6,  rayon: .66, lum: .95, vitesse: 1.6, flash: 3,   serre: .3, tourb: .9, pulse: 2.6, etinc: 1.6, voix: .3, vague: 0 },
  speaking:     { c: [1.0, .25, .65], d: [.75, .35, 1.0], agite: .30, tour: .22, rayon: .69, lum: 1.15, vitesse: 1.5, flash: 2.5, serre: 0, tourb: 0,  pulse: 1.4, etinc: .8,  voix: .5, vague: 0 },
  alerte:       { c: [1.0, .40, .08], d: [1.0, .15, .20], agite: .95, tour: .55, rayon: .71, lum: 1.30, vitesse: 3.2, flash: 1.5, serre: 0, tourb: .3, pulse: 2.2, etinc: 2.2, voix: .6, vague: 0 },
  deverrouille: { c: [.25, .95, .55], d: [.95, .85, .30], agite: .14, tour: .12, rayon: .70, lum: .85, vitesse: .8,  flash: 9,   serre: 0,  tourb: 0,  pulse: 1,   etinc: 1,   voix: .3, vague: 8 },
  verrouille:   { c: [.50, .50, .58], d: [.35, .35, .45], agite: 0,   tour: .04, rayon: .53, lum: .32, vitesse: .4,  flash: 1e6, serre: 0,  tourb: 0,  pulse: .6,  etinc: 0,   voix: .2, vague: 0 }
};
export const CLES = ['agite', 'tour', 'rayon', 'lum', 'vitesse', 'serre', 'tourb', 'pulse', 'etinc', 'voix'];
/* Couleur du flash : blanc, sauf en alerte (orange) et en réflexion (blanc violet) */
export const COULEUR_FLASH = { alerte: [1.0, .72, .38], thinking: [.97, .88, 1.0], speaking: [1.0, .92, .97] };
const BLANC = [1, 1, 1];
/* Cascades d'impulsions nerveuses par état : cadence (par seconde, en mode complet), vitesse (unités du nuage par seconde), force, type
   (0 = onde qui part d'un point quelconque du nuage, y compris la périphérie ; 1 = cône qui converge vers le cœur ; 2 = cône qui part du cœur),
   durée de l'impulsion (s) et couleur (sRGB). */
export const CASCADES = {
  idle:         { rate: .3, vit: .55, force: .5, type: 0, larg: .24, col: [.72, .94, 1.0] },
  veille:       { rate: .42, vit: .60, force: .55, type: 0, larg: .24, col: [.74, .95, 1.0] },
  listening:    { rate: 1.7, vit: .95, force: .75, type: 1, larg: .20, col: [.86, 1.0, 1.0] },
  thinking:     { rate: 3.6, vit: 1.5, force: .85, type: 0, larg: .14, col: [.84, .52, 1.0] },
  speaking:     { rate: .9,  vit: 1.1, force: .65, type: 2, larg: .20, col: [1.0, .62, .88] },
  alerte:       { rate: 5.0, vit: 2.4, force: 1.0, type: 0, larg: .10, col: [1.0, .62, .22] },
  deverrouille: { rate: .5,  vit: .55, force: .55, type: 0, larg: .24, col: [.62, 1.0, .72] },
  verrouille:   { rate: 0,   vit: .5,  force: .3,  type: 0, larg: .24, col: [.6, .6, .7] }
};
const TAU = Math.PI * 2;

/* Les couleurs sont écrites telles qu'affichées (sRGB) ; le rendu travaille en linéaire (même conversion que THREE.Color.setRGB(…, SRGBColorSpace)). */
export const srgbVersLineaire = c => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));

/* Amplitude simulée selon l'état quand aucune amplitude réelle n'est fournie (comme entite.js). */
export function ampSimulee(nom, t) {
  if (nom === 'speaking') return .30 + .40 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1)) + .1 * Math.sin(t * 17);
  if (nom === 'listening') return .10 + .12 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 1.3));
  if (nom === 'alerte') return .35 + .35 * Math.abs(Math.sin(t * 9));
  return 0;
}
const facile = x => 1 - Math.pow(1 - x, 3);   // décélération douce (naissance)

/* Machine d'état : on lui donne le temps (t, dt) et elle remplit `v`, les valeurs prêtes à envoyer aux shaders. */
export function creerEtat(rayon, alea = Math.random) {
  let nom = 'idle', cible = ETATS.idle, ampExt = null;
  const actuel = JSON.parse(JSON.stringify(ETATS.idle));
  actuel.fc = BLANC.slice();
  let amp = 0, ampPrec = 0, ampLisse = 0, flashT0 = -99, flashForce = 1, prochainFlash = 3.5, dernierFlash = -99;
  let richeOn = true, calmeOn = false, vieN = 1;
  let vagueProchaine = 4, penseeProchaine = 6 + alea() * 4, derniereOnde = -99, burst = 0, secousse = 0, ondeSuivante = 0;
  let regardX = 0, regardY = 0, regardT = -99, naissance = null;
  let cascAcc = 0, ptrX = 0, ptrY = 0, ptrT = -99;
  const cascCol = CASCADES.idle.col.slice();
  const niv = { scint: 1, derive: 1, fils: 1, nais: 1, casc: 1, ptr: 1 };   // intensités de la vie individuelle (selon le mode)
  const v = {
    temps: 0, derive: 0.02, echelle: rayon, tour: 0.1, amp: 0, flash: 0, front: 0, lum: 0.5, vitesse: 1, impulsions: 1,
    c: actuel.c.slice(), d: actuel.d.slice(),
    haloOpacite: 0, coeurOpacite: 0, lumiere: [1, 1, 1],
    // vie
    serre: 0, tourb: 0, pulse: 1, secousse: 0, etincelles: 1, forme: 1, incl: [0, 0], flashCol: BLANC.slice(),
    ondes: [[0, 0, 1], [0, 0, 1], [0, 0, 1]],   // [début, force, vitesse] : 3 emplacements, force 0 = libre
    // vie individuelle : intensités (0 à 1), cascades [x, y, z, début] et [vitesse, force, type, largeur] (4 emplacements), couleur des cascades, pointeur [x, y, force]
    vieIndiv: 1, vieDerive: 1, vieFils: 1, vieNais: 1, cascCol: CASCADES.idle.col.slice(), pointeur: [0, 0, 0],
    casA: [[0, 0, 0, -99], [0, 0, 0, -99], [0, 0, 0, -99], [0, 0, 0, -99]], casB: [[1, 0, 0, .25], [1, 0, 0, .25], [1, 0, 0, .25], [1, 0, 0, .25]]
  };
  const declencher = (t, force) => { flashT0 = t; flashForce = force; };
  const recalcul = () => { api.flashs = richeOn && !calmeOn; v.impulsions = api.flashs ? 1 : 0; if (!api.flashs) v.flash = 0; };
  const vie = () => (richeOn && !calmeOn ? vieN : 0);
  const onde = (force = 1, vitesse = 1.6) => {   // une vague part du cœur
    v.ondes[ondeSuivante] = [v.temps, force, vitesse]; ondeSuivante = (ondeSuivante + 1) % 3; derniereOnde = v.temps;
  };
  /* Niveaux de la vie individuelle selon le mode : complet = tout ; normal ≈ 70 % ; léger = scintillement et quelques cascades ; animations réduites = presque rien */
  const calculerNiveaux = () => {
    let a;
    if (!richeOn) a = [0, 0, 0, 0, 0, 0];
    else if (calmeOn) a = [0.3, 0, 0, 0, 0, 0];
    else if (vieN >= 0.95) a = [1, 1, 1, 1, 1, 1];
    else if (vieN >= 0.6) a = [0.7, 0.7, 0.7, 0.7, 0.7, 0.7];
    else a = [1, 0, 0, 0, 0.45, 0];
    niv.scint = a[0]; niv.derive = a[1]; niv.fils = a[2]; niv.nais = a[3]; niv.casc = a[4]; niv.ptr = a[5];
  };
  const dureeVie = b => Math.min(4, 1.8 / Math.max(0.3, b[0]) + 3 * b[3]);   // temps pendant lequel une cascade est visible (les rapides finissent plus vite : l'emplacement se libère)
  const emplacementsMax = () => Math.max(1, Math.round(1 + 3 * niv.casc));
  /* Lance une cascade : source (x, y, z), force, vitesse, type, largeur. Utilise un emplacement libre (ou le plus ancien) ; rien si trop de cascades déjà actives. */
  const lancerCascade = (x, y, z, force, vit, type, larg, forcer) => {
    if (niv.casc <= 0 && !forcer) return false;
    let libre = -1, ancien = 0, actives = 0;
    for (let i = 0; i < 4; i++) {
      const age = v.temps - v.casA[i][3];
      if (v.casB[i][1] <= 0 || age > dureeVie(v.casB[i])) { if (libre < 0) libre = i; } else actives++;
      if (v.casA[i][3] < v.casA[ancien][3]) ancien = i;
    }
    if (libre < 0) { if (!forcer) return false; libre = ancien; }
    else if (!forcer && actives >= emplacementsMax()) return false;
    const a = v.casA[libre], b = v.casB[libre];
    a[0] = x; a[1] = y; a[2] = z; a[3] = v.temps; b[0] = vit; b[1] = force; b[2] = type; b[3] = larg;
    return true;
  };
  /* Source au hasard dans le nuage : dense près du cœur, mais un tiers des cascades naissent à la périphérie */
  const sourceAlea = out => {
    const r = alea() < 0.35 ? 0.85 + alea() * 0.4 : Math.min(1.25, -0.32 * Math.log(1 - alea() * 0.985)), z = alea() * 2 - 1, an = alea() * TAU, sn = Math.sqrt(1 - z * z);
    out[0] = r * sn * Math.cos(an); out[1] = r * z * 0.85; out[2] = r * sn * Math.sin(an);
  };
  const tmp = [0, 0, 0];
  const lancerSelonEtat = () => {
    const c = CASCADES[nom] || CASCADES.idle;
    if (c.type === 0) sourceAlea(tmp);
    else { sourceAlea(tmp); const l = Math.hypot(tmp[0], tmp[1], tmp[2]) || 1; tmp[0] /= l; tmp[1] /= l; tmp[2] /= l; }   // direction du cône
    lancerCascade(tmp[0], tmp[1], tmp[2], c.force * (0.85 + alea() * 0.3), c.vit * (0.9 + alea() * 0.2), c.type, c.larg, false);
  };
  const api = {
    v,
    /* Une cascade tout de suite à un endroit précis du nuage (clic, tests) ; coordonnées dans l'espace du nuage (rayon ≈ 1). */
    cascade(x = 0, y = 0, z = 0, force = 1, vitesse = 1.1, type = 0, largeur = 0.26) { return lancerCascade(+x, +y, +z, force, vitesse, type, largeur, true); },
    /* Le pointeur (curseur ou doigt) dans l'espace du nuage : attire légèrement les neurones proches et les fait étinceler ; oublié après 2,5 s sans mouvement. */
    pointeur(x, y) { ptrX = +x || 0; ptrY = +y || 0; ptrT = v.temps; },
    /* Un clic ou un toucher : une cascade part du point touché (et une vague du cœur). */
    clic(x, y) { if (calmeOn || !richeOn) return; lancerCascade(+x || 0, -(+y || 0), (alea() - 0.5) * 0.5, 1, 1.15, 0, 0.28, true); },
    etat(n) {
      if (!ETATS[n]) return;
      const avant = nom; nom = n; cible = ETATS[n];
      prochainFlash = Math.min(prochainFlash, v.temps + ETATS[n].flash * (0.7 + alea() * 0.6));   // un changement d'état déclenche bientôt un flash
      if (n === 'alerte' && avant !== 'alerte' && !calmeOn) { secousse = 1; declencher(v.temps, 1); onde(1, 2.4); }   // alerte : secousse, flash orange et vague
    },
    get nomEtat() { return nom; },
    /* Amplitude réelle de la voix (0..1) : fonction fournie par la page, sinon amplitude simulée. */
    amplitude(fn) { ampExt = typeof fn === 'function' ? fn : null; },
    /* Un flash tout de suite (tests, événements forts). */
    flash(force = 1) { declencher(v.temps, force); },
    /* Une vague qui part du cœur (clic, toucher, événements). */
    onde(force = 1, vitesse = 1.6) { if (!calmeOn) onde(force, vitesse); },
    /* Le regard : position du curseur ou du doigt par rapport à l'entité, de -1 à 1 (x vers la droite, y vers le bas) ; oublié après 2,5 s sans mouvement. */
    regard(x, y) { regardX = Math.max(-1, Math.min(1, +x || 0)); regardY = Math.max(-1, Math.min(1, +y || 0)); regardT = v.temps; },
    /* Naissance : le nuage se forme du cœur vers l'extérieur en `duree` secondes (0 ou moins : tout de suite). */
    naitre(duree = 2.4) { if (duree <= 0) { naissance = null; v.forme = 1; return; } naissance = { t0: null, duree }; v.forme = 0; },
    get enNaissance() { return !!naissance; },
    /* Intensité de la vie spontanée (0 à 1) : étincelles, petites vagues, pensées. Réglée par le mode (complet 1, normal ~0,75, léger ~0,45). */
    vie(n) { vieN = Math.max(0, Math.min(1, +n)); calculerNiveaux(); },
    /* Décor riche (impulsions animées, flashs, vie spontanée) : coupé en qualité basse et en mode jeu. */
    riche(oui) { richeOn = !!oui; recalcul(); calculerNiveaux(); },
    /* « Réduire les animations » : plus de flashs, d'impulsions, d'étincelles, de vagues ni de secousse ; rotation et agitation très lentes ; la voix fait toujours réagir l'entité. */
    calme(oui) { calmeOn = !!oui; recalcul(); calculerNiveaux(); },
    get calmeActif() { return calmeOn; },
    flashs: true,
    /* Saute directement à l'état voulu, sans transition (tests). */
    fixer() {
      for (const c of CLES) actuel[c] = cible[c];
      for (let i = 0; i < 3; i++) { actuel.c[i] = cible.c[i]; actuel.d[i] = cible.d[i]; actuel.fc[i] = (COULEUR_FLASH[nom] || BLANC)[i]; cascCol[i] = (CASCADES[nom] || CASCADES.idle).col[i]; }
      api.maj(v.temps, 0);
    },
    maj(t, dt) {
      const k = 1 - Math.exp(-dt * 3);   // lissage vers l'état demandé
      for (const c of CLES) actuel[c] += (cible[c] - actuel[c]) * k;
      for (let i = 0; i < 3; i++) { actuel.c[i] += (cible.c[i] - actuel.c[i]) * k; actuel.d[i] += (cible.d[i] - actuel.d[i]) * k; }
      const fc = COULEUR_FLASH[nom] || BLANC; for (let i = 0; i < 3; i++) actuel.fc[i] += (fc[i] - actuel.fc[i]) * k;
      v.temps = t;
      // amplitude : attaque vive, retombée douce
      let brute = null; if (ampExt) { try { const x = ampExt(); if (x != null && isFinite(x)) brute = Math.max(0, Math.min(1, +x)); } catch (e) {} }
      if (!(brute > 0)) brute = ampSimulee(nom, t);
      amp += (brute - amp) * (brute > amp ? 1 - Math.exp(-dt * 16) : 1 - Math.exp(-dt * 5));
      ampLisse += (amp - ampLisse) * (1 - Math.exp(-dt * 1.5));
      const respire = 1 + Math.sin(t * 0.38) * 0.035 + Math.sin(t * 0.91) * 0.012;   // respiration lente
      // flashs : à intervalles propres à chaque état (aléatoires) ; en parole, un pic de voix en déclenche un petit
      if (api.flashs) {
        if (t >= prochainFlash) { declencher(t, 1); prochainFlash = t + cible.flash * (0.7 + alea() * 0.6); }
        if (nom === 'speaking' && amp > 0.55 && t - dernierFlash > 0.7 && t - flashT0 > 0.7) { declencher(t, 0.45); dernierFlash = t; }
        const s = t - flashT0, att = 0.2;
        v.flash = s < 0 || s > 2.4 ? 0 : flashForce * (s < att ? s / att : Math.exp(-(s - att) * 2.1));
        v.front = Math.max(0, s) * 1.6;   // l'onde part du cœur et traverse le nuage
      }
      // vie spontanée
      const vf = vie();
      if (vf > 0) {
        if (cible.vague > 0 && t >= vagueProchaine) { onde(0.26 * (0.6 + 0.4 * vf), 0.9); vagueProchaine = t + cible.vague * (0.7 + alea() * 0.6) / Math.max(0.4, vf); }   // petites vagues d'ambiance
        if ((nom === 'idle' || nom === 'veille' || nom === 'deverrouille') && t >= penseeProchaine) {   // pensée spontanée
          const r = alea();
          if (r < 0.34) declencher(t, 0.45);          // flash du réseau
          else if (r < 0.68) onde(0.6, 2.6);          // éclair interne, rapide
          else burst = 1;                             // rafale d'étincelles
          penseeProchaine = t + (5 + alea() * 6) / Math.max(0.4, vf);
        }
        if (nom === 'speaking' && amp >= 0.45 && ampPrec < 0.45 && t - derniereOnde > 0.3) onde(0.35 + 0.5 * Math.min(1, amp), 1.9);   // une vague à chaque pic de voix
      }
      // cascades d'impulsions nerveuses : cadence selon l'état (à l'écoute, au rythme de la voix) ; en parole, une cascade part du cœur à chaque pic de voix
      const cc = CASCADES[nom] || CASCADES.idle;
      if (niv.casc > 0 && cc.rate > 0) {
        cascAcc += Math.min(dt, 0.1) * cc.rate * niv.casc * (nom === 'listening' ? 0.35 + 2.2 * amp : 1);
        if (cascAcc >= 1) { cascAcc -= 1; if (cascAcc > 2) cascAcc = 0; lancerSelonEtat(); }
        if (nom === 'speaking' && amp >= 0.45 && ampPrec < 0.45) lancerCascade((alea() - 0.5) * 0.1, (alea() - 0.5) * 0.1, (alea() - 0.5) * 0.1, 0.5 + 0.5 * Math.min(1, amp), 1.4, 0, 0.2, false);
      }
      for (let i = 0; i < 3; i++) cascCol[i] += (cc.col[i] - cascCol[i]) * k;
      ampPrec = amp;
      burst *= Math.exp(-dt * 1.2); secousse *= Math.exp(-dt * 4.2);
      // regard : inclinaison lissée, oubliée sans mouvement
      const actif = t - regardT < 2.5, kr = 1 - Math.exp(-dt * 3.5), amplitudeRegard = calmeOn ? 0.3 : 1;
      v.incl[0] += ((actif ? regardX * 0.34 : 0) * amplitudeRegard - v.incl[0]) * kr;
      v.incl[1] += ((actif ? regardY * 0.26 : 0) * amplitudeRegard - v.incl[1]) * kr;
      // naissance
      let echNaiss = 1, lumNaiss = 1;
      if (naissance) {
        if (naissance.t0 == null) naissance.t0 = t;
        const p = Math.min(1, (t - naissance.t0) / naissance.duree), e = facile(p);
        v.forme = e; echNaiss = 0.82 + 0.18 * e; lumNaiss = 0.35 + 0.65 * e;
        if (p >= 1) { naissance = null; v.forme = 1; }
      }
      v.lum = actuel.lum * (1 + amp * actuel.voix) * lumNaiss; v.vitesse = actuel.vitesse; v.amp = amp;
      const k2 = calmeOn ? 0.25 : 1;
      v.derive = (0.012 + actuel.agite * 0.045) * (calmeOn ? 0.5 : 1); v.tour = actuel.tour * 0.5 * (1 + ampLisse * 0.5) * k2;
      v.echelle = rayon * (actuel.rayon / 0.69) * respire * echNaiss;
      v.serre = actuel.serre * (calmeOn ? 0.4 : 1); v.tourb = actuel.tourb * (calmeOn ? 0.3 : 1); v.pulse = actuel.pulse; v.secousse = secousse;
      v.etincelles = actuel.etinc * vf * (1 + burst * 5);
      for (let i = 0; i < 3; i++) { v.c[i] = actuel.c[i]; v.d[i] = actuel.d[i]; v.flashCol[i] = actuel.fc[i]; v.cascCol[i] = cascCol[i]; }
      v.vieIndiv = niv.scint; v.vieDerive = niv.derive; v.vieFils = niv.fils; v.vieNais = niv.nais;
      const ptrActif = t - ptrT < 2.5 && Math.hypot(ptrX, ptrY) < 1.9, kp = 1 - Math.exp(-dt * 6);
      v.pointeur[0] += (ptrX - v.pointeur[0]) * kp; v.pointeur[1] += (ptrY - v.pointeur[1]) * kp;
      v.pointeur[2] += ((ptrActif ? niv.ptr : 0) - v.pointeur[2]) * (1 - Math.exp(-dt * 5));
      const f = v.flash;
      v.haloOpacite = 0.006 + actuel.lum * 0.009 + f * 0.008;
      v.coeurOpacite = 0.05 + actuel.lum * 0.05 + f * 0.03;   // cœur bleu-cyan lumineux
      v.lumiere[0] = 0.8 + actuel.c[0] * .2; v.lumiere[1] = 0.8 + actuel.c[1] * .2; v.lumiere[2] = 0.8 + actuel.c[2] * .2;   // même teinte que l'entité, très claire
    }
  };
  calculerNiveaux();
  api.maj(0, 1);
  return api;
}
