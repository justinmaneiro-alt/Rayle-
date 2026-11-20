/* ═════════════ COUVERTURE : taux de protection MESURÉ, coût, trois niveaux, phrase claire, couverture d'événement (module PUR, testé) ═════════════
   Convention : sens = +1 (position achetée), −1 (vendue). Rendements journaliers logarithmiques de X (actif couvert) et Y (actif de couverture), sur des dates communes.
   Couverture de fraction f du bêta : gain de la couverture sur h jours = −sens · β · f · rY(h) ; gain de la position = sens · rX(h) (en % du notionnel de la position).
   Période « contre moi » : la position perd plus de 1 % sur h jours (h = 1 jour, puis 1 semaine = 5 jours). La couverture a « gagné » si son gain est > 0 ;
   part compensée = somme des gains de la couverture / somme des pertes de la position, sur ces périodes. Période « pour moi » : la position gagne plus de 1 % ;
   coût = part du gain reprise par la couverture (somme de ses pertes / somme des gains de la position). Fenêtres glissantes qui se chevauchent (comme un trader qui regarde chaque jour la semaine écoulée).
   Aucune donnée inventée : en dessous de quelques cas, le taux n'est pas déclaré mesurable. */

import { correlation } from '../commun/analyse.js';
export const SEUIL = 0.01;                 // 1 % de mouvement « notable »
export const H_JOUR = 1, H_SEMAINE = 5;
export const FENETRES_STAB = Object.freeze([30, 90, 250]);
export const SEUIL_FIABLE = 0.70;          // taux hebdomadaire exigé sur 30, 90 et 250 jours
export const MIN_CAS = Object.freeze({ 30: 3, 90: 8, 250: 15 });   // cas « contre moi » minimum pour dire que le taux est mesurable
export const NIVEAUX = Object.freeze([
  { id: 'legere', nom: 'Légère', fraction: 0.25, court: '25 % du bêta' },
  { id: 'moitie', nom: 'Moitié', fraction: 0.5, court: '50 % du bêta' },
  { id: 'complete', nom: 'Complète', fraction: 1, court: 'taille optimale (bêta)' }
]);
const sommeH = (r, h) => { const out = []; let s = 0; for (let i = 0; i < r.length; i++) { s += r[i]; if (i >= h) s -= r[i - h]; if (i >= h - 1) out.push(s); } return out; };

/* mesure sur les `jours` derniers jours (ra, rb alignés) pour un horizon h et une fraction f du bêta */
export function mesurerProtection(ra, rb, sens, beta, { h = H_SEMAINE, jours = 250, fraction = 1, seuil = SEUIL } = {}) {
  const n = Math.min(jours, ra.length), a = sommeH(ra.slice(-n), h), b = sommeH(rb.slice(-n), h);
  let nC = 0, gagne = 0, pertes = 0, gainsCouv = 0, nF = 0, coutFois = 0, gainsPos = 0, pertesCouv = 0;
  for (let i = 0; i < a.length; i++) {
    const pos = sens * a[i], couv = -sens * beta * fraction * b[i];
    if (pos < -seuil) { nC++; pertes += -pos; gainsCouv += couv; if (couv > 0) gagne++; }
    else if (pos > seuil) { nF++; gainsPos += pos; pertesCouv += -couv; if (couv < 0) coutFois++; }
  }
  return {
    h, jours: n, cas: nC, taux: nC ? gagne / nC : null, compensation: pertes > 0 ? gainsCouv / pertes : null,
    casFavorables: nF, cout: gainsPos > 0 ? pertesCouv / gainsPos : null, frequenceCout: nF ? coutFois / nF : null
  };
}
/* taux de protection sur 1 jour et 1 semaine, et stabilité sur 30 / 90 / 250 jours (hebdomadaire) */
export function protectionComplete(ra, rb, sens, beta, fraction = 1) {
  const jour = mesurerProtection(ra, rb, sens, beta, { h: H_JOUR, jours: 250, fraction }), semaine = mesurerProtection(ra, rb, sens, beta, { h: H_SEMAINE, jours: 250, fraction });
  const parFenetre = FENETRES_STAB.map(j => ({ jours: j, ...mesurerProtection(ra, rb, sens, beta, { h: H_SEMAINE, jours: j, fraction }) }));
  const n = Math.min(250, ra.length, rb.length), corr250 = n >= 30 ? correlation(ra.slice(-n), rb.slice(-n)) : null;
  return { jour, semaine, parFenetre, corr250, verdict: verdictProtection(parFenetre, corr250) };
}
/* « fiable » seulement si le taux hebdomadaire est ≥ 70 % sur 30, 90 ET 250 jours (chacun avec assez de cas) ; « partielle » si le taux sur 250 jours est ≥ 55 % ; sinon « à éviter » */
export const SEUIL_CORR_FIABLE = 0.5;   // v4 : « fiable » exige aussi |corrélation sur 250 jours| ≥ 0,5 (un taux élevé avec une corrélation faible est de la chance)
export function verdictProtection(parFenetre, corr250 = null) {
  const F = Object.fromEntries(parFenetre.map(x => [x.jours, x])), mesurable = j => F[j] && F[j].taux != null && F[j].cas >= MIN_CAS[j];
  if (!mesurable(250)) return { niveau: 'a-eviter', texte: 'à éviter : pas assez de périodes défavorables pour mesurer la protection' };
  const tous = FENETRES_STAB.every(j => mesurable(j) && F[j].taux >= SEUIL_FIABLE);
  const corrOk = corr250 == null || Math.abs(corr250) >= SEUIL_CORR_FIABLE;
  if (tous && !corrOk) return { niveau: 'partielle', texte: `partielle : le taux de protection est bon, mais la corrélation sur 250 jours n’est que de ${String(Math.abs(corr250).toFixed(2)).replace('.', ',')} (< ${String(SEUIL_CORR_FIABLE).replace('.', ',')}) : lien trop faible pour parler de couverture fiable` };
  if (tous) return { niveau: 'fiable', texte: `fiable : la couverture a gagné au moins ${Math.round(SEUIL_FIABLE * 100)} % des semaines défavorables sur 30, 90 et 250 jours` };
  if (F[250].taux >= 0.55) {
    const faible = FENETRES_STAB.filter(j => !mesurable(j) || F[j].taux < SEUIL_FIABLE).map(j => j + ' j').join(', ');
    return { niveau: 'partielle', texte: `partielle : ${Math.round(F[250].taux * 100)} % de réussite sur 250 jours, mais sous ${Math.round(SEUIL_FIABLE * 100)} % ou non mesurable sur ${faible}` };
  }
  return { niveau: 'a-eviter', texte: `à éviter : la couverture n'a gagné que ${Math.round(F[250].taux * 100)} % des semaines défavorables sur 250 jours` };
}
export const LIBELLE_VERDICT = Object.freeze({ fiable: 'Fiable', partielle: 'Partielle', 'a-eviter': 'À éviter' });

