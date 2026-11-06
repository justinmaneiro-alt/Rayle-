/* ═════════════ PANNEAUX : positions en cours, historique (CSV), portefeuille, journal du bot ═════════════
   Rendu SEULEMENT : chaque chiffre vient tel quel de l'état publié (compte, trades, perf). Aucune addition, aucun P&L recalculé ici. */
import { fmtPrix, fmtQte, fmtUSD, fmtR, fmtPct, fmtNombre, heureParis, dateHeureParis, fmtDuree, copiePrix, copieQte } from '../commun/format.js';
import { DEFINITIONS } from '../commun/definitions.js';
import { PAR_ID } from '../commun/actifs.js';

export const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sgn = x => (x > 0 ? 'at-gain' : x < 0 ? 'at-perte' : '');
const sens = s => `<span class="at-sens at-${s}">${s === 'achat' ? '▲ haussier' : '▼ baissier'}</span>`;
export const info = cle => `<button type="button" class="at-i" data-def="${cle}" aria-label="Définition">ⓘ</button>`;

export function brancherDefinitions(racine) {
  racine.addEventListener('click', e => {
    const b = e.target.closest('.at-i'); if (!b) return;
    e.stopPropagation();
    const ancien = racine.querySelector('.at-bulle'); if (ancien) { ancien.remove(); if (ancien.dataset.def === b.dataset.def) return; }
    const d = document.createElement('div'); d.className = 'at-bulle'; d.dataset.def = b.dataset.def; d.textContent = DEFINITIONS[b.dataset.def] || '';
    const r = b.getBoundingClientRect(), rr = racine.getBoundingClientRect();
    d.style.left = Math.max(8, Math.min(rr.width - 268, r.left - rr.left - 120)) + 'px'; d.style.top = (r.bottom - rr.top + 6) + 'px';
    racine.appendChild(d);
  });
  racine.addEventListener('pointerdown', e => { if (!e.target.closest('.at-i,.at-bulle')) { const a = racine.querySelector('.at-bulle'); if (a) a.remove(); } });
}

/* badge de catégorie : « GRANDE » ou « normale » (anciens trades sans catégorie = normale) */
export const badge = tr => (tr && tr.categorie === 'grande' ? '<span class="at-badge at-badge-grande">GRANDE</span>' : '<span class="at-badge">normale</span>');
const risqueTxt = tr => tr.risqueUSD != null ? `${fmtUSD(tr.risqueUSD, 2)} (${fmtNombre(tr.risquePct != null ? tr.risquePct : 0.5, 1)} %)` : '—';

/* ─── positions en cours : une carte par position (jamais de défilement horizontal) ─── */
export function htmlPositions(etat, selection) {
  const c = etat.compte, enCours = etat.trades.enCours;
  if (!enCours.length) return '<p class="at-vide">Aucune position en cours.</p>';
  const parId = Object.fromEntries(c.positions.map(p => [p.id, p]));
  const champ = (nom, val, cls = '', large) => `<div${large ? ' class="at-large"' : ''}><small>${nom}</small><b class="${cls}">${val}</b></div>`;
  const cartes = enCours.map(tr => {
    const p = parId[tr.id], attente = tr.statut === 'propose' || !p;
    const corps = attente
      ? champ('Entrée', fmtPrix(tr.actif, tr.entree)) + champ('SL', fmtPrix(tr.actif, tr.stop)) + champ('TP', fmtPrix(tr.actif, tr.objectif)) + champ('Taille', fmtQte(tr.actif, tr.quantite)) + champ('Valable jusqu’à', heureParis(tr.validJusqu)) + champ('Risque', risqueTxt(tr), 'at-risque-pos', true)
      : champ('Entrée', fmtPrix(tr.actif, p.entree)) + champ('Prix', fmtPrix(tr.actif, p.prix)) + champ('P&amp;L', fmtUSD(p.pnl, 2, true), sgn(p.pnl)) + champ('R', fmtR(p.r), sgn(p.r))
        + champ('SL', fmtPrix(tr.actif, p.stop)) + champ('TP', fmtPrix(tr.actif, p.objectif)) + champ('Taille', fmtQte(tr.actif, p.quantite)) + champ('Durée', fmtDuree(p.dureeMs)) + champ('Risque', risqueTxt(tr), 'at-risque-pos', true);
    return `<article class="at-carte-pos at-${tr.sens}${selection === tr.id ? ' at-sel' : ''}${attente ? ' at-attente' : ''}" data-id="${esc(tr.id)}" tabindex="0">
      <header><b>${esc(tr.actif)}</b> ${sens(tr.sens)} ${badge(tr)}<span class="at-doux">${attente ? 'en attente de l’entrée' : 'ouverte'}</span></header>
      <div class="at-carte-pos-corps">${corps}</div></article>`;
  }).join('');
  const t = c.totalOuvert, niv = t.levier >= 4 ? 'at-danger' : t.levier >= 2 ? 'at-alerte' : '', nivR = t.risquePct >= 3 ? 'at-danger' : t.risquePct >= 1.5 ? 'at-alerte' : '';
  return `<div class="at-cartes-pos">${cartes}</div>
    <div class="at-risque"><span>Total flottant <b class="${sgn(t.pnl)}">${fmtUSD(t.pnl, 2, true)}</b></span><span class="${nivR}">Risque ouvert ${fmtUSD(t.risqueUSD, 0)} (${fmtPct(t.risquePct, 2, false)}) ${info('risqueOuvert')}</span><span class="${niv}">Levier total ×${fmtNombre(t.levier, 2)} ${info('levier')}</span><span>Risque par trade fixé à ${fmtNombre(c.risquePct, 1)} % (${fmtUSD(c.risqueParTradeUSD, 2)}) ${info('risque')}</span></div>`;
}

