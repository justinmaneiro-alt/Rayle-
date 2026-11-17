/* ═════════════ FENÊTRE « MARCHÉS » DU CARROUSEL (PC, tablette, téléphone) ═════════════
   Même niveau que Terminal, Anatomie, Terre et 3D : miniature vivante (core/commun/miniatures.js), ouverture en grand, fermeture par la croix du carrousel.
   Contenu : Aujourd'hui (annonces + compte à rebours, heure de Paris) · Par actif (prix, tendance, RSI, multi-échelles, annonces liées, actualités, publications COT,
   mini-graphique avec les flèches v8 en LECTURE SEULE) · Comprendre l'actualité · Alertes par actif · Panneaux détaillés (scénarios, analyse IA gratuite) · Couverture et performances.
   Lecture seule : aucun ordre. Aucune donnée inventée : source, âge et retard visibles ; panne = message clair + copie locale datée. */
import { calendrierSemaine, actualites, coursRapides, lireBougies, ACTIFS, parId, prochaines, compteARebours, heureParis, variation, formatPrix, actusPourActif } from './marches-donnees.js';
import { regrouperActus, validerAlerte, nouvelleAlerte, evaluerAlertes, texteAlerte, lireCot, phraseCot, lireSante, CLE_ALERTES } from './marches-fenetre-calcul.js';
import { calculer, arreter as arreterCalcul } from './calcul-client.js';
import { lireRoute } from '../donnees/routes.js';
import { badge } from '../donnees/couche.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lireLS = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };
let instance = null;
export const etat = () => (instance ? instance.etat() : { actif: false });
const pEtat = r => { const b = r ? badge(r) : ''; return b ? `<p class="pg-etat${r.horsLigne ? ' pg-hl' : ''}" role="status">${esc(b)}</p>` : ''; };

