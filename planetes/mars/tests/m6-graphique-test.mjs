// M6 partie 3 : « Chart State API » (lecture du graphique), dessins de l'agent et de l'utilisateur, causalité des indicateurs, « tester ma zone », explication d'une bougie, rejeu.
// Lancer :  node planetes/mars/tests/m6-graphique-test.mjs
import { creerDessins, validerDessin, lireTemps, TYPES_DESSIN } from '../pc/agent-m6/dessins.js';
import { CATALOGUE_INDICATEURS, parserIndicateur, calculerIndicateur, lireGraphique, valeursA, niveauxA, scorePine, resumeEtat } from '../pc/agent-m6/chart-etat.js';
import { colonne, volumeNet } from '../pc/trading/dashboard.js';
import { ema, rsi, sma, atr as atrB, macd as macdB, bollinger as bollB, vwap as vwapB } from '../pc/trading/indicateurs.js';
import { versBougies, tranche } from '../pc/agent-btc/colonnes.js';
import { verifierColonnes } from '../pc/agent-m6/causalite.js';
import { testerZone, explicationZone } from '../pc/agent-m6/zone-test.js';
import { expliquerBougie, formeBougie } from '../pc/agent-m6/bougie.js';
import { creerRejeu, fenetreTrade } from '../pc/agent-m6/rejeu.js';
import { depuisBougies } from '../pc/agent-btc/colonnes.js';
import { marcheMixte } from './synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, e = 1e-9) => Math.abs(a - b) <= e * Math.max(1, Math.abs(a), Math.abs(b));

const M = marcheMixte(3000, 6), B = versBougies(M).map(b => ({ ...b })), prixRef = B[B.length - 1].c;

