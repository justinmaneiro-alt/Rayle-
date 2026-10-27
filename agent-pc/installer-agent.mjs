// Installation de l'agent sur le PC, UNE ÉTAPE À LA FOIS.   node agent-pc/installer-agent.mjs            (fait l'étape suivante et dit quoi faire ensuite)
//                                                            node agent-pc/installer-agent.mjs --etat      (où en est-on ?)
//                                                            node agent-pc/installer-agent.mjs --etape 3   (refaire une étape précise)
// Étapes : 1 vérifier le PC · 2 relier le Worker · 3 premier chargement des données (BTC, SOL, DOGE : plusieurs minutes) · 4 démarrage automatique avec Windows · 5 (facultatif) données Kraken.
// Rien n'est installé en dehors de ton dossier utilisateur ; aucun secret n'est affiché.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dossierAgent, fichiersAgent, lireConfig, lireJson, ecrireJson } from './etat-agent.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url)), dossier = dossierAgent(), F = fichiersAgent(dossier), progres = path.join(dossier, 'installation.json');
fs.mkdirSync(dossier, { recursive: true });
const faites = lireJson(progres, { etapes: {} });
const marquer = n => { faites.etapes[n] = Date.now(); ecrireJson(progres, faites); };
const ETAPES = {
  1: { nom: 'vérifier le PC', faire: async () => {
    const maj = Number(process.versions.node.split('.')[0]); const lignes = [(maj >= 20 ? 'OK' : 'KO') + '  Node.js ' + process.versions.node + ' (20 ou plus requis)'];
    let python = false; try { execFileSync('python', ['--version'], { stdio: 'pipe' }); python = true; } catch (e) { /* absent */ }
    lignes.push((python ? 'OK' : '--') + '  Python (seulement pour extraire les fichiers Kraken : facultatif)');
    let lm = false; try { const r = await fetch('http://localhost:1234/v1/models', { signal: AbortSignal.timeout(3000) }); lm = r.ok; } catch (e) { /* éteint */ }
    lignes.push((lm ? 'OK' : '--') + '  LM Studio (http://localhost:1234) : ' + (lm ? 'joignable' : 'éteint ou serveur local non démarré — l’agent écrira ses rapports avec les API gratuites ou son propre texte'));
    lignes.push('OK  dossier de l’agent : ' + dossier);
    console.log(lignes.join('\n')); return maj >= 20;
  }, ensuite: 'Étape 2 : relier le Worker de Raylé.' },
  2: { nom: 'relier le Worker', faire: async () => {
    const c = lireConfig(dossier);
    if (!c) { console.log('Je ne trouve pas l’adresse du Worker ni le jeton d’appareil.\nLe plus simple : ouvre Rayle sur ce PC, appaire l’appareil (Réglages), puis relance cette étape ; je copie la configuration du Veilleur.\nOu écris toi-même ' + F.config + ' avec {"url":"https://…","jeton":"…"} (ce fichier reste sur ton PC).'); return false; }
    try { const r = await fetch(String(c.url).replace(/\/+$/, '') + '/ping', { headers: { 'X-Rayle-Token': c.jeton }, signal: AbortSignal.timeout(8000) }); console.log(r.ok ? 'OK  Worker joint (' + c.url.replace(/^https?:\/\//, '').split('/')[0] + ').' : 'KO  le Worker répond HTTP ' + r.status); return r.ok; } catch (e) { console.log('KO  Worker injoignable : ' + e.message); return false; }
  }, ensuite: 'Étape 3 : premier chargement des données (laisse la fenêtre ouverte, ça peut durer 10 à 20 minutes).' },
  3: { nom: 'premier chargement des données', faire: async () => {
    const { creerDonnees } = await import('./donnees-agent.mjs'); const D = creerDonnees({ dossier: F.donnees, journal: m => console.log('  ' + m) });
    console.log('Téléchargement de l’historique M15 de Binance (BTC, SOL, DOGE) et des dérivés…');
    const rapport = await D.maintenirChaqueJour({ surProgres: p => process.stdout.write('\r  ' + p.paire + ' : ' + p.phase + '          ') });
    console.log('\n' + rapport.map(r => r.paire + ' : ' + (r.erreur ? 'ERREUR ' + r.erreur : r.n + ' bougies jusqu’au ' + r.jourFin + ', ' + r.trous + ' trou(s)')).join('\n')); return rapport.every(r => !r.erreur);
  }, ensuite: 'Étape 4 : démarrage automatique avec Windows.' },
  4: { nom: 'démarrage automatique', faire: async () => {
    if (process.platform !== 'win32') { console.log('Pas Windows : lance « node agent-pc/service.mjs » toi-même.'); return true; }
    const r = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ICI, 'installer-demarrage.ps1')], { encoding: 'utf8' }).trim();
    console.log('Démarrage automatique : ' + r + '. Pour démarrer tout de suite sans redémarrer Windows :'); spawn('wscript.exe', [path.join(ICI, 'RayleAgent.vbs')], { detached: true, stdio: 'ignore' }).unref(); console.log('Service lancé en arrière-plan. Vérifie avec : node agent-pc/service.mjs --statut'); return true;
  }, ensuite: 'Facultatif, étape 5 : les données de Kraken (≈ 10 Go de disque) : node agent-pc/installer-agent.mjs --etape 5' },
  5: { nom: 'données Kraken (facultatif)', faire: async () => { console.log('Je lance le téléchargement du jeu historique de Kraken (5 morceaux d’environ 2 Go, avec reprise si ça coupe).\nTu peux fermer et relancer : il reprend où il s’est arrêté.'); const r = spawn(process.execPath, [path.join(ICI, 'kraken-ohlcvt.mjs'), '--telecharger'], { stdio: 'inherit' }); return await new Promise(ok => r.on('exit', c => ok(c === 0))); }, ensuite: 'Puis : node agent-pc/kraken-ohlcvt.mjs --extraire (nécessite Python).' }
};
const args = process.argv.slice(2);
if (args.includes('--etat')) { for (const [n, e] of Object.entries(ETAPES)) console.log((faites.etapes[n] ? 'fait    ' : 'à faire ') + n + ' · ' + e.nom + (faites.etapes[n] ? ' (' + new Date(faites.etapes[n]).toISOString().slice(0, 16).replace('T', ' ') + ')' : '')); process.exit(0); }
const iE = args.indexOf('--etape'), n = iE >= 0 ? Number(args[iE + 1]) : [1, 2, 3, 4].find(k => !faites.etapes[k]);
if (!n) { console.log('Les étapes 1 à 4 sont faites. Vérifie : node agent-pc/service.mjs --statut'); process.exit(0); }
if (!ETAPES[n]) { console.log('Étape inconnue (1 à 5).'); process.exit(1); }
console.log('— Étape ' + n + ' : ' + ETAPES[n].nom + ' —');
const ok = await ETAPES[n].faire();
if (ok) { marquer(n); console.log('\nÉtape ' + n + ' faite. ' + ETAPES[n].ensuite); } else console.log('\nÉtape ' + n + ' non terminée : corrige le point ci-dessus puis relance la même commande.');
process.exit(ok ? 0 : 1);
