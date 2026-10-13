// Lecture de BodyParts3D (DBCLS, CC BY 4.0) pour les scripts de conversion de Raylé (module partagé, pas chargé par l'application).
//   const bp = ouvrirBP3D(dossierOBJ, dossierTables)   dossierOBJ : « isa_BP3D_4.0_obj_99 » ; dossierTables : contient isa_element_parts.txt et isa_inclusion_relation_list.txt
//   bp.fichiers(nom)     → liste des fichiers FJxxxx d'un concept (par son nom anglais exact), ou null
//   bp.maillage(nom)     → { pos, idx } fusionné, soudé, dans le repère de Raylé (mètres, y vers le haut, face vers +z, côté gauche du patient à x > 0)
//   bp.descendants(id)   → ids des concepts « est un » sous un concept (FMA…)
//   bp.nom(id), bp.id(nom), bp.estFeuille(id)
// Repère BodyParts3D : millimètres, z vers le haut, face vers −y → Raylé : (x, y, z) ↦ (x, z, −y) × 0,001.
import fs from 'node:fs';
import { souder } from './lib-glb.mjs';

const lireTable = f => fs.readFileSync(f, 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t'));

export function ouvrirBP3D(dossierOBJ, dossierTables, arbre = 'isa') {      // arbre : 'isa' (est un) ou 'partof' (fait partie de : cœur, foie, poumons, encéphale en morceaux)
  const elements = lireTable(dossierTables + '/' + arbre + '_element_parts.txt');
  const relations = lireTable(dossierTables + '/' + arbre + '_inclusion_relation_list.txt');
  const parNom = new Map(), parId = new Map(), nomDe = new Map(), idDe = new Map(), enfants = new Map();
  for (const [id, nom, f] of elements) {
    const n = nom.trim(); nomDe.set(id, n); if (!idDe.has(n)) idDe.set(n, id);
    if (!parNom.has(n)) parNom.set(n, new Set()); parNom.get(n).add(f.trim());
    if (!parId.has(id)) parId.set(id, new Set()); parId.get(id).add(f.trim());
  }
  for (const [p, pn, c, cn] of relations) {
    nomDe.set(p, pn.trim()); nomDe.set(c, cn.trim());
    if (!idDe.has(pn.trim())) idDe.set(pn.trim(), p); if (!idDe.has(cn.trim())) idDe.set(cn.trim(), c);
    if (!enfants.has(p)) enfants.set(p, []); enfants.get(p).push(c);
  }
  const cacheOBJ = new Map();
  function lireOBJ(f) {
    if (cacheOBJ.has(f)) return cacheOBJ.get(f);
    const V = [], I = [];
    for (const l of fs.readFileSync(dossierOBJ + '/' + f + '.obj', 'utf8').split('\n')) {
      if (l[0] === 'v' && l[1] === ' ') { const [x, y, z] = l.split(/\s+/).slice(1, 4).map(Number); V.push(x * .001, z * .001, -y * .001); }
      else if (l[0] === 'f') { const t = l.trim().split(/\s+/).slice(1).map(s => parseInt(s) - 1); for (let i = 1; i + 1 < t.length; i++) I.push(t[0], t[i], t[i + 1]); }
    }
    const r = { pos: Float32Array.from(V), idx: Uint32Array.from(I) };
    if (cacheOBJ.size > 400) cacheOBJ.clear();
    cacheOBJ.set(f, r); return r;
  }
  const fusion = parts => { let off = 0; const P = [], I = []; for (const p of parts) { for (let i = 0; i < p.pos.length; i++) P.push(p.pos[i]); for (const i of p.idx) I.push(i + off); off += p.pos.length / 3; } return { pos: Float32Array.from(P), idx: Uint32Array.from(I) }; };
  const existe = f => fs.existsSync(dossierOBJ + '/' + f + '.obj');
  return {
    fichiers: nom => parNom.has(nom) ? [...parNom.get(nom)].filter(existe) : null,
    fichiersId: id => parId.has(id) ? [...parId.get(id)].filter(existe) : null,
    /** Fichiers du concept lui-même, sans ceux de ses sous-parties (le poumon sans ses vaisseaux et ses bronches, le foie sans ses vaisseaux…) */
    fichiersPropres(id) {
      if (!parId.has(id)) return null; const sous = new Set();
      for (const c of enfants.get(id) || []) for (const d of this.descendants(c)) for (const f of parId.get(d) || []) sous.add(f);
      return [...parId.get(id)].filter(f => !sous.has(f) && existe(f));
    },
    maillageFichiers(fichiers) { const m = fusion(fichiers.map(lireOBJ)); return souder(m.pos, m.idx); },
    maillage(nom) { const f = this.fichiers(nom); if (!f || !f.length) return null; return this.maillageFichiers(f); },
    /** Fichiers propres de tous les descendants d'un concept dont le nom vérifie le filtre (expression régulière, insensible à la casse) : le parenchyme d'un poumon = ses segments broncho-pulmonaires */
    fichiersPropresDescendants(id, filtre) {
      const re = new RegExp(filtre, 'i'), res = new Set();
      for (const d of this.descendants(id)) if (re.test(nomDe.get(d) || '')) for (const f of this.fichiersPropres(d) || []) res.add(f);
      return [...res];
    },
    descendants(id) { const vus = new Set(); (function p(i) { if (vus.has(i)) return; vus.add(i); (enfants.get(i) || []).forEach(p); })(id); return [...vus]; },
    nom: id => nomDe.get(id), id: nom => idDe.get(nom), estFeuille: id => !(enfants.get(id) || []).length,
    existe
  };
}

/** Boîte englobante d'un maillage → { min:[x,y,z], max:[x,y,z] } */
export function boite(pos) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { if (pos[i + k] < min[k]) min[k] = pos[i + k]; if (pos[i + k] > max[k]) max[k] = pos[i + k]; }
  return { min, max };
}
