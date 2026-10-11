# Relais Android de Raylé (téléphone Samsung, tablette Xiaomi) avec MacroDroid

Une page web ne peut pas allumer la lampe ou ouvrir une appli sur Android. On utilise donc **MacroDroid** (gratuit) :
Raylé (son Worker) appelle une **adresse webhook** propre à chaque appareil, et MacroDroid fait l'action. Rien d'autre
ne peut être demandé que les actions ci-dessous : il n'existe aucune macro « commande libre ».

## Pourquoi MacroDroid (et ses limites gratuites)

- Le déclencheur **Webhook (URL)** fait partie de la version gratuite. Seul le webhook « avec réponse » (2 sens) est
  réservé à la version Pro : on n'en a pas besoin.
- La version gratuite autorise **5 macros** (avec publicités). Ce guide en utilise **4** : il t'en reste une.
- Conséquence : MacroDroid ne renvoie pas « c'est fait ». Raylé dit donc « j'ai envoyé l'ordre », pas « c'est fait ».
- Alternative si un jour ça bloque : **Automate** (LlamaLab), gratuit jusqu'à 30 blocs, mais sans webhook simple à
  recevoir (il faudrait passer par Google Cloud Messaging ou un service tiers) : beaucoup plus compliqué pour un débutant.

> À faire **sur chaque appareil** (téléphone, puis tablette). Compte 20 minutes par appareil.

---

## Étape 1 — Installer MacroDroid

1. Play Store → **MacroDroid - Device Automation** (éditeur : ArloSoft) → Installer.
2. Ouvre-la et accepte ce qu'elle demande au fur et à mesure (notifications, et plus tard l'accès à la lampe, au son…).
3. Samsung / Xiaomi : **Paramètres Android → Applications → MacroDroid → Batterie → Sans restriction**
   (Xiaomi : aussi **Démarrage automatique : activé**). Sinon Android endort MacroDroid et les ordres n'arrivent plus.

## Étape 2 — Trouver l'adresse webhook de l'appareil

1. Dans MacroDroid : **Ajouter une macro** → **Déclencheurs** → **+** → cherche **Webhook (URL)**.
2. Dans **Identifiant**, écris `rayle-test` → OK. MacroDroid affiche une adresse du genre :
   `https://trigger.macrodroid.com/1a2b3c4d-…/rayle-test`
3. Touche **Copier** et envoie-la-toi (par exemple sur Telegram à toi-même).
   La partie **avant** `/rayle-test` est l'**adresse de base** de l'appareil :
   `https://trigger.macrodroid.com/1a2b3c4d-…`
4. Annule cette macro de test (flèche retour, ne pas enregistrer).

> Cette adresse est une clé : ne la publie jamais. Elle se range uniquement dans le Worker (étape 7).

Pour chaque macro ci-dessous, tu ajouteras **plusieurs déclencheurs Webhook**, un par identifiant, tous sur la même
macro. Puis, dans les actions, un bloc **Si / Alors** avec la condition **Déclencheur déclenché** (Trigger Fired) choisit
quoi faire.

## Étape 3 — Macro 1 : « Raylé – Applis »

1. **Ajouter une macro**, nom : `Raylé – Applis`.
2. **Déclencheurs** : ajoute 4 fois **Webhook (URL)** avec ces identifiants :
   `rayle-app-xtb`, `rayle-app-whatsapp`, `rayle-app-youtube`, `rayle-app-spotify`.
3. **Actions** :
   - **Conditions / boucles → Si (If)** → condition **Déclencheur déclenché** → choisis `rayle-app-xtb`.
   - Dedans : **Applications → Lancer une application** → XTB.
   - **Sinon si (Else If)** → **Déclencheur déclenché** `rayle-app-whatsapp` → **Lancer une application** → WhatsApp.
   - Pareil pour YouTube et Spotify. Termine par **Fin si (End If)**.
4. Enregistre (coche ✓).

## Étape 4 — Macro 2 : « Raylé – Page web »

1. Nouvelle macro `Raylé – Page web`.
2. **Variables locales** (en bas de la macro) → **+** → nom `valeur`, type **Chaîne** (texte).
3. **Déclencheur** : **Webhook (URL)**, identifiant `rayle-web`.
   Raylé appelle `…/rayle-web?valeur=https://…` : MacroDroid range ce paramètre dans la variable `valeur`.
   Si ta version propose l'option « capturer les paramètres », coche-la.
