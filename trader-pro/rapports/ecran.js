/* ═════════════ ÉCRAN DE LA VISITE GUIDÉE (v11) : barre de rapport, carte résumé, mises en avant sur les pages, historique ═════════════
   Tout est temporaire et séparé des données : les marques de Rayle vivent dans leur propre couche (`.lr-couche`, `.ra-annotations`), signée « Rayle », jamais mélangée aux dessins de Justin ; elles sont retirées à chaque changement d'étape.
   `creerEcran({ document, actions, historique, lecteur })` renvoie l'objet `ecran` attendu par moteur.js. Les mises en avant sur le graphique cherchent le graphique VISIBLE (terminal classique ou mode Volume) ; si elles n'y arrivent pas, la carte porte l'information. */
import * as H from './historique.js';

const ATT = ms => new Promise(r => setTimeout(r, ms));
const NB = /[  ]/g;
const fr = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { maximumFractionDigits: d }).replace(NB, ' ') : '—');
const el = (doc, tag, cls, txt) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

/* ───── trouver le graphique visible, cadrer, poser des marques ───── */
const cadreTerminal = doc => [...doc.querySelectorAll('iframe')].find(f => { try { return f.contentWindow && f.contentWindow.location && /or\.html/.test(f.contentWindow.location.href); } catch (e) { return false; } }) || null;
export function trouverGraphe(doc) {
  const f = cadreTerminal(doc); if (!f) return null;
  try {
    const W = f.contentWindow, visible = g => { try { const h = g.conteneur(); return !!(h && h.isConnected && h.clientWidth > 80 && h.clientHeight > 80 && W.getComputedStyle(h).visibility !== 'hidden' && h.getClientRects().length); } catch (e) { return false; } };
    const vol = W.__tpVolume && W.__tpVolume.graphe && W.__tpVolume.graphe(), cl = W.__orPro && W.__orPro.graphe && W.__orPro.graphe();
    const g = vol && visible(vol) ? vol : cl && visible(cl) ? cl : null; if (!g) return null;
    const S = g.serie(); let n = 0; try { n = S.data().length; } catch (e) { n = 0; } if (n < 20) return null;
    return { f, W, D: f.contentDocument, chart: g.chart(), serie: S, hote: g.conteneur(), n, volume: g === vol };
  } catch (e) { return null; }
}
export async function attendreGraphe(doc, ms = 45000) { const t0 = Date.now(); for (;;) { const g = trouverGraphe(doc); if (g) return g; if (Date.now() - t0 > ms) return null; await ATT(250); } }
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/* zoom et déplacement fluides vers les `barres` dernières bougies (la graduation des prix suit toute seule) */
export async function cadrer(g, { barres = 80, duree = 750 } = {}) {
  try {
    const ts = g.chart.timeScale(), n = g.serie.data().length, cible = { from: n - barres, to: n + 4 }, dep = ts.getVisibleLogicalRange(); if (!dep) { ts.setVisibleLogicalRange(cible); return true; }
    const t0 = Date.now(); for (;;) { const k = Math.min(1, (Date.now() - t0) / duree), e = ease(k); ts.setVisibleLogicalRange({ from: dep.from + (cible.from - dep.from) * e, to: dep.to + (cible.to - dep.to) * e }); if (k >= 1) break; await ATT(16); }
    return true;
  } catch (e) { return false; }
}
const CSS_COUCHE = '.lr-couche{position:absolute;inset:0;pointer-events:none;z-index:45;overflow:hidden}@keyframes lrPulse{0%,100%{opacity:.4}50%{opacity:1}}@keyframes lrPop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}'
  + '.lr-ligne{position:absolute;left:0;right:56px;height:0;border-top:2px solid #ffd166;animation:lrPulse 1s ease-in-out infinite}.lr-ligne span,.lr-b-txt{position:absolute;right:0;top:-20px;font:600 11px/1 system-ui,sans-serif;color:#10161b;background:#ffd166;padding:3px 7px;border-radius:3px;white-space:nowrap}'
  + '.lr-zone{position:absolute;left:0;right:56px;background:rgba(255,209,102,.13);border-top:1px solid rgba(255,209,102,.8);border-bottom:1px solid rgba(255,209,102,.8);animation:lrPulse 1.4s ease-in-out infinite}.lr-zone span{position:absolute;left:8px;top:2px;font:600 11px system-ui,sans-serif;color:#ffe08a;background:rgba(6,11,16,.8);padding:1px 6px}'
  + '.lr-bougie{position:absolute;border:2px solid #ffd166;border-radius:4px;box-shadow:0 0 12px rgba(255,209,102,.55);animation:lrPulse .9s ease-in-out infinite}.lr-b-txt{right:auto;left:50%;top:auto;bottom:calc(100% + 4px);transform:translateX(-50%)}';
