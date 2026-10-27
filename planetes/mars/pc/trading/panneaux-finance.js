import { obtenirFinance } from '../finance/donnees.js';
import { CONTRATS_COT, ORDRE_COT, phraseCot } from '../finance/cot-calcul.js';
import { compteARebours, filtrerCalendrier, heureParis, impactFr } from '../finance/calendrier-calcul.js';
import { phraseTaux } from '../finance/taux-calcul.js';
import { GROUPES, MENTION_RECHERCHE_PAYANTE, nomBanque } from '../finance/flux-calcul.js';
import { ACTIFS, NOMS_ACTIFS, repartition } from '../finance/impact.js';
import { AVERTISSEMENT_COMPOSITION, SECTEURS, couleurVariation, phraseHeatmap } from '../finance/heatmap-calcul.js';
import { phraseSec } from '../finance/sec-calcul.js';

/* ═════════════ PANNEAUX DU HUB FINANCE DANS L'ESPACE DE TRAVAIL DE MARS (M2b) ═════════════
   Calendrier · COT · Actus finance · Banques centrales · Taux · Publications · Nasdaq 100 (carte de chaleur + dépôts SEC). Chaque panneau affiche l'étiquette de ses données (RÉEL / DIFFÉRÉ / PÉRIMÉ / INDISPONIBLE),
   la source, l'heure de réception et, en cas de panne, la raison. Jamais de chiffre inventé. Aucune IA : classement par règles. Les analyses payantes de banques d'investissement ne sont pas simulées. */
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sg = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + nb(v, d));
const CLS_ET = { 'RÉEL': 'ok', 'DIFFÉRÉ': 'info', 'PÉRIMÉ': 'att', 'INDISPONIBLE': 'ko' };
export const badge = e => '<em class="fi-et ' + (CLS_ET[e] || 'info') + '">' + esc(e) + '</em>';
const quand = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '') : '—');
const bandeauEtat = r => '<div class="fi-etat">' + badge(r.etiquette) + ' <span>' + (r.etat === 'ok' ? esc(r.source || '') + ' · reçu ' + esc(quand(r.recuLe)) : 'INDISPONIBLE : ' + esc(r.raison || 'pas de réponse')) + (r.perime && r.raison ? ' · ' + esc(r.raison) : '') + '</span></div>';
const pied = html => '<div class="fi-pied">' + html + '</div>';
const sources = liste => (liste && liste.length ? '<div class="fi-sources">Sources : ' + liste.map(s => '<span class="' + (s.etat === 'ok' ? 'ok' : 'ko') + '" title="' + esc(s.raison || '') + '">' + esc(s.nom) + (s.etat === 'ok' ? '' : ' · ' + esc(s.raison || 'indisponible')) + '</span>').join(' · ') + '</div>' : '');
const pastille = i => '<span class="fi-imp ' + i + '" title="Impact ' + i + '">' + (i === 'fort' ? '●●●' : i === 'moyen' ? '●●○' : '●○○') + '</span>';

/* Réglages posés de l'extérieur (voix) : « le COT de l'or » choisit le contrat, « que dit la BCE » la banque… Chaque panneau s'enregistre ici à sa création. */
const instances = {};
export function reglerFinance(nom, reglage) { const i = instances[nom]; if (!i) { instances['_attente_' + nom] = reglage; return false; } i.regler(reglage || {}); i.panneau.maj(); return true; }
const attente = nom => { const r = instances['_attente_' + nom]; delete instances['_attente_' + nom]; return r || null; };

/* Squelette commun : { racine, maj(), detruire() }. `charger()` rend le HTML ; rafraîchissement automatique toutes les `cadenceMs` tant que le panneau est affiché. */
function panneau(classe, { charger, apres = null, cadenceMs = 120000 }) {
  const racine = document.createElement('div'); racine.className = 'fi-panneau ' + classe; racine.innerHTML = '<p class="fi-vide">Chargement…</p>';
  let enCours = false, detruit = false, timer = null, dernierHtml = '';
  async function maj() {
    if (enCours || detruit) return; enCours = true;
    try { const html = await charger(); if (detruit) return; if (html !== dernierHtml) { dernierHtml = html; racine.innerHTML = html; } if (apres) apres(racine); }
    catch (e) { racine.innerHTML = '<p class="fi-vide ko">INDISPONIBLE : ' + esc(e && e.message || e) + '</p>'; } finally { enCours = false; }
    if (!timer && !detruit) timer = setInterval(() => { if (racine.isConnected && !document.hidden) maj(); }, cadenceMs);
  }
  return { racine, maj, detruire() { detruit = true; if (timer) clearInterval(timer); } };
}

