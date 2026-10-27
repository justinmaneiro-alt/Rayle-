// Tests de l'analyse des questions visuelles et du filtrage des images. Lancer :  node galaxie/tests/images-contenu-test.mjs
import { createRequire } from 'node:module';
const I = createRequire(import.meta.url)('../../core/commun/images-contenu.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const d = t => I.demande(t);

// questions visuelles reconnues, sujet repris avec ses accents
const cas = [
  ['Qui est Astérix et Obélix ?', 'qui', 'Astérix et Obélix'], ['qui est Léonard de Vinci', 'qui', 'Léonard de Vinci'], ["c'est qui Napoléon ?", 'qui', 'Napoléon'],
  ['à quoi ressemble un bateau de 1700 ?', 'ressemble', 'bateau de 1700'], ['A quoi ressemble la tour Eiffel', 'ressemble', 'tour Eiffel'], ['dis-moi à quoi ressemble un galion', 'ressemble', 'galion'],
  ['Montre-moi un navire du XVIIIe siècle', 'montre', 'navire du XVIIIe siècle'], ['montre moi la Joconde', 'montre', 'Joconde'], ["montre-moi un panda géant s'il te plaît", 'montre', 'panda géant'],
  ['Raylé, montre-moi un galion', 'montre', 'galion'], ['je veux voir un volcan', 'montre', 'volcan'], ['fais-moi voir une éclipse', 'montre', 'éclipse'],
  ['photo de panda géant', 'photo', 'panda géant'], ["une image de la Joconde", 'photo', 'Joconde'], ['cherche une photo de la Lune', 'photo', 'Lune'], ['trouve-moi des images du Mont-Blanc', 'photo', 'Mont-Blanc'], ['montre-moi des photos de chats', 'montre', 'chats']
];
for (const [phrase, type, sujet] of cas) { const r = d(phrase); v(`« ${phrase} » → ${type} / ${sujet}`, r && r.type === type && r.sujet === sujet, JSON.stringify(r)); }
// ce qui n'est PAS une demande d'image
for (const p of ["montre-moi le terminal", 'montre-moi la galaxie', 'montre-moi les marchés', 'montre-moi le cours du Nasdaq', 'montre-moi le graphique du Bitcoin', 'montre-moi mes alertes', 'montre-moi la météo', 'montre-moi tout',
  'quelle heure est-il', 'bonjour Raylé', 'qui es-tu', 'qui est-ce', "c'est quoi le RSI", 'qui est le président de la France', 'qui est le meilleur joueur', 'ouvre le terminal', 'agrandis l\'image', 'montre-moi ça'])
  v(`pas une demande d'image : « ${p} »`, d(p) === null, JSON.stringify(d(p)));
// refus : sensible et personnes privées
for (const p of ['montre-moi un cadavre', 'photo de porno', 'montre-moi une femme nue', 'à quoi ressemble une décapitation', 'montre-moi de la torture']) v(`refus (sensible) : « ${p} »`, d(p) && d(p).refus === 'sensible', JSON.stringify(d(p)));
for (const p of ['montre-moi mon voisin', 'photo de ma voisine', 'à quoi ressemble ma sœur', 'montre-moi ton patron', 'photo de moi']) v(`refus (personne privée) : « ${p} »`, d(p) && d(p).refus === 'prive', JSON.stringify(d(p)));
v('sujet trop long raccourci', d('montre-moi ' + 'très long sujet '.repeat(10)).sujet.length <= 90);
// commandes de la fenêtre
const cmd = { 'agrandis l image': 'agrandir', 'agrandis': 'agrandir', 'agrandis la photo': 'agrandir', 'zoome': 'agrandir', 'montre l image en grand': 'agrandir', 'mets en grand': 'agrandir',
  'image suivante': 'suivante', 'la suivante': 'suivante', 'photo suivante': 'suivante', 'passe a l image suivante': 'suivante', 'suivante': 'suivante',
  'image precedente': 'precedente', 'la precedente': 'precedente', 'retour a l image precedente': 'precedente',
  'reduis l image': 'reduire', 'sors du plein ecran': 'reduire', 'ferme l image': 'fermer', 'ferme la photo': 'fermer', 'ferme la galerie': 'fermer', 'efface les images': 'fermer', "ferme l'image": 'fermer', 'ferme les images s il te plait': 'fermer' };
for (const [c, a] of Object.entries(cmd)) v(`commande « ${c} » → ${a}`, I.commandeFenetre(c) === a, String(I.commandeFenetre(c)));
for (const c of ['ferme ca', 'ferme tout', 'ferme le terminal', 'suivant le marche', 'agrandis le graphique', 'bonjour']) v(`« ${c} » n'est pas une commande d'image`, I.commandeFenetre(c) === null || (c === 'agrandis le graphique' ? false : false), String(I.commandeFenetre(c)));

// filtrage de la réponse du Worker
const bon = (n, extra = {}) => Object.assign({ titre: 'Image ' + n, auteur: 'Auteur ' + n, licence: 'CC BY-SA 4.0', licence_url: 'https://creativecommons.org/licenses/by-sa/4.0', source_url: 'https://commons.wikimedia.org/wiki/File:I' + n + '.jpg', miniature: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/I' + n + '.jpg/480px-I' + n + '.jpg', grande: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/I' + n + '.jpg/960px-I' + n + '.jpg', largeur: 480, hauteur: 320, origine: 'commons' }, extra);
let f = I.filtrerImages({ images: [bon(1), bon(2), bon(3), bon(4), bon(5)] });
v('au plus 4 images', f.length === 4);
v('limite demandée (léger : 1)', I.filtrerImages({ images: [bon(1), bon(2)] }, 1).length === 1);
f = I.filtrerImages({ images: [bon(1, { titre: '' }), bon(2, { auteur: '' }), bon(3, { licence: '' }), bon(4, { source_url: 'javascript:alert(1)' }), bon(5, { source_url: 'http://x.org/a' }), bon(6, { miniature: 'https://evil.example.com/a.jpg' }), bon(7, { grande: 'https://evil.example.com/b.jpg' }), bon(8, { licence: 'CC BY-NC 4.0' }), bon(9, { titre: 'photo porno' }), bon(10)] });
v('exigences : titre, auteur, licence, lien https, hôte d\'image connu, licence libre, pas de mot sensible', f.length === 1 && f[0].titre === 'Image 10', JSON.stringify(f.map(x => x.titre)));
v('doublons (même source) écartés', I.filtrerImages({ images: [bon(1), bon(1), bon(2)] }).length === 2);
v('réponse invalide : liste vide, sans erreur', I.filtrerImages(null).length === 0 && I.filtrerImages({}).length === 0 && I.filtrerImages({ images: [null, 3, 'x'] }).length === 0);
v('lien de licence non https supprimé', I.filtrerImages({ images: [bon(1, { licence_url: 'javascript:1' })] })[0].licence_url === '');
v('Openverse : miniature servie par api.openverse.org acceptée', I.filtrerImages({ images: [bon(1, { origine: 'openverse', miniature: 'https://api.openverse.org/v1/images/x/thumb/', grande: undefined })] }).length === 1);
// phrases
const res = { sujet: { titre: 'Astérix', langue: 'fr', url: 'https://fr.wikipedia.org/wiki/Ast%C3%A9rix' }, images: [bon(1, { origine: 'wikipedia' }), bon(2)] };
const imgs = I.filtrerImages(res);
v("phrase d'introduction : nomme l'article Wikipédia et les sources", I.introduction(res, imgs) === "Voici les 2 images de l'article Wikipédia « Astérix » (Wikipédia et Wikimedia Commons).", I.introduction(res, imgs));
v('phrase pour une seule image de Wikipédia', I.introduction(res, [imgs[0]]) === "Voici une image de l'article Wikipédia « Astérix »." || /une image de l'article Wikipédia « Astérix »/.test(I.introduction(res, [imgs[0]])), I.introduction(res, [imgs[0]]));
v('aucune image : phrase honnête avec la raison', /^Je n'ai trouvé aucune image libre pour « Mickey » : l'image n'est pas libre\.$/.test(I.messageSansImage({ raison: "l'image n'est pas libre" }, 'Mickey')), I.messageSansImage({ raison: "l'image n'est pas libre" }, 'Mickey'));
v('source en panne : « indisponible » avec la raison', /indisponible/.test(I.messageIndisponible('délai dépassé')) && /délai dépassé/.test(I.messageIndisponible('délai dépassé')));
v('refus : phrases', /préfère ne pas/.test(I.messageRefus('sensible')) && /personnes privées/.test(I.messageRefus('prive')));
// navigation
let e = I.etatGalerie(3), r;
r = I.naviguer(e, 'suivante'); v('suivante : image 2 sur 3', r.etat.index === 1 && r.message === 'Image 2 sur 3.');
r = I.naviguer(r.etat, 'suivante'); r = I.naviguer(r.etat, 'suivante'); v('dernière image : on ne dépasse pas', r.etat.index === 2 && /dernière/.test(r.message));
r = I.naviguer(I.etatGalerie(3), 'precedente'); v('première image : on ne recule pas', r.etat.index === 0 && /première/.test(r.message));
r = I.naviguer(e, 'agrandir'); v('agrandir puis réduire', r.etat.agrandi === true && I.naviguer(r.etat, 'reduire').etat.agrandi === false);
v('galerie vide : aucune navigation', I.naviguer(I.etatGalerie(0), 'suivante').message === '');
console.log(`${ok} OK, ${ko} KO`); process.exit(ko ? 1 : 0);
