# Planètes en modules indépendants, navigation et position de l'entité

Cette page décrit la restructuration « chaque planète est un module » et la position de l'entité Rayle. L'apparence de la Terre et des planètes n'a pas changé : seule l'organisation du code et la navigation sont nouvelles.

## 1. Organisation

```
js/univers/planetes/
  registre.js        registre central (métadonnées légères, aucune scène importée au départ)
  agent.js           contrat d'agent { id, nom, role, endpoint } (interface vide, voir §5)
  commun.js          briques communes : interieurVue() (scène portée par une vue du thème) et interieurAbsent()
  soleil/ mercure/ venus/ terre/ lune/ mars/ jupiter/ saturne/ uranus/ neptune/
    index.js         scène intérieure de la planète : { mount(P, opts), unmount(P, opts) }
```

Les identifiants restent ceux du code existant (français : `terre`, `saturne`…) pour ne pas casser les fiches, les réglages enregistrés ni les commandes vocales. Les alias anglais (`earth`, `saturn`, `moon`…) sont reconnus par `trouver()`.

Le dossier `src/` n'existe pas dans ce dépôt (JavaScript natif, sans bundler) : l'équivalent est `js/univers/planetes/`.

## 2. Le registre

Chaque entrée de `PLANETES` (voir `registre.js`) porte :

