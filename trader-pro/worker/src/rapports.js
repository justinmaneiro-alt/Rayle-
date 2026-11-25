/* ═════════════ BRIEFING DU MATIN ET REVUE DU DIMANCHE PAR TELEGRAM (v6, B6) — tâches du cron unique ═════════════
   Briefing : jours de semaine ~7 h 45 (heure de Paris, réglable : clé synchronisée rayle_briefing_reglage_v1 { actif }). Revue : dimanche ~18 h.
   Données : signaux.json, calendrier2.json et index.json (CDN GitHub), D1 (dessins, risque, positions, alertes, dernières positions fermées) ; AUCUN calcul lourd. Un seul envoi par jour (kv « rapports »). */
import { construireBriefing, construireRevue } from '../../commun/briefing.js';
import { analyser, unifier, budget, pertesRealisees, creerCorr } from '../../portefeuille/risque-global.js';
import { visibles } from '../../terminal/dessins-fusion.js';
import { ACTIFS, BASE_SIGNAUX } from './alertes-cloture.js';
const BASE = 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/';
const jourParis = t => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(t));
const jolie = t => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(t));
const heureFr = t => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));
async function json(fetchFn, url) { try { const r = await fetchFn(url, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
async function envoyer(env, texte, fetchFn) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return 'telegram non configuré';
  const r = await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texte }), signal: AbortSignal.timeout(8000) });
  return r.ok ? 'envoyé' : 'telegram a répondu ' + r.status;
}
export async function donneesBriefing(depot, t, fetchFn) {
  const [sig, cal, idx, rez] = await Promise.all([json(fetchFn, BASE_SIGNAUX + '?v=' + Math.floor(t / 60000)), json(fetchFn, BASE + 'calendrier2.json'), json(fetchFn, BASE + 'index.json'), json(fetchFn, BASE + 'reseau-actus.json')]), sync = (await depot.kvLire('sync')) || { cles: {} };
  const mouvements = [], niveaux = [];
  for (const a of ACTIFS) {
    const x = sig && sig.actifs && sig.actifs[a]; if (!x || !x.derniere) continue;
    const j = x.derniere.J, h = x.derniere.H1, px = h && h.derniere ? h.derniere.c : (j && j.derniere && j.derniere.c);
    if (j && j.derniere && Number.isFinite(px)) mouvements.push({ actif: a, prix: px, variationPct: (px / j.derniere.c - 1) * 100 });
    for (const o of visibles((await depot.kvLire('dessins:' + a)) || [])) {
      const L = o.type === 'horizontale' ? [['ta ligne', o.p]] : o.type === 'boite' ? [['haut de ta boîte', o.haut], ['bas de ta boîte', o.bas]] : [];
      for (const [n, p] of L) if (Number.isFinite(p) && Number.isFinite(px) && Math.abs(p / px - 1) < 0.03) niveaux.push({ actif: a, nom: n, prix: p, distancePct: (p / px - 1) * 100 });
    }
  }
  const auj = jourParis(t), annonces = ((cal && cal.evenements) || []).filter(e => /^(High|Medium)$/i.test(e.impact || '') && jourParis(Date.parse(e.date)) === auj).sort((p, q) => Date.parse(p.date) - Date.parse(q.date)).slice(0, 6).map(e => ({ heure: heureFr(Date.parse(e.date)), titre: e.title, impact: /high/i.test(e.impact) ? 'fort' : 'moyen' }));
  const alertes = (await depot.kvLire('alertes')) || [], hist = (await depot.kvLire('alertes-cloture')) || { historique: [] }, recentes = hist.historique.filter(h => t - h.t < 36 * 3600e3).slice(-4).map(h => h.texte);
  const reg = (sync.cles.rayle_pf_risque_v1 || {}).valeur || {}, pos = (sync.cles.rayle_pf_positions_v1 || {}).valeur || [], ouv = ((await depot.kvLire('ouvertes')) || {}).positions || [];
  const P = unifier({ ouvertes: ouv.map(o => ({ ...o, risqueAuStop: o.sl != null && o.prixOuv != null ? (o.sl - o.prixOuv) * (o.sens === 'BUY' ? 1 : -1) * (o.volume || 0) : null })), saisies: Array.isArray(pos) ? pos : [], traduire: x => String(x || '').toLowerCase() });
  const A = analyser(P, { corr: creerCorr(null), capital: reg.capital || 0 }), b = budget({ reglages: reg, pertes: { jour: 0, semaine: 0 }, engage: A.total });
  let dn; if (idx && idx.fichiers) { const ages = Object.values(idx.fichiers).map(f => f.t).filter(Number.isFinite), retard = ages.length ? (t - Math.min(...ages)) / 3600e3 : null; dn = { voyant: retard != null && retard < 3 ? 'vert' : 'orange', phrase: retard == null ? 'État des données illisible.' : retard < 3 ? 'Données à jour.' : `Attention : une source n’a pas été mise à jour depuis ${Math.round(retard)} heures.` }; } else dn = { voyant: 'rouge', phrase: 'Je ne peux pas lire l’état des données.' };
  const infosCles = ((rez && rez.items) || []).filter(x => x.t >= t - 24 * 3600e3 && x.score >= 40).sort((a, b) => b.score - a.score).slice(0, 3).map(x => ({ titre: String(x.titre).slice(0, 120), score: x.score }));
  return { date: jolie(t), mouvements, niveaux, annonces, infosCles, alertes: { actives: alertes.filter(a => !a.declenchee).length, recentes }, risque: A.n || reg.capital ? { total: A.total, totalPct: A.totalPct, jourReste: b.capital > 0 ? b.jour.reste : null, etatJour: b.jour.etat } : null, donnees: dn };
}
export async function briefingMatin(env, depot, t, { fetchFn = fetch, forcer = false } = {}) {
  const sync = (await depot.kvLire('sync')) || { cles: {} }, r = (sync.cles.rayle_briefing_reglage_v1 || {}).valeur; if (!forcer && r && r.actif === false) return 'désactivé';
  const R = (await depot.kvLire('rapports')) || {}, auj = jourParis(t); if (!forcer && R.briefing === auj) return 'déjà envoyé';
  const b = construireBriefing(await donneesBriefing(depot, t, fetchFn)), res = await envoyer(env, b.telegram, fetchFn);
  if (res === 'envoyé' || res === 'telegram non configuré') await depot.kvEcrire('rapports', { ...R, briefing: auj }); return res;
}
export async function revueDimanche(env, depot, t, { fetchFn = fetch, forcer = false } = {}) {
  const R = (await depot.kvLire('rapports')) || {}, auj = jourParis(t); if (!forcer && R.revue === auj) return 'déjà envoyée';
  const debut = t - 7 * 86400e3, fermees = (depot.lireDernieres ? await depot.lireDernieres('fermees', 300) : []).filter(x => x.tFerm >= debut), J = (await depot.kvLire('journal')) || [], sync = (await depot.kvLire('sync')) || { cles: {} }, reg = (sync.cles.rayle_pf_risque_v1 || {}).valeur || {};
  const setupDe = x => { const j = J.find(e => e.ticker === x.ticker && Math.abs((e.t || 0) - x.tOuv) < 36 * 3600e3); return j && j.setup ? j.setup : 'autre'; };
  const trades = fermees.map(x => ({ pnl: x.pnl, R: reg.risquePos > 0 ? x.pnl / reg.risquePos : null, setup: setupDe(x) })), pj = pertesRealisees(fermees, t), cap = reg.capital || 0, ouv = (await depot.kvLire('ouvertes')) || {};
  const rev = construireRevue({ trades, limites: { jourDepasse: cap > 0 && -pj.jour > cap * (reg.limiteJourPct || 2) / 100, semaineDepassee: cap > 0 && -pj.semaine > cap * (reg.limiteSemainePct || 5) / 100 }, joursSansImport: Number.isFinite(ouv.t) ? Math.floor((t - ouv.t) / 86400e3) : null });
  const res = await envoyer(env, rev.telegram, fetchFn); if (res === 'envoyé' || res === 'telegram non configuré') await depot.kvEcrire('rapports', { ...R, revue: auj }); return res;
}
