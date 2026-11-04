# Rapport de la nuit (2026-11-05)

En français simple. Mis à jour au fil des phases. L'avancement détaillé est dans `PROGRESS.md`.

## Choix faits seul (l'option la plus sûre à chaque doute)

- **Mise en veille** : `powercfg /change standby-timeout-ac 0` et `monitor-timeout-ac 0` appliqués (sur secteur, le PC et l'écran ne s'endorment plus). Pour revenir comme avant : `powercfg /change standby-timeout-ac 30` et `powercfg /change monitor-timeout-ac 10` (valeurs à ton choix).
- **Phase 1 — résolution de l'enregistrement** : l'ancien enregistreur du carnet COMPLET (chaque modification) pèse ≈ 0,6 Go par jour : je le garde seulement 14 jours (12 Go max). La nouvelle collecte compacte (50 niveaux par côté toutes les 5 s, toutes les transactions, murs, OI/funding chaque minute, bougies avec empreinte) pèse ≈ 25 Mo par jour pour les 4 actifs, soit ≈ 0,75 Go par mois et ≈ 4,5 Go pour 6 mois : je la garde 200 jours (30 Go max). Disque : 140 Go libres.
- **Or** : enregistré (PF_XAUUSD, Kraken Futures), mais il y a peu d'échanges ; son historique Kraken ne remonte qu'à août 2026.
- **Trous** : un arrêt du moteur, une coupure de Kraken ou un carnet en re-synchronisation de plus de 15 s est écrit comme TROU (début, fin, raison). Rien n'est jamais comblé ni inventé.
- **Sauvegarde quotidienne** : les fichiers de la veille (déjà compressés) + un manifeste sha256 vérifié, dans `C:\Users\justi\Sauvegardes-Rayle\donnees-marche\<jour>\`. Seule la collecte compacte est sauvegardée (le flux complet serait trop lourd). Le résultat du contrôle apparaît dans le Journal de la fenêtre de l'agent.
- **Phase 2 — fiches** : ≈ 30 gros mouvements par semaine et par actif (≈ 18 000 sur l'historique) : les fiches PNG sont faites pour toutes les données enregistrées et pour les 12 dernières semaines de l'historique Kraken (les plus anciennes : `node agent-trading/moteur/etude-mouvements/hebdo.mjs --toutes-fiches`). L'historique n'a pas de carnet : la fiche le dit au lieu d'inventer une carte de chaleur.
- **Phase 2 — définition** : la bougie contraire tolérée ne peut être ni la première ni la dernière ; un mouvement ne traverse jamais un trou de données ; l'ATR est celui d'avant le départ.
- **Phase 2 — statistiques** : les moments sont pris toutes les 8 bougies (les issues ne se chevauchent pas) ; seuils fixés sur les 60 % premiers du temps ; seuls les signes prometteurs sont testés sur les 40 % suivants, avec correction de Holm.

## Phase 1 : enregistrement renforcé — FAIT
Tout tourne dans le moteur (redémarré à 23:13 UTC le 2026-11-04). Fichiers : `%LOCALAPPDATA%\Rayle\agent-trading\collecte\`.

## Phase 2 : gros mouvements — FAIT
Premier résultat (historique Kraken BTC, ETH, HYPE, or) : ≈ 30 gros mouvements par semaine et par actif (or ≈ 17). **Aucun signe ne prévient de façon fiable un gros mouvement** sur la période de test : seule la compression de volatilité ressort un peu pour les mouvements de 5-6 bougies (≈ 1,1 fois le taux de base), trop faible pour conclure. Les signes du carnet et des murs n'auront assez d'événements qu'après plusieurs mois d'enregistrement. Rapport : `agent-trading/moteur/etude-mouvements/RAPPORT-MOUVEMENTS-<date>.md` (hors dépôt), refait chaque lundi.

## Phase 3 : copilote, zones et ranges — FAIT
- Calcul dans le moteur (`agent-trading/moteur/copilote/`, hors dépôt), dessin seulement dans la page (`front/graphique.js`).
- Zones : profil de volume des 5 derniers jours de bougies M15 (volume réel par prix quand l'empreinte a été enregistrée, sinon réparti sur la bougie et marqué « approx »), 3 à 5 bandes discrètes, force 0-100, « majeure » au-dessus de 60.
- Range : prix entre deux zones ≥ 12 bougies, ≥ 2 touches de chaque côté, volume net qui oscille, hauteur 1,5 à 10 ATR. Boîte légère « RANGE bas – haut · N bougies », « range terminé » en pâle, marque « ↗/↘ sortie de range ».
- Choix seul : zones fusionnées si moins de 1 ATR d'écart ; un range dont le delta est inconnu (bougies d'avant l'enregistrement) est accepté mais marqué « delta inconnu » dans les données.

## Phase 4 : copilote, flèches et bilan — FAIT
- Règles (`moteur/copilote/fleches.js`) : décision à la clôture M15 seulement, sur une zone MAJEURE ou un bord de range ; retournement = reprise de la zone + volume net qui se retourne + absorption (ou mèche de rejet) + mur du bon côté qui tient (aucun mur retiré ou mangé dans la zone depuis 45 min) ; cassure = clôture de l'autre côté + volume net ≥ 1,5 × la médiane + mur consommé, puis RETEST refusé dans les 6 bougies.
- Carnet qui s'affole (≥ 10 murs qui apparaissent/disparaissent en 15 min ET déséquilibre qui change de signe ≥ 3 fois) : aucune flèche, message « marché instable, j'attends ».
- Rareté : ≤ 2 par actif et par jour (jour UTC), ≥ 6 bougies entre deux, jamais deux sens opposés tant qu'une idée est active, R potentiel ≥ 2 jusqu'à la zone suivante. Sans carnet : aucune flèche (la règle exige de lire le carnet).
- Résultat après coup : stop testé AVANT l'objectif dans une même bougie, frais 0,05 % par côté, 24 h maximum. Registre fantôme version « copilote » : `%LOCALAPPDATA%\Rayle\agent-trading\copilote\registre.json`.
- Affichage : petites flèches, traits entrée/SL/TP fins et gris (longueur selon le R potentiel, ou jusqu'à la sortie), bulle au clic (« IDÉE — non validée », thèse, entrée/stop/objectif, ce qui annule l'idée), « Bilan des flèches : N, gagnantes X, R total Y (frais inclus) » avec « échantillon trop petit pour conclure » sous 30 flèches finies. Le bouton Backtest rejoue aussi les flèches sur 5/7/14 jours (mêmes règles, carnet lu dans la collecte : avant le 5 novembre il n'existe pas, donc aucune flèche n'est possible sur cette période et c'est écrit).
- Notification dans l'application seulement (petit message 9 s). Réglages ⚙ du graphique : « Alertes Telegram des flèches » DÉSACTIVÉ et verrouillé (choix sûr : l'agent est en OBSERVATION, rien ne doit partir ; il n'existe pas de canal écran → moteur pour changer un réglage).
- Vérifié dans Chrome (PC 1600, tablette 1280, téléphone 384, plein écran) : zones, bilan, flèche d'essai dessinée et bulle, aucun élément coupé, aucune erreur console. Aucune vraie flèche n'est encore apparue (règles volontairement strictes).

## Phase 5 : Terre 2.0, étude et architecture — FAIT
- « God's Eye View » cloné en lecture seule HORS du dépôt. Licence du code : **MIT** ; ses DONNÉES et modèles 3D ne sont pas MIT (aucun n'est copié). Choix : ré-implémenter les idées avec notre propre code (plus petit, adapté à la galaxie), mention MIT gardée dans `THIRD_PARTY_NOTICES.md`.
- Plan, sources, licences, clés, risques : `TERRE-V2-PLAN.md`. Module `terre-v2/` chargé à la demande, PC seulement ; téléphone et tablette inchangés (carte légère).
- Choix seul : la Terre 2.0 devient la Terre par défaut sur PC ; le bouton « Terre classique » ouvre l'ancienne pour la visite en cours (réglage permanent possible : `rayle_terre_vue = 'classique'`). Repli automatique sur l'ancienne si Cesium ne se charge pas. Les outils d'actualités de Raylé (balises, fil France/Monde) vivent sur la Terre classique : quand ils sont appelés, Raylé y passe toute seule pour cette visite (rien de cassé).

## Phase 6 : globe et villes 3D — FAIT
- CesiumJS 1.123.0 (Apache-2.0) depuis jsDelivr, fond sans clé : NASA GIBS Blue Marble (domaine public) + EOX Sentinel-2 cloudless 2020 (CC BY-NC-SA 4.0, attribution dans « Crédits »). Zoom continu jusqu'aux rues (vérifié sur Paris).
- Sans jeton : globe lisse, sans relief ni bâtiments, AUCUNE erreur (testé). Avec jeton : relief Cesium World Terrain + Cesium OSM Buildings (non testé faute de jeton). Google Photorealistic 3D : désactivé, seulement si une clé est collée.
- FPS affichés (≈ 130 i/s dans Chrome sans écran), qualité automatique (échelle de rendu 60-100 %), couches éteintes par défaut sauf séismes, recherche Nominatim seulement à la validation (1 requête/s max, cache) avec secours Open-Meteo.
- Choix seul : **pas de noms de lieux sur le globe** : CARTO exige maintenant une clé (filigrane « API KEY REQUIRED » vu en test) ; aucune autre source raster sans clé fiable trouvée.

### Jeton Cesium (5 minutes)
1. Va sur https://ion.cesium.com/signup et crée un compte gratuit (« Community », usage personnel non commercial).
2. Menu « Access Tokens » → « Create token ». Nom : « Rayle ». Coche seulement `assets:read` (et `geocode` si proposé).
3. Dans « Allowed URLs », ajoute `https://justinmaneiro-alt.github.io` (et `http://127.0.0.1:8000` pour le PC si tu veux).
4. Copie le jeton. Soit tu le colles dans la Terre 2.0 → « Couches » → « Jeton et clés » → « Enregistrer » (il reste dans ce navigateur), soit tu le mets dans `terre-v2/config.js` (`JETON_CESIUM_PUBLIC`) : il peut être public car Cesium le limite à ton domaine.

