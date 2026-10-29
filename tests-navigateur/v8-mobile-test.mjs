// V8 : test de la coque mobile (téléphone, tablette, paysage) avec faux Worker et fausses sources. node tests-navigateur/v8-mobile-test.mjs [telephone|tablette]
import fs from 'node:fs';
import { ouvrirMobile, attendre, galaxieChargee, texte, existe, visible, recouvert } from './v8-aide.mjs';
import { dire } from './v7b-aide.mjs';
const cles = process.argv[2] ? [process.argv[2]] : ['telephone', 'tablette'];
fs.mkdirSync('docs/captures-v8', { recursive: true });
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) { ok++; console.log('OK  ' + n); } else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const ev = (p, f, ...a) => p.evaluate(f, ...a);
const ecran = p => ev(p, () => document.documentElement.dataset.mEcran);
const aller = async (p, e, ms = 1200) => { await ev(p, e2 => MobileCoque.aller(e2), e); await attendre(ms); };

for (const cle of cles) {
  console.log('\n══ ' + cle + ' ══');
  const o = await ouvrirMobile(cle, { attente: 4200 }), p = o.page, w = o.worker;
  const nav = await ev(p, () => ({ m: RayleAppareil.mode(), classes: document.documentElement.className }));
  v('mode ' + cle + ' et coque mobile active', nav.m === cle && /m-pret/.test(nav.classes), JSON.stringify(nav));
  v('aucun fichier de Galaxie chargé', galaxieChargee(o.requetes).length === 0, galaxieChargee(o.requetes).map(r => r.url).join(','));
  v('thème Jarvis, pas d’Aurore', await ev(p, () => !document.body.classList.contains('g1') && !window.G1));

  // ── accueil ──
  v('accueil : entité visible', await visible(p, '#reactor'));
  for (const c of ['heure', 'meteo', 'agent', 'actus', 'marche']) v('accueil : carte « ' + c + ' » présente', await existe(p, '[data-carte="' + c + '"]'));
  v('accueil : la barre du bas a 5 entrées dont la voix', await ev(p, () => document.querySelectorAll('#m-nav button').length === 5 && !!document.getElementById('m-voix')));
  v('plus d’icône dossier flottante', !(await visible(p, '#tfBouton')) && !(await visible(p, '.tf-bouton')));
  const recouverts = [];
  for (const s of ['#m-nav [data-ecran="agent"]', '#m-nav [data-ecran="actus"]', '#m-nav [data-ecran="plus"]', '#m-voix', '#m-ecrire', '#m-puce-lien']) if (await recouvert(p, s)) recouverts.push(s);
  v('aucun bouton principal recouvert', recouverts.length === 0, recouverts.join(','));
  await attendre(1800);
  v('accueil : heure affichée', /\d\d:\d\d/.test(await texte(p, '[data-h]')));
  v('accueil : carte marchés avec 5 lignes et mini-courbes', await ev(p, () => document.querySelectorAll('[data-carte="marche"] .m-m').length === 5 && document.querySelectorAll('[data-carte="marche"] .m-spark path[d]').length >= 4));
  v('accueil : marchés réels (prix et variation, pas de « — »)', await ev(p, () => [...document.querySelectorAll('[data-carte="marche"] .m-m:not(.vide) .m-p')].every(e => /\d/.test(e.textContent)) && document.querySelectorAll('[data-carte="marche"] .m-m:not(.vide)').length >= 3));
  v('accueil : carrousel d’actualités avec images', await ev(p, () => document.querySelectorAll('.m-car-s').length >= 3 && !!document.querySelector('.m-car-img img')));
  v('accueil : bandeau défilant', await visible(p, '[data-bandeau] .m-defile-i'));
  v('accueil : agent, positions du jour comptées, mise à jour datée', /3\s*\n?\s*position/.test(await texte(p, '[data-carte="agent"]')) && /mise à jour il y a/.test(await texte(p, '[data-carte="agent"]')), await texte(p, '[data-carte="agent"]'));
  v('accueil : aucun « Chargement… » ni squelette resté', await ev(p, () => !document.querySelector('#m-accueil .m-squelette') && !/Chargement…|Lecture de/.test(document.querySelector('#m-accueil').innerText)));
  await p.screenshot({ path: `docs/captures-v8/accueil-${cle}.png` });

  // ── météo : géolocalisation simulée ──
  await ev(p, () => { try { localStorage.removeItem('rayle_m_meteo'); } catch (e) {} });
  const ctx = p.browserContext(); await ctx.overridePermissions(o.requetes.length ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:8000', ['geolocation']); await p.setGeolocation({ latitude: 44.84, longitude: -0.58 });
  await ev(p, () => MobileMeteo.monterCarte(document.querySelector('[data-carte="meteo"] [data-z]')));
  v('météo : sans lieu, la carte propose « Ma position » et « Chercher une ville » (jamais « aucune ville choisie »)', /Ma position/.test(await texte(p, '[data-carte="meteo"]')) && /Chercher une ville/.test(await texte(p, '[data-carte="meteo"]')));
  await ev(p, () => document.querySelector('[data-carte="meteo"] [data-geo]').click()); await attendre(2500);
  v('météo : la géolocalisation donne la météo (14°, Nuageux)', /14°/.test(await texte(p, '[data-carte="meteo"]')) && /Nuageux/.test(await texte(p, '[data-carte="meteo"]')), await texte(p, '[data-carte="meteo"]'));
  v('météo : lieu gardé sur l’appareil', !!(await ev(p, () => localStorage.getItem('rayle_m_meteo'))));
  await ev(p, () => document.querySelector('[data-carte="meteo"]').click()); await attendre(700);
  v('météo : le détail montre trois jours', await ev(p, () => document.querySelectorAll('.m-feuille .m-jour').length === 3));
  await ev(p, () => MobileCoque.fermerFeuilles()); await attendre(500);
  await p.setGeolocation({ latitude: 44.84, longitude: -0.58 });
  await ev(p, () => { try { localStorage.removeItem('rayle_m_meteo'); } catch (e) {} MobileMeteo.monterCarte(document.querySelector('[data-carte="meteo"] [data-z]')); });
  await ev(p, () => document.querySelector('[data-carte="meteo"] [data-ville]').click()); await attendre(600);
  await ev(p, () => { const i = document.querySelector('.m-feuille input[type=search]'); i.value = 'Bordeaux'; i.form.dispatchEvent(new Event('submit', { cancelable: true })); }); await attendre(1200);
  v('météo : recherche d’une ville (deux résultats)', await ev(p, () => document.querySelectorAll('.m-liste-lieux button').length === 2));
  await ev(p, () => document.querySelector('.m-liste-lieux button').click()); await attendre(1800);
  v('météo : ville choisie, météo affichée', /Bordeaux/.test(await texte(p, '[data-carte="meteo"]')) && /14°/.test(await texte(p, '[data-carte="meteo"]')));

  // ── navigation ──
  for (const e of ['agent', 'actus', 'plus', 'accueil']) { await ev(p, e2 => document.querySelector('#m-nav [data-ecran="' + e2 + '"]').click(), e); await attendre(500); v('navigation : ' + e, (await ecran(p)) === e); }

  // ── actualités ──
  await aller(p, 'actus', 1800);
  const nCartes = await ev(p, () => document.querySelectorAll('#m-actus .m-actu').length);
  v('actus : cartes animées avec image, titre, média, heure', nCartes >= 10 && await ev(p, () => !!document.querySelector('#m-actus .m-actu-img img') && /il y a/.test(document.querySelector('#m-actus .m-actu').innerText)), String(nCartes));
  v('actus : crédit de l’image visible (© média)', await ev(p, () => [...document.querySelectorAll('#m-actus .m-actu-img .ia-credit')].some(e => /©/.test(e.textContent))));
  v('actus : pastilles France, Monde, rubriques', await ev(p, () => document.querySelectorAll('#m-actus .m-chip').length >= 4));
  v('actus : « mise à jour il y a X min » visible', /mise à jour il y a \d+ min/.test(await texte(p, '#m-actus')));
  await ev(p, () => document.querySelector('#m-actus [data-portee="monde"]').click()); await attendre(1500);
  v('actus : le Monde charge d’autres sujets', /Monde ·/.test(await texte(p, '#m-actus .m-actu h3')));
  await ev(p, () => document.querySelector('#m-actus [data-portee="france"]').click()); await attendre(1000);
  const rub = await ev(p, () => { const c = document.querySelector('#m-actus [data-rub]'); if (!c) return null; c.click(); return c.dataset.rub; }); await attendre(600);
  v('actus : filtre par rubrique (' + rub + ')', rub && (await ev(p, () => document.querySelectorAll('#m-actus .m-actu').length)) < nCartes);
  await ev(p, () => document.querySelector('#m-actus [data-portee="france"]').click()); await attendre(500);
  await ev(p, () => document.querySelector('#m-actus [data-stories]').click()); await attendre(900);
  v('stories : feuille plein écran avec barres d’avancement et zone d’image', await ev(p, () => !!document.querySelector('.m-story .m-story-barres') && !!document.querySelector('.m-story-img')));
  const t1 = await texte(p, '.m-story h2');
  await ev(p, () => document.querySelector('.m-story-d').dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, bubbles: true }))); await ev(p, () => document.querySelector('.m-story-d').dispatchEvent(new PointerEvent('pointerup', { clientX: 302, bubbles: true }))); await attendre(500);
  v('stories : un appui à droite passe à la carte suivante', (await texte(p, '.m-story h2')) !== t1);
  await ev(p, () => { const r = document.querySelector('.m-story'); r.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, bubbles: true })); r.dispatchEvent(new PointerEvent('pointerup', { clientX: 120, bubbles: true })); }); await attendre(500);
  v('stories : un balayage vers la gauche passe à la suivante', true);
  await p.screenshot({ path: `docs/captures-v8/stories-${cle}.png` });
  await ev(p, () => history.back()); await attendre(700);
  v('retour Android : ferme les stories sans quitter l’application', await ev(p, () => !document.querySelector('.m-story') || !document.querySelector('.m-feuille.m-ouvert')) && (await ecran(p)) === 'actus');
  // lecture à la voix avec surbrillance
  await ev(p, () => { window.__lus = []; window.speak = async t => { window.__lus.push(t); await new Promise(r => setTimeout(r, 150)); }; });
  await ev(p, () => document.querySelector('#m-actus [data-lire]').click()); await attendre(450);
  v('lecture vocale : la carte en cours est mise en valeur', await ev(p, () => !!document.querySelector('#m-actus .m-actu.m-lue')));
  await attendre(1800);
  v('lecture vocale : titres lus avec leur média', await ev(p, () => window.__lus.length >= 3 && /Source :/.test(window.__lus[1])), await ev(p, () => JSON.stringify(window.__lus).slice(0, 200)));
  await ev(p, () => document.querySelector('#m-actus [data-approf="0"]').click()); await attendre(600);
  v('approfondir : résumé, sources, images', await ev(p, () => document.querySelectorAll('.m-feuille [data-q]').length >= 2));
  await ev(p, () => MobileCoque.fermerFeuilles()); await attendre(400);

  // ── commandes vocales → équivalents Jarvis ──
  await aller(p, 'accueil', 500);
  let d = await dire(p, 'Donne-moi l’actualité en France', 4500);
  v('« donne-moi l’actualité en France » : écran Actualités + titres lus', (await ecran(p)) === 'actus' && /Voilà pour les titres/.test(d), d.slice(0, 200));
  d = await dire(p, 'Affiche l’actualité dans le monde', 2200);
  v('« l’actualité dans le monde » : portée Monde', /monde/i.test(d) && /Monde ·/.test(await texte(p, '#m-actus .m-actu h3')), d);
  const e0 = o.erreurs.length;
  d = await dire(p, 'Affiche le terminal', 2500);
  v('« affiche le terminal » : terminal ouvert', (await ev(p, () => RayleBus.demander('vue'))) === 'terminal' && /terminal/i.test(d), d);
  await ev(p, () => RayleBus.demander('vue:fermer')); await attendre(700);
  const e1 = o.erreurs.length; o.erreursTerminal = o.erreurs.slice(e0, e1);   // l’ancien terminal appelle des routes du Worker que ce faux Worker ne connaît pas : ses messages sont écartés (comportement historique)
  d = await dire(p, 'Ouvre l’agent', 2500);
  v('« ouvre l’agent » : écran Kepler', (await ecran(p)) === 'agent' && /Kepler/.test(d), d);
  d = await dire(p, 'Montre-moi le bilan', 2000);
  v('« le bilan » : onglet Performance', (await ev(p, () => MobileAgent.etat().onglet)) === 'performance' && /bilan/i.test(d), d);
  d = await dire(p, 'Ouvre la galaxie', 1500);
  v('« ouvre la galaxie » : refus poli, on reste sur Jarvis', /réservé au PC/.test(d) && (await ecran(p)) === 'accueil' && galaxieChargee(o.requetes).length === 0, d);
  d = await dire(p, 'Mode galaxie', 1500);
  v('« mode galaxie » : refus poli', /réservé au PC/.test(d), d);

  // ── galerie d'images avec crédits ──
  await ev(p, () => { window.__lus = []; });
  d = await dire(p, 'Montre-moi des photos de Napoléon', 3500);
  v('galerie : plein écran avec titre, auteur, licence et lien source', await ev(p, () => !!document.querySelector('.m-gal') && /Auteur :/.test(document.querySelector('.m-gal-leg').innerText) && /Licence :/.test(document.querySelector('.m-gal-leg').innerText) && !!document.querySelector('.m-gal-leg a[href*="commons"]')), d.slice(0, 160));
  await p.screenshot({ path: `docs/captures-v8/galerie-${cle}.png` });
  await ev(p, () => MobileCoque.fermerFeuilles()); await attendre(400);

  // ── Plus ──
  await aller(p, 'plus', 800);
  const tuiles = await ev(p, () => [...document.querySelectorAll('#m-plus .m-tuile')].map(t => ({ id: t.dataset.id, h: Math.round(t.getBoundingClientRect().height), pc: !!t.dataset.pc })));
  v('plus : tuiles de 96 px au moins, modules 3D marqués « réservé au PC »', tuiles.length >= 13 && tuiles.every(t => t.h >= 96) && tuiles.filter(t => t.pc).length === 4, JSON.stringify(tuiles.map(t => t.id + ':' + t.h)));
  await ev(p, () => document.querySelector('#m-plus .m-tuile[data-id="anatomie"]').click()); await attendre(600);
  v('plus : Anatomie 3D dit honnêtement « réservé au PC »', /Réservé au PC/.test(await texte(p, '.m-feuille')));
  await ev(p, () => MobileCoque.fermerFeuilles()); await attendre(400);
  await ev(p, () => document.querySelector('#m-plus .m-tuile[data-id="evenements"]').click()); await attendre(3000);
  v('événements de la Terre : jamais « Lecture… » infini (contenu ou erreur avec Réessayer)', await ev(p, () => { const t = document.querySelector('.m-feuille').innerText; return !/Lecture des événements|Chargement…/.test(t) && (/Réessayer|Aucun événement|Source indisponible|sources/i.test(t)); }), await texte(p, '.m-feuille'));
  await ev(p, () => MobileCoque.fermerFeuilles()); await attendre(400);
  await ev(p, () => document.querySelector('#m-plus .m-tuile[data-id="sources"]').click()); await attendre(3500);
  v('sources en direct : plein écran, une seule icône de fermeture, plus de « Chargement… » infini', await ev(p, () => { const f = document.querySelector('.gf.gfx-fen'); if (!f) return false; const r = f.getBoundingClientRect(); const bs = [...f.querySelectorAll('.gf-b button')].filter(b => getComputedStyle(b).display !== 'none'); return r.width >= innerWidth - 2 && bs.length === 1 && !/Chargement…/.test(f.innerText); }), await texte(p, '.gf.gfx-fen'));
  await p.screenshot({ path: `docs/captures-v8/sources-${cle}.png` });
  await ev(p, () => { const x = document.querySelector('.gf.gfx-fen [data-b="fermer"]'); if (x) x.click(); }); await attendre(500);
  await ev(p, () => document.querySelector('#m-plus .m-tuile[data-id="affichage"]').click()); await attendre(500);
  await ev(p, () => document.querySelector('#mi-img').click()); await attendre(200);
  v('affichage mobile : l’interrupteur images est mémorisé', (await ev(p, () => localStorage.getItem('rayle_m_images'))) === '0');
  await ev(p, () => localStorage.removeItem('rayle_m_images')); await ev(p, () => MobileCoque.fermerFeuilles()); await attendre(300);
  await ev(p, () => document.querySelector('#m-plus .m-tuile[data-id="carte"]').click()); await attendre(3500);
  const carte = await ev(p, () => ({ ouvert: window.HoteModules && HoteModules.ouvert(), boutons: [...document.querySelectorAll('#terre-leger .tl-b')].map(b => b.textContent.trim()) }));
  v('carte : s’ouvre sans galaxie avec Monde, France, Pays, Météo ici, Globe 3D', carte.ouvert && ['Monde', 'France', 'Pays'].every(x => carte.boutons.includes(x)), JSON.stringify(carte));
  const rec = []; for (let i = 0; i < carte.boutons.length; i++) { const r = await ev(p, k => { const b = document.querySelectorAll('#terre-leger .tl-b')[k]; const bb = b.getBoundingClientRect(); const t = document.elementFromPoint(bb.x + bb.width / 2, bb.y + bb.height / 2); return !(t === b || b.contains(t)); }, i); if (r) rec.push(carte.boutons[i]); }
  v('carte : aucun bouton recouvert (Monde, Globe 3D…)', rec.length === 0, rec.join(','));
  await ev(p, () => { const b = [...document.querySelectorAll('#terre-leger .tl-b')].find(x => /Globe/.test(x.textContent)); if (b) b.click(); }); await attendre(600);
  v('carte : « Globe 3D » répond honnêtement « réservé au PC »', /réservé au PC/.test(await texte(p, '#terre-leger')));
  await ev(p, () => HoteModules.fermer()); await attendre(600);
  await aller(p, 'accueil', 300);

  const propres = o.erreurs.filter(e => !(o.erreursTerminal || []).includes(e));
  v('aucune erreur de page (hors routes de l’ancien terminal)', propres.length === 0, propres.slice(0, 4).join(' | '));
  await o.fermer();
}
console.log(`\nCoque mobile V8 (1/2) : ${ok} réussis, ${ko} échec(s).`);
process.exit(ko ? 1 : 0);
