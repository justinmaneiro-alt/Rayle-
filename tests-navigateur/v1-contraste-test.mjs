// V1 : contraste de lisibilité (WCAG) des textes de l'accueil, du tableau de bord, des fenêtres de réponse et du poste de l'agent, mesuré sur les couleurs réellement calculées
// (texte composité sur le fond effectif, alpha compris). Seuils : 4,5 pour le texte courant, 3 pour les étiquettes en petites capitales et les valeurs secondaires.
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
const { verifier, fin } = compteur();
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1700,950'] });
const page = await b.newPage(); await page.setViewport({ width: 1700, height: 950 });
await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); window.__RAYLE_TB_TEST__ = { sansReseau: true }; window.__RAYLE_POSTE_TEST__ = { exposer: true, sansRecherche: true, sansAlertesMS: true, sansVeilleurMS: true, lire: async () => { throw new Error('hors ligne'); } }; });
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(3500);
const MESURE = `(sels) => {
  const parse = c => { const m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return [0, 0, 0, 0]; const p = m[1].split(',').map(x => parseFloat(x)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const comp = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const fond = el => { let pile = []; for (let e = el; e; e = e.parentElement) { const bg = parse(getComputedStyle(e).backgroundColor); if (bg[3] > 0) pile.push(bg); if (bg[3] >= 1) break; } let c = [4, 7, 11]; for (const bg of pile.reverse()) c = comp(bg, c); return c; };
  return sels.map(([nom, sel, seuil]) => { const e = document.querySelector(sel); if (!e) return { nom, absent: true, seuil }; const cs = getComputedStyle(e), fg = parse(cs.color), bg = fond(e), txt = comp([fg[0], fg[1], fg[2], fg[3] * (+cs.opacity || 1)], bg), L1 = lum(txt), L2 = lum(bg), r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); return { nom, ratio: +r.toFixed(2), seuil }; });
}`;
const mesurer = sels => page.evaluate(`(${MESURE})(${JSON.stringify(sels)})`);
const rapport = (titre, liste) => { for (const r of liste) verifier(`${titre} · ${r.nom} : contraste ${r.absent ? 'élément absent' : r.ratio} (≥ ${r.seuil})`, !r.absent && r.ratio >= r.seuil); };

// accueil + tableau de bord (données injectées)
await page.evaluate(() => { window.Panneaux.fermerTout(); const TB = window.TableauBord; TB.definirReglages({ meteo: { nom: 'Pau', lat: 43.3, lon: -0.37 } });
  TB.injecter('meteo', { etat: 'ok', nom: 'Pau', temp: 14.2, ressenti: 12.8, categorie: 'pluie', libelle: 'Pluie', vent: 18, pluie: 0.4, jours: [{ jour: 'auj.', min: 9, max: 16 }, { jour: 'sam.', min: 10, max: 15 }, { jour: 'dim.', min: 8, max: 18 }] });
  TB.injecter('actus', { titres: Array.from({ length: 5 }, (_, i) => ({ titre: 'Titre d’actualité numéro ' + (i + 1), source: 'Source', quand: 'il y a ' + (i + 1) + ' h', couleur: '#8fd0e3' })), perime: false });
  TB.injecter('marche', { lignes: [{ id: 'BTC', nom: 'BTC', prix: 67890.4, decimales: 1, pct: 1.23, courbe: [1, 2, 3, 2, 4], t: Date.now() }, { id: 'SOL', nom: 'SOL', prix: 152.3, decimales: 2, pct: -0.84, courbe: [4, 3, 2, 3, 1], t: Date.now() }] });
  TB.injecter('terre', { lignes: [{ id: 'a', type: 'seisme', titre: 'M 5.6 · Chili', severite: 3, age: 'il y a 1 h' }], etiquette: 'reel' });
  TB.injecter('reels', { 'gardien-prop': { etat: 'ok', pied: 'VERT · marge 678 $' }, 'regime-marche': { etat: 'ok', liste: [{ g: 'Bitcoin', d: '62/100 · Tendance haussière' }] }, 'propositions-agent': { etat: 'ok', liste: [], vide: 'Pas de setup' } }); TB.injecter('pilote', { paires: ['BTC'], enRecherche: true, valides: 0 }); });
