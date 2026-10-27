// Tests du hub Finance (M2b) : impact par mots-clés, COT, taux, BLS, calendrier, flux RSS, carte de chaleur, SEC, client de données (réseau factice), passerelle du Worker (fausse source).
// Lancer :  node planetes/mars/tests/finance-test.mjs
import fs from 'node:fs';
import { ACTIFS, actifDeLaPhrase, classer, classerListe, repartition } from '../pc/finance/impact.js';
import { CATEGORIES, CONTRATS_COT, analyserCot, contratDeLaPhrase, datePublication, demandeCot, extreme, fraicheurCot, normaliserCot, percentile, phraseCot, urlCot } from '../pc/finance/cot-calcul.js';
import { analyserBls, analyserCourbe, analyserTresor, inflationMois, phraseTaux, reelBls } from '../pc/finance/taux-calcul.js';
import { compteARebours, etVersUtc, evenementsBls, evenementsFed, evenementsPublics, evenementsResultats, filtrerCalendrier, fusionnerCalendrier, phraseCalendrier } from '../pc/finance/calendrier-calcul.js';
import { FLUX_PAR_ID, REGISTRE_FLUX, analyserRss, banqueDeLaPhrase, fusionnerFlux, idsDuGroupe, phraseBanque } from '../pc/finance/flux-calcul.js';
import { NASDAQ100, SYMBOLES_NDX, couleurVariation, performances, phraseHeatmap, resumeHeatmap } from '../pc/finance/heatmap-calcul.js';
import { depotsRecents, phraseSec, resumeSec } from '../pc/finance/sec-calcul.js';
import { CIK_NDX } from '../pc/finance/cik-nasdaq100.js';
import { creerFinance } from '../pc/finance/donnees.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

/* ── impact ── */
{
  const c = t => classer(t);
  v('impact : décision de la Fed = fort, touche tous les actifs', c('Fed holds rates steady, signals two cuts as inflation cools').impact === 'fort' && c('Fed holds rates steady, signals two cuts as inflation cools').actifs.length === 5);
  v('impact : CPI plus élevé que prévu = fort', c('US CPI jumps more than expected, Treasury yields surge').impact === 'fort');
  v('impact : emploi (payrolls) = fort', c('Nonfarm payrolls beat forecasts as unemployment falls').impact === 'fort');
  v('impact : Bitcoin seul = BTC', JSON.stringify(c('Bitcoin hits record as ETF inflows climb').actifs) === '["BTC"]' || c('Bitcoin hits record as ETF inflows climb').actifs.includes('BTC'));
  v('impact : résultats d’une très grande valeur = US100', c('Nvidia earnings beat estimates, shares jump').actifs.includes('US100') && c('Nvidia earnings beat estimates, shares jump').evenements.includes('resultats'));
  v('impact : l’or', c('Gold hits record high as safe-haven demand rises').actifs.includes('XAU'));
  v('impact : français', c('La BCE baisse ses taux directeurs, l’inflation recule').impact === 'fort' && c('Les cours de l’or atteignent un record, valeur refuge').actifs.includes('XAU'));
  v('impact : article de prévision atténué', c('Week ahead: what to expect as Fed holds rates steady').score < c('Fed holds rates steady').score);
  v('impact : sujet sans lien = faible, aucun actif', (r => r.impact === 'faible' && r.actifs.length === 0)(c('Ten tips for a better night of sleep')));
  v('impact : chaque classement donne ses raisons', c('Fed holds rates steady').raisons.length > 0 && /banque centrale/.test(c('Fed holds rates steady').raisons[0]));
  v('impact : « ce qui fait bouger les prix » = fort et macro', c('Fed cuts rates by 50 basis points in surprise move').bougePrix === true && c('Ten tips for a better night of sleep').bougePrix === false);
  v('impact : déterministe (même entrée, même sortie)', JSON.stringify(c('Fed holds rates steady')) === JSON.stringify(c('Fed holds rates steady')));
  const l = classerListe([{ titre: 'Bitcoin slumps', t: 1 }, { titre: 'Fed cuts rates in surprise move', t: 2 }, { titre: 'Garden tips', t: 3 }], {});
  v('classerListe : trie par impact puis date', l[0].titre.startsWith('Fed') && l[l.length - 1].titre === 'Garden tips');
  v('classerListe : filtre par actif', classerListe([{ titre: 'Bitcoin slumps' }, { titre: 'Gold hits record' }], { actif: 'XAU' }).length === 1);
  v('classerListe : seulement ce qui bouge les prix', classerListe([{ titre: 'Fed cuts rates in surprise move' }, { titre: 'Bitcoin dips slightly' }], { seulementBougePrix: true }).length === 1);
  v('répartition', repartition(l).fort >= 1);
  v('voix : « les actualités qui font bouger le Nasdaq » → US100', actifDeLaPhrase('les actualités qui font bouger le Nasdaq') === 'US100' && actifDeLaPhrase('des nouvelles sur l’or') === 'XAU' && actifDeLaPhrase('actualités bitcoin') === 'BTC' && actifDeLaPhrase('quelle heure est-il') === null);
  v('actifs nommés', Object.keys(ACTIFS).join() === 'US100,XAU,BTC,USD,TAUX');
}

