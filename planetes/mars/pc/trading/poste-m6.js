import * as V from './poste-vues-m6.js';
import * as SV from './services-m6.js';
import { obtenirM6, commandeM6 } from './m6-page.js';
import { GraphiqueAgent } from './chart-api.js';
import { vuesDesPaires, hotesChargees, paireActive, basculerPaire } from './pilotes-paires.js';
import { analyseTrade, bilanSemaine } from '../agent-m6/journal.js';
import { construireSante } from '../agent-m6/sante.js';
import { COULEURS } from '../agent-m6/dessins.js';

/* ═════════════ LES ONGLETS M6 DU POSTE : gardien, tilt, journal, simulation, régime, capture, santé + idées + coûts + outils du graphique ═════════════
   Contrôleur de l'interface (formulaires, fichiers, collage d'images, boutons). Il ne calcule rien : il appelle les services (services-m6.js) et l'état global (m6-page.js), puis demande les vues
   (poste-vues-m6.js). Les formulaires ne sont jamais redessinés pendant qu'on les remplit (voir poste-agent.js : formulaireActif). */
export const ONGLETS_M6 = new Set(['gardien', 'tilt', 'journal', 'simulation', 'regime', 'capture', 'sante']);
const NOM = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' }, lireLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, ecrireLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* interdit */ } };
const UNITE_MS = { m15: 900e3, h1: 3600e3, h4: 14400e3 };
const telecharger = (nom, texte, type = 'text/csv;charset=utf-8') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texte], { type })); a.download = nom; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };

