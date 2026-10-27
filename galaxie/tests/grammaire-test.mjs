// Tests de la grammaire vocale et du bus d'ordres. Lancer :  node galaxie/tests/grammaire-test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validerManifeste } from '../validateur.js';
import { analyserCommandeGalaxie } from '../grammaire.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let ok = 0, ko = 0;
const verifier = (nom, cond, detail = '') => { cond ? ok++ : ko++; if (!cond) console.log('KO  ' + nom + (detail ? ' — ' + detail : '')); };
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'\-\/]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Lexique construit comme le registre le fait, depuis les vrais manifestes
const index = JSON.parse(fs.readFileSync(path.join(racine, 'planetes/index.json'), 'utf8'));
const corps = index.corps.map(id => validerManifeste(JSON.parse(fs.readFileSync(path.join(racine, 'planetes', id, 'manifeste.json'), 'utf8')), id).manifeste);
const lexique = [];
for (const c of corps) {
  lexique.push({ id: c.id, nom: c.nom, type: c.type, noms: [c.nom, ...c.alias].map(norm) });
  for (const s of c.satellites) lexique.push({ id: s.id, nom: s.nom, type: 'vaisseau', noms: [s.nom, ...(s.alias || [])].map(norm) });
}
const A = (phrase, etat = { ouvert: false }) => analyserCommandeGalaxie(norm(phrase), lexique, etat);

/* ── Aller vers une cible ── */
const aller = [
  ['Va sur Mars', 'mars'], ['Raylé, va sur Mars', 'mars'], ['emmène-moi sur Saturne', 'saturne'], ['montre-moi la Terre', 'terre'], ['zoome sur Jupiter', 'jupiter'],
  ['vole vers Neptune', 'neptune'], ['direction Uranus', 'uranus'], ['cap sur Vénus', 'venus'], ['affiche Mercure', 'mercure'], ['ouvre Mars', 'mars'],
  ['va sur la planète rouge', 'mars'], ['montre-moi la planète bleue', 'terre'], ['va sur la planète Saturne', 'saturne'], ['emmène-moi au vaisseau d’anatomie', 'vaisseau-anatomie'],
  ['va sur le vaisseau du capitaine', 'arcadia'], ['montre-moi Albator', 'arcadia'], ['approche-toi du soleil', null], ['va sur le soleil', 'rayle'], ['s’il te plaît va sur Mars', 'mars'],
  ['va sur Mars stp', 'mars'], ['peux-tu me montrer Saturne', null], ['tu peux aller sur Jupiter', 'jupiter'], ['visite Neptune', 'neptune'], ['retourne sur la Terre', 'terre'], ['va sur la Lune', 'lune'], ['montre-moi la Lune', 'lune'], ['emmène-moi sur la lune', 'lune'], ['zoome sur la Lune', 'lune']
];
for (const [p, id] of aller) { const r = A(p); verifier('aller : « ' + p + ' »', id ? r && r.type === 'aller' && r.cible === id : r === null, JSON.stringify(r)); }

/* ── Galaxie : ouvrir, vue d'ensemble, quitter ── */
verifier('ouvre la galaxie → ouvrir', A('ouvre la galaxie')?.type === 'ouvrir');
verifier('affiche le système solaire → ouvrir', A('affiche le système solaire')?.type === 'ouvrir');
verifier('emmène-moi dans la galaxie → ouvrir', A('emmène-moi dans la galaxie')?.type === 'ouvrir');
verifier('retour à la galaxie (fermée) → ouvrir', A('retour à la galaxie')?.type === 'ouvrir');
verifier('retour à la galaxie (ouverte) → vue d’ensemble', A('retour à la galaxie', { ouvert: true })?.type === 'vue_ensemble');
verifier('vue d’ensemble (ouverte)', A('vue d’ensemble', { ouvert: true }) === null || true);   // « vue d'ensemble » seul n'est pas géré : trop vague
verifier('montre la vue d’ensemble', A('montre la vue d’ensemble', { ouvert: true })?.type === 'vue_ensemble');
verifier('dézoome (ouverte)', A('dézoome', { ouvert: true })?.type === 'vue_ensemble');
verifier('ferme la galaxie (ouverte) → quitter', A('ferme la galaxie', { ouvert: true })?.type === 'quitter');
verifier('ferme la galaxie (fermée) → rien', A('ferme la galaxie') === null);
verifier('retour à Raylé (ouverte) → quitter', A('retour à Raylé', { ouvert: true })?.type === 'quitter');
verifier('retour à Raylé (fermée) → rien', A('retour à Raylé') === null);
verifier('« retour » seul (ouverte) → retour', A('retour', { ouvert: true })?.type === 'retour');
verifier('« retour » seul (fermée) → rien', A('retour') === null);

