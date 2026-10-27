import { PATHOLOGIES, trouverPathologie, descriptionParleePatho } from './anatomie-pathologies-calcul.js';
import { extraParId, trouverExtra } from './anatomie-patho-catalogue.js';
import { norm } from './anatomie-catalogue.js';

/* ═════════════ ANATOMIE : LANCEMENT D'UNE PATHOLOGIE (Phase E) ═════════════
   Cas modélisés en 3D (S6 : déformation calculée sur le squelette) ou fiches du catalogue étendu : une fiche « information générale » ou « simplifiée » met en évidence sa ZONE (os concernés,
   cherchés dans l'index) au lieu d'inventer une déformation ; une fiche qui s'appuie sur un cas modélisé (`base3d`) réutilise sa déformation avec ses paramètres.
   La fenêtre explicative reçoit un curseur réglable (angle de Cobb…) et un bouton « comparer avec le corps sain ». */
export function brancherPathologies(O, { anat, glue, actif, etat, tousMouvements }) {
  const memoire = { id: null, params: {}, sain: false };
  const zoneIds = zone => {
    const ids = new Set();
    for (const q of zone || []) { for (const p of anat.index.chercher(q, { limite: 40 })) if (p.systeme === 'os' && ids.size < 60) ids.add(p.id); }
    return [...ids];
  };
  function barreControles(p) {
    const f = glue.fenetres.obtenir('pathologie'); if (!f) return;
    f.corps.querySelectorAll('.saf-patho-ctrl').forEach(x => x.remove());
    const div = document.createElement('div'); div.className = 'saf-outils saf-patho-ctrl'; div.style.alignItems = 'center';
    let h = '';
    if (p.parametre) h += '<label class="saf-param">' + p.parametre.nom + ' <input type="range" data-p="valeur" min="' + p.parametre.min + '" max="' + p.parametre.max + '" value="' + (memoire.params.valeur !== undefined ? memoire.params.valeur : p.parametre.defaut) + '" aria-label="' + p.parametre.nom + '"> <b data-p="txt">' + (memoire.params.valeur !== undefined ? memoire.params.valeur : p.parametre.defaut) + p.parametre.unite + '</b></label>';
    h += '<button type="button" data-p="sain" class="' + (memoire.sain ? 'actif' : '') + '" title="Alterne entre le cas et l’anatomie normale">' + (memoire.sain ? 'Revoir le cas' : 'Comparer avec le corps sain') + '</button>';
    div.innerHTML = h; const outils = f.corps.querySelector('.saf-outils'); if (outils) outils.after(div); else f.corps.prepend(div);
    const r = div.querySelector('[data-p="valeur"]'), t = div.querySelector('[data-p="txt"]');
    if (r) { r.addEventListener('input', () => { t.textContent = r.value + p.parametre.unite; }); r.addEventListener('change', () => { O.lancerPathologie(p.id, { valeur: +r.value }); }); }
    div.querySelector('[data-p="sain"]').addEventListener('click', async () => {
      if (!memoire.sain) { memoire.sain = true; const pt = anat.pathologiesObjet(); if (pt) pt.arreter(); anat.effacerCachees(); await anat.surcharger(null); anat.selectionner([], { cadrer: false }); barreControles(p); etat('Anatomie normale : comparaison avec le cas « ' + p.nom + ' ».'); }
      else { memoire.sain = false; await O.lancerPathologie(p.id, memoire.params); }
    });
  }
  O.lancerPathologie = async function (texteOuId, params = {}) {
    const pt = anat.pathologies(), mv = anat.mouvementObjet(); if (mv && mv.arreter()) { /* le mouvement cède la place */ } O.fermerVue3d && O.fermerVue3d(); glue.fenetres.fermer('mouvement');
    const txt = String(texteOuId || ''), ex = extraParId(txt) || (() => { const e = trouverExtra(txt), b = trouverPathologie(txt); return e && (!b || norm(e.nom).length >= norm(b.nom).length) ? e : null; })();
    let r, p;
    if (ex) {
      const base = ex.base3d, par = { ...(ex.params || {}), ...params };
      if (base) { r = await pt.afficher(base, par); if (!r.ok) return r; } else { pt.arreter(); anat.effacerCachees(); await anat.surcharger(null); r = { ok: true, mesure: null }; const ids = zoneIds(ex.zone); if (ids.length) await anat.selectionner(ids, { cadrer: true }); }
      p = { ...(r.pathologie || {}), ...ex }; memoire.id = ex.id; memoire.params = par;
    } else {
      r = await pt.afficher(txt, params); if (!r.ok) return r; p = { ...r.pathologie, niveau: r.pathologie.niveau || (/fracture|amputation|déficience|rachis/.test(r.pathologie.categorie) ? 'modèle 3D' : 'simplifié') }; memoire.id = p.id; memoire.params = params;
    }
    memoire.sain = false;
    glue.ouvrirPathologie(p, { mesure: r.mesure, mouvements: (p.mouvements || []).map(id => tousMouvements().find(x => x.id === id)).filter(Boolean).map(x => ({ id: x.id, nom: x.nom })), muscles: p.muscles || [], nerfs: p.nerfs || [] });
    barreControles(p);
    if (O.ouvrirVue3dPatho) await O.ouvrirVue3dPatho(p);
    if (glue.fenetres.recouvrements().length) glue.fenetres.reorganiser();
    actif('Pathologie : ' + p.nom + ' (' + p.niveau + ').'); etat((r.mesure ? r.mesure + ' ' : '') + 'Pas un outil de diagnostic.');
    return { ok: true, pathologie: p, mesure: r.mesure || null, cobb: r.cobb, texte: descriptionParleePatho(p, r.mesure) };
  };
}
void PATHOLOGIES;
