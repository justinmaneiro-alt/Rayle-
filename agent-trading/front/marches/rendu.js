/* ═════════════ RENDU DES PANNEAUX RAYLE MARCHÉS (pur : données → HTML) ═════════════
   Règle d'affichage : AUCUN chiffre sans sa ligne de provenance (source, date de la donnée, âge, retard de publication) ni son badge de fraîcheur.
   Valeur absente = « indisponible » + raison (jamais un tiret ou un zéro) ; dernière valeur connue = badge PÉRIMÉ et date. */
import { provenance, dateFr } from '../../../marches/donnees/normaliser.js';
import { heureParis } from '../../../marches/donnees/panneaux.js';

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const nombre = (v, unite = '') => {
  if (typeof v !== 'number' || !isFinite(v)) return '';
  const a = Math.abs(v), d = a >= 10000 ? 0 : a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 2 : 3;
  const n = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: unite === 'contrats' || unite === 'BTC' && a > 100 ? 0 : d, minimumFractionDigits: 0 }).format(v);
  return unite === '$' ? n + ' $' : unite === '%' ? n + ' %' : unite ? n + ' ' + unite : n;
};
export function variation(m) {
  if (m.precedente == null || m.valeur == null) return null;
  const dv = m.valeur - m.precedente;
  if (['$', 'pts', 'indice', 'CHF', 'contrats', 'BTC'].includes(m.unite) && m.precedente) { const p = dv / Math.abs(m.precedente) * 100; return { texte: (dv >= 0 ? '+' : '−') + Math.abs(p).toFixed(2).replace('.', ',') + ' %', signe: dv > 0 ? 1 : dv < 0 ? -1 : 0 }; }
  return { texte: (dv >= 0 ? '+' : '−') + nombre(Math.abs(dv)), signe: dv > 0 ? 1 : dv < 0 ? -1 : 0 };
}
export function sparkline(serie, w = 96, h = 26) {
  if (!Array.isArray(serie) || serie.length < 3) return '';
  const v = serie.map(p => p[1]), mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const pts = v.map((y, i) => (i / (v.length - 1) * (w - 2) + 1).toFixed(1) + ',' + (h - 2 - (y - mn) / r * (h - 4)).toFixed(1)).join(' ');
  return `<svg class="mk-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="courbe des ${serie.length} dernières valeurs"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}
const CLASSE_FRAICHEUR = { 'temps réel': 'tr', 'différé': 'df', 'quotidien': 'qt', 'hebdomadaire': 'hb', 'mensuel': 'ms' };
export const badge = m => {
  if (m.etat === 'indisponible') return '<span class="mk-badge mk-b-ko">indisponible</span>';
  const c = CLASSE_FRAICHEUR[m.fraicheur] || 'ev';
  return `<span class="mk-badge mk-b-${c}">${esc(m.fraicheur)}</span>` + (m.etat === 'perime' ? '<span class="mk-badge mk-b-pe">périmé</span>' : '');
};

export function carte(m) {
  const cls = 'mk-carte' + (m.etat === 'indisponible' ? ' mk-ko' : m.etat === 'perime' ? ' mk-pe' : '');
  if (m.etat === 'indisponible') return `<article class="${cls}" data-mesure="${esc(m.id)}"><header><h4>${esc(m.libelle)}</h4>${badge(m)}</header><p class="mk-val mk-indispo">indisponible</p><p class="mk-prov">${esc(provenance(m))}</p></article>`;
  const v = variation(m);
  return `<article class="${cls}" data-mesure="${esc(m.id)}"><header><h4>${esc(m.libelle)}</h4>${badge(m)}</header>
    <p class="mk-val"><b>${esc(m.texte != null ? m.texte : nombre(m.valeur, m.unite))}</b>${v ? `<span class="mk-var mk-s${v.signe}" title="par rapport à la valeur précédente de la source">${esc(v.texte)}</span>` : ''}${sparkline(m.serie)}</p>
    <p class="mk-prov">${esc(provenance(m))}</p>${m.note ? `<p class="mk-note">${esc(m.note)}</p>` : ''}</article>`;
}

export function htmlEvenements(evs, nonVerifie) {
  if (nonVerifie) return '<p class="mk-avert">Calendrier non vérifié : les sources officielles (Réserve fédérale, BCE, BLS) ne répondent pas. Aucune date n\'est affichée de mémoire.</p>';
  if (!evs || !evs.length) return '<p class="mk-vide">Aucun événement officiel dans les 14 prochains jours (sources : Réserve fédérale, BCE, BLS).</p>';
  return '<ul class="mk-liste mk-evts">' + evs.map(e => `<li class="mk-imp-${esc(e.importance)}"><time datetime="${new Date(e.dateMs).toISOString()}">${esc(e.quand || heureParis(e.dateMs))}${e.heureIndiquee === false ? ' <em>(heure non publiée)</em>' : ' <em>(Paris)</em>'}</time><b>${esc(e.titre)}</b><small>Source : ${esc(e.source)}${e.importance === 'haute' ? ' · importance haute' : ''}${e.precedent != null ? ' · précédent : ' + esc(e.precedent) : ''}</small></li>`).join('') + '</ul>';
}
export function htmlActus(actus) {
  if (!actus || !actus.length) return '<p class="mk-vide">Aucune actualité pour ce filtre.</p>';
  return '<ul class="mk-liste mk-actus">' + actus.map(a => `<li><a href="${esc(a.lien)}" target="_blank" rel="noopener noreferrer">${esc(a.titre)}</a>${a.resume ? `<p>${esc(a.resume)}</p>` : ''}<small>${esc(a.source)} · ${esc(heureParis(a.publieMs))}${(a.actifs || []).length ? ' · ' + esc(a.actifs.join(', ')) : ''}</small></li>`).join('') + '</ul>';
}
export function htmlCorrelations(c, fenetre) {
  const d = c && c[fenetre]; if (!d || !d.actifs.length) return '<p class="mk-vide">Corrélations indisponibles : séries non chargées.</p>';
  const col = r => r == null ? 'transparent' : r >= 0 ? `rgba(87,200,150,${(Math.abs(r) * .75).toFixed(2)})` : `rgba(235,110,110,${(Math.abs(r) * .75).toFixed(2)})`;
  return `<div class="mk-corr-tete"><button type="button" data-fenetre="30" aria-pressed="${fenetre === 30}">30 jours</button><button type="button" data-fenetre="90" aria-pressed="${fenetre === 90}">90 jours</button></div>
    <div class="mk-tableau"><table class="mk-corr"><thead><tr><th></th>${d.actifs.map(a => `<th scope="col">${esc(a.nom)}</th>`).join('')}</tr></thead><tbody>${d.actifs.map((a, i) => `<tr><th scope="row">${esc(a.nom)}</th>${d.matrice[i].map((x, j) => `<td style="background:${col(x.r)}" title="${esc(a.nom)} / ${esc(d.actifs[j].nom)} : ${x.r == null ? 'trop peu de jours communs' : x.r} sur ${x.n == null ? '—' : x.n} jours">${x.r == null ? '<span class="mk-na">n/d</span>' : String(x.r).replace('.', ',')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="mk-prov">Calculé le ${esc(dateFr(d.calculeLe))} sur les données jusqu'au ${esc(d.dernierJour ? dateFr(d.dernierJour) : '?')} · sources : Kraken (or PAXG, Bitcoin), FRED (US100, dollar large, taux réel), Frankfurter/BCE (franc suisse).</p><p class="mk-note">${esc(d.note)} Le taux réel est mesuré en variation quotidienne, les autres en rendement logarithmique. Corrélation n'est pas causalité.</p>`;
}
export function htmlSources(sources) {
  const lib = { ok: 'OK', lent: 'lent', en_panne: 'en panne', non_testee: 'pas encore appelée', desactivee: 'désactivée par défaut' };
  return `<div class="mk-tableau"><table class="mk-src"><thead><tr><th>Source</th><th>État</th><th>Dernier succès</th><th>Âge</th><th>Fréquence</th><th>Limites · conditions</th></tr></thead><tbody>${sources.map(s => `<tr data-source="${esc(s.id)}" class="mk-st-${esc(s.statut)}"><th scope="row">${esc(s.nom)}${s.cle ? ' <small>(clé gratuite ' + esc(s.cle) + ')</small>' : ''}</th><td><span class="mk-etat mk-e-${esc(s.statut)}">${esc(lib[s.statut] || s.statut)}</span>${s.derniereErreur && s.statut === 'en_panne' ? `<small class="mk-err">${esc(s.derniereErreur)}</small>` : ''}${s.tempsMs ? `<small>${s.tempsMs} ms</small>` : ''}</td><td>${s.dernierSucces ? esc(new Date(s.dernierSucces).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })) : 'jamais'}</td><td>${esc(s.retardTexte)}</td><td>${esc(s.frequence)}</td><td><small>${esc(s.limite)} · ${esc(s.conditions)}</small></td></tr>`).join('')}</tbody></table></div>`;
}

export function htmlPanneau(p, { fenetre = 90, horsLigne = null } = {}) {
  if (!p) return '<p class="mk-avert">Aucune donnée.</p>';
  const entete = horsLigne ? `<p class="mk-avert" role="status">Hors ligne : serveur de données injoignable. Dernières valeurs enregistrées sur cet appareil, enregistrées le ${esc(new Date(horsLigne.cacheLe).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }))} (${esc(horsLigne.raison)}).</p>` : '';
  let h = entete;
  if (p.id === 'sources') return h + htmlSources(p.sources || []);
  if (p.id === 'correlations') return h + htmlCorrelations(p.correlations, fenetre);
  if (p.id === 'calendrier') return h + htmlEvenements(p.evenements, p.nonVerifie) + (p.erreurs && p.erreurs.length ? `<p class="mk-note">Sources : ${esc(p.erreurs.join(' · '))}</p>` : '');
  if (p.id === 'actualites') return h + htmlActus(p.actualites) + (p.erreurs && p.erreurs.length ? `<p class="mk-note">${esc(p.erreurs.join(' · '))}</p>` : '');
  for (const s of p.sections || []) h += `<section class="mk-section"><h3>${esc(s.titre)}</h3><div class="mk-grille">${s.mesures.map(carte).join('')}</div></section>`;
  if (p.evenements) h += `<section class="mk-section"><h3>Prochains événements officiels</h3>${htmlEvenements(p.evenements, p.nonVerifie)}</section>`;
  if (p.actualites) h += `<section class="mk-section"><h3>Actualités</h3>${htmlActus(p.actualites.slice(0, 6))}</section>`;
  if (p.absent && p.absent.length) h += `<section class="mk-section"><h3>Non disponible gratuitement</h3><ul class="mk-liste">${p.absent.map(a => `<li>${esc(a)}</li>`).join('')}</ul></section>`;
  if (p.erreurs && p.erreurs.length) h += `<p class="mk-note mk-erreurs">Sources en difficulté : ${esc(p.erreurs.join(' · '))}</p>`;
  return h;
}
