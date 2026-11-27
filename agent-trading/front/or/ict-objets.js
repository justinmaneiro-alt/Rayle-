/* ═════════════ OBJETS ICT NOMMÉS (pur, testé) : LA liste que dessinent le terminal et que lit Rayle (`lecture_ict`) ═════════════
   Source : ict-v2.js (une seule unité). Chaque objet porte un NOM lisible, son unité, ses prix, POURQUOI il est tracé et son statut : rien d'anonyme.
   Deux modes : « essentiel » (une quinzaine d'objets : le plus utile, le plus proche du prix) et « complet » (toute la lecture sur les 150 dernières bougies).
   Interprétation de l'ICT : une description, jamais un ordre. */
import { fenetresKillzones, jourMarche, partiesNY } from './ict-v1.js';
import { porteeLiquidite, consolidations, listeCassures, etiquettesSwings, unicornBpr, gapsOuverture, projections, fibonacci } from './ict-v2.js';

export const MAX_ESSENTIEL = 15, FENETRE_COMPLET = 150;
export const px = x => (Number.isFinite(x) ? Number(x).toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(x) >= 1000 ? 1 : Math.abs(x) >= 100 ? 2 : 4 }).replace(/[  ]/g, ' ') : '—');
const hp = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const LIB = { EQH: 'EQH', EQL: 'EQL', PDH: 'PDH', PDL: 'PDL', PWH: 'PWH', PWL: 'PWL', ASIE_H: 'haut Asie', ASIE_B: 'bas Asie', LDN_H: 'haut Londres', LDN_B: 'bas Londres', ITH: 'ITH', ITL: 'ITL', LTH: 'LTH', LTL: 'LTL' };
const EXPL = { EQH: 'deux sommets à moins de 0,1 ATR : des ordres stop s\'accumulent au-dessus', EQL: 'deux creux à moins de 0,1 ATR : des ordres stop s\'accumulent en dessous', PDH: 'plus haut de la veille', PDL: 'plus bas de la veille', PWH: 'plus haut de la semaine précédente', PWL: 'plus bas de la semaine précédente', ASIE_H: 'plus haut de la session asiatique', ASIE_B: 'plus bas de la session asiatique', LDN_H: 'plus haut de la session de Londres', LDN_B: 'plus bas de la session de Londres', ITH: 'sommet intermédiaire (un STH encadré par deux STH plus bas) encore intact', ITL: 'creux intermédiaire (un STL encadré par deux STL plus hauts) encore intact', LTH: 'sommet de long terme (un ITH encadré par deux ITH plus bas)', LTL: 'creux de long terme (un ITL encadré par deux ITL plus hauts)' };
export const LEGENDE_ICT = Object.freeze([
  ['haut', 'zone haussière : order block, FVG, breaker'], ['bas', 'zone baissière : order block, FVG, breaker'], ['ligne', 'ligne pleine : liquidité à prendre (BSL / SSL)'],
  ['prise', 'pointillé gris + ✕ : liquidité déjà prise (sweep)'], ['struct', 'BOS / MSS : cassures de structure en clôture'], ['fib', 'Fibonacci : premium, équilibre, discount, OTE']]);

const sensTxt = d => (d > 0 ? 'haussier' : 'baissier');
function base(o) { return { unite: '', statut: '', pourquoi: [], detail: '', ...o }; }

