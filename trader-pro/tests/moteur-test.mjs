/* Tests du moteur de visite guidée (v11) : ordre des pages, segments, voix unique, commandes vocales, données manquantes, historique, préparation de l'étape suivante. Fausse voix, faux écran, fausses données. */
import { creerMoteur, commandeRapport, SILENCE } from '../rapports/moteur.js';
import { demandeRapport } from '../rapports/construire.js';
import { fauxSrc } from './rapports-faux.mjs';
let ok = 0, ko = 0; const t = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const ATT = ms => new Promise(r => setTimeout(r, ms));

/* ───── fausse mémoire de navigateur ───── */
const faussMem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

/* ───── environnement simulé ───── */
function creerEnv({ src = fauxSrc(), store = faussMem(), msParCar = 0.15, maintenant = () => Date.now(), reglages = {} } = {}) {
  const J = { ouvertures: [], etapes: [], segments: [], parles: [], messages: [], pauses: [], fins: [], ferme: 0, graphiques: 0, prep: null, prechauffes: [], annotations: [], enCours: 0, maxEnCours: 0 };
  let courant = null; // { fin(interrompu), restant, pause }
  const env = {
    src, store, maintenant, reglages: { ecoute: 15, pageMax: 40, prepMin: 40, delaiEtape: 8000, anticipe: 200, ...reglages },
    quota: () => ({ mois: new Date().toISOString().slice(0, 7), n: 120000, limite: 490000 }),
    parler(texte, { surProgression, vitesse }) {
      J.parles.push({ texte, t: Date.now(), vitesse }); J.enCours++; J.maxEnCours = Math.max(J.maxEnCours, J.enCours);
      return new Promise(res => {
        const dur = Math.max(30, texte.length * msParCar), c = courant = { restant: dur, pause: false, t0: Date.now(), done: false };
        const fin = interrompu => { if (c.done) return; c.done = true; clearInterval(iv); J.enCours--; if (courant === c) courant = null; res({ interrompu }); };
        c.fin = fin; const iv = setInterval(() => { if (c.pause) { c.t0 = Date.now() - (dur - c.restant); return; } const e = Date.now() - c.t0; c.restant = dur - e; surProgression && surProgression(Math.min(1, e / dur), Math.max(0, dur - e)); if (e >= dur) fin(false); }, 10);
      });
    },
    pauseVoix() { if (courant) courant.pause = true; }, reprendreVoix() { if (courant) courant.pause = false; },
    arreterVoix() { if (courant) courant.fin(true); },
    voixLibre: async () => {}, prechauffer: x => J.prechauffes.push(x), annoter: async l => { J.annotations.push(l); },
    ecran: {
      prep: (r, b) => { J.prep = { r, b }; }, etape: (s, i, n, mode) => J.etapes.push({ id: s.id, i, n, mode }), segment: (s, k, mode) => J.segments.push({ id: s.id, k, mode, montrer: (s.segments[k] || {}).montrer }),
      page: async s => { J.ouvertures.push({ id: s.id, page: s.page, t: Date.now() }); await ATT(5); }, pause: (b, ext) => J.pauses.push({ b, ext }), message: m => J.messages.push(m),
      fin: d => J.fins.push(d), fermer: d => { J.ferme++; J.dernier = d; }, graphique: s => { J.graphiques++; J.graphiqueSur = s.id; }, enrichi: () => {}
    }
  };
  return { env, J, externe: texte => { J.parles.push({ texte, externe: true }); if (courant) courant.fin(true); } };
}

