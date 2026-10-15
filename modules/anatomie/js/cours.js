/* ═════════════ COURS ET DOCUMENTS DE JUSTIN (base de connaissances locale, pour Raylé) ═════════════
   Les cours restent dans le navigateur (IndexedDB « rayle-cours »), jamais envoyés ailleurs sauf les extraits utiles à une question,
   joints au contexte de l'IA. Formats : .txt, .md, .html, .json, .csv (le PDF doit d'abord être converti en texte : copier-coller).
   Recherche : mots-clés pondérés (BM25 simplifié), insensibles aux accents et aux pluriels, par passages de ~700 caractères. */

const NOM_BASE = 'rayle-cours', STORE = 'docs';
const MOTS_VIDES = new Set('le la les un une des du de d l et en au aux a à est sont que qui quoi quel quelle quels quelles ce cet cette ces se sa son ses sur dans par pour avec sans plus moins il elle ils elles on je tu nous vous mon ma mes ton ta tes ne pas ou où y comme mais donc or ni car si dis moi explique parle decris decrire montre peux peut fait faire est ete etre avoir ont'.split(' '));
export const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim();
export const mots = t => norm(t).split(' ').filter(w => w.length > 1 && !MOTS_VIDES.has(w)).map(w => w.length > 4 ? w.replace(/(s|x)$/, '') : w);

let dbp = null;
function ouvrir() {
  if (dbp) return dbp;
  dbp = new Promise((ok, ko) => {
    if (typeof indexedDB === 'undefined') { ko(new Error('IndexedDB indisponible')); return; }
    const r = indexedDB.open(NOM_BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => ok(r.result); r.onerror = () => { dbp = null; ko(r.error); };
  });
  return dbp;
}
const tx = async (mode, fn) => { const db = await ouvrir(); return new Promise((ok, ko) => { const t = db.transaction(STORE, mode), s = t.objectStore(STORE); const r = fn(s); t.oncomplete = () => ok(r && 'result' in r ? r.result : undefined); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error); }); };

/** Découpe un texte en passages de ~700 caractères, en gardant les titres avec leur paragraphe */
export function decouper(texte, taille = 700) {
  const paras = String(texte || '').replace(/\r/g, '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const out = []; let cur = '', titre = '';
  const pousse = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    const estTitre = p.length < 90 && !/[.!?]$/.test(p) && (/^#+\s/.test(p) || /^[A-ZÀ-Ý0-9][^\n]*$/.test(p));
    if (estTitre) { pousse(); titre = p.replace(/^#+\s*/, ''); cur = ''; continue; }
    const morceaux = p.length > taille * 1.4 ? p.match(new RegExp('[^]{1,' + taille + '}(?:\\s|$)', 'g')) || [p] : [p];
    for (const m of morceaux) {
      if ((cur + ' ' + m).length > taille) pousse();
      cur += (cur ? '\n' : (titre ? titre + ' — ' : '')) + m.trim();
    }
  }
  pousse();
  return out;
}
const enTexte = (nom, brut) => {
  if (/\.html?$/i.test(nom)) return brut.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ');
  if (/\.json$/i.test(nom)) { try { const j = JSON.parse(brut); return typeof j === 'string' ? j : JSON.stringify(j, null, 1).replace(/[{}[\]",]/g, ' '); } catch (e) { return brut; } }
  return brut;
};

export async function ajouter({ titre, texte, source }) {
  const t = String(texte || '').trim();
  if (t.length < 20) throw new Error('Le contenu est trop court.');
  const doc = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), titre: String(titre || 'Sans titre').slice(0, 120), source: source || 'saisie', ajoute: Date.now(), taille: t.length, passages: decouper(t) };
  await tx('readwrite', s => s.put(doc));
  vider();
  return doc;
}
export async function importerFichier(fichier) {
  if (/\.pdf$/i.test(fichier.name) || fichier.type === 'application/pdf') throw new Error('Le PDF n’est pas lisible tel quel : ouvre-le, copie le texte et colle-le dans « Ajouter un cours ».');
  if (fichier.size > 4e6) throw new Error('Fichier trop gros (4 Mo maximum).');
  const brut = await fichier.text();
  return ajouter({ titre: fichier.name.replace(/\.[^.]+$/, ''), texte: enTexte(fichier.name, brut), source: fichier.name });
}
export const lister = async () => (await tx('readonly', s => s.getAll())).map(d => ({ id: d.id, titre: d.titre, source: d.source, ajoute: d.ajoute, taille: d.taille, passages: d.passages.length })).sort((a, b) => b.ajoute - a.ajoute);
export async function supprimer(id) { await tx('readwrite', s => s.delete(id)); vider(); }

let cache = null;
const vider = () => { cache = null; };
async function corpus() {
  if (cache) return cache;
  const docs = await tx('readonly', s => s.getAll());
  const passages = [];
  docs.forEach(d => d.passages.forEach((p, i) => passages.push({ doc: d.id, titre: d.titre, i, texte: p, mots: mots(p) })));
  const df = new Map(); passages.forEach(p => new Set(p.mots).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const moy = passages.reduce((s, p) => s + p.mots.length, 0) / (passages.length || 1);
  cache = { passages, df, N: passages.length, moy };
  return cache;
}
/** chercher(question, n) → [{ titre, texte, score }] : les passages les plus proches de la question */
export async function chercher(question, n = 3, extraMots = []) {
  let c; try { c = await corpus(); } catch (e) { return []; }
  if (!c.N) return [];
  const q = Array.from(new Set(mots(question).concat(extraMots.flatMap(mots))));
  if (!q.length) return [];
  const k1 = 1.4, b = .75;
  const res = [];
  for (const p of c.passages) {
    const tf = new Map(); p.mots.forEach(w => tf.set(w, (tf.get(w) || 0) + 1));
    let s = 0, trouves = 0;
    for (const w of q) {
      const f = tf.get(w) || 0; if (!f) continue; trouves++;
      const idf = Math.log(1 + (c.N - (c.df.get(w) || 0) + .5) / ((c.df.get(w) || 0) + .5));
      s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * p.mots.length / c.moy));
    }
    if (trouves) res.push({ titre: p.titre, texte: p.texte, score: s * (1 + trouves / q.length) });
  }
  return res.sort((a, b2) => b2.score - a.score).slice(0, n).filter(r => r.score > .6);
}
/** Extraits prêts à joindre au contexte de l'IA */
export async function contexte(question, extraMots, n = 3) {
  const r = await chercher(question, n, extraMots);
  if (!r.length) return '';
  return "EXTRAITS DES COURS ET DOCUMENTS DE JUSTIN (à utiliser en priorité, en citant le cours entre parenthèses ; ne rien inventer au-delà) :\n" + r.map(x => '— (' + x.titre + ') ' + x.texte.replace(/\s+/g, ' ').slice(0, 700)).join('\n');
}
export const viderCache = vider;