function couche(G) {
  const D = G.D, W = G.W; if (!D.getElementById('lr-couche-css')) { const s = D.createElement('style'); s.id = 'lr-couche-css'; s.textContent = CSS_COUCHE; D.head.appendChild(s); }
  let c = G.hote.querySelector('.lr-couche'); if (c) return c; if (W.getComputedStyle(G.hote).position === 'static') G.hote.style.position = 'relative';
  c = D.createElement('div'); c.className = 'lr-couche'; c.title = 'Marques de Rayle (temporaires)'; c.__items = [];
  const boucle = () => { if (!c.isConnected) return; const ts = G.chart.timeScale(); for (const it of c.__items) { try { it.maj(ts); } catch (e) { it.el.style.display = 'none'; } } c.__raf = W.requestAnimationFrame(boucle); };
  c.__raf = W.requestAnimationFrame(boucle); G.hote.appendChild(c); return c;
}
const egal = (a, b, tol) => Math.abs(a - b) <= tol;
function indexOhlc(data, o, { h, l }) { const tol = Math.max((h - l) * 0.03, Math.abs(h) * 1e-7); for (let i = data.length - 1; i >= Math.max(0, data.length - 700); i--) { const d = data[i]; if (d && egal(d.high, h, tol) && egal(d.low, l, tol)) return i; } return -1; }
export function poser(G, m) {
  const c = couche(G), D = G.D, S = G.serie, ajouter = (div, maj) => { c.appendChild(div); c.__items.push({ el: div, maj }); return div; };
  if (m.type === 'prix') { const d = el(D, 'div', 'lr-ligne'), t = el(D, 'span', null, (m.texte || 'niveau') + ' · ' + fr(m.prix, 2)); d.appendChild(t); ajouter(d, () => { const y = S.priceToCoordinate(m.prix); if (y == null) { d.style.display = 'none'; return; } d.style.display = ''; d.style.top = y + 'px'; }); }
  else if (m.type === 'zone') { const d = el(D, 'div', 'lr-zone'); d.appendChild(el(D, 'span', null, m.texte || 'zone')); ajouter(d, () => { const y1 = S.priceToCoordinate(m.prix), y2 = S.priceToCoordinate(m.prix2); if (y1 == null || y2 == null) { d.style.display = 'none'; return; } d.style.display = ''; d.style.top = Math.min(y1, y2) + 'px'; d.style.height = Math.abs(y2 - y1) + 'px'; }); }
  else if (m.type === 'bougie') {
    const d = el(D, 'div', 'lr-bougie'); d.appendChild(el(D, 'span', 'lr-b-txt', m.texte || 'bougie')); let i0 = -1, i1 = -1;
    ajouter(d, ts => {
      const data = S.data(); if (i0 < 0) { const a = m.jours ? m.jours[0] : m, b = m.jours ? m.jours[1] : m; i0 = indexOhlc(data, a.o, a); i1 = m.jours ? indexOhlc(data, b.o, b) : i0; if (i1 < i0) i1 = i0; }
      if (i0 < 0) { d.style.display = 'none'; return; }
      const sp = (ts.options && ts.options().barSpacing) || 8, x0 = ts.timeToCoordinate(data[i0].time), x1 = ts.timeToCoordinate(data[i1].time), yh = S.priceToCoordinate(m.h), yl = S.priceToCoordinate(m.l);
      if (x0 == null || x1 == null || yh == null || yl == null) { d.style.display = 'none'; return; } d.style.display = '';
      const demi = Math.max(sp * 0.75, 9); d.style.left = (x0 - demi) + 'px'; d.style.width = Math.max(2 * demi, x1 - x0 + 2 * demi) + 'px'; d.style.top = (Math.min(yh, yl) - 6) + 'px'; d.style.height = (Math.abs(yl - yh) + 12) + 'px';
    });
  }
}
export function effacerMarques(doc) { const f = cadreTerminal(doc); if (!f) return; try { for (const c of f.contentDocument.querySelectorAll('.lr-couche')) { c.__items = []; c.innerHTML = ''; } } catch (e) { /* cadre fermé */ } }

