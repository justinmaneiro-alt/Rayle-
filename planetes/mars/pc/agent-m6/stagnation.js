import { validerRegle, decrireRegle } from '../agent-btc/regles-lab.js';

/* ═════════════ STAGNATION DE LA RECHERCHE ET PIVOT DE FAMILLE (M6 ; module pur, testé : planetes/mars/tests/m6-stagnation-test.mjs) ═════════════
   Une recherche sans fin peut tourner en rond : les mêmes types de règles, les mêmes échecs. Le module suit la meilleure « piste proche » (la candidate qui échoue le plus près des critères, mesurée
   en R net hors échantillon) et dit qu'elle STAGNE quand, sur une fenêtre de variantes testées, elle n'a pas progressé. Alors l'agent CHANGE DE FAMILLE d'hypothèses et le dit :
   - il restreint le tirage des règles aléatoires à une autre famille (tendance et cassures / contre-tendance / microstructure / régimes / volatilité) ;
   - ou, pour « l'alpha résiduel », il prend la meilleure piste proche et lui ajoute UN filtre de contexte à la fois (session, jour, phase, volatilité, volume, delta) : ce que la piste rate se trouve
     peut-être dans un contexte précis. C'est de la recherche dans les résidus : chaque variante est comptée dans le nombre total de variantes testées (le seuil du hasard monte), et passe les mêmes critères.
   RIEN n'est assoupli : un pivot change ce qu'on teste, jamais ce qu'on accepte. Chaque pivot est écrit dans le journal de la recherche avec sa raison. */
export const FAMILLES_PIVOT = Object.freeze([
  { code: 'regimes', nom: 'règles conditionnées à un régime de marché (phase et volatilité)', focus: { declencheurs: ['cassure', 'rsi', 'croisement', 'meche', 'zone', 'balayage'], contextes: ['phase', 'regime', 'regime', 'volatilite'] } },
  { code: 'tendance_cassures', nom: 'suivi de tendance et cassures', focus: { declencheurs: ['cassure', 'croisement'], contextes: ['phase', 'ema', 'volume', 'session'] } },
  { code: 'contre_tendance', nom: 'retours à la moyenne et rejets', focus: { declencheurs: ['rsi', 'meche', 'balayage'], contextes: ['phase', 'volatilite', 'zone', 'delta'] } },
  { code: 'microstructure', nom: 'microstructure : sessions, volume, delta, zones', focus: { declencheurs: ['balayage', 'zone', 'meche'], contextes: ['session', 'delta', 'volume', 'jours'] } },
  { code: 'volatilite', nom: 'volatilité et expansion', focus: { declencheurs: ['cassure', 'croisement'], contextes: ['volatilite', 'volume', 'session'] } },
  { code: 'residuel', nom: 'alpha résiduel : la meilleure piste proche + un filtre de contexte', focus: null }
]);
export const FILTRES_RESIDUELS = Object.freeze([
  { nom: 'session asiatique', cond: { type: 'session', valeurs: [0] } }, { nom: 'session de Londres', cond: { type: 'session', valeurs: [1] } }, { nom: 'session de New York', cond: { type: 'session', valeurs: [2] } },
  { nom: 'jours ouvrés', cond: { type: 'jours', valeurs: [1, 2, 3, 4, 5] } }, { nom: 'week-end', cond: { type: 'jours', valeurs: [0, 6] } },
  { nom: 'tendance H4', cond: { type: 'phase', tf: 'h4', valeurs: ['tendance'] } }, { nom: 'tendance H1', cond: { type: 'phase', tf: 'h1', valeurs: ['tendance'] } }, { nom: 'range H1', cond: { type: 'phase', tf: 'h1', valeurs: ['range'] } },
  { nom: 'volatilité haute', cond: { type: 'volatilite', min: 0.6, max: 1 } }, { nom: 'volatilité basse', cond: { type: 'volatilite', min: 0, max: 0.4 } },
  { nom: 'volume fort', cond: { type: 'volume', min: 1.5 } }, { nom: 'delta dans le sens du trade', cond: { type: 'delta', sens: 'avec', ratioMin: 0.05 } }
]);
const MAX_SUIVI = 300;

