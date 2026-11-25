# Worker « Rayle Portefeuille » : mise en place (à faire une seule fois, ~10 minutes)

Il garde ton historique XTB **dans ton compte Cloudflare** (base D1), jamais sur GitHub, et le synchronise entre le PC, la tablette et le téléphone. Il envoie aussi les alertes de prix par Telegram quand l'appli est fermée.
L'appli marche sans lui (copie locale sur chaque appareil) ; avec lui, un import fait sur un appareil apparaît partout.

Toutes les commandes se lancent depuis la racine du projet (`Documents\Projets\Rayle-`), dans PowerShell. **Ne lance jamais `wrangler deploy` sans `--config`** (il écraserait le Worker principal).

## 1. Te connecter à Cloudflare
```
npx.cmd wrangler login
npx.cmd wrangler whoami
```
(`whoami` doit afficher ton compte.)

## 2. Créer la base D1
```
npx.cmd wrangler d1 create rayle-portefeuille
```
La commande affiche un bloc avec `database_id = "xxxxxxxx-xxxx-…"`. **Copie cet identifiant** dans `trader-pro/worker/wrangler.toml` à la place de `REMPLACER-PAR-L-IDENTIFIANT-D1`. Les tables se créent toutes seules au premier appel.

## 3. Choisir le code d'accès (le verrou)
Choisis un code long (12 caractères ou plus). Il est stocké comme **secret du Worker**, pas dans le dépôt :
```
npx.cmd wrangler secret put PORTEFEUILLE_CODE --config trader-pro/worker/wrangler.toml
```
(Colle le code quand il le demande.) Sans ce secret, le Worker réutilise le jeton de Rayle, mais seulement si le Worker principal refuse bien un faux jeton ; sinon il refuse tout. Le code propre est plus sûr : garde-le dans ton gestionnaire de mots de passe.

## 4. (Facultatif) Alertes Telegram quand l'appli est fermée
Ce sont les mêmes valeurs que les secrets GitHub `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` :
```
npx.cmd wrangler secret put TELEGRAM_BOT_TOKEN --config trader-pro/worker/wrangler.toml
npx.cmd wrangler secret put TELEGRAM_CHAT_ID --config trader-pro/worker/wrangler.toml
```

## 5. Contrôler puis déployer
```
npx.cmd wrangler deploy --dry-run --config trader-pro/worker/wrangler.toml
npx.cmd wrangler deploy --config trader-pro/worker/wrangler.toml
```
Vérification : ouvre `https://rayle-portefeuille.<ton-sous-domaine>.workers.dev/sante` : elle doit afficher `{"ok":true,"service":"rayle-portefeuille",…}`.

