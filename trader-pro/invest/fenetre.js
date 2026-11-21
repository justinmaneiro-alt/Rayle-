/* ═════════════ FENÊTRE « INVESTISSEMENT » V2 : tout l'univers XTB, un modèle multi-facteurs par horizon ═════════════
   Barre du haut : horizon (tactique · swing/saisonnier · 1–3 ans · 5–10 ans) + fenêtre de détention (mois d'achat → mois de vente) + devise d'affichage.
   Liste virtualisée (plus de 3 000 lignes fluides) ; filtrage, tri et scores recalculés dans un Web Worker (repli sur le fil principal). Données : JSON calculés chaque nuit (voir donnees-invest.js).
   Fiche au clic (fiche.js). Rayle pilote la fenêtre à la voix (voix-invest.js) via `piloter()`. Estimations chiffrées avec leurs hypothèses : ni prévision ni conseil. */
import { esc, nf, lireLS, ecrireLS, age } from '../commun/ui.js';
import { lireConn } from '../portefeuille/stockage.js';
import { parler } from '../commun/ia.js';
import { creerDonnees, CLASSES } from './donnees-invest.js';
import { HORIZONS, verdictLigne, pourquoi, LIBELLES, POIDS, NOM_FACTEUR } from './modele.js';
import { contactTechnique, estBon } from './plan.js';
import { vuePlan } from './plan-ui.js';
import { suiviHtml } from './suivi-ui.js';
import { calculerListe, PREREGLAGES, CAPS } from './calcul-liste.js';
import { fenetreDefaut, libelleFenetre, MOIS, meilleuresFenetres, decoder } from './saison.js';
import { rendreFiche, badgeLib, drapeau, CLASSE_LIB } from './fiche.js';
import { detecterAlertes, phraseAlertes } from './alertes.js';
import { NOM_PAYS } from './pays.js';

const LS = { etat: 'rayle_lt2_etat', liste: 'rayle_lt_liste_v1', alertes: 'rayle_lt2_alertes', resume: 'rayle_invest_resume_v1' }, HAUT = 46;
const sg = (v, d = 0) => (Number.isFinite(v) ? (v >= 0 ? '+' : '−') + nf(Math.abs(v) * 100, d) + ' %' : '—'), pc = (v, d = 0) => (Number.isFinite(v) ? nf(v * 100, d) + ' %' : '—');
let instance = null; export const etat = () => (instance ? instance.etat() : { actif: false });
const FILTRE0 = { classe: 'action', zone: '', pays: '', secteur: '', caps: [], exclureMega: false, pea: false, dispo: '', qMin: 0, liqMin: 0, texte: '', palier: '' };

/* ───── calcul : Web Worker avec repli ───── */
function creerCalculateur() {
  let w = null, n = 0, lignes = [], encodes = null, ref = null, cache = new Map(); const attente = new Map(); let importe = null;
  try { w = new Worker(new URL('./tableau-worker.js', import.meta.url), { type: 'module' }); w.onmessage = e => { const m = e.data, a = attente.get(m.n); if (a) { attente.delete(m.n); m.type === 'erreur' ? a.rej(new Error(m.message)) : a.ok(m); } }; w.onerror = () => { w = null; for (const a of attente.values()) a.rej(new Error('worker')); attente.clear(); }; } catch (e) { w = null; }
  const local = async p => { importe = importe || await import('./calcul-liste.js'); const r = importe.calculerListe(lignes, { ...p, encodes, ref, cache }); return { ...r, verdicts: r.verdicts.map(v => ({ score: v.score, lib: v.lib, conf: v.conf, b: v.badges.map(b => b.id) })) }; };
  return {
    utilise: () => !!w,
    init(L) { lignes = L; cache = new Map(); if (w) w.postMessage({ type: 'init', lignes: L }); },
    saison(E, R) { encodes = E; ref = R; cache = new Map(); if (w) w.postMessage({ type: 'saison', encodes: E, ref: R }); },
    calcul(params) { const k = ++n; if (!w) return local(params).then(r => ({ ...r, n: k })); return new Promise((ok, rej) => { attente.set(k, { ok, rej }); w.postMessage({ type: 'calcul', n: k, params }); }).catch(() => { w = null; return local(params).then(r => ({ ...r, n: k })); }); },
    fin() { if (w) w.terminate(); w = null; }
  };
}

