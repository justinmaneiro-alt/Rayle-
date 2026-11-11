/* ═════════════ FEUILLE DE DÉCISION — règle figée « feuille-decision-v1 » (SHA-256 dans feuille-decision-v1.sceau.json, posé AVANT l'affichage) ═════════════
   Document de référence : STRATEGIE-RAYLE.md §6. Fonctions pures. Cinq conditions en direct, vertes ou grises ; « k / 5 conditions réunies » ; au milieu : « Pas de contexte ».
   INFORMATION SEULEMENT : aucun ordre, aucune décision. Le journal enregistre l'état des 5 conditions à la pose d'une position ; le rapport local dit, avec assez de trades, lesquelles comptent. */
export const VERSION = 'feuille-decision-v1', FIGEES_LE = '2026-11-11';
export const P = Object.freeze({ evenementBougies: 6, caractereBougies: 24, arriveeAtr: 0.25, stopMinAtr: 1, margeStopAtr: 0.25, placeR: 2, tradesMin: 30 });
export const CONDITIONS = Object.freeze([
  { id: 'evenement', libelle: 'Événement sur la moyenne mobile' },
  { id: 'boite', libelle: 'Prix dans une boîte forte' },
  { id: 'carnet', libelle: 'Pression du carnet dans le sens de la boîte' },
  { id: 'tendance', libelle: 'Tendance H1 / H4 alignée ou changement de caractère confirmé' },
  { id: 'place', libelle: 'Place jusqu\'à la zone suivante ≥ 2 R (stop ≥ 1 ATR)' }
]);
export const TEXTE_REGLES = 'Feuille de décision v1 : (1) événement sur la moyenne mobile dans les 6 dernières bougies, (2) prix dans une boîte forte (probabilité mesurée suffisante), (3) pression du carnet dans le sens de la boîte, (4) tendance H1 et H4 alignées dans le sens du retournement, ou changement de caractère confirmé dans les 24 dernières bougies, (5) place jusqu\'à la zone suivante ≥ 2 R pour un stop d\'au moins 1 ATR. Information seulement.';
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));
const hp = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const NOM_EVT = { cassure: 'cassure à confirmer', confirmee: 'cassure confirmée', fausse: 'fausse cassure, réintégration', rebond: 'rebond sur la moyenne mobile' };

