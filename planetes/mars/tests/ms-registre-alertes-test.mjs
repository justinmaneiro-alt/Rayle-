// « Teste ma stratégie » : registre nommé (modifier, dupliquer, validation, compteur de variantes par lignée), mode alertes (compte simulé par stratégie, étiquettes honnêtes,
// pas de doublon, sorties), cohérence avec le backtest sur un marché fabriqué. Lancer :  node planetes/mars/tests/ms-registre-alertes-test.mjs
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { marcheM5, DERIVE_PLANTEE } from './synth-m5.mjs';
import { creerRegistre } from '../pc/agent-ms/registre-ms.js';
import { validerStrategie } from '../pc/agent-ms/strategie-ms.js';
import { avancerMS, etatMSVide, etiquetteConfiance, perfDirect, aideSignal } from '../pc/agent-ms/alertes-ms.js';
import { simulerMS } from '../pc/agent-ms/simulation-ms.js';
import { signauxMS, PAS } from '../pc/agent-ms/signaux-ms.js';
import { couper } from '../pc/agent-m6/causalite.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const base = (o = {}) => ({ nom: 'Ma stratégie', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 30 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, sortie: { type: 'cible_R', R: 2 }, ...o });
let horloge = 1e12; const maintenant = () => (horloge += 1000);

// ── registre ──
{
  const reg = creerRegistre(null, { maintenant });
  v('création : brouillon NON validé, aucune alerte', (() => { const r = reg.creer(base()); const s = reg.obtenir(r.id); return r.ok && !s.valide && !s.alertes.actif && s.nVariantes === 0; })());
  v('création invalide refusée avec les raisons', (() => { const r = reg.creer({ ...base(), conditions: [] }); return !r.ok && r.erreurs.length > 0; })());
  const id = reg.liste()[0].id;
  v('alertes refusées : pas validée par l’utilisatrice', !reg.reglerAlertes(id, true).ok && /valide/.test(reg.reglerAlertes(id, true).erreur));
  reg.valider(id);
  v('alertes refusées : pas encore testée', !reg.reglerAlertes(id, true).ok && /teste/.test(reg.reglerAlertes(id, true).erreur));
  let e = reg.enregistrerTest(id, { verdict: 'ne_bat_pas', paires: ['BTC'], esperance: -0.1, n: 200 });
  v('1er test : une variante comptée', e.nouvelle && e.nVariantes === 1);
  e = reg.enregistrerTest(id, { verdict: 'ne_bat_pas', paires: ['BTC', 'SOL'], esperance: -0.1, n: 400 });
  v('même règle retestée : le compteur ne bouge pas', !e.nouvelle && e.nVariantes === 1);
  const r1 = reg.reglerAlertes(id, true);
  v('stratégie qui ne bat pas le hasard : alertes seulement avec confirmation explicite', !r1.ok && r1.demandeConfirmation === true);
  v('avec confirmation : alertes activées, confirmation notée', reg.reglerAlertes(id, true, { confirme: true }).ok && reg.obtenir(id).alertes.actif && reg.obtenir(id).alertes.confirmeLe > 0);
  const m = reg.modifier(id, { conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25 }] });
  v('modifier la règle : validation retirée ET alertes coupées', m.ok && m.change && !reg.obtenir(id).valide && !reg.obtenir(id).alertes.actif && reg.obtenir(id).nModifs === 1);
  v('modifier seulement le nom : rien n’est retiré', (() => { reg.valider(id); const x = reg.modifier(id, { nom: 'Autre nom' }); return x.ok && !x.change && reg.obtenir(id).valide; })());
  v('alertes refusées : la dernière version testée n’est plus la bonne', !reg.reglerAlertes(id, true, { confirme: true }).ok && /autre version/.test(reg.reglerAlertes(id, true, { confirme: true }).erreur));
  e = reg.enregistrerTest(id, { verdict: 'bat_le_hasard', paires: ['BTC'], esperance: 0.2, n: 300 });
  v('règle modifiée testée : 2e variante', e.nouvelle && e.nVariantes === 2);
  v('« bat le hasard » : alertes sans confirmation supplémentaire', reg.reglerAlertes(id, true).ok);
  const d = reg.dupliquer(id, 'Copie');
  v('dupliquer : même lignée, compteur conservé (2), validation et alertes à refaire', d.ok && reg.obtenir(d.id).nVariantes === 2 && !reg.obtenir(d.id).valide && !reg.obtenir(d.id).alertes.actif);
  reg.modifier(d.id, { stop: { type: 'atr', tf: 'h1', k: 2.5 } }); const e2 = reg.enregistrerTest(d.id, { verdict: 'ne_bat_pas' });
  v('variante d’une copie : le compteur de la lignée monte pour l’original aussi (3)', e2.nVariantes === 3 && reg.obtenir(id).nVariantes === 3);
  v('variantesAvecTest : prévoit le compteur sans rien enregistrer', reg.variantesAvecTest(d.id) === 3 && reg.obtenir(d.id).nVariantes === 3);
  v('supprimer : retire la stratégie ; la lignée restante garde au moins ses propres variantes', reg.supprimer(d.id) && !reg.obtenir(d.id) && reg.obtenir(id).nVariantes >= 2);
  v('persistance : l’état se relit à l’identique', (() => { const r2 = creerRegistre(reg.etat(), { maintenant }); return JSON.stringify(r2.liste()) === JSON.stringify(reg.liste()); })());
  v('état illisible : registre neuf, pas de plantage', creerRegistre({ version: 99 }).liste().length === 0 && creerRegistre('x').liste().length === 0);
  v('liste : aucune valeur « undefined »', !JSON.stringify(reg.liste()).match(/undefined|NaN/));
}

