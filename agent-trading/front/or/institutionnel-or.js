/* ═════════════ OUTILS INSTITUTIONNELS : colle entre les données du tableau de l'or et le dessin du graphique (menu « Couches », chacun activable séparément, aucun imposé) ═════════════
   Les calculs sont dans institutionnel-calcul.js (pur). Ici : accumulation des transactions Kraken en direct (CVD), construction du modèle de dessin, ouverture de la carte thermique du carnet.
   Volume = volume réel Kraken PF_XAUUSD des bougies M15 déjà chargées. Rien n'est inventé : pas de données = couche vide + note. */
import * as C from './institutionnel-calcul.js';
const CLE = 'rayle_or_delta_m15', PERIODE = 900e3;
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch (e) { return {}; } };
const col = { vwap: '#e0b84f', ancre: '#d98cff', poc: '#7fd0ff', veille: '#c9b27a', semaine: '#e8e0c8', ouv: '#9fb4c0', asie: '95,140,200', londres: '95,184,148', ny: '224,150,80', rond: 'rgba(200,210,215,.35)', liq: '#c39be0' };
export function creerInstitutionnel({ graph, moteur, carnet = null, notifier = () => {} }) {
  const carte = lire(); let vus = { t: 0, cles: new Set() }, cle = null, derniere = null, note = '', sale = 0;
  function sauver() { const ks = Object.keys(carte).map(Number).sort((a, b) => a - b); for (const k of ks.slice(0, Math.max(0, ks.length - 900))) delete carte[k]; try { localStorage.setItem(CLE, JSON.stringify(carte)); } catch (e) { /* stockage plein ou refusé */ } }
  function lireFlux() {
    const fl = carnet && carnet._flux; if (!fl) return 0; const tr = fl.transactions(); if (!tr.length) return 0;
    const L = tr.filter(x => x.t > vus.t || (x.t === vus.t && !vus.cles.has(x.t + '|' + x.p + '|' + x.q))); const n = C.accumuler(carte, L, PERIODE);
    for (const x of tr) { if (x.t > vus.t) { vus.t = x.t; vus.cles = new Set(); } if (x.t === vus.t) vus.cles.add(x.t + '|' + x.p + '|' + x.q); }
    if (n) { sale += n; if (sale > 40) { sale = 0; sauver(); } } return n;
  }
  const base = () => { const S = moteur.S, L = S.periode === 'M15' ? S.k : S.kM15; return (L || []).filter(b => !b.ref); };
  function modele() {
    const act = graph.couches(), M = { lignes: [], series: [], zones: [], profils: [], marques: [], delta: null, notes: [] }; const B = base(), serie = moteur.serie();
    const tout = Object.keys(C.LIBELLES).filter(k => act[k]); if (!tout.length) return null;
    if (B.length < 20) { M.notes.push('Outils institutionnels : bougies M15 Kraken pas encore chargées.'); return M; }
    const prix = B[B.length - 1].c, NV = C.niveauxPeriodes(B), a = serie.length > 15 ? (() => { let s = 0; for (let i = serie.length - 14; i < serie.length; i++) s += Math.max(serie[i].h - serie[i].l, Math.abs(serie[i].h - serie[i - 1].c), Math.abs(serie[i].l - serie[i - 1].c)); return s / 14; })() : 0;
    if (act.vwap) { const V = C.vwapSeance(B); M.series.push({ pts: V.map(x => ({ t: x.t, p: x.vwap })), col: col.vwap, w: 1.6, txt: 'VWAP' }); for (const [m, d] of [[1, [5, 4]], [2, [2, 4]]]) for (const s of [1, -1]) M.series.push({ pts: V.map(x => ({ t: x.t, p: x.vwap + s * m * x.sd })), col: col.vwap, w: 1, dash: d, alpha: 0.6, txt: (s > 0 ? '+' : '−') + m + 'σ' }); }
    if (act.vwapAncre && NV) { const ancres = [[NV.iLveille, 'bas veille'], [NV.iHveille, 'haut veille'], [NV.i0Semaine, 'ouverture semaine']].filter(x => x[0] != null); const ouv = { 'bas veille': NV.pdlT, 'haut veille': NV.pdhT, 'ouverture semaine': NV.ouvSemaineT };
      for (const [, nom] of ancres) { const i0 = B.findIndex(b => b.t >= ouv[nom]); if (i0 < 0) continue; const V = C.vwapAncre(B, i0); if (V.length > 1) M.series.push({ pts: V.map(x => ({ t: x.t, p: x.vwap })), col: col.ancre, w: 1.3, dash: nom === 'ouverture semaine' ? [] : [6, 3], txt: 'VWAP ancré ' + nom }); } }
    if (act.profil) { const P = C.profils(B, 1); for (const [nom, p] of [['séance', P.seance], ['veille', P.veille], ['semaine', P.semaine]]) if (p) { M.profils.push({ nom, ...p, alpha: nom === 'séance' ? 0.35 : 0.18 }); } if (!M.profils.length) M.notes.push('Profil de volume : pas de volume Kraken disponible.'); }
    if (act.veilleSemaine && NV) { for (const [p, txt, c] of [[NV.pdh, 'PDH veille', col.veille], [NV.pdl, 'PDL veille', col.veille], [NV.pwh, 'PWH semaine préc.', col.semaine], [NV.pwl, 'PWL semaine préc.', col.semaine]]) if (p != null) M.lignes.push({ p, txt, col: c, dash: [6, 3], w: 1.1 }); }
    if (act.ouvertures && NV) { M.lignes.push({ p: NV.ouvJour, txt: 'Ouverture du jour', col: col.ouv, dash: [2, 3], t0: NV.ouvJourT }, { p: NV.ouvSemaine, txt: 'Ouverture de la semaine', col: col.ouv, dash: [2, 3], t0: NV.ouvSemaineT }); }
    if (act.seances) { const { plages, balayages } = C.plagesSeances(B); for (const p of plages) M.zones.push({ t0: p.t0, t1: p.t1, h: p.h, l: p.l, rgb: col[p.id], txt: p.nom }); for (const b of balayages) M.marques.push({ t: b.t, p: b.p, txt: `balayage ${b.sens} ${b.de}`, col: '#ffd479', forme: 'losange' }); }
    if (act.ronds) { const pas = a && a * 6 > 50 ? 50 : 50; for (const p of C.ronds(prix, pas, 4)) M.lignes.push({ p, txt: p % 100 === 0 ? String(p) : String(p), col: col.rond, dash: [1, 5], w: p % 100 === 0 ? 1.3 : 1, discret: true }); }
    if (act.liquiditeZones) { const Lq = C.liquidite(serie.filter(b => !b.ref), { atr: a || null }); for (const e of Lq.egaux) M.lignes.push({ p: e.p, txt: e.sens === 'haut' ? 'hauts égaux' : 'bas égaux', col: col.liq, dash: [3, 3], w: 1.3, t0: e.t0 }); for (const e of Lq.intacts) M.lignes.push({ p: e.p, txt: e.sens === 'haut' ? 'haut non touché' : 'bas non touché', col: col.liq, dash: [1, 4], w: 1, t0: e.t, discret: true }); }
    if (act.cvd) { if (moteur.S.periode !== 'M15') M.notes.push('CVD / delta : choisis l\'unité M15 (les transactions Kraken sont cumulées par bougie de 15 min).'); else { const D = C.delta(B, carte); if (!D.bars.length) M.notes.push('CVD / delta : en attente des transactions Kraken en direct (cumul à partir de l\'ouverture de cette page).'); else { M.delta = { bars: D.bars, cvd: D.cvd, depuis: D.depuis, div: C.divergences(B, D.cvd) }; for (const d of M.delta.div) M.marques.push({ t: d.t, p: d.p, txt: 'divergence ' + d.sens, col: d.sens === 'baissiere' ? '#ef5f5f' : '#4fd18b', forme: 'triangle', haut: d.sens === 'baissiere' }); } } }
    return M;
  }
  function maj(force = false) {
    const act = graph.couches(), actifs = Object.keys(C.LIBELLES).filter(k => act[k] && k !== 'carteCarnet').join(','), B = base(), k = `${actifs}|${B.length}|${B.length ? B[B.length - 1].t + '|' + B[B.length - 1].c : ''}|${moteur.S.periode}|${Object.keys(carte).length}|${(carte[B.length ? B[B.length - 1].t : 0] || []).join()}`;
    if (!force && k === cle) return; cle = k; let m = null; try { m = actifs ? modele() : null; } catch (e) { console.warn('outils institutionnels :', e.message); }
    derniere = m; graph.institutionnel(m); notifier(m && m.notes ? m.notes : []);
  }
  const minuterie = setInterval(() => { try { if (lireFlux()) maj(); } catch (e) { /* */ } }, 1500);
  async function carteThermique(on) { if (!on) return; try { const m = await import('../../../planetes/mars/pc/liquidite/fenetre-liquidite.js'); await m.ouvrirCarte({}); } catch (e) { notifier(['Carte thermique du carnet : indisponible (' + e.message + ').']); } }
  return { maj, modele: () => derniere, cumul: () => carte, carteThermique, detruire() { clearInterval(minuterie); sauver(); } };
}
