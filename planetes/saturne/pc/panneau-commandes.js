import * as E from './entrees-calcul.js';

/* ═════════════ ÉCRANS « COMMANDES » ET « MANETTE » (DOM) ═════════════
   · Commandes : schéma clavier + manette en cours, réglages de la souris et du vol (champ de vision, échelle, inversion).
   · Manette : liste des axes en direct, affectation de chaque fonction à un axe, inversion, zone morte, sensibilité, courbe, calibrage guidé (repos puis extrêmes),
     affectation des boutons (« appuie sur le bouton… »), profil enregistré PAR manette sur l'appareil (jamais envoyé ailleurs).
   Le navigateur ne montre une manette qu'après le premier mouvement d'un axe ou l'appui sur un bouton. */
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function afficherPanneau(el, quoi, ctx) {
  clearInterval(el._timer);
  el.innerHTML = ''; el.onclick = null; el.oninput = null; el.onchange = null;
  if (quoi === 'commandes') return commandes(el, ctx);
  return manette(el, ctx);
}

function entete(titre, ctx) { return '<h2><span>' + esc(titre) + '</span><button type="button" data-f="fermer">Fermer ✕</button></h2>'; }

function commandes(el, ctx) {
  const m = ctx.manette(), profil = m ? m.profil : null;
  const lignes = E.schemaCommandes(profil);
  const g = ctx.stock.global;
  el.innerHTML = entete('Schéma des commandes', ctx)
    + '<table><thead><tr><th>FONCTION</th><th>CLAVIER</th><th>' + (profil ? 'MANETTE · ' + esc(profil.nom) : 'MANETTE') + '</th></tr></thead><tbody>' + lignes.map(l => '<tr><td>' + esc(l.fonction) + '</td><td>' + esc(l.clavier) + '</td><td>' + esc(l.manette) + '</td></tr>').join('') + '</tbody></table>'
    + '<h3>Réglages</h3>'
    + '<label>Sensibilité de la souris <input type="range" min="0.2" max="4" step="0.1" data-k="sensSouris" value="' + g.sensSouris + '"><b data-v="sensSouris">' + g.sensSouris + '</b></label>'
    + '<label>Sensibilité de la manette <input type="range" min="0.2" max="3" step="0.1" data-k="sensManette" value="' + g.sensManette + '"><b data-v="sensManette">' + g.sensManette + '</b></label>'
    + '<label>Champ de vision <input type="range" min="45" max="100" step="1" data-r="fov" value="' + ctx.reg.fov + '"><b data-v="fov">' + ctx.reg.fov + '°</b></label>'
    + '<label>Inverser le tangage de la souris <input type="checkbox" data-k="inverserTangageSouris"' + (g.inverserTangageSouris ? ' checked' : '') + '></label>'
    + '<label>Cliquer dans le ciel capture la souris (pilotage à la souris) <input type="checkbox" data-r="sourisVol"' + (ctx.reg.sourisVol ? ' checked' : '') + '></label>'
    + '<label>Assistance de vol activée au départ <input type="checkbox" data-k="assistanceDepart"' + (g.assistanceDepart ? ' checked' : '') + '></label>'
    + '<label>Échelle des vitesses <select data-r="echelle"><option value="comprimee"' + (ctx.reg.echelle === 'comprimee' ? ' selected' : '') + '>Comprimée (voyages de quelques secondes)</option><option value="reelle"' + (ctx.reg.echelle === 'reelle' ? ' selected' : '') + '>Posée (vitesses divisées par trois)</option></select></label>'
    + '<p class="s-petit">Les distances de la galaxie sont comprimées : un « km » affiché est une équivalence indicative (1 unité de la galaxie ≈ ' + Math.round(149.6e6 / 31.6 / 1e5) / 10 + ' millions de km d’après l’orbite de la Terre), pas une mesure. Clavier AZERTY : Z Q S D sont les touches W A S D ci-dessus.</p>';
  el.onclick = e => { if (e.target.closest('[data-f="fermer"]')) ctx.fermer(); };
  el.oninput = e => {
    const t = e.target, k = t.dataset.k, r = t.dataset.r, v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
    if (k) { const s = ctx.stock; s.global[k] = v; ctx.enregistrer(s); const b = el.querySelector('[data-v="' + k + '"]'); if (b) b.textContent = v; }
    if (r) { ctx.enregistrerReg({ [r]: v }); const b = el.querySelector('[data-v="' + r + '"]'); if (b) b.textContent = v + '°'; }
  };
  el.onchange = el.oninput;
}

