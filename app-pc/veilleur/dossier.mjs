// Rayle Veilleur - dossier des donnees (hors depot git) : %LOCALAPPDATA%\Rayle\veilleur  (RAYLE_VEILLEUR_DOSSIER pour les tests).
import path from 'node:path';
import os from 'node:os';
export const dossierVeilleur = (env = process.env) => env.RAYLE_VEILLEUR_DOSSIER || path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Rayle', 'veilleur');