/* ───────── Calendrier ───────── */
export function creerPanneauCalendrier() {
  let impactMin = 'medium', pays = null, jours = 7;
  const p = panneau('fi-cal', {
    cadenceMs: 60000,
    async charger() {
      const F = obtenirFinance(), r = await F.calendrier(), maintenant = Date.now();
      let h = '<div class="fi-barre">' + [['high', 'Fort'], ['medium', 'Moyen +'], ['low', 'Tout']].map(([k, l]) => '<button type="button" class="fi-chip' + (impactMin === k ? ' actif' : '') + '" data-impact="' + k + '">' + l + '</button>').join('')
        + ' <span class="fi-sep">│</span> ' + [[null, 'Tous pays'], ['USD', 'USD'], ['EUR', 'EUR'], ['GBP', 'GBP'], ['JPY', 'JPY']].map(([k, l]) => '<button type="button" class="fi-chip' + (pays === k ? ' actif' : '') + '" data-pays="' + (k || '') + '">' + l + '</button>').join('')
        + ' <span class="fi-sep">│</span> ' + [[2, '48 h'], [7, 'Semaine'], [30, 'Mois']].map(([k, l]) => '<button type="button" class="fi-chip' + (jours === k ? ' actif' : '') + '" data-jours="' + k + '">' + l + '</button>').join('') + '</div>';
      h += bandeauEtat(r);
      if (r.etat !== 'ok') return h + sources(r.sources) + pied('Les données du calendrier viennent du Worker de Raylé (route /calendar déjà en ligne) et de sources officielles (Fed, BLS). Rien n’est inventé.');
      const evts = filtrerCalendrier(r.evenements, { impactMin, pays, de: maintenant - 6 * 3600e3, a: maintenant + jours * 86400e3 });
      h += '<table class="fi-table"><thead><tr><th>Heure (Paris)</th><th>Dans</th><th>Pays</th><th>Impact</th><th>Événement</th><th>Prévu</th><th>Précédent</th><th>Réel</th></tr></thead><tbody>';
      let jourPrec = '';
      for (const e of evts) {
        const j = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(e.t));
        if (j !== jourPrec) { jourPrec = j; h += '<tr class="fi-jour"><td colspan="8">' + esc(j) + '</td></tr>'; }
        const reel = e.reel != null ? '<b class="hausse" title="' + esc(e.reelSource || '') + '">' + esc(e.reel) + '</b>' : e.t <= maintenant ? '<span class="nd" title="Aucune source gratuite pour la valeur publiée">indispo.</span>' : '—';
        h += '<tr class="' + (e.t <= maintenant ? 'passe' : '') + '"><td>' + esc(heureParis(e.t)) + '</td><td>' + esc(compteARebours(e.t, maintenant)) + '</td><td>' + esc(e.pays) + '</td><td>' + pastille(impactFr(e.impact)) + '</td><td>' + esc(e.titre) + (e.moment ? ' <small>(' + esc(e.moment) + ')</small>' : '') + '<small class="fi-src"> · ' + esc(e.source) + '</small></td><td>' + esc(e.prevu || '—') + '</td><td>' + esc(e.precedent || '—') + '</td><td>' + reel + '</td></tr>';
      }
      h += '</tbody></table>' + (evts.length ? '' : '<p class="fi-vide">Aucun événement pour ces filtres.</p>');
      return h + sources(r.sources) + pied('Prévu / précédent : calendrier public (tiers). Réel : seulement pour l’inflation, l’emploi et le chômage américains (BLS officiel) ; ailleurs « indispo. ». Résultats d’entreprises : Alpha Vantage (Nasdaq 100). Heures converties en heure de Paris.');
    },
    apres(r) { r.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.impact) impactMin = b.dataset.impact; if (b.dataset.pays !== undefined) pays = b.dataset.pays || null; if (b.dataset.jours) jours = +b.dataset.jours; p.maj(true); }; }
  });
  instances.calendrier = { panneau: p, regler: r => { if (r.jours) jours = r.jours; } };
  return p;
}

