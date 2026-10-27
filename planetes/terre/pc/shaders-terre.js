/* ═════════════ NUANCEURS DE LA TERRE ═════════════
   Rendu relatif à la caméra : la caméra est à l'origine de la scène, chaque objet est placé à (position réelle − position de la caméra).
   Les nuanceurs travaillent donc avec des vecteurs « monde » = « depuis la caméra ». Sortie linéaire (la tonalité et le sRGB sont appliqués après). */

const COMMUN = /* glsl */`
  float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float bruit(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x), mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y); }
`;

/* ── Tuile : relief en sommets, image, calque vectoriel, ombrage, nuit, océan, brume ── */
export const TUILE_VERT = /* glsl */`
  attribute vec3 aRad; attribute float aJupe;
  uniform sampler2D uRel; uniform vec3 uRelR; uniform vec4 uTuile; uniform float uExag, uJupe, uRelOk;
  varying vec2 vUv; varying vec3 vRad; varying vec3 vMonde; varying vec2 vGlobal;
  void main(){
    vUv = uv; vRad = aRad;
    float h = uRelOk > 0.5 ? max(texture2D(uRel, uRelR.xy + uv * uRelR.z).r, 0.0) * 0.001 : 0.0;   // mètres → km, océans à 0
    vec3 p = position + aRad * (h * uExag - aJupe * min(uJupe, uTuile.w * 0.012));   // jupe proportionnée à la tuile (sinon un « rideau » de 300 m apparaît sur les petites tuiles)
    float n = exp2(uTuile.x);
    float lon = (uTuile.y + uv.x) / n * 360.0 - 180.0;
    float lat = atan(sinh(3.14159265 * (1.0 - 2.0 * (uTuile.z + uv.y) / n)));
    vGlobal = vec2(lon / 360.0 + 0.5, lat / 3.14159265 + 0.5);
    vec4 m = modelMatrix * vec4(p, 1.0); vMonde = m.xyz;
    gl_Position = projectionMatrix * viewMatrix * m;
  }`;
const OMBRE_BATIMENTS = /* glsl */`
  /* 1 = éclairé, 0 = à l'ombre d'un bâtiment (carte de profondeur du Soleil, filtre doux sur 12 points, fondu sur les bords de la carte) */
  float ombreBatiments(vec3 mondeP, float biais){
    if (uOmbreOn < 0.5) return 1.0;
    vec4 s = uOmbreM * vec4(mondeP, 1.0); vec3 p = s.xyz / s.w * 0.5 + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
    float bord = smoothstep(0.0, 0.1, min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y)));
    float r = 1.6 / 2048.0, somme = 0.0;
    vec2 o[12];
    o[0] = vec2(-0.94, -0.40); o[1] = vec2(0.95, -0.77); o[2] = vec2(-0.09, -0.93); o[3] = vec2(0.34, 0.29); o[4] = vec2(-0.91, 0.46); o[5] = vec2(-0.82, -0.88);
    o[6] = vec2(-0.38, 0.28); o[7] = vec2(0.97, 0.76); o[8] = vec2(0.44, -0.66); o[9] = vec2(0.52, 0.93); o[10] = vec2(-0.24, 0.98); o[11] = vec2(0.05, 0.0);
    for (int i = 0; i < 12; i++) somme += step(p.z - biais, texture2D(uOmbre, p.xy + o[i] * r).r);
    return mix(1.0, somme / 12.0, bord);
  }`;

