// Tests du contenu pur du tableau de bord de l'accueil. Lancer :  node galaxie/tests/tableau-bord-test.mjs
import { createRequire } from 'node:module';
const T = createRequire(import.meta.url)('../../core/commun/tableau-bord-contenu.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// réglages
const d = T.reglagesParDefaut();
v('sept fenêtres, toutes visibles par défaut', T.FENETRES.length === 7 && T.FENETRES.every(f => d.fenetres[f.id].visible));
v('réglages illisibles → défauts', JSON.stringify(T.normaliserReglages('n’importe quoi')) === JSON.stringify(d) && JSON.stringify(T.normaliserReglages(null)) === JSON.stringify(d));
v('lecture : JSON cassé → défauts', JSON.stringify(T.lireReglages(() => '{pas du json')) === JSON.stringify(d));
const r1 = T.normaliserReglages({ fenetres: { meteo: { visible: false, cote: 'd', rang: 1 }, inconnue: { visible: false }, agent: { cote: 'milieu', rang: 'x' } }, meteo: { nom: 'Pau', lat: 43.3, lon: -0.37 } });
v('masquer et changer de côté', r1.fenetres.meteo.visible === false && r1.fenetres.meteo.cote === 'd' && r1.fenetres.agent.cote === 'd');
v('fenêtre inconnue ignorée, côté invalide refusé', !r1.fenetres.inconnue && r1.fenetres.agent.rang === d.fenetres.agent.rang);
v('ville valide gardée, coordonnées arrondies', r1.meteo.nom === 'Pau' && r1.meteo.lat === 43.3);
v('coordonnées absurdes refusées', T.normaliserReglages({ meteo: { nom: 'x', lat: 200, lon: 0 } }).meteo.lat === null);
const dis = T.disposition(d, 'complet');
v('disposition : sept fenêtres réparties à gauche et à droite', dis.g.length + dis.d.length === 7 && dis.g.length === 4 && dis.d.length === 3);
v('disposition : ordre des rangs respecté', dis.g.map(f => f.id).join() === 'heure,meteo,actus,systeme' && dis.d[0].id === 'agent');
v('mode léger : quatre fenêtres essentielles', (() => { const l = T.disposition(d, 'leger'); return l.g.length + l.d.length === 4; })());
v('tableau coupé : rien', (() => { const l = T.disposition({ actif: false }, 'complet'); return !l.g.length && !l.d.length; })());
v('masquée : absente de la disposition', ![...T.disposition(r1, 'complet').g, ...T.disposition(r1, 'complet').d].some(f => f.id === 'meteo'));
const m = T.deplacer(d, 'meteo', 'haut');
v('déplacer vers le haut échange avec la voisine', T.disposition(m, 'complet').g.map(f => f.id).join() === 'meteo,heure,actus,systeme');
v('déplacer en dehors des limites : sans effet', T.disposition(T.deplacer(d, 'heure', 'haut'), 'complet').g[0].id === 'heure');
v('changer de côté met en bas de l’autre colonne', (() => { const l = T.disposition(T.deplacer(d, 'actus', 'd'), 'complet'); return l.d[l.d.length - 1].id === 'actus' && !l.g.some(f => f.id === 'actus'); })());
v('largeur minimale du tableau', T.assezLarge(1400) && !T.assezLarge(900));
let ecrit = null; T.ecrireReglages((k, x) => { ecrit = [k, x]; }, r1); v('écriture sous la bonne clé', ecrit && ecrit[0] === 'rayle_tableau_bord' && JSON.parse(ecrit[1]).fenetres.meteo.visible === false);

// nombres
v('prix : milliers à l’espace, jamais de NaN', T.prix(67890.4) === '67 890' || /^67\s890$/.test(T.prix(67890.4).replace(/ | /g, ' ')));
v('prix de DOGE : cinq décimales', /0,16/.test(T.prix(0.16421)));
v('prix absent → tiret', T.prix(null) === '—' && T.prix(NaN) === '—' && T.prix(undefined) === '—');
v('variation : signe typographique et sens', T.variation(1.234).texte === '+1,23 %' && T.variation(-0.5).texte === '−0,50 %' && T.variation(-0.5).sens === -1 && T.variation(0).sens === 0 && T.variation(null).texte === '—');
v('âge lisible', T.age(1000, 1000 + 30e3) === 'à l’instant' && T.age(0, 5 * 60e3) === 'il y a 5 min' && T.age(0, 3 * 3600e3) === 'il y a 3 h' && T.age(0, 3 * 86400e3) === 'il y a 3 j' && T.age(undefined, 1) === '—');

// mini-courbe
const c = T.courbe([1, 2, 3, 2.5, 4], 100, 20);
v('mini-courbe : chemin, dernier point, sens', c && c.d.startsWith('M') && c.n === 5 && c.sens === 1 && c.dernier[0] === 98 && c.dernier[1] === 2);
v('mini-courbe : sens baissier', T.courbe([5, 4, 3], 50, 10).sens === -1);
v('mini-courbe : série trop courte ou vide → null', T.courbe([1], 50, 10) === null && T.courbe([], 50, 10) === null && T.courbe(null, 50, 10) === null);
v('mini-courbe : valeurs invalides ignorées', T.courbe([1, NaN, 2, undefined, 3], 60, 10).n === 3);
v('mini-courbe : série plate sans division par zéro', !/NaN|Infinity/.test(T.courbe([2, 2, 2], 60, 10).d));

// météo
v('codes WMO → catégories', T.categorieMeteo(0) === 'soleil' && T.categorieMeteo(2) === 'eclaircies' && T.categorieMeteo(3) === 'nuageux' && T.categorieMeteo(61) === 'pluie' && T.categorieMeteo(95) === 'orage' && T.categorieMeteo(73) === 'neige' && T.categorieMeteo(45) === 'brouillard' && T.categorieMeteo(999) === 'nuageux');
const brut = { current: { temperature_2m: 14.2, apparent_temperature: 12.8, weather_code: 3, wind_speed_10m: 17.6, precipitation: 0 }, daily: { time: ['2026-10-23', '2026-10-24', '2026-10-25'], weather_code: [3, 61, 0], temperature_2m_max: [16, 15, 18], temperature_2m_min: [9, 10, 8], precipitation_probability_max: [10, 80, 0] } };
const mt = T.resumeMeteo(brut, 'Pau');
v('météo : valeurs lues, trois jours', mt.etat === 'ok' && mt.temp === 14.2 && mt.vent === 18 && mt.jours.length === 3 && mt.jours[0].jour === 'auj.' && mt.jours[1].categorie === 'pluie' && mt.libelle === 'Nuageux');
v('météo : réponse vide ou cassée → indisponible avec raison', T.resumeMeteo({}, 'x').etat === 'indisponible' && !!T.resumeMeteo(null).raison && T.resumeMeteo({ current: { temperature_2m: 'x' } }).etat === 'indisponible');
v('météo : pas de « daily » → seulement le présent', T.resumeMeteo({ current: brut.current }, 'a').jours.length === 0);
v('urls : coordonnées et nom encodé', /latitude=43\.3&longitude=-0\.37/.test(T.urlMeteo(43.3, -0.37)) && /name=Saint-Jean%20de%20Luz/.test(T.urlGeocodage('Saint-Jean de Luz')));
v('géocodage : résultats utilisables seulement', T.resultatsGeocodage({ results: [{ name: 'Pau', admin1: 'Nouvelle-Aquitaine', country: 'France', latitude: 43.3, longitude: -0.37 }, { name: 'sans coordonnées' }] }).length === 1 && T.resultatsGeocodage(null).length === 0);

// séismes
const now = Date.UTC(2026, 9, 23, 20, 0, 0);
const evts = [{ id: 'a', type: 'seisme', titre: 'Séisme M 5.6 · Chili', t: now - 3600e3, severite: 3 }, { id: 'b', type: 'seisme', titre: 'Séisme M 2.9 · Alaska', t: now - 600e3, severite: 1 }, { id: 'c', type: 'seisme', titre: 'vieux', t: now - 5 * 86400e3, severite: 4 }, { id: 'd', type: 'incendie', titre: 'Feu', t: NaN }];
const le = T.lignesEvenements(evts, now, 4);
v('événements : plus graves d’abord, vieux et sans date écartés', le.length === 2 && le[0].id === 'a' && le[0].titre.startsWith('M 5.6') && le[0].age === 'il y a 1 h');
v('événements : liste vide ou absente', T.lignesEvenements([], now).length === 0 && T.lignesEvenements(null, now).length === 0);

// agent
const reels = {
  'gardien-prop': { etat: 'ok', pied: 'VERT · marge 678 $' }, 'regime-marche': { etat: 'ok', liste: [{ g: 'Bitcoin', d: '62/100 · Tendance haussière' }] },
  'propositions-agent': { etat: 'ok', etiquette: 'SIMULÉ', liste: [{ g: 'BTC ACHAT · Cassure', d: 'PASS' }] }
};
const la = T.lignesAgent(reels, { paires: ['BTC'], enRecherche: true, valides: 0 });
v('agent : quatre lignes (état, régime, signaux, gardien)', la.length === 4 && la.map(x => x.nom).join() === 'État,Régime,Signaux,Gardien prop');
v('agent : état de la recherche et validées', la[0].valeur === 'recherche en cours' && /0 stratégie validée/.test(la[0].detail));
v('agent : signal jugé par le gardien, étiqueté simulé', la[2].valeur === 'BTC ACHAT · Cassure' && la[2].ton === 'ok' && /simulé/.test(la[2].detail));
v('agent : gardien vert', la[3].valeur === 'VERT' && la[3].ton === 'ok' && /marge 678/.test(la[3].detail));
const la0 = T.lignesAgent({}, null);
v('agent non activé : jamais de valeur inventée', la0[0].valeur === 'non activé' && la0[1].valeur === '—' && la0[2].valeur === 'aucun' && la0[3].valeur === '—');
v('agent : gardien rouge → alerte', T.lignesAgent({ 'gardien-prop': { etat: 'ok', pied: 'ROUGE · marge 10 $' } }, null)[3].ton === 'alerte');
v('agent : fenêtre en erreur → raison affichée', /indisponible : boom/.test(T.lignesAgent({ 'gardien-prop': { etat: 'indisponible', erreur: 'boom' } }, null)[3].detail));
v('aucune ligne ne contient undefined / NaN / [object Object]', [...la, ...la0].every(x => !/undefined|NaN|\[object/.test(JSON.stringify(x))));

// système
v('micro : trois états distincts', T.etatMicro('idle').libelle === 'COUPÉ' && T.etatMicro('veille').libelle === 'VEILLE' && T.etatMicro('listening').libelle === 'ACTIF' && T.etatMicro('speaking').libelle === 'ACTIF' && T.etatMicro('inconnu').libelle === 'COUPÉ');
const sy = T.lignesSysteme({ worker: true, veilleur: null, etat: 'veille', mode: 'complet', fps: 143.6, version: '2026.10' });
v('système : lignes réelles, veilleur inconnu = tiret', sy.find(x => x.id === 'worker').ton === 'ok' && sy.find(x => x.id === 'veilleur').valeur === '—' && sy.find(x => x.id === 'micro').valeur === 'VEILLE' && /COMPLET · 144 i\/s/.test(sy.find(x => x.id === 'mode').valeur));
v('système : worker verrouillé = alerte', T.lignesSysteme({ worker: false, veilleur: false, etat: 'idle', mode: 'leger', fps: 0 }).find(x => x.id === 'worker').ton === 'alerte');

// actualités
v('actualités : titres bornés', T.titresActus([{ titre: 'x'.repeat(300), source: 'A', quand: 'il y a 1 h' }], 8)[0].titre.length === 120 && T.titresActus(null).length === 0 && T.titresActus(Array(20).fill({ titre: 't' }), 8).length === 8);

console.log(`\n${ok} réussis, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
