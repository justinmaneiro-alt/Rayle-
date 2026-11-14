/* ═════════════ API HTTP DE RAYLE MARCHÉS (Request → Response, portable Node / Worker) ═════════════
   GET /marches/panneau?id=ensemble|or|us100|btc|usd|chf|macro|cot|calendrier|actualites|correlations|fred[&actif=][&serie=][&fenetre=30|90]
   GET /marches/sources[?tester=1]   GET /marches/copilote?q=…   GET /marches/serie?id=…   GET /marches/sante
   Lecture seule, aucun secret dans les réponses. Une panne de source donne une section « indisponible » : la réponse HTTP reste 200 (le terminal ne plante jamais). */
import { creerHub } from './hub.js';
import { PANNEAUX, calendrier14, filtrerActus, correlations, ACTIFS_CORR } from './panneaux.js';
import { repondre } from './copilote.js';
import { indisponible, mesure } from './normaliser.js';
import { lireFred } from './analyseurs.js';
import { SERIES_FRED, CONTRATS_COT } from './registre.js';
const libelleDe = id => { const f = SERIES_FRED.find(s => s[0] === id); if (f) return f[2]; const c = id.match(/^cot\.(\w+)\.(spec|comm)$/); if (c) { const k = CONTRATS_COT.find(x => x[0] === c[1]); if (k) return 'COT ' + k[2] + ' : ' + (c[2] === 'spec' ? 'spéculateurs' : 'commerciaux'); } return id; };

const ENTETES = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Rayle-Token' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: ENTETES });

export async function construirePanneau(hub, id, p = {}, maintenant = Date.now()) {
  const reponse = { id, titre: '', genere: new Date(maintenant).toISOString(), sections: [], evenements: null, actualites: null, correlations: null, absent: [], lots: [], erreurs: [] };
  if (id === 'sources') return { ...reponse, titre: 'État des sources', sources: hub.etatSources() };
  if (id === 'calendrier') {
    const r = await hub.lot('calendrier'); reponse.titre = 'Calendrier officiel';
    reponse.evenements = calendrier14(r.items, maintenant, 14, p.actif || null); reponse.calendrierVerifie = !r.erreur || r.copie; if (r.erreur) reponse.erreurs.push('calendrier : ' + r.erreur);
    if (r.partiel && r.partiel.length) reponse.erreurs.push(...r.partiel); if (r.erreur && !r.copie) reponse.evenements = []; reponse.nonVerifie = !!r.erreur && !r.copie;
    if (reponse.nonVerifie) reponse.mentions = 'calendrier non vérifié'; return reponse;
  }
  if (id === 'actualites') {
    reponse.titre = 'Actualités'; const l = await Promise.all([hub.lot('rss-officiels'), hub.lot('rss-medias')]), items = l.flatMap(x => x.items);
    reponse.actualites = filtrerActus(items, p.actif || null, 40); for (const x of l) { if (x.erreur) reponse.erreurs.push(x.erreur); if (x.partiel) reponse.erreurs.push(...x.partiel); } return reponse;
  }
  if (id === 'correlations') {
    reponse.titre = 'Corrélations'; const lots = await Promise.all(['kraken-jours', 'fred', 'frankfurter'].map(x => hub.lot(x))), series = {};
    for (const [, , sid] of ACTIFS_CORR) { const pts = hub.points(sid); if (pts) series[sid] = pts; }
    for (const x of lots) if (x.erreur) reponse.erreurs.push(x.erreur);
    reponse.correlations = { 30: correlations(series, 30, maintenant), 90: correlations(series, 90, maintenant) }; return reponse;
  }
  if (id === 'fred') {
    const serie = String(p.serie || '').toUpperCase(); reponse.titre = 'FRED ' + serie;
    if (!/^[A-Z0-9_]{2,25}$/.test(serie)) { reponse.erreurs.push('identifiant de série invalide'); return reponse; }
    const connue = hub.etatSources().find(s => s.id === 'fred');
    try {
      const txt = await hub.get('fred', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + serie + '&cosd=' + new Date(maintenant - 1200 * 864e5).toISOString().slice(0, 10), { type: 'text' }), pts = (lireFred(txt)[serie] || []);
      reponse.sections.push({ titre: 'Série ' + serie, mesures: [pts.length ? mesure({ id: 'fred.' + serie, libelle: 'Série FRED ' + serie, valeur: pts[pts.length - 1][1], precedente: pts.length > 1 ? pts[pts.length - 2][1] : null, unite: '', source: 'FRED · ' + serie, sourceId: 'fred', url: 'https://fred.stlouisfed.org/series/' + serie, horodatage: pts[pts.length - 1][0], frequence: pts.length > 2 && pts[pts.length - 1][0] - pts[pts.length - 2][0] > 20 * 864e5 ? 'mensuel' : 'quotidien', serie: pts.slice(-120), note: 'série demandée par l\'utilisateur ; unité : voir la page de la série' }, maintenant) : indisponible('fred.' + serie, 'Série FRED ' + serie, 'FRED · ' + serie, 'fred', 'série vide ou inconnue', maintenant)] });
    } catch (e) { reponse.sections.push({ titre: 'Série ' + serie, mesures: [indisponible('fred.' + serie, 'Série FRED ' + serie, 'FRED · ' + serie, 'fred', e.message, maintenant)] }); reponse.erreurs.push(e.message); }
    return reponse;
  }
  const def = PANNEAUX[id]; if (!def) { reponse.erreurs.push('panneau inconnu : ' + id); return reponse; }
  reponse.titre = def.titre; reponse.lots = def.lots; reponse.absent = def.absent || [];
  const res = await Promise.all(def.lots.map(l => hub.lot(l))), m = {}, items = [];
  for (const r of res) { for (const x of r.mesures) m[x.id] = x; items.push(...r.items); if (r.erreur && !r.desactive) reponse.erreurs.push(r.lot + ' : ' + r.erreur); if (r.partiel && r.partiel.length) reponse.erreurs.push(...r.partiel.map(x => r.lot + ' · ' + x)); }
  reponse.sections = def.sections.map(([titre, ids]) => ({ titre, mesures: ids.map(i => m[i] || indisponible(i, libelleDe(i), 'sources du panneau : ' + def.lots.join(', '), i.split('.')[0], "aucune des sources du panneau n'a fourni cette donnée", maintenant)) }))
  if (def.lots.includes('calendrier')) { reponse.evenements = calendrier14(items, maintenant, 14, def.actif && id !== 'macro' ? def.actif : null).slice(0, 12); }
  if (def.lots.some(l => l.startsWith('rss'))) reponse.actualites = filtrerActus(items, def.actif || null, 8);
  return reponse;
}

