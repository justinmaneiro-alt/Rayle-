> **Retiré (2026-10-15)** : la Terre vivante (trafic simulé, points, trajets, frontières) vivait dans l'ancien fond « Espace », supprimé quand le fond Univers est devenu la scène 3D du bouton Univers (voir `docs/univers.md`). Ce document est conservé pour l'historique ; les données (`ui/espace-terre-donnees.js`) servent encore aux lieux et aux villes.

# Espace : Terre vivante et palier Ultra

Mission 3 (partie B). Tout est gratuit : textures NASA (domaine public), contours Natural Earth (domaine public), aucune clé, aucun service payant. Ce qui dépend d'un service externe est dit plus bas (« Réel ou simulé »).

## 1. Palier Ultra
Réglage manuel : **Réglages → Apparence → Niveau d'animation → Ultra** (ou « passe en qualité ultra »). **Jamais choisi automatiquement** : l'Auto ne dépasse pas Max.

| | Max | Ultra |
|---|---|---|
| Textures de la Terre | 4096 px | **8192 px** (jour : NASA Blue Marble, nuit : NASA Black Marble 2016) ; 4096 si le GPU est limité à moins de 8192 ou si le fichier manque |
| Post-traitement | aucun | rendu **HDR** (demi-flottants), **bloom** plein écran (UnrealBloomPass), compression douce des hautes lumières |
| Anticrénelage | aucun | MSAA 4× (cible du rendu) + contexte `antialias`, anisotropie jusqu'à 8× |
| Atmosphère (Rayleigh / Mie) | 10 pas | **28 pas** |
| Ombres des nuages sur le sol | 1 lecture | **5 lectures** : ombres douces |
| Lumières des villes | halo flou ×0,7 | halo ×1,25 + bloom |
| Résolution de rendu | ≤ 1,5 × | **≤ 2,5 ×** ; 60 images/s plafonnées au lieu de 30 |
| Trafic simulé | 420 avions, 160 bateaux | 900 avions, 360 bateaux |

* **Détection de l'appareil** (`ui/settings.js`, sonde existante) : à la sélection, une ligne d'avertissement dans le journal : « ⚠ Qualité Ultra : très gourmande (batterie, chaleur, mémoire graphique) — cet appareil semble limité : appareil mobile, textures limitées à …, … Go de mémoire, … cœurs ». Jamais bloquant.
* **Repli automatique** (`ui/background.js`) : si la moyenne passe sous ≈ 22 images/s deux mesures de suite (toutes les 4 s), Raylé repasse au palier **Max**, l'enregistre et le dit (« Qualité Ultra trop lente… »).
* Si les modules de post-traitement ne se chargent pas (hors ligne, CDN), le rendu simple continue (avec les textures 8k).
* Mémoire GPU : une texture 8k RGBA pèse environ 180 Mo avec ses mipmaps ; jour + nuit + nuages ≈ 400 Mo. C'est la raison de l'avertissement.

## 2. Terre vivante
Bouton 🌍 sous le bouton ◐ (visible avec le fond Espace en Auto, Max ou Ultra) : panneau avec l'heure du globe, les vitesses du temps, la rotation à la main, les couches (villes la nuit, vols, bateaux, points) et un bouton « Effacer ». En Éco le fond reste une image fixe : ces outils demandent Auto, Max ou Ultra (Raylé le dit).

