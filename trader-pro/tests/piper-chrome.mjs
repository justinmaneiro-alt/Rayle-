/* v9 phase 2 : Piper local dans Chrome. Télécharge le modèle (une fois), synthétise, mesure, vérifie le cache. Usage : node trader-pro/tests/piper-chrome.mjs [pc|tablette|tel] [voix] */
import { lancer, w } from './aide-chrome.mjs';
const T = await lancer(process.argv[2] || 'pc', { dossierCaptures: 'donnees-privees/captures-v9' }), { p, verif, fin } = T;
const id = process.argv[3] || 'piper-siwis';
const r = await p.evaluate(async id => {
  const t0 = performance.now(); try { await PiperLocal.charger(id); } catch (e) { return { erreur: String(e.message || e) }; }
  const tCharge = Math.round(performance.now() - t0);
  const a = await PiperLocal.synth(id, 'Bonjour, je suis Rayle. L’or se tient au-dessus de sa moyenne mobile.', {});
  const b = await PiperLocal.synth(id, 'Voici une seconde phrase.', { vitesse: 1.2 });
  return { tCharge, ms1: a.ms, c1: a.chrono, c2: b.chrono, ms2: b.ms, taille: a.blob.size, taille2: b.blob.size, etat: PiperLocal.etat(id) };
}, id);
console.log(JSON.stringify(r));
verif(!r.erreur, 'Piper ' + id + ' : ' + (r.erreur || 'ok'));
verif(r.taille > 20000, 'audio non vide (' + r.taille + ' octets)'); verif(r.taille2 < r.taille, 'phrase plus courte, audio plus court');
await fin();
