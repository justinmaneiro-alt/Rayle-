/* ═════════════ NARRATION DES RAPPORTS (v12, phase 4) — Rayle EXPLIQUE au lieu de réciter ═════════════
   Calcul PUR (testé) : transforme les mesures des rapports en phrases d'analyste qui parle à un trader.
   Règles (les mêmes que la consigne donnée à l'IA, voir core/intelligence/cerveau.js) :
   · dans l'ordre : ce qu'on VOIT, ce que ça VEUT DIRE, ce qu'il faut SURVEILLER ;
   · au plus un ou deux chiffres par étape, arrondis (« près de 3 550 », « environ 3 pour cent »), seulement s'ils sont utiles : tous les détails restent à l'écran (carte, détail) ;
   · phrases courtes et naturelles ; un terme technique est expliqué en quelques mots ;
   · rien d'inventé : chaque phrase part d'une mesure ; sans mesure, on le dit.
   Les chiffres du texte parlé sont comptés par `compterChiffres` (rapports-textes.mjs) et plafonnés par le test. */

const NB = /[  ]/g;
export const NOM_PARLE = Object.freeze({ or: "l'or", us100: 'le Nasdaq', us500: 'le S&P', btc: 'le Bitcoin', sol: 'Solana', dxy: 'le dollar', eurusd: "l'euro-dollar", petrole: 'le pétrole' });
export const NOM_CAP = Object.freeze({ or: "L'or", us100: 'Le Nasdaq', us500: 'Le S&P', btc: 'Le Bitcoin', sol: 'Solana', dxy: 'Le dollar', eurusd: "L'euro-dollar", petrole: 'Le pétrole' });
export const nomParle = id => NOM_PARLE[id] || id;
export const nomCap = id => NOM_CAP[id] || id;
const maj1 = t => String(t || '').replace(/^./, c => c.toUpperCase());
const min1 = t => String(t || '').replace(/^[A-ZÉÈÀ](?![A-Z0-9])/, c => c.toLowerCase());
const num = x => Number.isFinite(x);

/* ───── nombres : arrondis, jamais plus de trois chiffres significatifs ───── */
const frN = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }).replace(NB, ' ');
export function arrondi3(x) { if (!num(x) || x === 0) return x; const e = Math.floor(Math.log10(Math.abs(x))) - 2, m = Math.pow(10, e); return Math.round(x / m) * m; }
/* « près de 3 550 », « un peu plus de 3 550 » ou « environ 3 550 » (un seul nombre parlé) */
export function approx(x) {
  if (!num(x)) return '';
  const r = arrondi3(x), d = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(r || 1)))), txt = frN(r, d), ecart = r ? (x - r) / Math.abs(r) : 0;
  return (Math.abs(ecart) < 0.0005 ? 'environ ' : x < r ? 'près de ' : 'un peu plus de ') + txt;
}
/* « 3 620 environ » : un niveau de prix arrondi, dit après « sous » ou « au-dessus de » (un seul nombre parlé) */
export function nivE(x) { if (!num(x)) return ''; const r = arrondi3(x), d = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(r || 1)))); return frN(r, d) + ' environ'; }
/* « environ 3 pour cent » (un pourcentage lisible : un chiffre significatif si petit) */
export function pourcent(x) { if (!num(x)) return ''; const n = Math.abs(x), v = n >= 10 ? Math.round(n) : n >= 2 ? Math.round(n * 2) / 2 : Math.round(n * 10) / 10; return 'environ ' + frN(v, 1) + ' pour cent'; }
export const mot = n => ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'][n] ?? String(n);
/* texte sans aucun chiffre (ou rien) : sert aux titres d'actualité, aux raisons et aux phrases de risque venues d'ailleurs */
const PAREILS = [[/moyenne à 200 jours/gi, 'moyenne de long terme'], [/moyenne à 50 jours/gi, 'moyenne de moyen terme'], [/à (?:un à six|1[–-]6) mois/gi, 'à moyen terme']];
export const sansChiffres = t => { let s = String(t || '').trim(); for (const [re, r] of PAREILS) s = s.replace(re, r); return /\d/.test(s) ? '' : s; };
export const cleanTitre = t => sansChiffres(String(t || '').replace(/\s+/g, ' ')).slice(0, 110);

/* ───── dates : jamais de nombre, un repère humain ───── */
const parisJour = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const parisSemaine = t => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' }).format(new Date(t));
const parisHeure = t => +new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
/* « aujourd'hui en début d'après-midi », « demain matin », « jeudi après-midi » */
export function moment(t, maintenant) {
  if (!num(t)) return 'à une date inconnue'; const h = parisHeure(t), part = h < 11 ? 'dans la matinée' : h < 14 ? 'vers midi' : h < 17 ? 'dans l’après-midi' : h < 20 ? 'en fin d’après-midi' : 'en soirée';
  const j = parisJour(t), auj = parisJour(maintenant), dem = parisJour(maintenant + 86400e3);
  return (j === auj ? 'aujourd’hui' : j === dem ? 'demain' : parisSemaine(t)) + ' ' + part;
}
export function ilYa(iso, maintenant) {
  const t = typeof iso === 'number' ? iso : Date.parse(String(iso || '').replace(' UTC', 'Z').replace(' ', 'T')); if (!num(t)) return 'à une date inconnue'; const j = (maintenant - t) / 86400e3;
  return j < 2 ? 'hier' : j < 5 ? 'ces derniers jours' : j < 12 ? 'la semaine dernière' : j < 60 ? 'ces dernières semaines' : j < 180 ? 'il y a quelques mois' : j < 420 ? 'il y a environ un an' : 'il y a longtemps';
}

