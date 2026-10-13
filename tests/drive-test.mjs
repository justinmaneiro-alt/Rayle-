// Module Drive de Raylé avec une FAUSSE API Google (tests/lib-drive.mjs) :   node tests/drive-test.mjs
// Couvre : recherche d'un document par nom approximatif, extraction de passage (paragraphe, titre, page, mot-clé, suite), analyseur de phrases,
// modification (Google Docs, Word, texte) avec conservation de la mise en forme, aperçu/validation, annulation, vérification après écriture, erreurs honnêtes.
import assert from 'node:assert/strict';
import { trouverFichier, scoreNom } from '../js/drive/texte.js';
import { passage, texteLecture, chercher, resumer, plan, appliquerOps, diffOps } from '../js/drive/modele.js';
import { analyser } from '../js/drive/commandes.js';
import { lireGdoc } from '../js/drive/fmt-gdoc.js';
import { lireDocx, modifierDocx } from '../js/drive/fmt-docx.js';
import { lireTexte, ecrireTexte, paragraphesPdf, paragraphesFeuille, paragraphesDiapos } from '../js/drive/fmt-autres.js';
import { creerApi, MIME } from '../js/drive/api.js';
import { FauxDrive, FauxGoogleDoc, FauxJSZip, octetsDocx, monterService } from './lib-drive.mjs';

