/* ═════════════ LECTURE DU CARNET À L'ARRIVÉE SUR UNE BOÎTE — règle figée « carnet-lecture-v1 » (SHA-256 dans carnet-lecture-v1.sceau.json, posé AVANT l'affichage) ═════════════
   Document de référence : STRATEGIE-RAYLE.md §5. Fonctions pures, sans DOM ni réseau. Données : carnet Kraken Futures PF_XAUUSD (Maps prix → quantité) et transactions agressives (côté du preneur).
   AUCUNE mesure historique : le carnet n'a pas d'historique gratuit. Tout ce qui est lu ici est enregistré en direct, en ajout seul, puis comparé au résultat à 6, 12 et 24 bougies H1.
   « Lecture en observation, non validée » tant qu'il y a moins de 30 cas par classe. Une description, jamais un ordre. */
export const VERSION = 'carnet-lecture-v1', FIGEES_LE = '2026-11-11';
export const P = Object.freeze({
  arriveeAtr: 0.25,          // le prix est à ≤ 0,25 ATR d'une boîte (ou dedans)
  desequilibreAtr: 0.3,      // déséquilibre du carnet dans ±0,3 ATR du prix
  zoneMursAtr: 1,            // les murs sont cherchés dans ±1 ATR
  murMultiple: 4,            // un mur = niveau ≥ 4 fois la médiane des niveaux de la zone
  persistanceMs: 30e3,       // un mur est « persistant » à partir de 30 s
  fluxMs: [60e3, 300e3],     // flux exécuté sur 1 et 5 minutes
  pressionPart: 0.6,         // 60 % d'ordres d'un côté = déséquilibre net
  pressionFlux: 0.2,         // delta ≥ 20 % du volume agressif = flux net
  absorptionMouvement: 0.1,  // le prix bouge de ≤ 0,1 ATR malgré un flux net : absorption
  consommeFraction: 0.5, retireFraction: 0.3,
  casMin: 30, horizons: [6, 12, 24], barriereAtr: 1
});
export const TEXTE_REGLES = 'Lecture du carnet v1 : quand le prix est à 0,25 ATR ou moins d\'une boîte, déséquilibre du carnet dans ±0,3 ATR, plus gros mur et sa taille relative, flux exécuté sur 1 et 5 minutes (delta des transactions agressives), persistance des murs sur 30 secondes (mur retiré signalé), absorption. Lecture en observation, non validée : aucune mesure historique du carnet n\'existe.';
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));
const mediane = v => { if (!v.length) return null; const s = v.slice().sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

/* milieu du carnet */
export function milieu(c) { let bid = -Infinity, ask = Infinity; for (const p of c.bids.keys()) if (p > bid) bid = p; for (const p of c.asks.keys()) if (p < ask) ask = p; return Number.isFinite(bid) && Number.isFinite(ask) ? { bid, ask, mid: (bid + ask) / 2 } : null; }

/* déséquilibre dans ±k ATR du prix : quantités acheteuses et vendeuses, parts */
export function desequilibre(c, mid, a, k = P.desequilibreAtr) {
  let qb = 0, qa = 0; const d = k * a;
  for (const [p, q] of c.bids) if (p >= mid - d && p <= mid) qb += q;
  for (const [p, q] of c.asks) if (p <= mid + d && p >= mid) qa += q;
  const t = qb + qa; return { qb, qa, partAcheteurs: t > 0 ? qb / t : null, partVendeurs: t > 0 ? qa / t : null, largeur: d };
}
/* murs : niveaux ≥ 4 fois la médiane des niveaux dans ±1 ATR ; renvoie du plus gros au plus petit */
export function murs(c, mid, a, R = P) {
  const d = R.zoneMursAtr * a, B = [...c.bids].filter(([p]) => p >= mid - d && p <= mid), A_ = [...c.asks].filter(([p]) => p <= mid + d && p >= mid);
  const med = mediane([...B, ...A_].map(x => x[1]).filter(q => q > 0)); if (!med) return [];
  const L = []; for (const [p, q] of B) if (q >= R.murMultiple * med) L.push({ cote: 'achat', p, q, x: q / med });
  for (const [p, q] of A_) if (q >= R.murMultiple * med) L.push({ cote: 'vente', p, q, x: q / med });
  return L.sort((x, y) => y.q - x.q);
}
/* flux exécuté : delta (achats agressifs − ventes agressives) et volume sur une fenêtre ; transactions { t, p, q, cote: 'buy' | 'sell' } */
export function flux(trades, now, ms) {
  let achats = 0, ventes = 0, n = 0, premier = null, dernier = null;
  for (const x of trades) { if (x.t < now - ms || x.t > now) continue; n++; if (x.cote === 'buy') achats += x.q; else ventes += x.q; if (premier == null) premier = x.p; dernier = x.p; }
  const vol = achats + ventes; return { ms, n, achats, ventes, delta: achats - ventes, volume: vol, partDelta: vol > 0 ? (achats - ventes) / vol : null, premier, dernier };
}
/* absorption : flux net d'un côté sur 5 minutes SANS déplacement du prix (≤ 0,1 ATR) */
export function absorption(f5, a, R = P) {
  if (!f5 || f5.n < 5 || f5.partDelta == null || Math.abs(f5.partDelta) < R.pressionFlux || f5.premier == null) return null;
  const bouge = Math.abs(f5.dernier - f5.premier); if (bouge > R.absorptionMouvement * a) return null;
  return f5.partDelta < 0 ? { cote: 'achat', texte: 'ventes agressives absorbées : le prix ne baisse pas' } : { cote: 'vente', texte: 'achats agressifs absorbés : le prix ne monte pas' };
}

/* suivi des murs d'une mise à jour à l'autre : âge, persistance, mur retiré (retiré = l'ordre a disparu sans être exécuté ; mangé = exécuté) */
export function creerSuiviMurs(R = P) {
  const vus = new Map(), retires = [];
  return {
    maj(c, trades, now, mid, a) {
      const courants = murs(c, mid, a, R), cles = new Set(), nouveaux = [];
      for (const m of courants) { const k = `${m.cote}|${m.p}`; cles.add(k); const v = vus.get(k); if (!v) vus.set(k, { ...m, depuis: now, dernier: now }); else { v.q = m.q; v.x = m.x; v.dernier = now; } }
      for (const [k, v] of [...vus]) {
        if (cles.has(k)) continue; const reste = (v.cote === 'achat' ? c.bids : c.asks).get(v.p) || 0;
        if (reste >= v.q * (1 - R.retireFraction)) { vus.delete(k); continue; }   // le niveau est toujours là : il ne dépasse plus la médiane (ou sort de la zone), ce n'est pas un retrait
        const mange = trades.filter(x => x.t >= v.depuis && Math.abs(x.p - v.p) < 1e-9).reduce((s, x) => s + x.q, 0);
        const traverse = v.cote === 'achat' ? mid < v.p : mid > v.p;
        const r = { cote: v.cote, p: v.p, q: v.q, t: now, depuis: v.depuis, age: now - v.depuis, raison: traverse ? 'traversé par le prix' : mange >= R.consommeFraction * v.q ? 'mangé par des transactions' : 'retiré sans être exécuté' };
        if (now - v.depuis >= 5000) { retires.push(r); nouveaux.push(r); } vus.delete(k);
      }
      if (retires.length > 40) retires.splice(0, retires.length - 40);
      const L = courants.map(m => { const v = vus.get(`${m.cote}|${m.p}`); return { ...m, depuis: v.depuis, age: now - v.depuis, persistant: now - v.depuis >= R.persistanceMs }; });
      return { murs: L, nouveauxRetires: nouveaux, retires: retires.slice() };
    }
  };
}

/* lecture complète à l'arrivée : mesures + verdict d'une phrase. zone { cote: 'vente' | 'achat', prix, bas, haut } ; suivi = résultat de creerSuiviMurs().maj */
export function lire({ carnet, trades, now, atr, zone, suivi = null, R = P }) {
  const m = carnet && milieu(carnet); if (!m || !(atr > 0)) return { ok: false, raison: 'carnet ou ATR indisponible' };
  const mid = m.mid, des = desequilibre(carnet, mid, atr, R.desequilibreAtr), f1 = flux(trades, now, R.fluxMs[0]), f5 = flux(trades, now, R.fluxMs[1]);
  const L = suivi ? suivi.murs : murs(carnet, mid, atr, R).map(x => ({ ...x, age: null, persistant: false })), gros = L.length ? L.slice().sort((x, y) => y.q - x.q)[0] : null, ab = absorption(f5, atr, R);
  let score = 0;
  if (des.partVendeurs != null) { if (des.partVendeurs >= R.pressionPart) score -= 1; else if (des.partAcheteurs >= R.pressionPart) score += 1; }
  if (f5.partDelta != null && f5.n >= 5) { if (f5.partDelta <= -R.pressionFlux) score -= 1; else if (f5.partDelta >= R.pressionFlux) score += 1; }
  if (gros && gros.persistant) score += gros.cote === 'achat' ? 1 : -1;
  if (ab) score += ab.cote === 'achat' ? 1 : -1;
  const retire = suivi && suivi.nouveauxRetires.length ? suivi.nouveauxRetires[suivi.nouveauxRetires.length - 1] : null;
  const pression = score <= -2 ? 'vendeuse' : score >= 2 ? 'acheteuse' : 'neutre';
  const pourZone = pression === 'neutre' ? 'neutre' : (pression === 'vendeuse') === (zone.cote === 'vente') ? 'retournement' : 'cassure';
  const parts = [];
  if (des.partVendeurs != null) parts.push(des.partVendeurs >= 0.5 ? `${Math.round(des.partVendeurs * 100)} % d'ordres à la vente dans ±${nb(des.largeur, 0)} $` : `${Math.round(des.partAcheteurs * 100)} % d'ordres à l'achat dans ±${nb(des.largeur, 0)} $`);
  if (f5.n >= 1) parts.push(`delta ${f5.delta >= 0 ? '+' : '−'}${nb(Math.abs(f5.delta), 0)} sur 5 min`);
  if (gros) parts.push(`mur de ${nb(gros.q, 0)} lots à ${nb(gros.p, 2)} (${nb(gros.x, 1)} fois la médiane)${gros.age != null ? (gros.persistant ? ` maintenu depuis ${gros.age >= 60e3 ? Math.floor(gros.age / 60e3) + ' min' : Math.round(gros.age / 1000) + ' s'}` : ' apparu depuis moins de 30 s') : ''}`);
  if (retire) parts.push(`mur de ${nb(retire.q, 0)} lots à ${nb(retire.p, 2)} ${retire.raison}`);
  if (ab) parts.push(ab.texte);
  const conclusion = pourZone === 'retournement' ? 'retournement plus plausible' : pourZone === 'cassure' ? 'cassure plus plausible' : 'pas de pression nette';
  const nomZone = `${zone.cote === 'vente' ? 'Résistance' : 'Support'} ${nb(zone.prix, 0)}`;
  const texte = `${nomZone} : ${parts.join(', ') || 'carnet trop mince pour une mesure'} → ${pression === 'neutre' ? 'pas de pression nette' : 'pression ' + pression + ', ' + conclusion}`;
  return { ok: true, mid, atr, score, pression, pourZone, texte, bougie: { couleur: pression === 'vendeuse' ? 'rouge' : pression === 'acheteuse' ? 'vert' : 'gris', corps: Math.min(1, Math.abs(score) / 4) },
    mesures: { partAcheteurs: des.partAcheteurs, partVendeurs: des.partVendeurs, qb: des.qb, qa: des.qa, largeur: des.largeur, mur: gros ? { cote: gros.cote, p: gros.p, q: gros.q, x: gros.x, age: gros.age, persistant: gros.persistant } : null, murRetire: retire, delta1: f1.delta, delta5: f5.delta, volume5: f5.volume, partDelta5: f5.partDelta, absorption: ab ? ab.texte : null } };
}
/* mention d'honnêteté : « lecture en observation, non validée » tant qu'une classe a moins de 30 cas */
export function mentionValidation(compte, R = P) { return compte >= R.casMin ? `${compte} cas enregistrés dans cette classe : lecture mesurée en direct, pas encore une règle` : `lecture en observation, non validée (${compte} cas enregistré${compte > 1 ? 's' : ''}, il en faut ${R.casMin})`; }

/* ── enregistreur forward : issue à 6, 12 et 24 bougies H1 depuis l'arrivée ── */
export const wilson = (k, n, z = 1.96) => { if (!n) return [0, 1]; const p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n); return [c - h, c + h]; };
/* issue depuis l'arrivée : les bougies H1 qui s'ouvrent après l'instant d'arrivée ; +1 retournement (1 ATR loin de la zone), −1 cassure (1 ATR dans l'autre sens), 0 aucune ; les deux dans la même bougie = cassure */
export function issueForward(B, tArrivee, ref, cote, atr, horizon, R = P) {
  let i0 = -1; for (let i = 0; i < B.length; i++) if (B[i].t >= tArrivee) { i0 = i; break; } if (i0 < 0 || B.length - i0 < horizon) return null;
  const dirRet = cote === 'vente' ? -1 : 1, cible = ref + dirRet * R.barriereAtr * atr, casse = ref - dirRet * R.barriereAtr * atr;
  for (let k = i0; k < i0 + horizon; k++) { const b = B[k], rev = dirRet > 0 ? b.h >= cible : b.l <= cible, cas = dirRet > 0 ? b.l <= casse : b.h >= casse; if (cas) return -1; if (rev) return 1; }
  return 0;
}
/* rapport local : la lecture du carnet sépare-t-elle les retournements des cassures ? registre = [{ kind: 'arrivee', id, pourZone, ... }, { kind: 'resultat', id, h, issue }] */
export function rapportForward(registre, R = P) {
  const arr = registre.filter(x => x.kind === 'arrivee'), res = registre.filter(x => x.kind === 'resultat'), L = [];
  const classes = ['retournement', 'cassure', 'neutre'], sortie = { arrivees: arr.length, classes: {}, phrases: [] };
  for (const h of R.horizons) {
    sortie.classes[h] = {};
    for (const cl of classes) { const ids = new Set(arr.filter(a => a.pourZone === cl).map(a => a.id)), S = res.filter(r => r.h === h && ids.has(r.id) && r.issue !== 0), k = S.filter(r => r.issue === 1).length, n = S.length; sortie.classes[h][cl] = { n, k, taux: n ? k / n : null, ic: n ? wilson(k, n) : null }; }
  }
  const x = sortie.classes[12], a = x.retournement, b = x.cassure;
  if (a.n >= R.casMin && b.n >= R.casMin) { const sep = a.ic[0] > b.ic[1] ? 'sépare' : b.ic[0] > a.ic[1] ? 'sépare à l\'envers' : 'ne sépare pas nettement'; sortie.phrases.push(`À 12 bougies, quand la lecture dit « retournement plus plausible » le prix a retourné ${Math.round(a.taux * 100)} % des fois (n = ${a.n}) ; quand elle dit « cassure plus plausible », ${Math.round(b.taux * 100)} % (n = ${b.n}) : la lecture ${sep} les retournements des cassures.`); }
  else sortie.phrases.push(`Pas assez de données : ${a.n} cas « retournement plus plausible » et ${b.n} cas « cassure plus plausible » à 12 bougies (il en faut ${R.casMin} de chaque).`);
  return sortie;
}