/* ───── mots de lecture ───── */
const SENS = { haussière: 'haussière', haussier: 'haussière', baissière: 'baissière', baissier: 'baissière', neutre: 'neutre' };
export const sens = s => SENS[String(s || '').toLowerCase()] || String(s || 'neutre');
const sensMasc = s => ({ haussière: 'haussier', baissière: 'baissier', neutre: 'neutre' }[sens(s)] || 'neutre');
export const ecartMot = pct => { const a = Math.abs(pct); return !num(a) ? '' : a < 1 ? 'juste' : a < 3 ? 'un peu' : a < 8 ? 'nettement' : 'très loin'; };
/* un niveau de la liste d'outils : « ton niveau tracé en H4 » reste tel quel, les autres gardent leur sigle (PDH, POC H4…) */
export const nomNiveau = n => String(n || 'ce niveau').replace(/\s+/g, ' ').replace(/^ton niveau tracé en (\S+)/i, 'ton niveau tracé en $1').replace(/\s*\(.*?\)\s*$/, '');

/* ═════════════════════ lecture des bougies ═════════════════════ */
const PRIO = ['pin-bas', 'pin-haut', 'avalement-haussier', 'avalement-baissier', 'marubozu', 'rejet-bas', 'rejet-haut', 'doji', 'outside', 'inside'];
const SENS_FIGURE = {
  'pin-bas': 'Longue mèche basse : les vendeurs ont été repoussés, plutôt favorable aux acheteurs.',
  'pin-haut': 'Longue mèche haute : les acheteurs ont été repoussés, plutôt favorable aux vendeurs.',
  'avalement-haussier': 'Elle avale la bougie baissière précédente : les acheteurs reprennent la main.',
  'avalement-baissier': 'Elle avale la bougie haussière précédente : les vendeurs reprennent la main.',
  marubozu: 'Corps plein, sans mèche : un seul camp domine.',
  'rejet-bas': 'Longue mèche basse : le prix a été repoussé vers le haut.',
  'rejet-haut': 'Longue mèche haute : le prix a été repoussé vers le bas.',
  doji: 'Ouverture et clôture identiques : le marché hésite.',
  outside: 'Elle dépasse la précédente des deux côtés : bataille entre les deux camps.',
  inside: 'Elle reste dans la précédente : le marché se comprime avant de repartir.'
};
/* un niveau dit simplement : « un de tes niveaux tracés » ou « le support PDL » */
const estTrace = n => /niveau tracé/i.test(String((n && n.nom) || n || ''));
const decrire = (n, prix) => (estTrace(n) ? 'un de tes niveaux tracés' : (n.prix <= prix ? 'le support ' : 'la résistance ') + nomNiveau(n.nom));
/* la dernière bougie : ce qu'on voit, puis ce que ça veut dire (aucun chiffre) */
export function bougie(L, nomU) {
  if (!L || !L.disponible) return 'Je n’arrive pas à lire les bougies ' + nomU + ' pour le moment.';
  const b = L.derniere, f = b.forme, fig = [...(b.figures || [])].sort((a, c) => PRIO.indexOf(a.id) - PRIO.indexOf(c.id))[0];
  const P = ['Dernière bougie ' + nomU + ' : ' + sens(f.sens) + (f.taille ? ', ' + f.taille : '') + (b.enCours ? ', pas encore terminée' : '') + '.'];
  if (fig && SENS_FIGURE[fig.id]) P.push(SENS_FIGURE[fig.id]);
  const c = (b.contexte || []).find(x => x.rejet) || (b.contexte || []).find(x => x.balayage) || (b.contexte || [])[0];
  if (c) P.push(c.balayage === 'haut' ? 'Elle a balayé les plus hauts récents puis est retombée : piège possible pour les acheteurs.' : c.balayage === 'bas' ? 'Elle a balayé les plus bas récents puis est remontée : piège possible pour les vendeurs.'
    : c.rejet ? (c.role === 'résistance' ? 'Elle a buté sur la résistance ' + nomNiveau(c.niveau) + '.' : 'Elle a rebondi sur le support ' + nomNiveau(c.niveau) + '.') : 'Elle touche ' + (estTrace(c.niveau) ? 'un de tes niveaux tracés' : nomNiveau(c.niveau)) + '.');
  if (b.volume && b.volume.lib === 'volume fort') P.push('Volume fort : l’intérêt est réel.'); else if (b.volume && b.volume.lib === 'volume faible') P.push('Volume faible : peu de conviction.');
  return P.join(' ');
}
/* où est le prix, et quel niveau surveiller (un seul chiffre : le niveau clé, arrondi). `court` : version d'une phrase pour les tours d'horizon */
export function position(pos, prix) {
  if (!pos || !pos.disponible) return { texte: 'Je ne peux pas situer le prix par rapport aux niveaux : données insuffisantes.', court: '', cle: null };
  if (pos.sur && pos.sur.length) { const n = pos.sur[0], sous = n.prix <= prix, d = decrire(n, prix); return { cle: n, texte: 'Le prix est juste sur ' + d + '. À surveiller : une clôture ' + (sous ? 'sous ' : 'au-dessus de ') + nivE(n.prix) + ' ouvrirait ' + (sous ? 'la baisse.' : 'la hausse.'), court: 'Il est sur ' + d + ' : une clôture ' + (sous ? 'sous ' : 'au-dessus de ') + nivE(n.prix) + ' ouvrirait ' + (sous ? 'la baisse.' : 'la hausse.') }; }
  if (pos.proche && pos.proche.length) { const n = pos.proche[0], d = decrire(n, prix); return { cle: n, texte: 'Le prix s’approche de ' + d + '. À surveiller : sa réaction vers ' + nivE(n.prix) + '.', court: 'Il s’approche de ' + d + ', vers ' + nivE(n.prix) + '.' }; }
  if (pos.dessus && pos.dessous) { const haut = Math.abs(pos.dessus.prix - prix) <= Math.abs(prix - pos.dessous.prix), proche = haut ? pos.dessus : pos.dessous; return { cle: proche, texte: 'Le prix est entre ' + decrire(pos.dessous, prix) + ' et ' + decrire(pos.dessus, prix) + '. À surveiller : la sortie de cette zone, d’abord par ' + (haut ? 'le haut' : 'le bas') + ', vers ' + nivE(proche.prix) + '.', court: 'Il est entre deux niveaux ; le plus proche est ' + (haut ? 'au-dessus' : 'dessous') + ', vers ' + nivE(proche.prix) + '.' }; }
  const n = pos.dessus || pos.dessous; return n ? { cle: n, texte: 'Le prix est loin de tout niveau connu. Le prochain à surveiller : ' + decrire(n, prix) + ', vers ' + nivE(n.prix) + '.', court: 'Aucun niveau proche.' } : { texte: 'Je ne vois aucun niveau connu autour du prix.', court: '', cle: null };
}
const STRUCTURE = [[/plus hauts et plus bas hauts/i, 'les sommets et les creux montent'], [/plus bas et plus hauts bas|plus bas et plus bas hauts/i, 'les sommets et les creux baissent']];
export const structureMot = lecture => { for (const [re, t] of STRUCTURE) if (re.test(String(lecture || ''))) return t; return ''; };

