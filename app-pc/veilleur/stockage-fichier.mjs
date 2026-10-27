// Rayle Veilleur - stockage sur disque, meme interface que le stockage IndexedDB de l'agent (lire, ecrire, supprimer, vider, liste).
// Les blocs contiennent des tableaux types : on les ecrit avec v8.serialize (aucune dependance). Un fichier par cle, dans <dossier>/blocs.
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';

const nomFichier = cle => encodeURIComponent(cle).replace(/%/g, '_') + '.bin';
export function stockageFichier(dossier) {
  const rep = path.join(dossier, 'blocs');
  fs.mkdirSync(rep, { recursive: true });
  const chemin = cle => path.join(rep, nomFichier(cle));
  return {
    type: 'fichier',
    lire: async cle => { try { return v8.deserialize(fs.readFileSync(chemin(cle))); } catch (e) { return null; } },
    ecrire: async (cle, valeur) => {
      const f = chemin(cle), tmp = f + '.tmp';
      fs.writeFileSync(tmp, v8.serialize({ ...valeur, cle })); fs.renameSync(tmp, f);   // ecriture atomique : jamais de fichier a moitie ecrit
    },
    supprimer: async cle => { try { fs.unlinkSync(chemin(cle)); } catch (e) { /* absent */ } },
    vider: async () => { for (const f of fs.readdirSync(rep)) { try { fs.unlinkSync(path.join(rep, f)); } catch (e) { /* tant pis */ } } },
    liste: async () => fs.readdirSync(rep).filter(f => f.endsWith('.bin')).map(f => decodeURIComponent(f.slice(0, -4).replace(/_/g, '%')))
  };
}
