/* ═════════════ PROPOSITIONS H1 : colle (données, registre forward, panneau, alertes) ═════════════
   Calculs : propositions-calcul.js (pur). Aucune valeur inventée : les chiffres de preuve viennent de recherche-or-donnees.json (recherche 2003–2019, frais déduits).
   Registre FORWARD daté, en AJOUT SEUL (localStorage `rayle_or_props_forward`) : chaque proposition notée à sa détection (avec le CVD Kraken mesuré par cette page), puis son résultat 6 bougies H1 plus tard
   (enregistrement séparé, jamais de modification). Ce registre est automatique et SIMULÉ : il n'entre pas dans le journal manuel de trades (il fausserait ses statistiques). Jamais un ordre. */
import * as P from './propositions-calcul.js';
import * as C from './institutionnel-calcul.js';
import { regrouperBougies } from './bougies-or.js';
const CLE = 'rayle_or_props_forward', CLE_ALERTES = 'rayle_or_props_alertes';
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sg = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '−') + nb(Math.abs(x), d));
export function creerPropositions({ racine, moteur, graph, instUI = null, parler = () => {}, maintenant = () => Date.now(), donnees = null, urlDonnees = null, auto = true } = {}) {
  /* le panneau est déplacé dans <body> : un panneau fixe dans la page de l'or pouvait être masqué par ses conteneurs */
  const pn = racine && racine.querySelector('[data-props]'); if (pn && pn.parentNode !== document.body) { const s = document.createElement('div'); s.className = 'tor'; s.style.cssText = 'display:contents'; s.appendChild(pn); document.body.appendChild(s); pn.querySelector('[data-a="fermer-props"]').addEventListener('click', () => ouvrir(false)); }
  const E = { donnees, actives: [], regime: null, derniereT: null, registre: lire(CLE, []), ouvert: false, alertes: lire(CLE_ALERTES, false) === true, dernierMessage: '' };
  async function chargerDonnees() { if (E.donnees) return; try { const u = urlDonnees || new URL('./recherche-or-donnees.json', import.meta.url).href; const r = await fetch(u, { cache: 'no-store' }); if (r.ok) E.donnees = await r.json(); } catch (e) { /* sans la recherche : tout reste « Lecture » */ } }
  const m15 = () => { const S = moteur.S, L = S.periode === 'M15' ? S.k : S.kM15; return (L || []).filter(b => !b.ref); };
  function h1Closes() { const n = maintenant(); const S = moteur.S; let L = (S.serieH1 || []).filter(b => !b.ref); if (L.length < 120) L = regrouperBougies(m15(), 3600e3); return L.filter(b => b.t + 3600e3 <= n).sort((a, b) => a.t - b.t); }
  const cvdA = t => { const c = instUI && instUI.cumul ? instUI.cumul() : null; if (!c) return null; const ks = Object.keys(c).map(Number).filter(k => k <= t); if (!ks.length) return null; return { v: ks.reduce((s, k) => s + c[k][0] - c[k][1], 0), depuis: Math.min(...Object.keys(c).map(Number)) }; };
  function contexte(B) {
    const M = m15(), NV = M.length > 20 ? C.niveauxPeriodes(M) : null, niv = []; const der = B[B.length - 1];
    if (NV) for (const [p, nom] of [[NV.pdh, 'plus haut de la veille'], [NV.pdl, 'plus bas de la veille'], [NV.pwh, 'plus haut de la semaine précédente'], [NV.pwl, 'plus bas de la semaine précédente']]) if (p != null) niv.push({ p, nom });
    for (const r of C.ronds(der.c, 50, 6)) niv.push({ p: r, nom: 'niveau rond de ' + r + ' $' }); const dernieres = B.slice(-48); niv.push({ p: Math.max(...dernieres.map(b => b.h)), nom: 'plus haut des 48 dernières heures' }, { p: Math.min(...dernieres.map(b => b.l)), nom: 'plus bas des 48 dernières heures' });
    const Pf = M.length > 40 ? C.profils(M, 1) : null; if (Pf && Pf.veille) niv.push({ p: Pf.veille.vah, nom: 'haut de la zone de valeur de la veille' }, { p: Pf.veille.val, nom: 'bas de la zone de valeur de la veille' }, { p: Pf.veille.poc, nom: 'POC de la veille' });
    const V = C.vwapSeance(M).filter(x => x.t <= der.t + 3600e3 - 900e3).pop(); return { niveaux: niv, vwap: V ? V.vwap : null, donnees: E.donnees };
  }
  function enregistrer(p) { if (E.registre.some(x => x.kind === 'proposition' && x.id === p.id)) return false; const c = cvdA(p.tCloture); const { preuve, ...reste } = p; E.registre.push({ kind: 'proposition', ...reste, preuveVariante: preuve && preuve.variante, cvd: c && c.v, cvdDepuis: c && c.depuis, notee: maintenant() }); if (E.registre.length > 3000) E.registre.splice(0, E.registre.length - 3000); ecrire(CLE, E.registre); return true; }
  function resoudreAnciennes(B) {
    for (const p of E.registre.filter(x => x.kind === 'proposition')) { if (E.registre.some(x => x.kind === 'resultat' && x.id === p.id)) continue; const r = P.resoudre(p, B); if (!r) continue; const c = cvdA(r.t); E.registre.push({ kind: 'resultat', id: p.id, ...r, cvd: c && c.v, notee: maintenant() }); }
    ecrire(CLE, E.registre);
  }
  function annoncer(p) { const t = 'Lecture H1 : ' + P.phrase(p); E.dernierMessage = t; if (!E.alertes) return; try { parler(t); } catch (e) { /* */ } try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Rayle · ' + p.nom, { body: P.phrase(p) }); } catch (e) { /* */ } }
  function maj(force = false) {
    const B = h1Closes(); if (B.length < 60) { E.regime = { sens: 0, raison: 'bougies H1 pas encore chargées' }; E.actives = []; graph.propositions([]); rendre(); return; }
    const t = B[B.length - 1].t; if (!force && t === E.derniereT) return; E.derniereT = t;
    const { propositions, regime } = P.detecter(B, contexte(B)); E.regime = regime; resoudreAnciennes(B);
    for (const p of propositions.filter(x => !x.ignoree)) if (enregistrer(p)) annoncer(p);
    E.ignorees = propositions.filter(x => x.ignoree);
    // actives : celles des 6 dernières bougies H1 closes, non résolues
    const ids = new Set(E.registre.filter(x => x.kind === 'resultat').map(x => x.id)); E.actives = E.registre.filter(x => x.kind === 'proposition' && !ids.has(x.id) && x.t >= B[Math.max(0, B.length - P.SORTIE_BOUGIES)].t).map(x => ({ ...x, preuve: P.preuve(x.type, E.donnees) }));
    graph.propositions(E.actives); rendre();
  }
  /* ── panneau ── */
  function carte(p) {
    const pr = p.preuve; const preuve = pr ? `<p class="tor-pr-pr"><b>Preuve (recherche ${esc(pr.periode || '')}, ${esc(pr.libelle)})</b> : ${pr.trades} trades · réussite ${nb((pr.tauxReussite ?? 0) * 100, 0)} % · R net CFD ${sg(pr.rNetCfd)} · Kraken ${sg(pr.rNetKraken)} · années rentables ${nb((pr.anneesRentables ?? 0) * 100, 0)} % · p ajusté ${pr.pHolm == null ? '—' : pr.pHolm} · ${esc(pr.statut)}.<br><small>${esc(pr.note)}</small></p>` : '<p class="tor-pr-pr"><b>Preuve</b> : indisponible (recherche non chargée).</p>';
    return `<article class="tor-pr-carte" data-prop="${esc(p.id)}"><header><b>${esc(p.nom)}</b> <span class="tor-pr-etq tor-pr-${esc(p.etiquette.replace(/[^a-z]/gi, '').toLowerCase())}">${esc(p.etiquette)}</span></header><p>${p.sens === 'achat' ? 'Lecture haussière' : 'Lecture baissière'} · clôture H1 de ${new Date(p.tCloture).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>`
      + `<dl><dt>Entrée</dt><dd>${nb(p.entree)}</dd><dt>Stop</dt><dd>${nb(p.stop)} <small>(${nb(p.stopAtr, 1)} ATR · −1 R)</small></dd><dt>Cible</dt><dd>${nb(p.cible)} <small>(${esc(p.niveauCible)})</small></dd><dt>R brut</dt><dd>${sg(p.rBrut, 1)} R <small>(avant frais)</small></dd>${p.cvd != null ? `<dt>CVD Kraken</dt><dd>${nb(p.cvd, 0)} <small>(cumul depuis l'ouverture de la page)</small></dd>` : ''}</dl><p><small>${esc(p.texte)}</small></p>${preuve}</article>`;
  }
  function rendre() {
    const el = racine && pn.querySelector('[data-props-corps]'); if (!el) return; const res = E.registre.filter(x => x.kind === 'resultat'), props = E.registre.filter(x => x.kind === 'proposition');
    const Rs = res.map(r => r.R), moy = Rs.length ? Rs.reduce((s, x) => s + x, 0) / Rs.length : null;
    const hist = props.slice(-15).reverse().map(p => { const r = res.find(x => x.id === p.id); return `<li>${new Date(p.t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(p.nom)} · ${p.sens} · ${esc(p.etiquette)} · ${r ? `${esc(r.issue)} ${sg(r.R, 2)} R brut` : 'en cours'}</li>`; }).join('');
    el.innerHTML = `<p class="tor-pr-statut">${esc(P.texteStatut(E.donnees))}</p><p class="tor-pr-regime">Régime actuel : ${esc(E.regime ? E.regime.raison : '—')}.</p>`
      + (E.actives.length ? E.actives.map(carte).join('') : `<p class="tor-pr-vide">Aucune proposition active à la dernière clôture H1.${E.ignorees && E.ignorees.length ? ' ' + esc(E.ignorees.map(x => x.type + ' : ' + x.raison).join(' · ')) : ''}</p>`)
      + `<details><summary>Registre forward (${props.length} noté${props.length > 1 ? 's' : ''}, ${res.length} résolu${res.length > 1 ? 's' : ''}${moy != null ? ` · R brut moyen ${sg(moy)}` : ''})</summary><p><small>Daté, en ajout seul, simulé : pour juger plus tard si les lectures se vérifient. Le CVD et le résultat 6 bougies H1 plus tard sont notés pour chacune.</small></p><ul class="tor-pr-hist">${hist || '<li>aucune pour l\'instant</li>'}</ul></details>`;
    const c = pn && pn.querySelector('[data-props-alertes]'); if (c) c.checked = E.alertes;
  }
  function ouvrir(o) { E.ouvert = o == null ? !E.ouvert : !!o; if (pn) pn.hidden = !E.ouvert; const b = racine.querySelector('[data-a="propositions-h1"]'); if (b) { b.classList.toggle('actif', E.ouvert); b.setAttribute('aria-pressed', String(E.ouvert)); } if (E.ouvert) { chargerDonnees().then(() => maj(true)); rendre(); } return E.ouvert; }
  function resume() { if (!E.actives.length) return 'Aucune proposition H1 active à la dernière clôture. ' + P.texteStatut(E.donnees) + (E.regime ? ' ' + E.regime.raison + '.' : ''); return P.texteStatut(E.donnees) + ' ' + E.actives.map(P.phrase).join(' '); }
  const c0 = pn && pn.querySelector('[data-props-alertes]'); if (c0) c0.addEventListener('change', e => { E.alertes = !!e.target.checked; ecrire(CLE_ALERTES, E.alertes); if (E.alertes && typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (x) { /* */ } } });
  let minuterie = null; if (auto) { chargerDonnees().then(() => maj(true)); minuterie = setInterval(() => { try { maj(); } catch (e) { /* */ } }, 20000); }
  /* crochet de test : injecte une proposition déjà construite (affichage, registre, dessin) */
  function injecter(p) { const prf = P.preuve(p.type, E.donnees); const q = { ...p, preuve: prf, etiquette: p.etiquette || P.etiquette(prf) }; enregistrer(q); E.actives = [{ ...q }]; graph.propositions(E.actives); rendre(); return q; }
  return { injecter, maj, ouvrir, resume, rendre, chargerDonnees, etat: () => ({ ...E, registre: E.registre.slice() }), registre: () => E.registre.slice(), detruire() { clearInterval(minuterie); } };
}