/* ═════════════════════ contexte global ═════════════════════ */
const CLIMAT = { 'risk-on': 'plutôt porteur', 'risk-off': 'plutôt prudent', mitigé: 'indécis, sans direction claire' };
const EFFET_DOLLAR_PESE = new Set(['or', 'us100', 'us500', 'btc', 'sol', 'petrole']);
export function contexte({ id, climat, dxy, us, t10, reel, titre, actuExiste, ann, maintenant }) {
  const N = nomParle(id), T = {}, cle = Object.keys(CLIMAT).find(k => String(climat || '').startsWith(k));
  T.climat = cle ? 'Le climat général est ' + CLIMAT[cle] + '.' : null;
  if (dxy && dxy.couleur && dxy.couleur !== 'indisponible') {
    const hausse = dxy.couleur === 'haussier', baisse = dxy.couleur === 'baissier';
    T.dollar = 'Le dollar ' + (hausse ? 'se renforce' : baisse ? 'recule' : 'est sans direction nette') + (id === 'dxy' ? '.' : hausse ? (id === 'eurusd' ? ', ce qui pèse sur l’euro.' : EFFET_DOLLAR_PESE.has(id) ? ', ce qui pèse souvent sur ' + N + '.' : '.') : baisse ? (id === 'eurusd' ? ', ce qui aide l’euro.' : EFFET_DOLLAR_PESE.has(id) ? ', ce qui aide plutôt ' + N + '.' : '.') : '.');
  } else T.dollar = null;
  if (us && us.length) { const c = us.map(x => x.couleur); T.actions = c.every(x => x === c[0]) ? 'Les actions américaines sont ' + (c[0] === 'haussier' ? 'bien orientées' : c[0] === 'baissier' ? 'mal orientées' : 'hésitantes') + '.' : 'Les actions américaines se contredisent.'; } else T.actions = null;
  if (t10 != null && num(t10)) T.taux = 'Les taux américains à dix ans tournent autour de ' + frN(Math.round(t10 * 10) / 10, 1) + ' pour cent' + (num(reel) ? (reel >= 1.5 ? ', taux réels élevés : un frein pour l’or, qui ne rapporte aucun intérêt.' : reel <= 0.5 ? ', taux réels bas : plutôt un soutien.' : '.') : '.');
  else T.taux = 'Je ne lis pas les taux américains pour le moment.';
  T.actu = titre ? 'À la une : « ' + titre + ' ».' : actuExiste ? 'Des articles récents parlent de ' + N + '.' : 'Aucune actualité récente ne cite ' + N + '.';
  if (ann && ann.length) {
    const a = ann[0], p = parseFloat(String(a.prevu || '').replace(',', '.')), q = parseFloat(String(a.precedent || '').replace(',', '.'));
    const attente = num(p) && num(q) ? (p > q ? ' On attend un chiffre plus élevé que le précédent.' : p < q ? ' On attend un chiffre plus bas que le précédent.' : ' On attend un chiffre identique au précédent.') : '';
    T.annonces = 'À surveiller : ' + cleanTitre(a.titre) + ', ' + moment(a.t, maintenant) + (ann[1] ? ', puis ' + cleanTitre(ann[1].titre) : '') + '.' + attente;
  } else T.annonces = 'Aucune annonce forte à venir pour ' + N + '.';
  return T;
}

