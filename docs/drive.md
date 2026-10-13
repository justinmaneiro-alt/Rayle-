# Documents du Drive : lire, ouvrir et modifier

Raylé peut ouvrir, lire à voix haute, résumer, chercher dans et modifier les documents de **ton** Google Drive : Google Docs, PDF (lecture seule), Word `.docx`, texte / Markdown, Google Sheets (lecture) et Google Slides (texte, lecture). Tout se passe **dans le navigateur**, avec ta propre connexion Google : le Worker de Raylé ne voit jamais ces documents.

> **Tant que `js/config-drive.js` est vide, rien ne change** : la fonction est désactivée, Raylé n'intercepte aucune phrase (les outils du Worker restent comme avant), et les boutons de Réglages l'indiquent. Il faut le faire une fois, comme décrit ci-dessous (≈ 10 minutes).

## 1. Créer l'identifiant client Google (une seule fois)

1. Ouvre la [console Google Cloud](https://console.cloud.google.com/) et crée un projet (par exemple « Rayle »).
2. **API et services → Bibliothèque** : active ces cinq API (bouton « Activer » sur chacune) :
   - **Google Drive API**
   - **Google Picker API** (le sélecteur de fichiers)
   - **Google Docs API** (indispensable pour modifier un Google Doc ; sans elle Raylé lit en secours, en lecture seule)
   - **Google Sheets API**
   - **Google Slides API**
3. **API et services → Écran de consentement OAuth** :
   - Type d'utilisateur : **Externe**. Nom de l'application : « Raylé ». Ton adresse e-mail pour le support et le contact.
   - **Champs d'application (scopes)** : ajoute uniquement `…/auth/drive.file` (« Voir, modifier, créer et supprimer uniquement les fichiers Google Drive que vous avez ouverts avec cette application »). C'est un scope **non sensible** : aucune validation Google n'est nécessaire.
   - **Utilisateurs de test** : ajoute ton adresse Gmail. Tu peux ensuite cliquer « Publier l'application » pour ne plus dépendre de la liste de test (toujours sans validation, vu le scope).
4. **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   - Type : **Application Web**.
   - **Origines JavaScript autorisées** : l'adresse de ton site GitHub Pages, **origine seule** (pas de chemin, pas de `/` final) :
     `https://justinmaneiro-alt.github.io`
     Pour des essais sur ton PC, ajoute aussi `http://localhost:8000` (ou le port que tu utilises).
   - **URI de redirection** : rien à mettre (Raylé utilise la fenêtre de connexion de Google, pas de redirection ni de serveur).
5. Copie l'**ID client** (il se termine par `.apps.googleusercontent.com`).
6. Ouvre `js/config-drive.js` et colle-le :

   ```js
   window.RAYLE_DRIVE_CONFIG = {
     clientId: '123456789012-abcdefghij.apps.googleusercontent.com',
     appId: '123456789012',   // numéro de projet (voir ci-dessous)
     apiKey: ''
   };
   ```

   - **`clientId`** : l'ID client OAuth. C'est une valeur **publique** (Google l'affiche dans l'adresse de connexion) : elle a sa place dans le dépôt.
   - **`appId`** : le **numéro de projet** (chiffres seuls), visible sur la page d'accueil du projet dans la console (« Numéro du projet »). Public aussi. Il permet au sélecteur de te donner, à Raylé, l'accès aux fichiers choisis. S'il est omis, l'accès peut échouer (« Document introuvable ou non autorisé »).
   - **`apiKey`** : **laisse vide**. À renseigner seulement si le sélecteur affiche « The API developer key is invalid » : crée alors une clé d'API (Identifiants → Créer → Clé d'API), **restreins-la** aux référents HTTP de ton site et à la seule « Picker API ». Une clé ainsi restreinte est publique par conception, mais, comme tu l'avais demandé, rien d'autre que l'identifiant client n'est exigé par défaut.
   - **Ne mets jamais** un « code secret du client » (`GOCSPX-…`), un jeton ou un mot de passe dans ce fichier ni ailleurs dans le dépôt : Raylé n'en a pas besoin (flux « jeton » dans le navigateur, sans serveur). Les tests vérifient d'ailleurs qu'aucun secret ne traîne dans `js/`, `css/` et `docs/`.
7. Publie le site comme d'habitude (`node scripts/versionner.mjs <version>`, commit, push).

## 2. Se connecter et choisir les documents

