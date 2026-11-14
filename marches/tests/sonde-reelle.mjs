// Teste CHAQUE lot en direct (réseau réel) : node marches/tests/sonde-reelle.mjs [lot…]. Aucun secret. Affiche valeur, source, âge ; code de sortie 1 si un lot actif échoue.
import { creerHub } from '../donnees/hub.js';
import { provenance } from '../donnees/normaliser.js';
const hub = creerHub({ env: process.env }), filtre = process.argv.slice(2);
let ko = 0;
for (const id of hub.idsLots()) {
  if (filtre.length && !filtre.includes(id)) continue;
  if (!hub.actif({ ...(await import('../donnees/registre.js')).parId.get((await import('../donnees/connecteurs.js')).LOTS.find(l => l.id === id).source) })) { console.log('--  ' + id + ' : désactivé par défaut'); continue; }
  const t = Date.now(), r = await hub.lot(id, { force: true });
  const ok = !r.erreur && (r.mesures.length || r.items.length);
  if (!ok) ko++;
  console.log((ok ? 'OK  ' : 'KO  ') + id + ' ' + (Date.now() - t) + ' ms · ' + r.mesures.length + ' mesures · ' + r.items.length + ' éléments' + (r.erreur ? ' · ERREUR ' + r.erreur : '') + (r.partiel && r.partiel.length ? ' · partiel : ' + r.partiel.join(' | ') : ''));
  for (const m of r.mesures.slice(0, 14)) console.log('      ' + m.id.padEnd(22) + String(m.valeur == null ? m.texte : Math.round(m.valeur * 10000) / 10000).padStart(14) + ' ' + m.unite + ' · ' + m.etat + ' · ' + provenance(m).slice(0, 110));
  for (const i of r.items.slice(0, 3)) console.log('      • ' + i.source + ' · ' + new Date(i.publieMs || i.dateMs).toISOString().slice(0, 16) + ' · ' + i.titre.slice(0, 80));
}
console.log(ko ? '\n' + ko + ' lot(s) en échec' : '\ntous les lots actifs répondent');
process.exit(ko ? 1 : 0);
