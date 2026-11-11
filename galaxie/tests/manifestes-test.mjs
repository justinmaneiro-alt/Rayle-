// Manifestes des planètes gardées : Raylé (soleil), Terre, Saturne (anatomie), Neptune (développement 3D). node galaxie/tests/manifestes-test.mjs
import fs from 'node:fs';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const index = JSON.parse(fs.readFileSync('planetes/index.json', 'utf8'));
v('quatre corps seulement', JSON.stringify(index.corps) === JSON.stringify(['rayle', 'terre', 'saturne', 'neptune']), JSON.stringify(index.corps));
for (const id of index.corps) {
  const f = 'planetes/' + id + '/manifeste.json'; v(id + ' : manifeste présent', fs.existsSync(f)); if (!fs.existsSync(f)) continue;
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  v(id + ' : id cohérent', m.id === id); v(id + ' : nom et thème', !!m.nom && !!m.theme);
  const tex = m.apparence && m.apparence.texture; if (tex) v(id + ' : texture présente (' + tex + ')', fs.existsSync(tex));
  const entree = m.modules && m.modules.pc && m.modules.pc.entree; if (entree) v(id + ' : module d’entrée présent (' + entree + ')', fs.existsSync(entree));
}
for (const mort of ['mars', 'jupiter', 'mercure', 'venus', 'uranus']) v(mort + ' : supprimée', !fs.existsSync('planetes/' + mort));
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
