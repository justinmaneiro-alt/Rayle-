/* ═════════════ RAYLE CAPITAL : tableau de bord lié aux deux poches (investissement et trading actif) ═════════════
   Valeur et performance de la poche investissement, risque ouvert de la poche trading (journal manuel), risque par poche, accès aux rapports COT, marché et dashboard (espace Trading actif).
   Chaque chiffre vient de données saisies ou mesurées sur cet appareil ; rien n'est inventé ; aucun ordre n'est envoyé. */
import { risqueDollars, ferme } from '../or/journal-calcul.js';
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));
const pc = (x, d = 1) => (x == null || !Number.isFinite(x) ? 'indisponible' : nb(x * 100, d) + ' %');
export const CAPITAL_TRADING = 10000;
export function calculer({ invest = null, journal = lire('rayle_or_journal', []), aplus = lire('rayle_or_aplus_forward', []) } = {}) {
  const ouverts = (journal || []).filter(t => t && !ferme(t) && t.source !== 'xtb'), risque = ouverts.reduce((s, t) => s + (risqueDollars(t) || 0), 0), alertes = aplus.filter(r => r.kind === 'alerte').length, res12 = aplus.filter(r => r.kind === 'resultat' && r.h === 12);
  const val = invest ? invest.valeur : 0, total = val + CAPITAL_TRADING, maxPoids = invest ? Math.max(0, ...invest.positions.map(p => p.poids || 0)) : null;
  return { investissement: { valeur: val, cout: invest ? invest.cout : 0, performance: invest ? invest.performance : null, dividendes: invest ? invest.dividendes : 0, positions: invest ? invest.positions.filter(p => p.quantite > 0).length : 0, plusGrosPoids: maxPoids, part: total > 0 ? val / total : null },
    trading: { capital: CAPITAL_TRADING, positionsOuvertes: ouverts.length, risqueOuvert: risque, risquePct: risque / CAPITAL_TRADING, alertesAplus: alertes, mesureesA12: res12.length, part: total > 0 ? CAPITAL_TRADING / total : null }, total };
}
export function monterCapital(el, { investissement, allerTrading = () => {} } = {}) {
  el.classList.add('inv', 'cap');
  function rendre() {
    const inv = investissement ? investissement.valeur() : null, al = investissement ? investissement.alertes() : [], c = calculer({ invest: inv });
    el.innerHTML = `<div class="inv-tete"><h2>Rayle Capital</h2><p class="inv-avert">Ceci n’est pas un conseil financier. Valeurs saisies ou mesurées sur cet appareil ; aucun ordre n’est jamais envoyé.</p></div>
    <div class="inv-2col"><section class="inv-fiche"><h3>Poche Investissement <small>long terme</small></h3><ul><li>Valeur : <b>${nb(c.investissement.valeur, 2)} €</b> (coût ${nb(c.investissement.cout, 2)} €, performance ${pc(c.investissement.performance)})</li><li>Dividendes reçus : ${nb(c.investissement.dividendes, 2)} €</li><li>${c.investissement.positions} valeur${c.investissement.positions > 1 ? 's' : ''} en portefeuille · plus gros poids : ${pc(c.investissement.plusGrosPoids)} (plafond 8 %)</li><li>Part du capital total (investissement + ${nb(CAPITAL_TRADING)} $ de référence du trading actif) : ${pc(c.investissement.part)}</li></ul>${al.length ? `<ul class="inv-alertes">${al.map(a => `<li>⚠ ${esc(a)}</li>`).join('')}</ul>` : '<p class="inv-doux">Aucun plafond dépassé.</p>'}</section>
    <section class="inv-fiche"><h3>Poche Trading actif <small>or</small></h3><ul><li>Positions ouvertes au journal : ${c.trading.positionsOuvertes} · <b>risque ouvert ${nb(c.trading.risqueOuvert, 2)} $ (${pc(c.trading.risquePct)} de ${nb(CAPITAL_TRADING)} $)</b></li><li>Alertes A+ depuis l’ouverture du registre : ${c.trading.alertesAplus} (mesurées à 12 bougies : ${c.trading.mesureesA12}) — <b>règle non prouvée</b>, il faut 30 mesures</li><li>Part du capital total : ${pc(c.trading.part)}</li></ul><p><button type="button" data-cap-aller="trading">Ouvrir le trading actif</button> <button type="button" data-cap-aller="cot">Rapport COT et marché (« Ce qui fait bouger l’or »)</button></p></section></div>
    <section class="inv-fiche"><h3>Risque par poche</h3><p>Investissement : concentration ${pc(c.investissement.plusGrosPoids)} sur la plus grosse valeur, aucune perte maximale mesurée (portefeuille saisi à la main). Trading actif : risque ouvert ${pc(c.trading.risquePct)} du capital de référence. Le garde-fou du journal (perte journalière 3 %, perte totale 6 %) reste la référence de la poche trading.</p><p class="inv-doux">Les rapports COT, marché et dashboard restent dans l’espace Trading actif et dans le terminal de Mars ; ce tableau ne les recopie pas.</p></section>`;
  }
  el.addEventListener('click', ev => { const b = ev.target.closest('[data-cap-aller]'); if (b) allerTrading(b.dataset.capAller); });
  rendre(); return { rendre, calculer: () => calculer({ invest: investissement ? investissement.valeur() : null }) };
}
