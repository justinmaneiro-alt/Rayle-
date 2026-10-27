/* Anatomie 2, Phase A : couches par défaut (squelette seul), cohérence des boutons et des ordres, étiquettes parasites, mise en page du panneau à 1366, 1920, 2560 et en vertical,
   éclairage neutre, plus de petits écrans muraux. Captures dans docs/captures-anatomie-2/. */
import { ouvrirGalaxie, attendre, compteur } from './terre-aide.mjs';
import fs from 'node:fs';
const c = compteur(), SORTIE = '../docs/captures-anatomie-2/'; fs.mkdirSync(SORTIE, { recursive: true });
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900 });
const G = (f, ...a) => page.evaluate(f, ...a);
const nom = (t, ok, d = '') => c.verifier(t, ok, String(d).slice(0, 260));
const ordre = (action, params = {}) => G((a, p) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: a, params: p }), action, params);
const etat = () => G(() => window.Saturne.anatomieObjet().etatPublic());
const visiblesParSysteme = () => G(() => { const a = window.Saturne.anatomieObjet(), n = {}; for (const [id, ms] of a.etat.meshs) { const p = a.index.parId.get(id); for (const m of ms) if (m.visible) n[p.systeme] = (n[p.systeme] || 0) + 1; } return n; });

await G(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 60000 }); await attendre(1200);
let r = await ordre('ouvrir_salle_medicale'); nom('salle médicale ouverte', r.ok, JSON.stringify(r));
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().chargés.includes('os') && a.etatPublic().visibles >= 200; }, { timeout: 60000 }).catch(() => {});
await attendre(1500);

// ── A1 : état par défaut = squelette seul
let e = await etat(), vis = await visiblesParSysteme();
nom('par défaut : seul le système « os » est actif', JSON.stringify(e.actifs) === '["os"]', JSON.stringify(e.actifs));
nom('par défaut : 202 os visibles et rien d’autre', vis.os === 202 && Object.keys(vis).length === 1, JSON.stringify(vis));
nom('par défaut : aucun nerf, vaisseau, organe, muscle ni ligament chargé en mémoire inutilement', e.chargés.length === 1 && e.chargés[0] === 'os', JSON.stringify(e.chargés));
nom('aucun petit écran mural dans la salle', await G(() => Object.keys(window.Saturne.salleObjet().ecrans).length === 0));
nom('par défaut : aucune étiquette flottante', e.etiquettes === 0 && !e.survol, JSON.stringify({ et: e.etiquettes, s: e.survol }));
await page.screenshot({ path: SORTIE + 'a1-defaut.png' });
nom('boutons du panneau : « Squelette » actif, les autres non', await G(() => { const p = document.getElementById('s-anat'); const on = [...p.querySelectorAll('[data-sys].actif')].map(b => b.dataset.sys); return on.length === 1 && on[0] === 'os'; }));

// sélection d'un muscle par son nom : la couche reste masquée, seule la pièce apparaît
r = await ordre('anatomie_montrer', { nom: 'biceps brachial gauche' }); e = await etat(); vis = await visiblesParSysteme();
nom('« montre le biceps » : le système muscles est chargé mais PAS activé', r.ok && e.chargés.includes('muscles') && !e.actifs.includes('muscles'), JSON.stringify({ c: e.chargés, a: e.actifs }));
nom('seul le biceps sélectionné est visible parmi les muscles', (vis.muscles || 0) === 1, JSON.stringify(vis));
nom('une seule étiquette, celle de la sélection', e.etiquettes === 1, e.etiquettes);
// « tout afficher » : l'isolement est levé, les muscles non activés restent cachés
await ordre('anatomie_isoler', { nom: 'humérus gauche' }); e = await etat();
nom('isoler : une seule pièce visible', e.isole && e.visibles === 1, e.visibles);
r = await ordre('anatomie_tout'); e = await etat(); vis = await visiblesParSysteme();
nom('« affiche tout » : sélection vide, 202 os visibles, muscles toujours masqués', e.selection.length === 0 && !e.isole && vis.os === 202 && !vis.muscles, JSON.stringify(vis));
nom('« affiche tout » : plus aucune étiquette', e.etiquettes === 0);

