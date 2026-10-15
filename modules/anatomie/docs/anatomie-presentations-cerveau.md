# Anatomie : présentations animées et fenêtre Cerveau

Mission 2 (partie A). Tout est gratuit : aucune clé, aucun service payant. La seule source de formes 3D nouvelle est **BodyParts3D** (CC BY 4.0, déjà utilisée pour le corps), les textes viennent des fiches de la base de connaissances et de références citées.

## 1. Présentations animées

« Présente le fémur », « présente le biceps brachial », « présente le nerf médian », « présente tout le bras couche par couche », « présente la jambe couche par couche », « présente le corps entier », « présente le quadriceps ».

* La fenêtre Anatomie s'ouvre (si besoin) et le **lecteur** (`js/anatomie/lecteur.js`) joue un **script** généré par `js/anatomie/presentation.js`.
* Pour chaque étape : la caméra s'approche (`moteur.cadrerStructures`), la structure est isolée (`moteur.presenter` : fondu des autres structures, os voisins en transparence), les points sont **étiquetés avec une animation** (extrémités proximale / distale, repères palpables, origine en vert et insertion en rouge posées au point de contact muscle ↔ os), Raylé **dit chaque phrase** et la phrase s'affiche en **sous-titre** au même moment.
* **Contrôles tactiles** : précédent, pause / reprise, suivant, passer la phrase, vitesse (0,75× à 2×), plein écran, fermer, barre de progression cliquable. Clavier : espace, flèches, Échap.
* **Couche par couche** (`scriptRegion`) : peau → os → muscles → nerfs → artères et veines → organes (tronc, tête, corps entier). Chaque couche apparaît en fondu, les précédentes passent en transparence. Régions : jambe (membre inférieur), bras (membre supérieur), tronc, tête et cou, corps entier.
* À la fin, Raylé **cite les références** (Terminologia Anatomica, Gray 1918, BodyParts3D) et l'écran les affiche en toutes lettres.
* L'état de la fenêtre (calques, sélection, pathologies) est **sauvegardé au départ et rétabli à la fin**.

### Aucun fait inventé
Chaque phrase d'un script vient d'un champ des fiches (`registre.fiche`) ; seules les liaisons sont génériques (« Voici ce muscle, isolé… »). Un champ absent est dit absent : « Cette information n'est pas renseignée dans les sources que Raylé utilise. » La **peau** n'a pas de fiche : Raylé le dit et ne montre que l'enveloppe. Un nerf périphérique avertit que son tracé est schématique. `tests/anatomie-presentation-test.mjs` vérifie que les narrations reprennent le texte des fiches.

### Voix
Le lecteur utilise les services du bus ajoutés dans `js/rayle/commandes-anatomie.js` : `anatomie:narrer` (promesse résolue à la fin de la phrase, donc la synchro est réelle, phrase par phrase), `anatomie:silence`, `anatomie:parle`, `anatomie:vitesse-voix` (écart temporaire de la vitesse de la voix, `RAYLE_VIT_DELTA`, lu par `base.js` et `voix.js`). Le lecteur attend que Raylé ait fini sa phrase d'annonce. **Sans voix** (muette, hors ligne sans voix système), les sous-titres défilent seuls à raison d'environ 55 ms par caractère. **Limite** : la pause coupe la voix, la reprise relit la phrase en cours depuis son début.

### Commandes et registre d'outils
`js/anatomie/commandes.js` : type `presenter` (verbe présente / présenter / présentation / « fais une présentation de… » / « couche par couche »). « Décris-moi l'humérus » garde le petit aperçu 3D. Famille **Présentations animées du corps** dans `js/rayle/capacites.js` (exemples vérifiés par les tests, `docs/capacites.md` régénéré).

## 2. Fenêtre « Cerveau »

Vue plein écran `#vueCerveau` (comme Anatomie), ouverte par « ouvre le cerveau », « montre l'hippocampe », etc. (`js/commun/vues.js`, adresse `#cerveau`).

| Fichier | Rôle |
|---|---|
| `js/anatomie/donnees-cerveau.js` | structures 3D, 22 zones avec fiches, 11 faisceaux, 9 réseaux animés, aires de Brodmann, vues et coupes, sources |
| `js/anatomie/cerveau-recherche.js` | recherche d'une zone par son nom (alias, latin), fiche, résumé parlé |
| `js/anatomie/cerveau-moteur.js` | scène three.js : formes, couches, sections, neurones animés, qualité |
| `js/anatomie/cerveau-fenetre.js` | interface (couches, vues, réseaux, fiche, qualité) et `window.RayleCerveau` |
| `ui/assets/anatomie/cerveau-bp3d.glb` | 44 formes BodyParts3D (1,7 Mo, meshopt) |

