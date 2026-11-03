/* ═════════════ PANNEAUX : positions en cours, historique (CSV), portefeuille, journal du bot ═════════════
   Rendu SEULEMENT : chaque chiffre vient tel quel de l'état publié (compte, trades, perf). Aucune addition, aucun P&L recalculé ici. */
import { fmtPrix, fmtQte, fmtUSD, fmtR, fmtPct, fmtNombre, heureParis, dateHeureParis, fmtDuree, copiePrix, copieQte } from '../commun/format.js';
import { DEFINITIONS } from '../commun/definitions.js';
import { PAR_ID } from '../commun/actifs.js';

export const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sgn = x => (x > 0 ? 'at-gain' : x < 0 ? 'at-perte' : '');
const sens = s => `<span class="at-sens at-${s}">${s === 'achat' ? '▲ ACHAT' : '▼ VENTE'}</span>`;
export const info = cle => `<button type="button" class="at-i" data-def="${cle}" aria-label="Définition">ⓘ</button>`;

export function brancherDefinitions(racine) {
  racine.addEventListener('click', e => {
    const b = e.target.closest('.at-i'); if (!b) return;
    e.stopPropagation();
    const ancien = racine.querySelector('.at-bulle'); if (ancien) { ancien.remove(); if (ancien.dataset.def === b.dataset.def) return; }
    const d = document.createElement('div'); d.className = 'at-bulle'; d.dataset.def = b.dataset.def; d.textContent = DEFINITIONS[b.dataset.def] || '';
    const r = b.getBoundingClientRect(), rr = racine.getBoundingClientRect();
    d.style.left = Math.max(8, Math.min(rr.width - 268, r.left - rr.left - 120)) + 'px'; d.style.top = (r.bottom - rr.top + 6) + 'px';
    racine.appendChild(d);
  });
  racine.addEventListener('pointerdown', e => { if (!e.target.closest('.at-i,.at-bulle')) { const a = racine.querySelector('.at-bulle'); if (a) a.remove(); } });
}

/* ─── positions en cours ─── */
export function htmlPositions(etat, selection) {
  const c = etat.compte, enCours = etat.trades.enCours;
  if (!enCours.length) return '<p class="at-vide">Aucune position en cours.</p>';
  const parId = Object.fromEntries(c.positions.map(p => [p.id, p]));
  const lignes = enCours.map(tr => {
    const p = parId[tr.id];
    if (tr.statut === 'propose') return `<tr data-id="${esc(tr.id)}" class="${selection === tr.id ? 'at-sel' : ''} at-attente"><td>${esc(tr.actif)}</td><td>${sens(tr.sens)}</td><td>${fmtQte(tr.actif, tr.quantite)}</td><td>${fmtPrix(tr.actif, tr.entree)}</td><td colspan="3" class="at-doux">en attente de l’entrée · jusqu’à ${heureParis(tr.validJusqu)}</td><td>${fmtPrix(tr.actif, tr.stop)}</td><td>${fmtPrix(tr.actif, tr.objectif)}</td><td>—</td></tr>`;
    return `<tr data-id="${esc(tr.id)}" class="${selection === tr.id ? 'at-sel' : ''}"><td>${esc(tr.actif)}</td><td>${sens(tr.sens)}</td><td>${fmtQte(tr.actif, p.quantite)}</td><td>${fmtPrix(tr.actif, p.entree)}</td><td>${fmtPrix(tr.actif, p.prix)}</td><td class="${sgn(p.pnl)}">${fmtUSD(p.pnl, 2, true)}</td><td class="${sgn(p.r)}">${fmtR(p.r)}</td><td>${fmtPrix(tr.actif, p.stop)}</td><td>${fmtPrix(tr.actif, p.objectif)}</td><td>${fmtDuree(p.dureeMs)}</td></tr>`;
  }).join('');
  const t = c.totalOuvert, niv = t.levier >= 4 ? 'at-danger' : t.levier >= 2 ? 'at-alerte' : '', nivR = t.risquePct >= 3 ? 'at-danger' : t.risquePct >= 1.5 ? 'at-alerte' : '';
  return `<div class="at-tab-defil"><table class="at-table"><thead><tr><th>Actif</th><th>Sens</th><th>Taille</th><th>Entrée</th><th>Prix</th><th>P&amp;L $</th><th>P&amp;L R</th><th>SL</th><th>TP</th><th>Durée</th></tr></thead><tbody>${lignes}</tbody>
    <tfoot><tr><td colspan="5">Total</td><td class="${sgn(t.pnl)}">${fmtUSD(t.pnl, 2, true)}</td><td colspan="4"></td></tr></tfoot></table></div>
    <div class="at-risque"><span class="${nivR}">Risque ouvert ${fmtUSD(t.risqueUSD, 0)} (${fmtPct(t.risquePct, 2, false)}) ${info('risqueOuvert')}</span><span class="${niv}">Levier total ×${fmtNombre(t.levier, 2)} ${info('levier')}</span></div>`;
}

