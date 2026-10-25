import { ouvrirGalaxieTheme, attendre, compteur } from './r2-aide.mjs';

/* R3 phase 3 : ANATOMIE (thème Aurore). Dossiers Os, Muscles, Vaisseaux, Nerfs, Organes, Mouvements, Pathologies ; carrousel avec recherche ; sortir une fiche (épinglée) ; la remettre ;
   souris, clavier, curseur virtuel ; mémoire après rechargement ; tiroir global. Lancer : node tests-navigateur/r3-anatomie-test.mjs */
const { verifier, fin } = compteur();
const L = 1920, H = 1080;
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: L, hauteur: H });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
const ordre = (a, p = {}) => ev((a, p) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: a, params: p }), a, p);
await ev(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 90000 }); await attendre(1000);
await ordre('ouvrir_salle_medicale');
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 90000 }); await attendre(1500);
const fens = () => ev(() => [...document.querySelectorAll('#sa-fenetres .saf')].map(e => e.dataset.id).sort());
const carr = () => ev(() => { const v = document.querySelector('.dos-voile'); if (!v) return null; const cs = [...v.querySelectorAll('.dos-carte')]; return { n: cs.length, centre: cs.findIndex(c => c.classList.contains('centre')), titre: v.querySelector('.dos-titre-carte').textContent }; });
const centreDe = sel => ev(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
const virtuel = async (x, y) => { for (let i = 0; i < 80; i++) { const fini = await ev((x, y) => { const q = window.Telecommande.position(); if (Math.abs(x - q.x) < 1 && Math.abs(y - q.y) < 1) return true; window.Telecommande.appliquer({ a: 'pointeur', dx: Math.max(-140, Math.min(140, x - q.x)), dy: Math.max(-140, Math.min(140, y - q.y)) }); return false; }, x, y); if (fini) break; await attendre(15); } await attendre(200); };

verifier('le panneau d’anatomie a le bouton « Dossiers… »', await ev(() => !!document.querySelector('#s-anat [data-a="dossiers"]')));
await ev(() => document.querySelector('#s-anat [data-a="dossiers"]').click()); await attendre(600);
const dos = await ev(() => [...document.querySelectorAll('.dos-classeur')].map(b => b.querySelector('.dos-onglet b').textContent + ':' + b.querySelector('.dos-n').textContent));
verifier('7 dossiers : Os, Muscles, Vaisseaux, Nerfs, Organes, Mouvements, Pathologies', dos.map(x => x.split(':')[0]).join() === 'Os,Muscles,Vaisseaux,Nerfs,Organes,Mouvements,Pathologies', dos.join());
verifier('chaque dossier contient des fenêtres', dos.every(x => +x.split(':')[1] > 0));
verifier('par défaut seul le mur de dossiers est affiché (aucune fiche)', (await fens()).join() === 'dossiers', (await fens()).join());

// ── Os : carrousel, recherche, sortir ──
let c0 = await centreDe('.dos-classeur[data-dos="os"]'); await page.mouse.click(c0.x, c0.y); await attendre(1000);
let c = await carr(); verifier('un clic sur « Os » ouvre le carrousel', c && c.n > 100, JSON.stringify(c));
verifier('un grand dossier a une zone de recherche', await ev(() => !!document.querySelector('.dos-voile .dos-filtre')));
await page.type('.dos-voile .dos-filtre', 'femur'); await attendre(500); c = await carr();
verifier('la recherche « femur » (sans accent) réduit le carrousel', c && c.n >= 1 && c.n < 10 && /f[ée]mur/i.test(c.titre), JSON.stringify(c));
await page.keyboard.press('Tab'); await attendre(100);
await ev(() => document.querySelector('.dos-voile').focus());
const cc = await centreDe('.dos-carte.centre'); await page.mouse.click(cc.x, cc.y); await attendre(2000);
let f = await fens(); verifier('la fiche sort du dossier : une fenêtre de fiche est posée', f.some(x => /^fiche/.test(x)), f.join());
const wid = f.find(x => /^fiche/.test(x));
verifier('la fiche a le bouton « remettre dans son dossier »', await ev(w => { const b = document.querySelector('.saf[data-id="' + w + '"] [data-b="ranger"]'); return !!b && !b.hidden; }, wid));
verifier('le classeur Os affiche « 1 posée »', await ev(() => /1 posée/.test(document.querySelector('.dos-classeur[data-dos="os"] .dos-pos').textContent)));
await ev(w => document.querySelector('.saf[data-id="' + w + '"] [data-b="ranger"]').click(), wid); await attendre(1200);
f = await fens(); verifier('« remettre » : la fiche retourne dans son dossier', !f.some(x => /^fiche/.test(x)), f.join());

// ── Muscles, clavier ──
c0 = await centreDe('.dos-classeur[data-dos="muscles"]'); await page.mouse.click(c0.x, c0.y); await attendre(1000);
c = await carr(); verifier('dossier Muscles : plus de 50 cartes', c && c.n > 50, JSON.stringify(c));
await page.keyboard.press('ArrowRight'); await attendre(700); const c1 = await carr(); verifier('flèche droite : carte suivante', c1.centre === 1, JSON.stringify(c1) + ' actif=' + (await ev(() => document.activeElement.className || document.activeElement.tagName)));
await page.keyboard.press('Enter'); await attendre(1800); f = await fens(); verifier('Entrée sort la carte du centre', f.some(x => /^fiche/.test(x)), f.join());

// ── Mouvements et Pathologies ──
await ev(() => window.Saturne.anatomieObjet().orchestre.ouvrirDossier('mouvements')); await attendre(1000);
c = await carr(); verifier('dossier Mouvements : ≥ 26 cartes', c && c.n >= 26, JSON.stringify(c));
await page.keyboard.press('Escape'); await attendre(600);
await ev(() => window.Saturne.anatomieObjet().orchestre.ouvrirDossier('pathologies')); await attendre(1000);
c = await carr(); verifier('dossier Pathologies : ≥ 100 cartes', c && c.n >= 100, JSON.stringify(c));
await page.type('.dos-voile .dos-filtre', 'scoliose'); await attendre(500);
const cp = await centreDe('.dos-carte.centre'); await page.mouse.click(cp.x, cp.y); await attendre(4000);
f = await fens(); verifier('une pathologie sortie ouvre sa fenêtre explicative', f.includes('pathologie'), f.join());
verifier('la fenêtre explicative garde l’avertissement « pas un outil de diagnostic »', await ev(() => /diagnostic/i.test(document.querySelector('.saf[data-id="pathologie"]').innerText)));

// ── curseur virtuel (télécommande) ──
await ev(() => window.Saturne.anatomieObjet().orchestre.fenetres.fermerTout && 0); await ev(() => { const F = window.Saturne.anatomieObjet().orchestre.fenetres; for (const f of F.liste()) F.fermer(f.id); }); await attendre(300);
await ev(() => document.querySelector('#s-anat [data-a="dossiers"]').click()); await attendre(500);
const cv = await centreDe('.dos-classeur[data-dos="vaisseaux"]'); await virtuel(cv.x, cv.y); await ev(() => window.Telecommande.appliquer({ a: 'clic', n: 1, bouton: 0 })); await attendre(1000);
c = await carr(); verifier('télécommande : un clic virtuel ouvre le dossier Vaisseaux', c && c.n > 100, JSON.stringify(c));
verifier('un seul carrousel ouvert à la fois', (await ev(() => document.querySelectorAll('.dos-voile').length)) === 1);
await attendre(1500); await virtuel(L / 2, H / 2 - 60); await ev(() => window.Telecommande.appliquer({ a: 'defile', dx: 0, dy: 120 })); await attendre(1000);
verifier('télécommande : la molette virtuelle fait défiler', (await carr()).centre === 1, JSON.stringify(await carr()) + await ev(() => { const q = window.Telecommande.position(), e = document.elementFromPoint(q.x, q.y); return [q.x, q.y, e && e.tagName + '.' + e.className]; }));
await page.keyboard.press('Escape'); await attendre(600);

// ── mémoire des fenêtres posées ──
const memo = await ev(() => JSON.parse(localStorage.getItem('rayle_fenetres_anatomie') || '{}'));
verifier('les positions des fenêtres posées sont mémorisées', Object.keys(memo).length >= 2, Object.keys(memo).join());

// ── menu et épinglage d'une fiche ──
const wf = (await fens()).find(x => /^fiche/.test(x));
if (wf) {
  const t = await ev(w => { const r = document.querySelector('.saf[data-id="' + w + '"] .saf-t').getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; }, wf);
  await page.mouse.click(t.x, t.y, { button: 'right' }); await attendre(300);
  verifier('clic droit sur une fiche : menu avec « Ranger dans son dossier »', await ev(() => !!document.querySelector('.gfx-menu') && /Ranger dans son dossier/.test(document.querySelector('.gfx-menu').textContent)));
  await ev(() => document.querySelector('.gfx-menu [data-m="epingler"]').click()); await attendre(200);
  verifier('épingler une fiche', await ev(w => document.querySelector('.saf[data-id="' + w + '"]').classList.contains('gfx-epingle'), wf));
}

// ── tiroir global ──
await ev(() => window.TiroirFenetres.ouvrir()); await attendre(400);
const tir = await ev(() => ({ n: document.querySelectorAll('.tf-f').length, vues: [...document.querySelectorAll('.tf-vue h3')].map(h => h.textContent), dos: [...document.querySelectorAll('.tf-dossier h4')].map(x => x.textContent.replace(/\d+$/, '').trim()) }));
verifier('le tiroir liste l’anatomie par dossier (Os, Muscles, Mouvements, Pathologies…)', tir.vues.includes('Anatomie') && ['Os', 'Muscles', 'Mouvements', 'Pathologies'].every(d => tir.dos.includes(d)) && tir.n > 500, JSON.stringify({ n: tir.n, vues: tir.vues }));
await page.type('.tf-panneau input', 'humerus'); await attendre(300);
verifier('la recherche du tiroir trouve des os', (await ev(() => document.querySelectorAll('.tf-f').length)) >= 1);
console.log('erreurs page :', erreurs.filter(m => !/faireconomy|ERR_FAILED|404|Failed to load resource|CORS|bls\.gov|tradingview/i.test(m)).slice(0, 6));
await navigateur.close(); process.exit(fin() ? 1 : 0);
