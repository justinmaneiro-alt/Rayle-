import { decoderEnregistrement } from './format-profondeur.js';

/* Stockage EN MÉMOIRE (V4, phase 4) : même interface que le stockage de fichiers du PC (agent-pc/flux/stockage-flux.mjs) pour ce qu'utilise l'enregistreur, mais sans disque : c'est le mode DIRECT du
   navigateur (tablette, téléphone, PC sans service). Tampons circulaires : on garde `dureeS` secondes de profondeur et `maxLignes` lignes par type. Rien n'est conservé après fermeture de la page :
   « direct seulement, pas d'historique ». */
export function creerStockageMemoire({ dureeS = 2400, maxLignes = 20000 } = {}) {
  const profondeur = new Map(), lignes = new Map(); let trous = [], entetes = new Map();
  return {
    ecrireProfondeur(cle, tMs, octets, entete) {
      let l = profondeur.get(cle); if (!l) profondeur.set(cle, l = []); entetes.set(cle, entete);
      l.push(decoderEnregistrement(octets, entete)); if (l.length > dureeS) l.splice(0, l.length - dureeS); return [];
    },
    ecrireLigne(type, cle, tMs, objet) { const k = type + '|' + cle; let l = lignes.get(k); if (!l) lignes.set(k, l = []); l.push(objet); if (l.length > maxLignes) l.splice(0, l.length - maxLignes); return []; },
    ecrireAgg1m() { return true; },
    noterTrou(t) { trous.push(t); if (trous.length > 200) trous.shift(); },
    vider() { return []; },
    lireProfondeur(cle, t0, t1) { const l = profondeur.get(cle) || []; return { entete: entetes.get(cle) || null, enregistrements: l.filter(r => r.tSec * 1000 >= t0 && r.tSec * 1000 <= t1) }; },
    lireLignes(type, cle, t0, t1) { return (lignes.get(type + '|' + cle) || []).filter(o => o.t >= t0 && o.t <= t1); },
    lireTrous: () => trous.slice(),
    taille: () => [...profondeur.values()].reduce((a, l) => a + l.length, 0)
  };
}
