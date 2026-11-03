# Audit Kepler V8

Généré le 03/11/2026 08:18:39 par `node tools/audit-kepler.mjs --backtest`. **Simulation uniquement : aucun ordre réel.**

## Règles de l’audit

- Bougies **Kraken M15** réelles (API publique, 720 dernières bougies, ≈ 7,5 jours) : tous les trades du registre sont dans cette fenêtre.
- L’entrée n’est remplie que si une bougie a **réellement touché** le prix d’entrée avant la fin de validité ; si l’objectif est atteint avant, l’ordre est annulé.
- Stop et objectif dans la même bougie : **le stop compte** (dans la bougie du remplissage, seul le stop peut sortir).
- Frais et glissement inclus (réglage de coûts de l’agent) ; un seul objectif (celui de la fiche « À COPIER ») ; 24 h au plus, puis sortie à la clôture.
- Les moteurs gardaient une gestion plus favorable (sortie partielle à l’objectif 1, stop remonté à l’entrée, objectif 2) et des entrées « H1 » horodatées à l’heure ronde : l’audit applique ce que l’on peut réellement recopier chez le courtier.

## Avant / après (même module de calcul, risque 1,00 % par trade, prix Kraken du moment pour le flottant)

| | Avant audit | Après audit |
|---|---|---|
| Trades clôturés | 23 | 22 |
| Gagnants / perdants | 13 / 10 | 10 / 12 |
| Réussite | 56,5 % | 45,5 % |
| R moyen (frais inclus) | +0,655 | +0,418 |
| IC 95 % du R moyen | −0,101 … +1,410 | −0,321 … +1,158 |
| Cumul | +15,062 R | +9,205 R |
| Réalisé | +1 576,90 $ | +926,53 $ |
| Flottant | +1 167,25 $ | +81,95 $ |
| Capital | 12 744,15 $ | 11 008,48 $ |
| Baisse max | 6,04 % | 7,21 % |
| Positions ouvertes / en attente | 3 / 1 | 1 / 1 |
| Annulées | 9 | 12 |

## Trades modifiés et pourquoi

