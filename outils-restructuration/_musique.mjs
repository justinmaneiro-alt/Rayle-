import fs from 'node:fs';
function maj(f, fn) { const a = fs.readFileSync(f, 'utf8'), b = fn(a); if (a === b) console.log('INCHANGÉ', f); else { fs.writeFileSync(f, b); console.log('ok', f); } }
// 1. fenêtre de l'agent : plus de boutons musique / télé
maj('agent-trading/front/fenetre-agent.js', t => t
  .replace(/\/\* barre de la fenêtre « ◈ »[^\n]*\n/, '')
  .replace(/const BOUTONS_MEDIA = [^\n]*\n/, '')
  .replace(/const ouvrirMedia = [^\n]*\n/, '')
  .replace(', boutons: BOUTONS_MEDIA, surBouton: ouvrirMedia', ''));
// 2. page de l'or : plus de mode télé
maj('agent-trading/front/or/page-or.js', t => t.replace(/  if \(estTele\(\)\) return import\('\.\/tele\.js'\)[^\n]*\n/, ''));
// 3. tableau de l'or : plus de commandes de musique
maj('agent-trading/front/or/tableau-or.js', t => t.replace(/    else if \(c\.type === 'musique' \|\| c\.type === 'fenetre'\) \{[^\n]*\n/, ''));
// 4. commandes vocales de l'or : retire les règles de musique et de télé
maj('agent-trading/front/or/commandes-or.js', t => {
  const L = t.split('\n'), S = [];
  for (const l of L) {
    if (/type: 'musique'/.test(l) || /quoi: 'musique'/.test(l) || /quoi: 'tele'/.test(l) || /^\s*\/\/ (musique|transport)/.test(l)) continue;
    S.push(l);
  }
  return S.join('\n');
});
