/* ═════════════ RAYLE MARCHÉS : interface (onglet « Marchés » du terminal) ═════════════
   Une barre de commande à la Bloomberg (« / » sur PC, champ en haut du panneau sur tactile), des panneaux chargés à la demande, un seul panneau à la fois,
   un copilote qui répond avec source et date. Lecture seule : aucun ordre. Branché par espaces.js (onglet) et tactile-v1.js (case « Marchés » de « Données »). */
import { COMMANDES, lireCommande, suggestions } from '../../../marches/donnees/panneaux.js';
import { chargerPanneau, demanderCopilote } from './client.js';
import { htmlPanneau, esc } from './rendu.js';
import { monterAnalyse, entreeTerminal } from './analyse-ia-ui.js';

const PUCES = [['ensemble', 'Vue d\'ensemble'], ['or', 'Or'], ['us100', 'US100'], ['btc', 'Bitcoin'], ['usd', 'USD'], ['chf', 'CHF'], ['macro', 'Macro'], ['cot', 'COT'], ['calendrier', 'Calendrier'], ['actualites', 'Actualités'], ['correlations', 'Corrélations'], ['analyse', 'Analyse IA'], ['sources', 'Sources']];
const RAFRAICHIR_MS = { ensemble: 60e3, or: 60e3, btc: 60e3, us100: 5 * 60e3, usd: 5 * 60e3, chf: 5 * 60e3, macro: 15 * 60e3, cot: 30 * 60e3, calendrier: 15 * 60e3, actualites: 5 * 60e3, correlations: 30 * 60e3, sources: 30e3, analyse: 0, fred: 15 * 60e3 };

