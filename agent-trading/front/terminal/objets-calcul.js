/* ═════════════ TERMINAL : OBJETS DESSINÉS (pur, testé) ═════════════
   Types : horizontale (p), zone (t1, bas, haut), tendance et rayon (t1, p1, t2, p2), verticale (t1), texte (t1, p1, texte).
   Chaque objet : id, actif, type, unite (surveillée), cree (ms), etiquette, couleur, epaisseur, alerte (case « m'alerter »),
   alertes (approche, touche, rebond, cassure : actives par défaut), origine ('moi' | 'zone-reaction' | 'rayle'). */
export const TYPES_OBJETS = Object.freeze(['horizontale', 'zone', 'tendance', 'rayon', 'verticale', 'texte']);
export const SURVEILLES = Object.freeze(['horizontale', 'zone', 'tendance', 'rayon']);
export const NOMS_OBJETS = Object.freeze({ horizontale: 'Ligne horizontale', zone: 'Zone', tendance: 'Ligne de tendance', rayon: 'Rayon', verticale: 'Ligne verticale', texte: 'Texte', position: 'Position' });
export const PALETTE = Object.freeze(['#8fd0e3', '#c9b27a', '#4fd18b', '#ef6a5f', '#b79be0', '#e8eef2']);
export const ALERTES_DEFAUT = Object.freeze({ approche: true, touche: true, rebond: true, cassure: true });
let compteur = 0;
export const nouvelId = (t = Date.now()) => `d${t.toString(36)}${(compteur++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const fini = x => Number.isFinite(+x);

/* création validée ; renvoie null si l'objet est incomplet */
export function creer(type, d, { t = Date.now(), id = nouvelId(t) } = {}) {
  if (!TYPES_OBJETS.includes(type)) return null;
  const base = { id, type, actif: d.actif || null, unite: d.unite || 'H1', cree: Number.isFinite(+d.cree) && d.cree !== null && d.cree !== '' ? +d.cree : t, etiquette: String(d.etiquette || '').slice(0, 60), couleur: PALETTE.includes(d.couleur) ? d.couleur : PALETTE[type === 'tendance' || type === 'rayon' ? 1 : 0], epaisseur: [1, 2, 3].includes(+d.epaisseur) ? +d.epaisseur : 1, alerte: !!d.alerte, alertes: { ...ALERTES_DEFAUT, ...(d.alertes || {}) }, origine: d.origine || 'moi' };
  if (type === 'horizontale') return fini(d.p) && d.p > 0 ? { ...base, p: +d.p } : null;
  if (type === 'zone') { const a = +d.bas, b = +d.haut; if (!(a > 0 && b > 0) || a === b) return null; return { ...base, t1: fini(d.t1) ? +d.t1 : base.cree, bas: Math.min(a, b), haut: Math.max(a, b) }; }
  if (type === 'tendance' || type === 'rayon') { if (![d.t1, d.p1, d.t2, d.p2].every(fini) || +d.t1 === +d.t2) return null; const [a, b] = +d.t1 < +d.t2 ? [[+d.t1, +d.p1], [+d.t2, +d.p2]] : [[+d.t2, +d.p2], [+d.t1, +d.p1]]; return { ...base, t1: a[0], p1: a[1], t2: b[0], p2: b[1] }; }
  if (type === 'verticale') return fini(d.t1) ? { ...base, t1: +d.t1 } : null;
  if (type === 'texte') return fini(d.t1) && fini(d.p1) && String(d.texte || '').trim() ? { ...base, t1: +d.t1, p1: +d.p1, texte: String(d.texte).trim().slice(0, 140) } : null;
  return null;
}
/* modification : seuls les champs permis du type ; l'identité et la date de création restent */
export function modifier(o, champs) {
  const permis = { horizontale: ['p'], zone: ['bas', 'haut', 't1'], tendance: ['t1', 'p1', 't2', 'p2'], rayon: ['t1', 'p1', 't2', 'p2'], verticale: ['t1'], texte: ['t1', 'p1', 'texte'] }[o.type] || [];
  const d = { ...o }; for (const k of [...permis, 'couleur', 'epaisseur', 'etiquette', 'alerte', 'unite']) if (k in champs) d[k] = champs[k];
  if (champs.alertes) d.alertes = { ...o.alertes, ...champs.alertes };
  const n = creer(o.type, d, { t: o.cree, id: o.id }); return n ? { ...n, cree: o.cree, origine: o.origine, retourne: o.retourne } : null;
}
/* déplacement d'un objet entier de (dt, dp) */
export function deplacer(o, dt, dp) {
  if (o.type === 'horizontale') return modifier(o, { p: o.p + dp });
  if (o.type === 'zone') return modifier(o, { bas: o.bas + dp, haut: o.haut + dp, t1: o.t1 + dt });
  if (o.type === 'tendance' || o.type === 'rayon') return modifier(o, { t1: o.t1 + dt, p1: o.p1 + dp, t2: o.t2 + dt, p2: o.p2 + dp });
  if (o.type === 'verticale') return modifier(o, { t1: o.t1 + dt });
  if (o.type === 'texte') return modifier(o, { t1: o.t1 + dt, p1: o.p1 + dp });
  return o;
}
/* valeur de l'objet à l'instant t : prix (ligne, tendance, rayon), {bas, haut} (zone) ; null s'il n'est pas défini à cet instant */
export function valeur(o, t) {
  if (o.type === 'horizontale') return o.p;
  if (o.type === 'zone') return t < o.t1 ? null : { bas: o.bas, haut: o.haut };
  if (o.type === 'tendance' || o.type === 'rayon') { if (t < o.t1) return null; return o.p1 + (o.p2 - o.p1) * (t - o.t1) / (o.t2 - o.t1); }
  return null;
}
export function libelle(o, f = x => String(x)) {
  const e = o.etiquette ? ' · ' + o.etiquette : '';
  if (o.type === 'horizontale') return `${f(o.p)}${e}`;
  if (o.type === 'zone') return `${f(o.bas)} – ${f(o.haut)}${e}`;
  if (o.type === 'texte') return o.texte;
  return `${NOMS_OBJETS[o.type]}${e}`;
}

/* aimantation : prix le plus proche parmi O, H, B, C de la bougie, si à moins de « tol » (en prix) */
export function aimanter(prix, b, tol) {
  if (!b) return prix; let m = prix, d = tol;
  for (const p of [b.o, b.h, b.l, b.c]) { const x = Math.abs(p - prix); if (x <= d) { d = x; m = p; } }
  return m;
}

/* touche-t-on un objet ? (coordonnées écran ; X(t) et Y(p) fournies) → { objet, poignee } ; poignée : 'p1', 'p2', 'haut', 'bas' ou 'corps' */
export function toucher(objets, x, y, X, Y, tol = 6) {
  let best = null, bd = tol + 1;
  const prendre = (o, d, poignee) => { if (d < bd) { bd = d; best = { objet: o, poignee }; } };
  for (const o of objets) {
    if (o.type === 'horizontale') { const yy = Y(o.p); if (yy != null) prendre(o, Math.abs(y - yy), 'corps'); }
    else if (o.type === 'zone') { const y1 = Y(o.haut), y2 = Y(o.bas), x1 = X(o.t1); if (y1 == null || y2 == null) continue; if (x1 != null && x < x1 - tol) continue;
      const dh = Math.abs(y - y1), db = Math.abs(y - y2);
      if (y > Math.min(y1, y2) && y < Math.max(y1, y2) && Math.min(dh, db) > 3) prendre(o, 0, 'corps'); else { prendre(o, dh, 'haut'); prendre(o, db, 'bas'); } }
    else if (o.type === 'tendance' || o.type === 'rayon') { const x1 = X(o.t1), y1 = Y(o.p1), x2 = X(o.t2), y2 = Y(o.p2); if ([x1, y1, x2, y2].some(v => v == null)) continue;
      prendre(o, Math.hypot(x - x1, y - y1) - 1, 'p1'); prendre(o, Math.hypot(x - x2, y - y2) - 1, 'p2');
      const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy; let u = L2 ? ((x - x1) * dx + (y - y1) * dy) / L2 : 0; if (o.type === 'rayon') u = Math.max(0, u); else u = Math.max(0, Math.min(1, u));
      prendre(o, Math.hypot(x - (x1 + u * dx), y - (y1 + u * dy)), 'corps'); }
    else if (o.type === 'verticale') { const xx = X(o.t1); if (xx != null) prendre(o, Math.abs(x - xx), 'corps'); }
    else if (o.type === 'texte') { const xx = X(o.t1), yy = Y(o.p1); if (xx != null && yy != null && x >= xx - 4 && x <= xx + 8 * o.texte.length && Math.abs(y - yy) < 10) prendre(o, 0, 'corps'); }
  }
  return best;
}

/* annuler / rétablir : pile d'états (copies), 60 au plus */
export function creerHistorique(initial = [], max = 60) {
  let passe = [], futur = [], courant = initial.map(o => ({ ...o }));
  return {
    etat: () => courant,
    appliquer(nouveau) { passe.push(courant); if (passe.length > max) passe.shift(); futur = []; courant = nouveau; return courant; },
    annuler() { if (!passe.length) return null; futur.push(courant); courant = passe.pop(); return courant; },
    retablir() { if (!futur.length) return null; passe.push(courant); courant = futur.pop(); return courant; },
    remplacer(e) { courant = e; passe = []; futur = []; },
    peutAnnuler: () => passe.length > 0, peutRetablir: () => futur.length > 0
  };
}

export const FORMAT_OBJETS = 'rayle-terminal-objets-1';
export function exporter(objets) { return JSON.stringify({ format: FORMAT_OBJETS, exporte: new Date().toISOString(), objets }, null, 1); }
export function importer(texte) {
  let d; try { d = JSON.parse(texte); } catch (e) { throw new Error('fichier illisible (JSON attendu)'); }
  if (!d || d.format !== FORMAT_OBJETS || !Array.isArray(d.objets)) throw new Error('ce fichier n’est pas un export des objets du terminal');
  return d.objets.map(o => creer(o.type, o, { t: o.cree, id: o.id })).filter(Boolean);
}
