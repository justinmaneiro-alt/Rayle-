/* ═════════════ OUTILS « ANALYSTE » DU CERVEAU DE RAYLE (v10) ═════════════
   manuel(sujet)       : fiche du manuel interne (manuel-rayle.md) : comment lire un outil de l'application, sans rien inventer.
   analyse_marche(a)   : TOUTES les données de la méthode d'analyse (Weekly → Daily → H4, structure, position, niveaux proches, volume, COT, annonces, risque), en un seul appel.
   marche_global()     : tour des actifs (une couleur et une phrase chacun), climat, les deux actifs les plus intéressants.
   lecture_graphique() : état du graphique ouvert dans le terminal (actif, unité, mode, indicateurs affichés, mes dessins, zone de prix visible).
   Rien n'est inventé : chaque valeur vient des calculs de l'application (mêmes fonctions que les fenêtres) ; une donnée absente est dite « indisponible ». Aucun ordre, aucune prévision certaine.
   Les fonctions de lecture existantes (prix_et_tendance, niveaux, carnet_et_volume, marches, mes_actifs, portefeuille_et_risque) sont réutilisées par `creerAnalyste`. */
import { ACTIFS, parId as ACTIF_PAR_ID } from '../commun/donnees.js';
import { sma, tendance, atr } from '../commun/analyse.js';
import { regime } from '../terminal/aides.js';

const arr = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);
let fiches = null;

/* ───── manuel : découpage en fiches, recherche par mots-clés ───── */
export function decouperManuel(texte) {
  return String(texte || '').split(/^## /m).slice(1).map(b => {
    const l = b.split('\n'), titre = l[0].trim(), corps = l.slice(1).join('\n').trim();
    const mk = (corps.match(/^Mots-clés:\s*(.+)$/m) || [, ''])[1], fe = (corps.match(/^Fenêtre:\s*(.+)$/m) || [, ''])[1];
    return { titre, motsCles: mk.split(',').map(s => s.trim()).filter(Boolean), fenetre: fe.trim(), corps };
  });
}
export function chercherFiches(F, sujet, norm, max = 2) {
  const n = ' ' + norm(sujet) + ' '; if (n.trim() === '') return [];
  const sc = F.map(f => {
    let s = 0; for (const kw of f.motsCles) { const k = norm(kw); if (k.length >= 3 && n.includes(' ' + k + ' ')) s += 10 + k.length; else if (k.length >= 3 && n.includes(k)) s += 3; }
    for (const w of norm(f.titre).split(' ')) if (w.length > 3 && n.includes(' ' + w)) s += 2;
    for (const w of n.trim().split(' ')) if (w.length > 4 && norm(f.corps).includes(w)) s += 0.3;
    return { f, s };
  }).filter(x => x.s >= 3).sort((a, b) => b.s - a.s);
  return sc.slice(0, max).map(x => x.f);
}

/* ───── structure de marché : sommets et creux locaux (k bougies de chaque côté) ───── */
export function structure(B, k = 3) {
  if (!B || B.length < 2 * k + 6) return null;
  const hauts = [], bas = [];
  for (let i = k; i < B.length - k; i++) {
    let h = true, l = true; for (let j = 1; j <= k; j++) { if (B[i].h <= B[i - j].h || B[i].h < B[i + j].h) h = false; if (B[i].l >= B[i - j].l || B[i].l > B[i + j].l) l = false; }
    if (h) hauts.push({ i, p: B[i].h, t: B[i].t }); if (l) bas.push({ i, p: B[i].l, t: B[i].t });
  }
  if (hauts.length < 2 || bas.length < 2) return { lecture: 'structure indéterminée (pas assez de sommets et de creux)', sens: 0 };
  const h2 = hauts.slice(-2), b2 = bas.slice(-2), ph = h2[1].p > h2[0].p, pb = b2[1].p > b2[0].p;
  const sens = ph && pb ? 1 : !ph && !pb ? -1 : 0;
  return { sens, lecture: sens > 0 ? 'plus hauts et plus bas hauts (structure haussière)' : sens < 0 ? 'plus hauts et plus bas plus bas (structure baissière)' : ph ? 'plus haut plus haut mais creux plus bas (structure mixte, élargissement)' : 'plus haut plus bas mais creux plus haut (compression, possible range)', dernierHaut: h2[1].p, avantDernierHaut: h2[0].p, dernierBas: b2[1].p, avantDernierBas: b2[0].p };
}
const semaines = J => { const m = new Map(); for (const b of J) { const d = new Date(b.t + 6 * 3600e3), jour = Math.floor((b.t + 6 * 3600e3) / 86400e3), cle = Math.floor((jour + 3) / 7); const w = m.get(cle); if (!w) m.set(cle, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }); else { w.h = Math.max(w.h, b.h); w.l = Math.min(w.l, b.l); w.c = b.c; } void d; } return [...m.values()]; };

