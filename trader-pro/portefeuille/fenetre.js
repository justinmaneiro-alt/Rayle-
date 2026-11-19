/* ═════════════ FENÊTRE « PORTEFEUILLE » (carrousel) : suivi complet de l'historique XTB, coach, synchronisation ═════════════
   Onglets : Vue globale · Transactions · Par actif · Gains et pertes · Positions · Coach · Réglages. Import du .zip XTB tel quel (ou .xlsx, .csv) depuis n'importe quel appareil ;
   fusion sans doublon ; copie locale (hors ligne) + synchronisation par le Worker Portefeuille si configuré. Lecture seule : aucun ordre. Aucune donnée n'est écrite dans le dépôt GitHub. */
import { esc, nf, lireLS, ecrireLS, age, creerVue } from '../commun/ui.js';
import { creerStockageParDefaut } from '../../agent-trading/front/donnees/couche.js';
import { lireActifPro, prixOr, parId as actifsPro } from '../commun/donnees.js';
import { demanderIA, parler } from '../commun/ia.js';
import { lireNombre } from '../commun/nombre.js';
import { idDepuisTicker, CLE_POSITIONS_OUVERTES } from '../commun/xtb.js';
import { creerPortefeuille, lireConn, ecrireConn, CLE_RESUME } from './stockage.js';
import { valeursDuPoint, enrichir, resume, courbes } from './calcul.js';
import { rapportCalcule, texteRapport } from './coach.js';
import * as V from './vues.js';
import { vueSetups } from './vue-setups.js';
import { lireJournal, ecrireJournal, synchroniser as synchroJournal, noterPrise, attribuer, retirer, noterImport } from './journal-stockage.js';
import { creerPrise, fusionner as fusionnerJournal } from './journal-setups.js';

const ONGLETS = [['globale', 'Vue globale'], ['trans', 'Transactions'], ['actif', 'Par actif'], ['ou', 'Gains / pertes'], ['pos', 'Positions'], ['coach', 'Coach'], ['setups', 'Setups'], ['reglages', 'Réglages']];
let instance = null;
export const etat = () => (instance ? instance.etat() : { actif: false });

