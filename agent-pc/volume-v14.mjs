// Tableau vivant V14 sur le PC : à chaque clôture de bougie, détecte les propositions des setups de volume retenus par la recherche (3 conditions au plus), les suit dans un PORTEFEUILLE VIRTUEL
// (10 000 $, 1 % de risque, intérêts composés, frais et glissement inclus, ordres limites réalistes) et publie la vue (volume-v14.json → route /__agent/volume, paquet mobile).
// Tout est PROPOSITION et SIMULATION : aucun ordre réel, aucune clé de courtier. Les critères de validation (criteres-v3 / v4) ne sont pas lus ici : ils ne servent qu'à ÉTIQUETER (Validée / Candidate /
// À l'essai) et ne bloquent jamais le suivi virtuel. Les trades « rejoués » (le passé) sont toujours étiquetés « REJOUÉ, pas réel ».
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lireJson, ecrireJson } from './etat-agent.mjs';
import { chargerSerie } from './volume-donnees.mjs';
import { barresDirect } from './volume-enregistreur.mjs';
import { FICHIER_RECHERCHE, FICHIER_REJOUE, coutsPour, lancerRecherche } from './volume-recherche.mjs';
import { DETECTEURS, SETUPS_VOLUME } from '../strategies/volume/setups-volume.js';
import { etatSignal, portefeuille, stats } from '../strategies/volume/simulation-volume.js';
import { profilJour, profilSemaine, volumeNet, dominance, empreinteBarre, absorption } from '../strategies/volume/serie-volume.js';
import { prixDeTranche } from '../strategies/liquidite/barres-flux.js';

export const FICHIER_VOLUME = 'volume-v14.json';
export const AVERTISSEMENT = 'Propositions et simulations seulement : aucun ordre n’est passé, aucun gain n’est garanti. Les trades « rejoués » sont le passé, pas du réel.';
export const CONFIGS_DEFAUT = Object.freeze([{ setup: 'acceptation_hors_valeur', tf: 'H1', params: { relatif: 1, rr: 2, riskMinAtr: 3 }, niveau: 'a_lessai' }]);
const JOUR = 86400e3, MS15 = 900000;
const NIVEAU_LIBELLE = { a_lessai: 'À l’essai', candidate: 'Candidate', validee: 'Validée' };
export const libelleNiveau = n => NIVEAU_LIBELLE[n] || 'À l’essai';
const arr = (a, n) => Array.from(a.slice(-n));
const cleConfig = c => c.setup + '·' + c.tf;