/* ─── historique des positions (heures RÉELLES) + CSV ─── */
export function htmlHistorique(lent) {
  const l = (lent && lent.passes || []).slice().reverse();
  if (!l.length) return '<p class="at-vide">Aucune position terminée pour l’instant.</p>';
  return `<div class="at-tab-defil"><table class="at-table at-hist"><thead><tr><th>Actif</th><th>Sens</th><th>Signal</th><th>Entrée réelle</th><th>Prix entrée</th><th>Sortie réelle</th><th>Prix sortie</th><th>Raison</th><th>Frais + gliss.</th><th>R</th><th>P&amp;L $</th></tr></thead><tbody>${
    l.map(t => `<tr data-id="${esc(t.id)}"><td>${esc(t.actif)}</td><td>${sens(t.sens)}</td><td>${dateHeureParis(t.tSignal)}</td><td>${t.tEntree ? dateHeureParis(t.tEntree) : '—'}</td><td>${t.prixEntree != null ? fmtPrix(t.actif, t.prixEntree) : '—'}</td><td>${t.tSortie ? dateHeureParis(t.tSortie) : '—'}</td><td>${t.prixSortie != null ? fmtPrix(t.actif, t.prixSortie) : '—'}</td><td>${esc(t.raison || t.statut)}</td><td>${t.fraisGlissement != null ? fmtUSD(t.fraisGlissement, 2) : '—'}</td><td class="${sgn(t.r)}">${t.r != null ? fmtR(t.r) : '—'}</td><td class="${sgn(t.pnl)}">${t.pnl != null ? fmtUSD(t.pnl, 2, true) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
export function csvHistorique(lent) {
  const tete = ['id', 'actif', 'sens', 'type', 'heure_signal', 'heure_entree_reelle', 'entree_prevue', 'prix_entree', 'stop', 'objectif', 'quantite', 'risque_usd', 'frais_entree', 'frais_sortie', 'glissement', 'statut', 'heure_sortie_reelle', 'prix_sortie', 'raison', 'R', 'pnl_usd'];
  const iso = t => (t ? new Date(t).toISOString() : '');
  const lignes = (lent && lent.passes || []).map(t => [t.id, t.actif, t.sens, t.type, iso(t.tSignal), iso(t.tEntree), copiePrix(t.actif, t.entree), t.prixEntree != null ? copiePrix(t.actif, t.prixEntree) : '', copiePrix(t.actif, t.stop), copiePrix(t.actif, t.objectif), copieQte(t.actif, t.quantite), t.risqueUSD, t.fraisEntree, t.fraisSortie, t.glissement, t.statut, iso(t.tSortie), t.prixSortie != null ? copiePrix(t.actif, t.prixSortie) : '', t.raison || '', t.r ?? '', t.pnl ?? '']);
  return [tete].concat(lignes).map(l => l.map(v => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
}

/* ─── carte « Performance du portefeuille » ─── */
export function htmlPortefeuille(etat, lent) {
  const c = etat.compte, perf = lent && lent.perf, g = perf && perf.global, statut = etat.statut || (g && g.statut) || 'PAS ENCORE PROUVÉ';
  const cls = statut === 'RENTABLE' ? 'at-gain' : statut === 'NON RENTABLE' ? 'at-perte' : 'at-alerte';
  const parType = perf ? Object.entries(perf.parType).map(([k, s]) => `<li><b>${esc(k)}</b> ${s.n} trades · R moyen ${s.moyenne != null ? fmtR(s.moyenne) : '—'} · <span class="${s.statut === 'RENTABLE' ? 'at-gain' : s.statut === 'NON RENTABLE' ? 'at-perte' : 'at-doux'}">${s.statut}</span></li>`).join('') : '';
  const bt = lent && lent.backtest;
  return `<div class="at-pf">
    <div class="at-pf-capital"><small>Capital ${info('capital')}</small><output class="at-capital" data-cents="${Math.round(c.capital * 100)}">${fmtUSD(c.capital)}</output></div>
    <canvas class="at-courbe" aria-label="Courbe d’équité"></canvas>
    <div class="at-pf-grille">
      <div><small>Réalisé ${info('realise')}</small><b class="${sgn(c.realise)}">${fmtUSD(c.realise, 2, true)}</b></div>
      <div><small>Flottant ${info('flottant')}</small><b class="${sgn(c.flottant)}">${fmtUSD(c.flottant, 2, true)}</b></div>
      <div><small>Cette semaine ${info('semaine')}</small><b class="${sgn(c.semaine.pnl)}">${fmtUSD(c.semaine.pnl, 2, true)} · ${fmtPct(c.semaine.pct)}</b>${c.semaine.depuisDemarrage ? '<em>depuis le démarrage</em>' : ''}</div>
      <div><small>Objectif semaine ${info('objectif')}</small><b>${fmtPct(c.semaine.objectifPct, 1)}</b></div>
      <div><small>Baisse max ${info('baisseMax')}</small><b class="${c.baisse.maxUSD > 0 ? 'at-perte' : ''}">${fmtUSD(-c.baisse.maxUSD, 2)} · ${fmtPct(-c.baisse.maxPct)}</b></div>
      <div><small>Limite simulée (${c.baisse.mode}) ${info('limite')}</small><b class="${c.baisse.depassee ? 'at-perte' : ''}">${fmtPct(c.baisse.actuellePct, 2, false)} / ${fmtPct(c.baisse.limitePct, 0, false)}</b></div>
      <div><small>Risque par trade ${info('risque')}</small><b>${fmtUSD(c.risqueParTradeUSD, 2)} (${fmtNombre(c.risquePct, 1)} %)</b></div>
    </div>
    <div class="at-pf-statut"><span class="at-statut ${cls}">${statut}</span> ${info('statut')}
      ${g ? `<span>${g.n} trades · R moyen ${g.moyenne != null ? fmtR(g.moyenne) : '—'} · IC 95 % [${g.icBas != null ? fmtNombre(g.icBas, 2) : '—'} ; ${g.icHaut != null ? fmtNombre(g.icHaut, 2) : '—'}] ${info('rMoyen')} · baisse max ${fmtNombre(g.baisseMaxR || 0, 2)} R</span>` : ''}</div>
    ${!perf || perf.echantillonTropPetit ? `<p class="at-avert">Échantillon trop petit pour conclure (${perf ? perf.nClos : 0} trades sur 100) ${info('echantillon')}</p>` : ''}
    ${parType ? `<ul class="at-partype">${parType}</ul>` : ''}
    ${bt ? `<details class="at-bt"><summary>Backtest : ${esc(bt.verdict)}</summary><p>${bt.n} trades simulés sur ${fmtNombre(bt.joursEnregistres, 1)} jours enregistrés. Hors apprentissage : ${bt.horsApprentissage.n} trades, R moyen ${bt.horsApprentissage.moyenne != null ? fmtR(bt.horsApprentissage.moyenne) : '—'}, IC 95 % [${bt.horsApprentissage.icBas != null ? fmtNombre(bt.horsApprentissage.icBas, 2) : '—'} ; ${bt.horsApprentissage.icHaut != null ? fmtNombre(bt.horsApprentissage.icHaut, 2) : '—'}].</p><ul>${bt.limites.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
  </div>`;
}

/* capital animé jusqu'au centime + flash vert / rouge */
export function animerCapital(out, cible, racine) {
  const avant = Number(out.dataset.affiche || out.dataset.cents || cible); out.dataset.cents = cible;
  if (avant === cible) { out.textContent = fmtUSD(cible / 100); out.dataset.affiche = cible; return; }
  out.classList.remove('at-flash-gain', 'at-flash-perte'); void out.offsetWidth; out.classList.add(cible > avant ? 'at-flash-gain' : 'at-flash-perte');
  const d = parseFloat(getComputedStyle(racine).getPropertyValue('--at-d-compteur')) || 0, t0 = performance.now();
  if (out._anim) cancelAnimationFrame(out._anim);
  const pas = t => { const k = d ? Math.min(1, (t - t0) / d) : 1, e = 1 - Math.pow(1 - k, 3), v = Math.round(avant + (cible - avant) * e); out.textContent = fmtUSD(v / 100); out.dataset.affiche = v; if (k < 1) out._anim = requestAnimationFrame(pas); else out.textContent = fmtUSD(cible / 100); };
  out._anim = requestAnimationFrame(pas);
}

export function dessinerCourbe(canvas, points, racine) {
  if (!canvas || !points || points.length < 2) return;
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 300, H = canvas.clientHeight || 90;
  canvas.width = W * dpr; canvas.height = H * dpr; const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const vs = points.map(p => p[1]), mn = Math.min(...vs), mx = Math.max(...vs), t0 = points[0][0], t1 = points[points.length - 1][0];
  const X = t => (t - t0) / Math.max(1, t1 - t0) * (W - 4) + 2, Y = v => H - 4 - (v - mn) / Math.max(1e-9, mx - mn) * (H - 8);
  const col = getComputedStyle(racine).getPropertyValue(vs[vs.length - 1] >= vs[0] ? '--at-gain' : '--at-perte').trim();
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); points.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke();
  ctx.lineTo(X(t1), H); ctx.lineTo(X(t0), H); ctx.closePath(); ctx.globalAlpha = .12; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
}

/* ─── journal du bot ─── */
export function htmlJournal(lent, actif) {
  const l = (lent && lent.journal || []).filter(e => !actif || !e.actif || e.actif === actif).slice(-80).reverse();
  if (!l.length) return '<p class="at-vide">Le journal est vide pour l’instant.</p>';
  const ic = { recit: '💬', ignore: '⊘', proposition: '★', entree: '→', sortie: '■', expiree: '⌛', niveau: '◇', carnet: '▤', adaptation: '⚙' };
  return '<ol class="at-journal">' + l.map(e => `<li class="at-j-${esc(e.type)}"><time>${heureParis(e.t)}</time> <span>${ic[e.type] || '·'}</span> ${e.actif ? `<b>${esc(e.actif)}</b> ` : ''}${esc(e.texte)}${e.source === 'ia' ? ' <em>(IA)</em>' : ''}</li>`).join('') + '</ol>';
}
export const _P = PAR_ID;
