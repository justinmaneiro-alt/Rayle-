import { vueEnsemble, vueStrategies, vuePortefeuille, vueTrades, vueDiagnostic, vueLaboratoire, vueReglages, tradesCSV, filtrerTrades, esc, nb, sg, heureFr, MENTION, SOURCES_LIBELLE, champsCondition } from './poste-vues.js';
import { COUCHES, COUCHES_DEFAUT, creerGraphiquePoste } from './poste-graphique.js';
import { validerRegle, decrireRegle, CATALOGUE } from '../agent-btc/regles-lab.js';
import { expliquerTrade } from '../agent-btc/contexte-trades.js';
import { ONGLETS_M6, creerGestionM6 } from './poste-m6.js';
import { creerGestionMS, ONGLET_MS } from './poste-ms.js';
import { demarrerAlertesMS } from './ms-page.js';
import { ORDRE_PAIRES } from '../agent-m6/paires.js';

/* ═════════════ LE POSTE DE PILOTAGE « AGENT BTC » : la grande fenêtre (M5) ═════════════
   Huit onglets (vue d'ensemble, stratégies, portefeuille, graphique, trades, diagnostic, laboratoire, réglages), un mode SIMPLE par défaut et un mode EXPERT.
   L'interface ne calcule rien : elle lit la vue de l'hôte (hote.vue()) et lui envoie des commandes (hote.commande(…)). Les formulaires ne sont jamais redessinés pendant qu'on les remplit. */
const ONGLETS = [['ensemble', 'Vue d’ensemble'], ['strategies', 'Stratégies'], ['teste', 'Teste ma stratégie'], ['portefeuille', 'Portefeuille'], ['graphique', 'Graphique'], ['trades', 'Trades'], ['diagnostic', 'Diagnostic'], ['gardien', 'Gardien prop'], ['tilt', 'Tilt'], ['journal', 'Journal'], ['simulation', 'Simulation d’évaluation'], ['regime', 'Régime'], ['labo', 'Laboratoire et idées'], ['capture', 'Capture d’écran'], ['sante', 'Santé'], ['reglages', 'Réglages']];
/* Groupes de navigation (V1) : six entrées au lieu d'une ligne de quinze onglets. `expert` = visible seulement en mode Expert. */
const GROUPES = [['apercu', 'Aperçu', ['ensemble']], ['marche', 'Marché et graphique', ['graphique', 'regime', 'capture']], ['strategies', 'Stratégies et tests', ['strategies', 'teste', 'labo', 'diagnostic']], ['risque', 'Risque et compte', ['portefeuille', 'gardien', 'tilt', 'simulation']], ['journal', 'Journal', ['journal', 'trades']], ['systeme', 'Système', ['sante', 'reglages']]];
const EXPERT = new Set(['regime', 'capture', 'labo', 'diagnostic', 'tilt', 'simulation', 'trades']);
const groupeDe = onglet => (GROUPES.find(g => g[2].includes(onglet)) || GROUPES[0])[0];
const NOM_PAIRE = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' };
const CLE_MODE = 'rayle_poste_mode', CLE_ONGLET = 'rayle_poste_onglet';
const lireLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, ecrireLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* interdit */ } };
const PAS = 900e3;

