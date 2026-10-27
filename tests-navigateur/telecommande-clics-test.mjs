import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre, compteur } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* R1 phase 1 : les clics VIRTUELS de la télécommande (Telecommande.appliquer, mêmes messages que la tablette : pointeur + clic) ouvrent
   - une fenêtre 3D de la base de Mars,
   - la fiche d'un os et d'un muscle de l'anatomie, puis les fenêtres explicatives (mouvement) et le gestionnaire de fenêtres,
   - une fenêtre de l'accueil. Lancer avec : node --import ./tests-navigateur/theme-jarvis-hook.mjs (pour Mars/Saturne) ; l'accueil est testé en thème Aurore par défaut dans une 2e page. */
const { verifier, fin } = compteur();
const L = 1600, H = 900;
const worker = await demarrerFauxWorkerMarche(8797);
const injecter = async p => { await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); }); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
verifier('télécommande chargée sur la page', await ev(() => !!window.Telecommande));
const pilote = p => ({
  async aller(x, y) {   // curseur virtuel jusqu'à (x, y), par pas de 120 px comme le pavé de la tablette
    for (let i = 0; i < 60; i++) {
      const fini = await p.evaluate((x, y) => { const q = window.Telecommande.position(); if (Math.abs(x - q.x) < 1 && Math.abs(y - q.y) < 1) return true; window.Telecommande.appliquer({ a: 'pointeur', dx: Math.max(-120, Math.min(120, x - q.x)), dy: Math.max(-120, Math.min(120, y - q.y)) }); return false; }, x, y);
      if (fini) break; await attendre(15);
    }
  },
  async tap(x, y, n = 1) { await this.aller(x, y); await attendre(150); await p.evaluate(n => window.Telecommande.appliquer({ a: 'clic', n, bouton: 0 }), n); }
});
const T = pilote(page);

// ── Mars : fenêtre holographique du salon ──
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur');
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.07, avancee: 0.2 })); await attendre(700);
const fens = await ev(() => window.Mars.positionsEcran());
const f = fens[1];
await T.aller(f.x, f.y); await attendre(300);
verifier('Mars : le survol virtuel met le curseur « main »', await ev(() => document.getElementById('scene3d').style.cursor === 'pointer'));
await T.tap(f.x, f.y); await attendre(1500);
const e = await ev(() => window.Mars.etat());
verifier('Mars : un clic virtuel ouvre l’espace de travail', e.fenetre === f.id && await ev(() => !!document.querySelector('.pn.large[data-id="mars-espace"]') || !!document.querySelector('.gf[data-id^="p-"]')), String(e.fenetre));
await T.tap(L - 4, H * 0.5); await attendre(600);
verifier('Mars : un clic ailleurs laisse le terminal (R2), Échap le ferme', (await ev(() => window.Mars.etat())).fenetre !== null); await ev(() => window.Telecommande.appliquer({ a: 'special', k: 'Escape' })); await attendre(900);
verifier('Mars : Échap virtuel ferme le terminal', (await ev(() => window.Mars.etat())).fenetre === null);

