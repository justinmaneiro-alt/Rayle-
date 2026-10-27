// Tests des règles pures des médias (quand, combien, quoi, commandes). Lancer :  node galaxie/tests/medias-contenu-test.mjs
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../../core/commun/medias-contenu.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// ── QUAND : questions de recherche et d'actualité seulement ──
const cas = [
  ['parle-moi de la tour Eiffel', 'recherche', 'tour Eiffel'], ['Parle moi du Titanic', 'recherche', 'Titanic'], ['raconte-moi l\'histoire de Napoléon', 'recherche', 'Napoléon'],
  ['c\'est quoi un trou noir ?', 'recherche', 'trou noir'], ['qu\'est-ce que le Mont-Saint-Michel', 'recherche', 'Mont Saint Michel'], ['où se trouve Fukushima', 'recherche', 'Fukushima'],
  ['dis-moi tout sur le panda géant', 'recherche', 'panda géant'], ['explique-moi le fonctionnement d\'une éolienne', null, null], ['qui a peint la Joconde', 'recherche', 'Joconde'],
  ['quelle est l\'histoire du Pont du Gard', 'recherche', 'Pont du Gard'], 
  ['que se passe-t-il à Bordeaux', 'actualite', 'Bordeaux'], ['quoi de neuf en Ukraine', 'actualite', 'Ukraine'], ['donne-moi les dernières infos sur l\'incendie de Lyon', 'actualite', 'incendie de Lyon'],
  ['qu\'est-ce qui s\'est passé à Marseille', null, null]
];
for (const [t, genre, sujet] of cas) {
  const r = M.classer(t);
  if (genre) v('média : « ' + t + ' » → ' + genre, r && r.genre === genre && M.classer(t).sujet.replace(/-/g, ' ') === sujet.replace(/-/g, ' '), JSON.stringify(r));
  else v('(pas de média attendu) : « ' + t + ' »', r === null || r.genre, JSON.stringify(r));
}
// ── JAMAIS : commandes, conversation simple, trading, réglages, écrans, voix, Terre, galaxie, météo ──
const jamais = [
  'bonjour', 'salut Raylé', 'merci', 'merci beaucoup', 'comment tu vas', 'ça va ?', 'oui', 'non', 'ok', 'tu m\'entends ?', 'qui es-tu', 'quelle heure est-il', 'quel jour on est',
  'active le mode multi-écrans', 'désactive le mode multi-écrans', 'mets la disposition Trading', 'ferme tout', 'identifie les écrans', 'envoie les actualités sur l\'écran 2',
  'va sur Mars', 'montre-moi Saturne', 'ouvre la galaxie', 'retour à la galaxie', 'zoome sur la Terre', 'vole vers Paris', 'affiche la Terre', 'ouvre le terminal', 'montre le graphique US100',
  'passe sur l\'or', 'mets une alerte à 21000', 'c\'est quoi le RSI', 'qu\'est-ce que le trading', 'explique-moi les bougies japonaises', 'parle-moi du marché', 'où en est le cours du bitcoin',
  'quelle est la météo à Paris', 'donne-moi la météo', 'parle-moi de la météo', 'active le mode jeu', 'règle la qualité haute', 'parle plus lentement', 'coupure', 'mets-toi en veille',
  'change la voix', 'parle-moi de mes réglages', 'raconte-moi ma journée', 'parle-moi de mon voisin', 'c\'est quoi mon code d\'accès', 'note que je dois acheter du pain', 'que se passe-t-il sur mon écran',
  'les actualités', 'les actualités du sport', 'ferme les actualités', 'actualise les actualités', 'quoi de neuf', 'rappelle-moi demain', 'mets un minuteur de 5 minutes',
  'parle-moi de qui est le président de la France', 'qui est le président de la France', 'parle-moi du plus grand', 'c\'est quoi ça', 'où se trouve ça', 'parle-moi de lui',
  'parle-moi de ce porno', 'raconte-moi le massacre', 'c\'est quoi le suicide', 'quoi de neuf à mon travail'
];
for (const t of jamais) v('AUCUN média : « ' + t + ' »', M.classer(t) === null, JSON.stringify(M.classer(t)));
v('phrase très longue ignorée', M.classer('parle-moi de ' + 'la tour Eiffel et '.repeat(12)) === null);
v('le texte vide ou absurde ne plante pas', M.classer('') === null && M.classer(null) === null && M.classer(undefined) === null && M.classer('???') === null);
v('les questions visuelles explicites restent à la galerie existante (pas de double affichage)', M.classer('montre-moi la tour Eiffel') === null && M.classer('photo de la Joconde') === null && M.classer('qui est Napoléon') === null && M.classer('à quoi ressemble un panda') === null);
v('le sujet garde ses accents et ses majuscules', M.classer('Parle-moi de Châteauneuf-du-Pape').sujet === 'Châteauneuf-du-Pape' || /Châteauneuf/.test(M.classer('Parle-moi de Châteauneuf-du-Pape').sujet), M.classer('Parle-moi de Châteauneuf-du-Pape') && M.classer('Parle-moi de Châteauneuf-du-Pape').sujet);

