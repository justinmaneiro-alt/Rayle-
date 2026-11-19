/* ═════════════ AIDES À LA DÉCISION SUR LE GRAPHIQUE (interface) : régime de marché, voyant d'alignement, bandes d'annonces, calculateur de taille XTB ═════════════
   Pastilles discrètes en haut du graphique ; bandes colorées de 1 h avant à 1 h après les annonces majeures (calendrier de Marchés) ; calculateur de lots dans l'outil Position. Lecture seule : aucun ordre. */
import { regime, voyant, bandesAnnonces, dansBande, calculerTaille, CONTRATS_XTB } from './aides.js';
import { lireCalendrier } from '../commun/donnees.js';
import { lireEvenements } from '../marches/calendrier.js';
import { barresDaily } from './fleches-registre.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage refusé */ } };
const nf = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '—');
export const LS_TAILLE = 'rayle_tp_taille_xtb';   // { risque, contrat: { id: nombre }, eurUsd: nombre|null }

/* ctx : { id, graph, tactile, uniteAffichee(), barresAffichees(), barresJour(), analyse(), temps(t), fetchCal? } */
export function monterAides(ctx) {
  const { id, graph, tactile } = ctx, chart = graph.chart(), serie = graph.serie(), conteneur = graph.conteneur();
  const E = { bandes: [], calOk: false, cle: '', eurUsd: null, eurUsdSource: null };

  /* ───── pastilles ───── */
  const el = document.createElement('div'); el.className = 'tp-aides'; el.setAttribute('aria-label', 'Régime de marché et alignement'); conteneur.appendChild(el);
  function majPastilles() {
    const B = ctx.barresAffichees() || [], u = ctx.uniteAffichee(), A = ctx.analyse && ctx.analyse(), R = regime(B, ctx.barresJour ? ctx.barresJour() : null, u), V = voyant(A);
    const cle = [R.type, R.vol, R.baseVol, V.etat, V.daily, V.h4, B.length].join('|'); if (cle === E.cle) return; E.cle = cle;
    const volTxt = R.vol ? `volatilité ${R.vol}${R.baseVol === 'J' && u !== 'J' ? ' (Jour)' : ''}` : 'volatilité : historique trop court';
    const tip = (R.er != null ? `Efficacité de Kaufman sur 20 bougies : ${nf(R.er, 2)} (≥ 0,30 = tendance). ` : '') + (R.percentile != null ? `ATR(14) au ${Math.round(R.percentile * 100)}ᵉ percentile de l’année.` : '');
    el.innerHTML = `<span class="tp-chip tp-chip-${R.type || 'nd'}" title="${esc(tip)}">${R.type === 'tendance' ? 'Tendance' : R.type === 'range' ? 'Range' : 'Régime ?'}</span><span class="tp-chip tp-chip-vol-${R.vol || 'nd'}" title="${esc(tip)}">${esc(volTxt)}</span><span class="tp-chip tp-voyant tp-voyant-${V.etat}" title="${esc(V.texte)}" role="img" aria-label="${esc(V.texte)}"><i></i>Daily / H4</span>${R.phrase ? `<span class="tp-aides-phrase">${esc(R.phrase)}</span>` : ''}`;
  }

  /* ───── bandes d'annonces (primitive derrière les bougies) ───── */
  const prim = {
    req: null, attached(p) { this.req = p.requestUpdate; }, detached() { this.req = null; }, updateAllViews() { /* rien */ },
    paneViews() { return [{ zOrder: () => 'bottom', renderer: () => ({ draw() { /* tout est dans drawBackground */ }, drawBackground(cible) { cible.useBitmapCoordinateSpace(sc => {
      try {
        const B = ctx.barresAffichees() || []; if (!B.length || !E.bandes.length) return; const ts = chart.timeScale(), sp = ts.options().barSpacing, hr = sc.horizontalPixelRatio, c = sc.context;
        const xDe = t => { let lo = 0, hi = B.length - 1; if (t <= B[0].t) { const x = ts.timeToCoordinate(ctx.temps(B[0].t)); return x == null ? null : x - (B[0].t - t) / (B[1] ? B[1].t - B[0].t : 3600e3) * sp; } if (t >= B[hi].t) { const x = ts.timeToCoordinate(ctx.temps(B[hi].t)); return x == null ? null : x + (t - B[hi].t) / (B[hi].t - B[hi - 1].t || 3600e3) * sp; }
          while (hi - lo > 1) { const m = (lo + hi) >> 1; if (B[m].t <= t) lo = m; else hi = m; } const xa = ts.timeToCoordinate(ctx.temps(B[lo].t)), xb = ts.timeToCoordinate(ctx.temps(B[hi].t)); return xa == null || xb == null ? null : xa + (t - B[lo].t) / (B[hi].t - B[lo].t) * (xb - xa); };
        for (const b of E.bandes) { const x1 = xDe(b.t1), x2 = xDe(b.t2); if (x1 == null || x2 == null) continue; c.fillStyle = 'rgba(232,168,90,0.13)'; c.fillRect(Math.round(x1 * hr), 0, Math.max(1, Math.round((x2 - x1) * hr)), sc.bitmapSize.height); c.fillStyle = 'rgba(232,168,90,0.5)'; c.fillRect(Math.round(x1 * hr), 0, Math.max(1, Math.round(hr)), sc.bitmapSize.height); }
      } catch (e) { /* le rendu ne doit jamais casser le graphique */ }
    }); } }) }]; }
  };
  serie.attachPrimitive(prim);
  async function chargerCalendrier() {
    try { const r = await lireCalendrier({ delai: 8000 }); E.bandes = bandesAnnonces(lireEvenements(r.donnees)); E.calOk = true; } catch (e) { E.calOk = false; }
    prim.req && prim.req();
  }

  /* ───── calculateur de taille (outil Position) ───── */
  const cfg = () => { const c = lire(LS_TAILLE, {}); return { risque: Number.isFinite(c.risque) && c.risque > 0 ? c.risque : 100, contrat: c.contrat && typeof c.contrat === 'object' ? c.contrat : {}, eurUsd: Number.isFinite(c.eurUsd) && c.eurUsd > 0 ? c.eurUsd : null }; };
  async function chargerEurUsd() {
    try { const { lireJour } = await import('../commun/donnees.js'), r = await lireJour('EURUSD', { delai: 8000 }), b = r && r.donnees && r.donnees.b, d = b && b[b.length - 1], c = d && (d[1] || d[2]); if (c > 0.5 && c < 2.5) { E.eurUsd = c; E.eurUsdSource = 'dernière clôture Yahoo Finance'; } } catch (e) { /* champ modifiable */ }
  }
  /* o : objet « position » (entree, stop, objectif) du terminal ; renvoie { html } affiché dans l'édition de la position */
  function tailleXtb(o) {
    const C = CONTRATS_XTB[id] || { xtb: id.toUpperCase(), contrat: 1, devise: 'USD', verifie: false, note: 'taille du lot à vérifier dans xStation' }, S = cfg(), contrat = S.contrat[id] > 0 ? S.contrat[id] : C.contrat, eur = S.eurUsd || E.eurUsd;
    const t = calculerTaille({ entree: o.entree, stop: o.stop, objectif: o.objectif, risqueEur: S.risque, contrat, eurUsd: eur, devise: C.devise });
    const champ = (k, lab, val, extra = '') => `<label>${lab} <input type="number" step="any" min="0" data-c="xtb-${k}" value="${val}"${extra}></label>`;
    let res;
    if (!t) res = '<p class="tor-doux">Pose l’entrée et le stop pour calculer la taille.</p>';
    else if (t.sansTaux) res = '<p class="tor-doux">Taux EUR/USD indisponible : saisis-le ci-dessus pour obtenir les lots.</p>';
    else res = `<div class="tp-taille-res"><p><b>${t.sens === 'achat' ? 'Achat' : 'Vente'}</b> · <span class="tp-taille-lots">${nf(t.lots, 2)} lot${t.lots >= 2 ? 's' : ''}</span> XTB (<code>${esc(C.xtb)}</code>) pour risquer ${nf(S.risque, 0)} € au stop</p>
      <p>Risque réel au stop : <b>${nf(t.risqueReel, 2)} €</b> · Gain à la cible : <b class="${t.gainCible >= 0 ? 'tp-hausse' : 'tp-baisse'}">${t.gainCible == null ? '—' : nf(t.gainCible, 2) + ' €'}</b> · <b>${t.R == null ? '—' : nf(t.R, 2) + ' R'}</b>${t.coherent === false ? ' <span class="tp-baisse">(objectif du mauvais côté)</span>' : ''}</p>
      ${t.trop_petit ? `<p class="tp-baisse">Risque trop faible : le minimum (0,01 lot) risque ${nf(t.risqueMinimal, 2)} € sur ce stop.</p>` : ''}</div>`;
    return { html: `<div class="tp-taille"><b>Taille XTB</b> ${champ('risque', 'Risque €', S.risque, ' step="10" min="1"')}${champ('contrat', 'Contrat (unités par lot)', contrat)}${champ('eurusd', 'EUR/USD', eur ? nf(eur, 4).replace(/ /g, '').replace(',', '.') : '')}
      <small class="tor-doux">${C.verifie ? esc(C.note) : '⚠ ' + esc(C.note) + ' (champ modifiable)'}${E.eurUsdSource && !S.eurUsd ? ' · EUR/USD : ' + esc(E.eurUsdSource) : ''}</small>${res}</div>` };
  }
  /* libellé de la position sur le graphique : lots XTB et risque en € (remplace « taille N contrats (1 oz) » de Kraken) */
  function libellePosition(o) {
    const C = CONTRATS_XTB[id] || { contrat: 1, devise: 'USD' }, S = cfg(), contrat = S.contrat[id] > 0 ? S.contrat[id] : C.contrat, t = calculerTaille({ entree: o.entree, stop: o.stop, objectif: o.objectif, risqueEur: S.risque, contrat, eurUsd: S.eurUsd || E.eurUsd, devise: C.devise });
    if (!t) return ''; const f0 = v => nf(v, 0);
    return `${t.sens === 'achat' ? 'Achat' : 'Vente'} · Entrée ${f0(o.entree)} · SL ${f0(o.stop)} · TP ${f0(o.objectif)} · R ${nf(t.R, 1)}${t.coherent === false ? ' (TP du mauvais côté)' : ''}${t.sansTaux ? '' : ` · ${nf(t.lots, 2)} lot XTB · risque ${f0(t.risqueReel)} € · cible ${t.gainCible == null ? '—' : f0(t.gainCible) + ' €'}`}`;
  }
  function reglerTaille(k, v) {
    const c = lire(LS_TAILLE, {}); c.contrat = c.contrat || {};
    if (k === 'xtb-risque') c.risque = +v > 0 ? +v : 100; else if (k === 'xtb-contrat') { if (+v > 0) c.contrat[id] = +v; else delete c.contrat[id]; } else if (k === 'xtb-eurusd') c.eurUsd = +v > 0 ? +v : null;
    ecrire(LS_TAILLE, c);
  }
  globalThis.__tpLibellePosition = libellePosition;
  chargerCalendrier(); chargerEurUsd(); majPastilles();
  const t1 = setInterval(() => { if (!document.hidden) majPastilles(); }, 1500), t2 = setInterval(() => { if (!document.hidden) chargerCalendrier(); }, 10 * 60e3);
  return {
    majPastilles, dansAnnonce: t => !!dansBande(t, E.bandes), bandes: () => E.bandes.slice(), tailleXtb, reglerTaille, chargerCalendrier,
    forcerBandes(b) { E.bandes = b; prim.req && prim.req(); },   // pour les tests
    etat: () => ({ chips: el.innerText, regime: el.querySelector('.tp-chip') ? el.querySelector('.tp-chip').textContent : null, voyant: (el.querySelector('.tp-voyant') || {}).className || null, bandes: E.bandes.length, eurUsd: E.eurUsd }),
    detruire() { if (globalThis.__tpLibellePosition === libellePosition) delete globalThis.__tpLibellePosition; clearInterval(t1); clearInterval(t2); try { serie.detachPrimitive(prim); } catch (e) { /* */ } el.remove(); }
  };
}
export { barresDaily };
