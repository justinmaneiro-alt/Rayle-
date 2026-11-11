/* ═════════════ PAGES DU TERMINAL : Actualités, COT, Santé du marché, Institutions, Calendrier ═════════════
   Données publiques lues par le serveur du PC (app-pc/terminal-donnees.mjs) : le navigateur ne peut pas les lire seul (pas de CORS).
   Chaque bloc dit sa source, sa date et son éventuel retard ; une source en panne affiche « indisponible : raison », jamais une valeur inventée.
   Rayle lit chaque page : `instantane(nom)` donne l'état structuré, `commande(texte)` répond à voix haute. Aucun conseil d'achat ou de vente. */
import * as C from './pages-calcul.js';
import { instrument, PAR_ID } from '../or/instruments.js';
const { nf, signe, dateFr, dateMs } = C;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lienSur = u => (/^https?:\/\//.test(u || '') ? u : '#');

/* courbe SVG sobre : points [{x (nombre), y}] ; ligne de référence facultative (zéro, MA200…) */
export function courbe(points, { w = 340, h = 96, ref = null, ref2 = null, couleur = 'var(--pg-c, #8fd0e3)', format = v => nf(v, 0), etiquette = '' } = {}) {
  const P = (points || []).filter(p => Number.isFinite(p.y)); if (P.length < 2) return `<div class="pg-vide" style="height:${h}px">pas assez de points</div>`;
  const ys = P.map(p => p.y).concat([ref, ref2].filter(Number.isFinite)), lo = Math.min(...ys), hi = Math.max(...ys), sp = hi - lo || 1, m = 4;
  const X = i => m + (w - 2 * m) * i / (P.length - 1), Y = v => h - m - (h - 2 * m) * (v - lo) / sp;
  const d = P.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
  const lignes = [[ref, 'pg-ref'], [ref2, 'pg-ref2']].filter(([v]) => Number.isFinite(v)).map(([v, c]) => `<line class="${c}" x1="0" x2="${w}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`).join('');
  const der = P[P.length - 1];
  return `<svg class="pg-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(etiquette)}" preserveAspectRatio="none">${lignes}<path d="${d}" fill="none" stroke="${couleur}" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="${X(P.length - 1).toFixed(1)}" cy="${Y(der.y).toFixed(1)}" r="2.6" fill="${couleur}"/></svg><div class="pg-axe"><span>${esc(format(lo))}</span><span>${esc(format(hi))}</span></div>`;
}
/* sous-échantillonne pour garder des SVG légers */
const echantillon = (L, n = 220) => { if (L.length <= n) return L; const k = L.length / n, o = []; for (let i = 0; i < n; i++) o.push(L[Math.floor(i * k)]); o.push(L[L.length - 1]); return o; };

export function monterPages({ zones, parler = () => {}, aller = () => {}, fetchFn = (...a) => fetch(...a), actif = () => 'OR', maintenant = () => Date.now() } = {}) {
  const E = { donnees: {}, snap: {}, cotAns: '3', actusFiltre: 'marches', rendus: {} };
  const origine = (() => { try { const l = location; return /^(127\.0\.0\.1|localhost)$/.test(l.hostname) ? l.origin : (l.protocol === 'file:' ? null : l.origin); } catch (e) { return ''; } })();
  async function api(chemin) {
    const r = await fetchFn((origine ?? '') + chemin);
    const type = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
    if (!/json/.test(type)) throw new Error('le serveur du PC ne répond pas à cette route (relance l’application Rayle : la route ' + chemin.split('?')[0] + ' est récente)');
    const d = await r.json(); if (!r.ok || (d && d.erreur)) throw new Error((d && d.erreur) || 'erreur ' + r.status); return d;
  }
  const panne = (e, ctx = '') => `<p class="pg-panne" role="alert">Indisponible${ctx ? ' (' + esc(ctx) + ')' : ''} : ${esc(e && e.message || e)}</p>`;
  const entete = (titre, sous) => `<h2>${esc(titre)} <small>${esc(sous)}</small></h2>`;
  const snap = (nom, o) => { E.snap[nom] = { page: nom, maj: maintenant(), ...o }; };

  /* ───── Actualités ───── */
  const THEMES = [['banques centrales', /\b(fed|federal reserve|ecb|boj|boe|powell|lagarde|rate (cut|hike)|interest rates?)\b/i], ['dollar et taux', /\b(dollar|usd|yields?|treasur)/i], ['or et métaux', /\b(gold|silver|bullion|xau|precious)\b/i], ['actions', /\b(stocks?|nasdaq|s&p|equities|wall street|dow)\b/i], ['crypto', /\b(bitcoin|crypto|ethereum|solana|btc)\b/i], ['géopolitique et droits de douane', /\b(war|tariffs?|sanctions?|iran|russia|china|ukraine|israel|trade deal)\b/i], ['inflation et emploi', /\b(inflation|cpi|ppi|payrolls?|jobs|unemployment)\b/i]];
  function resumeActus(items) {
    if (!items || !items.length) return 'Aucune actualité chargée.';
    const cnt = THEMES.map(([n, re]) => [n, items.filter(x => re.test(x.titre + ' ' + (x.resume || ''))).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const der = items.find(x => C.titreLisible(x.titre)) || items[0];
    return `Sur les ${items.length} dernières actualités de sources fiables${cnt.length ? ', les thèmes dominants sont : ' + cnt.map(([n, k]) => `${n} (${k})`).join(', ') : ''}. La plus récente vient de ${der.source}, le ${dateMs(der.date)} : ${der.titre}. Ce sont des faits de presse, pas des consignes.`;
  }
  async function pageActus(el) {
    const q = E.actusFiltre;
    el.innerHTML = entete('Actualités', 'sources fiables, datées · filtrées') + `<p class="pg-barre">${[['or', 'Or'], ['marches', 'Or et marchés'], ['tout', 'Tout']].map(([k, n]) => `<button type="button" data-pg-filtre="${k}" class="${k === q ? 'actif' : ''}">${n}</button>`).join('')} <button type="button" data-pg-lire="actus">🔊 Résumé de Rayle</button></p><div data-pg-corps><p class="pg-doux">Chargement…</p></div>`;
    const corps = el.querySelector('[data-pg-corps]');
    try {
      const d = E.donnees.actus = await api(`/__actus?q=${q}&n=60`);
      const ko = d.sources.filter(s => !s.ok);
      corps.innerHTML = `<div class="pg-resume"><b>Résumé de Rayle</b> <small>fait par des règles à partir des titres, sans IA</small><p>${esc(resumeActus(d.items))}</p></div>
        <ul class="pg-liste">${d.items.map(x => `<li><a href="${esc(lienSur(x.lien))}" target="_blank" rel="noopener noreferrer">${esc(x.titre)}</a><small>${esc(x.source)} · ${x.date ? new Date(x.date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'date inconnue'}</small>${x.resume ? `<span>${esc(x.resume)}</span>` : ''}</li>`).join('') || '<li>Aucune actualité ne correspond à ce filtre pour le moment.</li>'}</ul>
        <p class="pg-src">Sources : ${d.sources.map(s => `${esc(s.nom)}${s.ok ? ` (${s.n})` : ' — indisponible : ' + esc(s.erreur || '')}`).join(' · ')}. ${ko.length ? 'Les sources indisponibles ne sont pas remplacées par des données inventées.' : ''}</p>`;
      snap('actualites', { titre: 'Actualités', source: d.sources.filter(s => s.ok).map(s => s.nom).join(', '), nb: d.items.length, resume: resumeActus(d.items), lignes: d.items.slice(0, 10).map(x => ({ titre: x.titre, source: x.source, date: x.date })) });
    } catch (e) { corps.innerHTML = panne(e, 'actualités'); snap('actualites', { titre: 'Actualités', erreur: String(e.message) }); }
  }

  /* ───── COT ───── */
  async function pageCot(el, instId = actif()) {
    const inst = instrument(instId), cle = inst.cot;
    el.innerHTML = entete('COT : positions des fonds', `${inst.long} · rapport hebdomadaire de la CFTC`) + `<p class="pg-barre">${[['1', '1 an'], ['2', '2 ans'], ['3', '3 ans']].map(([k, n]) => `<button type="button" data-pg-cot="${k}" class="${k === E.cotAns ? 'actif' : ''}">${n}</button>`).join('')} <button type="button" data-pg-lire="cot">🔊 Explique le COT</button></p><div data-pg-corps><p class="pg-doux">Chargement…</p></div>`;
    const corps = el.querySelector('[data-pg-corps]');
    if (!cle) { corps.innerHTML = `<p class="pg-panne">Aucun rapport COT n’existe pour ${esc(inst.long)}.</p>`; snap('cot', { titre: 'COT', erreur: 'aucun rapport pour cet instrument' }); return; }
    try {
      const d = E.donnees['cot|' + cle] = E.donnees['cot|' + cle] || await api(`/__cot?inst=${cle}&n=160`); E.donnees.cot = d;
      const S = C.fenetreCot(d, E.cotAns), st = C.statsCot(d, E.cotAns);
      const grapheur = (nom, f, fraseF) => `<section class="pg-carte"><h3>${esc(nom)} <small>position nette, contrats</small></h3>${courbe(echantillon(S.map((x, i) => ({ x: i, y: f(x) }))).filter(p => Number.isFinite(p.y)), { ref: 0, format: v => nf(v, 0), etiquette: nom })}<p class="pg-sens">${esc(fraseF)}</p></section>`;
      corps.innerHTML = `<p class="pg-src">${esc(d.source)} · dernier rapport : <b>${dateFr(st.der.date)}</b> (positions au mardi, publication le vendredi : retard de 3 à 4 jours) · ${st.n} semaines affichées</p>
        <div class="pg-grille">${grapheur(d.nomSpec, x => x.spec.net, C.phraseSpec(d, st))}${st.commNet == null ? '' : grapheur(d.nomComm, x => x.comm ? x.comm.net : NaN, C.phraseComm(d, st))}
        <section class="pg-carte"><h3>Intérêt ouvert <small>contrats en circulation</small></h3>${courbe(echantillon(S.map((x, i) => ({ x: i, y: x.oi }))), { format: v => nf(v, 0), etiquette: 'intérêt ouvert' })}<p class="pg-sens">Ce que ça veut dire : l’intérêt ouvert (${nf(st.oi)}) mesure la taille du marché à terme. Quand il monte avec le prix, de l’argent frais entre ; quand il baisse, des positions se ferment.</p></section></div>
        <table class="pg-tab"><tr><th></th><th>Net</th><th>Variation 4 sem.</th><th>Percentile (${st.n} sem.)</th></tr><tr><td>${esc(d.nomSpec)}</td><td>${signe(st.specNet)}</td><td>${signe(st.specVar4)}</td><td>${st.specPct}</td></tr>${st.commNet == null ? '' : `<tr><td>${esc(d.nomComm)}</td><td>${signe(st.commNet)}</td><td>${signe(st.commVar4)}</td><td>${st.commPct}</td></tr>`}</table>
        <p class="pg-doux">${esc(d.libelle)}. Le COT décrit des positions passées, pas l’avenir. Percentile : part des semaines de la période où la position nette était inférieure ou égale à l’actuelle.</p>`;
      snap('cot', { titre: 'COT ' + d.libelle, source: d.source, dateRapport: st.der.date, semaines: st.n, specNet: st.specNet, specVar4: st.specVar4, specPercentile: st.specPct, commNet: st.commNet, commPercentile: st.commPct, oi: st.oi, phrase: C.phraseCotVoix(d, E.cotAns) });
    } catch (e) { corps.innerHTML = panne(e, 'COT'); snap('cot', { titre: 'COT', erreur: String(e.message) }); }
  }

  /* ───── Santé du marché ───── */
  const SYMS = ['DX-Y.NYB', '^TNX', '^VIX', '^GSPC', '^NDX', 'GLD', 'GDX', 'GC=F', 'BTC-USD'];
  async function pageSante(el) {
    el.innerHTML = entete('Santé du marché', 'dollar, taux, volatilité, tendance de fond, flux de l’ETF d’or') + `<p class="pg-barre"><button type="button" data-pg-lire="sante">🔊 Où en est la santé du marché</button></p><div data-pg-corps><p class="pg-doux">Chargement…</p></div>`;
    const corps = el.querySelector('[data-pg-corps]'), erreurs = [];
    const [y, s, g] = await Promise.all([api(`/__yahoo?syms=${encodeURIComponent(SYMS.join(','))}&range=2y`).catch(e => { erreurs.push('Yahoo : ' + e.message); return null; }), api('/__sante').catch(e => { erreurs.push('taux : ' + e.message); return null; }), api('/__gld').catch(e => { erreurs.push('GLD : ' + e.message); return null; })]);
    const cote = sym => (y && y.cotes && y.cotes[sym] && !y.cotes[sym].erreur ? y.cotes[sym] : null);
    const carte = (titre, sous, svg, phrase, valeur) => `<section class="pg-carte"><h3>${esc(titre)} <small>${esc(sous)}</small></h3>${valeur ? `<p class="pg-val">${valeur}</p>` : ''}${svg}<p class="pg-sens">${esc(phrase)}</p></section>`;
    const indispo = (titre, raison) => `<section class="pg-carte pg-ko"><h3>${esc(titre)}</h3><p class="pg-panne">Indisponible : ${esc(raison)}</p></section>`;
    const serieC = (c, n = 260) => echantillon((c.serie || []).slice(-n).map((p, i) => ({ x: i, y: p.c })));
    const lignes = [], cartes = [], faits = {};
    const dxy = cote('DX-Y.NYB'); if (dxy) { const v = C.variationSerie(dxy.serie, 20); faits.dxy = v; cartes.push(carte('Dollar (DXY)', '1 an', courbe(serieC(dxy), { format: v2 => nf(v2, 1), etiquette: 'dollar' }), `Ce que ça veut dire : un dollar qui monte pèse souvent sur l’or (il devient plus cher pour les autres monnaies). Variation sur 20 séances : ${signe(v, 1)} %.`, `<b>${nf(dxy.prix, 2)}</b> <span>${signe(v, 1)} % sur 20 séances</span>`)); lignes.push(`Dollar ${nf(dxy.prix, 2)}, ${signe(v, 1)} % sur 20 séances`); } else cartes.push(indispo('Dollar (DXY)', 'Yahoo ne répond pas'));
    if (s && s.reels && s.reels.serie.length) { const L = s.reels.serie, der = L[L.length - 1], av = L[L.length - 22] || L[0]; faits.reels = der.v; cartes.push(carte('Taux réels 10 ans', `Trésor américain · ${dateFr(der.date)}`, courbe(echantillon(L.slice(-260).map((p, i) => ({ x: i, y: p.v }))), { ref: 0, format: v => nf(v, 2) + ' %', etiquette: 'taux réels' }), `Ce que ça veut dire : l’or ne rapporte aucun intérêt ; quand le taux réel monte, détenir de l’or coûte relativement plus cher. Variation sur ~1 mois : ${signe(der.v - av.v, 2)} point.`, `<b>${nf(der.v, 2)} %</b> <span>${signe(der.v - av.v, 2)} pt sur 1 mois</span>`)); lignes.push(`Taux réel 10 ans ${nf(der.v, 2)} % au ${dateFr(der.date)}`); } else cartes.push(indispo('Taux réels 10 ans', (s && s.erreurs && s.erreurs.reels) || 'Trésor américain non joignable'));
    if (s && s.fed && s.fed.serie.length) { const L = s.fed.serie, der = L[L.length - 1]; faits.fed = der.v; cartes.push(carte('Taux de la Fed', `New York Fed · ${dateFr(der.date)}`, courbe(echantillon(L.map((p, i) => ({ x: i, y: p.v }))), { format: v => nf(v, 2) + ' %', etiquette: 'taux Fed' }), `Ce que ça veut dire : taux effectif au jour le jour ${nf(der.v, 2)} %${Number.isFinite(der.bas) && Number.isFinite(der.haut) ? ` (fourchette cible ${nf(der.bas, 2)} à ${nf(der.haut, 2)} %)` : ''}. Des taux plus bas soutiennent plutôt l’or, des taux plus hauts le contrarient.`, `<b>${nf(der.v, 2)} %</b>`)); lignes.push(`Taux Fed effectif ${nf(der.v, 2)} %`); } else cartes.push(indispo('Taux de la Fed', (s && s.erreurs && s.erreurs.fed) || 'New York Fed non joignable'));
    const vix = cote('^VIX'); if (vix) { faits.vix = vix.prix; cartes.push(carte('VIX', 'volatilité attendue des actions · 1 an', courbe(serieC(vix), { ref: 20, format: v => nf(v, 0), etiquette: 'VIX' }), `Ce que ça veut dire : sous 20 le marché est plutôt calme, au-dessus de 30 il est sous tension. Valeur actuelle : ${nf(vix.prix, 1)}.`, `<b>${nf(vix.prix, 1)}</b>`)); lignes.push(`VIX ${nf(vix.prix, 1)}`); } else cartes.push(indispo('VIX', 'Yahoo ne répond pas'));
    for (const [sym, nom, id] of [['^GSPC', 'S&P 500', 'sp'], ['^NDX', 'Nasdaq 100', 'nq']]) {
      const c = cote(sym); if (!c) { cartes.push(indispo(nom + ' / MA200', 'Yahoo ne répond pas')); continue; }
      const e = C.ecartMa(c.serie, 200), cl = (c.serie || []).map(p => p.c), m = C.sma(cl, 200); faits[id] = e;
      cartes.push(e.ok ? carte(`${nom} / MA200`, '1 an · trait fin = moyenne 200 jours', courbe(echantillon(cl.slice(-260).map((v, i) => ({ x: i, y: v }))), { ref: e.ma, format: v => nf(v, 0), etiquette: nom }), `Ce que ça veut dire : ${C.phraseMa(nom, e)}`, `<b>${nf(e.prix, 0)}</b> <span>${signe(e.ecartPct, 1)} % vs MA200</span>`) : indispo(nom + ' / MA200', e.raison));
      lignes.push(C.phraseMa(nom, e));
    }
    if (g && g.serie && g.serie.length > 30) { const S = g.serie, d = S[S.length - 1], i30 = S[S.length - 22] || S[0]; faits.gldVar30 = d.tonnes - i30.tonnes; cartes.push(carte('Flux de l’ETF GLD', `tonnes en dépôt · SPDR · ${dateFr(d.date)}`, courbe(echantillon(S.slice(-260).map((p, i) => ({ x: i, y: p.tonnes }))), { format: v => nf(v, 0) + ' t', etiquette: 'tonnes GLD' }), C.phraseGld(g), `<b>${nf(d.tonnes, 1)} t</b> <span>${signe(d.tonnes - i30.tonnes, 1)} t sur 1 mois</span>`)); lignes.push(`GLD ${nf(d.tonnes, 1)} tonnes, ${signe(d.tonnes - i30.tonnes, 1)} t sur 1 mois`); } else cartes.push(indispo('Flux de l’ETF GLD', 'fichier SPDR non joignable'));
    const or = cote('GC=F'), corr = [];
    if (or) for (const [sym, nom] of [['DX-Y.NYB', 'Dollar'], ['^TNX', 'Taux 10 ans'], ['^GSPC', 'S&P 500'], ['^VIX', 'VIX'], ['BTC-USD', 'Bitcoin'], ['GDX', 'Mineurs d’or (GDX)']]) { const c = cote(sym); if (c) corr.push([nom, C.correlation(or.serie, c.serie, 60)]); else corr.push([nom, { r: null, n: 0 }]); }
    cartes.push(or ? `<section class="pg-carte"><h3>Corrélations de l’or <small>rendements journaliers, 60 jours · or = contrat à terme GC=F</small></h3><table class="pg-tab">${corr.map(([n, c]) => `<tr><td>${esc(n)}</td><td class="pg-nb">${c.r == null ? '—' : (c.r >= 0 ? '+' : '−') + Math.abs(c.r).toFixed(2).replace('.', ',')}</td><td>${esc(c.r == null ? 'indisponible' : C.mots(c.r))}</td></tr>`).join('')}</table><p class="pg-sens">Ce que ça veut dire : une corrélation proche de +1 = les deux bougent ensemble ; proche de −1 = en sens inverse ; proche de 0 = pas de lien net sur la période. Elle change avec le temps.</p></section>` : indispo('Corrélations de l’or', 'cotation de l’or indisponible'));
    corps.innerHTML = `<div class="pg-grille">${cartes.join('')}</div>${erreurs.length ? `<p class="pg-panne" role="alert">Sources en panne : ${esc(erreurs.join(' · '))}</p>` : ''}<p class="pg-src">Sources : Yahoo Finance (différé possible), Trésor américain, New York Fed, SPDR Gold Shares. Lecture seule, aucune valeur inventée.</p>`;
    E.donnees.sante = { faits, corr };
    snap('sante', { titre: 'Santé du marché', source: 'Yahoo Finance, Trésor américain, New York Fed, SPDR', erreurs, faits: { ...faits, sp: faits.sp && faits.sp.ok ? { ecartMaPct: faits.sp.ecartPct, dessus: faits.sp.dessus } : null, nq: faits.nq && faits.nq.ok ? { ecartMaPct: faits.nq.ecartPct, dessus: faits.nq.dessus } : null }, correlations: corr.map(([n, c]) => ({ nom: n, r: c.r, n: c.n })), lignes });
  }

  /* ───── Institutions ───── */
  async function pageInstitutions(el) {
    el.innerHTML = entete('Institutions', 'sources publiques, datées et liées') + `<p class="pg-barre"><button type="button" data-pg-lire="banques">🔊 Qu’ont dit les banques cette semaine</button></p><div data-pg-corps><p class="pg-doux">Chargement…</p></div>`;
    const corps = el.querySelector('[data-pg-corps]');
    const [d, b, cot] = await Promise.all([api('/__institutions').catch(e => ({ erreur: e.message })), api('/__banques?n=30').catch(e => ({ erreur: e.message })), api('/__cot?inst=OR&n=8').catch(e => ({ erreur: e.message }))]);
    E.donnees.institutions = d; E.donnees.banques = b;
    const liste = (items, vide) => `<ul class="pg-liste">${(items || []).map(x => `<li><a href="${esc(lienSur(x.lien))}" target="_blank" rel="noopener noreferrer">${esc(x.titre)}</a><small>${dateMs(x.date)}</small></li>`).join('') || `<li>${esc(vide)}</li>`}</ul>`;
    const flux = id => (d.flux || []).find(f => f.id === id) || { ok: false, erreur: 'non chargé', items: [] };
    const bloc = (titre, f, vide) => `<section class="pg-carte"><h3>${esc(titre)}</h3>${f.ok ? liste(f.items, vide) : panne(new Error(f.erreur || 'indisponible'))}</section>`;
    const wgc = flux('wgc'), wgcCle = (wgc.items || []).filter(x => /demand|central bank|gold demand|reserves?|ETF/i.test(x.titre));
    corps.innerHTML = d.erreur ? panne(new Error(d.erreur), 'institutions') : `
      <section class="pg-carte"><h3>COT · CFTC <small>positions des fonds</small></h3>${cot && !cot.erreur ? `<p>Rapport du <b>${dateFr(cot.dernier.date)}</b> : fonds spéculatifs ${signe(cot.dernier.spec.net)} contrats nets, commerciaux ${cot.dernier.comm ? signe(cot.dernier.comm.net) : '—'}. <a href="https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm" target="_blank" rel="noopener noreferrer">Source CFTC</a> · détail dans l’onglet COT.</p>` : panne(new Error(cot && cot.erreur || 'indisponible'))}</section>
      <section class="pg-carte"><h3>Positions trimestrielles des fonds · SEC (13F) <small>retard de 45 jours</small></h3><p class="pg-avert">Un 13F est déposé jusqu’à 45 jours après la fin du trimestre : il montre où étaient les fonds il y a plusieurs semaines, pas aujourd’hui. Il ne couvre que les actions et ETF américains, pas l’or physique ni les contrats à terme.</p>
        <table class="pg-tab"><tr><th>Fonds</th><th>Trimestre</th><th>Déposé le</th><th>Document</th></tr>${(d.f13 || []).map(f => f.ok ? `<tr><td>${esc(f.fonds)}</td><td>${dateFr(f.periode)}</td><td>${dateFr(f.depose)}</td><td><a href="${esc(f.lien)}" target="_blank" rel="noopener noreferrer">${esc(f.formulaire)} (SEC)</a></td></tr>` : `<tr><td>${esc(f.fonds)}</td><td colspan="3" class="pg-panne">indisponible : ${esc(f.erreur)}</td></tr>`).join('')}</table></section>
      ${bloc('World Gold Council · demande d’or et banques centrales', { ...wgc, items: wgcCle.length ? wgcCle : wgc.items }, 'Aucune publication récente sur la demande ou les banques centrales.')}
      ${bloc('Réserve fédérale · communiqués et procès-verbaux', flux('fed'), 'Aucune publication récente.')}
      ${bloc('Banque centrale européenne · communiqués', flux('bce'), 'Aucune publication récente.')}
      ${bloc('BRI · discours des banquiers centraux', flux('bri'), 'Aucune publication récente.')}
      <section class="pg-carte pg-large"><h3>Prévisions de banques <small>relayées par la presse financière, avec lien et date</small></h3>${b.erreur ? panne(new Error(b.erreur), 'banques') : `<ul class="pg-liste">${b.items.map(x => `<li><a href="${esc(lienSur(x.lien))}" target="_blank" rel="noopener noreferrer">${esc(x.titre)}</a><small>${esc(x.banque || '')} · ${dateMs(x.date)}</small></li>`).join('') || '<li>Aucune prévision de banque trouvée dans la presse ces derniers jours.</li>'}</ul><p class="pg-src">${esc(b.source)}. ${esc(b.note)}</p>`}</section>
      <p class="pg-doux"><b>Non accessibles :</b> ${(d.ecartees || []).map(x => `${esc(x.nom)} (${esc(x.raison)})`).join(' ; ')}. Chaque ligne ci-dessus a sa source et sa date ; rien n’est complété par une estimation.</p>`;
    snap('institutions', { titre: 'Institutions', source: 'CFTC, SEC, World Gold Council, Fed, BCE, BRI, presse financière', f13: (d.f13 || []).filter(f => f.ok).map(f => ({ fonds: f.fonds, periode: f.periode, depose: f.depose })), banques: (b.items || []).slice(0, 10), erreur: d.erreur || null });
  }

  /* ───── Calendrier ───── */
  const IMPACT = { High: 'fort', Medium: 'moyen', Low: 'faible', Holiday: 'férié' };
  async function pageCalendrier(el) {
    el.innerHTML = entete('Calendrier économique', 'semaine en cours · heure de Paris') + `<p class="pg-barre"><button type="button" data-pg-imp="fort" class="actif">Impact fort</button><button type="button" data-pg-imp="moyen">Fort et moyen</button><button type="button" data-pg-imp="tout">Tout</button></p><div data-pg-corps><p class="pg-doux">Chargement…</p></div>`;
    const corps = el.querySelector('[data-pg-corps]');
    try {
      const d = E.donnees.calendrier = await api('/__calendrier2');
      const L = d.evenements.map(x => ({ t: Date.parse(x.date), titre: x.title, pays: x.country, impact: IMPACT[x.impact] || x.impact, prevu: x.forecast || '', precedent: x.previous || '', actuel: x.actual || '' })).filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
      E.donnees.calendrierListe = L;
      const dessiner = (niv) => {
        const F = L.filter(x => niv === 'tout' || (niv === 'fort' ? x.impact === 'fort' : x.impact === 'fort' || x.impact === 'moyen')), n = maintenant();
        corps.querySelector('[data-pg-cal]').innerHTML = `<tr><th>Heure (Paris)</th><th>Pays</th><th>Événement</th><th>Impact</th><th>Prévu</th><th>Précédent</th><th>Publié</th></tr>` + (F.map(x => `<tr class="${x.t < n ? 'pg-passe' : ''}${x.impact === 'fort' ? ' pg-fort' : ''}"><td>${new Date(x.t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${esc(x.pays)}</td><td>${esc(x.titre)}</td><td>${esc(x.impact)}</td><td>${esc(x.prevu)}</td><td>${esc(x.precedent)}</td><td>${esc(x.actuel)}</td></tr>`).join('') || '<tr><td colspan="7">Aucun événement pour ce filtre.</td></tr>');
      };
      corps.innerHTML = `<div class="pg-tab-defile"><table class="pg-tab" data-pg-cal></table></div><p class="pg-src">${esc(d.source)} · mis à jour ${new Date(d.t).toLocaleTimeString('fr-FR')}. Les horaires sont convertis en heure de Paris.</p>`;
      dessiner('fort'); el._dessinerCal = dessiner;
      const prochains = L.filter(x => x.t > maintenant() && x.impact === 'fort').slice(0, 5).map(x => ({ titre: x.titre, pays: x.pays, quand: new Date(x.t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' }) }));
      E.donnees.prochains = prochains;
      snap('calendrier', { titre: 'Calendrier', source: d.source, nb: L.length, prochainsImpactFort: prochains });
    } catch (e) { corps.innerHTML = panne(e, 'calendrier'); snap('calendrier', { titre: 'Calendrier', erreur: String(e.message) }); }
  }

  /* ───── montage ───── */
  const PAGES = { actualites: pageActus, cot: pageCot, sante: pageSante, institutions: pageInstitutions, calendrier: pageCalendrier };
  const conteneurs = {};
  async function ouvrir(nom, { force = false } = {}) {
    const el = conteneurs[nom] || (zones && zones[nom]); if (!el || !PAGES[nom]) return null;
    conteneurs[nom] = el; if (E.rendus[nom] && !force && maintenant() - E.rendus[nom] < 300e3) return E.snap[nom]; E.rendus[nom] = maintenant();
    await PAGES[nom](el); return E.snap[nom];
  }
  const parlerSur = (t) => { if (C.sansConseil(t)) parler(t); else parler('Je ne peux pas formuler cette réponse.'); };
  async function lire(nom) {
    let t = '';
    if (nom === 'cot') { await ouvrir('cot'); t = C.phraseCotVoix(E.donnees.cot, E.cotAns); }
    else if (nom === 'sante') { await ouvrir('sante'); const s = E.snap.sante; t = s && !s.erreur ? 'Santé du marché. ' + (s.lignes || []).join('. ') + '. ' + (s.erreurs.length ? 'Sources en panne : ' + s.erreurs.join(' ; ') + '.' : '') : 'La santé du marché n’est pas disponible.'; }
    else if (nom === 'banques') { await ouvrir('institutions'); t = C.phraseBanques(E.donnees.banques); }
    else if (nom === 'actus') { await ouvrir('actualites'); t = resumeActus(E.donnees.actus && E.donnees.actus.items); }
    else if (nom === 'change') { t = await changePourOr(); }
    if (!C.sansConseil(t)) t = 'Je ne peux pas formuler cette réponse.';
    return t;
  }
  async function changePourOr() {
    const cot = await api('/__cot?inst=OR&n=160').catch(() => null); if (cot) E.donnees['cot|OR'] = cot;
    await Promise.all([ouvrir('sante'), ouvrir('calendrier'), ouvrir('institutions')]);
    const s = E.snap.sante && E.snap.sante.faits || {};
    return C.changePourOr({ cot, sante: { dxy: s.dxy, reels: s.reels, gldVar30: s.gldVar30 }, calendrier: E.donnees.prochains, banques: (E.donnees.banques && E.donnees.banques.items) || [] });
  }
  async function commande(texte) {
    const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9 ?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\bqu est ce qui change pour l or\b|\bce qui change pour l or\b|\bquoi de neuf pour l or\b/.test(n)) { aller('sante'); return lire('change'); }
    if (/\b(explique|expliquer|lis|resume)\b.*\bcot\b|\bcot\b.*\b(explique|c est quoi)\b/.test(n)) { aller('cot'); return lire('cot'); }
    if (/\b(sante du marche|sante des marches)\b/.test(n) && /\b(ou en est|etat|point|resume|comment va|explique|lis|affiche|ouvre)\b/.test(n)) { aller('sante'); return lire('sante'); }
    if (/\bbanques?\b/.test(n) && /\b(dit|disent|prevoient|prevision|previsions|cette semaine|annonce|objectif)\b/.test(n)) { aller('institutions'); return lire('banques'); }
    if (/\b(resume|lis|que disent).*\b(actualites?|infos?)\b|\bactualites? (du jour|de l or)\b/.test(n)) { aller('actualites'); return lire('actus'); }
    const nav = [[/\bactualites?\b/, 'actualites'], [/\bcot\b/, 'cot'], [/\bsante\b/, 'sante'], [/\binstitutions?\b/, 'institutions'], [/\bcalendrier\b/, 'calendrier']].find(([re]) => re.test(n));
    if (nav && /\b(ouvre|affiche|montre|va|passe)\b/.test(n)) { aller(nav[1]); await ouvrir(nav[1]); return `Page ${nav[1] === 'sante' ? 'Santé du marché' : nav[1] === 'cot' ? 'COT' : nav[1]} ouverte.`; }
    return null;
  }
  /* clics dans les pages */
  for (const nom of Object.keys(PAGES)) { const el = zones && zones[nom]; if (!el) continue; conteneurs[nom] = el;
    el.addEventListener('click', async ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.pgFiltre) { E.actusFiltre = b.dataset.pgFiltre; E.rendus.actualites = 0; await ouvrir('actualites', { force: true }); }
      else if (b.dataset.pgCot) { E.cotAns = b.dataset.pgCot; await pageCot(el); }
      else if (b.dataset.pgImp) { el.querySelectorAll('[data-pg-imp]').forEach(x => x.classList.toggle('actif', x === b)); el._dessinerCal && el._dessinerCal(b.dataset.pgImp); }
      else if (b.dataset.pgLire) { const t = await lire(b.dataset.pgLire); parlerSur(t); }
    });
  }
  return { ouvrir, lire, commande, resumeActus, instantane: nom => E.snap[nom] || null, instantanes: () => ({ ...E.snap }), etat: () => ({ rendus: { ...E.rendus }, cotAns: E.cotAns }), PAGES: Object.keys(PAGES) };
}