// ── COMBIEN : modes et réglages ──
const norm = M.profil('normal', { medias: true, videos: true }), comp = M.profil('complet', { medias: true, videos: true }), leg = M.profil('leger', { medias: true, videos: true });
v('normal : compléments automatiques, 3 images, 1 vidéo, vignettes', norm.auto && norm.images === 3 && norm.videos === 1 && norm.vignettes);
v('complet : 4 images, 2 vidéos, vignettes', comp.auto && comp.images === 4 && comp.videos === 2 && comp.vignettes);
v('léger : rien d’automatique, pas de vignettes, une image à la demande', !leg.auto && leg.images === 0 && leg.videos === 0 && !leg.vignettes && leg.explicite === 1);
const off = M.profil('complet', { medias: false, videos: true }), sansVid = M.profil('complet', { medias: true, videos: false });
v('médias désactivés : rien du tout (ni auto, ni vignettes, ni explicite)', !off.auto && off.images === 0 && off.videos === 0 && !off.vignettes && off.explicite === 0);
v('vidéos désactivées : images oui, vidéos non', sansVid.auto && sansVid.images === 4 && sansVid.videos === 0);
v('mode inconnu = normal', M.profil('?', { medias: true, videos: true }).images === 3 && M.profil(undefined).vignettes);
const st = o => k => (k in o ? o[k] : null);
v('réglages : tout activé par défaut', (r => r.medias && r.videos)(M.lireReglages(st({}))));
v('réglages : médias coupés = vidéos coupées aussi', (r => !r.medias && !r.videos)(M.lireReglages(st({ rayle_medias: '0' }))) && (r => r.medias && !r.videos)(M.lireReglages(st({ rayle_videos: '0' }))));
v('réglages : stockage inaccessible → valeurs par défaut', (r => r.medias && r.videos)(M.lireReglages(() => { throw new Error('bloqué'); })));

// ── QUOI : vidéos ──
const yt = (o = {}) => ({ plateforme: 'youtube', titre: 'Incendie à Lyon', auteur: 'franceinfo', licence: 'Lecteur officiel YouTube', source_url: 'https://www.youtube.com/watch?v=abcDEFghi_1', embed: 'https://www.youtube-nocookie.com/embed/abcDEFghi_1', miniature: 'https://i.ytimg.com/vi/abcDEFghi_1/hqdefault.jpg', ...o });
v('vidéo YouTube officielle acceptée (lecteur nocookie)', M.filtrerVideos({ videos: [yt()] }, 2).length === 1);
v('vidéo : lecteur sur un autre site refusé', M.filtrerVideos({ videos: [yt({ embed: 'https://www.youtube.com/embed/abcDEFghi_1' }), yt({ embed: 'https://evil.example/embed/abcDEFghi_1' }), yt({ embed: 'javascript:alert(1)' })] }, 3).length === 0);
v('vidéo : miniature ou lien de source étrangers refusés', M.filtrerVideos({ videos: [yt({ miniature: 'https://evil.example/a.jpg' }), yt({ source_url: 'https://evil.example/watch?v=abcDEFghi_1' })] }, 3).length === 0);
v('vidéo : sans titre, auteur ou licence → refusée', M.filtrerVideos({ videos: [yt({ titre: '' }), yt({ auteur: '' }), yt({ licence: '' })] }, 3).length === 0);
v('vidéo : plateforme inconnue refusée', M.filtrerVideos({ videos: [yt({ plateforme: 'tiktok' })] }, 3).length === 0);
const cm = { plateforme: 'commons', titre: 'Apollo 11', auteur: 'NASA', licence: 'Public domain', source_url: 'https://commons.wikimedia.org/wiki/File:Apollo.webm', fichier: 'https://upload.wikimedia.org/wikipedia/commons/a.webm', type_mime: 'video/webm', miniature: 'https://upload.wikimedia.org/t.jpg' };
v('vidéo Commons : fichier lu depuis Wikimedia seulement', M.filtrerVideos({ videos: [cm] }, 2).length === 1 && M.filtrerVideos({ videos: [{ ...cm, fichier: 'https://evil.example/a.webm' }] }, 2).length === 0);
const ar = { plateforme: 'archive', titre: 'Film', auteur: 'X', licence: 'Domaine public', source_url: 'https://archive.org/details/film', embed: 'https://archive.org/embed/film', miniature: 'https://archive.org/services/img/film' };
v('vidéo Internet Archive : lecteur archive.org/embed seulement', M.filtrerVideos({ videos: [ar] }, 2).length === 1 && M.filtrerVideos({ videos: [{ ...ar, embed: 'https://archive.org.evil.example/embed/film' }] }, 2).length === 0);
v('vidéos : au plus n, sans doublon, réponse absente tolérée', M.filtrerVideos({ videos: [yt(), yt(), cm, ar] }, 2).length === 2 && M.filtrerVideos(null, 2).length === 0 && M.filtrerVideos({}, 2).length === 0);

