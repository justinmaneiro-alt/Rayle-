import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* V11 : lance le VRAI Worker (workerd, via « wrangler dev --local ») avec sa vraie base D1 locale et son vrai Durable Object, pour tester la liaison temps réel de bout en bout.
   Rend { url, jeton, arreter }. Ignoré (null) si worker/ est absent (dossier ignoré par git). */
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function demarrerWorker({ port = 8799, origine = 'http://127.0.0.1:8000', jeton = 'jeton-test', vars = [] } = {}) {
  const dossier = path.join(RACINE, 'worker');
  if (!fs.existsSync(path.join(dossier, 'wrangler.toml'))) return null;
  const donnees = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-wr-'));
  const args = ['/c', 'npx.cmd', 'wrangler', 'dev', '--local', '--port', String(port), '--persist-to', donnees, '--var', 'RAYLE_TOKEN:' + jeton, 'ORIGINE:' + origine, ...vars.flatMap(v => ['--var', v])];
  const enfant = spawn('cmd', args, { cwd: dossier, stdio: 'ignore', windowsHide: true });
  const url = 'http://127.0.0.1:' + port;
  const debut = Date.now();
  for (;;) {
    try { const r = await fetch(url + '/camera/version'); if (r.ok) break; } catch (e) { /* pas encore prêt */ }
    if (Date.now() - debut > 90000) { arreterArbre(enfant.pid); throw new Error('le Worker local ne démarre pas'); }
    await new Promise(r => setTimeout(r, 500));
  }
  return { url, jeton, donnees, arreter: () => { arreterArbre(enfant.pid); try { fs.rmSync(donnees, { recursive: true, force: true }); } catch (e) { /* fichiers encore verrouillés */ } } };
}
function arreterArbre(pid) { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* déjà arrêté */ } }   // seulement le processus lancé ici et ses enfants, jamais par nom
