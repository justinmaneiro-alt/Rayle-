import * as V from './poste-vues-ms.js';
import * as MS from './ms-page.js';
import { strategieVide } from '../agent-ms/strategie-ms.js';
import { lireTexteFrancais } from '../agent-ms/lecture-texte.js';
import { ORDRE_PAIRES } from '../agent-m6/paires.js';

/* ═════════════ CONTRÔLEUR DE L'ONGLET « TESTE MA STRATÉGIE » (V1) ═════════════
   Ne calcule rien : lit les formulaires, appelle ms-page.js (registre, tests dans un Worker, alertes) et demande les vues à poste-vues-ms.js. Le formulaire d'édition n'est jamais redessiné pendant
   qu'on le remplit (poste-agent.js : formulaireActif, onglet « teste »). Une stratégie n'est JAMAIS testée en alertes ni utilisée sans que l'utilisatrice l'ait relue et validée. */
const clone = o => JSON.parse(JSON.stringify(o));
export const ONGLET_MS = 'teste';

export function creerGestionMS({ racine, S, message, rendre }) {
  S.ms = S.ms || { sel: null, edit: null, brouillon: null, texteLibre: '', lecture: null, paires: ['BTC', 'SOL', 'DOGE'], resultat: {}, enCours: '', retour: '' };
  const q = (sel, ctx = racine) => ctx.querySelector(sel), qa = (sel, ctx = racine) => [...ctx.querySelectorAll(sel)];
  const val = nom => { const e = q('[data-ms="' + nom + '"]'); return e ? (e.type === 'checkbox' ? e.checked : e.value) : undefined; };
  const nombre = x => { if (x == null || String(x).trim() === '') return null; const n = Number(String(x).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const surChg = MS.surChangementMS(() => { if (S.onglet === ONGLET_MS && !S.detruit) rendre(false); });

  /* Lit le formulaire d'édition dans le brouillon (avant toute action qui redessine). */
  function lireBrouillon() {
    const b = S.ms.brouillon; if (!b || !q('[data-form="ms"]')) return;
    const nom = val('nom'); if (nom != null) b.nom = nom; const cote = val('cote'); if (cote) b.cote = cote;
    b.filtres = { pasRange: !!val('pasRange'), heures: val('heures-on') ? { de: nombre(val('heures-de')), a: nombre(val('heures-a')) } : null, risqueMaxPct: nombre(val('risqueMax')) };
    const st = val('stop-type');
    if (st === 'atr') b.stop = { type: 'atr', tf: val('stop-tf') || 'h1', k: nombre(val('stop-k')) };
    else if (st === 'structure') b.stop = { type: 'structure', L: nombre(val('stop-L')), pad: nombre(val('stop-pad')) };
    else if (st === 'fixe') b.stop = { type: 'fixe', pct: nombre(val('stop-pct')) };
    const so = val('sortie-type');
    if (so === 'cible_R') b.sortie = { type: 'cible_R', R: nombre(val('sortie-R')) };
    else if (so === 'suiveur') b.sortie = { type: 'suiveur', k: nombre(val('sortie-k')), tf: val('sortie-tf') || 'h1' };
    else if (so === 'signal') b.sortie = { type: 'signal', conditions: b.sortie.type === 'signal' ? b.sortie.conditions : [] };
    // conditions : chaque champ porte son contexte (entree | sortie), son index et son nom
    for (const e of qa('[data-ms-cond]')) {
      const [ctx, i, k] = e.dataset.msCond.split(':'), liste = ctx === 'entree' ? b.conditions : (b.sortie.conditions || []), c = liste[Number(i)]; if (!c) continue;
      if (k === 'valeurs') { const toutes = qa('[data-ms-cond="' + e.dataset.msCond + '"]'), brut = toutes.filter(x => x.checked).map(x => x.dataset.val); c.valeurs = brut.map(x => (/^\d+$/.test(x) ? Number(x) : x)); }
      else if (e.tagName === 'SELECT') c[k] = e.value;
      else { const n = nombre(e.value); if (n != null) c[k] = n; }
    }
    S.ms.texteLibre = val('texte') != null ? val('texte') : S.ms.texteLibre;
  }
  const listeCtx = ctx => (ctx === 'entree' ? S.ms.brouillon.conditions : S.ms.brouillon.sortie.conditions);
  const retour = (html) => { const e = q('[data-r="ms-retour"]'); if (e) e.innerHTML = html; S.ms.retour = html; };
  const alerte = t => '<p class="pa-alerte">' + V.esc(t) + '</p>', ok = t => '<p class="pa-ok">' + V.esc(t) + '</p>';

  async function rendreOnglet(corps, ecrire, force) {
    const R = MS.reg(), liste = R.liste(), sel = S.ms.sel && R.obtenir(S.ms.sel) ? R.obtenir(S.ms.sel) : null;
    if (S.ms.sel && !sel) S.ms.sel = null;
    let html = V.vueListe(liste, { selection: S.ms.sel, perf: id => MS.performanceDirect(id) });
    if (S.ms.edit && S.ms.brouillon) html += V.vueEditeur(S.ms.brouillon, { id: S.ms.edit.id, texteLibre: S.ms.texteLibre, lecture: S.ms.lecture, retour: S.ms.retour });
    if (sel && !S.ms.edit) {
      const dispo = await MS.historiqueDispo(), couts = {}; for (const p of ORDRE_PAIRES) couts[p] = MS.couts(p);
      html += V.vueTest(sel, { paires: S.ms.paires.filter(p => dispo[p] !== false), couts, disponibles: dispo, enCours: S.ms.enCours, variantesAvant: sel.nVariantes, apres: R.variantesAvecTest(sel.id) });
      html += V.vueResultat(sel, S.ms.resultat[sel.id] || null, { paireVue: S.ms.paireVue });
    }
    html += V.vueSuivi(liste, id => MS.performanceDirect(id), S.ms.alertes || []);
    ecrire(corps, html);
  }

  async function action(a, b) {
    if (!a.startsWith('ms-')) return false;
    const R = MS.reg(), id = b.dataset.id;
    switch (a) {
      case 'ms-nouvelle': S.ms.brouillon = strategieVide('long'); S.ms.edit = { id: null }; S.ms.lecture = null; S.ms.texteLibre = ''; S.ms.retour = ''; break;
      case 'ms-modifier': { const r = R.obtenir(id); if (!r) break; S.ms.brouillon = clone(r.strategie); S.ms.edit = { id }; S.ms.sel = id; S.ms.lecture = null; S.ms.texteLibre = r.texteLibre || ''; S.ms.retour = ''; break; }
      case 'ms-annuler': S.ms.edit = null; S.ms.brouillon = null; S.ms.lecture = null; S.ms.retour = ''; break;
      case 'ms-choisir': S.ms.sel = id; S.ms.edit = null; S.ms.brouillon = null; break;
      case 'ms-dupliquer': { const r = R.dupliquer(id); if (r.ok) { MS.sauverRegistre(); S.ms.sel = r.id; message('Copie créée : même lignée (le compteur de variantes continue), à relire et à valider.', true); } break; }
      case 'ms-supprimer': { if (!confirm('Supprimer cette stratégie et son suivi ?')) return true; R.supprimer(id); MS.sauverRegistre(); if (S.ms.sel === id) S.ms.sel = null; break; }
      case 'ms-cond-ajouter': {
        lireBrouillon(); const ctx = b.dataset.ctx, type = q('[data-ms-nouveau="' + ctx + '"]').value;
        if (ctx === 'sortie' && S.ms.brouillon.sortie.type !== 'signal') S.ms.brouillon.sortie = { type: 'signal', conditions: [] };
        listeCtx(ctx).push({ type, ...clone(V.DEFAUTS_COND[type]) }); break;
      }
      case 'ms-cond-retirer': lireBrouillon(); listeCtx(b.dataset.ctx).splice(Number(b.dataset.i), 1); break;
      case 'ms-texte-lire': {
        lireBrouillon(); const texte = (S.ms.texteLibre || '').trim(); if (texte.length < 8) { retour(alerte('Écris une phrase complète (RSI, moyenne mobile, stop, objectif…).')); return true; }
        const r = lireTexteFrancais(texte); S.ms.lecture = r; if (r.strategie) { const nom = S.ms.brouillon.nom; S.ms.brouillon = { ...r.strategie, nom: nom && nom !== 'Ma stratégie' ? nom : r.strategie.nom }; } break;
      }
      case 'ms-texte-ia': {
        lireBrouillon(); const texte = (S.ms.texteLibre || '').trim(); if (texte.length < 8) { retour(alerte('Écris une phrase complète avant de demander la traduction.')); return true; }
        retour('<p class="pa-avert">Traduction en cours (une seule demande au Worker de Raylé)…</p>');
        const r = await MS.traduireTexteIA(texte); if (!r.ok) { retour(alerte(r.erreur)); return true; }
        S.ms.brouillon = { ...r.strategie, nom: S.ms.brouillon.nom !== 'Ma stratégie' ? S.ms.brouillon.nom : r.strategie.nom };
        S.ms.lecture = { compris: [r.explication || 'Règle proposée par Raylé : relis-la dans la description ci-dessous.'], nonCompris: [], avertissements: r.avertissements || [] }; break;
      }
      case 'ms-enregistrer': {
        lireBrouillon(); const e = S.ms.edit, r = e && e.id ? R.modifier(e.id, S.ms.brouillon) : R.creer(S.ms.brouillon, { source: S.ms.lecture ? 'texte' : 'blocs', texteLibre: S.ms.texteLibre || null });
        if (!r.ok) { retour('<ul class="pa-alerte">' + r.erreurs.map(x => '<li>' + V.esc(x) + '</li>').join('') + '</ul>'); return true; }
        MS.sauverRegistre(); const nid = r.id || e.id; S.ms.edit = { id: nid }; S.ms.sel = nid; S.ms.brouillon = clone(R.obtenir(nid).strategie);
        retour(ok(e && e.id ? (r.change ? 'Règle modifiée : la validation et les alertes sont retirées, relis puis valide de nouveau.' : 'Enregistré.') : 'Brouillon enregistré. Relis la description, coche « j’ai relu » puis valide pour pouvoir le tester en alertes.')); break;
      }
      case 'ms-valider': {
        lireBrouillon(); const e = S.ms.edit; if (!e || !e.id) { retour(alerte('Enregistre d’abord la stratégie.')); return true; }
        if (!val('relu')) { retour(alerte('Coche « J’ai relu la description et je la valide » : rien n’est appliqué sans ta validation.')); return true; }
        const r = R.modifier(e.id, S.ms.brouillon); if (!r.ok) { retour('<ul class="pa-alerte">' + r.erreurs.map(x => '<li>' + V.esc(x) + '</li>').join('') + '</ul>'); return true; }
        R.valider(e.id); MS.sauverRegistre(); retour(ok('Stratégie validée par toi. Tu peux maintenant la tester et, si tu le décides, la mettre en alertes.')); break;
      }
      case 'ms-couts': {
        const confirme = !!val('couts-confirme'); let dernier = { ok: true };
        for (const p of ORDRE_PAIRES) { const patch = {}; for (const k of ['fraisPct', 'spreadPct', 'glissementPct']) { const e = q('[data-ms-cout="' + p + ':' + k + '"]'); if (e && e.value !== '') patch[k] = e.value; } if (Object.keys(patch).length) { const c = MS.couts(p); const change = Object.keys(patch).some(k => Number(patch[k]) !== c[k]); if (change) { dernier = MS.reglerCouts(p, patch, confirme); if (!dernier.ok) break; } } }
        message(dernier.ok ? 'Frais enregistrés.' : dernier.erreur, dernier.ok); break;
      }
      case 'ms-tester': {
        const r0 = R.obtenir(S.ms.sel); if (!r0) break; const paires = qa('[data-ms-paire]').filter(e => e.checked && !e.disabled).map(e => e.dataset.msPaire); S.ms.paires = paires.length ? paires : S.ms.paires;
        if (!paires.length) { message('Coche au moins une paire disponible.', false); return true; }
        S.ms.enCours = 'Test en cours…'; await rendre(true);
        const r = await MS.testerSurPaires(S.ms.sel, paires, { progres: t => { const e = q('[data-r="ms-progres"]'); if (e) e.textContent = t; } });
        S.ms.enCours = ''; S.ms.resultat[S.ms.sel] = r; S.ms.paireVue = paires[0]; message(r.ok ? 'Test terminé : ' + r.nVariantes + ' variante(s) comptée(s) pour cette stratégie.' : r.erreur, r.ok); break;
      }
      case 'ms-alertes': {
        const r = R.obtenir(id); if (!r) break;
        if (r.alertes.actif) { R.reglerAlertes(id, false); MS.sauverRegistre(); message('Alertes coupées.', true); break; }
        let res = R.reglerAlertes(id, true);
        if (!res.ok && res.demandeConfirmation) { if (!confirm('Cette stratégie est NON VALIDÉE : elle ne bat pas le hasard sur le passé (ou manque de trades). Tu peux quand même recevoir ses alertes, étiquetées « NON VALIDÉE » à chaque fois, sans aucun ordre automatique. Continuer ?')) return true; res = R.reglerAlertes(id, true, { confirme: true }); }
        if (!res.ok) { message(res.erreur, false); break; }
        MS.sauverRegistre(); MS.demarrerAlertesMS(); message('Alertes activées : signaux d’entrée et de sortie dans Raylé, sur le graphique et par Telegram. Aucun ordre n’est passé.', true); break;
      }
      case 'ms-graphique': { const p = b.dataset.paire; S.ms.paireVue = p; const r = await MS.tracerSignaux(S.ms.sel, p); message(r.ok ? r.n + ' signaux tracés sur le graphique ' + p + ' (groupe « ' + r.groupe + ' »).' : r.erreur, r.ok); break; }
      default: return false;
    }
    S.dernierHtml = {}; await rendre(true); return true;
  }
  async function change(t) {
    if (t.matches && t.matches('[data-ms="stop-type"],[data-ms="sortie-type"]')) { lireBrouillon(); const b = S.ms.brouillon, v = t.value;
      if (t.dataset.ms === 'stop-type') b.stop = v === 'atr' ? { type: 'atr', tf: 'h1', k: 1.5 } : v === 'structure' ? { type: 'structure', L: 24, pad: 0.3 } : { type: 'fixe', pct: 1.5 };
      else b.sortie = v === 'cible_R' ? { type: 'cible_R', R: 2 } : v === 'suiveur' ? { type: 'suiveur', k: 3, tf: 'h1' } : { type: 'signal', conditions: b.sortie.type === 'signal' ? b.sortie.conditions : [] };
      S.dernierHtml = {}; await rendre(true); return true; }
    if (t.matches && t.matches('[data-ms-paire]')) { S.ms.paires = qa('[data-ms-paire]').filter(e => e.checked).map(e => e.dataset.msPaire); return true; }
    if (t.matches && t.matches('[data-ms],[data-ms-cond],[data-ms-cout],[data-ms-nouveau]')) { lireBrouillon(); S.dernierHtml = {}; if (t.matches('[data-ms="heures-on"],[data-ms="pasRange"]')) await rendre(true); return true; }
    return false;
  }
  /* SYNCHRONE : un `await` avant preventDefault laisserait le navigateur envoyer le formulaire (rechargement de la page) */
  function soumettre(ev) { if (ev.target.closest && ev.target.closest('form[data-form="ms"]')) { ev.preventDefault(); return true; } return false; }
  return { rendreOnglet, action, change, soumettre, detruire() { surChg(); }, lireBrouillon };
}
