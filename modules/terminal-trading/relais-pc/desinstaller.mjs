// Désinstallation du relais PC (lancée par desinstaller.cmd) : arrête le relais, retire le lancement au démarrage
// et efface config.json (qui contient le jeton). Pense ensuite à révoquer « PC système » dans Raylé (Réglages > Voir les appareils).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const LANCEUR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Rayle-relais.vbs');
console.log('\n=== Désinstallation du relais PC de Raylé ===\n');
try {
  const pid = Number(fs.readFileSync(path.join(ICI, 'relais.pid'), 'utf8'));
  if (pid) { process.kill(pid); console.log('✔ Relais arrêté.'); }
} catch (e) { console.log('· Le relais ne tournait pas.'); }
for (const [f, t] of [[LANCEUR, 'Démarrage automatique retiré.'], [path.join(ICI, 'config.json'), 'config.json (et son jeton) effacé.'], [path.join(ICI, 'relais.pid'), '']]) {
  try { fs.unlinkSync(f); if (t) console.log('✔ ' + t); } catch (e) {}
}
console.log('\nDernière étape : dans Raylé, ⚙ Réglages > Voir les appareils, révoque « PC système ».\n');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('Entrée pour fermer');
rl.close();
