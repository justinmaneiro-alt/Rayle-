/* ═════════════ LECTURE ICT D'UNE UNITÉ (pur, testé) : le même objet pour l'écran, l'outil `lecture_ict` de Rayle et le résumé parlé ═════════════
   Source unique : ict-v2.js (aucune divergence possible entre ce que Justin voit et ce que Rayle dit). Une valeur absente est null (Rayle dit « indisponible »).
   Rayle décrit : elle dit de quel côté la lecture penche, ce qui manque et ce qui invaliderait ; jamais « achète » ni « vends ». */
import { nomUnite } from './ict-v2.js';

const arr = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);
const fr = (x, d = 2) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : 'indisponible');
const NOM_SESSION = { ASIE_H: 'haut de l\'Asie', ASIE_B: 'bas de l\'Asie', LDN_H: 'haut de Londres', LDN_B: 'bas de Londres' };

/* an : résultat de ict-v2.analyser ; meta : { actif, dec } */
export function lectureIct(an, { actif = null, dec = 2, max = 4 } = {}) {
  if (!an || !an.ok) return { actif, unite: an ? an.nom : null, indisponible: an && an.raison ? an.raison : 'pas assez de bougies', source: 'ict-v2' };
  const r = (x, d = dec) => arr(x, d), a = an.atr, px = an.prix;
  const liq = an.liquidites.map(x => ({ type: x.nom ? x.type : x.type, nom: x.nom || x.type, prix: r(x.p), distance: r(x.p - px), distanceAtr: a ? arr((x.p - px) / a, 1) : null, balayee: !!x.balayee, typeBalayage: x.typeBalayage || null, unite: an.nom }));
  const act = liq.filter(x => !x.balayee), au = act.filter(x => x.prix >= px).sort((x, y) => x.prix - y.prix).slice(0, max), sous = act.filter(x => x.prix < px).sort((x, y) => y.prix - x.prix).slice(0, max);
  const recents = liq.filter(x => x.balayee).slice(-3);
  const pd = an.pdArrays.map(z => ({ type: z.type, sens: z.sens, bas: r(z.bas), haut: r(z.haut), statut: z.statut, fort: z.type === 'OB' ? !!z.fort : null, liquidite: z.type === 'OB' || z.type === 'breaker' ? !!z.liquidite : null, stopsDerriere: z.type === 'OB' ? !!z.stopsDerriere : null, inverse: !!z.inverse, distance: r(z.distance), dedans: !!z.dedans, unite: an.nom }));
  const pdProches = [...pd.filter(z => z.bas >= px).sort((x, y) => x.distance - y.distance).slice(0, max), ...pd.filter(z => z.bas < px).sort((x, y) => x.distance - y.distance).slice(0, max)];
  const P = an.premiumDiscount, d = an.tendance.derniereCassure, T = an.temps, b = an.biaisDuJour, p = an.penche;
  return {
    actif, unite: an.nom, prix: r(px), atr: r(a),
    tendance: { sens: an.tendance.sens, pourquoi: an.tendance.pourquoi, ith: an.tendance.ith ? r(an.tendance.ith.p) : null, itl: an.tendance.itl ? r(an.tendance.itl.p) : null, derniereCassure: d ? { type: d.type, niveau: d.niveau, prix: r(d.prix), avecDeplacement: !!d.deplacement, sens: d.dir > 0 ? 'haussier' : 'baissier', il_y_a_bougies: an.n - 1 - d.i } : null },
    liquidites: [...au, ...sous, ...recents],
    pdArrays: pdProches,
    premiumDiscount: P ? { equilibre: r(P.equilibre), haut: r(P.haut), bas: r(P.bas), position: arr(P.position, 2), pct: P.pct, zone: P.zone, ote: P.ote ? { bas: r(P.ote.bas), haut: r(P.ote.haut), sens: P.ote.sens } : null, plages: an.plages ? an.plages.map(x => ({ jours: x.jours, equilibre: r(x.equilibre), pct: x.pct, zone: x.zone })) : undefined } : null,
    temps: T ? { killzone: T.killzone, silverBullet: T.silverBullet, prochaine: T.prochaine, ouvertureMinuit: T.minuit ? r(T.minuit.prix) : null } : null,
    biaisDuJour: b ? { sens: b.sens, cas: b.cas, raison: b.raison, pdh: r(b.pdh), pdl: r(b.pdl) } : null,
    checklist: an.checklist.map(x => ({ condition: x.condition, ok: x.ok, obligatoire: x.obligatoire })),
    penche: { sens: p.sens, raisons: p.raisons, manque: p.manque, inconnu: p.inconnu, complete: p.complete, invalidation: p.invalidation ? { prix: r(p.invalidation.prix), quoi: p.invalidation.quoi } : null },
    regle: 'Tous les éléments sont calculés sur les bougies ' + an.nom + ' uniquement. Interprétation de l\'ICT : une description, jamais un ordre.', source: 'ict-v2'
  };
}

