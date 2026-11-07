/* ═════════════ REPÈRES AFFICHÉS SUR LE GRAPHIQUE DE L'OR (pur, testé) ═════════════
   Seulement les plus importants : plus haut / plus bas de la veille (dernière journée de marché complète) et de la semaine précédente,
   niveaux ronds de 50 $ et 100 $ proches du prix, au plus 3 zones de volume, zones de retournement (avec leur historique de tests),
   et les extrêmes de la séance EN COURS seulement pendant la séance. Marché de l'or fermé (week-end, pause) : pas d'extrêmes de séance
   en cours, mais ceux de la dernière séance complète. Les repères à moins de 0,3 ATR H1 l'un de l'autre sont fusionnés en un seul libellé
   (« Zone 4 064–4 077 : 4 niveaux »). Libellés en français clair, sans abréviation. Rien ici ne change les règles figées zones-or-v1 :
   c'est l'AFFICHAGE seulement (les zones et l'étude gardent leurs propres niveaux). */
import { heureLocale, dateParis, seance, marcheOr } from './temps-or.js';
import { texteHistorique } from './zones-or.js';
import { pluriel } from './texte-or.js';

export const PRIORITE = Object.freeze({ veille: 100, semaine: 95, retournement: 85, volume: 70, rond100: 60, seance: 55, rond50: 40 });
export const FUSION_ATR = 0.3, LARGEUR_MAX_ATR = 2, ETIQUETTES_MAX = 8, VOLUME_MAX = 3;
const nb = (p, d = 0) => Number(p).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
const NOMS_SEANCE = { Asie: 'asiatique', Londres: 'de Londres', 'New York': 'de New York' };
/* « 4 064–4 077 », ou un seul prix quand les deux bornes s'arrondissent pareil */
const fourchette = (lo, hi) => nb(lo) === nb(hi) ? nb((lo + hi) / 2) : `${nb(lo)}–${nb(hi)}`;
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const extremes = L => ({ h: Math.max(...L.map(b => b.h)), l: Math.min(...L.map(b => b.l)) });

/* dernière journée de marché complète avant t (jours de Paris, lundi → vendredi, au moins 20 bougies M15) */
export function veilleMarche(m15, t) {
  const auj = dateParis(t), parJour = new Map();
  for (const b of m15) { if (b.t + 15 * 60e3 > t) continue; const k = dateParis(b.t); if (k === auj) continue; const j = heureLocale(b.t, 'Europe/Paris').j; if (j === 0 || j === 6) continue; (parJour.get(k) || parJour.set(k, []).get(k)).push(b); }
  const k = [...parJour.keys()].sort().reverse().find(x => parJour.get(x).length >= 20);
  return k ? { jour: k, ...extremes(parJour.get(k)) } : null;
}
/* séance à afficher : celle EN COURS si le marché est ouvert ; sinon la dernière séance complète (au moins 8 bougies M15) */
export function seanceAffichee(m15, t, ouvert) {
  const s = seance(t), cle = b => seance(b.t) + '|' + dateParis(b.t);
  if (ouvert && s !== 'soir') {
    const L = m15.filter(b => b.t <= t && cle(b) === s + '|' + dateParis(t));
    return L.length ? { nom: s, enCours: true, ...extremes(L) } : null;
  }
  const groupes = new Map();
  for (const b of m15) { if (b.t + 15 * 60e3 > t || seance(b.t) === 'soir' || !marcheOr(b.t).ouvert) continue; const k = cle(b); if (!ouvert && k === s + '|' + dateParis(t)) continue; (groupes.get(k) || groupes.set(k, []).get(k)).push(b); }   // le perpétuel tourne le week-end : seules comptent les bougies du marché de l'or ouvert
  const ks = [...groupes.keys()].filter(k => groupes.get(k).length >= 8).sort((a, b) => groupes.get(a)[0].t - groupes.get(b)[0].t);
  const k = ks.pop(); if (!k) return null;
  const L = groupes.get(k);
  return { nom: k.split('|')[0], enCours: false, jour: JOURS[heureLocale(L[0].t, 'Europe/Paris').j], ...extremes(L) };
}
/* ronds de 50 $ et 100 $ proches du prix : les deux plus proches de chaque sorte, de chaque côté, à moins de 2 % */
export function ronds(prix) {
  if (!(prix > 0)) return [];
  const o = [];
  for (const pas of [100, 50]) {
    const bas = Math.floor(prix / pas) * pas, L = [bas - pas, bas, bas + pas, bas + 2 * pas].filter(x => x > 0 && Math.abs(x - prix) <= prix * 0.02 && (pas === 100 || x % 100 !== 0));
    for (const x of L) o.push({ p: x, type: pas === 100 ? 'rond100' : 'rond50', couche: 'sr', nom: `Niveau rond ${nb(x)}`, etiquette: `Niveau rond ${nb(x)}` });
  }
  return o.sort((a, b) => Math.abs(a.p - prix) - Math.abs(b.p - prix)).slice(0, 6);
}

