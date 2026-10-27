import { ouvrirGalaxieTheme, attendre, compteur } from './r2-aide.mjs';

/* R2 phases 1 et 4 : ANATOMIE dans le thème AURORE. Un clic (souris ET curseur virtuel de la télécommande) sur un os, un muscle, un vaisseau ouvre une fenêtre VISIBLE (opacité 1, dans l'écran,
   taille confortable, au premier plan) avec nom français et latin, rôle, vue 3D isolée qui tourne, bouton Isoler, avertissement. Mouvements et Pathologies : grandes fenêtres avec liste défilante
   et recherche. Plusieurs fenêtres en même temps (« Garder ouverte »). Muscles masqués par défaut. Lancer : node tests-navigateur/r2-anatomie-test.mjs */
const { verifier, fin } = compteur();
const L = +process.env.L || 1920, H = +process.env.H || 1080;
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: L, hauteur: H });
const ev = (f, ...a) => page.evaluate(f, ...a);
verifier('thème Aurore actif', await ev(() => document.body.classList.contains('g1')));
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
const ordre = (a, p = {}) => ev((a, p) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: a, params: p }), a, p);
await ev(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 90000 }); await attendre(1000);
await ordre('ouvrir_salle_medicale');
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 90000 }); await attendre(1500);

const ecranDe = nom => ev(nom => { const a = window.Saturne.anatomieObjet(), s = window.Saturne.salleObjet(); const c = a.index.centre(a.index.resoudre(nom)[0]); const v = a.racine.localToWorld(new (a.racine.position.constructor)(c[0], c[1], c[2])).project(s.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }, nom);
const visible = sel => ev(sel => { const el = document.querySelector(sel); if (!el) return { ok: false, raison: 'absente' }; const r = el.getBoundingClientRect(), c = getComputedStyle(el), m = document.elementFromPoint(r.x + r.width / 2, Math.min(innerHeight - 2, r.y + 24));
  return { ok: c.opacity === '1' && c.visibility === 'visible' && r.width >= 300 && r.height >= 200 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && !!m && el.contains(m), op: c.opacity, rect: [r.x, r.y, r.width, r.height].map(Math.round), auPremierPlan: !!m && el.contains(m) }; }, sel);
const virtuel = async (x, y) => { for (let i = 0; i < 80; i++) { const fini = await ev((x, y) => { const q = window.Telecommande.position(); if (Math.abs(x - q.x) < 1 && Math.abs(y - q.y) < 1) return true; window.Telecommande.appliquer({ a: 'pointeur', dx: Math.max(-140, Math.min(140, x - q.x)), dy: Math.max(-140, Math.min(140, y - q.y)) }); return false; }, x, y); if (fini) break; await attendre(15); } await attendre(200); await ev(() => window.Telecommande.appliquer({ a: 'clic', n: 1, bouton: 0 })); };

verifier('squelette seul par défaut (muscles masqués)', await ev(() => { const a = window.Saturne.anatomieObjet(); let m = 0; for (const [id, ms] of a.etat.meshs) { const p = a.index.parId.get(id); if (p && p.systeme === 'muscles' && ms.some(o => o.visible)) m++; } return m === 0; }));

// ── os : souris puis curseur virtuel ──
let p = await ecranDe('fémur gauche');
await page.mouse.move(p.x, p.y); await attendre(300); await page.mouse.click(p.x, p.y); await attendre(1800);
let v = await visible('.saf[data-id="fiche"]'); verifier('souris · clic sur un os : fiche visible', v.ok, JSON.stringify(v));
const txt = await ev(() => document.querySelector('.saf[data-id="fiche"]').innerText);
verifier('fiche : nom français, nom latin, rôle, avertissement', /fémur/i.test(txt) && /femur/i.test(txt) && /Rôle|Fonction|rôle/i.test(txt) && /à vérifier avec le cours/i.test(txt), txt.slice(0, 140).replace(/\n/g, ' | '));
verifier('fiche : bouton « Isoler »', await ev(() => !!document.querySelector('.saf[data-id="fiche"] [data-act="isoler"]')));
verifier('fiche : vue 3D de la pièce isolée, qui tourne', await ev(async () => { const v = window.Saturne.anatomieObjet().fenetres.vuePiece('fiche'); if (!v) return false; const a0 = v.etat.az; await new Promise(r => setTimeout(r, 900)); return v.etat.rendus > 2 && v.etat.az !== a0; }));
verifier('vue 3D : canvas non vide', await ev(() => { const cv = document.querySelector('.saf[data-id="fiche"] canvas'); if (!cv || cv.width < 50) return false; const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height; const c = t.getContext('2d'); c.drawImage(cv, 0, 0); const d = c.getImageData(0, 0, t.width, t.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 40) n++; return n > 200; }));
await ev(() => document.querySelector('.saf[data-id="fiche"] [data-act="isoler"]').click()); await attendre(500);
verifier('« Isoler » isole la pièce', await ev(() => window.Saturne.anatomieObjet().etat.isole === true || window.Saturne.anatomieObjet().etat.isole));
await ev(() => document.querySelector('.saf[data-id="fiche"] [data-act="isoler"]').click()); await attendre(300);
await ev(() => document.querySelector('.saf[data-id="fiche"] [data-act="epingler"]').click()); await attendre(800);
verifier('« Garder ouverte » crée une 2e fenêtre', await ev(() => document.querySelectorAll('.saf[data-id^="fiche"]').length === 2));
p = await ecranDe('humérus gauche'); await page.mouse.click(p.x, p.y); await attendre(1500);
verifier('plusieurs fiches en même temps (épinglée + courante)', await ev(() => document.querySelectorAll('.saf[data-id^="fiche"]').length === 2 && !!document.querySelector('.saf[data-id="fiche"]') && !!document.querySelector('.saf[data-id="fiche-' + window.Saturne.anatomieObjet().fenetres.etat.fiche + '"]') === false || document.querySelectorAll('.saf[data-id^="fiche"]').length >= 2));
await ev(() => window.Saturne.anatomieObjet().fenetres.fermerTout()); await attendre(400);
verifier('vues 3D libérées à la fermeture', await ev(() => window.Saturne.anatomieObjet().fenetres.vuesPieces().length === 0));

p = await ecranDe('fémur gauche'); await virtuel(p.x, p.y); await attendre(1800);
v = await visible('.saf[data-id="fiche"]'); verifier('télécommande · clic sur un os : fiche visible', v.ok, JSON.stringify([v, p, await ev(() => [window.Telecommande.position(), document.elementFromPoint(window.Telecommande.position().x, window.Telecommande.position().y)?.id, window.Saturne.anatomieObjet().etatPublic().survol])]));
await ev(() => window.Saturne.anatomieObjet().fenetres.fermerTout()); await attendre(300);

// ── muscle (demandé) ──
await ordre('afficher_systeme', { systeme: 'muscles' }); await attendre(1500);
const muscle = await ev(() => { const a = window.Saturne.anatomieObjet(); for (const n of ['deltoïde gauche', 'grand fessier gauche', 'quadriceps gauche', 'biceps brachial gauche']) { const r = a.index.resoudre(n); if (r && r[0]) return n; } return null; });
p = await ecranDe(muscle); await page.mouse.click(p.x, p.y); await attendre(1800);
v = await visible('.saf[data-id="fiche"]'); verifier('souris · clic sur un muscle (' + muscle + ') : fiche visible', v.ok, JSON.stringify(v));
const tm = await ev(() => document.querySelector('.saf[data-id="fiche"]')?.innerText || '');
verifier('fiche du muscle : insertions et actions', /insertion|origine/i.test(tm) && /action|fonction/i.test(tm), tm.slice(0, 200).replace(/\n/g, ' | '));
await ev(() => window.Saturne.anatomieObjet().fenetres.fermerTout());
// ── vaisseau ──
await ordre('afficher_systeme', { systeme: 'vaisseaux' }); await attendre(1500);
const vaisseau = await ev(() => { const a = window.Saturne.anatomieObjet(); for (const n of ['aorte', 'veine cave inférieure', 'artère fémorale gauche', 'artère carotide commune gauche']) { const r = a.index.resoudre(n); if (r && r[0]) return n; } return null; });
if (vaisseau) { p = await ecranDe(vaisseau); await page.mouse.click(p.x, p.y); await attendre(1800); v = await visible('.saf[data-id="fiche"]'); verifier('souris · clic sur un vaisseau (' + vaisseau + ') : fiche visible', v.ok, JSON.stringify(v)); } else verifier('vaisseau trouvé dans le modèle', false);
await ev(() => window.Saturne.anatomieObjet().fenetres.fermerTout());

// ── catalogues Mouvements / Pathologies : grandes fenêtres, liste défilante, recherche ──
await ev(() => document.querySelector('[data-a="cat-mouvements"]').click()); await attendre(1200);
v = await visible('.saf[data-id="catalogue-mouvements"]'); verifier('catalogue Mouvements : grande fenêtre visible', v.ok && v.rect[2] >= 500 && v.rect[3] >= 500, JSON.stringify(v));
verifier('catalogue Mouvements : liste défilante et recherche', await ev(() => { const c = document.querySelector('.saf[data-id="catalogue-mouvements"]'); return !!c.querySelector('input[type=search],input[type=text],input:not([type])') && c.querySelector('.saf-corps').scrollHeight >= c.querySelector('.saf-corps').clientHeight; }));
await ev(() => document.querySelector('[data-a="cat-pathologies"]').click()); await attendre(1200);
v = await visible('.saf[data-id="catalogue-pathologies"]'); verifier('catalogue Pathologies : grande fenêtre visible', v.ok && v.rect[2] >= 500 && v.rect[3] >= 500, JSON.stringify(v));
await ev(() => window.Saturne.anatomieObjet().fenetres.fermerTout()); await attendre(300);
await ordre('animer', { mouvement: 'squat' }); await attendre(2500);
const vm = await visible('.saf[data-id="mouvement"]'), v3 = await visible('.saf[data-id="vue3d"]');
verifier('fenêtre Mouvement : grande et lisible', vm.ok && vm.rect[2] >= 420 && vm.rect[3] >= 380, JSON.stringify(vm));
verifier('fenêtre vue 3D du mouvement : grande et lisible', v3.ok && v3.rect[2] >= 420 && v3.rect[3] >= 380, JSON.stringify(v3));
const tmv = await ev(() => document.querySelector('.saf[data-id="mouvement"]').innerText);
verifier('mouvement : agonistes, antagonistes, amplitudes', /agoniste/i.test(tmv) && /antagoniste/i.test(tmv) && /amplitude|°/i.test(tmv), tmv.slice(0, 160).replace(/\n/g, ' | '));
verifier('vue 3D du mouvement : lecture / pause / vitesse', await ev(() => !!document.querySelector('.saf[data-id="vue3d"] [data-v="lecture"]') && !!document.querySelector('.saf[data-id="vue3d"] [data-v="vitesse"]')));
await ev(() => window.Saturne.anatomieObjet().fenetres.fermerTout());
await ev(() => window.Saturne.anatomieObjet().orchestre.lancerPathologie('scol_adolescent', { valeur: 45 })); await attendre(2000);
const vp = await visible('.saf[data-id="pathologie"]'); verifier('fenêtre Pathologie : visible, grande', vp.ok && vp.rect[2] >= 420, JSON.stringify(vp));

console.log('erreurs page :', erreurs.filter(m => !/faireconomy|ERR_FAILED|404|Failed to load resource|CORS|bls\.gov|tradingview/i.test(m)).slice(0, 6));
await navigateur.close();
process.exit(fin() ? 1 : 0);