// ── Anatomie : os, muscle, fenêtres ──
await page.reload({ waitUntil: 'load' }); await attendre(1200);
await page.click('#btnOuvrirGalaxie'); await page.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini'), { timeout: 90000 }); await attendre(500);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
const ordre = (a, p = {}) => ev((a, p) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: a, params: p }), a, p);
await ev(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 60000 }); await attendre(1000);
await ordre('ouvrir_salle_medicale');
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 60000 }); await attendre(1500);
const ecranDe = nom => ev(nom => { const a = window.Saturne.anatomieObjet(), s = window.Saturne.salleObjet(); const c = a.index.centre(a.index.resoudre(nom)[0]); const v = a.racine.localToWorld(new (a.racine.position.constructor)(c[0], c[1], c[2])).project(s.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }, nom);
const wins = () => ev(() => window.Saturne.anatomieObjet().fenetres.fenetres.liste());
let p = await ecranDe('fémur gauche');
await T.aller(p.x, p.y); await attendre(400);
verifier('Anatomie : le survol virtuel affiche l’étiquette de l’os', await ev(() => !!window.Saturne.anatomieObjet().etatPublic().survol));
await T.tap(p.x, p.y); await attendre(900);
let w = await wins(); verifier('Anatomie : un clic virtuel sur un os ouvre sa fiche', w.some(x => x.id === 'fiche'), JSON.stringify(w.map(x => x.id)));
verifier('Anatomie : la fiche est entièrement dans l’écran', await ev(() => { const r = document.querySelector('.saf[data-id=fiche]')?.getBoundingClientRect(); return !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
await ordre('afficher_systeme', { systeme: 'muscles' }); await attendre(1500);
const nomMuscle = await ev(() => { const a = window.Saturne.anatomieObjet(); for (const n of ['deltoïde gauche', 'grand fessier gauche', 'quadriceps gauche', 'biceps brachial gauche']) { const r = a.index.resoudre(n); if (r && r[0]) return n; } return null; });
p = await ecranDe(nomMuscle);
await T.tap(p.x, p.y); await attendre(900);
verifier('Anatomie : un clic virtuel sur un muscle ouvre sa fiche (' + nomMuscle + ')', await ev(() => { const s = window.Saturne.anatomieObjet().etatPublic().selection; return s.length === 1 && /muscle/i.test(JSON.stringify(window.Saturne.anatomieObjet().index.parId.get(s[0]).systeme || s[0])); }), JSON.stringify(await ev(() => window.Saturne.anatomieObjet().etatPublic().selection)));
const ob = await ordre('animer', { mouvement: 'squat' }); await attendre(2500);
w = await wins();
verifier('Anatomie : fenêtres « mouvement » et vue rapprochée affichées', ['mouvement', 'vue3d'].every(i => w.some(x => x.id === i)), JSON.stringify(w.map(x => x.id)));
verifier('Anatomie : fenêtres entièrement dans l’écran', await ev(() => [...document.querySelectorAll('.saf')].every(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })));
// gestionnaire de fenêtres au clic virtuel : Réduire tout, Réorganiser, Tout fermer
const clicSur = async sel => { const r = await ev(sel => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel); if (!r) return false; await T.tap(r.x, r.y); await attendre(500); return true; };
verifier('Gestionnaire : « Réduire tout » au clic virtuel', await clicSur('.saf-barre [data-g=reduire]') && (await wins()).every(x => x.reduite));
await clicSur('.saf-barre [data-g=reduire]');
verifier('Gestionnaire : « Réorganiser » sans recouvrement', await clicSur('.saf-barre [data-g=ranger]') && (await ev(() => window.Saturne.anatomieObjet().fenetres.fenetres.recouvrements().length)) === 0);
verifier('Gestionnaire : « Tout fermer »', await clicSur('.saf-barre [data-g=fermer]') && (await wins()).length === 0);

// ── Accueil : une fenêtre s'ouvre au clic virtuel ──
const acc = await navigateur.newPage(); await acc.setViewport({ width: L, height: H });
await acc.evaluateOnNewDocument(() => { window.__RAYLE_TB_TEST__ = { sansReseau: true }; localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.setItem('rayle_theme', 'aurore'); });
await acc.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'load' }); await attendre(3500);
const A = pilote(acc);
const cible = await acc.evaluate(() => { const el = document.querySelector('.g1-ic[data-i=vie] .g1-ic-r'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
verifier('Accueil : l’icône « Vie » du dock existe', !!cible);
if (cible) {
  await A.tap(cible.x, cible.y); await attendre(900);
  verifier('Accueil : un clic virtuel sur le dock ouvre la grande fenêtre', await acc.evaluate(() => window.G1.courant() === 'meteo' && !document.getElementById('g1Fen').hidden));
  const x = await acc.evaluate(() => { const r = document.getElementById('g1FenX').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await A.tap(x.x, x.y); await attendre(900);
  verifier('Accueil : un clic virtuel sur ✕ la ferme', await acc.evaluate(() => window.G1.courant() === null));
}

console.log('erreurs page :', erreurs.filter(m => !/faireconomy|ERR_FAILED|404|Failed to load resource|CORS|bls\.gov/.test(m)).slice(0, 5));
await navigateur.close(); worker.close && worker.close();
process.exit(fin() ? 1 : 0);
