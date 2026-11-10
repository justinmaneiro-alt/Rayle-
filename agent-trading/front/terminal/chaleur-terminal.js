/* ═════════════ TERMINAL : CARTE DE CHALEUR DU CARNET, TYPE BOOKMAP (phase E, facultative) ═════════════
   Enregistrée À PARTIR DE L'ACTIVATION (aucun historique ancien du carnet n'existe) : une colonne par seconde de l'actif affiché,
   regroupée par cases de prix fixes, écrite par lots de 10 s dans IndexedDB « rayle-terminal-chaleur » (sur l'appareil seulement).
   Stockage limité et réglable (50 Mo par défaut) : au-delà, les colonnes les plus anciennes sont supprimées.
   Dessin sous les bougies : bleu-cyan = acheteurs dominants, ambre = vendeurs dominants ; intensité = racine de la quantité en $. */
import { pasPour, colonne, octets, agreger, echelle, intensite, aPurger } from './chaleur-calcul.js';
import { PAR_ID_T, fmt } from './actifs-terminal.js';

const lireJ = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : { ...d, ...JSON.parse(v) }; } catch (e) { return d; } };
const ecrireJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };
const BASE = 'rayle-terminal-chaleur', MEMOIRE_MS = 6 * 3600e3;
const prom = rq => new Promise((ok, ko) => { rq.onsuccess = () => ok(rq.result); rq.onerror = () => ko(rq.error); });

async function ouvrir(idb = globalThis.indexedDB) {
  if (!idb) return null;
  try { return await new Promise((ok, ko) => { const q = idb.open(BASE, 1); q.onupgradeneeded = () => { q.result.createObjectStore('colonnes', { keyPath: ['actif', 't'] }); q.result.createObjectStore('meta'); }; q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error); }); } catch (e) { return null; }
}

