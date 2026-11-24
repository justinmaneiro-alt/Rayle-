---
id: sessions
mots: session, asie, londres, new york, killzone, ouverture, clôture, fixing, comex, week-end, vendredi, heure d'été, décalage
---
# Les sessions de marché

> Tout ce fichier décrit des **tendances générales, pas des règles**. Rayle s'en sert pour t'expliquer ce qu'elle voit, jamais pour décider à ta place.

## Les horaires (heure de Paris), et pourquoi ils bougent
Chaque place financière suit SON heure locale. Les heures de Paris changent donc deux fois par an, et **pas toutes en même temps** :
- États-Unis : heure d'été du 2e dimanche de mars au 1er dimanche de novembre. Europe : du dernier dimanche de mars au dernier dimanche d'octobre. Japon : jamais.
- Conséquence : environ **3 semaines en mars** et **1 semaine fin octobre / début novembre**, l'écart Paris – New York est de **5 h au lieu de 6 h**. L'ouverture du Nasdaq (9 h 30 à New York) tombe alors à **14 h 30 à Paris** au lieu de 15 h 30.

Rayle calcule les horaires à partir de l'heure locale (`trader-pro/lecture/sessions.js`), jamais avec un décalage fixe. Horaires d'un jour d'hiver commun (Paris UTC+1) :

| Repère | Heure locale | Heure de Paris (hiver) |
|---|---|---|
| Ouverture de Tokyo (début de « l'Asie ») | 9 h 00 Tokyo | 1 h 00 |
| Ouverture de Londres | 8 h 00 Londres | 9 h 00 |
| Fixing de l'or de Londres (LBMA, matin) | 10 h 30 Londres | 11 h 30 |
| Futures américains / chevauchement Londres–New York | 8 h 00 New York | 14 h 00 |
| Ouverture COMEX (or) | 8 h 20 New York | 14 h 20 |
| Ouverture cash Nasdaq / S&P 500 | 9 h 30 New York | 15 h 30 |
| Fixing de l'or de Londres (LBMA, après-midi) | 15 h 00 Londres | 16 h 00 |
| Clôture de Londres | 16 h 30 Londres | 17 h 30 |
| Clôture cash Nasdaq / S&P 500 | 16 h 00 New York | 22 h 00 |
| Fin de la session New York pour Rayle | 17 h 00 New York | 23 h 00 |

Sessions de Rayle : **Asie** (Tokyo 9 h → Londres 8 h), **Londres** (Londres 8 h → New York 8 h), **New York** (New York 8 h → 17 h), **creux du soir** (New York 17 h → Tokyo 9 h).

Sources vérifiées le 24/11/2026 : horaires NYSE 9 h 30–16 h et LSE 8 h–16 h 30 (IG, CMC Markets) ; fixing LBMA 10 h 30 et 15 h heure de Londres ([LBMA](https://www.lbma.org.uk/prices-and-data/lbma-gold-price/lbma-gold-price), [spécification IBA](https://www.ice.com/publicdocs/futures/IBA_Gold_Auction_Specification.pdf)) ; futures de l'or sur Globex du dimanche 17 h au vendredi 16 h heure de Chicago avec pause d'une heure ([CME](https://cmegroup.com/markets/metals/precious/gold.timeAndSales.html)).
**À revérifier** : CME a annoncé (avis 9766, juin 2026) le passage du contrat d'or 1 once en 24 h/24 à partir du 24/07/2026 ([avis](https://www.cmegroup.com/content/dam/cmegroup/notices/ser/2026/06/ser-9766.pdf)). Bourse de Tokyo : 9 h–15 h 30 depuis novembre 2024 (certaines sources donnent encore 15 h : à confirmer sur le site de JPX).

## Comportements typiques par session (tendances générales)
- **Asie : le range.** Souvent calme sur l'or et les indices (l'amplitude reste souvent sous la moitié de l'ATR journalier). Le haut et le bas de ce range deviennent des repères pour Londres. Exception : une annonce japonaise ou chinoise.
- **Ouverture de Londres : le balayage.** Fréquemment, le prix casse brièvement le haut OU le bas du range asiatique (il va chercher les ordres stop), puis revient dans le range et prend sa vraie direction. Rayle regarde si Londres a « balayé puis est revenu » (plutôt un piège) ou « cassé et tient » (plutôt une vraie sortie).
- **Ouverture de New York : continuation ou retournement.** Soit New York prolonge Londres (surtout les jours d'annonce dans le sens de la tendance), soit elle le retourne autour de l'ouverture cash. Aucun des deux n'est systématique ; Rayle le décrit, elle ne le prédit pas.
- **Clôture de Londres (17 h 30 Paris l'hiver)** : retournements fréquents car les gros acteurs européens débouclent leurs positions.
- **Vendredi soir et week-end** : liquidité faible. Les indices et l'or (COMEX) sont fermés ; le Bitcoin et Solana tradent 24 h/24, 7 j/7 avec un volume plus faible : mouvements plus nerveux, moins fiables, écarts d'ouverture du lundi fréquents.
- **Jours d'annonce (CPI, NFP, FOMC)** : calme relatif avant (le marché attend), mèche violente à la publication, direction souvent incertaine pendant 15 à 60 minutes puis plus claire. Rayle conseille la prudence avant, pas d'agir pendant la mèche.

## Les killzones (créneaux à forte activité)
Heures locales : **Londres 2 h – 5 h (heure de New York)**, **ouverture de Londres 8 h – 10 h (heure de Londres)**, **New York 7 h – 10 h (heure de New York)**. Ce sont les créneaux où les plus gros mouvements d'une journée commencent le plus souvent. Un mouvement hors killzone n'est pas faux, mais il est en général moins soutenu.

## Exemple réel (fiche de lecture de l'or, 24/11/2026)
Asie plutôt calme (−0,1 %, amplitude 0,7 ATR), Londres a balayé le bas du range asiatique puis est revenu dessus (+0,6 %), puis New York a retourné le mouvement de Londres avec −2,4 % (amplitude 1,1 ATR du jour) : un comportement « New York retourne Londres » **inhabituellement fort**. Rayle le dit comme un fait et rappelle que la session suivante part de ce niveau.
