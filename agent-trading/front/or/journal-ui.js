/* ═════════════ JOURNAL DE TRADES (sur la page du tableau de bord ; PC et téléphone) ═════════════
   Saisie en 30 secondes (étiquette choisie AVANT le résultat), clôture, R net, enrichissement automatique sans futur, trade affiché sur le graphique,
   journal du jour, bilans, comparaison avec le hasard, règles candidates, imports CSV (XTB, Kraken) et historique XTB de départ.
   Données : sur l'appareil seulement (localStorage + IndexedDB), export / import JSON pour passer d'un appareil à l'autre. */
import { pluriel } from './texte-or.js';
import { ETIQUETTES, VERSIONS_FLECHE_H1, etiquetteComplete, ETIQUETTE_XTB, MIN_CATEGORIE, valider, rNet, plNet, ferme, enrichir, bilan, compareHasard, reglesCandidates, lectureJour, importerCsv, depuisXtbJson, fusionnerTrades, nouvelId, mfeR, dureeMin } from './journal-calcul.js';
import { lireJSON, ecrireJSON, enregistrerCapture, lireCapture, copier } from './stockage-or.js';
import { cleJour } from './niveaux-or.js';
import { heureParis } from './temps-or.js';
import { esc, nb } from './tableau-or.js';

const CLE = 'rayle_or_journal';
const local = () => /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
const dtLocal = t => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16); };
const depuisDtLocal = v => (v ? new Date(v).getTime() : null);
const fR = r => (r == null ? '—' : (r >= 0 ? '+' : '') + nb(r, 2) + ' R');

