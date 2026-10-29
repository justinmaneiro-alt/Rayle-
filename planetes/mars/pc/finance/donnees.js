import { analyserCot, fraicheurCot, normaliserCot, urlCot, CONTRATS_COT } from './cot-calcul.js';
import { analyserBls, analyserCourbe, analyserTresor, SERIES_BLS, URL_BLS, URL_TRESOR } from './taux-calcul.js';
import { evenementsBls, evenementsFed, evenementsPublics, evenementsResultats, fusionnerCalendrier } from './calendrier-calcul.js';
import { FLUX_PAR_ID, analyserRss, fusionnerFlux, idsDuGroupe } from './flux-calcul.js';
import { classerListe } from './impact.js';
import { NASDAQ100, SYMBOLES_NDX, performances, resumeHeatmap } from './heatmap-calcul.js';
import { depotsRecents, resumeSec } from './sec-calcul.js';
import { CIK_NDX } from './cik-nasdaq100.js';

/* ═════════════ CLIENT DES DONNÉES DU HUB FINANCE (M2b ; tests : finance-test.mjs avec réseau factice, finance-reel.mjs avec le vrai réseau) ═════════════
   Chaque méthode rend { etat: 'ok' | 'indisponible', etiquette: 'RÉEL' | 'DIFFÉRÉ' | 'PÉRIMÉ' | 'INDISPONIBLE', source, recuLe, voie, … } : JAMAIS une donnée inventée. En cas de panne, la dernière bonne copie est
   resservie avec l'étiquette PÉRIMÉ et sa date ; sans copie, INDISPONIBLE avec la raison.
   Voies : « navigateur » = appel direct (CFTC, Trésor, BLS : CORS ouvert, aucune modification du Worker) ; « worker » = route /finance/brut du Worker de Raylé (flux sans CORS, FRED, SEC, Fed, résultats, cotations).
   Tant que le Worker n'est pas déployé avec ces routes, les données qui en dépendent sont INDISPONIBLES (dit clairement : « route non déployée »), le reste marche. Aucune IA, aucune clé dans la page. */
const MIN = 60e3, H = 3600e3;
export const TTL = { cot: 6 * H, courbe: 1 * H, bls: 6 * H, calendrier: 30 * MIN, flux: 5 * MIN, heatmap: 5 * MIN, sec: 30 * MIN };
const CLE_LOCALE = 'rayle_finance_cache_v1';

const messageErreur = e => String(e && e.message || e).slice(0, 160);
const routeAbsente = m => /route inconnue|404|source inconnue/i.test(m);

/* Réseau par défaut (navigateur). `workerPret` : `workerReady` est un const de script classique, on l'appelle par son nom. */
export function reseauNavigateur() {
  const workerPret = () => { try { return typeof workerReady === 'function' && !!workerReady(); } catch (e) { return false; } };
  return {
    workerPret,
    /* V8 : jamais de lecture infinie (délai de 15 s) */
    async direct(url, { json = false } = {}) { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return json ? r.json() : r.text(); },
    async brut(id) {
      if (!workerPret()) throw new Error('Worker non configuré (⚙ Réglages de Raylé)');
      const r = await window.wfetch('/finance/brut?id=' + encodeURIComponent(id), { method: 'GET' }, 25000);
      if (!r.ok) { let m = 'HTTP ' + r.status; try { const j = await r.json(); if (j && j.error) m += ' · ' + j.error; } catch (e) { /* corps illisible */ } throw new Error(m); }
      return r.text();
    },
    async calendrierPublic() { if (!workerPret()) throw new Error('Worker non configuré (⚙ Réglages de Raylé)'); return window.wjson('/calendar', 20000); }
  };
}

