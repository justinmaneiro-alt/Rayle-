import { CRITERES3, empreinteV3 } from './criteres-v3.js';
import { intervalleBootstrap } from './stats-v3.js';
import { sharpeDeflate } from '../planetes/mars/pc/agent-btc/stats-m5.js';

/* ═════════════ CRITÈRES « ÉQUILIBRÉS » — VERSION 4 (écrits le 2026-10-29, décision de Justin ; module pur, testé : galaxie/tests/criteres-v4-test.mjs) ═════════════
   Source de vérité du code ; `strategies/criteres-v4.json` en est la copie lisible (écrite par `node strategies/ecrire-criteres-v4.mjs`) et `strategies/CRITERES_V4.md` l'explique en français.
   Les fichiers de la version 3 (`criteres-v3.json`, `CRITERES.md`, empreinte c9b4ddd4) et de la version 1 (c9995253) ne sont PAS modifiés : la v4 est un niveau de preuve SUPPLÉMENTAIRE, choisi par un réglage
   (« strict (v3) » ou « équilibré (v4) », équilibré par défaut sur demande de Justin). Chaque résultat porte la version de critères utilisée.
   Deux niveaux : « Candidate » (observation en simulation, aucune alerte d'entrée) et « Validée » (alertes d'entrée possibles après la simulation en direct déjà existante).
   Unité : R = multiple du risque, frais + spread + glissement déduits. Rien ici ne promet un gain. */
export const CRITERES4 = Object.freeze({
  version: 4,
  figesLe: '2026-10-29',
  decision: 'Décision de Justin le 2026-10-29 : proposer des positions concrètes chaque jour avec deux niveaux de preuve, en restant totalement honnête sur le niveau atteint. Seuils écrits avant de mesurer quoi que ce soit.',
  base: Object.freeze({ v1: 1, v2: 2, v3: 3, empreinteV3: 'c9b4ddd4' }),
  candidate: Object.freeze({ esperanceMin: 0.08, tradesMin: 100, periodesPositivesMin: 2, periodesMin: 2, tradesParPeriodeMin: 20, fraisDoublesMin: 0, auditeurObligatoire: true }),
  validee: Object.freeze({
    esperanceMin: 0.12,
    tradesMin: 150,
    alternative: Object.freeze({ tradesMin: 100, semainesLiveMin: 4, liveEsperanceMin: 0 }),     // ou 100 trades + 4 semaines de simulation en direct positives
    bootstrap: Object.freeze({ tirages: 5000, niveau: 0.95, basMin: 0, graine: 20261029 }),
    deflation: Object.freeze({ dsrMin: 0.95, nombreEffectif: true }),                            // Sharpe déflaté avec le nombre EFFECTIF d'essais (amas de variantes corrélées)
    walkForwardPositif: true,
    prop: Object.freeze({ drawdownMaxPct: 6, perteJourMaxPct: 3 }),
    jeuFinal: Object.freeze({ moisMin: 6, ouvertures: 1, rapportAuditeur: true }),
    simulationDirect: Object.freeze({ semainesMin: 4, tradesMin: 30 })
  }),
  confluenceMin: 2,                 // une proposition n'est émise que si au moins 2 éléments concordent (réglable)
  rrMin: 1.5,                       // rapport gain / risque minimal à l'entrée
  aucunePosition: 'Aucune position ne passe le filtre qualité pour l’instant.'
});

export function empreinteV4(c = CRITERES4) {
  const s = JSON.stringify(c); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export const VERSIONS_CRITERES = Object.freeze({ strict: 'strict (v3)', equilibre: 'équilibré (v4)' });
export const NIVEAUX = Object.freeze({
  validee: 'Validée', candidate: 'Candidate (en observation)', non_concluante: 'Testée : non concluante', non_testee: 'Idée non testée'
});
const L = (critere, valeur, seuil, ok, unite = '') => ({ critere, valeur, seuil, ok, unite });
const moy = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
const fr = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('.', ','));

/* Cherche des PÉRIODES distinctes dans une liste de trades (découpage en `k` blocs de même nombre de trades, dans l'ordre du temps). */
export function periodes(trades, k = 2) {
  const t = trades.slice().sort((a, b) => (a.t || 0) - (b.t || 0)), out = [], taille = Math.floor(t.length / k);
  if (taille < 1) return out;
  for (let j = 0; j < k; j++) { const bloc = t.slice(j * taille, j === k - 1 ? t.length : (j + 1) * taille); out.push({ n: bloc.length, esperance: moy(bloc.map(x => x.R)) }); }
  return out;
}

