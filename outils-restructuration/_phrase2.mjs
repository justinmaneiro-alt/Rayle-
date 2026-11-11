import fs from 'node:fs';
const f = 'core/intelligence/phrase.js'; let t = fs.readFileSync(f, 'utf8');
const cible = "    const cmdD=window.DirectPage?";
if (!t.includes(cible)) throw new Error('ancre introuvable');
t = t.replace(cible, "    const cmdApp=window.Application?await Application.commande(text):null;    // application : « ouvre le terminal », « suivant », « montre l'actualité », « ferme »\n    if(my!==epoch) return;\n    if(cmdApp){ diagAction('application'); addLine('ray',cmdApp); await speak(cmdApp); return; }\n" + cible);
fs.writeFileSync(f, t); console.log('ok');
