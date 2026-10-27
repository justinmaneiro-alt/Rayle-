/* ═════════════ ANATOMIE : CONVERSION (BodyParts3D → GLB Meshopt par système + index) — outil hors site ═════════════
   Usage : node anatomie-convertir.mjs      Sortie : assets-lourds/anatomie/*.glb + index.json (exclus de git, voir assets-lourds/LISEZMOI.md).
   Aucune donnée téléchargée n'est exécutée : seulement lue (JSON, binaire, CSV). Les noms non résolus restent en anglais, drapeau `traduction: 'absente'`. */
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { RACINE, chargerSources, geometriePiece, lireTA2 } from './anatomie-sources.mjs';
import { ARTERES, VEINES } from '../pc/anatomie-vaisseaux.js';
import { CERVEAU } from '../pc/anatomie-cerveau.js';
import { MUSCLES } from '../pc/anatomie-muscles.js';
import { creerResolveur, systemePiece, typePiece, regionPiece } from './anatomie-noms.mjs';

const SORTIE = path.join(RACINE, 'assets-lourds', 'anatomie');
const PAR_FICHIER = 150;
const COULEURS = { os: [0.62, 0.58, 0.5], dents: [0.95, 0.94, 0.9], conjonctif: [0.7, 0.75, 0.8], muscles: [0.62, 0.16, 0.14], arteres: [0.8, 0.1, 0.1], veines: [0.15, 0.25, 0.75], nerfs: [0.95, 0.85, 0.3], coeur: [0.7, 0.12, 0.15], cerveau: [0.78, 0.66, 0.68], digestif: [0.75, 0.5, 0.4], respiratoire: [0.8, 0.6, 0.65], urinaire: [0.8, 0.7, 0.35], genital: [0.7, 0.5, 0.6], endocrine: [0.85, 0.6, 0.3], lymphatique: [0.4, 0.8, 0.5], sens: [0.6, 0.75, 0.85], peau: [0.85, 0.7, 0.6], autre: [0.7, 0.7, 0.7] };
const NOMS_SYSTEMES = { os: 'Squelette', dents: 'Dents', conjonctif: 'Ligaments, cartilages, disques', muscles: 'Muscles', arteres: 'Artères', veines: 'Veines', nerfs: 'Nerfs crâniens de l’orbite', coeur: 'Cœur', cerveau: 'Encéphale (cerveau, tronc cérébral, cervelet)', digestif: 'Appareil digestif', respiratoire: 'Appareil respiratoire', urinaire: 'Appareil urinaire', genital: 'Appareil génital', endocrine: 'Glandes endocrines', lymphatique: 'Système lymphatique', sens: 'Organes des sens', peau: 'Peau et phanères', autre: 'Autres' };

const s = await chargerSources({ verbeux: false });
/* Noms français et latins des fiches rédigées : complètent TA2 quand il ne correspond pas */
const manuels = {};
for (const d of [ARTERES, VEINES, CERVEAU]) for (const [k, f] of Object.entries(d)) manuels[k.replace(/-/g, ' ')] = { fr: f.fr, la: f.la };
for (const k of Object.keys(CERVEAU)) for (const [en, fr, la] of [['anterior', 'partie antérieure', 'pars anterior'], ['posterior', 'partie postérieure', 'pars posterior']]) manuels[en + ' part of ' + k] = { fr: CERVEAU[k].fr + ' (' + fr + ')', la: CERVEAU[k].la + ', ' + la };
const res = creerResolveur(lireTA2(s.ta2), manuels);
await MeshoptEncoder.ready;

