/* ═════════════ SHADERS DE L'ENTITÉ RAYLÉ (partagés) ═════════════
   Les mêmes textes GLSL sont compilés par Three.js (galaxie/soleil.js) et par le moteur natif de l'accueil (skins/neurone/entite-reseau.js) :
   c'est ce qui garantit le même rendu. Ils ne déclarent ni modelViewMatrix, ni projectionMatrix, ni position : chaque moteur les fournit.
   Tout se calcule ici, sur la carte graphique : aucun calcul par neurone côté processeur.
   Vie d'ensemble : dérive organique, étincelles, vagues (uOndes), resserrement (écoute), tourbillon (réflexion), secousse (alerte), regard (inclinaison), naissance.
   Vie individuelle : chaque neurone a sa phase et sa vitesse (scintillement, respiration de la taille, dérive en petites boucles, teinte), certains naissent et
   s'éteignent doucement ; chaque filament a son rythme (ondulation, naissance et mort douces) ; des CASCADES d'impulsions nerveuses (uCasA/uCasB, 4 à la fois) partent
   d'un point quelconque du nuage et se propagent de proche en proche : l'instant d'arrivée du signal en chaque neurone est calculé à partir de sa position,
   puis interpolé le long des filaments, ce qui donne de vraies impulsions qui courent sur les fils et allument les neurones voisins en chaîne.
   Le pointeur (uPointeur) attire légèrement les neurones proches et les fait étinceler. */
