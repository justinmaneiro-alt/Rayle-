// Genere la section « concepts » de docs/microstructure-btc.md depuis micro-concepts.js (source unique du texte).
// Lancer :  node planetes/mars/outils-agent/generer-doc-micro.mjs
import fs from 'node:fs';
import { CONCEPTS } from '../pc/agent-btc/micro-concepts.js';
const f = new URL('../../../docs/microstructure-btc.md', import.meta.url);
let doc = fs.readFileSync(f, 'utf8');
const corps = '## 1. Concepts\n\n' + CONCEPTS.map((c, i) => '### 1.' + (i + 1) + ' ' + c.nom + '\n- **Mécanisme.** ' + c.mecanisme + '\n- **Ce que Rayle mesure.** ' + c.mesure + '\n- **Limites.** ' + c.limites + '\n- **Établi.** ' + c.etabli + '\n- **Discuté.** ' + c.discute + '\n').join('\n');
const a = doc.indexOf('<!-- CONCEPTS:DEBUT -->'), b = doc.indexOf('<!-- CONCEPTS:FIN -->');
doc = doc.slice(0, a) + '<!-- CONCEPTS:DEBUT -->\n' + corps + '\n' + doc.slice(b);
fs.writeFileSync(f, doc); console.log('section concepts ecrite :', CONCEPTS.length, 'concepts');
