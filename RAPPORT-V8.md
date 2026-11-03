# Rapport Kepler V8 (3 novembre 2026)

Travail fait seul, sans te poser de question. **Simulation uniquement : aucun ordre réel, rien n'a changé là-dessus.** La stratégie et ses outils (volume, volume net / CVD, volume profile, carnet, murs) sont gardés ; aucun nouveau filtre de stratégie.

## ⚠️ À faire par toi en premier : remettre les secrets du Worker (5 minutes)

En déployant le Worker, j'ai découvert un piège : à la racine du projet, il y a un fichier `wrangler.jsonc` (non suivi par git, créé le 2 novembre) qui décrit un « site statique » portant le **même nom « rayle »**. Hier à 18:22, un déploiement de ce site avait déjà remplacé le Worker, puis il avait été annulé à 18:48. Mon premier déploiement l'a repris par erreur (la commande a été lancée depuis la racine).

Conséquence : les versions récentes du Worker n'ont plus leurs **secrets** (RAYLE_TOKEN, GROQ_KEY, TELEGRAM_TOKEN…). Seule la version `99331c28` (du 2 novembre, 07:08) les a encore.

- **J'ai remis cette version en ligne** : le Worker marche normalement (`/ping` répond, Telegram, chat, etc.).
- **Mais le nouveau code V8 du Worker n'est pas en ligne** : chaque nouveau déploiement perd les secrets (deux essais, chaque fois annulés en moins d'une minute).
- **Pour finir** : dans le tableau de bord Cloudflare (Workers → rayle → Settings → Variables and Secrets), ressaisis les 15 secrets : `AZURE_KEY, AZURE_REGION, GEMINI_KEY, GITHUB_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GROQ_KEY, MISTRAL_KEY, RAYLE_PHRASE_HASH, RAYLE_PIN_HASH, RAYLE_TOKEN, TAVILY_KEY, TELEGRAM_TOKEN, TWELVEDATA_KEY` (RAYLE_TOKEN = la valeur de `config.local.json` de l'agent). Ensuite :
  `npx.cmd wrangler deploy --config worker/wrangler.toml`
- Supprime aussi `wrangler.jsonc` à la racine (ou renomme son `name`) pour que ça ne se reproduise pas. Je ne l'ai pas supprimé moi-même : ce n'est pas mon fichier.

**En attendant**, tout marche quand même : le PC lit le registre en local, et le téléphone le reçoit dans le paquet mobile que l'ancien Worker sait déjà relayer. Seul le réglage du risque passe par le PC au lieu du Worker.

## Ce qui a été corrigé

1. **Une seule source de vérité.** Le service construit un **registre unique** des trades (moteur Trader + moteur Volume), avec, pour chaque trade : actif, sens, stratégie, heure du signal, heure d'entrée réelle, entrée, stop, objectif, statut (en attente / ouverte / clôturée / annulée / ignorée), heure et prix de sortie réels, raison, frais, R. La version du registre ne monte que quand une ligne change.
2. **Un seul calcul** : `shared/portfolio.js`, chargé tel quel par le PC, le téléphone, le service et les messages Telegram. Capital = 10 000 $ + réalisé (frais inclus) + flottant de **toutes** les positions ouvertes.
3. **Un seul réglage de risque** (1 % par défaut), dans le Worker, modifiable dans « Réglages » sous le capital. La courbe rejouée change avec lui.
4. Bugs précis :
   - « 1 position ouverte » au lieu de 3 : une position ouverte disparaissait quand sa **validité d'ordre** était passée. Corrigé (la validité ne vaut que pour un ordre en attente).
   - Flottant qui ignorait des positions : même cause, corrigé.
   - Sorties toutes à 17:00 : les stratégies de volume suivaient les trades sur des bougies **H1**. Le suivi se fait maintenant sur les bougies M15, et l'heure de sortie est celle de la bougie où le niveau est touché.
   - « SL ✓ » vert en gain → **« Stop suiveur (gain) »**.
   - « En cours 0 / En cours 1 » et « valable jusqu'à » sur une position ouverte : les listes, fiches et tableaux lisent le même registre ; « valable jusqu'à » n'apparaît que pour un ordre en attente.
   - Verdict 240 / 425 / 861 trades : le verdict n'utilise plus qu'**une fonction de stats** (`stats`), sur **une période** écrite à côté (« depuis le début du registre (30/10 19:45) »), plus le backtest V8 clairement séparé.
   - Bonus : le service n'arrivait plus à se synchroniser avec le Worker (HTTP 400) car il envoyait 3,47 Mo pour une limite de 3 Mo. La liste des variantes déjà testées reste maintenant sur le PC.
5. **Règles de position** : entrées en M15 seulement, le H1 sert de contexte ; noms sans suffixe -H1/-M15 ; positions H1 déjà ouvertes marquées « ancien format » ; **jamais deux sens opposés sur un actif**, même entre les deux moteurs (signal « ignoré : position inverse ouverte », visible dans le journal et le tableau, filtre « Ignorés ») ; plusieurs positions dans le même sens numérotées #1, #2, avec le risque total par actif. Taille calculée pour chaque position : quantité au pas de lot Kraken, notionnel, risque en $, gain visé en $.
6. **ETH et HYPE** ajoutés partout : boutons, graphique, carnet (enregistreur), moteur, stats, notifications. HYPE : l'historique est court, et c'est écrit dans l'interface.
7. **Format des prix** par actif, axe compris, virgule française : BTC 0 décimale, ETH 2, SOL 2, HYPE 3, DOGE 5.
8. **Graphique** : positions passées à 25 % sans étiquette (détail au survol ou au tap), bouton « Masquer les passées » ; positions en cours vives avec un contour qui pulse doucement, lignes entrée / stop / objectif jusqu'à l'axe avec leurs prix, étiquette vivante « #1 VENTE · +0,86 R · +93,64 $ » mise à jour chaque seconde ; étiquettes empilées sans chevauchement ; graduations sans doublon ; dates de l'axe X espacées selon la largeur.
9. **Fiche « À COPIER »** en haut de la vue (PC et téléphone) : bandeau ACHAT vert / VENTE rouge, quantité en gros, notionnel, entrée, stop, objectif, risque $, R:R, validité si en attente, boutons « Copier les valeurs » et « Voir sur le graphique ». Sur le téléphone, une **grande carte plein écran** s'ouvre quand une nouvelle proposition arrive.
10. **Capital au centime** qui défile, avec un éclat vert ou rouge, prix Kraken chaque seconde sur les deux appareils, et en petit : « registre v… · prix Kraken hh:mm:ss » pour vérifier la synchronisation.
11. **Telegram** : un seul format, depuis les changements du registre — proposition (🔴 VENTE DOGE · M15, quantité, entrée, stop (−$), objectif (+$), R:R, validité, raison), entrée touchée, sortie avec le résultat réel en R et en $.

## Les vrais chiffres après audit

`tools/audit-kepler.mjs` a recalculé les 36 trades du registre sur les **vraies bougies Kraken M15** : entrée remplie seulement si le prix l'a touchée, stop d'abord si stop et objectif tombent dans la même bougie, frais et glissement inclus, un seul objectif (celui que tu peux recopier). Détail trade par trade dans `AUDIT-KEPLER.md`.

| | Avant audit | Après audit |
|---|---|---|
| Trades clôturés | 23 | 22 |
| Gagnants / perdants | 13 / 10 | 10 / 12 |
| Réussite | 56,5 % | 45,5 % |
| R moyen par trade | +0,655 | +0,418 |
| Fourchette à 95 % | −0,10 … +1,41 | −0,32 … +1,16 |
| Capital (prix du moment) | ≈ 12 745 $ | ≈ 11 008 $ |

L'ancien affichage était **trop flatteur** : environ 1 700 $ de trop. Les moteurs comptaient une sortie partielle avantageuse et des remplissages à l'heure ronde. Sur 22 trades, **le résultat positif peut être du hasard** : la fourchette contient zéro. BTC est négatif (−0,70 R par trade sur 8 trades), DOGE positif (+1,60 R sur 6), SOL autour de +0,65 R.

## Les stratégies qui tiennent ou non

Backtest V8 (entrées M15, contexte H1, frais inclus, 40 % de trades les plus récents, 12 mois ; HYPE 2 mois), 3 009 trades :

- **Aucune stratégie n'est prouvée rentable.** Ensemble : −0,112 R par trade (fourchette −0,165 … −0,059 : **perdant**).
- La plus proche : « Acceptation hors de la zone de valeur » (signal H1, entrée M15) +0,091 R sur 358 trades, mais la fourchette (−0,022 … +0,204) contient zéro.
- Négatives de façon nette : Repli dans la tendance (−0,31), Rebond d'épuisement (−0,41), Impulsion de volume en M15 (−0,17).
- L'interface l'écrit en clair dans le « Verdict honnête ».

## Vérification

- Tests : `test:v8` (34 vérifications, dont la parité PC / téléphone au centime), `test:agent`, `v6`, `v7`, `v12`, `v13`, `v14`, `v18`, `d1` : tout passe. Navigateur : `v14`, `v16`, `v17`, et le nouveau `v8-kepler-captures` (12/12 : **même capital au centime sur PC et téléphone**, même version du registre, aucun texte qui se chevauche, pas de défilement horizontal, grande carte plein écran).
- `v13-agent-mobile-test` : 2 échecs qui **existaient déjà avant** (vérifié sur l'état d'origine), liés à la V22.
- Captures : `docs/captures-kepler-v8/` (local : ce dossier est ignoré par git).

## Ce qui reste à faire

1. **Secrets du Worker puis déploiement** (voir tout en haut).
2. L'audit est une photo du 3 novembre : relance `node tools/audit-kepler.mjs` de temps en temps. Les trades suivants sont suivis par les moteurs avec leur gestion prudente, pas encore par la règle de l'audit.
3. Le bilan de fin de journée sur Telegram utilise encore l'ancien calcul (il ne lit pas le registre).
4. La recherche quotidienne du moteur de volume (onglet « Positions d'avant ») rejoue toujours en H1 : ses chiffres ne sont pas ceux du verdict.
5. ETH et HYPE n'ont pas encore d'historique de transactions (volume net, profil) : il se télécharge chaque jour ; d'ici là, le graphique montre les bougies seules et le dit.
6. Les vues d'avant (onglet « Détails ») gardent leurs propres calculs ; la vue principale n'en dépend plus.

## Les choix que j'ai faits seul

- Le registre vit dans D1 (une ligne par trade) ; le service le construit et le publie. Il passe aussi dans le paquet mobile en secours.
- P&L d'un trade = R net × (capital réalisé du moment × risque %), arrondi au centime à chaque trade. Le capital est donc toujours « rejoué » au risque choisi : changer le risque change toute la courbe.
- Le flottant d'une position = quantité affichée × (prix − entrée), sans frais de sortie.
- La quantité affichée est arrondie **vers le bas** au pas de lot Kraken (8 décimales) : le risque réel ne dépasse jamais le risque choisi.
- Les fiches « À COPIER » montrent l'objectif 1. L'audit ne garde que cet objectif, et pas la sortie partielle des moteurs.
- Un signal inverse est ignoré aussi quand la position opposée est seulement **en attente** (règle la plus sûre). Exception gardée : une impulsion de volume remplace un ordre en attente opposé **du même moteur** (c'était déjà ainsi).
- Historique M15 de HYPE pris chez Binance (cotation depuis le 24/09/2026, avec le vrai volume acheteur / vendeur) plutôt qu'Hyperliquid : l'API Kraken ne donne que 7,5 jours. Les prix affichés et le carnet viennent bien de Kraken.
- Heure du signal = clôture de la bougie M15 qui l'a donné (le moteur Trader gardait son ouverture).
- Les sauvegardes (`backups/`, avec l'export D1 de 4,4 Mo) sont **hors git**, car le dépôt est public et D1 contient ta mémoire.
- `worker/` est hors git (c'était déjà le cas) : son code V8 est sur le disque mais pas dans les commits.
- J'ai commité deux petites modifications en cours trouvées dans le dossier (paquet mobile chaque minute, test associé) : elles passaient les tests. Je n'ai pas commité `wrangler.jsonc`, `.assetsignore`, le `package-lock.json` racine ni les ajouts « deploy » du `package.json` racine (dangereux, voir plus haut), ni les captures `docs/captures-v8` modifiées.
- Version de l'appli : `2026.11.03.1` (page, service worker et Worker).
