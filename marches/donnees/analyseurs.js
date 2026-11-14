/* Analyseurs purs (aucune entrée réseau) : CSV, séries FRED, SDMX de la BCE, XML INSEE, ICS du BLS, HTML des calendriers officiels, RSS. */
export function lireCsv(texte) {
  const lignes = []; let champ = '', ligne = [], q = false;
  const s = String(texte || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { champ += '"'; i++; } else q = false; } else champ += c; }
    else if (c === '"') q = true;
    else if (c === ',') { ligne.push(champ); champ = ''; }
    else if (c === '\n') { ligne.push(champ.replace(/\r$/, '')); lignes.push(ligne); ligne = []; champ = ''; }
    else champ += c;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ.replace(/\r$/, '')); lignes.push(ligne); }
  return lignes.filter(l => l.length > 1 || (l.length === 1 && l[0] !== ''));
}

/* fredgraph.csv : observation_date,SERIE1,SERIE2… → { SERIE: [[ms, valeur], …] } (cases vides ou « . » écartées, jamais remplacées par 0). */
export function lireFred(texte) {
  const l = lireCsv(texte); if (l.length < 2 || !/observation_date|date/i.test(l[0][0])) throw new Error('CSV FRED inattendu');
  const ids = l[0].slice(1), out = Object.fromEntries(ids.map(i => [i, []]));
  for (const r of l.slice(1)) {
    const t = Date.parse(r[0] + 'T00:00:00Z'); if (isNaN(t)) continue;
    ids.forEach((id, k) => { const v = r[k + 1]; if (v === '' || v === '.' || v == null) return; const x = Number(v); if (isFinite(x)) out[id].push([t, x]); });
  }
  return out;
}

/* Export CSV de la BCE (format csvdata) → [[ms, valeur]] avec TIME_PERIOD (AAAA-MM-JJ, AAAA-MM ou AAAA-Qn) */
export function lireBce(texte) {
  const l = lireCsv(texte); if (l.length < 2) throw new Error('CSV BCE vide');
  const h = l[0], it = h.indexOf('TIME_PERIOD'), iv = h.indexOf('OBS_VALUE'); if (it < 0 || iv < 0) throw new Error('CSV BCE inattendu');
  return l.slice(1).map(r => [periodeVersMs(r[it]), Number(r[iv])]).filter(p => isFinite(p[0]) && isFinite(p[1]));
}
export function periodeVersMs(p) {
  p = String(p || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return Date.parse(p + 'T00:00:00Z');
  if (/^\d{4}-\d{2}$/.test(p)) return Date.parse(p + '-01T00:00:00Z');
  const q = p.match(/^(\d{4})-Q([1-4])$/); if (q) return Date.UTC(+q[1], (+q[2] - 1) * 3, 1);
  const m = p.match(/^(\d{4})M(\d{2})$/); if (m) return Date.UTC(+m[1], +m[2] - 1, 1);
  return NaN;
}

/* INSEE (SDMX XML) : <Obs TIME_PERIOD="2026-10" OBS_VALUE="…"/> */
export function lireInsee(texte) {
  const pts = [...String(texte).matchAll(/<Obs\b[^>]*?TIME_PERIOD="([^"]+)"[^>]*?OBS_VALUE="([^"]+)"/g)].map(m => [periodeVersMs(m[1]), Number(m[2])]).filter(p => isFinite(p[0]) && isFinite(p[1]));
  if (!pts.length) { const alt = [...String(texte).matchAll(/<Obs\b[^>]*?OBS_VALUE="([^"]+)"[^>]*?TIME_PERIOD="([^"]+)"/g)].map(m => [periodeVersMs(m[2]), Number(m[1])]).filter(p => isFinite(p[0]) && isFinite(p[1])); if (alt.length) return alt.sort((a, b) => a[0] - b[0]); throw new Error('XML INSEE sans observation'); }
  return pts.sort((a, b) => a[0] - b[0]);
}

/* Eurostat (JSON-stat 2.0, une seule série) : { dimension.time.category.index, value } → [[ms, valeur]] */
export function lireEurostat(j, geo) {
  if (!j || !j.value || !j.dimension || !j.dimension.time) throw new Error('JSON Eurostat inattendu');
  const idx = j.dimension.time.category.index, ids = j.id || Object.keys(j.dimension), tailles = j.size || [];
  const posGeo = ids.indexOf('geo'), nGeo = posGeo >= 0 ? tailles[posGeo] : 1; let ig = 0;
  if (geo && j.dimension.geo) ig = j.dimension.geo.category.index[geo] ?? -1; if (ig < 0) throw new Error('zone ' + geo + ' absente');
  const posTemps = ids.indexOf('time'), nTemps = tailles[posTemps] || Object.keys(idx).length;
  const pts = []; for (const [per, it] of Object.entries(idx)) {
    const cle = posGeo < posTemps ? ig * nTemps + it : it * nGeo + ig, v = j.value[cle]; if (typeof v === 'number') pts.push([periodeVersMs(per), v]);
  }
  return pts.filter(p => isFinite(p[0])).sort((a, b) => a[0] - b[0]);
}

/* ICS du BLS (fuseau US-Eastern, DTSTART;TZID=US-Eastern:AAAAMMJJTHHMMSS) → [{ debutMs, titre, importance }] ; les heures sont converties en UTC (EST = −5, EDT = −4 : 2e dimanche de mars → 1er dimanche de novembre). */
export function lireIcs(texte) {
  const dep = String(texte).replace(/\r?\n[ \t]/g, ''), out = [];
  for (const bloc of dep.split('BEGIN:VEVENT').slice(1)) {
    const m = bloc.match(/DTSTART[^:\n]*:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/), titre = (bloc.match(/SUMMARY:(.*)/) || [])[1]; if (!m || !titre) continue;
    const [A, M, J, h, mi] = [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0)];
    out.push({ debutMs: Date.UTC(A, M - 1, J, h + (heureEteUS(A, M, J, h) ? 4 : 5), mi), titre: titre.replace(/\\,/g, ',').replace(/\\;/g, ';').trim(), importance: /IMPORTANT/i.test((bloc.match(/CATEGORIES:(.*)/) || [])[1] || '') ? 'importante' : 'normale', heure: !!m[4] });
  }
  return out;
}
function heureEteUS(A, M, J) {   // règle américaine : du 2e dimanche de mars au 1er dimanche de novembre
  const dimanche = (annee, mois, n) => { const d = new Date(Date.UTC(annee, mois, 1)); const premier = (7 - d.getUTCDay()) % 7 + 1; return premier + 7 * (n - 1); };
  const debut = dimanche(A, 2, 2), fin = dimanche(A, 10, 1);
  if (M < 3 || M > 11) return false; if (M > 3 && M < 11) return true; if (M === 3) return J >= debut; return J < fin;
}

