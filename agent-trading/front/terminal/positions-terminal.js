/* ═════════════ TERMINAL : OUTIL POSITION, SUIVI D'ÉTAT, JOURNAL AUTOMATIQUE, GARDIEN DE DRAWDOWN (phase C) ═════════════
   « Position » puis un clic sur le graphique : trois fines lignes (entrée, stop, objectif) déplaçables, une étiquette discrète
   (sens, R, risque en $, taille en contrats). Risque par défaut 0,5 % d'un compte de 10 000 $, modifiable. AUCUN ordre réel :
   le terminal suit seulement l'état du tracé et écrit le journal. */
import { creerPosition, modifierPosition, calcul, suivre, cloturer, annuler, passerBE, valider, ligneJournal, bilan, gardien, latent, fermees, resultatR,
  exporterJson, exporterCsv, importerJson, importerCsv, ETATS, FINAUX, SETUPS, DEFAUTS, GARDIEN } from './positions-calcul.js';
import { PAR_ID_T, UNITES, fmt } from './actifs-terminal.js';
import { MENTION } from './alertes-calcul.js';
import { ouvrirStockage } from './stockage-terminal.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lireJ = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : { ...d, ...JSON.parse(v) }; } catch (e) { return d; } };
const ecrireJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };
const HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const heure = t => (t ? HEURE.format(new Date(t)) : '—');
const r2 = x => x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(2).replace('.', ',') + ' R';
const duree = ms => { if (ms == null) return '—'; const m = Math.round(ms / 60e3); return m < 90 ? m + ' min' : m < 2880 ? (m / 60).toFixed(1).replace('.', ',') + ' h' : (m / 1440).toFixed(1).replace('.', ',') + ' j'; };
const LIBELLES = { ...ETATS, creee: 'tracée', validee: 'validée', be: 'stop passé à l’entrée', plus1R: '+1 R atteint' };