/* ═════════════════════ tendance, MA200, flèches ═════════════════════ */
export function tendanceUnite({ nomU, tendance, regime, structure }) {
  const st = structureMot(structure && structure.lecture), range = regime && /range/i.test(regime.type || '');
  return 'En ' + nomU + ', la tendance est ' + sens(tendance) + (st ? ' : ' + st : '') + (range ? ', mais le marché est en range : il hésite' : '') + '.';
}
export function maUnite({ nomU, position, ecartPct, nomMa = 'MA200' }) {
  const nm = [nomMa, nomU].filter(Boolean).join(' ');
  if (!position) return 'La ' + nm + ' n’est pas calculable : il manque de l’historique.';
  const dessus = position === 'au-dessus', mot_ = ecartMot(ecartPct);
  return 'Le prix est ' + (mot_ === 'juste' ? 'juste ' : mot_ === 'un peu' ? 'un peu ' : mot_ === 'nettement' ? 'nettement ' : mot_ === 'très loin' ? 'très loin ' : '') + (dessus ? 'au-dessus de la ' : 'sous la ') + nm + ' : tendance de fond ' + (dessus ? 'haussière.' : 'baissière.');
}
export function flechesH4({ fl, N, taux, n, maintenant }) {
  if (!fl || !fl.length) return 'Aucun signal récent en H4.';
  const f = fl[0], haus = /achat|hauss/i.test(f.sens || ''), q = ilYa(f.date, maintenant);
  return 'Un signal ' + (haus ? 'haussier' : 'baissier') + ', « ' + String(f.type || '') + ' », est apparu ' + q + '. ' + (taux != null && num(taux) && n >= 30 ? 'Sur ' + N + ', il a réussi environ ' + Math.round(taux * 100) + ' fois sur cent : ' + (taux >= 0.55 ? 'un point en sa faveur.' : taux >= 0.45 ? 'une pièce, pas une preuve.' : 'à ne pas suivre à l’aveugle.') : 'Pas assez d’historique pour juger sa fiabilité.');
}

/* ═════════════════════ volume ═════════════════════ */
export function volumeProfil({ N, px, v }) {
  const place = px > v.vah ? 'au-dessus' : px < v.val ? 'sous' : 'dans';
  const P = [place === 'au-dessus' ? 'Le prix est au-dessus de la zone de valeur, là où se fait l’essentiel des échanges : les acheteurs ont la main, mais le prix est « cher ».'
    : place === 'sous' ? 'Le prix est sous la zone de valeur, là où se fait l’essentiel des échanges : les vendeurs ont la main, mais le prix est « bon marché ».'
      : 'Le prix est dans la zone de valeur, là où se fait l’essentiel des échanges : le marché est équilibré.'];
  const d = (v.pocH4 / px - 1) * 100;
  P.push(Math.abs(d) < 0.3 ? 'Le prix le plus échangé est tout près.' : 'Le prix le plus échangé est ' + (d > 0 ? 'au-dessus' : 'juste dessous') + ', à ' + pourcent(d) + '.');
  return P.join(' ');
}
export function volumeNus({ nus, px }) {
  if (!nus || !nus.length) return 'Aucun niveau de volume non revisité à proximité.';
  const n = nus[0], d = (n.prix / px - 1) * 100;
  return (nus.length > 1 ? mot(nus.length) + ' niveaux de volume restent non revisités' : 'Un niveau de volume reste non revisité') + ' : le prix y revient souvent. Le plus proche est ' + (d > 0 ? 'au-dessus' : 'dessous') + ', à ' + pourcent(d) + '.';
}
export function volumeFlux({ vv }) {
  if (!vv || vv.indisponible) return 'Volume et flux acheteur-vendeur indisponibles pour cet actif.';
  const r = vv.volumeRelatifDerniereBougie, fort = num(r) && r >= 1.5, faible = num(r) && r <= 0.7, cvd = vv.cvdTendance;
  return 'Volume ' + (fort ? 'fort : il y a de la conviction' : faible ? 'faible : peu de conviction' : 'normal') + ' ; le flux net est ' + (cvd === 'en hausse' ? 'en hausse : les acheteurs dominent' : cvd === 'en baisse' ? 'en baisse : les vendeurs dominent' : 'sans direction') + (vv.deltaEstime ? ' (estimé).' : '.');
}
/* carnet et footprint en direct : lecture qualitative (jamais la liste des paliers) */
export function carnetDirect({ tv, lt, N }) {
  if (!tv || !lt) return 'Carnet d’ordres et footprint : lisibles seulement en connexion directe, pas de lecture pour ' + N + ' pour le moment.';
  const murs = tv.murs && tv.murs.length;
  return 'En direct, ' + (murs ? (tv.murs.length > 1 ? 'plusieurs gros ordres sont posés dans le carnet : ils peuvent servir de support ou de résistance tant qu’ils ne sont pas retirés.' : 'un gros ordre est posé dans le carnet : il peut servir de support ou de résistance tant qu’il n’est pas retiré.') : 'aucun gros ordre ne se détache dans le carnet.') + (tv.deltaReel ? ' Flux mesuré.' : ' Flux estimé.');
}

