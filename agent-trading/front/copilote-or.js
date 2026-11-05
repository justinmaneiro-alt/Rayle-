/* ═════════════ COPILOTE DE L'OR : affichage (bandeau exécution/référence, annonces, plans A/B, checklist de l'or, bilan) ═════════════
   N'affiche QUE ce que publie le moteur (actifs.OR.or dans l'état, or dans la partie lente) : aucun calcul de marché ici.
   Prix dessinés = prix KRAKEN (référence + écart en direct). Sans référence fiable : « données insuffisantes », aucun niveau. */
import { fmtNombre, heureParis } from '../commun/format.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const p2 = x => (x == null ? '—' : fmtNombre(x, 2));
const sensTxt = s => (s === 'achat' ? 'ACHAT' : 'VENTE');
const SENS = { haussiere: 'haussière', baissiere: 'baissière', range: 'range', inconnue: '—' };
export const MENTION = 'SIMULATION, setup NON VALIDÉ';

/* forme attendue par le dessin du copilote visuel (niveaux + plans) ; 8 niveaux au plus */
export function adapterVisuelOr(o) {
  if (!o || o.insuffisant) return { niveaux: [], plans: [], retiresBarres: [], confluence: null };
  const focus = (o.plans || []).slice().sort((a, b) => b.checklist.n - a.checklist.n)[0];
  return { niveaux: (o.niveaux || []).slice(0, 8).map(n => ({ id: n.ids && n.ids[0] || 'or', p: n.p, court: n.court })),
    plans: (o.plans || []).map(p => ({ id: p.id, nom: p.nom, sens: p.sens, zoneBas: p.zoneBas, zoneHaut: p.zoneHaut, stop: p.stop, cibles: p.cibles, cible: p.cible, tropTard: p.tropTard, tCree: p.tCree })),
    retiresBarres: [], confluence: focus ? { plan: focus.id } : null };
}