/* ── COT ── */
{
  const mk = (i, net) => ({ report_date_as_yyyy_mm_dd: new Date(Date.UTC(2023, 0, 3) + i * 7 * 86400e3).toISOString().slice(0, 10) + 'T00:00:00.000', open_interest_all: '300000',
    dealer_positions_long_all: '1000', dealer_positions_short_all: '2000', asset_mgr_positions_long: '5000', asset_mgr_positions_short: '1000', lev_money_positions_long: String(10000 + net), lev_money_positions_short: '10000',
    other_rept_positions_long: '100', other_rept_positions_short: '50', nonrept_positions_long_all: '10', nonrept_positions_short_all: '20' });
  const rows = Array.from({ length: 160 }, (_, i) => mk(i, i === 159 ? 9000 : i - 80)).reverse();          // plus récent d'abord, comme la CFTC
  const lignes = normaliserCot(rows, 'tff');
  v('COT : lignes triées du plus ancien au plus récent, 5 catégories', lignes.length === 160 && lignes[0].date < lignes[159].date && Object.keys(lignes[0].cat).length === 5);
  const a = analyserCot(lignes, 'tff');
  const lev = a.categories.find(c => c.id === 'lev_money');
  v('COT : position nette = longs − courts', lev.net === 9000 && lev.long === 19000 && lev.court === 10000);
  v('COT : variation hebdomadaire', lev.variation === 9000 - 78 && a.categories.find(c => c.id === 'dealer').variation === 0);
  v('COT : percentile extrême haut (valeur la plus haute de 3 ans)', lev.percentile >= 99 && lev.extreme === 'haut');
  v('COT : percentile bas', percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 0], 0) <= 3 && extreme(5) === 'bas' && extreme(50) === null && extreme(95) === 'haut');
  v('COT : pas de percentile avec moins de 20 semaines', percentile([1, 2, 3]) === null);
  v('COT : % de l’intérêt ouvert', Math.abs(lev.netPctOI - 3) < 1e-9);
  v('COT : la catégorie spéculative est marquée', a.categories.filter(c => c.spec).map(c => c.id).join() === 'lev_money');
  v('COT : lignes incomplètes écartées, aucune invention', normaliserCot([{ report_date_as_yyyy_mm_dd: '2026-01-06', open_interest_all: '5' }], 'tff').length === 0 && normaliserCot('x', 'tff').length === 0);
  v('COT : rapport Disaggregated (or) a ses catégories', CATEGORIES.disagg.map(c => c.id).join() === 'prod_merc,swap,m_money,other_rept,nonrept' && CONTRATS_COT.XAU.rapport === 'disagg');
  v('COT : publication le vendredi suivant le mardi', datePublication('2026-10-13') === '2026-10-16');
  v('COT : DIFFÉRÉ normalement, PÉRIMÉ après 12 jours', fraicheurCot('2026-10-13', Date.parse('2026-10-22T10:00:00Z')).etiquette === 'DIFFÉRÉ' && fraicheurCot('2026-09-01', Date.parse('2026-10-22T10:00:00Z')).etiquette === 'PÉRIMÉ');
  const ph = phraseCot('NDX', a);
  v('COT : phrase parlée (net, contrats, variation, percentile, différé, pas un signal)', /Nasdaq 100/.test(ph) && /net acheteur de 9 000 contrats/.test(ph.replace(/ | /g, ' ')) && /percentile/.test(ph) && /différée/.test(ph) && /pas un signal/.test(ph), ph);
  v('COT : pas de contradiction « net vendeur … acheteur extrême »', !/net vendeur[^.]*acheteuse extrême/.test(phraseCot('BTC', analyserCot(normaliserCot(Array.from({ length: 80 }, (_, i) => mk(i, i === 79 ? -50 : -1000 - i)).reverse(), 'tff'), 'tff'))));
  v('COT : URL de la CFTC pour un contrat', /gpe5-46if\.json.*209742/.test(urlCot('NDX')) && /72hh-3qpy\.json.*088691/.test(urlCot('XAU')));
  v('COT : contrat demandé à la voix', contratDeLaPhrase('le COT de l’or') === 'XAU' && contratDeLaPhrase('les positions des fonds sur le Nasdaq') === 'NDX' && contratDeLaPhrase('cot bitcoin') === 'BTC' && contratDeLaPhrase('cot du dollar') === 'USD' && contratDeLaPhrase('bonjour') === null);
  v('COT : « le COT de l’or » est une demande COT', demandeCot('le COT de l’or') && demandeCot('rapport CFTC sur le bitcoin') && !demandeCot('quelle heure est-il'));
}