/* ───── trois niveaux : volatilité et drawdown réduits, gain abandonné (backtest du module calcul.js, passé en paramètre pour éviter l'import circulaire) ───── */
export function niveauxCouverture(backtestFn, X, Y, sens, beta, ra, rb, { notionnel = null, spreadPct = 0, swapAnPct = 0 } = {}) {
  return NIVEAUX.map(nv => {
    const bt = backtestFn(X, Y, sens, { spreadPct, swapAnPct, fraction: nv.fraction }), p = mesurerProtection(ra, rb, sens, beta, { h: H_SEMAINE, jours: 250, fraction: nv.fraction });
    return {
      ...nv, tailleRelative: Math.abs(beta) * nv.fraction, tailleNotionnel: notionnel ? Math.abs(beta) * nv.fraction * notionnel : null,
      reductionVol: bt ? bt.reductionVol : null, reductionDD: bt ? bt.reductionDD : null,
      gainAbandonne: bt ? bt.finSeule - bt.finCouverte : null,          // en % de la position (le backtest compte en % du notionnel), sur la période du backtest
      gainAbandonneEur: bt && notionnel ? (bt.finSeule - bt.finCouverte) / 100 * notionnel : null,   // v4 : même chose en €, si la taille de position est connue
      finSeule: bt ? bt.finSeule : null, finCouverte: bt ? bt.finCouverte : null, jours: bt ? bt.dates.length : 0,
      compensation: p.compensation, cout: p.cout
    };
  });
}