/* ═════════════════════ COT (dans le rapport complet) ═════════════════════ */
export function cotCourt({ N, a }) {
  const dd = a.dernier, ach = dd.spec > 0, up = dd.varSpec > 0, nul = dd.varSpec === 0;
  const lecture = nul ? 'Ils n’ont pas bougé cette semaine.' : ach ? (up ? 'Ils ont renforcé leurs achats cette semaine.' : 'Mais ils ont allégé cette semaine : l’élan s’essouffle.') : (up ? 'Mais ils ont commencé à racheter cette semaine : souvent un début de retournement.' : 'Ils ont renforcé leurs ventes cette semaine.');
  const ext = dd.extremeSpec === 'haut' ? ' Leur position est extrême côté achat : souvent une hausse qui s’essouffle.' : dd.extremeSpec === 'bas' ? ' Leur position est extrême côté vente : un rebond violent est possible.' : ' Rien d’extrême.';
  return 'Les gros fonds sont plutôt ' + (ach ? 'acheteurs' : 'vendeurs') + ' sur ' + N + '. ' + lecture + ext + ' Détail : rapport COT.';
}

/* ═════════════════════ valorisation ═════════════════════ */
export function valorisation({ N, H }) {
  const noms = ['court terme', 'moyen terme', 'long terme'], P = (H || []).slice(0, 3).map((h, i) => (noms[i] || '') + ' ' + (h.verdict || 'sans avis'));
  const rs = ((H[1] || H[0] || {}).raisons || []).map(sansChiffres).filter(Boolean).slice(0, 2);
  return { verdict: 'Mes actifs sur ' + N + ' : ' + P.join(', ') + '.', raisons: rs.length ? 'Ce qui pèse le plus : ' + rs.join(', et ') + '.' : null };
}

/* ═════════════════════ scénarios ═════════════════════ */
const nomDeclencheur = s => { const m = /\(([^()]+(?:\([^()]*\))?[^()]*)\)\s*$/.exec(String(s || '')); return m ? m[1] : 'ce niveau'; };
export function confianceNarr(sc) {
  const F = sc.facteurs || [], sensP = sc.principal.sens, mots = F.map(f => ({ nom: f[0], v: f[1] }));
  if (!sensP) return 'les unités de temps se contredisent';
  const jol = x => x.replace('prix par rapport à la MA200 Daily', 'la MA200'), pour = mots.filter(x => x.v === sensP).map(x => jol(x.nom)), contre = mots.filter(x => x.v === -sensP).map(x => jol(x.nom));
  const liste = L => L.length > 1 ? L.slice(0, -1).join(', ') + ' et ' + L[L.length - 1] : L[0];
  return liste(pour) + ' vont dans le même sens' + (contre.length ? ', mais ' + liste(contre) + (contre.length > 1 ? ' vont' : ' va') + ' à contre-courant' : '');
}
export function scenarioPrincipal({ sc, d }) {
  const p = sc.principal, decl = (p.annotations || []).find(x => /déclencheur/.test(x.texte || '')), nomD = nomNiveau(nomDeclencheur(p.declencheur)), obj = p.objectifs && p.objectifs[0];
  const niveauC = { fort: 'forte', moyen: 'moyenne', faible: 'faible' }[p.confiance.niveau] || p.confiance.niveau;
  if (!p.sens) return 'Scénario principal : le prix reste dans un range ; on surveille un rebond ou un rejet sur les bornes. Une clôture H4 hors de la zone le remettrait en cause. Confiance ' + niveauC + ' : ' + confianceNarr(sc) + '.';
  const haus = p.sens > 0;
  return 'Scénario principal : ' + (haus ? 'haussier' : 'baissier') + ', s’il clôture en H4 ' + (haus ? 'au-dessus de ' : 'sous ') + nomD + (decl ? ', ' + nivE(decl.prix) : '') + (obj ? ', avec pour objectif ' + nomNiveau(obj.nom) : '') + '. Il serait invalidé ' + (haus ? 'sous ' : 'au-dessus de ') + (p.invalidation ? nivE(p.invalidation.prix) : 'son niveau d’invalidation') + '. Confiance ' + niveauC + ' : ' + confianceNarr(sc) + '.';
}
export function scenarioAlternatif({ sc }) {
  const a = sc.alternatif, nomD = nomNiveau(nomDeclencheur(a.declencheur));
  if (!sc.principal.sens) return 'Alternative : une sortie du range, puis un retest du niveau cassé. Conditions à surveiller, pas des ordres : c’est toi qui décides.';
  return 'Scénario inverse : une clôture H4 ' + (a.sens > 0 ? 'au-dessus de ' : 'sous ') + nomD + '. Conditions à surveiller, pas des ordres : c’est toi qui décides.';
}

