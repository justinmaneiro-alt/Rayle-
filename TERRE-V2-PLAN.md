# Terre 2.0 — plan (PC uniquement)

Écrit le 2026-11-05, pendant la nuit autonome. Avancement : `PROGRESS.md`.

## 1. Étude de « God's Eye View »

- Dépôt étudié en lecture seule (clone dans un dossier temporaire, HORS du dépôt de Rayle) : `github.com/bilawalsidhu/gods-eye-view`.
- **Licence du code : MIT** (Copyright (c) 2026 Bilawal Sidhu). Réutiliser du code est permis à condition de garder la mention : voir `THIRD_PARTY_NOTICES.md`.
- **Attention : le MIT ne couvre PAS les données** du projet (câbles sous-marins TeleGeography CC BY-NC-SA, extraits OSM ODbL, images d'événements CC BY-NC, modèles 3D sous leurs propres licences). **Aucune donnée ni aucun modèle 3D de ce projet n'est copié.**
- Choix fait : Rayle **ré-implémente les idées** (couches, modes de vision, HUD) avec son propre code, plus petit et adapté à sa galaxie (le projet d'origine est une grosse application Vite + serveur Node). Il sert de référence pour la liste des sources publiques et leurs conditions. La mention MIT est quand même ajoutée (prudence, crédit).

## 2. Stack retenue

| Brique | Licence | Clé ? | Remarque |
|---|---|---|---|
| CesiumJS 1.123.0 (CDN jsDelivr, chargé à la demande) | Apache-2.0 | non | globe, relief, 3D Tiles, post-traitements (modes de vision) |
| satellite.js 5.0.0 (CDN, à la demande) | MIT | non | propagation SGP4 des TLE CelesTrak |

Rien n'est installé dans le dépôt : les bibliothèques viennent du CDN au moment où la Terre 2.0 s'ouvre (et sont mises en cache par le navigateur).

## 3. Couches et sources

| Couche | Source | Licence / conditions | Clé | Accès depuis le navigateur |
|---|---|---|---|---|
| Fond (zoom faible) | NASA GIBS Blue Marble | domaine public (NASA) | non | oui (CORS) |
| Fond (zoom fort) | EOX Sentinel-2 cloudless 2020 | CC BY-NC-SA 4.0 (non commercial, attribution « Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2020) ») | non | oui |
| Noms des lieux | (aucune : CARTO exige désormais une clé ; écarté) | — | — | — |
| Relief + bâtiments 3D | Cesium ion : World Terrain + Cesium OSM Buildings | conditions Cesium ion (compte gratuit « Community », usage personnel non commercial) ; bâtiments © OpenStreetMap (ODbL) | **jeton gratuit** | oui |
| Villes photoréalistes | Google Photorealistic 3D Tiles | conditions Google Maps Platform (payant au-delà du quota) | **clé Google** — DÉSACTIVÉ par défaut | oui |
| Recherche de lieu | Nominatim (OpenStreetMap) | ODbL, politique d'usage : 1 requête/s max, cache, pas de recherche à chaque frappe | non | oui ; repli Open-Meteo Geocoding (CC BY 4.0) |
| Avions | adsb.lol (ODbL) ; OpenSky en secours | adsb.lol : ODbL ; OpenSky : usage non commercial, quotas anonymes | non | **pas de CORS** → petit relais séparé sans secret |
| Satellites, ISS | CelesTrak GP (TLE) | données publiques (CelesTrak / 18th SDS) | non | oui |
| Séismes | USGS (flux GeoJSON) | domaine public (USGS) | non | oui |
| Météo | Open-Meteo | CC BY 4.0 (gratuit non commercial) | non | oui |
| Lancements récents | Launch Library 2 (The Space Devs) | gratuit, 15 requêtes/heure en accès libre, attribution | non | oui |
| Bateaux | AISStream.io | gratuit avec compte | **clé gratuite** — désactivé sans clé | WebSocket |
| Incendies | NASA FIRMS | domaine public / CC0 (citation demandée) | **MAP_KEY gratuite** — désactivé sans clé | via relais |
| Caméras | Caltrans CWWP2 (Californie), TfL JamCams (Londres), sources officielles françaises si leur licence le permet | voir phase 7 (licence de chaque source écrite dans la couche) | non | oui (CORS vérifié pour Caltrans et TfL) |

## 4. Architecture

- Nouveau module `terre-v2/` (dossier à la racine), **chargé à la demande** quand on entre sur la Terre depuis la galaxie, **sur PC seulement**.
  - `terre-v2/index.js` : `entrer(G)` / `sortir()` (même contrat que `planetes/terre/pc/index.js`), charge Cesium, crée le visualiseur dans un calque plein écran par-dessus la galaxie (la galaxie ne dessine plus rien pendant ce temps), expose `window.Terre2`.
  - `terre-v2/config.js` : réglages sur l'appareil (`rayle_terre2`), jeton Cesium ion (public, restreint au domaine), clés facultatives (Google, AISStream, FIRMS) stockées dans le navigateur seulement, jamais dans le dépôt.
  - `terre-v2/couches/*.js` : une couche = un module (`avions`, `satellites`, `seismes`, `meteo`, `lancements`, `bateaux`, `incendies`, `cameras`) avec la même interface : `activer`, `desactiver`, `legende`, `intervalle`, `etat` (ok / erreur / clé manquante). Si la source tombe, la couche s'éteint seule avec un message, la Terre continue.
  - `terre-v2/vision.js` : modes de vision en nuanceurs (post-traitement Cesium) : normal, nuit, thermique, CRT, noir et blanc.
  - `terre-v2/hud.js` + `terre-v2/terre2.css` : panneau « Couches », recherche, FPS, mode de vision, crédits (verre sombre, style de Rayle).
  - `terre-v2/ordres.js` : branchement sur les commandes de Raylé (phase 9).
  - `terre-v2/relais/` : petit Worker Cloudflare séparé `rayle-terre-relais` (sans secret, liste blanche d'adresses, cache) pour les sources sans CORS (avions, FIRMS).
- **Repli** : bouton « Terre classique » dans le HUD (réglage `rayle_terre_vue = 'classique'`), et repli automatique sur la Terre classique si Cesium ne se charge pas (hors ligne, CDN en panne, WebGL2 absent).
- **Téléphone et tablette : inchangés** (la carte légère reste ; la Terre 2.0 n'y est jamais chargée).
- Les anciens ordres (`window.Terre` : actualités, météo, `volerVers`…) continuent de marcher : la Terre 2.0 garde la Terre classique disponible et expose sa propre API `window.Terre2`.

## 5. Ce qui est désactivé faute de clé

- Sans jeton Cesium ion : globe avec le fond d'image, **sans relief ni bâtiments 3D**, sans aucune erreur (la case « Relief et bâtiments » dit « jeton manquant » et comment l'obtenir).
- Sans clé Google : pas de villes photoréalistes (désactivé par défaut de toute façon).
- Sans clé AISStream : pas de bateaux. Sans MAP_KEY FIRMS : pas d'incendies.

## 6. Risques

- Quotas : Launch Library (15/h) → cache 30 min ; Nominatim (1/s) → recherche seulement à la validation, cache ; avions → rafraîchissement 10 s, zone visible seulement, relais avec cache 5 s.
- Performance : qualité automatique (résolution de rendu, erreur d'écran maximale des tuiles 3D), FPS affichés, couches éteintes par défaut sauf séismes.
- Données personnelles : aucune position de Justin n'est envoyée (la recherche part de ce qu'il tape) ; caméras : seulement des flux officiellement publics, affichés tels que publiés, avec source et licence ; jamais de caméra privée, aucune reconnaissance de visage ni de plaque.
- Le CDN peut être indisponible : repli sur la Terre classique.
- Licences non commerciales (EOX, CARTO, Cesium ion Community, Open-Meteo gratuit) : Rayle est un projet personnel non commercial ; à revoir si cela change.
