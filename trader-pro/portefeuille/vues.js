/* Vues de la fenêtre Portefeuille : chaque fonction écrit dans `zone` à partir de l'état S (données, calculs) et branche ses graphiques. Aucune donnée n'est écrite hors de l'appareil par ces fonctions. */
import { esc, nf, pct, cls, lireLS, ecrireLS, age } from '../commun/ui.js';
import { monterGraphique, COULEURS } from '../commun/graph.js';
import { resume, grouper, parDuree, parTaille, courbes, pnlParJour, cumulerPeriode, cleSemaine, cleMois, filtrer, trier, formatDuree, nomJour, exposition } from './calcul.js';
import { evolutionNote, texteRapport, POIDS, SEUILS } from './coach.js';

const eur = (v, dec = 2) => (v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/[  ]/g, ' ') + ' €');
const eurSigne = (v, dec = 2) => (v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + eur(v, dec));
const fr = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pc0 = v => (v == null ? '—' : Math.round(v * 100) + ' %');
const dateFr = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const jourFr = j => j.slice(8, 10) + '/' + j.slice(5, 7) + '/' + j.slice(0, 4);
const carte = (titre, valeur, sous = '', classe = '') => `<div><small>${esc(titre)}</small><b class="${classe}">${valeur}</b><span>${sous}</span></div>`;

/* barres horizontales : lignes { cle, pnl, n, winRate } ; la barre est proportionnelle au |résultat| */
export function barres(lignes, { titre = '', ordre = null, min = 1, note = '' } = {}) {
  let L = lignes.filter(x => x.n >= min); if (ordre) L = L.sort(ordre); const mx = Math.max(1, ...L.map(x => Math.abs(x.pnl)));
  return `<div class="tp-barres">${titre ? `<h4>${esc(titre)}</h4>` : ''}${L.length ? L.map(x => `<div class="tp-barre" title="${esc(String(x.cle))} : ${x.n} positions, ${pc0(x.winRate)} gagnantes"><span class="tp-b-n">${esc(String(x.cle))}</span><span class="tp-b-v"><i class="${x.pnl >= 0 ? 'tp-b-h' : 'tp-b-b'}" style="width:${(Math.abs(x.pnl) / mx * 100).toFixed(1)}%"></i></span><span class="tp-b-t ${cls(x.pnl)}">${eurSigne(x.pnl, 0)} <small>${x.n}</small></span></div>`).join('') : '<p class="tp-doux">Pas assez de positions.</p>'}${note ? `<p class="tp-doux">${esc(note)}</p>` : ''}</div>`;
}

