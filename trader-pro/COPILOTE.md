# Rayle copilote (phases 0 à 7)

Rayle LIT le marché (or, Nasdaq 100, S&P 500, Bitcoin, Solana, pétrole, dollar), connaît tes outils (sessions, MA200, volume…) et te conseille comme une analyste. Elle ne trade jamais, ne passe aucun ordre et ne dit jamais « vas-y » ni « n'y va pas ». Tout est gratuit (Cloudflare plan gratuit + D1 + GitHub Actions + Azure F0 / Piper).

## Carte du code
| Phase | Quoi | Où |
|---|---|---|
| 0 | inventaire des outils et des données | `docs/outils-rayle.md` |
| 1 | moteur de lecture : une fiche JSON par actif (tendance par unité, croisements MA200, volume, sessions avec heure d'été/hiver, niveaux, gros mouvements calibrés, score, COT, carnet, agenda, actus) | `trader-pro/lecture/`, `outils-donnees/lecture.mjs`, Worker `/lecture/*` |
| 2 | base de connaissances | `docs/connaissances/*.md` (+ `trader-pro/point/connaissances-data.js` généré) |
| 3 | réseau d'information noté + annonces notées avec page détail | `trader-pro/reseau/`, `trader-pro/marches/annonce.js`, `outils-donnees/reseau.mjs`, `annonces.mjs`, Worker `/reseau/*` |
| 4 | les points (dis-moi tout, nuit, matin, journée, un actif), règle anti-invention des chiffres, dernière visite par appareil | `trader-pro/point/` |
| 4 bis | Regarde ça, Rayle montre-moi, trader ensemble (carnet), Formation | `trader-pro/copilote/` |
| 5 | point du matin Telegram (vocal + texte), alertes du copilote, silence | `outils-donnees/matin.mjs`, `copilote.mjs`, workflow `matin.yml` |
| 6 | carnet de prévisions et « Fiabilité de Rayle » | `trader-pro/copilote/previsions.js`, `outils-donnees/previsions.mjs` |
| 7 | vérifications finales | `trader-pro/tests/point-reel.mjs`, `copilote-chrome.mjs`, ce fichier |

## Pourquoi les calculs sont dans GitHub Actions et pas dans le Worker
Le plan gratuit de Cloudflare donne **10 ms de CPU** par exécution : impossible de recalculer une MA200 et des statistiques de volume sur des milliers de bougies. Les calculs tournent donc dans la boucle `donnees` de GitHub Actions (toutes les 5 minutes, PC éteint, minutes gratuites sur dépôt public) ; le Worker ne fait que stocker (D1, souvent en texte brut sans l'analyser), relayer Telegram et servir les appareils. Seule la voie rapide du réseau d'information (3 flux, toutes les 2 minutes) tourne dans le Worker.

## Limites du plan gratuit (estimation par jour)
| Ressource | Limite gratuite | Usage estimé |
|---|---|---|
| Requêtes Worker | 100 000 / jour | ≈ 10 000 (crons 1 008 ; boucle GitHub ≈ 13 requêtes × 288 ; 3 appareils ≈ 1 600 chacun) |
| Écritures D1 | 100 000 / jour | ≈ 1 800 |
| Lectures D1 | 5 000 000 / jour | ≈ 10 000 |
| Déclencheurs planifiés | 5 pour le compte | 2 utilisés par ce Worker (5 min et 2 min) |
| CPU Worker | 10 ms / exécution | voie rapide ≈ 3 ms ; états stockés sans les analyser |
| Minutes GitHub Actions | illimitées (dépôt public) | boucle continue + workflow `matin` (quelques minutes par jour) |
| Azure Speech F0 | 500 000 caractères / mois | ≈ 2 000 caractères par point du matin ≈ 45 000 / mois |
La page « État des données » (route `/budget`) compte les requêtes et les écritures réelles.

## Secrets à ajouter toi-même (une seule fois, un par un)
Aucun secret n'est dans le dépôt. Voir `trader-pro/worker/LISEZMOI.md` pour les commandes exactes.
1. `wrangler secret put LECTURE_CODE` sur le Worker `rayle-portefeuille` (phrase de passe d'au moins 12 caractères tirée au hasard) puis redéployer le Worker (`wrangler.toml` contient maintenant un second déclencheur de 2 minutes).
2. GitHub › Settings › Secrets and variables › Actions : `LECTURE_CODE` (la même valeur) puis `LECTURE_URL` (adresse du Worker `rayle-portefeuille`, sans barre finale).
3. Telegram : les secrets `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` du Worker suffisent (ils existent déjà s'ils servent aux alertes de prix).
4. Voix du matin (facultatif, sinon Piper) : GitHub › `AZURE_SPEECH_KEY` puis `AZURE_SPEECH_REGION` (ex. `francecentral`).
5. Test : GitHub › Actions › « matin » › Run workflow (case « Envoyer tout de suite » cochée) : un message vocal et un message texte arrivent sur Telegram.