/* ═════════════════════ vigilance et risque ═════════════════════ */
export function vigilance({ N, ev, devises, maintenant }) {
  return ev && ev.length ? 'À surveiller : ' + cleanTitre(ev[0].titre) + ', ' + moment(ev[0].t, maintenant) + (ev[1] ? ', puis ' + cleanTitre(ev[1].titre) : '') + ', des annonces qui peuvent bouger ' + N + ' d’un coup.' : 'Aucune annonce forte à venir côté ' + devises.join(' et ') + '.';
}
export function volatilite({ atrPct, regime }) {
  if (atrPct == null) return 'Volatilité non mesurable pour le moment.';
  const v = regime && regime.volatilite ? regime.volatilite : '';
  return 'Le prix bouge en moyenne d’' + pourcent(atrPct) + ' par jour' + (/basse|faible/.test(v) ? ' : c’est calme.' : /haute|forte|élev/.test(v) ? ' : c’est agité, prévoir des stops plus larges et des positions plus petites.' : ' : volatilité normale.');
}
const lieA = o => { const N = nomParle(o); return N.startsWith('le ') ? 'au ' + N.slice(3) : N.startsWith('l’') || N.startsWith("l'") ? 'à l’' + N.slice(2) : 'à ' + N; };
export function correlations({ N, cors }) {
  if (!cors || !cors.length) return 'Corrélations non mesurables pour le moment.';
  const dit = ({ o, r }) => (r < 0 ? 'à l’inverse ' + (nomParle(o).startsWith('le ') ? 'du ' + nomParle(o).slice(3) : 'de ' + nomParle(o)) : (Math.abs(r) >= 0.6 ? 'étroitement lié ' : Math.abs(r) >= 0.3 ? 'plutôt lié ' : 'peu lié ') + lieA(o));
  const D = cors.map(dit), commun = D.length === 2 && D[0].split(' ')[0] === D[1].split(' ')[0] && !/inverse/.test(D[0]) ? D[0].split(' ').slice(0, 2).join(' ') : null, texteC = commun ? commun + ' ' + cors.map(x => lieA(x.o)).join(' et ') : D.join(' et ');
  return maj1(N) + ' est ' + texteC + ' sur trois mois' + (cors.some(x => Math.abs(x.r) >= 0.6) ? ' : à garder en tête avant de cumuler les positions.' : '.');
}
export function risquePerso(r) {
  const t = String((r && (r.risque || r.portefeuille)) || '');
  if (!t) return 'Ton risque engagé n’est pas lisible : l’historique XTB n’est pas importé.';
  if (/sous ta limite/i.test(t)) return 'Ton risque engagé reste sous ta limite du jour.';
  if (/dépass|au-dessus de ta limite|au dessus de ta limite/i.test(t)) return 'Attention : ton risque engagé dépasse ta limite du jour.';
  return 'Le détail de ton risque est dans la fenêtre Portefeuille.';
}