/* tous les repères candidats (prix Kraken) */
export function reperes({ niveaux = [], zonesVol = [], retournement = [], prix = null, m15 = [], marche = { ouvert: true }, t = Date.now() }) {
  const o = [];
  const v = veilleMarche(m15, t);
  if (v) { const j = JOURS[heureLocale(Date.parse(v.jour + 'T12:00:00Z'), 'UTC').j]; o.push({ p: v.h, type: 'veille', couche: 'sr', nom: 'Plus haut de la veille', etiquette: 'Plus haut de la veille', detail: `journée du ${j} ${v.jour.split('-').reverse().join('/')}` }, { p: v.l, type: 'veille', couche: 'sr', nom: 'Plus bas de la veille', etiquette: 'Plus bas de la veille', detail: `journée du ${j} ${v.jour.split('-').reverse().join('/')}` }); }
  for (const n of niveaux) if (n.type === 'semaine') { const haut = /haut/i.test(n.nom); o.push({ p: n.p, type: 'semaine', couche: 'sr', nom: `Plus ${haut ? 'haut' : 'bas'} de la semaine dernière`, etiquette: `Plus ${haut ? 'haut' : 'bas'} de la semaine dernière` }); }
  o.push(...ronds(prix));
  const s = seanceAffichee(m15, t, marche && marche.ouvert);
  if (s) { const q = s.enCours ? `de la séance ${NOMS_SEANCE[s.nom]} (en cours)` : `de la dernière séance ${NOMS_SEANCE[s.nom]} (${s.jour})`; o.push({ p: s.h, type: 'seance', couche: 'sr', nom: `Plus haut ${q}`, etiquette: `Plus haut ${q}` }, { p: s.l, type: 'seance', couche: 'sr', nom: `Plus bas ${q}`, etiquette: `Plus bas ${q}` }); }
  for (const z of zonesVol.slice().sort((a, b) => (b.force || 0) - (a.force || 0)).slice(0, VOLUME_MAX)) o.push({ p: z.p, bas: z.bas, haut: z.haut, type: 'volume', couche: 'volume', nom: `Zone de volume ${nb(z.bas)}–${nb(z.haut)}`, etiquette: `Zone de volume ${nb(z.bas)}–${nb(z.haut)}`, detail: z.part != null ? `${nb(z.part * 100, 0)} % du volume des 5 derniers jours` : null });
  for (const z of retournement) { const c = z.cote === 'support' ? 'Support' : 'Résistance', h = texteHistorique(z); o.push({ p: z.p, bas: z.bas, haut: z.haut, type: 'retournement', couche: 'retournement', id: z.id, nom: `${c} ${nb(z.p)}`, etiquette: `${c} ${nb(z.p)} · ${h}`, historique: h, cote: c, detail: z.noms ? `confluence : ${z.noms.map(nomClair).join(', ')}` : null }); }
  return o.map(x => ({ ...x, priorite: PRIORITE[x.type] || 0 }));
}
/* noms des niveaux du moteur (règles zones-or-v1) en français clair */
export function nomClair(nom) {
  const m = String(nom || '').match(/^(Veille|Semaine|Asie|Londres|New York) (haut|bas)$/);
  if (m) return `plus ${m[2]} ${{ Veille: 'de la veille', Semaine: 'de la semaine dernière', Asie: 'de la séance asiatique', Londres: 'de la séance de Londres', 'New York': 'de la séance de New York' }[m[1]]}`;
  const r = String(nom || '').match(/^Rond (\d+)$/); if (r) return `niveau rond ${nb(+r[1])}`;
  return String(nom || '').toLowerCase();
}

