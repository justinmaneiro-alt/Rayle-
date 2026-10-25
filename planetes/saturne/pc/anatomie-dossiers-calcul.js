/* ═════════════ ANATOMIE : DOSSIERS DE FENÊTRES (R3, calcul pur : planetes/saturne/tests/anatomie-dossiers-test.mjs) ═════════════
   Les fiches (os, muscles, vaisseaux, nerfs, organes), les mouvements et les pathologies sont rangés en 7 dossiers : Os, Muscles, Vaisseaux, Nerfs, Organes, Mouvements, Pathologies.
   Chaque pièce du modèle est dans UN dossier (selon son système) ; les identifiants des mouvements et des pathologies sont préfixés (mv: et pa:) pour ne jamais se confondre avec une pièce. */
export const DOSSIERS_ANAT = [
  { id: 'os', titre: 'Os', icone: '🦴', systemes: ['os', 'conjonctif'] },
  { id: 'muscles', titre: 'Muscles', icone: '💪', systemes: ['muscles'] },
  { id: 'vaisseaux', titre: 'Vaisseaux', icone: '🩸', systemes: ['arteres', 'veines', 'lymphatique'] },
  { id: 'nerfs', titre: 'Nerfs', icone: '🧠', systemes: ['nerfs', 'nerfs-periph'] },
  { id: 'organes', titre: 'Organes', icone: '🫀', systemes: ['cerveau', 'coeur', 'respiratoire', 'digestif', 'urinaire', 'genital', 'endocrine', 'sens', 'dents', 'peau'] },
  { id: 'mouvements', titre: 'Mouvements', icone: '🏃', systemes: [] },
  { id: 'pathologies', titre: 'Pathologies', icone: '🩺', systemes: [] }
];
const ETIQUETTE = { 'nerfs-periph': 'schéma', conjonctif: 'modèle 3D' };
export const idMouvement = id => 'mv:' + id, idPatho = id => 'pa:' + id;
export const typeDe = id => (String(id).startsWith('mv:') ? 'mouvement' : String(id).startsWith('pa:') ? 'pathologie' : 'piece');
export const idReel = id => (typeDe(id) === 'piece' ? id : String(id).slice(3));

/* Rend { dossiers: [{ id, titre, icone, ids }], fenetres: { id: { titre, icone, apercu, etat } }, orphelines: [pièces sans dossier] } */
export function construire({ pieces = [], libelle = p => p.nom_fr || p.nom_en || p.id, mouvements = [], pathologies = [] } = {}) {
  const dossiers = DOSSIERS_ANAT.map(d => ({ id: d.id, titre: d.titre, icone: d.icone, ids: [] })), fenetres = {}, orphelines = [];
  const parSysteme = new Map(); for (const d of DOSSIERS_ANAT) for (const s of d.systemes) parSysteme.set(s, d.id);
  const dos = id => dossiers.find(d => d.id === id);
  for (const p of pieces) {
    const cible = parSysteme.get(p.systeme); if (!cible) { orphelines.push(p.id); continue; }
    dos(cible).ids.push(p.id);
    fenetres[p.id] = { titre: libelle(p), icone: DOSSIERS_ANAT.find(d => d.id === cible).icone, apercu: [p.nom_la, p.cote].filter(Boolean).join(' · '), etat: ETIQUETTE[p.systeme] || 'modèle 3D' };
  }
  for (const m of mouvements) { const id = idMouvement(m.id); dos('mouvements').ids.push(id); fenetres[id] = { titre: m.nom, icone: '🏃', apercu: [m.categorie, m.plan ? 'plan ' + m.plan : ''].filter(Boolean).join(' · '), etat: 'simule' }; }
  for (const p of pathologies) { const id = idPatho(p.id); dos('pathologies').ids.push(id); fenetres[id] = { titre: p.nom, icone: '🩺', apercu: [p.categorie, p.niveau].filter(Boolean).join(' · '), etat: 'simule' }; }
  for (const d of dossiers) d.ids.sort((a, b) => String(fenetres[a].titre).localeCompare(String(fenetres[b].titre), 'fr'));
  return { dossiers: dossiers.filter(d => d.ids.length), fenetres, orphelines };
}
