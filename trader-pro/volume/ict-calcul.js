/* ═════════════ REPÈRES ICT : CALCULS PURS (v6, A4) ═════════════
   Entrée : bougies Daily { t (ms), o, h, l, c, v } triées. Tout est calculé sur des données PASSÉES : aucun repère n'utilise la bougie en cours comme si elle était close
   (la veille / la semaine / le mois précédents sont les périodes TERMINÉES). Aucune prévision : ce sont des repères de lecture, pas des signaux.
   Le jour d'une bougie Daily est la date UTC de (t + 6 h) : les bougies Yahoo des futures ou du forex ouvrent la veille au soir (21 h / 22 h UTC) et appartiennent à la séance du lendemain. */
export const H = 3600e3, J = 86400e3;
export const jourDe = t => Math.floor((t + 6 * H) / J);                       // numéro de jour UTC
export const semaineDe = t => Math.floor((jourDe(t) + 3) / 7);                // 1970-01-01 est un jeudi : semaines du lundi au dimanche
export const moisDe = t => { const d = new Date(t + 6 * H); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const cle = { S: semaineDe, M: moisDe, J: jourDe };

/* agrège des bougies Daily en semaines ('S') ou mois ('M') ; la dernière peut être en cours (enCours = true) */
export function agreger(B, tf) {
  if (tf === 'J') return B.map(b => ({ ...b }));
  const f = cle[tf], m = new Map(), L = [];
  for (const b of B) { const k = f(b.t); let g = m.get(k); if (!g) { g = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0, n: 1 }; m.set(k, g); L.push(g); } else { g.h = Math.max(g.h, b.h); g.l = Math.min(g.l, b.l); g.c = b.c; g.v += b.v || 0; g.n++; } }
  return L;
}
const atr = (B, n = 14) => { const L = B.slice(-n - 1); if (L.length < 2) return null; let s = 0; for (let i = 1; i < L.length; i++) s += Math.max(L[i].h - L[i].l, Math.abs(L[i].h - L[i - 1].c), Math.abs(L[i].l - L[i - 1].c)); return s / (L.length - 1); };
export const atrJournalier = (B, n = 14) => atr(B, n);
/* ATR « Daily » à partir de bougies de n'importe quelle unité (H1 / H4 : regroupées par jour UTC) */
export function atrDaily(B, unite) { if (unite === 'J') return atr(B, 14); const m = new Map(); for (const b of B) { const k = jourDe(b.t); const g = m.get(k); if (!g) m.set(k, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }); else { g.h = Math.max(g.h, b.h); g.l = Math.min(g.l, b.l); g.c = b.c; } } return atr([...m.values()], 14); }

/* la dernière bougie / période est-elle terminée ? Jour : la bougie a duré 24 h. Semaine, mois : la date réelle (UTC, sans décalage) est dans une période suivante, ou la semaine est finie (samedi, dimanche).
   Le décalage de 6 h sert à classer les bougies qui ouvrent la veille au soir ; il ne doit pas servir à dater « maintenant » (un bougie Binance de 00 h UTC serait jugée terminée dès 18 h). */