### Temps (`ui/espace-temps.js`, `UI.horloge`)
Le globe suit une **horloge virtuelle** : heure réelle par défaut, ×60, ×600, 1 heure, 6 heures ou 1 jour par seconde, figée, décalée (« avance de 3 heures »), « remets l'heure réelle ». Suivent l'horloge : rotation de la Terre (temps sidéral), **terminateur jour / nuit en direct**, Soleil, Lune, planètes, ISS, trafic simulé. Bornée à ±200 ans (les formules d'astronomie de `ui/astro.js` restent justes). Quand le temps est accéléré, les positions des astres sont recalculées presque à chaque image (toutes les 2 s sinon).

### Rotation à la main (`UI.terreMain`)
« Fais tourner la Terre à la main » (ou le bouton ✋) : un voile capte le glissement d'un doigt ; la Terre tourne sous le Soleil, qui reste en place (le terminateur ne bouge pas, les continents défilent) ; elle garde son élan puis s'arrête. « Remets la Terre en place » / « ↺ Orientation réelle » efface le décalage. « Tourne la Terre vers l'est » donne une impulsion.

### Villes lumineuses (NASA)
Carte NASA Black Marble 2016 (Suomi NPP VIIRS) : l'intensité de chaque pixel est la densité de lumière mesurée. Le shader (`FS_TERRE`, `ui/espace-astres.js`) la fait ressortir (lampes au sodium orangées, centres denses blanc chaud), ajoute un **halo diffus** (lecture floue de la même carte) pour les grandes agglomérations, un scintillement discret, et l'atténue sous les nuages. « Masque les lumières des villes » les coupe.

### Trafic : réel ou simulé
**Toujours affiché** : badge en bas à gauche (« Trafic vols : simulés · bateaux : simulés ») et dans le panneau.
* **Simulé (défaut)** : 213 liaisons aériennes plausibles entre 70 plates-formes, 12 routes maritimes en points de passage placés en mer (Suez, Malacca, Panama, cap de Bonne-Espérance, Atlantique, Pacifique…). Les positions sont une **fonction de l'heure virtuelle** (aucun état) : chaque avion fait l'aller puis le retour sur son grand cercle. **Vitesses accélérées** pour être visibles : ×240 pour les avions (≈ 60 km/s à l'écran), ×1 800 pour les bateaux en mode pédagogique ; **vitesses réelles** (900 km/h, 40 km/h) en mode « échelle réaliste » (donc presque immobiles : on accélère le temps). Les avions sont plus brillants côté jour.
* **Temps réel des vols** (« affiche les vols en temps réel ») : **OpenSky Network**, API ouverte, gratuite, accès anonyme, sans clé. **Impossible directement depuis un site statique** : l'API ne répond avec un en-tête CORS que pour son propre domaine (vérifié : `Access-Control-Allow-Origin: https://opensky-network.org`). Il faut donc la route `/vols` du Worker (code ci-dessous). Tant qu'elle n'existe pas ou ne répond pas, Raylé reste en simulation et le dit.
* **Bateaux en temps réel** : aucune API gratuite sans clé n'existe (AIS) ; toujours simulés.

#### Worker : route `/vols` — « worker à publier à la main »
`wrangler` n'est pas installé sur cette machine : le fichier `worker/worker.js` est modifié (copie de l'ancien : `worker/worker-avant-vols.js`) mais **pas publié**. Ce qui a changé : la fonction `volsDonnees` / `routeVols` avant `routeActus`, le `case "/vols"` dans le routeur et la ligne d'aide. Le dossier `worker/` est ignoré par git (comme avant) : recoller `worker.js` dans Cloudflare. Code ajouté :
```js
async function volsDonnees() {
  const res = await fetchT("https://opensky-network.org/api/states/all", { headers: { "User-Agent": UA_SAVOIR, "Accept": "application/json" } }, 12e3);
  if (!res.ok) throw new Error("OpenSky HTTP " + res.status);
  const d = await res.json();
  const enVol = (d.states || []).filter((e) => e && e[5] != null && e[6] != null && !e[8]).map((e) => [Math.round(e[6] * 100) / 100, Math.round(e[5] * 100) / 100, Math.round(e[7] != null ? e[7] : e[13] || 0)]);
  const pas = Math.max(1, enVol.length / 1500), avions = [];
  for (let i = 0; i < enVol.length && avions.length < 1500; i += pas) avions.push(enVol[Math.floor(i)]);
  return { source: "OpenSky Network (accès anonyme)", t: d.time || null, total: enVol.length, avions };
}
async function routeVols(url, env, ctx, cors) { return repondreCache(env, ctx, cors, "vols", 30, () => volsDonnees(), false); }
// dans le routeur : case "/vols": return await routeVols(url, env, ctx, cors);
```
Réponse : `{ source, t, total, avions: [[lat, lon, altitude_m], …] }` (≤ 1 500 avions, cache 30 s). Quota anonyme d'OpenSky : environ 400 crédits par jour ; une lecture toutes les 30 s au plus est nécessaire.

### Points, tracés, frontières, zoom (`ui/espace-terre.js`)
* « **Place un point à Tokyo** », « pose une épingle bleue sur Lyon », « marque Paris et Tokyo » : épingle 3D (cône + tête, anneau pulsé) avec **étiquette** ; couleurs rouge, bleu, vert, jaune, orange, violet, rose, blanc, cyan ; 60 points au plus ; la caméra vole vers le point. Lieux : 174 pays (noms français + alias), 150 villes, capitales, monuments (`ui/espace-lieux.js`).
* « **Trace un trajet de Paris à Tokyo** » / « relie Paris et Tokyo » : arc en **grand cercle** à impulsions lumineuses, distance annoncée (≈ 9 710 km). 12 tracés au plus.
* « **Trace les frontières du Japon** » : contours du pays (world-atlas 1:110 millions) en ruban doré. **Un repère, pas une frontière juridique** (Raylé le dit).
* « **Efface les points** » / « les trajets » / « les frontières » / « tout sur la Terre ».
* « **Zoome sur Tokyo** », « emmène-moi à Lyon », « survole le Japon » : visée avec un zoom adapté à la taille du pays (`geo:lat,lon,nom,zoom`). Les phrases existantes ne sont pas volées : « montre-moi le Japon » reste la page Monde, « montre-moi Bordeaux » la carte.

### Actualité d'un pays
« Montre les actualités du Japon sur le globe » (ou « les actualités de ce pays » après un zoom). Source **unique** : la route `/actus` du Worker (flux ouverts : Google Actualités, Bing, BBC, Al Jazeera, France 24, Le Monde… déjà utilisés par l'agent), **cités un par un** dans le panneau et dans la phrase de Raylé. Sans Worker, sans réponse ou sans article : « Je n'ai pas d'actualité fiable sur … » — **rien n'est inventé**. Aucune nouvelle route du Worker n'est nécessaire pour cela.

### Pour Raylé / l'IA
Famille **Terre vivante (outils du globe)** dans le registre d'outils (`js/rayle/capacites.js`, 12 exemples vérifiés par les tests, `docs/capacites.md` régénéré). L'agent de l'IA les appelle par l'outil `commande_espace` avec la phrase (« place un point à Tokyo »), comme pour « montre-moi Mars » ; elle les choisit d'elle-même quand c'est pertinent (par exemple après une question sur un pays).

## 3. Honnêteté : ce qui n'est pas testé
* **Aucune mesure d'images par seconde réelle** (Chrome headless en rendu logiciel SwiftShader : à moins de 5 images/s, sans valeur pour un GPU) ; le repli Ultra → Max n'a été vérifié que par le code et les tests, pas sur une tablette lente.
* **Pas de GPU réel** : l'aspect du bloom, du HDR et des textures 8k est jugé sur des captures logicielles ; la mémoire GPU nécessaire n'est pas mesurée.
* Les routes maritimes sont des points de passage choisis à la main ; une erreur de quelques dizaines de kilomètres (imperceptible à l'écran) est possible, un navire peut effleurer une île.
* Le temps réel des vols dépend du Worker (non publié) ; la route a été écrite et vérifiée syntaxiquement, pas exécutée contre OpenSky depuis cette machine.
* Rotation à la main : testée au clavier et par le code, pas au doigt sur une tablette.