/* fusion : deux repères voisins à moins de « tol » (0,3 ATR H1) n'en font qu'un ; un groupe ne dépasse pas « largeurMax » */
export function grouper(L, tol, largeurMax = Infinity) {
  const it = L.map(x => ({ ...x, lo: x.bas ?? x.p, hi: x.haut ?? x.p })).sort((a, b) => a.lo - b.lo), G = [];
  for (const x of it) {
    const g = G[G.length - 1];
    if (g && x.lo - g.hi <= tol && Math.max(g.hi, x.hi) - g.lo <= largeurMax) { g.items.push(x); g.hi = Math.max(g.hi, x.hi); }
    else G.push({ lo: x.lo, hi: x.hi, items: [x] });
  }
  return G.map(g => {
    const n = g.items.length, top = g.items.slice().sort((a, b) => b.priorite - a.priorite)[0], ret = g.items.find(x => x.type === 'retournement');
    const p = n === 1 ? top.p : (g.lo + g.hi) / 2;
    let texte;
    if (ret && n === 1) texte = ret.etiquette;
    else if (ret) texte = `${ret.cote} ${fourchette(g.lo, g.hi)} · ${ret.historique} · ${pluriel(n, 'niveau', 'niveaux')}`;
    else if (n === 1) texte = /^(volume|rond50|rond100)$/.test(top.type) ? top.etiquette : `${top.etiquette} ${nb(top.p)}`;   // les ronds et les zones de volume portent déjà leur prix
    else texte = `Zone ${fourchette(g.lo, g.hi)} : ${pluriel(n, 'niveau', 'niveaux')}`;
    const detail = g.items.slice().sort((a, b) => b.p - a.p).map(x => `${x.nom}${x.type === 'volume' || x.type === 'retournement' ? '' : ' : ' + nb(x.p, 2)}${x.historique && x.type === 'retournement' ? ' · ' + x.historique : ''}${x.detail ? ' (' + x.detail + ')' : ''}`);
    return { p, bas: g.lo, haut: g.hi, n, texte, detail, items: g.items, priorite: top.priorite + 4 * (n - 1), types: [...new Set(g.items.map(x => x.type))], zone: n > 1 || g.hi - g.lo > 0 };
  });
}
/* étiquettes à montrer pour une vue : au plus « max », les plus importantes ; un repère au plus par bord pour ce qui sort de la vue
   (le plus proche du prix). yDe : prix → pixel (null si inconnu). Renvoie { dedans, bords } */
export function choisirEtiquettes(groupes, yDe, hauteur, { max = ETIQUETTES_MAX, prix = null } = {}) {
  const dedans = [], hautL = [], basL = [];
  for (const g of groupes) {
    const y = yDe(g.p); if (y == null) continue;
    if (y < 0) hautL.push({ ...g, y }); else if (y > hauteur) basL.push({ ...g, y }); else dedans.push({ ...g, y });
  }
  const proche = L => L.sort((a, b) => Math.abs(a.p - (prix ?? a.p)) - Math.abs(b.p - (prix ?? b.p)))[0];
  const bords = [proche(hautL), proche(basL)].filter(Boolean).map((g, i) => ({ ...g, bord: g.y < 0 ? 'haut' : 'bas' }));
  const place = Math.max(0, max - bords.length);
  return { dedans: dedans.sort((a, b) => b.priorite - a.priorite).slice(0, place), bords };
}
export const texteBord = (g, prix) => `${g.bord === 'haut' ? '▲' : '▼'} ${g.n > 1 ? `Zone ${fourchette(g.bas, g.haut)}` : g.items[0].type === 'retournement' ? g.items[0].nom : g.texte} · ${prix == null ? '' : (g.p >= prix ? '+' : '−') + nb(Math.abs(g.p - prix)) + ' $'}`;
