/* ═════════════ ANATOMIE : INDEX DES PIÈCES (module pur : recherche, côtés, mesures, contrôle de cohérence) ═════════════
   Lit assets-lourds/anatomie/index.json (généré par planetes/saturne/outils/anatomie-convertir.mjs). Aucune dépendance au navigateur ni à three.js.
   Un nom absent reste absent (`null`) : l'affichage dit « nom français non précisé », jamais une traduction devinée. */
export const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const MOTS_VIDES = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'os', 'muscle', 'the', 'of', 'montre', 'moi', 'affiche', 'a', 'au', 'aux', 'et', 'sur']);
const COTES = { gauche: 'gauche', gauches: 'gauche', left: 'gauche', droit: 'droit', droite: 'droit', right: 'droit' };
const INV = { gauche: 'droit', droit: 'gauche' };

export function creerIndex(json) {
  const pieces = (json && json.pieces) || [];
  const parId = new Map(pieces.map(p => [p.id, p]));
  const prep = pieces.map(p => ({ p, cles: [p.nom_fr, p.nom_la, p.nom_en].filter(Boolean).map(norm) }));
  /* clé de symétrie : le nom anglais sans « left / right », plus le type */
  const cle = p => norm(String(p.nom_en).replace(/\b(left|right)\b/ig, '')) + '|' + p.systeme;
  const parCle = new Map();
  for (const p of pieces) { const k = cle(p); if (!parCle.has(k)) parCle.set(k, []); parCle.get(k).push(p); }

  const api = {
    pieces, parId, taille: pieces.length,
    /* Ajoute une pièce hors modèle (tracé schématique) : recherche, côtés et voisines la voient comme les autres. */
    ajouter(p) { if (parId.has(p.id)) return; pieces.push(p); parId.set(p.id, p); prep.push({ p, cles: [p.nom_fr, p.nom_la, p.nom_en].filter(Boolean).map(norm) }); const k = cle(p); if (!parCle.has(k)) parCle.set(k, []); parCle.get(k).push(p); api.taille = pieces.length; },
    systemes: () => [...new Set(pieces.map(p => p.systeme))],
    deSysteme: s => pieces.filter(p => p.systeme === s),
    deRegion: r => pieces.filter(p => p.region === r),
    libelle(p, langue = 'fr') { if (!p) return ''; const n = langue === 'la' ? p.nom_la : langue === 'en' ? p.nom_en : p.nom_fr; const c = p.cote && n && !/gauche|droit/i.test(n) && langue === 'fr' ? ' (' + p.cote + ')' : ''; return (n || p.nom_en + (langue === 'fr' ? ' (nom français non précisé)' : '')) + c; },
    /* Recherche : phrase libre (« le fémur gauche », « biceps brachial », « left tibia ») → pièces classées. */
    chercher(texte, { systeme = null, limite = 20 } = {}) {
      const mots = norm(texte).split(' ').filter(Boolean); let cote = null; const util = [];
      for (const m of mots) { if (COTES[m]) cote = COTES[m]; else if (!MOTS_VIDES.has(m)) util.push(m); }
      if (!util.length) return [];
      const phrase = util.join(' '), sortie = [];
      for (const { p, cles } of prep) {
        if (systeme && p.systeme !== systeme) continue;
        if (cote && p.cote && p.cote !== cote) continue;
        let score = 0;
        for (const c of cles) {
          const sans = c.replace(/\b(gauche|droit|droite|left|right)\b/g, '').replace(/\s+/g, ' ').trim();
          if (c === phrase || sans === phrase) score = Math.max(score, 100);
          else if (new RegExp('(^| )' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)').test(sans)) score = Math.max(score, 80 - Math.min(30, sans.length - phrase.length));
          else if (util.every(m => c.includes(m))) score = Math.max(score, 50 - Math.min(20, c.length - phrase.length));
        }
        if (score) { if (cote && p.cote === cote) score += 5; if (p.systeme === 'os' || p.systeme === 'muscles') score += 1; sortie.push({ p, score }); }
      }
      sortie.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
      return sortie.slice(0, limite).map(x => x.p);
    },
    /* La meilleure réponse : une pièce, ou les deux côtés si aucun côté n'est précisé et que les deux sont aussi bons. */
    resoudre(texte, opts = {}) {
      const r = api.chercher(texte, { ...opts, limite: 6 }); if (!r.length) return [];
      const sg = norm(texte).split(' ').some(m => COTES[m]); const premier = r[0];
      if (sg) return [premier];
      const jumeau = api.miroir(premier.id);
      return jumeau && r.some(p => p.id === jumeau.id) ? [premier, jumeau].sort((a, b) => (a.cote === 'droit' ? -1 : 1) - (b.cote === 'droit' ? -1 : 1)) : [premier];
    },
    /* Pièce du côté opposé (comparaison gauche / droite) ; null si la pièce est médiane. */
    miroir(id) {
      const p = parId.get(id); if (!p || !p.cote) return null;
      return (parCle.get(cle(p)) || []).find(q => q.cote === INV[p.cote] && q.id !== p.id) || null;
    },
    centre(p) { const b = p.bornes; return b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2] : null; },
    dimensions(p) { const b = p.bornes; return b ? [b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]] : null; },
    /* Contrôle de cohérence (utilisé par les tests et par l'écran « à propos ») */
    controle() {
      const manques = pieces.filter(p => !p.nom_fr || !p.nom_la), vus = new Set(), doubles = [], sansBornes = [], sansFichier = [];
      for (const p of pieces) { if (vus.has(p.id)) doubles.push(p.id); vus.add(p.id); if (!p.bornes) sansBornes.push(p.id); if (!p.fichier) sansFichier.push(p.id); }
      const parSys = {}; for (const p of pieces) { const s = parSys[p.systeme] = parSys[p.systeme] || { pieces: 0, nomFr: 0 }; s.pieces++; if (p.nom_fr) s.nomFr++; }
      return { total: pieces.length, doubles, sansBornes, sansFichier, sansNomFr: pieces.filter(p => !p.nom_fr).length, sansNomLa: pieces.filter(p => !p.nom_la).length, nomsManquants: manques.length, parSysteme: parSys };
    }
  };
  return api;
}

/* ── mesures (mètres → millimètres / degrés) ── */
export const distanceMm = (a, b) => 1000 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function angleDeg(a, sommet, c) {
  const u = [a[0] - sommet[0], a[1] - sommet[1], a[2] - sommet[2]], v = [c[0] - sommet[0], c[1] - sommet[1], c[2] - sommet[2]];
  const nu = Math.hypot(...u), nv = Math.hypot(...v); if (!nu || !nv) return null;
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv)))) * 180 / Math.PI;
}
