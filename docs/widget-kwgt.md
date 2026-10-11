# Widget Raylé sur l'écran d'accueil Android (KWGT, version gratuite)

Une appli web comme Raylé ne peut pas créer de widget Android elle-même. On passe donc par **KWGT** (Kustom Widget Maker),
une appli gratuite qui sait afficher sur l'écran d'accueil ce que renvoie une adresse internet. Raylé fournit cette adresse.

Ce que le widget affiche :

- l'**US100** et l'**or** : prix, variation sur 24 h, flèche ▲ ▼ ;
- la **prochaine annonce économique importante** (heure de Paris) ;
- la **séance** en cours (Londres, New York) ;
- le **nombre d'alertes** et de **rappels du jour** ;
- un **court message de Raylé**.

Rien de personnel n'y figure : ni contacts, ni mémoire, ni journal, ni texte de tes rappels (seulement leur nombre).

> Temps nécessaire : 15 à 20 minutes la première fois. Tu peux t'arrêter à l'étape 7 : le widget marchera déjà.

---

## Étape 1 — Copier l'adresse du widget dans Raylé

1. Sur le téléphone, ouvre **Raylé** → **⚙ Réglages** → section **Widget d'écran d'accueil**.
2. Touche **Copier l'adresse du widget**.
   La première fois, Raylé crée un **jeton widget** (une clé à part, en lecture seule) et copie l'adresse.
   Elle ressemble à : `https://rayle.xxxxx.workers.dev/widget?k=rw_…`
3. Vérifie-la : colle-la dans la barre d'adresse de Chrome. Tu dois voir du texte entre accolades `{ … }` avec `us100_prix`, `or_prix`, etc.
   Ajoute `&format=texte` à la fin pour voir la version texte (quelques lignes lisibles).

> Cette adresse est comme une petite clé : ne la publie pas. Elle ne permet que de **lire** ces chiffres,
> jamais d'agir sur Raylé ni de voir tes contacts. Si tu la perds ou la partages par erreur : **Nouveau jeton** (l'ancienne adresse
> ne marche plus) ou **Révoquer** (plus aucune adresse ne marche).

## Étape 2 — Installer KWGT

1. Ouvre le **Play Store**, cherche **KWGT Kustom Widget Maker** (éditeur : Kustom Industries) et installe-le. C'est gratuit.
2. **N'achète pas** « KWGT Pro Key » : ce guide n'en a pas besoin (voir la fin).

## Étape 3 — Poser un widget KWGT vide sur l'écran d'accueil

1. Appui long sur un endroit vide de l'écran d'accueil → **Widgets**.
2. Cherche **KWGT**, choisis la taille **4 × 2** et pose-la.
3. Touche le carré qui apparaît (« Touchez pour configurer ») : l'éditeur KWGT s'ouvre.
4. S'il te propose des modèles, choisis **Créer** / **Nouveau** (un widget vide), pas un modèle.

## Étape 4 — Ranger l'adresse une fois pour toutes (variable « globale »)

Pour ne coller l'adresse qu'une seule fois :

1. Dans l'éditeur, onglet **Globales** (GLOBALS) → bouton **+**.
2. Type **Texte**, nom : `adresse` (en minuscules, sans accent).
3. Valeur : **colle l'adresse du widget** (appui long → Coller).

Partout ensuite, `gv(adresse)` voudra dire « l'adresse du widget ».

## Étape 5 — Le fond aux couleurs de Raylé

1. Onglet **Éléments** (ITEMS) → **+** → **Forme** (Shape).
2. Dans la forme :
   - **Type** : Rectangle ; **Largeur** et **Hauteur** : assez grandes pour couvrir le widget (essaie 340 × 170) ;
   - **Coins** (Corners) : 24 ;
   - **Couleur** : `#E61A0A24` (violet très sombre, légèrement transparent).
3. Onglet **FX** de la forme (si tu le vois) → **Contour / Stroke** : couleur `#FF007F` (rose Raylé), épaisseur 2.

Couleurs de Raylé, à réutiliser :

| Rôle | Couleur |
| --- | --- |
| Rose (titres, contour) | `#FF007F` |
| Rose clair | `#FF3399` |
| Violet | `#8A2BE2` |
| Cyan (hausse) | `#4DE3FF` |
| Rouge rosé (baisse) | `#FF5C8A` |
| Texte | `#FFFFFF` |

## Étape 6 — Les textes

Pour chaque ligne : **Éléments** → **+** → **Texte**, puis touche le champ **Texte** et colle la formule.
Les formules commencent et finissent par `$`. Recopie-les exactement (guillemets droits `"`).

1. **Titre** (couleur `#FF3399`, taille 14, gras) :
   ```
   RAYLÉ · $wg(gv(adresse), json, ".maj")$
   ```
2. **US100** (blanc, taille 18) :
   ```
   US100 $wg(gv(adresse), json, ".us100_prix")$ $wg(gv(adresse), json, ".us100_fleche")$ $wg(gv(adresse), json, ".us100_var")$
   ```
3. **Or** (blanc, taille 18) :
   ```
   OR $wg(gv(adresse), json, ".or_prix")$ $wg(gv(adresse), json, ".or_fleche")$ $wg(gv(adresse), json, ".or_var")$
   ```
4. **Annonce** (cyan `#4DE3FF`, taille 12) :
   ```
   📅 $wg(gv(adresse), json, ".annonce_texte")$
   ```
