/* ═════════════ PANNEAU DE RÉGLAGES DE LA GALAXIE ═════════════
   Qualité, mode jeu, mesures en direct et test de performance. Lit et écrit les réglages par l'objet de la galaxie
   (galaxie.js), qui les enregistre sur l'appareil. Le mode jeu passe par le bus d'ordres : il allège toute l'application. */
const absents = new Set();
/* Si un élément manque (page HTML périmée par le cache du navigateur), on le remplace par un élément détaché : le panneau perd cette
   option mais ne casse pas la galaxie ni les ordres vocaux. */
const $ = id => {
  const e = document.getElementById(id);
  if (e) return e;
  if (!absents.has(id)) { absents.add(id); console.warn('[galaxie] élément « ' + id + ' » absent de la page : rechargez avec Ctrl+F5 (fichiers en cache périmés ?)'); }
  return document.createElement(id === 'gp-courbe' ? 'canvas' : 'div');
};
const NOMS_APPAREIL = { pc: 'PC gamer', tablette: 'tablette', telephone: 'téléphone' };
const fmt = (x, d = 0) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));
const mo = o => (o / 1048576).toFixed(0) + ' Mo';

export function creerPanneau(g) {
  const panneau = $('g-panneau');
  let minuteur = null, benchEnCours = false, derniere = null;

  const ouvert = () => !panneau.hidden;
  function ouvrir() { panneau.hidden = false; rafraichir(); mesurer(); clearInterval(minuteur); minuteur = setInterval(mesurer, 500); }
  function fermer() { panneau.hidden = true; clearInterval(minuteur); minuteur = null; }
  $('g-reglages-btn').addEventListener('click', () => (ouvert() ? fermer() : ouvrir()));
  $('g-pfermer').addEventListener('click', fermer);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && ouvert() && g.enMarche()) { fermer(); e.stopPropagation(); } }, true);

  /* ── Contrôles → réglages ── */
  const nombreOuNull = v => (v === '' ? null : Number(v));
  const liens = [
    ['gp-appareil', 'change', el => ({ appareil: el.value })],
    ['gp-echelle', 'input', el => ({ echelle: Number(el.value) })],
    ['gp-msaa', 'change', el => ({ msaa: nombreOuNull(el.value) })],
    ['gp-bloom', 'change', el => ({ bloom: el.value === '' ? null : el.value === 'oui' })],
    ['gp-densite', 'input', el => ({ densite: Number(el.value) })],
    ['gp-vitesse', 'input', el => ({ vitesse: Number(el.value) })],
    ['gp-fps', 'change', el => ({ fpsMax: nombreOuNull(el.value) })],
    ['gp-afficherfps', 'change', el => ({ afficherFps: el.checked })],
    ['gp-jeu-fps', 'change', el => ({ jeu: { fps: Number(el.value) } })],
    ['gp-jeu-echelle', 'input', el => ({ jeu: { echelle: Number(el.value) } })],
    ['gp-jeu-focus', 'change', el => ({ jeu: { pauseHorsFocus: el.checked } })],
    ['gp-jeu-tex', 'change', el => ({ jeu: { reduireTextures: el.checked } })]
  ];
  for (const [id, evt, lire] of liens) $(id).addEventListener(evt, e => { g.regler(lire(e.target)); });

  $('gp-jeu').addEventListener('click', async () => {
    const etat = g.jeu() ? 'inactif' : 'actif';
    try { if (window.RayleGalaxie) await window.RayleGalaxie.preparer(); } catch (e) {}
    if (window.RayleOrdres) await window.RayleOrdres.envoyer({ de: 'rayle', vers: 'rayle', action: 'mode_jeu', params: { etat } });
    else g.modeJeu(etat === 'actif');
    rafraichir();
  });
  $('gp-reset').addEventListener('click', () => g.reinitialiser());
  $('gp-reco').addEventListener('click', () => { if (derniere) { g.regler({ qualite: derniere.recommandation }); $('gp-banc-etat').textContent = 'Qualité « ' + derniere.recommandation + ' » appliquée.'; $('gp-reco').hidden = true; } });

  /* ── Réglages → contrôles ── */
  function rafraichir() {
    const r = g.reglages(), m = g.mesures();
    $('gp-appareil').value = r.appareil;
    $('gp-appareil-info').textContent = r.appareil === 'auto' ? '(' + (NOMS_APPAREIL[m.appareil] || m.appareil) + ')' : '';
    $('gp-echelle').value = r.echelle; $('gp-echelle-val').textContent = r.echelle + ' %';
    $('gp-msaa').value = r.msaa === null ? '' : String(r.msaa);
    $('gp-bloom').value = r.bloom === null ? '' : r.bloom ? 'oui' : 'non';
    $('gp-densite').value = r.densite; $('gp-densite-val').textContent = r.densite + ' %';
    $('gp-vitesse').value = r.vitesse; $('gp-vitesse-val').textContent = r.vitesse + ' %';
    $('gp-fps').value = r.fpsMax === null ? '' : String(r.fpsMax);
    $('gp-afficherfps').checked = r.afficherFps;
    $('fps').style.visibility = r.afficherFps ? 'visible' : 'hidden';
    $('gp-jeu-fps').value = String(r.jeu.fps);
    $('gp-jeu-echelle').value = r.jeu.echelle; $('gp-jeu-echelle-val').textContent = r.jeu.echelle + ' %';
    $('gp-jeu-focus').checked = r.jeu.pauseHorsFocus; $('gp-jeu-tex').checked = r.jeu.reduireTextures;
    $('gp-jeu').textContent = g.jeu() ? 'Désactiver le mode jeu' : 'Activer le mode jeu';
    $('gp-jeu-etat').textContent = g.jeu() ? '(actif)' : '';
    $('gp-banc').disabled = benchEnCours || g.jeu();
    $('gp-banc').title = g.jeu() ? 'Désactive le mode jeu pour mesurer' : '';
  }
  g.surChangement(() => { if (ouvert()) rafraichir(); });

  /* ── Mesures en direct ── */
  const courbe = $('gp-courbe').getContext('2d');
  function tracer() {
    const d = g.courbe(), W = 320, H = 56;
    courbe.clearRect(0, 0, W, H);
    courbe.strokeStyle = 'rgba(255,0,127,.25)'; courbe.lineWidth = 1;
    for (const ms of [16.7, 33.3]) { const y = H - Math.min(1, ms / 50) * H; courbe.beginPath(); courbe.moveTo(0, y); courbe.lineTo(W, y); courbe.stroke(); }   // repères 60 et 30 images/s
    if (d.length < 2) return;
    courbe.strokeStyle = '#4de3ff'; courbe.lineWidth = 1.2; courbe.beginPath();
    d.forEach((ms, i) => { const x = i / (d.length - 1) * W, y = H - Math.min(1, ms / 50) * H; i ? courbe.lineTo(x, y) : courbe.moveTo(x, y); });
    courbe.stroke();
  }
  function mesurer() {
    if (!ouvert()) return;
    const m = g.mesures();
    const lignes = [
      ['Images par seconde', fmt(m.fps) + (m.limite ? ' (limite ' + m.limite + ')' : '')],
      ['Pire 1 % / plus lente', fmt(m.pire1) + ' / ' + fmt(m.min) + ' i/s'],
      ['Durée d’une image', fmt(m.ms, 1) + ' ms' + (m.pics ? ' · ' + m.pics + ' pics' : '')],
      ['Coût du rendu (processeur)', fmt(m.cpuMs, 1) + ' ms'],
      ['Coût du rendu (carte graphique)', m.gpuMesurable ? fmt(m.gpuMs, 1) + ' ms' : 'non mesurable ici'],
      ['Résolution / niveau', fmt(m.dpr, 2) + '× · ' + (m.jeu ? 'mode jeu' : m.niveau)],
      ['Appels de dessin / triangles', m.appels + ' / ' + (m.triangles / 1000).toFixed(0) + ' k'],
      ['Textures (estimation mémoire vidéo)', m.texturesGpu + ' · ' + mo(m.memoireTextures)]
    ];
    $('gp-mesures').replaceChildren(...lignes.flatMap(([a, b]) => { const x = document.createElement('span'), y = document.createElement('span'); x.textContent = a; y.textContent = b; return [x, y]; }));
    tracer();
  }

  /* ── Test de performance ── */
  function afficherResultat(r) {
    derniere = r;
    const t = document.createElement('table');
    t.innerHTML = '<tr><th>Niveau</th><th>Moyenne</th><th>Pire 1 %</th><th>Rendu (ms)</th></tr>';
    for (const x of r.resultats) {
      const tr = document.createElement('tr'); if (x.niveau === r.recommandation) tr.className = 'reco';
      tr.innerHTML = '<td></td><td></td><td></td><td></td>';
      tr.children[0].textContent = x.niveau + (x.niveau === r.recommandation ? ' ✔' : '');
      tr.children[1].textContent = fmt(x.moyenne) + ' i/s'; tr.children[2].textContent = fmt(x.pire1) + ' i/s';
      tr.children[3].textContent = fmt(x.cpuMs, 1) + (x.gpuMs ? ' + ' + fmt(x.gpuMs, 1) + ' GPU' : '');
      t.appendChild(tr);
    }
    $('gp-banc-res').replaceChildren(t);
    $('gp-banc-etat').textContent = 'Recommandé : qualité ' + r.recommandation + '.';
    $('gp-reco').hidden = false;
  }
  $('gp-banc').addEventListener('click', async () => {
    if (benchEnCours) return;
    benchEnCours = true; rafraichir(); $('gp-reco').hidden = true; $('gp-banc-res').replaceChildren();
    const r = await g.banc((texte, avance) => { $('gp-banc-etat').textContent = texte + ' (' + Math.round(avance * 100) + ' %)'; });
    benchEnCours = false;
    if (r.ok) afficherResultat(r); else $('gp-banc-etat').textContent = r.erreur;
    rafraichir();
  });
  if (g.dernierBanc) afficherResultat(g.dernierBanc);

  const api = { ouvrir, fermer, ouvert, afficherResultat };
  g.panneau = api;
  rafraichir();
  return api;
}
