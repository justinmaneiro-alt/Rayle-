// Enregistre de VRAIES réponses (réseau réel) dans marches/tests/fixtures/reponses.json pour les tests hors ligne. Les grosses réponses sont réduites SANS casser leur format.
// Usage : node marches/tests/enregistrer-fixtures.mjs   (date d'enregistrement écrite dans le fichier ; aucun secret)
import fs from 'node:fs';
import { creerHub } from '../donnees/hub.js';
const base = {}; const reel = globalThis.fetch;
const reduire = (url, texte) => {
  try {
    if (/get_book_summary_by_currency/.test(url)) { const j = JSON.parse(texte); j.result = j.result.filter((x, i) => i < 120 || /-P$/.test(x.instrument_name) && i < 240); return JSON.stringify(j); }
    if (/stablecoins\.llama\.fi/.test(url)) { const j = JSON.parse(texte); j.peggedAssets = j.peggedAssets.slice(0, 8); return JSON.stringify(j); }
    if (/historicalChainTvl/.test(url)) { const j = JSON.parse(texte); return JSON.stringify(j.slice(-80)); }
    if (/VIX_History/.test(url)) { const l = texte.split('\n'); return [l[0], ...l.slice(-60)].join('\n'); }
    if (/fomccalendars/.test(url)) { const i = texte.indexOf('2026 FOMC Meetings'), j = texte.indexOf('2025 FOMC Meetings'); return texte.slice(Math.max(0, i - 200), j > i ? j : i + 30000); }
    if (/ecb\.europa\.eu\/press\/calendars/.test(url)) { const i = texte.indexOf('<main'); return texte.slice(i, i + 12000); }
    if (/bls\.ics/.test(url)) { const e = texte.split('BEGIN:VEVENT'); const maintenant = Date.now(), garde = e.slice(1).filter(b => { const m = b.match(/DTSTART[^:]*:(\d{8})/); if (!m) return false; const t = Date.parse(m[1].slice(0, 4) + '-' + m[1].slice(4, 6) + '-' + m[1].slice(6, 8)); return t > maintenant - 5 * 864e5 && t < maintenant + 40 * 864e5; }); return e[0] + garde.map(b => 'BEGIN:VEVENT' + b).join(''); }
    if (/api\.kraken\.com\/0\/public\/OHLC/.test(url)) { const j = JSON.parse(texte); const k = Object.keys(j.result).find(x => x !== 'last'); j.result[k] = j.result[k].slice(-330); return JSON.stringify(j); }
    if (/futures\.kraken\.com/.test(url)) { const j = JSON.parse(texte); j.tickers = j.tickers.filter(t => t.symbol === 'PF_XBTUSD'); return JSON.stringify(j); }
    if (/publicreporting\.cftc/.test(url)) { const j = JSON.parse(texte); return JSON.stringify(j.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => /^report_date|^open_interest_all|positions_(long|short)|prod_merc|dealer_/.test(k))))); }
    if (/data\.sec\.gov/.test(url)) { const j = JSON.parse(texte), r = j.filings.recent; for (const k of Object.keys(r)) r[k] = r[k].slice(0, 8); return JSON.stringify({ name: j.name, cik: j.cik, filings: { recent: r } }); }
    if (/rss|feed|\.xml/.test(url) && /<item|<entry/.test(texte)) { const it = texte.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/g) || []; const i0 = texte.search(/<item\b|<entry\b/); return texte.slice(0, i0) + it.slice(0, 6).join('\n') + '</channel></rss>'; }
    if (/data-api\.ecb\.europa\.eu.*EXR/.test(url)) { const l = texte.split('\n'); return [l[0], ...l.slice(-130)].join('\n'); }
  } catch (e) { /* inchangé */ }
  return texte;
};
globalThis.fetch = async (url, opts) => { const r = await reel(url, opts); const t = await r.text(); base[String(url)] = { status: r.status, corps: reduire(String(url), t) }; return new Response(t, { status: r.status, headers: r.headers }); };
const hub = creerHub({ env: {} });
for (const id of hub.lotsActifs()) { const r = await hub.lot(id, { force: true }); console.log((r.erreur ? 'KO ' : 'OK ') + id + (r.erreur ? ' ' + r.erreur : '')); }
try { await hub.actualitesGdelt('gold price'); } catch (e) { console.log('GDELT : ' + e.message); }
fs.writeFileSync(new URL('./fixtures/reponses.json', import.meta.url), JSON.stringify({ enregistreLe: new Date().toISOString(), reponses: base }));
console.log(Object.keys(base).length + ' réponses, ' + Math.round(fs.statSync(new URL('./fixtures/reponses.json', import.meta.url)).size / 1024) + ' Ko');
