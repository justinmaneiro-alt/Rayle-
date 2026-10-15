/* ═════════════ DRIVE : mémoire des cours (extraction du texte de tous les documents choisis, dossiers compris, dans la base locale) ═════════════
   creerMemoire({ api, base, env, maintenant }) :
     analyser(racines, { progression })  → lit chaque document (les dossiers sont parcourus), garde le texte dans la base locale, mémorise les racines à suivre
     synchroniser({ progression })       → ne relit que ce qui a changé depuis (date de modification Drive), ajoute les nouveaux, retire ceux qui ont disparu
     relire({ progression })             → relit TOUT depuis le Drive (mêmes racines)
     oublier()                           → efface la base locale et la liste des racines (le Drive n'est jamais touché)
     etat()                              → { documents, caracteres, octets, derniere, racines }
   La progression est { etape:'exploration'|'lecture', i, n, nom }. Une erreur de connexion Google interrompt tout (rien de faux n'est enregistré) ;
   une erreur sur UN document est notée dans `echecs` et la suite continue. Raylé n'affirme « mémorisé » que pour ce qui est réellement dans la base. */
import { estErreurDrive } from './api.js?v=2026.10.15.4';
import { adaptateur } from './formats.js?v=2026.10.15.4';

export const MIME_DOSSIER = 'application/vnd.google-apps.folder';
const MAX_DOCUMENTS = 1000, MAX_PROFONDEUR = 12, MAX_CARACTERES = 3_000_000;
const octetsDe = t => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(t).length : t.length);

