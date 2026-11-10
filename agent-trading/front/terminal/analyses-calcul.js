/* ═════════════ TERMINAL : ANALYSES DÉTERMINISTES (pur, testé : agent-trading/tests/terminal-b-test.mjs) ═════════════
   Bougies {t,o,h,l,c,v}. Rien n'est un signal d'ordre : tout est une LECTURE, étiquetée comme telle.
   1. motifs de bougies (règles écrites ci-dessous, détectés à la CLÔTURE) + contexte + statistique historique ;
   2. régime et événements (définitions écrites et figées : REGLES_REGIME) ;
   3. outils institutionnels : CVD, profil de volume (POC/VAH/VAL), VWAP de séance et ancré, extrêmes de la veille/semaine, séances, niveaux ronds,
      absorption / ordres cachés probables (heuristique : « déduction, pas une certitude »). */
export const MENTION = 'Information de lecture, pas un signal ni une promesse.';
export const DEDUCTION = 'déduction, pas une certitude';
const moy = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/* ───────── 1. MOTIFS DE BOUGIES ───────── */
export const MIN_OCCURRENCES = 30;
const corps = b => Math.abs(b.c - b.o), haut = b => b.h - Math.max(b.o, b.c), bas = b => Math.min(b.o, b.c) - b.l, ampl = b => b.h - b.l;
const hausse = b => b.c > b.o, baisse = b => b.c < b.o;
const milieu = b => (b.o + b.c) / 2;
/* tendance courte qui précède (pente de n clôtures) */
export function tendanceAvant(B, i, n = 5) { if (i < n) return 'inconnue'; const d = B[i - 1].c - B[i - n].c, a = moy(B.slice(i - n, i).map(ampl)) || 1; return d > a * 0.8 ? 'haussière' : d < -a * 0.8 ? 'baissière' : 'neutre'; }
export const MOTIFS = Object.freeze({
  marteau: { nom: 'marteau', sens: 'hausse', precede: 'baissière' },
  marteau_inverse: { nom: 'marteau inversé', sens: 'hausse', precede: 'baissière' },
  etoile_filante: { nom: 'étoile filante', sens: 'baisse', precede: 'haussière' },
  doji: { nom: 'doji', sens: 'indecision', precede: null },
  pin_haussier: { nom: 'pin bar haussière', sens: 'hausse', precede: null },
  pin_baissier: { nom: 'pin bar baissière', sens: 'baisse', precede: null },
  avalement_haussier: { nom: 'avalement haussier', sens: 'hausse', precede: 'baissière' },
  avalement_baissier: { nom: 'avalement baissier', sens: 'baisse', precede: 'haussière' },
  harami_haussier: { nom: 'harami haussier', sens: 'hausse', precede: 'baissière' },
  harami_baissier: { nom: 'harami baissier', sens: 'baisse', precede: 'haussière' },
  etoile_matin: { nom: 'étoile du matin', sens: 'hausse', precede: 'baissière' },
  etoile_soir: { nom: 'étoile du soir', sens: 'baisse', precede: 'haussière' },
  trois_soldats: { nom: 'trois soldats blancs', sens: 'hausse', precede: null },
  trois_corbeaux: { nom: 'trois corbeaux noirs', sens: 'baisse', precede: null },
  inside_bar: { nom: 'inside bar', sens: 'indecision', precede: null },
  outside_bar: { nom: 'outside bar', sens: 'indecision', precede: null }
});
/* Règles (toutes sur des rapports, donc indépendantes de l'actif) : petit corps = corps ≤ 30 % de l'amplitude ; grande mèche ≥ 2 × corps et ≥ 60 % de l'amplitude. */
export function motifsA(B, i) {
  const b = B[i]; if (!b || !(ampl(b) > 0)) return [];
  const R = [], A = ampl(b), c = corps(b), h = haut(b), l = bas(b), pre = tendanceAvant(B, i);
  const petit = c <= 0.3 * A;
  if (c <= 0.1 * A) R.push('doji');
  if (petit && l >= 2 * c && l >= 0.6 * A && h <= 0.1 * A + c * 0.5 && pre !== 'haussière') R.push('marteau');
  if (petit && h >= 2 * c && h >= 0.6 * A && l <= 0.1 * A + c * 0.5 && pre !== 'haussière') R.push('marteau_inverse');
  if (petit && h >= 2 * c && h >= 0.6 * A && l <= 0.1 * A + c * 0.5 && pre === 'haussière') { R.push('etoile_filante'); }
  if (l >= 0.66 * A && c <= 0.25 * A && Math.min(b.o, b.c) >= b.l + 0.66 * A) R.push('pin_haussier');
  if (h >= 0.66 * A && c <= 0.25 * A && Math.max(b.o, b.c) <= b.h - 0.66 * A) R.push('pin_baissier');
  if (i >= 1) {
    const p = B[i - 1], cp = corps(p);
    if (cp > 0 && c > cp) {
      if (baisse(p) && hausse(b) && b.o <= p.c && b.c >= p.o) R.push('avalement_haussier');
      if (hausse(p) && baisse(b) && b.o >= p.c && b.c <= p.o) R.push('avalement_baissier');
    }
    if (cp > 0 && c > 0 && c < cp * 0.6 && Math.max(b.o, b.c) < Math.max(p.o, p.c) && Math.min(b.o, b.c) > Math.min(p.o, p.c)) {
      if (baisse(p) && hausse(b)) R.push('harami_haussier'); if (hausse(p) && baisse(b)) R.push('harami_baissier');
    }
    if (b.h < p.h && b.l > p.l) R.push('inside_bar');
    if (b.h > p.h && b.l < p.l) R.push('outside_bar');
  }
  if (i >= 2) {
    const a = B[i - 2], m = B[i - 1], aA = ampl(a) || 1;
    if (baisse(a) && corps(a) >= 0.5 * aA && corps(m) <= 0.3 * (ampl(m) || 1) + 1e-12 && hausse(b) && b.c > milieu(a)) R.push('etoile_matin');
    if (hausse(a) && corps(a) >= 0.5 * aA && corps(m) <= 0.3 * (ampl(m) || 1) + 1e-12 && baisse(b) && b.c < milieu(a)) R.push('etoile_soir');
    const fort = x => corps(x) >= 0.5 * (ampl(x) || 1);
    if (hausse(a) && hausse(m) && hausse(b) && fort(a) && fort(m) && fort(b) && m.c > a.c && b.c > m.c && m.o > a.o && b.o > m.o) R.push('trois_soldats');
    if (baisse(a) && baisse(m) && baisse(b) && fort(a) && fort(m) && fort(b) && m.c < a.c && b.c < m.c && m.o < a.o && b.o < m.o) R.push('trois_corbeaux');
  }
  return R;
}
/* statistique historique : après le motif, le prix a-t-il bougé dans le sens attendu dans les `horizon` bougies ? (seuil : 0,5 × amplitude moyenne) */
export function statistique(B, id, { horizon = 5 } = {}) {
  const M = MOTIFS[id]; let n = 0, ok = 0;
  if (!M || M.sens === 'indecision') { for (let i = 20; i < B.length - horizon; i++) if (motifsA(B, i).includes(id)) n++; return { occurrences: n, reussis: null, suffisant: false, texte: n < MIN_OCCURRENCES ? `pas assez de données (${n} occurrence${n > 1 ? 's' : ''}, il en faut ${MIN_OCCURRENCES})` : 'motif d’indécision : pas de sens attendu' }; }
  for (let i = 20; i < B.length - horizon; i++) {
    if (!motifsA(B, i).includes(id)) continue; n++;
    const a = moy(B.slice(i - 14, i + 1).map(ampl)) || 1, d = B[i + horizon].c - B[i].c;
    if (M.sens === 'hausse' ? d > 0.5 * a : d < -0.5 * a) ok++;
  }
  const suffisant = n >= MIN_OCCURRENCES;
  return { occurrences: n, reussis: ok, suffisant, texte: suffisant ? `testé ${n} fois, a fonctionné ${ok} fois (${Math.round(ok / n * 100)} %)` : `pas assez de données (${n} occurrence${n > 1 ? 's' : ''}, il en faut ${MIN_OCCURRENCES})` };
}
/* motif à la clôture de la bougie i, avec son contexte */
export function lireMotifs(B, i, { niveaux = [], ma200 = null, atr = null, stats = true } = {}) {
  if (i == null) i = B.length - 1; const b = B[i]; if (!b) return [];
  const volMoy = moy(B.slice(Math.max(0, i - 20), i).map(x => x.v || 0)), vr = volMoy > 0 && b.v != null ? b.v / volMoy : null, a = atr || moy(B.slice(Math.max(0, i - 14), i + 1).map(ampl)) || 1;
  return motifsA(B, i).map(id => {
    const M = MOTIFS[id], tend = tendanceAvant(B, i);
    const proche = niveaux.map(n => ({ ...n, d: Math.min(Math.abs(b.l - n.p), Math.abs(b.h - n.p), Math.abs(b.c - n.p)) })).filter(n => n.d <= 0.5 * a).sort((x, y) => x.d - y.d)[0] || null;
    const ctx = { tendance: tend, surNiveau: proche ? { p: proche.p, nom: proche.nom || 'niveau', type: proche.p <= b.c ? 'support' : 'résistance' } : null, volumeRelatif: vr != null ? Math.round(vr * 10) / 10 : null, ma200Proche: ma200 != null && Math.abs(b.c - ma200) <= 0.5 * a };
    const dansLeSens = M.precede ? tend === M.precede : null;
    const st = stats ? statistique(B, id) : null;
    return { id, nom: M.nom, sens: M.sens, t: b.t, contexte: ctx, coherent: dansLeSens, stat: st,
      texte: `${M.nom} à la clôture${ctx.surNiveau ? `, sur un ${ctx.surNiveau.type} (${ctx.surNiveau.nom})` : ''}${ctx.ma200Proche ? ', près de la MA200' : ''}${vr != null ? `, volume ${vr >= 1.5 ? 'fort' : vr <= 0.7 ? 'faible' : 'normal'}` : ''}${st ? ' ; ' + st.texte : ''}. Lecture, pas un signal d’ordre.` };
  });
}

