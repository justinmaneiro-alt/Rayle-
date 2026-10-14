# Anatomie haute fidélité (BodyParts3D)

Cette passe ajoute au module Anatomie & Orthopédie (voir `docs/anatomie-3d.md`) un **corps complet issu d'un seul modèle** : os, muscles individuels, tendons, artères, veines, organes et encéphale viennent tous de BodyParts3D, donc ils se touchent comme dans le corps. Rien n'est supprimé : chaque fichier a un repli sur les formes procédurales de l'application, et les pathologies (scoliose, fracture vertébrale) retombent sur le modèle schématique.

## Ce qui existe maintenant

| Couche | Fichier (`ui/assets/anatomie/`) | Contenu | Chargé quand |
|---|---|---|---|
| Squelette | `os-axial-bp3d.glb`, `os-detail-bp3d.glb` | 90 os axiaux et longs ; mains, pieds, crâne (existant) | à l'ouverture |
| Muscles | `muscles-bp3d.glb` | ~190 muscles par côté, têtes séparées (biceps, triceps, deltoïde en 3 parties…) | calque Muscles |
| Tendons, fascias | `tendons-bp3d.glb` | tendon calcanéen, tractus ilio-tibial, rétinaculum, ligne blanche, membranes interosseuses | avec les muscles |
| Artères | `arteres-bp3d.glb` (+ `arteres-fin-bp3d.glb`) | réseau principal étiqueté ; branches fines fusionnées | calque Artères (fines : qualités Haute et Ultra) |
| Veines | `veines-bp3d.glb` (+ `veines-fin-bp3d.glb`) | idem, bleues ; veines pulmonaires rouges, tronc pulmonaire bleu | calque Veines |
| Organes | `organes-bp3d.glb` | encéphale (cortex, cervelet, tronc), cœur, poumons, foie, estomac, rate, pancréas, reins, tube digestif, vessie, œsophage, larynx… | calque Organes |
| Nerfs | `nerfs-bp3d.glb` | nerfs de l'orbite (modèle) + plexus brachial, lombaire, sacré et nerfs des membres (tracés reconstitués) | calque Nerfs |

Les calques **Artères** et **Veines** sont nouveaux : indépendants, combinables, avec transparence réglable (onglet Affichage), isolables par région (`isolerGroupe` s'applique désormais aux tissus mous : une région = os + muscles + vaisseaux + organes de cette région si leur calque est affiché), étiquetés « nom français · latin ».

## Le recalage par points d'attache

Le squelette de l'application (formes schématiques) fixe les positions de tout le reste (nerfs, repères palpables, appareillages, amputations). Les os de BodyParts3D sont recalés dessus os par os (`ajustement.js`, comme avant). Un muscle ne peut donc pas rester dans le repère de BodyParts3D : son insertion flotterait.

* **Hors ligne** (`scripts/convertir-corps-bp3d.mjs`) : chaque sommet de muscle, vaisseau, organe ou nerf reçoit ses **4 os les plus proches** (76 ancres : crâne, mandibule, sacrum, 24 vertèbres, 24 côtes, 10 os par côté, mains, pieds) et des poids en 1/(distance + 3 mm)³ : attributs `_SKI` (indices, 8 bits) et `_SKW` (poids, 8 bits). Un sommet collé à un os (l'insertion) reçoit presque tout son poids de cet os.
* **À l'exécution** (`js/anatomie/corps-hd.js`) : la matrice du monde du paquet de chaque os affiché (`en.pack`, calculée par `ajustement.js`) est lue ; chaque sommet est déplacé par le **mélange linéaire** des matrices de ses ancres. L'insertion suit donc l'os quel que soit son recalage ; entre deux os, la transition est douce. Les normales sont recalculées ensuite (elles ne sont pas stockées dans le fichier).
* **Condition** : tous les os doivent venir de BodyParts3D (`en.tableGLB` commence par `bodyparts3d`) et la colonne ne doit pas être déformée (`rachisGLBPossible()`). Sinon (fichier absent, hors ligne, scoliose, fracture vertébrale), les tissus mous haute fidélité sont masqués et les formes schématiques réapparaissent. Le sternum de BodyParts3D est incomplet : l'os affiché est celui du squelette CC0 et il n'est pas une ancre.
* **Même identifiant = remplacement** : un muscle, un organe ou un nerf de l'application qui a le même identifiant que la structure haute fidélité est **remplacé dans son entrée** (mêmes matériaux, même sélection, même fiche, mêmes coupes d'amputation) ; sa forme schématique est gardée comme repli. Les muscles schématiques regroupés (`psoas-iliaque`, `fibulaires`, `erecteurs-rachis`) sont masqués quand les muscles individuels qui les remplacent sont chargés (ils réapparaissent si on les sélectionne).

**Limite honnête** : le mélange linéaire est une approximation. Elle est exacte au contact des os et très bonne pour les membres ; entre deux os qui se sont écartés de plusieurs centimètres l'un de l'autre (recalage très différent), un muscle peut s'étirer. Aucune mesure de précision au millimètre n'a été faite.

## Ce que BodyParts3D n'a pas

* **Muscles absents** : grand dorsal, grand droit de l'abdomen, oblique interne, transverse de l'abdomen, carré des lombes, multifides, masséter, temporal, muscles de la face, ptérygoïdiens. Les muscles schématiques de l'application (grand dorsal, grand droit de l'abdomen) restent affichés ; l'oblique externe, lui, existe dans BodyParts3D.
* **Os absents** : coccyx, manubrium, xiphoïde, cartilages costaux 8 à 10 (os du squelette CC0 conservés).
* **Pas de nerf périphérique, pas de moelle spinale, pas de thyroïde** : voir ci-dessous.
* Les maillages sont à 99 % de simplification (versions publiques) : lisses mais sans détail fin ; les muscles les plus denses sont réduits à 12 000 sommets par regroupement de sommets (cellule de 1,5 à 5 mm).

