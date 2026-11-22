/* v10 phases 1 et 2 dans Chrome, données de production : manuel, analyse complète, marché en global, lecture du graphique (terminal fermé), rapport exportable. Usage : node trader-pro/tests/analyste-chrome.mjs [tablette|tel|pc] */
import { lancer, w } from './aide-chrome.mjs';
const T = await lancer(process.argv[2] || 'tablette', { dossierCaptures: 'donnees-privees/captures-v10', stockage: { rayle_donnees_base: 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/', rayle_piper_precharge: '0' } }), { p, verif, fin } = T;
const run = (nom, args) => p.evaluate(async (n, a) => { const O = await import('/trader-pro/cerveau/outils.js'); const t0 = performance.now(); const r = await O.executer(n, a); return { r, ms: Math.round(performance.now() - t0) }; }, nom, args);
let x = await run('manuel', { sujet: 'explique-moi le footprint' });
verif(x.r.fiches && /footprint/i.test(x.r.fiches[0].titre) && /bid|ask|acheteurs/i.test(x.r.fiches[0].texte), 'manuel(footprint) : fiche footprint (' + (x.r.fiches ? x.r.fiches[0].titre : JSON.stringify(x.r)) + ')');
x = await run('manuel', { sujet: 'rapport COT de l’or' }); verif(x.r.fiches && /COT/.test(x.r.fiches[0].titre) && x.r.fiches[0].fenetre.includes('marches'), 'manuel(COT) : fiche COT + fenêtre Marchés');
x = await run('manuel', { sujet: 'recette de la tarte' }); verif(x.r.introuvable === true, 'manuel : sujet absent → introuvable, rien d’inventé');
x = await run('analyse_marche', { actif: 'or' }); const A = x.r; console.log('analyse_marche or :', x.ms, 'ms,', JSON.stringify(A).length, 'octets');
verif(!A.indisponible && A.weekly && A.daily && A.h4 && A.position && A.ancresPourLesScenarios, 'analyse_marche(or) : Weekly, Daily, H4, position, ancres de scénario' + (A.indisponible ? ' — ' + A.indisponible : ''));
verif(A.donneesDu && A.prix > 100, 'analyse_marche : prix et heure des données (' + A.prix + ', ' + A.donneesDu + ')');
verif(A.daily && A.daily.structure && A.h4 && A.h4.tendance, 'analyse_marche : structure Daily et tendance H4 (' + (A.daily.structure && A.daily.structure.lecture) + ')');
verif(A.position.premiumDiscountDaily3Mois && /premium|discount|équilibre/.test(A.position.premiumDiscountDaily3Mois.zone), 'analyse_marche : premium / discount (' + (A.position.premiumDiscountDaily3Mois && A.position.premiumDiscountDaily3Mois.zone) + ')');
verif(JSON.stringify(A).length < 15000, 'analyse_marche : tient dans la limite d’un résultat d’outil (' + JSON.stringify(A).length + ' octets)');
x = await run('marche_global', {}); const G = x.r; console.log('marche_global :', x.ms, 'ms');
verif(G.actifs && G.actifs.length === 8, 'marche_global : 8 actifs (' + (G.actifs || []).map(a => a.actif + ':' + a.couleur).join(' ') + ')');
verif(G.actifs && G.actifs.every(a => ['haussier', 'neutre', 'baissier', 'indisponible'].includes(a.couleur) && a.phrase), 'marche_global : une couleur et une phrase par actif');
verif(G.climat && /risk|mitigé/.test(G.climat.lecture) && G.lesDeuxPlusInteressants && G.lesDeuxPlusInteressants.length === 2, 'marche_global : climat et 2 actifs les plus intéressants (' + (G.lesDeuxPlusInteressants || []).map(a => a.nom).join(', ') + ')');
x = await run('lecture_graphique', {}); verif(x.r.ouvert === false, 'lecture_graphique : terminal fermé → le dit');
/* rapport exportable */
await p.evaluate(() => window.dispatchEvent(new CustomEvent('rayle:rapport', { detail: { texte: '## 1) Contexte global\n- Climat mitigé\n**Or** : Daily haussier.\n## 2) Weekly → Daily → H4\nTexte de test assez long. '.repeat(3), question: 'analyse complète de l’or', heure: new Date().toISOString(), outils: ['analyse_marche'] } })));
verif(await p.evaluate(() => window.RapportRayle.ouvert() && /Contexte global/.test(document.querySelector('#ra-rapport .rr-corps').innerText) && /décides/.test(document.querySelector('#ra-rapport footer').innerText)), 'rapport : affiché à l’écran avec rappel « aide à la décision »');
verif(await p.evaluate(() => { const m = RapportRayle.markdown(RapportRayle.courant()); return /Données lues le/.test(m) && /Aide à la décision/.test(m); }), 'rapport : export Markdown avec heure des données');
const rect = await p.evaluate(() => { const r = document.getElementById('ra-rapport').getBoundingClientRect(); return { b: r.bottom, h: innerHeight, r: r.right, w: innerWidth }; }); verif(rect.b <= rect.h && rect.r <= rect.w + 1, 'rapport : tient dans l’écran (' + JSON.stringify(rect) + ')');
await T.capture('rapport'); await p.evaluate(() => document.querySelector('#ra-rapport [data-a="fermer"]').click()); verif(await p.evaluate(() => !RapportRayle.ouvert()), 'rapport : se ferme');
await fin();
