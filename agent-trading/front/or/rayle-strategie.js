/* ═════════════ STRATÉGIE RAYLE v1 : colle (boutons collés au graphique, mode Épuré / Complet, panneau, modèle d'affichage, voix) ═════════════
   Document de référence : STRATEGIE-RAYLE.md (scellé SHA-256). Calculs scellés : ma-evenements-v1.js (phase 1) ; les autres phases s'ajoutent ici.
   Un OUTIL, jamais un agent : aucun ordre, aucune décision. Rayle décrit, calcule, dessine et mesure ; chaque chiffre vient avec son n et la valeur du hasard. */
import * as MA from './ma-evenements-v1.js';
import { evenementsAffiches, texteMa, compterObjets, hp } from './rayle-modele-calcul.js';
import { COUCHES_RAYLE } from './rayle-couches.js';
const CLE_REG = 'rayle_or_rayle_reglages';
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function creerStrategie({ racine, moteur, graph, structure, parler = () => {}, maintenant = () => Date.now(), fetchFn = (...a) => fetch(...a), auto = true, stats = null } = {}) {
  const E = { reg: { vue: 'epure', ma: 'h1', horizon: '1j', ...lire(CLE_REG, {}) }, stats: { ma: stats && stats.ma || null }, B: null, cle: '', res: null, h4: null, m: null };
  const q = s => racine && racine.querySelector(s);
  const couches = () => graph.couches();
  async function chargerStats() {
    if (!E.stats.ma) { try { const r = await fetchFn(new URL('./ma-stats.json', import.meta.url).href, { cache: 'no-store' }); if (r.ok) E.stats.ma = await r.json(); } catch (e) { /* mesures « indisponibles » */ } }
  }
  /* ── DOM : boutons collés au graphique et panneau (insérés ici pour ne pas alourdir tableau-or.js) ── */
  const barre = q('[data-graph-barre]');
  if (barre && !barre.querySelector('[data-a="ray-vue"]')) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tor-gb'; b.dataset.a = 'ray-vue'; b.setAttribute('aria-pressed', 'true'); b.title = 'Mode Épuré (2 événements, 2 zones de chaque côté, 2 scénarios) ou Complet (tout ce que Rayle calcule)'; b.textContent = 'Épuré';
    barre.insertBefore(b, barre.firstChild);
  }
  if (racine && !q('[data-rayle]')) {
    const sec = document.createElement('section'); sec.className = 'tor-bloc tor-rayle'; sec.dataset.rayle = '';
    sec.innerHTML = `<h2>Stratégie Rayle v1 <small>lecture en observation · aucune règle automatique n’a prouvé un avantage · jamais un ordre</small></h2>
      <p class="tor-ctx-pied" data-ray-etat>Chargement…</p>
      <div class="tor-ctx-actions"><label>Moyenne mobile <select data-ray-ma><option value="h1">SMA 200 H1</option><option value="jour">SMA 200 Jour</option></select></label> <button type="button" class="tor-gb" data-a="ray-vue">Épuré</button></div>
      <div data-ray-ma-corps></div><p class="tor-ctx-pied" data-ray-pied></p>`;
    const ict = q('[data-ict]'); if (ict && ict.parentNode) ict.parentNode.insertBefore(sec, ict); else racine.appendChild(sec);
  }
  /* ── calcul à la clôture de chaque bougie H1 (jamais entre deux clôtures) ── */
  function analyser() {
    const st = structure && structure.etat && structure.etat(), A = st && st.A; if (!A || !A.B || A.B.length < 60) return false;
    const B = A.B, cle = `${B.length}|${B[B.length - 1].t}|${E.reg.ma}`; if (cle === E.cle && E.res) return false; E.cle = cle; E.B = B;
    E.res = MA.analyser(B, { mode: E.reg.ma, periode: 3600e3 }); return true;
  }
  function modele() {
    const c = couches(), B = E.B, res = E.res; if (!B || !res) return null;
    const m = { ma: null, evenements: [], boites: [], ligne: null, scenarios: null, structure: [] };
    if (c.rayMa !== false) {
      const debut = Math.max(0, B.length - 1500), pts = []; for (let i = debut; i < B.length; i++) if (res.ma[i] != null) pts.push({ t: B[i].t, v: res.ma[i] });
      m.ma = pts; m.maNom = E.reg.ma === 'jour' ? 'MA 200 jours' : 'MA 200 H1'; m.maDetail = [texteMa(res, B), 'moyenne simple des 200 dernières clôtures', 'repère de lecture, pas un signal'];
      m.evenements = evenementsAffiches(res, B, { vue: E.reg.vue, stats: E.stats.ma });
    }
    return m;
  }
  function maj(force = false) {
    const change = analyser() || force; if (!change && !force) { return; }
    const m = modele(); E.m = m; try { graph.rayle(m); } catch (e) { console.warn('Rayle :', e.message); }
    majBoutons(); rendre();
  }
  function majBoutons() { for (const b of racine.querySelectorAll('[data-a="ray-vue"]')) { b.textContent = E.reg.vue === 'epure' ? 'Épuré' : 'Complet'; b.classList.toggle('actif', E.reg.vue === 'epure'); b.setAttribute('aria-pressed', String(E.reg.vue === 'epure')); } }
  function rendre() {
    const e = q('[data-ray-etat]'); if (e) e.textContent = E.res ? texteMa(E.res, E.B) : 'Chargement des bougies H1…';
    const sel = q('[data-ray-ma]'); if (sel) sel.value = E.reg.ma;
    const c = q('[data-ray-ma-corps]'); if (c) { const L = (E.m && E.m.evenements || []).slice().reverse(); c.innerHTML = L.length ? `<ul class="tor-ray-evts">${L.map(x => `<li><b>${esc(x.etiquette)}</b> <small>${esc(hp(x.t))}</small></li>`).join('')}</ul>` : '<p class="tor-doux">Aucun événement récent sur la moyenne mobile.</p>'; }
    const p = q('[data-ray-pied]'); if (p) p.textContent = `Mode ${E.reg.vue === 'epure' ? 'Épuré' : 'Complet'} · ${compterObjets(E.m)} objet${compterObjets(E.m) > 1 ? 's' : ''} affiché${compterObjets(E.m) > 1 ? 's' : ''} sur le graphique${E.stats.ma ? ` · mesures Dukascopy du ${E.stats.ma.calcule} (règle ${E.stats.ma.version})` : ' · mesures en chargement'}`;
  }
  function reglage(k, v) { E.reg[k] = v; ecrire(CLE_REG, E.reg); maj(true); }
  racine.addEventListener('click', ev => { const b = ev.target.closest('[data-a="ray-vue"]'); if (b) reglage('vue', E.reg.vue === 'epure' ? 'complet' : 'epure'); });
  racine.addEventListener('change', ev => { const t = ev.target; if (t.matches && t.matches('[data-ray-ma]')) reglage('ma', t.value); else if (t.dataset && t.dataset.couche in COUCHES_RAYLE) maj(true); });
  let minuterie = null; if (auto) { chargerStats().then(() => maj(true)); minuterie = setInterval(() => { try { maj(); } catch (e) { /* */ } }, 30000); }
  return { maj, chargerStats, modele: () => E.m, etat: () => ({ reg: { ...E.reg }, res: E.res, B: E.B, stats: E.stats, m: E.m }), reglage, compterObjets: () => compterObjets(E.m), detruire() { clearInterval(minuterie); } };
}
