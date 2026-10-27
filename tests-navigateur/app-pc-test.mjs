import { execFileSync, spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { compteur, attendre } from './terre-aide.mjs';

/* Application PC : lanceur Rayle.vbs (sans console), serveur démarré/arrêté, fenêtre « app » Edge plein écran, profil persistant, micro autorisé, F11, fermeture propre.
   ATTENTION : ce test arrête le serveur local du port 8000 (puis le relance à la fin comme il était). */
const { verifier, fin } = compteur();
const RACINE = path.resolve(import.meta.dirname, '..'), VBS = path.join(RACINE, 'app-pc', 'Rayle.vbs');
const PROFIL = path.join(process.env.LOCALAPPDATA, 'Rayle', 'profil-edge'), PORT_DEBUG = 9333;
const ps = cmd => execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim();
const serveurs = () => ps("Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*serveur.mjs*' } | ForEach-Object { $_.ProcessId }").split(/\s+/).filter(Boolean).map(Number);
const procProfil = () => ps(`Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*profil-edge*' } | Measure-Object | Select-Object -ExpandProperty Count`) | 0;
const portOuvert = async () => { try { const r = await fetch('http://127.0.0.1:8000/index.html', { signal: AbortSignal.timeout(1500) }); return r.ok; } catch (e) { return false; } };
const lancer = () => spawn('wscript.exe', [VBS], { detached: true, stdio: 'ignore', env: { ...process.env, RAYLE_DEBUG_PORT: String(PORT_DEBUG) } }).unref();
async function connecter(max = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) { try { return await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT_DEBUG, defaultViewport: null }); } catch (e) { await attendre(500); } }
  return null;
}
const pagePrincipale = async nav => { for (let i = 0; i < 40; i++) { const p = (await nav.pages()).find(x => /127\.0\.0\.1:8000/.test(x.url())); if (p) return p; await attendre(300); } return null; };
const etatFenetre = async (nav, page) => { const s = await page.createCDPSession(); const { windowId } = await s.send('Browser.getWindowForTarget'); const { bounds } = await s.send('Browser.getWindowBounds', { windowId }); await s.detach(); return bounds; };
async function fermerEtAttendre(nav, serveurAttendu = false) {
  const s = await nav.target().createCDPSession(); try { await s.send('Browser.close'); } catch (e) {}
  for (let i = 0; i < 60; i++) { await attendre(1000); if ((serveurAttendu || !(await portOuvert())) && procProfil() === 0) return i + 1; }
  return -1;
}

// état de départ : le serveur de développement tourne (lancé avant) ; on retient sa commande pour le relancer à la fin
const departServeurs = serveurs();
verifier('départ : un serveur local tourne déjà (cas « déjà en marche »)', departServeurs.length === 1 && await portOuvert(), departServeurs.join(','));
fs.rmSync(path.join(process.env.LOCALAPPDATA, 'Rayle', 'profil-edge'), { recursive: true, force: true, maxRetries: 20, retryDelay: 1000 });   // premier lancement vierge
try { fs.rmSync(path.join(process.env.LOCALAPPDATA, 'Rayle', 'lancement.log')); } catch (e) {}