/** « 1,3 Mo », « 840 Ko » */
export function taille(o) {
  if (o < 1024) return o + ' o';
  if (o < 1024 * 1024) return Math.round(o / 1024) + ' Ko';
  return (o / 1024 / 1024).toFixed(o < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' Mo';
}
const accord = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');

/** phrase de bilan (affichée dans Réglages) */
export function resumeBilan(b) {
  const p = [accord(b.documents, 'document') + ' en mémoire (' + taille(b.octets) + ', ' + b.caracteres.toLocaleString('fr-FR') + ' caractères)'];
  const ch = [];
  if (b.nouveaux) ch.push(b.nouveaux + (b.nouveaux > 1 ? ' nouveaux' : ' nouveau'));
  if (b.modifies) ch.push(b.modifies + ' mis à jour');
  if (b.supprimes) ch.push(accord(b.supprimes, 'retiré'));
  if (ch.length) p.push(ch.join(', '));
  else if (b.inchanges && !b.echecs.length) p.push('rien n’avait changé');
  let s = p.join(' · ') + '.';
  if (b.sansTexte && b.sansTexte.length) s += ' Sans texte exploitable : ' + b.sansTexte.slice(0, 3).map(n => '« ' + n + ' »').join(', ') + (b.sansTexte.length > 3 ? '…' : '') + ' (scan ou image ?).';
  if (b.echecs.length) s += ' ' + accord(b.echecs.length, 'document') + ' non lu' + (b.echecs.length > 1 ? 's' : '') + ' : ' + b.echecs.slice(0, 3).map(e => '« ' + e.nom + ' » (' + e.message + ')').join(', ') + (b.echecs.length > 3 ? '…' : '') + '.';
  if (b.dossiersVides && b.dossiersVides.length) s += ' Dossier' + (b.dossiersVides.length > 1 ? 's' : '') + ' sans document visible pour Raylé : ' + b.dossiersVides.slice(0, 3).map(n => '« ' + n + ' »').join(', ') + '. Avec l’accès « drive.file », Google ne montre pas le contenu d’un dossier : choisis les documents eux-mêmes, ou active l’accès en lecture (voir docs/drive.md, « Mémoire des cours »).';
  if (b.tronque) s += ' Limite de ' + MAX_DOCUMENTS + ' documents atteinte : le reste a été ignoré.';
  if (b.ignores) s += ' ' + accord(b.ignores, 'fichier') + ' d’un type non pris en charge ignoré' + (b.ignores > 1 ? 's' : '') + '.';
  return s;
}

export function creerMemoire({ api, base, env = {}, maintenant = () => Date.now() }) {
  let enCours = false;
  const lireMeta = async (cle, defaut) => { const m = await base.get('meta', cle); return m ? m.valeur : defaut; };
  const ecrireMeta = (cle, valeur) => base.put('meta', { cle, valeur });
  const grave = e => estErreurDrive(e) && (e.raison === 'reconnexion' || e.raison === 'popup' || e.raison === 'config' || e.statut === 401 || e.raison === 'reseau');

  async function etat() {
    const docs = await base.tout('docs');
    return { documents: docs.length, caracteres: docs.reduce((s, d) => s + (d.caracteres || 0), 0), octets: docs.reduce((s, d) => s + (d.octets || 0), 0), derniere: await lireMeta('derniere', 0), racines: await lireMeta('racines', []), enCours };
  }

  /** parcourt les racines (fichiers et dossiers, sous-dossiers compris) → fichiers lisibles, dédoublonnés */
  async function explorer(racines, progression) {
    const vus = new Map(), dossiersVides = [], echecs = [], reussies = new Set(); let ignores = 0, tronque = false, nDossiers = 0;
    const ajouter = (f, racineId) => {
      if (vus.has(f.id)) { vus.get(f.id).racines.add(racineId); return; }
      if (!adaptateur(f.mimeType)) { ignores++; return; }
      if (vus.size >= MAX_DOCUMENTS) { tronque = true; return; }
      vus.set(f.id, { id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime || '', version: String(f.version || ''), racines: new Set([racineId]) });
    };
    for (const r of racines) {
      try {
        if (r.mimeType === MIME_DOSSIER) {
          const file = [{ id: r.id, nom: r.name, prof: 0 }], vusDossiers = new Set([r.id]); let trouves = 0;
          while (file.length) {
            const d = file.shift(); nDossiers++;
            try { progression && progression({ etape: 'exploration', i: nDossiers, n: 0, nom: d.nom }); } catch (e) { /* ignore */ }
            const contenu = await api.liste(d.id);
            for (const f of contenu) {
              if (f.mimeType === MIME_DOSSIER) { if (d.prof < MAX_PROFONDEUR && !vusDossiers.has(f.id)) { vusDossiers.add(f.id); file.push({ id: f.id, nom: f.name, prof: d.prof + 1 }); } }
              else { ajouter(f, r.id); if (adaptateur(f.mimeType)) trouves++; }
            }
          }
          if (!trouves) dossiersVides.push(r.name);
        } else {
          const m = await api.meta(r.id);
          ajouter({ id: r.id, name: m.name || r.name, mimeType: m.mimeType || r.mimeType, modifiedTime: m.modifiedTime, version: m.version }, r.id);
        }
        reussies.add(r.id);
      } catch (e) {
        if (grave(e)) throw e;
        echecs.push({ nom: r.name, message: e && e.message ? e.message : String(e) });
      }
    }
    return { fichiers: [...vus.values()], dossiersVides, echecs, reussies, ignores, tronque };
  }

  async function lireTexte(f) {
    const ad = adaptateur(f.mimeType), meta = { id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime };
    const lu = await ad.lire(api, meta, env);
    const lignes = lu.paragraphes.map(p => String(p.texte || '').replace(/￼/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    let texte = lignes.join('\n'), tronque = false;
    if (texte.length > MAX_CARACTERES) { texte = texte.slice(0, MAX_CARACTERES); tronque = true; }
    return { texte, tronque, paragraphes: lignes.length, avertissements: lu.avertissements || [] };
  }

  async function passe(racines, { progression, force }) {
    const bilan = { nouveaux: 0, modifies: 0, supprimes: 0, inchanges: 0, echecs: [], sansTexte: [], ignores: 0, dossiersVides: [], tronque: false };
    const ex = await explorer(racines, progression);
    Object.assign(bilan, { ignores: ex.ignores, dossiersVides: ex.dossiersVides, tronque: ex.tronque }); bilan.echecs.push(...ex.echecs);
    const existants = new Map((await base.tout('docs')).map(d => [d.id, d]));
    const n = ex.fichiers.length; let i = 0;
    for (const f of ex.fichiers) {
      i++;
      try { progression && progression({ etape: 'lecture', i, n, nom: f.name }); } catch (e) { /* ignore */ }
      const avant = existants.get(f.id), racinesDoc = [...new Set([...(avant ? avant.racines : []), ...f.racines])];
      if (avant && !force && f.modifiedTime && avant.modifiedTime === f.modifiedTime && String(avant.version || '') === f.version && !avant.echec) {
        bilan.inchanges++; if (racinesDoc.length !== (avant.racines || []).length) await base.put('docs', { ...avant, racines: racinesDoc });
        continue;
      }
      try {
        const t = await lireTexte(f);
        await base.put('docs', { id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, version: f.version, racines: racinesDoc, texte: t.texte, paragraphes: t.paragraphes, caracteres: t.texte.length, octets: octetsDe(t.texte), tronque: t.tronque, lu: maintenant() });
        if (avant) bilan.modifies++; else bilan.nouveaux++;
        if (!t.texte) bilan.sansTexte.push(f.name);
      } catch (e) {
        if (grave(e)) throw e;
        bilan.echecs.push({ nom: f.name, message: e && e.message ? e.message : String(e) });
        if (avant) bilan.inchanges++;                       // l'ancienne version reste en base : on ne la perd pas sur une erreur passagère
      }
    }
    // documents qui ne sont plus atteints par une racine explorée avec succès : retirés (le Drive est la référence)
    const presents = new Set(ex.fichiers.map(f => f.id));
    for (const d of existants.values()) {
      const concerne = (d.racines || []).filter(r => ex.reussies.has(r));
      if (!concerne.length || presents.has(d.id)) continue;
      const reste = (d.racines || []).filter(r => !ex.reussies.has(r));
      if (reste.length) await base.put('docs', { ...d, racines: reste }); else { await base.supprimer('docs', d.id); bilan.supprimes++; }
    }
    return bilan;
  }

  async function lancer(racines, opts) {
    if (enCours) return { ok: false, occupe: true, dit: 'Une analyse des cours est déjà en cours.' };
    enCours = true;
    try {
      const bilan = await passe(racines, opts);
      await ecrireMeta('derniere', maintenant());
      const e = await etat();
      const complet = { ok: true, ...bilan, documents: e.documents, caracteres: e.caracteres, octets: e.octets };
      complet.dit = resumeBilan(complet); return complet;
    } finally { enCours = false; }
  }

  return {
    etat,
    /** choix de Justin : fichiers et dossiers → ajoutés aux racines suivies, puis lus */
    async analyser(choix, opts = {}) {
      const racines = await lireMeta('racines', []);
      for (const c of choix) { if (c && c.id && !racines.some(r => r.id === c.id)) racines.push({ id: c.id, name: c.name || 'Sans titre', mimeType: c.mimeType || '' }); }
      if (!racines.length) return { ok: false, dit: 'Aucun document ni dossier choisi.' };
      await ecrireMeta('racines', racines);
      // en mode lot, seul ce lot est exploré et lu (les autres racines gardent leurs textes, intacts ; un document déjà en base et inchangé n'est pas relu ni doublé)
      const cible = opts.lot ? racines.filter(r => choix.some(c => c && c.id === r.id)) : racines;
      return lancer(cible, { progression: opts.progression, force: !!opts.force });
    },
    async synchroniser(opts = {}) {
      const racines = await lireMeta('racines', []);
      if (!racines.length) return { ok: false, vide: true, dit: 'Je n’ai pas encore de cours en mémoire : touche « Analyser et mémoriser tous mes cours ».' };
      return lancer(racines, { progression: opts.progression, force: false });
    },
    async relire(opts = {}) {
      const racines = await lireMeta('racines', []);
      if (!racines.length) return { ok: false, vide: true, dit: 'Je n’ai pas encore de cours en mémoire : touche « Analyser et mémoriser tous mes cours ».' };
      return lancer(racines, { progression: opts.progression, force: true });
    },
    async oublier() {
      if (enCours) return { ok: false, occupe: true, dit: 'Une analyse est en cours : attends sa fin pour oublier les cours.' };
      const avant = await etat();
      await base.vider('docs'); await base.vider('meta');
      return { ok: true, documents: avant.documents, octets: avant.octets, dit: avant.documents ? 'J’ai oublié ' + accord(avant.documents, 'cours') + ' (' + taille(avant.octets) + ' effacés de cet appareil). Ton Drive n’a pas été touché.' : 'Ma mémoire des cours était déjà vide.' };
    },
    /** documents mémorisés (sans leur texte) */
    async liste() { return (await base.tout('docs')).map(d => ({ id: d.id, name: d.name, mimeType: d.mimeType, caracteres: d.caracteres, modifiedTime: d.modifiedTime })); },
    async document(id) { return base.get('docs', id); }
  };
}
