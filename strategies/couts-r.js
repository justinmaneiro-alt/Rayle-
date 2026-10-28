import { coutEnR } from '../planetes/mars/pc/agent-m6/couts.js';

/* ═════════════ LES FRAIS EN « R » (V6, phase 1 ; module pur, testé : galaxie/tests/couts-r-test.mjs) ═════════════
   Un trade coûte des frais, un spread et un glissement. Exprimé en R (le risque pris = la distance au stop), le coût vaut
       (2 × frais + spread + 2 × glissement) ÷ distance au stop (en %)
   donc plus le stop est PROCHE du prix, plus les frais pèsent : un stop à 0,3 % avec 0,15 % de coûts perd 0,5 R avant même d'avoir une chance de gagner.
   Ce module sert à : mesurer le coût moyen en R de tout ce qui a été testé, dire où l'avantage brut existe mais est détruit, calculer le taux de réussite minimal pour être rentable
   à un rapport gain / risque donné, lire les réglages de coûts de Justin (maker / taker / spread par heure / glissement), et estimer le glissement et le spread d'après le carnet enregistré.
   Aucun critère de validation n'est ici : ce sont des mesures, jamais un seuil de validation. */
const fr = (x, d = 2) => (x == null || !Number.isFinite(x) ? 'inconnu' : x.toFixed(d).replace('.', ','));
export const moyenne = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

/* Taux de réussite minimal pour une espérance nette nulle quand les gains valent `rr` R et les pertes 1 R, avec un coût de `coutR` R par trade (déduit des deux issues) :
       p × rr − (1 − p) − coutR = 0   →   p = (1 + coutR) / (1 + rr)          */
export const tauxEquilibre = (rr, coutR = 0) => (rr > -1 ? (1 + (coutR || 0)) / (1 + rr) : null);
/* Rapport gain / risque minimal pour une espérance nette nulle avec un taux de réussite p : rr = (1 + coutR) / p − 1. */
export const rrEquilibre = (p, coutR = 0) => (p > 0 ? (1 + (coutR || 0)) / p - 1 : null);
/* Espérance nette (en R par trade) d'un profil taux de réussite p / rapport gain-risque rr / coût en R. */
export const esperanceProfil = (p, rr, coutR = 0) => p * rr - (1 - p) - (coutR || 0);

/* La phrase que l'agent dit : « Frais moyens : X R par trade. Taux de réussite minimal pour être rentable avec RR=2 : Y %. » */
export function phraseFrais({ coutMoyenR, rr = 2 } = {}) {
  if (coutMoyenR == null || !Number.isFinite(coutMoyenR)) return 'Frais moyens : pas encore mesurés (aucun trade simulé).';
  const p = tauxEquilibre(rr, coutMoyenR);
  return 'Frais moyens : ' + fr(coutMoyenR) + ' R par trade. Taux de réussite minimal pour être rentable avec RR=' + rr + ' : ' + Math.round(p * 100) + ' %.';
}

/* Coût estimé en R d'une entrée, avec le détail frais / spread / glissement, au marché (taker) ou à cours limité (maker). cfg = { fraisPct (taker), makerPct, spreadPct, glissementPct }.
   Entrée au marché : frais taker + demi-spread + glissement ; sortie au marché (stop) : frais taker + demi-spread + glissement ; sortie à cours limité (cible) : frais maker, ni spread ni glissement. */
export function coutEstimeR(cfg, distancePct, { entree = 'marche', sortie = 'marche' } = {}) {
  if (!(distancePct > 0)) return null;
  const taker = cfg.fraisPct, maker = cfg.makerPct == null ? cfg.fraisPct : cfg.makerPct;
  const e = entree === 'limite' ? maker : taker + cfg.spreadPct / 2 + cfg.glissementPct, s = sortie === 'limite' ? maker : taker + cfg.spreadPct / 2 + cfg.glissementPct;
  return (e + s) / distancePct;
}
/* Distance minimale au stop (en % du prix) pour que le coût estimé reste sous `plafondR`. */
export function distanceMinimale(cfg, plafondR, opts = {}) {
  const unite = coutEstimeR(cfg, 1, opts);   // coût pour une distance de 1 %
  return plafondR > 0 && unite != null ? unite / plafondR : null;
}

