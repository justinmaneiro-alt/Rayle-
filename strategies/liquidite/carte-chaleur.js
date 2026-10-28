/* ═════════════ CARTE DE CHALEUR DE LIQUIDITÉ, MURS ET FAUX MURS (V4, phase 3 ; module pur, testé : galaxie/tests/liquidite-test.mjs) ═════════════
   Entrée : les secondes enregistrées (`Stockage.lireProfondeur` → { entete, enregistrements }), chacune avec la liquidité posée en dollars par tranche de 0,02 % sous (bid) et au-dessus (ask) du milieu.
   Sortie : une matrice prix × temps (la « carte de chaleur » de Bookmap), les MURS (liquidité exceptionnelle qui reste posée), et un score de FIABILITÉ des murs (les murs qui disparaissent à l'approche
   du prix sont des leurres probables). Aucune information du futur : la colonne t n'utilise que la seconde t ; un mur n'est « tenu » que pour le temps déjà écoulé.
   Honnêteté : le carnet est agrégé par niveau (pas d'identité) ; les tranches hors couverture de l'instantané sont « non observées », jamais « vides » (le champ `couverte` les marque). */
const mediane = a => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

/* Carte : { tSec[], mid[], prixMin, pas (prix par ligne), nPrix, valeurs (Float32Array nT × nPrix, ligne = colonne de temps), cote: Uint8Array (1 = bid, 2 = ask), couverte (Uint8Array nT × nPrix : 1 = tranche garantie observée) }.
   `agregationS` : on garde le MAX sur chaque paquet de secondes (un mur de 3 s reste visible). */
export function construireCarte(donnees, { agregationS = 1, nPrix = 300, demiLargeurPct = null } = {}) {
  const recs = donnees.enregistrements || [], e = donnees.entete; if (!recs.length || !e) return null;
  const n = e.nTranches, pasPct = e.pasPct, mids = recs.map(r => (r.meilleurBid + r.meilleurAsk) / 2), mRef = mediane(mids), demi = demiLargeurPct != null ? demiLargeurPct : Math.min(n * pasPct, (nPrix / 2) * pasPct);
  const pas = mRef * pasPct / 100, prixMin = mRef - (nPrix / 2) * pas;
  const cols = []; let courant = null;
  for (const r of recs) { const k = Math.floor(r.tSec / agregationS); if (!courant || courant.k !== k) { courant = { k, recs: [] }; cols.push(courant); } courant.recs.push(r); }
  const nT = cols.length, valeurs = new Float32Array(nT * nPrix), cote = new Uint8Array(nT * nPrix), couverte = new Uint8Array(nT * nPrix), tSec = new Array(nT), mid = new Float64Array(nT);
  cols.forEach((c, i) => {
    tSec[i] = c.recs[0].tSec; let m = 0; for (const r of c.recs) m += (r.meilleurBid + r.meilleurAsk) / 2; mid[i] = m / c.recs.length;
    for (const r of c.recs) {
      const mm = (r.meilleurBid + r.meilleurAsk) / 2, pp = mm * pasPct / 100;
      const couvBas = (r.couvBasPct ?? demi) , couvHaut = (r.couvHautPct ?? demi);
      for (let j = 0; j < n; j++) {
        const pb = mm - (j + 0.5) * pp, pa = mm + (j + 0.5) * pp, ib = Math.round((pb - prixMin) / pas), ia = Math.round((pa - prixMin) / pas);
        if (ib >= 0 && ib < nPrix) { const o = i * nPrix + ib, v = r.bid[j]; if (v > valeurs[o]) { valeurs[o] = v; cote[o] = 1; } if ((j + 1) * pasPct <= couvBas) couverte[o] = 1; }
        if (ia >= 0 && ia < nPrix) { const o = i * nPrix + ia, v = r.ask[j]; if (v > valeurs[o]) { valeurs[o] = v; cote[o] = 2; } if ((j + 1) * pasPct <= couvHaut) couverte[o] = 1; }
      }
    }
  });
  return { tSec, mid, prixMin, pas, nPrix, nT, valeurs, cote, couverte, agregationS, pasPct };
}
export const prixDeLigne = (carte, j) => carte.prixMin + (j + 0.5) * carte.pas;
export const ligneDePrix = (carte, p) => Math.round((p - carte.prixMin) / carte.pas - 0.5);
/* Échelle de couleur : valeur de référence = percentile (défaut 99,5 %) des valeurs non nulles ; l'intensité = min(1, valeur / référence) (racine pour mieux voir les petits niveaux). */
export function echelleIntensite(carte, { percentile = 0.995 } = {}) {
  const v = []; for (let i = 0; i < carte.valeurs.length; i += 7) if (carte.valeurs[i] > 0) v.push(carte.valeurs[i]);
  if (!v.length) return { reference: 1, intensite: () => 0 }; v.sort((a, b) => a - b); const ref = v[Math.min(v.length - 1, Math.floor(percentile * v.length))];
  return { reference: ref, intensite: x => (x > 0 ? Math.min(1, Math.sqrt(x / ref)) : 0) };
}