export const TUILE_FRAG = /* glsl */`
  uniform sampler2D uImg, uRel, uVec, uJourG, uNuitG, uRad, uOmbre;
  uniform vec3 uImgR, uRelR, uVecR, uSoleil, uRadR;
  uniform vec4 uTuile;                 // z, x, y, largeur de la tuile (km)
  uniform mat4 uOmbreM;
  uniform float uRelN, uOrtho, uImgZ, uOmbreOn, uOmbreTaille, uPasRelief, uDetail; uniform float uImgOk, uRelOk, uVecOk, uVecA, uExag, uTemps, uHaze, uOcean, uLumieres, uRadOk, uRadA, uFondu, uSens;
  varying vec2 vUv; varying vec3 vRad; varying vec3 vMonde; varying vec2 vGlobal;
  ${COMMUN}
  ${OMBRE_BATIMENTS}
  float hauteur(vec2 ur){ return max(texture2D(uRel, ur).r, 0.0) * 0.001; }
  /* Ombre portée par le relief : on remonte vers le Soleil le long du relief ; si un point du relief dépasse le rayon, le sol est à l'ombre (pénombre douce). */
  float ombreRelief(vec3 up, vec3 L, vec3 est, vec3 nord, vec2 ur, float h0){
    if (uPasRelief < 1.0 || uTuile.x < 8.0) return 1.0;
    float lv = dot(L, up); vec2 Lh = vec2(dot(L, est), dot(L, nord)); float lh = length(Lh);
    if (lv < 0.015 || lh < 1e-4) return 1.0;
    vec2 dirUV = vec2(Lh.x, -Lh.y) / lh * uRelR.z / uTuile.w;       // déplacement dans la texture de relief par km parcouru vers le Soleil
    float pente = lv / lh, ombre = 1.0, s = 0.02, H0 = h0 * uExag;
    for (int i = 0; i < 16; i++) {
      if (float(i) >= uPasRelief) break;
      vec2 q = ur + dirUV * s;
      if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) break;
      float marge = (H0 + pente * s) - hauteur(q) * uExag;
      ombre = min(ombre, clamp(marge / (0.05 * s + 0.002) + 0.15, 0.0, 1.0));
      s *= 1.62;
    }
    return ombre;
  }
  void main(){
    // fondu entre niveaux de détail : tramage ; l'entrante garde les pixels « h < p », la sortante les autres (jamais de trou)
    if (uSens != 0.0) { float h = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (uSens > 0.0 ? h >= uFondu : h < uFondu) discard; }
    vec3 up = normalize(vRad), L = normalize(uSoleil), V = normalize(-vMonde);
    float proche = smoothstep(9.0, 12.5, uTuile.x);                   // 0 de loin (rendu inchangé), 1 de près
    vec2 ui = uImgR.xy + vUv * uImgR.z;
    vec3 img = uImgOk > 0.5 ? texture2D(uImg, ui).rgb : texture2D(uJourG, vGlobal).rgb;
    // détail de près : quand l'image est agrandie au-delà de sa résolution, une texture fractale (luminosité et teinte, selon les couleurs de l'image) évite le flou plat
    float agr = clamp(uTuile.x - uImgZ - 0.6, 0.0, 3.0) * step(0.5, uImgOk) * uDetail;
    if (agr > 0.0) {
      vec2 w = vUv * uTuile.w * 1000.0;                               // mètres dans la tuile
      float n = bruit(w * 0.9) * 0.45 + bruit(w * 3.1 + 11.0) * 0.3 + bruit(w * 9.7 + 5.0) * 0.25;
      float verdure = clamp((img.g - max(img.r, img.b)) * 6.0, 0.0, 1.0);
      img *= 1.0 + (n - 0.5) * (0.30 + 0.25 * verdure) * agr * 0.45;
      img = mix(img, img * vec3(0.92, 1.05, 0.9), (n - 0.5) * verdure * agr * 0.2);
    }
    // normale du relief : différences finies avancées (3 lectures de la texture de hauteurs)
    vec3 N = up; float eau = 0.0, profondeur = 0.0, sombreRel = 1.0;
    if (uRelOk > 0.5) {
      vec2 ur = uRelR.xy + vUv * uRelR.z;
      float e = 1.0 / uRelN, texelKm = max(uTuile.w / uRelR.z / uRelN, 1e-4);
      float m0 = texture2D(uRel, ur).r;
      float h0 = max(m0, 0.0) * 0.001, hE = hauteur(ur + vec2(e, 0.0)), hS = hauteur(ur + vec2(0.0, e));
      vec3 est = normalize(cross(vec3(0.0, 1.0, 0.0), up) + vec3(1e-5, 0.0, 0.0)), nord = cross(up, est);
      float pe = (hE - h0) / texelKm * uExag, pn = (h0 - hS) / texelKm * uExag;
      N = normalize(up - est * pe - nord * pn);
      eau = 1.0 - smoothstep(-1.0, 1.0, m0);                          // altitude ≤ 0 m : océan ou mer
      profondeur = max(-m0, 0.0);
      sombreRel = ombreRelief(up, L, est, nord, ur, h0);
    }
    float d0 = dot(up, L);
    float jour = smoothstep(-0.12, 0.18, d0);
    float lam0 = max(d0, 0.0), lam = max(dot(N, L), 0.0);
    float relief = mix(1.0, clamp(lam / (lam0 + 0.12), 0.45, 1.6), smoothstep(0.0, 0.35, lam0));
    // ombres des bâtiments (carte de profondeur du Soleil) et du relief
    float sombre = min(sombreRel, ombreBatiments(vMonde, 0.0004));
    sombre = mix(1.0, sombre, proche * smoothstep(0.0, 0.12, lam0));
    float cielAmb = 0.03 + proche * (0.05 + 0.07 * (dot(N, up) * 0.5 + 0.5)) * smoothstep(-0.1, 0.3, d0);   // lumière du ciel : plus présente de près, bleutée
    vec3 cj = img * (lam0 * relief * 1.35 * sombre + cielAmb * mix(vec3(1.0), vec3(0.78, 0.9, 1.15), proche));
    // océan : reflet du soleil et du ciel, plus fort à l'oblique ; profondeur, vagues, écume près des côtes
    vec3 spec = vec3(0.0);
    if (eau > 0.5 && uOcean > 0.0) {
      vec2 q = vGlobal * 4096.0 * exp2(max(uTuile.x - 8.0, 0.0)) * 0.02 + vec2(uTemps * 0.05, uTemps * 0.03);
      float vagues = smoothstep(7.0, 11.0, uTuile.x);
      vec2 qf = (vUv * uTuile.w * 1000.0) * 0.18 + vec2(uTemps * 0.6, -uTemps * 0.35);        // vagues de quelques mètres, en mouvement
      vec3 Nr = normalize(up + (vec3(bruit(q) - 0.5, bruit(q + 7.3) - 0.5, bruit(q + 3.1) - 0.5)) * 0.05 * vagues
        + (vec3(bruit(qf) - 0.5, bruit(qf + 5.2) - 0.5, bruit(qf + 9.1) - 0.5)) * 0.08 * smoothstep(11.0, 14.0, uTuile.x));
      vec3 H = normalize(L + V);
      float s = pow(max(dot(Nr, H), 0.0), 160.0) * 1.6 * lam0;
      float fr = pow(1.0 - max(dot(up, V), 0.0), 4.0);
      spec = vec3(1.0, 0.93, 0.8) * s * uOcean + vec3(0.18, 0.32, 0.55) * fr * (lam0 * 0.8 + 0.05) * uOcean * 0.7;
      // pas de teinte de profondeur : le relief marin de Mapterhorn est irrégulier d'une tuile à l'autre (rectangles) ; la couleur de l'eau vient de l'imagerie
    }
    // nuit : lumières des villes (texture mondiale) et reflet bleuté très faible du relief
    vec3 col = cj + spec;
    if (jour < 0.995) {                                              // la texture de nuit (8k) n'est lue que côté nuit : niveau de détail fixe, sans dérivées
      float globale = 1.0 - smoothstep(5.0, 8.0, uTuile.x);               // la texture mondiale (8k) devient de gros carrés flous en s'approchant : elle s'efface
      vec3 nuit = textureLod(uNuitG, vGlobal, 2.0).rgb * 1.7 * uLumieres * globale + img * vec3(0.09, 0.125, 0.24);
      col = mix(nuit, col, jour);
    }
    // calque vectoriel (frontières, routes, eau) : alpha prémultiplié
    if (uVecOk > 0.5 && uVecA > 0.0) {
      vec4 vv = texture2D(uVec, uVecR.xy + vUv * uVecR.z);
      vec3 cv = vv.rgb / max(vv.a, 1e-4);
      vec3 lin = pow(cv, vec3(2.2)) * vv.a;
      float eclair = mix(0.16, 0.55 + 0.6 * lam0, jour) * mix(1.0, sombre, 0.7);   // éclairé comme le sol : le plan ne brille plus la nuit
      float clair = smoothstep(0.62, 0.82, dot(cv, vec3(0.3, 0.55, 0.15)));  // routes, bâtiments : traits clairs du style
      float tenue = 1.0 - 0.8 * uOrtho * jour;                                // sous une photo aérienne le tracé est discret le jour
      col = col * (1.0 - vv.a * uVecA * tenue) + lin * uVecA * eclair * tenue;
      float lueur = clair * smoothstep(0.2, 0.5, vv.a) * vv.a * uVecA * (1.0 - jour) * smoothstep(8.0, 11.0, uTuile.x) * uLumieres;
      col += vec3(1.0, 0.68, 0.34) * lueur * 0.7;                            // lumières des routes et des villes, de près
    }
    // radar de pluie (RainViewer) : couleur de l'écho, éclairée par la nuit comme le reste
    if (uRadOk > 0.5 && uRadA > 0.0) {
      vec4 rr = texture2D(uRad, uRadR.xy + vUv * uRadR.z);
      col = mix(col, rr.rgb * (0.55 + 0.45 * jour) * 1.1, rr.a * uRadA * 0.88);
    }
    // brume atmosphérique : seulement près du sol (diffusion : bleutée, chaude vers le Soleil, rougeoyante au crépuscule)
    float dist = length(vMonde);
    float brume = (1.0 - exp(-dist / uHaze)) * (0.25 + 0.75 * jour);
    float versSoleil = pow(max(dot(normalize(vMonde), L), 0.0), 6.0);
    float crep = smoothstep(0.0, 0.35, 0.45 - d0) * smoothstep(-0.2, 0.05, d0);
    vec3 teinte = mix(vec3(0.42, 0.58, 0.85), vec3(1.0, 0.62, 0.38), clamp(crep * 0.8 + versSoleil * 0.35, 0.0, 1.0));
    col = mix(col, teinte * (0.15 + 0.85 * lam0 + 0.25 * crep), brume * 0.7);
    gl_FragColor = vec4(col, 1.0);
  }`;