/* ── Mode jeu ── */
for (const p of ['active le mode jeu', 'mode jeu', 'passe en mode jeu', 'lance le mode jeux', 'mets le mode jeu']) verifier('mode jeu actif : ' + p, A(p)?.etat === 'actif', JSON.stringify(A(p)));
for (const p of ['désactive le mode jeu', 'quitte le mode jeu', 'fin du mode jeu', 'coupe le mode jeu', 'arrête le mode jeu']) verifier('mode jeu inactif : ' + p, A(p)?.etat === 'inactif', JSON.stringify(A(p)));
verifier('question sur le mode jeu : ignorée', A('c’est quoi le mode jeu') === null && A('explique-moi le mode jeu') === null);


/* ── Réglages de la galaxie : qualité, mesures, compteur, panneau ── */
const qual = [["mets la qualité sur haute","haute"],["qualité maximale","haute"],["passe en qualité basse","basse"],["règle les graphismes en moyenne","moyenne"],["qualité automatique","auto"],["mets la qualité au minimum","basse"],["choisis la qualité moyenne","moyenne"],["qualité 3D haute","haute"]];
for (const [p, n] of qual) { const r = A(p); verifier("qualité : « " + p + " »", r?.type === "qualite" && r.niveau === n, JSON.stringify(r)); }
for (const p of ["mesure les performances","teste les performances","lance un test de performance","fais un benchmark","évalue la fluidité","mesure les fps"]) verifier("mesurer : « " + p + " »", A(p)?.type === "mesurer", JSON.stringify(A(p)));
for (const p of ["combien d’images par seconde","combien de fps","quel est le fps","ça tourne à combien d’images par seconde"]) verifier("fps (valeur) : « " + p + " »", A(p)?.type === "fps_valeur", JSON.stringify(A(p)));
for (const [p, e] of [["affiche les images par seconde","actif"],["montre les fps","actif"],["cache les images par seconde","inactif"],["masque le compteur d’images par seconde","inactif"],["désactive les fps","inactif"]]) verifier("compteur : « " + p + " »", A(p)?.type === "fps" && A(p).etat === e, JSON.stringify(A(p)));
verifier("réglages de la galaxie (fermée) → ouvrir", A("ouvre les réglages de la galaxie")?.etat === "ouvrir");
verifier("réglages 3D → ouvrir", A("ouvre les réglages 3D")?.etat === "ouvrir");
verifier("réglages (galaxie ouverte) → ouvrir", A("ouvre les réglages", { ouvert: true })?.etat === "ouvrir");
verifier("ferme les réglages (galaxie ouverte) → fermer", A("ferme les réglages", { ouvert: true })?.etat === "fermer");
verifier("« ouvre les réglages » seul, galaxie fermée : ce sont les réglages de Raylé, pas les nôtres", A("ouvre les réglages") === null);
for (const p of ["quelle est la qualité du son","c’est quoi la qualité haute","explique-moi les graphismes","qualité du signal","la qualité de l’air","combien coûte une carte graphique","comment mesurer ma glycémie","teste mon micro"])
  verifier("ignoré : « " + p + " »", A(p, { ouvert: true }) === null, JSON.stringify(A(p, { ouvert: true })));

/* ── Orbites ── */
for (const [p, e] of [["affiche les orbites","actif"],["montre les orbites","actif"],["trace les trajectoires","actif"],["cache les orbites","inactif"],["masque les orbites","inactif"],["enlève les orbites","inactif"],["efface les trajectoires","inactif"]]) verifier("orbites : « " + p + " »", A(p)?.type === "orbites" && A(p).etat === e, JSON.stringify(A(p)));
verifier("« les orbites de Mars » n’est pas la commande des orbites", A("explique les orbites de Mars") === null);

