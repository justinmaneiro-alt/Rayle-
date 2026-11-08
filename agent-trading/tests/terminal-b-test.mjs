/* Tests de la PHASE B du terminal de Rayle (pur, Node) : objets (création, modification, déplacement, toucher, annuler / rétablir,
   export / import), surveillance alertes-terminal-v1 sur CHAQUE type d'objet (approche, touche, rebond = flèche, cassure = croix + retourné,
   alerte libre), AUCUN REPEINT (rejeu bougie par bougie identique au calcul d'un coup), registre en ajout seul, excursions 48 bougies,
   bilan « pas assez de données », zones de réaction (« testée N fois, a tenu M »), anti-doublon et délai des alertes.
   Usage : node agent-trading/tests/terminal-b-test.mjs */
import { creer, modifier, deplacer, valeur, toucher, aimanter, creerHistorique, exporter, importer } from '../front/terminal/objets-calcul.js';
import { surveiller, surveillerObjet, atrSerie, closes, excursion, bilanRegistre, zonesReaction, testsZone, profilVolume, alerteActive } from '../front/terminal/surveillance-terminal.js';
import { admettre, texteAlerte, phraseAlerte } from '../front/terminal/alertes-calcul.js';
import { REGLES_TERMINAL } from '../front/terminal/regles-terminal.js';
import { ouvrirStockage } from '../front/terminal/stockage-terminal.js';

let ok = 0, ko = 0;
const t = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3;
t(REGLES_TERMINAL.approcheAtr === 0.5 && REGLES_TERMINAL.toucheAtr === 0.25 && REGLES_TERMINAL.reboundAtr === 1 && REGLES_TERMINAL.cassureAtr === 0.5 && REGLES_TERMINAL.excursionBougies === 48 && REGLES_TERMINAL.minEvenements === 30, 'règles figées : seuils de la consigne'); t(REGLES_TERMINAL.version === 'alertes-terminal-v2', 'version v2 (côté collant)');

/* ── objets ── */
const h = creer('horizontale', { actif: 'OR', unite: 'H1', p: 100, cree: 0 });
t(h && h.alertes.approche && h.alertes.touche && h.alertes.rebond && h.alertes.cassure && !h.alerte, 'alertes actives par défaut sur un objet de niveau');
t(creer('horizontale', { p: -1 }) === null && creer('zone', { bas: 1, haut: 1 }) === null && creer('tendance', { t1: 1, p1: 1, t2: 1, p2: 2 }) === null && creer('inconnu', {}) === null, 'objets incomplets refusés');
const z = creer('zone', { bas: 105, haut: 103, t1: 0, cree: 0 }); t(z.bas === 103 && z.haut === 105, 'zone : bas / haut remis dans l’ordre');
const tr = creer('tendance', { t1: 10 * H, p1: 110, t2: 0, p2: 100, cree: 0 }); t(tr.t1 === 0 && tr.p2 === 110, 'tendance : ancres triées dans le temps');
t(valeur(tr, 5 * H) === 105 && valeur(tr, 20 * H) === 120 && valeur(tr, -H) === null, 'valeur d’une droite (prolongée à droite, rien avant la première ancre)');
const h2 = modifier(h, { p: 101, etiquette: 'S1', couleur: '#ef6a5f', epaisseur: 3, alerte: true, alertes: { approche: false }, id: 'pirate', cree: 999 });
t(h2.p === 101 && h2.etiquette === 'S1' && h2.couleur === '#ef6a5f' && h2.epaisseur === 3 && h2.alerte && h2.alertes.approche === false && h2.alertes.cassure && h2.id === h.id && h2.cree === 0, 'modification : prix, étiquette, couleur, épaisseur, m’alerter ; identité intacte');
t(deplacer(tr, H, 2).p1 === 102 && deplacer(tr, H, 2).t1 === H && deplacer(h, 5 * H, 3).p === 103, 'déplacement');
{ const X = tt => tt / H * 10, Y = p => 1000 - p * 5; // 1 h = 10 px
  t(toucher([h], 50, Y(100) + 3, X, Y).objet === h, 'toucher une ligne horizontale');
  t(toucher([h], 50, Y(100) + 30, X, Y) === null, 'clic loin : rien');
  t(toucher([tr], X(0), Y(100), X, Y).poignee === 'p1' && toucher([tr], X(5 * H), Y(105), X, Y).poignee === 'corps', 'toucher une ancre ou le corps d’une tendance');
  const zz = toucher([z], 50, Y(104), X, Y); t(zz && zz.poignee === 'corps', 'toucher l’intérieur d’une zone'); }
