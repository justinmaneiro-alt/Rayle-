/* TEST FINAL 2020–2025 : regardé UNE SEULE FOIS, sur les variantes qui ont passé TOUS les critères de validation (resultats-recherche.json), règles figées.
   S'il n'y en a aucune, la période n'est PAS ouverte (elle reste vierge). Un verrou (test-final-verrou.json, local) empêche de relancer. */
import fs from 'node:fs';
import { charger } from './donnees.mjs'; import { construire } from './contexte.mjs'; import { SPECS, signaux } from './familles.mjs'; import { enchainer } from './simulateur.mjs'; import { resume } from './stats.mjs';
const V = new URL('./test-final-verrou.json', import.meta.url);
if (fs.existsSync(V)) { console.log('Le test final a déjà été lancé :', fs.readFileSync(V, 'utf8')); process.exit(0); }
const R = JSON.parse(fs.readFileSync(new URL('./resultats-recherche.json', import.meta.url), 'utf8'));
if (!R.retenues.length) { fs.writeFileSync(V, JSON.stringify({ date: new Date().toISOString(), ouvert: false, raison: 'aucune variante validée : la période 2020–2025 n\'a pas été regardée' }, null, 1)); console.log('Aucune variante validée : 2020–2025 reste fermée.'); process.exit(0); }
const X = construire(charger({ debut: 2003, fin: 2025 })), sortie = [];
for (const id of R.retenues) { const s = SPECS.find(q => q.id === id), T = enchainer(X, signaux(s, X), s, { de: 2020, a: 2025 }), pire = resume(T.map(t => Math.min(t.Rc, t.Rk))); sortie.push({ id, n: pire.n, moy: pire.moy, ic95: pire.ic95, confirme: pire.n >= 100 && pire.moy > 0 && pire.ic95[0] > 0 }); }
fs.writeFileSync(V, JSON.stringify({ date: new Date().toISOString(), ouvert: true, sortie }, null, 1)); console.log(JSON.stringify(sortie, null, 1));
