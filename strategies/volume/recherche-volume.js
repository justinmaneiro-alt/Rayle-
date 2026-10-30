/* ═════════════ RECHERCHE DE STRATÉGIE SUR LES VRAIS INDICATEURS DE VOLUME (V14, phase 5 ; module pur, testé) ═════════════
   Méthode anti-hasard : petites grilles justifiées (chaque variante comptée), découpage chronologique apprentissage / validation / TEST (le test n'est ouvert que pour les finalistes, une fois),
   mêmes paramètres sur tous les actifs, frais réalistes, régularité par trimestre, comparaison à des entrées au hasard de même fréquence, correction du nombre d'essais (Bonferroni).
   Les critères de validation (criteres-v3 / v4) ne sont pas lus ici : l'étiquette A l'essai / Candidate / Validée vient des seuils de Justin (V14) et ne bloque JAMAIS le suivi virtuel. */
import { DETECTEURS, GRILLES, combinaisons, cleSignal, contexteFiltres, FILTRES_NOMS } from './setups-volume.js';
import { simulerTout, simulerSignal, stats, decouper, dans } from './simulation-volume.js';

/* Quantile normal (Acklam, assez précis pour une correction d'essais). */
export function zNormal(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771908, -13.28068155288572],
    c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425; let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
export const zEssais = nEssais => zNormal(1 - 0.05 / Math.max(1, nEssais));               // seuil unilatéral corrigé par le nombre d'essais

export const SEUILS = Object.freeze({ candidate: { rMoyen: 0.08, n: 100 }, validee: { rMoyen: 0.12, icBasse: 0, trimestresMin: 3, partTrimestres: 0.6, actifsPositifsMin: 2 }, objectifPropsSemaine: [3, 10] });

/* Étiquette d'après les trades HORS apprentissage (validation + test), tous actifs réunis. */
export function etiqueter({ oos, parActif, nEssais }) {
  const s = oos, z = zEssais(nEssais), es = s.n > 1 ? (s.ic95[1] - s.ic95[0]) / (2 * 1.96) : Infinity, corrigeOk = s.n > 1 && s.rMoyen - z * es > 0;
  const actifsPos = Object.values(parActif).filter(x => x.n >= 10 && x.rMoyen > 0).length;
  const candidate = s.n >= SEUILS.candidate.n && s.rMoyen >= SEUILS.candidate.rMoyen;
  const validee = candidate && s.rMoyen >= SEUILS.validee.rMoyen && s.ic95[0] > SEUILS.validee.icBasse && s.nTrimestres >= SEUILS.validee.trimestresMin && s.partTrimestresPositifs >= SEUILS.validee.partTrimestres && actifsPos >= SEUILS.validee.actifsPositifsMin;
  const niveau = validee ? 'validee' : candidate ? 'candidate' : 'a_lessai';
  const manque = [];
  if (!(s.n >= SEUILS.candidate.n)) manque.push('au moins ' + SEUILS.candidate.n + ' trades hors apprentissage (il y en a ' + s.n + ')');
  if (!(s.rMoyen >= SEUILS.candidate.rMoyen)) manque.push('un R moyen d’au moins +' + SEUILS.candidate.rMoyen + ' après frais (mesuré ' + s.rMoyen.toFixed(3) + ')');
  if (candidate && !(s.rMoyen >= SEUILS.validee.rMoyen)) manque.push('+' + SEUILS.validee.rMoyen + ' R pour être Validée');
  if (candidate && !(s.ic95[0] > 0)) manque.push('une borne basse de l’intervalle à 95 % au-dessus de 0 (' + s.ic95[0].toFixed(3) + ')');
  if (candidate && !(s.partTrimestresPositifs >= SEUILS.validee.partTrimestres)) manque.push('au moins 60 % de trimestres positifs (' + Math.round(s.partTrimestresPositifs * 100) + ' %)');
  if (candidate && actifsPos < SEUILS.validee.actifsPositifsMin) manque.push('positif sur au moins 2 actifs (' + actifsPos + ')');
  return { niveau, corrigeOk, zEssais: z, manque };
}