/* ═════════════════════ rapport COT ═════════════════════ */
export function cotPositions({ N, a }) {
  const dd = a.dernier, ach = dd.spec > 0, up = dd.varSpec > 0, nul = dd.varSpec === 0;
  return ['Rapport COT sur ' + N + ' : les positions de mardi, publiées vendredi.',
    'Les gros fonds, qui suivent les tendances, sont plutôt ' + (ach ? 'acheteurs' : 'vendeurs') + '. ' + (nul ? 'Ils n’ont pas bougé cette semaine.' : ach ? (up ? 'Ils ont encore renforcé leurs achats cette semaine : le pari haussier se durcit.' : 'Mais ils ont allégé cette semaine : l’élan s’essouffle.') : (up ? 'Mais ils ont commencé à racheter cette semaine : c’est souvent un début de retournement.' : 'Ils ont encore renforcé leurs ventes cette semaine : le pari baissier se durcit.')),
    'Les commerciaux, qui se couvrent, font l’inverse : c’est normal.',
    'Les petits spéculateurs ne sont pas dans ma source.'];
}
export function cotIndice({ a, p52 }) {
  const dd = a.dernier, e = dd.extremeSpec;
  const extreme = e === 'haut' ? 'Leur position est extrême côté achat : rarement aussi chargée. Quand tout le monde est déjà acheteur, il reste peu d’acheteurs pour pousser plus haut.' : e === 'bas' ? 'Leur position est extrême côté vente : rarement aussi chargée. Quand tout le monde est déjà vendeur, il reste peu de vendeurs pour pousser plus bas.' : 'Leur position n’a rien d’extrême : ni trop acheteurs, ni trop vendeurs.';
  const percentile = p52 != null ? 'Elle est plus chargée que dans ' + pourcent(p52) + ' des semaines de l’an dernier' + (p52 >= 80 ? ' : c’est haut.' : p52 <= 20 ? ' : c’est bas.' : '.') : null;
  const comm = dd.indexComm != null ? (dd.extremeComm ? 'Les commerciaux sont à un extrême ' + (dd.extremeComm === 'haut' ? 'acheteur' : 'vendeur') + '.' : 'Rien d’extrême non plus côté commerciaux.') : null;
  return { extreme, percentile, comm };
}
export function cotOi({ tend, v13 }) {
  return ['L’intérêt ouvert, le nombre de contrats en cours, est ' + (tend === 'indéterminée' ? 'impossible à situer faute d’historique.' : tend + ' sur trois mois.'),
    v13 == null ? 'L’historique est trop court pour conclure.' : v13 > 0 ? 'De l’argent frais entre : la tendance en cours est plutôt soutenue.' : 'Des positions se ferment : la tendance perd du carburant.'];
}
export function cotDivergence({ N, dp, ds, nomSpec, diverge, dir, ds_ }) {
  return ['Sur deux mois, le prix ' + (dir > 0 ? 'monte d’' + pourcent(dp) : dir < 0 ? 'baisse d’' + pourcent(dp) : 'ne bouge presque pas') + ', alors que les fonds ' + (ds > 0 ? 'ont ajouté des achats' : 'ont réduit leurs achats') + '.',
    diverge ? 'C’est une divergence : ' + (dir > 0 ? 'la hausse manque de soutien des gros acteurs. À surveiller : si le prix cède, ce manque se verra vite.' : 'la baisse est contestée par les gros acteurs.') : dir === 0 ? 'Pas de divergence mesurable.' : 'Pas de divergence : le prix et les fonds vont dans le même sens, ce qui confirme le mouvement.'];
}
const moyenne = L => (L.length ? L.reduce((s, x) => s + x, 0) / L.length : null);
export function cotHistorique({ hauts, bas, avecPrix, maintenant }) {
  const mh = moyenne(hauts.filter(e => e.apres != null).map(e => e.apres)), mb = moyenne(bas.filter(e => e.apres != null).map(e => e.apres)), S = [];
  if (!hauts.length && !bas.length) return ['Sur tout l’historique que je lis, ce marché n’a jamais atteint d’extrême : rien à comparer.'];
  if (hauts.length) S.push('La dernière fois qu’ils étaient aussi acheteurs, c’était ' + ilYa(hauts[hauts.length - 1].date + 'T00:00:00Z', maintenant) + '.' + (mh != null ? ' Huit semaines plus tard, le prix avait en moyenne ' + (mh >= 0 ? 'gagné ' : 'perdu ') + pourcent(mh) + '.' : ''));
  if (bas.length) S.push('La dernière fois qu’ils étaient aussi vendeurs, c’était ' + ilYa(bas[bas.length - 1].date + 'T00:00:00Z', maintenant) + '.' + (mb != null ? ' Huit semaines plus tard, le prix avait en moyenne ' + (mb >= 0 ? 'gagné ' : 'perdu ') + pourcent(mb) + '.' : ''));
  S.push(avecPrix ? 'Petit échantillon : une indication, pas une règle.' : 'Je n’ai pas le prix de l’époque : je ne peux pas dire ce qui a suivi.');
  return S;
}
export function cotConclusion({ ext }) {
  return ['En résumé : ' + (ext === 'haut' ? 'les fonds sont très acheteurs, le carburant d’une hausse se raréfie et un retournement serait plus brutal. À surveiller, sans en faire un signal de vente.' : ext === 'bas' ? 'les fonds sont très vendeurs, un rebond violent est possible s’ils rachètent. À surveiller, sans en faire un signal d’achat.' : 'le positionnement ne donne pas d’indication marquée : il nuance les graphiques, il ne décide pas à leur place.'),
    'Limite : le COT est lent et daté de mardi, il ne dit rien du moment précis. C’est toi qui décides.'];
}

