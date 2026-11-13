/* Registre en direct des flèches v8 : ajout seul, chaîne d'empreintes, seulement après la date de départ, résultat ajouté une fois à la clôture.   node agent-trading/tests/registre-direct-test.mjs */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { serie13 } from '../recherche-or/fleches-v6-diag.mjs';
import { mettreAJour, majDepuisBougies, verifier, lire, resume } from '../registre-direct.mjs';
const H = 3600e3; let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const K = serie13(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registre-')), f = path.join(dir, 'r.jsonl');
const finDe = n => K[n - 1].t + H;                                          // heure de clôture de la n-ième bougie
// départ à la bougie 1000 : le registre naît à ce moment ; rien d'antérieur n'y entre
const a0 = majDepuisBougies(K.slice(0, 800), { fichier: f, maintenant: finDe(800), sceauGlobal: 'sceau-test' });
v('création : une seule ligne « debut » (date, moteur, sceau), aucune flèche antérieure', a0.length === 1 && lire(f)[0].type === 'debut' && lire(f)[0].debut === finDe(800) && lire(f)[0].sceau === 'sceau-test' && lire(f).length === 1, JSON.stringify(a0.map(x => x.type)));
const avant = fs.readFileSync(f, 'utf8');
let total = 0; for (const n of [900, 1000, 1100, 1200, 1300, 1440]) { const aj = majDepuisBougies(K.slice(0, n), { fichier: f, maintenant: finDe(n) }); total += aj.length; }
const L = lire(f), F = L.filter(l => l.type === 'fleche'), R = L.filter(l => l.type === 'resultat');
v('des flèches posées après le départ sont ajoutées (une ligne chacune)', F.length >= 1 && F.every(x => x.tCloture >= finDe(800)) && new Set(F.map(x => x.id)).size === F.length, `${F.length} flèches`);
v('chaque flèche porte date, type, niveau, entrée, stop, TP1, TP2', F.every(x => x.tCloture && x.genre && x.dir && 'niveau' in x && x.entree > 0 && x.stop > 0 && x.tp1 > 0 && x.tp2 > 0 && x.tp1 !== x.tp2));
v('les lignes passées ne sont jamais modifiées (le fichier ne fait que s\'allonger)', fs.readFileSync(f, 'utf8').startsWith(avant));
v('le résultat n\'est ajouté qu\'une fois la position de lecture close ; un seul résultat par flèche', R.length === new Set(R.map(x => x.id)).size && R.every(x => ['stop', 'tp1', 'tp2', 'expiree'].includes(x.etat)) && R.every(x => L.findIndex(y => y.id === x.id && y.type === 'fleche') < L.indexOf(x)));
v('registre intact : chaîne d\'empreintes vérifiée', verifier(f).ok, verifier(f).erreurs.join());
// idempotent : relancer sans nouvelle bougie n'ajoute rien
v('relancer sans nouveauté n\'ajoute aucune ligne', majDepuisBougies(K, { fichier: f, maintenant: finDe(1440) }).length === 0);
// altérations : modification, suppression, insertion
const brut = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
const essai = (nom, lignes) => { const g = path.join(dir, nom + '.jsonl'); fs.writeFileSync(g, lignes.join('\n') + '\n'); return verifier(g); };
if (brut.length >= 3) {
  const mod = brut.slice(); mod[1] = mod[1].replace(/"stop":[0-9.]+/, '"stop":1'); v('altération détectée : une ligne modifiée', !essai('mod', mod).ok);
  const sup = brut.slice(); sup.splice(1, 1); v('altération détectée : une ligne supprimée', !essai('sup', sup).ok);
  const ins = brut.slice(); ins.splice(2, 0, brut[1]); v('altération détectée : une ligne dupliquée', !essai('ins', ins).ok);
}
// résumé
const r = resume(f); v('résumé : départ, flèches, résultats, ouvertes', r.debut === finDe(800) && r.fleches === F.length && r.resultats === R.length && r.ouvertes === F.length - R.length, JSON.stringify(r));
// aucune flèche grise ni cassure MA200 dans le registre
v('seules les flèches colorées (retournement, rebond de base) entrent', F.every(x => x.genre === 'retournement' || x.genre === 'rebond_base'));
// le registre réel du dépôt (s'il existe) est intact
const reel = new URL('../registre-direct/registre-fleches-v8.jsonl', import.meta.url); if (fs.existsSync(reel)) v('registre réel du dépôt : chaîne intacte', verifier(reel.pathname.replace(/^\/([A-Za-z]:)/, '$1')).ok);
console.log(ko ? `ÉCHECS : ${ko} (réussis : ${ok})` : `registre-direct-test : ${ok} vérifications OK`); process.exit(ko ? 1 : 0);