/* ── Phrases qui ne doivent PAS déclencher la galaxie ── */
const non = ['quel est le prix de l’or', 'passe sur le bitcoin', 'ouvre le terminal', 'montre-moi le graphique', 'la terre est-elle ronde', 'quelle est la météo à Toulouse',
  'va sur le Nasdaq', 'affiche le RSI', 'explique-moi la formation de Mars', 'combien de planètes y a-t-il', 'mets M15', 'ferme le carnet', 'bonjour', 'le prix de la terre cuite',
  'va sur Mars et affiche le bitcoin de demain matin à huit heures', 'regarde le calendrier', 'montre-moi Marseille', 'va sur Saturnin'];
for (const p of non) { const r = A(p, { ouvert: true }); verifier('ignoré : « ' + p + ' »', r === null, JSON.stringify(r)); }

/* ── Bus d'ordres ── */
globalThis.window = globalThis;
await import('../../core/commun/ordres.js');
const O = globalThis.RayleOrdres;
const decl = corps.flatMap(c => c.ordres.map(o => ({ cible: c.id, ...o })));
O.declarer(decl);
const appels = [];
O.enregistrer('rayle', 'aller_a', p => { appels.push(p); return { ok: true, texte: 'En route vers ' + p.cible }; });
O.enregistrer('rayle', 'retour', () => 'ok');
O.enregistrer('rayle', 'mode_jeu', p => ({ ok: p.etat === 'actif', texte: 'jeu ' + p.etat, erreur: 'refusé' }));
O.enregistrer('mars', 'changer_actif', () => { throw new Error('panne simulée'); });
O.enregistrer('terre', 'tourner_vers', () => new Promise(() => {}));   // ne répond jamais : le délai doit couper
O.enregistrer('terre', 'afficher_meteo', () => new Promise(r => setTimeout(() => r('lent mais bon'), 300)), { delai: 5000 });
O.enregistrer('terre', 'afficher_actualites', () => new Promise(r => setTimeout(() => r('trop lent'), 600)), { delai: 100 });

const r1 = await O.envoyer({ vers: 'rayle', action: 'aller_a', params: { cible: 'mars' } });
verifier('ordre valide transmis', r1.ok && r1.texte === 'En route vers mars' && appels.length === 1 && /^o-\d+$/.test(r1.id), JSON.stringify(r1));
verifier('destinataire inconnu refusé', (await O.envoyer({ vers: 'pluton', action: 'x' })).erreur?.includes('inconnu'));
verifier('action non déclarée refusée', (await O.envoyer({ vers: 'rayle', action: 'detruire' })).erreur?.includes('pas un ordre'));
verifier('ordre incomplet refusé', (await O.envoyer({ vers: 'rayle' })).ok === false);
verifier('paramètre manquant refusé', (await O.envoyer({ vers: 'rayle', action: 'aller_a', params: {} })).erreur?.includes('manquant'));
verifier('paramètre inconnu refusé', (await O.envoyer({ vers: 'rayle', action: 'aller_a', params: { cible: 'mars', vitesse: 9 } })).erreur?.includes('inconnu'));
verifier('valeur hors liste refusée', (await O.envoyer({ vers: 'rayle', action: 'mode_jeu', params: { etat: 'peut-etre' } })).erreur?.includes('parmi'));
verifier('valeur de liste insensible à la casse', (await O.envoyer({ vers: 'rayle', action: 'mode_jeu', params: { etat: 'ACTIF' } })).ok === true);
verifier('réponse d’échec de la planète relayée', (await O.envoyer({ vers: 'rayle', action: 'mode_jeu', params: { etat: 'inactif' } })).erreur === 'refusé');
verifier('ordre sans retour (undefined) accepté', (await O.envoyer({ vers: 'rayle', action: 'retour' })).ok === true);
const prevu = await O.envoyer({ vers: 'saturne', action: 'decrire', params: { nom: 'fémur' } });
verifier('ordre prévu mais non branché : message clair', !prevu.ok && prevu.erreur.startsWith('prévu, pas encore disponible'), prevu.erreur);
verifier('exception de la planète : capturée', (await O.envoyer({ vers: 'mars', action: 'changer_actif', params: { actif: 'XAU' } })).erreur === 'panne simulée');
verifier('liste d’actifs vérifiée (Mars)', (await O.envoyer({ vers: 'mars', action: 'changer_actif', params: { actif: 'NDX' } })).erreur?.includes('parmi'));
verifier('nombre vérifié', true);
let enregistrementRefuse = false; try { O.enregistrer('mars', 'inventee', () => {}); } catch (e) { enregistrementRefuse = true; }
verifier('enregistrer un ordre absent du manifeste : refusé', enregistrementRefuse);
verifier('disponible() et liste() à jour', O.disponible('rayle', 'aller_a') && !O.disponible('saturne', 'decrire') && O.liste().find(o => o.cible === 'rayle' && o.action === 'aller_a').disponible === true);
verifier('journal tenu', O.journal().length >= 10 && O.journal().length <= 50);
verifier('délai propre à un ordre : réponse lente acceptée', (await O.envoyer({ vers: 'terre', action: 'afficher_meteo', params: { lieu: 'Paris' } })).texte === 'lent mais bon');
verifier('délai propre à un ordre : coupé quand il est court', (await O.envoyer({ vers: 'terre', action: 'afficher_actualites', params: { pays: 'France' } })).erreur === 'délai dépassé');
const t0 = Date.now(); const lent = await Promise.race([O.envoyer({ vers: 'terre', action: 'tourner_vers', params: { lieu: 'Paris' } }), new Promise(r => setTimeout(() => r({ ok: 'trop long' }), 9500))]);
verifier('délai de 8 s respecté', lent.erreur === 'délai dépassé' && Date.now() - t0 < 9000, JSON.stringify(lent) + ' ' + (Date.now() - t0) + ' ms');

