/* ═════════════ « CE QUI FAIT BOUGER L'OR » : sources, panneau, « Pourquoi l'or bouge ? », fiches « Comment lire ça » (navigateur ; fetch injectable pour les tests) ═════════════
   Sources gratuites sans clé : dollar, taux 10 ans, ETF GLD, mineurs GDX et actualités par le Worker de Rayle (Yahoo, fil du monde) ; taux réels : US Treasury ; taux directeur : Fed de New York ;
   CFTC (COT) ; calendrier public. Une source qui répond mal = « indisponible : raison », jamais une valeur inventée. Information de lecture, jamais un ordre. */
import * as K from './contexte-calcul.js';
import * as C from './institutionnel-calcul.js';
const PROXY = 'https://api.allorigins.win/raw?url=';
const ls = k => { try { return localStorage.getItem(k) || (window.parent !== window ? window.parent.localStorage.getItem(k) : null); } catch (e) { return null; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function creerContexte({ racine, moteur, graph = null, fetchFn = (...a) => fetch(...a), parler = () => {}, maintenant = () => Date.now(), worker = null, auto = true } = {}) {
  const E = { facteurs: new Map(), geo: null, evenements: [], maj: 0, chargement: false };
  const cfg = () => worker || { url: (ls('rayle_worker_url') || '').replace(/\/+$/, ''), jeton: ls('rayle_worker_appareil') || ls('rayle_worker_token') || '' };
  async function viaWorker(chemin) {
    const w = cfg(); if (!w.url || !w.jeton) throw new Error('Worker de Rayle non configuré (⚙ Réglages)');
    const r = await fetchFn(w.url + chemin, { headers: { 'X-Rayle-Token': w.jeton }, signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined }); if (!r.ok) throw new Error('le Worker a répondu ' + r.status); return r.json();
  }
  async function texteLibre(url) {
    // FRED et le calendrier public n'envoient pas d'en-tête CORS : relais public directement (un essai direct ne ferait qu'une erreur de console)
    const r = await fetchFn(PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined }); if (!r.ok) throw new Error(new URL(url).host + ' : ' + r.status); return r.text();
  }
  let rendreProgressif = () => {}; const poser = (id, o) => { E.facteurs.set(id, { id, ...o }); rendreProgressif(); };
  const indispo = (id, e) => poser(id, { etat: 'indisponible', raison: String(e && e.message || e).slice(0, 120) });
  async function marche(id, actif) {
    try { const o = await viaWorker(`/marche?actif=${encodeURIComponent(actif)}&intervalle=1h&n=48`); const r = K.resumeSerie(o.bougies, maintenant()); if (!r) throw new Error('série vide'); const F = K.FACTEURS.find(f => f.id === id); poser(id, { etat: 'ok', valeur: r.valeur, variation: r.var24h, var1h: r.var1h, var24h: r.var24h, t: r.t, age: r.age, sens: K.sensPourOr(F.effet, id === 'us10y' ? r.var24h : r.var24h), source: o.source || F.source }); } catch (e) { indispo(id, e); }
  }
  async function fred(id, serie) {   // taux réels : courbe officielle du Treasury américain (CORS ouvert) ; taux directeur : Fed de New York (CORS ouvert)
    try {
      const F = K.FACTEURS.find(f => f.id === id);
      if (id === 'reels') { const r = await fetchFn(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${new Date(maintenant()).getUTCFullYear()}/all?type=daily_treasury_real_yield_curve&field_tdr_date_value=${new Date(maintenant()).getUTCFullYear()}&page&_format=csv`, { signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined }); if (!r.ok) throw new Error('Treasury : ' + r.status); const d = K.parseTreasuryReel(await r.text()); if (!d) throw new Error('série vide'); poser(id, { etat: 'ok', valeur: d.valeur, date: d.date, variation: d.deltaJour, deltaSemaine: d.deltaSemaine, sens: K.sensPourOr(F.effet, d.deltaJour, 0.005), source: 'US Treasury' }); }
      else { const r = await fetchFn('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/2.json', { signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined }); if (!r.ok) throw new Error('NY Fed : ' + r.status); const j = await r.json(), rr = (j.refRates || []).slice().sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate))), d = K.parseNyFed({ refRates: rr }); if (!d) throw new Error('aucune donnée'); const av = rr[1] ? +rr[1].percentRate : null; poser(id, { etat: 'ok', valeur: d.valeur, date: d.date, variation: av != null ? +(d.valeur - av).toFixed(3) : null, cible: [d.bas, d.haut], sens: K.sensPourOr(F.effet, av != null ? d.valeur - av : null, 0.005), source: 'NY Fed' }); }
    } catch (e) { indispo(id, e); }
  }
  async function cot() {
    try { const r = await fetchFn(`https://publicreporting.cftc.gov/resource/72hh-3qpy.json?$where=${encodeURIComponent("market_and_exchange_names like 'GOLD - COMMODITY%'")}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=3`, { signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined }); if (!r.ok) throw new Error('CFTC : ' + r.status); const d = K.parseCot(await r.json()); if (!d) throw new Error('aucune donnée'); poser('cot', { etat: 'ok', valeur: d.net, date: d.date, variation: d.variation, detail: d, sens: K.sensPourOr('direct', d.variation, 500), source: 'CFTC' }); } catch (e) { indispo('cot', e); }
  }
  async function geo() {
    try { const o = await viaWorker('/actualites/fil?portee=monde'); const titres = (o.sujets || []).flatMap(s => [s.titre, ...(s.sources || []).map(x => x.titre)]).filter(Boolean); if (!titres.length) throw new Error('aucun titre'); E.geo = K.scoreGeo((o.sujets || []).map(s => s.titre), { ref: 12 }); poser('geo', { etat: 'ok', valeur: E.geo.n, detail: E.geo, sens: E.geo.niveau === 'élevé' ? { code: 'favorable', texte: 'plutôt favorable à l\'or (valeur refuge)' } : { code: 'neutre', texte: 'neutre' }, source: 'fil du monde' }); } catch (e) { E.geo = null; indispo('geo', e); }
  }
  async function calendrier() {
    try { const j = JSON.parse(await texteLibre('https://nfs.faireconomy.media/ff_calendar_thisweek.json')); E.evenements = K.evenementsDuJour(j, maintenant()); poser('calendrier', { etat: 'ok', valeur: E.evenements.length, detail: E.evenements, source: 'Forex Factory' }); } catch (e) { E.evenements = []; indispo('calendrier', e); }
  }
  function fed() { const f = E.facteurs.get('fed'), p = K.prochainFomc(new Date(maintenant()).toISOString().slice(0, 10)); if (f && f.etat === 'ok') f.prochain = p; }
  async function charger() {
    if (E.chargement) return; E.chargement = true; try { await Promise.all([marche('dxy', 'Y:DX-Y.NYB'), marche('us10y', 'Y:^TNX'), marche('gld', 'Y:GLD'), marche('mineurs', 'Y:GDX'), fred('reels', 'reels'), fred('fed', 'fed'), cot(), geo(), calendrier()]); fed(); E.maj = maintenant(); } finally { E.chargement = false; } rendre();
  }
  /* ── panneau ── */
  const fm = (id, f) => { const d = id === 'us10y' || id === 'reels' || id === 'fed' ? 3 : id === 'cot' ? 0 : 2; return f.valeur == null ? '—' : K.nombre(f.valeur, d) + (({ us10y: ' %', reels: ' %', fed: ' %', dxy: '', gld: ' $', mineurs: ' $' })[id] || ''); };
  const fv = (id, f) => { if (f.variation == null) return '—'; if (id === 'cot') return (f.variation >= 0 ? '+' : '−') + K.nombre(Math.abs(f.variation), 0) + ' contrats (semaine)'; if (id === 'reels' || id === 'fed') return (f.variation >= 0 ? '+' : '−') + K.nombre(Math.abs(f.variation), 3) + ' point (jour)'; return (f.variation >= 0 ? '+' : '−') + K.nombre(Math.abs(f.variation), 2) + ' % (24 h)'; };
  function ligneSpeciale(id, f) { if (id === 'cot' && f.detail) return `net ${K.nombre(f.detail.net, 0)} contrats (acheteurs ${K.nombre(f.detail.long, 0)}, vendeurs ${K.nombre(f.detail.court, 0)}), rapport du ${f.date}`; if (id === 'fed') return `${f.cible && f.cible[0] != null ? 'fourchette cible ' + f.cible[0] + ' à ' + f.cible[1] + ' %' : ''}${f.prochain ? ' · prochaine décision de la Fed : ' + f.prochain + ' (calendrier à vérifier sur federalreserve.gov)' : ''}`; if (id === 'geo' && f.detail) return `${f.detail.n} titres sur ${f.detail.total} concernent des tensions : niveau ${f.detail.niveau}`; if (id === 'calendrier') return f.detail && f.detail.length ? f.detail.map(e => `${e.heure} ${e.titre}${e.prevu ? ' (prévu ' + e.prevu + ')' : ''}${e.reel ? ' → ' + e.reel : ''}`).join(' · ') : 'aucune annonce américaine importante aujourd\'hui'; return ''; }
  function rendre() {
    const el = racine && racine.querySelector('[data-contexte-corps]'); if (!el) return;
    const lignes = K.FACTEURS.map(F => { const f = E.facteurs.get(F.id) || { etat: 'attente' }; const ok = f.etat === 'ok';
      const info = !ok ? `<span class="tor-ctx-nd">${f.etat === 'attente' ? 'chargement…' : 'indisponible : ' + esc(f.raison)}</span>` : esc(ligneSpeciale(F.id, f));
      return `<tr data-facteur="${F.id}"><th scope="row">${esc(F.nom)}</th><td class="tor-ctx-val">${ok && F.id !== 'calendrier' && F.id !== 'geo' ? esc(fm(F.id, f)) : '—'}</td><td>${ok && F.id !== 'calendrier' && F.id !== 'geo' ? esc(fv(F.id, f)) : ''}</td><td class="tor-ctx-sens tor-ctx-${ok && f.sens ? f.sens.code : 'inconnu'}">${ok && f.sens ? esc(f.sens.texte) : '—'}</td><td class="tor-ctx-det">${info}<details><summary>Sens habituel · comment lire ça</summary><p>${esc(F.sens)}</p><p><small>Source : ${esc(F.source)}</small></p></details></td></tr>`; }).join('');
    el.innerHTML = `<table class="tor-ctx"><thead><tr><th>Facteur</th><th>Valeur</th><th>Variation</th><th>Effet habituel sur l'or</th><th>Détail</th></tr></thead><tbody>${lignes}</tbody></table><p class="tor-ctx-pied">Corrélations habituelles, pas des causes ni des promesses. ${E.maj ? 'Mis à jour à ' + new Date(E.maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '.' : ''}</p>`;
  }
  /* ── « Pourquoi l'or bouge ? » : faits mesurés puis interprétation ── */
  function faits() {
    const S = moteur.S, B = (S.periode === 'M15' ? S.k : S.kM15 || []).filter(b => !b.ref), f = {}; if (B.length < 20) return f; const der = B[B.length - 1], av = h => { const c = der.t - h * 3600e3; let r = null; for (const b of B) { if (b.t <= c) r = b; else break; } return r; };
    f.prix = der.c; const a3 = av(3), a1 = av(1), a24 = av(24); f.var3h = a3 ? K.pct(der.c, a3.c) : null; f.var1h = a1 ? K.pct(der.c, a1.c) : null; f.var24h = a24 ? K.pct(der.c, a24.c) : null;
    const NV = C.niveauxPeriodes(B), V = C.vwapSeance(B), v = V[V.length - 1], H = S.serieH1 && S.serieH1.length > 15 ? S.serieH1 : null; let atr = 0; for (let i = Math.max(1, B.length - 14); i < B.length; i++) atr += Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c)); atr = atr / 14 * 2;
    const cand = []; if (NV) for (const [p, n] of [[NV.pdh, 'le plus haut de la veille'], [NV.pdl, 'le plus bas de la veille'], [NV.pwh, 'le plus haut de la semaine précédente'], [NV.pwl, 'le plus bas de la semaine précédente'], [NV.ouvJour, 'l\'ouverture du jour']]) if (p != null) cand.push([p, n]); if (v) cand.push([v.vwap, 'le VWAP de séance']); for (const r of C.ronds(der.c, 50, 2)) cand.push([r, 'le niveau rond de ' + r + ' dollars']);
    cand.sort((x, y) => Math.abs(x[0] - der.c) - Math.abs(y[0] - der.c)); const n0 = cand[0]; if (n0) { const d = der.c - n0[0]; f.niveau = Math.abs(d) <= Math.max(atr, 0.5) ? `Le prix est à ${K.nombre(Math.abs(d))} dollars ${d >= 0 ? 'au-dessus' : 'au-dessous'} de ${n0[1]}, soit ${K.nombre(n0[0])}` : `Le repère le plus proche est ${n0[1]}, à ${K.nombre(n0[0])}`; }
    f.session = ({ asie: 'asiatique', londres: 'de Londres', ny: 'de New York' })[C.seanceDe(maintenant())] || null;
    const ev = E.evenements.find(e => Math.abs(e.dansMin) <= 120); if (ev) f.evenement = ev.dansMin > 0 ? `Une annonce américaine importante est prévue dans ${ev.dansMin} minutes : ${ev.titre}` : `Une annonce américaine importante est sortie il y a ${-ev.dansMin} minutes : ${ev.titre}${ev.reel ? ', résultat ' + ev.reel : ''}${ev.prevu ? ', prévu ' + ev.prevu : ''}`;
    const g = id => { const x = E.facteurs.get(id); return x && x.etat === 'ok' ? x : null; }; f.dxy = g('dxy') ? g('dxy').var1h ?? g('dxy').variation : null; f.us10y = g('us10y') ? g('us10y').var1h ?? g('us10y').variation : null; f.reels = g('reels') ? g('reels').variation : null; f.geo = E.geo;
    return f;
  }
  const pourquoiTexte = () => { const f = faits(); if (f.prix == null) return 'Je n\'ai pas encore les bougies de l\'or : réessaie dans un instant.'; return K.pourquoi(f).texte; };
  async function pourquoi() { if (!E.maj) await charger(); const t = pourquoiTexte(); const z = racine && racine.querySelector('[data-pourquoi]'); if (z) { z.hidden = false; z.textContent = t; } parler(t); return t; }
  /* ── commandes (texte ou voix) ── */
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9 ?]/g, ' ').replace(/\s+/g, ' ').trim();
  async function commande(texte) {
    const n = norm(texte);
    if (/pourquoi l or (bouge|monte|baisse|chute|recule|grimpe|s envole|decroche|stagne)|qu est ce qui fait (bouger|monter|baisser) l or|explique (moi )?(le mouvement|la hausse|la baisse) de l or/.test(n)) return pourquoi();
    if (/\b(explique|expliquer|c est quoi|qu est ce que|a quoi sert|comment lire|comment on lit|comment lis)\b/.test(n)) { const fi = K.ficheDe(n); if (fi) { parler(fi.texte); const z = racine && racine.querySelector('[data-fiche]'); if (z) { z.hidden = false; z.innerHTML = `<b>${esc(fi.titre)}</b> — ${esc(fi.texte)}`; } return fi.texte; } }
    return null;
  }
  const fiche = id => { const fi = K.FICHES[id]; if (!fi) return null; parler(fi.texte); const z = racine && racine.querySelector('[data-fiche]'); if (z) { z.hidden = false; z.innerHTML = `<b>${esc(fi.titre)}</b> — ${esc(fi.texte)}`; } return fi.texte; };
  rendreProgressif = rendre; rendre();
  let minuterie = null; if (auto) { setTimeout(() => charger().catch(() => {}), 1500); minuterie = setInterval(() => { if (!document.hidden) charger().catch(() => {}); }, 300000); }
  return { charger, rendre, pourquoi, pourquoiTexte, faits, commande, fiche, etat: () => ({ facteurs: [...E.facteurs.values()], evenements: E.evenements, maj: E.maj }), detruire() { clearInterval(minuterie); } };
}
