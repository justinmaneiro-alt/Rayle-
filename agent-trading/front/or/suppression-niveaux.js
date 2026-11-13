/* ═════════════ SUPPRIMER UN TRAIT OU UN CARRÉ : petite fenêtre + corbeille (remplace l'ancienne gomme et les boutons « Supprimer ») ═════════════
   Clic ou appui sur un trait, une ligne de tendance, un carré ou une zone : fenêtre flottante (nom, prix, corbeille). La corbeille supprime tout de suite, « Supprimé · Annuler » reste 6 s.
   Dessiné par toi = supprimé pour de bon ; calculé par le terminal (zone support/résistance, liquidité, niveau proposé) = masqué et mémorisé (« Rétablir les niveaux masqués » dans Couches).
   Un niveau masqué ne produit plus de nouvelles flèches ; les flèches déjà posées restent. Les flèches ont leur propre infobulle : la corbeille ne s'y applique pas. */
import { CLE_MASQUES, DUREE_ANNULER, tolerance, choisir, ajouterMasque, retirerMasque, placerFenetre, fmtPrix } from './suppression-calcul.js';
const lireJ = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrireJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* refusé */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CSS = `.tor-sup{position:absolute;z-index:9;min-width:170px;max-width:min(280px,86%);padding:8px 10px 8px 12px;background:#0b1117;border:1px solid rgba(143,208,227,.55);border-radius:6px;color:#d7e3ea;font:13px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.55);display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center}
.tor-sup[hidden]{display:none}.tor-sup b{font-weight:600;overflow-wrap:anywhere}.tor-sup .tor-sup-prix{font:12px ui-monospace,Consolas,monospace;color:#c9b27a}.tor-sup small{grid-column:1/-1;color:#9aa4ae;font-size:11.5px}
.tor-sup button{grid-row:1/3;grid-column:2;width:36px;height:36px;border-radius:6px;border:1px solid rgba(224,90,90,.6);background:rgba(224,90,90,.12);color:#ff8c8c;cursor:pointer;display:grid;place-items:center;padding:0}.tor-sup button:hover,.tor-sup button:focus-visible{background:rgba(224,90,90,.3);outline:none}
.tor-sup-toast{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:10;padding:7px 12px;background:#10161b;border:1px solid rgba(201,178,122,.6);border-radius:6px;color:#e6edf3;font:13px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.5);display:flex;gap:12px;align-items:center;white-space:nowrap}
.tor-sup-toast[hidden]{display:none}.tor-sup-toast button{background:none;border:0;color:#8fd0e3;font:600 13px system-ui,sans-serif;cursor:pointer;padding:4px 6px;text-decoration:underline}
.tor-sup-tactile button{width:44px;height:44px}`;
const SVG_CORBEILLE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg>';