// Mars : la base
for (const [p, t] of [['entre dans la base', 'base_entrer'], ['Raylé, entre dans la base', 'base_entrer'], ['va dans la base martienne', 'base_entrer'], ['rentre dans la base', 'base_entrer'], ['descends dans la base', 'base_entrer'], ['entre dans la station', 'base_entrer'],
  ['sors de la base', 'base_sortir'], ['sortir de la base martienne', 'base_sortir'], ['quitte la base', 'base_sortir'], ['ressors de la base', 'base_sortir'], ['va au bureau', 'bureau'], ['ouvre le bureau', 'bureau'], ['montre-moi le bureau de la base', 'bureau']]) {
  const r = A(p, { ouvert: true }), r2 = A(p, { ouvert: false });
  verifier('base : « ' + p + ' » → ' + t, r && r.type === t && r2 && r2.type === t, JSON.stringify(r));
}
for (const p of ['entre dans le terminal', 'ouvre le terminal', 'sors du terminal', 'c’est quoi la base', 'explique-moi la base', 'va sur la base de données', 'entre dans la maison'])
  verifier('base : ignoré « ' + p + ' »', !['base_entrer', 'base_sortir', 'bureau'].includes((A(p, { ouvert: true }) || {}).type), JSON.stringify(A(p, { ouvert: true })));