const pieces = s.atlas.parts.map(p => {
  const r = res(p.name), b = p.bounds;
  const bornes = Array.isArray(b) ? (Array.isArray(b[0]) ? b : [b.slice(0, 3), b.slice(3, 6)]) : null;
  const systeme = systemePiece(p.name, p.system);
  return { p, r, systeme, type: typePiece(p.name, p.system), region: regionPiece(p.name, bornes), bornes };
});
/* Couche des muscles (1 superficielle, 2 intermédiaire, 3 profonde) : distance au centre de l'os le plus proche, classée en tiers PAR RÉGION. Estimation géométrique, indicative. */
{
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), centre = x => x.bornes && [(x.bornes[0][0] + x.bornes[1][0]) / 2, (x.bornes[0][1] + x.bornes[1][1]) / 2, (x.bornes[0][2] + x.bornes[1][2]) / 2];
  const os = pieces.filter(x => x.type === 'os' && x.bornes).map(centre), parRegion = {};
  for (const x of pieces) if (x.type === 'muscle' && x.bornes) { const c = centre(x); x.d = Math.min(...os.map(o => dist(o, c))); (parRegion[x.region] = parRegion[x.region] || []).push(x); }
  for (const l of Object.values(parRegion)) { l.sort((a, b) => a.d - b.d); l.forEach((x, i) => { x.couche = i < l.length / 3 ? 3 : i < 2 * l.length / 3 ? 2 : 1; }); }
}
fs.mkdirSync(SORTIE, { recursive: true }); for (const f of fs.readdirSync(SORTIE)) fs.rmSync(path.join(SORTIE, f), { force: true });

const parSysteme = {};
for (const x of pieces) (parSysteme[x.systeme] = parSysteme[x.systeme] || []).push(x);
const index = { version: 1, source: 'BodyParts3D 4.0 (CC BY 4.0) via human-atlas (MIT) ; noms TA2 (CC BY-SA 4.0)', systemes: {}, pieces: [] };
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

for (const [sys, liste] of Object.entries(parSysteme)) {
  liste.sort((a, b) => a.p.id.localeCompare(b.p.id));
  const fichiers = [];
  for (let i = 0; i < liste.length; i += PAR_FICHIER) {
    const lot = liste.slice(i, i + PAR_FICHIER), nomF = `${sys}-${fichiers.length + 1}.glb`;
    const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene(sys);
    const mat = doc.createMaterial(sys).setBaseColorFactor([...COULEURS[sys] || COULEURS.autre, 1]).setRoughnessFactor(0.65).setMetallicFactor(0);
    for (const x of lot) {
      const g = geometriePiece(s.atlas, s.chunks, x.p);
      const pos = doc.createAccessor().setType('VEC3').setArray(g.positions).setBuffer(buf);
      const nor = doc.createAccessor().setType('VEC3').setArray(g.normales).setNormalized(true).setBuffer(buf);
      const idx = doc.createAccessor().setType('SCALAR').setArray(g.indices).setBuffer(buf);
      const prim = doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nor).setIndices(idx).setMaterial(mat);
      const mesh = doc.createMesh(x.p.id).addPrimitive(prim);
      scene.addChild(doc.createNode(x.p.id).setMesh(mesh));
      index.pieces.push({ id: x.p.id, fma: x.p.conceptId || null, nom_en: x.p.name, nom_la: x.r.nom_la, nom_fr: x.r.nom_fr, traduction: x.r.traduction, couche: x.couche || null, source_nom: x.r.source, systeme: sys, type: x.type, region: x.region, cote: x.r.cote, bornes: x.bornes, triangles: Math.round(x.p.indexCount / 3), fichier: nomF });
    }
    await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await io.write(path.join(SORTIE, nomF), doc);
    fichiers.push({ nom: nomF, octets: fs.statSync(path.join(SORTIE, nomF)).size, pieces: lot.length });
  }
  index.systemes[sys] = { nom: NOMS_SYSTEMES[sys], pieces: liste.length, triangles: liste.reduce((a, x) => a + Math.round(x.p.indexCount / 3), 0), fichiers };
  console.log(sys.padEnd(13), String(liste.length).padStart(4), 'pièces', fichiers.map(f => (f.octets / 1048576).toFixed(1) + ' Mo').join(' '));
}
fs.writeFileSync(path.join(SORTIE, 'index.json'), JSON.stringify(index));
const manPath = path.join(RACINE, 'assets-lourds', 'manifeste.json'), man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
for (const [sys, v] of Object.entries(index.systemes)) man.systemes['anatomie-' + sys] = { nom: v.nom, parties: v.fichiers.map(f => ({ id: f.nom.replace('.glb', ''), fichier: 'anatomie/' + f.nom, octets: f.octets })) };
man.index_anatomie = 'anatomie/index.json'; fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
console.log('index :', index.pieces.length, 'pièces ;', (fs.statSync(path.join(SORTIE, 'index.json')).size / 1024).toFixed(0), 'Ko');
