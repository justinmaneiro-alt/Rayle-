/* ═════════════ STOCKAGE ET SYNCHRONISATION DU PORTEFEUILLE ═════════════
   Chaque appareil garde une copie locale complète (IndexedDB) : affichage instantané et hors ligne. Si le Worker Portefeuille est configuré (adresse + code, gardés sur l'appareil),
   les imports y sont envoyés (D1, dans TON compte Cloudflare) et les autres appareils les récupèrent par révisions. Rien n'est écrit dans le dépôt GitHub.
   Fusion sans doublon : clé = n° de position XTB (positions) ou identifiant d'opération (trésorerie). Testable sous Node : stockage et fetch injectables. */
import { importerXtb } from './import-xtb.js';

export const CLE_CONN = 'rayle_pf_conn_v1';          // localStorage : { url, code } (le code reste sur l'appareil)
export const CLE_RESUME = 'rayle_pf_resume_v1';      // localStorage : résumé pour la miniature du carrousel (cet appareil seulement)
const K = { fermees: 'pf|fermees', tresorerie: 'pf|tresorerie', ouvertes: 'pf|ouvertes', reglages: 'pf|reglages', alertes: 'pf|alertes', rapport: 'pf|rapport', sync: 'pf|sync' };
const stable = o => JSON.stringify(o, Object.keys(o).sort());
export const lireConn = (ls = globalThis.localStorage) => { try { const c = JSON.parse(ls.getItem(CLE_CONN) || 'null'); return c && c.url ? { url: String(c.url).replace(/\/+$/, ''), code: String(c.code || '') } : null; } catch (e) { return null; } };
export const ecrireConn = (c, ls = globalThis.localStorage) => { try { if (!c || !c.url) ls.removeItem(CLE_CONN); else ls.setItem(CLE_CONN, JSON.stringify({ url: String(c.url).trim().replace(/\/+$/, ''), code: String(c.code || '').trim() })); } catch (e) { /* stockage refusé */ } };