export function creerVolume({ dossier, maintenant = () => Date.now(), journal = () => {}, erreur = () => {}, actifs = ['BTC', 'SOL', 'DOGE'], chargerLaSerie = chargerSerie, lireDirect = barresDirect } = {}) {
  const fichier = path.join(dossier, FICHIER_VOLUME);
  let etat = lireJson(fichier, null); if (!etat || etat.schema !== 1) etat = { schema: 1, demarreLe: maintenant(), signaux: [], reglages: { capital0: 10000, risquePct: 1 }, pauses: {}, dernierCalcul: 0, derniereRecherche: 0, vuePubliee: null };
  let cache = null;                                                                              // { cleBarre, series }
  const reglages = () => ({ capital0: 10000, risquePct: 1, ...(etat.reglages || {}) });
  const recherche = () => lireJson(path.join(dossier, FICHIER_RECHERCHE), null);
  const configsLive = () => { const r = recherche(); const l = r && r.configs && r.configs.length ? r.configs : CONFIGS_DEFAUT; return l; };

  const manques = {};                                                                              // actif → raison pour laquelle il n'est pas suivi en direct
  function chargerSeries(t) {
    const series = {};
    for (const a of actifs) {
      try {
        const base = chargerLaSerie(a, { mois: 2, dossier, maintenant: t }); if (!base) { manques[a] = 'aucun historique de transactions installé'; continue; }
        if (Date.parse(base.a + 'T00:00:00Z') < t - 5 * JOUR) { manques[a] = 'historique des transactions pas à jour (dernier jour ' + base.a + ') : pas de suivi en direct tant qu’il n’est pas complété'; continue; }
        delete manques[a];
        const dep = Date.parse(base.a + 'T00:00:00Z') + JOUR, dir = lireDirect(a, { depuisT: dep, maintenant: t, dossier });
        series[a] = dir.barres.length ? chargerLaSerie(a, { mois: 2, dossier, extra: dir.barres, maintenant: t }) : base;
      } catch (e) { erreur('volume V14 : chargement ' + a, e); }
    }
    return series;
  }
  const serieTf = (S, tf) => (tf === 'H1' ? S.h1 : S.m15);

  /* Détecte les nouveaux signaux (barres récentes seulement) et les range. */
  function detecter(series, t) {
    let nouveaux = 0; const configs = configsLive();
    for (const [a, S] of Object.entries(series)) for (const c of configs) {
      const s = serieTf(S, c.tf); if (!s || s.nBarres < 400) continue; const cle = cleConfig(c);
      const sigs = DETECTEURS[c.setup](s, c.params).filter(sg => sg.i >= s.nBarres - 6);
      for (const sg of sigs) {
        const tSignal = s.t[sg.i] + s.pas, id = a + '|' + cle + '|' + tSignal; if (etat.signaux.some(x => x.id === id)) continue;
        if (tSignal < etat.demarreLe - 6 * 3600e3) continue;                                    // rien de plus ancien que le démarrage du suivi : le passé est « rejoué », pas « suivi »
        const enCours = etat.signaux.find(x => x.actif === a && x.cle === cle && x.statut !== 'terminee' && x.statut !== 'annulee'); if (enCours) continue;      // une position à la fois par setup et par actif
        etat.signaux.push({ id, actif: a, cle, setup: c.setup, tf: c.tf, params: c.params, niveauPreuve: c.niveau || 'a_lessai', sens: sg.sens, niveau: sg.niveau, stop: sg.stop, rr: sg.rr, validite: sg.validite, tSignal, tBarre: s.t[sg.i], niv: sg.niv, raison: sg.raison, statut: 'en_attente' }); nouveaux++;
      }
    }
    if (etat.signaux.length > 4000) etat.signaux = etat.signaux.slice(-4000);
    return nouveaux;
  }

  /* Met à jour l'état de chaque signal en le REJOUANT sur la série actuelle (déterministe) : en attente, ouverte, terminée, annulée. */
  function suivre(series) {
    for (const sg of etat.signaux) {
      if (sg.statut === 'terminee' || sg.statut === 'annulee') continue; const S = series[sg.actif]; if (!S) continue;
      const s = serieTf(S, sg.tf), i = ((tb) => { let lo = 0, hi = s.nBarres - 1; if (!s.nBarres || s.t[0] > tb) return -1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (s.t[k] <= tb) lo = k; else hi = k - 1; } return s.t[lo] === tb ? lo : -1; })(sg.tBarre); if (i < 0) continue;
      const e = etatSignal(s, { i, sens: sg.sens, niveau: sg.niveau, stop: sg.stop, rr: sg.rr, validite: sg.validite }, coutsPour(sg.actif, dossier), { maxBarres: sg.tf === 'H1' ? 24 : 48 });
      sg.statut = e.statut; if (e.raison) sg.raison_fin = e.raison;
      if (e.trade) { const t = e.trade; sg.tEntree = t.tEntree; sg.tSortie = t.tSortie || null; sg.sortie = t.sortie ?? null; sg.R = t.ouvert ? null : +t.R.toFixed(4); sg.resultat = t.statut; }
    }
  }

  const tradesFermes = () => etat.signaux.filter(x => x.statut === 'terminee' && x.R != null).map(x => ({ cle: x.cle, actif: x.actif, setup: x.setup, tEntree: x.tEntree, tSortie: x.tSortie, R: x.R, ouvert: false }));
  /* Risque par type : 1,5 % si le type a ≥ 30 trades suivis et reste positif ; en pause si ≥ 30 trades et négatif de façon stable (R moyen < −0,05). */
  function reglerRisques() {
    const par = {}; for (const t of tradesFermes()) { (par[t.cle] = par[t.cle] || []).push(t.R); }
    const risques = {}, pauses = {}; for (const [k, l] of Object.entries(par)) { if (l.length < 30) continue; const m = l.reduce((a, b) => a + b, 0) / l.length; if (m < -0.05) pauses[k] = { n: l.length, rMoyen: m, depuis: maintenant() }; else if (m > 0.05) risques[k] = Math.min(1.5, reglages().risquePct * 1.5); }
    etat.pauses = { ...etat.pauses, ...pauses }; return risques;
  }

  const sousEchantillon = (courbe, n = 120) => { const p = Math.max(1, Math.floor(courbe.length / n)); return courbe.filter((_, i) => i % p === 0 || i === courbe.length - 1); };

  function vueActif(a, S, rejoue, r) {
    const out = { actif: a, m15: null, h1: null, profil: null, net: null, positions: [], rejoue: [] };
    for (const tf of ['M15', 'H1']) {
      const s = serieTf(S, tf), n = tf === 'H1' ? 120 : 160, d = s.nBarres, deb = Math.max(0, d - n), i = d - 1;
      const bougies = []; for (let q = deb; q < d; q++) bougies.push([s.t[q], s.o[q], s.h[q], s.l[q], s.c[q], Math.round(s.achat[q]), Math.round(s.vente[q])]);
      const cvd = []; let c = 0; for (let q = deb; q < d; q++) { c += s.delta[q]; cvd.push(Math.round(c)); }
      const dom = dominance(s, i), vn = volumeNet(s, i), ab = absorption(s, i);
      out[tf.toLowerCase()] = { bougies, cvd, dominance: { sens: dom.sens, minutes: dom.minutes, part: +dom.part.toFixed(3), texte: dom.texte }, dernier: { delta: Math.round(vn.delta), agressivite: +vn.agressivite.toFixed(3), relatif: +vn.relatif.toFixed(2), absorption: ab.sens } };
    }
    const pj = profilJour(S.m15, S.m15.nBarres - 1), ps = profilSemaine(S.m15, S.m15.nBarres - 1), fmt = p => p && { poc: p.poc, vah: p.vah, val: p.val, haut: p.haut, bas: p.bas, hvn: p.hvn, lvn: p.lvn, de: p.debut };
    out.profil = { veille: fmt(pj), sept_jours: fmt(ps) };
    // empreinte des 12 dernières barres M15 (niveaux resserrés autour de la clôture, 18 niveaux au plus par barre) ; approximative pour les barres du direct
    const m = S.m15, fp = [];
    for (let q = Math.max(0, m.nBarres - 12); q < m.nBarres; q++) {
      const e = m.fp[q]; if (!e) continue; const em = empreinteBarre(e, { ratio: 3 }); if (!em.ok) continue;
      const centre = m.c[q], niv = em.niveaux.filter(x => Math.abs(x.prix - centre) / centre < 0.004).sort((x, y) => (y.achat + y.vente) - (x.achat + x.vente)).slice(0, 18).sort((x, y) => x.prix - y.prix);
      fp.push({ t: m.t[q], poc: em.poc, niveaux: niv.map(x => [x.prix, Math.round(x.achat), Math.round(x.vente), x.desAch ? 1 : 0, x.desVen ? 1 : 0]) });
    }
    out.footprint = fp; out.approximatif = !!(S.direct);
    out.positions = etat.signaux.filter(x => x.actif === a).slice(-40).map(x => ({ id: x.id, cle: x.cle, setup: x.setup, nom: SETUPS_VOLUME[x.setup].nom, tf: x.tf, niveauPreuve: x.niveauPreuve, sens: x.sens, entree: x.niveau, stop: x.stop, cible: x.sens > 0 ? x.niveau + x.rr * (x.niveau - x.stop) : x.niveau - x.rr * (x.stop - x.niveau), rr: x.rr, tSignal: x.tSignal, tEntree: x.tEntree || null, tSortie: x.tSortie || null, statut: x.statut, resultat: x.resultat || null, R: x.R ?? null, niv: x.niv, raison: x.raison, raisonFin: x.raison_fin || null }));
    out.rejoue = (rejoue && rejoue.trades ? rejoue.trades.filter(t => t.actif === a).slice(-60) : []).map(t => [t.cle, t.sens, t.tEntree, t.tSortie, t.entree, t.stop, t.sortie, t.statut, t.R, t.niv]);
    return out;
  }

  function vue(series) {
    const t = maintenant(), r = recherche(), rejoue = lireJson(path.join(dossier, FICHIER_REJOUE), null), reg = reglages();
    const risques = reglerRisques(), cles = tradesFermes(), pf = portefeuille(cles.filter(x => !etat.pauses[x.cle] || true), { capital0: reg.capital0, risquePct: reg.risquePct, risqueParCle: risques });
    const actifsVue = {}; for (const [a, S] of Object.entries(series)) actifsVue[a] = vueActif(a, S, rejoue, r);
    const dernieres = {}; for (const [a, S] of Object.entries(series)) dernieres[a] = S.m15.t[S.m15.nBarres - 1] + MS15;
    const couvertureDirect = Object.fromEntries(Object.entries(series).map(([a, S]) => [a, { de: S.de, a: S.a, direct: S.direct, approx: S.direct > 0 }]));
    const meilleur = r && r.finalistes && r.finalistes.length ? [...r.finalistes].sort((a, b) => b.oos.rMoyen - a.oos.rMoyen)[0] : null;
    const configs = configsLive().map(c => ({ cle: cleConfig(c), setup: c.setup, nom: SETUPS_VOLUME[c.setup].nom, tf: c.tf, params: c.params, niveau: c.niveau || 'a_lessai', niveauLibelle: libelleNiveau(c.niveau), oosR: c.oosR ?? null, oosN: c.oosN ?? null, pause: etat.pauses[cleConfig(c)] || null }));
    const parCle = {}; for (const x of etat.signaux) { const k = x.cle; (parCle[k] = parCle[k] || { en_attente: 0, ouverte: 0, terminee: 0, annulee: 0 })[x.statut]++; }
    const rejoueStats = rejoue ? { configs: rejoue.configs.map(c => ({ cle: c.cle, stats: { n: c.stats.n, rMoyen: c.stats.rMoyen, tauxReussite: c.stats.tauxReussite, ic95: c.stats.ic95, drawdownR: c.stats.drawdownR, trimestres: c.stats.trimestres }, parActif: Object.fromEntries(Object.entries(c.parActif).map(([k, v]) => [k, { n: v.n, rMoyen: v.rMoyen, tauxReussite: v.tauxReussite }])) })), portefeuille: { ...rejoue.portefeuille, courbe: sousEchantillon(rejoue.portefeuille.courbe, 100) }, couvertures: rejoue.couvertures, calculeLe: rejoue.t } : null;
    const nbJoursCarnet = (() => { const e = lireJson(path.join(dossier, 'flux', 'etat-flux.json'), null); const p = e && e.premierEnregistrement && e.premierEnregistrement['binance-spot-BTC']; return p ? +((t - p) / JOUR).toFixed(2) : null; })();
    const semaine = pf.semaineUsd;
    return {
      schema: 1, t, avertissement: AVERTISSEMENT, demarreLe: etat.demarreLe, derniereBarre: dernieres, carnetJours: nbJoursCarnet, couvertureDirect, nonSuivis: { ...manques }, configs,
      portefeuille: { capital0: pf.capital0, capital: +pf.capital.toFixed(2), gainUsd: +pf.gainUsd.toFixed(2), gainPct: +pf.gainPct.toFixed(2), drawdownMaxPct: +pf.drawdownMaxPct.toFixed(2), nTrades: pf.nTrades, tauxReussite: pf.tauxReussite, rMoyen: pf.rMoyen, semaineUsd: +semaine.toFixed(2), courbe: sousEchantillon(pf.courbe, 100), parStrategie: pf.parStrategie, risquePct: reg.risquePct, risqueAConfirmer: true, etiquette: 'SIMULÉ en direct' },
      rejoue: rejoueStats,
      compteurs: parCle,
      actifs: actifsVue,
      recherche: r && { t: r.t, nEssais: r.nEssais, couvertures: r.couvertures, couts: r.couts, finalistes: (r.finalistes || []).slice(0, 8).map(f => ({ id: f.id.split('@')[0], setup: f.setup, tf: f.tf, params: f.params, appr: { n: f.appr.n, rMoyen: f.appr.rMoyen }, valid: { n: f.valid.n, rMoyen: f.valid.rMoyen }, test: { n: f.test.n, rMoyen: f.test.rMoyen }, oos: { n: f.oos.n, rMoyen: f.oos.rMoyen, ic95: f.oos.ic95, tauxReussite: f.oos.tauxReussite, partTrimestresPositifs: f.oos.partTrimestresPositifs }, niveau: f.etiquette.niveau, manque: f.etiquette.manque, parSemaineActif: f.parSemaineActif, hasard: f.hasardPool.rMoyen, parActif: Object.fromEntries(Object.entries(f.parActif).map(([k, v]) => [k, { n: v.n, rMoyen: v.rMoyen }])) })) },
      verdict: verdict(r, meilleur),
    };
  }
  function verdict(r, meilleur) {
    if (!r) return { niveau: 'aucune', texte: 'Recherche pas encore faite : le service la lance une fois par jour.' };
    const niv = meilleur ? meilleur.etiquette.niveau : 'aucune';
    if (niv === 'validee') return { niveau: 'validee', texte: 'Stratégie validée : ' + SETUPS_VOLUME[meilleur.setup].nom + ' (' + meilleur.tf + '), R moyen ' + meilleur.oos.rMoyen.toFixed(2) + ' après frais sur ' + meilleur.oos.n + ' trades hors apprentissage.' };
    if (!meilleur) return { niveau: 'aucune', texte: 'Aucune stratégie validée. Aucune variante n’est restée positive à l’apprentissage.' };
    return { niveau: niv, texte: 'Aucune stratégie validée. Meilleure piste : ' + SETUPS_VOLUME[meilleur.setup].nom + ' (' + meilleur.tf + '), niveau ' + libelleNiveau(niv) + ', R moyen ' + meilleur.oos.rMoyen.toFixed(2) + ' après frais sur ' + meilleur.oos.n + ' trades hors apprentissage. Il manque : ' + (meilleur.etiquette.manque.join(' ; ') || 'rien de mesuré') + '.' };
  }

  /* Une fois par jour : complète l'historique exact (fichiers de data.binance.vision, publiés avec ≈ 2 jours de retard) pour le mois en cours ; processus séparé, priorité basse. */
  function rafraichirHistorique(t) {
    if (t - (etat.dernierTelechargement || 0) < JOUR) return false; etat.dernierTelechargement = t;
    try {
      const d = new Date(t - 3 * JOUR), depuis = d.toISOString().slice(0, 7), script = fileURLToPath(new URL('./flux/historique-trades.mjs', import.meta.url));
      const enfant = spawn(process.execPath, [script, '--actifs', actifs.join(','), '--marches', 'spot', '--depuis', depuis], { detached: true, stdio: 'ignore', windowsHide: true }); enfant.unref(); journal('volume', 'Historique des transactions : mise à jour lancée (depuis ' + depuis + ').'); return true;
    } catch (e) { erreur('volume V14 : téléchargement', e); return false; }
  }
  async function cycle({ force = false } = {}) {
    const t = maintenant(), cleBarre = Math.floor(t / MS15);
    if (!force && cache && cache.cleBarre === cleBarre && t - etat.dernierCalcul < 5 * 60e3) return { ok: true, saute: true };
    try {
      if (t - (etat.derniereRecherche || 0) > JOUR) { etat.derniereRecherche = t; try { const r = lancerRecherche({ dossier, actifs }); journal('volume', r.ok ? 'Recherche V14 refaite : ' + r.nEssais + ' variantes, ' + r.configs.length + ' setup(s) suivis.' : 'Recherche V14 impossible : ' + r.raison); } catch (e) { erreur('volume V14 : recherche', e); } }
      if (!force) rafraichirHistorique(t);
      const series = chargerSeries(t); if (!Object.keys(series).length) { etat.vuePubliee = { schema: 1, t, indisponible: 'Aucun historique de transactions installé (node agent-pc/flux/historique-trades.mjs).' }; ecrireJson(fichier, etat, { copies: 1 }); return { ok: false }; }
      cache = { cleBarre, series }; const n = detecter(series, t); suivre(series); etat.dernierCalcul = t; etat.vuePubliee = vue(series);
      ecrireJson(fichier, etat, { copies: 1 }); if (n) journal('volume', n + ' nouvelle(s) proposition(s) de volume.'); return { ok: true, nouvelles: n };
    } catch (e) { erreur('volume V14', e); return { ok: false, erreur: String(e.message || e) }; }
  }
  return { cycle, etat: () => etat, vue: () => etat.vuePubliee, detecter, suivre, vueDe: vue, reglerRisques };
}