/* ───────── COT ───────── */
export function creerPanneauCot(ctx = {}) {
  let contrat = 'NDX', categorie = null;
  const p = panneau('fi-cot', {
    cadenceMs: 600000,
    async charger() {
      const r = await obtenirFinance().cot(contrat);
      let h = '<div class="fi-barre">' + ORDRE_COT.map(id => '<button type="button" class="fi-chip' + (contrat === id ? ' actif' : '') + '" data-contrat="' + id + '">' + esc(id) + '</button>').join('') + '</div>' + bandeauEtat(r);
      if (r.etat !== 'ok') return h + pied('Rapports COT de la CFTC (données ouvertes, gratuites). Positions du mardi, publiées le vendredi.');
      const a = r.analyse, c = CONTRATS_COT[contrat];
      h += '<div class="fi-titre">' + esc(c.nom) + ' · positions du mardi ' + esc(a.date) + ' · publié le ' + esc(a.publication) + ' · intérêt ouvert ' + nb(a.oi) + ' (' + sg(a.variationOI) + ')</div>';
      h += '<table class="fi-table"><thead><tr><th>Catégorie</th><th>Longs</th><th>Courts</th><th>Net</th><th>Var. hebdo</th><th>% int. ouvert</th><th>Percentile (3 ans)</th></tr></thead><tbody>';
      for (const k of a.categories) h += '<tr class="' + (k.spec ? 'spec ' : '') + (categorie === k.id ? 'sel' : '') + '" data-cat="' + k.id + '"><td>' + esc(k.nom) + (k.spec ? ' <small>(spéculateurs)</small>' : '') + '</td><td>' + nb(k.long) + '</td><td>' + nb(k.court) + '</td><td class="' + (k.net > 0 ? 'hausse' : k.net < 0 ? 'baisse' : '') + '"><b>' + sg(k.net) + '</b></td><td class="' + (k.variation > 0 ? 'hausse' : k.variation < 0 ? 'baisse' : '') + '">' + sg(k.variation) + '</td><td>' + nb(k.netPctOI, 1) + ' %</td><td><span class="fi-barrepct"><i style="left:' + (k.percentile == null ? 0 : k.percentile) + '%"></i></span> ' + (k.percentile == null ? '—' : k.percentile + 'e') + (k.extreme ? ' <em class="fi-ext ' + k.extreme + '">' + (k.extreme === 'haut' ? 'EXTRÊME HAUT' : 'EXTRÊME BAS') + '</em>' : '') + '</td></tr>';
      h += '</tbody></table><canvas class="fi-canvas" width="900" height="200" data-serie></canvas>';
      h += '<p class="fi-lecture">' + esc(phraseCot(contrat, a, categorie)) + '</p>';
      return h + pied('Un percentile extrême dit que la position est extrême <b>par rapport à son histoire</b> : ce n’est pas un signal d’achat ou de vente. Source : CFTC (Socrata), rapport ' + (a.rapport === 'tff' ? 'TFF' : 'Disaggregated') + '.');
    },
    apres(r) {
      r.onclick = e => { const b = e.target.closest('button[data-contrat]'); if (b) { contrat = b.dataset.contrat; categorie = null; p.maj(); return; } const tr = e.target.closest('tr[data-cat]'); if (tr) { categorie = tr.dataset.cat; p.maj(); } };
      const cv = r.querySelector('canvas[data-serie]'); if (!cv) return;
      obtenirFinance().cot(contrat).then(res => {
        if (res.etat !== 'ok') return; const a = res.analyse, k = a.categories.find(x => x.id === categorie) || a.categories.find(x => x.spec) || a.categories[0], g = cv.getContext('2d'), W = cv.width, H = cv.height;
        g.clearRect(0, 0, W, H); const ser = k.serie, mn = Math.min(...ser), mx = Math.max(...ser), py = v => H - 24 - (v - mn) / (mx - mn || 1) * (H - 40), px = i => 8 + i / (ser.length - 1 || 1) * (W - 16);
        g.strokeStyle = 'rgba(77,227,255,.2)'; g.beginPath(); const y0 = py(0); if (mn < 0 && mx > 0) { g.moveTo(8, y0); g.lineTo(W - 8, y0); g.stroke(); }
        const tri = ser.slice().sort((u, v) => u - v), p10 = tri[Math.floor(tri.length * 0.1)], p90 = tri[Math.min(tri.length - 1, Math.floor(tri.length * 0.9))];
        g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,77,94,.55)'; g.beginPath(); g.moveTo(8, py(p10)); g.lineTo(W - 8, py(p10)); g.stroke(); g.strokeStyle = 'rgba(39,217,138,.55)'; g.beginPath(); g.moveTo(8, py(p90)); g.lineTo(W - 8, py(p90)); g.stroke(); g.setLineDash([]);
        g.strokeStyle = '#ffb000'; g.lineWidth = 2; g.beginPath(); ser.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v)))); g.stroke();
        g.fillStyle = '#9bc4d6'; g.font = '13px monospace'; g.fillText(k.nom + ' · position nette · ' + a.dates[0] + ' → ' + a.date + ' · traits : 10e et 90e percentiles', 10, 14);
      });
    }
  });
  instances.cot = { panneau: p, regler: r => { if (r.contrat && CONTRATS_COT[r.contrat]) { contrat = r.contrat; categorie = null; } } };
  const a0 = attente('cot'); if (a0) instances.cot.regler(a0);
  return p;
}