/* ───── phrase claire ───── */
const f0 = v => (Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR').replace(/[  ]/g, ' ') : '?');
const fc = v => (v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ','));
const pc = v => (v == null || !Number.isFinite(v) ? '—' : f0(v * 100) + ' %');
/* noms avec article (`art`) et complément en « de » (`de`) pour les phrases */
export const articles = a => ({ art: a && a.art ? a.art : (a ? a.nom : ''), de: a && a.de ? a.de : (a ? 'de ' + a.nom : '') });
/* actifCouvert, candidat : entrées de UNIVERS_COUV ; x : résultat de classerCouvertures ; niveau : un élément de NIVEAUX ; notionnel facultatif en € */
export function phraseClaire(actifCouvert, sens, x, niveau = NIVEAUX[2], notionnel = null) {
  if (!x) return null;
  const A = articles(actifCouvert), Y = articles({ nom: x.nom, art: x.art, de: x.de }), achat = sens > 0, dirY = x.sensCouverture, frac = niveau.fraction;
  const verbeY = dirY > 0 ? 'ACHÈTE' : 'VENDS', mouvement = achat ? 'baisse' : 'monte', objetCouv = (dirY > 0 ? 'ton achat ' : 'ta vente ') + Y.de;
  const taille = Math.abs(x.beta) * frac, tailleTxt = `${f0(taille * 100)} % de ta taille` + (notionnel ? ` (≈ ${f0(taille * notionnel)} €)` : '');
  const lien = x.c250 != null && x.c250 >= 0 ? `${A.art} et ${Y.art} montent et baissent ensemble` : `${A.art} et ${Y.art} évoluent en sens inverse`;
  const p = x.protection, sem = p && p.semaine;
  const protegeTxt = sem && sem.taux != null ? `Sur l’historique, quand ${A.art} est allé contre ta position de plus de 1 % sur une semaine (${sem.cas} cas), la couverture a gagné ${pc(sem.taux)} des fois et compensé en moyenne ${pc(Math.max(0, sem.compensation) * frac)} de la perte.` : 'Pas assez de périodes défavorables dans l’historique pour mesurer la protection.';
  const coutTxt = sem && sem.cout != null ? `Quand ${A.art} va dans ton sens, cette couverture te reprend en moyenne ${pc(Math.max(0, sem.cout) * frac)} du gain.` : '';
  const pedago = 'Une couverture qui protège environ 70 % du temps coûte aussi environ 70 % du temps ; couvrir à 100 % revient presque à ne plus avoir de position.';
  return {
    action: { verbe: verbeY, achat: dirY > 0, cible: Y.art, couleur: dirY > 0 ? 'vert' : 'rouge' },
    ta: `Tu ${achat ? 'ACHÈTES' : 'VENDS'} ${A.art}`,
    consigne: `pour te protéger, ${verbeY} ${Y.art} à ${tailleTxt}.`,
    pourquoi: `Pourquoi : ${lien} (corrélation ${fc(x.c250)}). Si ${A.art} ${mouvement}, ${objetCouv} gagne.`,
    protege: protegeTxt, cout: coutTxt, pedago,
    texte() { return `${this.ta} → ${this.consigne} ${this.pourquoi} ${this.protege} ${this.cout} ${this.pedago}`.replace(/\s+/g, ' ').trim(); }
  };
}
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const MAJ = cap;