export function creerFinance({ reseau = reseauNavigateur(), maintenant = () => Date.now(), stockage = typeof localStorage !== 'undefined' ? localStorage : null } = {}) {
  const memoire = new Map();
  const lireLocal = () => { try { return JSON.parse(stockage.getItem(CLE_LOCALE) || '{}'); } catch (e) { return {}; } };
  const ecrireLocal = (k, v) => { try { const o = lireLocal(); o[k] = v; stockage.setItem(CLE_LOCALE, JSON.stringify(o)); } catch (e) { /* stockage plein ou interdit */ } };

  /* Mémoïse une production : cache mémoire (ttl), repli sur la dernière bonne copie (mémoire, puis disque si `persist`) marquée PÉRIMÉ. */
  async function avecCache(cle, ttl, producteur, { persist = false } = {}) {
    const m = memoire.get(cle); if (m && maintenant() - m.t < ttl) return m.v;
    if (persist && stockage) { const d = lireLocal()[cle]; if (d && maintenant() - d.t < ttl && d.v && d.v.etat === 'ok') { memoire.set(cle, d); return d.v; } }
    if (m && m.enCours) return m.enCours;
    const p = (async () => {
      try { const v = await producteur(); const e = { t: maintenant(), v }; memoire.set(cle, e); if (persist && stockage && v.etat === 'ok') ecrireLocal(cle, e); return v; }
      catch (err) {
        const ancien = m || (persist && stockage ? lireLocal()[cle] : null);
        if (ancien && ancien.v && ancien.v.etat === 'ok') return { ...ancien.v, etiquette: 'PÉRIMÉ', perime: true, raison: 'source injoignable (' + messageErreur(err) + ') · copie du ' + new Date(ancien.v.recuLe || ancien.t).toLocaleString('fr-FR') };
        return { etat: 'indisponible', etiquette: 'INDISPONIBLE', raison: messageErreur(err), recuLe: null };
      }
    })();
    memoire.set(cle, { ...(m || { t: 0, v: null }), enCours: p }); const v = await p; const e = memoire.get(cle); if (e) delete e.enCours; return v;
  }
  const ok = (extra, etiquette, source, voie) => ({ etat: 'ok', etiquette, source, voie, recuLe: maintenant(), ...extra });

  /* ── COT (CFTC, direct) ── */
  const cot = id => avecCache('cot:' + id, TTL.cot, async () => {
    const c = CONTRATS_COT[id]; if (!c) throw new Error('contrat COT inconnu');
    const lignes = normaliserCot(await reseau.direct(urlCot(id), { json: true }), c.rapport);
    if (!lignes.length) throw new Error('aucune donnée COT pour ' + c.nom);
    const a = analyserCot(lignes, c.rapport), f = fraicheurCot(a.date, maintenant());
    return ok({ contrat: id, analyse: a, fraicheur: f }, f.etiquette, 'CFTC · données ouvertes (rapport ' + (c.rapport === 'tff' ? 'TFF' : 'Disaggregated') + ')', 'navigateur');
  }, { persist: true });

  /* ── Courbe des taux (Trésor américain, direct) ── */
  const courbe = () => avecCache('courbe', TTL.courbe, async () => {
    const annee = new Date(maintenant()).getUTCFullYear();
    let jours = analyserTresor(await reseau.direct(URL_TRESOR(annee)));
    if (jours.length < 30) jours = analyserTresor(await reseau.direct(URL_TRESOR(annee - 1)).catch(() => '')).concat(jours);
    const c = analyserCourbe(jours); if (!c) throw new Error('courbe vide');
    const age = (maintenant() - Date.parse(c.date + 'T00:00:00Z')) / 86400e3;
    return ok({ courbe: c }, age > 6 ? 'PÉRIMÉ' : 'DIFFÉRÉ', 'Trésor américain · courbe quotidienne des taux (fin de journée)', 'navigateur');
  }, { persist: true });

  /* ── BLS : inflation, chômage, emplois (officiel, direct, 25 requêtes par jour : cache disque de 6 h) ── */
  const bls = () => avecCache('bls', TTL.bls, async () => {
    const res = {}; let manquants = 0;
    await Promise.all(Object.entries(SERIES_BLS).map(async ([k, serie]) => { try { const pts = analyserBls(await reseau.direct(URL_BLS(serie), { json: true })); if (pts && pts.length) res[k] = pts; else manquants++; } catch (e) { manquants++; } }));
    if (!Object.keys(res).length) throw new Error('BLS injoignable');
    return ok({ donnees: res, manquants }, 'DIFFÉRÉ', 'BLS · Bureau of Labor Statistics (API officielle sans clé)', 'navigateur');
  }, { persist: true });

  /* ── Calendrier : public (Worker /calendar) + Fed (Worker) + résultats (Worker) + BLS pour les « réels » ── */
  const calendrier = () => avecCache('calendrier', TTL.calendrier, async () => {
    const etatSources = [], listes = [];
    const essai = async (id, nom, f) => { try { const l = await f(); listes.push(l); etatSources.push({ id, nom, etat: 'ok', n: l.length }); } catch (e) { const m = messageErreur(e); etatSources.push({ id, nom, etat: 'indisponible', raison: routeAbsente(m) ? 'route du Worker non déployée' : m }); } };
    await Promise.all([
      essai('public', 'Calendrier public hebdomadaire (Forex Factory)', async () => evenementsPublics(await reseau.calendrierPublic())),
      essai('fed', 'Calendrier officiel de la Fed', async () => evenementsFed(JSON.parse((await reseau.brut('fed_calendrier')).replace(/^﻿/, '')))),
      essai('bls_cal', 'Calendrier officiel du BLS (inflation, emploi)', async () => evenementsBls(await reseau.brut('bls_ics')).filter(e => e.t > maintenant() - 7 * 86400e3 && e.t < maintenant() + 75 * 86400e3)),
      essai('resultats', 'Résultats d’entreprises du Nasdaq 100 (Alpha Vantage)', async () => evenementsResultats(await reseau.brut('av_resultats'), SYMBOLES_NDX))
    ]);
    const b = await bls(); if (b.etat === 'ok') etatSources.push({ id: 'bls', nom: 'Valeurs « réelles » : BLS (officiel)', etat: 'ok' }); else etatSources.push({ id: 'bls', nom: 'Valeurs « réelles » : BLS (officiel)', etat: 'indisponible', raison: b.raison });
    if (!listes.length || !listes.some(l => l.length)) throw new Error('aucune source de calendrier ne répond : ' + etatSources.map(s => s.id + ' (' + (s.raison || 'vide') + ')').join(', '));
    const evts = fusionnerCalendrier(listes, { bls: b.etat === 'ok' ? b.donnees : null, maintenant: maintenant() });
    const publicOk = etatSources.find(s => s.id === 'public' && s.etat === 'ok');
    return ok({ evenements: evts, sources: etatSources, reelDisponible: b.etat === 'ok' }, publicOk ? 'DIFFÉRÉ' : 'PÉRIMÉ', 'Calendriers publics et officiels (voir les sources)', 'worker');
  });

  /* ── Flux (actualités, banques centrales, institutions) ── */
  const flux = (groupe, { actif = null } = {}) => avecCache('flux:' + groupe + ':' + (actif || ''), TTL.flux, async () => {
    const ids = idsDuGroupe(groupe, { actif }), parSource = {}, etatSources = [];
    await Promise.all(ids.map(async id => {
      const f = FLUX_PAR_ID[id];
      try {
        let xml, voie = 'worker';
        if (f.acces === 'navigateur') { try { xml = await reseau.direct(f.url); voie = 'navigateur'; } catch (e) { xml = await reseau.brut(id); } } else xml = await reseau.brut(id);
        const items = analyserRss(xml, 25); if (!items.length) throw new Error('flux vide ou illisible');
        parSource[id] = items; etatSources.push({ id, nom: f.nom, etat: 'ok', n: items.length, voie });
      } catch (e) { const m = messageErreur(e); etatSources.push({ id, nom: f.nom, etat: 'indisponible', raison: routeAbsente(m) ? 'route du Worker non déployée' : m }); }
    }));
    if (!Object.keys(parSource).length) throw new Error('aucun flux ne répond (' + etatSources.map(s => s.id + ': ' + s.raison).slice(0, 3).join(' ; ') + ')');
    const items = classerListe(fusionnerFlux(parSource));
    const recent = Math.max(0, ...items.map(i => i.t || 0)), age = maintenant() - recent;
    return ok({ items, sources: etatSources }, age < 6 * H ? 'RÉEL' : 'DIFFÉRÉ', 'Flux publics (titres, liens)', 'navigateur+worker');
  });

  /* ── Carte de chaleur Nasdaq 100 (cotations différées via le Worker) ── */
  const heatmap = () => avecCache('heatmap', TTL.heatmap, async () => {
    const cotations = {}; let recus = 0, erreurs = [];
    await Promise.all([0, 1, 2, 3, 4].map(async n => { try { const j = JSON.parse(await reseau.brut('spark:' + n)); for (const [s, v] of Object.entries(j)) { if (!v || !Array.isArray(v.close)) continue; const c = v.fulldayPrice != null ? v.fulldayPrice : v.close[v.close.length - 1], p = v.chartPreviousClose != null ? v.chartPreviousClose : v.close[v.close.length - 2], t = v.timestamp && v.timestamp[v.timestamp.length - 1]; cotations[s] = { c, p, s5: v.close.length >= 5 ? v.close[0] : null, t: t ? t * 1000 : null }; } recus++; } catch (e) { erreurs.push(messageErreur(e)); } }));
    if (!recus) throw new Error(routeAbsente(erreurs[0] || '') ? 'route du Worker non déployée' : erreurs[0] || 'aucune cotation');
    const lignes = performances(cotations), r = resumeHeatmap(lignes), dern = Math.max(0, ...lignes.map(l => l.t || 0));
    return ok({ lignes, resume: r, lots: recus }, maintenant() - dern < 30 * MIN ? 'DIFFÉRÉ' : 'DIFFÉRÉ', 'Yahoo Finance (cotations différées, non officiel)', 'worker');
  });

  /* ── Dépôts SEC d'une valeur du Nasdaq 100 ── */
  const sec = symbole => avecCache('sec:' + symbole, TTL.sec, async () => {
    if (!CIK_NDX[symbole]) throw new Error('valeur hors de la liste (' + symbole + ')');
    const dep = depotsRecents(JSON.parse(await reseau.brut('sec:' + symbole)), { max: 40 }), nom = (NASDAQ100.find(x => x.s === symbole) || {}).nom || CIK_NDX[symbole].nom;
    return ok({ symbole, depots: dep, resume: resumeSec(symbole, nom, dep, maintenant()) }, 'RÉEL', 'SEC EDGAR · dépôts officiels', 'worker');
  });

  return { cot, courbe, bls, calendrier, flux, heatmap, sec, vider: () => { memoire.clear(); try { stockage && stockage.removeItem(CLE_LOCALE); } catch (e) { /* rien */ } } };
}

/* Un seul client par page. */
let unique = null;
export function obtenirFinance() { if (!unique) unique = creerFinance({}); return unique; }
export function remplacerFinance(c) { unique = c; }