/* Évalue le NIVEAU de preuve d'un type de position (ou d'une stratégie).
   `preuves` : { R: [R après frais, hors échantillon], periodes?: [{ n, esperance }], esperanceFraisDoubles?, auditeur?: { fait, ok }, nVariantes (compteur TOTAL), nEffectif (nombre effectif d'essais),
                 ddPct?, pireJourPct?, walkForwardPositif?, live?: { semaines, esperance, n }, jeuFinal?: { ouvert, ok }, rapportAuditeur?: bool }
   `version` : 'equilibre' (v4) ou 'strict' (v3 : un seul niveau, +0,25 R). Rend { niveau, version, criteres: empreinte, lignesCandidate, lignesValidee, ratees, pourquoi }. */
export function evaluerNiveau(preuves, { version = 'equilibre', c4 = CRITERES4, c3 = CRITERES3 } = {}) {
  const R = preuves.R || [], n = R.length, esp = moy(R), res = { version, versionTexte: VERSIONS_CRITERES[version] || version, criteres: version === 'strict' ? empreinteV3(c3) : empreinteV4(c4), n, esperance: esp };
  if (n === 0) return { ...res, niveau: 'non_testee', lignesCandidate: [], lignesValidee: [], ratees: ['aucun trade hors échantillon'], pourquoi: 'Aucun trade mesuré : c’est une idée, pas un résultat.' };
  const strict = version === 'strict', V = strict ? { esperanceMin: c3.horsEchantillon.esperanceMin, tradesMin: c3.horsEchantillon.tradesMin, alternative: null, bootstrap: c3.bootstrap, deflation: { dsrMin: c3.deflation.dsrMin }, prop: c3.prop, simulationDirect: c3.simulationDirect } : c4.validee;
  const NV = preuves.nVariantes || 1, NE = strict ? NV : (preuves.nEffectif || NV);          // strict : toutes les variantes comptent ; équilibré : nombre effectif d'essais
  const boot = intervalleBootstrap(R, { tirages: V.bootstrap.tirages, niveau: V.bootstrap.niveau, graine: V.bootstrap.graine }), dsr = sharpeDeflate(R, NE);
  const per = preuves.periodes || periodes(preuves.trades || R.map((r, i) => ({ R: r, t: i })), 2);
  // ─ Candidate
  const C = c4.candidate, perOk = per.filter(p => p.n >= C.tradesParPeriodeMin), perPos = perOk.filter(p => p.esperance > 0);
  const lignesCandidate = [
    L('Espérance après frais', esp, '≥ ' + C.esperanceMin, esp != null && esp >= C.esperanceMin, ' R'),
    L('Trades hors échantillon', n, '≥ ' + C.tradesMin, n >= C.tradesMin),
    L('Périodes distinctes positives (≥ ' + C.tradesParPeriodeMin + ' trades chacune)', perPos.length + ' sur ' + perOk.length, '≥ ' + C.periodesPositivesMin, perOk.length >= C.periodesMin && perPos.length >= C.periodesPositivesMin),
    L('Frais doublés : l’espérance reste positive', preuves.esperanceFraisDoubles == null ? null : preuves.esperanceFraisDoubles, '≥ ' + C.fraisDoublesMin, preuves.esperanceFraisDoubles != null && preuves.esperanceFraisDoubles >= C.fraisDoublesMin, ' R'),
    L('Contrôles de l’Auditeur (aucune fuite du futur…)', preuves.auditeur && preuves.auditeur.fait ? (preuves.auditeur.ok ? 'passés' : 'échoués') : 'non faits', 'passés', !!(preuves.auditeur && preuves.auditeur.fait && preuves.auditeur.ok))
  ];
  // ─ Validée
  const live = preuves.live || null, assezTrades = n >= V.tradesMin, viaLive = !!(V.alternative && n >= V.alternative.tradesMin && live && live.semaines >= V.alternative.semainesLiveMin && live.esperance != null && live.esperance > V.alternative.liveEsperanceMin);
  const lignesValidee = [
    L('Espérance après frais', esp, '≥ ' + V.esperanceMin, esp != null && esp >= V.esperanceMin, ' R'),
    L('Trades hors échantillon', n, '≥ ' + V.tradesMin + (V.alternative ? ' (ou ≥ ' + V.alternative.tradesMin + ' + ' + V.alternative.semainesLiveMin + ' semaines de simulation positives)' : ''), assezTrades || viaLive),
    L('Intervalle de confiance à ' + Math.round(V.bootstrap.niveau * 100) + ' % : borne basse', boot.bas, '> ' + V.bootstrap.basMin, boot.bas != null && boot.bas > V.bootstrap.basMin, ' R'),
    L('Probabilité que ce ne soit pas le hasard (Sharpe déflaté, ' + (strict ? 'toutes les variantes : ' : 'nombre effectif d’essais : ') + NE + ')', dsr.dsr, '≥ ' + V.deflation.dsrMin, dsr.dsr != null && dsr.dsr >= V.deflation.dsrMin),
    L('Walk-forward positif', preuves.walkForwardPositif == null ? null : (preuves.walkForwardPositif ? 'oui' : 'non'), 'oui', preuves.walkForwardPositif !== false && preuves.walkForwardPositif != null),
    L('Compte prop : creux maximal simulé', preuves.ddPct == null ? null : preuves.ddPct, '≤ ' + V.prop.drawdownMaxPct, preuves.ddPct != null && preuves.ddPct <= V.prop.drawdownMaxPct, ' %'),
    L('Compte prop : pire journée simulée', preuves.pireJourPct == null ? null : preuves.pireJourPct, '≤ ' + V.prop.perteJourMaxPct, preuves.pireJourPct != null && preuves.pireJourPct <= V.prop.perteJourMaxPct, ' %')
  ];
  if (!strict) lignesValidee.push(L('Rapport écrit de l’Auditeur', preuves.rapportAuditeur ? 'écrit' : 'absent', 'écrit', !!preuves.rapportAuditeur));
  const okValidee = lignesValidee.every(l => l.ok), okCandidate = lignesCandidate.every(l => l.ok);
  const ratees = (okValidee ? [] : (okCandidate || strict ? lignesValidee : lignesCandidate).filter(l => !l.ok).map(l => l.critere));
  let niveau;
  if (okValidee) niveau = 'validee';
  else if (!strict && okCandidate) niveau = 'candidate';
  else if (n < (strict ? V.tradesMin : c4.candidate.tradesMin) && (esp == null || esp > 0)) niveau = n < 20 ? 'non_testee' : 'non_concluante';
  else niveau = 'non_concluante';
  if (n < 20) niveau = 'non_testee';
  return { ...res, niveau, lignesCandidate, lignesValidee, ratees, nVariantes: NV, nEffectif: NE, bootstrap: boot, dsr: dsr.dsr, pourquoi: pourquoiPasPlus(niveau, lignesCandidate, lignesValidee, strict) };
}