export const COMMUN = /* glsl */`
  // Impulsion nerveuse : attaque instantanée, décroissance douce ; rel = secondes écoulées depuis l'arrivée du signal en ce point
  float impulsion(float rel, float larg) { return rel < 0.0 ? 0.0 : exp(-rel / larg) * smoothstep(0.0, 0.04, rel); }
`;
export const DERIVE = /* glsl */`
  uniform float uTemps, uDerive, uEchelle, uTour, uAmp, uFlash, uFront, uSerre, uTourb, uSecousse, uForme, uEtincelles;
  uniform float uVieIndiv, uVieDerive, uVieFils, uVieNais;
  uniform vec2 uIncl;
  uniform vec3 uOndes[3], uPointeur;
  uniform vec4 uCasA[4], uCasB[4];
  varying float vProf, vFlash, vOnde, vForme;
  ${COMMUN}
  float profondeur(vec4 mv) { float cz = -(modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z; return clamp(1.0 - 0.38 * ((-mv.z - cz) / (uEchelle * 1.2)), 0.5, 1.25); }   // les neurones lointains s'estompent
  // Flash : une onde blanche part du cœur (uFront = rayon du front), l'enveloppe uFlash gonfle puis retombe
  float coeurDense(vec3 p) { return 1.0 / (1.0 + 2.6 * exp(-length(p) * 4.5)); }   // le cœur très dense ne sature pas en blanc : il reste bleu-cyan
  float eclair(vec3 p) { float r = length(p); return uFlash * (0.5 + 0.5 * exp(-pow((r - uFront) * 2.0, 2.0))); }
  // Vagues : des anneaux de lumière qui partent du cœur (force 0 = emplacement libre) ; durée de vie 2,6 s
  float ondes(vec3 p) {
    float r = length(p), s = 0.0;
    for (int i = 0; i < 3; i++) {
      vec3 o = uOndes[i]; float age = uTemps - o.x;
      if (o.y > 0.0 && age >= 0.0 && age < 2.6) { float d = r - age * o.z; s += o.y * exp(-d * d * 16.0) * (1.0 - age / 2.6); }
    }
    return s;
  }
  // Naissance : le nuage se forme du cœur vers l'extérieur (uForme = 1 : tout est là)
  float naissance(vec3 p) { float f = uForme * 3.0; return 1.0 - smoothstep(f - 0.45, f, length(p)); }
  // Cascades : pour chacune, le temps écoulé depuis l'arrivée du signal en ce point (arr) et sa force (amp).
  // Type 0 : onde qui part d'une source (n'importe où) ; 1 : cône qui converge vers le cœur ; 2 : cône qui part du cœur.
  // Le retard est irrégulier d'un neurone à l'autre (réaction en chaîne, pas une sphère parfaite) et la force s'éteint avec la distance.
  void cascades(vec3 p, out vec4 arr, out vec4 amp) {
    float r = length(p);
    float j1 = 0.5 + 0.5 * sin(dot(p, vec3(37.1, 53.7, 29.3))), j2 = 0.5 + 0.5 * sin(dot(p, vec3(71.3, 19.9, 43.1)));
    arr = vec4(0.0); amp = vec4(0.0);
    for (int i = 0; i < 4; i++) {
      vec4 A = uCasA[i], B = uCasB[i];
      if (B.y <= 0.0) continue;
      float age = uTemps - A.w;
      if (age < 0.0 || age > 4.0) continue;
      float base, w = 1.0;
      if (B.z < 0.5) base = distance(p, A.xyz);
      else { vec3 dn = normalize(A.xyz + vec3(0.0001)); w = smoothstep(0.3, 0.78, dot(p / max(r, 0.001), dn)); base = B.z < 1.5 ? max(0.0, 1.35 - r) : r; }
      float t = base / B.x * (0.85 + 0.5 * j1) + 0.18 * j2;
      arr[i] = age - t;
      amp[i] = B.y * w * exp(-base * 0.95) * (0.3 + 0.7 * smoothstep(0.05, 0.7, r));   // s'éteint avec la distance ; le cœur, très dense, s'allume moins fort
    }
  }
  vec3 deriver(vec3 p, out float prox) {
    float r0 = length(p);
    vec3 d = vec3(sin(p.y * 3.1 + uTemps * 0.7 + p.z * 2.3), sin(p.z * 2.7 + uTemps * 0.6 + p.x * 1.9), sin(p.x * 3.3 + uTemps * 0.8 + p.y * 2.1));
    p += d * (uDerive + uAmp * 0.02);
    // dérive individuelle : de petites boucles organiques dont la phase dépend de la position (continue : les fils suivent leurs neurones, deux voisins ne bougent jamais pareil)
    vec3 e1 = vec3(sin(p.y * 23.0 + uTemps * 1.3 + p.z * 17.0), sin(p.z * 21.0 + uTemps * 1.1 + p.x * 19.0), sin(p.x * 25.0 + uTemps * 1.5 + p.y * 15.0));
    vec3 e2 = vec3(cos(p.z * 31.0 - uTemps * 0.9 + p.x * 13.0), cos(p.x * 29.0 - uTemps * 1.0 + p.y * 11.0), cos(p.y * 27.0 - uTemps * 0.8 + p.z * 17.0));
    p += (e1 * 0.012 + e2 * 0.007) * uVieDerive;
    p *= 1.0 - uSerre * 0.24 * smoothstep(0.1, 1.1, r0);                                          // écoute : les filaments se resserrent vers le cœur
    p *= 1.0 + 0.06 * ondes(vec3(r0, 0.0, 0.0));                                                   // le passage d'une vague gonfle un instant le nuage
    float a = uTemps * uTour + uTourb * (1.25 - min(r0, 1.25)) * (0.85 + 0.15 * sin(uTemps * 0.9)); // réflexion : tourbillon (l'intérieur tourne plus vite)
    float c = cos(a), s = sin(a);
    p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    float ci = cos(uIncl.x), si = sin(uIncl.x), cj = cos(uIncl.y), sj = sin(uIncl.y);              // regard : légère inclinaison vers le curseur
    p = vec3(ci * p.x + si * p.z, p.y, -si * p.x + ci * p.z);
    p = vec3(p.x, cj * p.y - sj * p.z, sj * p.y + cj * p.z);
    p += vec3(sin(uTemps * 61.0 + p.y * 9.0), cos(uTemps * 53.0 + p.z * 9.0), sin(uTemps * 47.0 + p.x * 9.0)) * uSecousse * 0.05;   // alerte : secousse courte
    vec3 q = p * uEchelle * (1.0 + uAmp * 0.06);
    // pointeur : les neurones proches du curseur ou du doigt sont légèrement attirés (prox = proximité, 0 à 1)
    vec2 sp = vec2(uPointeur.x, -uPointeur.y) * uEchelle, dq = q.xy - sp;
    prox = uPointeur.z * exp(-dot(dq, dq) / (0.09 * uEchelle * uEchelle));
    q.xy += (sp - q.xy) * 0.14 * prox;
    return q;
  }
`;
export const VERT_NOEUDS = /* glsl */`
  attribute float aPoids, aGraine, aHub;
  uniform float uPx, uTaille;
  ${DERIVE}
  varying vec4 vN1;   // graine, poids, éclat, hub
  varying vec4 vN2;   // étincelle, cascade, proximité du pointeur, vie (naissance et mort)
  // Étincelle : à intervalles aléatoires, un neurone s'allume puis s'éteint vite
  float etincelle(float g) {
    float t = uTemps * 2.2 + g * 40.0, id = floor(t);
    float h = fract(sin((id + g * 91.7) * 12.9898) * 43758.5453);
    return step(1.0 - 0.006 * uEtincelles, h) * exp(-fract(t) * 4.0);
  }
  void main(){
    float g = aGraine, h1 = fract(g * 17.317 + 0.113), h2 = fract(g * 53.771 + 0.371), h3 = fract(g * 91.137 + 0.719), h4 = fract(g * 7.913 + 0.529);   // le caractère propre de ce neurone
    float prox; vec3 q = deriver(position, prox);
    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    gl_Position = projectionMatrix * mv;
    float etinc = etincelle(g);
    // cascades : activation de ce neurone par les impulsions qui passent (les carrefours, plus gros, étincellent davantage)
    vec4 arr, amp; cascades(position, arr, amp);
    float act = 0.0; for (int i = 0; i < 4; i++) act += amp[i] * impulsion(arr[i], uCasB[i].w);
    act *= 1.0 + 1.3 * aHub;
    // naissance et mort : 35 % des neurones s'allument depuis rien, grandissent, brillent, puis s'éteignent doucement (le nombre total reste stable)
    float vie = 1.0, croit = 1.0;
    if (h1 < 0.35) {
      float x = fract(uTemps * (0.022 + 0.04 * h2) + h3);
      croit = smoothstep(0.0, 0.10, x) * (1.0 - smoothstep(0.90, 1.0, x));
      vie = mix(1.0, croit * (1.0 + 1.2 * exp(-x * 14.0) * smoothstep(0.0, 0.03, x)), uVieNais);
      croit = mix(1.0, 0.3 + 0.7 * croit, uVieNais);
    }
    float resp = 1.0 + 0.18 * uVieIndiv * sin(uTemps * (0.45 + 1.5 * h2) + 6.2832 * h3);           // respiration de la taille
    float taille = uTaille * (0.55 + 0.6 * aPoids) * (0.55 + 0.9 * g * g) * (1.0 + 1.1 * aHub) * (1.0 + 1.4 * etinc) * resp * croit * (1.0 + 0.4 * min(act, 1.5)) * (1.0 + 0.5 * prox);   // tailles très variées, quelques gros neurones
    gl_PointSize = taille * uPx * (1.0 + uAmp * 0.35) * (60.0 / -mv.z);
    vProf = profondeur(mv) * coeurDense(position); vFlash = eclair(position);
    vOnde = ondes(position); vForme = naissance(position);
    // scintillement indépendant : deux sinusoïdes à vitesses et phases propres au neurone (sans vie individuelle : l'ancien scintillement, identique)
    float f1 = sin(uTemps * (0.8 + 2.4 * h2) + 40.0 * h3), f2 = sin(uTemps * (1.7 + 3.1 * h4) + 17.0 * h1);
    float eclat = 0.6 + 0.4 * mix(sin(uTemps * (1.0 + g * 2.0) + g * 40.0), 0.6 * f1 + 0.4 * f2, uVieIndiv);
    vN1 = vec4(g, aPoids, eclat, aHub);
    vN2 = vec4(etinc, act, prox, vie);
  }`;
