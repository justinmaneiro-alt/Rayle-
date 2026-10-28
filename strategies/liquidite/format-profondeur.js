/* ═════════════ FORMAT BINAIRE DE LA PROFONDEUR (V4, phase 2 ; module pur, testé : galaxie/tests/flux-format-test.mjs) ═════════════
   Une seconde de carnet = une « tranche » par côté (≈ 300 tranches de 0,02 % = ±3 %), chaque valeur en DOLLARS de liquidité posée, quantifiée sur 16 bits à l'échelle logarithmique :
       q = min(65535, round(4096 · log2(1 + usd / unité)))      usd = unité · (2^(q / 4096) − 1)
   Précision relative ≈ 0,017 % partout, plafond ≈ 65 535 × unité (unité = 100 $ → 6,5 M$ par tranche ; au-delà on écrête : un mur énorme reste un mur énorme).
   Fichier : en-tête de 16 octets (« RFL1 », nombre de tranches, pas en %, unité en $) puis des enregistrements successifs (taille fixe) :
       tSec u32 · meilleur bid f64 · meilleur ask f64 · couverture basse f32 (%) · couverture haute f32 (%) · tranches bid u16[n] · tranches ask u16[n]
   La couverture dit jusqu'où le carnet est GARANTI complet (au-delà : « non observé », pas « vide »). */
export const MAGIE = 'RFL1', TAILLE_ENTETE = 16;
export const tailleEnregistrement = n => 4 + 8 + 8 + 4 + 4 + 4 * n;
export const quantifier = (usd, unite) => { if (!(usd > 0)) return 0; const q = Math.round(4096 * Math.log2(1 + usd / unite)); return q > 65535 ? 65535 : q; };
export const dequantifier = (q, unite) => (q > 0 ? unite * (Math.pow(2, q / 4096) - 1) : 0);

export function encoderEntete({ nTranches, pasPct, unite }) {
  const b = new Uint8Array(TAILLE_ENTETE), dv = new DataView(b.buffer);
  for (let i = 0; i < 4; i++) b[i] = MAGIE.charCodeAt(i);
  dv.setUint16(4, nTranches, true); dv.setFloat32(6, pasPct, true); dv.setFloat32(10, unite, true); return b;
}
export function decoderEntete(octets) {
  if (octets.length < TAILLE_ENTETE) return null; const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  for (let i = 0; i < 4; i++) if (octets[i] !== MAGIE.charCodeAt(i)) return null;
  return { nTranches: dv.getUint16(4, true), pasPct: dv.getFloat32(6, true), unite: dv.getFloat32(10, true) };
}
/* Encode UNE seconde. `tr` = résultat de Livre.tranches (bid / ask en $). */
export function encoderEnregistrement(tSec, tr, { nTranches, unite }) {
  const b = new Uint8Array(tailleEnregistrement(nTranches)), dv = new DataView(b.buffer);
  dv.setUint32(0, tSec, true); dv.setFloat64(4, tr.meilleurBid, true); dv.setFloat64(12, tr.meilleurAsk, true); dv.setFloat32(20, tr.couvBasPct, true); dv.setFloat32(24, tr.couvHautPct, true);
  let o = 28; for (let i = 0; i < nTranches; i++, o += 2) dv.setUint16(o, quantifier(tr.bid[i], unite), true); for (let i = 0; i < nTranches; i++, o += 2) dv.setUint16(o, quantifier(tr.ask[i], unite), true);
  return b;
}
/* Décode tous les enregistrements complets d'un fichier (un enregistrement coupé à la fin — arrêt brutal — est simplement ignoré). */
export function decoderFichier(octets) {
  const e = decoderEntete(octets); if (!e) return null;
  const taille = tailleEnregistrement(e.nTranches), dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength), out = [];
  for (let p = TAILLE_ENTETE; p + taille <= octets.length; p += taille) {
    const bid = new Float32Array(e.nTranches), ask = new Float32Array(e.nTranches); let o = p + 28;
    for (let i = 0; i < e.nTranches; i++, o += 2) bid[i] = dequantifier(dv.getUint16(o, true), e.unite); for (let i = 0; i < e.nTranches; i++, o += 2) ask[i] = dequantifier(dv.getUint16(o, true), e.unite);
    out.push({ tSec: dv.getUint32(p, true), meilleurBid: dv.getFloat64(p + 4, true), meilleurAsk: dv.getFloat64(p + 12, true), couvBasPct: dv.getFloat32(p + 20, true), couvHautPct: dv.getFloat32(p + 24, true), bid, ask });
  }
  return { entete: e, enregistrements: out, tronque: (octets.length - TAILLE_ENTETE) % taille !== 0 };
}

/* Plusieurs fichiers de profondeur bout à bout (réponse de la route locale) : pour chacun, un entier 32 bits (longueur) puis le fichier (en-tête + enregistrements). L'unité peut changer d'un fichier à l'autre :
   chaque segment est décodé avec SON en-tête. Rend { entete (celle du dernier segment), enregistrements }. */
export function encoderSegments(fichiers) { const t = fichiers.reduce((a, f) => a + 4 + f.length, 0), out = new Uint8Array(t), dv = new DataView(out.buffer); let p = 0; for (const f of fichiers) { dv.setUint32(p, f.length, true); out.set(f, p + 4); p += 4 + f.length; } return out; }
export function decoderSegments(octets) {
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength), tous = []; let entete = null;
  for (let p = 0; p + 4 <= octets.length;) { const l = dv.getUint32(p, true); if (p + 4 + l > octets.length) break; const d = decoderFichier(octets.subarray(p + 4, p + 4 + l)); if (d) { entete = d.entete; for (const r of d.enregistrements) tous.push(r); } p += 4 + l; }
  return { entete, enregistrements: tous };
}

/* Décode UN enregistrement (octets de `encoderEnregistrement`) avec son en-tête : sert au mode direct du navigateur (mémoire) qui n'écrit pas de fichier. */
export function decoderEnregistrement(octets, entete) {
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength), n = entete.nTranches, bid = new Float32Array(n), ask = new Float32Array(n); let o = 28;
  for (let i = 0; i < n; i++, o += 2) bid[i] = dequantifier(dv.getUint16(o, true), entete.unite); for (let i = 0; i < n; i++, o += 2) ask[i] = dequantifier(dv.getUint16(o, true), entete.unite);
  return { tSec: dv.getUint32(0, true), meilleurBid: dv.getFloat64(4, true), meilleurAsk: dv.getFloat64(12, true), couvBasPct: dv.getFloat32(20, true), couvHautPct: dv.getFloat32(24, true), bid, ask };
}