export async function ouvrir({ racine = document.body, onFermer = () => {} } = {}) {
  if (instance) return instance;
  const el = document.createElement('section'); el.id = 'portefeuille-fenetre'; el.className = 'tp tp-portefeuille'; el.setAttribute('aria-label', 'Portefeuille');
  el.innerHTML = `<header class="tp-tete"><b>Portefeuille</b><span class="tp-sync" data-sync-etat role="status">…</span><label class="tp-import"><input type="file" data-fichier accept=".zip,.xlsx,.xls,.csv,application/zip" multiple hidden><span class="tp-bouton">Importer</span></label><button type="button" class="tp-lire" data-lire aria-label="Lire le rapport à voix haute">🔊</button></header>
    <nav class="tp-nav tp-nav7" role="tablist" aria-label="Sections">${ONGLETS.map(([k, n]) => `<button type="button" role="tab" data-onglet="${k}" aria-selected="false">${esc(n)}</button>`).join('')}</nav>
    <p class="tp-bandeau" data-bandeau hidden role="status"></p><main class="tp-corps" data-corps><div class="tp-onglet" data-zone></div></main>
    <footer class="tp-pied">Lecture seule : aucun ordre. Tes données restent sur tes appareils et dans ton compte Cloudflare, jamais sur GitHub. Le coach décrit ce que montrent tes positions ; il ne prédit rien et ne conseille aucun achat ni vente.</footer>`;
  racine.appendChild(el);
  const $ = s => el.querySelector(s), zone = $('[data-zone]'), corps = $('[data-corps]'), bandeau = $('[data-bandeau]');
  const P = creerPortefeuille({ stockage: creerStockageParDefaut() });
  const S = { L: null, E: [], R: {}, K: {}, vp: {}, coach: null, reglages: {}, capital: 0, onglet: lireLS('tp_pf_onglet', 'globale'), filtre: { actif: null, periode: null, sens: null, resultat: null, texte: '' }, tri: { cle: 'tFerm', sens: -1 }, page: 1, perio: 'jours', actif: null, ferme: false, sync: { texte: '', ok: null }, prix: {}, graphs: [] };
  const graphs = { add: G => { S.graphs.push(G); return G; }, vider: () => { S.graphs.forEach(g => g.detruire()); S.graphs = []; } };
  let tBandeau = null; const dire = (t, erreur = false) => { clearTimeout(tBandeau); bandeau.hidden = !t; bandeau.textContent = t || ''; bandeau.classList.toggle('tp-erreur', !!erreur); if (t) tBandeau = setTimeout(() => { bandeau.hidden = true; }, erreur ? 40000 : 20000); };   // se masque seul (ou au toucher)
  bandeau.addEventListener('click', () => { bandeau.hidden = true; });

  /* ───── calculs ───── */
  function recalculer() {
    const F = S.L.fermees; S.reglages = S.L.reglages || {}; const mesures = valeursDuPoint(F), vp = { ...mesures };
    for (const [t, k] of Object.entries(S.reglages.valeursPoint || {})) if (Number.isFinite(+k) && +k > 0) vp[t] = { ...(vp[t] || { n: 0, ecart: null }), k: +k, manuel: true };
    S.vp = vp; S.E = enrichir(F, vp); S.R = resume(S.E); S.K = courbes(S.L.tresorerie, S.E, +S.reglages.soldeInitial || 0); S.coach = S.E.length >= 10 ? rapportCalcule(S.E) : null; S.capital = Number.isFinite(+S.reglages.capital) && +S.reglages.capital > 0 ? +S.reglages.capital : (+S.reglages.soldeInitial > 0 ? S.K.soldeFinal : null);   // sans capital renseigné : pas de pourcentage inventé
    try { localStorage.setItem(CLE_RESUME, JSON.stringify({ t: (S.L.sync && S.L.sync.dernier) || (S.L.ouvertes && S.L.ouvertes.t) || Date.now(), n: S.R.n || 0, pnl: S.K.perfTotale || 0, discipline: S.coach && S.coach.note ? S.coach.note.note : null })); } catch (e) { /* miniature facultative */ }
    ecrireLS(CLE_POSITIONS_OUVERTES, (S.L.ouvertes.positions || []).map(p => ({ id: p.id, ticker: p.ticker, sens: p.sens, volume: p.volume, valeur: p.valeur, prixOuv: p.prixOuv, stopLoss: p.sl })));
  }
  function majSync() {
    const e = $('[data-sync-etat]'), c = lireConn(), s = S.L && S.L.sync;
    if (!c) { e.textContent = 'sur cet appareil seulement'; e.className = 'tp-sync tp-sync-local'; e.title = 'Worker Portefeuille non configuré (Réglages)'; return; }
    if (S.sync.ok === false) { e.textContent = 'synchro : erreur'; e.className = 'tp-sync tp-sync-ko'; e.title = S.sync.texte; return; }
    const att = s && s.enAttente ? s.enAttente.fermees.length + s.enAttente.tresorerie.length : 0;
    e.textContent = att ? att + ' ligne(s) à envoyer' : s && s.dernier ? 'synchronisé ' + age(s.dernier) : 'synchro en cours…'; e.className = 'tp-sync ' + (att ? 'tp-sync-att' : 'tp-sync-ok'); e.title = S.sync.texte || '';
  }
  async function synchroniser(silencieux = true) {
    if (!lireConn()) { majSync(); return; } $('[data-sync-etat]').textContent = 'synchronisation…';
    const r = await P.synchroniser(); S.sync = { ok: r.ok, texte: r.erreur || '' }; if (r.ok) { S.L = await P.charger(); recalculer(); if (S.onglet !== 'reglages' || !silencieux) afficher(); } else if (!silencieux) dire('Synchronisation impossible : ' + r.erreur, true); majSync();
  }

  /* ───── affichage ───── */
  function afficher() {
    if (S.ferme) return; graphs.vider(); clearInterval(S.minuteurPos);
    el.querySelectorAll('[data-onglet]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.onglet === S.onglet)));
    if (!S.L.fermees.length && S.onglet !== 'reglages' && S.onglet !== 'setups') { zone.innerHTML = `<article class="tp-carte tp-vide"><h3>Importer mon historique XTB</h3><p>Dans xStation : <b>Historique du compte → Exporter</b>, puis choisissez ici le fichier <b>.zip tel quel</b> (ou le .xlsx / .csv qu’il contient). Vous pouvez le refaire tous les un ou deux jours, depuis n’importe quel appareil : seules les nouvelles transactions sont ajoutées.</p><p><label class="tp-import"><input type="file" data-fichier accept=".zip,.xlsx,.xls,.csv,application/zip" multiple hidden><span class="tp-bouton">Choisir le fichier</span></label></p><p class="tp-doux">Le fichier est lu sur cet appareil ; seules les transactions (pas le numéro de compte) sont gardées.</p></article>`; return; }
    const f = { setups: () => { S.J = lireJournal(); S.synthese = vueSetups(S, zone); }, globale: () => V.vueGlobale(S, zone, graphs), trans: () => V.vueTransactions(S, zone), actif: () => V.vueActif(S, zone, graphs), ou: () => V.vueOu(S, zone), pos: () => { V.vuePositions(S, zone, S.prix); chargerPrix(); S.minuteurPos = setInterval(chargerPrix, 30000); }, coach: () => V.vueCoach(S, zone, graphs), reglages: () => V.vueReglages(S, zone, lireConn()) }[S.onglet];
    try { const r = f(); if (r && r.catch) r.catch(e => { zone.innerHTML = `<p class="tp-panne" role="alert">Affichage impossible : ${esc(e && e.message || e)}</p>`; }); } catch (e) { zone.innerHTML = `<p class="tp-panne" role="alert">Affichage impossible : ${esc(e && e.message || e)}</p>`; console.warn('[pf]', e); }
  }
  /* prix en direct des positions ouvertes : l'or par le prix unique de l'appli, les autres par les instantanés du robot (différés) */
  async function chargerPrix() {
    if (S.ferme || document.hidden || S.onglet !== 'pos') return; const O = (S.L.ouvertes.positions || []), prix = {};
    await Promise.all([...new Set(O.map(p => p.ticker))].map(async t => { const id = idDepuisTicker(t); if (!id) return; try { if (id === 'XAUUSD') { const p = await prixOr(); if (p) prix[t] = p.prix; } else { const k = { US100: 'us100', US500: 'us500', BTC: 'btc', SOL: 'sol', DXY: 'dxy', EURUSD: 'eurusd' }[id]; if (k) { const r = await lireActifPro(k, { delai: 6000 }); if (Number.isFinite(r.donnees.prix)) prix[t] = r.donnees.prix; } } } catch (e) { /* prix du fichier */ } }));
    if (S.ferme || S.onglet !== 'pos') return; S.prix = prix; V.vuePositions(S, zone, prix);
  }

  /* ───── import ───── */
  async function importerFichiers(fichiers) {
    if (!fichiers || !fichiers.length) return; dire('Lecture du fichier…');
    try {
      const F = []; for (const f of fichiers) F.push({ nom: f.name, octets: new Uint8Array(await f.arrayBuffer()) });
      const b = await P.importer(F), nF = b.nouvelles.fermees, nT = b.nouvelles.tresorerie, mF = b.modifiees.fermees;
      S.L = await P.charger(); recalculer(); S.page = 1;
      const synchro = b.synchro && b.synchro.ok ? ' Synchronisé avec les autres appareils.' : b.synchro && b.synchro.horsConfig ? ' (Enregistré sur cet appareil ; configurer le Worker dans Réglages pour synchroniser.)' : b.synchro ? ' Synchronisation impossible : ' + b.synchro.erreur + ' (réessayera tout seul).' : '';
      noterImport(); dire(`Import terminé : ${nF} nouvelle${nF > 1 ? 's' : ''} transaction${nF > 1 ? 's' : ''}, ${nT} opération(s) de trésorerie ajoutée(s)${mF ? ', ' + mF + ' mise(s) à jour' : ''} ; ${b.inchangees.fermees} déjà connue(s) (ignorées, aucun doublon). Total : ${b.totaux.fermees} positions.${synchro}${b.avertissements.length ? ' ' + b.avertissements.join(' ; ') : ''}`);
      majSync(); afficher(); if (S.coach) genererRapport({ silencieux: true });
    } catch (e) { dire('Import impossible : ' + (e && e.message || e), true); }
  }
  async function genererRapport({ silencieux = false } = {}) {
    if (!S.coach || !S.coach.note) return; const base = texteRapport(S.coach, S.R), note = S.coach.note.note, sections = { erreurs: S.coach.erreurs.map(e => ({ titre: e.titre, texte: e.texte, impact: e.impact })), regles: S.coach.regles, marche: S.coach.marche };
    const msg = el.querySelector('[data-ia-msg]'); if (msg) msg.textContent = 'Rayle rédige le rapport…';
    try {
      const mesures = JSON.stringify({ note, resume: { n: S.R.n, reussite: Math.round(S.R.winRate * 100), profitFactor: S.R.profitFactor && +S.R.profitFactor.toFixed(2), gainMoyen: +S.R.gainMoyen.toFixed(2), perteMoyenne: +S.R.perteMoyenne.toFixed(2), serieMaxPerdante: S.R.series.perdante }, erreurs: sections.erreurs, ceQuiMarche: sections.marche, regles: sections.regles });
      const r = await demanderIA('Voici les mesures calculées de l’historique de trading de Justin (XTB, surtout l’or et le Nasdaq). Rédige un rapport de coaching en français, simple et direct : (1) ses 3 plus grosses erreurs, avec les chiffres fournis ; (2) ce qui marche vraiment chez lui ; (3) 3 règles concrètes à appliquer, formulées avec les seuils fournis. N’invente aucun chiffre, ne prédis rien, ne conseille aucun achat ni vente.\n\nMesures : ' + mesures, { contexte: 'Rapport de coaching de discipline.' });
      await P.sauverRapport({ texte: r.texte, note, sections, ia: true }); S.L = await P.charger(); if (msg) msg.textContent = '';
    } catch (e) { await P.sauverRapport({ texte: base, note, sections, ia: false }); S.L = await P.charger(); if (msg) msg.textContent = silencieux ? '' : 'IA indisponible (' + (e && e.message || e) + ') : rapport calculé affiché.'; }
    const z = el.querySelector('[data-rapport]'); if (z) z.innerHTML = V.rapportHtml(S);
  }

  /* ───── évènements ───── */
  el.addEventListener('change', async e => {
    const f = e.target.closest('[data-fichier]'); if (f) { await importerFichiers([...f.files]); f.value = ''; return; }
    const r = e.target.closest('[data-restaurer]'); if (r && r.files[0]) { const m = el.querySelector('[data-sauv-msg]'); try { const res = await P.restaurer(JSON.parse(await r.files[0].text())); S.L = await P.charger(); recalculer(); m.textContent = `Restauré : ${res.fermees} positions, ${res.tresorerie} opérations.`; await synchroniser(false); } catch (er) { m.textContent = 'Restauration impossible : ' + (er && er.message || er); } r.value = ''; return; }
    const sel = e.target.closest('[data-f]'); if (sel && sel.tagName === 'SELECT') { S.filtre[sel.dataset.f] = sel.value === '' ? null : (sel.dataset.f === 'periode' ? +sel.value : sel.value); S.page = 1; afficher(); }
  });
  el.addEventListener('input', e => { const t = e.target.closest('[data-f]'); if (t && t.tagName === 'INPUT') { S.filtre.texte = t.value; S.page = 1; clearTimeout(S.tFiltre); S.tFiltre = setTimeout(() => { const pos = t.selectionStart; afficher(); const n = zone.querySelector('[data-f="texte"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* */ } } }, 250); } });
  el.addEventListener('click', async e => {
    const o = e.target.closest('[data-onglet]'); if (o) { S.onglet = o.dataset.onglet; ecrireLS('tp_pf_onglet', S.onglet); corps.scrollTop = 0; afficher(); return; }
    const per = e.target.closest('[data-per]'); if (per) { S.perio = per.dataset.per; V.perio(S, zone, graphs); return; }
    const tri = e.target.closest('[data-tri]'); if (tri) { const c = tri.dataset.tri; S.tri = { cle: c, sens: S.tri.cle === c ? -S.tri.sens : -1 }; afficher(); return; }
    if (e.target.closest('[data-plus]')) { S.page++; afficher(); return; }
    const ac = e.target.closest('[data-actif]'); if (ac) { S.actif = ac.dataset.actif; afficher(); return; }
    if (e.target.closest('[data-ia-rapport]')) { e.target.closest('button').disabled = true; await genererRapport(); const b = el.querySelector('[data-ia-rapport]'); if (b) b.disabled = false; return; }
    if (e.target.closest('[data-lire-rapport]')) { parler((S.L.rapport && S.L.rapport.texte) || texteRapport(S.coach, S.R)); return; }
    if (e.target.closest('[data-lire]')) { parler(S.coach ? ((S.L.rapport && S.L.rapport.texte) || texteRapport(S.coach, S.R)) : 'Importez d’abord votre historique XTB.'); return; }
    if (e.target.closest('[data-couvrir-pos]')) { try { window.Application && window.Application.ouvrir('couverture'); } catch (er) { /* */ } return; }
    if (e.target.closest('[data-sync]')) { const m = el.querySelector('[data-sauv-msg]'); m.textContent = 'Synchronisation…'; await synchroniser(false); m.textContent = S.sync.ok ? 'Synchronisé.' : S.sync.texte || 'Worker non configuré.'; return; }
    if (e.target.closest('[data-sauvegarder]')) { const b = new Blob([JSON.stringify(await P.exporter())], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'rayle-portefeuille-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return; }
  });
  el.addEventListener('submit', async e => {
    const c = e.target.closest('[data-conn]'), r = e.target.closest('[data-reg]'), v = e.target.closest('[data-vp]'); if (!c && !r && !v) return; e.preventDefault(); const d = new FormData(e.target);
    if (c) { ecrireConn({ url: String(d.get('url') || ''), code: String(d.get('code') || '') }); const m = el.querySelector('[data-conn-msg]'); m.textContent = 'Test de la connexion…'; if (!lireConn()) { m.textContent = 'Connexion supprimée : les données restent sur cet appareil.'; majSync(); return; }
      try { const s = await fetch(lireConn().url + '/sante', { signal: AbortSignal.timeout(10000) }).then(x => x.json()); if (!s.ok) throw new Error('réponse inattendue'); await synchroniser(false); m.textContent = S.sync.ok ? 'Connecté : ' + S.L.fermees.length + ' positions disponibles.' : 'Worker joignable mais accès refusé : ' + S.sync.texte; } catch (er) { m.textContent = 'Worker injoignable : ' + (er && er.message || er); S.sync = { ok: false, texte: String(er && er.message || er) }; majSync(); } return; }
    if (r) { const cap = lireNombre(d.get('capital')), risque = lireNombre(d.get('risquePct')); const n = {}; const si = lireNombre(d.get('soldeInitial')); if (Number.isFinite(cap) && cap > 0) n.capital = cap; if (Number.isFinite(si) && si >= 0) n.soldeInitial = si; if (Number.isFinite(risque) && risque > 0 && risque <= 100) n.risquePct = risque; await P.sauverReglages(n); S.L = await P.charger(); recalculer(); dire('Réglages enregistrés.'); return; }
    if (v) { const vp = {}; for (const [k, x] of d.entries()) { const n = lireNombre(x); if (Number.isFinite(n) && n > 0) vp[k] = n; } await P.sauverReglages({ valeursPoint: vp }); S.L = await P.charger(); recalculer(); dire('Valeurs du point enregistrées.'); }
  });
  /* ───── journal par setup : saisie, attribution en un toucher, synthèse lue par Rayle ───── */
  S.J = lireJournal();
  const majJournal = () => { S.J = lireJournal(); if (S.onglet === 'setups' && !S.ferme) afficher(); };
  const syncJournal = async () => { const r = await synchroJournal(lireJournal()); if (r.ok) { ecrireJournal(fusionnerJournal(lireJournal(), r.journal)); S.J = lireJournal(); if (S.onglet === 'setups' && !S.ferme) afficher(); } };
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-setup-attrib]'); if (a) { attribuer(a.dataset.setupAttrib, a.dataset.setup); majJournal(); return; }
    const s = e.target.closest('[data-prise-suppr]'); if (s) { retirer(s.dataset.priseSuppr); majJournal(); return; }
    if (e.target.closest('[data-lire-setups]')) { parler(S.synthese || ''); return; }
  });
  el.addEventListener('submit', e => {
    const f = e.target.closest('[data-prise-form]'); if (!f) return; e.preventDefault(); const d = new FormData(f), n = k => { const x = lireNombre(d.get(k)); return Number.isFinite(x) ? x : null; }, msg = el.querySelector('[data-prise-msg]');
    const r = noterPrise({ ticker: d.get('actif'), sens: d.get('sens'), prix: n('prix'), stop: n('stop'), cible: n('cible'), unite: d.get('unite') || null, setup: d.get('setup'), source: 'manuel' });
    if (!r) { if (msg) msg.textContent = 'Trade non noté : vérifie le prix d’entrée.'; return; } majJournal(); const m2 = el.querySelector('[data-prise-msg]'); if (m2) m2.textContent = 'Noté. Il sera rapproché de ton prochain import XTB.';
  });
  syncJournal();
  /* glisser-déposer du fichier sur la fenêtre (PC) */
  el.addEventListener('dragover', e => { e.preventDefault(); }); el.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) importerFichiers([...e.dataTransfer.files]); });

  S.L = await P.charger(); recalculer(); majSync(); afficher();
  synchroniser(true);   // en arrière-plan : n'empêche jamais l'affichage de la copie locale
  S.minuteurSync = setInterval(() => { if (!document.hidden && lireConn()) synchroniser(true); }, 120000);
  function fermer() { if (S.ferme) return; S.ferme = true; clearInterval(S.minuteurPos); clearInterval(S.minuteurSync); clearTimeout(S.tFiltre); graphs.vider(); el.remove(); instance = null; try { onFermer(); } catch (e) { /* */ } }
  instance = { fermer, etat: () => ({ actif: !S.ferme, onglet: S.onglet, positions: S.R.n || 0, journal: (S.J || []).length }), el, importer: importerFichiers, lire: () => S.coach ? ((S.L.rapport && S.L.rapport.texte) || texteRapport(S.coach, S.R)) : '' };
  return instance;
}
export function fermer() { if (instance) instance.fermer(); }
export { nf, actifsPro, creerVue };
