import fs from 'node:fs';
let L = fs.readFileSync('serveur.mjs', 'utf8').split('\n');
const sortir = [/import \{ creerMulti \}/, /import \{ creerTelecommande \}/, /import \{ creerPontCamera \}/, /const multi = creerMulti/, /const tele = creerTelecommande/, /const camera = creerPontCamera/,
  /startsWith\('\/__multi\/'\)/, /startsWith\('\/__tele\/'\)/, /startsWith\('\/__cam\/'\)/, /\/clavier\/telecommande-calcul\.js/, /chemin === '\/clavier'\)/,
  /serveur\.on\('upgrade'/, /serveur\.tele = tele/];
L = L.filter(l => !sortir.some(r => r.test(l)));
let t = L.join('\n');
t = t.replace("serveur.on('close', () => { tele.fermerTout(); camera.fermerTout(); voixLocale.arreter(); });", "serveur.on('close', () => { voixLocale.arreter(); });");
t = t.replace("process.on(sig, () => { principal.tele.fermerTout(); principal.camera.fermerTout(); process.exit(0); });", "process.on(sig, () => { process.exit(0); });");
// option --reseau-local (télécommande) retirée
const i = t.indexOf("  // Option explicite"); if (i > 0) { const j = t.lastIndexOf('\n}'); t = t.slice(0, i) + t.slice(j + 1); }
fs.writeFileSync('serveur.mjs', t);
