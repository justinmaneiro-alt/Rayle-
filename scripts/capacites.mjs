// Génère docs/capacites.md depuis le registre des capacités (js/rayle/capacites.js) chargé avec les vrais analyseurs de Raylé.
// Usage : node scripts/capacites.mjs        (à relancer après avoir ajouté une capacité ; tests/capacites-test.mjs vérifie les exemples)
import fs from 'node:fs';
import { chargerRegistre } from '../tests/lib-capacites.mjs';
const { reg } = await chargerRegistre();
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/capacites.md', reg.markdown() + '\n');
console.log('docs/capacites.md : ' + reg.FAMILLES.length + ' familles, ' + reg.FAMILLES.reduce((n, f) => n + f.ex.length, 0) + ' exemples');
console.log('contexte compact pour l’IA (phrase « montre-moi Mars ») : ' + reg.contexte('montre-moi Mars').length + ' caractères');
