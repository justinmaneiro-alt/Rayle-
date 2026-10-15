# Anatomie & Orthopédie 3D

Module de Raylé : fenêtre plein écran « Anatomie & Orthopédie » (au même titre que le Terminal), pop-up 3D rapide depuis l'accueil, simulation d'amputations, de scolioses et de fractures, appareillages (prothèses, corsets, orthèses) et base de connaissances alimentée par les cours de Justin.

> **Outil pédagogique.** Le modèle est schématique : il ne remplace ni un bilan clinique, ni une prescription médicale, ni l'avis d'un orthoprothésiste.

## Pile technique (et pourquoi pas React / TypeScript)

L'application est en **JavaScript natif sans étape de build** (scripts classiques + modules ES, three.js chargé à la demande par `UI.three()`, cache-busting par `scripts/versionner.mjs`). Le module suit ce cadre plutôt que d'introduire React, Zustand ou un compilateur :

| Demande du cahier des charges | Réalisation |
|---|---|
| React / R3F / drei | modules ES + three.js 0.160 (`js/anatomie/moteur.js`), contrôles orbitaux écrits à la main (rotation, zoom, translation, pincement tactile) |
| Zustand / Redux | `js/anatomie/store.js` : store immuable `{obtenir, definir, abonner}` + actions nommées (`actions.basculerCalque`…) |
| `components/anatomy3d/`, `components/orthopedics/`, `stores/useAnatomyStore.ts` | `js/anatomie/` (voir ci-dessous), `useAnatomieStore` |
| TypeScript | JavaScript commenté ; les formats de données sont décrits en tête de chaque fichier `donnees-*.js` |
| Fenêtres drag-and-drop / redimensionnables | pop-up `#anQuick` déplaçable (poignée de l'en-tête) et redimensionnable (`resize`), cadre HUD de `css/hud.css` partagé avec le terminal |

## Fichiers

```
js/anatomie/
  store.js              état global : calques, sélection, isolation, pathologies, appareillage, fenêtres
  donnees-os.js         squelette (coordonnées en mètres, 1,75 m), vertèbres, repères palpables
  donnees-muscles.js    30 muscles : origine, terminaison, trajet, action, innervation
  donnees-nerfs-organes.js   nerfs, moelle, organes, dermatomes
  donnees-ortho.js      amputations (14 niveaux), scolioses types, fractures (10), matériaux (16), appareillages (14)
  registre.js           recherche par nom (alias, pluriels, côtés), fiches, liens os ↔ muscles
  construction.js       géométries procédurales (repli sans GLB) : os, vertèbres, côtes, muscles, nerfs, peau, dermatomes
  modeles-glb.js        chargement des modèles GLB (atlas de squelette, entrées individuelles, cache, repli)
  correspondance-squelette.js   table : nœuds du GLB de squelette → os de l'application (3 atlas : os axiaux BodyParts3D, mains/pieds/crâne BodyParts3D, CC0 en repli)
  corps-hd.js           corps haute fidélité : muscles, tendons, vaisseaux, organes, nerfs BodyParts3D recalés sur les os affichés (ancres de peau), voir docs/anatomie-haute-fidelite.md
  donnees-corps.js      muscles et tendons individuels (nom français, latin, concepts BodyParts3D) ; donnees-vaisseaux.js, donnees-organes-hd.js : vaisseaux, organes, nerfs
  fiches-*.js           base de connaissances sourcée (Gray 1918, Terminologia Anatomica) : origine, terminaison, innervation, action, rapports, territoire
  coupes.js             surface de section (cap) du plan de coupe : os spongieux, tampon de pochoir
  ajustement.js         recalage de chaque os du GLB sur la forme schématique qu'il remplace (axe / boîte)
  groupes-os.js         régions du squelette (crâne, colonne, thorax, bassin, membres) : isolation et transparence
  pbr.js                matériaux PBR procéduraux (os, muscles + tendons, cartilage, ligament, nerf, organe, peau), sans texture
  rendu.js              studio d'éclairage, environnement, ombres, post-traitement, niveaux de qualité, détection des capacités
  moteur.js             scène three.js : calques, isolation, focalisation, plans de coupe, sélection, étiquettes 3D
  appareils3d.js        prothèses, corsets, orthèses, points d'appui / zones de décharge, forces
  fenetre.js            fenêtre plein écran (onglets : structures, amputations, déformations, fractures, appareillage, repères, cours)
  quickview.js          pop-up 3D flottant
  cours.js              base de connaissances (IndexedDB) + recherche
  commandes.js          ce que Raylé comprend (analyse + exécution), testable sans navigateur
  index.js              point d'entrée chargé à la demande
js/rayle/commandes-anatomie.js   pont avec les commandes vocales (phrase.js) et le contexte de l'IA
js/commun/vues.js                gestionnaire de vues : Raylé · Terminal · Anatomie
css/anatomie.css                 styles de la fenêtre et du pop-up
```

## Utilisation

**Pop-up 3D rapide** (depuis l'accueil, le chat, la voix ou le terminal) :
« Décris-moi l'humérus », « Où s'insère le biceps ? », « Où se trouve le foie ? », « Parle-moi du nerf sciatique », « Montre-moi la vertèbre L4 », « Où palper la malléole médiale ? », « Décris le quadriceps » (groupe).
La structure est isolée en 3D (rotation, zoom, rotation automatique), avec sa fiche à côté, les os d'attache en fantôme pour un muscle, l'origine (vert) et la terminaison (rouge). Raylé dit un résumé et, si un cours enregistré correspond, un extrait. Boutons : côté D/G, ouvrir dans la fenêtre complète, fermer (Échap).

**Fenêtre complète** (bouton « Anatomie » de l'accueil, `#anatomie`, ou « ouvre l'anatomie ») :
- calques combinables : squelette, muscles, nerfs, organes, peau, repères, dermatomes ; combinaisons rapides (squelette + muscles, muscles + nerfs, squelette + nerfs) ;
- « affiche les muscles et les nerfs », « ajoute le squelette », « cache la peau », « montre uniquement les organes » ;
- clic sur une structure : fiche détaillée ; « Isoler » ne garde que cette structure (option « Garder le contexte ») ;
- double-clic : focalisation ; points de vue face / dos / côtés / dessus.

**Pathologies** (voix ou onglets) :
- amputations : hanche, trans-fémorale, genou, trans-tibiale, Syme, Chopart, Lisfranc ; épaule, trans-humérale, coude, trans-radiale, poignet, main partielle, doigts — côté droit, gauche ou bilatéral ; les structures sont retirées par plans de coupe (`clippingPlanes`) et un moignon apparaît ;
- scoliose : jusqu'à 3 courbures (vertèbre apicale, convexité, angle de Cobb 0–90°), rotation vertébrale, gibbosité costale, moelle qui suit, lignes de Cobb, gravité et conduite à tenir ;
- fractures : clavicule, humérus, radius distal (Pouteau-Colles), deux os de l'avant-bras, col du fémur, fémur, jambe, malléole (Weber B), tassement et fracture-explosion de L1 ; réglage du trait, de l'angulation, du décalage, du raccourcissement et de la rotation.

**Appareillage** : prothèses adaptées à chaque amputation, corsets (Chêneau, Boston, Lyon, nocturne, Jewett), orthèses de contention. Chaque composant a un choix de matériaux (PA6, nylon, polyéthylène, carbone, fibre de verre, résines, silicone, gel, EVA, acier, aluminium, titane…) avec densité, module, avantages et limites. Les points d'appui sont en orange, les zones de décharge en bleu ; pour les corsets, flèches de correction à trois points et curseur « % de correction » qui redresse le rachis en 3D. Phrases : « mets une prothèse », « mets l'emboîture en carbone », « mets un corset de Chêneau », « correction de 50 % », « affiche les points d'appui ».

**Cours** (onglet « Cours ») : collez un texte ou importez des fichiers `.txt`, `.md`, `.html`, `.json`, `.csv` (un PDF doit d'abord être converti en texte). Les cours restent dans le navigateur (IndexedDB `rayle-cours`). La recherche (BM25 simplifié, sans accents ni pluriels) alimente trois endroits : l'onglet « Dans vos cours » des fiches, les réponses parlées de Raylé, et le contexte envoyé à l'IA pour toute question d'anatomie, de clinique ou d'appareillage (`contexteCours` dans `js/rayle/phrase.js`).

## Repère 3D

Mètres, personne debout de 1,75 m, `y` vers le haut, face vers `+z`, pieds à `y = 0`. Les données sont écrites pour le côté **gauche** du patient (`x > 0`) ; le côté droit est le miroir. Vu de face, la droite du patient est à gauche de l'écran. Les identifiants d'instance sont `humerus:D`, `biceps-brachial:G`, `vertebre-L4`, `coeur`, `repere:eias:D`.

## Rendu réaliste et niveaux de qualité

Onglet **Affichage** de la fenêtre (le choix est mémorisé : `localStorage` `rayle_an_qualite`). Sans choix, le niveau est **conseillé selon l'appareil** (`detecterCapacites` : WebGL2, mémoire annoncée, cœurs, taille de texture ; ★ dans l'onglet) : Éco si ≤ 2 Go / ≤ 2 cœurs / texture max < 4096, Haute seulement sur un poste de bureau bien équipé (≥ 8 Go et ≥ 8 cœurs), Standard sinon. Le pop-up reste en Standard au maximum.

| Niveau | Contenu |
|---|---|
| **Éco** | matériaux simples, lumières de base, aucune ombre ni post-traitement |
| **Standard** | matériaux PBR procéduraux, studio à 3 points (principale chaude + remplissage froid + contre-jour), environnement de studio fabriqué sur place (`RoomEnvironment` → PMREM, aucune image), ombres douces (PCF soft), tonalité ACES |
| **Haute** | Standard + SSAO, profondeur de champ optionnelle, bloom discret, tonalité ACES (OutputPass), vignettage, FXAA, cible de rendu multi-échantillonnée (MSAA ×4 en WebGL2), fond dégradé |

Matériaux (`pbr.js`, shaders écrits par le code) : os (micro-relief poreux par normales perturbées, rugosité et teinte variables, lueur chaude aux bords simulant la translucidité), muscles (stries le long des fibres, variations rouge ↔ rose, extrémités tendineuses blanc nacré avec vernis humide renforcé, reflets étirés dans le sens des fibres), cartilage (disques intervertébraux, bleu-blanc laiteux très lisse), ligament (fibres étirées), nerfs, organes (clearcoat humide), peau.
Limites assumées : l'anisotropie native de three.js demande des tangentes (UV) que les géométries procédurales n'ont pas, elle est donc simulée par la rugosité ; la translucidité réelle (`transmission`) est trop coûteuse sur tablette, elle est simulée par la lueur de bord ; les ombres sont PCF soft (le PCSS/VSM n'a pas été retenu : fuites de lumière avec les plans de coupe). Si une passe de post-traitement ne se charge pas (hors ligne), les autres continuent ; si tout échoue, retour au niveau Standard.

Interaction : surbrillance au survol (et nom de la structure survolée), **transparence réglable par calque** (squelette, muscles, nerfs, organes, peau), **plan de coupe** (horizontal, sagittal ou frontal, position réglable, inversable ; chaque os coupé montre une surface de section d'os spongieux (`coupes.js`, tampon de pochoir) ; SSAO et profondeur de champ sont suspendus pendant une coupe), étiquettes lisibles (ombre, trait de rappel, décalage automatique quand deux étiquettes se chevauchent).

## Le squelette réaliste (GLB) et son repli procédural

**Deux GLB sont installés**, déclarés dans `ui/assets/anatomie/manifest.json` par la liste `_atlas` (du plus prioritaire au moins prioritaire ; une structure vient du premier atlas qui la décrit **et** dont le fichier se charge) :

| Fichier | Contenu | Licence | Poids |
|---|---|---|---|
| `os-detail-bp3d.glb` (table `bodyparts3d`) | **mains** (carpe 8 os, 5 métacarpiens, 14 phalanges par côté), **pieds** (7 os du tarse, 5 métatarsiens, 14 phalanges), **crâne en 21 os séparés** (les sutures sont les joints entre les os), mandibule, 28 dents | CC BY 4.0, BodyParts3D | 5,5 Mo, 200 000 sommets |
| `squelette-cc0.glb` (table `squelette-cc0`) | tout le reste du squelette (116 nœuds) et **repli** de tout ce que couvre le premier si son fichier manque | CC0, Armen Barsegyan | 1,1 Mo, 38 000 sommets |

Détails (`CREDITS.md`) : le fichier BodyParts3D est lu **de façon progressive** (formes procédurales d'abord, puis le CC0, puis le détail quand il est arrivé ; l'indicateur « Chargement des modèles 3D… » compte les fichiers), mis en cache par le navigateur (Cache API) et **dé-quantifié** à l'ouverture (`dequantifier`, `modeles-glb.js`).
Les deux GLB sont **quantifiés** (KHR_mesh_quantization : positions 16 bits, normales 8 bits) et portent un attribut **`_FIBRE`** par sommet : x = épiphyse (os longs : 0 au milieu de la diaphyse, 1 aux extrémités ; os courts : 0,35), y = **occlusion ambiante cuite** (lancer de rayons hors ligne, les os d'un même groupe s'occultent mutuellement). Le moteur le renomme `aFibre` : le shader d'os l'utilise pour l'éclairage indirect (creux sombres) et la teinte, **à tous les niveaux, y compris Éco** (`ajouterAOCuite`, `pbr.js`), sans passer par la SSAO de la Haute.
**Poignet** : la transformation de groupe de la main est complétée par `recalerPoignet` (`moteur.js`) : une fois le radius et l'ulna affichés, le carpe est posé au contact de la surface articulaire distale du radius (3 mm) et centré sous l'avant-bras ; un écart > 8 cm est refusé (modèle incohérent). Cela corrige l'ancien jour d'environ 3 cm.

- **Table de correspondance** (`correspondance-squelette.js`) : quel nœud du GLB habille quel os de l'application (sélection, étiquettes, transparence, coupes d'amputation, surbrillance continuent de fonctionner : le GLB reprend l'identifiant et le matériau de l'os). Un test vérifie que chaque nœud cité existe, que chaque os de l'application a un habillage, et que chaque nœud du GLB sert.
- **Recalage** (`ajustement.js`) : les muscles, nerfs, repères palpables et appareillages sont placés par rapport aux formes schématiques ; chaque os du GLB est donc recalé sur la forme qu'il remplace : os longs (clavicule, humérus, radius, ulna, fémur, tibia, fibula) alignés sur l'axe et la longueur de la forme (les articulations restent là où l'application les attend) ; autres os : même centre, taille uniforme ; main et pied : une seule transformation pour tout le groupe (les positions relatives du modèle sont conservées). Un garde-fou écarte tout modèle de taille aberrante.
- **Rachis, côtes, disques** : repris du GLB seulement sans scoliose ni fracture vertébrale. Dès qu'une déformation est demandée, ils reviennent à leur forme procédurale (qui se déforme en direct) ; le GLB reprend la main quand la déformation est retirée.
- **Régénérer les GLB** : `node scripts/convertir-squelette.mjs <human_skeleton.obj> sortie.glb` puis `node scripts/cuire-squelette.mjs sortie.glb ui/assets/anatomie/squelette-cc0.glb` (AO, épiphyse, quantification ; 12 s) ; pour BodyParts3D : télécharger `isa_BP3D_4.0_obj_99.zip` et `isa_element_parts.txt` sur https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/, décompresser le dossier d'OBJ, puis `node scripts/convertir-bodyparts3d.mjs <dossier OBJ> <isa_element_parts.txt>` (environ 8 minutes, surtout le calcul d'occlusion). Bibliothèque commune : `scripts/lib-glb.mjs`.
- **Remplacer par un autre squelette** : voir `ui/assets/anatomie/LISEZMOI.md`. Les entrées individuelles du manifeste (`"humerus": "humerus.glb"`) ont priorité sur l'atlas.
- **Repli automatique** : fichier absent, réseau coupé, GLB invalide ou dimensions incohérentes → forme procédurale, avec un avertissement en console et dans l'onglet Affichage. Le chargement est mis en cache (mémoire + Cache API) ; l'indicateur « Chargement des modèles 3D… » s'affiche pendant l'analyse.

Limites : les mains, pieds et crâne de BodyParts3D sont des maillages de 170 à 8 500 sommets par os (adoucis par une passe de Loop pour les petits os), pas des scans : les orbites et la base du crâne restent schématiques, les foramens ne sont pas tous creusés, les dents n'ont pas de racines distinctes. L'os hyoïde est dans le fichier mais pas affiché (aucune structure correspondante). Pas de rotule détaillée ni d'osselets de l'oreille. Pas de LOD par distance : le détail se charge une fois ; le niveau Éco garde aussi les mains détaillées (200 000 sommets au total, léger pour un GPU de tablette, à confirmer sur l'appareil).

### Squelette procédural de secours
Utilisé sans GLB (ou le temps du chargement, ou pour le rachis déformé). Formes organiques construites par le code :
- **crâne** : voûte, base, bosse frontale, massif facial, os nasaux, orbites (anneaux), arcades sourcilières, zygomatiques et arcades zygomatiques, mastoïdes, protubérance occipitale, 12 dents ; **mandibule** articulée (branches, angles, coronoïdes, condyles, menton, 12 dents) ;
- **colonne** : 24 vertèbres individuelles, lordose cervicale + cyphose thoracique + lordose lombaire (`zRachis`), disques intervertébraux (cartilage), sacrum avec ailes et crête, coccyx en 4 pièces ;
- **thorax** : 12 paires de côtes (courbure, longueur, section aplatie plus épaisse au milieu), **cartilages costaux** des côtes 1 à 10, sternum en trois parties (manubrium, corps, processus xiphoïde) ;
- **membres** : os longs en fuseau évasé aux métaphyses, épiphyses, tubérosités et épicondyles (humérus, fémur : petit trochanter et condyles, tibia : tubérosité), os coxal (aile, crête iliaque, EIAS, EIPS, acétabulum, tubérosité ischiatique, trou obturé), carpe en 8 os, tarse antérieur en 5 os ;
- **teinte** : ivoire plus clair aux diaphyses, plus jaune-rosé aux épiphyses (attribut `aFibre.x`), légère asymétrie droite / gauche (±1,5 %).
Les proportions sont celles de l'application (personne de 1,75 m) ; le modèle reste schématique.

### Interaction avec le squelette
- chaque os est sélectionnable (clic ou toucher), surligné au survol, avec une étiquette « nom français · nom latin » ;
- **isoler une région** (onglet Structures) : crâne, colonne, thorax, bassin, membre supérieur, membre inférieur ; « Garder le contexte » laisse les autres os en fantôme ;
- **transparence par région** (onglet Affichage), qui se combine à la transparence du calque ;
- sans GLB, tout reste utilisable : les régions et la transparence agissent sur les formes procédurales.

## Ajouter du contenu

- une structure : ajouter une entrée dans le fichier `donnees-*.js` adapté (le registre, la recherche vocale, les fiches et le pop-up la prennent en compte automatiquement) ; alias de recherche supplémentaires dans `MANUELS` de `registre.js` ;
- un niveau d'amputation : `AMPUTATIONS` (zone retirée par demi-espaces, chaîne de la prothèse) ;
- un appareillage : `APPAREILLAGES` (composants, matériaux compatibles, appuis, biomécanique) ; sa géométrie est dans `appareils3d.js` ;
- une commande vocale : `commandes.js` (`analyser`, puis `executer`) et un test dans `tests/anatomie-commandes-test.mjs`.

## Tests

```
node tests/anatomie-commandes-test.mjs     # ce que Raylé comprend (sans faux positifs sur les marchés, la météo…)
node tests/anatomie-executer-test.mjs      # effets sur le store et phrases dites
node tests/anatomie-cours-test.mjs         # base de cours (IndexedDB simulée)
node tests/anatomie-squelette-test.mjs     # GLB de squelette (structure, dimensions, nœuds), table de correspondance, crédits, ajustement
node tests/anatomie-corps-test.mjs         # corps haute fidélité : données, registre, fiches sourcées, GLB des couches (nœuds, ancres de peau), recalage
THREE_PATH=<dossier>/node_modules/three/build/three.module.js node tests/anatomie-moteur-test.mjs
```

Le dernier test construit toutes les structures, amputations, scolioses, fractures et appareillages avec le vrai three.js et un rendu simulé. Installer three.js hors du dépôt : `npm i three@0.160.0` dans un dossier à part. Sans `THREE_PATH`, ce test est ignoré.

## Performance

- three.js n'est chargé qu'à la première ouverture ; chaque calque (muscles, artères, veines, nerfs, organes, peau, dermatomes, repères) n'est construit que lorsqu'on l'affiche, et son fichier GLB haute fidélité (compressé meshopt, voir `docs/anatomie-haute-fidelite.md`) n'est téléchargé qu'à ce moment, avec un indicateur dans la fenêtre ;
- une structure = un seul `Mesh` (géométries fusionnées) ; rendu à la demande, aucune animation quand rien ne bouge ; le fond animé de l'accueil et l'entité sont mis en pause sous la fenêtre ;
- fermer la fenêtre ou le pop-up libère le contexte WebGL ;
- en Haute, le post-traitement coûte surtout sur grand écran : sur tablette, rester en Éco ou Standard.