/* v4 : appairage en un geste. Le PC copie un lien « …/#pf=<base64 de {url,code}> » ; ouvert sur la tablette ou le téléphone, il enregistre la connexion (config.js le fait au chargement, sans ouvrir le Portefeuille). */
export const lienAppairage = (c, origine) => (c && c.url ? String(origine || '').replace(/[#?].*$/, '') + '#pf=' + btoa(unescape(encodeURIComponent(JSON.stringify({ url: c.url, code: c.code || '' })))) : null);
export function lireAppairage(hash) {
  const m = /(?:^|[#&])pf=([A-Za-z0-9+/=_-]+)/.exec(String(hash || '')); if (!m) return null;
  try { const o = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); return o && /^https:\/\//.test(o.url || '') ? { url: String(o.url).replace(/\/+$/, ''), code: String(o.code || '') } : null; } catch (e) { return null; }
}

/* différence entre des lignes reçues et celles qu'on a déjà : { nouvelles, modifiees, inchangees } */
export function diff(existantes, recues) {
  const m = new Map(existantes.map(x => [x.id, stable(x)])), nouvelles = [], modifiees = []; let inchangees = 0;
  for (const x of recues) { const a = m.get(x.id); if (a === undefined) nouvelles.push(x); else if (a !== stable(x)) modifiees.push(x); else inchangees++; }
  return { nouvelles, modifiees, inchangees };
}
export function fusionner(existantes, lignes) { const m = new Map(existantes.map(x => [x.id, x])); for (const x of lignes) m.set(x.id, x); return [...m.values()]; }

export function creerPortefeuille({ stockage, fetchFn = (...a) => fetch(...a), conn = () => lireConn(), maintenant = () => Date.now(), delai = 20000 } = {}) {
  const lire = async (cle, def) => { try { const v = await stockage.lire(cle); return v && v.v !== undefined ? v.v : def; } catch (e) { return def; } };
  const ecrire = (cle, v) => stockage.ecrire(cle, { t: maintenant(), v });
  async function api(methode, chemin, corps) {
    const c = conn(); if (!c) throw Object.assign(new Error('Worker Portefeuille non configuré'), { horsConfig: true });
    const r = await fetchFn(c.url + chemin, { method: methode, headers: { 'Content-Type': 'application/json', ...(c.code ? { 'X-Portefeuille-Code': c.code } : {}) }, body: corps ? JSON.stringify(corps) : undefined, signal: AbortSignal.timeout(delai) });
    let j = null; try { j = await r.json(); } catch (e) { /* corps vide */ } if (!r.ok) throw Object.assign(new Error((j && j.error) || 'le Worker a répondu ' + r.status), { statut: r.status }); return j;
  }
  const charger = async () => ({ fermees: await lire(K.fermees, []), tresorerie: await lire(K.tresorerie, []), ouvertes: await lire(K.ouvertes, { t: null, positions: [], resume: {} }), reglages: await lire(K.reglages, {}), alertes: await lire(K.alertes, []), rapport: await lire(K.rapport, null), sync: await lire(K.sync, { rev: 0, dernier: null, enAttente: { fermees: [], tresorerie: [] } }) });

  /* récupère ce qui a changé sur le Worker depuis la dernière révision connue */
  async function synchroniser() {
    const L = await charger(); if (!conn()) return { ok: false, horsConfig: true, ...L };
    try {
      /* d'abord ce qui n'a pas pu partir (import fait hors ligne) */
      const att = L.sync.enAttente || { fermees: [], tresorerie: [] };
      if (att.fermees.length || att.tresorerie.length) { await api('POST', '/importer', { fermees: att.fermees, tresorerie: att.tresorerie }); L.sync.enAttente = { fermees: [], tresorerie: [] }; }
      const d = await api('GET', '/donnees?depuis=' + (L.sync.rev || 0));
      const F = fusionner(L.fermees, d.fermees), T = fusionner(L.tresorerie, d.tresorerie);
      const recu = { fermees: d.fermees.length, tresorerie: d.tresorerie.length };
      await ecrire(K.fermees, F); await ecrire(K.tresorerie, T);
      if (d.ouvertes && (!L.ouvertes.t || (d.ouvertes.t || 0) >= L.ouvertes.t)) await ecrire(K.ouvertes, d.ouvertes); await ecrire(K.reglages, { ...L.reglages, ...(d.reglages || {}) }); if (Array.isArray(d.alertes)) await ecrire(K.alertes, d.alertes); if (d.rapport) await ecrire(K.rapport, d.rapport);
      await ecrire(K.sync, { rev: d.rev, dernier: maintenant(), enAttente: L.sync.enAttente }); return { ok: true, recu, ...(await charger()) };
    } catch (e) { return { ok: false, erreur: String(e && e.message || e), statut: e && e.statut, ...L }; }
  }
  /* import de fichiers XTB : fusionne en local, puis envoie au Worker seulement le nouveau */
  async function importer(fichiers) {
    const X = await importerXtb(fichiers);
    if (conn()) await synchroniser().catch(() => {});   // repart de l'état du Worker avant de comparer
    const L = await charger(), dF = diff(L.fermees, X.fermees), dT = diff(L.tresorerie, X.tresorerie);
    const F = fusionner(L.fermees, [...dF.nouvelles, ...dF.modifiees]), T = fusionner(L.tresorerie, [...dT.nouvelles, ...dT.modifiees]);
    const ouvertes = { t: maintenant(), positions: X.ouvertes, resume: X.resume };
    await ecrire(K.fermees, F); await ecrire(K.tresorerie, T); await ecrire(K.ouvertes, ouvertes);
    const bilan = { nouvelles: { fermees: dF.nouvelles.length, tresorerie: dT.nouvelles.length }, modifiees: { fermees: dF.modifiees.length, tresorerie: dT.modifiees.length }, inchangees: { fermees: dF.inchangees, tresorerie: dT.inchangees }, totaux: { fermees: F.length, tresorerie: T.length }, periode: X.periode, avertissements: X.avertissements, totalTresorerieFichier: X.totalTresorerieFichier, synchro: null };
    const aEnvoyer = { fermees: [...dF.nouvelles, ...dF.modifiees], tresorerie: [...dT.nouvelles, ...dT.modifiees] };
    if (conn()) {
      try { const r = await api('POST', '/importer', { ...aEnvoyer, ouvertes: X.ouvertes, resume: X.resume }); const prev = (L.sync && L.sync.rev) || 0; await ecrire(K.sync, { rev: r.rev === prev + 1 ? r.rev : prev, dernier: maintenant(), enAttente: { fermees: [], tresorerie: [] } }); bilan.synchro = { ok: true, rev: r.rev }; }
      catch (e) { const att = L.sync.enAttente || { fermees: [], tresorerie: [] }; await ecrire(K.sync, { ...L.sync, enAttente: { fermees: fusionner(att.fermees, aEnvoyer.fermees), tresorerie: fusionner(att.tresorerie, aEnvoyer.tresorerie) } }); bilan.synchro = { ok: false, erreur: String(e && e.message || e) }; }
    } else bilan.synchro = { ok: false, horsConfig: true };
    return bilan;
  }
  const sauverReglages = async r => { const L = await charger(), n = { ...L.reglages, ...r }; await ecrire(K.reglages, n); let synchro = null; if (conn()) { try { await api('PUT', '/reglages', n); synchro = { ok: true }; } catch (e) { synchro = { ok: false, erreur: String(e.message || e) }; } } return { reglages: n, synchro }; };
  const sauverAlertes = async A => { await ecrire(K.alertes, A); if (conn()) { try { await api('PUT', '/alertes', { alertes: A }); return { ok: true }; } catch (e) { return { ok: false, erreur: String(e.message || e) }; } } return { ok: false, horsConfig: true }; };
  const sauverRapport = async r => { await ecrire(K.rapport, r); if (conn()) { try { await api('PUT', '/rapport', r); return { ok: true }; } catch (e) { return { ok: false, erreur: String(e.message || e) }; } } return { ok: false, horsConfig: true }; };
  async function exporter() { const L = await charger(); return { version: 1, t: maintenant(), fermees: L.fermees, tresorerie: L.tresorerie, ouvertes: L.ouvertes, reglages: L.reglages, alertes: L.alertes, rapport: L.rapport }; }
  async function restaurer(b) {
    if (!b || !Array.isArray(b.fermees) || !Array.isArray(b.tresorerie) || (!b.fermees.length && !b.tresorerie.length)) throw new Error('sauvegarde invalide ou vide : rien n’est restauré');
    await ecrire(K.fermees, b.fermees); await ecrire(K.tresorerie, b.tresorerie); if (b.ouvertes) await ecrire(K.ouvertes, b.ouvertes); if (b.reglages) await ecrire(K.reglages, b.reglages); if (b.alertes) await ecrire(K.alertes, b.alertes);
    const L = await charger(); await ecrire(K.sync, { rev: 0, dernier: null, enAttente: { fermees: L.fermees, tresorerie: L.tresorerie } }); return { fermees: b.fermees.length, tresorerie: b.tresorerie.length };
  }
  return { charger, synchroniser, importer, sauverReglages, sauverAlertes, sauverRapport, exporter, restaurer, api, K };
}
