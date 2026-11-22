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
