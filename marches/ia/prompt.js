/* Texte structuré prêt à coller dans un chat IA (mode manuel) ET message envoyé au fournisseur (mode automatique) : un seul constructeur. Pur. */
import { FORMAT_GRAPHIQUE, FORMAT_ACTUALITE, AVERTISSEMENT } from './schema.js';

const arr = n => Number(Number(n).toFixed(Math.abs(n) >= 10 ? 2 : 4));
const iso = t => new Date(t > 1e12 ? t : t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/* normalise une bougie : { t (ms), o, h, l, c } depuis un tableau [t,o,h,l,c,…] ou un objet */
export function bougie(b) {
  if (Array.isArray(b)) return { t: b[0] > 1e12 ? b[0] : b[0] * 1000, o: +b[1], h: +b[2], l: +b[3], c: +b[4] };
  const t = b.t ?? b.time ?? b.temps; return { t: t > 1e12 ? t : t * 1000, o: +(b.o ?? b.open), h: +(b.h ?? b.high), l: +(b.l ?? b.low), c: +(b.c ?? b.close) };
}
export const sma = (v, n) => v.length < n ? null : v.slice(-n).reduce((s, x) => s + x, 0) / n;
export function rsi(c, n = 14) {
  if (c.length <= n) return null; let g = 0, p = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else p -= d; } g /= n; p /= n;
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; p = (p * (n - 1) + Math.max(-d, 0)) / n; }
  return p === 0 ? 100 : 100 - 100 / (1 + g / p);
}

/* Entrée d'analyse : { actif, unite, bougies:[…], niveaux:[{nom,bas,haut,role}], fleches:[{type,sens,niveau,t}], derniers: nombre de bougies à lister } → résumé chiffré */
export function resumerEntree(e, derniers = 40) {
  const B = (e.bougies || []).map(bougie).filter(b => isFinite(b.c)); if (B.length < 5) throw new Error('trop peu de bougies (' + B.length + ') pour une analyse');
  const fermetures = B.map(b => b.c), vus = B.slice(-120), min = Math.min(...vus.map(b => b.l)), max = Math.max(...vus.map(b => b.h));
  return { actif: e.actif || '?', unite: e.unite || '?', n: B.length, derniere: B[B.length - 1], dernieres: B.slice(-derniers), ma200: sma(fermetures, 200), ma200Note: B.length >= 200 ? null : 'moins de 200 bougies chargées : MA200 non calculable', rsi14: rsi(fermetures), echelle: { min, max, sur: vus.length }, niveaux: (e.niveaux || []).slice(0, 12), fleches: (e.fleches || []).slice(-8) };
}

export function texteGraphique(e, { derniers = 40 } = {}) {
  const r = resumerEntree(e, derniers), f = x => (x == null ? 'n/d' : String(arr(x)));
  const lignes = [
    'Tu es un assistant de lecture de graphique. Analyse les données ci-dessous (aucune image) et réponds UNIQUEMENT par un objet JSON, sans texte autour.',
    '',
    `ACTIF : ${r.actif} · UNITÉ DE TEMPS : ${r.unite} · ${r.n} bougies chargées · dernière clôture ${f(r.derniere.c)} (${iso(r.derniere.t)})`,
    `ÉCHELLE DE PRIX VISIBLE (${r.echelle.sur} dernières bougies) : plus bas ${f(r.echelle.min)} · plus haut ${f(r.echelle.max)}`,
    `MA200 : ${r.ma200 == null ? r.ma200Note : f(r.ma200)} · RSI(14) : ${r.rsi14 == null ? 'n/d' : r.rsi14.toFixed(1)}`,
    '', 'NIVEAUX MAJEURS DU TERMINAL :', ...(r.niveaux.length ? r.niveaux.map(n => `- ${n.nom || n.role || 'niveau'} : ${n.haut != null && n.bas != null && n.haut !== n.bas ? f(n.bas) + ' à ' + f(n.haut) : f(n.prix ?? n.bas)}${n.role ? ' (' + n.role + ')' : ''}`) : ['- aucun fourni']),
    '', 'FLÈCHES v8 DU TERMINAL (lecture automatique, non validée) :', ...(r.fleches.length ? r.fleches.map(x => `- ${x.t ? iso(x.t) + ' · ' : ''}${x.sens || x.type || '?'} sur ${f(x.niveau)}${x.type ? ' (' + x.type + ')' : ''}`) : ['- aucune']),
    '', `DERNIÈRES BOUGIES (${r.dernieres.length}, de la plus ancienne à la plus récente ; date, ouverture, haut, bas, clôture) :`, ...r.dernieres.map(b => `${iso(b.t)} ${f(b.o)} ${f(b.h)} ${f(b.l)} ${f(b.c)}`),
    '', 'RÈGLES DE LA RÉPONSE :',
    '- Scénarios CONDITIONNELS uniquement : chaque "condition" commence par « Si ».',
    '- JAMAIS de probabilité chiffrée, JAMAIS de taille de position, de lots, de levier ni de pourcentage du capital.',
    '- Tous les prix doivent être dans l\'échelle ci-dessus (au plus une amplitude au-delà du plus haut et du plus bas).',
    '- 8 zones, 10 niveaux, 4 scénarios, 6 invalidations au maximum. Noms courts, en français.',
    `- ${AVERTISSEMENT}`,
    '', 'FORMAT JSON ATTENDU (exemple de structure, remplace les valeurs) :', FORMAT_GRAPHIQUE
  ];
  return { texte: lignes.join('\n'), plage: { min: r.echelle.min, max: r.echelle.max }, resume: r };
}

export function texteActualite({ titres = [], actif = null } = {}) {
  if (!titres.length) throw new Error('aucun titre à analyser');
  const l = ['Tu es un assistant qui aide à comprendre l\'actualité financière. À partir des titres ci-dessous (source et heure indiquées), regroupe-les en thèmes et explique en français simple ce qu\'ils disent. N\'invente aucun fait, aucun chiffre ; aucune prévision de prix, aucune probabilité. Réponds UNIQUEMENT par un objet JSON, sans texte autour.', '', actif ? 'ACTIF CONCERNÉ : ' + actif : 'TOUS ACTIFS', '', 'TITRES :', ...titres.slice(0, 40).map((t, i) => `${i + 1}. [${t.source || '?'} · ${t.heure || '?'}] ${t.titre}`), '', `${AVERTISSEMENT}`, '', 'FORMAT JSON ATTENDU :', FORMAT_ACTUALITE];
  return { texte: l.join('\n'), plage: null };
}
export function texteScenarios(e, opts) { const g = texteGraphique(e, opts); return { ...g, texte: g.texte.replace('Analyse les données ci-dessous (aucune image)', 'Propose des SCÉNARIOS conditionnels à partir des données ci-dessous (aucune image)') }; }
