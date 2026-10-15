// Moteur de présentation : compose, à chaque demande, un texte DIFFÉRENT pour un pays, un océan ou une mer.
// Variété à trois niveaux : (1) formulations d'introduction / de transition / de conclusion tirées au hasard (sans répéter les dernières),
// (2) angles choisis et ordonnés au hasard (géographie, chiffres, histoire, culture, économie, anecdote, actualités…), (3) contenu tiré au hasard dans des listes
// (faits de donnees/mers.js, paragraphes Wikipédia de donnees/pays.js). Un fait absent n'est jamais inventé : l'angle est simplement sauté.
// Fonctions pures (testées) : composerPays(infos, options) · composerMer(mer, options) · art(nom) · chiffre(n) · … ; le hasard est injectable (rnd).
import { phrases } from './pays.js?v=2026.10.15.9';
import { comparaisons } from './planetes.js?v=2026.10.15.9';

/* ───── hasard sans répétition ───── */
const memoire = new Map();                                      // clé → derniers indices choisis
export function choisir(liste, cle, rnd = Math.random) {
  if (!liste.length) return null; if (liste.length === 1) return liste[0];
  const vus = memoire.get(cle) || [];
  const dispo = liste.map((_, i) => i).filter(i => !vus.includes(i));
  const i = (dispo.length ? dispo : liste.map((_, k) => k))[Math.floor(rnd() * (dispo.length || liste.length))];
  memoire.set(cle, [...vus, i].slice(-Math.min(3, liste.length - 1)));
  return liste[i];
}
export function melanger(liste, rnd = Math.random) { const a = liste.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function oublier() { memoire.clear(); }

/* ───── français : articles des noms de pays ───── */
const SANS_ARTICLE = new Set(['Chypre', 'Malte', 'Cuba', 'Haïti', 'Madagascar', 'Israël', 'Monaco', 'Singapour', 'Taïwan', 'Andorre', 'Djibouti', 'Brunei', 'Bahreïn', 'Maurice', 'Sri Lanka', 'Saint-Marin', 'Antigua-et-Barbuda', 'Sainte-Lucie', 'Saint-Christophe-et-Niévès', 'Grenade', 'Barbade', 'Dominique', 'Vanuatu', 'Nauru', 'Tuvalu', 'Kiribati', 'Palau', 'Samoa', 'Tonga', 'Fidji', 'Îles Fidji', 'Qatar', 'Koweït', 'Gibraltar', 'Hong Kong', 'Macao', 'Porto Rico', 'Guam']);
const PLURIELS = /^(États-Unis|Pays-Bas|Émirats arabes unis|Philippines|Maldives|Seychelles|Bahamas|Comores|Îles |Bermudes|Antilles|Palaos|Fidji|Samoa américaines|Territoires)/;
const MASC_E = new Set(['Mexique', 'Cambodge', 'Zimbabwe', 'Mozambique', 'Belize', 'Honduras', 'Salvador', 'Costa Rica', 'Cap-Vert', 'Danemark', 'Luxembourg', 'Liechtenstein', 'Sénégal', 'Népal', 'Portugal', 'Brésil', 'Canada', 'Japon', 'Maroc', 'Pérou', 'Chili', 'Liban', 'Yémen', 'Soudan', 'Soudan du Sud', 'Tchad', 'Niger', 'Mali', 'Gabon', 'Togo', 'Bénin', 'Ghana', 'Kenya', 'Nigeria', 'Cameroun', 'Congo', 'Vietnam', 'Laos', 'Pakistan', 'Bangladesh', 'Bhoutan', 'Botswana', 'Rwanda', 'Burundi', 'Malawi', 'Lesotho', 'Swaziland', 'Eswatini', 'Zambie', 'Paraguay', 'Uruguay', 'Venezuela', 'Panama', 'Nicaragua', 'Guatemala', 'Surinam', 'Guyana', 'Tadjikistan', 'Kirghizistan', 'Turkménistan', 'Ouzbékistan', 'Kazakhstan', 'Azerbaïdjan', 'Afghanistan', 'Irak', 'Iran', 'Oman', 'Tibet', 'Kosovo', 'Monténégro', 'Bélarus', 'Belarus', 'Tchad', 'Royaume-Uni', 'Timor oriental', 'Bangladesh', 'Zaïre', 'Burkina Faso', 'Libéria', 'Liberia', 'Ghana', 'Myanmar', 'Sri Lanka']);
const VOY = /^[AEIOUYÂÊÎÔÛÉÈÀÎÏÖÜ]/i;
export function art(nom) {
  nom = String(nom || '').trim();
  if (SANS_ARTICLE.has(nom)) return { def: nom, Def: nom, du: 'de ' + nom, a: 'à ' + nom, pl: false };
  if (PLURIELS.test(nom)) return { def: 'les ' + nom, Def: 'Les ' + nom, du: 'des ' + nom, a: 'aux ' + nom, pl: true };
  const masc = MASC_E.has(nom) || (!/(e|ie|ée|a)$/i.test(nom) && !/^(République|Côte|Nouvelle|Papouasie|Sierra|Guinée|Terre|Île)/i.test(nom));
  if (VOY.test(nom)) return { def: 'l’' + nom, Def: 'L’' + nom, du: 'de l’' + nom, a: masc ? 'en ' + nom : 'en ' + nom, pl: false };
  if (masc) return { def: 'le ' + nom, Def: 'Le ' + nom, du: 'du ' + nom, a: 'au ' + nom, pl: false };
  return { def: 'la ' + nom, Def: 'La ' + nom, du: 'de la ' + nom, a: 'en ' + nom, pl: false };
}

// « Mer Méditerranée » → « la mer Méditerranée », « Océan Pacifique » → « l’océan Pacifique », « Golfe du Mexique » → « le golfe du Mexique »
export function designation(nom) {
  nom = String(nom || '');
  let x;
  if ((x = /^Mer (.+)$/.exec(nom))) return 'la mer ' + x[1];
  if ((x = /^Océan (.+)$/.exec(nom))) return 'l’océan ' + x[1];
  if ((x = /^Golfe (.+)$/.exec(nom))) return 'le golfe ' + x[1];
  if ((x = /^La (.+)$/.exec(nom))) return 'la ' + x[1];
  return nom;
}

const MOTS_COURANTS = /^(le|la|les|l['’]|un|une|ce|cet|cette|ces|son|sa|ses|leur|leurs|en|au|aux|dans|depuis|pendant|après|avant|selon|pour|sur|il|elle|ils|elles|on|chaque|de|du|des|à|d['’]|avec|sans|par|lors|entre|vers|près|environ|plus|aujourd['’]hui|actuellement|longtemps|aucun|aucune|plusieurs|certains|certaines|tout|toute|tous|toutes|où|à partir|jusqu['’])\b/i;
export function minuscule(t) { t = String(t || ''); return MOTS_COURANTS.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; }

/* ───── nombres à dire à voix haute ───── */
const sep = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const dec = (x, d = 1) => x.toFixed(d).replace('.', ',').replace(/,0$/, '');
export function habitants(n) {
  if (!n) return null;
  if (n >= 1e9) return dec(n / 1e9) + (n / 1e9 >= 2 ? ' milliards' : ' milliard');
  if (n >= 1e6) return dec(n / 1e6) + (n / 1e6 >= 2 ? ' millions' : ' million');
  if (n >= 1e4) return sep(Math.round(n / 1e3) * 1e3);
  return sep(Math.round(n / 10) * 10);
}
export function surface(km2) {
  if (!km2) return null;
  if (km2 >= 1e6) return dec(km2 / 1e6) + ' millions de kilomètres carrés';
  if (km2 >= 1e4) return sep(Math.round(km2 / 1e3) * 1e3) + ' kilomètres carrés';
  return sep(Math.round(km2)) + ' kilomètres carrés';
}
const FRANCE = 551695;                                           // France métropolitaine, km² (comparaison parlante)
export function comparaisonFrance(km2) {
  if (!km2) return null; const r = km2 / FRANCE;
  if (r > 1.25) return 'soit environ ' + dec(r, r >= 10 ? 0 : 1) + (r >= 2 ? ' fois' : ' fois') + ' la France métropolitaine';
  if (r >= .8) return 'soit à peu près la taille de la France métropolitaine';
  if (r >= .05) return 'soit environ ' + Math.round(r * 100) + ' pour cent de la France métropolitaine';
  return 'soit environ ' + Math.round(1 / r) + ' fois moins que la France métropolitaine';
}

/* ───── banques de formulations ───── */
const INTRO_PAYS = [
  A => `On met le cap sur ${A.def} !`, A => `Direction ${A.def}.`, A => `Zoom sur ${A.def}.`, A => `Parlons un peu ${A.du}.`, A => `Je t’emmène ${A.a}.`,
  A => `${A.Def}, ça te dit ? Allons voir ça de plus près.`, A => `Voyons ce que la Terre a à nous raconter sur ${A.def}.`, A => `Cap ${A.a} : je te présente ce pays.`, A => `Allez, ${A.def}, c’est parti.`,
];
const INTRO_MER = [
  n => `On met le cap sur ${n}.`, n => `Direction : ${n}.`, n => `Voici ${n}, vue depuis l’espace.`, n => `Zoom sur ${n}.`, n => `Je te présente ${n}.`, n => `Allons voir ${n} de plus près.`, n => `Que sait-on de ${n} ? Voyons ça.`,
];
const LIEN = ['', '', 'Autre chose : ', 'Par ailleurs, ', 'À savoir aussi : ', 'Et ', 'Un autre point : ', 'Ce n’est pas tout. '];
const PREF = {
  geo: ['Côté géographie : ', 'Sur le plan géographique, ', 'Pour situer le décor : ', 'Géographiquement, ', 'Ce qui frappe d’abord, c’est le territoire : '],
  histoire: ['Un peu d’histoire : ', 'Côté histoire, ', 'Pour comprendre d’où elle vient : ', 'L’histoire raconte que ', 'Dans le passé, '],
  culture: ['Côté culture : ', 'Sur le plan culturel, ', 'Ce qui fait son identité : ', 'À propos de la culture : '],
  societe: ['Côté société : ', 'Pour parler des habitants : ', 'Sur le plan humain, '],
  eco: ['Côté économie : ', 'Sur le plan économique, ', 'Pour ce qui est de l’activité : '],
  composition: ['Côté composition : ', 'De quoi est-elle faite ? ', 'À l’intérieur, ', 'Pour ce qui est de sa matière : '],
  atmosphere: ['Côté atmosphère : ', 'Là-haut, ', 'Pour ce qui est de l’air : ', 'Au-dessus de la surface, '],
  missions: ['Côté exploration : ', 'Les sondes y sont passées : ', 'Pour ce qui est des missions : ', 'Les ingénieurs lui ont rendu visite : '],
  records: ['Un record : ', 'Elle détient des records : ', 'Dans la catégorie des superlatifs : ', 'Ce qui la distingue : '],
  comparaisons: ['Comparée à la Terre : ', 'Pour se représenter : ', 'En comparaison avec chez nous : ', 'Pour se faire une idée : '],
  chiffres: ['Quelques chiffres : ', 'Pour les chiffres, ', 'Côté chiffres : ', 'Pour donner une idée de l’échelle : ', 'En quelques nombres : '],
  anecdotes: ['Une petite anecdote : ', 'Un détail que j’aime bien : ', 'Savais-tu que ? ', 'Pour la petite histoire : ', 'Un détail amusant : '],
};
const OUTRO = [
  n => `Voilà pour ${n}. Dis-moi si tu veux un autre pays, un océan, ou les actualités de la zone.`, n => `C’est tout pour l’instant. Où va-t-on ensuite ?`, n => `Fin du tour d’horizon. Tu peux me demander un autre endroit, ou en savoir plus sur celui-ci.`,
  n => `On a fait le tour de l’essentiel. Dis un nom de pays ou de mer, et j’y vais.`, n => `Je m’arrête là pour ${n}. Une autre destination ?`, n => `Voilà ce que je voulais te montrer. Une autre question, ou un autre endroit ?`,
];
const INTRO_ASTRE = [
  A => `On met le cap sur ${A}.`, A => `Direction ${A}.`, A => `Approchons-nous de ${A}.`, A => `Voici ${A}, vue de près.`, A => `Je te présente ${A}.`, A => `Allons voir ${A} de plus près.`, A => `Zoom sur ${A}.`,
];
const AUCUNE_ACTU = ['Je n’ai pas d’actualité fiable à te citer pour l’instant, et je préfère ne rien inventer.', 'Côté actualité, je n’ai rien de récent sous la main : la source ne répond pas.'];
const ACTU_INTRO = ['À la une en ce moment : ', 'Côté actualité : ', 'Dans l’actualité, ', 'Ce que racontent les journaux : ', 'En ce moment, dans les médias : '];

/* ───── pays ───── */
// infos : sortie de donnees/pays.js ; actus : [{titre, source}] ; options : {angles (nombre), rnd}
export function composerPays(infos, { actus = null, angles = 3, rnd = Math.random, a2 } = {}) {   // actus : null = pas essayé ; [] = essayé, rien de trouvé
  const A = art(infos.nom), segs = [];
  segs.push({ angle: 'intro', texte: choisir(INTRO_PAYS, 'ip', rnd)(A) });
  const dispo = [];
  // chiffres : on ne dit que ce qu'on a
  const f = [];
  if (infos.capitale) f.push(choisir([`La capitale ${A.du} est ${infos.capitale}.`, `Sa capitale, c’est ${infos.capitale}.`, `${A.Def} a pour capitale ${infos.capitale}.`], 'cap', rnd));
  if (infos.population) f.push(choisir([`${A.pl ? A.Def + ' comptent' : A.Def + ' compte'} environ ${habitants(infos.population)} d’habitants${infos.popAnnee ? ' (estimation ' + infos.popAnnee + ')' : ''}.`, `On y dénombre environ ${habitants(infos.population)} d’habitants.`, `Environ ${habitants(infos.population)} de personnes y vivent.`], 'pop', rnd));
  if (infos.superficie) f.push(choisir([`Son territoire couvre environ ${surface(infos.superficie)}, ${comparaisonFrance(infos.superficie)}.`, `Il s’étend sur environ ${surface(infos.superficie)} : ${comparaisonFrance(infos.superficie)}.`], 'sup', rnd));
  if (infos.population && infos.superficie && infos.superficie > 0) { const d = infos.population / infos.superficie; if (d >= 1) f.push(choisir([`Cela fait une densité d’environ ${d >= 10 ? Math.round(d) : dec(d)} habitants au kilomètre carré.`, `La densité moyenne est d’environ ${d >= 10 ? Math.round(d) : dec(d)} habitants par kilomètre carré.`], 'dens', rnd)); }
  if (infos.continent) f.push(choisir([`Il se situe en ${infos.continent}.`, `On le trouve en ${infos.continent}.`], 'cont', rnd));
  if (f.length) dispo.push({ angle: 'chiffres', texte: melanger(f, rnd).slice(0, Math.min(3, f.length)).join(' ') });
  if (infos.intro && infos.intro.length > 90) dispo.push({ angle: 'geo', texte: choisir(['Pour le situer : ', 'En deux mots : ', 'Pour planter le décor : '], 'pi', rnd) + minuscule(phrases(infos.intro, 300)) });
  for (const k of ['geo', 'histoire', 'culture', 'societe', 'eco']) {
    const paras = (infos.sections && infos.sections[k]) || []; if (!paras.length) continue;
    const p = choisir(paras, 'par:' + (a2 || infos.nom) + ':' + k, rnd), t = phrases(p, k === 'histoire' ? 380 : 320);
    if (t.length > 60) dispo.push({ angle: k, texte: choisir(PREF[k], 'pref:' + k, rnd) + minuscule(t) });
  }
  const ordre = melanger(dispo, rnd).slice(0, Math.max(1, angles));
  ordre.forEach(s => segs.push({ angle: s.angle, texte: s.texte }));
  if (actus && actus.length) {
    const n = Math.min(actus.length, 1 + Math.floor(rnd() * 2) + 1), pris = melanger(actus, rnd).slice(0, n);
    segs.push({ angle: 'actus', texte: choisir(ACTU_INTRO, 'ai', rnd) + pris.map(a => a.titre.replace(/\s+[-–|]\s+[^-–|]{2,40}$/, '').trim() + (a.source ? ' (' + a.source + ')' : '')).join(' ; ') + '.' });
  } else if (actus) segs.push({ angle: 'actus', texte: choisir(AUCUNE_ACTU, 'aa', rnd) });
  if (!dispo.length) segs.splice(1, 0, { angle: 'vide', texte: 'Je n’ai pas pu consulter mes sources en ligne pour ' + A.def + ' : je préfère ne rien inventer. Vérifie la connexion à Internet et redemande-moi.' });
  segs.push({ angle: 'fin', texte: choisir(OUTRO, 'ou', rnd)(A.def) });
  return { titre: infos.nom, segments: segs, sources: infos.source || [] };
}

/* ───── planètes, Soleil, Lune, astéroïdes, ISS ───── */
// d : fiche de donnees/planetes.js ; renvoie la présentation (introduction, 3 angles au hasard, conclusion)
export function composerAstre(d, { angles = 3, rnd = Math.random } = {}) {
  const A = d.art, segs = [{ angle: 'intro', texte: choisir(INTRO_ASTRE, 'ia', rnd)(A) }];
  const dispo = [];
  for (const k of ['composition', 'atmosphere', 'missions', 'records', 'anecdotes']) { const l = d[k] || []; if (l.length) dispo.push({ angle: k, texte: choisir(PREF[k], 'pref:' + k, rnd) + choisir(l, 'a:' + d.id + ':' + k, rnd) }); }
  const cmp = comparaisons(d.id); if (cmp.length) dispo.push({ angle: 'comparaisons', texte: choisir(PREF.comparaisons, 'pref:cmp', rnd) + choisir(cmp, 'a:' + d.id + ':cmp', rnd) });
  melanger(dispo, rnd).slice(0, Math.max(1, angles)).forEach(s => segs.push({ angle: s.angle, texte: s.texte }));
  segs.push({ angle: 'fin', texte: choisir(OUTRO, 'ou', rnd)(A) });
  return { titre: d.nom, segments: segs, sources: ['NASA, ESA, JPL (fiches Raylé)'] };
}

/* ───── océans et mers ───── */
export function composerMer(m, { actus = null, angles = 3, rnd = Math.random } = {}) {
  const dn = designation(m.nom), segs = [{ angle: 'intro', texte: choisir(INTRO_MER, 'im', rnd)(dn) }];
  const dispo = [];
  for (const k of ['geo', 'chiffres', 'histoire', 'anecdotes']) { const l = m[k] || []; if (l.length) dispo.push({ angle: k, texte: choisir(PREF[k], 'pref:' + k, rnd) + choisir(l, 'm:' + m.id + ':' + k, rnd) }); }
  const ordre = melanger(dispo, rnd).slice(0, Math.max(1, angles));
  ordre.forEach(s => segs.push({ angle: s.angle, texte: s.texte }));
  if (actus && actus.length) segs.push({ angle: 'actus', texte: choisir(ACTU_INTRO, 'ai', rnd) + melanger(actus, rnd).slice(0, 2).map(a => a.titre + (a.source ? ' (' + a.source + ')' : '')).join(' ; ') + '.' });
  else if (actus) segs.push({ angle: 'actus', texte: choisir(AUCUNE_ACTU, 'aa', rnd) });
  segs.push({ angle: 'fin', texte: choisir(OUTRO, 'ou', rnd)(dn) });
  return { titre: m.nom, segments: segs, sources: ['données Raylé (OHI, NOAA, NASA)'] };
}
export const ANGLES_LIBELLES = { composition: 'Composition', atmosphere: 'Atmosphère', missions: 'Missions', records: 'Records', comparaisons: 'Comparaison avec la Terre', intro: 'Introduction', chiffres: 'Chiffres', geo: 'Géographie', histoire: 'Histoire', culture: 'Culture', societe: 'Société', eco: 'Économie', anecdotes: 'Anecdote', actus: 'Actualités', fin: 'Pour finir', vide: 'Information' };
