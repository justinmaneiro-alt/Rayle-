// Tests des règles d'alertes (pur) : anti-saturation, heures silencieuses, dédoublonnage, mise en forme, OBSERVATION, MACRO.
// Lancer :  node planetes/mars/tests/alertes-regles-test.mjs
import * as R from '../pc/alertes/regles.js';
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const base = R.reglagesValides({ actif: true, silence: false });
// 2026-10-22 (jeudi) 12:00 UTC = 14:00 Paris (heure d'été jusqu'au 25/10)
const T0 = Date.UTC(2026, 9, 22, 12, 0), MIN = 60000;
const prep = (id, t, cle) => ({ id, cle: cle || id, type: 'PREPARATION', t, sens: 1, texte: 'PRÉPARATION · test', phase: 'range' });

/* réglages */
v('défaut : veilleur désactivé', R.REGLAGES_DEFAUT.actif === false && R.REGLAGES_DEFAUT.types.OBSERVATION === false);
v('réglages : bornés', R.reglagesValides({ maxParJour: 9999, reposMinutes: -4, silenceDebut: '25:99', inconnu: 1 }).maxParJour === 50 && R.reglagesValides({ reposMinutes: -4 }).reposMinutes === 0 && R.reglagesValides({ silenceDebut: '25:99' }).silenceDebut === '23:00');
v('réglages : types/canaux', R.reglagesValides({ types: { OBSERVATION: true, XXX: true } }).types.OBSERVATION === true && !('XXX' in R.reglagesValides({ types: { XXX: true } }).types));
v('réglages : rappels triés', R.reglagesValides({ macroAvantMinutes: [15, 60, 15, 'a'] }).macroAvantMinutes.join() === '60,15');
v('réglages : défaut non muté', R.REGLAGES_DEFAUT.types.MACRO === true && Object.isFrozen(R.REGLAGES_DEFAUT));

/* silence */
const sil = R.reglagesValides({ actif: true, silence: true, silenceDebut: '23:00', silenceFin: '07:00' });
v('silence : 14 h Paris = non', !R.enSilence(T0, sil));
v('silence : 23 h 30 Paris = oui', R.enSilence(Date.UTC(2026, 9, 22, 21, 30), sil));
v('silence : 3 h Paris = oui (passe minuit)', R.enSilence(Date.UTC(2026, 9, 23, 1, 0), sil));
v('silence : 7 h pile = non', !R.enSilence(Date.UTC(2026, 9, 23, 5, 0), sil));
v('silence : désactivé', !R.enSilence(Date.UTC(2026, 9, 23, 1, 0), { ...sil, silence: false }));
v('décision : silence bloque PREPARATION', R.decider([], prep('a', 0), sil, Date.UTC(2026, 9, 23, 1, 0)).raison === 'heures silencieuses');
const entree = { id: 'E:1', type: 'ENTREE', t: 0, sens: 1, entree: 100000, stop: 99000, cible: 105000, R: 5, risquePct: 1, risqueCash: 100, phase: 'tendance haussière', nomStrategie: 'Test' };
v('décision : silence bloque ENTREE par défaut', !R.decider([], entree, sil, Date.UTC(2026, 9, 23, 1, 0)).envoyer);
v('décision : ENTREE passe si « entrée toujours »', R.decider([], entree, { ...sil, entreeToujours: true }, Date.UTC(2026, 9, 23, 1, 0)).envoyer);

