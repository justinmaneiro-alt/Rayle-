// M6 partie 5 et 6 : stagnation de la recherche, pivot de famille, file de chantiers ICT (mêmes critères que tout le reste), faux positifs sur un marché au hasard pur.
// Lancer :  node planetes/mars/tests/m6-stagnation-test.mjs
import { suivreRecherche, detecterStagnation, pivoter, FAMILLES_PIVOT, FILTRES_RESIDUELS } from '../pc/agent-m6/stagnation.js';
import { regleAleatoire, validerRegle, cleRegle } from '../pc/agent-btc/regles-lab.js';
import { etatInitial, trancher, prochainChantier } from '../pc/agent-btc/recherche-continue.js';
import { creerBibliotheque } from '../pc/agent-btc/bibliotheque.js';
import { creerPilote } from '../pc/agent-btc/pilote-coeur.js';
import { chantiersICT } from '../pc/agent-m6/ict.js';
import { marcheM5 } from './synth-m5.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const H = 3600e3;

// ── le tirage aléatoire sans focus ne change pas (les essais déjà faits restent valables) ──
{
  const cles = []; for (let g = 100; g < 140; g++) { const r = regleAleatoire(g), s = regleAleatoire(g, null), u = regleAleatoire(g, undefined); cles.push(r && cleRegle(r) === cleRegle(s) && cleRegle(s) === cleRegle(u)); }
  v('sans focus : même règle pour une même graine (null, undefined ou absent)', cles.every(Boolean));
  let tous = true; for (let g = 200; g < 260; g++) { const r = regleAleatoire(g, { declencheurs: ['rsi'], contextes: ['session'] }); if (r && r.conditions[0].type !== 'rsi') tous = false; if (r && r.conditions.slice(1).some(c => c.type !== 'session')) tous = false; }
  v('avec focus : le déclencheur et le contexte sont tirés dans la famille choisie', tous);
  v('avec focus : toujours déterministe', cleRegle(regleAleatoire(77, { declencheurs: ['cassure'] })) === cleRegle(regleAleatoire(77, { declencheurs: ['cassure'] })));
}
// ── suivi et détection ──
{
  const e = etatInitial(); e.N = 1000; e.presque = [{ Rtotal: 20, regle: null }];
  suivreRecherche(e, 0); e.N = 1500; suivreRecherche(e, 60e3); v('deux relevés proches fusionnés (état borné)', e.suivi.length === 1 && e.suivi[0].N === 1500);
  e.N = 50000; suivreRecherche(e, 2 * H); v('un relevé plus tard : nouvelle ligne', e.suivi.length === 2);
  const fabrique = (pas, meilleur, n = 8) => { const x = etatInitial(); for (let k = 0; k < n; k++) { x.N = 650000 + k * pas; x.presque = [{ Rtotal: typeof meilleur === 'function' ? meilleur(k) : meilleur }]; suivreRecherche(x, k * H); } return x; };
  const plat = fabrique(25000, 30), s1 = detecterStagnation(plat);
  v('100 000 variantes sans progrès : STAGNATION annoncée avec le chiffre', s1.stagne && s1.variantes >= 90000 && /STAGNE/.test(s1.phrase) && Math.abs(s1.gain) < 1e-9, JSON.stringify(s1));
  const progres = detecterStagnation(fabrique(25000, k => 30 + k * 3)); v('la meilleure piste progresse (+3 R par relevé) : pas de stagnation', !progres.stagne && progres.raison === 'progres', JSON.stringify(progres));
  const court = detecterStagnation(fabrique(5000, 30)); v('trop peu de variantes : on ne juge pas (fenêtre incomplète)', !court.stagne && court.raison === 'fenetre_incomplete');
  const petit = detecterStagnation(fabrique(25000, k => 30 + k * 0.1)); v('un gain de +0,7 R sur la fenêtre (< 2 R) ne compte pas comme un progrès', petit.stagne);
  const vide = detecterStagnation(etatInitial()); v('aucun suivi : « pas encore assez d’historique », pas d’invention', !vide.stagne && /pas encore/.test(vide.phrase));
  // après un pivot, la fenêtre repart du pivot
  const pv = fabrique(25000, 30); pv.pivots = [{ t: 1, N: pv.N - 10000, code: 'regimes' }]; v('après un pivot récent, la stagnation n’est pas rejugée tout de suite', !detecterStagnation(pv).stagne);
}
// ── pivot ──
{
  const e = etatInitial(); e.N = 800000; e.journalCourt = [];
  const p1 = pivoter(e, 1000, 'les meilleures pistes stagnent'); v('1er pivot : famille « régimes », focus appliqué, journal écrit', p1.ok && p1.code === 'regimes' && e.focus && e.focus.code === 'regimes' && e.pivots.length === 1 && /Pivot de la recherche/.test(p1.texte) && /critères de validation ne changent pas/.test(p1.texte) && e.journalCourt.at(-1).decision === 'PIVOT');
  const p2 = pivoter(e, 2000); v('2e pivot : autre famille (tendance et cassures)', p2.code === 'tendance_cassures' && e.focus.code === 'tendance_cassures' && e.pivots[1].de === 'regimes');
  pivoter(e, 3000); pivoter(e, 4000); pivoter(e, 5000);
  const p6 = pivoter(e, 6000); v('« alpha résiduel » sans piste-règle : passe à la famille suivante, ne plante pas', p6.ok && p6.code === 'regimes' && !(e.file || []).some(x => /^residuel/.test(x)));
  // alpha résiduel avec une vraie piste
  const regle = validerRegle({ nom: 'Piste X', cote: 'long', conditions: [{ type: 'cassure', tf: 'h1', N: 48 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }).regle;
  const e2 = etatInitial(); e2.pivots = Array(5).fill({ code: 'x' }); e2.presque = [{ Rtotal: 12, regle, nom: 'Piste X' }];
  const pr = pivoter(e2, 7000); v('alpha résiduel : piste proche + un filtre à la fois, enfilé dans la file', pr.ok && pr.code === 'residuel' && e2.file.includes('residuel:0') && e2.residuels[0].regles.length === FILTRES_RESIDUELS.length && e2.residuels[0].regles.every(r => r.conditions.length === 2 && validerRegle(r).ok), JSON.stringify(e2.file));
  v('chaque règle résiduelle garde la règle d’origine et ajoute exactement un filtre différent', new Set(e2.residuels[0].regles.map(r => JSON.stringify(r.conditions[1]))).size === e2.residuels[0].regles.length && e2.residuels[0].regles.every(r => JSON.stringify(r.conditions[0]) === JSON.stringify(regle.conditions[0])));
  v('six familles de pivot, la dernière étant le résiduel', FAMILLES_PIVOT.length === 6 && FAMILLES_PIVOT[5].code === 'residuel');
}
// ── file de chantiers : ICT, puis niveaux, sans rien casser ──
{
  const e = etatInitial(); e.niveau = 3; v('avant le niveau 5, la file ICT n’est PAS enfilée (ordre d’origine respecté)', prochainChantier(e, {}).niveau === 3 && !e.ictFait && e.file.length === 0);
  const e2 = etatInitial(); e2.niveau = 5; const c = prochainChantier(e2, {});
  v('au niveau 5 : les 6 chantiers ICT sont enfilés une fois, le premier est servi', e2.ictFait && e2.file.length === 6 && c.id === 'ict_fvg@ict' && c.file === true && c.variants.length > 50 && c.niveau === 6, JSON.stringify([e2.file, c.id]));
  const c2 = prochainChantier(e2, {}); v('la file n’est pas consommée tant que le chantier n’est pas fait', c2.id === 'ict_fvg@ict' && e2.file.length === 6);
  const e3 = etatInitial(); e3.niveau = 5; e3.file = ['inconnu@zz']; const sx = prochainChantier(e3, {}); v('chantier de file inconnu : écarté sans bloquer', sx.saute === true && e3.file[0] === 'ict_fvg@ict');
  const idee = etatInitial(); idee.niveau = 5; idee.idees.push({ id: 'i', nom: 'x', regle: validerRegle({ nom: 'x', cote: 'long', conditions: [{ type: 'session', valeurs: [1] }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }).regle });
  v('les idées de l’utilisateur passent toujours avant la file', prochainChantier(idee, {}).idee === true);
  const ancien = etatInitial(); delete ancien.file; delete ancien.ictFait; ancien.niveau = 5; v('un ancien état (sans file) se charge', prochainChantier(ancien, {}).id === 'ict_fvg@ict');
}
// ── pilote : la vue expose la stagnation et le pivot se déclenche tout seul ──
{
  const p = creerPilote({ maintenant: () => 1e12 }), vu = p.vue();
  v('vue : stagnation, pivots, focus et file exposés', vu.recherche.stagnation && vu.recherche.stagnation.stagne === false && Array.isArray(vu.recherche.pivots) && vu.recherche.focus === null && vu.recherche.file === 0);
  const e = p.etat(); e.recherche.niveau = 5; e.recherche.N = 700000;
  for (let k = 0; k < 8; k++) { e.recherche.N = 700000 + k * 25000; e.recherche.presque = [{ Rtotal: 30 }]; suivreRecherche(e.recherche, 1e12 - (8 - k) * H); }
  const res = p.integrerTranche({ recRev: 0, recherche: e.recherche, coffre: { ouverts: [] }, nouvelles: [], evenements: [], stop: 'budget' }, []);
  v('intégration d’une tranche : la stagnation déclenche un pivot et une notification', e.recherche.pivots.length === 1 && e.notifications.some(n => n.type === 'pivot' && /change de famille/.test(n.titre) && /critères de validation ne changent pas/.test(n.texte)), JSON.stringify(e.recherche.pivots) + JSON.stringify(e.notifications.map(n => n.type)));
}
// ── ICT sur un marché au hasard pur : les critères inchangés n'en valident AUCUNE ──
{
  const m = marcheM5({ n: 110000, graine: 33, bruitPct: 0.12 }), etat = etatInitial(), bib = creerBibliotheque(), evts = []; etat.niveau = 5; etat.N = 3101;
  const r = await trancher(etat, { m15: m, bibliotheque: bib, config: { maxParSemaine: 3 }, budget: { chantiersMax: 6, tempsMs: 600000 }, surEvenement: e => evts.push(e) });
  const ict = etat.finalistes.filter(f => /@ict$/.test(f.id)), depistes = (etat.compteurs[6] || {}).chantiers;
  v('les 6 chantiers ICT ont été évalués avec le protocole complet (compteur du niveau 6)', depistes === 6 && etat.file.length === 0, JSON.stringify([depistes, etat.file]));
  v('toutes les variantes sont comptées dans N (grilles figées : ' + chantiersICT().reduce((s, c) => s + c.variants.length, 0) + ')', etat.N === 3101 + chantiersICT().reduce((s, c) => s + c.variants.length, 0), etat.N);
  v('AUCUNE stratégie validée sur un marché sans avantage (faux positifs)', bib.liste().filter(s => s.statut === 'validee').length === 0 && !evts.some(e => e.type === 'validation'));
  v('le jeu final n’a pas été ouvert (aucune candidate)', r.coffre.ouverts.length === 0);
  v('les chantiers ICT sont écrits dans le journal de la recherche', etat.journalCourt.filter(j => /@ict$/.test(j.chantier)).length >= 1 || ict.length >= 1, etat.journalCourt.length);
}
// ── condition de régime : une stratégie peut être conditionnelle à un régime de marché (causale, absolue) ──
{
  const { signauxDepuisRegle, decrireRegle } = await import('../pc/agent-btc/regles-lab.js'), { construireContexte } = await import('../pc/agent-btc/contexte.js'), { verifierSignaux } = await import('../pc/agent-m6/causalite.js'), { marcheMixte } = await import('./synth-btc.mjs');
  const mk = (valeurs, cote = 'long') => validerRegle({ nom: 'Régime ' + valeurs, cote, conditions: [{ type: 'cassure', tf: 'm15', N: 48 }, { type: 'regime', valeurs }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 });
  v('règle conditionnelle à un régime : valide, décrite en français', mk(['haussier']).ok && /régime haussier/.test(decrireRegle(mk(['haussier']).regle)));
  v('valeur de régime inconnue refusée', !mk(['lunaire']).ok && !validerRegle({ nom: 'x', cote: 'long', conditions: [{ type: 'regime', valeurs: [] }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }).ok);
  const M = marcheMixte(14000, 6), ctx = construireContexte(M), sig = signauxDepuisRegle(ctx, mk(['haussier']).regle);
  let n = 0, mauvais = 0; for (let i = 0; i < M.n; i++) if (sig.sens[i]) { n++; if (!(ctx.h4.phase[i] === 1 && ctx.h1.phase[i] !== 2 && ctx.h1.atrRang[i] < 0.85)) mauvais++; }
  v('chaque signal « régime haussier » a bien H4 en hausse, H1 pas en baisse, volatilité non extrême (' + n + ' signaux)', mauvais === 0);
  const sans = signauxDepuisRegle(ctx, validerRegle({ nom: 'sans', cote: 'long', conditions: [{ type: 'cassure', tf: 'm15', N: 48 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }).regle);
  v('le régime FILTRE : moins de signaux que la même règle sans régime', Array.from(sig.sens).filter(Boolean).length < Array.from(sans.sens).filter(Boolean).length);
  const r = verifierSignaux(s => signauxDepuisRegle(construireContexte(s), mk(['haussier', 'range']).regle), M, [5003, 9001]); v('POISON DU FUTUR : la condition de régime ne regarde jamais le futur', r.ok, JSON.stringify(r.violations[0]));
  v('le tirage aléatoire peut produire des conditions de régime quand le focus les demande', Array.from({ length: 200 }, (_, g) => regleAleatoire(500 + g, { declencheurs: ['rsi'], contextes: ['regime'] })).some(r => r && r.conditions.some(c => c.type === 'regime')));
  v('la famille de pivot « régimes » contient la condition de régime', FAMILLES_PIVOT.find(f => f.code === 'regimes').focus.contextes.includes('regime'));
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
