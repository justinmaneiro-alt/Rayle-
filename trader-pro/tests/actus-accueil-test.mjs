/* Tests purs de l'actualité de l'accueil : lecture des flux RSS/Atom (outils-donnees/actus-accueil.mjs) et fusion / nouveautés (core/commun/actus-defilantes.js). node trader-pro/tests/actus-accueil-test.mjs */
import { createRequire } from 'node:module';
import { lireFlux, fusionner, sansBalises, equilibrer, actusAccueil, FLUX } from '../../outils-donnees/actus-accueil.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
globalThis.window = globalThis; createRequire(import.meta.url)('../../core/commun/actus-defilantes.js'); const P = globalThis.ActusDefilantes.pur;

const rss = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item><title><![CDATA[Un titre &amp; son « sujet »]]></title><link>https://exemple.fr/a1</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Extrait de &lt;b&gt;l'article&lt;/b&gt; écrit à jean@gmail.com&lt;/p&gt;</description><media:content url="https://img.exemple.fr/a1.jpg" medium="image"/></item>
<item><title>Deuxième</title><link>https://exemple.fr/a2</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate><enclosure url="https://img.exemple.fr/a2.png" type="image/png"/></item>
<item><title>Sans image</title><link>http://exemple.fr/a3</link><description>&lt;img src="https://img.exemple.fr/a3.jpg"&gt; texte</description></item>
</channel></rss>`;
const L = lireFlux(rss);
v(L.length === 3 && L[0].titre === 'Un titre & son « sujet »' && L[0].image === 'https://img.exemple.fr/a1.jpg' && L[0].date === Date.parse('2026-11-20T10:00:00Z'), 'RSS : titre décodé, image media:content, date');
v(!/gmail|<p>|<b>/.test(L[0].resume) && /Extrait de l'article/.test(L[0].resume), 'extrait sans balises ni adresse e-mail (le garde-fou de publication refuserait le lot)');
v(L[1].image === 'https://img.exemple.fr/a2.png' && L[2].image === 'https://img.exemple.fr/a3.jpg' && L[2].lien === 'https://exemple.fr/a3', 'image enclosure / <img> de la description ; liens http passés en https');
v(sansBalises('a@b.com x') === 'x', 'e-mail retiré');
const atom = '<feed><entry><title>Atom</title><link href="https://exemple.fr/at"/><updated>2026-11-20T08:00:00Z</updated><summary>S</summary></entry></feed>'; v(lireFlux(atom)[0].lien === 'https://exemple.fr/at', 'Atom : lien en attribut href');

const a = n => ({ titre: 'Article numéro ' + n + ' très particulier', lien: 'https://x.fr/' + n, date: 1e12 + n * 1000, source: 'S' });
const liste = Array.from({ length: 35 }, (_, i) => a(i)), doublons = [...liste, { ...a(3), lien: 'https://autre.fr/3' }, { ...a(4), titre: 'ARTICLE numéro 4 très particulier !!' }];
const f = fusionner([doublons], 60, 2e12);
v(f.length === 35 && f[0].date >= f[1].date, 'fusion : 35 articles sans doublon (même titre ou même lien), du plus récent au plus ancien');
v(fusionner([[{ titre: 'Futur', lien: 'https://x.fr/f', date: 9e12 }]], 10, 1e12).length === 0, 'article daté du futur : écarté');
v(equilibrer([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], [1]], 10)[0].length === 9, 'un média prolixe ne noie pas les autres');
v(P.fusionner(liste.slice(0, 10), [a(100), a(5)], 80).length === 11 && P.nouveautes(liste.slice(0, 10), [a(100), a(5), a(100)]).length === 1, 'côté page : fusion et nouveautés (3 articles reçus dont 1 connu et 1 en double = 1 nouveau)');
v(P.age(1e12, 1e12 + 5 * 60000) === 'il y a 5 min' && P.age(1e12, 1e12 + 3 * 3600e3) === 'il y a 3 h' && P.age(1e12, 1e12 + 20) === 'à l’instant', 'âges lisibles');
v(FLUX.france.length >= 4 && FLUX.monde.length >= 4 && FLUX.marches.length >= 3 && Object.values(FLUX).flat().every(([n, u]) => /^https:\/\//.test(u)), 'trois rubriques, flux https');
/* source en panne : ignorée ; toutes en panne : erreur claire */
const faux = async (url) => url.includes('lemonde') ? { ok: true, text: async () => rss } : { ok: false, status: 503 };
const d = await actusAccueil('france', { fetchFn: faux }); v(d.items.length === 3 && d.sources.some(s => !s.ok && s.erreur), 'une source répond, les autres sont notées en panne');
let err = null; try { await actusAccueil('monde', { fetchFn: async () => ({ ok: false, status: 500 }) }); } catch (e) { err = e; } v(err && /aucune source/.test(err.message), 'toutes en panne : erreur (la copie précédente reste publiée)');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