/* position dans l'intervalle : 0 = bas, 1 = haut ; sous 0,5 = discount, au-dessus = premium */
export function premiumDiscount(prix, B) {
  if (!B || !B.length || !Number.isFinite(prix)) return null; const h = Math.max(...B.map(b => b.h)), l = Math.min(...B.map(b => b.l)); if (h <= l) return null;
  const p = (prix - l) / (h - l); return { pct: arr(p * 100, 0), zone: p > 0.55 ? 'premium (zone chère)' : p < 0.45 ? 'discount (zone bon marché)' : 'équilibre (autour de 50 %)', haut: h, bas: l };
}

export function creerAnalyste(R) {
  const { OUTILS, idActif, pro, dec, dateIso, sans, manque, norm } = R;
  const lecture = async (nom, args) => { try { return await OUTILS[nom](args); } catch (e) { return sans('erreur ' + nom + ' : ' + String((e && e.message) || e).slice(0, 100)); } };

  async function manuel({ sujet } = {}) {
    try {
      if (!fiches) { const r = await fetch(new URL('manuel-rayle.md', import.meta.url).href); if (!r.ok) throw new Error('HTTP ' + r.status); fiches = decouperManuel(await r.text()); }
    } catch (e) { return sans('manuel illisible (' + String((e && e.message) || e).slice(0, 80) + ')'); }
    const F = chercherFiches(fiches, sujet, norm);
    if (!F.length) return { introuvable: true, sujetsDuManuel: fiches.map(f => f.titre), consigne: 'Aucune fiche ne correspond : dis-le, propose les sujets du manuel proches, et n’invente rien.' };
    return { fiches: F.map(f => ({ titre: f.titre, fenetre: f.fenetre, texte: f.corps.replace(/^Mots-clés:.*$/m, '').replace(/^Fenêtre:.*$/m, '').trim().slice(0, 2600) })),
      consigne: 'Explique simplement avec ces fiches (pas d’invention au-delà). Mode « apprends-moi » : ouvre la fenêtre indiquée par « Fenêtre » avec ouvrir_fenetre, puis donne UN exemple tiré du graphique ou des données actuelles (appelle prix_et_tendance ou niveaux ou carnet_et_volume sur l’actif en cours, ou or par défaut).' };
  }

  async function uneUnite(B, J, u, id, prix) {
    const C = B.map(b => b.c), m200 = C.length >= 200 ? sma(C, 200).slice(-1)[0] : null, t = tendance(B);
    let reg = null; try { const r = regime(B, J, u); reg = { type: r.type, sens: r.sens, volatilite: r.vol }; } catch (e) { reg = null; }
    const a = atr(B, 14), av = Array.isArray(a) ? a[a.length - 1] : a;
    return { tendance: t.sens, regime: reg, ma200: arr(m200, dec(id)), positionMa200: m200 ? (prix > m200 ? 'au-dessus' : 'sous') : 'MA200 indisponible (moins de 200 bougies)', ecartMa200Pct: m200 ? arr((prix / m200 - 1) * 100) : null, structure: structure(B, u === 'H4' ? 3 : 2), atr: arr(av, dec(id)) };
  }

  /* ───── analyse_marche : tout ce qu'il faut pour la méthode, jamais une valeur inventée ───── */
  async function analyse_marche({ actif } = {}) {
    const id = idActif(actif); if (!id || !ACTIF_PAR_ID[id]) return manque(actif);
    let D; try { D = await pro(id); } catch (e) { return sans('données de ' + id + ' injoignables (' + String((e && e.message) || e).slice(0, 80) + ')'); }
    const prix = Number.isFinite(D.prix) ? D.prix : D.h4[D.h4.length - 1].c, S = {};
    const W = semaines(D.j), wc = W.map(b => b.c), tW = W.length > 8 ? tendance(W) : null, m50 = wc.length >= 50 ? sma(wc, 50).slice(-1)[0] : null;
    S.weekly = { tendance: tW ? tW.sens : 'indéterminée', structure: structure(W, 2), moyenne50Semaines: arr(m50, dec(id)), positionMoyenne50: m50 ? (prix > m50 ? 'au-dessus' : 'sous') : null, derniereBougie: W.length ? { ouverture: arr(W[W.length - 1].o, dec(id)), haut: arr(W[W.length - 1].h, dec(id)), bas: arr(W[W.length - 1].l, dec(id)) } : null };
    S.daily = await uneUnite(D.j, D.j, 'J', id, prix); S.h4 = await uneUnite(D.h4, D.j, 'H4', id, prix);
    const dd = premiumDiscount(prix, D.j.slice(-60)), dh = premiumDiscount(prix, D.h4.slice(-120));
    const [niv, vol, mar] = await Promise.all([lecture('niveaux', { actif: id }), lecture('carnet_et_volume', { actif: id }), lecture('marches', { actif: id })]);
    const L = []; if (!niv.indisponible) { for (const x of (niv.reperesIct || [])) if (x.prix != null) L.push({ nom: x.nom, p: x.prix }); if (niv.volume && !niv.volume.indisponible) { L.push({ nom: 'POC H4', p: niv.volume.pocH4 }, { nom: 'VAH H4', p: niv.volume.vah }, { nom: 'VAL H4', p: niv.volume.val }); } for (const x of (niv.mesNiveauxTraces || [])) if (x.prix != null) L.push({ nom: 'mon niveau tracé (' + x.type + ', ' + (x.unite || '?') + ')', p: x.prix }); for (const g of (niv.fvg || [])) { if (g.haut != null && g.bas != null) L.push({ nom: 'FVG ' + g.sens + ' (bas)', p: g.bas }, { nom: 'FVG ' + g.sens + ' (haut)', p: g.haut }); } }
    const valides = L.filter(x => Number.isFinite(x.p)), atrH4 = S.h4.atr, atrJ = S.daily.atr;
    const proche = (liste, n) => liste.slice(0, n).map(x => ({ niveau: x.nom, prix: arr(x.p, dec(id)), distancePct: arr((x.p / prix - 1) * 100), distanceEnAtrH4: atrH4 ? arr((x.p - prix) / atrH4, 1) : null }));
    S.position = { premiumDiscountDaily3Mois: dd, premiumDiscountH4: dh, auDessus: proche(valides.filter(x => x.p > prix).sort((a, b) => a.p - b.p), 4), enDessous: proche(valides.filter(x => x.p < prix).sort((a, b) => b.p - a.p), 4), niveauxMajeursSemaine: niv.bougiesWeekly || null };
    S.volumeEtFlux = vol; S.positionnementEtContexte = mar;
    let risque = null; try { risque = await Promise.race([OUTILS.portefeuille_et_risque(), new Promise(r => setTimeout(() => r(sans('risque : délai dépassé')), 7000))]); } catch (e) { risque = sans('risque illisible'); }
    S.monRisque = risque && !risque.indisponible ? { risque: risque.risque || null, portefeuille: risque.portefeuille || null } : risque;
    S.ancresPourLesScenarios = { prix: arr(prix, dec(id)), atrH4, atrJour: atrJ, regleInvalidation: 'invalidation = au-delà du niveau opposé le plus proche ; distances en ATR fournies ; ne cite que des prix présents dans cet objet', niveauSuperieurProche: S.position.auDessus[0] || null, niveauInferieurProche: S.position.enDessous[0] || null };
    return { actif: id, nom: ACTIF_PAR_ID[id].nom, prix: arr(prix, dec(id)), donneesDu: dateIso(D.t), source: D.source, ...S, methode: 'Contexte global (marche_global) → Weekly → Daily → H4 → où est le prix → volume et positionnement → scénario principal et alternatif (déclencheur, entrée possible, invalidation, objectifs, confiance faible/moyen/fort justifiée en une phrase) → vigilance.' };
  }

  /* ───── marche_global : tour d'horizon ───── */
  const COULEUR = s => (s >= 2 ? 'haussier' : s <= -2 ? 'baissier' : 'neutre');
  async function unActif(id) {
    let D; try { D = await pro(id); } catch (e) { return { actif: id, nom: ACTIF_PAR_ID[id].nom, couleur: 'indisponible', phrase: 'données injoignables', score: 0 }; }
    const prix = Number.isFinite(D.prix) ? D.prix : D.h4[D.h4.length - 1].c, tJ = tendance(D.j), tH = tendance(D.h4), mJ = D.j.length >= 200 ? sma(D.j.map(b => b.c), 200).slice(-1)[0] : null, sg = s => (s === 'haussière' ? 1 : s === 'baissière' ? -1 : 0);
    const posMa = mJ ? (prix > mJ ? 1 : -1) : 0, score = sg(tJ.sens) + sg(tH.sens) + posMa, veille = D.j.length > 1 ? D.j[D.j.length - 2].c : null;
    let reg = null; try { reg = regime(D.j, D.j, 'J'); } catch (e) { reg = null; }
    const align = sg(tJ.sens) === sg(tH.sens) && sg(tJ.sens) !== 0;
    return { actif: id, nom: ACTIF_PAR_ID[id].nom, couleur: COULEUR(score), score, prix: arr(prix, dec(id)), variationJourPct: veille ? arr((prix / veille - 1) * 100) : null, tendanceDaily: tJ.sens, tendanceH4: tH.sens, positionMa200Daily: mJ ? (prix > mJ ? 'au-dessus' : 'sous') : null, regimeDaily: reg ? reg.type : null, aligne: align,
      phrase: `${ACTIF_PAR_ID[id].nom} : Daily ${tJ.sens}, H4 ${tH.sens}` + (mJ ? `, prix ${prix > mJ ? 'au-dessus' : 'sous'} la MA200 Daily` : '') + (reg && reg.type ? `, marché en ${reg.type}` : ''), pertinence: Math.abs(score) + (align ? 1 : 0) + (reg && /tendance/i.test(reg.type || '') ? 1 : 0), donneesDu: dateIso(D.t) };
  }
  async function marche_global() {
    const ids = ['or', 'us100', 'us500', 'btc', 'sol', 'dxy'], liste = [];
    for (const id of ids) liste.push(await unActif(id));   // un à la fois : ménage la mémoire de la tablette
    for (const [id, nom] of [['petrole', 'Pétrole'], ['eurusd', 'EUR/USD']]) {
      const m = await lecture('mes_actifs', { actif: id, horizon: 'swing' });
      if (m && !m.indisponible && m.horizons) { const h = m.horizons[1] || m.horizons[0], sc = h.score100; liste.push({ actif: id, nom, couleur: sc >= 58 ? 'haussier' : sc < 42 ? 'baissier' : 'neutre', score: sc >= 58 ? 1 : sc < 42 ? -1 : 0, prix: m.prix, phrase: `${nom} : verdict « ${h.verdict} » à 1–6 mois (${sc}/100, confiance ${h.confiancePct} %)`, source: 'Mes actifs (calculé chaque jour)', pertinence: 0.5, donneesDu: m.prixDu }); }
      else liste.push({ actif: id, nom, couleur: 'indisponible', phrase: nom + ' : ' + ((m && m.indisponible) || 'indisponible'), score: 0, pertinence: 0 });
    }
    const g = id => liste.find(x => x.actif === id) || { score: 0 }, actions = (g('us100').score + g('us500').score) / 2, dollar = g('dxy').score;
    const climat = actions >= 1 && dollar <= 0 ? 'risk-on (actions américaines fortes, dollar pas haussier)' : actions <= -1 || dollar >= 2 ? 'risk-off (actions faibles ou dollar fort)' : 'mitigé (signaux partagés entre actions et dollar)';
    const mar = await lecture('marches', {});
    const top = liste.filter(x => x.couleur !== 'indisponible' && x.actif !== 'dxy').sort((a, b) => b.pertinence - a.pertinence).slice(0, 2).map(x => ({ actif: x.actif, nom: x.nom, couleur: x.couleur, pourquoi: x.phrase + (x.aligne ? ' (Daily et H4 alignés)' : '') }));
    return { actifs: liste.map(({ pertinence, ...x }) => x), climat: { lecture: climat, base: `score actions ${actions.toFixed(1)}, score dollar ${dollar}` }, lesDeuxPlusInteressants: top, annoncesEtActualites: mar, avertissement: 'Couleur = Daily + H4 + position par rapport à la MA200 Daily (simple, mesurée) ; ce n’est pas une prévision.', donneesDu: dateIso(Date.now()) };
  }

  /* ───── lecture_graphique : l'état réel du graphique ouvert ───── */
  const cadre = () => [...document.querySelectorAll('iframe')].find(f => { try { return f.contentWindow && /or\.html/.test(f.contentWindow.location.href); } catch (e) { return false; } }) || null;
  async function lecture_graphique() {
    const f = typeof document !== 'undefined' ? cadre() : null; if (!f) return { ouvert: false, note: 'le terminal n’est pas ouvert : ouvre-le avec ouvrir_fenetre (terminal) puis relis le graphique' };
    try {
      const D = f.contentDocument, W = f.contentWindow, g = W.__orPro && W.__orPro.graphe && W.__orPro.graphe(); if (!g) return { ouvert: true, pret: false, note: 'le graphique finit de se charger' };
      const sel = s => D.querySelector(s), txt = s => (sel(s) || {}).textContent || '';
      const periode = (sel('[data-periode][aria-pressed="true"]') || {}).getAttribute ? sel('[data-periode][aria-pressed="true"]').getAttribute('data-periode') : null;
      const mode = (sel('.tp-mode [data-mode][aria-pressed="true"]') || {}).getAttribute ? sel('.tp-mode [data-mode][aria-pressed="true"]').getAttribute('data-mode') : 'classique';
      const couches = [...D.querySelectorAll('[data-couche]')].filter(c => c.checked).map(c => c.getAttribute('data-couche'));
      const S = g.serie(), hote = g.conteneur(), h = hote ? hote.clientHeight : 0, bas = S && h ? S.coordinateToPrice(h) : null, haut = S ? S.coordinateToPrice(0) : null;
      if (!periode || !Number.isFinite(bas) || !Number.isFinite(haut)) return { ouvert: true, pret: false, note: 'le graphique finit de charger ses données : réessaie dans quelques secondes' };
      const titre = txt('.tor-titre b').trim(), cle = ({ or: 'OR', 'nasdaq 100': 'NASDAQ', 's&p 500': 'SP500', bitcoin: 'BTC', solana: 'SOL', 'eur/usd': 'EURUSD', dollar: 'DXY' })[norm(titre)] || null;
      let dessins = []; try { if (cle) { const { lireDessins } = await import('../terminal/dessins-stockage.js'); dessins = lireDessins(cle).filter(o => o && o.type).slice(0, 14).map(o => ({ type: o.type, unite: o.unite, prix: o.p != null ? arr(o.p, 2) : (o.p2 != null ? arr(o.p2, 2) : null) })); } } catch (e) { dessins = []; }
      let vol = null; try { vol = W.__tpVolume && W.__tpVolume.etat ? W.__tpVolume.etat() : null; } catch (e) { vol = null; }
      return { ouvert: true, pret: true, actif: titre || null, unite: periode, mode, indicateursAffiches: couches, zoneDePrixVisible: Number.isFinite(bas) && Number.isFinite(haut) ? { bas: arr(Math.min(bas, haut), 2), haut: arr(Math.max(bas, haut), 2) } : null, prix: txt('[data-or-prix]').trim() || null, mesDessins: dessins, annotationsDeRayle: D.querySelectorAll('.ra-annot').length,
        terminalVolume: vol ? { actif: vol.actif, charge: !!vol.charge } : null, lu: dateIso(Date.now()), conseil: 'Pour des chiffres précis (tendance, niveaux, volume), appelle aussi prix_et_tendance, niveaux, carnet_et_volume sur cet actif. Tu peux annoter avec annoter_graphique.' };
    } catch (e) { return sans('graphique illisible (' + String((e && e.message) || e).slice(0, 80) + ')'); }
  }
  return { outils: { manuel, analyse_marche, marche_global, lecture_graphique } };
}