let ok = 0;
const t = async (nom, f) => { try { await f(); ok++; console.log('  ✔', nom); } catch (e) { console.log('  ✘', nom, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; } };

/* ───── documents d'exemple ───── */
const PARAS_ANATOMIE = [
  { texte: 'Anatomie du membre inférieur', style: 'HEADING_1' },
  { texte: 'Introduction', style: 'HEADING_2' },
  { texte: 'Le fémur est l’os le plus long du corps humain. Il s’articule avec le bassin.', gras: [[3, 8]] },
  { texte: 'Le tibia se situe en dedans du péroné, il supporte le poids du corp.' },
  { texte: 'Muscles', style: 'HEADING_2' },
  { texte: 'Le quadriceps étend le genou. Le biceps fémoral le fléchit.' },
  { texte: 'Conclusion', style: 'HEADING_2' },
  { texte: 'Fin du cours.' }
];
const nouveauDrive = () => {
  const d = new FauxDrive();
  d.ajouter('doc1', { name: 'Cours d’anatomie – UE2', mimeType: MIME.gdoc }, new FauxGoogleDoc(PARAS_ANATOMIE));
  d.ajouter('doc2', { name: 'Rapport de stage', mimeType: MIME.gdoc }, new FauxGoogleDoc([{ texte: 'Rapport', style: 'HEADING_1' }, { texte: 'Mon stage s’est bien passé.' }]));
  return d;
};
const AUTORISES = [{ id: 'doc1', name: 'Cours d’anatomie – UE2', mimeType: MIME.gdoc }, { id: 'doc2', name: 'Rapport de stage', mimeType: MIME.gdoc }, { id: 'doc3', name: 'Cours de physiologie – UE3', mimeType: MIME.gdoc }];
const CORRIGE = async (texte) => texte.replace('du corp.', 'du corps.');
const avecService = async (opts = {}, drive = nouveauDrive()) => {
  const m = await monterService(drive, { correcteur: CORRIGE, ...opts });
  m.service.memoriser(AUTORISES.slice(0, 2));
  return { ...m, drive };
};

/* ═════════════ 1. recherche d'un document par son nom ═════════════ */
console.log('Recherche de document par nom');
await t('« le cours d’anatomie » retrouve « Cours d’anatomie – UE2 » (articles, apostrophes, accents ignorés)', () => {
  const r = trouverFichier(AUTORISES, 'le cours d’anatomie'); assert.ok(r.ok); assert.equal(r.fichier.id, 'doc1');
  assert.equal(trouverFichier(AUTORISES, 'cours d anatomie').fichier.id, 'doc1');
  assert.equal(trouverFichier(AUTORISES, 'RAPPORT DE STAGE').fichier.id, 'doc2');
});
await t('une faute de frappe est tolérée (« anatomi », « physiologie »), pas un mot différent', () => {
  assert.equal(trouverFichier(AUTORISES, 'cours anatomi').fichier.id, 'doc1');
  assert.equal(trouverFichier(AUTORISES, 'le cour de phisiologie').fichier.id, 'doc3');
  assert.equal(trouverFichier(AUTORISES, 'cours de biomécanique').ok, false);
});
await t('deux candidats proches → ambigu, avec la liste (jamais un choix au hasard)', () => {
  const r = trouverFichier(AUTORISES, 'le cours'); assert.equal(r.ok, false); assert.equal(r.raison, 'ambigu'); assert.equal(r.candidats.length, 2);
});
await t('liste vide ou inconnu : raison explicite', () => {
  assert.equal(trouverFichier([], 'x').raison, 'vide'); assert.equal(trouverFichier(AUTORISES, 'budget 2027').raison, 'aucun');
  assert.ok(scoreNom('rapport', 'Rapport de stage') > 0.6 && scoreNom('terminal', 'Rapport de stage') === 0);
});

/* ═════════════ 2. extraction de passage ═════════════ */
console.log('Extraction de passage');
const modeleAnat = lireGdoc(new FauxGoogleDoc(PARAS_ANATOMIE).get('x'));
const docAnat = { paragraphes: modeleAnat.paragraphes };
await t('le 2e paragraphe = le 2e paragraphe de TEXTE (les titres ne comptent pas)', () => {
  const r = passage(docAnat, { type: 'paragraphe', n: 2 }); assert.ok(r.ok); assert.equal(docAnat.paragraphes[r.indices[0]].texte.startsWith('Le tibia'), true);
  assert.equal(passage(docAnat, { type: 'paragraphe', n: -1 }).indices[0], 7);
  const trop = passage(docAnat, { type: 'paragraphe', n: 9 }); assert.equal(trop.ok, false); assert.match(trop.raison, /n’a que 4 paragraphes/);
});
await t('par titre : la section complète, jusqu’au titre suivant de même niveau', () => {
  const r = passage(docAnat, { type: 'titre', texte: 'muscles' }); assert.ok(r.ok); assert.deepEqual(r.indices, [4, 5]);
  const intro = passage(docAnat, { type: 'titre', texte: 'introduction' }); assert.deepEqual(intro.indices, [1, 2, 3]);
  const inconnu = passage(docAnat, { type: 'titre', texte: 'Biomécanique' }); assert.equal(inconnu.ok, false); assert.match(inconnu.raison, /Les titres que je vois : .*Introduction.*Muscles/);
});
await t('par mot-clé (insensible aux accents) et recherche avec contexte et section', () => {
  const r = passage(docAnat, { type: 'motcle', texte: 'quadriceps' }); assert.deepEqual(r.indices, [5]);
  const c = chercher(docAnat, 'femur'); assert.equal(c.total, 1); assert.equal(c.resultats[0].section, 'Introduction');
  const b = chercher(docAnat, 'biceps'); assert.equal(b.resultats[0].section, 'Muscles'); assert.match(b.resultats[0].extrait, /biceps fémoral/);
  assert.equal(chercher(docAnat, 'cervelet').total, 0);
});
await t('« la suite » reprend après le dernier paragraphe lu ; fin de document signalée', () => {
  const s = passage(docAnat, { type: 'suite', apres: 5 }); assert.deepEqual(s.indices, [6, 7]);
  const fin = passage(docAnat, { type: 'suite', apres: 7 }); assert.equal(fin.ok, false); assert.equal(fin.fin, true);
});
await t('lecture à voix haute : limitée en taille, s’arrête à la fin d’un paragraphe, indique qu’il en reste', () => {
  const l = texteLecture(docAnat, [2, 3, 5], 100); assert.deepEqual(l.lus, [2]); assert.equal(l.reste, true);
  const tout = texteLecture(docAnat, [2, 3], 5000); assert.equal(tout.reste, false); assert.match(tout.texte, /^Le fémur est l’os le plus long/);
});
await t('page : un PDF/Word avec pages ; sans pages, on le dit au lieu d’inventer', () => {
  assert.equal(passage(docAnat, { type: 'page', n: 1 }).ok, false); assert.match(passage(docAnat, { type: 'page', n: 1 }).raison, /ne me donne pas les pages/);
});
await t('résumé extractif : uniquement des phrases du document, jamais de texte inventé', () => {
  const r = resumer(docAnat); assert.ok(r.ok);
  const corpsTexte = docAnat.paragraphes.map(p => p.texte).join(' ');
  for (const ligne of r.lignes) { const phrase = ligne.includes(' : ') ? ligne.split(' : ').slice(1).join(' : ') : ligne; assert.ok(corpsTexte.includes(phrase), 'phrase absente du document : ' + phrase); }
  assert.equal(resumer({ paragraphes: [{ texte: 'Court.', niveau: 0 }] }).ok, false);
});

/* ═════════════ 3. analyseur de phrases ═════════════ */
console.log('Analyseur de phrases');
const A = (txt, ctx = {}) => analyser(txt, { fichiers: AUTORISES, configure: true, ...ctx });
await t('ouvrir : par nom approximatif ; « ouvre le terminal » reste à la charge des autres modules', () => {
  assert.deepEqual(A('ouvre le cours d’anatomie'), { op: 'ouvrir', nom: 'cours d’anatomie' });
  assert.equal(A('Raylé, ouvre le document rapport de stage depuis le Drive').nom, 'rapport de stage');
  for (const p of ['ouvre le terminal', 'ouvre l’anatomie', 'ouvre YouTube', 'montre-moi Mars', 'lis-moi les actualités', 'cherche la météo de demain', 'résume cet article']) assert.equal(A(p), null, p);
  assert.equal(A('ouvre le document budget 2027').op, 'ouvrir');                  // document inconnu : le service proposera le sélecteur
});
await t('lire : paragraphe, page, titre, mot-clé, suite, avec ou sans nom de document', () => {
  assert.deepEqual(A('lis le 2e paragraphe du cours d’anatomie'), { op: 'lire', cible: { type: 'paragraphe', n: 2 }, doc: 'cours d’anatomie' });
  assert.deepEqual(A('lis la page 3 du rapport de stage').cible, { type: 'page', n: 3 });
  assert.deepEqual(A('lis la partie sur les muscles', { ouverte: true }).cible, { type: 'titre', texte: 'les muscles', repli: 'motcle' });
  assert.deepEqual(A('lis le passage où il est question de l’humérus', { ouverte: true }).cible, { type: 'motcle', texte: 'l’humérus' });
  assert.deepEqual(A('lis le dernier paragraphe', { ouverte: true }).cible, { type: 'paragraphe', n: -1 });
  assert.deepEqual(A('lis-moi la suite', { ouverte: true }), { op: 'lire', cible: { type: 'suite' } });
  assert.deepEqual(A('lis le troisième paragraphe', { ouverte: true }).cible, { type: 'paragraphe', n: 3 });
  assert.equal(A('lis-moi la suite'), null, 'sans document ouvert, « la suite » ne regarde pas Drive');
});
await t('résumer · chercher · lister · connexion · sélecteur · état', () => {
  assert.equal(A('résume le cours d’anatomie').op, 'resumer'); assert.equal(A('fais-moi un résumé du document', { ouverte: true }).op, 'resumer');
  assert.deepEqual([A('cherche humérus dans le cours d’anatomie').op, A('cherche humérus dans le cours d’anatomie').texte], ['chercher', 'humérus']);
  assert.equal(A('où est-il question de la rotule dans le document', { ouverte: true }).texte, 'la rotule');
  assert.equal(A('liste mes documents').op, 'lister'); assert.equal(A('quels documents sont autorisés ?').op, 'lister');
  assert.equal(A('connecte-toi à Google Drive').op, 'connecter'); assert.equal(A('déconnecte-toi de Google').op, 'deconnecter');
  assert.equal(A('ajoute un document du drive').op, 'selecteur'); assert.equal(A('quel document est ouvert ?').op, 'etat');
});
await t('modifier : corriger, remplacer, ajouter (sous un titre, à la fin), supprimer, « applique directement »', () => {
  const m = A('corrige la faute dans le 2e paragraphe', { ouverte: true });
  assert.deepEqual([m.op, m.action.k, m.cible, m.direct], ['modifier', 'corriger', { type: 'paragraphe', n: 2 }, false]);
  assert.equal(A('applique directement : corrige la faute dans le 1er paragraphe', { ouverte: true }).direct, true);
  const r = A('remplace tibia par fibula dans le 2e paragraphe', { ouverte: true }); assert.deepEqual(r.action, { k: 'remplacer', de: 'tibia', vers: 'fibula' }); assert.deepEqual(r.cible, { type: 'paragraphe', n: 2 });
  const a = A('ajoute ce paragraphe sous le titre Introduction : Bonjour le monde.', { ouverte: true });
  assert.deepEqual(a.action, { k: 'ajouter', texte: 'Bonjour le monde.', position: { k: 'sous-titre', titre: 'Introduction' } });
  const f = A('ajoute « Merci à tous. » à la fin du document', { ouverte: true }); assert.deepEqual([f.action.texte, f.action.position.k], ['Merci à tous.', 'fin']);
  assert.equal(A('supprime le dernier paragraphe', { ouverte: true }).action.k, 'supprimer');
  assert.equal(A('ajoute un paragraphe à la fin du document', { ouverte: true }).action.texte, null, 'sans texte : Raylé le demandera');
});
await t('validation : « oui » / « non » ne valent que s’il y a un aperçu en attente ; « annule la dernière modification »', () => {
  assert.equal(A('oui', { attente: true }).op, 'valider'); assert.equal(A('valide', { attente: true }).op, 'valider'); assert.equal(A('non', { attente: true }).op, 'refuser');
  assert.equal(A('oui'), null); assert.equal(A('non'), null);
  assert.equal(A('annule la dernière modification', { ouverte: true }).op, 'annuler'); assert.equal(A('reviens à la version précédente', { ouverte: true }).op, 'annuler');
});
await t('fenêtre : plein écran, taille normale, réduire, édition, zoom, surligner — seulement quand un document est ouvert', () => {
  const O = { ouverte: true };
  assert.deepEqual([A('plein écran', O).action, A('quitte le plein écran', O).action, A('réduis la fenêtre', O).action, A('passe en mode édition', O).action, A('zoome', O).action, A('surligne ce passage', O).action, A('ferme le document', O).action],
    ['plein', 'normal', 'reduire', 'edition', 'zoom+', 'surligner', 'fermer']);
  for (const p of ['plein écran', 'zoome', 'surligne ce passage', 'ferme le document']) assert.equal(A(p), null, p + ' sans document ouvert');
});
await t('choix entre deux documents : « le premier », « le deuxième », ou le nom', () => {
  const c = { choix: ['Cours d’anatomie – UE2', 'Cours de physiologie – UE3'] };
  assert.deepEqual(A('le deuxième', c), { op: 'choix', n: 2 }); assert.deepEqual(A('celui de physiologie', c), { op: 'choix', n: 2 }); assert.deepEqual(A('le premier', c), { op: 'choix', n: 1 });
});

/* ═════════════ 4. Google Docs (fausse API) ═════════════ */
console.log('Google Docs');
await t('ouvrir par nom approximatif : lit le document réel, annonce ce qu’il contient', async () => {
  const { service } = await avecService();
  const r = await service.ouvrir('le cours d’anatomie'); assert.ok(r.ok, r.dit);
  assert.match(r.dit, /« Cours d’anatomie – UE2 » \(Google Docs\) : 4 paragraphes de texte et 4 titres/);
  assert.equal(service.etat().nom, 'Cours d’anatomie – UE2');
});
await t('lire le 2e paragraphe → exactement le texte du document, rien d’autre', async () => {
  const { service } = await avecService(); await service.ouvrir('anatomie');
  const r = await service.lire({ type: 'paragraphe', n: 2 }); assert.ok(r.ok);
  assert.equal(r.texteLu, 'Le tibia se situe en dedans du péroné, il supporte le poids du corp.');
  const s = await service.lire({ type: 'suite' }); assert.match(s.texteLu, /^Muscles. Le quadriceps étend le genou/);
});
await t('lire sans document ouvert ni autorisé : jamais de texte inventé, on propose le sélecteur', async () => {
  const { service } = await avecService(); const r = await service.lire({ type: 'paragraphe', n: 1 });
  assert.equal(r.ok, false); assert.match(r.dit, /Aucun document n’est ouvert/);
  const inconnu = await service.ouvrir('budget 2027'); assert.equal(inconnu.ok, false); assert.equal(inconnu.introuvable, true); assert.match(inconnu.dit, /sélecteur Google/);
  assert.equal(service.proposition(), 'selecteur');
});
await t('corriger la faute : aperçu avant/après, rien n’est écrit tant que Justin n’a pas validé', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  const avant = JSON.stringify(drive.fichiers.get('doc1').contenu.paragraphes());
  const r = await service.modifier({ op: 'modifier', doc: null, direct: false, cible: { type: 'paragraphe', n: 2 }, action: { k: 'corriger' } });
  assert.ok(r.ok && r.enAttente, r.dit); assert.match(r.dit, /je remplace « corp\. » par « corps\. »|je remplace « corp » par « corps »|ajoute « s »/); assert.match(r.dit, /Dis « valide »/);
  assert.equal(JSON.stringify(drive.fichiers.get('doc1').contenu.paragraphes()), avant, 'rien d’écrit avant validation');
  assert.equal(drive.journal.filter(j => j.methode === 'POST').length, 0);
});
await t('valider → écrit, relit le document pour vérifier, garde le gras autour de la correction', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  await service.modifier({ doc: null, direct: false, cible: { type: 'paragraphe', n: 2 }, action: { k: 'corriger' } });
  const r = await service.valider(); assert.ok(r.ok && r.verifie, r.dit); assert.match(r.dit, /fait et vérifié en relisant/);
  const f = drive.fichiers.get('doc1').contenu;
  assert.equal(f.paragraphes()[3], 'Le tibia se situe en dedans du péroné, il supporte le poids du corps.');
  assert.equal(f.gras(), 'fémur', 'la mise en forme du reste du document est intacte');
  assert.equal(service.courant().paragraphes[3].texte, f.paragraphes()[3], 'le modèle local est resynchronisé');
});
await t('annuler → revient exactement à la version précédente (et le dit après vérification)', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  const avant = drive.fichiers.get('doc1').contenu.paragraphes().slice();
  await service.modifier({ doc: null, direct: true, cible: { type: 'paragraphe', n: 2 }, action: { k: 'corriger' } });
  assert.notDeepEqual(drive.fichiers.get('doc1').contenu.paragraphes(), avant);
  const r = await service.annuler(); assert.ok(r.ok, r.dit); assert.match(r.dit, /J’ai annulé la dernière modification/);
  assert.deepEqual(drive.fichiers.get('doc1').contenu.paragraphes(), avant);
  const encore = await service.annuler(); assert.equal(encore.ok, false); assert.match(encore.dit, /aucune modification à annuler/);
});
await t('« applique directement » : pas d’aperçu, mais écriture vérifiée et annulable', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  const r = await service.modifier({ doc: null, direct: true, cible: { type: 'paragraphe', n: 2 }, action: { k: 'corriger' } });
  assert.ok(r.ok && r.applique && !r.enAttente, r.dit); assert.equal(service.etat().annulable, true);
});
await t('refuser un aperçu : rien n’est modifié', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  await service.modifier({ doc: null, direct: false, cible: { type: 'paragraphe', n: 2 }, action: { k: 'corriger' } });
  const r = service.refuser(); assert.match(r.dit, /rien modifié/); assert.equal(drive.journal.filter(j => j.methode === 'POST').length, 0);
  assert.equal((await service.valider()).ok, false);
});
await t('ajouter sous un titre : paragraphe en texte normal (pas de titre ni de gras hérités), ailleurs intact', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  const r = await service.modifier({ doc: null, direct: true, cible: null, action: { k: 'ajouter', texte: 'Ce chapitre présente les os et les muscles.', position: { k: 'sous-titre', titre: 'Introduction' } } });
  assert.ok(r.ok, r.dit);
  const f = drive.fichiers.get('doc1').contenu;
  assert.deepEqual(f.paragraphes().slice(0, 4), ['Anatomie du membre inférieur', 'Introduction', 'Ce chapitre présente les os et les muscles.', 'Le fémur est l’os le plus long du corps humain. Il s’articule avec le bassin.']);
  assert.deepEqual(f.styles().slice(0, 4), ['HEADING_1', 'HEADING_2', 'NORMAL_TEXT', 'NORMAL_TEXT']);
  assert.equal(f.gras(), 'fémur');
});
await t('ajouter au début, après le 2e paragraphe, à la fin ; titre inconnu : message avec les vrais titres', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  const f = drive.fichiers.get('doc1').contenu;
  await service.modifier({ doc: null, direct: true, action: { k: 'ajouter', texte: 'FIN', position: { k: 'fin' } } });
  assert.equal(f.paragraphes().at(-1), 'FIN'); assert.equal(f.paragraphes().at(-2), 'Fin du cours.');
  await service.modifier({ doc: null, direct: true, action: { k: 'ajouter', texte: 'DEBUT', position: { k: 'debut' } } });
  assert.equal(f.paragraphes()[0], 'DEBUT'); assert.equal(f.styles()[0], 'NORMAL_TEXT');
  await service.modifier({ doc: null, direct: true, action: { k: 'ajouter', texte: 'APRES2', position: { k: 'apres-paragraphe', n: 3 } } });
  assert.equal(f.paragraphes()[f.paragraphes().indexOf('APRES2') - 1].startsWith('Le tibia'), true);
  const inconnu = await service.modifier({ doc: null, direct: true, action: { k: 'ajouter', texte: 'x', position: { k: 'sous-titre', titre: 'Biomécanique' } } });
  assert.equal(inconnu.ok, false); assert.match(inconnu.dit, /Les titres que je vois/);
  assert.equal((await service.modifier({ doc: null, action: { k: 'ajouter', texte: null, position: { k: 'fin' } } })).ok, false);
});
await t('supprimer le dernier paragraphe du document, puis annuler (cas limite de l’API : dernier saut de ligne)', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  const f = drive.fichiers.get('doc1').contenu, avant = f.paragraphes().slice();
  const r = await service.modifier({ doc: null, direct: true, cible: { type: 'paragraphe', n: -1 }, action: { k: 'supprimer' } }); assert.ok(r.ok, r.dit);
  assert.deepEqual(f.paragraphes(), avant.slice(0, -1));
  const u = await service.annuler(); assert.ok(u.ok, u.dit); assert.deepEqual(f.paragraphes(), avant);
});
await t('plusieurs changements d’un coup (édition à la main) : remplacer + insérer + supprimer, indices corrects, annulation complète', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  const f = drive.fichiers.get('doc1').contenu, avant = f.paragraphes().slice(), P = service.courant().paragraphes;
  const ops = [{ t: 'remplacer', i: 3, avant: P[3].texte, apres: 'Le tibia est le deuxième os du segment jambier.' }, { t: 'inserer', apres: 3, texte: 'Nouveau paragraphe.', style: 'normal' }, { t: 'supprimer', i: 5, avant: P[5].texte }, { t: 'inserer', apres: 7, texte: 'Après la fin.', style: 'normal' }];
  const r = await service.appliquerEdition(ops); assert.ok(r.ok && r.verifie, r.dit);
  assert.deepEqual(f.paragraphes(), ['Anatomie du membre inférieur', 'Introduction', avant[2], 'Le tibia est le deuxième os du segment jambier.', 'Nouveau paragraphe.', 'Muscles', 'Conclusion', 'Fin du cours.', 'Après la fin.']);
  assert.ok((await service.annuler()).ok); assert.deepEqual(f.paragraphes(), avant);
});
await t('remplacer X par Y : respecte accents/casse du document, compte les occurrences, refuse l’inconnu', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  const r = await service.modifier({ doc: null, direct: false, cible: { type: 'tout' }, action: { k: 'remplacer', de: 'femur', vers: 'fémur droit' } });
  assert.ok(r.ok && r.enAttente, r.dit); assert.equal(r.apercu.length, 1, 'seul le paragraphe 2 contient « femur » sans accent… ou le 5 avec fémoral ?');
  const inconnu = await service.modifier({ doc: null, cible: { type: 'tout' }, action: { k: 'remplacer', de: 'cervelet', vers: 'x' } });
  assert.equal(inconnu.ok, false); assert.match(inconnu.dit, /Je ne trouve pas « cervelet »/);
});
await t('conflit : le document a changé sur le Drive pendant l’aperçu → refus clair, aucune écriture écrasante', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  await service.modifier({ doc: null, direct: false, cible: { type: 'paragraphe', n: 2 }, action: { k: 'corriger' } });
  drive.fichiers.get('doc1').contenu.batch([{ insertText: { location: { index: drive.fichiers.get('doc1').contenu.car.length }, text: '' } }]);   // revision++
  const doc = drive.fichiers.get('doc1').contenu; const debut = doc.paragraphes().slice(0, 3).join('\n').length + 2;
  doc.batch([{ insertText: { location: { index: debut + 'Le tibia'.length + 1 }, text: ' (modifié ailleurs)' } }]);
  const r = await service.valider(); assert.equal(r.ok, false); assert.equal(r.conflit, true); assert.match(r.dit, /a changé sur le Drive depuis l’aperçu/); assert.match(r.dit, /Je n’ai rien modifié/);
  assert.match(doc.paragraphes()[3], /\(modifié ailleurs\)/, 'le changement fait ailleurs est conservé');
});
await t('vérification honnête : si le Drive ignore l’écriture, Raylé ne dit PAS que c’est fait', async () => {
  const { service, drive } = await avecService(); await service.ouvrir('anatomie');
  drive.ignorerEcritures = true;
  const r = await service.modifier({ doc: null, direct: true, cible: { type: 'paragraphe', n: 2 }, action: { k: 'corriger' } });
  assert.equal(r.ok, false); assert.equal(r.nonVerifie, true); assert.match(r.dit, /je ne retrouve pas le changement/); assert.doesNotMatch(r.dit, /C’est fait/);
  assert.equal(service.etat().annulable, false, 'aucune annulation enregistrée pour un changement non vérifié');
});
await t('l’IA de correction renvoie n’importe quoi → refus (garde-fou), le document n’est pas touché', async () => {
  const { service, drive } = await avecService({ correcteur: async () => 'Tout autre texte sans rapport avec le paragraphe d’origine, entièrement réécrit.' }); await service.ouvrir('anatomie');
  const r = await service.modifier({ doc: null, direct: true, cible: { type: 'paragraphe', n: 2 }, action: { k: 'corriger' } });
  assert.equal(r.ok, false); assert.match(r.dit, /change trop le texte/); assert.equal(drive.journal.filter(j => j.methode === 'POST').length, 0);
  const sans = await avecService({ correcteur: undefined }); await sans.service.ouvrir('anatomie');
  const r2 = await sans.service.modifier({ doc: null, cible: { type: 'paragraphe', n: 2 }, action: { k: 'corriger' } }); assert.equal(r2.ok, false); assert.match(r2.dit, /pas disponible/);
});
await t('paragraphe déjà correct : « je ne vois aucune faute », sans rien modifier ni prétendre avoir corrigé', async () => {
  const { service } = await avecService(); await service.ouvrir('anatomie');
  const r = await service.modifier({ doc: null, cible: { type: 'paragraphe', n: 4 }, action: { k: 'corriger' } });
  assert.ok(r.ok && r.vide); assert.match(r.dit, /Je ne vois aucune faute/);
});