/* ─── historique des positions (heures RÉELLES) + CSV ─── */
export function htmlHistorique(lent) {
  const l = (lent && lent.passes || []).slice().reverse();
  if (!l.length) return '<p class="at-vide">Aucune position terminée pour l’instant.</p>';
  const td = (lbl, v, cls = '') => `<td data-l="${lbl}"${cls ? ` class="${cls}"` : ''}>${v}</td>`;
  return `<div class="at-tab-defil"><table class="at-table at-hist at-empilable"><thead><tr><th>Actif</th><th>Sens</th><th>Type</th><th>Signal</th><th>Entrée réelle</th><th>Prix entrée</th><th>Sortie réelle</th><th>Prix sortie</th><th>Raison</th><th>Risque</th><th>Frais + gliss.</th><th>R</th><th>P&amp;L $</th></tr></thead><tbody>${
    l.map(t => `<tr data-id="${esc(t.id)}">${td('Actif', esc(t.actif))}${td('Sens', sens(t.sens))}${td('Type', badge(t))}${td('Signal', dateHeureParis(t.tSignal))}${td('Entrée réelle', t.tEntree ? dateHeureParis(t.tEntree) : '—')}${td('Prix entrée', t.prixEntree != null ? fmtPrix(t.actif, t.prixEntree) : '—')}${td('Sortie réelle', t.tSortie ? dateHeureParis(t.tSortie) : '—')}${td('Prix sortie', t.prixSortie != null ? fmtPrix(t.actif, t.prixSortie) : '—')}${td('Raison', esc(t.raison || t.statut))}${td('Risque', risqueTxt(t))}${td('Frais + gliss.', t.fraisGlissement != null ? fmtUSD(t.fraisGlissement, 2) : '—')}${td('R', t.r != null ? fmtR(t.r) : '—', sgn(t.r))}${td('P&amp;L $', t.pnl != null ? fmtUSD(t.pnl, 2, true) : '—', sgn(t.pnl))}</tr>`).join('')}</tbody></table></div>`;
}
export function csvHistorique(lent) {
  const tete = ['id', 'actif', 'sens', 'type', 'categorie', 'heure_signal', 'heure_entree_reelle', 'entree_prevue', 'prix_entree', 'stop', 'objectif', 'quantite', 'risque_usd', 'frais_entree', 'frais_sortie', 'glissement', 'statut', 'heure_sortie_reelle', 'prix_sortie', 'raison', 'R', 'pnl_usd'];
  const iso = t => (t ? new Date(t).toISOString() : '');
  const lignes = (lent && lent.passes || []).map(t => [t.id, t.actif, t.sens, t.type, t.categorie === 'grande' ? 'grande' : 'normale', iso(t.tSignal), iso(t.tEntree), copiePrix(t.actif, t.entree), t.prixEntree != null ? copiePrix(t.actif, t.prixEntree) : '', copiePrix(t.actif, t.stop), copiePrix(t.actif, t.objectif), copieQte(t.actif, t.quantite), t.risqueUSD, t.fraisEntree, t.fraisSortie, t.glissement, t.statut, iso(t.tSortie), t.prixSortie != null ? copiePrix(t.actif, t.prixSortie) : '', t.raison || '', t.r ?? '', t.pnl ?? '']);
  return [tete].concat(lignes).map(l => l.map(v => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
}

/* ─── carte « Performance du portefeuille » ─── */
export function htmlPortefeuille(etat, lent) {
  const c = etat.compte, perf = lent && lent.perf, g = perf && perf.global, statut = etat.statut || (g && g.statut) || 'PAS ENCORE PROUVÉ';
  const cls = statut === 'RENTABLE' ? 'at-gain' : statut === 'NON RENTABLE' ? 'at-perte' : 'at-alerte';
  const parType = perf ? Object.entries(perf.parType).map(([k, s]) => `<li><b>${esc(k)}</b> ${s.n} trades · R moyen ${s.moyenne != null ? fmtR(s.moyenne) : '—'} · <span class="${s.statut === 'RENTABLE' ? 'at-gain' : s.statut === 'NON RENTABLE' ? 'at-perte' : 'at-doux'}">${s.statut}</span></li>`).join('') : '';
  const bt = lent && lent.backtest;
  return `<div class="at-pf">
    <div class="at-pf-capital"><small>Capital ${info('capital')}</small><output class="at-capital" data-cents="${Math.round(c.capital * 100)}">${fmtUSD(c.capital)}</output></div>
    <canvas class="at-courbe" aria-label="Courbe d’équité"></canvas>
    <div class="at-pf-grille">
      <div><small>Réalisé ${info('realise')}</small><b class="${sgn(c.realise)}">${fmtUSD(c.realise, 2, true)}</b></div>
      <div><small>Flottant ${info('flottant')}</small><b class="${sgn(c.flottant)}">${fmtUSD(c.flottant, 2, true)}</b></div>
      <div><small>Cette semaine ${info('semaine')}</small><b class="${sgn(c.semaine.pnl)}">${fmtUSD(c.semaine.pnl, 2, true)} · ${fmtPct(c.semaine.pct)}</b>${c.semaine.depuisDemarrage ? '<em>depuis le démarrage</em>' : ''}</div>
      <div><small>Baisse max ${info('baisseMax')}</small><b class="${c.baisse.maxUSD > 0 ? 'at-perte' : ''}">${fmtUSD(-c.baisse.maxUSD, 2)} · ${fmtPct(-c.baisse.maxPct)}</b></div>
      <div><small>Limite simulée (${c.baisse.mode}) ${info('limite')}</small><b class="${c.baisse.depassee ? 'at-perte' : ''}">${fmtPct(c.baisse.actuellePct, 2, false)} / ${fmtPct(c.baisse.limitePct, 0, false)}</b></div>
      <div><small>Risque par trade ${info('risque')}</small><b>${fmtUSD(c.risqueParTradeUSD, 2)} (${fmtNombre(c.risquePct, 1)} %)</b></div>
    </div>
    <div class="at-pf-statut"><span class="at-statut ${cls}">${statut}</span> ${info('statut')}
      ${g ? `<span>${g.n} trades · R moyen ${g.moyenne != null ? fmtR(g.moyenne) : '—'} · IC 95 % [${g.icBas != null ? fmtNombre(g.icBas, 2) : '—'} ; ${g.icHaut != null ? fmtNombre(g.icHaut, 2) : '—'}] ${info('rMoyen')} · baisse max ${fmtNombre(g.baisseMaxR || 0, 2)} R</span>` : ''}</div>
    ${!perf || perf.echantillonTropPetit ? `<p class="at-avert">Échantillon trop petit pour conclure (${perf ? perf.nClos : 0} trades sur 100) ${info('echantillon')}</p>` : ''}
    ${htmlCategories(perf)}
    ${parType ? `<ul class="at-partype">${parType}</ul>` : ''}
    ${bt ? `<details class="at-bt"><summary>Backtest : ${esc(bt.verdict)}</summary><p>${bt.n} trades simulés sur ${fmtNombre(bt.joursEnregistres, 1)} jours enregistrés. Hors apprentissage : ${bt.horsApprentissage.n} trades, R moyen ${bt.horsApprentissage.moyenne != null ? fmtR(bt.horsApprentissage.moyenne) : '—'}, IC 95 % [${bt.horsApprentissage.icBas != null ? fmtNombre(bt.horsApprentissage.icBas, 2) : '—'} ; ${bt.horsApprentissage.icHaut != null ? fmtNombre(bt.horsApprentissage.icHaut, 2) : '—'}].</p><ul>${bt.limites.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
  </div>`;
}

/* suivi SÉPARÉ normales / grandes (chiffres publiés par le moteur, rien n'est recalculé ici) */
export function htmlCategories(perf) {
  const pc = perf && perf.parCategorie; if (!pc) return '';
  const cls = s => (s === 'RENTABLE' ? 'at-gain' : s === 'NON RENTABLE' ? 'at-perte' : 'at-alerte');
  const ligne = (nom, s) => `<tr><td data-l="Catégorie">${nom}</td><td data-l="Trades">${s.n}</td><td data-l="R moyen">${s.moyenne != null ? fmtR(s.moyenne) : '—'}</td><td data-l="% gagnants">${s.pctGagnants != null ? fmtNombre(s.pctGagnants, 1) + ' %' : '—'}</td><td data-l="R total" class="${sgn(s.totalR)}">${s.n ? fmtR(s.totalR) : '—'}</td><td data-l="Statut"><span class="at-statut ${cls(s.statut)}">${s.statut}</span></td></tr>`;
  return `<table class="at-table at-cat at-empilable"><thead><tr><th>Catégorie</th><th>Trades</th><th>R moyen</th><th>% gagnants</th><th>R total</th><th>Statut</th></tr></thead><tbody>${ligne('<span class="at-badge">normale</span>', pc.normale)}${ligne('<span class="at-badge at-badge-grande">GRANDE</span>', pc.grande)}</tbody></table>`;
}

/* ─── backtest « 7 derniers jours » : publié par le moteur (mêmes exemples, mêmes chiffres sur tous les écrans) ─── */
export function htmlBacktest7j(bt) {
  if (!bt) return '<p class="at-vide">Rejeu en préparation : le moteur le calcule au démarrage puis toutes les 6 heures, et le publie ici.</p>';
  const resultat = s => s.statut === 'expiree' ? '<span class="at-doux">entrée jamais touchée · 0 R · 0 $</span>'
    : `<b class="${sgn(s.r)}">${fmtR(s.r)}</b> · <b class="${sgn(s.pnl)}">${fmtUSD(s.pnl, 2, true)}</b> <span class="at-doux">(${s.raison === 'objectif' ? 'objectif atteint' : s.raison === 'stop' ? 'stop touché' : esc(s.raison || '')})</span>`;
  const ex = (bt.derniers || []).map(s => `<button type="button" class="at-ex at-${s.sens}" data-bt-id="${esc(s.id)}" title="Voir ce moment sur le graphique">
      <span class="at-ex-tete"><b>${esc(s.actif)}</b> ${sens(s.sens)} ${badge(s)} <time>${dateHeureParis(s.tSignal)}</time></span>
      <span class="at-ex-niv">Entrée ${fmtPrix(s.actif, s.entree)} · SL ${fmtPrix(s.actif, s.stop)} · TP ${fmtPrix(s.actif, s.objectif)}</span>
      <span class="at-ex-res">Résultat réel du rejeu : ${resultat(s)} · risque ${fmtUSD(s.risqueUSD, 2)}</span>
      <span class="at-ex-pq">Pourquoi : ${esc(s.pourquoi)}</span></button>`).join('');
  const pc = bt.parCategorie || {}, cat = (k, nom) => pc[k] ? `${nom} ${pc[k].n} (${pc[k].gagnants} gagnant${pc[k].gagnants > 1 ? 's' : ''}, ${fmtR(pc[k].totalR)})` : '';
  const cal = Object.entries(bt.calibrations || {}).map(([a, c]) => c ? `${esc(a)} ${fmtNombre(c.pct, 2)} %` : '').filter(Boolean).join(' · ');
  return `<p class="at-rejoue">REJOUÉ, pas réel · du ${dateHeureParis(bt.debut)} au ${dateHeureParis(bt.fin)} · ${(bt.actifs || []).map(esc).join(', ')} · risque ${fmtNombre(bt.risquePct, 1)} % · frais et glissement inclus · ne change jamais le portefeuille</p>
    <h4 class="at-sous-titre">Les 3 derniers signaux, dans l’ordre du temps <small>(pas les meilleurs : un clic montre le moment sur le graphique)</small></h4>
    ${ex ? `<div class="at-exemples">${ex}</div>` : '<p class="at-vide">Aucun signal terminé sur ces 7 jours.</p>'}
    <p class="at-bt-total"><b>${esc(bt.phrase)}</b>${bt.nExpires ? ` · dont ${bt.nExpires} entrée${bt.nExpires > 1 ? 's' : ''} jamais touchée${bt.nExpires > 1 ? 's' : ''}` : ''}${bt.nEnCours ? ` · ${bt.nEnCours} encore en cours` : ''} · ${fmtUSD(bt.pnl, 2, true)}</p>
    <p class="at-bt-cat">${cat('normale', 'Normales :')} · ${cat('grande', 'Grandes :')}</p>
    ${bt.echantillonTropPetit ? '<p class="at-avert">Échantillon trop petit pour conclure (moins de 20 signaux).</p>' : ''}
    <div class="at-bt-donnees"><div><h5>Données utilisées</h5><ul>${bt.donnees.utilisees.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><h5>Ce qui manque (jamais inventé)</h5><ul>${bt.donnees.manquantes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
    ${cal ? `<p class="at-doux at-bt-cal">Seuil des grandes positions (distance typique en 4 à 6 bougies M15) : ${cal}</p>` : ''}`;
}

/* ─── bouton « Backtest » du graphique : panneau (chiffres publiés par le moteur, rien n'est recalculé ici) ─── */
const MODELE = { rebond: 'rebond', cassure: 'cassure', balayage: 'balayage', continuation: 'continuation' };
export function tradesBacktestGraphe(bg, jours, actif) {
  const f = bg && bg.fenetres && bg.fenetres[jours]; if (!f) return null;
  return f.trades.filter(t => t.actif === actif);
}
/* flèches du copilote rejouées (mêmes règles, carnet de la collecte) : chiffres publiés par le moteur */
export function htmlRejeuCopilote(rj, jours, actif) {
  if (!rj) return '<p class="at-doux at-btg-note">Flèches du copilote : rejeu en préparation (calculé chaque heure par le moteur).</p>';
  const b = rj.bilan, R = (b.Rtotal > 0 ? '+' : '') + String(b.Rtotal).replace('.', ',');
  return `<p class="at-rejoue">Flèches du copilote REJOUÉES · ${esc(actif)} · ${jours} derniers jours · <b>IDÉES, non validées</b></p>
    <div class="at-btg-chiffres"><span>Flèches <b>${b.n}</b></span><span>Gagnantes <b>${b.gagnantes}</b></span><span>R total <b class="${sgn(b.Rtotal)}">${b.finies ? R : '—'}</b> (frais inclus)</span></div>
    ${b.finies < 30 ? '<p class="at-avert">Échantillon trop petit pour conclure.</p>' : ''}
    ${rj.sansCarnet ? `<p class="at-doux at-btg-note">Carnet non enregistré sur ${rj.sansCarnet} des ${rj.bougies} bougies : aucune flèche possible là (la règle lit le carnet ; rien n’est inventé).</p>` : ''}`;
}
export function htmlBacktestGraphe(bg, jours, actif) {
  if (!bg || !bg.fenetres) return '<p class="at-vide">Rejeu en préparation : le moteur le calcule au démarrage puis chaque heure, et le publie ici (le même sur PC, tablette et téléphone).</p>';
  const f = bg.fenetres[jours]; if (!f) return '<p class="at-vide">Aucun rejeu publié pour cette durée.</p>';
  const s = f.stats, st = bg.strategie || {}, cand = st.statut !== 'EN MARCHE';
  const grp = g => Object.entries(g || {}).map(([k, x]) => `<span><b>${esc(MODELE[k] || k)}</b> ${x.n} (${x.gagnants} gagnant${x.gagnants > 1 ? 's' : ''}, ${fmtR(x.totalR)})</span>`).join(' · ') || '—';
  const ici = f.trades.filter(t => t.actif === actif).length;
  const lignes = f.trades.map(t => `<li class="at-btg-l at-${t.sens}"><b class="at-btg-n">${t.n}</b> <b>${esc(t.actif)}</b> ${sens(t.sens)} <span class="at-doux">${esc(t.modele)} · score ${t.score}</span> <time>${dateHeureParis(t.tSignal)}</time> <span class="at-btg-niv">E ${fmtPrix(t.actif, t.entree)} · SL ${fmtPrix(t.actif, t.stop)} · TP ${fmtPrix(t.actif, t.objectif)}</span> → <b class="${sgn(t.R)}">${fmtR(t.R)}</b> <span class="at-doux">(${esc(t.raison)})</span></li>`).join('');
  return `<p class="at-rejoue">REJOUÉ, pas réel · ${cand ? '<b>CANDIDATE, non validée</b>' : '<b>stratégie en marche</b>'} : ${esc(st.id || '—')} · ${jours} derniers jours · ${(bg.actifs || []).map(esc).join(', ')} · frais et glissement inclus · ne touche jamais le portefeuille</p>
    <div class="at-btg-chiffres"><span>Trades <b>${s.n}</b></span><span>Gagnants <b>${s.gagnants}</b></span><span>R total <b class="${sgn(s.totalR)}">${s.n ? fmtR(s.totalR) : '—'}</b></span><span>R moyen <b class="${sgn(s.moyR)}">${s.moyR != null ? fmtR(s.moyR) : '—'}</b></span><span>Baisse max <b>${s.n ? fmtNombre(s.baisseMaxR, 2) + ' R' : '—'}</b></span></div>
    ${s.tropPetit ? `<p class="at-avert">Échantillon trop petit pour conclure (${s.n} trade${s.n > 1 ? 's' : ''}, moins de 20).</p>` : ''}
    <p class="at-btg-grp">Par modèle : ${grp(s.parModele)}</p><p class="at-btg-grp">Par actif : ${grp(s.parActif)}</p>
    ${f.trades.length ? `<ol class="at-btg-liste">${lignes}</ol><p class="at-doux at-btg-note">Sur ce graphique : les ${ici} trade${ici > 1 ? 's' : ''} de ${esc(actif)} (numéros dans l’ordre du temps, tous actifs confondus).</p>` : '<p class="at-vide">Aucune position rejouée sur cette durée.</p>'}
    ${bg.encoreOuvertes ? `<p class="at-doux at-btg-note">${bg.encoreOuvertes} position(s) encore ouverte(s) à la fin des données : non comptée(s).</p>` : ''}
    <p class="at-doux at-btg-note">Non rejoué : ${(bg.nonRejoue || []).map(esc).join(' ')}</p>`;
}

/* ─── Journal : plan du jour, 5 dernières leçons, total par cause, registre fantôme (chiffres publiés par le moteur) ─── */
/* plans du jour déjà enregistrés avant le passage au copilote d'information : formulation neutre à l'affichage (jamais « ACHAT / VENTE ») */
export const neutre = t => String(t).replace(/je cherche (un|une) ACHAT/g, 'scénario haussier observé').replace(/je cherche (un|une) VENTE/g, 'scénario baissier observé').replace(/ACHAT/g, 'hausse').replace(/VENTE/g, 'baisse').replace(/, stop sous/g, ', invalidé sous').replace(/, stop au-dessus/g, ', invalidé au-dessus');
export function htmlPlanLecons(v4) {
  if (!v4) return '';
  const p = v4.plan, L = v4.lecons, F = v4.fantome;
  const plan = p && p.actifs && p.actifs.length ? `<details class="at-v4-bloc" open><summary>Plan du jour (${esc(p.jour)}, 08:00 Paris)</summary>${p.actifs.map(a => `<div class="at-plan"><b>${esc(a.actif)}</b> <span class="at-doux">flux ${esc(a.flux.sens)}</span><p class="at-plan-niv">${a.niveaux.map(n => `<span class="${n.type === 'support' ? 'at-achat' : 'at-vente'}">${n.type === 'support' ? 'S' : 'R'} ${fmtPrix(a.actif, n.p)}${n.tag ? ' · ' + esc(n.tag) : ''}</span>`).join(' ')}</p><ul>${a.scenarios.map(s => `<li>${esc(neutre(s))}</li>`).join('')}</ul></div>`).join('')}</details>` : '<p class="at-doux at-v4-vide">Plan du jour : rédigé chaque matin à 08:00 (heure de Paris).</p>';
  const causes = L ? (L.causes || Object.keys(L.parCause || {})).map(c => `<span>${esc(c)} <b>${(L.parCause || {})[c] || 0}</b></span>`).join(' · ') : '';
  const lecons = L && L.dernieres && L.dernieres.length ? `<ol class="at-lecons">${L.dernieres.map(l => `<li><time>${dateHeureParis(l.t)}</time> <span class="at-badge">${esc(l.cause)}</span> ${esc(l.texte)}</li>`).join('')}</ol>` : '<p class="at-doux at-v4-vide">Aucune leçon pour l’instant : elles arrivent à chaque position fantôme ou réelle clôturée.</p>';
  const fv = F && F.parVersion ? Object.entries(F.parVersion).map(([v, s]) => `<span><b>${esc(v)}</b> ${s.n} clos${s.n ? ` (${s.gagnants} gagnant${s.gagnants > 1 ? 's' : ''}, ${fmtR(s.totalR)})` : ''} · ${s.ouvertes} en cours</span>`).join(' · ') : '';
  return `<details class="at-v4-bloc" open><summary>Leçons (5 dernières) · total par cause : ${causes || '—'}</summary>${lecons}</details>
    ${plan}
    <p class="at-doux at-v4-fantome">Registre fantôme (positions que l’agent AURAIT prises, jamais dans le portefeuille) : ${fv || 'vide pour l’instant'}${v4.candidate ? ` · candidate : ${esc(v4.candidate.id)} (${v4.candidate.validee ? 'validée' : 'non validée'})` : ''}${v4.nVariantes ? ` · ${v4.nVariantes} variantes testées sur le banc long` : ''}</p>`;
}

/* capital animé jusqu'au centime + flash vert / rouge */
export function animerCapital(out, cible, racine) {
  const avant = Number(out.dataset.affiche || out.dataset.cents || cible); out.dataset.cents = cible;
  if (avant === cible) { out.textContent = fmtUSD(cible / 100); out.dataset.affiche = cible; return; }
  out.classList.remove('at-flash-gain', 'at-flash-perte'); void out.offsetWidth; out.classList.add(cible > avant ? 'at-flash-gain' : 'at-flash-perte');
  const d = parseFloat(getComputedStyle(racine).getPropertyValue('--at-d-compteur')) || 0, t0 = performance.now();
  if (out._anim) cancelAnimationFrame(out._anim);
  const pas = t => { const k = d ? Math.min(1, (t - t0) / d) : 1, e = 1 - Math.pow(1 - k, 3), v = Math.round(avant + (cible - avant) * e); out.textContent = fmtUSD(v / 100); out.dataset.affiche = v; if (k < 1) out._anim = requestAnimationFrame(pas); else out.textContent = fmtUSD(cible / 100); };
  out._anim = requestAnimationFrame(pas);
}

export function dessinerCourbe(canvas, points, racine) {
  if (!canvas || !points || points.length < 2) return;
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 300, H = canvas.clientHeight || 90;
  canvas.width = W * dpr; canvas.height = H * dpr; const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const vs = points.map(p => p[1]), mn = Math.min(...vs), mx = Math.max(...vs), t0 = points[0][0], t1 = points[points.length - 1][0];
  const X = t => (t - t0) / Math.max(1, t1 - t0) * (W - 4) + 2, Y = v => H - 4 - (v - mn) / Math.max(1e-9, mx - mn) * (H - 8);
  const col = getComputedStyle(racine).getPropertyValue(vs[vs.length - 1] >= vs[0] ? '--at-gain' : '--at-perte').trim();
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); points.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke();
  ctx.lineTo(X(t1), H); ctx.lineTo(X(t0), H); ctx.closePath(); ctx.globalAlpha = .12; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
}

/* ─── journal du bot ─── */
export function htmlJournal(lent, actif) {
  const l = (lent && lent.journal || []).filter(e => !actif || !e.actif || e.actif === actif).slice(-80).reverse();
  if (!l.length) return '<p class="at-vide">Le journal est vide pour l’instant.</p>';
  const ic = { recit: '💬', ignore: '⊘', proposition: '★', entree: '→', sortie: '■', expiree: '⌛', niveau: '◇', carnet: '▤', adaptation: '⚙' };
  return '<ol class="at-journal">' + l.map(e => `<li class="at-j-${esc(e.type)}"><time>${heureParis(e.t)}</time> <span>${ic[e.type] || '·'}</span> ${e.actif ? `<b>${esc(e.actif)}</b> ` : ''}${e.categorie === 'grande' ? '<span class="at-badge at-badge-grande">GRANDE</span> ' : ''}${esc(e.texte)}${e.source === 'ia' ? ' <em>(IA)</em>' : ''}</li>`).join('') + '</ol>';
}
export const _P = PAR_ID;