/* ───── 1 · rapport complet sur l'or, de bout en bout ───── */
{
  const { env, J } = creerEnv(), M = creerMoteur(env);
  const r = await M.lancer({ type: 'complet', actif: 'or' });
  t(r.ok && r.etapes === 9 && r.estimation > 3000 && r.budget.texte.includes('caractères'), 'complet : 9 étapes et estimation du coût annoncée — ' + (r.budget && r.budget.texte));
  t(J.prep && J.prep.b.azureUtilise === 120000 && J.prep.b.azureReste === 380000, 'budget : compteur Azure du mois lu');
  await M.attendreFin();
  const ids = J.etapes.filter(e => e.id !== 'comparaison').map(e => e.id);
  t(JSON.stringify(ids) === JSON.stringify(['contexte', 'weekly', 'daily', 'h4', 'volume', 'cot', 'valo', 'scenarios', 'risque']), 'complet : étapes dans l’ordre — ' + ids.join(','));
  const pages = J.ouvertures.map(o => o.page && (o.page.fenetre + (o.page.section ? ':' + o.page.section : '') + (o.page.unite ? ':' + o.page.unite : '') + (o.page.mode ? ':' + o.page.mode : '')));
  t(pages[0] === 'marches:aujourdhui' && /terminal:J:volume/.test(pages[1]) && pages[2] === 'terminal:J:classique' && pages[3] === 'terminal:H4:classique' && /terminal:H4:volume/.test(pages[4]) && pages[5] === 'marches:cot' && pages[6] === 'invest:mesactifs' && pages[7] === 'terminal:H4:classique' && pages[8] === 'portefeuille:risque', 'complet : bonnes pages ouvertes dans l’ordre — ' + pages.join(' > '));
  /* anticipation : la page de l'étape suivante s'ouvre pendant la fin de la voix de l'étape en cours (le son joue pendant que la page charge) */
  { const ou = J.ouvertures.map(o => o.t), fins = J.parles.map(x => x.t + 1), debut = k => J.parles[k].t; let avant = 0; for (let k = 1; k < 9; k++) { const prochain = J.parles[k >= 5 ? k + 1 : k]; if (prochain && ou[k] != null && ou[k] < prochain.t) avant++; } void fins; void debut; t(avant >= 7, 'la page de l’étape suivante est ouverte avant que sa voix ne démarre (' + avant + '/8)'); }
  t(new Set(J.ouvertures.map(o => o.id)).size === J.ouvertures.length, 'chaque page n’est ouverte qu’une fois (pas de double ouverture avec l’anticipation)');
  t(J.parles.length === 10 && J.parles.filter(p => /^Carnet et footprint/.test(p.texte)).length === 1, 'une seule requête de voix par étape, sauf Volume : le carnet et le footprint en direct sont dits ensuite (' + J.parles.length + ')');
  const iv = J.parles.findIndex(p => /^Volume :/.test(p.texte)); t(iv >= 0 && /^Carnet et footprint/.test(J.parles[iv + 1].texte), 'la lecture en direct du carnet suit immédiatement le texte du Volume');
  t(J.maxEnCours === 1, 'une seule voix à la fois');
  const seg = J.segments.filter(s => s.id === 'weekly'); t(seg.length === 6 && seg.every((s, i) => s.k === i), 'weekly : les 6 segments sont révélés dans l’ordre, un par un');
  t(J.segments.some(s => s.montrer && s.montrer.some(m => m.type === 'bougie')) && J.segments.some(s => s.montrer && s.montrer.some(m => m.type === 'prix')) && J.segments.some(s => s.montrer && s.montrer.some(m => m.type === 'zone')), 'des bougies, des niveaux et des zones sont mis en avant');
  t(J.annotations.length === 1 && J.annotations[0].length >= 3, 'scénarios : annotations posées dans la couche Rayle (' + (J.annotations[0] || []).length + ')');
  const d = M.dernier(); t(d && d.raison === 'fini' && d.entree && d.entree.etapes.length === 9, 'rapport terminé et enregistré dans l’historique');
  t(d.caracteres > 3000 && d.caracteres < 8000, 'coût réel dans un budget raisonnable (' + d.caracteres + ' caractères) ; estimation ' + r.estimation);
  t(d.ecarts.length === 8 && Math.max(...d.ecarts) < 2000, 'aucun blanc de plus de 2 s entre deux étapes (max ' + Math.max(...d.ecarts) + ' ms)');
  t(J.prechauffes.length >= 7, 'la voix des étapes suivantes est préparée d’avance (' + J.prechauffes.length + ')');
  t(M.historique().length === 1 && M.historique()[0].scenarios && M.historique()[0].scenarios.principal, 'historique : date, actif, résumé, scénarios');
  t(J.parles.every(p => !/undefined|NaN|null/.test(p.texte)), 'aucun « undefined » ni « NaN » dans les textes dits');
}