// ── dessins : validation ──
{
  const ctx = { prixRef, tMin: B[0].t, maintenant: B[B.length - 1].t + 900e3 };
  const bon = validerDessin({ type: 'zone', prixHaut: prixRef * 1.01, prixBas: prixRef * 0.99, de: B[2900].t, a: B[2990].t, etiquette: 'zone test' }, ctx);
  v('zone valide acceptée, haut/bas remis dans l’ordre', bon.ok && bon.dessin.prixHaut > bon.dessin.prixBas);
  v('prix absurde refusé (facteur 100)', !validerDessin({ type: 'ligne_h', prix: prixRef * 100 }, ctx).ok);
  v('prix négatif / non numérique refusé', !validerDessin({ type: 'ligne_h', prix: -5 }, ctx).ok && !validerDessin({ type: 'ligne_h', prix: 'abc' }, ctx).ok);
  v('type inconnu refusé avec la liste des types', /permis/.test(validerDessin({ type: 'dragon' }, ctx).erreurs[0]));
  v('zone sans épaisseur refusée', !validerDessin({ type: 'zone', prixHaut: 100, prixBas: 100, de: B[10].t }, { maintenant: B[3000 - 1].t }).ok);
  v('date lointaine dans le futur refusée', !validerDessin({ type: 'marqueur', quand: Date.UTC(2099, 0, 1), prix: prixRef }, ctx).ok);
  v('trade : achat avec stop au-dessus de l’entrée refusé', !validerDessin({ type: 'trade', sens: 'achat', entree: 100, stop: 105, objectif: 110 }, { maintenant: 0 }).ok);
  const t = validerDessin({ type: 'trade', sens: 'vente', entree: prixRef, stop: prixRef * 1.02, objectif: prixRef * 0.94, quand: B[100].t, etiquette: 'S1' }, ctx); v('trade valide : R calculé = 3', t.ok && proche(t.dessin.R, 3) && t.dessin.sens === -1);
  v('étiquette sans texte refusée', !validerDessin({ type: 'etiquette', quand: B[10].t, prix: prixRef }, ctx).ok);
  v('texte nettoyé (pas de balises)', validerDessin({ type: 'etiquette', quand: B[10].t, prix: prixRef, etiquette: '<img onerror=x>Zone' }, ctx).dessin.etiquette === 'img onerror=xZone');
  v('lireTemps : ISO, ms, secondes, maintenant', lireTemps('2026-10-22T14:30') === Date.UTC(2026, 9, 22, 14, 30) && lireTemps(1700000000) === 1700000000 && lireTemps('1700000000') === 1700000000000 && lireTemps('maintenant', 42) === 42 && Number.isNaN(lireTemps('n’importe quoi')) && lireTemps('2026-10-22') === Date.UTC(2026, 9, 22));
  v('types de dessin attendus', ['zone', 'ligne_h', 'ligne', 'marqueur', 'etiquette', 'trade', 'zone_liquidite', 'poc', 'zone_valeur'].every(x => TYPES_DESSIN.includes(x)));
}
// ── dessins : magasin ──
{
  let t = 1000; const S = creerDessins({ maintenant: () => t++, max: 6, contexte: () => ({ prixRef, maintenant: B[B.length - 1].t }) });
  let notifs = 0; S.surChangement(() => notifs++);
  const a = S.ajouter({ type: 'ligne_h', prix: prixRef, etiquette: 'niveau A', groupe: 'Stratégie X', auteur: 'agent' }), b = S.ajouter({ type: 'zone', prixHaut: prixRef * 1.01, prixBas: prixRef, de: B[2000].t, groupe: 'Stratégie X' }), c = S.ajouter({ type: 'ligne_h', prix: prixRef * 0.98, groupe: 'Stratégie Y' });
  const u = S.ajouter({ type: 'ligne_h', prix: prixRef * 1.02, auteur: 'utilisateur', etiquette: 'ma ligne' });
  v('ajouts : ids distincts, notifications', a.ok && b.ok && c.ok && u.ok && new Set([a.id, b.id, c.id, u.id]).size === 4 && notifs === 4);
  v('auteur et groupe par défaut', S.trouver(u.id).auteur === 'utilisateur' && S.trouver(u.id).groupe === 'mes dessins' && S.trouver(c.id).auteur === 'agent');
  v('groupes comptés', S.groupes().find(g => g.groupe === 'Stratégie X').n === 2 && S.groupes().length === 3);
  S.masquer(a.id); v('masquer un dessin : seul celui-là', !S.trouver(a.id).visible && S.trouver(b.id).visible && S.lister({ visibles: true }).length === 3);
  S.masquerGroupe('Stratégie X'); v('masquer un groupe', S.lister({ groupe: 'Stratégie X' }).every(d => !d.visible)); S.masquerGroupe('Stratégie X', false); v('réafficher un groupe', S.lister({ groupe: 'Stratégie X' }).every(d => d.visible));
  v('filtre par auteur', S.lister({ auteur: 'utilisateur' }).length === 1 && S.lister({ auteur: 'agent' }).length === 3);
  v('dessin inconnu : erreur claire', !S.masquer('zzz').ok && !S.supprimer('zzz').ok && !S.masquerGroupe('rien').ok);
  S.ajouter({ type: 'ligne_h', prix: prixRef * 0.97 }); S.ajouter({ type: 'ligne_h', prix: prixRef * 0.96 }); const trop = S.ajouter({ type: 'ligne_h', prix: prixRef * 0.95 }); v('limite de dessins (6) respectée', !trop.ok && /trop de dessins/.test(trop.erreurs[0]));
  const rg = S.remplacerGroupe('Stratégie X', [{ type: 'ligne_h', prix: prixRef * 1.05, etiquette: 'nouveau' }]); v('remplacer un groupe : ancien contenu remplacé, rien d’autre touché', rg.ok && S.lister({ groupe: 'Stratégie X' }).length === 1 && S.lister({ groupe: 'Stratégie X' })[0].etiquette === 'nouveau' && S.lister({ groupe: 'Stratégie Y' }).length === 1 && S.lister({ auteur: 'utilisateur' }).length === 1);
  v('remplacerGroupe ne touche pas les dessins de l’utilisateur du même nom de groupe', (() => { const S2 = creerDessins({ contexte: () => ({ prixRef }) }); S2.ajouter({ type: 'ligne_h', prix: prixRef, auteur: 'utilisateur', groupe: 'G' }); S2.remplacerGroupe('G', []); return S2.lister({ auteur: 'utilisateur' }).length === 1; })());
  const exp = S.exporter(), S3 = creerDessins({ contexte: () => ({ prixRef }) }); const imp = S3.importer(exp); v('export / import : tout revient, masquage conservé', imp.ok && imp.n === S.n() && !S3.importer('pas du json').ok && !S3.importer('{"format":"autre"}').ok);
  S.supprimerGroupe('Stratégie Y'); v('supprimer un groupe', S.lister({ groupe: 'Stratégie Y' }).length === 0); v('vider seulement l’agent', S.vider('agent').ok && S.lister({ auteur: 'utilisateur' }).length === 1 && S.lister({ auteur: 'agent' }).length === 0);
}