/* Entrées au HASARD de même fréquence et mêmes règles de sortie, pour savoir ce que valent les frais et le risque seuls. Générateur déterministe (graine fixe). */
export function hasard(s, { n, rr = 2, riskAtr = 1, validite = 4, couts, graine = 12345, debutI = 200 }) {
  let x = graine >>> 0; const alea = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  const sigs = []; for (let k = 0; k < n * 3; k++) { const i = debutI + Math.floor(alea() * (s.nBarres - debutI - 60)), sens = alea() < 0.5 ? 1 : -1, c = s.c[i], r = riskAtr * s.atr[i]; if (!(r > 0)) continue; sigs.push({ i, sens, niveau: c, stop: sens > 0 ? c - r : c + r, rr, validite, setup: 'hasard' }); }
  sigs.sort((a, b) => a.i - b.i); const tr = []; let dernier = -1;
  for (const sg of sigs) { if (sg.i <= dernier) continue; const t = simulerSignal(s, sg, couts); if (!t) continue; tr.push(t); dernier = t.iSortie != null ? t.iSortie : sg.i + 1e9; if (tr.length >= n) break; }
  return tr;
}

/* Évalue UNE variante sur une série d'actifs { BTC: {m15,h1}, … } : retourne les trades par actif. */
export function evaluerVariante(series, setup, params, tf, couts) {
  const par = {}; let signauxTotal = 0, nonRemplis = 0;
  for (const [actif, S] of Object.entries(series)) {
    const s = tf === 'H1' ? S.h1 : S.m15, sigs = DETECTEURS[setup](s, params), r = simulerTout(s, sigs, couts, { maxBarres: tf === 'H1' ? 24 : 48 });
    const cle = cleSignal(setup, params) + '|' + tf; for (const t of r.trades) { t.actif = actif; t.cle = setup + '·' + tf; t.cleVariante = cle; }
    par[actif] = r.trades; signauxTotal += r.signaux; nonRemplis += r.nonRemplis;
  }
  return { par, signaux: signauxTotal, nonRemplis };
}

export function bornesTemps(series) { let a = Infinity, b = -Infinity; for (const S of Object.values(series)) { a = Math.min(a, S.m15.t[0]); b = Math.max(b, S.m15.t[S.m15.nBarres - 1]); } return [a, b]; }
const tousTrades = par => Object.values(par).flat();


/* Recherche complète. `coffre` = { id → résultat du test } : un finaliste dont le test a déjà été ouvert n'est JAMAIS recalculé différemment (on relit le coffre). */
export function rechercher({ series, couts, setups = Object.keys(GRILLES), tfs = ['M15', 'H1'], parts = [0.5, 0.25, 0.25], coffre = {}, finalistesParSetup = 2, minTradesAppr = 40, surProgres = null }) {
  const [tMin, tMax] = bornesTemps(series), Z = decouper(tMin, tMax, parts), variantes = []; let nEssais = 0;
  const Zs = {}; for (const [a, S] of Object.entries(series)) Zs[a] = decouper(S.m15.t[0], S.m15.t[S.m15.nBarres - 1], parts);      // chaque actif est découpé dans SA période (BTC peut avoir une autre fenêtre)
  const zone = nom => t => dans(t.tEntree, Zs[t.actif][nom]);
  for (const setup of setups) for (const tf of tfs) for (const params of combinaisons(GRILLES[setup])) {
    nEssais++; const ev = evaluerVariante(series, setup, params, tf, couts), tout = tousTrades(ev.par);
    const sa = stats(tout.filter(zone('appr'))), sv = stats(tout.filter(zone('valid')));
    variantes.push({ id: setup + '|' + tf + '|' + JSON.stringify(params), setup, tf, params, ev, appr: sa, valid: sv, signaux: ev.signaux, nonRemplis: ev.nonRemplis });
    if (surProgres) surProgres(nEssais);
  }
  const empreinteDonnees = Object.entries(series).map(([a, S]) => a + ':' + S.m15.t[0] + '-' + S.m15.t[S.m15.nBarres - 1]).join(',');
  const semaines = (tMax - tMin) / (7 * 86400e3), nActifs = Object.keys(series).length;
  // sélection : positive à l'apprentissage, classée sur la validation (jamais sur le test)
  const ok = variantes.filter(v => v.appr.n >= minTradesAppr && v.appr.rMoyen > 0).sort((a, b) => b.valid.rMoyen - a.valid.rMoyen);
  const finalistes = [], vus = new Map();
  const signature = new Set();
  for (const v of ok) { const sg = v.setup + v.tf + '|' + v.appr.n + '|' + v.valid.n + '|' + v.appr.totalR.toFixed(4) + '|' + v.valid.totalR.toFixed(4); if (signature.has(sg)) continue; signature.add(sg); if ((vus.get(v.setup) || 0) >= finalistesParSetup) continue; vus.set(v.setup, (vus.get(v.setup) || 0) + 1); finalistes.push(v); }
  for (const v of finalistes) {
    const tout = tousTrades(v.ev.par), test = stats(tout.filter(zone('test'))), oosTr = tout.filter(t => !dans(t.tEntree, Zs[t.actif].appr)), oos = stats(oosTr);
    const parActif = {}; for (const [a, tr] of Object.entries(v.ev.par)) parActif[a] = stats(tr.filter(t => !dans(t.tEntree, Zs[a].appr)));
    const id = v.id + '@' + empreinteDonnees, deja = coffre[id];
    v.test = deja ? deja.test : test; v.testDejaOuvert = !!deja; v.oos = oos; v.parActif = parActif;
    v.etiquette = etiqueter({ oos, parActif, nEssais });
    v.parSemaineActif = (v.ev.signaux - v.ev.nonRemplis) / semaines / nActifs;
    v.hasard = {}; for (const [a, S] of Object.entries(series)) { const s = v.tf === 'H1' ? S.h1 : S.m15, n = Math.max(30, (v.ev.par[a] || []).length); v.hasard[a] = stats(hasard(s, { n, rr: v.params.rr || 2, couts })); }
    v.hasardPool = stats(Object.values(v.hasard).length ? Object.entries(series).flatMap(([a, S]) => hasard(S[v.tf === 'H1' ? 'h1' : 'm15'], { n: Math.max(30, (v.ev.par[a] || []).length), rr: v.params.rr || 2, couts })) : []);
    if (!deja) coffre[id] = { test, ouvertLe: Date.now(), nEssais };
  }
  finalistes.sort((a, b) => b.oos.rMoyen - a.oos.rMoyen);
  return { tMin, tMax, zones: Z, nEssais, semaines, finalistes, variantes, coffre };
}

