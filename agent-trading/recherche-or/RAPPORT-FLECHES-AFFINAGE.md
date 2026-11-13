# Flèches Direct affinées (v7) contre Direct (stable, v6)

Série : Kraken PF_XAUUSD H1, 1440 bougies (09-14 06:00 UTC → 11-13 05:00 UTC). **Ces règles ont été choisies en regardant des exemples précis de cette série (5, 9, 10, 12 nov. et le rebond du 2 nov.) : aucune preuve de performance, aucun test hors échantillon. Outil de lecture seulement, jamais un ordre.**

## Ce qui est livré
- **« Direct »** (par défaut) = `front/or/fleches-simples-v7.js` ; **« Direct (stable) »** = la v6 inchangée (registres séparés, clés `rayle_or_*_t12` contre `_t11`). Fichiers scellés (v1, v5, v6) non touchés.
- **1. Points gris** : masqués par défaut dans « Direct » (case Couches « Points gris (raisons de blocage) », mémorisée) ; « Direct (stable) » les montre toujours comme avant.
- **2. Régime par la MA200** : codé (option `regime: true`, contre-tendance = dernière cassure MA200 confirmée de sens opposé) mais **DÉSACTIVÉ PAR DÉFAUT** : activé, il fait disparaître deux cas de contrôle (vente du 5 nov. : perdue ; vente du 9 nov. 21:00 : conservée), car une cassure haussière de la MA200 le 4 nov. 06:00 rend toute vente suivante « contre-tendance ». Avec l'option active : 13 points gris contre 3 par défaut. La règle d'origine de la v6 (MA200 en baisse sur 48 bougies + plus bas plus bas) reste donc en vigueur dans « Direct ». Exceptions (base de 8 bougies, divergence RSI, 2ᵉ touche) conservées dans les deux cas.
- **3. Anti-aller-retour (12 bougies)** : actif. 4 flèches colorées supprimées sur la série (liste ci-dessous).
- **4. Rebond après base** : actif. 4 flèches sur la série. Paramètres : chute ≥ 5 ATR en 48 bougies, base ≥ 8 bougies H1 de range ≤ 1,5 ATR sans nouvel extrême (par rapport aux 16 bougies précédentes), clôture à plus de **1 ATR** au-dessus du haut de la base (marge ajoutée après essai : sans elle, le bruit d'un week-end plat déclenche des flèches ; elle ne figurait pas dans la consigne), ATR de référence = moyenne des 48 dernières bougies (l'ATR du jour s'effondre sur un week-end plat), une par sens et par tranche de 48 bougies, cède la place à une flèche de niveau sur la même bougie ou à moins de 6 bougies. Stop 0,2 ATR sous le bas de la base (miroir : au-dessus du haut), TP1 = 1 R, TP2 = 2 R. **Choisie en regardant l'exemple du 2 novembre** (clôture de 03:00 Paris, 23:00 UTC du 1ᵉʳ → flèche à 11-02 00:00 UTC).

## Tableau avant / après (flèches colorées : vert, rouge, cyan, rebond ; hors points gris)
| | Direct (stable, v6) | Direct (affiné, v7) |
|---|---|---|
| flèches colorées | 46 | 48 |
| dont achats / ventes / MA200 / rebonds | 17 / 19 / 10 / 0 | 16 / 19 / 9 / 4 |
| points gris (contre-tendance) | 3 | 3 (masqués par défaut) |
| créées / supprimées / inchangées | | **8 créées · 6 supprimées · 40 inchangées** |

### Créées (absentes de la stable)
- 09-25 02:00 UTC · achat · rebond après base
- 09-27 23:00 UTC · vente · rebond après base
- 10-09 05:00 UTC · vente · retournement (2ᵉ touche)
- 10-15 06:00 UTC · vente · retournement
- 10-25 23:00 UTC · achat · retournement
- 11-02 00:00 UTC · achat · rebond après base
- 11-04 19:00 UTC · vente · retournement
- 11-13 02:00 UTC · achat · rebond après base

### Supprimées (présentes dans la stable)
- 09-25 05:00 UTC · vente · retournement
- 10-09 02:00 UTC · achat · retournement
- 10-15 01:00 UTC · achat · retournement
- 10-18 04:00 UTC · vente · MA200
- 11-04 17:00 UTC · vente · retournement
- 11-12 09:00 UTC · vente · retournement

### Supprimées par l'anti-aller-retour (détail)
- 10-09 02:00 UTC · achat supprimé (flèche de sens opposé de 10-08 18:00 UTC)
- 10-15 01:00 UTC · achat supprimé (flèche de sens opposé de 10-14 14:00 UTC)
- 11-04 17:00 UTC · vente supprimé (flèche de sens opposé de 11-04 06:00 UTC)
- 11-12 09:00 UTC · vente supprimé (flèche de sens opposé de 11-12 01:00 UTC)

## Cas de contrôle (tous testés dans `tests/fleches-simples-v7-test.mjs`)
| cas | résultat | détail |
|---|---|---|
| cassure MA200 baissière du 10 nov. | ✅ conservé | 11-10 17:00 UTC |
| vente rouge du 5 nov. (VAH mensuel) | ✅ conservé | 11-05 04:00 UTC |
| vente rouge du 9 nov. 21:00 (2ᵉ touche, 4 131–4 144) | ✅ conservé | 11-09 21:00 UTC |
| cassure MA200 haussière du début de rallye | ✅ conservé | 10-06 12:00 UTC, 10-10 12:00 UTC, 10-16 04:00 UTC, 10-28 01:00 UTC, 11-04 06:00 UTC |
| zéro achat coloré dans la chute du 12 nov. (6 h–19 h UTC) hors stabilisation | ✅ conservé | 0 achat(s) |
| rebond du 2 nov. (≈ 3 900) = flèche « rebond après base » | ✅ conservé | 44 bougies de base, chute de 29.3 ATR, 11-02 00:00 UTC |

## Limites honnêtes
- Une seule série de 1 440 bougies (≈ 60 jours), 10 cassures MA200 : aucune statistique possible. Les règles ont été ajustées sur ces exemples.
- Le stop d'un rebond après base sur un week-end plat est très serré en points (la base fait quelques points) : repère de lecture, pas un ordre.
- L'anti-aller-retour supprime aussi des flèches qui auraient été justes (voir la liste) : c'est le prix d'une carte moins chargée.

Capture annotée des deux versions : `outils-restructuration/captures/fleches-affinage-annotee.png`. Captures Chrome : `fleches-affinage-{1600,1024,390}.png`.