/* ── Sphère de base : monde entier sous les tuiles (pôles compris) ── */
export const BASE_VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vMonde;
  void main(){ vUv = uv; vN = normalize(position); vec4 m = modelMatrix * vec4(position, 1.0); vMonde = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`;
export const BASE_FRAG = /* glsl */`
  uniform sampler2D uJour, uNuit; uniform vec3 uSoleil; uniform float uLumieres;
  varying vec2 vUv; varying vec3 vN; varying vec3 vMonde;
  void main(){
    vec3 n = normalize(vN), L = normalize(uSoleil);
    float d = dot(n, L), jour = smoothstep(-0.12, 0.18, d);
    vec3 cj = texture2D(uJour, vUv).rgb * (max(d, 0.0) * 1.35 + 0.03);
    vec3 cn = texture2D(uNuit, vUv).rgb * 1.7 * uLumieres + texture2D(uJour, vUv).rgb * vec3(0.09, 0.125, 0.24);
    gl_FragColor = vec4(mix(cn, cj, jour), 1.0);
  }`;

/* ── Atmosphère : coque vue de l'intérieur ; l'intensité dépend de la plus courte distance du rayon de vue à la surface.
      Vue de l'espace : halo du limbe. Vue du sol : ciel bleu le jour, rougeoyant au crépuscule, noir la nuit. ── */
export const ATMO_VERT = /* glsl */`
  varying vec3 vMonde; varying vec3 vCentre;
  void main(){ vec4 m = modelMatrix * vec4(position, 1.0); vMonde = m.xyz; vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * m; }`;
export const ATMO_FRAG = /* glsl */`
  uniform vec3 uSoleil; uniform float uRayon, uEchelle, uForce;
  varying vec3 vMonde; varying vec3 vCentre;
  void main(){
    vec3 rd = normalize(vMonde), L = normalize(uSoleil);
    float t = max(dot(vCentre, rd), 0.0);
    vec3 npc = rd * t - vCentre;                     // du centre au point le plus proche du rayon
    float hmin = length(npc);
    float h = max(hmin - uRayon, 0.0);
    float intensite = exp(-h / uEchelle);
    vec3 nh = npc / max(hmin, 1.0);
    float d = dot(nh, L);
    float jour = smoothstep(-0.28, 0.5, d);
    float crep = smoothstep(-0.38, 0.0, d) * (1.0 - smoothstep(0.0, 0.42, d));
    vec3 bleu = vec3(0.30, 0.55, 1.0), orange = vec3(1.0, 0.45, 0.18);
    vec3 col = mix(bleu, orange, clamp(crep * 1.3, 0.0, 1.0));
    float haut = clamp(dot(rd, normalize(-vCentre)), 0.0, 1.0);          // élévation du rayon au-dessus de l'horizon de la caméra
    float horizon = 1.0 + 1.6 * pow(1.0 - haut, 3.0);                      // plus lumineux près de l'horizon
    float a = intensite * (jour + crep * 0.8 + 0.06) * uForce * horizon;
    // vue du sol : diffusion de Mie (halo autour du Soleil, rougeoyant au crépuscule) et voile d'horizon ; sans effet de l'espace (rendu du globe inchangé)
    float altCam = length(vCentre) - uRayon, prox = 1.0 - smoothstep(40.0, 700.0, altCam);
    float cs = max(dot(rd, L), 0.0);
    float mie = (pow(cs, 14.0) * 0.3 + pow(cs, 160.0) * 2.0) * intensite * (jour * 0.9 + crep) * prox;
    vec3 colMie = mix(vec3(1.0, 0.94, 0.82), vec3(1.0, 0.5, 0.2), clamp(crep * 1.4, 0.0, 1.0));
    vec3 sortie = col * a + colMie * mie * 0.9;
    float aTot = a + mie * 0.9;
    gl_FragColor = vec4(sortie, aTot);
  }`;

/* ── Nuages : coque éclairée par le soleil, qui dérive ; disparaît quand on passe dessous ── */
export const NUAGE_VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vMonde;
  void main(){ vUv = uv; vN = normalize(position); vec4 m = modelMatrix * vec4(position, 1.0); vMonde = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`;
export const NUAGE_FRAG = /* glsl */`
  uniform sampler2D uNuages; uniform vec3 uSoleil; uniform float uDecalage, uOpacite;
  varying vec2 vUv; varying vec3 vN; varying vec3 vMonde;
  void main(){
    vec3 n = normalize(vN), L = normalize(uSoleil);
    float a = texture2D(uNuages, vec2(fract(vUv.x + uDecalage), vUv.y)).r;
    float d = dot(n, L);
    float lum = smoothstep(-0.15, 0.25, d) * (max(d, 0.0) * 1.1 + 0.18) + 0.02;
    float alpha = a * uOpacite;
    gl_FragColor = vec4(vec3(1.0, 0.99, 0.97) * lum, alpha);
  }`;

/* ── Bâtiments : volumes extrudés, posés sur le relief (lu au centre de l'empreinte) ── */
export const BAT_VERT = /* glsl */`
  attribute vec3 aRad; attribute vec3 aNorm; attribute vec2 aUvc; attribute float aH;
  uniform sampler2D uRel; uniform vec3 uRelR; uniform float uExag, uRelOk;
  varying vec3 vN; varying float vHaut; varying vec3 vMonde; varying vec3 vUp; varying vec3 vLocal; varying vec2 vId;
  void main(){
    float sol = uRelOk > 0.5 ? max(texture2D(uRel, uRelR.xy + aUvc * uRelR.z).r, 0.0) * 0.001 * uExag : 0.0;
    vec3 p = position + aRad * (sol + aH);
    vN = aNorm; vHaut = aH; vUp = aRad; vLocal = position + aRad * aH; vId = aUvc;
    vec4 m = modelMatrix * vec4(p, 1.0); vMonde = m.xyz;
    gl_Position = projectionMatrix * viewMatrix * m;
  }`;
export const BAT_FRAG = /* glsl */`
  uniform vec3 uSoleil; uniform float uHaze, uLumieres;
  uniform sampler2D uOmbre; uniform mat4 uOmbreM; uniform float uOmbreOn;
  varying vec3 vN; varying float vHaut; varying vec3 vMonde; varying vec3 vUp; varying vec3 vLocal; varying vec2 vId;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  ${OMBRE_BATIMENTS}
  void main(){
    vec3 n = normalize(vN), L = normalize(uSoleil), up = normalize(vUp), V = normalize(-vMonde);
    float id = h21(floor(vId * 4096.0)), id2 = h21(vec2(id * 91.7, 3.3)), id3 = h21(vec2(id * 17.3, 8.1));
    float toit = smoothstep(0.35, 0.7, abs(dot(n, up)));
    // matériaux : pierre claire, crépi, brique, béton ; toits d'ardoise, de tuile ou de zinc
    vec3 pierre = mix(vec3(0.66, 0.61, 0.52), vec3(0.84, 0.78, 0.66), id);
    vec3 mur = id2 < 0.16 ? vec3(0.56, 0.31, 0.23) * mix(0.8, 1.15, id) : (id2 < 0.34 ? vec3(0.58, 0.59, 0.60) * mix(0.85, 1.1, id) : pierre);
    vec3 toitC = id3 < 0.45 ? vec3(0.27, 0.29, 0.33) : (id3 < 0.85 ? vec3(0.50, 0.52, 0.55) : vec3(0.46, 0.27, 0.21));
    // façade : maille de fenêtres (3,2 m × 3,1 m), moyennée quand elle devient plus fine qu'un pixel
    vec3 tg = normalize(cross(up, n) + vec3(1e-6));
    float u = dot(vLocal, tg) * 1000.0 / 3.2, v = vHaut * 1000.0 / 3.1;
    vec2 cell = fract(vec2(u, v)), idc = floor(vec2(u, v));
    float fw = max(fwidth(u), fwidth(v)), net = 1.0 - smoothstep(0.3, 0.75, fw);
    float fen = step(0.16, cell.x) * step(cell.x, 0.84) * step(0.18, cell.y) * step(cell.y, 0.78);
    fen = mix(0.35, fen, net) * (1.0 - toit) * smoothstep(0.003, 0.0075, vHaut);
    float jour = smoothstep(-0.12, 0.18, dot(up, L));
    float ombre = ombreBatiments(vMonde, 0.0004);
    float lam = max(dot(n, L), 0.0) * ombre;
    float ciel = dot(n, up) * 0.5 + 0.5;
    vec3 amb = mix(vec3(0.17, 0.15, 0.13), vec3(0.36, 0.41, 0.50), ciel) * 0.62;
    float ao = mix(0.55, 1.0, smoothstep(0.0, 0.014, vHaut)) * mix(1.0, 0.85, 1.0 - toit);
    vec3 albedo = mix(mur, toitC, toit);
    vec3 H = normalize(L + V);
    vec3 verre = mix(vec3(0.07, 0.10, 0.15), vec3(0.50, 0.64, 0.82) * (0.25 + 0.75 * ciel), 0.55) + vec3(1.0, 0.95, 0.85) * pow(max(dot(n, H), 0.0), 60.0) * 0.8 * ombre;
    vec3 jourCol = albedo * (lam * 1.05 + amb * ao * (0.6 + 0.4 * ombre));
    vec3 verreCol = verre * (lam * 0.8 + amb * 1.4 * ao);
    vec3 colJ = mix(jourCol, verreCol, fen * 0.82);
    // nuit : lueur bleutée du ciel, fenêtres allumées (une sur trois environ), halo chaud des lampadaires près du sol
    float allume = step(0.68, h21(idc + floor(vId * 4096.0) * 0.37)) * fen;
    vec3 chaud = mix(vec3(1.0, 0.70, 0.38), vec3(0.78, 0.86, 1.0), step(0.8, h21(idc + 41.0)));
    vec3 colN = albedo * vec3(0.045, 0.06, 0.10) * ao + chaud * allume * 1.2 * uLumieres + vec3(1.0, 0.65, 0.32) * 0.05 * exp(-vHaut * 1000.0 / 14.0) * (1.0 - toit) * uLumieres;
    vec3 col = mix(colN, colJ, jour);
    float brume = 1.0 - exp(-length(vMonde) / uHaze);
    col = mix(col, vec3(0.42, 0.58, 0.85) * (0.12 + 0.88 * jour) * 0.5, brume * 0.6);
    gl_FragColor = vec4(col, 1.0);
  }`;
