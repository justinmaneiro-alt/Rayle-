/* ═════════════ SCÉNARIOS A ET B DE RAYLE (pur, testé) ═════════════
   Source : ict-v2.js (une seule unité), la même analyse que `lecture_ict` et que la liste d'objets d'ict-objets.js.
   Rayle propose DEUX scénarios au plus pour l'unité affichée :
   · A, le principal, dans le sens de la lecture : le prix va vers la zone de réaction la plus proche (FVG, OB, OB fort, breaker, OTE…), y réagit, puis part vers la liquidité visée ;
   · B, l'alternatif, dans l'autre sens : le prix est repoussé par la zone opposée, puis part vers l'autre liquidité.
   Lecture neutre : A et B sont quand même proposés, tous deux gris, avec « ? ».
   Un scénario a TOUJOURS une zone, une cible et une invalidation ; jamais de flèche vers une liquidité déjà prise ; il disparaît quand il est invalidé.
   Rayle décrit, Justin décide : jamais « achète » ni « vends », jamais un ordre. */
import { porteeLiquidite } from './ict-v2.js';

export const MAX_SCENARIOS = 2;
const NOM_LIQ = { EQH: 'EQH', EQL: 'EQL', PDH: 'PDH', PDL: 'PDL', PWH: 'PWH', PWL: 'PWL', ASIE_H: 'Asie H', ASIE_B: 'Asie B', LDN_H: 'LDN H', LDN_B: 'LDN B', ITH: 'ITH', ITL: 'ITL', LTH: 'LTH', LTL: 'LTL' };
const px = x => (Number.isFinite(x) ? Number(x).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/[  ]/g, ' ') : '—');

/* liquidité visée : la plus proche non prise au-delà de la zone, de préférence externe ; jamais une liquidité déjà balayée */
export function cibleLiquidite(an, cote, depart) {
  const haut = cote === 'BSL', C = [];
  for (const x of an.liquidites || []) if (!x.balayee && x.cote === cote && (haut ? x.p > depart : x.p < depart)) C.push({ type: x.type, cote, p: x.p });
  const st = an.structure; if (st) for (const [L, type, c] of [[st.ITH, 'ITH', 'BSL'], [st.ITL, 'ITL', 'SSL']]) if (c === cote) { const x = [...(L || [])].reverse().find(y => !y.cassee); if (x && (haut ? x.p > depart : x.p < depart) && !C.some(q => Math.abs(q.p - x.p) < 1e-9)) C.push({ type, cote, p: x.p }); }
  const pris = (an.liquidites || []).filter(x => x.balayee).map(x => x.p);
  const libres = C.filter(q => !pris.some(p => Math.abs(p - q.p) < 1e-9)).sort((a, b) => Math.abs(a.p - depart) - Math.abs(b.p - depart));
  const c = libres.find(q => porteeLiquidite(an, q) === 'externe') || libres[0] || null;
  if (!c) return null; const portee = porteeLiquidite(an, c); return { ...c, portee, nom: `${cote} ${portee} · ${NOM_LIQ[c.type] || c.type} ${px(c.p)}`, court: `${NOM_LIQ[c.type] || c.type} · ${cote}` };
}

const nomZone = z => (z.type === 'OB' ? `order block${z.fort ? ' fort' : ''}` : z.type === 'breaker' ? 'breaker' : z.type === 'OTE' ? 'OTE' : 'FVG');
/* zone de réaction : la plus proche, du bon côté du prix (support sous le prix pour un rebond, résistance au-dessus pour un rejet), jamais déjà traversée en clôture */
export function zoneReaction(an, dir, prix) {
  const Z = (an.pdArrays || []).filter(z => z.actif && !z.inverse && (z.dir > 0 ? 1 : -1) === dir && (dir > 0 ? z.bas <= prix && prix >= z.bas : z.haut >= prix && prix <= z.haut)).sort((a, b) => a.distance - b.distance);
  const z = Z[0];
  if (z) return { type: z.type, bas: z.bas, haut: z.haut, id: z.id, fort: !!z.fort, nom: `${nomZone(z)} ${dir > 0 ? 'haussier' : 'baissier'} ${px(z.bas)} à ${px(z.haut)}`, court: z.type === 'OB' ? (z.fort ? 'OB fort' : 'OB') : z.type === 'breaker' ? 'BRK' : 'FVG' };
  const pd = an.premiumDiscount, o = pd && (dir > 0 ? pd.oteAchat : pd.oteVente);   // à défaut : la zone OTE du dealing range, si elle est du bon côté du prix
  if (o && (dir > 0 ? o.haut <= prix : o.bas >= prix)) return { type: 'OTE', bas: o.bas, haut: o.haut, id: 'ote', fort: false, nom: `OTE ${dir > 0 ? 'haussier' : 'baissier'} ${px(o.bas)} à ${px(o.haut)}`, court: 'OTE' };
  return null;
}