1. **⚙ Réglages → Google Drive → Se connecter à Google** (ou dis « connecte-toi à Google », puis touche le bouton qui apparaît dans la fenêtre : Google exige un geste de ta part pour ouvrir sa fenêtre de connexion, une phrase dite ne suffit pas). Sur tablette, la fenêtre de connexion s'ouvre en popup ; si le navigateur la bloque, autorise les popups pour le site.
2. **Choisir des documents** (ou « ajoute un document du Drive ») : le sélecteur Google s'ouvre. Coche les documents que Raylé peut voir. **Raylé ne voit que ceux-là** (accès `drive.file`).
3. Raylé mémorise leur **identifiant, nom et type** dans le navigateur pour les retrouver par leur nom (approximatif accepté). Tu peux en retirer dans la fenêtre (📁, bouton ✕) ; **Se déconnecter** révoque le jeton chez Google.
4. Le jeton d'accès (1 heure) reste **en mémoire de la page** ; il n'est écrit nulle part. À l'expiration, Raylé tente une reconnexion silencieuse ; si Google demande un geste, le bouton « Se connecter à Google » s'affiche dans la fenêtre et Raylé **reprend ta demande** une fois connecté.

## 3. Ce que tu peux dire

| Outil du registre | Exemples |
|---|---|
| `drive:ouvrir` | « ouvre le cours d'anatomie » · « ouvre le document rapport de stage » (nom approximatif accepté ; s'il y a deux candidats, Raylé demande « le premier ou le deuxième ? ») |
| `drive:lire-passage` | « lis le 2e paragraphe » · « lis la page 3 » · « lis la partie sur les muscles » · « lis le passage où il est question de l'humérus » · « lis-moi la suite » · « lis le dernier paragraphe » |
| `drive:resumer` | « résume le document » · « résume cette partie » · « résume le cours d'anatomie » |
| `drive:chercher` | « cherche l'humérus dans le document » · « où est-il question de la rotule ? » |
| `drive:lister` | « liste mes documents » · « quels documents sont autorisés ? » |
| `drive:modifier` | « corrige la faute dans le 2e paragraphe » · « remplace tibia par fibula dans le 3e paragraphe » · « ajoute ce paragraphe sous le titre Introduction : … » · « ajoute « Merci. » à la fin du document » · « supprime le dernier paragraphe » |
| `drive:enregistrer` | « enregistre le document » (en mode édition) |
| `drive:annuler` | « annule la dernière modification » · « reviens à la version précédente » |
| fenêtre | « plein écran » · « taille normale » · « réduis la fenêtre » · « ferme le document » · « passe en mode édition » · « zoome » · « surligne ce passage » · « quel document est ouvert ? » |

Les mêmes outils sont déclarés dans le registre des capacités (`docs/capacites.md`, famille « Documents du Drive ») et, côté Worker, par l'outil `commande_drive` (l'IA transmet une phrase simple à la page ; **colle `worker/worker.js` dans Cloudflare** pour l'activer : sans cela, les phrases ci-dessus sont comprises par la page, mais l'IA ne saura pas les relayer).

### Règles d'honnêteté (testées)

- Raylé **exécute directement l'outil**, sans recherche web. Un document non autorisé : « Je ne trouve pas … Veux-tu que j'ouvre le sélecteur Google ? » (dis « oui »).
- Elle **ne cite que le texte réel** du document (lecture littérale, résumé fait de phrases extraites ; pas de reformulation inventée). Les pages n'existent pas dans un Google Doc : elle le dit au lieu d'en inventer.
- Elle **ne dit jamais avoir lu ou modifié** si l'opération a échoué : l'erreur est dite telle quelle (réseau, API désactivée, droits, document modifié ailleurs…). Après une écriture, elle **relit le document** pour vérifier ; si elle ne retrouve pas le changement, elle le dit.
- **Aperçu avant/après** pour toute modification (dans la fenêtre : texte barré en rouge → texte en vert, boutons Valider / Annuler ; à la voix : « valide » / « annule »). Rien n'est écrit avant. Pour passer outre : « applique directement : … ».
- « Corrige » et « reformule » passent par l'IA du Worker ; un garde-fou refuse une « correction » qui réécrit trop le texte. Le paragraphe concerné est envoyé à l'IA, rien d'autre.

## 4. La fenêtre

