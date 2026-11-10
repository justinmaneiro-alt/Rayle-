/* ═════════════ STRUCTURE DE MARCHÉ H1 / H4 : DÉFINITION FIGÉE `structure-marche-v1` (2026-11-11, écrite et scellée AVANT tout affichage) ═════════════
   OUTIL DE LECTURE : décrit la structure (tendance, cassures, impulsions, changements de caractère, retournements). Jamais un ordre, jamais une prédiction : les fréquences viennent de structure-marche-stats.json (mesurées).
   L'empreinte SHA-256 de CE fichier (fins de ligne normalisées) est dans structure-marche-v1.sceau.json ; un test la vérifie. Pure : aucune dépendance.
   NON-REPAINT : tout est évalué par un parcours vers l'avant ; un événement créé à la clôture de la bougie i n'utilise que les bougies 0…i et ne bouge jamais. Seul son STATUT peut changer plus tard (« invalidé », daté) : il reste visible.

   RÈGLES
   - Fractale de K bougies : sommet (creux) STRICT = plus haut (plus bas) de la bougie j strictement supérieur (inférieur) à celui des K bougies avant ET des K bougies après ; connue à la clôture de la bougie j+K. K = 5 (structure) ; K = 10 (structure majeure).
   - Tendance à la bougie i (fractales connues à i) : haussière = deux derniers sommets croissants ET deux derniers creux croissants ; baissière = les deux décroissants ; sinon range (ou pas assez de fractales).
   - Creux protégé (tendance haussière) = dernier creux de fractale ; sommet protégé (tendance baissière) = dernier sommet.
   - Cassure de structure (BOS) : clôture au-delà du dernier sommet (creux) de fractale, UNE fois par niveau, dans le sens de la tendance (ou en range).
   - Impulsion contre la tendance : tendance haussière (baissière), le repli (la remontée) depuis le plus haut (bas) des 20 dernières bougies atteint ≥ 1,5 ATR(14) sans clôture sous le creux protégé (au-dessus du sommet protégé) : « rebond probable ». Une fois par plus haut (bas) de départ.
   - Changement de caractère (CHoCH) : clôture sous le creux protégé (au-dessus du sommet protégé) : « retournement possible », à la clôture de la bougie. L'extrême de l'impulsion = plus haut (bas) depuis la formation du creux (sommet) protégé.
   - Retournement confirmé : après un CHoCH, un rebond d'au moins 0,5 ATR depuis le plus bas (haut) atteint depuis le CHoCH, qui ne reprend pas l'extrême de l'impulsion, PUIS une clôture sous ce plus bas (au-dessus de ce plus haut) : nouvelle cassure dans le nouveau sens.
   - Invalidation d'un CHoCH avant confirmation : clôture qui reprend l'extrême de l'impulsion. Invalidation d'une impulsion : un CHoCH dans le sens opposé à son rebond attendu. */
