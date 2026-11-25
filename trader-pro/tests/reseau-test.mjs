/* Tests du réseau d'information : lecture RSS / Atom / EDGAR, dédoublonnage (5 sources = 1 carte), fils d'histoire et revirement, score expliqué, réaction réelle du marché,
   précédents (≥ 3 cas), alertes (seuil, 1 par fil / 30 min, revirement). Usage : node trader-pro/tests/reseau-test.mjs */
import { parserFlux, parserEdgar, decoder, sansHtml } from '../reseau/parse.js';
import { integrer, etatVide, noterCarte, aLaUne, lignesPersonnes, alertesDe, phraseAlerte, fusionnerCartes, jetons, similaires, analyser } from '../reseau/etat.js';
import { mesurerReaction, memoriser, precedentDe, prixA } from '../reseau/reaction.js';
import { SOURCES, PERSONNES, SUJETS } from '../reseau/config.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const T0 = Date.UTC(2026, 10, 24, 14, 0), MIN = 60e3, H = 3600e3;

console.log('— lecture des flux —');
{
  const rss = `<?xml version="1.0"?><rss><channel><item><title>FinancialJuice: Fed&apos;s Waller: rates &amp; jobs</title><link>https://x.test/a?xy=rss</link><description>&lt;ul&gt;&lt;li&gt;Hello &amp;amp; bye&lt;/li&gt;&lt;/ul&gt;</description><pubDate>Tue, 24 Nov 2026 13:50:00 GMT</pubDate><guid isPermaLink="false">123</guid></item>
  <item><title><![CDATA[Trump : "tariffs on chips" ]]></title><link>https://x.test/b</link><pubDate>Tue, 24 Nov 2026 13:55:00 GMT</pubDate></item><item><title>Sans date</title></item><item><title></title><pubDate>Tue, 24 Nov 2026 13:55:00 GMT</pubDate></item></channel></rss>`;
  const L = parserFlux(rss); v(L.length === 2 && L[0].titre === 'FinancialJuice: Fed\'s Waller: rates & jobs' && L[0].t === Date.UTC(2026, 10, 24, 13, 50) && L[0].guid === '123' && L[0].resume === 'Hello & bye', 'RSS : titre décodé, date, guid, résumé sans HTML ; articles sans titre ni date écartés');
  v(L[1].titre === 'Trump : "tariffs on chips"' && L[1].lien === 'https://x.test/b', 'CDATA');
  const atom = '<feed><entry><title>Déclaration</title><link href="https://x.test/atom"/><updated>2026-11-24T13:00:00Z</updated><id>tag:1</id></entry></feed>'; const A = parserFlux(atom); v(A.length === 1 && A[0].lien === 'https://x.test/atom' && A[0].t === Date.UTC(2026, 10, 24, 13), 'Atom');
  v(parserFlux('<html>pas un flux</html>').length === 0 && parserFlux(null).length === 0 && parserFlux(rss, { max: 1 }).length === 1, 'entrée invalide : liste vide ; max respecté');
  v(decoder('&#8217;&#x41;&lt;') === '’A<' && sansHtml('<p>a&nbsp;b</p>') === 'a b', 'entités');
  const E = parserEdgar({ cik: '0001045810', name: 'NVIDIA', filings: { recent: { form: ['10-Q', '8-K', '4'], acceptanceDateTime: ['2026-11-24T10:00:00.000Z', '2026-11-24T12:00:00.000Z', '2026-11-24T13:00:00.000Z'], filingDate: ['2026-11-24', '2026-11-24', '2026-11-24'], accessionNumber: ['0-1', '0001045810-26-000001', '0001045810-26-000002'], primaryDocument: ['a.htm', 'b.htm', 'c.xml'], items: ['', '2.02,9.01', ''] } } }, { nom: 'Nvidia' });
  v(E.length === 2 && /8-K/.test(E[0].titre) && /Form 4/.test(E[1].titre) && /sec\.gov\/Archives\/edgar\/data\/1045810\//.test(E[0].lien), 'EDGAR : 8-K et Form 4 seulement, liens corrects');
  v(SOURCES.every(s => /^https:\/\//.test(s.url) && s.id && s.nom) && new Set(SOURCES.map(s => s.id)).size === SOURCES.length, 'sources : identifiants uniques, adresses https');
  v(!SOURCES.some(s => /twitter\.com|x\.com|api\.x\./.test(s.url)), 'aucune API X / Twitter (payante)');
  v(SOURCES.filter(s => s.voie === 'rapide').length === 3 && SOURCES.some(s => s.id === 'trump') && SOURCES.some(s => s.id === 'financialjuice') && SOURCES.some(s => s.id === 'investinglive'), 'voie rapide : FinancialJuice, investingLive, Trump');
  v(PERSONNES.every(p => p.poids >= 1 && p.poids <= 5) && ['trump', 'powell', 'huang', 'musk', 'saylor'].every(id => PERSONNES.some(p => p.id === id)), 'personnalités : poids de 1 à 5');
}

console.log('— dédoublonnage : une info reprise par 5 sources = UNE carte —');
let E1 = etatVide();
{
  const titre = 'Trump says he will impose new tariffs on Chinese semiconductor chips';
  const art = (source, titre, dt, extra = {}) => ({ source, titre, t: T0 - dt * MIN, lien: 'https://x.test/' + source, guid: source + dt, ...extra });
  const E = integrer(etatVide(), [art('trump', 'Trump: I am imposing new tariffs on Chinese semiconductor chips, effective immediately', 10), art('financialjuice', 'FinancialJuice: Trump: Imposing new tariffs on Chinese semiconductor chips effective immediately', 9), art('investinglive', 'Trump says imposing new tariffs on Chinese semiconductor chips effective immediately', 8), art('gn-actifs', 'Trump imposing new tariffs on Chinese semiconductor chips effective immediately - Reuters', 7), art('coindesk', 'Bitcoin ETF sees record inflows as crypto rallies', 5)], T0);
  const c = E.cartes.find(x => /tariffs/i.test(x.titre));
  v(E.cartes.length === 2 && c.sources.length === 4, 'quatre reprises = une seule carte « 4 sources » (et une carte sans rapport à part)');
  v(c.personne === 'trump' && c.sujets[0] === 'droits_douane' && c.actifs.includes('us100') && !c.actifs.includes('btc') === false, 'personne, sujet principal et actifs touchés reconnus');
  v(c.titre.startsWith('Trump: I am') && c.sources.length === 4, 'la carte garde le titre de la source la plus prioritaire (la personne)');
  const dup = integrer(E, [art('trump', 'Trump: I am imposing new tariffs on Chinese semiconductor chips, effective immediately', 10)], T0); v(dup.cartes.length === 2 && dup.cartes.find(x => /tariffs/i.test(x.titre)).sources.length === 4, 'relire le même article ne duplique rien');
  const vieux = integrer(etatVide(), [{ source: 'trump', titre: 'Vieux post', t: T0 - 80 * H }, { source: 'trump', titre: 'Futur', t: T0 + 3 * H }], T0); v(vieux.cartes.length === 0, 'articles hors fenêtre de 72 h ou dans le futur écartés');
  E1 = E;
  v(similaires(jetons('Gold rallies as dollar slips'), jetons('Gold rallies as the dollar slips - Reuters')) && !similaires(jetons('Gold rallies as dollar slips'), jetons('Bitcoin ETF record inflows')), 'similarité des titres');
}

console.log('— score d’importance expliqué —');
{
  const c = E1.cartes.find(x => /tariffs/i.test(x.titre)), S = noterCarte(c, T0), d = Object.fromEntries(S.detail.map(x => [x.id, x]));
  v(S.score === c.score && S.detail.length === 6 && S.detail.every(x => typeof x.pourquoi === 'string' && x.points >= 0 && x.points <= x.max), 'six lignes de détail, chacune expliquée et bornée');
  v(d.qui.points === 25 && /Trump/.test(d.qui.pourquoi) && d.sujet.points === 20 && d.sources.points >= 6 && d.nouveaute.points === 10, 'Trump + droits de douane + 4 sources + nouveau : score élevé et lisible');
  const faible = integrer(etatVide(), [{ source: 'financialjuice', titre: 'FinancialJuice: RBNZ Silk: New Zealand payments system remains reliable', t: T0 - 5 * MIN }], T0).cartes[0]; v(faible.score < 30, 'une info sans rapport avec mes actifs reste basse (' + faible.score + ')');
  const reac = { ...c, reaction: { max: { actif: 'us100', horizon: 15, pct: -0.9, atr: 1.8 }, texte: 'le marché a réagi : Nasdaq −0,9 % en 15 min', mesuree: 3 } }; v(noterCarte(reac, T0).score > S.score && noterCarte(reac, T0).detail.find(x => x.id === 'reaction').points > 0, 'la réaction réelle du marché fait monter le score');
  v(noterCarte(reac, T0).score <= 100, 'score plafonné à 100');
  const vieille = noterCarte({ ...c, t: T0 - 10 * H }, T0).detail.find(x => x.id === 'nouveaute').points; v(vieille === 0, 'une info de plus de 6 h n’est plus nouvelle');
  const A = analyser('Powell: the Fed will cut rates in December', 'financialjuice'); v(A.personne === 'powell' && A.sujets[0] === 'taux' && A.actifs.includes('or'), 'Powell : taux, or / indices / dollar');
  const B = analyser('Jensen Huang says Nvidia demand for chips is strong', 'investinglive'); v(B.personne === 'huang' && B.actifs.includes('us100'), 'Jensen Huang : Nasdaq');
}

console.log('— fils d’histoire et revirement —');
{
  const art = (source, titre, dt) => ({ source, titre, t: T0 - dt * MIN, lien: 'https://x.test/' + dt, guid: 'g' + dt });
  const E = integrer(etatVide(), [art('trump', 'Trump: we will impose 100% tariffs on Nvidia chips exports to China', 300), art('trump', 'Trump on tariffs: more talks planned this week, no change', 200), art('trump', 'Trump says he is pausing the tariffs on Nvidia chips after a deal with China', 20)], T0);
  const f = E.fils[0];
  v(E.fils.length === 1 && f.nb === 3 && f.personne === 'trump' && f.sujet === 'droits_douane', 'trois déclarations de Trump sur les droits de douane = UN fil');
  v(f.chronologie[0].type === 'declaration' && f.chronologie[2].type === 'revirement' && f.revirement && f.tRevirement === T0 - 20 * MIN, 'chronologie : déclaration puis revirement bien visible');
  v(E.cartes.every(c => c.fil === f.id), 'chaque carte connaît son fil');
  const separes = integrer(etatVide(), [art('trump', 'Trump: tariffs on Canadian steel to rise', 300), art('trump', 'Trump: sanctions on Russian oil banks announced', 30)], T0); v(separes.fils.length === 0, 'deux sujets différents ne font pas un fil');
}

console.log('— à la une, personnalités —');
{
  const E = integrer(E1, [{ source: 'financialjuice', titre: 'Powell: Fed will cut interest rates at the next FOMC meeting', t: T0 - 4 * MIN, guid: 'p1' }, { source: 'financialjuice', titre: 'Musk says Tesla will accept bitcoin payments again', t: T0 - 30 * MIN, guid: 'm1' }], T0);
  const U = aLaUne(E, T0, 5); v(U.length === 4 && U[0].score >= U[1].score && U[1].score >= U[2].score, 'À la une : triée par score, au plus 5');
  const P = lignesPersonnes(E); const tr = P.find(p => p.id === 'trump'), po = P.find(p => p.id === 'powell'), sa = P.find(p => p.id === 'saylor');
  v(tr.derniere && po.derniere && /Powell/.test(po.derniere.titre) && sa.derniere === null && P.length === PERSONNES.length, 'une ligne par personne suivie, avec sa dernière déclaration (ou aucune)');
}

console.log('— réaction réelle du marché —');
{
  const m5 = []; for (let i = 0; i < 40; i++) m5.push({ t: T0 - 60 * MIN + i * 5 * MIN, o: 100, h: 100, l: 100, c: i < 12 ? 100 : 100 - (i - 11) * 0.1, v: 1 });
  const c = { t: T0, actifs: ['us100', 'or'], id: 'x' };
  const R = mesurerReaction(c, { us100: { M5: m5, atrPct: 0.5 } }, T0 + 70 * MIN);
  v(R.actifs.us100 && R.actifs.us100.p5 != null && R.actifs.us100.p15 < R.actifs.us100.p5 && R.actifs.us100.p60 < R.actifs.us100.p15 && !R.actifs.or, 'mesure sur les actifs liés qui ont des bougies M5');
  v(R.max && R.max.actif === 'us100' && R.max.atr > 0.3 && /^le marché a réagi : Nasdaq −.* en 60 min/.test(R.texte), 'texte « le marché a réagi : Nasdaq −x,x % en N min » : ' + R.texte);
  const tot = mesurerReaction({ ...c, t: T0 - 5 * MIN }, { us100: { M5: m5, atrPct: 0.5 } }, T0 + 1 * MIN); v(R.attente === false && tot.attente === true && tot.actifs.us100.p60 === null, 'avant 5, 15, 60 minutes : « en cours », jamais de valeur inventée');
  const plat = []; for (let i = 0; i < 40; i++) plat.push({ t: T0 - 60 * MIN + i * 5 * MIN, o: 100, h: 100, l: 100, c: 100, v: 1 }); const R0 = mesurerReaction(c, { us100: { M5: plat, atrPct: 0.5 } }, T0 + 70 * MIN); v(R0.max === null && /pas de réaction nette/.test(R0.texte), 'marché immobile : pas de réaction nette');
  v(prixA(m5, T0 - 10 * H) === null && prixA([], T0) === null, 'marché fermé ou sans données : pas de mesure');
}

console.log('— précédents tirés de notre base —');
{
  const carte = (id, t, p60) => ({ id, personne: 'trump', sujets: ['droits_douane'], t, reaction: { attente: false, mesuree: 3, actifs: { us100: { p5: 0, p15: 0, p60 } } } });
  let M = []; for (const [i, p] of [-0.5, -1.2, 0.3, -0.8, -0.6, -1.0].entries()) M = memoriser(M, carte('k' + i, T0 - (10 - i) * 24 * H, p));
  v(M.length === 6 && memoriser(M, carte('k0', T0, 1)).length === 6, 'mémoire sans doublon');
  const nouv = { personne: 'trump', sujets: ['droits_douane'], id: 'neuf' }, P = precedentDe(M, nouv, 'us100', { nomPersonne: () => 'Trump', nomSujet: () => 'droits de douane' });
  v(P.n === 6 && P.baisses === 5 && /Les 6 dernières fois que Trump a parlé de droits de douane : Nasdaq en moyenne −0,6 % sur 1 h \(5 baisses sur 6\)/.test(P.texte), 'précédent : ' + P.texte);
  v(/pas assez d’historique/.test(precedentDe(M.slice(0, 2), nouv, 'us100').texte) && /pas assez d’historique/.test(precedentDe(M, { ...nouv, personne: 'powell' }, 'us100').texte), 'moins de 3 précédents : « pas assez d’historique »');
  v(memoriser([], { id: 'z', personne: 'trump', sujets: ['taux'], t: 1, reaction: { attente: true, mesuree: 1, actifs: {} } }).length === 0, 'une mesure encore en cours n’entre pas dans la mémoire');
}

console.log('— alertes —');
{
  const art = (titre, dt, source = 'trump') => ({ source, titre, t: T0 - dt * MIN, guid: titre + dt, lien: 'https://x.test/' + dt });
  let E = integrer(etatVide(), [art('Trump: new tariffs on Chinese semiconductor chips effective immediately', 5), { ...art('FinancialJuice: Trump new tariffs on Chinese semiconductor chips effective immediately', 4, 'financialjuice') }, { ...art('Trump new tariffs on Chinese semiconductor chips effective immediately', 3, 'investinglive') }], T0);
  const c = E.cartes[0]; v(c.score >= 70 && c.score < 80 && alertesDe(E, T0).nouvelles.length === 0, 'avant la réaction du marché, le score reste sous le seuil de 80 (' + c.score + ') : pas d’alerte');
  E = fusionnerCartes(E, [{ ...c, reaction: { mesuree: 3, attente: false, actifs: {}, max: { actif: 'us100', horizon: 15, pct: -0.9, atr: 1.8 }, texte: 'le marché a réagi : Nasdaq −0,9 % en 15 min' } }], T0); v(E.cartes[0].score >= 80, 'la réaction réelle du marché la fait passer au-dessus de 80 (' + E.cartes[0].score + ')');
  let R = alertesDe(E, T0); v(R.nouvelles.length === 1 && /^Trump sur Truth Social : /.test(R.nouvelles[0].texte) && /Score \d+\.$/.test(R.nouvelles[0].texte), 'une alerte en une phrase : ' + R.nouvelles[0].texte);
  v(alertesDe(R.etat, T0 + MIN).nouvelles.length === 0, 'pas deux fois la même alerte');
  // 2e info du même fil 10 minutes plus tard : regroupée ; 40 minutes plus tard : nouvelle alerte ; revirement : toujours
  let E2 = integrer(R.etat, [art('Trump: more tariffs coming on Chinese semiconductor chips, 50% increase', -10)], T0 + 10 * MIN); let R2 = alertesDe(E2, T0 + 10 * MIN, { seuil: 70 });
  v(E2.fils.length === 1 && R2.nouvelles.length === 0, 'même fil dans les 30 minutes : pas de nouvelle alerte');
  let E3 = integrer(E2, [art('Trump says he is pausing the tariffs on Chinese semiconductor chips after a deal', -15)], T0 + 15 * MIN); const fil = E3.fils[0]; let R3 = alertesDe(E3, T0 + 15 * MIN, { seuil: 70 });
  v(fil.revirement && R3.nouvelles.length === 1 && R3.nouvelles[0].revirement && /^REVIREMENT\. /.test(R3.nouvelles[0].texte), 'revirement : alerte même dans les 30 minutes, marquée REVIREMENT');
  const E4 = { ...E, alerteesFils: {}, alerteesCartes: {} }; v(alertesDe(E4, T0, { seuil: 101 }).nouvelles.length === 0, 'seuil réglable');
  v(phraseAlerte({ ...c, reaction: { max: { actif: 'us100', horizon: 15, pct: -0.9, atr: 1.8 }, texte: 'le marché a réagi : Nasdaq −0,9 % en 15 min' }, score: 88 }).includes('Nasdaq −0,9 % en 15 min. Score 88.'), 'la réaction mesurée est dans l’alerte');
}

console.log('— fusion entre deux écrivains (Worker et GitHub Actions) —');
{
  const art = (source, titre, dt) => ({ source, titre, t: T0 - dt * MIN, guid: source + dt, lien: 'https://x.test/' + source });
  const W = integrer(etatVide(), [art('trump', 'Trump: new tariffs on semiconductor chips effective immediately', 20)], T0);
  const A = integrer(etatVide(), [art('trump', 'Trump: new tariffs on semiconductor chips effective immediately', 20), art('coindesk', 'Bitcoin ETF record inflows crypto rally continues strongly', 10)], T0);
  A.cartes.find(x => /tariffs/.test(x.titre)).reaction = { mesuree: 3, attente: false, actifs: {}, max: { actif: 'us100', horizon: 15, pct: -1, atr: 2 }, texte: 'le marché a réagi : Nasdaq −1,0 % en 15 min' };
  const F = fusionnerCartes(W, A.cartes, T0);
  v(F.cartes.length === 2 && F.cartes.find(c => /tariffs/.test(c.titre)).reaction.max.atr === 2, 'fusion : cartes identiques unies, réaction mesurée conservée, carte nouvelle ajoutée');
}
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
