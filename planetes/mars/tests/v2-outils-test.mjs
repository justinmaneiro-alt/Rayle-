// Tests de l'inventaire des outils du terminal (V2, phase 6).  Lancer :  node planetes/mars/tests/v2-outils-test.mjs
import fs from 'node:fs';
import { OUTILS, trouverOutil, expliquerOutil, categories, documentMarkdown, contexteAgents, parId } from '../pc/agents-v2/outils-terminal.js';
import { PANNEAUX_TERMINAL } from '../pc/trading/groupes-terminal.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

v('identifiants uniques', new Set(OUTILS.map(x => x.id)).size === OUTILS.length);
v('chaque fiche est complète (nom, où, sert, lit, contrôle, alias)', OUTILS.every(x => x.nom && x.ou && x.sert && x.lit && x.controle && x.alias.length > 0), OUTILS.filter(x => !(x.nom && x.ou && x.sert && x.lit && x.controle && x.alias.length)).map(x => x.id).join());
const manquants = PANNEAUX_TERMINAL.filter(p => !parId(p.id));
v('chacun des ' + PANNEAUX_TERMINAL.length + ' panneaux du terminal de Mars a sa fiche', manquants.length === 0, manquants.map(p => p.id).join());
v('les 16 onglets du poste de l’agent sont couverts (au moins 11 fiches « poste- »)', OUTILS.filter(x => /^poste-/.test(x.id)).length >= 11);
v('le terminal Jarvis (accueil, sources en direct, bureau) est couvert', ['accueil-heure', 'accueil-meteo', 'accueil-actus', 'accueil-agent', 'accueil-marche', 'accueil-terre', 'sources-direct', 'bureau-accueil'].every(parId));
v('les agents prêts et la lecture du marché sont couverts', !!parId('agents-prets') && !!parId('lecture-marche'));
v('catégories lisibles', categories().length >= 8 && categories().every(c => c.length > 3));
// honnêteté : les limites des sources sont écrites
v('le volume de l’or est dit PROXY', /PROXY/.test(parId('graphique-or').lit));
v('le COT est dit DIFFÉRÉ', /DIFFÉRÉES/.test(parId('cot').lit));
v('« aucun ordre » est écrit', /aucun ordre|JAMAIS d’ordre|ne passe aucun/i.test(documentMarkdown()));
v('la capture dit qu’elle part vers Gemini à la demande', /Gemini/.test(parId('poste-capture').lit) && /à la demande/.test(parId('poste-capture').lit));

// ── retrouver un outil par une phrase ──
const cas = [['à quoi sert le gardien prop ?', 'gardien-prop'], ['explique le COT', 'cot'], ['c’est quoi le calendrier économique', 'calendrier'], ['à quoi sert le RSI', 'graphique-indicateurs'], ['explique-moi l’agent BTC', 'agent-btc'],
  ['à quoi sert le dashboard analytique', 'dashboard'], ['explique les corrélations', 'correlations'], ['à quoi servent les banques centrales', 'banques'], ['explique le journal et le tilt', 'journal-tilt'], ['à quoi sert la watchlist', 'marche'],
  ['qu’est-ce que les sources en direct', 'sources-direct'], ['explique les agents prêts', 'agents-prets'], ['à quoi sert le bureau', 'bureau-accueil'], ['à quoi sert la probabilité de réussite', 'proba-evaluation']];
for (const [phrase, id] of cas) { const r = trouverOutil(phrase); v('« ' + phrase + ' » → ' + id, r && r.outil.id === id, r ? r.outil.id : 'aucun'); }
const inconnu = expliquerOutil('à quoi sert le frigo magique'); v('outil inconnu : réponse honnête qui propose les catégories', inconnu.ok === false && /Je ne connais pas/.test(inconnu.texte) && /Graphiques/.test(inconnu.texte));
const rep = expliquerOutil('à quoi sert le gardien prop ?');
v('réponse vocale : nom, à quoi ça sert, données lues, commande, limite', rep.ok && /Gardien prop/.test(rep.texte) && /Il lit/.test(rep.texte) && /Pour le contrôler/.test(rep.texte) && /Attention/.test(rep.texte));
v('réponse vocale : pas de markdown ni d’émoji (Raylé parle)', !/[*#_`]|[\u{1F300}-\u{1FAFF}]/u.test(rep.texte), rep.texte);
v('contexte pour les agents : une ligne qui nomme tous les outils', OUTILS.every(x => contexteAgents().includes(x.nom)));
v('document Markdown : un titre par catégorie, une section par outil', categories().every(c => documentMarkdown().includes('## ' + c)) && OUTILS.every(x => documentMarkdown().includes('### ' + x.nom)));
// le document du dépôt est à jour (généré)
const chemin = new URL('../../../docs/OUTILS_TERMINAL.md', import.meta.url);
if (fs.existsSync(chemin)) v('docs/OUTILS_TERMINAL.md est à jour (relancer v2-generer-outils.mjs sinon)', fs.readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n') === documentMarkdown().replace(/\r\n/g, '\n') + '\n' || fs.readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n').trim() === documentMarkdown().trim());
else console.log('  (docs/OUTILS_TERMINAL.md pas encore généré)');
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
