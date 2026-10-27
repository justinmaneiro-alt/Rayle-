// Rendu du QR code dans la console. Le calcul (mode octets, correction L, versions 1 à 9) est dans core/gestes/qr-matrice.js (partagé avec la page : la caméra du téléphone dessine son QR dans le navigateur).
import { createRequire } from 'node:module';
const { matriceQR } = createRequire(import.meta.url)('../core/gestes/qr-matrice.js');
export { matriceQR };

// Texte à afficher dans la console (marge de 2 modules).
export function qrTexte(texte) {
  const mat = matriceQR(texte), n = mat.length, Z = 2;
  const sombre = (x, y) => x >= 0 && y >= 0 && x < n && y < n && mat[y][x];
  const lignes = [];
  for (let y = -Z; y < n + Z; y += 2) {
    let l = '';
    for (let x = -Z; x < n + Z; x++) {
      const h = !sombre(x, y), b = !sombre(x, y + 1);   // true = module clair
      l += h && b ? '█' : h ? '▀' : b ? '▄' : ' ';
    }
    lignes.push(l);
  }
  return lignes.join('\n');
}