t(aimanter(100.04, { o: 99, h: 100.05, l: 98, c: 99.5 }, 0.05) === 100.05 && aimanter(101, { o: 99, h: 100.05, l: 98, c: 99.5 }, 0.05) === 101, 'aimantation aux prix de la bougie');
{ const H0 = creerHistorique([]); H0.appliquer([h]); H0.appliquer([h, z]); t(H0.annuler().length === 1 && H0.annuler().length === 0 && H0.annuler() === null, 'annuler'); t(H0.retablir().length === 1 && H0.retablir().length === 2 && !H0.peutRetablir(), 'rétablir'); H0.annuler(); H0.appliquer([tr]); t(!H0.peutRetablir(), 'une nouvelle action efface le rétablissement'); }
{ const L = importer(exporter([h, z, tr])); t(L.length === 3 && L[1].bas === 103, 'export / import'); let e = null; try { importer('{"format":"autre"}'); } catch (x) { e = x.message; } t(!!e, 'import d’un fichier étranger refusé'); }

/* ── bougies de scénario (ATR ≈ 2) ── */
const B = (p, i, d = {}) => ({ t: i * H, o: p, h: p + 1, l: p - 1, c: p, v: 10, ...d });
function scenario(prix) { return prix.map((x, i) => (typeof x === 'number' ? B(x, i) : B(x.c, i, x))); }
const plat = n => Array.from({ length: n }, () => 120);
// support à 100 : prix 120 → descend, touche 100.3 (bas), rebond net jusqu'à 104 (≥ 1 ATR au-dessus), puis plus tard cassure sous 98.9
const prix = [...plat(20), 115, 110, 106, 102.5, { c: 101.2, l: 100.3, h: 102 }, { c: 103.3, l: 101, h: 103.6 }, 104, 106, 110, 115, 118, 112, 106, 102, { c: 100.4, l: 99.4, h: 101 }, { c: 98.6, l: 98.4, h: 100.2 }, 97, 96, 95, 96, 97, 98, 99, { c: 99.6, l: 98, h: 100.4 }, 97, 95, ...Array.from({ length: 50 }, (_, k) => 95 - k * 0.1)];
const C = scenario(prix), A = atrSerie(C);
t(Math.abs(A[18] - 2) < 0.01, 'ATR des bougies de scénario ≈ 2');
const ligne = creer('horizontale', { actif: 'OR', unite: 'H1', p: 100, cree: 0, alerte: true });
const r = surveillerObjet(C, A, ligne, H);
const types = r.ev.map(e => e.type);
t(types.includes('approche') && types.includes('touche'), 'ligne : approche puis touche', types.join());
t(r.fleches.length >= 1 && r.fleches[0].sens === 'hausse' && r.ev.find(e => e.type === 'rebond').cote === 'support', 'ligne : rebond confirmé = flèche verte sur support');
t(r.croix.length >= 1 && r.croix[0].sens === 'baisse', 'ligne : cassure confirmée = croix');
t(r.retourne === true || r.croix.length === 2, 'objet « retourné » après la cassure');
t(r.ev.some(e => e.type === 'alerte'), 'alerte de prix libre (« m’alerter »)');
t(r.ev.filter(e => e.type === 'rebond').length === r.fleches.length, 'une seule flèche par approche');
t(r.ev.every((e, i, L) => L.findIndex(x => x.id === e.id) === i), 'jamais deux événements identiques');
// rebond : posé à la clôture qui s'éloigne d'au moins 1 ATR, sans nouvel extrême
{ const f = r.fleches[0], i = C.findIndex(b => b.t === f.t); t(C[i].c >= 100 + 1 * A[i - 1] - 1e-9, 'flèche posée à une clôture ≥ 1 ATR du bon côté'); }
// zone, tendance, rayon : mêmes événements sur des objets équivalents
const zone = creer('zone', { actif: 'OR', unite: 'H1', bas: 99.5, haut: 100, t1: 0, cree: 0 });
const tend = creer('tendance', { actif: 'OR', unite: 'H1', t1: 0, p1: 100, t2: 10 * H, p2: 100, cree: 0 });
const ray = creer('rayon', { actif: 'OR', unite: 'H1', t1: 0, p1: 100, t2: 10 * H, p2: 100, cree: 0 });
for (const [o, nom] of [[zone, 'zone'], [tend, 'tendance'], [ray, 'rayon']]) { const x = surveillerObjet(C, A, o, H), ty = x.ev.map(e => e.type); t(ty.includes('approche') && ty.includes('touche') && ty.includes('rebond') && ty.includes('cassure'), `${nom} : approche, touche, rebond, cassure`, ty.join()); }
{ const verticale = creer('verticale', { t1: 5 * H, cree: 0 }), texte = creer('texte', { t1: 5 * H, p1: 100, texte: 'note', cree: 0 }); t(surveiller(C, [verticale, texte], H).ev.length === 0, 'ligne verticale et texte : jamais surveillés'); }
// surveillance seulement après la création
{ const tard = creer('horizontale', { actif: 'OR', unite: 'H1', p: 100, cree: 30 * H }); t(surveillerObjet(C, A, tard, H).ev.every(e => e.t + H > 30 * H), 'surveillé seulement à partir de sa création'); }