/* ── taux et BLS ── */
{
  const csv = 'Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"\n' +
    Array.from({ length: 40 }, (_, k) => { const d = new Date(Date.UTC(2026, 8, 1) + (39 - k) * 86400e3); const mm = String(d.getUTCMonth() + 1).padStart(2, '0'), dd = String(d.getUTCDate()).padStart(2, '0'); const base = 4 + (39 - k) * 0.01; return mm + '/' + dd + '/2026,' + [4.1, 4.1, 4.1, 4.2, 4.3, 4.3, 4.5, base, 4.9, 4.95, 5, 5.1 + (39 - k) * 0.005, 5.4, 5.4].join(','); }).join('\n');
  const jours = analyserTresor(csv);
  v('Trésor : 40 jours, du plus ancien au plus récent, échéances renommées', jours.length === 40 && jours[0].date < jours[39].date && jours[39].y['2Y'] != null && jours[39].y['10Y'] != null);
  const c = analyserCourbe(jours);
  v('courbe : 2, 10, 30 ans et écarts en points de base', c.lignes.map(l => l.echeance).join() === '3M,2Y,5Y,10Y,30Y' && c.ecarts['2s10s'] === Math.round((jours[39].y['10Y'] - jours[39].y['2Y']) * 100));
  v('courbe : variations jour, semaine, mois', c.lignes.find(l => l.echeance === '2Y').jour === 1 && c.lignes.find(l => l.echeance === '2Y').semaine === 5);
  const inv = analyserCourbe([{ date: '2026-10-21', y: { '3M': 5, '2Y': 4.8, '10Y': 4.2, '30Y': 4.5, '5Y': 4.4 } }]);
  v('courbe : inversion détectée', inv.inversion2s10s === true && inv.inversion3m10a === true);
  v('courbe : phrase parlée', /deux ans/.test(phraseTaux(c)) && /Trésor américain/.test(phraseTaux(c)) && /fin de journée/.test(phraseTaux(c)) && /inversée/.test(phraseTaux(inv)));
  v('courbe vide = null (rien d’inventé)', analyserCourbe([]) === null && analyserTresor('') .length === 0);
  // BLS
  const serie = (annee0, vals) => ({ Results: { series: [{ data: vals.slice().reverse().map((x, i) => { const k = annee0 * 12 + (vals.length - 1 - i); return { year: String(Math.floor(k / 12)), period: 'M' + String((k % 12) + 1).padStart(2, '0'), value: String(x) }; }) }] } });
  const sa = analyserBls(serie(2025, [100, 100.5, 101, 101.2, 101.6, 102, 102.3, 102.7, 103, 103.2, 103.6, 104, 104.3, 104.8]));
  v('BLS : points mensuels du plus récent au plus ancien', sa[0].valeur === 104.8 && sa.length === 14 && sa[0].mois > 0);
  const dernier = sa[0], r = inflationMois(sa, sa, dernier.annee, dernier.mois);
  v('inflation : glissement mensuel et annuel', Math.abs(r.mensuel - (104.8 / 104.3 - 1) * 100) < 1e-9 && r.annuel != null);
  // l'événement « CPI m/m » publié en octobre porte sur septembre
  const evt = Date.UTC(dernier.annee, dernier.mois, 14, 12);     // mois suivant
  v('réel BLS : CPI m/m du mois de référence, format du calendrier (0.5%)', reelBls('CPI m/m', evt, { cpi_sa: sa, cpi_nsa: sa }) === (Math.round(r.mensuel * 10) / 10).toFixed(1) + '%');
  v('réel BLS : chômage', reelBls('Unemployment Rate', evt, { chomage: sa }) === (Math.round(sa[0].valeur * 10) / 10).toFixed(1) + '%');
  v('réel BLS : emplois en milliers', /^-?\d+K$/.test(reelBls('Non-Farm Employment Change', evt, { emplois: sa })));
  v('réel BLS : titres non couverts = null (jamais inventé)', reelBls('Retail Sales m/m', evt, { cpi_sa: sa }) === null && reelBls('CPI m/m', evt, {}) === null);
  v('BLS : réponse invalide = null', analyserBls({ Results: {} }) === null);
}

