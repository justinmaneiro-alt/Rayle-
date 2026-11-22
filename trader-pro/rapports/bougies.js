/* ═════════════ LECTURE DES BOUGIES (v11, phase 2) : forme, figures, contexte, volume, position du prix ═════════════
   Calcul pur (aucun accès réseau ni écran) : testé dans trader-pro/tests/bougies-test.mjs. Tout est mesuré, rien n'est deviné ; les seuils sont ceux écrits dans le manuel (fiche « Lecture des bougies »).
   Bougie = { t, o, h, l, c, v? } (t en ms UTC). Niveau = { nom, prix, type? } (type : 'support' | 'resistance' | 'ma200' | 'volume' | 'ict' | 'fvg' | 'trace'). */

/* Seuils (en ATR de l'unité lue) : « sur » = à 0,25 ATR ou moins ; « proche » = jusqu'à 1 ATR ; au-delà : « loin ». */
export const SEUILS = Object.freeze({ sur: 0.25, proche: 1.0, corpsDoji: 0.1, corpsMarubozu: 0.9, mecheLongue: 0.6, pinCorpsMax: 0.34, tailleATR: { petite: 0.6, normale: 1.3, grande: 2 }, volumeFort: 1.5, volumeFaible: 0.7, balayage: 20, tolContact: 0.15 });

const num = x => Number.isFinite(x);
export const arrondir = (x, d = 2) => (num(x) ? +x.toFixed(d) : null);
export const classerDistance = distAtr => { const d = Math.abs(distAtr); return d <= SEUILS.sur ? 'sur' : d <= SEUILS.proche ? 'proche' : 'loin'; };
const tailleLib = r => (r < SEUILS.tailleATR.petite ? 'petite' : r < SEUILS.tailleATR.normale ? 'normale' : r < SEUILS.tailleATR.grande ? 'grande' : 'très grande');

/* Semaines (lundi → vendredi) construites depuis les bougies Daily ; la dernière peut être en cours. */
export function semaines(J) {
  const m = new Map(); (J || []).forEach((b, k) => { const jour = Math.floor((b.t + 6 * 3600e3) / 86400e3), cle = Math.floor((jour + 3) / 7); const w = m.get(cle); if (!w) m.set(cle, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0, i0: k, i1: k }); else { w.h = Math.max(w.h, b.h); w.l = Math.min(w.l, b.l); w.c = b.c; w.v += b.v || 0; w.i1 = k; } });
  return [...m.values()];
}

/* ATR de Wilder à l'index i (null si trop court) */
export function atrA(B, n = 14) {
  const out = new Array(B.length).fill(null); if (B.length <= n) return out;
  const tr = B.map((b, i) => (i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - B[i - 1].c), Math.abs(b.l - B[i - 1].c))));
  let a = 0; for (let i = 1; i <= n; i++) a += tr[i]; a /= n; out[n] = a; for (let i = n + 1; i < B.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; } return out;
}

/* Forme d'une bougie */
export function forme(b, atr) {
  const ampl = b.h - b.l, corps = Math.abs(b.c - b.o), haut = b.h - Math.max(b.o, b.c), bas = Math.min(b.o, b.c) - b.l;
  return { sens: b.c > b.o ? 'haussière' : b.c < b.o ? 'baissière' : 'neutre', amplitude: ampl, corps, mecheHaute: haut, mecheBasse: bas,
    corpsPct: ampl > 0 ? corps / ampl : 0, mecheHautePct: ampl > 0 ? haut / ampl : 0, mecheBassePct: ampl > 0 ? bas / ampl : 0,
    tailleAtr: num(atr) && atr > 0 ? ampl / atr : null, taille: num(atr) && atr > 0 ? tailleLib(ampl / atr) : null };
}

