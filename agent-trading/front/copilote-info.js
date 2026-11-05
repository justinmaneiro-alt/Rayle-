/* ═════════════ COPILOTE D'INFORMATION : affichage ═════════════
   N'affiche QUE ce que publie le moteur (actifs[x].info dans l'état, info dans la partie lente) : aucun calcul de marché ici.
   Constats de marché seulement : jamais d'ordre, jamais « achat / vente ». Prix = prix Kraken (référence Binance + écart affiché). */
import { fmtPrix, fmtNombre, heureParis } from '../commun/format.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SENS = { haussiere: 'haussière', baissiere: 'baissière', range: 'range', inconnue: '—' };
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const ENTETE = 'INFO MARCHÉ, pas un signal';

/* niveaux (8 au plus) dans la forme du dessin des niveaux ; aucun plan */
export function adapterNiveaux(info) {
  return { niveaux: info && !info.insuffisant ? (info.niveaux || []).slice(0, 8).map(n => ({ id: n.id || 'n', p: n.p, court: n.court })) : [], plans: [], retiresBarres: [], confluence: null };
}

export function htmlBandeauInfo(actif, i) {
  if (!i) return '<span class="cv-doux">Copilote d’information : en attente du moteur…</span>';
  const ec = i.ecart == null ? '—' : (i.ecart > 0 ? '+' : '') + fmtPrix(actif, i.ecart);
  const tg = i.telegram === 'configuré' ? 'Telegram actif' : esc(i.telegram || 'Telegram non configuré');
  const tete = `<span class="at-badge ci-badge">${ENTETE}</span> ${i.tendance ? `<span>H1 ${esc(SENS[i.tendance] || i.tendance)}</span> · <span>séance ${esc(i.seance)}</span> · ` : ''}<span title="${esc(i.source)}">écart Kraken − Binance ${ec}</span> · <span class="${i.telegram === 'configuré' ? '' : 'cv-doux'}" data-ci-telegram>${tg}</span>${i.calme && i.calme.actif ? ' · <span class="cv-doux">heures calmes</span>' : ''}
    <button type="button" class="at-btn ci-couper" data-ci-couper aria-pressed="${!!i.coupe}">${i.coupe ? 'Alertes coupées : réactiver' : 'Couper les alertes'}</button>`;
  return i.insuffisant ? `${tete}<p class="ci-insuffisant"><b>Données insuffisantes</b> : ${esc(i.insuffisant)}. Aucun niveau affiché plutôt que des niveaux douteux.</p>` : tete;
}

export function htmlFil(actif, i) {
  const L = (i && i.fil) || [];
  if (!L.length) return '<p class="cv-doux">Rien de notable pour l’instant.</p>';
  return `<ol class="ci-fil-liste">${L.map(x => `<li data-ci-id="${esc(x.id)}" class="${x.alerte ? 'ci-alerte' : ''}"><time>${heureParis(x.t)}</time> <span class="ci-sym" aria-hidden="true">${esc(x.symbole)}</span> ${esc(x.texte)}${x.reaction ? ` <span class="at-badge">${x.reaction.reagi ? `réaction : ${esc(x.reaction.sens)}` : 'pas de réaction en 8 bougies'}</span>` : ''}${x.silence ? ` <small class="cv-doux">(pas d’alerte : ${esc(x.silence)})</small>` : ''}</li>`).join('')}</ol>`;
}

export function htmlPertinence(actif, g) {
  if (!g) return '<p class="cv-doux">En attente du moteur…</p>';
  const r = g.pertinence && g.pertinence.retro && g.pertinence.retro.actifs[actif], d = g.pertinence && g.pertinence.direct && g.pertinence.direct[actif] || {}, act = g.typesActifs && g.typesActifs[actif] || {};
  const pc = x => x == null ? '—' : fmtNombre(x * 100, 1) + ' %';
  const lignes = Object.keys(act).map(k => { const m = r && r.types[k], dd = d[k];
    return `<tr><td>${esc(g.types[k])}</td><td>${m ? `${m.n}` : '—'}</td><td>${m ? `${pc(m.taux)} / ${pc(m.hasard)}` : '—'}</td><td>${m ? esc(m.verdict) : 'non mesuré'}</td><td>${dd ? `${dd.n} · ${esc(dd.verdict)}` : '—'}</td>
      <td><label><input type="checkbox" data-ci-type="${esc(k)}" ${act[k] ? 'checked' : ''}> alerte</label></td></tr>`; }).join('');
  const rg = g.reglages || {};
  return `<div class="ci-reglages"><label>Heures calmes de <input type="time" data-ci-calme="debut" value="${hm(rg.calmeDebut ?? 1380)}"></label> <label>à <input type="time" data-ci-calme="fin" value="${hm(rg.calmeFin ?? 420)}"></label>
      <span class="cv-doux">· plafond ${g.plafonds ? g.plafonds[actif] : '—'} alertes par jour pour cet actif · une alerte par niveau et par type, pas de répétition avant 60 min · Telegram : ${esc(g.telegram)}</span></div>
    <table class="cv-table"><thead><tr><th>Type d’événement</th><th>Événements (historique)</th><th>Réaction ≥ 1 ATR en 8 bougies / hasard (1000 niveaux)</th><th>Verdict</th><th>En direct</th><th>Alerte</th></tr></thead><tbody>${lignes}</tbody></table>
    <p class="cv-doux">« Niveau utile » seulement avec au moins 100 événements, un taux de réaction au-dessus du hasard et un test significatif. Un type « pas mieux que le hasard » est désactivé par défaut pour les alertes (il reste dans le fil). Ouvertures et annonces : alertes d’agenda, non mesurées.${r ? ` Historique ${esc(r.debut)} → ${esc(r.fin)}.` : ''}</p>`;
}

/* petit message en coin (12 s) */
export function toast(R, actif, al) {
  let z = R.querySelector('[data-ci-toasts]'); if (!z) return;
  const d = document.createElement('div'); d.className = 'ci-toast'; d.setAttribute('role', 'status');
  d.innerHTML = `<b>${ENTETE}</b><span>${esc(al.texte)}</span><button type="button" aria-label="Fermer" data-ci-fermer>×</button>`;
  z.appendChild(d); while (z.children.length > 3) z.firstChild.remove();
  setTimeout(() => d.remove(), 12000);
}

/* marques sur le graphique : petit symbole à l'heure et au niveau ; survol = détail (renvoie la marque survolée) */
export function dessinerMarques(ctx, taille, { marques, series, xT, c, alpha, survol }) {
  const out = []; ctx.save(); ctx.font = `11px ${c.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const m of marques || []) {
    if (m.p == null) continue; const x = xT(m.t), y = series.priceToCoordinate(m.p); if (x == null || y == null || y < 0 || y > taille.height) continue;
    const col = m.types.some(k => k.startsWith('CASSURE')) ? c.sable : m.types.includes('BALAYAGE') || m.types.includes('DELTA_RETOURNEMENT') ? c.accent : c.doux;
    ctx.fillStyle = 'rgba(5,8,12,.85)'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = alpha(col, survol && survol.id === m.id ? 1 : .7); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col; ctx.fillText(m.symbole.slice(0, 1), x, y + .5); out.push({ id: m.id, x, y });
  }
  ctx.restore(); return out;
}
