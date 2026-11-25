/* ═════════════ RENDU HTML DU RÉSEAU D'INFORMATION ET DES PAGES DÉTAIL (fonctions pures : texte HTML, testées sans navigateur) ═════════════
   Thème Rayle / Jarvis (classes tp-*, voir commun/pro.css), fluide sur téléphone. Tout est une hypothèse de lecture, jamais un signal ni un ordre. */
import { noterCarte, tableauSources, aLaUne, lignesPersonnes } from './etat.js';
import { NOMS_COURTS, NOMS_ACTIFS, TOUS } from './config.js';
import { nomSujet, nomPers, ageParle, heureParisCourte } from './textes.js';
import { sessionEn, plageParis, jourHeureParis } from '../lecture/sessions.js';
import { HORIZONS, COURTS, NOMS } from '../marches/annonce.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lien = u => (/^https?:\/\//.test(u || '') ? esc(u) : '');
export const classeScore = s => (s >= 80 ? 'tp-s-fort' : s >= 60 ? 'tp-s-moyen' : s >= 40 ? 'tp-s-bas' : 'tp-s-nul');
const fr = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const sg = (v, d = 2) => (Number.isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + fr(Math.abs(v), d) + ' %' : '—');
const cls = v => (v > 0 ? 'tp-hausse' : v < 0 ? 'tp-baisse' : 'tp-neutre');
const chipsActifs = L => L.map(a => `<span class="tp-puce">${esc(NOMS_COURTS[a] || COURTS[a] || a)}</span>`).join(' ');

