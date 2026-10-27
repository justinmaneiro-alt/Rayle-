import { PbfReader } from '../vendor/pbf.js';
import { VectorTile } from '../vendor/vector-tile.js';
import { dessiner, lieux, batiments } from './rastre-vecteur.js';

/* ═════════════ WORKER DES TUILES ═════════════
   Réseau, décodage et dessin des tuiles hors du fil principal : l'affichage ne bloque jamais.
   Messages reçus : { id, type: 'image' | 'relief' | 'vecteur' | 'annuler', ... }.  Réponses : { id, ok, ... } ou { id, ok: false, erreur }. */
const enCours = new Map();

async function telecharger(id, url) {
  const ctl = new AbortController(); enCours.set(id, ctl);
  try {
    const rep = await fetch(url, { signal: ctl.signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!rep.ok) throw new Error('HTTP ' + rep.status);
    return rep;
  } finally { /* le contrôleur reste enregistré jusqu'à la fin du traitement */ }
}

/* Échecs retenus : une tuile absente (404) ou vide à un niveau l'est aussi pour toutes ses descendantes ; on ne la redemande pas. */
const echecs = new Set();
const cleEchec = (c, z, x, y) => c.source + '|' + z + '|' + x + '|' + y;
function dejaEchoue(c) {
  if (c.xs === undefined) return echecs.has(c.url);
  for (let z = 10; z <= c.zSource; z++) { const d = c.zSource - z; if (echecs.has(cleEchec(c, z, c.xs >> d, c.ys >> d))) return true; }
  return false;
}
function retenir(c) { if (c.xs === undefined) echecs.add(c.url); else { echecs.add(cleEchec(c, c.zSource, c.xs, c.ys)); if (echecs.size > 20000) echecs.clear(); } }

/* Une photo aérienne « vide » (hors couverture : blanc uni ou transparent) n'est pas une réponse : on passe à la source suivante. */
function imageVide(bmp) {
  const cv = new OffscreenCanvas(16, 16), cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0, 16, 16);
  const px = cx.getImageData(0, 0, 16, 16).data;
  let blanc = 0, transp = 0, noir = 0;
  for (let i = 0; i < px.length; i += 4) { if (px[i + 3] < 8) transp++; else if (px[i] > 246 && px[i + 1] > 246 && px[i + 2] > 246) blanc++; else if (px[i] < 4 && px[i + 1] < 4 && px[i + 2] < 4) noir++; }
  if (blanc + transp >= 250 || noir >= 252) return true;   // blanc, transparent ou noir pur = hors couverture
  let somme = [0, 0, 0], carre = [0, 0, 0], n = 0;         // aplat uni (mer remplie d'une couleur unique par le serveur) : remplissage, pas une photo
  for (let i = 0; i < px.length; i += 4) { for (let k = 0; k < 3; k++) { somme[k] += px[i + k]; carre[k] += px[i + k] * px[i + k]; } n++; }
  const ecart = k => Math.sqrt(Math.max(0, carre[k] / n - (somme[k] / n) ** 2));
  return Math.max(ecart(0), ecart(1), ecart(2)) < 2.2;
}

async function image({ id, url, candidats }) {
  const liste = candidats && candidats.length ? candidats : [{ url }];
  let derniere = null;
  for (let i = 0; i < liste.length; i++) {
    const c = liste[i];
    if (dejaEchoue(c)) continue;
    try {
      const rep = await telecharger(id, c.url), blob = await rep.blob();
      if (blob.size < 300 && (c.source === 'eox' || c.regional)) throw new Error('tuile vide');   // EOX renvoie une image minuscule hors couverture ; une tuile de mer unie de Blue Marble est valide, elle
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (c.regional && imageVide(bitmap)) { bitmap.close(); throw new Error('hors couverture'); }
      self.postMessage({ id, ok: true, bitmap, utilise: i }, [bitmap]);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      derniere = e; if ((c.regional || c.source === 'mapterhorn') && /HTTP 404|HTTP 400|hors couverture|vide/.test(String(e && e.message))) retenir(c);
    }
  }
  throw derniere || new Error('aucune source');
}

