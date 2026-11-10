/* Tests « Rayle parle de mon terminal » (pur, Node) : « Décris mon terminal », « Fais-moi le point » (30 à 60 s, structuré, 1 ou 2 scénarios, « pas un signal »),
   « Explique-moi le COT / la santé / le tableau / ce niveau » (3 niveaux), relances, mémoire de session, jamais d'ordre ni de prévision certaine,
   et la chaîne voix : texte du briefing → normalisation → phrases lisibles.  Usage : node agent-trading/tests/terminal-voix-test.mjs */
import { createRequire } from 'node:module';
import { resumeCarnet, niveauxQuiComptent, etatTerminal, intention, MENTION_LECTURE } from '../front/terminal/lecture-rayle.js';
import { intentionVoix, niveauPedagogique, decrire, briefing, dureeEstimee, expliquer, EXPLICATIONS, historique, CONSIGNE_BRIEFING, consigneExplication } from '../front/terminal/briefing-rayle.js';
const N = createRequire(import.meta.url)('../../core/voice/normalisation-fr.js');

let ok = 0, ko = 0;
const t = (c, m, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', m, d); } };
const fmt = x => Number(x).toFixed(2).replace('.', ','), heure = () => '15 h 30';
const MAINT = 1_700_000_000_000;

// état de test réaliste : or en H1, tendance haussière, MA200, carnet, annonce, COT, santé, une position
const niveaux = niveauxQuiComptent({ prix: 4070.25, atr: 8, objets: [{ type: 'horizontale', p: 4050, etiquette: 'support de la veille' }], auto: [{ p: 4095, touches: 6 }], zones: [], liquidites: [], ma200: 4020 });
const carnet = resumeCarnet({ bids: new Map([[4070, 50], [4069, 40], [4060, 900]]), asks: new Map([[4070.5, 20], [4072, 15], [4085, 700]]) }, { transactions: [{ t: MAINT - 1000, p: 4070, q: 20, usd: 81400, cote: 'buy' }], seuil: 5000, maintenant: MAINT });
const COT = { nom: 'Or', date: '2026-11-03', categories: [{ nom: 'spéculateurs', net: 182345, variation: 4000 }, { nom: 'commerciaux', net: -150000 }], lecture: 'positionnement acheteur chargé' };
const E = etatTerminal({ actif: 'XAU', nomActif: 'Or', unite: 'H1', prix: 4070.25, atr: 8, tendance: { sens: 'haussière', raison: 'structure et SMA 200' }, ma200: 4020, niveaux, carnet,
  positions: [{ actif: 'XAU', sens: 'achat', etat: 'ouverte', entree: 4055, stop: 4040, objectif: 4100 }], sante: { volatilite: { mot: 'normale' }, volumeRelatif: { mot: 'élevé' } },
  annonces: [{ t: MAINT + 15 * 60e3, devise: 'USD', titre: 'CPI', impact: 'fort' }], cot: COT, maintenant: MAINT });
const X = { annonces: [{ t: MAINT + 15 * 60e3, devise: 'USD', titre: 'CPI', impact: 'fort' }], cot: COT, sante: { rangAtr: 62, seances: [{ nom: 'New York', ouverte: true }], correlations: [{ nom: 'DXY', r: -0.7 }] }, journal: { ouvertes: 1, attente: 0, closes: 4, dernier: 'achat or ouvert' }, tableau: null };
const aide = { fmt, heure, maintenant: MAINT };

// ── intentions : phrases naturelles
const I = (s, o) => intentionVoix(s, o);
for (const s of ['Décris mon terminal', 'decris-moi mon terminal', 'Qu\'est-ce qui est affiché ?', 'Qu\'est-ce que je regarde ?', 'dis-moi ce que je vois sur l\'écran']) t(I(s) && I(s).type === 'decrire', 'décrire : ' + s, JSON.stringify(I(s)));
for (const s of ['Fais-moi le point', 'fais le point sur le marché', 'Donne-moi un briefing', 'état des lieux', 'Fais-moi le point complet']) t(I(s) && I(s).type === 'point', 'point : ' + s, JSON.stringify(I(s)));
t(I('Explique-moi le COT') && I('Explique-moi le COT').sujet === 'cot', 'expliquer le COT');
t(I('explique-moi la santé du marché') && I('explique-moi la santé du marché').sujet === 'sante', 'expliquer la santé du marché');
t(I('explique-moi ce tableau de bord') && I('explique-moi ce tableau de bord').sujet === 'tableau', 'expliquer le tableau de bord');
t(I('explique-moi ce niveau') && I('explique-moi ce niveau').sujet === 'niveau', 'expliquer ce niveau');
t(I('c\'est quoi la moyenne mobile 200 ?') && I('c\'est quoi la moyenne mobile 200 ?').sujet === 'ma200', 'c\'est quoi la MA200');
t(I('explique-moi le COT comme à un débutant').niveau === 'debutant' && I('explique-moi le COT en détail').niveau === 'detail' && I('explique-moi le COT').niveau === 'normal', 'niveaux pédagogiques');
t(niveauPedagogique('de façon très simple') === 'debutant' && niveauPedagogique('plus en détail') === 'detail', 'niveaux : formulations variées');
t(I('quel temps fait-il à Paris ?') === null && I('raconte-moi une blague') === null && I('ouvre Mars') === null, 'conversation libre : le terminal ne la prend pas');
t(I('achète de l\'or') === null && intention('achète de l\'or').type === 'ordre', 'jamais d\'ordre : refusé par l\'intention de lecture');
const der = { q: 'explique-moi le COT', rep: 'Le COT…', t: MAINT - 30e3 };
t(I('et pourquoi ?', { derniere: der, maintenant: MAINT }).type === 'relance', 'relance « et pourquoi ? » dans les 4 minutes');
t(I('en détail', { derniere: der, maintenant: MAINT }).niveau === 'detail', 'relance « en détail »');
t(I('et le carnet ?', { derniere: der, maintenant: MAINT }).sujet === 'carnet', 'relance sur un autre sujet');
t(I('et pourquoi ?', { derniere: { ...der, t: MAINT - 10 * 60e3 }, maintenant: MAINT }) === null, 'pas de relance après 4 minutes');
t(I('et pourquoi ?') === null, 'pas de relance sans échange précédent');

// ── décrire
const d = decrire(E, { couches: ['Volume', 'SMA 200 de l’unité affichée'], outils: { lignes: 2, zones: 1, autres: 0 } }, { fmt });
t(/Tu regardes l’or en H1/.test(d) && /4070,25/.test(d) && /tendance haussière/.test(d), 'décrire : actif, unité, prix, tendance', d);
t(/Couches affichées : Volume, SMA 200/.test(d) && /3 dessins : 2 lignes, 1 zone/.test(d) && /1 ouverte/.test(d) && /simulées/.test(d), 'décrire : couches, outils, positions', d);
t(/vierge/.test(decrire(E, { couches: [] }, { fmt })) && /Aucun dessin/.test(decrire(E, {}, { fmt })) && /Aucune position/.test(decrire({ ...E, positions: [] }, {}, { fmt })), 'décrire : graphique vierge, sans dessin, sans position');
t(/pas encore arrivé/.test(decrire({ ...E, prix: null }, {}, { fmt })), 'décrire : prix absent dit honnêtement');

// ── fais-moi le point
const b = briefing(E, X, aide);
const dur = dureeEstimee(b), mots = N.normaliser(b).split(/\s+/).length;
t(dur >= 30 && dur <= 60, 'briefing : 30 à 60 secondes parlées', dur + ' s · ' + mots + ' mots dits');
t(mots / 2.7 >= 30 && mots / 2.7 <= 62, 'briefing : durée réelle (mots du texte normalisé) entre 30 et 62 s', Math.round(mots / 2.7) + ' s');
const ordre = ['D’abord le prix', 'Moyenne mobile deux cents', 'Niveaux qui comptent', 'Carnet :', 'À venir', 'COT :', 'Santé du marché', 'Tes positions simulées', 'Scénario A', 'Information de lecture, pas un signal'];
let pos = -1; for (const m of ordre) { const i = b.indexOf(m); t(i > pos, 'briefing : « ' + m + ' » dans l\'ordre', b.slice(0, 80)); if (i > pos) pos = i; }
t((b.match(/Scénario [A-Z],/g) || []).length >= 1 && (b.match(/Scénario [A-Z],/g) || []).length <= 2, 'briefing : un ou deux scénarios au maximum');
t(/validé par/.test(b) && /invalidé par/.test(b), 'briefing : validation et invalidation');
t(/dans 15 minutes/.test(b) && /CPI/.test(b), 'briefing : annonce à venir', b);
t(/mur (vendeur|acheteur)/.test(b) && /gros paquet/.test(b), 'briefing : carnet (mur, gros paquet)');
t(!/acheter maintenant|vends|garanti|certain|sûr à/.test(b), 'briefing : aucun ordre, aucune certitude');
t(/4070,25/.test(b) && !/4071,/.test(b), 'briefing : chiffres issus de l\'état');
const bVide = briefing({ ...E, carnet: null, cot: null, cotAbsent: 'pas de COT pour l’or', annonces: [], positions: [], sante: null, ma200: null }, {}, aide);
t(/pas encore reçu/.test(bVide) && /Pas de COT|pas de COT|Pas d’annonce/.test(bVide) && /Aucune position/.test(bVide) && /Pas assez de bougies/.test(bVide) && /Information de lecture/.test(bVide), 'briefing : chaque donnée absente est dite', bVide);
t(/ne peux pas faire le point/.test(briefing({ ...E, prix: null }, X, aide)), 'briefing sans prix : je ne sais pas');
t(/30 à 60 secondes/.test(CONSIGNE_BRIEFING) && /moyenne mobile 200/.test(CONSIGNE_BRIEFING) && /information de lecture, pas un signal/i.test(CONSIGNE_BRIEFING), 'consigne envoyée à l\'IA : structure demandée');

// ── expliquer : 3 niveaux + lecture du moment
for (const sujet of Object.keys(EXPLICATIONS)) {
  const e1 = expliquer(sujet, 'debutant', E, X, aide), e2 = expliquer(sujet, 'normal', E, X, aide), e3 = expliquer(sujet, 'detail', E, X, aide);
  t(e1 && e2 && e3 && e1 !== e2 && e2 !== e3, 'expliquer ' + sujet + ' : trois niveaux différents');
  t(e3.length > e1.length, 'expliquer ' + sujet + ' : « en détail » plus long que « débutant »');
  t(e2.endsWith(MENTION_LECTURE), 'expliquer ' + sujet + ' : mention de lecture');
}
t(/Dans ton terminal maintenant : .*182 345/.test(expliquer('cot', 'normal', E, X, aide).replace(/[  ]/g, ' ')), 'COT : explication puis chiffres du moment');
t(/Dans ton terminal maintenant : .*Volatilité normale/.test(expliquer('sante', 'normal', E, X, aide)), 'santé : explication puis lecture du moment');
t(/support 4050,00/.test(expliquer('niveau', 'normal', E, X, aide)), 'niveau : explication puis niveaux du graphique');
t(/Je ne sais pas|pas la donnée/.test(expliquer('tableau', 'normal', E, { ...X, tableau: null }, aide)), 'tableau absent : « pas la donnée » plutôt qu\'un chiffre inventé');
t(expliquer('inconnu', 'normal', E, X, aide) === null, 'sujet inconnu : null');
t(/débutant/.test(consigneExplication('cot', 'debutant')) && /en détail/.test(consigneExplication('cot', 'detail')), 'consigne pédagogique envoyée à l\'IA');

// ── mémoire de session pour la conversation suivie
const H = historique([{ q: 'a', rep: 'b' }, { q: 'c', rep: 'd' }]);
t(H.length === 4 && H[0].role === 'user' && H[1].role === 'assistant', 'historique de session : alternance utilisateur / Rayle');
t(historique(Array.from({ length: 20 }, (_, i) => ({ q: 'q' + i, rep: 'r' + i })), 6).length === 12, 'historique : limité aux 6 derniers échanges');

// ── chaîne vers la voix : le briefing devient un texte lisible, phrase par phrase
const parole = N.normaliser(b);
const ph = N.phrases(parole);
t(ph.length >= 8, 'voix : le briefing est découpé en phrases (diffusion en flux)', ph.length);
t(!/\d/.test(parole), 'voix : plus aucun chiffre brut dans le texte lu', parole.match(/.{0,20}\d.{0,20}/));
t(/quatre mille soixante-dix virgule vingt-cinq/.test(parole) && /C\.O\.T\./.test(parole) && /C\.P\.I\./.test(parole), 'voix : prix, COT et CPI prononcés');
t(ph.every(p => p.length < 260), 'voix : aucune phrase interminable', Math.max(...ph.map(p => p.length)));

console.log(`${ok} ok, ${ko} KO`);
process.exit(ko ? 1 : 0);