## Nerfs : tracés reconstitués

`scripts/traces-nerfs-donnees.mjs` décrit chaque nerf comme une suite de points posés sur des structures réelles de BodyParts3D (le nerf médian suit l'artère brachiale à 4 mm, le nerf fémoral l'artère fémorale, le nerf sciatique passe sous le piriforme et derrière le grand adducteur…) ; `scripts/traces-nerfs.mjs` les convertit en tubes lisses (Catmull-Rom). Le résultat est un **tracé schématique**, signalé comme tel dans la fiche, d'après la description de Gray's Anatomy (1918). Les racines (C5 à T1, L2 à L4, L5 à S3) convergent en plexus. Les nerfs crâniens autres que le II, le IV, la branche ophtalmique du V et le X (tracé) ne sont pas représentés ; les nerfs intercostaux non plus.

## Base de connaissances

Chaque structure a une fiche (origine, terminaison, innervation, vascularisation / territoire, action, rapports) et **une source** :

* `js/anatomie/fiches-membre-sup.js`, `fiches-membre-inf.js`, `fiches-tronc-cou.js`, `fiches-tete.js`, `fiches-vaisseaux.js`, `fiches-nerfs.js` (aide : `fiches-outils.js`, agrégation : `fiches-corps.js`) ;
* source : **Gray's Anatomy, 20e éd. américaine (1918), domaine public**, texte consulté sur archive.org (les passages sont reformulés en français, jamais recopiés) ; noms latins : Terminologia Anatomica ; formes : BodyParts3D ;
* **rien d'inventé** : une information que les sources retenues ne donnent pas reste vide. La fiche affiche alors « Non renseigné dans les sources retenues » et Raylé le dit à voix haute. Exemple : la plupart des muscles du larynx n'ont ni origine ni insertion, seulement leur action.
* Gray (1918) ne dit presque rien de la vascularisation des muscles : ce champ est donc le plus souvent non renseigné.
* Les 32 muscles écrits avant cette passe (`donnees-muscles.js`) gardent leur fiche ; ils reçoivent leur nom latin et la référence de leur région.

Ajouter une structure : une ligne dans `donnees-corps.js` (muscles, tendons), `donnees-vaisseaux.js`, `donnees-organes-hd.js`, une fiche dans le fichier de fiches de sa région, puis relancer la conversion (ci-dessous). `node tests/anatomie-corps-test.mjs` vérifie que tout est cohérent (noms, concepts, fiches, nœuds des fichiers GLB).

## Performance (tablette)