export async function monterPositions(T, { stockage = null, maintenant = () => Date.now() } = {}) {
  const st = stockage || await ouvrirStockage();
  const E = { P: await st.tout('positions'), lignes: await st.tout('journal'), sel: null, drag: null, regl: lireJ('rayle_term_compte', { ...DEFAUTS }), filtres: { actif: '', setup: '', etat: '' }, gardienNiveau: 'ok', detruit: false };
  const G = T.graph, el = G.element, pasQ = a => (PAR_ID_T[a] || {}).pasQ || 0.001, f = (a, p) => fmt(a, p);
  const D = () => T.module('dessin');

  async function sauver(p) { const i = E.P.findIndex(x => x.id === p.id); if (i >= 0) E.P[i] = p; else E.P.push(p); await st.ecrire('positions', p); G.redessiner(); rendreJournal(); T.emettre('positions', E.P); }
  async function journal(p, e) { const l = ligneJournal(p, e); if (E.lignes.some(x => x.id === l.id)) return; E.lignes.push(l); await st.ecrire('journal', l); }
  async function changer(p, ev = []) { await sauver(p); for (const e of ev) { await journal(p, e); notifier(p, e); } }
  function notifier(p, e) {
    const type = e.type === 'ouverte' ? 'entree' : e.type; if (!['entree', 'stop', 'objectif', 'plus1R'].includes(type)) return;
    const A = PAR_ID_T[p.actif], c = calcul(p), txt = `${A.nom} · position ${c.achat ? 'achat' : 'vente'} · ${type === 'entree' ? 'entrée touchée' : type === 'stop' ? 'stop touché' : type === 'objectif' ? 'objectif atteint' : '+1 R atteint : passer le stop à l’entrée (break-even) ?'} · ${f(p.actif, e.prix)}${e.R != null ? ' · ' + r2(e.R) : ''}`;
    const rec = { id: `${p.id}|${type}|${e.t}`, objet: p.id, type, actif: p.actif, unite: p.unite, t: e.t, tFin: maintenant(), prix: e.prix, niveau: e.prix, texte: txt, phrase: type === 'plus1R' ? `${A.nom} : plus un R atteint. Tu peux passer le stop à l’entrée.` : txt.replace(/ · /g, ', ') };
    if (D()) D().alerter(rec); else T.bandeau(txt);
  }

  /* ── création ── */
  function nouvelle(prix, { actif = T.actif(), unite = T.unite(), stop, objectif, origine = 'moi', etat = 'attente', setup = '', note = '' } = {}) {
    const atr = T.atr() || prix * 0.003, px = T.prix() || prix, achat = stop != null ? stop < prix : prix <= px;
    const s = stop != null ? stop : achat ? prix - atr : prix + atr, risque = Math.abs(prix - s);
    const o = objectif != null ? objectif : achat ? prix + 2 * risque : prix - 2 * risque;
    return creerPosition({ actif, unite, cree: maintenant(), entree: prix, stop: s, objectif: o, capital: E.regl.capital, risquePct: E.regl.risquePct, origine, etat, setup, note }, { t: maintenant(), pasQ: pasQ(actif) });
  }
  async function ajouter(p) { if (!p) return null; await changer(p, [{ type: p.etat === 'proposee' ? 'proposee' : 'creee', t: p.cree, prix: p.entree }]); E.sel = p.id; ouvrirEdition(p); T.choisirOutil('curseur'); if (!T.couches().positions) T.couche('positions', true); return p; }

  /* ── dessin : trois fines lignes, une étiquette discrète ── */
  G.ajouterPrimitive((ctx, Dm) => {
    if (T.couches().positions === false) return; const W = Dm.width; ctx.font = '11px Segoe UI, system-ui, sans-serif';
    for (const p of E.P) {
      if (p.actif !== T.actif() || (FINAUX.includes(p.etat) && p.id !== E.sel && !(p.tSortie && maintenant() - p.tSortie < 6 * 3600e3))) continue;
      const c = calcul(p); if (!c) continue; const x0 = Math.max(0, G.xDe(p.cree) ?? 0), x1 = p.tSortie ? Math.min(W, G.xDe(p.tSortie) ?? W) : W, actif = p.id === E.sel, prop = p.etat === 'proposee';
      const trait = (prix, col, dash) => { const y = G.yDe(prix); if (y == null) return null; ctx.strokeStyle = col; ctx.lineWidth = actif ? 1.6 : 1; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]); return y; };
      const d = prop ? [6, 4] : [];
      const ye = trait(p.entree, prop ? '#c9b27a' : '#cfd8dc', d), ys = trait(p.stop, '#ef6a5f', prop ? d : [4, 3]), yt = trait(p.objectif, '#4fd18b', prop ? d : [4, 3]);
      if (ye == null) continue;
      const t = `${prop ? 'scénario Rayle · à valider · ' : ''}${c.achat ? 'Achat' : 'Vente'} · ${c.rObjectif.toFixed(1).replace('.', ',')} R · risque ${Math.round(c.risqueReel$)} $ · ${c.taille.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} contrats · ${ETATS[p.etat]}${p.etat === 'ouverte' ? ' · ' + r2(resultatR(p, T.prix())) : FINAUX.includes(p.etat) && p.prixSortie ? ' · ' + r2(resultatR(p, p.prixSortie)) : ''}`;
      const w = ctx.measureText(t).width + 8, xx = Math.max(4, Math.min(x1 - w - 6, W - w - 6));
      ctx.fillStyle = 'rgba(5,8,12,.82)'; ctx.fillRect(xx, ye - 15, w, 14); ctx.fillStyle = prop ? '#c9b27a' : '#cfd8dc'; ctx.fillText(t, xx + 4, ye - 4);
      ctx.fillStyle = '#ef6a5f'; if (ys != null) ctx.fillText('SL ' + f(p.actif, p.stop), xx + 4, ys + (ys > ye ? 12 : -4)); ctx.fillStyle = '#4fd18b'; if (yt != null) ctx.fillText('TP ' + f(p.actif, p.objectif), xx + 4, yt + (yt > ye ? 12 : -4));
    }
  }, 'top');
  function toucherLigne(x, y) {
    let best = null, bd = 7;
    for (const p of E.P) { if (p.actif !== T.actif() || FINAUX.includes(p.etat)) continue; const x0 = G.xDe(p.cree) ?? 0; if (x < x0 - 4) continue;
      for (const [k, prix] of [['entree', p.entree], ['stop', p.stop], ['objectif', p.objectif]]) { const yy = G.yDe(prix); if (yy == null) continue; const d = Math.abs(yy - y); if (d < bd) { bd = d; best = { p, ligne: k }; } } }
    return best;
  }
  const pos = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const surDown = async e => {
    if (e.button !== 0 || E.detruit) return; const { x, y } = pos(e); let lw = el.clientWidth; try { lw = G.chart().timeScale().width(); } catch (x2) { /* */ } if (x > lw) return;
    if (T.outil() === 'position') { e.preventDefault(); e.stopPropagation(); const prix = G.prixDe(y); if (prix > 0) await ajouter(nouvelle(prix)); return; }
    if (T.outil() !== 'curseur' || e.defaultPrevented) return;
    const h = toucherLigne(x, y); if (!h) return;
    e.preventDefault(); e.stopPropagation(); E.sel = h.p.id; ouvrirEdition(h.p);
    if (h.ligne === 'entree' && h.p.etat === 'ouverte') { G.redessiner(); return; }   // l'entrée d'une position ouverte ne bouge plus
    E.drag = { id: h.p.id, ligne: h.ligne, bouge: false }; const c = G.chart(); if (c) c.applyOptions({ handleScroll: false, handleScale: false }); G.redessiner();
  };
  const surMove = e => { if (!E.drag) return; const { y } = pos(e), prix = G.prixDe(y); if (!(prix > 0)) return; const p = E.P.find(q => q.id === E.drag.id); const n = p && modifierPosition(p, { [E.drag.ligne]: prix }, { pasQ: pasQ(p.actif) }); if (n) { E.P = E.P.map(q => q.id === n.id ? n : q); E.drag.bouge = true; G.redessiner(); } };
  const surUp = async () => { if (!E.drag) return; const d = E.drag; E.drag = null; const c = G.chart(); if (c) c.applyOptions({ handleScroll: true, handleScale: true }); const p = E.P.find(q => q.id === d.id); if (p && d.bouge) { await sauver(p); ouvrirEdition(p); } };
  el.addEventListener('pointerdown', surDown, true); el.addEventListener('pointermove', surMove, true); window.addEventListener('pointerup', surUp, true);

  /* ── panneau d'édition de la position ── */
  const panneau = T.q('[data-edition]');
  function ouvrirEdition(p) {
    const c = calcul(p), fin = FINAUX.includes(p.etat), A = PAR_ID_T[p.actif];
    panneau.dataset.pos = p.id; delete panneau.dataset.id;
    panneau.innerHTML = `<h4>Position ${c.achat ? 'achat' : 'vente'} · ${esc(A.nom)} · ${ETATS[p.etat]}</h4>
      ${p.etat === 'proposee' ? `<p class="tr-proposition">Proposition de Rayle (scénario), à valider d’un clic. ${esc(MENTION)}</p>` : ''}
      <label>Entrée <input data-p="entree" type="number" step="any" value="${p.entree}" ${fin || p.etat === 'ouverte' ? 'disabled' : ''}></label>
      <label>Stop <input data-p="stop" type="number" step="any" value="${p.stop}" ${fin ? 'disabled' : ''}></label>
      <label>Objectif <input data-p="objectif" type="number" step="any" value="${p.objectif}" ${fin ? 'disabled' : ''}></label>
      <label>Risque % <input data-p="risquePct" type="number" step="0.05" min="0.05" max="5" value="${p.risquePct}" ${fin || p.etat === 'ouverte' ? 'disabled' : ''}></label>
      <label>Compte $ <input data-p="capital" type="number" step="100" min="100" value="${p.capital}" ${fin || p.etat === 'ouverte' ? 'disabled' : ''}></label>
      <p class="tr-mono">${c.rObjectif.toFixed(2).replace('.', ',')} R · risque ${c.risqueReel$.toFixed(0)} $ · ${c.taille.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} contrats${p.etat === 'ouverte' ? ` · en cours ${r2(resultatR(p, T.prix()))}` : ''}${fin && p.prixSortie ? ` · résultat ${r2(resultatR(p, p.prixSortie))}` : ''}</p>
      <label>Setup <select data-p="setup"><option value="">—</option>${SETUPS.map(s => `<option ${s === p.setup ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label>Actualité <input data-p="actualite" type="text" maxlength="80" value="${esc(p.actualite)}" placeholder="facultatif"></label>
      <label>Note <input data-p="note" type="text" maxlength="200" value="${esc(p.note)}"></label>
      <div class="tr-ligne-btn">${p.etat === 'proposee' ? '<button class="tr-btn" data-pa="valider">Valider</button><button class="tr-btn" data-pa="annuler">Refuser</button>' : ''}${p.etat === 'attente' ? '<button class="tr-btn" data-pa="annuler">Retirer (annuler)</button>' : ''}${p.etat === 'ouverte' ? `${p.plus1R && !p.be ? '<button class="tr-btn" data-pa="be">Passer à break-even</button>' : ''}<button class="tr-btn" data-pa="cloturer">Clôturer à la main</button>` : ''}<button class="tr-btn" data-pa="fermer">Fermer</button></div>
      <p class="tr-mini">Simulation : aucun ordre n’est passé.</p>`;
    panneau.hidden = false; G.redessiner();
  }
  panneau.addEventListener('change', async e => {
    const id = panneau.dataset.pos, k2 = e.target.dataset.p; if (!id || !k2) return; const p = E.P.find(q => q.id === id); if (!p) return;
    if (['setup', 'actualite', 'note'].includes(k2)) { const n = { ...p, [k2]: e.target.value }; await sauver(n); for (const l of E.lignes.filter(l => l.position === id)) { l[k2] = e.target.value; await st.ecrire('journal', l); } rendreJournal(); return; }
    const n = modifierPosition(p, { [k2]: +e.target.value }, { pasQ: pasQ(p.actif) }); if (!n) { T.bandeau('Valeur refusée (le stop et l’objectif doivent être de part et d’autre de l’entrée).'); ouvrirEdition(p); return; }
    if (k2 === 'risquePct' || k2 === 'capital') { E.regl = { capital: n.capital, risquePct: n.risquePct }; ecrireJ('rayle_term_compte', E.regl); }
    await sauver(n); ouvrirEdition(n);
  });
  panneau.addEventListener('click', async e => {
    const a = e.target.dataset.pa, id = panneau.dataset.pos; if (!a || !id) return; const p = E.P.find(q => q.id === id); if (!p) return; const now = maintenant();
    if (a === 'fermer') { E.sel = null; panneau.hidden = true; delete panneau.dataset.pos; G.redessiner(); return; }
    let n = null, ev = [];
    if (a === 'valider') { n = valider(p); ev = [{ type: 'validee', t: now, prix: p.entree }]; }
    if (a === 'annuler') { n = annuler(p, now); ev = [{ type: 'annulee', t: now, prix: T.prix() }]; }
    if (a === 'be') { n = passerBE(p); ev = [{ type: 'be', t: now, prix: p.entree }]; }
    if (a === 'cloturer') { const px = T.actif() === p.actif ? T.prix() : null; if (!(px > 0)) { T.bandeau('Prix de l’actif inconnu : ouvre son graphique pour clôturer.'); return; } n = cloturer(p, px, now); ev = n ? [n.historique[n.historique.length - 1]] : []; }
    if (!n) return; await changer(n, ev); ouvrirEdition(n);
  });

  /* ── suivi de l'état (prix en direct, clôtures, toutes les 20 s) ── */
  let enCours = false;
  async function suivreTout() {
    if (enCours || E.detruit) return; enCours = true;
    try {
      for (const p of E.P.filter(q => q.etat === 'attente' || q.etat === 'ouverte')) {
        let s; try { s = await T.serieDe(p.actif, p.unite); } catch (e) { continue; }
        const ms = UNITES[p.unite].ms, B = s.bougies(), i0 = Math.max(0, B.findIndex(b => b.t + ms > p.cree));
        const { p: n, evenements } = suivre(p, B.slice(i0), { ms });
        if (evenements.length) await changer(n, evenements);
      }
      majGardien();
    } finally { enCours = false; }
  }
  let tPrix = 0; const offPrix = T.on('prix', () => { const now = Date.now(); if (now - tPrix > 1000) { tPrix = now; suivreTout(); } if (E.P.some(p => p.etat === 'ouverte')) G.redessiner(); });
  const offClot = T.on('cloture', () => suivreTout());
  const minut = setInterval(() => { if (!document.hidden) suivreTout(); }, 20000);

  /* ── gardien de drawdown ── */
  let badge = T.q('[data-gardien]'); if (!badge) { badge = document.createElement('span'); badge.className = 'tr-pastille'; badge.dataset.gardien = ''; badge.title = 'Gardien de drawdown (défi)'; T.q('.tr-menus').appendChild(badge); }
  function etatGardien() { const prixDe = a => (a === T.actif() ? T.prix() : null); return gardien(E.P, { capital: E.regl.capital, maintenant: maintenant(), latent: latent(E.P, prixDe) }); }
  function majGardien() {
    const g = etatGardien(); badge.textContent = `jour ${g.pertesJourPct.toFixed(1).replace('.', ',')} % · total ${g.drawdownPct.toFixed(1).replace('.', ',')} %`; badge.className = 'tr-pastille ' + (g.niveau === 'ok' ? 'ok' : g.niveau === 'alerte' ? 'at' : 'ko');
    if (g.niveau !== E.gardienNiveau) { if (g.niveau !== 'ok') { T.bandeau(g.message, 10000); if (D()) D().alerter({ id: `gardien|${g.niveau}|${new Date().toISOString().slice(0, 10)}`, objet: 'gardien', type: 'gardien', actif: T.actif(), unite: '', t: maintenant(), tFin: maintenant(), prix: null, texte: 'Gardien : ' + g.message, phrase: g.message }); } E.gardienNiveau = g.niveau; }
    return g;
  }

  /* ── journal (panneau du bas) ── */
  const pJ = T.panneau('journal');
  function rendreJournal() {
    if (E.detruit) return; const g = majGardien(), F = E.filtres;
    const L = E.lignes.filter(l => (!F.actif || l.actif === F.actif) && (!F.setup || l.setup === F.setup) && (!F.etat || l.evenement === F.etat)).sort((a, b) => b.t - a.t);
    const tab = (titre, B) => `<div class="tr-carte"><h3>${titre}</h3>${B.length ? `<table class="tr-tab"><thead><tr><th></th><th>Trades</th><th>Total</th><th>Moyenne</th></tr></thead><tbody>${B.map(b => `<tr><td>${esc(b.nom)}</td><td>${b.n}</td>${b.assez ? `<td>${r2(b.total)}</td><td>${r2(b.moyenne)}</td>` : `<td colspan="2" class="tr-doux">pas assez de données (${b.n}/${GARDIEN.minTrades})</td>`}</tr>`).join('')}</tbody></table>` : '<p class="tr-doux">Aucun trade clôturé.</p>'}</div>`;
    pJ.innerHTML = `<div class="tr-gardien ${g.niveau === 'ok' ? '' : g.niveau === 'alerte' ? 'alerte' : 'danger'}"><b>Gardien</b><span>Résultat du jour ${g.resultatJour$ >= 0 ? '+' : ''}${g.resultatJour$.toFixed(0)} $ (perte ${g.pertesJourPct.toFixed(2).replace('.', ',')} % ; alerte ${GARDIEN.alerteJour} %, avertissement ${GARDIEN.avertissementJour} %)</span><span>Drawdown total ${g.drawdownPct.toFixed(2).replace('.', ',')} % (limite du défi ${GARDIEN.limiteTotale} %)</span><span>Équité simulée ${g.equite.toFixed(0)} $</span><span>${esc(g.message)}</span></div>
      <div class="tr-filtres"><select data-f="actif"><option value="">tous les actifs</option>${Object.values(PAR_ID_T).map(a => `<option value="${a.id}" ${F.actif === a.id ? 'selected' : ''}>${esc(a.nom)}</option>`).join('')}</select>
        <select data-f="setup"><option value="">tous les setups</option>${SETUPS.map(s => `<option ${F.setup === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <select data-f="etat"><option value="">tous les événements</option>${Object.entries(LIBELLES).map(([k2, v]) => `<option value="${k2}" ${F.etat === k2 ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        <button class="tr-btn" data-j="json">Exporter JSON</button><button class="tr-btn" data-j="csv">Exporter CSV</button><label class="tr-btn" style="cursor:pointer">Importer<input type="file" accept=".json,.csv,application/json,text/csv" data-j="import" hidden></label>
        <span class="tr-mini">Positions simulées : aucun ordre réel.</span></div>
      <table class="tr-tableau"><thead><tr><th>Date</th><th>Actif</th><th>Sens</th><th>Événement</th><th>Prix</th><th>R</th><th>Durée</th><th>Setup</th><th>Actualité</th><th>Note</th></tr></thead><tbody>${L.slice(0, 300).map(l => `<tr data-ligne-pos="${esc(l.position)}"><td class="tr-mono">${heure(l.t)}</td><td>${esc((PAR_ID_T[l.actif] || {}).nom || l.actif)}</td><td>${esc(l.sens)}</td><td>${esc(LIBELLES[l.evenement] || l.evenement)}</td><td class="tr-mono">${l.prix != null ? f(l.actif, l.prix) : '—'}</td><td class="tr-mono ${l.R > 0 ? 'tr-up' : l.R < 0 ? 'tr-down' : ''}">${l.R != null ? r2(l.R) : ''}</td><td>${duree(l.duree)}</td><td>${esc(l.setup)}</td><td>${esc(l.actualite)}</td><td>${esc(l.note)}</td></tr>`).join('') || '<tr><td colspan="10" class="tr-doux">Le journal se remplit tout seul : outil « Position » (⊿) puis un clic sur le graphique.</td></tr>'}</tbody></table>
      <div class="tr-dash" style="margin-top:10px">${tab('Bilan par setup', bilan(E.P, 'setup'))}${tab('Bilan par actif', bilan(E.P, 'actif'))}${tab('Bilan par heure d’entrée (Paris)', bilan(E.P, 'heure'))}</div>`;
  }
  pJ.addEventListener('change', async e => {
    const k2 = e.target.dataset.f; if (k2) { E.filtres[k2] = e.target.value; rendreJournal(); return; }
    if (e.target.dataset.j === 'import') { const fi = e.target.files[0]; if (!fi) return; const txt = await fi.text();
      try { if (/\.csv$/i.test(fi.name)) { const L = importerCsv(txt); let n = 0; for (const l of L) if (!E.lignes.some(x => x.id === l.id)) { E.lignes.push(l); await st.ecrire('journal', l); n++; } T.bandeau(`${n} lignes importées.`); }
        else { const d = importerJson(txt); let n = 0; for (const p of d.positions) if (!E.P.some(x => x.id === p.id)) { E.P.push(p); await st.ecrire('positions', p); n++; } for (const l of d.lignes) if (!E.lignes.some(x => x.id === l.id)) { E.lignes.push(l); await st.ecrire('journal', l); } T.bandeau(`${n} positions importées.`); }
        rendreJournal(); G.redessiner(); } catch (x) { T.bandeau('Import refusé : ' + x.message); } }
  });
  pJ.addEventListener('click', e => {
    const j = e.target.dataset.j; if (j === 'json' || j === 'csv') { const txt = j === 'json' ? exporterJson(E.P, E.lignes) : exporterCsv(E.lignes); const b = new Blob([txt], { type: j === 'json' ? 'application/json' : 'text/csv' }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = `rayle-journal.${j}`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); return; }
    const tr = e.target.closest('[data-ligne-pos]'); if (tr) { const p = E.P.find(q => q.id === tr.dataset.lignePos); if (p) { if (p.actif !== T.actif()) T.choisirActif(p.actif); E.sel = p.id; ouvrirEdition(p); } }
  });
  const offActif = T.on('actif', () => { E.sel = null; G.redessiner(); });

  rendreJournal(); suivreTout();
  return {
    E, positions: () => E.P, lignes: () => E.lignes, gardien: () => etatGardien(), suivreTout, rendreJournal,
    /* Rayle (phase D) : propose une position pré-remplie, à valider d'un clic ; jamais un ordre */
    async proposer({ actif = T.actif(), entree, stop, objectif, note = '' }) { const p = nouvelle(entree, { actif, stop, objectif, origine: 'rayle', etat: 'proposee', note }); if (!p) return null; return ajouter(p); },
    async creer(d) { const p = nouvelle(d.entree, d); return ajouter(p); },
    async actionner(id, a) { const p = E.P.find(q => q.id === id); if (!p) return null; panneau.dataset.pos = id; const b = document.createElement('button'); b.dataset.pa = a; panneau.appendChild(b); b.click(); b.remove(); return E.P.find(q => q.id === id); },
    detruire() { E.detruit = true; clearInterval(minut); offPrix(); offClot(); offActif(); el.removeEventListener('pointerdown', surDown, true); el.removeEventListener('pointermove', surMove, true); window.removeEventListener('pointerup', surUp, true); }
  };
}