const sensFr = s => (s === 'haussiere' ? 'haussière' : s === 'baissiere' ? 'baissière' : 'indécise');
/* résumé déterministe de 3 à 5 phrases, qui commence par « En H1 : » (IA indisponible, alertes vocales) */
export function resumeIct(L) {
  if (!L || L.indisponible) return `En ${L && L.unite ? L.unite : 'cette unité'} : lecture ICT indisponible${L && L.indisponible ? ' (' + L.indisponible + ')' : ''}.`;
  const u = L.unite, S = [], t = L.tendance, d = t.derniereCassure;
  let s1 = `En ${u} : structure ${sensFr(t.sens)}`;
  if (d) s1 += `, dernière cassure ${d.type} ${d.sens} (${d.niveau} à ${fr(d.prix)}${d.avecDeplacement ? ', avec déplacement' : ', sans déplacement'})`;
  if (t.sens === 'haussiere' && t.itl != null) s1 += `, l'ITL ${u} ${fr(t.itl)} tient`; else if (t.sens === 'baissiere' && t.ith != null) s1 += `, l'ITH ${u} ${fr(t.ith)} tient`; else if (t.sens === 'indecise') s1 += ' : ' + t.pourquoi;
  S.push(s1 + '.');
  const liq = L.liquidites.filter(x => !x.balayee), au = liq.filter(x => x.distance >= 0)[0], sous = liq.filter(x => x.distance < 0).sort((x, y) => y.distance - x.distance)[0], pris = L.liquidites.filter(x => x.balayee).slice(-1)[0];
  const nomL = x => (NOM_SESSION[x.type] || x.type) + (/^(EQH|EQL)$/.test(x.type) ? ' ' + u : '');
  const fl = []; if (au) fl.push(`${nomL(au)} à ${fr(au.prix)} au-dessus`); if (sous) fl.push(`${nomL(sous)} à ${fr(sous.prix)} en dessous`);
  if (fl.length || pris) S.push('Liquidité : ' + (fl.length ? fl.join(' ; ') : 'aucun niveau actif proche') + (pris ? ` ; ${nomL(pris)} déjà balayé (${pris.typeBalayage === 'sweep' ? 'mèche puis retour' : 'cassé'})` : '') + '.');
  const z = L.pdArrays.slice().sort((x, y) => x.distance - y.distance)[0];
  if (z || L.premiumDiscount) { const parts = []; if (z) parts.push(`${z.type === 'OB' ? 'OB' : z.type === 'breaker' ? 'breaker' : 'FVG'}${z.fort ? ' fort' : ''} ${u} ${z.sens} ${fr(z.bas)} à ${fr(z.haut)}${z.dedans ? ' (le prix y est)' : ''}`); if (L.premiumDiscount) { const pc = L.premiumDiscount.pct; parts.push(pc > 100 ? `le prix est au-dessus du dealing range ${u} (extrême haut franchi)` : pc < 0 ? `le prix est sous le dealing range ${u} (extrême bas franchi)` : `le prix est en ${L.premiumDiscount.zone} du dealing range ${u} (${pc} %)`); } S.push('Zones : ' + parts.join(' ; ') + '.'); }
  const T = L.temps; if (T && (T.killzone || T.silverBullet)) S.push(`Temps : killzone ${T.killzone ? T.killzone.nom : '—'}${T.silverBullet ? ' (' + T.silverBullet.nom + ')' : ''} en cours.`);
  const P = L.penche, lit = P.sens === 'achat' ? 'penche à l\'achat' : P.sens === 'vente' ? 'penche à la vente' : 'reste neutre';
  let s5 = `La lecture ICT ${u} ${lit}`; if (P.sens !== 'neutre') { s5 += P.manque.length ? ` ; il manque : ${P.manque.slice(0, 3).join(", ")}` : ' ; les conditions mesurables sont réunies'; if (P.invalidation) s5 += ` ; invalidation ${P.sens === 'achat' ? 'sous' : 'au-dessus de'} ${fr(P.invalidation.prix)}`; } else s5 += ' : signaux partagés ou structure indécise';
  S.push(s5 + '. C\'est toi qui décides.');
  return S.slice(0, 5).join(' ');
}
export { nomUnite };