/* ═════════════ 5. erreurs : toujours dites telles quelles ═════════════ */
console.log('Erreurs honnêtes');
await t('fichier non autorisé par le sélecteur (404) : message clair, pas de contenu inventé', async () => {
  const drive = nouveauDrive(); const { service } = await monterService(drive, {});
  service.memoriser([{ id: 'inconnu', name: 'Secret', mimeType: MIME.gdoc }]);
  const r = await service.ouvrir('secret'); assert.equal(r.ok, false); assert.match(r.dit, /introuvable, ou non autorisé pour Raylé/); assert.equal(service.etat().ouvert, false);
});
await t('panne du Drive (500) pendant la lecture : « je n’ai pas pu… », rien de lu', async () => {
  const drive = nouveauDrive(); const { service } = await avecService({}, drive); drive.panne = { statut: 500, message: 'Backend Error' };
  const r = await service.ouvrir('anatomie'); assert.equal(r.ok, false); assert.match(r.dit, /Je n’ai pas pu ouvrir ce document : Erreur Google Drive \(500\)/);
});
await t('API Google Docs désactivée : lecture seule de secours par l’export texte, et on le dit', async () => {
  const drive = nouveauDrive(); drive.apiDocsActive = false; const { service } = await avecService({}, drive);
  const r = await service.ouvrir('anatomie'); assert.ok(r.ok, r.dit); assert.match(r.dit, /Lecture seule/); assert.match(r.dit, /API Google Docs n’est pas activée/);
  const m = await service.modifier({ doc: null, direct: true, cible: { type: 'paragraphe', n: 1 }, action: { k: 'corriger' } }); assert.equal(m.ok, false); assert.match(m.dit, /lecture seule/);
});
await t('jeton expiré (401) : l’API redemande un jeton et réessaie une fois ; échec → demande de reconnexion', async () => {
  const drive = nouveauDrive(); const appels = [];
  const api = creerApi({ jeton: async forcer => { appels.push(!!forcer); return forcer ? 'jeton-2' : 'jeton-1'; }, fetch: drive.fetch });
  drive.expirerAuProchain = true; const m = await api.meta('doc1'); assert.equal(m.id, 'doc1'); assert.deepEqual(appels, [false, true]);
  const { service } = await monterService(drive, {}); service.memoriser(AUTORISES.slice(0, 1));
  drive.jetonsValides.clear();                                                    // plus aucun jeton valide
  const r = await service.ouvrir('anatomie'); assert.equal(r.ok, false); assert.equal(r.reconnexion, true); assert.match(r.dit, /Se connecter à Google/);
});
await t('lecture seule d’un fichier sans droit d’écriture ; type de fichier inconnu', async () => {
  const drive = nouveauDrive(); drive.ajouter('ro', { name: 'Lecture', mimeType: MIME.gdoc, capabilities: { canEdit: false } }, new FauxGoogleDoc([{ texte: 'Texte.' }]));
  drive.ajouter('zip', { name: 'Archive', mimeType: 'application/zip' }, 'x');
  const { service } = await monterService(drive, { correcteur: CORRIGE }); service.memoriser([{ id: 'ro', name: 'Lecture' }, { id: 'zip', name: 'Archive' }]);
  assert.match((await service.ouvrir('lecture')).dit, /Lecture seule/);
  const m = await service.modifier({ doc: null, direct: true, cible: { type: 'paragraphe', n: 1 }, action: { k: 'corriger' } }); assert.equal(m.ok, false); assert.match(m.dit, /lecture seule/);
  const z = await service.ouvrir('archive'); assert.equal(z.ok, false); assert.match(z.dit, /Je ne sais pas lire ce type de fichier/);
});
await t('deux documents au nom proche : Raylé demande lequel ; « le deuxième » ouvre le bon', async () => {
  const drive = nouveauDrive(); drive.ajouter('doc3', { name: 'Cours de physiologie – UE3', mimeType: MIME.gdoc }, new FauxGoogleDoc([{ texte: 'Physiologie', style: 'HEADING_1' }, { texte: 'Le cœur bat.' }]));
  const { service } = await monterService(drive, {}); service.memoriser(AUTORISES);
  const r = await service.ouvrir('le cours'); assert.equal(r.ok, false); assert.equal(r.ambigu, true); assert.match(r.dit, /J’hésite entre/); assert.deepEqual(service.choix().length, 2);
  const d = await service.ouvrirChoix(1); assert.ok(d.ok, d.dit); assert.match(service.etat().nom, /physiologie|anatomie/i);
});

