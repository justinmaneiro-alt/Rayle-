/* Backtest HONNÊTE des flèches Daily : trois méthodes simples, 10 ans de bougies Daily, partie d'apprentissage / partie HORS ÉCHANTILLON.
   Usage : node trader-pro/terminal/backtest-fleches.mjs <dossier-instantanés> [sortie.json] [rapport.md]
   Protocole (écrit avant la mesure) :
   1. Vérité : zigzag après coup, seuil = 6 × l'ATR 14 médian en % de l'actif (≈ 6-9 % sur l'or, ≈ 9 % sur le Nasdaq, ≈ 20 % sur le Bitcoin) ; un retournement est « majeur » si le prix repart de ce seuil.
   2. Une flèche est BONNE si elle tombe de 0 à 15 bougies après un sommet / creux majeur (un pivot ne sert qu'une fois : les doublons sont des fausses flèches).
   3. Chaque méthode a une grille de 6 réglages fixée d'avance (fleches-daily.js). Le réglage est choisi sur la période d'APPRENTISSAGE (60 % les plus anciens du jeu) pour l'or ET le Nasdaq 100 ensemble :
      meilleur F1 (précision × rappel) avec entre 1 et 6 flèches par trimestre et par actif. La période suivante (40 %) n'est regardée qu'APRÈS, avec le réglage déjà figé. Le Bitcoin sert de contrôle.
   4. Comparaison au hasard : 400 tirages de flèches posées au hasard, mêmes nombres, mêmes sens. Verdict « convaincant » seulement si, hors échantillon sur or + Nasdaq 100 : précision ≥ 50 %, rappel ≥ 40 %
      et p < 0,05 contre le hasard. Sinon le rapport le dit. Aucune donnée n'est inventée ; bougies = Yahoo Finance via le robot (futures GC=F pour l'or). */
import fs from 'node:fs'; import path from 'node:path';
import { METHODES, indicateurs, calculer, cloturees } from './fleches-daily.js';
import { zigzag, evaluer, comparerHasard, atrPctMedian, trimestres } from './fleches-eval.js';

const dossier = process.argv[2] || '.', here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const sortie = process.argv[3] || path.join(here, 'backtest-fleches.json'), rapportMd = process.argv[4] || path.join(here, 'BACKTEST-FLECHES.md');
const lire = nom => JSON.parse(fs.readFileSync(path.join(dossier, nom), 'utf8')).b.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v: v || 0 })).filter(x => x.c > 0 && x.h >= x.l && x.o > 0);
const ACTIFS = [{ id: 'or', nom: 'Or (futures GC=F)', f: 'bougies-GC_F-1d.json', appr: true }, { id: 'us100', nom: 'Nasdaq 100', f: 'bougies-_NDX-1d.json', appr: true }, { id: 'btc', nom: 'Bitcoin', f: 'bougies-BTC_USD-1d.json', appr: false }];
const M_SEUIL = 6, LMAX = 15, PART_APPR = 0.6, MIN_TRI = 1, MAX_TRI = 6;
const pct = (v, d = 0) => (v == null ? '—' : (v * 100).toFixed(d) + ' %'), nb = (v, d = 1) => (v == null ? '—' : v.toFixed(d).replace('.', ','));
const iso = t => new Date(t).toISOString().slice(0, 10);