// ── QUOI : images des flux RSS ──
const sujet = { titre: 'Incendie à Lyon', image: 'https://img.fr/a.jpg', sources: [{ nom: 'Média A', url: 'https://a.fr/x', titre: 'Un incendie ravage un entrepôt', image: 'https://img.fr/a.jpg' }, { nom: 'Média B', url: 'https://b.fr/y', titre: 'Lyon : incendie', image: 'https://img.fr/b.jpg' }, { nom: 'Média C', url: 'https://c.fr/z', titre: 'Sans image', image: null }, { nom: 'Média D', url: 'https://d.fr/z', image: 'http://img.fr/d.jpg' }] };
const ims = M.imagesDuSujet(sujet, 4);
v('images d’actualité : une par média, https seulement, sans doublon, sans image inventée', ims.length === 2 && ims.map(i => i.auteur).join() === 'Média A,Média B', JSON.stringify(ims.map(i => i.auteur)));
v('images d’actualité : légende « Source … · droits … », lien vers l’article', ims[0].source_url === 'https://a.fr/x' && /flux RSS du média \(© Média A\)/.test(ims[0].licence) && ims[0].titre === 'Un incendie ravage un entrepôt');
v('images d’actualité : sujet sans image → liste vide', M.imagesDuSujet({ titre: 'x', sources: [{ nom: 'A', url: 'https://a.fr/x' }] }, 4).length === 0 && M.imagesDuSujet(null, 4).length === 0);

// ── COMMANDES VOCALES ──
const c = M.commande;
for (const t of ['enlève les images', 'enlève les photos', 'retire les images', 'cache les images', 'ferme les images', 'supprime les vidéos']) v('commande « ' + t + ' » → enlever', (c(t) || {}).type === 'enlever', JSON.stringify(c(t)));
for (const t of ['désactive les images', 'désactive les vidéos', 'coupe les images', 'plus d\'images', 'n\'affiche plus d\'images']) { const r = c(t); v('commande « ' + t + ' » → désactiver', r && r.type === 'desactiver', JSON.stringify(r)); }
v('désactiver les vidéos ne coupe que les vidéos', c('désactive les vidéos').quoi === 'videos' && c('désactive les images').quoi === 'medias');
for (const t of ['active les images', 'réactive les vidéos', 'remets les images']) v('commande « ' + t + ' » → activer', (c(t) || {}).type === 'activer', JSON.stringify(c(t)));
for (const [t, quoi, idx] of [['montre-moi les images de cette actualité', 'images', null], ['montre-moi les vidéos de cette actualité', 'videos', null], ['montre-moi les images de l\'actualité', 'images', null], ['montre-moi les images de la deuxième actualité', 'images', 2], ['affiche les photos de la première actualité', 'images', 1], ['montre les images et vidéos de cette actualité', 'tout', null], ['montre-moi les images de la dernière actualité', 'images', -1]]) {
  const r = c(t); v('commande « ' + t + ' » → galerie d’actualité', r && r.type === 'galerie_actu' && r.quoi === quoi && r.index === idx, JSON.stringify(r));
}
const vd = c('montre-moi une vidéo de la tour Eiffel'); v('commande « montre-moi une vidéo de la tour Eiffel » → vidéo', vd && vd.type === 'video' && /tour Eiffel/i.test(vd.sujet), JSON.stringify(vd));
v('vidéo de… : sujets interdits refusés (trading, sensible, privé)', c('montre-moi une vidéo du graphique') === null && c('montre-moi une vidéo de mon voisin') === null && c('montre-moi une vidéo de cadavre') === null);
for (const t of ['montre-moi la Terre', 'montre-moi des images de Rome', 'ferme la galaxie', 'bonjour', 'ferme les actualités', 'les actualités', 'ferme l\'image', 'image suivante', 'agrandis l\'image']) v('commande médias : « ' + t + ' » n’est PAS pour les médias', c(t) === null, JSON.stringify(c(t)));
v('phrases de Raylé présentes', typeof M.phrases.desactive === 'string' && /Dis « active/.test(M.phrases.desactive) && /Sujet|sujet|« x »/.test(M.phrases.aucuneVideo('x')));

console.log(ko ? ko + ' ÉCHEC(S), ' + ok + ' réussis' : 'medias-contenu : ' + ok + ' vérifications réussies');
process.exit(ko ? 1 : 0);