export function objetsIct(an, { mode = 'essentiel', couches = null, prix = null } = {}) {
  if (!an || !an.ok) return { objets: [], pastilles: [], mode };
  const u = an.nom, n = an.bougies.length, B = an.bougies, A = an.A, px0 = Number.isFinite(prix) ? prix : an.prix, atr = an.atr || 1, complet = mode === 'complet', d0 = Math.max(0, n - FENETRE_COMPLET);
  const on = k => !couches || couches[k] !== false, O = [], dist = o => (o.p != null ? Math.abs(o.p - px0) : px0 >= o.bas && px0 <= o.haut ? 0 : Math.min(Math.abs(px0 - o.bas), Math.abs(px0 - o.haut)));
  const add = o => { O.push(base({ unite: u, ...o })); return o; };
  const pd = an.premiumDiscount;

  /* ── liquidité : lignes nommées, interne / externe, prise = grise en pointillé avec ✕ sweep ── */
  const LQ = [];
  if (on('ictLiquidite')) {
    for (const x of an.liquidites) { if (x.balayee && x.iSweep != null && x.iSweep < d0) continue; LQ.push({ type: x.type, cote: x.cote, p: x.p, balayee: !!x.balayee, typeBalayage: x.typeBalayage, tForm: x.tPremier || x.tForm, tSweep: x.tSweep, iSweep: x.iSweep, pivots: x.type === 'EQH' || x.type === 'EQL' ? [x.tPremier, B[Math.max(0, x.iForm - 1)].t] : null }); }
    const ST = an.structure; for (const [L, type, cote] of [[ST.ITH, 'ITH', 'BSL'], [ST.ITL, 'ITL', 'SSL']]) { const x = [...L].reverse().find(y => !y.cassee); if (x) LQ.push({ type, cote, p: x.p, balayee: false, tForm: x.t, swing: x.t }); }
    if (complet || an.unite === 'J') for (const [L, type, cote] of [[ST.LTH, 'LTH', 'BSL'], [ST.LTL, 'LTL', 'SSL']]) { const x = L[L.length - 1]; if (x) LQ.push({ type, cote, p: x.p, balayee: false, tForm: x.t, swing: x.t }); }
    const RANG = { PDH: 0, PDL: 0, PWH: 0, PWL: 0, ASIE_H: 1, ASIE_B: 1, LDN_H: 1, LDN_B: 1, ITH: 2, ITL: 2, LTH: 3, LTL: 3, EQH: 4, EQL: 4 };   // même niveau, plusieurs noms : on garde le plus parlant
    LQ.sort((a, b) => (RANG[a.type] ?? 9) - (RANG[b.type] ?? 9)); for (let i = LQ.length - 1; i >= 0; i--) { const a = LQ[i]; if (LQ.some((b, k) => k < i && b.cote === a.cote && b.balayee === a.balayee && Math.abs(b.p - a.p) < 0.05 * atr)) LQ.splice(i, 1); }
    for (const q of LQ) { q.portee = porteeLiquidite(an, q); q.dist = Math.abs(q.p - px0); }
    const vivants = LQ.filter(q => !q.balayee), au = vivants.filter(q => q.p >= px0).sort((a, b) => a.p - b.p), sous = vivants.filter(q => q.p < px0).sort((a, b) => b.p - a.p);
    const choisi = new Set(); const pr = new Map();
    const pick = (q, p) => { if (q) { choisi.add(q); pr.set(q, Math.max(pr.get(q) || 0, p)); } };
    pick(au[0], 90); pick(sous[0], 90); pick(au.find(q => q.portee === 'externe'), 80); pick(sous.find(q => q.portee === 'externe'), 80);
    for (const q of vivants) if (q.type === 'PDH' || q.type === 'PDL') pick(q, 70);
    const prises = LQ.filter(q => q.balayee).sort((a, b) => b.iSweep - a.iSweep); prises.slice(0, 2).forEach(q => pick(q, 45));
    const liste = complet ? [...new Set([...au.slice(0, 6), ...sous.slice(0, 6), ...vivants.filter(q => q.portee === 'externe' || /^(PD|PW|ASIE|LDN|IT|LT)/.test(q.type)), ...prises.slice(0, 6)])] : [...choisi];
    for (const q of liste) {
      const lib = LIB[q.type] || q.type, nom = `${q.cote} ${q.portee} · ${lib} ${px(q.p)}${q.balayee ? ' (prise)' : ''}`, bal = q.balayee, ext = q.portee === 'externe';
      add({ id: `liq|${q.type}|${q.p}|${q.tForm}`, famille: 'liquidite', kind: 'ligne', nom, p: q.p, tDebut: q.tForm, cote: q.cote, prise: bal, portee: q.portee, prio: pr.get(q) || (bal ? 30 : 40), dir: q.cote === 'BSL' ? -1 : 1,
        sweep: bal && q.iSweep != null ? { t: q.tSweep, p: q.cote === 'BSL' ? B[q.iSweep].h : B[q.iSweep].l, type: q.typeBalayage } : null, pivots: q.pivots || null,
        statut: bal ? (q.typeBalayage === 'sweep' ? 'prise (sweep : mèche au-delà puis clôture de retour)' : q.typeBalayage === 'cassure' ? 'prise (cassée en clôture)' : 'prise') : 'à prendre',
        detail: `${q.cote === 'BSL' ? 'liquidité acheteuse (stops au-dessus)' : 'liquidité vendeuse (stops en dessous)'} · ${q.portee}`,
        pourquoi: [EXPL[q.type] || 'niveau de liquidité', `${q.portee === 'externe' ? 'externe : extrémité du dealing range de l\'unité ou au-delà (LTH / LTL, PWH / PWL)' : 'interne : à l\'intérieur du dealing range de l\'unité'}`, q.tForm ? `formé le ${hp(q.tForm)} (heure de Paris)` : '', bal ? `prise le ${hp(q.tSweep)}` : 'pas encore prise : le prix est attiré par la liquidité non prise'].filter(Boolean) });
      if (q.swing != null && (q.type === 'ITH' || q.type === 'ITL')) add({ id: `sw|${q.type}|${q.swing}`, famille: 'structure', kind: 'etiquette', nom: q.type, p: q.p, t: q.swing, haut: q.type === 'ITH', prio: 55, detail: 'swing de structure de l\'unité', pourquoi: [EXPL[q.type]], statut: 'intact' });
    }
  }

  /* ── PD arrays : zones rectangulaires nommées ── */
  const Z = an.pdArrays.filter(z => z.actif);
  const sel = () => { const h = Z.filter(z => z.haut > px0).sort((a, b) => a.distance - b.distance).slice(0, 2), b = Z.filter(z => z.haut <= px0).sort((a, b2) => a.distance - b2.distance).slice(0, 2); return [...new Set([...h, ...b])]; };
  if (on('ictFvg')) {
    const recentes = Z.filter(z => (z.creeEn ?? 0) >= d0), cplt = [...recentes.filter(z => z.haut > px0).sort((a, b) => a.distance - b.distance).slice(0, 6), ...recentes.filter(z => z.haut <= px0).sort((a, b) => a.distance - b.distance).slice(0, 6)];
    for (const z of complet ? cplt : sel()) {
      const hz = z.dir > 0, s = sensTxt(z.dir), mit = z.statut === 'teste' || z.statut === 'ce_touche';
      if (z.type === 'FVG') { const inv = !!z.inverse, t0 = inv ? z.tInverse : B[Math.max(0, z.iMilieu - 1)].t, nom = inv ? `IFVG ${s} · ${u}` : hz ? `FVG ${u} · CE ${px(z.ce)}` : `FVG baissier · ${u} · CE ${px(z.ce)}`;
        add({ id: z.id, famille: 'zone', kind: 'zone', nom, detail: inv ? 'FVG inversé : traversé en clôture' : `CE ${px(z.ce)} · ${z.statut === 'ce_touche' ? 'CE déjà touché' : 'non rempli'}`, bas: z.bas, haut: z.haut, ce: z.ce, tDebut: t0, dir: z.dir, pointille: mit, prio: 85 - Math.min(20, (z.distanceAtr || 0)), statut: inv ? 'inversé (IFVG)' : z.statut === 'ce_touche' ? 'CE touché' : 'non rempli',
          pourquoi: inv ? [`un FVG ${sensTxt(-z.dir)} a été traversé par une clôture : il devient une zone ${s}`] : [`trou entre le ${hz ? 'plus haut de la bougie 1 et le plus bas de la bougie 3' : 'plus bas de la bougie 1 et le plus haut de la bougie 3'} : ${px(z.bas)} à ${px(z.haut)} (≥ 0,3 ATR ${u}, bougie centrale de corps ≥ 0,8 ATR)`, 'le prix revient souvent combler une partie de ce vide ; le milieu (CE) respecté montre de la force', z.tCe ? `CE touché le ${hp(z.tCe)}` : 'CE pas encore touché'] });
      } else if (z.type === 'OB') {
        const nom = `Order Block ${s}${z.fort ? ' FORT' : ''} · ${u}`, det = [z.liquidite ? 'sweep' : null, 'reversal candle', 'FVG'].filter(Boolean).join(' + ') + ` · MT ${px(z.meanThreshold)}`;
        add({ id: z.id, famille: 'zone', kind: 'zone', nom, detail: det, bas: z.bas, haut: z.haut, mt: z.meanThreshold, tDebut: z.tCandidate, dir: z.dir, fort: !!z.fort, pointille: z.statut === 'teste', prio: 88 - Math.min(20, (z.distanceAtr || 0)), statut: z.statut === 'teste' ? 'testé' : 'frais',
          pourquoi: [`candidate : dernière bougie ${hz ? 'baissière' : 'haussière'} avant le retournement (${hp(z.tCandidate)})`, z.liquidite ? 'prise de liquidité : la candidate ou la bougie juste avant a balayé un ' + (hz ? 'creux' : 'sommet') : 'pas de prise de liquidité (valide mais moins puissant)', `reversal candle : une bougie clôture au-delà du ${hz ? 'plus haut' : 'plus bas'} de la candidate (${hp(z.tReversal)})`, `FVG immédiat ${px(z.fvg.bas)} – ${px(z.fvg.haut)}`, z.fort ? `fort : le déplacement casse aussi un ${z.casse || 'sommet / creux de structure'}` : 'simple : la reversal candle casse seulement la candidate', z.stopsDerriere ? 'piège : des stops sont laissés derrière (consolidation aux creux intacts juste sous la zone)' : ''].filter(Boolean) });
      } else if (z.type === 'breaker') add({ id: z.id, famille: 'zone', kind: 'zone', nom: `Breaker ${s} · ${u}`, detail: 'ancien order block cassé', bas: z.bas, haut: z.haut, tDebut: z.t, dir: z.dir, pointille: true, prio: 80 - Math.min(20, (z.distanceAtr || 0)), statut: z.statut === 'teste' ? 'testé' : 'frais',
        pourquoi: ['un order block a été cassé en clôture : sa zone change de camp et devient ' + (z.dir > 0 ? 'un support' : 'une résistance'), z.liquidite ? 'après une prise de liquidité : breaker complet' : 'sans prise de liquidité : plutôt un mitigation block, moins fort'] });
    }
    if (complet) {
      const { unicorn, bpr } = unicornBpr(an);
      unicorn.slice(0, 2).forEach((r, i) => add({ id: 'unicorn|' + i, famille: 'zone', kind: 'zone', nom: 'Unicorn', detail: 'FVG + breaker', bas: r.bas, haut: r.haut, tDebut: r.t, dir: r.dir, dore: true, prio: 70, statut: 'actif', pourquoi: ['un FVG chevauche un breaker du même sens : la zone commune est la plus précise'] }));
      bpr.slice(0, 2).forEach((r, i) => add({ id: 'bpr|' + i, famille: 'zone', kind: 'zone', nom: 'BPR', detail: 'FVG haussier + FVG baissier', bas: r.bas, haut: r.haut, tDebut: r.t, dir: 0, prio: 60, statut: 'actif', pourquoi: ['un FVG haussier et un FVG baissier se chevauchent (balanced price range)'] }));
      for (const g of gapsOuverture(B, A, an.unite, { depuis: d0 }).slice(-3)) add({ id: 'gap|' + g.t, famille: 'zone', kind: 'zone', nom: g.type, detail: g.type === 'NWOG' ? 'écart d\'ouverture de la semaine' : 'écart d\'ouverture du jour', bas: g.bas, haut: g.haut, tDebut: g.t, dir: 0, gris: true, prio: 50, statut: 'non comblé', pourquoi: [g.type === 'NWOG' ? 'trou entre la clôture du vendredi et l\'ouverture de la semaine' : 'trou entre la clôture de la veille et l\'ouverture du jour', 'pas encore comblé par le prix'] });
    }
  }

  /* ── structure : BOS / MSS (segment du swing cassé jusqu'à la bougie de cassure), ITH / ITL, HH / HL / LH / LL ── */
  if (on('ictStructure')) {
    const ev = listeCassures(an, { depuis: d0 }), L = complet ? ev.slice(-8) : ev.slice(-1);
    for (const e of L) add({ id: `cas|${e.t}|${e.niveau}`, famille: 'structure', kind: 'segment', nom: `${e.nature} ${sensTxt(e.dir)}`, p: e.niveau, tNiveau: e.tNiveau, t: e.t, dir: e.dir, mss: e.nature === 'MSS', prio: 75, statut: e.deplacement ? 'avec déplacement' : 'sans déplacement', detail: `${e.type} cassé en clôture`,
      pourquoi: [e.nature === 'MSS' ? `MSS : cassure du dernier swing opposé (${e.type}) en clôture, qui renverse la tendance précédente` : `BOS : cassure en clôture d'un ${e.type} dans le sens de la tendance (continuation)`, e.deplacement ? 'avec déplacement (grande bougie franche)' : 'sans déplacement : plus fragile', `niveau ${px(e.niveau)}, cassé le ${hp(e.t)}`] });
    if (complet) {
      for (const [Ls, nom] of [[an.structure.ITH, 'ITH'], [an.structure.ITL, 'ITL']]) for (const x of Ls.filter(y => y.i >= d0 && y.cassee).slice(-3)) add({ id: `sw|${nom}|${x.t}`, famille: 'structure', kind: 'etiquette', nom, p: x.p, t: x.t, haut: nom === 'ITH', prio: 35, detail: 'swing de structure déjà cassé', statut: 'cassé', pourquoi: [EXPL[nom], 'cassé en clôture : voir BOS / MSS'] });
      for (const s of etiquettesSwings(an, { depuis: d0, max: 8 })) add({ id: `hh|${s.nom}|${s.t}`, famille: 'structure', kind: 'etiquette', nom: s.nom, p: s.p, t: s.t, haut: s.haut, prio: 30, detail: 'structure des swings', statut: '', pourquoi: [{ HH: 'plus haut plus haut que le sommet précédent', HL: 'plus bas plus haut que le creux précédent', LH: 'plus haut plus bas que le sommet précédent', LL: 'plus bas plus bas que le creux précédent' }[s.nom]] });
    }
  }

  /* ── ranges : range asiatique (M15, H1), consolidations (complet) ── */
  if (on('ictLiquidite') && (an.unite === 'M15' || an.unite === 'H1')) {
    const h = an.niveaux.find(x => x.type === 'ASIE_H' && x.jour === jourMarche(B[n - 1].t).cle), l = an.niveaux.find(x => x.type === 'ASIE_B' && x.jour === jourMarche(B[n - 1].t).cle);
    if (h && l) { const f = fenetresKillzones(h.jour).find(k => k.id === 'asie'); add({ id: 'range|asie|' + h.jour, famille: 'range', kind: 'range', nom: `Range Asie · ${px(l.p)} – ${px(h.p)}`, detail: 'accumulation (session asiatique)', bas: l.p, haut: h.p, tDebut: f.debut, tFin: f.fin, prio: 50, statut: h.enCours ? 'en cours' : 'terminé', pourquoi: ['accumulation : plage de la session asiatique, souvent balayée à Londres (manipulation, Judas swing) avant le vrai mouvement'] }); }
  }
  if (complet && on('ictLiquidite')) for (const c of consolidations(B, A, { depuis: d0 }).slice(-3)) add({ id: 'range|' + c.t0, famille: 'range', kind: 'range', nom: 'Range', detail: `${c.n} bougies dans 1,2 ATR`, bas: c.bas, haut: c.haut, tDebut: c.t0, tFin: c.t1, prio: 25, statut: 'terminé', pourquoi: [`${c.n} bougies consécutives dans une étendue de 1,2 ATR ${u} au plus : consolidation (liquidité de part et d'autre)`] });

  /* ── premium / discount : Fibonacci du dealing range (+ projections −1 et −2 en complet) ── */
  if (on('ictPd')) {
    const F = fibonacci(an); if (F) {
      const nomK = x => ({ 0: '0 · ' + px(x.p), 0.5: '0,5 · équilibre ' + px(x.p), 0.618: '0,618 · ' + px(x.p), 0.705: '0,705 · OTE ' + px(x.p), 0.786: '0,786 · ' + px(x.p), 1: '1 · ' + px(x.p) })[x.k];
      add({ id: 'fib|' + F.tDebut, famille: 'pd', kind: 'fib', nom: `Fibonacci premium / discount · dealing range ${u}`, detail: `ITL ${px(F.bas)} ↔ ITH ${px(F.haut)}`, bas: F.bas, haut: F.haut, tDebut: F.tDebut, sens: F.sens, prio: 76, statut: pd ? pd.zone : '',
        niveaux: F.niveaux.map(x => ({ k: x.k, p: x.p, nom: nomK(x) })),
        pourquoi: ['dealing range : du dernier ITL au dernier ITH de l\'unité ; équilibre à 50 %', 'au-dessus : premium (cher) ; en dessous : discount (bon marché) ; OTE : retracement de 62 % à 79 %, 70,5 % idéal', `prix actuel en ${pd ? pd.zone : '—'} (${pd ? pd.pct : '—'} %)`] });
      if (complet) { const pj = projections(an); if (pj) { [[1, pj.p1], [2, pj.p2]].forEach(([k, p]) => add({ id: 'proj|' + k, famille: 'pd', kind: 'ligne', nom: `−${k} · projection ${px(p)}`, p, tDebut: pj.t, cote: pj.dir > 0 ? 'BSL' : 'SSL', projection: true, prio: 28, statut: 'projection', detail: 'jambe du dernier MSS', pourquoi: [`projection ${k} fois la jambe du dernier MSS (${px(pj.depart)} → ${px(pj.fin)}) au-delà du swing cassé`, 'une cible possible, pas une prévision'] })); } }
    } else if (an.unite === 'J' && an.plages && an.plages[0]) { const p = an.plages[0]; add({ id: 'eq20', famille: 'pd', kind: 'ligne', nom: `Équilibre ${p.jours} jours · ${px(p.equilibre)}`, p: p.equilibre, tDebut: B[Math.max(0, n - p.jours)].t, cote: 'EQ', prio: 60, statut: p.zone, detail: `plage de ${p.jours} jours`, pourquoi: [`milieu de la plage de ${p.jours} jours : au-dessus premium, en dessous discount`] }); }
  }

  /* ── temps (M15, H1) : killzones en bandes nommées, minuit New York, Silver Bullet (complet) ── */
  if (on('ictTemps') && (an.unite === 'M15' || an.unite === 'H1')) {
    const NOMK = { londres: 'Londres', ny_am: 'New York', londres_cloture: 'Clôture de Londres' }, tFin = an.tFin, t0 = B[d0].t, jours = [...new Set(B.slice(d0).map(b => jourMarche(b.t).cle))], F = [];
    for (const j of jours) for (const k of fenetresKillzones(j)) if (NOMK[k.id] || (complet && /^sb_/.test(k.id))) if (k.fin > t0 && k.debut < tFin + 3600e3) F.push(k);
    const encours = F.filter(k => k.debut <= tFin && k.fin > tFin && NOMK[k.id]);
    for (const k of complet ? F : encours) add({ id: 'kz|' + k.id + '|' + k.debut, famille: 'temps', kind: 'bande', nom: NOMK[k.id] || 'Silver Bullet', detail: complet ? '' : 'killzone en cours', debut: k.debut, fin: k.fin, sb: /^sb_/.test(k.id), prio: 60, statut: k.debut <= tFin && k.fin > tFin ? 'en cours' : 'passée', pourquoi: [/^sb_/.test(k.id) ? 'Silver Bullet : une heure, un sweep, un déplacement, un FVG' : 'killzone : fenêtre où les mouvements ICT sont les plus fiables (heures calculées par les fuseaux, jamais un décalage fixe)', `de ${new Date(k.debut).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })} à ${new Date(k.fin).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })} (heure de Paris)`] });
    if (complet && an.temps && an.temps.minuit) add({ id: 'minuit', famille: 'temps', kind: 'ligne', nom: `Minuit NY · ${px(an.temps.minuit.prix)}`, p: an.temps.minuit.prix, tDebut: an.temps.minuit.t, cote: 'EQ', sable: true, prio: 45, statut: 'référence du jour', detail: 'ouverture de minuit New York', pourquoi: ['prix de référence du jour : une journée haussière forme souvent son plus bas sous l\'ouverture de minuit (manipulation)'] });
    void partiesNY;
  }

  /* ── scénario : prix → PD array le plus proche dans le sens de la lecture → liquidité visée (complet ; jamais une flèche d'achat ou de vente) ── */
  const p = an.penche; let sc = null;
  if (p && p.sens !== 'neutre') {
    const sens = p.sens === 'achat' ? 1 : -1, zs = Z.filter(z => (z.dir > 0 ? 1 : -1) === sens && !z.inverse).sort((a, b) => a.distance - b.distance)[0];
    const cibles = an.liquidites.filter(x => !x.balayee && x.cote === (sens > 0 ? 'BSL' : 'SSL') && (sens > 0 ? x.p > px0 : x.p < px0)).sort((a, b) => Math.abs(a.p - px0) - Math.abs(b.p - px0)), cible = cibles.find(x => porteeLiquidite(an, x) === 'externe') || cibles[0];
    if (zs && cible) { const nz = zs.type === 'OB' ? 'l\'order block' : zs.type === 'breaker' ? 'le breaker' : 'le FVG'; sc = { sens, zone: { bas: zs.bas, haut: zs.haut }, cible: { p: cible.p, nom: `${cible.cote} ${porteeLiquidite(an, cible)} · ${LIB[cible.type] || cible.type} ${px(cible.p)}` }, invalidation: p.invalidation ? p.invalidation.prix : null };
      if (complet) add({ id: 'scenario', famille: 'scenario', kind: 'scenario', nom: `Scénario ICT : retour dans ${nz} ${u}, puis ${sc.cible.nom.split(' · ')[0].replace(' externe', ' externe').replace(' interne', ' interne')}`, detail: `une possibilité, pas une prévision${sc.invalidation != null ? ' · invalidé ' + (sens > 0 ? 'sous ' : 'au-dessus de ') + px(sc.invalidation) : ''}`, ...sc, prio: 20, statut: 'possibilité', pourquoi: [`la lecture ICT ${u} penche ${sens > 0 ? 'à l\'achat' : 'à la vente'} : prix → ${nz} le plus proche → liquidité visée`, 'une possibilité de lecture, jamais une prévision ni un ordre'] }); }
  }

  /* ── pastilles sur l'axe des prix : la BSL et la SSL visées ── */
  const pastilles = []; if (on('ictLiquidite')) {
    const viv = an.liquidites.filter(x => !x.balayee), bsl = viv.filter(x => x.cote === 'BSL' && x.p > px0).sort((a, b) => a.p - b.p), ssl = viv.filter(x => x.cote === 'SSL' && x.p < px0).sort((a, b) => b.p - a.p);
    const ext = L => L.find(x => porteeLiquidite(an, x) === 'externe') || L[0]; const b = ext(bsl), s = ext(ssl);
    if (b) pastilles.push({ cote: 'BSL', p: b.p, texte: `BSL ${px(b.p)}` }); if (s) pastilles.push({ cote: 'SSL', p: s.p, texte: `SSL ${px(s.p)}` });
  }

  let res = O; if (!complet) { res = [...O].sort((a, b) => (b.prio || 0) - (a.prio || 0) || dist(a) - dist(b)).slice(0, MAX_ESSENTIEL); }
  return { objets: res.map(o => ({ ...o, distanceAtr: (o.p != null || o.bas != null) ? dist(o) / atr : null })), pastilles, mode };
}

/* badge de tendance : « Tendance H1 : haussière · MSS au-dessus de 3 585 · l'ITL 3 538 tient » */
export function badgeIct(an) {
  if (!an || !an.ok) return { sens: 'indecise', texte: 'ICT : pas assez de bougies' };
  const t = an.tendance, d = t.derniereCassure, mot = t.sens === 'haussiere' ? 'haussière' : t.sens === 'baissiere' ? 'baissière' : 'indécise';
  let s = `Tendance ${an.nom} : ${mot}`;
  if (d) s += ` · ${d.type} ${d.dir > 0 ? 'au-dessus de' : 'sous'} ${px(d.prix)}`;
  if (t.sens === 'haussiere' && t.itl) s += ` · l'ITL ${px(t.itl.p)} tient`; else if (t.sens === 'baissiere' && t.ith) s += ` · l'ITH ${px(t.ith.p)} tient`;
  if (an.unite === 'J' && an.biaisDuJour && an.biaisDuJour.sens) s += ` · biais du jour ${an.biaisDuJour.sens}`;
  return { sens: t.sens, texte: s };
}
