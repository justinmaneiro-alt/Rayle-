# Rapport du retrait des agents de trading (2026-11-03)

## Sauvegardes (faites avant tout changement)
- Tag `avant-retrait-agents` et branche `archive-agents` (état complet, commit `07ade97`), poussés sur GitHub.
- Zip complet : `C:\Users\justi\Sauvegardes-Rayle\rayle-avant-retrait-2026-11-03.zip` (contient `worker/`, absent de git).
- Export Worker : `idees/agents-trading/donnees/worker-export/` (`wrangler.toml`, crons, `package.json`). **Noms des secrets : la liste renvoyée par Cloudflare était vide** (voir « À surveiller »).
- Export D1 : `idees/agents-trading/donnees/d1/` (15 tables : `agent_*` et `kepler_registre`, plus les schémas). Aucune table ni donnée supprimée.

## Ce qui est parti dans `idees/agents-trading/` (git mv, code non modifié)
Service Kepler (`agent-pc/`), `strategies/`, `outils-positions/`, audit, rapports V8, poste Agent et moteurs de Mars (`agent-*`, `agents-v2`, `outils-agent`, 30 fichiers de `trading/`), écran Agents du mobile, Veilleur, volume-vivant, portefeuille partagé, routes `/__agent` `/__flux` `/__veilleur`, code Worker `src/agent` + `idee-agent`/`capture-agent` (copie locale : `worker/` n'est pas dans git), ~110 tests, crédits et plans liés. `README.md` (remise en place) et `INVENTAIRE.md` y sont. Le dossier est dans `.gitignore` : il n'est plus suivi ni publié ; le contenu est dans `archive-agents` et le zip (sauf le Worker : zip seulement).

## Ce qui reste
Terminal de Mars (graphique TradingView/Raylé, MA200, RSI, dashboard, contexte, COT, calendrier, actus, banques, taux, Nasdaq 100), terminal de la page, carte de liquidité (connexion directe), vue Marchés du téléphone/tablette (cotations + bouton Terminal), Rayle (IA, voix, Telegram, mémoire), Worker (D1, clés, terminal, Terre), note de trading manuelle (checklist, journal de Justin).

## Cas douteux et choix faits seul
1. **Carte de liquidité** : GARDÉE (carnet d'ordres en affichage). Sa bibliothèque a quitté `strategies/` pour `planetes/mars/pc/liquidite/moteur/`, avec l'enregistreur direct du navigateur. Source « service PC » et case « murs et cibles sur le graphique » retirées (elles dépendaient du service).
2. **volume-vivant** (volume net, empreinte, carnet) : RETIRÉ, car nourri uniquement par la vue Kepler (positions, trades rejoués). Le volume du graphique/terminal reste.
3. **Bureau de Mars** : étiquette, ordre vocal et grammaire retirés ; la partie ouest 3D de la base reste comme décor muet (le code 3D est partagé).
4. **Explications parlées du terminal** (`outils-terminal`, concepts de microstructure) : RETIRÉES, elles étaient construites par l'agent.
5. **Telegram du Worker** : conservé tel quel (types d'alerte inchangés, testé) ; le pont lui-même reste.
6. **Table `agent_budget`** : GARDÉE, c'est le budget D1 du Worker.
7. **`terminal/trading.js`** (checklist avant trade, journal) : GARDÉ, notes manuelles de Justin.
8. **CREDITS.md** : la section des projets d'idées de l'agent a été copiée dans `idees/` puis retirée.
9. Aucune « décision » ne m'a bloqué : pour chaque doute j'ai appliqué « si ça décide ou simule, on retire ».

## Mots restants hors `idees/` (justifiés)
- « agent » = l'agent de conversation de Rayle (outils, `core/intelligence/agent.js`, Worker `intelligence/agent.js`), les agents de code de Jupiter, les « agents » de planète des manifestes : rien à voir avec le trading.
- « simulé » : heure solaire simulée de Mars, amplitude/date simulées, état d'affichage générique « SIMULÉ » des panneaux ; « stratégie » : textes d'anatomie, outils génériques ; « Agent » dans `CLAUDE.md` : note de retrait ajoutée, sections historiques conservées.
- `tests-navigateur/` : plusieurs anciens tests Chrome mentionnent encore des agents (mock mobile, parcours) ; non réécrits.

## Vérifications
- Tests Node restants : tous passent (`npm run test:lppr test:gestes test:v10 test:v7b test:v11 test:liquidite`, plus `galaxie/tests`, `planetes/*/tests`), sauf `mouvements2-geometrie` (anatomie, très long, sans lien) non rejoué en entier.
- Chrome (`tests-navigateur/retrait-agents-test.mjs`) : PC 1600 px, tablette, téléphone 384 px : 20/20 (aucune erreur console, aucun 404, aucun mot d'agent, Terminal s'ouvre). `retrait-agents-mars.mjs` : terminal de Mars 3/3. Seul 404 : `calendar.json`, qui existait déjà avant.
- Captures avant/après dans `captures-retrait/avant` et `captures-retrait/apres` (ignorées par git).
- Test Chrome `mars-trading-test.mjs` : non remis à jour (il échouait déjà avant, voir les notes de CLAUDE.md) ; plusieurs anciens tests Chrome citant l'agent restent à relire.

## Service Kepler
Ce n'était pas un service Windows mais un processus Node lancé au démarrage par un raccourci. **Arrêté** (service, enregistreur de flux, 3 processus), démarrage automatique **désactivé** (raccourci `Rayle Agent.lnk` déplacé dans `idees/agents-trading/demarrage-windows/`), rien désinstallé. Aucune commande administrateur nécessaire. Remise : voir le README de `idees/agents-trading`.

## Publication
Commit `cdacbc0` fusionné dans `main` ; `main`, `archive-agents` et le tag poussés. **Worker NON déployé** : le Worker en ligne n'a aucune modification à subir pour fonctionner (les routes `/agent/*` y répondent simplement sans que le front les appelle) et déployer comporte un risque connu (effacement des secrets, 2026-11-02 et 11-03). Quand tu voudras le mettre à jour : `cd worker` puis `npx.cmd wrangler deploy --config wrangler.toml`, puis vérifier `/ping`.

## À surveiller
- `wrangler secret list` renvoie une liste VIDE : les secrets du Worker semblent effacés (cf. incident du 11-03). À vérifier dans le tableau Cloudflare avant toute utilisation du chat.
- Le `wrangler.jsonc` de la racine (non suivi par git) reste dangereux : ne pas l'utiliser pour déployer.
- Le dossier `worker/` n'est pas dans git : sa sauvegarde est le zip et `idees/`.