/* ───── vue globale ───── */
export async function vueGlobale(S, zone, graphs) {
  const R = S.R, K = S.K, ouvertes = S.L.ouvertes.positions || [], capital = S.capital;
  if (!R.n) { zone.innerHTML = '<p class="tp-doux">Aucune position. Importez votre historique XTB (bouton « Importer »).</p>'; return; }
  const autres = S.L.tresorerie.filter(x => /interest|intér/i.test(x.type)).reduce((s, x) => s + x.montant, 0), total = R.pnl + autres;
  zone.innerHTML = `<div class="tp-cartes">
      ${carte('Résultat net des positions', eurSigne(R.pnl), 'swaps et commissions inclus', cls(R.pnl))}${carte('Résultat total du compte', eurSigne(total), 'positions + intérêts, hors dépôts et retraits', cls(total))}
      ${carte('Solde reconstitué', eur(K.soldeFinal), S.reglages.soldeInitial > 0 ? 'en partant de ' + eur(+S.reglages.soldeInitial, 0) + ' au 31/12/2025' : 'en partant de 0 € (solde avant l’export inconnu : voir Réglages)')}${carte('Taux de réussite', pc0(R.winRate), R.gagnants + ' gagnantes sur ' + R.n)}
      ${carte('Facteur de profit', R.profitFactor ? fr(R.profitFactor) : '—', 'gains ÷ pertes')}${carte('Espérance par trade', eurSigne(R.esperance), R.esperanceR != null ? fr(R.esperanceR) + ' R en moyenne (n = ' + R.nR + ')' : 'R indisponible')}
      ${carte('Gain moyen', eurSigne(R.gainMoyen), '', 'tp-hausse')}${carte('Perte moyenne', eurSigne(R.perteMoyenne), 'rapport gain/perte ' + fr(R.payoff), 'tp-baisse')}
      ${carte('Séries', R.series.gagnante + ' / ' + R.series.perdante, 'plus longues séries gagnante / perdante')}${carte('Drawdown maximal', eur(K.drawdownPerfMax, 0), 'depuis un plus haut du résultat · ' + fr(K.drawdownPctMax, 1) + ' % de la valeur du compte à ce plus haut (peut dépasser 100 % si des dépôts ont été ajoutés pendant la baisse)', 'tp-baisse')}
      ${carte('Swaps', eurSigne(R.swaps), 'frais de maintien de position', cls(R.swaps))}${carte('Commissions', eurSigne(R.commissions), '')}</div>
    <h4>Capital et résultat cumulé</h4><div class="tp-graph" data-g1></div><p class="tp-doux">Solde reconstitué à partir des opérations du fichier (suppose un solde nul au début de la période exportée) ; le résultat cumulé exclut dépôts, retraits et transferts. Positions ouvertes non comprises.</p>
    <h4>Drawdown</h4><div class="tp-graph" data-g2></div><p class="tp-doux">Baisse du résultat cumulé depuis son plus haut précédent, en euros (les dépôts et retraits ne comptent ni comme gains ni comme pertes).</p>
    <h4>Résultat par jour, semaine et mois</h4><div class="tp-groupe" role="group"><button type="button" data-per="jours" aria-pressed="${S.perio === 'jours'}">Calendrier</button><button type="button" data-per="semaines" aria-pressed="${S.perio === 'semaines'}">Semaines</button><button type="button" data-per="mois" aria-pressed="${S.perio === 'mois'}">Mois</button></div><div data-perio></div>`;
  try {
    const t = x => x.t, G1 = graphs.add(await monterGraphique(zone.querySelector('[data-g1]'), { hauteur: 260, intraday: false, dec: 0 }));
    G1.ligne(K.solde.map(p => ({ t: p.t, v: p.v })), { couleur: COULEURS.accent, titre: 'Solde', format: { type: 'price', precision: 0, minMove: 1 } }); G1.ligne(K.perf.map(p => ({ t: p.t, v: p.v })), { couleur: COULEURS.or, titre: 'Résultat cumulé', format: { type: 'price', precision: 0, minMove: 1 } }); G1.ajuster();
    const G2 = graphs.add(await monterGraphique(zone.querySelector('[data-g2]'), { hauteur: 140, intraday: false, dec: 1 })); G2.histo(K.drawdownPerf.map(p => ({ t: p.t, v: p.v, couleur: COULEURS.baisse })), { format: { type: 'price', precision: 0, minMove: 1 } }); G2.ajuster();
  } catch (e) { zone.querySelector('[data-g1]').innerHTML = '<p class="tp-panne">Graphique indisponible : ' + esc(e.message) + '</p>'; }
  perio(S, zone, graphs);
}
export async function perio(S, zone, graphs) {
  const box = zone.querySelector('[data-perio]'); if (!box) return; zone.querySelectorAll('[data-per]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.per === S.perio)));
  const J = pnlParJour(S.E);
  if (S.perio === 'jours') { box.innerHTML = calendrier(J); return; }
  const L = cumulerPeriode(J, S.perio === 'semaines' ? cleSemaine : cleMois); box.innerHTML = '<div class="tp-graph" data-g3></div>';
  try { const G = graphs.add(await monterGraphique(box.querySelector('[data-g3]'), { hauteur: 200, intraday: false, dec: 0 })); G.histo(L.map(x => ({ d: x.cle.length === 7 ? x.cle + '-01' : x.cle, v: x.pnl })), { format: { type: 'price', precision: 0, minMove: 1 } }); G.ajuster(); } catch (e) { box.innerHTML = '<p class="tp-panne">Graphique indisponible.</p>'; }
}
/* calendrier de P&L : un mois par bloc, les 6 derniers mois, case colorée selon le résultat du jour (touchez pour le détail) */
export function calendrier(J, nbMois = 6) {
  if (!J.length) return '<p class="tp-doux">Aucun jour.</p>'; const m = new Map(J.map(x => [x.jour, x.pnl])), mx = Math.max(1, ...J.map(x => Math.abs(x.pnl))), dernier = J[J.length - 1].jour, [Y, M] = dernier.split('-').map(Number), blocs = [];
  for (let k = 0; k < nbMois; k++) {
    const d = new Date(Date.UTC(Y, M - 1 - k, 1)), y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, nj = new Date(Date.UTC(y, mo, 0)).getUTCDate(), dec = (d.getUTCDay() + 6) % 7; let tot = 0, cases = '<i></i>'.repeat(dec);
    for (let j = 1; j <= nj; j++) { const cle = `${y}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`, p = m.get(cle); if (p != null) tot += p; const a = p == null ? 0 : Math.min(1, Math.abs(p) / mx); cases += `<b class="${p == null ? 'tp-j0' : ''}" style="${p == null ? '' : 'background:' + (p >= 0 ? `rgba(95,184,148,${(0.18 + 0.7 * a).toFixed(2)})` : `rgba(216,106,106,${(0.18 + 0.7 * a).toFixed(2)})`)}" title="${jourFr(cle)} : ${p == null ? 'aucune position' : eurSigne(p)}">${j}</b>`; }
    if ([...m.keys()].some(c => c.startsWith(`${y}-${String(mo).padStart(2, '0')}`))) blocs.push(`<div class="tp-mois"><h5>${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })} <span class="${cls(tot)}">${eurSigne(tot, 0)}</span></h5><div class="tp-cal"><u>L</u><u>M</u><u>M</u><u>J</u><u>V</u><u>S</u><u>D</u>${cases}</div></div>`);
  }
  return `<div class="tp-mois-grille">${blocs.join('')}</div><p class="tp-doux">Vert = jour gagnant, rouge = jour perdant (intensité = montant) ; date de Paris de la fermeture.</p>`;
}

/* ───── transactions ───── */
export function vueTransactions(S, zone) {
  const F = S.filtre, T = filtrer(S.E, { ...F, maintenant: Date.now() }), tri = trier(T, S.tri.cle, S.tri.sens), tickers = [...new Set(S.E.map(t => t.ticker))].sort(), page = tri.slice(0, S.page * 50), res = resume(T);
  const th = (c, n, opt) => `<th class="${opt ? 'c-opt' : ''}"><button type="button" class="tp-tri" data-tri="${c}">${n}${S.tri.cle === c ? (S.tri.sens < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
  zone.innerHTML = `<div class="tp-form tp-form-t"><label>Actif <select data-f="actif"><option value="">Tous</option>${tickers.map(t => `<option${F.actif === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label>Période <select data-f="periode">${[['', 'Tout'], ['7', '7 jours'], ['30', '30 jours'], ['90', '90 jours'], ['365', '12 mois']].map(([v, n]) => `<option value="${v}"${String(F.periode || '') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Sens <select data-f="sens"><option value="">Tous</option><option value="BUY"${F.sens === 'BUY' ? ' selected' : ''}>Achats</option><option value="SELL"${F.sens === 'SELL' ? ' selected' : ''}>Ventes</option></select></label>
      <label>Résultat <select data-f="resultat"><option value="">Tous</option><option value="gagnant"${F.resultat === 'gagnant' ? ' selected' : ''}>Gagnants</option><option value="perdant"${F.resultat === 'perdant' ? ' selected' : ''}>Perdants</option></select></label>
      <label>Recherche <input type="text" data-f="texte" value="${esc(F.texte || '')}" placeholder="n° de position, actif…" autocomplete="off"></label></div>
    <p class="tp-doux"><b>${T.length}</b> positions · résultat <b class="${cls(res.pnl)}">${eurSigne(res.pnl || 0)}</b> · ${res.n ? pc0(res.winRate) + ' gagnantes' : ''}</p>
    <div class="tp-scroll"><table class="tp-t tp-trans"><tr>${th('tFerm', 'Fermeture')}${th('ticker', 'Actif')}<th>Sens</th>${th('volume', 'Lots', 1)}<th class="c-opt">Entrée → sortie</th>${th('duree', 'Durée', 1)}${th('pnl', 'Résultat')}${th('r', 'R', 1)}</tr>
      ${page.map(t => `<tr title="n° ${esc(t.id)} · ${esc(t.origine)}${t.commentaire ? ' · ' + esc(t.commentaire) : ''}"><td>${esc(dateFr(t.tFerm))}</td><td><b>${esc(t.ticker)}</b></td><td>${t.sens === 'BUY' ? 'achat' : 'vente'}</td><td class="c-opt">${fr(t.volume, 3)}</td><td class="c-opt">${fr(t.prixOuv)} → ${fr(t.prixFerm)}</td><td class="c-opt">${esc(formatDuree(t.duree))}</td><td class="${cls(t.pnl)}"><b>${eurSigne(t.pnl)}</b></td><td class="c-opt ${cls(t.r)}">${t.r == null ? '—' : fr(t.r, 1)}</td></tr>`).join('')}</table></div>
    ${tri.length > page.length ? `<p><button type="button" data-plus>Afficher 50 de plus (${tri.length - page.length} restantes)</button></p>` : ''}<p class="tp-doux">R = résultat ÷ risque initial (distance au stop final × lots × valeur du point) ; absent sans stop ou stop remonté. Les durées et heures sont en heure de Paris.</p>`;
}

/* ───── par actif ───── */
export async function vueActif(S, zone, graphs) {
  const tickers = [...grouper(S.E, t => t.ticker)].sort((a, b) => b.n - a.n).map(x => x.cle); if (!tickers.length) { zone.innerHTML = '<p class="tp-doux">Aucune position.</p>'; return; }
  if (!tickers.includes(S.actif)) S.actif = tickers[0]; const T = S.E.filter(t => t.ticker === S.actif), R = resume(T), ach = resume(T.filter(t => t.sens === 'BUY')), ven = resume(T.filter(t => t.sens === 'SELL'));
  const top = (L, n = 5) => `<ul class="tp-liste">${L.slice(0, n).map(t => `<li><span>${esc(dateFr(t.tFerm))} · ${t.sens === 'BUY' ? 'achat' : 'vente'} · ${fr(t.volume, 3)} lot</span><b class="${cls(t.pnl)}">${eurSigne(t.pnl)}</b></li>`).join('')}</ul>`;
  zone.innerHTML = `<div class="tp-chips" role="tablist" aria-label="Actif">${tickers.map(t => `<button type="button" role="tab" data-actif="${esc(t)}" aria-pressed="${t === S.actif}">${esc(t)}</button>`).join('')}</div>
    <div class="tp-cartes">${carte('Résultat net', eurSigne(R.pnl), '', cls(R.pnl))}${carte('Positions', String(R.n), pc0(R.winRate) + ' gagnantes')}${carte('Facteur de profit', R.profitFactor ? fr(R.profitFactor) : '—', '')}${carte('Espérance par trade', eurSigne(R.esperance), '')}${carte('Durée médiane', formatDuree(R.dureeMediane), 'gains ' + formatDuree(R.dureeGagnantes) + ' · pertes ' + formatDuree(R.dureePerdantes))}${carte('Séries', R.series.gagnante + ' / ' + R.series.perdante, 'gagnante / perdante')}</div>
    <h4>Courbe de résultat de ${esc(S.actif)}</h4><div class="tp-graph" data-g></div>
    <h4>Achat contre vente</h4><table class="tp-t"><tr><th></th><th>Positions</th><th>Réussite</th><th>Résultat</th><th>Espérance</th></tr><tr><th>Achats</th><td>${ach.n || 0}</td><td>${ach.n ? pc0(ach.winRate) : '—'}</td><td class="${cls(ach.pnl)}">${ach.n ? eurSigne(ach.pnl) : '—'}</td><td>${ach.n ? eurSigne(ach.esperance) : '—'}</td></tr><tr><th>Ventes</th><td>${ven.n || 0}</td><td>${ven.n ? pc0(ven.winRate) : '—'}</td><td class="${cls(ven.pnl)}">${ven.n ? eurSigne(ven.pnl) : '—'}</td><td>${ven.n ? eurSigne(ven.esperance) : '—'}</td></tr></table>
    <h4>Meilleurs trades</h4>${top([...T].sort((a, b) => b.pnl - a.pnl))}<h4>Pires trades</h4>${top([...T].sort((a, b) => a.pnl - b.pnl))}`;
  try { const G = graphs.add(await monterGraphique(zone.querySelector('[data-g]'), { hauteur: 220, intraday: false, dec: 0 })); let c = 0; G.ligne(T.map(t => ({ t: t.tFerm, v: +(c += t.pnl).toFixed(2) })), { couleur: COULEURS.accent, titre: S.actif, format: { type: 'price', precision: 0, minMove: 1 } }); G.ajuster(); } catch (e) { zone.querySelector('[data-g]').innerHTML = '<p class="tp-panne">Graphique indisponible.</p>'; }
}

/* ───── où sont mes gains et mes pertes ───── */
export function vueOu(S, zone) {
  const E = S.E; if (!E.length) { zone.innerHTML = '<p class="tp-doux">Aucune position.</p>'; return; }
  const heures = grouper(E, t => t.heure).sort((a, b) => a.cle - b.cle).map(o => ({ ...o, cle: String(o.cle).padStart(2, '0') + ' h' })), jours = grouper(E, t => t.jourSemaine).sort((a, b) => a.cle - b.cle).map(o => ({ ...o, cle: nomJour(o.cle) })), taille = parTaille(E).map(o => ({ ...o, cle: o.cle + ' (' + o.seuil + ' lot)' }));
  zone.innerHTML = `<p class="tp-doux">Résultat net par catégorie (le petit chiffre est le nombre de positions). Un créneau avec peu de positions ne prouve rien : lisez-le avec prudence.</p>
    ${barres(grouper(E, t => t.ticker), { titre: 'Par actif', ordre: (a, b) => b.pnl - a.pnl })}${barres(jours, { titre: 'Par jour de la semaine (ouverture)' })}${barres(heures, { titre: 'Par heure d’ouverture (heure de Paris)', min: 5 })}
    ${barres(grouper(E, t => t.session).sort((a, b) => ['Asie', 'Londres', 'New York', 'Nuit'].indexOf(a.cle) - ['Asie', 'Londres', 'New York', 'Nuit'].indexOf(b.cle)), { titre: 'Par session', note: 'Sessions en heures UTC : Asie 0-7 h, Londres 7-13 h, New York 13-21 h, Nuit 21-24 h.' })}
    ${barres(parDuree(E), { titre: 'Par durée de détention' })}${taille.length ? barres(taille, { titre: 'Par taille de position' }) : ''}${barres(grouper(E, t => (t.sens === 'BUY' ? 'achats' : 'ventes')), { titre: 'Achats contre ventes' })}`;
}

/* ───── positions ouvertes ───── */
export function vuePositions(S, zone, prix = {}) {
  const O = S.L.ouvertes.positions || [], X = exposition(O, S.vp, S.capital, prix);
  if (!O.length) { zone.innerHTML = `<p class="tp-doux">Aucune position ouverte dans le dernier fichier importé${S.L.ouvertes.t ? ' (' + esc(age(S.L.ouvertes.t)) + ')' : ''}.</p>`; return; }
  zone.innerHTML = `<div class="tp-cartes">${carte('Résultat latent', eurSigne(X.latent), 'aux prix indiqués ci-dessous', cls(X.latent))}${carte('Valeur exposée', eur(X.valeur, 0), X.exposePct != null ? fr(X.exposePct, 0) + ' % du capital' : '')}${carte('Risque au stop', eur(X.risqueAuStop, 0), X.risquePct != null ? fr(X.risquePct, 1) + ' % du capital' + (X.sansStop ? ' · ' + X.sansStop + ' sans stop' : '') : '', X.risquePct > 5 ? 'tp-baisse' : '')}${carte('Capital de référence', S.capital ? eur(S.capital, 0) : '—', S.capital ? (S.reglages.capital ? 'réglé à la main' : 'solde reconstitué') : 'à renseigner dans Réglages : sans lui, aucun pourcentage de risque n’est affiché')}</div>
    <table class="tp-t"><tr><th>Actif</th><th>Sens</th><th>Lots</th><th>Entrée</th><th>Prix</th><th>Latent</th></tr>${X.positions.map(p => `<tr><td><b>${esc(p.ticker)}</b></td><td>${p.sens === 'BUY' ? 'achat' : 'vente'}</td><td>${fr(p.volume, 3)}</td><td>${fr(p.prixOuv)}</td><td>${fr(p.prixUtilise)}<br><small class="tp-src">${esc(p.source)}</small></td><td class="${cls(p.latent)}"><b>${eurSigne(p.latent)}</b>${p.sl == null ? '<br><small class="tp-baisse">sans stop</small>' : '<br><small class="tp-doux">stop ' + fr(p.sl) + '</small>'}</td></tr>`).join('')}</table>
    <p><button type="button" data-couvrir-pos>Couvrir mes positions (fenêtre Couverture)</button></p><p class="tp-doux">Positions du dernier fichier importé (${S.L.ouvertes.t ? esc(age(S.L.ouvertes.t)) : '—'}) ; les prix en direct remplacent ceux du fichier quand ils sont disponibles (l’or : prix au comptant de l’appli ; les autres : instantanés du robot, différés). Résultat latent estimé avec la valeur du point mesurée sur vos positions : peut différer de xStation de quelques centimes.</p>`;
}

/* ───── coach ───── */
export async function vueCoach(S, zone, graphs) {
  const C = S.coach; if (!C || !C.note) { zone.innerHTML = '<p class="tp-doux">Il faut au moins dix positions pour établir une note et un rapport.</p>'; return; }
  const ev = evolutionNote(S.E), n = C.note, noms = { stop: 'Stops posés', taille: 'Tailles', revenge: 'Sans revenge', surtrading: 'Sans surtrading', pertes: 'Pertes coupées', serie: 'Après pertes' };
  zone.innerHTML = `<div class="tp-note"><div class="tp-note-n ${n.note >= 75 ? 'tp-hausse' : n.note >= 50 ? 'tp-orange' : 'tp-baisse'}">${n.note}<small>/100</small></div><div><b>Note de discipline</b><br><span class="tp-doux">calculée sur vos ${n.n} positions ; une note haute ne garantit pas de gagner.</span></div></div>
    <div class="tp-barres">${Object.entries(n.detail).map(([k, d]) => `<div class="tp-barre"><span class="tp-b-n">${esc(noms[k])}</span><span class="tp-b-v"><i class="tp-b-h" style="width:${(d.points / d.poids * 100).toFixed(0)}%"></i></span><span class="tp-b-t">${d.points} / ${d.poids}</span></div>`).join('')}</div>
    ${ev.length >= 2 ? '<h4>Évolution de la note (fenêtres de 30 jours)</h4><div class="tp-graph" data-g></div>' : ''}
    <h4>Vos erreurs mesurées</h4>${C.constats.length ? `<ul class="tp-actus">${C.constats.slice().sort((a, b) => a.impact - b.impact).map(c => `<li><b>${esc(c.titre)}</b> <span class="tp-etiq ${c.impact < 0 ? 'tp-e-b' : ''}">${eurSigne(c.impact, 0)}</span><p class="tp-impact">${esc(c.texte)}</p><small class="tp-doux">${c.n} positions (${pc0(c.part)}) · résultat moyen ${eurSigne(c.moyenne)} contre ${eurSigne(c.moyenneReste)} pour les autres</small></li>`).join('')}</ul>` : '<p class="tp-doux">Aucune erreur mesurable avec assez de positions.</p>'}
    <h4>Rapport</h4><div class="tp-rapport" data-rapport>${rapportHtml(S)}</div><p class="tp-actions"><button type="button" data-ia-rapport>${S.L.rapport && S.L.rapport.ia ? 'Régénérer avec l’IA de Rayle' : 'Rédiger avec l’IA de Rayle'}</button><button type="button" data-lire-rapport>Lire à voix haute</button></p><div class="tp-ia" data-ia-msg role="status"></div>
    <h4>Là où ça marche, là où ça coûte</h4>${barres([...C.meilleurs.slice(0, 4), ...C.pires.slice(0, 4)].map(x => ({ cle: x.dimension + ' · ' + x.cle, pnl: x.pnl, n: x.n, winRate: x.winRate })), { ordre: (a, b) => b.pnl - a.pnl, note: 'Seulement les catégories d’au moins ' + SEUILS.echantillon + ' positions.' })}`;
  if (ev.length >= 2) { try { const G = graphs.add(await monterGraphique(zone.querySelector('[data-g]'), { hauteur: 180, intraday: false, dec: 0 })); G.ligne(ev.map(p => ({ t: p.t, v: p.note })), { couleur: COULEURS.accent, titre: 'Discipline', format: { type: 'price', precision: 0, minMove: 1 } }); G.ajuster(); } catch (e) { /* courbe facultative */ } }
}
export function rapportHtml(S) {
  const r = S.L.rapport, texte = r && r.texte ? r.texte : texteRapport(S.coach, S.R);
  return `<p>${esc(texte).replace(/\n+/g, '</p><p>')}</p><p class="tp-doux">${r && r.ia ? 'Rédigé par l’IA de Rayle à partir des mesures ci-dessus ' + esc(age(r.t)) : 'Rapport calculé (sans IA) à partir des mesures ci-dessus'} ; il se met à jour à chaque import.</p>`;
}

/* ───── réglages ───── */
export function vueReglages(S, zone, conn) {
  const vp = S.vp, noms = Object.keys(vp).sort();
  zone.innerHTML = `<article class="tp-carte"><h3>Synchronisation entre appareils</h3><p class="tp-doux">Le Worker Portefeuille garde l’historique dans ton compte Cloudflare et le partage entre le PC, la tablette et le téléphone. Sans lui, tout reste sur cet appareil. Mise en place : fichier <code>trader-pro/worker/LISEZMOI.md</code>.</p>
      <form class="tp-form" data-conn><label>Adresse du Worker<input type="text" name="url" value="${esc(conn ? conn.url : '')}" placeholder="https://rayle-portefeuille.….workers.dev" autocomplete="off" inputmode="url"></label><label>Code d’accès<input type="password" name="code" value="${esc(conn ? conn.code : '')}" placeholder="reste sur cet appareil" autocomplete="off"></label><button type="submit">Enregistrer et tester</button></form>${conn ? '<p class="tp-actions"><button type="button" data-appairer>Copier le lien pour les autres appareils</button></p><p class="tp-doux">Ouvre ce lien sur la tablette ou le téléphone : la connexion s’y enregistre toute seule, et l’historique importé ici apparaît partout. Le lien contient ton code d’accès : ne le partage pas.</p>' : '<p class="tp-doux"><b>Une fois le Worker configuré sur un appareil</b>, un bouton ici crée un lien d’appairage pour les autres.</p>'}<p class="tp-doux" data-conn-msg role="status"></p></article>
    <article class="tp-carte"><h3>Capital et risque</h3><form class="tp-form" data-reg><label>Capital actuel du compte (€)<input name="capital" inputmode="decimal" value="${S.reglages.capital != null ? esc(String(S.reglages.capital)) : ''}" placeholder="ex. 250" autocomplete="off"></label><label>Solde au 31/12/2025 (€, avant l’export)<input name="soldeInitial" inputmode="decimal" value="${S.reglages.soldeInitial != null ? esc(String(S.reglages.soldeInitial)) : ''}" placeholder="0 si le compte était vide" autocomplete="off"></label><label>Risque par trade (% du capital)<input name="risquePct" inputmode="decimal" value="${esc(String(S.reglages.risquePct != null ? S.reglages.risquePct : 1))}" autocomplete="off"></label><button type="submit">Enregistrer</button></form><p class="tp-doux">Sert au risque en % des positions ouvertes et au calcul des tailles de position des fiches d’ordre.</p></article>
    <article class="tp-carte"><h3>Valeur du point (€ par unité de prix et par lot)</h3><p class="tp-doux">Mesurée sur tes propres positions (médiane) ; tu peux la corriger. Les tailles de lots en dépendent.</p>${noms.length ? `<form class="tp-form" data-vp>${noms.map(t => `<label>${esc(t)} <small>(${vp[t].n} positions, écart ${vp[t].ecart != null ? Math.round(vp[t].ecart * 100) : '?'} %)</small><input name="${esc(t)}" inputmode="decimal" value="${esc(String((S.reglages.valeursPoint && S.reglages.valeursPoint[t]) != null ? S.reglages.valeursPoint[t] : +vp[t].k.toFixed(2)))}" autocomplete="off"></label>`).join('')}<button type="submit">Enregistrer</button></form>` : '<p class="tp-doux">Pas assez de positions pour mesurer.</p>'}</article>
    <article class="tp-carte"><h3>Sauvegarde</h3><p class="tp-actions"><button type="button" data-sauvegarder>Télécharger une sauvegarde (.json)</button><label class="tp-fichier">Restaurer une sauvegarde<input type="file" accept=".json,application/json" data-restaurer></label><button type="button" data-sync>Synchroniser maintenant</button></p><p class="tp-doux" data-sauv-msg role="status"></p></article>`;
}
