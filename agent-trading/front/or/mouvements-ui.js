/* ═════════════ COUCHE « MOUVEMENTS H1 » : contrôleur de l'interface (dans le menu « Couches ») ═════════════
   Curseur de seuil (1 à 3 ATR), statistiques repliables, export CSV / JSON. Le calcul tourne dans un Worker (mouvements-worker.js) : l'interface n'est jamais bloquée.
   H1 seulement : sur les autres unités de temps, la couche et ses réglages sont masqués. Rétrospectif, jamais un signal. */
import { P } from './mouvements-v1.js';
import { AVERTISSEMENT, JOURS, versCSV, versJSON } from './mouvements-calcul.js';

const CLE_SEUIL = 'rayle_or_mouv_seuil';
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } };
const nb = (x, d = 0) => (x == null ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function creerMouvementsUI({ racine, graph, moteur }) {
  const q = s => racine.querySelector(s), bloc = q('[data-mouv-bloc]'), note = q('[data-mouv-note]'), curseur = q('[data-mouv-seuil]'), valeur = q('[data-mouv-seuil-val]'), corps = q('[data-mouv-stats-corps]'), caseCouche = q('[data-couche="mouvements"]');
  if (!bloc) return null;
  let seuil = Math.max(P.seuilMinAtr, Math.min(P.seuilMaxAtr, +lire(CLE_SEUIL, P.seuilDefautAtr) || P.seuilDefautAtr)), cle = null, dernier = null, nReq = 0, minuterie = null; const attente = new Map();
  curseur.min = String(P.seuilMinAtr); curseur.max = String(P.seuilMaxAtr); curseur.step = '0.1'; curseur.value = String(seuil); valeur.textContent = `${nb(seuil, 1)} ATR`;
  // ── Worker, avec repli sur le fil principal si le navigateur le refuse ──
  let worker = null;
  try { worker = new Worker(new URL('./mouvements-worker.js', import.meta.url), { type: 'module' }); worker.onmessage = e => { const a = attente.get(e.data.id); if (!a) return; attente.delete(e.data.id); e.data.ok ? a.ok(e.data) : a.ko(new Error(e.data.erreur)); }; worker.onerror = ev => { ev.preventDefault && ev.preventDefault(); worker = null; for (const [, a] of attente) a.ko(new Error('Worker indisponible')); attente.clear(); }; }
  catch (e) { worker = null; }
  const calculer = (bars, seuilAtr) => new Promise((ok, ko) => {
    const a = new Float64Array(bars.length * 5); bars.forEach((b, i) => { a[i * 5] = b.t; a[i * 5 + 1] = b.o; a[i * 5 + 2] = b.h; a[i * 5 + 3] = b.l; a[i * 5 + 4] = b.c; });
    const maintenant = Date.now();
    if (worker) { const id = ++nReq; attente.set(id, { ok, ko }); worker.postMessage({ id, bars: a, seuil: seuilAtr, maintenant }, [a.buffer]); return; }
    import('./mouvements-calcul.js').then(C => setTimeout(() => { try { ok(C.calculer(bars, { seuilAtr, maintenant })); } catch (e) { ko(e); } }, 0), ko);
  });
  const actif = () => moteur.S.periode === 'H1' && (!caseCouche || caseCouche.checked);
  function afficherBloc() {
    const h1 = moteur.S.periode === 'H1'; bloc.hidden = !h1;
    if (note) { note.hidden = !actif(); if (!note.hidden && !dernier) note.textContent = `Mouvements H1 : calcul en cours… ${AVERTISSEMENT}`; }
  }
  function rendreStats(r) {
    const s = r.stats; if (!s) return;
    const maxH = Math.max(1, ...s.parHeure), maxJ = Math.max(1, ...Object.values(s.parJour));
    const barre = (v, m) => `<i style="display:inline-block;height:7px;width:${Math.round(70 * v / m)}px;background:#8fd0e3;opacity:.7;vertical-align:middle"></i>`;
    corps.innerHTML = `<p>${s.n} mouvements (${s.hausse} haussiers, ${s.baisse} baissiers${s.enCours ? `, ${s.enCours} en cours` : ''}) sur ${nb(s.semaines, 0)} semaines · <b>${nb(s.parSemaine, 1)} par semaine</b>.</p>
      <p>Ampleur moyenne ${nb(s.ampleurMoyUSD, 1)} $ (${nb(s.ampleurMoyAtr, 1)} ATR) · médiane ${nb(s.ampleurMedUSD, 1)} $ (${nb(s.ampleurMedAtr, 1)} ATR) · durée moyenne ${nb(s.dureeMoy, 1)} bougies.</p>
      <p><b>Heure de départ (heure de Paris)</b></p><div class="tor-mouv-h">${s.parHeure.map((v, h) => `<span title="${h} h : ${v}">${String(h).padStart(2, '0')} ${barre(v, maxH)} ${v}</span>`).join('')}</div>
      <p><b>Jour de départ</b></p><div>${JOURS.map(j => `<span>${j.slice(0, 3)} ${barre(s.parJour[j], maxJ)} ${s.parJour[j]}</span>`).join(' · ')}</div>
      <p class="tor-mouv-avert">${esc(AVERTISSEMENT)}</p>`;
    if (note) { note.hidden = !actif(); note.textContent = `Mouvements H1 : ${s.n} repérés (${nb(s.parSemaine, 1)} par semaine, ampleur médiane ${nb(s.ampleurMedUSD, 0)} $). ${AVERTISSEMENT}`; }
  }
  function maj() {
    afficherBloc();
    if (!actif()) { graph.mouvements([], { h1: false }); cle = null; return; }
    const B = moteur.serie(); if (B.length < 40) return;
    const k = `${B.length}|${B[B.length - 1].t}|${B[0].t}|${seuil}`; if (k === cle) { if (dernier) graph.mouvements(dernier.moves, { h1: true }); return; }
    cle = k;
    calculer(B, seuil).then(r => { if (cle !== k) return; dernier = r; graph.mouvements(r.moves, { h1: true }); rendreStats(r); }, e => { if (cle === k) cle = null; if (note) { note.hidden = false; note.textContent = 'Mouvements H1 : calcul impossible (' + e.message + ')'; } });
  }
  curseur.addEventListener('input', () => { seuil = Math.round(+curseur.value * 10) / 10; valeur.textContent = `${nb(seuil, 1)} ATR`; clearTimeout(minuterie); minuterie = setTimeout(() => { ecrire(CLE_SEUIL, seuil); cle = null; maj(); }, 120); });
  if (caseCouche) caseCouche.addEventListener('change', () => { cle = null; maj(); });
  function exporter(format) {
    if (!dernier) return null; const meta = { couche: 'Mouvements H1', definition: 'mouvements-v1', seuilAtr: dernier.seuilAtr, genere: new Date().toISOString(), unite: 'H1', source: 'bougies de l’écran de l’or (heure de départ en UTC, jour et heure de Paris en plus)' };
    const texte = format === 'json' ? versJSON(dernier.moves, meta) : versCSV(dernier.moves), nom = `mouvements-h1-${meta.genere.slice(0, 10)}.${format === 'json' ? 'json' : 'csv'}`;
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([format === 'json' ? texte : '﻿' + texte], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' })); a.download = nom; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); } catch (e) { /* téléchargement refusé : le texte reste disponible par l'API */ }
    return { nom, texte };
  }
  for (const b of racine.querySelectorAll('[data-mouv-export]')) b.addEventListener('click', e => { e.preventDefault(); exporter(b.dataset.mouvExport); });
  return { maj, exporter, seuil: () => seuil, dernier: () => dernier, utilisationWorker: () => !!worker, regler(v) { curseur.value = String(v); curseur.dispatchEvent(new Event('input')); } };
}
