// Installation du relais PC (lancée par installer.cmd, en double-clic).
// 1. Demande l'adresse du Worker et le code d'accès (utilisé une seule fois, jamais enregistré).
// 2. Appaire ce relais comme appareil « PC système » : il reçoit son propre jeton, révocable dans Raylé (Réglages > Voir les appareils).
// 3. Écrit config.json (exclu de Git) et un petit lanceur invisible dans le dossier Démarrage de Windows, puis lance le relais.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APPS_DEFAUT } from './actions.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(ICI, 'config.json'), EXEMPLE = path.join(ICI, 'config.exemple.json');
const DEMARRAGE = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const LANCEUR = path.join(DEMARRAGE, 'Rayle-relais.vbs');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('\n=== Installation du relais PC de Raylé ===\n');
let ancien = {};
try { ancien = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (e) {}
let base = {};
try { base = JSON.parse(fs.readFileSync(EXEMPLE, 'utf8')); } catch (e) {}

let worker = (await rl.question('Adresse du Worker' + (ancien.worker ? ' [' + ancien.worker + ']' : '') + ' : ')).trim() || ancien.worker || '';
worker = worker.replace(/\/+$/, '');
if (!/^https:\/\/\S+$/.test(worker)) { console.log('\n✖ Adresse invalide (elle commence par https://).'); await rl.question('Entrée pour fermer'); process.exit(1); }
const code = (await rl.question('Code d’accès de Raylé (le secret RAYLE_TOKEN, utilisé une seule fois, jamais enregistré) : ')).trim();

let r, d;
try {
  r = await fetch(worker + '/appareil/appairer', { method: 'POST', headers: { 'X-Rayle-Token': code, 'Content-Type': 'application/json' }, body: JSON.stringify({ nom: 'PC système' }) });
  d = await r.json().catch(() => ({}));
} catch (e) { console.log('\n✖ Worker injoignable : ' + e.message); await rl.question('Entrée pour fermer'); process.exit(1); }
if (!r.ok || !d.jeton) { console.log('\n✖ Appairage refusé : ' + (d.error || 'HTTP ' + r.status)); await rl.question('Entrée pour fermer'); process.exit(1); }

const config = {
  worker,
  jeton: d.jeton,
  intervalle_repos_s: ancien.intervalle_repos_s || base.intervalle_repos_s || 30,
  intervalle_actif_s: ancien.intervalle_actif_s || base.intervalle_actif_s || 5,
  apps: Object.assign({}, APPS_DEFAUT, base.apps || {}, ancien.apps || {})
};
fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2));
console.log('\n✔ Relais appairé (« ' + d.nom + ' »). Jeton enregistré dans config.json (ne le partage pas).');

// Lanceur invisible au démarrage de la session (fenêtre cachée : 0)
const q = (s) => s.replace(/"/g, '""');
const vbs = 'Set s = CreateObject("WScript.Shell")\r\ns.CurrentDirectory = "' + q(ICI) + '"\r\ns.Run """' + q(process.execPath) + '"" ""' + q(path.join(ICI, 'relais.mjs')) + '""", 0, False\r\n';
fs.mkdirSync(DEMARRAGE, { recursive: true });
fs.writeFileSync(LANCEUR, vbs);
console.log('✔ Démarrage automatique et invisible à l’ouverture de ta session : ' + LANCEUR);

spawn('wscript.exe', [LANCEUR], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
console.log('✔ Relais lancé. Son journal : ' + path.join(ICI, 'relais.log'));
console.log('\nEssaie : « Raylé, ouvre la calculatrice sur le PC ».\nPour ajouter une appli : modifie la rubrique "apps" de config.json, puis redémarre la session (ou relance installer.cmd).\n');
await rl.question('Entrée pour fermer');
rl.close();
