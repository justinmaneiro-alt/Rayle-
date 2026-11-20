/* Contrôles de la nuit (v6, B2) : lit la branche « donnees » (clonée dans --entree), écrit controle-nuit.json (--sortie). Aucune écriture dans la branche donnees (la boucle de 5 min la réécrit sans cesse).
   Usage : node outils-donnees/controle-nuit.mjs --entree donnees-clone --sortie controle --precedent controle/controle-nuit.json
   Code de sortie 0 toujours (un contrôle ne doit jamais casser le workflow) ; la ligne « ALERTE: … » est lue par l'étape Telegram. */
import fs from 'node:fs'; import path from 'node:path';
import { controlerBougies, controlerCoherence, controlerCalendriers, rapport, PRIX_ACTIFS } from '../trader-pro/commun/controle-qualite.js';
const arg = n => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };
const entree = arg('entree') || 'donnees-clone', sortie = arg('sortie') || 'controle', prec = arg('precedent');
const lire = f => { try { return JSON.parse(fs.readFileSync(path.join(entree, f), 'utf8')); } catch (e) { return null; } };
const problemes = [], bougies = {}, pro = {};
for (const f of fs.existsSync(entree) ? fs.readdirSync(entree) : []) {
  const m = /^bougies-(.+)-(5m|15m|1h|1d)\.json$/.exec(f); if (m) { const d = lire(f); problemes.push(...controlerBougies(f, d, { unite: m[2], actif: m[1] })); if (m[2] === '1h' && d && d.b) bougies[m[1]] = d.b; continue; }
  const p = /^pro-([a-z0-9]+)\.json$/.exec(f); if (p) { const d = lire(f); if (d) pro[p[1]] = { prix: d.prix }; else problemes.push({ gravite: 'grave', fichier: f, type: 'vide', detail: 'fichier illisible' }); }
}
problemes.push(...controlerCoherence(pro, bougies)); problemes.push(...controlerCalendriers(lire('calendrier2.json'), lire('marches-calendrier.json')));
let precedent = null; try { if (prec) precedent = JSON.parse(fs.readFileSync(prec, 'utf8')); } catch (e) { /* première nuit */ }
const r = rapport({ problemes, precedent }); fs.mkdirSync(sortie, { recursive: true }); fs.writeFileSync(path.join(sortie, 'controle-nuit.json'), JSON.stringify(r, null, 1));
console.log('contrôle terminé : ' + r.resume + ' (' + Object.keys(bougies).length + ' séries H1, ' + Object.keys(pro).length + ' analyses)');
for (const k of r.aAlerter) { const c = r.consecutif[k]; console.log('ALERTE: ' + k + ' depuis ' + c.nuits + ' nuits'); }
console.log('actifs comparés : ' + Object.keys(PRIX_ACTIFS).filter(a => pro[a] && bougies[PRIX_ACTIFS[a]]).join(', '));