/* ───── 2 · la préparation de l'étape suivante cache la latence des données ───── */
{
  const src = fauxSrc({ delai: 160 }), { env, J } = creerEnv({ src, msParCar: 0.5, reglages: { prepMin: 40 } }), M = creerMoteur(env);
  await M.lancer({ type: 'cot', actif: 'or' }); await M.attendreFin(); const d = M.dernier();
  t(d.raison === 'fini' && d.lues.length === 6, 'cot : 6 étapes lues malgré 160 ms de latence par donnée');
  t(Math.max(...d.ecarts) < 600, 'latence masquée : blanc maximal ' + Math.max(...d.ecarts) + ' ms entre deux étapes');
  void J;
}

/* ───── 3 · rapports COT sur l'or, le Nasdaq, l'EUR/USD ───── */
for (const [actif, inst] of [['or', 'OR'], ['us100', 'NASDAQ'], ['eurusd', 'EURUSD']]) {
  const src = fauxSrc(), { env, J } = creerEnv({ src }), M = creerMoteur(env); await M.lancer({ type: 'cot', actif }); await M.attendreFin();
  t(J.etapes.map(e => e.id).join(',') === 'positions,indice,oi,divergence,historique,conclusion', 'COT ' + actif + ' : positions, indice, intérêt ouvert, divergence, historique, conclusion');
  t(src.appels.includes('cot:' + inst), 'COT ' + actif + ' : lit le rapport ' + inst);
  t(J.ouvertures.every(o => o.page.fenetre === 'marches' && o.page.section === 'cot' && o.page.actif === actif), 'COT ' + actif + ' : page Marchés → COT ouverte sur le bon actif');
  t(J.segments.some(s => s.montrer && s.montrer.some(m => m.type === 'element')), 'COT ' + actif + ' : chaque indicateur est mis en évidence sur la page');
  const txt = J.parles.map(p => p.texte).join(' ');
  t(/indice COT/i.test(txt) && /intérêt ouvert/i.test(txt) && /petits spéculateurs ne sont pas fournis/.test(txt) && /indicateur lent/.test(txt) && /mardi/.test(txt), 'COT ' + actif + ' : indicateurs lus, limites dites (lent, donnée du mardi, petits spéculateurs absents)');
  if (actif === 'eurusd') t(/n’affiche pas l’EUR\/USD/.test(txt.replace(/'/g, '’')) && /prix de l’EUR\/USD n’est pas disponible/.test(txt.replace(/'/g, '’')), 'COT eurusd : dit que la fenêtre ne l’affiche pas et que le prix manque, sans inventer');
}