export const FRAG_NOEUDS = /* glsl */`
  uniform vec3 uC1, uC2, uFlashCol, uCasCol; uniform float uLum, uVieIndiv;
  varying vec4 vN1, vN2;
  varying float vProf, vFlash, vOnde, vForme;
  void main(){
    float vGraine = vN1.x, vPoids = vN1.y, vEclat = vN1.z, vHub = vN1.w, vEtinc = vN2.x, vAct = vN2.y, vProx = vN2.z, vVie = vN2.w;
    float k = length(gl_PointCoord - 0.5) * 2.0;
    if (k > 1.0) discard;
    float halo = pow(1.0 - k, 2.0);
    float centre = smoothstep(0.45, 0.0, k);                         // cœur blanc du neurone
    vec3 teinte = mix(uC1, uC2, vGraine) * (1.0 + 0.14 * uVieIndiv * (fract(vGraine * 131.7) - 0.5) * 2.0);   // micro-variation de teinte, propre au neurone
    vec3 col = teinte * (0.3 + 0.45 * vPoids) * halo + vec3(1.0) * centre * (0.16 + 0.4 * vHub + 0.08 * vPoids);
    col = mix(col, uFlashCol * (0.35 + 0.6 * halo), vFlash * 0.75) * (1.0 + 0.25 * vFlash);   // flash : tout passe au blanc (orange en alerte)
    col += mix(uC2, uFlashCol, 0.5) * (0.5 * halo + 0.5 * centre) * vOnde * 1.3;               // vague qui passe
    col += uFlashCol * (0.4 * halo + 0.9 * centre) * vEtinc * 1.6;                              // étincelle
    col += uCasCol * (0.5 * halo + 0.8 * centre) * min(vAct, 2.0) * 1.5;                       // impulsion nerveuse qui passe (cascade)
    col += mix(uC2, uFlashCol, 0.4) * (0.4 * halo + 0.9 * centre) * vProx * 1.2;                // pointeur : étincelles près du curseur
    gl_FragColor = vec4(col * uLum * vEclat * vProf * vForme * vVie, 1.0);
  }`;
