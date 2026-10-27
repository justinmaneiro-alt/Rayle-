// M6 partie 5 : gardien prop (marges, coupe-circuit, contrôle en 9 points, taille de position) et détecteur de tilt, avec des cas connus calculés à la main.
// Lancer :  node planetes/mars/tests/m6-gardien-test.mjs
import { REGLES_PROP_DEFAUT, BASE_DEFAUT, fusionRegles, limites, etatCompte, evaluerGardien, taillePosition, controleAvantTrade, jugerAlerte, debutJournee } from '../pc/agent-m6/gardien.js';
import { detecterTilt, POIDS_TILT } from '../pc/agent-m6/tilt.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, e = 0.011) => Math.abs(a - b) <= e;
const H = 3600e3, J = 86400e3, JOUR = Date.UTC(2026, 9, 23), NOW = JOUR + 14 * H;       // 2026-10-23 14:00 UTC
const trade = (i, pnl, tSortie, o = {}) => ({ id: 'T' + i, t: tSortie - 30 * 60e3, tSortie, paire: 'BTC', sens: 1, pnl, statut: 'ferme', ...o });

// ── règles et limites ──
{
  const R = fusionRegles({}), L = limites(R);
  v('limites du compte de 10 000 $ : objectif 1 000 $, perte du jour 300 $, drawdown 600 $', L.objectif === 1000 && L.perteJour === 300 && L.drawdown === 600);
  v('défauts prudents : drawdown suiveur sur l’équité, marge de sécurité 25 %', R.modeDrawdown === 'suiveur_equite' && R.bufferSecurite === 0.25 && R.plafondTrailing === 'aucun' && R.modePerteJour === 'equite');
  const bizarre = fusionRegles({ capital: -5, perteJourPct: 'abc', modeDrawdown: 'n’importe quoi', bufferSecurite: 5, heureResetJourUTC: 99 });
  v('règles invalides remises aux valeurs sûres', bizarre.capital === 10000 && bizarre.perteJourPct === 3 && bizarre.modeDrawdown === 'suiveur_equite' && bizarre.bufferSecurite === 0.9 && bizarre.heureResetJourUTC === 23);
  v('début de journée de trading (reset 0 h UTC)', debutJournee(NOW, 0) === JOUR && debutJournee(JOUR + 2 * H, 6) === JOUR - 18 * H);
  v('la base par défaut est +322 $ (10 322 $)', BASE_DEFAUT.equite === 10322 && Object.isFrozen(REGLES_PROP_DEFAUT));
}
// ── état du compte ──
{
  const c = etatCompte({ regles: {}, base: {}, journal: [], maintenant: NOW });
  v('compte neuf à +322 $ : marges pleines', c.equite === 10322 && c.perteJour === 0 && c.restantJour === 300 && c.plancher === 9722 && c.restantDrawdown === 600 && c.gainTotal === 322 && c.resteObjectif === 678 && proche(c.progression, 0.322, 1e-9) && c.margeRestante === 300);
  const c1 = etatCompte({ regles: {}, base: {}, journal: [trade(1, -150, NOW - 2 * H)], maintenant: NOW });
  v('après −150 $ aujourd’hui : perte du jour 150, marge du jour 150, drawdown 150', c1.equite === 10172 && c1.perteJour === 150 && c1.restantJour === 150 && c1.drawdown === 150 && c1.restantDrawdown === 450 && c1.margeRestante === 150 && c1.tradesJour === 1);
  const hier = etatCompte({ regles: {}, base: {}, journal: [trade(1, -250, JOUR - 1 * H)], maintenant: NOW });
  v('la perte d’HIER ne compte pas dans la perte du jour, mais bien dans le drawdown', hier.perteJour === 0 && hier.restantJour === 300 && hier.drawdown === 250 && hier.restantDrawdown === 350);
  // suiveur : +200 puis −400 → pic 10 522, équité 10 122, drawdown 400 (reste 200)
  const j2 = [trade(1, 200, NOW - 30 * H), trade(2, -400, NOW - 16 * H)];
  const s = etatCompte({ regles: {}, base: {}, journal: j2, maintenant: NOW });
  v('drawdown SUIVEUR : pic 10 522 → plancher 9 922, équité 10 122, reste 200 $', s.picEquite === 10522 && s.plancher === 9922 && s.equite === 10122 && s.drawdown === 400 && s.restantDrawdown === 200 && s.margeRestante === 200, JSON.stringify([s.picEquite, s.plancher, s.drawdown]));
  const f = etatCompte({ regles: { modeDrawdown: 'fixe' }, base: {}, journal: j2, maintenant: NOW });
  v('drawdown FIXE (depuis le capital) : plancher 9 400, il reste 722 $', f.plancher === 9400 && f.restantDrawdown === 722 && f.drawdown === 0, JSON.stringify([f.plancher, f.restantDrawdown]));
  const p = etatCompte({ regles: { plafondTrailing: 'capital_initial' }, base: {}, journal: j2, maintenant: NOW });
  v('suiveur plafonné au capital de départ : plancher 9 922 (déjà sous 10 000)', p.plancher === 9922);
  const p2 = etatCompte({ regles: { plafondTrailing: 'capital_initial' }, base: { equite: 11000, pic: 11000 }, journal: [], maintenant: NOW });
  v('suiveur plafonné : le plancher ne dépasse jamais 10 000 $', p2.plancher === 10000 && etatCompte({ regles: {}, base: { equite: 11000, pic: 11000 }, journal: [], maintenant: NOW }).plancher === 10400);
  const l = etatCompte({ regles: {}, base: {}, journal: [], latent: -100, maintenant: NOW });
  v('mode équité : le latent compte dans la perte du jour et le drawdown', l.equite === 10222 && l.perteJour === 100 && l.drawdown === 100);
  const lc = etatCompte({ regles: { modePerteJour: 'cloture', modeDrawdown: 'suiveur_cloture' }, base: {}, journal: [], latent: -100, maintenant: NOW });
  v('mode clôture : le latent ne compte pas', lc.perteJour === 0 && lc.drawdown === 0);
  const pic = etatCompte({ regles: {}, base: { equite: 10322, pic: 10700 }, journal: [], maintenant: NOW });
  v('pic d’équité saisi plus haut que l’équité : le drawdown en tient compte', pic.picEquite === 10700 && pic.drawdown === 378 && pic.plancher === 10100);
  const ancien = etatCompte({ regles: {}, base: { t: NOW - 2 * J }, journal: [trade(1, -999, NOW - 3 * J)], maintenant: NOW });
  v('un trade antérieur à la base est ignoré (déjà compris dans l’équité saisie)', ancien.equite === 10322);
  const ouvert = etatCompte({ regles: {}, base: {}, journal: [{ id: 'o', t: NOW - H, paire: 'BTC', sens: 1, statut: 'ouvert', pnl: NaN }], maintenant: NOW });
  v('un trade ouvert n’entre pas dans l’équité réalisée', ouvert.realisee === 10322 && ouvert.tradesJour === 1);
}
// ── verdict du gardien ──
{
  const g0 = evaluerGardien(etatCompte({ regles: {}, base: {}, journal: [], maintenant: NOW }));
  v('compte neuf : VERT, peut proposer, marge confortable', g0.niveau === 'VERT' && g0.peutProposer && !g0.coupeCircuit.actif && /Marge du jour : 300 \$ sur 300 \$/.test(g0.phrase), g0.phrase);
  v('la phrase donne l’objectif : +322 $ sur 1 000 $ (32 %)', /Objectif : \+322 \$ sur 1[\s  ]?000 \$ \(32 %\)/.test(g0.phrase), g0.phrase);
  const lvl = pnl => evaluerGardien(etatCompte({ regles: {}, base: {}, journal: [trade(1, pnl, NOW - H)], maintenant: NOW })).niveau;
  v('niveaux : −100 vert, −170 orange, −250 rouge, −300 bloqué', lvl(-100) === 'VERT' && lvl(-170) === 'ORANGE' && lvl(-250) === 'ROUGE' && lvl(-300) === 'BLOQUE');
  const g140 = evaluerGardien(etatCompte({ regles: {}, base: {}, journal: [trade(1, -160, NOW - H)], maintenant: NOW }));
  v('marge du jour 140 $ sur 300 $ : dite telle quelle', /Marge du jour : 140 \$ sur 300 \$ \(perte du jour 160 \$\)/.test(g140.phrase), g140.phrase);
  const gPetit = evaluerGardien(etatCompte({ regles: { risqueParTradePct: 1 }, base: {}, journal: [trade(1, -200, NOW - H)], maintenant: NOW }));
  v('marge trop petite pour un trade au risque normal : « pas de nouveau setup »', !gPetit.assezDeMarge && !gPetit.peutProposer && /pas de nouveau setup/i.test(gPetit.decision), gPetit.decision);
  // coupe-circuit : 3 pertes d’affilée → repos 6 h
  const trois = [trade(1, -20, NOW - 5 * H), trade(2, -20, NOW - 3 * H), trade(3, -20, NOW - 1 * H)];
  const gc = evaluerGardien(etatCompte({ regles: {}, base: {}, journal: trois, maintenant: NOW }));
  v('3 pertes d’affilée : coupe-circuit « série » avec fin du repos', gc.coupeCircuit.actif && gc.coupeCircuit.causes[0].type === 'serie' && gc.coupeCircuit.causes[0].jusqua === NOW - 1 * H + 6 * H && !gc.peutProposer, JSON.stringify(gc.coupeCircuit));
  const plusTard = evaluerGardien(etatCompte({ regles: {}, base: {}, journal: trois, maintenant: NOW + 6 * H }));
  v('le repos se termine tout seul après 6 h', !plusTard.coupeCircuit.actif);
  const levee = evaluerGardien(etatCompte({ regles: {}, base: {}, journal: trois, maintenant: NOW }), { levees: [{ type: 'serie', t: NOW }] });
  v('levée manuelle enregistrée : coupe-circuit levé', !levee.coupeCircuit.actif);
  const gain = evaluerGardien(etatCompte({ regles: {}, base: {}, journal: [trade(1, -20, NOW - 3 * H), trade(2, 50, NOW - 2 * H), trade(3, -20, NOW - 1 * H)], maintenant: NOW }));
  v('un gain au milieu casse la série de pertes', !gain.coupeCircuit.actif);
  const gj = evaluerGardien(etatCompte({ regles: {}, base: {}, journal: [trade(1, -250, NOW - 8 * H)], maintenant: NOW }));
  v('perte du jour à 83 % : coupe-circuit « jour » jusqu’à demain', gj.coupeCircuit.actif && gj.coupeCircuit.causes.some(x => x.type === 'jour' && x.jusqua === JOUR + J), JSON.stringify(gj.coupeCircuit));
  const gd = evaluerGardien(etatCompte({ regles: {}, base: {}, journal: [trade(1, 100, NOW - 30 * H), trade(2, -530, NOW - 28 * H)], maintenant: NOW }));
  v('drawdown à 88 % : coupe-circuit « drawdown » sans fin automatique', gd.coupeCircuit.causes.some(x => x.type === 'drawdown' && x.jusqua === null), JSON.stringify(gd.coupeCircuit));
  v('mentions obligatoires : alertes seulement, vérifier le contrat', g0.mentions.some(m => /aucun ordre/.test(m)) && g0.mentions.some(m => /contrat Kraken Prop/.test(m)));
}
// ── taille de position ──
{
  const c = etatCompte({ regles: {}, base: {}, journal: [], maintenant: NOW }), plan = { entree: 80000, stop: 79200, objectif: 82400 };
  const t = taillePosition({ compte: c, plan });
  v('taille : 50 $ de risque (0,5 %), stop à 800 $ + 160 $ de frais par unité → 0,0521 BTC', t.ok && proche(t.quantite, 50 / 960, 1e-6) && proche(t.risqueUSD, 50) && t.limitePar === 'risque par trade' && proche(t.rr, 3, 1e-9), JSON.stringify(t));
  const ptite = etatCompte({ regles: {}, base: {}, journal: [trade(1, -240, NOW - H)], maintenant: NOW }), t2 = taillePosition({ compte: ptite, plan });
  v('marge restante 60 $ → risque permis 45 $ (marge de sécurité 25 %) : limité par la marge', proche(t2.risqueUSD, 45) && t2.limitePar === 'marge restante', JSON.stringify(t2));
  const vide = etatCompte({ regles: {}, base: {}, journal: [trade(1, -300, NOW - H)], maintenant: NOW }); v('aucune marge : pas de taille', !taillePosition({ compte: vide, plan }).ok);
  v('entrée = stop refusée', !taillePosition({ compte: c, plan: { entree: 100, stop: 100 } }).ok);
}
// ── contrôle avant trade en 9 points ──
{
  const comp = (journal = [], base = {}, regles = {}) => { const c = etatCompte({ regles, base: { t: NOW - 40 * H, ...base }, journal, maintenant: NOW }); c._journal = journal; return c; };
  const ctx = (c, extra = {}) => ({ compte: c, gardien: evaluerGardien(c), ouvertes: [], journal: c._journal || [], maintenant: NOW, ...extra });
  const plan = { paire: 'BTC', sens: 1, entree: 80000, stop: 79200, objectif: 82400 };
  const c0 = comp(), ok0 = controleAvantTrade(plan, ctx(c0));
  v('trade propre : PASS sur les 9 points', ok0.decision === 'PASS' && ok0.points.length === 9 && ok0.points.every(p => p.etat !== 'BLOCK'), JSON.stringify(ok0.points.map(p => p.id + p.etat)));
  v('PASS : phrase avec taille, perte maximale et mention « aucun ordre »', /PASS/.test(ok0.phrase) && /aucun ordre/.test(ok0.phrase) && proche(ok0.perteStop, 50));
  const bloque = (p, c = c0, extra = {}) => controleAvantTrade(p, ctx(c, extra));
  let r = bloque({ ...plan, stop: null }); v('1. pas de stop → BLOCK', r.decision === 'BLOCK' && r.points[0].etat === 'BLOCK');
  r = bloque({ ...plan, stop: 80500 }); v('1. stop du mauvais côté → BLOCK', r.points[0].etat === 'BLOCK');
  r = bloque({ ...plan, objectif: null }); v('2. pas d’objectif → BLOCK', r.points[1].etat === 'BLOCK' && /plan de sortie/.test(r.points[1].detail));
  r = bloque({ ...plan, objectif: 80600 }); v('2. R/R de 0,75 < 1,5 → BLOCK', r.points[1].etat === 'BLOCK');
  r = bloque({ ...plan, quantite: 0.2 }); v('3. quantité trop grosse (risque 160 $ > 50 $) → BLOCK', r.points[2].etat === 'BLOCK' && r.decision === 'BLOCK', JSON.stringify(r.points[2]));
  const serre = comp([trade(1, -230, NOW - H)]);          // marge du jour 70 $ → utilisable 52,5 $ ; risque normal 50 $ passe, mais pas 0,0625 BTC (60 $)
  r = bloque({ ...plan, quantite: 0.0625 }, serre); v('4. perte maximale 66 $ > marge du jour utilisable → BLOCK', r.points[3].etat === 'BLOCK', JSON.stringify(r.points[3]));
  const dd = comp([trade(1, 100, NOW - 30 * H), trade(2, -400, NOW - 28 * H)]);   // drawdown 400 → reste 200, utilisable 150 ; perte jour = 0
  r = bloque({ ...plan, quantite: 0.2 }, dd); v('5. perte maximale 192 $ > marge de drawdown utilisable → BLOCK', r.points[4].etat === 'BLOCK');
  r = bloque({ ...plan, quantite: 0.0521, entree: 80000 }, c0, { ouvertes: [{ notionnel: 20000 }] }); v('6. exposition : 20 000 $ ouverts + 4 168 $ ≤ 20 644 $ ? non → BLOCK', r.points[5].etat === 'BLOCK' || r.decision === 'BLOCK', JSON.stringify(r.points[5]));
  r = bloque(plan, c0, { ouvertes: [{ notionnel: 100 }] }); v('7. une position déjà ouverte (maximum 1) → BLOCK', r.points[6].etat === 'BLOCK');
  const troisTrades = comp([trade(1, 5, NOW - 6 * H), trade(2, 5, NOW - 5 * H), trade(3, 5, NOW - 4 * H)]); r = bloque(plan, troisTrades);
  v('7. déjà 3 trades aujourd’hui (maximum 3) → BLOCK', r.points[6].etat === 'BLOCK');
  const avantDernier = comp([trade(1, 5, NOW - 6 * H), trade(2, 5, NOW - 5 * H)]); r = bloque(plan, avantDernier); v('7. 2 trades sur 3 → WARN (dernier trade permis)', r.points[6].etat === 'WARN' && r.decision === 'PASS');
  const rev = comp([trade(1, -20, NOW - 10 * 60e3)]); r = bloque(plan, rev); v('8. perte il y a 10 min sur la même paire → BLOCK (revanche)', r.points[7].etat === 'BLOCK' && /revanche/.test(r.points[7].detail), JSON.stringify(r.points[7]));
  r = bloque({ ...plan, paire: 'SOL' }, rev); v('8. perte récente sur une AUTRE paire → pas de revanche', r.points[7].etat !== 'BLOCK');
  const cc = comp([trade(1, -20, NOW - 5 * H), trade(2, -20, NOW - 4 * H), trade(3, -20, NOW - 3 * H)]); r = bloque(plan, cc); v('8. coupe-circuit actif → BLOCK', r.points[7].etat === 'BLOCK');
  const vieux = etatCompte({ regles: {}, base: { t: NOW - 5 * J }, journal: [], maintenant: NOW }); r = bloque(plan, vieux); v('9. compte non mis à jour depuis 5 jours → WARN (pas BLOCK)', r.points[8].etat === 'WARN' && r.decision === 'PASS');
  const limite = comp([trade(1, -310, NOW - 8 * H)]); r = bloque(plan, limite); v('limite atteinte → BLOCK avec point 10', r.decision === 'BLOCK' && r.points.some(p => p.id === 10));
  // alerte de l'agent
  const al = jugerAlerte({ paire: 'BTC', sens: 1, entree: 80000, stop: 79200, cible: 82400, nomStrategie: 'Stratégie X' }, ctx(c0));
  v('alerte d’ENTRÉE jugée : PASS, marge du jour et taille dans le texte', al.decision === 'PASS' && /Gardien : PASS/.test(al.texte) && /marge du jour 300 \$ sur 300 \$/.test(al.texte) && /taille 0\.0521/.test(al.texte), al.texte);
  const alB = jugerAlerte({ paire: 'BTC', sens: 1, entree: 80000, stop: 79200, cible: 82400 }, ctx(limite)); v('alerte qui ferait dépasser une limite : BLOQUÉE', alB.decision === 'BLOCK' && /BLOQUÉ/.test(alB.texte));
}
// ── tilt ──
{
  const base = NOW - 20 * H, mk = (i, dtMin, o = {}) => ({ id: 'X' + i, t: base + dtMin * 60e3, paire: 'BTC', sens: 1, stop: 79000, prixEntree: 80000, risqueUSD: 50, strategie: 'S', rr: 2.5, ...o });
  const propre = detecterTilt([mk(1, 0, { tSortie: base + 60 * 60e3, pnl: 80 }), mk(2, 300, { tSortie: base + 360 * 60e3, pnl: -50 })], { maintenant: NOW });
  v('journal propre : VERT, aucun signal', propre.niveau === 'VERT' && propre.signaux.length === 0 && propre.score === 0 && /vert/.test(propre.phrase));
  const rev = detecterTilt([mk(1, 0, { tSortie: base + 30 * 60e3, pnl: -50 }), mk(2, 40, { tSortie: base + 90 * 60e3, pnl: -50 })], { maintenant: base + 2 * H });
  v('revanche : trade 10 min après une perte dans le même sens', rev.signaux.some(s => s.id === 'revanche') && rev.score >= POIDS_TILT.revanche, JSON.stringify(rev.signaux.map(s => s.id)));
  const sansRev = detecterTilt([mk(1, 0, { tSortie: base + 30 * 60e3, pnl: -50 }), mk(2, 200, { tSortie: base + 250 * 60e3, pnl: 20 })], { maintenant: base + 5 * H });
  v('pas de revanche quand le trade suivant vient plus de 30 minutes après', !sansRev.signaux.some(s => s.id === 'revanche'));
  const grossit = detecterTilt([mk(1, 0, { tSortie: base + 30 * 60e3, pnl: -50 }), mk(2, 60, { tSortie: base + 100 * 60e3, pnl: 10, risqueUSD: 120 })], { maintenant: base + 3 * H });
  v('taille ×2,4 après une perte détectée', grossit.signaux.some(s => s.id === 'taille_apres_perte'));
  const sur = detecterTilt([0, 20, 40, 60, 80].map((m, i) => mk(i, m, { tSortie: base + (m + 10) * 60e3, pnl: 5 })), { maintenant: base + 2 * H, regles: { tradesParJourMax: 3 } });
  v('5 trades dont 3 en moins de 2 h : surtrading', sur.signaux.some(s => s.id === 'surtrading'));
  const nostop = detecterTilt([mk(1, 0, { stop: null, tSortie: base + 60 * 60e3, pnl: 10 })], { maintenant: base + 2 * H });
  v('trade sans stop : signal « stop ignoré »', nostop.signaux.some(s => s.id === 'stop_ignore') && nostop.score >= 30);
  const reculé = detecterTilt([mk(1, 0, { stopDeplace: true, tSortie: base + 60 * 60e3, pnl: -90 })], { maintenant: base + 2 * H }); v('stop reculé détecté', reculé.signaux.some(s => /reculé/.test(s.detail)));
  const grosPerte = detecterTilt([mk(1, 0, { tSortie: base + 60 * 60e3, pnl: -140 })], { maintenant: base + 2 * H }); v('perte de 140 $ pour 50 $ prévus : perte au-delà du stop', grosPerte.signaux.some(s => s.nom === 'Perte au-delà du stop'));
  const hp = detecterTilt([mk(1, 0, { strategie: '', setup: '', tSortie: base + 60 * 60e3, pnl: 10 }), mk(2, 200, { rr: 0.8, tSortie: base + 260 * 60e3, pnl: 10 })], { maintenant: base + 5 * H });
  v('hors plan : sans stratégie, ou R/R 0,8 < minimum', hp.signaux.filter(s => s.id === 'hors_plan').length === 2);
  const marge = detecterTilt([mk(1, 0, { partMargeAvant: 0.9, tSortie: base + 60 * 60e3, pnl: -50 })], { maintenant: base + 2 * H }); v('entrée avec la marge presque épuisée détectée', marge.signaux.some(s => s.id === 'marge_epuisee'));
  const combo = detecterTilt([mk(1, 0, { tSortie: base + 30 * 60e3, pnl: -50 }), mk(2, 40, { stop: null, risqueUSD: 150, tSortie: base + 100 * 60e3, pnl: -150 }), mk(3, 120, { strategie: '', setup: '', tSortie: base + 160 * 60e3, pnl: -50 })], { maintenant: base + 3 * H });
  v('revanche + sans stop + grossit + hors plan : ROUGE, pause longue', combo.niveau === 'ROUGE' && combo.pauseMin >= 600 && /Arrête/.test(combo.recommandation), combo.niveau + ' ' + combo.score);
  const orange = detecterTilt([mk(1, 0, { stop: null, tSortie: base + 60 * 60e3, pnl: 10 })], { maintenant: base + 2 * H }); v('un seul défaut grave : ORANGE, pause de 30 min', orange.niveau === 'ORANGE' && orange.pauseMin === 30);
  const vieux = detecterTilt([{ ...mk(1, 0, { stop: null, tSortie: base + 60 * 60e3, pnl: 10 }), t: NOW - 3 * J }], { maintenant: NOW }); v('un trade vieux de 3 jours est hors de la fenêtre', vieux.niveau === 'VERT' && vieux.signaux.length === 0);
  const decroit = detecterTilt([mk(1, 0, { stop: null, tSortie: base + 60 * 60e3, pnl: 10 })], { maintenant: base + 2 * H }).score > detecterTilt([mk(1, 0, { stop: null, tSortie: base + 60 * 60e3, pnl: 10 })], { maintenant: base + 14 * H }).score;
  v('le score décroît avec l’ancienneté du signal', decroit);
  v('même journal, même résultat (déterministe, sans IA)', JSON.stringify(detecterTilt([mk(1, 0, { stop: null, tSortie: base + 60 * 60e3, pnl: 10 })], { maintenant: NOW })) === JSON.stringify(detecterTilt([mk(1, 0, { stop: null, tSortie: base + 60 * 60e3, pnl: 10 })], { maintenant: NOW })));
  v('la note rappelle que ce sont des faits, pas un jugement', /faits|jugement/.test(combo.note));
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