function manette(el, ctx) {
  let enAttente = null, calib = null;
  const lire = () => ctx.manette();
  function profilEdite(m) { const s = ctx.stock; if (!s.profils[m.gp.id]) s.profils[m.gp.id] = E.validerProfil(m.profil); return s.profils[m.gp.id]; }
  function dessiner() {
    const m = lire();
    if (!m) { el.innerHTML = entete('Manette et joystick', ctx) + '<p class="s-petit">Aucune manette détectée. Branche une manette, un joystick ou un HOTAS, puis <b>bouge un axe ou appuie sur un bouton</b> : le navigateur ne la montre qu’à ce moment-là. Les profils sont enregistrés par appareil, sur cet ordinateur seulement.</p>'; return; }
    const p = profilEdite(m), n = m.gp.axes.length;
    el.innerHTML = entete('Manette et joystick', ctx)
      + '<p class="s-petit"><b>' + esc(m.gp.id) + '</b> · ' + n + ' axes · ' + m.gp.buttons.length + ' boutons · profil « ' + esc(p.nom) + ' » (' + (p.type === 'joystick' ? 'joystick / HOTAS' : 'manette standard') + ') · ' + (ctx.stock.profils[m.gp.id] ? 'enregistré' : 'par défaut') + '</p>'
      + '<p><button type="button" data-f="std">Modèle manette standard</button> <button type="button" data-f="joy">Modèle joystick / HOTAS</button> <button type="button" data-f="calibrer">Calibrer</button> <button type="button" data-f="defaut">Réinitialiser</button></p>'
      + '<div id="s-calib" class="s-petit"></div><h3>Axes</h3>' + E.FONCTIONS_AXES.map(f => {
        const c = p.axes[f];
        return '<div class="s-axe" data-fn="' + f + '"><span>' + esc(E.LIBELLES_AXES[f]) + '</span><select data-p="axe"><option value="">—</option>' + Array.from({ length: n }, (_, i) => '<option value="' + i + '"' + (c && c.axe === i ? ' selected' : '') + '>axe ' + i + '</option>').join('') + '</select>'
          + '<div class="s-jauge"><i data-j="' + f + '"></i></div><label><input type="checkbox" data-p="inv"' + (c && c.inv ? ' checked' : '') + '>inv.</label><label title="Zone morte"><input type="range" min="0" max="0.5" step="0.01" data-p="zm" value="' + (c ? c.zm : 0.12) + '" style="width:60px"></label></div>';
      }).join('')
      + '<h3>Boutons <span class="s-petit">(clique puis appuie sur le bouton voulu)</span></h3><table><tbody>' + E.ACTIONS_BOUTONS.map(b => '<tr><td>' + esc(E.LIBELLES_BOUTONS[b]) + '</td><td>' + (p.boutons[b] !== undefined ? 'bouton ' + p.boutons[b] : '—') + '</td><td><button type="button" data-b="' + b + '">' + (enAttente === b ? 'appuie…' : 'Assigner') + '</button></td></tr>').join('') + '</tbody></table>'
      + '<h3>Boutons enfoncés</h3><div id="s-voyants">' + Array.from({ length: m.gp.buttons.length }, (_, i) => '<span class="s-btnvoyant" data-i="' + i + '">' + i + '</span>').join('') + '</div>'
      + '<h3>Sensibilité globale de la manette</h3><label>Sensibilité <input type="range" min="0.2" max="3" step="0.1" data-k="sensManette" value="' + ctx.stock.global.sensManette + '"></label>';
  }
  dessiner();
  el.onclick = e => {
    if (e.target.closest('[data-f="fermer"]')) { clearInterval(el._timer); ctx.fermer(); return; }
    const m = lire(); if (!m) return;
    const p = profilEdite(m), f = e.target.closest('[data-f]'), b = e.target.closest('[data-b]');
    if (f && f.dataset.f === 'std') { const s = ctx.stock; s.profils[m.gp.id] = E.validerProfil(E.profilStandard(m.gp.id)); ctx.enregistrer(s); dessiner(); }
    else if (f && f.dataset.f === 'joy') { const s = ctx.stock; s.profils[m.gp.id] = E.validerProfil(E.profilJoystick(m.gp.id)); ctx.enregistrer(s); dessiner(); }
    else if (f && f.dataset.f === 'defaut') { const s = ctx.stock; delete s.profils[m.gp.id]; ctx.enregistrer(s); dessiner(); }
    else if (f && f.dataset.f === 'calibrer') demarrerCalibrage(m, p);
    else if (b) { enAttente = b.dataset.b; dessiner(); }
  };
  el.oninput = el.onchange = e => {
    const m = lire(); if (!m) return; const t = e.target, p = profilEdite(m), fn = t.closest('.s-axe');
    if (t.dataset.k) { const s = ctx.stock; s.global[t.dataset.k] = Number(t.value); ctx.enregistrer(s); return; }
    if (!fn) return;
    const f = fn.dataset.fn, k = t.dataset.p;
    if (k === 'axe') { if (t.value === '') delete p.axes[f]; else { const a = Number(t.value); p.axes[f] = { ...(p.axes[f] || { zm: 0.12, sens: 1, expo: 1.4, centre: 0, min: -1, max: 1, inv: false }), axe: a }; } }
    else if (p.axes[f]) { p.axes[f][k] = t.type === 'checkbox' ? t.checked : Number(t.value); }
    const s = ctx.stock; s.profils[m.gp.id] = E.validerProfil(p); ctx.enregistrer(s);
  };
  // lecture en direct : jauges d'axes, voyants de boutons, assignation d'un bouton
  el._timer = setInterval(() => {
    if (el.hidden) { clearInterval(el._timer); return; }
    const m = lire(); if (!m) return; const p = m.profil;
    for (const f of E.FONCTIONS_AXES) { const j = el.querySelector('[data-j="' + f + '"]'), c = p.axes[f]; if (!j) continue; const v = c && c.axe < m.gp.axes.length ? E.valeurAxe(m.gp.axes[c.axe], c) : 0; j.style.left = v >= 0 ? '50%' : (50 + v * 50) + '%'; j.style.width = Math.abs(v) * 50 + '%'; }
    m.gp.buttons.forEach((b, i) => { const v = el.querySelector('.s-btnvoyant[data-i="' + i + '"]'); if (v) v.classList.toggle('on', !!(b.pressed || b.value > 0.6)); });
    if (enAttente) { const i = m.gp.buttons.findIndex(b => b.pressed || b.value > 0.6); if (i >= 0) { const pe = profilEdite(m); pe.boutons[enAttente] = i; const s = ctx.stock; s.profils[m.gp.id] = E.validerProfil(pe); ctx.enregistrer(s); enAttente = null; dessiner(); } }
    if (calib) avancerCalibrage(m);
  }, 33);
  function demarrerCalibrage(m, p) { calib = { etape: 'repos', debut: performance.now(), repos: m.gp.axes.map(() => []), min: m.gp.axes.map(() => 1e9), max: m.gp.axes.map(() => -1e9), p }; const c = el.querySelector('#s-calib'); if (c) c.textContent = 'Étape 1 sur 2 : lâche tous les axes, la manette au repos (2 secondes)…'; }
  function avancerCalibrage(m) {
    const c = calib, t = (performance.now() - c.debut) / 1000, zone = el.querySelector('#s-calib');
    m.gp.axes.forEach((v, i) => { if (c.etape === 'repos') c.repos[i].push(v); else { c.min[i] = Math.min(c.min[i], v); c.max[i] = Math.max(c.max[i], v); } });
    if (c.etape === 'repos' && t > 2) { c.etape = 'extremes'; c.debut = performance.now(); if (zone) zone.textContent = 'Étape 2 sur 2 : déplace chaque axe jusqu’aux deux extrémités, plusieurs fois (6 secondes)…'; }
    else if (c.etape === 'extremes' && t > 6) {
      const pe = c.p;
      for (const [f, a] of Object.entries(pe.axes)) { if (a.axe >= m.gp.axes.length) continue; const cal = E.calibrer(c.repos[a.axe], [c.min[a.axe], c.max[a.axe]].filter(Number.isFinite)); Object.assign(a, cal); }
      const s = ctx.stock; s.profils[m.gp.id] = E.validerProfil(pe); ctx.enregistrer(s); calib = null; if (zone) zone.textContent = 'Calibrage terminé et enregistré.';
    }
  }
}