/* Une phrase qui dit CE QUI MANQUE pour passer au niveau suivant. */
export function pourquoiPasPlus(niveau, lignesCandidate, lignesValidee, strict = false) {
  const manque = l => l.filter(x => !x.ok).map(x => x.critere + ' (' + (typeof x.valeur === 'number' ? fr(x.valeur, 3) : x.valeur == null ? 'inconnu' : x.valeur) + x.unite + ', il faut ' + x.seuil + ')');
  if (niveau === 'validee') return 'Tous les critères sont atteints.';
  if (niveau === 'candidate') return 'Pour devenir Validée : ' + manque(lignesValidee).join(' ; ') + '.';
  if (strict) return 'Pour être validée au niveau strict : ' + manque(lignesValidee).join(' ; ') + '.';
  if (niveau === 'non_testee') return 'Trop peu de trades mesurés pour juger : c’est une idée à observer.';
  return 'Pour devenir Candidate : ' + manque(lignesCandidate).join(' ; ') + '.';
}
export { CRITERES3 };

/* Même évaluation, à partir du RÉSUMÉ d'un backtest gardé dans l'état de l'agent (pas de liste de trades). `b` : { trades, esperance, bootstrapBas, dsr, correction, propDdPct, propJourPct, ratees, statut, jeuFinal }.
   Les périodes sont déduites du critère « trimestres positifs » de la version 1 ; les contrôles de l'Auditeur sont ceux qu'on fournit (`auditeur`), sinon « non faits » (donc pas de Candidate : jamais de faveur). */
