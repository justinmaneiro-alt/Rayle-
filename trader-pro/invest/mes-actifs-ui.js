/* ═════════════ ONGLET « MES ACTIFS » (v7, phase 3) ═════════════
   Une carte par actif (Bitcoin, Solana, or, Nasdaq 100, S&P 500, pétrole) : symbole XTB, prix, verdict par horizon avec indice de confiance, « Pourquoi » en 3 points ;
   un toucher ouvre la fiche : chaque indicateur (valeur, graphique, percentile, source). Les verdicts sont calculés ici (mes-actifs-calcul.js, pur et testé) à partir du fichier
   mes-actifs.json publié chaque jour. Lecture seule : information de marché, jamais un conseil. */
import { esc, nf, age } from '../commun/ui.js';
import { HORIZONS_MA, TYPES, verdictHorizon, phraseVerdict } from './mes-actifs-calcul.js';

export const ORDRE = ['btc', 'sol', 'or', 'us100', 'us500', 'petrole'];
const COUL = { 'Très attractif': '#3fbf7f', Attractif: '#7fcf9f', Neutre: '#b8c2c9', 'Peu attractif': '#e0a43a', 'À éviter': '#e0554a', 'Données insuffisantes': '#6b7a84' };
const CLE_H = 'rayle_ma_horizon';
const lireH = () => { try { const h = localStorage.getItem(CLE_H); return HORIZONS_MA.some(x => x.id === h) ? h : 'moyen'; } catch (e) { return 'moyen'; } };
const prixFr = (v, d) => (Number.isFinite(v) ? nf(v, d != null ? d : v >= 1000 ? 0 : v >= 10 ? 2 : 3) : '—');

function sparkline(histo, { moisSeulement = false, w = 300, h = 70 } = {}) {
  if (!histo || histo.length < 2) return '<p class="tp-doux">Pas d’historique graphique pour cet indicateur.</p>';
  const xs = histo.map(p => p[0]), ys = histo.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...ys), hi = Math.max(...ys), sx = v => 4 + (v - x0) / (x1 - x0 || 1) * (w - 8), sy = v => h - 4 - (v - lo) / (hi - lo || 1) * (h - 8);
  if (moisSeulement) { const bw = (w - 8) / histo.length; return `<svg class="ma-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Rendement moyen par mois">${histo.map((p, i) => { const y0 = sy(0), y = sy(p[1]); return `<rect x="${4 + i * bw + 1}" y="${Math.min(y, y0)}" width="${bw - 2}" height="${Math.max(1, Math.abs(y - y0))}" fill="${p[1] >= 0 ? '#5fb894' : '#d86a6a'}"/>`; }).join('')}<line x1="0" x2="${w}" y1="${sy(0)}" y2="${sy(0)}" stroke="#3a4a54"/></svg>`; }
  return `<svg class="ma-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Historique de l’indicateur"><polyline fill="none" stroke="#7fb3c2" stroke-width="1.4" points="${histo.map(p => sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join(' ')}"/><circle cx="${sx(xs[xs.length - 1]).toFixed(1)}" cy="${sy(ys[ys.length - 1]).toFixed(1)}" r="3" fill="#f1d34f"/></svg>`;
}
const pastille = v => `<span class="ma-v" style="--c:${COUL[v.libelle] || '#6b7a84'}"><b>${esc(v.libelle)}</b>${v.score100 != null ? ` <small>${Math.round(v.score100)}/100 · confiance ${v.confiance} %</small>` : ''}</span>`;

export function htmlCarte(id, A, horizon) {
  const vs = Object.fromEntries(HORIZONS_MA.map(h => [h.id, verdictHorizon(A.indicateurs, h.id)])), vh = vs[horizon];
  return `<article class="tp-carte ma-carte" data-ma-actif="${esc(id)}" tabindex="0" role="button" aria-label="${esc(A.nom)} : ouvrir la fiche">
    <header><h3>${esc(A.nom)}</h3><span class="ma-xtb" title="${A.verifieXtb ? 'Symbole XTB vérifié' : 'Symbole XTB à vérifier dans xStation'}">XTB : ${esc(A.xtb)}${A.verifieXtb ? '' : ' ?'}</span><b class="ma-prix">${prixFr(A.prix)} $${A.prixBrent ? ` <small>(Brent ${prixFr(A.prixBrent)} $)</small>` : ''}</b></header>
    <div class="ma-hor">${HORIZONS_MA.map(h => `<div class="ma-h${h.id === horizon ? ' ma-h-on' : ''}"><small>${h.nom}</small>${pastille(vs[h.id])}</div>`).join('')}</div>
    <h4>Pourquoi, sur ${HORIZONS_MA.find(h => h.id === horizon).nom}</h4><ol class="ma-pq">${vh.pourquoi.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
    <p class="tp-doux">${A.indicateurs.length} indicateurs · toucher pour le détail</p></article>`;
}
export function htmlFiche(id, A, horizon) {
  const vh = verdictHorizon(A.indicateurs, horizon), contrib = new Map(vh.contributions.map(c => [c.id, c]));
  const lignes = A.indicateurs.map(i => { const c = contrib.get(i.id), p = i.percentile;
    return `<article class="tp-carte ma-ind"><h4>${esc(i.nom)} <small class="tp-doux">${esc(TYPES[i.type] || i.type)}</small></h4><p class="ma-val"><b>${esc(i.texte)}</b></p>
      ${p != null ? `<div class="ma-pc" title="Plus haut que ${Math.round(p)} % de son historique"><i style="left:${Math.min(98, Math.max(1, p))}%"></i><span>bas</span><span>haut</span></div><p class="tp-doux">Position dans son historique${i.depuis ? ' (depuis ' + esc(i.depuis) + ', ' + i.n.toLocaleString('fr-FR') + ' points)' : ''} : percentile ${Math.round(p)} / 100.</p>` : '<p class="tp-doux">Pas de percentile : score donné par une règle (voir l’aide).</p>'}
      ${sparkline(i.histo, { moisSeulement: !!i.histoMois })}
      <p class="tp-doux">Effet sur le verdict (${HORIZONS_MA.find(h => h.id === horizon).nom}) : ${c ? (c.apport >= 0 ? '+' : '−') + nf(Math.abs(c.apport) * 100, 0) + ' points (poids ' + c.poids + ')' : 'aucun (poids nul sur cet horizon)'}. ${esc(i.aide || '')}</p><p class="tp-src">Source : ${esc(i.source)}</p></article>`; }).join('');
  return `<p><button type="button" class="tp-lien" data-ma-retour>← Mes actifs</button></p><article class="tp-carte"><h3>${esc(A.nom)} <small class="tp-doux">XTB : ${esc(A.xtb)}${A.verifieXtb ? '' : ' (à vérifier)'}</small></h3>
    <div class="ma-hor">${HORIZONS_MA.map(h => `<button type="button" class="ma-h${h.id === horizon ? ' ma-h-on' : ''}" data-ma-h="${h.id}"><small>${h.nom}</small>${pastille(verdictHorizon(A.indicateurs, h.id))}</button>`).join('')}</div>
    <ol class="ma-pq">${vh.pourquoi.map(t => `<li>${esc(t)}</li>`).join('')}</ol><p><button type="button" data-ma-lire="${esc(id)}">🔊 Rayle lit le verdict</button></p></article>${lignes}`;
}