/* ═════════════ 6. Word (.docx) ═════════════ */
console.log('Word (.docx)');
const XML = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
  + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Anatomie</w:t></w:r></w:p>'
  + '<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Le fémur</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve"> est l’os le plus long &amp; solide.</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t xml:space="preserve">Une faute : le corp humain.</w:t></w:r><w:r><w:tab/><w:t>fin</w:t></w:r></w:p>'
  + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cellule du tableau</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
  + '<w:p><w:r><w:t>Page un.</w:t></w:r><w:r><w:br w:type="page"/></w:r></w:p>'
  + '<w:p><w:r><w:t>Page deux, après le saut.</w:t></w:r></w:p>'
  + '<w:sectPr><w:pgSz w:w="11906"/></w:sectPr></w:body></w:document>';
await t('lecture : titres, texte décodé (&amp;), tabulations, tableau non modifiable, pages d’après les sauts de page', () => {
  const d = lireDocx(XML), P = d.paragraphes;
  assert.deepEqual(P.map(p => p.texte), ['Anatomie', 'Le fémur est l’os le plus long & solide.', 'Une faute : le corp humain.\tfin', 'Cellule du tableau', 'Page un.', 'Page deux, après le saut.']);
  assert.deepEqual(P.map(p => p.niveau), [1, 0, 0, 0, 0, 0]); assert.deepEqual(P.map(p => p.editable), [true, true, true, false, true, true]);
  assert.deepEqual(P.map(p => p.page), [1, 1, 1, 1, 1, 2]); assert.ok(d.avertissements.some(a => /approximatifs/.test(a)) && d.avertissements.some(a => /tableaux/.test(a)));
});
await t('modifier : seuls les caractères changés sont remplacés ; gras, italique, justification et le reste du fichier restent identiques', () => {
  const apres = modifierDocx(XML, [{ t: 'remplacer', i: 2, avant: 'Une faute : le corp humain.\tfin', apres: 'Une faute : le corps humain.\tfin' }]);
  assert.equal(lireDocx(apres).paragraphes[2].texte, 'Une faute : le corps humain.\tfin');
  assert.ok(apres.includes('<w:tab/>'), 'la tabulation est conservée');
  assert.equal(apres.split('<w:p>').length, XML.split('<w:p>').length, 'aucun paragraphe ajouté ni retiré');
  // paragraphe 1 : correction à cheval sur les deux passages (gras + italique)
  const cheval = modifierDocx(XML, [{ t: 'remplacer', i: 1, avant: 'Le fémur est l’os le plus long & solide.', apres: 'Le tibia c’est l’os le plus long & solide.' }]);
  assert.equal(lireDocx(cheval).paragraphes[1].texte, 'Le tibia c’est l’os le plus long & solide.');
  assert.ok(cheval.includes('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Le tibia c’</w:t>'), 'le début reste en gras'); assert.ok(cheval.includes('<w:rPr><w:i/></w:rPr><w:t xml:space="preserve">est l’os le plus long &amp; solide.</w:t>'), 'la fin reste en italique, & ré-encodé');
  assert.ok(cheval.includes('<w:jc w:val="both"/>'));
});
await t('insérer sous un titre (mise en forme du corps de texte, pas du titre) · supprimer · refuser le tableau · conflit', () => {
  const ins = modifierDocx(XML, [{ t: 'inserer', apres: 0, texte: 'Nouveau & utile.', style: 'normal' }]);
  const P = lireDocx(ins).paragraphes; assert.deepEqual(P.slice(0, 3).map(p => p.texte), ['Anatomie', 'Nouveau & utile.', 'Le fémur est l’os le plus long & solide.']); assert.equal(P[1].niveau, 0);
  const sup = modifierDocx(XML, [{ t: 'supprimer', i: 2, avant: 'Une faute : le corp humain.\tfin' }]); assert.equal(lireDocx(sup).paragraphes.length, 5);
  assert.throws(() => modifierDocx(XML, [{ t: 'remplacer', i: 3, avant: 'Cellule du tableau', apres: 'x' }]), /tableau/);
  assert.throws(() => modifierDocx(XML, [{ t: 'remplacer', i: 2, avant: 'texte périmé', apres: 'x' }]), /a changé dans le fichier/);
  const deux = modifierDocx(XML, [{ t: 'inserer', apres: 1, texte: 'A', style: 'normal' }, { t: 'inserer', apres: 1, texte: 'B', style: 'normal' }]);
  assert.deepEqual(lireDocx(deux).paragraphes.slice(1, 4).map(p => p.texte), ['Le fémur est l’os le plus long & solide.', 'A', 'B'], 'deux ajouts au même endroit gardent leur ordre');
});
await t('service : ouvrir un .docx, corriger, valider, relire, annuler — via zip et Drive factices', async () => {
  const drive = nouveauDrive(); drive.ajouter('w1', { name: 'Notes de cours', mimeType: MIME.docx }, await octetsDocx(XML));
  const { service } = await monterService(drive, { correcteur: async x => x.replace('corp humain', 'corps humain') }); service.memoriser([{ id: 'w1', name: 'Notes de cours', mimeType: MIME.docx }]);
  const o = await service.ouvrir('notes de cours'); assert.ok(o.ok, o.dit); assert.match(o.dit, /Word \(\.docx\)/);
  const l = await service.lire({ type: 'page', n: 2 }); assert.match(l.texteLu, /Page deux/);
  const r = await service.modifier({ doc: null, direct: true, cible: { type: 'paragraphe', n: 2 }, action: { k: 'corriger' } }); assert.ok(r.ok && r.verifie, r.dit);
  const zip = await FauxJSZip.loadAsync(drive.fichiers.get('w1').contenu), xml = await zip.file('word/document.xml').async('string');
  assert.match(lireDocx(xml).paragraphes[2].texte, /le corps humain/); assert.ok(zip.file('word/styles.xml'), 'les autres parties du fichier sont conservées');
  assert.ok((await service.annuler()).ok); const xml2 = await (await FauxJSZip.loadAsync(drive.fichiers.get('w1').contenu)).file('word/document.xml').async('string'); assert.match(lireDocx(xml2).paragraphes[2].texte, /le corp humain/);
});