function periodeFinie(tf, dern, maintenant) {
  if (tf === 'J') return dern.t + J <= maintenant; const d = new Date(maintenant);
  if (tf === 'S') { const sNow = Math.floor((Math.floor(maintenant / J) + 3) / 7); return sNow > semaineDe(dern.t) || (sNow === semaineDe(dern.t) && (d.getUTCDay() + 6) % 7 >= 5 && dern.n != null); }
  return d.getUTCFullYear() * 12 + d.getUTCMonth() > moisDe(dern.t);
}
/* repères : plus haut / plus bas de la période précédente TERMINÉE, ouverture de la période en cours */
export function reperes(B, maintenant = Date.now()) {
  if (B.length < 3) return null; const R = { niveaux: [], ouvertures: [] };
  for (const [tf, p, nomH, nomL, nomO] of [['J', 'J', 'PDH', 'PDL', 'Ouverture jour'], ['S', 'S', 'PWH', 'PWL', 'Ouverture semaine'], ['M', 'M', 'PMH', 'PML', 'Ouverture mois']]) {
    const G = agreger(B, p); if (G.length < 2) continue;
    const dern = G[G.length - 1], clos = periodeFinie(tf, dern, maintenant) ? dern : G[G.length - 2];   // la dernière période est-elle déjà terminée ?
    const courante = clos === dern ? null : dern, prec = clos;
    R.niveaux.push({ id: nomH, prix: prec.h, type: 'haut', tf, depuis: prec.t, nom: nomH }, { id: nomL, prix: prec.l, type: 'bas', tf, depuis: prec.t, nom: nomL });
    if (courante) R.ouvertures.push({ id: 'O' + tf, prix: courante.o, nom: nomO, tf });
    R['prec' + tf] = prec; R['cour' + tf] = courante;
  }
  return R;
}
/* premium / discount : 50 % du range de référence (semaine précédente par défaut) */
export function premiumDiscount(B, { ref = 'S', maintenant = Date.now() } = {}) {
  const R = reperes(B, maintenant); if (!R) return null; const p = R['prec' + ref]; if (!p) return null; const eq = (p.h + p.l) / 2, px = B[B.length - 1].c;
  return { haut: p.h, bas: p.l, equilibre: eq, prix: px, zone: px > eq ? 'premium' : px < eq ? 'discount' : 'équilibre', ref, partRange: p.h > p.l ? (px - p.l) / (p.h - p.l) : null };
}
/* fair value gaps encore ouverts (3 bougies : trou entre le haut de la 1re et le bas de la 3e, ou l'inverse). Comblé = une bougie ultérieure a traversé toute la zone → retiré ; comblé en partie → zone réduite. */
export function fairValueGaps(B, { max = 6, minAtr = 0.1 } = {}) {
  const a = atr(B, 14) || 0, L = [];
  for (let i = 0; i + 2 < B.length; i++) {
    const A = B[i], C = B[i + 2];
    let zone = null; if (C.l > A.h) zone = { sens: 'haussier', bas: A.h, haut: C.l }; else if (C.h < A.l) zone = { sens: 'baissier', bas: C.h, haut: A.l };
    if (!zone || zone.haut - zone.bas < a * minAtr) continue;
    let bas = zone.bas, haut = zone.haut, comble = false;
    for (let k = i + 3; k < B.length; k++) { if (zone.sens === 'haussier') { if (B[k].l <= bas) { comble = true; break; } haut = Math.min(haut, B[k].l); } else { if (B[k].h >= haut) { comble = true; break; } bas = Math.max(bas, B[k].h); } }
    if (!comble) L.push({ sens: zone.sens, bas, haut, t: B[i + 1].t, idx: i + 1 });
  }
  const px = B[B.length - 1].c; return L.sort((x, y) => Math.abs((x.bas + x.haut) / 2 - px) - Math.abs((y.bas + y.haut) / 2 - px)).slice(0, max);
}
/* order blocks : dernière bougie opposée avant un déplacement qui casse la structure (plus haut / bas des 10 bougies précédentes) d'au moins 1 ATR ; valide tant qu'aucune clôture ne le traverse */
export function orderBlocks(B, { max = 4, regard = 10, fenetre = 4 } = {}) {
  const a = atr(B, 14); if (!a) return []; const L = [];
  for (let i = regard; i < B.length - 1; i++) {
    const b = B[i], hautPrec = Math.max(...B.slice(i - regard, i).map(x => x.h)), basPrec = Math.min(...B.slice(i - regard, i).map(x => x.l));
    for (let j = i + 1; j <= Math.min(B.length - 1, i + fenetre); j++) {
      const x = B[j];
      if (b.c < b.o && x.c > hautPrec && x.c - b.h >= a * 0.8) { L.push({ sens: 'haussier', bas: b.l, haut: b.h, t: b.t, idx: i }); break; }
      if (b.c > b.o && x.c < basPrec && b.l - x.c >= a * 0.8) { L.push({ sens: 'baissier', bas: b.l, haut: b.h, t: b.t, idx: i }); break; }
    }
  }
  const valides = L.filter(o => { for (let k = o.idx + 2; k < B.length; k++) { if (o.sens === 'haussier' && B[k].c < o.bas) return false; if (o.sens === 'baissier' && B[k].c > o.haut) return false; } return true; });
  const px = B[B.length - 1].c, vus = new Set(); return valides.filter(o => { const k = o.sens + o.idx; if (vus.has(k)) return false; vus.add(k); return true; }).sort((x, y) => Math.abs((x.bas + x.haut) / 2 - px) - Math.abs((y.bas + y.haut) / 2 - px)).slice(0, max);
}
/* égaux hauts / égaux bas (liquidité) : au moins 2 pivots (2 bougies de chaque côté) à moins de 0,15 ATR l'un de l'autre sur les 120 dernières bougies, non encore balayés (aucune bougie ultérieure ne les a dépassés) */
export function egaux(B, { max = 4, fenetre = 120, tolAtr = 0.15 } = {}) {
  const a = atr(B, 14); if (!a) return []; const deb = Math.max(2, B.length - fenetre), P = { haut: [], bas: [] };
  for (let i = deb; i < B.length - 2; i++) { if (B[i].h > B[i - 1].h && B[i].h > B[i - 2].h && B[i].h >= B[i + 1].h && B[i].h >= B[i + 2].h) P.haut.push(i); if (B[i].l < B[i - 1].l && B[i].l < B[i - 2].l && B[i].l <= B[i + 1].l && B[i].l <= B[i + 2].l) P.bas.push(i); }
  const R = [];
  for (const type of ['haut', 'bas']) {
    const v = x => (type === 'haut' ? B[x].h : B[x].l), L = P[type];
    for (let u = 0; u < L.length; u++) for (let w = u + 1; w < L.length; w++) {
      if (Math.abs(v(L[u]) - v(L[w])) > a * tolAtr) continue; const prix = type === 'haut' ? Math.max(v(L[u]), v(L[w])) : Math.min(v(L[u]), v(L[w]));
      let balaye = false; for (let k = L[w] + 1; k < B.length; k++) if (type === 'haut' ? B[k].h > prix : B[k].l < prix) { balaye = true; break; }
      if (!balaye && !R.some(r => r.type === type && Math.abs(r.prix - prix) < a * tolAtr)) R.push({ type, prix, t: B[L[w]].t, idx: L[w], marque: '$$$' });
    }
  }
  const px = B[B.length - 1].c; return R.sort((x, y) => Math.abs(x.prix - px) - Math.abs(y.prix - px)).slice(0, max);
}
/* balayages de liquidité : le prix passe au-delà d'un niveau puis revient en deçà dans la même bougie ou la suivante (clôture de retour) ; niveaux = [{ prix, type: 'haut' | 'bas', depuis }] */
export function balayages(B, niveaux, { recent = 30 } = {}) {
  const R = [], deb = Math.max(1, B.length - recent);
  for (const n of niveaux) for (let i = deb; i < B.length; i++) {
    if (B[i].t <= n.depuis) continue; const b = B[i], s = B[i + 1];
    const depasse = n.type === 'haut' ? b.h > n.prix : b.l < n.prix; if (!depasse) continue;
    const retour = n.type === 'haut' ? b.c < n.prix : b.c > n.prix, retourSuivante = s && (n.type === 'haut' ? s.c < n.prix : s.c > n.prix);
    if (retour || retourSuivante) { R.push({ niveau: n.id || n.nom || String(n.prix), prix: n.prix, type: n.type, t: b.t, sens: n.type === 'haut' ? 'baissier' : 'haussier' }); break; }
  }
  return R;
}
/* sessions sur bougies H1 (UTC) : Asie 00–08, Londres 08–13, New York 13–21 ; plus haut et plus bas de chaque session, pour les deux derniers jours */
export const SESSIONS = Object.freeze([{ id: 'asie', nom: 'Asie', de: 0, a: 8 }, { id: 'londres', nom: 'Londres', de: 8, a: 13 }, { id: 'newyork', nom: 'New York', de: 13, a: 21 }]);
export function sessions(H1, { jours = 2 } = {}) {
  const m = new Map(); for (const b of H1) { const h = new Date(b.t).getUTCHours(), s = SESSIONS.find(x => h >= x.de && h < x.a); if (!s) continue; const k = Math.floor(b.t / J) + '|' + s.id; const g = m.get(k); if (!g) m.set(k, { id: s.id, nom: s.nom, jour: Math.floor(b.t / J), t0: b.t, t1: b.t + H, haut: b.h, bas: b.l }); else { g.t1 = b.t + H; g.haut = Math.max(g.haut, b.h); g.bas = Math.min(g.bas, b.l); } }
  const L = [...m.values()].sort((x, y) => x.t0 - y.t0), dj = L.length ? L[L.length - 1].jour : 0; return L.filter(s => s.jour > dj - jours);
}
/* « Lecture en une ligne » : place dans le range, rapport à la veille, FVG ouvert le plus proche, liquidité la plus proche (au-dessus / en dessous) */
export function lecture({ B, fmt = v => String(Math.round(v)), maintenant = Date.now() } = {}) {
  if (!B || B.length < 20) return 'Pas assez de bougies Daily pour lire le contexte.'; const px = B[B.length - 1].c, R = reperes(B, maintenant), P = premiumDiscount(B, { maintenant }), parties = [];
  if (P) parties.push(`Prix en ${P.zone === 'premium' ? 'premium' : P.zone === 'discount' ? 'discount' : 'équilibre'} de la semaine`);
  if (R) { const pdh = R.niveaux.find(n => n.id === 'PDH'), pdl = R.niveaux.find(n => n.id === 'PDL'); if (pdh && pdl) parties.push(px > pdh.prix ? 'au-dessus du PDH' : px < pdl.prix ? 'sous le PDL' : 'entre le PDL et le PDH'); }
  const F = fairValueGaps(B, { max: 1 })[0]; if (F) parties.push(`FVG Daily ${F.sens === 'haussier' ? 'haussier' : 'baissier'} ouvert à ${fmt(F.bas)}–${fmt(F.haut)}`);
  const E = egaux(B), au = E.filter(e => e.prix > px).sort((x, y) => x.prix - y.prix)[0], sous = E.filter(e => e.prix < px).sort((x, y) => y.prix - x.prix)[0];
  const proche = [au, sous].filter(Boolean).sort((x, y) => Math.abs(x.prix - px) - Math.abs(y.prix - px))[0]; if (proche) parties.push(`liquidité ${proche.prix > px ? 'au-dessus' : 'en dessous'} à ${fmt(proche.prix)} (égaux ${proche.type === 'haut' ? 'hauts' : 'bas'})`);
  return parties.length ? parties[0] + (parties.length > 1 ? ' · ' + parties.slice(1).join(' · ') : '') + '.' : 'Aucun repère net sur la période.';
}
/* volume relatif du jour : volume de la séance comparé à la moyenne de 20 jours (bougies Daily terminées) ; fraction de séance écoulée pour une comparaison au même moment */
export function volumeRelatifJour(B, { maintenant = Date.now() } = {}) {
  if (B.length < 22) return null; const cour = B[B.length - 1]; const hist = B.slice(-21, -1); const moy = hist.reduce((s, b) => s + (b.v || 0), 0) / hist.length; if (!(moy > 0) || !(cour.v > 0)) return null;   // pas de volume sur la bougie en cours (source différée) : pas de rapport trompeur
  const ecoule = Math.min(1, Math.max(0.05, (maintenant - cour.t) / J)), attendu = moy * ecoule; return { volume: cour.v || 0, moyenne: moy, ratio: (cour.v || 0) / attendu - 1, ecoule };
}