/* Figures (une bougie peut en cumuler : « inside bar » + « doji ») */
export function figures(b, prev, atr, tendanceAvant = 0) {
  const f = forme(b, atr), F = [];
  if (f.amplitude <= 0) return [{ id: 'plate', nom: 'bougie sans amplitude', sens: 0 }];
  const petite = f.tailleAtr != null && f.tailleAtr < SEUILS.tailleATR.petite;
  const doji = f.corpsPct <= SEUILS.corpsDoji;
  if (doji) F.push({ id: 'doji', nom: 'doji', sens: 0, note: 'indécision : ouverture et clôture presque identiques' });
  if (f.corpsPct >= SEUILS.corpsMarubozu && !petite) F.push({ id: 'marubozu', nom: 'marubozu ' + (f.sens === 'haussière' ? 'haussier' : 'baissier'), sens: f.sens === 'haussière' ? 1 : -1, note: 'corps plein, presque sans mèches : domination d’un camp' });
  const corpsHaut = (Math.min(b.o, b.c) - b.l) / f.amplitude;   // position du bas du corps dans la bougie (0 = en bas)
  if (!petite && f.mecheBassePct >= SEUILS.mecheLongue && f.corpsPct <= SEUILS.pinCorpsMax && corpsHaut >= 0.55 && f.mecheBasse >= 2 * f.corps) F.push({ id: 'pin-bas', nom: tendanceAvant < 0 ? 'marteau (pin bar haussière)' : 'pin bar haussière', sens: 1, note: 'longue mèche basse : les vendeurs ont été rejetés' });
  if (!petite && f.mecheHautePct >= SEUILS.mecheLongue && f.corpsPct <= SEUILS.pinCorpsMax && (b.h - Math.max(b.o, b.c)) / f.amplitude >= 0.55 && f.mecheHaute >= 2 * f.corps) F.push({ id: 'pin-haut', nom: tendanceAvant > 0 ? 'étoile filante (pin bar baissière)' : 'pin bar baissière', sens: -1, note: 'longue mèche haute : les acheteurs ont été rejetés' });
  if (!F.some(x => /^pin/.test(x.id)) && !petite) {
    if (f.mecheBassePct >= 0.5 && f.mecheBasse >= 0.8 * (atr || f.amplitude)) F.push({ id: 'rejet-bas', nom: 'longue mèche de rejet basse', sens: 1, note: 'prix repoussé vers le haut après un plongeon' });
    else if (f.mecheHautePct >= 0.5 && f.mecheHaute >= 0.8 * (atr || f.amplitude)) F.push({ id: 'rejet-haut', nom: 'longue mèche de rejet haute', sens: -1, note: 'prix repoussé vers le bas après une poussée' });
  }
  if (prev) {
    const pc = Math.abs(prev.c - prev.o), hautC = Math.max(b.o, b.c), basC = Math.min(b.o, b.c), hautP = Math.max(prev.o, prev.c), basP = Math.min(prev.o, prev.c);
    if (prev.c < prev.o && b.c > b.o && basC <= basP && hautC >= hautP && f.corps > pc) F.push({ id: 'avalement-haussier', nom: 'avalement haussier', sens: 1, note: 'le corps avale celui de la bougie précédente baissière' });
    if (prev.c > prev.o && b.c < b.o && basC <= basP && hautC >= hautP && f.corps > pc) F.push({ id: 'avalement-baissier', nom: 'avalement baissier', sens: -1, note: 'le corps avale celui de la bougie précédente haussière' });
    if (b.h <= prev.h && b.l >= prev.l) F.push({ id: 'inside', nom: 'inside bar', sens: 0, note: 'contenue dans la bougie précédente : compression avant mouvement' });
    else if (b.h > prev.h && b.l < prev.l) F.push({ id: 'outside', nom: 'outside bar', sens: 0, note: 'englobe la bougie précédente : élargissement, bataille des deux camps' });
  }
  return F;
}

