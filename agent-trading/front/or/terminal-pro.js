/* ═════════════ TERMINAL PRO : mise en page, modes préréglés, barre d'outils de dessin, panneau droit repliable ═════════════
   Barre du haut (actif, timeframes : l'en-tête existant), barre d'outils à gauche (curseur, ligne horizontale, droite, rayon, zone, tendance, Fibonacci, texte, mesure, gomme, aimant), panneau droit (carnet, feuille de décision,
   grosses transactions) FERMÉ par défaut, une seule ligne de contexte en bas. Modes : « Pro épuré » (par défaut), « ICT », « Flux » ; le choix est mémorisé. Aucun ordre n'est envoyé. */
const CLE_MODE = 'rayle_or_mode_pro', CLE_ANN = 'rayle_or_annotations';
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
export const MODES = Object.freeze({
  pro: { nom: 'Pro épuré', couches: ['rayMa', 'rayGolden', 'rayNiveaux'], panneau: false },
  ict: { nom: 'ICT', couches: ['rayMa', 'rayGolden', 'rayNiveaux', 'structure', 'ictLiquidite', 'ictStructure', 'ictFvg', 'ictOb', 'ictPd', 'ictTemps'], panneau: false },
  flux: { nom: 'Flux', couches: ['rayMa', 'rayNiveaux', 'vwap', 'profil', 'cvd', 'carteCarnet', 'seances'], panneau: true }
});
const OUTILS = [['curseur', '⌖', 'Curseur'], ['horizontale', '─', 'Ligne horizontale'], ['tendance', '╱', 'Droite (ligne de tendance)'], ['rayon', '↗', 'Rayon'], ['zone', '▭', 'Zone rectangulaire'], ['fib', 'F', 'Fibonacci (2 clics)'], ['texte', 'T', 'Texte (1 clic)'], ['mesure', '↔', 'Mesure (2 clics)'], ['gomme', '⌫', 'Gomme (supprime l’objet touché)'], ['aimant', '🧲', 'Aimant (aligne sur les extrêmes)']];
const nb = (x, d = 2) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
export function creerTerminalPro({ racine, graph, strategie, parler = () => {}, maintenant = () => Date.now() } = {}) {
  /* Mise en page classique (ancien terminal) : ?pro=0, ou un navigateur piloté par un test sans ?pro=1 (les anciens tests Chrome vérifient l'ancienne mise en page). Un utilisateur normal a le terminal pro. */
  const arg = new URLSearchParams(location.search).get('pro'); if (arg === '0' || (navigator.webdriver && arg !== '1')) return null;
  const E = { mode: lire(CLE_MODE, 'pro'), droite: false, outil: 'curseur', ann: lire(CLE_ANN, []), brouillon: null, mesure: null };
  if (!MODES[E.mode]) E.mode = 'pro'; const q = s => racine.querySelector(s); racine.dataset.pro = '1';
  const gr = q('.tor-graph'), lw = q('.tor-graph-lw'); if (!gr || !lw) return null;
  /* ── ligne du haut : mode, analyses, panneau droit, copilote ── */
  const haut = document.createElement('div'); haut.className = 'tp-haut'; haut.innerHTML = `<label>Mode <select data-tp-mode>${Object.entries(MODES).map(([k, m]) => `<option value="${k}">${m.nom}</option>`).join('')}</select></label>
    <details class="tp-menu"><summary>Analyses ▾</summary><div class="tp-menu-corps">${[['ray-scen', 'Scénarios'], ['positions-rayle', 'Positions de Rayle'], ['propositions-h1', 'Propositions H1'], ['mouv-h1', 'Mouvements H1'], ['ict-un-clic', 'Analyse ICT'], ['pourquoi', 'Pourquoi l’or bouge ?']].map(([a, n]) => `<button type="button" data-tp-act="${a}">${n}</button>`).join('')}</div></details>
    <details class="tp-menu"><summary>Couches ▾</summary><div class="tp-menu-corps" data-tp-couches></div></details>
    <button type="button" data-tp-droite aria-pressed="false">Panneau droit ⇥</button><button type="button" data-tp-copilote>Rayle ✦</button><small class="tp-doux">alertes actives tant que le terminal est ouvert</small>`;
  gr.insertBefore(haut, lw);
  /* menu Couches : le menu existant est déplacé ici (mêmes cases, mêmes gestionnaires) */
  const det = q('.tor-couches'); if (det) { det.open = true; haut.querySelector('[data-tp-couches]').appendChild(det.querySelector('.tor-couches-corps')); }
  /* ── barre d'outils à gauche ── */
  const bar = document.createElement('div'); bar.className = 'tp-outils'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Outils de dessin');
  bar.innerHTML = OUTILS.map(([k, g, t]) => `<button type="button" data-tp-outil="${k}" title="${t}" aria-label="${t}" aria-pressed="${k === 'curseur'}">${g}</button>`).join(''); gr.appendChild(bar);
  const cliquerLegacy = type => { const b = racine.querySelector(`[data-outil="${type}"]`); if (b) b.click(); };
  function choisir(k) { 
    if (k === 'aimant') { const a = racine.querySelector('[data-o="aimant"]'); if (a) a.click(); const on = graph.aimant(); bar.querySelector('[data-tp-outil="aimant"]').setAttribute('aria-pressed', String(!!on)); return; }
    if (['horizontale', 'tendance', 'rayon', 'zone'].includes(k)) { if (graph.etat().modeOutil !== k) cliquerLegacy(k); } else if (graph.etat().modeOutil) { cliquerLegacy(graph.etat().modeOutil); }   // un outil existant se désactive en recliquant dessus
    E.outil = k; try { graph.etat().outilPro = ['fib', 'texte', 'mesure', 'gomme'].includes(k); } catch (e) { /* */ } E.brouillon = null; for (const b of bar.querySelectorAll('[data-tp-outil]')) if (b.dataset.tpOutil !== 'aimant') b.setAttribute('aria-pressed', String(b.dataset.tpOutil === k));
  }
  /* ── annotations (Fibonacci, texte, mesure) : clics sur le graphique ── */
  const id = () => 'a' + maintenant().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
  const pousser = () => strategie.annotations([...E.ann, ...(E.mesure ? [E.mesure] : [])]);
  function point(p) { const t = graph.tDeX(p.x), prix = graph.serie().coordinateToPrice(p.y); return t != null && prix != null ? { t, p: prix } : null; }
  function surClic(param) {
    if (!param || !param.point) return; const pt = point(param.point); if (!pt) return;
    if (E.outil === 'fib') { if (!E.brouillon) { E.brouillon = pt; return; } E.ann.push({ id: id(), type: 'fib', t1: E.brouillon.t, p1: E.brouillon.p, t2: pt.t, p2: pt.p }); E.brouillon = null; ecrire(CLE_ANN, E.ann); choisir('curseur'); pousser(); }
    else if (E.outil === 'texte') { let t = 'Note'; try { const r = window.prompt('Texte à poser sur le graphique', 'Note'); if (r === null) return; t = String(r).slice(0, 40) || 'Note'; } catch (e) { /* */ } E.ann.push({ id: id(), type: 'texte', t: pt.t, p: pt.p, texte: t }); ecrire(CLE_ANN, E.ann); choisir('curseur'); pousser(); }
    else if (E.outil === 'mesure') { if (!E.brouillon) { E.brouillon = pt; E.mesure = null; return; } const a = E.brouillon, atr = strategie.interne().atr || null, per = Math.abs(pt.t - a.t) / 3600e3, d = pt.p - a.p; E.mesure = { id: 'mesure', type: 'mesure', t1: a.t, p1: a.p, t2: pt.t, p2: pt.p, libelle: `${d >= 0 ? '+' : '−'}${nb(Math.abs(d))} $ · ${atr ? nb(Math.abs(d) / atr, 1) + ' ATR · ' : ''}${Math.round(per)} h` }; E.brouillon = null; pousser(); choisir('curseur'); }
    else if (E.outil === 'gomme') { if (!supprimerProche(param.point)) { const s = racine.querySelector('[data-mo-edition] [data-a="supprimer"], [data-mo-edition] button[data-a*="suppr"]'); if (s) s.click(); } }
  }
  function supprimerProche(pt) { let m = null, d = Infinity; for (const a of E.ann) { const y = graph.serie().priceToCoordinate(a.type === 'fib' ? (a.p1 + a.p2) / 2 : a.p), x = graph.xDeT(a.type === 'fib' ? Math.min(a.t1, a.t2) : a.t); if (y == null || x == null) continue; const dd = Math.hypot((pt.x - x) / 3, pt.y - y); if (dd < d) { d = dd; m = a; } } if (m && d < 60) { E.ann = E.ann.filter(a => a !== m); ecrire(CLE_ANN, E.ann); pousser(); return true; } return false; }
  /* clics : événements du pointeur (comme les outils existants : le clic de la bibliothèque n'est pas fiable pendant un dessin) */
  let bas = null; lw.addEventListener('pointerdown', ev => { bas = { x: ev.clientX, y: ev.clientY }; }, true);
  lw.addEventListener('pointerup', ev => { if (!bas || !['fib', 'texte', 'mesure', 'gomme'].includes(E.outil)) { bas = null; return; } const d = Math.hypot(ev.clientX - bas.x, ev.clientY - bas.y); bas = null; if (d > 5) return; const r = lw.getBoundingClientRect(); surClic({ point: { x: ev.clientX - r.left, y: ev.clientY - r.top } }); }, true);
  /* ── modes ── */
  function appliquerMode(k, { memoriser = true } = {}) {
    const M = MODES[k]; if (!M) return; E.mode = k; const tout = Object.keys(graph.couches()), cibles = new Set(M.couches), etat = {}; for (const c of tout) etat[c] = cibles.has(c); graph.couches(etat);
    for (const c of racine.querySelectorAll('[data-couche]')) c.checked = !!etat[c.dataset.couche];
    for (const cle of ['vwap', 'structure', 'rsi', 'ictLiquidite', 'rayMa']) { const c = racine.querySelector(`[data-couche="${cle}"]`); if (c) c.dispatchEvent(new Event('change', { bubbles: true })); }
    droite(M.panneau); haut.querySelector('[data-tp-mode]').value = k; if (memoriser) ecrire(CLE_MODE, k); try { strategie.maj(true); } catch (e) { /* */ }
  }
  function droite(on) { E.droite = on == null ? !E.droite : !!on; racine.classList.toggle('tp-droite', E.droite); haut.querySelector('[data-tp-droite]').setAttribute('aria-pressed', String(E.droite)); try { window.dispatchEvent(new Event('resize')); } catch (e) { /* */ } }
  haut.addEventListener('change', ev => { if (ev.target.matches('[data-tp-mode]')) appliquerMode(ev.target.value); });
  haut.addEventListener('click', ev => { const a = ev.target.closest('[data-tp-act]'); if (a) { const b = racine.querySelector(`[data-a="${a.dataset.tpAct}"]`); if (b) b.click(); const d = a.closest('details'); if (d) d.open = false; return; } if (ev.target.closest('[data-tp-droite]')) droite(); else if (ev.target.closest('[data-tp-copilote]')) { window.dispatchEvent(new CustomEvent('rayle:copilote', { detail: { ouvrir: true } })); } });
  bar.addEventListener('click', ev => { const b = ev.target.closest('[data-tp-outil]'); if (b) choisir(b.dataset.tpOutil); });
  strategie.annotations(E.ann); appliquerMode(E.mode, { memoriser: false });
  function commande(texte) {
    const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim(), m = n.match(/\bmode (pro|ict|flux)\b/);
    if (m) { appliquerMode(m[1]); return `Mode ${MODES[m[1]].nom}.`; }
    if (/\b(ouvre|affiche|montre)\b.*\bpanneau droit\b|\bcarnet\b.*\bouvre\b/.test(n)) { droite(true); return 'Panneau droit ouvert : carnet d’ordres, feuille de décision et grosses transactions.'; }
    if (/\b(ferme|masque|cache)\b.*\bpanneau droit\b/.test(n)) { droite(false); return 'Panneau droit fermé.'; }
    if (/\bniveaux majeurs\b/.test(n)) { const m2 = strategie.modele(); const L = (m2 && m2.niveaux) || []; if (!L.length) { graph.couches({ rayNiveaux: true }); try { strategie.maj(true); } catch (e) { /* */ } const m3 = strategie.modele(); const L3 = (m3 && m3.niveaux) || []; return L3.length ? 'Niveaux majeurs affichés : ' + L3.map(x => x.etiquette).join(', ') + '. Un niveau est une zone de réaction possible, jamais une promesse.' : 'Je n’ai pas encore assez de bougies pour les niveaux majeurs.'; } return 'Niveaux majeurs : ' + L.map(x => x.etiquette).join(', ') + '. Un niveau est une zone de réaction possible, jamais une promesse.'; }
    return null;
  }
  return { appliquerMode, droite, choisir, commande, mode: () => E.mode, annotations: () => E.ann.slice(), outil: () => E.outil, effacerAnnotations() { E.ann = []; ecrire(CLE_ANN, E.ann); pousser(); }, etat: () => ({ mode: E.mode, droite: E.droite, outil: E.outil }) };
}