export async function monterChaleur(T, { maintenant = () => Date.now() } = {}) {
  const db = await ouvrir();
  const E = { regl: lireJ('rayle_term_chaleur', { enregistrer: false, limiteMo: 50, active: false, intensite: 1, profondeur: 1, murs: true }), cols: [], file: [], pas: null, actif: null, taille: 0, depuis: null, detruit: false };
  if (db) { E.taille = (await prom(db.transaction('meta').objectStore('meta').get('taille'))) || 0; E.depuis = (await prom(db.transaction('meta').objectStore('meta').get('depuis'))) || null; }
  const G = T.graph;

  async function chargerActif() {
    E.actif = T.actif(); E.cols = []; E.pas = null; if (!db) return;
    const t0 = maintenant() - MEMOIRE_MS, r = IDBKeyRange.bound([E.actif, t0], [E.actif, Infinity]);
    E.cols = await prom(db.transaction('colonnes').objectStore('colonnes').getAll(r)); G.redessiner();
  }
  /* une colonne par seconde (actif affiché) */
  const prise = setInterval(() => {
    if (E.detruit || !E.regl.enregistrer || document.hidden) return; const c = T.etatCarnet(); if (!c || !c.carnet || T.actif() !== E.actif) return;
    if (!E.pas) E.pas = pasPour(c.milieu, (PAR_ID_T[E.actif] || {}).tick || 0);
    const col = colonne(c.carnet, maintenant(), E.pas); if (!col) return;
    const rec = { actif: E.actif, ...col }; E.cols.push(rec); E.file.push(rec);
    const lim = maintenant() - MEMOIRE_MS; while (E.cols.length && E.cols[0].t < lim) E.cols.shift();
    if (T.couches().chaleur) G.redessiner();
  }, 1000);
  /* écriture par lots de 10 s + purge au-delà de la limite */
  const ecriture = setInterval(async () => {
    if (!db || !E.file.length) return; const lot = E.file.splice(0); let ajout = 0;
    await new Promise(ok => { const tx = db.transaction(['colonnes', 'meta'], 'readwrite'), st = tx.objectStore('colonnes'); for (const r of lot) { st.put(r); ajout += octets(r); } E.taille += ajout; tx.objectStore('meta').put(E.taille, 'taille'); if (!E.depuis) { E.depuis = lot[0].t; tx.objectStore('meta').put(E.depuis, 'depuis'); } tx.oncomplete = ok; tx.onerror = ok; });
    if (E.taille > E.regl.limiteMo * 1e6) await purger();
    rendreCarte();
  }, 10000);
  async function purger() {
    const tout = await new Promise(ok => { const L = [], rq = db.transaction('colonnes').objectStore('colonnes').openCursor();
      rq.onsuccess = () => { const c = rq.result; if (!c) { ok(L.sort((x, y) => x.t - y.t)); return; } L.push({ cle: c.primaryKey, t: c.value.t, octets: octets(c.value) }); c.continue(); }; rq.onerror = () => ok(L); });
    const cles = aPurger(E.taille, E.regl.limiteMo * 1e6, tout), suppr = new Set(cles.map(k => k.join('|'))), libere = tout.filter(x => suppr.has(x.cle.join('|'))).reduce((s2, x) => s2 + x.octets, 0);
    await new Promise(ok => { const tx = db.transaction(['colonnes', 'meta'], 'readwrite'); for (const k of cles) tx.objectStore('colonnes').delete(k); E.taille = Math.max(0, E.taille - libere); tx.objectStore('meta').put(E.taille, 'taille'); if (tout.length > cles.length) tx.objectStore('meta').put(tout[cles.length].t, 'depuis'); tx.oncomplete = ok; tx.onerror = ok; });
    if (tout.length > cles.length) E.depuis = tout[cles.length].t;
    const lim = E.depuis || 0; E.cols = E.cols.filter(c => c.t >= lim);
  }
  async function toutEffacer() { if (!db) return; await new Promise(ok => { const tx = db.transaction(['colonnes', 'meta'], 'readwrite'); tx.objectStore('colonnes').clear(); tx.objectStore('meta').clear(); tx.oncomplete = ok; }); E.taille = 0; E.depuis = null; E.cols = []; G.redessiner(); rendreCarte(); }

  /* dessin sous les bougies */
  G.ajouterPrimitive((ctx, D) => {
    if (!T.couches().chaleur || !E.cols.length || T.actif() !== E.actif) return;
    const ms = G.ms(), B = agreger(E.cols, 0, ms), ref = echelle(B), xa = G.xDe(0) ?? 0, xb = G.xDe(ms) ?? 0, larg = Math.max(1, Math.abs(xb - xa));
    for (const b of B) { const x = G.xDe(b.t); if (x == null || x < -larg || x > D.width) continue;
      for (const c of b.cases) { const y1 = G.yDe(c.p + c.pas), y2 = G.yDe(c.p); if (y1 == null || y2 == null || y2 < 0 || y1 > D.height) continue; if (Math.abs(c.p - T.prix()) > T.prix() * E.regl.profondeur / 100) continue; const a = Math.min(1, intensite(c.q, ref) * 0.6 * E.regl.intensite); if (a < 0.03) continue;
        ctx.fillStyle = c.cote >= 0 ? `rgba(80,190,230,${a.toFixed(3)})` : `rgba(230,160,70,${a.toFixed(3)})`; ctx.fillRect(x - larg / 2, Math.min(y1, y2), larg, Math.max(1, Math.abs(y2 - y1))); if (E.regl.murs && c.q >= 3 * ref) { ctx.strokeStyle = 'rgba(255,214,102,.8)'; ctx.lineWidth = 1; ctx.strokeRect(x - larg / 2, Math.min(y1, y2), larg, Math.max(1, Math.abs(y2 - y1))); } } }
  }, 'bottom');

  /* réglages : une carte dans les dashboards */
  const grille = T.panneau('dash').querySelector('.tr-dash'), carte = document.createElement('section'); carte.className = 'tr-carte'; carte.dataset.d = 'chaleur'; grille.appendChild(carte);
  function rendreCarte() {
    const d = E.depuis ? new Date(E.depuis).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'jamais';
    carte.innerHTML = `<h3>Carte de chaleur du carnet <small>type Bookmap</small></h3>
      <label><input type="checkbox" data-ch="enregistrer" ${E.regl.enregistrer ? 'checked' : ''}> enregistrer le carnet de l’actif affiché (1 colonne / s)</label>
      <label style="display:block;margin-top:4px">Limite de stockage <input type="number" min="5" max="2000" step="5" data-ch="limiteMo" value="${E.regl.limiteMo}" style="width:70px"> Mo</label>
      <label style="display:block;margin-top:4px">Intensité <input type="range" min="0.3" max="3" step="0.1" data-ch="intensite" value="${E.regl.intensite}"> · profondeur ± <input type="number" min="0.1" max="5" step="0.1" data-ch="profondeur" value="${E.regl.profondeur}" style="width:60px"> % du prix</label>
      <label style="display:block;margin-top:4px"><input type="checkbox" data-ch="murs" ${E.regl.murs ? 'checked' : ''}> entourer les gros paquets persistants (murs ; ceux retirés ou consommés disparaissent de la carte)</label>
      <p class="tr-doux">Utilisé : ${(E.taille / 1e6).toFixed(1).replace('.', ',')} Mo · enregistré depuis : ${d}${db ? '' : ' · stockage local indisponible (mémoire seulement)'}</p>
      <p class="tr-mini">Enregistré depuis l’ouverture du terminal, pas d’historique ancien : Kraken ne fournit pas le passé du carnet, la carte commence à l’activation. Au-delà de la limite, les plus anciennes secondes sont effacées.</p>
      <button class="tr-btn" type="button" data-ch="effacer">Effacer l’enregistrement</button>`;
  }
  carte.addEventListener('change', e => { const k = e.target.dataset.ch; if (k === 'enregistrer') E.regl.enregistrer = e.target.checked; if (k === 'limiteMo') E.regl.limiteMo = Math.max(5, Math.min(2000, +e.target.value || 50)); if (k === 'intensite') E.regl.intensite = Math.max(0.3, Math.min(3, +e.target.value || 1)); if (k === 'profondeur') E.regl.profondeur = Math.max(0.1, Math.min(5, +e.target.value || 1)); if (k === 'murs') E.regl.murs = e.target.checked; G.redessiner(); ecrireJ('rayle_term_chaleur', E.regl); rendreCarte(); });
  carte.addEventListener('click', e => { if (e.target.dataset.ch === 'effacer' && confirm('Effacer tout l’enregistrement du carnet ?')) toutEffacer(); });
  const offC = T.on('couches', c => { if (c.chaleur && !E.regl.active) { E.regl.active = true; E.regl.enregistrer = true; ecrireJ('rayle_term_chaleur', E.regl); rendreCarte(); } G.redessiner(); });
  const offA = T.on('actif', () => chargerActif());
  await chargerActif(); rendreCarte();
  return { E, colonnes: () => E.cols, purger, toutEffacer,
    resume() { if (!E.cols.length) return 'pas encore d’enregistrement (activer la couche)'; const B = agreger(E.cols, 0, G.ms()), ref = echelle(B); let mur = null; for (const b of B.slice(-5)) for (const c of b.cases) if (c.q >= 3 * ref && (!mur || c.q > mur.q)) mur = c; return mur ? `gros paquet persistant ${mur.cote >= 0 ? 'acheteur' : 'vendeur'} vers ${fmt(T.actif(), mur.p)}` : 'pas de gros paquet persistant ; enregistré depuis l’ouverture du terminal, pas d’historique ancien'; },
    detruire() { E.detruit = true; clearInterval(prise); clearInterval(ecriture); offC(); offA(); try { db && db.close(); } catch (e) { /* */ } } };
}