/* Version COMPACTE de la vue pour le téléphone (paquet publié vers le Worker, ≤ 300 Ko pour tout le paquet) : moins de bougies, pas d'empreinte détaillée. */
export function compacterVolume(vue) {
  if (!vue || vue.indisponible) return vue || null;
  const actifs = {};
  for (const [a, x] of Object.entries(vue.actifs || {})) actifs[a] = { actif: a, m15: x.m15 && { ...x.m15, bougies: x.m15.bougies.slice(-64), cvd: x.m15.cvd.slice(-64) }, h1: x.h1 && { ...x.h1, bougies: x.h1.bougies.slice(-72), cvd: x.h1.cvd.slice(-72) }, profil: x.profil, positions: (x.positions || []).slice(-12), rejoue: (x.rejoue || []).slice(-25), footprint: (x.footprint || []).slice(-3), approximatif: x.approximatif };
  const p = vue.portefeuille ? { ...vue.portefeuille, courbe: vue.portefeuille.courbe.slice(-60) } : null;
  const rj = vue.rejoue ? { ...vue.rejoue, portefeuille: vue.rejoue.portefeuille && { ...vue.rejoue.portefeuille, courbe: vue.rejoue.portefeuille.courbe.slice(-60) } } : null;
  return { ...vue, actifs, portefeuille: p, rejoue: rj, recherche: vue.recherche && { ...vue.recherche, finalistes: (vue.recherche.finalistes || []).slice(0, 3) } };
}