/* ───────── Fil d'actualités (financières, banques centrales, institutions) ───────── */
function listeFlux(items, { max = 40 } = {}) {
  return '<ul class="fi-liste">' + items.slice(0, max).map(i => {
    const c = i.classe; return '<li class="' + (c ? c.impact : '') + '">' + (c ? pastille(c.impact) : '') + ' <a href="' + esc(i.url) + '" target="_blank" rel="noopener noreferrer">' + esc(i.titre) + '</a>'
      + '<small class="fi-meta"> · ' + esc(i.source) + (i.officiel ? ' · <em class="fi-off">SOURCE OFFICIELLE</em>' : '') + ' · ' + esc(quand(i.t)) + (c && c.actifs.length ? ' · ' + c.actifs.map(a => '<span class="fi-actif">' + a + '</span>').join('') : '') + '</small>'
      + (i.resume ? '<small class="fi-resume">' + esc(i.resume) + '</small>' : '') + (c && c.raisons.length ? '<small class="fi-raisons" title="Pourquoi ce classement (règles, pas d’IA)">classement : ' + esc(c.raisons.join(' ; ')) + '</small>' : '') + '</li>';
  }).join('') + '</ul>';
}
export function creerPanneauActus() {
  let actif = null, bouge = false;
  const p = panneau('fi-actus', {
    cadenceMs: 180000,
    async charger() {
      const r = await obtenirFinance().flux('actus', { actif });
      let h = '<div class="fi-barre">' + [[null, 'Tout']].concat(Object.entries(ACTIFS)).map(([k, l]) => '<button type="button" class="fi-chip' + (actif === k ? ' actif' : '') + '" data-actif="' + (k || '') + '">' + esc(l) + '</button>').join('')
        + ' <span class="fi-sep">│</span> <button type="button" class="fi-chip' + (bouge ? ' actif' : '') + '" data-bouge="1" title="Impact fort sur un événement macro, de banque centrale, de géopolitique, de résultats ou de crypto">Ce qui fait bouger les prix</button></div>' + bandeauEtat(r);
      if (r.etat !== 'ok') return h + pied('Flux RSS publics (titres, liens). Certains passent par le Worker de Raylé.');
      let items = r.items.filter(i => (!actif || i.classe.actifs.includes(actif)) && (!bouge || i.classe.bougePrix));
      const rep = repartition(items);
      h += '<div class="fi-compte">' + items.length + ' titres · impact fort ' + rep.fort + ' · moyen ' + rep.moyen + ' · faible ' + rep.faible + '</div>' + (items.length ? listeFlux(items) : '<p class="fi-vide">Aucun titre pour ce filtre.</p>');
      return h + sources(r.sources) + pied('Classement par IMPACT par règles de mots-clés et d’événements (pas d’IA) : il décrit ce dont parle le titre, pas la surprise réelle des chiffres. Titres et liens seulement : le contenu appartient aux éditeurs ; aucun mur payant n’est contourné.');
    },
    apres(r) { r.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.actif !== undefined) actif = b.dataset.actif || null; if (b.dataset.bouge) bouge = !bouge; p.maj(); }; }
  });
  instances.actus = { panneau: p, regler: r => { if ('actif' in r) actif = r.actif && ACTIFS[r.actif] ? r.actif : null; if ('bouge' in r) bouge = !!r.bouge; } };
  const a1 = attente('actus'); if (a1) instances.actus.regler(a1);
  return p;
}
export function creerPanneauBanques() {
  let banque = 'toutes';
  const p = panneau('fi-banques', {
    cadenceMs: 300000,
    async charger() {
      const F = obtenirFinance(), [r, cal] = await Promise.all([F.flux('banques'), F.calendrier()]);
      let h = '<div class="fi-barre">' + ['toutes', 'Fed', 'BCE', 'BoE', 'BoJ', 'BNS', 'BoC', 'RBA'].map(b => '<button type="button" class="fi-chip' + (banque === b ? ' actif' : '') + '" data-banque="' + b + '">' + esc(b === 'toutes' ? 'Toutes' : b) + '</button>').join('') + '</div>' + bandeauEtat(r);
      if (cal.etat === 'ok') {
        const prochains = cal.evenements.filter(e => e.type === 'banque_centrale' && e.t > Date.now() && e.t < Date.now() + 45 * 86400e3 && (banque === 'toutes' || banque === 'Fed')).slice(0, 5);
        if (prochains.length) h += '<div class="fi-prochains"><b>Prochains rendez-vous</b> : ' + prochains.map(e => esc(e.titre) + ' · ' + esc(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(e.t))) + ' (' + esc(compteARebours(e.t)) + ')').join(' ; ') + '</div>';
      }
      if (r.etat !== 'ok') return h + pied('Communiqués, minutes et discours : flux RSS OFFICIELS des banques centrales (via le Worker de Raylé).');
      const items = r.items.filter(i => banque === 'toutes' || i.banque === banque);
      h += '<div class="fi-compte">' + items.length + ' publications officielles' + (banque !== 'toutes' ? ' de ' + esc(nomBanque[banque]) : '') + '</div>' + (items.length ? listeFlux(items, { max: 50 }) : '<p class="fi-vide">Aucune publication récente.</p>');
      return h + sources(r.sources) + pied('Sources officielles des banques centrales. Titres dans la langue d’origine. Rendez-vous : calendrier officiel de la Fed ; pour les autres banques, calendrier public de la semaine (onglet Calendrier). Réunions de la BCE, de la BoE… : pas de source structurée gratuite lue : INDISPONIBLE hors calendrier public.');
    },
    apres(r) { r.onclick = e => { const b = e.target.closest('button[data-banque]'); if (b) { banque = b.dataset.banque; p.maj(); } }; }
  });
  instances.banques = { panneau: p, regler: r => { if (r.banque) banque = r.banque; } };
  const a2 = attente('banques'); if (a2) instances.banques.regler(a2);
  return p;
}
export function creerPanneauPublications() {
  const p = panneau('fi-pubs', {
    cadenceMs: 600000,
    async charger() {
      const r = await obtenirFinance().flux('institutions');
      let h = bandeauEtat(r) + '<div class="fi-avert">' + esc(MENTION_RECHERCHE_PAYANTE) + '</div>';
      if (r.etat !== 'ok') return h + pied('Publications publiques de la BCE, de la BRI et d’ING Think.');
      h += '<div class="fi-compte">' + r.items.length + ' <em class="fi-off">PUBLICATIONS PUBLIQUES</em></div>' + listeFlux(r.items, { max: 50 });
      return h + sources(r.sources) + pied('Publications publiques seulement (BCE, BRI, ING Think). FMI et OCDE refusent les appels automatiques ; BNP Paribas, Natixis, Crédit Agricole n’offrent pas de flux exploitable : non utilisés.');
    }
  });
  return p;
}

