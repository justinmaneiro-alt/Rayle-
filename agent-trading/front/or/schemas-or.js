/* ═════════════ RSI, DIVERGENCES ET SCHÉMAS DE RETOURNEMENT : colle (données, couches, messages « Attention », registre forward, statistiques, voix) ═════════════
   Calculs : schemas-retournement-v1.js (scellé SHA-256) ; zones : zones-affichage-v1.js (via graphique) ; fréquences : schemas-stats.json (Dukascopy, mesurées, avec n et taux de base).
   Rayle décrit : jamais « achète » ni « vends », jamais une promesse. Registre forward en ajout seul (rayle_or_schemas_forward), hors du journal manuel. */
import * as S from './schemas-retournement-v1.js';
import { atrLocal } from './niveaux-periode.js';
const CLE_FWD = 'rayle_or_schemas_forward', CLE_REG = 'rayle_or_schemas_reglages', H = 3600e3;
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pc = x => (x == null ? '—' : Math.round(x * 100) + ' %');
const hp = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const hh = t => new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
export const FAMILLES = { divergence_reguliere_baissiere: 'divergence régulière baissière', divergence_reguliere_haussiere: 'divergence régulière haussière', divergence_cachee_baissiere: 'divergence cachée baissière', divergence_cachee_haussiere: 'divergence cachée haussière', double_sommet: 'double sommet', double_creux: 'double creux', tete_epaules: 'tête et épaules', tete_epaules_inversee: 'tête et épaules inversée', balayage_haut: 'balayage de liquidité haute avec réintégration', balayage_bas: 'balayage de liquidité basse avec réintégration' };
export function famille(e) {
  if (e.kind === 'divergence') return `divergence_${e.sous}_${e.dir > 0 ? 'haussiere' : 'baissiere'}`;
  if (e.kind === 'double') return e.dir < 0 ? 'double_sommet' : 'double_creux'; if (e.kind === 'tete') return e.dir < 0 ? 'tete_epaules' : 'tete_epaules_inversee';
  if (e.kind === 'balayage') return e.dir < 0 ? 'balayage_haut' : 'balayage_bas'; return 'bougie_' + String(e.nom).replace(/ /g, '_');
}
/* phrase de mesure honnête pour une famille (jamais un mot fort si la mesure ne dépasse pas nettement la base) */
export function phraseMesure(stats, tf, fam, cond = 'seul') {
  const X = stats && stats[tf] && stats[tf][fam] && stats[tf][fam][cond]; if (!X) return 'mesure indisponible pour cette famille';
  const L = [];
  for (const [fen, nom] of [['long', '2015–2025'], ['recent', '18 derniers mois']]) {
    const x = X[fen]; if (!x || !x.n) { L.push(`${nom} : aucun cas`); continue; }
    if (!x.assez) { L.push(`${nom} : pas assez de données (${x.n} cas, il en faut 30)`); continue; }
    const h = x.h12, v = h.distingue === 'mieux' ? 'mieux que la base' : h.distingue === 'moins bien' ? 'moins bien que la base' : 'pas de différence nette avec la base';
    L.push(`${nom} (${x.n} cas) : ${pc(h.part)} des issues tranchées vont dans le sens attendu (+1,5 ATR avant −1,5 ATR en 12 bougies) contre ${pc(h.basePart)} pour la base, ${v}`);
  }
  return L.join(' ; ');
}
export function creerSchemas({ racine, moteur, graph, structure, parler = () => {}, maintenant = () => Date.now(), fetchFn = (...a) => fetch(...a), stats = null, auto = true } = {}) {
  const E = { stats, reg: { h4: false, seulementZone: false, doubles: true, tetes: true, balayages: true, bougies: true, messages: true, voix: true, notif: true, ...lire(CLE_REG, {}) }, registre: lire(CLE_FWD, []), vus: new Set(), pret: false, R: null, B: null, tf: 'H1', cle: '', dernier: '', modele: null };
  const est = () => racine && racine.querySelector('[data-schemas]');
  async function chargerStats() { if (E.stats) return; try { const r = await fetchFn(new URL('./schemas-stats.json', import.meta.url).href, { cache: 'no-store' }); if (r.ok) E.stats = await r.json(); } catch (e) { /* sans les statistiques : « indisponibles » */ } }
  const couches = () => graph.couches();
  function donnees() { const st = structure && structure.etat && structure.etat(); const A = st && st.A; if (!A || !A.B || A.B.length < 60) return null; return E.reg.h4 ? { B: A.H4, tf: 'H4', periode: 4 * H } : { B: A.B, tf: 'H1', periode: H }; }
  function zonesListe() { const ge = graph.etat && graph.etat(); const aff = ge && ge.aff; if (!aff) return []; return [...aff.sr.actives, ...aff.sr.traces].map(z => ({ bas: z.bas, haut: z.haut, cote: z.cote, tDebut: z.tDebut, tFin: z.actif === false ? z.tFin : null })); }
  function analyser() {
    const d = donnees(); if (!d) return false; const B = d.B, t = B[B.length - 1].t, Z = zonesListe(), cle = `${d.tf}|${t}|${B.length}|${Z.length}|${Z.map(z => Math.round(z.bas) + ':' + z.tDebut).join(',')}`;
    if (cle === E.cle && E.R) return false; E.cle = cle; E.B = B; E.tf = d.tf; E.periode = d.periode;
    const A = atrLocal(B, 14); E.A = A; E.R = S.analyser(B, { tf: d.tf, periode: d.periode, zones: Z.length ? S.enZoneListe(Z, A, B) : null }); E.zonesN = Z.length; return true;
  }
  const evenements = () => { const R = E.R; if (!R) return []; return [...R.divergences, ...R.doubles, ...R.tetes, ...R.balayages, ...R.bougies].sort((x, y) => (x.tCloture || 0) - (y.tCloture || 0)); };
  const recent = e => E.B && E.B.length - 1 - (e.i ?? 0) <= 3;
  function detailEvt(e) {
    const fam = famille(e), L = [`posé à la clôture du ${hp(e.tCloture)} (heure de Paris), ne bouge plus`];
    if (e.kind === 'divergence') L.push(`prix : ${nb(e.p1, 2)} (${hp(e.t1)}) → ${nb(e.p2, 2)} (${hp(e.t2)}) · RSI ${nb(e.r1, 1)} → ${nb(e.r2, 1)}`);
    if (e.kind === 'double') L.push(`deux ${e.dir < 0 ? 'sommets' : 'creux'} à ${nb(e.points[0].p, 2)} et ${nb(e.points[1].p, 2)} · ligne de cou ${nb(e.nl, 2)} · ${e.statut === 'confirme' ? 'confirmé le ' + hp(e.tConfirm) : e.statut === 'invalide' ? 'invalidé : ' + e.raison : 'en formation'}`);
    if (e.kind === 'tete') L.push(`${e.points.length} points · ${e.statut === 'confirme' ? 'confirmée le ' + hp(e.tConfirm) : e.statut === 'invalide' ? 'invalidée : ' + e.raison : 'en formation'}`);
    if (e.kind === 'balayage') L.push(`mèche de ${nb(e.mecheAtr, 2)} ATR au-delà de ${nb(e.niveau, 2)}, clôture revenue en deçà`);
    if (e.cible != null) L.push(`cible indicative ${nb(e.cible, 2)} (hauteur du schéma reportée : un repère, jamais une promesse)`);
    L.push(e.enZone ? 'en zone' : 'hors zone'); L.push('mesure : ' + phraseMesure(E.stats, E.tf, fam, e.enZone ? 'en_zone' : 'seul')); return L;
  }
  function modele() {
    const R = E.R, B = E.B; const c = couches(); if (!R) return null; const n = B.length, lim = n - 400, zo = E.reg.seulementZone;
    const divs = [], schemas = [], bal = [], bou = [];
    const pasRsi = !c.rsi && !c.divCachees;
    if (c.rsi || c.divCachees) for (const d of R.divergences.filter(d => d.i >= lim && (d.sous === 'reguliere' ? c.rsi : c.divCachees) && (!zo || d.enZone)).slice(-12))
      divs.push({ t1: d.t1, p1: d.p1, t2: d.t2, p2: d.p2, tConf: d.t, dir: d.dir, cachee: d.sous === 'cachee', r1: d.r1, r2: d.r2, etiquette: `Div. ${d.dir > 0 ? 'haussière' : 'baissière'}${d.sous === 'cachee' ? ' cachée' : ''} ${hh(d.t)}`, g: { p: d.p2, texte: `Divergence ${d.sous === 'cachee' ? 'cachée ' : ''}${d.dir > 0 ? 'haussière' : 'baissière'} RSI ${E.tf} · ${hp(d.t)}`, detail: detailEvt(d) } });
    if (c.schemas) {
      const zoneOk = e => !zo || !!(E.zonesN && S.enZoneListe(zonesListe(), E.A, B)(e.i2 ?? e.i, e.dir, B[e.i2 ?? e.i]));
      const fin = e => { const iFin = e.iConfirm ?? e.iInval ?? n - 1, tFin = B[Math.min(n - 1, iFin)].t; const c0 = e.cou; return { t: tFin, p: c0.pente != null && c0.t1 != null ? c0.p0 + c0.pente * (Math.min(n - 1, iFin) - B.findIndex(b => b.t === c0.t0)) : c0.p0 }; };
      const mkS = (e, nom) => ({ kind: e.kind, dir: e.dir, statut: e.statut, points: e.points, cou: e.cou, couFin: fin(e), tConfirm: e.tConfirm, tInval: e.tInval, cible: e.statut === 'confirme' ? e.cible : null, etiquette: `${nom} ${e.statut === 'confirme' ? 'confirmé' : e.statut === 'invalide' ? 'invalidé' : 'en formation'}`, g: { p: e.points[e.points.length - 1].p, texte: `${nom} · ${e.statut === 'confirme' ? 'confirmé' : e.statut === 'invalide' ? 'invalidé' : 'en formation'} · ${hp(e.tFormation)}`, detail: detailEvt(e) } });
      if (E.reg.doubles) for (const e of R.doubles.filter(e => e.iFormation >= lim && zoneOk(e)).slice(-6)) schemas.push(mkS(e, e.dir < 0 ? 'Double sommet' : 'Double creux'));
      if (E.reg.tetes) for (const e of R.tetes.filter(e => e.iFormation >= lim && zoneOk(e)).slice(-4)) schemas.push(mkS(e, e.dir < 0 ? 'Tête et épaules' : 'Tête et épaules inversée'));
      if (E.reg.balayages) for (const e of R.balayages.filter(e => e.i >= lim && (!zo || e.enZone)).slice(-8)) bal.push({ t: e.t, tNiveau: e.tNiveau, niveau: e.niveau, extreme: e.dir < 0 ? B[e.i].h : B[e.i].l, dir: e.dir, etiquette: 'Balayage', g: { p: e.niveau, texte: `Balayage de liquidité ${e.dir < 0 ? 'haute' : 'basse'} avec réintégration · ${hp(e.tCloture)}`, detail: detailEvt(e) } });
      if (E.reg.bougies) for (const e of R.bougies.filter(e => e.i >= lim).slice(-10)) bou.push({ t: e.t, p: e.dir < 0 ? B[e.i].h : B[e.i].l, dir: e.dir, nom: e.nom, g: { p: e.dir < 0 ? B[e.i].h : B[e.i].l, texte: `${e.nom} en zone · ${hp(e.tCloture)}`, detail: detailEvt(e) } });
    }
    void pasRsi; return { divs, schemas, balayages: bal, bougies: bou };
  }
  /* ── messages « Attention » ── */
  function chochActif(dir) { const A = structure && structure.etat && structure.etat().A; const ch = A && A.h1 && A.h1.etat && A.h1.etat.chochEnCours; return !!(ch && ch.statut === 'actif' && ch.dir === dir); }
  function message(e) {
    const pos = structure && structure.positionOuverte ? structure.positionOuverte() : null;
    let t = S.phraseAttention(e, { contre: pos ? { sens: pos.sens } : null });
    if (e.kind === 'divergence' && chochActif(e.dir)) t = `Attention : retournement possible (changement de caractère + divergence ${e.dir < 0 ? 'baissière' : 'haussière'} RSI ${e.tf})${e.enZone ? (e.dir < 0 ? ' en zone de vente' : ' en zone d\'achat') : ''}` + (pos && ((pos.sens === 'achat' && e.dir < 0) || (pos.sens === 'vente' && e.dir > 0)) ? ' — contre ta position : protection ou réduction à envisager' : '') + ' (information, jamais un ordre)';
    return t;
  }
  function alerter(e) {
    if (!E.reg.messages) return; const t = message(e); E.dernier = `${hp(e.tCloture)} · ${t}`;
    for (const z of racine.querySelectorAll('[data-schemas-avert]')) { z.hidden = false; z.textContent = E.dernier; }
    if (E.reg.voix) { try { parler(t); } catch (x) { /* */ } }
    if (E.reg.notif) { try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Rayle · schémas ' + e.tf, { body: t }); } catch (x) { /* */ } }
  }
  /* ── registre forward (ajout seul) ── */
  const issue = (B, i, dir, a, N) => { const ref = B[i].c, haut = ref + 1.5 * a, bas = ref - 1.5 * a; for (let k = i + 1; k <= Math.min(B.length - 1, i + N); k++) { const b = B[k], hit = dir > 0 ? b.h >= haut : b.l <= bas, adv = dir > 0 ? b.l <= bas : b.h >= haut; if (adv) return -1; if (hit) return 1; } return 0; };
  function registre() {
    const B = E.B, A = E.A; if (!B) return;
    for (const e of evenements()) { if (e.statut === 'formation' || e.statut === 'invalide' || E.registre.some(x => x.kind === 'evenement' && x.id === e.id)) continue; if (B.length - 1 - e.i > 48) continue;
      E.registre.push({ kind: 'evenement', id: e.id, famille: famille(e), tf: e.tf, dir: e.dir, t: e.t, tCloture: e.tCloture, enZone: !!e.enZone, ref: B[e.i].c, atr: A[e.i] || A[e.i - 1] || null, notee: maintenant() }); }
    for (const ev of E.registre.filter(x => x.kind === 'evenement' && x.tf === E.tf)) { const i = B.findIndex(b => b.t === ev.t); if (i < 0 || !ev.atr) continue;
      for (const h of [6, 12, 24]) { if (E.registre.some(x => x.kind === 'resultat' && x.id === ev.id && x.h === h) || B.length - 1 < i + h) continue; E.registre.push({ kind: 'resultat', id: ev.id, h, issue: issue(B, i, ev.dir, ev.atr, h), notee: maintenant() }); } }
    if (E.registre.length > 4000) E.registre.splice(0, E.registre.length - 4000); ecrire(CLE_FWD, E.registre);
  }
  /* ── panneau RSI sous le graphique ── */
  async function majRsi() {
    const c = couches(); if (!E.R) return;
    if (c.rsi) { const B = E.B, pts = []; E.R.rsi.forEach((v, i) => { if (v != null) pts.push({ t: B[i].t, v }); }); const divs = E.R.divergences.filter(d => d.i >= B.length - 400 && (d.sous === 'reguliere' || c.divCachees) && (!E.reg.seulementZone || d.enZone)).map(d => ({ t1: d.t1, t2: d.t2, r1: d.r1, r2: d.r2, dir: d.dir, cachee: d.sous === 'cachee' })); await graph.rsi(pts.slice(-1200), divs); }
    else await graph.rsi(null);
  }
  function maj(force = false) {
    const change = analyser() || force; if (!E.R) { rendre(); return; }
    if (change) {
      const evs = evenements().filter(e => e.statut !== 'formation' && e.statut !== 'invalide'), nouveaux = evs.filter(e => !E.vus.has(e.id)), recents = nouveaux.filter(recent);
      if (E.pret) for (const e of recents) alerter(e); for (const e of evs) E.vus.add(e.id); registre(); E.pret = true;
    }
    E.modele = modele(); graph.schemas(E.modele); majRsi(); rendre();
  }
  /* ── panneau ── */
  function resumeStats() {
    const st = E.stats; if (!st) return 'Mesures : chargement…';
    const n = st.nEssais, dist = []; for (const tf of ['H1', 'H4']) for (const f of Object.keys(st[tf] || {})) for (const c of Object.keys(st[tf][f])) for (const fen of ['recent', 'long']) { const x = st[tf][f][c][fen]; for (const k of ['h6', 'h12', 'h24']) if (x && x[k] && x[k].distingue && x[k].distingue !== 'non') dist.push(`${tf} ${FAMILLES[f] || f} ${c.replace(/_/g, ' ')} ${fen === 'long' ? '2015–2025' : '18 mois'}`); }
    return dist.length ? `Mesures (Dukascopy, calculées le ${st.calcule}) : ${dist.length} cas se distinguent du hasard sur ${n} essais testables (correction de Holm), voir le détail dans le rapport.` : `Mesures (Dukascopy, calculées le ${st.calcule}) : sur ${n} essais testables (famille × condition × fenêtre × horizon, correction de Holm), AUCUNE famille ne se distingue du hasard. Ces lignes décrivent, elles ne prédisent pas.`;
  }
  function ligne(e) { return `<li data-evt="${esc(e.id)}"><b>${esc(e.tf)} · ${esc(FAMILLES[famille(e)] || e.nom || famille(e))}</b> ${esc(hp(e.tCloture))}${e.statut === 'formation' ? ' <em>(en formation)</em>' : e.statut === 'invalide' ? ' <em>(invalidé)</em>' : ''}${e.enZone ? ' · en zone' : ''}<br><small>${esc(detailEvt(e).slice(1, 3).join(' · '))}</small></li>`; }
  function rendre() {
    const el = est(); if (!el) return;
    const L = el.querySelector('[data-schemas-liste]'); if (L) { const ev = evenements().slice(-8).reverse(); L.innerHTML = ev.length ? ev.map(ligne).join('') : '<li>aucun événement récent</li>'; }
    const st = el.querySelector('[data-schemas-stats]'); if (st) st.textContent = resumeStats();
    for (const c of el.querySelectorAll('[data-schemas-c]')) c.checked = !!E.reg[c.dataset.schemasC];
    const R = el.querySelector('[data-schemas-reg]'); if (R) { const evs = E.registre.filter(x => x.kind === 'evenement'), res = E.registre.filter(x => x.kind === 'resultat'); R.textContent = `Registre forward : ${evs.length} événement${evs.length > 1 ? 's' : ''} noté${evs.length > 1 ? 's' : ''}, ${res.length} résultat${res.length > 1 ? 's' : ''} à 6, 12 ou 24 bougies (ajout seul, hors journal manuel).`; }
    if (E.dernier) for (const z of racine.querySelectorAll('[data-schemas-avert]')) { z.hidden = false; z.textContent = E.dernier; }
  }
  /* ── voix et fiches ── */
  function resume() {
    if (!E.R) return 'Je n\'ai pas encore assez de bougies H1 pour chercher des divergences et des schémas.';
    const recents = evenements().filter(e => e.statut !== 'invalide' && E.B.length - 1 - e.i <= 24).slice(-4); if (!recents.length) return 'Aucune divergence RSI ni schéma de retournement sur les dernières 24 bougies. ' + resumeStats();
    return `${recents.map(e => message(e).replace(/ \(information, jamais un ordre\)$/, '') + ' le ' + hp(e.tCloture)).join('. ')}. ${resumeStats()}`;
  }
  const commande = texte => { const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' '); if (/divergence|schemas? de retournement|double sommet|double creux|tete et epaules|balayage/.test(n)) return resume(); return null; };
  const el0 = est(); if (el0) {
    el0.addEventListener('change', ev => { const c = ev.target.closest('[data-schemas-c]'); if (!c) return; E.reg[c.dataset.schemasC] = c.checked; ecrire(CLE_REG, E.reg); if (c.checked && c.dataset.schemasC === 'notif' && typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { /* */ } } maj(true); });
    el0.addEventListener('click', ev => { const b = ev.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'schemas-resume') { const t = resume(); try { parler(t); } catch (e) { /* */ } const z = el0.querySelector('[data-schemas-texte]'); if (z) { z.hidden = false; z.textContent = t; } } });
  }
  let minuterie = null; if (auto) { chargerStats().then(() => maj(true)); minuterie = setInterval(() => { try { maj(); } catch (e) { /* */ } }, 20000); }
  return { maj, resume, commande, chargerStats, evenements, message, phraseMesure: (tf, fam, cond) => phraseMesure(E.stats, tf, fam, cond), etat: () => ({ R: E.R, B: E.B, tf: E.tf, registre: E.registre.slice(), reg: E.reg, stats: E.stats, modele: E.modele, dernier: E.dernier }),
    injecter(stats) { E.stats = stats; }, detruire() { clearInterval(minuterie); } };
}