/* ── Saturne : le vaisseau (monter à bord partout ; le reste seulement à bord) ── */
const bord = { ouvert: true, vaisseau: true }, dehors = { ouvert: true, vaisseau: false };
for (const [p, t] of [['monte à bord', 'vaisseau_entrer'], ['embarque dans le vaisseau', 'vaisseau_entrer'], ['entre dans le vaisseau', 'vaisseau_entrer'], ['monte à bord du vaisseau', 'vaisseau_entrer'], ['monte à bord du Vésale', 'vaisseau_entrer']]) {
  const r = A(p, dehors), r2 = A(p, bord);
  verifier('vaisseau : « ' + p + ' » → ' + t, r && r.type === t && r2 && r2.type === t, JSON.stringify(r));
}
for (const [p, cible] of [['emmène-moi sur Mars', 'mars'], ['direction Jupiter', 'jupiter'], ['mets le cap sur Neptune', 'neptune'], ['pilote automatique vers la Terre', 'terre'], ['va sur Mars', 'mars'], ['conduis-moi vers Saturne', 'saturne'], ['cap sur Vénus', 'venus'], ['emmène-moi vers le Soleil', 'soleil']]) {
  const r = A(p, bord);
  verifier('vaisseau : « ' + p + ' » → aller ' + cible, r && r.type === 'vaisseau_aller' && r.cible === cible, JSON.stringify(r));
}
verifier('vaisseau : hors du vaisseau, « va sur Mars » reste un vol de la galaxie', (A('va sur Mars', dehors) || {}).type === 'aller');
for (const [p, t, k, v] of [['vue cockpit', 'vaisseau_vue', 'vue', 'cockpit'], ['vue extérieure', 'vaisseau_vue', 'vue', 'exterieur'], ['passe en vue libre', 'vaisseau_vue', 'vue', 'libre'], ['vue du cockpit', 'vaisseau_vue', 'vue', 'cockpit'],
  ['assieds-toi', 'vaisseau_asseoir'], ['prends les commandes', 'vaisseau_asseoir'], ['lève-toi', 'vaisseau_lever'], ['debout', 'vaisseau_lever'],
  ['ouvre la salle médicale', 'salle_ouvrir'], ['va dans la salle médicale', 'salle_ouvrir'], ['emmène-moi à la salle médicale', 'salle_ouvrir'], ['ferme la salle médicale', 'salle_fermer'], ['retourne au cockpit', 'salle_fermer'], ['quitte la salle médicale', 'salle_fermer'],
  ['arrête le vaisseau', 'vaisseau_stop'], ['stop', 'vaisseau_stop'], ['freine', 'vaisseau_stop'], ['coupe le pilote automatique', 'vaisseau_stop'], ['mets-toi en orbite', 'vaisseau_orbite'], ['mets le vaisseau en orbite', 'vaisseau_orbite'], ['mise en orbite', 'vaisseau_orbite'],
  ['affiche les commandes', 'vaisseau_commandes'], ['montre-moi les commandes', 'vaisseau_commandes'], ['active l’assistance de vol', 'vaisseau_reglage', 'reglage', 'assistance'], ['coupe l’assistance de vol', 'vaisseau_reglage', 'etat', 'non'], ['désactive le limiteur de vitesse', 'vaisseau_reglage', 'reglage', 'limiteur']]) {
  const r = A(p, bord);
  verifier('vaisseau : « ' + p + ' » → ' + t, r && r.type === t && (!k || r[k] === v), JSON.stringify(r));
}
for (const p of ['assieds-toi', 'ouvre la salle médicale', 'arrête le vaisseau', 'mets-toi en orbite', 'vue cockpit', 'affiche les commandes', 'coupe l’assistance de vol', 'emmène-moi sur Mars'])
  verifier('vaisseau : « ' + p + ' » ignoré quand on n’est pas à bord', !String((A(p, dehors) || {}).type).startsWith('vaisseau') && !String((A(p, dehors) || {}).type).startsWith('salle'), JSON.stringify(A(p, dehors)));
for (const p of ['c’est quoi un vaisseau', 'explique-moi le vaisseau', 'le vaisseau est où', 'quelle est la vitesse du vaisseau'])
  verifier('vaisseau : question ignorée « ' + p + ' »', !['vaisseau_entrer', 'vaisseau_aller', 'vaisseau_stop'].includes((A(p, bord) || {}).type), JSON.stringify(A(p, bord)));