/* ───── surbrillance d'un élément de la page + bulle explicative qui pointe vers lui ───── */
function surlignerElement(doc, sel, texte, nettoyage) {
  const cible = doc.querySelector(sel); if (!cible) return false;
  cible.classList.add('lr-surligne'); try { cible.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* */ }
  const b = el(doc, 'div', 'lr-bulle', texte || ''); b.setAttribute('role', 'note'); doc.body.appendChild(b);
  const place = () => { if (!cible.isConnected) { b.remove(); return; } const r = cible.getBoundingClientRect(), W = doc.defaultView.innerWidth, Hh = doc.defaultView.innerHeight, bw = b.offsetWidth || 160, bh = b.offsetHeight || 32, dessus = r.top > bh + 70; b.dataset.pos = dessus ? 'haut' : 'bas'; b.style.left = Math.max(8, Math.min(W - bw - 8, r.left + r.width / 2 - bw / 2)) + 'px'; b.style.top = Math.max(8, Math.min(Hh - bh - 8, dessus ? r.top - bh - 12 : r.bottom + 12)) + 'px'; };
  place(); const iv = setInterval(place, 250); nettoyage.push(() => { clearInterval(iv); cible.classList.remove('lr-surligne'); b.remove(); }); return true;
}

export function creerEcran({ document: doc = document, actions, historique = null, quota = () => null }) {
  const journal = [];   /* trace des mises en avant (pour les bancs d'essai et le diagnostic) */
  let moteur = null, barre = null, carte = null, nettoyage = [], pagePrete = null, histo = null, dernierSeg = null, marquesCourantes = null;
  const q = (r, s) => r.querySelector(s);
  function construire() {
    if (barre) return;
    barre = el(doc, 'section', 'lr-barre'); barre.id = 'lr-barre'; barre.hidden = true; barre.setAttribute('role', 'region'); barre.setAttribute('aria-label', 'Rapport guidé de Rayle');
    barre.innerHTML = '<div class="lr-prog" aria-hidden="true"></div><div class="lr-ligne1"><div class="lr-titres"><b class="lr-chap"></b><small class="lr-sous" aria-live="polite"></small></div><div class="lr-btns">'
      + '<button type="button" data-a="precedent" aria-label="Étape précédente">⏮</button><button type="button" data-a="pause" aria-label="Pause" aria-pressed="false">⏸</button><button type="button" data-a="suivant" aria-label="Étape suivante">⏭</button><button type="button" data-a="stop" aria-label="Arrêter le rapport">⏹</button>'
      + '<button type="button" data-a="detail" class="lr-txt" aria-label="Détailler cette étape">Détail</button><button type="button" data-a="graphique" class="lr-txt" aria-label="Montrer sur le graphique">Graphique</button><button type="button" data-a="vitesse" aria-label="Vitesse de lecture" class="lr-txt lr-plus">×1</button><button type="button" data-a="carte" class="lr-txt lr-plus" aria-label="Réduire ou ouvrir la carte résumé">Carte</button><button type="button" data-a="histo" class="lr-txt lr-plus" aria-label="Historique des rapports">Historique</button><button type="button" data-a="plus" class="lr-txt" aria-label="Plus d’options">⋯</button></div></div>';
    doc.body.appendChild(barre);
    try { new ResizeObserver(() => doc.documentElement.style.setProperty('--lr-h', barre.offsetHeight + 'px')).observe(barre); } catch (e) { /* sans ResizeObserver : valeur par défaut */ }
    carte = el(doc, 'aside', 'lr-carte'); carte.id = 'lr-carte'; if ((doc.defaultView && doc.defaultView.innerWidth) < 1100) carte.classList.add('reduite');   /* petit écran : la carte ne montre d'abord que sa ligne active */ carte.hidden = true; carte.setAttribute('aria-label', 'Résumé de l’étape'); doc.body.appendChild(carte);
    barre.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b || !moteur) return; const a = b.dataset.a;
      if (a === 'precedent') moteur.aller(-1); else if (a === 'suivant') moteur.aller(+1); else if (a === 'stop') moteur.arreter('stop'); else if (a === 'detail') moteur.detail(); else if (a === 'graphique') moteur.graphique();
      else if (a === 'pause') { const s = moteur.etat(); if (s && s.pause) moteur.reprendre(); else moteur.pause(); }
      else if (a === 'vitesse') { const s = moteur.etat(), VIT = [0.9, 1, 1.15, 1.3], k = s ? (VIT.indexOf(s.vitesse) + 1) % VIT.length : 1; moteur.vitesse(k - VIT.indexOf(s ? s.vitesse : 1)); }
      else if (a === 'carte') carte.classList.toggle('reduite');
      else if (a === 'plus') barre.classList.toggle('plus');
      else if (a === 'histo') ouvrirHistorique(); });
    doc.addEventListener('keydown', e => { if (!moteur || !moteur.actif() || /input|textarea|select/i.test((e.target && e.target.tagName) || '')) return; if (e.key === 'ArrowRight') moteur.aller(+1); else if (e.key === 'ArrowLeft') moteur.aller(-1); else if (e.key === ' ' && e.target === doc.body) { e.preventDefault(); const s = moteur.etat(); if (s && s.pause) moteur.reprendre(); else moteur.pause(); } });
  }
  const nettoyer = () => { for (const f of nettoyage.splice(0)) { try { f(); } catch (e) { /* */ } } effacerMarques(doc); };
  const progression = (i, n) => { const p = q(barre, '.lr-prog'); if (!p || p.children.length !== n) { p.innerHTML = ''; for (let k = 0; k < n; k++) p.appendChild(el(doc, 'i')); } [...p.children].forEach((c, k) => { c.className = k < i ? 'fait' : k === i ? 'cours' : ''; }); };
  function rendreCarte(c, donneesDu) {
    carte.innerHTML = ''; if (!c) { carte.hidden = true; return; } carte.hidden = false; carte.classList.remove('entree'); void carte.offsetWidth; carte.classList.add('entree');
    const h = el(doc, 'header'); h.appendChild(el(doc, 'b', null, c.titre || '')); if (donneesDu) h.appendChild(el(doc, 'small', null, 'données : ' + donneesDu)); carte.appendChild(h);
    if (c.grand) { const g = el(doc, 'div', 'lr-grand'); g.appendChild(el(doc, 'small', null, c.grand.label)); g.appendChild(el(doc, 'strong', null, c.grand.val)); carte.appendChild(g); }
    const ul = el(doc, 'ul'); (c.lignes || []).forEach((l, i) => { const li = el(doc, 'li', l.ton ? 'ton-' + l.ton : ''); li.dataset.i = i; if (l.label) li.appendChild(el(doc, 'span', null, l.label)); li.appendChild(el(doc, 'b', null, l.val)); ul.appendChild(li); }); carte.appendChild(ul);
  }
  function budgetTexte(b) { const s = b && b.texte ? b.texte : ''; return s + (b && b.assez === false ? ' · attention : le quota du mois ne suffit pas, la voix de secours prendra le relais' : ''); }

  const ecran = {
    lier(m) { moteur = m; },
    prep(rapport, b) { construire(); nettoyer(); barre.hidden = false; barre.classList.remove('fini'); q(barre, '.lr-chap').textContent = rapport.titre; q(barre, '.lr-sous').textContent = 'Préparation… ' + budgetTexte(b); progression(-1, rapport.nbEtapes); rendreCarte({ titre: rapport.titre, grand: { label: 'Coût estimé', val: '≈ ' + fr(rapport.estimation) + ' caractères' }, lignes: [{ label: 'Étapes', val: String(rapport.nbEtapes), ton: '' }, { label: 'Azure ce mois', val: b && b.azureUtilise != null ? fr(b.azureUtilise) + ' / ' + fr(H.QUOTA_AZURE) : 'compteur pas encore lu', ton: b && b.assez === false ? 'bas' : '' }, { label: 'Voix', val: 'une requête par étape ; le détail complet reste à l’écran', ton: '' }] }, null); try { window.scrollTo(0, 0); } catch (e) { /* */ } },
    etape(step, i, n, mode) { construire(); nettoyer(); dernierSeg = null; marquesCourantes = null; barre.hidden = false; barre.classList.remove('fini'); q(barre, '.lr-chap').textContent = (mode === 'detail' ? 'Détail · ' : '') + (step.chapitre || step.titre); q(barre, '.lr-sous').textContent = 'étape ' + Math.min(i + 1, n) + '/' + n + (step.donneesDu ? ' · données ' + step.donneesDu : '') + (step.manque ? ' · donnée manquante' : ''); progression(Math.min(i, n - 1), n); if (mode !== 'detail') rendreCarte(step.carte, step.donneesDu); else carte.classList.add('detail'); },
    segment(step, k, mode) {
      if (mode === 'detail') return; const s = step.segments[k]; if (!s) return; dernierSeg = k; journal.push({ t: Date.now(), id: step.id, k, m: (s.montrer || []).map(x => x.type) }); if (journal.length > 400) journal.shift();
      for (const li of carte.querySelectorAll('li.actif')) li.classList.remove('actif'); if (s.ligne != null) { const li = q(carte, 'li[data-i="' + s.ligne + '"]'); if (li) { li.classList.add('actif'); try { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* */ } } }
      if (s.montrer && s.montrer.length) { nettoyer(); const marques = s.montrer; marquesCourantes = marques; const encore = () => marquesCourantes === marques && !!barre && !barre.hidden; (pagePrete || Promise.resolve()).then(() => (encore() ? appliquer(marques, encore) : null)); }
    },
    async page(step) {
      const p = step.page; if (!p) return; nettoyer();
      pagePrete = (async () => {
        const args = { fenetre: p.fenetre, ...(p.actif ? { actif: p.actif } : {}), ...(p.unite ? { unite: p.unite } : {}), ...(p.mode ? { mode: p.mode } : {}), ...(p.onglet ? { onglet: p.onglet } : {}), ...(p.section ? { section: p.section } : {}) };
        await actions.executerAction('ouvrir_fenetre', args);
        if (p.fenetre === 'terminal') { const g = await attendreGraphe(doc, 50000); if (g && step.cadrage) await cadrer(g, { barres: step.cadrage.barres }); }
        else await ATT(350);
      })();
      return pagePrete;
    },
    enrichi(step, x) { if (!x || !x.ligne) return; const li = q(carte, 'li[data-i="' + x.ligne.index + '"]'); if (li) { li.innerHTML = ''; li.appendChild(el(doc, 'span', null, x.ligne.label)); li.appendChild(el(doc, 'b', null, x.ligne.val)); } },
    pause(b, externe) { if (!barre) return; const p = q(barre, '[data-a="pause"]'); p.textContent = b ? '▶' : '⏸'; p.setAttribute('aria-pressed', String(!!b)); p.setAttribute('aria-label', b ? 'Reprendre' : 'Pause'); barre.classList.toggle('en-pause', !!b); const s = q(barre, '.lr-sous'); if (b) s.dataset.avant = s.textContent, s.textContent = (externe ? 'En attente : ' : 'En pause : ') + 'dis « reprends » ou touche ▶'; else if (s.dataset.avant) { s.textContent = s.dataset.avant; delete s.dataset.avant; } },
    message(t) { if (barre) { const s = q(barre, '.lr-sous'), avant = s.dataset.msg ? s.dataset.msg : s.textContent; s.dataset.msg = avant; s.textContent = t; clearTimeout(ecran.__tm); ecran.__tm = setTimeout(() => { if (s.dataset.msg) { s.textContent = s.dataset.msg; delete s.dataset.msg; } }, 1600); } },
    async annoter(liste) { return actions.executerAction('annoter_graphique', { annotations: liste }); },
    async graphique(step) {
      nettoyer(); const f = step.focus, unite = (step.cadrage && step.cadrage.unite) || (f && f.unite === 'J' ? 'J' : 'H4'), id = step.page && step.page.actif; if (!id) return;
      const g0 = trouverGraphe(doc), dejaLa = g0 && step.page && step.page.fenetre === 'terminal';
      if (!dejaLa) await actions.executerAction('ouvrir_fenetre', { fenetre: 'terminal', actif: id, unite: unite === 'S' ? 'J' : unite, mode: 'classique' });
      const g = await attendreGraphe(doc, 50000); if (!g) return; await cadrer(g, { barres: (step.cadrage && step.cadrage.barres) || 70 });
      const marques = (step.segments || []).flatMap(s => s.montrer || []).filter(m => m.type === 'prix' || m.type === 'bougie' || m.type === 'zone').slice(0, 5); await appliquer(marques.length ? marques : (f ? [f] : []));
    },
    fin(d) {
      nettoyer(); const b = H.phraseBudget(d.caracteres, quota(), Date.now()); barre.classList.add('fini'); q(barre, '.lr-chap').textContent = 'Rapport terminé'; q(barre, '.lr-sous').textContent = fr(d.caracteres) + ' caractères lus' + (b.azureUtilise != null ? ' · Azure ce mois : ' + fr(b.azureUtilise) + ' / ' + fr(H.QUOTA_AZURE) : '') + (d.manques && d.manques.length ? ' · ' + d.manques.length + ' donnée(s) manquante(s)' : ''); progression(99, d.entree ? d.entree.etapes.length : 1);
      if (d.entree) rendreFin(d); else carte.hidden = true;
      setTimeout(() => { if (barre && barre.classList.contains('fini') && !histo) { /* la barre reste jusqu'à fermeture : le résumé et l'historique sont à portée */ } }, 0);
    },
    fermer() { nettoyer(); if (barre) barre.hidden = true; if (carte) carte.hidden = true; },
    ouvrirHistorique, journal
  };
  /* Les marques sont posées dès que la page est prête, même si elle charge encore quand la phrase arrive (la carte, le graphique) : on réessaie jusqu'à 25 s tant que ces marques sont les marques courantes. */
  async function appliquer(marques, encore = () => true) {
    const terminal = marques.filter(m => ['prix', 'bougie', 'zone'].includes(m.type)), elements = marques.filter(m => m.type === 'element');
    if (terminal.length) { const G = await attendreGraphe(doc, 25000); if (G && encore()) for (const m of terminal) { try { poser(G, m); journal.push({ t: Date.now(), pose: m.type }); } catch (e) { journal.push({ t: Date.now(), erreur: String((e && e.message) || e).slice(0, 100), pose: m.type }); /* une marque qui échoue ne gêne jamais la lecture */ } } else journal.push({ t: Date.now(), pose: 'aucun-graphe' }); }
    for (const m of elements) { const t0 = Date.now(); while (encore()) { let ok = false; try { ok = surlignerElement(doc, m.selecteur, m.texte, nettoyage); } catch (e) { ok = false; } if (ok || Date.now() - t0 > 25000) break; await ATT(300); } }
  }
  function rendreFin(d) {
    const e = d.entree; carte.hidden = false; carte.innerHTML = ''; carte.classList.remove('detail'); carte.appendChild(el(doc, 'header')).appendChild(el(doc, 'b', null, e.titre));
    const ul = el(doc, 'ul'); const L = [['Étapes lues', String(e.etapes.length)], ['Caractères lus', fr(d.caracteres)], ['Données manquantes', d.manques && d.manques.length ? d.manques.join(' · ') : 'aucune']]; if (d.comparaison && d.comparaison.disponible) L.push(['Depuis le précédent', d.comparaison.phrase]); for (const [a, b] of L) { const li = el(doc, 'li'); li.appendChild(el(doc, 'span', null, a)); li.appendChild(el(doc, 'b', null, b)); ul.appendChild(li); } carte.appendChild(ul);
    const act = el(doc, 'div', 'lr-actions'); for (const [a, t] of [['ecran', 'Rapport à l’écran'], ['pdf', 'PDF'], ['md', 'Copier'], ['histo', 'Historique'], ['ferme', 'Fermer']]) { const b = el(doc, 'button', null, t); b.type = 'button'; b.dataset.a = a; act.appendChild(b); } carte.appendChild(act);
    act.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; const a = b.dataset.a; if (a === 'ferme') ecran.fermer(); else if (a === 'histo') ouvrirHistorique(); else exporter(e, a, d.comparaison, b); });
  }
  async function exporter(e, a, comparaison, bouton) {
    if (a === 'ecran') { const t = H.versMarkdown(e, comparaison); if (window.RapportRayle) window.RapportRayle.montrer({ texte: t, question: e.titre, heure: new Date(e.date).toISOString() }); return; }
    if (a === 'md') { try { await navigator.clipboard.writeText(H.versMarkdown(e, comparaison)); if (bouton) { bouton.textContent = 'Copié ✓'; setTimeout(() => { bouton.textContent = 'Copier'; }, 1500); } } catch (x) { if (bouton) bouton.textContent = 'Copie refusée'; } return; }
    if (a === 'pdf') { const html = H.versHtml(e, comparaison), w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); } else { const u = URL.createObjectURL(new Blob([html], { type: 'text/html' })), l = doc.createElement('a'); l.href = u; l.download = 'rapport-rayle-' + new Date(e.date).toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.html'; doc.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); } }
  }
  function ouvrirHistorique() {
    construire(); if (histo) { histo.remove(); histo = null; return; }
    histo = el(doc, 'section', 'lr-histo'); histo.id = 'lr-histo'; histo.setAttribute('role', 'dialog'); histo.setAttribute('aria-label', 'Historique des rapports'); doc.body.appendChild(histo);
    const L = moteur ? moteur.historique() : [], tot = L.reduce((s, x) => s + (x.caracteres || 0), 0);
    histo.innerHTML = '<header><b>Historique des rapports</b><span>' + L.length + ' · ' + fr(tot) + ' caractères lus' + (quota() ? ' · Azure ce mois : ' + fr(quota().n) + ' / ' + fr(H.QUOTA_AZURE) : '') + '</span><button type="button" data-h="ferme" aria-label="Fermer">✕</button></header><div class="lr-h-liste"></div>';
    const liste = q(histo, '.lr-h-liste'); if (!L.length) liste.appendChild(el(doc, 'p', null, 'Aucun rapport enregistré pour le moment. Dis « Rayle, rapport complet sur l’or ».'));
    for (const e of [...L].reverse()) { const it = el(doc, 'article'); it.dataset.id = e.id; it.innerHTML = ''; const t = el(doc, 'b', null, e.titre), s = el(doc, 'small', null, new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date(e.date)) + ' · ' + fr(e.caracteres) + ' caractères'), p = el(doc, 'p', null, e.resume || ''); it.append(t, s, p);
      const bar = el(doc, 'div', 'lr-actions'); for (const [a, tt] of [['voir', 'Voir'], ['compare', 'Comparer au précédent'], ['pdf', 'PDF'], ['md', 'Copier'], ['suppr', 'Supprimer']]) { const b = el(doc, 'button', null, tt); b.type = 'button'; b.dataset.h = a; bar.appendChild(b); } it.appendChild(bar); liste.appendChild(it); }
    histo.addEventListener('click', ev => { const b = ev.target.closest('[data-h]'); if (!b) return; const a = b.dataset.h; if (a === 'ferme') { histo.remove(); histo = null; return; } const it = b.closest('article'), e = it && L.find(x => x.id === it.dataset.id); if (!e) return;
      if (a === 'suppr') { moteur.supprimer(e.id); histo.remove(); histo = null; ouvrirHistorique(); } else if (a === 'compare') { const c = moteur.comparaisonDe(e.id); let p = it.querySelector('.lr-cmp'); if (!p) { p = el(doc, 'p', 'lr-cmp'); it.insertBefore(p, it.querySelector('.lr-actions')); } p.textContent = c && c.disponible ? c.phrase : 'Pas de rapport précédent sur ce sujet à comparer.'; }
      else if (a === 'voir') exporter(e, 'ecran', moteur.comparaisonDe(e.id)); else exporter(e, a, moteur.comparaisonDe(e.id), b); });
  }
  return ecran;
}
