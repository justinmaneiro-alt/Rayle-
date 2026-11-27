/* ═════════════ ANALYSE ICT EN UN CLIC : colle (bouton collé au graphique, couches, rapport de la semaine, voix, registre forward, statistiques) ═════════════
   Calculs : ict-v1.js (scellé SHA-256) ; fréquences : ict-stats.json (Dukascopy, mesurées avec n et base). « Interprétation de l'ICT, définitions variables selon les sources. »
   Rayle décrit : jamais « achète » ni « vends ». Registre forward en ajout seul (rayle_or_ict_forward). */
import * as I from './ict-v1.js';
import * as V2 from './ict-v2.js';
import { lectureIct, resumeIct, resumeCarte } from './ict-lecture.js';
import { objetsIct, badgeIct, LEGENDE_ICT } from './ict-objets.js';
import { taillePolice } from './ict-etiquettes.js';
const CLE_FWD = 'rayle_or_ict_forward', CLE_REG = 'rayle_or_ict_reglages', H = 3600e3;
/* v2 : cinq couches, toutes calculées sur l'UNITÉ du graphique (ict-v2). Le registre forward et les mesures restent ceux d'ict-v1 (H1 seulement). */
export const COUCHES_ICT = Object.freeze({ ictLiquidite: 'ICT · liquidité (EQH / EQL, PDH / PDL, sessions)', ictStructure: 'ICT · structure (ITH / ITL de l\'unité)', ictFvg: 'ICT · FVG / order blocks', ictPd: 'ICT · premium / discount (équilibre)', ictTemps: 'ICT · temps (killzones, minuit New York)' });
const CLE_ETAT = 'rayle_ict_etat';   // global (pas de suffixe d'actif) : l'état de l'ICT revient après un rechargement, un changement d'unité ou d'actif
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
  const E = { stats, reg: { max: 8, ...lire(CLE_REG, {}) }, registre: lire(CLE_FWD, []), an: null, B: null, cle: '', rapport: null, vus: new Set(), pret: false, an2: null, cle2: '', legende: false, ui: null, bulle: null, pref: { actif: false, mode: 'essentiel', carte: true, legende: true, ...lire(CLE_ETAT, {}) } };
  /* ict-v2 : bougies de l'unité affichée (moteur.serie()), closes seulement, ATR de cette unité ; jamais une autre unité */
  function analyser2() {
    const S = moteur.S, u = S.periode, ser = (moteur.serie ? moteur.serie() : []) || [], B = ser.slice(-1500), ms = (V2.UNITES[u] || {}).ms; if (!ms || B.length < 40) { E.an2 = null; E.cle2 = ''; return false; }
    const n = maintenant(), cle = `${u}|${B.length}|${B[B.length - 1].t}|${Math.floor(n / ms)}`; if (cle === E.cle2 && E.an2) { E.an2.prix = S.prix ?? E.an2.prix; return false; }
    E.cle2 = cle; E.an2 = V2.analyser(B, { unite: u, maintenant: n, prix: S.prix ?? null }); return true;
  }
  const lectureDe = (opts = {}) => { analyser2(); const an = E.an2; if (!an) return null; const a2 = opts.biais && !an.biaisDuJour ? { ...an, biaisDuJour: an._biais } : an; return lectureIct(a2, { actif: opts.actif ?? null, dec: opts.dec ?? 2, mode: opts.mode || E.pref.mode, couches: couchesActives() }); };
  const est = () => racine && racine.querySelector('[data-ict]');
  async function chargerStats() { if (E.stats) return; try { const r = await fetchFn(new URL('./ict-stats.json', import.meta.url).href, { cache: 'no-store' }); if (r.ok) E.stats = await r.json(); } catch (e) { /* sans les statistiques : « indisponibles » */ } }
  const couches = () => graph.couches(), actif = () => Object.keys(COUCHES_ICT).some(k => couches()[k]);
  function analyser() {
    const st = structure && structure.etat && structure.etat(), A = st && st.A; if (!A || !A.B || A.B.length < 150) return false;
    const B = A.B, cle = `${B.length}|${B[B.length - 1].t}`; if (cle === E.cle && E.an) return false; E.cle = cle; E.B = B; E.an = I.analyser(B, { periode: H }); return true;
  }
  /* ───── modèle dessiné : la liste d'objets NOMMÉS d'ict-objets.js (la même que lit Rayle avec lecture_ict) ───── */
  const couchesActives = () => { const c = couches(); return { ictLiquidite: !!c.ictLiquidite, ictStructure: !!c.ictStructure, ictFvg: !!c.ictFvg, ictPd: !!c.ictPd, ictTemps: !!c.ictTemps }; };
  function modele() {
    analyser2(); const an = E.an2; if (!an || !an.ok) return null; const R = objetsIct(an, { mode: E.pref.mode, couches: couchesActives(), prix: moteur.S.prix ?? an.prix });
    return { objets: R.objets, pastilles: R.pastilles, mode: E.pref.mode, unite: an.nom, badge: badgeIct(an), legendeOuverte: E.pref.legende !== false };
  }
  /* ───── interface DOM par-dessus le graphique : badge, carte de résumé repliable, légende repliable, bulle d'un objet ───── */
  const fsEcran = () => taillePolice(typeof window !== 'undefined' ? window.innerWidth : 1200);
  function creerUI() {
    if (E.ui) return E.ui; const hote = graph.conteneur && graph.conteneur(); if (!hote || typeof document === 'undefined') return null;
    if (!document.querySelector('style[data-ict-css]')) { const st = document.createElement('style'); st.setAttribute('data-ict-css', ''); st.textContent = `.ict-ui{position:absolute;left:0;right:0;top:0;bottom:0;pointer-events:none;z-index:6;font-family:system-ui,'Segoe UI',sans-serif;color:#e8eef2}.ict-ui>*{position:absolute;pointer-events:auto}
.ict-badge{left:8px;top:8px;max-width:calc(100% - 130px);padding:5px 10px;border:2px solid var(--ict-c,#26a69a);border-radius:6px;background:rgba(8,12,16,.9);font-weight:700;cursor:pointer;line-height:1.3}
.ict-carte{left:8px;top:56px;max-width:min(560px,calc(100% - 130px));padding:7px 10px;border:1px solid rgba(160,175,185,.5);border-radius:6px;background:rgba(8,12,16,.9);line-height:1.35}.ict-carte b{display:block}.ict-carte[hidden]{display:none}
.ict-leg{left:8px;bottom:36px;max-width:min(330px,calc(100% - 16px));padding:7px 10px;border:1px solid rgba(160,175,185,.5);border-radius:6px;background:rgba(8,12,16,.92);line-height:1.5}.ict-leg summary{cursor:pointer;font-weight:700}.ict-leg i{display:inline-block;width:12px;height:9px;margin-right:6px;vertical-align:middle;border-radius:2px}
.ict-bulle{right:8px;top:48px;width:min(380px,calc(100% - 16px));max-height:70%;overflow:auto;padding:10px 12px;border:1px solid rgba(160,175,185,.6);border-radius:8px;background:rgba(8,12,16,.96);line-height:1.4;z-index:9}.ict-bulle h4{margin:0 0 4px;font-size:1.05em}.ict-bulle ul{margin:4px 0;padding-left:18px}.ict-bulle button{margin:4px 6px 0 0;padding:6px 10px;border:1px solid rgba(143,208,227,.6);border-radius:6px;background:rgba(143,208,227,.12);color:#e8eef2;font:inherit;cursor:pointer}
@media (max-width:599px){.ict-carte{max-width:calc(100% - 16px);top:50px}.ict-badge{max-width:calc(100% - 16px)}}`; document.head.appendChild(st); }
    const ui = document.createElement('div'); ui.className = 'ict-ui'; ui.innerHTML = '<div class="ict-badge" data-ict-badge role="button" tabindex="0" title="Replier ou déplier le résumé"></div><div class="ict-carte" data-ict-carte></div><details class="ict-leg" data-ict-leg><summary>Légende ICT</summary><div data-ict-leg-corps></div></details><div class="ict-bulle" data-ict-bulle hidden></div>';
    hote.appendChild(ui); E.ui = ui; window.addEventListener('resize', () => { try { rendreUI(); } catch (e) { /* */ } }); const q = s => ui.querySelector(s);
    q('[data-ict-badge]').addEventListener('click', () => { E.pref.carte = !(E.pref.carte !== false); sauverPref(); rendreUI(); });
    q('[data-ict-leg]').addEventListener('toggle', ev => { const o = ev.target.open; if (o !== (E.pref.legende !== false)) { E.pref.legende = o; sauverPref(); } });
    q('[data-ict-bulle]').addEventListener('click', ev => { const b = ev.target.closest('[data-ict-bulle-x],[data-ict-explique]'); if (!b) return; if (b.hasAttribute('data-ict-bulle-x')) fermerBulle(); else expliquer(E.bulle); });
    /* un clic ou un appui (sans glisser) sur un objet ouvre sa bulle */
    let bas = null; hote.addEventListener('pointerdown', ev => { bas = { x: ev.clientX, y: ev.clientY, t: Date.now() }; }, true);
    hote.addEventListener('pointerup', ev => { if (!bas || !actif()) { bas = null; return; } const d = Math.hypot(ev.clientX - bas.x, ev.clientY - bas.y); bas = null; if (d > 6 || ev.target.closest('.ict-ui>*')) return;
      const r = hote.getBoundingClientRect(), c = graph.ictCadreA && graph.ictCadreA(ev.clientX - r.left, ev.clientY - r.top); if (c && c.objet) ouvrirBulle(c.objet); else if (c && c.g) ouvrirBulle({ nom: c.g.texte, unite: E.an2 ? E.an2.nom : '', pourquoi: c.g.detail || [], statut: '' }); else fermerBulle(); }, true);
    return ui;
  }
  function ouvrirBulle(o) { const ui = creerUI(); if (!ui) return; E.bulle = o; const b = ui.querySelector('[data-ict-bulle]'), prix = o.niveaux ? o.niveaux.map(n => n.nom).join(' · ') : o.bas != null ? `${nb(o.bas, 2)} à ${nb(o.haut, 2)}` : o.p != null ? nb(o.p, 2) : '';
    b.innerHTML = `<h4>${esc(o.nom)}</h4><div>Unité : <b>${esc(o.unite || '')}</b>${prix ? ' · prix : ' + esc(prix) : ''}</div>${o.statut ? `<div>Statut : ${esc(o.statut)}</div>` : ''}<div><b>Pourquoi il est tracé :</b></div><ul>${(o.pourquoi || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul><div><button type="button" data-ict-explique>Rayle, explique</button><button type="button" data-ict-bulle-x>Fermer</button></div><small style="opacity:.7">Interprétation de l'ICT : une description, jamais un ordre.</small>`; b.hidden = false; b.style.fontSize = fsEcran() + 'px'; }
  function fermerBulle() { E.bulle = null; if (E.ui) E.ui.querySelector('[data-ict-bulle]').hidden = true; }
  /* « Rayle, explique » : la question part à Rayle comme si Justin l'avait écrite, avec l'objet et l'unité affichée */
  function expliquer(o) { if (!o) return false; const texte = `Rayle, explique-moi « ${o.nom} » sur le graphique ${o.unite || ''} : c'est quoi, pourquoi est-il tracé, et qu'est-ce que ça veut dire ?`; let envoye = false;
    for (const w of [typeof window !== 'undefined' ? window : null, typeof window !== 'undefined' && window.parent !== window ? window.parent : null]) { try { if (w && w.RayleBus && w.RayleBus.demander('rayle:demande', texte)) { envoye = true; break; } } catch (e) { /* page parente inaccessible */ } }
    try { window.dispatchEvent(new CustomEvent('rayle:ict-explique', { detail: { texte, objet: o.nom, unite: o.unite } })); } catch (e) { /* */ }
    E.derniereQuestion = texte; if (envoye) fermerBulle(); else if (E.ui) { const b = E.ui.querySelector('[data-ict-bulle]'); b.insertAdjacentHTML('beforeend', `<p>Ouvre Rayle pour poser la question : « ${esc(texte)} »</p>`); } return envoye; }
  function rendreUI() {
    const ui = actif() ? creerUI() : E.ui; if (!ui) return; const on = actif(), an = E.an2; ui.style.display = on && an && an.ok ? '' : 'none'; if (!on || !an || !an.ok) { fermerBulle(); return; }
    const fs = fsEcran(); ui.style.fontSize = fs + 'px'; try { const h = graph.conteneur(), r = h.getBoundingClientRect(); ui.style.bottom = 'auto'; ui.style.height = Math.max(160, Math.min(h.clientHeight, window.innerHeight - r.top - 6)) + 'px'; } catch (e) { /* */ } const bd = badgeIct(an), badge = ui.querySelector('[data-ict-badge]'); badge.textContent = bd.texte; badge.style.setProperty('--ict-c', bd.sens === 'haussiere' ? '#26a69a' : bd.sens === 'baissiere' ? '#ef5350' : '#9aa4ae');
    try { const lg = document.querySelector('.tp-ligne-boutons'), hr = graph.conteneur().getBoundingClientRect(); ui.querySelector('[data-ict-carte]').style.top = lg && lg.getBoundingClientRect().width ? Math.round(lg.getBoundingClientRect().bottom - hr.top + 6) + 'px' : ''; } catch (e) { /* */ }
    const carte = ui.querySelector('[data-ict-carte]'), L = lectureDe({ actif: null, mode: E.pref.mode }), C = L ? resumeCarte(L) : null; carte.hidden = E.pref.carte === false || !C; if (C) carte.innerHTML = `<b>${esc(C.titre)}</b>${C.lignes.map(l => esc(l)).join('<br>')}`;
    const leg = ui.querySelector('[data-ict-leg]'); leg.open = E.pref.legende !== false && fs >= 12; ui.querySelector('[data-ict-leg-corps]').innerHTML = LEGENDE_ICT.map(([k, t]) => `<div><i style="background:${k === 'haut' ? 'rgba(38,166,154,.8)' : k === 'bas' ? 'rgba(239,83,80,.8)' : k === 'ligne' ? '#e6e9ee' : k === 'prise' ? '#9aa4ae' : k === 'struct' ? 'rgba(38,166,154,.8)' : '#a9b4c0'}"></i>${esc(t)}</div>`).join('');
  }
  function sauverPref() { ecrire(CLE_ETAT, E.pref); }
  function marge() { try { const ts = graph.chart().timeScale(), o = ts.options(); if (actif()) { if (E.rightAvant == null) E.rightAvant = o.rightOffset; if (o.rightOffset < 18) ts.applyOptions({ rightOffset: 22 }); } else if (E.rightAvant != null) { ts.applyOptions({ rightOffset: E.rightAvant }); E.rightAvant = null; } } catch (e) { /* graphique pas prêt */ } }
  const evenement = () => { try { window.dispatchEvent(new CustomEvent('rayle:ict-etat', { detail: { actif: actif(), mode: E.pref.mode } })); } catch (e) { /* */ } };
  /* réglage Essentiel / Complet */
  function regler(mode) { if (mode !== 'essentiel' && mode !== 'complet') return E.pref.mode; E.pref.mode = mode; sauverPref(); maj(true); evenement(); return mode; }
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
    E.pref.actif = on; sauverPref(); if (on) { analyser(); analyser2(); E.rapport = rapportV2(); } maj(true); evenement(); return on;
  }
  /* rapport du panneau et résumé parlé : ict-v2, sur l'unité du graphique (même texte que l'outil `lecture_ict` de Rayle) */
  function rapportV2() { const L = lectureDe({ actif: null, dec: 2 }); if (!L) return { titre: 'Lecture ICT', lignes: ['Pas assez de bougies closes sur cette unité pour lire l\'ICT.'], texte: 'Pas assez de bougies closes sur cette unité pour lire l\'ICT.' }; const t = resumeIct(L); return { titre: `Lecture ICT ${L.unite || ''}`.trim(), lignes: t.split(/(?<=\.) /), texte: t, lecture: L }; }
  function maj(force = false) { const change = analyser() || force, ch2 = analyser2(); if (E.an && (change || force)) { if (!E.pret) { E.pret = true; } registre(); } if (!E.rapport || ch2 || force) E.rapport = rapportV2(); graph.ict(actif() ? modele() : null); marge(); rendreUI(); majBouton(); rendre(); }
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
  const commande = texte => { const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ');
    if (/\bict (complet|essentiel)\b/.test(n)) { const m = /complet/.test(n) ? 'complet' : 'essentiel'; if (!actif()) basculer(true); regler(m); return `ICT ${m}.`; }
    if (/\b(cache|masque|efface|desactive) (l )?ict\b/.test(n)) { basculer(false); return 'J\'ai caché l\'ICT.'; }
    if (/\b(affiche|montre|active|mets) (l )?ict\b/.test(n)) { basculer(true); return `ICT affiché en ${E.pref.mode}.`; } if (/analyse ict|ict de la semaine|rapport ict|efface l analyse ict|masque l analyse ict|ferme l analyse ict/.test(n)) { if (/efface|masque|ferme/.test(n)) { basculer(false); return 'J\'ai effacé l\'analyse ICT du graphique.'; } if (!actif()) basculer(true); else maj(true); return parlerRapport(); } return null; };
  const el0 = est(); if (el0) {
    el0.addEventListener('input', ev => { const s = ev.target.closest('[data-ict-max]'); if (s) { E.reg.max = +s.value; ecrire(CLE_REG, E.reg); maj(true); } });
    el0.addEventListener('click', ev => { const b = ev.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'ict-lire') { const t = parlerRapport(); try { parler(t); } catch (e) { /* */ } } else if (b.dataset.a === 'ict-legende') { E.pref.legende = !(E.pref.legende !== false); E.legende = E.pref.legende; sauverPref(); b.setAttribute('aria-pressed', String(E.legende)); rendreUI(); } });
  }
  for (const b of racine.querySelectorAll('[data-a="ict-un-clic"]')) b.addEventListener('click', () => { basculer(); });
  if (E.pref.actif && !actif()) { try { const o = {}; for (const k of Object.keys(COUCHES_ICT)) o[k] = true; graph.couches(o); for (const c of racine.querySelectorAll('[data-couche]')) if (c.dataset.couche in COUCHES_ICT) c.checked = true; } catch (e) { /* graphique pas prêt */ } }
  let minuterie = null; if (auto) { chargerStats().then(() => maj(true)); minuterie = setInterval(() => { try { if (actif()) maj(); } catch (e) { /* */ } }, 30000); }
  return { maj, basculer, commande, rapport: () => { analyser2(); return rapportV2(); }, rapportV1: () => { analyser(); return E.an ? I.rapport(E.an, { maintenant: maintenant() }) : null; }, lecture: lectureDe, reaffirmer() { if (E.pref.actif && !actif()) { try { const o = {}; for (const k of Object.keys(COUCHES_ICT)) o[k] = true; graph.couches(o); for (const c of racine.querySelectorAll('[data-couche]')) if (c.dataset.couche in COUCHES_ICT) c.checked = true; } catch (e) { /* */ } } maj(true); }, activer: basculer, mode: regler, etatIct: () => ({ actif: actif(), mode: E.pref.mode, carte: E.pref.carte !== false, legende: E.pref.legende !== false }), ouvrirBulle, bulle: () => E.bulle, expliquer, derniereQuestion: () => E.derniereQuestion || null, analyse: () => { analyser2(); return E.an2; }, modele, unite: () => moteur.S.periode, parlerRapport, chargerStats, phraseMesure: (g, f) => phraseMesureIct(E.stats, g, f), actif, etat: () => ({ an: E.an, registre: E.registre.slice(), reg: E.reg, stats: E.stats, rapport: E.rapport }), injecter(stats) { E.stats = stats; }, detruire() { clearInterval(minuterie); } };
}