4. **Action** : **Applications → Ouvrir un site web** → adresse : touche **…** puis insère la variable `[lv=valeur]`.
5. Enregistre. (Si la page ne s'ouvre pas au test, ta version ne remplit pas la variable : laisse tomber cette macro,
   les autres marchent quand même.)

## Étape 5 — Macro 3 : « Raylé – Contrôles » (volume, musique, lampe)

1. Nouvelle macro `Raylé – Contrôles`.
2. **Déclencheurs Webhook (URL)**, un par identifiant :
   `rayle-volume-plus`, `rayle-volume-moins`, `rayle-volume-muet`,
   `rayle-media-pause`, `rayle-media-suivant`, `rayle-media-precedent`,
   `rayle-lampe-on`, `rayle-lampe-off`, `rayle-lampe-bascule`.
3. **Actions** (un **Si / Sinon si** par identifiant, comme à l'étape 3) :
   | Identifiant | Action MacroDroid |
   | --- | --- |
   | `rayle-volume-plus` | **Volume → Volume haut/bas** : flux Média, **Haut**, 3 fois (ou **Changer le volume** : Média +20 %) |
   | `rayle-volume-moins` | même action, **Bas** |
   | `rayle-volume-muet` | **Volume → Changer le volume** : Média à 0 % |
   | `rayle-media-pause` | **Média → Contrôle multimédia** : Lecture/Pause |
   | `rayle-media-suivant` | **Contrôle multimédia** : Suivant |
   | `rayle-media-precedent` | **Contrôle multimédia** : Précédent |
   | `rayle-lampe-on` | **Appareil → Lampe torche** : Allumer |
   | `rayle-lampe-off` | **Lampe torche** : Éteindre |
   | `rayle-lampe-bascule` | **Lampe torche** : Basculer |
4. Enregistre. (La tablette Xiaomi n'a peut-être pas de flash : ces trois lignes ne feront alors rien, ce n'est pas grave.)

## Étape 6 — Macro 4 : « Raylé – Sonner » (même si Raylé est fermée)

1. Nouvelle macro `Raylé – Sonner`, déclencheur **Webhook (URL)** identifiant `rayle-sonner`.
2. Actions, dans l'ordre :
   - **Volume → Changer le volume** : Sonnerie et Alarme à 100 % ;
   - **Média → Jouer / arrêter un son** : choisis une sonnerie forte ;
   - **Appareil → Vibrer** : motif long ;
   - **Notification → Afficher une notification** : « Raylé : je suis là ! ».
3. Enregistre.

Test sur l'appareil : colle dans Chrome l'adresse de base suivie de `/rayle-sonner`. Il doit sonner.

## Étape 7 — Donner les adresses au Worker (une seule fois)

1. Cloudflare → **Workers** → ton Worker Raylé → **Paramètres** → **Variables et secrets** → **Ajouter** → type **Secret**.
2. Nom : `RELAIS_ANDROID`. Valeur (avec TES adresses de base, sans identifiant à la fin) :
   ```json
   {"telephone":"https://trigger.macrodroid.com/AAAA-…","tablette":"https://trigger.macrodroid.com/BBBB-…"}
   ```
3. **Déployer**. Si tu n'as fait que le téléphone, mets seulement `"telephone"`.

Le Worker n'accepte que des adresses `https://…macrodroid.com/…` et n'appelle que les identifiants `rayle-…` ci-dessus.

## Étape 8 — Essayer

Depuis le PC ou un autre appareil appairé : « Raylé, allume la lampe du téléphone », « monte le son de la tablette »,
« ouvre YouTube sur la tablette », « mets pause sur le téléphone », « fais sonner le téléphone ».
Dans Raylé, ⚙ Réglages affiche « MacroDroid : téléphone relié, tablette reliée ».

## Dépannage

| Problème | Solution |
| --- | --- |
| Raylé : « MacroDroid n'est pas encore relié » | Secret `RELAIS_ANDROID` absent ou mal écrit (guillemets droits, virgule) |
| Raylé dit « j'ai envoyé » mais rien ne se passe | Batterie « Sans restriction » (étape 1.3), macro activée, identifiant exactement identique |
| « Je n'ai pas de macro pour ouvrir ça » | Seules XTB, WhatsApp, YouTube et Spotify ont une macro (étape 3) |
| La lampe ne s'allume pas sur la tablette | Pas de flash sur cet appareil |
| Plus de 5 macros demandées | La version gratuite s'arrête à 5 : regroupe plutôt les déclencheurs dans une même macro |
