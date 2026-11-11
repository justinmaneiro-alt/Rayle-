/* ═════════════ ANALYSE ICT EN UN CLIC : colle (bouton collé au graphique, couches, rapport de la semaine, voix, registre forward, statistiques) ═════════════
   Calculs : ict-v1.js (scellé SHA-256) ; fréquences : ict-stats.json (Dukascopy, mesurées avec n et base). « Interprétation de l'ICT, définitions variables selon les sources. »
   Rayle décrit : jamais « achète » ni « vends ». Registre forward en ajout seul (rayle_or_ict_forward). */
import * as I from './ict-v1.js';
const CLE_FWD = 'rayle_or_ict_forward', CLE_REG = 'rayle_or_ict_reglages', H = 3600e3;
export const COUCHES_ICT = Object.freeze({ ictLiquidite: 'ICT · liquidité (BSL / SSL, PDH / PDL, sessions)', ictStructure: 'ICT · structure (MSS, BOS, déplacements)', ictFvg: 'ICT · FVG (et FVG inversés, écarts d\'ouverture)', ictOb: 'ICT · order blocks et breakers', ictPd: 'ICT · premium / discount et zone OTE', ictTemps: 'ICT · temps (killzones, ouvertures de minuit et de 8h30 NY)', ictAmd: 'ICT · AMD / Judas swing' });
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
const FAM_ZONE = e => (e.kind === 'fvg' ? `fvg_${e.dir > 0 ? 'haussier' : 'baissier'}` : e.kind === 'ob' ? `order_block_${e.dir > 0 ? 'haussier' : 'baissier'}` : e.kind === 'breaker' ? `breaker_${e.dir > 0 ? 'haussier' : 'baissier'}` : e.kind === 'ote' ? `ote_${e.dir > 0 ? 'haussier' : 'baissier'}` : null);
export function creerIct({ racine, moteur, graph, structure, parler = () => {}, maintenant = () => Date.now(), fetchFn = (...a) => fetch(...a), stats = null, auto = true } = {}) {
  const E = { stats, reg: { max: 8, ...lire(CLE_REG, {}) }, registre: lire(CLE_FWD, []), an: null, B: null, cle: '', rapport: null, vus: new Set(), pret: false };
  const est = () => racine && racine.querySelector('[data-ict]');
  async function chargerStats() { if (E.stats) return; try { const r = await fetchFn(new URL('./ict-stats.json', import.meta.url).href, { cache: 'no-store' }); if (r.ok) E.stats = await r.json(); } catch (e) { /* sans les statistiques : « indisponibles » */ } }
  const couches = () => graph.couches(), actif = () => Object.keys(COUCHES_ICT).some(k => couches()[k]);
  function analyser() {
    const st = structure && structure.etat && structure.etat(), A = st && st.A; if (!A || !A.B || A.B.length < 150) return false;
    const B = A.B, cle = `${B.length}|${B[B.length - 1].t}`; if (cle === E.cle && E.an) return false; E.cle = cle; E.B = B; E.an = I.analyser(B, { periode: H }); return true;
  }
  function detail(o) {
    const L = []; const b = o.brut;
    if (o.kind === 'fvg' || o.kind === 'ifvg') L.push(`${nb(b.bas, 2)} à ${nb(b.haut, 2)} · posé à la clôture du ${hp(b.tCloture)} (heure de Paris)`, o.kind === 'ifvg' ? `devenu zone inversée le ${hp(b.tInverse)} : une clôture H1 a traversé le trou` : o.statut === 'rempli' ? `rempli le ${hp(b.tRempli)}` : o.statut === 'partiel' ? `partiellement rempli depuis le ${hp(b.tPartiel)}` : 'non rempli');
    else if (o.kind === 'ob') L.push(`${nb(b.bas, 2)} à ${nb(b.haut, 2)} · bougie du ${hp(b.tOb)} · déplacement confirmé à la clôture du ${hp(b.tCloture)}`, b.statut === 'invalide' ? `invalidé le ${hp(b.tInval)} (clôture au-delà) : il devient un breaker` : 'actif', b.tTouche ? `déjà retouché le ${hp(b.tTouche)}` : 'jamais retouché');
    else if (o.kind === 'breaker') L.push(`${nb(o.bas, 2)} à ${nb(o.haut, 2)} · issu d'un order block invalidé le ${hp(o.tDebut - H)}`);
    else if (o.kind === 'liquidite') L.push(`niveau ${nb(b.p, 2)} · formé le ${hp(b.tForm)} · ${b.tSweep ? 'balayé le ' + hp(b.tSweep) : 'non balayé'}`);
    else if (o.kind === 'ote') L.push(`${nb(o.bas, 2)} à ${nb(o.haut, 2)} · retracement de 62 % à 79 % de la plage des 5 jours, ${b.ote ? b.ote.sens : ''}`);
    else if (o.kind === 'ecart') L.push(`${nb(o.bas, 2)} à ${nb(o.haut, 2)} · écart d'ouverture de ${b.portee} de ${nb(b.taille, 2)} $`);
    const fam = FAM_ZONE(o) || (o.kind === 'liquidite' && ['PDH', 'PDL', 'PWH', 'PWL'].includes(b.nom) ? `balayage_${b.nom}` : null);
    if (fam) L.push('mesure : ' + phraseMesureIct(E.stats, FAM_ZONE(o) ? 'zones' : 'directionnels', fam)); L.push('interprétation de l\'ICT, définitions variables selon les sources ; une description, jamais un ordre'); return L;
  }
  function modele() {
    const an = E.an; if (!an) return null; const c = couches(), B = E.B, prix = moteur.S.prix ?? an.prix, o = I.objetsVisibles(an, { max: E.reg.max, prix });
    const ok = x => (x.kind === 'liquidite' && c.ictLiquidite) || ((x.kind === 'fvg' || x.kind === 'ifvg' || x.kind === 'ecart') && c.ictFvg) || ((x.kind === 'ob' || x.kind === 'breaker') && c.ictOb) || (x.kind === 'ote' && c.ictPd);
    const objets = o.filter(ok).map(x => ({ ...x, detail: detail(x), etiquette: x.kind === 'liquidite' ? x.nom : x.nom }));
    const m = { objets, killzones: [], ouvertures: [], structure: [], deplacements: [], amd: [], pd: null };
    if (c.ictTemps) { m.killzones = an.temps.killzones.map(k => ({ ...k, heure: `${hhmm(k.debut)} – ${hhmm(k.fin)} (heure de Paris)` })); for (const x of an.temps.ouvertures) { const fin = x.minuit + 24 * H; if (x.prixMinuit != null) m.ouvertures.push({ t: x.minuit, tFin: x.minuit + 24 * H, p: x.prixMinuit, nom: 'Minuit NY', detail: `ouverture de minuit New York du ${x.jour}, à ${hhmm(x.minuit)} (heure de Paris)` }); if (x.prixHuit30 != null) m.ouvertures.push({ t: x.huit30, tFin: fin, p: x.prixHuit30, nom: '8h30 NY', detail: `ouverture de 8h30 New York du ${x.jour}, à ${hhmm(x.huit30)} (heure de Paris), prix interpolé dans la bougie H1` }); } }
    if (c.ictPd) m.pd = { equilibre: an.pd.equilibre, haut: an.pd.haut, bas: an.pd.bas, tDebut: an.tDebut, g: { p: an.pd.equilibre, texte: `Équilibre ${nb(an.pd.equilibre, 2)} · ${an.pd.cote}`, detail: [`plage des 5 derniers jours : ${nb(an.pd.bas, 2)} à ${nb(an.pd.haut, 2)}`, `prix à ${pc(an.pd.position)} de la plage`, 'au-dessus de 50 % : premium ; au-dessous : discount'] } };
    if (c.ictStructure) { const SB = [...an.mss.map(e => ({ ...e, type: 'MSS' })), ...an.bos.map(e => ({ ...e, type: 'BOS' }))].slice(-10);
      m.structure = SB.map(e => { const i = B.findIndex(b => b.t === e.t), tN = e.tNiveau ?? B[Math.max(0, (i < 0 ? B.length - 1 : i) - 12)].t; return { type: e.type, dir: e.dir, t: e.t, tNiveau: tN, niveau: e.niveau, g: { p: e.niveau, texte: `${e.type} ${e.dir > 0 ? 'haussier' : 'baissier'} · ${hp(e.tCloture ?? e.t)}`, detail: ['MSS = changement de caractère, BOS = cassure de structure (structure-marche-v1)', `niveau ${nb(e.niveau, 2)}`] } }; });
      m.deplacements = an.deplacements.slice(-12).map(d => { const b = B[d.i]; return { t: d.t, p: d.dir > 0 ? b.l : b.h, dir: d.dir, g: { p: b.c, texte: `Déplacement ${d.dir > 0 ? 'haussier' : 'baissier'} · ${nb(d.taille, 1)} ATR`, detail: ['corps ≥ 1,5 ATR, mèches ≤ 25 % de l\'étendue', `posé à la clôture du ${hp(d.tCloture)}`] } }; }); }
    if (c.ictAmd) m.amd = an.amd.filter(e => e.manipulation || e.statut !== 'accumulation').map(e => ({ ...e, etiquette: e.manipulation ? `AMD ${e.sens === 'judas' ? '(Judas)' : e.sens === 'continuation' ? '(continuation)' : ''}`.trim() : null, g: { p: (e.accumulation.h + e.accumulation.l) / 2, texte: `AMD du ${e.jour}`, detail: descriptionAmd(e) } }));
    return m;
  }
  function descriptionAmd(e) {
    const L = [`accumulation : plage asiatique ${nb(e.accumulation.l, 2)}–${nb(e.accumulation.h, 2)} (20h–00h New York)`];
    L.push(e.manipulation ? `manipulation : mèche ${e.manipulation.cote === 'haut' ? 'au-dessus du haut' : 'au-dessous du bas'} asiatique à ${hhmm(e.manipulation.t)} (heure de Paris), ${nb(e.manipulation.depasse, 2)} $ au-delà${e.manipulation.clotureAu ? ', clôture au-delà' : ', clôture revenue dans la plage'}` : 'pas de manipulation : le prix n\'a pas dépassé la plage asiatique pendant Londres');
    L.push(e.distribution ? `distribution : New York AM (07h–10h) ${e.distribution.mouvement >= 0 ? '+' : '−'}${nb(Math.abs(e.distribution.mouvement), 2)} $` : 'distribution pas encore connue');
    if (e.sens) L.push(e.sens === 'judas' ? 'schéma Judas : la mèche de Londres a été suivie d\'un mouvement inverse à New York' : 'continuation : New York a prolongé la mèche de Londres');
    L.push('mesure : ' + phraseMesureIct(E.stats, 'directionnels', 'judas_swing_londres')); return L;
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
    if (on) { analyser(); E.rapport = I.rapport(E.an, { maintenant: maintenant() }); } maj(true); return on;
  }
  function maj(force = false) { const change = analyser() || force; if (E.an && (change || force)) { if (!E.pret) { E.pret = true; } registre(); if (!E.rapport || change) E.rapport = I.rapport(E.an, { maintenant: maintenant() }); } graph.ict(actif() ? modele() : null); majBouton(); rendre(); }
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
    const st = el.querySelector('[data-ict-stats]'); if (st) st.textContent = resumeStats();
    const sl = el.querySelector('[data-ict-max]'); if (sl) { sl.value = E.reg.max; const o = el.querySelector('[data-ict-max-val]'); if (o) o.textContent = String(E.reg.max); }
    const r = el.querySelector('[data-ict-reg]'); if (r) { const evs = E.registre.filter(x => x.kind === 'evenement'), res = E.registre.filter(x => x.kind === 'resultat'); r.textContent = `Registre forward : ${evs.length} événement${evs.length > 1 ? 's' : ''} noté${evs.length > 1 ? 's' : ''}, ${res.length} résultat${res.length > 1 ? 's' : ''} à 6, 12 ou 24 bougies (ajout seul, hors journal manuel).`; }
  }
  /* ── voix : « Analyse ICT de la semaine » ── */
  function parlerRapport() { analyser(); if (!E.an) return 'Je n\'ai pas encore assez de bougies H1 pour analyser la semaine.'; E.rapport = I.rapport(E.an, { maintenant: maintenant() }); return E.rapport.texte; }
  const commande = texte => { const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' '); if (/analyse ict|ict de la semaine|rapport ict|efface l analyse ict|masque l analyse ict|ferme l analyse ict/.test(n)) { if (/efface|masque|ferme/.test(n)) { basculer(false); return 'J\'ai effacé l\'analyse ICT du graphique.'; } if (!actif()) basculer(true); else maj(true); return parlerRapport(); } return null; };
  const el0 = est(); if (el0) {
    el0.addEventListener('input', ev => { const s = ev.target.closest('[data-ict-max]'); if (s) { E.reg.max = +s.value; ecrire(CLE_REG, E.reg); maj(true); } });
    el0.addEventListener('click', ev => { const b = ev.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'ict-lire') { const t = parlerRapport(); try { parler(t); } catch (e) { /* */ } } });
  }
  for (const b of racine.querySelectorAll('[data-a="ict-un-clic"]')) b.addEventListener('click', () => { basculer(); });
  let minuterie = null; if (auto) { chargerStats().then(() => maj(true)); minuterie = setInterval(() => { try { if (actif()) maj(); } catch (e) { /* */ } }, 30000); }
  return { maj, basculer, commande, rapport: () => { analyser(); return E.an ? I.rapport(E.an, { maintenant: maintenant() }) : null; }, parlerRapport, chargerStats, phraseMesure: (g, f) => phraseMesureIct(E.stats, g, f), actif, etat: () => ({ an: E.an, registre: E.registre.slice(), reg: E.reg, stats: E.stats, rapport: E.rapport }), injecter(stats) { E.stats = stats; }, detruire() { clearInterval(minuterie); } };
}