/* décision */
v('désactivé : rien', !R.decider([], prep('a', T0), { ...base, actif: false }, T0).envoyer);
v('type désactivé : OBSERVATION', R.decider([], { id: 'o', type: 'OBSERVATION', t: T0 }, base, T0).raison.includes('désactivé'));
let h = [];
let d = R.decider(h, prep('a', T0), base, T0); v('première alerte envoyée', d.envoyer);
h = R.inscrire(h, prep('a', T0), T0);
v('même identifiant : jamais deux fois', R.decider(h, prep('a', T0 + 999 * MIN), base, T0 + 999 * MIN).raison === 'déjà envoyée');
v('même clé : dédoublonnée', R.decider(h, prep('b', T0 + 100 * MIN, 'a'), base, T0 + 100 * MIN).raison.startsWith('même situation'));
v('même clé : repart après le délai', R.decider(h, prep('c', T0 + 400 * MIN, 'a'), base, T0 + 400 * MIN).envoyer);
v('repos entre deux alertes', R.decider(h, prep('d', T0 + 5 * MIN), base, T0 + 5 * MIN).raison.startsWith('repos'));
v('repos écoulé', R.decider(h, prep('e', T0 + 21 * MIN), base, T0 + 21 * MIN).envoyer);

/* plafonds */
{
  const r = R.reglagesValides({ actif: true, silence: false, reposMinutes: 0, maxParJour: 3, maxParSemaine: 4 });
  let hh = [], envoyees = 0;
  for (let i = 0; i < 10; i++) { const t = T0 + i * 30 * MIN, a = prep('p' + i, t); if (R.decider(hh, a, r, t).envoyer) { hh = R.inscrire(hh, a, t); envoyees++; } }
  v('maximum par jour : 3 sur 10 propositions', envoyees === 3, String(envoyees));
  // jours suivants du même semaine : la limite hebdomadaire (4) s'applique
  let n2 = 0;
  for (let j = 1; j <= 3; j++) { const t = T0 + j * 86400000, a = prep('q' + j, t); if (R.decider(hh, a, r, t).envoyer) { hh = R.inscrire(hh, a, t); n2++; } }
  v('maximum par semaine : 4 au total', envoyees + n2 === 4, String(envoyees + n2));
  const t = T0 + 5 * 86400000; // lundi suivant (26 oct.)
  v('nouvelle semaine : on repart', R.decider(hh, prep('z', t), r, t).envoyer);
  v('ENTREE jamais plafonnée', R.decider(hh, { ...entree, id: 'E:9' }, r, T0 + 3 * 86400000).envoyer);
}
{
  const r = R.reglagesValides({ actif: true, silence: false, maxMacroParJour: 2 });
  let hh = [];
  const m = i => ({ id: 'M:' + i, cle: 'M:' + i, type: 'MACRO', t: T0 });
  for (let i = 0; i < 3; i++) { if (R.decider(hh, m(i), r, T0).envoyer) hh = R.inscrire(hh, m(i), T0); }
  v('MACRO : 2 par jour', hh.length === 2);
}
v('historique : purge des vieilles entrées', R.inscrire([{ id: 'x', type: 'MACRO', cle: 'x', t: 0 }], prep('n', T0), T0).length === 1);

/* mise en forme */
const msg = R.formaterMessage(entree);
v('ENTREE : tous les champs', ['ACHAT', '100', '99', '105', '5 R', 'tendance haussière', 'Invalidation', 'Taille', '0,1 BTC', 'conseil'].every(s => msg.replace(/ | /g, ' ').includes(s.replace(' ', ' ')) || msg.replace(/ | /g, ' ').includes(s)), msg);
v('ENTREE vente', R.formaterMessage({ ...entree, sens: -1 }).includes('VENTE'));
const mo = R.formaterMessage({ type: 'OBSERVATION', texte: 'x' });
v('OBSERVATION : étiquetée non validée, jamais une entrée', mo.includes('NON VALIDÉ') && mo.includes('PAS une entrée') && !mo.includes('ENTRÉE BITCOIN'));
v('PREPARATION : pas une entrée', R.formaterMessage(prep('a', 0)).includes('pas encore une entrée'));

