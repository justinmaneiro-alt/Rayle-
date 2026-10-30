// V8 : écran « Agents trading » mobile (onglets, graphique tactile, performance, commandes), états de chargement et d'erreur, tablette. node tests-navigateur/v8-agent-test.mjs
import fs from 'node:fs';
import { ouvrirMobile, attendre, texte, existe, visible } from './v8-aide.mjs';
fs.mkdirSync('docs/captures-v8', { recursive: true });
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) { ok++; console.log('OK  ' + n); } else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const ev = (p, f, ...a) => p.evaluate(f, ...a);
const onglet = async (p, id, ms = 700) => { await ev(p, i => MobileAgent.aller(i), id); await attendre(ms); };

/* ───────────────────────── téléphone ───────────────────────── */
{
  console.log('\n══ téléphone : écran Agents ══');
  const o = await ouvrirMobile('telephone', { attente: 3800 }), p = o.page, w = o.worker;
  await ev(p, () => { MobileCoque.aller('agent'); if (window.MobileAgent && MobileAgent.details) MobileAgent.details(true); }); await attendre(1500);
  const ids = await ev(p, () => MobileAgent.onglets());
  v('11 onglets défilants, les trois premiers : Positions du jour, Graphique, Performance', ids.length === 11 && ids.slice(0, 3).join() === 'positions,graphique,performance', ids.join());
  v('avertissement « aucun ordre » toujours visible', /aucun ordre/.test(await texte(p, '#m-agent .m-garde')));
  v('mise à jour datée et source (PC / serveur)', /mise à jour il y a/.test(await texte(p, '#m-agent [data-maj]')) && /serveur|PC/.test(await texte(p, '#m-agent [data-maj]')), await texte(p, '#m-agent [data-maj]'));

  // positions du jour
  const cartes = await ev(p, () => [...document.querySelectorAll('#m-agent .m-pos')].map(c => ({ t: c.innerText, niveau: c.dataset.niveau, live: c.dataset.live, sens: c.dataset.sens })));
  v('trois positions du jour (BTC, SOL, DOGE)', cartes.length === 3 && ['BTC', 'SOL', 'DOGE'].every(a => cartes.some(c => c.t.includes(a))), String(cartes.length));
  const c0 = cartes.find(c => c.t.includes('BTC'));
  v('carte : sens, unité, zone d’entrée, stop, cibles, RR, raison, invalidation, validité', /ACHAT/.test(c0.t) && /H1/.test(c0.t) && /Zone d’entrée/.test(c0.t) && /Stop/.test(c0.t) && /Cible 1/.test(c0.t) && /Cible 2/.test(c0.t) && /2,0 pour 1/.test(c0.t) && /Balayage du plus bas/.test(c0.t) && /Annulée si/.test(c0.t) && /Valable jusqu/.test(c0.t), c0.t.slice(0, 300));
  v('carte : 💎 zone diamant sur la position qui en a une', /💎/.test(c0.t));
  v('niveaux de preuve toujours visibles (Candidate, Testée non concluante, Idée non testée)', /Candidate/.test(c0.t) && cartes.some(c => /Testée : non concluante/.test(c.t)) && cartes.some(c => /Idée non testée/.test(c.t)));
  v('Candidate : statistiques réelles, fourchette, nombre de trades, message de prudence', /réussite 46 %/.test(c0.t) && /fourchette 95 %/.test(c0.t) && /112 trades hors échantillon/.test(c0.t) && /pas comme un signal fiable/.test(c0.t));
  v('preuve manquante dite en clair (« il manque… »)', /Il manque 38 trades hors échantillon pour être Validée/.test(c0.t) || /Il manque \d+ trades/.test(c0.t), c0.t.slice(-260));
  v('statuts live : en attente / entrée touchée', cartes.some(c => c.live === 'attente') && cartes.some(c => c.live === 'ouverte'));
  v('zones diamant à surveiller listées', /Zones diamant à surveiller/i.test(await texte(p, '#m-agent')));

  // tous les onglets : contenu réel, aucun placeholder cassé
  const defauts = [];
  for (const id of ids) {
    await onglet(p, id, id === 'graphique' ? 2500 : id === 'liquidite' ? 1500 : 600);
    const t = await texte(p, '#m-agent');
    if (/\[object Object\]|undefined|NaN/.test(t) || t.length < 80) defauts.push(id + ':' + t.length);
    await p.screenshot({ path: `docs/captures-v8/agent-${id}-telephone.png` });
  }
  v('11 onglets rendus sans « [object Object] », « undefined » ni « NaN »', defauts.length === 0, defauts.join(' | '));

  // graphique tactile
  await onglet(p, 'positions', 600);
  await ev(p, () => document.querySelector('#m-agent [data-voir]').click()); await attendre(2800);
  const g = await ev(p, () => { const e = MobileAgent.etat(); const g = e.graphe; return { onglet: e.onglet, canvases: document.querySelectorAll('#m-agent .m-graphe-chart canvas').length, lignes: g ? g.etat().lignes.length : -1, bougies: g ? g.etat().bougies.length : 0, actif: g && g.etat().actif }; });
  v('« voir sur le graphique » : onglet graphique, bougies chargées, entrée / stop / cibles tracées', g.onglet === 'graphique' && g.canvases >= 2 && g.bougies >= 400 && g.lignes >= 4, JSON.stringify(g));
  v('graphique : bascule M15 / H1 / H4 et BTC / SOL / DOGE', await ev(p, () => ['M15', 'H1', 'H4'].every(t => !!document.querySelector('.m-graphe-tf [data-tf="' + t + '"]')) && document.querySelectorAll('.m-ga button').length === 3));
  v('graphique : superpositions positions, zones, VWAP, POC, profil, volume, delta', await ev(p, () => ['volume', 'delta', 'vwap', 'poc', 'profil', 'zones', 'positions'].every(k => !!document.querySelector('.m-graphe-chips [data-opt="' + k + '"]'))));
  const klAvant = o.stats.klines;
  await ev(p, () => document.querySelector('.m-graphe-tf [data-tf="H1"]').click()); await attendre(1800);
  v('graphique : H1 recharge les bougies (klines 1h)', o.stats.klines > klAvant && (await ev(p, () => MobileAgent.etat().graphe.etat().tf)) === 'H1');
  await ev(p, () => document.querySelector('.m-ga [data-ga="SOL"]').click()); await attendre(1800);
  v('graphique : SOL', (await ev(p, () => MobileAgent.etat().graphe.etat().actif)) === 'SOL');
  await ev(p, () => document.querySelector('.m-ga [data-ga="BTC"]').click()); await ev(p, () => document.querySelector('.m-graphe-tf [data-tf="M15"]').click()); await attendre(1800);
  const zone = await ev(p, () => { const r = document.querySelector('.m-graphe-chart').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; });
  const plage = () => ev(p, () => { const r = MobileAgent.etat().graphe.chart.timeScale().getVisibleLogicalRange(); return r ? r.to - r.from : null; });
  const dec = () => ev(p, () => { const r = MobileAgent.etat().graphe.chart.timeScale().getVisibleLogicalRange(); return r ? r.from : null; });
  // pincer pour zoomer (geste réel envoyé par le protocole du navigateur)
  const cdp = await p.createCDPSession();
  const l0 = await plage();
  await cdp.send('Input.synthesizePinchGesture', { x: Math.round(zone.x), y: Math.round(zone.y), scaleFactor: 2.2, relativeSpeed: 300, gestureSourceType: 'touch' }); await attendre(600);
  const l1 = await plage();
  v('pincer écarte les doigts : zoom avant (moins de bougies visibles)', l1 < l0 - 3, l0.toFixed(0) + ' → ' + l1.toFixed(0));
  await cdp.send('Input.synthesizePinchGesture', { x: Math.round(zone.x), y: Math.round(zone.y), scaleFactor: 0.45, relativeSpeed: 300, gestureSourceType: 'touch' }); await attendre(600);
  const l2 = await plage();
  v('pincer en rapprochant les doigts : zoom arrière', l2 > l1 + 3, l1.toFixed(0) + ' → ' + l2.toFixed(0));
  const d0 = await dec();
  const gx = Math.round(zone.x - 80), gy = Math.round(zone.y);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gx, y: gy, id: 1 }] });
  for (let k = 1; k <= 8; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gx + k * 20, y: gy, id: 1 }] }); await attendre(30); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await attendre(700);
  const d1 = await dec();
  v('glisser vers la droite : on remonte dans l’historique', d1 < d0 - 2, d0.toFixed(1) + ' → ' + d1.toFixed(1));
  await p.screenshot({ path: 'docs/captures-v8/agent-graphique-zoom-telephone.png' });
  // touche longue = marquer ici
  await ev(p, () => MobileAgent.etat().graphe.chart.timeScale().scrollToRealTime());
  await attendre(400);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(zone.x - 40), y: Math.round(zone.y), id: 1 }] }); await attendre(950);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await attendre(700);
  v('touche longue sur une bougie : la feuille « Marquer ici » s’ouvre', await ev(p, () => !!document.querySelector('.m-feuille [data-f="entree"]')));
  await ev(p, () => { const set = (k, x) => { const i = document.querySelector('.m-feuille [data-f="' + k + '"]'); i.value = x; }; const e = +document.querySelector('.m-feuille [data-f="entree"]').value; set('stop', String(e * 0.995)); set('cible', String(e * 1.01)); document.querySelector('.m-feuille [data-avis="bon"]').click(); }); await attendre(1800);
  const ex = w.commandes.find(c => c.type === 'exemple');
  v('« j’aurais pris ça » : transmis au service avec actif, sens, entrée, stop, cible', ex && ex.valeur.actif === 'BTC' && ex.valeur.sens === 'achat' && ex.valeur.avis === 'bon' && ex.valeur.stop < ex.valeur.entree && ex.valeur.cible > ex.valeur.entree, JSON.stringify(ex));
  await ev(p, () => MobileCoque.fermerFeuilles()); await attendre(400);
  await ev(p, () => { const z = document.querySelector('.m-graphe-zone'); z.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 300, pointerId: 5, isPrimary: true, bubbles: true })); z.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, clientY: 300, pointerId: 5, isPrimary: true, bubbles: true })); });
  v('un appui court n’ouvre pas la feuille de marquage', !(await existe(p, '.m-feuille [data-f="entree"]')));
  await ev(p, () => document.querySelector('.m-graphe-chips [data-opt="delta"]').click()); await attendre(400);
  v('graphique : le delta (volume acheteur agressif réel) s’affiche', (await ev(p, () => MobileAgent.etat().graphe.etat().options.delta)) === true);
  await ev(p, () => document.querySelector('.m-graphe-plein-b').click()); await attendre(500);
  v('mode plein écran paysage : le graphique passe au premier plan, la barre du bas se range', await ev(p, () => document.querySelector('.m-graphe').classList.contains('m-graphe-plein-actif') && document.documentElement.classList.contains('m-graphe-ouvert')));
  await ev(p, () => document.querySelector('.m-graphe-plein-b').click()); await attendre(400);

  // performance
  await onglet(p, 'performance', 800);
  const tp = await texte(p, '#m-agent');
  v('performance : taux de réussite, RR, espérance, drawdown, séries', /Réussite/.test(tp) && /Gain \/ perte moyens/.test(tp) && /Espérance après frais/.test(tp) && /Creux max/.test(tp) && /Meilleure série/.test(tp) && /Pire série/.test(tp));
  v('performance : courbe de capital, calendrier thermique, résultats par semaine', await ev(p, () => !!document.querySelector('#m-agent .m-courbe path.trait') && document.querySelectorAll('#m-agent .m-cal i').length === 84 && document.querySelectorAll('#m-agent .m-hb').length === 8));
  v('performance : objectif +1 % / +2 % et « pas une promesse »', /\+1 %/.test(tp) && /\+2 %/.test(tp) && /pas une promesse/.test(tp));
  v('performance : comparaison avec le hasard', /Comparaison avec le hasard/i.test(tp) && /au hasard/.test(tp));
  const tr0 = await ev(p, () => document.querySelector('#m-agent .m-tuile-s b').textContent);
  await ev(p, () => document.querySelector('#m-agent [data-perf="agent:rebond"]').click()); await attendre(500);
  const tr1 = await ev(p, () => document.querySelector('#m-agent .m-tuile-s b').textContent);
  v('performance : par agent (Rebond 8 trades contre 20)', tr0 === '20' && tr1 === '8', tr0 + '/' + tr1);
  await ev(p, () => document.querySelector('#m-agent [data-perf="actif:SOL"]').click()); await attendre(400);
  v('performance : par actif (SOL 7 trades)', (await ev(p, () => document.querySelector('#m-agent .m-tuile-s b').textContent)) === '7');
  await ev(p, () => document.querySelector('#m-agent [data-perf="jours:7"]').click()); await attendre(400);
  v('performance : par période (7 jours)', await ev(p, () => !!document.querySelector('#m-agent [data-perf="jours:7"][aria-selected="true"]')));

  // stratégies
  await onglet(p, 'strategies', 700);
  const ts = await texte(p, '#m-agent');
  v('stratégies : statuts Validées / Candidates / En test / Rejetées et variantes testées', /Validées/.test(ts) && /Candidates/.test(ts) && /En test/.test(ts) && /Rejetées/.test(ts) && /42\s?740/.test(ts), ts.slice(0, 200));
  v('stratégies : preuve manquante en clair (« il manque… »)', /Il manque 29 trades hors échantillon pour être Candidate/.test(ts), '');
  v('stratégies : strict (v3) et équilibré (v4) pour chaque piste', /Strict \(v3\) : Testée : non concluante · Équilibré \(v4\) : Candidate/.test(ts));
  v('stratégies : entonnoir de rejet en pourcentage', /Entonnoir de rejet/i.test(ts) && /100 %/.test(ts) && /98 %/.test(ts));
  v('stratégies : versions et promotions / rétrogradations', /Versions et promotions/i.test(ts) && /non concluante → Candidate/.test(ts));

  // agent : pause / charge
  await onglet(p, 'agent', 600);
  v('agent : service, charge du PC, dernier rapport en 5 lignes', /Service du PC/.test(await texte(p, '#m-agent')) && (await ev(p, () => document.querySelectorAll('#m-agent .m-liste li').length)) >= 5);
  await ev(p, () => document.querySelector('#m-agent [data-cmd="pause"]').click()); await attendre(900);
  v('agent : « Mettre en pause » envoyé au Worker (le PC l’appliquera)', w.commandes.some(c => c.type === 'pause') && /serveur|PC/.test(await texte(p, '#m-agent [data-cmd-msg]')));
  await ev(p, () => document.querySelector('#m-agent [data-cmd="charge"][data-val="fort"]').click()); await attendre(900);
  v('agent : charge « fort »', w.commandes.some(c => c.type === 'charge' && c.valeur === 'fort'));
  v('agent : aucun bouton « Lancer » ni d’ordre de trading, sur aucun onglet', await ev(p, () => ![...document.querySelectorAll('#m-agent button')].some(b => /lancer|acheter maintenant|vendre maintenant|passer l.ordre|exécuter/i.test(b.textContent))));

  // liquidité
  await onglet(p, 'liquidite', 2000);
  v('liquidité : carte verticale (32 niveaux), prix actuel, POC', await ev(p, () => document.querySelectorAll('#m-agent .m-lq').length === 32 && !!document.querySelector('#m-agent .m-lq.ici')) && /POC/.test(await texte(p, '#m-agent')));

  // réglages
  await onglet(p, 'reglages', 600);
  await ev(p, () => { document.querySelector('#m-agent [data-r="ag:extremes"]').click(); document.querySelector('#m-agent [data-r="alertesObservation"]').click(); document.querySelector('#m-agent [data-sauver]').click(); }); await attendre(1000);
  const rg = w.commandes.find(c => c.type === 'reglages');
  v('réglages : agents, alertes « Observation » et niveau de preuve envoyés', rg && rg.valeur.agents.extremes === false && rg.valeur.alertesObservation === true && rg.valeur.maxParAgent === 3 && rg.valeur.actifs.length === 3, JSON.stringify(rg));
  await ev(p, () => document.querySelector('#m-agent [data-cmd="niveau_preuve"][data-val="strict"]').click()); await attendre(800);
  v('réglages : niveau de preuve strict (v3) / équilibré (v4)', w.commandes.some(c => c.type === 'niveau_preuve' && c.valeur === 'strict'));
  v('aucune erreur de page', o.erreurs.length === 0, o.erreurs.slice(0, 3).join(' | '));
  await o.fermer();
}

