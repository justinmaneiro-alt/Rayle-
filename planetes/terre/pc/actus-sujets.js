import { dateRelative, urlSure } from './actus-contenu.js';

/* ═════════════ SUJETS D'ACTUALITÉ SUR LA TERRE (pur, testé) ═════════════
   Transforme la réponse du Worker (/actualites/fil) en données d'affichage : couleur par catégorie, taille de balise selon le nombre de médias,
   cartes holographiques rangées sans chevauchement, bandeau défilant, découpage de la réponse parlée de Raylé en segments [1], [2]… (un par sujet).
   Rien n'est inventé : titre, média, date et lien viennent des flux ; la localisation est donnée comme « estimée » quand elle ne vient pas du flux. */
export const CATEGORIES = {
  politique: { nom: 'Politique', couleur: '#ff9ad5' }, economie: { nom: 'Économie', couleur: '#ffd24d' }, international: { nom: 'International', couleur: '#ff7a45' },
  societe: { nom: 'Société', couleur: '#4de3ff' }, justice: { nom: 'Justice et faits divers', couleur: '#ff5470' }, sport: { nom: 'Sport', couleur: '#7dff9c' },
  culture: { nom: 'Culture', couleur: '#c08bff' }, sciences: { nom: 'Sciences et technologies', couleur: '#6ea8ff' }, environnement: { nom: 'Environnement et météo', couleur: '#5ef2d0' },
  sante: { nom: 'Santé', couleur: '#ff8fb1' }, autre: { nom: 'À la une', couleur: '#d6e4ff' }
};
export const categorie = id => CATEGORIES[id] || CATEGORIES.autre;
/* Rayon de la balise (px) : 1 média = petite, 5 médias ou plus = grande */
export const tailleBalise = n => Math.round((4.2 + Math.min(Math.max(n, 1) - 1, 6) * 1.25) * 10) / 10;
export const niveauImportance = n => (n >= 5 ? 'majeur' : n >= 3 ? 'fort' : n >= 2 ? 'moyen' : 'faible');
export const libelleImportance = n => (n <= 1 ? 'signalé par 1 média' : 'repris par ' + n + ' médias');

export function libelleLieu(l) {
  if (!l) return 'lieu non déterminé';
  const base = l.nom || ({ pays: 'pays', région: 'région', ville: 'ville' }[l.type] || 'lieu');
  return l.estime ? base + ' · localisation estimée' : base;
}

