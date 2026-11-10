/* ═════════════ TERMINAL : ANALYSES (partie B) — branchement sur la page ═════════════
   Tout est DÉSACTIVÉ par défaut (panneau « Couches »). Calculs purs : analyses-calcul.js, carnet-bougie-calcul.js, rapport-jour.js (testés).
   · couches dessinées sous forme de lignes / repères : VWAP, POC-VAH-VAL, extrêmes veille / semaine, séances, niveaux ronds, motifs, événements ;
   · bougie du carnet + delta + CVD : petit panneau sous le carnet (réglage de période 5 s / 15 s / 1 min / 5 min) ;
   · alertes d'événements sur MES niveaux (anti-doublon, délai minimum) : bandeau + voix si activée ; ne marchent que tant que Rayle est ouvert ;
   · « rapport du jour » (bouton, voix) et état étendu pour Rayle. Rien n'est un signal d'ordre. */
import * as A from './analyses-calcul.js';
import * as K from './carnet-bougie-calcul.js';
import { etatEtendu, rapportJour, estRapport } from './rapport-jour.js';
import { PAR_ID_T, fmt } from './actifs-terminal.js';
import { niveauxQuiComptent } from './lecture-rayle.js';

const lireJ = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : { ...d, ...JSON.parse(v) }; } catch (e) { return d; } };
const ecrireJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };
const ACTIFS_SUIVIS = ['OR', 'NASDAQ', 'BTC', 'SOL', 'DOGE'];
export const DELAI_ALERTE_MS = 15 * 60e3;