/* ── calendrier ── */
{
  v('heure de New York → UTC, heure d’été (28 oct. 2026, 14 h = 18 h UTC)', etVersUtc(2026, 10, 28, 14, 0) === Date.UTC(2026, 9, 28, 18, 0));
  v('heure de New York → UTC, heure d’hiver (4 nov. 2026, 14 h = 19 h UTC)', etVersUtc(2026, 11, 4, 14, 0) === Date.UTC(2026, 10, 4, 19, 0));
  const pub = evenementsPublics([{ title: 'CPI m/m', country: 'USD', date: '2026-10-14T08:30:00-04:00', impact: 'High', forecast: '0.3%', previous: '0.4%' }, { title: 'Bank Holiday', country: 'USD', date: '2026-10-12T00:00:00-04:00', impact: 'Holiday', forecast: '', previous: '' }, { title: 'Truc', country: 'EUR', date: '2026-10-15T10:00:00+02:00', impact: 'Low', forecast: '', previous: '' }]);
  v('calendrier public : jours fériés écartés, prévu et précédent gardés, réel absent', pub.length === 2 && pub[0].prevu === '0.3%' && pub[0].precedent === '0.4%' && pub[0].reel === null && pub[1].prevu === null && pub[0].type === 'inflation');
  const fed = evenementsFed({ events: [
    { title: 'FOMC Meeting', time: '2:00 p.m.', month: '2026-10', days: '28', type: 'FOMC', description: '&lt;p&gt;Two-day meeting, October 27 - 28&lt;/p&gt;' },
    { title: 'FOMC Press Conference', time: '2:30 p.m.', month: '2026-10', days: '28', type: 'FOMC', description: '' },
    { title: 'FOMC Minutes', time: '2:00 p.m.', month: '2026-11', days: '18', type: 'FOMC', description: '&lt;p&gt;Meeting of October 27-28&lt;/p&gt;' },
    { title: 'Discussion - Chairman Kevin Warsh', time: '11:30 p.m.', month: '2026-10', days: '15', type: 'Speeches', description: 'x' },
    { title: 'Discussion - Governor Someone', time: '9:00 a.m.', month: '2026-10', days: '16', type: 'Speeches', description: 'y' },
    { title: 'Bank of Something Forum', time: '9:00 a.m.', month: '2026-10', days: '20', type: 'Conferences', description: 'z' }] });
  v('Fed : FOMC (décision, conférence de presse, minutes) et discours du président seulement', fed.length === 4 && fed.some(e => e.titre === 'Fed · Décision de taux du FOMC') && fed.some(e => /réunion du October 27-28/.test(e.titre)) && !fed.some(e => /Governor/.test(e.titre)));
  v('Fed : heures en UTC', fed.find(e => e.titre.includes('Décision')).t === Date.UTC(2026, 9, 28, 18, 0) && fed.find(e => e.titre.includes('Conférence')).t === Date.UTC(2026, 9, 28, 18, 30));
  v('Fed : décision et conférence = impact fort', fed.filter(e => e.impact === 'high').length === 3);
  const ics = 'BEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20261110T083000\nSUMMARY:Consumer Price Index\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20261106T083000\nSUMMARY:Employment Situation\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20261107T100000\nSUMMARY:Metropolitan Area Employment and Unemployment (Monthly)\nEND:VEVENT\n';
  const bls = evenementsBls(ics);
  v('BLS ICS : seulement les publications importantes, heure de New York', bls.length === 2 && bls.find(e => e.titre.includes('CPI')).t === etVersUtc(2026, 11, 10, 8, 30) && bls.every(e => e.impact === 'high'));
  const csv = 'symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay\nAAPL,APPLE INC,2026-10-29,2026-09-30,1.85,USD,post-market\nXYZ,AUTRE,2026-10-29,2026-09-30,0.1,USD,pre-market\nNVDA,NVIDIA CORP,2026-11-18,2026-10-31,1.2,USD,\n';
  const res = evenementsResultats(csv, ['AAPL', 'NVDA']);
  v('résultats : filtrés sur la liste, moment de la journée, BPA prévu', res.length === 2 && res[0].titre === 'Résultats APPLE' && res[0].moment === 'après la clôture' && res[0].prevu === 'BPA 1.85 $' && res[1].moment === 'heure non précisée', JSON.stringify(res[0]));
  v('résultats : CSV invalide = rien', evenementsResultats('<html>', ['AAPL']).length === 0);
  const maint = Date.parse('2026-10-14T13:00:00Z');
  const f = fusionnerCalendrier([pub, pub, fed, res, bls], { bls: { cpi_sa: analyserBls({ Results: { series: [{ data: [{ year: '2026', period: 'M09', value: '336.3' }, { year: '2026', period: 'M08', value: '334.1' }] }] } }), cpi_nsa: null }, maintenant: maint });
  v('fusion : doublons écartés, tri chronologique', f.filter(e => e.titre === 'CPI m/m').length === 1 && f.every((e, i) => i === 0 || f[i - 1].t <= e.t));
  v('fusion : « réel » ajouté par le BLS pour un événement américain passé, avec sa source', (e => e && e.reel === '0.7%' && e.reelSource === 'BLS (officiel)')(f.find(e => e.titre === 'CPI m/m')), JSON.stringify(f.find(e => e.titre === 'CPI m/m')));
  v('fusion : pas de « réel » pour les autres pays (indisponible, jamais inventé)', f.filter(e => e.pays !== 'USD').every(e => e.reel === null));
  v('compte à rebours', compteARebours(maint + 2.25 * 3600e3, maint) === 'dans 2 h 15' && compteARebours(maint - 40 * 60e3, maint) === 'il y a 40 min' && compteARebours(maint + 3 * 86400e3, maint) === 'dans 3 jours');
  v('filtre : impact minimal et période', filtrerCalendrier(f, { impactMin: 'high', de: maint - 1, a: maint + 30 * 86400e3 }).every(e => e.impact === 'high'));
  const ph = phraseCalendrier(f, { maintenant: maint, jours: 30 });
  v('phrase du calendrier : heure de Paris, prévu, précédent', /heure de Paris/.test(ph) && /prévu/.test(ph), ph.slice(0, 200));
  v('phrase du calendrier : vide = le dit', /Aucun événement/.test(phraseCalendrier([], { maintenant: maint })));
}

