/* ═════════════ DRIVE : outils de texte purs (sans navigateur, testables sous Node) ═════════════
   Normalisation, correspondance approximative de noms, découpage en phrases. */

/** minuscules, sans accents ni ponctuation, apostrophes = espaces : « Cours d’Anatomie » → « cours d anatomie » */
export const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’'`´]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const VIDES = new Set(('le la les l un une des du de d mon ma mes ton ta tes son sa ses ce cet cette ces au aux et en dans sur sous pour par avec a ' +
  'document documents doc docs fichier fichiers drive google gdrive depuis dans mon ma s il te me moi stp svp').split(' '));
export const mots = t => norm(t).split(' ').filter(Boolean);
export const motsUtiles = t => mots(t).filter(m => !VIDES.has(m));

/** distance d'édition de Levenshtein, bornée (renvoie max+1 si dépassée) */
export function distance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let mini = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v); if (v < mini) mini = v;
    }
    if (mini > max) return max + 1;
    prec = cur;
  }
  return prec[b.length];
}

/** à quel point un mot cherché ressemble à un mot du nom : 1 identique, ~0.85 préfixe, ~0.8 faute de frappe, 0 sinon */
export function ressemblance(q, m) {
  if (q === m) return 1;
  if (q.length >= 4 && m.length >= 4 && (m.startsWith(q) || q.startsWith(m))) return 0.85;
  const tol = q.length >= 8 ? 2 : q.length >= 5 ? 1 : 0;
  if (tol && distance(q, m, tol) <= tol) return 0.8;
  return 0;
}

/** score d'un nom de fichier pour une demande (0 à 1) */
export function scoreNom(requete, nom) {
  const nq = norm(requete), nn = norm(nom);
  if (!nq || !nn) return 0;
  if (nq === nn) return 1;
  const q = motsUtiles(requete), n = motsUtiles(nom);
  if (!q.length || !n.length) return 0;
  let somme = 0, couverts = new Set();
  for (const mq of q) {
    let best = 0, bj = -1;
    n.forEach((mn, j) => { const r = ressemblance(mq, mn); if (r > best) { best = r; bj = j; } });
    somme += best; if (bj >= 0 && best > 0) couverts.add(bj);
  }
  const part = somme / q.length;                       // part de la demande retrouvée dans le nom
  if (part < 0.6) return 0;
  const couverture = couverts.size / n.length;         // part du nom évoquée par la demande
  return part * 0.8 + couverture * 0.2;
}

/** retrouve un fichier autorisé par son nom, approximativement.
 *  → { ok:true, fichier } | { ok:false, raison:'aucun'|'ambigu'|'vide', candidats:[…] } */
export function trouverFichier(fichiers, requete) {
  const liste = Array.isArray(fichiers) ? fichiers : [];
  if (!liste.length) return { ok: false, raison: 'vide', candidats: [] };
  const notes = liste.map(f => ({ f, s: scoreNom(requete, f.name) })).filter(x => x.s >= 0.62).sort((a, b) => b.s - a.s);
  if (!notes.length) return { ok: false, raison: 'aucun', candidats: [] };
  if (notes.length > 1 && notes[0].s < 1 && notes[0].s - notes[1].s < 0.08) return { ok: false, raison: 'ambigu', candidats: notes.slice(0, 4).map(x => x.f) };
  return { ok: true, fichier: notes[0].f };
}

/** vrai si la phrase évoque (de façon sûre) un des fichiers connus : sert à ne pas voler d'autres commandes (« ouvre le terminal ») */
export function evoqueFichier(fichiers, requete) {
  return (fichiers || []).some(f => scoreNom(requete, f.name) >= 0.8);
}

const STOP = new Set(('le la les l un une des du de d et ou en dans sur sous pour par avec a au aux ce cet cette ces se sa son ses leur leurs qui que quoi dont ' +
  'est sont etre ete etait il elle ils elles on nous vous je tu ne pas plus ni mais donc car si comme tres aussi ainsi entre vers chez y').split(' '));
export const estMotVide = m => STOP.has(m);

/** découpe en phrases (la ponctuation reste attachée) */
export function phrases(texte) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const sortie = t.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÝŒ0-9«"(\-–—])/u).map(s => s.trim()).filter(Boolean);
  return sortie.length ? sortie : [t];
}

/** coupe un texte long en morceaux lisibles à voix haute (fin de phrase si possible) */
export function morceaux(texte, max = 1200) {
  const sortie = []; let cur = '';
  for (const p of phrases(texte)) {
    if (cur && (cur.length + p.length + 1) > max) { sortie.push(cur); cur = ''; }
    cur += (cur ? ' ' : '') + p;
    while (cur.length > max * 1.5) { sortie.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) sortie.push(cur);
  return sortie;
}

/** nombre écrit ou ordinal français → entier : « deuxième », « 2e », « trois », « dernier » (-1) */
const NOMBRES = { un: 1, une: 1, premier: 1, premiere: 1, deux: 2, deuxieme: 2, second: 2, seconde: 2, trois: 3, troisieme: 3, quatre: 4, quatrieme: 4, cinq: 5, cinquieme: 5, six: 6, sixieme: 6,
  sept: 7, septieme: 7, huit: 8, huitieme: 8, neuf: 9, neuvieme: 9, dix: 10, dixieme: 10, onze: 11, onzieme: 11, douze: 12, douzieme: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, vingtieme: 20, trente: 30 };
export function nombre(s) {
  const t = norm(s);
  if (/^(?:dernier|derniere)$/.test(t)) return -1;
  const m = t.match(/^(\d{1,4})(?: ?(?:e|eme|er|ere|ieme|nd|nde))?$/);
  if (m) return +m[1];
  return NOMBRES[t] || null;
}
export const MOT_NOMBRE = '(?:\\d{1,4}(?: ?(?:e|eme|er|ere|ieme|nd|nde))?|premier|premiere|deuxieme|second|seconde|troisieme|quatrieme|cinquieme|sixieme|septieme|huitieme|neuvieme|dixieme|onzieme|douzieme|vingtieme|dernier|derniere|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)';