export async function monterAnalyses(T, { maintenant = () => Date.now() } = {}) {
  const G = T.graph;
  const E = { regl: lireJ('rayle_term_analyses', { periodeCarnet: '15s', briefing: false, alertes: true }), carnet: null, vusTx: 0, ancre: null, dernieresAlertes: new Map(), motifs: [], evenements: [], regime: null, detruit: false, actifCarnet: null };
  const nouvelleBougieCarnet = () => { E.carnet = K.creerBougiesCarnet(E.regl.periodeCarnet); E.vusTx = 0; E.actifCarnet = T.actif(); };
  nouvelleBougieCarnet();
  const B = () => (T.serie() ? T.serie().bougies() : []);
  const f = p => fmt(T.actif(), p);
  const on = id => !!T.couches()[id];

  /* niveaux « à moi » : lignes, zones, niveaux automatiques (la liste que Rayle utilise déjà) */
  function mesNiveaux() {
    const D = T.module('dessin'), na = T.niveauxAuto();
    const N = niveauxQuiComptent({ prix: T.prix(), atr: T.atr(), objets: D ? D.objets() : [], auto: na.niveaux ? na.niveaux.bandes : [], zones: D ? D.zones() : [], liquidites: [] });
    return N.dessus.concat(N.dessous).map(n => ({ p: n.p, nom: n.nom }));
  }
  function calculer() {
    const b = B(); if (b.length < 10) return;
    const N = mesNiveaux();
    E.motifs = A.lireMotifs(b, null, { niveaux: N, ma200: (T.valeursMA().ma200 || []).slice(-1)[0] || null, atr: T.atr() });
    E.regime = A.regime(b); E.evenements = A.evenementsNiveau(b, N);
  }

  /* ── dessin des couches : les calculs sont mis en cache tant que les bougies ne changent pas (le dessin est rappelé à chaque mouvement de souris) ── */
  const memo = new Map(); let memoP = null;
  const cache = (cle, fn) => { const b = B(), d = b.length ? b[b.length - 1] : null, k = `${T.actif()}|${T.unite()}|${b.length}|${d ? d.t + ':' + d.c : ''}`; const m = memo.get(cle); if (m && m.k === k) return m.v; const v = fn(b); memo.set(cle, { k, v }); return v; };
  const trait = (ctx, D, p, couleur, etiquette, dash = [4, 4]) => { const y = G.yDe(p); if (y == null) return; ctx.strokeStyle = couleur; ctx.lineWidth = 1; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(D.width, y); ctx.stroke(); ctx.setLineDash([]); if (etiquette) { ctx.fillStyle = couleur; ctx.font = '10px Segoe UI, system-ui, sans-serif'; ctx.fillText(etiquette + ' ' + f(p), 6, y - 3); } };
  G.ajouterPrimitive((ctx, D) => {
    const b = B(); if (!b.length) return;
    if (on('vwap')) { const V = cache('vwap', bb => A.vwapSeance(bb, maintenant())); const dernier = V[V.length - 1]; if (dernier && dernier.v != null) { ctx.strokeStyle = 'rgba(201,178,122,.9)'; ctx.lineWidth = 1.4; ctx.beginPath(); let debut = false; const S = cache('vwapBougies', bb => A.bougiesDuJour(bb, new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(bb[bb.length - 1].t)))); S.forEach((x, i) => { const X = G.xDe(x.t), Y = G.yDe(V[i].v); if (X == null || Y == null) return; if (!debut) { ctx.moveTo(X, Y); debut = true; } else ctx.lineTo(X, Y); }); ctx.stroke(); ctx.fillStyle = 'rgba(201,178,122,.9)'; ctx.font = '10px Segoe UI, system-ui, sans-serif'; ctx.fillText('VWAP séance ' + f(dernier.v), 6, 12); } }
    if (on('vwapAncre') && E.ancre != null) { const V = A.vwapAncre(b, E.ancre), S = b.filter(x => x.t >= E.ancre); ctx.strokeStyle = 'rgba(143,208,227,.95)'; ctx.lineWidth = 1.4; ctx.beginPath(); let debut = false; S.forEach((x, i) => { const X = G.xDe(x.t), Y = G.yDe(V[i].v); if (X == null || Y == null) return; if (!debut) { ctx.moveTo(X, Y); debut = true; } else ctx.lineTo(X, Y); }); ctx.stroke(); }
    if (on('profilVolume')) { const vis = G.visibles ? G.visibles() : b, cleP = vis.length + ':' + (vis[0] ? vis[0].t : 0) + ':' + (vis.length ? vis[vis.length - 1].t + ':' + vis[vis.length - 1].c : 0); if (!memoP || memoP.k !== cleP) memoP = { k: cleP, v: A.profilVolume(vis) }; const P = memoP.v; if (P && P.poc != null) { trait(ctx, D, P.poc, 'rgba(255,214,102,.9)', 'POC', []); trait(ctx, D, P.vah, 'rgba(255,214,102,.55)', 'VAH'); trait(ctx, D, P.val, 'rgba(255,214,102,.55)', 'VAL'); } }
    if (on('extremes')) { const X = cache('extremes', bb => A.extremes(bb, maintenant())); if (X.veille) { trait(ctx, D, X.veille.haut, 'rgba(180,180,200,.7)', 'haut veille'); trait(ctx, D, X.veille.bas, 'rgba(180,180,200,.7)', 'bas veille'); } if (X.semainePrecedente) { trait(ctx, D, X.semainePrecedente.haut, 'rgba(150,150,170,.6)', 'haut semaine', [2, 5]); trait(ctx, D, X.semainePrecedente.bas, 'rgba(150,150,170,.6)', 'bas semaine', [2, 5]); } }
    if (on('seances')) for (const s of cache('seances', bb => A.plagesSeances(bb, maintenant()))) if (s.haut != null) { trait(ctx, D, s.haut, 'rgba(120,200,160,.6)', s.nom + ' haut', [1, 5]); trait(ctx, D, s.bas, 'rgba(120,200,160,.6)', s.nom + ' bas', [1, 5]); }
    if (on('rondes')) for (const n of A.niveauxRonds(T.prix())) trait(ctx, D, n.p, 'rgba(200,200,200,.28)', '', [1, 6]);
    if (on('motifs')) { ctx.font = '10px Segoe UI, system-ui, sans-serif'; const L = cache('motifsMarq', bb => bb.slice(-60).map((x, k, arr) => ({ x, ids: A.motifsA(bb, bb.length - arr.length + k) })).filter(o => o.ids.length)); for (const o of L) { const X = G.xDe(o.x.t), Y = G.yDe(o.x.h); if (X == null || Y == null) continue; ctx.fillStyle = 'rgba(143,208,227,.9)'; ctx.fillText('◆ ' + o.ids.map(id => A.MOTIFS[id].nom).join(', '), X - 10, Y - 6); } }
    if (on('evenements') && E.regime && E.regime.regime === 'range') { const y0 = G.yDe(E.regime.haut), y1 = G.yDe(E.regime.bas); if (y0 != null && y1 != null) { ctx.fillStyle = 'rgba(143,208,227,.07)'; ctx.fillRect(0, y0, D.width, y1 - y0); ctx.fillStyle = 'rgba(143,208,227,.85)'; ctx.font = '10px Segoe UI, system-ui, sans-serif'; ctx.fillText('range (définition figée ' + 'regime-lecture-v1)', 6, y0 + 12); } }
  }, 'top');
  T.on('couches', () => G.redessiner()); T.on('cloture', () => { calculer(); G.redessiner(); verifierAlertes(); });
  /* VWAP ancré : un clic sur une bougie (graphique) pose l'ancre quand la couche est active */
  G.el && G.el.addEventListener && G.el.addEventListener('click', ev => { if (!on('vwapAncre')) return; const r = G.el.getBoundingClientRect(), t = G.tDe(ev.clientX - r.left); if (t != null) { E.ancre = t; G.redessiner(); } });

  /* ── panneau « bougie du carnet » sous le carnet ── */
  const hote = T.q('.tr-carnet') || T.q('[data-carnet]');
  const panneau = document.createElement('div'); panneau.className = 'tr-bougie-carnet'; panneau.hidden = true;
  panneau.innerHTML = '<div class="tr-bc-tete"><b>Pression du carnet</b> <select data-bc-periode>' + Object.keys(K.PERIODES).map(p => `<option value="${p}"${p === E.regl.periodeCarnet ? ' selected' : ''}>${p}</option>`).join('') + '</select> <span data-bc-texte class="tr-doux"></span></div><canvas data-bc-canvas width="300" height="110"></canvas><div class="tr-mini">' + K.MENTION_BOUGIE + ' Information de lecture, pas un signal.</div>';
  if (hote) hote.appendChild(panneau);
  panneau.querySelector('[data-bc-periode]').addEventListener('change', e => { E.regl.periodeCarnet = e.target.value; ecrireJ('rayle_term_analyses', E.regl); nouvelleBougieCarnet(); });
  let cvdTotal = 0;
  function echantillonCarnet() {
    if (document.hidden || !on('carnetBougie')) { panneau.hidden = true; return; }
    panneau.hidden = false;
    if (E.actifCarnet !== T.actif()) { nouvelleBougieCarnet(); cvdTotal = 0; }
    const c = T.etatCarnet(); if (!c) return;
    const p = K.pression(c.carnet); if (p) E.carnet.ajouterPression(maintenant(), p.valeur);
    const tr = c.transactions || []; for (const x of tr.slice(E.vusTx)) E.carnet.ajouterEchange(x.t || maintenant(), x.q || 0, x.cote); cvdTotal += tr.slice(E.vusTx).reduce((s, x) => s + (x.cote === 'buy' ? 1 : -1) * (x.q || 0), 0); E.vusTx = tr.length;
    dessinerPanneau();
  }
  function dessinerPanneau() {
    const cv = panneau.querySelector('[data-bc-canvas]'), ctx = cv.getContext('2d'), L = E.carnet.bougies().slice(-30), W = cv.width, H = cv.height, mid = H * 0.38;
    ctx.clearRect(0, 0, W, H); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
    const w = W / 30, y = v => mid - v * (mid - 4), dMax = Math.max(1e-9, ...L.map(b => Math.abs(b.delta || 0)));
    L.forEach((b, i) => { const x = i * w + w / 2, haussier = b.c >= b.o; ctx.strokeStyle = ctx.fillStyle = haussier ? '#4fd18b' : '#ef6a5f'; ctx.beginPath(); ctx.moveTo(x, y(b.h)); ctx.lineTo(x, y(b.l)); ctx.stroke(); const y0 = y(b.o), y1 = y(b.c); ctx.fillRect(x - w * 0.3, Math.min(y0, y1), w * 0.6, Math.max(1, Math.abs(y1 - y0)));
      ctx.globalAlpha = 0.45; ctx.fillStyle = b.delta >= 0 ? '#8fd0e3' : '#c9b27a'; const hd = (Math.abs(b.delta || 0) / dMax) * (H - mid - 8); ctx.fillRect(x - w * 0.3, b.delta >= 0 ? H - hd : H - hd, w * 0.6, hd); ctx.globalAlpha = 1; });
    panneau.querySelector('[data-bc-texte]').textContent = K.lectureBougieCarnet(E.carnet.derniere(), x => String(x)).split('. ')[0] + (on('cvd') ? ` · CVD ${Math.round(cvdTotal * 1000) / 1000}` : '');
  }
  const timerCarnet = setInterval(echantillonCarnet, 1000);

  /* ── alertes d'événements sur mes niveaux ── */
  function verifierAlertes() {
    if (!E.regl.alertes) return;
    const D = T.module('dessin'), a = T.actif();
    for (const ev of E.evenements) {
      if (ev.type === 'traversee') continue;   // seules les cassures confirmées, retournements et faux mouvements alertent
      const cle = `${a}|${ev.type}|${ev.sens}|${Math.round(ev.p * 100)}`, dernier = E.dernieresAlertes.get(cle);
      if (dernier && maintenant() - dernier < DELAI_ALERTE_MS) continue;   // anti-doublon + délai minimum
      E.dernieresAlertes.set(cle, maintenant());
      const texte = `${PAR_ID_T[a].nom} : ${ev.texte}. Information de lecture, pas un signal ni une promesse.`;
      T.bandeau && T.bandeau(texte);
      T.emettre('alerte', { type: 'evenement', texte, phrase: texte });
      if (D && D.E.regl.voix && typeof window.speak === 'function') window.speak(texte);
    }
  }

  /* ── état étendu pour Rayle et rapport du jour ── */
  function chaleurResume() { const C = T.module('chaleur'); return C && C.resume ? C.resume() : null; }
  function etat(base) {
    const I = {}; const b = B();
    try { const P = A.profilVolume(b); if (P && P.poc != null) Object.assign(I, { poc: P.poc, vah: P.vah, val: P.val }); const V = A.vwapSeance(b); if (V.length) I.vwap = V[V.length - 1].v; I.cvd = cvdTotal; const ab = A.absorption(b, (T.etatCarnet() || {}).transactions || []); if (ab) I.deduction = ab.texte; } catch (e) { /* */ }
    const bc = E.carnet.derniere(), dd = T.dash.donnees();
    return etatEtendu({ base, motifs: E.motifs, chaleur: chaleurResume(), bougieCarnet: bc ? { texte: K.lectureBougieCarnet(bc), pression: bc.c, delta: bc.delta } : null, institutionnel: I, regimeInfo: E.regime, evenements: E.evenements,
      annonces: (dd.annonces || []).map(x => ({ ...x, dansMin: Math.round((x.t - maintenant()) / 60e3), sortie: x.t < maintenant() })), cot: dd.cot, rapports: dd.rapports || [], actus: dd.actus || [], sante: T.sante(), positions: [], journal: null });
  }
  async function actifsPourRapport() {
    const annonces = (T.dash.donnees().annonces || []).filter(x => x.impact === 'fort').map(x => ({ titre: x.titre, devise: x.devise, t: x.t, sortie: x.t < maintenant() }));
    const un = async a => {   // en parallèle, avec un délai maximum par actif : un actif lent ne bloque pas le rapport
      try {
        const s = a === T.actif() ? T.serie() : await Promise.race([T.serieDe(a, 'H1'), new Promise((_, ko) => setTimeout(() => ko(new Error('délai')), 12000))]);
        const bg = s ? s.bougies() : [], prix = bg.length ? bg[bg.length - 1].c : null;
        return { nom: PAR_ID_T[a].nom, id: a, B: bg, prix, ma200: null, tendances: {}, niveaux: {}, annonces, motifs: a === T.actif() ? E.motifs : [], evenements: a === T.actif() ? E.evenements : [] };
      } catch (e) { return { nom: PAR_ID_T[a].nom, id: a, B: [], prix: null }; }
    };
    const R = await Promise.all(ACTIFS_SUIVIS.map(un));
    return R;
  }
  async function rapport(detail = 'normal') {
    const L = await actifsPourRapport();
    const x = L.find(o => o.id === T.actif()); if (x) { const e = T.etatCarnet(); x.pressionCarnet = e && K.pression(e.carnet) ? K.pression(e.carnet).valeur : null; x.carnet = e ? { lecture: E.carnet.derniere() ? K.lectureBougieCarnet(E.carnet.derniere()).split('. ')[0] : 'carnet reçu' } : null; }
    return rapportJour(L, { fmt: (nom, p) => { const id = (L.find(o => o.nom === nom) || {}).id || T.actif(); return fmt(id, p); }, heure: t => new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).replace(':', ' h '), maintenant: maintenant(), detail });
  }
  calculer();
  return { etat, rapport, estRapport, calculer, regl: E.regl, evenements: () => E.evenements, motifs: () => E.motifs, regime: () => E.regime, bougiesCarnet: () => E.carnet, definirAncre: t => { E.ancre = t; G.redessiner(); },
    detruire() { clearInterval(timerCarnet); panneau.remove(); } };
}
