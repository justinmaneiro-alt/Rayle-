/* Onglets V4 de la fenêtre « Agent » : Liquidité, Équipe, Occasions manquées, Données (V4, phase 9). Source : le service PC (routes locales /__agent/… et /__flux/…) ; sans lui, chaque onglet le dit
   clairement (jamais de chiffre inventé). Aucun bouton « lancer » ni ordre : lecture, et deux réglages prudents (alertes « observation », rapport du matin). Rayle reste la seule voix. */
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fr = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
const quand = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
import { filtrerProfil, PROFIL_45_RR2 } from '../../../../strategies/pistes.js';
export const VUES_V4 = Object.freeze(['pistes', 'liquidite', 'equipe', 'occasions', 'donnees']);
export const LIBELLES_V4 = Object.freeze({ pistes: 'Meilleures pistes', liquidite: 'Liquidité', equipe: 'Équipe', occasions: 'Occasions manquées', donnees: 'Données' });
const json = async (u, ms = 8000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { cache: 'no-store', signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); } };
const indispo = raison => '<p class="av4-indispo">Le service du PC ne répond pas (' + esc(raison) + '). Cet onglet lit ce que Kepler enregistre sur ton PC : lance-le (node agent-pc/service.mjs) ou ouvre Rayle depuis l’application PC.</p>';
const carte = (titre, corps, cls = '') => '<section class="av4-carte ' + cls + '"><h4>' + esc(titre) + '</h4>' + corps + '</section>';
const lignes = l => '<ul class="av4-l">' + (l || []).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';