/* ── Entonnoir (phase 0 bis) : combien de signaux chaque filtre ÉLIMINE, et ce que valaient les éliminés ── */
export function entonnoir({ series, couts, reglages }) {
  const lignes = [];
  for (const { setup, tf, params } of reglages) {
    const brut = []; // tous les signaux simulés (sans exclure les recouvrements pour juger les filtres)
    for (const [actif, S] of Object.entries(series)) {
      const s = tf === 'H1' ? S.h1 : S.m15, sigs = DETECTEURS[setup](s, params), F = contexteFiltres(s);
      let dernier = -1;
      for (const sg of sigs) { if (sg.i <= dernier) continue; const t = simulerSignal(s, sg, couts, { maxBarres: tf === 'H1' ? 24 : 48 }); if (!t) continue; dernier = t.iSortie != null ? t.iSortie : sg.i + 1e9; t.actif = actif; t.f = {}; for (const [nom, fn] of Object.entries(F)) t.f[nom] = !!fn(sg); brut.push(t); }
    }
    const sem = ((S0) => { let a = Infinity, b = -Infinity; for (const S of Object.values(series)) { a = Math.min(a, S.m15.t[0]); b = Math.max(b, S.m15.t[S.m15.nBarres - 1]); } return (b - a) / (7 * 86400e3); })();
    const nAct = Object.keys(series).length, cumul = []; let reste = brut.filter(t => !t.ouvert);
    const base = stats(reste);
    const etapes = [{ filtre: 'aucun (setup à 3 conditions)', gardes: reste, elimines: [] }];
    for (const nom of Object.keys(FILTRES_NOMS)) { const g = reste.filter(t => t.f[nom]), e = reste.filter(t => !t.f[nom]); reste = g; etapes.push({ filtre: FILTRES_NOMS[nom], gardes: g, elimines: e }); }
    const seul = {}; for (const nom of Object.keys(FILTRES_NOMS)) { const all = brut.filter(t => !t.ouvert); seul[nom] = { gardes: stats(all.filter(t => t.f[nom])), elimines: stats(all.filter(t => !t.f[nom])) }; }
    lignes.push({ setup, tf, params, signauxSimules: brut.length, parSemaineActifSansFiltre: base.n / sem / nAct, base,
      cumule: etapes.map(e => ({ filtre: e.filtre, restants: e.gardes.length, parSemaineActif: e.gardes.length / sem / nAct, rMoyen: stats(e.gardes).rMoyen, elimines: e.elimines.length, rMoyenElimines: e.elimines.length ? stats(e.elimines).rMoyen : null })),
      isole: Object.fromEntries(Object.entries(seul).map(([k, v]) => [k, { nom: FILTRES_NOMS[k], gardes: v.gardes.n, rMoyenGardes: v.gardes.rMoyen, elimines: v.elimines.n, rMoyenElimines: v.elimines.rMoyen, partCoupee: (v.gardes.n + v.elimines.n) ? v.elimines.n / (v.gardes.n + v.elimines.n) : 0 }])) });
  }
  return lignes;
}