export const VERSION = 'structure-marche-v1', FIGEES_LE = '2026-11-11';
export const P = Object.freeze({ K: 5, Kmajeure: 10, fenetrePic: 20, impulsionAtr: 1.5, rebondAtr: 0.5, atrN: 14 });
export const TEXTE_REGLES = 'Structure de marché v1 : fractales de 5 bougies (10 pour la structure majeure), tendance = sommets et creux croissants / décroissants ; cassure de structure = clôture au-delà du dernier sommet ou creux ; impulsion contre la tendance = repli d\'au moins 1,5 ATR sans cassure du creux (sommet) protégé ; changement de caractère = clôture au-delà du creux (sommet) protégé ; retournement confirmé = rebond qui ne reprend pas l\'extrême de l\'impulsion puis nouvelle cassure dans le nouveau sens ; invalidé si la clôture reprend l\'extrême de l\'impulsion.';
export const NOMS = Object.freeze({ bos: 'Cassure de structure', impulsion: 'Impulsion contre la tendance', choch: 'Changement de caractère', confirme: 'Retournement confirmé' });
export const MENTIONS = Object.freeze({ bos: 'Cassure de structure', impulsion: 'Impulsion contre la tendance : rebond probable', choch: 'Retournement possible', confirme: 'Retournement confirmé' });
/* agrège des bougies { t, o, h, l, c, v } en périodes de `periodeMs` (seulement des bougies fournies : la dernière peut être partielle) */
export function agreger(B, periodeMs) { const o = []; let cur = null; for (const b of B) { const t0 = Math.floor(b.t / periodeMs) * periodeMs; if (!cur || cur.t !== t0) { cur = { t: t0, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0, n: 1 }; o.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v || 0; cur.n++; } } return o; }
export function atrSerie(B, n = P.atrN) { const o = new Array(B.length).fill(null); let s = 0; const tr = i => Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c)); for (let i = 1; i < B.length; i++) { s += tr(i); if (i > n) s -= tr(i - n); if (i >= n) o[i] = s / n; } return o; }
/* Analyse vers l'avant. B = bougies CLOSES. Renvoie { swings, tendance[] (1 / −1 / 0 par bougie), events[], etat } */
export function analyser(B, { K = P.K, periode = 3600e3 } = {}) {
  const n = B.length, A = atrSerie(B), swH = [], swL = [], swings = [], tendance = new Array(n).fill(0), events = [], suivis = [];
  const evt = (type, dir, i, o) => { const e = { id: `${type}|${B[i].t}|${dir}`, type, dir, i, t: B[i].t, tCloture: B[i].t + periode, statut: 'actif', tInval: null, ...o }; events.push(e); return e; };
  let impulsions = new Set();
  for (let i = 0; i < n; i++) {
    const j = i - K;   // fractale candidate : connue à la clôture de i
    if (j >= K) {
      let h = true, l = true; for (let k = 1; k <= K && (h || l); k++) { if (!(B[j].h > B[j - k].h && B[j].h > B[j + k].h)) h = false; if (!(B[j].l < B[j - k].l && B[j].l < B[j + k].l)) l = false; }
      if (h) { const s = { type: 'H', i: j, p: B[j].h, t: B[j].t, conf: i, casse: false }; swH.push(s); swings.push(s); } if (l) { const s = { type: 'L', i: j, p: B[j].l, t: B[j].t, conf: i, casse: false }; swL.push(s); swings.push(s); }
    }
    let tr = 0; if (swH.length >= 2 && swL.length >= 2) { const H1 = swH[swH.length - 2].p, H2 = swH[swH.length - 1].p, L1 = swL[swL.length - 2].p, L2 = swL[swL.length - 1].p; tr = H2 > H1 && L2 > L1 ? 1 : H2 < H1 && L2 < L1 ? -1 : 0; } tendance[i] = tr;
    const a = A[i], c = B[i].c, dH = swH[swH.length - 1], dL = swL[swL.length - 1];
    // suivi des retournements en attente (créés AVANT cette bougie)
    for (const s of suivis) {
      if (s.fini || i <= s.i0) continue; const ch = s.choch;
      if (s.dir < 0 ? c > s.extreme : c < s.extreme) { ch.statut = 'invalide'; ch.tInval = B[i].t; ch.raisonInval = 'la clôture a repris l\'extrême de l\'impulsion'; s.fini = true; continue; }
      const ref = s.dir < 0 ? s.bas : s.haut;   // plus bas (haut) atteint depuis le CHoCH, jusqu'à la bougie précédente
      if (a != null && !s.rebond && (s.dir < 0 ? s.apres >= ref + P.rebondAtr * a : s.apres <= ref - P.rebondAtr * a)) s.rebond = true;   // rebond = remontée (repli) d'au moins 0,5 ATR APRÈS le plus bas (haut)
      if (s.rebond && (s.dir < 0 ? c < ref && s.maxH < s.extreme : c > ref && s.minL > s.extreme)) { evt('confirme', s.dir, i, { niveau: ref, extreme: s.extreme, refNouveau: ref, ref: ch.id, extremeOrigine: s.extreme }); s.fini = true; continue; }
      s.maxH = Math.max(s.maxH, B[i].h); s.minL = Math.min(s.minL, B[i].l);
      if (s.dir < 0) { if (B[i].l < s.bas) { s.bas = B[i].l; s.apres = -Infinity; } else s.apres = Math.max(s.apres, B[i].h); } else { if (B[i].h > s.haut) { s.haut = B[i].h; s.apres = Infinity; } else s.apres = Math.min(s.apres, B[i].l); }
    }
    if (a == null) continue;
    // changement de caractère
    let choch = false;
    if (tr === 1 && dL && !dL.casse && c < dL.p) {
      dL.casse = true; choch = true; let ext = -Infinity; for (let k = dL.i; k <= i; k++) ext = Math.max(ext, B[k].h); const e = evt('choch', -1, i, { niveau: dL.p, extreme: ext, refNouveau: Math.min(...B.slice(dL.i, i + 1).map(b => b.l)) });
      suivis.push({ dir: -1, i0: i, choch: e, extreme: ext, bas: B[i].l, haut: B[i].h, maxH: -Infinity, minL: Infinity, apres: -Infinity, rebond: false, fini: false });
      for (const e2 of events) if (e2.type === 'impulsion' && e2.dir === 1 && e2.statut === 'actif') { e2.statut = 'invalide'; e2.tInval = B[i].t; e2.raisonInval = 'changement de caractère : le creux protégé est cassé'; }
    } else if (tr === -1 && dH && !dH.casse && c > dH.p) {
      dH.casse = true; choch = true; let ext = Infinity; for (let k = dH.i; k <= i; k++) ext = Math.min(ext, B[k].l); const e = evt('choch', 1, i, { niveau: dH.p, extreme: ext, refNouveau: Math.max(...B.slice(dH.i, i + 1).map(b => b.h)) });
      suivis.push({ dir: 1, i0: i, choch: e, extreme: ext, bas: B[i].l, haut: B[i].h, maxH: -Infinity, minL: Infinity, apres: Infinity, rebond: false, fini: false });
      for (const e2 of events) if (e2.type === 'impulsion' && e2.dir === -1 && e2.statut === 'actif') { e2.statut = 'invalide'; e2.tInval = B[i].t; e2.raisonInval = 'changement de caractère : le sommet protégé est cassé'; }
    }
    // cassure de structure dans le sens de la tendance (ou en range)
    if (!choch) {
      if (dH && !dH.casse && c > dH.p && tr >= 0) { dH.casse = true; evt('bos', 1, i, { niveau: dH.p }); }
      else if (dL && !dL.casse && c < dL.p && tr <= 0) { dL.casse = true; evt('bos', -1, i, { niveau: dL.p }); }
    }
    // impulsion contre la tendance (repli d'au moins 1,5 ATR sans clôture au-delà du niveau protégé)
    if (!choch && i >= P.fenetrePic) {
      if (tr === 1 && dL) { let pk = -Infinity, ip = i; for (let k = i - P.fenetrePic + 1; k <= i; k++) if (B[k].h >= pk) { pk = B[k].h; ip = k; } let bas = Infinity; for (let k = ip; k <= i; k++) bas = Math.min(bas, B[k].l); const cle = 'u' + ip;
        if (!impulsions.has(cle) && pk - bas >= P.impulsionAtr * a && c >= dL.p && ip < i) { impulsions.add(cle); evt('impulsion', -1, i, { niveau: dL.p, extreme: pk, refNouveau: bas, repli: pk - bas, repliAtr: (pk - bas) / a }); } }
      else if (tr === -1 && dH) { let pk = Infinity, ip = i; for (let k = i - P.fenetrePic + 1; k <= i; k++) if (B[k].l <= pk) { pk = B[k].l; ip = k; } let haut = -Infinity; for (let k = ip; k <= i; k++) haut = Math.max(haut, B[k].h); const cle = 'd' + ip;
        if (!impulsions.has(cle) && haut - pk >= P.impulsionAtr * a && c <= dH.p && ip < i) { impulsions.add(cle); evt('impulsion', 1, i, { niveau: dH.p, extreme: pk, refNouveau: haut, repli: haut - pk, repliAtr: (haut - pk) / a }); } }
    }
  }
  // état courant : tendance, dernière cassure, impulsion / CHoCH / retournement en cours
  const der = events.slice().reverse(), dernierBos = der.find(e => e.type === 'bos') || null, dernierEvt = der[0] || null, enCours = suivis.filter(s => !s.fini).map(s => s.choch);
  const imp = der.find(e => e.type === 'impulsion' && e.statut === 'actif' && n - 1 - e.i <= 12) || null;
  return { K, swings, tendance, events, etat: { tendance: n ? tendance[n - 1] : 0, protegeBas: swL.length ? swL[swL.length - 1] : null, protegeHaut: swH.length ? swH[swH.length - 1] : null, dernierBos, dernierEvt, chochEnCours: enCours[enCours.length - 1] || null, impulsionActive: imp, n } };
}
/* libellé de tendance */
export const nomTendance = t => (t > 0 ? 'haussière' : t < 0 ? 'baissière' : 'en range');
/* fiche d'un événement à partir des statistiques mesurées (stats = structure-marche-stats.json) : { texte, n, assez } */
export function phraseStats(stats, tf, type, fenetre, horizon = 12) {
  const S = stats && stats[tf] && stats[tf][type] && stats[tf][type][fenetre]; if (!S) return { texte: 'statistiques indisponibles', assez: false, n: 0 };
  if (!S.assez) return { texte: `pas assez de données (${S.n} cas, il en faut 30)`, assez: false, n: S.n };
  const r = S['r' + horizon], q = S['q' + horizon], pc = x => Math.round(x * 100) + ' %';
  return { texte: `${tf} · ${fenetre === 'recent' ? 'sur les derniers mois' : 'sur 2015–2025'} (${S.n} cas) : la tendance d'origine a repris dans ${horizon} bougies ${pc(r.p)} du temps (base ${pc(S.base['r' + horizon].p)}) ; un nouveau ${S.dirOrigine > 0 ? 'creux' : 'sommet'} dans le nouveau sens ${pc(q.p)} (base ${pc(S.base['q' + horizon].p)})`, assez: true, n: S.n, r, q };
}