export function htmlDetailScore(detail, total) {
  return `<table class="tp-tab-score" aria-label="Détail du score"><thead><tr><th>Critère</th><th>Points</th><th>Pourquoi</th></tr></thead><tbody>${detail.map(d => `<tr><td>${esc(d.libelle)}</td><td><b>${d.points}</b> / ${d.max}</td><td>${esc(d.pourquoi)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total (plafonné à 100)</td><td colspan="2"><b>${total}</b> / 100</td></tr></tfoot></table>`;
}
export function htmlCarte(c, { now = Date.now(), fil = null, personnes } = {}) {
  const f = fil ? `<span class="tp-puce tp-puce-fil" title="Fil d’histoire">fil de ${fil.nb} infos${fil.revirement ? ' · REVIREMENT' : ''}</span>` : '';
  return `<li class="tp-carte${c.score >= 80 ? ' tp-carte-fort' : ''}" data-carte="${esc(c.id)}"><div class="tp-carte-tete"><button type="button" class="tp-score ${classeScore(c.score)}" data-score="${esc(c.id)}" aria-label="Score ${c.score} sur 100, voir pourquoi">${c.score}</button><a class="tp-carte-titre" href="#" data-ouvrir="${esc(c.id)}">${esc(c.titre)}</a></div>
    <div class="tp-carte-meta"><time datetime="${new Date(c.t).toISOString()}" title="heure de Paris">${esc(heureParisCourte(c.t))}</time> · <span data-age="${c.t}">${esc(ageParle(c.t, now))}</span> · ${c.sources.length} source${c.sources.length > 1 ? 's' : ''}${c.personne ? ' · ' + esc(nomPers(c.personne, personnes)) : ''} ${chipsActifs(c.actifs)} ${f}</div>
    ${c.reaction && c.reaction.max ? `<div class="tp-react">${esc(c.reaction.texte)}</div>` : ''}</li>`;
}
export function htmlALaUne(etat, now = Date.now(), personnes) {
  const U = aLaUne(etat, now, 5); if (!U.length) return '<p class="tp-doux">Rien d’important dans les dernières 24 heures.</p>';
  return `<section class="tp-une" aria-label="À la une"><h3>À LA UNE <small>les 5 infos les plus importantes des dernières 24 h</small></h3><ol class="tp-liste-une">${U.map(c => htmlCarte(c, { now, fil: c.fil ? etat.fils.find(f => f.id === c.fil) : null, personnes })).join('')}</ol></section>`;
}
export function htmlFil(etat, { actif = null, scoreMin = 0, now = Date.now(), max = 80, personnes } = {}) {
  const L = etat.cartes.filter(c => c.score >= scoreMin && (!actif || c.actifs.includes(actif))).sort((a, b) => b.t - a.t).slice(0, max);
  return L.length ? `<ul class="tp-cartes">${L.map(c => htmlCarte(c, { now, fil: c.fil ? etat.fils.find(f => f.id === c.fil) : null, personnes })).join('')}</ul>` : '<p class="tp-doux">Aucune info à ce niveau pour cet actif.</p>';
}
export function htmlPersonnes(etat, now = Date.now(), personnes) {
  return `<ul class="tp-personnes">${lignesPersonnes(etat, personnes).map(p => `<li class="tp-pers"><div class="tp-pers-tete"><b>${esc(p.nom)}</b> <small>${esc(p.role)} · poids ${p.poids}/5 · ${p.actifs === 'tous' ? 'tous mes actifs' : esc(p.actifs.map(a => NOMS_COURTS[a]).join(', '))}</small></div>
    ${p.derniere ? `<div><a href="#" data-ouvrir="${esc(p.derniere.id)}">${esc(p.derniere.titre)}</a><div class="tp-carte-meta">${esc(heureParisCourte(p.derniere.t))} · ${esc(ageParle(p.derniere.t, now))} · importance <b class="${classeScore(p.derniere.score)}">${p.derniere.score}</b>${p.derniere.reaction ? ' · ' + esc(p.derniere.reaction) : ' · impact mesuré : pas de réaction nette ou pas encore mesurée'}${p.derniere.fil ? ' · <a href="#" data-fil="' + esc(p.derniere.fil) + '">voir le fil</a>' : ''}</div></div>` : '<div class="tp-doux">Aucune déclaration relevée sur 72 heures.</div>'}</li>`).join('')}</ul>`;
}
export function htmlSources(etat, now = Date.now()) {
  const T = tableauSources(etat, now), mn = ms => (ms == null ? '—' : ms < 90e3 ? Math.round(ms / 1000) + ' s' : Math.round(ms / 60e3) + ' min');
  return `<table class="tp-tab-sources" aria-label="État des sources"><thead><tr><th>Source</th><th>État</th><th>Dernière info</th><th>Délai moyen</th></tr></thead><tbody>${T.map(s => `<tr class="${s.etat === 'en ligne' ? '' : 'tp-hors'}"><td>${esc(s.nom)}${s.voie === 'rapide' ? ' <small>(rapide, 2 min)</small>' : ''}</td><td><span class="tp-pastille ${s.etat === 'en ligne' ? 'tp-ok' : s.etat === 'hors ligne' ? 'tp-ko' : 'tp-na'}">${esc(s.etat)}</span>${s.erreur ? ` <small>${esc(s.erreur)}</small>` : ''}${s.verifieeIlYa != null ? ` <small>vérifiée ${esc(ageParle(now - s.verifieeIlYa, now))}</small>` : ''}</td><td>${s.derniere ? esc(heureParisCourte(s.derniere)) + ' <small>' + esc(ageParle(s.derniere, now)) + '</small>' : '—'}</td><td>${esc(mn(s.delaiMoyenMs))}</td></tr>`).join('')}</tbody></table>
    <p class="tp-doux">Le délai moyen est mesuré entre l’heure de publication et notre lecture (voie rapide : toutes les 2 minutes ; les autres : toutes les 10 minutes). X / Twitter n’a pas d’API gratuite : les déclarations passent par les fils de marché et Google News.</p>`;
}

/* ───── page détail d'une info ───── */
export function htmlDetailCarte(c, { etat, now = Date.now(), precedents = [], regles = [], scenariosIA = null, personnes } = {}) {
  const R = noterCarte(c, now, personnes), fil = c.fil ? etat.fils.find(f => f.id === c.fil) : null;
  const rea = c.reaction && c.reaction.actifs && Object.keys(c.reaction.actifs).length ? `<table class="tp-tab-react"><thead><tr><th>Actif</th><th>5 min</th><th>15 min</th><th>60 min</th></tr></thead><tbody>${Object.entries(c.reaction.actifs).map(([a, o]) => `<tr><td>${esc(NOMS_COURTS[a] || a)}</td>${['p5', 'p15', 'p60'].map(k => `<td class="${cls(o[k])}">${o[k] == null ? '—' : sg(o[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
  return `<article class="tp-detail" data-detail="${esc(c.id)}"><button type="button" class="tp-retour" data-retour>← Retour</button>
    <h3>${esc(c.titre)}</h3><p class="tp-carte-meta">${esc(jourHeureParis(c.t))} (heure de Paris) · ${esc(ageParle(c.t, now))} · ${c.personne ? esc(nomPers(c.personne, personnes)) + ' · ' : ''}${c.sujets.length ? 'sujet : ' + esc(nomSujet(c.sujets[0])) + ' · ' : ''}${chipsActifs(c.actifs)}</p>
    ${c.resume ? `<p>${esc(c.resume)}</p>` : ''}
    <h4>Pourquoi ${R.score} ?</h4>${htmlDetailScore(R.detail, R.score)}
    <h4>Sources (${c.sources.length})</h4><ul class="tp-sources-carte">${c.sources.map(s => `<li>${s.lien ? `<a href="${lien(s.lien)}" target="_blank" rel="noopener noreferrer">${esc(s.nom)}</a>` : esc(s.nom)} <small>${esc(heureParisCourte(s.t))}</small></li>`).join('')}</ul>
    <h4>Réaction du marché</h4>${c.reaction && c.reaction.max ? `<p class="tp-react">${esc(c.reaction.texte)}</p>` : `<p class="tp-doux">${esc(c.reaction ? c.reaction.texte : 'pas encore mesurée (5, 15 et 60 minutes après la publication)')}</p>`}${rea}
    ${fil ? `<h4>Fil d’histoire (${fil.nb} infos sur 72 h)${fil.revirement ? ' <span class="tp-puce tp-puce-fil">REVIREMENT</span>' : ''}</h4><ol class="tp-chrono">${fil.chronologie.map(x => `<li class="tp-chrono-${x.type}"><b>${x.type === 'declaration' ? 'Déclaration' : x.type === 'revirement' ? 'REVIREMENT' : 'Suite'}</b> · ${esc(heureParisCourte(x.t))} · <a href="#" data-ouvrir="${esc(x.id)}">${esc(x.titre)}</a> <span class="tp-score-mini ${classeScore(x.score)}">${x.score}</span></li>`).join('')}</ol>` : ''}
    ${precedents.length ? `<h4>Précédents tirés de notre base</h4><ul>${precedents.map(p => `<li>${esc(p.texte)}</li>`).join('')}</ul>` : ''}
    <h4>Qu’est-ce qui pourrait se passer ? <small>(hypothèses, jamais un signal)</small></h4>
    ${scenariosIA ? `<div class="tp-ia">${esc(scenariosIA).replace(/\n/g, '<br>')}</div>` : (c.score >= 70 ? '<p><button type="button" data-scenarios>Demander 2 scénarios à l’IA de Rayle</button> <span class="tp-doux" data-ia-etat></span></p>' : '<p class="tp-doux">Les scénarios par l’IA sont réservés aux infos de score 70 et plus (pour économiser les appels).</p>')}
    ${regles.length ? `<ul class="tp-regles">${regles.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    <p class="tp-actions"><button type="button" data-explique>Rayle, explique-moi</button></p>
    <p class="tp-doux">Lecture seule : aucun ordre. Une hypothèse de lecture à confirmer sur le graphique ; la décision reste la tienne.</p></article>`;
}

/* ───── page détail d'une annonce ───── */
export function htmlDetailAnnonce(e, { note, scenarios, conseil, stats = {}, reactionReelle = null, fiches = {}, now = Date.now(), nomFamille = '' } = {}) {
  const S = sessionEn(e.t), passe = e.t <= now, tabHist = ['or', 'us100', 'us500', 'btc', 'sol', 'petrole', 'dxy'].filter(a => stats[a]);
  const cel = (h, a) => { const x = stats[a].horizons[h]; return !x || x.insuffisant ? `<td class="tp-doux">pas assez de cas${x ? ' (' + x.n + ')' : ''}</td>` : `<td class="${cls(x.moyenne)}">${sg(x.moyenne)} <small>moy. · ±${fr(x.amplitude, 2)} % · ${x.hausses}↑ ${x.baisses}↓ · ${x.n} cas</small></td>`; };
  return `<article class="tp-detail" data-detail-annonce="${esc(e.t)}"><button type="button" class="tp-retour" data-retour>← Retour</button>
    <h3>${esc(e.titre)} <small>${esc(e.pays)} · impact ${esc(e.impact)}</small></h3>
    <p class="tp-carte-meta"><button type="button" class="tp-score ${classeScore(note.score)}" data-score-annonce aria-label="Importance ${note.score} sur 100">${note.score}</button> importance sur 100 · ${esc(jourHeureParis(e.t))} (heure de Paris) · session à ce moment : <b>${esc(S.nom)}</b> (${esc(plageParis(S))})</p>
    <p><b>Ce que c’est, en une phrase :</b> ${esc(nomFamille ? `une annonce de type « ${nomFamille} »` : 'une annonce économique')} qui peut faire bouger ${esc(note.famille === 'petrole' ? 'le pétrole' : 'le dollar, l’or, les indices et la crypto')} selon l’écart avec ce que le marché attendait.</p>
    <table class="tp-tab-cons"><tbody><tr><td>Consensus (prévu)</td><td><b>${esc(e.prevu || 'non publié par la source')}</b></td><td>Précédent</td><td><b>${esc(e.precedent || '—')}</b></td><td>Publié</td><td><b>${esc(e.actuel || (passe ? 'non fourni par la source gratuite' : 'à venir'))}</b></td></tr></tbody></table>
    <h4>Pourquoi ${note.score} ?</h4>${htmlDetailScore(note.detail, note.score)}
    <h4>Réaction historique <small>(mesurée dans notre base, même annonce)</small></h4>
    ${tabHist.length ? `<div class="tp-defil"><table class="tp-tab-hist"><thead><tr><th>Actif</th>${HORIZONS.map(h => `<th>${h[1]}</th>`).join('')}</tr></thead><tbody>${tabHist.map(a => `<tr><td>${esc(COURTS[a])} <small>${stats[a].cas} cas</small></td>${HORIZONS.map(h => cel(h[0], a)).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="tp-doux">Pas assez de cas mesurés dans notre base pour cette annonce (au moins 3 sont nécessaires) : l’historique se construit semaine après semaine.</p>'}
    <h4>Scénarios <small>(tendances habituelles, pas une règle)</small></h4>
    ${scenarios.scenarios.length ? scenarios.scenarios.map(s => `<div class="tp-scenario"><h5>${esc(s.titre)}</h5>${s.texte ? `<p>${esc(s.texte)}</p>` : `<ul>${s.effets.map(x => `<li><b>${esc(x.nom)}</b> ${esc(x.phrase.replace(x.nom + ' ', ''))}${x.niveaux && (x.niveaux.dessus || x.niveaux.dessous) ? `<div class="tp-niveaux">à surveiller : ${[x.niveaux.dessus && 'au-dessus ' + esc(x.niveaux.dessus.nom) + ' ' + fr(x.niveaux.dessus.prix, 2), x.niveaux.dessous && 'en dessous ' + esc(x.niveaux.dessous.nom) + ' ' + fr(x.niveaux.dessous.prix, 2)].filter(Boolean).join(' · ')}</div>` : ''}${x.invalide ? `<div class="tp-invalide">ce qui l’invaliderait : ${esc(x.invalide)}</div>` : ''}</li>`).join('')}</ul>`}</div>`).join('') : `<p class="tp-doux">${esc(scenarios.note)}</p>`}
    <p class="tp-doux">${esc(scenarios.note || '')}</p>
    <h4>Le conseil du copilote</h4><p class="tp-conseil">${esc(conseil)}</p>
    ${passe ? `<h4>Après l’annonce</h4>${reactionReelle && Object.keys(reactionReelle).length ? `<table class="tp-tab-hist"><thead><tr><th>Actif</th>${HORIZONS.map(h => `<th>${h[1]}</th>`).join('')}</tr></thead><tbody>${Object.entries(reactionReelle).map(([a, m]) => `<tr><td>${esc(COURTS[a])}</td>${HORIZONS.map(h => `<td class="${cls(m[h[0]])}">${m[h[0]] == null ? '—' : sg(m[h[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="tp-doux">Mesure réelle sur les bougies M15 ; une case vide = horizon pas encore atteint ou marché fermé.</p>` : '<p class="tp-doux">Réaction réelle pas encore mesurable (attendre la clôture de bougies M15).</p>'}` : ''}
    <p class="tp-actions"><button type="button" data-explique-annonce>Rayle, explique-moi</button></p>
    <p class="tp-doux">Lecture seule : aucun ordre. Je ne dis jamais « vas-y » ni « n’y va pas » : la décision reste la tienne.</p></article>`;
}
export const texteExpliqueAnnonce = (e, note, scenarios, conseil, now = Date.now()) => {
  const S = sessionEn(e.t), P = [`${e.titre}, ${e.pays}, ${new Date(e.t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')} heure de Paris, pendant la session ${S.nom}. Importance ${note.score} sur 100.`];
  P.push(e.prevu ? `Le marché attend ${e.prevu}, le précédent était ${e.precedent || 'non communiqué'}.` : 'Le consensus n’est pas publié par la source.');
  for (const s of scenarios.scenarios.filter(x => x.id !== 'conforme').slice(0, 2)) P.push(`${s.titre.replace(/^Si /, 'Si ').replace(/\s*\(.*\)$/, '')} : ${s.effets.slice(0, 3).map(x => x.phrase.replace(/\s*\(.*$/, '')).join(', ')}.`);
  P.push(conseil); return P.join(' ');
};
