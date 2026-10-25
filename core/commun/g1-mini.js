"use strict";
/* ═════════════ ACCUEIL AURORE : PETITES FENÊTRES EN HAUT À DROITE (R2, phase 5) ═════════════
   Trois petites fenêtres compactes, discrètes, retrouvées : MÉTÉO (ville choisie, température, mini-courbe, « Utiliser ma position »), LOCALISATION (le lieu choisi, coordonnées,
   lever et coucher du soleil, heure locale) et MARCHÉ (graphique en bougies tournant : BTC, SOL, DOGE, or, US100 ; M15, H1, H4, D ; pause au survol ou au toucher ; étiquette
   RÉEL / DIFFÉRÉ ; « données indisponibles » sinon). Gérées par le gestionnaire de fenêtres COMMUN (core/commun/gestionnaire-fenetres.js) : déplaçables à la souris ou au doigt,
   agrandissables en grande fenêtre, réductibles, fermables (puces « + Météo » pour les rouvrir), position et taille mémorisées. Même données que la grande fenêtre : rien d'inventé.
   Visibles seulement sur l'accueil Aurore. Sur téléphone (< 700 px) elles démarrent fermées. */
(function () {
  const G = window.G1, C = window.G1Contenu; if (!G || !C || window.RAYLE_SATELLITE) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lire = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage refusé */ } };
  const base = p => new URL(p, document.baseURI).href;
  const CLE = 'rayle_g1_mini';
  const DEFS = [
    { id: 'meteo', nom: 'Météo', l: 300, h: 250 },
    { id: 'position', nom: 'Localisation', l: 300, h: 210 },
    { id: 'marche', nom: 'Marché', l: 400, h: 310 }
  ];
  const etroit = () => window.innerWidth < 700;
  function etatOuverts() {
    try { const j = JSON.parse(lire(CLE) || 'null'); if (j && typeof j === 'object') return Object.fromEntries(DEFS.map(d => [d.id, j[d.id] !== false && j[d.id] !== 0])); } catch (e) { /* valeur corrompue */ }
    return Object.fromEntries(DEFS.map(d => [d.id, !etroit()]));
  }
  let ouverts = etatOuverts(), gf = null, ctrlGraph = null, demontage = false, ES = null, charge = null, visibleAvant = false;
  const sauver = () => ecrire(CLE, JSON.stringify(ouverts));

  /* ── hôte et puces de réouverture ── */
  const hote = document.createElement('div'); hote.id = 'g1Mini'; hote.className = 'gm-hote'; hote.hidden = true; document.body.appendChild(hote);
  const puces = document.createElement('div'); puces.className = 'gm-puces'; puces.id = 'g1MiniPuces'; puces.hidden = true; document.body.appendChild(puces);
  puces.addEventListener('click', e => { const b = e.target.closest('[data-ouvre]'); if (!b) return; ouvrir(b.dataset.ouvre); });
  function majPuces() {
    const fermes = DEFS.filter(d => !ouverts[d.id]);
    puces.innerHTML = fermes.map(d => '<button type="button" data-ouvre="' + d.id + '">+ ' + d.nom + '</button>').join('');
    puces.hidden = !fermes.length || hote.hidden;
  }

  /* ── contenus ── */
  const nb = (v, d = 0) => (v == null || !Number.isFinite(+v) ? '—' : (+v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  function formulaireVille(corps) {
    const f = document.createElement('div'); f.className = 'gm-actions';
    f.innerHTML = '<form class="gm-form"><input type="search" placeholder="Choisir une ville…" aria-label="Ville" autocomplete="off"><button type="submit">OK</button></form><button type="button" class="gm-pos">Utiliser ma position</button><div class="gm-res" role="status"></div>';
    const res = f.querySelector('.gm-res');
    f.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); const q = f.querySelector('input').value.trim(); if (q.length < 2) { res.textContent = 'Tape au moins deux lettres.'; return; }
      res.textContent = 'Recherche…';
      try { const l = await G.rechercherVilleMini(q); res.innerHTML = l.length ? l.map(v => '<button type="button" data-lat="' + v.lat + '" data-lon="' + v.lon + '" data-nom="' + esc(v.nom) + '">' + esc(v.nom) + '</button>').join('') : 'Aucun résultat.'; }
      catch (err) { res.textContent = 'INDISPONIBLE : ' + String((err && err.message) || err).slice(0, 60); }
    });
    res.addEventListener('click', e => { const b = e.target.closest('button[data-lat]'); if (!b) return; G.choisirVille(b.dataset.nom, +b.dataset.lat, +b.dataset.lon); res.textContent = 'Ville choisie : ' + b.dataset.nom; });
    f.querySelector('.gm-pos').addEventListener('click', () => G.utiliserPosition(m => { res.textContent = m; }));
    corps.appendChild(f); return f;
  }
  function fenetreMeteo() {
    const racine = document.createElement('div'); racine.className = 'gm-meteo'; const donnees = document.createElement('div'); donnees.className = 'gm-donnees'; racine.appendChild(donnees);
    function maj() {
      const m = G.meteo(); let h;
      if (!m) h = '<p class="gm-vide">Lecture de la météo…</p>';
      else if (m.etat === 'aucune') h = '<p class="gm-vide">Aucune ville choisie : cherche une ville ou utilise ta position.</p>';
      else if (m.etat !== 'ok') h = '<p class="gm-vide gm-ko">INDISPONIBLE : ' + esc(m.raison) + '</p>';
      else {
        const x = m.m, j = C.courbeJour(x.heures, 240, 46, 4);
        h = '<div class="gm-tete"><b>' + esc(m.nom) + '</b><em data-etat="reel">RÉEL</em></div><div class="gm-ligne"><span class="gm-temp">' + nb(x.temp) + '°</span><span class="gm-sous">ressenti ' + nb(x.ressenti) + '° · ' + nb(x.min) + '° – ' + nb(x.max) + '°<br>pluie ' + nb(x.pluie) + ' % · vent ' + nb(x.vent) + ' km/h</span></div>'
          + (j ? '<svg class="gm-courbe" viewBox="0 0 240 46" preserveAspectRatio="none" aria-label="Température de la journée"><path d="' + j.aire + '" fill="rgba(255,90,165,.16)"/><path d="' + j.d + '" fill="none" stroke="#ff8fc4" stroke-width="1.6"/>' + (j.maintenant != null ? '<line x1="' + j.maintenant + '" x2="' + j.maintenant + '" y1="0" y2="46" stroke="#fff" stroke-opacity=".5" stroke-dasharray="2 3"/>' : '') + '</svg>' : '');
      }
      if (donnees.dataset.sig !== h) { donnees.dataset.sig = h; donnees.innerHTML = h; }
    }
    formulaireVille(racine); maj(); return { racine, maj };
  }
  function fenetrePosition() {
    const racine = document.createElement('div'); racine.className = 'gm-position'; const donnees = document.createElement('div'); donnees.className = 'gm-donnees'; racine.appendChild(donnees);
    function maj() {
      const l = G.lieu(), m = G.meteo(); let h;
      if (l.lat == null) h = '<p class="gm-vide">Aucun lieu choisi. Choisis une ville ou utilise ta position (demandée seulement au clic).</p>';
      else {
        const x = m && m.etat === 'ok' ? m.m : null, fuseau = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return '—'; } })();
        h = '<div class="gm-tete"><b>' + esc(l.nom || 'Ma position') + '</b><em data-etat="reel">CHOISI</em></div><dl class="gm-dl"><dt>Latitude</dt><dd>' + nb(l.lat, 3) + '°</dd><dt>Longitude</dt><dd>' + nb(l.lon, 3) + '°</dd><dt>Fuseau</dt><dd>' + esc(fuseau) + '</dd><dt>Heure locale</dt><dd>' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</dd>' + (x ? '<dt>Soleil</dt><dd>↑ ' + esc(x.lever || '—') + ' · ↓ ' + esc(x.coucher || '—') + '</dd>' : '') + '</dl><p class="gm-note">Le lieu est celui de la météo ; rien n’est suivi en continu.</p>';
      }
      if (donnees.dataset.sig !== h) { donnees.dataset.sig = h; donnees.innerHTML = h; }
    }
    const b = document.createElement('div'); b.className = 'gm-actions'; b.innerHTML = '<button type="button" class="gm-pos">Utiliser ma position</button><button type="button" class="gm-terre">Voir sur la Terre</button><div class="gm-res" role="status"></div>';
    b.querySelector('.gm-pos').addEventListener('click', () => G.utiliserPosition(m => { b.querySelector('.gm-res').textContent = m; }));
    b.querySelector('.gm-terre').addEventListener('click', () => { try { G.allerPlanete('terre'); } catch (e) { b.querySelector('.gm-res').textContent = 'Terre indisponible.'; } });
    racine.appendChild(b); maj(); return { racine, maj };
  }
  function fenetreMarche() {
    const racine = document.createElement('div'); racine.className = 'gm-marche'; racine.dataset.pasPincer = '1';
    if (window.GraphiqueBougies) ctrlGraph = window.GraphiqueBougies.monter(racine, { leger: G.modeLeger() });
    else racine.innerHTML = '<p class="gm-vide gm-ko">Graphique indisponible.</p>';
    return { racine, maj() {} };
  }
  const CONTENUS = { meteo: fenetreMeteo, position: fenetrePosition, marche: fenetreMarche };
  const contenus = new Map();

  /* ── cycle de vie ── */
  async function preparer() {
    if (charge) return charge;
    charge = Promise.all([import(base('core/commun/gestionnaire-fenetres.js')), import(base('core/commun/fenetres-calcul.js'))]).then(([GF, FC]) => { GF.chargerStyle(); ES = { GF, FC }; return ES; }).catch(e => { charge = null; throw e; });
    return charge;
  }
  function creerGf() {
    const calc = ES.FC.creerCalcul({ marge: 8, haut: 48, bas: 110, miniL: 240, miniH: 130, seuilEtroit: 0, tailles: { petite: [0.2, 0.3] }, plafond: { petite: [440, 360] } });
    gf = ES.GF.creerGestionnaire({ ui: hote, prefixe: 'gf', calc, cle: 'accueil', idRacine: 'g1MiniRacine', barreVisible: false, classeSupp: 'gf-compact', vue: 'Accueil' });
    gf.enregistrerTiroir({ vue: 'Accueil', entrees: () => DEFS.map(d => ({ id: 'mini-' + d.id, titre: d.nom, dossier: 'Petites fenêtres', icone: d.id === 'meteo' ? '⛅' : d.id === 'position' ? '📍' : '📈', posee: !!gf.obtenir('mini-' + d.id), afficher: () => ouvrir(d.id) })) });   // R3 : tiroir global
    gf.barre.hidden = true; gf.barre.style.display = 'none';
  }
  function ouvrirFenetre(def, i) {
    if (!gf || gf.obtenir('mini-' + def.id)) return;
    const c = CONTENUS[def.id](); contenus.set(def.id, c);
    const W = window.innerWidth, y = 56 + DEFS.slice(0, i).reduce((s, d) => s + d.h + 8, 0);
    const w = gf.ouvrir({ id: 'mini-' + def.id, titre: def.nom, genre: 'petite', contenu: c.racine, taille: { l: Math.min(def.l, W - 16), h: def.h }, position: { x: Math.max(8, W - 12 - def.l), y }, pastille: 'reel',
      sur: { fermer: () => { contenus.delete(def.id); if (def.id === 'marche' && ctrlGraph) { try { ctrlGraph.detruire(); } catch (e) { /* déjà détruit */ } ctrlGraph = null; } if (!demontage) { ouverts[def.id] = false; sauver(); majPuces(); } } } });
    w.el.classList.add('gm-fen'); w.corps.classList.add('gm-corps'); if (def.id === 'marche') w.corps.classList.add('gf-sans-marge');
  }
  async function ouvrir(id) {
    const i = DEFS.findIndex(d => d.id === id); if (i < 0) return false;
    ouverts[id] = true; sauver(); try { await preparer(); } catch (e) { return false; }
    if (!gf) creerGf(); hote.hidden = false; ouvrirFenetre(DEFS[i], i); majPuces(); return true;
  }
  function demonter() {
    if (!gf) return; demontage = true; try { gf.dispose(); } catch (e) { /* déjà détruit */ } gf = null; contenus.clear(); ctrlGraph = null; demontage = false;
  }
  async function appliquer() {
    const vis = G.theme() === 'aurore' && G.surAccueil();
    if (vis && !visibleAvant) {
      visibleAvant = true; hote.hidden = false; document.body.classList.add('g1-mini');
      try { await preparer(); } catch (e) { return; }
      if (!visibleAvant) return;
      if (!gf) creerGf(); DEFS.forEach((d, i) => { if (ouverts[d.id]) ouvrirFenetre(d, i); }); majPuces();
    } else if (!vis && visibleAvant) {
      visibleAvant = false; hote.hidden = true; puces.hidden = true; document.body.classList.remove('g1-mini'); demonter();
    }
  }
  G.surMeteo(() => { for (const c of contenus.values()) c.maj(); });
  setInterval(() => { for (const [id, c] of contenus) if (id === 'position') c.maj(); }, 30000);
  setInterval(appliquer, 700);
  document.addEventListener('visibilitychange', appliquer);
  window.G1Mini = { ouvrir, fermer: id => { if (gf) gf.fermer('mini-' + id); }, ouverts: () => ({ ...ouverts }), gestionnaire: () => gf, graphique: () => ctrlGraph, visible: () => visibleAvant, oublier: () => { try { localStorage.removeItem(CLE); localStorage.removeItem('rayle_fenetres_accueil'); } catch (e) { /* rien */ } } };
  appliquer();
})();
