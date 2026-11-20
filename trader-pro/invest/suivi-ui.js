/* Rendu HTML du « Suivi du modèle » (onglet Méthode) à partir de data/snapshots/suivi.json (calculé par suivi-modele.js). Module pur. */
import { HORIZONS, ECHEANCES, GROUPES } from './suivi-modele.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pc = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '−') + (Math.abs(v) * 100).toFixed(1).replace('.', ',') + ' %' : '—');
const NOM_H = { tactique: 'Tactique', swing: 'Swing', moyen: '1–3 ans', long: '5–10 ans' };
export function suiviHtml(su) {
  if (!su || !su.recul) return '<p class="tp-doux">Suivi non encore publié : le premier instantané est enregistré le 1er du mois par la tâche planifiée (data/snapshots/AAAA-MM.json) et les premières mesures arrivent à 1 mois.</p>';
  const snaps = su.snapshots || [], premier = snaps[0] ? new Date(snaps[0].t).toLocaleDateString('fr-FR') : '—';
  let tableaux = '';
  for (const h of HORIZONS) {
    const lignes = GROUPES.map(([id, , nom]) => { const cells = ECHEANCES.map(d => { const m = su.mesures && su.mesures[h] && su.mesures[h][d] && su.mesures[h][d][id]; return m ? `<td>${pc(m.moy)}<br><small>${m.exces != null ? 'vs indice ' + pc(m.exces) + ' · ' : ''}n = ${m.n}</small></td>` : '<td class="tp-doux">—</td>'; }).join(''); return `<tr><th scope="row">${esc(nom)}</th>${cells}</tr>`; });
    if (!GROUPES.some(([id]) => ECHEANCES.some(d => su.mesures && su.mesures[h] && su.mesures[h][d] && su.mesures[h][d][id]))) continue;
    tableaux += `<h4>${esc(NOM_H[h])}</h4><div class="tp-scroll"><table class="tp-t"><tr><th>Verdict à l’instantané</th>${ECHEANCES.map(d => `<th>${d} mois</th>`).join('')}</tr>${lignes.join('')}</table></div>`;
  }
  return `<p class="lt-suivi-msg"><b>${esc(su.recul.message)}</b></p><p class="tp-doux">${snaps.length} instantané${snaps.length > 1 ? 's' : ''} depuis le ${esc(premier)} (${snaps.map(s => esc(s.mois)).join(', ')}). Chaque 1er du mois, la tâche planifiée enregistre tous les scores et verdicts de chaque horizon ; chaque mois, elle mesure la variation de cours réelle depuis chaque instantané : « Très attractif » contre « Neutre » contre « À éviter », et contre l’indice de référence du pays. Variation de cours en devise de cotation (dividendes, change et frais non inclus) ; variations extrêmes (> +300 % ou < −80 %, splits probables) écartées${su.aberrants ? ' (' + su.aberrants + ' écartées)' : ''} ; seules les actions sont mesurées. <b>n</b> = nombre d’observations (action × instantané).</p>${tableaux || '<p class="tp-doux">Aucune mesure disponible : il faut au moins un mois entre deux instantanés.</p>'}`;
}