/* Position du prix par rapport aux niveaux : « sur », « proche » ou « loin » en ATR ; « entre » deux zones. */
export function positionPrix(prix, niveaux, atr, { dec = 2, unite = '' } = {}) {
  const L = (niveaux || []).filter(n => n && num(n.prix) && num(prix)); if (!L.length || !num(atr) || atr <= 0) return { phrase: 'position non calculable (niveaux ou ATR indisponibles)', sur: [], proche: [], dessus: null, dessous: null, disponible: false };
  const fmt = x => arrondir(x, dec).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: dec }).replace(/[  ]/g, ' ');
  const pc = n => (n.prix / prix - 1) * 100, pcTxt = n => Math.abs(pc(n)).toFixed(1).replace('.', ',') + ' %';
  const avec = L.map(n => ({ ...n, distAtr: (n.prix - prix) / atr, distPct: pc(n), classe: classerDistance((n.prix - prix) / atr) }));
  const nature = n => (n.prix <= prix ? 'le support' : 'la résistance');
  const sur = avec.filter(n => n.classe === 'sur').sort((a, b) => Math.abs(a.distAtr) - Math.abs(b.distAtr));
  const dessus = avec.filter(n => n.prix > prix).sort((a, b) => a.prix - b.prix)[0] || null, dessous = avec.filter(n => n.prix <= prix).sort((a, b) => b.prix - a.prix)[0] || null;
  const proche = avec.filter(n => n.classe === 'proche').sort((a, b) => Math.abs(a.distAtr) - Math.abs(b.distAtr));
  const P = [];
  for (const n of sur.slice(0, 2)) P.push('On est sur ' + nature(n) + ' ' + n.nom + ' ' + fmt(n.prix) + ' (à ' + pcTxt(n) + ')');
  if (!sur.length) for (const n of proche.slice(0, 2)) P.push('Pas loin de ' + nature(n) + ' ' + n.nom + ' ' + fmt(n.prix) + ' (à ' + pcTxt(n) + ')');
  if (!sur.length && !proche.length && dessus && dessous) P.push('Entre deux zones : support à ' + fmt(dessous.prix) + ' (' + dessous.nom + '), résistance à ' + fmt(dessus.prix) + ' (' + dessus.nom + ')');
  else if (!sur.length && !proche.length) P.push('Loin de tout niveau connu : ' + (dessus ? 'prochaine résistance ' + dessus.nom + ' ' + fmt(dessus.prix) + ' à ' + pcTxt(dessus) : 'plus de résistance au-dessus dans les données') + (dessous ? ', prochain support ' + dessous.nom + ' ' + fmt(dessous.prix) + ' à ' + pcTxt(dessous) : ', plus de support en dessous dans les données'));
  return { phrase: P.join(' ; ') + '.', sur, proche, dessus, dessous, atr, unite, disponible: true, classeDessus: dessus ? dessus.classe : null, classeDessous: dessous ? dessous.classe : null };
}

/* Lecture d'UNE bougie à l'index i de B avec son contexte */
export function lireBougie(B, i, { atr, niveaux = [], dec = 2, ma200 = null, nomMa200 = 'MA200' } = {}) {
  const b = B[i], prev = i > 0 ? B[i - 1] : null, a = num(atr) ? atr : null;
  const tendAvant = i >= 4 ? Math.sign(B[i - 1].c - B[i - 4].c) : 0, fm = forme(b, a), F = figures(b, prev, a, tendAvant);
  const ctx = [], tol = (a || fm.amplitude) * SEUILS.tolContact, tousNiv = [...niveaux]; if (num(ma200)) tousNiv.push({ nom: nomMa200, prix: ma200, type: 'ma200' });
  for (const n of tousNiv) {
    if (!n || !num(n.prix)) continue;
    const touche = b.l - tol <= n.prix && b.h + tol >= n.prix; if (!touche) continue;
    const role = n.prix < b.c ? 'support' : n.prix > b.c ? 'résistance' : 'niveau', cloture = n.prix < b.c ? 'clôture au-dessus' : 'clôture en dessous';
    const rejet = role === 'support' ? b.l <= n.prix + tol && b.c > n.prix : role === 'résistance' ? b.h >= n.prix - tol && b.c < n.prix : false;
    ctx.push({ niveau: n.nom, prix: n.prix, role, touche: true, rejet, texte: (rejet ? 'rejet ' + (role === 'résistance' ? 'de la résistance' : role === 'support' ? 'du support' : 'du niveau') : 'touche ' + (role === 'résistance' ? 'la résistance' : role === 'support' ? 'le support' : 'le niveau')) + ' ' + n.nom + ' (' + cloture + ')' });
  }
  /* balayage : a dépassé le plus haut (ou plus bas) des N bougies précédentes puis clôturé de l'autre côté */
  const N = SEUILS.balayage, fen = B.slice(Math.max(0, i - N), i);
  if (fen.length >= 8) { const hh = Math.max(...fen.map(x => x.h)), ll = Math.min(...fen.map(x => x.l)); if (b.h > hh && b.c < hh) ctx.push({ niveau: 'plus haut de ' + fen.length + ' bougies', prix: hh, role: 'balayage', balayage: 'haut', texte: 'a balayé le plus haut des ' + fen.length + ' dernières bougies (' + arrondir(hh, dec) + ') puis a réintégré en dessous' }); if (b.l < ll && b.c > ll) ctx.push({ niveau: 'plus bas de ' + fen.length + ' bougies', prix: ll, role: 'balayage', balayage: 'bas', texte: 'a balayé le plus bas des ' + fen.length + ' dernières bougies (' + arrondir(ll, dec) + ') puis a réintégré au-dessus' }); }
  /* volume relatif à la moyenne des 20 bougies précédentes (si le volume existe) et delta réel si fourni */
  let volume = null; const vs = B.slice(Math.max(0, i - 20), i).map(x => x.v).filter(x => num(x) && x > 0);
  if (num(b.v) && b.v > 0 && vs.length >= 8) { const m = vs.reduce((s, x) => s + x, 0) / vs.length, r = b.v / m; volume = { relatif: arrondir(r, 2), lib: r >= SEUILS.volumeFort ? 'volume fort' : r <= SEUILS.volumeFaible ? 'volume faible' : 'volume normal' }; }
  let delta = null; if (num(b.bv) && num(b.v)) { const d = b.bv - (b.v - b.bv); delta = { valeur: arrondir(d, 0), sens: d > 0 ? 'acheteur' : d < 0 ? 'vendeur' : 'neutre' }; }
  const PRIO = ['pin-bas', 'pin-haut', 'avalement-haussier', 'avalement-baissier', 'marubozu', 'rejet-bas', 'rejet-haut', 'doji', 'outside', 'inside'], fort = [...F].sort((a, b) => PRIO.indexOf(a.id) - PRIO.indexOf(b.id))[0], contexteCle = ctx.find(c => c.rejet) || ctx.find(c => c.balayage) || ctx[0];
  let etiquette = fort ? fort.nom : fm.sens + ' ' + (fm.taille || '');
  if (contexteCle) etiquette += contexteCle.balayage ? ' · balayage' : ' sur ' + (contexteCle.role === 'support' ? 'support' : contexteCle.role === 'résistance' ? 'résistance' : 'niveau');
  return { index: i, t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, enCours: false, forme: fm, figures: F, contexte: ctx, volume, delta, etiquette: etiquette.trim() };
}

