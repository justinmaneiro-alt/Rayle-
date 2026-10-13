/* ═════════════ DRIVE : un adaptateur par type de document ═════════════
   lire(api, meta, env)  → { paragraphes, avertissements, lectureSeule, etat }
   ecrire(api, meta, ops, env, etatLu) → { paragraphes } (le contenu RELU après l'écriture, pour vérification)
   env = { zip(): Promise<JSZip>, pdf(): Promise<pdfjsLib> } (chargés à la demande depuis un CDN ; remplaçables dans les tests). */
import { MIME, estErreurDrive } from './api.js?v=2026.10.13.8';
import { lireGdoc, ecrireGdoc } from './fmt-gdoc.js?v=2026.10.13.8';
import { lireDocx, modifierDocx, lireZipDocx, ecrireZipDocx } from './fmt-docx.js?v=2026.10.13.8';
import { lireTexte, ecrireTexte, paragraphesPdf, paragraphesFeuille, paragraphesDiapos } from './fmt-autres.js?v=2026.10.13.8';
import { appliquerOps } from './modele.js?v=2026.10.13.8';

const MAX_LIGNES_FEUILLE = 400, MAX_FEUILLES = 8;

const gdoc = {
  libelle: 'Google Docs', editable: true,
  async lire(api, meta) {
    try {
      const d = lireGdoc(await api.docsGet(meta.id));
      return { paragraphes: d.paragraphes, avertissements: d.avertissements, lectureSeule: false, etat: { revision: d.revision } };
    } catch (e) {
      if (!estErreurDrive(e) || !/n’est pas activée/.test(e.message)) throw e;
      // API Docs non activée : lecture seule par l'export texte du Drive
      const brut = await api.exporter(meta.id, 'text/plain');
      const P = brut.replace(/\r/g, '').replace(/^﻿/, '').split(/\n+/).map(t => ({ texte: t.trim(), niveau: 0, editable: false })).filter(p => p.texte);
      return { paragraphes: P, avertissements: ['L’API Google Docs n’est pas activée dans ton projet Google Cloud : lecture seule, sans titres (voir docs/drive.md).'], lectureSeule: true, etat: {} };
    }
  },
  async ecrire(api, meta, ops) {
    const r = await ecrireGdoc(api, meta.id, ops);
    return { paragraphes: r.relu.paragraphes, etat: { revision: r.revision } };
  }
};

const docx = {
  libelle: 'Word (.docx)', editable: true,
  async lire(api, meta, env) {
    const Zip = await env.zip(), { xml } = await lireZipDocx(Zip, await api.octets(meta.id));
    const d = lireDocx(xml);
    return { paragraphes: d.paragraphes, avertissements: d.avertissements, lectureSeule: false, etat: {} };
  },
  async ecrire(api, meta, ops, env) {
    const Zip = await env.zip(), { zip, xml } = await lireZipDocx(Zip, await api.octets(meta.id));   // contenu FRAIS du Drive
    const nouveau = modifierDocx(xml, ops);
    const octets = await ecrireZipDocx(zip, nouveau);
    await api.televerser(meta.id, octets, MIME.docx);
    const relu = lireDocx((await lireZipDocx(Zip, await api.octets(meta.id))).xml);
    return { paragraphes: relu.paragraphes, etat: {} };
  }
};

const texte = {
  libelle: 'Texte', editable: true,
  async lire(api, meta) {
    const d = lireTexte(await api.texte(meta.id));
    return { paragraphes: d.paragraphes, avertissements: d.avertissements, lectureSeule: false, etat: {} };
  },
  async ecrire(api, meta, ops) {
    const frais = lireTexte(await api.texte(meta.id));
    const { paragraphes } = appliquerOps(frais.paragraphes, ops);
    const sortie = paragraphes.map((p, k) => ({ ...p, sep: p.sep != null ? p.sep : '\n\n', prefixe: p.prefixe || '' }));
    await api.televerser(meta.id, ecrireTexte(sortie, frais.crlf), meta.mimeType || MIME.txt);
    return { paragraphes: lireTexte(await api.texte(meta.id)).paragraphes, etat: {} };
  }
};

const pdf = {
  libelle: 'PDF', editable: false,
  async lire(api, meta, env) {
    const lib = await env.pdf(), doc = await lib.getDocument({ data: new Uint8Array(await api.octets(meta.id)) }).promise;
    const pages = [];
    for (let k = 1; k <= doc.numPages; k++) pages.push(await (await doc.getPage(k)).getTextContent());
    const d = paragraphesPdf(pages);
    return { paragraphes: d.paragraphes, avertissements: d.avertissements, lectureSeule: true, etat: { pages: doc.numPages } };
  }
};

const gsheet = {
  libelle: 'Google Sheets', editable: false,
  async lire(api, meta) {
    const m = await api.sheetsMeta(meta.id), feuilles = [];
    for (const s of (m.sheets || []).slice(0, MAX_FEUILLES)) {
      const titre = s.properties.title, v = await api.sheetsValeurs(meta.id, "'" + titre.replace(/'/g, "''") + "'!A1:Z" + MAX_LIGNES_FEUILLE);
      const total = s.properties.gridProperties && s.properties.gridProperties.rowCount;
      feuilles.push({ titre, valeurs: v.values || [], tronque: total > MAX_LIGNES_FEUILLE ? MAX_LIGNES_FEUILLE : 0 });
    }
    const d = paragraphesFeuille(feuilles);
    if ((m.sheets || []).length > MAX_FEUILLES) d.avertissements.push('Seules les ' + MAX_FEUILLES + ' premières feuilles sont lues.');
    return { paragraphes: d.paragraphes, avertissements: d.avertissements, lectureSeule: true, etat: {} };
  }
};

const gslides = {
  libelle: 'Google Slides', editable: false,
  async lire(api, meta) {
    const d = paragraphesDiapos(await api.slidesGet(meta.id));
    return { paragraphes: d.paragraphes, avertissements: d.avertissements, lectureSeule: true, etat: {} };
  }
};

const PAR_MIME = { [MIME.gdoc]: gdoc, [MIME.docx]: docx, [MIME.pdf]: pdf, [MIME.gsheet]: gsheet, [MIME.gslides]: gslides, [MIME.txt]: texte, [MIME.md]: texte, [MIME.csv]: texte, 'text/x-markdown': texte };
export const adaptateur = mime => PAR_MIME[mime] || null;
export const MIMES_ACCEPTES = Object.keys(PAR_MIME);
export const typeDe = mime => (PAR_MIME[mime] && PAR_MIME[mime].libelle) || 'Fichier non pris en charge';

/** les textes relus correspondent-ils à ce qu'on voulait écrire ? (compare les paragraphes éditables, dans l'ordre) */
export function verifierEcriture(avant, ops, relus) {
  const attendu = appliquerOps(avant, ops).paragraphes.map(p => p.texte);
  const reel = relus.map(p => p.texte);
  if (attendu.length !== reel.length) return false;
  return attendu.every((t, k) => t === reel[k]);
}
