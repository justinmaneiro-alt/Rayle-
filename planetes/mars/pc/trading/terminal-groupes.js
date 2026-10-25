import { creerGestionnaire, chargerStyle } from '../../../../core/commun/gestionnaire-fenetres.js';
import { creerCalcul } from '../../../../core/commun/fenetres-calcul.js';
import { creerDossiers } from '../../../../core/commun/dossiers.js';
import { obtenirClient } from './session.js';
import { INSTRUMENTS, UNITES, ORDRE_UNITES, WATCHLIST } from './instruments.js';
import { REGLAGES_DEFAUT, REGLAGES_LEGERS, creerGraphique } from './graphique.js';
import { PANNEAUX, descriptionSource } from './espace.js';
import { resume } from './analyse.js';
import { GROUPES, DOSSIERS, PRESETS, PANNEAUX_TERMINAL, REGISTRE_DE, GRAPHIQUES, panneau, groupeDe, etatInitial, normaliser, basculer, ajouter, appliquerPreset, reinitialiser } from './groupes-terminal.js';
import { reelVersHtml, magasinReels } from './rendu-reel.js';

/* ═════════════ TERMINAL DE MARS PAR DOSSIERS (R2 phase 3, puis R3 phase 1) ═════════════
   Les 26 panneaux du terminal sont rangés dans 7 DOSSIERS holographiques. Par défaut la fenêtre « Dossiers » n'affiche que les classeurs (nom, icône, nombre de fenêtres) ;
   un appui ouvre le dossier en carrousel 3D (core/commun/dossiers.js) ; la fenêtre du centre s'envole vers l'espace de travail où l'on peut en poser autant qu'on veut
   (gestionnaire commun : déplacer, agrandir, réduire, pincer, épingler, fermer). Un bouton (ou le menu de la fenêtre) la remet dans son dossier. Les fenêtres posées sont mémorisées,
   préréglages Trading, Macro, Surveillance ; « Réinitialiser ». Graphiques en vraies bougies (Lightweight Charts). Zéro IA, aucun ordre : mêmes données et mêmes calculs qu’avant.
   Les panneaux de l’agent (performance, gardien…) affichent les mêmes données que sur le mur ; le bouton « Ouvrir le poste de l’agent » ouvre le poste inchangé. */
const CLE_ETAT = 'rayle_mars_terminal', ID_SEL = 'selecteur';
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lireEtat = () => { try { return normaliser(JSON.parse(localStorage.getItem(CLE_ETAT) || 'null')); } catch (e) { return etatInitial(); } };
const ecrireEtat = e => { try { localStorage.setItem(CLE_ETAT, JSON.stringify(e)); } catch (x) { /* stockage interdit */ } };
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const INS_DE_FENETRE = { BTC: 'graphique-btc', SOL: 'graphique-sol', DOGE: 'graphique-doge', US100: 'graphique-us100', XAU: 'graphique-or' };

let T = null, ouverture = null, surFermeture = () => {};
export const terminalOuvert = () => !!T;
export const surTerminalFerme = f => { surFermeture = f; };

function chargerCss() {
  chargerStyle();
  for (const [id, f] of [['mars-trading-css', './espace.css'], ['mars-trading-css-v1', './v1-agent.css'], ['tm-css', './terminal-groupes.css']]) {
    if (document.getElementById(id)) continue;
    const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = new URL(f, import.meta.url).href; document.head.appendChild(l);
  }
}
const calc = creerCalcul({ marge: 10, haut: 64, bas: 78, miniL: 340, miniH: 220, tailles: { graphique: [0.46, 0.62], panneau: [0.34, 0.62], selecteur: [0.24, 0.72], grand: [0.56, 0.76] }, plafond: { graphique: [1300, 860], panneau: [820, 880], selecteur: [460, 820], grand: [1180, 900] } });