## Phase 7 : couches gratuites — FAIT
- Sans clé : séismes (USGS, domaine public, 5 min), satellites + ISS avec orbite (CelesTrak + satellite.js MIT, TLE gardés 2 h), météo (Open-Meteo CC BY 4.0, grille 5×5, 15 min), lancements (Launch Library 2, cache 30 min pour 15 req/h), avions (adsb.lol ODbL, 10 s, zone visible).
- Avions : adsb.lol n'autorise pas les navigateurs (pas de CORS) → **petit Worker séparé `rayle-terre-relais` DÉPLOYÉ** (https://rayle-terre-relais.justinmaneiro.workers.dev, version 5961f8f2), sans secret, liste blanche (avions, FIRMS), cache court, CORS limité à ton site et au PC. Le Worker principal « rayle » n'est pas touché.
- Avec clé gratuite, désactivées sans clé (la case est grisée et la procédure s'affiche) :
  - **Bateaux (AISStream)** : https://aisstream.io → connexion GitHub → « API Keys » → « Create » → coller dans Couches → « Jeton et clés ». (Non testé faute de clé : AISStream peut refuser une connexion directe depuis un navigateur ; si c'est le cas il faudra passer par le relais.)
  - **Incendies (NASA FIRMS)** : https://firms.modaps.eosdis.nasa.gov/api/map_key → adresse e-mail → la MAP_KEY arrive par e-mail → la coller au même endroit. Elle passe par le relais (FIRMS n'a pas de CORS), qui ne la garde pas.
- Caméras (open data officiel seulement, image telle que publiée, source + licence dans la fiche, aucune reconnaissance) :
  - TfL JamCams, Londres : « Powered by TfL Open Data », Open Government Licence, contient des données OS © Crown copyright.
  - Caltrans CWWP2, Californie (districts 3, 4, 7, 11, 12) : images publiées pour l'information du public selon les conditions du portail CWWP2 (page des conditions inaccessible cette nuit : à relire).
  - Métropole de Lyon, caméras Web Criter (trouvées via data.gouv.fr) : **Licence Ouverte 2.0 (Etalab)**.
  - Écartées : webcams des DIR (pas de licence de réutilisation trouvée), toute caméra privée, Shodan/Insecam.
- Chaque couche : case on/off, légende, intervalle raisonnable ; deux échecs de suite → la couche s'éteint avec un message, la Terre continue.

## Phase 8 : modes de vision — FAIT
- Nuanceurs de post-traitement Cesium (écrits pour Rayle) : normal, vision nocturne (vert, grain, lignes), thermique (palette fer), CRT (courbure, lignes, aberration), noir et blanc. Bouton « Vision » + touche V ; L ouvre les couches.

## Phase 9 : Raylé pilote la Terre — FAIT
- `terre-v2/voix.js` (sans IA), branché dans `core/intelligence/phrase.js` (voix ET texte), PC seulement : « va à Paris », « zoome sur la tour Eiffel », « montre les avions / satellites / séismes / bateaux / caméras de Londres », « mode nuit / thermique / CRT / noir et blanc / normal », « masque les couches », « cache les avions », « retour à la Terre classique », « ouvre la Terre 2.0 ».
- Depuis n'importe quelle vue, une phrase claire (« va à Rome ») ouvre la galaxie puis la Terre 2.0 ; les phrases ambiguës (« montre les séismes » hors de la Terre) restent aux commandes existantes (sources en direct).
- Raylé annonce ce qu'elle fait ; couche sans clé → elle explique comment obtenir la clé. Les commandes ne parlent que de la Terre.
- Vérifié : 46 tests purs, Chrome sur le banc (7 phrases), et dans la vraie application (« va à Paris » depuis l'accueil → galaxie → Terre 2.0 ; retour à la Terre classique ; téléphone : rien de la Terre 2.0 n'est chargé).
