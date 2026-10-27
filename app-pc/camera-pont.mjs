// Pont « Caméra Rayle » (V2, phase 11) : le téléphone filme la main, calcule les 21 points DANS SON NAVIGATEUR (MediaPipe) et n'envoie à Rayle QUE ces points (jamais la vidéo).
// C'est une seconde instance de la télécommande (app-pc/telecommande.mjs) : autre jeton QR, autre code d'appairage à 6 chiffres, autre fichier d'appareils, autre liste blanche (les seuls
// messages acceptés sont des points de main valides ; un téléphone appairé ne peut déclencher AUCUNE action de la tablette). Réservé au téléphone, séparé du pad et du clavier.
// getUserMedia exige une page HTTPS : un certificat auto-signé est fabriqué à l'activation (app-pc/certificat-lan.ps1) ; le téléphone demande de l'accepter une fois.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creerTelecommande } from './telecommande.mjs';
import { adresseLocale } from './reseau-local.mjs';
await import('../core/gestes/gestes-calcul.js');

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const validerMainsPont = m => (m && m.a === 'mains' ? globalThis.GestesCalcul.validerMains(m) : null);

/* Certificat HTTPS local : réutilisé s'il existe, a la même adresse IP et a moins d'un an ; sinon refabriqué par PowerShell (Windows). */
export function certificatLocal({ dossierDonnees, ip, execPowerShell = execFile, maintenant = () => Date.now() }) {
  const dossier = dossierDonnees || path.join(os.tmpdir(), 'rayle'), pfx = path.join(dossier, 'camera-lan.pfx'), meta = path.join(dossier, 'camera-lan.json');
  return new Promise((ok, ko) => {
    try { const m = JSON.parse(fs.readFileSync(meta, 'utf8')); if (m.ip === ip && maintenant() - m.cree < 365 * 24 * 3600 * 1000 && fs.existsSync(pfx)) return ok({ pfx: fs.readFileSync(pfx), passphrase: m.mdp }); } catch (e) { /* pas de certificat : on en fabrique un */ }
    if (process.platform !== 'win32') return ko(new Error('la fabrication du certificat utilise PowerShell (Windows)'));
    fs.mkdirSync(dossier, { recursive: true });
    const mdp = crypto.randomBytes(18).toString('hex');
    execPowerShell('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(ICI, 'certificat-lan.ps1'), '-Ip', ip || '', '-Sortie', pfx, '-Mdp', mdp], { timeout: 60000, windowsHide: true }, (err, sortie, erreur) => {
      if (err || !fs.existsSync(pfx)) return ko(new Error((erreur && String(erreur).trim().slice(0, 200)) || (err && err.message) || 'certificat non créé'));
      try { fs.writeFileSync(meta, JSON.stringify({ ip, mdp, cree: maintenant() })); } catch (e) { /* le certificat sera refait au prochain démarrage */ }
      ok({ pfx: fs.readFileSync(pfx), passphrase: mdp });
    });
  });
}

export function creerPontCamera({ racine, dossierDonnees, port, ip, preparerTls = null, maintenant } = {}) {
  const assets = path.join(racine, 'assets-lourds', 'gestes');
  return creerTelecommande({
    racine, dossierDonnees, port, ip, maintenant,
    prefixe: '/camera', dossierPage: 'camera', nomCookie: 'rayle_cam', prefixeLocal: '/__cam/', fichierDonnees: 'camera.json', enteteLocal: 'x-rayle-cam',
    valideur: validerMainsPont,
    preparerTls: preparerTls === null ? () => certificatLocal({ dossierDonnees, ip: ip || adresseLocale() }) : (preparerTls === false ? null : preparerTls),
    fichiersSpeciaux: { 'gestes-calcul.js': path.join(racine, 'core', 'gestes', 'gestes-calcul.js') },
    dossiersStatiques: { vendor: assets }
  });
}