export function creerGestionM6({ racine, S, message, rendre, ouvrirOnglet, z, getHote, obtenirHotePaire, getGraphique, montrerGraphique }) {
  S.m6 = S.m6 || { controle: null, csv: null, analyse: null, simulation: null, image: null, imageApercu: null, captureResultat: null, sante: null, revVue: -1 };
  const el = nom => racine.querySelector('[data-r="' + nom + '"]'), ecrireZone = (nom, html) => { const e = el(nom); if (e) e.innerHTML = html; };
  const f2o = f => { const o = {}; for (const e of f.elements) { if (!e.name) continue; o[e.name] = e.type === 'checkbox' ? e.checked : e.value; } return o; };
  const num = x => (x == null || String(x).trim() === '' ? null : Number(String(x).replace(',', '.')));
  const alerte = txt => '<p class="pa-alerte">' + V.esc(txt) + '</p>', ok = txt => '<p class="pa-ok">' + V.esc(txt) + '</p>';

  /* ── propositions de l'agent jugées par le gardien (alertes d'ENTRÉE récentes de toutes les paires chargées) ── */
  function propositions() {
    const maintenant = Date.now(), out = [];
    for (const [p, h] of Object.entries(hotesChargees())) { try { for (const a of (h.vue().alertes || []).slice(0, 6)) if (a.type === 'ENTREE' && maintenant - a.t < 12 * 3600e3) out.push({ ...a, paire: p }); } catch (e) { /* hôte en chargement */ } }
    return out.sort((a, b) => b.t - a.t).slice(0, 8);
  }

  async function rendreOnglet(nom, corps, ecrire, force, v) {
    const m6 = await obtenirM6(), vue = m6.vue();
    const memeVue = S.m6.revVue === vue.rev && S.m6.nomVue === nom && S.dernierHtml.corps;
    if (['gardien', 'tilt', 'journal'].includes(nom) && !force && memeVue && !Object.keys(S.m6.encours || {}).length) return;     // rien n'a changé : on ne redessine pas (les formulaires restent intacts)
    S.m6.revVue = vue.rev; S.m6.nomVue = nom;
    switch (nom) {
      case 'gardien': ecrire(corps, V.vueGardien(vue, { controle: S.m6.controle, paire: S.paire, propositions: propositions() })); break;
      case 'tilt': ecrire(corps, V.vueTilt(vue)); break;
      case 'journal': ecrire(corps, V.vueJournal(vue, { csv: S.m6.csv, analyse: S.m6.analyse, bilan: m6.bilan() })); break;
      case 'simulation': ecrire(corps, V.vueSimulation({ simulation: S.m6.simulation, paire: S.paire }, v, vue)); break;
      case 'regime': { const reg = {}; const memo = SV.regimesMemo(); for (const p of ['BTC', 'SOL', 'DOGE']) if (memo[p]) reg[p] = memo[p]; const AP = await import('./assistant-page.js'), { vueAssistantM6c } = await import('./vue-assistant-m6c.js');
        ecrire(corps, V.vueRegime({ regimes: { ...reg, ...(S.m6.regimes || {}) } }) + vueAssistantM6c({ analyses: AP.assistantsMemo(), simulations: S.m6.simM6c || {} }));
        S.m6.m6cDemande = S.m6.m6cDemande || {};                       // première ouverture : on analyse les paires activées (une seule fois chacune), puis on redessine
        for (const p of ['BTC', 'SOL', 'DOGE']) if (!AP.assistantsMemo()[p] && !S.m6.m6cDemande[p] && (p === 'BTC' || paireActive(p))) { S.m6.m6cDemande[p] = true; AP.assistantPour(p).then(a => { if (a && a.ok) AP.tracerRegime(p, a); return rendre(true); }).catch(() => rendre(true)); }
        break; }
      case 'capture': ecrire(corps, V.vueCapture({ image: S.m6.image, imageApercu: S.m6.imageApercu, captureResultat: S.m6.captureResultat, paire: S.paire }, vue)); break;
      case 'sante': {
        ecrire(corps, V.vueSante({ sante: S.m6.sante })); const g = await SV.santeGlobale(); const s = construireSante(g.entrees, Date.now()); S.m6.sante = s; S.m6.santeM6 = g.m6;
        ecrire(corps, V.vueSante({ sante: s, m6: g.m6 })); break;
      }
      default: break;
    }
  }
  const htmlIdees = async () => V.vueIdees((await obtenirM6()).vue(), {});
  async function htmlReglagesM6() { return V.vueCoutsEtRecherche(await vuesDesPaires()); }

  /* ── outils du graphique ── */
  const storeCourant = () => GraphiqueAgent.magasin(S.paire);
  function barreDessins() {
    const groupes = storeCourant().groupes();
    return '<span class="pa-outils"><button type="button" class="pa-btn" data-a="dessin-zone" title="Trace une zone : deux clics sur le graphique">▭ Zone</button><button type="button" class="pa-btn" data-a="dessin-ligne" title="Trace un niveau : un clic">― Ligne</button><button type="button" class="pa-btn pa-fort" data-a="tester-zone" title="Mesure ce qui s’est passé dans ta dernière zone">Tester ma zone</button><button type="button" class="pa-btn" data-a="rejeu-periode">⏪ Rejouer la période</button><button type="button" class="pa-btn" data-a="effacer-mes-dessins">Effacer mes dessins</button>'
      + (groupes.length ? '<span class="pa-groupes">Dessins : ' + groupes.map(g => '<label class="pa-case" title="' + V.esc(g.auteur === 'agent' ? 'tracé par l’agent' : 'tracé par toi') + '"><input type="checkbox" data-gd="' + V.esc(g.groupe) + '"' + (g.visibles ? ' checked' : '') + '> ' + V.esc(g.groupe) + ' (' + g.n + ')</label>').join(' ') + '</span>' : '')
      + '<label class="pa-case"><input type="checkbox" data-a="voix-bougie"' + (lireLocal('rayle_poste_voix_bougie') !== '0' ? ' checked' : '') + '> Rayle lit l’explication d’une bougie cliquée</label></span>';
  }
  const signatureDessins = () => JSON.stringify(storeCourant().lister().map(d => [d.id, d.visible]));
  const dessinsPourGraphique = () => storeCourant().lister({ visibles: true });
  async function ajouterDessinUtilisateur(spec, mode) {
    const r = await GraphiqueAgent.tracer(S.paire, spec);
    message(r.ok ? (mode === 'zone' ? 'Zone tracée : clique « Tester ma zone ».' : 'Ligne tracée.') : 'Dessin refusé : ' + (r.erreurs || []).join(' ; '), r.ok);
    S.signatureGraph = null; await rendre(true);
  }
  function cote(html) { const c = racine.querySelector('[data-g="cote"]'), d = racine.querySelector('#pa-trade-detail'); if (c) c.innerHTML = html; if (d) d.innerHTML = html; }
  function lire(texte) { if (lireLocal('rayle_poste_voix_bougie') === '0') return; try { if (typeof speak === 'function') speak(texte); } catch (e) { /* voix indisponible */ } }
  async function clicBougie({ t, unite }) {
    const ms = UNITE_MS[unite] || 900e3, tM15 = t + ms - 900e3;           // pour H1 / H4 : le contexte à la clôture de la bougie = sa dernière sous-bougie M15
    cote('<p class="pa-vide">Analyse de la bougie…</p>');
    const r = await GraphiqueAgent.expliquerBougie(S.paire, tM15);
    if (!r.ok) { cote(alerte(r.erreur)); return; }
    cote('<h4>Cette bougie' + (unite !== 'm15' ? ' (' + unite.toUpperCase() + ', contexte à sa clôture)' : '') + '</h4><ul class="pa-liste">' + r.phrases.map(p => '<li>' + V.esc(p) + '</li>').join('') + '</ul>'); lire(r.texte);
  }
  async function testerMaZone() {
    cote('<p class="pa-vide">Test de ta zone sur l’historique…</p>'); const r = await GraphiqueAgent.testerMaZone(S.paire);
    if (!r.ok) { cote(alerte(r.erreur)); message(r.erreur, false); return; }
    const b = x => (x.n ? x.n + ' trades · réussite ' + V.pc(x.taux.p) + ' · R moyen ' + V.sg(x.esperance) : 'aucun trade');
    cote('<h4>Ta zone ' + V.nb(r.zone.prixBas, r.zone.prixBas < 1 ? 5 : 2) + ' → ' + V.nb(r.zone.prixHaut, r.zone.prixHaut < 1 ? 5 : 2) + '</h4><div class="pa-grille-mini"><span>Approches <b>' + r.approches + '</b></span><span>Rebonds <b>' + V.pc(r.reactions.rebond.p) + '</b></span><span>Cassures <b>' + V.pc(r.reactions.cassure.p) + '</b></span><span>Rebond joué <b>' + b(r.rebond) + '</b></span><span>Cassure jouée <b>' + b(r.cassure) + '</b></span></div><ul class="pa-liste">' + r.phrases.map(p => '<li>' + V.esc(p) + '</li>').join('') + '</ul>'); lire(r.texte);
  }

  /* ── actions (clics) ── */
  async function action(a, b, ev) {
    const hote = getHote(), m6 = await obtenirM6();
    switch (a) {
      case 'dessin-zone': case 'dessin-ligne': { const g = getGraphique(); if (g) g.demarrerDessin(a === 'dessin-zone' ? 'zone' : 'ligne'); break; }
      case 'tester-zone': await testerMaZone(); break;
      case 'rejeu-periode': { const P = window.PosteAgent && window.PosteAgent.poste(); if (P && P.rejouerPeriode) message(await P.rejouerPeriode(), true); break; }
      case 'effacer-mes-dessins': { const n = storeCourant().vider('utilisateur').n; message(n ? n + ' dessin(s) à toi effacé(s).' : 'Aucun dessin à effacer.', true); S.signatureGraph = null; await rendre(true); break; }
      case 'trade-analyse': { const x = m6.journal.trouver(b.dataset.id); if (x) { S.m6.analyse = analyseTrade(x, { regles: m6.etat().regles }); await rendre(true); } break; }
      case 'trade-supprimer': { if (window.confirm('Supprimer ce trade du journal ? (action irréversible)')) { const r = await commandeM6({ type: 'journal_supprimer', id: b.dataset.id, confirme: true }); message(r.message || r.erreur, r.ok); S.m6.analyse = null; await rendre(true); } break; }
      case 'journal-exporter': telecharger('rayle-journal-trades.csv', m6.exporterCSV()); message('Journal exporté.', true); break;
      case 'csv-importer': {
        if (!S.m6.csv || !S.m6.csv.apercu) break; const r = await commandeM6({ type: 'journal_csv_importer', texte: S.m6.csv.texte, mappage: S.m6.csv.mappage, fuseau: S.m6.csv.fuseau, confirme: true });
        message(r.message || r.erreur, r.ok); if (r.ok) S.m6.csv = null; await rendre(true); break;
      }
      case 'm6c-analyser': { const p = b.dataset.paire; b.disabled = true; b.textContent = 'Analyse en cours…'; const AP = await import('./assistant-page.js'); try { const a = await AP.assistantPour(p, { force: true }); if (a.ok) await AP.tracerRegime(p, a); } catch (e) { /* l'erreur s'affiche dans la carte */ } await rendre(true); break; }
      case 'm6c-sim': { const p = b.dataset.paire, id = b.dataset.regle; b.disabled = true; b.textContent = 'Simulation en cours…'; const { simulationRegle } = await import('../agent-m6c/performance-m6c.js'), m6 = await obtenirM6(); S.m6.simM6c = S.m6.simM6c || {}; S.m6.simM6c[p] = simulationRegle({ paire: p, id, regles: m6.etat().regles, gain: m6.gardien().compte.gainTotal, pic: m6.gardien().compte.picEquite }); await rendre(true); break; }
      case 'regime-calculer': { const p = b.dataset.paire; b.disabled = true; b.textContent = 'Calcul en cours…'; S.m6.regimes = S.m6.regimes || {}; try { S.m6.regimes[p] = await SV.regimePour(p, { force: true }); } catch (e) { S.m6.regimes[p] = { ok: false, erreur: String(e && e.message || e) }; } await rendre(true); break; }
      case 'sante-activer-paire': { const p = b.dataset.paire; b.disabled = true; b.textContent = 'Téléchargement de l’historique…'; try { const { activerPaire } = await import('./pilotes-paires.js'); await activerPaire(p); } catch (e) { message('Activation impossible : ' + (e && e.message || e), false); } S.m6.sante = null; await rendre(true); break; }
      case 'sante-rafraichir': S.m6.sante = null; await rendre(true); break;
      case 'sante-kraken': { ecrireZone('sante', '<p>Recoupement en cours…</p>'); const out = []; for (const p of ['BTC', 'SOL', 'DOGE']) { if (p !== 'BTC' && !paireActive(p)) continue; const r = await SV.recouperKraken(p); out.push('<li><b>' + p + '</b> : ' + V.esc(r.phrase) + '</li>'); } ecrireZone('sante', '<ul class="pa-liste">' + out.join('') + '</ul>'); S.m6.sante = null; setTimeout(() => rendre(true), 200); break; }
      case 'sante-causalite': { ecrireZone('sante', '<p>Test du poison du futur en cours…</p>'); const r = await SV.testerCausalite(S.paire); ecrireZone('sante', '<p class="' + (r.ok ? 'pa-ok' : 'pa-alerte') + '">' + V.esc(r.phrase) + '</p>'); S.m6.sante = null; break; }
      case 'idee-catalogue': { const r = await commandeM6({ type: 'idee_catalogue' }); message(r.message, r.ok); await rendre(true); break; }
      case 'idee-traduire': {
        const i = m6.etat().idees.find(x => x.id === b.dataset.id); if (!i) break; b.disabled = true; b.textContent = 'Traduction en cours…';
        const r = await SV.traduireIdeeWorker(i.texte || i.titre); if (!r.ok) { message('Traduction impossible : ' + r.erreur, false); await rendre(true); break; }
        const s = await commandeM6({ type: 'idee_structurer', id: i.id, regle: r.regle, explication: r.explication }); message(s.message || s.erreur, s.ok); await rendre(true); break;
      }
      case 'idee-valider-m6': {
        const li = b.closest('li'), paires = [...li.querySelectorAll('[data-paire-idee]')].filter(c => c.checked).map(c => c.dataset.paireIdee);
        const r = await commandeM6({ type: 'idee_valider', id: b.dataset.id, paires }); message(r.message || r.erreur, r.ok); await rendre(true); break;
      }
      case 'idee-refuser-m6': { const r = await commandeM6({ type: 'idee_refuser', id: b.dataset.id }); message(r.message || r.erreur, r.ok); await rendre(true); break; }
      case 'capture-tracer': case 'capture-tracer-cale': {
        const r = S.m6.captureResultat; if (!r || !r.ok) break; const liste = a === 'capture-tracer' ? r.dessins : r.dessinsCales; let n = 0, refus = 0;
        storeCourant().supprimerGroupe('capture'); for (const d of liste) { const x = await GraphiqueAgent.tracer(r.paire, d); if (x.ok) n++; else refus++; }
        ecrireZone('capture-actions', ok(n + ' tracé(s) sur le graphique de ' + NOM[r.paire] + ' (groupe « capture », étiquetés « estimé »)' + (refus ? ', ' + refus + ' refusé(s)' : '') + '.')); S.signatureGraph = null; if (S.paire !== r.paire) await window.PosteAgent.poste().choisirPaire(r.paire); await ouvrirOnglet('graphique'); break;
      }
      case 'capture-joindre': {
        const r = S.m6.captureResultat, sel = racine.querySelector('[data-a="capture-joindre-choix"]'); if (!r || !r.ok || !sel) break;
        const n = await commandeM6({ type: 'capture_noter', capture: { paire: r.paire, unite: r.unite, statut: 'verifiee', niveaux: r.verification.niveaux.length } }); if (!n.ok) { message(n.erreur, false); break; }
        const { sauverImageCapture } = await import('./m6-page.js'); await sauverImageCapture(n.id, S.m6.image);
        const j = await commandeM6({ type: 'capture_joindre', tradeId: sel.value, captureId: n.id }); ecrireZone('capture-actions', j.ok ? ok('Capture jointe au trade.') : alerte(j.erreur)); break;
      }
      default: break;
    }
  }

  /* ── changements (fichiers, listes, cases) ── */
  async function previsualiserCsv() {
    const c = S.m6.csv; if (!c) return; const r = await commandeM6({ type: 'journal_csv_apercu', texte: c.texte, mappage: c.mappageChoisi || undefined, fuseau: c.fuseau });
    S.m6.csv = r.ok ? { ...c, entetes: r.entetes, mappage: r.mappage, apercu: r, fuseau: c.fuseau || (r.fuseau) || 'UTC' } : { erreur: r.erreur };
    await rendre(true);
  }
  async function chargerImage(fichier) {
    if (!fichier || !/^image\//.test(fichier.type)) { message('Ce fichier n’est pas une image.', false); return; }
    try { const url = await SV.reduireImage(fichier); S.m6.image = url; S.m6.imageApercu = url; S.m6.captureResultat = null; message('Capture chargée (' + Math.round(url.length * 0.75 / 1024) + ' Ko après réduction). Clique « Analyser la capture ».', true); await ouvrirOnglet('capture'); } catch (e) { message('Image illisible : ' + e.message, false); }
  }
  async function change(t) {
    if (t.matches('[data-a="csv-fichier"]')) { const f = t.files && t.files[0]; if (!f) return true; if (f.size > 5 * 1024 * 1024) { message('Fichier trop gros (5 Mo au plus).', false); return true; } const texte = await f.text(); S.m6.csv = { nom: f.name, texte, fuseau: (await obtenirM6()).vue().fuseauCSV }; await previsualiserCsv(); return true; }
    if (t.matches('[data-a="csv-mappage"]')) {
      const c = S.m6.csv; if (!c) return true; const map = {}; for (const s of racine.querySelectorAll('select[name^="map-"]')) if (s.value) map[s.name.slice(4)] = s.value; const fz = racine.querySelector('select[name="fuseau"]');
      S.m6.csv = { ...c, mappageChoisi: map, fuseau: fz ? fz.value : c.fuseau }; await previsualiserCsv(); return true;
    }
    if (t.matches('[data-a="capture-fichier"]')) { await chargerImage(t.files && t.files[0]); return true; }
    if (t.matches('[data-gd]')) { const g = t.dataset.gd, m = storeCourant(); m.masquerGroupe(g, !t.checked); S.signatureGraph = null; await rendre(true); return true; }
    if (t.matches('input[data-a="voix-bougie"]')) { ecrireLocal('rayle_poste_voix_bougie', t.checked ? '1' : '0'); return true; }
    return false;
  }
  /* collage d'une image (Ctrl+V) et glisser-déposer : seulement quand l'onglet « Capture » est ouvert */
  async function coller(ev) {
    if (S.onglet !== 'capture' || S.detruit) return; const items = ev.clipboardData && ev.clipboardData.items; if (!items) return;
    for (const it of items) if (it.kind === 'file' && /^image\//.test(it.type)) { ev.preventDefault(); await chargerImage(it.getAsFile()); return; }
  }
  racine.addEventListener('dragover', ev => { if (ev.target.closest('[data-depot]')) { ev.preventDefault(); ev.target.closest('[data-depot]').classList.add('survol'); } });
  racine.addEventListener('dragleave', ev => { const d = ev.target.closest('[data-depot]'); if (d) d.classList.remove('survol'); });
  racine.addEventListener('drop', async ev => { const d = ev.target.closest('[data-depot]'); if (!d) return; ev.preventDefault(); d.classList.remove('survol'); const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) await chargerImage(f); });

  /* ── formulaires ── */
  async function soumettre(ev) {
    const f = ev.target.closest('form[data-form]'); if (!f || f.dataset.form === 'profil') return false; ev.preventDefault();
    const nom = f.dataset.form, d = f2o(f), m6 = await obtenirM6();
    switch (nom) {
      case 'base': { const r = await commandeM6({ type: 'prop_base', equite: num(d.equite), pic: d.pic === '' ? undefined : num(d.pic) }); ecrireZone('base', r.ok ? ok(r.message) : alerte(r.erreur)); if (r.ok) await rendre(true); break; }
      case 'lever': { const r = await commandeM6({ type: 'gardien_lever', cause: d.cause, raison: d.raison }); ecrireZone('lever', r.ok ? ok(r.message) : alerte(r.erreur)); if (r.ok) await rendre(true); break; }
      case 'controle': { S.m6.controle = m6.controle({ paire: d.paire, sens: Number(d.sens), entree: num(d.entree), stop: num(d.stop), objectif: num(d.objectif) }); await rendre(true); break; }
      case 'regles': {
        const patch = {}; for (const [k, v] of Object.entries(d)) { if (k === 'confirme' || v === '') continue; patch[k] = ['modeDrawdown', 'plafondTrailing', 'modePerteJour'].includes(k) ? v : Number(v); }
        const r = await commandeM6({ type: 'prop_regles', patch, confirme: !!d.confirme }); ecrireZone('regles', r.ok ? ok(r.message) : alerte(r.erreur)); if (r.ok) await rendre(true); break;
      }
      case 'trade': {
        const ts = x => (x ? new Date(x).getTime() : null), erreurs = Object.keys(d).filter(k => k.startsWith('err-') && d[k]).map(k => k.slice(4));
        const trade = { paire: d.paire, sens: d.sens, t: ts(d.t), tSortie: ts(d.tSortie), prixEntree: num(d.prixEntree), prixSortie: num(d.prixSortie), quantite: num(d.quantite), stop: num(d.stop), objectif: num(d.objectif), pnl: num(d.pnl), frais: num(d.frais), strategie: d.strategie, regime: d.regime, notes: d.notes, erreurs };
        const r = await commandeM6({ type: 'journal_ajouter', trade }); if (r.ok) { S.m6.analyse = r.analyse; message(r.message, true); f.reset(); await rendre(true); } else ecrireZone('trade', alerte(r.erreur)); break;
      }
      case 'simulation': {
        ecrireZone('simulation', '<p>Simulation en cours (quelques secondes)…</p>'); await new Promise(r => setTimeout(r, 30));
        const demande = d.strategie ? { paire: d.paire, strategie: d.strategie } : { paire: d.paire, hypothese: { taux: num(d.taux) / 100, gainR: num(d.gainR), parSemaine: num(d.parSemaine) } };
        S.m6.simulation = await SV.simulationPour(demande); await rendre(true); break;
      }
      case 'capture': {
        if (!S.m6.image) { ecrireZone('capture', alerte('Dépose d’abord une capture.')); break; } ecrireZone('capture', '<p>Lecture de la capture par l’IA, puis vérification sur les vraies bougies…</p>');
        S.m6.captureResultat = await SV.lireCapturePage({ image: S.m6.image, paire: d.paire, unite: d.unite || null, consigne: d.consigne }); await rendre(true); break;
      }
      case 'idee-coller': { const r = await commandeM6({ type: 'idee_coller', texte: d.texte, lien: d.lien, mecanisme: d.mecanisme }); ecrireZone('idees', r.ok ? ok(r.message) : alerte(r.erreur)); if (r.ok) { f.reset(); await rendre(true); } break; }
      case 'couts': {
        const h = await obtenirHotePaire(f.dataset.paire); const r = await h.commande({ type: 'couts', fraisPct: num(d.fraisPct), spreadPct: num(d.spreadPct), glissementPct: num(d.glissementPct), confirme: !!d.confirme }); ecrireZone('couts', r.ok ? ok(f.dataset.paire + ' : ' + r.message) : alerte(f.dataset.paire + ' : ' + r.erreur)); break;
      }
      default: return false;
    }
    return true;
  }
  /* un dessin ajouté ou retiré par l'agent (API, bus, voix) pendant que le graphique est ouvert : on le redessine */
  const offDessins = GraphiqueAgent.surChangement(p => { if (p === S.paire && S.onglet === 'graphique' && !S.detruit) { clearTimeout(S.tg); S.tg = setTimeout(() => { S.signatureGraph = null; S.dernierHtml.barreGraph = null; rendre(true); }, 150); } });
  const detruire = () => { offDessins(); clearTimeout(S.tg); };
  return { detruire, rendreOnglet, htmlIdees, htmlReglagesM6, barreDessins, signatureDessins, dessinsPourGraphique, ajouterDessinUtilisateur, clicBougie, testerMaZone, action, change, soumettre, coller, propositions, basculerPaire };
}
export { COULEURS, bilanSemaine };
