import { creerFenetres } from './anatomie-fenetres.js';
import { creerVuePiece } from './anatomie-vue-piece.js';
import { fiche } from './anatomie-savoirs.js';
import { voisines, htmlFiche, segmentsLecture, esc } from './anatomie-fiche-calcul.js';
import { htmlMouvement, htmlPathologie, segmentsMouvement, segmentsPathologie, listeMuscles, nerfsConcernes } from './anatomie-explic-calcul.js';

/* ═════════════ ANATOMIE : LES FENÊTRES HOLOGRAPHIQUES BRANCHÉES SUR LA TABLE (Phase B) ═════════════
   Un clic sur une structure (os, muscle, vaisseau, nerf, organe, ligament, zone) ouvre UNE fenêtre de fiche complète (réutilisée au clic suivant) ; un mouvement ou une pathologie
   ouvre sa fenêtre explicative ; le mouvement ouvre en plus une fenêtre « vue rapprochée » (anatomie-vue-mouvement.js). Les fenêtres coexistent et se rangent sans se masquer.
   « Raylé, explique-moi » lit la fiche à voix haute, rubrique par rubrique, pendant que la caméra tourne autour de la structure. */
const pause = ms => new Promise(r => setTimeout(r, ms));

export function creerFenetresAnat({ anat, ui, ecran, parler = null, arreterParole = null, surRanger = null }) {
  const F = creerFenetres({ ui, ecran, surRanger });
  const VP = creerVuePiece({ anat, F }), vues = new Map();      // vue 3D de la pièce isolée, par fenêtre de fiche
  const liberer = wid => { const v = vues.get(wid); if (v) { v.dispose(); vues.delete(wid); } };
  const monterPiece = (wid, sid, w) => { liberer(wid); const el = w && w.corps.querySelector('[data-r="piece"]'); if (!el) return; const v = VP.monter(el, sid, { fenetre: wid }); if (v) vues.set(wid, v); };
  const etat = { fiche: null, lecture: 0, mouvement: null, pathologie: null };
  const dire = parler || (async (t, ms) => { if (typeof window.speak === 'function') { await Promise.race([window.speak(t), pause(ms * 4 + 4000)]); } else await pause(Math.min(ms, 600)); });
  const couper = arreterParole || (() => { if (typeof window.cancelSpeech === 'function') { try { window.cancelSpeech(); } catch (e) { /* voix absente */ } } });

  const barreOutils = (extra = '') => '<div class="saf-outils"><button type="button" data-act="expliquer" class="saf-principal" title="Raylé lit la fiche à voix haute pendant que la caméra tourne">Raylé, explique-moi</button>' + extra + '<button type="button" data-act="arreter-lecture" hidden>Arrêter la lecture</button></div>';

  /* ── fiche d'une structure ── */
  function contenuFiche(p, { epingle = false } = {}) {
    const fi = fiche(p), liens = voisines(anat.index, p, { max: 8 });
    return barreOutils('<button type="button" data-act="isoler">Isoler</button><button type="button" data-act="cadrer">Cadrer</button>' + (epingle ? '' : '<button type="button" data-act="epingler" title="Garder cette fiche ouverte : le prochain clic ouvrira une nouvelle fenêtre">Garder ouverte</button>')) + '<div class="saf-piece" data-r="piece"></div>' + htmlFiche(fi, liens, { schema: p.schema || null });
  }
  /* Épingle la fiche courante dans une fenêtre à part : plusieurs fiches (et leurs vues 3D) peuvent coexister. */
  function epingler(id) {
    const p = anat.index.parId.get(id); if (!p) return null; const fi = fiche(p), wid = 'fiche-' + id;
    const w = F.ouvrir({ id: wid, titre: fi.nom_fr || fi.nom_en, sousTitre: [fi.nom_la, fi.region, fi.cote].filter(Boolean).join(' · '), genre: 'fiche', contenu: contenuFiche(p, { epingle: true }), pastille: fi.confiance === 'élevée' ? 'reel' : 'simule', avertissement: 'À vérifier avec le cours / un atlas · pas un outil de diagnostic', sur: { fermer: () => { liberer(wid); arretLecture(); } } });
    w.el.dataset.structure = id; monterPiece(wid, id, w); return w;
  }
  function ouvrirFiche(id, { cadrer = false } = {}) {
    const p = anat.index.parId.get(id); if (!p) return null;
    etat.fiche = id; const fi = fiche(p);
    const w = F.ouvrir({ id: 'fiche', titre: fi.nom_fr || fi.nom_en, sousTitre: [fi.nom_la, fi.region, fi.cote].filter(Boolean).join(' · '), genre: 'fiche', contenu: contenuFiche(p), pastille: fi.confiance === 'élevée' ? 'reel' : 'simule', avertissement: 'À vérifier avec le cours / un atlas · pas un outil de diagnostic', sur: { fermer: () => { etat.fiche = null; liberer('fiche'); arretLecture(); } } });
    monterPiece('fiche', id, w);
    if (cadrer) anat.cadrer([p]); return w;
  }
  const majFichePourSelection = () => { if (etat.fiche && F.obtenir('fiche')) { const p = anat.index.parId.get(etat.fiche); if (p) { const fi = fiche(p); F.ouvrir({ id: 'fiche', titre: fi.nom_fr || fi.nom_en, sousTitre: [fi.nom_la, fi.region, fi.cote].filter(Boolean).join(' · '), genre: 'fiche', contenu: contenuFiche(p), pastille: fi.confiance === 'élevée' ? 'reel' : 'simule', avertissement: 'À vérifier avec le cours / un atlas · pas un outil de diagnostic' }); monterPiece('fiche', etat.fiche, F.obtenir('fiche')); } } };

  /* ── lecture à voix haute avec caméra ── */
  function arretLecture() { etat.lecture++; couper(); anat.balayer(0); for (const b of F.racine.querySelectorAll('[data-act="arreter-lecture"]')) b.hidden = true; for (const b of F.racine.querySelectorAll('[data-act="expliquer"]')) b.disabled = false; }
  async function lire(segments, { cible = null } = {}) {
    const mon = ++etat.lecture; couper();
    for (const b of F.racine.querySelectorAll('[data-act="arreter-lecture"]')) b.hidden = false; for (const b of F.racine.querySelectorAll('[data-act="expliquer"]')) b.disabled = true;
    if (cible) anat.cadrer(Array.isArray(cible) ? cible : [cible]);
    const t0 = performance.now(); let k = 0;
    for (const s of segments) {
      if (mon !== etat.lecture) return { ok: false, interrompu: true };
      anat.balayer(s.ms + 400); etat.segmentCourant = s.cle; F.racine.dataset.lecture = s.cle;
      await dire(s.texte, s.ms); k++;
    }
    if (mon === etat.lecture) { arretLecture(); delete F.racine.dataset.lecture; }
    return { ok: true, segments: k, ms: Math.round(performance.now() - t0) };
  }
  function expliquerFiche() { const p = etat.fiche && anat.index.parId.get(etat.fiche); if (!p) return Promise.resolve({ ok: false, erreur: 'aucune fiche ouverte' }); return lire(segmentsLecture(fiche(p)), { cible: [p] }); }

  /* ── mouvement ── */
  function ouvrirMouvement(m, { nerfs = null } = {}) {
    etat.mouvement = m;
    const w = F.ouvrir({ id: 'mouvement', titre: m.nom, sousTitre: 'mouvement · ' + (m.plan ? 'plan ' + m.plan : ''), genre: 'pathologie', contenu: barreOutils() + htmlMouvement(m, anat.index), pastille: 'simule', avertissement: 'Mouvement simplifié · à vérifier avec le cours / un atlas', sur: { fermer: () => { etat.mouvement = null; arretLecture(); } } });
    void nerfs; return w;
  }
  const expliquerMouvement = () => (etat.mouvement ? lire(segmentsMouvement(etat.mouvement, anat.index)) : Promise.resolve({ ok: false, erreur: 'aucun mouvement ouvert' }));

  /* ── pathologie ── */
  function ouvrirPathologie(p, { mesure = null, mouvements = [], muscles = [], nerfs = [] } = {}) {
    etat.pathologie = { p, mesure };
    const ms = listeMuscles(anat.index, muscles), nerfsTxt = nerfs.length ? nerfs : nerfsConcernes(ms);
    return F.ouvrir({ id: 'pathologie', titre: p.nom, sousTitre: (p.categorie || '') + (p.niveau ? ' · ' + p.niveau : ''), genre: 'pathologie', contenu: barreOutils() + htmlPathologie(p, { mesure, muscles: ms, nerfs: nerfsTxt, mouvements }), pastille: 'simule', avertissement: 'Pas un outil de diagnostic · à vérifier avec le cours / un atlas', sur: { fermer: () => { etat.pathologie = null; arretLecture(); } } });
  }
  const expliquerPathologie = () => (etat.pathologie ? lire(segmentsPathologie(etat.pathologie.p, etat.pathologie.mesure)) : Promise.resolve({ ok: false, erreur: 'aucune pathologie ouverte' }));

  /* ── clics dans les fenêtres : voisines, boutons ── */
  F.racine.addEventListener('click', async e => {
    const v = e.target.closest('[data-voisine]'), a = e.target.closest('[data-act]'), mv = e.target.closest('[data-mouvement]'); const fenetre = e.target.closest('.saf'); const id = fenetre && fenetre.dataset.id; const sid = fenetre && fenetre.dataset.structure;
    if (v) { await anat.selectionner(v.dataset.voisine); ouvrirFiche(v.dataset.voisine); return; }
    if (mv && etat.surMouvement) { etat.surMouvement(mv.dataset.mouvement); return; }
    if (!a) return;
    if (a.dataset.act === 'epingler' && etat.fiche) { epingler(etat.fiche); return; }
    if (sid && ['expliquer', 'isoler', 'cadrer'].includes(a.dataset.act)) { const ps = anat.index.parId.get(sid); if (!ps) return; if (a.dataset.act === 'expliquer') lire(segmentsLecture(fiche(ps)), { cible: [ps] }); else if (a.dataset.act === 'cadrer') anat.cadrer([ps]); else { await anat.selectionner(sid); anat.isoler(!anat.etat.isole); a.classList.toggle('actif', anat.etat.isole); } return; }
    if (a.dataset.act === 'expliquer') { if (id === 'fiche') expliquerFiche(); else if (id === 'mouvement') expliquerMouvement(); else if (id === 'pathologie') expliquerPathologie(); }
    else if (a.dataset.act === 'arreter-lecture') arretLecture();
    else if (a.dataset.act === 'isoler' && etat.fiche) { await anat.selectionner(etat.fiche); anat.isoler(!anat.etat.isole); a.classList.toggle('actif', anat.etat.isole); }
    else if (a.dataset.act === 'cadrer' && etat.fiche) anat.cadrer([anat.index.parId.get(etat.fiche)]);
  });
  const desabonner = anat.abonner((type, d) => {
    if (type === 'clic') ouvrirFiche(d.id);
    else if (type === 'decrire') ouvrirFiche(d.ids[0]);
    else if (type === 'selection' && d && d.ids && d.ids.length === 1 && etat.fiche && etat.fiche !== d.ids[0] && F.obtenir('fiche')) { etat.fiche = d.ids[0]; majFichePourSelection(); }
  });
  return {
    fenetres: F, etat, ouvrirFiche, epingler, vuesPieces: () => [...vues.keys()], vuePiece: wid => vues.get(wid) || null, ouvrirMouvement, ouvrirPathologie, expliquerFiche, expliquerMouvement, expliquerPathologie, lire, arretLecture,
    definirSurMouvement(f) { etat.surMouvement = f; },
    fermerTout() { arretLecture(); F.fermerTout(); etat.fiche = null; etat.mouvement = null; etat.pathologie = null; },
    dispose() { desabonner(); arretLecture(); for (const w of [...vues.keys()]) liberer(w); F.dispose(); }
  };
}
void esc;