export function monterMarches(zone, { parler = () => {} } = {}) {
  const E = { id: null, params: {}, fenetre: 90, minuteur: null, charge: 0, derniere: null, ouvert: false };
  zone.classList.add('mk'); zone.dataset.marches = '';
  zone.innerHTML = `<header class="mk-tete">
      <form class="mk-cmd" data-mk-cmd autocomplete="off" role="search"><label class="mk-cmd-l"><span aria-hidden="true">›</span><input type="text" inputmode="text" enterkeyhint="go" data-mk-saisie placeholder="Commande : OR, US100, BTC, COT OR, CAL, NEWS, FRED DFII10…" aria-label="Commande de marché" aria-autocomplete="list" aria-controls="mk-suggestions" spellcheck="false"></label><button type="submit" class="mk-ok">Ouvrir</button><ul class="mk-sugg" id="mk-suggestions" role="listbox" hidden></ul></form>
      <nav class="mk-puces" aria-label="Panneaux">${PUCES.map(([k, n]) => `<button type="button" data-mk-panneau="${k}" aria-pressed="false">${esc(n)}</button>`).join('')}</nav>
    </header>
    <div class="mk-corps" data-mk-corps role="region" aria-live="polite"></div>
    <footer class="mk-pied"><form class="mk-copilote" data-mk-copilote><label><span>Copilote Rayle</span><input type="text" data-mk-question placeholder="Ex. : que font les taux réels ? le bitcoin ? l'inflation ?" aria-label="Question au copilote"></label><button type="submit">Demander</button></form><div class="mk-reponse" data-mk-reponse hidden role="status"></div><p class="mk-mention">Outil de lecture : aucune donnée n'est inventée, aucun ordre n'est envoyé. Chaque chiffre porte sa source et sa date.</p></footer>`;
  const corps = zone.querySelector('[data-mk-corps]'), saisie = zone.querySelector('[data-mk-saisie]'), sugg = zone.querySelector('.mk-sugg'), rep = zone.querySelector('[data-mk-reponse]');

  const marquer = id => zone.querySelectorAll('[data-mk-panneau]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mkPanneau === id)));
  async function rendre(id, params, silencieux) {
    const n = ++E.charge;
    if (id === 'analyse') { corps.innerHTML = '<p class="mk-note">Choisissez : lecture du graphique du terminal ou scénarios conditionnels. Sans clé ni abonnement, utilisez « Exporter pour analyse ».</p>'; monterAnalyse(corps, { type: 'graphique', getEntree: () => entreeTerminal(), titre: 'Lecture du graphique' }); monterAnalyse(corps, { type: 'scenarios', getEntree: () => entreeTerminal(), titre: 'Scénarios' }); zone.dispatchEvent(new CustomEvent('marches:panneau', { bubbles: true, detail: { id, hors: false } })); return; }
    if (silencieux && id === 'actualites' && corps.querySelector('[data-mk-ia] textarea[data-ia-reponse]') && (corps.querySelector('[data-ia-reponse]').value || !corps.querySelector('[data-ia-zone-export]').hidden)) return;   // ne pas effacer un texte collé
    if (!silencieux) corps.innerHTML = '<p class="mk-chargement" role="status">Chargement des sources… <small>(un panneau à la fois ; les sources lentes peuvent prendre quelques secondes)</small></p>';
    const r = await chargerPanneau(id, params);
    if (n !== E.charge) return;   // un autre panneau a été demandé entre-temps
    E.derniere = r;
    if (!r.panneau) { corps.innerHTML = `<p class="mk-avert" role="alert">Données indisponibles : ${esc(r.erreur || 'serveur injoignable')}. Aucune valeur n'est affichée tant qu'aucune source n'a répondu.</p><button type="button" class="mk-reessayer" data-mk-reessayer>Réessayer</button>`; return; }
    const y = corps.scrollTop; corps.innerHTML = htmlPanneau(r.panneau, { fenetre: E.fenetre, horsLigne: r.horsLigne }); corps.scrollTop = y;
    if (id === 'actualites') { const titres = (r.panneau.actualites || []).slice(0, 25).map(a => ({ titre: a.titre, source: a.source, heure: new Date(a.publieMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' })); monterAnalyse(corps, { type: 'actualite', getEntree: () => (titres.length ? { titres } : null), titre: 'Comprendre l’actualité' }); }
    zone.dispatchEvent(new CustomEvent('marches:panneau', { bubbles: true, detail: { id, hors: !!r.horsLigne } }));
  }
  function planifier() {
    clearTimeout(E.minuteur); if (!E.ouvert || !E.id) return;
    E.minuteur = setTimeout(async () => { if (document.hidden || zone.hidden) { planifier(); return; } await rendre(E.id, E.params, true); planifier(); }, RAFRAICHIR_MS[E.id] || 5 * 60e3);
  }
  async function ouvrir(id, params = {}) {
    E.ouvert = true; E.id = id; E.params = params; marquer(id === 'fred' ? '' : id); zone.dataset.panneau = id; await rendre(id, params); planifier();
  }
  function commande(texte) {
    const c = lireCommande(texte); if (!c) return false;
    ouvrir(c.panneau, c.panneau === 'fred' ? { serie: c.serie } : (c.actif ? { actif: c.actif } : {})); parler && 0; return true;
  }

  /* barre de commande + autocomplétion */
  let choix = -1;
  const majSugg = () => {
    const l = suggestions(saisie.value, 8); sugg.innerHTML = l.map((s, i) => `<li role="option" id="mk-s${i}" data-cmd="${esc(s.commande)}" aria-selected="${i === choix}"><b>${esc(s.commande)}</b><span>${esc(s.description)}</span></li>`).join(''); sugg.hidden = !l.length || document.activeElement !== saisie;
    saisie.setAttribute('aria-expanded', String(!sugg.hidden)); return l;
  };
  saisie.addEventListener('input', () => { choix = -1; majSugg(); });
  saisie.addEventListener('focus', majSugg);
  saisie.addEventListener('blur', () => setTimeout(() => { sugg.hidden = true; }, 150));
  saisie.addEventListener('keydown', ev => {
    const l = suggestions(saisie.value, 8);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); choix = Math.min(l.length - 1, choix + 1); majSugg(); } else if (ev.key === 'ArrowUp') { ev.preventDefault(); choix = Math.max(-1, choix - 1); majSugg(); }
    else if (ev.key === 'Tab' && l.length && saisie.value) { ev.preventDefault(); saisie.value = l[Math.max(0, choix)].commande; choix = -1; majSugg(); }
    else if (ev.key === 'Escape') { sugg.hidden = true; saisie.blur(); }
  });
  sugg.addEventListener('pointerdown', ev => { const li = ev.target.closest('[data-cmd]'); if (li) { ev.preventDefault(); saisie.value = li.dataset.cmd; sugg.hidden = true; commande(li.dataset.cmd); } });
  zone.querySelector('[data-mk-cmd]').addEventListener('submit', ev => {
    ev.preventDefault(); const l = suggestions(saisie.value, 8), t = choix >= 0 && l[choix] ? l[choix].commande : saisie.value;
    if (!commande(t)) { rep.hidden = false; rep.className = 'mk-reponse mk-avert'; rep.textContent = 'Commande inconnue : ' + (t || '(vide)') + '. Essayez : ' + COMMANDES.map(c => c[0]).join(', ') + ', COT OR, FRED DFII10.'; } else { rep.hidden = true; sugg.hidden = true; saisie.blur(); }
  });
  zone.querySelector('.mk-puces').addEventListener('click', ev => { const b = ev.target.closest('[data-mk-panneau]'); if (b) ouvrir(b.dataset.mkPanneau); });
  corps.addEventListener('click', ev => {
    const f = ev.target.closest('[data-fenetre]'); if (f) { E.fenetre = +f.dataset.fenetre; if (E.derniere && E.derniere.panneau) corps.innerHTML = htmlPanneau(E.derniere.panneau, { fenetre: E.fenetre, horsLigne: E.derniere.horsLigne }); return; }
    if (ev.target.closest('[data-mk-reessayer]')) ouvrir(E.id || 'ensemble', E.params);
  });
  zone.querySelector('[data-mk-copilote]').addEventListener('submit', async ev => {
    ev.preventDefault(); const q = zone.querySelector('[data-mk-question]').value.trim(); if (!q) return;
    rep.hidden = false; rep.className = 'mk-reponse'; rep.textContent = 'Recherche dans les données…'; const r = await demanderCopilote(q); rep.className = 'mk-reponse' + (r.trouve ? '' : ' mk-avert'); rep.textContent = r.texte; try { parler(r.texte); } catch (e) { /* voix absente */ }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && E.ouvert) planifier(); });
  return { ouvrir, commande, panneau: () => E.id, etat: () => ({ id: E.id, params: E.params, charge: E.charge, horsLigne: !!(E.derniere && E.derniere.horsLigne) }), recharger: () => ouvrir(E.id || 'ensemble', E.params), fermer: () => { E.ouvert = false; clearTimeout(E.minuteur); }, focusCommande: () => { saisie.focus(); saisie.select(); } };
}

/* Raccourci « / » (PC) : ouvre l'onglet Marchés et met le curseur dans la barre de commande. Pas pendant la frappe dans un champ. */
export function brancherRaccourci(ouvrirOnglet) {
  if (window.__mkRaccourci) return; window.__mkRaccourci = true;
  document.addEventListener('keydown', ev => {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    ev.preventDefault(); ouvrirOnglet();
  });
}