// ── indicateurs : analyse des identifiants ──
{
  v('parser : ma200 / ema50 / rsi14 / atr14 / macd / bollinger / vwap / volume_net / delta / cvd / score', ['ma200', 'ema50', 'rsi14', 'atr14', 'macd', 'bollinger', 'vwap', 'volume_net', 'delta', 'cvd', 'score'].every(x => parserIndicateur(x)));
  v('parser : valeurs et défauts', parserIndicateur('ma200').params.periode === 200 && parserIndicateur('rsi').params.periode === 14 && parserIndicateur('ema:50').params.periode === 50 && parserIndicateur('MA 21') === null || parserIndicateur('ma21').params.periode === 21);
  v('parser : inconnu = null, période absurde = null', parserIndicateur('stochastique') === null && parserIndicateur('ma1') === null && parserIndicateur('ma5000') === null);
  v('catalogue : 12 familles d’indicateurs', Object.keys(CATALOGUE_INDICATEURS).length === 12);
}
// ── indicateurs : valeurs identiques aux calculs du terminal ──
{
  const c = B.map(b => b.c), E = lireGraphique({ bougies: B, indicateurs: ['ma200', 'ema200', 'rsi14', 'atr14', 'macd', 'bollinger', 'vwap', 'volume', 'volume_net', 'delta', 'cvd', 'score'], derniers: 3000 });
  v('lecture complète renvoie les 3000 bougies et 12 indicateurs', E.ok && E.bougies.length === 3000 && Object.keys(E.indicateurs).length === 12, E.avertissements && E.avertissements.join(' | '));
  const eq = (a, b) => a.every((x, i) => (x == null && b[i] == null) || (x != null && b[i] != null && proche(x, b[i])));
  v('MA 200 = SMA du terminal, EMA 200 = EMA du terminal', eq(E.indicateurs.ma200.valeurs.valeur, sma(c, 200)) && eq(E.indicateurs.ema200.valeurs.valeur, ema(c, 200)));
  v('RSI 14 et ATR 14 = ceux du terminal', eq(E.indicateurs.rsi14.valeurs.valeur, rsi(c, 14)) && eq(E.indicateurs.atr14.valeurs.valeur, atrB(B, 14)));
  const m = macdB(c); v('MACD (3 colonnes) = celui du terminal', eq(E.indicateurs.macd.valeurs.macd, m.macd) && eq(E.indicateurs.macd.valeurs.signal, m.signal) && eq(E.indicateurs.macd.valeurs.histogramme, m.histogramme));
  const bb = bollB(c, 20, 2); v('Bollinger = celui du terminal', eq(E.indicateurs.bollinger20.valeurs.haut, bb.haut) && eq(E.indicateurs.bollinger20.valeurs.bas, bb.bas) && eq(E.indicateurs.bollinger20.valeurs.milieu, bb.milieu));
  v('VWAP = celui du terminal', eq(E.indicateurs.vwap.valeurs.valeur, vwapB(B)));
  // chauffe : null (jamais 0) tant que le recul manque
  v('chauffe : MA 200 nulle avant la 200e bougie, jamais 0', E.indicateurs.ma200.valeurs.valeur.slice(0, 199).every(x => x === null) && E.indicateurs.ma200.valeurs.valeur[199] !== null);
  // score : identique à la colonne du dashboard à plusieurs bougies
  const sc = scorePine(B, { volumeReel: true }); let bonScore = true, det = '';
  for (const i of [250, 700, 1500, 2999]) { const col = colonne(B.slice(0, i + 1), { volumeReel: true }); if (col.score !== sc[i]) { bonScore = false; det = i + ' : ' + col.score + ' vs ' + sc[i]; break; } }
  v('score par bougie = score du dashboard (formule 60/40 + 0,3·(RSI−50) ± 5)', bonScore, det);
  v('volume net (20 bougies) = celui du dashboard', proche(E.indicateurs.volume_net.derniere.valeur, volumeNet(B, 20, true)));
  // delta réel (vb connu) ou estimé
  v('delta réel quand vb existe', E.indicateurs.delta.etat === 'reel' && proche(E.indicateurs.delta.valeurs.valeur[100], 2 * B[100].vb - B[100].v));
  const sansVb = B.map(b => ({ ...b, vb: NaN })), E2 = lireGraphique({ bougies: sansVb, indicateurs: ['delta', 'cvd'], derniers: 50 });
  v('delta estimé étiqueté « estime » avec avertissement', E2.indicateurs.delta.etat === 'estime' && E2.avertissements.some(a => /ESTIMÉ/.test(a)));
  const sansV = B.map(b => ({ ...b, v: 0, vb: NaN })), E3 = lireGraphique({ bougies: sansV, indicateurs: ['volume', 'vwap', 'volume_net', 'delta'], derniers: 50 });
  v('instrument sans volume : INDISPONIBLE, jamais 0 inventé', ['volume', 'vwap', 'volume_net', 'delta'].every(k => E3.indicateurs[k].etat === 'indisponible' && E3.indicateurs[k].valeurs.valeur.every(x => x === null)));
  v('indicateur inconnu : avertissement, pas de plantage', lireGraphique({ bougies: B, indicateurs: ['ma200', 'stochastique'], derniers: 10 }).avertissements.some(a => /stochastique/.test(a)));
}
// ── fenêtre visible, période, dessins, niveaux ──
{
  const E = lireGraphique({ bougies: B, indicateurs: ['rsi14'], derniers: 120, paire: 'BTC', unite: 'M15' });
  v('derniers=120 : 120 bougies, période cohérente, indicateurs alignés', E.bougies.length === 120 && E.periode.n === 120 && E.indicateurs.rsi14.valeurs.valeur.length === 120 && E.periode.de === E.bougies[0].t && E.periode.a === E.bougies[119].t && E.paire === 'BTC');
  const E2 = lireGraphique({ bougies: B, indicateurs: ['rsi14'], de: B[500].t, a: B[599].t });
  v('période [de, a] : 100 bougies exactement, RSI chauffé avant la fenêtre', E2.periode.n === 100 && E2.bougies[0].t === B[500].t && E2.indicateurs.rsi14.valeurs.valeur[0] !== null);
  v('période vide : erreur claire', !lireGraphique({ bougies: B, de: B[600].t, a: B[500].t }).ok && !lireGraphique({ bougies: [] }).ok);
  const S = creerDessins({ contexte: () => ({ prixRef }) }); S.ajouter({ type: 'ligne_h', prix: prixRef, groupe: 'S1' }); S.ajouter({ type: 'ligne_h', prix: prixRef * 1.01, auteur: 'utilisateur' }); const masque = S.ajouter({ type: 'ligne_h', prix: prixRef * 0.9 }); S.masquer(masque.id);
  const E3 = lireGraphique({ bougies: B, indicateurs: [], derniers: 50, dessins: S.lister() }); v('les dessins visibles de l’agent ET de l’utilisateur sont lus ; les masqués non', E3.dessins.length === 2 && E3.dessinsAgent === 1 && E3.dessinsUtilisateur === 1);
  const n = E.niveaux; v('niveaux : supports, résistances, POC et zone de valeur', Array.isArray(n.supports) && Array.isArray(n.resistances) && n.profil && n.profil.val < n.profil.poc + 1e-9 && n.profil.poc <= n.profil.vah + 1e-9);
  const va = valeursA(E, E.bougies[60].t); v('valeurs à une bougie : bougie + indicateurs', va && va.bougie.t === E.bougies[60].t && 'valeur' in va.indicateurs.rsi14);
  v('résumé parlé', /RSI/.test(resumeEtat(lireGraphique({ bougies: B, indicateurs: ['ma200', 'rsi14'], derniers: 50, paire: 'BTC' }))) && /Je ne peux pas/.test(resumeEtat({ ok: false, erreur: 'x' })));
}
// ── causalité : poison du futur sur tous les indicateurs du graphique, niveaux et score ──
{
  const colonnesDe = s => {
    const bs = versBougies(s), E = lireGraphique({ bougies: bs, indicateurs: ['ma200', 'ema50', 'rsi14', 'atr14', 'macd', 'bollinger', 'vwap', 'volume', 'volume_net', 'delta', 'cvd', 'score'], derniers: 5000 }), out = {};
    for (const [id, ind] of Object.entries(E.indicateurs)) for (const [nom, tab] of Object.entries(ind.valeurs)) out[id + '.' + nom] = Float64Array.from(tab, x => (x == null ? NaN : x));
    return out;
  };
  const r = verifierColonnes(colonnesDe, M, [900, 1700, 2600], { de: 250 });
  v('POISON DU FUTUR : les 12 indicateurs du graphique ne regardent jamais le futur (' + r.testes + ' contrôles)', r.ok, JSON.stringify(r.violations[0]));
  // niveaux à la bougie i : calculés sur le passé seul, identiques avec ou sans le futur
  let bon = true, det = '';
  for (const i of [800, 1500, 2400]) { const plein = niveauxA(B, i), coupe = niveauxA(B.slice(0, i + 1), i), poison = niveauxA([...B.slice(0, i + 1), ...B.slice(i + 1).map(b => ({ ...b, o: 1e9, h: 1e9, l: 1e-3, c: 1e9, v: 1e12 }))], i); if (JSON.stringify(plein) !== JSON.stringify(coupe) || JSON.stringify(plein) !== JSON.stringify(poison)) { bon = false; det = 'i=' + i; break; } }
  v('POISON DU FUTUR : supports, résistances et profil « à la bougie i » = passé seul', bon, det);
}


