/* Onglet « Risque global » du Portefeuille (v6, B4) : réglages de risque, perte si tous les stops sont touchés, exposition par facteur, paires corrélées, budget jour / semaine, positions saisies à la main (fermables en un toucher). */
import { esc, nf, lireLS, ecrireLS } from '../commun/ui.js';
import { ACTIFS_XTB } from './journal-setups.js';
import { REGLAGES_DEFAUT, unifier, analyser, creerCorr, pertesRealisees, budget, phraseRisque } from './risque-global.js';

export const CLE_RISQUE = 'rayle_pf_risque_v1', CLE_POSITIONS = 'rayle_pf_positions_v1';
const traduire = t => { const e = Object.entries(ACTIFS_XTB).find(([, a]) => a.ticker === t); return e ? e[0] : String(t || '').toLowerCase(); };
export const lireReglagesRisque = () => ({ ...REGLAGES_DEFAUT, ...(lireLS(CLE_RISQUE, {}) || {}) });
export const lireSaisies = () => { const L = lireLS(CLE_POSITIONS, []); return Array.isArray(L) ? L : []; };
async function corrCouverture() { try { const r = await fetch('https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/marches-correlations.json', { signal: AbortSignal.timeout(8000) }); return creerCorr(r.ok ? await r.json() : null); } catch (e) { return creerCorr(null); } }
/* synthèse utilisée par l'onglet, le résumé d'accueil, le calculateur de taille et la voix */
export async function synthese(S, { maintenant = Date.now() } = {}) {
  const reg = { ...lireReglagesRisque(), capital: lireReglagesRisque().capital || (S && S.capital) || 0 }, ouvertes = (S && S.L && S.L.ouvertes && S.L.ouvertes.positions) || [];
  const expo = ouvertes.map(o => ({ ...o, risqueAuStop: o.risqueAuStop != null ? o.risqueAuStop : (o.sl != null && o.prixOuv != null ? (o.sl - o.prixOuv) * (o.sens === 'BUY' ? 1 : -1) * (o.volume || 0) : null) }));
  const P = unifier({ ouvertes: expo, saisies: lireSaisies(), traduire }), A = analyser(P, { corr: await corrCouverture(), capital: reg.capital });
  const b = budget({ reglages: reg, pertes: pertesRealisees((S && S.L && S.L.fermees) || [], maintenant), engage: A.total });
  ecrireLS("rayle_pf_risque_cache", { t: maintenant, b }); return { reg, P, A, b, phrase: phraseRisque(A, b) };
}
const barre = (x, l) => `<div class="tp-barre"><i style="width:${Math.min(100, l > 0 ? Math.round(100 * x / l) : 0)}%"></i></div>`;
export async function vueRisque(S, zone) {
  zone.innerHTML = '<p class="tp-att">Calcul du risque…</p>'; const Y = await synthese(S), { reg, A, b } = Y, etat = e => ({ ok: 'dans la limite', proche: 'proche de la limite', atteinte: 'LIMITE ATTEINTE', inconnu: 'renseigne ton capital' }[e]);
  zone.innerHTML = `<article class="tp-carte"><h3>Risque global</h3><p class="tp-doux">Lecture seule : ce sont des alertes, jamais un blocage ; la décision reste la tienne.</p><p><b>${esc(Y.phrase)}</b></p>
    <div class="tp-grille"><div><span>Perte si tous les stops sont touchés</span><b>${nf(A.total, 0)} €</b>${A.totalPct != null ? ` <small>${nf(A.totalPct, 1)} % du capital</small>` : ''}</div><div><span>Positions</span><b>${A.n}</b>${A.sansStop ? ` <small>${A.sansStop} sans stop</small>` : ''}</div></div></article>
    <article class="tp-carte"><h3>Budget de risque</h3>${[['Aujourd’hui', b.jour], ['Cette semaine', b.semaine]].map(([n, x]) => `<p>${n} : ${nf(x.perte + (A.total), 0)} € utilisés sur ${nf(x.limite, 0)} € — <b>${esc(etat(x.etat))}</b></p>${barre(x.perte + A.total, x.limite)}`).join('')}</article>
    <article class="tp-carte"><h3>Exposition par facteur</h3>${A.expo.length ? `<ul>${A.expo.map(e => `<li><b>${esc(e.nom)}</b> : ${nf(e.risque, 0)} € (${Math.round(e.pct * 100)} % du risque) — ${esc(e.phrase)}</li>`).join('')}</ul>` : '<p class="tp-doux">Aucune exposition mesurable.</p>'}
    ${A.paires.length ? `<h4>Positions très corrélées dans le même sens</h4><ul>${A.paires.map(p => `<li>${esc(p.a)} et ${esc(p.b)} : corrélation ${nf(p.corr, 2)} (${esc(p.source)})</li>`).join('')}</ul>` : ''}</article>
    <article class="tp-carte"><h3>Mes réglages de risque</h3><div class="tp-form"><label>Capital (€) <input type="number" data-r="capital" value="${reg.capital || ''}" min="0" step="any"></label><label>Risque par position (€) <input type="number" data-r="risquePos" value="${reg.risquePos}" min="0" step="any"></label><label>Limite de perte du jour (% du capital) <input type="number" data-r="limiteJourPct" value="${reg.limiteJourPct}" min="0" step="any"></label><label>Limite de la semaine (%) <input type="number" data-r="limiteSemainePct" value="${reg.limiteSemainePct}" min="0" step="any"></label></div></article>
    <article class="tp-carte"><h3>Positions saisies à la main</h3>${lireSaisies().filter(s => !s.fermee).map(s => `<p>${esc(s.actif)} ${s.sens === 'BUY' ? 'achat' : 'vente'} · risque ${nf(s.risque, 0)} € <button type="button" data-fermer="${esc(s.id)}">Fermer</button></p>`).join('') || '<p class="tp-doux">Aucune (les positions de l’import XTB sont prises automatiquement).</p>'}
    <form data-ajout class="tp-form"><label>Actif <select name="actif">${['or', 'us100', 'us500', 'btc', 'sol', 'eurusd', 'argent', 'usdchf'].map(a => `<option>${a}</option>`).join('')}</select></label><label>Sens <select name="sens"><option value="BUY">Achat</option><option value="SELL">Vente</option></select></label><label>Risque (€) <input name="risque" type="number" min="0" step="any" value="${reg.risquePos}"></label><button type="submit">Ajouter</button></form></article>`;
  zone.onchange = e => { const i = e.target.closest('[data-r]'); if (!i) return; const r = lireReglagesRisque(); r[i.dataset.r] = Math.max(0, parseFloat(i.value) || 0); ecrireLS(CLE_RISQUE, r); vueRisque(S, zone); };
  zone.onclick = e => { const b2 = e.target.closest('[data-fermer]'); if (!b2) return; ecrireLS(CLE_POSITIONS, lireSaisies().map(s => (s.id === b2.dataset.fermer ? { ...s, fermee: true } : s))); vueRisque(S, zone); };
  zone.onsubmit = e => { const f = e.target.closest('[data-ajout]'); if (!f) return; e.preventDefault(); const d = new FormData(f); ecrireLS(CLE_POSITIONS, [...lireSaisies(), { id: Date.now().toString(36), actif: d.get('actif'), sens: d.get('sens'), risque: parseFloat(d.get('risque')) || 0, t: Date.now() }]); vueRisque(S, zone); };
}