/* ───── couverture d'événement ───── */
const J = 86400e3;
const jourDe = t => new Date(t).toISOString().slice(0, 10);
const liste = (annee, mds) => mds.map(([m, d]) => `${annee}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
/* NFP : vendredi, 3 semaines après la semaine (dim.–sam.) qui contient le 12 du mois de référence (règle du BLS ; les jours fériés peuvent décaler d'un jour) */
export function datesNfp(deAnnee = 2021, aAnnee = 2026) {
  const out = [];
  for (let a = deAnnee; a <= aAnnee; a++) for (let m = 0; m < 12; m++) {
    const d12 = new Date(Date.UTC(a, m, 12)), samedi = new Date(d12.getTime() + (6 - d12.getUTCDay()) * J), vendredi = new Date(samedi.getTime() + 20 * J);
    out.push(jourDe(vendredi.getTime()));
  }
  return out;
}
export const TYPES_EVENEMENT = Object.freeze({
  FOMC: { nom: 'Fed (décision FOMC)', dates: [...liste(2021, [[1, 27], [3, 17], [4, 28], [6, 16], [7, 28], [9, 22], [11, 3], [12, 15]]), ...liste(2022, [[1, 26], [3, 16], [5, 4], [6, 15], [7, 27], [9, 21], [11, 2], [12, 14]]), ...liste(2023, [[2, 1], [3, 22], [5, 3], [6, 14], [7, 26], [9, 20], [11, 1], [12, 13]]), ...liste(2024, [[1, 31], [3, 20], [5, 1], [6, 12], [7, 31], [9, 18], [11, 7], [12, 18]]), ...liste(2025, [[1, 29], [3, 19], [5, 7], [6, 18], [7, 30], [9, 17], [10, 29], [12, 10]])], source: 'calendrier officiel de la Fed' },
  CPI: { nom: 'Inflation américaine (CPI)', dates: [...liste(2023, [[1, 12], [2, 14], [3, 14], [4, 12], [5, 10], [6, 13], [7, 12], [8, 10], [9, 13], [10, 12], [11, 14], [12, 12]]), ...liste(2024, [[1, 11], [2, 13], [3, 12], [4, 10], [5, 15], [6, 12], [7, 11], [8, 14], [9, 11], [10, 10], [11, 13], [12, 11]]), ...liste(2025, [[1, 15], [2, 12], [3, 12], [4, 10], [5, 13], [6, 11], [7, 15], [8, 12], [9, 11]])], source: 'liste interne (BLS), à ±1 jour près' },
  NFP: { nom: 'Emploi américain (NFP)', dates: datesNfp(2021, 2025), source: 'règle du BLS (vendredi), jours fériés non corrigés' },
  BCE: { nom: 'BCE (décision de taux)', dates: [...liste(2023, [[2, 2], [3, 16], [5, 4], [6, 15], [7, 27], [9, 14], [10, 26], [12, 14]]), ...liste(2024, [[1, 25], [3, 7], [4, 11], [6, 6], [7, 18], [9, 12], [10, 17], [12, 12]]), ...liste(2025, [[1, 30], [3, 6], [4, 17], [6, 5], [7, 24], [9, 11], [10, 30], [12, 18]])], source: 'calendrier officiel de la BCE' }
});
/* titre d'un événement du calendrier (flux Forex Factory) → type géré, sinon null */
export function typeDeTitre(titre = '', pays = '') {
  const t = String(titre);
  if (/non-?farm|nfp|employment change/i.test(t) && /USD|US/i.test(pays || 'USD')) return 'NFP';
  if (/\bcpi\b/i.test(t) && /USD|US/i.test(pays || 'USD')) return 'CPI';
  if (/fomc|federal funds rate/i.test(t)) return 'FOMC';
  if (/\becb\b|main refinancing|deposit facility|european central bank/i.test(t) || (/EUR/i.test(pays) && /rate statement|press conference/i.test(t))) return 'BCE';
  return null;
}
/* comportement de la paire autour du type d'annonce : jours d'annonce de la série commune (le jour J contient l'annonce ; poser à la clôture de J−1, retirer à la clôture de J) */
export function comportementEvenement(dates, ra, rb, sens, beta, type, { fraction = 1 } = {}) {
  const T = TYPES_EVENEMENT[type]; if (!T) return null;
  const set = new Set(T.dates), idx = []; dates.forEach((d, i) => { if (set.has(d)) idx.push(i); });
  const tous = ra.map(Math.abs), moyTous = tous.length ? tous.reduce((s, v) => s + v, 0) / tous.length : null;
  if (idx.length < 4) return { type, nom: T.nom, source: T.source, n: idx.length, mesurable: false };
  let nC = 0, gagne = 0, pertes = 0, gC = 0, gPos = 0, pCouv = 0, nF = 0, abs = 0;
  for (const i of idx) {
    const pos = sens * ra[i], couv = -sens * beta * fraction * rb[i]; abs += Math.abs(ra[i]);
    if (pos < 0) { nC++; pertes += -pos; gC += couv; if (couv > 0) gagne++; } else if (pos > 0) { nF++; gPos += pos; pCouv += -couv; }
  }
  const moyEv = abs / idx.length;
  return { type, nom: T.nom, source: T.source, n: idx.length, mesurable: true, amplitudeRatio: moyTous > 0 ? moyEv / moyTous : null, contreMoi: nC / idx.length,
    taux: nC ? gagne / nC : null, compensation: pertes > 0 ? gC / pertes : null, cout: gPos > 0 ? pCouv / gPos : null, casContre: nC, casPour: nF };
}
export function phraseEvenement(actifCouvert, sens, x, c, nomEvenement, niveau = NIVEAUX[2]) {
  if (!c) return 'Je ne connais pas l’historique de ce type d’annonce.';
  const A = articles(actifCouvert), Y = articles({ nom: x.nom, art: x.art, de: x.de }), verbe = x.sensCouverture > 0 ? 'ACHÈTE' : 'VENDS';
  const base = `Avant ${nomEvenement} : ${verbe} ${Y.art} à ${f0(Math.abs(x.beta) * niveau.fraction * 100)} % de ta taille, à la clôture de la veille, puis retire-la à la clôture du jour de l’annonce.`;
  if (!c.mesurable) return `${base} Historique trop court pour ce type d’annonce (${c.n} cas) : aucun comportement mesuré.`;
  return `${base} Sur ${c.n} annonces passées, ${A.art} a bougé en moyenne ${c.amplitudeRatio == null ? '—' : fc(c.amplitudeRatio)} fois plus qu’un jour normal et est allé contre toi ${pc(c.contreMoi)} des fois ; dans ces cas, la couverture a gagné ${pc(c.taux)} des fois et compensé ${pc(c.compensation == null ? null : Math.max(0, c.compensation) * niveau.fraction)} de la perte, mais elle t’a repris ${pc(c.cout == null ? null : Math.max(0, c.cout) * niveau.fraction)} du gain les autres fois.`;
}
