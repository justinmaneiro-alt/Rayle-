/* Onglet « Actualité » = le RÉSEAU D'INFORMATION de Rayle : À LA UNE (les 5 infos les plus importantes des dernières 24 h), fil complet noté et filtrable par actif et par score minimum, fils d'histoire en chronologie,
   onglet Personnalités (une ligne par personne suivie), onglet Sources et réglages (état de chaque source, délai moyen, personnalités modifiables, voix et mode nuit). Au clic : page détail avec le score expliqué,
   la réaction réelle du marché, les précédents tirés de notre base, des scénarios (hypothèses) et « Rayle, explique-moi ». Lecture seule : aucun ordre. */
import { lireLS, ecrireLS } from '../commun/ui.js';
import { lireReseau, lirePersonnes, ecrirePersonnes, lireReglages, ecrireReglages, envoyerSeuilServeur, modeNuit } from '../reseau/client.js';
import { htmlALaUne, htmlFil, htmlPersonnes, htmlSources, htmlDetailCarte, esc } from '../reseau/rendu.js';
import { precedentDe } from '../reseau/reaction.js';
import { texteExplication, promptScenarios, phraseScenariosRegles, nomSujet, nomPers, quoiDeNeuf } from '../reseau/textes.js';
import { PERSONNES, TOUS, NOMS_COURTS } from '../reseau/config.js';
import { expliquerImpact } from './impact.js';
import { demanderIA, parler } from '../commun/ia.js';

