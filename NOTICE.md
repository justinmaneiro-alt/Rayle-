# NOTICE — voix de Raylé (synthèse vocale gratuite et locale)

Raylé ne redistribue AUCUN modèle de voix : `node app-pc/installer-voix.mjs` les télécharge sur le PC de l'utilisateur, dans `assets-lourds/voix/` (dossier exclu de git).
Tout est gratuit, sans clé, sans carte bancaire. Une fois installée, la voix locale fonctionne hors ligne.

## Moteurs et modèles

| Composant | Rôle | Licence | Source |
|---|---|---|---|
| **Kokoro-82M** (modèle, v1.0) | voix neuronale, voix française `ff_siwis` | Apache-2.0 | https://huggingface.co/hexgrad/Kokoro-82M |
| **kokoro-onnx** | exécution de Kokoro (ONNX Runtime) | MIT | https://github.com/thewh1teagle/kokoro-onnx |
| **Piper** (`piper-tts`) | voix neuronale rapide | GPL-3.0-ou-ultérieure — lancé comme programme séparé sur le PC, jamais intégré ni redistribué dans ce dépôt | https://github.com/OHF-Voice/piper1-gpl |
| Voix **fr_FR-siwis-medium** (Piper) | voix féminine française | CC BY 4.0 | https://huggingface.co/rhasspy/piper-voices |
| Voix **fr_FR-upmc-medium**, locutrice « jessica » (Piper) | voix féminine française | CC BY-SA 4.0 (partage à l'identique pour toute œuvre dérivée de cette voix) | https://github.com/marytts/upmc-pierre-data |
| **espeak-ng** (via `espeakng-loader`, `phonemizer`) | transcription phonétique du français | GPL-3.0-ou-ultérieure | https://github.com/espeak-ng/espeak-ng |
| **ONNX Runtime**, **NumPy**, **SoundFile** | calcul et fichiers audio | MIT, BSD-3-Clause, BSD-3-Clause | PyPI |

### Mention obligatoire (CC BY 4.0)

Les voix françaises « Siwis » (Kokoro `ff_siwis` et Piper `fr_FR-siwis-medium`) sont entraînées sur la **SIWIS French Speech Synthesis Database**
(Université d'Édimbourg, CSTR / Idiap), licence CC BY 4.0 : https://datashare.is.ed.ac.uk/handle/10283/2353 .
La voix « Jessica » vient du jeu de données **UPMC** (marytts/upmc-pierre-data), licence CC BY-SA 4.0.
Les voix de synthèse sont des modèles entraînés ; elles ne reproduisent pas la voix d'une personne réelle identifiable pour un usage de Raylé autre que celui d'assistante.

## Voix en ligne gratuite (facultative)

Le Worker Cloudflare peut aussi lire la voix gratuite de **Microsoft Edge** (service non officiel, sans clé : `fr-FR-VivienneMultilingualNeural`).
Le calcul du jeton de connexion `Sec-MS-GEC` (version 2) du Worker (`worker/src/voice/edge-gec.js`, non publié) est un port de la bibliothèque libre
**edge-tts** de rany2 (https://github.com/rany2/edge-tts, LGPL-3.0). Ce service peut cesser de fonctionner si Microsoft le modifie : la voix locale est donc la voix principale.
L'ancien service payant (Azure Speech) n'est plus utilisé : son code reste en dernier recours dans le Worker, désactivé tant qu'aucune clé valide n'est présente.

## Voix du système

En secours (pendant le chargement du modèle, ou si rien d'autre ne marche), Raylé lit avec la meilleure voix française du navigateur ou de l'appareil
(Edge « Natural », Google français, Samsung / Android, Windows). Ces voix appartiennent à leurs éditeurs et ne sont pas redistribuées.

## Code de Raylé

`core/voice/normalisation-fr.js`, `voix-moteurs*.js`, `voix-panneau.js`, `app-pc/voix-locale.mjs`, `app-pc/voix/serveur-voix.py` : code de Raylé.