export function monterSuppression(T, { maintenant = () => Date.now(), duree = DUREE_ANNULER } = {}) {
  const graph = T.graph, hote = graph.conteneur && graph.conteneur(); if (!hote) return null;
  if (!document.getElementById('tor-sup-css')) { const s = document.createElement('style'); s.id = 'tor-sup-css'; s.textContent = CSS; document.head.appendChild(s); }
  let masques = lireJ(CLE_MASQUES, []); graph.masques(masques);
  const fen = document.createElement('div'); fen.className = 'tor-sup'; fen.hidden = true; fen.setAttribute('role', 'dialog'); fen.setAttribute('aria-label', 'Supprimer ce niveau'); fen.dataset.supFenetre = '';
  const toast = document.createElement('div'); toast.className = 'tor-sup-toast'; toast.hidden = true; toast.setAttribute('role', 'status'); toast.dataset.supToast = '';
  hote.appendChild(fen); hote.appendChild(toast);
  let courant = null, minuteur = null, annulation = null;
  const outils = () => (T.modules && T.modules.outils) || T.outils;
  const pro = () => { try { return window.__or && window.__or.strategie && window.__or.strategie.pro; } catch (e) { return null; } };
  const sauver = () => { ecrireJ(CLE_MASQUES, masques); graph.masques(masques); };
  const fermer = () => { fen.hidden = true; courant = null; graph.surbrillance(null); };
  const annoncer = (texte, annuler) => {
    clearTimeout(minuteur); annulation = annuler; toast.innerHTML = `<span>${esc(texte)}</span><button type="button" data-sup-annuler>Annuler</button>`; toast.hidden = false;
    minuteur = setTimeout(() => { toast.hidden = true; annulation = null; }, duree);
  };
  toast.addEventListener('click', async e => { if (!e.target.closest('[data-sup-annuler]')) return; clearTimeout(minuteur); toast.hidden = true; const f = annulation; annulation = null; if (f) await f(); });
  /* candidats : dessins, niveaux proposés et zones (graphique) + annotations du terminal Pro */
  function candidats(x, y, tol) { const L = graph.candidatsSuppr ? graph.candidatsSuppr(x, y, tol) : []; const p = pro(); if (p && p.candidatsSuppr) L.push(...p.candidatsSuppr(x, y, tol)); return L; }
  /* actions par type : retournent la fonction qui défait */
  const ACTIONS = {
    async objet(c) { const O = outils(); const o = c.o; await O.supprimer(o.id); return async () => { await O.enregistrer(o); }; },
    async propose(c) { const O = outils(); await O.decider(c.pr.cle, false); return async () => { await O.annulerDecision(c.pr.cle); }; },
    async zone(c) { const m = { cle: 'm' + maintenant().toString(36) + Math.floor(Math.random() * 1e4), kind: c.kind === 'liq' ? 'liq' : 'zone', bas: c.bas, haut: c.haut, nom: c.nom, t: maintenant() }; masques = ajouterMasque(masques, m); sauver(); return async () => { masques = retirerMasque(masques, m.cle); sauver(); }; },
    async ann(c) { const P = pro(); const a = c.a; P.supprimerAnn(a.id); return async () => { P.restaurerAnn(a); }; }
  };
  const note = c => c.type === 'zone' && c.kind !== 'liq' ? 'Ce niveau ne produira plus de flèches.' : (c.type === 'zone' || c.type === 'propose') ? 'Masqué et mémorisé (Couches › Rétablir les niveaux masqués).' : 'Supprimé pour de bon (Annuler pendant 6 s).';
  function ouvrir(c, x, y, tactile) {
    courant = c; fen.classList.toggle('tor-sup-tactile', !!tactile);
    fen.innerHTML = `<b data-sup-nom>${esc(c.nom)}</b><span class="tor-sup-prix" data-sup-prix>${esc(c.prixTexte || fmtPrix(c.bas ?? c.prix, c.haut ?? c.prix))}</span><button type="button" data-sup-corbeille aria-label="Supprimer" title="Supprimer">${SVG_CORBEILLE}</button><small data-sup-note>${esc(note(c))}</small>`;
    fen.hidden = false; const W = hote.clientWidth, H = hote.clientHeight, p = placerFenetre(x, y, fen.offsetWidth || 220, fen.offsetHeight || 70, W, H); fen.style.left = p.left + 'px'; fen.style.top = p.top + 'px'; graph.surbrillance(c.cle);
  }
  fen.addEventListener('click', async e => {
    if (!e.target.closest('[data-sup-corbeille]') || !courant) return; e.stopPropagation(); const c = courant; fermer();
    try { const defaire = await ACTIONS[c.type](c); annoncer('Supprimé', defaire); } catch (er) { annoncer('Suppression impossible : ' + er.message, null); }
  });
  /* clic / appui sur le graphique (appelé par graphique-or.js ; renvoie true si la fenêtre s'ouvre) */
  function clic(x, y, e) {
    const tactile = e && (e.pointerType === 'touch' || e.pointerType === 'pen'), c = choisir(candidats(x, y, tolerance(e && e.pointerType)));
    if (!c) { if (courant) fermer(); return false; }
    ouvrir(c, x, y, tactile); return true;
  }
  function survol(x, y, e) { if (courant) return false; const c = choisir(candidats(x, y, tolerance(e && e.pointerType))); graph.surbrillance(c ? c.cle : null); return !!c; }
  document.addEventListener('pointerdown', e => { if (!courant || fen.contains(e.target) || hote.contains(e.target)) return; fermer(); }, true);   // clic hors du graphique ; sur le graphique : clic() décide
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && courant) { e.stopPropagation(); fermer(); } }, true);
  graph.brancherSuppression({ clic, survol, ouvert: () => !!courant });
  return {
    masques: () => masques.slice(), clic, fermer, ouvert: () => !!courant, candidats,
    retablir() { const n = masques.length; masques = []; sauver(); return n; },
    detruire() { fen.remove(); toast.remove(); }
  };
}
