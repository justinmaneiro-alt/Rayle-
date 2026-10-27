// Rayle Veilleur - programme d'arriere-plan (Node, sans fenetre quand il est lance par RayleVeilleur.vbs).
//   node app-pc/veilleur/veilleur.mjs                 demarre la surveillance (une seule instance)
//   node app-pc/veilleur/veilleur.mjs --faux-signal   passe un FAUX signal d'entree dans tout le circuit, SANS rien envoyer sur Telegram (ajouter --envoyer pour envoyer vraiment)
//   node app-pc/veilleur/veilleur.mjs --rechercher    lance la recherche de strategie sur l'historique (comme l'agent du navigateur) et garde le verdict
//   node app-pc/veilleur/veilleur.mjs --statut        affiche l'etat (sans secret)
//   node app-pc/veilleur/veilleur.mjs --arreter       demande l'arret propre
// Donnees : %LOCALAPPDATA%\Rayle\veilleur (config.local.json = adresse du Worker et jeton d'appareil : JAMAIS dans le depot, jamais affiches).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerVeilleur, fichiers } from './coeur.mjs';
import { dossierVeilleur } from './dossier.mjs';

const args = new Set(process.argv.slice(2));
const dossier = dossierVeilleur();
fs.mkdirSync(dossier, { recursive: true });
const F = fichiers(dossier);
const vivant = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const verrou = F.etat.replace('etat.json', 'verrou.pid');

if (args.has('--statut')) {
  try { const e = JSON.parse(fs.readFileSync(F.etat, 'utf8')); delete e.erreurs; console.log(JSON.stringify(e, null, 1)); } catch (x) { console.log('Le Veilleur n a jamais tourne (pas d etat).'); }
  process.exit(0);
}
if (args.has('--arreter')) { fs.writeFileSync(F.arret, String(Date.now())); console.log('Arret demande.'); process.exit(0); }

if (args.has('--faux-signal')) {
  const v = creerVeilleur({ dossier });
  const r = await v.alerteDeTest({ sansEnvoi: !args.has('--envoyer') });
  console.log('Faux signal : ' + (r.envoyer ? 'passe par le circuit (' + r.canaux.join(' + ') + ')' : 'bloque : ' + r.raison) + (args.has('--envoyer') ? '' : ' (aucun message Telegram envoye)'));
  process.exit(0);
}

if (args.has('--rechercher')) {
  const v = creerVeilleur({ dossier });
  const fich = F.reglages; if (!fs.existsSync(fich)) fs.writeFileSync(fich, JSON.stringify({ actif: false }));
  const a = await v.assurerAgent();
  console.log('Recherche en cours (quelques secondes a quelques minutes)...');
  a.lancerRecherche({ generationsMax: 2 });
  while (a.instantane().recherche.enCours) await new Promise(r => setTimeout(r, 1000));
  const i = a.instantane();
  fs.writeFileSync(F.strategie, JSON.stringify({ verdict: a._etat().verdict, coffre: a._etat().coffre, nVariantes: a._etat().nVariantes }));
  console.log('Verdict : ' + (i.verdict ? i.verdict.etat + ' - ' + i.verdict.resume : 'aucun'));
  process.exit(0);
}

// Une seule instance
try { const pid = Number(fs.readFileSync(verrou, 'utf8')); if (pid && pid !== process.pid && vivant(pid)) { console.log('Le Veilleur tourne deja (pid ' + pid + ').'); process.exit(0); } } catch (e) { /* pas de verrou */ }
fs.writeFileSync(verrou, String(process.pid));
try { fs.unlinkSync(F.arret); } catch (e) { /* rien */ }
const v = creerVeilleur({ dossier });
v.journal('Veilleur demarre (pid ' + process.pid + ')');
let fini = false, enCours = false;
const arret = () => { if (fini) return; fini = true; v.journal('Veilleur arrete'); try { v.arreter(); fs.unlinkSync(verrou); } catch (e) { /* fini */ } process.exit(0); };
process.on('SIGINT', arret); process.on('SIGTERM', arret);
process.on('uncaughtException', e => v.journal('ERREUR non geree : ' + (e && e.message)));
process.on('unhandledRejection', e => v.journal('ERREUR promesse : ' + (e && e.message)));
/* M5 : si la recherche en arrière-plan de l'agent BTC est activée (réglage du profil), le Veilleur s'assure que le « chercheur » tourne (processus séparé, priorité basse). */
let derniereVerifChercheur = 0;
async function assurerChercheur() {
  if (Date.now() - derniereVerifChercheur < 60000) return; derniereVerifChercheur = Date.now();
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dossier, 'pilote.json'), 'utf8')); if (!p.profil || !p.profil.arrierePlan || !p.profil.arrierePlan.actif) return;
    const e = JSON.parse(fs.readFileSync(path.join(dossier, 'chercheur.json'), 'utf8')).pid; if (e && vivant(e)) return;
  } catch (x) { if (!fs.existsSync(path.join(dossier, 'pilote.json'))) return; }
  try { const { spawn } = await import('node:child_process'); const ici = path.dirname(fileURLToPath(import.meta.url)); spawn(process.execPath, [path.join(ici, 'chercheur.mjs')], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); v.journal('chercheur (recherche en arriere-plan) lance'); } catch (x) { v.journal('chercheur : lancement impossible : ' + x.message); }
}
const tick = async () => {
  if (fini || enCours) return; enCours = true;
  try { if (fs.existsSync(F.arret)) return arret(); await v.cycle(); await assurerChercheur(); } catch (e) { v.journal('ERREUR cycle : ' + e.message); } finally { enCours = false; }
};
await tick();
setInterval(tick, 20000);