export async function ouvrir({ racine = document.body, onFermer = () => {} } = {}) {
  if (instance) return instance;
  const el = document.createElement('section'); el.id = 'marches-fenetre'; el.setAttribute('aria-label', 'Marchés');
  const SECTIONS = [['aujourdhui', 'Aujourd’hui', true], ['actifs', 'Par actif', true], ['actualite', 'Comprendre l’actualité', false], ['alertes', 'Alertes par actif', false], ['panneaux', 'Panneaux détaillés · scénarios · analyse IA', false], ['couverture', 'Couverture et performances', false]];
  el.innerHTML = `<header class="mf-tete"><b>Marchés</b><span class="mf-sous">lecture seule · aucun ordre</span></header>
    <nav class="mf-nav" aria-label="Sections">${SECTIONS.map(([k, n]) => `<button type="button" data-aller="${k}">${esc(n.replace(/ ·.*/, ''))}</button>`).join('')}</nav>
    <main class="mf-corps">${SECTIONS.map(([k, n, o]) => `<details class="mf-sec" data-s="${k}"${o ? ' open' : ''}><summary>${esc(n)}</summary><div class="mf-c" data-c="${k}"><p class="mf-att" role="status">Chargement…</p></div></details>`).join('')}
    <p class="mf-mentions">Pas un conseil d’investissement. L’historique ne garantit rien. Les données publiques peuvent être différées : la source et l’âge sont affichés.</p></main>`;
  racine.appendChild(el);
  const $ = s => el.querySelector(s), S = { ferme: false, minuteur: null, alerteMinuteur: null, charge: {}, actif: lireLS('rayle_marches_actif', 'btc'), chart: null, couverture: null, panneaux: null, seq: 0 };
  const zone = k => $(`[data-c="${k}"]`);
  const erreurSection = (k, e, recharge) => { zone(k).innerHTML = `<p class="mf-panne" role="alert">${esc(e && e.sansDonnee ? e.message : 'Cette section n’a pas pu se charger : ' + (e && e.message || e))} <button type="button" data-recharge="${k}">Réessayer</button></p>`; };

  /* ───── Aujourd'hui ───── */
  async function aujourdhui() {
    const imp = lireLS('rayle_marches_impacts', ['fort']), z = zone('aujourdhui');
    try {
      const r = await calendrierSemaine(), now = Date.now(), L = prochaines(r.liste, now, { impacts: imp, max: 14 });
      z.innerHTML = `${pEtat(r)}<p class="mf-barre">${[['fort', 'Impact fort'], ['moyen', '+ moyen']].map(([k, n]) => `<button type="button" data-imp="${k}" aria-pressed="${k === 'fort' ? imp.length === 1 : imp.length === 2}">${n}</button>`).join('')}</p>
        ${L.length ? `<ul class="mf-annonces">${L.map(x => `<li class="mf-impact-${x.impact}"><span class="mf-cr" data-cr="${x.t}">${esc(compteARebours(x.t, now))}</span><div><b>${esc(x.titre)}</b> <small>${esc(x.pays)} · ${x.impact}</small><div class="mf-heure">${esc(heureParis(x.t))} · heure de Paris</div><div class="mf-vals">${x.precedent ? 'précédent ' + esc(x.precedent) : ''}${x.prevu ? ' · prévu (consensus public) ' + esc(x.prevu) : (x.precedent ? ' · prévision non publiée par la source' : '')}${x.actuel ? ' · <b>publié ' + esc(x.actuel) + '</b>' : ''}</div></div></li>`).join('')}</ul>` : '<p class="mf-doux">Aucune annonce de ce niveau à venir cette semaine dans la source.</p>'}
        <p class="mf-doux">Source : Forex Factory (flux public de la semaine). Le compte à rebours se met à jour seul.</p>`;
    } catch (e) { erreurSection('aujourdhui', e); }
  }
  function tic() { if (S.ferme || document.hidden) return; const now = Date.now(); el.querySelectorAll('[data-cr]').forEach(n => { n.textContent = compteARebours(+n.dataset.cr, now); }); }
  S.minuteur = setInterval(tic, 1000);

  /* ───── Par actif ───── */
  async function actifs() {
    const z = zone('actifs'); z.innerHTML = `<p class="mf-barre" role="tablist">${ACTIFS.map(a => `<button type="button" role="tab" data-actif="${a.id}" aria-pressed="${a.id === S.actif}">${esc(a.nom)}</button>`).join('')}<button type="button" role="tab" data-actif="sante" aria-pressed="${S.actif === 'sante'}">Santé du marché</button></p><div data-fiche><p class="mf-att">Chargement…</p></div>`;
    await fiche(S.actif);
  }
  async function fiche(id) {
    const cible = $('[data-c="actifs"] [data-fiche]'); if (!cible) return; const n = ++S.seq; S.actif = id; ecrireLS('rayle_marches_actif', id);
    el.querySelectorAll('[data-actif]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.actif === id)));
    cible.innerHTML = '<p class="mf-att" role="status">Lecture des données…</p>';
    try { if (id === 'sante') return await ficheSante(cible, n); const a = parId[id]; if (!a) return;
      const [h1, j, m15, cr, cal, act, cot] = await Promise.all([lireBougies(a.sym, '1h', { ttl: 20 * 60e3 }).catch(() => null), lireBougies(a.sym, '1d', { ttl: 20 * 60e3 }).catch(() => null), Promise.resolve(null), coursRapides().catch(() => null), calendrierSemaine().catch(() => null), actualites('marches', 60).catch(() => null), lireRoute(`/__cot?inst=${a.cot}&n=80`).catch(() => null)]);
      if (n !== S.seq) return; if (!h1 && !j) throw Object.assign(new Error('Aucune bougie disponible pour cet actif (réseau et instantanés injoignables, pas de copie locale).'), { sansDonnee: true });
      const H1 = h1 ? h1.donnees.bougies : [], J = j ? j.donnees.bougies : [], M15 = m15 ? m15.donnees.bougies : [], now = Date.now();
      const an = await calculer({ type: 'analyse', series: { H1, J, M15 }, maintenant: now }).catch(() => null); if (n !== S.seq) return; if (an) an.fleches = [];
      const q = cr && cr.cours && cr.cours[a.id], prix = q ? q.prix : (an && an.prix), veille = q ? q.veille : (H1.length > 24 ? H1[H1.length - 25].c : null), v = variation(prix, veille);
      const liees = cal ? prochaines(cal.liste, now, { impacts: ['fort'], max: 5, pays: a.pays.length ? a.pays : ['USD'] }) : [], aa = act ? actusPourActif(act.items, a, 6) : [], c = cot ? lireCot(cot.donnees) : null;
      const T = an ? an.tendances : {}, dir = an && an.fleches && an.fleches.length ? an.fleches[an.fleches.length - 1] : null;
      const hl = [h1, j].find(x => x && x.horsLigne);
      cible.innerHTML = `<article class="mf-carte"><header><b>${esc(a.nom)}</b><span class="mf-prix">${formatPrix(prix, a.dec)}</span>${v != null ? `<span class="mf-var ${v >= 0 ? 'mf-hausse' : 'mf-baisse'}">${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} %</span>` : ''}</header>
        <p class="mf-doux">${q ? esc(q.origine + ' · ' + q.retard) : esc(h1 ? badge(h1) || h1.origine : 'bougies')}${an && an.tDernier ? ' · dernière bougie H1 : ' + esc(heureParis(an.tDernier)) : ''}</p>${hl ? `<p class="pg-etat pg-hl">${esc(badge(hl))}</p>` : ''}
        ${an ? `<h4>Tendance</h4><p><b>${esc(T.J ? T.J.sens : '—')}</b> en journalier : ${esc(T.J ? T.J.raison || '' : '')}</p><p>${esc(an.mtf.texte)} <small>(score descriptif ${an.mtf.score >= 0 ? '+' : ''}${an.mtf.score}/${an.mtf.sur} : une lecture, jamais un signal)</small></p>
        <table class="mf-t"><tr><th>H1</th><th>H4</th><th>Jour</th><th>RSI H1</th><th>RSI J</th></tr><tr>${['H1', 'H4', 'J'].map(k => `<td class="mf-${(T[k] && T[k].sens) === 'haussière' ? 'hausse' : (T[k] && T[k].sens) === 'baissière' ? 'baisse' : 'neutre'}" title="${esc(T[k] ? T[k].raison || '' : '')}">${esc(T[k] ? T[k].sens : '—')}</td>`).join('')}<td>${an.rsiH1 == null ? '—' : an.rsiH1.toFixed(0)}</td><td>${an.rsiJ == null ? '—' : an.rsiJ.toFixed(0)}</td></tr></table>` : '<p class="mf-doux">Statistiques indisponibles (calcul interrompu).</p>'}
        <div class="mf-graph" data-graph></div>
        <h4>Annonces liées (à venir, impact fort)</h4>${liees.length ? `<ul class="mf-liste">${liees.map(x => `<li><b>${esc(x.titre)}</b> · ${esc(x.pays)} <span class="mf-cr" data-cr="${x.t}">${esc(compteARebours(x.t, now))}</span> <small>${esc(heureParis(x.t))}</small></li>`).join('')}</ul>` : '<p class="mf-doux">Aucune annonce majeure à venir pour ce marché cette semaine.</p>'}
        <h4>Actualités filtrées</h4>${aa.length ? `<ul class="mf-liste">${aa.map(x => `<li><a href="${/^https?:\/\//.test(x.lien || '') ? esc(x.lien) : '#'}" target="_blank" rel="noopener noreferrer">${esc(x.titre)}</a> <small>${esc(x.source || '')}</small></li>`).join('')}</ul>` : '<p class="mf-doux">Aucune actualité récente sur cet actif dans les sources suivies.</p>'}
        <h4>Publications publiques (COT, CFTC)</h4><p>${esc(phraseCot(c))}</p>${cot ? pEtat(cot) : ''}
        ${act ? pEtat(act) : ''}</article>`;
      el.querySelectorAll('[data-actif]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.actif === id)));
      if (H1.length > 30) { const box = cible.querySelector('[data-graph]'); await dessiner(box, H1.slice(-170), [], a.dec, n); }
    } catch (e) { if (n === S.seq) cible.innerHTML = `<p class="mf-panne" role="alert">${esc(e.sansDonnee ? e.message : 'Fiche impossible : ' + (e && e.message || e))} <button type="button" data-recharge="fiche">Réessayer</button></p>`; }
  }
  async function dessiner(box, B, fleches, dec, n) {
    try { const { chargerLib } = await import('../graphique.js'), { tempsParis } = await import('../terminal/indicateurs.js'), LW = await chargerLib(); if (S.ferme || n !== S.seq || !box.isConnected) return;
      if (S.ro) { try { S.ro.disconnect(); } catch (e) { /* */ } S.ro = null; } if (S.chart) { try { S.chart.remove(); } catch (e) { /* */ } S.chart = null; }
      const css = getComputedStyle(el), texte = '#8497a1', chart = LW.createChart(box, { height: 220, layout: { background: { color: 'transparent' }, textColor: texte, fontSize: 11 }, grid: { vertLines: { color: 'rgba(143,208,227,.06)' }, horzLines: { color: 'rgba(143,208,227,.06)' } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false }, crosshair: { mode: 0 }, handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false, mouseWheel: false }, handleScale: { pinch: true, mouseWheel: false, axisPressedMouseMove: true } });
      const serie = chart.addSeries(LW.CandlestickSeries, { upColor: '#5fb894', downColor: '#d86a6a', borderVisible: false, wickUpColor: '#5fb894', wickDownColor: '#d86a6a', priceFormat: { type: 'price', precision: dec, minMove: dec ? Math.pow(10, -dec) : 1 } });
      const temps = B.map(b => tempsParis(b.t)); let p = -1; const T = temps.map(t => (t > p ? (p = t) : (p = p + 1))); serie.setData(B.map((b, i) => ({ time: T[i], open: b.o, high: b.h, low: b.l, close: b.c })));
      const ix = t => { let k = B.findIndex(b => b.t >= t - 1); return k < 0 ? B.length - 1 : k; };
      chart.timeScale().fitContent(); S.chart = chart; S.ro = new ResizeObserver(() => { if (S.chart !== chart) return; try { chart.applyOptions({ width: box.clientWidth }); } catch (e) { /* graphique déjà libéré */ } }); S.ro.observe(box);
    } catch (e) { box.innerHTML = '<p class="mf-doux">Graphique indisponible : ' + esc(e && e.message || e) + '</p>'; }
  }
  async function ficheSante(cible, n) {
    const [s, y] = await Promise.all([lireRoute('/__sante').catch(() => null), lireRoute('/__yahoo?syms=' + encodeURIComponent('DX-Y.NYB,^VIX,GLD') + '&range=2y').catch(() => null)]); if (n !== S.seq) return;
    const L = lireSante(s && s.donnees, y && y.donnees && y.donnees.cotes);
    cible.innerHTML = `<article class="mf-carte"><header><b>Santé du marché</b></header>${s ? pEtat(s) : ''}${L.length ? `<table class="mf-t"><tr><th>Indicateur</th><th>Valeur</th><th>Date</th><th>Source</th></tr>${L.map(x => `<tr><td>${esc(x.nom)}</td><td>${formatPrix(x.valeur, 2)}${x.unite ? ' ' + x.unite : ''}${x.variationPct != null ? ' <small class="' + (x.variationPct >= 0 ? 'mf-hausse' : 'mf-baisse') + '">' + (x.variationPct >= 0 ? '+' : '') + x.variationPct.toFixed(2).replace('.', ',') + ' %</small>' : ''}</td><td>${esc(x.date || '—')}</td><td>${esc(x.source)}</td></tr>`).join('')}</table>` : '<p class="mf-panne">Aucune valeur disponible pour le moment.</p>'}<p class="mf-doux">Valeurs lues à leur source (Trésor américain, Fed de New York, Yahoo Finance) ; rien n’est estimé.</p></article>`;
  }

  /* ───── Comprendre l'actualité ───── */
  async function actualite() {
    const z = zone('actualite');
    try { const r = await actualites('marches', 50), G = regrouperActus(r.items, 50);
      z.innerHTML = `${pEtat(r)}<p class="mf-doux">Les titres du moment, regroupés par thème. « Exporter pour analyse » copie un texte structuré à coller dans l’IA de ton choix (gratuit, rien n’est envoyé par l’appli).</p>${G.map(g => `<details class="mf-theme"${g === G[0] ? ' open' : ''}><summary>${esc(g.theme)} <small>(${g.items.length})</small></summary><ul class="mf-liste">${g.items.slice(0, 8).map(x => `<li><a href="${/^https?:\/\//.test(x.lien || '') ? esc(x.lien) : '#'}" target="_blank" rel="noopener noreferrer">${esc(x.titre)}</a> <small>${esc(x.source || '')}${x.date ? ' · ' + esc(new Date(x.date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : ''}</small></li>`).join('')}</ul></details>`).join('') || '<p class="mf-doux">Aucune actualité disponible.</p>'}<p><button type="button" data-export-actu>Exporter pour analyse</button> <span class="mf-doux" data-export-msg role="status"></span></p>`;
      z._items = r.items; } catch (e) { erreurSection('actualite', e); }
  }
  function exporterActu() {
    const L = (zone('actualite')._items || []).slice(0, 12), t = `Analyse demandée : explique en termes simples ce que ces titres de marché peuvent signifier pour l'or, le Nasdaq 100 et le bitcoin. Donne des scénarios CONDITIONNELS (« si… alors… »), sans probabilité chiffrée, sans taille de position, sans conseil d'achat ou de vente.\n\nTitres (source, date) :\n` + L.map(x => `- ${x.titre} (${x.source || '?'}, ${x.date ? new Date(x.date).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'date inconnue'})`).join('\n');
    const msg = $('[data-export-msg]'); (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t).then(() => { msg.textContent = 'Texte copié.'; }, () => { msg.textContent = 'Copie refusée par le navigateur.'; }) : Promise.resolve().then(() => { msg.textContent = 'Copie impossible ici.'; })); }

  /* ───── Alertes par actif (locales : valables appli ouverte) ───── */
  function alertes() {
    const z = zone('alertes'), A = lireLS(CLE_ALERTES, []);
    z.innerHTML = `<p class="mf-doux">Prévient quand un prix passe un niveau. <b>Appli ouverte seulement</b> : appli fermée, ce sont les alertes Telegram du robot (quelques minutes de retard). Bitcoin et Solana : prix en direct ; les autres : prix différés d’environ 15 minutes (affiché sur l’alerte).</p>
      <form class="mf-form" data-alerte><label>Actif <select name="actif">${ACTIFS.map(a => `<option value="${a.id}"${a.id === S.actif ? ' selected' : ''}>${esc(a.nom)}</option>`).join('')}</select></label><label>Quand le prix passe <select name="sens"><option value="dessus">au-dessus de</option><option value="dessous">sous</option></select></label><label>Niveau <input name="niveau" inputmode="decimal" required size="8"></label><button type="submit">Ajouter l’alerte</button></form><p class="mf-panne" data-erreur hidden></p>
      <ul class="mf-liste">${A.map(a => `<li class="${a.declenchee ? 'mf-fait' : ''}">${esc(a.declenchee ? texteAlerte(a, parId[a.actif] && parId[a.actif].nom) : (parId[a.actif] ? parId[a.actif].nom : a.actif) + ' ' + (a.sens === 'dessus' ? 'au-dessus de ' : 'sous ') + a.niveau)}${a.declenchee ? ' <small>' + esc(heureParis(a.declenchee)) + '</small>' : ' <small>en attente</small>'} <button type="button" data-sup-alerte="${esc(a.id)}" aria-label="Supprimer">×</button></li>`).join('') || '<li class="mf-doux">Aucune alerte.</li>'}</ul>`;
  }
  async function verifierAlertes() {
    if (S.ferme || document.hidden) return; const A = lireLS(CLE_ALERTES, []); if (!A.some(a => !a.declenchee)) return;
    try { const r = await coursRapides(), E2 = evaluerAlertes(A, r.cours); if (E2.declenchees.length) { ecrireLS(CLE_ALERTES, E2.alertes); for (const a of E2.declenchees) { const t = texteAlerte(a, parId[a.actif] && parId[a.actif].nom); try { if ('Notification' in window && Notification.permission === 'granted') { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); reg && reg.showNotification ? reg.showNotification('Alerte marché', { body: t, tag: a.id }) : new Notification('Alerte marché', { body: t }); } } catch (e) { /* */ } toast(t); } if (zone('alertes').querySelector('[data-alerte]')) alertes(); } } catch (e) { /* prochain passage */ }
  }
  const toast = t => { const d = document.createElement('div'); d.className = 'mf-toast'; d.setAttribute('role', 'alert'); d.textContent = t; el.appendChild(d); setTimeout(() => d.remove(), 12000); };
  S.alerteMinuteur = setInterval(verifierAlertes, 30000);

  /* ───── panneaux détaillés (interface Rayle Marchés existante : scénarios, analyse IA gratuite, COT, macro…) ───── */
  async function panneaux() { const z = zone('panneaux'); try { z.innerHTML = '<div class="mk-hote" data-mk></div>'; const m = await import('./marches-ui.js'); S.panneaux = m.monterMarches(z.querySelector('[data-mk]'), {}); if (S.panneaux.ouvrir) await S.panneaux.ouvrir('ensemble'); } catch (e) { erreurSection('panneaux', e); } }
  async function couverture() { const z = zone('couverture'); try { z.innerHTML = '<div data-cp></div>'; const m = await import('./couverture-ui.js'); S.couverture = m.monter(z.querySelector('[data-cp]')); } catch (e) { erreurSection('couverture', e); } }
  const CHARGEURS = { aujourdhui, actifs, actualite, alertes, panneaux, couverture };
  function charger(k, force) { if (S.charge[k] && !force) return; S.charge[k] = true; Promise.resolve().then(CHARGEURS[k]).catch(e => erreurSection(k, e)); }

  el.addEventListener('toggle', e => { const d = e.target.closest && e.target.closest('details[data-s]'); if (d && d.open) charger(d.dataset.s); }, true);
  el.addEventListener('click', e => {
    const t = e.target; let b;
    if ((b = t.closest('[data-aller]'))) { const d = $(`details[data-s="${b.dataset.aller}"]`); if (d) { d.open = true; charger(b.dataset.aller); d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
    if ((b = t.closest('[data-actif]'))) { fiche(b.dataset.actif); return; }
    if ((b = t.closest('[data-imp]'))) { ecrireLS('rayle_marches_impacts', b.dataset.imp === 'fort' ? ['fort'] : ['fort', 'moyen']); aujourdhui(); return; }
    if ((b = t.closest('[data-recharge]'))) { const k = b.dataset.recharge; k === 'fiche' ? fiche(S.actif) : charger(k, true); return; }
    if (t.closest('[data-export-actu]')) { exporterActu(); return; }
    if ((b = t.closest('[data-sup-alerte]'))) { ecrireLS(CLE_ALERTES, lireLS(CLE_ALERTES, []).filter(a => a.id !== b.dataset.supAlerte)); alertes(); }
  });
  el.addEventListener('submit', e => { const f = e.target.closest('[data-alerte]'); if (!f) return; e.preventDefault(); const d = new FormData(f), a = nouvelleAlerte(d.get('actif'), d.get('sens'), d.get('niveau')), v = validerAlerte(a), er = $('[data-erreur]'); if (v !== true) { er.hidden = false; er.textContent = v; return; } const A = lireLS(CLE_ALERTES, []); A.push(a); ecrireLS(CLE_ALERTES, A.slice(-40)); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (x) { /* */ } alertes(); verifierAlertes(); });
  charger('aujourdhui'); charger('actifs');

  function fermer() {
    if (S.ferme) return; S.ferme = true; clearInterval(S.minuteur); clearInterval(S.alerteMinuteur);
    try { if (S.ro) S.ro.disconnect(); S.ro = null; const c = S.chart; S.chart = null; if (c) c.remove(); } catch (e) { /* */ } try { arreterCalcul(); } catch (e) { /* */ } try { if (S.panneaux && S.panneaux.detruire) S.panneaux.detruire(); } catch (e) { /* */ }
    el.remove(); instance = null; try { onFermer(); } catch (e) { /* */ }
  }
  instance = { fermer, fiche, charger, etat: () => ({ actif: !S.ferme, actifCourant: S.actif, sections: Object.keys(S.charge) }) };
  return instance;
}
export function fermer() { if (instance) instance.fermer(); }
