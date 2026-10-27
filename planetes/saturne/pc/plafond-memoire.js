/* ═════════════ PLAFOND DE MÉMOIRE DES MODÈLES LOURDS (pur : testé sous Node) ═════════════
   Chaque modèle chargé occupe de la mémoire (géométries, textures). Quand le total dépasse le plafond, on libère les modèles les moins récemment utilisés qui ne sont
   pas protégés (affichés ou en cours de chargement). Les octets sont ESTIMÉS d'après les tableaux de sommets et les images : c'est un ordre de grandeur, pas une mesure du GPU. */
export const MO = 1024 * 1024;
/* entrees : [{ id, octets, dernierUsage, protege }] ; renvoie les identifiants à libérer, du plus ancien au plus récent, jusqu'à repasser sous le plafond. */
export function choisirEviction(entrees, plafondOctets) {
  let total = entrees.reduce((s, e) => s + (e.octets || 0), 0);
  const candidats = entrees.filter(e => !e.protege).sort((a, b) => a.dernierUsage - b.dernierUsage), sortie = [];
  for (const e of candidats) { if (total <= plafondOctets) break; sortie.push(e.id); total -= e.octets || 0; }
  return sortie;
}
/* Estimation des octets d'une scène three.js (géométries + textures), sans dépendre de three : on lit les champs standards. */
export function octetsEstimes(racine) {
  const vus = new Set(); let total = 0;
  const geo = g => { if (!g || vus.has(g.uuid)) return; vus.add(g.uuid); for (const a of Object.values(g.attributes || {})) total += (a.array ? a.array.byteLength : 0); if (g.index && g.index.array) total += g.index.array.byteLength; };
  const tex = t => { if (!t || vus.has(t.uuid)) return; vus.add(t.uuid); const im = t.image; if (im && im.width && im.height) total += im.width * im.height * 4 * 1.33; };
  racine.traverse(o => {
    if (o.geometry) geo(o.geometry);
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) tex(m[k]);
  });
  return total;
}
/* Adresse de base des modèles lourds : réglable (hébergement externe plus tard, par exemple Cloudflare R2) sans rien changer au code. Ordre : variable globale, réglage de l'appareil, dossier local. */
export function resoudreUrlBase({ globale = null, stockage = null, base = '' } = {}) {
  const sure = u => { if (!u) return null; try { const x = new URL(u, base || 'http://localhost/'); return /^https?:$/.test(x.protocol) ? x.href.replace(/\/?$/, '/') : null; } catch (e) { return null; } };
  return sure(globale) || sure(stockage) || sure('assets-lourds/');
}
