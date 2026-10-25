/* Panneau de commande de l'anatomie (salle médicale), colonne de gauche : couches (squelette seul par défaut), recherche, affichage (isoler, tout afficher, transparence, coupe, noms),
   mouvements et pathologies (catalogues dans des fenêtres), crédits visibles. Texte 14 px au moins ; défilement INTERNE : rien ne déborde de l'écran (A3). */
const SYSTEMES = [['os', 'Squelette'], ['conjonctif', 'Ligaments'], ['muscles', 'Muscles'], ['arteres', 'Artères'], ['veines', 'Veines'], ['nerfs', 'Nerfs crâniens'], ['nerfs-periph', 'Nerfs membres (schéma)'], ['cerveau', 'Cerveau'], ['coeur', 'Cœur'], ['respiratoire', 'Poumons'], ['digestif', 'Digestif'], ['urinaire', 'Urinaire'], ['genital', 'Génital'], ['endocrine', 'Glandes'], ['lymphatique', 'Lymphe'], ['sens', 'Sens'], ['dents', 'Dents'], ['peau', 'Peau']];
export function creerPanneauAnatomie({ ui, obtenir, dire, ouvrirCatalogue = () => {}, ouvrirFenetres = () => {}, arreter = () => false, ouvrirDossiers = () => {} }) {
  const el = document.createElement('aside'); el.id = 's-anat'; el.hidden = false; el.setAttribute('aria-label', 'Commandes d’anatomie');
  el.innerHTML = '<header class="sa-t"><h3>Anatomie</h3><button type="button" data-a="replier" title="Replier le panneau" aria-label="Replier le panneau" aria-expanded="true">&#9664;</button></header>'
    + '<div class="sa-corps" data-r="corps">'
    + '<div class="sa-ligne"><input type="search" data-r="chercher" placeholder="Chercher : fémur, biceps…" aria-label="Chercher une structure"></div><div class="sa-res" data-r="res"></div>'
    + '<h4>Couches affichées</h4><p class="sa-note">Seul le squelette est affiché par défaut ; les autres couches s’activent ici ou à la voix (« montre les muscles »).</p>'
    + '<div class="sa-sys" data-r="sys">' + SYSTEMES.map(([id, nom]) => '<button type="button" data-sys="' + id + '" aria-pressed="false">' + nom + '</button>').join('') + '</div>'
    + '<h4>Affichage</h4><div class="sa-ligne"><button type="button" data-a="isoler" title="Ne garder que la structure sélectionnée">Isoler</button><button type="button" data-a="tout" title="Lève l’isolement, la coupe et la transparence ; les couches non activées restent masquées">Tout afficher</button><button type="button" data-a="squelette" title="Revient à l’état par défaut : squelette seul">Squelette seul</button><button type="button" data-a="mesurer">Mesurer</button><button type="button" data-a="comparer">G / D</button><button type="button" data-a="echelle">Cotation</button><button type="button" data-a="flux" title="Animation illustrative du flux sanguin et de l’influx nerveux">Flux</button></div>'
    + '<label>Autres structures <input type="range" data-r="opa" min="5" max="100" value="100" aria-label="Opacité des autres structures"></label>'
    + '<label>Couches muscles <input type="range" data-r="couche" min="1" max="3" value="1" step="1" title="1 = toutes, 2 = sans la couche superficielle, 3 = seulement la couche profonde"></label>'
    + '<label>Coupe <select data-r="axe"><option value="">aucune</option><option value="x">gauche / droite</option><option value="y">hauteur</option><option value="z">avant / arrière</option></select></label><label><span>Position de la coupe</span><input type="range" data-r="coupe" min="-100" max="100" value="0"></label>'
    + '<label>Noms <select data-r="langue"><option value="fr">français</option><option value="la">latin</option><option value="fr+la">les deux</option></select></label>'
    + '<h4>Mouvements et pathologies</h4><div class="sa-ligne"><button type="button" data-a="dossiers" title="Os, muscles, vaisseaux, nerfs, organes, mouvements, pathologies : un dossier s’ouvre en carrousel">Dossiers…</button><button type="button" data-a="cat-mouvements">Mouvements…</button><button type="button" data-a="cat-pathologies">Pathologies…</button><button type="button" data-a="arreter">Arrêter</button></div>'
    + '<div class="sa-actif" data-r="actif">Aucun mouvement ni pathologie.</div>'
    + '<h4>Fenêtres</h4><div class="sa-ligne"><button type="button" data-a="fen-ranger">Réorganiser</button><button type="button" data-a="fen-reduire">Réduire tout</button><button type="button" data-a="fen-fermer">Tout fermer</button></div>'
    + '<div class="sa-etat" data-r="etat" role="status" aria-live="polite">Choisis une couche ou clique sur une structure.</div>'
    + '<div class="sa-credit">BodyParts3D © DBCLS, CC BY 4.0 · noms TA2 (Z-Anatomy, CC BY-SA 4.0) · Contenu pédagogique, pas un outil de diagnostic, à vérifier avec le cours / un atlas.</div></div>';
  ui.appendChild(el);
  const r = n => el.querySelector('[data-r="' + n + '"]'), A = () => obtenir();
  const etat = t => { r('etat').textContent = t; };
  const nomSys = id => (SYSTEMES.find(s => s[0] === id) || [id, id])[1];
  /* Reflète l'état réel des couches (boutons, voix, mouvement ou pathologie) : une seule source de vérité, anat.systemesActifs(). */
  function synchroniser(liste) { const s = new Set(liste || (A() ? A().systemesActifs() : [])); el.querySelectorAll('[data-sys]').forEach(b => { const on = s.has(b.dataset.sys); b.classList.toggle('actif', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
  async function surSys(b) {
    const a = A(); if (!a) return; const id = b.dataset.sys;
    if (a.systemesActifs().includes(id)) { a.masquerSysteme(id); etat(nomSys(id) + ' masqué.'); return; }
    etat('Chargement : ' + nomSys(id) + '…');
    try { await a.afficherSysteme(id, { surProgres: (f, t) => etat('Chargement : ' + nomSys(id) + ' ' + f + '/' + t) }); etat(nomSys(id) + ' affiché (' + a.index.deSysteme(id).length + ' pièces).'); } catch (e) { etat('Chargement impossible : ' + (e && e.message || e)); }
  }
  el.addEventListener('click', async e => {
    const a = A(); if (!a) return; const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sys) return surSys(b);
    if (b.dataset.id) { await a.selectionner(b.dataset.id); a.fenetres && a.fenetres.ouvrirFiche(b.dataset.id); etat(a.index.libelle(a.index.parId.get(b.dataset.id), 'fr')); return; }
    const act = b.dataset.a;
    if (act === 'replier') { const ferme = el.classList.toggle('replie'); b.innerHTML = ferme ? '&#9654;' : '&#9664;'; b.setAttribute('aria-expanded', ferme ? 'false' : 'true'); return; }
    if (act === 'isoler') { a.isoler(!a.etat.isole); b.classList.toggle('actif', a.etat.isole); }
    else if (act === 'tout') { a.toutAfficher(); r('opa').value = 100; r('couche').value = 1; r('axe').value = ''; el.querySelectorAll('[data-a="isoler"]').forEach(x => x.classList.remove('actif')); etat('Isolement, transparence et coupe retirés ; les couches activées sont entièrement affichées.'); }
    else if (act === 'squelette') { a.squeletteSeul(); r('opa').value = 100; r('couche').value = 1; r('axe').value = ''; el.querySelectorAll('[data-a="isoler"]').forEach(x => x.classList.remove('actif')); etat('État par défaut : le squelette seul.'); }
    else if (act === 'mesurer') { const m = a.mesurer(); etat(m.ok ? m.texte : m.erreur); }
    else if (act === 'flux') { const on = a.flux(!a.etatPublic().flux); b.classList.toggle('actif', on); etat(on ? 'Animation illustrative : artères du cœur vers la périphérie, veines vers le cœur, battement du cœur, influx des nerfs. Vitesse et forme non mesurées.' : 'Animation arrêtée.'); }
    else if (act === 'echelle') etat(a.echelle().texte);
    else if (act === 'comparer') { const s = a.etat.selection[0]; if (!s) etat('Sélectionne d’abord un os ou un muscle.'); else { const c = await a.comparer(s); etat(c.ok ? c.texte : c.erreur); } }
    else if (act === 'dossiers') ouvrirDossiers();
    else if (act === 'cat-mouvements') ouvrirCatalogue('mouvements');
    else if (act === 'cat-pathologies') ouvrirCatalogue('pathologies');
    else if (act === 'arreter') { const fait = arreter(); majActif(null); etat(fait ? 'Retour à l’anatomie normale.' : 'Rien à arrêter.'); }
    else if (act === 'fen-ranger') ouvrirFenetres('ranger'); else if (act === 'fen-reduire') ouvrirFenetres('reduire'); else if (act === 'fen-fermer') ouvrirFenetres('fermer');
  });
  r('chercher').addEventListener('input', e => {
    const a = A(); if (!a) return; const t = e.target.value.trim(); const res = t.length >= 2 ? a.index.chercher(t, { limite: 8 }) : [];
    r('res').innerHTML = res.map(p => '<button type="button" data-id="' + p.id + '">' + a.index.libelle(p, 'fr').replace(/</g, '&lt;') + '</button>').join('');
  });
  r('opa').addEventListener('input', e => { const a = A(); if (a) a.transparence(+e.target.value / 100); });
  r('couche').addEventListener('input', e => { const a = A(); if (a) { const n = a.couches(+e.target.value); etat('Couches de muscles : ' + ['toutes', 'sans la couche superficielle', 'seulement la couche profonde'][n - 1] + ' (estimées).'); } });
  const coupe = () => { const a = A(); if (a) a.couper(r('axe').value || null, +r('coupe').value / 100); };
  r('axe').addEventListener('change', coupe); r('coupe').addEventListener('input', coupe);
  r('langue').addEventListener('change', e => { const a = A(); if (a) a.langue(e.target.value); });
  function majActif(texte) { r('actif').textContent = texte || 'Aucun mouvement ni pathologie.'; }
  for (const t of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'keydown', 'keyup']) el.addEventListener(t, e => e.stopPropagation());
  void dire;
  return { el, etat, synchroniser, majActif, marquerSysteme(id, oui) { const b = el.querySelector('[data-sys="' + id + '"]'); if (b) b.classList.toggle('actif', oui); }, dispose() { el.remove(); } };
}