/* préparation : bougies clôturées, indicateurs sur TOUT l'historique (causaux), pivots majeurs, découpage */
const donnees = {};
for (const a of ACTIFS) {
  const B = cloturees(lire(a.f), Date.now()), ind = indicateurs(B), seuil = M_SEUIL * atrPctMedian(B), cut = Math.floor(B.length * PART_APPR);
  donnees[a.id] = { ...a, B, ind, seuil, pivots: zigzag(B, seuil), cut, tCut: B[cut].t };
}
const portion = (d, zone) => { const [a, b] = zone === 'appr' ? [0, d.cut] : zone === 'oos' ? [d.cut, d.B.length] : [0, d.B.length]; return { a, b }; };
/* évalue des flèches (indices globaux) sur une zone ; les pivots et flèches de la zone seulement */
function evalZone(d, fleches, zone) {
  const { a, b } = portion(d, zone), F = fleches.filter(f => f.i >= a && f.i < b).map(f => ({ ...f, i: f.i - a })), P = d.pivots.filter(p => p.i >= a && p.i < b).map(p => ({ ...p, i: p.i - a })), Bz = d.B.slice(a, b);
  const r = evaluer(Bz, F, P, { lmax: LMAX }); r.trimestres = trimestres(Bz); r.parTrimestre = r.n / r.trimestres; r.debut = iso(Bz[0].t); r.fin = iso(Bz[Bz.length - 1].t); return { r, Bz, F, P };
}
const poolé = L => { const s = k => L.reduce((x, r) => x + (r[k] || 0), 0), n = s('n'), bonnes = s('bonnes'), maj = s('majeurs'), cou = s('couverts'), p = n ? bonnes / n : 0, ra = maj ? cou / maj : 0; return { n, bonnes, majeurs: maj, couverts: cou, precision: n ? p : null, rappel: maj ? ra : null, f1: p + ra ? 2 * p * ra / (p + ra) : 0, parTrimestre: L.length ? L.reduce((x, r) => x + r.parTrimestre, 0) / L.length : 0 }; };

const resultat = { genere: new Date().toISOString(), protocole: { seuilMajeur: M_SEUIL + ' × ATR 14 médian en %', delaiMaxBonneFleche: LMAX + ' bougies', apprentissage: Math.round(PART_APPR * 100) + ' % les plus anciens', flechesParTrimestre: [MIN_TRI, MAX_TRI] }, actifs: {}, methodes: {} };
for (const a of ACTIFS) { const d = donnees[a.id]; resultat.actifs[a.id] = { nom: a.nom, debut: iso(d.B[0].t), fin: iso(d.B[d.B.length - 1].t), bougies: d.B.length, coupure: iso(d.tCut), seuilMajeurPct: +(d.seuil * 100).toFixed(1), pivotsMajeurs: d.pivots.length, pivotsParAn: +(d.pivots.length / (d.B.length / 252)).toFixed(1) }; }