export function creerPoste({ conteneur, hote, activer = null, basculer = null, onglet = null, mode = null, paire = 'BTC', obtenirHotePaire = null, activerPaire = null }) {
  const racine = document.createElement('div'); racine.className = 'pa-poste';
  racine.dataset.mode = mode || (lireLocal(CLE_MODE) === 'expert' ? 'expert' : 'simple');
  racine.innerHTML = '<header class="pa-haut"><div class="pa-titre"><b data-z="titre">AGENT ' + paire + '</b> <span>poste de pilotage</span></div><div class="pa-paires" role="group" aria-label="Paire de l’agent">' + ORDRE_PAIRES.map(p => '<button type="button" data-paire="' + p + '" title="' + NOM_PAIRE[p] + '">' + p + '</button>').join('') + '</div><div class="pa-puces" data-z="puces"></div>'
    + '<div class="pa-mode" role="group" aria-label="Mode d’affichage"><button type="button" data-mode="simple">Simple</button><button type="button" data-mode="expert">Expert</button></div></header>'
    + '<nav class="pa-onglets" role="tablist"><div class="pa-nav-g">' + GROUPES.map(([id, nom]) => '<button type="button" data-groupe="' + id + '">' + nom + '</button>').join('') + '</div><div class="pa-nav-s">' + ONGLETS.map(([id, nom]) => '<button type="button" role="tab" data-onglet="' + id + '" data-g="' + groupeDe(id) + '"' + (EXPERT.has(id) ? ' class="pa-x"' : '') + '>' + nom + '</button>').join('') + '</div></nav>'
    + '<div class="pa-message" data-z="message" role="status" aria-live="polite"></div><main class="pa-corps" data-z="corps"></main>';
  conteneur.appendChild(racine);
  const z = n => racine.querySelector('[data-z="' + n + '"]');
  const S = { paire, onglet: onglet || (ONGLETS.some(o => o[0] === lireLocal(CLE_ONGLET)) ? lireLocal(CLE_ONGLET) : 'ensemble'), filtresTrades: {}, diag: {}, labo: { conditions: [], cote: 'les-deux', stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2, nom: '' }, ouvertes: new Set(), graph: { unite: 'm15', strategie: '', couches: { ...COUCHES_DEFAUT }, trades: true, source: 'tout' }, tradeChoisi: null, v: null, dernierHtml: {}, detruit: false, graphique: null, minuteur: null };

  const ms = creerGestionMS({ racine, S, message: (t, ok) => message(t, ok), rendre: f => rendre(f) });
  demarrerAlertesMS();
  const gestion = creerGestionM6({ racine, S, message: (t, ok) => message(t, ok), rendre: f => rendre(f), ouvrirOnglet: n => ouvrirOnglet(n), z, getHote: () => hote, obtenirHotePaire, getGraphique: () => S.graphique, montrerGraphique: async () => { await ouvrirOnglet('graphique'); } });
  document.addEventListener('paste', gestion.coller);
  function message(texte, ok = true) { const m = z('message'); m.textContent = texte || ''; m.className = 'pa-message' + (texte ? ' visible ' + (ok ? 'ok' : 'ko') : ''); clearTimeout(S.tm); if (texte) S.tm = setTimeout(() => { m.className = 'pa-message'; m.textContent = ''; }, 9000); }
  const telecharger = (nom, texte, type = 'application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texte], { type })); a.download = nom; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };

  /* ── puces d'état en haut ── */
  function puces(v) {
    const d = v.donnees, r = v.recherche, p = [];
    p.push('<span class="pa-puce" title="Historique BTC">' + (d.n ? '<i class="ok"></i>' + nb(d.annees, 1) + ' ans · ' + esc(d.source === 'binance' ? 'Binance' : d.source === 'bitstamp' ? 'Bitstamp (secours)' : d.source || '?') : '<i class="ko"></i>pas d’historique') + '</span>');
    p.push('<span class="pa-puce" title="Recherche sans fin">' + (v.rechercheEnCours ? '<i class="on"></i>recherche en cours' : r.pause ? '<i class="warn"></i>recherche en pause' : r.objectifAtteint ? '<i class="ok"></i>objectif atteint' : '<i class="warn"></i>recherche à l’arrêt') + ' · ' + nb(r.N) + ' variantes</span>');
    p.push('<span class="pa-puce" title="Stratégies validées / objectif"><i class="' + (r.valideesComptees ? 'ok' : 'warn') + '"></i>' + r.valideesComptees + ' / ' + r.cible + ' validées</span>');
    p.push('<span class="pa-puce pa-x" title="Critères en vigueur">critères v' + v.criteres.version + (v.criteres.modifie ? ' (modifiés)' : '') + '</span>');
    return p.join('');
  }
  const ecrire = (zone, html) => { if (S.dernierHtml[zone.dataset.z] !== html) { S.dernierHtml[zone.dataset.z] = html; zone.innerHTML = html; return true; } return false; };

  /* ── rendu des onglets ── */
  function formulaireActif() { const a = document.activeElement; return !!(a && racine.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'button'); }
  function lireFormulaireLabo() {
    const c = z('corps'); if (S.onglet !== 'labo' || !c.querySelector('[data-l]')) return;
    const val = (k) => { const e = c.querySelector('[data-l="' + k + '"]'); return e ? e.value : undefined; };
    S.labo.cote = val('cote') || S.labo.cote; S.labo.nom = val('nom') != null ? val('nom') : S.labo.nom; S.labo.R = Number(val('R')) || S.labo.R; S.labo.texteLibre = val('idee-libre') != null ? val('idee-libre') : S.labo.texteLibre;
    S.labo.conditions = [...c.querySelectorAll('.pa-cond')].map(el => lireChamps(el.querySelector('.pa-champs')));
    const st = val('stop-type'); const champs = c.querySelector('[data-l="stop-champs"]');
    if (champs) { const o = { type: st || 'atr' }; for (const e of champs.querySelectorAll('[data-s]')) o[e.dataset.s] = e.tagName === 'SELECT' ? e.value : Number(e.value); S.labo.stop = o; }
  }
  function lireChamps(el) {
    const o = { type: el.dataset.type };
    for (const e of el.querySelectorAll('[data-champ]')) { const k = e.dataset.champ; if (e.tagName === 'SELECT' && e.multiple) o[k] = [...e.selectedOptions].map(x => (/^\d+$/.test(x.value) ? Number(x.value) : x.value)); else if (e.type === 'number') o[k] = Number(e.value); else o[k] = e.value; }
    return o;
  }
  function reglePourEnvoi() { lireFormulaireLabo(); const L = S.labo; return validerRegle({ nom: L.nom || 'Règle du laboratoire', cote: L.cote, conditions: L.conditions, stop: L.stop, R: L.R }); }

  async function rendre(force = false) {
    if (S.detruit) return;
    const v = S.v = hote.vue(); ecrire(z('puces'), puces(v));
    const gAct = groupeDe(S.onglet);
    for (const b of racine.querySelectorAll('.pa-onglets [data-onglet]')) { b.classList.toggle('actif', b.dataset.onglet === S.onglet); b.hidden = b.dataset.g !== gAct; }
    for (const b of racine.querySelectorAll('.pa-onglets [data-groupe]')) b.classList.toggle('actif', b.dataset.groupe === gAct);
    for (const b of racine.querySelectorAll('.pa-mode [data-mode]')) b.classList.toggle('actif', b.dataset.mode === racine.dataset.mode);
    const corps = z('corps'); corps.dataset.onglet = S.onglet;
    for (const b of racine.querySelectorAll('.pa-paires [data-paire]')) b.classList.toggle('actif', b.dataset.paire === S.paire);
    z('titre').textContent = 'AGENT ' + S.paire;
    if (!force && formulaireActif() && ['labo', 'reglages', 'trades', 'diagnostic', ONGLET_MS, ...ONGLETS_M6].includes(S.onglet)) return;
    if (S.onglet === 'ensemble') ecrire(corps, vueEnsemble(v, hote.lectureMarche ? hote.lectureMarche() : null));
    else if (S.onglet === 'strategies') { garderOuverts(); ecrire(corps, vueStrategies(v)); restaurerOuverts(); }
    else if (S.onglet === 'portefeuille') ecrire(corps, vuePortefeuille(hote.portefeuille()));
    else if (S.onglet === 'trades') { if (force || !S.dernierHtml.trades || !formulaireActif()) ecrire(corps, vueTrades(v, hote.tousLesTrades(), S.filtresTrades)); }
    else if (S.onglet === 'diagnostic') { const ids = v.strategies.filter(s => s.horsEchantillon).map(s => s.id); if (!ids.includes(S.diag.strategie)) S.diag.strategie = ids[0]; ecrire(corps, vueDiagnostic(v, S.diag.strategie ? hote.diagnostic(S.diag.strategie, S.diag.source || 'oos') : null, S.diag)); }
    else if (S.onglet === 'labo') { if (!S.laboModifie) lireFormulaireLabo(); S.laboModifie = false; ecrire(corps, vueLaboratoire(v, S.labo) + await gestion.htmlIdees()); }
    else if (S.onglet === 'reglages') { if (force || !S.dernierHtml.reglages) ecrire(corps, vueReglages(v) + await gestion.htmlReglagesM6()); S.dernierHtml.reglages = true; }
    else if (S.onglet === ONGLET_MS) await ms.rendreOnglet(corps, ecrire, force);
    else if (ONGLETS_M6.has(S.onglet)) await gestion.rendreOnglet(S.onglet, corps, ecrire, force, v);
    else if (S.onglet === 'graphique') await rendreGraphique(force);
  }
  function garderOuverts() { for (const d of racine.querySelectorAll('details[data-id]')) { if (d.open) S.ouvertes.add(d.dataset.id); else S.ouvertes.delete(d.dataset.id); } }
  function restaurerOuverts() { for (const d of racine.querySelectorAll('details[data-id]')) d.open = S.ouvertes.has(d.dataset.id); }

  /* ── graphique ── */
  const tradesDuGraphique = () => {
    const g = S.graph, tous = hote.tousLesTrades().filter(x => (!g.strategie || x.strategie === g.strategie) && (g.source === 'tout' || x.source === g.source));
    return tous;
  };
  function positionsAffichees() {
    const v = S.v, g = S.graph, derniere = v.derniereBarre || 0, out = [];
    for (const a of v.alertes) if (a.type === 'ENTREE' && (!g.strategie || a.strategie === g.strategie) && a.tSignal >= derniere - 3 * PAS) out.push({ t: a.t, sens: a.sens, entree: a.entree, stop: a.stop, cible: a.cible, nom: a.nomStrategie, etiquette: nb(a.R, 0) + ' R' });
    for (const p of v.compte.ouvertes) if (!g.strategie || p.strategie === g.strategie) out.push({ t: p.entreeT, sens: p.sens, entree: p.entree, stop: p.stop, cible: p.cible, nom: (v.strategies.find(s => s.id === p.strategie) || {}).nom, etiquette: 'en cours' });
    return out;
  }
  async function rendreGraphique(force) {
    const v = S.v, g = S.graph, corps = z('corps');
    if (!corps.querySelector('.pa-graph')) {
      S.dernierHtml.corps = null; corps.innerHTML = '<div class="pa-graph"><div class="pa-graph-barre" data-g="barre"></div><div class="pa-graph-boite" data-g="boite"></div><div class="pa-graph-cote" data-g="cote"></div></div>';
      S.graphique = null;
    }
    const barre = corps.querySelector('[data-g="barre"]');
    const options = v.strategies.filter(s => s.horsEchantillon || s.compteSimule.n).map(s => '<option value="' + esc(s.id) + '"' + (g.strategie === s.id ? ' selected' : '') + '>' + esc(s.nom) + '</option>').join('');
    const html = '<label>Stratégie <select data-g-champ="strategie"><option value="">toutes</option>' + options + '</select></label>'
      + '<span class="pa-unites">' + ['m15', 'h1', 'h4'].map(u => '<button type="button" data-g-unite="' + u + '" class="' + (g.unite === u ? 'actif' : '') + '">' + u.toUpperCase() + '</button>').join('') + '</span>'
      + '<label>Trades <select data-g-champ="source"><option value="tout"' + (g.source === 'tout' ? ' selected' : '') + '>tous</option>' + Object.entries(SOURCES_LIBELLE).map(([k, l]) => '<option value="' + k + '"' + (g.source === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>'
      + '<label class="pa-case"><input type="checkbox" data-g-trades' + (g.trades ? ' checked' : '') + '> flèches des trades</label>'
      + '<span class="pa-couches">' + COUCHES.map(c => '<label class="pa-case"><input type="checkbox" data-g-couche="' + c.id + '"' + (g.couches[c.id] ? ' checked' : '') + '> ' + esc(c.nom) + '</label>').join('') + '</span>'
      + '<button type="button" class="pa-btn" data-a="dernier-trade">Dernier trade</button>' + gestion.barreDessins()
      + (g.couches.phase ? '<span class="pa-legende">Bandeau du bas, phase H1 : <i style="background:rgba(39,217,138,.8)"></i>hausse <i style="background:rgba(255,77,94,.8)"></i>baisse <i style="background:rgba(150,170,185,.6)"></i>range <i style="background:rgba(255,176,0,.55)"></i>transition</span>' : '');
    if (S.dernierHtml.barreGraph !== html) { S.dernierHtml.barreGraph = html; barre.innerHTML = html; }
    if (!hote.serie || !hote.serie().n) { corps.querySelector('[data-g="boite"]').innerHTML = '<p class="pa-vide pa-grand">Pas d’historique : active l’agent dans la vue d’ensemble.</p>'; S.graphique = null; return; }
    if (!S.graphique) { try { S.graphique = await creerGraphiquePoste({ boite: corps.querySelector('[data-g="boite"]'), hote, surTrade: x => detailTrade(x), surBougie: i => gestion.clicBougie(i), surDessin: (spec, mode) => gestion.ajouterDessinUtilisateur(spec, mode), surMessage: t => message(t, true) }); force = true; } catch (e) { corps.querySelector('[data-g="boite"]').innerHTML = '<p class="pa-vide pa-grand">Graphique indisponible : ' + esc(e.message) + '</p>'; return; } }
    const signature = JSON.stringify([g.unite, g.strategie, g.source, g.trades, g.couches, v.derniereBarre, v.alertes.length, v.compte.ouvertes.length, S.fenetreGraph || null, S.paire, gestion.signatureDessins()]);
    if (force || S.signatureGraph !== signature) { S.signatureGraph = signature; await S.graphique.charger({ unite: g.unite, couches: g.couches, trades: tradesDuGraphique(), positions: positionsAffichees(), optionsTrades: g.trades, fenetre: S.fenetreGraph || null, dessins: gestion.dessinsPourGraphique(), cadrer: force }); }
  }
  function detailTrade(x) {
    S.tradeChoisi = x; const nom = x.nomStrategie || '', e = expliquerTrade(x, nom), cote = racine.querySelector('[data-g="cote"]'), tableDetail = racine.querySelector('#pa-trade-detail');
    const html = '<h4>' + esc(nom) + ' · ' + (x.sens > 0 ? 'achat' : 'vente') + ' <small>' + esc(SOURCES_LIBELLE[x.source] || '') + '</small></h4><p class="pa-phrase">' + esc(e.pris) + '</p><p class="pa-phrase ' + (x.R > 0 ? 'gagne' : 'perd') + '">' + esc(e.fin) + '</p>'
      + '<div class="pa-grille-mini"><span>Entrée <b>' + nb(x.prixEntree, 0) + '</b></span><span>Stop <b>' + nb(x.stop, 0) + '</b></span><span>Objectif <b>' + nb(x.cible, 0) + '</b></span><span>Sortie <b>' + nb(x.prixSortie, 0) + '</b></span><span>Résultat <b>' + sg(x.R) + ' R</b></span></div>'
      + '<div class="pa-actions"><button type="button" class="pa-btn" data-a="trade-graphique">Voir sur le graphique</button><button type="button" class="pa-btn pa-fort" data-a="trade-rejouer">Rejouer pas à pas</button></div><div class="pa-rejeu" data-g="rejeu"></div>';
    if (cote) cote.innerHTML = html; if (tableDetail) tableDetail.innerHTML = html;
  }
  async function allerAuTrade(x, rejouer = false) {
    S.graph.strategie = x.strategie; S.graph.unite = 'm15'; await ouvrirOnglet('graphique');
    S.fenetreGraph = { t0: x.t - 60 * PAS, t1: (x.tSortie || x.t) + 40 * PAS }; S.signatureGraph = null; await rendre(true);
    if (S.graphique) { S.graphique.selectionner(x); detailTrade(x); }
    if (rejouer && S.graphique) { const r = S.graphique.demarrerRejeu(x); majRejeu(r ? { i: r.entree, total: r.total } : null); }
  }
  function majRejeu(info) {
    const el = racine.querySelector('[data-g="rejeu"]'); if (!el) return;
    el.innerHTML = info ? '<span>Rejeu : bougie ' + info.i + ' / ' + info.total + '</span> <button type="button" class="pa-btn" data-a="rejeu-pas" data-d="-1">◀</button><button type="button" class="pa-btn" data-a="rejeu-pas" data-d="1">▶ Pas suivant</button><button type="button" class="pa-btn" data-a="rejeu-auto">▶▶ Lecture</button><button type="button" class="pa-btn" data-a="rejeu-fin">Quitter le rejeu</button>' : '';
  }
  async function ouvrirOnglet(nom) {
    if (!ONGLETS.some(o => o[0] === nom)) return false; if (S.onglet === 'strategies') garderOuverts();
    if (nom !== 'graphique' && S.graphique) { S.graphique.detruire(); S.graphique = null; S.signatureGraph = null; }
    if (nom !== 'graphique') S.fenetreGraph = null;
    S.onglet = nom; S.dernierHtml = {}; ecrireLocal(CLE_ONGLET, nom); z('corps').innerHTML = ''; await rendre(true); return true;
  }
  async function dernierTrade(rejouer = false) {
    const tous = hote.tousLesTrades().sort((a, b) => b.t - a.t); const x = tous[0]; if (!x) { message('Aucun trade à montrer : aucune stratégie validée n’a encore de trade.', false); return null; }
    await allerAuTrade(x, rejouer); return x;
  }
  /* M6 : rejeu pas à pas de la période affichée (les 120 dernières bougies M15 si rien n'est affiché). */
  async function rejouerPeriode() {
    await ouvrirOnglet('graphique'); await rendre(true); if (!S.graphique) return 'Le graphique n’est pas disponible : active l’agent.';
    const per = S.graphique.periodeAffichee(); if (!per) return 'Aucune bougie affichée.'; const fin = per.t1, debut = Math.max(per.t0, fin - 120 * PAS);
    const r = S.graphique.demarrerRejeuPeriode(debut, fin); if (!r) return 'Pas assez de bougies M15 pour rejouer cette période.'; majRejeu({ i: 1, total: r.total }); const e = S.graphique.pasRejeu(0); majRejeu({ i: e.i, total: e.total });
    return 'Rejeu de la période : ' + r.total + ' bougies, avance avec « pas suivant » (tu ne vois jamais la bougie suivante).';
  }
  /* M6 : changer de paire (BTC, SOL, DOGE) : tout le poste lit alors l'hôte de cette paire. */
  async function choisirPaire(id) {
    id = String(id).toUpperCase(); if (!ORDRE_PAIRES.includes(id) || !obtenirHotePaire) return false; if (id === S.paire) return true;
    message('Chargement de ' + NOM_PAIRE[id] + '…'); const h = await obtenirHotePaire(id); if (S.detruit) return false;
    hote = h; S.paire = id; S.graph.strategie = ''; S.fenetreGraph = null; S.tradeChoisi = null; S.diag = {}; S.filtresTrades = {};
    if (S.graphique) { S.graphique.detruire(); S.graphique = null; } S.signatureGraph = null; S.dernierHtml = {}; z('corps').innerHTML = ''; ecrireLocal('rayle_poste_paire', id); await rendre(true); message(''); return true;
  }

  /* ── actions ── */
  async function commande(c, { ok = null } = {}) { const r = await hote.commande(c); message(r.ok ? (ok || r.message || 'Fait.') : (r.erreur || 'Impossible.'), r.ok); await rendre(true); return r; }
  const val = (el, nom) => { const e = el.querySelector('[name="' + nom + '"]'); return e ? (e.type === 'checkbox' ? e.checked : e.value) : undefined; };
  function profilDepuisForm(f) {
    return { style: val(f, 'style'), unites: ['m15', 'h1', 'h4'].filter(u => val(f, 'unite-' + u)), risquePct: Number(val(f, 'risquePct')), maxParSemaine: Number(val(f, 'maxParSemaine')), maxSimultanees: Number(val(f, 'maxSimultanees')), reposHeures: Number(val(f, 'reposHeures')), capital: Number(val(f, 'capital')),
      reglesInterdites: [...f.querySelectorAll('[name^="interdit-"]')].filter(e => e.checked).map(e => e.name.slice(9)), cible: Number(val(f, 'cible')),
      budget: { charge: val(f, 'charge') || 'douce', chantiersParTranche: Number(val(f, 'chantiersParTranche')) || 60, tempsMsParTranche: (Number(val(f, 'tempsTranche')) || 60) * 1000 },
      arrierePlan: { actif: !!val(f, 'arrierePlan'), heureDebut: val(f, 'heureDebut'), heureFin: val(f, 'heureFin'), pauseDansJeu: !!val(f, 'pauseDansJeu'), processusJeu: String(val(f, 'processusJeu') || '').split(',').map(s => s.trim()).filter(Boolean) },
      notifications: { telegram: !!val(f, 'notifTelegram'), application: !!val(f, 'notifApp'), hebdo: !!val(f, 'notifHebdo') } };
  }
  function objectifDepuisForm(f) { return { objectif: { rNetMin: Number(val(f, 'rNetMin')), tradesMin: Number(val(f, 'tradesMin')), rNetHaut: Number(val(f, 'rNetHaut')) }, confirmationTrades: Number(val(f, 'confirmationTrades')) }; }
  const retour = (nom, html) => { const e = racine.querySelector('[data-r="' + nom + '"]'); if (e) e.innerHTML = html; };

  racine.addEventListener('click', async ev => {
    const bm = ev.target.closest('.pa-mode [data-mode]'); if (bm) { racine.dataset.mode = bm.dataset.mode; ecrireLocal(CLE_MODE, bm.dataset.mode); await rendre(true); return; }
    const bo = ev.target.closest('.pa-onglets [data-onglet]'); if (bo) { await ouvrirOnglet(bo.dataset.onglet); return; }
    const bg = ev.target.closest('.pa-onglets [data-groupe]'); if (bg) { const g = GROUPES.find(x => x[0] === bg.dataset.groupe); if (g && groupeDe(S.onglet) !== g[0]) await ouvrirOnglet(g[2][0]); return; }
    const bp = ev.target.closest('.pa-paires [data-paire]'); if (bp) { await choisirPaire(bp.dataset.paire); return; }
    const bu = ev.target.closest('[data-g-unite]'); if (bu) { S.graph.unite = bu.dataset.gUnite; S.fenetreGraph = null; await rendre(true); return; }
    const tr = ev.target.closest('.pa-table tr[data-t]'); if (tr && !ev.target.closest('a,button')) { const x = hote.tousLesTrades().find(t => String(t.t) === tr.dataset.t && t.strategie === tr.dataset.id && t.source === tr.dataset.source); if (x) detailTrade(x); return; }
    const b = ev.target.closest('[data-a]'); if (!b || b.tagName === 'INPUT') return; const a = b.dataset.a, id = b.dataset.id;
    switch (a) {
      case 'activer-donnees': { const act = S.paire === 'BTC' ? activer : (activerPaire ? () => activerPaire(S.paire) : null); if (act) { message('Téléchargement de l’historique de ' + NOM_PAIRE[S.paire] + ' en cours…'); await act(); await rendre(true); } break; }
      case 'recherche-reprise': await commande({ type: 'recherche_reprise' }); break;
      case 'recherche-pause': await commande({ type: 'recherche_pause' }); break;
      case 'activer': case 'pause': case 'reactiver': await commande({ type: a, id }); break;
      case 'dupliquer': { const r = await hote.commande({ type: 'dupliquer', id }); if (r.ok && r.regle) { S.labo = { conditions: r.regle.conditions, cote: r.regle.cote, stop: r.regle.stop, R: r.regle.R, nom: r.nom, retour: '<p class="pa-ok">' + esc(r.message) + '</p>' }; S.laboModifie = true; await ouvrirOnglet('labo'); message(r.message, true); } else message(r.erreur || 'Impossible.', false); break; }
      case 'suspendre': await commande({ type: 'suspendre', id, raison: 'suspendue manuellement' }); break;
      case 'supprimer': { const s = S.v.strategies.find(x => x.id === id); if (window.confirm('Supprimer la stratégie « ' + (s ? s.nom : id) + ' » ? Le journal garde la trace, mais la stratégie et ses preuves disparaissent.')) await commande({ type: 'supprimer', id }); break; }
      case 'voir-graphique': S.graph.strategie = id; S.fenetreGraph = null; await ouvrirOnglet('graphique'); break;
      case 'exporter': { const r = await hote.commande({ type: 'exporter' }); if (r.ok) { telecharger('rayle-bibliotheque-btc-' + new Date().toISOString().slice(0, 10) + '.json', r.texte); message('Bibliothèque exportée.'); } break; }
      case 'exporter-trades': telecharger('rayle-trades-btc.csv', tradesCSV(filtrerTrades(hote.tousLesTrades(), S.filtresTrades).sort((x, y) => y.t - x.t)), 'text/csv;charset=utf-8'); message('Trades exportés.'); break;
      case 'dernier-trade': await dernierTrade(); break;
      case 'trade-graphique': if (S.tradeChoisi) await allerAuTrade(S.tradeChoisi); break;
      case 'trade-rejouer': if (S.tradeChoisi) await allerAuTrade(S.tradeChoisi, true); break;
      case 'rejeu-pas': if (S.graphique) majRejeu(S.graphique.pasRejeu(Number(b.dataset.d))); break;
      case 'rejeu-auto': { if (!S.graphique) break; clearInterval(S.minRejeu); S.minRejeu = setInterval(() => { const r = S.graphique && S.graphique.pasRejeu(1); majRejeu(r); if (!r || r.fini) clearInterval(S.minRejeu); }, 350); break; }
      case 'rejeu-fin': clearInterval(S.minRejeu); if (S.graphique) S.graphique.finRejeu(); S.fenetreGraph = null; S.signatureGraph = null; majRejeu(null); await rendre(true); break;
      case 'cond-ajouter': { lireFormulaireLabo(); const type = racine.querySelector('[data-l="type-nouveau"]').value, cat = CATALOGUE[type], c = { type }; for (const [k, dom] of Object.entries(cat.champs)) c[k] = k === 'valeurs' ? [dom[0]] : (Array.isArray(dom) && typeof dom[0] === 'string') ? dom[0] : dom[0]; S.labo.conditions.push(c); S.laboModifie = true; S.dernierHtml = {}; await rendre(true); break; }
      case 'cond-retirer': lireFormulaireLabo(); S.labo.conditions.splice(Number(b.dataset.i), 1); S.laboModifie = true; S.dernierHtml = {}; await rendre(true); break;
      case 'regle-verifier': { const r = reglePourEnvoi(); retour('constructeur', r.ok ? '<p class="pa-ok">Règle valide.</p><p class="pa-phrase">' + esc(decrireRegle(r.regle)) + '</p>' : '<ul class="pa-alerte">' + r.erreurs.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>'); S.labo.retour = racine.querySelector('[data-r="constructeur"]').innerHTML; break; }
      case 'regle-proposer': { const r = reglePourEnvoi(); if (!r.ok) { retour('constructeur', '<ul class="pa-alerte">' + r.erreurs.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>'); break; } const res = await hote.commande({ type: 'idee_proposer', regle: r.regle, origine: 'constructeur' }); S.labo.retour = res.ok ? '<p class="pa-ok">' + esc(res.message) + '</p><p class="pa-phrase">' + esc(res.description) + '</p>' : '<p class="pa-alerte">' + esc(res.erreur) + '</p>'; S.dernierHtml = {}; await rendre(true); break; }
      case 'idee-traduire': { if (id) { await gestion.action(a, b, ev); break; } lireFormulaireLabo(); const texte = (S.labo.texteLibre || '').trim(); if (texte.length < 8) { retour('idee', '<p class="pa-alerte">Écris une phrase un peu plus complète.</p>'); break; } retour('idee', '<p>Traduction en cours…</p>'); const r = await hote.ideeLibre(texte); S.labo.retourIdee = r.ok ? '<p class="pa-ok">' + esc(r.message) + '</p><p class="pa-phrase">' + esc(r.description) + '</p>' + (r.explication ? '<p class="pa-avert">' + esc(r.explication) + '</p>' : '') : '<p class="pa-alerte">' + esc(r.erreur) + '</p>'; S.dernierHtml = {}; await rendre(true); break; }
      case 'idee-valider': await commande({ type: 'idee_valider', id }); break;
      case 'idee-refuser': await commande({ type: 'idee_refuser', id }); break;
      case 'consignes-lire': case 'consignes-appliquer': {
        const texte = racine.querySelector('[data-l="consignes"]').value, r = await hote.commande({ type: a === 'consignes-lire' ? 'consignes_lire' : 'consignes_appliquer', texte });
        const l = r.lecture; retour('consignes', (r.ok ? '<p class="pa-ok">' + esc(r.message) + '</p>' : '<p class="pa-alerte">' + esc(r.erreur) + '</p>') + (l ? '<ul>' + l.comprises.map(c => '<li>« ' + esc(c.texte) + ' » → ' + esc(c.effet) + '</li>').join('') + '</ul>' + (l.nonComprises.length ? '<p class="pa-alerte">Non compris (ignoré) : ' + l.nonComprises.map(esc).join(' · ') + '</p>' : '') + (l.seuils ? '<p class="pa-alerte">Un changement d’objectif est un changement de SEUIL : il se fait plus bas, avec confirmation.</p>' : '') : '')); if (a === 'consignes-appliquer') { S.dernierHtml.reglages = null; message(r.message, r.ok); } break;
      }
      case 'seuils-apercu': { const f = b.closest('form'), r = await hote.commande({ type: 'seuils_apercu', ...objectifDepuisForm(f) }); retour('seuils', '<p>' + esc(r.message || r.erreur) + '</p>'); break; }
      case 'seuils-appliquer': { const f = b.closest('form'); if (!val(f, 'confirme')) { retour('seuils', '<p class="pa-alerte">Coche la case de confirmation pour appliquer.</p>'); break; } const r = await hote.commande({ type: 'seuils_appliquer', ...objectifDepuisForm(f), confirme: true }); retour('seuils', '<p class="' + (r.ok ? 'pa-ok' : 'pa-alerte') + '">' + esc(r.message || r.erreur) + '</p>'); if (r.ok) { S.dernierHtml.reglages = null; await rendre(true); } break; }
      default: if (await ms.action(a, b, ev)) break; await gestion.action(a, b, ev); break;
    }
  });
  racine.addEventListener('change', async ev => {
    const t = ev.target; if (await ms.change(t, ev)) return; if (await gestion.change(t, ev)) return;
    if (t.matches('[data-f]')) { const k = t.dataset.f; if (t.type === 'date') S.filtresTrades[k] = t.value ? new Date(t.value + (k === 'a' ? 'T23:59:59Z' : 'T00:00:00Z')).getTime() : undefined; else S.filtresTrades[k] = t.value || undefined; S.dernierHtml = {}; await rendre(true); }
    else if (t.matches('[data-d]')) { S.diag[t.dataset.d] = t.value; S.dernierHtml = {}; await rendre(true); }
    else if (t.matches('[data-g-champ]')) { S.graph[t.dataset.gChamp] = t.value; S.fenetreGraph = null; await rendre(true); }
    else if (t.matches('[data-g-couche]')) { S.graph.couches[t.dataset.gCouche] = t.checked; await rendre(true); }
    else if (t.matches('[data-g-trades]')) { S.graph.trades = t.checked; await rendre(true); }
    else if (t.matches('[data-l="stop-type"]')) { lireFormulaireLabo(); S.labo.stop = t.value === 'atr' ? { type: 'atr', tf: 'h1', k: 1.5 } : { type: 'structure', L: 24, pad: 0.3 }; S.laboModifie = true; S.dernierHtml = {}; await rendre(true); }
    else if (t.matches('input[data-a="importer"]')) { const f = t.files && t.files[0]; if (!f) return; const texte = await f.text(); await commande({ type: 'importer', texte }); t.value = ''; }
  });
  racine.addEventListener('submit', async ev => {
    if (ms.soumettre(ev)) return;
    if (await gestion.soumettre(ev)) return;
    const f = ev.target.closest('form[data-form="profil"]'); if (!f) return; ev.preventDefault();
    const patch = profilDepuisForm(f), avant = !!(S.v && S.v.profil.arrierePlan.actif);
    const r = await hote.commande({ type: 'profil', patch }); let texte = r.message || r.erreur, bon = r.ok;
    if (r.ok && basculer && patch.arrierePlan.actif !== avant) {                       // « recherche en arrière-plan » cochée ou décochée : l'état passe entre la page et le Veilleur du PC
      try { texte = await basculer(patch.arrierePlan.actif); } catch (x) { bon = false; texte = 'Passage impossible : ' + (x && x.message || x); await hote.commande({ type: 'profil', patch: { arrierePlan: { ...patch.arrierePlan, actif: avant } } }); }
    }
    retour('profil', '<p class="' + (bon ? 'pa-ok' : 'pa-alerte') + '">' + esc(texte) + '</p>'); message(texte, bon); S.dernierHtml.reglages = null; await rendre(true);
  });

  const rafraichir = () => { if (S.detruit) return; clearTimeout(S.rt); S.rt = setTimeout(() => rendre(false), 250); };
  S.minuteur = setInterval(() => { if (!S.detruit && !document.hidden && S.onglet === 'ensemble') rendre(false); }, 20000);
  rendre(true);
  return {
    racine, rafraichir, ouvrirOnglet, dernierTrade, montrerTrade: x => allerAuTrade(x), rendre, message, choisirPaire, paire: () => S.paire, rejouerPeriode, gestion,
    mode: () => racine.dataset.mode, definirMode: m => { racine.dataset.mode = m === 'expert' ? 'expert' : 'simple'; ecrireLocal(CLE_MODE, racine.dataset.mode); return rendre(true); },
    onglet: () => S.onglet, etat: () => ({ onglet: S.onglet, mode: racine.dataset.mode, graph: S.graphique ? S.graphique.etat() : null, tradeChoisi: !!S.tradeChoisi }),
    detruire() { document.removeEventListener('paste', gestion.coller); gestion.detruire(); ms.detruire(); S.detruit = true; clearInterval(S.minuteur); clearInterval(S.minRejeu); clearTimeout(S.rt); if (S.graphique) S.graphique.detruire(); racine.remove(); }
  };
}
