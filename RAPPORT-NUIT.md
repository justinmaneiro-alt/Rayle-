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