/* ───────── Taux, inflation, emploi ───────── */
export function creerPanneauTaux() {
  const p = panneau('fi-taux', {
    cadenceMs: 600000,
    async charger() {
      const F = obtenirFinance(), [r, b] = await Promise.all([F.courbe(), F.bls()]);
      let h = bandeauEtat(r);
      if (r.etat === 'ok') {
        const c = r.courbe;
        h += '<div class="fi-titre">Courbe des taux américains au ' + esc(c.date) + '</div><table class="fi-table"><thead><tr><th>Échéance</th><th>Taux</th><th>Jour (pb)</th><th>Semaine (pb)</th><th>Mois (pb)</th></tr></thead><tbody>'
          + c.lignes.map(l => '<tr><td>' + esc(l.echeance) + '</td><td><b>' + nb(l.taux, 2) + ' %</b></td>' + [l.jour, l.semaine, l.mois].map(x => '<td class="' + (x > 0 ? 'baisse' : x < 0 ? 'hausse' : '') + '">' + sg(x) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
        h += '<div class="fi-compte">Écarts : 2s10s ' + sg(c.ecarts['2s10s']) + ' pb' + (c.inversion2s10s ? ' <em class="fi-ext bas">INVERSÉE</em>' : '') + ' · 10s30s ' + sg(c.ecarts['10s30s']) + ' pb · 3m10a ' + sg(c.ecarts['3m10a']) + ' pb' + (c.inversion3m10a ? ' <em class="fi-ext bas">INVERSÉE</em>' : '') + '</div><canvas class="fi-canvas" width="900" height="170" data-courbe></canvas>';
        h += '<p class="fi-lecture">' + esc(phraseTaux(c)) + '</p>';
      }
      h += '<div class="fi-titre">Inflation, chômage, emplois (BLS officiel) ' + badge(b.etiquette) + '</div>';
      if (b.etat === 'ok') {
        const d = b.donnees, pts = d.cpi_sa && d.cpi_sa[0], mois = pts ? new Date(Date.UTC(pts.annee, pts.mois - 1, 15)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
        const cpiA = d.cpi_nsa && d.cpi_nsa.length >= 13 ? (d.cpi_nsa[0].valeur / d.cpi_nsa.find(x => x.annee === d.cpi_nsa[0].annee - 1 && x.mois === d.cpi_nsa[0].mois).valeur - 1) * 100 : null;
        const cpiM = d.cpi_sa && d.cpi_sa.length >= 2 ? (d.cpi_sa[0].valeur / d.cpi_sa[1].valeur - 1) * 100 : null, coeurM = d.cpi_coeur_sa && d.cpi_coeur_sa.length >= 2 ? (d.cpi_coeur_sa[0].valeur / d.cpi_coeur_sa[1].valeur - 1) * 100 : null;
        const emp = d.emplois && d.emplois.length >= 2 ? d.emplois[0].valeur - d.emplois[1].valeur : null;
        h += '<div class="fi-tuiles"><div><span>Inflation (CPI) sur un an</span><b>' + nb(cpiA, 1) + ' %</b></div><div><span>CPI sur un mois</span><b>' + nb(cpiM, 1) + ' %</b></div><div><span>CPI sous-jacent (mois)</span><b>' + nb(coeurM, 1) + ' %</b></div><div><span>Taux de chômage</span><b>' + nb(d.chomage && d.chomage[0].valeur, 1) + ' %</b></div><div><span>Emplois créés (milliers)</span><b>' + sg(emp) + '</b></div></div>'
          + pied('Mois de référence : ' + esc(mois || '—') + ' · BLS (API officielle). Dollar et VIX : voir « Contexte de marché ».');
      } else h += '<p class="fi-vide ko">INDISPONIBLE : ' + esc(b.raison) + '</p>';
      return h + pied('Courbe : Trésor américain, fin de journée (DIFFÉRÉ). Pb = points de base. Un écart 2s10s négatif signale une courbe inversée.');
    },
    apres(r) {
      const cv = r.querySelector('canvas[data-courbe]'); if (!cv) return;
      obtenirFinance().courbe().then(res => {
        if (res.etat !== 'ok') return; const g = cv.getContext('2d'), W = cv.width, H = cv.height, s10 = res.courbe.serie10, s2 = res.courbe.serie2; g.clearRect(0, 0, W, H);
        const tout = s10.concat(s2).map(x => x[1]), mn = Math.min(...tout), mx = Math.max(...tout), py = v => H - 20 - (v - mn) / (mx - mn || 1) * (H - 34), trace = (s, c) => { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); s.forEach((x, i) => { const X = 8 + i / (s.length - 1 || 1) * (W - 16); i ? g.lineTo(X, py(x[1])) : g.moveTo(X, py(x[1])); }); g.stroke(); };
        trace(s2, '#4de3ff'); trace(s10, '#ffb000'); g.fillStyle = '#9bc4d6'; g.font = '13px monospace'; g.fillText('10 ans (orange) · 2 ans (cyan) · ' + s10[0][0] + ' → ' + s10[s10.length - 1][0], 10, 13);
      });
    }
  });
  return p;
}

/* ───────── Nasdaq 100 : carte de chaleur et dépôts SEC ───────── */
export function creerPanneauNasdaq() {
  let selection = null, periode = 'jour';
  const p = panneau('fi-ndx', {
    cadenceMs: 180000,
    async charger() {
      const F = obtenirFinance(), r = await F.heatmap();
      let h = bandeauEtat(r) + '<div class="fi-avert">' + esc(AVERTISSEMENT_COMPOSITION) + '</div>';
      if (r.etat !== 'ok') return h;
      const res = r.resume, pct = l => (periode === 'jour' ? l.pct : l.pct5);
      h += '<div class="fi-barre"><button type="button" class="fi-chip' + (periode === 'jour' ? ' actif' : '') + '" data-periode="jour">Jour</button><button type="button" class="fi-chip' + (periode === 'semaine' ? ' actif' : '') + '" data-periode="semaine">5 séances</button></div>';
      h += '<div class="fi-compte">' + res.hausses + ' ▲ · ' + res.baisses + ' ▼ · moyenne simple ' + sg(res.moyenne, 2) + ' % · ' + res.manquants + ' sans cotation</div><div class="fi-carte">';
      const parSect = {}; for (const l of r.lignes) (parSect[l.secteur] = parSect[l.secteur] || []).push(l);
      for (const [sid, lignes] of Object.entries(parSect).sort((a, b) => b[1].length - a[1].length)) {
        h += '<section class="fi-sect"><h5>' + esc(SECTEURS[sid] || sid) + '</h5><div class="fi-tuiles-sect">' + lignes.sort((a, b) => (pct(b) ?? -99) - (pct(a) ?? -99)).map(l => '<button type="button" class="fi-tuile' + (selection === l.s ? ' sel' : '') + '" data-sym="' + l.s + '" style="background:' + couleurVariation(pct(l)) + '" title="' + esc(l.nom) + '"><b>' + esc(l.s) + '</b><span>' + (pct(l) == null ? '—' : sg(pct(l), 1) + '%') + '</span></button>').join('') + '</div></section>';
      }
      h += '</div><p class="fi-lecture">' + esc(phraseHeatmap(res)) + '</p>';
      if (selection) h += '<div class="fi-sec" data-sec="' + selection + '"><p class="fi-vide">Dépôts de la SEC pour ' + esc(selection) + '…</p></div>';
      return h + pied('Cotations différées (Yahoo Finance, non officiel) · taille des tuiles égale (poids officiels indisponibles gratuitement) · clic sur une valeur : dépôts officiels de la SEC (résultats, événements importants, initiés).');
    },
    apres(r) {
      r.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.periode) { periode = b.dataset.periode; p.maj(); } else if (b.dataset.sym) { selection = selection === b.dataset.sym ? null : b.dataset.sym; p.maj(); } };
      const zone = r.querySelector('.fi-sec'); if (!zone) return;
      obtenirFinance().sec(zone.dataset.sec).then(res => {
        if (res.etat !== 'ok') { zone.innerHTML = '<p class="fi-vide ko">INDISPONIBLE : ' + esc(res.raison) + '</p>'; return; }
        zone.innerHTML = badge(res.etiquette) + ' <span>' + esc(res.source) + '</span><p class="fi-lecture">' + esc(phraseSec(res.resume)) + '</p><ul class="fi-liste">' + res.depots.slice(0, 12).map(d => '<li class="' + d.impact + '">' + pastille(d.impact) + ' <b>' + esc(d.form) + '</b> · ' + esc(d.libelle) + (d.items.length ? ' (' + esc(d.items.filter(x => x.code !== '9.01').map(x => x.libelle).join(', ')) + ')' : '') + ' <small class="fi-meta">· ' + esc(d.date) + (d.url ? ' · <a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">document</a>' : '') + '</small></li>').join('') + '</ul>';
      });
    }
  });
  instances.heatmap = { panneau: p, regler: r => { if (r.symbole) selection = r.symbole; } };
  const a3 = attente('heatmap'); if (a3) instances.heatmap.regler(a3);
  return p;
}
