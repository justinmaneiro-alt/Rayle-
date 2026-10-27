/* Anatomie 2, phase D : nerfs périphériques SCHÉMATIQUES (tracés étiquetés), fiches avec déficits cliniques, suivi pendant un mouvement. Captures : docs/captures-anatomie-2/d-*.png */
import { ouvrirGalaxie, attendre, compteur } from './terre-aide.mjs';
import fs from 'node:fs';
const c = compteur(), SORTIE = '../docs/captures-anatomie-2/'; fs.mkdirSync(SORTIE, { recursive: true });
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900 });
const G = (f, ...a) => page.evaluate(f, ...a);
const nom = (t, ok, d = '') => c.verifier(t, ok, String(d).slice(0, 260));
const ordre = (a, p = {}) => G((a, p) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: a, params: p }), a, p);
await G(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 60000 }); await attendre(1000);
await ordre('ouvrir_salle_medicale');
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 60000 }); await attendre(1000);
let r = await ordre('afficher_systeme', { systeme: 'nerfs_peripheriques' });
nom('ordre « montre les nerfs périphériques »', r.ok && /schéma/.test(r.texte || ''), JSON.stringify(r).slice(0, 200));
const n = await G(() => { const a = window.Saturne.anatomieObjet(); let k = 0; for (const [id, ms] of a.etat.meshs) if (id.startsWith('SCH-')) for (const m of ms) if (m.visible) k++; return k; });
nom('25 tracés (12 nerfs × 2 côtés + la moelle)', n === 25, n);
await G(() => { const a = window.Saturne.anatomieObjet(); a.orienter(0, 0.1); }); await attendre(900); await page.screenshot({ path: SORTIE + 'd-nerfs.png' });
r = await ordre('decrire', { nom: 'nerf sciatique droit' }); await attendre(800);
nom('« décris le nerf sciatique » : fiche, mention de schéma', r.ok && /sciatique/i.test(r.texte) && /vérifier/i.test(r.texte), (r.texte || r.erreur || '').slice(0, 160));
const t = await G(() => (document.querySelector('.saf[data-id=fiche]') || { textContent: '' }).textContent);
nom('fenêtre : « Schéma, tracé approximatif », racines, territoire, clinique', /Schéma, tracé approximatif/.test(t) && /Racines/.test(t) && /Territoire moteur/.test(t) && /pied tombant/i.test(t) && /schématique/.test(t), t.slice(0, 160));
for (const id of ['plexus_brachial', 'axillaire', 'musculo_cutane', 'median', 'ulnaire', 'radial', 'plexus_lombo_sacre', 'femoral', 'obturateur', 'sciatique', 'tibial', 'fibulaire_commun']) {
  const ok = await G(id => { const a = window.Saturne.anatomieObjet(), p = a.index.parId.get('SCH-' + id + '-D'); return !!p && !!p.fiche && p.fiche.clinique.length > 40 && p.fiche.description.length > 60; }, id);
  nom('fiche du nerf ' + id, ok);
}
r = await ordre('animer', { mouvement: 'abduction de l’épaule' }); await attendre(3500);
const suit = await G(() => { const a = window.Saturne.anatomieObjet(); const m = a.etat.meshs.get('SCH-radial-D')[0]; return { peau: !!m.userData.peau, visible: m.visible, forcee: a.etatPublic().actifs }; });
nom('pendant un mouvement : couche des nerfs masquée (seul le squelette + muscles du mouvement)', !suit.visible, JSON.stringify(suit));
await ordre('anatomie_mouvement_stop'); await attendre(500);
await ordre('afficher_systeme', { systeme: 'nerfs_peripheriques' }); await ordre('animer', { mouvement: 'flexion du coude' });
await attendre(300); await G(() => window.Saturne.anatomieObjet().forcer('test', ['SCH-ulnaire-D', 'SCH-median-D', 'SCH-radial-D']));
await attendre(3500);
const hab = await G(() => { const a = window.Saturne.anatomieObjet(); return ['SCH-ulnaire-D', 'SCH-median-D', 'SCH-radial-D'].map(id => !!a.etat.meshs.get(id)[0].userData.peau); });
nom('les nerfs forcés sont habillés par les os (suivent le coude)', hab.every(Boolean), JSON.stringify(hab));
await page.screenshot({ path: SORTIE + 'd-nerfs-coude.png' });
await ordre('anatomie_mouvement_stop');
nom('aucune erreur JS', !erreurs.some(x => /pageerror/.test(x)), erreurs.filter(x => /pageerror/.test(x)).join(' | '));
const e = c.fin(); await navigateur.close(); process.exit(e ? 1 : 0);
