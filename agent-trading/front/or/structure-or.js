/* ═════════════ STRUCTURE DE MARCHÉ + RETOURNEMENTS : colle (données, panneau, avertissement de position, registre forward, voix) ═════════════
   Calculs : structure-marche-v1.js (scellé SHA-256) ; fréquences : structure-marche-stats.json (mesurées sur Dukascopy) ; zones : zones-or.js. Jamais un ordre, jamais « achète » / « vends » :
   Rayle décrit la situation, les conditions et les fréquences mesurées (avec n). Registre forward en ajout seul, simulé, hors du journal manuel de trades. */
import * as SM from './structure-marche-v1.js';
import { zonesRetournement } from './zones-or.js';
import { bougiesKraken } from './sources-or.js';
import { fusionner, regrouperBougies } from './bougies-or.js';
const CLE_FWD = 'rayle_or_structure_forward', CLE_REG = 'rayle_or_struct_reglages', CLE_Z = 'rayle_or_retourn_reglages', H = 3600e3;
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pc = x => (x == null ? '—' : Math.round(x * 100) + ' %');
const hp = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const NOM_Z = { veille: 'veille (haut / bas)', semaine: 'semaine précédente', seance: 'extrêmes de séance', rond: 'niveau rond', volume: 'zone de volume' };
export function creerStructure({ racine, moteur, graph, parler = () => {}, maintenant = () => Date.now(), fetchFn = (...a) => fetch(...a), stats = null, auto = true } = {}) {
  const E = { stats, h1: [], A: null, derniereT: null, evenements: [], registre: lire(CLE_FWD, []), reg: { voix: true, notif: true, ...lire(CLE_REG, {}) }, zr: { mode: 'toutes', minProb: 0, tri: 'dist', ...lire(CLE_Z, {}) }, zones: [], charge: 0, dernierAvert: '', vus: new Set(), pret: false };
  const est = () => racine && racine.querySelector('[data-structure]');
  async function chargerStats() { if (E.stats) return; try { const r = await fetch(new URL('./structure-marche-stats.json', import.meta.url).href, { cache: 'no-store' }); if (r.ok) E.stats = await r.json(); } catch (e) { /* sans les statistiques : « indisponibles » */ } }
  const m15 = () => { const S = moteur.S, L = S.periode === 'M15' ? S.k : S.kM15; return (L || []).filter(b => !b.ref); };
  async function chargerH1() { const n = maintenant(); if (E.charge && n - E.charge < 240e3) return; E.charge = n; try { const L = await bougiesKraken('H1', { n: 1500, fetchFn, maintenant: n }); E.h1Brut = L; } catch (e) { /* on garde ce qu'on a ; les M15 déjà chargées complètent */ } }
  function h1Closes() { const n = maintenant(); if (E.seul) return (E.h1Brut || []).filter(b => b.t + H <= n); let L = E.h1Brut || []; const M = m15(); if (M.length) L = fusionner(L, regrouperBougies(M, H)); if ((moteur.S.serieH1 || []).length) L = fusionner(L, moteur.S.serieH1.filter(b => !b.ref)); return L.filter(b => b.t + H <= n && b.c > 0).sort((a, b) => a.t - b.t); }
  function analyser() {
    const B = h1Closes(); if (B.length < 60) return false; const t = B[B.length - 1].t; if (t === E.derniereT && E.A) return false; E.derniereT = t; E.h1 = B;
    const H4 = SM.agreger(B, 4 * H).filter(b => b.n === 4);   // seulement les bougies H4 complètes
    E.A = { h1: SM.analyser(B, { K: SM.P.K, periode: H }), h1M: SM.analyser(B, { K: SM.P.Kmajeure, periode: H }), h4: H4.length >= 40 ? SM.analyser(H4, { K: SM.P.K, periode: 4 * H }) : null, h4M: H4.length >= 60 ? SM.analyser(H4, { K: SM.P.Kmajeure, periode: 4 * H }) : null, B, H4 };
    return true;
  }
  /* ── phrase d'état (bandeau) ── */
  function etatH1(A) { const e = A.etat, ch = e.chochEnCours && e.chochEnCours.statut === 'actif' ? e.chochEnCours : null; if (ch) return { code: 'choch', texte: `retournement possible (changement de caractère ${ch.dir < 0 ? 'baissier' : 'haussier'})` }; const im = e.impulsionActive; if (im) return { code: 'impulsion', texte: `impulsion ${im.dir < 0 ? 'baissière' : 'haussière'} en cours, rebond probable` }; return { code: 'tendance', texte: `tendance ${SM.nomTendance(e.tendance)}` }; }
  function bandeau() { const A = E.A; if (!A) return 'Structure de marché : bougies H1 pas encore chargées.'; const t4 = A.h4 ? `Tendance H4 ${SM.nomTendance(A.h4.etat.tendance)}` : 'Tendance H4 : pas assez de bougies', s1 = etatH1(A.h1), maj = A.h1M.etat.tendance !== A.h1.etat.tendance && A.h1M.etat.tendance !== 0 ? ` · structure majeure H1 ${SM.nomTendance(A.h1M.etat.tendance)}` : ''; return `${t4} · H1 : ${s1.texte}${maj}`; }
  function statTexte(tf, type, fenetre, horizon = 12) { return SM.phraseStats(E.stats, tf, type, fenetre, horizon); }
  function modelEvents() {
    const A = E.A; if (!A) return { evenements: [], bos: [] }; const out = [], bos = [], bars = A.B, parT = new Map(bars.map(b => [b.t, b]));
    const poser = (R, tf, B2, periode) => { const lim = B2.length - (tf === 'H1' ? 1000 : 300); for (const e of R.events) { if (e.i < lim) continue; const b = B2[e.i];
      if (e.type === 'bos') { const sw = (e.dir > 0 ? R.swings.filter(s => s.type === 'H') : R.swings.filter(s => s.type === 'L')).find(s => Math.abs(s.p - e.niveau) < 1e-9 && s.conf <= e.i); bos.push({ tf, dir: e.dir, t: e.t, tNiveau: sw ? sw.t : B2[Math.max(0, e.i - 10)].t, niveau: e.niveau, etiquette: tf === 'H4' ? 'BOS H4' : 'BOS', titre: `${tf} · cassure de structure ${e.dir > 0 ? 'haussière' : 'baissière'} à ${nb(e.niveau)}`, detail: ['clôture au-delà du dernier ' + (e.dir > 0 ? 'sommet' : 'creux') + ' de fractale', hp(e.tCloture) + ' (heure de Paris)'] }); continue; }
      const nom = SM.MENTIONS[e.type], inval = e.statut === 'invalide', st = E.stats ? statTexte(tf, e.type, 'long') : null, stR = E.stats ? statTexte(tf, e.type, 'recent') : null;
      const court = `${tf === 'H4' ? 'H4 ' : ''}${e.type === 'impulsion' ? 'Impulsion ' + (e.dir < 0 ? '↓' : '↑') + ' : rebond probable' : e.type === 'choch' ? 'CHoCH ' + (e.dir < 0 ? '↓' : '↑') + ' · Retournement possible' : 'Retournement confirmé ' + (e.dir < 0 ? '↓' : '↑')}${inval ? ' (invalidé)' : ''}`;
      const detail = [`${tf} · posé à la clôture du ${hp(e.tCloture)} (heure de Paris), ne bouge plus`, e.type === 'confirme' ? `confirme le changement de caractère du ${hp(((R.events.find(x => x.id === e.ref) || {}).tCloture) || e.tCloture)}` : `niveau cassé / repère : ${nb(e.niveau)} · extrême de départ : ${nb(e.extreme)}`, inval ? `INVALIDÉ le ${hp(e.tInval)} : ${e.raisonInval}` : e.type === 'choch' ? `sera invalidé si une clôture ${tf} reprend ${nb(e.extreme)} ; confirmé après un rebond qui ne le reprend pas puis une nouvelle cassure` : e.type === 'impulsion' ? `repli de ${nb(e.repliAtr, 1)} ATR sans casser le ${e.dir < 0 ? 'creux' : 'sommet'} protégé ${nb(e.niveau)}` : '', stR && stR.assez ? stR.texte : stR ? `derniers mois : ${stR.texte}` : '', st && st.assez ? st.texte : st ? `2015–2025 : ${st.texte}` : ''].filter(Boolean);
      out.push({ tf, type: e.type, dir: e.dir, t: e.t, tCloture: e.tCloture, statut: e.statut, court, titre: `${nom}${inval ? ' (invalidé)' : ''} · ${tf}`, detail, prix: b.c, hautBougie: b.h, basBougie: b.l, niveau: e.niveau, extreme: e.extreme, id: tf + '|' + e.id }); } };
    poser(A.h1, 'H1', bars, H); if (A.h4) poser(A.h4, 'H4', A.H4, 4 * H); out.sort((a, b) => a.t - b.t); bos.sort((a, b) => a.t - b.t); return { evenements: out, bos, etiquettesMax: 6 };
  }
  /* ── zones de retournement : toutes, avec probabilité mesurée ── */
  function probZone(z, S) { if (z.tests >= 5) return { p: z.tenues / z.tests, n: z.tests, src: `testée ${z.tests} fois, a tenu ${z.tenues}` }; const pt = S.etude && S.etude.parType; if (pt) { let best = null; for (const t of z.cles && z.cles.length ? z.cles : z.types) { const r = pt[t]; if (r && r.assez && r.taux != null && (!best || r.taux > best.p)) best = { p: r.taux, n: r.tests, src: `${NOM_Z[t] || t} : a tenu ${pc(r.taux)} de ${r.tests} tests` }; } if (best) return best; } return { p: null, n: z.tests || 0, src: 'probabilité non mesurée (pas assez de tests)' }; }
  function calculerZones() {
    const S = moteur.S, a = S.a, prix = S.prix; if (!a || !prix || !S.refM15 || !S.refM15.length) return [];
    const e = S.ecart ?? 0, dec = L => L.map(b => ({ ...b, o: b.o + e, h: b.h + e, l: b.l + e, c: b.c + e })), n = maintenant(), m15c = dec(S.refM15.filter(b => b.t + 900e3 <= n)), h1c = dec((S.refH1 || []).filter(b => b.t + H <= n));
    let Z = []; try { Z = zonesRetournement({ niveaux: S.niveaux || [], volumes: S.zonesVol || [], prix, a, m15: m15c, h1: h1c, atrH1: S.atrH1, max: 1e9 }); } catch (err) { console.warn('zones de retournement :', err.message); }
    return Z.map(z => { const pr = probZone(z, S); return { ...z, prob: pr.p, probN: pr.n, probSrc: pr.src }; });
  }
  function modelZones() {
    const Z = E.zones, proches = new Set(Z.slice().sort((x, y) => x.dist - y.dist).slice(0, 6).map(z => z.id)); let L = Z.filter(z => (E.zr.minProb <= 0 || (z.prob != null && z.prob >= E.zr.minProb / 100)));
    if (E.zr.mode === 'top6') L = L.filter(z => proches.has(z.id));
    return L.map(z => ({ p: z.p, bas: z.bas, haut: z.haut, cote: z.cote, prob: z.prob, proche: proches.has(z.id), etiquette: `${z.prob == null ? 'p ?' : 'p ' + pc(z.prob)}${z.probN ? ' · n=' + z.probN : ''}`, titre: `${z.cote === 'support' ? 'Support' : 'Résistance'} ${nb(z.p, 0)} · ${z.prob == null ? 'probabilité non mesurée' : 'probabilité mesurée ' + pc(z.prob)}`, detail: [`${nb(z.bas)} à ${nb(z.haut)} · à ${nb(z.distAtr, 1)} ATR H1 du prix`, (z.noms || []).join(', '), z.probSrc] }));
  }
  /* ── position en cours (journal manuel) et avertissement ── */
  function positionOuverte() { const L = lire('rayle_or_journal', []); if (!Array.isArray(L)) return null; return L.filter(t => t && ['achat', 'vente'].includes(t.sens) && !(t.sortie != null && t.sortie !== '' && +t.sortie > 0)).slice(-1)[0] || null; }
  function avertir(e) {
    const pos = positionOuverte(); if (!pos) return; const contraire = (pos.sens === 'achat' && e.dir < 0) || (pos.sens === 'vente' && e.dir > 0); if (!contraire || e.type !== 'choch' || e.tf !== 'H1' || e.statut === 'invalide') return;
    const t = 'Retournement possible contre ta position : à surveiller, protection ou réduction à envisager. (Information, jamais un ordre.)'; E.dernierAvert = `${hp(e.tCloture)} · ${t}`; const z = est() && est().querySelector('[data-struct-avert]'); if (z) { z.hidden = false; z.textContent = E.dernierAvert; }
    if (E.reg.voix) { try { parler(t); } catch (x) { /* */ } } if (E.reg.notif) { try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Rayle · structure H1', { body: t }); } catch (x) { /* */ } }
  }
  /* ── registre forward (ajout seul) : chaque événement H1, puis son résultat à 6, 12 et 24 bougies ── */
  function registre() {
    const A = E.A; if (!A) return; const B = A.B, R = A.h1;
    for (const e of R.events) { if (e.type === 'bos' || E.registre.some(x => x.kind === 'evenement' && x.id === e.id)) continue; if (B.length - 1 - e.i > 48) continue;   // seulement les 2 derniers jours : le registre forward ne rejoue pas l'histoire
      E.registre.push({ kind: 'evenement', id: e.id, tf: 'H1', type: e.type, dir: e.dir, t: e.t, tCloture: e.tCloture, niveau: e.niveau, extreme: e.extreme, refNouveau: e.refNouveau, notee: maintenant() }); }
    for (const ev of E.registre.filter(x => x.kind === 'evenement')) { const i = B.findIndex(b => b.t === ev.t); if (i < 0) continue; for (const h of [6, 12, 24]) { if (E.registre.some(x => x.kind === 'resultat' && x.id === ev.id && x.h === h)) continue; if (B.length - 1 < i + h) continue; const dO = -ev.dir, apres = B.slice(i + 1, i + 1 + h); const reprise = apres.some(b => (dO > 0 ? b.h > ev.extreme : b.l < ev.extreme)), nouveau = apres.some(b => (ev.dir < 0 ? b.l < Math.min(ev.refNouveau, B[i].l) : b.h > Math.max(ev.refNouveau, B[i].h))); E.registre.push({ kind: 'resultat', id: ev.id, h, reprise, nouveau, notee: maintenant() }); } }
    if (E.registre.length > 4000) E.registre.splice(0, E.registre.length - 4000); ecrire(CLE_FWD, E.registre);
  }
  /* ── mise à jour ── */
  function maj(force = false) {
    const change = analyser() || force; if (!E.A) { rendre(); return; }
    if (change) { E.evenements = modelEvents(); const nouveaux = E.A.h1.events.filter(e => e.type !== 'bos' && !E.vus.has(e.id)); const recents = nouveaux.filter(e => E.A.B.length - 1 - e.i <= 3); if (E.pret || recents.length) for (const e of recents) avertir({ ...E.A.h1.events.find(x => x.id === e.id), tf: 'H1' }); for (const e of E.A.h1.events) E.vus.add(e.id); registre(); E.pret = true; }
    const act = graph.couches(); if (act.retournements) { const cle = `${moteur.S.prix && Math.round(moteur.S.prix)}|${(moteur.S.refM15 || []).length}|${moteur.S.niveaux && moteur.S.niveaux.length}|${E.derniereT}`; if (cle !== E.cleZones || force) { E.cleZones = cle; try { E.zones = calculerZones(); } catch (e) { console.warn('retournements :', e.message); } } }
    graph.structure({ ...(act.structure ? E.evenements : { evenements: [], bos: [] }), zones: act.retournements ? modelZones() : [], etiquettesMax: 6 }); rendre();
  }
  /* ── panneau ── */
  function ligneEvt(e) { const st = E.stats ? statTexte(e.tf, e.type, 'long') : null; return `<li data-evt="${esc(e.id)}"><b>${esc(e.tf)} · ${esc(e.titre.split(' · ')[0])}</b> ${esc(hp(e.tCloture))}${e.statut === 'invalide' ? ' <em>(invalidé)</em>' : ''}<br><small>${esc(e.detail.slice(1, 4).join(' · '))}</small></li>`; }
  function rendre() {
    const el = est(); if (!el) return; for (const b of racine.querySelectorAll('[data-struct-bandeau]')) { b.textContent = bandeau(); if (b.classList.contains('tor-struct-haut')) b.hidden = !E.A; }
    const L = el.querySelector('[data-struct-liste]'); if (L) { const ev = (E.evenements.evenements || []).filter(e => e.tf === 'H1').slice(-8).reverse(); L.innerHTML = ev.length ? ev.map(ligneEvt).join('') : '<li>aucun événement récent</li>'; }
    const R = el.querySelector('[data-struct-reg]'); if (R) { const evs = E.registre.filter(x => x.kind === 'evenement'), res = E.registre.filter(x => x.kind === 'resultat'); R.textContent = `Registre forward : ${evs.length} événement${evs.length > 1 ? 's' : ''} noté${evs.length > 1 ? 's' : ''}, ${res.length} résultat${res.length > 1 ? 's' : ''} à 6, 12 ou 24 bougies.`; }
    for (const c of el.querySelectorAll('[data-struct-reg-c]')) c.checked = !!E.reg[c.dataset.structRegC]; const mode = el.querySelector('[data-a="rz-mode"]'); if (mode) mode.textContent = E.zr.mode === 'top6' ? 'Top 6' : 'Toutes'; const sl = el.querySelector('[data-rz-min]'); if (sl) { sl.value = E.zr.minProb; const o = el.querySelector('[data-rz-min-val]'); if (o) o.textContent = E.zr.minProb + ' %'; }
    const T = el.querySelector('[data-rz-corps]'); if (T) { const rows = E.zones.slice(); const k = E.zr.tri; rows.sort((x, y) => k === 'prob' ? (y.prob ?? -1) - (x.prob ?? -1) : k === 'type' ? String((x.cles && x.cles[0]) || x.types[0]).localeCompare(String((y.cles && y.cles[0]) || y.types[0])) : k === 'n' ? (y.probN || 0) - (x.probN || 0) : x.dist - y.dist);
      T.innerHTML = rows.length ? rows.map(z => `<tr><td>${esc(z.cote === 'support' ? 'Support' : 'Résistance')} ${nb(z.p, 0)}</td><td>${z.prob == null ? '—' : pc(z.prob)}</td><td>${nb(z.distAtr, 1)} ATR</td><td>${esc((z.noms || []).map(n => n).slice(0, 2).join(', '))}</td><td>${z.probN || 0}</td></tr>`).join('') : '<tr><td colspan="5">Active la couche « Retournements » pour calculer les zones.</td></tr>'; }
  }
  /* ── voix et fiches ── */
  function resume() {
    const A = E.A; if (!A) return 'Je n\'ai pas encore assez de bougies H1 pour lire la structure.'; const P = [], e = A.h1.etat, s1 = etatH1(A.h1);
    P.push(`${A.h4 ? 'La tendance H4 est ' + SM.nomTendance(A.h4.etat.tendance) : 'Je n\'ai pas assez de bougies H4 pour lire la tendance H4'}, la tendance H1 est ${SM.nomTendance(e.tendance)}${A.h1M.etat.tendance !== e.tendance ? ` et la structure majeure H1 est ${SM.nomTendance(A.h1M.etat.tendance)}` : ''}.`);
    if (e.dernierBos) P.push(`La dernière cassure de structure H1 date du ${hp(e.dernierBos.tCloture)} : clôture ${e.dernierBos.dir > 0 ? 'au-dessus' : 'sous'} ${nb(e.dernierBos.niveau)}.`);
    const stat = (type, e2) => { const f = statTexte('H1', type, 'long'), r = statTexte('H1', type, 'recent'); return `${f.assez ? f.texte : '2015–2025 : ' + f.texte}${r.assez ? ' ; ' + r.texte : ' ; derniers mois : ' + r.texte}`; };
    if (s1.code === 'impulsion') { const im = e.impulsionActive; P.push(`Nous sommes dans une impulsion ${im.dir < 0 ? 'baissière' : 'haussière'} contre la tendance, un repli de ${nb(im.repliAtr, 1)} ATR, sans cassure du ${im.dir < 0 ? 'creux' : 'sommet'} protégé ${nb(im.niveau)}. Mesures : ${stat('impulsion')}. Un changement de caractère apparaîtrait si une clôture H1 passe ${im.dir < 0 ? 'sous' : 'au-dessus de'} ${nb(im.niveau)}.`); }
    else if (s1.code === 'choch') { const ch = e.chochEnCours; P.push(`Un changement de caractère ${ch.dir < 0 ? 'baissier' : 'haussier'} a été posé le ${hp(ch.tCloture)} : retournement possible, pas confirmé. Mesures : ${stat('choch')}. Il serait confirmé par un rebond qui ne reprend pas ${nb(ch.extreme)} puis une nouvelle clôture ${ch.dir < 0 ? 'sous le plus bas atteint' : 'au-dessus du plus haut atteint'} ; il serait invalidé si une clôture H1 reprend ${nb(ch.extreme)}.`); }
    else P.push(`Pas d'impulsion contre la tendance ni de changement de caractère en cours.${e.protegeBas && e.tendance > 0 ? ` Le creux protégé est ${nb(e.protegeBas.p)} : une clôture H1 dessous serait un changement de caractère.` : e.protegeHaut && e.tendance < 0 ? ` Le sommet protégé est ${nb(e.protegeHaut.p)} : une clôture H1 au-dessus serait un changement de caractère.` : ''}`);
    P.push('Ce sont des fréquences mesurées sur l\'historique, pas des promesses, et jamais un ordre.'); return P.join(' ');
  }
  function ficheRebond() {
    const A = E.A, ex = A ? A.h1.events.filter(e => e.type !== 'bos').slice(-1)[0] : null; const def = 'Rebond ou retournement ? Dans une tendance haussière, les sommets et les creux montent. Une impulsion contre la tendance est un repli d\'au moins un ATR et demi qui ne casse pas le dernier creux : on parle de rebond probable, la tendance garde la main. Un changement de caractère, c\'est une clôture sous ce dernier creux protégé : retournement possible. Il devient un retournement confirmé si le prix rebondit sans reprendre le haut de l\'impulsion puis recasse son plus bas. Et il est invalidé si une clôture reprend ce haut. Le tout s\'inverse pour une tendance baissière.';
    if (!ex) return def; const nom = SM.MENTIONS[ex.type]; return `${def} Exemple pris sur le graphique actuel : le ${hp(ex.tCloture)}, ${nom.toLowerCase()} (${ex.dir < 0 ? 'baissier' : 'haussier'}), repère ${nb(ex.niveau)}${ex.statut === 'invalide' ? ', invalidé depuis' : ''}. ${statTexte('H1', ex.type, 'long').texte}.`;
  }
  const commande = texte => { const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' '); if (/ou en est la tendance|quelle est la tendance|etat de la tendance|ou en est la structure|ou en est le marche/.test(n)) return resume(); if (/rebond ou retournement/.test(n)) return ficheRebond(); return null; };
  const dit = t => { try { parler(t); } catch (e) { /* */ } return t; };
  /* événements du panneau */
  const el0 = est(); if (el0) {
    el0.addEventListener('click', ev => { const b = ev.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; if (a === 'struct-resume') { const t = dit(resume()); const z = el0.querySelector('[data-struct-texte]'); if (z) { z.hidden = false; z.textContent = t; } } else if (a === 'struct-fiche') { const t = dit(ficheRebond()); const z = el0.querySelector('[data-struct-texte]'); if (z) { z.hidden = false; z.textContent = t; } } else if (a === 'rz-mode') { E.zr.mode = E.zr.mode === 'top6' ? 'toutes' : 'top6'; ecrire(CLE_Z, E.zr); maj(true); } else if (a === 'rz-tri') { E.zr.tri = b.dataset.tri; ecrire(CLE_Z, E.zr); rendre(); } });
    el0.addEventListener('change', ev => { const c = ev.target.closest('[data-struct-reg-c]'); if (c) { E.reg[c.dataset.structRegC] = c.checked; ecrire(CLE_REG, E.reg); if (c.checked && c.dataset.structRegC === 'notif' && typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { /* */ } } } });
    el0.addEventListener('input', ev => { const s = ev.target.closest('[data-rz-min]'); if (s) { E.zr.minProb = +s.value; ecrire(CLE_Z, E.zr); maj(true); } });
  }
  let minuterie = null; if (auto) { chargerStats().then(() => { chargerH1().then(() => maj(true)); }); minuterie = setInterval(async () => { try { await chargerH1(); maj(); } catch (e) { /* */ } }, 30000); }
  return { maj, resume, ficheRebond, commande, bandeau, chargerH1, chargerStats, etat: () => ({ A: E.A, evenements: E.evenements, registre: E.registre.slice(), zones: E.zones.slice(), stats: E.stats, reg: E.reg, zr: E.zr }), injecterH1(L, { seul = true } = {}) { E.h1Brut = L; E.seul = seul; E.charge = maintenant() + 1e9; E.derniereT = null; E.A = null; E.vus = new Set(); E.pret = false; },
    modele: () => ({ ...E.evenements, zones: modelZones() }), avertir, positionOuverte, detruire() { clearInterval(minuterie); } };
}
