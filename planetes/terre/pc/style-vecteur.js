/* ═════════════ STYLE DES CALQUES VECTORIELS (pur) ═════════════
   Décide, pour un niveau de zoom donné, ce qui est dessiné sur les tuiles et avec quelle apparence (frontières, routes, eau, parcs)
   et quels noms de lieux sont proposés. Schéma des données : OpenMapTiles (OpenFreeMap). Le dessin lui-même est dans rastre-vecteur.js. */
const CYAN = '77,227,255', BLANC = '255,255,255';

/* Frontières : pays toujours ; régions dès le zoom 3 ; départements/communes quand on est assez près. */
export function traitFrontiere(p, z) {
  if (p.maritime === 1) return z >= 4 ? { couleur: `rgba(${CYAN},0.35)`, largeur: 0.9, tirets: [3, 4] } : null;
  const n = p.admin_level, litige = p.disputed === 1 ? [6, 4] : null;
  if (n === 2) return { couleur: `rgba(${CYAN},0.95)`, largeur: z < 4 ? 1.4 : z < 8 ? 2.1 : 2.8, tirets: litige };
  if (n === 3 || n === 4) return z >= 3 ? { couleur: `rgba(${BLANC},0.62)`, largeur: z < 8 ? 1.1 : 1.7, tirets: litige || [7, 4] } : null;
  if (n === 5 || n === 6) return z >= 8 ? { couleur: `rgba(${BLANC},0.38)`, largeur: z < 11 ? 0.9 : 1.3, tirets: litige || [5, 5] } : null;
  if (n >= 7) return z >= 11 ? { couleur: `rgba(${BLANC},0.22)`, largeur: 0.9, tirets: litige || [3, 5] } : null;
  return null;
}

const ROUTES = {                       // classe → [zoom d'apparition, couleur rgba, largeur minimale (px de tuile de 512) au zoom d'apparition, gain par niveau, largeur réelle (m)]
  motorway: [7, '255,190,90,0.85', 1.0, 0.5, 24], trunk: [8, '255,214,130,0.8', 0.9, 0.45, 20],
  primary: [10, '255,255,255,0.7', 0.8, 0.45, 15], secondary: [11, '255,255,255,0.6', 0.7, 0.4, 12],
  tertiary: [12, '255,255,255,0.5', 0.65, 0.38, 9], minor: [13, '255,255,255,0.42', 0.6, 0.33, 7], service: [15, '255,255,255,0.3', 0.5, 0.3, 4],
  track: [14, '230,200,150,0.4', 0.5, 0.2, 3], path: [15, '230,200,150,0.5', 0.5, 0.2, 1.6],
  raceway: [14, '255,255,255,0.3', 0.5, 0.2, 8]
};
/* mParPx : mètres au sol par pixel de la tuile dessinée : à fort zoom, les routes prennent leur largeur réelle (avec un liseré sombre). */
export function traitRoute(p, z, mParPx = 1e9) {
  if (p.class === 'rail' || p.class === 'transit') return z >= (p.class === 'rail' ? 9 : 13) ? { couleur: 'rgba(200,200,215,0.55)', largeur: Math.max(z < 12 ? 0.8 : 1.2, 3 / mParPx), tirets: [4, 3] } : null;
  if (p.class === 'ferry' || p.class === 'aerialway' || p.class === 'bus_guideway') return null;
  const r = ROUTES[p.class]; if (!r || z < r[0]) return null;
  if (p.brunnel === 'tunnel') return { couleur: 'rgba(' + r[1].split(',').slice(0, 3).join(',') + ',0.2)', largeur: Math.max(0.5, r[2] + (z - r[0]) * r[3] * 0.5), tirets: [3, 3] };
  const l = Math.max(r[2] + Math.min(z - r[0], 8) * r[3], r[4] / mParPx);
  const t = { couleur: 'rgba(' + r[1] + ')', largeur: l, tirets: null, ordre: p.class === 'motorway' ? 3 : p.class === 'trunk' ? 2 : 1 };
  if (z >= 15 && l > 2.5) t.lisere = { couleur: 'rgba(8,12,24,0.75)', largeur: l + 2.2 };
  return t;
}
export function traitEau(p, z) {                                   // cours d'eau (lignes)
  const grand = p.class === 'river';
  if (z < (grand ? 6 : 10)) return null;
  return { couleur: 'rgba(90,170,255,0.8)', largeur: grand ? 0.9 + Math.min(z - 6, 6) * 0.25 : 0.7, tirets: null };
}
/* Surfaces teintées (lac, parc) : utiles surtout quand l'imagerie haute résolution est absente ; discrètes sinon. */
export function surface(couche, p, z) {
  const fort = z >= 15 ? 1 : 0;                                    // à fort zoom l'image satellite est floue : le plan prend le relais
  if (couche === 'water') return z >= 9 ? (fort ? 'rgba(30,100,190,0.80)' : 'rgba(40,110,200,0.28)') : null;
  if (couche === 'park') return z >= 11 ? (fort ? 'rgba(46,160,96,0.32)' : 'rgba(40,200,120,0.15)') : null;
  if (couche === 'landcover') return fort && (p.class === 'wood' || p.class === 'grass' || p.class === 'farmland') ? (p.class === 'wood' ? 'rgba(30,110,70,0.28)' : 'rgba(80,150,80,0.16)') : null;
  if (couche === 'landuse') {
    if (z < 12) return null;
    if (p.class === 'residential') return fort ? 'rgba(70,72,86,0.28)' : 'rgba(255,200,120,0.10)';
    if (p.class === 'commercial' || p.class === 'industrial' || p.class === 'retail') return fort ? 'rgba(96,84,120,0.3)' : 'rgba(180,180,255,0.12)';
    if (fort && (p.class === 'cemetery' || p.class === 'playground' || p.class === 'pitch')) return 'rgba(60,130,90,0.5)';
    return null;
  }
  if (couche === 'building') return z >= 14 ? 'rgba(200,120,60,0.38)' : null;
  return null;
}

/* ── Noms de lieux ── */
export const ECHELLE_LIEUX = {          // classe → [zoom d'apparition de la tuile, importance (plus petit = plus important)]
  continent: [0, 0], country: [1, 1], state: [4, 2], province: [5, 2], island: [5, 4],
  city: [3, 3], town: [6, 5], village: [8, 6], suburb: [11, 7], hamlet: [10, 7], quarter: [12, 8], neighbourhood: [13, 8], isolated_dwelling: [13, 9], mer: [2, 3], pic: [11, 6]
};
export function classeLieu(couche, p) {
  if (couche === 'water_name') return p.class === 'ocean' || p.class === 'sea' ? 'mer' : null;
  if (couche === 'mountain_peak') return 'pic';
  if (couche !== 'place') return null;
  const c = p.class;
  return ECHELLE_LIEUX[c] ? c : null;
}
export const nomLieu = p => p['name:fr'] || p.name || p['name_en'] || p['name:latin'] || null;
/* Importance finale d'un lieu : classe, puis rang OpenMapTiles (1 = plus gros), capitale d'abord. */
export function importance(classe, p) {
  const [, base] = ECHELLE_LIEUX[classe];
  const rang = Number.isFinite(p.rank) ? Math.min(p.rank, 20) : 10;
  return base * 100 + (p.capital === 2 ? -30 : p.capital >= 3 ? -10 : 0) + rang;
}
