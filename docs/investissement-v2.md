# Investissement v2 — univers XTB et modèle multi-facteurs par horizon

Document de travail de la refonte (2026-11-19). Phase 0 (audit), décisions prises en autonomie, sources, limites, ce qui n'a pas pu être fait.

## 1. Phase 0 — Architecture avant la refonte (v1)

- **Fenêtre** : `trader-pro/invest/fenetre.js` (ouverte par `core/commun/application.js`, id `invest`). Onglets Entreprises / Ma liste / Autres actifs / Méthode, tableau paginé (50 lignes), fiche d'une entreprise.
- **Univers** : `univers.js` généré — 503 sociétés du S&P 500 (avec numéro CIK) + 40 du CAC 40 = 543. Aucune société hors États-Unis n'avait de fondamentaux.
- **Calcul** : `valeur.js` (module pur) — DCF 10 ans sur flux libres, multiples historiques (PER, EV/EBITDA, rendement FCF), formule de Graham ; valeur retenue = médiane des trois ; verdict PAS CHÈRE / PRIX JUSTE / CHÈRE selon la marge de sécurité ; note de qualité /10 (Piotroski, ROIC, ROE, marge, endettement, croissance, Altman). `sources.js` : SEC EDGAR (companyfacts) + Yahoo « chart » (prix, splits). `calcul.js` assemble.
- **Quand les données sont produites** : le cron du Worker Cloudflare (`trader-pro/worker/src/long-terme.js`, toutes les 5 minutes) recalculait 3 entreprises par passage, stockage D1 (clés `lt:…`) ; le script `outils-donnees/lt-calcul.mjs` produisait un calcul complet embarqué dans `trader-pro/invest/donnees/` (6,5 Mo, 543 fiches). D'où « calcul il y a 25 h » : l'âge de la ligne la plus ancienne, le panier étant rafraîchi par petits lots.
- **Défauts constatés** : monohorizon ; univers américain/tech ; **Graham pilote le verdict** (CHTR : croissance plafonnée à 15 % → valeur 1 115 $ pour un prix de 137 $, « PAS CHÈRE +82 % » avec Altman à 0,68 et dette nette à 4,4 × l'EBITDA) ; pas de neutralité sectorielle ; pas de garde-fou.

## 2. Architecture v2

```
data/xtb-univers/*.json        catalogue (actions, etf, devises, indices, matieres, crypto, obligataire) — dans le dépôt
outils-donnees/invest/         scripts Node : compositions.mjs (Wikipédia), univers-xtb.mjs (table des marges XTB), calcul-v2.mjs (pipeline), backtest.mjs, controles.mjs
.github/workflows/invest.yml   calcul chaque nuit (GitHub Actions, gratuit) → branche orpheline « donnees-invest »
donnees-invest (branche)       manifest.json · index/<classe>.json · saison/<classe>.json · fiches/<id>.json · lite/<lettre>.json · backtest.json · fond/ (cache hebdomadaire des comptes)
trader-pro/invest/             modules purs testés : sources2, ligne, analyse-v2, technique, saison, modele, calcul-liste, alertes, voix-invest ; interface : fenetre, fiche, tableau-worker, donnees-invest
trader-pro/worker/src/long-terme.js   alertesInvest : alertes Telegram de « Ma liste » à partir des pages « lite » publiées
```

L'application ne fait que **lire** : manifeste → index des classes demandées → fiche à la demande → saisonnalité à la demande. Filtrage, tri, scores et verdicts par horizon tournent dans un **Web Worker** (repli sur le fil principal) ; la liste est **virtualisée** (hauteur de ligne fixe, ~25 lignes dans le DOM pour 2 283 actions).

## 3. Décisions prises (autonomie complète)

| Sujet | Décision | Pourquoi |
|---|---|---|
| Langage du pipeline | **Node 22**, pas Python | Python absent du poste ; tout le dépôt est en JS ; le moteur (`valeur.js`, `analyse.js`, flèches MA200) est réutilisé tel quel côté Actions. |
| Branche de publication | **`donnees-invest`** (orpheline, séparée de `donnees`) | `donnees` est republiée toutes les 15 minutes ; y mettre 90 Mo les retéléverserait à chaque passage. |
| Liste des instruments XTB | Table des marges officielle (PDF) : **2 150 symboles actions/ETF CFD exacts**, forex (69), indices (33), matières (24), cryptos (40) | xAPI fermée ; la page de spécification n'expose pas de liste exploitable (404 / rendu dynamique). |
| Actions au comptant hors table | Ajoutées si membres d'un indice du Palier A, marquées « réel (probable) », `verifie_xtb: false` | XTB annonce 7 500 actions au comptant mais ne publie pas la liste. Le symbole est déduit de la convention `TICKER.PAYS`. |
| Palier A / B | A = membre d'un indice listé (Wikipédia ; API Nasdaq pour le Nasdaq-100) ; B = autres actions de la table. Indices non lus (SBF 120, CAC Mid 60, WIG20) : tout titre XTB du pays rangé en A (« ~ ») | Pas de source gratuite fiable pour ces trois compositions. |
| PEA | « oui » si pays de cotation UE/EEE (FR, DE, ES, IT, NL, BE, PT, FI, DK, SE, PL) ; ETF : liste d'émetteurs « PEA » | Indicatif : l'éligibilité réelle dépend de l'ISIN et du siège ; à confirmer chez XTB. Affiché comme tel. |
| Fondamentaux hors États-Unis | **Séries publiques Yahoo** (`fundamentals-timeseries`), sans cookie ni « crumb » | Testées sur 20 sociétés européennes : 20/20 exploitables, 24-25 champs sur 25, **4 exercices annuels** (pas 10). Aucune alternative gratuite plus fiable trouvée. |
| Secteur / industrie | Point « search » public de Yahoo | Seule source gratuite sans crumb ; normalisés vers les 11 secteurs français de la v1. |
| Devises | Comptes convertis dans la devise de cotation au taux du jour (pence → livres) ; option d'affichage en € | Approximation signalée dans la fiche (multiples historiques). |
| Percentiles | Neutres secteur × zone (US / Europe / Autres), repli zone puis ensemble si < 8 valeurs, winsorisation 1 %/99 % | Cahier des charges. |
| Seuils de libellé | Très attractif ≥ 72, Attractif ≥ 58, Neutre ≥ 42, Peu attractif ≥ 28, sinon À éviter | Une moyenne de percentiles se concentre vers 50 : seuils resserrés. |
| Piège à valeur | Altman < 1,81 (hors financières) **ou** dette nette/EBITDA > 4 avec recul ≥ 25 % sur 12 mois → plafond « Neutre » (horizons swing, 1–3 ans, 5–10 ans), badge ⚠ | « Très négatif » défini à −25 %. Non appliqué au tactique (pas de valorisation). |
| Graham | Affiché « à titre d'information », exclu de la valeur retenue | Cahier des charges. |
| DCF | Deux étapes (5 ans à g₁, 5 ans de fondu vers g terminale ≤ 2,5 %), g₁ ≤ min(historique, 12 %), WACC = f(secteur, pays, dette) borné 6-12 %, DCF inversé par dichotomie | Hypothèses fixes écrites dans la fiche. |
| Tactique | Données **Daily/Weekly** (Yahoo ne fournit pas d'historique H4 gratuit) ; réutilise `analyserUnite` (flèches MA200 du Terminal) et `niveauxCles` | Le H4 n'est donc pas utilisé dans la fenêtre. |
| Événements (résultats < 10 jours) | Calendrier public du Nasdaq, **États-Unis seulement** | Aucune source gratuite pour l'Europe ; facteur absent (poids renormalisé) hors États-Unis. |
| Alertes | Fenêtre ouverte : annonce vocale (3 types). Worker : Telegram pour « Attractif » et MA200/support ; **fenêtre saisonnière : application seulement** | Le Worker (CPU limité) ne peut pas charger 20 ans de mensuel ; il lit des pages « lite ». |
| Noms de fichiers | `_CON.DE.json` : préfixe `_` pour les noms réservés Windows | Continental (`CON.DE`) et PRN.UK ne peuvent pas être créés sous Windows. |

## 4. Validation honnête (backtest du 2026-11-19, 1 746 actions du Palier A, quintile haut contre bas, mensuel)

Voir `backtest.json` et l'onglet Méthode. Résultats : **momentum 12-1 : t = 1,98 (significatif, poids conservé)** ; **saisonnalité : t = −1,0 (aucun signal, poids ×0,25)** ; **tendance (équivalent MA200 mensuel) : t = −1,7 (poids ×0,25)**. Conséquence assumée : sur l'échantillon testé, la saisonnalité et la tendance n'apportent rien de démontré ; leurs poids sont réduits automatiquement à chaque calcul, et l'interface le dit. Limites : biais du survivant, pas de fondamentaux historiques « à date », coûts ignorés, ≤ 20 ans.

## 5. Contrôles automatiques (Phase 6)

`node outils-donnees/invest/controles.mjs <sortie>` : effectifs par classe et par pays, aucun NaN, échantillon (LVMH, TotalEnergies, Airbus, Schneider, Air Liquide, SAP, ASML, Apple, CHTR, EUR/USD, GOLD, US100), devises et capitalisations plausibles, CHTR plafonné. Tests : `trader-pro/tests/invest-v2-test.mjs` (93), `invest-test.mjs` (91, v1 conservée pour le Worker), Chrome PC / tablette / téléphone `trader-pro/tests/invest-chrome.mjs` (32 chacun).

**Couverture publiée** : 2 283 actions (Palier A 1 746, B 537 ; États-Unis 1 300, Royaume-Uni 368, France 110, Allemagne 110, Espagne 61, Italie 54, Suède 46, Pays-Bas 40, Suisse 34, Pologne 34, Norvège 31, Danemark 27, Finlande 26, Belgique 21, Portugal 17, Tchéquie 4), 308 ETF, 67 devises, 27 indices, 20 matières premières, 34 cryptos, 9 instruments obligataires (3 CFD + références de taux).

## 6. Limites et ce qui n'a pas pu être fait

- **325 symboles du catalogue sans cours Yahoo** (titres radiés, renommés ou symbole XTB sans équivalent Yahoo) : conservés avec `donnees: false`, non analysés. Liste dans `echecs.txt`.
- **ETF : 308 au lieu de « tous »** : XTB ne publie pas la liste ; catalogue UCITS de 148 fonds écrit à la main (symboles Yahoo vérifiés au calcul, noms et ISIN non inventés) + ETF cotés présents dans la table des marges. ISIN renseigné seulement quand il est certain.
- **Comptes hors États-Unis : 4 exercices** ; historiques de multiples courts ; devises converties au taux du jour.
- **Pas de révisions d'analystes ni de surprises de résultats** (aucune source gratuite fiable) : facteur croissance limité au BPA et au chiffre d'affaires.
- **Foncières** : FFO / ANR indisponibles → modèle limité, confiance ×0,6, badge.
- **Indices** : rendement des bénéfices (médiane des membres de notre univers) moins taux 10 ans ; **pas de CAPE** (aucune source gratuite fiable). Euro Stoxx 50 : composition non lue (ses membres figurent déjà dans les indices nationaux).
- **Devises** : PPA annuelle de la Banque mondiale (décalage d'un à deux ans) ; **COT absent de cette fenêtre** (présent dans Marchés). Taux directeurs : séries OCDE de FRED quand disponibles.
- **Obligataire** : TNOTE avec prix (contrat à terme) ; BUND10Y et SCHATZ2Y sans prix gratuit → référence de taux seulement (série OCDE mensuelle, décalage d'un à deux mois).
- **Saisonnalité en table** : calculée exactement par ligne dans le Worker du navigateur dès que l'horizon swing est choisi (fichiers `saison/`, ~2 Mo).
- **Worker Cloudflare** : le code des alertes Telegram est écrit et testé, mais **son déploiement n'a pas été fait** (wrangler non connecté à ce poste) : à redéployer (`LISEZMOI.md`). Tant que ce n'est pas fait, les alertes par annonce vocale (fenêtre ouverte) fonctionnent seules.
- **Secret GitHub à ajouter** : `SEC_USER_AGENT` (nom + contact exigés par la SEC) ; sans lui le calcul utilise un identifiant générique et la SEC peut limiter le débit.
- La coupure de courant du poste pendant la session n'a abîmé aucun fichier (vérifié : 5 061 JSON valides, tous les modules passent `node --check`, tests verts).