export function monterJournal(el, { tableau }) {
  let trades = lireJSON(CLE, []), sens = 'achat';
  const sauver = () => { setTimeout(() => tableau.modules.gardien && tableau.modules.gardien.majMarche(), 0); if (!ecrireJSON(CLE, trades)) tableau.notifier('Journal : enregistrement impossible sur cet appareil (stockage plein ou refusé). Exporte ta liste.', { niveau: 'fort' }); };
  el.innerHTML = `<h2>Journal de trades <small>sur cet appareil seulement · simulation, Rayle ne passe aucun ordre</small></h2>
  <form class="tor-grille" data-j-saisie>
    <label>Sens <span class="tor-actions" style="margin:0"><button type="button" data-sens="achat" aria-pressed="true">Achat</button><button type="button" data-sens="vente" aria-pressed="false">Vente</button></span></label>
    <label>Entrée <input type="number" step="0.01" name="entree" required></label>
    <label>Stop <input type="number" step="0.01" name="stop" required></label>
    <label>Objectif <input type="number" step="0.01" name="objectif"></label>
    <label>Taille (contrats = onces) <input type="number" step="0.001" name="taille" required></label>
    <label>Étiquette de setup (avant le résultat) <select name="etiquette" required><option value="">— choisir —</option>${ETIQUETTES.map(e => `<option>${e}</option>`).join('')}</select></label>
    <label>Version de la flèche H1 (si « flèche H1 ») <select name="versionFleche">${VERSIONS_FLECHE_H1.map(v => `<option value="${v}">${{ 'fleches-h1-v9': 'v9 (affichée par défaut en H1)', 'fleches-h1-v8': 'v8', 'fleches-h1-v7': 'v7', 'fleches-h1-v6': 'v6', 'fleches-h1-v5': 'v5', 'fleches-h1-v4': 'v4', 'fleches-h1-v3': 'v3', 'fleches-h1-v2': 'v2', 'fleches-v1': 'v1 (ancienne)' }[v]}</option>`).join('')}</select></label>
    <label style="grid-column:span 2">Raison en une ligne <input type="text" name="raison" maxlength="140"></label>
    <label>Heure d’entrée <input type="datetime-local" name="tEntree"></label>
    <label>Capture (facultative) <input type="file" name="capture" accept="image/*"></label>
    <div class="tor-actions" style="grid-column:1/-1"><button type="submit">Enregistrer l’entrée</button><button type="button" data-a="j-depuis-position">Reprendre l’outil Position</button><span class="tor-doux" data-j-msg></span></div>
  </form>
  <h3>Trades ouverts</h3><div class="tor-tableau" data-j-ouverts></div>
  <h3>Journal du jour <input type="date" data-j-jour></h3><div class="tor-tableau" data-j-jour-liste></div><div data-j-jour-lecture></div>
  <h3>Bilan <select data-j-periode><option value="semaine">7 derniers jours</option><option value="mois">30 derniers jours</option><option value="tout" selected>tout</option></select>
    <select data-j-cle><option value="etiquette">par étiquette</option><option value="seance">par séance</option><option value="heure">par heure</option><option value="duree">par durée de tenue</option><option value="taille">par taille</option></select>
    <label class="tor-doux"><input type="checkbox" data-j-xtb checked> inclure l’historique XTB</label></h3>
  <div class="tor-tableau" data-j-bilan></div><p class="tor-doux">Historique XTB : compte en euros, R calculé sur les prix avec le stop FINAL enregistré par XTB (il a pu être déplacé : R à lire avec prudence) ; trades sans stop = R inconnu.</p><p class="tor-doux" data-j-hasard></p>
  <h3>Règles candidates</h3><div class="tor-tableau" data-j-regles></div>
  <h3>Importer / exporter</h3>
  <div class="tor-actions"><label class="tor-doux">CSV XTB ou Kraken (or seulement) <input type="file" accept=".csv,text/csv" data-j-csv></label>
    <label class="tor-doux">Historique XTB (trades-xtb.json) <input type="file" accept=".json" data-j-xtbjson></label>
    <button type="button" data-a="j-exporter">Exporter le journal (presse-papiers)</button><button type="button" data-a="j-importer">Importer un journal</button></div>
  <textarea data-j-zone rows="3" style="width:100%;margin-top:6px" hidden placeholder="Colle ici un journal exporté depuis un autre appareil, puis Importer"></textarea>`;
  const q = s => el.querySelector(s), f = q('[data-j-saisie]');
  q('[data-j-jour]').value = cleJour(Date.now());

  function S() { return tableau.moteur.S; }
  function prefill(force) {
    const s = S(), pos = tableau.graph.position();
    if (s.prix && (force || !f.entree.value)) f.entree.value = (pos && pos.entree) || s.prix.toFixed(2);
    if (pos && (force || !f.stop.value)) { if (pos.stop) f.stop.value = pos.stop; if (pos.objectif) f.objectif.value = pos.objectif; if (pos.stop && pos.entree) sens = pos.stop < pos.entree ? 'achat' : 'vente'; majSens(); }
    const g = tableau.modules && tableau.modules.gardien; if (g && g.tailleCalculee && (force || !f.taille.value)) { const c = g.tailleCalculee(); if (c) f.taille.value = c; }
    if (!f.tEntree.value || force) f.tEntree.value = dtLocal(Date.now());
  }
  const majSens = () => el.querySelectorAll('[data-sens]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sens === sens)));

  f.addEventListener('submit', async e => {
    e.preventDefault();
    const t = { id: nouvelId(), source: 'saisie', sens, entree: +f.entree.value, stop: +f.stop.value, objectif: f.objectif.value ? +f.objectif.value : null, taille: +f.taille.value, etiquette: f.etiquette.value, ...(f.etiquette.value === 'flèche H1' ? { versionFleche: f.versionFleche.value } : {}), raison: f.raison.value.trim(), tEntree: depuisDtLocal(f.tEntree.value) || Date.now() };
    const err = valider(t); if (err.length) { q('[data-j-msg]').textContent = 'À corriger : ' + err.join(', '); return; }
    const s = S(); t.enrich = enrichir(t, s.refM15, s.refH1, s.atrH1, s.ecart || 0);
    if (f.capture.files[0]) try { t.captureEntree = await enregistrerCapture(t.id + '-entree', f.capture.files[0]); } catch (er) { tableau.notifier('Capture non enregistrée : ' + er.message, { niveau: 'doux' }); }
    trades.push(t); sauver(); f.reset(); q('[data-j-msg]').textContent = 'Entrée enregistrée.'; prefill(true); rendre();
  });
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-sens],[data-a],[data-cloturer],[data-voir],[data-suppr]'); if (!b) return;
    if (b.dataset.sens) { sens = b.dataset.sens; majSens(); return; }
    if (b.dataset.a === 'j-depuis-position') { prefill(true); return; }
    if (b.dataset.voir) { const t = trades.find(x => x.id === b.dataset.voir); if (t) { tableau.graph.allerA(t.tEntree); tableau.R.querySelector('.tor-graph').scrollIntoView({ behavior: 'smooth' }); } return; }
    if (b.dataset.suppr) { if (confirm('Supprimer ce trade du journal ?')) { trades = trades.filter(x => x.id !== b.dataset.suppr); sauver(); rendre(); } return; }
    if (b.dataset.cloturer) {
      const ligne = b.closest('tr'), t = trades.find(x => x.id === b.dataset.cloturer), v = k => ligne.querySelector(`[name="${k}"]`);
      const sortie = +v('sortie').value; if (!(sortie > 0)) { v('sortie').focus(); return; }
      t.sortie = sortie; t.tSortie = depuisDtLocal(v('tSortie').value) || Date.now(); t.frais = +v('frais').value || 0;
      const cap = v('capture').files[0]; if (cap) try { t.captureSortie = await enregistrerCapture(t.id + '-sortie', cap); } catch (er) { /* message plus haut */ }
      t.mfeR = mfeR(t, S().k); sauver(); tableau.notifier(`Trade clôturé : ${fR(rNet(t))} net.`, { niveau: 'info', dit: false, raison: 'journal' }); rendre(); return;
    }
    if (b.dataset.a === 'j-exporter') { const ok = await copier(JSON.stringify({ format: 'rayle-or-journal-1', trades })); tableau.notifier(ok ? `Journal copié (${pluriel(trades.length, 'trade')}) : colle-le sur l’autre appareil.` : 'Copie refusée par le navigateur.', { niveau: 'doux', dit: false, raison: 'journal' }); return; }
    if (b.dataset.a === 'j-importer') { const z = q('[data-j-zone]'); if (z.hidden) { z.hidden = false; z.focus(); return; } try { const d = JSON.parse(z.value); const r = fusionnerTrades(trades, d.trades || []); trades = r.trades; sauver(); z.value = ''; z.hidden = true; tableau.notifier(`${pluriel(r.ajoutes, 'trade importé', 'trades importés')}.`, { niveau: 'doux', dit: false, raison: 'journal' }); rendre(); } catch (er) { tableau.notifier('Journal collé illisible.', { niveau: 'doux' }); } }
  });
  q('[data-j-csv]').addEventListener('change', async e => { const fi = e.target.files[0]; if (!fi) return; const r = importerCsv(await fi.text()); const m = fusionnerTrades(trades, r.trades); trades = m.trades; sauver(); tableau.notifier(`Import ${r.format} : ${pluriel(m.ajoutes, 'trade ajouté', 'trades ajoutés')}, ${pluriel(r.ignores, 'ligne ignorée', 'lignes ignorées')} (hors or ou illisibles).`, { niveau: 'doux', dit: false, raison: 'journal' }); rendre(); });
  q('[data-j-xtbjson]').addEventListener('change', async e => { const fi = e.target.files[0]; if (!fi) return; try { importerXtb(JSON.parse(await fi.text())); } catch (er) { tableau.notifier('Fichier XTB illisible.', { niveau: 'doux' }); } });
  function importerXtb(d) { const m = fusionnerTrades(trades, depuisXtbJson(d)); trades = m.trades; sauver(); tableau.notifier(`Historique XTB : ${pluriel(m.ajoutes, 'trade d’or ajouté', 'trades d’or ajoutés')} (« ${ETIQUETTE_XTB} »).`, { niveau: 'doux', dit: false, raison: 'journal' }); rendre(); }
  for (const s of ['[data-j-jour]', '[data-j-periode]', '[data-j-cle]', '[data-j-xtb]']) q(s).addEventListener('change', rendre);

  function rendre() {
    const ouverts = trades.filter(t => t.source === 'saisie' && !ferme(t));
    q('[data-j-ouverts]').innerHTML = ouverts.length ? `<table><tr><th>Entrée</th><th>Sens</th><th class="num">Prix</th><th class="num">Stop</th><th class="num">Objectif</th><th class="num">Taille</th><th>Setup</th><th>Sortie</th><th>Heure</th><th>Frais $</th><th>Capture</th><th></th></tr>${ouverts.map(t => `<tr><td>${heureParis(t.tEntree)}</td><td>${t.sens}</td><td class="num">${nb(t.entree)}</td><td class="num">${nb(t.stop)}</td><td class="num">${nb(t.objectif)}</td><td class="num">${nb(t.taille, 3)}</td><td>${esc(etiquetteComplete(t))}</td><td><input type="number" step="0.01" name="sortie" value="${S().prix ? S().prix.toFixed(2) : ''}"></td><td><input type="datetime-local" name="tSortie" value="${dtLocal(Date.now())}"></td><td><input type="number" step="0.01" name="frais" value="0"></td><td><input type="file" name="capture" accept="image/*"></td><td><button type="button" data-cloturer="${t.id}">Clôturer</button> <button type="button" data-voir="${t.id}">Voir</button></td></tr>`).join('')}</table>` : '<p class="tor-doux">Aucun trade ouvert.</p>';
    const jour = q('[data-j-jour]').value || cleJour(Date.now()), J = lectureJour(trades, jour, S().refM15 ? S().k : []);
    q('[data-j-jour-liste]').innerHTML = J.trades.length ? `<table><tr><th>Heure</th><th>Sens</th><th>Setup</th><th class="num">Entrée</th><th class="num">Sortie</th><th class="num">R net</th><th>Contexte (calculé sans futur)</th><th></th></tr>${J.trades.map(t => { const e = t.enrich || {}; return `<tr><td>${heureParis(t.tEntree)}</td><td>${t.sens}</td><td>${esc(etiquetteComplete(t))}</td><td class="num">${nb(t.entree)}</td><td class="num">${ferme(t) ? nb(t.sortie) : 'ouvert'}</td><td class="num ${(rNet(t) ?? 0) >= 0 ? 'pos' : 'neg'}">${fR(rNet(t))}</td><td class="tor-doux">${esc([e.seance, e.tendanceH1 && 'H1 ' + e.tendanceH1, e.distMA200 != null && 'MA200 ' + nb(e.distMA200, 1) + ' ATR', e.distZoneVolume != null && 'zone vol. ' + nb(e.distZoneVolume, 1) + ' ATR', e.distNiveauCle != null && 'niveau ' + nb(e.distNiveauCle, 1) + ' ATR', e.balayage && e.balayage !== 'aucun' && 'balayage ' + e.balayage, e.volatilite && 'volatilité ' + e.volatilite].filter(Boolean).join(' · '))}</td><td><button type="button" data-voir="${t.id}">Voir</button> <button type="button" data-suppr="${t.id}" aria-label="Supprimer">✕</button></td></tr>`; }).join('')}</table>` : '';
    q('[data-j-jour-lecture]').innerHTML = J.phrases.map(p => `<p>${esc(p)}</p>`).join('');
    const per = q('[data-j-periode]').value, cle = q('[data-j-cle]').value, xtb = q('[data-j-xtb]').checked, now = Date.now();
    const pool = trades.filter(t => xtb || t.source !== 'xtb'), periode = per === 'tout' ? null : [now - (per === 'semaine' ? 7 : 30) * 86400e3, now + 1];
    const B = bilan(pool, cle, { periode });
    q('[data-j-bilan]').innerHTML = B.length ? `<table><tr><th>${{ etiquette: 'Étiquette', seance: 'Séance', heure: 'Heure (Paris)', duree: 'Durée de tenue', taille: 'Taille (onces)' }[cle]}</th><th class="num">Trades</th><th class="num">Réussite</th><th class="num">R moyen net</th><th class="num">Intervalle 95 %</th><th class="num">P&L $</th></tr>${B.map(l => `<tr><td>${esc(l.cle)}</td><td class="num">${l.n}</td>${l.assez ? `<td class="num">${Math.round(l.reussite * 100)} % <small>(${Math.round(l.icReussite[0] * 100)}–${Math.round(l.icReussite[1] * 100)})</small></td><td class="num ${(l.rMoyen ?? 0) >= 0 ? 'pos' : 'neg'}">${l.rMoyen == null ? '—' : fR(l.rMoyen)}</td><td class="num">${l.icR[0] == null ? '—' : nb(l.icR[0]) + ' … ' + nb(l.icR[1])}</td>` : `<td colspan="3" class="tor-doux">pas assez de données (${l.n} < ${MIN_CATEGORIE})</td>`}<td class="num">${l.pl ? nb(l.pl) : '—'}${l.plEUR ? ` <small>(${nb(l.plEUR)} € XTB)</small>` : ''}</td></tr>`).join('')}</table>` : '<p class="tor-doux">Aucun trade clôturé.</p>';
    const H = compareHasard(pool.filter(t => t.source !== 'xtb'), S().refM15 || []);
    q('[data-j-hasard]').textContent = 'Comparaison avec des entrées au hasard aux mêmes heures : ' + H.texte + '.';
    const RC = reglesCandidates(trades);
    q('[data-j-regles]').innerHTML = RC.length ? `<table><tr><th>Étiquette</th><th>Statut</th><th>Raison</th></tr>${RC.map(r => `<tr><td>${esc(r.etiquette)}</td><td>${r.statut}</td><td class="tor-doux" style="white-space:normal">${esc(r.raison)}</td></tr>`).join('')}</table><p class="tor-doux">« À garder » seulement si l’étiquette est positive sur au moins 30 trades (correction de Holm) ET confirmée sur les trades du mois suivant, jamais vus lors du choix. L’historique XTB n’a pas d’étiquette : il n’entre pas ici.</p>` : '<p class="tor-doux">Aucune étiquette avec des trades clôturés.</p>';
    tableau.graph.marques(trades.filter(t => t.tEntree && t.source !== 'xtb').map(t => { const r = rNet(t); return { t: t.tEntree, sens: t.sens, r, texte: r == null ? '' : (r >= 0 ? '+' : '') + r.toFixed(1).replace('.', ',') + 'R' }; }));
  }
  // historique XTB de départ : lu automatiquement SEULEMENT en local (serveur du PC, fichier ignoré par git), une seule fois
  if (local() && !lireJSON('rayle_or_xtb_importe', false)) fetch(new URL('../../donnees-privees/trades-xtb.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).then(d => { if (d) { importerXtb(d); ecrireJSON('rayle_or_xtb_importe', true); } }).catch(() => { /* absent : rien */ });
  let attente = null;
  const api = { majMarche() { if (!f.entree.value) prefill(false); if (attente) return; attente = setTimeout(() => { attente = null; if (!el.contains(document.activeElement)) rendre(); }, 60e3); }, trades: () => trades, rendre, detruire() { clearTimeout(attente); } };
  prefill(true); rendre(); return api;
}