/* ── AUCUN REPEINT : rejeu bougie par bougie ── */
{ const objets = [ligne, zone, tend, ray], complet = surveiller(C, objets, H), vus = new Map(), flechesVues = new Map(); let stable = true;
  for (let n = 2; n <= C.length; n++) {
    const p = surveiller(C.slice(0, n), objets, H);
    for (const e of p.ev) { if (vus.has(e.id) && JSON.stringify(vus.get(e.id)) !== JSON.stringify(e)) stable = false; vus.set(e.id, e); }
    for (const f of p.fleches) { const k = f.objet + '|' + f.t; if (flechesVues.has(k) && flechesVues.get(k) !== f.prix) stable = false; flechesVues.set(k, f.prix); }
    for (const [k] of flechesVues) if (!p.fleches.some(f => f.objet + '|' + f.t === k)) stable = false;   // une flèche apparue ne disparaît jamais
  }
  t(stable, 'rejeu bougie par bougie : aucune flèche, croix ni événement déplacé ou effacé');
  t(vus.size === complet.ev.length && complet.ev.every(e => vus.has(e.id)), 'rejeu = calcul d’un coup (mêmes événements)');
  t(JSON.stringify(complet.fleches.map(f => [f.objet, f.t])) === JSON.stringify(surveiller(C, objets, H).fleches.map(f => [f.objet, f.t])), 'résultat déterministe'); }
// la bougie en cours n'est jamais utilisée
{ const L = closes(C, H, C[C.length - 1].t + H / 2); t(L.length === C.length - 1, 'bougie en cours exclue'); }

/* ── registre : excursions, bilan ── */
{ const ev = r.ev.find(e => e.type === 'rebond'), x = excursion(C, ev); t(x && x.favAtr > 0 && x.sens === 'hausse', 'excursion favorable / défavorable sur 48 bougies');
  const fin = { ...ev, id: 'fin', t: C[C.length - 10].t }; t(excursion(C, fin) === null, 'excursion inconnue tant que 48 bougies ne sont pas closes');
  const b = bilanRegistre(r.ev, [x]); t(b.length && b.every(l => !l.assez), 'bilan : « pas assez de données » sous 30 événements');
  const evs = Array.from({ length: 30 }, (_, k) => ({ id: 'e' + k, outil: 'horizontale', type: 'rebond' })), sv = evs.map((e, k) => ({ id: e.id, favAtr: k, advAtr: 1, favPct: 1, advPct: 1 }));
  const b2 = bilanRegistre(evs, sv); t(b2[0].assez && b2[0].favAtr === 14.5, 'bilan : médianes à partir de 30 événements mesurés'); }
{ const s = await ouvrirStockage({ idb: null }); t(!s.persistant, 'sans IndexedDB : mémoire (dit à l’interface)');
  t(await s.ajouter('registre', { id: 'a', v: 1 }) === true && await s.ajouter('registre', { id: 'a', v: 2 }) === false && (await s.lire('registre', 'a')).v === 1, 'registre en AJOUT SEUL : jamais remplacé');
  let e = null; try { await s.ecrire('registre', { id: 'a' }); } catch (x) { e = x; } t(!!e, 'registre : écriture directe refusée');
  e = null; try { await s.supprimer('suivis', 'a'); } catch (x) { e = x; } t(!!e, 'suivis : suppression refusée');
  await s.ecrire('objets', [1, 2], 'OR'); t((await s.lire('objets', 'OR')).length === 2, 'objets par actif'); }

