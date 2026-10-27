/* T1 : chevauchements de l'interface de la Terre à 1366, 1920, 2560 et en vertical. Détecte les rectangles qui se recouvrent.
   Usage : node tests-navigateur/terre-t1-hud-test.mjs [dossier de captures] */
import { ouvrirGalaxie, entrerEnOrbite, attendre, compteur } from './terre-aide.mjs';
import fs from 'node:fs';
const dossier = process.argv[2] || 'docs/captures-t1/hud';
fs.mkdirSync(dossier, { recursive: true });
const c = compteur();
const TAILLES = [[1366, 768], [1920, 1080], [2560, 1440], [820, 1180], [390, 844]];
/* éléments d'habillage qui ne doivent jamais se recouvrir (sélecteur, nom lisible) */
const ELEMENTS = [
  ['#vueGalaxie .g-reglages', 'qualité/images par seconde'], ['#vueGalaxie #g-parole', 'état de Raylé'], ['#terre-ui .t-titre', 'titre'],
  ['#terre-ui .t-recherche', 'recherche'], ['#terre-ui .t-boutons', 'boutons'], ['#terre-ui .t-mesures', 'mesures'], ['#terre-ui .t-aide', 'aide'],
  ['#terre-ui .t-credits', 'crédits'], ['#terre-ui .t-bandeau', 'bandeau'], ['#terre-ui .t-message', 'message'], ['#terre-ui .t-radar', 'radar'],
  ['#terre-ui .t-panneau', 'réglages Terre'], ['#terre-ui .t-credits-panneau', 'panneau crédits'], ['#terre-ui .t-actions', 'actions de recherche'], ['#vueGalaxie #fil', 'fil d’Ariane']
];
for (const [L, H] of TAILLES) {
  const { navigateur, page } = await ouvrirGalaxie({ largeur: L, hauteur: H });
  await entrerEnOrbite(page);
  await page.evaluate(() => window.Terre.placer({ lon: 2.35, lat: 48.85, dist: 30, cap: 0.3, incl: 0.9 }));
  await attendre(2500);
  // éléments éphémères rendus visibles pour le test (même structure que la vraie interface)
  await page.evaluate(() => {
    const ui = document.querySelector('#terre-ui');
    const q = s => ui.querySelector(s);
    q('.t-radar').hidden = false;
    const b = document.createElement('div'); b.className = 't-bandeau'; b.innerHTML = '<span class="t-bd-t">ACTUALITÉS</span><div class="t-bd-v"><span class="t-bd-piste">test</span></div>'; ui.appendChild(b);
    q('.t-message').textContent = 'Message de test'; q('.t-message').hidden = false;
    q('.t-actions').innerHTML = '<button>Météo · Paris</button><button>Actualités · France</button>'; q('.t-actions').hidden = false;
    q('.t-panneau').hidden = false; ui.classList.add('t-panneau-ouvert');
  });
  await attendre(400);
  const mesurer = els => {
    const r = [];
    for (const [sel, nom] of els) { const e = document.querySelector(sel); if (!e) continue; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (b.width < 2 || b.height < 2 || cs.display === 'none' || cs.visibility === 'hidden') continue; r.push({ nom, x: b.left, y: b.top, w: b.width, h: b.height }); }
    const inter = [];
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const a = r[i], b = r[j], dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (dx > 3 && dy > 3) inter.push(a.nom + ' ✕ ' + b.nom + ' (' + Math.round(dx) + '×' + Math.round(dy) + ')');
    }
    const hors = r.filter(a => a.x < -1 || a.y < -1 || a.x + a.w > innerWidth + 1 || a.y + a.h > innerHeight + 1).map(a => a.nom);
    const nonLisible = [...document.querySelectorAll('#terre-ui select, #vueGalaxie .g-reglages select')].filter(s => !s.selectedOptions.length || /n\/a/i.test(s.selectedOptions[0].textContent)).map(s => s.id || s.dataset.r || 'select');
    const na = /N\/A/.test(document.querySelector('#vueGalaxie').innerText);
    return { inter, hors, nonLisible, na, n: r.length };
  };
  for (const [scenario, ouvrir] of [['réglages ouverts', () => {}], ['crédits ouverts', () => { document.querySelector('#terre-ui [data-a="credits"]').click(); }]]) {
    await page.evaluate(ouvrir);
    await attendre(300);
    const res = await page.evaluate(mesurer, ELEMENTS);
    await page.screenshot({ path: `${dossier}/hud-${L}x${H}-${scenario.split(' ')[0]}.png` });
    c.verifier(`${L}×${H} (${scenario}) : aucun chevauchement`, res.inter.length === 0, res.inter.join(' | '));
    c.verifier(`${L}×${H} (${scenario}) : rien hors écran`, res.hors.length === 0, res.hors.join(', '));
    c.verifier(`${L}×${H} (${scenario}) : pas de champ « N/A » ni de liste sans valeur`, !res.na && res.nonLisible.length === 0, res.nonLisible.join(', '));
  }
  await navigateur.close();
}
process.exit(c.fin() ? 1 : 0);