/* Enregistre l'avancement de la recherche (appelé après chaque tranche). Fusionne les relevés trop proches pour ne pas gonfler l'état. */
export function suivreRecherche(etat, maintenant = Date.now()) {
  etat.suivi = etat.suivi || [];
  const meilleur = (etat.presque || []).reduce((m, p) => Math.max(m, Number.isFinite(p.Rtotal) ? p.Rtotal : -Infinity), -Infinity), snap = { t: maintenant, N: etat.N, meilleur: Number.isFinite(meilleur) ? meilleur : 0, nPresque: (etat.presque || []).length, niveau: etat.niveau, focus: etat.focus ? etat.focus.code : null };
  const der = etat.suivi[etat.suivi.length - 1];
  if (der && maintenant - der.t < 10 * 60e3 && snap.N - der.N < 3000 && der.focus === snap.focus) etat.suivi[etat.suivi.length - 1] = snap; else etat.suivi.push(snap);
  if (etat.suivi.length > MAX_SUIVI) etat.suivi.splice(0, etat.suivi.length - MAX_SUIVI);
  return snap;
}
/* Stagne-t-elle ? Sur les `fenetreN` dernières variantes testées (au moins), la meilleure piste proche a-t-elle progressé d'au moins max(gainMinR, 5 %) ? Le point de départ ne remonte jamais avant le dernier pivot. */
export function detecterStagnation(etat, { fenetreN = 100000, gainMinR = 2, partMin = 0.05 } = {}) {
  const s = etat.suivi || [], pivots = etat.pivots || [], dernierPivot = pivots.length ? pivots[pivots.length - 1] : null, N = etat.N;
  if (!s.length) return { stagne: false, raison: 'pas encore de suivi', phrase: 'Recherche : pas encore assez d’historique pour juger.' };
  const now = s[s.length - 1], minN = Math.max(N - fenetreN, dernierPivot ? dernierPivot.N : 0);
  const ref = s.find(x => x.N >= minN);
  const couvert = !!ref && now.N - ref.N >= fenetreN * 0.9;
  if (!ref || !couvert) return { stagne: false, raison: 'fenetre_incomplete', variantes: ref ? now.N - ref.N : 0, phrase: 'Recherche : ' + (ref ? (now.N - ref.N).toLocaleString('fr-FR') : '0') + ' variantes depuis ' + (dernierPivot ? 'le dernier pivot' : 'le début du suivi') + ', il en faut ' + fenetreN.toLocaleString('fr-FR') + ' pour juger de la stagnation.', meilleur: now.meilleur };
  const gain = now.meilleur - ref.meilleur, seuil = Math.max(gainMinR, Math.abs(ref.meilleur) * partMin), progres = gain >= seuil || now.nPresque > ref.nPresque + 2;
  const base = { variantes: now.N - ref.N, depuis: ref.t, meilleur: now.meilleur, meilleurAvant: ref.meilleur, gain, seuil };
  return progres ? { ...base, stagne: false, raison: 'progres', phrase: 'Recherche : la meilleure piste proche progresse (' + signe(gain) + ' R sur ' + (now.N - ref.N).toLocaleString('fr-FR') + ' variantes).' }
    : { ...base, stagne: true, raison: 'stagnation', phrase: 'La recherche STAGNE : sur ' + (now.N - ref.N).toLocaleString('fr-FR') + ' variantes, la meilleure piste proche n’a pas progressé (' + signe(gain) + ' R, il en fallait au moins +' + seuil.toFixed(1).replace('.', ',') + ' R).' };
}
const signe = x => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1).replace('.', ',');

/* Pivot : choisit la prochaine famille (dans l'ordre, en tournant), l'applique à l'état et rend { ok, code, nom, texte }. */
export function pivoter(etat, maintenant = Date.now(), raison = null) {
  etat.pivots = etat.pivots || []; etat.file = etat.file || []; etat.journalCourt = etat.journalCourt || [];
  const faits = etat.pivots.length;
  for (let essai = 0; essai < FAMILLES_PIVOT.length; essai++) {
    const f = FAMILLES_PIVOT[(faits + essai) % FAMILLES_PIVOT.length], ancien = etat.focus ? etat.focus.code : null;
    if (f.code === 'residuel') {
      const base = (etat.presque || []).find(p => p.regle); if (!base) continue;                                  // pas de piste-règle à prolonger : on passe à la famille suivante
      const regles = [];
      for (const fl of FILTRES_RESIDUELS) {
        const r = JSON.parse(JSON.stringify(base.regle)); if (r.conditions.length >= 6 || r.conditions.some(c => c.type === fl.cond.type && c.tf === fl.cond.tf)) continue;
        r.conditions.push(fl.cond); r.nom = (base.nomBase || base.nom) + ' + ' + fl.nom; const v = validerRegle(r); if (v.ok) regles.push(v.regle);
      }
      if (!regles.length) continue;
      etat.residuels = etat.residuels || []; const idx = etat.residuels.length;
      etat.residuels.push({ nom: 'Alpha résiduel de « ' + (base.nomBase || base.nom) + ' » (' + regles.length + ' filtres de contexte)', description: 'La meilleure piste proche (' + decrireRegle(base.regle) + ') avec, un par un, un filtre de contexte ajouté. Exploratoire : chaque variante est comptée et passe les mêmes critères.', regles });
      etat.file.push('residuel:' + idx);
      return noter(etat, maintenant, f, ancien, raison, 'Je prends la meilleure piste proche ("' + (base.nomBase || base.nom) + '") et je lui ajoute, un par un, ' + regles.length + ' filtres de contexte (session, jour, phase, volatilité, volume, delta). C’est exploratoire : le nombre de variantes testées en tient compte.');
    }
    etat.focus = { code: f.code, ...f.focus };
    return noter(etat, maintenant, f, ancien, raison, 'Je restreins mes règles aléatoires à une autre famille : ' + f.nom + '.');
  }
  return { ok: false, texte: 'Aucune autre famille à essayer pour l’instant.' };
}
function noter(etat, maintenant, f, ancien, raison, detail) {
  const texte = 'Pivot de la recherche : ' + (raison || 'les meilleures pistes stagnent') + '. ' + detail + ' Les critères de validation ne changent pas.';
  etat.pivots.push({ t: maintenant, N: etat.N, code: f.code, nom: f.nom, de: ancien, raison: raison || 'stagnation' });
  etat.journalCourt.push({ t: maintenant, chantier: 'pivot', nom: 'Pivot : ' + f.nom, niveau: 5, decision: 'PIVOT', raison: texte, N: etat.N }); if (etat.journalCourt.length > 300) etat.journalCourt.splice(0, etat.journalCourt.length - 300);
  etat.suivi = etat.suivi || []; if (etat.suivi.length) etat.suivi[etat.suivi.length - 1].focus = f.code;
  return { ok: true, code: f.code, nom: f.nom, texte, N: etat.N };
}