* **Modèle** : lobes (frontal, pariétal, temporal, occipital), gyri (précentral, postcentral, frontaux, temporaux, supramarginal, angulaire, fusiforme, parahippocampique), insula, cingulaire, thalamus, hypothalamus, hippocampe, amygdale, noyau caudé, putamen, pallidum, ventricules, aqueduc, corps calleux, fornix, capsule interne, commissure antérieure, chiasma, hypophyse, épiphyse, corps mamillaires, substance blanche, cervelet, mésencéphale, pont, bulbe. **Repli** sans fichier : ellipsoïdes schématiques aux positions de l'atlas (la fenêtre le signale).
* **Transparence** réglable (cortex, substance blanche), couches indépendantes, hémisphère gauche ou droit, lobes colorés ou teinte naturelle.
* **Faisceaux de substance blanche** (arqué, cortico-spinal, radiations optiques, longitudinal supérieur, fronto-occipital inférieur, unciné, cingulum, fornix, corps calleux, thalamo-cortical, cortico-ponto-cérébelleux, boucle cortex – noyaux gris – thalamus) : **tracés schématiques** posés en coordonnées de type MNI (atlas) puis recalés sur la boîte du cerveau 3D ; ce n'est pas une tractographie de ce cerveau. Atlas de référence : Catani et Thiebaut de Schotten (2012).
* **Neurones animés** : impulsions lumineuses sur les faisceaux et sur des réseaux locaux sous le cortex, somas et synapses qui s'allument à l'arrivée, dendrites (Haute et Ultra). Choisir une **zone** ou un **réseau** (vision, langage, mouvement, sensibilité, audition, mémoire, émotion, attention, fonctions exécutives) intensifie les voies concernées et laisse les autres en veille. Le rythme est illustratif, pas une mesure.
* **Aires de Brodmann** : carte de Voronoï autour des centres moyens de la littérature (coordonnées MNI). **Approximative**, signalée sur l'écran : ce n'est pas la cytoarchitecture de ce cerveau. Toucher le cortex donne l'aire voisine.
* **Vues et coupes** : latérale, médiane (coupe sagittale), coronale, axiale, dessus, dessous, avant, arrière. Une coupe fait apparaître la substance blanche et rend le cortex opaque ; les faces de coupe sont l'intérieur des coques dessiné en aplat (gris : cortex, blanc : substance blanche). Un curseur déplace le plan.
* **Fiches** (localisation, fonctions, fonctionnement, pathologies associées, faisceaux liés) avec **sources** et un champ « degré de certitude » qui rappelle ce que la science ne sait pas (frontières de Broca et Wernicke débattues, latéralisation, rôle de l'amygdale, rôle de l'insula, etc.). Mention : *résumé rédigé par Raylé, non relu par un clinicien, pas un avis médical*.
* **Qualité** Éco · Standard · Haute · **Ultra** (jamais choisie automatiquement) : nombre d'impulsions (120 · 360 · 800 · 1 800), réseaux locaux, tubes ou lignes, dendrites, bloom, anticrénelage matériel (4× puis 8×), pixel ratio (1 · 1,5 · 2 · 2,5). Si l'image tombe sous ~18 images/s pendant trois secondes, le moteur redescend d'un palier et l'écrit (le niveau mémorisé est alors abaissé). Sans WebGL : la liste des zones et les fiches restent utilisables.

### Commandes
« montre l'hippocampe » (zone + résumé parlé), « où est l'amygdale ? », « explique le lobe frontal » (présentation animée), « fais-moi un tour du cerveau » (visite guidée de 17 étapes), « coupe sagittale du cerveau », « vue de dessous », « affiche les aires de Brodmann », « masque les neurones », « montre le réseau de la vision dans le cerveau », « qualité ultra pour le cerveau », « ferme ». Les phrases d'autres modules (« passe en entité cerveau », « combien de neurones dans le cerveau ? ») ne sont pas volées. Famille **Cerveau 3D** dans le registre d'outils.

### Sources (aucune n'est un fichier copié dans le dépôt, sauf BodyParts3D)
Terminologia Anatomica (TA2, FIPAT, 2019) pour les noms ; Gray, *Anatomy of the Human Body* (1918, domaine public) ; Purves et al., *Neuroscience* 6e éd. (2018) ; Kandel et al., *Principles of Neural Science* 5e éd. (2013) ; Brodmann (1909) ; Penfield et Boldrey (1937) ; Scoville et Milner (1957) ; Hickok et Poeppel (2007) ; Papez (1937) ; Alexander, DeLong et Strick (1986) ; Schmahmann et Sherman (1998) ; Sperry (1968). **Ces ouvrages n'ont pas été consultés page par page pour cette mission** : les fiches sont une synthèse de connaissances classiques, rédigée par Raylé, que ces références soutiennent ; elles n'ont pas été relues par un anatomiste ou un neurologue.

## 3. Régénérer le modèle du cerveau

```
OUTILS=<dossier des paquets gltf-transform et meshoptimizer> node scripts/convertir-corps-bp3d.mjs <T>/all/isa_BP3D_4.0_obj_99 <T> cerveau <dossier de sortie>
OUTILS=… node scripts/compresser-glb.mjs <sortie>/cerveau-bp3d.glb ui/assets/anatomie/cerveau-bp3d.glb
```
(mêmes données et mêmes outils que `docs/anatomie-haute-fidelite.md`). La liste des formes est `STRUCTURES_CERVEAU` dans `js/anatomie/donnees-cerveau.js` ; le cervelet est issu d'un maillage BodyParts3D assez rugueux (voxels), simplifié à 7 000 sommets.

## 4. Ce qui n'est pas testé
Rendu sur un **vrai GPU** et sur **tablette** (Chrome headless en rendu logiciel SwiftShader : aucun nombre d'images par seconde n'est représentatif) ; voix réelle (le test navigateur a joué les présentations **sans voix**, les tests node simulent la voix) ; palier Ultra comparé aux autres ; mesure du recalage des faisceaux sur le cerveau BodyParts3D (placés par proportions de la boîte englobante).
