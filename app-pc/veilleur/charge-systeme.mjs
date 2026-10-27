// Rayle Veilleur - « est-ce que je joue ? » (M5). La recherche en arrière-plan s'arrête pendant que le PC est occupé :
//   1. un programme de jeu de la liste de l'utilisatrice est lancé (tasklist, Windows) ;
//   2. le « mode jeu » de Rayle est actif (fichier mode-jeu.flag écrit par la page) ;
//   3. le processeur est très occupé PAR AUTRE CHOSE que nous (moyenne sur les derniers relevés), ce qui couvre aussi les jeux absents de la liste.
// Aucune donnée n'est envoyée nulle part ; rien n'est lu en dehors des noms de processus et de la charge du processeur.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

export function mesureProcesseur() { let idle = 0, total = 0; for (const c of os.cpus()) { for (const k of Object.keys(c.times)) total += c.times[k]; idle += c.times.idle; } return { idle, total }; }
/* Charge entre deux relevés (0 à 1). */
export function chargeEntre(a, b) { const dt = b.total - a.total, di = b.idle - a.idle; return dt > 0 ? Math.max(0, Math.min(1, 1 - di / dt)) : 0; }

export function processusActifs() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise(resolve => execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 8000, encoding: 'utf8', maxBuffer: 4 << 20 }, (err, out) => {
    if (err) return resolve(null);
    resolve(String(out).split(/\r?\n/).map(l => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean).map(s => s.toLowerCase()));
  }));
}

export function creerDetecteurJeu({ dossier, seuilCpu = 0.65, fenetre = 4, lireProcessus = processusActifs, lireMesure = mesureProcesseur } = {}) {
  const releves = []; let precedent = lireMesure();
  const drapeau = path.join(dossier, 'mode-jeu.flag');
  /* À appeler à chaque cycle. `processusJeu` : noms de programmes (insensible à la casse, « .exe » facultatif). Rend { jeu: bool, raison }. */
  async function evaluer({ processusJeu = [], pauseDansJeu = true } = {}) {
    const m = lireMesure(); releves.push(chargeEntre(precedent, m)); precedent = m; while (releves.length > fenetre) releves.shift();
    if (!pauseDansJeu) return { jeu: false, raison: null };
    try { if (fs.existsSync(drapeau) && Date.now() - fs.statSync(drapeau).mtimeMs < 6 * 3600e3) return { jeu: true, raison: 'mode jeu de Rayle actif' }; } catch (e) { /* illisible : on ignore */ }
    const voulus = processusJeu.map(s => s.toLowerCase().replace(/\.exe$/, '')).filter(Boolean);
    if (voulus.length) { const liste = await lireProcessus(); if (liste) { const trouve = liste.find(n => voulus.includes(String(n).toLowerCase().replace(/\.exe$/, ''))); if (trouve) return { jeu: true, raison: 'programme de jeu lancé : ' + trouve }; } }
    if (releves.length >= fenetre) { const moy = releves.reduce((a, b) => a + b, 0) / releves.length; if (moy > seuilCpu) return { jeu: true, raison: 'processeur très occupé (' + Math.round(moy * 100) + ' %)' }; }
    return { jeu: false, raison: null };
  }
  return { evaluer, drapeau, releves: () => releves.slice() };
}