export async function ouvrir({ racine = document.body, onFermer = () => {} } = {}) {
  if (instance) return instance;
  if (!document.querySelector('link[data-lt-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./invest.css', import.meta.url).href; l.dataset.ltCss = ''; document.head.appendChild(l); }
  const el = document.createElement('section'); el.id = 'invest-fenetre'; el.className = 'tp tp-invest'; el.setAttribute('aria-label', 'Investissement');
  el.innerHTML = `<header class="tp-tete"><b>Investissement</b><span class="tp-sync" data-etat role="status">chargement…</span></header>
    <div class="lt-barre" data-barre></div>
    <nav class="tp-nav" role="tablist" aria-label="Sections">${[['liste', 'Instruments'], ['maliste', 'Ma liste'], ['plan', 'Mon plan'], ['methode', 'Méthode']].map(([k, n]) => `<button type="button" role="tab" data-onglet="${k}" aria-selected="false">${n}</button>`).join('')}</nav>
    <p class="tp-bandeau" data-bandeau hidden role="status"></p><main class="tp-corps" data-corps><div class="tp-onglet" data-zone></div></main>
    <footer class="tp-pied">Estimations chiffrées avec leurs hypothèses visibles : ni prévision ni conseil en investissement. Prix : Yahoo Finance ; comptes : SEC EDGAR (États-Unis) et séries publiques Yahoo ailleurs ; liste des instruments : table des marges XTB.</footer>`;
  racine.appendChild(el);
  const $ = s => el.querySelector(s), zone = $('[data-zone]'), corps = $('[data-corps]'), bandeau = $('[data-bandeau]'), barre = $('[data-barre]');
  const sauve = lireLS(LS.etat, {}), maint = Date.now();
  const S = { D: creerDonnees(), calc: creerCalculateur(), manifeste: null, lignes: [], classesChargees: new Set(), saisonChargee: false, ref: null, ajust: {}, horizon: sauve.horizon || 'moyen', fenetre: sauve.fenetre || fenetreDefaut(maint), filtre: { ...FILTRE0, ...(sauve.filtre || {}) }, tri: sauve.tri || 'score', sens: sauve.sens || -1, verdict: '', cols: sauve.cols || null, eur: !!sauve.eur,
    onglet: sauve.onglet || 'liste', liste: lireLS(LS.liste, []), res: null, seq: 0, graphs: [], fiche: null, ferme: false, defil: 0, ordreRes: [] };
  const sauver = () => ecrireLS(LS.etat, { horizon: S.horizon, fenetre: S.fenetre, filtre: S.filtre, tri: S.tri, sens: S.sens, cols: S.cols, eur: S.eur, onglet: S.onglet });
  const dire = (t, err = false) => { bandeau.hidden = !t; bandeau.textContent = t || ''; bandeau.classList.toggle('tp-erreur', !!err); if (t) setTimeout(() => { bandeau.hidden = true; }, 7000); };
  const viderGraphs = () => { S.graphs.forEach(g => { try { g.detruire(); } catch (e) { /* */ } }); S.graphs = []; };
  const suivie = id => S.liste.includes(id), hz = () => HORIZONS.find(h => h.id === S.horizon);

  /* ───── données ───── */
  /* v7 : UN seul chiffre pour « instruments » : le total du manifeste (le même que la carte de l'accueil) */
  const totalManifeste = () => (S.manifeste && S.manifeste.shards ? S.manifeste.shards.reduce((t, x) => t + (x.n || 0), 0) : 0) || S.lignes.length;
  async function charger(classes) {
    const manques = classes.filter(c => !S.classesChargees.has(c)); if (!manques.length && S.lignes.length) return;
    S.manifeste = await S.D.manifeste(); S.ajust = S.manifeste.ajust || {}; S.lignes = await S.D.lignes(null === classes ? null : [...new Set([...S.classesChargees, ...classes])]); classes.forEach(c => S.classesChargees.add(c)); S.calc.init(S.lignes); S.saisonChargee = false;
    $('[data-etat]').textContent = `${nf(totalManifeste(), 0).replace(/,/g, ' ')} instruments${S.lignes.length < totalManifeste() ? ' (' + nf(S.lignes.length, 0).replace(/,/g, ' ') + ' chargés pour l’instant)' : ''} · calcul ${age(S.manifeste.t)} · prix : dernière clôture de chaque bourse (ouvrir une fiche pour l’âge exact)`;
  }
  async function chargerSaison() { if (S.saisonChargee) return; const { encodes, ref } = await S.D.saison([...S.classesChargees]); S.ref = ref; S.calc.saison(encodes, ref); S.saisonChargee = true; }
  const besoinSaison = () => S.horizon === 'swing' || S.tri === 'sai' || S.filtre.saisonSignificative;
  async function recalculer() {
    const n = ++S.seq; if (besoinSaison()) { try { await chargerSaison(); } catch (e) { dire('Saisonnalité indisponible : ' + e.message, true); } }
    const F = { ...S.filtre, ...(S.onglet === 'maliste' ? { classe: '', zone: '', pays: '', secteur: '', caps: [], exclureMega: false, pea: false, dispo: '', qMin: 0, liqMin: 0, texte: S.filtre.texte } : {}), liste: S.onglet === 'maliste' ? S.liste : null }, p = { horizon: S.horizon, fenetre: S.fenetre, filtres: F, tri: S.tri, sens: S.sens, ajust: S.ajust, verdict: S.verdict };
    const r = await S.calc.calcul(p); if (n !== S.seq || S.ferme) return; S.res = r; S.ordreRes = r.ordre; majTuiles(); majLignes(true); ecrireResume();
  }
  /* résumé vivant pour la carte d'accueil du carrousel : nombre d'instruments, top 3 de l'horizon choisi, nombre d'alertes du jour */
  function ecrireResume() {
    try {
      if (!S.res || !S.manifeste || S.onglet === 'maliste' || S.tri !== 'score' || (S.filtre.classe && S.filtre.classe !== 'action')) return;
      const top = S.res.ordre.filter(i => S.lignes[i].c === 'action' && S.res.verdicts[i].score != null).slice(0, 3).map(i => ({ id: S.lignes[i].id, n: S.lignes[i].n, score: S.res.verdicts[i].score, lib: S.res.verdicts[i].lib })), ancien = lireLS(LS.resume, {}), j = new Date().toISOString().slice(0, 10);
      ecrireLS(LS.resume, { t: Date.now(), calcul: S.manifeste.t, n: (S.manifeste.shards || []).reduce((s, x) => s + (x.n || 0), 0), horizon: S.horizon, horizonNom: hz() ? hz().nom : S.horizon, top, alertes: ancien.jour === j ? ancien.alertes || 0 : 0, jour: j });
    } catch (e) { /* carte facultative */ }
  }
  function compterAlertes(k) { try { const a = lireLS(LS.resume, {}), j = new Date().toISOString().slice(0, 10); ecrireLS(LS.resume, { ...a, jour: j, alertes: (a.jour === j ? a.alertes || 0 : 0) + k }); } catch (e) { /* */ } }
  const rafraichir = () => { sauver(); return recalculer(); };

  /* ───── barre du haut ───── */
  function dessinerBarre() {
    barre.innerHTML = `<div class="lt-horizons-barre" role="radiogroup" aria-label="Horizon">${HORIZONS.map(h => `<button type="button" role="radio" data-h="${h.id}" aria-checked="${S.horizon === h.id}" title="${esc(h.usage)}"><b>${esc(h.nom)}</b><small>${esc(h.duree)}</small></button>`).join('')}</div>
      <div class="lt-fenetre"><label>Achat en <select data-fen="a">${MOIS.map((m, i) => `<option value="${i + 1}" ${S.fenetre.a === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label>Vente en <select data-fen="b">${MOIS.map((m, i) => `<option value="${i + 1}" ${S.fenetre.b === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label><span class="tp-doux" title="La fenêtre alimente le facteur saisonnalité">saisonnalité</span></div>
      <label class="lt-case"><input type="checkbox" data-eur ${S.eur ? 'checked' : ''}> prix en €</label>`;
  }
  /* ───── tuiles + filtres ───── */
  const LIBS = [LIBELLES.TRES, LIBELLES.ATTR, LIBELLES.NEUTRE, LIBELLES.PEU, LIBELLES.EVITER, LIBELLES.ND];
  function cadreListe() {
    const L = S.lignes, secteurs = [...new Set(L.filter(l => l.c === 'action').map(l => l.s).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), pays = [...new Set(L.filter(l => !S.filtre.classe || l.c === S.filtre.classe).map(l => l.p).filter(Boolean))].sort(), F = S.filtre;
    const opt = (v, t, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
    zone.innerHTML = `<div class="lt-resume" data-tuiles></div>
      <div class="lt-pre"><label>Préréglage <select data-pre><option value="">—</option>${Object.entries(PREREGLAGES).map(([k, p]) => `<option value="${k}">${esc(p.nom)}</option>`).join('')}</select></label><button type="button" data-colonnes>Colonnes</button><button type="button" data-raz>Réinitialiser</button><span class="tp-doux" data-compte></span></div>
      <details class="lt-filtres-d" ${window.matchMedia && window.matchMedia('(max-width: 760px)').matches ? '' : 'open'}><summary>Filtres</summary><div class="lt-filtres">
      <label>Classe d’actif <select data-f="classe"><option value="">Toutes</option>${CLASSES.map(([k, n]) => opt(k, n, F.classe)).join('')}</select></label>
      <label>Zone <select data-f="zone">${opt('', 'Toutes', F.zone)}${opt('US', 'États-Unis', F.zone)}${opt('Europe', 'Europe', F.zone)}${opt('Autres', 'Autres', F.zone)}</select></label>
      <label>Pays <select data-f="pays">${opt('', 'Tous', F.pays)}${pays.map(p => opt(p, (NOM_PAYS[p] || p), F.pays)).join('')}</select></label>
      <label>Secteur <select data-f="secteur">${opt('', 'Tous', F.secteur)}${secteurs.map(s => opt(s, s, F.secteur)).join('')}</select></label>
      <fieldset class="lt-caps"><legend>Capitalisation</legend>${CAPS.map(c => `<label class="lt-case"><input type="checkbox" data-cap="${c}" ${F.caps.includes(c) ? 'checked' : ''}> ${c}</label>`).join('')}<label class="lt-case"><input type="checkbox" data-f="exclureMega" ${F.exclureMega ? 'checked' : ''}> exclure les méga-caps</label></fieldset>
      <label class="lt-case"><input type="checkbox" data-f="pea" ${F.pea ? 'checked' : ''}> PEA uniquement</label>
      <label>Réel / CFD <select data-f="dispo">${opt('', 'Tous', F.dispo)}${opt('reel', 'Réel', F.dispo)}${opt('cfd', 'CFD', F.dispo)}</select></label>
      <label>Qualité mini <select data-f="qMin">${[0, 50, 60, 70, 80].map(q => opt(q, q ? '≥ ' + q + ' / 100' : 'Toutes', F.qMin)).join('')}</select></label>
      <label>Liquidité mini <select data-f="liqMin">${[0, 1, 5, 20, 100].map(q => opt(q, q ? '≥ ' + q + ' M€ / jour' : 'Toutes', F.liqMin)).join('')}</select></label>
      <label class="lt-recherche">Recherche <input type="search" data-f="texte" value="${esc(F.texte)}" placeholder="symbole XTB, nom, ISIN" autocomplete="off"></label></div></details>
      ${S.onglet === 'maliste' ? `<article class="tp-carte"><h3>Ma liste de suivi</h3><p class="tp-doux">Rayle te prévient (annonce vocale, et Telegram si le Worker est configuré) quand un instrument de ta liste passe « Attractif » ou « Très attractif » sur l’horizon choisi, quand une fenêtre saisonnière favorable s’ouvre, ou quand son prix touche la MA200 ou un support majeur Daily.</p><label class="lt-recherche">Ajouter <input list="lt-datalist" data-ajout placeholder="symbole XTB ou nom, puis Entrée" autocomplete="off"><datalist id="lt-datalist">${L.filter(l => !suivie(l.id)).slice(0, 1500).map(l => `<option value="${esc(l.id)}">${esc(l.n)}</option>`).join('')}</datalist></label></article>` : ''}
      <div class="lt-vt-tete" data-vt-tete></div><div class="lt-vt" data-vt tabindex="0" aria-label="Liste des instruments"><div class="lt-vt-pad" data-pad><div class="lt-vt-vue" data-vue></div></div></div>
      <p class="tp-doux">Score 0-100 = moyenne pondérée de facteurs en percentiles, neutres par secteur et par zone. La confiance tient compte de la complétude des données et de l’accord entre méthodes. Clique une ligne pour la fiche.</p>`;
    enteteTable();
  }
  function majTuiles() {
    const t = zone.querySelector('[data-tuiles]'); if (!t || !S.res) return; const C = S.res.comptes;
    t.innerHTML = LIBS.map(lib => `<button type="button" class="lt-compte ${CLASSE_LIB[lib]}" data-verdict="${esc(lib)}" aria-pressed="${S.verdict === lib}"><b>${C[lib] || 0}</b><span>${esc(lib)}</span></button>`).join('');
    const c = zone.querySelector('[data-compte]'); if (c) c.textContent = `${S.res.total} instrument(s) · horizon ${hz().nom}${hz().id === 'swing' ? ' · fenêtre ' + libelleFenetre(S.fenetre.a, S.fenetre.b) : ''}${S.calc.utilise() ? '' : ' · calcul sur le fil principal'}`;
  }
  /* ───── colonnes et lignes virtualisées ───── */
  const prixTxt = l => { if (!Number.isFinite(l.px)) return '—'; let px = l.px, d = l.d; if (S.eur && S.manifeste && S.manifeste.fx && S.manifeste.fx[l.d] && l.c !== 'devise' && l.c !== 'indice') { px = l.px / S.manifeste.fx[l.d]; d = 'EUR'; } return nf(px, px >= 100 ? 0 : px >= 1 ? 2 : 4) + ' ' + ({ EUR: '€', USD: '$', GBP: '£' }[d] || (d && d.length <= 4 ? d : '')); };
  const COLS = {
    id: { nom: 'Symbole XTB', w: '100px', tri: 'id', opt: 1, cell: l => `<b>${esc(l.id)}</b>` },
    n: { nom: 'Nom', w: 'minmax(120px, 2.4fr)', tri: 'n', cell: l => `<span class="lt-nom">${esc(l.n)}</span><small class="lt-mob">${esc(l.id)} · ${prixTxt(l)}</small>` },
    p: { nom: 'Pays', w: '62px', tri: 'p', opt: 1, cell: l => `${drapeau(l.p)} ${esc(l.p || '')}` },
    s: { nom: 'Secteur', w: 'minmax(100px, 1.2fr)', tri: 's', opt: 1, cell: l => esc(l.s || (l.c === 'ETF' ? l.cat || 'ETF' : l.c)) },
    px: { nom: 'Prix', w: '84px', tri: 'px', num: 1, opt: 1, cell: l => prixTxt(l) },
    score: { nom: 'Score', w: '52px', tri: 'score', num: 1, cell: (l, v) => (v.score == null ? '—' : nf(v.score, 0)) },
    lib: { nom: 'Verdict', w: 'minmax(112px, 132px)', tri: 'lib', cell: (l, v) => badgeLib(v.lib) + (estBon(v.lib) && contactTechnique(l).length ? ' <span class="lt-zone" title="en zone d’achat : ' + contactTechnique(l).join(' + ') + '">zone d’achat</span>' : '') + (v.b.includes('piege') ? ' <span class="lt-pastille" title="risque de piège à valeur">⚠</span>' : '') + (v.b.includes('resultats') ? ' <span class="lt-pastille" title="résultats dans les 10 jours">📅</span>' : '') + (v.b.includes('hypothese') ? ' <span class="lt-pastille" title="hypothèse à vérifier">?</span>' : '') },
    mos: { nom: 'Marge', w: '58px', tri: 'mos', num: 1, opt: 1, cell: l => (l.r && Number.isFinite(l.r.mos) ? `<span class="${l.r.mos > 0 ? 'tp-hausse' : 'tp-baisse'}">${sg(l.r.mos)}</span>` : '—') },
    mom: { nom: 'Momentum', w: '70px', tri: 'mom', num: 1, opt: 1, cell: l => (l.r && Number.isFinite(l.r.m12_1) ? `<span class="${l.r.m12_1 > 0 ? 'tp-hausse' : 'tp-baisse'}">${sg(l.r.m12_1)}</span>` : '—') },
    sai: { nom: 'Saisonnalité', w: '104px', tri: 'sai', num: 1, opt: 1, cell: (l, v, s) => (s ? (s.significatif ? `${sg(s.median, 1)} · ${pc(s.pctPositif)}` : 'non signif.') : '—') },
    qua: { nom: 'Qualité', w: '56px', tri: 'qua', num: 1, opt: 1, cell: l => (l.f && Number.isFinite(l.f.qua) ? nf(l.f.qua, 0) : '—') },
    ris: { nom: 'Risque', w: '58px', tri: 'ris', num: 1, opt: 1, cell: l => (l.r && Number.isFinite(l.r.vol) ? pc(l.r.vol) : '—') },
    conf: { nom: 'Confiance', w: '64px', tri: 'conf', num: 1, opt: 1, cell: (l, v) => `${v.conf} %` },
    etoile: { nom: '', w: '44px', cell: l => `<button type="button" class="lt-etoile" data-etoile="${esc(l.id)}" aria-pressed="${suivie(l.id)}" aria-label="${suivie(l.id) ? 'Retirer de' : 'Ajouter à'} ma liste">${suivie(l.id) ? '★' : '☆'}</button>` }
  };
  const COLS_DEF = { tactique: ['id', 'n', 'p', 'px', 'score', 'lib', 'mom', 'ris', 'conf', 'etoile'], swing: ['id', 'n', 'p', 'px', 'score', 'lib', 'mom', 'sai', 'qua', 'conf', 'etoile'], moyen: ['id', 'n', 'p', 's', 'px', 'score', 'lib', 'mos', 'mom', 'qua', 'ris', 'conf', 'etoile'], long: ['id', 'n', 'p', 's', 'px', 'score', 'lib', 'mos', 'qua', 'ris', 'conf', 'etoile'] };
  const colsActives = () => (S.cols && S.cols.length ? S.cols : COLS_DEF[S.horizon]).filter(k => COLS[k]);
  const colsVisibles = () => { const c = colsActives(); return window.matchMedia && window.matchMedia('(max-width: 760px)').matches ? c.filter(k => !COLS[k].opt) : c; };
  function enteteTable() {
    const t = zone.querySelector('[data-vt-tete]'), vt = zone.querySelector('[data-vt]'); if (!t) return; const cs = colsVisibles(), gabarit = cs.map(k => COLS[k].w).join(' ');
    t.style.setProperty('--cols', gabarit); vt.style.setProperty('--cols', gabarit);
    t.innerHTML = `<div class="lt-r lt-rt">${cs.map(k => { const c = COLS[k]; return `<div class="lt-c ${c.num ? 'lt-num' : ''} ${c.opt ? 'lt-opt' : ''}" ${c.tri ? `data-tri="${c.tri}" role="button" tabindex="0" aria-sort="${S.tri === c.tri ? (S.sens > 0 ? 'ascending' : 'descending') : 'none'}"` : ''}>${esc(c.nom)}${S.tri === c.tri ? (S.sens > 0 ? ' ▲' : ' ▼') : ''}</div>`; }).join('')}</div>`;
  }
  let rafId = 0;
  function majLignes(raz = false) {
    const vt = zone.querySelector('[data-vt]'), pad = zone.querySelector('[data-pad]'), vue = zone.querySelector('[data-vue]'); if (!vt || !S.res) return;
    const n = S.ordreRes.length; pad.style.height = Math.max(n * HAUT, 60) + 'px'; if (raz) vt.scrollTop = 0;
    const h = vt.clientHeight || 520, debut = Math.max(0, Math.floor(vt.scrollTop / HAUT) - 6), fin = Math.min(n, Math.ceil((vt.scrollTop + h) / HAUT) + 6), cs = colsVisibles();
    if (!n) { vue.style.transform = 'none'; vue.innerHTML = '<p class="tp-doux lt-vide">Aucun instrument ne correspond aux filtres.</p>'; return; }
    let html = ''; for (let k = debut; k < fin; k++) { const i = S.ordreRes[k], l = S.lignes[i], v = S.res.verdicts[i], s = S.res.saison[i]; html += `<div class="lt-r ${v.lib === LIBELLES.ND ? 'lt-ligne-nd' : ''}" role="row" data-id="${esc(l.id)}" tabindex="0">${cs.map(c => `<div class="lt-c ${COLS[c].num ? 'lt-num' : ''} ${COLS[c].opt ? 'lt-opt' : ''}">${COLS[c].cell(l, v, s)}</div>`).join('')}</div>`; }
    vue.style.transform = `translateY(${debut * HAUT}px)`; vue.innerHTML = html;
  }
  const surDefil = () => { if (rafId) return; rafId = requestAnimationFrame(() => { rafId = 0; majLignes(); }); };
  const surTaille = () => { enteteTable(); surDefil(); };

  /* ───── fiche ───── */
  async function ouvrirFiche(id) {
    const l = S.lignes.find(x => x.id === id); if (!l) return; const n = ++S.seq; viderGraphs(); zone.innerHTML = `<p class="tp-att">Chargement de la fiche ${esc(id)}…</p>`; corps.scrollTop = 0;
    let f; try { f = await S.D.fiche(id); } catch (e) { if (n !== S.seq) return; zone.innerHTML = `<p class="tp-panne">Fiche indisponible : ${esc(e.message)} <button type="button" data-retour>Retour</button></p>`; return; }
    if (n !== S.seq) return; try { await chargerSaison(); } catch (e) { /* saisonnalité facultative */ }
    S.fiche = { id, l, f, onglet: 'synthese', unite: 'J' }; dessinerFiche();
  }
  function dessinerFiche() {
    const F = S.fiche; if (!F) return; viderGraphs(); const l = F.l, V4 = {}; const sai = F.f.saison && S.ref ? statsSaison(F) : null;
    for (const h of HORIZONS) V4[h.id] = verdictLigne(l, h.id, { ajust: S.ajust, saison: sai && h.id === 'swing' ? sai : null });
    const pairs = l.c === 'action' ? S.lignes.filter(x => x.id !== l.id && x.c === 'action' && x.s === l.s && x.z === l.z && Number.isFinite(x.cap)).sort((a, b) => Math.abs(Math.log((a.cap || 1) / (l.cap || 1))) - Math.abs(Math.log((b.cap || 1) / (l.cap || 1)))).slice(0, 8) : [];
    const n = S.seq; rendreFiche({ zone, l, tCalcul: S.manifeste && S.manifeste.t, f: F.f, V4, horizon: S.horizon, fenetre: S.fenetre, S: { ref: S.ref }, onglet: F.onglet, unite: F.unite, suivie: suivie(l.id), pairs, graphs: S.graphs, annule: () => n !== S.seq || S.ferme });
  }
  function statsSaison(F) { try { const i = S.lignes.indexOf(F.l), r = S.res && S.res.saison ? S.res.saison[i] : null; return r && Number.isFinite(r.score) ? { score: r.score } : null; } catch (e) { return null; } }
  const dire_fiche = () => { const F = S.fiche; if (!F) return; const l = F.l, v = verdictLigne(l, S.horizon, { ajust: S.ajust }); parler(`${l.n} : ${v.lib} sur l’horizon ${hz().nom}, score ${v.score == null ? 'non calculé' : Math.round(v.score)}, confiance ${v.confLib}. ${pourquoi(l, v).join(' ')} Ce n’est pas un conseil.`); };

  /* ───── méthode ───── */
  async function vueMethode() {
    const bt = await S.D.backtest().catch(() => null), M = S.manifeste || {}, pcs = v => (Number.isFinite(v) ? nf(v * 100, 2) + ' %' : '—');
    const poids = Object.entries(POIDS.action).map(([h, W]) => `<tr><td><b>${esc(HORIZONS.find(x => x.id === h).nom)}</b></td><td>${Object.entries(W).map(([k, p]) => `${esc(NOM_FACTEUR[k])} ${p}`).join(' · ')}</td></tr>`).join('');
    const ligneBt = (nom, r, aj) => (r && r.ok ? `<tr><td>${esc(nom)}</td><td class="lt-num">${pcs(r.spreadMensuel)}</td><td class="lt-num">${pcs(r.spreadAnnuel)}</td><td class="lt-num">${nf(r.tstat, 1)}</td><td class="lt-num">${pc(r.tauxPositif)}</td><td class="lt-num">${r.n}</td><td>${aj >= 1 ? 'poids conservé' : 'poids réduit ×' + aj}</td></tr>` : `<tr><td>${esc(nom)}</td><td colspan="6" class="tp-doux">non calculé (historique insuffisant)</td></tr>`);
    zone.innerHTML = `<article class="tp-carte lt-methode"><h3>Comment ça marche, en français simple</h3><ul class="tp-liste">
      <li><b>Un score par horizon.</b> En haut de la fenêtre, tu choisis le temps pendant lequel tu comptes détenir : <b>tactique</b> (1 à 10 jours, pas de verdict « cher / pas cher »), <b>swing</b> (1 à 6 mois, avec la saisonnalité de ta fenêtre d’achat et de vente), <b>1 à 3 ans</b> ou <b>5 à 10 ans</b>. Chaque horizon pèse les facteurs autrement.</li>
      <li><b>Des percentiles, pas des chiffres bruts.</b> Chaque mesure (PER, ROIC, momentum…) est comparée aux sociétés du même secteur et de la même zone (États-Unis, Europe, autres) : une banque est jugée contre les banques, pas contre Apple. Les valeurs extrêmes sont écrêtées (1 % / 99 %).</li>
      <li><b>Les facteurs.</b> Valeur relative (EV/EBIT, PER, rendement du flux libre, rendement pour l’actionnaire, cours / valeur comptable, contre le secteur ET l’historique de la société) · Qualité (ROIC, rentabilité brute, stabilité des marges, accruals, Piotroski, dilution, couverture des intérêts, endettement, Altman) · Momentum et tendance (12-1 mois, 6-1 mois, force relative, MA200 Daily et Weekly, plus haut 52 semaines) · Croissance · Risque (volatilité, pire baisse, bêta, liquidité) · Saisonnalité (10 ans minimum, sinon « non significatif ») · Valeur intrinsèque (DCF à deux étapes avec taux d’actualisation par secteur et pays, croissance plafonnée, DCF inversé).</li>
      <li><b>Valeur intrinsèque.</b> Valeur retenue = médiane des méthodes (DCF, multiples historiques ; P/B justifié pour les banques et assurances). <b>La formule de Graham reste affichée à titre d’information mais ne pilote plus le verdict.</b> Aucune valeur supérieure à 4 fois le prix sans le badge « hypothèse à vérifier ».</li>
      <li><b>Libellés.</b> Très attractif (≥ 72), Attractif (≥ 58), Neutre (≥ 42), Peu attractif (≥ 28), À éviter. La <b>confiance</b> baisse quand des données manquent ou quand les méthodes se contredisent. Sous 60 % de données nécessaires : « Données insuffisantes », aucun verdict.</li>
      <li><b>Garde-fous.</b> <b>Piège à valeur</b> : zone de détresse d’Altman, ou dette nette supérieure à 4 fois l’EBITDA avec un recul de 25 % ou plus sur 12 mois → verdict plafonné à « Neutre » et badge ⚠ (c’est le cas de Charter Communications, que l’ancien modèle classait « pas chère +82 % »). <b>Banques et assurances</b> : P/B, ROE, PER et dividende ; ni EV/EBITDA ni Altman. <b>Foncières</b> : FFO et ANR indisponibles, modèle limité, confiance basse.</li>
      <li><b>Autres classes.</b> Devises : parité de pouvoir d’achat (Banque mondiale), portage (taux directeurs), momentum, saisonnalité. Indices : rendement des bénéfices moins taux 10 ans, momentum, saisonnalité. Matières premières : momentum, MA200, saisonnalité, taux réels pour l’or et l’argent. Cryptos : momentum, MA200 Weekly, volatilité, aucun verdict de valorisation. Obligataire : niveau des taux contre leur historique (FRED), taux réels, pente de la courbe américaine, écart OAT-Bund, durée des ETF obligataires.</li>
      <li><b>Fonds cotés.</b> Fonds fermés, investment trusts, holdings d’investissement, SPAC et trackers ne sont pas des entreprises : ils sont classés à part (« Fonds cotés »), jamais comparés aux entreprises, sans DCF ni multiples. Ils se jugent sur leur <b>décote ou prime sur la valeur liquidative</b> quand elle est connue ; sinon aucun verdict de valorisation (« données insuffisantes »), seulement la tendance et le risque à court terme.</li>
      <li><b>Zone d’achat et Mon plan.</b> Une ligne est « en zone d’achat » quand son verdict est Attractif ou mieux ET que le prix est sur un support Daily majeur, sur la MA200 Daily ou en rebond sur la MA200 Weekly (bande verte sur la fiche, alerte voix et Telegram à l’entrée). L’onglet <b>Mon plan</b> répartit ton DCA mensuel sur les lignes de Ma liste en respectant tes plafonds (10 % par ligne, 25 % par secteur, 40 % par pays hors ETF monde) et signale les lignes trop corrélées (&gt; 0,8). Ce n’est pas un conseil.</li>
      </ul><h4>Pondérations par horizon (actions)</h4><div class="tp-tableau-defil"><table class="tp-t"><tr><th>Horizon</th><th>Facteurs et poids</th></tr>${poids}</table></div></article>
      <article class="tp-carte"><h3>Validation honnête : les facteurs fondés sur les prix</h3>${bt && (bt.momentum || bt.saison || bt.tendance) ? `<p class="tp-doux">Chaque mois, on classe ${bt.univers} actions du Palier A selon le facteur et on compare le cinquième supérieur au cinquième inférieur (rendement du mois suivant). Un facteur dont l’écart n’est pas significatif (t &lt; 1) voit son poids divisé par deux dans le modèle.</p><div class="tp-tableau-defil"><table class="tp-t"><tr><th>Facteur</th><th class="lt-num">Écart / mois</th><th class="lt-num">Écart / an</th><th class="lt-num">t-stat</th><th class="lt-num">Mois positifs</th><th class="lt-num">Mois</th><th>Décision</th></tr>${ligneBt('Momentum 12-1', bt.momentum, (M.ajust || {}).mom == null ? 1 : M.ajust.mom)}${ligneBt('Saisonnalité (moyenne du mois, 10 ans)', bt.saison, (M.ajust || {}).sai == null ? 1 : M.ajust.sai)}${ligneBt('Tendance (équivalent MA200 mensuel)', bt.tendance, (M.ajust || {}).ma == null ? 1 : M.ajust.ma)}</table></div><h4>Limites</h4><ul class="tp-liste">${(bt.limites || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="tp-doux">Backtest non disponible dans la dernière publication.</p>'}</article>
      <article class="tp-carte"><h3>Données, rythme et limites</h3><ul class="tp-liste"><li><b>Sources, toutes gratuites et sans clé</b> : ${(M.sources || []).map(esc).join(' ; ') || '—'}.</li><li><b>Rythme</b> : prix chaque nuit ; comptes chaque semaine (ils changent chaque trimestre). Dernier calcul ${S.manifeste ? esc(age(S.manifeste.t)) : '—'}.</li>
      <li><b>XTB</b> : l’API xAPI est fermée depuis le 14 mars 2025 ; l’univers est un catalogue construit à partir de la table des marges officielle. Les actions au comptant hors de cette table ne peuvent pas être vérifiées (« réel probable »).</li><li><b>Hors États-Unis</b> : environ 4 exercices annuels seulement (Yahoo), contre plus de 10 ans pour la SEC ; comptes convertis au taux du jour quand la devise des comptes diffère de celle de cotation.</li>
      <li><b>Pas disponible</b> : révisions d’analystes et surprises de résultats (aucune source gratuite fiable), graphiques H4 historiques, CAPE des indices, COT dans cette fenêtre (voir Marchés), calendrier des résultats hors États-Unis.</li></ul></article>
      <article class="tp-carte" data-suivi><h3>Suivi du modèle</h3><p class="tp-att" role="status">Lecture du suivi…</p></article>`;
    chargerSuivi();
  }
  /* suivi du modèle par lui-même : instantané mensuel (data/snapshots/AAAA-MM.json) et performance réelle à 1, 3, 6 et 12 mois (data/snapshots/suivi.json, recalculé par la tâche planifiée) */
  async function chargerSuivi() {
    const boite = zone.querySelector('[data-suivi]'); if (!boite) return; let su = null;
    try { const r = await fetch(new URL('../../data/snapshots/suivi.json', import.meta.url).href, { signal: AbortSignal.timeout(10000) }); if (r.ok) su = await r.json(); } catch (e) { su = null; }
    if (S.onglet !== 'methode' || !boite.isConnected) return; boite.innerHTML = '<h3>Suivi du modèle</h3>' + suiviHtml(su);
  }

  /* ───── alertes de la liste ───── */
  async function verifierAlertes() {
    if (!S.liste.length || S.ferme) return;
    try {
      await charger(['action', 'ETF', 'devise', 'indice', 'matière première', 'crypto', 'obligataire']); const prec = lireLS(LS.alertes, {}); let fenetres = null;
      try { await chargerSaison(); fenetres = {}; const { encodes } = await S.D.saison([...S.classesChargees]); for (const id of S.liste) { const e = encodes[id]; if (!e) continue; const M = decoder(e), l = S.lignes.find(x => x.id === id), ref = S.ref && l && S.ref[l.p] ? decoder(S.ref[l.p]) : null, b = meilleuresFenetres(M, ref, 1)[0]; if (b) fenetres[id] = b; } } catch (e) { fenetres = null; }
      const r = detecterAlertes(S.liste, S.lignes, prec, { horizon: S.horizon, ajust: S.ajust, fenetres }); ecrireLS(LS.alertes, r.etat);
      if (r.alertes.length) { compterAlertes(r.alertes.length); dire(r.alertes.length + ' alerte(s) Investissement : ' + r.alertes.map(a => a.nom).slice(0, 3).join(', ')); parler(phraseAlertes(r.alertes)); }
    } catch (e) { /* alertes facultatives */ }
  }
  const conn = () => lireConn(), enteteAcces = c => (c && c.code ? { 'X-Portefeuille-Code': c.code } : {});
  async function sauverListe() { ecrireLS(LS.liste, S.liste); const c = conn(); if (!c) return; try { const r = await fetch(c.url + '/lt/liste', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...enteteAcces(c) }, body: JSON.stringify({ liste: S.liste }), signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status); } catch (e) { dire('Liste enregistrée sur cet appareil ; synchronisation avec le Worker impossible : ' + e.message, true); } }
  async function listeDepuisWorker() { const c = conn(); if (!c) return; try { const r = await fetch(c.url + '/lt/liste', { headers: enteteAcces(c), signal: AbortSignal.timeout(10000) }); if (r.ok) { const j = await r.json(), u = [...new Set([...S.liste, ...(j.liste || [])])]; if (u.length !== S.liste.length) { S.liste = u; ecrireLS(LS.liste, u); } } } catch (e) { /* hors ligne */ } }

  /* ───── rendu général ───── */
  async function rendre() {
    viderGraphs(); S.seq++; S.fiche = null; sauver(); el.querySelectorAll('[data-onglet]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.onglet === S.onglet)));
    if (S.onglet === 'methode') { await vueMethode(); return; }
    if (S.onglet === 'plan') { await vuePlan({ S: { ...S, horizonNom: hz().nom }, zone, chargerTout: () => charger(CLASSES.map(x => x[0])), parler, badgeLib }); return; }
    cadreListe(); majTuiles(); await recalculer();
  }
  async function appliquerFiltreClasse() { const c = S.filtre.classe ? [S.filtre.classe] : CLASSES.map(x => x[0]); await charger(c); }

  /* ───── événements ───── */
  el.addEventListener('click', async e => {
    const t = e.target, b = t.closest('button, [data-tri], .lt-r[data-id], tr[data-id]'); if (!b) return; const d = b.dataset;
    if (d.onglet) { S.onglet = d.onglet; if (d.onglet === 'maliste') await appliquerFiltreClasse().catch(() => {}); rendre(); return; }
    if (d.h) { S.horizon = d.h; S.cols = null; dessinerBarre(); if (S.fiche) dessinerFiche(); else { enteteTable(); rafraichir(); } return; }
    if (d.horizon) { S.horizon = d.horizon; dessinerBarre(); dessinerFiche(); return; }
    if (d.etoile) { e.stopPropagation(); const id = d.etoile; S.liste = suivie(id) ? S.liste.filter(x => x !== id) : [...S.liste, id]; sauverListe(); if (S.fiche) dessinerFiche(); else { if (S.onglet === 'maliste') rafraichir(); else majLignes(); } return; }
    if (d.retour !== undefined) { if (S.onglet === 'methode') { rendre(); } else rendre(); return; }
    if (d.expliquer !== undefined) { dire_fiche(); return; }
    if (d.fonglet) { S.fiche.onglet = d.fonglet; dessinerFiche(); return; }
    if (d.unite) { S.fiche.unite = d.unite; dessinerFiche(); return; }
    if (d.copier) { try { await navigator.clipboard.writeText(d.copier); dire('Symbole copié : ' + d.copier); } catch (er) { dire('Copie impossible : ' + d.copier, true); } return; }
    if (d.verdict) { S.verdict = S.verdict === d.verdict ? '' : d.verdict; rafraichir(); return; }
    if (d.tri) { const k = d.tri; S.sens = S.tri === k ? -S.sens : (['id', 'n', 'p', 's'].includes(k) ? 1 : -1); S.tri = k; enteteTable(); rafraichir(); return; }
    if (d.raz !== undefined) { S.filtre = { ...FILTRE0 }; S.verdict = ''; await appliquerFiltreClasse(); cadreListe(); majTuiles(); rafraichir(); return; }
    if (d.colonnes !== undefined) { menuColonnes(); return; }
    if (d.id && (b.classList.contains('lt-r') || b.tagName === 'TR')) { ouvrirFiche(d.id); return; }
  });
  el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.lt-r[data-id], tr[data-id]')) { e.preventDefault(); ouvrirFiche(e.target.dataset.id); } else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-tri]')) { e.preventDefault(); e.target.click(); }
    else if (e.key === 'Enter' && e.target.matches('[data-ajout]')) { const v = e.target.value.trim().toUpperCase(), l = S.lignes.find(x => x.id.toUpperCase() === v) || S.lignes.find(x => x.n.toUpperCase().includes(v)); if (l && !suivie(l.id)) { S.liste.push(l.id); sauverListe(); rendre(); } else dire(l ? 'Déjà dans ta liste.' : 'Aucun instrument ne correspond.', !l); } });
  el.addEventListener('change', async e => {
    const t = e.target, d = t.dataset || {};
    if (d.fen) { S.fenetre[d.fen] = +t.value; sauver(); if (S.fiche) dessinerFiche(); else if (S.horizon === 'swing' || S.tri === 'sai') rafraichir(); return; }
    if (d.eur !== undefined) { S.eur = t.checked; sauver(); majLignes(); return; }
    if (d.cap) { const s = new Set(S.filtre.caps); t.checked ? s.add(d.cap) : s.delete(d.cap); S.filtre.caps = [...s]; rafraichir(); return; }
    if (d.pre !== undefined) { const p = PREREGLAGES[t.value]; if (!p) return; await appliquerPreregler(p); return; }
    if (d.f) { const k = d.f; if (k === 'texte') return; S.filtre[k] = t.type === 'checkbox' ? t.checked : (['qMin', 'liqMin'].includes(k) ? +t.value : t.value); if (k === 'classe') { await appliquerFiltreClasse().catch(er => dire(er.message, true)); S.filtre.pays = ''; S.filtre.secteur = S.filtre.classe === 'action' ? S.filtre.secteur : ''; cadreListe(); majTuiles(); } rafraichir(); }
  });
  let tFiltre = null; el.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.f === 'texte') { clearTimeout(tFiltre); const v = e.target.value; tFiltre = setTimeout(() => { S.filtre.texte = v; rafraichir(); }, 200); } });
  el.addEventListener('scroll', e => { if (e.target.matches && e.target.matches('[data-vt]')) surDefil(); }, true);
  window.addEventListener('resize', surTaille);
  function menuColonnes() {
    const cs = new Set(colsActives()), ctn = zone.querySelector('[data-vt-tete]'); if (!ctn) return; let m = zone.querySelector('[data-menu-col]'); if (m) { m.remove(); return; }
    m = document.createElement('div'); m.className = 'lt-menu-col'; m.dataset.menuCol = ''; m.innerHTML = Object.entries(COLS).filter(([k]) => k !== 'etoile').map(([k, c]) => `<label class="lt-case"><input type="checkbox" data-col="${k}" ${cs.has(k) ? 'checked' : ''}> ${esc(c.nom)}</label>`).join(''); ctn.before(m);
    m.addEventListener('change', ev => { const k = ev.target.dataset.col; if (!k) return; const s = new Set(colsActives()); ev.target.checked ? s.add(k) : s.delete(k); s.add('etoile'); S.cols = Object.keys(COLS).filter(x => s.has(x)); sauver(); enteteTable(); majLignes(); });
  }
  async function appliquerPreregler(p) {
    S.horizon = p.horizon; S.filtre = { ...FILTRE0, ...p.filtres }; S.tri = p.tri; S.sens = p.sens; S.verdict = p.verdict || ''; S.cols = null; if (p.fenetreMois) S.fenetre = fenetreDefaut(Date.now());
    dessinerBarre(); await appliquerFiltreClasse().catch(er => dire(er.message, true)); S.onglet = 'liste'; await rendre();
  }

  /* ───── pilotage par Rayle (voix) ───── */
  async function piloter(spec = {}) {
    if (spec.horizon) S.horizon = spec.horizon; if (spec.fenetre) S.fenetre = spec.fenetre;
    if (spec.reinitialiser) { S.filtre = { ...FILTRE0, classe: '' }; S.verdict = ''; }
    S.filtre = { ...S.filtre, ...(spec.filtre || {}) }; if (spec.tri) { S.tri = spec.tri; S.sens = spec.sens || -1; } if ('verdict' in spec) S.verdict = spec.verdict || ''; S.cols = null; S.onglet = 'liste';
    dessinerBarre(); await appliquerFiltreClasse(); await rendre(); await new Promise(r => setTimeout(r, 0));
    const R = S.res; if (!R) return { total: 0, premiers: [] };
    return { total: R.total, comptes: R.comptes, premiers: S.ordreRes.slice(0, 5).map(i => ({ id: S.lignes[i].id, nom: S.lignes[i].n, lib: R.verdicts[i].lib, score: R.verdicts[i].score })) };
  }

  function fermer() { if (S.ferme) return; S.ferme = true; clearInterval(S.minuteur); clearTimeout(tFiltre); viderGraphs(); S.calc.fin(); window.removeEventListener('resize', surTaille); el.remove(); instance = null; try { onFermer(); } catch (e) { /* */ } }
  instance = { fermer, etat: () => ({ actif: true, onglet: S.onglet, horizon: S.horizon, fenetre: { ...S.fenetre }, filtre: { ...S.filtre }, verdict: S.verdict, tri: S.tri, lignes: S.lignes.length, total: S.res ? S.res.total : 0, liste: S.liste.slice(), fiche: S.fiche && S.fiche.id, workerCalcul: S.calc.utilise() }), ouvrirFiche, piloter, rendre, aller: o => { S.onglet = o; rendre(); }, lignes: () => S.lignes, donnees: S.D };
  dessinerBarre(); zone.innerHTML = '<p class="tp-att">Chargement de l’univers XTB…</p>';
  try { await appliquerFiltreClasse(); await rendre(); } catch (e) { zone.innerHTML = `<p class="tp-panne" role="alert">Données indisponibles : ${esc(e.message)}. Le calcul est publié chaque nuit sur la branche « donnees » du dépôt.</p>`; }
  listeDepuisWorker().then(() => { if (!S.ferme && S.onglet === 'maliste' && !S.fiche) rendre(); }); setTimeout(verifierAlertes, 4000); S.minuteur = setInterval(verifierAlertes, 30 * 60e3);
  return instance;
}
export function fermer() { if (instance) instance.fermer(); }