5. **Séance et compteurs** (blanc, taille 12) :
   ```
   $wg(gv(adresse), json, ".seance")$ · 🔔 $wg(gv(adresse), json, ".alertes_texte")$ · ⏰ $wg(gv(adresse), json, ".rappels_texte")$
   ```
6. **Message de Raylé** (rose clair `#FF3399`, italique, taille 12) :
   ```
   $wg(gv(adresse), json, ".message")$
   ```

Pour ranger les lignes les unes sous les autres : mets-les toutes dans un **Groupe empilé** (Stack Group, vertical),
ou règle pour chacune **Position → Décalage Y** (0, 25, 55, 85, 110, 135…).

**Plan B, encore plus simple** : un seul élément Texte avec la version texte (tout d'un coup, sur plusieurs lignes) :
```
$wg(gv(adresse) + "&format=texte", txt)$
```
Si cette formule ne s'affiche pas, mets directement l'adresse complète entre guillemets, avec `&format=texte` à la fin :
`$wg("https://…/widget?k=rw_…&format=texte", txt)$`.

**Bonus (facultatif)** : flèche en couleur selon le sens. Dans la couleur du texte US100, touche l'icône de formule et colle :
```
$if(wg(gv(adresse), json, ".us100_fleche") = "▼", "#FF5C8A", "#4DE3FF")$
```

## Étape 7 — Ouvrir Raylé d'un toucher

1. Sélectionne la **forme du fond** (ou le groupe qui contient tout).
2. Onglet **Toucher** (TOUCH, icône de doigt) → **+**.
3. **Action** : **Lancer une application** (Launch App) → choisis **Raylé** (l'appli installée depuis Chrome).
   Si Raylé n'apparaît pas : **Ouvrir un lien** (Open Link) et mets l'adresse de Raylé (ta page GitHub Pages).
4. Touche l'icône **Enregistrer** (disquette) en haut à droite, puis reviens à l'écran d'accueil.

Ton widget est prêt. 🎉

## Étape 8 — Rafraîchissement (toutes les 15 minutes environ)

- KWGT relit l'adresse régulièrement tout seul. Pour viser **15 minutes** : ouvre l'appli **KWGT** → **⚙ Réglages**
  → cherche le réglage de **mise à jour / Update** (souvent dans **Avancé**) et choisis **15 minutes** si l'option existe.
- Android peut retarder les mises à jour pour économiser la batterie. Si le widget reste figé longtemps :
  **Paramètres Android → Applications → KWGT → Batterie → Sans restriction**.
- Côté Raylé, les chiffres sont recalculés au plus une fois par minute (cache de 60 s) : inutile d'aller plus vite.
- L'heure en haut du widget (`maj`) te dit quand les chiffres ont été calculés.

## Dépannage

| Ce que tu vois | Pourquoi | Que faire |
| --- | --- | --- |
| `jeton du widget refusé` | Jeton révoqué ou régénéré | Raylé → Réglages → **Copier l'adresse du widget**, puis recolle-la dans la globale `adresse` |
| `—` à la place des prix | Source de marché momentanément indisponible | Attendre le prochain rafraîchissement |
| Rien du tout | Formule mal recopiée, ou pas d'internet | Tester l'adresse dans Chrome (étape 1), vérifier les `$` et les guillemets |
| `trop de tentatives` | Plusieurs mauvaises adresses de suite | Attendre 10 minutes |
| Les chiffres ne bougent pas | Android met KWGT en veille | Étape 8 (batterie « Sans restriction ») |

Le week-end, les marchés sont fermés : les prix restent ceux de vendredi soir, c'est normal.

## Version gratuite ou payante de KWGT ?

**Gratuit (suffit pour ce guide)** : installer KWGT, créer ton propre widget dans l'éditeur (formes, textes, couleurs, polices de base),
utiliser les formules (dont `$wg(...)$` qui lit l'adresse de Raylé), les globales, l'action au toucher (ouvrir Raylé), et le poser sur
l'écran d'accueil.

**Payant (KWGT Pro Key, achat unique de quelques euros)** : surtout **importer et exporter des widgets tout faits**
(fichiers `.kwgt`, packs de widgets du Play Store) et la sauvegarde / restauration de ses créations. Selon les versions de KWGT,
d'autres options avancées peuvent aussi être réservées à Pro. **Règle simple** : si un menu affiche « Pro » ou un cadenas,
c'est payant, et ce guide n'en a pas besoin.

## Pour les curieux : les champs disponibles

L'adresse renvoie ces champs (format JSON), à lire avec `$wg(gv(adresse), json, ".nom_du_champ")$` :

| Champ | Exemple |
| --- | --- |
| `maj` | `14:05` (heure de Paris du calcul) |
| `us100_prix`, `us100_var`, `us100_fleche`, `us100_tendance` | `21 345`, `+0,42 %`, `▲`, `haussière` |
| `or_prix`, `or_var`, `or_fleche`, `or_tendance` | `2 650,3`, `−0,10 %`, `▼`, `baissière` |
| `annonce_texte` | `14 h 30 · USD CPI m/m` (ou `Demain 14 h 30 · …`) |
| `seance` | `New York ouverte`, `Londres ouvre à 9 h`, `Week-end : marchés fermés` |
| `alertes_texte`, `rappels_texte` | `2`, `1` |
| `message` | `Annonce forte à 14 h 30 (USD) : prudence.` |

La variation est calculée sur 24 h. Le Nasdaq vient du contrat à terme, avec environ dix minutes de retard
et un petit écart avec l'US100 de XTB : comme dans Raylé.
