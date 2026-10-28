// Lecture d'un fichier ZIP à une seule entrée, en flux, sans dépendance (V4, phase 2) : les archives de data.binance.vision (aggTrades, bookDepth, metrics) contiennent UN fichier CSV.
// On lit le répertoire central en fin de fichier (taille fiable même avec « data descriptor »), puis on décompresse en flux. Pas de ZIP64 (fichiers < 4 Go).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

export function entreeZip(fichier) {
  const fd = fs.openSync(fichier, 'r');
  try {
    const taille = fs.fstatSync(fd).size, lecture = Math.min(taille, 65557), fin = Buffer.alloc(lecture); fs.readSync(fd, fin, 0, lecture, taille - lecture);
    let eocd = -1; for (let i = lecture - 22; i >= 0; i--) if (fin.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('ZIP : fin de fichier introuvable');
    const nb = fin.readUInt16LE(eocd + 10), tailleCd = fin.readUInt32LE(eocd + 12), debutCd = fin.readUInt32LE(eocd + 16);
    if (nb < 1) throw new Error('ZIP vide'); if (debutCd === 0xFFFFFFFF || tailleCd === 0xFFFFFFFF) throw new Error('ZIP64 non géré');
    const cd = Buffer.alloc(Math.min(tailleCd, 1 << 20)); fs.readSync(fd, cd, 0, cd.length, debutCd);
    if (cd.readUInt32LE(0) !== 0x02014b50) throw new Error('ZIP : répertoire central illisible');
    const methode = cd.readUInt16LE(10), tComp = cd.readUInt32LE(20), tNonComp = cd.readUInt32LE(24), lNom = cd.readUInt16LE(28), decalage = cd.readUInt32LE(42), nom = cd.toString('utf8', 46, 46 + lNom);
    if (tComp === 0xFFFFFFFF) throw new Error('ZIP64 non géré');
    const loc = Buffer.alloc(30); fs.readSync(fd, loc, 0, 30, decalage); if (loc.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP : en-tête local illisible');
    const debut = decalage + 30 + loc.readUInt16LE(26) + loc.readUInt16LE(28);
    return { nom, methode, tailleCompressee: tComp, tailleOriginale: tNonComp, debut };
  } finally { fs.closeSync(fd); }
}
/* Flux décompressé du premier fichier du ZIP. */
export function ouvrirZip(fichier) {
  const e = entreeZip(fichier), brut = fs.createReadStream(fichier, { start: e.debut, end: e.debut + e.tailleCompressee - 1, highWaterMark: 1 << 20 });
  if (e.methode === 0) return { ...e, flux: brut }; if (e.methode !== 8) throw new Error('ZIP : méthode ' + e.methode + ' non gérée');
  return { ...e, flux: brut.pipe(zlib.createInflateRaw()) };
}
/* Lit un flux octet par octet et appelle `ligne(texte)` pour chaque ligne (sans tout garder en mémoire). Rend le nombre de lignes. */
export async function lireLignes(flux, ligne) {
  let reste = '', n = 0; const dec = new TextDecoder('utf-8');
  for await (const morceau of flux) {
    const texte = reste + dec.decode(morceau, { stream: true }); let debut = 0, i;
    while ((i = texte.indexOf('\n', debut)) >= 0) { const l = texte.charCodeAt(i - 1) === 13 ? texte.slice(debut, i - 1) : texte.slice(debut, i); debut = i + 1; if (l) { ligne(l); n++; } }
    reste = texte.slice(debut);
  }
  if (reste) { ligne(reste); n++; } return n;
}
export const fluxDepuisOctets = b => Readable.from([b]);