/* ───── 4 · rapport marché global et rapport macro ───── */
{
  const { env, J } = creerEnv(), M = creerMoteur(env); await M.lancer({ type: 'marche' }); await M.attendreFin();
  const ids = J.etapes.map(e => e.id).filter(x => x !== 'comparaison');
  t(ids.length === 13 && ids[0] === 'climat' && ids[1] === 'actif-or' && ids[8] === 'actif-dxy' && ids[9] === 'top1-lecture' && ids[12] === 'top2-scenarios', 'marché : climat, 8 actifs, puis top 2 avec lecture et scénarios — ' + ids.join(','));
  t(['or', 'us100', 'us500', 'btc', 'sol', 'petrole', 'eurusd', 'dxy'].every(a => J.etapes.some(e => e.id === 'actif-' + a)), 'marché : les huit actifs sont passés en revue');
  t(J.ouvertures.filter(o => o.id.startsWith('actif-') && o.page.fenetre === 'terminal').every(o => o.page.unite === 'H4'), 'marché : graphique de chaque actif ouvert');
  const M2 = creerEnv(), m2 = creerMoteur(M2.env); await m2.lancer({ type: 'macro' }); await m2.attendreFin();
  t(M2.J.etapes.map(e => e.id).join(',') === 'semaine,annonce-1,annonce-2,annonce-3,annonce-4', 'macro : la semaine puis les annonces à venir');
  const txt = M2.J.parles.map(p => p.texte).join(' ');
  t(/Consensus 0,3 pour cent, précédent 0,3 pour cent/.test(txt) && /mécanisme classique/i.test(txt) && /n’est pas conservé|pas de réaction passée/.test(txt), 'macro : consensus, précédent, mécanisme et limite sur les réactions passées');
  const d = m2.dernier(); t(d.manques.length === 1 && /pas d’autre annonce/.test(d.manques[0]), 'macro : une annonce de moins que prévu est annoncée comme manquante, pas inventée');
}

/* ───── 5 · données manquantes : on le dit et on passe à la suite ───── */
{
  const src = fauxSrc({ sans: ['cot', 'carnet_et_volume', 'mes_actifs'] }), { env, J } = creerEnv({ src }), M = creerMoteur(env); await M.lancer({ type: 'complet', actif: 'or' }); await M.attendreFin();
  const d = M.dernier(); t(d.raison === 'fini' && d.lues.length === 9, 'données manquantes : les 9 étapes sont quand même passées');
  t(d.manques.some(x => /^COT/.test(x)) && d.manques.some(x => /^Valorisation/.test(x)), 'manques listés : ' + d.manques.map(x => x.slice(0, 40)).join(' | '));
  const cot = J.parles.find(p => /^COT :/.test(p.texte)); t(cot && /Je passe à la suite/.test(cot.texte) && cot.texte.length < 200, 'COT manquant : une phrase courte, puis la suite');
  const src2 = fauxSrc({ sans: ['pro'] }); const E2 = creerEnv({ src: src2 }), m2 = creerMoteur(E2.env); await m2.lancer({ type: 'complet', actif: 'or' }); await m2.attendreFin();
  t(m2.dernier().raison === 'fini' && m2.dernier().manques.length >= 3, 'sans prix du tout : rapport terminé proprement, étapes concernées annoncées manquantes');
  const src3 = { ...fauxSrc(), async outil() { throw new Error('boum'); } }; const E3 = creerEnv({ src: src3 }), m3 = creerMoteur(E3.env); await m3.lancer({ type: 'complet', actif: 'or' }); await m3.attendreFin();
  t(m3.dernier().raison === 'fini' && E3.J.parles.length >= 9, 'un outil qui plante ne bloque pas la visite');
}