| Trade | Actif | Sens | Avant | Après | Pourquoi |
|---|---|---|---|---|---|
| `BTC|cassure_retest|-1|1793377800000` | BTC | vente | annulee (sortie 30/10 20:00) | annulee (sortie 30/10 19:30) | objectif atteint sans que l’entrée soit touchée |
| `BTC|repli_tendance|-1|1793377800000` | BTC | vente | annulee (sortie 30/10 20:00) | annulee (sortie 30/10 19:30) | objectif atteint sans que l’entrée soit touchée |
| `DOGE|cassure_retest|-1|1793377800000` | DOGE | vente | annulee (sortie 30/10 20:00) | annulee (sortie 30/10 19:30) | objectif atteint sans que l’entrée soit touchée |
| `DOGE|repli_tendance|-1|1793377800000` | DOGE | vente | annulee (sortie 30/10 20:00) | annulee (sortie 30/10 19:30) | objectif atteint sans que l’entrée soit touchée |
| `SOL|repli_tendance|-1|1793377800000` | SOL | vente | annulee (sortie 30/10 19:45) | annulee (sortie 30/10 19:15) | objectif atteint sans que l’entrée soit touchée |
| `SOL|balayage_reprise|1|1793385000000` | SOL | achat | cloturee +4,27 R (sortie 31/10 02:00) | cloturee −1,24 R (sortie 30/10 19:45) | stop touché dans la bougie du remplissage |
| `BTC|balayage_reprise|1|1793387700000` | BTC | achat | cloturee +2,96 R (sortie 01/11 20:45) | cloturee +1,84 R (sortie 31/10 20:30) | durée maximale (24 h) : sortie à la clôture |
| `DOGE|balayage_reprise|1|1793387700000` | DOGE | achat | cloturee +0,25 R (sortie 01/11 20:45) | cloturee +1,85 R (sortie 31/10 20:30) | durée maximale (24 h) : sortie à la clôture |
| `SOL|repli_tendance|-1|1793387700000` | SOL | vente | cloturee −1,17 R (sortie 31/10 00:45) | cloturee −1,17 R (sortie 31/10 01:00) | stop touché |
| `DOGE|repli_tendance|-1|1793407500000` | DOGE | vente | annulee (sortie 31/10 06:15) | annulee (sortie 31/10 06:00) | entrée jamais touchée avant la fin de validité |
| `SOL|balayage_reprise|-1|1793408400000` | SOL | vente | cloturee +1,72 R (sortie 01/11 02:30) | cloturee +1,82 R (sortie 01/11 02:30) | durée maximale (24 h) : sortie à la clôture |
| `SOL|cassure_retest|-1|1793408400000` | SOL | vente | cloturee +1,49 R (sortie 01/11 02:45) | annulee (sortie 31/10 06:15) | entrée jamais touchée avant la fin de validité |
| `BTC|repli_tendance|-1|1793425500000` | BTC | vente | cloturee −1,19 R (sortie 01/11 03:15) | cloturee −1,19 R (sortie 01/11 07:00) | stop touché |
| `DOGE|balayage_reprise|1|1793435400000` | DOGE | achat | cloturee +0,79 R (sortie 02/11 10:00) | cloturee +1,86 R (sortie 01/11 09:45) | durée maximale (24 h) : sortie à la clôture |
| `BTC|balayage_reprise|-1|1793499300000` | BTC | vente | cloturee −1,19 R (sortie 01/11 10:00) | cloturee −1,19 R (sortie 02/11 00:30) | stop touché |
| `SOL|repli_tendance|-1|1793501100000` | SOL | vente | cloturee +1,99 R (sortie 02/11 04:15) | cloturee +3,17 R (sortie 01/11 20:00) | objectif touché |
| `SOL|balayage_reprise|-1|1793513700000` | SOL | vente | cloturee +1,84 R (sortie 02/11 04:45) | annulee (sortie 01/11 11:30) | entrée jamais touchée avant la fin de validité |
| `SOL|cassure_retest|-1|1793513700000` | SOL | vente | cloturee +1,87 R (sortie 02/11 04:45) | annulee (sortie 01/11 11:30) | entrée jamais touchée avant la fin de validité |
| `BTC|balayage_reprise|1|1793535300000` | BTC | achat | cloturee +0,90 R (sortie 02/11 12:45) | cloturee −0,40 R (sortie 02/11 13:30) | durée maximale (24 h) : sortie à la clôture |
| `DOGE|repli_tendance|-1|1793565000000` | DOGE | vente | annulee (sortie 01/11 23:30) | annulee (sortie 01/11 23:15) | objectif atteint sans que l’entrée soit touchée |
| `DOGE|balayage_reprise|1|1793572200000` | DOGE | achat | annulee (sortie 02/11 02:15) | cloturee +2,08 R (sortie 02/11 02:15) | objectif touché |
| `BTC|balayage_reprise|-1|1793574900000` | BTC | vente | cloturee −1,19 R (sortie 02/11 02:30) | cloturee −1,19 R (sortie 02/11 04:15) | stop touché |
| `DOGE|balayage_reprise|-1|1793582100000` | DOGE | vente | ouverte | cloturee +3,07 R (sortie 02/11 17:00) | objectif touché |
| `BTC|repli_tendance|1|1793583900000` | BTC | achat | cloturee −1,19 R (sortie 02/11 12:30) | cloturee −1,19 R (sortie 02/11 08:45) | stop touché |
| `SOL|acceptation_hors_valeur·H1|1793592000000` | SOL | achat | cloturee −1,07 R (sortie 02/11 17:00) | cloturee −1,07 R (sortie 02/11 16:45) | stop touché |
| `SOL|cassure_retest|-1|1793593800000` | SOL | vente | annulee (sortie 02/11 10:00) | annulee (sortie 02/11 09:45) | entrée jamais touchée avant la fin de validité |
| `BTC|acceptation_hors_valeur·H1|1793610000000` | BTC | achat | cloturee −1,10 R (sortie 02/11 17:00) | cloturee −1,10 R (sortie 02/11 16:45) | stop touché |
| `DOGE|balayage_reprise|-1|1793622600000` | DOGE | vente | ouverte | cloturee +2,04 R (sortie 02/11 17:00) | objectif touché |
| `DOGE|balayage_reprise|1|1793622600000` | DOGE | achat | cloturee −1,29 R (sortie 02/11 17:00) | cloturee −1,29 R (sortie 02/11 16:45) | stop touché |
| `BTC|balayage_reprise|1|1793625300000` | BTC | achat | cloturee −1,19 R (sortie 02/11 18:30) | cloturee −1,19 R (sortie 02/11 16:45) | stop touché |
| `SOL|balayage_reprise|1|1793625300000` | SOL | achat | cloturee −1,24 R (sortie 02/11 17:00) | cloturee −1,24 R (sortie 02/11 16:45) | stop touché |
| `SOL|balayage_reprise|-1|1793627100000` | SOL | vente | cloturee +3,18 R (sortie 02/11 19:00) | cloturee +2,42 R (sortie 02/11 16:45) | objectif touché |
| `SOL|cassure_retest|-1|1793627100000` | SOL | vente | cloturee +3,28 R (sortie 02/11 19:00) | cloturee +2,53 R (sortie 02/11 16:45) | objectif touché |
| `BTC|balayage_reprise|-1|1793628000000` | BTC | vente | cloturee +2,37 R (sortie 03/11 04:15) | annulee (sortie 02/11 16:45) | objectif atteint sans que l’entrée soit touchée |