/* ── rendus purs (testés) ── */
const pct = x => (x == null || !Number.isFinite(x) ? '—' : Math.round(x * 100) + ' %');
const R = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('.', ',') + ' R');
const mois = x => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(1).replace('.', ','));
/* Une piste = une carte : statut honnête, chiffres du profil gain / risque, preuve manquante en clair, suivi en direct (pépinière). */
export function htmlPiste(p) {
  const etiquette = { prouvee: 'prouvee', validee_backtest: 'validee', prometteuse: 'prometteuse', decevante: 'decevante' }[p.statut.code] || 'decevante';
  const manque = p.manque && p.manque.length ? '<h5>Preuve manquante</h5><ul class="av4-l">' + p.manque.map(m => '<li>' + esc(m.texte) + '</li>').join('') + '</ul>' : '<p class="av4-doux">Rien ne manque dans les critères mesurés ici.</p>';
  const pep = p.enPepiniere && p.pepiniere ? '<p class="av4-doux">En simulation sur le marché réel (pépinière) : <b>' + p.pepiniere.trades + '</b> trade(s) en ' + p.pepiniere.jours + ' jour(s)' + (p.pepiniere.moyenne != null ? ', moyenne ' + R(p.pepiniere.moyenne) : '') + (p.pepiniere.decision ? ' · test séquentiel : ' + esc(p.pepiniere.decision) : '') + '.</p>' : (p.statut.code === 'prometteuse' ? '<p class="av4-doux">Pas encore en pépinière : elle y entre automatiquement (paper trading, aucun ordre).</p>' : '');
  return '<section class="av4-carte av4-piste" data-statut="' + etiquette + '"><h4>' + esc(p.nom) + ' · ' + esc(p.paire) + '</h4><p><span class="av4-tag" data-s="' + etiquette + '">' + esc(p.statut.texte) + '</span></p>'
    + '<table class="av4-tab"><tbody><tr><th>Réussite</th><td>' + pct(p.tauxReussite) + '</td><th>Gain moyen / perte moyenne</th><td>' + (p.rrMoyen == null ? '—' : p.rrMoyen.toFixed(1).replace('.', ',')) + '</td></tr>'
    + '<tr><th>Réussite d’équilibre</th><td>' + pct(p.tauxEquilibre) + '</td><th>Frais</th><td>' + R(p.coutMoyenR) + ' par trade</td></tr>'
    + '<tr><th>Avant frais</th><td>' + R(p.esperanceAvant) + '</td><th>Après frais</th><td><b>' + R(p.esperanceApres) + '</b></td></tr>'
    + '<tr><th>Trades hors échantillon</th><td>' + p.trades + ' / 150</td><th>Par mois</th><td>' + mois(p.tradesParMois) + '</td></tr>'
    + '<tr><th>Creux simulé</th><td>' + (p.ddPct == null ? '—' : p.ddPct.toFixed(1).replace('.', ',') + ' % (limite 6 %)') + '</td><th>Confiance (borne basse)</th><td>' + R(p.bootstrapBas) + '</td></tr></tbody></table>' + manque + pep + '</section>';
}
export function htmlPistes(d, profil = PROFIL_45_RR2) {
  if (!d || d.existe === false) return '<p class="av4-doux">Kepler n’a pas encore tourné sur ce PC : aucune piste à montrer.</p>';
  const l = [];
  l.push('<div class="av4-garde">Ces pistes sont des <b>résultats de recherche</b>, pas des promesses : une piste « prometteuse » est une raison de la regarder en direct, jamais une stratégie validée. Les critères de validation ne changent pas. Aucun ordre n’est passé.</div>');
  l.push('<section class="av4-carte"><h4>Frais et recherche</h4><p><b>' + esc(d.frais.phrase) + '</b></p><p class="av4-doux">' + esc(d.couts || '') + '</p><p class="av4-doux">' + (d.variantes != null ? d.variantes.toLocaleString('fr-FR') + ' variantes testées en tout (le compteur ne baisse jamais). ' : '') + (d.recherche && d.recherche.niveaux ? 'Niveaux : ' + d.recherche.niveaux.map(n => n.id + ' (' + n.faits + '/' + n.total + ')').join(' · ') + '. ' : '') + 'Règle des tests multiples : <b>' + (d.voieCorrigee ? 'CORRIGÉE (voie à valider par Justin, activée)' : 'ancienne (tous les essais comptés — règle par défaut)') + '</b>.</p>'
    + (d.recherche && d.recherche.attente && d.recherche.attente.attente ? '<h5>Kepler attend, et sait quoi</h5><ul class="av4-l">' + d.recherche.attente.lignes.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' + (d.recherche.attente.reprise ? '<p class="av4-doux">' + esc(d.recherche.attente.reprise.texte) + '.</p>' : '') : '') + '</section>');
  l.push('<h4 class="av4-sous">Les ' + d.pistes.length + ' meilleures pistes</h4>' + (d.pistes.length ? d.pistes.map(htmlPiste).join('') : '<p class="av4-doux">Aucune piste chiffrée pour l’instant (la recherche n’a pas encore produit assez de trades).</p>'));
  const f = filtrerProfil(d.toutes || [], profil);
  l.push('<section class="av4-carte"><h4>Filtre de profil</h4><p class="av4-doux">Que reste-t-il avec un profil « environ ' + Math.round((profil.tauxMin + profil.tauxMax) / 2 * 100) + ' % de réussite, gain / risque d’au moins ' + String(profil.rrMin).replace('.', ',') + ' » ?</p>'
    + '<p class="av4-profil">Réussite de <input type="number" data-av4-profil="tauxMin" min="5" max="95" step="1" value="' + Math.round(profil.tauxMin * 100) + '"> % à <input type="number" data-av4-profil="tauxMax" min="5" max="95" step="1" value="' + Math.round(profil.tauxMax * 100) + '"> % · rapport gain / risque ≥ <input type="number" data-av4-profil="rrMin" min="0.5" max="10" step="0.5" value="' + profil.rrMin + '"></p>'
    + (f.length ? '<ul class="av4-l">' + f.slice(0, 10).map(p => '<li><b>' + esc(p.nom) + ' · ' + esc(p.paire) + '</b> : ' + pct(p.tauxReussite) + ' de réussite, gain / perte ' + p.rrMoyen.toFixed(1).replace('.', ',') + ', ' + R(p.esperanceApres) + ' par trade après frais sur ' + p.trades + ' trades — <i>' + esc(p.honnetete) + '</i></li>').join('') + '</ul>' : '<p class="av4-doux">Aucune piste ne ressemble à ce profil pour l’instant.</p>') + '</section>');
  return l.join('');
}

export function htmlLiquidite(a, statut) {
  const ou = a && a.aimants && a.aimants.resume ? lignes(a.aimants.resume) : '<p class="av4-doux">Pas de lecture disponible pour le moment (carnet en cours d’enregistrement ?).</p>';
  const avert = a && a.avertissements ? '<ul class="av4-avert">' + a.avertissements.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
  return carte('Carte de liquidité', '<p>Le carnet d’ordres de Kraken et de Binance, enregistré en continu sur ton PC : murs, bulles de transactions, profil de volume, relecture du passé.</p><p><button type="button" class="av4-btn" data-av4-carte="BTC">Ouvrir la carte de liquidité · Bitcoin</button> <button type="button" class="av4-btn" data-av4-carte="SOL">Solana</button> <button type="button" class="av4-btn" data-av4-carte="DOGE">Dogecoin</button></p>')
    + carte('Où va le marché ? (Bitcoin)', ou + avert + '<p class="av4-doux">Hypothèse de lecture, jamais une promesse ni un ordre.</p>')
    + carte('Preuve', '<p>' + esc(statut && statut.phrase || 'Carnet : jamais démarré.') + '</p><p class="av4-doux">Historique des trades : des années (aggTrades) ; carnet d’ordres : depuis le début de l’enregistrement. Les idées fondées sur le carnet se prouvent avec des semaines (14 jours au moins), pas aujourd’hui.</p>');
}
export function htmlEquipe(d) {
  const e = d.equipe, role = (nom, r) => carte(nom, '<p class="av4-role">' + esc(r.role) + '</p>' + lignes(r.lignes), 'av4-role-carte');
  const hy = (d.hypotheses || []).slice(0, 12).map(h => '<li><b>' + esc(h.titre) + '</b> <span class="av4-tag" data-s="' + esc(h.statut) + '">' + ({ a_tester: 'à tester', en_test: 'en test', testee: 'testée' }[h.statut] || esc(h.statut)) + '</span><small>' + esc(h.raison) + '</small></li>').join('');
  const p = d.pepiniere, pep = p ? lignes(p.lignes) + '<p class="av4-doux">' + p.actives + ' active(s) · ' + p.acceptees + ' acceptée(s) par le test séquentiel (voie supplémentaire, à valider par Justin) · ' + p.retirees + ' retirée(s) · compteur de comparaisons : ' + p.K + '.</p>' : '';
  const jr = (e.journal || []).map(j => '<li><small>' + quand(j.t) + '</small> ' + esc(j.texte) + '</li>').join('');
  return '<p class="av4-intro">Un seul agent visible : <b>Kepler</b>. Il s’appuie sur trois rôles internes. Le modèle de langage propose et explique ; il ne calcule rien, ne valide rien, ne passe aucun ordre.</p>'
    + '<div class="av4-grille">' + role('Kepler · exécutant', e.kepler) + role('Le Chercheur', e.chercheur) + role('L’Auditeur', e.auditeur) + '</div>'
    + carte('Pépinière live', pep || '<p class="av4-doux">Pas encore de pépinière.</p>')
    + carte('Hypothèses du Chercheur (budget du jour : ' + (e.chercheur.budget ? e.chercheur.budget.restant + ' / ' + e.chercheur.budget.parJour : '—') + ')', hy ? '<ul class="av4-hyp">' + hy + '</ul>' : '<p class="av4-doux">Aucune hypothèse pour l’instant.</p>')
    + carte('Journal de l’équipe', jr ? '<ul class="av4-journal">' + jr + '</ul>' : '<p class="av4-doux">Rien pour l’instant.</p>')
    + (d.rapportQuotidien ? carte('Rapport du matin (' + quand(d.rapportQuotidien.t) + ')', lignes(d.rapportQuotidien.lignes)) : '')
    + '<p class="av4-doux">Réglage : <label><input type="checkbox" data-av4-observation> alertes « Observation (non validé) » sur Telegram (désactivées par défaut ; « observation, pas de preuve statistique »)</label></p>';
}
export function htmlOccasions(d) {
  const o = d.occasions, ex = d.exemples, l = (o.recentes || []).slice(0, 15).map(x => '<li><b>' + quand(x.t) + '</b> ' + esc(x.actif) + ' · ' + (x.sens > 0 ? 'hausse' : 'baisse') + ' de ' + fr(x.ampleurATR) + ' ATR · ' + esc(x.contexte.phase) + ', ' + esc(x.contexte.session) + [x.contexte.absorption && 'absorption', x.contexte.divergence_cvd && 'divergence CVD', x.contexte.balayage_liquidite && 'balayage', x.contexte.flux_persistant && 'flux persistant'].filter(Boolean).map(f => ' · ' + f).join('') + '</li>').join('');
  const e = (ex.recents || []).slice(0, 10).map(x => '<li><b>' + quand(x.t) + '</b> ' + esc(x.actif) + ' · j’aurais ' + (x.sens === 'achat' ? 'acheté' : 'vendu') + ' vers ' + fr(x.prix, 2) + ' · ' + (x.explication ? (x.explication.explique ? 'expliqué par ' + esc(x.explication.par.slice(0, 2).join(', ')) : 'pas expliqué par mes signaux') : 'à analyser') + '</li>').join('');
  return '<div class="av4-garde">' + esc(o.avertissement) + '</div>'
    + carte('Occasions manquées', '<p>' + esc(o.resume) + '</p>' + (l ? '<ul class="av4-journal">' + l + '</ul>' : ''))
    + carte('Tes exemples (« ici j’aurais pris ça »)', '<p>' + esc(ex.phrase) + '</p>' + (e ? '<ul class="av4-journal">' + e + '</ul>' : '') + '<p class="av4-doux">Note-les depuis la carte de liquidité (boutons « J’aurais acheté / vendu ici »), en direct ou en relecture. Ils servent à former des hypothèses, jamais à valider.</p>');
}
export function htmlDonnees(d) {
  const f = d.flux || {}, g = x => (x == null ? '—' : (x / 1024 ** 3).toFixed(2).replace('.', ',') + ' Go'), pc = f.quotaGo && f.octets != null ? Math.min(100, Math.round(f.octets / (f.quotaGo * 1024 ** 3) * 100)) : 0;
  const trous = (f.derniersTrous || []).map(t => '<li><small>' + quand(t.t) + '</small> ' + esc(t.flux || '') + ' — ' + esc(t.raison || '') + '</li>').join('');
  const h = Object.entries(d.historique || {}).map(([k, v]) => '<li><b>' + esc(k) + '</b> : ' + v.jours + ' jours (du ' + esc(v.du) + ' au ' + esc(v.au) + ')</li>').join('');
  return carte('Carnet d’ordres', '<p>' + esc(f.phrase || 'jamais démarré') + '</p><div class="av4-jauge" role="img" aria-label="Quota de disque"><i style="width:' + pc + '%"></i></div><p class="av4-doux">' + g(f.octets) + ' utilisés sur ' + (f.quotaGo || '—') + ' Go · flux prêts : ' + esc(f.fluxPrets || '—') + ' · trous : ' + (f.trous != null ? f.trous : '—') + ' · disque libre : ' + (d.disqueLibreGo != null ? fr(d.disqueLibreGo, 0) + ' Go' : '—') + '</p>' + (trous ? '<h5>Derniers trous (jamais comblés)</h5><ul class="av4-journal">' + trous + '</ul>' : ''))
    + carte('Historique des transactions (gratuit)', h ? '<ul class="av4-l">' + h + '</ul><p class="av4-doux">Barres M15 avec empreinte (volume par prix), résumées depuis data.binance.vision. Le carnet complet n’existe pas en historique gratuit.</p>' : '<p class="av4-doux">Pas encore installé : node agent-pc/installer-flux.mjs --etape 5</p>')
    + (d.bougies ? carte('Bougies M15', '<ul class="av4-l">' + (d.bougies.paires || []).map(p => '<li><b>' + esc(p.paire) + '</b> : ' + (p.n || 0).toLocaleString('fr-FR') + ' bougies jusqu’au ' + esc(p.jourFin) + ' · ' + (p.trous || 0) + ' trou(s)</li>').join('') + '</ul>') : '');
}

export function creerPanneauxV4({ conteneur, ouvrirCarte = actif => import('../liquidite/fenetre-liquidite.js').then(m => m.ouvrirCarte({ actif })) }) {
  const racine = document.createElement('div'); racine.className = 'av4'; conteneur.appendChild(racine); let vue = null, minuteur = 0, detruit = false;
  let cachePistes = null, profil = { ...PROFIL_45_RR2 };
  async function rendre() {
    if (detruit || !vue) return; const v = vue;
    try {
      let html = '';
      if (v === 'liquidite') { let a = null, s = null; try { s = await json('/__flux/statut', 4000); } catch (e) { /* absent */ } try { const j = await json('/__flux/analyse?actif=BTC&venue=binance-spot&minutes=20', 20000); a = j.analyse; } catch (e) { /* absent */ } html = s ? htmlLiquidite(a, s) : indispo('/__flux/statut') + htmlLiquidite(null, null); }
      else if (v === 'pistes') { cachePistes = await json('/__agent/pistes'); html = htmlPistes(cachePistes, profil); }
      else if (v === 'equipe') html = htmlEquipe(await json('/__agent/equipe'));
      else if (v === 'occasions') html = htmlOccasions(await json('/__agent/occasions'));
      else html = htmlDonnees(await json('/__agent/donnees'));
      if (vue !== v || detruit) return; racine.innerHTML = '<h3 class="av4-titre">' + esc(LIBELLES_V4[v]) + '</h3>' + html;
    } catch (e) { if (vue === v && !detruit) racine.innerHTML = '<h3 class="av4-titre">' + esc(LIBELLES_V4[v]) + '</h3>' + indispo(String(e.message || e).slice(0, 60)); }
  }
  racine.addEventListener('change', ev => { const c = ev.target.closest && ev.target.closest('[data-av4-profil]'); if (!c || !cachePistes) return; const k = c.dataset.av4Profil, x = Number(c.value); if (!Number.isFinite(x)) return; profil = { ...profil, nom: 'profil choisi', [k]: k === 'rrMin' ? x : x / 100 }; racine.innerHTML = '<h3 class="av4-titre">' + esc(LIBELLES_V4.pistes) + '</h3>' + htmlPistes(cachePistes, profil); });
  racine.addEventListener('click', ev => { const b = ev.target.closest('[data-av4-carte]'); if (b) ouvrirCarte(b.dataset.av4Carte).catch(() => {}); });
  racine.addEventListener('change', async ev => { if (ev.target.matches('[data-av4-observation]')) { try { await fetch('/__agent/commande', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1' }, body: JSON.stringify({ type: 'observation', valeur: ev.target.checked }) }); } catch (e) { /* service absent */ } } });
  return { montrer(v) { vue = v; racine.innerHTML = '<p class="av4-doux">Chargement…</p>'; rendre(); clearInterval(minuteur); minuteur = setInterval(rendre, 20000); }, cacher() { vue = null; clearInterval(minuteur); }, racine, detruire() { detruit = true; clearInterval(minuteur); racine.remove(); } };
}