/* ───────── 2. RÉGIME ET ÉVÉNEMENTS (définitions figées) ───────── */
export const REGLES_REGIME = Object.freeze({ id: 'regime-lecture-v1', fenetre: 40, rangeMaxAtr: 6, rangeTouches: 2, tendancePente: 0.35, compression: 0.55, cassureAtr: 0.5, balayageRetour: 3 });
/* range : sur `fenetre` bougies, amplitude totale ≤ rangeMaxAtr × ATR ET au moins `rangeTouches` touches à chaque borne (à 0,25 ATR) ET pente faible.
   tendance : pente linéaire normalisée > tendancePente × ATR par bougie ... voir code. compression : ATR courant / ATR de la fenêtre < compression. */
export function atr(B, n = 14, fin = B.length - 1) { if (fin < 1) return 0; const L = []; for (let i = Math.max(1, fin - n + 1); i <= fin; i++) L.push(Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c))); return moy(L); }
export function regime(B, R = REGLES_REGIME) {
  const n = R.fenetre; if (B.length < n + 5) return { regime: 'inconnu', raison: `pas assez de bougies (${B.length}/${n + 5})` };
  const S = B.slice(-n), a = atr(B) || 1e-9, hi = Math.max(...S.map(x => x.h)), lo = Math.min(...S.map(x => x.l));
  const pente = (S[S.length - 1].c - S[0].c) / (n - 1) / a;
  const tH = S.filter(x => x.h >= hi - 0.25 * a).length, tB = S.filter(x => x.l <= lo + 0.25 * a).length;
  const atrLong = moy(B.slice(-n).map(ampl)) || 1e-9, atrCourt = moy(B.slice(-5).map(ampl)), comp = atrCourt / atrLong;
  let reg, raison;
  if ((hi - lo) <= R.rangeMaxAtr * a && tH >= R.rangeTouches && tB >= R.rangeTouches && Math.abs(pente) < R.tendancePente / 2) { reg = 'range'; raison = `amplitude ${((hi - lo) / a).toFixed(1).replace('.', ',')} ATR, ${tH} touches en haut et ${tB} en bas`; }
  else if (Math.abs(pente) >= R.tendancePente / 2 && Math.abs(S[S.length - 1].c - S[0].c) > 2 * a) { reg = pente > 0 ? 'tendance haussière' : 'tendance baissière'; raison = `pente ${pente.toFixed(2).replace('.', ',')} ATR par bougie`; }
  else { reg = 'transition'; raison = 'ni range défini, ni tendance nette'; }
  return { regime: reg, raison, haut: hi, bas: lo, compression: comp < R.compression, ratioCompression: Math.round(comp * 100) / 100, atr: a };
}
/* événements sur un niveau (dernière bougie close) : retournement, traversée/cassure confirmée, faux mouvement (balayage puis retour) */
export function evenementsNiveau(B, niveaux, R = REGLES_REGIME) {
  const E = [], n = B.length; if (n < 4) return E; const a = atr(B) || 1e-9, b = B[n - 1], p = B[n - 2];
  for (const nv of niveaux) {
    const x = nv.p, nom = nv.nom || 'niveau';
    // faux mouvement : une des `balayageRetour` dernières bougies a dépassé le niveau d'au moins 0,15 ATR, mais la bougie actuelle clôture revenue de l'autre côté (prioritaire sur cassure / traversée)
    const rec = B.slice(-R.balayageRetour - 1, -1), off = n - 1 - rec.length;
    const perce = (haut) => rec.some((k, j) => { const av = B[off + j - 1]; return av && (haut ? k.h > x + 0.15 * a && av.c < x : k.l < x - 0.15 * a && av.c > x); });
    if (perce(true) && b.c < x) { E.push({ type: 'faux_mouvement', sens: 'baisse', p: x, nom, texte: `faux mouvement au-dessus de ${nom} : balayage puis retour dessous` }); continue; }
    if (perce(false) && b.c > x) { E.push({ type: 'faux_mouvement', sens: 'hausse', p: x, nom, texte: `faux mouvement sous ${nom} : balayage puis retour dessus` }); continue; }
    if (p.c < x && b.c > x + R.cassureAtr * a) E.push({ type: 'cassure', sens: 'hausse', p: x, nom, texte: `cassure haussière de ${nom} (clôture à plus de ${R.cassureAtr} ATR au-dessus)` });
    else if (p.c > x && b.c < x - R.cassureAtr * a) E.push({ type: 'cassure', sens: 'baisse', p: x, nom, texte: `cassure baissière de ${nom} (clôture à plus de ${R.cassureAtr} ATR en dessous)` });
    else if (p.c < x && b.c > x) E.push({ type: 'traversee', sens: 'hausse', p: x, nom, texte: `traversée haussière de ${nom}, pas encore confirmée` });
    else if (p.c > x && b.c < x) E.push({ type: 'traversee', sens: 'baisse', p: x, nom, texte: `traversée baissière de ${nom}, pas encore confirmée` });
    // retournement sur le niveau : touche (±0,25 ATR) puis clôture de l'autre côté dans le sens opposé à l'approche
    const touche = b.l <= x + 0.25 * a && b.h >= x - 0.25 * a;
    const venuDuHaut = B.slice(-5, -1).some(k => k.c > x + a), venuDuBas = B.slice(-5, -1).some(k => k.c < x - a);
    if (touche && venuDuHaut && b.c > b.o && b.c > x) E.push({ type: 'retournement', sens: 'hausse', p: x, nom, texte: `retournement haussier sur ${nom}` });
    if (touche && venuDuBas && b.c < b.o && b.c < x) E.push({ type: 'retournement', sens: 'baisse', p: x, nom, texte: `retournement baissier sur ${nom}` });
  }
  return E;
}
/* ───────── 3. OUTILS INSTITUTIONNELS ───────── */
/* CVD : somme cumulée des deltas (achats au marché − ventes au marché) ; transactions {t,q,cote:'buy'|'sell'} */
export function cvd(transactions) { let c = 0; return transactions.map(x => { c += (x.cote === 'buy' ? 1 : -1) * x.q; return { t: x.t, v: c }; }); }
export function deltaParPeriode(transactions, ms) { const m = new Map(); for (const x of transactions) { const k = Math.floor(x.t / ms) * ms, o = m.get(k) || { t: k, achats: 0, ventes: 0 }; if (x.cote === 'buy') o.achats += x.q; else o.ventes += x.q; m.set(k, o); } return [...m.values()].sort((a, b) => a.t - b.t).map(o => ({ ...o, delta: o.achats - o.ventes })); }
/* profil de volume : le volume de chaque bougie est réparti sur les cases traversées entre bas et haut ; POC = case max ; zone de valeur = 70 % du volume autour du POC */
export function profilVolume(B, { cases = 48, valeur = 0.7 } = {}) {
  if (!B.length) return null; const lo = Math.min(...B.map(b => b.l)), hi = Math.max(...B.map(b => b.h)); if (!(hi > lo)) return null;
  const pas = (hi - lo) / cases, V = new Array(cases).fill(0);
  for (const b of B) { const v = b.v || 0, i0 = Math.min(cases - 1, Math.floor((b.l - lo) / pas)), i1 = Math.min(cases - 1, Math.floor((b.h - lo) / pas)), k = i1 - i0 + 1; for (let i = i0; i <= i1; i++) V[i] += v / k; }
  const tot = V.reduce((s, x) => s + x, 0); if (!(tot > 0)) return { poc: null, vah: null, val: null, cases: V, pas, bas: lo, raison: 'volume absent' };
  let ip = 0; V.forEach((x, i) => { if (x > V[ip]) ip = i; });
  let a = ip, z = ip, s = V[ip]; while (s < valeur * tot && (a > 0 || z < cases - 1)) { const g = a > 0 ? V[a - 1] : -1, d = z < cases - 1 ? V[z + 1] : -1; if (g >= d) { a--; s += V[a]; } else { z++; s += V[z]; } }
  const centre = i => lo + (i + 0.5) * pas;
  return { poc: centre(ip), vah: lo + (z + 1) * pas, val: lo + a * pas, cases: V, pas, bas: lo, total: tot };
}
export function vwap(B) { let pv = 0, v = 0; const sortie = []; for (const b of B) { const tp = (b.h + b.l + b.c) / 3, w = b.v || 0; pv += tp * w; v += w; sortie.push({ t: b.t, v: v > 0 ? pv / v : null }); } return sortie; }
const FJ = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' });   // formateurs créés UNE fois (en créer un par bougie bloquait la page plusieurs secondes)
const FM = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
const cacheJour = new Map();
const jourParis = t => { const k = Math.floor(t / 3600e3); let j = cacheJour.get(k); if (j === undefined) { j = FJ.format(new Date(k * 3600e3)); if (cacheJour.size > 5000) cacheJour.clear(); cacheJour.set(k, j); } return j; };   // le jour de Paris change à l'heure pleine ou 1 h/2 h : clé = heure UTC
export function bougiesDuJour(B, jour) { return B.filter(b => jourParis(b.t) === jour); }
export function vwapSeance(B, maintenant = B.length ? B[B.length - 1].t : Date.now()) { const j = jourParis(maintenant); return vwap(bougiesDuJour(B, j)); }
export function vwapAncre(B, tAncre) { return vwap(B.filter(b => b.t >= tAncre)); }
export function extremes(B, maintenant = Date.now()) {
  const j = jourParis(maintenant), veille = jourParis(maintenant - 86400e3 * (new Date(maintenant).getUTCDay() === 1 ? 3 : 1)), d = new Date(maintenant), lundi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).getTime();
  const ext = L => (L.length ? { haut: Math.max(...L.map(b => b.h)), bas: Math.min(...L.map(b => b.l)) } : null);
  return { veille: ext(B.filter(b => jourParis(b.t) === veille)), semainePrecedente: ext(B.filter(b => b.t >= lundi - 7 * 86400e3 && b.t < lundi)), jour: ext(B.filter(b => jourParis(b.t) === j)) };
}
/* séances (heure de Paris) : Asie 01:00–09:00, Londres 09:00–17:30, New York 15:30–22:00 (chevauchements normaux) */
export const SEANCES = Object.freeze([{ id: 'asie', nom: 'Asie', de: 1 * 60, a: 9 * 60 }, { id: 'londres', nom: 'Londres', de: 9 * 60, a: 17 * 60 + 30 }, { id: 'newyork', nom: 'New York', de: 15 * 60 + 30, a: 22 * 60 }]);
const minParis = t => { const [h, m] = FM.format(new Date(t)).split(':'); return (+h % 24) * 60 + +m; };
export function plagesSeances(B, maintenant = Date.now()) {
  const j = jourParis(maintenant), S = bougiesDuJour(B, j);
  return SEANCES.map(s => { const L = S.filter(b => { const m = minParis(b.t); return m >= s.de && m < s.a; }); return { id: s.id, nom: s.nom, haut: L.length ? Math.max(...L.map(b => b.h)) : null, bas: L.length ? Math.min(...L.map(b => b.l)) : null, volume: L.reduce((s2, b) => s2 + (b.v || 0), 0), mouvement: L.length ? L[L.length - 1].c - L[0].o : null, ouverture: L.length ? L[0].o : null, n: L.length }; });
}
/* niveaux ronds proches du prix : pas = 1, 10, 100, 1000… selon l'ordre de grandeur (≈ 1 % du prix) */
export function niveauxRonds(prix, { nombre = 3 } = {}) {
  if (!(prix > 0)) return []; const cible = prix * 0.0025, e = Math.floor(Math.log10(cible)), pas = 10 ** e * (cible / 10 ** e >= 5 ? 5 : cible / 10 ** e >= 2 ? 2 : 1), c = Math.round(prix / pas), R = [];
  for (let k = -nombre; k <= nombre; k++) { const p = Math.round((c + k) * pas * 1e8) / 1e8; if (p > 0) R.push({ p, nom: 'niveau rond', pas }); } return R.filter(x => x.p !== prix);
}
/* absorption probable : volume (ou delta) fort, mais le prix bouge peu — heuristique */
export function absorption(B, transactions = [], { fenetre = 6 } = {}) {
  const n = B.length; if (n < fenetre + 20) return null; const S = B.slice(-fenetre), ref = B.slice(-fenetre - 20, -fenetre), a = moy(ref.map(ampl)) || 1e-9, vref = moy(ref.map(b => b.v || 0));
  const vol = moy(S.map(b => b.v || 0)), amplS = (Math.max(...S.map(b => b.h)) - Math.min(...S.map(b => b.l))) / a;
  if (vref > 0 && vol > 1.6 * vref && amplS < fenetre * 0.9) {
    const t0 = S[0].t, d = transactions.filter(x => x.t >= t0).reduce((s, x) => s + (x.cote === 'buy' ? x.q : -x.q), 0);
    return { type: 'absorption', cote: d > 0 ? 'des achats absorbés par des vendeurs passifs' : d < 0 ? 'des ventes absorbées par des acheteurs passifs' : 'sans côté net', volumeRelatif: Math.round(vol / vref * 10) / 10, mention: DEDUCTION, texte: `volume ${Math.round(vol / vref * 10) / 10} fois la normale pour un prix qui bouge peu : absorption probable (${DEDUCTION})` };
  }
  return null;
}
/* ordres cachés probables : un niveau de prix traversé par beaucoup de transactions sans que le carnet affiché ne le montre */
export function ordresCaches(transactions, carnetMurs = [], { seuil = 3 } = {}) {
  if (transactions.length < 30) return null; const m = new Map(); for (const x of transactions) { const k = Math.round(x.p * 100) / 100, o = m.get(k) || { p: k, n: 0, q: 0 }; o.n++; o.q += x.q; m.set(k, o); }
  const qs = [...m.values()].map(x => x.q).sort((a, b) => a - b), med = qs[qs.length >> 1] || 0; const t = [...m.values()].filter(x => med > 0 && x.q >= seuil * med && !carnetMurs.some(w => Math.abs(w - x.p) <= 0.0005 * x.p)).sort((a, b) => b.q - a.q)[0];
  return t ? { type: 'ordre_cache', p: t.p, mention: DEDUCTION, texte: `beaucoup d’échanges à ${t.p} sans mur visible dans le carnet : ordre caché probable (${DEDUCTION})` } : null;
}