let hubParDefaut = null;
export const hubPartage = (env = {}) => hubParDefaut || (hubParDefaut = creerHub({ env }));

export async function gererMarches(request, { env = {}, hub = hubPartage(env), maintenant = () => Date.now() } = {}) {
  const url = new URL(request.url), chemin = url.pathname.replace(/\/+$/, ''), q = url.searchParams;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ENTETES });
  if (request.method !== 'GET') return json({ error: 'méthode non permise', code: 405 }, 405);
  try {
    if (chemin === '/marches/sante' || chemin === '/marches/ping') return json({ ok: true, service: 'rayle-marches', lots: hub.idsLots().length, heure: new Date(maintenant()).toISOString() });
    if (chemin === '/marches/sources') {
      if (q.get('tester') === '1') await Promise.all(hub.lotsActifs().map(l => hub.lot(l, { force: true })));
      return json({ genere: new Date(maintenant()).toISOString(), teste: q.get('tester') === '1', sources: hub.etatSources() });
    }
    if (chemin === '/marches/panneau') return json(await construirePanneau(hub, String(q.get('id') || 'ensemble'), { actif: q.get('actif'), serie: q.get('serie') }, maintenant()));
    if (chemin === '/marches/copilote') return json(await repondre(String(q.get('q') || '').slice(0, 300), hub));
    if (chemin === '/marches/gdelt') { try { return json(await hub.actualitesGdelt(q.get('q'))); } catch (e) { return json({ items: [], erreur: String(e.message || e) }); } }
    if (chemin === '/marches/serie') { const p = hub.points(String(q.get('id') || '')); return json(p ? { id: q.get('id'), points: p.slice(-400) } : { id: q.get('id'), points: null, erreur: 'série non chargée : ouvrez d\'abord le panneau concerné' }); }
    return json({ error: 'route inconnue : ' + chemin, code: 404, routes: ['/marches/panneau', '/marches/sources', '/marches/copilote', '/marches/gdelt', '/marches/serie', '/marches/sante'] }, 404);
  } catch (e) { return json({ error: String(e && e.message || e), code: 500 }, 500); }
}