/* ───── 6 · commandes vocales pendant un rapport ───── */
{
  const E = creerEnv({ msParCar: 0.6 }), { env, J } = E, M = creerMoteur(env); await M.lancer({ type: 'complet', actif: 'or' });
  const attendreEtape = async (id, ms = 4000) => { const t0 = Date.now(); while (!J.etapes.some(e => e.id === id) && Date.now() - t0 < ms) await ATT(10); };
  await attendreEtape('weekly'); await ATT(60);
  t(M.commande('Rayle, suivant') === SILENCE, '« suivant » traité sans parole');
  await attendreEtape('daily'); t(J.etapes.some(e => e.id === 'daily'), '« suivant » : passe à l’étape suivante (Daily)');
  await ATT(40); t(M.commande('reviens') === SILENCE, '« reviens » traité (et non « ferme la fenêtre »)');
  await ATT(120); const dernierId = J.etapes[J.etapes.length - 1].id; t(dernierId === 'weekly', '« reviens » : retour à l’étape précédente (' + dernierId + ')');
  const nb = J.parles.length; M.commande('pause'); await ATT(40); t(M.etat().pause === true && J.pauses.some(p => p.b === true), '« pause » : le rapport s’arrête');
  const avant = J.segments.length; await ATT(150); t(J.segments.length === avant, 'en pause : plus aucune animation ne se déclenche');
  t(M.commande('reprends') === SILENCE && M.etat().pause === false, '« reprends » : reprise');
  await ATT(40); M.commande('détaille ça'); await ATT(150);
  const det = J.parles.slice(nb).find(p => /Détail Weekly/.test(p.texte)); t(!!det, '« détaille ça » : lit le détail de l’étape en cours');
  t(J.etapes.some(e => e.mode === 'detail'), '« détaille ça » : étape marquée « détail » à l’écran');
  await ATT(120); M.commande('montre-moi sur le graphique'); await ATT(20); t(J.graphiques === 1 && !!J.graphiqueSur, '« montre-moi sur le graphique » : retour au graphique sur le point évoqué (' + J.graphiqueSur + ')');
  const v = M.etat().vitesse; M.commande('plus vite'); t(M.etat().vitesse > v, '« plus vite » : vitesse augmentée');
  const rep = M.commande('stop'); await M.attendreFin(); t(rep === 'Rapport arrêté.' && M.etat().fin === 'stop' && J.ferme === 1, '« stop » : le rapport s’arrête et l’écran se ferme');
  t(M.dernier().entree && M.dernier().entree.titre.includes('(arrêté)'), 'un rapport arrêté après plusieurs étapes est gardé, marqué « arrêté »');
  t(J.maxEnCours === 1, 'commandes : toujours une seule voix à la fois');
}
{
  /* une autre demande (question) met le rapport en pause, « reprends » le relance depuis l’étape en cours */
  const E = creerEnv({ msParCar: 0.5 }), { env, J } = E, M = creerMoteur(env); await M.lancer({ type: 'complet', actif: 'or' });
  while (!J.etapes.some(e => e.id === 'weekly')) await ATT(10); await ATT(40);
  t(M.commande('quelle heure est-il') === null, 'une question pendant le rapport n’est pas avalée (elle passe au cerveau)');
  E.externe('Il est quatorze heures.'); await ATT(60);
  t(M.etat().pause === true && J.pauses.some(p => p.ext), 'la question met le rapport en attente (la voix est unique)');
  const n = J.parles.length; t(M.commande('reprends') === SILENCE, '« reprends » après la question'); await ATT(60); t(J.parles.length > n && J.parles[J.parles.length - 1].texte === J.parles.find(p => /^Weekly/.test(p.texte)).texte, 'l’étape interrompue est relue depuis le début');
  M.commande('stop'); await M.attendreFin();
  /* « suivant » sur la dernière étape termine le rapport */
  const E2 = creerEnv({ msParCar: 0.05 }), M2 = creerMoteur(E2.env); await M2.lancer({ type: 'cot', actif: 'or' }); while (E2.J.etapes.length < 6) { if (E2.J.etapes.length) M2.commande('suivant'); await ATT(20); }
  await ATT(30); M2.commande('suivant'); await M2.attendreFin(); t(M2.dernier().raison === 'fini', '« suivant » à la dernière étape termine proprement');
}