## Vrais chiffres après audit, par stratégie et par actif

| Groupe | Trades | R moyen | IC 95 % | Réussite | Cumul |
|---|---|---|---|---|---|
| Balayage de liquidité puis reprise (sweep & reclaim) | 15 | +0,615 | −0,250 … +1,480 | 53 % | +9,23 R |
| Cassure de structure + retest dans le sens du biais | 1 | +2,530 | — | 100 % | +2,53 R |
| Repli dans la tendance vers VWAP / POC / zone de volume | 4 | −0,096 | −2,230 … +2,037 | 25 % | −0,38 R |
| Acceptation hors de la zone de valeur | 2 | −1,084 | −1,122 … −1,047 | 0 % | −2,17 R |
| DOGE | 6 | +1,602 | +0,410 … +2,794 | 83 % | +9,61 R |
| SOL | 8 | +0,653 | −0,728 … +2,035 | 50 % | +5,23 R |
| BTC | 8 | −0,704 | −1,441 … +0,032 | 13 % | −5,63 R |

**Avec 22 trades clôturés, aucun verdict n’est possible** : la fourchette à 95 % est beaucoup trop large. Le résultat positif peut être du hasard.

## Backtest V8 des stratégies existantes (entrées M15, contexte H1, frais inclus)

Données Binance M15 (12 derniers mois ; HYPE : 2 mois, historique court). Seuls les **40 % de trades les plus récents** sont comptés (« hors apprentissage »). Limite honnête : les règles ont été écrites en 2026 en regardant le passé, donc aucune période n’est parfaitement « jamais vue ». Mêmes frais que l’audit, gestion du moteur (sortie partielle).

| Stratégie | Trades hors apprentissage | R moyen | IC 95 % | Réussite | Prouvée ? |
|---|---|---|---|---|---|
| Balayage de liquidité puis reprise (sweep & reclaim) | 603 | −0,031 | −0,170 … +0,108 | 35 % | non |
| Rebond de fin de mouvement (épuisement) | 73 | −0,409 | −0,709 … −0,110 | 29 % | non |
| Cassure de structure + retest dans le sens du biais | 250 | −0,174 | −0,379 … +0,032 | 32 % | non |
| Repli dans la tendance vers VWAP / POC / zone de volume | 277 | −0,311 | −0,489 … −0,133 | 29 % | non |
| Acceptation hors de la zone de valeur (signal H1, entrée M15) | 358 | +0,091 | −0,022 … +0,204 | 50 % | non |
| Impulsion portée par le volume (signal H1, entrée M15) | 388 | −0,037 | −0,162 … +0,089 | 43 % | non |
| Impulsion portée par le volume (signal M15, entrée M15) | 1060 | −0,168 | −0,255 … −0,081 | 33 % | non |

| Actif | Trades | R moyen | IC 95 % | Période |
|---|---|---|---|---|
| HYPE | 29 | −0,040 | −0,852 … +0,772 | 2026-10-22 → 2026-11-03 |
| ETH | 290 | −0,178 | −0,367 … +0,010 | 2026-06-19 → 2026-11-03 |
| SOL | 1120 | −0,056 | −0,141 … +0,028 | 2026-06-14 → 2026-11-03 |
| BTC | 578 | −0,165 | −0,284 … −0,046 | 2026-06-23 → 2026-11-03 |
| DOGE | 992 | −0,127 | −0,218 … −0,037 | 2026-06-18 → 2026-11-03 |

Ensemble : 3009 trades, R moyen −0,112 (IC 95 % −0,165 … −0,059).

**Aucune stratégie n’est prouvée rentable** (aucune fourchette à 95 % entièrement au-dessus de zéro). L’interface l’affiche dans le « Verdict honnête ».

Stratégies de volume (1806 trades hors apprentissage) : signal détecté sur H1 (contexte), entrée et sortie jouées sur les bougies M15, sur l’historique des transactions installé : BTC de 2025-10-31 à 2026-10-31 ; ETH historique des transactions absent : non testé ; SOL de 2023-10-31 à 2026-10-31 ; HYPE historique des transactions absent : non testé ; DOGE de 2023-10-31 à 2026-10-31. La recherche quotidienne du service (onglet « Positions d’avant ») utilise encore son propre rejeu H1 : ses chiffres ne sont PAS ceux du verdict.