/* Image fournie par le flux RSS du média : https seulement, sans espace ni caractère de balise (sinon : pas d'image, jamais une adresse douteuse) */
export const imageSure = u => (typeof u === 'string' && /^https:\/\/[^\s<>"']{8,400}$/i.test(u) ? u : null);

/* Un sujet du Worker → une carte (titre, média principal, date relative, lien sûr…) */
export function modeleSujet(s, maintenant = Date.now()) {
  const c = categorie(s.categorie), src = (s.sources || []).filter(x => urlSure(x.url));
  const premier = src[0] || null;
  return {
    id: String(s.id), titre: String(s.titre || '').replace(/\s+/g, ' ').trim(), cat: s.categorie in CATEGORIES ? s.categorie : 'autre', catNom: c.nom, couleur: c.couleur,
    importance: Math.max(1, s.importance | 0), niveau: niveauImportance(s.importance | 0), rayon: tailleBalise(s.importance | 0),
    source: premier ? premier.nom : 'source inconnue', url: premier ? urlSure(premier.url) : null, quand: dateRelative(premier && premier.date || s.date, maintenant),
    autres: src.slice(1, 5).map(x => ({ nom: x.nom, url: urlSure(x.url) })), nbSources: src.length,
    image: imageSure(s.image), sources: src.slice(0, 8).map(x => ({ nom: x.nom, url: urlSure(x.url), titre: String(x.titre || '').slice(0, 200), image: imageSure(x.image) })),   // vignettes des médias (flux RSS) : jamais copiées, affichées depuis leur site
    lieu: s.lieu && Number.isFinite(s.lieu.lat) && Number.isFinite(s.lieu.lon) ? { lat: s.lieu.lat, lon: s.lieu.lon, nom: s.lieu.nom || '', type: s.lieu.type, estime: !!s.lieu.estime, texte: libelleLieu(s.lieu) } : null,
    regions: s.regions || []
  };
}

/* Réponse du Worker → sujets prêts à afficher (au plus max, ceux qui ont un lieu d'abord pour les balises) */
export function modelesFil(res, { max = 40, maintenant = Date.now() } = {}) {
  const liste = (res && res.sujets || []).map(s => modeleSujet(s, maintenant)).filter(m => m.titre && m.url).slice(0, max);
  return { sujets: liste, genere: res && res.genere || null, perime: !!(res && res.perime), indisponibles: (res && res.sources && res.sources.indisponibles || []).map(x => x.nom), sources: (res && res.sources && res.sources.ok || []) };
}
/* « dernière mise à jour » : « mis à jour il y a 4 min (14 h 32) » ; date absente → « mise à jour inconnue » */
export function libelleMaj(genere, maintenant = Date.now()) {
  const t = Date.parse(genere || ''); if (!Number.isFinite(t)) return 'mise à jour inconnue';
  const rel = dateRelative(genere, maintenant), h = new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
  return 'mis à jour ' + (rel === 'à l’instant' ? 'à l’instant' : rel) + ' (' + h + ')';
}

/* ── Cartes : deux colonnes dans les marges, rangées du haut vers le bas selon la hauteur de la balise, sans chevauchement ──
   balises : [{ id, x, y }] (pixels écran) ; renvoie { id: { x, y, cote } }. La colonne de gauche commence plus bas (fenêtres de Raylé en haut à gauche).
   obstacles : rectangles { x, y, w, h } à éviter (fenêtres holographiques ouvertes) : une carte qui tomberait dessus glisse dessous ; si elle ne tient plus, elle est omise. */
export function disposerCartes(balises, largeur, hauteur, { carteL = 262, carteH = 118, marge = 18, ecart = 10, hautDroite = 132, hautGauche = 352, bas = 96, max = 7, obstacles = [] } = {}) {
  const res = {}, centre = largeur / 2;
  const choisies = balises.slice(0, max);
  const cols = { gauche: [], droite: [] };
  for (const b of choisies) (b.x < centre ? cols.droite : cols.gauche).push(b);   // balise à gauche → carte à droite (le trait traverse la Terre : lisible, et la colonne gauche reste libre)
  // équilibrer : jamais plus de 4 cartes d'un côté
  while (cols.droite.length > 4) cols.gauche.push(cols.droite.pop());
  while (cols.gauche.length > 3) cols.droite.push(cols.gauche.pop());
  const maxY = hauteur - bas - carteH;
  const poser = (liste, cote, y0) => {
    liste.sort((a, b) => a.y - b.y);
    const x = cote === 'gauche' ? marge : largeur - marge - carteL;
    const gene = y => obstacles.find(o => x < o.x + o.w && x + carteL > o.x && y < o.y + o.h && y + carteH > o.y);
    const posees = [];
    liste.forEach((b, i) => {
      let y = Math.max(y0, Math.min(maxY, b.y - carteH / 2));
      if (posees.length) y = Math.max(y, posees[posees.length - 1].y + carteH + ecart);
      for (let k = 0; k < 6; k++) { const o = gene(y); if (!o) break; y = o.y + o.h + ecart; }
      if (y > maxY) return;                                  // ne tient plus : cette carte n'est pas affichée
      posees.push({ id: b.id, y });
    });
    // si le bas déborde, on remonte la pile (du dernier vers le premier) sans passer sur un obstacle
    for (let i = posees.length - 2; i >= 0; i--) { const y = Math.min(posees[i].y, posees[i + 1].y - carteH - ecart); if (y >= y0 && !gene(y)) posees[i].y = y; }
    for (const p of posees) res[p.id] = { x, y: p.y, cote };
  };
  poser(cols.droite, 'droite', hautDroite); poser(cols.gauche, 'gauche', hautGauche);
  return res;
}

/* ── Réponse parlée : « [1] En France… [2] Au Japon… » → segments (le marqueur n'est jamais prononcé ni affiché) ── */
export function segmenter(reponse) {
  const t = String(reponse == null ? '' : reponse);
  const re = /\[(\d{1,2})\]/g, reperes = [];
  let m; while ((m = re.exec(t))) reperes.push({ n: +m[1], debut: m.index, fin: m.index + m[0].length });
  if (!reperes.length) return { intro: t.trim(), segments: [], propre: t.trim() };
  const intro = t.slice(0, reperes[0].debut).trim();
  const segments = reperes.map((r, i) => ({ n: r.n, texte: t.slice(r.fin, i + 1 < reperes.length ? reperes[i + 1].debut : t.length).replace(/\s+/g, ' ').trim() })).filter(s => s.texte);
  return { intro, segments, propre: t.replace(/\s*\[\d{1,2}\]\s*/g, ' ').replace(/\s+/g, ' ').trim() };
}
export const sansMarqueurs = t => String(t == null ? '' : t).replace(/\s*\[\d{1,2}\]\s*/g, ' ').replace(/\s+/g, ' ').trim();

/* Bandeau défilant : une suite d'éléments { id, texte, couleur, source } (les plus importants d'abord) */
export function elementsBandeau(sujets, max = 14) {
  return sujets.slice().sort((a, b) => b.importance - a.importance).slice(0, max).map(s => ({ id: s.id, texte: s.titre, couleur: s.couleur, source: s.source, importance: s.importance }));
}
/* Sujets à montrer sur le globe (ceux qui ont un lieu) ; les plus importants gardent la priorité quand ils se chevauchent */
export const avecLieu = sujets => sujets.filter(s => s.lieu);
/* Distance de caméra (km) pour regarder un sujet : une ville de près, un pays de plus loin */
export const distanceVue = s => (!s.lieu ? 2500 : s.lieu.type === 'ville' ? 650 : s.lieu.type === 'région' ? 900 : 1800);