/* ───────────────────────── états : erreur, cache, hors ligne ───────────────────────── */
{
  console.log('\n══ états de chargement ══');
  // 1. agent en panne, sans copie : message clair + Réessayer, puis tout rentre dans l'ordre
  let o = await ouvrirMobile('telephone', { scenario: { agent: 'panne' }, attente: 3500 }), p = o.page;
  await ev(p, () => { MobileCoque.aller('agent'); if (window.MobileAgent && MobileAgent.details) MobileAgent.details(true); }); await attendre(1000);
  let t = await texte(p, '#m-agent');
  v('agent en panne (sans copie) : message clair et bouton Réessayer, jamais un chargement infini', /Réessayer/.test(t) && !/Chargement…/.test(t) && !(await existe(p, '#m-agent .m-squelette')), t.slice(0, 200));
  o.worker.scenario.agent = 'ok';
  await ev(p, () => document.querySelector('#m-agent [data-rafraichir], #m-agent [data-m-reessayer]').click()); await attendre(2200);
  v('…Réessayer : les positions arrivent', (await ev(p, () => document.querySelectorAll('#m-agent .m-pos').length)) === 3);
  // 2. avec une copie : le Worker tombe, la copie reste affichée et datée
  o.worker.scenario.agent = 'panne';
  await ev(p, () => MobileAgentDonnees.rafraichir()); await attendre(1500);
  t = await texte(p, '#m-agent');
  v('Worker tombé avec copie : les positions restent affichées, étiquetées copie ancienne, avec Réessayer', (await ev(p, () => document.querySelectorAll('#m-agent .m-pos').length)) === 3 && /Copie ancienne/.test(t) && /Réessayer/.test(t), t.slice(0, 160));
  await o.fermer();
  // 3. limite D1 : phrase claire
  o = await ouvrirMobile('telephone', { scenario: { agent: 'limite' }, attente: 3500 }); p = o.page;
  await ev(p, () => { MobileCoque.aller('agent'); if (window.MobileAgent && MobileAgent.details) MobileAgent.details(true); }); await attendre(1000);
  t = await texte(p, '#m-agent');
  v('limite du jour du Worker : « liaison limitée », pas d’erreur brute', /limitée/.test(t) && !/D1_ERROR|HTTP 5/.test(t), t.slice(0, 200));
  await o.fermer();
  // 4. PC éteint : bandeau honnête
  o = await ouvrirMobile('telephone', { scenario: { agent: 'pc-eteint' }, attente: 3500 }); p = o.page;
  await ev(p, () => { MobileCoque.aller('agent'); if (window.MobileAgent && MobileAgent.details) MobileAgent.details(true); }); await attendre(1000);
  v('PC éteint : dernières données du PC avec leur heure', /PC éteint/.test(await texte(p, '#m-agent')) && (await ev(p, () => document.querySelectorAll('#m-agent .m-pos').length)) === 3);
  await o.fermer();
  // 5. rien de publié
  o = await ouvrirMobile('telephone', { scenario: { agent: 'vide' }, attente: 3500 }); p = o.page;
  await ev(p, () => { MobileCoque.aller('agent'); if (window.MobileAgent && MobileAgent.details) MobileAgent.details(true); }); await attendre(1000);
  v('rien publié par le PC : phrase explicite', /pas encore publié/.test(await texte(p, '#m-agent')));
  await o.fermer();
  // 6. Worker verrouillé : la coque le dit au lieu de charger sans fin
  o = await ouvrirMobile('telephone', { deverrouille: false, attente: 3500 }); p = o.page;
  await ev(p, () => { MobileCoque.aller('agent'); if (window.MobileAgent && MobileAgent.details) MobileAgent.details(true); }); await attendre(1000);
  t = await texte(p, '#m-agent');
  v('Raylé verrouillée : message clair sur l’agent, la voyant « verrouillée »', /verrouillée/.test(t) && /VERROUILLÉE/.test(await texte(p, '#m-puce-lien')), t.slice(0, 160));
  await ev(p, () => MobileCoque.aller('actus')); await attendre(1000);
  v('Raylé verrouillée : message clair sur les actualités + Réessayer', /verrouillée/.test(await texte(p, '#m-actus')) && /Réessayer/.test(await texte(p, '#m-actus')));
  await o.fermer();
  // 7. actualités : 503 « en préparation » sans copie → lecture directe des médias, jamais d'écran vide
  o = await ouvrirMobile('telephone', { scenario: { fil: '503' }, attente: 3500 }); p = o.page;
  await ev(p, () => MobileCoque.aller('actus')); await attendre(2200);
  t = await texte(p, '#m-actus');
  v('actualités 503 sans copie : repli sur la lecture directe, cartes affichées', (await ev(p, () => document.querySelectorAll('#m-actus .m-actu').length)) >= 8 && /lecture directe/.test(t) && !/HTTP 503/.test(t), t.slice(0, 200));
  v('…les cartes ont des images de leur média', await ev(p, () => !!document.querySelector('#m-actus .m-actu-img img')));
  // 8. 503 avec copie plus ancienne : copie affichée tout de suite
  o.worker.scenario.fil = 'ok';
  await ev(p, () => { MobileDonnees.ecrire('actus:france', Date.now() - 40 * 60e3, { sujets: window.__mActus.slice(0, 5), genere: new Date(Date.now() - 40 * 60e3).toISOString(), perime: false, source: 'fil' }); });
  o.worker.scenario.fil = '503'; o.worker.scenario.lentMs = 4000;   // le Worker répond lentement : la copie doit être visible avant
  await p.reload({ waitUntil: 'load' }); await attendre(300);
  await ev(p, () => MobileCoque.aller('actus'));
  await attendre(120);
  t = await texte(p, '#m-actus');
  v('503 avec copie de 40 min : la copie s’affiche tout de suite, « mise à jour il y a 40 min », sans écran vide', (await ev(p, () => document.querySelectorAll('#m-actus .m-actu').length)) >= 3 && /il y a 40 min/.test(t), t.slice(0, 200));
  await o.fermer();
  // 9. tout en panne, sans copie : erreur claire + Réessayer ; la relance marche
  o = await ouvrirMobile('telephone', { scenario: { fil: 'panne', pays: 'panne' }, attente: 3500 }); p = o.page;
  await ev(p, () => MobileCoque.aller('actus')); await attendre(1500);
  t = await texte(p, '#m-actus');
  v('actualités en panne sans copie : message + Réessayer, pas de « Chargement… »', /Réessayer/.test(t) && !/Chargement…/.test(t), t.slice(0, 200));
  o.worker.scenario.fil = 'ok';
  await ev(p, () => document.querySelector('#m-actus [data-m-reessayer]').click()); await attendre(2200);
  v('…la relance remplit le fil', (await ev(p, () => document.querySelectorAll('#m-actus .m-actu').length)) >= 10);
  // 10. hors ligne : les copies restent lisibles, voyant « hors ligne »
  await p.setOfflineMode(true); await ev(p, () => window.dispatchEvent(new Event('offline'))); await attendre(600);
  v('hors ligne : bandeau « hors ligne » et fil toujours lisible', await visible(p, '.m-hors-ligne') && (await ev(p, () => document.querySelectorAll('#m-actus .m-actu').length)) >= 10);
  await p.setOfflineMode(false); await ev(p, () => window.dispatchEvent(new Event('online'))); await attendre(500);
  await o.fermer();
}

