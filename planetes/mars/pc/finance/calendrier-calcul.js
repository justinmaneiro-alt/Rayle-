import { reelBls } from './taux-calcul.js';

/* ═════════════ CALENDRIER ÉCONOMIQUE ET DES RÉSULTATS (M2b ; module pur, testé : finance-test.mjs) ═════════════
   Sources : (1) calendrier public hebdomadaire (Forex Factory, via la route /calendar du Worker déjà en ligne) : titre, pays, impact, prévu, précédent — PAS de valeur « réelle » ;
   (2) calendrier officiel de la Fed (federalreserve.gov/json/calendar.json, via le Worker) : réunions du FOMC, conférences de presse, minutes, Livre beige, témoignages ;
   (3) « réel » de l'inflation, du chômage et des emplois américains : BLS (officiel, API sans clé) ; ailleurs le « réel » reste INDISPONIBLE (aucune source gratuite) ;
   (4) résultats d'entreprises du Nasdaq 100 : Alpha Vantage EARNINGS_CALENDAR (clé gratuite, via le Worker) ; sans clé : INDISPONIBLE. Les résultats DÉJÀ publiés viennent des dépôts 8-K de la SEC.
   Événement : { id, titre, t (ms), pays, impact: 'high'|'medium'|'low', prevu, precedent, reel, source, type, details? }. Rien n'est inventé : champ absent = null. */
const IMPACTS = { high: 'fort', medium: 'moyen', low: 'faible' };
export const impactFr = i => IMPACTS[i] || 'inconnu';
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const TYPES = [
  ['inflation', /\b(cpi|ppi|pce|inflation|price index)\b/i], ['emploi', /\b(employment|payroll|unemployment|jobless|claims|jolts|nonfarm|non-farm|adp)\b/i],
  ['banque_centrale', /\b(fomc|fed |federal funds|rate decision|interest rate|monetary policy|press conference|minutes|boe|ecb|boj|snb|rba|boc|governor|speaks)\b/i], ['croissance', /\b(gdp|pmi|ism|retail sales|industrial production|consumer (confidence|sentiment)|manufacturing|services)\b/i]
];
export const typeEvenement = titre => { for (const [t, re] of TYPES) if (re.test(titre)) return t; return 'autre'; };

/* Calendrier public (tableau JSON) → événements ; les jours fériés (impact « Holiday ») sont écartés. */
export function evenementsPublics(liste) {
  if (!Array.isArray(liste)) return [];
  const out = [];
  for (const e of liste) {
    const t = Date.parse(e && e.date), impact = String(e && e.impact || '').toLowerCase(); if (!Number.isFinite(t) || !['high', 'medium', 'low'].includes(impact)) continue;
    const pays = String(e.country || '').toUpperCase(), titre = String(e.title || '').slice(0, 140);
    out.push({ id: pays + ':' + hash(String(e.date) + '|' + titre), titre, t, pays, impact, prevu: nz(e.forecast), precedent: nz(e.previous), reel: null, source: 'Calendrier public (Forex Factory)', type: typeEvenement(titre) });
  }
  return out;
}
const nz = v => (v == null || String(v).trim() === '' ? null : String(v));