/* MURS : un niveau est un mur quand sa liquidité dépasse `facteur` × la médiane des niveaux non nuls de la même colonne (la « médiane locale » du carnet de cet instant) ET un plancher en dollars, pendant au
   moins `dureeMinS` (les trous de ≤ `trouMaxS` secondes ne coupent pas le mur). Rend les murs, les plus gros d'abord. `actif` = présent dans la dernière colonne. */
export function detecterMurs(carte, { facteur = 4, plancherUsd = 50000, dureeMinS = 20, trouMaxS = 3, couvertureSeule = true } = {}) {
  if (!carte) return []; const { nT, nPrix, valeurs, couverte, tSec } = carte, med = new Float64Array(nT), murs = [];
  for (let i = 0; i < nT; i++) { const col = []; for (let j = 0; j < nPrix; j++) { const v = valeurs[i * nPrix + j]; if (v > 0) col.push(v); } med[i] = mediane(col); }
  for (let j = 0; j < nPrix; j++) {
    let debut = -1, dernier = -1, maxUsd = 0, somme = 0, nb = 0, ratioMax = 0;
    const fermer = () => {
      if (debut < 0) return; const dur = tSec[dernier] - tSec[debut] + carte.agregationS;
      if (dur >= dureeMinS) { const prix = prixDeLigne(carte, j), midFin = carte.mid[dernier]; murs.push({ prix, cote: prix < midFin ? 'bid' : 'ask', usdMax: maxUsd, usdMoyen: somme / nb, ratioMediane: ratioMax, dureeS: dur, debutSec: tSec[debut], finSec: tSec[dernier], actif: dernier === nT - 1, distancePct: Math.abs(prix - midFin) / midFin * 100 }); }
      debut = -1; maxUsd = 0; somme = 0; nb = 0; ratioMax = 0;
    };
    for (let i = 0; i < nT; i++) {
      const v = valeurs[i * nPrix + j], ok = v >= plancherUsd && med[i] > 0 && v >= facteur * med[i] && (!couvertureSeule || couverte[i * nPrix + j] === 1);
      if (ok) { if (debut < 0) debut = i; else if (tSec[i] - tSec[dernier] > trouMaxS + carte.agregationS) { fermer(); debut = i; } dernier = i; if (v > maxUsd) maxUsd = v; somme += v; nb++; if (v / med[i] > ratioMax) ratioMax = v / med[i]; }
      else if (debut >= 0 && tSec[i] - tSec[dernier] > trouMaxS + carte.agregationS) fermer();
    }
    fermer();
  }
  // fusion des lignes voisines (un mur épais occupe plusieurs lignes de la grille)
  murs.sort((a, b) => a.prix - b.prix); const fus = [];
  for (const m of murs) { const p = fus[fus.length - 1]; if (p && p.cote === m.cote && Math.abs(m.prix - p.prix) <= 3 * carte.pas && m.debutSec <= p.finSec) { p.usdMax += m.usdMax; p.usdMoyen += m.usdMoyen; p.dureeS = Math.max(p.dureeS, m.dureeS); p.finSec = Math.max(p.finSec, m.finSec); p.debutSec = Math.min(p.debutSec, m.debutSec); p.ratioMediane = Math.max(p.ratioMediane, m.ratioMediane); p.actif = p.actif || m.actif; p.prix = (p.prix + m.prix) / 2; p.distancePct = Math.min(p.distancePct, m.distancePct); } else fus.push({ ...m }); }
  return fus.sort((a, b) => b.usdMax - a.usdMax);
}