/* Les n dernières bougies d'une unité + la position du prix */
export function lireUnite(B, { n = 4, niveaux = [], dec = 2, unite = '', ma200 = null, nomMa200 = 'MA200', prix = null, enCours = false } = {}) {
  if (!B || B.length < 20) return { disponible: false, raison: 'pas assez de bougies (' + (B ? B.length : 0) + ')' };
  const A = atrA(B), atr = A[A.length - 1]; if (!num(atr)) return { disponible: false, raison: 'ATR non calculable' };
  const px = num(prix) ? prix : B[B.length - 1].c, k = Math.max(3, Math.min(5, n)), bougies = [];
  for (let i = B.length - k; i < B.length; i++) { const lb = lireBougie(B, i, { atr: A[i] || atr, niveaux, dec, ma200, nomMa200 }); if (enCours && i === B.length - 1) lb.enCours = true; bougies.push(lb); }
  const pos = positionPrix(px, [...niveaux, ...(num(ma200) ? [{ nom: nomMa200, prix: ma200, type: 'ma200' }] : [])], atr, { dec, unite });
  const der = bougies[bougies.length - 1], v = bougies.filter(x => x.figures.some(f => f.sens > 0)).length - bougies.filter(x => x.figures.some(f => f.sens < 0)).length;
  return { disponible: true, unite, atr: arrondir(atr, dec), bougies, derniere: der, position: pos, biais: v > 0 ? 'figures plutôt haussières' : v < 0 ? 'figures plutôt baissières' : 'figures neutres ou mélangées', prix: px };
}

/* Phrase parlée pour une unité (dense, chiffres réels) */
export function phraseUnite(L, nomUnite, dec = 2) {
  if (!L || !L.disponible) return nomUnite + ' : lecture des bougies indisponible' + (L && L.raison ? ' (' + L.raison + ')' : '') + '.';
  const d = L.derniere, P = [], f = d.forme;
  P.push('Dernière bougie ' + nomUnite + ' : ' + f.sens + ', ' + (f.taille || 'taille inconnue') + (f.tailleAtr != null ? ' (' + String(arrondir(f.tailleAtr, 1)).replace('.', ',') + ' ATR)' : '') + (d.enCours ? ', encore en cours' : '') + ', ' + (d.figures.length ? d.figures.map(x => x.nom).join(' et ') : 'sans figure particulière'));
  for (const c of d.contexte.slice(0, 2)) P.push(c.texte);
  if (d.volume) P.push(d.volume.lib + ' (' + String(d.volume.relatif).replace('.', ',') + ' fois la moyenne)');
  return P.join(', ') + '. ' + L.position.phrase;
}
