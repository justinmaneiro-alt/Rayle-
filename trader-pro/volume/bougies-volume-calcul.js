/* ═════════════ BOUGIES VOLUME : CALCULS PURS (testés, navigateur et Node) ═════════════
   Repère les bougies à fort volume : volume relatif = volume de la bougie ÷ MÉDIANE du volume des 50 bougies PRÉCÉDENTES (même actif, même unité, bougie actuelle exclue).
   RÈGLE D'OR : la classe d'une bougie (volume relatif, contexte, position vs MA200) n'utilise QUE la bougie et celles qui la précèdent. Les bougies postérieures ne servent
   qu'à décrire « ce qui s'est passé après » (fenêtre « Et après ? », statistiques), jamais à colorer ni à classer une bougie.
   Source de volume : si elle change dans l'historique (or : futures COMEX avant le 2026-08-05, puis Binance + Kraken ; historique long, puis source récente), la médiane n'utilise
   que des bougies de la MÊME source. Sans volume fiable (volume nul, moins de MIN_REF bougies de référence), la bougie n'est pas colorée : jamais de volume inventé.
   Statistiques DESCRIPTIVES sur l'historique affiché : ce n'est pas un signal. Lecture seule : aucun ordre. */

export const SEUILS = Object.freeze([1.5, 2, 2.5, 3]);
export const SEUIL_DEFAUT = 2;
export const SEUIL_EXTREME = 3;
export const FENETRE = 50;          // bougies précédentes pour la médiane
export const MIN_REF = 20;          // bougies de référence minimum (même source, volume > 0) pour fiabiliser la médiane
export const MIN_CAS = 20;          // en dessous : « échantillon trop petit »
export const MAX_ZONES = 8;
export const HORIZONS = Object.freeze([1, 3, 5, 10]);
export const COULEURS = Object.freeze({ achat: '#00E5FF', vente: '#FF2BD6' });
export const COMEX_JUSQU_AU = Date.UTC(2026, 7, 5);   // 2026-08-05 : l'or passe des futures COMEX à Binance + Kraken
export const ACTIFS_BV = Object.freeze(['or', 'us100', 'us500', 'btc', 'sol', 'petrole']);
export const NOM_ACTIF = Object.freeze({ or: 'l’or', us100: 'le Nasdaq 100', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', petrole: 'le pétrole' });
export const NOM_UNITE = Object.freeze({ H1: 'H1', H4: 'H4', J: 'Daily' });
export const PAS = Object.freeze({ H1: 3600e3, H4: 4 * 3600e3, J: 86400e3 });
export const TEXTE_RAPPEL = 'Statistiques descriptives sur l’historique affiché, pas un signal.';
export const TEXTE_PETIT = 'échantillon trop petit';
export const TEXTE_INDISPO = 'volume non disponible pour cet actif';
export const volumeDisponible = id => ACTIFS_BV.includes(id);

/* ───── source du volume d'une bougie ───── */
export function sourceBarre(b, actif) {
  if (actif === 'or') return b.t < COMEX_JUSQU_AU ? 'comex' : 'binance-kraken';
  return b.long ? 'historique' : 'recente';
}

const mediane = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const sens = b => (b.c > b.o ? 1 : b.c < b.o ? -1 : 0);

/* ───── calcul incrémental : tout est mis en cache, seule la dernière bougie est recalculée ─────
   maj(B) : si le début de la série n'a pas changé (même première bougie, même avant-dernière), seules les bougies à partir de l'AVANT-dernière sont recalculées ;
   sinon (historique allongé ou autre actif) tout est recalculé une fois. */
export function creerCalcul(actif) {
  const E = { n: 0, t0: null, rel: [], src: [], atr: [], ma: [], ctx: [], sum: [], tr: [] };
  function recalculer(B, de) {
    const n = B.length;
    for (const k of ['rel', 'src', 'atr', 'ma', 'ctx', 'sum', 'tr']) E[k].length = n;
    for (let i = de; i < n; i++) {
      const b = B[i];
      E.src[i] = sourceBarre(b, actif);
      /* volume relatif : médiane des (≤ 50) bougies précédentes de la même source, volume > 0 */
      let rel = null;
      if (b.v > 0) { const ref = []; for (let j = Math.max(0, i - FENETRE); j < i; j++) if (B[j].v > 0 && E.src[j] === E.src[i]) ref.push(B[j].v); if (ref.length >= MIN_REF) { const m = mediane(ref); if (m > 0) rel = b.v / m; } }
      E.rel[i] = rel;
      /* ATR 14 de Wilder (bougies ≤ i) */
      const pc = i > 0 ? B[i - 1].c : b.o; E.tr[i] = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
      if (i < 13) E.atr[i] = null; else if (i === 13) { let s = 0; for (let j = 0; j <= 13; j++) s += E.tr[j]; E.atr[i] = s / 14; } else E.atr[i] = (E.atr[i - 1] * 13 + E.tr[i]) / 14;
      /* MA200 (clôtures ≤ i) */
      E.sum[i] = (i > 0 ? E.sum[i - 1] : 0) + b.c; E.ma[i] = i >= 199 ? (E.sum[i] - (i >= 200 ? E.sum[i - 200] : 0)) / 200 : null;
      E.ctx[i] = contexteDe(B, i);
    }
    E.n = n; E.t0 = n ? B[0].t : null;
  }
  return {
    maj(B) {
      const n = B.length; if (!n) { E.n = 0; for (const k of ['rel', 'src', 'atr', 'ma', 'ctx', 'sum', 'tr']) E[k].length = 0; return this; }
      const memeDebut = E.n > 0 && B[0].t === E.t0 && n >= E.n - 1 && (E.n < 2 || B[E.n - 2].t === E.lastPrevT);
      recalculer(B, memeDebut ? Math.max(0, E.n - 1) : 0); E.lastPrevT = n >= 2 ? B[n - 2].t : null; return this;
    },
    rel: i => E.rel[i], atr: i => E.atr[i], ma: i => E.ma[i], ctx: i => E.ctx[i], src: i => E.src[i], taille: () => E.n, brut: () => E
  };
}

/* ───── contexte (passé seulement) ───── */
export function contexteDe(B, i) {
  if (i < 20) return null; const b = B[i], d = sens(b); if (!d) return null;
  let memeSens = 0; for (let j = i - 7; j < i; j++) if (sens(B[j]) === d) memeSens++;
  let hMax = -Infinity, bMin = Infinity; for (let j = i - 19; j < i; j++) { if (B[j].h > hMax) hMax = B[j].h; if (B[j].l < bMin) bMin = B[j].l; }
  const extremeAtteint = d > 0 ? b.h >= hMax : b.l <= bMin;
  if (memeSens >= 5 && extremeAtteint) return 'fin';
  let h20 = -Infinity, b20 = Infinity; for (let j = i - 20; j < i; j++) { if (B[j].h > h20) h20 = B[j].h; if (B[j].l < b20) b20 = B[j].l; }
  if (b.c > h20 || b.c < b20) return 'range';
  return 'milieu';
}
export const NOM_CONTEXTE = Object.freeze({ fin: 'fin de mouvement', range: 'sortie de range', milieu: 'milieu de mouvement' });

/* ───── classe d'une bougie : { niveau: 0 | 1 (fort) | 2 (extrême), dir: 1 | -1 | 0, rel } ───── */
export function classe(B, calc, i, seuil = SEUIL_DEFAUT) {
  const rel = calc.rel(i), dir = B[i] ? sens(B[i]) : 0;
  if (rel == null || !dir || !(rel >= seuil)) return { niveau: 0, dir, rel };
  return { niveau: rel >= SEUIL_EXTREME ? 2 : 1, dir, rel };
}
export const positionMa = (B, calc, i) => { const m = calc.ma(i); return m == null ? null : (B[i].c >= m ? 'dessus' : 'dessous'); };
export const estEnCours = (b, pas, maintenant = Date.now()) => b.t + pas > maintenant;
export const dernierClos = (B, pas, maintenant = Date.now()) => { for (let i = B.length - 1; i >= 0; i--) if (!estEnCours(B[i], pas, maintenant)) return i; return -1; };

/* ───── ce qui s'est réellement passé après la bougie i (description du passé : bougies postérieures utilisées SEULEMENT ici) ───── */
export function suite(B, calc, i, dernier) {
  const b = B[i], a = calc.atr(i), d = sens(b), out = { i, dir: d, atr: a, horizons: [], favorable: null, defavorable: null, hautRepris: null, basRepris: null, nBougies: 0 };
  if (!(a > 0) || !d) return out;
  for (const h of HORIZONS) { const j = i + h; if (j <= dernier) { const v = B[j].c - b.c; out.horizons.push({ h, pct: v / b.c * 100, atr: v / a }); } else out.horizons.push({ h, pct: null, atr: null }); }
  const fin = Math.min(dernier, i + 10); out.nBougies = Math.max(0, fin - i);
  if (out.nBougies > 0) {
    let hi = -Infinity, lo = Infinity, hautRepris = false, basRepris = false;
    for (let j = i + 1; j <= fin; j++) { if (B[j].h > hi) hi = B[j].h; if (B[j].l < lo) lo = B[j].l; if (B[j].h > b.h) hautRepris = true; if (B[j].l < b.l) basRepris = true; }
    const fav = d > 0 ? hi - b.c : b.c - lo, def = d > 0 ? b.c - lo : hi - b.c;
    out.favorable = { prix: Math.max(0, fav), pct: Math.max(0, fav) / b.c * 100, atr: Math.max(0, fav) / a }; out.defavorable = { prix: Math.max(0, def), pct: Math.max(0, def) / b.c * 100, atr: Math.max(0, def) / a };
    out.hautRepris = hautRepris; out.basRepris = basRepris;
  }
  return out;
}

/* ───── statistiques d'un groupe de bougies (indices) : mouvement en ATR dans le SENS de la bougie (positif = continuation) ───── */
export function statsGroupe(B, calc, indices, dernier) {
  const m5 = [], m10 = []; let cont = 0, ret = 0;
  for (const i of indices) {
    const a = calc.atr(i), d = sens(B[i]); if (!(a > 0) || !d) continue;
    if (i + 5 <= dernier) { const v = d * (B[i + 5].c - B[i].c) / a; m5.push(v); if (v > 0) cont++; else if (v < 0) ret++; }
    if (i + 10 <= dernier) m10.push(d * (B[i + 10].c - B[i].c) / a);
  }
  const moy = x => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : null), med = x => (x.length ? mediane(x) : null);
  const n5 = m5.length;
  return { n: indices.length, n5, n10: m10.length, petit: n5 < MIN_CAS, cont5: n5 ? cont / n5 * 100 : null, ret5: n5 ? ret / n5 * 100 : null, moy5: moy(m5), med5: med(m5), moy10: moy(m10), med10: med(m10) };
}

/* ───── liste des bougies classées (fermées seulement) ───── */
export function indicesClasses(B, calc, { seuil = SEUIL_DEFAUT, pas, maintenant = Date.now() } = {}) {
  const dernier = pas ? dernierClos(B, pas, maintenant) : B.length - 1, L = [];
  for (let i = 0; i <= dernier; i++) { const c = classe(B, calc, i, seuil); if (c.niveau) L.push({ i, niveau: c.niveau, dir: c.dir, rel: c.rel }); }
  return { liste: L, dernier };
}

/* ───── tableau du panneau : 4 lignes (achat / vente, fort / extrême), puis découpage par contexte et par position vs MA200 ───── */
export function tableau(B, calc, opts = {}) {
  const { liste, dernier } = indicesClasses(B, calc, opts), ligne = f => statsGroupe(B, calc, liste.filter(f).map(x => x.i), dernier);
  const parCtx = {}, parMa = {};
  for (const k of ['fin', 'range', 'milieu']) parCtx[k] = ligne(x => calc.ctx(x.i) === k);
  for (const k of ['dessus', 'dessous']) parMa[k] = ligne(x => positionMa(B, calc, x.i) === k);
  return { dernier, total: liste.length,
    lignes: { achatFort: ligne(x => x.dir > 0), venteForte: ligne(x => x.dir < 0), achatExtreme: ligne(x => x.dir > 0 && x.niveau === 2), venteExtreme: ligne(x => x.dir < 0 && x.niveau === 2) },
    contexte: parCtx, ma: parMa };
}
/* « bougies similaires » : même sens, même contexte, fort volume (≥ seuil), la bougie elle-même exclue */
export function similaires(B, calc, i, { seuil = SEUIL_DEFAUT, pas, maintenant = Date.now() } = {}) {
  const { liste, dernier } = indicesClasses(B, calc, { seuil, pas, maintenant }), d = sens(B[i]), c = calc.ctx(i);
  const idx = liste.filter(x => x.i !== i && x.dir === d && calc.ctx(x.i) === c).map(x => x.i);
  return statsGroupe(B, calc, idx, dernier);
}
export function dernieres(B, calc, k = 5, opts = {}) { const { liste } = indicesClasses(B, calc, opts); return liste.slice(-k).reverse(); }

/* ───── zones laissées par les bougies extrêmes : corps de la bougie, prolongé vers la droite tant qu'aucune clôture ne la TRAVERSE ───── */
/* achat : la zone sert de support, elle est traversée par une clôture SOUS le bas du corps ; vente : résistance, traversée par une clôture AU-DESSUS du haut du corps. 8 zones intactes les plus récentes. */
export function zones(B, calc, { pas, maintenant = Date.now(), max = MAX_ZONES } = {}) {
  const dernier = pas ? dernierClos(B, pas, maintenant) : B.length - 1, Z = [];
  for (let i = dernier; i >= 0 && Z.length < max; i--) {
    const c = classe(B, calc, i, SEUIL_EXTREME); if (c.niveau !== 2) continue; const b = B[i], bas = Math.min(b.o, b.c), haut = Math.max(b.o, b.c); let intacte = true;
    for (let j = i + 1; j <= dernier; j++) { if (c.dir > 0 ? B[j].c < bas : B[j].c > haut) { intacte = false; break; } }
    if (intacte) Z.push({ i, t: b.t, dir: c.dir, bas, haut, rel: c.rel });
  }
  return Z.reverse();
}

/* ───── textes ───── */
const nf = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
export const fmtX = r => '×' + nf(r, 1);
export const nomSens = (dir, niveau) => (niveau === 2 ? (dir > 0 ? 'acheteur extrême' : 'vendeur extrême') : (dir > 0 ? 'acheteur' : 'vendeur'));
export const nomMa = p => (p === 'dessus' ? 'au-dessus de la MA200' : p === 'dessous' ? 'sous la MA200' : 'MA200 indisponible (moins de 200 bougies)');

/* alerte (bougie extrême qui vient de se clôturer en H4 ou Jour) : « Bougie de volume extrême vendeur sur l'or en H4, ×3,4 la médiane, sous la MA200. » */
export function phraseAlerte({ actif, unite, dir, rel, ma }) {
  return `Bougie de volume extrême ${dir > 0 ? 'acheteur' : 'vendeur'} sur ${NOM_ACTIF[actif] || actif} en ${NOM_UNITE[unite] || unite}, ${fmtX(rel)} la médiane${ma ? ', ' + nomMa(ma) : ''}.`;
}
/* bougies extrêmes déjà closes depuis moins de `maxAgeMs`, pour les alertes (H4 et Jour seulement) */
export function alertesCloture(B, calc, { actif, unite, pas, maintenant = Date.now(), maxAgeMs = 36 * 3600e3 } = {}) {
  if (unite !== 'H4' && unite !== 'J') return [];
  const dernier = dernierClos(B, pas, maintenant), L = [];
  for (let i = Math.max(0, dernier - 2); i <= dernier; i++) {
    const c = classe(B, calc, i, SEUIL_EXTREME); if (c.niveau !== 2) continue; const fin = B[i].t + pas; if (maintenant - fin > maxAgeMs) continue;
    L.push({ cle: `${actif}|${unite}|${B[i].t}`, i, t: B[i].t, dir: c.dir, rel: c.rel, ma: positionMa(B, calc, i), texte: phraseAlerte({ actif, unite, dir: c.dir, rel: c.rel, ma: positionMa(B, calc, i) }) });
  }
  return L;
}

/* résumé parlé du tableau (Rayle) : chiffres + taille de l'échantillon, sans rien promettre */
export function resumeParle(T, { actif, unite, seuil = SEUIL_DEFAUT }) {
  const nom = NOM_ACTIF[actif] || actif, u = NOM_UNITE[unite] || unite, L = T.lignes;
  const frag = (titre, s) => (!s.n ? null : s.petit ? `${titre} : ${s.n} cas, ${TEXTE_PETIT}` : `${titre} : ${s.n} cas, continuation à cinq bougies dans ${nf(s.cont5, 0)} % des cas, retournement dans ${nf(s.ret5, 0)} %, mouvement moyen de ${nf(s.moy5, 1)} ATR à cinq bougies`);
  const F = [frag('bougies acheteuses fortes', L.achatFort), frag('bougies vendeuses fortes', L.venteForte), frag('acheteuses extrêmes', L.achatExtreme), frag('vendeuses extrêmes', L.venteExtreme)].filter(Boolean);
  if (!F.length) return `Sur ${nom} en ${u}, je ne vois aucune bougie à volume ≥ ×${nf(seuil, 1)} la médiane dans l’historique affiché.`;
  return `Sur ${nom} en ${u}, pour les bougies à volume au moins ×${nf(seuil, 1)} la médiane : ${F.join(' ; ')}. C’est une statistique descriptive du passé, pas un signal, et les petits échantillons ne prouvent rien.`;
}
