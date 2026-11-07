/* ═════════════ GARDIEN DE DRAWDOWN + CALCULATEUR DE TAILLE (sur la page du tableau de bord) ═════════════
   Trades : ceux du journal (saisis ou importés en CSV Kraken ; l'historique XTB, en euros et d'un autre compte, n'est pas compté).
   N'agit sur aucun ordre réel : il affiche les paliers et dit « stop pour aujourd'hui ». */
import { DEFAUTS, etatGardien, taillePosition } from './gardien-calcul.js';
import { lireJSON, ecrireJSON } from './stockage-or.js';
import { esc, nb, parler } from './tableau-or.js';

const CLE = 'rayle_or_gardien';
export function monterGardien(el, { tableau }) {
  const R = { ...DEFAUTS, latent: 0, ...lireJSON(CLE, {}) };
  el.innerHTML = `<h2>Gardien du compte prop <small>paliers plus prudents que les limites du compte · aucun ordre</small></h2>
  <div class="tor-grille" data-g-regl>
    <label>Capital de départ $ <input type="number" step="1" data-k="capital"></label>
    <label>Limite perte du jour % <input type="number" step="0.1" data-k="limiteJour"></label>
    <label>Limite perte totale % <input type="number" step="0.1" data-k="limiteTotale"></label>
    <label>Alerte du jour à % <input type="number" step="0.1" data-k="alerteJour"></label>
    <label>Stop pour aujourd’hui à % <input type="number" step="0.1" data-k="stopJour"></label>
    <label>Pertes de suite avant stop <input type="number" step="1" min="1" data-k="pertesDeSuite"></label>
    <label>Objectif % <input type="number" step="0.5" data-k="objectif"></label>
    <label>Calcul de la perte <select data-k="base"><option value="solde">sur le solde (trades clôturés)</option><option value="equite">sur l’équité (solde + latent)</option></select></label>
    <label>Latent actuel $ (équité) <input type="number" step="0.01" data-k="latent"></label>
  </div>
  <div data-g-etat aria-live="polite"></div>
  <h3>Calculateur de taille <small class="tor-doux">contrat Kraken PF_XAUUSD = 1 once, pas de 0,001</small></h3>
  <div class="tor-grille"><label>Risque par trade % <input type="number" step="0.05" data-k="risque"></label><label>Entrée <input type="number" step="0.01" data-c="entree"></label><label>Stop <input type="number" step="0.01" data-c="stop"></label><div class="tor-actions"><button type="button" data-a="g-position">Reprendre l’outil Position</button></div></div>
  <p data-g-taille></p>`;
  const q = s => el.querySelector(s);
  for (const i of el.querySelectorAll('[data-k]')) { i.value = R[i.dataset.k]; i.addEventListener('change', () => { R[i.dataset.k] = i.tagName === 'SELECT' ? i.value : +i.value; ecrireJSON(CLE, R); rendre(); }); }
  for (const i of el.querySelectorAll('[data-c]')) i.addEventListener('input', rendreTaille);
  q('[data-a="g-position"]').onclick = () => { const p = tableau.graph.position(); if (p) { if (p.entree) q('[data-c="entree"]').value = p.entree; if (p.stop) q('[data-c="stop"]').value = p.stop; } rendreTaille(); };
  let dernierStatut = null, calc = null;
  function etat() { const trades = (tableau.modules.journal && tableau.modules.journal.trades()) || []; return etatGardien(trades, { reglages: R, latent: R.latent }); }
  function rendre() {
    const E = etat(), barre = (v, max) => `<div class="tor-barre"><i style="width:${Math.min(100, v / max * 100).toFixed(1)}%"></i></div>`;
    const titre = { ok: 'Dans les clous', attention: 'Attention', stop: 'STOP POUR AUJOURD’HUI', limite: 'LIMITE DU COMPTE ATTEINTE' }[E.statut];
    q('[data-g-etat]').innerHTML = `<p class="tor-alerte ${E.statut === 'ok' ? '' : E.statut === 'attention' ? 'tor-alerte-orange' : 'tor-alerte-rouge'}" data-g-statut="${E.statut}"><b>${titre}</b>${E.alertes.map(a => `<br>${esc(a.texte)}`).join('')}</p>
      <div class="tor-grille">
        <div>Équité ${E.base === 'equite' ? '' : '(solde) '}<b>${nb(E.actuel)} $</b><br><small class="tor-doux">réalisé ${nb(E.realise)} $${E.base === 'equite' ? ` · latent ${nb(E.latent)} $` : ''}</small></div>
        <div>Perte du jour <b>${nb(E.perteJourPct)} %</b> ${barre(E.perteJourPct, R.limiteJour)}<small class="tor-doux">stop à ${R.stopJour} % · limite ${R.limiteJour} % · encore ${nb(E.resteJour)} $ avant le stop</small></div>
        <div>Perte totale <b>${nb(E.perteTotalePct)} %</b> ${barre(E.perteTotalePct, R.limiteTotale)}<small class="tor-doux">alertes à ${R.alertesTotales.join(' et ')} % · limite ${R.limiteTotale} % · marge ${nb(E.resteTotal)} $</small></div>
        <div>Vers +${R.objectif} % <b>${nb(E.gainPct)} %</b> ${barre(E.avancement, 1)}<small class="tor-doux">${E.tradesJour} trade(s) aujourd’hui · ${E.pertesDeSuite} perte(s) de suite</small></div>
      </div>`;
    if (dernierStatut && E.statut !== dernierStatut && E.statut !== 'ok') { const t = E.alertes[0] ? E.alertes[0].texte : titre; tableau.notifier('Gardien : ' + t, { niveau: 'fort' }); parler('Gardien. ' + t); }
    dernierStatut = E.statut; rendreTaille(E);
  }
  function rendreTaille(E = etat()) {
    const entree = +q('[data-c="entree"]').value, stop = +q('[data-c="stop"]').value;
    const r = taillePosition({ equite: E.actuel, risquePct: R.risque, entree, stop });
    calc = r.ok ? r.contrats : null;
    q('[data-g-taille]').innerHTML = r.ok ? `Risque ${nb(R.risque)} % de ${nb(E.actuel)} $ = <b>${nb(r.risque$)} $</b> · stop à ${nb(r.distance)} $ → <b>${nb(r.contrats, 3)} contrats</b> (${nb(r.onces, 3)} once${r.onces > 1 ? 's' : ''}, valeur ${nb(r.valeur$, 0)} $, risque réel ${nb(r.risqueReel$)} $ ; ≈ ${nb(r.lotsXtb, 2)} lot XTB de 100 onces)` + (E.statut === 'stop' || E.statut === 'limite' ? ' <b class="neg">— le gardien dit : pas de nouveau trade aujourd’hui.</b>' : '') : `<span class="tor-doux">${esc(r.raison)}</span>`;
  }
  const api = {
    majMarche() { rendre(); }, majPosition(p) { if (p && p.entree && p.stop) { q('[data-c="entree"]').value = p.entree; q('[data-c="stop"]').value = p.stop; rendreTaille(); } },
    tailleCalculee: () => calc, etat
  };
  rendre(); return api;
}