/* ═════════════════════ marché global ═════════════════════ */
export function climatGlobal(lecture) {
  const cle = Object.keys(CLIMAT).find(k => String(lecture || '').startsWith(k));
  return 'Le climat général est ' + (cle ? CLIMAT[cle] : 'difficile à lire') + '. Je fais le tour de huit actifs : l’or, le Nasdaq, le S&P, le Bitcoin, Solana, le pétrole, l’euro-dollar et le dollar. Puis je regarde de plus près les deux qui ressortent le plus.';
}
export function actifGlobal({ id, x, pl, prix }) {
  const N = nomCap(id), dj = (/Daily (haussi\w+|baissi\w+|neutre)/.exec(x.phrase || '') || [])[1], h4 = (/H4 (haussi\w+|baissi\w+|neutre)/.exec(x.phrase || '') || [])[1];
  const mj = dj ? sensMasc(dj) : x.couleur, mh = h4 ? sensMasc(h4) : null;
  let t = N + ' : ' + (mj === 'neutre' && (!mh || mh === 'neutre') ? 'pas de direction nette.' : 'fond ' + mj + (mh && mh === mj ? ', court terme dans le même sens.' : mh && mh !== 'neutre' && mh !== mj ? ', mais court terme ' + mh + ' : ' + (mj === 'haussier' ? 'une correction dans une hausse.' : 'un rebond dans une baisse.') : mh === 'neutre' ? ', court terme hésitant.' : '.'));
  const v = x.variationJourPct; if (num(v) && Math.abs(v) >= 0.5) t += ' Sur la séance, ' + (v > 0 ? 'il monte' : 'il baisse') + ' d’' + pourcent(v) + '.';
  if (pl && pl.disponible) { const c = position(pl, prix).court; if (c) t += ' ' + c; } return t;
}
export function introTop({ k, t }) {
  const raison = /alignés/.test(t.pourquoi || '') ? 'Daily et H4 vont dans le même sens : c’est le plus lisible.' : sansChiffres(t.pourquoi) || '';
  return ('Numéro ' + mot(k + 1) + ' du moment : ' + String(t.nom || '').replace(/ 100$/, '').replace(/ 500$/, '') + '. ' + raison).trim();
}

/* ═════════════════════ macro et calendrier ═════════════════════ */
export function macroSemaine({ nbAvenir, parJour }) {
  const S = [nbAvenir ? 'Cette semaine, ' + (nbAvenir > 1 ? mot(nbAvenir) + ' annonces fortes restent à venir' : 'une annonce forte reste à venir') + '. Ce sont des rendez-vous où le prix peut bouger vite : mieux vaut les connaître avant d’ouvrir une position.' : 'Il ne reste aucune annonce forte à venir cette semaine : le calendrier est calme.'];
  for (const [j, L] of Object.entries(parJour).slice(0, 4)) S.push(maj1(j) + ' : ' + L.slice(0, 3).map(e => cleanTitre(e.titre)).join(', ') + '.');
  return S;
}
export function macroAnnonce({ ev, concernes, mecan, meas, maintenant }) {
  const p = parseFloat(String(ev.prevu || '').replace(',', '.')), q = parseFloat(String(ev.precedent || '').replace(',', '.'));
  const attente = num(p) && num(q) ? (p > q ? 'Le marché attend un chiffre plus élevé que le précédent.' : p < q ? 'Le marché attend un chiffre plus bas que le précédent.' : 'Le marché attend un chiffre identique au précédent.') : 'Le consensus n’est pas publié.';
  const court = t => { const m = String(t).split(/[:;]/)[0].trim(), base = m.length > 40 ? m : String(t); return base.length > 190 ? base.slice(0, 190).replace(/,[^,]*$/, '') : base; };   // la première idée seulement : le détail est dans la carte
  const mm = (mecan || []).map(x => ({ a: x.a, t: court(sansChiffres(min1(x.e.regles[0].texte))) })).filter(x => x.t);
  return {
    intro: cleanTitre(ev.titre) + ' (' + ev.pays + ') tombe ' + moment(ev.t, maintenant) + '. ' + attente + ' Ce qui compte, c’est l’écart entre le chiffre publié et cette attente.',
    concernes: concernes.length > 3 ? 'Cela touche presque tous les marchés, surtout l’or et le Nasdaq.' : 'Cela concerne surtout ' + (concernes.length ? concernes.map(nomParle).join(', ') : 'aucun actif que je suis en direct') + '.',
    mecanisme: mm.length ? 'Le mécanisme habituel : ' + mm.map(x => 'pour ' + nomParle(x.a) + ', ' + x.t.replace(/\.$/, '')).join(' ; ') + '. Ce n’est pas une prévision.' : null,
    mesure: meas && meas.length ? 'La dernière fois, deux heures après la même annonce, ' + meas.slice(0, 2).map(m => nomParle(m.a) + ' avait ' + (m.r >= 0 ? 'monté' : 'baissé') + ' d’' + pourcent(m.r)).join(' et ') + '. C’est un très petit échantillon.' : 'Je n’ai pas de réaction passée mesurable pour cette annonce : l’historique des annonces n’est pas conservé au-delà de la semaine.'
  };
}
