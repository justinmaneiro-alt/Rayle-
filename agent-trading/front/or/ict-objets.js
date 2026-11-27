/* ═════════════ OBJETS ICT NOMMÉS (pur, testé) : LA liste que dessinent le terminal et que lit Rayle (`lecture_ict`) ═════════════
   Source : ict-v2.js (une seule unité). Chaque objet porte un NOM COMPLET (pour la bulle et pour Rayle : `nom`), un NOM COURT de petit carré (`court`, 14 caractères au plus),
   sa couleur de carré (`style` : vert / rouge / blanc / gris), son unité, POURQUOI il est tracé et son statut. Rien d'anonyme.
   ICT ÉPURÉ : « Essentiel » = 8 objets au plus (+ le scénario) ; « Complet » = 20 objets visibles au plus (+ le scénario). Un prix = UNE seule ligne (deux niveaux à moins de 0,1 ATR sont fusionnés).
   Interprétation de l'ICT : une description, jamais un ordre. */
import { fenetresKillzones, jourMarche } from './ict-v1.js';
import { porteeLiquidite, listeCassures, etiquettesSwings, unicornBpr, gapsOuverture, fibonacci } from './ict-v2.js';
import { nomCarre } from './ict-carres.js';
import { scenariosIct } from './ict-scenarios.js';
import { zonesA, obDeCassure, choisirSommets, fusionnerZones } from './ict-complet.js';

export const MAX_ESSENTIEL = 8, MAX_COMPLET = 20, FENETRE_COMPLET = 150, FENETRE_REMPLIES = 50, FUSION_ATR = 0.1;
/* prix à UNE décimale (à partir de 100) : « 3 605,9 » */
export const px = x => (Number.isFinite(x) ? Number(x).toLocaleString('fr-FR', Math.abs(x) >= 100 ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 4 }).replace(/[  ]/g, ' ') : '—');
const hp = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const NOM_LIQ = { EQH: 'EQH', EQL: 'EQL', PDH: 'PDH', PDL: 'PDL', PWH: 'PWH', PWL: 'PWL', ASIE_H: 'Asie H', ASIE_B: 'Asie B', LDN_H: 'LDN H', LDN_B: 'LDN B', ITH: 'ITH', ITL: 'ITL', LTH: 'LTH', LTL: 'LTL' };
const FORTS = new Set(['PDH', 'PDL', 'PWH', 'PWL', 'EQH', 'EQL']);   // liquidité externe « classique » : trait plein blanc de 2,4 px
const EXPL = { EQH: 'deux sommets à moins de 0,1 ATR : des ordres stop s\'accumulent au-dessus', EQL: 'deux creux à moins de 0,1 ATR : des ordres stop s\'accumulent en dessous', PDH: 'plus haut de la veille', PDL: 'plus bas de la veille', PWH: 'plus haut de la semaine précédente', PWL: 'plus bas de la semaine précédente', ASIE_H: 'plus haut de la session asiatique', ASIE_B: 'plus bas de la session asiatique', LDN_H: 'plus haut de la session de Londres', LDN_B: 'plus bas de la session de Londres', ITH: 'sommet intermédiaire (un STH encadré par deux STH plus bas) encore intact', ITL: 'creux intermédiaire (un STL encadré par deux STL plus hauts) encore intact', LTH: 'sommet de long terme (un ITH encadré par deux ITH plus bas)', LTL: 'creux de long terme (un ITL encadré par deux ITL plus hauts)' };
const RANG = { PDH: 0, PDL: 0, PWH: 0, PWL: 0, EQH: 1, EQL: 1, ITH: 2, ITL: 2, LTH: 3, LTL: 3, ASIE_H: 4, ASIE_B: 4, LDN_H: 4, LDN_B: 4 };   // même niveau, plusieurs noms : on garde le plus parlant en tête
export const LEGENDE_ICT = Object.freeze([
  ['haut', 'carré vert : haussier (OB, FVG, BRK, BOS, MSS…)'], ['bas', 'carré rouge : baissier'], ['ligne', 'carré blanc : liquidité à prendre (EQH, PDL… + BSL / SSL)'],
  ['prise', 'contour gris : liquidité déjà prise (✕ jaune = sweep) ou Fibonacci'], ['struct', 'trait épais : niveau important ; trait fin : le reste'], ['fib', 'EQ 50 %, OTE, Premium, Discount : le Fibonacci du dealing range']]);