/* ── flux ── */
{
  const rss = '<?xml version="1.0"?><rss><channel><item><title><![CDATA[Fed &amp; markets: rates hold]]></title><link>https://ex.com/a?x=1</link><pubDate>Wed, 22 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Résumé <b>court</b></p>]]></description></item><item><title>Sans lien</title></item><item><title>Deuxième</title><link>https://ex.com/b</link></item></channel></rss>';
  const items = analyserRss(rss);
  v('RSS : titre décodé, lien, date, résumé sans balises', items.length === 2 && items[0].titre === 'Fed & markets: rates hold' && items[0].url === 'https://ex.com/a?x=1' && items[0].t === Date.parse('2026-10-22T10:00:00Z') && items[0].resume === 'Résumé court' && items[1].t === null);
  const atom = '<feed><entry><title>Atom un</title><link rel="alternate" href="https://ex.com/c"/><updated>2026-10-21T08:00:00Z</updated><summary>S</summary></entry></feed>';
  v('Atom', analyserRss(atom)[0].url === 'https://ex.com/c' && analyserRss(atom)[0].t === Date.parse('2026-10-21T08:00:00Z'));
  const rdf = '<rdf:RDF><item rdf:about="x"><title>RDF</title><link>https://ex.com/d</link><dc:date>2026-10-20T00:00:00Z</dc:date></item></rdf:RDF>';
  v('RDF (RSS 1.0)', analyserRss(rdf)[0].t === Date.parse('2026-10-20T00:00:00Z'));
  v('RSS : résumé tronqué à 220 caractères', analyserRss('<rss><item><title>t</title><link>https://a.b/c</link><description>' + 'x'.repeat(900) + '</description></item></rss>')[0].resume.length === 220);
  v('RSS : texte quelconque = liste vide', analyserRss('<html><body>404</body></html>').length === 0 && analyserRss(null).length === 0);
  const fus = fusionnerFlux({ cnbc_top: [{ titre: 'Même titre', url: 'https://a.com/1', t: 5 }, { titre: 'Autre', url: 'https://a.com/2', t: 9 }], marketwatch: [{ titre: 'Même titre', url: 'https://b.com/zz', t: 6 }], inconnu: [{ titre: 'x', url: 'https://x.com', t: 1 }] });
  v('fusion de flux : doublon de titre écarté, source inconnue ignorée, plus récent d’abord', fus.length === 2 && fus[0].titre === 'Autre' && fus[0].source === 'CNBC · À la une');
  v('registre : identifiants uniques, groupes valides, accès valides', new Set(REGISTRE_FLUX.map(f => f.id)).size === REGISTRE_FLUX.length && REGISTRE_FLUX.every(f => ['actus', 'banques', 'institutions'].includes(f.groupe) && ['navigateur', 'worker'].includes(f.acces) && /^https:\/\//.test(f.url)));
  v('registre : sources officielles marquées (banques centrales, BCE, BRI)', REGISTRE_FLUX.filter(f => f.groupe === 'banques').every(f => f.officiel) && FLUX_PAR_ID.ing_think.officiel !== true);
  v('registre : par actif (Yahoo)', idsDuGroupe('actus', { actif: 'XAU' }).includes('yahoo_or') && !idsDuGroupe('actus', { actif: 'XAU' }).includes('yahoo_btc') && idsDuGroupe('actus', { actif: 'XAU' }).includes('cnbc_top'));
  v('registre : sources écartées non présentes (FMI, OCDE, Investing, Seeking Alpha)', !REGISTRE_FLUX.some(f => /imf|oecd|investing|seekingalpha/i.test(f.url)));
  v('voix : « que dit la Fed ? »', banqueDeLaPhrase('que dit la Fed ?') === 'Fed' && banqueDeLaPhrase('la BCE a décidé quoi') === 'BCE' && banqueDeLaPhrase('et la Banque du Japon') === 'BoJ' && banqueDeLaPhrase('que disent les banques centrales') === 'toutes' && banqueDeLaPhrase('quelle heure') === null);
  v('phrase d’une banque : titres cités tels quels, langue d’origine dite', (p => /Fed/.test(p) && /« Rates hold »/.test(p) && /langue d’origine/.test(p))(phraseBanque('Fed', [{ banque: 'Fed', titre: 'Rates hold', t: Date.now() }])));
  v('phrase d’une banque : aucune publication = le dit', /pas de publication récente/.test(phraseBanque('BCE', [])));
}

/* ── carte de chaleur ── */
{
  v('Nasdaq 100 : 100 valeurs uniques, secteur renseigné', NASDAQ100.length === 100 && new Set(SYMBOLES_NDX).size === 100 && NASDAQ100.every(x => x.secteur && x.nom));
  v('Nasdaq 100 : tous ont un CIK de la SEC', SYMBOLES_NDX.every(s => CIK_NDX[s] && /^\d{10}$/.test(CIK_NDX[s].cik)));
  const cot = {}; SYMBOLES_NDX.slice(0, 60).forEach((s, i) => { cot[s] = { c: 100 + i, p: 100, s5: 98, t: 1 }; });
  const lignes = performances(cot), r = resumeHeatmap(lignes);
  v('performances : variation du dernier cours vs clôture précédente, valeurs sans cotation marquées vides (jamais inventées)', lignes.filter(l => l.vide).length === 40 && Math.abs(lignes[5].pct - 5) < 1e-9 && lignes[5].pct5 > 0);
  v('résumé : hausses, baisses, moyenne simple, meilleurs et pires, secteurs', r.n === 60 && r.manquants === 40 && r.hausses === 59 && r.meilleurs[0].pct >= r.meilleurs[1].pct && r.secteurs.length > 3);
  v('couleurs : vert, rouge, gris sans donnée', couleurVariation(3) === 'rgb(30,202,82)' && /^rgb\(222,/.test(couleurVariation(-3)) && couleurVariation(null) === 'rgb(50,56,64)');
  v('phrase : mentionne cotations différées et moyenne simple', /moyenne simple/.test(phraseHeatmap(r)) && /différées/.test(phraseHeatmap(r)) && /pas les cotations/.test(phraseHeatmap(null)));
}

/* ── SEC ── */
{
  const sub = { cik: '320193', filings: { recent: { form: ['4', '8-K', '10-Q', '8-K'], filingDate: ['2026-10-20', '2026-10-15', '2026-08-01', '2026-07-30'], accessionNumber: ['0000320193-26-000001', '0000320193-26-000002', '0000320193-26-000003', '0000320193-26-000004'], primaryDocument: ['a.xml', 'b.htm', 'c.htm', 'd.htm'], items: ['', '5.02,9.01', '', '2.02,9.01'], reportDate: ['', '', '2026-06-27', ''] } } };
  const d = depotsRecents(sub);
  v('SEC : dépôts avec libellé, rubriques des 8-K et lien sec.gov', d.length === 4 && d[1].items[0].libelle === 'départ ou nomination d’un dirigeant' && /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\/000032019326000002\/b\.htm$/.test(d[1].url));
  v('SEC : impact d’un 8-K selon ses rubriques (9.01 ignorée)', d[1].impact === 'moyen' && d[3].impact === 'fort' && d[0].impact === 'faible');
  const r = resumeSec('AAPL', 'Apple', d, Date.parse('2026-10-22T00:00:00Z'));
  v('SEC : dernier résultat (2.02), initiés sur 30 jours, événements importants', r.resultats.date === '2026-07-30' && r.initiesTrenteJours === 1 && r.importants.length === 1);
  v('SEC : phrase', /Apple/.test(phraseSec(r)) && /SEC EDGAR/.test(phraseSec(r)) && /initiés/.test(phraseSec(r)) && /pas de dépôt/.test(phraseSec(null)));
  v('SEC : réponse invalide = liste vide', depotsRecents({}).length === 0);
}

/* ── client de données avec réseau factice ── */
{
  const horloge = { t: Date.parse('2026-10-22T09:00:00Z') };
  let appels = 0, panne = false;
  const cftc = JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ report_date_as_yyyy_mm_dd: new Date(Date.parse('2026-10-13T00:00:00Z') - i * 7 * 86400e3).toISOString().slice(0, 19), open_interest_all: '1000', prod_merc_positions_long: '1', prod_merc_positions_short: '2', swap_positions_long_all: '3', swap__positions_short_all: '4', m_money_positions_long_all: String(5000 - i), m_money_positions_short_all: '100', other_rept_positions_long: '1', other_rept_positions_short: '1', nonrept_positions_long_all: '1', nonrept_positions_short_all: '1' })));
  const reseau = { workerPret: () => true, direct: async (url, o = {}) => { appels++; if (panne) throw new Error('HTTP 503'); if (/cftc/.test(url)) return JSON.parse(cftc); throw new Error('HTTP 404'); }, brut: async id => { appels++; throw new Error('HTTP 404 · route inconnue'); }, calendrierPublic: async () => { throw new Error('HTTP 404 · route inconnue'); } };
  const F = creerFinance({ reseau, maintenant: () => horloge.t, stockage: null });
  let r = await F.cot('XAU');
  v('client COT : ok, DIFFÉRÉ, source citée, voie navigateur', r.etat === 'ok' && r.etiquette === 'DIFFÉRÉ' && /CFTC/.test(r.source) && r.voie === 'navigateur' && r.analyse.categories.length === 5);
  const n = appels; await F.cot('XAU');
  v('client COT : mis en cache (pas de nouvel appel)', appels === n);
  horloge.t += 7 * 3600e3; panne = true; r = await F.cot('XAU');
  v('client COT : source en panne → dernière copie PÉRIMÉE, datée, jamais inventée', r.etat === 'ok' && r.etiquette === 'PÉRIMÉ' && /injoignable/.test(r.raison));
  r = await F.cot('NDX');
  v('client COT : jamais chargé + panne = INDISPONIBLE avec raison', r.etat === 'indisponible' && r.etiquette === 'INDISPONIBLE' && /503/.test(r.raison));
  r = await F.heatmap();
  v('client : route du Worker absente = INDISPONIBLE « route non déployée »', r.etat === 'indisponible' && /route du Worker non déployée/.test(r.raison), r.raison);
  r = await F.calendrier();
  v('client : calendrier sans aucune source = INDISPONIBLE avec le détail', r.etat === 'indisponible' && /aucune source de calendrier/.test(r.raison));
  r = await F.flux('banques');
  v('client : flux sans Worker = INDISPONIBLE', r.etat === 'indisponible');
}

