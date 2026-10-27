import fs from 'node:fs';
import { ouvrirGalaxieTheme, attendre, compteur } from './r2-aide.mjs';
/* V2 phase 5 : (1) les muscles SUIVENT le squelette dans les 26 mouvements (cause du « muscles en lambeaux » : pièce habillée après le début du mouvement = pose appliquée deux fois) ;
   (2) noms français partout ; (3) aucune fenêtre ne recouvre une autre ; (4) étiquettes seulement au survol / à la sélection.
   Lancer : node tests-navigateur/v2-anatomie-test.mjs   (nécessite assets-lourds/anatomie/ ; ≈ 4 min) */
const { verifier, fin } = compteur();
fs.mkdirSync('docs/captures-v2', { recursive: true });
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: 1600, hauteur: 900 });
const G = (f, ...a) => page.evaluate(f, ...a);
const ordre = (a, p = {}) => G((a, p) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: a, params: p }), a, p);
await G(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 60000 }); await attendre(800);
await ordre('ouvrir_salle_medicale');
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 60000 }); await attendre(800);
await G(async () => { await window.Saturne.anatomieObjet().afficherSysteme('muscles'); }); await attendre(1200);

// ── noms français ──
const noms = await G(() => { const a = window.Saturne.anatomieObjet(), tous = a.index.pieces.map(p => a.index.libelle(p)); return { n: tous.length, sansFr: a.index.pieces.filter(p => !p.nom_fr).length, nonPrecise: tous.filter(t => /non précisé/.test(t)).length, anglais: tous.filter(t => /\b(of|artery|vein|branch|tributary|tree)\b/i.test(t)).length, exemple: a.index.libelle(a.index.pieces.find(p => /Accessory subsuperior branch of right posterior basal/.test(p.nom_en))) }; });
verifier('les ' + noms.n + ' pièces ont un nom français', noms.sansFr === 0, JSON.stringify(noms));
verifier('« nom français non précisé » n’apparaît nulle part', noms.nonPrecise === 0);
verifier('aucun mot anglais courant dans les noms affichés', noms.anglais === 0, String(noms.anglais));
verifier('l’exemple de la vidéo est en français', /^Branche sous-supérieure accessoire de l’artère segmentaire basale postérieure droite$/.test(noms.exemple), noms.exemple);

// ── muscles et mouvements ──
const ids = await G(() => { const a = window.Saturne.anatomieObjet(); return (a.mouvementObjet() || a.mouvement()).liste().map(m => m.id); });
verifier('26 mouvements', ids.length === 26, String(ids.length));
const rapport = [];
for (const id of ids) {
  await ordre('animer', { mouvement: id }); await attendre(2200);
  await G(() => window.Saturne.anatomieObjet().mouvementObjet().pause(true));
  const r = await G(async () => {
    const M = await import(new URL('planetes/saturne/pc/anatomie-peau-calcul.js', document.baseURI).href), C = await import(new URL('planetes/saturne/pc/anatomie-corps.js', document.baseURI).href), a = window.Saturne.anatomieObjet(), mv = a.mouvementObjet();
    let pire = 0, nom = '', n = 0, pireBornes = 0, nomB = '';
    for (const ph of [0.02, 0.25, 0.5, 0.75]) {
      mv.phase(ph); const T = mv.etat.dernier && mv.etat.dernier.r ? mv.etat.dernier.r.T : null; if (!T) continue;
      const mats = C.SEGMENTS.map(sg => T[sg]); const out = [0, 0, 0];
      for (const [, rec] of mv.peau.equipes) {
        if (!rec.mesh.visible) continue; n++;
        const nv = rec.P.length / 3, mn0 = [1e9, 1e9, 1e9], mx0 = [-1e9, -1e9, -1e9], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        for (let i = 0; i < nv; i += 6) { M.habiller(rec.P, i, rec.idx, rec.w, mats, out); for (let k = 0; k < 3; k++) { const r0 = rec.P[3 * i + k]; if (r0 < mn0[k]) mn0[k] = r0; if (r0 > mx0[k]) mx0[k] = r0; if (out[k] < mn[k]) mn[k] = out[k]; if (out[k] > mx[k]) mx[k] = out[k]; } }
        const d0 = Math.hypot(mx0[0] - mn0[0], mx0[1] - mn0[1], mx0[2] - mn0[2]) || 1e-6, d1 = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]), q = d1 / d0;
        if (q > pire) { pire = q; nom = rec.piece.nom_en; }
        const b = rec.piece.bornes; let e = 0; for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs(mn0[k] - b[0][k]), Math.abs(mx0[k] - b[1][k])); if (e > pireBornes) { pireBornes = e; nomB = rec.piece.nom_en; }
      }
    }
    return { pire: +pire.toFixed(2), nom, n, pireBornes: +pireBornes.toFixed(4), nomB, equipes: mv.peau.equipes.size };
  }).catch(e => ({ erreur: String(e.message || e).slice(0, 120) }));
  rapport.push([id, r]);
}
const bad = rapport.filter(([, r]) => r.erreur);
if (bad.length) console.log('erreurs de mesure :', JSON.stringify(bad.slice(0, 2)));
const mesures = rapport.filter(([, r]) => !r.erreur);
verifier('mesure faite sur les 26 mouvements', mesures.length === 26, mesures.length + ' mesurés');
const defauts = mesures.filter(([, r]) => r.pireBornes > 0.01);
verifier('muscles habillés à partir de la forme de REPOS dans tous les mouvements (écart aux bornes ≤ 1 cm ; le bug faisait 10 à 20 cm)', defauts.length === 0, JSON.stringify(defauts.slice(0, 3)));
const etire = mesures.filter(([, r]) => r.pire > 2.2);
verifier('aucun muscle ne s’étire de plus d’un facteur 2,2 (pas de lambeaux ; épaule : jusqu’à ×2 mesuré, voir le journal)', etire.length === 0, JSON.stringify(etire.slice(0, 3)));
console.log('  pire étirement par mouvement :', mesures.map(([id, r]) => id + ' ×' + r.pire).join(' · '));
verifier('des muscles sont bien habillés (≥ 8 en moyenne)', mesures.reduce((s, [, r]) => s + r.equipes, 0) / Math.max(1, mesures.length) >= 8);
// capture du squat à mi-course
await ordre('animer', { mouvement: 'squat' }); await attendre(2200);
await G(() => { const o = window.Saturne.anatomieObjet(); o.orchestre.glue.fenetres.fermerTout(); const m = o.mouvementObjet(); m.pause(true); m.phase(0.5); }); await attendre(900);
await page.screenshot({ path: 'docs/captures-v2/anat-squat-test.png' });
const e = erreurs.filter(x => !/faireconomy|404|ERR_FAILED|net::/.test(x)); verifier('aucune erreur JavaScript', !e.length, e.slice(0, 3).join(' | '));
await navigateur.close(); process.exit(fin() ? 1 : 0);