/* OBSERVATION */
const lec = (extra = {}) => ({ ok: true, derniereBougie: T0, prix: 100000, phase: { code: 1, phase: 'tendance haussière', enChangement: false, raison: 'raison' }, volume: { relatif4h: 1, note: 'x' }, direction: { lecture: 'acheteurs dominants sur 24 h', estime: false, divergence: null }, zones: { dessus: { type: 'POC 7 j', prix: 101000, distanceATR: 2 }, dessous: { type: 'x', prix: 99000, distanceATR: 2 } }, ...extra });
v('observation : rien de notable → rien', R.observationsDepuisLecture(lec(), { phaseCode: 1 }).alertes.length === 0);
v('observation : changement de phase', R.observationsDepuisLecture(lec(), { phaseCode: 3 }).alertes.some(a => a.id.startsWith('O:phase')));
v('observation : pas de changement de phase au 1er calcul', R.observationsDepuisLecture(lec(), null).alertes.length === 0);
v('observation : phase non confirmée ignorée', R.observationsDepuisLecture(lec({ phase: { code: 2, phase: 'b', enChangement: true } }), { phaseCode: 1 }).alertes.length === 0);
v('observation : volume très élevé', R.observationsDepuisLecture(lec({ volume: { relatif4h: 3.1 } }), { phaseCode: 1 }).alertes.some(a => a.id.startsWith('O:volume')));
v('observation : prix sur une zone', R.observationsDepuisLecture(lec({ zones: { dessus: { type: 'POC 7 j', prix: 100050, distanceATR: 0.1 }, dessous: null } }), { phaseCode: 1 }).alertes.some(a => a.id.startsWith('O:zone')));
v('observation : toutes marquées non validées', R.observationsDepuisLecture(lec({ volume: { relatif4h: 4 } }), { phaseCode: 3 }).alertes.every(a => a.validee === false && a.type === 'OBSERVATION'));
v('observation : lecture indisponible', R.observationsDepuisLecture({ ok: false }, { phaseCode: 1 }).alertes.length === 0);

/* MACRO */
const evt = { id: 'cpi', titre: 'Inflation US (CPI)', t: T0 + 50 * MIN, impact: 'high', pays: 'US', precedent: '3,0 %', prevu: '3,1 %' };
let al = R.alertesMacro([evt], base, T0);
v('macro : rappel 60 min', al.length === 1 && al[0].id === 'M:cpi:avant:60', JSON.stringify(al.map(a => a.id)));
al = R.alertesMacro([evt], base, T0 + 40 * MIN);
v('macro : à 10 min, seul le rappel 15 min', al.length === 1 && al[0].id === 'M:cpi:avant:15');
v('macro : événement passé sans résultat → rien', R.alertesMacro([evt], base, T0 + 70 * MIN).length === 0);
v('macro : résultat publié', R.alertesMacro([{ ...evt, reel: '3,4 %' }], base, T0 + 70 * MIN).some(a => a.id === 'M:cpi:resultat' && a.texte.includes('3,4')));
v('macro : résultat trop ancien ignoré', R.alertesMacro([{ ...evt, reel: '3,4 %' }], base, T0 + 5 * 3600e3).length === 0);
v('macro : impact faible ignoré', R.alertesMacro([{ ...evt, impact: 'medium' }], base, T0).length === 0);
v('macro : seuil abaissé', R.alertesMacro([{ ...evt, impact: 'medium' }], { ...base, macroImpactMin: 'medium' }, T0).length === 1);
v('macro : résultat coupé', R.alertesMacro([{ ...evt, reel: '1' }], { ...base, macroResultat: false }, T0 + 70 * MIN).length === 0);
v('macro : deux rappels successifs passent le dédoublonnage', (() => {
  let hh = []; const a1 = R.alertesMacro([evt], base, T0)[0]; hh = R.inscrire(hh, a1, T0);
  const a2 = R.alertesMacro([evt], base, T0 + 40 * MIN)[0]; return R.decider(hh, a2, base, T0 + 40 * MIN).envoyer;
})());
v('macro : message avec précédent et prévu', R.formaterMessage(R.alertesMacro([evt], base, T0)[0]).includes('précédent 3,0 %'));

console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