const A_ENUM = ['or', 'us100', 'us500', 'btc', 'sol', 'dxy'];
export const DECLARATIONS_ANALYSTE = [
  { name: 'manuel', description: 'Manuel interne de Rayle : fiche précise sur UN outil ou UNE notion de l’application (MA200 et flèches, niveaux, Fibonacci, outil position, régime, alignement, annonces, statistiques des flèches, Volume Profile POC/VAH/VAL/HVN/LVN, POC nus, VWAP, footprint, delta, CVD, MFI, carnet, absorption/cassure/faux breakout, niveaux de réaction, PDH/PDL/PWH/PWL, premium/discount, FVG, order blocks, égaux hauts/bas, balayages, COT, macro, score de marché, volume net, calendrier, Couverture, Risque global, statistiques par setup, Mes actifs, Investissement, État des données). À appeler pour « explique-moi… », « c’est quoi… », « apprends-moi… », « comment lire… ».', parameters: { type: 'object', properties: { sujet: { type: 'string', description: 'la notion demandée, en français (ex. footprint, rapport COT, MA200, POC nus)' } }, required: ['sujet'] } },
  { name: 'analyse_marche', description: 'Toutes les données pour une ANALYSE COMPLÈTE ou des SCÉNARIOS sur un actif : Weekly, Daily et H4 (tendance, régime, MA200, structure de sommets et creux), premium/discount, niveaux proches avec distances, volume et flux, COT, annonces, mon risque, et des ancres pour les scénarios. Appelle-la pour « analyse complète », « scénarios sur… », « que penses-tu de… ». Ne cite que les prix présents dans le résultat.', parameters: { type: 'object', properties: { actif: { type: 'string', enum: A_ENUM } }, required: ['actif'] } },
  { name: 'marche_global', description: 'Tour de tous les actifs (or, Nasdaq 100, S&P 500, BTC, SOL, DXY, pétrole, EUR/USD) : une couleur (haussier, neutre, baissier) et une phrase chacun, le climat (risk-on / risk-off), les annonces, et les deux actifs les plus intéressants. Pour « le marché en global », « fais-moi le tour des marchés ». Ne prend aucun paramètre.' },
  { name: 'lecture_graphique', description: 'Lit l’état réel du graphique ouvert dans le terminal : actif, unité, mode, indicateurs affichés, mes dessins, zone de prix visible. Pour « qu’est-ce que tu vois sur le graphique ? ».' }
];
export const DECLARATION_ANNOTER = { name: 'annoter_graphique', description: 'Pose des marques temporaires signées « Rayle » sur le graphique du terminal (couche à part, jamais mélangée aux dessins de Justin) : niveau (ligne), zone (deux prix), flèche (haut/bas), étiquette. Les prix viennent UNIQUEMENT des outils de lecture. effacer=true supprime toutes les annotations (« efface tes annotations »). Au plus 8 marques.', parameters: { type: 'object', properties: { annotations: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['niveau', 'zone', 'fleche', 'etiquette'] }, prix: { type: 'number' }, prix2: { type: 'number', description: 'second prix pour une zone' }, sens: { type: 'string', enum: ['haut', 'bas'] }, texte: { type: 'string', description: 'étiquette courte' } }, required: ['type', 'prix'] } }, effacer: { type: 'boolean' } } } };
void ACTIFS;