function compteRebours(an, t) {
  if (!an) return '<span class="cv-doux">calendrier indisponible</span>';
  if (an.bloque) return `<b class="cv-or-annonce">${esc(an.message)}</b>`;
  if (!an.prochaine) return `<span class="cv-doux">aucune annonce majeure à venir (${esc(an.source)})</span>`;
  const m = Math.max(0, Math.round((an.prochaine.t - t) / 60e3)), h = Math.floor(m / 60);
  return `Annonce à ${esc(an.prochaine.heure)} : ${esc(an.prochaine.titre)} · dans ${h ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`}${an.complet ? '' : ' <span class="at-badge">calendrier incomplet</span>'}`;
}

export function htmlOr(o, g, t = Date.now()) {
  if (!o) return '';
  const ex = o.execution || {}, k = ex.kraken, liq = ex.liquidite || {};
  const tete = `<div class="cv-or-tete"><b>OR · copilote</b> <span class="at-badge cv-or-sim">${MENTION}</span>
    <span>Exécution Kraken ${k ? `${p2(k.bid)} / ${p2(k.ask)}` : '<span class="cv-perte">indisponible</span>'}</span>
    <span>Référence ${ex.reference ? p2(ex.reference.prix) : '—'} <small>(${esc(o.source)})</small></span>
    <span>Écart Kraken − réf. <b>${ex.basis == null ? '—' : (ex.basis > 0 ? '+' : '') + p2(ex.basis) + ' $'}</b></span>
    <span class="${liq.ok ? '' : 'cv-perte'}">Fourchette ${liq.fourchetteBps == null ? '—' : p2(liq.fourchetteBps) + ' pb'}${liq.ok ? '' : ' · ANORMALE : aucune alerte'}</span></div>
    <div class="cv-or-annonces" data-cv-or-rebours>${compteRebours(o.annonces, t)}</div>
    ${(o.alertes || []).slice(-3).map(al => `<div class="cv-or-alerte cv-${al.sens}"><b>${esc(al.mention)}</b> · ${heureParis(al.t)} · plan ${esc(al.nom)} ${sensTxt(al.sens)} ${al.n}/6 · Kraken ~ ${p2(al.entreeKraken)}, invalidation ${p2(al.stopKraken)}, cible ${p2(al.cibleKraken)}${al.telegram ? ' · envoyée sur Telegram' : ' · dans l’app seulement'}</div>`).join('')}`;
  if (o.insuffisant) return `${tete}<p class="cv-or-insuffisant"><b>Données insuffisantes</b> : ${esc(o.insuffisant)}. Aucun niveau ni plan affiché plutôt que des niveaux douteux.</p>`;
  const plans = (o.plans || []).map(p => {
    const ck = p.checklist, crit = ck.criteres.map(c => `<li class="${c.ok === true ? 'cv-ok' : c.ok === false ? 'cv-non' : 'cv-inconnu'}">${c.ok === true ? '✔' : c.ok === false ? '✖' : '?'} ${esc(c.nom)} <small>${esc(c.detail)}</small></li>`).join('');
    return `<div class="cv-or-plan cv-${p.sens}${ck.tropTard ? ' cv-barre' : ''}"><b>Plan ${esc(p.nom)} · ${sensTxt(p.sens)}</b> <span class="at-badge">${esc(p.statut)}</span> ${ck.tropTard ? '<b class="cv-perte">TROP TARD</b>' : ''}
      <p>Zone ${p2(p.zoneBas)} – ${p2(p.zoneHaut)} (${esc(p.nomNiveau)}) · invalidation ${p2(p.stop)} · cibles ${p.cibles.map(p2).join(' / ')} · TROP TARD ${p2(p.tropTard)} · R restant ${ck.rRestant == null ? '—' : fmtNombre(ck.rRestant, 1)} · coût ≈ ${fmtNombre(p.coutR, 2)} R</p>
      <details><summary>Checklist de l’or : ${ck.n}/6</summary><ul class="cv-crit">${crit}</ul></details></div>`;
  }).join('');
  const sess = (o.sessions || []).map(s => `${esc(s.nom)} ${heureParis(s.t0)}–${heureParis(s.t1)}`).join(' · ');
  const asie = o.asie ? `Plage asiatique (00:00–08:00 Paris) : ${p2(o.asie.l)} – ${p2(o.asie.h)}${o.asie.complete ? '' : ' <span class="at-badge">incomplète</span>'}` : 'Plage asiatique : pas encore';
  const figs = (o.figures || []).map(f => `<li>${heureParis(f.t)} · ${esc(f.nom)} · ${sensTxt(f.sens)} vers ${p2(f.entree)} <span class="at-badge">${esc(f.statut)}</span></li>`).join('');
  return `${tete}<p class="cv-or-ligne">H1 ${esc(SENS[o.tendance.sens] || o.tendance.sens)} · ATR M15 ${p2(o.atr)} $ · ATR H1 ${p2(o.atrH1)} $ · ${asie}${sess ? ` · ${sess}` : ''}</p>
    <div class="cv-or-plans">${plans || '<p class="cv-doux">Aucun plan : pas de niveau de part et d’autre du prix.</p>'}</div>
    ${figs ? `<h4>Figures du jour</h4><ul class="cv-or-figs">${figs}</ul>` : ''}${htmlBilanOr(g)}`;
}

export function htmlBilanOr(g) {
  if (!g) return '';
  const st = Object.assign({}, g.figures, g.plans), lignes = Object.entries(st).map(([k, s]) => {
    const b = g.bilan && g.bilan[k], h = b && b.h24;
    return `<tr><td>${esc(s.nom || k)}</td><td>${esc(s.statut)}</td><td>${b ? b.n : 0}</td><td>${h && h.Rmoy != null ? fmtNombre(h.Rmoy, 2) : '—'}</td><td>${h && h.RmoyHasard != null ? fmtNombre(h.RmoyHasard, 2) : '—'}</td><td>${h ? esc(h.verdict) : 'pas assez de données'}</td></tr>`;
  }).join('');
  return `<details class="cv-or-bilan"><summary>Bilan honnête de l’or (direct, 24 bougies, R net) et rétro-test</summary>
    <table class="cv-table"><thead><tr><th>Setup</th><th>Rétro-test</th><th>Idées</th><th>R net moyen</th><th>Hasard</th><th>Verdict direct</th></tr></thead><tbody>${lignes}</tbody></table>
    <p class="cv-doux">Un setup « non validé » n’envoie aucune alerte Telegram. Sous 100 événements : « pas assez de données ».${g.retro ? ` Rétro-test ${esc(g.retro.series.reference.debut)} → ${esc(g.retro.series.reference.fin)} (référence) et ${esc(g.retro.series.longue.debut)} → (série longue PAXG), ${g.retro.variantesTestees} variantes.` : ''}</p></details>`;
}

/* dessin propre à l'or sur le graphique : plage asiatique, fenêtres d'ouverture, figures, « DONNÉES INSUFFISANTES » */
export function dessinerOr(ctx, taille, { o, series, xT, c, alpha }) {
  if (!o) return;
  ctx.save(); ctx.font = `10px ${c.mono}`; ctx.textBaseline = 'middle';
  if (o.insuffisant) { ctx.fillStyle = alpha(c.perte, .9); ctx.textAlign = 'center'; ctx.font = `13px ${c.mono}`; ctx.fillText('OR : DONNÉES INSUFFISANTES', taille.width / 2, 22); ctx.restore(); return; }
  for (const s of o.sessions || []) { const x0 = xT(s.t0), x1 = xT(s.t1); if (x0 == null || x1 == null) continue; ctx.fillStyle = alpha(c.accent, .05); ctx.fillRect(x0, 0, Math.max(1, x1 - x0), taille.height); ctx.fillStyle = alpha(c.accent, .7); ctx.textAlign = 'left'; ctx.fillText(s.id === 'ny' ? 'NY' : 'Londres', x0 + 3, 10); }
  if (o.asie) { const x0 = xT(o.asie.t0), x1 = xT(o.asie.t1), yh = series.priceToCoordinate(o.asie.h), yb = series.priceToCoordinate(o.asie.l);
    if (x0 != null && x1 != null && yh != null && yb != null) { ctx.fillStyle = alpha(c.sable, .08); ctx.fillRect(x0, yh, x1 - x0, yb - yh); ctx.strokeStyle = alpha(c.sable, .6); ctx.setLineDash([3, 3]); ctx.strokeRect(x0 + .5, yh + .5, x1 - x0, yb - yh); ctx.setLineDash([]); ctx.fillStyle = c.sable; ctx.fillText('ASIE', x0 + 3, yh - 7); } }
  for (const f of o.figures || []) { const x = xT(f.t - 900e3), y = series.priceToCoordinate(f.entree); if (x == null || y == null) continue; const col = f.sens === 'achat' ? c.achat : c.vente, d = f.sens === 'achat' ? 1 : -1;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y + d * 8); ctx.lineTo(x - 5, y + d * 16); ctx.lineTo(x + 5, y + d * 16); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillText(f.figure === 'BALAYAGE_ASIE' ? 'balayage' : f.figure === 'CASSURE_ASIE' ? 'cassure' : 'rejet', x, y + d * 24); }
  ctx.textAlign = 'left'; ctx.fillStyle = alpha(c.sable, .9); ctx.fillText(`OR · ${MENTION}`, 6, 26);
  ctx.restore();
}