/* Heure de New York → instant UTC (gère l'heure d'été). */
export function etVersUtc(annee, mois, jour, h, min) {
  const cible = Date.UTC(annee, mois - 1, jour, h, min);
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  let t = cible;
  for (let i = 0; i < 3; i++) { const p = Object.fromEntries(f.formatToParts(new Date(t)).map(x => [x.type, x.value])); const lu = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute); t += cible - lu; }
  return t;
}
const heureFed = s => { const m = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i.exec(s || ''); if (!m) return null; let h = +m[1] % 12; if (m[3].toLowerCase() === 'p') h += 12; return [h, +m[2]]; };
const sansHtml = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#10;/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/* Calendrier officiel de la Fed → événements : FOMC (réunion, conférence de presse, minutes), Livre beige, témoignages du président, discours du président. */
export function evenementsFed(json) {
  const ev = json && Array.isArray(json.events) ? json.events : []; const out = [];
  for (const e of ev) {
    const m = /^(\d{4})-(\d{2})$/.exec(e.month || ''), jour = parseInt(e.days, 10), hm = heureFed(e.time); if (!m || !Number.isFinite(jour)) continue;
    const type = String(e.type || ''), titre = String(e.title || '');
    const important = type === 'FOMC' || type === 'Beige' || type === 'Testimony' || (type === 'Speeches' && /chair(man|woman)?\b/i.test(titre));
    if (!important) continue;
    const [h, min] = hm || [14, 0], t = etVersUtc(+m[1], +m[2], jour, h, min), desc = sansHtml(e.description);
    const fort = type === 'FOMC' && /^(FOMC Meeting|FOMC Press Conference|FOMC Minutes)$/i.test(titre);
    const libelle = titre === 'FOMC Meeting' ? 'Décision de taux du FOMC' : titre === 'FOMC Press Conference' ? 'Conférence de presse du FOMC' : titre.replace(/^Discussion - /, '');
    const detail = titre === 'FOMC Minutes' && desc ? ' (' + desc.replace(/^Meeting of /i, 'réunion du ') + ')' : '';
    out.push({ id: 'FED:' + hash(e.month + e.days + titre + e.time), titre: 'Fed · ' + libelle + detail, t, pays: 'USD', impact: fort ? 'high' : type === 'Testimony' || type === 'Speeches' ? 'medium' : 'low',
      prevu: null, precedent: null, reel: null, source: 'Calendrier officiel de la Fed', type: 'banque_centrale', lien: e.live || null });
  }
  return out;
}

/* Calendrier officiel du BLS (fichier ICS) : prochaines publications importantes (inflation, emploi, prix à la production…). Heures de New York. Aucune valeur prévue ni précédente (le BLS n'en donne pas). */
const BLS_IMPORTANT = [[/^Consumer Price Index/i, 'Inflation américaine (CPI)', 'high'], [/^Employment Situation/i, 'Emploi américain (rapport mensuel)', 'high'], [/^Producer Price Index/i, 'Prix à la production américains (PPI)', 'medium'],
  [/^Real Earnings/i, 'Salaires réels américains', 'low'], [/^Job Openings and Labor Turnover/i, 'Offres d’emploi américaines (JOLTS)', 'medium'], [/^Employment Cost Index/i, 'Coût du travail américain', 'medium'], [/^U\.?S\.? Import and Export Price/i, 'Prix à l’import-export américains', 'low']];
export function evenementsBls(ics) {
  const out = [];
  for (const bloc of String(ics || '').split('BEGIN:VEVENT').slice(1)) {
    const d = /DTSTART[^:]*:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(bloc), sm = /SUMMARY:(.+)/.exec(bloc); if (!d || !sm) continue;
    const resume = sm[1].replace(/\\,/g, ',').trim(), m = BLS_IMPORTANT.find(x => x[0].test(resume)); if (!m) continue;
    const t = etVersUtc(+d[1], +d[2], +d[3], +d[4], +d[5]);
    out.push({ id: 'BLS:' + hash(d[0] + resume), titre: m[1], t, pays: 'USD', impact: m[2], prevu: null, precedent: null, reel: null, source: 'Calendrier officiel du BLS', type: /Consumer|Producer|Import|Real Earnings/i.test(resume) ? 'inflation' : 'emploi' });
  }
  return out;
}