for (const [cle, M] of Object.entries(METHODES)) {
  const essais = M.grille.map(params => {
    const parActif = {}; for (const a of ACTIFS) { const d = donnees[a.id]; parActif[a.id] = calculer(d.B, cle, params, d.ind); }
    const appr = ACTIFS.filter(a => a.appr).map(a => evalZone(donnees[a.id], parActif[a.id], 'appr').r), P = poolé(appr);
    const ok = appr.every(r => r.parTrimestre >= MIN_TRI && r.parTrimestre <= MAX_TRI);
    return { params, parActif, apprPool: P, ok, apprParActif: Object.fromEntries(ACTIFS.filter(a => a.appr).map((a, i) => [a.id, appr[i]])) };
  });
  const eligibles = essais.filter(e => e.ok).sort((x, y) => y.apprPool.f1 - x.apprPool.f1), choisi = eligibles[0] || essais.sort((x, y) => y.apprPool.f1 - x.apprPool.f1)[0];
  const oos = {}, tout = {};
  for (const a of ACTIFS) {
    const d = donnees[a.id], z = evalZone(d, choisi.parActif[a.id], 'oos'), t = evalZone(d, choisi.parActif[a.id], 'tout'), h = comparerHasard(z.Bz, z.F, z.P, { lmax: LMAX });
    oos[a.id] = { ...z.r, pHasard: h.p, precisionHasard: h.precisionHasard }; tout[a.id] = t.r;
  }
  const oosPool = poolé(ACTIFS.filter(a => a.appr).map(a => oos[a.id]));
  const pMax = Math.max(...ACTIFS.filter(a => a.appr).map(a => oos[a.id].pHasard ?? 1));
  const convaincante = !!(eligibles.length && oosPool.precision >= 0.5 && oosPool.rappel >= 0.4 && pMax < 0.05);
  resultat.methodes[cle] = { nom: M.nom, court: M.court, reglageChoisi: choisi.params, reglageRespecteFrequence: !!eligibles.length,
    grille: essais.map(e => ({ params: e.params, ok: e.ok, f1: +e.apprPool.f1.toFixed(3), precision: e.apprPool.precision == null ? null : +e.apprPool.precision.toFixed(3), rappel: e.apprPool.rappel == null ? null : +e.apprPool.rappel.toFixed(3), parTrimestre: +e.apprPool.parTrimestre.toFixed(2) })),
    apprentissage: { pool: choisi.apprPool, parActif: choisi.apprParActif }, horsEchantillon: { pool: oosPool, parActif: oos, pHasardMax: pMax }, toutePeriode: tout, convaincante };
}
/* méthode retenue = meilleur F1 d'APPRENTISSAGE parmi celles qui respectent la fréquence */
const cands = Object.entries(resultat.methodes).filter(([, m]) => m.reglageRespecteFrequence).sort((a, b) => b[1].apprentissage.pool.f1 - a[1].apprentissage.pool.f1);
resultat.retenue = cands.length ? cands[0][0] : null;
resultat.verdict = !resultat.retenue ? { niveau: 'aucune', texte: 'Aucune méthode ne respecte la fréquence demandée (1 à 6 flèches par trimestre et par actif).' }
  : resultat.methodes[resultat.retenue].convaincante ? (() => { const m = resultat.methodes[resultat.retenue], o = m.horsEchantillon, os = o.parActif, dec = ['or', 'us100'].map(i => os[i].decalageMoyenJours), v20 = ['or', 'us100'].map(i => os[i].mouvement20jPct);
    return { niveau: 'convaincante', texte: `La méthode retenue (${m.court}) repère les gros retournements nettement mieux que le hasard hors échantillon (précision ${pct(o.pool.precision)}, rappel ${pct(o.pool.rappel)}), avec un décalage moyen de ${nb((dec[0] + dec[1]) / 2)} jours : la flèche confirme un retournement DÉJÀ amorcé. Ce n'est pas un signal de trading rentable à lui seul : dans les 20 jours qui suivent, le prix évolue en moyenne de ${nb(v20[0])} % (or) et ${nb(v20[1])} % (Nasdaq 100) dans le sens de la flèche. Sur le Bitcoin (contrôle), seules ${pct(os.btc.precision)} des flèches sont bonnes.` }; })()
  : { niveau: 'non convaincante', texte: 'AUCUNE méthode n\'est convaincante hors échantillon (précision ≥ 50 %, rappel ≥ 40 % et p < 0,05 contre le hasard exigés). La meilleure est affichée à titre indicatif ; ses flèches ne sont PAS des signaux fiables.' };
fs.writeFileSync(sortie, JSON.stringify(resultat, null, 1));

/* rapport lisible */
const L = []; const R = resultat;
L.push('# Backtest des flèches Daily (retournements des gros mouvements)', '', 'Généré par `node trader-pro/terminal/backtest-fleches.mjs` le ' + R.genere.slice(0, 10) + '. Données : bougies Daily Yahoo Finance du robot (futures GC=F pour l\'or). Rien n\'est inventé.', '',
  '## Protocole (fixé avant la mesure)', '- **Vérité** : zigzag vu après coup ; un sommet / creux est « majeur » si le prix repart d\'au moins ' + R.protocole.seuilMajeur + ' (comparable entre actifs).',
  '- **Bonne flèche** : tombe de 0 à ' + LMAX + ' bougies après un sommet (flèche rouge) ou un creux (flèche verte) majeur ; un pivot ne sert qu\'une fois, les doublons sont comptés faux.',
  '- **Causalité** : la flèche du jour i n\'utilise que les bougies jusqu\'à i ; elle apparaît à la clôture de la bougie qui confirme et ne bouge plus (testé : tronquer l\'historique ne change aucune flèche passée). Seules des différences de prix et des multiples d\'ATR sont utilisés : un recalage constant de l\'historique ne change rien.',
  '- **Réglage** : 6 réglages fixés d\'avance par méthode, choisis sur ' + R.protocole.apprentissage + ' de l\'or et du Nasdaq 100 (meilleur F1 avec 1 à 6 flèches par trimestre et par actif), puis figés ; la période suivante (hors échantillon) n\'est regardée qu\'après. Bitcoin = contrôle.',
  '- **Hasard** : 400 tirages de flèches aléatoires, mêmes nombres et mêmes sens.', '', '## Données');