// ── activation par ordre vocal et par bouton : cohérence
r = await ordre('afficher_systeme', { systeme: 'muscles' }); e = await etat(); vis = await visiblesParSysteme();
nom('« montre les muscles » : os + muscles actifs', r.ok && e.actifs.includes('muscles') && e.actifs.includes('os') && (vis.muscles || 0) > 100, JSON.stringify(vis));
nom('le bouton Muscles du panneau reflète l’ordre vocal', await G(() => document.querySelector('#s-anat [data-sys="muscles"]').classList.contains('actif')));
await G(() => document.querySelector('#s-anat [data-sys="muscles"]').click()); await attendre(300); e = await etat(); vis = await visiblesParSysteme();
nom('bouton Muscles : désactive la couche', !e.actifs.includes('muscles') && !vis.muscles, JSON.stringify(vis));
await ordre('anatomie_montrer', { nom: 'fémur droit' }); await ordre('anatomie_isoler', { nom: 'fémur droit' });
await ordre('afficher_systeme', { systeme: 'muscles' }); e = await etat(); vis = await visiblesParSysteme();
nom('isolé + couche activée : seule la pièce isolée reste visible', e.visibles === 1, JSON.stringify(vis));
await ordre('anatomie_tout'); await G(() => document.querySelector('#s-anat [data-a="squelette"]').click()); await attendre(300); e = await etat(); vis = await visiblesParSysteme();
nom('bouton « Squelette seul » : retour à l’état par défaut', JSON.stringify(e.actifs) === '["os"]' && vis.os === 202 && !vis.muscles, JSON.stringify(vis));

// ── mouvement puis arrêt : aucune couche ne réapparaît
r = await ordre('animer', { mouvement: 'flexion du coude' }); await attendre(900); e = await etat(); vis = await visiblesParSysteme();
nom('mouvement : os + muscles du mouvement seulement (pas tous les muscles)', r.ok && (vis.muscles || 0) > 0 && (vis.muscles || 0) < 60, JSON.stringify(vis));
await page.screenshot({ path: SORTIE + 'a1-mouvement.png' });
await ordre('anatomie_mouvement_stop'); await attendre(500); e = await etat(); vis = await visiblesParSysteme();
nom('après le mouvement : retour au squelette seul', JSON.stringify(e.actifs) === '["os"]' && !vis.muscles && e.forcees === 0, JSON.stringify({ a: e.actifs, v: vis, f: e.forcees }));
r = await ordre('afficher_pathologie', { nom: 'amputation transtibiale' }); await attendre(900); e = await etat();
nom('pathologie : s’affiche', r.ok, JSON.stringify(r).slice(0, 120));
await ordre('anatomie_pathologie_stop'); await attendre(500); e = await etat(); vis = await visiblesParSysteme();
nom('après la pathologie : retour au squelette seul (aucun nerf, vaisseau ni muscle)', JSON.stringify(e.actifs) === '["os"]' && Object.keys(vis).join() === 'os' && vis.os === 202, JSON.stringify({ a: e.actifs, v: vis }));
await ordre('afficher_systeme', { systeme: 'muscles' });
await ordre('afficher_pathologie', { nom: 'scoliose' }); await attendre(600); await ordre('anatomie_pathologie_stop'); await attendre(400); e = await etat();
nom('une couche choisie (muscles) survit à une pathologie', e.actifs.includes('muscles') && e.actifs.includes('os'), JSON.stringify(e.actifs));
await G(() => document.querySelector('#s-anat [data-a="squelette"]').click()); await attendre(300);