| Champ | Contenu |
|---|---|
| `id`, `alias`, `nom`, `art` | identité (le nom et l'article viennent des fiches `ASTRES`) |
| `role` | ce qu'on y fait : Terre = Carte du monde, Mars = Base martienne, Saturne = Vaisseau, Jupiter = Base de code, les autres : `null` |
| `texture`, `textureUrl(res)` | chemin de la texture réelle (`espace/mars-{res}.webp`, `res` = `1k` ou `2k`) |
| `taille` | `{ rayonKm, rayonTerre }` — calculés depuis `ASTRES` |
| `orbite` | `{ a (UA), periodeJ, autour }` — depuis `ASTRES` |
| `themeInterieur` | `{ id, nom, vue }` si une scène intérieure est installée, sinon `null` |
| `themePrevu` | thème envisagé pour une planète encore vide (« vaisseau », « base de code ») |
| `agent` | contrat d'agent, vide pour l'instant |
| `etat` / `etatLibelle` | `actif` (scène installée : Terre et Mars) ou `pret` (« prêt à recevoir un thème » : toutes les autres) |
| `mount(P, opts)` / `unmount(P, opts)` | entrer dans la scène intérieure / en sortir et la libérer |

Fonctions exportées : `liste()`, `trouver(nom)`, `planeteDeVue(vue)`, `entrer(nom, P)`, `sortir(P, {cible})`, `retourSysteme(P)`, `declarerAgent(id, agent)`, `chargees()`, `resume()`.

### Ajouter un thème intérieur à une planète (exemple : Saturne → vaisseau)

1. Écrire la scène dans `js/univers/planetes/saturne/index.js` : `export default { mount(P, opts), unmount(P, opts) }`. Si la scène est une vue du thème Espace, utiliser `interieurVue({ id, vue, … })` de `commun.js`.
2. Dans `registre.js`, renseigner `interieur: { id: 'vaisseau', nom: 'Vaisseau', vue: 'saturne' }` pour Saturne. L'état passe tout seul à `actif`, la fiche de la planète, le bouton « Entrer » et la commande vocale l'utilisent aussitôt.
3. Si la scène est une vue du thème Espace, l'ajouter à `VUES` dans `theme-espace.js`.

## 3. Chargement paresseux et mémoire

- Le registre ne contient que des métadonnées et n'importe aucune scène (test : seulement `donnees/planetes.js` et `agent.js`).
- **Entrer** dans une planète importe son module à ce moment-là seulement. Entrer dans une planète « prête » n'importe rien : elle répond qu'elle est prête à recevoir un thème.
- **Sortir** (bouton, « retour au système solaire », « sors de Mars ») détruit la scène quittée : le thème libère les géométries, matériaux et modèles de la vue (`liberer()` dans `theme-espace.js`) ; elle se recrée à la prochaine entrée. Une animation en cours est passée avant la destruction.
- Limite honnête : la Terre fait partie du cœur du thème (le globe est déjà en mémoire quand l'Univers s'ouvre), et les textures partagées restent dans le cache du noyau.

## 4. Navigation

Depuis le système solaire : toucher une planète (ou dire « va sur Mars », « montre-moi Saturne ») vole jusqu'à elle et reste devant. On la fait tourner au doigt ou à la souris (la vue), on zoome en pinçant, avec la molette ou à la voix, puis on entre.

| À la voix | Effet |
|---|---|
| « va sur Mars », « montre-moi Saturne », « cap sur Jupiter » | vol jusqu'à la planète (déjà existant) |
| « fais tourner Jupiter », « fais tourner la planète » | la planète tourne sur elle-même, plus vite qu'en vrai |
| « arrête de tourner », « arrête la rotation » | arrête |
| « zoome », « rapproche-toi » / « dézoome », « recule » | zoom doux sur la planète regardée |
| « entre dans Mars », « entre dans la Terre », « entre dedans » | entre dans la scène intérieure (Terre → carte, Mars → base) |
| « entre dans Saturne » | répond que Saturne est prête à recevoir un thème (vaisseau prévu) |
| « sors de Mars », « sors de la planète » | ressort devant la planète |
| « retour au système solaire », « retourne au système » | vue d'ensemble du système |

Boutons : « 🚪 Entrer » et « 🔄 Faire tourner » sur la fiche de la planète et dans la barre de chips ; « ↩ Retour au système » dans la barre dès qu'on est dans une planète.

L'ambiance (jour/nuit, météo) n'est pas touchée : les modules ne l'utilisent pas.

## 5. Contrat d'agent (interface vide)

Chaque planète déclare `agent: { id: null, nom: null, role: null, endpoint: null }`. Rien n'est appelé ni simulé tant que `endpoint` est `null`. `declarerAgent(id, agent)` valide le contrat (4 champs exactement, texte ou `null`, `endpoint` en `https://`, un agent branché doit avoir un `id`) puis l'attache ; `estBranche(agent)` dit s'il est joignable. Le branchement réel est prévu au Prompt 6.

## 6. Position de l'entité Rayle

Trois modes, dans toutes les vues (accueil, système solaire, Terre, Mars…) :

| Mode | Description |
|---|---|
| **Petite dans un coin** | haut-gauche, haut-droite, bas-gauche, bas-droite ; reste animée et à l'écoute |
| **Grande au centre** | mode conversation |
| **Grande sur le côté** | gauche ou droite ; dans l'Univers, la scène est décalée pour occuper le reste de l'écran |

Réglages : liste « Position de l'entité » dans Apparence (bouton ◐) et dans ⚙ Réglages, liste dans la barre du haut de l'Univers, case « Mémoriser pour cette vue seulement ». On peut aussi la **faire glisser** : elle se cale sur le centre, le côté ou l'angle le plus proche de l'endroit où on la lâche (un glissement ne déclenche pas le micro).

| À la voix | Effet |
|---|---|
| « mets-toi dans le coin », « petite dans un coin » | angle actuel (ou haut-droite) |
| « mets-toi en haut à gauche », « …dans le coin en bas à droite » | angle précisé |
| « au centre », « mets-toi au centre » | grande au centre |
| « sur le côté gauche », « mets-toi sur le côté droit », « colle-toi à droite » | grande sur le côté |
| « épingle cette position pour cette vue » / « oublie la position de cette vue » | mémorise ou oublie la position de la vue courante |
| « réinitialise ta position », « oublie toutes les positions » | efface tout |

« Range-toi » et « mets-toi sur le côté » (sans gauche ni droite) gardent leur sens : la petite bulle du mode « Ranger ».

Règles :

- **Par vue** : chaque vue (accueil, système solaire, Terre, Mars…) peut mémoriser sa position. Sans mémorisation, la position générale vaut partout. Défauts : accueil = grande au centre ; Univers = petite en haut à droite (comme avant), et en bas à droite sur téléphone (la barre du haut y occupe la moitié de l'écran).
- **Sauvegarde** : `localStorage` (`rayle_entite_pos`, `rayle_entite_pos_vues`), en valeurs relatives, donc valable sur PC, tablette et téléphone.
- **Sans rien masquer** : les marges sont mesurées (barre du bas, titre, barre du haut de l'Univers, cartes et légendes) ; l'entité reste sous les panneaux.
- **Panneau ouvert** (carte, actus, terminal…) : elle devient petite dans un angle libre (aucun recouvrement avec les panneaux ouverts), puis revient à sa position quand ils se ferment.
- **Transitions** : animation FLIP de 0,52 s (translation + échelle), désactivée si « réduire les animations » est demandé.
- **Bulle « Ranger » et mode discret** gardent leurs propres règles (la position n'intervient pas).

Fichiers : `js/rayle/position-entite.js`, `css/entite-position.css`, `decalerVue()` dans `js/univers/noyau.js`, sélecteur dans `ui/settings.js`.

## 7. Tests

```
node tests/planetes-registre-test.mjs     registre, états, alias, agent, chargement paresseux, entrer/sortir
node tests/entite-position-test.mjs       placement sur 7 écrans × 7 positions, sauvegarde, vues, panneaux, glisser, rangement
node tests/univers-voix-test.mjs          phrases : planètes (entrer, sortir, retour, tourner, zoomer) et position de l'entité
```
