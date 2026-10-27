/* ═════════════ PANNEAU « ALERTES » (onglet du bas de l'espace de travail de Mars) ═════════════
   Liste les alertes envoyées par le Veilleur (ENTRÉE, PRÉPARATION, OBSERVATION non validée, MACRO) et donne ses réglages. Données : fichier local du Veilleur lu par la page (core/commun/veilleur-page.js).
   Une alerte affiche son texte complet, son heure et ses canaux ; rien n'est inventé : sans Veilleur, le panneau le dit. Aucun ordre, aucune IA. */
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ETIQ = { ENTREE: 'ENTRÉE · stratégie validée', PREPARATION: 'PRÉPARATION', OBSERVATION: 'OBSERVATION · NON VALIDÉ', MACRO: 'MACRO' };
const heure = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');

export function creerPanneauAlertes() {
  const racine = document.createElement('div'); racine.className = 'tg-alertes';
  racine.innerHTML = '<div class="vl-reglages" data-s="reglages"></div><h4>Alertes reçues</h4><div class="vl-liste" data-s="liste"></div>'
    + '<p class="vl-vide">Le Veilleur ne calcule qu’à la clôture de chaque bougie M15 du Bitcoin (délai de quelques secondes) et seulement si le PC est allumé. Pas un conseil financier ; aucun ordre n’est jamais envoyé.</p>';
  const liste = racine.querySelector('[data-s="liste"]'), reglages = racine.querySelector('[data-s="reglages"]');
  let desabonner = null, dernier = '', rendu = false;
  function rendre() {
    const P = window.VeilleurPage; if (!P) { liste.innerHTML = '<p class="vl-vide">Module du Veilleur indisponible.</p>'; return; }
    if (!rendu) { P.rendreReglages(reglages); rendu = true; }
    const a = P.alertes(), html = P.disponible() === false ? '<p class="vl-vide">Veilleur indisponible : il faut l’application Rayle sur le PC.</p>'
      : a.length ? a.map(x => '<div class="vl-carte ' + esc(x.type) + '"><h5>' + esc(ETIQ[x.type] || x.type) + ' · ' + esc(heure(x.t)) + ' · ' + esc((x.canaux || []).join(' + ')) + '</h5>' + esc(x.texte) + '</div>').join('')
      : '<p class="vl-vide">Aucune alerte pour le moment. C’est normal : sans stratégie validée, le Veilleur n’envoie ni entrée ni préparation (seulement les rappels macro, si activés).</p>';
    if (html !== dernier) { dernier = html; liste.innerHTML = html; }
  }
  function init() { const P = window.VeilleurPage; if (!P) return rendre(); desabonner = P.surChangement(rendre); P.rafraichir().catch(() => {}); rendre(); }
  init();
  return { racine, maj() { rendre(); if (window.VeilleurPage) window.VeilleurPage.rafraichir().catch(() => {}); }, detruire() { if (desabonner) desabonner(); } };
}
