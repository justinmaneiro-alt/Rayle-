/* Onglet « Alertes » : alertes de prix par actif. Appli ouverte : voix de Rayle + notification. Appli fermée : copie envoyée au Worker Portefeuille qui prévient par Telegram (si connecté). */
import { esc, nf, lireLS, ecrireLS } from '../commun/ui.js';
import { ACTIFS, parId, lireActifPro, prixOr } from '../commun/donnees.js';
import { parler } from '../commun/ia.js';
import { CLE_ALERTES, MAX_ALERTES, nouvelleAlerte, validerAlerte, evaluerAlertes, texteAlerte } from './alertes.js';

/* prix courants de tous les actifs : l'or par Kraken (un seul prix), BTC et SOL en direct, les autres par l'instantané du robot (âge affiché) */
export async function prixCourants() {
  const out = {};
  await Promise.all(ACTIFS.map(async a => {
    try {
      if (a.id === 'or') { const p = await prixOr(); if (p) out.or = { prix: p.prix, t: p.t, source: p.source }; return; }
      if (a.id === 'btc' || a.id === 'sol') { try { const { krakenSpot } = await import('../../agent-trading/front/donnees/routes.js'), k = await krakenSpot(a.id === 'btc' ? 'BTC-USD' : 'SOL-USD', '1h'); if (k.prix) { out[a.id] = { prix: k.prix, t: k.tPrix, source: 'Kraken (direct)' }; return; } } catch (e) { /* instantané */ } }
      const r = await lireActifPro(a.id); if (Number.isFinite(r.donnees.prix)) out[a.id] = { prix: r.donnees.prix, t: r.donnees.tPrix || r.t, source: 'instantané du robot' };
    } catch (e) { /* cet actif n'a pas de prix : ses alertes restent en attente */ }
  }));
  return out;
}

/* Vérification des alertes, utilisable sans l'onglet (la fenêtre Marchés l'appelle toutes les 30 s tant qu'elle est ouverte) */
export async function verifierGlobal(surToast = () => {}) {
  if (document.hidden) return null; const A = lireLS(CLE_ALERTES, []); if (!A.some(a => !a.declenchee)) return { prix: {}, declenchees: [] };
  const prix = await prixCourants(), r = evaluerAlertes(A, prix);
  if (r.declenchees.length) { ecrireLS(CLE_ALERTES, r.alertes); for (const a of r.declenchees) { const t = texteAlerte(a, (parId[a.actif] || {}).nom, (parId[a.actif] || { dec: 2 }).dec); parler(t); notifier(t); surToast(t); } document.dispatchEvent(new CustomEvent('tp:alertes-changees')); }
  return { prix, declenchees: r.declenchees };
}
async function notifier(t) { try { if ('Notification' in window && Notification.permission === 'granted') { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); reg && reg.showNotification ? reg.showNotification('Alerte marché', { body: t }) : new Notification('Alerte marché', { body: t }); } } catch (e) { /* notifications refusées */ } }
export function monter(zone) {
  const E = { prix: {}, minuteur: null, ferme: false };
  const lire = () => lireLS(CLE_ALERTES, []);
  function dessiner() {
    const A = lire();
    zone.innerHTML = `<p class="tp-doux">Prévient quand un prix passe un niveau. <b>Appli ouverte</b> : voix de Rayle et notification. Appli fermée : seules les alertes copiées sur le Worker Portefeuille partent par Telegram (vérification toutes les 5 minutes au mieux). Prix : or et Bitcoin en direct (Kraken) ; les autres sont des instantanés du robot, avec leur âge.</p>
      <form class="tp-form" data-form><label>Actif <select name="actif">${ACTIFS.map(a => `<option value="${a.id}">${esc(a.nom)}</option>`).join('')}</select></label>
        <label>Quand le prix passe <select name="sens"><option value="dessus">au-dessus de</option><option value="dessous">sous</option></select></label>
        <label>Niveau <input name="niveau" inputmode="decimal" required autocomplete="off"></label><button type="submit">Ajouter l’alerte</button></form>
      <p class="tp-panne" data-erreur hidden role="alert"></p>
      <ul class="tp-liste">${A.map(a => { const p = E.prix[a.actif]; return `<li class="${a.declenchee ? 'tp-fait' : ''}"><span>${esc((parId[a.actif] || { nom: a.actif }).nom)} ${a.sens === 'dessus' ? 'au-dessus de' : 'sous'} <b>${nf(a.niveau, (parId[a.actif] || { dec: 2 }).dec)}</b>${a.declenchee ? ' · <small>déclenchée ' + esc(new Date(a.declenchee).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</small>' : p ? ' · <small>prix actuel ' + nf(p.prix, (parId[a.actif] || { dec: 2 }).dec) + '</small>' : ' · <small>en attente d’un prix</small>'}</span> <button type="button" data-sup="${esc(a.id)}" aria-label="Supprimer l’alerte">×</button></li>`; }).join('') || '<li class="tp-doux">Aucune alerte.</li>'}</ul>`;
  }
  async function verifier() {
    if (E.ferme || document.hidden) return; const r = await verifierGlobal(toast); if (!r) return; E.prix = r.prix;
    if (zone.querySelector('[data-form]')) { const f = zone.querySelector('[data-form] [name=niveau]'), v = f && f.value; dessiner(); const g = zone.querySelector('[data-form] [name=niveau]'); if (g && v) g.value = v; }
  }
  const toast = t => { const d = document.createElement('div'); d.className = 'tp-toast'; d.setAttribute('role', 'alert'); d.textContent = t; zone.appendChild(d); setTimeout(() => d.remove(), 12000); };
  zone.addEventListener('submit', async e => {
    const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
    const d = new FormData(f), a = nouvelleAlerte(d.get('actif'), d.get('sens'), d.get('niveau')), er = zone.querySelector('[data-erreur]');
    const px = (await prixCourants())[a.actif], v = validerAlerte(a, px && px.prix); if (v !== true) { er.hidden = false; er.textContent = v; return; }
    const A = lire(); if (A.length >= MAX_ALERTES) { er.hidden = false; er.textContent = 'Maximum ' + MAX_ALERTES + ' alertes : en supprimer une.'; return; }
    A.push(a); ecrireLS(CLE_ALERTES, A); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (x) { /* */ }
    E.prix = { ...E.prix, [a.actif]: px || E.prix[a.actif] }; dessiner(); document.dispatchEvent(new CustomEvent('tp:alertes-changees'));
  });
  zone.addEventListener('click', e => { const s = e.target.closest('[data-sup]'); if (s) { ecrireLS(CLE_ALERTES, lire().filter(a => a.id !== s.dataset.sup)); dessiner(); document.dispatchEvent(new CustomEvent('tp:alertes-changees')); } });
  dessiner(); verifier(); E.minuteur = setInterval(verifier, 30000);
  return { detruire() { E.ferme = true; clearInterval(E.minuteur); } };
}
