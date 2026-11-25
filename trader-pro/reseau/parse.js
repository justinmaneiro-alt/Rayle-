/* ═════════════ LECTURE DES FLUX RSS / ATOM (léger : tourne dans le Worker gratuit, 10 ms de CPU, comme dans Node) ═════════════
   Pas d'analyseur XML : parcours par indexOf, au plus `max` articles (les plus récents sont en tête des flux). Rien n'est inventé : un article sans titre ou sans date lisible est écarté. */
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decoder(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => { if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (x) { return ' '; } } return ENTITES[e.toLowerCase()] ?? m; });
}
export const sansHtml = s => decoder(decoder(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
function balise(bloc, nom) {
  const o = bloc.indexOf('<' + nom); if (o < 0) return null; const apresNom = bloc[o + nom.length + 1]; if (apresNom && !/[\s>\/]/.test(apresNom)) return balise(bloc.slice(o + 1), nom);
  const fin = bloc.indexOf('>', o); if (fin < 0 || bloc[fin - 1] === '/') return null; const f = bloc.indexOf('</' + nom + '>', fin); if (f < 0) return null;
  return bloc.slice(fin + 1, f);
}
const lien = bloc => { const l = balise(bloc, 'link'); if (l && sansHtml(l)) return sansHtml(l); const m = /<link[^>]*href=["']([^"']+)["']/i.exec(bloc); return m ? decoder(m[1]) : null; };
export function dateFlux(bloc) {
  for (const n of ['pubDate', 'dc:date', 'published', 'updated']) { const v = balise(bloc, n); if (v) { const t = Date.parse(sansHtml(v)); if (Number.isFinite(t)) return t; } }
  return null;
}
export function parserFlux(xml, { max = 30 } = {}) {
  const out = []; if (typeof xml !== 'string') return out; let i = 0;
  while (out.length < max) {
    const a = xml.indexOf('<item', i), b = xml.indexOf('<entry', i), d = a < 0 ? b : b < 0 ? a : Math.min(a, b); if (d < 0) break;
    const tag = d === a ? 'item' : 'entry', f = xml.indexOf('</' + tag + '>', d); if (f < 0) break; const bloc = xml.slice(d, f); i = f + tag.length + 3;
    const titre = sansHtml(balise(bloc, 'title')), t = dateFlux(bloc); if (!titre || t == null) continue;
    const guid = balise(bloc, 'guid') || balise(bloc, 'id'), resume = sansHtml(balise(bloc, 'description') || balise(bloc, 'summary') || balise(bloc, 'content:encoded') || ''), src = balise(bloc, 'source');
    out.push({ titre: titre.slice(0, 400), resume: resume.slice(0, 600), t, lien: lien(bloc), guid: guid ? sansHtml(guid).slice(0, 200) : null, editeur: src ? sansHtml(src).slice(0, 60) : null });
  }
  return out;
}
/* publications EDGAR (data.sec.gov/submissions/CIK….json) → articles « 8-K / Form 4 » récents */
export function parserEdgar(json, { nom, max = 8, formes = ['8-K', '4'] } = {}) {
  const r = json && json.filings && json.filings.recent; if (!r || !Array.isArray(r.form)) return [];
  const out = [];
  for (let i = 0; i < r.form.length && out.length < max; i++) {
    if (!formes.includes(r.form[i])) continue; const t = Date.parse((r.acceptanceDateTime && r.acceptanceDateTime[i]) || r.filingDate[i]); if (!Number.isFinite(t)) continue;
    const acc = String(r.accessionNumber[i]).replace(/-/g, ''), cik = String(json.cik).replace(/^0+/, '');
    out.push({ titre: `${nom || json.name} dépose un ${r.form[i] === '4' ? 'Form 4 (transaction d’un dirigeant)' : 'rapport 8-K (événement important)'}${r.items && r.items[i] ? ' : items ' + r.items[i] : ''}`, resume: '', t, lien: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${r.primaryDocument[i]}`, guid: acc, editeur: 'SEC EDGAR' });
  }
  return out;
}
