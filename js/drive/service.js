/* ═════════════ DRIVE : le service (registre des fichiers autorisés, ouverture, lecture, modification vérifiée, annulation) ═════════════
   Tout est injecté (api, auth, ui, correcteur, stockage) : les tests branchent une FAUSSE API Drive, la page branche les vraies.
   Principes : (1) Raylé ne dit « lu » ou « modifié » que si l'opération a réussi — et après une écriture, elle RELIT le document pour vérifier ;
   (2) elle ne cite que le texte réel du document ; (3) toute modification passe par un aperçu avant/après que Justin valide, sauf « applique directement ». */
import { ErreurDrive, estErreurDrive } from './api.js?v=2026.10.13.8';
import { adaptateur, typeDe, verifierEcriture, MIMES_ACCEPTES } from './formats.js?v=2026.10.13.8';
import { trouverFichier } from './texte.js?v=2026.10.13.8';
import { passage, texteLecture, resumer as resumerModele, chercher as chercherModele, trouverTitre, titreDe, appliquerOps, changementMinimal, estTitre, estVide, plan } from './modele.js?v=2026.10.13.8';
import { distance, norm } from './texte.js?v=2026.10.13.8';
import { plier } from './commandes.js?v=2026.10.13.8';

const CLE_FICHIERS = 'rayle_drive_fichiers', CLE_HISTO = 'rayle_drive_historique';
const MAX_FICHIERS = 200, MAX_HISTO = 8;
const OBJET = /￼/g;
export const parlable = t => String(t || '').replace(OBJET, '').replace(/\s+/g, ' ').trim();
const court = (t, n = 140) => { const s = parlable(t); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const ordinal = n => n === 1 ? '1er' : n + 'e';

export function creerService(dep) {
  const { api, auth, ui, env = {}, correcteur } = dep;
  const stock = dep.stockage || { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  const lireJson = (k, defaut) => { try { const v = JSON.parse(stock.get(k) || 'null'); return v == null ? defaut : v; } catch (e) { return defaut; } };
  const maintenant = dep.maintenant || (() => Date.now());

  let courant = null;          // { fichier, meta, adaptateur, paragraphes, avertissements, lectureSeule, etat, modifiedTime, lu:{indices,dernier,intitule}, surlignage:[] }
  let attente = null;          // aperçu en attente de validation : { ops, apercu[], source }
  let proposition = null;      // 'selecteur' : on a proposé d'ouvrir le sélecteur Google
  let choix = null;            // noms entre lesquels Raylé hésite (« le premier »)
  let reprise = null;          // commande à relancer après une (re)connexion
  const abonnes = new Set();
  const changement = () => { abonnes.forEach(f => { try { f(); } catch (e) { /* ignore */ } }); };

  /* ───── fichiers autorisés ───── */
  const fichiers = () => lireJson(CLE_FICHIERS, []);
  const ecrireFichiers = l => stock.set(CLE_FICHIERS, JSON.stringify(l.slice(0, MAX_FICHIERS)));
  function memoriser(nouveaux) {
    const liste = fichiers(); let ajoutes = 0;
    for (const f of nouveaux) {
      if (!f || !f.id) continue;
      const k = liste.findIndex(x => x.id === f.id);
      const entree = { id: f.id, name: f.name || 'Sans titre', mimeType: f.mimeType || '', ajoute: maintenant() };
      if (k >= 0) liste[k] = { ...liste[k], name: entree.name, mimeType: entree.mimeType || liste[k].mimeType }; else { liste.unshift(entree); ajoutes++; }
    }
    ecrireFichiers(liste); changement(); return ajoutes;
  }
  function oublier(id) { ecrireFichiers(fichiers().filter(f => f.id !== id)); changement(); }

  /* ───── historique d'annulation (texte seulement, par document) ───── */
  const histoDe = id => (lireJson(CLE_HISTO, {})[id] || []);
  function empiler(id, entree) {
    const tout = lireJson(CLE_HISTO, {}); tout[id] = [...(tout[id] || []), entree].slice(-MAX_HISTO);
    const ids = Object.keys(tout); if (ids.length > 15) delete tout[ids[0]];
    stock.set(CLE_HISTO, JSON.stringify(tout));
  }
  function depiler(id) {
    const tout = lireJson(CLE_HISTO, {}), l = tout[id] || []; const e = l.pop(); tout[id] = l; stock.set(CLE_HISTO, JSON.stringify(tout)); return e || null;
  }

  /* ───── erreurs : toujours dites telles quelles ───── */
  function echec(e, action) {
    if (estErreurDrive(e) && (e.raison === 'reconnexion' || e.raison === 'popup' || e.statut === 401)) {
      try { ui.demanderConnexion && ui.demanderConnexion(); } catch (x) { /* ignore */ }
      return { ok: false, dit: (e.raison === 'popup' ? e.message : 'Je dois d’abord me reconnecter à Google : touche « Se connecter à Google » dans la fenêtre Drive.') + ' Ensuite je reprends ta demande.', reconnexion: true };
    }
    if (e && e.raison === 'config') return { ok: false, dit: e.message };
    if (e && e.conflit) return { ok: false, conflit: true, dit: 'Je n’ai rien modifié : ' + e.message + ' Recharge le document puis redemande-moi.' };
    return { ok: false, dit: 'Je n’ai pas pu ' + action + ' : ' + (e && e.message ? e.message : e) };
  }
  const garde = async (action, f) => { try { return await f(); } catch (e) { return echec(e, action); } };

  /* ───── ouverture ───── */
  async function charger(fichier) {
    const meta = await api.meta(fichier.id);
    const ad = adaptateur(meta.mimeType);
    if (!ad) return { ok: false, dit: 'Je ne sais pas lire ce type de fichier (' + (meta.mimeType || 'inconnu') + '). Je lis Google Docs, PDF, Word, texte, Sheets et Slides.' };
    const lu = await ad.lire(api, meta, env);
    const peutEcrire = ad.editable && !lu.lectureSeule && !(meta.capabilities && meta.capabilities.canEdit === false);
    courant = { fichier, meta, ad, paragraphes: lu.paragraphes, avertissements: lu.avertissements.slice(), lectureSeule: !peutEcrire, etat: lu.etat || {}, modifiedTime: meta.modifiedTime, lu: { indices: [], dernier: -1, intitule: '' }, surlignage: [] };
    if (ad.editable && !lu.lectureSeule && meta.capabilities && meta.capabilities.canEdit === false) courant.avertissements.push('Tu n’as que le droit de lecture sur ce fichier.');
    if (meta.name && meta.name !== fichier.name) memoriser([{ id: fichier.id, name: meta.name, mimeType: meta.mimeType }]);
    attente = null;
    try { ui.afficher(etatPublic(), courant); } catch (e) { /* l'interface n'est pas indispensable à la lecture */ }
    changement();
    const n = courant.paragraphes.filter(p => !estVide(p)).length;
    if (!n) return { ok: true, dit: 'J’ai ouvert « ' + meta.name + ' » (' + typeDe(meta.mimeType) + ') mais je n’y trouve aucun texte' + (courant.avertissements.length ? '. ' + courant.avertissements[0] : '.') };
    const titres = plan(courant).length, texte = n - titres;
    let dit = 'J’ai ouvert « ' + meta.name + ' » (' + typeDe(meta.mimeType) + ') : ' + texte + ' paragraphe' + (texte > 1 ? 's' : '') + ' de texte' + (titres ? ' et ' + titres + ' titre' + (titres > 1 ? 's' : '') : '') + '.';
    if (courant.lectureSeule) dit += ' Lecture seule.';
    if (courant.avertissements.length) dit += ' ' + courant.avertissements[0];
    return { ok: true, dit };
  }

  async function ouvrir(nom) {
    return garde('ouvrir ce document', async () => {
      const r = trouverFichier(fichiers(), nom);
      if (!r.ok) {
        if (r.raison === 'ambigu') {
          choix = r.candidats.map(f => f.name);
          return { ok: false, dit: 'J’hésite entre ' + r.candidats.map((f, k) => '« ' + f.name + ' »').join(' et ') + '. Lequel veux-tu ? Dis « le premier », « le deuxième » ou son nom.', ambigu: true };
        }
        proposition = 'selecteur';
        const liste = fichiers();
        return { ok: false, introuvable: true, dit: 'Je ne trouve pas « ' + nom + ' » parmi les documents que tu m’as autorisés' + (liste.length ? ' (' + liste.slice(0, 5).map(f => '« ' + f.name + ' »').join(', ') + (liste.length > 5 ? '…' : '') + ')' : ' (aucun pour l’instant)') + '. Veux-tu que j’ouvre le sélecteur Google pour que tu choisisses ce document ?' };
      }
      choix = null; proposition = null;
      return charger(r.fichier);
    }).then(res => res);
  }
  async function ouvrirChoix(position) {
    if (!choix) return { ok: false, dit: 'Je n’ai pas de choix en attente.' };
    const nom = choix[Math.max(0, Math.min(choix.length - 1, position))]; choix = null;
    const f = fichiers().find(x => x.name === nom);
    return f ? garde('ouvrir ce document', () => charger(f)) : { ok: false, dit: 'Je ne retrouve plus ce document.' };
  }

  function exiger(nomDoc) {
    // renvoie une promesse de résultat d'erreur ou null si un document est prêt
    if (nomDoc) return ouvrir(nomDoc).then(r => (r.ok ? null : r));
    if (!courant) return Promise.resolve({ ok: false, dit: 'Aucun document n’est ouvert. Dis par exemple « ouvre le cours d’anatomie », ou « liste mes documents ».' });
    return Promise.resolve(null);
  }

  /* ───── passages ───── */
  // paragraphe affiché en haut de la fenêtre (-1 si inconnu ou périmé : l'écran peut encore montrer l'ancien document)
  function indiceVisible() { try { const v = ui.visible && ui.visible(); return Number.isInteger(v) && courant && v >= 0 && v < courant.paragraphes.length ? v : -1; } catch (e) { return -1; } }
  function cibleCourante() {
    if (courant.surlignage && courant.surlignage.length) return courant.surlignage;
    if (courant.lu.indices.length) return courant.lu.indices;
    const v = indiceVisible(); return v >= 0 ? [v] : [];
  }
  function resoudre(cible) {
    const doc = courant;
    if (!cible) return { ok: true, indices: doc.paragraphes.map((p, i) => i).filter(i => !estVide(doc.paragraphes[i])), intitule: 'le document entier' };
    if (cible.type === 'courant') { const c = cibleCourante(); return c.length ? { ok: true, indices: c, intitule: 'ce passage' } : { ok: false, raison: 'Je ne sais pas de quel passage tu parles : dis-moi le numéro du paragraphe ou le titre.' }; }
    if (cible.type === 'suite') {
      const dernier = courant.lu.dernier >= 0 ? courant.lu.dernier : (indiceVisible() >= 0 ? indiceVisible() - 1 : -1);
      return passage(doc, { type: 'suite', apres: dernier });
    }
    let r = passage(doc, cible);
    if (!r.ok && cible.type === 'titre' && cible.repli === 'motcle') { const r2 = passage(doc, { type: 'motcle', texte: cible.texte }); if (r2.ok) r = r2; }
    return r;
  }

  async function lire(cible, nomDoc) {
    return garde('lire ce document', async () => {
      const e = await exiger(nomDoc); if (e) return e;
      const doc = courant;
      if (!cible || cible.type === 'debut') cible = { type: 'debut' };
      const r = resoudre(cible);
      if (!r.ok) return { ok: false, dit: r.raison };
      const t = texteLecture(doc, r.indices, 1500);
      if (!t.lus.length) return { ok: false, dit: 'Ce passage ne contient pas de texte.' };
      doc.lu = { indices: t.lus, dernier: t.lus[t.lus.length - 1], intitule: r.intitule };
      doc.surlignage = [];
      try { ui.montrer(t.lus); } catch (x) { /* ignore */ }
      changement();
      const t0 = parlable(t.texte);
      let intro = '';
      if (cible.type === 'paragraphe') intro = r.intitule.charAt(0).toUpperCase() + r.intitule.slice(1) + ' : ';
      else if (cible.type === 'titre' && r.intitule) intro = r.intitule.charAt(0).toUpperCase() + r.intitule.slice(1) + ' : ';
      else if (cible.type === 'page') intro = 'Page ' + cible.n + ' : ';
      else if (cible.type === 'motcle') intro = (r.occurrences > 1 ? 'Premier passage sur « ' + cible.texte + ' » (' + r.occurrences + ' en tout) : ' : 'Passage sur « ' + cible.texte + ' » : ');
      let fin = '';
      if (t.reste) fin = ' … Dis « la suite » pour continuer.';
      else if (cible.type === 'suite' || cible.type === 'debut' || cible.type === 'tout') fin = ' C’est la fin' + (cible.type === 'debut' && t.lus.length < 2 ? '' : ' du document') + '.';
      return { ok: true, dit: intro + t0 + fin, lu: t.lus, texteLu: t0 };
    }).then(r => r);
  }

  async function resumer(cible, nomDoc) {
    return garde('résumer ce document', async () => {
      const e = await exiger(nomDoc); if (e) return e;
      const r = cible ? resoudre(cible) : { ok: true, indices: null, intitule: 'le document' };
      if (!r.ok) return { ok: false, dit: r.raison };
      const s = resumerModele(courant, r.indices);
      if (!s.ok) return { ok: false, dit: s.raison };
      try { ui.montrer(r.indices ? r.indices.slice(0, 1) : []); } catch (x) { /* ignore */ }
      return { ok: true, dit: 'Résumé ' + (cible ? 'de ' + r.intitule : 'de « ' + courant.meta.name + ' »') + ', en phrases tirées du document : ' + s.lignes.map(l => parlable(l).replace(/[.!?…]*$/, '.')).join(' ') };
    }).then(r => r);
  }

  async function chercher(texte, nomDoc) {
    return garde('chercher dans ce document', async () => {
      const e = await exiger(nomDoc); if (e) return e;
      const r = chercherModele(courant, texte);
      if (!r.total) return { ok: true, vide: true, dit: 'Je ne trouve pas « ' + texte + ' » dans « ' + courant.meta.name + ' ».' };
      courant.surlignage = r.resultats.map(x => x.i);
      try { ui.montrer(courant.surlignage, { surligner: true }); } catch (x) { /* ignore */ }
      changement();
      const morceaux = r.resultats.slice(0, 3).map((x, k) => (x.page ? 'page ' + x.page : x.section ? 'partie « ' + x.section + ' »' : 'passage ' + (k + 1)) + ' : ' + parlable(x.extrait));
      return { ok: true, dit: '« ' + texte + ' » apparaît dans ' + r.total + ' paragraphe' + (r.total > 1 ? 's' : '') + '. ' + morceaux.join(' ; ') + (r.total > 3 ? ' ; et ' + (r.total - 3) + ' autre' + (r.total - 3 > 1 ? 's' : '') + ', surlignés dans la fenêtre.' : '.'), resultats: r.resultats };
    }).then(r => r);
  }

  /* ───── modification : aperçu → validation → écriture vérifiée ───── */
  const lieu = (doc, i) => {
    const corps = doc.paragraphes.map((p, k) => ({ p, k })).filter(x => !estTitre(x.p) && !estVide(x.p));
    const n = corps.findIndex(x => x.k === i);
    return n >= 0 ? 'le ' + ordinal(n + 1) + ' paragraphe' : estTitre(doc.paragraphes[i] || {}) ? 'le titre « ' + court(doc.paragraphes[i].texte, 50) + ' »' : 'le paragraphe ' + (i + 1);
  };
  function apercuOps(doc, ops) {
    return ops.map(op => {
      if (op.t === 'remplacer') {
        const c = changementMinimal(op.avant, op.apres), marge = 45;
        const deb = Math.max(0, c.debut - marge), finAv = Math.min(op.avant.length, c.debut + c.supprime + marge), finAp = Math.min(op.apres.length, c.debut + c.insere.length + marge);
        return { type: 'remplacer', i: op.i, lieu: lieu(doc, op.i), avant: (deb > 0 ? '… ' : '') + parlable(op.avant.slice(deb, finAv)) + (finAv < op.avant.length ? ' …' : ''), apres: (deb > 0 ? '… ' : '') + parlable(op.apres.slice(deb, finAp)) + (finAp < op.apres.length ? ' …' : ''), retire: parlable(op.avant.slice(c.debut, c.debut + c.supprime)), ajoute: parlable(c.insere) };
      }
      if (op.t === 'supprimer') return { type: 'supprimer', i: op.i, lieu: lieu(doc, op.i), avant: court(op.avant, 200), apres: '', retire: court(op.avant, 200), ajoute: '' };
      return { type: 'inserer', i: op.apres, lieu: op.apres >= 0 ? 'après ' + lieu(doc, op.apres) : 'au début du document', avant: '', apres: court(op.texte, 240), retire: '', ajoute: court(op.texte, 240) };
    });
  }
  function direPreview(ap) {
    const d = ap.slice(0, 3).map(a => {
      if (a.type === 'remplacer') return 'Dans ' + a.lieu + ', ' + (a.retire && a.ajoute ? 'je remplace « ' + a.retire + ' » par « ' + a.ajoute + ' »' : a.ajoute ? 'j’ajoute « ' + a.ajoute + ' »' : 'je retire « ' + a.retire + ' »');
      if (a.type === 'supprimer') return 'Je supprime ' + a.lieu + ' : « ' + court(a.avant, 120) + ' »';
      return 'J’ajoute ' + a.lieu + ' : « ' + court(a.apres, 160) + ' »';
    });
    return (ap.length > 3 ? ap.length + ' changements, dont : ' : '') + d.join(' ; ') + '.';
  }

  const editable = i => courant.paragraphes[i] && courant.paragraphes[i].editable !== false;

  async function demanderCorrection(texte, consigne) {
    if (!correcteur) throw new Error('la correction par l’IA n’est pas disponible');
    const brut = await correcteur(texte, consigne);
    if (typeof brut !== 'string' || !brut.trim()) throw new Error('l’IA n’a rien répondu');
    const sortie = brut.trim();
    if (consigne === 'corriger') {
      // garde-fou : une correction d'orthographe ne réécrit pas le texte
      const d = distance(texte, sortie, Math.ceil(texte.length * 0.12) + 4);
      if (d > texte.length * 0.12 + 3) throw new Error('la correction proposée change trop le texte (' + d + ' caractères), je ne l’applique pas');
    } else if (sortie.length > texte.length * 3 + 200 || sortie.length < texte.length * 0.2) throw new Error('la réécriture proposée est incohérente avec le texte d’origine');
    return sortie;
  }

  /** prépare (et éventuellement applique) une modification décidée par la voix */
  async function modifier(cmd) {
    return garde('modifier ce document', async () => {
      const e = await exiger(cmd.doc); if (e) return e;
      const doc = courant;
      if (doc.lectureSeule) return { ok: false, dit: '« ' + doc.meta.name + ' » est en lecture seule (' + typeDe(doc.meta.mimeType) + ') : je peux le lire mais pas le modifier.' };
      const a = cmd.action, ops = [];
      const cibles = (c) => {
        const r = resoudre(c || { type: 'courant' }); if (!r.ok) return r;
        const ind = r.indices.filter(i => !estVide(doc.paragraphes[i]));
        const mod = ind.filter(editable);
        if (!mod.length) return { ok: false, raison: 'Ce passage est dans un tableau, ou contient des éléments que je ne modifie pas.' };
        return { ok: true, indices: mod, intitule: r.intitule, ignores: ind.length - mod.length };
      };
      if (a.k === 'corriger' || a.k === 'reecrire') {
        if (!cmd.cible) return { ok: false, dit: 'Dans quel paragraphe ? Dis par exemple « corrige la faute dans le 2e paragraphe ».' };
        const r = cibles(cmd.cible); if (!r.ok) return { ok: false, dit: r.raison };
        if (r.indices.length > 6) return { ok: false, dit: 'Ce passage fait ' + r.indices.length + ' paragraphes : choisis un paragraphe précis (6 au plus à la fois).' };
        const consigne = a.k === 'corriger' ? 'corriger' : (a.consigne || 'reformuler');
        for (const i of r.indices) {
          const avant = doc.paragraphes[i].texte;
          if ((avant.match(OBJET) || []).length) continue;
          let apres; try { apres = await demanderCorrection(avant, consigne); } catch (x) { return { ok: false, dit: 'Je n’ai pas pu ' + (a.k === 'corriger' ? 'corriger' : 'réécrire') + ' ce passage : ' + x.message + '.' }; }
          if (apres !== avant) ops.push({ t: 'remplacer', i, avant, apres });
        }
        if (!ops.length) return { ok: true, vide: true, dit: a.k === 'corriger' ? 'Je ne vois aucune faute à corriger dans ' + r.intitule + ' (vérification faite par l’IA : elle peut en manquer, relis-le si besoin).' : 'Je n’ai rien à changer dans ' + r.intitule + '.' };
      } else if (a.k === 'remplacer') {
        const r = cibles(cmd.cible && cmd.cible.type !== 'tout' ? cmd.cible : { type: 'tout' }); if (!r.ok) return { ok: false, dit: r.raison };
        let total = 0; const cherche = plier(a.de);
        for (const i of r.indices) {
          const avant = doc.paragraphes[i].texte; if ((avant.match(OBJET) || []).length) continue;
          let apres = '', pos = 0, n = 0; const f = plier(avant);
          while (true) { const k = cherche ? f.indexOf(cherche, pos) : -1; if (k < 0) break; apres += avant.slice(pos, k) + a.vers; pos = k + cherche.length; n++; }
          if (n) { apres += avant.slice(pos); ops.push({ t: 'remplacer', i, avant, apres }); total += n; }
        }
        if (!ops.length) return { ok: false, dit: 'Je ne trouve pas « ' + a.de + ' » ' + (cmd.cible && cmd.cible.type !== 'tout' ? 'dans ' + r.intitule : 'dans le document') + '.' };
        if (total > 20) return { ok: false, dit: '« ' + a.de + ' » apparaît ' + total + ' fois : c’est trop pour un remplacement automatique, précise un paragraphe.' };
      } else if (a.k === 'supprimer') {
        const r = cibles(cmd.cible); if (!r.ok) return { ok: false, dit: r.raison };
        if (r.indices.length > 1) return { ok: false, dit: 'Je ne supprime qu’un paragraphe à la fois. Dis « supprime le 3e paragraphe ».' };
        ops.push({ t: 'supprimer', i: r.indices[0], avant: doc.paragraphes[r.indices[0]].texte });
      } else if (a.k === 'ajouter') {
        if (!a.texte) return { ok: false, dit: 'Quel texte dois-je ajouter ? Dis par exemple « ajoute : Voici la conclusion, sous le titre Conclusion ».' };
        let apres = -2;
        const pos = a.position || { k: 'fin' };
        if (pos.k === 'debut') apres = -1;
        else if (pos.k === 'fin') { const ind = doc.paragraphes.map((p, i) => i).filter(i => !estVide(doc.paragraphes[i]) && !doc.paragraphes[i].tableau); apres = ind.length ? ind[ind.length - 1] : -1; }
        else if (pos.k === 'sous-titre') {
          const t = trouverTitre(doc, pos.titre);
          if (!t.ok) return { ok: false, dit: 'Je ne trouve pas de titre « ' + pos.titre + ' »' + (t.proches.length ? '. Les titres que je vois : ' + t.proches.join(' ; ') : ' : ce document n’a pas de titres') + '.' };
          apres = t.i;
        } else if (pos.k === 'apres-paragraphe') { const r = passage(doc, { type: 'paragraphe', n: pos.n }); if (!r.ok) return { ok: false, dit: r.raison }; apres = r.indices[0]; }
        else if (pos.k === 'apres-courant') { const c = cibleCourante(); if (!c.length) return { ok: false, dit: 'Après quel passage ? Dis le numéro du paragraphe ou le titre.' }; apres = c[c.length - 1]; }
        if (apres >= 0 && doc.paragraphes[apres].tableau) return { ok: false, dit: 'Je n’ajoute pas de texte dans un tableau.' };
        ops.push({ t: 'inserer', apres, texte: a.texte, style: 'normal' });
      } else return { ok: false, dit: 'Je n’ai pas compris quelle modification faire.' };

      const ap = apercuOps(doc, ops);
      if (cmd.direct) return appliquer(ops, 'voix', ap);
      attente = { ops, apercu: ap, source: 'voix' }; proposition = null;
      try { ui.apercu(ap); } catch (x) { /* ignore */ }
      changement();
      return { ok: true, apercu: ap, enAttente: true, dit: direPreview(ap) + ' Dis « valide » pour l’appliquer, ou « annule ».' };
    }).then(r => r);
  }

  async function appliquer(ops, source, ap) {
    return garde('modifier ce document', async () => {
      if (!courant) return { ok: false, dit: 'Aucun document n’est ouvert.' };
      if (courant.lectureSeule) return { ok: false, dit: 'Ce document est en lecture seule.' };
      const doc = courant, avant = doc.paragraphes.map(p => ({ ...p }));
      ap = ap || apercuOps(doc, ops);
      const { inverse } = appliquerOps(avant, ops);
      let relu;
      try { relu = await doc.ad.ecrire(api, doc.meta, ops, env, doc.etat); }
      catch (e) { if (estErreurDrive(e) || e.conflit) throw e; throw new ErreurDrive('l’écriture a échoué (' + (e && e.message || e) + ')'); }
      const stricte = verifierEcriture(avant, ops, relu.paragraphes);
      const souple = ops.every(op => op.t === 'supprimer' ? true : relu.paragraphes.some(p => p.texte === (op.t === 'remplacer' ? op.apres : op.texte)));
      doc.paragraphes = relu.paragraphes; doc.etat = relu.etat || doc.etat;
      try { const m = await api.meta(doc.fichier.id); doc.modifiedTime = m.modifiedTime; doc.meta = m; } catch (e) { /* non bloquant */ }
      if (stricte || souple) empiler(doc.fichier.id, { ts: maintenant(), inverse, resume: ap.map(a => a.lieu).slice(0, 3).join(' ; ') });
      attente = null; doc.lu = { indices: [], dernier: -1, intitule: '' };
      try { ui.rafraichir(etatPublic(), doc, ops); } catch (e) { /* ignore */ }
      changement();
      if (!stricte && !souple) return { ok: false, dit: 'J’ai envoyé la modification mais, en relisant le document, je ne retrouve pas le changement : je ne peux pas affirmer qu’il est fait. Vérifie dans le Drive.', nonVerifie: true };
      const resume = ap.length === 1 ? (ap[0].type === 'inserer' ? 'texte ajouté ' + ap[0].lieu : ap[0].type === 'supprimer' ? 'paragraphe supprimé' : 'modifié dans ' + ap[0].lieu) : ap.length + ' changements';
      return { ok: true, applique: true, verifie: stricte, dit: 'C’est fait et vérifié en relisant le document : ' + resume + '.' + (stricte ? '' : ' (Le reste du document a aussi bougé entre-temps.)') + ' Dis « annule la dernière modification » pour revenir en arrière.' };
    }).then(r => r);
  }

  async function valider() {
    if (attente) { const a = attente; return appliquer(a.ops, a.source, a.apercu); }
    if (proposition === 'selecteur') return { ok: true, ouvrirSelecteur: true };
    return { ok: false, dit: 'Il n’y a rien à valider.' };
  }
  function refuser() {
    if (attente) { attente = null; try { ui.apercu(null); } catch (e) { /* ignore */ } changement(); return { ok: true, dit: 'D’accord, je n’ai rien modifié.' }; }
    if (proposition) { proposition = null; return { ok: true, dit: 'D’accord.' }; }
    return { ok: false, dit: 'Il n’y a rien à annuler.' };
  }

  async function annuler() {
    return garde('annuler la modification', async () => {
      if (!courant) return { ok: false, dit: 'Aucun document n’est ouvert.' };
      const doc = courant, e = histoDe(doc.fichier.id).slice(-1)[0];
      if (!e) return { ok: false, dit: 'Je n’ai aucune modification à annuler sur « ' + doc.meta.name + ' » (je ne garde que celles faites depuis Raylé).' };
      // relecture fraîche : on ne défait que si le document est encore tel qu'on l'a laissé
      const lu = await doc.ad.lire(api, doc.meta, env);
      doc.paragraphes = lu.paragraphes; doc.etat = lu.etat || doc.etat;
      const r = await (async () => { try { return await appliquer(e.inverse, 'annulation'); } catch (x) { return echec(x, 'annuler'); } })();
      if (r.ok) { depiler(doc.fichier.id); depiler(doc.fichier.id); return { ok: true, annule: true, dit: 'J’ai annulé la dernière modification (' + (e.resume || 'retour à la version précédente') + '), et je l’ai vérifié en relisant le document.' }; }
      if (r.conflit || /a changé/.test(r.dit || '')) return { ok: false, conflit: true, dit: 'Je ne peux pas annuler proprement : le document a changé depuis ma modification. Ouvre l’historique des versions dans Google Docs ou Word pour revenir en arrière.' };
      return r;
    }).then(r => r);
  }

  /** enregistrement depuis la fenêtre en mode édition : `ops` calculées par diffOps */
  async function enregistrer(ops) {
    if (!courant) return { ok: false, dit: 'Aucun document n’est ouvert.' };
    if (!ops || !ops.length) return { ok: true, dit: 'Il n’y a aucune modification à enregistrer.', rien: true };
    // le fichier a-t-il changé sur le Drive depuis l'ouverture ?
    let ailleurs = false;
    try { const m = await api.meta(courant.fichier.id); ailleurs = !!(courant.modifiedTime && m.modifiedTime && m.modifiedTime !== courant.modifiedTime); } catch (e) { /* l'écriture dira l'erreur */ }
    return { ok: true, ailleurs, ops, apercu: apercuOps(courant, ops) };
  }
  const appliquerEdition = ops => appliquer(ops, 'edition');

  /* ───── état exposé (Raylé « voit » ce qui est ouvert) ───── */
  function etatPublic() {
    const e = { ouvert: !!courant, fichiers: fichiers().length, enAttente: !!attente, proposition };
    if (courant) {
      const v = indiceVisible(), P = courant.paragraphes;
      Object.assign(e, { id: courant.fichier.id, nom: courant.meta.name, type: typeDe(courant.meta.mimeType), lectureSeule: courant.lectureSeule, nbParagraphes: P.filter(p => !estVide(p)).length,
        passage: courant.lu.indices.length ? { debut: courant.lu.indices[0], fin: courant.lu.indices[courant.lu.indices.length - 1], intitule: courant.lu.intitule } : null,
        visible: v, titreVisible: v >= 0 ? titreDe(courant, v) : '', extrait: v >= 0 && P[v] ? court(P[v].texte, 160) : '', annulable: histoDe(courant.fichier.id).length > 0,
        surlignage: courant.surlignage.length });
    }
    return e;
  }

  return {
    fichiers, memoriser, oublier, ouvrir, ouvrirChoix, lire, resumer, chercher, modifier, valider, refuser, annuler, enregistrer, appliquerEdition, etat: etatPublic,
    courant: () => courant, fermer() { courant = null; attente = null; changement(); },
    surChangement(f) { abonnes.add(f); return () => abonnes.delete(f); },
    choix: () => (choix ? choix.slice() : null), proposition: () => proposition, definirProposition(p) { proposition = p; },
    choisirPassage(i) { if (courant && courant.paragraphes[i]) { courant.lu = { indices: [i], dernier: i, intitule: 'ce passage' }; courant.surlignage = []; changement(); } },
    surlignerCourant() { if (!courant) return { ok: false, dit: 'Aucun document n’est ouvert.' }; const c = cibleCourante(); if (!c.length) return { ok: false, dit: 'Je n’ai pas de passage à surligner : lis-en un d’abord, ou dis-moi lequel.' }; courant.surlignage = c.slice(); try { ui.montrer(c, { surligner: true }); } catch (e) { /* ignore */ } changement(); return { ok: true, dit: 'C’est surligné dans la fenêtre (affichage seulement, le document n’est pas modifié).' }; },
    effacerSurlignage() { if (courant) { courant.surlignage = []; try { ui.montrer([], { surligner: true }); } catch (e) { /* ignore */ } changement(); } return { ok: true, dit: 'Surlignage retiré.' }; },
    memoriserReprise(f) { reprise = f; }, reprendre() { const f = reprise; reprise = null; return f ? f() : null; },
    MIMES_ACCEPTES, apercuOps, direPreview
  };
}