/* ── top-down : une rubrique par unité (de la plus haute à la plus basse), puis UNE phrase qui relie les unités ── */
const ORDRE = ['Daily', 'H4', 'H1', 'M15'], SENS_MOT = { haussiere: 'haussier', baissiere: 'baissier' };
export function resumeTopDown(lectures) {
  const L = (lectures || []).filter(Boolean).sort((a, b) => ORDRE.indexOf(a.unite) - ORDRE.indexOf(b.unite)), rub = L.map(l => ({ unite: l.unite, texte: resumeIct(l) }));
  const def = L.filter(l => !l.indisponible && l.tendance && SENS_MOT[l.tendance.sens]);
  let liaison;
  const sens = x => SENS_MOT[x.tendance.sens], cont = [];
  for (let i = 0; i + 1 < def.length; i++) if (sens(def[i]) !== sens(def[i + 1])) cont.push([def[i], def[i + 1]]);
  if (def.length < 2) liaison = 'Pas assez d\'unités lisibles pour relier les structures.';
  else if (!cont.length) liaison = `Les ${def.length} unités lisibles (${def.map(x => x.unite).join(', ')}) vont dans le même sens, ${sens(def[0])} : la lecture est cohérente de ${def[0].unite} à ${def[def.length - 1].unite}.`;
  else { const [h, b] = cont[0]; liaison = `Le ${h.unite} est ${sens(h)}, le ${b.unite} ${sens(b)} : ${sens(b) === 'haussier' ? 'un achat' : 'une vente'} en ${b.unite} irait contre la dynamique ${h.unite}.`; }
  const indec = L.filter(l => !l.indisponible && l.tendance && l.tendance.sens === 'indecise').map(l => l.unite); if (indec.length && def.length >= 2) liaison += ` (${indec.join(', ')} : structure indécise.)`;
  return { rubriques: rub, liaison, texte: rub.map(r => r.texte).join('\n') + '\n' + liaison };
}

/* ── « c'est un vrai order block ? » : la checklist en trois points, un par un, oui / non (order block le plus proche du prix) ── */
export function verdictOrderBlock(L) {
  if (!L || L.indisponible) return { ok: false, texte: `En ${L && L.unite ? L.unite : 'cette unité'} : lecture ICT indisponible.` };
  const u = L.unite, obs = (L.pdArrays || []).filter(z => z.type === 'OB').sort((a, b) => a.distance - b.distance), z = obs[0];
  if (!z) return { ok: false, texte: `En ${u} : aucun order block ${u} ouvert ; sans reversal candle qui clôture au-delà de la candidate et sans FVG sur elle ou juste après, il n'y a pas d'order block.` };
  const pts = [
    { point: 'Prise de liquidité (la candidate ou la bougie juste avant balaie un creux ou un sommet)', ok: !!z.liquidite },
    { point: 'Reversal candle qui CLÔTURE au-delà de la candidate (une mèche seule ne compte pas)', ok: true },
    { point: 'FVG sur la reversal candle ou juste après (sans FVG, pas d\'order block)', ok: true }
  ];
  const valide = pts[1].ok && pts[2].ok;
  const texte = `En ${u} : order block ${u} ${z.sens} ${fr(z.bas)} à ${fr(z.haut)} (${z.statut === 'frais' ? 'frais' : z.statut === 'teste' ? 'déjà testé' : z.statut}). ` + pts.map((p, i) => `${i + 1}) ${p.point.split(' (')[0]} : ${p.ok ? 'oui' : 'non'}`).join(' ; ') + `. ${valide ? 'Il est valide (points 2 et 3 réunis)' : 'Il n\'est pas valide'}${z.liquidite ? ', avec la prise de liquidité : c\'est la version la plus puissante' : ', sans prise de liquidité : valide mais moins puissant'} ; ${z.fort ? 'fort (le déplacement casse aussi un vrai sommet ou creux de structure)' : 'simple (la reversal candle casse seulement la candidate)'}. Piège des stops laissés derrière : ${z.stopsDerriere ? 'oui, une consolidation aux creux intacts attire le prix, qui peut venir la chasser avant de partir' : 'non'}.`;
  return { ok: true, points: pts, valide, ordreBlock: z, texte };
}
