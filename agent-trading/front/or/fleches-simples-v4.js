/* ═════════════ FLÈCHES SIMPLES v4 — « fleches-simples-v4 » (2026-11-12) : SEULEMENT LES NIVEAUX EN TRAIT PLEIN ═════════════
   Dérivée de fleches-simples-v3 (intacte, scellée). Rejeu bougie par bougie (causal) ; mêmes règles de flèche que la v1 (retournement = première clôture hors de la zone dans le sens du rebond,
   repos de 24 bougies par niveau, niveau cassé à 0,3 ATR = plus de flèche dans l'ancien sens), cassure MA200 inchangée, garde-fou de chute 5 ATR / 24 bougies, aucun marqueur superposé.
   Niveaux SURVEILLÉS (tous tracés en TRAIT PLEIN avec une étiquette dans le terminal) :
   1. STRUCTURE (niveaux-majeurs-v1, ceux que le terminal affiche : 3 meilleures zones au-dessus et 3 au-dessous du prix) : VAH / VAL / POC hebdo et mensuel, haut / bas de la semaine et du mois.
      Majeurs dès qu'ils sont dessinés, sans compter de touches. La valeur est celle de la période PRÉCÉDENTE, complète, donc connue et figée à la clôture : elle ne bouge jamais ensuite.
   2. ZONES DE SWING (zones-direct, zones actives étiquetées « Résistance / Support … touches ») : majeures si l'étiquette affiche ≥ 3 touches ET ≥ 3 touches DÉJÀ vues (épisodes séparés d'au moins 6 bougies, largeur ≥ 0,3 ATR).
   EXCLUS : zones en pointillé (traces invalidées), niveaux ronds, haut / bas de la veille, « proposé H4 / Jour », pivots mineurs, liquidité pointillée, tout niveau sans étiquette.
   Plus de reconnaissance « par le nom » (la v3 prenait tout nom contenant H4 / Jour / VAH…) : la structure vient désormais seulement de niveaux-majeurs-v1.
   Seuils (3 touches, 6 bougies, 0,3 ATR, 5 ATR) CHOISIS EN REGARDANT des exemples : aucune preuve de performance. Information de lecture, jamais un ordre. */
import * as V1 from './fleches-simples.js';
import * as V3 from './fleches-simples-v3.js';
import * as NM from './niveaux-majeurs-v1.js';
import { atrSerie, resultat } from './fleches-terminal-v1.js';
export const VERSION = 'fleches-simples-v4', H = 3600e3, DEPART = 260, PLAFOND = 30, FENETRE = 600;
export const P = Object.freeze({ ...V3.P });
export const TYPES = V1.TYPES, idNiveau = V1.idNiveau, fusionnerRegistre = V1.fusionnerRegistre, textesRes = V1.textesRes;
export const TYPES_STRUCTURE = Object.freeze(['semaine', 'mois', 'profil_semaine', 'profil_mois']);   // les seuls types de niveaux-majeurs-v1 surveillés (ni veille, ni ronds)
export const touchesVues = V3.touchesVues;

/* niveaux de structure dessinés à la clôture de la dernière bougie de S (S = bougies closes) : [{ p, nom, type, tDebut }] */
export function niveauxStructure(S) {
  let ctx; try { ctx = NM.preparer(S); } catch (e) { return []; }
  const i = S.length - 1, d = ctx.jourDe[i]; if (ctx.atr[d] == null || d < 2) return [];
  const m = NM.niveauxMajeurs(ctx, i), vus = new Set(), out = [];
  for (const z of [...m.haut, ...m.bas]) for (const q of z.membres) {
    if (!TYPES_STRUCTURE.includes(q.type)) continue;
    const mois = q.type.endsWith('mois'), per = mois ? ctx.M[ctx.moisDe[d]] : ctx.S[ctx.semDe[d]], tDebut = S[per.i0].t, cle = `${q.nom}|${Math.round(q.p * 100)}|${tDebut}`;
    if (vus.has(cle)) continue; vus.add(cle);
    out.push({ p: q.p, nom: q.nom, type: q.type, tDebut });
  }
  return out;
}