/* ── Contenus ── */
function fenetreGraphique(client, instrument, unite, { tactile, ouvrirEspace }) {
  const racine = h('div', 'tm-graph'), barre = h('div', 'tm-graph-barre'), info = h('div', 'tm-graph-info'), zone = h('div', 'tm-graph-zone'); zone.dataset.pasPincer = '1';
  racine.append(barre, info, zone);
  let ins = instrument, un = unite, graphique = null, desabonner = null, detruit = false, derniere = null, premiere = true, jeton = 0;
  const unites = h('span', 'tm-unites');
  for (const u of ORDRE_UNITES) { const b = h('button', 'tm-btn', UNITES[u].nom); b.type = 'button'; b.dataset.u = u; b.onclick = () => { un = u; charger(); majBarre(); }; unites.appendChild(b); }
  const bRec = h('button', 'tm-btn', '⤢ Recadrer'), bTv = h('button', 'tm-btn', 'TradingView…');
  bRec.type = bTv.type = 'button'; bRec.onclick = () => { if (graphique && !detruit) graphique.recadrer(); }; bTv.title = 'Ouvrir l’espace de travail complet (TradingView, indicateurs, dock)'; bTv.onclick = () => ouvrirEspace && ouvrirEspace({ instrument: ins, unite: un });
  barre.append(unites, bRec, bTv);
  const majBarre = () => { for (const b of unites.children) b.classList.toggle('actif', b.dataset.u === un); };
  function majInfo() { const d = descriptionSource(derniere); info.innerHTML = '<b>' + esc(INSTRUMENTS[ins].nom) + ' · ' + esc(UNITES[un].long) + '</b>' + d.etiquettes.map(t => '<em class="tm-et ' + (/indispo|périmé|secours/.test(t) ? 'alerte' : '') + '">' + esc(t) + '</em>').join('') + '<span>' + esc(d.texte) + '</span>'; }
  function charger() {
    const mon = ++jeton; if (desabonner) { desabonner(); desabonner = null; } derniere = null; premiere = true; majInfo(); if (graphique) graphique.message('Chargement…');
    desabonner = client.abonner(ins, un, r => {
      if (mon !== jeton || detruit || !r || r.instrument !== ins || r.unite !== un) return; derniere = r; majInfo();
      if (!graphique) return;
      if (r.vide) graphique.message(r.erreur ? 'INDISPONIBLE : ' + r.erreur : 'Chargement…');
      else { graphique.message(''); if (premiere) { graphique.definir({ instrument: r.instrument, unite: r.unite, bougies: r.bougies }); premiere = false; } else graphique.maj(r.bougies); }
    }, { tick: 15000 });
  }
  majBarre(); majInfo();
  creerGraphique({ boite: zone, reglages: tactile ? REGLAGES_LEGERS : REGLAGES_DEFAUT }).then(g => { if (detruit) { g.detruire(); return; } graphique = g; if (derniere && !derniere.vide) { g.definir({ instrument: derniere.instrument, unite: derniere.unite, bougies: derniere.bougies }); premiere = false; g.message(''); } else g.message('Chargement…'); })
    .catch(e => { zone.innerHTML = '<p class="tm-vide tm-ko">Graphique indisponible : ' + esc(e.message) + '</p>'; });
  charger();
  return { racine, sansMarge: true, redim() { if (graphique && !detruit) { try { graphique.recadrer(); } catch (e) { /* graphique déjà détruit */ } } }, detruire() { detruit = true; jeton++; if (desabonner) desabonner(); desabonner = null; if (graphique) { try { graphique.detruire(); } catch (e) { /* déjà détruit */ } graphique = null; } }, etat: () => ({ instrument: ins, unite: un, bougies: derniere ? derniere.bougies.length : 0, graphique }) };
}

