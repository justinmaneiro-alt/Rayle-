// Rayle Veilleur - stockage du pilote de l'agent BTC (M5) dans un fichier : %LOCALAPPDATA%\Rayle\veilleur\pilote.json.
// Deux écrivains possibles (le processus « chercheur » et les routes locales appelées par la page) : toute modification passe par modifier(), qui prend un VERROU (création exclusive d'un fichier),
// relit l'état le plus récent, applique la modification, réécrit atomiquement (fichier temporaire puis renommage) et libère le verrou. Un verrou abandonné depuis plus de 60 s est ignoré.
// Jamais de secret dans ce fichier (pas de jeton Telegram ni de clé : ils restent dans config.local.json).
import fs from 'node:fs';
import path from 'node:path';
import { creerPilote, etatPiloteVide } from '../../planetes/mars/pc/agent-btc/pilote-coeur.js';

const attendre = ms => new Promise(r => setTimeout(r, ms));
/* M6 : une paire = un fichier (pilote.json pour BTC, pilote-sol.json, pilote-doge.json). `jugerAlerte(alerte)` : le gardien prop (état global du compte) juge chaque alerte d'ENTRÉE. */
export const nomPilote = paire => (!paire || paire === 'BTC' ? 'pilote' : 'pilote-' + String(paire).toLowerCase());
export function stockagePilote(dossier, { maintenant = () => Date.now(), paire = 'BTC', jugerAlerte = null } = {}) {
  fs.mkdirSync(dossier, { recursive: true });
  const nom = nomPilote(paire), fichier = path.join(dossier, nom + '.json'), verrou = path.join(dossier, nom + '.verrou');
  const lire = () => { try { return JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch (e) { return null; } };
  const ecrire = etat => { const tmp = fichier + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(etat)); fs.renameSync(tmp, fichier); };
  async function prendreVerrou() {
    for (let essai = 0; essai < 300; essai++) {
      try { const fd = fs.openSync(verrou, 'wx'); fs.writeSync(fd, String(process.pid)); fs.closeSync(fd); return; }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        try { if (maintenant() - fs.statSync(verrou).mtimeMs > 60000) fs.unlinkSync(verrou); } catch (x) { /* un autre vient de le libérer */ }
        await attendre(40);
      }
    }
    throw new Error('verrou du pilote impossible à prendre');
  }
  const libererVerrou = () => { try { fs.unlinkSync(verrou); } catch (e) { /* déjà libéré */ } };
  /* fn(pilote) peut être asynchrone mais DOIT rester courte (pas de calcul de recherche ici : voir preparerTranche / integrerTranche). */
  async function modifier(fn) {
    await prendreVerrou();
    try {
      const etat = lire() || etatPiloteVide(maintenant(), paire), p = creerPilote({ etat, maintenant, paire, jugerAlerte }), r = await fn(p);
      const e = p.etat(); e.rev = (e.rev || 0) + 1; e.misAJourLe = maintenant(); ecrire(e); return r;
    } finally { libererVerrou(); }
  }
  /* Adoption d'un état complet venant de la page : seulement s'il n'y a pas encore d'état (rend true si écrit). */
  async function adopterSiAbsent(nouvelEtat) {
    await prendreVerrou();
    try { if (lire()) return false; ecrire({ ...nouvelEtat, rev: 1, misAJourLe: maintenant() }); return true; } finally { libererVerrou(); }
  }
  /* Lecture sans verrou (le renommage est atomique : on lit toujours un fichier complet). */
  const etat = () => lire();
  return { modifier, adopterSiAbsent, etat, fichier, existe: () => fs.existsSync(fichier) };
}