async function relief({ id, url, candidats }) {
  const liste = candidats && candidats.length ? candidats : [{ url }];
  let derniere = null;
  for (let i = 0; i < liste.length; i++) {
    const c = liste[i];
    if (dejaEchoue(c)) continue;
    try {
      const rep = await telecharger(id, c.url), blob = await rep.blob();
      const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const w = bmp.width, h = bmp.height, cv = new OffscreenCanvas(w, h), cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0); bmp.close();
      const px = cx.getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
      let min = Infinity, max = -Infinity;
      for (let k = 0, j = 0; k < m.length; k++, j += 4) {
        const v = px[j] * 256 + px[j + 1] + px[j + 2] / 256 - 32768;      // Terrarium : hauteur en mètres
        m[k] = v; if (v < min) min = v; if (v > max) max = v;
      }
      self.postMessage({ id, ok: true, w, h, hauteurs: m.buffer, min, max, utilise: i }, [m.buffer]);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      derniere = e; if (c.source === 'mapterhorn' && /HTTP 404/.test(String(e && e.message))) retenir(c);
    }
  }
  throw derniere || new Error('aucune source de relief');
}

/* Une tuile vectorielle de niveau 14 sert jusqu'à 64 tuiles affichées plus fines : téléchargée et décodée une seule fois (petit cache LRU). */
const cacheVecteur = new Map();
function tuileVectorielle(id, url) {
  let p = cacheVecteur.get(url);
  if (p) { cacheVecteur.delete(url); cacheVecteur.set(url, p); return p; }
  const cle = 'v:' + url;                                           // ce téléchargement est partagé : une annulation d'une tuile ne doit pas le couper
  p = (async () => { try { const rep = await telecharger(cle, url), buf = await rep.arrayBuffer(); return new VectorTile(new PbfReader(new Uint8Array(buf))); } finally { enCours.delete(cle); } })();
  cacheVecteur.set(url, p); p.catch(() => cacheVecteur.delete(url));
  if (cacheVecteur.size > 8) cacheVecteur.delete(cacheVecteur.keys().next().value);
  return p;
}
async function vecteur({ id, url, z, x, y, zs, xs, ys, rect, taille, batiments: avecB, batiments2D, lat, sansSurfaces }) {
  const vt = await tuileVectorielle(id, url);
  const cv = new OffscreenCanvas(taille, taille), cx = cv.getContext('2d');
  dessiner(cx, vt, { zAff: z, taille, rect, avecBatiments2D: batiments2D !== false, lat, sansSurfaces: !!sansSurfaces });
  const bitmap = cv.transferToImageBitmap();
  const l = lieux(vt, { z, x, y, zs, xs, ys, rect });
  const b = avecB ? batiments(vt, { z, x, y, zs, xs, ys, rect }) : null;
  const transfert = [bitmap];
  let bat = null;
  if (b) { bat = { pos: b.pos, rad: b.rad, nrm: b.nrm, uvc: b.uvc, h: b.h, idx: b.idx, n: b.n }; transfert.push(b.pos.buffer, b.rad.buffer, b.nrm.buffer, b.uvc.buffer, b.h.buffer, b.idx.buffer); }
  self.postMessage({ id, ok: true, bitmap, lieux: l, batiments: bat }, transfert);
}

const TRAITEMENTS = { image, relief, vecteur };
self.onmessage = async ({ data }) => {
  if (data.type === 'annuler') { const c = enCours.get(data.id); if (c) c.abort(); return; }
  const f = TRAITEMENTS[data.type]; if (!f) return;
  try { await f(data); }
  catch (e) { self.postMessage({ id: data.id, ok: false, erreur: e && e.name === 'AbortError' ? 'annulé' : String(e && e.message || e) }); }
  finally { enCours.delete(data.id); }
};
