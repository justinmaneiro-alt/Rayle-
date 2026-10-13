// Génère docs/espace-sources.md depuis la base de connaissances (ui/espace-savoir.js) : chaque fiche, chaque champ, sa source.
// Usage : node scripts/sources-espace.mjs
import vm from 'node:vm';
import fs from 'node:fs';

const ctx = { console, Math, Date }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../ui/espace-savoir.js', import.meta.url), 'utf8'), ctx);
const S = ctx.RayleUI.savoir;
const GENRES = { etoile: 'Étoile', planete: 'Planètes', lune: 'Lunes', ceinture: 'Ceinture d’astéroïdes', comete: 'Comètes', trou_noir: 'Trou noir', station: 'Station', telescope: 'Télescopes', rover: 'Rovers', mission: 'Grandes missions' };
const ordre = ['etoile', 'planete', 'lune', 'ceinture', 'comete', 'trou_noir', 'station', 'telescope', 'rover', 'mission'];
const o = [];
o.push('# Base de connaissances Espace : sources', '',
  'Généré par `node scripts/sources-espace.mjs` depuis `ui/espace-savoir.js`. **Règle** : un chiffre qui n’est pas dans une source n’est pas dans la base ; une donnée absente est annoncée par Raylé (« je n’ai pas cette donnée »), jamais inventée.', '',
  'Toutes les pages ont été consultées le **13 octobre 2026**. Les chiffres qui évoluent (nombre de lunes, kilomètres parcourus par Perseverance…) sont donnés « à la date » de la source.', '',
  '## Sources', '', '| Code | Source | Adresse |', '|---|---|---|');
for (const [c, s] of Object.entries(S.SOURCES)) o.push('| `' + c + '` | ' + s.t + ' | ' + s.u + ' |');
o.push('', '`H` = faits historiques usuels (noms de missions, années de lancement, rôles) : aucun chiffre scientifique ; ils sont recoupés avec les pages de mission NASA et ESA ci-dessus.', '',
  '## Points où les sources divergent ou sont incomplètes (choix faits)', '',
  '- **Olympus Mons** : la fiche Mars de la NASA parle de « plus de 25 miles » (≈ 40 km) de haut depuis la base ; la valeur usuelle au-dessus du niveau de référence est d’environ 22 km. Raylé dit seulement « plus de vingt kilomètres ».',
  '- **Voyager 2, entrée dans l’espace interstellaire** : la page NASA donne « 25 novembre 2018 » et « 10 décembre 2018 » (date d’annonce) ; Raylé dit « en novembre 2018 ».',
  '- **Température de Mars** : moyenne ≈ 214 K (−59 °C) et extrêmes −89 / −31 °C relevés sur le site de Viking 1 (fiche détaillée NASA) ; le tableau comparatif plus ancien donne −65 °C. Raylé suit la fiche détaillée.',
  '- **Pesanteur de Jupiter** : 25,92 m/s² à la pression de 1 bar (fiche détaillée) contre 23,1 m/s² (tableau comparatif, valeur à l’équateur). Raylé cite 25,9 « à la pression de un bar ».',
  '- **Jour de Mercure** : la rotation (58,6 jours) et le jour solaire (≈ 176 jours) sont distingués ; idem Vénus (243 j et ≈ 117 j).',
  '- **Périodes orbitales des lunes** : NASA Planetary Fact Sheets des satellites de Jupiter et de Saturne (`JOV`, `SATS`) ; pour les autres lunes, éléments moyens JPL (`JS`), qui peuvent différer de quelques millièmes (définition de la période).',
  '- **Lunes de Saturne** : 274 selon la fiche NASA du 13/10/2026 ; ce nombre augmente à chaque découverte.',
  '- **Perseverance** : la page de mission ne donne ni masse ni dimensions : Raylé n’en cite pas. Distance parcourue : 45,22 km au 11/10/2026.',
  '- **Sagittarius A\\*** : 4 millions de masses solaires (NASA) ; sa distance en années-lumière et la masse de M87\\* ne figurent pas dans les pages consultées : absentes de la base.',
  '- **Rovers, coordonnées** : site d’atterrissage de Curiosity (Bradbury Landing) 4,5895° S, 137,4417° E ; de Perseverance (Octavia E. Butler Landing, cratère Jezero) 18,44° N, 77,45° E (consultées sur Wikipédia, qui cite NBC News et Sky & Telescope pour Curiosity). Les rovers ont bougé depuis : ce sont les points d’atterrissage. Leur alignement sur la texture de Mars a été vérifié par superposition (Olympus Mons, Valles Marineris, Isidis, cratère Gale).', '',
  '## Fiches', '');
for (const g of ordre) {
  const l = Object.values(S.fiches).filter(f => f.genre === g); if (!l.length) continue;
  o.push('### ' + GENRES[g], '');
  for (const f of l) {
    o.push('**' + f.nom.replace(/^./, c => c.toUpperCase()) + '** (`' + f.id + '`)', '');
    for (const [k, c] of Object.entries(f.champs)) o.push('- ' + k + ' [`' + c[2] + '`] : ' + c[0]);
    o.push('');
  }
}
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/espace-sources.md', o.join('\n') + '\n');
console.log('docs/espace-sources.md : ' + Object.keys(S.fiches).length + ' fiches, ' + Object.values(S.fiches).reduce((n, f) => n + Object.keys(f.champs).length, 0) + ' champs');