/* Bandes de distance au stop (en %) pour les tableaux. */
export const BANDES_STOP = Object.freeze([[0, 0.5], [0.5, 1], [1, 2], [2, 4], [4, 100]]);
export const libelleBande = ([a, b]) => (a === 0 ? '< ' + b + ' %' : b >= 100 ? '≥ ' + a + ' %' : a + ' à ' + b + ' %').replace(/\./g, ',');
/* Découpe des trades { R, Rbrut, coutsR, distancePct } par bande : n, espérance avant frais, coût moyen en R, espérance après frais, taux de réussite, gain moyen / perte moyenne. */
export function parBandeDeStop(trades, bandes = BANDES_STOP) {
  return bandes.map(b => {
    const t = trades.filter(x => x.distancePct >= b[0] && x.distancePct < b[1]), n = t.length;
    if (!n) return { bande: b, libelle: libelleBande(b), n: 0, brute: null, couts: null, nette: null, tauxReussite: null };
    const brute = moyenne(t.map(x => x.Rbrut)), couts = moyenne(t.map(x => x.coutsR)), nette = moyenne(t.map(x => x.R)), gagnants = t.filter(x => x.R > 0);
    return { bande: b, libelle: libelleBande(b), n, brute, couts, nette, tauxReussite: gagnants.length / n, distanceMoyennePct: moyenne(t.map(x => x.distancePct)) };
  });
}
/* Résumé d'un ensemble de trades : espérance brute / nette, coût moyen en R, taux de réussite, RR moyen réalisé, taux d'équilibre au RR réalisé. */
export function resumeCouts(trades) {
  const n = trades.length; if (!n) return { n: 0, brute: null, couts: null, nette: null, tauxReussite: null, rrMoyen: null, tauxEquilibre: null };
  const g = trades.filter(x => x.R > 0), p = trades.filter(x => x.R <= 0), gm = g.length ? moyenne(g.map(x => x.R)) : 0, pm = p.length ? -moyenne(p.map(x => x.R)) : 1;
  const rr = pm > 0 ? gm / pm : null, couts = moyenne(trades.map(x => x.coutsR));
  return { n, brute: moyenne(trades.map(x => x.Rbrut)), couts, nette: moyenne(trades.map(x => x.R)), tauxReussite: g.length / n, rrMoyen: rr, tauxEquilibre: rr != null ? tauxEquilibre(rr, 0) : null, distanceMoyennePct: moyenne(trades.map(x => x.distancePct)) };
}

/* Où l'avantage brut existe mais est détruit par les frais ? `lignes` = [{ famille, paire, unite, bande, n, brute, couts, nette }] ; renvoie les lignes à avantage brut > 0 et net ≤ 0, triées par avantage détruit. */
export function avantageDetruit(lignes, { nMin = 30 } = {}) {
  return lignes.filter(l => l.n >= nMin && l.brute > 0 && l.nette <= 0).map(l => ({ ...l, detruit: l.brute - Math.max(0, l.nette) })).sort((a, b) => b.detruit - a.detruit);
}
/* Part des lignes pour lesquelles les frais mangent plus de la moitié de l'espérance brute. */
export const partMangee = lignes => { const l = lignes.filter(x => x.brute > 0); return l.length ? l.filter(x => x.couts > x.brute / 2).length / l.length : null; };

// ── réglages de coûts de Justin (fichier couts.json) ──
export const COUTS_EXEMPLE = Object.freeze({
  _aide: 'Remplis ces valeurs avec TES frais réels (compte prop Kraken). Les pourcentages sont par côté (entrée ou sortie), en % du montant. Efface les lignes que tu ne connais pas : les valeurs prudentes s’appliquent. Après modification, relance le service Kepler : toute la recherche est refaite avec ces coûts (le compteur de variantes testées ne baisse jamais).',
  BTC: { takerPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02 },
  SOL: { takerPct: 0.06, makerPct: 0.024, spreadPct: 0.04, glissementPct: 0.04 },
  DOGE: { takerPct: 0.06, makerPct: 0.024, spreadPct: 0.06, glissementPct: 0.06 },
  filePct: 0.02,
  spreadParHeureUTC: null
});
const CHAMPS = ['takerPct', 'makerPct', 'spreadPct', 'glissementPct'];
/* Valide un fichier de coûts : refuse ce qui n'a pas de sens (négatif, énorme, texte). Renvoie { ok, erreurs, couts: { BTC: {…}, … }, filePct, spreadParHeureUTC } ; `base` = valeurs prudentes par paire. */
export function validerReglageCouts(obj, base) {
  const erreurs = [], couts = {};
  if (!obj || typeof obj !== 'object') return { ok: false, erreurs: ['fichier de coûts illisible'], couts: base };
  for (const p of Object.keys(base)) {
    const b = base[p], c = { fraisPct: b.fraisPct, makerPct: b.makerPct == null ? +(b.fraisPct * 0.4).toFixed(4) : b.makerPct, spreadPct: b.spreadPct, glissementPct: b.glissementPct }, u = obj[p];
    if (u && typeof u === 'object') for (const k of CHAMPS) if (u[k] != null) {
      const v = Number(u[k]);
      if (!Number.isFinite(v) || v < 0 || v > 2) { erreurs.push(p + '.' + k + ' : valeur impossible (' + u[k] + ') — attendu entre 0 et 2 (en %)'); continue; }
      if (k === 'takerPct') c.fraisPct = v; else c[k] = v;
    }
    if (c.makerPct > c.fraisPct) erreurs.push(p + ' : les frais maker (' + c.makerPct + ' %) dépassent les frais taker (' + c.fraisPct + ' %) — vérifie : en général le maker coûte MOINS');
    couts[p] = c;
  }
  let filePct = 0.02; if (obj.filePct != null) { const v = Number(obj.filePct); if (Number.isFinite(v) && v >= 0 && v <= 1) filePct = v; else erreurs.push('filePct : valeur impossible'); }
  let sph = null; if (Array.isArray(obj.spreadParHeureUTC)) { if (obj.spreadParHeureUTC.length === 24 && obj.spreadParHeureUTC.every(x => Number.isFinite(+x) && +x >= 0 && +x <= 20)) sph = obj.spreadParHeureUTC.map(Number); else erreurs.push('spreadParHeureUTC : il faut 24 nombres (multiplicateurs entre 0 et 20)'); }
  return { ok: erreurs.length === 0, erreurs, couts, filePct, spreadParHeureUTC: sph };
}