/* FIABILITÉ d'un mur (0 à 1) à partir des événements « gros ordres » enregistrés (apparition / retrait / exécution) autour de son prix, et de la distance du prix du marché au moment de chaque retrait :
   – un RETRAIT à l'approche du prix (le marché est à moins de `approchePct` du niveau) est la signature d'un leurre ; – une EXÉCUTION (le mur a été attaqué et a tenu / a été mangé) est un vrai ordre ;
   – la durée de vie compte (un mur posé depuis longtemps est plus probablement réel). Heuristique, étiquetée comme telle : jamais une certitude. `midA(tMs)` rend le milieu à un instant (facultatif). */
export function fiabiliteMur(mur, evenements, { tolPct = 0.05, approchePct = 0.15, collePct = 0.02, midA = null } = {}) {
  const proches = (evenements || []).filter(e => e.cote === mur.cote && Math.abs(e.prix - mur.prix) / mur.prix * 100 <= tolPct);
  let retraitsApproche = 0, retraitsLoin = 0, executions = 0;
  for (const e of proches) {
    if (e.type === 'execution') executions++;
    else if (e.type === 'retrait') { if (retraitALApproche(e, midA, approchePct, collePct)) retraitsApproche++; else retraitsLoin++; }
  }
  const duree = Math.min(1, mur.dureeS / 900), voteReel = executions + 0.5 * duree + 0.25 * retraitsLoin, voteLeurre = 1.5 * retraitsApproche + (mur.dureeS < 30 ? 0.5 : 0);
  const score = (voteReel + 1) / (voteReel + voteLeurre + 2);                                      // a priori neutre (0,5) : la durée seule ne rend jamais un mur « fiable »
  const niveau = score >= 0.7 ? 'fiable' : score >= 0.4 ? 'incertain' : 'leurre probable';
  return { score: Math.max(0, Math.min(1, score)), niveau, executions, retraitsApproche, retraitsLoin, dureeS: mur.dureeS, note: 'Heuristique : une grosse ligne du carnet agrégé peut être un leurre.' };
}
/* Un retrait est « à l'approche » seulement si le prix S'APPROCHAIT du niveau (plus près qu'il y a 10 s), sans être collé au meilleur prix (là, les teneurs de marché annulent sans cesse : ce n'est pas un leurre). */
export function retraitALApproche(e, midA, approchePct = 0.15, collePct = 0.02, depuisMs = 10000) {
  if (!midA) return false; const m = midA(e.t), avant = midA(e.t - depuisMs); if (m == null || avant == null) return false;
  const d = Math.abs(m - e.prix) / e.prix * 100, dAvant = Math.abs(avant - e.prix) / e.prix * 100;
  return d <= approchePct && d >= collePct && dAvant > d;
}
/* Taux de base du marché : part des gros ordres retirés à l'approche du prix (sert à situer un mur par rapport à la normale). */
export function tauxLeurres(evenements, { approchePct = 0.15, collePct = 0.02, midA = null } = {}) {
  let r = 0, e = 0; for (const x of evenements || []) { if (x.type === 'execution') e++; else if (x.type === 'retrait' && retraitALApproche(x, midA, approchePct, collePct)) r++; }
  return { retraitsApproche: r, executions: e, taux: r + e ? r / (r + e) : null };
}
