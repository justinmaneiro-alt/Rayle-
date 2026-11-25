/* ═════════════ FENÊTRE « MARCHÉS » (version pro) : carrousel, PC / tablette / téléphone ═════════════
   Une seule navigation par onglets (Aujourd'hui · Actifs · COT · Macro · Actualité · Alertes). Chaque onglet ne se charge que quand on l'ouvre, et chaque bloc se charge seul :
   aucun chargement infini (copie locale d'abord, délai de 6 s par source, message + « Réessayer »). Un seul prix de l'or. Un seul avertissement, en bas. Lecture seule : aucun ordre.
   API (compatible avec l'ancienne fenêtre) : ouvrir({ racine, onFermer }), fermer(), etat(). */
import { esc, nf, pct, cls, lireLS, ecrireLS, age } from '../commun/ui.js';
import { lireActifPro, prixOr } from '../commun/donnees.js';
import { parler } from '../commun/ia.js';
import { verifierGlobal } from './onglet-alertes.js';
import { brancherSynchroAlertes } from '../portefeuille/alertes-sync.js';

const ONGLETS = [['aujourdhui', 'Aujourd’hui', './onglet-aujourdhui.js'], ['actifs', 'Actifs', './onglet-actifs.js'], ['cot', 'COT', './onglet-cot.js'], ['macro', 'Macro', './onglet-macro.js'], ['actualite', 'Actualité', './onglet-actualite.js'], ['alertes', 'Alertes', './onglet-alertes.js']];
let instance = null;
export const etat = () => (instance ? instance.etat() : { actif: false });

export async function ouvrir({ racine = document.body, onFermer = () => {} } = {}) {
  if (instance) return instance;
  const el = document.createElement('section'); el.id = 'marches-fenetre'; el.className = 'tp tp-marches'; el.setAttribute('aria-label', 'Marchés');
  el.innerHTML = `<header class="tp-tete"><b>Marchés</b><span class="tp-or" data-or aria-live="off" title="Prix de l’or : Kraken PF_XAUUSD, le même partout dans l’appli">Or —</span><button type="button" class="tp-lire" data-fiabilite title="Mon taux de réussite, vérifié à +1, +3 et +5 jours">Fiabilité</button><button type="button" class="tp-lire" data-carnet title="Tes idées, ce que disaient les outils, les débriefs">Carnet</button><button type="button" class="tp-lire" data-formation title="Relire les gros mouvements des derniers mois, bougie par bougie">Formation</button><button type="button" class="tp-lire" data-point title="Rayle te raconte ce qui s’est passé, session par session">Point de Rayle</button><button type="button" class="tp-lire" data-lire aria-label="Lire cet onglet à voix haute">🔊</button></header>
    <nav class="tp-nav" role="tablist" aria-label="Sections">${ONGLETS.map(([k, n]) => `<button type="button" role="tab" data-onglet="${k}" aria-selected="false">${esc(n)}</button>`).join('')}</nav>
    <main class="tp-corps" data-corps></main>
    <footer class="tp-pied">Lecture seule : aucun ordre. Pas un conseil d’investissement ; l’historique ne garantit rien. Chaque chiffre porte sa source et son âge.</footer>`;
  racine.appendChild(el);
  const S = { ferme: false, onglet: null, module: null, seq: 0, minuteurs: [] }, $ = s => el.querySelector(s), corps = $('[data-corps]');

  async function aller(k) {
    if (S.ferme) return; const def = ONGLETS.find(o => o[0] === k) || ONGLETS[0], n = ++S.seq;
    if (S.module && S.module.detruire) { try { S.module.detruire(); } catch (e) { /* */ } } S.module = null; S.onglet = def[0]; ecrireLS('tp_onglet', def[0]);
    el.querySelectorAll('[data-onglet]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.onglet === def[0])));
    corps.innerHTML = '<div class="tp-onglet" data-zone></div>'; corps.scrollTop = 0; const zone = corps.querySelector('[data-zone]');
    try { const m = await import(def[2]); if (n !== S.seq || S.ferme) return; S.module = m.monter(zone, {}); }
    catch (e) { if (n === S.seq) zone.innerHTML = `<p class="tp-panne" role="alert">Cet onglet n’a pas pu s’ouvrir : ${esc(e && e.message || e)} <button type="button" data-rouvrir>Réessayer</button></p>`; }
  }
  /* un seul prix de l'or, partout */
  async function majOr() {
    if (S.ferme || document.hidden) return; const pastille = $('[data-or]'); if (!pastille) return;
    try { const p = await prixOr(); if (S.ferme) return;
      if (p) { pastille.innerHTML = `Or <b>${nf(p.prix, 2)}</b><small> ${p.ferme ? 'marché fermé · dernier cours' : esc(age(p.t))}</small>`; pastille.title = p.source + (p.note ? ' — ' + p.note : ''); pastille.classList.toggle('tp-ferme', !!p.ferme || !p.reference); } else pastille.textContent = 'Or : prix indisponible'; }
    catch (e) { pastille.textContent = 'Or : prix indisponible'; }
  }
  el.addEventListener('click', e => {
    const o = e.target.closest('[data-onglet]'); if (o) { aller(o.dataset.onglet); return; }
    if (e.target.closest('[data-rouvrir]')) { aller(S.onglet); return; }
    if (e.target.closest('[data-fiabilite]')) { import('../copilote/fiabilite-ui.js').then(m => m.ouvrirFiabilite()).catch(er => toast('Fiabilité indisponible : ' + (er && er.message || er))); return; }
    if (e.target.closest('[data-carnet]')) { import('../copilote/carnet-ui.js').then(m => m.ouvrirCarnet()).catch(er => toast('Carnet indisponible : ' + (er && er.message || er))); return; }
    if (e.target.closest('[data-formation]')) { import('../copilote/formation-ui.js').then(m => m.ouvrirFormation()).catch(er => toast('Formation indisponible : ' + (er && er.message || er))); return; }
    if (e.target.closest('[data-point]')) { import('../point/fenetre.js').then(m => m.ouvrirPoint({ type: 'depuis', parler: false })).catch(er => toast('Point indisponible : ' + (er && er.message || er))); return; }
    if (e.target.closest('[data-lire]')) { const t = S.module && S.module.resume ? S.module.resume() : ''; parler(t || 'Cet onglet n’a pas de résumé à lire.'); }
  });
  const toast = t => { const d = document.createElement('div'); d.className = 'tp-toast'; d.setAttribute('role', 'alert'); d.textContent = t; el.appendChild(d); setTimeout(() => d.remove(), 12000); };
  S.minuteurs.push(setInterval(majOr, 20000), setInterval(() => { verifierGlobal(toast).catch(() => {}); }, 30000));
  majOr(); brancherSynchroAlertes(); aller(lireLS('tp_onglet', 'aujourdhui'));

  function fermer() {
    if (S.ferme) return; S.ferme = true; S.seq++; S.minuteurs.forEach(clearInterval);
    try { if (S.module && S.module.detruire) S.module.detruire(); } catch (e) { /* */ } el.remove(); instance = null; try { onFermer(); } catch (e) { /* */ }
  }
  instance = { fermer, aller, etat: () => ({ actif: !S.ferme, onglet: S.onglet }), el };
  return instance;
}
export function fermer() { if (instance) instance.fermer(); }
export { pct, cls };