/* ═════════════ 7. texte, Markdown, PDF, Sheets, Slides ═════════════ */
console.log('Autres formats');
await t('texte / Markdown : titres #, blocs, fin de ligne et séparateurs conservés à la réécriture', () => {
  const brut = '# Titre\r\n\r\nPremier bloc.\r\n\r\n\r\n## Sous-titre\r\n\r\nDernier.\r\n';
  const d = lireTexte(brut); assert.deepEqual(d.paragraphes.map(p => [p.niveau, p.texte]), [[1, 'Titre'], [0, 'Premier bloc.'], [2, 'Sous-titre'], [0, 'Dernier.\n']]);
  assert.equal(ecrireTexte(d.paragraphes, d.crlf), brut, 'réécriture sans changement = fichier identique');
  d.paragraphes[1].texte = 'Premier bloc corrigé.'; assert.equal(ecrireTexte(d.paragraphes, d.crlf), brut.replace('Premier bloc.', 'Premier bloc corrigé.'));
});
await t('service : fichier .md — corriger puis annuler, le fichier retrouve ses octets d’origine', async () => {
  const brut = '# Cours\n\nLe corp humain.\n\nFin.\n';
  const drive = nouveauDrive(); drive.ajouter('m1', { name: 'Notes.md', mimeType: 'text/markdown' }, brut);
  const { service } = await monterService(drive, { correcteur: async x => x.replace('corp ', 'corps ') }); service.memoriser([{ id: 'm1', name: 'Notes.md' }]);
  await service.ouvrir('notes'); const r = await service.modifier({ doc: null, direct: true, cible: { type: 'paragraphe', n: 1 }, action: { k: 'corriger' } }); assert.ok(r.ok, r.dit);
  assert.equal(drive.fichiers.get('m1').contenu, '# Cours\n\nLe corps humain.\n\nFin.\n');
  assert.ok((await service.annuler()).ok); assert.equal(drive.fichiers.get('m1').contenu, brut);
});
await t('PDF : paragraphes par page, titres par taille de police, mot coupé en fin de ligne recollé, lecture seule', () => {
  const it = (str, x, y, h) => ({ str, transform: [h, 0, 0, h, x, y], height: h });
  const d = paragraphesPdf([{ items: [it('Titre du cours', 50, 800, 20), it('Premier paragraphe qui conti-', 50, 760, 10), it('nue sur la ligne suivante.', 50, 748, 10), it('Deuxième paragraphe.', 50, 700, 10)] }, { items: [it('Page deux, texte.', 50, 780, 10)] }]);
  assert.deepEqual(d.paragraphes.map(p => [p.page, p.niveau, p.texte]), [[1, 1, 'Titre du cours'], [1, 0, 'Premier paragraphe qui continue sur la ligne suivante.'], [1, 0, 'Deuxième paragraphe.'], [2, 0, 'Page deux, texte.']]);
  assert.ok(d.paragraphes.every(p => p.editable === false)); assert.match(paragraphesPdf([{ items: [] }]).avertissements.join(' '), /scan/);
  assert.deepEqual(passage({ paragraphes: d.paragraphes }, { type: 'page', n: 2 }).indices, [3]);
});
await t('Sheets : une ligne par ligne de la feuille, avec les en-têtes ; lecture seule', () => {
  const d = paragraphesFeuille([{ titre: 'Notes', valeurs: [['Nom', 'Note'], ['Alice', 15], ['', ''], ['Bob', 12]] }]);
  assert.deepEqual(d.paragraphes.map(p => p.texte), ['Notes', 'Ligne 2 : Nom = Alice ; Note = 15', 'Ligne 4 : Nom = Bob ; Note = 12']);
});
await t('Slides : titre et texte de chaque diapositive, notes du présentateur', () => {
  const forme = (type, txt) => ({ shape: { placeholder: type ? { type } : undefined, text: { textElements: [{ textRun: { content: txt + '\n' } }] } } });
  const d = paragraphesDiapos({ slides: [{ pageElements: [forme('TITLE', 'Les os'), forme('BODY', 'Le fémur')], slideProperties: { notesPage: { pageElements: [forme('BODY', 'Parler du col')] } } }, { pageElements: [forme('TITLE', 'Les muscles')] }] });
  assert.deepEqual(d.paragraphes.map(p => p.texte), ['Diapositive 1 : Les os', 'Le fémur', 'Notes du présentateur : Parler du col', 'Diapositive 2 : Les muscles']);
  assert.deepEqual(d.paragraphes.map(p => p.page), [1, 1, 1, 2]);
});
await t('service : Sheets et Slides s’ouvrent en lecture seule via l’API, et refusent toute modification', async () => {
  const drive = nouveauDrive();
  drive.ajouter('s1', { name: 'Notes des élèves', mimeType: MIME.gsheet }, { feuilles: [{ titre: 'Notes', valeurs: [['Nom', 'Note'], ['Alice', 15]] }] });
  const { service } = await monterService(drive, { correcteur: CORRIGE }); service.memoriser([{ id: 's1', name: 'Notes des élèves' }]);
  const o = await service.ouvrir('notes des eleves'); assert.ok(o.ok, o.dit); assert.match(o.dit, /Lecture seule/);
  const l = await service.lire({ type: 'motcle', texte: 'alice' }); assert.match(l.texteLu, /Alice/);
  assert.equal((await service.modifier({ doc: null, direct: true, cible: { type: 'paragraphe', n: 1 }, action: { k: 'corriger' } })).ok, false);
});