export const VERT_LIENS = /* glsl */`
  attribute float aU, aPh, aV, aW, aGr, aRad;
  ${DERIVE}
  varying vec4 vL1;   // u (position le long du filament), phase, vitesse, largeur de l'impulsion
  varying vec4 vL2;   // graine moyenne, rayonnement, proximité du pointeur
  varying vec4 vArr, vAmp;   // cascades : temps depuis l'arrivée du signal, force (interpolés le long du segment)
  void main(){
    float prox; vec3 q = deriver(position, prox);
    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    gl_Position = projectionMatrix * mv;
    vL1 = vec4(aU, aPh, aV, aW); vL2 = vec4(aGr, aRad, prox, 0.0);
    vProf = profondeur(mv) * coeurDense(position); vFlash = eclair(position);
    vOnde = ondes(position); vForme = naissance(position);
    cascades(position, vArr, vAmp);
  }`;
export const FRAG_LIENS = /* glsl */`
  uniform vec3 uC1, uC2, uFlashCol, uCasCol; uniform float uLum, uVitesse, uImpulsions, uTemps, uPulse, uVieFils;
  uniform vec4 uCasB[4];
  varying vec4 vL1, vL2, vArr, vAmp;
  varying float vProf, vFlash, vOnde, vForme;
  ${COMMUN}
  void main(){
    float vU = vL1.x, vPh = vL1.y, vV = vL1.z, vW = vL1.w, vGr = vL2.x, vRad = vL2.y, vProx = vL2.z;
    float h = fract(uTemps * vV * uVitesse * uPulse + vPh);  // position de l'impulsion le long du filament (plus rapide en réflexion)
    float d = abs(vU - h); d = min(d, 1.0 - d);
    float pulse = exp(-d * d * vW) * uImpulsions;
    vec3 col = mix(uC1, uC2, vGr * 0.3) * (0.15 + 1.5 * pulse) * vRad * vProf * uLum;   // fils très fins, plus vifs vers le cœur
    col = mix(col, uFlashCol * 0.75 * vRad * vProf * uLum, vFlash * 0.7) * (1.0 + 0.4 * vFlash);   // flash : les fils passent au blanc
    col += mix(uC2, uFlashCol, 0.5) * vOnde * vRad * vProf * uLum * 1.4;                          // vague qui passe
    // cascades : de vraies impulsions qui courent le long du fil (le temps d'arrivée est interpolé entre les deux neurones)
    float act = 0.0; for (int i = 0; i < 4; i++) act += vAmp[i] * impulsion(vArr[i], uCasB[i].w);
    col += uCasCol * min(act, 2.0) * vRad * vProf * uLum * 2.6;
    col += mix(uC2, uFlashCol, 0.4) * vProx * vRad * vProf * uLum * 0.9;                         // pointeur
    // filaments vivants : ondulation qui parcourt le fil, et naissance / mort douces de certaines connexions
    float onde = 1.0 + 0.16 * uVieFils * sin(vU * 18.0 - uTemps * (1.5 + vV * 5.0));
    float x = fract(uTemps * (0.02 + 0.05 * vGr) + vPh * 5.0 + vU * 0.35);
    float conc = step(fract(vPh * 7.31), 0.45);
    float vieF = mix(1.0, 0.15 + 0.85 * smoothstep(0.0, 0.10, x) * (1.0 - smoothstep(0.86, 1.0, x)), uVieFils * conc);
    gl_FragColor = vec4(col * vForme * onde * vieF, 1.0);
  }`;
