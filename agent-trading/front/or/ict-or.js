/* ═════════════ ANALYSE ICT EN UN CLIC : colle (bouton collé au graphique, couches, rapport de la semaine, voix, registre forward, statistiques) ═════════════
   Calculs : ict-v1.js (scellé SHA-256) ; fréquences : ict-stats.json (Dukascopy, mesurées avec n et base). « Interprétation de l'ICT, définitions variables selon les sources. »
   Rayle décrit : jamais « achète » ni « vends ». Registre forward en ajout seul (rayle_or_ict_forward). */
import * as I from './ict-v1.js';
import * as V2 from './ict-v2.js';
import { lectureIct, resumeIct } from './ict-lecture.js';
const CLE_FWD = 'rayle_or_ict_forward', CLE_REG = 'rayle_or_ict_reglages', H = 3600e3;
/* v2 : cinq couches, toutes calculées sur l'UNITÉ du graphique (ict-v2). Le registre forward et les mesures restent ceux d'ict-v1 (H1 seulement). */
export const COUCHES_ICT = Object.freeze({ ictLiquidite: 'ICT · liquidité (EQH / EQL, PDH / PDL, sessions)', ictStructure: 'ICT · structure (ITH / ITL de l\'unité)', ictFvg: 'ICT · FVG / order blocks', ictPd: 'ICT · premium / discount (équilibre)', ictTemps: 'ICT · temps (killzones, minuit New York)' });
const NOM_KIND = { fvg: 'FVG', ifvg: 'FVG inversé', ob: 'Order block', breaker: 'Breaker' };
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));
const pc = x => (x == null ? '—' : Math.round(x * 100) + ' %');
const hp = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const hhmm = t => I.hhmmParis(t);
/* phrase de mesure honnête pour un élément (jamais un mot fort si la mesure ne dépasse pas le hasard) */
export function phraseMesureIct(stats, groupe, famille) {
  const X = stats && stats[groupe] && stats[groupe][famille]; if (!X) return 'mesure indisponible pour cet élément';
  const L = [];
  for (const [fen, nom] of [['long', '2015–2025'], ['recent', '18 derniers mois']]) {
    const x = X[fen]; if (!x) continue;
    if (groupe === 'zones') { if (!x.assez) { L.push(`${nom} : pas assez de données (${x.nTouches} retours, il en faut 30)`); continue; } L.push(`${nom} (${x.nTouches} retours) : la zone a tenu ${pc(x.taux)} des fois contre ${pc(x.base)} pour des zones au hasard de même largeur, ${x.distingue === 'mieux' ? 'mieux que le hasard' : x.distingue === 'moins bien' ? 'moins bien que le hasard' : 'pas de différence nette'}`); }
    else if (groupe === 'directionnels') { const h = x.h12; if (!x.assez || !h) { L.push(`${nom} : pas assez de données (${x.n} cas)`); continue; } L.push(`${nom} (${x.n} cas) : ${pc(h.part)} des issues tranchées vont dans le sens attendu contre ${pc(h.basePart)} pour la base, ${h.distingue === 'mieux' ? 'mieux que la base' : h.distingue === 'moins bien' ? 'moins bien que la base (le prix a plutôt continué)' : 'pas de différence nette'}`); }
    else { if (!x.assez) { L.push(`${nom} : pas assez de données`); continue; } L.push(`${nom} : étendue moyenne ${nb(x.moyenne, 2)} ATR contre ${nb(x.base, 2)} hors de la fenêtre${x.distingue === 'mieux' ? ' (plus agitée)' : x.distingue === 'moins bien' ? ' (plus calme)' : ''}`); }
  }
  return L.join(' ; ');
}
export function creerIct({ racine, moteur, graph, structure, parler = () => {}, maintenant = () => Date.now(), fetchFn = (...a) => fetch(...a), stats = null, auto = true } = {}) {
  const E = { stats, reg: { max: 8, ...lire(CLE_REG, {}) }, registre: lire(CLE_FWD, []), an: null, B: null, cle: '', rapport: null, vus: new Set(), pret: false, an2: null, cle2: '', legende: false };
  /* ict-v2 : bougies de l'unité affichée (moteur.serie()), closes seulement, ATR de cette unité ; jamais une autre unité */
  function analyser2() {
    const S = moteur.S, u = S.periode, ser = (moteur.serie ? moteur.serie() : []) || [], B = ser.slice(-1500), ms = (V2.UNITES[u] || {}).ms; if (!ms || B.length < 40) { E.an2 = null; E.cle2 = ''; return false; }
    const n = maintenant(), cle = `${u}|${B.length}|${B[B.length - 1].t}|${Math.floor(n / ms)}`; if (cle === E.cle2 && E.an2) { E.an2.prix = S.prix ?? E.an2.prix; return false; }
    E.cle2 = cle; E.an2 = V2.analyser(B, { unite: u, maintenant: n, prix: S.prix ?? null }); return true;
  }
  const lectureDe = (opts = {}) => { analyser2(); const an = E.an2; if (!an) return null; const a2 = opts.biais && !an.biaisDuJour ? { ...an, biaisDuJour: an._biais } : an; return lectureIct(a2, { actif: opts.actif ?? null, dec: opts.dec ?? 2 }); };
  const est = () => racine && racine.querySelector('[data-ict]');
  async function chargerStats() { if (E.stats) return; try { const r = await fetchFn(new URL('./ict-stats.json', import.meta.url).href, { cache: 'no-store' }); if (r.ok) E.stats = await r.json(); } catch (e) { /* sans les statistiques : « indisponibles » */ } }
  const couches = () => graph.couches(), actif = () => Object.keys(COUCHES_ICT).some(k => couches()[k]);
  function analyser() {
    const st = structure && structure.etat && structure.etat(), A = st && st.A; if (!A || !A.B || A.B.length < 150) return false;
    const B = A.B, cle = `${B.length}|${B[B.length - 1].t}`; if (cle === E.cle && E.an) return false; E.cle = cle; E.B = B; E.an = I.analyser(B, { periode: H }); return true;
  }
  function detail2(o, an) {
    const L = [], u = an.nom, ph = t => (t ? hp(t) : '—');
    if (o.kind === 'fvg' || o.kind === 'ifvg') L.push(`${nb(o.bas, 2)} à ${nb(o.haut, 2)} (milieu CE ${nb(o.ce, 2)}) · FVG ${u} ${o.dir > 0 ? 'haussier' : 'baissier'}${o.kind === 'ifvg' ? ' inversé' : ''} posé à la clôture du ${ph(o.tDebut)} (heure de Paris)`);
    else if (o.kind === 'ob') L.push(`${nb(o.bas, 2)} à ${nb(o.haut, 2)} · order block ${u} ${o.dir > 0 ? 'haussier' : 'baissier'}, ${o.fort ? 'fort (le déplacement casse aussi un sommet / creux de structure)' : 'simple'}`, `prise de liquidité : ${o.liquidite ? 'oui' : 'non'} · stops laissés derrière : ${o.stopsDerriere ? 'oui' : 'non'}`);
    else if (o.kind === 'breaker') L.push(`${nb(o.bas, 2)} à ${nb(o.haut, 2)} · breaker ${u} (order block cassé, devenu ${o.dir > 0 ? 'support' : 'résistance'})`);
    else if (o.kind === 'liquidite') L.push(`niveau ${nb(o.p, 2)} · ${o.nom} ${u} · formé le ${ph(o.tDebut)} · non balayé`);
    else if (o.kind === 'swing') L.push(`niveau ${nb(o.p, 2)} · ${o.nom} · swing de structure de l'unité, encore intact`);
    else if (o.kind === 'equilibre') L.push(`équilibre ${nb(o.p, 2)} du dealing range ${u}${o.haut != null ? ` (ITL ${nb(o.bas, 2)} → ITH ${nb(o.haut, 2)})` : ''}`, 'au-dessus de 50 % : premium ; au-dessous : discount');
    else if (o.kind === 'ouverture') L.push(`ouverture de minuit New York : ${nb(o.p, 2)}`);
    L.push(`calculé sur les bougies ${u} uniquement · interprétation de l'ICT, une description, jamais un ordre`); return L;
  }
  function modele() {
    analyser2(); const an = E.an2; if (!an || !an.ok) return null; const c = couches(), vue = { ...an, prix: moteur.S.prix ?? an.prix };
    const M = V2.modeleAffichage(vue, { max: Math.max(6, Math.min(16, E.reg.max + 4)), couches: { ictLiquidite: !!c.ictLiquidite, ictStructure: !!c.ictStructure, ictFvg: !!c.ictFvg, ictPd: !!c.ictPd, ictTemps: !!c.ictTemps } });
    const d = an.tendance.derniereCassure;
    return { badge: { ...M.badge, detail: [d ? `dernière cassure en clôture : ${d.type} (${d.niveau} à ${nb(d.prix, 2)})${d.deplacement ? ', avec déplacement' : ', sans déplacement'}` : 'aucune cassure d\'ITH / ITL dans la fenêtre', an.tendance.pourquoi, `ATR(14) ${an.nom} : ${nb(an.atr, 2)}`] },
      objets: M.objets.map(o => ({ ...o, detail: detail2(o, an) })), killzones: M.killzones.map(k => ({ ...k, heure: `${hhmm(k.debut)} – ${hhmm(k.fin)} (heure de Paris)` })), legende: M.legende, legendeOuverte: E.legende, unite: an.nom };
  }
  /* ── registre forward (ajout seul) : FVG, order blocks, balayages et manipulations nés dans les 3 dernières bougies, puis résultat à 6, 12 et 24 bougies ── */
  const issue = (B, i, dir, a, N) => { const ref = B[i].c, haut = ref + 1.5 * a, bas = ref - 1.5 * a; for (let k = i + 1; k <= Math.min(B.length - 1, i + N); k++) { const b = B[k], hit = dir > 0 ? b.h >= haut : b.l <= bas, adv = dir > 0 ? b.l <= bas : b.h >= haut; if (adv) return -1; if (hit) return 1; } return 0; };
  function registre() {
    const an = E.an, B = E.B; if (!an) return; const ev = [];
    for (const z of an.fvg) ev.push({ id: z.id, famille: `fvg_${z.dir > 0 ? 'haussier' : 'baissier'}`, dir: z.dir, i: z.i });
    for (const z of an.ob) ev.push({ id: z.id, famille: `order_block_${z.dir > 0 ? 'haussier' : 'baissier'}`, dir: z.dir, i: z.i });
    for (const l of an.liquidites) if (l.tSweep != null && ['PDH', 'PDL'].includes(l.nom)) { const i = B.findIndex(b => b.t === l.tSweep); if (i > 0) ev.push({ id: l.id + '|sweep', famille: `balayage_${l.nom}`, dir: l.cote === 'BSL' ? -1 : 1, i }); }
    for (const e of an.amd) if (e.manipulation) ev.push({ id: e.id, famille: 'judas_swing_londres', dir: e.manipulation.cote === 'haut' ? -1 : 1, i: e.manipulation.i });
    const A = atrArr(B);
    for (const e of ev) { if (B.length - 1 - e.i > 3 || E.registre.some(x => x.kind === 'evenement' && x.id === e.id) || !A[e.i]) continue; E.registre.push({ kind: 'evenement', id: e.id, famille: e.famille, dir: e.dir, t: B[e.i].t, ref: B[e.i].c, atr: A[e.i], notee: maintenant() }); }
    for (const e of E.registre.filter(x => x.kind === 'evenement')) { const i = B.findIndex(b => b.t === e.t); if (i < 0) continue; for (const h of [6, 12, 24]) { if (E.registre.some(x => x.kind === 'resultat' && x.id === e.id && x.h === h) || B.length - 1 < i + h) continue; E.registre.push({ kind: 'resultat', id: e.id, h, issue: issue(B, i, e.dir, e.atr, h), notee: maintenant() }); } }
    if (E.registre.length > 4000) E.registre.splice(0, E.registre.length - 4000); ecrire(CLE_FWD, E.registre);
  }
  function atrArr(B) { const o = new Array(B.length).fill(null); let s = 0; const tr = i => Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c)); for (let i = 1; i < B.length; i++) { s += tr(i); if (i > 14) s -= tr(i - 14); if (i >= 14) o[i] = s / 14; } return o; }
  /* ── bouton « Analyse ICT » : un clic calcule et dessine, un second clic efface ── */
  function basculer(v) {
    const on = v == null ? !actif() : !!v; const o = {}; for (const k of Object.keys(COUCHES_ICT)) o[k] = on; graph.couches(o);
    for (const c of racine.querySelectorAll('[data-couche]')) if (c.dataset.couche in COUCHES_ICT) c.checked = on;
    if (on) { analyser(); analyser2(); E.rapport = rapportV2(); } maj(true); return on;
  }
  /* rapport du panneau et résumé parlé : ict-v2, sur l'unité du graphique (même texte que l'outil `lecture_ict` de Rayle) */
  function rapportV2() { const L = lectureDe({ actif: null, dec: 2 }); if (!L) return { titre: 'Lecture ICT', lignes: ['Pas assez de bougies closes sur cette unité pour lire l\'ICT.'], texte: 'Pas assez de bougies closes sur cette unité pour lire l\'ICT.' }; const t = resumeIct(L); return { titre: `Lecture ICT ${L.unite || ''}`.trim(), lignes: t.split(/(?<=\.) /), texte: t, lecture: L }; }
  function maj(force = false) { const change = analyser() || force, ch2 = analyser2(); if (E.an && (change || force)) { if (!E.pret) { E.pret = true; } registre(); } if (!E.rapport || ch2 || force) E.rapport = rapportV2(); graph.ict(actif() ? modele() : null); majBouton(); rendre(); }
  function majBouton() { for (const b of racine.querySelectorAll('[data-a="ict-un-clic"]')) { b.classList.toggle('actif', actif()); b.setAttribute('aria-pressed', String(actif())); } }
  /* ── panneau : rapport de la semaine ── */
  function resumeStats() {
    const st = E.stats; if (!st) return 'Mesures : chargement…'; const dist = [];
    for (const g of ['zones', 'directionnels', 'killzones']) for (const f of Object.keys(st[g] || {})) for (const fen of ['recent', 'long']) { const x = st[g][f][fen]; if (!x) continue; if (g === 'directionnels') { for (const k of ['h6', 'h12', 'h24']) if (x[k] && x[k].distingue && x[k].distingue !== 'non') { dist.push(`${f} ${fen} ${x[k].distingue}`); break; } } else if (x.distingue && x.distingue !== 'non') dist.push(`${f} ${fen} ${x.distingue}`); }
    const nbBalayage = dist.filter(d => /^balayage_/.test(d) && /moins bien/.test(d)).length;
    return `Mesures (Dukascopy, calculées le ${st.calcule}, ${st.nEssais} essais, correction de Holm) : ${dist.length} résultats se distinguent du hasard ; parmi eux, après un balayage du plus haut / bas de la veille ou de la semaine le prix a plutôt CONTINUÉ que retourné (${nbBalayage} cas « moins bien que la base »), les killzones se distinguent par leur agitation (étendue des bougies), les zones (FVG, order blocks, breakers, OTE) ne se distinguent presque pas des zones tirées au hasard. Cette lecture ne sépare pas l'effet de la tendance du moment.`;
  }
  function rendre() {
    const el = est(); if (!el) return; const R = E.rapport;
    const L = el.querySelector('[data-ict-rapport]'); if (L) { if (R && actif()) { L.hidden = false; L.innerHTML = `<h3>${esc(R.titre)}</h3><ul>${R.lignes.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`; } else { L.hidden = true; L.innerHTML = ''; } }
    const st = el.querySelector('[data-ict-stats]'); if (st) st.textContent = moteur.S.periode === 'H1' ? resumeStats().replace(/^Mesures/, 'Mesures ict-v1 (H1 seulement)') : `Mesures : les statistiques mesurées (ict-stats.json) ne concernent que le H1 (ict-v1). Aucune mesure n'existe pour le ${V2.nomUnite(moteur.S.periode)} : les éléments affichés sont des descriptions, pas des taux de réussite.`;
    const sl = el.querySelector('[data-ict-max]'); if (sl) { sl.value = E.reg.max; const o = el.querySelector('[data-ict-max-val]'); if (o) o.textContent = String(E.reg.max); }
    const r = el.querySelector('[data-ict-reg]'); if (r) { const evs = E.registre.filter(x => x.kind === 'evenement'), res = E.registre.filter(x => x.kind === 'resultat'); r.textContent = `Registre forward : ${evs.length} événement${evs.length > 1 ? 's' : ''} noté${evs.length > 1 ? 's' : ''}, ${res.length} résultat${res.length > 1 ? 's' : ''} à 6, 12 ou 24 bougies (ajout seul, hors journal manuel).`; }
  }
  /* ── voix : « Analyse ICT de la semaine » ── */
  function parlerRapport() { analyser2(); E.rapport = rapportV2(); return E.rapport.texte; }
  const commande = texte => { const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' '); if (/analyse ict|ict de la semaine|rapport ict|efface l analyse ict|masque l analyse ict|ferme l analyse ict/.test(n)) { if (/efface|masque|ferme/.test(n)) { basculer(false); return 'J\'ai effacé l\'analyse ICT du graphique.'; } if (!actif()) basculer(true); else maj(true); return parlerRapport(); } return null; };
  const el0 = est(); if (el0) {
    el0.addEventListener('input', ev => { const s = ev.target.closest('[data-ict-max]'); if (s) { E.reg.max = +s.value; ecrire(CLE_REG, E.reg); maj(true); } });
    el0.addEventListener('click', ev => { const b = ev.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'ict-lire') { const t = parlerRapport(); try { parler(t); } catch (e) { /* */ } } else if (b.dataset.a === 'ict-legende') { E.legende = !E.legende; b.setAttribute('aria-pressed', String(E.legende)); maj(true); } });
  }
  for (const b of racine.querySelectorAll('[data-a="ict-un-clic"]')) b.addEventListener('click', () => { basculer(); });
  let minuterie = null; if (auto) { chargerStats().then(() => maj(true)); minuterie = setInterval(() => { try { if (actif()) maj(); } catch (e) { /* */ } }, 30000); }
  return { maj, basculer, commande, rapport: () => { analyser2(); return rapportV2(); }, rapportV1: () => { analyser(); return E.an ? I.rapport(E.an, { maintenant: maintenant() }) : null; }, lecture: lectureDe, analyse: () => { analyser2(); return E.an2; }, modele, unite: () => moteur.S.periode, parlerRapport, chargerStats, phraseMesure: (g, f) => phraseMesureIct(E.stats, g, f), actif, etat: () => ({ an: E.an, registre: E.registre.slice(), reg: E.reg, stats: E.stats, rapport: E.rapport }), injecter(stats) { E.stats = stats; }, detruire() { clearInterval(minuterie); } };
}