export function evaluerNiveauResume(b, { version = 'equilibre', auditeur = null, rapportAuditeur = false, c4 = CRITERES4, c3 = CRITERES3 } = {}) {
  const n = b.trades || 0, strict = version === 'strict', V = strict ? c3.horsEchantillon : c4.validee, C = c4.candidate;
  const dsr = strict ? (b.correction && b.correction.ancien ? b.correction.ancien.dsr : b.dsr) : (b.correction && b.correction.corrige && b.correction.corrige.dsr != null ? b.correction.corrige.dsr : b.dsr);
  const trimOk = !(b.ratees || []).some(x => /rimestre/.test(x)), walkOk = !(b.ratees || []).some(x => /Blocs|walk/i.test(x));
  const lignesCandidate = [
    L('Espérance après frais', b.esperance, '≥ ' + C.esperanceMin, b.esperance != null && b.esperance >= C.esperanceMin, ' R'),
    L('Trades hors échantillon', n, '≥ ' + C.tradesMin, n >= C.tradesMin),
    L('Périodes distinctes positives', trimOk ? 'oui' : 'non', 'au moins 2', trimOk && n >= 2 * C.tradesParPeriodeMin),
    L('Frais doublés : l’espérance reste positive', b.coutMoyenR != null && b.esperance != null ? b.esperance - b.coutMoyenR : null, '≥ ' + C.fraisDoublesMin, b.coutMoyenR != null && b.esperance != null && b.esperance - b.coutMoyenR >= C.fraisDoublesMin, ' R'),
    L('Contrôles de l’Auditeur (aucune fuite du futur…)', auditeur && auditeur.fait ? (auditeur.ok ? 'passés' : 'échoués') : 'non faits', 'passés', !!(auditeur && auditeur.fait && auditeur.ok))
  ];
  const lignesValidee = [
    L('Espérance après frais', b.esperance, '≥ ' + V.esperanceMin, b.esperance != null && b.esperance >= V.esperanceMin, ' R'),
    L('Trades hors échantillon', n, '≥ ' + V.tradesMin, n >= V.tradesMin),
    L('Intervalle de confiance : borne basse', b.bootstrapBas, '> 0', b.bootstrapBas != null && b.bootstrapBas > 0, ' R'),
    L('Probabilité que ce ne soit pas le hasard (Sharpe déflaté)', dsr, '≥ ' + (strict ? c3.deflation.dsrMin : c4.validee.deflation.dsrMin), dsr != null && dsr >= (strict ? c3.deflation.dsrMin : c4.validee.deflation.dsrMin)),
    L('Walk-forward positif', walkOk ? 'oui' : 'non', 'oui', walkOk),
    L('Compte prop : creux maximal simulé', b.propDdPct, '≤ ' + c4.validee.prop.drawdownMaxPct, b.propDdPct != null && b.propDdPct <= c4.validee.prop.drawdownMaxPct, ' %'),
    L('Compte prop : pire journée simulée', b.propJourPct, '≤ ' + c4.validee.prop.perteJourMaxPct, b.propJourPct != null && b.propJourPct <= c4.validee.prop.perteJourMaxPct, ' %')
  ];
  if (!strict) lignesValidee.push(L('Rapport écrit de l’Auditeur', rapportAuditeur ? 'écrit' : 'absent', 'écrit', !!rapportAuditeur));
  if (b.jeuFinal && b.jeuFinal.ouvert) lignesValidee.push(L('Jeu final (ouvert une seule fois)', b.jeuFinal.ok ? 'réussi' : 'échoué', 'réussi', !!b.jeuFinal.ok));
  const okV = lignesValidee.every(l => l.ok), okC = lignesCandidate.every(l => l.ok);
  const niveau = n < 20 ? 'non_testee' : okV ? 'validee' : (!strict && okC) ? 'candidate' : 'non_concluante';
  return { version, versionTexte: VERSIONS_CRITERES[version], criteres: strict ? empreinteV3(c3) : empreinteV4(c4), niveau, n, esperance: b.esperance, lignesCandidate, lignesValidee, ratees: (okV ? [] : (okC || strict ? lignesValidee : lignesCandidate).filter(l => !l.ok).map(l => l.critere)), pourquoi: pourquoiPasPlus(niveau, lignesCandidate, lignesValidee, strict) };
}