/* ───── 7 · historique, comparaison avec le rapport précédent, suppression ───── */
{
  let maintenant = Date.UTC(2026, 10, 21, 10, 0); const store = faussMem();
  const E1 = creerEnv({ store, maintenant: () => maintenant, msParCar: 0.02 }), M1 = creerMoteur(E1.env); await M1.lancer({ type: 'complet', actif: 'or' }); await M1.attendreFin();
  t(M1.historique().length === 1 && !M1.dernier().comparaison.disponible, 'premier rapport : rien à comparer');
  maintenant = Date.UTC(2026, 10, 22, 10, 0);
  const src2 = fauxSrc(); const baisse = src2.outil; src2.outil = async (n, a) => { const r = await baisse(n, a); if (n === 'analyse_marche' && r && r.prix) { const k = 0.9965; r.prix = +(r.prix * k).toFixed(2); r.position.auDessus.forEach(x => { x.prix = +(x.prix * 1).toFixed(2); }); } return r; };
  const E2 = creerEnv({ store, src: src2, maintenant: () => maintenant, msParCar: 0.02 }), M2 = creerMoteur(E2.env); await M2.lancer({ type: 'complet', actif: 'or' }); await M2.attendreFin();
  const c = M2.dernier().comparaison; t(c.disponible && /depuis hier/i.test(c.phrase) && /pour cent/.test(c.phrase), 'comparaison : « depuis hier, le prix est passé de … à … » — ' + c.phrase.slice(0, 160));
  t(E2.J.parles[E2.J.parles.length - 1].texte.startsWith('Par rapport au rapport précédent'), 'la comparaison est dite à la fin');
  t(M2.historique().length === 2 && M2.comparaisonDe(M2.historique()[1].id).disponible, 'historique : 2 rapports, comparaison consultable après coup');
  const id0 = M2.historique()[0].id; M2.supprimer(id0); t(M2.historique().length === 1, 'suppression d’un rapport de l’historique');
  M2.vider(); t(M2.historique().length === 0, 'historique vidé');
}

/* ───── 8 · nouvelle demande pendant un rapport : l’ancien s’arrête, jamais deux voix ───── */
{
  const E = creerEnv({ msParCar: 0.3 }), { env, J } = E, M = creerMoteur(env); await M.lancer({ type: 'complet', actif: 'or' });
  while (!J.etapes.some(e => e.id === 'contexte')) await ATT(10); await ATT(50);
  const rep = M.commande('Rayle, rapport COT sur le Nasdaq'); t(/rapport COT/.test(rep), 'nouvelle demande : annoncée (« ' + rep + ' »)');
  await ATT(900); await M.attendreFin(); t(J.maxEnCours === 1, 'nouvelle demande : jamais deux voix en même temps'); t(J.etapes.some(e => e.id === 'positions'), 'nouvelle demande : le rapport COT remplace le rapport complet');
  M.commande('stop');
}

/* ───── 9 · reconnaissance des demandes et des commandes ───── */
{
  const D = x => demandeRapport(x);
  t(D('Rayle, rapport complet sur l’or')?.type === 'complet' && D('rapport complet sur l’or').actif === 'or', 'demande : rapport complet sur l’or');
  t(D('fais-moi un rapport complet sur le Nasdaq').actif === 'us100', 'demande : Nasdaq');
  t(D('Rayle, rapport COT sur l’or').type === 'cot' && D('rapport COT sur le Nasdaq').actif === 'us100' && D('rapport COT sur l’EUR/USD').actif === 'eurusd', 'demande : COT or, Nasdaq, EUR/USD');
  t(D('Rayle, rapport sur le marché').type === 'marche' && D('rapport marché global').type === 'marche', 'demande : marché global');
  t(D('Rayle, quelles annonces cette semaine et quel impact ?').type === 'macro' && D('rapport macro et calendrier').type === 'macro', 'demande : macro et calendrier');
  t(D('Rayle, où en est mon portefeuille') === null && D('ouvre le terminal') === null && D('fais-moi un point sur l’or') === null, 'les autres phrases ne déclenchent pas de rapport');
  t(D('rapport complet sur le bitcoin').actif === 'btc' && D('rapport complet').parDefaut === true, 'demande : Bitcoin ; sans actif → or par défaut');
  const C = commandeRapport;
  t(C('suivant') === 'suivant' && C('Rayle, reviens') === 'precedent' && C('mets-toi en pause') === 'pause' && C('reprends') === 'reprendre' && C('stop') === 'stop' && C('détaille ça') === 'detail' && C('montre-moi sur le graphique') === 'graphique', 'commandes vocales reconnues');
  t(C('quelle heure est-il') === null && C('qu’est-ce que tu vois') === null, 'une question n’est pas une commande');
}
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `moteur : tout passe (${ok})`); process.exit(ko ? 1 : 0);