export async function vueMesActifs({ zone, donnees, parler = () => {}, S = {} }) {
  zone.innerHTML = '<article class="tp-carte"><p class="tp-doux">Chargement des indicateurs…</p></article>';
  let D = null, erreur = null; try { D = await donnees.mesActifs(); } catch (e) { erreur = String(e && e.message || e); }
  if (!D || !D.actifs) { zone.innerHTML = `<article class="tp-carte tp-vide"><h3>Mes actifs</h3><p>Les indicateurs ne sont pas encore publiés${erreur ? ' (' + esc(erreur) + ')' : ''}. La tâche quotidienne (GitHub Actions « mes-actifs », 05 h 40 UTC, ou le calcul nocturne « invest ») les publie sur la branche donnees-invest : relance-la depuis l’onglet Actions de GitHub si c’est la première fois.</p></article>`; return null; }
  let horizon = HORIZONS_MA.some(x => x.id === S.horizon) ? S.horizon : lireH(), ouvert = null;
  const ids = ORDRE.filter(k => D.actifs[k]), absentes = D.absentes || [];
  function rendre() {
    if (ouvert) { zone.innerHTML = htmlFiche(ouvert, D.actifs[ouvert], horizon); return; }
    zone.innerHTML = `<article class="tp-carte"><h3>Mes actifs : cher ou pas cher ?</h3><p class="tp-doux">Un verdict par horizon, calculé chaque jour avec les indicateurs qui conviennent à chaque actif (valorisation, tendance, positionnement, saisonnalité). Mise à jour : ${esc(age(D.t))}. Information de marché, jamais un conseil.</p>
      <div class="ma-hor ma-choix" role="group" aria-label="Horizon des explications">${HORIZONS_MA.map(h => `<button type="button" class="ma-h${h.id === horizon ? ' ma-h-on' : ''}" data-ma-h="${h.id}">${h.nom}</button>`).join('')}</div></article>
      <div class="ma-grille">${ids.map(k => htmlCarte(k, D.actifs[k], horizon)).join('')}</div>
      ${absentes.length ? `<details class="tp-carte"><summary>${absentes.length} indicateur(s) retiré(s) faute de source gratuite ou en panne</summary><ul class="tp-doux">${absentes.map(a => `<li><b>${esc(a.actif)}</b> · ${esc(a.indicateur)} : ${esc(a.raison)}</li>`).join('')}</ul></details>` : ''}`;
  }
  const clic = ev => {
    const h = ev.target.closest('[data-ma-h]'); if (h) { horizon = h.dataset.maH; try { localStorage.setItem(CLE_H, horizon); } catch (e) { /* */ } rendre(); return; }
    if (ev.target.closest('[data-ma-retour]')) { ouvert = null; rendre(); return; }
    const l = ev.target.closest('[data-ma-lire]'); if (l) { const k = l.dataset.maLire; parler(phraseVerdict(D.actifs[k].nom, D.actifs[k].indicateurs, horizon)); return; }
    const c = ev.target.closest('[data-ma-actif]'); if (c) { ouvert = c.dataset.maActif; rendre(); try { zone.scrollIntoView({ block: 'start' }); } catch (e) { /* */ } }
  };
  zone.onclick = clic; zone.onkeydown = ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-ma-actif]')) { ev.preventDefault(); clic(ev); } };
  rendre(); return { donnees: D, ouvrir: k => { ouvert = k; rendre(); }, horizon: h => { horizon = h; rendre(); } };
}
/* pour la voix : texte parlé d'un actif sur un horizon, sans interface */
export const lireVerdict = (D, id, horizon) => (D && D.actifs && D.actifs[id] ? phraseVerdict(D.actifs[id].nom, D.actifs[id].indicateurs, horizon) : null);
