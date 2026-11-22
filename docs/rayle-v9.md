# Rayle v9 — une voix gratuite qui parle à chaque fois

## Phase 1 — Diagnostic (22/11/2026)

**Pourquoi Gemini (Sulafat) échoue.**
1. Quota gratuit Gemini TTS trop bas : environ 3 requêtes par minute et 10 à 15 par jour (sources externes, non officielles ; Google ne publie pas de chiffre ferme). Le Worker `rayle-voix` renvoie alors un 429, vu côté page comme « voix momentanément indisponible ».
2. Les journaux passés de `rayle-voix` n'existent pas (pas d'observabilité, et un 429 renvoyé par le Worker compte comme « success » dans les statistiques Cloudflare) : le constat repose sur les mesures v7/v8 (rafales de 3 à 11 requêtes sur 20 s) et sur le message 429 conservé par le Worker.
3. La latence est secondaire (2 à 6 s par réponse) ; le problème est le plafond, pas la qualité.
4. Conséquence : une voix qui dépend d'un quota aussi bas ne peut pas parler « à chaque fois ». Décision : Gemini sort du chemin par défaut (reste un choix dans Réglages → Voix).
5. Remède retenu : Azure Speech F0 (500 000 caractères par mois, bloqué sans facturation à la limite) en voix principale, Piper local (illimité, hors ligne) en secours.

**L'ancienne voix Vivienne.**
- Branchement retrouvé dans l'historique (commits 24cba37 et eaf75b9) : voix « Vivienne · Edge (en ligne, gratuit) » appelée par la route `/tts` du **Worker principal** `rayle`, « Edge d'abord, Azure seulement en tout dernier recours » (DEPLOIEMENT.md §5). Donc l'accès **non officiel** au service de lecture d'Edge (type edge-tts), sans clé Azure.
- Pourquoi elle s'est arrêtée (déduction, le code en ligne du Worker principal n'est pas dans le dépôt) : Microsoft protège ce service par un jeton de sécurité qui change et le réserve à Edge ; il le refuse ou le fait expirer sans préavis, en particulier depuis les adresses des datacenters Cloudflare. Rien dans le dépôt ne l'a cassé : le service lui-même a cessé de répondre.
- Décision : **ne pas le réutiliser**. On passe par une ressource Azure officielle à ton nom (clé secrète du Worker `rayle-voix`), et Piper reste le secours local.

## Phase 2 — Piper local (navigateur, WebAssembly, Web Worker)

- **Moteur dans le dépôt** (`core/voice/piper/`, ≈ 29 Mo : onnxruntime-web 1.18.0, piper_phonemize + espeak-ng, jamais d'appel à un CDN) ; `piper-worker.js` fait tout hors du fil de l'interface : texte → phonèmes → réseau ONNX → WAV. Le module WebAssembly de l'analyseur est compilé une seule fois et ses données (18 Mo) gardées en mémoire du worker.
- **Modèles** téléchargés une seule fois depuis le dépôt officiel `rhasspy/piper-voices`, gardés dans le Cache Storage (`rayle-piper-v1`, stockage « persistant » demandé) : ensuite aucun réseau. Voix : Siwis (féminine, 63 Mo), Jessica et Pierre (upmc, 77 Mo, un seul fichier pour les deux), Tom (masculine, 64 Mo). Préchargement de fond de Siwis (ou de la voix Piper choisie) à l'ouverture, dans un `requestIdleCallback`, sauf si l'économiseur de données est actif.
- **Flux** : la réponse est coupée en parts ≤ 140 caractères (la première ≤ 90, coupée aux virgules), la suivante se prépare pendant que la précédente est lue.
- **Mesure sur ce PC de test** (Chrome sans carte graphique, 6 Go de mémoire, très chargé) : analyse des phonèmes ≈ 1,4 s, synthèse ≈ 10 × le temps réel (43 s pour 4,3 s de voix, 15 s pour 1,7 s). **Ce n'est pas représentatif d'une tablette ou d'un Galaxy S23 Ultra** (non mesurés ici : aucune de ces machines n'est accessible depuis cette session). L'objectif « première phrase en moins de 1,5 s » n'est donc ni prouvé ni infirmé : à mesurer sur la tablette (Réglages → Voix → Écouter, Piper).
- **Plus de voix du système** : le test statique `voix-unique-test.mjs` (aucun `speechSynthesis`/`SpeechSynthesisUtterance` dans le code) est conservé et passe.
- Test : `trader-pro/tests/piper-chrome.mjs` (télécharge le vrai modèle, synthétise, vérifie l'audio).

## Phase 3 — Voix principale Azure Speech F0 (code prêt ; la clé est à créer avec Justin)

- **Worker `rayle-voix`** : routes `POST /azure` (texte, voix, ton, vitesse → mp3 24 kHz) et `GET /azure/quota` ; secrets `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` ; SSML (`<prosody>` débit et hauteur selon le ton : naturel, chaleureux, posé, dynamique) ; jeton vérifié comme pour `/tts` ; `GET /sante` dit si la clé est en place. Le Worker principal `rayle` n'est pas touché.
- **Une réponse = une requête** (Azure : jusqu'à 3 500 caractères d'un coup ; texte plus long : plusieurs requêtes seulement dans ce cas).
- **Cache** des phrases qui reviennent : sur l'appareil (Cache Storage `rayle-voix-azure-v1`, 600 phrases) et sur le Worker (Cache API) ; une phrase en cache ne compte pas dans le quota.
- **Compteur du mois** dans Workers KV (liaison `QUOTA`, une écriture par phrase nouvelle, très loin de la limite gratuite de 1 000 écritures par jour) ; arrêt volontaire à 490 000 caractères (Microsoft bloque à 500 000) ; affiché dans Réglages → Voix et dans État des données, alerte à 80 %.
- **Ordre des moteurs** : voix choisie (Azure par défaut s'il est prêt) → Piper. Une réponse commencée se termine avec la même voix ; si Azure échoue avant la première phrase, toute la réponse est lue par Piper (même sensibilité féminine/masculine). Disjoncteur : après une panne d'Azure, une minute sans le réessayer ; quota du mois atteint : 6 h ; clé refusée ou absente : 30 min. Si Piper n'a pas encore téléchargé sa voix (tout premier usage sans réseau), la réponse reste affichée avec « voix momentanément indisponible », jamais la voix du système.
- **Gemini** n'est plus utilisé par défaut ; il reste un choix dans Réglages → Voix (section facultative). L'ancien choix automatique de la v7 (Sulafat) est effacé une fois par appareil.
- Tests : `worker-voix/tests/azure-test.mjs` (22), `galaxie/tests/voix-moteurs-test.mjs` (38), `trader-pro/tests/voix-v9-chrome.mjs` (tablette et téléphone : 34 chacun, voir phases 4 et 5).