// ── tester ma zone ──
{
  const N = 2400, T0 = Date.UTC(2025, 0, 1), PAS = 900e3, sin = [];
  for (let i = 0; i < N; i++) { const p = 100 + 8 * Math.sin(2 * Math.PI * i / 200), p2 = 100 + 8 * Math.sin(2 * Math.PI * (i + 1) / 200); sin.push({ t: T0 + i * PAS, o: p, h: Math.max(p, p2) + 0.1, l: Math.min(p, p2) - 0.1, c: p2, v: 100, vb: 50 }); }
  const S = depuisBougies(sin);
  const r = testerZone(S, { prixHaut: 109, prixBas: 107 }, { R: 2 });
  v('zone au sommet d’une oscillation : une approche par cycle (≈ 10)', r.ok && r.approches >= 9 && r.approches <= 11, r.approches);
  v('toutes les approches viennent du dessous', r.parSens.dessous === r.approches && r.parSens.dessus === 0);
  v('rebond dans presque tous les cas, cassure nulle', r.reactions.rebond.p >= 0.9 && r.reactions.cassure.p === 0, JSON.stringify(r.reactions.rebond));
  v('jouer le rebond : gagnant (R moyen > 1) avec les frais déduits', r.rebond.n >= 8 && r.rebond.esperance > 1 && r.rebond.taux.p === 1, r.rebond.n + ' ' + r.rebond.esperance);
  v('échantillon < 30 → verdict « échantillon insuffisant », jamais « validé »', r.verdict.rebond === 'echantillon_insuffisant' && /insuffisant/.test(r.phrases.join(' ')));
  v('biais de sélection et avertissement toujours dits', /choisie après/.test(r.biais) && /pas un conseil/.test(r.avertissement) && /optimistes/.test(r.phrases.join(' ')));
  v('deux moitiés d’histoire séparées', r.rebond.moitie1.n + r.rebond.moitie2.n === r.rebond.n);
  v('intervalle de Wilson autour de la part de rebonds', r.reactions.rebond.bas < r.reactions.rebond.p && r.reactions.rebond.haut <= 1 && r.reactions.rebond.n === r.approches);
  const aucune = testerZone(S, { prixHaut: 200, prixBas: 190 }); v('zone jamais atteinte : 0 approche, phrase claire', aucune.ok && aucune.approches === 0 && /jamais arrivé/.test(aucune.phrases.join(' ')));
  v('zone invalide refusée', !testerZone(S, { prixHaut: 100, prixBas: 100 }).ok && !testerZone(tranche(S, 0, 100), { prixHaut: 101, prixBas: 99 }).ok);
  v('texte d’explication', /approche/.test(explicationZone(r)) && /Je n’ai pas pu/.test(explicationZone({ ok: false, erreur: 'x' })));
  // cassure : tendance haussière qui traverse la zone
  const tend = []; for (let i = 0; i < N; i++) { const p = 80 + i * 0.02, p2 = 80 + (i + 1) * 0.02; tend.push({ t: T0 + i * PAS, o: p, h: p2 + 0.08, l: p - 0.08, c: p2, v: 100, vb: 50 }); }
  const rt = testerZone(depuisBougies(tend), { prixHaut: 118, prixBas: 116 }, { R: 2, k: 1, horizon: 200 });
  v('tendance qui traverse la zone : une approche, issue « cassure »', rt.ok && rt.approches === 1 && rt.reactions.cassure.k === 1 && rt.reactions.rebond.k === 0, JSON.stringify([rt.approches, rt.reactions]));
}
// ── explication d'une bougie ──
{
  const S = M, i = 1800, t = S.t[i], e = expliquerBougie(S, t, { paire: 'BTC' });
  v('bougie expliquée : forme, volume, delta, session, phases, VWAP, RSI, MA 200, niveaux', e.ok && ['Bougie de', 'Volume', 'Delta', 'Session', 'Phase à ce moment', 'VWAP', 'RSI', 'MA 200', 'pas une prévision'].every(x => e.texte.includes(x)), e.erreur || e.texte.slice(0, 300));
  const coupe = tranche(S, 0, i + 1), e2 = expliquerBougie(coupe, t, { paire: 'BTC' });
  v('CAUSAL : l’explication est identique avec ou sans le futur', e2.ok && e2.texte === e.texte);
  const poison = { n: S.n }; for (const k of ['t', 'o', 'h', 'l', 'c', 'v', 'vb']) poison[k] = S[k].slice(); for (let j = i + 1; j < S.n; j++) { poison.o[j] = poison.h[j] = poison.l[j] = poison.c[j] = 1e9; poison.v[j] = 1e12; }
  v('CAUSAL (poison) : identique aussi avec un futur absurde', expliquerBougie(poison, t).texte === e.texte);
  v('bougie inconnue / trop tôt : erreur claire', !expliquerBougie(S, 123).ok && !expliquerBougie(S, S.t[100]).ok && /300/.test(expliquerBougie(S, S.t[100]).erreur));
  const F = (o, h, l, c, pre) => formeBougie({ o, h, l, c }, pre);
  v('formes : marteau, étoile filante, doji, marubozu', F(100, 101.2, 95, 101).nom === 'marteau' && F(101, 106, 100.9, 102).nom === 'étoile filante' && F(100, 102, 98, 100.1).nom === 'doji' && F(100, 105.1, 99.9, 105).nom === 'marubozu haussier');
  v('avalement haussier détecté', F(99, 103, 98.5, 102.5, { o: 101, c: 99.5 }).avalement === true && F(100, 101, 99, 100.5, { o: 100, c: 100.4 }).avalement === false);
}
// ── rejeu ──
{
  const bs = B.slice(500, 560), x = { t: bs[20].t, tSortie: bs[40].t, sens: 1, prixEntree: bs[20].o, stop: bs[20].o * 0.99, cible: bs[20].o * 1.03, prixSortie: bs[40].c, motif: 'cible', R: 3.1 };
  const r = creerRejeu({ bougies: bs, debut: 5, entree: x });
  let e = r.etat(); v('rejeu : au début, aucune position, passé seul (5 bougies visibles)', e.i === 5 && e.vues.length === 5 && e.position === null && /attend/.test(e.phrase));
  e = r.pas(16); v('juste avant l’entrée : toujours aucune position', e.i === 21 && e.derniere.t === bs[20].t && e.position !== null || e.i === 21);
  e = r.allerA(bs[25].t); v('après l’entrée : position ouverte, stop et objectif visibles', e.position && e.position.ouverte && e.position.stop === x.stop && /Position ouverte/.test(e.phrase) && e.vues.length === 26);
  e = r.allerA(bs[40].t); v('à la sortie : motif et R affichés', e.position && !e.position.ouverte && e.position.sortie.motif === 'cible' && /Sortie \(cible\)/.test(e.phrase));
  v('on ne voit jamais la bougie suivante', r.allerA(bs[30].t).vues[r.etat().vues.length - 1].t === bs[30].t && r.etat().vues.every(b => b.t <= bs[30].t));
  e = r.pas(1000); v('fin : bornée, fini = vrai', e.fini && e.i === bs.length); e = r.pas(-1000); v('début : borné à 1', e.i === 1);
  r.vitesse(4); v('vitesse : délai plus court', r.delaiMs() < 700 && r.delaiMs() === 175); r.vitesse(1000); v('vitesse bornée à ×16', r.delaiMs() === Math.round(700 / 16));
  let leve = false; try { creerRejeu({ bougies: [] }); } catch (err) { leve = true; } v('rejeu sans bougies refusé', leve);
  const f = fenetreTrade(x); v('fenêtre autour du trade : 20 bougies avant, 8 après', f.t0 === x.t - 20 * 900e3 && f.t1 === x.tSortie + 8 * 900e3);
}

console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