for (const [id, a] of Object.entries(R.actifs)) L.push(`- ${a.nom} : ${a.debut} → ${a.fin} (${a.bougies} bougies), coupure apprentissage / hors échantillon le ${a.coupure}, seuil majeur ${nb(a.seuilMajeurPct)} %, ${a.pivotsMajeurs} retournements majeurs (${nb(a.pivotsParAn)} par an).`);
L.push('', '## Résultats par méthode (hors échantillon = après la coupure)', '', '| Méthode | Réglage retenu | Flèches / trim. | Bonnes | Rappel (gros mouvements captés) | Décalage moyen | Mouvement moyen capté | Pire fausse flèche | p contre le hasard |', '|---|---|---|---|---|---|---|---|---|');
for (const [cle, m] of Object.entries(R.methodes)) {
  const o = m.horsEchantillon.pool, os = m.horsEchantillon.parActif; const dec = ['or', 'us100'].map(i => os[i].decalageMoyenJours).filter(Number.isFinite), cap = ['or', 'us100'].map(i => os[i].mouvementCaptePct).filter(Number.isFinite), pire = Math.max(...['or', 'us100'].map(i => os[i].pireFausseAdversePct ?? 0));
  L.push(`| ${cle === R.retenue ? '**' : ''}${m.court}${cle === R.retenue ? '** (retenue)' : ''} | ${JSON.stringify(m.reglageChoisi)} | ${nb(o.parTrimestre)} | ${pct(o.precision)} (${o.bonnes}/${o.n}) | ${pct(o.rappel)} (${o.couverts}/${o.majeurs}) | ${nb(dec.length ? dec.reduce((a, b) => a + b, 0) / dec.length : null)} j | ${nb(cap.length ? cap.reduce((a, b) => a + b, 0) / cap.length : null)} % | ${nb(pire)} % | ${nb(m.horsEchantillon.pHasardMax, 3)} |`);
}
L.push('', '## Détail par actif pour chaque méthode (hors échantillon)', '');
for (const [cle, m] of Object.entries(R.methodes)) {
  L.push('### ' + m.court + (cle === R.retenue ? ' : RETENUE' : ''), '', 'Apprentissage (or + Nasdaq 100) : F1 ' + nb(m.apprentissage.pool.f1, 2) + ', précision ' + pct(m.apprentissage.pool.precision) + ', rappel ' + pct(m.apprentissage.pool.rappel) + (m.reglageRespecteFrequence ? '' : ' ; ATTENTION : aucun réglage ne respectait la fréquence demandée') + '.', '', '| Actif | Période | Flèches | Par trimestre | Bonnes | Gros mouvements captés | Décalage | Mouvement capté | Mouvement à 20 j | Pire fausse | Précision du hasard | p |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const a of ACTIFS) { const r = m.horsEchantillon.parActif[a.id]; L.push(`| ${a.nom}${a.appr ? '' : ' (contrôle)'} | ${r.debut} → ${r.fin} | ${r.n} | ${nb(r.parTrimestre)} | ${pct(r.precision)} (${r.bonnes}/${r.n}) | ${pct(r.rappel)} (${r.couverts}/${r.majeurs}) | ${nb(r.decalageMoyenJours)} j | ${nb(r.mouvementCaptePct)} % | ${nb(r.mouvement20jPct)} % | ${nb(r.pireFausseAdversePct)} % | ${pct(r.precisionHasard)} | ${nb(r.pHasard, 3)} |`); }
  L.push('');
}
L.push('## Verdict', '', '**' + R.verdict.texte + '**', '', 'Définitions : *rappel* = part des gros retournements qui ont une flèche dans les ' + LMAX + ' jours qui suivent ; *mouvement capté* = de la clôture de la flèche jusqu\'au retournement majeur suivant (idéal, sans coûts) ; *pire fausse flèche* = plus grande poussée contre la flèche dans les 30 jours (hors flèches bonnes). Un backtest ne garantit pas l\'avenir.');
fs.writeFileSync(rapportMd, L.join('\n') + '\n');
console.log(L.join('\n'));