/* ═════════════ 8. modèle : opérations et inverses (propriété) ═════════════ */
console.log('Opérations');
await t('appliquer puis appliquer l’inverse redonne exactement le document d’origine (500 jeux aléatoires)', () => {
  let graine = 7; const rnd = n => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine % n; };
  for (let essai = 0; essai < 500; essai++) {
    const n = 1 + rnd(6), base = Array.from({ length: n }, (_, i) => ({ texte: 'p' + i + 'x'.repeat(rnd(3)), niveau: rnd(5) === 0 ? 1 : 0, editable: true }));
    const ops = [], vus = new Set();
    for (let k = rnd(4); k >= 0; k--) {
      const i = rnd(n), type = rnd(3);
      if (type === 0 && !vus.has(i)) { vus.add(i); ops.push({ t: 'remplacer', i, avant: base[i].texte, apres: 'R' + essai + k }); }
      else if (type === 1 && !vus.has(i) && vus.size < n - 1) { vus.add(i); ops.push({ t: 'supprimer', i, avant: base[i].texte }); }
      else if (type === 2) ops.push({ t: 'inserer', apres: rnd(n + 1) - 1, texte: 'I' + essai + k, style: 'normal' });
    }
    const r = appliquerOps(base, ops), retour = appliquerOps(r.paragraphes, r.inverse).paragraphes;
    assert.deepEqual(retour.map(p => p.texte), base.map(p => p.texte), 'essai ' + essai + ' ops ' + JSON.stringify(ops));
  }
});
await t('diffOps : la liste éditée (paragraphes gardés, modifiés, ajoutés, retirés) donne les bonnes opérations', () => {
  const avant = [{ texte: 'a' }, { texte: 'b' }, { texte: 'c' }];
  const ops = diffOps(avant, [{ orig: 0, texte: 'a' }, { orig: null, texte: 'nouveau', style: 'normal' }, { orig: 2, texte: 'C!' }]);
  assert.deepEqual(ops, [{ t: 'remplacer', i: 2, avant: 'c', apres: 'C!' }, { t: 'supprimer', i: 1, avant: 'b' }, { t: 'inserer', apres: 0, texte: 'nouveau', style: 'normal' }]);
});

console.log(`\n${ok} vérifications Drive réussies.`);