function construire(an, dir, prix, { lettre, gris }) {
  const zone = zoneReaction(an, dir, prix); if (!zone) return null;
  const cible = cibleLiquidite(an, dir > 0 ? 'BSL' : 'SSL', dir > 0 ? Math.max(prix, zone.haut) : Math.min(prix, zone.bas)); if (!cible) return null;
  const inval = dir > 0 ? zone.bas : zone.haut; if (dir > 0 ? prix < inval : prix > inval) return null;   // déjà invalidé : le scénario disparaît
  const role = dir > 0 ? 'rebond' : 'rejet', u = an.nom, texteInval = `clôture ${dir > 0 ? 'sous' : 'au-dessus de'} ${px(inval)}`;
  return { id: lettre, lettre, dir, role, gris: !!gris, court: gris ? `${lettre} · ?` : `${lettre} · ${role}`, unite: u,
    zone, cible: { p: cible.p, nom: cible.nom, court: cible.court, cote: cible.cote, type: cible.type, portee: cible.portee }, invalidation: { prix: inval, texte: texteInval },
    nom: `Scénario ${lettre} · ${u} : ${dir > 0 ? 'rebond sur' : 'rejet par'} ${zone.nom}, puis ${cible.nom}`,
    bulle: [`Zone de ${role} : ${zone.nom}`, `Cible : ${cible.nom}`, `Invalidation : ${texteInval}`, 'Une possibilité, pas une prévision.'],
    voix: `Scénario ${lettre} en ${u} : le prix ${dir > 0 ? 'revient dans' : 'monte vers'} ${zone.nom}, ${dir > 0 ? 'y rebondit' : 'y est rejeté'}, puis va chercher ${cible.nom}. Invalidation : ${texteInval}. Une possibilité, pas une prévision.` };
}

/* an : résultat d'ict-v2.analyser ; prix : dernier prix (par défaut an.prix). Renvoie { sens, scenarios: [A, B?] } (deux au plus) */
export function scenariosIct(an, { prix = null } = {}) {
  if (!an || !an.ok) return { sens: 'neutre', scenarios: [] };
  const p0 = Number.isFinite(prix) ? prix : an.prix, sens = an.penche ? an.penche.sens : 'neutre', neutre = sens === 'neutre', dA = sens === 'vente' ? -1 : 1, S = [];
  const A = construire(an, dA, p0, { lettre: 'A', gris: neutre }), B = construire(an, -dA, p0, { lettre: 'B', gris: neutre });
  if (A) S.push(A); if (B) S.push(B);
  return { sens, neutre, scenarios: S.slice(0, MAX_SCENARIOS) };
}

/* deux lignes pour la carte ⓘ */
export function resumeScenarios(R) {
  const L = (R && R.scenarios) || []; return L.map(s => `${s.lettre}${s.gris ? ' (neutre)' : ''} : ${s.dir > 0 ? 'rebond' : 'rejet'} sur ${s.zone.court} ${px(s.zone.bas)} – ${px(s.zone.haut)}, puis ${s.cible.court} ${px(s.cible.p)} ; invalidation ${s.invalidation.texte}.`);
}
/* phrase lue à voix haute pour « Rayle, quels scénarios ? » */
export function voixScenarios(R, unite = '') {
  const L = (R && R.scenarios) || []; if (!L.length) return `En ${unite || 'cette unité'}, je n'ai pas de scénario clair : aucune zone de réaction ou aucune liquidité à viser. C'est toi qui décides.`;
  return L.map(s => s.voix).join(' ') + (R.neutre ? ' La lecture est neutre : les deux se valent.' : '') + ' C\'est toi qui décides.';
}