// ── étiquettes de confiance ──
v('étiquettes honnêtes', etiquetteConfiance({}).code === 'non_testee' && etiquetteConfiance({ dernierVerdict: 'ne_bat_pas' }).etiquette === 'NON VALIDÉE' && etiquetteConfiance({ dernierVerdict: 'pas_assez' }).etiquette === 'NON VALIDÉE' && etiquetteConfiance({ dernierVerdict: 'bat_le_hasard' }).etiquette === 'BACKTEST'
  && /PAS validée|pas validée/i.test(etiquetteConfiance({ dernierVerdict: 'bat_le_hasard' }).phrase) && etiquetteConfiance({ dernierVerdict: 'ne_bat_pas', direct: { n: 25, esperance: 0.3 } }).etiquette.startsWith('CONFIRMÉE EN RÉEL') && etiquetteConfiance({ dernierVerdict: 'x', direct: { n: 10, esperance: 0.3 } }).code !== 'confirmee');

// ── alertes : compte simulé, cohérent avec le backtest ──
const M = marcheM5({ n: 40000, graine: 21, derive: DERIVE_PLANTEE });
const strat = validerStrategie(base({ nom: 'Envolée', conditions: [{ type: 'heures', de: 13, a: 14 }], stop: { type: 'atr', tf: 'h1', k: 2 }, sortie: { type: 'cible_R', R: 2 } })).strategie;
const confiance = etiquetteConfiance({ dernierVerdict: 'ne_bat_pas' });
const rec = { id: 'ms1', nom: 'Envolée', strategie: strat, confiance };
function rejouer(serie, strategies, depuis = 20000, pas = 1) {
  let etat = etatMSVide(); const alertes = [];
  for (let i = depuis; i < serie.n; i += pas) { const r = avancerMS({ etat, ctx: construireContexte(couper(serie, i)), strategies, paire: 'BTC', maintenant: () => 0 }); etat = r.etat; alertes.push(...r.alertes); }
  return { etat, alertes };
}
const T0 = Date.now(); const { etat, alertes } = rejouer(M, [rec], 36000, 1);
const entrees = alertes.filter(a => a.type === 'ENTREE'), sorties = alertes.filter(a => a.type === 'SORTIE');
v('rejeu bougie par bougie : des entrées et des sorties sont alertées', entrees.length >= 1 && sorties.length >= 1, entrees.length + '/' + sorties.length + ' en ' + (Date.now() - T0) + ' ms');
v('chaque alerte porte l’étiquette NON VALIDÉE et « aucun ordre n’est passé »', alertes.every(a => a.etiquette === 'NON VALIDÉE' && /NON VALIDÉE/.test(a.texte) && /Aucun ordre/.test(a.texte)));
v('l’entrée donne sens, prix, stop, objectif, raison, régime, étiquette de confiance', entrees.every(a => a.sens === 1 && a.entree > 0 && a.stop < a.entree && a.cible > a.entree && a.raison.length >= 1 && a.aide.regime && a.confiance));
v('aucune alerte en double (identifiants uniques)', new Set(alertes.map(a => a.id)).size === alertes.length);
v('aucune alerte ne contient undefined / NaN / [object Object]', !JSON.stringify(alertes).match(/undefined|NaN|\[object/));
// cohérence avec le backtest : mêmes entrées (signal → exécution à l'ouverture suivante), mêmes sorties
{
  const ctx = construireContexte(M), bt = simulerMS(ctx, strat, {}, { de: 36000, a: M.n }).trades;
  const compte = etat.comptes['ms1:BTC'], fermees = compte.fermees;
  const memes = fermees.filter(f => bt.some(b => b.t === f.t && Math.abs(b.R - f.R) < 0.15));
  v('le compte simulé retrouve les trades du backtest (même entrée, R proche : l’objectif des alertes est calculé au signal)', fermees.length >= 1 && memes.length >= Math.floor(fermees.length * 0.8), memes.length + '/' + fermees.length + ' (backtest : ' + bt.length + ')');
  v('une position à la fois par stratégie', fermees.every((f, i) => i === 0 || f.t >= fermees[i - 1].tSortie - PAS * 2));
  const p = perfDirect(compte); v('performance directe : nombre, espérance, taux calculés', p.n === fermees.length && p.esperance != null && p.tauxReussite >= 0 && p.tauxReussite <= 1);
}
// redémarrage : rejouer deux fois la même bougie ne double rien ; une bougie déjà vue est ignorée
{
  const ctx = construireContexte(couper(M, 36100)); let e = etatMSVide(); const r1 = avancerMS({ etat: e, ctx, strategies: [rec], paire: 'BTC' }), r2 = avancerMS({ etat: r1.etat, ctx, strategies: [rec], paire: 'BTC' });
  v('même bougie traitée deux fois : rien de nouveau la deuxième fois', r2.alertes.length === 0);
}
// deux stratégies suivies séparément
{
  const strat2 = validerStrategie(base({ nom: 'Autre', conditions: [{ type: 'heures', de: 13, a: 14 }], stop: { type: 'fixe', pct: 1.5 }, sortie: { type: 'suiveur', k: 3, tf: 'h1' } })).strategie;
  const r = rejouer(M, [rec, { id: 'ms2', nom: 'Autre', strategie: strat2, confiance: etiquetteConfiance({ dernierVerdict: 'bat_le_hasard' }) }], 36000, 1);
  v('deux stratégies : deux comptes séparés, deux étiquettes différentes', Object.keys(r.etat.comptes).length === 2 && r.alertes.some(a => a.strategie === 'ms1' && a.etiquette === 'NON VALIDÉE') && r.alertes.some(a => a.strategie === 'ms2' && a.etiquette === 'BACKTEST'));
  v('sortie par stop suiveur : motif cohérent', r.alertes.filter(a => a.strategie === 'ms2' && a.type === 'SORTIE').every(a => ['stop', 'stop suiveur', 'temps'].includes(a.motif)));
}
// sortie sur signal : alertée à l'ouverture suivante
{
  const strat3 = validerStrategie(base({ nom: 'Signal', conditions: [{ type: 'heures', de: 13, a: 14 }], sortie: { type: 'signal', conditions: [{ type: 'heures', de: 15, a: 16 }] } })).strategie;
  const r = rejouer(M, [{ id: 'ms3', nom: 'Signal', strategie: strat3, confiance }], 36000, 1);
  v('sortie sur signal : alertes de sortie « signal de sortie »', r.alertes.some(a => a.type === 'SORTIE' && a.motif === 'signal'), JSON.stringify(r.alertes.filter(a => a.type === 'SORTIE').map(a => a.motif)));
}
// aide à la décision
{
  const s = validerStrategie(base({ conditions: [{ type: 'cassure', tf: 'm15', N: 48 }] })).strategie, ctx = construireContexte(M), aide = aideSignal(ctx, s, 1, 30000);
  v('aide : régime, qualité de cassure et risque de fausse cassure', typeof aide.regime === 'string' && aide.qualiteCassure && ['faible', 'moyen', 'élevé', 'inconnu'].includes(aide.fausseCassure));
  v('aide : pas de cassure → pas de ligne cassure', aideSignal(ctx, strat, 1, 30000).qualiteCassure === null);
}

console.log(`\n${ok} réussis, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
