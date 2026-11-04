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