export function rejouer(B, zonesA, { depart = DEPART, deja = [] } = {}) {
  const acceptees = deja.slice(), vus = []; let refus = 0;
  const A = atrSerie(B);
  for (let n = Math.max(depart, 40); n <= B.length; n++) {
    const S = B.slice(0, n), now = S[n - 1].t + H, a = A[n - 1], c = S[n - 1].c;
    const swing = zonesA(S, now).filter(z => z.actif !== false && z.tFin == null && (z.force || 0) >= P.touchesVues && z.haut - z.bas >= P.largeurAtr * a && touchesVues(S, z) >= P.touchesVues)
      .map(z => ({ ...z, force: 99, retournee: false, niveauType: 'swing', touchesVues: touchesVues(S, z) }));
    const struct = niveauxStructure(S).map(q => ({ id: `nm|${q.nom}|${Math.round(q.p * 100)}`, cote: q.p > c ? 'resistance' : 'support', bas: q.p, haut: q.p, tDebut: q.tDebut, tFin: null, nom: q.nom, force: 99, retournee: false, niveauType: 'structure', niveauNom: q.nom, typeStructure: q.type }));
    const zones = [...swing, ...struct];
    const r = V1.calculer(S, zones, { maintenant: now }), info = new Map(zones.map(z => [V1.idNiveau(z), z]));
    for (const f of r.toutes.slice().sort((x, y) => (x.type === 'ma_cassure' ? 0 : 1) - (y.type === 'ma_cassure' ? 0 : 1))) {
      if (f.i !== n - 1) continue;
      if (f.type === 'retournement' && f.dir > 0 && n > P.chuteBougies && S[n - 1 - P.chuteBougies].c - S[n - 1].c > P.chuteAtr * a) continue;
      if (f.type !== 'ma_cassure' && acceptees.some(g => Math.abs(g.i - f.i) < P.distanceMin)) continue;
      if (acceptees.filter(g => g.i > f.i - FENETRE).length >= PLAFOND) { refus++; continue; }
      const g = { ...f, masquee: false, indexApparition: n - 1, indexDessin: f.i, version: VERSION, id: `${f.type}|${f.t}|${f.dir}|${f.levelId}` }; delete g.resultat;
      if (f.type === 'retournement') {
        const z = info.get(f.levelId);
        if (z) { g.niveauType = z.niveauType; g.niveauStyle = 'trait plein'; g.niveauNom = z.niveauNom || z.nom || null; g.touchesVues = z.niveauType === 'swing' ? z.touchesVues : null; if (z.typeStructure) g.typeStructure = z.typeStructure; }
      }
      acceptees.push(g); vus.push(g);
    }
  }
  return { fleches: vus, toutes: acceptees, refus };
}
export function calculer(B, zonesA, { maintenant = Date.now(), depart = null, deja = [], bougies = 720 } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes`, refus: 0 };
  const d = depart == null ? Math.max(DEPART, closes.length - bougies) : Math.max(DEPART, depart);
  const r = rejouer(closes, zonesA, { depart: d, deja });
  return { fleches: r.fleches.map(f => ({ ...f, resultat: resultat(closes, f) })), n: closes.length, raison: null, vers: closes.length, refus: r.refus };
}
const fr = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
export const detail = f => {
  const l = [TYPES[f.type] || f.type];
  if (f.type === 'ma_cassure') l.push(`Cassure finale confirmée (${f.confirmation}) : le prix est resté de l'autre côté de la MA200`, 'Aucune autre flèche MA200 dans les 24 bougies qui suivent');
  else if (f.niveauType === 'structure') l.push(`Niveau de structure en trait plein : ${f.niveauNom} ${fr(f.zoneHaut)} (valeur connue à la clôture, figée)`, 'Le prix a touché le niveau puis clôturé de nouveau hors du niveau dans le sens du rebond');
  else l.push(`Zone de swing en trait plein ${fr(f.zoneBas)}–${fr(f.zoneHaut)} · ${f.touchesVues} touche${f.touchesVues > 1 ? 's' : ''} déjà vue${f.touchesVues > 1 ? 's' : ''} (bougies closes seulement)`, 'Le prix a touché la zone puis clôturé de nouveau hors de la zone dans le sens du rebond');
  l.push(`Apparue le ${new Date(f.tCloture).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (clôture de la bougie de confirmation) · clôture ${fr(f.prix)}`, 'Arrive après le plus haut/bas : repère de lecture, pas un ordre');
  return l;
};
export const bilan = () => ({});