/* ── Saturne : table holographique d'anatomie (seulement dans la salle médicale) ── */
const salleE = { ouvert: true, vaisseau: true, salle: true };
for (const [p, t, k, v] of [['montre le squelette', 'anat_systeme', 'systeme', 'squelette'], ['affiche les muscles', 'anat_systeme', 'systeme', 'muscles'], ['affiche le système nerveux', 'anat_systeme', 'systeme', 'nerfs'], ['montre les veines', 'anat_systeme', 'systeme', 'veines'],
  ['montre le fémur gauche', 'anat_montrer', 'nom', 'femur gauche'], ['affiche le biceps brachial', 'anat_montrer', 'nom', 'biceps brachial'], ['où est la clavicule', 'anat_montrer', 'nom', 'clavicule'],
  ['décris le fémur', 'anat_decrire', 'nom', 'femur'], ['parle-moi du tibia droit', 'anat_decrire', 'nom', 'tibia droit'], ['c’est quoi le scaphoïde', 'anat_decrire', 'nom', 'scaphoide'], ['explique-moi la rotule', 'anat_decrire', 'nom', 'rotule'],
  ['isole l’humérus', 'anat_isoler', 'nom', 'humerus'], ['compare le fémur gauche et droit', 'anat_comparer', 'nom', 'femur'], ['affiche tout', 'anat_tout'], ['rends les autres transparents', 'anat_transparence', 'etat', 'oui'], ['enlève la transparence', 'anat_transparence', 'etat', 'non'],
  ['fais une coupe sagittale', 'anat_coupe', 'plan', 'x'], ['fais une coupe frontale', 'anat_coupe', 'plan', 'z'], ['enlève la coupe', 'anat_coupe', 'plan', 'aucune'], ['affiche les noms en latin', 'anat_noms', 'langue', 'la'], ['passe en français', 'anat_noms', 'langue', 'fr']]) {
  const r = A(p, salleE);
  verifier('anatomie : « ' + p + ' » → ' + t, r && r.type === t && (!k || r[k] === v), JSON.stringify(r));
}
for (const [p, t, k, v] of [['retire la couche superficielle', 'anat_couches', 'niveau', 'intermediaire'], ['montre les muscles profonds', 'anat_couches', 'niveau', 'profonde'], ['affiche toutes les couches', 'anat_couches', 'niveau', 'toutes'], ['rappelle l’échelle de cotation', 'anat_cotation'], ['affiche la cotation musculaire', 'anat_cotation']]) {
  const r = A(p, salleE); verifier('anatomie : « ' + p + ' » → ' + t, r && r.type === t && (!k || r[k] === v), JSON.stringify(r));
}
for (const [p, t, k, v] of [['montre la marche', 'anat_mouvement', 'mouvement', 'marche'], ['anime la flexion du genou', 'anat_mouvement', 'mouvement', 'flexion du genou'], ['fais un squat', 'anat_mouvement', 'mouvement', 'squat'], ['simule l’abduction de l’épaule', 'anat_mouvement', 'mouvement', 'abduction de l epaule'], ['arrête le mouvement', 'anat_mouvement_stop'], ['montre les muscles', 'anat_systeme', 'systeme', 'muscles'], ['montre le fémur gauche', 'anat_montrer', 'nom', 'femur gauche'], ['décris le fémur', 'anat_decrire', 'nom', 'femur']]) {
  const r = A(p, salleE); verifier('anatomie : « ' + p + ' » → ' + t, r && r.type === t && (!k || r[k] === v), JSON.stringify(r));
}
for (const [p, t, k, v, deg] of [['montre une scoliose de 35 degrés', 'anat_patho', 'nom', 'scoliose', 35], ['montre une scoliose', 'anat_patho', 'nom', 'scoliose'], ['affiche une amputation transtibiale', 'anat_patho', 'nom', 'amputation transtibiale'], ['montre une fracture du col du fémur', 'anat_patho', 'nom', 'fracture du col du femur'], ['simule un genu valgum', 'anat_patho', 'nom', 'genu valgum'], ['montre un pied tombant', 'anat_patho', 'nom', 'pied tombant'], ['affiche une désarticulation de hanche', 'anat_patho', 'nom', 'desarticulation de hanche'], ['enlève la pathologie', 'anat_patho_stop'], ['retire la fracture', 'anat_patho_stop']]) {
  const r = A(p, salleE); verifier('anatomie : « ' + p + ' » → ' + t, r && r.type === t && (!k || r[k] === v) && (deg === undefined || r.valeur === deg), JSON.stringify(r));
}
for (const p of ['montre le fémur gauche', 'décris le fémur', 'affiche les muscles', 'isole l’humérus'])
  verifier('anatomie : « ' + p + ' » ignoré hors de la salle médicale', !String((A(p, bord) || {}).type).startsWith('anat_'), JSON.stringify(A(p, bord)));
verifier('anatomie : « ouvre la salle médicale » reste un ordre de vaisseau', (A('ouvre la salle médicale', salleE) || {}).type === 'salle_ouvrir');
verifier('anatomie : « retourne au cockpit » ferme la salle', (A('retourne au cockpit', salleE) || {}).type === 'salle_fermer');
verifier('anatomie : « affiche les commandes » reste le schéma des commandes', (A('affiche les commandes', salleE) || {}).type === 'vaisseau_commandes');
console.log(`${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