const sensTxt = d => (d > 0 ? 'haussier' : 'baissier');
function base(o) { return { unite: '', statut: '', pourquoi: [], detail: '', autres: [], ...o }; }
/* nom court d'une ligne de liquidité : « EQH · BSL » ; trop long → sans le côté, puis sans les noms en trop (14 caractères au plus) */
export function courtLigne(types, cote, prise) {
  const noms = [...new Set(types.map(t => NOM_LIQ[t] || t))]; let s = noms.join(' · ');
  if (!prise && cote) { const avec = `${s} · ${cote}`; if (avec.length <= 14) return avec; }
  while (s.length > 14 && noms.length > 1) { noms.pop(); s = noms.join(' · '); }
  return nomCarre(s);
}

export function objetsIct(an, { mode = 'essentiel', couches = null, prix = null, fenetre = null, scenarios = null } = {}) {
  if (!an || !an.ok) return { objets: [], pastilles: [], mode };
  const u = an.nom, n = an.bougies.length, B = an.bougies, A = an.A, complet = mode === 'complet', fen = complet && !!fenetre && Number.isFinite(fenetre.i0) && Number.isFinite(fenetre.i1), d0 = fen ? Math.max(0, Math.min(n - 2, Math.floor(fenetre.i0))) : Math.max(0, n - FENETRE_COMPLET), v1 = fen ? Math.max(d0 + 1, Math.min(n - 1, Math.ceil(fenetre.i1))) : n - 1, histo = fen && v1 < n - 3, px0 = histo ? B[v1].c : (Number.isFinite(prix) ? prix : an.prix), atr = an.atr || 1, dR = Math.max(0, n - FENETRE_REMPLIES), tV0 = B[d0].t, tV1 = B[v1].t;
  const on = k => !couches || couches[k] !== false, O = [], dist = o => (o.p != null ? Math.abs(o.p - px0) : o.bas != null ? (px0 >= o.bas && px0 <= o.haut ? 0 : Math.min(Math.abs(px0 - o.bas), Math.abs(px0 - o.haut))) : 1e9);
  const add = o => { const r = base({ unite: u, ...o }); O.push(r); return r; };
  const pd = an.premiumDiscount, tLast = B[n - 1].t;

  /* ── liquidité : lignes nommées ; deux niveaux à moins de 0,1 ATR = UNE ligne (carré combiné) ; prise = grise en pointillé avec ✕ ── */
  const lignes = []; let ext = { b: null, s: null };
  if (on('ictLiquidite')) {
    const LQ = [];
    const srcLiq = fen ? [...an.liquidites, ...an.niveaux.filter(x => !x.interne && (x.type === 'EQH' || x.type === 'EQL') && !an.liquidites.some(l => l.id === x.id))] : an.liquidites;
    for (const x of srcLiq) { if (x.iForm != null && x.iForm > v1) continue; const bal = !!x.balayee && (x.iSweep == null || x.iSweep <= v1); if (bal && x.iSweep != null && x.iSweep < d0) continue; LQ.push({ type: x.type, cote: x.cote, p: x.p, balayee: bal, typeBalayage: bal ? x.typeBalayage : null, tForm: x.tPremier || x.tForm, tSweep: bal ? x.tSweep : null, iSweep: bal ? x.iSweep : null }); }
    const ST = an.structure; for (const [L, type, cote] of [[ST.ITH, 'ITH', 'BSL'], [ST.ITL, 'ITL', 'SSL']]) { const x = [...L].reverse().find(y => y.i <= v1 && (!y.cassee || y.iCassure > v1)); if (x) LQ.push({ type, cote, p: x.p, balayee: false, tForm: x.t }); }
    if (complet || an.unite === 'J') for (const [L, type, cote] of [[ST.LTH, 'LTH', 'BSL'], [ST.LTL, 'LTL', 'SSL']]) { const x = [...L].reverse().find(y => y.i <= v1); if (x) LQ.push({ type, cote, p: x.p, balayee: false, tForm: x.t }); }
    LQ.sort((a, b) => (RANG[a.type] ?? 9) - (RANG[b.type] ?? 9) || a.p - b.p);
    const grp = [];   // fusion : un prix = une seule ligne
    for (const q of LQ) { const g = grp.find(c => c.rep.balayee === q.balayee && Math.abs(c.rep.p - q.p) < FUSION_ATR * atr); if (g) { g.types.push(q.type); g.membres.push(q); } else grp.push({ rep: q, types: [q.type], membres: [q] }); }
    for (const g of grp) { const q = g.rep; q.types = [...new Set(g.types)]; q.portee = g.membres.some(m => porteeLiquidite(an, m) === 'externe') ? 'externe' : 'interne'; q.dist = Math.abs(q.p - px0); }
    const L2 = grp.map(g => g.rep), vivants = L2.filter(q => !q.balayee), au = vivants.filter(q => q.cote === 'BSL' && q.p >= px0).sort((a, b) => a.p - b.p), sous = vivants.filter(q => q.cote === 'SSL' && q.p < px0).sort((a, b) => b.p - a.p);   // la BSL est au-dessus du prix, la SSL en dessous
    ext = { b: au.find(q => q.portee === 'externe') || au[0] || null, s: sous.find(q => q.portee === 'externe') || sous[0] || null };
    const prises = L2.filter(q => q.balayee).sort((a, b) => b.iSweep - a.iSweep), choisi = new Map();
    const pick = (q, p) => { if (q) choisi.set(q, Math.max(choisi.get(q) || 0, p)); };
    pick(ext.b, 92); pick(ext.s, 92); prises.slice(0, fen ? 4 : complet ? 2 : 1).forEach((q, k) => pick(q, k ? 82 : 86));
    if (fen) for (const q of vivants) if (q.types.some(t => /^EQ/.test(t))) pick(q, 66);
    if (complet) { for (const q of vivants) if (q.types.includes('PDH') || q.types.includes('PDL')) pick(q, 78); for (const q of [au.find(x => x.types.some(t => /^EQ/.test(t))), sous.find(x => x.types.some(t => /^EQ/.test(t)))]) pick(q, 77); }
    for (const [q, pr] of choisi) {
      const lib = q.types.map(t => NOM_LIQ[t] || t).join(' · '), bal = q.balayee, nom = `${q.cote} ${q.portee} · ${lib} ${px(q.p)}${bal ? ' (prise)' : ''}`, fort = q.portee === 'externe' || q.types.some(t => FORTS.has(t));
      const t0 = q.types[0];
      lignes.push(add({ id: `liq|${q.types.join('+')}|${q.p}|${q.tForm}`, famille: 'liquidite', kind: 'ligne', nom, court: courtLigne(q.types, q.cote, bal), style: bal ? 'gris' : 'blanc', p: q.p, tDebut: q.tForm, tFin: bal ? q.tSweep : null, etat: bal ? 'pris' : 'ouvert', epais: bal ? 'pris' : fort ? 'fort' : 'normal', cote: q.cote, prise: bal, portee: q.portee, types: q.types, prio: pr, dir: q.cote === 'BSL' ? -1 : 1,
        sweep: bal && q.iSweep != null ? { t: q.tSweep, p: q.cote === 'BSL' ? B[q.iSweep].h : B[q.iSweep].l, type: q.typeBalayage } : null,
        statut: bal ? (q.typeBalayage === 'sweep' ? 'prise (mèche au-delà puis clôture de retour)' : q.typeBalayage === 'cassure' ? 'prise (cassée en clôture)' : 'prise') : 'à prendre',
        detail: `${q.cote === 'BSL' ? 'liquidité acheteuse (stops au-dessus)' : 'liquidité vendeuse (stops en dessous)'} · ${q.portee}`,
        pourquoi: [...q.types.map(t => `${NOM_LIQ[t] || t} : ${EXPL[t] || 'niveau de liquidité'}`), `${q.portee === 'externe' ? 'externe : extrémité du dealing range de l\'unité ou au-delà' : 'interne : à l\'intérieur du dealing range de l\'unité'}`, q.tForm ? `formé le ${hp(q.tForm)} (heure de Paris)` : '', bal ? `prise le ${hp(q.tSweep)}` : 'pas encore prise : le prix est attiré par la liquidité non prise'].filter(Boolean) }));
      void t0;
    }
  }

  /* ── PD arrays : zones rectangulaires (ouvertes jusqu'à 3 bougies après la dernière ; remplies jusqu'à la bougie qui les a remplies) ── */
  const zoneObj = (z, { rempli = false } = {}) => {
    const hz = z.dir > 0, s = sensTxt(z.dir), mit = z.statut === 'teste' || z.statut === 'ce_touche', style = z.dir > 0 ? 'vert' : z.dir < 0 ? 'rouge' : 'gris';
    if (z.type === 'FVG') { const inv = !!z.inverse, t0 = inv ? z.tInverse : B[Math.max(0, z.iMilieu - 1)].t;
      return add({ id: z.id + (rempli ? '|rempli' : ''), famille: 'zone', kind: 'zone', nom: inv ? `IFVG ${s} · ${u}` : `FVG ${s} · ${u} · CE ${px(z.ce)}`, court: inv ? 'iFVG' : 'FVG', style, detail: inv ? 'FVG inversé : traversé en clôture' : `CE ${px(z.ce)} · ${rempli ? 'rempli' : z.statut === 'ce_touche' ? 'CE déjà touché' : 'non rempli'}`, bas: z.bas, haut: z.haut, ce: z.ce, tDebut: t0, tFin: rempli ? z.tRempli : null, etat: rempli ? 'rempli' : 'ouvert', dir: z.dir, pointille: mit || rempli, prio: rempli ? 58 : 85, statut: rempli ? 'rempli' : inv ? 'inversé (IFVG)' : z.statut === 'ce_touche' ? 'CE touché' : 'non rempli', prix: `${px(z.bas)} à ${px(z.haut)} · CE ${px(z.ce)}`,
        pourquoi: inv ? [`un FVG ${sensTxt(-z.dir)} a été traversé par une clôture : il devient une zone ${s}`] : [`trou entre ${hz ? 'le plus haut de la bougie 1 et le plus bas de la bougie 3' : 'le plus bas de la bougie 1 et le plus haut de la bougie 3'} : ${px(z.bas)} à ${px(z.haut)}`, rempli ? `rempli le ${hp(z.tRempli)}` : 'le prix revient souvent combler une partie de ce vide ; le milieu (CE) respecté montre de la force', z.tCe ? `CE touché le ${hp(z.tCe)}` : 'CE pas encore touché'] });
    }
    if (z.type === 'OB') return add({ id: z.id, famille: 'zone', kind: 'zone', nom: `Order Block ${s}${z.fort ? ' FORT' : ''} · ${u}`, court: z.fort ? 'OB fort' : 'OB', style, detail: [z.liquidite ? 'sweep' : null, 'reversal candle', 'FVG'].filter(Boolean).join(' + ') + ` · MT ${px(z.meanThreshold)}`, bas: z.bas, haut: z.haut, mt: z.meanThreshold, tDebut: z.tCandidate, tFin: rempli ? z.tRempliOb : null, etat: rempli ? 'rempli' : 'ouvert', dir: z.dir, fort: !!z.fort, pointille: z.statut === 'teste' || rempli, prio: rempli ? 58 : 88, statut: rempli ? 'rempli' : z.statut === 'teste' ? 'testé' : 'frais', prix: `${px(z.bas)} à ${px(z.haut)} · MT ${px(z.meanThreshold)}`,
      pourquoi: [z.fort ? `fort : le déplacement casse aussi un ${z.casse || 'sommet / creux de structure'}` : 'simple : la reversal candle casse seulement la candidate', z.liquidite ? 'prise de liquidité : la candidate ou la bougie juste avant a balayé un ' + (hz ? 'creux' : 'sommet') : 'pas de prise de liquidité (valide mais moins puissant)', `candidate : dernière bougie ${hz ? 'baissière' : 'haussière'} avant le retournement (${hp(z.tCandidate)})`, `FVG immédiat ${px(z.fvg.bas)} – ${px(z.fvg.haut)}`, z.stopsDerriere ? 'piège : des stops sont laissés derrière' : ''].filter(Boolean) });
    return add({ id: z.id, famille: 'zone', kind: 'zone', nom: `Breaker ${s} · ${u}`, court: 'BRK', style, detail: 'ancien order block cassé', bas: z.bas, haut: z.haut, tDebut: z.t, tFin: null, etat: 'ouvert', dir: z.dir, pointille: true, prio: 80, statut: z.statut === 'teste' ? 'testé' : 'frais', prix: `${px(z.bas)} à ${px(z.haut)}`,
      pourquoi: ['un order block a été cassé en clôture : sa zone change de camp et devient ' + (z.dir > 0 ? 'un support' : 'une résistance'), z.liquidite ? 'après une prise de liquidité : breaker complet' : 'sans prise de liquidité : plutôt un mitigation block, moins fort'] });
  };
  if (on('ictFvg')) {
    const ZALL = complet ? zonesA(an, B, v1, px0, atr) : an.pdArrays, Z = ZALL.filter(z => z.actif), hauts = Z.filter(z => z.haut > px0).sort((a, b) => a.distance - b.distance), bas = Z.filter(z => z.haut <= px0).sort((a, b) => a.distance - b.distance);
    const posees = new Set(), poser = (z, prio) => { if (!z || posees.has(z.id)) return; posees.add(z.id); const o = zoneObj(z); o.prio = prio; };
    poser(hauts[0], 95); poser(bas[0], 95);
    const fort = Z.filter(z => z.type === 'OB' && z.fort).sort((a, b) => a.distance - b.distance)[0]; poser(fort, 94);
    if (complet && on('ictStructure')) for (const e of listeCassures(an, { depuis: d0 }).filter(q => q.t <= tV1 && q.tNiveau >= tV0).slice(-14)) { const ob = obDeCassure(an, e), zz = ob && (ZALL.find(q => q.id === ob.id) || ZALL.find(q => q.id === ob.id + '|brk')); if (!zz) continue; if (zz.type === 'OB' && !zz.actif) { if (!posees.has(zz.id)) { posees.add(zz.id); zoneObj(zz, { rempli: true }).prio = 74; } } else poser(zz, 84); }
    if (complet) {
      for (const z of [hauts[1], bas[1]]) poser(z, 76);
      for (const f of an.fvg.filter(f => f.statut === 'rempli' && !f.inverse && f.tRempli != null && (fen ? f.tRempli >= tV0 && f.tRempli <= tV1 : B.findIndex(b => b.t === f.tRempli) >= dR)).sort((a, b) => b.i - a.i).slice(0, fen ? 3 : 1)) zoneObj({ ...f, type: 'FVG' }, { rempli: true }).prio = 75;
      const { unicorn, bpr } = unicornBpr(an);
      unicorn.filter(r => r.t <= tV1).slice(0, 1).forEach((r, i) => add({ id: 'unicorn|' + i, famille: 'zone', kind: 'zone', nom: 'Unicorn', court: 'Unicorn', style: r.dir > 0 ? 'vert' : 'rouge', detail: 'FVG + breaker', bas: r.bas, haut: r.haut, tDebut: r.t, tFin: null, etat: 'ouvert', dir: r.dir, dore: true, prio: 72, statut: 'actif', prix: `${px(r.bas)} à ${px(r.haut)}`, pourquoi: ['un FVG chevauche un breaker du même sens : la zone commune est la plus précise'] }));
      bpr.filter(r => r.t <= tV1).slice(0, 1).forEach((r, i) => add({ id: 'bpr|' + i, famille: 'zone', kind: 'zone', nom: 'BPR', court: 'BPR', style: 'gris', detail: 'FVG haussier + FVG baissier', bas: r.bas, haut: r.haut, tDebut: r.t, tFin: null, etat: 'ouvert', dir: 0, prio: 70, statut: 'actif', prix: `${px(r.bas)} à ${px(r.haut)}`, pourquoi: ['un FVG haussier et un FVG baissier se chevauchent (balanced price range)'] }));
      for (const g of gapsOuverture(B, A, an.unite, { depuis: d0 }).filter(q => q.t <= tV1).slice(-1)) add({ id: 'gap|' + g.t, famille: 'zone', kind: 'zone', nom: g.type, court: g.type, style: 'gris', detail: g.type === 'NWOG' ? 'écart d\'ouverture de la semaine' : 'écart d\'ouverture du jour', bas: g.bas, haut: g.haut, tDebut: g.t, tFin: null, etat: 'ouvert', dir: 0, gris: true, prio: 70, statut: 'non comblé', prix: `${px(g.bas)} à ${px(g.haut)}`, pourquoi: [g.type === 'NWOG' ? 'trou entre la clôture du vendredi et l\'ouverture de la semaine' : 'trou entre la clôture de la veille et l\'ouverture du jour', 'pas encore comblé par le prix'] });
    }
  }

  /* ── structure : BOS / MSS (Essentiel : le dernier ; Complet : les 3 derniers) ; les 4 derniers sommets / creux en petit texte gris (Complet) ── */
  if (on('ictStructure')) {
    const ev = listeCassures(an, { depuis: d0 }).filter(e => e.t <= tV1 && (!complet || e.tNiveau >= tV0)), L = ev.slice(complet ? -14 : -1);   // Complet : une cassure dont le niveau est né avant la plage visible n'est pas tracée (pas de trait qui part du bord gauche)
    L.forEach((e, k) => add({ id: `cas|${e.t}|${e.niveau}`, famille: 'structure', kind: 'segment', nom: `${e.nature} ${sensTxt(e.dir)}`, court: e.nature, style: e.dir > 0 ? 'vert' : 'rouge', p: e.niveau, tNiveau: e.tNiveau, t: e.t, dir: e.dir, mss: e.nature === 'MSS', hors: true, prio: k === L.length - 1 ? 88 : 84, statut: e.deplacement ? 'avec déplacement' : 'sans déplacement', detail: `${e.type} cassé en clôture`, prix: px(e.niveau),
      pourquoi: [e.nature === 'MSS' ? `MSS : cassure du dernier swing opposé (${e.type}) en clôture, qui renverse la tendance précédente` : `BOS : cassure en clôture d'un ${e.type} dans le sens de la tendance (continuation)`, e.deplacement ? 'avec déplacement (grande bougie franche)' : 'sans déplacement : plus fragile', `niveau ${px(e.niveau)}, cassé le ${hp(e.t)}`] }));
    if (complet) {
      const parT = new Map(); for (const s of etiquettesSwings(an, { depuis: d0, max: 5000 }).filter(q => q.i <= v1)) parT.set(s.t, s);
      for (const [Ls, nom] of [[an.structure.ITH, 'ITH'], [an.structure.ITL, 'ITL']]) for (const x of Ls.filter(y => y.i >= d0 && y.i <= v1)) parT.set(x.t, { nom, p: x.p, t: x.t, i: x.i, haut: nom === 'ITH' });
      const DEF = { HH: 'plus haut plus haut que le sommet précédent', HL: 'plus bas plus haut que le creux précédent', LH: 'plus haut plus bas que le sommet précédent', LL: 'plus bas plus bas que le creux précédent', ITH: EXPL.ITH, ITL: EXPL.ITL };
      for (const s of choisirSommets([...parT.values()], 12)) add({ id: `sw|${s.nom}|${s.t}`, famille: 'structure', kind: 'etiquette', hors: true, nom: s.nom, court: s.nom, style: 'texte', p: s.p, t: s.t, haut: s.haut, prio: 79, detail: 'structure des swings', statut: '', prix: px(s.p), pourquoi: [DEF[s.nom]] });
    }
  }

  /* ── range asiatique (M15, H1) et bande de killzones (Complet, M15 et H1 seulement) ── */
  if (on('ictLiquidite') && complet && !histo && (an.unite === 'M15' || an.unite === 'H1')) {
    const h = an.niveaux.find(x => x.type === 'ASIE_H' && x.jour === jourMarche(B[n - 1].t).cle), l = an.niveaux.find(x => x.type === 'ASIE_B' && x.jour === jourMarche(B[n - 1].t).cle);
    if (h && l) { const f = fenetresKillzones(h.jour).find(k => k.id === 'asie'); add({ id: 'range|asie|' + h.jour, famille: 'range', kind: 'range', nom: `Range Asie · ${px(l.p)} – ${px(h.p)}`, court: 'Asie', style: 'gris', detail: 'accumulation (session asiatique)', bas: l.p, haut: h.p, prix: `${px(l.p)} à ${px(h.p)}`, tDebut: f.debut, tFin: f.fin, prio: 80, statut: h.enCours ? 'en cours' : 'terminé', pourquoi: ['accumulation : plage de la session asiatique, souvent balayée à Londres (manipulation, Judas swing) avant le vrai mouvement'] }); }
  }
  if (on('ictTemps') && complet && (an.unite === 'M15' || an.unite === 'H1')) {
    const NOMK = { londres: 'LDN', ny_am: 'NY' }, tFin = v1 < n - 1 ? B[v1].t + (B[1].t - B[0].t) : an.tFin, t0 = B[d0].t, jours = [...new Set(B.slice(d0, v1 + 1).map(b => jourMarche(b.t).cle))], F = [];
    for (const j of jours) for (const k of fenetresKillzones(j)) if (NOMK[k.id] && k.fin > t0 && k.debut < tFin + 3600e3) F.push({ debut: k.debut, fin: k.fin, nom: NOMK[k.id], id: k.id });
    if (F.length) add({ id: 'killzones', famille: 'temps', kind: 'bande', nom: 'Killzones (LDN, NY)', court: 'LDN · NY', style: 'gris', bandes: F, prio: 81, statut: F.some(k => k.debut <= tFin && k.fin > tFin) ? 'une killzone est en cours' : 'aucune en cours', detail: 'fenêtres de Londres et de New York',
      pourquoi: ['killzone : fenêtre où les mouvements ICT sont les plus fiables (heures calculées par les fuseaux, jamais un décalage fixe)', 'LDN = Londres, NY = New York (heure de Paris : voir la carte ⓘ)'] });
  }

  /* ── premium / discount : plus de grille. Essentiel : « EQ 50 % ». Complet : « EQ 50 % », rectangle « OTE » (0,62 – 0,79), carrés « Premium » et « Discount » ── */
  if (on('ictPd') && !histo) {
    const F = fibonacci(an);
    if (F) {
      const k = x => F.niveaux.find(q => q.k === x).p, eq = k(0.5), o62 = k(0.618), o79 = k(0.786);
      add({ id: 'fib|' + F.tDebut, famille: 'pd', kind: 'fib', nom: `Équilibre 50 % · dealing range ${u}`, court: 'EQ 50 %', style: 'gris', detail: `ITL ${px(F.bas)} ↔ ITH ${px(F.haut)}`, p: eq, eq, ote: complet ? { bas: Math.min(o62, o79), haut: Math.max(o62, o79) } : null, complet, bas: F.bas, haut: F.haut, tDebut: F.tDebut, sens: F.sens, prio: 90, statut: pd ? pd.zone : '', prix: `${px(eq)} (${px(F.bas)} ↔ ${px(F.haut)})`,
        pourquoi: ['dealing range : du dernier ITL au dernier ITH de l\'unité, recalculé après chaque BOS ou MSS ; équilibre à 50 %', 'au-dessus : premium (cher) ; en dessous : discount (bon marché) ; OTE : retracement de 62 % à 79 %', `prix actuel en ${pd ? pd.zone : '—'} (${pd ? pd.pct : '—'} %)`] });
    } else if (an.unite === 'J' && an.plages && an.plages[0]) { const p = an.plages[0]; add({ id: 'eq20', famille: 'pd', kind: 'fib', nom: `Équilibre ${p.jours} jours · ${px(p.equilibre)}`, court: 'EQ 50 %', style: 'gris', p: p.equilibre, eq: p.equilibre, ote: null, complet: false, tDebut: B[Math.max(0, n - p.jours)].t, prio: 60, statut: p.zone, detail: `plage de ${p.jours} jours`, prix: px(p.equilibre), pourquoi: [`milieu de la plage de ${p.jours} jours : au-dessus premium, en dessous discount`] }); }
  }

  /* « un prix = une seule ligne » : l'équilibre qui tombe sur une ligne de liquidité n'est pas tracé deux fois, son nom passe dans la bulle de la ligne */
  for (const f of O.filter(o => o.kind === 'fib')) { const l = lignes.find(q => Math.abs(q.p - f.eq) < FUSION_ATR * atr); if (l) { l.autres.push('EQ 50 %'); O.splice(O.indexOf(f), 1); } }

  /* ── scénarios A et B de Rayle (ict-scenarios.js, la même analyse que `lecture_ict`) : Essentiel = A seul, Complet = A et B ; pas dans la plage historique ── */
  let SCEN = null;
  if (!histo) { SCEN = scenarios || scenariosIct(an, { prix: px0 });
    for (const sc of SCEN.scenarios.filter(q => complet || q.lettre === 'A')) add({ id: 'scenario|' + sc.lettre, famille: 'scenario', kind: 'scenario', nom: sc.nom, court: sc.court, style: sc.lettre === 'A' && !sc.gris ? 'blanc' : 'gris', detail: 'une possibilité, pas une prévision · invalidation ' + sc.invalidation.texte, lettre: sc.lettre, role: sc.role, gris: sc.gris, sens: sc.dir, zone: sc.zone, cible: sc.cible, invalidation: sc.invalidation, bulle: sc.bulle, voix: sc.voix, prio: 20, statut: 'possibilité', pourquoi: sc.bulle }); }

  /* ── pastilles de l'axe : le PRIX seulement (la couleur est celle du niveau), pour la BSL et la SSL visées ── */
  const pastilles = []; if (on('ictLiquidite')) { if (ext.b) pastilles.push({ cote: 'BSL', p: ext.b.p }); if (ext.s) pastilles.push({ cote: 'SSL', p: ext.s.p }); }

  /* ── plafonds : Essentiel 8 objets, Complet 20 zones et niveaux PAR ÉCRAN (les cassures, les sommets et les scénarios ne comptent pas) ; fusion : Unicorn, puis recouvrement > 60 % ── */
  const O2 = complet ? fusionnerZones(O) : O, max = complet ? MAX_COMPLET : MAX_ESSENTIEL, comptes = O2.filter(o => o.kind !== 'scenario' && !o.hors).sort((a, b) => (b.prio || 0) - (a.prio || 0) || dist(a) - dist(b)).slice(0, max), garde = new Set(comptes);
  for (const o of O2) if (o.kind === 'scenario' || o.hors) garde.add(o);
  const res = O2.filter(o => garde.has(o));
  return { objets: res.map(o => ({ ...o, distanceAtr: o.p != null || o.bas != null ? dist(o) / atr : null })), pastilles, mode, atr, fenetre: { i0: d0, i1: v1, histo } };
}

/* badge de tendance, UNE ligne courte : « H1 · structure haussière · MSS 3 585,0 · invalidation 3 538,0 » */
export function badgeIct(an) {
  if (!an || !an.ok) return { sens: 'indecise', texte: 'ICT : pas assez de bougies' };
  const t = an.tendance, d = t.derniereCassure, mot = t.sens === 'haussiere' ? 'haussière' : t.sens === 'baissiere' ? 'baissière' : 'indécise';
  let s = `${an.nom} · structure ${mot}`;
  if (d) s += ` · ${d.type} ${px(d.prix)}`;
  if (t.sens === 'haussiere' && t.itl) s += ` · invalidation ${px(t.itl.p)}`; else if (t.sens === 'baissiere' && t.ith) s += ` · invalidation ${px(t.ith.p)}`;
  return { sens: t.sens, texte: s };
}
