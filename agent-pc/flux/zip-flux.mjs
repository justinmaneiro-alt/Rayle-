// Lecture d'un fichier ZIP à une seule entrée, en flux, sans dépendance (V4, phase 2) : les archives de data.binance.vision (aggTrades, bookDepth, metrics) contiennent UN fichier CSV.
// On lit le répertoire central en fin de fichier (taille fiable même avec « data descriptor »), puis on décompresse en flux. ZIP64 géré (les gros mois de BTC dépassent 4 Go une fois décompressés).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

export function entreeZip(fichier) {
  const fd = fs.openSync(fichier, 'r');
  try {
    const taille = fs.fstatSync(fd).size, lecture = Math.min(taille, 65557), fin = Buffer.alloc(lecture); fs.readSync(fd, fin, 0, lecture, taille - lecture);
    let eocd = -1; for (let i = lecture - 22; i >= 0; i--) if (fin.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('ZIP : fin de fichier introuvable');
    let nb = fin.readUInt16LE(eocd + 10), tailleCd = fin.readUInt32LE(eocd + 12), debutCd = fin.readUInt32LE(eocd + 16);
    if (nb === 0xFFFF || tailleCd === 0xFFFFFFFF || debutCd === 0xFFFFFFFF) {                                   // ZIP64 : le vrai répertoire central est décrit par l'enregistrement ZIP64 juste avant
      const loc = taille - lecture + eocd - 20, b = Buffer.alloc(20); fs.readSync(fd, b, 0, 20, loc); if (b.readUInt32LE(0) !== 0x07064b50) throw new Error('ZIP64 : localisateur introuvable');
      const off64 = Number(b.readBigUInt64LE(8)), z = Buffer.alloc(56); fs.readSync(fd, z, 0, 56, off64); if (z.readUInt32LE(0) !== 0x06064b50) throw new Error('ZIP64 : enregistrement illisible');
      nb = Number(z.readBigUInt64LE(32)); tailleCd = Number(z.readBigUInt64LE(40)); debutCd = Number(z.readBigUInt64LE(48));
    }
    if (nb < 1) throw new Error('ZIP vide');
    const cd = Buffer.alloc(Math.min(tailleCd, 1 << 20)); fs.readSync(fd, cd, 0, cd.length, debutCd);
    if (cd.readUInt32LE(0) !== 0x02014b50) throw new Error('ZIP : répertoire central illisible');
    const methode = cd.readUInt16LE(10); let tComp = cd.readUInt32LE(20), tNonComp = cd.readUInt32LE(24), decalage = cd.readUInt32LE(42); const lNom = cd.readUInt16LE(28), lExtra = cd.readUInt16LE(30), nom = cd.toString('utf8', 46, 46 + lNom);
    if (tComp === 0xFFFFFFFF || tNonComp === 0xFFFFFFFF || decalage === 0xFFFFFFFF) {                          // valeurs ZIP64 dans le champ supplémentaire 0x0001 (ordre : original, compressé, décalage)
      let p = 46 + lNom; const fin2 = p + lExtra; while (p + 4 <= fin2) { const id = cd.readUInt16LE(p), l = cd.readUInt16LE(p + 2); if (id === 1) { let q = p + 4; if (tNonComp === 0xFFFFFFFF) { tNonComp = Number(cd.readBigUInt64LE(q)); q += 8; } if (tComp === 0xFFFFFFFF) { tComp = Number(cd.readBigUInt64LE(q)); q += 8; } if (decalage === 0xFFFFFFFF) { decalage = Number(cd.readBigUInt64LE(q)); } break; } p += 4 + l; }
    }
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
