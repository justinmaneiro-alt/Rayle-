/* ═════════════ BOUGIES VOLUME : TEXTES ET HTML (purs, testés) ═════════════
   Fenêtre « Et après ? » (au clic sur une bougie colorée) et onglet « Bougies volume » du panneau de droite.
   Rien ici ne calcule de signal : on décrit ce qui s'est passé. Les chiffres viennent de bougies-volume-calcul.js. */
import { classe, suite, similaires, tableau, dernieres, positionMa, estEnCours, dernierClos, NOM_CONTEXTE, NOM_UNITE, NOM_ACTIF, TEXTE_RAPPEL, TEXTE_PETIT, TEXTE_INDISPO, MIN_CAS, fmtX, nomSens, COULEURS, volumeDisponible } from './bougies-volume-calcul.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '—');
const sgn = (v, d = 1) => (Number.isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d) : '—');
const dateFr = (t, unite) => new Date(t).toLocaleString('fr-FR', unite === 'J' ? { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' } : { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

/* données de la fenêtre « Et après ? » pour la bougie i */
export function infoBougie(B, calc, i, { seuil, pas, maintenant = Date.now(), actif, unite } = {}) {
  const b = B[i], c = classe(B, calc, i, seuil), dernier = dernierClos(B, pas, maintenant), enCours = estEnCours(b, pas, maintenant), ma = calc.ma(i), pos = positionMa(B, calc, i);
  return { i, t: b.t, actif, unite, dir: c.dir, niveau: c.niveau, rel: c.rel, enCours, contexte: calc.ctx(i), maPos: pos, maEcartPct: ma ? (b.c / ma - 1) * 100 : null,
    apres: enCours ? null : suite(B, calc, i, dernier), general: enCours ? null : similaires(B, calc, i, { seuil, pas, maintenant }), seuil };
}

export function fenetreHtml(I) {
  const col = I.dir > 0 ? COULEURS.achat : COULEURS.vente, nomA = NOM_ACTIF[I.actif] || I.actif;
  let h = `<header><b style="color:${col}">${esc(fmtX(I.rel))} la médiane</b> <span>${esc(nomSens(I.dir, I.niveau))}</span><button type="button" data-bv-fermer aria-label="Fermer">✕</button></header>
    <p class="bv-sous">${esc(nomA.replace(/^l’|^le |^la /, '').replace(/^./, c => c.toUpperCase()))} · ${esc(NOM_UNITE[I.unite] || I.unite)} · ${esc(dateFr(I.t, I.unite))}${I.enCours ? ' · <b>en cours</b>' : ''}</p>
    <ul class="bv-faits"><li>Volume : <b>${esc(fmtX(I.rel))}</b> la médiane des 50 bougies précédentes</li><li>Bougie <b>${I.dir > 0 ? 'acheteuse' : 'vendeuse'}</b> (clôture ${I.dir > 0 ? 'au-dessus de' : 'sous'} l’ouverture)</li>
    <li>Position : <b>${esc(I.maPos ? (I.maPos === 'dessus' ? 'au-dessus de' : 'sous') + ' la MA200' + (Number.isFinite(I.maEcartPct) ? ' (' + sgn(I.maEcartPct) + ' %)' : '') : 'MA200 indisponible')}</b></li>
    <li>Contexte : <b>${esc(I.contexte ? NOM_CONTEXTE[I.contexte] : 'indéterminé (historique trop court)')}</b></li></ul>`;
  if (I.enCours) return h + `<p class="bv-gris">Bougie en cours : sa couleur est provisoire et ne devient définitive qu’à la clôture. Rien à décrire encore après elle.</p><p class="bv-note">${esc(TEXTE_RAPPEL)}</p>`;
  const A = I.apres;
  h += '<h5>Ce qui s’est réellement passé</h5>';
  if (A && A.horizons.length) {
    h += `<table class="bv-t"><thead><tr><th></th>${A.horizons.map(x => `<th>+${x.h}</th>`).join('')}</tr></thead><tbody><tr><th>%</th>${A.horizons.map(x => `<td>${x.pct == null ? '—' : esc(sgn(x.pct, 2))}</td>`).join('')}</tr><tr><th>ATR</th>${A.horizons.map(x => `<td>${x.atr == null ? '—' : esc(sgn(x.atr, 1))}</td>`).join('')}</tr></tbody></table>`;
    if (A.favorable) h += `<p>Sur ${A.nBougies} bougie${A.nBougies > 1 ? 's' : ''} (10 au plus) : plus grand mouvement <b class="bv-vert">favorable ${esc(nf(A.favorable.pct, 2))} %</b> (${esc(nf(A.favorable.atr, 1))} ATR), <b class="bv-rouge">défavorable ${esc(nf(A.defavorable.pct, 2))} %</b> (${esc(nf(A.defavorable.atr, 1))} ATR). Haut de la bougie ${A.hautRepris ? '<b>repris</b>' : '<b>non repris</b>'}, bas ${A.basRepris ? '<b>repris</b>' : '<b>non repris</b>'}.</p>`;
    else h += '<p class="bv-gris">Aucune bougie clôturée après celle-ci pour l’instant.</p>';
  } else h += '<p class="bv-gris">ATR indisponible : pas assez de bougies avant celle-ci.</p>';
  h += '<h5>Après des bougies similaires <small>(même actif, unité, sens, contexte)</small></h5>';
  const G = I.general;
  if (!G || !G.n) h += '<p class="bv-gris">Aucune autre bougie similaire dans l’historique affiché.</p>';
  else if (G.petit) h += `<p class="bv-gris">${G.n} cas · ${esc(TEXTE_PETIT)} (moins de ${MIN_CAS} cas mesurables à +5 bougies : aucun pourcentage affiché).</p>`;
  else h += `<ul class="bv-faits"><li><b>${G.n}</b> cas (dont ${G.n5} mesurables à +5)</li><li>Continuation à +5 bougies : <b>${esc(nf(G.cont5, 0))} %</b> · retournement : <b>${esc(nf(G.ret5, 0))} %</b></li>
    <li>Mouvement à +5 : moyen <b>${esc(sgn(G.moy5, 2))}</b> · médian <b>${esc(sgn(G.med5, 2))}</b> ATR</li><li>Mouvement à +10 : moyen <b>${esc(sgn(G.moy10, 2))}</b> · médian <b>${esc(sgn(G.med10, 2))}</b> ATR</li></ul><p class="bv-gris">ATR positif = dans le sens de la bougie.</p>`;
  return h + `<p class="bv-note">${esc(TEXTE_RAPPEL)}</p>`;
}

/* ───── onglet « Bougies volume » du panneau de droite ───── */
const cellule = (s, k, d) => (s.petit ? '<td class="bv-petit" colspan="1">—</td>' : `<td>${esc(k === 'cont5' || k === 'ret5' ? nf(s[k], 0) + ' %' : sgn(s[k], d))}</td>`);
function ligneStats(titre, s, extra = '') {
  if (!s.n) return `<tr><th>${titre}</th><td>0</td><td colspan="4" class="bv-petit">—</td></tr>`;
  if (s.petit) return `<tr><th>${titre}</th><td>${s.n}</td><td colspan="4" class="bv-petit">${esc(TEXTE_PETIT)}</td></tr>`;
  return `<tr><th>${titre}</th><td>${s.n}</td>${cellule(s, 'cont5')}${cellule(s, 'ret5')}${cellule(s, 'moy5', 2)}${cellule(s, 'moy10', 2)}</tr>`;
}
const ENTETE = '<thead><tr><th></th><th>Nombre</th><th title="Continuation à +5 bougies">Cont. +5</th><th title="Retournement à +5 bougies">Retourn. +5</th><th title="Mouvement moyen à +5 bougies, en ATR, dans le sens de la bougie">Moy. +5 (ATR)</th><th title="Mouvement moyen à +10 bougies, en ATR">Moy. +10 (ATR)</th></tr></thead>';

export function panneauHtml({ actif, unite, B, calc, seuil, pas, maintenant = Date.now(), alertes = {}, fmtPrix = v => nf(v, 2) }) {
  if (!volumeDisponible(actif)) return `<p class="bv-gris">${esc(TEXTE_INDISPO)}.</p><p class="bv-note">${esc(TEXTE_RAPPEL)}</p>`;
  if (!B || B.length < 60 || !calc || !B.some(b => b.v > 0)) return `<p class="bv-gris">Pas assez de bougies avec volume pour ${esc(NOM_ACTIF[actif] || actif)} en ${esc(NOM_UNITE[unite] || unite)}.</p><p class="bv-note">${esc(TEXTE_RAPPEL)}</p>`;
  const T = tableau(B, calc, { seuil, pas, maintenant }), L = T.lignes, last = dernieres(B, calc, 5, { seuil, pas, maintenant });
  let h = `<p class="bv-sous">${esc((NOM_ACTIF[actif] || actif).replace(/^l’|^le |^la /, '').replace(/^./, c => c.toUpperCase()))} · ${esc(NOM_UNITE[unite] || unite)} · seuil ×${esc(String(seuil).replace(".", ","))} · ${B.length} bougies</p>
    <table class="bv-t bv-stat">${ENTETE}<tbody>${ligneStats('Achat fort', L.achatFort)}${ligneStats('Vente forte', L.venteForte)}${ligneStats('Achat extrême', L.achatExtreme)}${ligneStats('Vente extrême', L.venteExtreme)}</tbody></table>
    <h5>Par contexte</h5><table class="bv-t bv-stat">${ENTETE}<tbody>${ligneStats('Fin de mouvement', T.contexte.fin)}${ligneStats('Sortie de range', T.contexte.range)}${ligneStats('Milieu de mouvement', T.contexte.milieu)}</tbody></table>
    <h5>Par position vs MA200</h5><table class="bv-t bv-stat">${ENTETE}<tbody>${ligneStats('Au-dessus de la MA200', T.ma.dessus)}${ligneStats('Sous la MA200', T.ma.dessous)}</tbody></table>
    <p class="bv-gris">Fort = volume ≥ ×${esc(String(seuil).replace(".", ","))} la médiane (extrêmes inclus) ; extrême = ≥ ×3. Contexte et MA200 : toutes bougies fortes confondues, mouvement dans le sens de la bougie.</p>
    <h5>5 dernières bougies à fort volume</h5>`;
  h += last.length ? `<ul class="bv-liste">${last.map(x => `<li><button type="button" data-bv-centrer="${B[x.i].t}" class="${x.dir > 0 ? 'bv-ach' : 'bv-ven'}"><i style="background:${x.dir > 0 ? COULEURS.achat : COULEURS.vente}"></i><span>${esc(dateFr(B[x.i].t, unite))}</span><b>${esc(fmtX(x.rel))}</b><small>${esc(nomSens(x.dir, x.niveau))} · ${esc(fmtPrix(B[x.i].c))}</small></button></li>`).join('')}</ul>` : '<p class="bv-gris">Aucune bougie à ce seuil dans l’historique affiché.</p>';
  h += `<h5>Alertes <small>(bougie extrême clôturée en H4 ou Daily)</small></h5><label class="bv-case"><input type="checkbox" data-bv-alerte="voix"${alertes.voix ? ' checked' : ''}> Alerte vocale de Rayle</label><label class="bv-case"><input type="checkbox" data-bv-alerte="telegram"${alertes.telegram ? ' checked' : ''}> Message Telegram</label><p class="bv-gris">Désactivées par défaut.</p>`;
  return h + `<p class="bv-note">${esc(TEXTE_RAPPEL)}</p>`;
}