/* ── zones de réaction ── */
{ // marché qui oscille entre 100 et 110, beaucoup de volume vers 100 et 110
  const L = Array.from({ length: 520 }, (_, i) => { const c = 105 + 5 * Math.sin(i / 9); return { t: i * H, o: c, h: c + 0.8, l: c - 0.8, c, v: Math.abs(Math.sin(i / 9)) > 0.9 ? 100 : 5 }; });
  const Z = zonesReaction(L, { ms: H });
  t(Z.length >= 2 && Z.length <= REGLES_TERMINAL.zonesMax, 'zones de réaction proposées (4 au plus)', Z.length);
  t(Z.every(z => Number.isInteger(z.tests) && Number.isInteger(z.tenues) && z.tenues <= z.tests && !('pourcentage' in z)), 'statistiques réelles « testée N fois, a tenu M », jamais un pourcentage');
  t(Z.some(z => z.p > 107) && Z.some(z => z.p < 103), 'zones aux bords du range (là où le volume s’est échangé)');
  t(zonesReaction(L.slice(0, 30)).length === 0, 'pas de zone sur trop peu de bougies');
  t(zonesReaction(L.map(b => ({ ...b, bande: true }))).length === 0, 'jamais de zone sur la bande ancienne (sans volume)');
  const P = profilVolume(L.slice(-500)); t(P && Math.abs(P.vol.reduce((a, b) => a + b, 0) - L.slice(-500).reduce((a, b) => a + b.v, 0)) < 1e-6, 'profil de volume : tout le volume réparti'); }
{ const C2 = scenario([...plat(20), 110, 104, 101.5, { c: 103, l: 100.2, h: 103.5 }, 106, 110, 104, 101, { c: 99, l: 98.5, h: 101 }, 97, 96]); const A2 = atrSerie(C2), s = testsZone(C2, A2, 99.5, 100);
  t(s.tests === 2 && s.tenues === 1, 'zone : 2 tests, 1 a tenu (l’autre cassé)', JSON.stringify(s)); }

/* ── alertes : anti-doublon, délai, ancienneté ── */
{ const now = 100 * H, ev = { id: 'o|touche|' + 98 * H, objet: 'o', type: 'touche', t: 98 * H, tFin: 99 * H };
  t(admettre([], ev, { maintenant: now, ms: H }).ok, 'alerte récente admise');
  t(admettre([{ id: ev.id }], ev, { maintenant: now, ms: H }).raison === 'doublon', 'jamais deux alertes identiques');
  t(admettre([{ id: 'x', objet: 'o', type: 'touche', recu: now - 10 * 60e3 }], ev, { maintenant: now, ms: H }).raison === 'délai', 'même type, même objet : 30 min au moins');
  t(admettre([{ id: 'x', objet: 'o', type: 'touche', recu: now - 31 * 60e3 }], ev, { maintenant: now, ms: H }).ok, 'après 30 min : de nouveau admise');
  t(admettre([], { ...ev, tFin: 90 * H }, { maintenant: now, ms: H }).raison === 'ancien', 'événement survenu Rayle fermé : registre seulement, pas d’alerte');
  t(/rebond confirmé/.test(texteAlerte({ type: 'rebond', sens: 'hausse', unite: 'H1', niveau: 100, prix: 102 }, { nomActif: 'Or', nomObjet: 'S1' })) && /rebondit/.test(phraseAlerte({ type: 'rebond', sens: 'hausse', niveau: 100 }, { nomActif: 'Or' })), 'textes de l’alerte et de la voix');
  t(alerteActive({ alertes: { approche: false } }, 'approche') === false && alerteActive({ alertes: {} }, 'cassure') === true && alerteActive({ alerte: false }, 'alerte') === false, 'cases d’alerte par type'); }

console.log(`terminal phase B : ${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