/* ───────────────────────── tablette ───────────────────────── */
{
  console.log('\n══ tablette ══');
  const o = await ouvrirMobile('tablette', { attente: 3800 }), p = o.page;
  await ev(p, () => { MobileCoque.aller('agent'); if (window.MobileAgent && MobileAgent.details) MobileAgent.details(true); }); await attendre(3000);
  const ids = await ev(p, () => MobileAgent.onglets());
  v('tablette (portrait) : le graphique est toujours présent, plus d’onglet « Graphique » séparé', !ids.includes('graphique') && (await visible(p, '#m-agent .m-graphe-chart')), ids.join());
  v('tablette : le graphique affiche des bougies', (await ev(p, () => document.querySelectorAll('#m-agent .m-graphe-chart canvas').length)) >= 2);
  v('tablette : positions en deux colonnes', await ev(p, () => { const c = [...document.querySelectorAll('#m-agent .m-pos')].map(e => e.getBoundingClientRect()); return c.length === 3 && Math.abs(c[0].y - c[1].y) < 4 && c[1].x > c[0].x + 100; }));
  await p.screenshot({ path: 'docs/captures-v8/agent-tablette-portrait.png' });
  await o.fermer();
  const o2 = await ouvrirMobile('tablette', { paysage: true, attente: 3800 }), p2 = o2.page;
  await ev(p2, () => { MobileCoque.aller('agent'); if (window.MobileAgent && MobileAgent.details) MobileAgent.details(true); }); await attendre(3000);
  const mise = await ev(p2, () => { const g = document.querySelector('#m-agent [data-graphe-panneau]').getBoundingClientRect(), c = document.querySelector('#m-agent [data-corps]').getBoundingClientRect(); return { gx: g.x, gw: g.width, cx: c.x, cw: c.width, iw: innerWidth, sw: document.documentElement.scrollWidth }; });
  v('tablette paysage : graphique à gauche, positions et performance à droite', mise.cx > mise.gx + mise.gw - 4 && mise.gw > 300 && mise.cw > 300 && mise.sw <= mise.iw + 1, JSON.stringify(mise));
  await p2.screenshot({ path: 'docs/captures-v8/agent-tablette-paysage.png' });
  await ev(p2, () => MobileAgent.aller('performance')); await attendre(800);
  v('tablette paysage : l’onglet Performance se lit à côté du graphique', await visible(p2, '#m-agent .m-courbe') && await visible(p2, '#m-agent .m-graphe-chart'));
  v('aucune erreur de page', o2.erreurs.length === 0, o2.erreurs.slice(0, 3).join(' | '));
  await o2.fermer();
}
console.log(`\nCoque mobile V8 (2/2) : ${ok} réussis, ${ko} échec(s).`);
process.exit(ko ? 1 : 0);
