/* ═════════════ HISTORIQUE DES FLÈCHES : interface (sélecteur de période, progression, ligne « Période de réglage », carte « Bilan des flèches ») ═════════════
   Calcul : fleches-historique-v1.js (rejeu causal de la v8 FIGÉE, dans un Worker de module : l'interface n'est jamais bloquée), cache IndexedDB ; mesures : fleches-bilan-v1.js.
   Ici seulement l'affichage. Aucun texte sur le graphique pour les flèches (le détail est dans l'infobulle). Outil de lecture, jamais un ordre ni une promesse de gain. */
import { historiqueAvecCache, ouvrirCache, calculerHistorique, colorees, FENETRES, depuisFenetre, CHRONO } from './fleches-historique-v1.js'; import { DEPART as DEPART_V8, VERSION as VERSION_V8 } from './fleches-simples-v8.js';
import { REGLAGE_T, PARAMS, fraisUsd } from './fleches-bilan-v1.js';
import { resultat } from './fleches-terminal-v1.js';
import { chargerHistorique, decalerBougies } from './historique-or.js';

/* série H1 LONGUE du graphique : référence Binance XAUUSDT décalée de −4,88 $ avant la 1re bougie Kraken (décalage fixe : une valeur qui bougerait relancerait tout le calcul), puis Kraken PF_XAUUSD ; 730 jours au plus */
export const DECALAGE_REF = -4.88;
const fusionT = (a, b) => { const m = new Map(); for (const x of a) m.set(x.t, x); for (const x of b) m.set(x.t, x); return [...m.values()].sort((x, y) => x.t - y.t); };

export const CLE_FEN = 'rayle_or_fleches_hist_fenetre', CLE_CARTE = 'rayle_or_fleches_bilan_ouvert', FEN_DEFAUT = '3m';
export const FEN_LIB = Object.freeze({ '1m': '1 mois', '3m': '3 mois', '6m': '6 mois', tout: 'Tout' });
export const TEXTE_REGLAGE = 'Période de réglage : à partir du 1er octobre 2026, début de la période regardée pour régler les règles. Tout ce qui est avant cette ligne est du test hors échantillon.';
const H = 3600e3, lireJ = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, ecrireJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* refusé */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f2 = (x, n = 2) => x == null || !Number.isFinite(x) ? 'n/d' : x.toFixed(n).replace('.', ','), pc = x => x == null ? 'n/d' : Math.round(x * 100) + ' %', pfx = x => x == null ? 'n/d' : x === Infinity ? '∞' : f2(x);
export const fenetreValide = c => Object.prototype.hasOwnProperty.call(FENETRES, c) ? c : FEN_DEFAUT;

/* texte de la carte (pur, testé) : res = résultat de analyserEnsembles, nFleches = { avant, apres } */
export function texteBilan(res, nFleches, fenetre) {
  const ligne = (cle, nom) => { const s = res.S[cle], h = res.Hs[cle]; if (!s || !s.n) return `<tr><td>${nom}</td><td>0</td><td colspan="4">pas assez de données</td></tr>`; if (!s.assez) return `<tr><td>${nom}</td><td>${s.n}</td><td colspan="4">pas assez de données (n &lt; ${PARAMS.nMin})</td></tr>`;
    return `<tr><td>${nom}</td><td>${s.n}</td><td>${pc(s.reussiteBrut)} / ${pc(s.reussite)}</td><td>${f2(s.Rmoy)} / ${f2(s.RmoyNet)}</td><td>${pfx(s.pf)} / ${pfx(s.pfNet)}</td><td>${res.verd[cle]}${h ? ` <small>(hasard ${f2(h.moyHasard)} R, place ${pc(h.place)})</small>` : ''}</td></tr>`; };
  const bloc = (per, titre, nf) => `<tr class="fb-t"><th colspan="6">${titre} · ${nf} flèche${nf > 1 ? 's' : ''}</th></tr>${ligne(per + '|tous', 'tous')}${ligne(per + '|achats', 'achats')}${ligne(per + '|ventes', 'ventes')}`;
  return `<div class="fb-sous">Période affichée : ${esc(FEN_LIB[fenetre] || '')}. Trades simulés : entrée à la clôture de confirmation, stop = bord de zone + 0,2 ATR, TP1 à 1 R, TP2 à 2 R, sortie forcée après 48 bougies, stop prioritaire si stop et cible dans la même bougie. Frais : spread ${PARAMS.spreadPb} pb + glissement ${PARAMS.glissementPb} pb (${f2(fraisUsd(4000))} $ à 4 000 $). Colonnes : brut / net de frais.</div>
<table class="fb-tab"><thead><tr><th></th><th>n</th><th>Réussite</th><th>R moyen</th><th>Profit factor</th><th>Contre le hasard (1 000 tirages, Holm)</th></tr></thead><tbody>${bloc('avant', 'Avant la période de réglage (hors échantillon)', nFleches.avant)}${bloc('apres', 'Depuis le 1er octobre 2026 (période de réglage)', nFleches.apres)}</tbody></table>
<div class="fb-note"><b>Règles réglées sur la période récente : le hors échantillon est la partie utile.</b> L'or a monté puis baissé : achats et ventes sont séparés pour ne pas confondre tendance et signal. « Pas mieux que le hasard » est le résultat attendu tant que rien n'est démontré. Jamais un ordre.</div>`;
}