// ── estimation d'après le carnet enregistré ──
/* Glissement (en %) pour un ordre au marché de `notionnel` (en dollars) contre un côté du carnet : `niveaux` = [[prix, quantité en unités], …] du plus proche au plus lointain,
   `milieu` = prix milieu. Renvoie { glissementPct, prixMoyen, rempli (part du notionnel absorbée), epuise (le carnet enregistré ne suffit pas) }. */
export function estimerGlissement(niveaux, notionnel, milieu) {
  if (!Array.isArray(niveaux) || !niveaux.length || !(notionnel > 0) || !(milieu > 0)) return null;
  let reste = notionnel, cout = 0, qte = 0;
  for (const [prix, q] of niveaux) { if (!(prix > 0) || !(q > 0)) continue; const dispo = prix * q, pris = Math.min(reste, dispo); cout += pris; qte += pris / prix; reste -= pris; if (reste <= 1e-9) break; }
  if (qte <= 0) return null;
  const prixMoyen = cout / qte, glissementPct = Math.abs(prixMoyen - milieu) / milieu * 100;
  return { glissementPct, prixMoyen, rempli: (notionnel - reste) / notionnel, epuise: reste > 1e-6 };
}
/* Spread moyen (en %) par heure UTC d'après des instantanés [{ t, meilleurAchat, meilleureVente }] ; renvoie { parHeure: [24 valeurs ou null], moyenne, n }, et `multiplicateurs` (valeur de l'heure ÷ moyenne). */
export function spreadParHeure(instantanes) {
  const somme = new Array(24).fill(0), n = new Array(24).fill(0);
  for (const s of instantanes || []) {
    if (!(s.meilleurAchat > 0) || !(s.meilleureVente > 0) || s.meilleureVente < s.meilleurAchat) continue;
    const m = (s.meilleureVente + s.meilleurAchat) / 2, h = new Date(s.t).getUTCHours(); somme[h] += (s.meilleureVente - s.meilleurAchat) / m * 100; n[h]++;
  }
  const parHeure = somme.map((x, h) => (n[h] ? x / n[h] : null)), vus = parHeure.filter(x => x != null), moyenneGlobale = vus.length ? moyenne(vus) : null;
  return { parHeure, moyenne: moyenneGlobale, n: n.reduce((a, b) => a + b, 0), multiplicateurs: parHeure.map(x => (x != null && moyenneGlobale > 0 ? x / moyenneGlobale : null)) };
}
/* Convertit les tranches du carnet enregistré (dollars posés par tranche de `pasPct` % autour du meilleur prix, de la plus proche à la plus lointaine) en niveaux [prix, quantité] pour estimerGlissement.
   `cote` = 'ask' (on achète : on mange les vendeurs au-dessus) ou 'bid' (on vend : on mange les acheteurs en dessous). */
export function niveauxDepuisTranches(tranches, meilleur, pasPct, cote = 'ask') {
  const out = []; if (!(meilleur > 0) || !(pasPct > 0)) return out;
  for (let i = 0; i < tranches.length; i++) { const usd = tranches[i]; if (!(usd > 0)) continue; const prix = meilleur * (1 + (cote === 'ask' ? 1 : -1) * (i + 0.5) * pasPct / 100); out.push([prix, usd / prix]); }
  return out;
}
export { coutEnR };