- **Déplacer** : glisse la barre de titre. **Redimensionner** : 8 poignées (bords et coins ; plus larges au doigt). Taille et position sont mémorisées.
- **Réduire** (▁), **plein écran** (⤢, ou double-clic sur la barre), **fermer** (✕). Le plein écran est **réel** (Fullscreen API) quand le navigateur l'autorise (au toucher d'un bouton) ; sinon (phrase dite : le navigateur exige un geste ; iPhone/iPad) Raylé bascule en **plein écran simulé** et le dit. Le retour rend la taille précédente.
- **Lecture** : toucher un paragraphe le choisit comme « ce passage » (pour « lis la suite », « surligne ce passage », « corrige ce passage »). **Édition** (✎) : chaque paragraphe se modifie ; Entrée crée un paragraphe ; l'indicateur **● modifié** s'allume ; **Enregistrer** demande confirmation (et prévient si le document a changé sur le Drive depuis l'ouverture : « Écraser » ou « Recharger ») ; case **auto** : enregistrement automatique après une pause (confirmé à l'activation, jamais s'il y a un conflit). ↶ annule la dernière modification.
- Raylé **voit** ce qui est ouvert (document, passage lu, partie affichée, mode, plein écran, aperçu en attente) : cela alimente son contexte (« lis-moi la suite », « surligne ce passage », « zoome »). Le surlignage est un **affichage seulement** : il n'écrit rien dans le document.

## 5. Formats et mise en forme

| Format | Lecture | Écriture | Mise en forme |
|---|---|---|---|
| Google Docs | oui (titres, listes, tableaux) | oui, via l'API Docs | seuls les caractères changés sont remplacés : gras, liens, tailles voisins conservés ; un paragraphe ajouté sous un titre prend le style « texte normal » ; images et objets conservés (jamais touchés) |
| Word `.docx` | oui | oui (le fichier est réécrit sur le Drive) | seuls les paragraphes modifiés changent (le reste du fichier, images, styles, en-têtes, est conservé octet pour octet) ; dans un paragraphe, les mots voisins gardent leur gras / italique |
| Texte, Markdown | oui | oui | fins de ligne, titres `#` et séparateurs conservés |
| PDF | oui (texte par page) | non | — (PDF scanné : pas de reconnaissance de caractères, Raylé le dit) |
| Google Sheets | oui (lignes avec les en-têtes ; 400 lignes, 8 feuilles) | non | valeurs affichées, pas les formules |
| Google Slides | oui (titre, texte, notes de chaque diapositive) | non | — |

**Ce qui ne peut pas être conservé / modifié** (Raylé le signale à l'ouverture) : tableaux, sommaires, paragraphes contenant des images, champs ou sauts de section (lus, jamais modifiés) ; zones de texte et notes de bas de page (non lues) ; modifications suivies Word (lues telles qu'affichées) ; numéros de page Word (approximatifs, d'après la dernière mise en page enregistrée). Un paragraphe supprimé puis restauré par « annuler » retrouve son texte mais le style « texte normal ».

**Annulation** : Raylé garde, par document, les 8 dernières modifications faites depuis elle (texte seulement, dans le navigateur). « Annuler » relit le document et ne défait que si le paragraphe est encore tel qu'elle l'a laissé ; sinon elle le dit et renvoie vers l'historique des versions de Google Docs / Word (toujours disponible, chaque écriture crée une version sur le Drive).

## 6. Sécurité

- Seul l'identifiant client public est dans le dépôt (`js/config-drive.js`, vide par défaut). Aucun secret, aucun jeton.
- Bibliothèques tierces chargées à la demande depuis cdnjs avec **empreinte SRI** vérifiée : JSZip 3.10.1 (Word) et PDF.js 3.11.174 (PDF). Voir `CREDITS.md`.
- Portée minimale `drive.file`. Déconnexion = révocation du jeton ; tu peux aussi retirer l'accès sur [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## 6 bis. Mémoire des cours (Réglages → « Mémoire des cours »)

| Bouton | Ce qui se passe |
|---|---|
| **Analyser et mémoriser tous mes cours** | Ouvre le sélecteur Google en **multi-sélection** (vue en liste, cases à cocher). Les **dossiers s'ouvrent pour naviguer mais ne se cochent pas** : seuls les documents cochés sont ajoutés. Après chaque validation, « X documents ajoutés au total, en ajouter d'autres ? » : **Ajouter d'autres documents** rouvre le sélecteur (aucune limite de lots), **Terminer** conclut ; les documents déjà en mémoire ne sont ni écrasés ni doublés. Raylé lit chaque document (Google Docs, Word, PDF, texte, Sheets, Slides), en extrait le texte et le range dans une **base locale IndexedDB** de cet appareil. Une barre indique « document X sur Y » ; le résumé final donne le nombre de documents et la taille. |
| **Ouvrir un document** (Réglages › Google Drive) | Sélecteur en mode **un seul document** : il s'affiche dans la fenêtre de lecture (lecture seule, texte sélectionnable, bouton **⧉ Copier**) **sans être mémorisé ni indexé** (ni liste des autorisés, ni mémoire des cours). |
| **Relire mes cours** | Relit TOUT depuis le Drive (mêmes dossiers et fichiers), sans rouvrir le sélecteur. |
| **Oublier mes cours** | Efface la base locale et la liste des dossiers suivis (après confirmation). Le Drive n'est jamais modifié. |

**Resynchronisation automatique** : à chaque ouverture de Raylé, si une mémoire existe, elle compare les dates de modification du Drive et ne relit que les documents **modifiés**, ajoute les **nouveaux** et retire ceux qui ont **disparu**. Rien à refaire. Si Google demande un geste pour se reconnecter, Raylé attend ta connexion (« Se connecter à Google ») puis resynchronise seule.

**Honnêteté** : un document qui ne peut pas être lu est listé dans le bilan (jamais compté comme mémorisé) et son ancienne version reste en base. Un PDF scanné sans texte est signalé « sans texte exploitable ».

### Dossiers : à savoir

Avec la portée par défaut `drive.file`, Google donne accès **aux fichiers choisis un par un**, pas toujours à ce que contient un dossier. Si un dossier ressort « sans document visible pour Raylé », deux solutions :

1. choisir les documents eux-mêmes dans le sélecteur (Ctrl/⌘ + clic ou « tout sélectionner » dans le dossier) ;
2. **autoriser la lecture complète** : dans la console Google Cloud → écran de consentement → ajouter la portée `.../auth/drive.readonly`, puis dans `js/config-drive.js` mettre `lectureComplete: true`. Raylé redemande alors le consentement (`drive.file` + `drive.readonly`). Tant que ton application reste en mode « Test » avec toi comme utilisateur de test, aucune vérification Google n'est nécessaire. L'écriture (corrections) reste limitée aux documents choisis.

## 7. Dépannage

| Symptôme | Cause et remède |
|---|---|
| « Google Drive : pas encore configuré » | `clientId` vide ou mal copié dans `js/config-drive.js`. |
| Google : `Error 400: origin_mismatch` / `redirect_uri_mismatch` | L'adresse du site n'est pas dans les **Origines JavaScript autorisées** (origine exacte, `https`, sans `/` final). Compte une minute pour la propagation. |
| `access_denied` / « l'application n'a pas été validée » | Ajoute ton Gmail aux utilisateurs de test (ou publie l'application). |
| « L'API Google … n'est pas activée dans le projet » | Active l'API citée à l'étape 2 ; attends une minute. |
| « Document introuvable, ou non autorisé pour Raylé » | Le fichier n'a pas été choisi avec le sélecteur, ou `appId` manque : reviens au sélecteur. |
| Le sélecteur dit « The API developer key is invalid » | Renseigne `apiKey` (clé restreinte) comme décrit plus haut. |
| La fenêtre de connexion ne s'ouvre pas | Popups bloquées : autorise-les ; la connexion doit venir d'un toucher sur « Se connecter à Google ». |
| « Le document a changé sur le Drive pendant l'opération » | Quelqu'un (ou un autre onglet) l'a modifié : recharge et recommence. |

## 8. Ce qui est vérifié, et ce qui ne l'est pas

Vérifié automatiquement : recherche de document par nom approximatif, extraction de passage (paragraphe, titre, page, mot-clé, suite), résumé extractif, analyseur de phrases, lecture/écriture/annulation pour Google Docs (avec contrôle des positions de l'API), Word (JSZip réel), texte, PDF (PDF.js réel), Sheets et Slides, conflits, erreurs honnêtes, garde-fou de correction, connexion/expiration/déconnexion (faux services Google), sélecteur, absence de secret dans le dépôt — `node tests/drive-test.mjs`, `tests/drive-auth-test.mjs`, `tests/drive-worker-test.mjs`. Vérifié dans Chrome (headless, souris et émulation tactile de tablette) : fenêtre, déplacement, redimensionnement, plein écran réel, réduction, lecture, aperçu, édition, enregistrement, annulation, sans erreur JavaScript.

Mémoire des cours : `node tests/drive-lots-test.mjs` (lots, ouverture sans mémorisation, mémoire par lots) ; `node tests/drive-memoire-test.mjs` (dossiers imbriqués et en cycle, pagination, progression, resynchronisation sans relecture, modifiés / nouveaux / supprimés, erreurs isolées, coupure de connexion, oubli, verrou) ; la base IndexedDB réelle, la barre de progression et la resynchronisation à la réouverture ont été vérifiées dans Chrome headless.

**Non testé** : une vraie connexion Google (compte, consentement, sélecteur réel, API réelles de Google : seuls des simulacres fidèles ont servi), et une vraie tablette (gestes tactiles et popup de connexion sur Android / iPad : seulement l'émulation tactile de Chrome). Le premier essai réel est donc la vraie recette : « Se connecter », « Choisir des documents », « ouvre … », « lis le 2e paragraphe ».