export function monterHistorique(T, R, { maintenant = () => Date.now(), surChangement = () => {}, creerWorker = null, cache = ouvrirCache() } = {}) {
  const S = { fenetre: fenetreValide(lireJ(CLE_FEN, FEN_DEFAUT)), res: null, progres: null, calcul: false, redo: false, erreur: null, cle: '', bilan: null, bilanCle: '', ouvert: !!lireJ(CLE_CARTE, false), t0: 0, depuisCache: false };
  let worker = null, mode = 'worker', serieFn = null, promesseLongue = null;
  const serieLongue = () => promesseLongue || (promesseLongue = (async () => { const Hh = await chargerHistorique('H1', { jours: 730 }); return fusionT(decalerBougies(Hh.ref, DECALAGE_REF), Hh.k).filter(b => b.c > 0); })().catch(() => { promesseLongue = null; return null; }));
  /* ── interface : sélecteur + bouton dans le menu Couches ; carte repliable sur le graphique ── */
  if (!document.querySelector('style[data-fh]')) { const st = document.createElement('style'); st.dataset.fh = ''; st.textContent = '.tor-fh{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:4px 0;font:12px system-ui,sans-serif}.tor-fh select,.tor-fh button{font:inherit;min-height:28px}.tor-fh [data-fh-etat]{opacity:.75}'
    + '.tor-fb{position:absolute;top:34px;left:8px;z-index:7;max-width:min(780px,calc(100% - 16px));max-height:70%;overflow:auto;background:rgba(8,12,16,.94);color:#d7e3ea;border:1px solid #2b3a44;border-radius:6px;padding:8px 10px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5)}.tor-fb h4{margin:0 0 4px;font-size:13px;display:flex;justify-content:space-between;gap:8px}.tor-fb button{background:none;border:0;color:inherit;font-size:16px;cursor:pointer;min-width:28px;min-height:28px}.tor-fb table{border-collapse:collapse;width:100%}.tor-fb td,.tor-fb th{padding:2px 5px;text-align:left;border-bottom:1px solid #1c2a33;vertical-align:top}.tor-fb .fb-t th{background:#152028;font-size:11px}.tor-fb .fb-sous,.tor-fb .fb-note{opacity:.8;font-size:11px;margin:4px 0}.tor-fb small{opacity:.7}'; document.head.appendChild(st); }
  const zoneCouches = () => R.querySelector('[data-tp-couches]') || R.querySelector('.tor-couches-corps');
  function placer() {
    const z = zoneCouches(); if (!z || z.querySelector('[data-fh]')) return;
    const d = document.createElement('div'); d.className = 'tor-fh'; d.dataset.fh = '';
    d.innerHTML = `<label>Historique des flèches <select data-fh-fen>${Object.keys(FENETRES).map(k => `<option value="${k}">${FEN_LIB[k]}</option>`).join('')}</select></label><button type="button" data-fh-bilan aria-expanded="false">Bilan des flèches</button><span data-fh-etat role="status" aria-live="polite"></span>`; z.appendChild(d);
    const sel = d.querySelector('[data-fh-fen]'); sel.value = S.fenetre; sel.addEventListener('change', () => { S.fenetre = fenetreValide(sel.value); ecrireJ(CLE_FEN, S.fenetre); S.bilanCle = ''; surChangement(); majBilan(); etatTexte(); });
    d.querySelector('[data-fh-bilan]').addEventListener('click', () => { S.ouvert = !S.ouvert; ecrireJ(CLE_CARTE, S.ouvert); montrerCarte(); majBilan(); });
  }
  const zone = R.querySelector('[data-graph]'), carte = document.createElement('div'); carte.className = 'tor-fb'; carte.dataset.fb = ''; carte.hidden = true; carte.setAttribute('role', 'region'); carte.setAttribute('aria-label', 'Bilan des flèches');
  carte.innerHTML = '<h4><span>Bilan des flèches</span><button type="button" data-fb-x aria-label="Fermer le bilan">×</button></h4><div data-fb-corps>Calcul en cours…</div>'; if (zone) { zone.style.position = zone.style.position || 'relative'; zone.appendChild(carte); }
  carte.querySelector('[data-fb-x]').addEventListener('click', () => { S.ouvert = false; ecrireJ(CLE_CARTE, false); montrerCarte(); });
  const montrerCarte = () => { carte.hidden = !S.ouvert; const b = R.querySelector('[data-fh-bilan]'); if (b) b.setAttribute('aria-expanded', String(S.ouvert)); };
  const etatTexte = () => { const e = R.querySelector('[data-fh-etat]'); if (!e) return; e.textContent = S.erreur ? 'Historique indisponible : ' + S.erreur : S.calcul ? `Calcul de l'historique… ${Math.round((S.progres || 0) * 100)} %` : S.res ? `${colorees(S.res.fleches).length} flèches calculées${S.depuisCache ? ' (cache)' : ''}` : ''; };

  /* ── calcul : Worker de module (jamais de blocage) ; repli : thread principal par petits morceaux ── */
  const calculerWorker = (B, o) => new Promise((ok, ko) => {
    try { if (!worker) worker = creerWorker ? creerWorker() : new Worker(new URL('./fleches-historique-worker.js', import.meta.url), { type: 'module' }); } catch (e) { ko(e); return; }
    const fin = () => { worker.onmessage = null; worker.onerror = null; };
    worker.onmessage = e => { const m = e.data; if (m.type === 'progres') o.onProgres && o.onProgres(m.v); else if (m.type === 'fini') { fin(); ok(m.res); } else if (m.type === 'erreur') { fin(); ko(new Error(m.message)); } };
    worker.onerror = e => { fin(); worker = null; ko(new Error(e.message || 'Worker indisponible')); };
    worker.postMessage({ type: 'historique', B, depart: o.depart || 0 });
  });
  /* longue série : plusieurs Workers en parallèle (un segment chacun, avec contexte et recouvrement : même résultat que le rejeu continu, vérifié par les tests), au plus 4 */
  const calculerSegments = (B, o) => new Promise((ok, ko) => {
    const dep = Math.max(DEPART_V8, 40), n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)), pas = Math.ceil((B.length - dep) / n), tab = [], prog = new Array(n).fill(0), ws = [];
    for (let a = dep, k = 0; a < B.length; a += pas, k++) tab.push({ a, b: Math.min(B.length, a + pas), k });
    const finTout = () => { for (const w of ws) { try { w.terminate(); } catch (e) { /* */ } } }; let reste = tab.length; const sorties = [];
    const progres = () => o.onProgres && o.onProgres(prog.reduce((s, x) => s + x, 0) / tab.length);
    for (const T of tab) {
      let w; try { w = creerWorker ? creerWorker() : new Worker(new URL('./fleches-historique-worker.js', import.meta.url), { type: 'module' }); } catch (e) { finTout(); ko(e); return; } ws.push(w);
      w.onmessage = e => { const m = e.data; if (m.type === 'progres') { prog[T.k] = m.v; progres(); } else if (m.type === 'erreur') { finTout(); ko(new Error(m.message)); } else if (m.type === 'fini') { prog[T.k] = 1; progres(); sorties.push(m.res); w.terminate(); if (--reste === 0) {
        const fl = new Map(), inval = new Map(), ret = {}; for (const s of sorties) { for (const f of s.fleches) fl.set(f.id, f); for (const q of s.invalidees) inval.set(q.id, q.invalideeT); for (const [x, c] of Object.entries(s.retirees)) ret[x] = (ret[x] || 0) + c; }
        const L = [...fl.values()].sort((x, y) => x.i - y.i || (x.id < y.id ? -1 : 1)); for (const f of L) if (inval.has(f.id)) { f.invalidee = true; f.invalideeT = inval.get(f.id); }
        ok({ fleches: L, retirees: ret, n: B.length, version: VERSION_V8, calculeLe: Date.now(), invalidees: [...inval].map(([id, invalideeT]) => ({ id, invalideeT })) }); } } };
      w.onerror = e => { finTout(); ko(new Error(e.message || 'Worker indisponible')); };
      const lo = Math.max(0, T.a - CHRONO.recouvrement - CHRONO.contexte); w.postMessage({ type: 'segment', S: B.slice(lo, T.b), lo, a: T.a, b: T.b });
    }
  });
  const calculerPrincipal = (B, o) => calculerHistorique(B, { depart: o.depart || 0, morceau: 150, onProgres: o.onProgres, cede: () => new Promise(r => setTimeout(r, 0)) });
  const calculer = async (B, o) => { if (mode === 'worker') { try { return (!o.depart && B.length > 2500 && typeof navigator !== 'undefined') ? await calculerSegments(B, o) : await calculerWorker(B, o); } catch (e) { mode = 'principal'; } } return calculerPrincipal(B, o); };

  async function demander() {
    if (!T.h1) return; const courte = T.h1().filter(b => b.t + H <= maintenant() && b.c > 0); let longue = null; try { longue = await (serieFn ? serieFn() : serieLongue()); } catch (e) { longue = null; }
    const closes = longue && longue.length ? fusionT(longue.filter(b => b.t + H <= maintenant()), courte) : courte; if (closes.length < 300) return;
    const cle = closes.length + '|' + closes[0].t + '|' + closes[closes.length - 1].t + '|' + closes[closes.length - 1].c; if (cle === S.cle) return;
    if (S.calcul) { S.redo = true; return; } S.cle = cle; S.calcul = true; S.erreur = null; S.progres = 0; S.t0 = Date.now(); etatTexte();
    try {
      const r = await historiqueAvecCache(closes, cache, { id: 'or-h1', calculer, onProgres: v => { S.progres = v; etatTexte(); } });
      if (r) { const H1 = closes; S.res = { ...r, fleches: r.fleches.map(f => f.resultat ? f : { ...f, resultat: resultat(H1, f) }), closes: H1 }; S.depuisCache = !!r.depuisCache; }
    } catch (e) { S.erreur = String(e && e.message || e).slice(0, 80); }
    S.calcul = false; etatTexte(); surChangement(); majBilan(); if (S.redo) { S.redo = false; S.cle = ''; setTimeout(demander, 50); }
  }

  /* ── bilan (Worker : 1 000 tirages × 6 ensembles hors du fil principal) ── */
  function majBilan() {
    if (!S.ouvert || !S.res) return; const de = depuisFenetre(S.fenetre, maintenant()), cle = S.fenetre + '|' + S.cle; if (S.bilanCle === cle) return; S.bilanCle = cle;
    const corps = carte.querySelector('[data-fb-corps]'); corps.textContent = 'Calcul du bilan…';
    const nF = { avant: colorees(S.res.fleches).filter(f => f.tCloture >= de && f.tCloture < REGLAGE_T).length, apres: colorees(S.res.fleches).filter(f => f.tCloture >= Math.max(de, REGLAGE_T)).length };
    const fait = res => { if (S.bilanCle !== cle) return; S.bilan = res; corps.innerHTML = texteBilan(res, nF, S.fenetre); };
    let w = null; try { w = creerWorker ? creerWorker() : new Worker(new URL('./fleches-historique-worker.js', import.meta.url), { type: 'module' }); } catch (e) { w = null; }
    if (w) { w.onmessage = e => { if (e.data.type === 'bilan-fini') { fait(e.data.res); w.terminate(); } else if (e.data.type === 'erreur') { corps.textContent = 'Bilan indisponible : ' + e.data.message; w.terminate(); } }; w.onerror = () => { corps.textContent = 'Bilan indisponible (Worker).'; }; w.postMessage({ type: 'bilan', B: S.res.closes, fleches: S.res.fleches, de, a: null }); }
    else corps.textContent = 'Bilan indisponible : Worker non pris en charge par ce navigateur.';
  }

  return {
    fixerSerie(f) { serieFn = f; S.cle = ''; }, recalculer() { S.cle = ''; S.bilanCle = ''; return demander(); }, placer, demander, montrerCarte, majBilan, etat: () => ({ fenetre: S.fenetre, calcul: S.calcul, progres: S.progres, erreur: S.erreur, n: S.res ? S.res.fleches.length : 0, depuisCache: S.depuisCache, ouvert: S.ouvert, mode }),
    fenetre: () => S.fenetre, fixerFenetre(c) { S.fenetre = fenetreValide(c); ecrireJ(CLE_FEN, S.fenetre); const s = R.querySelector('[data-fh-fen]'); if (s) s.value = S.fenetre; S.bilanCle = ''; surChangement(); majBilan(); },
    fixerOuvert(o) { S.ouvert = !!o; ecrireJ(CLE_CARTE, S.ouvert); montrerCarte(); majBilan(); }, bilan: () => S.bilan,
    flechesAnciennes: () => (S.res ? S.res.fleches : []), depuis: n => depuisFenetre(S.fenetre, n), attendre: async () => { for (let k = 0; k < 3000 && (S.calcul || S.redo); k++) await new Promise(r => setTimeout(r, 100)); }
  };
}