* **Chargement progressif par couche** : un fichier n'est chargé que lorsqu'on affiche son calque ; l'indicateur de la fenêtre dit lesquels (« Chargement des modèles 3D (muscles, artères…) 2 / 5 »). Cache du navigateur (Cache API) : un fichier n'est téléchargé qu'une fois.
* **Compression meshopt** (`scripts/compresser-glb.mjs`, décodeur `three/addons/libs/meshopt_decoder.module.js`) : environ 2,5 à 3 fois plus léger. Les positions sont quantifiées sur 16 bits.
* **Niveaux de détail** : le réseau principal des vaisseaux (étiqueté) est chargé dans tous les niveaux ; les branches fines (`*-fin-bp3d.glb`, fusionnées et simplifiées à 3 mm) seulement en Haute et Ultra. Éco : matériaux simples, aucune ombre. Les muscles et organes très denses sont réduits à la conversion (12 000 et 15 000 sommets au plus par structure).
* Les chiffres de poids des fichiers sont dans le tableau de `CREDITS.md` ; les captures d'écran de vérification sont faites en rendu logiciel (SwiftShader) : **leurs FPS ne sont pas ceux d'une tablette** et ne sont pas présentés comme tels.

## Régénérer les fichiers

```
# 1. données BodyParts3D (hors dépôt, ~480 Mo décompressées)
#    https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/ : isa_BP3D_4.0_obj_99.zip, isa_element_parts.txt, isa_inclusion_relation_list.txt,
#    partof_BP3D_4.0_obj_99.zip, partof_element_parts.txt, partof_inclusion_relation_list.txt
#    isa_* dans <T>, décompresser le zip « isa » dans <T>/all/, le zip « partof » et ses tables dans <T>/partof/
node scripts/convertir-corps-bp3d.mjs <T>/all/isa_BP3D_4.0_obj_99 <T> <os|muscles|vaisseaux|organes|nerfs|tout> [dossier de sortie]
# 2. compression (paquets @gltf-transform/core, extensions, functions et meshoptimizer installés hors du dépôt)
OUTILS=<dossier des paquets> node scripts/compresser-glb.mjs ui/assets/anatomie/muscles-bp3d.glb
```
Durées (ordinateur de bureau) : os 7 min, muscles 20 min, vaisseaux 5 min, organes 3 min, nerfs 1 min. `scripts/convertir-bodyparts3d.mjs` (mains, pieds, crâne) est inchangé.

## Si vous voulez Z-Anatomy (nerfs mesurés, muscles de la face…)

Non intégré : **CC BY-SA 4.0** (partage dans les mêmes conditions : les fichiers qui en dérivent doivent rester sous cette licence), et Z-Anatomy est un modèle Blender, pas un glTF. Si vous acceptez l'obligation :

1. Télécharger `Z-Anatomy.zip` (87 Mo) dans https://github.com/Z-Anatomy/Models-of-human-anatomy (branche `master`) : https://github.com/Z-Anatomy/Models-of-human-anatomy/raw/master/Z-Anatomy.zip (la table `TA2.csv` du même dépôt donne la Terminologia Anatomica).
2. Dans Blender (3.x) : installer le modèle d'application (*Install Application Template*, voir le `Readme.md` du dépôt), ouvrir Z-Anatomy, masquer les collections inutiles, exporter les nerfs (et les muscles manquants) en `.glb` (File > Export > glTF 2.0, « Selected objects »).
3. Placer le fichier dans `ui/assets/anatomie/` sous le nom `z-anatomy-nerfs.glb` (et `z-anatomy-muscles.glb`), le déclarer dans `manifest.json` avec `"licence": "CC-BY-SA-4.0"` et l'attribution exigée (« Z-Anatomy – The libre 3D atlas of anatomy – CC-BY-SA 4.0 »), l'ajouter à `CREDITS.md` avec la mention du partage à l'identique.
4. Me redemander l'intégration : il faudra une table nœuds → identifiants (comme `correspondance-squelette.js`) et des ancres de peau (`convertir-corps-bp3d.mjs` sait les calculer pour tout maillage exprimé dans le repère de BodyParts3D ; Z-Anatomy en dérive, mais l'alignement devra être vérifié).

## Point de vigilance sur la licence de BodyParts3D

Le README officiel (2025) annonce **CC BY 4.0** ; mais les en-têtes des OBJ (2013) citent **CC BY-SA 2.1 Japon**, et le fichier de licence de Z-Anatomy attribue lui aussi BodyParts3D en « CC-BY-SA 2.1 Japan ». Raylé suit la licence officielle actuelle. Si l'éditeur confirmait le partage à l'identique, il faudrait publier tous les fichiers `*-bp3d.glb` sous CC BY-SA ou les retirer (l'application retrouve alors ses formes procédurales et le squelette CC0). Contact : voir le README de BodyParts3D.
