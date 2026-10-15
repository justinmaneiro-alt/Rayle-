/* ═════════════ DRIVE : point d'entrée du module (chargé à la demande par js/rayle/commandes-drive.js) ═════════════
   analyser(texte) → commande | null · executer(commande) → phrase à dire · etat() · connecter() · choisirDocuments() · statut()
   Le module assemble : connexion Google (auth.js) · API (api.js) · service (service.js) · fenêtre (fenetre.js). */
import { creerAuth, choisirFichiers, chargerScript, lireConfig, MESSAGE_CONFIG } from './auth.js?v=2026.10.15.3';
import { creerApi, estErreurDrive } from './api.js?v=2026.10.15.3';
import { creerService, parlable } from './service.js?v=2026.10.15.3';
import { creerFenetre } from './fenetre.js?v=2026.10.15.3';
import { analyser as analyserPhrase } from './commandes.js?v=2026.10.15.3';
import { URL_JSZIP } from './fmt-docx.js?v=2026.10.15.3';
import { MIMES_ACCEPTES } from './formats.js?v=2026.10.15.3';
import { demanderSuite } from './lot.js?v=2026.10.15.3';

const URL_PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
// empreintes SRI : le navigateur refuse le script s'il a été altéré
const SRI = { jszip: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG', pdf: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e', pdfWorker: 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2' };
const URL_PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const G = globalThis;
const bus = () => G.RayleBus;
const dire = t => { try { if (t) bus().demander('drive:dire', t); } catch (e) { /* ignore */ } };

let auth, api, service, fenetre, envDocs, nomVoulu = null, dernierOk = true;
/** la dernière commande exécutée a-t-elle réussi ? (l'agent remplace sa réponse par l'échec réel : jamais « c'est fait » à tort) */
export const dernierResultat = () => ({ ok: dernierOk });
const fin = res => { dernierOk = !res || res.ok !== false; return res && res.dit; };

/** correction / réécriture par l'IA du Worker de Raylé : le résultat est vérifié par le service avant tout aperçu */
async function correcteur(texte, consigne) {
  const ia = bus() && bus().demander('drive:ia');
  if (typeof ia !== 'function') throw new Error('le cerveau en ligne n’est pas configuré (⚙ Réglages)');
  const tache = consigne === 'corriger'
    ? 'Corrige l’orthographe, la grammaire, les accords et la ponctuation du texte. N’ajoute rien, ne retire rien, ne reformule pas : garde exactement les mêmes mots quand ils sont corrects.'
    : 'Réécris le texte avec cette consigne : « ' + consigne + ' ». N’ajoute aucune information absente du texte d’origine, garde la langue.';
  const reponse = await ia('MISSION DE CORRECTION DE TEXTE (pas de conversation). ' + tache + ' Réponds UNIQUEMENT par le résultat entre <<<RESULTAT et RESULTAT>>>, sans aucun commentaire.\n<<<TEXTE\n' + texte + '\nTEXTE>>>');
  const m = /<<<RESULTAT\s*([\s\S]*?)\s*RESULTAT>>>/.exec(String(reponse || ''));
  if (!m) throw new Error('la réponse de l’IA est inexploitable');
  return m[1];
}

function pret() {
  if (service) return;
  auth = creerAuth();
  api = creerApi({ jeton: f => auth.jeton(f) });
  const env = {
    zip: async () => { await chargerScript(URL_JSZIP, SRI.jszip); return G.JSZip; },
    pdf: async () => {
      await chargerScript(URL_PDFJS, SRI.pdf);
      const lib = G.pdfjsLib;
      if (!lib.GlobalWorkerOptions.workerSrc) {                       // un worker d'un autre domaine est refusé : on le sert depuis un blob
        const code = await (await fetch(URL_PDFJS_WORKER, { integrity: SRI.pdfWorker })).text();
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      }
      return lib;
    }
  };
  envDocs = env;
  const ui = {
    afficher: (...a) => fenetre.afficher(...a), montrer: (...a) => fenetre.montrer(...a), apercu: (...a) => fenetre.apercu(...a),
    rafraichir: (...a) => fenetre.rafraichir(...a), visible: () => fenetre.visible(), demanderConnexion: (...a) => fenetre.demanderConnexion(...a)
  };
  service = creerService({ api, auth, ui, env, correcteur });
  fenetre = creerFenetre({ service, auth, choisir: choisirDocuments, dire });
  service.surChangement(publier);
  auth.surChangement(publier);
  auth.surChangement(e => { if (e.connecte && coursEnAttente && coursEtat.phase === 'repos') { coursEnAttente = false; synchroniserCours({ silencieux: true }); } });
  publier();
}

/** état partagé : Raylé « voit » ce qui est ouvert (capacités, contexte de l'IA, réglages) */
function publier() {
  try { bus().fusion('drive', statut()); bus().emit('drive:etat', statut()); } catch (e) { /* ignore */ }
}
export function statut() {
  if (!service) {
    const cfg = lireConfig(G); let n = 0; try { n = JSON.parse(localStorage.getItem('rayle_drive_fichiers') || '[]').length; } catch (e) { /* ignore */ }
    return { configure: cfg.valide, connecte: false, fichiers: n, ouvert: false };
  }
  const a = auth.etat(), s = service.etat(), f = fenetre.etat();
  return { configure: a.configure, connecte: a.connecte, dejaConnecte: a.dejaConnecte, fichiers: s.fichiers, ouvert: s.ouvert && f.ouverte, nom: s.nom, type: s.type, lectureSeule: s.lectureSeule, passage: s.passage, visible: s.visible, titreVisible: s.titreVisible, extrait: s.extrait,
    enAttente: s.enAttente || !!s.proposition, choix: !!service.choix(), annulable: s.annulable, fenetre: f };
}

export function contexte() {
  if (!service) return {};
  const s = service.etat(), f = fenetre.etat(), a = auth.etat();
  return { fichiers: service.fichiers(), ouverte: !!(s.ouvert && f.ouverte), attente: !!(s.enAttente || s.proposition), annulable: !!s.annulable, configure: a.configure, choix: service.choix() };
}

/** lecture seule du registre sans charger le réseau : sert à l'analyseur avant que le service existe */
function contexteLeger() {
  let fichiers = []; try { fichiers = JSON.parse(localStorage.getItem('rayle_drive_fichiers') || '[]'); } catch (e) { /* ignore */ }
  return { fichiers, ouverte: false, attente: false, configure: lireConfig(G).valide };
}
/** Sans identifiant client ni document autorisé, Drive n'intercepte rien d'autre que sa propre configuration (les outils du cerveau en ligne gardent la main). */
export function analyser(texte) {
  const ctx = service ? contexte() : contexteLeger();
  const c = analyserPhrase(texte, ctx);
  if (c && !ctx.configure && !ctx.fichiers.length && !['connecter', 'deconnecter', 'selecteur'].includes(c.op)) return null;
  return c;
}
/** prépare la connexion (charge le service de connexion Google) sans rien demander à l'utilisateur */
export async function precharger() { pret(); if (lireConfig(G).valide) await chargerScript('https://accounts.google.com/gsi/client'); }

/** mode par lots : le sélecteur se rouvre tant que Justin répond « Ajouter d'autres documents » (aucune limite) ; chaque lot est mémorisé tout de suite, sans écraser ni doubler */
export async function choisirDocuments() {
  pret();
  if (!lireConfig(G).valide) return { ok: false, dit: MESSAGE_CONFIG };
  const tous = new Map(); let refus = 0;
  try {
    for (;;) {
      const l = await choisirFichiers({ auth, mimes: MIMES_ACCEPTES });
      if (!l.length) break;
      const bons = l.filter(f => MIMES_ACCEPTES.includes(f.mimeType));
      refus += l.length - bons.length;
      service.memoriser(bons); service.definirProposition(null);
      for (const f of bons) if (!tous.has(f.id)) tous.set(f.id, f);
      fenetre.dessiner && fenetre._racine() && !fenetre._racine().hidden && fenetre.ouvrirListe();
      if (!await demanderSuite({ total: tous.size })) break;
    }
  } catch (e) {
    if (estErreurDrive(e) && (e.raison === 'reconnexion' || e.raison === 'popup')) { fenetre.demanderConnexion(); service.memoriserReprise(async () => choisirDocuments()); return { ok: false, dit: 'Je dois d’abord me connecter à Google : touche « Se connecter à Google » dans la fenêtre Drive, puis je rouvre le sélecteur.', reconnexion: true }; }
    return { ok: false, dit: 'Le sélecteur Google n’a pas pu s’ouvrir : ' + (e && e.message || e) };
  }
  if (!tous.size && !refus) return { ok: true, dit: 'Aucun document choisi.' };
  const bons = [...tous.values()];
  let dit = bons.length ? 'J’ai ajouté ' + (bons.length > 1 ? bons.length + ' documents : ' : 'le document ') + bons.slice(0, 4).map(f => '« ' + f.name + ' »').join(', ') + (bons.length > 4 ? '…' : '') + '.' : 'Aucun des fichiers choisis n’est d’un type que je sais lire.';
  if (refus && bons.length) dit += ' ' + refus + ' fichier' + (refus > 1 ? 's' : '') + ' ignoré' + (refus > 1 ? 's' : '') + ' (type non pris en charge).';
  const voulu = nomVoulu ? bons.find(f => parlable(f.name).toLowerCase().includes(String(nomVoulu).toLowerCase())) : null;
  nomVoulu = null;
  const cible = voulu || (bons.length === 1 ? bons[0] : null);
  if (cible) { const r = await service.ouvrir(cible.name); dit += ' ' + r.dit; }
  return { ok: true, dit };
}

/** bouton « Ouvrir un document » : un seul document, affiché dans la fenêtre de lecture, JAMAIS mémorisé ni indexé (lecture seule, texte copiable) */
export async function ouvrirUnDocument() {
  pret();
  if (!lireConfig(G).valide) return { ok: false, dit: MESSAGE_CONFIG };
  let l;
  try { l = await choisirFichiers({ auth, mimes: MIMES_ACCEPTES, unique: true }); }
  catch (e) {
    if (estErreurDrive(e) && (e.raison === 'reconnexion' || e.raison === 'popup')) { fenetre.demanderConnexion(); service.memoriserReprise(async () => ouvrirUnDocument()); return { ok: false, dit: 'Je dois d’abord me connecter à Google : touche « Se connecter à Google » dans la fenêtre Drive, puis je rouvre le sélecteur.', reconnexion: true }; }
    return { ok: false, dit: 'Le sélecteur Google n’a pas pu s’ouvrir : ' + (e && e.message || e) };
  }
  if (!l.length) return { ok: true, dit: 'Aucun document choisi.' };
  if (!MIMES_ACCEPTES.includes(l[0].mimeType)) return { ok: false, dit: '« ' + l[0].name + ' » est d’un type que je ne sais pas lire.' };
  return service.ouvrirTemporaire(l[0]);
}

export async function connecter() {
  pret();
  if (!lireConfig(G).valide) return { ok: false, dit: MESSAGE_CONFIG };
  if (auth.etat().connecte) return { ok: true, dit: 'Je suis déjà connectée à Google.' };
  try { await auth.jeton(); return { ok: true, dit: 'Connexion à Google rétablie.' }; }
  catch (e) { fenetre.demanderConnexion('Touche le bouton pour te connecter à Google.'); return { ok: false, dit: 'Pour me connecter, Google demande un geste de ta part : touche « Se connecter à Google » dans la fenêtre Drive.', reconnexion: true }; }
}

function decrireEtat() {
  const s = service.etat(), f = fenetre.etat();
  if (!s.ouvert) return 'Aucun document n’est ouvert. J’ai ' + s.fichiers + ' document' + (s.fichiers > 1 ? 's' : '') + ' autorisé' + (s.fichiers > 1 ? 's' : '') + '.';
  const p = [];
  p.push('« ' + s.nom + ' » est ouvert (' + s.type + (s.lectureSeule ? ', lecture seule' : f.edition ? ', en édition' : ', en lecture') + (f.plein ? ', plein écran' : f.reduit ? ', réduit' : '') + ').');
  if (s.passage && s.passage.intitule) p.push('Dernier passage lu : ' + s.passage.intitule + '.');
  else if (s.titreVisible) p.push('Tu es à la partie « ' + s.titreVisible + ' ».');
  if (s.extrait) p.push('Ce qui s’affiche : « ' + s.extrait + ' ».');
  if (s.enAttente) p.push('Un changement attend ta validation.');
  if (f.modifie) p.push('Il y a des modifications non enregistrées.');
  return p.join(' ');
}

/** exécute une commande analysée → phrase à dire */
export async function executer(cmd) {
  pret(); dernierOk = true;
  const sortie = async () => {
    switch (cmd.op) {
      case 'lister': {
        const l = service.fichiers();
        fenetre.ouvrirListe();
        if (!l.length) { service.definirProposition('selecteur'); return 'Je n’ai encore aucun document autorisé. Veux-tu que j’ouvre le sélecteur Google pour que tu en choisisses ?'; }
        return 'Je peux lire ' + l.length + ' document' + (l.length > 1 ? 's' : '') + ' : ' + l.slice(0, 8).map(f => '« ' + f.name + ' »').join(', ') + (l.length > 8 ? ' et ' + (l.length - 8) + ' autres' : '') + '.';
      }
      case 'connecter': return fin(await connecter());
      case 'deconnecter': { await auth.deconnecter(); service.fermer(); try { fenetre.fermer(); } catch (e) { /* ignore */ } return 'Je me suis déconnectée de Google. Les documents que tu as autorisés restent dans ma liste, mais je ne peux plus y accéder sans nouvelle connexion.'; }
      case 'selecteur': return fin(await choisirDocuments());
      case 'etat': return decrireEtat();
      case 'ouvrir': { nomVoulu = cmd.nom; const r = await service.ouvrir(cmd.nom); if (r.reconnexion) service.memoriserReprise(async () => ({ dit: await executer(cmd) })); return fin(r); }
      case 'choix': return fin(await service.ouvrirChoix(cmd.n === -1 ? 99 : cmd.n - 1));
      case 'lire': { const r = await service.lire(cmd.cible, cmd.doc); if (r.reconnexion) service.memoriserReprise(async () => ({ dit: await executer(cmd) })); return fin(r); }
      case 'resumer': { const r = await service.resumer(cmd.cible, cmd.doc); if (r.reconnexion) service.memoriserReprise(async () => ({ dit: await executer(cmd) })); return fin(r); }
      case 'chercher': { const r = await service.chercher(cmd.texte, cmd.doc); if (r.reconnexion) service.memoriserReprise(async () => ({ dit: await executer(cmd) })); return fin(r); }
      case 'modifier': { const r = await service.modifier(cmd); if (r.reconnexion) service.memoriserReprise(async () => ({ dit: await executer(cmd) })); return fin(r); }
      case 'valider': {
        const r = await service.valider();
        if (r.ouvrirSelecteur) return fin(await choisirDocuments());
        return fin(r);
      }
      case 'refuser': return fin(service.refuser());
      case 'annuler': return fin(await service.annuler());
      case 'enregistrer': {
        if (!fenetre.etat().edition) return 'Je n’ai rien à enregistrer : le document n’est pas en mode édition. Les modifications que je propose sont enregistrées quand tu les valides.';
        const r = await fenetre.enregistrer(); return fin(r);
      }
      case 'fenetre': {
        if (!fenetre.etat().ouverte) return 'Aucun document n’est ouvert.';
        const a = cmd.action; let r;
        if (a === 'fermer') r = fenetre.fermer(); else if (a === 'plein') r = await fenetre.plein(); else if (a === 'normal') r = await fenetre.normal();
        else if (a === 'reduire') r = fenetre.reduire(); else if (a === 'restaurer') r = fenetre.restaurer();
        else if (a === 'edition') r = await fenetre.mode('edition'); else if (a === 'lecture') r = await fenetre.mode('lecture');
        else if (a === 'zoom+') r = fenetre.zoom(1); else if (a === 'zoom-') r = fenetre.zoom(-1);
        else if (a === 'surligner') r = service.surlignerCourant(); else if (a === 'effacer-surlignage') r = service.effacerSurlignage();
        else r = { dit: 'Je n’ai pas compris cette action sur la fenêtre.' };
        return fin(r);
      }
      default: return 'Je n’ai pas compris cette demande pour les documents.';
    }
  };
  try { return await sortie(); }
  catch (e) { dernierOk = false; return 'Je n’ai pas pu terminer : ' + (e && e.message || e); }
}

/** boutons de réglages : état affiché et actions */
export function ouvrirFenetre() { pret(); fenetre.ouvrirListe(); }
export function etatFenetre() { return service ? fenetre.etat() : { ouverte: false }; }
export function authEtat() { pret(); return auth.etat(); }
export async function seConnecter() {
  pret();
  try { await auth.connecter(); const r = await service.reprendre(); return { ok: true, dit: r ? r.dit : 'Connecté à Google.' }; }
  catch (e) { return { ok: false, dit: e.message }; }
}
export async function seDeconnecter() { pret(); return executer({ op: 'deconnecter' }).then(dit => ({ ok: true, dit })); }
export function listeFichiers() { pret(); return service.fichiers(); }
export function oublier(id) { pret(); service.oublier(id); }
export async function ouvrirFichier(nom) { pret(); return { dit: await executer({ op: 'ouvrir', nom }) }; }

/* ═════════════ MÉMOIRE DES COURS : analyser, resynchroniser seule, relire, oublier (voir memoire.js) ═════════════ */
const CLE_COURS = 'rayle_cours_actif';                  // repère « une mémoire existe » : évite de charger le module pour rien à l'ouverture
let memoire = null, baseInjectee = null, resumeBilan = null, coursEtat = { phase: 'repos' }, coursEnAttente = false, coursSyncFaite = false;
const coursPublier = e => { coursEtat = { ...coursEtat, ...e }; try { bus().emit('cours:etat', coursEtat); } catch (x) { /* ignore */ } };
async function laMemoire() {
  if (memoire) return memoire;
  pret();
  const { ouvrirBase } = await import('./base-locale.js?v=2026.10.15.3'), mod = await import('./memoire.js?v=2026.10.15.3'), { creerMemoire } = mod; resumeBilan = mod.resumeBilan;
  memoire = creerMemoire({ api, base: baseInjectee || await ouvrirBase(), env: envDocs });
  return memoire;
}
const progression = p => coursPublier({ phase: p.etape, i: p.i, n: p.n, nom: p.nom });
const repere = v => { try { v ? localStorage.setItem(CLE_COURS, '1') : localStorage.removeItem(CLE_COURS); } catch (e) { /* ignore */ } };
/** tests Node seulement : une base en mémoire à la place d'IndexedDB */
export const _injecterBase = b => { baseInjectee = b; memoire = null; };
export const coursActif = () => { try { return localStorage.getItem(CLE_COURS) === '1'; } catch (e) { return false; } };
export const coursStatut = () => ({ ...coursEtat, enAttente: coursEnAttente, actif: coursActif() });

/** exécute une opération de mémoire en publiant l'avancement ; une demande de reconnexion Google est dite clairement */
async function coursOperation(nom, f, { silencieux = false } = {}) {
  pret();
  if (!lireConfig(G).valide) return { ok: false, dit: MESSAGE_CONFIG };
  try {
    const m = await laMemoire();
    coursPublier({ phase: 'exploration', i: 0, n: 0, nom: '', operation: nom, silencieux });
    const r = await f(m);
    coursPublier({ phase: 'repos', dernier: r, operation: nom, silencieux, i: 0, n: 0 });
    return r;
  } catch (e) {
    const co = estErreurDrive(e) && (e.raison === 'reconnexion' || e.raison === 'popup' || e.statut === 401);
    if (co) { coursEnAttente = true; try { fenetre.demanderConnexion(); } catch (x) { /* ignore */ } }
    const dit = co ? 'Je dois d’abord me connecter à Google : touche « Se connecter à Google » dans Réglages' + (silencieux ? ' ; je resynchroniserai tes cours ensuite.' : ', puis recommence.') : 'Mémoire des cours : ' + (e && e.message || e);
    const r = { ok: false, reconnexion: co, dit };
    coursPublier({ phase: 'repos', dernier: r, operation: nom, silencieux, i: 0, n: 0 });
    return r;
  }
}

/** bouton « Analyser et mémoriser tous mes cours » : sélecteur multi-sélection (documents seulement), lecture de chaque lot, puis « en ajouter d'autres ? » (aucune limite).
    Les documents déjà en mémoire ne sont ni écrasés ni doublés : un lot n'ajoute que ses nouveautés (un document inchangé n'est pas relu). */
export async function analyserCours() {
  pret();
  if (!lireConfig(G).valide) return { ok: false, dit: MESSAGE_CONFIG };
  const vus = new Set(), cumul = { nouveaux: 0, modifies: 0, supprimes: 0, inchanges: 0, echecs: [], sansTexte: [], ignores: 0, dossiersVides: [], tronque: false };
  let dernier = null;
  for (;;) {
    let choix;
    try { choix = await choisirFichiers({ auth, mimes: MIMES_ACCEPTES, titre: 'Coche tes cours (les dossiers s’ouvrent, seuls les documents cochés sont ajoutés)' }); }
    catch (e) {
      if (estErreurDrive(e) && (e.raison === 'reconnexion' || e.raison === 'popup')) { coursEnAttente = false; try { fenetre.demanderConnexion(); } catch (x) { /* ignore */ } return dernier ? fusionLots(dernier, cumul) : { ok: false, reconnexion: true, dit: 'Je dois d’abord me connecter à Google : touche « Se connecter à Google », puis recommence.' }; }
      return dernier ? fusionLots(dernier, cumul) : { ok: false, dit: 'Le sélecteur Google n’a pas pu s’ouvrir : ' + (e && e.message || e) };
    }
    if (!choix.length) break;
    const r = await coursOperation('analyse', m => m.analyser(choix, { progression, lot: true }));
    if (!r.ok) return dernier ? fusionLots(dernier, cumul) : r;
    repere(true); coursEnAttente = false;
    for (const c of choix) vus.add(c.id);
    for (const k of ['nouveaux', 'modifies', 'supprimes', 'inchanges']) cumul[k] += r[k] || 0;
    cumul.echecs.push(...(r.echecs || [])); cumul.sansTexte.push(...(r.sansTexte || [])); cumul.ignores += r.ignores || 0; cumul.tronque = cumul.tronque || !!r.tronque;
    dernier = r;
    if (!await demanderSuite({ total: vus.size })) break;
  }
  if (!dernier) return { ok: true, annule: true, dit: 'Aucun cours choisi : rien n’a changé.' };
  return fusionLots(dernier, cumul);
}
/** bilan de tous les lots : les compteurs sont cumulés, les totaux sont ceux de la mémoire après le dernier lot */
function fusionLots(dernier, cumul) {
  const b = { ...dernier, ...cumul };
  return { ...b, dit: resumeBilan ? resumeBilan(b) : dernier.dit };
}
/** resynchronisation : seulement les documents modifiés (appelée seule à l'ouverture, puis dès que la connexion Google est rétablie) */
export async function synchroniserCours({ silencieux = false } = {}) {
  const r = await coursOperation('synchro', m => m.synchroniser({ progression }), { silencieux });
  if (r.ok) coursEnAttente = false;
  return r;
}
export async function relireCours() { const r = await coursOperation('relecture', m => m.relire({ progression })); if (r.ok) coursEnAttente = false; return r; }
export async function oublierCours() {
  pret();
  try { const m = await laMemoire(); const r = await m.oublier(); if (r.ok) { repere(false); coursEnAttente = false; coursPublier({ phase: 'repos', dernier: r, operation: 'oubli', i: 0, n: 0 }); } return r; }
  catch (e) { return { ok: false, dit: 'Mémoire des cours : ' + (e && e.message || e) }; }
}
export async function coursResume() { try { const m = await laMemoire(); return await m.etat(); } catch (e) { return null; } }
/** à l'ouverture de Raylé : si une mémoire existe, resynchronise seule (une fois par ouverture) ; sans connexion possible, attend que Justin se connecte */
export async function synchroAuto() {
  if (coursSyncFaite || !coursActif() || !lireConfig(G).valide) return null;
  coursSyncFaite = true;
  return synchroniserCours({ silencieux: true });
}