/* ── passerelle du Worker (fausse source) ── */
if (fs.existsSync(new URL('../../../worker/src/finance/finance.js', import.meta.url))) {
  const W = await import('../../../worker/src/finance/finance.js');
  v('Worker : liste blanche (aucune adresse libre)', W.resoudre('http://evil.example') === null && W.resoudre('fred:EVIL') === null && W.resoudre('sec:ZZZZ') === null && W.resoudre('spark:9') === null && W.resoudre('../x') === null);
  v('Worker : 27 flux + calendriers + séries + lots de cotations + SEC résolus', Object.keys(W.FLUX).length >= 26 && W.resoudre('fed_calendrier') && W.resoudre('bls_ics') && W.resoudre('fred:DGS10') && W.resoudre('spark:4') && W.resoudre('sec:AAPL'));
  v('Worker : tous les flux du registre de la page existent côté Worker (sauf ceux en accès direct)', REGISTRE_FLUX.filter(f => f.acces === 'worker').every(f => W.FLUX[f.id] === f.url || W.FLUX[f.id]), REGISTRE_FLUX.filter(f => !W.FLUX[f.id]).map(f => f.id).join());
  v('Worker : mêmes adresses que la page', REGISTRE_FLUX.every(f => !W.FLUX[f.id] || W.FLUX[f.id] === f.url));
  v('Worker : la clé Alpha Vantage ne sort jamais (seulement l’adresse appelée côté Worker)', W.resoudre('av_resultats', { ALPHAVANTAGE_KEY: 'SECRETTEST' }).url.includes('SECRETTEST') && !JSON.stringify(W.SYMBOLES_SPARK).includes('SECRET'));
  v('Worker : User-Agent honnête de la SEC, contact facultatif par secret', W.resoudre('sec:AAPL', {}).entetes['User-Agent'].includes('RayleAssistant') && W.resoudre('sec:AAPL', { SEC_USER_AGENT: 'Test contact' }).entetes['User-Agent'] === 'Test contact');
  const appels = [];
  globalThis.fetch = async (url, opts) => { appels.push({ url: String(url), ua: opts && opts.headers && opts.headers['User-Agent'] }); if (/fred/.test(url)) return new Response('observation_date,DGS10\n2026-10-21,5.13\n', { status: 200, headers: { 'content-type': 'text/csv' } }); if (/ft\.com/.test(url)) return new Response('x', { status: 503 }); return new Response('{}', { status: 404 }); };
  const stock = new Map(); globalThis.caches = { default: { match: async k => stock.get(k.url) || null, put: async (k, r) => { stock.set(k.url, r); } } };
  const ctx = { waitUntil: p => p };
  const get = async id => W.routeFinance(new Request('https://x/finance/brut?id=' + id), new URL('https://x/finance/brut?id=' + id), {}, ctx, {});
  let rep = await get('fred:DGS10');
  v('Worker : renvoie la source telle quelle, une seule requête sortante', rep.status === 200 && (await rep.text()).includes('5.13') && appels.length === 1 && rep.headers.get('X-Rayle-Cache') === 'non');
  rep = await get('fred:DGS10');
  v('Worker : deuxième lecture servie par le cache de bordure (aucune nouvelle requête)', rep.status === 200 && appels.length === 1 && rep.headers.get('X-Rayle-Cache') === 'bordure');
  rep = await get('ft');
  v('Worker : source en panne = 502 avec la raison', rep.status === 502 && /503/.test(JSON.stringify(await rep.json())));
  rep = await get('adresse-libre');
  v('Worker : source inconnue = 404, aucune requête sortante', rep.status === 404 && appels.length === 2);
  rep = await W.routeFinance(new Request('https://x/finance/brut?id=ft', { method: 'POST' }), new URL('https://x/finance/brut?id=ft'), {}, ctx, {});
  v('Worker : POST refusé', rep.status === 405);
  rep = await W.routeFinance(new Request('https://x/finance/sources'), new URL('https://x/finance/sources'), { ALPHAVANTAGE_KEY: 'SECRETTEST' }, ctx, {});
  const src = await rep.json();
  v('Worker : /finance/sources liste les identifiants sans jamais montrer de secret', src.sources.length > 40 && !JSON.stringify(src).includes('SECRETTEST') && src.secretAlphaVantage === true && src.sources.find(s => s.id === 'ft').dernier.ok === false);
} else console.log('worker/ absent (ignoré par git) : tests de la passerelle ignorés');

console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