await attendre(1500);
rapport('accueil', await mesurer([['titre RAYLÉ', '.titre b', 4.5], ['sous-titre', '.titre span', 3], ['état du micro', '#state', 3], ['bouton Activer (titre)', '#btn #btnTxt', 4.5], ['bouton Terminal', '#btnOuvrirTerminal span', 4.5],
  ['tableau : titre de fenêtre', '.tb-f h3', 3], ['tableau : heure', '.tb-h', 7], ['tableau : date', '.tb-date', 4.5], ['tableau : température', '.tb-temp', 7], ['tableau : détail météo', '.tb-metl', 4.5], ['tableau : titre d’actualité', '.tb-defile b', 4.5], ['tableau : source d’actualité', '.tb-defile small', 3],
  ['tableau : prix du marché', '.tb-m .tb-p', 7], ['tableau : variation', '.tb-m .tb-v', 3], ['tableau : libellé agent', '.tb-agent li span', 3], ['tableau : valeur agent', '.tb-agent li b', 4.5], ['tableau : détail agent', '.tb-agent li small', 4.5], ['tableau : événement Terre', '.tb-terre b', 4.5], ['tableau : système', '.tb-sys b', 4.5]]));
// fenêtre de réponse
await page.evaluate(() => window.Panneaux.ouvrir({ id: 'rep', type: 'holo-reponse', titre: 'Réponse', etat: 'reel', corps: { html: '<p>Le Bitcoin vaut environ 67 890 dollars.</p><div class="pn-l"><span>RSI 14</span><b>58</b></div>' } })); await attendre(1200);
rapport('réponse', await mesurer([['titre', '#panneaux .pn-tete h2', 3], ['texte', '#panneaux .pn-corps p', 7], ['étiquette de ligne', '#panneaux .pn-l span', 4.5], ['valeur', '#panneaux .pn-l b', 7], ['pastille d’état', '#panneaux .pn-etat', 3]]));
await page.evaluate(() => window.Panneaux.fermerTout());
// poste de l'agent
await page.evaluate(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }); await attendre(1800);
rapport('poste', await mesurer([['paire active', '.pa-paires button.actif', 4.5], ['groupe actif', '.pa-nav-g button.actif', 7], ['bandeau de statut', '.pa-puce', 4.5],
  ['titre de carte', '.pa-c h4', 3], ['phrase', '.pa-phrase', 7], ['ligne : libellé', '.pa-l span', 4.5], ['ligne : valeur', '.pa-l b', 7], ['bouton', '.pa-btn', 4.5], ['texte discret', '.pa-avert', 3]]));
await page.evaluate(() => document.querySelector('.pa-onglets [data-groupe="strategies"]').click()); await attendre(1200);
rapport('poste · navigation', await mesurer([['groupe inactif', '.pa-nav-g button:not(.actif)', 3], ['sous-onglet actif', '.pa-nav-s button.actif', 7], ['sous-onglet inactif', '.pa-nav-s button:not(.actif):not([hidden])', 4.5]]));
await page.evaluate(() => document.querySelector('.pa-onglets [data-onglet="teste"]').click()); await attendre(900);
await page.evaluate(() => document.querySelector('[data-a="ms-nouvelle"]').click()); await attendre(700);
rapport('teste ma stratégie', await mesurer([['description ou consigne', '.pa-desc li, .pa-liste.pa-alerte li', 4.5], ['champ', '.pa-poste input[type=text]', 7], ['étiquette de champ', '.pa-form label', 3], ['légende', '.pa-form legend', 3]]));
await b.close(); fin();