/* Panneau du registre de l’espace de travail (watchlist, dashboard, COT…) avec un contexte local : instrument choisi dans une rangée de boutons. */
function fenetreRegistre(client, regId, { ouvrirGraphique }) {
  const etat = { instrument: 'US100', unite: 'H1' }; let derniere = null, desabonner = null, p = null, jeton = 0;
  const racine = h('div', 'tm-registre'), choix = h('div', 'tm-choix'), corps = h('div', 'tm-registre-corps');
  const avecChoix = regId === 'dashboard' || regId === 'resume';
  const ctx = { client, etat: () => ({ ...etat }), serieCourante: () => derniere, choisirInstrument: id => { if (avecChoix) { if (!INSTRUMENTS[id] || id === etat.instrument) return false; etat.instrument = id; rafraichir(true); return true; } ouvrirGraphique(id); return true; }, choisirUnite: u => { etat.unite = u; } };
  p = PANNEAUX[regId].creer(ctx); corps.appendChild(p.racine);
  if (avecChoix) { for (const id of WATCHLIST) { const b = h('button', 'tm-btn', esc(INSTRUMENTS[id].court)); b.type = 'button'; b.dataset.id = id; b.onclick = () => ctx.choisirInstrument(id); choix.appendChild(b); } racine.append(choix); }
  racine.append(corps);
  function majChoix() { for (const b of choix.children) b.classList.toggle('actif', b.dataset.id === etat.instrument); }
  function rafraichir(changeInstrument) {
    majChoix();
    if (regId === 'resume') { if (changeInstrument || !desabonner) { if (desabonner) desabonner(); const mon = ++jeton; desabonner = client.abonner(etat.instrument, 'H1', r => { if (mon !== jeton || !r || r.vide) return; derniere = r; p.maj(); }, { tick: 20000 }); } }
    else if (p.maj) { try { const r = p.maj(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* un panneau défaillant ne bloque pas la fenêtre */ } }
  }
  rafraichir(true);
  const minuterie = setInterval(() => rafraichir(false), 60000);
  return { racine, detruire() { clearInterval(minuterie); jeton++; if (desabonner) desabonner(); try { p.detruire && p.detruire(); } catch (e) { /* déjà détruit */ } } };
}

/* Panneau alimenté par la table (performance, gardien, régime…) : mêmes données que sur le mur. */
function fenetreReel(id, def, { ouvrirPoste }) {
  const racine = h('div', 'tm-reel'), corps = h('div', 'tm-reel-corps'), pied = h('div', 'tm-reel-pied');
  racine.append(corps, pied);
  const dessiner = () => { corps.innerHTML = reelVersHtml(magasinReels.lire(id), def); };
  dessiner(); const off = magasinReels.abonner(i => { if (i === id) dessiner(); });
  if (def.onglet || id === 'agent-btc') { const b = h('button', 'tm-btn', 'Ouvrir le poste de l’agent'); b.type = 'button'; b.onclick = () => ouvrirPoste({ onglet: def.onglet || undefined }); pied.appendChild(b); }
  return { racine, detruire() { off(); } };
}

/* ── Le terminal ── */
async function creer({ tactile = false, ouvrirEspace = null, ouvrirPoste = () => {} } = {}) {
  chargerCss();
  const client = await obtenirClient();
  const hote = h('div', 'tm-hote'); document.body.appendChild(hote);
  let etat = lireEtat(), fermeture = false;
  const instances = new Map();                // id panneau → contenu
  const gf = creerGestionnaire({ ui: hote, prefixe: 'gf', calc, cle: 'mars-terminal', idRacine: 'mars-terminal', libelleBarre: 'Fenêtres', vue: 'Mars', surChangement: liste => { if (!fermeture && ready && liste.length === 0) fermer(); }, surRanger: wid => { if (/^p-/.test(wid)) D.rentrer(wid.slice(2)); } });
  let ready = false;
  const sauver = () => ecrireEtat(etat);
  const infos = Object.fromEntries(PANNEAUX_TERMINAL.map(p => [p.id, { titre: p.titre, icone: p.icone, apercu: p.apercu, etat: p.reel ? 'reel' : 'bientot' }]));
  const D = creerDossiers({
    dossiers: DOSSIERS, fenetres: infos, vue: 'Terminal de Mars',
    estPosee: id => !!gf.obtenir('p-' + id), poser: id => ouvrirPanneau(id), ranger: id => retirerPanneau(id),
    rectFenetre: id => { const o = gf.obtenir('p-' + id); return o ? o.rect : null; },
    apresLot: () => { gf.reorganiser(); }
  });
  /* tiroir global : toutes les fenêtres du terminal, par dossier, même celles qui ne sont pas posées */
  gf.enregistrerTiroir({ vue: 'Mars · terminal', entrees: () => DOSSIERS.flatMap(d => d.ids.map(id => ({ id: 'p-' + id, titre: infos[id].titre, dossier: d.titre, apercu: infos[id].apercu, icone: infos[id].icone, posee: !!gf.obtenir('p-' + id), afficher: () => ouvrirPanneau(id, { donner: true }) }))) });
  const ouvrirGraphique = (ins, unite = 'H1') => { const id = INS_DE_FENETRE[ins]; if (id) return ouvrirPanneau(id, { donner: true }); ouvrirFenetreLibre(ins, unite); };
  function ouvrirFenetreLibre(ins, unite) {
    const wid = 'p-libre-' + ins; if (gf.obtenir(wid)) { gf.focus(wid); return; }
    const c = fenetreGraphique(client, ins, unite, { tactile, ouvrirEspace }); const w = gf.ouvrir({ id: wid, titre: INSTRUMENTS[ins].nom, genre: 'graphique', contenu: c.racine, pastille: 'reel', sur: { fermer: () => c.detruire(), redim: () => c.redim() } }); w.corps.classList.add('gf-sans-marge');
  }
  function ouvrirPanneau(id, { donner = false } = {}) {
    const def = panneau(id); if (!def) return false; const wid = 'p-' + id;
    if (gf.obtenir(wid)) { gf.focus(wid); gf.reduire(wid, false); return true; }
    let c;
    if (GRAPHIQUES[id]) c = fenetreGraphique(client, GRAPHIQUES[id].instrument, GRAPHIQUES[id].unite, { tactile, ouvrirEspace });
    else if (def.registre || REGISTRE_DE[id]) c = fenetreRegistre(client, def.registre || REGISTRE_DE[id], { ouvrirGraphique });
    else c = fenetreReel(id, def, { ouvrirPoste });
    instances.set(id, c);
    const ecran = { l: window.innerWidth, h: window.innerHeight }, grand = donner ? calc.tailleParDefaut('grand', ecran) : undefined;
    const w = gf.ouvrir({
      id: wid, titre: def.titre, sousTitre: (GROUPES.find(g => g.id === groupeDe(id)) || {}).titre || '', genre: GRAPHIQUES[id] ? 'graphique' : 'panneau', contenu: c.racine, taille: grand, rangeable: true, dossier: (GROUPES.find(g => g.id === groupeDe(id)) || {}).titre || '',
      pastille: def.reel ? 'reel' : 'bientot', sur: { fermer: () => { if (c.detruire) c.detruire(); instances.delete(id); if (!fermeture) { etat = { ...etat, ouverts: etat.ouverts.filter(x => x !== id) }; sauver(); dessinerSelecteur(); } }, redim: () => c.redim && c.redim() }
    });
    if (c.sansMarge) w.corps.classList.add('gf-sans-marge');
    if (!etat.ouverts.includes(id)) { etat = ajouter(etat, id); sauver(); } dessinerSelecteur();
    return true;
  }
  function retirerPanneau(id) { const wid = 'p-' + id; if (gf.obtenir(wid)) gf.fermer(wid); else { etat = { ...etat, ouverts: etat.ouverts.filter(x => x !== id) }; sauver(); dessinerSelecteur(); } }

  /* fenêtre « Dossiers » : le mur de classeurs, les préréglages et « Réinitialiser » */
  const sel = h('div', 'tm-sel');
  const mur = h('div'), presets = h('div', 'tm-presets');
  presets.innerHTML = '<span>Préréglages</span>' + PRESETS.map(s => '<button type="button" class="tm-btn" data-p="' + s.id + '">' + esc(s.titre) + '</button>').join('') + '<button type="button" class="tm-btn tm-reinit">Réinitialiser</button>';
  sel.append(mur, presets); D.rendreMur(mur);
  function dessinerSelecteur() { D.majMur(); }
  sel.addEventListener('click', e => {
    const pr = e.target.closest('.tm-presets [data-p]'); if (pr) { appliquerSelection(appliquerPreset(etat, pr.dataset.p).ouverts, groupeDe((PRESETS.find(s => s.id === pr.dataset.p) || { panneaux: [] }).panneaux[0])); return; }
    if (e.target.closest('.tm-reinit')) { reinitialiserTout(); }
  });
  mur.addEventListener('click', e => { const b = e.target.closest('[data-dos]'); if (b) { etat = { ...etat, groupe: b.dataset.dos }; sauver(); } });
  function appliquerSelection(ids, groupe) {
    for (const id of [...instances.keys()]) if (!ids.includes(id)) retirerPanneau(id);
    etat = { ...etat, groupe: groupe || etat.groupe, ouverts: etat.ouverts.filter(id => ids.includes(id)) }; sauver();
    for (const id of ids) ouvrirPanneau(id);
    gf.reorganiser(); dessinerSelecteur();
  }
  function reinitialiserTout() {
    D.fermer(true); for (const id of [...instances.keys()]) retirerPanneau(id);
    gf.oublier(); etat = reinitialiser(); sauver(); dessinerSelecteur(); ouvrirSelecteur(true);
  }
  function ouvrirSelecteur(reinit = false) {
    const ecran = { l: window.innerWidth, h: window.innerHeight }, t = calc.tailleParDefaut('selecteur', ecran);
    const w = gf.ouvrir({ id: ID_SEL, titre: 'Dossiers du terminal', sousTitre: 'Appuie sur un dossier pour l’ouvrir', genre: 'selecteur', contenu: sel, taille: t, position: reinit || !gf.obtenir(ID_SEL) ? { x: 12, y: calc.HAUT_RESERVE } : undefined, pastille: 'reel' });
    w.corps.classList.add('tm-corps-sel'); dessinerSelecteur();
  }
  dessinerSelecteur();
  const api = {
    ouvrirPanneau, retirerPanneau, ouvrirSelecteur, ouvrirGraphique, reinitialiser: reinitialiserTout, appliquerPreset: id => appliquerSelection(appliquerPreset(etat, id).ouverts), groupe: g => { if (GROUPES.some(x => x.id === g)) { etat = { ...etat, groupe: g }; sauver(); dessinerSelecteur(); } },
    ouvrirDossier: id => D.ouvrir(id), dossiers: D,
    gestionnaire: gf, etat: () => ({ ...etat, fenetres: gf.liste().map(f => f.id) }), instance: id => instances.get(id) || null,
    fermer() { fermeture = true; D.fermer(true); for (const id of [...instances.keys()]) { const c = instances.get(id); try { c.detruire && c.detruire(); } catch (e) { /* déjà détruit */ } } instances.clear(); gf.dispose(); hote.remove(); T = null; surFermeture(); }
  };
  function fermer() { api.fermer(); }
  T = api;
  ouvrirSelecteur();
  for (const id of etat.ouverts) ouvrirPanneau(id);
  ready = true;
  return api;
}

/* Ouvre le terminal (une seule instance) puis le panneau demandé en grande fenêtre. */
export async function ouvrirTerminal(opts = {}) {
  const { panneau: id = null } = opts;
  if (!T) { if (!ouverture) ouverture = creer(opts).finally(() => { ouverture = null; }); await ouverture; }
  else if (ouverture) await ouverture;
  if (id && T) { T.ouvrirPanneau(id, { donner: true }); const g = groupeDe(id); if (g) T.groupe(g); }
  return T;
}
export function fermerTerminal() { if (!T) return false; T.fermer(); return true; }
export const terminal = () => T;
void resume; void basculer; void PANNEAUX_TERMINAL;