const MOIS_EN = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
/* Calendrier FOMC (federalreserve.gov/monetarypolicy/fomccalendars.htm) → [{ debut:'AAAA-MM-JJ', fin, titre, resume }] ; la décision est le dernier jour. Les réunions « notation vote » ou non programmées ne sont pas lues. */
export function lireFomc(html) {
  const out = []; const h = String(html);
  const annees = [...h.matchAll(/(\d{4}) FOMC Meetings/g)];
  annees.forEach((a, k) => {
    const bloc = h.slice(a.index, k + 1 < annees.length ? annees[k + 1].index : h.length);
    for (const m of bloc.matchAll(/fomc-meeting__month[^>]*>\s*<strong>([A-Za-z/]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>\s*([^<]+?)\s*<\/div>/g)) {
      const mois = m[1].split('/'), jours = m[2].replace(/\*/g, '').trim().match(/^(\d{1,2})(?:-(\d{1,2}))?$/); if (!jours) continue;
      const m1 = MOIS_EN[mois[0].toLowerCase()], m2 = MOIS_EN[(mois[1] || mois[0]).toLowerCase()]; if (!m1 || !m2) continue;
      const p = n => String(n).padStart(2, '0'), A = +a[1];
      out.push({ debut: A + '-' + p(m1) + '-' + p(+jours[1]), fin: A + '-' + p(m2) + '-' + p(+(jours[2] || jours[1])), titre: 'Réunion du FOMC (Réserve fédérale) : décision de taux' });
    }
  });
  if (!out.length) throw new Error('calendrier FOMC illisible');
  return out;
}

/* Calendrier de la BCE (ecb.europa.eu/press/calendars/mgcgc) : <dt> jj/mm/aaaa </dt><dd> description </dd> → [{ date:'AAAA-MM-JJ', titre }] */
export function lireBceCalendrier(html) {
  const out = [];
  for (const m of String(html).matchAll(/<dt>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd>\s*([\s\S]*?)<\/dd>/g)) out.push({ date: m[3] + '-' + m[2] + '-' + m[1], titre: m[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
  if (!out.length) throw new Error('calendrier BCE illisible');
  return out;
}

/* RSS / Atom minimal : titres, liens, dates, résumés COURTS seulement (jamais de texte intégral) */
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
export function lireRss(xml, max = 15) {
  const out = [], x = String(xml);
  for (const bloc of [...x.matchAll(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/g)].map(m => m[0]).slice(0, max)) {
    const t = decode((bloc.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
    const l = (bloc.match(/<link[^>]*>([\s\S]*?)<\/link>/) || bloc.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    const d = (bloc.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || bloc.match(/<dc:date>([\s\S]*?)<\/dc:date>/) || bloc.match(/<updated>([\s\S]*?)<\/updated>/) || bloc.match(/<published>([\s\S]*?)<\/published>/) || [])[1];
    const r = decode((bloc.match(/<description[^>]*>([\s\S]*?)<\/description>/) || bloc.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1]);
    const ms = Date.parse(String(d || '').trim()); if (!t || isNaN(ms)) continue;
    out.push({ titre: t.slice(0, 220), lien: decode(l), publieMs: ms, resume: r.length > 220 ? r.slice(0, 217) + '…' : r });
  }
  if (!out.length) throw new Error('flux vide ou illisible');
  return out.sort((a, b) => b.publieMs - a.publieMs);
}