const SOUS = [['fil', 'Fil'], ['personnes', 'Personnalités'], ['sources', 'Sources et réglages']];
export function monter(zone) {
  const E = { etat: null, meta: null, sous: lireLS('tp_actu_sous', 'fil'), actif: lireLS('tp_actu_actif2', ''), min: lireLS('tp_actu_min', 0), detail: null, personnes: PERSONNES, seq: 0, minuteur: null };
  zone.innerHTML = `<div class="tp-chips" role="tablist" aria-label="Actualité">${SOUS.map(([k, n]) => `<button type="button" role="tab" data-sous="${k}">${n}</button>`).join('')}</div><div data-corps-actu><p class="tp-att" role="status">Lecture du réseau d’information…</p></div>`;
  const corps = zone.querySelector('[data-corps-actu]'), now = () => Date.now();
  const marquer = () => zone.querySelectorAll('[data-sous]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.sous === E.sous && !E.detail)));
  const pastille = () => (E.meta ? `<p class="tp-doux tp-pied-actu">${E.etat.cartes.length} infos sur 72 h · ${E.etat.fils.length} fils · mis à jour ${esc(new Date(E.etat.t || E.meta.t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }))} · ${esc(E.meta.origine)}${E.meta.copie ? ' · copie gardée sur l’appareil' : ''}</p>` : '');
  function dessiner() {
    marquer(); if (!E.etat) return;
    if (E.detail) { const c = E.etat.cartes.find(x => x.id === E.detail); if (c) { corps.innerHTML = detail(c); return; } E.detail = null; }
    if (E.sous === 'personnes') { corps.innerHTML = `<p class="tp-doux">Une ligne par personne suivie : sa dernière déclaration, l’heure, l’impact mesuré sur le marché.</p>${htmlPersonnes(E.etat, now(), E.personnes)}${pastille()}`; return; }
    if (E.sous === 'sources') { corps.innerHTML = reglagesHtml() + `<h3>État des sources</h3>${htmlSources(E.etat, now())}${pastille()}`; return; }
    corps.innerHTML = `${E.actif || E.min ? '' : htmlALaUne(E.etat, now(), E.personnes)}
      <div class="tp-filtres" role="group" aria-label="Filtres"><div class="tp-groupe"><button type="button" data-act="" aria-pressed="${!E.actif}">Tous</button>${TOUS.map(a => `<button type="button" data-act="${a}" aria-pressed="${E.actif === a}">${esc(NOMS_COURTS[a])}</button>`).join('')}</div>
      <label class="tp-curseur">Score minimum <b data-min-val>${E.min}</b> <input type="range" min="0" max="100" step="5" value="${E.min}" data-min aria-label="Score minimum"></label></div>
      <h3>Le fil <small>heure de Paris, plus récent en haut</small></h3>${htmlFil(E.etat, { actif: E.actif || null, scoreMin: E.min, now: now(), personnes: E.personnes })}${pastille()}`;
  }
  const regle = () => lireReglages();
  function reglagesHtml() {
    const r = regle(), P = E.personnes;
    return `<h3>Alertes et voix</h3><div class="tp-reglages"><label><input type="checkbox" data-r-voix ${r.voix ? 'checked' : ''}> Rayle annonce à la voix les infos importantes</label>
      <label>Score minimum de l’alerte <input type="number" min="50" max="100" step="5" value="${r.seuilVoix}" data-r-seuil> <small>(voix et Telegram ; défaut 80 ; pas plus d’une alerte par fil toutes les 30 min, sauf revirement)</small></label>
      <label><input type="checkbox" data-r-nuit ${r.nuit.actif ? 'checked' : ''}> Mode nuit : pas de voix de <input type="number" min="0" max="23" value="${r.nuit.de}" data-r-de> h à <input type="number" min="0" max="23" value="${r.nuit.a}" data-r-a> h (heure de Paris), Telegram seulement${modeNuit(r) ? ' <b>(actif en ce moment)</b>' : ''}</label></div>
      <h3>Personnalités suivies</h3><table class="tp-tab-pers"><thead><tr><th>Nom</th><th>Poids (1 à 5)</th><th>Actifs</th><th></th></tr></thead><tbody>${P.map(p => `<tr><td>${esc(p.nom)}<br><small>${esc(p.role || '')}</small></td><td><input type="number" min="1" max="5" value="${p.poids}" data-p-poids="${esc(p.id)}" aria-label="Poids de ${esc(p.nom)}"></td><td>${p.actifs === 'tous' ? 'tous' : esc(p.actifs.map(a => NOMS_COURTS[a]).join(', '))}</td><td><button type="button" data-p-retirer="${esc(p.id)}">Retirer</button></td></tr>`).join('')}</tbody></table>
      <form data-p-ajout class="tp-form-ajout"><b>Ajouter une personne</b> <input name="nom" placeholder="Nom (ex. Jamie Dimon)" required maxlength="60"> <input name="alias" placeholder="Mots qui la repèrent, séparés par des virgules" maxlength="120"> <input name="poids" type="number" min="1" max="5" value="3" aria-label="Poids"> <select name="actifs" multiple size="3" aria-label="Actifs liés">${TOUS.map(a => `<option value="${a}">${esc(NOMS_COURTS[a])}</option>`).join('')}</select> <button type="submit">Ajouter</button></form>
      <p class="tp-doux" data-p-msg role="status">${P === PERSONNES ? 'Liste par défaut. Les modifications sont enregistrées dans ton Worker (fenêtre Portefeuille configurée) et appliquées aux lectures suivantes.' : 'Liste enregistrée dans ton Worker.'}</p>`;
  }
  function detail(c) {
    const prec = c.personne && c.sujets.length ? c.actifs.slice(0, 2).map(a => precedentDe(E.etat.memoire, c, a, { nomPersonne: p => nomPers(p, E.personnes), nomSujet })) : [];
    const scen = lireLS('tp_scen_' + c.id, null); E.ctx = { c, prec };
    return htmlDetailCarte(c, { etat: E.etat, now: now(), precedents: prec, regles: phraseScenariosRegles(c, expliquerImpact), scenariosIA: scen && scen.texte, personnes: E.personnes });
  }
  const ouvrir = id => { E.detail = id; dessiner(); corps.scrollIntoView && corps.scrollIntoView({ block: 'start' }); };
  zone.addEventListener('click', async e => {
    const t = e.target, s = t.closest('[data-sous]'); if (s) { E.sous = s.dataset.sous; E.detail = null; ecrireLS('tp_actu_sous', E.sous); dessiner(); return; }
    const o = t.closest('[data-ouvrir]'); if (o) { e.preventDefault(); ouvrir(o.dataset.ouvrir); return; }
    const f = t.closest('[data-fil]'); if (f) { e.preventDefault(); const c = E.etat.cartes.find(x => x.fil === f.dataset.fil); if (c) ouvrir(c.id); return; }
    const sc = t.closest('[data-score]'); if (sc) { ouvrir(sc.dataset.score); return; }
    if (t.closest('[data-retour]')) { E.detail = null; dessiner(); return; }
    const a = t.closest('[data-act]'); if (a) { E.actif = a.dataset.act; ecrireLS('tp_actu_actif2', E.actif); dessiner(); return; }
    if (t.closest('[data-explique]') && E.ctx) { parler(texteExplication(E.ctx.c, { precedents: E.ctx.prec, personnes: E.personnes })); return; }
    if (t.closest('[data-scenarios]') && E.ctx) {
      const b = t.closest('[data-scenarios]'), msg = corps.querySelector('[data-ia-etat]'); b.disabled = true; if (msg) msg.textContent = 'Rayle réfléchit…';
      try { const r = await demanderIA(promptScenarios(E.ctx.c, { precedents: E.ctx.prec }), { contexte: 'Hypothèses de lecture seulement, jamais un ordre ni une probabilité chiffrée.' }); ecrireLS('tp_scen_' + E.ctx.c.id, { texte: r.texte, t: now() }); dessiner(); }
      catch (er) { if (msg) msg.textContent = 'IA indisponible : ' + (er && er.message || er) + '. Les lectures par règles ci-dessous restent valables.'; b.disabled = false; } return;
    }
    const ret = t.closest('[data-p-retirer]'); if (ret) { await majPersonnes(E.personnes.filter(p => p.id !== ret.dataset.pRetirer)); return; }
  });
  zone.addEventListener('input', e => { const m = e.target.closest('[data-min]'); if (m) { E.min = +m.value; ecrireLS('tp_actu_min', E.min); const v = zone.querySelector('[data-min-val]'); if (v) v.textContent = E.min; clearTimeout(E.tm); E.tm = setTimeout(dessiner, 150); } });
  zone.addEventListener('change', async e => {
    const t = e.target, r = regle(); let ch = false;
    if (t.matches('[data-r-voix]')) { r.voix = t.checked; ch = true; } else if (t.matches('[data-r-seuil]')) { r.seuilVoix = Math.min(100, Math.max(50, +t.value || 80)); ch = true; envoyerSeuilServeur(r.seuilVoix); }
    else if (t.matches('[data-r-nuit]')) { r.nuit.actif = t.checked; ch = true; } else if (t.matches('[data-r-de]')) { r.nuit.de = Math.min(23, Math.max(0, +t.value || 0)); ch = true; } else if (t.matches('[data-r-a]')) { r.nuit.a = Math.min(23, Math.max(0, +t.value || 0)); ch = true; }
    if (ch) { ecrireReglages(r); return; }
    const pp = t.closest('[data-p-poids]'); if (pp) await majPersonnes(E.personnes.map(p => (p.id === pp.dataset.pPoids ? { ...p, poids: Math.min(5, Math.max(1, Math.round(+pp.value) || p.poids)) } : p)));
  });
  zone.addEventListener('submit', async e => {
    const f = e.target.closest('[data-p-ajout]'); if (!f) return; e.preventDefault(); const d = new FormData(f), nom = String(d.get('nom') || '').trim(); if (!nom) return;
    const actifs = [...f.querySelector('[name=actifs]').selectedOptions].map(o => o.value), id = nom.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'perso';
    const alias = String(d.get('alias') || nom).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    await majPersonnes([...E.personnes.filter(p => p.id !== id), { id, nom, court: nom.split(' ').slice(-1)[0], role: 'ajoutée par toi', poids: Math.min(5, Math.max(1, +d.get('poids') || 3)), actifs: actifs.length ? actifs : 'tous', alias, requete: nom }]);
  });
  async function majPersonnes(L) {
    const msg = () => corps.querySelector('[data-p-msg]');
    try { E.personnes = await ecrirePersonnes(L); dessiner(); const m = msg(); if (m) m.textContent = 'Enregistré dans ton Worker : appliqué aux prochaines lectures.'; }
    catch (er) { const m = msg(); if (m) m.textContent = 'Impossible d’enregistrer : ' + (er && er.message || er); }
  }
  async function charger(silencieux) {
    const n = ++E.seq;
    try { const r = await lireReseau(); if (n !== E.seq) return; E.etat = r.donnees; E.meta = { t: r.t, origine: r.origine, copie: false }; if (!silencieux || !E.detail) dessiner(); }
    catch (er) { if (!E.etat) corps.innerHTML = `<p class="tp-panne" role="alert">Réseau d’information indisponible : ${esc(er && er.message || er)} <button type="button" data-recharger>Réessayer</button></p>`; }
  }
  zone.addEventListener('click', e => { if (e.target.closest('[data-recharger]')) { corps.innerHTML = '<p class="tp-att" role="status">Lecture…</p>'; charger(false); } });
  lirePersonnes().then(P => { if (P) { E.personnes = P; if (E.sous === 'sources') dessiner(); } }).catch(() => {});
  marquer(); charger(false); E.minuteur = setInterval(() => { if (!document.hidden) charger(true); }, 60000);
  const ages = setInterval(() => { if (document.hidden) return; zone.querySelectorAll('[data-age]').forEach(n => { const m = Math.max(0, Math.round((Date.now() - +n.dataset.age) / 60e3)); n.textContent = m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`; }); }, 30000);
  return { resume: () => (E.etat ? quoiDeNeuf(E.etat) : 'Le réseau d’information n’est pas encore chargé.'), detruire() { clearInterval(E.minuteur); clearInterval(ages); E.seq++; } };
}