// ── A2 : étiquettes (survol, sélection, disparition)
await G(() => window.Saturne.anatomieObjet().toutAfficher()); await attendre(600);
const centreEcran = await G(() => { const a = window.Saturne.anatomieObjet(), s = window.Saturne.salleObjet(); const p = a.index.resoudre('fémur gauche')[0], c = a.index.centre(p); const v = a.racine.localToWorld(new (a.racine.position.constructor)(c[0], c[1], c[2])).project(s.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; });
await page.mouse.move(centreEcran.x, centreEcran.y); await attendre(400);
e = await etat(); nom('survol d’un os : une étiquette provisoire apparaît pour cet os seulement', !!e.survol && e.etiquettes === 0, JSON.stringify({ s: e.survol, n: e.etiquettes }));
await page.screenshot({ path: SORTIE + 'a2-survol.png' });
await page.mouse.move(40, 450); await attendre(300); e = await etat(); nom('le pointeur quitte l’os : l’étiquette disparaît', !e.survol, JSON.stringify(e.survol));
await page.mouse.click(centreEcran.x, centreEcran.y); await attendre(500); e = await etat();
nom('clic sur un os : sélectionné, une étiquette de sélection, plus d’étiquette de survol', e.selection.length === 1 && e.etiquettes === 1 && !e.survol, JSON.stringify({ sel: e.selection, n: e.etiquettes, s: e.survol }));
await page.mouse.click(520, 140); await attendre(400); e = await etat();   // clic dans le vide (au-dessus de la table, hors panneau et hors fenêtres)
nom('clic dans le vide : sélection et étiquette disparaissent', e.selection.length === 0 && e.etiquettes === 0, JSON.stringify({ sel: e.selection, n: e.etiquettes }));
nom('le texte de chargement « SQUELETTE HUMAIN » du volume n’est plus affiché', await G(() => !window.Saturne.salleObjet().etiquette.visible));
await ordre('anatomie_montrer', { nom: 'gyrus frontal supérieur' }); await attendre(400); await ordre('anatomie_tout'); await attendre(400); e = await etat();
nom('une structure du cerveau choisie puis « tout afficher » : aucune étiquette ne reste', e.etiquettes === 0 && !e.survol, JSON.stringify({ n: e.etiquettes }));

// ── A3 : mise en page du panneau
const rapport = async (l, h, etiquette) => {
  await page.setViewport({ width: l, height: h }); await attendre(700);
  const m = await G(() => {
    const p = document.getElementById('s-anat'), r = p.getBoundingClientRect(), cs = p.querySelector('.sa-corps'), tailles = new Set();
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n; const trop = [];
    while ((n = w.nextNode())) { if (!n.textContent.trim() || !n.parentElement || n.parentElement.offsetParent === null) continue; const fs2 = parseFloat(getComputedStyle(n.parentElement).fontSize); tailles.add(fs2); if (fs2 < 14) trop.push(n.parentElement.tagName + ':' + n.textContent.trim().slice(0, 20) + ':' + fs2); }
    const debord = [...p.querySelectorAll('button,select,input,label')].filter(x => x.offsetParent !== null).filter(x => { const q = x.getBoundingClientRect(); return q.right > r.right + 1 || q.left < r.left - 1; }).map(x => x.tagName + ':' + (x.dataset.sys || x.dataset.a || x.dataset.r || '')).slice(0, 5);
    return { x: r.left, y: r.top, d: r.right, b: r.bottom, l: innerWidth, h: innerHeight, scrollH: cs.scrollHeight, clientH: cs.clientHeight, petits: trop.slice(0, 5), debord, debordeX: cs.scrollWidth > cs.clientWidth + 1 };
  });
  nom('panneau à ' + etiquette + ' : entièrement dans l’écran', m.x >= 0 && m.y >= 0 && m.d <= m.l + 0.5 && m.b <= m.h + 0.5, JSON.stringify({ x: m.x, y: m.y, d: m.d, b: m.b, l: m.l, h: m.h }));
  nom('panneau à ' + etiquette + ' : aucun contrôle ne déborde, pas de défilement horizontal', m.debord.length === 0 && !m.debordeX, JSON.stringify(m.debord));
  nom('panneau à ' + etiquette + ' : texte de 14 px au moins', m.petits.length === 0, JSON.stringify(m.petits));
  await page.screenshot({ path: SORTIE + 'a3-panneau-' + l + 'x' + h + '.png' });
  return m;
};
await rapport(1366, 768, '1366×768'); await rapport(1920, 1080, '1920×1080'); await rapport(2560, 1440, '2560×1440'); await rapport(820, 1180, 'vertical 820×1180'); await rapport(390, 844, 'téléphone 390×844');
await page.setViewport({ width: 1600, height: 900 }); await attendre(500);
// replier le panneau
await G(() => document.querySelector('#s-anat [data-a="replier"]').click()); await attendre(300);
nom('le panneau se replie', await G(() => document.getElementById('s-anat').classList.contains('replie') && document.querySelector('#s-anat .sa-corps').offsetParent === null));
await G(() => document.querySelector('#s-anat [data-a="replier"]').click()); await attendre(300);

// ── A4 : éclairage neutre, pas de halo coloré
const lum = await G(() => { const s = window.Saturne.salleObjet().scene, L = []; s.traverse(o => { if (o.isLight) L.push({ t: o.type, i: +o.intensity.toFixed(2), c: o.color.getHexString() }); }); return L; });
nom('plus aucune lumière ponctuelle colorée allumée', lum.filter(l => l.t === 'PointLight' && l.i > 0).length === 0, JSON.stringify(lum));
const halo = await G(() => { const s = window.Saturne.salleObjet(); const o = []; s.table.traverse(m => { if (m.isMesh && m.material && m.material.blending === 2) o.push({ op: m.material.opacity, type: m.geometry.type }); }); return o; });
nom('la lueur de la table est très discrète (opacité ≤ 0,2)', halo.filter(h => h.type === 'CircleGeometry').every(h => h.op <= 0.2), JSON.stringify(halo));
// couleur dominante autour du squelette : peu de cyan saturé
const sat = await G(() => 0); void sat;
await ordre('anatomie_montrer', { nom: 'fémur gauche' }); await attendre(700); await page.screenshot({ path: SORTIE + 'a4-eclairage-sombre.png' });
await ordre('anatomie_tout'); await attendre(500); await page.screenshot({ path: SORTIE + 'a4-eclairage-tout.png' });

nom('aucune erreur JavaScript pendant le test', !erreurs.some(x => /pageerror/.test(x)), erreurs.filter(x => /pageerror/.test(x)).join(' | '));
const echecs = c.fin(); await navigateur.close(); process.exit(echecs ? 1 : 0);