/* Résultats d'entreprises : CSV Alpha Vantage (symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay) filtré sur des symboles. */
export function evenementsResultats(csv, symboles) {
  const lignes = String(csv).split(/\r?\n/); if (lignes.length < 2 || !/^symbol,/i.test(lignes[0])) return [];
  const set = new Set(symboles), out = [];
  for (let k = 1; k < lignes.length; k++) {
    const c = lignes[k].split(','); if (c.length < 7 || !set.has(c[0])) continue;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c[2]); if (!m) continue;
    const heure = (c[6] || '').trim(), [h, min] = /pre/i.test(heure) ? [8, 0] : /post/i.test(heure) ? [16, 15] : [12, 0], t = etVersUtc(+m[1], +m[2], +m[3], h, min);
    out.push({ id: 'RES:' + c[0] + ':' + c[2], titre: 'Résultats ' + c[1].replace(/"/g, '').replace(/ (INC|CORP|CORPORATION|LTD|PLC|HOLDINGS)\.?$/i, ''), t, pays: 'USD', impact: 'medium', prevu: c[4] ? 'BPA ' + c[4] + ' $' : null, precedent: null, reel: null,
      source: 'Alpha Vantage (calendrier des résultats)', type: 'resultats', symbole: c[0], moment: /pre/i.test(heure) ? 'avant l’ouverture' : /post/i.test(heure) ? 'après la clôture' : 'heure non précisée' });
  }
  return out;
}

/* Fusion : tri chronologique, doublons écartés (même instant et même titre), « réel » ajouté pour les titres américains couverts par le BLS. */
export function fusionnerCalendrier(listes, { bls = null, maintenant = Date.now() } = {}) {
  const vus = new Set(), out = [];
  for (const l of listes) for (const e of l || []) { const k = e.t + '|' + e.titre.toLowerCase(); if (vus.has(k)) continue; vus.add(k); out.push({ ...e }); }
  if (bls) for (const e of out) if (e.pays === 'USD' && e.t <= maintenant && e.reel == null && e.source.startsWith('Calendrier public')) { const r = reelBls(e.titre, e.t, bls); if (r != null) { e.reel = r; e.reelSource = 'BLS (officiel)'; } }
  return out.sort((a, b) => a.t - b.t);
}

export const PAYS_UTILES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD'];
/* Filtre : impact minimal, pays, type, période. */
export function filtrerCalendrier(evts, { impactMin = null, pays = null, de = -Infinity, a = Infinity, type = null } = {}) {
  const ordre = { low: 1, medium: 2, high: 3 };
  return evts.filter(e => e.t >= de && e.t < a && (!impactMin || ordre[e.impact] >= ordre[impactMin]) && (!pays || [].concat(pays).includes(e.pays)) && (!type || e.type === type));
}
/* Compte à rebours en français : « dans 2 h 15 », « dans 3 jours », « il y a 40 min ». */
export function compteARebours(t, maintenant = Date.now()) {
  const d = t - maintenant, a = Math.abs(d), min = Math.round(a / 60000), h = Math.floor(min / 60), j = Math.floor(h / 24);
  const txt = j >= 2 ? j + ' jours' : h >= 1 ? h + ' h ' + String(min % 60).padStart(2, '0') : Math.max(1, min) + ' min';
  return d >= 0 ? 'dans ' + txt : 'il y a ' + txt;
}
const jourParis = t => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(t));
export const heureParis = t => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));

/* Phrase parlée : événements importants de la période (par défaut les 7 prochains jours). */
export function phraseCalendrier(evts, { maintenant = Date.now(), jours = 7, impactMin = 'high', max = 6 } = {}) {
  const l = filtrerCalendrier(evts, { impactMin, de: maintenant - 3 * 3600e3, a: maintenant + jours * 86400e3 }).filter(e => !e.type || e.type !== 'autre' || e.impact === 'high');
  if (!l.length) return 'Aucun événement à fort impact dans les ' + jours + ' prochains jours d’après le calendrier public. ' + (evts.length ? '' : 'Le calendrier n’est pas disponible pour le moment.');
  const lignes = l.slice(0, max).map(e => jourParis(e.t) + ' à ' + heureParis(e.t).replace(':', ' h ') + ', ' + e.pays + ', ' + e.titre.replace(/^Fed · /, 'Fed, ') + (e.prevu ? ', prévu ' + e.prevu : '') + (e.precedent ? ', précédent ' + e.precedent : '') + (e.reel ? ', réel ' + e.reel : ''));
  return 'Les ' + (l.length > max ? max + ' premiers des ' + l.length : l.length) + ' événements importants à venir, heure de Paris : ' + lignes.join(' ; ') + '.';
}
