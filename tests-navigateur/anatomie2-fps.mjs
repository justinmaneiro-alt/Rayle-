/* Anatomie 2 : images par seconde dans la salle médicale (SANSVSYNC=1 pour mesurer sans limite de 60 Hz) : squelette seul, squat avec muscles habillés + 3 fenêtres + vue rapprochée. */
import { ouvrirGalaxie, attendre } from './terre-aide.mjs';
const { navigateur, page } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900 });
const G = (f, ...a) => page.evaluate(f, ...a);
await G(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 60000 }); await attendre(1000);
await G(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: 'ouvrir_salle_medicale', params: {} }));
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 60000 }); await attendre(1500);
const mesure = async (nom) => { const r = await G(() => new Promise(res => { let n = 0, t0 = performance.now(), pire = 0, prev = t0; const f = t => { n++; pire = Math.max(pire, t - prev); prev = t; if (t - t0 < 4000) requestAnimationFrame(f); else res({ ips: Math.round(n * 1000 / (t - t0)), pireImageMs: Math.round(pire) }); }; requestAnimationFrame(f); })); console.log(nom.padEnd(52), r.ips + ' i/s', '(pire image ' + r.pireImageMs + ' ms)'); return r; };
await mesure('squelette seul');
await G(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: 'animer', params: { mouvement: 'squat' } })); await attendre(6000);
await mesure('squat : muscles habillés + fenêtre mouvement + vue 3D');
await G(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: 'anatomie_mouvement_stop', params: {} })); await attendre(500);
await G(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: 'afficher_systeme', params: { systeme: 'muscles' } })); await attendre(800);
await mesure('tous les muscles affichés (immobiles)');
await navigateur.close();
