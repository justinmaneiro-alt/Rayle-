// Tests de « Banques et analyses » (V2, phase 7) : fiches, registre, Worker, filtres, résumé de contexte, aperçus d'images éteints, document à jour.  Lancer :  node planetes/mars/tests/v2-analyses-test.mjs
import fs from 'node:fs';
import { FICHES, DROITS, filtrerAnalyses, entitesDe, resumerAnalyses, apercuAutorise, legendeImage, documentSources, idsAnalyses } from '../pc/finance/analyses-calcul.js';
import { REGISTRE_FLUX, FLUX_PAR_ID, analyserRss } from '../pc/finance/flux-calcul.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

v('18 sources décrites', idsAnalyses().length === 18, String(idsAnalyses().length));
v('chaque fiche : entité, type, site https, fréquence, droits', Object.values(FICHES).every(f => f.entite && f.type && /^https:\/\//.test(f.site) && f.frequence && f.droits && f.droits.includes(DROITS)));
v('chaque fiche a son flux dans le registre, en https, groupe « institutions » ou « banques »', idsAnalyses().every(id => FLUX_PAR_ID[id] && /^https:\/\//.test(FLUX_PAR_ID[id].url) && ['institutions', 'banques'].includes(FLUX_PAR_ID[id].groupe)), idsAnalyses().filter(id => !FLUX_PAR_ID[id]).join());
v('aucune banque d’investissement payante dans le registre (Goldman, J.P. Morgan, Morgan Stanley, BlackRock, Vanguard)', !REGISTRE_FLUX.some(f => /goldmansachs|jpmorgan|morganstanley|blackrock|vanguard/i.test(f.url + f.nom)));
v('FMI et OCDE (refus automatisés) toujours écartés', !REGISTRE_FLUX.some(f => /imf\.org|oecd\.org/i.test(f.url)));
v('chaque nouvelle source passe par le Worker (aucune n’a de CORS) et est officielle', ['bce_blog', 'fed_ny_liberty', 'fed_feds_notes', 'fed_working_papers', 'fed_sf', 'fed_stl_blog', 'bundesbank', 'bri_recherche'].every(id => FLUX_PAR_ID[id].acces === 'worker' && FLUX_PAR_ID[id].officiel));
v('les droits d’usage ne promettent pas plus que les éditeurs (jamais « libre de droits »)', Object.values(FICHES).every(f => !/libre de droits|domaine public\s*\.|sans restriction/i.test(f.droits)));
// Worker (local) : mêmes adresses
const chemW = new URL('../../../worker/src/finance/finance.js', import.meta.url);
if (fs.existsSync(chemW)) { const W = await import(chemW.href); v('Worker : les 18 sources sont dans la liste blanche, mêmes adresses que la page', idsAnalyses().every(id => W.FLUX[id] === FLUX_PAR_ID[id].url), idsAnalyses().filter(id => W.FLUX[id] !== FLUX_PAR_ID[id].url).join()); }
else console.log('  (Worker absent : contrôle ignoré)');

// ── flux : extrait court, image facultative ──
const rss = '<rss><channel><item><title>Blog : l’inflation recule</title><link>https://exemple.org/a</link><pubDate>Mon, 26 Oct 2026 08:00:00 GMT</pubDate><description>' + 'x'.repeat(400) + '</description><media:thumbnail url="https://exemple.org/i.jpg"/></item><item><title>Sans image</title><link>https://exemple.org/b</link><pubDate>Mon, 26 Oct 2026 07:00:00 GMT</pubDate></item></channel></rss>';
const it = analyserRss(rss);
v('extrait coupé à 220 caractères', it[0].resume.length === 220);
v('image reconnue seulement si https', it[0].image === 'https://exemple.org/i.jpg' && it[1].image === undefined);
v('une image http (non sécurisée) est ignorée', analyserRss(rss.replace('https://exemple.org/i.jpg', 'http://exemple.org/i.jpg'))[0].image === undefined);

// ── filtres et résumé ──
const t0 = Date.UTC(2026, 9, 27, 9, 0);
const items = [{ sourceId: 'bce_presse', titre: 'La BCE publie son enquête', url: 'https://x/1', t: t0 - 3600e3 }, { sourceId: 'bce_blog', titre: 'Blog BCE sur la résilience', url: 'https://x/2', t: t0 - 86400e3 }, { sourceId: 'fed_ny_liberty', titre: 'Revenue per worker', url: 'https://x/3', t: t0 - 2 * 86400e3 },
  { sourceId: 'bri_pub', titre: 'Chokepoints in supply chains', url: 'https://x/4', t: t0 - 5 * 86400e3 }, { sourceId: 'ing_think', titre: 'FX Daily', url: 'https://x/5', t: t0 - 30 * 86400e3 }, { sourceId: 'inconnue', titre: 'Intrus', url: 'https://x/6', t: t0 }];
v('filtre par entité', filtrerAnalyses(items, { entite: 'BCE' }).length === 2);
v('filtre par type : « banque centrale » inclut la recherche des banques centrales', filtrerAnalyses(items, { type: 'banque centrale' }).length === 3 && filtrerAnalyses(items, { type: 'institution' }).length === 1 && filtrerAnalyses(items, { type: 'banque' }).length === 1);
v('une source inconnue est ignorée', !filtrerAnalyses(items, {}).some(i => i.sourceId === 'inconnue'));
v('entités triées par nombre de publications', entitesDe(items)[0].entite === 'BCE' && entitesDe(items)[0].n === 2);
const r = resumerAnalyses(items, t0);
v('résumé : 4 publications sur 7 jours (la vieille d’ING et l’intrus exclus)', r.n === 4 && /4 \(BCE 2/.test(r.texte), r.texte);
v('résumé : cite des titres, dit « pas un signal »', /« La BCE publie son enquête »/.test(r.texte) && /pas un signal/.test(r.texte));
v('résumé : sans publication récente, le dit', /Aucune publication récente/.test(resumerAnalyses([], t0).texte));

// ── aperçus d'images : éteints ──
v('aucun aperçu d’image n’est autorisé aujourd’hui (aucune source ne l’autorise explicitement)', Object.keys(FICHES).every(id => !apercuAutorise(id, { image: 'https://exemple.org/i.jpg', url: 'https://x' })));
FICHES.bri_pub.apercuImages = true;
v('quand une source l’autorise, l’aperçu s’affiche avec sa source en légende (jamais d’image http)', apercuAutorise('bri_pub', { image: 'https://exemple.org/i.jpg' }) && !apercuAutorise('bri_pub', { image: 'http://exemple.org/i.jpg' }) && /Source : BRI/.test(legendeImage('bri_pub', { url: 'https://x' })));
delete FICHES.bri_pub.apercuImages;

// ── document ──
const doc = documentSources(REGISTRE_FLUX.filter(f => FICHES[f.id]), null);
v('document : sources écartées et banques payantes nommées', /Goldman Sachs/.test(doc) && /FMI/.test(doc) && /OCDE/.test(doc) && /aucun flux public/.test(doc));
const chemin = new URL('../../../docs/ANALYSES_SOURCES.md', import.meta.url);
if (fs.existsSync(chemin)) v('docs/ANALYSES_SOURCES.md existe et liste les 18 sources', fs.readFileSync(chemin, 'utf8').split('\n').filter(l => /^\| .* \| (BANQUE|RECHERCHE|INSTITUTION)/.test(l)).length === 18);
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
