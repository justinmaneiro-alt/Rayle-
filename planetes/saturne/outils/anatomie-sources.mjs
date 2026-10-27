/* ═════════════ ANATOMIE : TÉLÉCHARGEMENT ET LECTURE DES SOURCES (outil hors site) ═════════════
   Sources OUVERTES utilisées (voir CREDITS.md) :
   · BodyParts3D 4.0 (The Database Center for Life Science, CC BY 4.0) : 2 234 maillages anatomiques d'un homme adulte de référence, tels qu'empaquetés
     et simplifiés (meshoptimizer, erreur ≤ 0,2 %) par le dépôt MIT « ashemag/human-atlas » (public/models/atlas.json + body-N.bin.gz) ;
   · Terminologia Anatomica 2 (liste de 7 300 termes anglais / latins / français) du dépôt « Z-Anatomy/Models-of-human-anatomy » (TA2.csv, CC BY-SA 4.0).
   Ce script ne fait que télécharger dans assets-lourds/_sources/ (exclu de git), vérifier les tailles et enregistrer la provenance.
   Les fichiers téléchargés sont des DONNÉES NON FIABLES : ils ne sont jamais exécutés ni évalués, seulement lus comme JSON, binaire ou CSV. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const DOSSIER_SOURCES = path.join(RACINE, 'assets-lourds', '_sources');
const ATLAS_BASE = 'https://raw.githubusercontent.com/ashemag/human-atlas/main/public/models/';
const TA2_URL = 'https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/master/TA2.csv';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

async function telecharger(url, destination, { octetsAttendus = null } = {}) {
  if (fs.existsSync(destination) && (octetsAttendus === null || fs.statSync(destination).size === octetsAttendus)) return fs.readFileSync(destination);
  const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status + ' : ' + url);
  const b = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, b); return b;
}

/* Télécharge (ou relit) l'atlas : { atlas, chunks: [Buffer], ta2: texte, provenance } */
export async function chargerSources({ verbeux = true } = {}) {
  const dossier = path.join(DOSSIER_SOURCES, 'human-atlas');
  const atlasBuf = await telecharger(ATLAS_BASE + 'atlas.json', path.join(dossier, 'atlas.json'));
  const atlas = JSON.parse(atlasBuf.toString('utf8'));
  if (!atlas || !Array.isArray(atlas.parts) || !Array.isArray(atlas.chunks)) throw new Error('atlas.json inattendu');
  const chunks = [], hashes = {};
  for (const c of atlas.chunks) {
    const nom = c.url.split('/').pop(), gz = (c.gzip || c.url + '.gz').split('/').pop();
    const brut = path.join(dossier, nom);
    let b;
    if (fs.existsSync(brut) && fs.statSync(brut).size === c.bytes) b = fs.readFileSync(brut);
    else { const g = await telecharger(ATLAS_BASE + gz, path.join(dossier, gz)); b = g[0] === 0x1f && g[1] === 0x8b ? zlib.gunzipSync(g) : g; fs.writeFileSync(brut, b); }
    if (b.length !== c.bytes) throw new Error('fragment incomplet : ' + nom + ' (' + b.length + ' au lieu de ' + c.bytes + ')');
    chunks.push(b); hashes[nom] = sha(b); if (verbeux) process.stdout.write('.');
  }
  const ta2 = (await telecharger(TA2_URL, path.join(DOSSIER_SOURCES, 'ta2', 'TA2.csv'))).toString('utf8');
  const provenance = { date: new Date().toISOString().slice(0, 10), atlas: { source: 'https://github.com/ashemag/human-atlas (MIT pour le code ; données BodyParts3D 4.0, CC BY 4.0)', sha256_atlas_json: sha(atlasBuf), sha256_chunks: hashes, version: atlas.version, parts: atlas.parts.length, concepts: atlas.concepts.length, triangles: atlas.triangles }, ta2: { source: 'https://github.com/Z-Anatomy/Models-of-human-anatomy (TA2.csv, CC BY-SA 4.0)', sha256: sha(Buffer.from(ta2, 'utf8')), lignes: ta2.split('\n').length } };
  fs.writeFileSync(path.join(DOSSIER_SOURCES, 'provenance.json'), JSON.stringify(provenance, null, 2));
  if (verbeux) console.log('\nsources prêtes :', provenance.atlas.parts, 'pièces,', provenance.atlas.triangles, 'triangles');
  return { atlas, chunks, ta2, provenance };
}

/* Géométrie d'une pièce : positions float32 (mètres, Y vers le haut), normales int16 normalisées, indices uint32. Copies (le tampon source peut être non aligné). */
export function geometriePiece(atlas, chunks, p) {
  const b = chunks[p.chunk];
  const copie = (Type, off, n) => new Type(b.buffer.slice(b.byteOffset + off, b.byteOffset + off + n * Type.BYTES_PER_ELEMENT));
  return { positions: copie(Float32Array, p.positions, p.vertexCount * 3), normales: copie(Int16Array, p.normals, p.vertexCount * 3), indices: copie(Uint32Array, p.indices, p.indexCount) };
}

/* Terminologia Anatomica 2 : [{ id, en, la, fr }] ; les lignes illisibles sont ignorées (jamais interprétées). */
export function lireTA2(texte) {
  const sortie = [];
  for (const ligne of texte.split(/\r?\n/)) {
    const l = ligne.replace(/^﻿/, '').replace(/^"|"$/g, '');
    const c = l.split(';'); if (c.length < 4 || !/^\d+$/.test(c[0])) continue;
    sortie.push({ id: +c[0], en: c[1].trim(), la: c[2].trim(), fr: c[3].trim().replace(/^\./, '') });
  }
  return sortie;
}