// ── A. serveur déjà en marche ──
lancer();
let nav = await connecter();
verifier('A. le lanceur ouvre la fenêtre d’application (Edge, port de contrôle des tests)', !!nav);
let page = await pagePrincipale(nav);
verifier('A. la page Rayle est chargée dans la fenêtre', !!page && /RAYL/.test(await page.title()), page && await page.title());
const ua = await page.evaluate(() => navigator.userAgent);
verifier('A. c’est bien Microsoft Edge (reconnaissance vocale Microsoft)', /Edg\//.test(ua), ua.slice(-40));
const vue = await page.evaluate(() => ({ sr: !!(window.SpeechRecognition || window.webkitSpeechRecognition), synth: 'speechSynthesis' in window, mic: null }));
const micEtat = await page.evaluate(async () => { try { return (await navigator.permissions.query({ name: 'microphone' })).state; } catch (e) { return 'erreur ' + e.message; } });
verifier('A. la reconnaissance vocale est disponible', vue.sr && vue.synth);
verifier('A. micro DÉJÀ autorisé (aucune question au premier lancement)', micEtat === 'granted', micEtat);
const fenetres = await nav.pages();
verifier('A. une seule fenêtre, sans barre d’adresse (mode application)', fenetres.filter(p => /127\.0\.0\.1:8000/.test(p.url())).length === 1);
let b = await etatFenetre(nav, page);
verifier('A. la fenêtre s’ouvre en plein écran', b.windowState === 'fullscreen', JSON.stringify(b));
// F11 : vraie touche envoyée à la fenêtre
const f11 = async () => { ps("$w = New-Object -ComObject WScript.Shell; [void]$w.AppActivate('RAYL')"); await attendre(1500); ps("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{F11}')"); };
await attendre(2000); await f11(); await attendre(2000); b = await etatFenetre(nav, page);
const sortie = b.windowState;
verifier('A. F11 sort du plein écran', sortie !== 'fullscreen', sortie);
await f11(); await attendre(2000); b = await etatFenetre(nav, page);
verifier('A. F11 y revient', b.windowState === 'fullscreen', b.windowState);
// instance unique
const avant = (await nav.pages()).length; lancer(); await attendre(5000);
verifier('A. un second clic sur le raccourci n’ouvre pas une deuxième fenêtre', (await nav.pages()).length === avant);
// profil persistant
await page.evaluate(() => { localStorage.setItem('rayle_essai_profil', 'garde'); });
// le Worker normal : le profil n'utilise pas le mini-Worker local
const wurl = await page.evaluate(() => localStorage.getItem('rayle_worker_url') || '');
verifier('A. le profil de l’application n’utilise pas le mini-Worker local', !/8796/.test(wurl) && !(await page.$('#bascule-worker')), wurl || '(non configuré : à saisir une fois dans ⚙)');
const sv = serveurs();
const t = await fermerEtAttendre(nav, true);
verifier('A. fermeture : plus aucun processus du navigateur du profil (le serveur d’origine reste)', t > 0 && procProfil() === 0, 'après ' + t + ' s');
verifier('A. le serveur qui tournait déjà N’est PAS arrêté par la fermeture', serveurs().includes(departServeurs[0]) && await portOuvert());

// ── B. le lanceur démarre le serveur lui-même ──
for (const pid of serveurs()) ps(`Stop-Process -Id ${pid} -Force`);
await attendre(1000);
verifier('B. départ : plus de serveur', serveurs().length === 0 && !(await portOuvert()));
lancer();
nav = await connecter();
page = nav && await pagePrincipale(nav);
verifier('B. le lanceur démarre le serveur puis ouvre la fenêtre', !!page && await portOuvert() && serveurs().length === 1, serveurs().join(','));
const log1 = fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'Rayle', 'lancement.log'), 'utf8');
verifier('B. le journal note le démarrage du serveur', /serveur demarre/.test(log1));
const garde = await page.evaluate(() => localStorage.getItem('rayle_essai_profil'));
verifier('B. profil persistant : le réglage enregistré au lancement précédent est toujours là', garde === 'garde', garde);
const micEtat2 = await page.evaluate(async () => (await navigator.permissions.query({ name: 'microphone' })).state);
verifier('B. micro toujours autorisé', micEtat2 === 'granted', micEtat2);
const pidServeur = serveurs()[0];
const t2 = await fermerEtAttendre(nav);
verifier('B. fermeture : le serveur est arrêté et il ne reste aucun processus (ni serveur, ni navigateur du profil)', t2 > 0 && serveurs().length === 0 && procProfil() === 0 && !(await portOuvert()), `après ${t2} s ; ancien pid ${pidServeur}`);
const log2 = fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'Rayle', 'lancement.log'), 'utf8');
verifier('B. le journal note l’arrêt du serveur', /serveur arrete/.test(log2) && /fin/.test(log2));
const mutexLibre = (() => { lancer(); return true; })();
nav = await connecter(); verifier('B. relançable aussitôt après la fermeture (verrou libéré)', !!nav && mutexLibre);
if (nav) { await fermerEtAttendre(nav); try { nav.disconnect(); } catch (e) {} }

// remise en état : le serveur de développement comme avant
spawn('node.exe', ['serveur.mjs', '8000'], { cwd: RACINE, detached: true, stdio: 'ignore', windowsHide: true }).unref();
await attendre(2500);
verifier('remise en état : serveur de développement relancé', await portOuvert());
process.exit(fin() ? 1 : 0);
