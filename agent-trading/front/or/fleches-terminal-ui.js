/* ═════════════ FLÈCHES DU TERMINAL : interface (interrupteur, infobulle, registre, alertes) ═════════════
   Calcul : fleches-terminal-v1.js (scellé). Ici : bougies H1 closes du moteur → flèches → graphique ; registre local en ajout seul (une flèche posée n'est
   jamais déplacée ni retirée) ; interrupteur « historique 30 jours » ; infobulle au survol (date, type, résultat mesuré à 6, 12 et 24 bougies).
   Les flèches restent visibles en mode Pro épuré. Information de lecture, jamais un ordre. */
import * as F from './fleches-simples.js';   // v2 (2026-11-12) : flèches lues sur les zones H1 DESSINÉES ; v1 et terminal-v1 (scellées) restent disponibles. Ancienne ligne :    // 2026-11-12 : flèches de lecture (MA200 et gros niveaux seulement, sans grappes) ; l'ancienne règle fleches-terminal-v1 (scellée) reste disponible en mode debug

const CLE_REG = 'rayle_or_fleches_t6', CLE_HIST = 'rayle_or_fleches_t1_hist';
const lireJ = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrireJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* plein ou refusé */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateLongue = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function monterFlechesTerminal(T, { maintenant = () => Date.now(), pret = Promise.resolve() } = {}) {
  const R = T.R, E = { registre: lireJ(CLE_REG, null), hist: lireJ(CLE_HIST, true), cle: '', liste: [], dernier: null, nouvelles: 0 };
  const premier = E.registre === null; if (premier) E.registre = [];
  const barre = R.querySelector('[data-graph-barre]');
  if (barre && !barre.querySelector('[data-ft]')) {
    const l = document.createElement('label'); l.className = 'tor-gb tor-ft'; l.dataset.ft = ''; l.title = 'Repères de lecture posés à la clôture de la bougie H1 : MA200 (cassure confirmée, retest, rebond) et gros supports / résistances (2 bougies sur le niveau, rebond confirmé). Jamais redessinés, jamais un ordre ni une promesse de gain.';
    l.innerHTML = '<input type="checkbox" data-ft-hist> Flèches : historique 30 j <b data-ft-n></b>'; barre.appendChild(l);
  }
  const caseHist = R.querySelector('[data-ft-hist]'); if (caseHist) { caseHist.checked = !!E.hist; caseHist.addEventListener('change', () => { E.hist = caseHist.checked; ecrireJ(CLE_HIST, E.hist); afficher(); }); }
  const bulle = document.createElement('div'); bulle.className = 'tor-ft-bulle'; bulle.hidden = true; bulle.setAttribute('role', 'tooltip');
  const zone = R.querySelector('[data-graph]'); if (zone) { zone.style.position = zone.style.position || 'relative'; zone.appendChild(bulle); }

  /* arrows visibles : tout l'historique des 30 jours, ou seulement les dernières 24 heures quand l'interrupteur est coupé */
  const visibles = () => { const n = maintenant(), de = n - (E.hist ? 30 : 1) * 86400e3; return E.liste.filter(f => !f.masquee && f.tCloture >= de && (f.levelId === 'MA200' || !E.ids || E.ids.has(f.levelId))); };   // jamais de flèche sans niveau dessiné
  function afficher() {
    const V = visibles(); try { T.graph.flechesTerminal(V); } catch (e) { /* graphique pas prêt */ }
    const b = R.querySelector('[data-ft-n]'); if (b) b.textContent = `(${V.length})`;
    ancrerBulle(V);
  }
  function calculer() {
    const H1 = T.h1 ? T.h1() : [], objets = (T.modules && T.modules.outils && T.modules.outils.E && T.modules.outils.E.objets) || [];
    const zones = T.graph.zonesH1 ? T.graph.zonesH1() : [];
    E.ids = new Set(zones.map(F.idNiveau));
    if (!zones.length) { E.raison = 'zones H1 pas encore dessinées'; return false; }
    const sig = (H1.length ? H1[H1.length - 1].t : 0) + '|' + H1.length + '|' + zones.map(z => z.id + z.tDebut + (z.tFin || '')).join(',');
    if (sig === E.cle) return false; E.cle = sig;
    const r = F.calculer(H1, zones, { maintenant: maintenant(), jours: null });   // tout l'historique chargé : le registre garde ce qui a été posé
    E.raison = r.raison; E.n = r.n;
    const avant = new Set(E.registre.map(f => f.id));
    E.registre = F.fusionnerRegistre(E.registre, r.fleches);
    for (const f of E.registre) if (!avant.has(f.id) && !f.masquee && !premier && f.tCloture > maintenant() - 2 * 3600e3) { E.nouvelles++; try { T.notifier(`Flèche ${f.dir > 0 ? 'haussière' : 'baissière'} : ${f.nom} (à la clôture de la bougie H1).`, { niveau: 'fort', dit: true }); } catch (e) { /* */ } }
    ecrireJ(CLE_REG, E.registre.slice(-600));
    E.liste = E.registre;
    return true;
  }
  /* infobulle : survol d'une flèche (bougie du graphique qui porte la marque) */
  let abonne = false, parTemps = new Map();
  function ancrerBulle(V) {
    parTemps = new Map(); for (const f of V) { const t = T.graph.tempsDeBougie ? T.graph.tempsDeBougie(f.tCloture - 1) : null; if (t != null) { if (!parTemps.has(t)) parTemps.set(t, []); parTemps.get(t).push(f); } }
    if (abonne) return; const ch = T.graph.chart && T.graph.chart(); if (!ch) return; abonne = true;
    ch.subscribeCrosshairMove(p => {
      if (!p || !p.point || p.time == null) { bulle.hidden = true; return; }
      const L = parTemps.get(p.time); if (!L || !L.length) { bulle.hidden = true; return; }
      bulle.innerHTML = L.map(f => `<div class="tor-ft-f"><b>${esc(f.nom)}</b><span>${esc(dateLongue(f.tCloture))} (clôture de la bougie H1)</span>${F.detail(f).concat(F.textesRes(f.resultat)).map(x => `<span>${esc(x)}</span>`).join('')}</div>`).join('') + '<small>Description de ce qui s’est passé, jamais un ordre.</small>';
      bulle.hidden = false; const w = bulle.offsetWidth || 260; bulle.style.left = Math.max(4, Math.min(p.point.x + 12, (zone ? zone.clientWidth : 600) - w - 4)) + 'px'; bulle.style.top = Math.max(4, p.point.y - 20) + 'px';
    });
  }
  const api = {
    maj() { try { if (calculer()) afficher(); else if (!E.liste.length) afficher(); } catch (e) { console.warn('flèches du Terminal :', e.message); } },
    etat: () => ({ n: E.liste.length, visibles: visibles().length, hist: E.hist, raison: E.raison || null, nouvelles: E.nouvelles, barres: E.n || 0 }),
    liste: () => E.liste.slice(), visibles, bilan: () => F.bilan(T.h1 ? T.h1() : [], E.liste.filter(f => !f.masquee)), fixerHistorique(v) { E.hist = !!v; ecrireJ(CLE_HIST, E.hist); if (caseHist) caseHist.checked = E.hist; afficher(); }
  };
  pret.then(() => api.maj());
  return api;
}