/* zone concernée : la zone valide la plus proche dont le voisinage (± 0,25 ATR) contient le prix */
export function zoneConcernee(zones, prix, atr, R = P) {
  let m = null, dist = Infinity; for (const z of zones || []) { if (z.invalide) continue; const d = prix < z.bas ? z.bas - prix : prix > z.haut ? prix - z.haut : 0; if (d <= R.arriveeAtr * atr && d < dist) { dist = d; m = z; } } return m;
}
/* Évalue la feuille. entrées : { B, evenements (de ma-evenements-v1), zones (valides ou non), qualifiees (ids des zones sélectionnées avec probabilité), prix, atr, h1, h4 (résultats de structure-marche-v1), lecture (carnet-lecture-v1.lire ou null) } */
export function evaluer({ B = [], evenements = [], zones = [], qualifiees = [], prix, atr, h1 = null, h4 = null, lecture = null } = {}, R = P) {
  const n = B.length, vide = CONDITIONS.map(c => ({ ...c, ok: false, detail: 'pas de boîte à proximité' }));
  if (!n || !(atr > 0) || prix == null) return { contexte: false, n: 0, total: 5, texte: 'Pas de contexte', conditions: vide, zone: null, booleens: [false, false, false, false, false] };
  const z = zoneConcernee(zones, prix, atr, R);
  if (!z) return { contexte: false, n: 0, total: 5, texte: 'Pas de contexte', conditions: vide, zone: null, booleens: [false, false, false, false, false] };
  const dir = z.cote === 'vente' ? -1 : 1, C = [];
  // 1) événement sur la moyenne mobile dans les 6 dernières bougies
  const e = evenements.filter(x => x.type !== 'expiree' && n - 1 - x.i <= R.evenementBougies).slice(-1)[0];
  C.push({ ...CONDITIONS[0], ok: !!e, detail: e ? `${NOM_EVT[e.type]} ${e.dir > 0 ? 'haussière' : 'baissière'} le ${hp(B[e.i].t)}` : 'aucun événement sur la moyenne mobile dans les 6 dernières bougies' });
  // 2) prix dans une boîte forte
  const q = qualifiees.includes(z.id);
  C.push({ ...CONDITIONS[1], ok: q, detail: q ? `${z.cote === 'vente' ? 'résistance' : 'support'} ${nb(z.prix, 0)} : probabilité mesurée suffisante (≥ 50 %, n ≥ 15)` : `${z.cote === 'vente' ? 'résistance' : 'support'} ${nb(z.prix, 0)} : probabilité mesurée insuffisante, la zone n'est pas « forte »` });
  // 3) pression du carnet dans le sens de la boîte (retournement plus plausible)
  const c3 = !!lecture && lecture.ok !== false && lecture.pourZone === 'retournement';
  C.push({ ...CONDITIONS[2], ok: c3, detail: !lecture ? 'carnet indisponible' : c3 ? `pression ${lecture.pression} : ${lecture.pression === 'vendeuse' ? 'vendeurs' : 'acheteurs'} dans le sens de la boîte` : lecture.pourZone === 'cassure' ? `pression ${lecture.pression} contre la boîte` : 'pas de pression nette' });
  // 4) tendance H1 / H4 dans le sens du retournement, ou changement de caractère confirmé dans les 24 bougies
  const t1 = h1 && h1.etat ? h1.etat.tendance : 0, t4 = h4 && h4.etat ? h4.etat.tendance : 0, nH = h1 && h1.tendance ? h1.tendance.length : n;
  const choc = h1 ? h1.events.filter(x => (x.type === 'choch' || x.type === 'confirme') && x.dir === dir && nH - 1 - x.i <= R.caractereBougies).slice(-1)[0] : null;
  const aligne = t1 === dir && t4 === dir;
  C.push({ ...CONDITIONS[3], ok: aligne || !!choc, detail: aligne ? `tendance H1 et H4 ${dir < 0 ? 'baissières' : 'haussières'}` : choc ? `changement de caractère ${dir < 0 ? 'baissier' : 'haussier'} (${choc.type === 'confirme' ? 'retournement confirmé' : 'à confirmer'}) le ${hp(choc.t)}` : `H1 ${t1 > 0 ? 'haussière' : t1 < 0 ? 'baissière' : 'en range'}, H4 ${t4 > 0 ? 'haussière' : t4 < 0 ? 'baissière' : 'en range'} : pas alignées dans le sens ${dir < 0 ? 'baissier' : 'haussier'}` });
  // 5) place jusqu'à la zone suivante ≥ 2 R pour un stop d'au moins 1 ATR
  const dFar = dir < 0 ? Math.max(0, z.haut - prix) : Math.max(0, prix - z.bas), stop = Math.max(R.stopMinAtr * atr, dFar + R.margeStopAtr * atr);
  const suivantes = zones.filter(x => !x.invalide && x.id !== z.id && (dir < 0 ? x.haut < prix - 0.0001 : x.bas > prix + 0.0001)).map(x => ({ x, d: dir < 0 ? prix - x.haut : x.bas - prix })).sort((a, b) => a.d - b.d), nx = suivantes[0];
  if (!nx) C.push({ ...CONDITIONS[4], ok: false, detail: 'aucune zone suivante connue dans ce sens' });
  else C.push({ ...CONDITIONS[4], ok: nx.d >= R.placeR * stop, detail: `${nb(nx.d / stop, 1)} R jusqu'à ${nx.x.cote === 'vente' ? 'la résistance' : 'le support'} ${nb(nx.x.prix, 0)} pour un stop de ${nb(stop, 1)} $ (${nb(stop / atr, 1)} ATR)` });
  const k = C.filter(c => c.ok).length;
  return { contexte: true, n: k, total: 5, texte: `${k} / 5 conditions réunies`, conditions: C, zone: { id: z.id, cote: z.cote, prix: z.prix, bas: z.bas, haut: z.haut }, booleens: C.map(c => c.ok), sens: dir };
}
/* état à enregistrer dans le journal à la pose d'une position */
export const etatPourJournal = f => (f ? { version: VERSION, contexte: f.contexte, n: f.n, conditions: f.booleens.slice(), zone: f.zone ? { cote: f.zone.cote, prix: f.zone.prix } : null } : null);

/* rapport local : parmi les trades du journal clos et portant une feuille, laquelle des 5 conditions « compte » ? R net moyen quand la condition est réunie / non réunie, écart en erreurs-types ; < 30 trades = message honnête */
export function rapportJournal(trades, rNet, R = P) {
  const T = (trades || []).filter(t => t && t.feuille && Array.isArray(t.feuille.conditions) && rNet(t) != null && Number.isFinite(rNet(t)));
  const sortie = { n: T.length, assez: T.length >= R.tradesMin, conditions: [], phrase: '' };
  const moy = a => a.reduce((s, x) => s + x, 0) / a.length, sd = a => { if (a.length < 2) return 0; const m = moy(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  CONDITIONS.forEach((c, k) => {
    const oui = T.filter(t => t.feuille.conditions[k]).map(rNet), non = T.filter(t => !t.feuille.conditions[k]).map(rNet);
    const o = { id: c.id, libelle: c.libelle, nOui: oui.length, nNon: non.length, rOui: oui.length ? moy(oui) : null, rNon: non.length ? moy(non) : null, verdict: 'pas assez de données' };
    if (oui.length >= 10 && non.length >= 10 && sortie.assez) { const se = Math.sqrt(sd(oui) ** 2 / oui.length + sd(non) ** 2 / non.length), z = se > 0 ? (o.rOui - o.rNon) / se : 0; o.z = z; o.verdict = Math.abs(z) >= 2 ? (z > 0 ? 'semble compter (meilleur quand elle est réunie)' : 'semble jouer à l\'envers') : 'ne se distingue pas'; }
    sortie.conditions.push(o);
  });
  sortie.phrase = sortie.assez ? `Sur ${T.length} trades clos portant une feuille de décision : ${sortie.conditions.map(o => `${o.libelle} → ${o.verdict}`).join(' ; ')}.` : `Pas assez de trades pour dire lesquelles des 5 conditions comptent : ${T.length} trade${T.length > 1 ? 's' : ''} clos avec une feuille, il en faut ${R.tradesMin}.`;
  return sortie;
}
