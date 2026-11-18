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