## 6. Brancher l'appli
Ouvre la fenêtre **Portefeuille** → ⚙ Réglages → colle l'adresse du Worker et le code d'accès (une fois par appareil ; le code reste sur l'appareil). Puis **Importer** ton fichier XTB (.zip tel quel).

## Retour arrière / sauvegarde
- Sauvegarde complète : bouton « Sauvegarder » de la fenêtre (fichier JSON sur ton appareil), ou `GET /sauvegarde` avec le code.
- Voir les versions : `npx.cmd wrangler deployments list --config trader-pro/worker/wrangler.toml` ; revenir en arrière : `npx.cmd wrangler rollback <identifiant> --config trader-pro/worker/wrangler.toml`.
- Effacer toutes les données : `DELETE /tout?confirmation=OUI` (ou supprimer la base : `npx.cmd wrangler d1 delete rayle-portefeuille`).

## Ce que le Worker garde (et ne garde pas)
Garde : positions fermées et ouvertes, opérations de trésorerie (type, date, montant), réglages (capital, risque, valeur du point), alertes, dernier rapport du coach.
Ne garde **jamais** : numéro de compte, commentaires bancaires, clés d'API. Les champs inconnus envoyés au Worker sont ignorés.

## 7. Investissement long terme (cron quotidien, gratuit)
Le même Worker recalcule chaque jour le panier de la fenêtre **Investissement** (S&P 500 : fondamentaux SEC EDGAR + prix Yahoo, sans aucune clé) par petits lots : à chaque passage du cron (toutes les 5 minutes), `LT_LOT` entreprises (3 par défaut, dans `wrangler.toml`) sont recalculées, les moins récemment calculées d'abord ; tout le S&P 500 est revu en moins d'une journée. Aucune étape de plus : le cron existant s'en charge après `wrangler deploy`.

**À faire une fois : le User-Agent de la SEC.** La SEC refuse les requêtes anonymes (erreur 403) et exige un nom + une adresse de contact. Mets les tiens dans un secret (jamais dans le dépôt) :
```
npx.cmd wrangler secret put SEC_USER_AGENT --config trader-pro/worker/wrangler.toml
```
(valeur du type `Rayle-Invest ton-nom ton-adresse@exemple.fr`). Sans ce secret, le calcul par le Worker échoue (la fenêtre affiche alors le dernier calcul embarqué dans l'appli).

- Routes : `GET /lt/index`, `GET /lt/fiche/<SYMBOLE>`, `GET /lt/evenements` (publiques : ce sont des données de marché) ; `GET` et `PUT /lt/liste` (ta liste de suivi, protégée par le même code d'accès que le portefeuille).
- Alertes : Telegram (mêmes secrets `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`) quand une entreprise déjà connue passe PAS CHÈRE avec une qualité ≥ 7/10, ou quand une action de ta liste change de verdict ; Rayle les annonce aussi à voix haute à l'ouverture de la fenêtre.
- Si Cloudflare signale un dépassement de temps de calcul (plan gratuit), baisse `LT_LOT` à 1 ou 2 : le S&P 500 reste revu en une journée.
- Calcul complet depuis ton PC (mise à jour du calcul embarqué) : `SEC_USER_AGENT="Rayle-Invest ton-nom ton-adresse@exemple.fr" node outils-donnees/lt-calcul.mjs`.
- « Tout effacer » du portefeuille n'efface jamais les données long terme (clés `lt:…`).

## Copilote : fiches de lecture de marché (phase 1)
Les fiches sont calculées par GitHub Actions (`outils-donnees/lecture.mjs`, dans la boucle du workflow `donnees`) et envoyées au Worker (route `PUT /lecture/fiches`), qui les range dans D1 (clé `lecture:tout`, une écriture par envoi). Les appareils les lisent par `GET /lecture/tout` (même code d'accès que le portefeuille). Sans le Worker, les mêmes fiches sont publiées en fichiers `lecture-<actif>.json` sur la branche `donnees`.
Secrets à ajouter (une fois, aucun dans le dépôt) :
1. Worker : `npx.cmd wrangler secret put LECTURE_CODE` (une phrase de passe d'au moins 12 caractères, tirée au hasard).
2. GitHub (dépôt → Settings → Secrets and variables → Actions) : `LECTURE_CODE` (la même valeur) et `LECTURE_URL` (l'adresse du Worker `rayle-portefeuille`, sans barre finale).

## Copilote : réseau d'information (phase 3)
- Deuxième déclencheur planifié (toutes les 2 minutes) : lit FinancialJuice, investingLive et Trump (3 appels), note, range dans D1 et envoie les alertes Telegram (score ≥ 80, réglable). Le premier (5 minutes) est inchangé. Deux déclencheurs utilisés sur les cinq du plan gratuit. Après avoir collé le nouveau `wrangler.toml`, redéployer : `npx.cmd wrangler deploy` depuis `trader-pro/worker`.
- L'état complet (72 h, toutes sources, réaction réelle du marché) est calculé par GitHub Actions (`outils-donnees/reseau.mjs`) et envoyé par `PUT /reseau/etat` (même secret `LECTURE_CODE` que les fiches de lecture ; **aucun nouveau secret**). Le Worker le garde en texte brut (10 ms de CPU) et l'appareil fusionne avec l'état rapide.
- Telegram : les secrets `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` déjà ajoutés au Worker suffisent. Les alertes de GitHub Actions passent par `POST /reseau/alertes` (le Worker les envoie : aucun secret Telegram dans GitHub).
- Budget gratuit : ≈ 720 exécutions/jour pour le déclencheur de 2 minutes + 288 pour celui de 5 minutes, ≈ 1 000 requêtes réseau sortantes/jour (3 par exécution), ≈ 750 écritures D1/jour sur 100 000 permises. La page « État des données » (route `/budget`) les compte.

## Copilote : point du matin et alertes (phase 5)
- **Point du matin Telegram** : workflow GitHub `matin` (toutes les 10 minutes de 3 h à 9 h 50 UTC, fenêtre d'envoi de 40 minutes après l'heure réglée) + un tour dans la boucle des données. Heure (défaut 7 h 00, heure de Paris), jours (défaut lundi à vendredi) et « message vocal » se règlent dans l'appli : Marchés › Actualité › Sources et réglages › Point du matin sur Telegram. Envoi : message vocal (OGG/Opus, `sendVoice`) puis version texte ; une seule fois par jour. Test à la main : GitHub › Actions › « matin » › Run workflow (case « Envoyer tout de suite » cochée).
- **Voix** : Azure Speech (offre gratuite F0, voix Vivienne) en priorité ; si Azure échoue ou n'est pas configuré, une voix Piper française installée par le workflow ; si les deux échouent, le texte part quand même.
- **Alertes du copilote** : à chaque tour de la boucle, `outils-donnees/copilote.mjs` signale seulement les gros moments (cassure confirmée de la MA200 H4/Daily, bougie de volume extrême en bout de mouvement, balayage d'un niveau clé, début de mouvement de plusieurs jours, annonce importante dans 30 minutes, changement de lecture sur une idée du carnet) via `POST /reseau/alertes` : Telegram + voix de l'appli. Chaque type se coupe dans Réglages. « Rayle, alertes silencieuses jusqu'à demain » : plus de voix, Telegram sans notification.
- **Nouvelles routes** : `GET/POST /copilote/matin` (code d'écriture), `GET/PUT /copilote/carnet` (carnet privé, texte brut dans D1), réglages `matin`, `copilote`, `silenceJusqua` dans `/reseau/reglages`.
- **Secrets GitHub à ajouter** (Settings › Secrets and variables › Actions) : `LECTURE_URL`, `LECTURE_CODE` (déjà décrits plus haut), et, pour la voix Azure, `AZURE_SPEECH_KEY` et `AZURE_SPEECH_REGION` (ex. `francecentral`). Aucun secret Telegram dans GitHub : ils restent dans le Worker.
